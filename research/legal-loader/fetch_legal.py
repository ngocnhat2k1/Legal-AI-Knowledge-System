"""Download the `.doc` of a legal document from its Công báo content page.

Derived from research/task-008-congbao-loader/fetch_doc.py. A legal document's
Công báo page (`/noi-dung-van-ban-so-…`) lists a tokenised
`g7.cdnchinhphu.vn/api/download/stream?Url=<token>&file_name=…31-2018-NĐ-CP.doc`
link (plus a `.pdf` twin — the PDF is a signed scan, so we take the `.doc`, which
carries a real text layer). Tokens expire fast, so save the page and download
promptly:

    # 1. save the content page (server-rendered, no JS needed for the links)
    curl -sL -A 'Mozilla/5.0' \
      'https://congbao.chinhphu.vn/noi-dung-van-ban-so-31-2018-nd-cp-26098?cbid=21731' \
      -o doc/31-2018.page.html
    # 2. pull the .doc
    python3 fetch_legal.py doc/31-2018.page.html doc/31-2018.doc

Prose parsing (Điều/Khoản/Điểm) happens in parse_provisions.py; this only fetches.
"""
from __future__ import annotations

import html
import re
import sys
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0'}


def extract_doc_link(page_html: str) -> str | None:
    """Return the first Word (.doc/.docx) g7 stream URL on the page, entities decoded.

    Older Công báo documents export `.doc`; documents from ~2020 on export `.docx`.
    textutil reads both. The `.pdf` twin is skipped (older PDFs are scans).
    """
    for m in re.finditer(r'href="(https://g7\.cdnchinhphu\.vn/api/download/stream\?[^"]+)"', page_html):
        url = html.unescape(m.group(1))  # &amp; -> &, &#x2B; -> +
        low = url.lower()
        if 'file_name=' in url and (low.endswith('.doc') or low.endswith('.docx')):
            return url
    return None


def main() -> None:
    page_path, dest = sys.argv[1], sys.argv[2]
    page = open(page_path, encoding='utf-8', errors='replace').read()
    url = extract_doc_link(page)
    if not url:
        print('No .doc stream link found on the page (expired token? wrong page?).')
        sys.exit(1)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    with open(dest, 'wb') as f:
        f.write(data)
    print(f'{len(data):,} bytes -> {dest}')


if __name__ == '__main__':
    main()
