/**
 * Pure text parsing for the Zalo bot — no I/O, no LLM, so it is unit-testable and
 * deterministic. Everything here is deliberately CONSERVATIVE: a wrong reading of
 * an origin or an HS code silently changes a tariff answer, and a wrong tariff
 * answer looks exactly like a right one.
 */

export const HS_RE = /(\d{4})[.\s]?(\d{2})[.\s]?(\d{2})/;

// Origin words STRIPPED from a product keyword (best-effort, used by keywordFrom only).
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

// Explicit UPPERCASE ISO/shorthand a user types on purpose ("8481.80.99 TQ", "… KR").
const ORIGIN_CODE = { TQ: 'CN', CN: 'CN', JP: 'JP', KR: 'KR', AU: 'AU', NZ: 'NZ', TH: 'TH', MY: 'MY', SG: 'SG', ID: 'ID', PH: 'PH', DE: 'DE', EU: 'EU', GB: 'GB', UK: 'GB', US: 'US', VN: 'VN' };

// Unambiguous country NAMES, matched on WORD BOUNDARIES. Short/ambiguous bare words are left
// out on purpose — "hàn"=hàn (weld), "anh"=anh (you), "in"=in (print), "phi"=Ø, "úc"⊂"phúc",
// "đức"=name Đức, "hàng"⊂"hàn" — a WRONG origin silently changes the FTA answer, so prefer null.
const ORIGIN_NAME = [
  ['trung quốc', 'CN'], ['trung quoc', 'CN'], ['china', 'CN'],
  ['nhật bản', 'JP'], ['nhật', 'JP'], ['japan', 'JP'],
  ['hàn quốc', 'KR'], ['korea', 'KR'],
  ['australia', 'AU'], ['new zealand', 'NZ'],
  ['thái lan', 'TH'], ['thailand', 'TH'],
  ['malaysia', 'MY'], ['mã lai', 'MY'], ['singapore', 'SG'], ['indonesia', 'ID'], ['philippines', 'PH'],
  ['germany', 'DE'], ['châu âu', 'EU'], ['ấn độ', 'IN'], ['india', 'IN'], ['anh quốc', 'GB'],
];

/**
 * Detect origin CONSERVATIVELY. Only an explicit uppercase code as a standalone token, or an
 * unambiguous country name on WORD BOUNDARIES, counts. This is why "Hàng mới" no longer reads
 * as "hàn"→KR. Miss > false hit: the LLM router also extracts origin on the non-direct path.
 */
export function detectOrigin(raw) {
  const s = String(raw || '');
  const cm = s.match(/(?<![A-Za-z0-9])(TQ|CN|JP|KR|AU|NZ|TH|MY|SG|ID|PH|DE|EU|GB|UK|US|VN)(?![A-Za-z0-9])/);
  if (cm) return ORIGIN_CODE[cm[1]];
  const low = s.toLowerCase();
  for (const [k, v] of ORIGIN_NAME) {
    if (new RegExp(`(?<![\\p{L}\\d])${k}(?![\\p{L}\\d])`, 'u').test(low)) return v;
  }
  return null;
}

