"""Annex-aware parser for ND 26/2023 Công báo `.doc` parts (TASK-008).

The naive parser that ignored annex boundaries reported 94% success while
returning EXPORT rates for IMPORT queries: 1,520 HS codes appear in both
Annex I (export) and Annex II (import), 1,329 with different rates. So annex
detection is a FIRST-CLASS step here, not a regex afterthought.

Annexes run in strict order I -> II -> III -> IV. We track the current annex
with forward-only markers (a stray running-header for an earlier annex can
never move us backwards), and tag every 8-digit HS line with the annex it
falls in:

  I   Biểu thuế xuất khẩu           -- export, ad valorem %
  II  Biểu thuế nhập khẩu ưu đãi    -- import MFN, ad valorem % (or `*` excluded)
  III Thuế tuyệt đối / hỗn hợp      -- used cars, absolute USD (NOT a %)
  IV  Thuế suất ngoài hạn ngạch     -- out-of-quota (TRQ), ad valorem %

Cells come from `textutil -convert txt` split on the Word cell mark \x07 (and
newline). Table cells carry no internal newline, so descriptions stay intact.

    python3 parse_nd26.py doc/            # diagnostics
    python3 parse_nd26.py doc/ --ndjson rows.ndjson   # emit rows for the loader
"""
import glob
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict

HS8 = re.compile(r'^\d{4}\.\d{2}\.\d{2}$')
RATE = re.compile(r'^(\d{1,3}(,\d+)?|\*)$')  # percent (comma-decimal) or `*` exclusion
ORDER = {None: 0, 'I': 1, 'II': 2, 'III': 3, 'IV': 4}


def doc_cells(path):
    out = subprocess.run(
        ['textutil', '-stdout', '-convert', 'txt', path],
        capture_output=True, check=True,
    ).stdout.decode('utf-8', 'replace')
    return [t.strip() for t in re.split(r'[\x07\n]', out)]


def advance_annex(cur, cell):
    """Return the annex after seeing `cell`; forward-only.

    Match the ORIGINAL case: the real section headers are uppercase
    ("BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI"), while the decree title and used-car prose
    mention "Biểu thuế nhập khẩu" in mixed case. Upper-casing the cell first
    would let that prose flip the annex to II before the export table even
    starts — the exact bug that swallowed Annex I on the first run.
    """
    def maybe(target):
        return target if ORDER[target] > ORDER[cur] else cur

    if 'BIỂU THUẾ XUẤT KHẨU' in cell:
        return maybe('I')
    if 'BIỂU THUẾ NHẬP KHẨU' in cell:
        return maybe('II')
    if cell.startswith('Phụ lục III'):
        return maybe('III')
    if cell.startswith('Phụ lục IV'):
        return maybe('IV')
    return cur


def part_num(path):
    return int(re.search(r'_(\d+)\.doc$', path).group(1))


D4 = re.compile(r'^\d{4}$')
D2 = re.compile(r'^\d{2}$')
PCT = re.compile(r'^\d{1,3}$')


def all_cells(doc_dir):
    parts = sorted(glob.glob(os.path.join(doc_dir, 'nd26-2023_*.doc')), key=part_num)
    cells = []
    for p in parts:
        cells.extend(doc_cells(p))
    return cells


def region_after(cells, start_pred, stop_pred=None):
    """Cells from the first `start_pred` match to the next `stop_pred` (or end)."""
    out, on = [], False
    for c in cells:
        if not on and start_pred(c):
            on = True
        elif on and stop_pred and stop_pred(c):
            break
        if on:
            out.append(c)
    return out


