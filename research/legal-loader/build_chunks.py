"""Build retrieval chunks from provisions.ndjson (text only — the seed embeds them).

Chunk rule (legal-rag-retrieval.md §1): index at the Khoản, return the parent Điều.
A Điều with Khoản children yields one chunk per Khoản; a short Điều with no Khoản
yields a single chunk for the Điều itself. Điểm text already lives inside its Khoản
body, so điểm are not separate chunks.

Each chunk carries:
  * `body`      — the article HEADING + clause text (drives the tsv keyword index and
                  is the embedding base). The heading folds in the article TOPIC
                  (e.g. "De Minimis", "Hồ sơ cấp C/O") so a topical query matches.
  * `embed_text`— a Summary-Augmented prefix (the ~150-char doc summary) + body,
                  capped, prepended to fight DRM (retrieving the right topic from the
                  WRONG document). The prefix is embedded but is NOT in the keyword
                  index (tsv is generated from `body` only, in the schema).

Embedding is done at SEED time by db/seed/legal.ts against the BGE-M3 sidecar, so the
model lives in exactly one place and this host step needs no heavy model (it kept
OOM-ing a laptop Docker VM; the VPS embeds fine).

    python3 build_chunks.py out out
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from os.path import join

EMBED_CAP = 1600  # chars of embed input (topic sits in summary + heading + clause start)


def read_ndjson(path: str) -> list[dict]:
    return [json.loads(line) for line in open(path, encoding='utf-8')]


def build_chunks(docs: dict[str, dict], provs: list[dict]) -> list[dict]:
    children: dict[str, list[dict]] = defaultdict(list)
    for p in provs:
        if p['parent_key']:
            children[p['parent_key']].append(p)

    chunks: list[dict] = []
    for p in provs:
        if p['ptype'] != 'dieu':
            continue
        doc = docs[p['document_number']]
        sac = (doc.get('summary') or '').strip()[:200] or None
        art_heading = (p.get('heading') or '').strip()  # "Điều 15. Hồ sơ cấp C/O…"
        khoan = [c for c in children.get(p['key'], []) if c['ptype'] == 'khoan']
        units = khoan if khoan else [p]
        for u in units:
            clause = (u.get('body') or '').strip()
            if not clause:
                continue
            body = f'{art_heading}\n{clause}' if art_heading else clause
            embed_text = (f'{sac}\n{body}' if sac else body)[:EMBED_CAP]
            chunks.append({
                'document_number': p['document_number'],
                'provision_key': u['key'],
                'article_key': p['key'],
                'sac_prefix': sac,
                'body': body,
                'embed_text': embed_text,
                'effective_from': doc['effective_from'],
                'effective_to': doc.get('effective_to'),
                'effectiveness': doc.get('effectiveness', 'con_hieu_luc'),
            })
    return chunks


def main() -> None:
    in_dir, out_dir = sys.argv[1], sys.argv[2]
    docs = {d['number']: d for d in read_ndjson(join(in_dir, 'documents.ndjson'))}
    provs = read_ndjson(join(in_dir, 'provisions.ndjson'))
    chunks = build_chunks(docs, provs)
    os.makedirs(out_dir, exist_ok=True)
    out = join(out_dir, 'chunks.ndjson')
    with open(out, 'w', encoding='utf-8') as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + '\n')
    print(f'wrote {len(chunks)} chunks (text only; embedded at seed time) -> {out}')


if __name__ == '__main__':
    main()
