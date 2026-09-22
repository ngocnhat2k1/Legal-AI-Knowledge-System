/**
 * Which conversation branch a message belongs to. PURE — no I/O, no LLM — because
 * this is where the bot's worst bug lived and a pure function can be tested.
 *
 * THE BUG THIS FILE EXISTS TO FIX (observed 2026-08-13): a staff member asked about
 * a Thông tư, disliked the answer, and replied "không phải câu trả lời tôi muốn, bạn
 * tìm đúng thông tư mà tôi yêu cầu". The bot answered "Đã ghi nhận: mã trước chưa
 * đúng. Bạn gửi MÃ HS đúng". It had jumped from a legal conversation into the HS-code
 * correction flow.
 *
 * The cause was one predicate: the correction branch fired when
 * `(a recent tariff lookup exists) || (the message is a reply)`. Merely tapping reply
 * satisfied it, and the correction cue "không phải" matched, so ANY disagreement on
 * ANY topic was recorded as "the HS code was wrong".
 *
 * The rule now: follow-up cues are read RELATIVE TO THE TOPIC. The same words mean
 * different things in different conversations —
 *
 *     "không phải"  after a tariff answer  →  the HS code is wrong   (correction)
 *     "không phải"  after a legal answer   →  the document is wrong  (refine)
 *     "đúng"        after a tariff answer  →  confirm this rate
 *     "đúng"        after a legal answer   →  just agreement, record nothing
 *
 * so a cue that does not match the current topic is never allowed to reach a handler
 * that would write to the audit trail.
 */
import { detectOrigin, HS_RE, hasHs, ORIGIN_LABEL } from './parse.mjs';

const wholeMessage = (text) => String(text ?? '').toLowerCase().normalize('NFC').replace(/[.!,?…\s]+$/g, '').trim();

/** Lower case without diacritics: staff type "thue nk", "ma hs", "dc k" as often as the accented forms. */
export const fold = (text) =>
  String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/**
 * The verdict ledger's closed grammar (R13, plan 08 §6.3). A message writes only when the WHOLE of it is one of these forms, one
 * space between words, with at most a courtesy particle and "." or "!" at the end. Nothing is inferred from anything longer: every
 * hedge, question or second clause staff have typed ("mã đúng là X thì thuế bao nhiêu", "… hay sao ấy", "sai rồi, sao lại ra mã
 * này") wrote once a heuristic missed it. Such a message goes to the plan, and the offer there spells out the form to send; a
 * ruling not written costs one round trip, a written doubt stays in the trail. A "?" anywhere, or a typed "à", "á", "hả", rules
 * nothing.
 * Read as typed: a message with any diacritic matches the accented forms exactly, and only a message with none ("dung roi") the
 * one-word and code-less forms folded, fewer of them. Folding an accented message turned other words into verdicts: "dùng rồi"
 * (already used) wrote 'correct', "không dùng" and "sài rồi" 'wrong', and "sai á", "sai nhẹ" passed as a courtesy particle (round 4).
 */
/**
 * The courtesy particle and closing marks, as written and folded: unaccented, a bare "a" may be "à" ("dung a" is "đúng à?"), and
 * "nhe", "nha" may close "dùng nhé" ("dung nhe", round 8).
 */
const TAIL = ['(?: (?:ạ|a|nhé|nhe|nha|nhá|bạn|ban))?[.!]*$', '(?: ban)?[.!]*$'];
/** A form as written, and folded; `folded` when the unaccented reading takes less than the folded form. */
const grammar = (source, folded = fold(source)) => [new RegExp(source.normalize('NFC') + TAIL[0]), new RegExp(folded + TAIL[1])];
// Unaccented, "khong dung", "ko dung", "k dung" and "chua dung" may be "không dùng", "chưa dùng" (round 6); "k chac" is left to the
// accented form too (U08, round 8).
const VERDICT = {
  correct: grammar('^(?:đúng(?: rồi| r)?|chuẩn|chính xác)'),
  wrong: grammar('^(?:sai(?: rồi| r)?|(?:không|ko|k) đúng)', '^sai(?: roi| r)?'),
  unsure: grammar('^(?:không|ko|k) chắc', '^(?:khong|ko) chac'),
};
/**
 * "mã này sai", "kết quả vừa tra không đúng": the code on the table is wrong, and nothing else is said. "nhầm mã rồi" and "vừa tra
 * nhầm mã rồi" usually own a typo in the code the user typed (round 6), so "vừa tra" needs its subject. Unaccented, the subject needs
 * its noun: "nay sai", "do sai" may be other words than "này", "đó" (round 8).
 */
