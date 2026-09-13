/**
 * Turning API payloads into chat messages.
 *
 * The shape of every answer is: an LLM-written LEAD (one or two natural sentences,
 * so the bot stops reading like a form letter) followed by a DETERMINISTIC BLOCK
 * built here from database values only. The split is the whole point — the prose is
 * allowed to be fluent because it is not allowed to carry facts.
 * See the no-llm-on-tariff-numbers ADR.
 */

import { cleanGazetteTitle, missingKind, ORIGIN_LABEL } from './parse.mjs';
import { L, md, toText } from './render.mjs';

const PERCENT_RE = /\d+([.,]\d+)?\s*%|phần\s*trăm/i;
const CITATION_RE = /(?:điều|khoản|điểm)\s*\d+[a-zà-ỹ]?/gi;
const HS_DOTTED_RE = /\d{4}\.\d{2}\.\d{2}/g;
const DOC_NO_RE = /\d{1,4}\s*\/\s*(?:\d{4}|vbhn)[^\s,;)]*/gi;
const HS_ANY_RE = /(?:mã|nhóm|hs)\s*(?:hs\s*)?(\d{4}(?:\.?\d{2}){0,2})(?!\d)/gi;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The gate for LLM prose. Dropped outright: a rate ("%", "phần trăm") — a percentage in
 * conversational prose is a tariff number produced by an LLM. Dropped unless the
 * deterministic block carries the same thing: a provision, an HS code in any spelling,
 * a document number. With `block === ''` every such fact is dropped, and so is "thuế suất".
 *
 * @param {string} lead   the model's text
 * @param {string} block  plain text of the deterministic reply it sits on ('' when none)
 * @param {number} max    length cap
 */
