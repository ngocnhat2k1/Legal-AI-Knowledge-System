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
   * The FULL number including the issuer segment, when the user wrote one:
   * '36/2016/TT-BKHCN'. `core` deliberately drops that segment for corpus lookup, but
   * dropping it against the 15k-document gazette catalogue is unsafe — '36/2016' also
   * matches 36/2016/NĐ-CP and 36/2016/TT-BCT, which are different documents entirely.
   */
  full: string | null;
  /**
   * True when the text really is naming a document — it carried a type word
   * ("Thông tư 38/2015"), an issuer segment ("…/TT-BTC"), or a VBHN token. A bare
   * `09/2018` inside a sentence is NOT confident: it is as likely a form number or
   * a shipment reference, and scoping retrieval to a non-existent document on that
   * basis would turn an ordinary question into a false "we don't have that document".
   */
  confident: boolean;
}

/**
 * One spelling per document number: NFC, no whitespace, upper case, Đ → D, no leading zeros on the serial.
 * `8/2015/ND-CP` ≡ `08/2015/NĐ-CP`; the issuer segment still counts (`69/2018/TT-BTC` ≠ `69/2018/NĐ-CP`).
 * The bot's sameDocNumber (apps/zalo-bot/parse.mjs) folds the same way.
 */
export function foldDocNumber(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/Đ/g, 'D')
    .replace(/^0+(?=\d)/, '');
}

