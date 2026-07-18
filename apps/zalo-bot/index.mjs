/**
 * Zalo bot — nhắn tin tra biểu thuế qua Zalo, đóng gói TRONG app (self-contained).
 *
 * Chạy như một service trong Docker Compose bên cạnh `api`. Không phụ thuộc agent
 * ngoài (openclaw): đổi server = redeploy compose + quét QR một lần. Đăng nhập bằng
 * zca-js (thư viện KHÔNG chính thức — dùng TÀI KHOẢN ZALO RIÊNG cho bot, không dùng
 * Zalo cá nhân, vì có rủi ro khóa tài khoản; xem ADR web-app-then-zalo).
 *
 * Luồng: nhận tin → tách mã HS + xuất xứ → gọi API `/tariff` nội bộ → trả lời text
 * (thuế MFN + FTA có điều kiện C/O + CBPG + as-of + cảnh báo độ cũ).
 *
 * Env: API_URL, ZALO_SESSION_PATH, ALLOWED_THREADS (danh sách threadId được phép,
 * rỗng = trả lời tất cả), ZALO_USER_AGENT.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LoginQRCallbackEventType, ThreadType, Zalo } from 'zca-js';

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

// --- Query parsing ----------------------------------------------------------
const HS_RE = /(\d{4})[.\s]?(\d{2})[.\s]?(\d{2})/;
const ORIGIN = {
  'trung quoc': 'CN', 'trung quốc': 'CN', tq: 'CN', 'tàu': 'CN', china: 'CN', cn: 'CN',
  'nhat': 'JP', 'nhật': 'JP', 'nhật bản': 'JP', japan: 'JP', jp: 'JP',
  'han': 'KR', 'hàn': 'KR', 'hàn quốc': 'KR', korea: 'KR', kr: 'KR',
  uc: 'AU', 'úc': 'AU', australia: 'AU', au: 'AU',
  'new zealand': 'NZ', nz: 'NZ',
  thai: 'TH', 'thái': 'TH', 'thái lan': 'TH', thailand: 'TH', th: 'TH',
  malaysia: 'MY', 'mã lai': 'MY', my: 'MY',
  singapore: 'SG', sg: 'SG', indonesia: 'ID', id: 'ID', 'phi': 'PH', philippines: 'PH', ph: 'PH',
  duc: 'DE', 'đức': 'DE', germany: 'DE', de: 'DE', 'châu âu': 'EU', eu: 'EU', 'anh': 'GB', gb: 'GB',
  'ấn': 'IN', 'ấn độ': 'IN', india: 'IN', in: 'IN',
};

function detectOrigin(t) {
  for (const [k, v] of Object.entries(ORIGIN)) if (t.includes(k)) return v;
  return null;
}

function parseQuery(text) {
  const t = text.toLowerCase().trim();
  const m = t.match(HS_RE);
  if (!m) return null;
  const dm = t.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    hs: m[1] + m[2] + m[3],
    origin: detectOrigin(t),
    date: dm ? dm[1] : new Date().toISOString().slice(0, 10),
    dotted: `${m[1]}.${m[2]}.${m[3]}`,
  };
}

/** Strip origin/date/filler from a sentence to get the product keyword ("van từ TQ" → "van"). */
function keywordFrom(text, origin) {
  let t = text.toLowerCase().replace(/\d{4}-\d{2}-\d{2}/g, ' ');
  for (const [k, v] of Object.entries(ORIGIN)) if (v === origin && t.includes(k)) { t = t.split(k).join(' '); break; }
  for (const w of ['nhập khẩu', 'thuế suất', 'hôm nay', 'xuất xứ', 'bao nhiêu', 'là gì', 'từ ', 'nhập ', 'thuế', 'cái ', 'con ', 'chiếc ', 'ngày', 'giá', 'mã hs', ' hs ']) {
    t = t.split(w).join(' ');
  }
  return t.replace(/[?.,!:]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchGoods(kw) {
  const res = await fetch(`${API}/tariff/search?q=${encodeURIComponent(kw)}`);
  return res.ok ? res.json() : [];
}

/**
 * Bộ ĐỊNH TUYẾN (một bước suy luận Claude ở giữa): phân loại ý định câu hỏi →
 *   - tariff : tra thuế/mã HS một mặt hàng  → chạy đường TẤT ĐỊNH (không LLM tính số)
 *   - legal  : hỏi luật/thủ tục/C/O/khái niệm → Claude trả lời + cảnh báo tham khảo
 *   - general: chào hỏi/hỏi năng lực/ngoài phạm vi → Claude trả lời tự nhiên
 * Claude chạy bằng subscription VPS (không tốn phí/token). Không có token → null → fallback.
 */
function route(text) {
  return new Promise((resolve) => {
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) return resolve(null);
    const prompt =
      'Bạn là bộ định tuyến cho trợ lý hải quan Việt Nam. Phân loại câu hỏi và trả JSON MỘT dòng, KHÔNG markdown, KHÔNG chữ ngoài JSON:\n' +
      '{"intent":"tariff|legal|general",' +
      '"keywords":["<nếu tariff: 1-3 từ khoá TIẾNG VIỆT tìm trong Danh mục HS, vd thẻ, thẻ thông minh>"],' +
      '"hs_hints":["<nếu tariff: 0-3 nhóm HS 4-6 chữ số phù hợp, vd 8523.52>"],' +
      '"origin":"<mã nước 2 chữ ISO HOA hoặc null>","date":"<YYYY-MM-DD hoặc null>",' +
      '"note":"<nếu tariff: MỘT câu ngắn ≤22 từ giải thích phân loại>",' +
      '"reply":"<nếu legal/general: câu trả lời TIẾNG VIỆT, rõ ràng, đúng trọng tâm, ≤120 từ>"}\n' +
      '- intent=tariff: hỏi thuế suất hoặc mã HS của MỘT mặt hàng cụ thể.\n' +
      '- intent=legal: hỏi về luật/quy định/thủ tục hải quan, C/O, hồ sơ, khái niệm thuế XNK, nghị định.\n' +
      '- intent=general: chào hỏi, hỏi bot làm được gì, hoặc ngoài phạm vi hải quan.\n' +
      `Câu: "${String(text).replace(/["\n]/g, ' ').slice(0, 500)}"`;
    execFile(
      'claude',
      ['-p', prompt],
      { timeout: 45000, env: { ...process.env, HOME: process.env.HOME || '/tmp' } },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const m = String(stdout).match(/\{[\s\S]*\}/);
          if (!m) return resolve(null);
          const o = JSON.parse(m[0]);
          const arr = (x) => (Array.isArray(x) ? x.map(String).map((s) => s.trim()).filter(Boolean) : []);
          resolve({
            intent: ['tariff', 'legal', 'general'].includes(o.intent) ? o.intent : 'tariff',
            keywords: arr(o.keywords),
            hsHints: arr(o.hs_hints).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 4),
            origin: /^[A-Za-z]{2}$/.test(o.origin || '') ? String(o.origin).toUpperCase() : null,
            date: /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? o.date : null,
            note: o.note ? String(o.note).trim().slice(0, 200) : null,
            reply: o.reply ? String(o.reply).trim().slice(0, 1500) : null,
          });
        } catch {
          resolve(null);
        }
      },
    );
  });
}

