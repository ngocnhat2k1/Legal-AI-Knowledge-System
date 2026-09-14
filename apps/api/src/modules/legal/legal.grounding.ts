/**
 * Grounding gates (legal-rag-retrieval.md §7, R10). Two jobs:
 *
 *   1. keepRelevant — a PRE-generation gate. The dense branch always returns its
 *      nearest neighbours even for an off-topic query, so we drop articles that
 *      are neither a keyword hit nor within a cosine-distance threshold. If nothing
 *      survives, the caller abstains before spending a generation.
 *   2. numberMarkers — a POST-generation check: [n] markers must point into the
 *      evidence set, and the numbers beside them must be in the provision they cite.
 *      "The citation resolves to a real document" is the worthless guarantee
 *      (Wilgarten); this is a floor, not proof of entailment.
 */
import type { RetrievedArticle } from './legal.retrieval';

/**
 * Max cosine distance (1 − cosine similarity) for an article to count as relevant.
 * Measured on the eval set: real customs questions land ≤ 0.46, off-topic questions
 * ("phở recipe", "football") sit ≥ 0.64 — so 0.58 separates them with margin. Tune
 * against the eval harness, not by feel.
 *
 * NOTE: the gate is SEMANTIC ONLY. A keyword hit is not a keep-reason on its own —
 * common words ("công", "nhà") match customs text for any query and would let an
 * off-topic question through. Keyword still drives RANKING (RRF); it just does not
 * decide relevance. An article with no dense proximity (bestDist null) is dropped.
 */
export const MAX_DIST = 0.58;

/** Keep only articles the dense retriever puts within the relevance threshold. */
export function keepRelevant(articles: RetrievedArticle[]): RetrievedArticle[] {
  return articles.filter((a) => a.bestDist != null && a.bestDist <= MAX_DIST);
}

const norm = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').replace(/\s*%/g, '%').toLowerCase().trim();
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `fact` stands in `hay` on digit boundaries, leading zeros ignored: 0% is not inside 10%, nor 30 ngày inside 130 ngày. */
const figureIn = (hay: string, fact: string): boolean =>
  new RegExp(`(?<!\\d[.,]?)0*${esc(fact.replace(/^0+(?=\d)/, ''))}(?!\\d)`).test(hay);

/** Every digit group of `fact` stands as its own token in `text`, leading zeros ignored (as the bot's docNumberStatedIn). */
const statedIn = (text: string, fact: string): boolean => {
  const groups = fact.match(/\d+/g) ?? [];
  return groups.length > 0 && groups.every((g) => new RegExp(`(?<!\\d)0*${g.replace(/^0+/, '') || '0'}(?!\\d)`).test(text));
};

const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])(?=\s)/;

/**
 * Join `pieces` (split as numberMarkers splits) without those `drop` names. A cut piece keeps its line break, since md()
 * reads bullets per line, and the list marker opening its line; a line left holding only a marker goes.
 */
export const cutPieces = (pieces: string[], drop: (piece: string) => boolean): string =>
  pieces
    .map((p, i) => (drop(p) ? p.replace(/[^\n]+/, (line) => (i === 0 || pieces[i - 1]!.endsWith('\n') ? (line.match(LIST_MARKER)?.[0] ?? '') : '')) : p))
    .join('')
    .replace(/^[ \t]*(?:[-*•]|\d+[.)])[ \t]*(?:\n|$)/gm, '');

/**
 * Facts a sentence may state only when its own [n] source contains them. `exempt`: the user may have written it — with
 * `opts`, a `label` fact only as written (a document number by its number/year), never by stray digit groups.
 * `label`: with `opts.labels` it may also stand in the label of [n] — a label is data, not model text (plan 08 §2.5).
 */
