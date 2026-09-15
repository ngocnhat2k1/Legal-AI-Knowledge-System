/**
 * Print the bot's replies to whole conversations exactly as they would be sent — text, message count, time — without
 * logging in to Zalo and without writing anything: verdicts, ingest requests and conversation turns are recorded here,
 * never sent. Conversation memory lives in this process, so a follow-up turn sees the earlier ones.
 *
 *   API_URL=http://127.0.0.1:3000 node apps/zalo-bot/dry-run.mjs                     # the sample questions
 *   API_URL=http://127.0.0.1:3000 node apps/zalo-bot/dry-run.mjs "câu hỏi" …          # one-turn threads
 *   API_URL=http://127.0.0.1:3000 node apps/zalo-bot/dry-run.mjs --stdin < threads.json   # [{thread, turns: ["…"]}]
 *   add --styles to print every style span
 *
 * Runs the production path (dispatch → POST /answer → answer → render), so the API must be reachable.
 */
import { pathToFileURL } from 'node:url';

import { render } from './render.mjs';

const SAMPLES = [
  'Thuế nhập khẩu mã 8481.80.99 xuất xứ Trung Quốc là bao nhiêu phần trăm?',
  'Thuế nhập khẩu mã 8481.80.99 là bao nhiêu?',
  'hs code Hộp cách ly nhiễu RF',
  'Nghị định 69/2018/NĐ-CP còn áp dụng không',
  'Thời hạn nộp thuế đối với hàng hóa nhập khẩu là bao lâu?',
  'Thuế nhập khẩu 2710.12.21 ngày 2026-05-15',
];

/**
 * Fixed sentences of the template-built replies. Việc 13 deleted the template layer for typed messages, so what is left here
 * can only come from the PHOTO path (`tariffByClues` in answer.mjs) and the first-lookup confirm invite: the metric now
 * measures how much of a photo answer is still stitched from fixed sentences. Six strings no code can produce went with the
 * layer — counting them would report a zero the code never earned.
 */
export const TEMPLATE_STRINGS = [
  'Với mô tả',
  'trả lời "đúng"',
  'Chốt mã đúng',
  'Mặt hàng có thể thuộc nhiều nhóm',
];

export const templateHits = (text) => TEMPLATE_STRINGS.reduce((n, s) => n + String(text ?? '').split(s).length - 1, 0);

/** Conversation memory of the API, in this process: what /conversation would return and store. */
export function createMemory() {
  const threads = new Map();
  const of = (id) => threads.get(id) ?? threads.set(id, { topic: null, state: {}, turns: [] }).get(id);
  return {
    writes: [],
    view: (id, limit = 8) => {
      const t = of(id);
      return { topic: t.topic, state: t.state, turns: t.turns.slice(-limit), idleSeconds: 0, staffName: 'dry-run' };
    },
    save: (payload) => {
      const t = of(payload.threadId);
      t.turns = [...t.turns, ...(payload.turns ?? [])].slice(-20);
      if ('topic' in payload) t.topic = payload.topic;
      if ('state' in payload) t.state = payload.state;
    },
  };
}

const WRITES = ['/tariff/confirm', '/ingest/request', '/ingest/verify', '/ingest/reports/ack'];

/** A fetch that serves conversation memory from `memory` and records every write instead of sending it. */
export function recordingFetch(realFetch, memory) {
  const reply = (body) => ({ ok: true, status: 200, json: async () => body });
  return async (url, init = {}) => {
    const u = new URL(String(url));
    const method = String(init.method || 'GET').toUpperCase();
    if (u.pathname === '/conversation' && method === 'GET') {
      return reply(memory.view(u.searchParams.get('threadId'), Number(u.searchParams.get('limit')) || 8));
    }
    if (u.pathname === '/conversation/turn' && method === 'POST') {
      memory.save(JSON.parse(init.body || '{}'));
      return reply({});
    }
    if (method !== 'GET' && WRITES.includes(u.pathname)) {
      memory.writes.push({ path: u.pathname, body: JSON.parse(init.body || '{}') });
      return reply({});
    }
    return realFetch(url, init);
  };
}

async function readStdin() {
  let s = '';
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

async function main() {
  const args = process.argv.slice(2);
  const showStyles = args.includes('--styles');
  const questions = args.filter((a) => !a.startsWith('--'));
  const threads = args.includes('--stdin')
    ? JSON.parse(await readStdin())
    : (questions.length ? questions : SAMPLES).map((q, i) => ({ thread: `q${i + 1}`, turns: [q] }));

  const memory = createMemory();
  globalThis.fetch = recordingFetch(globalThis.fetch, memory);
  // Imported after fetch is wrapped, so no module captures the real one first.
  const { respond } = await import('./index.mjs');
  const { loadContext, nextState, saveContext } = await import('./conversation.mjs');

  for (const { thread, turns } of threads) {
    for (const text of turns) {
      const ctx = await loadContext(thread, 'dry-run');
      const writesBefore = memory.writes.length;
      const notices = [];
      const started = Date.now();
      const result = await respond({
        text, image: null, quote: null, ctx, senderName: 'dry-run', threadId: thread, userId: 'dry-run',
        notify: async (msg) => notices.push(msg),
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const parts = render(result.text);
      const botText = parts.map((p) => p.msg).join('\n\n');

      // As index.mjs does after answering: keep what the next turn may point at.
      const state = nextState(ctx.state, result);
      await saveContext({ threadId: thread, userId: 'dry-run', staffName: 'dry-run', userText: text, botText, intent: result.intent, topic: result.topic ?? ctx.topic ?? null, state });

      const chars = parts.reduce((n, p) => n + p.msg.length, 0);
      const hits = templateHits([...notices, botText].join('\n'));
      console.log(`\n=== [${thread}] ${text}\n    intent=${result.intent} · ${parts.length} tin · ${chars} ký tự · ${seconds}s · templateHits=${hits} · trailWrites=${memory.writes.length - writesBefore}`);
      for (const n of notices) console.log(`--- báo trước\n${n}`);
      for (const [k, p] of parts.entries()) {
        console.log(`--- tin ${k + 1}/${parts.length} (${p.msg.length} ký tự)\n${p.msg}`);
        if (showStyles) for (const s of p.styles) console.log(`    ${s.st.padEnd(9)} ${JSON.stringify(p.msg.slice(s.start, s.start + s.len))}`);
      }
    }
  }
  if (memory.writes.length) console.log(`\n=== ghi sổ bị chặn: ${JSON.stringify(memory.writes)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
