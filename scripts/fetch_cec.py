"""抓取中選會選舉資料庫（db.cec.gov.tw）的直轄市長、縣市長歷屆得票結果。

資料來自網站前端使用的公開靜態 JSON；每次請求間隔 1 秒，只抓全國層級彙總。
原始檔存到 data/raw/cec/，並附 manifest（來源網址、抓取時間、sha256）。

用法：python -I scripts/fetch_cec.py
"""

import hashlib
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://db.cec.gov.tw/static/elections"
SUBJECTS = {"C1": "直轄市長", "C2": "縣市長"}
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "cec"
DELAY = 1.0


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "ElectionLife-research (+https://github.com/hanhanlee/ElectionLife)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    time.sleep(DELAY)
    return data


def save(rel: str, url: str, data: bytes, manifest: list) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    manifest.append({
        "file": rel,
        "source_url": url,
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sha256": hashlib.sha256(data).hexdigest(),
    })


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    manifest: list = []
    for subject in SUBJECTS:
        url = f"{BASE}/list/ELC_{subject}.json"
        raw = get(url)
        save(f"list_{subject}.json", url, raw, manifest)
        themes = [t for area in json.loads(raw) for t in area["theme_items"] if t.get("has_data")]
        print(f"{SUBJECTS[subject]}：{len(themes)} 屆")

        for t in themes:
            key = f"{t['prv_code']}_{t['city_code']}_{t['area_code']}_{t['dept_code']}_{t['li_code']}"
            url = f"{BASE}/data/tickets/ELC/{subject}/{t['legislator_type_id']}/{t['theme_id']}/{t['data_level']}/{key}.json"
            try:
                save(f"tickets/{subject}/{t['session']}_{t['theme_id']}.json", url, get(url), manifest)
                print(f"  ✓ {t['theme_name']}")
            except Exception as e:  # 個別屆次缺資料時記錄並繼續
                print(f"  ✗ {t['theme_name']}：{e}", file=sys.stderr)
                manifest.append({"source_url": url, "error": str(e)})

    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
