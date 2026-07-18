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

function parseQuery(text) {
  const t = text.toLowerCase().trim();
  const m = t.match(HS_RE);
  if (!m) return null;
  const hs = m[1] + m[2] + m[3];
  let origin = null;
  for (const [k, v] of Object.entries(ORIGIN)) {
    if (t.includes(k)) {
      origin = v;
      break;
    }
  }
  // ISO date if present, else today
  const dm = t.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dm ? dm[1] : new Date().toISOString().slice(0, 10);
  return { hs, origin, date, dotted: `${m[1]}.${m[2]}.${m[3]}` };
}

// --- Format the /tariff answer for chat ------------------------------------
function formatAnswer(q, r) {
  const lines = [`📋 ${q.dotted}${q.origin ? ` · ${q.origin}` : ''} · ${q.date}`];
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

async function answer(text) {
  const q = parseQuery(text);
  if (!q) {
    return 'Nhắn: <mã HS> <xuất xứ>. Ví dụ: "8481.80.99 TQ" hoặc "0301.11.10 nhật 2026-06-01".';
  }
  const url = `${API}/tariff?hs=${q.hs}&date=${q.date}${q.origin ? `&origin=${q.origin}` : ''}`;
  const res = await fetch(url);
  if (res.status === 404) {
    return `Không tìm thấy thuế cho HS ${q.dotted} (ngày ${q.date}). Có thể là dòng không mang thuế, dòng đặc biệt, hoặc ngoài dữ liệu đã nạp.`;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return `Lỗi tra cứu: ${body.message || res.status}. Thử "8481.80.99 TQ".`;
  }
  return formatAnswer(q, await res.json());
}

// --- Main -------------------------------------------------------------------
async function main() {
  const api = await connect();
  const me = await api.getOwnId?.().catch?.(() => null);
  console.log(`[zalo] đăng nhập OK${me ? ` (id ${me})` : ''}. API=${API}. Allowlist=${ALLOWED.length ? ALLOWED.join(',') : '(mở — nên đặt ALLOWED_THREADS)'}`);

  api.listener.on('message', async (msg) => {
    try {
      if (msg.isSelf) return;
      if (ALLOWED.length && !ALLOWED.includes(msg.threadId)) return;
      const content = msg.data?.content;
      if (typeof content !== 'string' || !content.trim()) return;
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