const SUBJECT = '(?:mã hs|mã|hs|code|kết quả) (?:(?:này|đó|vừa tra) )?';
const CODELESS_WRONG = grammar(`^(?:${SUBJECT}|(?:này|đó) )?(?:sai(?: rồi| r)?|(?:không|ko|k|chưa) đúng)`, fold(`^(?:${SUBJECT})?sai(?: rồi| r)?`));
/**
 * The origin spellings detectOrigin (parse.mjs) reads, as written; its codes only in capitals. handleCorrection checks a named origin
 * against the lookup's with detectOrigin, so a spelling it cannot read ("xuất xứ jp") skipped the check and wrote under the lookup's
 * origin (round 6). A spec reads every one, so the two lists cannot drift apart.
 */
const CODES = ['TQ', 'CN', 'JP', 'KR', 'AU', 'NZ', 'TH', 'MY', 'SG', 'ID', 'PH', 'DE', 'EU', 'GB', 'UK', 'US', 'VN'];
export const COUNTRY = [
  'trung quốc', 'nhật bản', 'nhật', 'hàn quốc', 'thái lan', 'mã lai', 'châu âu', 'ấn độ', 'anh quốc',
  'tq', 'china', 'japan', 'korea', 'australia', 'new zealand', 'thailand', 'malaysia', 'singapore', 'indonesia', 'philippines', 'germany', 'india',
  ...CODES,
];
const oneOf = (list) => `(?:${list.join('|').toLowerCase()})`;
const CITATION = '(?:(?:theo|căn cứ) )?(?:cv|công văn|qđ|quyết định|tb|thông báo)(?: số)?:? ?\\d[a-zđ0-9/.-]*';
/** "HS đúng là 8481.80.91", "sai rồi, mã đúng phải là … xuất xứ Trung Quốc theo CV 12/TCHQ nhé": one code, an origin, a citation. */
const coded = (country) =>
  `^(?:sai(?: rồi| r)?[,.]? )?(?:mã hs|mã|hs|code)(?: hs)? (?:đúng|chuẩn|chính xác)(?: phải)?(?: là ?|: ?)` +
  `\\d{4}[. ]?\\d{2}[. ]?\\d{2}(?!\\d|\\.\\d)(?:,? (?:xuất xứ ${country}|${CITATION})){0,2}`;
/**
 * Accented only: unaccented, "hs dung la X" and "ma dung la X" may be "HS dùng là", "mã dùng là" (round 8). Every offer naming this
 * command spells it with accents.
 */
const CODED = grammar(coded(oneOf(COUNTRY)), '(?!)');
/** The country of the origin slot, as typed. */
const ORIGIN_SLOT = new RegExp(`xuất xứ (${COUNTRY.join('|')})(?![\\p{L}\\d])`, 'iu');
const ALL_CODES = new RegExp(HS_RE.source, 'g');

