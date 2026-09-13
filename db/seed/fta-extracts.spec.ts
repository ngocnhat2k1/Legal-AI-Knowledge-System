/**
 * Regression gate for the four FTA extracts (db/seed/data/fta-*.ndjson). No database needed.
 *
 * FTA decrees detail some 8-digit codes into 10-digit national sub-lines; the 8-digit parent row
 * has no rate cell of its own (ADR 2026-09-13-fta-national-sublines). ND 118/2022 (ACFTA) adds a
 * per-line column "Nước không được hưởng ưu đãi". ND 116/2022 (EVFTA) prints its export tariff
 * (Phụ lục I) before the import one (Phụ lục II). Re-extracting for all of that must not move any
 * other rate: every line is compared with the extract at BASELINE.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface SubLine { hs10: string; hs_dotted: string; desc: string; rates: string[]; excluded: string[] }
interface Row { hs: string; hs_dotted: string; desc: string; rates: string[]; excluded?: string[]; sublines?: SubLine[] }

const ROOT = join(__dirname, '..', '..');
/** Last commit whose extracts predate sub-lines: parents took their first sub-line's rate, EVFTA held Phụ lục I rows too. */
const BASELINE = '19b6222';
const ND118_CODES = ['BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'CN']; // ND 118/2022 Điều 4 khoản 2
/** Measured on the complete decrees (2026-09-13): rate columns, 10-digit sub-lines, parents. */
const FTAS = [
  { key: 'acfta', cols: 1, sublines: 74, parents: 34 },
  { key: 'aanzfta', cols: 1, sublines: 16, parents: 8 },
  { key: 'atiga', cols: 6, sublines: 0, parents: 0 },
  { key: 'evfta', cols: 6, sublines: 122, parents: 58 },
];
const parse = (text: string): Row[] => text.trim().split('\n').map((l) => JSON.parse(l) as Row);
const extract = (key: string) => parse(readFileSync(join(__dirname, 'data', `fta-${key}.ndjson`), 'utf8'));

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
let inGitRepo = true;
try {
  git('rev-parse', '--is-inside-work-tree');
} catch {
  inGitRepo = false; // e.g. a container build without .git — the invariants below still run
}

const validCodes = (codes: string[] | undefined) =>
  !!codes && codes.length > 0 && codes.every((c) => ND118_CODES.includes(c)) && codes.join() === [...new Set(codes)].sort().join();

describe.each(FTAS)('$key extract', ({ key, cols, sublines, parents }) => {
  const rows = extract(key);

  test('has one row per code and exactly the schedule\'s rate columns on every line', () => {
    expect(rows.length).toBe(11414);
    expect(new Set(rows.map((r) => r.hs)).size).toBe(rows.length);
    const bad = rows.filter((r) =>
      r.sublines
        ? r.rates.length !== 0 ||
          r.sublines.some((s) => s.rates.length !== cols || s.hs10 !== s.hs_dotted.replace(/\./g, '') || !s.hs_dotted.startsWith(r.hs_dotted + '.'))
        : r.rates.length !== cols,
    );
    expect(bad.map((r) => r.hs_dotted)).toEqual([]);
    expect([rows.flatMap((r) => r.sublines ?? []).length, rows.filter((r) => r.sublines).length]).toEqual([sublines, parents]);
  });

  test('carries only the known fields; per-origin exclusions only in ACFTA, as valid sorted ND 118 codes', () => {
    const rowKeys = ['hs', 'hs_dotted', 'desc', 'rates', 'excluded', 'sublines'];
    const bad = rows.filter(
      (r) =>
        Object.keys(r).some((k) => !rowKeys.includes(k)) ||
        (r.excluded !== undefined && (key !== 'acfta' || !validCodes(r.excluded))) ||
        (r.sublines ?? []).some(
          (s) => Object.keys(s).join() !== 'hs10,hs_dotted,desc,rates,excluded' || (s.excluded.length > 0 && (key !== 'acfta' || !validCodes(s.excluded))),
        ),
    );
    expect(bad.map((r) => r.hs_dotted)).toEqual([]);
  });

  // Skipped only outside a git work tree. Inside one, a missing baseline (shallow clone,
  // rewritten history) fails here: this is the test that proves no other rate moved.
  (inGitRepo ? test : test.skip)(`moves no rate against ${BASELINE} except sub-line parents, EVFTA export rows and 9706.90.00`, () => {
    const base = parse(git('show', `${BASELINE}:db/seed/data/fta-${key}.ndjson`));
    const last = new Map(base.map((r) => [r.hs, r])); // a repeated code keeps its LAST row: EVFTA's Phụ lục II
    expect(base.length - last.size).toBe(key === 'evfta' ? 553 : 0);
    expect(new Set(rows.map((r) => r.hs))).toEqual(new Set(last.keys()));
    const diffs = rows
      .filter((r) => {
        const b = last.get(r.hs)!;
        if (r.sublines) {
          // The baseline parent took its first sub-line's rate cells; code, description and whole-line
          // exclusion stay, and every sub-line exclusion it held (ACFTA `excluded_sublines`) is still on
          // the same sub-line, with the same description and rate.
          const bySub = new Map(r.sublines.map((s) => [s.hs10, JSON.stringify(s)]));
          const baseSubs = (b as Row & { excluded_sublines?: SubLine[] }).excluded_sublines ?? [];
          return (
            JSON.stringify([r.hs_dotted, r.desc, r.sublines[0]!.rates, r.excluded]) !== JSON.stringify([b.hs_dotted, b.desc, b.rates, b.excluded]) ||
            baseSubs.some((s) => bySub.get(s.hs10) !== JSON.stringify(s))
          );
        }
        // 9706.90.00: eight stray "*" cells after the last EVFTA row were read as rates.
        const expected = key === 'evfta' && r.hs === '97069000' ? { ...b, rates: b.rates.slice(0, 6) } : b;
        return JSON.stringify(r) !== JSON.stringify(expected);
      })
      .map((r) => r.hs_dotted);
    expect(diffs).toEqual([]);
  });
});

describe('FTA extracts match the decrees on known lines', () => {
  const by = (key: string) => new Map(extract(key).map((r) => [r.hs_dotted, r]));

  test('ACFTA (ND 118/2022): exclusion column, sub-lines and their exclusions', () => {
    const rows = extract('acfta');
    const acfta = by('acfta');
    expect(acfta.get('0901.11.20')).toEqual({ hs: '09011120', hs_dotted: '0901.11.20', desc: '- - - Arabica', rates: ['0'], excluded: ['CN', 'MM', 'TH'] });
    // The parent has no rate of its own; its sub-lines differ (0 excluding KH, and 5).
    expect(acfta.get('1601.00.10')).toEqual({
      hs: '16010010', hs_dotted: '1601.00.10', desc: '- Đóng bao bì kín khí để bán lẻ:', rates: [],
      sublines: [
        { hs10: '1601001010', hs_dotted: '1601.00.10.10', desc: '- - Từ côn trùng', rates: ['0'], excluded: ['KH'] },
        { hs10: '1601001090', hs_dotted: '1601.00.10.90', desc: '- - Loại khác', rates: ['5'], excluded: [] },
      ],
    });
    // A sub-line exclusion stays on the sub-line, never on the whole HS8 line...
    expect(acfta.get('1211.60.00')?.excluded).toBeUndefined();
    expect(acfta.get('1211.60.00')?.sublines?.map((s) => s.excluded)).toEqual([['MM', 'TH'], [], []]);
    // ...unless every sub-line excludes it: ID on 4011.80.31 (MY only on .10).
    expect(acfta.get('4011.80.31')?.excluded).toEqual(['ID']);
    expect(acfta.get('4011.80.31')?.sublines?.map((s) => s.excluded)).toEqual([['ID', 'MY'], ['ID']]);

    expect(rows.filter((r) => r.excluded).length).toBe(3154);
    expect(rows.filter((r) => r.excluded?.includes('CN')).length).toBe(509);
    expect(rows.flatMap((r) => r.sublines ?? []).filter((s) => s.excluded.length).length).toBe(34);
  });

  test('AANZFTA (ND 121/2022): sub-lines without an exclusion column', () => {
    expect(by('aanzfta').get('0307.22.00')?.sublines?.map((s) => [s.hs_dotted, s.rates])).toEqual([
      ['0307.22.00.10', ['0']],
      ['0307.22.00.90', ['5']],
    ]);
  });

  test('EVFTA (ND 116/2022): import Phụ lục II only, yearly sub-lines, table end', () => {
    const evfta = by('evfta');
    // Phụ lục II import row, not the Phụ lục I export row [0,0,0,0,0,0] the seed used to keep.
    expect(evfta.get('1211.20.90')?.rates).toEqual(['25', '20', '15', '10', '5', '0']);
    expect(evfta.get('8481.80.99')?.rates).toEqual(['5', '3,3', '1,6', '0', '0', '0']);
    expect(evfta.get('9706.90.00')?.rates).toEqual(['0', '0', '0', '0', '0', '0']);
    expect(evfta.get('1508.90.00')?.sublines?.map((s) => s.rates)).toEqual([
      ['3,6', '3,1', '2,7', '2,2', '1,8', '1,3'],
      ['18,1', '15,9', '13,6', '11,3', '9', '6,8'],
    ]);
    // Unnumbered headings group 4011.70.00's sub-lines; they prefix the descriptions under them.
    expect(evfta.get('4011.70.00')?.sublines?.map((s) => [s.hs_dotted, s.desc.split(': ')[0]])).toEqual([
      ['4011.70.00.11', '- - Loại có hoa lốp hình chữ chi hoặc tương tự'],
      ['4011.70.00.19', '- - Loại có hoa lốp hình chữ chi hoặc tương tự'],
      ['4011.70.00.91', '- - Loại khác'],
      ['4011.70.00.99', '- - Loại khác'],
    ]);
  });
});
