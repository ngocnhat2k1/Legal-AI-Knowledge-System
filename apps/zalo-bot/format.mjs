/**
 * Turning API payloads into chat messages.
 *
 * The shape of every answer is: an LLM-written LEAD (one or two natural sentences,
 * so the bot stops reading like a form letter) followed by a DETERMINISTIC BLOCK
 * built here from database values only. The split is the whole point — the prose is
 * allowed to be fluent because it is not allowed to carry facts.
 * See the no-llm-on-tariff-numbers ADR.
 */

import { cleanGazetteTitle } from './parse.mjs';

const PERCENT_RE = /\d+([.,]\d+)?\s*%/;
const CITATION_RE = /(?:điều|khoản|điểm)\s*\d+[a-zà-ỹ]?/gi;
const HS_DOTTED_RE = /\d{4}\.\d{2}\.\d{2}/g;

/**
 * Enforce the lead/facts split IN CODE, not by asking the model nicely.
 *
 * A lead is dropped outright if it states a rate — a percentage in conversational
 * prose is a tariff number produced by an LLM, which is the one thing this system
 * must never do. A lead that cites a provision or an HS code is dropped unless that
 * exact citation also appears in the deterministic block, i.e. unless it is echoing
 * something the database actually returned rather than recalling it from training.
 *
 * @param {string} lead   the model's opening sentences
 * @param {string} block  the deterministic answer it will be prefixed to
 */
