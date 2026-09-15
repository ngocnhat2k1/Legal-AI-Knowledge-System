import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildEvidence } from '../../../../../db/seed/evidence-build';
import { quoteInBody } from './guards';
import {
  APPLIES_WHEN,
  POLICY_LISTS,
  anchorMatches,
  hsEntries,
  lineCodes,
  listRows,
  policyStatus,
  sheetOf,
  type PolicyList,
} from './policy';
import type { EvidenceRow } from './types';

const AS_OF = '2026-09-14';
const DIR = join(process.cwd(), 'db/seed/data/legal');
const ndjson = (file: string): Array<Record<string, any>> =>
  readFileSync(join(DIR, file), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

const list = (over: Partial<PolicyList> & Pick<PolicyList, 'id'>): PolicyList => ({
  instrument: '36/2026/TT-BKHCN',
  annex_anchor: 'Phụ lục I',
  ministry: 'Bộ Khoa học và Công nghệ',
  subject: 'Hàng hóa rủi ro cao',
  authority: 'binding',
  effective_from: '2026-07-01',
  effective_to: null,
  validity_verified: true,
  loaded: { kind: 'annex_table', document_number: '36/2026/TT-BKHCN', source_hint: 'test' },
  granularity: [6, 8],
  exact_only: false,
  qualifier_heavy: false,
  applies_when: null,
  note: '',
  ...over,
});

const row = (id: number, body: string, meta: Record<string, unknown> = {}, title = `row ${id}`, kind = 'annex_table'): EvidenceRow => ({
  id,
  kind,
  authority: 'binding',
  title,
  body,
  window: 'current',
  meta: { document_number: '36/2026/TT-BKHCN', anchor: 'Phụ lục I', ...meta },
});

const PL1_BODY = [
  '36/2026/TT-BKHCN — Bảng 3 (sau: Phụ lục I)',
  'STT | Tên sản phẩm, hàng hóa | Quy chuẩn kỹ thuật | Mã số HS (Thông tư số 31/2022/TT-BTC) | Mô tả sản phẩm, hàng hóa',
  '1.1 | Xăng không chì | QCVN 1:2022/BKHCN | 2710.12.21 2710.12.23 | Xăng không chì',
  'a) | Urani tự nhiên và các hợp chất của nó | QCVN 5:2010/BKHCN | 2844.10.10 | Uranium tự nhiên dưới dạng kim loại, hợp chất hóa học và bất kỳ vật liệu nào khác có chứa một hoặc nhiều chất nêu trên | Thực hiện các biện pháp quản lý theo quy định của pháp luật về năng lượng nguyên tử',
  '1.2.4 | Nguyên tố phóng xạ và các hợp chất trừ loại thuộc phân nhóm 2844.10, 2844.20 hoặc 2844.30',
  '2 | Mũ bảo hiểm cho người đi mô tô, xe máy | QCVN 2:2021/BKHCN | 6506.10.10 | Mũ bảo hiểm cho người đi mô tô, xe máy',
  ' | Thiết bị xử lý nhiên liệu hạt nhân đã chiếu xạ |  | 7310.29 8421.29 | Thiết bị thiết kế đặc biệt cho mục đích đó.',
].join('\n');

const one = (registry: PolicyList[], rows: EvidenceRow[], code: string, asOf = AS_OF) => {
  const out = policyStatus(registry, rows, code, asOf);
  expect(out).toHaveLength(1);
  return out[0]!;
};

describe('lineCodes, anchorMatches, sheetOf', () => {
  it.each<[string, string[]]>([
    ['7223.00. 90', ['72230090']], // TT 36/2026 PL II typo, read as typed
    ['a | Thiết bị dùng để sấy gỗ | 84.19.32 | 15', ['841932']], // QĐ 18/2019 dd.dd.dd
    ['a | Máy và thiết bị cơ khí | 84.39 84.40 84.41 | 20', ['8439', '8440', '8441']],
    ['Hiệu lực | 01.01.2027', []], // a date is not a code
    [' | 8507 | 10 |  | Bằng axit-chì (đã qua sử dụng)', ['850710']],
    [' | 2404 | 11 | 00 | - - Chứa lá thuốc lá', ['24041100']],
    ['Chương 70 | 7001 | 00 | Thủy tinh vụn', ['70010000']], // merged "00 | 00" printed once
    ['1.2.4 | Nguyên tố phóng xạ trừ loại thuộc phân nhóm 2844.10, 2844.20', []], // prose mention
    ['8443.31.11', ['84433111']],
  ])('lineCodes(%j)', (line, codes) => {
    expect(lineCodes(line)).toEqual(codes);
  });

  it('anchors match on a word boundary; sheet names come from the notebook title', () => {
    expect(anchorMatches('Phụ lục II', 'Phụ lục I')).toBe(false);
    expect(anchorMatches('Phụ lục IV', 'Phụ lục I')).toBe(false);
    expect(anchorMatches('PHỤ LỤC  I. Danh mục', 'Phụ lục I')).toBe(true);
    expect(sheetOf('xlsx-danh-muc-rr-noi-bo — Danh mục từ 01/07/2026 (PL TT33.20.BCT-RR TB, cửa sổ 2/19)')).toBe('PL TT33.20.BCT-RR TB');
    expect(sheetOf('xlsx-danh-muc-rr-noi-bo — Danh mục (PLII TT41.26.BXD-RR cao)')).toBe('PLII TT41.26.BXD-RR cao');
    expect(sheetOf('1725/QĐ-BCT — Về việc ban hành Danh mục (cửa sổ 1/4)')).toBeNull();
  });
});

describe('policyStatus — list membership decided by code (R3, R10, R12)', () => {
  const pl1 = list({ id: 'pl1' });

  it('exact hit: LISTED, the quote is only the line naming the code, verbatim', () => {
    const r = one([pl1], [row(7, PL1_BODY)], '6506.10.10');
    expect(r).toMatchObject({ listId: 'pl1', status: 'LISTED', match: 'exact', rowId: 7, annex: 'Phụ lục I' });
    expect(r.quote).toBe('2 | Mũ bảo hiểm cho người đi mô tô, xe máy | QCVN 2:2021/BKHCN | 6506.10.10 | Mũ bảo hiểm cho người đi mô tô, xe máy');
    expect(quoteInBody(r.quote!, PL1_BODY)).toBe(true);
    expect(one([pl1], [row(7, PL1_BODY)], '27101223')).toMatchObject({ status: 'LISTED', match: 'exact' }); // undotted spelling
  });

  it('parent-entry hit: match parent; a qualifier-heavy list makes it UNCERTAIN, still quoted', () => {
    expect(one([pl1], [row(7, PL1_BODY)], '8421.29.90')).toMatchObject({ status: 'LISTED', match: 'parent', rowId: 7 });
    const heavy = one([{ ...pl1, qualifier_heavy: true }], [row(7, PL1_BODY)], '8421.29.90');
    expect(heavy).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'parent' });
    expect(heavy.quote).toContain('7310.29 8421.29');
  });

  it('a heading-level entry asked as itself is UNCERTAIN in a qualifier-heavy list, like a parent hit', () => {
    const heavy = { ...pl1, qualifier_heavy: true };
    expect(one([heavy], [row(7, PL1_BODY)], '8421.29')).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'exact' });
    expect(one([heavy], [row(7, PL1_BODY)], '6506.10.10')).toMatchObject({ status: 'LISTED', match: 'exact' });
  });

  it('child hit for a heading question', () => {
    expect(one([pl1], [row(7, PL1_BODY)], '65.06')).toMatchObject({ status: 'LISTED', match: 'child', rowId: 7 });
  });

  it('a code named in prose ("trừ loại thuộc phân nhóm 2844.10") is a mention, not an entry', () => {
    const uranium = one([pl1], [row(7, PL1_BODY)], '2844.10.10');
    expect(uranium).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(uranium.quote!.startsWith('a) | Urani tự nhiên')).toBe(true);
    expect(one([pl1], [row(7, PL1_BODY)], '2844.20.00')).toMatchObject({ status: 'NOT_LISTED', quote: null, rowId: null });
  });

  it('split-cell codes are rebuilt and the quote is the row that names them', () => {
    const pl5 = list({
      id: 'pl5', instrument: '292/2026/NĐ-CP', annex_anchor: 'Phụ lục V', granularity: [4, 6, 8], qualifier_heavy: true,
      loaded: { kind: 'annex_table', document_number: '292/2026/NĐ-CP', source_hint: 'test' }, uncertain_prefixes: ['28', '29'],
    });
    const body = [
      '292/2026/NĐ-CP — Bảng 11 (sau: Phụ lục V)',
      'Mã hàng | Mô tả mặt hàng',
      'Chương 24 | 2404 |  | Sản phẩm chứa lá thuốc lá',
      ' | 2404 | 11 | 00 | - - Chứa lá thuốc lá hoặc thuốc lá hoàn nguyên',
      'Chương 28 Chương 29 |  | Các mặt hàng hóa chất thuộc Danh mục hóa chất bảng 1 và bảng 2',
      'Chương 70 | 7001 | 00 | Thủy tinh vụn và thủy tinh phế liệu',
      'Chương 85 | 8507 |  | Ắc quy điện',
      ' | 8507 | 10 |  | Bằng axit-chì, loại dùng để khởi động động cơ piston (đã qua sử dụng)',
    ].join('\n');
    const rows = [row(3, body, { document_number: '292/2026/NĐ-CP', anchor: 'Phụ lục V' })];
    const tobacco = one([pl5], rows, '2404.11.00');
    expect(tobacco).toMatchObject({ status: 'LISTED', match: 'exact', rowId: 3 });
    expect(tobacco.quote).toBe('2404 | 11 | 00 | - - Chứa lá thuốc lá hoặc thuốc lá hoàn nguyên');
    expect(quoteInBody(tobacco.quote!, body)).toBe(true);
    expect(one([pl5], rows, '7001.00.00')).toMatchObject({ status: 'LISTED', match: 'exact' });
    const battery = one([pl5], rows, '8507.10.10');
    expect(battery).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'parent' });
    expect(battery.quote).toContain('(đã qua sử dụng)'); // the most specific parent, not the 8507 heading
    expect(one([pl5], rows, '85.07')).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'exact' });
    expect(one([pl5], rows, '2804.10.00')).toMatchObject({ status: 'UNCERTAIN', reason: 'words_only', quote: null });
  });

  it('NOT_LISTED only for a loaded, binding, verified list fine enough for the code', () => {
    expect(one([pl1], [row(7, PL1_BODY)], '8462.90.90')).toEqual({
      listId: 'pl1', status: 'NOT_LISTED', instrument: '36/2026/TT-BKHCN', annex: 'Phụ lục I', quote: null, rowId: null,
    });
  });

  it('UNCERTAIN when validity is unverified, even with no match', () => {
    expect(one([list({ id: 'v', validity_verified: false })], [row(7, PL1_BODY)], '8462.90.90')).toMatchObject({
      status: 'UNCERTAIN', reason: 'validity_unverified', quote: null,
    });
  });

  it('UNCERTAIN when the question is coarser than the list (an 8-digit list cannot decide a heading)', () => {
    expect(one([list({ id: 'g', granularity: [8] })], [row(7, PL1_BODY)], '84.62')).toMatchObject({ status: 'UNCERTAIN', reason: 'granularity' });
  });

  it('an entry at a length the registry does not expect is UNCERTAIN, never skipped into NOT_LISTED', () => {
    expect(one([list({ id: 'g', granularity: [8] })], [row(7, PL1_BODY)], '8421.29.90')).toMatchObject({
      status: 'UNCERTAIN', reason: 'granularity', match: 'parent',
    });
  });

  it('a list not keyed by HS code decides nothing by code', () => {
    const byt = list({ id: 'byt', granularity: [] });
    expect(one([byt], [row(7, PL1_BODY)], '6506.10.10')).toMatchObject({ status: 'UNCERTAIN', reason: 'not_hs_keyed' });
    expect(one([byt], [row(7, PL1_BODY)], '8462.90.90')).toMatchObject({ status: 'UNCERTAIN', reason: 'not_hs_keyed' });
  });

  it('a listing that starts after asOf is UNCERTAIN with its start day, then LISTED from that day', () => {
    const later = list({ id: 'later', deferred: [{ codes: ['6506.10.10'], from: '2027-01-01', basis: 'test' }] });
    expect(one([later], [row(7, PL1_BODY)], '6506.10.10')).toMatchObject({
      status: 'UNCERTAIN', reason: 'not_yet_applicable', appliesFrom: '2027-01-01', match: 'exact',
    });
    expect(one([later], [row(7, PL1_BODY)], '6506.10.10', '2027-01-01')).toMatchObject({ status: 'LISTED' });
    expect(one([later], [row(7, PL1_BODY)], '65.06')).toMatchObject({ status: 'UNCERTAIN', reason: 'not_yet_applicable', match: 'child' });
  });

  it('a code cell no query matches as printed keeps codes under its prefix UNCERTAIN, never NOT_LISTED (R1: not corrected)', () => {
    const tt33 = list({ id: 'tt33', granularity: [6, 8], unreadable: [{ raw: '404.29.90', prefix: '9404.29', basis: 'test' }] });
    const rows = [row(7, `${PL1_BODY}\n2.6 | Đệm |  | 9404.29.10 9404.29.20 404.29.90 9404.30.00 | Khung đệm`)];
    expect(one([tt33], rows, '9404.29.90')).toMatchObject({ status: 'UNCERTAIN', reason: 'unreadable', quote: null });
    expect(one([tt33], rows, '9404.29.20')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(one([tt33], rows, '9405.10.00')).toMatchObject({ status: 'NOT_LISTED' });
  });

  it('a table line of codes alone, or too short to verify, quotes back to the line above that names goods', () => {
    const body = [
      '36/2026/TT-BKHCN — Bảng 3 (sau: Phụ lục I)',
      'STT | Tên sản phẩm, hàng hóa | Mã số HS',
      '1.1 | Xăng không chì | QCVN 1:2022/BKHCN | 2710.12.21 | Xăng không chì',
      ' | 2710.12.23 | ',
      ' | 2710.12.24 | ',
      ' | Ngô | 10.05 | ',
    ].join('\n');
    const pl = list({ id: 'pl', granularity: [4, 8] });
    const merged = one([pl], [row(7, body)], '2710.12.24');
    expect(merged).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(merged.quote).toBe('1.1 | Xăng không chì | QCVN 1:2022/BKHCN | 2710.12.21 | Xăng không chì\n | 2710.12.23 | \n | 2710.12.24');
    expect(quoteInBody(merged.quote!, body)).toBe(true);
    const short = one([pl], [row(7, body)], '10.05').quote!;
    expect(short.endsWith(' | Ngô | 10.05')).toBe(true);
    expect(quoteInBody(short, body)).toBe(true);
  });

  it('NOT_LISTED needs rows fetched by hsEntries: stale hs_codes or a statute row with no number make it UNCERTAIN', () => {
    const stale = row(7, PL1_BODY, { hs_codes: ['2710.12.21', '2710.12.23', '2844.10.10', '6506.10.10'] }); // 6-digit parents dropped
    expect(one([pl1], [stale], '8462.90.90')).toMatchObject({ status: 'UNCERTAIN', reason: 'coverage' });
    expect(one([pl1], [row(7, PL1_BODY, { hs_codes: hsEntries(PL1_BODY) })], '8462.90.90')).toMatchObject({ status: 'NOT_LISTED' });

    const tt11 = list({
      id: 'tt11', instrument: '11/2024/TT-BTTTT', annex_anchor: null, exact_only: true, granularity: [8],
      loaded: { kind: 'provision', document_number: '11/2024/TT-BTTTT', source_hint: 'test' },
    });
    const orphan = row(4, '8443.31.11\n- - - Máy in-copy', { document_number: undefined }, 'Điều 2 Thông tư 11/2024/TT-BTTTT', 'provision');
    expect(one([tt11], [orphan], '8443.31.11')).toMatchObject({ status: 'UNCERTAIN', reason: 'coverage', quote: null });
  });

  it('NOT_LOADED when the list is not in the corpus, whatever the rows say', () => {
    expect(one([list({ id: 'nl', loaded: null })], [row(7, PL1_BODY)], '6506.10.10')).toEqual({
      listId: 'nl', status: 'NOT_LOADED', instrument: '36/2026/TT-BKHCN', annex: 'Phụ lục I', quote: null, rowId: null,
    });
  });

  it('an internal sheet gives UNCERTAIN on a hit, pointing at the circular it copies, and nothing on a miss', () => {
    const vvmv = list({
      id: 'vvmv', instrument: 'Bảng tổng hợp nội bộ', annex_anchor: 'TT33.20.BCT', authority: 'reference', validity_verified: false,
      granularity: [8], copy_of: 'tt33', loaded: { kind: 'internal', document_number: 'xlsx-danh-muc-rr-noi-bo', source_hint: 'test' },
    });
    const sheet = (id: number, name: string, body: string) =>
      row(id, body, { document_number: null, anchor: null }, `xlsx-danh-muc-rr-noi-bo — Danh mục (${name}, cửa sổ 1/2)`, 'internal');
    const rows = [
      sheet(9, 'PL TT33.20.BCT-RR TB', 'xlsx-danh-muc-rr-noi-bo — Danh mục\n |  | 6116.10.90 |  |'),
      sheet(10, 'PLII TT36.26.BKHCN-RR TB', 'xlsx-danh-muc-rr-noi-bo — Danh mục\n2 | Mũ bảo hiểm | QCVN 2:2021/BKHCN | 6506.10.10 | Mũ'),
    ];
    expect(one([vvmv], rows, '6116.10.90')).toMatchObject({ status: 'UNCERTAIN', reason: 'internal', match: 'exact', rowId: 9, copyOf: 'tt33' });
    expect(policyStatus([vvmv], rows, '6506.10.10', AS_OF)).toEqual([]); // another sheet of the same workbook
  });

  it('a list not yet in force or already ended on asOf is omitted; the last day counts whatever the time', () => {
    const later = list({ id: 'later', effective_from: '2026-10-15' });
    const ended = list({ id: 'ended', effective_from: '2019-06-15', effective_to: '2026-09-04' });
    expect(policyStatus([later, ended], [row(7, PL1_BODY)], '6506.10.10', AS_OF)).toEqual([]);
    expect(policyStatus([later], [row(7, PL1_BODY)], '6506.10.10', '2026-10-15')).toHaveLength(1);
    const lastDay = list({ id: 'last', effective_to: AS_OF });
    expect(policyStatus([lastDay], [row(7, PL1_BODY)], '6506.10.10', `${AS_OF}T08:00:00+07:00`)).toHaveLength(1);
    expect(policyStatus([lastDay], [row(7, PL1_BODY)], '6506.10.10', '2026-09-15')).toEqual([]);
  });

  it('passes applies_when through for the caller to drop', () => {
    const used = list({ id: 'used', loaded: null, applies_when: 'hang_da_qua_su_dung' });
    expect(one([used], [], '8462.10.10')).toMatchObject({ status: 'NOT_LOADED', appliesWhen: 'hang_da_qua_su_dung' });
    expect(one([pl1], [], '8462.10.10')).not.toHaveProperty('appliesWhen');
  });

  it('anchor matching keeps PL I and PL II of the same document apart', () => {
    const pl2 = list({ id: 'pl2', annex_anchor: 'Phụ lục II', granularity: [8] });
    const rows = [row(7, PL1_BODY), row(8, '36/2026/TT-BKHCN — Bảng 4\n7.3 | Đèn LED | QCVN 19:2019/BKHCN | 9405.11.91 | Đèn', { anchor: 'Phụ lục II' })];
    expect(policyStatus([pl1, pl2], rows, '9405.11.91', AS_OF)).toMatchObject([
      { listId: 'pl1', status: 'NOT_LISTED' },
      { listId: 'pl2', status: 'LISTED', rowId: 8 },
    ]);
  });

  it('an exact-only list never matches a parent line; a bare code line quotes its description lines too', () => {
    const tt11 = list({
      id: 'tt11', instrument: '11/2024/TT-BTTTT', annex_anchor: null, exact_only: true, granularity: [8],
      loaded: { kind: 'provision', document_number: '11/2024/TT-BTTTT', source_hint: 'test' },
    });
    const body = 'DANH MỤC\n84.43\nMáy in\n8443.31\n- - Máy kết hợp hai hoặc nhiều chức năng\n8443.31.11\n- - - Máy in-copy, in bằng công nghệ in phun\nMáy in phun có chức năng photocopy đa màu\n- - - Máy in-copy, in bằng công nghệ laser\n8443.31.21';
    const rows = [row(4, body, { document_number: '11/2024/TT-BTTTT', anchor: 'Điểm a Khoản 2 Điều 2 Thông tư 11/2024/TT-BTTTT' }, 'Điểm a', 'provision')];
    expect(one([tt11], rows, '8443.31.99')).toMatchObject({ status: 'NOT_LISTED' });
    expect(one([tt11], rows, '8443.31')).toMatchObject({ status: 'LISTED', match: 'child' }); // "8443.31" is nomenclature here
    const hit = one([tt11], rows, '8443.31.11');
    expect(hit).toMatchObject({
      status: 'LISTED', match: 'exact', quote: '8443.31.11\n- - - Máy in-copy, in bằng công nghệ in phun\nMáy in phun có chức năng photocopy đa màu',
    });
    expect(quoteInBody(hit.quote!, body)).toBe(true);
  });

  it('results follow registry order, whatever order the rows come in', () => {
    const pl2 = list({ id: 'pl2', annex_anchor: 'Phụ lục II' });
    const registry = [list({ id: 'a', loaded: null }), pl1, pl2, list({ id: 'z', loaded: null })];
    const rows = [row(8, '2 | Mũ | QCVN | 6506.10.10 | Mũ', { anchor: 'Phụ lục II' }), row(7, PL1_BODY)];
    const ids = (rs: EvidenceRow[]) => policyStatus(registry, rs, '6506.10.10', AS_OF).map((r) => r.listId);
    expect(ids(rows)).toEqual(['a', 'pl1', 'pl2', 'z']);
    expect(ids([...rows].reverse())).toEqual(['a', 'pl1', 'pl2', 'z']);
  });

  it('decides nothing for a code that is not 4, 6 or 8 digits, stray text, or an asOf that is not a date', () => {
    expect(policyStatus([pl1], [row(7, PL1_BODY)], '84', AS_OF)).toEqual([]);
    expect(policyStatus([pl1], [row(7, PL1_BODY)], '84.62, 84.63', AS_OF)).toEqual([]);
    expect(policyStatus([pl1], [row(7, PL1_BODY)], 'TT31 8462', AS_OF)).toEqual([]);
    expect(policyStatus([pl1], [row(7, PL1_BODY)], '8462.90.90', '')).toEqual([]);
  });
});