async function searchByPrefix(prefix) {
  const res = await fetch(`${API}/tariff/search?prefix=${encodeURIComponent(prefix)}`);
  return res.ok ? res.json() : [];
}

async function lookupFull(hsDotted, origin, date) {
  const hs = hsDotted.replace(/\./g, '');
  const res = await fetch(`${API}/tariff?hs=${hs}&date=${date}${origin ? `&origin=${origin}` : ''}`);
  return res.ok ? res.json() : null;
}

function formatCandidates(kw, list, origin) {
  const lines = [
    `🔎 "${kw}"${origin ? ` · xuất xứ ${origin}` : ''} — ${list.length} mã phù hợp. Nhắn MÃ${origin ? '' : ' kèm xuất xứ'} để xem thuế đầy đủ:`,
  ];
  for (const c of list.slice(0, 8)) {
    const tail = (c.path || '').split(' › ').slice(-2).join(' › ');
    lines.push(`• ${c.hsDotted}  ·  MFN ${c.mfn != null ? Number(c.mfn) + '%' : '—'}  ·  ${tail}`);
  }
  if (list.length > 8) lines.push(`…và ${list.length - 8} mã nữa — gõ cụ thể hơn để thu hẹp.`);
  lines.push(`Ví dụ: "${list[0]?.hsDotted || '8481.10.11'} ${origin || 'TQ'}".`);
  return lines.join('\n');
}

