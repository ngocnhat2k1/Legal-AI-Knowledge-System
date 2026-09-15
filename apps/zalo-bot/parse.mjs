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

/** Display names for origin codes. For printing only — never used to READ an origin. */
export const ORIGIN_LABEL = {
  CN: 'Trung Quốc', JP: 'Nhật Bản', KR: 'Hàn Quốc', AU: 'Úc', NZ: 'New Zealand', TH: 'Thái Lan', MY: 'Malaysia',
  SG: 'Singapore', ID: 'Indonesia', PH: 'Philippines', DE: 'Đức', EU: 'EU', GB: 'Anh', US: 'Hoa Kỳ', VN: 'Việt Nam', IN: 'Ấn Độ',
};

// Unambiguous country NAMES, matched on WORD BOUNDARIES. Short/ambiguous bare words are left
// out on purpose — "hàn"=hàn (weld), "anh"=anh (you), "in"=in (print), "phi"=Ø, "úc"⊂"phúc",
// "đức"=name Đức, "hàng"⊂"hàn" — a WRONG origin silently changes the FTA answer, so prefer null.
const ORIGIN_NAME = [
  // "tq" is no Vietnamese word, and a bare lookup is typed "thue nk 84818099 tq" as often as with "TQ".
  ['trung quốc', 'CN'], ['trung quoc', 'CN'], ['china', 'CN'], ['tq', 'CN'],
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

/** Today's date in Vietnam (yyyy-mm-dd): the UTC date is the previous day until 07:00. */
export const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

/** An 8-digit HS code (with optional separators) plus any origin/date around it, or null. */
export function parseQuery(text) {
  const t = String(text || '').toLowerCase().trim();
  const m = t.match(HS_RE);
  if (!m) return null;
  const dm = t.match(/(\d{4}-\d{2}-\d{2})/);
  return {
    hs: m[1] + m[2] + m[3],
    // detectOrigin reads codes typed in capitals ("TQ", "CN"), so it gets the text as typed, not lowercased.
    origin: detectOrigin(String(text || '')),
    date: dm ? dm[1] : todayVN(),
    dotted: `${m[1]}.${m[2]}.${m[3]}`,
  };
}

/** Does this text contain an HS code at all? Used to decide whether a quoted message is a tariff answer. */
export const hasHs = (text) => HS_RE.test(String(text || ''));

/**
 * The code, origin and date a quoted tariff reply was looked up with. Reads only the first line naming a
 * code (the lead): the rows and sources name schedules such as "ASEAN–Trung Quốc (ACFTA)", which are not
 * origins, and neither is a country inside the bracketed heading ("Chè xanh kiểu Nhật Bản"). A bracket
 * opening with "xuất xứ" is the bot's own "(xuất xứ CN, ngày …)" and stays. The date comes back from
 * "Tra theo ngày dd/mm/yyyy".
 */
export function parseQuotedTariff(text) {
  const s = String(text || '');
  const q = parseQuery(s.split('\n').find(hasHs)?.replace(/\((?!xuất xứ)(?:[^()]|\([^()]*\))*\)/g, ''));
  // A quoted confirm ("… (xuất xứ CN, ngày dd/mm/yyyy). Cảm ơn …") carries the date only there.
  const d = s.match(/Tra theo ngày (\d{2})\/(\d{2})\/(\d{4})/) ?? s.match(/ngày (\d{2})\/(\d{2})\/(\d{4})\)\. Cảm ơn/);
  if (q && d) q.date = `${d[3]}-${d[2]}-${d[1]}`;
  return q;
}

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

/** The API's foldDocNumber (legal.scope.ts): NFC, no whitespace, upper case, Đ → D, no leading zeros. */
const foldDocNumber = (s) =>
  String(s ?? '').normalize('NFC').replace(/\s+/g, '').toUpperCase().replace(/Đ/g, 'D').replace(/^0+(?=\d)/, '');

/** Same document number? `08/2015/NĐ-CP` ≡ `8/2015/ND-CP`; `69/2018/TT-BTC` ≠ `69/2018/NĐ-CP`. */
export function sameDocNumber(a, b) {
  const x = foldDocNumber(a);
  return x !== '' && x === foldDocNumber(b);
}

/**
 * Never present the number asked for as a different document: a `similar`/`ambiguous` catalogue
 * hit equal to `label` IS the document, so it becomes `exact` (and can be offered for ingest).
 */
export function missingKind(label, matches = [], kind = 'none') {
  const list = matches || [];
  if (kind === 'similar' || kind === 'ambiguous') {
    const same = list.find((g) => sameDocNumber(label, g.number));
    if (same) return { kind: 'exact', matches: [same] };
  }
  return { kind, matches: list };
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
 * The router's number with its issuer only when the user wrote that issuer, else serial/year. The API
 * matches a full number exactly, so a guessed issuer ("Thông tư 39/2018" → 39/2018/TT-BNNPTNT) would
 * report a document we hold as missing.
 */
export function statedDocNumber(text, number) {
  const parts = String(number || '').split('/');
  return foldDocNumber(text).includes(foldDocNumber(parts.slice(2).join('/'))) ? number : parts.slice(0, 2).join('/');
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
