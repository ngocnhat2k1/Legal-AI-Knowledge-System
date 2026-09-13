"""Parse an FTA `.doc` biểu thuế into (hs8, desc, [rate cells]) rows.

FTA schedules are flatter than ND 26/2023: one preferential import biểu, no
Annex I/II split and (for ACFTA) no Chapter 98. A row is `HS8 | mô tả | rate(s)`.
Some FTAs carry ONE rate for the whole 2022–2027 period (ACFTA); others carry a
column per year (EVFTA/RCEP → six cells). We capture the full list of rate cells
after each HS8 and let the loader map them to validity intervals.

Reuses the ND 26 lessons: split on the Word cell mark \x07 (+ newline), scan past
multi-cell descriptions, stop at the next HS8.

ACFTA (ND 118/2022, Điều 3 khoản 5) adds a column "Nước không được hưởng ưu đãi"
after the rate: goods from a listed origin do NOT get the ACFTA rate. It is kept as
`excluded` (sorted ND 118 codes). A 10-digit national sub-line that carries its own
exclusion is kept on its HS8 parent as `excluded_sublines` — the data model is
8-digit, and a sub-line exclusion must never become a whole-line one, unless every
sub-line of that parent excludes the same code (then the whole line is excluded).

    python3 parse_fta.py <doc_dir> --emit rows.ndjson
"""
import glob
import json
import os
import re
import subprocess
import sys

HS8 = re.compile(r'^\d{4}\.\d{2}\.\d{2}$')
HS10 = re.compile(r'^\d{4}\.\d{2}\.\d{2}\.\d{2}$')
RATE = re.compile(r'^(\d{1,3}(,\d+)?|\*)$')  # comma-decimal percent, or `*` exclusion
# Origin codes of ND 118/2022 Điều 4 khoản 2, as printed in the exclusion column ("MM, TH, CN").
_CODE = r'(?:BN|KH|ID|LA|MY|MM|PH|SG|TH|CN)'
EXCLUDED = re.compile(rf'^{_CODE}(?:\s*,\s*{_CODE})*$')


def doc_cells(path):
    out = subprocess.run(
        ['textutil', '-stdout', '-convert', 'txt', path],
        capture_output=True, check=True,
    ).stdout.decode('utf-8', 'replace')
    return [t.strip() for t in re.split(r'[\x07\n]', out)]


def part_num(path):
    m = re.search(r'_(\d+)\.doc$', path)
    return int(m.group(1)) if m else 0


def _desc(cells, k, stop):
    """Skip a (possibly multi-cell) description to the first rate cell or `stop` cell."""
    desc, scanned, via_subline = '', 0, False
    while k < len(cells) and scanned < 12 and not RATE.match(cells[k]) and not stop(cells[k]):
        via_subline = via_subline or bool(HS10.match(cells[k]))
        if cells[k] and desc == '':
            desc = cells[k]
        if cells[k]:
            scanned += 1
        k += 1
    return desc, k, via_subline


def _rates(cells, k):
    """Collect consecutive rate cells (1 for ACFTA, 6 for EVFTA/RCEP)."""
    rates, n = [], len(cells)
    while k < n and (cells[k] == '' or RATE.match(cells[k])):
        if RATE.match(cells[k]):
            rates.append(cells[k])
            k += 1
        elif cells[k] == '' and k + 1 < n and RATE.match(cells[k + 1]):
            k += 1  # tolerate a blank cell between rates
        else:
            break
    return rates, k


def _excluded(cells, k, rates):
    """The exclusion cell directly after the rate cells, as sorted unique codes, else None."""
    if rates and k < len(cells) and EXCLUDED.match(cells[k]):
        return sorted(set(re.findall(r'[A-Z]{2}', cells[k])))
    return None


def parse_cells(cells):
    """Pure cell walk: Word table cells in reading order -> HS8 rows."""
    rows, i, n = [], 0, len(cells)
    while i < n:
        c = cells[i]
        if HS8.match(c):
            desc, k, via_subline = _desc(cells, i + 1, HS8.match)
            rates, k = _rates(cells, k)
            row = {'hs': c.replace('.', ''), 'hs_dotted': c, 'desc': desc, 'rates': rates}
            # A rate reached through a 10-digit sub-line is that sub-line's, and so is the
            # exclusion cell after it: handled below, never applied to the whole HS8 line.
            excluded = None if via_subline else _excluded(cells, k, rates)
            if excluded:
                row['excluded'] = excluded
                k += 1
            rows.append(row)
            i = max(k, i + 1)
        else:
            i += 1

    parents = {}
    for r in rows:
        parents.setdefault(r['hs_dotted'], r)  # first occurrence, as the seed keeps it
    subs = {}
    for j, c in enumerate(cells):
        if not HS10.match(c):
            continue
        desc, k, _ = _desc(cells, j + 1, lambda x: HS8.match(x) or HS10.match(x))
        rates, k = _rates(cells, k)
        excluded = _excluded(cells, k, rates)
        if c[:10] not in parents:
            if excluded:
                raise ValueError(f'10-digit line {c} carries an exclusion but its HS8 parent was not parsed')
            continue
        subs.setdefault(c[:10], []).append(
            {'hs10': c.replace('.', ''), 'hs_dotted': c, 'desc': desc, 'rates': rates, 'excluded': excluded or []})
    for hs_dotted, lines in subs.items():
        parent = parents[hs_dotted]
        # The 10-digit lines split the whole 8-digit line (the last is the residual "Loại khác"),
        # so a code EVERY one of them excludes is excluded on the whole line. A lone sub-line
        # cannot show that the split is complete.
        whole = set.intersection(*(set(s['excluded']) for s in lines)) if len(lines) > 1 else set()
        if whole:
            parent['excluded'] = sorted(whole | set(parent.get('excluded', [])))
        excluded_sublines = [s for s in lines if s['excluded']]
        if excluded_sublines:
            parent['excluded_sublines'] = excluded_sublines
    return rows


def parse(doc_dir):
    parts = sorted(glob.glob(os.path.join(doc_dir, '*.doc')) + glob.glob(os.path.join(doc_dir, '*.docx')),
                   key=part_num)
    cells = []
    for p in parts:
        cells.extend(doc_cells(p))
    return parse_cells(cells)


if __name__ == '__main__':
    doc_dir = sys.argv[1]
    rows = parse(doc_dir)
    from collections import Counter
    dist = Counter(len(r['rates']) for r in rows)
    uniq = len({r['hs'] for r in rows})
    print(f'{len(rows)} HS8 rows | {uniq} unique | rate-count distribution: {dict(sorted(dist.items()))}')
    excl = [r for r in rows if r.get('excluded')]
    subs = [s for r in rows for s in r.get('excluded_sublines', [])]
    if excl or subs:
        per = Counter(code for r in excl for code in r['excluded'])
        print(f'excluded origins: {len(excl)} HS8 lines {dict(per.most_common())} | {len(subs)} 10-digit sub-lines')
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
