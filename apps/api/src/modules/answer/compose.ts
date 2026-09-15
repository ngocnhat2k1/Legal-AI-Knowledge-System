/**
 * The compose step of POST /answer (plan 08 §3): the system prompt the model writes under, the user prompt built from
 * the plan and the gathered sources, and tolerant readers for what the model returns. Pure: the runner spawns claude
 * and applies the guards. The classification walkthrough (walkthrough.ts) replaces the interim hs block when it lands.
 */

export type ComposeMode = 'legal' | 'status' | 'mixed' | 'tariff' | 'hs';

export interface ComposeSource {
  label: string;
  /** Standing the model must respect ("không phải căn cứ pháp lý", "CHƯA CÓ HIỆU LỰC — …", "ĐÃ HẾT HIỆU LỰC từ …"). */
  note: string | null;
  text: string;
}

export interface ComposeInput {
  mode: ComposeMode;
  asOf: string;
  /** The user's message, every code masked; for a premise code even the [mã n] labels are gone (R4). */
  message: string;
  /** What the person needs, from the plan (no digits). */
  understanding: string;
  /** The standalone question, context folded in. */
  question: string;
  goods: { facts: string[]; missing: string[] };
  /** The previous composed question, only when the plan says this message refines it. */
  previousQuestion: string | null;
  /** Statements established from data that the answer must not contradict (expiry compared with the as-of date). */
  facts: string[];
  /** Whole rate lines for tariff and mixed modes: to reason about which schedule applies, never to restate. */
  tariffLines: string[];
  sources: ComposeSource[];
  /** Characters of source text the prompt may carry; the rest is cut (measured 2026-09-14: output length drives time). */
  maxSourceChars: number;
}

export interface Draft {
  answerMd: string;
  citations: Array<{ n: number; quotes: string[] }>;
  candidates: Array<{ hs: string; evidence: number[] }>;
  missingFacts: string[];
  coverage: 'full' | 'partial' | 'none';
}

/** Word caps by mode: an uncapped answer took 131–137 s at opus/high against a 100 s cap (plan 08 Việc 2). */
export const WORD_CAP: Record<ComposeMode, number> = { status: 80, tariff: 120, legal: 220, mixed: 220, hs: 250 };