/** {verdict} for a one-word verdict, {wrong} for a code-less "the code is wrong", {coded} for "HS đúng là <mã>"; else null. */
export function ruling(text) {
  const raw = String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const t = raw.toLowerCase();
  if (/\?|(?<!\p{L})(?:à|á|hả)(?!\p{L})/u.test(t)) return null;
  const read = t === fold(t) ? 1 : 0;
  const is = (form) => form[read].test(t);
  for (const [verdict, form] of Object.entries(VERDICT)) if (is(form)) return { verdict };
  if (is(CODELESS_WRONG)) return { wrong: true };
  if (!is(CODED) || (t.match(ALL_CODES) ?? []).length !== 1) return null;
  // One named origin, read from its slot as typed, and the message exactly as handleCorrection reads it (not normalised: typed
  // decomposed it reads none) reads that origin and no other (a citation number may hold "12/tq"). With no slot it reads none: on a
  // candidates or photo table there is no lookup origin to hold a citation's "CV 12/HQ-CN" or "TB 12/TB-TH" to (round 8).
  const named = t.match(/xuất xứ/g)?.length ?? 0;
  if (!named) return detectOrigin(text) ? null : { coded: true };
  const origin = named === 1 && detectOrigin(raw.match(ORIGIN_SLOT)?.[1]);
  return origin && origin === detectOrigin(text) ? { coded: true } : null;
}

/**
 * A whole-message verdict word as staff type it, for ROUTING only (no write reads it): "chuẩn rồi", "đúng vậy", "chưa chắc" are
 * agreement or doubt outside the ledger's grammar. After an answer that is no lookup, agreement gets AGREED without composing the
 * answer again; on a fresh lookup any of them gets the offer that names the command (index.mjs). A "?" keeps it a question.
 */
