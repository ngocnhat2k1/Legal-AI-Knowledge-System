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
import { HS_RE, hasHs, parseDocRef } from './parse.mjs';

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
 * A quoted bot reply that looked a code up. Any reply naming a code is not one: "Mã 3005.10.10 bạn tham khảo thuộc nhóm
 * 30.05…" (a code check) quoted with "sai rồi" would record the user's own code as wrong.
 * A composed /answer reply is never one (plan 08 §6.3): the code-written user-code sentence ("bạn nêu"), the candidates
 * heading, the mixed-mode tariff heading and the opener of every candidate rate block ("Nếu hàng thuộc mã", the first line
 * of the block, so it travels with the rate even when a long reply puts the block in a later message) mark it, so a quoted
 * "sai rồi" cannot record the user's code or a candidate.
 * ponytail: every tariff reply prints "MFN" and every verdict reply "Cảm ơn"; tag replies in memory if that stops holding.
 */
const COMPOSED = /Ứng viên để chuyên viên chốt:|bạn nêu|Thuế của mã trong câu hỏi:|Nếu hàng thuộc mã/;
export const tariffReply = (quoteText) =>
  hasHs(quoteText) && /MFN|Cảm ơn|chưa đúng \(theo|sửa thành/.test(quoteText) && !COMPOSED.test(String(quoteText).normalize('NFC'));

/**
 * A question, not a verdict: "8481.80.99 có sai không ạ", "mã này đúng chưa?". The disagreement cue matched "sai" and
 * the correction path recorded 'correct' for the very code the user was doubting (R13).
 */
export const readsAsQuestion = (text) =>
  /\?|(?<![\p{L}])(không|ko|chưa|hả|à|nhỉ)(\s+(ạ|vậy|nhỉ|nhé|a|em|anh|chị|bạn))?\s*[.!…]*$/u.test(
    String(text ?? '').toLowerCase().normalize('NFC').trim(),
  );

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
 * @param {boolean} input.pendingIngest the bot has offered to fetch a document and is awaiting a yes
 */
export function fastPath({ text, hasImage = false, quoteText = '', topic = null, tariffFresh = false, candidatesFresh = false, pendingIngest = false }) {
  const onTariff = topic === 'tariff';

  // Checked BEFORE the image branch on purpose: replying to a photo and typing exactly
  // "đúng" must record the verdict, not re-run vision on the photo.
  // An open offer to fetch a document consumes a bare "nạp"/"ok" first: the same word
  // would otherwise read as a tariff confirmation, which is a different topic entirely.
  if (pendingIngest && isAcceptIngest(text) && !hasImage) return { action: 'ingest' };
  if (!hasImage && isGreeting(text)) return { action: 'greeting' };

  const verdict = confirmVerdict(text);
  if (verdict) {
    // A bare "đúng" only means "confirm that rate" when there IS a rate on the table.
    // On a legal thread it is ordinary agreement and must write nothing to the trail.
    if (onTariff && tariffFresh) return { action: 'confirm', verdict };
    return null;
  }

  if (hasImage) return null; // a photo is a new subject; the vision path owns it

  // Correction carries a NEW HS code and writes to the verify-on-use trail, so it needs
  // a tariff answer to correct. `quoteText` counts only when it actually contains an HS
  // code — the old `is a reply at all` test is what let legal replies in here.
  // On a candidates thread only "HS đúng là <mã>" is one: there is no old code, and a quoted composed reply names only
  // candidates or the user's own code, neither of which may be recorded as wrong (plan 08 §6.3).
  const correctable = candidatesFresh ? confirmingCue(text) : tariffFresh || tariffReply(quoteText);
  if (isDisagreement(text) && !readsAsQuestion(text) && onTariff && correctable) {
    return { action: 'correction' };
  }
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

const INTENTS = new Set(['tariff', 'hs', 'legal', 'status', 'mixed', 'general', 'confirm', 'correction', 'refine', 'check_code']);

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
