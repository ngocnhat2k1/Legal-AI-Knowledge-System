/**
 * Runner glue of the classification walkthrough (plan 08 §0): the ClassifyInput built from what retrieve already fetched,
 * the shared guards run over the walkthrough's sections, the policy block printed by code, and the flattened answerMd
 * formatAnswerMd renders. Pure — answer.service.ts owns the DB, the model calls and the deadline.
 *
 * An evidence row's `id` is its 1-based place in the gathered sources, so a section's cite id indexes the same array the
 * response's citations are numbered from. verify() works on a draft, so each section is verified as its own draft over its
 * own sources (its cites, in order), which keeps the sentence text — markers and all — the text validateWalkthrough saw,
 * so one repair pass can carry violations from both checks. What a section cites afterwards is rebuilt from the citations
 * verify() kept, never from what the model listed (R10).
 */
import { expandMarkers } from '../legal/legal.grounding';
import type { Source } from '../legal/legal.service';
import type { RepairItem } from './compose';
import { type Draft, dotted, type GuardViolation, type Source as GuardSource, quoteInBody, splitSentences, verify, type VerifyContext } from './guards';
import { type PolicyList, type PolicyResult, policyStatus, type UncertainReason } from './policy';
import type { Authority, CandidateHeading, ClassifyInput, EvidenceRow, Violation, WalkthroughOutput, WalkthroughSectionKey } from './types';

/** The owner's own sample document, key by key (agreed 2026-09-15). Printed by code: the model writes no heading of its own. */
export const SECTION_TITLES: Record<WalkthroughSectionKey, string> = {
  facts: 'I. THÔNG TIN HÀNG HÓA',
  nature: 'II.1 Xác định bản chất hàng hóa',
  candidates: 'II.2 Xem xét các nhóm có khả năng áp dụng',
  exclusions: 'II.3 Loại trừ các nhóm không phù hợp',
  gir: 'II.4 Áp dụng quy tắc GIR',
  // The sample prints a Chương/Nhóm/Phân nhóm/AHTN table here; a table is outside the markdown Zalo renders (md()).
  levels: 'II.5 Kết luận mã HS đề xuất',
  explanation: 'II.6 Giải thích lựa chọn mã',
  policy: 'CHÍNH SÁCH CHUYÊN NGÀNH',
  risk: 'ĐÁNH GIÁ RỦI RO HẢI QUAN',
  conclusion: 'KẾT LUẬN CUỐI CÙNG',
};
/** The reply's own order, whatever order the model emitted its sections in (flatten, and the §4.1 opener in the runner). */
export const ORDER = Object.keys(SECTION_TITLES) as WalkthroughSectionKey[];

/**
 * The walkthrough's own system prompt. Deliberately not compose's SYSTEM: that one carries a different output contract and
 * its own hs block, and two contracts in one call is how a model is taught to ignore both. Every rule of this mode lives in
 * buildWalkthroughPrompt, and every one of them is checked again in code (ADR 2026-08-14).
 */
export const WALKTHROUGH_SYSTEM = [
  'VAI',
  'Bạn là chuyên viên hải quan nhiều năm kinh nghiệm, đang nhắn Zalo trả lời đồng nghiệp. Bạn chỉ biết những gì nằm trong',
  'ĐỀ BÀI và bằng chứng của lượt này; ngoài chúng ra bạn không biết gì về pháp luật, biểu thuế hay mặt hàng.',
  'Trả về đúng một JSON theo khuôn ĐỀ BÀI nêu, không chữ nào ngoài JSON.',
].join('\n');

/** Standing when a row carries none (an article, a fake source in a spec): the data's own `authority` wins wherever it is set. */
const AUTHORITY_BY_KIND: Record<string, Authority> = {
  hs_note: 'binding',
  gri: 'binding',
  annex_table: 'binding',
  en: 'authoritative',
  sen: 'authoritative',
  ruling: 'administrative',
  note: 'reference',
  internal: 'reference',
};
const AUTHORITIES = new Set<string>(['binding', 'authoritative', 'administrative', 'reference', 'undetermined']);