const VERDICT_WORDS = {
  correct: ['đúng', 'dung', 'đúng rồi', 'dung roi', 'đúng r', 'dung r', 'chuẩn', 'chuan', 'chính xác', 'chinh xac', 'chuẩn rồi', 'đúng vậy', 'chuẩn luôn', 'chính xác rồi'],
  wrong: ['sai', 'sai rồi', 'sai roi', 'sai r', 'không đúng', 'ko đúng', 'khong dung', 'ko dung', 'không chính xác', 'sai bét'],
  unsure: ['không chắc', 'ko chắc', 'k chắc', 'khong chac', 'chưa chắc', 'chua chac', 'không rõ', 'khong ro', 'chưa rõ', 'chua ro', 'chưa chắc chắn'],
};
export function plainVerdict(text) {
  const t = String(text ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').replace(/[.!…]+$/, '').trim().replace(/ (?:ạ|a|nhé|nhe|nha|nhá|bạn|ban)$/, '');
  return Object.keys(VERDICT_WORDS).find((v) => VERDICT_WORDS[v].includes(t)) ?? null;
}

/** "ok", "oke": seen, noted. Agreement on any topic, never a verdict. */
export const isOkay = (text) => ['ok', 'oke', 'okie', 'okay'].includes(wholeMessage(text));

/** Every word a plain rate lookup is made of: "thuế nhập khẩu mã 8481.80.99 xuất xứ Trung Quốc là bao nhiêu %". */
const LOOKUP_WORDS = new Set(
  ('thuế suất nhập xuất khẩu xứ mã hs code hscode bao nhiêu nhiêu phần trăm % là của cho hàng hoá hóa mfn fta c/o co form ' +
    'ưu đãi biểu ngày từ nước tra cứu thì sao ạ nhé nha ơi em e anh chị ad hỏi giúp với hiện nay này năm bây giờ mấy ' +
    'tq cn jp kr au nz th my sg id ph de eu gb uk us vn trung quốc nhật bản hàn thái lan úc mỹ đức ấn độ châu âu ' +
    'singapore malaysia indonesia philippines new zealand china japan korea nk xk vat gtgt d ak aj rcep cptpp evfta ' +
    'acfta atiga aanzfta akfta ajcep vjepa vkfta aifta ahkfta ukvfta rex')
    .split(' ')
    .map(fold),
);

/**
 * A message that is only a code, an origin, a date and lookup words is a rate lookup and skips the router. Anything
 * more is read first: "e có miếng dán ngải cứu, tham khảo mã 30051010 không biết được không ạ" asks whether the code
 * fits the goods, and the direct lookup answered it with the MFN rate (observed 2026-09-14).
 */
export function isBareLookup(text) {
  const rest = fold(text)
    .replace(new RegExp(HS_RE.source, 'g'), ' ')
    .replace(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g, ' ');
  return rest.split(/[^\p{L}\d/%]+/u).filter((w) => w && !LOOKUP_WORDS.has(w)).length === 0;
}

/**
 * The message wants the reply's sources printed (owner, 2026-09-22: they print only when asked). "nguồn" is as often the goods
 * ("đèn kèm nguồn", "dây dẫn nguồn", "nguồn đầu vào 24V"), so it counts only in a phrase that asks for it.
 */
const SOURCES_ASK = /\b(?:kem|ghi|xin|gui) (?:can cu|trich dan|dan chung)\b|\b(?:xin|ghi|gui) nguon\b|\btrich dan\b|\bcan cu (?:phap ly|vao dau|o dau|dau|nao|gi)\b|\bnguon (?:o )?dau\b(?! vao| ra)/;
const words = (text) => fold(text).replace(/[^\p{L}\d]+/gu, ' ').trim();
export const asksSources = (text) => SOURCES_ASK.test(words(text)) || onlyAsksSources(text);

/** Words a bare request for sources may carry besides the source word itself ("cho mình xin nguồn câu trên với ạ"). */
const SOURCES_FILLER = new Set('cho minh em toi xin gui ghi voi di nhe nha a vay the dau o vao nao gi cua cau tra loi tren nay do kem lai giup ban bot oi duoc khong k ko co phap ly vua roi'.split(' '));
/** The whole message only asks for the last reply's sources: the one kind answered from memory, with no model call. */
export function onlyAsksSources(text) {
  const t = words(text);
  if (!/\b(?:nguon|can cu|trich dan|dan chung|link)\b/.test(t)) return false;
  return t.replace(/\b(?:nguon|can cu|trich dan|dan chung|link)\b/g, ' ').split(' ').every((w) => !w || SOURCES_FILLER.has(w));
}

/** A bare greeting gets the capabilities at once: "hi" used to go through the router and come back as a product search. */
const GREETINGS = ['hi', 'hello', 'hey', 'alo', 'chao', 'xin chao', 'chao bot', 'chao ban', 'hi bot', 'hello bot'];
export const isGreeting = (text) => GREETINGS.includes(fold(text).replace(/[.!,?…\s]+$/g, '').trim());

/**
 * A quoted bot reply that looked a code up: a line only the tariff lead or a verdict reply writes, at the start of a line.
 * Any reply naming a code is not one: "Mã 3005.10.10 bạn tham khảo thuộc nhóm 30.05…" (a code check) quoted with "sai
 * rồi" would record the user's own code as wrong, and model prose may say "MFN" or "Cảm ơn" anywhere.
 * A composed /answer reply is never one (plan 08 §6.3): the code-written user-code sentence ("Mã X bạn nêu"), the
 * candidates heading, the mixed-mode tariff heading and the opener of every candidate rate block ("Nếu hàng thuộc mã", the
 * first line of the block, so it travels with the rate even when a long reply puts the block in a later message) mark it,
 * so a quoted "sai rồi" cannot record the user's code or a candidate. Line starts again: prose may say "bạn nêu" too.
 */
const TARIFF_LINE =
  /^(?:(?:Đối với h|H)àng hóa có mã HS|Đã ghi nhận(?: (?:đúng|sai|chưa chắc) cho|:)? mã|Đã xác nhận mã) \d{4}\.\d{2}\.\d{2}|^Đã ghi nhận đính chính từ /m;
const COMPOSED = /^(?:Ứng viên để chuyên viên chốt:|Thuế của mã trong câu hỏi:|Nếu hàng thuộc mã |(?:Mã|Nhóm) [\d.]+ bạn nêu)/m;
export const tariffReply = (quoteText) => {
  const q = String(quoteText ?? '').normalize('NFC');
  return hasHs(q) && TARIFF_LINE.test(q) && !COMPOSED.test(q);
};

/** The tariff lead line: its code, then the rest of the line, where the origin is named ("có xuất xứ Trung Quốc"). */
const LEAD = /^(?:Đối với h|H)àng hóa có mã HS (\d{4})\.(\d{2})\.(\d{2})(.*)$/m;
/** A verdict or correction reply ("Đã ghi nhận sai cho mã …", "Đã xác nhận mã …"); not the history line "Đã xác nhận đúng 2 lần". */
const ACK = /^Đã (?:ghi nhận|xác nhận mã )/m;

/**
 * Does the quoted message show the lookup memory holds? Only a tariff lead line can say so, read from that line: its code,
 * and the origin it names, which must be the one in memory (no origin named: memory has none). The quote must carry the "Tra
 * theo ngày" line with memory's date: part 1 of a long lookup has none, and part 1 of an older lookup of the same code and origin
 * reads the same as today's (round 4). A verdict or correction reply names the code too, and quoting it disputes or thanks that
 * reply, even after the code is looked up again (R13).
 */
function showsLookup(quoted, table) {
  const lead = quoted.match(LEAD);
  if (!lead || !table?.hs || lead.slice(1, 4).join('') !== table.hs || ACK.test(quoted) || COMPOSED.test(quoted)) return false;
  const origin = table.origin ? `xuất xứ ${ORIGIN_LABEL[table.origin] ?? table.origin}` : null;
  const d = quoted.match(/^Tra theo ngày (\d{2})\/(\d{2})\/(\d{4})/m);
  // "chỉ áp dụng khi hàng có xuất xứ từ nước thành viên" names no origin.
  return (origin ? lead[4].includes(origin) : !/xuất xứ (?!từ )/.test(lead[4])) && Boolean(d) && `${d[3]}-${d[2]}-${d[1]}` === (table.snapshot?.date ?? table.date);
}

/**
 * The wording of an offer to record a ruling (codeOffer, a photo's candidate reply): 'nhắn "HS đúng là …"'. A quoted offer never
 * writes, since it names no origin, date or owner; composed prose saying the same is still reworded (unlikeTariffReply), so no
 * part of a composed reply reads as one.
 */
const OFFER = /"HS đúng là (?:<mã>|\d{4}\.\d{2}\.\d{2})"/;
export const offerReply = (quoteText) => OFFER.test(String(quoteText ?? '').normalize('NFC'));

/**
 * Composed prose may repeat an opener only the bot writes: a subject code is unmasked into the compose prompt, so a legal
 * answer can say "Hàng hóa có mã HS 6506.10.10 thuộc danh mục…". formatAnswerMd rewords every TARIFF_LINE opener wherever it
 * stands in a rendered line (render may start a message mid-paragraph), keeping the meaning: "Hàng có mã HS", "Có ghi nhận";
 * and an offer's straight quotes become curly ones (§6.3).
 */
export const unlikeTariffReply = (prose) =>
  String(prose ?? '')
    .normalize('NFC')
    .replace(/([Hh])àng hóa có mã HS/g, '$1àng có mã HS')
    .replace(/Đã (?=ghi nhận(?: (?:đúng|sai|chưa chắc) cho|:)? mã \d|ghi nhận đính chính từ |xác nhận mã \d)/g, 'Có ')
    .replace(/"(HS đúng là [^"\n]*)"/g, '“$1”');