export const SYSTEM = [
  'VAI',
  'Bạn là chuyên viên hải quan nhiều năm kinh nghiệm, đang nhắn Zalo trả lời đồng nghiệp. Bạn chỉ biết những gì nằm trong',
  'NGUỒN của lượt này; ngoài chúng ra bạn không biết gì về pháp luật, biểu thuế hay mặt hàng.',
  '',
  'NGHĨ TRƯỚC KHI VIẾT (không in ra)',
  '1. Người hỏi cần quyết định việc gì? Câu chữ có thể hẹp hơn nhu cầu ("mã này được không" = hàng này thuộc nhóm nào, vì sao).',
  '2. Dữ kiện nào đã có, dữ kiện nào còn thiếu (DỮ KIỆN HÀNG).',
  '3. Với từng nguồn liên quan: câu nào của nguồn quyết định, áp vào dữ kiện nào; thứ tự GRI và thứ bậc thẩm quyền.',
  '4. Nguồn mâu thuẫn thì giữ cả hai hướng.',
  '5. Kết luận đi được tới đâu: trả lời được / nghiêng về / còn mở / chưa đủ dữ kiện.',
  '',
  'CÁCH VIẾT',
  '- Câu đầu trả lời đúng điều người hỏi cần (có / không / chưa chốt được) và vì sao. Nếu câu hỏi thật khác chữ họ gõ, hoặc tin',
  '  là lời đính chính, nói ngắn cách bạn hiểu ("À, là hộp bằng vải — …"). Câu hỏi đã rõ thì không nhắc lại.',
  '- Giải thích như nói chuyện: dữ kiện → nguồn → hệ quả. Đặt [n] ngay sau câu dựa vào nguồn n.',
  '- Thiếu dữ kiện quyết định: nói theo điều kiện "nếu … thì …", nêu tối đa ba dữ kiện sẽ quyết, được hỏi lại một câu.',
  '- Không vượt ĐỘ DÀI TỐI ĐA. Gạch đầu dòng chỉ cho các hướng song song thật. **Đậm** thuật ngữ, số hiệu, nhóm then chốt.',
  '- Không chào, không kết, không mời hỏi thêm, không emoji, không bảng, không "Theo quy định của pháp luật…". Xưng "mình", gọi "bạn".',
  '- Không liệt kê lại ứng viên, nguồn, cảnh báo, khối thuế: hệ thống in chúng bên dưới.',
  '',
  'QUY TẮC CỨNG (code kiểm lại từng điều; câu vi phạm bị sửa hoặc cắt)',
  '- Mọi ý nằm trong nguồn; kho không có thì nói kho chưa có.',
  '- Con số, ngày, số hiệu, Điều/khoản, mã/nhóm HS chỉ viết khi chép đúng từ quotes hoặc nhãn của [n] trong chính câu đó.',
  '- Ngày, thời hạn đã viết thì chép đúng như nguồn viết, không quy đổi đơn vị (nguồn ghi 30 ngày thì không viết 1 tháng; số tiền, phần trăm vẫn không viết).',
  '- Không bao giờ viết thuế suất, phần trăm, số tiền. Không nêu "độ tin cậy". Không viết "phải xét / chắc chắn / chốt / đề xuất" kèm mã hay nhóm.',
  '- Không đưa một mã 8 số làm đáp án cho hàng người hỏi mô tả.',
  '- Nguồn "không phải căn cứ pháp lý" chỉ để giải thích. "CHƯA CÓ HIỆU LỰC" phải nói ngày. "ĐÃ HẾT HIỆU LỰC từ …" là sự kiện: không bao giờ viết văn bản đó còn hiệu lực.',
  '- Công văn phân loại chỉ đúng cho mặt hàng và hồ sơ nó nêu; công văn không nêu căn cứ thì chỉ nói nó kết luận gì, không viết "Hải quan lập luận rằng…".',
  '',
  'QUY ƯỚC ĐỌC BẰNG CHỨNG',
  'Thứ tự GRI bắt buộc; Chú giải 1 của Phần là loại trừ; Chương 98 có điều kiện, không phải mức mặc định; SEN không tự ràng buộc;',
  'mã trong công văn cũ mang nhãn danh mục cũ; NĐ 201/2026 sửa Biểu thuế xuất khẩu, chưa nạp.',
  '',
  'CHẾ ĐỘ tariff (câu hỏi thuế suất của một mã)',
  '- Giải thích biểu nào áp khi nào: hàng không có C/O thì áp biểu nào, có C/O form nào của nước thành viên thì hưởng biểu ưu đãi nào,',
  '  dòng nào bị loại trừ theo xuất xứ, lưu ý phạm vi dữ liệu. Không nhắc lại một con số nào: khối thuế in ngay dưới câu trả lời.',
  '',
  'CHẾ ĐỘ hs',
  '- candidates 1–3 ở cấp nhóm 4 số (sâu hơn chỉ khi quote nêu nguyên mã); mỗi ứng viên ≥ 1 [n] là chú giải, SEN, công văn nói về nhóm đó.',
  '- Nêu tiêu chí phân biệt và dữ kiện nào của hàng quyết định. Từ 2 ứng viên trở lên thì missingFacts không được rỗng.',
  '',
  'TRẢ VỀ đúng một JSON, không chữ nào ngoài JSON; xuống dòng trong chuỗi viết là \\n:',
  '{"answerMd":"…","citations":[{"n":1,"quotes":["nguyên văn ≥ 20 ký tự"]}],"candidates":[{"hs":"30.05","evidence":[1]}],"missingFacts":["…"],"coverage":"full|partial|none"}',
].join('\n');

const bullet = (items: string[]) => items.filter(Boolean).join('; ') || '—';

/** The user prompt: the plan's reading of the question, the goods facts, the data facts, then the numbered sources. */
export function buildComposeInput(input: ComposeInput): string {
  let budget = input.maxSourceChars;
  const blocks = input.sources.map((s, i) => {
    const head = `[${i + 1}] ${s.label}${s.note ? `\n(${s.note})` : ''}`;
    const text = s.text.slice(0, Math.max(0, budget));
    budget -= text.length;
    return `${head}\n${text}`;
  });
  return [
    `NGÀY ÁP DỤNG: ${input.asOf} · CHẾ ĐỘ: ${input.mode} · ĐỘ DÀI TỐI ĐA: khoảng ${WORD_CAP[input.mode]} từ`,
    `NGUYÊN VĂN TIN NHẮN (đã che mã): "${input.message}"`,
    `NGƯỜI HỎI CẦN: ${input.understanding || '—'}`,
    `CÂU HỎI THẬT: ${input.question}`,
    `DỮ KIỆN HÀNG: đã có — ${bullet(input.goods.facts)} · còn thiếu — ${bullet(input.goods.missing)}`,
    ...(input.previousQuestion ? [`LƯỢT TRƯỚC: ${input.previousQuestion}`] : []),
    ...(input.facts.length ? ['SỰ KIỆN ĐÃ XÁC ĐỊNH TỪ DỮ LIỆU (không được mâu thuẫn):', ...input.facts.map((f) => `- ${f}`)] : []),
    ...(input.tariffLines.length
      ? ['DÒNG THUẾ TỪ DỮ LIỆU (để hiểu biểu nào áp; ĐỪNG nhắc lại con số — hệ thống in khối thuế):', ...input.tariffLines.map((l) => `- ${l}`)]
      : []),
    'HỆ THỐNG IN RIÊNG BÊN DƯỚI, ĐỪNG VIẾT LẠI: danh sách ứng viên · khối thuế · cảnh báo · nguồn',
    '',
    'NGUỒN:',
    blocks.join('\n---\n'),
  ].join('\n');
}

