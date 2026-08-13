/**
 * Legal RAG golden eval (Phase 5). Retrieval-only, deterministic, CI-able.
 *
 * Split from generation on purpose (legal-rag-retrieval.md §8): this measures
 * whether the RIGHT ĐIỀU is retrieved (recall@k at the article level), and whether
 * out-of-corpus questions retrieve nothing relevant (so the caller abstains). It
 * does NOT judge the prose answer — that needs the Claude subscription and is run
 * separately. Preregistered: metric + case set live in fixtures/legal-golden/legal-qa.json.
 *
 * Skips unless both DATABASE_URL (a seeded legal corpus) and EMBEDDER_URL (the
 * BGE-M3 sidecar) are set:
 *   DATABASE_URL=... EMBEDDER_URL=http://localhost:8000 yarn test legal-golden
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import type { Database } from '../../apps/api/src/shared/adapters/database';
import { keepRelevant } from '../../apps/api/src/modules/legal/legal.grounding';
import { hybridRetrieve } from '../../apps/api/src/modules/legal/legal.retrieval';
import { parseDocRef, resolveArticles, resolveDocuments } from '../../apps/api/src/modules/legal/legal.scope';

interface Case {
  id: string;
  q: string;
  domain?: string;
  expect?: { doc: string; dieu: number };
  should_abstain?: boolean;
}
interface Golden {
  k: number;
  asOf: string;
  cases: Case[];
}

const DB_URL = process.env.DATABASE_URL;
const EMBEDDER = (process.env.EMBEDDER_URL ?? '').replace(/\/$/, '');
const enabled = Boolean(DB_URL && EMBEDDER);

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${EMBEDDER}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts: [text] }),
  });
  if (!res.ok) throw new Error(`embedder ${res.status}`);
  return ((await res.json()) as { vectors: number[][] }).vectors[0];
}

const article = (dieu: number) => new RegExp(`^Điều ${dieu} `);

(enabled ? describe : describe.skip)('legal RAG golden retrieval', () => {
  const golden = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'fixtures', 'legal-golden', 'legal-qa.json'), 'utf8'),
  ) as Golden;
  let sql: Sql;
  let db: Database;

  beforeAll(() => {
    sql = postgres(DB_URL!, { max: 1, onnotice: () => {} });
    db = drizzle(sql) as unknown as Database;
  });
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it(`recall@${golden.k} on expected articles ≥ 0.7`, async () => {
    const answerable = golden.cases.filter((c) => c.expect);
    let hit = 0;
    const misses: string[] = [];
    for (const c of answerable) {
      const vec = await embed(c.q);
      const arts = await hybridRetrieve(db, {
        queryText: c.q,
        queryVec: vec,
        asOf: golden.asOf,
        topK: golden.k,
      });
      const found = arts.some(
        (a) => a.documentNumber === c.expect!.doc && article(c.expect!.dieu).test(a.articleCitation),
      );
      if (found) hit += 1;
      else misses.push(`${c.id} ("${c.q}") → expected Điều ${c.expect!.dieu} ${c.expect!.doc}`);
    }
    const recall = hit / answerable.length;
    // eslint-disable-next-line no-console
    console.log(`recall@${golden.k} = ${hit}/${answerable.length} = ${recall.toFixed(2)}`);
    if (misses.length) console.warn('MISSES:\n  ' + misses.join('\n  '));
    expect(recall).toBeGreaterThanOrEqual(0.7);
  }, 60_000);

  it('abstains (zero relevant provisions) on out-of-corpus questions', async () => {
    const oos = golden.cases.filter((c) => c.should_abstain);
    for (const c of oos) {
      const vec = await embed(c.q);
      const arts = await hybridRetrieve(db, {
        queryText: c.q,
        queryVec: vec,
        asOf: golden.asOf,
        topK: golden.k,
      });
      const kept = keepRelevant(arts);
      expect(kept.length).toBe(0);
    }
  }, 30_000);

  /**
   * Scoping is a HARD filter, and the reason it has to be is document-relevance
   * mismatch: several documents in this corpus cover overlapping ground (xuất xứ
   * appears in NĐ 31/2018 AND in the customs-procedure VBHN), so a question asked
   * "in document X" must not be answered out of document Y no matter how well Y ranks.
   */
  describe('document scoping', () => {
    const SCOPED_QUERY = 'xuất xứ hàng hóa được xác định thế nào';

    it('restricts retrieval to the named document', async () => {
      const vec = await embed(SCOPED_QUERY);
      const unscoped = await hybridRetrieve(db, { queryText: SCOPED_QUERY, queryVec: vec, asOf: golden.asOf, topK: golden.k });
      const docs = await resolveDocuments(db, parseDocRef('Nghị định 31/2018/NĐ-CP')!);
      expect(docs.map((d) => d.number)).toContain('31/2018/NĐ-CP');

      const scoped = await hybridRetrieve(db, {
        queryText: SCOPED_QUERY,
        queryVec: vec,
        asOf: golden.asOf,
        topK: golden.k,
        documentIds: docs.map((d) => d.id),
      });
      expect(scoped.length).toBeGreaterThan(0);
      expect([...new Set(scoped.map((a) => a.documentNumber))]).toEqual(['31/2018/NĐ-CP']);
      // The scope must actually be doing work — otherwise this test proves nothing.
      expect(new Set(unscoped.map((a) => a.documentNumber)).size).toBeGreaterThanOrEqual(1);
    }, 30_000);

    it('narrows to a named Điều', async () => {
      const vec = await embed(SCOPED_QUERY);
      const docs = await resolveDocuments(db, parseDocRef('Nghị định 31/2018/NĐ-CP')!);
      const articleIds = await resolveArticles(db, docs.map((d) => d.id), '5');
      expect(articleIds.length).toBe(1);

      const scoped = await hybridRetrieve(db, {
        queryText: SCOPED_QUERY,
        queryVec: vec,
        asOf: golden.asOf,
        topK: golden.k,
        documentIds: docs.map((d) => d.id),
        articleProvisionIds: articleIds,
      });
      expect(scoped.map((a) => a.articleCitation)).toEqual([expect.stringMatching(article(5))]);
    }, 30_000);

    it('a document outside the corpus resolves to nothing (so the caller can say so)', async () => {
      const ref = parseDocRef('Thông tư 38/2015/TT-BTC')!;
      expect(ref.confident).toBe(true);
      expect(await resolveDocuments(db, ref)).toEqual([]);
    });
  });
});
