/**
 * Locks the evidence builders (plan 05, milestone 2) on the committed extracts. No database needed.
 * The status and window cases are the ones spec bot-answer-parity-design.md §2.3, §2.4 and §7 name.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildEvidence,
  decreeStatusSections,
  EMBED_CHARS,
  embedText,
  extractHsCodes,
  noteSections,
  readRepoNotes,
  windowText,
} from './evidence-build';

const ROOT = join(__dirname, '..', '..');
const DATA = join(__dirname, 'data', 'legal');
const rows = buildEvidence(DATA);

function statusOf(instrument: string) {
  const found = rows.filter((r) => r.kind === 'status' && r.instrument === instrument);
  expect(found).toHaveLength(1);
  return found[0];
}

describe('evidence builders on the committed extracts', () => {
  it('produce one row per citable unit, each key unique', () => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    expect(counts).toEqual({
      hs_note: 134, gri: 18, en: 1306, sen: 97, ruling: 29, annex_table: 112,
      status: 33, local_doc: 6, guidance: 2, draft: 20, internal: 149, note: 73,
    });
    expect(new Set(rows.map((r) => `${r.kind}|${r.instrument}|${r.sourceRef}`)).size).toBe(rows.length);
  });

  it('status: one row per instrument — 15 documents in the corpus plus 18 relation targets', () => {
    expect(rows.filter((r) => r.kind === 'status')).toHaveLength(33);
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
      { from: '2026-01-23', by: '37/2026/NĐ-CP', relation: 'het_hieu_luc', scope: '43/2017/NĐ-CP (nhãn hàng hóa)' },
    ]);
    expect(statusOf('69/2018/NĐ-CP').meta.ends).toEqual([
      { from: '2026-09-05', by: '292/2026/NĐ-CP', relation: 'thay_the', scope: null },
    ]);
    expect(statusOf('03/2015/TT-BTTTT').meta.ends).toEqual([]); // amended, still in force
    expect(statusOf('13/2022/NĐ-CP').meta.ends).toHaveLength(2);
    expect(statusOf('336/2026/NĐ-CP').meta.ends).toEqual([]); // in the corpus, nothing ends it
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
