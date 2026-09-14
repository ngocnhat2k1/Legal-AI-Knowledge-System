import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { caseSections, evidenceInstruments, evidenceRetrieve, headingSections, hsCodeSections, namedStatus, type RetrievedEvidence, senSections } from './legal.evidence';
import { LegalController } from './legal.controller';
import { generate, type PromptSource } from './legal.generation';
import { hybridRetrieve, type RetrievedArticle } from './legal.retrieval';
import { evidenceSource, LegalService, namedHeadings } from './legal.service';

jest.mock('./legal.generation', () => ({ generate: jest.fn() }));
jest.mock('./legal.retrieval', () => ({ ...jest.requireActual('./legal.retrieval'), hybridRetrieve: jest.fn() }));
jest.mock('./legal.evidence', () => ({
  evidenceInstruments: jest.fn(async () => []),
  evidenceRetrieve: jest.fn(async () => []),
  namedStatus: jest.fn(async () => []),
  hsCodeSections: jest.fn(async () => []),
  headingSections: jest.fn(async () => []),
  caseSections: jest.fn(async () => []),
  senSections: jest.fn(async () => []),
}));

const gazette = (number: string, docType: string) => ({ number, docType, title: `${number} — tiêu đề`, sourceUrl: 'https://congbao.chinhphu.vn/x', congbaoId: 1 });

describe('LegalService.ask — "Nghị định 69/2018 còn áp dụng không" (§5b.8)', () => {
  it('takes the kind from the question when doc= carries only the serial, so other agencies drop out', async () => {
    // 1st query: resolveDocuments (corpus lacks it); 2nd: the Công báo prefix lookup.
    const results: unknown[][] = [[], [gazette('69/2018/NĐ-CP', 'nghi_dinh'), gazette('69/2018/TT-BTC', 'thong_tu')]];
    const svc = new LegalService({ execute: async () => results.shift() ?? [] } as never, {} as never);
    const res = await svc.ask('Nghị định 69/2018 còn áp dụng không', '2026-09-13', '69/2018');
    expect(res.gazetteMatchKind).toBe('exact');
    expect(res.gazetteMatches.map((g) => g.number)).toEqual(['69/2018/NĐ-CP']);
  });
});

describe('LegalService.ask — [n] maps to the n-th provision given to the model', () => {
  it('orders citations by the renumbered markers', async () => {
    const article = (id: number, label: string): RetrievedArticle => ({
      articleProvisionId: id, clauseProvisionId: id, documentId: 1, documentNumber: '08/2015/NĐ-CP', documentTitle: 't',
      articleCitation: label, clauseCitation: `Khoản 1 ${label}`, path: label, articleBody: 'thân', clauseBody: 'thân',
      effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null, gazetteUrl: null, verification: 'verified',
      score: 1, bestDist: 0.2, kwHit: true,
    });
    (hybridRetrieve as jest.Mock).mockResolvedValue([article(11, 'Điều 11'), article(22, 'Điều 22')]);
    (generate as jest.Mock).mockResolvedValue({ answer: 'Ý một [2]. Ý hai [1].', citations: [1, 2], abstain: false, reason: null });
    const svc = new LegalService({ execute: async () => [] } as never, { embed: async () => [0] } as never);
    const res = await svc.ask('Hàng nào được miễn thuế nhập khẩu', '2026-09-13');
    expect(res.answer).toBe('Ý một [1]. Ý hai [2].');
    expect(res.citations.map((c) => c.articleLabel)).toEqual(['Điều 22', 'Điều 11']);
  });
});

