/**
 * Grounded answer synthesis over retrieved provisions, via the Claude Code CLI
 * (reuses the subscription — no per-token API cost, same mechanism as the Zalo
 * bot's router). This step is OPTIONAL and graceful: if the CLI/token is absent
 * (e.g. a server without the mount, or local dev) it returns null and the caller
 * falls back to returning the verbatim provisions on their own.
 *
 * The prompt is deliberately strict — answer ONLY from the supplied provisions,
 * never from the model's own legal knowledge (the "training data overrides the
 * retrieved context" failure mode), and abstain when they don't support an answer.
 */
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

import type { RetrievedArticle } from './legal.retrieval';

const run = promisify(execFile);

export interface GenerationResult {
  answer: string;
  citations: number[]; // article provision ids the model says it used
  abstain: boolean;
  reason: string | null;
}

export function buildPrompt(query: string, asOf: string, articles: RetrievedArticle[]): string {
  const blocks = articles
    .map((a) => `[id=${a.articleProvisionId}] ${a.clauseCitation}\n${a.clauseBody}`)
    .join('\n---\n');
  return [
    'Bạn là trợ lý pháp luật hải quan Việt Nam. Trả lời câu hỏi CHỈ dựa trên các ĐIỀU KHOẢN được cung cấp bên dưới.',
    'Tuyệt đối KHÔNG dùng kiến thức ngoài danh sách này, KHÔNG suy đoán, KHÔNG bịa số điều/khoản.',
    '- Nếu các điều khoản KHÔNG đủ căn cứ để trả lời, đặt "abstain": true và để "answer" rỗng.',
    '- Nếu có mâu thuẫn giữa một "quy tắc chung" và một quy định CỤ THỂ trong điều khoản được cung cấp, ưu tiên quy định cụ thể.',
    '- "citations" chỉ gồm id của CHÍNH các điều khoản bạn dựa vào (chỉ dùng id xuất hiện trong danh sách).',
    `- as-of: ${asOf} — các điều khoản dưới đây đã được lọc theo hiệu lực tại ngày này.`,
    '',
    'Trả về JSON MỘT dòng, không kèm giải thích:',
    '{"answer":"<tiếng Việt, ≤130 từ, nêu rõ điều/khoản trong câu>","citations":[<id>],"abstain":false,"reason":null}',
    '',
    `CÂU HỎI: ${query}`,
    '',
    'ĐIỀU KHOẢN:',
    blocks,
  ].join('\n');
}

export async function generate(
  query: string,
  asOf: string,
  articles: RetrievedArticle[],
): Promise<GenerationResult | null> {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) return null;
  const prompt = buildPrompt(query, asOf, articles);
  try {
    const { stdout } = await run('claude', ['-p', prompt], {
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HOME: tmpdir() },
    });
    const m = stdout.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]) as {
      answer?: unknown;
      citations?: unknown;
      abstain?: unknown;
      reason?: unknown;
    };
    const citations = Array.isArray(j.citations)
      ? j.citations.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      : [];
    return {
      answer: String(j.answer ?? '').trim(),
      citations,
      abstain: Boolean(j.abstain),
      reason: j.reason ? String(j.reason) : null,
    };
  } catch {
    return null; // CLI missing, timeout, or unparseable — fall back to citations-only.
  }
}
