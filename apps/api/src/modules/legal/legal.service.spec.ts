import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { evidenceInstruments, evidenceRetrieve, hsCodeSections, namedStatus, type RetrievedEvidence } from './legal.evidence';
import { generate, type PromptSource } from './legal.generation';
import { hybridRetrieve, type RetrievedArticle } from './legal.retrieval';
import { LegalService } from './legal.service';

jest.mock('./legal.generation', () => ({ generate: jest.fn() }));
jest.mock('./legal.retrieval', () => ({ hybridRetrieve: jest.fn() }));
jest.mock('./legal.evidence', () => ({
  evidenceInstruments: jest.fn(async () => []),
  evidenceRetrieve: jest.fn(async () => []),
  namedStatus: jest.fn(async () => []),
  hsCodeSections: jest.fn(async () => []),
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
    verification: 'auto_unverified', status: null, ends: [], window: 'current', score: 1, bestDist: 0.9, ...over,
  });
  const svc = () => new LegalService({ execute: async () => [] } as never, { embed: async () => [0] } as never);
  const lastSources = () => (generate as jest.Mock).mock.calls.at(-1)![2] as PromptSource[];

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
    expect(nd85!.expired).toBeNull();
    expect(nd85!.note).toContain('sẽ hết hiệu lực từ 15/10/2026 theo 336/2026/NĐ-CP');
    expect(nd85!.note).not.toContain('CHƯA CÓ HIỆU LỰC'); // 85/2019 is in force until then
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
