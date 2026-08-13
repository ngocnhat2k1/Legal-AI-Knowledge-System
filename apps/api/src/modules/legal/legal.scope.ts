/**
 * Resolving a user-named document ("Thông tư 38/2015", "Điều 18 NĐ 08/2015") to the
 * rows retrieval may scope to.
 *
 * This exists because the corpus is small and deliberately curated, so "the document
 * you asked for is not in here" is a REAL and frequent answer — and the honest one.
 * Before this, a question about a Thông tư the corpus does not hold retrieved the
 * nearest passage from a different document and presented it as the answer; the user
 * read that as the bot being wrong, when the bot was actually out of corpus. Telling
 * them which documents exist is worth more than a confident near-miss.
 *
 * Matching is LEXICAL on purpose. A document number is an identifier, not prose — an
 * embedding has no business deciding whether 38/2015 is 39/2018.
 */
import { sql } from 'drizzle-orm';

import { type Database } from '../../shared/adapters/database';

/** Leading words that name the KIND of instrument, stripped before reading the number. */
const TYPE_WORDS: Array<[RegExp, string]> = [
  [/^(thông tư|thong tu|tt)\b/i, 'thong_tu'],
  [/^(nghị định|nghi dinh|nđ|nd)\b/i, 'nghi_dinh'],
  [/^(nghị quyết|nghi quyet|nq)\b/i, 'nghi_quyet'],
  [/^(pháp lệnh|phap lenh|pl)\b/i, 'phap_lenh'],
  [/^(quyết định|quyet dinh|qđ|qd)\b/i, 'quyet_dinh'],
  [/^(văn bản hợp nhất|van ban hop nhat|vbhn)\b/i, 'vbhn'],
  [/^(luật|luat)\b/i, 'luat'],
];

/**
 * The identifying head of a document number: `38/2015` from `38/2015/TT-BTC`,
 * `25/VBHN-BTC` from a consolidated document. The trailing issuer segment is dropped
 * on purpose — users type `NĐ-CP` and `ND-CP` interchangeably, and the head already
 * identifies the document within a corpus this size. A wider corpus would need the
 * tail back, disambiguated by `docType`.
 */
const NUMBER_RE = /(\d{1,4})\s*\/\s*(\d{4}|vbhn(?:-[a-zà-ỹ]+)?)/i;

export interface ParsedDocRef {
  /** The head, upper-cased: '38/2015', '25/VBHN-BTC'. */
  core: string;
  /** The instrument kind the user named, when they named one. */
  docType: string | null;
  /** As the user wrote it — echoed back when the corpus does not have it. */
  raw: string;
  /**
   * True when the text really is naming a document — it carried a type word
   * ("Thông tư 38/2015"), an issuer segment ("…/TT-BTC"), or a VBHN token. A bare
   * `09/2018` inside a sentence is NOT confident: it is as likely a form number or
   * a shipment reference, and scoping retrieval to a non-existent document on that
   * basis would turn an ordinary question into a false "we don't have that document".
   */
  confident: boolean;
}