const kindOf = (s: Source): string => s.citation.kind ?? 'provision';

/** The gathered source as the walkthrough reads it; `id` is its 1-based place in `sources` (R10: a marker never moves off it). */
export function evidenceRow(s: Source, i: number, asOf: string): EvidenceRow {
  const kind = kindOf(s);
  const a = s.meta?.authority;
  return {
    id: i + 1,
    kind,
    authority: (typeof a === 'string' && AUTHORITIES.has(a) ? a : (AUTHORITY_BY_KIND[kind] ?? 'undetermined')) as Authority,
    title: s.label,
    body: s.body,
    window: s.citation.effectiveFrom && s.citation.effectiveFrom > asOf ? 'upcoming' : 'current',
    meta: s.meta ?? {},
  };
}

/** Kinds that decide a heading; only these make a heading a candidate on their own (a pinned heading is one by name). */
const CLASSIFYING = new Set(['hs_note', 'gri', 'en', 'sen', 'ruling']);
const chapterOf = (heading: string): number => Number(heading.slice(0, 2));

/**
 * Three to six headings to walk: the headings retrieval was told to pin (the blind hints, and a premise's own heading
 * unlabelled — owner decision D1), then any heading a classifying row came back under. Only a heading with hs_description
 * lines survives, since the walkthrough reasons down its LINES.
 */
export function candidateHeadings(pinned: string[], sources: Source[], known: Set<string>, max = 6): string[] {
  const found = sources.flatMap((s) => (CLASSIFYING.has(kindOf(s)) && s.hs.heading ? [s.hs.heading] : []));
  return [...new Set([...pinned, ...found])].filter((h) => known.has(h)).slice(0, max);
}

export interface HeadingLines {
  heading: string;
  headingText: string;
  lines: Array<{ code: string; path: string }>;
}

/**
 * What the walkthrough prompt may see. The user's own code is absent by construction (R4): every text here was masked and
 * run through the latch by the caller, and the codes come from hs_description, not from the question.
 */
export function classifyInput(o: {
  question: string;
  goodsFacts: string;
  depth: ClassifyInput['depth'];
  asOf: string;
  headings: HeadingLines[];
  sources: Source[];
  tariffLines: Array<{ code: string; line: string }>;
}): ClassifyInput {
  const rows = o.sources.map((s, i) => evidenceRow(s, i, o.asOf));
  const candidates: CandidateHeading[] = o.headings.map((h) => ({
    heading: h.heading,
    headingText: h.headingText,
    lines: h.lines,
    // A note or GRI crosses headings by design: the prompt prints every shared row once in its own neutral block.
    evidence: rows.filter((r, i) => {
      const s = o.sources[i]!;
      if (s.hs.heading === h.heading) return true;
      if (r.kind === 'gri') return true;
      return r.kind === 'hs_note' && (s.hs.chapter === null || s.hs.chapter === chapterOf(h.heading));
    }),
  }));
  const given = new Set(candidates.flatMap((c) => c.evidence.map((r) => r.id)));
  return {
    question: o.question,
    goodsFacts: o.goodsFacts,
    depth: o.depth,
    asOf: o.asOf,
    candidates,
    tariffLines: o.tariffLines,
    // Every row retrieve fetched that no candidate block prints: policyStatus reads the list rows among them, and
    // normalizeWalkthrough keeps a marker naming one of them citable.
    policyRows: rows.filter((r) => !given.has(r.id)),
  };
}

// --- The guards over the sections ----------------------------------------------------------------

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []);

/**
 * The conclusion, readable whatever the model returned: normalizeWalkthrough passes this object through untouched, so a
 * missing or mistyped one must not throw here — validateWalkthrough reports the shape, the runner still answers (R5: an
 * empty conclusion is abstaining, which is a success).
 */
export const conclusionOf = (output: WalkthroughOutput): WalkthroughOutput['conclusion'] => ({
  headings: strings(output.conclusion?.headings),
  needs_advance_ruling: output.conclusion?.needs_advance_ruling === true,
  missing_facts: strings(output.conclusion?.missing_facts).slice(0, 3),
});

