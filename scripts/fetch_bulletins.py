"""抓取中選會選舉公報（bulletin.cec.gov.tw）的直轄市長歷屆公報 PDF，作為政見原文參考。

PDF 不進 git（見 .gitignore），以 manifest 記錄來源與 sha256，可隨時重抓。

用法：python -I scripts/fetch_bulletins.py
"""

import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://bulletin.cec.gov.tw/"
ROOT_DIR = "01選舉公報/03直轄市長"
OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "cec_bulletin"
DELAY = 1.0
UA = {"User-Agent": "ElectionLife-research (+https://github.com/hanhanlee/ElectionLife)"}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        data = r.read()
    time.sleep(DELAY)
    return data


def list_dir(d: str) -> list[str]:
    html = get(BASE + "?dir=" + urllib.parse.quote(d)).decode("utf-8", "replace")
    return [urllib.parse.unquote(h) for h in re.findall(r'href="([^"#]+)"', html)]


def extract_text(pdf: Path) -> int:
    """抽出文字層存成同名 .txt（進 git）；掃描檔沒有文字層，回傳 0，需另行 OCR"""
    import pymupdf

    with pymupdf.open(pdf) as doc:
        text = "\n".join(page.get_text() for page in doc)
    if text.strip():
        pdf.with_suffix(".txt").write_text(text, encoding="utf-8")
    return len(text.strip())


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    years = sorted({h.split("/")[-1] for h in list_dir(ROOT_DIR) if h.startswith(f"?dir={ROOT_DIR}/")})
    manifest = []
    for year in years:
        for path in [h for h in list_dir(f"{ROOT_DIR}/{year}") if h.lower().endswith(".pdf")]:
            url = BASE + urllib.parse.quote(path)
            dest = OUT / year / Path(path).name
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(get(url))
            data = dest.read_bytes()
            manifest.append({
                "file": dest.relative_to(OUT).as_posix(),
                "source_url": url,
                "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "sha256": hashlib.sha256(data).hexdigest(),
                "bytes": len(data),
            })
            chars = extract_text(dest)
            manifest[-1]["text_chars"] = chars
            print(f"✓ {year} {dest.name}（{len(data) // 1024} KB，文字 {chars} 字）")
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
