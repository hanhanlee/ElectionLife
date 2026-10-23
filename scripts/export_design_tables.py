"""從遊戲內容檔自動產生設定文件的附錄（docs/game-design-appendix.md）。

內容檔改了之後重跑一次，附錄就會和遊戲實際資料一致。
用法：python -I scripts/export_design_tables.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "web" / "src" / "content"
OUT = ROOT / "docs" / "game-design-appendix.md"

STAT_LABELS = {
    "approval": "民調", "media": "媒體", "treasury": "市庫", "achievement": "政績", "council": "議會",
    "team": "團隊", "party": "政黨", "business": "政商", "integrity": "原則",
}
PHASES = [
    ("launch", "參選（第一階段第 1 回合，依出身觸發）"),
    ("platform", "主打政見（第一階段第 2 回合，選項池）"),
    ("campaign", "選戰（第一階段第 3–11 回合）"),
    ("eve", "選前之夜（第一階段第 12 回合）"),
    ("term", "任期（第二階段第 1–8 回合）"),
    ("incumbency", "任期尾聲・現任限定（第二階段第 9–11 回合）"),
    ("reelection", "連任選戰（第二階段第 12 回合）"),
]


def load(name):
    return json.loads((CONTENT / name).read_text(encoding="utf-8"))


def delta(d):
    if not d:
        return "—"
    return "、".join(f"{STAT_LABELS.get(k, k)} {v:+d}" for k, v in d.items())


def cond(c):
    if not c:
        return ""
    parts = []
    if c.get("flags"):
        parts.append("需要 " + "+".join(c["flags"]))
    if c.get("anyFlags"):
        parts.append("任一 " + "/".join(c["anyFlags"]))
    if c.get("notFlags"):
        parts.append("排除 " + "/".join(c["notFlags"]))
    for k, v in (c.get("min") or {}).items():
        parts.append(f"{STAT_LABELS.get(k, k)}≥{v}")
    for k, v in (c.get("max") or {}).items():
        parts.append(f"{STAT_LABELS.get(k, k)}≤{v}")
    return "；".join(parts)


def esc(s):
    return str(s).replace("|", "／").replace("\n", " ")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parties, bgs, crises, events = load("parties.json"), load("backgrounds.json"), load("crises.json"), load("events.json")
    traits, burdens = load("traits.json"), load("burdens.json")
    out = [
        "# 《選舉人生：市長篇》設定附錄",
        "",
        "> 本檔由 `scripts/export_design_tables.py` 從 `web/src/content/` 自動產生，請勿手動修改。",
        "> 數值縮寫：民調＝民調支持、媒體＝媒體聲量、市庫＝市庫財政、政績＝施政成果、議會＝議會關係、團隊＝團隊、政黨＝政黨支持、政商＝政商關係、原則＝原則（隱藏）。經費單位為萬元。",
        "",
        "## A. 政黨",
        "",
        "| 政黨 | 參考 | 起始調整 | 黨部撥款基數 | 小額捐款倍率 | 旗標 |",
        "|---|---|---|---|---|---|",
    ]
    for p in parties:
        out.append(f"| {p['name']} | {esc(p['reference'])} | {delta(p['startDelta'])} | {p['funding']} | {p.get('fundraising', 1)} | {', '.join(p['flags'])} |")
    out += ["", "優勢與包袱：", ""]
    for p in parties:
        out.append(f"- **{p['name']}**：＋{'；＋'.join(p['advantages'])}；－{'；－'.join(p['baggage'])}")

    out += ["", "## B. 出身", "", "| 出身 | 抽中權重 | 起始調整 | 小額捐款倍率 | 現任 | 旗標 |", "|---|---|---|---|---|---|"]
    for b in bgs:
        out.append(f"| {b['name']} | {b['weight']} | {delta(b['startDelta'])} | {b.get('fundraising', 1)} | {'是' if b.get('incumbent') else ''} | {', '.join(b['flags'])} |")
    out += ["", "優勢與包袱：", ""]
    for b in bgs:
        out.append(f"- **{b['name']}**：＋{'；＋'.join(b['advantages'])}；－{'；－'.join(b['baggage'])}")

    cat_names = {"communication": "溝通與形象", "policy": "政策與行政", "organization": "組織與人際", "personality": "政治人格"}
    out += ["", "## B2. 個人資質（每人 1 個政治人格 + 2 個不同類別的能力資質）", "",
            "| 資質 | 類別 | 人物介紹用語 | 起始調整 | 能力（+擅長／−不擅長） | 易抽到的出身 |", "|---|---|---|---|---|---|"]
    for t in traits:
        phrase = t.get("strength") and f"擅長：{t['strength']}" or t.get("weakness") and f"弱點：{t['weakness']}" or t.get("line", "")
        sk = "、".join(f"{s['skill']}{'+' if s['level'] > 0 else '−'}" for s in t.get("skills", []))
        out.append(f"| {t['name']} | {cat_names[t['category']]} | {esc(phrase)} | {delta(t['startDelta'])} | {sk} | {', '.join(t.get('affinity', []))} |")
    out += ["", "## B3. 先天包袱（每人 1 個）", "",
            "| 包袱 | 開場句 | 包袱句 | 起始調整 | 開局經費 | 易抽到的出身／政黨 |", "|---|---|---|---|---|---|"]
    for b in burdens:
        aff = ", ".join(b.get("affinity", []) + b.get("partyAffinity", []))
        out.append(f"| {b['name']} | {esc(b.get('origin', '（用出身的開場句）'))} | {esc(b['line'])} | {delta(b['startDelta'])} | {b.get('funds', '')} | {aff} |")
    out += ["", "出身開場句：", ""]
    for b in bgs:
        out.append(f"- **{b['name']}**：" + " ／ ".join(b["origins"]))

    out += ["", "## C. 突發事件（自動觸發，不是選項）", "",
            "| 優先 | 名稱 | 好壞 | 觸發條件 | 階段 | 衝擊 | 經費 | 餘波 | 設定旗標 | 可重複 |",
            "|---|---|---|---|---|---|---|---|---|---|"]
    for c in sorted(crises, key=lambda c: c["priority"]):
        after = c.get("aftermath")
        after_s = f"{after['turns']} 回合，每回合 {delta(after['effects'])}" if after else ""
        out.append(
            f"| {c['priority']} | {c['title']} | {'負面' if c['tone'] == 'bad' else '正面'} | {cond(c['when'])} | "
            f"{'/'.join(c.get('phases', ['全程']))} | {delta(c['effects'])} | {c.get('funds', '')} | {after_s} | "
            f"{', '.join(c.get('setFlags', []))} | {'是' if c.get('repeat') else ''} |")

    out += ["", "## D. 事件與選項", ""]
    counts = {ph: sum(e["phase"] == ph for e in events) for ph, _ in PHASES}
    out.append("事件數：" + "、".join(f"{label.split('（')[0]} {counts[ph]}" for ph, label in PHASES) + f"，共 {len(events)} 個。")
    status = {}
    for e in events:
        status[e["source"]["status"]] = status.get(e["source"]["status"], 0) + 1
    out.append("來源狀態：" + "、".join(f"{k} {v}" for k, v in status.items()) + "。")
    out.append("")
    for ph, label in PHASES:
        out += [f"### {label}", ""]
        for e in [e for e in events if e["phase"] == ph]:
            meta = []
            if e.get("conditions"):
                meta.append("出現條件：" + cond(e["conditions"]))
            if e.get("weight"):
                meta.append(f"權重 {e['weight']}")
            if e.get("drawOptions"):
                meta.append(f"選項池，每次抽 {e['drawOptions']} 個")
            meta.append(f"來源：{e['source']['status']}，{len(e['source']['refs'])} 筆引用")
            out += [f"**{e['title']}**（`{e['id']}`）— {'；'.join(meta)}", "", f"> {esc(e['scenario'])}", "",
                    "| 選項 | 效果 | 經費 | 條件／標記 |", "|---|---|---|---|"]
            for o in e["options"]:
                marks = []
                if o.get("perk"):
                    marks.append("🏛現任資源")
                if o.get("requires"):
                    marks.append("鎖住除非 " + cond(o["requires"]))
                if o.get("appearsIf"):
                    marks.append("出現條件 " + cond(o["appearsIf"]))
                if o.get("setFlags"):
                    marks.append("旗標 " + ",".join(o["setFlags"]))
                if o.get("delayed"):
                    d = o["delayed"]
                    marks.append(f"{d['afterTurns']} 回合後：{delta(d['effects'])}（{esc(d['text'])}）")
                if o.get("skill"):
                    marks.append(f"能力 {o['skill']}")
                for v in o.get("variants", []):
                    vd = f"；{v['delayed']['afterTurns']} 回合後 {delta(v['delayed']['effects'])}" if v.get("delayed") else ""
                    marks.append(f"資質變化〔{cond(v['when'])}〕額外 {delta(v.get('effects'))}{vd}")
                if o.get("switchParty"):
                    marks.append("改換政黨為 " + o["switchParty"])
                if o.get("legalRisk"):
                    marks.append("⚖" + o["legalRisk"])
                if o.get("weight"):
                    marks.append(f"權重 {o['weight']}")
                out.append(f"| {esc(o['label'])} | {delta(o['effects'])} | {o.get('funds', '')} | {'；'.join(marks)} |")
            out.append("")

    out += ["## E. 花經費的選項總表", "",
            "規則：要花競選經費的選項，文字必須看得出錢花在哪裡（`validate.ts` 的 `SPENDING_WORDS` 會檢查）。"
            "這張表方便人工確認用語是否合理。", "",
            "| 經費 | 事件 | 選項 | 結果 |", "|---|---|---|---|"]
    paid = [(o["funds"], e, o) for e in events for o in e["options"] if o.get("funds", 0) < 0]
    for f, e, o in sorted(paid, key=lambda x: x[0]):
        out.append(f"| {f} | {e['title']} | {esc(o['label'])} | {esc(o['outcome'])} |")
    out.append("")
    OUT.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"寫入 {OUT.relative_to(ROOT)}：{len(events)} 事件、{len(crises)} 突發事件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
