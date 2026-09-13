/**
 * Turning API payloads into chat messages.
 *
 * The shape of every answer is: an LLM-written LEAD (one or two natural sentences,
 * so the bot stops reading like a form letter) followed by a DETERMINISTIC BLOCK
 * built here from database values only. The split is the whole point — the prose is
 * allowed to be fluent because it is not allowed to carry facts.
 * See the no-llm-on-tariff-numbers ADR.
 */

import { cleanGazetteTitle, ORIGIN_LABEL } from './parse.mjs';
import { L, toText } from './render.mjs';

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

/** A gated lead as its own line above the reply; it never replaces a line of the reply. */
export function withLead(lead, lines) {
  // The legal builders still return strings; this branch goes when they return Line[].
  if (typeof lines === 'string') {
    const clean = sanitizeLead(lead, lines);
    return clean ? `${clean}\n\n${lines}` : lines;
  }
  const clean = sanitizeLead(lead, toText(lines));
  return clean ? [L([clean]), L([]), ...lines] : lines;
}

/** 2026-09-13 → 13/09/2026 */
export const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

// --- Tariff -----------------------------------------------------------------

const RATE_TYPES = new Set(['ad_valorem', 'specific', 'compound']);

/** Which row of the §5b.3 table a preferential line falls in. The first match wins. */
function prefState(p) {
  if (p.type === 'excluded') return 'excludedLine';
  if (p.originExcluded === true) return 'excludedOrigin';
  if (p.type === 'by_subline') return 'bySubline';
  if (p.originEligible === null && (p.sublines ?? []).some((s) => s.originExcluded === true)) return 'subExcluded';
  if (p.originEligible === true && RATE_TYPES.has(p.type)) return 'true';
  if (p.originEligible === true && p.type === 'trq') return 'trq';
  if (p.originEligible === false) return 'false';
  return 'null';
}

/** Verdict history as one small line, or null when nobody has confirmed anything yet (R18). */
export function confirmFooter(c) {
  if (!c || !(c.correct || c.wrong || c.unsure)) return null;
  const recent = Array.isArray(c.recent) ? c.recent : [];
  const lastOf = (v) => recent.find((r) => r.verdict === v);
  const parts = [];
  if (c.correct) {
    const l = lastOf('correct');
    parts.push([`đã xác nhận đúng ${c.correct} lần${l ? ` (gần nhất: ${l.staffName})` : ''}`]);
  }
  if (c.wrong) {
    const l = lastOf('wrong');
    const who = l ? ` (${l.staffName}${l.note ? `: ${String(l.note).replace(/\s+/g, ' ').slice(0, 60)}` : ''})` : '';
    parts.push([`từng bị báo sai ${c.wrong} lần${who} — kiểm tra kỹ`, 'orange']);
  }
  if (c.unsure) parts.push([`chưa chắc ${c.unsure} lần`]);
  parts[0][0] = parts[0][0][0].toUpperCase() + parts[0][0].slice(1);
  return L([...parts.flatMap((p, k) => (k ? [' · ', p] : [p])), ' — trả lời "đúng"/"sai" để cập nhật.'], 'note');
}

/**
 * The tariff reply (spec §5b.3). Prints API fields verbatim: `rate` / `statement` are never
 * recomposed here. Colours: green only on an eligible single rate outside candidate mode;
 * red for "không được hưởng", anti-dumping and a pending extension; orange for rates that
 * depend on which 10-digit line the goods fall in; one `warn` line for the data scope.
 *
 * @param {{dotted: string, origin: string|null, date: string}} q
 * @param {object} r         TariffResponse
 * @param {object|null} confirm  verdict history from /tariff/confirmations
 * @param {{showFooter?: boolean, candidate?: boolean}} opts  candidate: the code is not settled (R2)
 */