def parse_annex_iv(cells):
    """Out-of-quota TRQ rates. Codes are fragmented into 4+2+2-digit cells
    (`0407` `21` `00`), not dotted; reassemble them and take the trailing %."""
    iv = region_after(cells, lambda c: c.startswith('Phụ lục IV'))
    out, i, n = [], 0, len(cells := iv)
    while i < n:
        if D4.match(cells[i]) and i + 2 < n and D2.match(cells[i + 1]) and D2.match(cells[i + 2]):
            code = cells[i] + cells[i + 1] + cells[i + 2]
            j = i + 3
            # rate is the next 1–3 digit cell before the next code starts
            while j < n and not PCT.match(cells[j]) and not D4.match(cells[j]):
                j += 1
            rate = cells[j] if j < n and PCT.match(cells[j]) else None
            out.append({'hs': code, 'rate': rate})
            i = j + 1 if rate else i + 3
        else:
            i += 1
    return out


def parse(doc_dir):
    cells = all_cells(doc_dir)

    annex = None
    rows = []  # dict per 8-digit HS line
    i = 0
    n = len(cells)
    while i < n:
        c = cells[i]
        annex = advance_annex(annex, c)
        if HS8.match(c):
            if c.startswith('98'):
                # Chapter 98 (Mục II) — special preferential import codes, a 4-column
                # row: `98xx | desc | corresponding Mục-I code | rate`. The corresponding
                # code is a CROSS-REFERENCE, not a tariff line of its own; consume it here
                # so it never becomes a phantom Annex-II row carrying the ch98 rate.
                desc, corr, rate = '', None, None
                k, scanned = i + 1, 0
                while k < n and scanned < 16:
                    cell = cells[k]
                    if cell == '':
                        k += 1
                        continue
                    if HS8.match(cell):
                        if cell.startswith('98') or corr is not None:
                            break  # next ch98 code; current row has no more to consume
                        corr = cell
                        k += 1
                        scanned += 1
                        continue
                    if RATE.match(cell):
                        rate = cell
                        k += 1
                        break
                    if desc == '':
                        desc = cell
                    scanned += 1
                    k += 1
                rows.append({'annex': 'II', 'chapter98': True, 'hs': c.replace('.', ''),
                             'hs_dotted': c, 'desc': desc, 'rate': rate,
                             'corresponding': corr.replace('.', '') if corr else None})
                i = k
                continue

            # Mục I. A description may span SEVERAL cells (a Word cell with soft breaks
            # splits into tokens, e.g. "...Chlorobenzene, và" / "p-dichlorobenzene").
            # Scan forward to the first RATE cell, skipping continuations, and stop at the
            # next HS8 — a row that genuinely carries no numeric rate (e.g. "Theo hướng
            # dẫn tại khoản 1.1 Chương 98") stays rate=None.
            desc, rate = '', None
            k, scanned = i + 1, 0
            while k < n and scanned < 12:
                cell = cells[k]
                if cell == '':
                    k += 1
                    continue
                if HS8.match(cell):
                    break  # next row starts; this HS had no rate
                if RATE.match(cell):
                    rate = cell
                    break
                if desc == '':
                    desc = cell
                scanned += 1
                k += 1
            rows.append({'annex': annex, 'chapter98': False, 'hs': c.replace('.', ''),
                         'hs_dotted': c, 'desc': desc, 'rate': rate})
        i += 1
    return rows