export function sanitizeLead(lead, block = '', max = 400) {
  const text = String(lead ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (PERCENT_RE.test(text)) return '';
  if (!block && /thuế suất/i.test(text)) return '';
  const low = text.toLowerCase();
  const hay = String(block ?? '').toLowerCase().replace(/\s+/g, ' ');
  // Containment is anchored on digits, so an off-by-one-digit slip is not "in the block":
  // Điều 2 ≠ Điều 25, 6/2023 ≠ 26/2023, nhóm 8180 ≠ 8481.80.99.
  const found = (re, s = hay) => new RegExp(re).test(s);
  for (const c of low.match(CITATION_RE) ?? []) if (!found(`${esc(c.replace(/\s+/g, ' '))}(?![\\da-zà-ỹ])`)) return '';
  for (const c of low.match(HS_DOTTED_RE) ?? []) if (!found(`(?<!\\d)${esc(c)}(?!\\d)`)) return '';
  const docs = hay.replace(/[.:]/g, '').replace(/\s*\/\s*/g, '/');
  for (const c of low.match(DOC_NO_RE) ?? []) if (!found(`(?<!\\d)0*${esc(c.replace(/[.:\s]/g, '').replace(/^0+/, ''))}`, docs)) return '';
  // Block HS codes as whole digit runs; a date or document number (next to "/") is not a code.
  const codes = (hay.match(/(?<![\d/])\d{4}(?:\.?\d{2}){0,3}(?![\d/])/g) ?? []).map((b) => b.replace(/\./g, ''));
  for (const [, code] of low.matchAll(HS_ANY_RE)) if (!codes.some((b) => b.startsWith(code.replace(/\./g, '')))) return '';
  return text.slice(0, max);
}

/** A gated lead as its own line above the reply; it never replaces a line of the reply. */
export function withLead(lead, lines) {
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
  // Before by_subline: a non-member origin is hidden whatever the line type, never shown its sub-line rates.
  if (p.originEligible === false) return 'false';
  if (p.type === 'by_subline') return 'bySubline';
  if (p.originEligible === null && (p.sublines ?? []).some((s) => s.originExcluded === true)) return 'subExcluded';
  if (p.originEligible === true && RATE_TYPES.has(p.type)) return 'true';
  if (p.originEligible === true && p.type === 'trq') return 'trq';
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

  // [n] in print order; the same decree keeps its number, and its label names every schedule cited from it (R10).
  const refs = [];
  const cite = (key, label, name = '') => {
    let i = refs.findIndex((x) => x.key === key);
    if (i < 0) i = refs.push({ key, label }) - 1;
    else if (name && !refs[i].label.includes(name)) refs[i].label += `; ${name}`;
    return ` [${i + 1}]`;
  };
  const dec = (v) => cite(v.decree, `NĐ ${v.decree} — ${v.scheduleName}`, v.scheduleName);

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
    // "áp" only when every row is refused or hidden; a trq, 10-digit or undetermined row can still grant a preference.
    const settled = rows.every((x) => ['false', 'excludedLine', 'excludedOrigin'].includes(x.s));
    lines.push(
      L(['Hàng hóa có mã HS ', ...hs, ' có xuất xứ ', [name, 'b'], ...has(settled ? 'áp' : 'có'), '.', ...(settled ? [] : [` Mỗi mức dưới đây ${COND}`])]),
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

// --- Legal ------------------------------------------------------------------

const EFFECT = {
  het_hieu_luc: 'hết hiệu lực',
  het_hieu_luc_mot_phan: 'hết hiệu lực một phần',
  chua_co_hieu_luc: 'chưa có hiệu lực',
};

/** A red effectiveness line, worded from the enum, never from model text (R8). */
function effectLine(c, ns = []) {
  const marks = ns.length ? `${ns.map((n) => `[${n}]`).join(' ')} ` : '';
  // Only a partial expiry leaves provisions that may still apply; a fully expired document has none.
  const tail =
    c.effectiveness === 'chua_co_hieu_luc'
      ? c.effectiveFrom ? ` (từ ${dmy(c.effectiveFrom)})` : ''
      : c.effectiveness === 'het_hieu_luc_mot_phan' ? ' — kiểm tra điều khoản còn áp dụng' : '';
  return L([`${marks}${c.documentNumber} ${EFFECT[c.effectiveness]}${tail}.`], 'red');
}

/** Machine-fetched text never quietly acquires the standing of text a person checked (R18). */
function unverifiedLines(rows) {
  const nums = [...new Set(rows.filter((c) => c.verification === 'auto_unverified').map((c) => c.documentNumber))];
  if (!nums.length) return [];
  return [
    L(
      [`${nums.join(', ')} do bot tự nạp, chưa có người đối chiếu — đọc bản gốc trước khi dùng; đã đối chiếu thì nhắn "xác nhận văn bản ${nums.length === 1 ? nums[0] : '<số hiệu>'}".`],
      'warn',
    ),
  ];
}

/**
 * The opening of a provision, cut at the first sentence or clause boundary between 140 and 480
 * characters: Vietnamese provisions put the exception after the first clause ("được miễn thuế …
 * trừ trường hợp …"), and a hard cut there can read as the opposite rule.
 */
export function excerpt(raw, min = 140, max = 480) {
  const text = String(raw ?? '').normalize('NFC').trim();
  const flat = (s) => s.replace(/\s+/g, ' ').trim();
  const whole = flat(text);
  if (whole.length <= max) return { text: whole, cut: false };
  for (const m of text.matchAll(/[.;:](?=\s)|\n(?=\s*(?:[a-zđ]\)|\d+\.)\s)/g)) {
    const head = flat(text.slice(0, m.index + (m[0] === '\n' ? 0 : 1)));
    if (head.length > max) break;
    if (head.length >= min) return { text: `${head.replace(/[.;:]$/, '')}…`, cut: true };
  }
  return { text: `${whole.slice(0, max)}…`, cut: true };
}

/**
 * "Nguồn:" block, small italic. items: { n, label, quote?, cut?, url? }. Links are de-duplicated
 * per document and capped at three. Reused by Mảng 3's formatAnswerMd.
 */
export function sourceLines(items) {
  if (!items.length) return [];
  const urls = [...new Set(items.map((x) => x.url).filter(Boolean))].slice(0, 3);
  return [
    L(['Nguồn:'], 'note'),
    ...items.map((x) => L([`[${x.n}] ${x.label}${x.quote ? ` — “${x.quote}”${x.cut ? ' (trích đoạn đầu)' : ''}` : ''}`], 'note')),
    ...(urls.length ? [L([`Toàn văn: ${urls.join(' · ')}`], 'note')] : []),
  ];
}

/** Grounded legal answer: md(prose with [n]) + effectiveness + unverified warning + every source. */
export function formatLegal(r) {
  const cites = r.citations ?? [];
  const lines = r.answer
    ? md(r.answer)
    : [L(['Mình chưa tổng hợp được câu trả lời chắc chắn; đây là các điều khoản liên quan nhất để bạn đối chiếu:'])];
  lines.push(L([]));

  // One red line per (document, effectiveness) — markers share a line only when both match.
  const groups = new Map();
  cites.forEach((c, i) => {
    if (!EFFECT[c.effectiveness]) return;
    const key = `${c.documentNumber}|${c.effectiveness}`;
    if (!groups.has(key)) groups.set(key, { c, ns: [] });
    groups.get(key).ns.push(i + 1);
  });
  for (const { c, ns } of groups.values()) lines.push(effectLine(c, ns));

  lines.push(...unverifiedLines(cites));

  const items = cites.map((c, i) => {
    const ex = excerpt(c.verbatimText);
    const late = c.effectiveTo || (c.effectiveFrom && r.asOf && c.effectiveFrom > r.asOf);
    const window =
      late && c.effectiveFrom
        ? ` · hiệu lực ${c.effectiveTo ? `${dmy(c.effectiveFrom)}–${dmy(c.effectiveTo)}` : `từ ${dmy(c.effectiveFrom)}`}`
        : '';
    return { n: i + 1, label: `${c.provisionLabel}${window}`, quote: ex.text, cut: ex.cut, url: c.gazetteUrl };
  });
  lines.push(...sourceLines(items));
  return lines;
}

/** A provision fetched by citation (no retrieval, no model in the path). */
export function formatProvisions(rows) {
  const shown = rows.slice(0, 2);
  return [
    ...shown.flatMap((p, k) => {
      const body = (p.body || '').replace(/\s+/g, ' ').trim();
      return [
        ...(k ? [L([])] : []),
        L(['Nguyên văn ', [p.citationLabel, 'b'], ':']),
        L([body.length > 1200 ? `${body.slice(0, 1200)}…` : body]),
        ...(EFFECT[p.effectiveness] ? [effectLine(p)] : []),
        ...(p.gazetteUrl ? [L([`Toàn văn: ${p.gazetteUrl}`], 'note')] : []),
      ];
    }),
    ...unverifiedLines(shown),
  ];
}

/**
 * The honest out-of-corpus answer. "We don't hold it" and "no such document" differ, and a
 * catalogue hit equal to the number asked for is that document — never "another agency's".
 */
export function formatMissingDoc(label, gazetteMatches = [], kindIn = 'none') {
  const { kind, matches } = missingKind(label, gazetteMatches, kindIn);
  const opener = (num) => L(['Mình chưa có toàn văn và tình trạng hiệu lực của ', [num, 'b'], ' nên chưa trả lời được câu này.']);
  const item = (g) => L([[g.number, 'b'], ` — ${cleanGazetteTitle(g.number, g.title)}`], 'ul');

  if (kind === 'exact' && matches[0]) {
    const hit = matches[0];
    return [
      opener(hit.number),
      L(['Công báo có văn bản này: ', [cleanGazetteTitle(hit.number, hit.title, 130), 'i'], '.']),
      ...(hit.sourceUrl ? [L([`Toàn văn: ${hit.sourceUrl}`], 'note')] : []),
      L(['Trả lời "nạp" là mình lấy toàn văn về rồi tra tiếp cho bạn (mất vài phút).']),
    ];
  }
  if (kind === 'ambiguous' && matches.length) {
    return [
      opener(label),
      L([`Công báo có ${matches.length} văn bản mang số này, bạn cần bản năm nào?`]),
      ...matches.slice(0, 6).map(item),
      L(['Nhắn số hiệu đầy đủ (ví dụ 36/2025/TT-BKHCN) là mình nạp về.']),
    ];
  }
  if (matches.length) {
    // Same serial, and the requested number is not among them (missingKind moved that case to exact).
    const hasIssuer = /\/.*\/|vbhn-/i.test(label);
    return [
      opener(label),
      L([
        hasIssuer
          ? `Công báo không có văn bản đúng số này; có ${matches.length} văn bản cùng số của cơ quan khác:`
          : `Công báo có ${matches.length} văn bản mang số này, bạn cần văn bản nào?`,
      ]),
      ...matches.slice(0, 4).map(item),
      L(['Nếu đúng là một trong số này, nhắn số hiệu đầy đủ để mình nạp.']),
    ];
  }
  return [L(['Mình không tìm thấy ', [label, 'b'], ' cả trong kho lẫn trên Công báo — bạn kiểm tra lại số hiệu giúp mình.'])];
}

/** Reply to an accepted ingest offer. */
export function formatIngestQueued(number, alreadyQueued) {
  return alreadyQueued
    ? [L([[number, 'b'], ' đang được nạp rồi — mình nhắn lại ngay khi xong.'])]
    : [L(['Đã xếp hàng nạp ', [number, 'b'], '. Tải, tách điều khoản và embed mất vài phút; xong mình nhắn lại đây.'])];
}

/** Report an ingest outcome back to the thread that asked for it. */
export function formatIngestReport(report) {
  if (report.status === 'done') {
    return [
      L([
        'Đã nạp xong ',
        [report.number, 'b'],
        `${report.detail ? ` — ${report.detail}` : ''}. Bạn hỏi nội dung văn bản này được rồi; lưu ý bản này bot tự nạp, chưa có người đối chiếu.`,
      ]),
    ];
  }
  return [L(['Không nạp được ', [report.number, 'b'], `: ${report.detail || 'không rõ lý do'}. Bạn tra trực tiếp trên congbao.chinhphu.vn giúp mình nhé.`])];
}

// --- General ------------------------------------------------------------------

/** The only capabilities the router's reply may mention, and the reply when the gate drops it. */
export const CAPABILITIES = [
  L(['Mình tra được hai việc:']),
  L([['Biểu thuế xuất nhập khẩu', 'b'], ' — gõ tên hàng hoặc mã HS, kèm xuất xứ.'], 'ol'),
  L([['Văn bản pháp luật hải quan', 'b'], ' — hỏi nội dung văn bản mình đang có; chưa có thì mình tìm trên Công báo và nạp về.'], 'ol'),
  L([['Ví dụ: "thuế nhập khẩu 8481.80.99 xuất xứ Trung Quốc"', 'i']]),
];

/** The router's free reply (intent general): gated like any LLM prose, then md() on the original text. */
export function formatGeneral(reply) {
  // sanitizeLead collapses whitespace, so it is only the gate; md() reads the original line breaks.
  return sanitizeLead(reply, '', 900) ? md(String(reply).slice(0, 900)) : CAPABILITIES;
}
