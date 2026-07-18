"""Parse an FTA `.doc` biểu thuế into (hs8, desc, [rate cells]) rows.

FTA schedules are flatter than ND 26/2023: one preferential import biểu, no
Annex I/II split and (for ACFTA) no Chapter 98. A row is `HS8 | mô tả | rate(s)`.
Some FTAs carry ONE rate for the whole 2022–2027 period (ACFTA); others carry a
column per year (EVFTA/RCEP → six cells). We capture the full list of rate cells
after each HS8 and let the loader map them to validity intervals.

Reuses the ND 26 lessons: split on the Word cell mark \x07 (+ newline), scan past
multi-cell descriptions, stop at the next HS8.

    python3 parse_fta.py <doc_dir> --emit rows.ndjson
"""
import glob
import json
import os
import re
import subprocess
import sys

HS8 = re.compile(r'^\d{4}\.\d{2}\.\d{2}$')
RATE = re.compile(r'^(\d{1,3}(,\d+)?|\*)$')  # comma-decimal percent, or `*` exclusion


def doc_cells(path):
    out = subprocess.run(
        ['textutil', '-stdout', '-convert', 'txt', path],
        capture_output=True, check=True,
    ).stdout.decode('utf-8', 'replace')
    return [t.strip() for t in re.split(r'[\x07\n]', out)]


def part_num(path):
    m = re.search(r'_(\d+)\.doc$', path)
    return int(m.group(1)) if m else 0


def parse(doc_dir):
    parts = sorted(glob.glob(os.path.join(doc_dir, '*.doc')) + glob.glob(os.path.join(doc_dir, '*.docx')),
                   key=part_num)
    cells = []
    for p in parts:
        cells.extend(doc_cells(p))

    rows, i, n = [], 0, len(cells)
    while i < n:
        c = cells[i]
        if HS8.match(c):
            desc = ''
            k, scanned = i + 1, 0
            # Skip the description (possibly multi-cell) to the first rate cell.
            while k < n and scanned < 12 and not RATE.match(cells[k]) and not HS8.match(cells[k]):
                if cells[k] and desc == '':
                    desc = cells[k]
                if cells[k]:
                    scanned += 1
                k += 1
            # Collect consecutive rate cells (1 for ACFTA, 6 for EVFTA/RCEP).
            rates = []
            while k < n and (cells[k] == '' or RATE.match(cells[k])):
                if RATE.match(cells[k]):
                    rates.append(cells[k])
                    k += 1
                elif cells[k] == '' and k + 1 < n and RATE.match(cells[k + 1]):
                    k += 1  # tolerate a blank cell between rates
                else:
                    break
            rows.append({'hs': c.replace('.', ''), 'hs_dotted': c, 'desc': desc, 'rates': rates})
            i = max(k, i + 1)
        else:
            i += 1
    return rows


if __name__ == '__main__':
    doc_dir = sys.argv[1]
    rows = parse(doc_dir)
    from collections import Counter
    dist = Counter(len(r['rates']) for r in rows)
    uniq = len({r['hs'] for r in rows})
    print(f'{len(rows)} HS8 rows | {uniq} unique | rate-count distribution: {dict(sorted(dist.items()))}')
    if '--emit' in sys.argv:
        out = sys.argv[sys.argv.index('--emit') + 1]
        with open(out, 'w', encoding='utf-8') as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(f'wrote {len(rows)} rows -> {out}')
    else:
        for hs in ['84818099', '01012100']:
            hit = [r for r in rows if r['hs'] == hs]
            print(f'  {hs}: {hit[0]["rates"] if hit else "MISSING"}')
