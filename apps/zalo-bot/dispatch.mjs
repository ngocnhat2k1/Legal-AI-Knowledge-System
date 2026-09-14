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
import { HS_RE, hasHs, parseDocRef, parseQuotedTariff } from './parse.mjs';

/** Whole-message confirmations. Matched EXACTLY, so a real caption never trips them. */
export const CONFIRM_WORDS = {
  correct: ['đúng', 'dung', 'chuẩn', 'chuan', 'chính xác', 'chinh xac', 'đúng rồi', 'dung roi', 'chuẩn rồi', 'ok', 'oke', 'okie', 'okay', 'đúng vậy', 'chuẩn luôn', 'chính xác rồi'],
  wrong: ['sai', 'sai rồi', 'sai roi', 'không đúng', 'ko đúng', 'khong dung', 'ko dung', 'không chính xác', 'sai bét', 'sai rồi nhé'],
  unsure: ['không chắc', 'ko chắc', 'khong chac', 'chưa chắc', 'chua chac', 'không rõ', 'khong ro', 'chưa rõ', 'chưa chắc chắn'],
};

/** 'correct' | 'wrong' | 'unsure' when the WHOLE message is one confirmation word; else null. */
export function confirmVerdict(text) {
  const t = String(text ?? '').toLowerCase().normalize('NFC').replace(/[.!,?…\s]+$/g, '').trim();
  for (const [verdict, words] of Object.entries(CONFIRM_WORDS)) if (words.includes(t)) return verdict;
  return null;
}

/**
 * "This answer is wrong" — in a multi-word message. Topic-neutral by nature: these
 * words say the previous answer missed, not WHAT it missed. What they mean depends
 * entirely on what the previous answer was about, which is why callers must gate on topic.
 */
export const DISAGREE_CUE =
  /(?<![\p{L}])(sai|không phải|ko phải|khong phai|phải là|phai la|đúng là|dung la|mã đúng|ma dung|hs đúng|hs dung|không đúng|khong dung|chỉnh lại|chinh lai|sửa lại|sua lai|nhầm|nham|không chính xác|khong chinh xac|ý tôi là|y toi la|không phải cái|tôi muốn hỏi|toi muon hoi)(?![\p{L}])/u;

export const isDisagreement = (text) => DISAGREE_CUE.test(String(text ?? '').toLowerCase());

const TARIFF_CUE = /thuế|%|phần trăm|xuất xứ|c\/o|mfn|fta|ưu đãi|biểu/;
const LEGAL_LIST_CUE =
  /danh mục|rủi ro|kiểm tra chuyên ngành|quản lý chuyên ngành|giấy phép|hợp quy|hợp chuẩn|kiểm dịch|năng lượng|thông tư|nghị định|quyết định|công văn|văn bản/;

/**
 * An HS code inside a question about a legal list is a legal question: "mũ bảo hiểm 6506.10.10 thuộc danh mục rủi ro
 * nào theo Thông tư 36/2026" asks which document lists the code, and the tariff lookup the code would otherwise
 * trigger answered with MFN 20% (observed 2026-09-14). Any tariff cue keeps the tariff path.
 */
export function legalAboutCode(text) {
  const t = String(text ?? '').toLowerCase().normalize('NFC');
  return hasHs(t) && !TARIFF_CUE.test(t) && LEGAL_LIST_CUE.test(t);
}

