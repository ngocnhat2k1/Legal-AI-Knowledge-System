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

import { answerByHs, answerImage, codeOffer, handleConfirm, handleCorrection, missingDocAnswer } from './answer.mjs';
import { ackIngestReports, answer, confirmations, ingestReports, legalProvision, lookupFull, requestIngest, verifyDocument } from './api.mjs';
import { loadContext, nextState, saveContext, stampTariff } from './conversation.mjs';
import { confirmVerdict, fastPath, fold, guardIntent, isBareLookup, parseVerifyDocCommand, readsAsQuestion } from './dispatch.mjs';
import { extractImage } from './images.mjs';
import { CAPABILITIES, formatAnswerMd, formatGeneral, formatIngestQueued, formatIngestReport, formatProvisions, sanitizeLead } from './format.mjs';
import { parseQuery, stripMentions, todayVN } from './parse.mjs';
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
const NO_SOURCE = 'Mình chưa tìm thấy căn cứ đủ để trả lời câu này trong các văn bản và chú giải mình đang có, nên chưa trả lời để tránh sai.';
const LEGAL_MODES = ['legal', 'status', 'mixed'];
/** Owner decision Q1 takes about 40 s of prose above a rate; past this the block goes out alone and the API stops too. */
const PROSE_BUDGET_MS = 45_000;

/** A plan's question as memory may keep it: masked by the API, its [mã n] labels dropped too (R4). */
const asked = (plan) => String(plan.question ?? '').replace(/\[mã \d+\]/g, ' ').replace(/\s+/g, ' ').trim();

/** What the next plan may point at after a legal answer (plan 08 §6.1). */
const legalMemory = (plan, cites, asOf) => ({
  question: asked(plan),
  asOf: asOf ?? plan.date ?? null,
  citations: cites.slice(0, 5).map(({ label, kind, instrument, documentNumber }) => ({ label, kind, instrument, documentNumber })),
  missingDoc: null,
  pendingIngest: null,
});

/**
 * A rate lookup with a few sentences of prose above its block (owner decision Q1). Both run at once; the block goes out
 * alone, as before, when /answer has no prose or the lookup itself failed — prose about a rate that was not found misleads.
 * The plan the bot builds carries no code and no user text (R4): the API takes the question from `q` and masks it itself.
 */
async function rateWithProse(q, body, showFooter) {
  const [byHs, res] = await Promise.all([
    answerByHs(q, { showFooter }),
    answer(
      { ...body, deadlineAt: new Date(Date.now() + PROSE_BUDGET_MS).toISOString(), plan: { intent: 'tariff', origin: q.origin, date: q.date }, forceIntent: 'tariff' },
      PROSE_BUDGET_MS + 5_000,
    ),
  ]);
  return res?.answerMd?.trim() && byHs.tariff ? { ...byHs, text: [...formatAnswerMd({ ...res, mode: 'tariff' }), L([]), ...byHs.text] } : byHs;
}

/**
 * Quyết định nhánh rồi tạo câu trả lời (kế hoạch 08 §2.1).
 *
 * `text` = câu hỏi MỚI (regex HS chỉ soi cái này). Tin được reply chỉ đi vào bước kế hoạch của API, KHÔNG vào regex — câu
 * trả lời cũ của bot luôn chứa mã HS, nên nếu cho regex soi cả ngữ cảnh thì một câu hỏi pháp luật reply vào tin có
 * "8481.10.11" sẽ bị bắt nhầm thành tra thuế.
 */