export function sanitizeLead(lead, block = '') {
  const text = String(lead ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (PERCENT_RE.test(text)) return '';

  const hay = String(block ?? '').toLowerCase().replace(/\s+/g, ' ');
  const claims = [...(text.match(CITATION_RE) ?? []), ...(text.match(HS_DOTTED_RE) ?? [])];
  for (const c of claims) {
    if (!hay.includes(c.toLowerCase().replace(/\s+/g, ' '))) return '';
  }
  return text.slice(0, 400);
}

/** Join a sanitized lead onto a deterministic block. */
export function withLead(lead, block) {
  const clean = sanitizeLead(lead, block);
  return clean ? `${clean}\n\n${block}` : block;
}

// --- Tariff -----------------------------------------------------------------

/** Footer: show what's already been recorded, and DON'T re-ask if it's confirmed correct. */
export function confirmFooter(c) {
  if (!c || !(c.correct || c.wrong || c.unsure)) {
    return '— trả lời "đúng" hoặc "sai" nếu muốn xác nhận kết quả này.';
  }
  const recent = Array.isArray(c.recent) ? c.recent : [];
  const lastOf = (v) => recent.find((r) => r.verdict === v);
  const parts = [];
  if (c.correct) { const l = lastOf('correct'); parts.push(`✓ đã xác nhận ĐÚNG ${c.correct} lần${l ? ` (gần nhất: ${l.staffName})` : ''}`); }
  if (c.wrong) { const l = lastOf('wrong'); parts.push(`✗ từng báo SAI ${c.wrong} lần${l ? ` (${l.staffName}${l.note ? ': ' + String(l.note).replace(/\s+/g, ' ').slice(0, 60) : ''})` : ''}`); }
  if (c.unsure) parts.push(`? chưa chắc ${c.unsure} lần`);
  const invite = c.wrong
    ? '— mã này từng bị đính chính, kiểm tra kỹ. Trả lời "đúng"/"sai" để cập nhật.'
    : '— nếu chưa đúng, trả lời "sai" hoặc gửi mã đúng để mình sửa.';
  return `📌 ${parts.join(' · ')}\n${invite}`;
}

/**
 * The tariff answer. `showFooter` is false on a follow-up within the same topic —
 * repeating "trả lời đúng/sai để xác nhận" under every single message is most of
 * what made the bot read like a machine. It is still shown whenever there is a real
 * verdict history to surface.
 */
export function formatAnswer(q, r, confirm, { showFooter = true } = {}) {
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
  const hasHistory = confirm && (confirm.correct || confirm.wrong || confirm.unsure);
  if (showFooter || hasHistory) lines.push(confirmFooter(confirm));
  return lines.join('\n');
}

export function formatCandidates(kw, list, origin) {
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

// --- Legal ------------------------------------------------------------------

/** Grounded legal answer: prose + VERBATIM provisions + effectiveness + Công báo link. */
export function formatLegal(r, { showSourceNote = true } = {}) {
  const out = [];
  out.push(r.answer ? r.answer : '📚 Mình chưa tổng hợp được câu trả lời chắc chắn, nhưng đây là điều khoản liên quan nhất:');
  const unverified = (r.citations || []).some((c) => c.verification === 'auto_unverified');
  for (const c of (r.citations || []).slice(0, 3)) {
    const stale = c.effectiveness && c.effectiveness !== 'con_hieu_luc' ? ` ⚠️ ${c.effectiveness}` : '';
    const eff = c.effectiveFrom ? ` · hiệu lực từ ${c.effectiveFrom}${c.effectiveTo ? '→' + c.effectiveTo : ''}` : '';
    const text = (c.verbatimText || '').replace(/\s+/g, ' ').trim();
    const quoted = text.length > 480 ? text.slice(0, 480) + '…' : text;
    out.push(`\n📖 ${c.provisionLabel}${stale}${eff}\n“${quoted}”`);
    if (c.gazetteUrl) out.push(`↗ ${c.gazetteUrl}`);
  }
  // A document the bot fetched itself is NOT the same evidence as one a human checked,
  // and the difference has to be visible at the point of use — not buried in a schema
  // column. Always shown, regardless of showSourceNote: this is a caveat, not chrome.
  if (unverified) {
    out.push(
      '\n⚠️ Văn bản này do bot TỰ NẠP từ Công báo, CHƯA có người đối chiếu. Hiệu lực và bản sửa đổi chưa được kiểm tra — đọc kỹ link gốc trước khi dùng.' +
        '\n   Nếu bạn đã đối chiếu và thấy đúng, nhắn "xác nhận văn bản <số hiệu>" để mình đánh dấu đã kiểm chứng.',
    );
  }
  if (showSourceNote) out.push('\n📌 Trích nguyên văn từ văn bản trên Công báo — đối chiếu link để chắc chắn.');
  return out.join('\n');
}

/** A provision fetched by citation (no retrieval in the path). */
export function formatProvisions(rows) {
  const out = [];
  for (const p of rows.slice(0, 2)) {
    const stale = p.effectiveness && p.effectiveness !== 'con_hieu_luc' ? ` ⚠️ ${p.effectiveness}` : '';
    const eff = p.effectiveFrom ? ` · hiệu lực từ ${p.effectiveFrom}${p.effectiveTo ? '→' + p.effectiveTo : ''}` : '';
    const body = (p.body || '').replace(/\s+/g, ' ').trim();
    out.push(`📖 ${p.citationLabel}${stale}${eff}\n“${body.length > 1200 ? body.slice(0, 1200) + '…' : body}”`);
    if (p.gazetteUrl) out.push(`↗ ${p.gazetteUrl}`);
  }
  return out.join('\n\n');
}

/** Human name for a document kind, for the manifest listing. */
const DOC_KIND = {
  luat: 'Luật', phap_lenh: 'Pháp lệnh', nghi_dinh: 'Nghị định', nghi_quyet: 'Nghị quyết',
  thong_tu: 'Thông tư', quyet_dinh: 'Quyết định', vbhn: 'VBHN',
};

/**
 * The honest out-of-corpus answer. Before this, a question about a document we do not
 * hold retrieved the nearest passage from a document we DO hold and presented it as
 * the answer — which reads as the bot being wrong rather than the bot being out of
 * scope. Naming what IS held turns a dead end into a usable next step.
 *
 * `gazetteMatches` sharpens it further, because "we don't hold it" and "no such
 * document" deserve different answers. When the Công báo catalogue knows the number,
 * the bot can state the real title and link and offer to fetch it; when the catalogue
 * has never seen it, the likeliest explanation is a mistyped number, and saying so is
 * more useful than listing our shelf again.
 */
export function formatMissingDoc(label, gazetteMatches = [], kind = 'none') {
  const lines = [];
  const matches = gazetteMatches || [];
  const item = (g) => `• ${g.number} — ${cleanGazetteTitle(g.number, g.title)}`;

  if (kind === 'exact' && matches[0]) {
    const hit = matches[0];
    lines.push(`Trên Công báo có ${hit.number}: ${cleanGazetteTitle(hit.number, hit.title, 130)}`);
    if (hit.sourceUrl) lines.push(`↗ ${hit.sourceUrl}`);
    lines.push('Kho mình chưa có toàn văn. Trả lời "nạp" là mình lấy về rồi tra nội dung cho bạn (vài phút).');
  } else if (kind === 'ambiguous' && matches.length) {
    // Right issuer, right serial, several years. These ARE candidates for what was
    // asked — the only missing piece is which year, so ask for that rather than
    // implying the user got the reference wrong.
    lines.push(`${label} có ${matches.length} văn bản, mình chưa rõ bạn cần bản năm nào:`);
    lines.push(...matches.slice(0, 6).map(item));
    lines.push('Nhắn số hiệu đầy đủ (vd "36/2025/TT-BKHCN") là mình nạp về ngay.');
  } else if (matches.length) {
    // NOT what was asked for. Offering a different ministry's circular as though it
    // were the requested one is the confident-wrong failure this system guards against.
    lines.push(`Mình không tìm thấy ${label} trên Công báo — có thể số hiệu chưa đúng.`);
    lines.push('Cùng số nhưng của cơ quan khác:');
    lines.push(...matches.slice(0, 4).map(item));
    lines.push('Nếu đúng là một trong số này, nhắn số hiệu đầy đủ để mình nạp.');
  } else {
    lines.push(`Mình không tìm thấy ${label} — cả trong kho lẫn trên Công báo. Bạn kiểm tra lại số hiệu giúp mình.`);
  }
  return lines.join('\n');
}

/** Reply to an accepted ingest offer. */
export function formatIngestQueued(number, alreadyQueued) {
  return alreadyQueued
    ? `⏳ ${number} đang được nạp rồi — mình nhắn lại ngay khi xong.`
    : `⏳ Đã xếp hàng nạp ${number}. Tải + tách điều khoản + embed mất vài phút; xong mình nhắn lại đây.`;
}

/** Report an ingest outcome back to the thread that asked for it. */
export function formatIngestReport(report) {
  if (report.status === 'done') {
    return `✅ Đã nạp xong ${report.number} — ${report.detail || ''}\nBạn hỏi nội dung văn bản này được rồi. Lưu ý: bản này bot tự nạp, chưa có người đối chiếu.`;
  }
  return `❌ Không nạp được ${report.number}: ${report.detail || 'không rõ lý do'}\nBạn tra trực tiếp trên congbao.chinhphu.vn giúp mình nhé.`;
}