/** Read a document reference out of free text. Returns null when there is none. */
export function parseDocRef(raw: string): ParsedDocRef | null {
  const text = String(raw ?? '')
    .normalize('NFC')
    .trim();
  if (!text) return null;

  const m = text.match(NUMBER_RE);
  if (!m) return null;

  // The instrument kind is whatever type word sits immediately before the number.
  const before = text.slice(0, m.index ?? 0).trim();
  const tail = before.split(/[\s,;(]+/).slice(-3).join(' ').replace(/\bsố\b/gi, '').trim();
  let docType: string | null = null;
  for (const [re, kind] of TYPE_WORDS) {
    if (re.test(tail) || new RegExp(re.source.replace('^', '(?:^|\\s)'), 'i').test(tail)) {
      docType = kind;
      break;
    }
  }
  const start = m.index ?? 0;
  const after = text.slice(start + m[0].length);
  const hasIssuerSegment = /^\s*\/\s*[a-zà-ỹ]{1,6}(?:-[a-zà-ỹ]{2,8})?/i.test(after);
  const isVbhn = /vbhn/i.test(m[2]!);
  // The echo keeps the issuer segment when there is one, so "38/2015/TT-BTC" is
  // reported back the way the user wrote it, not truncated to "38/2015".
  const rawEnd = start + m[0].length + (hasIssuerSegment ? (after.match(/^\s*\/\s*[a-zà-ỹ-]+/i)?.[0].length ?? 0) : 0);
  return {
    core: `${m[1]}/${m[2]}`.toUpperCase(),
    docType,
    raw: text.slice(start, rawEnd).trim(),
    confident: Boolean(docType) || hasIssuerSegment || isVbhn,
  };
}

/**
 * A parenthesised parameter list for `col IN ${...}`.
 *
 * Drizzle's `sql` template does NOT bind a JS array as a Postgres array — it splices
 * it in as a comma-separated list of parameters, so `= ANY(${ids})` compiles to
 * `= ANY($1, $2)` and Postgres rejects it ("malformed array literal"). Drizzle's
 * typed `inArray()` helper needs a column object, which raw aliased SQL does not have.
 * Hence this: every value still travels as a bound parameter.
 */
export function inIds(ids: Array<number | string>) {
  return sql`(${sql.join(ids.map((v) => sql`${v}`), sql`, `)})`;
}

export interface ResolvedDoc {
  id: number;
  number: string;
  title: string;
  docType: string;
}

/**
 * Documents whose number (or the base document a VBHN consolidates) starts with the
 * parsed head. The `consolidates` arm is what lets "Nghị định 08/2015" find the VBHN
 * that consolidates it — which IS the citable text, per the published-VBHN ADR.
 */
export async function resolveDocuments(db: Database, ref: ParsedDocRef): Promise<ResolvedDoc[]> {
  // '08/2015' and '8/2015' are the same document; try both spellings of the head.
  const bare = ref.core.replace(/^0+/, '');
  const padded = /^\d\//.test(ref.core) ? `0${ref.core}` : ref.core;
  const heads = [...new Set([ref.core, bare, padded])];
  const matches = sql.join(
    heads.map((h) => sql`upper(number) LIKE ${`${h}%`} OR upper(coalesce(consolidates, '')) LIKE ${`${h}%`}`),
    sql` OR `,
  );

  const rows = (await db.execute(sql`
    SELECT id, number, title, doc_type AS "docType"
    FROM legal_document
    WHERE ${matches}
    ORDER BY id
  `)) as unknown as ResolvedDoc[];

  // Prefer the kind the user named — but only when that leaves something. Asking for
  // "Nghị định 08/2015" must still reach 46/VBHN-BTC, whose doc_type is 'vbhn'.
  if (ref.docType) {
    const typed = rows.filter((r) => r.docType === ref.docType);
    if (typed.length) return typed;
  }
  return rows;
}

/** The Điều rows named by number inside the given documents ("Điều 18"). */
export async function resolveArticles(
  db: Database,
  documentIds: number[],
  articleNo: string,
): Promise<number[]> {
  const n = String(articleNo ?? '').replace(/\D/g, '');
  if (!n || !documentIds.length) return [];
  const rows = (await db.execute(sql`
    SELECT id FROM legal_provision
    WHERE document_id IN ${inIds(documentIds)} AND ptype = 'dieu' AND number = ${n}
  `)) as unknown as Array<{ id: number }>;
  return rows.map((r) => Number(r.id));
}

/** Read "Điều 18" out of free text, so the bot need not parse it itself. */
export function parseArticleNo(raw: string): string | null {
  const m = String(raw ?? '')
    .normalize('NFC')
    .match(/(?:^|[\s,(])(?:điều|dieu)\s*(\d{1,3})\b/i);
  return m ? m[1]! : null;
}
