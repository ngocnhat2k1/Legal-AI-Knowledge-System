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
import { runClaude } from '../answer/claude';

/** One numbered source in the prompt: a statute article, or an evidence section with the label it must carry. */
export interface PromptSource {
  label: string;
  /** Standing the model must respect: not a legal basis, not yet in force, status undetermined. */
  note: string | null;
  text: string;
}

/** Evidence sections made the prompt several times longer; spec §3.7 gives the writing call 100 s. */
const WRITE_TIMEOUT_MS = 100_000;

export interface GenerationResult {
  answer: string;
  citations: number[]; // 1-based positions in the provision list the model says it used
  abstain: boolean;
  reason: string | null;
}

/** `facts`: statements the API established from data and the model must not contradict ("X ĐÃ HẾT HIỆU LỰC từ …"). */
export function buildPrompt(query: string, asOf: string, sources: PromptSource[], facts: string[] = []): string {
  // An article arrives as the FULL Điều, not just the matched Khoản — an enumeration question ("các trường hợp
  // miễn thuế") needs every clause of it. stdin has no arg-size limit, so whole articles are fine.
  const blocks = sources
    .map((s, i) => `[${i + 1}] ${s.label}${s.note ? `\n(${s.note})` : ''}\n${s.text}`)
    .join('\n---\n');
  return [
    'Bạn là trợ lý pháp luật Việt Nam (mọi lĩnh vực), đang nhắn tin với một chuyên viên.',
    'Trả lời câu hỏi CHỈ dựa trên các NGUỒN được cung cấp bên dưới: điều khoản văn bản, chú giải HS, chú giải chi tiết,',
    'công văn, mục tình trạng hiệu lực, bảng phụ lục, ghi chú nghiệp vụ.',
    'Tuyệt đối KHÔNG dùng kiến thức ngoài danh sách này, KHÔNG suy đoán, KHÔNG bịa số điều/khoản.',
    '- Nếu các nguồn KHÔNG đủ căn cứ để trả lời, đặt "abstain": true và để "answer" rỗng.',
    '- Nếu có mâu thuẫn giữa một "quy tắc chung" và một quy định CỤ THỂ trong nguồn được cung cấp, ưu tiên quy định cụ thể.',
    '- "citations" chỉ gồm SỐ THỨ TỰ [n] của CHÍNH các nguồn bạn dựa vào (chỉ dùng số có trong danh sách).',
    `- as-of: ${asOf} — các nguồn dưới đây đã được lọc theo hiệu lực tại ngày này.`,
    '- Dòng trong ngoặc ngay dưới tên nguồn là NHÃN của nguồn đó và phải được tôn trọng:',
    '  nguồn "không phải căn cứ pháp lý" chỉ để giải thích, không bao giờ là căn cứ duy nhất cho một khẳng định pháp lý;',
    '  nguồn "CHƯA CÓ HIỆU LỰC" phải nói rõ là chưa có hiệu lực và từ ngày nào;',
    '  nguồn "chưa xác định tình trạng" phải nói rõ là chưa xác định, không dùng làm căn cứ.',
    '- Nhãn "ĐÃ HẾT HIỆU LỰC từ <ngày>" đã được so với ngày hỏi: văn bản (hoặc phần được nêu) KHÔNG còn áp dụng.',
    '  Không bao giờ viết văn bản đó "còn hiệu lực" hay "sắp hết hiệu lực"; nói ngày hết hiệu lực và văn bản thay thế.',
    '- Mục "Tình trạng hiệu lực" nói văn bản còn áp dụng hay đã bị thay thế, bãi bỏ: nếu văn bản được hỏi đã hết hiệu lực,',
    '  nói ngay ở câu đầu, kèm văn bản thay thế và ngày.',
    '- Kết luận phân loại trong công văn chỉ áp cho đúng mặt hàng, đúng hồ sơ công văn nêu.',
    '',
    'CÁCH VIẾT (quan trọng — người đọc là đồng nghiệp, không phải máy):',
    '- Trả lời THẲNG câu hỏi ở câu đầu tiên, rồi mới giải thích và dẫn căn cứ.',
    '- Viết như đang nói chuyện: tự nhiên, không mở đầu bằng "Theo quy định của pháp luật…". Độ dài vừa với câu hỏi.',
    '- Được tổng hợp, giải thích, so sánh giữa các nguồn — miễn là mọi ý đều nằm trong nguồn.',
    '- KHÔNG lặp lại nguyên văn dài (nguyên văn đã được hiển thị riêng bên dưới câu trả lời).',
    '- Nếu các nguồn chỉ trả lời được MỘT PHẦN câu hỏi, nói rõ phần nào có căn cứ và phần nào chưa.',
    '- In **đậm** thuật ngữ, số hiệu, điều khoản, thời hạn then chốt. Dùng "- " đầu dòng CHỈ khi liệt kê các trường hợp hoặc điều kiện song song.',
    '- Đặt [n] ngay sau câu dựa vào nguồn số n; mỗi nguồn một dấu, ví dụ [1] [2].',
    '- Mọi con số, ngày, thời hạn, số hiệu, mã HS chép ĐÚNG cách nguồn viết, trong câu có [n] của nguồn đó.',
    '- Số tiền, phần trăm, ngày, thời hạn giữ nguyên cách nguồn viết, không quy đổi đơn vị: nguồn ghi 20.000.000 đồng thì không viết 20 triệu đồng.',
    '- KHÔNG màu, emoji, HTML, bảng, lời chào, lời mời hỏi thêm. Chỉ dùng "## " khi câu trả lời dài hơn 3 đoạn.',
    '',
    'Trả về JSON MỘT dòng, không kèm giải thích. Xuống dòng trong câu trả lời viết là \\n bên trong chuỗi JSON:',
    '{"answer":"<Markdown tiếng Việt, tối đa khoảng 350 từ>","citations":[<n>],"abstain":false,"reason":null}',
    '',
    ...(facts.length
      ? [`SỰ KIỆN ĐÃ XÁC ĐỊNH TỪ DỮ LIỆU, TÍNH ĐẾN NGÀY HỎI ${asOf} — câu trả lời không được mâu thuẫn:`, ...facts.map((f) => `- ${f}`), '']
      : []),
    `CÂU HỎI: ${query}`,
    '',
    'NGUỒN:',
    blocks,
  ].join('\n');
}

export async function generate(
  query: string,
  asOf: string,
  sources: PromptSource[],
  facts: string[] = [],
): Promise<GenerationResult | null> {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) return null;
  const prompt = buildPrompt(query, asOf, sources, facts);
  try {
    const res = await runClaude(prompt, { timeoutMs: WRITE_TIMEOUT_MS });
    if (!res || res.isError) {
      // The runner already logged why a null came back. An is_error result can be model prose restating the question: size only.
      console.warn(`[legal] generation failed after ${sources.length} sources: ${res ? `is_error (${res.text.length} chars)` : 'no result'}`);
      return null;
    }
    const stdout = res.text;
    const m = stdout.match(/\{[\s\S]*\}/);
    if (!m) {
      console.warn(`[legal] generation returned no JSON (${stdout.length} chars)`);
      return null;
    }
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
  } catch (e) {
    // Unparseable JSON, or no temp dir for the CLI — fall back to citations-only. Only the error goes to the log, never the prompt.
    console.warn(`[legal] generation failed after ${sources.length} sources: ${String((e as Error)?.message ?? e).slice(0, 200)}`);
    return null;
  }
}
