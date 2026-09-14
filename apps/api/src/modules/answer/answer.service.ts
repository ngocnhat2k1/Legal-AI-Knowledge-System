/**
 * POST /answer (plan 08 §2.1, Việc 10): one turn of the composed answer path. The plan (claude #1, or the plan the bot
 * sends back), code roles decided in code, retrieval, compose (claude #2), the code guards, at most one repair (claude #3),
 * then the response formatAnswerMd renders. Every model reads masked text only; the user's code meets the result in
 * `userCodes`, compared here (R4). Nothing on this path writes lookup_confirmation (§6.3).
 */
import { BadRequestException, HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import { extractAsOf } from '../legal/legal.asof';
import { type DocScope, type GatherOpts, LegalService, type Source } from '../legal/legal.service';
import { ConfirmationService } from '../tariff/confirmation.service';
import { TariffService } from '../tariff/tariff.service';
import type { RateView, TariffResponse } from '../tariff/tariff.types';
import type { Effort } from './claude';
import { buildComposeInput, buildRepairPrompt, type ComposeMode, parseDraft, parseRepair, SYSTEM } from './compose';
import { type Source as GuardSource, splitSentences, verify } from './guards';
import {
  assertNoUserCodes,
  CODE_MARK,
  type CodeRole,
  codeRole,
  defaultPlan,
  type Intent,
  INTENTS,
  maskCodes,
  normalizePlan,
  type Plan,
  type PlanState,
  planParts,
  planStep,
  type PromptPart,
  type Runner,
  type UserCode,
  userCodes,
} from './plan';

/** Provider token of the model runner: runClaude in the app, a fake in the spec. */
export const CLAUDE_RUNNER = Symbol('CLAUDE_RUNNER');

const MAX_Q_CHARS = 2000;
/** The p95 gate of a composed turn (owner decision Q3): `deadlineAt` is clamped to it. */
const BUDGET_MS = 120_000;
const MAX_SOURCES = 12;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROSE = ['hs', 'legal', 'status', 'mixed'];
const LEGAL = ['legal', 'status', 'mixed'];

export interface AnswerRequest {
  q: string;
  quote?: string | null;
  asOf?: string | null;
  planOnly?: boolean;
  context?: { topic?: string | null; state?: PlanState | null; turns?: Array<{ role: string; body: string }> | null } | null;
  /** The plan a planOnly call returned; skips claude #1. */
  plan?: unknown;
  forceIntent?: string | null;
  /** ISO time or epoch ms: when the bot got the message, plus 120 s. */
  deadlineAt?: string | number | null;
}

/** One source the answer cites, in the fields formatAnswerMd reads; `kind` null = a statute clause. */
export interface AnswerCitation {
  n: number;
  key: string;
  kind: string | null;
  label: string;
  instrument: string | null;
  hsHeading: string | null;
  /** Only quotes found verbatim in the source body. */
  quotes: string[];
  note: string | null;
  verification: string;
  expired: string | null;
  effectiveness: string;
  effectiveFrom: string | null;
  documentNumber: string;
  url: string | null;
}

export interface AnswerResponse {
  plan: Plan;
  codeRole: CodeRole;
  mode: ComposeMode | null;
  userCodes: Array<UserCode & { exists: boolean; inCandidates: boolean }>;
  /** plan.understanding when it names no [mã n] and every digit in it is the user's; else null. */
  ack: string | null;
  asOf: string | null;
  answerMd: string;
  citations: AnswerCitation[];
  candidates: Array<{ hs: string; level: number; title: string | null; evidence: number[] }>;
  /** A code a person confirmed for similar goods under a candidate heading (G11): printed by the bot, never prompted. */
  ruling: { dotted: string; staffName: string; note: string | null } | null;
  missingFacts: string[];
  coverage: 'full' | 'partial' | 'none';
  warnings: string[];
  cut: number;
  repaired: boolean;
  depth: 'brief';
  missingDoc: string | null;
  gazetteMatchKind: DocScope['gazetteMatchKind'];
  gazetteMatches: DocScope['gazetteMatches'];
  /** The /tariff lookup a tariff or mixed answer reasoned over, so the bot prints its block without a second call. */
  tariff: TariffResponse | null;
  calls: number;
  timingMs: Record<'plan' | 'retrieve' | 'compose' | 'verify' | 'repair', number>;
}

@Injectable()
export class AnswerService {
  private readonly log = new Logger(AnswerService.name);

  constructor(
    private readonly legal: LegalService,
    private readonly tariff: TariffService,
    private readonly confirmation: ConfirmationService,
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    @Inject(CLAUDE_RUNNER) private readonly run: Runner,
  ) {}

  async answer(body: AnswerRequest): Promise<AnswerResponse> {
    const start = Date.now();
    const q = typeof body?.q === 'string' ? body.q.trim() : '';
    if (!q) throw new BadRequestException('q must be a non-empty string');
    if (q.length > MAX_Q_CHARS) throw new BadRequestException(`q must be at most ${MAX_Q_CHARS} characters`);
    const quote = typeof body.quote === 'string' && body.quote.trim() ? body.quote : null;
    const context = body.context ?? {};
    const topic = typeof context.topic === 'string' ? context.topic : null;
    const state: PlanState = context.state && typeof context.state === 'object' ? context.state : {};
    const turns = (Array.isArray(context.turns) ? context.turns : [])
      .filter((t) => typeof t?.body === 'string')
      .map((t) => ({ role: String(t.role), body: t.body }));
    const deadline = deadlineOf(body.deadlineAt, start);

    const timingMs = { plan: 0, retrieve: 0, compose: 0, verify: 0, repair: 0 };
    const timed = async <T>(step: keyof typeof timingMs, work: () => Promise<T>): Promise<T> => {
      const t = Date.now();
      try {
        return await work();
      } finally {
        timingMs[step] += Date.now() - t;
      }
    };
    let calls = 0;
    let fallback = false;
    let sourceCount = 0;
    const leakDrops: string[] = [];

    // Every code the conversation carries, the message's first: [mã n] in any plan is codes[n - 1].
    const { codes } = planParts({ text: q, quote, topic, state, turns, documents: [] });
    const forced = INTENTS.includes(body.forceIntent as Intent) ? (body.forceIntent as Intent) : null;
    let plan: Plan;
    if (body.plan != null) {
      const given = normalizePlan(body.plan, [q, quote ?? '', ...turns.filter((t) => t.role === 'user').map((t) => t.body)]);
      fallback = !given;
      const p = given ?? defaultPlan(q, topic);
      // A plan from the client is text a prompt reads: masked again, so no raw code reaches a model (R4). A partial
      // plan (the bot's tariff branch) has no question: the masked message stands in.
      const mask = (s: string): string => maskCodes(s, codes).text;
      plan = { ...p, question: mask(p.question || q), queries: p.queries.map(mask) };
    } else if (forced) {
      plan = defaultPlan(q, topic);
    } else {
      const documents = await this.legal.documents().catch(() => []);
      const step = await timed('plan', () => planStep({ text: q, quote, topic, state, turns, documents }, this.run));
      plan = step.plan;
      calls += step.calls;
      fallback = step.fallback;
      leakDrops.push(...step.leakDrops);
    }
    if (forced) plan = { ...plan, intent: forced };

    const users = userCodes(q);
    let role = codeRole(q, plan); // a rate code under a plan that is not tariff is already a premise
    let intent: Intent = plan.intent;
    if (intent === 'refine') {
      const prior = state.answer?.mode ?? '';
      intent = PROSE.includes(prior) ? (prior as Intent) : 'hs';
    }
    // §4.2: a subject is only a lookup key for legal, status or mixed; a premise turns those into hs.
    if (role === 'subject' && !LEGAL.includes(intent)) role = 'premise';
    if (role === 'premise' && LEGAL.includes(intent)) intent = 'hs';
    const mode: ComposeMode | null = PROSE.includes(intent) ? (intent as ComposeMode) : intent === 'tariff' && role === 'key' ? 'tariff' : null;

    const finish = async (part: Partial<AnswerResponse>, lines?: Map<string, string | null>): Promise<AnswerResponse> => {
      const known = lines ?? (await this.hsLines(users.map((u) => digits(u.code))));
      const candidates = part.candidates ?? [];
      const res: AnswerResponse = {
        plan,
        codeRole: role,
        mode,
        // Candidates are four digits or deeper, so "the user's heading is a prefix of a candidate" covers both directions.
        userCodes: users.map((u) => ({
          ...u,
          exists: known.has(digits(u.code)),
          inCandidates: candidates.some((c) => digits(c.hs).startsWith(digits(u.code).slice(0, 4))),
        })),
        ack: ackOf(plan.understanding, q),
        asOf: null,
        answerMd: '',
        citations: [],
        candidates: [],
        ruling: null,
        missingFacts: [],
        coverage: 'none',
        warnings: [],
        cut: 0,
        repaired: false,
        depth: 'brief',
        missingDoc: null,
        gazetteMatchKind: 'none',
        gazetteMatches: [],
        tariff: null,
        ...part,
        calls,
        timingMs,
      };
      // One line per turn and no user text in it (R14): dropped prompt parts by name only.
      this.log.log(
        JSON.stringify({ mode, intent: plan.intent, codeRole: role, calls, sources: sourceCount, cut: res.cut, repaired: res.repaired, fallback, leakDrops, timingMs }),
      );
      return res;
    };

    if (body.planOnly) return finish(scoped(await timed('retrieve', () => this.legal.scope(q, plan.scope.doc))));
    if (!mode) return finish({}); // general, confirm, correction, a tariff question without a code: the bot's branches

    const today = new Date().toISOString().slice(0, 10);
    const asOf = typeof body.asOf === 'string' && ISO_DATE.test(body.asOf) ? body.asOf : (extractAsOf(q) ?? today);
    const code8 = users.find((u) => u.level === 8);
    const tariff =
      code8 && (mode === 'tariff' || (mode === 'mixed' && role === 'subject'))
        ? await timed('retrieve', () => this.lookup(digits(code8.code), plan.origin, plan.date ?? today))
        : null;
    if (mode === 'tariff' && !tariff) return finish({ asOf });
    const tariffLines = tariff ? rateLines(tariff) : [];

    const doc = LEGAL.includes(mode) ? await timed('retrieve', () => this.legal.scope(q, plan.scope.doc)) : undefined;
    if (doc?.missingDoc) return finish({ asOf, tariff, ...scoped(doc) });

    // Premise, key and none: the [mã n] labels go before retrieval and compose; a subject's codes come back as written.
    const unmask = (s: string): string =>
      (role === 'subject' ? s.replace(CODE_MARK, (m) => codes[Number(m.replace(/\D/g, '')) - 1] ?? '') : s.replace(CODE_MARK, ''))
        .replace(/\s+([,.?!;:])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const message = unmask(maskCodes(q, codes).text);
    const question = unmask(plan.question) || message;
    const previousQuestion = plan.intent === 'refine' || plan.refines ? unmask(maskCodes(state.answer?.question ?? '', codes).text) || null : null;

    const queries = [...new Set([question, ...plan.queries.map(unmask)])].filter(Boolean).slice(0, 3);
    const ownHeadings = [...new Set(users.flatMap((u) => (u.heading ? [u.heading] : [])))];
    const hints = [...new Set(plan.hsHints.map(headingOf))].slice(0, 5);
    // Pins go on the first query only, and always explicitly: a default would read the user's code from the question (D1).
    const pins: GatherOpts =
      mode === 'hs'
        ? // Owner decision D1: a premise's own heading joins the blind hints unlabelled, in number order; its code never does.
          { hsCodes: [], headings: [...new Set([...hints, ...(role === 'premise' ? ownHeadings : [])])].sort(), clauses: 0, cases: true }
        : role === 'subject'
          ? { hsCodes: users.filter((u) => u.level === 8).map((u) => u.code), headings: ownHeadings, cases: false }
          : { hsCodes: [], headings: [], cases: false };
    const rest: GatherOpts = { hsCodes: [], headings: [], cases: false, ...(mode === 'hs' ? { clauses: 0 } : {}) };
    const gathered = await timed('retrieve', () =>
      Promise.all(queries.map((query, i) => this.legal.gather(query, { asOf, doc, article: plan.scope.article, ...(i ? rest : pins) }))),
    );
    // ponytail: first-seen order across queries (the pinned first query leads), no re-rank by bestDist; rank when a pinned note falls past the cap.
    const seen = new Set<string>();
    const sources = gathered
      .flatMap((g) => g.sources)
      .filter((s) => !seen.has(s.key) && Boolean(seen.add(s.key)))
      .slice(0, MAX_SOURCES);
    sourceCount = sources.length;
    const common = { asOf, tariff, ...scoped(doc) };
    if (!sources.length && mode !== 'tariff') return finish(common);

    let parts: PromptPart[] = [
      { name: 'message', text: message },
      { name: 'question', text: question },
      { name: 'understanding', text: plan.understanding ?? '' },
      { name: 'goods', text: [...plan.goods.facts, ...plan.goods.missing].join('\n') },
      { name: 'previousQuestion', text: previousQuestion ?? '' },
      { name: 'tariffLines', text: tariffLines.join('\n') },
    ];
    if (role === 'premise' || role === 'key') {
      // What the model is told about the question, never the evidence: D1 lets a premise heading's notes in.
      const latch = assertNoUserCodes(parts, users, role);
      parts = latch.parts;
      leakDrops.push(...latch.leakDrops);
    }
    const kept = (name: string): boolean => parts.some((p) => p.name === name);
    const timeoutMs = Math.min(100_000, deadline - Date.now() - 5_000);
    if (!kept('message') || !kept('question') || timeoutMs < 15_000) return finish(common); // fail closed

    const tariffMode = mode === 'tariff';
    const prompt = buildComposeInput({
      mode,
      asOf,
      message,
      understanding: kept('understanding') ? (plan.understanding ?? '') : '',
      question,
      goods: kept('goods') ? plan.goods : { facts: [], missing: [] },
      previousQuestion: kept('previousQuestion') ? previousQuestion : null,
      facts: [...new Set(sources.flatMap((s) => (s.citation.expired ? [s.citation.expired] : [])))],
      tariffLines: kept('tariffLines') ? tariffLines : [],
      sources: sources.map(({ label, note, text }) => ({ label, note, text })),
      maxSourceChars: Number(process.env.ANSWER_PROMPT_CHARS) || 40_000,
    });
    calls++;
    // ponytail: in hs mode compose's interim hs prompt stands in for the classification walkthrough until walkthrough.ts (c8) exports a non-empty walkthroughSchema.
    const reply = await timed('compose', () =>
      this.run(prompt, {
        timeoutMs,
        systemPrompt: SYSTEM,
        model: tariffMode ? 'sonnet' : process.env.ANSWER_COMPOSE_MODEL || 'opus',
        effort: tariffMode ? 'medium' : (process.env.ANSWER_COMPOSE_EFFORT as Effort | undefined) || 'high',
      }),
    );
    const draft = reply && !reply.isError ? parseDraft(reply.text) : null;
    if (!draft) return finish(common);

    const guardSources = sources.map(guardSource);
    const lines = await timed('verify', () => this.hsLines([...draft.candidates.map((c) => digits(c.hs).slice(0, 4)), ...users.map((u) => digits(u.code))]));
    const ctx = {
      userText: q,
      codeRole: role,
      userCodes: users.map((u) => u.code),
      headings: new Set([...lines.keys()].filter((p) => p.length === 4).map(headingOf)),
    };
    let final = draft;
    let checked = await timed('verify', async () => verify(draft, guardSources, ctx));

    let repaired = false;
    const broken = [...new Set(checked.violations.flatMap((v) => (v.sentence && !v.repairOnly ? [v.sentence] : [])))];
    if (broken.length && Date.now() - start < 90_000 && deadline - Date.now() >= 30_000) {
      const violations = checked.violations;
      const items = broken.map((sentence) => ({
        sentence,
        rule: [...new Set(violations.filter((v) => v.sentence === sentence).map((v) => v.rule))].join(', '),
        quotes: [...sentence.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)]
          .flatMap(([, list]) => list!.split(',').map(Number))
          .flatMap((n) => draft.citations.find((c) => c.n === n)?.quotes ?? []),
      }));
      calls++;
      const out = await timed('repair', () =>
        this.run(buildRepairPrompt(items), { timeoutMs: Math.min(30_000, deadline - Date.now() - 3_000), model: 'sonnet', effort: 'low' }),
      );
      const rewritten = out && !out.isError ? parseRepair(out.text, items.length) : null;
      if (rewritten) {
        repaired = true;
        const answerMd = items.reduce((md, it, i) => md.replace(it.sentence, () => rewritten[i]!), draft.answerMd);
        final = { ...draft, answerMd };
        checked = await timed('verify', async () => verify({ ...draft, answerMd }, guardSources, ctx));
      }
    }

    // First sentence cut, or more than a third of them: sources only (§4.1).
    const said = splitSentences(final.answerMd);
    const firstCut = checked.violations.some((v) => v.sentence !== undefined && v.sentence.trim() === said[0]);
    const answerMd = firstCut || checked.cut * 3 > said.length ? '' : checked.answerMd;
    const candidates = checked.candidates.map((c) => ({
      hs: c.hs,
      level: digits(c.hs).length,
      title: lines.get(digits(c.hs).slice(0, 4)) ?? null,
      evidence: c.evidence,
    }));
    const cited = checked.citations.map((c) => sources[c.source]!);
    return finish(
      {
        ...common,
        answerMd,
        citations: checked.citations.map((c) => citationOf(c.n, sources[c.source]!, c.quotes)),
        candidates,
        ruling: mode === 'hs' ? await this.rulingFor(plan.goods.facts, candidates) : null,
        missingFacts: final.missingFacts,
        coverage: answerMd ? final.coverage : 'none',
        warnings: [
          ...(cited.some((s) => s.citation.verification === 'auto_unverified') ? ['unverified'] : []),
          ...(cited.some((s) => s.note?.includes('CHƯA CÓ HIỆU LỰC')) ? ['upcoming'] : []),
        ],
        cut: checked.cut,
        repaired,
      },
      lines,
    );
  }

  /** A code the tariff path refuses (not 8 digits, bad origin, no rate that day) is left to the bot's own tariff branch. */
  private async lookup(hs: string, origin: string | null, date: string): Promise<TariffResponse | null> {
    try {
      return await this.tariff.lookup(hs, origin ?? undefined, date);
    } catch (e) {
      if (e instanceof HttpException) return null;
      throw e;
    }
  }

  /** G11: the newest confirmed code for goods like these, only under a candidate heading. */
  private async rulingFor(facts: string[], candidates: Array<{ hs: string }>): Promise<AnswerResponse['ruling']> {
    if (!facts.length || !candidates.length) return null;
    const heads = candidates.map((c) => digits(c.hs).slice(0, 4));
    const hit = (await this.confirmation.matchByProduct(facts.join(' '))).find((m) => heads.some((h) => m.hs.startsWith(h)));
    return hit ? { dotted: `${hit.hs.slice(0, 4)}.${hit.hs.slice(4, 6)}.${hit.hs.slice(6)}`, staffName: hit.staffName, note: hit.note } : null;
  }

  /** Digit prefixes with at least one hs_description line, each with the heading text of its first line (the table holds 8-digit codes only). */
  private async hsLines(prefixes: string[]): Promise<Map<string, string | null>> {
    const wanted = [...new Set(prefixes)].filter((p) => /^\d{2,8}$/.test(p));
    if (!wanted.length) return new Map();
    const rows = (await this.db.execute(sql`
      SELECT v.prefix, d.heading
      FROM (VALUES ${sql.join(
        wanted.map((p) => sql`(${p}::text)`),
        sql`, `,
      )}) AS v(prefix)
      CROSS JOIN LATERAL (
        SELECT heading FROM hs_description WHERE hs_code LIKE (v.prefix || '%') ORDER BY hs_code LIMIT 1
      ) d
    `)) as unknown as Array<{ prefix: string; heading: string | null }>;
    return new Map(rows.map((r) => [r.prefix, r.heading]));
  }
}

const digits = (s: string): string => s.replace(/\D/g, '');

/** "3005", "300510" or "30.05" → "30.05". */
const headingOf = (s: string): string => {
  const d = digits(s);
  return `${d.slice(0, 2)}.${d.slice(2, 4)}`;
};

/** `deadlineAt` as ISO or epoch ms, never later than now + 120 s; absent or unreadable = now + 120 s. */
function deadlineOf(raw: unknown, now: number): number {
  const cap = now + BUDGET_MS;
  if (raw == null || raw === '') return cap;
  const t = typeof raw === 'number' ? raw : /^\d+$/.test(String(raw)) ? Number(raw) : Date.parse(String(raw));
  return Number.isFinite(t) ? Math.min(t, cap) : cap;
}

const ackOf = (understanding: string | null, q: string): string | null =>
  understanding && !/\[mã \d+\]/u.test(understanding) && (understanding.match(/\d+/g) ?? []).every((d) => q.includes(d)) ? understanding : null;

const scoped = (doc?: DocScope): Partial<AnswerResponse> =>
  doc ? { missingDoc: doc.missingDoc, gazetteMatchKind: doc.gazetteMatchKind, gazetteMatches: doc.gazetteMatches } : {};

/** Each schedule's statement: which schedule applies when, for compose to explain and never restate. */
const rateLines = (t: TariffResponse): string[] => [
  ...[t.import.mfn, ...t.import.preferential, t.import.outOfQuota, ...t.import.chapter98, t.export]
    .filter((v): v is RateView => v !== null)
    .map((v) => `${v.scheduleName}: ${v.statement}`),
  ...t.antiDumping.map((a) => a.statement),
];

/**
 * The label is the one the model read above the body. For a clause that is the article citation: the body is the whole
 * article, and the clause label would anchor "khoản 1" for a quote from another clause (G3).
 */
const guardSource = (s: Source): GuardSource => ({
  kind: s.citation.kind ?? 'provision',
  label: s.label,
  body: s.body,
  hsHeading: s.hs.heading,
  hsCodes: s.hs.codes,
  documentNumber: s.citation.documentNumber,
  expired: s.citation.expired ?? null,
});

const citationOf = (n: number, s: Source, quotes: string[]): AnswerCitation => ({
  n,
  key: s.key,
  kind: s.citation.kind ?? null,
  label: s.label,
  instrument: s.citation.instrument ?? null,
  hsHeading: s.hs.heading,
  quotes,
  note: s.citation.note ?? null,
  verification: s.citation.verification,
  expired: s.citation.expired ?? null,
  effectiveness: s.citation.effectiveness,
  effectiveFrom: s.citation.effectiveFrom,
  documentNumber: s.citation.documentNumber,
  url: s.citation.gazetteUrl,
});
