import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { generate } from './legal.generation';
import { hybridRetrieve, type RetrievedArticle } from './legal.retrieval';
import { LegalService } from './legal.service';

jest.mock('./legal.generation', () => ({ generate: jest.fn() }));
jest.mock('./legal.retrieval', () => ({ hybridRetrieve: jest.fn() }));

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
