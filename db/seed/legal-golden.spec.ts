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
});
