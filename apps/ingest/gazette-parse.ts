/**
 * Reading a Công báo listing page. Pure — no HTTP, no database — so the two things
 * that can silently corrupt the catalogue are testable:
 *
 *   - a title whose document number we misread (the number IS the lookup key), and
 *   - the clamped-page behaviour that makes a naive crawler loop forever.
 */

export interface GazetteEntry {
  congbaoId: number;
  number: string;
  title: string;
  sourceUrl: string;
}

const BASE = 'https://congbao.chinhphu.vn';

/** Strip tags and decode the entity forms Công báo actually emits. */
export function decodeTitle(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull the document number out of a listing title: "Thông tư số 33/2023/TT-BTC quy
 * định…" → "33/2023/TT-BTC". Every gazette title states it right after "số", so this
 * is a lexical read of a stated fact, not an inference.
 *
 * Returns null rather than guessing — an entry we cannot key is better dropped than
 * indexed under a number that will later match the wrong question.
 */
export function numberFromTitle(title: string): string | null {
  const m = title.match(/\bsố\s+(\d+[A-Za-zĐđ]?\/[^\s,;]+)/i);
  if (!m) return null;
  const n = m[1]!.replace(/[.,;:]+$/, '').toUpperCase();
  // Must look like a real document number: at least one more segment after the serial.
  if (!/\d\/\S/.test(n)) return null;
  // The longest genuine number on Công báo is an inter-ministerial circular naming every
  // signing agency — `05/2012/TTLT-VKSNDTC-TANDTC-BCA-BTP-BQP-BTC-BNNPTNT`, 51 chars.
  // Anything much longer is a mangled title, not a number; dropping it beats crashing the
  // crawl on a column overflow, which is exactly what an unbounded read did.
  return n.length <= 64 ? n : null;
}

/**
 * The document KIND, read from the number's own suffix rather than from the listing
 * page it was scraped from.
 *
 * The listing slug looked like the obvious source and is NOT trustworthy: deep pages of
 * `/van-ban-dang-cong-bao/thong-tu-l3/` serve entries for other kinds, which put 705
 * `…/NĐ-CP` documents into the catalogue labelled `thong_tu`. A document number states
 * its own kind — `178/2013/NĐ-CP` is a nghị định wherever it was listed — so derive it
 * from the data itself and treat the slug as a crawl route only.
 */
export function docTypeFromNumber(number: string, fallback: string): string {
  const tail = number.toUpperCase().split('/').pop() ?? '';
  if (/^VBHN/.test(tail) || /\/VBHN/.test(number.toUpperCase())) return 'vbhn';
  if (/^TTLT/.test(tail)) return 'thong_tu_lien_tich';
  if (/^TT[-\s]|^TT$/.test(tail)) return 'thong_tu';
  if (/^N[ĐD][-\s]?CP$/.test(tail)) return 'nghi_dinh';
  if (/^NQ/.test(tail)) return 'nghi_quyet';
  if (/^PL/.test(tail)) return 'phap_lenh';
  if (/^Q[ĐD]/.test(tail)) return 'quyet_dinh';
  if (/^QH\d+$/.test(tail)) return 'luat';
  if (/^UBTVQH\d+$/.test(tail)) return 'phap_lenh';
  return fallback;
}

/** Parse one listing page into entries, preserving page order and de-duplicating. */
export function parseListing(html: string): GazetteEntry[] {
  const out: GazetteEntry[] = [];
  const seen = new Set<number>();
  const re = /<a[^>]+href="(\/van-ban\/[^"]*?-(\d+)(?:\/\d+)?\.htm)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const congbaoId = Number(m[2]);
    if (!Number.isFinite(congbaoId) || seen.has(congbaoId)) continue;
    const title = decodeTitle(m[3]!);
    if (title.length < 12) continue;
    const number = numberFromTitle(title);
    if (!number) continue;
    seen.add(congbaoId);
    out.push({ congbaoId, number, title: title.slice(0, 500), sourceUrl: `${BASE}${m[1]}` });
  }
  return out;
}

/** Identity of a page's contents, for detecting the clamped repeat. */
export const pageKey = (entries: GazetteEntry[]): string => entries.map((e) => e.congbaoId).join(',');