/** Rows as retrieve must pass them: annex tables and notebook lists from the evidence build, the TT 11/2024 list clauses, hs_codes from hsEntries. */
let real: EvidenceRow[] | null = null;
let realEntries: string[][] = [];
const realRows = (): EvidenceRow[] => {
  if (real) return real;
  const evidence = buildEvidence(DIR)
    .filter((r) => ['annex_table', 'local_doc', 'internal'].includes(r.kind))
    .map((r, i): EvidenceRow => ({
      id: i + 1, kind: r.kind, authority: r.authority, title: r.title, body: r.body, window: 'current',
      meta: { ...r.meta, document_number: r.documentNumber },
    }));
  const provisions = ndjson('provisions.ndjson')
    .filter((p) => p.document_number === '11/2024/TT-BTTTT' && p.body)
    .map((p, i): EvidenceRow => ({
      id: 900001 + i, kind: 'provision', authority: 'binding', title: p.citation_label, body: p.body, window: 'current',
      meta: { document_number: p.document_number, anchor: p.citation_label },
    }));
  real = [...evidence, ...provisions].map((r) => ({ ...r, meta: { ...r.meta, hs_codes: hsEntries(r.body) } }));
  realEntries = real.map((r) => r.meta.hs_codes as string[]);
  return real;
};
/** Retrieve: every row with an entry matching the code by prefix in either direction. */
const select = (code: string): EvidenceRow[] => {
  const d = code.replace(/\D/g, '');
  const rows = realRows();
  return rows.filter((_, k) => realEntries[k]!.some((e) => e.startsWith(d) || d.startsWith(e)));
};
const at = (code: string, id: string, asOf = AS_OF) => {
  const r = policyStatus(POLICY_LISTS, select(code), code, asOf).find((x) => x.listId === id);
  expect(r).toBeDefined();
  return r!;
};