/** "HS đúng là X hay Y ạ": two codes to choose between. */
const ALT_CODE = new RegExp(`(?:^|\\s)(?:hay|hoac)\\s+(?:la\\s+)?(?:ma\\s+)?${HS_RE.source}`);

/**
 * A question, not a verdict: "8481.80.99 có sai không ạ", "mã này đúng chưa?", "ma nay sai k", "hs dung la X phai hk", "mã
 * đúng là X hay Y ạ". Routing only (a plan's confirm or correction on a question composes hs): no write depends on it, the
 * ledger's grammar (ruling) is closed. Unaccented endings are read folded; "à" only as typed, since folded it is "ạ".
 */
export function readsAsQuestion(text) {
  const t = String(text ?? '').toLowerCase().normalize('NFC').trim();
  const f = fold(t);
  return (
    /\?|(?<![\p{L}])(không|ko|chưa|hả|à|nhỉ)(\s+(ạ|vậy|nhỉ|nhé|a|em|anh|chị|bạn))?\s*[.!…]*$/u.test(t) ||
    /(?:^|\s)(khong|ko|k|hong|hk|hok|khg|chua|ha|nhi|sao|chang)(\s+(a|vay|nhi|nhe|em|anh|chi|ban))?\s*[.!…]*$/.test(f) ||
    ALT_CODE.test(f)
  );
}

