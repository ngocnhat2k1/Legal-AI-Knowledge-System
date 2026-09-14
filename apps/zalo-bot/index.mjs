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
 *   router.mjs       một bước Claude đọc CẢ hội thoại để phân loại + viết lại câu hỏi
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

import { answerByHs, answerCodeCheck, answerImage, answerLegal, handleConfirm, handleCorrection, tariffByClues } from './answer.mjs';
import { ackIngestReports, ingestReports, legalDocuments, requestIngest, verifyDocument } from './api.mjs';
import { loadContext, saveContext } from './conversation.mjs';
import { asksCodeFit, fallbackIntent, fastPath, guardIntent, isBareLookup, legalAboutCode, parseVerifyDocCommand, readsAsQuestion, unmaskCodes } from './dispatch.mjs';
import { extractImage } from './images.mjs';
import { CAPABILITIES, formatGeneral, formatIngestQueued, formatIngestReport } from './format.mjs';
import { docNumberStatedIn, mergeQuote, parseQuery, statedDocNumber, stripMentions, todayVN } from './parse.mjs';
import { L, render } from './render.mjs';
import { route } from './router.mjs';

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

/**
 * Quyết định nhánh rồi tạo câu trả lời.
 *
 * `text` = câu hỏi MỚI (regex HS chỉ soi cái này). Ngữ cảnh tin được reply chỉ đi vào
 * bộ định tuyến LLM, KHÔNG vào regex — câu trả lời cũ của bot luôn chứa mã HS, nên nếu
 * cho regex soi cả ngữ cảnh thì một câu hỏi pháp luật reply vào tin có "8481.10.11"
 * sẽ bị bắt nhầm thành tra thuế.
 */
