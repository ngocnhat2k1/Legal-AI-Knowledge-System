"""Parse a Công báo tariff `.doc` into (hs_code, [rates]) rows — TASK-003 proof.

FINDING (2026-07-18)
--------------------
The EVFTA "six concatenated rates" problem was a FALSE ALARM. Earlier research
saw `2101.11.11 | ... | 2925,421,818,114,510,9` and concluded the six annual
rates (29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9) were mashed together with no
separator and thus unrecoverable.

They are NOT mashed. `textutil -convert txt` (macOS, built-in) preserves the
Word table cell boundaries — the six rates are delimited by the Word cell mark
`\x07` (BEL), a NON-PRINTING control character. Rendered without it,
`29\x0725,4\x0721,8...` looks like `2925,421,818,...`. The research simply
didn't see the delimiter.

Splitting on the real cell mark recovers the six cells. This is NOT the
forbidden "guess where the numbers split" heuristic — it reads the actual
delimiter the tool emits. LibreOffice / python-docx `w:tbl` is NOT required.

The cell delimiter differs by document:
  - EVFTA (ND 116/2022): cells separated by `\x07`.
  - RCEP  (ND 129/2022): each cell on its own line (`\n`).
Split on either.

ACCEPTANCE (verified 2026-07-18, see README.md):
  - EVFTA 2101.11.11 -> ['29','25,4','21,8','18,1','14,5','10,9']  (773/773 rows = 6 cols)
  - RCEP  0101.21.00 -> ['0','0','0','0','0','0']                 (1309/1324 = 6 cols; 9 rows carry '*')

CAVEAT for the production loader (TASK-008): `\n` is a weaker delimiter than
`\x07` (prose contains newlines too). Do NOT trust blindly — validate that
every rate row has the expected column width and FLAG the exceptions (here:
15 zero-rate rows + 9 '*' exclusion rows in RCEP) instead of silently accepting
them. The column-width distribution below IS that validation.
"""
import re
import subprocess

HS8 = re.compile(r'^\d{4}\.\d{2}\.\d{2}$')
RATE = re.compile(r'^(\d{1,3}(,\d+)?|\*)$')  # comma-decimal percent, or '*' = excluded good


def doc_to_cells(path):
    """`.doc` -> flat list of table cell strings, via textutil + Word cell marks."""
    out = subprocess.run(
        ['textutil', '-stdout', '-convert', 'txt', path],
        capture_output=True, check=True,
    ).stdout.decode('utf-8', 'replace')
    return [t.strip() for t in re.split(r'[\x07\n]', out)]


def parse_tariff_doc(path):
    """Return [(hs8, [rate, ...]), ...] for every 8-digit HS line in the doc."""
    toks = doc_to_cells(path)
    rows, i = [], 0
    while i < len(toks):
        if HS8.match(toks[i]):
            rates, j = [], i + 2  # toks[i+1] is the Vietnamese description
            while j < len(toks) and RATE.match(toks[j]):
                rates.append(toks[j])
                j += 1
            rows.append((toks[i], rates))
            i = j
        else:
            i += 1
    return rows


if __name__ == '__main__':
    import sys
    from collections import Counter
    for path in sys.argv[1:]:
        rows = parse_tariff_doc(path)
        dist = dict(sorted(Counter(len(r) for _, r in rows).items()))
        stars = sum(1 for _, r in rows if '*' in r)
        print(f"{path}\n  {len(rows)} HS rows | rate-column width distribution: {dist} | rows with '*': {stars}")
