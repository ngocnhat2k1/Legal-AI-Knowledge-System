/**
 * The 14 notebook questions (fixtures/legal-golden/notebook-qa.json), scored through
 * HTTP the way a person's question travels, against GET /legal (prose + verbatim
 * citations). A check the response cannot carry (evidence kinds, plan intent, warnings)
 * is SKIPPED, not failed — the baseline must not punish /legal for lacking fields it
 * never had; milestone 3's POST /answer will carry them. A case
 * where no check ran at all is UNSCORED: neither passed nor failed, and never counted
 * towards the safety group — a pass nobody checked is not a pass.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface NotebookCase {
  id: string;
  q: string;
  safety?: boolean;
  expect?: { doc: string; dieu: number };
  expectEvidence?: Array<{ kind: string; instrument?: string; hsHeading?: string; phan?: string }>;
  expectIntent?: string;
  expectWarnings?: string[];
  mustSay?: string[];
  mustNotSay?: string[];
  should_abstain?: boolean;
  note?: string;
}

export interface AnswerLike {
  abstained?: boolean;
  answer?: string;
  answerMd?: string;
  warnings?: string[];
  plan?: { intent?: string };
  citations?: Array<{
    documentNumber?: string;
    articleLabel?: string;
    verbatimText?: string;
    quote?: string;
    kind?: string;
    instrument?: string;
    hsHeading?: string;
    phan?: string;
  }>;
}

export interface CaseResult {
  id: string;
  safety: boolean;
  /** At least one check actually ran (a missing response counts as a failed check). */
  scored: boolean;
  /** scored and nothing failed. */
  passed: boolean;
  failed: string[];
  skipped: string[];
}

export interface NotebookMetrics {
  cases: number;
  passed: number;
  safetyPassed: number;
  safetyTotal: number;
  /** Cases where every check was skipped — not in `passed`, `safetyPassed` or `misses`. */
  unscored: number;
  unscoredCases: string[];
  skippedChecks: number;
  misses: string[];
}

/** `*` is dropped: /legal answers are Markdown, and `**không** bao gồm` must still contain "không bao gồm". */
export const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\*+/g, '').replace(/\s+/g, ' ').trim();

/** What the reader sees: the prose plus every quoted/verbatim citation text. */
export function visibleText(r: AnswerLike): string {
  const parts = [r.answer ?? '', r.answerMd ?? ''];
  for (const c of r.citations ?? []) parts.push(c.verbatimText ?? '', c.quote ?? '');
  return parts.join('\n');
}

export function scoreCase(c: NotebookCase, r: AnswerLike | null): CaseResult {
  const failed: string[] = [];
  const skipped: string[] = [];
  const safety = Boolean(c.safety);
  if (!r) return { id: c.id, safety, scored: true, passed: false, failed: ['no-response'], skipped };

  let ran = 0;
  const text = norm(visibleText(r));
  ran += (c.mustSay?.length ?? 0) + (c.mustNotSay?.length ?? 0);
  for (const s of c.mustSay ?? []) if (!text.includes(norm(s))) failed.push(`mustSay:${s}`);
  for (const s of c.mustNotSay ?? []) if (text.includes(norm(s))) failed.push(`mustNotSay:${s}`);

  if (c.expect) {
    ran++;
    const re = new RegExp(`^Điều ${c.expect.dieu}\\b`);
    const hit = (r.citations ?? []).some((x) => x.documentNumber === c.expect!.doc && re.test(x.articleLabel ?? ''));
    if (!hit) failed.push(`expect:${c.expect.doc} Điều ${c.expect.dieu}`);
  }

  if (c.should_abstain) {
    ran++;
    const abstained = r.abstained || !(r.citations ?? []).length;
    if (!abstained) failed.push('should_abstain');
  }

  if (c.expectEvidence) {
    const carries = (r.citations ?? []).some((x) => x.kind);
    if (!carries) skipped.push('expectEvidence');
    else {
      ran += c.expectEvidence.length;
      for (const e of c.expectEvidence) {
        const ok = (r.citations ?? []).some(
          (x) =>
            x.kind === e.kind &&
            (!e.instrument || x.instrument === e.instrument) &&
            (!e.hsHeading || x.hsHeading === e.hsHeading) &&
            (!e.phan || x.phan === e.phan),
        );
        if (!ok) failed.push(`expectEvidence:${e.kind} ${e.instrument ?? e.hsHeading ?? e.phan ?? ''}`.trim());
      }
    }
  }

  if (c.expectIntent) {
    if (!r.plan) skipped.push('expectIntent');
    else {
      ran++;
      if (r.plan.intent !== c.expectIntent) failed.push(`expectIntent:${c.expectIntent}`);
    }
  }

  if (c.expectWarnings) {
    if (!Array.isArray(r.warnings)) skipped.push('expectWarnings');
    else {
      ran += c.expectWarnings.length;
      for (const w of c.expectWarnings) if (!r.warnings.includes(w)) failed.push(`expectWarnings:${w}`);
    }
  }

  const scored = ran > 0;
  return { id: c.id, safety, scored, passed: scored && failed.length === 0, failed, skipped };
}

export function summarize(results: CaseResult[]): NotebookMetrics {
  const safetyCases = results.filter((r) => r.safety);
  const unscored = results.filter((r) => !r.scored);
  return {
    cases: results.length,
    passed: results.filter((r) => r.passed).length,
    safetyPassed: safetyCases.filter((r) => r.passed).length,
    safetyTotal: safetyCases.length,
    unscored: unscored.length,
    unscoredCases: unscored.map((r) => `${r.id} (bỏ qua: ${r.skipped.join(', ') || 'không có kiểm nào'})`),
    skippedChecks: results.reduce((n, r) => n + r.skipped.length, 0),
    misses: results.filter((r) => r.scored && !r.passed).map((r) => `${r.id}: ${r.failed.join(' · ')}`),
  };
}

async function ask(apiUrl: string, q: string, asOf: string): Promise<AnswerLike | null> {
  try {
    const res = await fetch(`${apiUrl}/legal?${new URLSearchParams({ q, asOf })}`);
    return res.ok ? ((await res.json()) as AnswerLike) : null;
  } catch {
    return null;
  }
}

export async function evalNotebook(apiUrl: string): Promise<NotebookMetrics> {
  const golden = JSON.parse(readFileSync(join(process.cwd(), 'fixtures', 'legal-golden', 'notebook-qa.json'), 'utf8')) as {
    asOf: string;
    cases: NotebookCase[];
  };
  const results: CaseResult[] = [];
  for (const c of golden.cases) results.push(scoreCase(c, await ask(apiUrl, c.q, golden.asOf)));
  return summarize(results);
}
