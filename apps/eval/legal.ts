/**
 * Legal RAG measured through the SAME HTTP path a person's question takes — document
 * scoping, hybrid retrieval, the relevance gate, generation, and citation validation
 * all included.
 *
 * `db/seed/legal-golden.spec.ts` measures the retrieval FUNCTION underneath and stays
 * as it is; the two are deliberately different altitudes. M2 will change the layer on
 * top (multi-query, rerank) without touching the layer below, and only a measurement
 * at this altitude would notice if that made real answers worse.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Case {
  id: string;
  q: string;
  expect?: { doc: string; dieu: number };
  should_abstain?: boolean;
}

interface Golden {
  k: number;
  asOf: string;
  cases: Case[];
}

export interface LegalMetrics {
  cases: number;
  k: number;
  /** Share of answerable questions whose citations include the governing Điều. */
  recallAtK: number;
  abstainCorrect: number;
  abstainTotal: number;
  /** Share of answerable questions that came back with prose AND at least one citation. */
  citationsValid: number;
  misses: string[];
}

interface LegalAnswer {
  abstained: boolean;
  answer: string;
  citations: Array<{ documentNumber: string; articleLabel: string }>;
}

const articleRe = (dieu: number) => new RegExp(`^Điều ${dieu} `);

export async function evalLegal(apiUrl: string): Promise<LegalMetrics> {
  const golden = JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures', 'legal-golden', 'legal-qa.json'), 'utf8'),
  ) as Golden;

  const answerable = golden.cases.filter((c) => c.expect);
  const abstainCases = golden.cases.filter((c) => c.should_abstain);
  const misses: string[] = [];
  let hit = 0;
  let cited = 0;

  for (const c of answerable) {
    const r = await ask(apiUrl, c.q, golden.asOf);
    const found = (r?.citations ?? []).some(
      (x) => x.documentNumber === c.expect!.doc && articleRe(c.expect!.dieu).test(x.articleLabel),
    );
    if (found) hit += 1;
    else misses.push(`${c.id}: mong Điều ${c.expect!.dieu} ${c.expect!.doc} — nhận ${describe(r)}`);
    if (r && !r.abstained && r.answer && r.citations.length > 0) cited += 1;
  }

  let abstainCorrect = 0;
  for (const c of abstainCases) {
    const r = await ask(apiUrl, c.q, golden.asOf);
    // An abstention here is any of: the service said so, or it produced nothing to
    // stand on. Both are honest; answering an out-of-corpus question is not.
    if (!r || r.abstained || r.citations.length === 0) abstainCorrect += 1;
    else misses.push(`${c.id}: đáng lẽ phải từ chối — nhưng đã trả lời bằng ${describe(r)}`);
  }

  return {
    cases: answerable.length,
    k: golden.k,
    recallAtK: answerable.length ? hit / answerable.length : 0,
    abstainCorrect,
    abstainTotal: abstainCases.length,
    citationsValid: answerable.length ? cited / answerable.length : 0,
    misses,
  };
}

function describe(r: LegalAnswer | null): string {
  if (!r) return 'lỗi gọi API';
  if (r.abstained) return 'từ chối trả lời';
  const labels = r.citations.map((c) => c.articleLabel).join(' · ');
  return labels || 'câu trả lời không trích dẫn gì';
}

async function ask(apiUrl: string, q: string, asOf: string): Promise<LegalAnswer | null> {
  const qs = new URLSearchParams({ q, asOf });
  try {
    const res = await fetch(`${apiUrl}/legal?${qs}`);
    return res.ok ? ((await res.json()) as LegalAnswer) : null;
  } catch {
    return null;
  }
}
