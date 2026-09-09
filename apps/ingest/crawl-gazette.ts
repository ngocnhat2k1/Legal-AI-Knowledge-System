/**
 * Build the Công báo catalogue — what legal documents EXIST, so the bot can answer
 * "that document is real, here is its title, date and gazette link, I just don't hold
 * its full text" instead of shrugging. Populates `gazette_document`.
 *
 * This only copies metadata the gazette publishes about itself. It does NOT fetch,
 * parse or interpret document text — that is the on-request ingest (Phase 7 layer 2),
 * which carries the effectiveness risk this job does not.
 *
 *   DATABASE_URL=… yarn gazette:index          # incremental: newest pages until all-known
 *   DATABASE_URL=… FULL=1 yarn gazette:index   # first run: walk every type to the end
 *
 * See .agent/docs/legal-corpus-self-extension.md.
 */
import postgres from 'postgres';

import { docTypeFromNumber, type GazetteEntry, pageKey, parseListing } from './gazette-parse';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });

const FULL = process.env.FULL === '1';
/** Politeness delay between page fetches. The gazette is a public service, not a target. */
const DELAY_MS = Number(process.env.CRAWL_DELAY_MS ?? 900);
/** Runaway guard. Measured 2026-08-14: thông tư ≈940 pages, the deepest type. */
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 1200);
const UA = 'Mozilla/5.0 (compatible; CustomsAssistant/1.0; +internal tool)';

/** Listing slug → the doc_type we store. Only VBQPPL kinds; công văn/thông báo are out of scope. */
const TYPES: Array<[slug: string, docType: string]> = [
  ['luat-l13', 'luat'],
  ['phap-lenh-l14', 'phap_lenh'],
  ['nghi-dinh-l1', 'nghi_dinh'],
  ['nghi-quyet-l6', 'nghi_quyet'],
  ['thong-tu-l3', 'thong_tu'],
  ['thong-tu-lien-tich-l5', 'thong_tu_lien_tich'],
  ['quyet-dinh-l2', 'quyet_dinh'],
  ['van-ban-hop-nhat-l7', 'vbhn'],
];

const BASE = 'https://congbao.chinhphu.vn';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(slug: string, page: number): Promise<GazetteEntry[]> {
  const target = `${BASE}/van-ban-dang-cong-bao/${slug}/trang-${page}.htm`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(target, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseListing(await res.text());
    } catch (e) {
      if (attempt === 3) {
        console.warn(`  ! ${slug} trang ${page}: ${(e as Error).message} — bỏ qua`);
        return [];
      }
      await sleep(2000 * attempt);
    }
  }
  return [];
}

async function upsert(entries: GazetteEntry[], docType: string): Promise<number> {
  if (!entries.length) return 0;
  const rows = await sql`
    INSERT INTO gazette_document ${sql(
      entries.map((e) => ({
        congbao_id: e.congbaoId,
        number: e.number,
        // The number states its own kind; the listing slug is only how we got here.
        doc_type: docTypeFromNumber(e.number, docType),
        title: e.title,
        source_url: e.sourceUrl,
      })),
    )}
    ON CONFLICT (congbao_id) DO UPDATE
      SET number = EXCLUDED.number, title = EXCLUDED.title,
          doc_type = EXCLUDED.doc_type, source_url = EXCLUDED.source_url
    RETURNING (xmax = 0) AS inserted
  `;
  return rows.filter((r) => r.inserted).length;
}

async function crawlType(slug: string, docType: string): Promise<{ pages: number; added: number }> {
  let added = 0;
  let page = 1;
  let prevKey = '';
  for (; page <= MAX_PAGES; page++) {
    const entries = await fetchPage(slug, page);
    if (!entries.length) break;

    // THE STOP CONDITION. An out-of-range page is NOT empty and does NOT 404 — the
    // gazette CLAMPS to the last real page and serves it again (verified 2026-08-14:
    // luat-l13/trang-4000 is byte-identical to trang-570). Stopping on "empty page"
    // would loop until MAX_PAGES re-inserting the tail; stop on "same ids as last page".
    const key = pageKey(entries);
    if (key === prevKey) {
      page -= 1; // that page was a repeat, not real
      break;
    }
    prevKey = key;

    const newRows = await upsert(entries, docType);
    added += newRows;

    // Listings run newest-id-first, so in incremental mode a page where nothing is new
    // means everything older is already indexed.
    if (!FULL && newRows === 0 && page > 1) break;

    if (page % 25 === 0) console.log(`  … ${slug} trang ${page}, +${added} mới`);
    await sleep(DELAY_MS);
  }
  return { pages: page, added };
}

async function main(): Promise<void> {
  console.log(`Chỉ mục Công báo — chế độ ${FULL ? 'ĐẦY ĐỦ' : 'incremental'}, nghỉ ${DELAY_MS}ms/trang`);
  let total = 0;
  for (const [slug, docType] of TYPES) {
    const { pages, added } = await crawlType(slug, docType);
    total += added;
    console.log(`${docType.padEnd(20)} ${String(pages).padStart(4)} trang · +${added} văn bản mới`);
  }
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM gazette_document`;
  console.log(`\nXong: +${total} mới, chỉ mục hiện có ${count} văn bản.`);
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error('Crawl thất bại:', e);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
