/**
 * Locks the evidence builders (plan 05, milestone 2) on the committed extracts. No database needed.
 * The status and window cases are the ones spec bot-answer-parity-design.md §2.3, §2.4 and §7 name.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { hsEntries as policyEntries } from '../../apps/api/src/modules/answer/policy';
import {
  buildEvidence,
  decreeStatusSections,
  dotted,
  EMBED_CHARS,
  embedText,
  extractHsCodes,
  hsEntries,
  noteSections,
  readRepoNotes,
  sliceWindows,
  windowText,
  type EvidenceRow,
} from './evidence-build';

const ROOT = join(__dirname, '..', '..');
const DATA = join(__dirname, 'data', 'legal');
const rows = buildEvidence(DATA);
const ndjson = (file: string): any[] =>
  readFileSync(join(DATA, file), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const keyOf = (r: EvidenceRow, ref = r.sourceRef) => `${r.kind}|${r.instrument}|${ref}`;
const sections = rows.filter((r) => r.meta.part == null);
const windows = rows.filter((r) => r.meta.part != null);
const cases = sections.filter((r) => r.meta.case_id != null);

function statusOf(instrument: string) {
  const found = rows.filter((r) => r.kind === 'status' && r.instrument === instrument);
  expect(found).toHaveLength(1);
  return found[0];
}

describe('evidence builders on the committed extracts', () => {
  it('produce one row per citable unit, each key unique', () => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    // en: 1,324 headings + 445 windows; sen: one per note; ruling: 29 full texts + 36 cases + 16 windows.
    expect(counts).toEqual({
      hs_note: 134, gri: 18, en: 1769, sen: 425, ruling: 81, annex_table: 148,
      status: 57, local_doc: 6, guidance: 2, draft: 20, internal: 149, note: 73,
    });
    const win: Record<string, number> = {};
    for (const r of windows) win[r.kind] = (win[r.kind] ?? 0) + 1;
    expect(win).toEqual({ en: 445, ruling: 16 });
    expect(cases).toHaveLength(36);
    expect(sections.filter((r) => r.kind === 'ruling' && r.meta.case_id == null)).toHaveLength(29);
    expect(new Set(rows.map((r) => keyOf(r))).size).toBe(rows.length);
  });

  it('status: one row per instrument — 23 documents in the corpus plus 34 relation targets', () => {
    expect(rows.filter((r) => r.kind === 'status')).toHaveLength(57);
    const r = statusOf('13/2022/NĐ-CP'); // two relations, one row
    expect(r.body.split('\n').filter((l) => l.includes('bởi 37/2026/NĐ-CP'))).toHaveLength(2);
    expect(r.effectiveFrom).toBe('2026-01-23');
  });

  it('status: only the first number of a relation target counts', () => {
    expect(statusOf('111/2021/NĐ-CP').body).toContain('23/01/2026');
    expect(statusOf('43/2017/NĐ-CP').body).not.toContain('111/2021');
  });

  it('status: a consolidated text names what it consolidates; a replaced decree names its replacement and date', () => {
    expect(statusOf('46/VBHN-BTC').body).toContain('08/2015/NĐ-CP');
    const b = statusOf('69/2018/NĐ-CP').body;
    expect(b).toContain('292/2026/NĐ-CP');
    expect(b).toContain('05/09/2026');
  });

  it('status: each end of force is data — date, instrument and part — so the API can compare it with the as-of date', () => {
    expect(statusOf('43/2017/NĐ-CP').meta.ends).toEqual([
      { from: '2026-01-23', by: '37/2026/NĐ-CP', relation: 'het_hieu_luc', scope: null }, // "43/2017/NĐ-CP (nhãn hàng hóa)": the whole decree
    ]);
    expect(statusOf('102/2021/NĐ-CP').meta.ends).toEqual([
      { from: '2026-07-01', by: '169/2026/NĐ-CP', relation: 'het_hieu_luc', scope: 'Điều 2 Nghị định 102/2021/NĐ-CP' }, // a part, named before the number
    ]);
    expect(statusOf('69/2018/NĐ-CP').meta.ends).toEqual([
      { from: '2026-09-05', by: '292/2026/NĐ-CP', relation: 'thay_the', scope: null },
    ]);
    expect(statusOf('03/2015/TT-BTTTT').meta.ends).toEqual([]); // amended, still in force
    expect(statusOf('13/2022/NĐ-CP').meta.ends).toHaveLength(2);
    expect(statusOf('336/2026/NĐ-CP').meta.ends).toEqual([]); // in the corpus, nothing ends it
  });

  it('status: a replaced risk list named with a note in brackets ends whole, never "partly"', () => {
    const r = statusOf('41/2023/TT-BCT');
    expect((r.meta.ends as { scope: string | null }[])[0]!.scope).toBeNull();
    expect(r.body).not.toContain('phần bị tác động');
  });

  it('status: a decree in the corpus ended whole says until when, not the ingest-time "còn hiệu lực"', () => {
    const r = statusOf('128/2020/NĐ-CP');
    expect(r.body).not.toContain('còn hiệu lực');
    expect(r.body).toContain('128/2020/NĐ-CP · hiệu lực từ 10/12/2020 đến trước 01/07/2026');
    expect(r.meta.ends).toEqual([{ from: '2026-07-01', by: '169/2026/NĐ-CP', relation: 'het_hieu_luc', scope: null }]);
  });

  it('status: a change that takes effect later starts then, so it lands in the upcoming window', () => {
    expect(statusOf('85/2019/NĐ-CP').effectiveFrom).toBe('2026-10-15');
  });

  it('HS scope columns: chapter notes carry the chapter, Section notes none, EN records the heading', () => {
    expect(rows.find((r) => r.kind === 'hs_note' && r.hsChapter === 84)?.title).toContain('Chương 84 (TT 31/2022/TT-BTC)');
    expect(rows.find((r) => r.kind === 'hs_note' && r.title.startsWith('Chú giải Phần XVI '))?.hsChapter).toBeNull();
    const h8418 = rows.find((r) => r.kind === 'en' && r.hsHeading === '84.18');
    expect(h8418?.hsChapter).toBe(84);
    expect(h8418?.title).toContain('nhóm 84.18');
  });

  it('QĐ 1725 windows carry the HS codes in their text and the notebook status line', () => {
    const w = rows.find((r) => r.instrument === '1725/QĐ-BCT' && r.body.includes('8539.31.10'));
    expect(w?.kind).toBe('local_doc');
    expect(w?.hsCodes).toContain('8539.31.10');
    expect(w?.meta.status).toMatch(/Quyết định cá biệt/);
  });

  it('every window of a risk-list sheet repeats which annex and risk level it belongs to', () => {
    const ws = rows.filter((r) => r.title.includes('PLI TT36.26.BKHCN-RR Cao'));
    expect(ws.length).toBeGreaterThan(1);
    for (const w of ws) expect(w.body).toContain('PHỤ LỤC I\nDANH MỤC SẢN PHẨM, HÀNG HÓA CÓ MỨC ĐỘ RỦI RO CAO');
  });

  it('annex blocks stay under 15,000 characters and repeat the label and header of their table', () => {
    const blocks = rows.filter((r) => r.kind === 'annex_table');
    for (const r of blocks) expect(r.body.length <= 15000 || r.meta.row_from === r.meta.row_to).toBe(true);
    const later = blocks.filter((r) => /— khối [2-9]\d*\//.test(r.title));
    expect(later.length).toBeGreaterThan(0);
    for (const r of later) {
      const first = blocks.find((b) => b.sourceRef === r.sourceRef.replace(/\/\d+$/, '/1'))!;
      expect(r.body.split('\n').slice(0, 2)).toEqual(first.body.split('\n').slice(0, 2));
    }
  });

  it('the helmet row of TT 36/2026 is findable by its HS code', () => {
    const r = rows.find((x) => x.kind === 'annex_table' && x.hsCodes.includes('6506.10.10'));
    expect(r?.instrument).toBe('36/2026/TT-BKHCN');
  });

  it('embed text never exceeds the title plus EMBED_CHARS', () => {
    for (const r of rows) expect(embedText(r).length).toBeLessThanOrEqual(r.title.length + 1 + EMBED_CHARS);
  });

  it('nothing is seeded as verified — only a named person verifies (R18)', () => {
    expect(rows.every((r) => r.verification === 'auto_unverified' && r.verifiedBy === null)).toBe(true);
  });
});

describe('window rows (Option A agreed with retrieval)', () => {
  const parents = new Map(sections.map((r) => [keyOf(r), r]));

  it('a window is an exact slice of its parent, which stays whole; it copies the parent columns and names it in meta', () => {
    for (const w of windows) {
      const p = parents.get(keyOf(w, w.meta.parent as string))!;
      expect(p).toBeDefined();
      const offset = w.meta.offset as number;
      expect(w.body).toBe(p.body.slice(offset, offset + w.body.length));
      expect(w.body.length).toBeLessThanOrEqual(4000);
      expect(w.title).toBe(`${p.title} (phần ${w.meta.part}/${w.meta.parts})`);
      expect(w.meta).toEqual({
        parent: p.sourceRef, part: w.meta.part, parts: w.meta.parts, offset, ...(p.meta.case_id ? { case_id: p.meta.case_id } : {}),
      });
      const cols = (r: EvidenceRow) => [r.authority, r.hsChapter, r.hsHeading, r.hsCodes, r.instrumentDate, r.effectiveFrom, r.effectiveTo];
      expect(cols(w)).toEqual(cols(p));
    }
  });

  it('every en/sen/ruling section past the embed cap is windowed past it to the end, windows overlapping; nothing else is', () => {
    const byParent = new Map<string, EvidenceRow[]>();
    for (const w of windows) byParent.set(keyOf(w, w.meta.parent as string), [...(byParent.get(keyOf(w, w.meta.parent as string)) ?? []), w]);
    const long = sections.filter((r) => r.body.length > EMBED_CHARS && ['en', 'sen', 'ruling'].includes(r.kind));
    expect([...byParent.keys()].sort()).toEqual(long.map((r) => keyOf(r)).sort());
    for (const p of long) {
      const ws = byParent.get(keyOf(p))!;
      expect(ws.map((w) => w.meta.part)).toEqual(ws.map((_, i) => i + 1));
      expect(ws.every((w) => w.meta.parts === ws.length)).toBe(true);
      // The parent's own embedding covers its first EMBED_CHARS, so no window lies wholly inside it; the first reaches past.
      expect(ws[0]!.meta.offset).toBeLessThanOrEqual(EMBED_CHARS);
      expect(ws.every((w) => (w.meta.offset as number) + w.body.length > EMBED_CHARS)).toBe(true);
      expect((ws.at(-1)!.meta.offset as number) + ws.at(-1)!.body.length).toBe(p.body.length);
      for (let i = 1; i < ws.length; i++) {
        const prevEnd = (ws[i - 1]!.meta.offset as number) + ws[i - 1]!.body.length;
        expect(ws[i]!.meta.offset).toBeLessThan(prevEnd);
        expect(prevEnd - (ws[i]!.meta.offset as number)).toBeLessThanOrEqual(400);
      }
    }
  });
});

describe('classification cases', () => {
  const source = ndjson('classification-cases.ndjson');
  const quotesOf = (c: any): string[] =>
    [
      c.hang_hoa.trich_ten, ...c.su_kien.map((s: { trich: string }) => s.trich), ...c.can_cu.map((b: { trich: string }) => b.trich),
      ...c.loai_tru.flatMap((x: { trich_nhom: string; trich_ly_do: string }) => [x.trich_nhom, x.trich_ly_do]),
      c.ket_luan.trich, c.ket_luan.trich_nhom, c.ket_luan.trich_dieu_kien, c.danh_muc.trich, c.pham_vi.trich_doi_tuong, c.pham_vi.trich_gia_tri,
    ].filter(Boolean);

  it('one ruling row per case: dates from the conclusion, heading and codes from it, body within the embed cap', () => {
    expect(cases.map((r) => r.meta.case_id)).toEqual(source.map((c) => c.case_id));
    for (const [i, r] of cases.entries()) {
      const c = source[i];
      const k = c.ket_luan;
      expect(r).toMatchObject({
        kind: 'ruling', authority: 'administrative', instrument: c.so_hieu, instrumentDate: c.ngay_ban_hanh,
        effectiveFrom: k.ap_dung_tu, effectiveTo: k.ap_dung_den, hsHeading: k.nhom, hsChapter: Number(k.nhom.slice(0, 2)),
        hsCodes: [k.ma, k.phan_nhom, k.nhom].filter(Boolean), sourceRef: `classification-cases.ndjson#${c.case_id}`,
      });
      expect(r.body.length).toBeLessThanOrEqual(EMBED_CHARS);
      expect(r.meta).toMatchObject({
        source_dir: c.source_dir, muc_lap_luan: c.muc_lap_luan, rang_buoc: c.pham_vi.rang_buoc, ahtn_2022: c.ahtn_2022,
        can_cu_loai: [...new Set(c.can_cu.map((b: { loai: string }) => b.loai))],
      });
    }
  });

  it('the body is fixed labels and the case quotes, verbatim; a case citing nothing says so', () => {
    for (const [i, r] of cases.entries()) {
      const c = source[i];
      for (const q of quotesOf(c)) expect(r.body).toContain(q);
      expect(r.body.includes('Căn cứ: Văn bản không nêu quy tắc hay chú giải')).toBe(c.can_cu.length === 0);
      // No 8-digit code the ruling did not write — e.g. the current codes of the same subheading (R2/R10).
      const written = [...quotesOf(c), c.ket_luan.ma ?? ''].join('\n');
      expect([c.case_id, (r.body.match(/\b\d{4}\.\d{2}\.\d{2}\b/g) ?? []).filter((x) => !written.includes(x))]).toEqual([c.case_id, []]);
    }
    const refs = new Set(rows.map((r) => r.sourceRef));
    expect(cases.flatMap((r) => (r.meta.lien_ket as string[]).filter((l) => !refs.has(l)))).toEqual([]); // links name rows that exist
    const flycam = cases.find((r) => r.meta.case_id === 'flycam-3831-tchq-txnk-1#2')!;
    expect(flycam.title).toBe('Tình huống phân loại · 3831/TCHQ-TXNK ngày 15/09/2022 · 88.06 — nhóm còn trong AHTN 2022 — văn bản không nêu mã 8 số');
    expect(flycam.meta).toMatchObject({ lien_ket: ['hs-notes.ndjson#123'], can_cu_loai: ['chu_giai_chuong'] });
    expect(flycam.body).toContain('(lời văn khác bản trong kho)');
  });

  it('a full-text ruling with cases carries their binding scope and highest reasoning level', () => {
    const full = (n: string) => sections.find((r) => r.kind === 'ruling' && r.meta.case_id == null && r.instrument === n)!;
    expect(full('3831/TCHQ-TXNK').meta).toMatchObject({ rang_buoc: 'huong_dan_noi_bo_hq', muc_lap_luan: 'L4' });
    expect(full('1483/TCHQ-GSQL').meta).toMatchObject({ muc_lap_luan: 'L1' });
    expect(full('3270/TCHQ-TXNK').meta).not.toHaveProperty('muc_lap_luan'); // concludes no code: no case
  });

  it('each case joins exactly one full-text ruling (same source_dir, instrument = so_hieu); its cases agree on the binding scope', () => {
    const texts = ndjson('classification-rulings.ndjson');
    for (const c of source) {
      const r = texts.filter((x) => x.source_dir === c.source_dir);
      expect([c.case_id, r.length, r[0]?.so_hieu ?? r[0]?.source_dir]).toEqual([c.case_id, 1, c.so_hieu]);
      expect(sections.some((x) => x.kind === 'ruling' && x.meta.case_id == null && x.instrument === c.so_hieu)).toBe(true);
      expect(source.filter((x) => x.source_dir === c.source_dir).map((x) => x.pham_vi.rang_buoc)).toEqual(
        source.filter((x) => x.source_dir === c.source_dir).map(() => c.pham_vi.rang_buoc),
      );
    }
  });

  it('a full-text ruling naming a code gone from AHTN 2022 warns in its title, and so does every window of it', () => {
    const full = rows.filter((r) => r.kind === 'ruling' && r.meta.case_id == null);
    const hs2022 = (r: EvidenceRow) =>
      (full.find((p) => p.meta.part == null && p.sourceRef === (r.meta.parent ?? r.sourceRef))!.meta.hs2022 ?? {}) as Record<string, string>;
    const stale = full.filter((r) => Object.values(hs2022(r)).some((s) => !s.startsWith('hien_hanh')));
    expect(stale.filter((r) => r.instrument === '3831/TCHQ-TXNK')).toHaveLength(2); // the text and its one window past the embed cap
    for (const r of full) expect([r.sourceRef, r.title.includes('⚠️')]).toEqual([r.sourceRef, stale.includes(r)]);
  });
});

describe('hs_codes: structured sources at their own length, free text 8-digit only', () => {
  const annex = (doc: string, anchor: string) =>
    sections.filter((r) => r.kind === 'annex_table' && r.instrument === doc && r.meta.anchor === anchor).flatMap((r) => r.hsCodes);

  it('annex tables carry every list entry policy.ts reads: 6-digit parents, 4-digit headings, split cells joined', () => {
    for (const r of sections.filter((x) => x.kind === 'annex_table')) {
      expect(r.hsCodes).toEqual(expect.arrayContaining([...hsEntries(r.body).map(dotted), ...extractHsCodes(r.body)]));
    }
    expect(annex('36/2026/TT-BKHCN', 'Phụ lục I')).toEqual(expect.arrayContaining(['8421.29', '7310.29', '2710.12.23']));
    expect(annex('18/2019/QĐ-TTg', 'Phụ lục I')).toEqual(expect.arrayContaining(['84.20', '84.54', '8419.32']));
    expect(annex('292/2026/NĐ-CP', 'Phụ lục V')).toEqual(expect.arrayContaining(['2404.11.00', '8507.10', '85.07']));
    expect(annex('49/2026/TT-BXD', 'Phụ lục I')).toContain('7311.00.99'); // "73.11 (hoặc 7311.00.99)": a mention still pins
  });

  it('the seed reads table entries exactly as policy.ts does (it cannot import the API module at runtime)', () => {
    for (const r of rows) expect([r.sourceRef, hsEntries(r.body)]).toEqual([r.sourceRef, policyEntries(r.body)]);
  });

  it('annex codes missing from the AHTN 2022 list are the known eleven — a new one is a typo or an old catalogue to review', () => {
    const known = new Set(
      readFileSync(join(DATA, '..', 'hs-descriptions.ndjson'), 'utf8').split('\n').filter((l) => l.trim())
        .flatMap((l) => { const h = JSON.parse(l).hs as string; return [h, h.slice(0, 6), h.slice(0, 4)]; }),
    );
    const missing = sections
      .filter((r) => r.kind === 'annex_table')
      .flatMap((r) => r.hsCodes.filter((c) => !known.has(c.replace(/\./g, ''))).map((c) => `${r.instrument} ${c}`));
    expect([...new Set(missing)].sort()).toEqual([
      '18/2019/QĐ-TTg 8419.32', // HS 2017 subheading, 8419.35 since HS 2022
      '33/2026/TT-BCT 3209.10.00', '33/2026/TT-BCT 8501.31.40', '33/2026/TT-BCT 8501.32.12', '33/2026/TT-BCT 8501.32.92',
      '33/2026/TT-BCT 8501.33.00', '33/2026/TT-BCT 8501.53.00', '33/2026/TT-BCT 8504.34.16', '33/2026/TT-BCT 8535.29.00',
      '36/2026/TT-BKHCN 8507.60.10', '41/2026/TT-BXD 6802.92.90',
    ]);
  });

  it('SEN: the note code labels, headings and subheadings as parents, hs_heading the heading of the first', () => {
    const source = ndjson('hs-sen.ndjson');
    const sen = sections.filter((r) => r.kind === 'sen');
    expect(sen).toHaveLength(source.length);
    for (const [i, s] of source.entries()) {
      const r = sen[i]!;
      expect(r.hsCodes).toEqual(expect.arrayContaining([...s.codes, ...s.headings, ...s.subheadings]));
      expect(r.hsHeading).toBe(s.heading);
      if (s.codes.length) expect(r.hsHeading).toBe(dotted(s.codes[0].replace(/\D/g, '').slice(0, 4)));
      const heads = [...new Set([...s.codes, ...s.subheadings, ...s.headings].map((c: string) => dotted(c.replace(/\D/g, '').slice(0, 4))))].sort();
      expect(r.meta.also_headings).toEqual(heads.length ? heads : undefined);
    }
    expect(sen.find((r) => r.hsCodes.includes('0102.29.11'))?.title).toBe('SEN 2022 · 01.02 · BÒ THIẾN');
    expect(sen.find((r) => r.hsCodes.includes('4001.21'))?.title).toBe('SEN 2022 · 40.01 · TỜ CAO SU XÔNG KHÓI NỔI GÂN');
  });

  it('SEN title names every heading the labels cover (a range past three), and never repeats a bare "CHƯƠNG n"', () => {
    const source = ndjson('hs-sen.ndjson');
    const sen = sections.filter((r) => r.kind === 'sen');
    for (const [i, s] of source.entries()) {
      const heads = [...new Set<string>([...s.codes, ...s.subheadings, ...s.headings].map((c: string) => dotted(c.replace(/\D/g, '').slice(0, 4))))].sort();
      const t = sen[i]!.title;
      for (const h of heads.length > 3 ? [`${heads[0]}–${heads.at(-1)}`] : heads) expect(t).toContain(h);
      expect(t).not.toMatch(/· CHƯƠNG \d+$/);
    }
    expect(sen.find((r) => r.title.endsWith('· CÁ MĂNG BIỂN (CHANOS CHANOS)'))?.title).toBe('SEN 2022 · 03.01, 03.03 · CÁ MĂNG BIỂN (CHANOS CHANOS)');
    expect(sen.find((r) => r.title.endsWith('· DẠNG PHÂN TÁN'))?.title).toBe('SEN 2022 · 39.01–39.12 · DẠNG PHÂN TÁN');
    expect(sen.some((r) => r.title === 'SEN 2022 · Chương 5')).toBe(true);
  });

  it('every other row (EN, HS notes, status, notebook, notes, full-text rulings) gets 8-digit codes only', () => {
    const structured = (r: EvidenceRow) => r.kind === 'annex_table' || r.kind === 'sen' || r.meta.case_id != null;
    const off = rows.filter((r) => !structured(r)).flatMap((r) => r.hsCodes.filter((c) => !/^\d{4}\.\d{2}\.\d{2}$/.test(c)).map((c) => `${r.sourceRef} ${c}`));
    expect(off).toEqual([]);
    expect(rows.some((r) => r.kind === 'en' && r.hsCodes.length)).toBe(true);
  });
});

describe('repo notes', () => {
  it('skip the unverified, unresolved-conflict and related-links sections', () => {
    const notes = rows.filter((r) => r.kind === 'note');
    expect(notes.some((r) => /— (Chưa xác minh|Xung đột chưa giải quyết|Kiến thức liên quan)/.test(r.title))).toBe(false);
    expect(notes.some((r) => r.title.includes('R18 — Xác minh tại điểm sử dụng'))).toBe(true);
  });

  // The seed image has no .agent/ (.dockerignore); the check only runs in a checkout.
  (existsSync(join(ROOT, '.agent')) ? it : it.skip)(
    'repo-notes.ndjson matches .agent/ — after editing a note run `yarn tsx db/seed/evidence.ts --export-notes`',
    () => {
      const committed = readFileSync(join(DATA, 'repo-notes.ndjson'), 'utf8');
      expect(committed).toBe(readRepoNotes(ROOT).map((n) => JSON.stringify(n)).join('\n') + '\n');
    },
  );
});

describe('evidence helpers', () => {
  it('extractHsCodes: 8-digit dotted codes, once each, never 4- or 6-digit ones', () => {
    expect(extractHsCodes('8539.31.10; 8539.31; 85.39; 8539.31.10 và 0306.15.00')).toEqual(['8539.31.10', '0306.15.00']);
  });

  it('windowText: windows under the size, overlapping, header on each, no line lost', () => {
    const text = Array.from({ length: 60 }, (_, i) => `dòng ${i} ${'x'.repeat(90)}`).join('\n');
    const ws = windowText(text, 'HEADER', 1000, 200);
    expect(ws.length).toBeGreaterThan(5);
    for (const w of ws) {
      expect(w.startsWith('HEADER\n')).toBe(true);
      expect(w.length).toBeLessThanOrEqual('HEADER\n'.length + 1000);
    }
    for (let i = 0; i < 60; i++) expect(ws.some((w) => w.includes(`dòng ${i} `))).toBe(true);
    expect(ws[1]).toContain(ws[0].split('\n').at(-1)!);
  });

  it('windowText: a line longer than the window is cut, not dropped or repeated', () => {
    expect(windowText('a'.repeat(2500), '', 1000, 100).join('')).toBe('a'.repeat(2500));
  });

  it('sliceWindows: exact slices under the size, cut after a line break, overlapping within the overlap, covering the text', () => {
    const text = Array.from({ length: 80 }, (_, i) => `câu ${i} ${'y'.repeat(70)}.`).join('\n');
    const ws = sliceWindows(text, 1000, 200);
    expect(ws.length).toBeGreaterThan(5);
    expect(ws[0]!.offset).toBe(0);
    expect(ws.at(-1)!.offset + ws.at(-1)!.text.length).toBe(text.length);
    ws.forEach((w, i) => {
      expect(w.text).toBe(text.slice(w.offset, w.offset + w.text.length));
      expect(w.text.length).toBeLessThanOrEqual(1000);
      if (i === 0) return;
      const prevEnd = ws[i - 1]!.offset + ws[i - 1]!.text.length;
      expect(text[prevEnd - 1]).toBe('\n');
      expect(text[w.offset - 1]).toBe('\n');
      expect(w.offset).toBeLessThan(prevEnd);
      expect(prevEnd - w.offset).toBeLessThanOrEqual(200);
    });
    expect(sliceWindows('a'.repeat(2500), 1000, 100).map((w) => w.offset)).toEqual([0, 900, 1800]); // no boundary: hard cuts
  });

  it('sliceWindows: no line break → cut after a sentence end; the last window adds at least the overlap; overlap ≥ size/2 throws', () => {
    const ws = sliceWindows('Câu một hai ba bốn. '.repeat(300), 1000, 200);
    expect(ws.length).toBeGreaterThan(5);
    for (const w of ws.slice(0, -1)) expect(w.text.endsWith('. ')).toBe(true);
    const text = ('x'.repeat(99) + '\n').repeat(19) + 'tail.'; // the last line break sits 5 chars before the end
    const tw = sliceWindows(text, 1000, 200);
    expect(text.length - (tw.at(-2)!.offset + tw.at(-2)!.text.length)).toBeGreaterThanOrEqual(200);
    expect(() => sliceWindows(text, 1000, 500)).toThrow('overlap must be under half the size');
  });

  it('noteSections: drops frontmatter, splits on H2 outside code fences', () => {
    const md = '---\ntype: concept\n---\n\n# Tiêu đề\n\nMở đầu.\n\n## A\n\nNội dung A\n```\n## không phải tiêu đề\n```\n\n## Kiến thức liên quan\n\n- link\n';
    expect(noteSections(md, '.agent/x.md').map((n) => [n.title, n.body, n.source_ref])).toEqual([
      ['Tiêu đề', 'Mở đầu.', '.agent/x.md'],
      ['Tiêu đề — A', 'Nội dung A\n```\n## không phải tiêu đề\n```', '.agent/x.md#A'],
    ]);
  });

  it('decreeStatusSections: a decree with no loaded rates says so in words', () => {
    const [loaded, missing] = decreeStatusSections([
      { number: '26/2023/NĐ-CP', title: 'Biểu thuế', effective_from: '2023-07-15', effective_to: null, rates: 11000 },
      { number: '201/2026/NĐ-CP', title: 'Sửa thuế XK', effective_from: '2026-01-01', effective_to: null, rates: 0 },
    ]);
    expect(loaded.body).toContain('đã nạp 11000 dòng thuế');
    expect(missing.body).toContain('CHƯA nạp dòng thuế nào');
    expect(missing.sourceRef).toBe('decree#201/2026/NĐ-CP');
  });
});