/** Read a document reference out of free text. Returns null when there is none. */
export function parseDocRef(input: string): ParsedDocRef | null {
  const text = String(input ?? '')
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
  // The issuer may end in digits (QH13, NQ-UBTVQH14); `full` must carry them to match exactly.
  const rawEnd = start + m[0].length + (hasIssuerSegment ? (after.match(/^\s*\/\s*[a-zà-ỹ][a-zà-ỹ\d-]*/i)?.[0].length ?? 0) : 0);
  const raw = text.slice(start, rawEnd).trim();
  return {
    core: `${m[1]}/${m[2]}`.toUpperCase(),
    docType,
    raw,
    full: hasIssuerSegment ? raw.replace(/\s+/g, '').toUpperCase() : null,
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
  consolidates: string | null;
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
    SELECT id, number, title, doc_type AS "docType", consolidates
    FROM legal_document
    WHERE ${matches}
    ORDER BY id
  `)) as unknown as ResolvedDoc[];

  // A full number names ONE document. Another issuer's document with the same serial is not it — and
  // returning [] lets the caller consult the Công báo catalogue instead of answering from the wrong one.
  if (ref.full) {
    const want = foldDocNumber(ref.full);
    return rows.filter((r) => foldDocNumber(r.number) === want || foldDocNumber(r.consolidates) === want);
  }

  // Prefer the kind the user named — but only when that leaves something. Asking for
  // "Nghị định 08/2015" must still reach 46/VBHN-BTC, whose doc_type is 'vbhn'.
  if (ref.docType) {
    const typed = rows.filter((r) => r.docType === ref.docType);
    if (typed.length) return typed;
  }
  return rows;
}

/**
 * Ministry names → the issuer suffix their circulars carry. People cite a circular the
 * way they say it out loud — "thông tư 36 của bộ Khoa học công nghệ" — with the serial
 * and the ministry but no year and no suffix. That is not a malformed reference, it is
 * the normal one, and NUMBER_RE cannot see it because there is no `số/năm` pair.
 */
const ISSUER_WORDS: Array<[RegExp, suffix: string, display: string]> = [
  [/khoa học\s*(và|va)?\s*công nghệ|khcn/i, 'BKHCN', 'Bộ Khoa học và Công nghệ'],
  [/tài chính|tai chinh|\bbtc\b/i, 'BTC', 'Bộ Tài chính'],
  [/công thương|cong thuong|\bbct\b/i, 'BCT', 'Bộ Công Thương'],
  [/giao thông|giao thong|\bbgtvt\b/i, 'BGTVT', 'Bộ Giao thông vận tải'],
  [/y tế|y te|\bbyt\b/i, 'BYT', 'Bộ Y tế'],
  [/nông nghiệp|nong nghiep/i, 'BNN', 'Bộ Nông nghiệp'],
  [/tài nguyên|tai nguyen|môi trường|moi truong/i, 'BTNMT', 'Bộ Tài nguyên và Môi trường'],
  [/quốc phòng|quoc phong|\bbqp\b/i, 'BQP', 'Bộ Quốc phòng'],
  [/công an|cong an|\bbca\b/i, 'BCA', 'Bộ Công an'],
  [/tư pháp|tu phap|\bbtp\b/i, 'BTP', 'Bộ Tư pháp'],
  [/xây dựng|xay dung|\bbxd\b/i, 'BXD', 'Bộ Xây dựng'],
  [/lao động|lao dong/i, 'BLĐTBXH', 'Bộ Lao động - Thương binh và Xã hội'],
  [/thông tin\s*(và|va)?\s*truyền thông|thong tin.*truyen thong|\bbttt/i, 'BTTTT', 'Bộ Thông tin và Truyền thông'],
  [/kế hoạch\s*(và|va)?\s*đầu tư|ke hoach.*dau tu/i, 'BKHĐT', 'Bộ Kế hoạch và Đầu tư'],
  [/giáo dục|giao duc/i, 'BGDĐT', 'Bộ Giáo dục và Đào tạo'],
  [/ngoại giao|ngoai giao|\bbng\b/i, 'BNG', 'Bộ Ngoại giao'],
  [/nội vụ|noi vu|\bbnv\b/i, 'BNV', 'Bộ Nội vụ'],
  [/văn hóa|van hoa/i, 'BVHTTDL', 'Bộ Văn hóa, Thể thao và Du lịch'],
  [/ngân hàng nhà nước|ngan hang nha nuoc|\bnhnn\b/i, 'NHNN', 'Ngân hàng Nhà nước'],
];

export interface LooseDocRef {
  serial: string; // '36'
  issuer: string; // 'BKHCN'
  label: string; // what to echo back: 'Thông tư 36 của Bộ Khoa học và Công nghệ'
}

/**
 * A reference by serial + issuing body, with no year: "thông tư 36 của bộ Khoa học công
 * nghệ". Returns null unless BOTH a bare serial and a recognised ministry are present —
 * without the ministry, "thông tư 36" alone is far too weak to scope anything on.
 */
export function parseLooseDocRef(input: string): LooseDocRef | null {
  const text = String(input ?? '').normalize('NFC');
  if (/\d+\s*\/\s*\d{4}/.test(text)) return null; // a full number; the precise parser owns it
  const m = text.match(/(?:thông tư|thong tu|tt)\s*(?:số\s*)?(\d{1,4})\b/i);
  if (!m) return null;
  for (const [re, issuer, display] of ISSUER_WORDS) {
    if (re.test(text)) {
      // The label is read by a person, so it names the ministry, not its acronym.
      return { serial: m[1]!, issuer, label: `Thông tư ${m[1]} của ${display}` };
    }
  }
  return null;
}

/** Catalogue entries matching a serial + issuer, any year: '36/%/TT-BKHCN'. */
export async function lookupGazetteLoose(db: Database, ref: LooseDocRef, limit = 6): Promise<GazetteMatch[]> {
  const serials = [...new Set([ref.serial, ref.serial.replace(/^0+/, ''), ref.serial.padStart(2, '0')])];
  const patterns = serials.map((s) => `${s}/%/TT-${ref.issuer}%`);
  return (await db.execute(sql`
    SELECT DISTINCT ON (number) number, doc_type AS "docType", title,
           source_url AS "sourceUrl", congbao_id AS "congbaoId"
    FROM gazette_document
    WHERE ${sql.join(patterns.map((p) => sql`upper(number) LIKE ${p.toUpperCase()}`), sql` OR `)}
    ORDER BY number, congbao_id DESC
    LIMIT ${limit}
  `)) as unknown as GazetteMatch[];
}

export interface GazetteMatch {
  number: string;
  docType: string;
  title: string;
  sourceUrl: string;
  congbaoId: number;
}

/**
 * Look a document reference up in the Công báo CATALOGUE — what exists, as opposed to
 * `resolveDocuments`, which searches what we have ingested. This is what turns "chưa có
 * trong kho" from a dead end into a usable answer: the document's real title, its gazette
 * link, and something to offer to fetch.
 *
 * Prefix match on the number head, because users type "38/2015" for "38/2015/TT-BTC".
 * Ordered newest-id-first so the most recent gazette entry for a number leads.
 */
export async function lookupGazette(
  db: Database,
  ref: ParsedDocRef,
  limit = 5,
): Promise<{ exact: boolean; matches: GazetteMatch[] }> {
  const select = (where: ReturnType<typeof sql>) =>
    db.execute(sql`
      SELECT DISTINCT ON (number) number, doc_type AS "docType", title,
             source_url AS "sourceUrl", congbao_id AS "congbaoId"
      FROM gazette_document
      WHERE ${where}
      ORDER BY number, congbao_id DESC
      LIMIT ${limit}
    `) as unknown as Promise<GazetteMatch[]>;

  // When the user wrote the issuer segment they named ONE document. Match it exactly.
  // Falling straight to the number head would answer "36/2016/TT-BKHCN" with
  // 36/2016/TT-BCT — a different circular from a different ministry, offered as if it
  // were the one asked for. That is the confident-wrong failure this system exists to
  // avoid, and it is worse than saying we cannot find it.
  if (ref.full) {
    // Folded in SQL, not by filtering the prefix query below: that one has a LIMIT, so with more than
    // `limit` numbers sharing the head, the document asked for could be cut before it is compared.
    const hit = await select(sql`regexp_replace(translate(upper(number), 'Đđ', 'DD'), '^0+', '') = ${foldDocNumber(ref.full)}`);
    if (hit.length) return { exact: true, matches: hit };
  }

  const bare = ref.core.replace(/^0+/, '');
  const padded = /^\d\//.test(ref.core) ? `0${ref.core}` : ref.core;
  const heads = [...new Set([ref.core, bare, padded])];
  const rows = await select(sql.join(heads.map((h) => sql`upper(number) LIKE ${`${h}%`}`), sql` OR `));

  // A user naming a kind ("Thông tư 38/2015") means it; drop other kinds when any survive.
  const typed = ref.docType ? rows.filter((r) => r.docType === ref.docType) : [];
  const matches = typed.length ? typed : rows;
  // Exact only when the user gave no issuer AND exactly one document carries that head.
  return { exact: !ref.full && matches.length === 1, matches };
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
