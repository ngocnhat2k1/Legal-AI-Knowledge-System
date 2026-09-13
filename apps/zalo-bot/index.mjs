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
 *   format.mjs       ghép lời dẫn của LLM lên trên khối số liệu tất định
 *
 * Env: API_URL, ZALO_SESSION_PATH, ALLOWED_THREADS, ZALO_USER_AGENT, CLAUDE_CODE_OAUTH_TOKEN.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LoginQRCallbackEventType, ThreadType, Zalo } from 'zca-js';

import { answerByHs, answerImage, answerLegal, handleConfirm, handleCorrection, tariffByClues } from './answer.mjs';
import { ackIngestReports, ingestReports, legalDocuments, requestIngest, verifyDocument } from './api.mjs';
import { loadContext, saveContext } from './conversation.mjs';
import { fallbackIntent, fastPath, guardIntent, parseVerifyDocCommand } from './dispatch.mjs';
import { extractImage } from './images.mjs';
import { formatIngestQueued, formatIngestReport } from './format.mjs';
import { docNumberStatedIn, mergeQuote, parseQuery, stripMentions } from './parse.mjs';
import { toText } from './render.mjs';
import { route } from './router.mjs';

const API = process.env.API_URL || 'http://api:3000';
const SESSION = process.env.ZALO_SESSION_PATH || '/session/zalo-session.json';
const ALLOWED = (process.env.ALLOWED_THREADS || '').split(',').map((s) => s.trim()).filter(Boolean);
const USER_AGENT =
  process.env.ZALO_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// --- Session persistence ----------------------------------------------------
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
async function respond({ text, image, quote, ctx, senderName, threadId, userId }) {
  const quoteText = String(quote?.msg || '');

  // 0. "xác nhận văn bản <số hiệu>" — người đọc đứng ra bảo đảm cho một văn bản bot tự
  // nạp. Ghi kèm TÊN người xác nhận, giống hệt sổ verify-on-use của mã HS.
  const verifyDoc = parseVerifyDocCommand(text);
  if (verifyDoc) {
    const res = await verifyDocument(verifyDoc, senderName);
    return {
      text: res?.verified
        ? `✅ Đã ghi nhận ${verifyDoc} là ĐÃ ĐỐI CHIẾU (theo ${senderName}). Từ giờ trích dẫn từ văn bản này không còn cảnh báo nữa.`
        : `Mình không tìm thấy ${verifyDoc} ở trạng thái "bot tự nạp" để xác nhận — có thể nó đã được xác nhận rồi, hoặc chưa có trong kho.`,
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
        : `Mình chưa xếp hàng nạp được ${pending.number}, thử lại sau nhé.`,
      topic: 'legal',
      // The offer has been taken up; leave it open and a later "ok" would queue it twice.
      legal: { ...ctx.legal, pendingIngest: null },
      intent: 'legal',
    };
  }
  if (fast?.action === 'confirm') return { ...(await handleConfirm(ctx.tariff, fast.verdict, senderName)), intent: 'confirm' };
  if (fast?.action === 'correction') return { ...(await handleCorrection(ctx.tariff, text, senderName, quote)), intent: 'correction' };

  // 2. Ảnh: vision nhận diện mặt hàng rồi đi tiếp đường tra thuế tất định.
  if (image) return { ...(await answerImage(image.imageUrls, text)), intent: 'tariff' };

  // 3. Mã HS nằm ngay trong câu hỏi mới → tra thẳng, không cần định tuyến.
  const direct = parseQuery(text);
  if (direct) return { ...(await answerByHs(direct, { showFooter: ctx.topic !== 'tariff' })), intent: 'tariff' };

  // 4. Định tuyến có ngữ cảnh.
  const routed = await route(text, {
    topic: ctx.topic,
    state: ctx.state,
    turns: ctx.turns,
    documents: await legalDocuments(),
  });
  const intent = routed
    ? guardIntent(routed.intent, { topic: ctx.topic, tariffFresh: ctx.tariffFresh, quoteText })
    : fallbackIntent({ topic: ctx.topic, text });

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
    const query = routed?.searchQuery || mergeQuote(text, quote);
    // The router may RECOGNISE a document number, never MINT one. `doc=` is trusted
    // absolutely downstream, so a number the human never wrote redirects the whole
    // answer: asked "thông tư 36 của bộ Khoa học công nghệ" — no year at all — the
    // router supplied "36/2016/TT-BKHCN", carried over from an earlier turn, and the
    // bot went on to report that document missing and list unrelated circulars.
    const statedDoc =
      routed?.docNumber && docNumberStatedIn(`${text} ${quoteText}`, routed.docNumber)
        ? routed.docNumber
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
      text:
        routed?.reply ||
        'Mình tra được hai thứ: (1) biểu thuế XNK — gõ TÊN HÀNG (van, xăng…) hoặc MÃ HS; (2) văn bản pháp luật Việt Nam — luật, nghị định, thông tư của bất kỳ bộ ngành nào. Văn bản chưa có trong kho thì mình tìm trên Công báo và nạp về giúp bạn.',
      topic: 'general',
      intent,
    };
  }

  // intent === 'tariff'. "Còn từ Nhật thì sao" — cùng mặt hàng, khác xuất xứ: giữ mã cũ.
  if (routed?.reuseLastHs && ctx.tariff?.hs) {
    const q = {
      hs: ctx.tariff.hs,
      dotted: ctx.tariff.dotted,
      origin: routed.origin ?? ctx.tariff.origin ?? null,
      date: routed.date || new Date().toISOString().slice(0, 10),
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
        await api.sendMessage({ msg: '🔍 Đang xem ảnh…', quote: msg.data }, msg.threadId, msg.type).catch(() => {});
      }

      const result = await respond({ text, image, quote: msg.data?.quote, ctx, senderName, threadId: msg.threadId, userId });
      if (process.env.BOT_DEBUG) {
        console.log(`[zalo] topic=${ctx.topic ?? '-'} tariffFresh=${ctx.tariffFresh} → intent=${result.intent}`);
      }
      const reply = toText(result.text); // bridge: plain text until Task 6 sends styles
      await api.sendMessage({ msg: reply, quote: msg.data }, msg.threadId, msg.type);

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
        botText: reply,
        intent: result.intent,
        topic: result.topic ?? ctx.topic ?? null,
        state,
      });
    } catch (e) {
      console.error('[zalo] lỗi xử lý tin:', e?.message);
      try {
        await api.sendMessage({ msg: 'Xin lỗi, có lỗi khi tra cứu. Thử lại sau.' }, msg.threadId, msg.type);
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
            await api.sendMessage({ msg: formatIngestReport(r) }, r.threadId, type);
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

main().catch((e) => {
  console.error('[zalo] khởi động thất bại:', e);
  process.exit(1);
});