/**
 * The pre-router fast path. Returns an action when a cheap, unambiguous reading
 * exists (no LLM round trip needed), else null to let the router decide with history.
 *
 * @param {object} input
 * @param {string} input.text        the new message, mentions already stripped
 * @param {boolean} input.hasImage   the message is (or replies to) a photo
 * @param {string} input.quoteText   the replied-to message body, '' when not a reply
 * @param {?string} input.topic      what the conversation was about: 'tariff'|'legal'|'general'
 * @param {boolean} input.tariffFresh a recent tariff lookup is still referable
 * @param {boolean} input.candidatesFresh a composed hs reply's candidate headings are still referable (no code)
 * @param {?object} input.table      state.tariff, fresh or not: {hs, origin, date, snapshot, open, ruled} or {candidates, open}.
 *   `open` is set by the reply that put the table up and cleared by any other (conversation.mjs nextState); 'coded' after an
 *   offer spelling out "HS đúng là …", the failed verdict after a failed write. `ruled`: a ruling on it was recorded
 * @param {boolean} input.pendingIngest the bot has offered to fetch a document and is awaiting a yes
 * @param {boolean} input.lastReplyElsewhere the bot's last message in the thread did not answer this user: a colleague's reply in a
 *   group, or none known since a restart (index.mjs messageHandler)
 */
export function fastPath({ text, hasImage = false, quoteText = '', topic = null, tariffFresh = false, candidatesFresh = false, table = null, pendingIngest = false, lastReplyElsewhere = false }) {
  // An open offer to fetch a document consumes a bare "nạp"/"ok" first: the same word
  // would otherwise read as a tariff confirmation, which is a different topic entirely.
  // Only while the thread is still on that document: a later answer asking "hàng có tẩm dược chất không?" gets a "có" too.
  if (pendingIngest && topic === 'legal' && isAcceptIngest(text) && !hasImage) return { action: 'ingest' };
  if (!hasImage && isGreeting(text)) return { action: 'greeting' };

  // The closed grammar (ruling): nothing else reaches handleConfirm or handleCorrection. On a legal thread a verdict word is
  // ordinary agreement and writes nothing to the trail.
  const said = ruling(text);
  if (!said || topic !== 'tariff') return null;
  // A photo, or a reply to any photo, shows no lookup: it may be another photo than the table's, or a new photo captioned "chuẩn"
  // under a typed lookup (round 4). The ruling gets an offer naming the table, and vision does not run again on "đúng".
  if (hasImage) return tariffFresh || candidatesFresh ? { action: 'offer' } : null;
  // A recorded ruling closes its table for good: a second "đúng", or a "sai" quoting the lookup, rules nothing (R13).
  if (table?.ruled) return null;

  // A quoted message is the table only when it shows that lookup (showsLookup). Anything else quoted (a verdict or correction
  // reply, a composed answer, an offer, a candidates reply, an older lookup, a later part) is what the reply is about, whatever
  // memory holds (R13). With no quote, a ruling answers only the reply right before it, sent to this user: after NEEDS_CODE, an
  // offer about another code, "Đã ghi nhận sai…" or a colleague's reply in a group, an "ok" or "đúng" answers that reply. A failed
  // write leaves open only the verdict that failed, so resending it works.
  const quoted = String(quoteText ?? '').normalize('NFC');
  const onResult = (...opened) => (quoted ? showsLookup(quoted, table) : !lastReplyElsewhere && opened.includes(table?.open));

  // A one-word verdict only means "confirm that rate" when there IS a rate on the table, still fresh.
  if (said.verdict) return tariffFresh && onResult(true, said.verdict) ? { action: 'confirm', verdict: said.verdict } : null;
  // "mã này sai": the same table rule as a one-word verdict. There is no code to correct on a candidates thread.
  if (said.wrong) return tariffFresh && onResult(true, 'wrong') ? { action: 'correction' } : null;
  // "HS đúng là <mã>". On a candidates thread it records 'correct' for the goods described, never the user's code or a candidate as
  // wrong (§6.3), and only with no quote: similar goods share headings, so a quoted candidates reply or offer may be another goods'
  // (round 4). On a lookup it also records the code in memory as wrong; quoting that lookup, it works after memory went stale too.
  if (candidatesFresh) return !quoted && onResult(true, 'coded') ? { action: 'correction' } : null;
  return (quoted || tariffFresh) && onResult(true, 'coded') ? { action: 'correction' } : null;
}

