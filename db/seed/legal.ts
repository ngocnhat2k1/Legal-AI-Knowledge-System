/**
 * Legal RAG seed — loads the committed legal-prose corpus (documents, the
 * Chương/Điều/Khoản/Điểm provision tree, and pre-embedded chunks) from
 * db/seed/data/legal/ into a migrated database.
 *
 * Like the tariff seed, this only INSERTS committed extracts (produced on a macOS
 * host by research/legal-loader/{parse_provisions,embed_chunks}.py) — it does not
 * parse or embed, so it is portable and needs neither textutil nor the embedding
 * model at seed time. The BGE-M3 model is only needed to (a) regenerate the extract
 * and (b) embed queries at serving time.
 *
 * Idempotent by full reset: TRUNCATE the three legal tables (bypasses no trigger —
 * they have none), then load a clean snapshot. Provisions are inserted in document
 * order, which is topological (Chương before its Điều, Điều before its Khoản), so a
 * running key→id map resolves parent_id and the chunk→provision links.
 *
 *   DATABASE_URL=... yarn db:seed:legal          # skips if already loaded
 *   DATABASE_URL=... FORCE_RESEED=1 yarn db:seed:legal
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const sql = postgres(url, { max: 1, onnotice: () => {} });
const DATA = join(fileURLToPath(new URL('.', import.meta.url)), 'data', 'legal');
const EMBEDDER = (process.env.EMBEDDER_URL ?? '').replace(/\/$/, '');

/** Embed chunk texts via the BGE-M3 sidecar (batched). The model lives in one place. */
async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; embedId: string }> {
  const B = 32;
  const vectors: number[][] = [];
  let embedId = 'unknown';
  for (let i = 0; i < texts.length; i += B) {
    const res = await fetch(`${EMBEDDER}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: texts.slice(i, i + B) }),
    });
    if (!res.ok) throw new Error(`embedder returned ${res.status}`);
    const data = (await res.json()) as { vectors: number[][]; embed_id?: string };
    vectors.push(...data.vectors);
    if (data.embed_id) embedId = data.embed_id;
    console.log(`  … embedded ${Math.min(i + B, texts.length)}/${texts.length}`);
  }
  return { vectors, embedId };
}

interface DocRow {
  number: string;
  doc_type: string;
  title: string;
  issuing_body: string | null;
  signed_date: string | null;
  gazette_date: string | null;
  effective_from: string;
  effective_to: string | null;
  effectiveness: string;
  is_consolidated: boolean;
  consolidates: string | null;
  gazette_issue: string | null;
  source_url: string | null;
  summary: string | null;
}
interface ProvRow {
  document_number: string;
  key: string;
  parent_key: string | null;
  ptype: string;
  number: string | null;
  order_index: number;
  heading: string | null;
  body: string | null;
  path: string;
  citation_label: string;
}
interface ChunkRow {
  document_number: string;
  provision_key: string;
  article_key: string;
  sac_prefix: string | null;
  body: string;
  embed_text: string;
  effective_from: string;
  effective_to: string | null;
  effectiveness: string;
  embedding?: number[]; // present if pre-embedded on a capable host; else embedded at seed time
  embed_id?: string;
}

const readNdjson = <T>(f: string): T[] =>
  readFileSync(join(DATA, f), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);

async function main(): Promise<void> {
  console.log('db:seed:legal — legal RAG corpus\n' + '='.repeat(56));

  if (process.env.FORCE_RESEED !== '1') {
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM legal_chunk`;
    if (n > 0) {
      console.log(`  legal corpus already seeded (${n} chunks) — skipping. FORCE_RESEED=1 to reload.`);
      await sql.end({ timeout: 5 });
      return;
    }
  }

  const documents = readNdjson<DocRow>('documents.ndjson');
  const provisions = readNdjson<ProvRow>('provisions.ndjson');
  const chunks = readNdjson<ChunkRow>('chunks.ndjson');

  // Embed at seed time (chunks are committed as text). If they arrive pre-embedded
  // use those; otherwise call the BGE-M3 sidecar — the one place the model lives.
  let embedId = chunks[0]?.embed_id ?? 'unknown';
  if (chunks.length > 0 && !Array.isArray(chunks[0].embedding)) {
    if (!EMBEDDER) throw new Error('EMBEDDER_URL is not set (needed to embed the legal chunks)');
    console.log(`  embedding ${chunks.length} chunks via ${EMBEDDER} …`);
    const { vectors, embedId: id } = await embedTexts(chunks.map((c) => c.embed_text));
    chunks.forEach((c, i) => {
      c.embedding = vectors[i];
    });
    embedId = id;
  }

  await sql`TRUNCATE legal_chunk, legal_provision, legal_document RESTART IDENTITY CASCADE`;

  // --- Documents -------------------------------------------------------------
  const docId = new Map<string, number>();
  for (const d of documents) {
    const [row] = await sql`INSERT INTO legal_document ${sql({
      doc_type: d.doc_type,
      number: d.number,
      title: d.title,
      issuing_body: d.issuing_body,
      signed_date: d.signed_date,
      gazette_date: d.gazette_date,
      effective_from: d.effective_from,
      effective_to: d.effective_to,
      effectiveness: d.effectiveness,
      is_consolidated: d.is_consolidated,
      consolidates: d.consolidates,
      gazette_issue: d.gazette_issue,
      source_url: d.source_url,
      doc_summary: d.summary ? d.summary.slice(0, 200) : null,
      embed_model: embedId,
    })} RETURNING id`;
    docId.set(d.number, row.id as number);
  }
  console.log(`  + ${documents.length} legal_document`);

  // --- Provisions (document order is topological: parent before child) -------
  const provId = new Map<string, number>();
  for (const p of provisions) {
    const [row] = await sql`INSERT INTO legal_provision ${sql({
      document_id: docId.get(p.document_number)!,
      parent_id: p.parent_key ? (provId.get(p.parent_key) ?? null) : null,
      ptype: p.ptype,
      number: p.number,
      order_index: p.order_index,
      heading: p.heading,
      body: p.body,
      path: p.path,
      citation_label: p.citation_label,
    })} RETURNING id`;
    provId.set(p.key, row.id as number);
  }
  console.log(`  + ${provisions.length} legal_provision`);

  // --- Chunks (pgvector literal; keyword tsv is a generated column) -----------
  let n = 0;
  for (const c of chunks) {
    const vec = Array.isArray(c.embedding) ? `[${c.embedding.join(',')}]` : null;
    await sql`INSERT INTO legal_chunk (
      provision_id, article_provision_id, document_id, sac_prefix, body, embed_text,
      embedding, effective_from, effective_to, effectiveness
    ) VALUES (
      ${provId.get(c.provision_key)!}, ${provId.get(c.article_key)!}, ${docId.get(c.document_number)!},
      ${c.sac_prefix}, ${c.body}, ${c.embed_text},
      ${vec}::vector, ${c.effective_from}, ${c.effective_to}, ${c.effectiveness}
    )`;
    n += 1;
  }
  console.log(`  + ${n} legal_chunk (embedded)`);

  console.log('='.repeat(56) + `\nLegal seed complete: ${documents.length} docs, ${provisions.length} provisions, ${n} chunks.`);
  await sql.end({ timeout: 5 });
}

main().catch(async (e) => {
  console.error('legal seed failed:', e);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