/** An 8-digit HS code (with optional separators) plus any origin/date around it, or null. */
export function parseQuery(text) {
  const t = String(text || '').toLowerCase().trim();
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

/** Does this text contain an HS code at all? Used to decide whether a quoted message is a tariff answer. */
export const hasHs = (text) => HS_RE.test(String(text || ''));

/** Strip origin/date/filler from a sentence to get the product keyword ("van từ TQ" → "van"). */
export function keywordFrom(text, origin) {
  let t = String(text || '').toLowerCase().replace(/\d{4}-\d{2}-\d{2}/g, ' ');
  // Strip the origin word(s) on WORD BOUNDARIES so a match inside a real word
  // (e.g. "hàn" inside "hàng") doesn't shred the keyword.
  if (origin) {
    for (const [k, v] of Object.entries(ORIGIN)) {
      if (v === origin) t = t.replace(new RegExp(`(?<![\\p{L}\\d])${k}(?![\\p{L}\\d])`, 'gu'), ' ');
    }
  }
  for (const w of ['nhập khẩu', 'thuế suất', 'hôm nay', 'xuất xứ', 'bao nhiêu', 'là gì', 'từ ', 'nhập ', 'thuế', 'cái ', 'con ', 'chiếc ', 'ngày', 'giá', 'mã hs', ' hs ']) {
    t = t.split(w).join(' ');
  }
  return t.replace(/[?.,!:]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract a CITATION NUMBER (công văn/quyết định) from a correction, dropping the rest of the
 * free text. Only the product description + citation number is stored in the ruling note (which
 * is fuzzy-matched and echoed back across conversations), so user free text — which can carry a
 * customer's name, phone or shipment number — must never reach it.
 */
export function citationFrom(text) {
  // Deliberately does NOT accept a bare "số" — that usually precedes a phone/lot number.
  // Only an explicit DOCUMENT-KIND prefix counts, so PII cannot be mistaken for a citation.
  const m = String(text || '').match(/((?:công văn|cv|quyết định|qđ|thông báo|tb)\s*(?:số\s*)?[:.]?\s*\d[\dA-Za-z/.\-]*)/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

/** Remove the @tag spans from a message (uses mention pos/len, applied back-to-front). */
export function stripMentions(content, mentions) {
  if (!Array.isArray(mentions) || !mentions.length) return content;
  let s = content;
  for (const m of [...mentions].sort((a, b) => b.pos - a.pos)) {
    if (typeof m.pos === 'number' && typeof m.len === 'number' && m.pos >= 0 && m.pos + m.len <= s.length) {
      s = s.slice(0, m.pos) + s.slice(m.pos + m.len);
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Prepend the replied-to text as context so a follow-up question keeps its subject. */
export function mergeQuote(content, quote) {
  const q = String(quote?.msg || '').replace(/\s+/g, ' ').trim();
  if (!q) return content;
  const ctx = q.length > 600 ? q.slice(0, 600) + '…' : q;
  return `Ngữ cảnh (tin được trả lời): ${ctx}\nCâu hỏi: ${content}`.trim();
}

/**
 * A document reference the user named ("Thông tư 38/2015", "NĐ 08/2015/NĐ-CP").
 * Mirrors apps/api/src/modules/legal/legal.scope.ts — the bot needs it locally to
 * check the corpus manifest BEFORE spending a retrieval, and to say plainly that a
 * document is not held rather than answering from a different one.
 */
const DOC_TYPE_WORDS = [
  [/(thông tư|thong tu|tt)$/i, 'thong_tu'],
  [/(nghị định|nghi dinh|nđ|nd)$/i, 'nghi_dinh'],
  [/(nghị quyết|nghi quyet|nq)$/i, 'nghi_quyet'],
  [/(pháp lệnh|phap lenh|pl)$/i, 'phap_lenh'],
  [/(quyết định|quyet dinh|qđ|qd)$/i, 'quyet_dinh'],
  [/(văn bản hợp nhất|van ban hop nhat|vbhn)$/i, 'vbhn'],
  [/(luật|luat)$/i, 'luat'],
];

export function parseDocRef(raw) {
  const text = String(raw || '').normalize('NFC').trim();
  const m = text.match(/(\d{1,4})\s*\/\s*(\d{4}|vbhn(?:-[a-zà-ỹ]+)?)/i);
  if (!m) return null;
  const start = m.index ?? 0;
  const before = text.slice(0, start).replace(/\bsố\b/gi, '').trim();
  let docType = null;
  for (const [re, kind] of DOC_TYPE_WORDS) {
    if (re.test(before)) { docType = kind; break; }
  }
  const after = text.slice(start + m[0].length);
  const issuer = after.match(/^\s*\/\s*[a-zà-ỹ-]+/i)?.[0] ?? '';
  const isVbhn = /vbhn/i.test(m[2]);
  return {
    core: `${m[1]}/${m[2]}`.toUpperCase(),
    docType,
    label: (text.slice(start, start + m[0].length) + issuer).replace(/\s+/g, '').toUpperCase(),
    confident: Boolean(docType) || Boolean(issuer) || isVbhn,
  };
}

/** Does the corpus manifest hold this reference? `docs` is the /legal/documents payload. */
export function corpusHas(docs, ref) {
  if (!ref) return true;
  const heads = [ref.core, ref.core.replace(/^0+/, ''), /^\d\//.test(ref.core) ? `0${ref.core}` : ref.core];
  return (docs || []).some((d) => {
    const num = String(d.number || '').toUpperCase();
    const base = String(d.consolidates || '').toUpperCase();
    return heads.some((h) => num.startsWith(h) || (base && base.startsWith(h)));
  });
}

/**
 * Did the USER actually write this document number, or did the router invent it?
 *
 * The intent router returns `doc_number`, and the API trusts an explicit `doc=`
 * absolutely — so a fabricated one silently redirects the whole answer. Observed
 * 2026-08-14: asked "đọc lại thông tư 36 của bộ Khoa học công nghệ" (no year at all),
 * the router produced "36/2016/TT-BKHCN", copying the year from an earlier turn. The
 * bot then reported that 36/2016/TT-BKHCN does not exist and listed unrelated
 * circulars — answering a question nobody asked, about a document nobody named.
 *
 * A document number is an IDENTIFIER. The model may recognise one, never mint one:
 * the same rule that keeps tariff rates out of the model's mouth. Every digit group in
 * the number must appear as a standalone token in what the human wrote.
 */
export function docNumberStatedIn(text, number) {
  const n = String(number || '').trim();
  if (!n) return false;
  const hay = String(text || '');
  const groups = n.match(/\d+/g) ?? [];
  if (!groups.length) return false;
  // Compare without leading zeros: people write "nghị định 8/2015" for 08/2015/NĐ-CP.
  // The boundaries are digit-only, so a serial must not match inside a longer number.
  return groups.every((g) => {
    const bare = g.replace(/^0+/, '') || '0';
    return new RegExp(`(?<!\\d)0*${bare}(?!\\d)`).test(hay);
  });
}

/**
 * A Công báo title that reads as a title. Deep listing pages prefix the number to the
 * title, which already contains it, so a naive render says the number three times:
 * "36/2016/NĐ-CP — 36/2016/NĐ-CP Nghị định số 36/2016/NĐ-CP về quản lý…". Trim to the
 * subject, and cut on a word boundary — mid-word truncation ("trang thiết bị y t") is
 * most of what makes a listing feel machine-generated.
 */
export function cleanGazetteTitle(number, title, max = 90) {
  const n = String(number || '').trim();
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  if (n) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`^(?:${esc}\\s*[-—:]?\\s*)+`, 'i'), '');
    t = t.replace(
      new RegExp(`^(?:thông tư|nghị định|quyết định|nghị quyết|luật|pháp lệnh|văn bản hợp nhất)\\s*(?:liên tịch\\s*)?(?:số\\s*)?${esc}\\s*`, 'i'),
      '',
    );
  }
  t = t.replace(/^[-—:,.\s]+/, '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,.;:\s]+$/, '') + '…';
}
