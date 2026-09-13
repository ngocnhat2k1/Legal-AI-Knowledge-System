/**
 * Print the bot's replies to sample questions exactly as they would be sent — text and every
 * style — without logging in to Zalo or sending anything.
 *
 *   API_URL=http://127.0.0.1:3000 node apps/zalo-bot/dry-run.mjs            # the six samples
 *   API_URL=http://127.0.0.1:3000 node apps/zalo-bot/dry-run.mjs "câu hỏi"  # your own
 *
 * Runs the production path (router → dispatch → answer → render), so the API must be reachable;
 * without CLAUDE_CODE_OAUTH_TOKEN the router falls back to the current topic (tariff).
 */
import { respond } from './index.mjs';
import { render } from './render.mjs';

const SAMPLES = [
  'Thuế nhập khẩu mã 8481.80.99 xuất xứ Trung Quốc là bao nhiêu phần trăm?',
  'Thuế nhập khẩu mã 8481.80.99 là bao nhiêu?',
  'hs code Hộp cách ly nhiễu RF',
  'Nghị định 69/2018/NĐ-CP còn áp dụng không',
  'Thời hạn nộp thuế đối với hàng hóa nhập khẩu là bao lâu?',
  'Thuế nhập khẩu 2710.12.21 ngày 2026-05-15',
];

const ctx = { topic: null, state: {}, turns: [], tariffFresh: false, tariff: null, legal: null };
const questions = process.argv.length > 2 ? process.argv.slice(2) : SAMPLES;
for (const text of questions) {
  const result = await respond({ text, image: null, quote: null, ctx, senderName: 'dry-run', threadId: 'dry-run', userId: 'dry-run' });
  const parts = render(result.text);
  console.log(`\n=== ${text}\n    intent=${result.intent} · ${parts.length} tin`);
  for (const [k, p] of parts.entries()) {
    console.log(`--- tin ${k + 1}/${parts.length} (${p.msg.length} ký tự)\n${p.msg}`);
    for (const s of p.styles) console.log(`    ${s.st.padEnd(9)} ${JSON.stringify(p.msg.slice(s.start, s.start + s.len))}`);
  }
}
