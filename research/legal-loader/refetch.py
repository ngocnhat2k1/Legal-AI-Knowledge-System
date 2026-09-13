"""Re-download the corpus.json sources into doc/ (gitignored; empty on a fresh clone).

Each corpus entry names the local part files it was parsed from (`doc_file` or an ordered
`doc_files` list, e.g. 25/VBHN-BTC = four gazette-issue PDFs). The Công báo page lists all
downloadable parts in order; we take the parts whose extension matches, in order, and save
them under the names corpus.json expects. curl, not urllib: the CDN omits the GlobalSign
intermediate and Python's OpenSSL refuses it (see research/inbox-loader/ingest_congbao.py).

    python3 refetch.py corpus.json [--only 46/VBHN-BTC,25/VBHN-BTC]
Prints the part→file mapping; CHECK IT before parsing — the mapping is by order, and a page
that grew a new part would shift it.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'apps' / 'ingest'))
import ingest_document as ig  # noqa: E402


def wanted_files(doc: dict) -> list[str]:
    return doc.get('doc_files') or [doc['doc_file']]


def pick_parts(parts: list[tuple[str, str]], files: list[str]) -> list[tuple[str, str]]:
    """Parts on the page whose extension matches the corpus files, in page order."""
    ext = Path(files[0]).suffix.lower()
    same = [(n, u) for n, u in parts if Path(n).suffix.lower() == ext]
    if len(same) < len(files):
        raise SystemExit(f'page has {len(same)} {ext} parts, corpus expects {len(files)}: {files}')
    return same[: len(files)]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('corpus')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    only = {s.strip() for s in a.only.split(',') if s.strip()}
    for doc in json.load(open(a.corpus, encoding='utf-8')):
        if only and doc['number'] not in only:
            continue
        files = wanted_files(doc)
        parts = pick_parts(ig.fetch_part_urls(doc['source_url']), files)
        for (name, url), local in zip(parts, files):
            out = HERE / local
            out.parent.mkdir(parents=True, exist_ok=True)
            print(f"{doc['number']}: {name} -> {local}")
            r = subprocess.run(['curl', '-sS', '-L', '--max-time', '240', '-o', str(out), '-w', '%{http_code}', url],
                               capture_output=True, text=True)
            if r.stdout != '200':
                raise SystemExit(f"{doc['number']}: HTTP {r.stdout} for {name}")


if __name__ == '__main__':
    main()