describe('policyStatus on the real corpus rows (review 2026-09-14)', () => {
  it('NĐ 292/2026 PL V: a heading entry is UNCERTAIN (its lines are narrower or qualified), an 8-digit entry LISTED', () => {
    for (const code of ['8507', '85.07', '8111', '2404', '8418', '8473']) {
      expect(at(code, 'nd292-2026-pl5')).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'exact', quote: expect.any(String) });
    }
    for (const code of ['2404.11.00', '7404.00.00']) expect(at(code, 'nd292-2026-pl5')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(at('8507.10.10', 'nd292-2026-pl5').quote).toContain('(đã qua sử dụng)');
    expect(at('2404.12.99', 'nd292-2026-pl5').quote!.normalize('NFC')).toContain('chứa nicotin'.normalize('NFC')); // corpus text is partly NFD
  });

  it('TT 36/2026 PL I: a 6-digit entry asked as itself is UNCERTAIN like a code under it; 2844.10.10 is listed', () => {
    expect(at('8421.29', 'tt36-2026-bkhcn-pl1')).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'exact' });
    expect(at('8421.29.90', 'tt36-2026-bkhcn-pl1')).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'parent' });
    expect(at('2844.10.10', 'tt36-2026-bkhcn-pl1')).toMatchObject({ status: 'LISTED', match: 'exact' });
  });

  it('TT 36/2026: a code whose listing starts later is UNCERTAIN until that day, then LISTED', () => {
    expect(at('8536.69.92', 'tt36-2026-bkhcn-pl2')).toMatchObject({
      status: 'UNCERTAIN', reason: 'not_yet_applicable', appliesFrom: '2027-04-01', match: 'exact',
    });
    const inForce = at('8536.69.92', 'tt36-2026-bkhcn-pl2', '2027-04-01');
    expect(inForce).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(inForce).not.toHaveProperty('appliesFrom');
    expect(at('9405.11.99', 'tt36-2026-bkhcn-pl2')).toMatchObject({ status: 'UNCERTAIN', reason: 'not_yet_applicable', appliesFrom: '2027-01-01' });
    expect(at('9405.11.99', 'tt36-2026-bkhcn-pl2', '2027-01-01')).toMatchObject({ status: 'LISTED' });
    expect(at('9405.11.91', 'tt36-2026-bkhcn-pl2')).toMatchObject({ status: 'LISTED' }); // same row 7.3; only .99 starts later
    expect(at('8471.30.20', 'tt36-2026-bkhcn-pl2')).toMatchObject({ status: 'LISTED' }); // QCVN 118 applies now, only QCVN 134 in 2027
  });

  it('TT 36/2026 PL II: a line suspending one of its QCVNs stays LISTED, since its other QCVNs still apply', () => {
    // 3.3.2 (8517.18.00), 3.3.12 (8517.62.53), 3.3.8 (8517.62.59) each suspend their own QCVN; QCVN 47, 119 still apply.
    for (const code of ['8517.18.00', '8517.62.53', '8517.62.59']) {
      for (const asOf of [AS_OF, '2027-01-01', '2027-07-01']) {
        const r = at(code, 'tt36-2026-bkhcn-pl2', asOf);
        expect(r).toMatchObject({ status: 'LISTED', match: 'exact' });
        expect(r).not.toHaveProperty('reason');
      }
    }
    expect(at('2710.12.23', 'tt36-2026-bkhcn-pl1').quote!.startsWith('1.1 | Xăng không chì')).toBe(true); // merged continuation row
  });

  it('the other ministries\' risk lists keep each tier to its own annex (R9)', () => {
    expect(at('3808.91.99', 'tt27-2026-bnnmt-pl1')).toMatchObject({ status: 'LISTED', match: 'exact' }); // veterinary chemical: medium
    expect(at('3808.91.99', 'tt27-2026-bnnmt-pl2')).toMatchObject({ status: 'LISTED', match: 'exact' }); // plant protection: high
    expect(at('3808.59.11', 'tt27-2026-bnnmt-pl2')).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'parent' }); // heading 38.08
    expect(at('9401.71.00', 'tt49-2026-bxd-pl1')).toMatchObject({ status: 'NOT_LISTED' });
    expect(at('9401.71.00', 'tt49-2026-bxd-pl2')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(at('8606', 'tt49-2026-bxd-pl2')).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'exact' });
    expect(at('2621.90.90', 'tt41-2026-bxd-pl2')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(at('2621.90.90', 'tt41-2026-bxd-pl3')).toMatchObject({ status: 'NOT_LISTED' });
    expect(at('3604.10.00', 'tt125-2026-bca-a')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(at('3604.10.00', 'tt125-2026-bca-b')).toMatchObject({ status: 'NOT_LISTED' });
    expect(at('8481.80', 'tt125-2026-bca-b')).toMatchObject({ status: 'UNCERTAIN', reason: 'qualifier', match: 'exact' });
    expect(at('8539.39.40', 'tt33-2026-bct')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(at('3923.10.90', 'tt27-2026-byt')).toMatchObject({ status: 'UNCERTAIN', reason: 'not_hs_keyed', quote: null }); // points at TT 15/2024
  });

  it('a gazette code cell no query matches as printed leaves its codes UNCERTAIN, never NOT_LISTED (R1)', () => {
    expect(at('9404.29.90', 'tt33-2026-bct')).toMatchObject({ status: 'UNCERTAIN', reason: 'unreadable', quote: null }); // "404.29.90"
    expect(at('9404.29.20', 'tt33-2026-bct')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(at('8501.33.10', 'tt33-2026-bct')).toMatchObject({ status: 'UNCERTAIN', reason: 'unreadable' }); // "8501.33.00" is not in AHTN 2022
    expect(at('4410.90.00', 'tt41-2026-bxd-pl3')).toMatchObject({ status: 'UNCERTAIN', reason: 'unreadable' }); // "410.90.00"
    expect(at('7311.00.99', 'tt49-2026-bxd-pl1')).toMatchObject({ status: 'UNCERTAIN', reason: 'unreadable' }); // "73.11 (hoặc 7311.00.99)"
    expect(at('6802.92.00', 'tt41-2026-bxd-pl3')).toMatchObject({ status: 'UNCERTAIN', reason: 'unreadable', quote: null }); // "6802.92.90"
    expect(at('6802.92.90', 'tt41-2026-bxd-pl3')).toMatchObject({ status: 'LISTED', match: 'exact' }); // as printed
    expect(at('8507.60.39', 'tt36-2026-bkhcn-pl2')).toMatchObject({ status: 'UNCERTAIN', reason: 'unreadable' }); // "8507.60.10"
    expect(at('8507.60.31', 'tt36-2026-bkhcn-pl2')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(at('9405.10.00', 'tt33-2026-bct')).toMatchObject({ status: 'NOT_LISTED' });
  });

  it('TT 11/2024: the quote carries the printing-field description that decides membership', () => {
    const colour = at('8443.32.21', 'tt11-2024-btttt-thiet-bi-in');
    expect(colour).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(colour.quote).toContain('60 tờ/phút');
    const binder = at('8440.10.10', 'tt11-2024-btttt-thiet-bi-in').quote!;
    expect(binder.startsWith('8440.10.10\n- - Hoạt động bằng điện\nMáy đóng thép (máy đóng ghim)')).toBe(true);
    expect(binder).not.toContain('84.41');
    expect(at('8443.31.11', 'tt11-2024-btttt-thiet-bi-in').quote).toBe('8443.31.11\n- - - - Loại màu\nMáy in phun có chức năng photocopy đa màu');
    expect(at('8443.32.90', 'tt11-2024-btttt-thiet-bi-in')).toMatchObject({ status: 'NOT_LISTED' });
  });

  it('QĐ 1725: a code under a listed subheading is a parent match; the group block scoping a line comes as context', () => {
    expect(at('8539.31.90', 'qd1725-bct-hieu-suat-nang-luong')).toMatchObject({ status: 'UNCERTAIN', reason: 'validity_unverified', match: 'parent' });
    const fridge = at('8418.30.10', 'qd1725-bct-hieu-suat-nang-luong');
    expect(fridge).toMatchObject({ match: 'exact' });
    expect(fridge.context).toContain('Chỉ áp dụng đến loại 1000L');
    expect(at('8516.60.10', 'qd1725-bct-hieu-suat-nang-luong')).not.toHaveProperty('context');
  });

  it('the internal workbook answers per ministry sheet and points at the circular to look up', () => {
    const internal = (code: string) =>
      policyStatus(POLICY_LISTS, select(code), code, AS_OF).filter((r) => r.reason === 'internal').map((r) => [r.listId, r.copyOf]);
    expect(internal('6116.10.90')).toEqual([['xlsx-vvmv-tt16-2026-bnv', 'tt16-2026-bnv']]); // TT 33/2026 itself is loaded
    expect(at('6116.10.90', 'tt33-2026-bct')).toMatchObject({ status: 'LISTED', match: 'exact' });
    expect(internal('6506.10.10')).toEqual([]); // only in the TT 36 copy sheets; TT 36 itself is loaded
  });

  it('every entry of every loaded list, fetched by hsEntries, comes back LISTED or UNCERTAIN on its own list, quoted verbatim', () => {
    const problems: string[] = [];
    const checked = new Set<string>();
    for (const l of POLICY_LISTS.filter((x) => x.loaded && x.loaded.kind !== 'internal')) {
      for (const e of hsEntries(listRows(l, realRows()).map((r) => r.body).join('\n'))) {
        checked.add(l.id);
        const rows = select(e);
        const r = policyStatus(POLICY_LISTS, rows, e, AS_OF).find((x) => x.listId === l.id);
        const body = rows.find((x) => x.id === r?.rowId)?.body ?? '';
        if (!r || !['LISTED', 'UNCERTAIN'].includes(r.status)) problems.push(`${l.id} ${e}: ${r?.status}`);
        else if (r.quote && !quoteInBody(r.quote, body)) problems.push(`${l.id} ${e}: quote not in row ${r.rowId}`);
        else if (r.context && !body.includes(r.context)) problems.push(`${l.id} ${e}: context not in row ${r.rowId}`);
      }
    }
    expect(problems).toEqual([]);
    // Every official list keyed by code took part, not only the ones loaded before the 2026-09-15 Công báo ingest.
    const keyed = POLICY_LISTS.filter((x) => x.loaded && x.loaded.kind !== 'internal' && x.granularity.length).map((x) => x.id);
    expect(keyed.filter((id) => !checked.has(id))).toEqual([]);
    expect(keyed).toEqual(expect.arrayContaining(['tt33-2026-bct', 'tt41-2026-bxd-pl3', 'tt49-2026-bxd-pl1', 'tt27-2026-bnnmt-pl2', 'tt125-2026-bca-b']));
  });
});

describe('policy-lists.json — the real registry', () => {
  it('is well-formed and every loaded list points at a document (and annex) the corpus holds', () => {
    const docs = new Map(ndjson('documents.ndjson').map((d) => [d.number as string, d]));
    const notebook = new Map(ndjson('notebook-only.ndjson').flatMap((e) => [[e.number, e], [e.slug, e]] as Array<[string, any]>));
    const anchors = new Set(ndjson('annex-tables.ndjson').map((t) => `${t.document_number}#${t.anchor}`));
    const ids = new Set(POLICY_LISTS.map((l) => l.id));
    const isoDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
    const problems: string[] = [];
    const bad = (l: PolicyList, what: string) => problems.push(`${l.id}: ${what}`);

    if (ids.size !== POLICY_LISTS.length) problems.push('ids are not unique');
    for (const l of POLICY_LISTS) {
      if (!isoDate(l.effective_from)) bad(l, `effective_from ${l.effective_from}`);
      if (l.effective_to !== null && !(isoDate(l.effective_to) && l.effective_to >= l.effective_from)) bad(l, `effective_to ${l.effective_to}`);
      if (!['binding', 'authoritative', 'administrative', 'reference', 'undetermined'].includes(l.authority)) bad(l, `authority ${l.authority}`);
      if (!Array.isArray(l.granularity) || l.granularity.some((g) => ![4, 6, 8].includes(g))) bad(l, `granularity ${l.granularity}`);
      if (l.applies_when !== null && !(APPLIES_WHEN as readonly string[]).includes(l.applies_when)) bad(l, `applies_when ${l.applies_when}`);
      if (l.copy_of !== undefined && !ids.has(l.copy_of)) bad(l, `copy_of ${l.copy_of} is not a registry id`);
      for (const d of l.deferred ?? []) if (!isoDate(d.from) || d.from <= l.effective_from || !d.basis) bad(l, `deferred ${d.from}`);
      for (const u of l.unreadable ?? []) if (!u.raw || ![4, 6, 8].includes(u.prefix.replace(/\D/g, '').length) || !u.basis) bad(l, `unreadable ${u.raw}`);
      if (!l.subject || !l.note) bad(l, 'subject and note are required');
      const source = docs.get(l.instrument) ?? notebook.get(l.loaded?.document_number ?? '');
      if (source && (source.effective_from ?? source.date) && (source.effective_from ?? source.date) !== l.effective_from) {
        bad(l, `effective_from ${l.effective_from} ≠ corpus ${source.effective_from ?? source.date}`);
      }
      if (!l.loaded) continue;
      if (!['annex_table', 'provision', 'local_doc', 'internal'].includes(l.loaded.kind)) bad(l, `loaded.kind ${l.loaded.kind}`);
      const n = l.loaded.document_number;
      if (!docs.has(n) && !notebook.has(n)) bad(l, `document ${n} is in neither documents.ndjson nor notebook-only.ndjson`);
      if (l.loaded.kind === 'annex_table' && !anchors.has(`${n}#${l.annex_anchor}`)) bad(l, `no annex table ${n} anchored "${l.annex_anchor}"`);
      if (l.loaded.kind === 'internal' && l.authority === 'binding') bad(l, 'an internal compilation cannot be binding');
    }
    expect(problems).toEqual([]);
  });

  it('every loaded list has rows, and its granularity covers every entry length they name', () => {
    const problems: string[] = [];
    for (const l of POLICY_LISTS.filter((x) => x.loaded)) {
      const lengths = new Set(hsEntries(listRows(l, realRows()).map((r) => r.body).join('\n')).map((e) => e.length));
      if (!listRows(l, realRows()).length) problems.push(`${l.id}: no rows`);
      // A list not keyed by code (TT 27/2026/TT-BYT points at TT 15/2024/TT-BYT) must name no entry a code could decide it by.
      if (!l.granularity.length) {
        if (lengths.size) problems.push(`${l.id}: granularity [] but its rows name ${[...lengths]}-digit entries`);
        continue;
      }
      if (!lengths.size) problems.push(`${l.id}: no entries in its rows`);
      // An exact-only list prints nomenclature lines above its 8-digit entries; only those entries need to be on the grid.
      const need = l.exact_only ? [8] : [...lengths];
      for (const n of need) if (!l.granularity.includes(n)) problems.push(`${l.id}: entries of length ${n} outside ${l.granularity}`);
    }
    expect(problems).toEqual([]);
  });

  it('every deferred code is in its list, and every line naming it states the later day', () => {
    const problems: string[] = [];
    for (const l of POLICY_LISTS) {
      const lines = listRows(l, realRows()).flatMap((r) => r.body.split('\n'));
      for (const d of l.deferred ?? []) {
        const [y, m, day] = d.from.split('-').map(Number);
        const date = new RegExp(`\\b0?${day}/0?${m}/${y}\\b`);
        for (const c of d.codes) {
          const naming = lines.filter((line) => lineCodes(line).includes(c.replace(/\D/g, '')));
          if (!naming.length) problems.push(`${l.id} ${c}: not in the list`);
          if (naming.some((line) => !date.test(line))) problems.push(`${l.id} ${c}: a line naming it does not state ${d.from}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every unreadable cell is printed in its list', () => {
    const problems: string[] = [];
    for (const l of POLICY_LISTS) {
      const lines = listRows(l, realRows()).flatMap((r) => r.body.normalize('NFC').split('\n'));
      for (const u of l.unreadable ?? []) if (!lines.some((line) => line.includes(u.raw))) problems.push(`${l.id} "${u.raw}": not printed in the list`);
    }
    expect(problems).toEqual([]);
  });

  it('every printed 8-digit entry AHTN 2022 lacks is under an unreadable prefix, so its neighbours are never NOT_LISTED', () => {
    // A missed one: 41/2026/TT-BXD PL III "6802.92.90" left 6802.92.00, the only line of 6802.92, NOT_LISTED (review 2026-09-15).
    const ahtn = new Set(ndjson('../hs-descriptions.ndjson').map((d) => d.hs as string));
    const problems: string[] = [];
    for (const l of POLICY_LISTS.filter((x) => x.loaded && x.loaded.kind !== 'internal')) {
      const prefixes = (l.unreadable ?? []).map((u) => u.prefix.replace(/\D/g, ''));
      for (const e of hsEntries(listRows(l, realRows()).map((r) => r.body).join('\n'))) {
        if (e.length === 8 && !ahtn.has(e) && !prefixes.some((p) => e.startsWith(p))) problems.push(`${l.id} ${e}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