export function formatAnswer(q, r, confirm, { showFooter = true, candidate = false } = {}) {
  const origin = r.origin ?? q.origin ?? null;
  const name = origin ? (ORIGIN_LABEL[origin] ?? origin) : null;
  const verified = Boolean(r.ftaMembership);
  const date = dmy(r.date ?? q.date);

  // [n] in print order; the same source keeps its number.
  const refs = [];
  const cite = (key, label) => {
    let i = refs.findIndex((x) => x.key === key);
    if (i < 0) i = refs.push({ key, label }) - 1;
    return ` [${i + 1}]`;
  };
  const dec = (v) => cite(v.decree, `NĐ ${v.decree} — ${v.scheduleName}`);

  const mfn = r.import?.mfn ?? null;
  const heading = r.goods?.heading ? cleanGazetteTitle('', r.goods.heading, 45) : '';
  const hs = [[q.dotted, 'b'], ...(heading ? [' (', [heading, 'i'], ')'] : [])];
  const mfnRate = (verb = '') =>
    mfn
      ? ['thuế nhập khẩu ưu đãi thông thường (', ['MFN', 'b'], `) ${verb}`, [mfn.statement, 'b'], dec(mfn)]
      : [`chưa có dòng MFN tại ngày ${date}`];
  const has = (verb) => (mfn ? [` ${verb} `, ...mfnRate()] : [' ', ...mfnRate()]);

  const sched = (p) => `${p.schedule}${p.form ? ` (form ${p.form})` : ''}`;
  const refused = (p, why) => L([[sched(p), 'b'], ': ', ['không được hưởng', 'red'], ` — ${why}`, dec(p)]);
  const compact = (p) =>
    L(
      [
        `${sched(p)}: `,
        [p.rate, 'b'],
        dec(p),
        p.originExcluded === null && p.excludedOrigins?.length
          ? ` — trừ hàng xuất xứ ${p.excludedOrigins.join(', ')} (NĐ ${p.decree} loại trừ ở dòng này)`
          : '',
      ],
      'ul',
    );
  const row = (p, state) => {
    switch (state) {
      case 'excludedLine':
        return [refused(p, 'dòng này bị loại khỏi biểu')];
      case 'excludedOrigin':
        return [refused(p, `NĐ ${p.decree} loại trừ hàng xuất xứ ${name} ở dòng này`)];
      case 'bySubline':
        return [
          L([`${sched(p)}: `, ['mức theo dòng 10 số — đối chiếu dòng của hàng', 'orange'], dec(p)], 'ul'),
          ...(p.sublines ?? []).map((s) =>
            L([
              `${s.codeDotted} ${s.desc}: `,
              s.type === 'excluded' || s.originExcluded === true
                ? ['không được hưởng', 'red']
                : s.percent == null
                  ? ['không rõ mức — đối chiếu nghị định', 'orange'] // malformed jsonb: never "null%" or 0%
                  : [`${s.percent}%`, 'b'],
            ]),
          ),
        ];
      case 'subExcluded': {
        const codes = p.sublines.filter((s) => s.originExcluded === true).map((s) => s.codeDotted).join(', ');
        return [
          L(
            [`${sched(p)}: `, [p.rate, 'b', 'orange'], dec(p), ` — riêng dòng 10 số ${codes} không áp dụng cho xuất xứ ${name}; đối chiếu dòng của hàng`],
            'ul',
          ),
        ];
      }
      case 'true':
        // The only green in the bot: a verified member origin, not excluded, one rate for the whole 8-digit line.
        return candidate
          ? [compact(p)]
          : [L([[`Có C/O${p.form ? ` form ${p.form}` : ''} hợp lệ (${p.schedule})`, 'b'], ': thuế nhập khẩu ưu đãi đặc biệt ', [p.rate, 'b', 'green'], dec(p)], 'ul')];
      default:
        return [compact(p)]; // trq, null, and false in candidate / unfiltered modes
    }
  };

  const rows = (r.import?.preferential ?? []).map((p) => ({ p, s: prefState(p) }));
  const pick = (...states) => rows.filter((x) => states.includes(x.s)).flatMap((x) => row(x.p, x.s));
  const all = () => rows.flatMap((x) => row(x.p, x.s));
  const unknown = () => (rows.some((x) => x.s === 'null') ? [L(['Biểu chưa xác định được theo xuất xứ:']), ...pick('null')] : []);
  const hidden = rows.filter((x) => x.s === 'false').map((x) => x.p.schedule);
  const COND = 'chỉ áp dụng khi hàng có xuất xứ từ nước thành viên và có C/O hợp lệ đúng form:';

  const lines = [];
  if (candidate) {
    lines.push(L(['Nếu hàng thuộc mã ', ...hs, ', ', ...mfnRate('là '), rows.length ? `; mức FTA dưới đây ${COND}` : '.']), ...all());
  } else if (!origin || !verified) {
    const second = !rows.length
      ? []
      : !origin
        ? [` Mức ưu đãi đặc biệt theo FTA ${COND}`]
        : [' Mình chưa lọc được các biểu FTA theo xuất xứ ', [name, 'b'], `; mỗi mức dưới đây ${COND}`];
    lines.push(L(['Hàng hóa có mã HS ', ...hs, ...has('có'), '.', ...second]), ...all());
  } else if (rows.some((x) => x.s === 'true')) {
    lines.push(
      L(['Đối với hàng hóa có mã HS ', ...hs, ' có xuất xứ ', [name, 'b'], ', mức thuế nhập khẩu phụ thuộc vào việc có C/O ưu đãi hợp lệ hay không:']),
      ...pick('true'),
      ...pick('excludedLine', 'excludedOrigin'),
      L([['Không có C/O ưu đãi hợp lệ', 'b'], ': ', ...mfnRate()], 'ul'),
      ...pick('trq', 'bySubline', 'subExcluded'),
      ...unknown(),
    );
    if (hidden.length) {
      lines.push(L([`Đã ẩn ${hidden.join(', ')} vì ${name} không có trong danh sách nước thành viên đã xác nhận; nếu nước xuất xứ khác nước gửi hàng, nhắn tên nước xuất xứ.`], 'note'));
    }
  } else {
    lines.push(
      L(['Hàng hóa có mã HS ', ...hs, ' có xuất xứ ', [name, 'b'], ...has('áp'), '.']),
      ...pick('excludedLine', 'excludedOrigin'),
      ...pick('trq', 'bySubline', 'subExcluded'),
      ...unknown(),
    );
    if (hidden.length) {
      lines.push(L([`Các biểu FTA đã nạp khác (${hidden.join(', ')}) không áp dụng cho xuất xứ này; các hiệp định khác chưa được nạp. Nếu nước xuất xứ khác nước gửi hàng, nhắn tên nước xuất xứ.`]));
    }
  }

  const oq = r.import?.outOfQuota;
  if (oq) lines.push(L(['Ngoài hạn ngạch: ', [oq.statement, 'b'], dec(oq)]));
  if (r.export) lines.push(L(['Thuế xuất khẩu: ', [r.export.statement, 'b'], dec(r.export)]));
  for (const c of r.antiDumping ?? []) {
    lines.push(L([[c.statement, 'b'], ` — theo ${c.decisionNumber}`, cite(c.decisionNumber, `${c.decisionNumber} — thuế chống bán phá giá`)], 'red'));
  }
  if (r.staleness?.pendingExtension) lines.push(L([r.staleness.pendingExtension], 'red'));
  for (const n of r.notes ?? []) lines.push(L([`Lưu ý: ${n}`], 'note'));

  lines.push(L([]));
  if (r.staleness?.warning) lines.push(L([r.staleness.warning], 'warn'));
  const unloaded = r.staleness?.unloadedInstruments ?? [];
  const sources = [
    `Tra theo ngày ${date}`,
    ...refs.map((x, i) => `[${i + 1}] ${x.label}`),
    ...(unloaded.length ? [`Chưa nạp: ${unloaded.map((u) => `NĐ ${u}`).join(', ')}`] : []),
  ];
  lines.push(L([sources.join(' · ')], 'note'));

  const history = confirmFooter(confirm);
  if (history) {
    lines.push(history);
  } else if (showFooter) {
    // Suggest only what the bot can do now; an origin changes nothing until the membership table is signed.
    const hint = !verified ? '' : origin ? 'Muốn xem xuất xứ khác, nhắn tên nước; ' : 'Cho mình biết xuất xứ để lọc đúng biểu ưu đãi; ';
    const sentence = `${hint}mã đúng với lô hàng thì trả lời "đúng", chưa đúng thì trả lời "sai" hoặc gửi mã đúng.`;
    lines.push(L([[sentence[0].toUpperCase() + sentence.slice(1), 'i']]));
  }
  return lines;
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
