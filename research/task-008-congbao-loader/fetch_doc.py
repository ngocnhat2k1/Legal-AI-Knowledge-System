"""Download the 14 `.doc` parts of ND 26/2023 from a saved Công báo page.

The document page lists, per gazette issue (743+744 … 769+770), a tokenised
`g7.cdnchinhphu.vn/api/download/stream?Url=<token>&file_name=…_26-2023-NĐ-CP.doc`
link (plus a `.pdf` twin — the PDF is a 200-DPI scan with no text layer, so we
take the `.doc`). Tokens are single-use-ish and expire, so download promptly.

    python3 fetch_doc.py page.html doc/
"""
import html
import os
import re
import sys
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0'}


def extract_doc_links(page_html: str):
    """Return {gazette_part: url} for every distinct `.doc` stream link."""
    links = {}
    for m in re.finditer(r'href="(https://g7\.cdnchinhphu\.vn/api/download/stream\?[^"]+)"', page_html):
        url = html.unescape(m.group(1))  # &amp; -> &, &#x2B; -> +
        if 'file_name=' not in url or not url.lower().endswith('.doc'):
            continue
        # Gazette part number, e.g. 743, from file_name=2023_743...
        part = re.search(r'file_name=2023_(\d+)', url)
        key = part.group(1) if part else url[-12:]
        links.setdefault(key, url)  # first token per part wins
    return links


def main():
    page_path, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    page = open(page_path, encoding='utf-8', errors='replace').read()
    links = extract_doc_links(page)
    print(f'{len(links)} distinct .doc parts found')
    for key in sorted(links, key=int):
        url = links[key]
        dest = os.path.join(out_dir, f'nd26-2023_{key}.doc')
        req = urllib.request.Request(url, headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(dest, 'wb') as f:
                f.write(data)
            print(f'  {key}: {len(data):>9,} bytes -> {dest}')
        except Exception as e:  # noqa: BLE001
            print(f'  {key}: FAILED {e}')


if __name__ == '__main__':
    main()
