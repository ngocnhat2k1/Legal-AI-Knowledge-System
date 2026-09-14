/**
 * POST /answer (plan 08 §2.1, Việc 10): one turn of the composed answer path. The plan (claude #1, or the plan the bot
 * sends back), code roles decided in code, retrieval, compose (claude #2), the code guards, at most one repair (claude #3),
 * then the response formatAnswerMd renders. Every model reads masked text only; the user's code meets the result in
 * `userCodes`, compared here (R4). Nothing on this path writes lookup_confirmation (§6.3).
 */
import { BadRequestException, HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION, type Database } from '../../shared/adapters/database';
import { extractAsOf, isIsoDate, todayVN } from '../legal/legal.asof';
import { expandMarkers } from '../legal/legal.grounding';
import { AUTHORITY_NOTE, type DocScope, type GatherOpts, LegalService, type Source } from '../legal/legal.service';
import { foldDocNumber } from '../legal/legal.scope';
import { ConfirmationService } from '../tariff/confirmation.service';
import { TariffService } from '../tariff/tariff.service';
import type { RateView, TariffResponse } from '../tariff/tariff.types';
import type { Effort } from './claude';
import { buildComposeInput, buildRepairPrompt, type ComposeMode, parseDraft, parseRepair, SYSTEM } from './compose';
import { type Source as GuardSource, quoteInBody, splitSentences, verify } from './guards';
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
/**
 * NĐ 169/2026/NĐ-CP (in force 2026-07-01, khoản 2 Điều 38) ends 128/2020/NĐ-CP in full and Điều 2 of 102/2021/NĐ-CP, yet
 * the corpus still holds 128/2020 as in force and no 169/2026: their clauses and evidence would state penalties no longer
 * law. Their status rows stay because they carry no figure — but until relations name 169/2026 (or 128/2020's
 * effective_to is set) the 128/2020 row still reads "còn hiệu lực", with no `expired` for G7 to check.
 * Notes restating the old penalty table carry no document number and pass this filter; the re-exported notes fix them.
 * ponytail: a hard drop, no historical exception; lift it once 169/2026's status rows and clauses are ingested.
 */