describe('LegalService.ask — evidence sections (plan 05 milestone 3, first slice)', () => {
  const ev = (over: Partial<RetrievedEvidence>): RetrievedEvidence => ({
    id: 1, kind: 'status', instrument: '69/2018/NĐ-CP', authority: 'binding', title: 'Tình trạng hiệu lực — 69/2018/NĐ-CP',
    body: '69/2018/NĐ-CP hết hiệu lực từ 05/09/2026, bị thay thế bởi 292/2026/NĐ-CP — căn cứ khoản 1 Điều 65 NĐ 292/2026/NĐ-CP',
    documentNumber: '69/2018/NĐ-CP', effectiveFrom: '2026-09-05', effectiveTo: null, effectiveness: 'con_hieu_luc',
    verification: 'auto_unverified', status: null, ends: [], window: 'current', score: 1, bestDist: 0.9,
    hsHeading: null, hsChapter: null, hsCodes: [], meta: {}, hitText: null, ...over,
  });
  const svc = () => new LegalService({ execute: async () => [] } as never, { embed: async () => [0] } as never);
  const lastSources = () => (generate as jest.Mock).mock.calls.at(-1)![2] as PromptSource[];

  it('ask() (GET /legal, the live bot) never pins classification cases for the headings it reads', async () => {
    (caseSections as jest.Mock).mockClear();
    await svc().ask('Các nhóm ứng viên cần phân biệt: 38.24, 30.05, 85.09', '2026-09-14');
    expect((headingSections as jest.Mock).mock.calls.at(-1)![1]).toEqual(['38.24', '30.05', '85.09']);
    expect(caseSections).not.toHaveBeenCalled();
    expect(senSections).not.toHaveBeenCalled();
  });

  it('builds the prompt text from the window that matched, keeping the whole parent as body and citation', () => {
    const parent = ['EN nhóm 85.09', ...Array.from({ length: 200 }, (_, i) => `dòng ${i} ${'x'.repeat(40)}`), 'máy xay sinh tố gia dụng', '1 | máy | 8509.40.00'].join('\n');
    expect(parent.indexOf('máy xay')).toBeGreaterThan(6000); // past the cut
    const e = ev({ kind: 'en', body: parent, hitText: 'EN nhóm 85.09 — cửa sổ 2/2\nmáy xay sinh tố gia dụng' });
    const s = evidenceSource(e, '2026-09-14');
    expect(s.text).toBe(e.hitText);
    expect(s.body).toBe(parent);
    expect(s.citation.verbatimText).toBe(parent);
    // A code the question asks about still moves its lines to the top of the whole section.
    expect(evidenceSource(e, '2026-09-14', ['8509.40.00']).text.split('\n')[2]).toBe('1 | máy | 8509.40.00');
  });

  it('answers a named document the corpus lacks from its status row instead of "we do not hold it"', async () => {
    (evidenceInstruments as jest.Mock).mockResolvedValueOnce(['69/2018/NĐ-CP']);
    // Far by cosine distance, yet kept: the user named this document, as an explicit Điều bypasses the gate.
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([ev({})]);
    (hybridRetrieve as jest.Mock).mockClear();
    (generate as jest.Mock).mockResolvedValueOnce({
      answer: 'Không, 69/2018/NĐ-CP hết hiệu lực từ 05/09/2026, thay bằng 292/2026/NĐ-CP [1].',
      citations: [1], abstain: false, reason: null,
    });
    const res = await svc().ask('Nghị định 69/2018/NĐ-CP còn áp dụng không', '2026-09-14');
    expect(res.missingDoc).toBeNull();
    expect(hybridRetrieve).not.toHaveBeenCalled(); // no clauses to search in a document held only as evidence
    expect((evidenceRetrieve as jest.Mock).mock.calls.at(-1)![1].documentNumbers).toEqual(['69/2018/NĐ-CP']);
    expect(res.answer).toContain('[1]');
    expect(res.citations).toMatchObject([{ kind: 'status', instrument: '69/2018/NĐ-CP' }]);
  });

  it('keeps the status row of a named document the corpus holds, even when ranking would not surface it', async () => {
    // 69/2018/NĐ-CP fetched on request by the bot: its clauses are in the corpus and still read as in force.
    const fetched = { id: 7, number: '69/2018/NĐ-CP', title: 't', docType: 'nghi_dinh', consolidates: null };
    const clause = {
      articleProvisionId: 73, clauseProvisionId: 73, documentId: 7, documentNumber: '69/2018/NĐ-CP', documentTitle: 't',
      articleCitation: 'Điều 73 Nghị định 69/2018/NĐ-CP', clauseCitation: 'Khoản 2 Điều 73', path: '', articleBody: 'thân',
      clauseBody: 'thân', effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null, gazetteUrl: null,
      verification: 'auto_unverified', score: 1, bestDist: 0.3, kwHit: true,
    } as RetrievedArticle;
    const results: unknown[][] = [[fetched]]; // resolveDocuments
    const svc2 = new LegalService({ execute: async () => results.shift() ?? [] } as never, { embed: async () => [0] } as never);
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([clause]);
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([]);
    (namedStatus as jest.Mock).mockResolvedValueOnce([ev({})]);
    (generate as jest.Mock).mockResolvedValueOnce(null);
    const res = await svc2.ask('Nghị định 69/2018/NĐ-CP còn áp dụng không', '2026-09-14');
    expect((namedStatus as jest.Mock).mock.calls.at(-1)![1]).toEqual(['69/2018/NĐ-CP']);
    expect(res.citations.map((c) => c.kind ?? 'provision')).toEqual(['provision', 'status']);
  });

  it('drops a section that trails the best article by more than the margin, even under the absolute gate', async () => {
    const near = {
      articleProvisionId: 42, clauseProvisionId: 42, documentId: 1, documentNumber: '96/VBHN-VPQH', documentTitle: 't',
      articleCitation: 'Điều 9', clauseCitation: 'Khoản 1 Điều 9', path: 'Điều 9', articleBody: 'thân', clauseBody: 'thân',
      effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null, gazetteUrl: null, verification: 'verified',
      score: 1, bestDist: 0.25, kwHit: true,
    } as RetrievedArticle;
    // Measured on "thời hạn nộp thuế": clause 0.25, an unrelated AEO note 0.34; the 336/2026 status row sat at 0.29.
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([near]);
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([
      ev({ id: 4, kind: 'note', title: 'AEO', documentNumber: null, bestDist: 0.34 }),
      ev({ id: 5, title: 'Tình trạng hiệu lực — 336/2026/NĐ-CP', bestDist: 0.29 }),
    ]);
    (generate as jest.Mock).mockResolvedValueOnce(null);
    const res = await svc().ask('Thời hạn nộp thuế đối với hàng hóa nhập khẩu là bao lâu', '2026-09-14');
    expect(res.citations.map((c) => c.provisionLabel)).toEqual(['Khoản 1 Điều 9', 'Tình trạng hiệu lực — 336/2026/NĐ-CP']);
  });

  it('puts evidence after the articles, drops sections beyond the distance gate, and labels a note', async () => {
    const article = {
      articleProvisionId: 11, clauseProvisionId: 11, documentId: 1, documentNumber: '08/2015/NĐ-CP', documentTitle: 't',
      articleCitation: 'Điều 11', clauseCitation: 'Khoản 1 Điều 11', path: 'Điều 11', articleBody: 'thân', clauseBody: 'thân',
      effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null, gazetteUrl: null, verification: 'verified',
      score: 1, bestDist: 0.28, kwHit: true,
    } as RetrievedArticle;
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([article]);
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([
      ev({ id: 2, kind: 'note', instrument: '.agent/business-rules.md', authority: 'reference', title: 'Quy tắc nghiệp vụ — R5', body: 'ghi chú', documentNumber: null, bestDist: 0.3 }),
      ev({ id: 3, kind: 'en', instrument: 'CV 1810/TCHQ-TXNK', authority: 'authoritative', title: 'EN xa', body: 'xa', documentNumber: null, bestDist: 0.8 }),
    ]);
    (generate as jest.Mock).mockResolvedValueOnce({ answer: 'Ý một [1]. Giải thích thêm [2].', citations: [1, 2], abstain: false, reason: null });
    const res = await svc().ask('Hàng nào được miễn thuế nhập khẩu', '2026-09-14');
    expect(lastSources().map((s) => s.label)).toEqual(['Điều 11', 'Quy tắc nghiệp vụ — R5']);
    expect(lastSources()[1]!.note).toContain('không phải căn cứ pháp lý');
    expect(res.citations.map((c) => c.kind ?? 'provision')).toEqual(['provision', 'note']);
  });

  it('keeps a section listing the HS code the question names, and orders the rest by distance, not RRF', async () => {
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([]);
    // RRF order as retrieval returns it: a chapter intro that repeats the query words first, the right note second.
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([
      ev({ id: 20, kind: 'en', title: 'EN Chương 84 — mở đầu', bestDist: 0.43 }),
      ev({ id: 21, kind: 'hs_note', title: 'Chú giải Phần XVI', bestDist: 0.41 }),
    ]);
    (hsCodeSections as jest.Mock).mockResolvedValueOnce([ev({ id: 30, kind: 'annex_table', title: '36/2026/TT-BKHCN — Bảng 4 — khối 3/9' })]);
    (generate as jest.Mock).mockResolvedValueOnce(null);
    const res = await svc().ask('Mũ bảo hiểm mã 6506.10.10 thuộc danh mục nào', '2026-09-14');
    expect((hsCodeSections as jest.Mock).mock.calls.at(-1)![1]).toEqual(['6506.10.10']);
    expect(res.citations.map((c) => c.provisionLabel)).toEqual([
      '36/2026/TT-BKHCN — Bảng 4 — khối 3/9',
      'Chú giải Phần XVI',
      'EN Chương 84 — mở đầu',
    ]);
  });

  it('keeps the notes of a heading the question names only as digits (3005.10.10 → nhóm 30.05)', async () => {
    const clause = (n: number) => ({
      articleProvisionId: n, clauseProvisionId: n, documentId: 1, documentNumber: '08/2015/NĐ-CP', documentTitle: 't',
      articleCitation: `Điều ${n}`, clauseCitation: `Khoản 1 Điều ${n}`, path: '', articleBody: 'thân', clauseBody: 'thân',
      effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null, gazetteUrl: null, verification: 'verified',
      score: 1, bestDist: 0.25, kwHit: true,
    }) as RetrievedArticle;
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([clause(16), clause(26), clause(43)]);
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([ev({ id: 40, kind: 'hs_note', title: 'Chú giải Phần VI', bestDist: 0.28 })]);
    (headingSections as jest.Mock).mockResolvedValueOnce([ev({ id: 41, kind: 'en', title: 'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05 — Bông, gạc' })]);
    (generate as jest.Mock).mockResolvedValueOnce(null);
    const res = await svc().ask('Mã HS 3005.10.10 gồm những hàng gì, khác phân nhóm 3005.90 chỗ nào', '2026-09-14');
    expect((headingSections as jest.Mock).mock.calls.at(-1)![1]).toEqual(['30.05']);
    expect(res.citations.map((c) => c.provisionLabel)).toEqual([
      'Khoản 1 Điều 16',
      'Khoản 1 Điều 26', // two clauses at most beside a named heading's notes
      'Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05 — Bông, gạc',
      'Chú giải Phần VI',
    ]);
  });

  it('reads headings only from an HS question, never from a date or an amount', () => {
    expect(namedHeadings('Căn cứ phân loại miếng dán. Các nhóm ứng viên cần phân biệt: 30.05, 33.07, 30.04.')).toEqual(['30.05', '33.07', '30.04']);
    expect(namedHeadings('nhóm 3005 và mã 30051010')).toEqual(['30.05']);
    expect(namedHeadings('Thời hạn nộp thuế từ 14.09.2026, phạt 12.50%')).toEqual([]);
    expect(namedHeadings('mã HS khai trước 15.07.2023 phạt 12.50%')).toEqual([]);
    expect(namedHeadings('Mức phạt 12.50 triệu, nộp trước 08.30 sáng, số tiền 1500.00.00 đồng')).toEqual([]);
    expect(namedHeadings('Căn cứ phân loại chương 30 theo mã HS: 3005.10.10')).toEqual(['30.05']);
    expect(namedHeadings('Các nhóm ứng viên cần phân biệt: 38.24, 33.07, 30.04, 30.05. Nêu tiêu chí')).toEqual(['38.24', '33.07', '30.04', '30.05']);
  });

  it('compares a status row\'s end of force with the as-of date itself: expired for the model and the bot, coming otherwise', async () => {
    (evidenceInstruments as jest.Mock).mockResolvedValueOnce(['43/2017/NĐ-CP', '85/2019/NĐ-CP']);
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([
      ev({
        id: 43, instrument: '43/2017/NĐ-CP', documentNumber: '43/2017/NĐ-CP', title: 'Tình trạng hiệu lực — 43/2017/NĐ-CP',
        ends: [{ from: '2026-01-23', by: '37/2026/NĐ-CP', relation: 'het_hieu_luc', scope: '43/2017/NĐ-CP (nhãn hàng hóa)' }],
      }),
      ev({
        id: 85, instrument: '85/2019/NĐ-CP', documentNumber: '85/2019/NĐ-CP', title: 'Tình trạng hiệu lực — 85/2019/NĐ-CP',
        window: 'upcoming', effectiveFrom: '2026-10-15',
        ends: [{ from: '2026-10-15', by: '336/2026/NĐ-CP', relation: 'thay_the', scope: null }],
      }),
    ]);
    (generate as jest.Mock).mockResolvedValueOnce(null);
    const res = await svc().ask('Nghị định 43/2017 còn áp dụng không', '2026-09-14');
    const [nd43, nd85] = res.citations;
    expect(nd43!.expired).toBe('43/2017/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 23/01/2026 theo 37/2026/NĐ-CP (phần: 43/2017/NĐ-CP (nhãn hàng hóa))');
    expect(lastSources()[0]!.note).toContain('ĐÃ HẾT HIỆU LỰC từ 23/01/2026');
    expect((generate as jest.Mock).mock.calls.at(-1)![3]).toEqual([nd43!.expired]); // stated as a fact above the question
    expect(nd85!.expired).toBeNull();
    expect(nd85!.note).toContain('sẽ hết hiệu lực từ 15/10/2026 theo 336/2026/NĐ-CP');
    expect(nd85!.note).not.toContain('CHƯA CÓ HIỆU LỰC'); // 85/2019 is in force until then
  });

  it('drops a sentence calling an expired document in force, keeping the rest of the prose', async () => {
    (evidenceInstruments as jest.Mock).mockResolvedValueOnce(['43/2017/NĐ-CP']);
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([
      ev({
        instrument: '43/2017/NĐ-CP', documentNumber: '43/2017/NĐ-CP', title: 'Tình trạng hiệu lực — 43/2017/NĐ-CP',
        body: '43/2017/NĐ-CP hết hiệu lực — phần bị tác động: 43/2017/NĐ-CP (nhãn hàng hóa) — từ 23/01/2026 bởi 37/2026/NĐ-CP',
        ends: [{ from: '2026-01-23', by: '37/2026/NĐ-CP', relation: 'het_hieu_luc', scope: '43/2017/NĐ-CP (nhãn hàng hóa)' }],
      }),
    ]);
    (generate as jest.Mock).mockResolvedValueOnce({
      answer: 'Còn hiệu lực tại thời điểm hiện tại, nhưng sẽ hết hiệu lực từ 23/01/2026. Phần nhãn hàng hóa đã hết hiệu lực từ 23/01/2026 [1].',
      citations: [1], abstain: false, reason: null,
    });
    const res = await svc().ask('Nghị định 43/2017 về nhãn hàng hóa còn áp dụng không', '2026-09-14');
    expect(res.answer).toBe('Phần nhãn hàng hóa đã hết hiệu lực từ 23/01/2026 [1].');
  });

  it('moves the lines naming the asked HS code above the prompt cut, under the table label and header', async () => {
    const block = ['36/2026/TT-BKHCN — Bảng 4 (sau: Phụ lục II) — khối 1/10', 'STT | Tên sản phẩm | Mã số HS', ...Array.from({ length: 80 }, (_, i) => `${i} | ${'etanol '.repeat(12)}`), '2 | Mũ bảo hiểm cho người đi mô tô, xe máy | 6506.10.10'].join('\n');
    expect(block.indexOf('6506.10.10')).toBeGreaterThan(6000); // past the cut, as on production
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([]);
    (hsCodeSections as jest.Mock).mockResolvedValueOnce([ev({ id: 36, kind: 'annex_table', title: '36/2026/TT-BKHCN — Bảng 4', body: block })]);
    (generate as jest.Mock).mockResolvedValueOnce(null);
    const res = await svc().ask('Mũ bảo hiểm mã 6506.10.10 thuộc danh mục rủi ro nào theo Thông tư 36/2026', '2026-09-14');
    expect(lastSources()[0]!.text.split('\n').slice(0, 3)).toEqual([
      '36/2026/TT-BKHCN — Bảng 4 (sau: Phụ lục II) — khối 1/10',
      'STT | Tên sản phẩm | Mã số HS',
      '2 | Mũ bảo hiểm cho người đi mô tô, xe máy | 6506.10.10',
    ]);
    expect(res.citations[0]!.verbatimText).toContain('Mũ bảo hiểm');
  });

  it('labels a section that is not yet in force with the date it starts', async () => {
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([]);
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([
      ev({ instrument: '85/2019/NĐ-CP', documentNumber: '85/2019/NĐ-CP', window: 'upcoming', effectiveFrom: '2026-10-15', bestDist: 0.3 }),
    ]);
    (generate as jest.Mock).mockResolvedValueOnce(null); // no model: the sources stand on their own
    const res = await svc().ask('Một cửa quốc gia làm theo văn bản nào', '2026-09-14');
    expect(res.citations[0]!.note).toContain('CHƯA CÓ HIỆU LỰC — có hiệu lực từ 15/10/2026');
  });
});