/**
 * Raw newlines and tabs inside JSON string literals escaped: the model writes Markdown with real line breaks inside
 * "answerMd" often enough that a strict parse lost 2 of 3 plan-size replies on 2026-09-14.
 */
function escapeControlsInStrings(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === '\n') { out += '\\n'; continue; }
      else if (ch === '\r') { out += '\\r'; continue; }
      else if (ch === '\t') { out += '\\t'; continue; }
    } else if (ch === '"') {
      inString = true;
    }
    out += ch;
  }
  return out;
}

/** The outermost JSON object in model output — fenced, surrounded by chatter or carrying raw newlines; null when none parses. */
export function looseJson(stdout: string): Record<string, unknown> | null {
  const text = String(stdout ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const body = text.slice(start, end + 1);
  for (const candidate of [body, escapeControlsInStrings(body)]) {
    try {
      const v = JSON.parse(candidate) as unknown;
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* try the next form */
    }
  }
  return null;
}

const ints = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()) : []);

/** The model's draft in a fixed shape; null when there is no JSON or no answer text. */
export function parseDraft(stdout: string): Draft | null {
  const j = looseJson(stdout);
  if (!j || typeof j.answerMd !== 'string' || !j.answerMd.trim()) return null;
  const citations = (Array.isArray(j.citations) ? j.citations : [])
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ n: Number(c.n), quotes: strings(c.quotes ?? (typeof c.quote === 'string' ? [c.quote] : [])) }))
    .filter((c) => Number.isInteger(c.n) && c.n > 0);
  const candidates = (Array.isArray(j.candidates) ? j.candidates : [])
    .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>) : {}))
    .map((c) => ({ hs: String(c.hs ?? '').trim(), evidence: ints(c.evidence) }))
    .filter((c) => /^\d{2}\.\d{2}$|^\d{4}(\.\d{2}){1,2}$/.test(c.hs));
  const coverage = j.coverage === 'full' || j.coverage === 'none' ? j.coverage : 'partial';
  return { answerMd: j.answerMd.trim(), citations, candidates, missingFacts: strings(j.missingFacts).slice(0, 3), coverage };
}

export interface RepairItem {
  sentence: string;
  rule: string;
  quotes: string[];
}

/** The repair prompt carries only the violating sentences and the quotes of the sources they cite — nothing else to leak. */
export function buildRepairPrompt(items: RepairItem[]): string {
  return [
    'Viết lại TỪNG câu dưới đây để hết vi phạm. Chỉ dùng số, mã, số hiệu có trong TRÍCH DẪN kèm theo câu đó; không viết thuế',
    'suất, phần trăm, số tiền; không chốt mã hay nhóm. Giữ [n] của câu. Không sửa được thì trả chuỗi rỗng cho câu đó.',
    'Trả về đúng một JSON: {"sentences":["câu 1 đã sửa hoặc \\"\\"", "…"]} theo đúng thứ tự.',
    '',
    ...items.map((it, i) => [`CÂU ${i + 1} (vi phạm: ${it.rule}): ${it.sentence}`, ...it.quotes.map((q) => `  TRÍCH DẪN: "${q}"`)].join('\n')),
  ].join('\n');
}

/** Rewritten sentences in order ('' = drop); null when the reply does not give exactly one per violation. */
export function parseRepair(stdout: string, count: number): string[] | null {
  const j = looseJson(stdout);
  if (!j || !Array.isArray(j.sentences) || j.sentences.length !== count) return null;
  return j.sentences.map((s) => (typeof s === 'string' ? s.trim() : ''));
}