const ENDED_PENALTY_DOCS = ['128/2020/NĐ-CP', '102/2021/NĐ-CP'].map(foldDocNumber);
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

    // Every code the conversation carries, the message's first: [mã n] in any plan is codes[n - 1]. The whole message
    // extends the book, since the plan read only its first 600 characters.
    const { codes } = maskCodes(q, planParts({ text: q, quote, topic, state, turns, documents: [] }).codes);
    const forced = INTENTS.includes(body.forceIntent as Intent) ? (body.forceIntent as Intent) : null;
    let plan: Plan;
    if (body.plan != null) {
      const given = normalizePlan(body.plan, [q, quote ?? '', ...turns.filter((t) => t.role === 'user').map((t) => t.body)]);
      fallback = !given;
      const p = given ?? defaultPlan(q, topic);
      // A plan from the client is text a prompt reads: every text of it masked again, so no raw code reaches a model (R4).
      // A partial plan (the bot's tariff branch) has no question: the masked message stands in.
      const mask = (s: string): string => maskCodes(s, codes).text;
      plan = {
        ...p,
        understanding: p.understanding && mask(p.understanding),
        question: mask(p.question || q),
        queries: p.queries.map(mask),
        goods: { facts: p.goods.facts.map(mask), missing: p.goods.missing.map(mask) },
      };
    } else if (forced) {
      plan = defaultPlan(q, topic);
    } else {
      const step = await timed('plan', async () =>
        planStep({ text: q, quote, topic, state, turns, documents: await this.legal.documents().catch(() => []) }, this.run),
      );
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
    // "còn từ Nhật thì sao": a tariff turn naming no code, forced by the bot or reusing the last code, looks up the code the
    // state holds — a key the user did not write this turn, so no userCodes line, and its digits reach no prompt (R4).
    const reuses = intent === 'tariff' && role === 'none' && (forced === 'tariff' || plan.reuseLastHs);
    const held = reuses && /^\d{4}\.\d{2}\.\d{2}$/.test(String(state.tariff?.dotted)) ? userCodes(state.tariff!.dotted!) : [];
    if (held.length) role = 'key';
    const keys = [...users, ...held];
    const mode: ComposeMode | null = PROSE.includes(intent) ? (intent as ComposeMode) : intent === 'tariff' && role === 'key' ? 'tariff' : null;

    const finish = async (part: Partial<AnswerResponse>, lines?: Map<string, string | null>): Promise<AnswerResponse> => {
      const known = lines ?? (await timed('verify', () => this.hsLines(users.map((u) => digits(u.code)))));
      const candidates = part.candidates ?? [];
      const res: AnswerResponse = {
        plan,
        codeRole: role,
        mode,
        // A chapter has no heading to compare (§2.4). The user's heading meets each candidate's heading, as the bot's line
        // speaks of groups (§5 item 3): a deeper candidate under that heading counts. A bare heading the user also wrote as
        // a deeper code ("thuộc 3005 hay 3824, mã 3005.10.10") is that code's line already.
        userCodes: users
          .filter((u) => u.heading && !(u.level === 4 && users.some((o) => o.level > 4 && o.heading === u.heading)))
          .map((u) => ({
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

    if (body.planOnly === true) return finish(scoped(await timed('retrieve', () => this.legal.scope(q, plan.scope.doc))));
    if (!mode) return finish({}); // general, confirm, correction, a tariff question without a code: the bot's branches

    const asOf = isIsoDate(body.asOf) ? body.asOf : (extractAsOf(q) ?? todayVN());
    const code8 = keys.find((u) => u.level === 8);
    const tariff =
      code8 && (mode === 'tariff' || (mode === 'mixed' && role === 'subject'))
        ? await timed('retrieve', () => this.lookup(digits(code8.code), plan.origin, plan.date ?? asOf))
        : null;
    if (mode === 'tariff' && !tariff) return finish({ asOf });

    const doc = LEGAL.includes(mode) ? await timed('retrieve', () => this.legal.scope(q, plan.scope.doc)) : undefined;
    if (doc?.missingDoc) return finish({ asOf, tariff, ...scoped(doc) });
    const common = { asOf, tariff, ...scoped(doc) };

    // Premise, key and none: the [mã n] labels go before retrieval and compose. A subject gets back its own codes, the
    // message's; a code from the quote, an old turn or the state line was given no role and never comes back (§6.2).
    const own = new Set(users.map((u) => digits(u.code)));
    const unmask = (s: string): string =>
      s
        .replace(CODE_MARK, (m) => {
          const code = codes[Number(m.replace(/\D/g, '')) - 1] ?? '';
          return role === 'subject' && own.has(digits(code)) ? code : '';
        })
        .replace(/\s+([,.?!;:])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const message = unmask(maskCodes(q, codes).text);
    const question = unmask(plan.question) || message;
    const understanding = unmask(plan.understanding ?? '');
    const goods = { facts: plan.goods.facts.map(unmask).filter(Boolean), missing: plan.goods.missing.map(unmask).filter(Boolean) };
    const previousQuestion = plan.intent === 'refine' || plan.refines ? unmask(maskCodes(state.answer?.question ?? '', codes).text) || null : null;
    // R4 on rate lines: a key's statements stay, that code's digits taken out with a sub-line's tail ("8481.80.99.10" →
    // "dòng"); a premise code is never looked up, and a line still naming a user code is dropped by the latch below.
    const key = role === 'key' && code8 ? new RegExp(String.raw`(?<!\d)${digits(code8.code).match(/\d{2}/g)!.join(String.raw`[.\s]?`)}(?:[.\s]?\d{2})?(?!\d)`, 'g') : null;
    const tariffLines = tariff ? rateLines(tariff).map((line) => (key ? line.replace(key, 'dòng') : line)) : [];

    let parts: PromptPart[] = [
      { name: 'message', text: message },
      { name: 'question', text: question },
      { name: 'understanding', text: understanding },
      { name: 'goods', text: [...goods.facts, ...goods.missing].join('\n') },
      { name: 'previousQuestion', text: previousQuestion ?? '' },
      // One part per rate line and per query: the latch drops only the one naming the code.
      ...tariffLines.map((text) => ({ name: 'tariffLines', text })),
      ...plan.queries.map((query) => ({ name: 'queries', text: unmask(query) })),
    ];
    if (role === 'premise' || role === 'key') {
      // What the model is told about the question and what retrieval runs on, never the evidence: D1 lets a premise heading's notes in.
      const latch = assertNoUserCodes(parts, keys, role);
      parts = latch.parts;
      leakDrops.push(...latch.leakDrops);
    }
    const kept = (name: string): string[] => parts.filter((p) => p.name === name).map((p) => p.text);
    // Fail closed before retrieval: nothing is left to ask, and no query runs on the user's code.
    if (!kept('message').length || !kept('question').length) return finish(common);

    const queries = [...new Set([question, ...kept('queries')])].filter(Boolean).slice(0, 3);
    const ownHeadings = [...new Set(users.flatMap((u) => (u.heading ? [u.heading] : [])))];
    const hints = [...new Set(plan.hsHints.map(headingOf))].slice(0, 5);
    // Pins go on the first query only, and always explicitly: a default would read the user's code from the question (D1).
    const pins: GatherOpts =
      mode === 'hs'
        ? // Owner decision D1: a premise's own heading joins the blind hints unlabelled, in number order; its code never does.
          { hsCodes: [], headings: [...new Set([...hints, ...(role === 'premise' ? ownHeadings : [])])].sort(), clauses: 0, cases: true, sen: 2 }
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
      .filter((s) => s.citation.kind === 'status' || !ENDED_PENALTY_DOCS.includes(foldDocNumber(s.citation.documentNumber)))
      .filter((s) => !seen.has(s.key) && Boolean(seen.add(s.key)))
      .slice(0, MAX_SOURCES);
    sourceCount = sources.length;
    // Tariff mode explains from the statements alone; with none left, the bot prints the rate block by itself (Q1).
    if (!sources.length && (mode !== 'tariff' || !kept('tariffLines').length)) return finish(common);
    // Compose skipped or failed: the sources alone, so the bot still prints them and their end-of-force line from data
    // (§10 risk 1, G7). No prose cites them, so they claim no quote (R10).
    const warningsOf = (listed: typeof sources): string[] => [
      ...(listed.some((s) => s.citation.verification === 'auto_unverified') ? ['unverified'] : []),
      ...(listed.some((s) => s.note?.includes(AUTHORITY_NOTE.undetermined!)) ? ['undetermined'] : []),
      ...(listed.some((s) => s.note?.includes('CHƯA CÓ HIỆU LỰC')) ? ['upcoming'] : []),
      ...(listed.some(oldCatalog) ? ['old_catalog'] : []),
    ];
    const listed = sources.slice(0, 3);
    const sourcesOnly = { ...common, citations: listed.map((s, i) => citationOf(i + 1, s, [])), warnings: warningsOf(listed) };
    const timeoutMs = Math.min(100_000, deadline - Date.now() - 5_000);
    if (timeoutMs < 15_000) return finish(sourcesOnly);

    const tariffMode = mode === 'tariff';
    const prompt = buildComposeInput({
      mode,
      asOf,
      message,
      understanding: kept('understanding')[0] ?? '',
      question,
      goods: kept('goods').length ? goods : { facts: [], missing: [] },
      previousQuestion: kept('previousQuestion')[0] || null,
      facts: [...new Set(sources.flatMap((s) => (s.citation.expired ? [s.citation.expired] : [])))],
      tariffLines: kept('tariffLines'),
      sources: sources.map(({ label, note, text }) => ({ label, note, text })),
      maxSourceChars: Number(process.env.ANSWER_PROMPT_CHARS) || 40_000,
    });
    calls++;
    // ponytail: in hs mode compose's interim hs prompt stands in for the classification walkthrough until walkthrough.ts (c8) exports a non-empty walkthroughSchema.
    // R4: where ClassifyInput is built here, the rate-line filter above applies to its tariffLines and to every candidate line singling out the user's code.
    const reply = await timed('compose', () =>
      this.run(prompt, {
        timeoutMs,
        systemPrompt: SYSTEM,
        model: tariffMode ? 'sonnet' : process.env.ANSWER_COMPOSE_MODEL || 'opus',
        effort: tariffMode ? 'medium' : (process.env.ANSWER_COMPOSE_EFFORT as Effort | undefined) || 'high',
      }),
    );
    const parsed = reply && !reply.isError ? parseDraft(reply.text) : null;
    if (!parsed) return finish(sourcesOnly);
    // Markers as verify reads them ("[1, 2]" → "[1] [2]", one out of range gone), so the sentence verify names is the
    // draft's own for a repair and for the first-sentence rule.
    const draft = { ...parsed, answerMd: expandMarkers(parsed.answerMd, sources.length) };

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
    let gone: string[] = [];
    const broken = [...new Set(checked.violations.flatMap((v) => (v.sentence && !v.repairOnly ? [v.sentence] : [])))];
    const violations = checked.violations;
    const items = broken
      .map((sentence) => ({
        sentence,
        rule: [...new Set(violations.filter((v) => v.sentence === sentence).map((v) => v.rule))].join(', '),
        // Only quotes G2 holds: a made-up quote would license the very figure that was cut.
        quotes: [
          ...new Set(
            [...sentence.matchAll(/\[(\d+)\]/g)].flatMap(([, k]) => {
              const n = Number(k);
              return (draft.citations.find((c) => c.n === n)?.quotes ?? []).filter((text) => sources[n - 1] && quoteInBody(text, sources[n - 1]!.body));
            }),
          ),
        ],
      }))
      .filter((it) => {
        // The latch before every spawn (§4.2 step 4): a sentence or quote copied from evidence may name the user's own code.
        // D1 lets its heading in, never a deeper code; such an item is not sent, and its sentence stays cut.
        if (role !== 'premise' && role !== 'key') return true;
        const drops = assertNoUserCodes([{ name: 'repair', text: [it.sentence, ...it.quotes].join('\n') }], keys.filter((u) => u.level > 4), 'key').leakDrops;
        leakDrops.push(...drops);
        return !drops.length;
      });
    if (items.length && Date.now() - start < 90_000 && deadline - Date.now() >= 30_000) {
      calls++;
      const out = await timed('repair', () =>
        this.run(buildRepairPrompt(items), { timeoutMs: Math.min(30_000, deadline - Date.now() - 3_000), model: 'sonnet', effort: 'low' }),
      );
      const rewritten = out && !out.isError ? parseRepair(out.text, items.length) : null;
      if (rewritten) {
        repaired = true;
        // A sentence the repair gave up on ('') is cut, like one still in violation (§4.1).
        gone = items.flatMap((it, i) => (rewritten[i] ? [] : [it.sentence]));
        // Expanded again: a repair that writes "[1, 2]" back must still meet verify's sentence for the first-sentence rule.
        const answerMd = expandMarkers(items.reduce((md, it, i) => md.replace(it.sentence, () => rewritten[i]!), draft.answerMd), sources.length);
        final = { ...draft, answerMd };
        checked = await timed('verify', async () => verify({ ...draft, answerMd }, guardSources, ctx));
      }
    }

    // First sentence cut, or more than a third of the draft's sentences: sources only (§4.1).
    const said = splitSentences(draft.answerMd);
    const cut = checked.cut + gone.length;
    const firstCut =
      gone.includes(said[0] ?? '') || checked.violations.some((v) => v.sentence !== undefined && v.sentence.trim() === splitSentences(final.answerMd)[0]);
    const answerMd = firstCut || cut * 3 > said.length ? '' : checked.answerMd;
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
        // G11's ruling is optional: a failed lookup never costs the verified answer.
        ruling: mode === 'hs' ? await timed('verify', () => this.rulingFor(goods.facts, candidates).catch(() => null)) : null,
        // G4 asks for the deciding facts once two candidates stand: none from compose, so the plan's stand in (filtered, latched).
        missingFacts: final.missingFacts.length || candidates.length < 2 ? final.missingFacts : kept('goods').length ? goods.missing.slice(0, 3) : [],
        coverage: answerMd ? final.coverage : 'none',
        warnings: warningsOf(cited),
        cut,
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

/** A row's catalogue standing as its evidence meta records it: anything but "hien_hanh…" names codes of an old catalogue. */
const oldCatalog = (s: Source): boolean => {
  const status = (s.meta?.ahtn_2022 as { trang_thai?: unknown } | undefined)?.trang_thai;
  return typeof status === 'string' && !status.startsWith('hien_hanh');
};

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