/** The candidate entries that are objects with a heading; anything else the model returned assesses nothing. */
export const assessedOf = (output: WalkthroughOutput): WalkthroughOutput['candidates'] =>
  (Array.isArray(output.candidates) ? output.candidates : []).filter((c) => c !== null && typeof c === 'object' && typeof c.heading === 'string');

export interface VerifiedWalkthrough {
  /** In the owner's section order; [n] is `citations[n-1]`. */
  sections: Array<{ key: WalkthroughSectionKey; markdown: string }>;
  citations: Array<{ n: number; source: number; quotes: string[] }>;
  violations: GuardViolation[];
  /** Sentences the model wrote, and how many the guards took out. */
  said: number;
  cut: number;
  /** The answer's own first sentence went: the reply no longer opens with an answer (§4.1). */
  firstCut: boolean;
}

/**
 * verify() over every section, in the owner's order. Each section is its own draft over its own cites, so [n] inside it is
 * cites[n-1] exactly as the model wrote it; the survivors are numbered once across the whole answer, by first appearance,
 * and each section's citations are whatever verify() kept for it.
 */
export function verifySections(output: WalkthroughOutput, sources: GuardSource[], ctx: VerifyContext): VerifiedWalkthrough {
  const order: number[] = [];
  const quotes = new Map<number, string[]>();
  const at = (source: number): number => {
    if (!order.includes(source)) order.push(source);
    return order.indexOf(source) + 1;
  };
  const sections: VerifiedWalkthrough['sections'] = [];
  const violations: GuardViolation[] = [];
  let said = 0;
  let cut = 0;
  let firstCut = false;
  let first = true;

  // Every quote the whole answer holds, per row the union of every section's quotes of it. A section that marks nothing of
  // its own (facts, conclusion) would otherwise have no cited source, and G3 reads an uncited sentence against nothing at
  // all — not even the anchors, which ride on the label of a source a quote holds. Appended after the section's own cites,
  // so [n] inside the section still means cites[n-1], and only a marker actually written becomes a citation below. Keyed on
  // the union, since a Map of the raw cites kept only the LAST section's quote list: adding a later section that re-cites a
  // row then narrowed what an earlier unmarked sentence was read against, and cut it.
  const merged = new Map<number, Set<string>>();
  for (const c of output.sections.flatMap((s) => s.cites)) {
    if (!c.quotes.length || !sources[c.id - 1]) continue;
    const qs = merged.get(c.id) ?? merged.set(c.id, new Set()).get(c.id)!;
    for (const q of c.quotes) qs.add(q);
  }
  const answerCites = [...merged].map(([id, quotes]) => ({ id, quotes: [...quotes] }));

  for (const key of ORDER) {
    // 'policy' is the code's own title (policyBlock): a section the model returned under it would print a licence or
    // inspection claim beside the block saying the list is not loaded (R12, R18). The prompt never offers the key, so nor
    // does the code — ORDER keeps it only so flatten() can place the code-built block in the owner's order.
    // facts and policy are the system's own sections (factsBlock, policyBlock): a model section under either key would
    // print a second body under a code-written title, and the checks that own those rules never ran over it.
    if (key === 'policy' || key === 'facts') continue;
    // Every section the model tagged with this key, not just the first: the prompt tags paragraphs ("Gắn mỗi đoạn một key"),
    // so one key can carry several, and dropping the rest lost them with `cut` counted as 0 — invisible to the §4.1 net.
    // Each stays its own draft, so [n] inside it still means that section's own cites[n-1].
    const parts: string[] = [];
    for (const sec of output.sections.filter((s) => s.key === key)) {
      // A cite naming a row that is not among the sources cannot be checked; its marker goes with it.
      const usable = sec.cites.filter((c) => sources[c.id - 1]);
      const cites = [...usable, ...answerCites.filter((c) => !usable.some((u) => u.id === c.id))];
      const draft: Draft = {
        // The section's own cites are 1..k; a marker past them was never this section's.
        answerMd: expandMarkers(sec.markdown, usable.length),
        citations: cites.map((c, i) => ({ n: i + 1, quotes: c.quotes })),
        candidates: [],
        missingFacts: conclusionOf(output).missing_facts,
      };
      const sentences = splitSentences(draft.answerMd);
      said += sentences.length;
      const checked = verify(
        draft,
        cites.map((c) => sources[c.id - 1]!),
        ctx,
      );
      violations.push(...checked.violations);
      cut += checked.cut;
      if (first && sentences.length) {
        firstCut = checked.violations.some((v) => v.sentence !== undefined && v.sentence === sentences[0]);
        first = false;
      }
      if (!checked.answerMd.trim()) continue;
      // [n] of this section → the global number of the source it points at, assigned on first appearance.
      parts.push(
        checked.answerMd.replace(/\[(\d+)\]/g, (_, k: string) => {
          const local = checked.citations.find((c) => c.n === Number(k));
          if (!local) return '';
          const source = cites[local.source]!.id - 1;
          const kept = quotes.get(source) ?? quotes.set(source, []).get(source)!;
          for (const q of local.quotes) if (!kept.includes(q)) kept.push(q);
          return `[${at(source)}]`;
        }),
      );
    }
    if (parts.length) sections.push({ key, markdown: parts.join('\n\n') });
  }
  // Compose's own fallback (legal.grounding: `order.length ? order : validCited`): prose that survives marking nothing still
  // lists the evidence the answer quoted, so the reply never ships reasoning above an empty source list.
  if (sections.length && !order.length)
    for (const c of answerCites) {
      order.push(c.id - 1);
      quotes.set(
        c.id - 1,
        c.quotes.filter((q) => quoteInBody(q, sources[c.id - 1]!.body)),
      );
    }
  return { sections, citations: order.map((source, i) => ({ n: i + 1, source, quotes: quotes.get(source) ?? [] })), violations, said, cut, firstCut };
}

