/**
 * The measurement gate. One command, one baseline.
 *
 *   EVAL_API_URL=http://localhost:3000 corepack yarn eval
 *   EVAL_ANSWER_ENDPOINT=/answer …   # notebook block against POST /answer (default /legal;
 *                                    # any other value falls back to /legal)
 *
 * Every prompt change from here on is a software change and has to come through this:
 * "the answers feel better" is not a result, and the failure mode of this product is a
 * wrong answer that reads exactly like a right one. The numbers land in
 * fixtures/eval-baseline.json so a later run can be held against this one.
 *
 * Needs a running API with a seeded database. The model layer is optional — the report
 * says which mode it measured.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { evalHs } from './hs';
import { evalLegal } from './legal';
import { evalNotebook } from './notebook';
import { renderReport } from './report';

interface Health {
  db: string;
  pgvector: string | null;
  llm?: string;
}

async function main(): Promise<void> {
  const apiUrl = (process.env.EVAL_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  const health = (await fetch(`${apiUrl}/health`)
    .then((r) => r.json())
    .catch(() => null)) as Health | null;
  if (!health) {
    console.error(`Không gọi được API tại ${apiUrl}. Chạy API (và DB đã seed) rồi thử lại.`);
    process.exit(1);
  }
  console.log(`API ${apiUrl} · db=${health.db} · pgvector=${health.pgvector ?? '—'} · llm=${health.llm ?? 'không rõ'}`);
  if (health.llm !== 'up') {
    // Not fatal — retrieval and the HS numbers stay valid. But "trả lời có trích dẫn"
    // measures a different system without generation, so it must not be read as if the
    // model had been there.
    console.warn('CẢNH BÁO: tầng LLM chưa sẵn sàng — chỉ số "trả lời có trích dẫn" đang đo đường KHÔNG-LLM.');
  }

  // A typo in EVAL_ANSWER_ENDPOINT must not send requests to a wrong path — only the
  // two real shapes are accepted, anything else falls back to the default.
  const rawEndpoint = process.env.EVAL_ANSWER_ENDPOINT;
  const endpoint: '/legal' | '/answer' = rawEndpoint === '/answer' ? '/answer' : '/legal';

  const legal = await evalLegal(apiUrl);
  const hs = await evalHs(apiUrl);
  const notebook = await evalNotebook(apiUrl, endpoint);
  console.log(renderReport(legal, hs, notebook));

  const out = join(process.cwd(), 'fixtures', 'eval-baseline.json');
  const record = { at: new Date().toISOString(), api: apiUrl, llm: health.llm ?? null, legal, hs, notebook };
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Đã ghi ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