/**
 * Accepting the bot's offer to fetch a document. Matched only when an offer is actually
 * open (state.legal.pendingIngest), so a bare "ok" in any other context stays harmless —
 * the same topic discipline the confirm/correction cues follow.
 */
const ACCEPT_WORDS = ['nạp', 'nap', 'có', 'co', 'ok', 'oke', 'okay', 'đồng ý', 'dong y', 'nạp đi', 'nap di', 'lấy về', 'lay ve', 'ừ', 'u', 'yes'];

export const isAcceptIngest = (text) => ACCEPT_WORDS.includes(wholeMessage(text));

/**
 * "xác nhận văn bản 36/2025/TT-BKHCN" — a person vouching for a document the bot
 * fetched itself. The unverified warning printed under every such citation tells the
 * reader to send exactly this, so the bot has to understand it; a promise the system
 * cannot keep is worse than no promise.
 */
export function parseVerifyDocCommand(text) {
  const m = String(text ?? '')
    .normalize('NFC')
    .match(/(?:xác nhận|xac nhan|duyệt|duyet)\s*(?:văn bản|van ban|vb)?\s*(\d{1,4}[A-Za-zĐđ]?\/[^\s,;]+)/i);
  return m ? m[1].replace(/[.,;:]+$/, '').toUpperCase() : null;
}

const INTENTS = new Set(['tariff', 'hs', 'legal', 'status', 'mixed', 'general', 'confirm', 'correction', 'refine']);

/**
 * Apply the same topic guards to the PLAN's intent. The model sees the transcript and
 * is usually right, but it is still a model: it can answer "correction" on a thread where
 * there is no HS code to correct. A guard here means no model output can reach a handler
 * that writes to the audit trail unless the conversation actually supports it — and since plan 08 a plan's confirm or
 * correction only ever gets an offer (codeOffer); the trail is written from fastPath's explicit cues alone (§6.3).
 *
 * Returns a terminal action: 'tariff' | 'hs' | 'legal' | 'status' | 'mixed' | 'general' | 'confirm' | 'correction'.
 */
export function guardIntent(intentRaw, { topic = null, tariffFresh = false, candidatesFresh = false, quoteText = '' } = {}) {
  const intent = INTENTS.has(intentRaw) ? intentRaw : 'tariff';
  const correctable = topic === 'tariff' && (tariffFresh || candidatesFresh || tariffReply(quoteText));

  if (intent === 'correction') return correctable ? 'correction' : topic === 'legal' ? 'legal' : 'tariff';
  if (intent === 'confirm') return topic === 'tariff' && (tariffFresh || candidatesFresh) ? 'confirm' : topic === 'legal' ? 'legal' : 'general';
  // "Refine" is "not that one" — it belongs to whatever we were already doing; after candidates, the classification.
  if (intent === 'refine') return topic === 'legal' ? 'legal' : topic === 'tariff' ? (candidatesFresh ? 'hs' : 'tariff') : 'general';
  return intent;
}