/**
 * The section holding `sentence` as a whole sentence of its own. The violations also carry the deciding_facts and
 * missing_facts entries (walkthrough.checks' `units`), which are not prose: a fact that happens to be a fragment of a
 * sentence would otherwise be rewritten or deleted mid-sentence, marker and all, while still shipping in missingFacts.
 */
const sectionOf = (output: WalkthroughOutput, sentence: string): WalkthroughOutput['sections'][number] | undefined =>
  output.sections.find((s) => splitSentences(s.markdown).includes(sentence));

/**
 * One repair item per violating sentence, whichever check named it, with the quotes of the rows its own markers point at
 * that are verbatim in those rows — a made-up quote would license the very figure that was cut.
 */
export function repairItems(output: WalkthroughOutput, sources: GuardSource[], found: Array<GuardViolation | Violation>): RepairItem[] {
  const seen = new Set<string>();
  const items: RepairItem[] = [];
  for (const v of found) {
    const sentence = v.sentence;
    if (!sentence || (v as GuardViolation).repairOnly || seen.has(sentence)) continue;
    seen.add(sentence);
    const sec = sectionOf(output, sentence);
    if (!sec) continue;
    const quotes = new Set<string>();
    for (const [, k] of sentence.matchAll(/\[(\d+)\]/g)) {
      const cite = sec.cites[Number(k) - 1];
      const body = cite && sources[cite.id - 1]?.body;
      if (body) for (const q of cite.quotes) if (quoteInBody(q, body)) quotes.add(q);
    }
    items.push({ sentence, rule: [...new Set(found.filter((f) => f.sentence === sentence).map((f) => f.rule))].join(', '), quotes: [...quotes] });
  }
  return items;
}

/**
 * The sections without those sentences. The section checks (validateWalkthrough) cut nothing by themselves, so what they
 * still flag after the one repair pass is taken out here: a rule held only by the prompt is not held (ADR 2026-08-14), and
 * these are the rules verify() does not repeat — a list claim, a risk score, a persona, a source named but not cited.
 */
