"""Parse an FTA `.doc` biểu thuế into (hs8, desc, [rate cells]) rows.

FTA schedules are flatter than ND 26/2023: one preferential import biểu and (for
ACFTA) no Chapter 98. A row is `HS8 | mô tả | rate(s)`. Some FTAs carry ONE rate for
the whole 2022–2027 period (ACFTA, AANZFTA); others carry a column per year (ATIGA,
EVFTA → six cells). The caller states the column count (`--cols`); a row or sub-line
with any other number of rate cells fails loudly, and the loader maps the cells to
validity intervals.

Reuses the ND 26 lessons: split on the Word cell mark \x07 (+ newline), scan past
multi-cell descriptions, stop at the next HS8.

10-digit national sub-lines (Điều 3 "chi tiết theo cấp mã 8 số hoặc 10 số"): the
8-digit parent row has NO rate cell; each following `NNNN.NN.NN.NN` row carries its
own rate(s). The parent is emitted with `rates: []` and `sublines` (every sub-line, in
decree order). The lookup unit stays 8-digit; the seed decides per interval whether
the sub-lines share one rate. See ADR 2026-09-13-fta-national-sublines.

ACFTA (ND 118/2022, Điều 3 khoản 5) adds a column "Nước không được hưởng ưu đãi"
after the rate: goods from a listed origin do NOT get the ACFTA rate. It is kept as
`excluded` (sorted ND 118 codes), on the sub-line when the decree prints it there. A
sub-line exclusion never becomes a whole-line one, unless every sub-line of that
parent excludes the same code (then the whole line is excluded).

Only the import tariff is read: EVFTA (ND 116/2022) also prints an EXPORT tariff
(Phụ lục I, "BIỂU THUẾ XUẤT KHẨU") before the import one (Phụ lục II, "BIỂU THUẾ NHẬP
KHẨU"), and an annex heading ("Phụ lục III") ends the table, so stray cells after the
last row are never read. A code repeated inside the import table fails loudly.

    python3 parse_fta.py <doc_dir> --cols 1|6 --emit rows.ndjson
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
EXPORT_TABLE = re.compile(r'^BIỂU THUẾ XUẤT KHẨU')
IMPORT_TABLE = re.compile(r'^BIỂU THUẾ NHẬP KHẨU')
ANNEX = re.compile(r'^Phụ lục [IVXLC]+$')
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


def _code(x):
    return HS8.match(x) or HS10.match(x)


def _desc(cells, k):
    """Skip a (possibly multi-cell) description to the first rate cell or the next code cell; returns (non-empty cells, k)."""
    texts = []
    while k < len(cells) and len(texts) < 12 and not RATE.match(cells[k]) and not _code(cells[k]):
        if cells[k]:
            texts.append(cells[k])
        k += 1
    return texts, k


def _depth(desc):
    """Nomenclature level of a description: the number of leading "- " marks."""
    return len(re.match(r'^(?:- ?)*', desc).group(0).replace(' ', ''))


def _rates(cells, k, ncols):
    """Collect up to `ncols` consecutive rate cells (1 for ACFTA/AANZFTA, 6 for ATIGA/EVFTA)."""
    rates, n = [], len(cells)
    while k < n and len(rates) < ncols and (cells[k] == '' or RATE.match(cells[k])):
        if RATE.match(cells[k]):
            rates.append(cells[k])
            k += 1
        elif cells[k] == '' and k + 1 < n and RATE.match(cells[k + 1]):
            k += 1  # tolerate a blank cell between rates
        else:
            break
    return rates, k


def _line(cells, k, ncols):
    """Description cells, rates and exclusion cell of the code at cells[k-1]; returns (texts, rates, excluded, next k)."""
    code = cells[k - 1]
    texts, k = _desc(cells, k)
    rates, k = _rates(cells, k, ncols)
    excluded = None
    if rates and k < len(cells) and EXCLUDED.match(cells[k]):
        excluded = sorted(set(re.findall(r'[A-Z]{2}', cells[k])))
        k += 1
    # A rate cell beyond `ncols` would shift the vector silently. The only known one is the tail of
    # EVFTA Phụ lục II: eight stray "*" after 9706.90.00, then "Phụ lục III" — tolerated only there.
    j = k
    while j < len(cells) and (cells[j] == '' or RATE.match(cells[j])):
        j += 1
    if rates and any(RATE.match(x) for x in cells[k:j]) and not (j < len(cells) and ANNEX.match(cells[j])):
        raise ValueError(f'{cells[k - len(texts) - len(rates) - 1]}: rate cells beyond the schedule\'s {ncols}: {cells[k:j]}')
    return texts, rates, excluded, k


def parse_cells(cells, ncols):
    """Pure cell walk: Word table cells in reading order -> HS8 rows of the import table(s)."""
    rows, seen, i, n, reading = [], set(), 0, len(cells), True
    while i < n:
        c = cells[i]
        if IMPORT_TABLE.match(c) or EXPORT_TABLE.match(c) or ANNEX.match(c):
            reading = bool(IMPORT_TABLE.match(c))  # an export table or the next annex is not read
        if not reading or not _code(c):
            i += 1
            continue
        if HS10.match(c):
            raise ValueError(f'10-digit line {c} does not follow its 8-digit parent')
        if c in seen:
            raise ValueError(f'{c} is repeated in the import table')
        seen.add(c)
        texts, rates, excluded, k = _line(cells, i + 1, ncols)
        row = {'hs': c.replace('.', ''), 'hs_dotted': c, 'desc': texts[0] if texts else '', 'rates': rates}
        if excluded:
            row['excluded'] = excluded
        # An unnumbered heading may group sub-lines (EVFTA 4011.70.00 "- - Loại khác:"): it prefixes the
        # description of the deeper sub-lines under it, so two "- - - Loại khác" stay distinguishable.
        lead = texts[1] if len(texts) == 2 and texts[1].startswith('- ') else None  # heading before the first sub-line
        sublines, heading = [], lead
        while not rates:
            j = k
            while j < n and (cells[j] == '' or cells[j].startswith('- ')):
                heading = cells[j] or heading
                j += 1
            if j == n or not (HS10.match(cells[j]) and cells[j].startswith(c + '.')):
                break
            stexts, srates, sexcluded, k = _line(cells, j + 1, ncols)
            sdesc = stexts[0] if stexts else ''
            if heading and _depth(sdesc) > _depth(heading):
                sdesc = f'{heading} {sdesc}'
            sublines.append({'hs10': cells[j].replace('.', ''), 'hs_dotted': cells[j], 'desc': sdesc,
                             'rates': srates, 'excluded': sexcluded or []})
        if sublines and len(texts) > (2 if lead else 1):
            raise ValueError(f'{c}: unexpected text before its first sub-line: {texts[1:]}')
        if sublines:
            # The 10-digit lines split the whole 8-digit line (the last is the residual "Loại khác"),
            # so a code EVERY one of them excludes is excluded on the whole line. A lone sub-line
            # cannot show that the split is complete.
            whole = set.intersection(*(set(s['excluded']) for s in sublines)) if len(sublines) > 1 else set()
            if whole:
                row['excluded'] = sorted(whole)
            row['sublines'] = sublines
        for line in sublines or [row]:
            if len(line['rates']) != ncols:
                raise ValueError(f"{line['hs_dotted']} has {len(line['rates'])} rate cells, the schedule has {ncols}")
        rows.append(row)
        i = max(k, i + 1)
    return rows


def parse(doc_dir, ncols):
    parts = sorted(glob.glob(os.path.join(doc_dir, '*.doc')) + glob.glob(os.path.join(doc_dir, '*.docx')),
                   key=part_num)
    cells = []
    for p in parts:
        cells.extend(doc_cells(p))
    return parse_cells(cells, ncols)


if __name__ == '__main__':
    doc_dir = sys.argv[1]
    rows = parse(doc_dir, int(sys.argv[sys.argv.index('--cols') + 1]))
    from collections import Counter
    dist = Counter(len(r['rates']) for r in rows)
    uniq = len({r['hs'] for r in rows})
    print(f'{len(rows)} HS8 rows | {uniq} unique | rate-count distribution: {dict(sorted(dist.items()))}')
    parents = [r for r in rows if r.get('sublines')]
    print(f'10-digit sub-lines: {sum(len(r["sublines"]) for r in parents)} on {len(parents)} parents')
    excl = [r for r in rows if r.get('excluded')]
    subs = [s for r in parents for s in r['sublines'] if s['excluded']]
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