// --- Format the /tariff answer for chat ------------------------------------
function formatAnswer(q, r) {
  const lines = [`📋 ${q.dotted}${q.origin ? ` · ${q.origin}` : ''} · ${q.date}`];
  if (r.goods?.heading) lines.push(`📦 ${r.goods.heading}`);
  const mfn = r.import?.mfn;
  if (mfn) lines.push(`MFN: ${mfn.statement}  (${mfn.decree})`);
  const pref = r.import?.preferential ?? [];
  if (pref.length) {
    lines.push('Ưu đãi FTA (cần C/O đúng form):');
    for (const p of pref) lines.push(`• ${p.schedule}: ${p.statement}`);
  }
  const oq = r.import?.outOfQuota;
  if (oq) lines.push(`Ngoài hạn ngạch: ${oq.statement}`);
  if (r.export) lines.push(`Xuất khẩu: ${r.export.statement}`);
  for (const c of r.antiDumping ?? []) lines.push(`⚠️ ${c.statement}`);
  if (r.staleness?.stale) lines.push(`⚠️ ${r.staleness.warning}`);
  if (r.notes?.length) lines.push(...r.notes.map((n) => `ℹ️ ${n}`));
  lines.push('— trả lời "đúng" hoặc "sai" nếu muốn xác nhận kết quả này.');
  return lines.join('\n');
}

/** Đường TẤT ĐỊNH: từ gợi ý (từ khoá + nhóm HS) → tra DB → trả thẳng thuế mã khả dĩ nhất + mã thay thế. */
async function tariffByClues(clues, text) {
  const lower = text.toLowerCase();
  const origin = clues?.origin || detectOrigin(lower);
  const date = clues?.date || new Date().toISOString().slice(0, 10);

  const seen = new Set();
  const cands = [];
  const add = (list) => {
    for (const c of list || []) if (!seen.has(c.hs)) { seen.add(c.hs); cands.push(c); }
  };
  for (const p of clues?.hsHints || []) add(await searchByPrefix(p));
  const keywords = (clues?.keywords?.length ? clues.keywords : [keywordFrom(text, origin)]).filter((k) => k && k.length >= 2);
  for (const kw of keywords) {
    let l = await searchGoods(kw);
    if (!l.length && /\s/.test(kw)) {
      for (const w of kw.split(/\s+/).filter((w) => w.length >= 2)) { l = await searchGoods(w); if (l.length) break; }
    }
    add(l);
  }

  if (!cands.length) {
    return `Chưa tìm được mã HS phù hợp${keywords.length ? ` cho "${keywords.join(', ')}"` : ''}.${clues?.note ? ` (${clues.note})` : ''} Thử mô tả rõ hơn, hoặc gõ thẳng mã HS.`;
  }

  const top = cands[0];
  const full = await lookupFull(top.hsDotted, origin, date);
  const out = [];
  if (clues?.note) out.push(`💡 ${clues.note}`);
  out.push(full ? formatAnswer({ dotted: top.hsDotted, origin, date }, full) : `📋 ${top.hsDotted} — ${top.path}`);
  if (cands.length > 1) {
    out.push('— Nếu không đúng loại hàng, chọn mã khác:');
    for (const c of cands.slice(1, 6)) {
      out.push(`• ${c.hsDotted} · MFN ${c.mfn != null ? Number(c.mfn) + '%' : '—'} · ${(c.path || '').split(' › ').slice(-2).join(' › ')}`);
    }
  }
  return out.join('\n');
}