def diagnostics(rows):
    by_annex = defaultdict(list)
    for r in rows:
        by_annex[r['annex']].append(r)

    print('=== per-annex HS8 lines ===')
    for a in ['I', 'II', 'III', 'IV', None]:
        rs = by_annex.get(a, [])
        uniq = len({r['hs'] for r in rs})
        with_rate = len({r['hs'] for r in rs if r['rate'] is not None})
        print(f'  Annex {str(a):>4}: {len(rs):>6} lines | {uniq:>6} unique HS | {with_rate:>6} unique with rate')
    ch98 = [r for r in rows if r.get('chapter98')]
    print(f'  (of Annex II, Chapter 98 / Mục II special rows: {len(ch98)})')

    print('\n=== ACCEPTANCE CHECKS ===')
    # research 12: Annex II ~11,874 unique HS, ~11,160 with a rate (their naive parse
    # counted Chapter 98 codes in the total). We keep ch98 codes in the unique count
    # but hold them in a separate schedule at load time.
    ii_all = by_annex.get('II', [])
    muc1 = [r for r in ii_all if not r.get('chapter98')]
    ii_uniq = len({r['hs'] for r in ii_all})  # total incl Chapter 98
    ii_rate = len({r['hs'] for r in muc1 if r['rate'] is not None})  # Mục I only
    print(f'  Annex II unique HS (incl Ch.98) = {ii_uniq} (expect ~11,874)  {"OK" if 11800 <= ii_uniq <= 11950 else "CHECK"}')
    print(f'  Annex II Mục I with rate = {ii_rate} (expect ~11,160)  {"OK" if 11080 <= ii_rate <= 11250 else "CHECK"}')

    def find(hs, annex):
        return [r for r in rows if r['hs'] == hs and r['annex'] == annex]

    for hs, a, exp in [('03011110', 'II', '15'), ('03011110', 'I', '0')]:
        got = find(hs, a)
        val = got[0]['rate'] if got else 'MISSING'
        print(f'  0301.11.10 Annex {a} = {val} (expect {exp})  {"OK" if val == exp else "CHECK"}')

    for hs in ['27101221', '27101222', '27101224', '27101225']:
        got = find(hs, 'II')
        val = got[0]['rate'] if got else 'MISSING'
        print(f'  {hs} Annex II = {val} (expect 10)  {"OK" if val == "10" else "CHECK"}')

    print('\n=== Annex II rate value distribution (top 12) ===')
    dist = Counter(r['rate'] for r in ii)
    for val, c in dist.most_common(12):
        print(f'  {str(val):>6}: {c}')
    stars = sum(1 for r in ii if r['rate'] == '*')
    norate = sum(1 for r in ii if r['rate'] is None)
    print(f'  `*` excluded: {stars} | no-rate lines: {norate}')


if __name__ == '__main__':
    doc_dir = sys.argv[1]
    rows = parse(doc_dir)
    if '--emit' in sys.argv:
        out_dir = sys.argv[sys.argv.index('--emit') + 1]
        os.makedirs(out_dir, exist_ok=True)
        # Annex I export + Annex II Mục I import (the bulk); Chapter 98 goes separately.
        hs_rows = [r for r in rows if r['annex'] in ('I', 'II') and not r.get('chapter98')]
        with open(os.path.join(out_dir, 'rows.ndjson'), 'w', encoding='utf-8') as f:
            for r in hs_rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        # Chapter 98 (Mục II) special preferential codes, with their cross-reference.
        ch98 = [r for r in rows if r.get('chapter98')]
        with open(os.path.join(out_dir, 'chapter98.ndjson'), 'w', encoding='utf-8') as f:
            for r in ch98:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        # Annex IV out-of-quota TRQ rates (reassembled fragmented codes).
        cells = all_cells(doc_dir)
        iv = parse_annex_iv(cells)
        with open(os.path.join(out_dir, 'annex_iv.json'), 'w', encoding='utf-8') as f:
            json.dump(iv, f, ensure_ascii=False, indent=2)
        # Annex III used-car regime — captured verbatim, NOT silently dropped.
        iii = region_after(cells, lambda c: c.startswith('Phụ lục III'),
                            lambda c: c.startswith('Phụ lục IV'))
        with open(os.path.join(out_dir, 'annex_iii.txt'), 'w', encoding='utf-8') as f:
            f.write('\n'.join(c for c in iii if c.strip()))
        print(f'emit: {len(hs_rows)} Annex I/Mục-I rows, {len(ch98)} Chapter 98 rows, '
              f'{len(iv)} Annex IV codes, {len([c for c in iii if c.strip()])} Annex III cells -> {out_dir}')
        print('Annex IV out-of-quota sample:', iv[:6])
    else:
        diagnostics(rows)
