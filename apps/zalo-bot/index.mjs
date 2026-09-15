/**
 * Zalo bot — nhắn tin tra biểu thuế + hỏi pháp luật hải quan qua Zalo, đóng gói TRONG
 * app (self-contained). Chạy như một service trong Docker Compose bên cạnh `api`.
 * Đăng nhập bằng zca-js (thư viện KHÔNG chính thức — dùng TÀI KHOẢN ZALO RIÊNG cho bot,
 * không dùng Zalo cá nhân, vì có rủi ro khóa tài khoản; xem ADR web-app-then-zalo).
 *
 * File này chỉ lo KẾT NỐI và ĐIỀU PHỐI. Việc ra quyết định nằm ở các module thuần:
 *
 *   parse.mjs        tách mã HS / xuất xứ / số hiệu văn bản (thuần, test được)
 *   dispatch.mjs     tin nhắn này thuộc nhánh nào — CÓ XÉT CHỦ ĐỀ ĐANG BÀN
 *   conversation.mjs bộ nhớ hội thoại (lưu ở Postgres qua API)
 *   router.mjs       vision cho ảnh (đọc câu hỏi chữ đã chuyển sang POST /answer của API, kế hoạch 08)
 *   answer.mjs       tạo câu trả lời (số liệu luôn từ DB)
 *   format.mjs       dựng câu trả lời (Line[]) từ dữ liệu API; lời văn LLM chỉ qua cổng sanitizeLead
 *   render.mjs       Line[] → tin Zalo có styles, tách tin ~1.800 ký tự
 *
 * Env: API_URL, ZALO_SESSION_PATH, ALLOWED_THREADS, ZALO_USER_AGENT, CLAUDE_CODE_OAUTH_TOKEN.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LoginQRCallbackEventType, ThreadType, Zalo } from 'zca-js';

import { answerByHs, answerImage, codeOffer, handleConfirm, handleCorrection } from './answer.mjs';
import { ackIngestReports, answer, confirmations, ingestReports, legalProvision, lookupFull, requestIngest, verifyDocument } from './api.mjs';
import { loadContext, nextState, saveContext, stampTariff } from './conversation.mjs';
import { fastPath, fold, guardIntent, isBareLookup, isOkay, parseVerifyDocCommand, plainVerdict, readsAsQuestion, unlikeTariffReply } from './dispatch.mjs';
import { extractImage } from './images.mjs';
import { CAPABILITIES, formatAnswerMd, formatGeneral, formatIngestQueued, formatIngestReport, formatMissingDoc, formatProvisions, sanitizeLead } from './format.mjs';
import { missingKind, parseQuery, stripMentions, todayVN } from './parse.mjs';
import { L, render, toText } from './render.mjs';

const API = process.env.API_URL || 'http://api:3000';
const SESSION = process.env.ZALO_SESSION_PATH || '/session/zalo-session.json';
const ALLOWED = (process.env.ALLOWED_THREADS || '').split(',').map((s) => s.trim()).filter(Boolean);
const USER_AGENT =
  process.env.ZALO_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// --- Session persistence ----------------------------------------------------
// A plain part goes out as { msg } only: zca-js sends textProperties for any `styles`, even [], and an
// empty list has never been tried against Zalo, while { msg } is what plain replies always sent.
const wire = (p) => (p.styles.length ? p : { msg: p.msg });

const loadSession = () => (existsSync(SESSION) ? JSON.parse(readFileSync(SESSION, 'utf8')) : null);
const saveSession = (data) => {
  mkdirSync(dirname(SESSION), { recursive: true });
  writeFileSync(SESSION, JSON.stringify(data));
};

function onQrEvent(ev) {
  if (ev.type === LoginQRCallbackEventType.QRCodeGenerated) {
    // QR đăng nhập THẬT do Zalo tạo nằm ở ev.data.image (ghi ra /session/qr.png).
    // KHÔNG vẽ QR từ ev.data.code — đó chỉ là mã polling nội bộ, Zalo đọc ra text.
    try {
      const b64 = String(ev.data.image || '').replace(/^data:image\/\w+;base64,/, '');
      if (b64) {
        mkdirSync('/session', { recursive: true });
        writeFileSync('/session/qr.png', Buffer.from(b64, 'base64'));
      }
    } catch {
      /* ignore */
    }
    console.log('[zalo] QR MỚI tại /session/qr.png (mã sống ~90s). Mở ẢNH này và quét bằng app Zalo — ĐỪNG quét QR trong terminal.');
  } else if (ev.type === LoginQRCallbackEventType.QRCodeScanned) {
    console.log('[zalo] đã quét — xác nhận trên điện thoại…');
  } else if (ev.type === LoginQRCallbackEventType.GotLoginInfo) {
    saveSession({ imei: ev.data.imei, cookie: ev.data.cookie, userAgent: ev.data.userAgent });
    console.log('[zalo] đã lưu session — lần restart sau không cần QR nữa');
  }
}