export async function respond({ text, image, quote, ctx, senderName, threadId, userId, notify }) {
  const quoteText = String(quote?.msg || '');

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

  // 3. Mã HS nằm ngay trong câu hỏi mới → tra thẳng, không cần định tuyến. Trừ khi câu hỏi hỏi văn bản nào
  // liệt kê mã đó ("thuộc danh mục rủi ro nào theo Thông tư 36/2026"): đó là câu hỏi pháp luật.
  // Hỏi mã có hợp không mà tên hàng có từ danh mục ("pin năng lượng mặt trời áp mã … được không"): vẫn là đối chiếu (R4).
  if (legalAboutCode(text) && !asksCodeFit(text)) return { ...(await answerLegal(text, {})), intent: 'legal' };
  const direct = parseQuery(text);
  const byCode = () => answerByHs(direct, { showFooter: ctx.topic !== 'tariff' });
  // Chỉ có mã + xuất xứ + từ tra thuế thì tra thẳng. Câu có nội dung khác ("e tham khảo mã 30051010 không biết được
  // không ạ") hỏi mã có hợp với hàng không: để router đọc trước, mã bị che (R4).
  if (direct && isBareLookup(text)) return { ...(await byCode()), intent: 'tariff' };

  // 4. Định tuyến có ngữ cảnh. Router không thấy chữ số của mã nào (R4).
  const routed = await route(text, {
    topic: ctx.topic,
    state: ctx.state,
    turns: ctx.turns,
    documents: await legalDocuments(),
  });
  // Không có LLM để đọc câu: tra mã vẫn là cách hiểu tốt nhất.
  if (direct && !routed) return { ...(await byCode()), intent: 'tariff' };
  let intent = routed
    ? guardIntent(routed.intent, { topic: ctx.topic, tariffFresh: ctx.tariffFresh, quoteText })
    : fallbackIntent({ topic: ctx.topic, text });

  // "Mã này sai không ạ?" là câu hỏi, không phải phán quyết: không bao giờ ghi sổ từ một câu hỏi (R13).
  if ((intent === 'confirm' || intent === 'correction') && readsAsQuestion(text)) intent = direct || ctx.tariff?.hs ? 'check_code' : 'tariff';
  // Router không thấy mã nên không biết "em chốt 8481.80.59" khác mã vừa tra: một mã trong tin không bao giờ để nó
  // ghi sổ cho mã cũ (R13). Đính chính tường minh ("HS đúng là …") đã đi đường tắt ở bước 1.
  if (direct && (intent === 'confirm' || intent === 'correction')) return { ...(await byCode()), intent: 'tariff' };
  // "Vì sao hàng của em vào mã X" là phân loại lấy mã người dùng làm tiền đề: đối chiếu, không để /legal bênh mã (R4).
  if (direct && intent === 'legal' && asksCodeFit(text)) intent = 'check_code';
  if (intent === 'check_code') {
    const q = direct ?? (ctx.tariff?.hs ? { hs: ctx.tariff.hs, dotted: ctx.tariff.dotted, origin: ctx.tariff.origin ?? null, date: todayVN() } : null);
    if (q) {
      await notify?.('Mình đang đọc chú giải các nhóm liên quan để đối chiếu mã, chờ khoảng một phút nhé.');
      return { ...(await answerCodeCheck(q, routed, text)), intent };
    }
  }
  if (intent === 'confirm') {
    return { ...(await handleConfirm(ctx.tariff, routed?.verdict || 'correct', senderName)), intent };
  }
  if (intent === 'correction') {
    return { ...(await handleCorrection(ctx.tariff, text, senderName, quote)), intent };
  }
  if (intent === 'legal') {
    // `search_query` là câu hỏi ĐỘC LẬP do router viết lại từ cả hội thoại. Câu tinh chỉnh
    // ("không phải câu trả lời tôi muốn") tự nó là rác với retriever; chỉ khi ghép ngữ cảnh
    // nó mới thành câu tra được. Không có router → dùng câu đã ghép quote.
    const query = unmaskCodes(routed?.searchQuery, routed?.codes) || mergeQuote(text, quote);
    // The router may RECOGNISE a document number, never MINT one. `doc=` is trusted
    // absolutely downstream, so a number the human never wrote redirects the whole
    // answer: asked "thông tư 36 của bộ Khoa học công nghệ" — no year at all — the
    // router supplied "36/2016/TT-BKHCN", carried over from an earlier turn, and the
    // bot went on to report that document missing and list unrelated circulars.
    const statedDoc =
      routed?.docNumber && docNumberStatedIn(`${text} ${quoteText}`, routed.docNumber)
        ? statedDocNumber(`${text} ${quoteText}`, routed.docNumber) // an issuer the user did not write is dropped (39/2018)
        : undefined;
    return {
      ...(await answerLegal(query, {
        asOf: routed?.date,
        doc: statedDoc,
        article: routed?.article,
        clause: routed?.clause,
        lead: routed?.lead,
      })),
      intent,
    };
  }
  if (intent === 'general') {
    return {
      text: formatGeneral(routed?.reply),
      topic: 'general',
      intent,
    };
  }

  // intent === 'tariff' (hoặc check_code mà câu không có mã). Câu hỏi thuế có kèm mã: tra đúng mã đó.
  if (direct) return { ...(await byCode()), intent: 'tariff' };
  // "Còn từ Nhật thì sao" — cùng mặt hàng, khác xuất xứ: giữ mã cũ.
  if (routed?.reuseLastHs && ctx.tariff?.hs) {
    const q = {
      hs: ctx.tariff.hs,
      dotted: ctx.tariff.dotted,
      origin: routed.origin ?? ctx.tariff.origin ?? null,
      date: routed.date || todayVN(),
    };
    return { ...(await answerByHs(q, { showFooter: false })), intent };
  }
  return { ...(await tariffByClues(routed, text, { showFooter: ctx.topic !== 'tariff' })), intent };
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
      // `tariff`/`legal` vắng mặt = giữ nguyên phần trí nhớ đó; null = xoá (không còn gì để trỏ tới).
      const state = { ...(ctx.state || {}) };
      if ('tariff' in result) state.tariff = result.tariff;
      if ('legal' in result) state.legal = result.legal;
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