export function cutSentences(output: WalkthroughOutput, gone: Set<string>): WalkthroughOutput {
  if (!gone.size) return output;
  return {
    ...output,
    sections: output.sections.map((s) => {
      // Whole sentences of THIS section only: `gone` holds the facts-list entries too (sectionOf).
      const here = new Set(splitSentences(s.markdown));
      return {
        ...s,
        markdown: [...gone]
          .filter((x) => here.has(x))
          .reduce((md, x) => md.split(x).join(''), s.markdown)
          .replace(/[ \t]+$/gm, '')
          // A line left holding only its bullet goes, as cutPieces does for the prose verify() cuts.
          .replace(/^[ \t]*(?:[-*•]|\d+[.)])[ \t]*$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim(),
      };
    }),
  };
}

/** The repaired sections; a sentence the repair gave up on ('') is left for the next verify() to cut, as compose does. */
export function applyRepair(output: WalkthroughOutput, items: RepairItem[], rewritten: string[]): WalkthroughOutput {
  return {
    ...output,
    sections: output.sections.map((s) => ({
      ...s,
      markdown: items.reduce((md, it, i) => (rewritten[i] ? md.replace(it.sentence, () => rewritten[i]!) : md), s.markdown),
    })),
  };
}

// --- The policy block, printed by code ------------------------------------------------------------

/** Why a list decides nothing, in the words the reply prints. "Chưa nạp" is its own status: never "Không" (R3, R12, R18). */
const UNCERTAIN_WORDS: Record<UncertainReason, string> = {
  internal: 'bảng tổng hợp nội bộ, không phải văn bản',
  not_hs_keyed: 'danh mục không liệt kê theo mã HS',
  not_binding: 'nguồn không phải căn cứ pháp lý',
  validity_unverified: 'hiệu lực của danh mục chưa xác minh',
  not_yet_applicable: 'dòng này chỉ áp dụng từ ngày ghi trong danh mục',
  unreadable: 'ô mã trong danh mục không đọc được đúng như in',
  granularity: 'danh mục không liệt kê ở cấp mã này',
  qualifier: 'dòng liệt kê ở cấp rộng hơn, mô tả thu hẹp lại — cần đối chiếu mô tả',
  words_only: 'danh mục nêu phạm vi bằng lời, không theo dòng mã',
  coverage: 'chưa chắc đã lấy đủ dòng của danh mục',
};
const APPLIES_WORDS: Record<string, string> = {
  hang_da_qua_su_dung: 'chỉ với hàng đã qua sử dụng',
  kinh_doanh_tam_nhap_tai_xuat_chuyen_khau: 'chỉ với kinh doanh tạm nhập tái xuất, chuyển khẩu',
  xuat_khau_tam_nhap_tai_xuat_chuyen_khau_trung_chuyen_qua_canh: 'chỉ với xuất khẩu, tạm nhập tái xuất, chuyển khẩu, trung chuyển, quá cảnh',
};
const MAX_QUOTE = 160;
const MAX_NAMED = 6;

const listName = (r: PolicyResult): string => `${r.instrument}${r.annex ? ` ${r.annex}` : ''}`;
const more = (rows: PolicyResult[]): string => (rows.length > MAX_NAMED ? ` và ${rows.length - MAX_NAMED} danh mục khác` : '');
const named = (rows: PolicyResult[]): string => `${rows.slice(0, MAX_NAMED).map(listName).join(', ')}${more(rows)}`;
/** Verbatim from the row, on one line and cut to length as a source line is: a list cell carries its own breaks and pipes. */
const shortQuote = (q: string): string => {
  const one = q.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return one.length > MAX_QUOTE ? `${one.slice(0, MAX_QUOTE - 1)}…` : one;
};

/**
 * The THÔNG TIN HÀNG HÓA section, written here and never by the model. It restates what the asker said, so it carries
 * their own measurements ("D112 x H165mm", "220V", "mới 100%") — and G1 cut every sentence of it as a number no quote
 * backs, which, as the first section, dropped the whole answer (2026-09-15). The planner already separates what they
 * wrote from what is still missing; code prints both and there is nothing left for a guard to doubt.
 */
