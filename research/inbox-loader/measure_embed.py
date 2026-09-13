"""Measure the embedder on the long evidence sections milestone 2 (the evidence layer) will send it.

Everything embedded before 2026-09-13 was ≤ 1,600 chars. Explanatory-note records run to
~49,000 chars, and BGE-M3 attention cost grows with length — on a 4-core/8 GB VPS shared
with Postgres and the API that is a real OOM risk, and nothing in the repo measured it.
The spec (bot-answer-parity-design.md §2.6) makes this measurement the first task of
milestone 2; EMBED_CHARS / EMBED_MAX_TOKENS are chosen from what this prints.

    EMBEDDER_URL=http://127.0.0.1:8000 python3 measure_embed.py ../../db/seed/data/legal/hs-explanatory-notes.ndjson
If EMBEDDER_HOST_PORT is changed in .env, set EMBEDDER_URL=http://127.0.0.1:<that port> (default 8000).
While it runs, in another shell:  docker stats --no-stream  (read the embedder's MEM USAGE peak)
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request


def pick_samples(records: list[dict], batch: int = 32, min_chars: int = 8000) -> tuple[dict, list[dict]]:
    longest = max(records, key=lambda r: len(r.get('text_vi', '')))
    long_ones = [r for r in records if len(r.get('text_vi', '')) >= min_chars]
    return longest, long_ones[:batch]


def embed(url: str, texts: list[str]) -> float:
    body = json.dumps({'texts': texts}).encode()
    req = urllib.request.Request(f'{url}/embed', data=body, headers={'content-type': 'application/json'})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=1800) as r:
        json.load(r)
    return time.time() - t0


def main() -> None:
    url = os.environ.get('EMBEDDER_URL', 'http://127.0.0.1:8000').rstrip('/')
    records = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
    longest, batch = pick_samples(records)
    t1 = embed(url, [longest['text_vi']])
    print(f'1 record of {len(longest["text_vi"]):,} chars: {t1:.1f}s')
    t2 = embed(url, [r['text_vi'] for r in batch])
    print(f'batch of {len(batch)} records ≥ 8,000 chars ({sum(len(r["text_vi"]) for r in batch):,} chars): {t2:.1f}s → {t2 / max(1, len(batch)):.1f}s/record')


if __name__ == '__main__':
    main()
