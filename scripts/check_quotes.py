"""檢查事件庫中的原文摘錄，是否真的出現在本機保存的來源文字中。

檢查範圍：中選會選舉公報（需先執行 fetch_bulletins.py）與 data/raw/references/ 的政府文件。
新聞報導不保存全文，於研究時逐字比對，紀錄在 docs/data-sources-review.md。

用法：python -I scripts/check_quotes.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUL = ROOT / "data" / "raw" / "cec_bulletin"
REFS = ROOT / "data" / "raw" / "references"
EVENTS = ROOT / "web" / "src" / "content" / "events.json"


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    local = {m["source_url"]: (BUL / m["file"]).with_suffix(".txt")
             for m in json.loads((BUL / "manifest.json").read_text(encoding="utf-8"))}
    local |= {m["source_url"]: REFS / m["file"] for m in json.loads((REFS / "manifest.json").read_text(encoding="utf-8"))}
    checked, skipped, errors = 0, 0, []
    for e in json.loads(EVENTS.read_text(encoding="utf-8")):
        for r in e["source"]["refs"]:
            if r["url"] not in local and "bulletin.cec.gov.tw" not in r["url"]:
                skipped += 1
                continue
            checked += 1
            txt = local.get(r["url"])
            if not txt or not txt.exists():
                errors.append(f"{e['id']}：找不到本機來源文字 {r['url']}")
                continue
            text = txt.read_text(encoding="utf-8").replace("\n", "").replace("ġ", "")
            if r["quote"] not in text:
                errors.append(f"{e['id']}：原文不符「{r['quote']}」（{r['title']}）")
    for err in errors:
        print("✗", err)
    print(f"檢查 {checked} 筆本機可比對的引用，{len(errors)} 筆有問題；另有 {skipped} 筆新聞引用需人工查核")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