describe('GET /legal — the 69/2018 fixture answers the same across the scope/gather split (plan 08 Việc 8)', () => {
  it('returns the citation labels, kinds and standing recorded before the split', async () => {
    const fetched = { id: 7, number: '69/2018/NĐ-CP', title: 't', docType: 'nghi_dinh', consolidates: null };
    const results: unknown[][] = [[fetched]]; // resolveDocuments
    const svc = new LegalService({ execute: async () => results.shift() ?? [] } as never, { embed: async () => [0] } as never);
    const clause = (n: number, bestDist: number) => ({
      articleProvisionId: n, clauseProvisionId: n, documentId: 7, documentNumber: '69/2018/NĐ-CP', documentTitle: 't',
      articleCitation: `Điều ${n} Nghị định 69/2018/NĐ-CP`, clauseCitation: `Khoản 1 Điều ${n} Nghị định 69/2018/NĐ-CP`, path: '',
      articleBody: 'thân', clauseBody: 'thân', effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null,
      gazetteUrl: null, verification: 'auto_unverified', score: 1, bestDist, kwHit: true,
    }) as RetrievedArticle;
    const ev = (over: Partial<RetrievedEvidence>) => ({
      id: 1, kind: 'status', instrument: '69/2018/NĐ-CP', authority: 'binding', title: 'Tình trạng hiệu lực — 69/2018/NĐ-CP',
      body: '69/2018/NĐ-CP hết hiệu lực từ 05/09/2026, bị thay thế bởi 292/2026/NĐ-CP', documentNumber: '69/2018/NĐ-CP',
      effectiveFrom: null, effectiveTo: null, effectiveness: 'con_hieu_luc', verification: 'auto_unverified', status: null,
      ends: [], window: 'current', score: 1, bestDist: null, hsHeading: null, hsChapter: null, hsCodes: [], meta: {}, ...over,
    }) as RetrievedEvidence;
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([clause(73, 0.3), clause(74, 0.35), clause(80, 0.7)]);
    (namedStatus as jest.Mock).mockResolvedValueOnce([
      ev({ ends: [{ from: '2026-09-05', by: '292/2026/NĐ-CP', relation: 'thay_the', scope: null }] }),
    ]);
    (hsCodeSections as jest.Mock).mockResolvedValueOnce([
      ev({ id: 4, kind: 'annex_table', title: '69/2018/NĐ-CP — Bảng 1', body: 'STT | Tên | Mã\n1 | máy | 8471.30.20', documentNumber: null }),
    ]);
    (evidenceRetrieve as jest.Mock).mockResolvedValueOnce([
      ev({ id: 2, kind: 'guidance', authority: 'authoritative', title: 'Hướng dẫn thủ tục', documentNumber: null, bestDist: 0.33 }),
      ev({ id: 3, kind: 'note', authority: 'reference', title: 'Ghi chú xa', documentNumber: null, bestDist: 0.5 }),
    ]);
    (generate as jest.Mock).mockResolvedValueOnce({
      answer: 'Nghị định 69/2018/NĐ-CP đã hết hiệu lực từ 05/09/2026 [3]. Thủ tục vẫn nêu ở điều khoản [2].',
      citations: [3, 2], abstain: false, reason: null,
    });
    const res = await new LegalController(svc).ask('Nghị định 69/2018/NĐ-CP còn áp dụng không, mã 8471.30.20', '2026-09-14');
    const seen = ((generate as jest.Mock).mock.calls.at(-1)![2] as PromptSource[]).map((s) => [s.label, s.note]);
    // Recorded from ask() at 8494c75, before it was split into scope() and gather().
    const expired = '69/2018/NĐ-CP ĐÃ HẾT HIỆU LỰC từ 05/09/2026 theo 292/2026/NĐ-CP';
    expect(seen).toEqual([
      ['Điều 73 Nghị định 69/2018/NĐ-CP', null],
      ['Điều 74 Nghị định 69/2018/NĐ-CP', null],
      ['Tình trạng hiệu lực — 69/2018/NĐ-CP', expired],
      ['69/2018/NĐ-CP — Bảng 1', null],
      ['Hướng dẫn thủ tục', 'tài liệu hướng dẫn áp dụng của cơ quan hải quan, không phải văn bản quy phạm pháp luật'],
    ]);
    expect(res.answer).toBe('Nghị định 69/2018/NĐ-CP đã hết hiệu lực từ 05/09/2026 [1]. Thủ tục vẫn nêu ở điều khoản [2].');
    expect(res.citations.map((c) => [c.provisionLabel, c.kind ?? 'provision', c.note ?? null, c.expired ?? null])).toEqual([
      ['Tình trạng hiệu lực — 69/2018/NĐ-CP', 'status', null, expired],
      ['Khoản 1 Điều 74 Nghị định 69/2018/NĐ-CP', 'provision', null, null],
    ]);
  });
});