export async function respond({ text, image, quote, ctx, senderName, threadId, userId, notify }) {
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
    pendingIngest: Boolean(pending),
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

  // 2. Ảnh: vision nhận diện mặt hàng rồi đi tiếp đường tra thuế tất định.
  if (image) return { ...(await answerImage(image.imageUrls, text)), intent: 'tariff' };

  // 3. Chỉ có mã + xuất xứ + từ tra thuế: tra thẳng, kèm vài câu giải thích soạn song song (Q1), không ack. Câu có nội
  // dung khác ("e tham khảo mã 30051010 không biết được không ạ") hỏi mã có hợp với hàng không: để bước kế hoạch đọc (R4).
  // Lời mời "đúng/sai" ở lượt tra thật đầu tiên (D3b): chưa có kết quả tra nào đang chờ, kể cả ngay sau câu ứng viên.
  const direct = parseQuery(text);
  if (direct && isBareLookup(text)) {
    return { ...(await rateWithProse(direct, { q: text, quote: quoted, deadlineAt }, !ctx.tariffFresh)), intent: 'tariff' };
  }
  // "đúng", "ok" sau bất cứ gì không phải kết quả tra thuế là đồng ý: không có gì để ghi, không soạn lại câu cũ.
  if (confirmVerdict(text) === 'correct' && ctx.topic !== 'tariff') return { text: AGREED, intent: 'general' };
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
  if (intent === 'general') return { text: formatGeneral(plan.reply), topic: 'general', intent };
  // Phán quyết không có cue tường minh ("63079090 mới đúng"): một lời mời, không ghi sổ. Cue tường minh đã đi bước 1 (§6.3).
  if (intent === 'confirm' || intent === 'correction') return { ...(await codeOffer(ctx.tariff, direct)), intent };
  if (intent === 'tariff') {
    if (direct) {
      const q = { ...direct, origin: direct.origin ?? plan.origin ?? null, date: plan.date || direct.date };
      return { ...(await rateWithProse(q, base, !ctx.tariffFresh)), intent };
    }
    // "còn từ Nhật thì sao": cùng mã vừa tra, xuất xứ khác. Chỉ khối thuế: API không đọc mã từ state nên không có văn xuôi.
    if (plan.reuseLastHs && ctx.tariff?.hs) {
      const q = { hs: ctx.tariff.hs, dotted: ctx.tariff.dotted, origin: plan.origin ?? ctx.tariff.origin ?? null, date: plan.date || todayVN() };
      return { ...(await answerByHs(q, { showFooter: false })), intent };
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
  const ack = sanitizeLead(res.ack, text).replace(/[.!?…\s]+$/u, '');
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
  if (!toText(lines).trim()) {
    // No call ran: retrieval found no source, and "thử lại sau" would never help.
    // ponytail: calls 0 is also the API failing closed (deadline, dropped prompt part); an API `reason` field tells them apart.
    if (composed.calls !== 0) return { text: NOT_COMPOSED, intent };
    const hint = mode === 'hs' ? 'Bạn mô tả thêm chất liệu, công dụng, cách trình bày của hàng để mình tìm lại nhé.' : 'Nếu bạn biết số hiệu văn bản, nhắn số hiệu để mình tìm trên Công báo và nạp về.';
    return { text: `${NO_SOURCE} ${hint}`, intent };
  }

  // Bộ nhớ (§6.1): không mã người dùng nào vào state; ứng viên hs không phải kết quả tra, nên "đúng" không ghi gì.
  const facts = plan.goods?.facts ?? [];
  const candidates = (composed.candidates ?? []).map((c) => c.hs);
  const memory =
    mode === 'hs'
      ? { topic: 'tariff', tariff: candidates.length ? stampTariff({ hs: null, candidates, desc: facts.join(', '), keywords: plan.keywords ?? [] }) : null }
      : { topic: 'legal', legal: legalMemory(plan, composed.citations ?? [], composed.asOf) };
  return { text: lines, ...memory, answer: { mode, question: asked(plan), goods: { facts }, at: new Date().toISOString() }, intent };
}

// --- Main -------------------------------------------------------------------
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

  api.listener.on('message', async (msg) => {
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

      // Vision mất ~15-30s: báo ngay để người dùng không tưởng bot treo.
      if (image) {
        await api.sendMessage({ ...wire(render('Mình đang xem ảnh, bạn chờ khoảng 20 giây nhé.')[0]), quote: msg.data }, msg.threadId, msg.type).catch(() => {});
      }

      // A long answer path (code check) says it is working, as the image path does.
      const notify = (t) => api.sendMessage({ ...wire(render(t)[0]), quote: msg.data }, msg.threadId, msg.type).catch(() => {});
      const result = await respond({ text, image, quote: msg.data?.quote, ctx, senderName, threadId: msg.threadId, userId, notify });
      if (process.env.BOT_DEBUG) {
        console.log(`[zalo] topic=${ctx.topic ?? '-'} tariffFresh=${ctx.tariffFresh} → intent=${result.intent}`);
      }
      // Only the first part quotes the question. Memory is saved right after it, so a later part
      // failing never costs the "đúng"/"sai" that follows (tariffFresh).
      const parts = render(result.text);
      await api.sendMessage({ ...wire(parts[0]), quote: msg.data }, msg.threadId, msg.type);

      // Ghi nhớ SAU khi đã trả lời — lỗi lưu trí nhớ không được làm mất câu trả lời.
      // `tariff`/`legal`/`answer` vắng mặt = giữ nguyên phần trí nhớ đó; null = xoá (không còn gì để trỏ tới).
      const state = nextState(ctx.state, result);
      await saveContext({
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
        await api.sendMessage(wire(p), msg.threadId, msg.type).catch((e) => console.warn('[zalo] send part failed:', e?.message));
      }
    } catch (e) {
      console.error('[zalo] lỗi xử lý tin:', e?.message);
      try {
        await api.sendMessage(wire(render('Xin lỗi, có lỗi khi tra cứu. Thử lại sau.')[0]), msg.threadId, msg.type);
      } catch {
        /* ignore */
      }
    }
  });

  // Ingest takes minutes, long past the message that asked for it, so the outcome comes
  // home on its own. Acknowledge only AFTER the message is sent: re-reporting once is a
  // far smaller failure than promising to follow up and going silent.
  setInterval(async () => {
    try {
      const reports = await ingestReports();
      const delivered = [];
      for (const r of reports) {
        if (!r.threadId) { delivered.push(r.id); continue; }
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