/** Lower case without diacritics: staff type "thue nk", "ma hs", "dc k" as often as the accented forms. */
export const fold = (text) =>
  String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

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
 * Every spelling of a code or heading the router must not see: an 8-digit code; digits after a word naming one ("nhóm
 * hàng 3005", "mã số 30.05.10.10", "HS: 3005", "chương 30"); a dotted "3005.10" or "30.05" standing alone. Not a date
 * ("ngày 30.05", "14.09.2026"), an amount ("12.50%", "12.50 triệu") or a time ("08.30 sáng").
 */
const HS_TOKEN = new RegExp(
  `${HS_RE.source}` +
    `|(?<=(?:nhóm(?:\\s*hàng)?|mã(?:\\s*số)?(?:\\s*hs)?|hs(?:\\s*code)?|chương)\\s*:?\\s*)\\d{2}(?:\\.?\\d{2}(?:\\.\\d{2}){0,2})?(?![\\d/])` +
    `|(?<![\\d.,/])\\d{4}\\.\\d{2}(?![\\d/%]|[.,]\\d)` +
    `|(?<![\\d.,/]|ngày\\s)\\d{2}\\.\\d{2}(?:\\.\\d{2}){0,2}(?![\\d/%]|[.,]\\d|\\s*(?:triệu|tỷ|đồng|usd|giờ|sáng|chiều|h(?![\\p{L}])))`,
  'giu',
);
/**
 * A bare heading joined to one already masked: "nhóm [mã 1] hay 3824", and a list "nhóm [mã 1] hoặc 3824, và 3926" —
 * a heading may end at punctuation, and connectors may follow each other (", và").
 */
const JOINED_HEADING = /(\[mã \d+\](?:\s*(?:,|hay|hoặc|hoac|và|va|sang))+\s*)(\d{4})(?![\d/]|[.,]\d)/giu;
export const CODE_MARK = /\[mã \d+\]/g;

/**
 * The router never sees the digits of a code (R4): a code the user prefers is not a premise, whether it is in the new
 * message, an earlier turn or the "code just looked up" line. Each code becomes `[mã n]`, the same n wherever it recurs,
 * so a rewritten question can be given its codes back.
 */
export function codebook() {
  const codes = [];
  const key = (m) => {
    const d = m.replace(/[.\s]/g, '');
    return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : m;
  };
  const mark = (m) => {
    const k = key(m);
    const i = codes.includes(k) ? codes.indexOf(k) : codes.push(k) - 1;
    return `[mã ${i + 1}]`;
  };
  // NFC first: Unikey's "Unicode tổ hợp" types "nhóm" decomposed, and the keyword lookbehind would miss it.
  const mask = (text) => {
    let s = String(text ?? '').normalize('NFC').replace(HS_TOKEN, mark);
    for (let prev = ''; prev !== s; ) [prev, s] = [s, s.replace(JOINED_HEADING, (_, head, code) => head + mark(code))];
    return s;
  };
  return { codes, mask };
}

export const unmaskCodes = (text, codes = []) => String(text ?? '').replace(/\[mã (\d+)\]/g, (m, n) => codes[n - 1] ?? m);

/**
 * "Vì sao hàng của em vào mã X", "mã này dùng đc k": a question about the code itself, the user's code as the premise
 * of a classification (R4). Read without diacritics and with the short forms staff type; a question about what a list or
 * a rule allows ("xe 8703.23.51 nhập khẩu được không") is not one.
 */
export const asksCodeFit = (text) =>
  /(?<![a-z])(?:ma|code|hs|nhom)(?![a-z])[^?!\n]{0,40}(?<![a-z])(?:duoc|dc|dung|sai|phu hop|ok|chuan)\s*(?:khong|ko|k|chua|ha|a|nhi)(?![a-z])|(?<![a-z])(?:vi sao|tai sao|sao lai)(?![a-z])|(?<![a-z])(?:ap|vao|thuoc|khai|tham khao)\s+(?:ma|nhom|code)(?![a-z])/.test(
    fold(text),
  );

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
/** The date-and-decrees line closing every rate block: a long reply's later message still belongs to its lookup. */
const BLOCK_END = /^Tra theo ngày \d{2}\/\d{2}\/\d{4}/m;
export const tariffReply = (quoteText) => {
  const q = String(quoteText ?? '').normalize('NFC');
  return hasHs(q) && TARIFF_LINE.test(q) && !COMPOSED.test(q);
};

/**
 * Composed prose may repeat an opener only the bot writes: a subject code is unmasked into the compose prompt, so a legal
 * answer can say "Hàng hóa có mã HS 6506.10.10 thuộc danh mục…". formatAnswerMd rewords every TARIFF_LINE opener wherever it
 * stands in the prose (render may start a message mid-paragraph), keeping the meaning: "Hàng có mã HS", "Có ghi nhận" (§6.3).
 */
export const unlikeTariffReply = (prose) =>
  String(prose ?? '')
    .normalize('NFC')
    .replace(/([Hh])àng hóa có mã HS/g, '$1àng có mã HS')
    .replace(/Đã (?=ghi nhận(?: (?:đúng|sai|chưa chắc) cho|:)? mã \d|ghi nhận đính chính từ |xác nhận mã \d)/g, 'Có ');

/** "HS đúng là X hay Y ạ": two codes to choose between. */
const ALT_CODE = new RegExp(`(?:^|\\s)(?:hay|hoac)\\s+(?:la\\s+)?(?:ma\\s+)?${HS_RE.source}`);

/**
 * A question, not a verdict: "8481.80.99 có sai không ạ", "mã này đúng chưa?", "ma nay sai k", "mã đúng là X hay Y ạ". The
 * disagreement cue matched "sai" and the correction path recorded 'correct' for the very code the user was doubting (R13).
 * Unaccented endings are read folded; "à" only as typed, since folded it is the "ạ" of "sai rồi ạ".
 */
export function readsAsQuestion(text) {
  const t = String(text ?? '').toLowerCase().normalize('NFC').trim();
  const f = fold(t);
  return (
    /\?|(?<![\p{L}])(không|ko|chưa|hả|à|nhỉ)(\s+(ạ|vậy|nhỉ|nhé|a|em|anh|chị|bạn))?\s*[.!…]*$/u.test(t) ||
    /(?:^|\s)(khong|ko|k|hong|chua|ha|nhi|sao)(\s+(a|vay|nhi|nhe|em|anh|chi|ban))?\s*[.!…]*$/.test(f) ||
    ALT_CODE.test(f)
  );
}

/**
 * "The code on the table is wrong", in a message with no code of its own: the whole message or its leading clause, holding
 * nothing but that ruling ("sai rồi", "mã này không đúng", "sai rồi, không phải loại này"). "em gõ sai", "hỏi sai câu rồi",
 * "mình ghi nhầm" tell of the user's own slip; "không phải", "ý tôi là" point at the question (R13).
 */
const WRONG_CLAUSE =
  /^(?:(?:ma|hs|code|ket qua)(?: (?:nay|do|vua tra))? )?(?:sai(?: ma| bet)?|khong dung|ko dung|k dung|khong chinh xac|ko chinh xac|nham ma)(?: (?:roi|nhe|nha|a|ban|bot|oi|luon|het))*$/;
const rulesWrong = (text) => WRONG_CLAUSE.test(fold(text).split(/[,;.!?…\n]/)[0].trim());

/**
 * "HS đúng là 8422.90.90", "mã đúng: …": a confirming word right before the code — a ruling typed on purpose. "8481.80.99
 * có sai không" names a code too, and is a doubt (R13).
 */
export function confirmingCue(text) {
  const t = fold(text);
  const at = t.search(HS_RE);
  return at > 0 && /(dung la|ma dung|hs dung|chinh xac la|chuan la)\s*(la|:)?\s*(ma\s*)?$/.test(t.slice(0, at));
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
 * @param {?string} input.tableHs    the code of the lookup memory holds, fresh or not; null after a 404 or candidates
 * @param {boolean} input.pendingIngest the bot has offered to fetch a document and is awaiting a yes
 */
export function fastPath({ text, hasImage = false, quoteText = '', topic = null, tariffFresh = false, candidatesFresh = false, tableHs = null, pendingIngest = false }) {
  const onTariff = topic === 'tariff';

  // Checked BEFORE the image branch on purpose: replying to a photo and typing exactly
  // "đúng" must record the verdict, not re-run vision on the photo.
  // An open offer to fetch a document consumes a bare "nạp"/"ok" first: the same word
  // would otherwise read as a tariff confirmation, which is a different topic entirely.
  // Only while the thread is still on that document: a later answer asking "hàng có tẩm dược chất không?" gets a "có" too.
  if (pendingIngest && topic === 'legal' && isAcceptIngest(text) && !hasImage) return { action: 'ingest' };
  if (!hasImage && isGreeting(text)) return { action: 'greeting' };

  // A quoted message is the tariff result on the table only by its code, never by wording: a tariff reply naming the code
  // memory holds, or a later message of that reply with no code (its "Tra theo ngày" line) while the lookup is fresh. Anything
  // else quoted (a composed answer, an offer, an older lookup) is what the reply is about, whatever memory holds (R13). A
  // reply to a photo is about the photo.
  const quoted = String(quoteText ?? '').normalize('NFC');
  const onTable = tariffReply(quoted)
    ? Boolean(tableHs) && parseQuotedTariff(quoted)?.hs === tableHs
    : tariffFresh && !hasHs(quoted) && BLOCK_END.test(quoted) && !COMPOSED.test(quoted);
  const elsewhere = Boolean(quoted) && !hasImage && !onTable;

  const verdict = confirmVerdict(text);
  if (verdict) {
    // A bare "đúng" only means "confirm that rate" when there IS a rate on the table.
    // On a legal thread it is ordinary agreement and must write nothing to the trail.
    if (onTariff && tariffFresh && !elsewhere) return { action: 'confirm', verdict };
    return null;
  }

  if (hasImage) return null; // a photo is a new subject; the vision path owns it

  // Correction writes to the verify-on-use trail, so it needs a tariff result to correct and a ruling typed on purpose:
  // "HS đúng là <mã>" names the right code, and a message with no code may only say the one on the table is wrong ("sai
  // rồi"). "tôi muốn hỏi thuế 8481.80.91", "không phải, 6307.90.90 cơ", "ý tôi là …" rule nothing: the plan reads them, and a
  // code without a confirming word gets an offer (plan 08 §2.2 rows 3 and 10).
  // On a candidates thread only "HS đúng là <mã>" is one: there is no old code, and a quoted composed reply names only
  // candidates or the user's own code, neither of which may be recorded as wrong (plan 08 §6.3).
  const coded = hasHs(text);
  // A coded ruling quoting an offer still rules on the table; quoting another lookup it would record the code in memory as wrong.
  const ruled = coded ? confirmingCue(text) : rulesWrong(text);
  const onResult = candidatesFresh ? coded : elsewhere ? coded && tariffFresh : tariffFresh || onTable;
  if (ruled && !readsAsQuestion(text) && onTariff && onResult && !(elsewhere && tariffReply(quoted))) return { action: 'correction' };
  return null;
}

/**
 * Accepting the bot's offer to fetch a document. Matched only when an offer is actually
 * open (state.legal.pendingIngest), so a bare "ok" in any other context stays harmless —
 * the same topic discipline the confirm/correction cues follow.
 */
const ACCEPT_WORDS = ['nạp', 'nap', 'có', 'co', 'ok', 'oke', 'okay', 'đồng ý', 'dong y', 'nạp đi', 'nap di', 'lấy về', 'lay ve', 'ừ', 'u', 'yes'];

export function isAcceptIngest(text) {
  const t = String(text ?? '').toLowerCase().normalize('NFC').replace(/[.!,?…\s]+$/g, '').trim();
  return ACCEPT_WORDS.includes(t);
}

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

/**
 * Fallback when no LLM is available (no CLAUDE_CODE_OAUTH_TOKEN). Without a router the
 * bot used to treat every non-HS message as a product-keyword lookup, which is how a
 * legal follow-up became a tariff search. Stay on the current topic instead.
 */
export function fallbackIntent({ topic = null, text = '' }) {
  if (topic === 'legal') return 'legal';
  if (isDisagreement(text) && topic === 'general') return 'general';
  if (parseDocRef(text)?.confident) return 'legal'; // "Nghị định 69/2018/NĐ-CP còn áp dụng không" is no product
  return 'tariff';
}