describe('LegalService.scope and gather — the halves POST /answer calls (plan 08 Việc 8)', () => {
  const dialect = new PgDialect();
  const embedding = { embed: async () => [0] } as never;

  it('scope reports a circular named only by serial and ministry as missing, with the catalogue candidates', async () => {
    // 1st query: the Công báo serial + issuer lookup; 2nd: the corpus manifest, which holds neither candidate.
    const results: unknown[][] = [[gazette('36/2019/TT-BKHCN', 'thong_tu'), gazette('36/2016/TT-BKHCN', 'thong_tu')], [{ number: '38/2015/TT-BTC' }]];
    const s = await new LegalService({ execute: async () => results.shift() ?? [] } as never, embedding).scope('thông tư 36 của bộ KHCN');
    expect(s).toMatchObject({ requestedDoc: null, missingDoc: 'Thông tư 36 của Bộ Khoa học và Công nghệ', gazetteMatchKind: 'ambiguous' });
    expect(s.gazetteMatches.map((g) => g.number)).toEqual(['36/2019/TT-BKHCN', '36/2016/TT-BKHCN']);
  });

  it('gather pins the headings it is given, not the ones the question spells, with room for each note and two chapter notes', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      execute: async (q: SQL) => {
        queries.push(dialect.sqlToQuery(q));
        return [];
      },
    };
    (headingSections as jest.Mock).mockImplementationOnce(jest.requireActual('./legal.evidence').headingSections);
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([]);
    const headings = ['38.24', '33.07', '30.04', '30.05'];
    await new LegalService(db as never, embedding).gather('Mã HS 8471.30.20 dùng được không', { asOf: '2026-09-14', headings, cases: true });
    expect((headingSections as jest.Mock).mock.calls.at(-1)![1]).toEqual(headings);
    expect((caseSections as jest.Mock).mock.calls.at(-1)![1]).toEqual(headings);
    const notes = queries.find((q) => q.sql.includes("e.kind = 'en'"))!;
    expect(notes.params).toEqual(expect.arrayContaining(headings));
    expect(notes.params.at(-1)).toBe(10); // 4 headings + 2 × 3 chapters
  });

  it('gather keeps at most 8 pins: status, sections naming an asked code, EN, SEN, chapter notes, cases, then the rest', async () => {
    const pin = (id: number, kind: string, hsCodes: string[] = []) =>
      ({
        id, kind, instrument: 'x', authority: 'binding', title: `${kind} ${id}`, body: 'thân', documentNumber: null, effectiveFrom: null,
        effectiveTo: null, effectiveness: 'con_hieu_luc', verification: 'verified', status: null, ends: [], window: 'current', score: 1,
        bestDist: null, hsHeading: null, hsChapter: null, hsCodes, meta: {}, hitText: null,
      }) as RetrievedEvidence;
    (namedStatus as jest.Mock).mockResolvedValueOnce([pin(1, 'status')]);
    (hsCodeSections as jest.Mock).mockResolvedValueOnce([pin(12, 'annex_table'), pin(2, 'annex_table', ['8481.80.99'])]);
    (headingSections as jest.Mock).mockResolvedValueOnce([pin(3, 'en'), pin(4, 'en'), pin(7, 'hs_note'), pin(8, 'hs_note'), pin(9, 'hs_note')]);
    (senSections as jest.Mock).mockResolvedValueOnce([pin(5, 'sen', ['8481.80.64']), pin(6, 'sen')]);
    (caseSections as jest.Mock).mockResolvedValueOnce([pin(10, 'ruling'), pin(11, 'ruling')]);
    const { sources } = await new LegalService({ execute: async () => [] } as never, embedding).gather('Van 8481.80.99 dùng cho gì', {
      asOf: '2026-09-14', hsCodes: ['8481.80.99'], headings: ['84.81'], clauses: 0, cases: true, sen: 2,
    });
    expect(sources.map((s) => s.key)).toEqual(['e:1', 'e:2', 'e:3', 'e:4', 'e:5', 'e:6', 'e:7', 'e:8']);
    // SEN is ranked by heading alone: no asked code reaches its query.
    expect((senSections as jest.Mock).mock.calls.at(-1)!.slice(1)).toEqual([['84.81'], '2026-09-14', 2]);
  });

  it('gather with clauses 0 searches no statute clauses', async () => {
    (hybridRetrieve as jest.Mock).mockClear();
    const res = await new LegalService({ execute: async () => [] } as never, embedding).gather('Căn cứ phân loại miếng dán', { asOf: '2026-09-14', clauses: 0 });
    expect(hybridRetrieve).not.toHaveBeenCalled();
    expect(res).toEqual({ asOf: '2026-09-14', sources: [] });
  });

  it('gather keys every source and carries its HS columns and the list metadata a policy check reads', async () => {
    const article = {
      articleProvisionId: 73, clauseProvisionId: 74, documentId: 7, documentNumber: '69/2018/NĐ-CP', documentTitle: 't',
      articleCitation: 'Điều 73', clauseCitation: 'Khoản 2 Điều 73', path: '', articleBody: 'toàn điều', clauseBody: 'khoản',
      effectiveness: 'con_hieu_luc', effectiveFrom: '2018-05-15', effectiveTo: null, gazetteUrl: null, verification: 'verified',
      score: 1, bestDist: 0.3, kwHit: true,
    } as RetrievedArticle;
    const annex = {
      id: 36, kind: 'annex_table', instrument: '36/2026/TT-BKHCN', authority: 'binding', title: '36/2026/TT-BKHCN — Bảng 4',
      body: 'STT | Tên | Mã\n2 | Mũ bảo hiểm | 6506.10.10', documentNumber: '36/2026/TT-BKHCN', effectiveFrom: '2026-07-01',
      effectiveTo: null, effectiveness: 'con_hieu_luc', verification: 'auto_unverified', status: null, ends: [], window: 'current',
      score: 1, bestDist: null, hsHeading: null, hsChapter: null, hsCodes: ['6506', '6506.10', '6506.10.10'], meta: { anchor: 'Phụ lục II' },
      hitText: null,
    } as RetrievedEvidence;
    const ruling = { ...annex, id: 812, kind: 'ruling', title: 'CV 1483', body: 'thân', hsHeading: '85.09', hsChapter: 85, hsCodes: [], meta: { case_id: 'c#1', ahtn_2022: { trang_thai: 'hien_hanh' }, hs2022: '8509.40' } };
    (hybridRetrieve as jest.Mock).mockResolvedValueOnce([article]);
    (hsCodeSections as jest.Mock).mockResolvedValueOnce([annex]);
    (caseSections as jest.Mock).mockResolvedValueOnce([ruling]);
    const { sources } = await new LegalService({ execute: async () => [] } as never, embedding).gather('Mũ bảo hiểm 6506.10.10', {
      asOf: '2026-09-14',
      headings: ['85.09'],
      cases: true,
    });
    expect(sources.map((s) => [s.key, s.hs])).toEqual([
      ['p:73', { heading: null, chapter: null, codes: [] }],
      ['e:36', { heading: null, chapter: null, codes: ['6506', '6506.10', '6506.10.10'] }],
      ['e:812', { heading: '85.09', chapter: 85, codes: [] }],
    ]);
    expect(sources[0]!.body).toBe('toàn điều');
    expect(sources[0]!.meta).toEqual({
      hs_codes: [], document_number: '69/2018/NĐ-CP', anchor: 'Khoản 2 Điều 73', effective_from: '2018-05-15', effective_to: null,
      effectiveness: 'con_hieu_luc', verification: 'verified',
    });
    expect(sources[1]!.meta).toEqual({
      anchor: 'Phụ lục II', hs_codes: ['6506', '6506.10', '6506.10.10'], document_number: '36/2026/TT-BKHCN', effective_from: '2026-07-01',
      effective_to: null, effectiveness: 'con_hieu_luc', verification: 'auto_unverified',
    });
    // Passed through untouched: hs2022 travels in meta, not as a field of its own.
    expect(sources[2]!.meta).toMatchObject({ case_id: 'c#1', ahtn_2022: { trang_thai: 'hien_hanh' }, hs2022: '8509.40' });
  });
});