export function factsBlock(goods: { facts: string[]; missing: string[] }): string {
  const said = goods.facts.map((f) => `- ${f.trim()}`).filter((l) => l.length > 2);
  const missing = goods.missing.map((f) => f.trim()).filter(Boolean);
  if (!said.length && !missing.length) return '';
  return [
    ...(said.length ? ['Bạn đã cho biết:', ...said] : []),
    // R3/R5: what is still open is said here too, so an answer that does not settle shows why on its face.
    ...(missing.length ? [`${said.length ? 'Chưa rõ' : 'Bạn chưa cho biết'}: ${missing.join('; ')}.`] : []),
  ].join('\n');
}

/**
 * The CHÍNH SÁCH CHUYÊN NGÀNH section, written here and never by the model (plan 08 §0; R12, R18). Each listing is its own
 * line with the entry verbatim; the rest are grouped, and a list the corpus does not hold reads "chưa nạp" — saying "Không"
 * about a list nobody checked is the failure this block exists to make impossible.
 */
export function policyBlock(registry: PolicyList[], rows: EvidenceRow[], codes: string[], asOf: string): string {
  // Whether a list is loaded at all, and whether its rows came back whole, is a property of the corpus, not of the code
  // being weighed: printed per candidate it repeated the same twenty names for every one and buried the findings under
  // its own caveat. Gathered across the candidates, said once, after them.
  const unchecked = new Map<string, PolicyResult>();
  const blocks = codes.map((code) => {
    const found = policyStatus(registry, rows, code, asOf);
    if (!found.length) return '';
    for (const r of found) if ((r.status === 'NOT_LOADED' || r.status === 'UNCERTAIN') && !unchecked.has(listName(r))) unchecked.set(listName(r), r);
    const when = (r: PolicyResult): string => (r.appliesWhen ? ` (${APPLIES_WORDS[r.appliesWhen] ?? r.appliesWhen})` : '');
    const lines = [
      `Mã **${dotted(code)}** (ứng viên, chưa chốt):`,
      ...found
        .filter((r) => r.status === 'LISTED')
        .map(
          (r) =>
            `- **${listName(r)}**${when(r)}: có tên trong danh mục${r.match === 'parent' ? ' ở dòng rộng hơn — đối chiếu mô tả' : ''}${r.quote ? ` — "${shortQuote(r.quote)}"` : ''}`,
        ),
    ];
    const rest = found.filter((r) => r.status === 'NOT_LISTED');
    if (rest.length) lines.push(`- Không có tên trong danh mục đã nạp: ${named(rest)}`);
    return lines.length > 1 ? lines.join('\n') : '';
  });
  const left = [...unchecked.values()];
  // The overflow tail named() gives: a list dropped in silence reads as if the six named were the whole registry.
  const caveat = left.length
    ? `Còn ${left.length} danh mục mình **chưa kiểm tra được** (kho chưa nạp, hoặc chưa chắc đã lấy đủ dòng): ${named(left)} — cần thì bạn nhắn tên danh mục, mình tra riêng.`
    : '';
  return [...blocks.filter(Boolean), caveat].filter(Boolean).join('\n\n');
}

// --- The reply -------------------------------------------------------------------------------------

/**
 * The surviving sections under the owner's titles, in the markdown subset md() renders ("## " is a bold line). The policy
 * block takes its own place in that order.
 */
export function flatten(sections: VerifiedWalkthrough['sections'], policy: string, facts = ''): string {
  const all = [
    ...sections,
    ...(facts.trim() ? [{ key: 'facts' as WalkthroughSectionKey, markdown: facts.trim() }] : []),
    ...(policy.trim() ? [{ key: 'policy' as WalkthroughSectionKey, markdown: policy.trim() }] : []),
  ];
  return all
    .slice()
    .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
    // A model heading on the first line renders at the same weight as the title right above it (md() bolds both), so it
    // keeps its words and loses its "## ". A heading later in a section has prose between them (owner decision 4).
    .map((s) => `## ${SECTION_TITLES[s.key]}\n${s.markdown.trim().replace(/^#{1,3}\s+/, '')}`)
    .join('\n\n');
}
