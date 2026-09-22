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
import { buildComposeInput, buildRepairPrompt, type ComposeMode, looseJson, parseDraft, parseRepair, SYSTEM } from './compose';
import { dotted, EVIDENCE_KINDS, type Source as GuardSource, names, quoteInBody, splitSentences, verify } from './guards';
import { POLICY_LISTS } from './policy';
import {
  assertNoUserCodes,
  citedDocs,
  CODE_MARK,
  type CodeRole,
  codeRole,
  defaultPlan,
  fold,
  type Intent,
  INTENTS,
  type LlmError,
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
import { buildWalkthroughPrompt, lineText, normalizeWalkthrough, validateWalkthrough } from './walkthrough';
import {
  applyRepair,
  assessedOf,
  candidateHeadings,
  classifyInput,
  conclusionOf,
  cutSentences,
  evidenceRow,
  flatten,
  type HeadingLines,
  ORDER,
  factsBlock,
  unfinished,
  CUT_ALL,
  policyBlock,
  repairItems,
  verifySections,
  WALKTHROUGH_SYSTEM,
} from './walkthrough.run';

/** Provider token of the model runner: runClaude in the app, a fake in the spec. */
export const CLAUDE_RUNNER = Symbol('CLAUDE_RUNNER');

const MAX_Q_CHARS = 2000;
/** The p95 gate of a composed turn (owner decision Q3, raised 2026-09-15): `deadlineAt` is clamped to it. */
const BUDGET_MS = 150_000;
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
/**
 * Compose budget the walkthrough needs before it may ask for `full`: full's own slowest measured run (107 s; brief 62–83 s)
 * plus a little. It is deliberately NOT the compose cap. The bot spends one /answer call on planning first, so the second
 * call never sees the whole cap — gating on the cap would make full unreachable through the bot, which is how `full` went
 * unused until 2026-09-15. Anything shorter is brief: plain paragraphs pointing at no tariff block (D3(a)).
 */
const FULL_DEPTH_MS = 110_000;
/**
 * Owner, 2026-09-22: the sectioned report came out as four Zalo messages per question. The reply is brief unless the
 * message asks for the full report: a request verb before the depth word, or "… hơn". Goods names carry the same words
 * ("bao cao su", "dây dù", "đầy đủ phụ kiện", "máy phân tích kỹ thuật số", "chi tiết máy"). Read on folded text, so an
 * unaccented "phan tich chi tiet" counts too.
 */
const WANTS_FULL =
  /\b(?:phan tich|giai thich|tra loi|viet|noi|lam ro)(?: (?:giup|cho|minh|em|lai|ro))* (?:chi tiet|ky|day du|cu the)\b(?! thuat)|\b(?:chi tiet|ky|day du|cu the) hon\b|\bbao cao (?:day du|chi tiet|phan loai)\b/;

export interface AnswerRequest {
  q: string;
  quote?: string | null;
  asOf?: string | null;
  planOnly?: boolean;
  context?: { topic?: string | null; state?: PlanState | null; turns?: Array<{ role: string; body: string }> | null } | null;
  /** The plan a planOnly call returned; skips claude #1. */
  plan?: unknown;
  forceIntent?: string | null;
  /** ISO time or epoch ms: when the bot got the message, plus the bot's ANSWER_BUDGET_MS; clamped here to BUDGET_MS. */
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
  candidates: Array<{
    hs: string;
    level: number;
    title: string | null;
    evidence: number[];
    /**
     * The one 8-digit line the walkthrough picked under this heading, with its hs_description wording; printed under the
     * heading for the specialist to decide (R2), never a rate. Null when the facts do not pick one.
     */
    line?: { code: string; text: string } | null;
  }>;
  /** A code a person confirmed for similar goods under a candidate heading (G11): printed by the bot, never prompted. */
  ruling: { dotted: string; staffName: string; note: string | null } | null;
  missingFacts: string[];
  coverage: 'full' | 'partial' | 'none';
  warnings: string[];
  cut: number;
  repaired: boolean;
  /** The walkthrough's depth; every other mode stays 'brief'. At 'full' the bot also prints a tariff block per `tariffRef` (D3(a)). */
  depth: 'brief' | 'full';
  /** At full only: the candidates' picked lines, at most two, never the user's own, dotted; the bot looks each up and prints a code-built block. */
  tariffRef: string[];
  missingDoc: string | null;
  gazetteMatchKind: DocScope['gazetteMatchKind'];
  gazetteMatches: DocScope['gazetteMatches'];
  /** The /tariff lookup a tariff or mixed answer reasoned over, so the bot prints its block without a second call. */
  tariff: TariffResponse | null;
  /** defaultPlan stood in for the plan step (no result, timeout, is_error, no usable plan); false when no plan step ran. */
  fallback: boolean;
  /** Why the plan step's model call failed when it did; the bot says so rather than answer on defaultPlan. */
  llmError: LlmError | null;
  /** Why a turn bound for compose has no prose; null for every other turn and once prose was composed, even if later cut. */
  reason: 'no_sources' | 'compose_failed' | 'deadline' | 'latch' | null;
  calls: number;
  timingMs: Record<'plan' | 'retrieve' | 'compose' | 'verify' | 'repair', number>;
}

/** What the walkthrough step needs from the turn it runs in; every text here was masked and latched by the caller (R4). */
interface WalkthroughRun {
  q: string;
  question: string;
  goodsFacts: string;
  asOf: string;
  sources: Source[];
  sourcesOnly: Partial<AnswerResponse>;
  users: UserCode[];
  keys: UserCode[];
  role: CodeRole;
  /** Codes the user typed in earlier turns: "phân tích chi tiết giúp mình" still asks about them, with no code of its own. */
  earlier: UserCode[];
  goods: { facts: string[]; missing: string[] };
  pins: GatherOpts;
  timeoutMs: number;
  deadline: number;
  start: number;
  leakDrops: string[];
  timed: <T>(step: 'plan' | 'retrieve' | 'compose' | 'verify' | 'repair', work: () => Promise<T>) => Promise<T>;
  /** One more model call spent. */
  bump: () => void;
}

/** Standing lines the bot prints whatever the prose says (§10 risk 1, G7); no prose cites them, so they claim no quote (R10). */
const warningsOf = (listed: Source[]): string[] => [
  ...(listed.some((s) => s.citation.verification === 'auto_unverified') ? ['unverified'] : []),
  ...(listed.some((s) => s.note?.includes(AUTHORITY_NOTE.undetermined!)) ? ['undetermined'] : []),
  ...(listed.some((s) => s.note?.includes('CHƯA CÓ HIỆU LỰC')) ? ['upcoming'] : []),
  ...(listed.some(oldCatalog) ? ['old_catalog'] : []),
];

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
    let llmError: LlmError | null = null;
    let sourceCount = 0;
    const leakDrops: string[] = [];

    // Every code the conversation carries, the message's first: [mã n] in any plan is codes[n - 1]. The whole message
    // extends the book, since the plan read only its first 600 characters.
    const { codes } = maskCodes(q, planParts({ text: q, quote, topic, state, turns, documents: [] }).codes);
    const forced = INTENTS.includes(body.forceIntent as Intent) ? (body.forceIntent as Intent) : null;
    let plan: Plan;
    if (body.plan != null) {
      const p = normalizePlan(body.plan, [q, quote ?? '', ...turns.filter((t) => t.role === 'user').map((t) => t.body)], citedDocs(state)) ?? defaultPlan(q, topic);
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
      llmError = step.llmError;
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
        tariffRef: [],
        missingDoc: null,
        gazetteMatchKind: 'none',
        gazetteMatches: [],
        tariff: null,
        reason: null,
        ...part,
        fallback,
        llmError,
        calls,
        timingMs,
      };
      // One line per turn and no user text in it (R14): dropped prompt parts by name only.
      this.log.log(
        JSON.stringify({
          mode, intent: plan.intent, codeRole: role, calls, sources: sourceCount, cut: res.cut, repaired: res.repaired, fallback, llmError: llmError?.kind ?? null, reason: res.reason, leakDrops, timingMs,
        }),
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
    const maskedMessage = maskCodes(q, codes).text;
    const message = unmask(maskedMessage);
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
      // The walkthrough reads the question with the masks left in ("[mã n] là mã người hỏi viết, đã che"), unlike compose,
      // which strips them for a premise. Same latch, one call: a masked text holds no digit of the code either way (R4).
      ...(mode === 'hs'
        ? [
            { name: 'walkQuestion', text: plan.question },
            { name: 'walkMessage', text: maskedMessage },
            ...plan.goods.facts.map((text) => ({ name: 'walkGoods', text })),
          ]
        : []),
    ];
    if (role === 'premise' || role === 'key') {
      // What the model is told about the question and what retrieval runs on, never the evidence: D1 lets a premise heading's notes in.
      const latch = assertNoUserCodes(parts, keys, role);
      parts = latch.parts;
      leakDrops.push(...latch.leakDrops);
    }
    const kept = (name: string): string[] => parts.filter((p) => p.name === name).map((p) => p.text);
    // Fail closed before retrieval: nothing is left to ask, and no query runs on the user's code.
    if (!kept('message').length || !kept('question').length) return finish({ ...common, reason: 'latch' });

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
    if (!sources.length && (mode !== 'tariff' || !kept('tariffLines').length)) return finish({ ...common, reason: 'no_sources' });
    // Compose skipped or failed: the sources alone, so the bot still prints them and their end-of-force line from data
    // (§10 risk 1, G7). No prose cites them, so they claim no quote (R10).
    const listed = sources.slice(0, 3);
    const sourcesOnly = { ...common, citations: listed.map((s, i) => citationOf(i + 1, s, [])), warnings: warningsOf(listed) };
    // 125 s, not 100: the walkthrough's slow tail is what overran, and a run that overruns loses everything it wrote.
    const timeoutMs = Math.min(125_000, deadline - Date.now() - 5_000);
    if (timeoutMs < 15_000) return finish({ ...sourcesOnly, reason: 'deadline' });

    if (mode === 'hs') {
      const walked = await this.walkthrough({
        q, asOf, sources, sourcesOnly, users, role, keys, goods, pins, timeoutMs, deadline, start, timed, leakDrops,
        earlier: turns.filter((t) => t.role === 'user').flatMap((t) => userCodes(t.body)),
        question: kept('walkQuestion')[0] || kept('walkMessage')[0] || '',
        goodsFacts: kept('walkGoods').join('; '),
        bump: () => void (calls += 1),
      });
      // No heading with hs_description lines to walk down, or no readable JSON: the interim compose prompt below stands in.
      if (walked) return finish(walked.part, walked.lines);
    }

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
    // hs reaches here only when the walkthrough found fewer than two candidate headings with hs_description lines: this
    // interim prompt stands in, one heading being nothing to weigh anything against.
    const reply = await timed('compose', () =>
      this.run(prompt, {
        timeoutMs,
        systemPrompt: SYSTEM,
        model: tariffMode ? 'sonnet' : process.env.ANSWER_COMPOSE_MODEL || 'opus',
        effort: tariffMode ? 'medium' : (process.env.ANSWER_COMPOSE_EFFORT as Effort | undefined) || 'high',
      }),
    );
    const parsed = reply && !reply.isError ? parseDraft(reply.text) : null;
    if (!parsed) return finish({ ...sourcesOnly, reason: 'compose_failed' });
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
    // Only the deadline bounds the repair: it is clamped to start + BUDGET_MS, so a second wall clock sized for the old
    // 120 s turn just blocked the repair ~15 s early, in exactly the slow turn it exists for.
    if (items.length && deadline - Date.now() >= 30_000) {
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

  /**
   * hs mode: the classification walkthrough (plan 08 §0, walkthrough.ts). null = not attempted, and the caller's interim
   * compose prompt stands in; anything else is the response part, the model call included in it whether it worked or not.
   */
  private async walkthrough(o: WalkthroughRun): Promise<{ part: Partial<AnswerResponse>; lines?: Map<string, string | null> } | null> {
    const { asOf, sources, users, role, keys, timed } = o;
    const pool = [...new Set([...(o.pins.headings ?? []), ...sources.flatMap((s) => (s.hs.heading ? [s.hs.heading] : []))])];
    const heads = pool.length ? await timed('retrieve', () => this.headingLines(pool)) : [];
    const known = new Map(heads.map((h) => [h.heading, h] as const));
    const chosen = candidateHeadings(o.pins.headings ?? [], sources, new Set(known.keys()));
    // One heading is no walkthrough: there is nothing to weigh it against (R2), and the prompt's whole shape is comparison.
    if (chosen.length < 2 || !o.question) return null;
    const headings = chosen.map((h) => known.get(h)!);

    // Full measured 82–107 s by its author against this 100 s cap, brief 62–83 s: full runs only with the whole cap, and a
    // run that still overruns falls to the sources (reason 'compose_failed'), which is what the bot prints either way.
    const depth = o.timeoutMs >= FULL_DEPTH_MS && WANTS_FULL.test(fold(o.q)) ? 'full' : 'brief';
    // No DÒNG THUẾ (review 2026-09-22): it could only hold each heading's first line, looked up before the model picks one,
    // and the full report's duty sentence then spoke of another line than the block under it (R6). The blocks the bot prints
    // under the picked lines carry their own conditions.
    const input = classifyInput({ question: o.question, goodsFacts: o.goodsFacts, depth, asOf, headings, sources, tariffLines: [] });
    o.bump();
    const reply = await timed('compose', () =>
      this.run(buildWalkthroughPrompt(input), {
        timeoutMs: o.timeoutMs,
        systemPrompt: WALKTHROUGH_SYSTEM,
        model: process.env.ANSWER_COMPOSE_MODEL || 'opus',
        effort: (process.env.ANSWER_COMPOSE_EFFORT as Effort | undefined) || 'high',
      }),
    );
    const parsed = reply && !reply.isError ? looseJson(reply.text) : null;
    // The walkthrough never came back (timeout, unreadable JSON). The asker still gets what code knows without it: what
    // they told us and what is still open (R3/R5). A bare source list is what a slow run used to return, and it is
    // useless to read (owner decision 2026-09-15).
    if (!parsed) return { part: { ...o.sourcesOnly, reason: 'compose_failed', answerMd: unfinished(o.goods) } };

    const guardSources = sources.map(guardSource);
    const rows = sources.map((s, i) => evidenceRow(s, i, asOf));
    // Anchors: the headings and lines the runner itself put in the prompt from hs_description. Without them G3 read every
    // candidate heading named outside a quote as ungrounded and cut 42% of the walkthrough's sentences (measured 2026-09-15).
    const ctx = {
      userText: o.q,
      codeRole: role,
      userCodes: users.map((u) => u.code),
      headings: new Set(headings.map((h) => h.heading)),
      anchors: [...headings.map((h) => h.heading), ...headings.flatMap((h) => h.lines.map((l) => l.code))],
    };
    let output = normalizeWalkthrough(parsed, input);
    let checked = await timed('verify', async () => verifySections(output, guardSources, ctx));
    const rules = await timed('verify', async () => validateWalkthrough(output, input));
    const said = checked.said;
    // The reply renders in the owner's order (flatten), not the order the model emitted, so the §4.1 opener is the first
    // ORDER section's first sentence — the same sentence verifySections' own firstCut is about.
    const opener = splitSentences(ORDER.map((k) => output.sections.find((s) => s.key === k)).find(Boolean)?.markdown ?? '')[0] ?? '';

    let repaired = false;
    const items = repairItems(output, guardSources, [...checked.violations, ...rules]).filter((it) => {
      // The latch before every spawn (§4.2 step 4): a sentence or quote copied from evidence may name the user's own code.
      if (role !== 'premise' && role !== 'key') return true;
      const drops = assertNoUserCodes([{ name: 'repair', text: [it.sentence, ...it.quotes].join('\n') }], keys.filter((u) => u.level > 4), 'key').leakDrops;
      o.leakDrops.push(...drops);
      return !drops.length;
    });
    if (items.length && o.deadline - Date.now() >= 30_000) {
      o.bump();
      const out = await timed('repair', () =>
        this.run(buildRepairPrompt(items), { timeoutMs: Math.min(30_000, o.deadline - Date.now() - 3_000), model: 'sonnet', effort: 'low' }),
      );
      const rewritten = out && !out.isError ? parseRepair(out.text, items.length) : null;
      if (rewritten) {
        repaired = true;
        output = applyRepair(output, items, rewritten);
      }
    }
    // Whatever the section checks still name after the one repair pass is taken out, repaired or not: they cut nothing on
    // their own, and they own the rules verify() does not (a list claim, a risk score, a persona, an uncited source).
    const after = await timed('verify', async () => validateWalkthrough(output, input));
    const gone = new Set(after.flatMap((v) => (v.sentence ? [v.sentence] : [])));
    output = cutSentences(output, gone);
    checked = await timed('verify', async () => verifySections(output, guardSources, ctx));
    // Nothing of the model's prose stood: the sources alone, as compose falls back, so the bot still prints them and their
    // end-of-force lines instead of "thử lại sau ít phút".
    if (!checked.sections.length) return { part: { ...o.sourcesOnly, reason: 'compose_failed', answerMd: unfinished(o.goods) } };

    // §4.1, as compose: the answer's own first sentence cut, or more than a third of what it wrote.
    const cut = said - checked.said + checked.cut;
    const dropped = checked.firstCut || gone.has(opener) || cut * 3 > said || !checked.sections.length;
    const conclusion = conclusionOf(output);
    const at = new Map(checked.citations.map((c) => [c.source + 1, c.n]));
    const assessed = new Map(assessedOf(output).map((c) => [c.heading, c]));
    const block = new Map(input.candidates.map((c) => [c.heading, new Set(c.evidence.map((r) => r.id))]));
    // R10: a candidate's [n] must back THAT heading — an evidence-kind row the prompt printed under it (its own rows, and
    // the shared Chú giải and GIR the prompt gives every heading), or one whose label or surviving quote names it; never a
    // note, an internal table or a plain provision. verify()'s own G5 pass never sees these, since each section is verified
    // with candidates: [] (walkthrough.run.ts), so this is the only place the rule is held.
    const backs = (h: string, id: number): boolean => {
      const s = guardSources[id - 1];
      if (!s || !EVIDENCE_KINDS.has(s.kind)) return false;
      if (block.get(h)?.has(id)) return true;
      const qs = checked.citations.find((c) => c.source === id - 1)?.quotes ?? [];
      return s.hsHeading === h || s.hsCodes.some((c) => digits(c).startsWith(digits(h))) || [s.label, ...qs].some((t) => names(t, digits(h)));
    };
    // Owner 2026-09-22 ("hs code 8 số"): the one LINES line the model picked under a heading, printed by the bot under that
    // candidate with its catalogue wording; never in prose (G5 cuts it there). Two picks mean the facts do not decide the
    // line, so none (R5). walkthrough-tariff-ref names a pick outside the concluded headings but carries no sentence, so
    // only this filter keeps it out.
    // R4 (ADR 2026-07-17 point 4): under a heading holding a code the user typed — this turn as a premise, or an earlier
    // turn — a blind pick reads as a verdict on their code at 8 digits, confirming or correcting it, and its lines are their
    // code filled in. That heading shows no line and has none looked up, whether the pick matches theirs or not: hiding only
    // a match would tell them the comparison.
    const typed = new Set([...(role === 'premise' ? keys : []), ...o.earlier].filter((u) => u.level >= 4).map((u) => digits(u.code).slice(0, 4)));
    const lineOf = (h: string): { code: string; text: string } | null => {
      if (typed.has(digits(h))) return null;
      const picks = (output.tariff_ref ?? []).filter((c) => digits(c).startsWith(digits(h)));
      const l = picks.length === 1 ? known.get(h)!.lines.find((x) => digits(x.code) === digits(picks[0]!)) : undefined;
      return l ? { code: dotted(l.code), text: lineText(l.path, known.get(h)!.headingText) } : null;
    };
    // R2: the headings the walkthrough left standing, each with the evidence a quote still holds; a picked line rides under
    // its heading, never replaces it.
    const candidates = conclusion.headings
      .filter((h) => chosen.includes(h))
      .map((h) => ({
        hs: h,
        level: 4,
        title: known.get(h)!.headingText,
        line: lineOf(h),
        evidence: [...new Set((assessed.get(h)?.cite_ids ?? []).flatMap((id) => (backs(h, id) && at.has(id) ? [at.get(id)!] : [])))],
      }))
      .filter((c) => c.evidence.length)
      .slice(0, 3);
    // D3(a)/R1: at full the bot prints a block per picked line, at most two, and the policy block reads them — also on a
    // dropped reply, whose code-built sections stand. Never a line the rate latch drops: a premise's whole heading, a key's
    // own code (R4, ADR hs-candidates: a user's code is no lookup key; a 6-digit premise's lines are that code filled in).
    const keyable = (code: string): boolean => !assertNoUserCodes([{ name: 'walkTariff', text: code }], keys, role).leakDrops.length;
    const tariffRef = depth === 'full' ? candidates.flatMap((c) => (c.line && keyable(c.line.code) ? [c.line.code] : [])).slice(0, 2) : [];
    const cited = checked.citations.map((c) => sources[c.source]!);
    // R1, R4: a missing fact stating a rate or filling in a masked code must not reach the bot this way; one that merely
    // runs past 12 words is still a true missing fact and stays (R3, R5).
    const badFacts = new Set(after.flatMap((v) => (v.sentence && v.rule !== 'walkthrough-item-length' ? [v.sentence.normalize('NFC')] : [])));
    // §4.1 doubts the MODEL's prose; the facts and policy sections are code's and stand either way, so a dropped answer
    // still opens with the goods and what is still open instead of a bare source list.
    const policy = policyBlock(POLICY_LISTS, rows, tariffRef, asOf);
    // A dropped reply keeps code's sections, so it reads as a finished report unless it says otherwise — and the bot's own
    // "một phần bị lược" note would be false when all of it was. Empty stays empty, so a drop with no goods and no policy
    // still falls through to the bot's NO_PROSE opener.
    const kept = dropped ? flatten([], policy, factsBlock(o.goods)) : '';
    // Brief is plain paragraphs: no titles, and no restating of the asker's own description (owner, 2026-09-22).
    const answerMd = dropped ? (kept ? `${kept}\n\n${CUT_ALL}` : '') : depth === 'full' ? flatten(checked.sections, policy, factsBlock(o.goods)) : flatten(checked.sections, policy, '', false);
    const lines = await timed('verify', () => this.hsLines(users.map((u) => digits(u.code))));
    for (const h of headings) lines.set(digits(h.heading), h.headingText);
    return {
      part: {
        asOf,
        answerMd,
        citations: checked.citations.map((c) => citationOf(c.n, sources[c.source]!, c.quotes)),
        // A dropped reply's picks came with the prose §4.1 doubts: no line prints under its candidates.
        candidates: dropped ? candidates.map((c) => ({ ...c, line: null })) : candidates,
        ruling: await timed('verify', () => this.rulingFor(o.goods.facts, candidates).catch(() => null)),
        missingFacts: conclusion.missing_facts.filter((f) => !badFacts.has(f.normalize('NFC'))),
        // How much of the question the answer actually reasons about, so it reads the MODEL's prose standing, not
        // `answerMd`: since §4.1 the latter also holds the goods section code writes, which covers nothing on its own.
        coverage: dropped ? 'none' : candidates.length === 1 && !conclusion.needs_advance_ruling && !conclusion.missing_facts.length ? 'full' : 'partial',
        cut,
        repaired,
        depth,
        tariffRef: dropped ? [] : tariffRef,
        warnings: warningsOf(cited),
      },
      lines,
    };
  }

  /** A candidate heading with its hs_description heading text and every line under it, in code order (the walkthrough's LINES). */
  private async headingLines(headings: string[]): Promise<HeadingLines[]> {
    const want = [...new Set(headings.map((h) => digits(h)))].filter((d) => /^\d{4}$/.test(d));
    if (!want.length) return [];
    const rows = (await this.db.execute(sql`
      SELECT hs_code, heading, path FROM hs_description
      WHERE substring(hs_code from 1 for 4) IN (${sql.join(
        want.map((d) => sql`${d}`),
        sql`, `,
      )})
      ORDER BY hs_code
    `)) as unknown as Array<{ hs_code: string; heading: string | null; path: string }>;
    const by = new Map<string, HeadingLines>();
    for (const r of rows) {
      const heading = headingOf(r.hs_code);
      if (!by.has(heading)) by.set(heading, { heading, headingText: r.heading ?? '', lines: [] });
      by.get(heading)!.lines.push({ code: r.hs_code, path: r.path });
    }
    return [...by.values()];
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

/** `deadlineAt` as ISO or epoch ms, never later than now + BUDGET_MS; absent or unreadable = now + BUDGET_MS. */
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