describe('legal.evidence SQL — cases out of ranking, a cap per heading, the matched window (review of Việc 8)', () => {
  const actual = jest.requireActual<typeof import('./legal.evidence')>('./legal.evidence');
  const dialect = new PgDialect();
  const capture = (rows: unknown[] = []) => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = { execute: async (q: SQL) => (queries.push(dialect.sqlToQuery(q)), rows) } as never;
    return { db, queries };
  };

  it('evidenceRetrieve drops cases and their windows inside both branches, before their limits spend slots', async () => {
    const { db, queries } = capture();
    await actual.evidenceRetrieve(db, { queryText: 'máy xay sinh tố', queryVec: [0], asOf: '2026-09-14' });
    for (const branch of ['kw', 'vec']) {
      const cte = queries[0]!.sql.match(new RegExp(`\\b${branch} AS \\(([\\s\\S]*?)LIMIT`))![1]!;
      expect(cte).toContain("e.meta->>'case_id' IS NULL");
      expect(cte).toContain("c.source_ref = e.meta->>'parent'");
    }
  });

  it('evidenceRetrieve carries the text of the closest window a section was found by', async () => {
    const { db, queries } = capture([{ id: 5, kind: 'en', body: 'cha', hit_text: 'cửa sổ 3', score: 1, best_dist: 0.3, meta: {} }]);
    const [e] = await actual.evidenceRetrieve(db, { queryText: 'máy xay', queryVec: [0], asOf: '2026-09-14' });
    expect(queries[0]!.sql).toMatch(/array_agg\(CASE WHEN par\.id IS NOT NULL THEN w\.body END ORDER BY f\.best_dist NULLS LAST/);
    expect(e!.hitText).toBe('cửa sổ 3');
  });

  it('caseSections caps each heading, so an early heading cannot crowd out a later one', async () => {
    const { db, queries } = capture();
    await actual.caseSections(db, ['38.24', '30.05', '85.09'], '2026-09-14');
    const q = queries[0]!;
    expect(q.sql).toMatch(/row_number\(\) OVER \(PARTITION BY e\.hs_heading ORDER BY e\.id\) AS rn/);
    expect(q.sql).toMatch(/x\.rn <= \$\d+/);
    expect(q.params.at(-1)).toBe(2);
    expect(q.sql).not.toContain('LIMIT');
  });

  it('headingSections puts every chapter\'s own note ahead of any subheading note, so a cut takes subheading notes first', async () => {
    const { db, queries } = capture();
    await actual.headingSections(db, ['38.24', '30.05', '85.09', '84.81'], '2026-09-14');
    expect(queries[0]!.sql).toMatch(/ORDER BY CASE e\.kind WHEN 'en' THEN 0 ELSE 1 END, e\.hs_heading, \(e\.title LIKE 'Chú giải phân nhóm%'\), e\.hs_chapter, e\.id\s+LIMIT/);
  });

  it('senSections ranks each heading\'s SEN rows by the first code under it, then id, and returns a row filed under two headings once', async () => {
    const { db, queries } = capture([{ id: 5, kind: 'sen', meta: {} }, { id: 5, kind: 'sen', meta: {} }, { id: 6, kind: 'sen', meta: {} }]);
    const rows = await actual.senSections(db, ['39.01', '39.02'], '2026-09-14');
    expect(rows.map((e) => e.id)).toEqual([5, 6]);
    const q = queries[0]!;
    expect(q.sql).toContain("e.kind = 'sen'");
    expect(q.sql).toMatch(/PARTITION BY h\.heading ORDER BY u\.first_code NULLS LAST, e\.id/);
    expect(q.params).toEqual(expect.arrayContaining(['39.01', '39.02']));
    expect(q.params.at(-1)).toBe(2);
  });
});

describe('LegalService.provision — the verbatim path carries verification (R18)', () => {
  it('selects the document verification so the bot can warn on auto-ingested text', async () => {
    const dialect = new PgDialect();
    const queries: string[] = [];
    const db = {
      execute: async (q: SQL) => {
        queries.push(dialect.sqlToQuery(q).sql);
        return queries.length === 1 ? [{ id: 1, number: '08/2015/NĐ-CP', title: 't', docType: 'nghi_dinh', consolidates: null }] : [];
      },
    };
    await new LegalService(db as never, {} as never).provision('08/2015/NĐ-CP', '18');
    expect(queries[queries.length - 1]).toContain('d.verification AS verification');
  });
});