async function connect() {
  const zalo = new Zalo();
  const saved = loadSession();
  if (saved) {
    try {
      const api = await zalo.login(saved);
      console.log('[zalo] khôi phục session sẵn có — không cần quét QR');
      return api;
    } catch (e) {
      console.warn('[zalo] session cũ hỏng/hết hạn:', e?.message, '— chuyển sang QR');
    }
  }
  // Lặp: mỗi khi QR hết hạn mà chưa quét, tạo mã mới — process không chết, chờ bạn quét.
  for (let attempt = 1; ; attempt++) {
    console.log(`\n[zalo] ĐĂNG NHẬP QR (lần ${attempt}) — mở Zalo của TÀI KHOẢN BOT, quét mã dưới đây:\n`);
    try {
      return await zalo.loginQR({ userAgent: USER_AGENT, qrPath: '/session/qr.png' }, onQrEvent);
    } catch (e) {
      console.warn('[zalo] QR chưa được quét/đã hết hạn — tạo mã mới…', e?.message || '');
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

/** Plan 08 §2.3: a reply is due 120 s after the message arrived; the API holds its steps to `deadlineAt`. */
const ANSWER_BUDGET_MS = 120_000;
const NOT_READ = 'Mình chưa đọc được câu hỏi lúc này, bạn thử lại sau ít phút nhé.';
const NOT_COMPOSED = 'Mình chưa soạn được câu trả lời lúc này, bạn thử lại sau ít phút nhé.';
const NEEDS_GOODS = 'Để xem mã bạn nêu có hợp không, mình cần biết hàng là gì: bạn mô tả giúp mình chất liệu, công dụng và cách trình bày của hàng nhé.';
const NEEDS_CODE = 'Bạn nhắn giúp mình mã HS 8 số của hàng (kèm xuất xứ) để mình tra thuế, hoặc mô tả hàng để mình tìm mã nhé.';
const TOO_LONG = 'Tin dài quá để mình đọc một lượt: bạn tóm tắt giúp mình câu hỏi và mô tả chính của hàng, dưới 2.000 ký tự nhé.';
const AGREED = 'Dạ, bạn cần gì thêm cứ nhắn mình nhé.';
const UNCLEAR = 'Mình chưa hiểu ý bạn, bạn nói rõ thêm giúp mình nhé.';
const NO_SOURCE = 'Mình chưa tìm thấy căn cứ đủ để trả lời câu này trong các văn bản và chú giải mình đang có, nên chưa trả lời để tránh sai.';
const LEGAL_MODES = ['legal', 'status', 'mixed'];
/** Owner decision Q1 takes about 40 s of prose above a rate; past this the block goes out alone and the API stops too. */
const PROSE_BUDGET_MS = 45_000;

/**
 * Plan text as memory may keep it (R4): masked by the API, its [mã n] labels dropped, and a run the API mask missed dropped too:
 * 6 to 10 joined digits ("mã hs 848180", a 9-digit typo) or 4-2-2 joined by dashes ("8481-80-99", not an ISO date). A year or a
 * document number is shorter or carries a slash.
 * ponytail: a 6- to 10-digit amount or phone number goes as well; the real fix is the API mask.
 */
const noCodes = (s) =>
  String(s ?? '')
    .replace(/\[mã \d+\]|(?<![\d/.-])(?:\d{6,10}|(?!(?:19|20)\d{2}-[01]\d-[0-3]\d(?![\d-]))\d{4}-\d{2}-\d{2}(?:-\d{2})?)(?![\d/-])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const asked = (plan) => noCodes(plan.question);

/**
 * Answer for a document we do not hold, carrying whatever the gazette catalogue knows.
 * `pendingIngest` is what lets the next turn act on "nạp" — the offer and the thing
 * being offered have to survive between messages, which is what conversation memory is for.
 */
function missingDocAnswer(query, label, apiAnswer, asOf) {
  // A catalogue hit equal to the number asked for IS that document: offer it, never list it as another one.
  const { kind, matches } = missingKind(label, apiAnswer?.gazetteMatches ?? [], apiAnswer?.gazetteMatchKind ?? 'none');
  // Only an EXACT catalogue hit may be offered for ingest. A near-miss by number is a
  // different document, and an ambiguous year is a question for the user — fetching
  // either would answer something nobody asked.
  const hit = kind === 'exact' ? (matches[0] ?? null) : null;
  return {
    text: formatMissingDoc(label, matches, kind),
    topic: 'legal',
    legal: {
      query,
      asOf: asOf ?? null,
      missingDoc: label,
      pendingIngest: hit ? { number: hit.number, title: hit.title, sourceUrl: hit.sourceUrl } : null,
    },
  };
}

/** What the next plan may point at after a legal answer (plan 08 §6.1). */
const legalMemory = (plan, cites, asOf) => ({
  question: asked(plan),
  asOf: asOf ?? plan.date ?? null,
  // provisionLabel: a bridge until the API's plan step reads `label` (row 19); drop it then.
  citations: cites.slice(0, 5).map(({ label, kind, instrument, documentNumber }) => ({ label, provisionLabel: label, kind, instrument, documentNumber })),
  missingDoc: null,
  pendingIngest: null,
});

/**
 * A rate lookup with a few sentences of prose above its block (owner decision Q1). Both run at once; the block goes out
 * alone, as before, when /answer has no prose or the lookup itself failed — prose about a rate that was not found misleads.
 * The plan the bot builds carries no code and no user text (R4): the API takes the question from `q` and masks it itself.
 * `plan`: more plan fields, `reuseLastHs` for "còn từ Nhật thì sao", whose code the API reads from the context's state.
 */
async function rateWithProse(q, body, showFooter, plan = {}) {
  const [byHs, res] = await Promise.all([
    answerByHs(q, { showFooter }),
    answer(
      { ...body, deadlineAt: new Date(Date.now() + PROSE_BUDGET_MS).toISOString(), plan: { intent: 'tariff', ...plan, origin: q.origin, date: q.date }, forceIntent: 'tariff' },
      PROSE_BUDGET_MS + 5_000,
    ),
  ]);
  if (!res?.answerMd?.trim() || !byHs.tariff) return byHs;
  // One formatAnswerMd call: the block's [n] continue after the prose sources, and its scope warning stays with the rates (R10).
  const lookup = { q, tariff: byHs.tariff.snapshot, confirm: byHs.confirm };
  return { ...byHs, text: formatAnswerMd({ ...res, mode: 'tariff' }, { tariffLines: [lookup], showFooter }) };
}

/**
 * Quyết định nhánh rồi tạo câu trả lời (kế hoạch 08 §2.1).
 *
 * `text` = câu hỏi MỚI (regex HS chỉ soi cái này). Tin được reply chỉ đi vào bước kế hoạch của API, KHÔNG vào regex — câu
 * trả lời cũ của bot luôn chứa mã HS, nên nếu cho regex soi cả ngữ cảnh thì một câu hỏi pháp luật reply vào tin có
 * "8481.10.11" sẽ bị bắt nhầm thành tra thuế.
 */
export async function respond({ text, image, quote, ctx, senderName, threadId, userId, notify, lastReplyElsewhere = false }) {
  const quoteText = String(quote?.msg || '');
  const quoted = quoteText || null;
  const deadlineAt = new Date(Date.now() + ANSWER_BUDGET_MS).toISOString();

  // 0. "xác nhận văn bản <số hiệu>" — người đọc đứng ra bảo đảm cho một văn bản bot tự
  // nạp. Ghi kèm TÊN người xác nhận, giống hệt sổ verify-on-use của mã HS.
  const verifyDoc = parseVerifyDocCommand(text);
  if (verifyDoc) {
    const res = await verifyDocument(verifyDoc, senderName);
    return {
      text: res?.verified
        ? [L(['Đã ghi nhận ', [verifyDoc, 'b'], ` là đã đối chiếu (theo ${senderName}). Từ giờ trích dẫn từ văn bản này không còn cảnh báo nữa.`])]
        : [L(['Mình không tìm thấy ', [verifyDoc, 'b'], ' ở trạng thái "bot tự nạp" để xác nhận — có thể nó đã được xác nhận rồi, hoặc chưa có trong kho.'])],
      topic: 'legal',
      intent: 'legal',
    };
  }

  // 1. Đường tắt không cần LLM — nhưng CHỈ khi chủ đề đang bàn cho phép.
  const pending = ctx.legal?.pendingIngest ?? null;
  const fast = fastPath({
    text,
    hasImage: Boolean(image),
    quoteText,
    topic: ctx.topic,
    tariffFresh: ctx.tariffFresh,
    candidatesFresh: ctx.candidatesFresh,
    table: ctx.state?.tariff ?? null,
    pendingIngest: Boolean(pending),
    lastReplyElsewhere,
  });
  if (fast?.action === 'ingest') {
    const q = await requestIngest({ number: pending.number, requestedBy: senderName, threadId, userId });
    return {
      text: q
        ? formatIngestQueued(pending.number, Boolean(q.alreadyQueued))
        : [L(['Mình chưa xếp hàng nạp được ', [pending.number, 'b'], ', thử lại sau nhé.'])],
      topic: 'legal',
      // The offer has been taken up; leave it open and a later "ok" would queue it twice.
      legal: { ...ctx.legal, pendingIngest: null },
      intent: 'legal',
    };
  }
  if (fast?.action === 'greeting') return { text: CAPABILITIES, topic: 'general', intent: 'general' };
  if (fast?.action === 'confirm') return { ...(await handleConfirm(ctx.tariff, fast.verdict, senderName)), intent: 'confirm' };
  if (fast?.action === 'correction') return { ...(await handleCorrection(ctx.tariff, text, senderName, quote)), intent: 'correction' };
  // Phán quyết trên ảnh (trả lời ảnh, hay chú thích ảnh mới): lời mời nêu kết quả đang nhớ, không ghi, không chạy lại vision (R13).
  if (fast?.action === 'offer') return { ...(await codeOffer(ctx.tariff, null)), intent: 'confirm' };

  // 2. Ảnh: vision nhận diện mặt hàng rồi đi tiếp đường tra thuế tất định.
  if (image) return { ...(await answerImage(image.imageUrls, text)), intent: 'tariff' };

  // 3. Chỉ có mã + xuất xứ + từ tra thuế: tra thẳng, kèm vài câu giải thích soạn song song (Q1), không ack. Câu có nội
  // dung khác ("e tham khảo mã 30051010 không biết được không ạ") hỏi mã có hợp với hàng không: để bước kế hoạch đọc (R4).
  // Lời mời "đúng/sai" ở lượt tra thật đầu tiên (D3b): chưa có kết quả tra nào đang chờ, kể cả ngay sau câu ứng viên.
  const direct = parseQuery(text);
  if (direct && isBareLookup(text)) {
    return { ...(await rateWithProse(direct, { q: text, quote: quoted, deadlineAt }, !ctx.tariffFresh)), intent: 'tariff' };
  }
  // "ok" ở đâu cũng là "đã xem"; "đúng", "chuẩn rồi" sau bất cứ gì không phải kết quả tra thuế là đồng ý: không có gì để ghi, không
  // soạn lại câu cũ.
  const verdictWord = plainVerdict(text);
  if (isOkay(text) || (verdictWord === 'correct' && ctx.topic !== 'tariff')) return { text: AGREED, intent: 'general' };
  // Trên kết quả tra còn mới, từ phán quyết mà sổ không ghi ("chuẩn rồi", "chưa chắc", hay "đúng" khi bàn đã đóng): lời mời nêu mã
  // vừa tra và đúng lệnh cần gửi, không ghi (R13). Chỉ khi không quote: quote một lượt tra cũ hay một câu soạn thì từ đó trả lời tin
  // được quote, không phải mã đang nhớ.
  if (verdictWord && !quoteText && ctx.topic === 'tariff' && ctx.tariffFresh) return { ...(await codeOffer(ctx.tariff, null)), intent: 'confirm' };
  // POST /answer từ chối câu quá 2.000 ký tự: "thử lại sau" không bao giờ giúp được.
  if (text.length > 2000) return { text: TOO_LONG, intent: 'general' };

  // 4. Bước kế hoạch trên API: đọc cả hội thoại với mã đã che (R4). Không đọc được thì nói thật — không đoán bằng tra mã.
  const base = { q: text, quote: quoted, context: { topic: ctx.topic, state: ctx.state, turns: ctx.turns }, deadlineAt };
  const res = await answer({ ...base, planOnly: true });
  const plan = res?.plan;
  if (!plan) return { text: NOT_READ, intent: 'general' };

  // 5. Nhánh tất định. Refine chạy lại chế độ API đã đọc từ câu soạn trước (res.mode, API tự đổi nên không forceIntent);
  // mọi kế hoạch khác qua rào chủ đề.
  const guarded = guardIntent(plan.intent, { topic: ctx.topic, tariffFresh: ctx.tariffFresh, candidatesFresh: ctx.candidatesFresh, quoteText });
  const refined = plan.intent === 'refine' && Boolean(ctx.state?.answer?.mode && res.mode);
  let intent = refined ? res.mode : guarded;
  // "Mã này sai không ạ?" nghi một mã, không phán quyết: đó là câu hỏi phân loại, không bao giờ ghi sổ (R13). Câu hỏi không
  // nêu mã, ngoài kết quả tra thuế, giữ cách đọc theo chủ đề ("vậy là điều 9 đó mình hiểu sai à?" vẫn là pháp luật).
  const verdictPlan = plan.intent === 'confirm' || plan.intent === 'correction';
  if (verdictPlan && readsAsQuestion(text) && (direct || res.codeRole === 'premise' || intent === 'confirm' || intent === 'correction')) intent = 'hs';
  // Sau ứng viên, phản đối không kèm mã là đọc lại hàng (hàng 22); kèm mã thì ra lời mời (hàng 10).
  if (intent === 'correction' && ctx.candidatesFresh && !direct) intent = 'hs';
  // Mã người dùng đang nghi không bao giờ được tra thuế (hàng 13): khối MFN đã trả lời một câu hỏi hợp mã ngày 14/09/2026.
  if (intent === 'tariff' && res.codeRole === 'premise') intent = 'hs';
  // The mode the API composes: its own reading (a premise turns legal/status/mixed into hs) while the plan goes unchanged;
  // an intent the bot forces is read again there, so the bot's own.
  const modeOf = (i) => (i === plan.intent || refined ? (res.mode ?? i) : i);

  // Văn bản kho không có chỉ chặn câu trả lời pháp luật, không chặn tra thuế hay phân loại.
  if (res.missingDoc && (LEGAL_MODES.includes(modeOf(intent)) || plan.scope?.doc)) {
    return { ...missingDocAnswer(asked(plan), res.missingDoc, res, res.asOf ?? plan.date), intent: 'legal' };
  }
  // No usable reply ("đúng" after the lookup expired, a refine with nothing to refine): one short line, never the capabilities.
  if (intent === 'general') return { text: formatGeneral(plan.reply, verdictWord ? AGREED : UNCLEAR), topic: 'general', intent };
  // Phán quyết không có cue tường minh ("63079090 mới đúng"): một lời mời, không ghi sổ. Cue tường minh đã đi bước 1 (§6.3).
  if (intent === 'confirm' || intent === 'correction') return { ...(await codeOffer(ctx.tariff, direct)), intent };
  if (intent === 'tariff') {
    if (direct) {
      const q = { ...direct, origin: direct.origin ?? plan.origin ?? null, date: plan.date || direct.date };
      return { ...(await rateWithProse(q, base, !ctx.tariffFresh)), intent };
    }
    // "còn từ Nhật thì sao": cùng mã vừa tra, xuất xứ khác. Cùng đường văn xuôi + khối như tra trần (Q1): API lấy mã trong
    // state.tariff của context làm khoá, khối thuế tra bằng mã đó với xuất xứ mới; /answer không trả lời thì khối đi một mình.
    if (plan.reuseLastHs && ctx.tariff?.hs) {
      const q = { hs: ctx.tariff.hs, dotted: ctx.tariff.dotted, origin: plan.origin ?? ctx.tariff.origin ?? null, date: plan.date || todayVN() };
      return { ...(await rateWithProse(q, base, false, { reuseLastHs: true })), intent };
    }
    // Không có mã để tra. Có tên hàng thì câu hỏi trước hết là mã nào: soạn hs (§7 giữ tra từ khoá cho ảnh). Không tên hàng,
    // hoặc hỏi tiếp khi không còn mã nào trên bàn: hỏi mã — tra từ khoá trên chính tin nhắn giữ lại chữ số người dùng (R4).
    if (plan.reuseLastHs || !(plan.keywords?.length || plan.hsHints?.length)) return { text: NEEDS_CODE, intent };
    intent = 'hs';
  }
  // Hàng 19: xin nguyên văn một Điều là tra theo trích dẫn, không soạn.
  const doc = plan.scope?.doc ?? ctx.legal?.citations?.find((c) => c.documentNumber)?.documentNumber;
  if (plan.scope?.article && doc && /nguyen van|toan van/.test(fold(text))) {
    const rows = await legalProvision(doc, plan.scope.article, plan.scope.clause);
    if (rows?.length) {
      const cites = rows.map((p) => ({ label: p.citationLabel, kind: null, instrument: p.documentNumber, documentNumber: p.documentNumber }));
      return { text: formatProvisions(rows), topic: 'legal', legal: legalMemory(plan, cites), intent: 'legal' };
    }
  }
  const planned = modeOf(intent);
  // Hàng 14: nghi một mã mà luồng chưa có mô tả hàng — hỏi mô tả, không đọc gì, không ghi gì.
  if (planned === 'hs' && res.codeRole === 'premise' && !plan.goods?.facts?.length && !ctx.candidatesFresh) return { text: NEEDS_GOODS, intent };

  // 6. Sắp soạn: báo đã hiểu câu hỏi, đúng một lần.
  // Model text: quoted later, it must not read as the tariff lead or a verdict reply (§6.3).
  const ack = unlikeTariffReply(sanitizeLead(res.ack, text)).replace(/[.!?…\s]+$/u, '');
  const clause = planned === 'hs' ? 'mình đọc chú giải các nhóm liên quan rồi trả lời, khoảng một phút nhé.' : 'mình tra văn bản rồi trả lời nhé.';
  await notify?.(ack ? `${ack} — ${clause}` : clause[0].toUpperCase() + clause.slice(1));

  // 7. Soạn trên đúng kế hoạch vừa đọc (không gọi kế hoạch lần hai); guard đổi intent thì nói rõ bằng forceIntent.
  const composed = await answer({ ...base, plan, forceIntent: intent === plan.intent || refined ? undefined : intent });
  if (!composed) return { text: NOT_COMPOSED, intent };
  // Compose scopes the documents again and may find the named one missing, with no prose: the same reply and ingest offer.
  if (composed.missingDoc) return { ...missingDocAnswer(asked(plan), composed.missingDoc, composed, composed.asOf ?? plan.date), intent: 'legal' };

  // 8. Trình bày. Mixed: khối thuế của mã 8 số trong tin, số liệu từ /tariff (khối API đã tra khi cùng xuất xứ và ngày).
  const mode = composed.mode ?? planned;
  let tariffLines = [];
  if (mode === 'mixed' && direct) {
    const q = { dotted: direct.dotted, origin: direct.origin ?? plan.origin ?? null, date: plan.date || direct.date };
    const got = composed.tariff;
    const tariff = got && (got.origin ?? null) === q.origin && got.date === q.date ? got : await lookupFull(q.dotted, q.origin, q.date);
    if (tariff) tariffLines = [{ q, tariff, confirm: await confirmations(direct.hs, q.origin) }];
  }
  const lines = formatAnswerMd(composed, { tariffLines });
  // No call ran and nothing came back: retrieval found no source, and "thử lại sau" would never help. A line the code writes (a
  // user code missing from the catalogue) still prints above the honest sentence.
  // ponytail: calls 0 is also the API failing closed (deadline, dropped prompt part); an API `reason` field tells them apart.
  if (!composed.answerMd?.trim() && !composed.citations?.length && composed.calls === 0) {
    const hint = mode === 'hs' ? 'Bạn mô tả thêm chất liệu, công dụng, cách trình bày của hàng để mình tìm lại nhé.' : 'Nếu bạn biết số hiệu văn bản, nhắn số hiệu để mình tìm trên Công báo và nạp về.';
    return { text: [...lines, L([`${NO_SOURCE} ${hint}`])], intent };
  }
  if (!toText(lines).trim()) return { text: NOT_COMPOSED, intent };

  // Bộ nhớ (§6.1): không mã người dùng nào vào state; ứng viên hs không phải kết quả tra, nên "đúng" không ghi gì.
  const facts = (plan.goods?.facts ?? []).map(noCodes).filter(Boolean);
  const candidates = (composed.candidates ?? []).map((c) => c.hs);
  const keywords = (plan.keywords ?? []).map(noCodes).filter(Boolean);
  const memory =
    mode === 'hs'
      ? { topic: 'tariff', tariff: candidates.length ? stampTariff({ hs: null, candidates, desc: facts.join(', '), keywords }) : null }
      : { topic: 'legal', legal: legalMemory(plan, composed.citations ?? [], composed.asOf) };
  return { text: lines, ...memory, answer: { mode, question: asked(plan), goods: { facts }, at: new Date().toISOString() }, intent };
}

// --- Main -------------------------------------------------------------------

/** The user each thread's last bot message answered. In memory: a restart forgets, and forgetting only closes the no-quote path. */
const lastAnswered = new Map();
/**
 * Tables whose ruling was written while its memory save failed: memory still shows them open and unruled, so a second ruling would
 * be written and the offer would say "chưa ghi nhận gì" (round 6). In memory: a restart forgets, as it forgets lastAnswered.
 */
const ruledTables = new Set();
const tableKey = (threadId, userId, t) => `${threadId}:${userId}:${t.hs ?? t.candidates}:${t.origin}:${t.date}`;
const queues = new Map();

/** Run `task` once the task queued before it under `key` has settled. */
export function inTurn(key, task) {
  const run = (queues.get(key) ?? Promise.resolve()).then(task);
  const settled = run.catch(() => {});
  queues.set(key, settled);
  settled.then(() => queues.get(key) === settled && queues.delete(key));
  return run;
}

/**
 * The Zalo message listener. A user's messages in a thread are handled one after another: a compose sends its notice about a
 * minute before its reply and memory is saved only after the reply, so a "đúng rồi" answering the notice was read against the
 * lookup two messages up and written (R13). Queued, it is read once the composed reply is saved. Every message sent records whom
 * it answered: in a group the bot's last message may answer a colleague, and a ruling with no quote answers that message.
 */
export function messageHandler(api, myId = '') {
  const handle = async (msg) => {
    try {
      if (msg.isSelf) return;
      if (ALLOWED.length && !ALLOWED.includes(msg.threadId)) return;

      const rawContent = msg.data?.content;
      const image = extractImage(msg); // { imageUrls } khi tin LÀ ảnh hoặc REPLY vào ảnh
      // Chữ/caption: content chuỗi, hoặc caption của ảnh (content.title).
      let text =
        typeof rawContent === 'string'
          ? rawContent
          : rawContent && typeof rawContent === 'object'
            ? String(rawContent.title || '')
            : '';
      if (process.env.BOT_DEBUG && rawContent && typeof rawContent === 'object' && !image) {
        // Chỉ log HÌNH DẠNG (keys + msgType), không log giá trị (URL/token) ra container log.
        console.warn('[zalo] object content chưa nhận là ảnh — msgType:', msg.data?.msgType, 'keys:', Object.keys(rawContent));
      }

      // Trong NHÓM: chỉ trả lời khi bot được @tag; bỏ đoạn @tag khỏi caption/chữ.
      if (msg.type === ThreadType.Group) {
        const mentions = msg.data?.mentions || [];
        const tagged = myId && mentions.some((m) => String(m.uid) === myId);
        if (!tagged) return;
        text = stripMentions(text, mentions);
      }
      // Không có ảnh lẫn chữ → bỏ qua (sticker, video, file… ngoài phạm vi).
      if (!image && !text.trim()) return;

      const userId = String(msg.data?.uidFrom || '');
      const senderName = (msg.data?.dName || '').trim() || 'bạn';
      const ctx = await loadContext(msg.threadId, userId);
      // Closed here as memory would have closed it (table.ruled): fastPath takes no ruling on it and codeOffer says it is recorded.
      if (ctx.state.tariff && ruledTables.has(tableKey(msg.threadId, userId, ctx.state.tariff))) {
        ctx.state.tariff = { ...ctx.state.tariff, ruled: true };
        if (ctx.tariff) ctx.tariff = ctx.state.tariff;
      }
      const lastReplyElsewhere = lastAnswered.get(msg.threadId) !== userId;
      const send = (content) => {
        lastAnswered.set(msg.threadId, userId);
        return api.sendMessage(content, msg.threadId, msg.type);
      };

      // Vision mất ~15-30s: báo ngay để người dùng không tưởng bot treo.
      if (image) {
        await send({ ...wire(render('Mình đang xem ảnh, bạn chờ khoảng 20 giây nhé.')[0]), quote: msg.data }).catch(() => {});
      }

      // A long answer path (code check) says it is working, as the image path does.
      const notify = (t) => send({ ...wire(render(t)[0]), quote: msg.data }).catch(() => {});
      const result = await respond({ text, image, quote: msg.data?.quote, ctx, senderName, threadId: msg.threadId, userId, notify, lastReplyElsewhere });
      if (process.env.BOT_DEBUG) {
        console.log(`[zalo] topic=${ctx.topic ?? '-'} tariffFresh=${ctx.tariffFresh} → intent=${result.intent}`);
      }
      // Only the first part quotes the question. Memory is saved right after it, so a later part
      // failing never costs the "đúng"/"sai" that follows (tariffFresh).
      const parts = render(result.text);
      await send({ ...wire(parts[0]), quote: msg.data });

      // Ghi nhớ SAU khi đã trả lời — lỗi lưu trí nhớ không được làm mất câu trả lời.
      // `tariff`/`legal`/`answer` vắng mặt = giữ nguyên phần trí nhớ đó; null = xoá (không còn gì để trỏ tới).
      const state = nextState(ctx.state, result);
      const saved = await saveContext({
        threadId: msg.threadId,
        userId,
        staffName: senderName,
        userText: text || '(ảnh)',
        botText: parts.map((p) => p.msg).join('\n\n'),
        intent: result.intent,
        topic: result.topic ?? ctx.topic ?? null,
        state,
      });
      for (const p of parts.slice(1)) {
        // Part 1 is delivered and remembered: a later failure only logs, never sends the generic error.
        await send(wire(p)).catch((e) => console.warn('[zalo] send part failed:', e?.message));
      }
      // A reply memory did not keep, whatever it was: memory still shows the table before it, open, which is not the reply on screen
      // (R13, rounds 6, 8). A verdict that wrote a row leaves that table unruled in memory: it returns `ruled`, or `tariff: null`
      // after "mã này sai" or a half-written correction.
      if (!saved) {
        lastAnswered.delete(msg.threadId);
        const verdict = result.intent === 'confirm' || result.intent === 'correction';
        if (verdict && (result.tariff === null || result.tariff?.ruled) && ctx.state.tariff) ruledTables.add(tableKey(msg.threadId, userId, ctx.state.tariff));
      }
    } catch (e) {
      console.error('[zalo] lỗi xử lý tin:', e?.message);
      lastAnswered.delete(msg.threadId);
      try {
        await api.sendMessage(wire(render('Xin lỗi, có lỗi khi tra cứu. Thử lại sau.')[0]), msg.threadId, msg.type);
      } catch {
        /* ignore */
      }
    }
  };
  return (msg) => inTurn(`${msg.threadId}:${msg.data?.uidFrom ?? ''}`, () => handle(msg));
}

async function main() {
  const api = await connect();
  let myId = '';
  try {
    const own = await api.getOwnId();
    myId = String(own?.uid ?? own ?? '');
  } catch {
    /* không lấy được uid → group vẫn lọc theo tên d/dName không có; sẽ yêu cầu tag */
  }
  console.log(`[zalo] đăng nhập OK${myId ? ` (id ${myId})` : ''}. API=${API}. Group: chỉ trả lời khi được @tag. Allowlist=${ALLOWED.length ? ALLOWED.join(',') : '(mở)'}`);

  api.listener.on('message', messageHandler(api, myId));

  // Ingest takes minutes, long past the message that asked for it, so the outcome comes
  // home on its own. Acknowledge only AFTER the message is sent: re-reporting once is a
  // far smaller failure than promising to follow up and going silent.
  setInterval(async () => {
    try {
      const reports = await ingestReports();
      const delivered = [];
      for (const r of reports) {
        if (!r.threadId) { delivered.push(r.id); continue; }
        lastAnswered.delete(r.threadId); // a report answers nobody's ruling
        // The queue row does not record whether the thread was a group or a 1-1 chat,
        // so try both rather than adding a column for it — a wrong ThreadType is the
        // only way this send fails, and one retry costs nothing.
        let sent = false;
        for (const type of [ThreadType.Group, ThreadType.User]) {
          try {
            for (const p of render(formatIngestReport(r))) await api.sendMessage(wire(p), r.threadId, type);
            sent = true;
            break;
          } catch {
            /* try the other thread type */
          }
        }
        if (sent) delivered.push(r.id);
        else console.warn(`[zalo] không gửi được báo cáo nạp #${r.id}`);
      }
      if (delivered.length) await ackIngestReports(delivered);
    } catch (e) {
      console.warn('[zalo] lỗi vòng báo cáo nạp:', e?.message);
    }
  }, 30_000).unref?.();

  api.listener.on('error', (e) => console.error('[zalo] listener error:', e?.message));
  api.listener.start();
  console.log('[zalo] đang lắng nghe tin nhắn…');
}

// Start only as the entry point: dry-run.mjs imports respond() without logging in to Zalo.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error('[zalo] khởi động thất bại:', e);
    process.exit(1);
  });
}