const FACTS: Array<{ re: RegExp; exempt: boolean; fatal: boolean; label?: true }> = [
  { re: /\d+(?:[.,]\d+)?\s*%/g, exempt: false, fatal: true },
  { re: /\d[\d.,]*\s*(?:USD|VND|đồng|đ)(?![\p{L}\d])/giu, exempt: false, fatal: true },
  { re: /\d{1,2}\/\d{1,2}\/\d{4}/g, exempt: true, fatal: false },
  { re: /\d+\s*(?:ngày|tháng)(?![\p{L}])/giu, exempt: false, fatal: false },
  // The tail stops at emphasis, quotes and brackets: `**08/2015/NĐ-CP**` and `“…”[1]` must still anchor.
  { re: /\d{1,4}\/(?:\d{4}|VBHN)[^\s,;)*"'“”‘’[\]]*/gi, exempt: true, fatal: false, label: true },
  { re: /\d{4}(?:\.\d{2}){1,2}/g, exempt: true, fatal: false, label: true },
];

/** Checked only with `opts` (POST /answer, plan 08 G3): a dotted heading ("33.07") and a provision number ("Điều 97"). */
const ANSWER_FACTS: typeof FACTS = [
  { re: /(?<![\d.,/])\d{2}\.\d{2}(?![\d/%]|[.,]\d)/g, exempt: true, fatal: false, label: true },
  { re: /(?<![\p{L}])(?:Điều|khoản|điểm)\s+\d+[a-zđ]?/giu, exempt: true, fatal: false, label: true },
];

/** A sentence saying an instrument applies or has yet to end. "không/chưa còn hiệu lực" and "đã hết hiệu lực" do not match. */
const IN_FORCE_CLAIM = /(?<!không\s)(?<!chưa\s)còn hiệu lực|vẫn\s+(?:còn\s+)?(?:được\s+)?áp dụng|sẽ hết hiệu lực|chưa hết hiệu lực/i;

/**
 * Drop sentences that call an expired instrument in force (R8). The API compared the status row's end date with the
 * as-of date and told the model so; on 14/09/2026 it still opened with "Còn hiệu lực tại thời điểm hiện tại
 * (14/09/2026), nhưng sẽ hết hiệu lực từ 23/01/2026" about NĐ 43/2017. A claim survives only in a sentence that names
 * a source still in force and no expired one; the bot prints the expiry as its own red line in any case.
 */
export function dropInForceClaims(answer: string, expired: string[], current: string[]): string {
  if (!expired.length) return answer;
  const core = (n: string) => n.match(/\d{1,4}\/\d{4}/)?.[0] ?? n;
  const namesAny = (s: string, list: string[]) => list.map(core).some((c) => s.includes(c));
  return answer
    .split(/(?<=[.?!;…])(?= )|(?<=\n)/)
    .filter((s) => !IN_FORCE_CLAIM.test(s) || (namesAny(s, current) && !namesAny(s, expired)))
    .join('')
    .trim();
}

/**
 * Map the model's [n] markers onto the retrieved provisions and prove the numbers next to them (R10).
 * `sources[i]` is "{articleCitation}\n{articleBody}" of the i-th provision given to the model.
 *
 * - `[1, 2]` → `[1] [2]`; markers outside 1..k are removed.
 * - Per sentence, every %, amount, date, duration, document number and HS code must appear in a source the
 *   sentence itself marks (unmarked sentence: any cited source). A sentence failing that loses its markers
 *   and its bold; an unanchored % or amount anywhere empties the whole answer (citations-only reply).
 * - Markers are renumbered by first appearance; `order[k]` is the original position of new marker k+1.
 * - `opts` (POST /answer): `sources[i]` holds only the verbatim quotes of source i+1, `labels[i]` its label, where a
 *   document number, HS code, heading or "Điều/khoản/điểm N" may also anchor; with `cut` an unanchored sentence is
 *   dropped and returned in `cut` instead of losing its markers.
 *
 * A string check of support, not of entailment: a number present in the provision can still be attached to
 * the wrong obligation.
 */
export function numberMarkers(
  answer: string,
  cited: number[],
  sources: string[],
  userText: string,
  opts?: { cut: boolean; labels: string[] },
): { answer: string; order: number[]; cut?: string[] } {
  const k = sources.length;
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= k;
  const text = answer
    .replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, list: string) => list.split(',').map((n) => `[${n.trim()}]`).join(' '))
    .replace(/\s*\[(\d+)\]/g, (m, n: string) => (inRange(Number(n)) ? m : ''));
  const validCited = [...new Set(cited.filter(inRange))];
  const facts = opts ? [...FACTS, ...ANSWER_FACTS] : FACTS;
  const said = norm(userText);
  const userWrote = (fact: string, f: string, label?: true): boolean =>
    opts && label ? figureIn(said, f.replace(/^(\d{1,4}\/(?:\d{4}|vbhn)).*/, '$1')) : statedIn(userText, fact);

  const sentences = text.split(/(?<=[.?!;])(?= )|(?<=\n)/);
  const out: string[] = [];
  const cut: string[] = [];
  for (const s of sentences) {
    const marks = [...s.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const ids = marks.length ? marks : validCited;
    const hay = ids.map((n) => norm(sources[n - 1] ?? ''));
    const labels = ids.map((n) => norm(opts?.labels[n - 1] ?? ''));
    let anchored = true;
    for (const { re, exempt, fatal, label } of facts) {
      for (const [fact] of s.matchAll(re)) {
        const f = norm(fact.replace(/[.:]+$/, ''));
        if (hay.some((h) => figureIn(h, f)) || (label && labels.some((h) => figureIn(h, f))) || (exempt && userWrote(fact, f, label))) continue;
        if (fatal) return { answer: '', order: [] };
        anchored = false;
      }
    }
    if (anchored || opts?.cut) out.push(s);
    else out.push(s.replace(/\s*\[\d+\]/g, '').replace(/\*\*/g, ''));
    if (!anchored && opts?.cut) cut.push(s.trim());
  }

  const order: number[] = [];
  const renumbered = (opts?.cut ? cutPieces(out, (s) => cut.includes(s.trim())) : out.join(''))
    .replace(/\[(\d+)\]/g, (_, n: string) => {
      const at = order.indexOf(Number(n));
      if (at >= 0) return `[${at + 1}]`;
      order.push(Number(n));
      return `[${order.length}]`;
    })
    .replace(/(\[\d+\])(?:\s*\1)+/g, '$1');
  const numbered = { answer: renumbered, order: order.length ? order : validCited };
  return opts?.cut ? { ...numbered, cut } : numbered;
}
