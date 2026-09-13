"""Replace the corpus.json documents inside db/seed/data/legal/*.ndjson, keep everything else.

parse_provisions.py writes ONLY the documents in corpus.json (7). The seed files also hold
the 8 gazette documents from research/inbox-loader/ingest_congbao.py. Writing the parser
output straight over the seed files would drop those; this merges instead, the same way
ingest_congbao.py keeps rows it did not produce.

R18: machine-regenerated text does not keep `verified` on its own. Pass --verified-by NAME
only for documents the owner has read in the diff report and accepts; otherwise --unverified.
The decision is per document: --only DOC,DOC limits one run to those documents (default: every
document in --from), so each decision group is one run:

    cd research/legal-loader
    python3 merge_into_seed.py --from out --into ../../db/seed/data/legal --only 33/2023/TT-BTC,46/VBHN-BTC --verified-by "Tên"
    python3 merge_into_seed.py --from out --into ../../db/seed/data/legal --only 25/VBHN-BTC --unverified
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def merge_rows(existing: list[dict], incoming: list[dict], key: str, replace_numbers: set[str]) -> list[dict]:
    """Rows of `replace_numbers` come from `incoming`, every other row stays as it was — incoming
    rows of other documents are dropped, or a partial merge would duplicate them."""
    return ([r for r in existing if r[key] not in replace_numbers]
            + [r for r in incoming if r[key] in replace_numbers])


def select_documents(available: set[str], only: str | None) -> set[str]:
    """The document numbers one run merges: all of `available`, or the comma-separated `only`
    list, every entry of which must exist in `available`."""
    if only is None:
        return set(available)
    wanted = {n.strip() for n in only.split(',') if n.strip()}
    if not wanted:
        raise ValueError('--only is empty')
    unknown = sorted(wanted - available)
    if unknown:
        raise ValueError(f"--only: not in documents.ndjson: {', '.join(unknown)} "
                         f"(available: {', '.join(sorted(available))})")
    return wanted


def _read(p: Path) -> list[dict]:
    return [json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip()]


def _write(p: Path, rows: list[dict]) -> None:
    p.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows), encoding='utf-8')


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='src', required=True)
    ap.add_argument('--into', dest='dst', required=True)
    ap.add_argument('--only', help='comma-separated document numbers (default: every document in --from)')
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--verified-by')
    g.add_argument('--unverified', action='store_true')
    a = ap.parse_args(argv)
    src, dst = Path(a.src), Path(a.dst)

    docs = _read(src / 'documents.ndjson')
    try:
        numbers = select_documents({d['number'] for d in docs}, a.only)
    except ValueError as e:
        ap.error(str(e))
    docs = [d for d in docs if d['number'] in numbers]
    for d in docs:
        d['verification'] = 'verified' if a.verified_by else 'auto_unverified'
        d['verified_by'] = a.verified_by or None
    _write(dst / 'documents.ndjson', merge_rows(_read(dst / 'documents.ndjson'), docs, 'number', numbers))
    for name in ('provisions.ndjson', 'chunks.ndjson'):
        _write(dst / name, merge_rows(_read(dst / name), _read(src / name), 'document_number', numbers))
    status = f'verified by {a.verified_by}' if a.verified_by else 'auto_unverified'
    print(f'merged {len(numbers)} documents into {dst} as {status}: {sorted(numbers)}')


if __name__ == '__main__':
    main()