async function answer(text) {
  // Có mã HS → tra thẳng (không cần router).
  const q = parseQuery(text);
  if (q) {
    const res = await fetch(`${API}/tariff?hs=${q.hs}&date=${q.date}${q.origin ? `&origin=${q.origin}` : ''}`);
    if (res.status === 404) {
      return `Không tìm thấy thuế cho HS ${q.dotted} (ngày ${q.date}). Có thể là dòng không mang thuế, dòng đặc biệt, hoặc ngoài dữ liệu đã nạp.`;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return `Lỗi tra cứu: ${body.message || res.status}. Thử "8481.80.99 TQ".`;
    }
    return formatAnswer(q, await res.json());
  }

  // Không có mã HS → BỘ ĐỊNH TUYẾN phân loại ý định.
  const r = await route(text);
  if (!r) return tariffByClues(null, text); // không có LLM → coi như tra hàng theo từ khoá

  if (r.intent === 'legal') {
    return `${r.reply || 'Mình chưa rõ câu hỏi, bạn nói cụ thể hơn nhé.'}\n\n⚠️ Thông tin THAM KHẢO, không phải tư vấn pháp lý chính thức — hãy đối chiếu văn bản gốc / hỏi chuyên viên. Cần con số thuế cụ thể thì cho mình tên hàng + xuất xứ.`;
  }
  if (r.intent === 'general') {
    return (
      r.reply ||
      'Mình là bot hải quan: gõ TÊN HÀNG (van, xăng…) hoặc MÃ HS để xem thuế; hỏi về thủ tục/C/O/khái niệm cũng được.'
    );
  }
  return tariffByClues(r, text); // intent === tariff
}

/** Bỏ các đoạn @tag khỏi nội dung (dùng pos/len của mentions, an toàn từ cuối lên). */
function stripMentions(content, mentions) {
  if (!Array.isArray(mentions) || !mentions.length) return content;
  let s = content;
  for (const m of [...mentions].sort((a, b) => b.pos - a.pos)) {
    if (typeof m.pos === 'number' && typeof m.len === 'number' && m.pos >= 0 && m.pos + m.len <= s.length) {
      s = s.slice(0, m.pos) + s.slice(m.pos + m.len);
    }
  }
  return s.replace(/\s+/g, ' ').trim();
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
      let content = msg.data?.content;
      if (typeof content !== 'string' || !content.trim()) return;

      // Trong NHÓM: chỉ trả lời khi bot được @tag (tránh trả lời mọi tin).
      if (msg.type === ThreadType.Group) {
        const mentions = msg.data?.mentions || [];
        const tagged = myId && mentions.some((m) => String(m.uid) === myId);
        if (!tagged) return;
        content = stripMentions(content, mentions);
        if (!content.trim()) return;
      }

      const reply = await answer(content);
      await api.sendMessage({ msg: reply, quote: msg.data }, msg.threadId, msg.type);
    } catch (e) {
      console.error('[zalo] lỗi xử lý tin:', e?.message);
      try {
        await api.sendMessage({ msg: 'Xin lỗi, có lỗi khi tra cứu. Thử lại sau.' }, msg.threadId, msg.type);
      } catch {
        /* ignore */
      }
    }
  });

  api.listener.on('error', (e) => console.error('[zalo] listener error:', e?.message));
  api.listener.start();
  console.log('[zalo] đang lắng nghe tin nhắn…');
}

main().catch((e) => {
  console.error('[zalo] khởi động thất bại:', e);
  process.exit(1);
});
