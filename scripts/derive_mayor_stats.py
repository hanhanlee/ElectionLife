"""從 data/raw/cec 的中選會原始資料，彙總出遊戲可用的縣市長選舉基準數字。

輸出只含彙總統計、不含個人姓名，方便遊戲直接引用（結局頁「史實彩蛋」與模型校準）。

用法：python -I scripts/derive_mayor_stats.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "cec"
OUT = ROOT / "data" / "derived" / "mayor_baseline.json"
GAME_OUT = ROOT / "web" / "src" / "content" / "history.json"
SUBJECTS = {"C1": "直轄市長", "C2": "縣市長"}


def races(path: Path) -> dict[str, list[dict]]:
    """依縣市分組，每組是該縣市的所有候選人"""
    data = json.loads(path.read_text(encoding="utf-8"))
    by_area: dict[str, list[dict]] = {}
    for rows in data.values():
        for r in rows:
            by_area.setdefault(r["area_name"], []).append(r)
    return by_area


def summarize(subject: str, session: int, theme: str, path: Path) -> dict:
    stats = {"races": 0, "candidates": 0, "incumbents_running": 0, "incumbents_won": 0,
             "winner_pcts": [], "margins": []}
    for cands in races(path).values():
        ranked = sorted(cands, key=lambda r: r["ticket_num"], reverse=True)
        stats["races"] += 1
        stats["candidates"] += len(cands)
        for r in cands:
            if r["is_current"] == "Y":
                stats["incumbents_running"] += 1
                stats["incumbents_won"] += r["is_victor"] == "*"
        stats["winner_pcts"].append(ranked[0]["ticket_percent"])
        if len(ranked) > 1:
            stats["margins"].append(round(ranked[0]["ticket_percent"] - ranked[1]["ticket_percent"], 2))

    margins = stats.pop("margins")
    winner_pcts = stats.pop("winner_pcts")
    return {
        "subject": subject,
        "office": SUBJECTS[subject],
        "session": session,
        "theme": theme,
        **stats,
        "avg_winner_pct": round(sum(winner_pcts) / len(winner_pcts), 2),
        "avg_margin_pct": round(sum(margins) / len(margins), 2) if margins else None,
        "close_races_under_5pct": sum(m < 5 for m in margins),
    }


# 遊戲中的虛構政黨顏色，對應現實政黨（只用於彙總史實勝率）
PARTY_GROUPS = {
    "中國國民黨": "blue",
    "民主進步黨": "green",
    "台灣民眾黨": "white",
    "時代力量": "yellow",
    "無黨籍及未經政黨推薦": "independent",
}


def challenger_stats() -> dict:
    """非現任挑戰者依政黨分組的當選率"""
    groups: dict[str, dict] = {}
    for path in RAW.glob("tickets/*/*.json"):
        for rows in json.loads(path.read_text(encoding="utf-8")).values():
            for r in rows:
                if r["is_current"] == "Y":
                    continue
                g = groups.setdefault(PARTY_GROUPS.get(r["party_name"], "minor"), {"candidates": 0, "won": 0})
                g["candidates"] += 1
                g["won"] += r["is_victor"] == "*"
    for g in groups.values():
        g["win_rate"] = round(g["won"] / g["candidates"], 3)
    return dict(sorted(groups.items()))


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    manifest = {m["file"]: m for m in json.loads((RAW / "manifest.json").read_text(encoding="utf-8")) if "file" in m}
    elections = []
    for subject in SUBJECTS:
        themes = {t["theme_id"]: t for area in json.loads((RAW / f"list_{subject}.json").read_text(encoding="utf-8"))
                  for t in area["theme_items"]}
        for path in sorted((RAW / "tickets" / subject).glob("*.json")):
            session, theme_id = path.stem.split("_", 1)
            e = summarize(subject, int(session), themes[theme_id]["theme_name"], path)
            e["vote_date"] = themes[theme_id]["vote_date"]
            rel = path.relative_to(RAW).as_posix()
            e["source_url"] = manifest[rel]["source_url"]
            e["retrieved_at"] = manifest[rel]["retrieved_at"]
            elections.append(e)
    elections.sort(key=lambda e: (e["vote_date"], e["subject"]))

    def total(rows: list[dict]) -> dict:
        running = sum(e["incumbents_running"] for e in rows)
        won = sum(e["incumbents_won"] for e in rows)
        return {"incumbents_running": running, "incumbents_won": won,
                "incumbent_win_rate": round(won / running, 3) if running else None}

    result = {
        "description": "中選會歷屆縣市長選舉彙總（全國層級）。is_current=Y 視為現任尋求連任。",
        "caveats": [
            "「現任」依中選會 is_current 欄位，代理首長與縣市合併升格後的首長可能未被標為現任。",
            "得票率差距為該縣市第一名與第二名之差（百分點）。",
            "描述性統計，不代表任何行為與連任之間的因果關係。",
        ],
        "overall": total(elections),
        "by_office": {SUBJECTS[s]: total([e for e in elections if e["subject"] == s]) for s in SUBJECTS},
        "since_2010": total([e for e in elections if e["vote_date"] >= "2010"]),
        "elections": elections,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    # 遊戲結局頁引用的精簡版
    years = [e["vote_date"][:4] for e in elections]
    game = {
        "period": f"{min(years)}–{max(years)}",
        "overall": result["overall"],
        "direct_municipality": result["by_office"]["直轄市長"],
        "challengers": challenger_stats(),
        "source_title": "中央選舉委員會 選舉資料庫",
        "source_url": "https://db.cec.gov.tw/",
        "retrieved_at": max(e["retrieved_at"] for e in elections)[:10],
    }
    GAME_OUT.write_text(json.dumps(game, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for e in elections:
        print(f"{e['vote_date']} {e['theme']}：{e['races']} 席，現任參選 {e['incumbents_running']}、"
              f"連任 {e['incumbents_won']}，平均差距 {e['avg_margin_pct']} 個百分點，5 點內 {e['close_races_under_5pct']} 場")
    print("整體：", result["overall"], "\n依職位：", result["by_office"], "\n2010 年後：", result["since_2010"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
