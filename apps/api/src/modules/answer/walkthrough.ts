/**
 * Classification walkthrough mode of POST /answer (plan 08): the compose prompt, the normaliser the runner applies to the
 * model's JSON before verify(), plus the output schema and section-level checks re-exported from walkthrough.checks.ts. The
 * runner imports these four names only.
 *
 * Prompt "teaching walk", chosen over an evidence-first minimal prompt in the 2026-09-14 dry run (two judges split; it
 * scored 5 points higher on teaching at a 1-point rules cost), with the minimal prompt's neutral shared-evidence block, ruling
 * tags and duty sentence grafted in. The constant part holds output constraints and evidence-reading conventions only: GRI
 * and notes reach the model as evidence rows, because decision rules written into a prompt measurably lower classification
 * accuracy (hs-classification §5). Section keys are a legend for the checks, not an outline: an outline was followed key by
 * key into 5k-character replies (owner complaint "rập khuôn"). Lengths are in words: uncapped runs took 109–202 s against the
 * 100 s compose cap. List rows (policyRows) never reach the prompt: whether goods are on a list is printed by code from
 * policyStatus (R10, R12, R18), and the model wrote a used-equipment list into answers about new goods.
 */
import { digits, dotted, quoteInBody, splitSentences } from './guards';
import type { Authority, CandidateHeading, ClassifyInput, EvidenceRow, WalkthroughOutput, WalkthroughSection, WalkthroughSectionKey } from './types';
import { citesNoNoteOrGri, coerce, ids, QUOTED, SCHEMA } from './walkthrough.checks';

export { validateWalkthrough, walkthroughSchema } from './walkthrough.checks';

const WALK = `Một đồng nghiệp hỏi qua Zalo về phân loại hàng hóa. Hãy chỉ cho họ như người đi trước chỉ người mới: trả lời câu hỏi và cho thấy lập luận đi thế nào. Chỉ dựa trên ĐỀ BÀI và bằng chứng bên dưới; người chốt mã là họ.

Mỗi mục dưới đây là một phần tử của sections, gắn đúng key của nó.
- nature: dữ kiện nào của hàng quyết định; chỉ dùng đặc điểm người hỏi đã viết, thiếu thì nói thiếu; số đo, điện áp, khối lượng do hệ thống in, đừng nhắc lại.
- candidates, exclusions: nhóm nào hợp hay bị loại, theo câu chữ nhóm và chú giải nào.
- gir: quy tắc nào đã dùng cho hàng này, dẫn dòng GRI.
- levels: phân nhóm nào trong LINES còn đứng, vì dữ kiện nào.
- explanation: dữ kiện nào phân định các nhóm còn lại.
- risk: dữ kiện khác đi thì nhóm đổi ra sao, kể cả nhóm câu chữ đã dẫn chỉ tới dù chưa có trong bằng chứng; không nêu mức phạt.
- conclusion: nhóm còn đứng để người hỏi tự quyết; dữ kiện còn thiếu, mỗi dữ kiện gắn phép thử trong câu chữ đã dẫn; việc làm tiếp (hồ sơ kỹ thuật; đề nghị xác định trước mã số khi còn mở).`;

/** Owner decision 4: brief is one Zalo message of paragraphs, full may carry a few headings; neither shows the key list. */
const DEPTH: Record<ClassifyInput['depth'], string> = {
  // Owner, 2026-09-22: the default reply. Every section written in full came out as four Zalo messages of filler.
  brief:
    'Độ sâu brief: tối đa khoảng 170 từ kể cả phần chép nguyên văn, 2–3 đoạn liền, không "## ". Chỉ viết mục nào có điều cần nói cho câu hỏi này (thường là nature, explanation, conclusion); bỏ mục không có gì, không viết câu kiểu "chưa có nhóm nào phải loại trừ", không nhắc lại mô tả hàng người hỏi đã viết. Mỗi nhóm còn đứng ở conclusion có ít nhất một câu kèm [#id] nói vì sao nó còn đứng. Nhóm nào có mã ở tariff_ref thì một câu nói dữ kiện nào dẫn tới dòng đó, gọi dòng bằng câu chữ của nó, không viết mã 8 số.',
  // 300 words asked came back as 526 in 103 s on crimper, 220 words with quotes in 107 s (2026-09-15); the model overshoots
  // word caps by 30–75%, and quotes add length.
  full:
    'Độ sâu full: viết đủ tám mục, mỗi mục một phần tử riêng của sections, đúng thứ tự nature, candidates, exclusions, gir, levels, explanation, risk, conclusion; mục nào chưa có gì để nói thì nói thẳng là chưa có ("Chưa có nhóm nào phải loại trừ"). Phần thông tin hàng hóa do hệ thống in từ dữ kiện người hỏi đã viết, đừng chép lại. Không gộp mục, không bỏ mục nào, không tự viết dòng "## ": hệ thống in tiêu đề của từng mục. Mỗi mục 2–4 câu, khoảng 40–55 từ; cả bài khoảng 420 từ kể cả phần chép nguyên văn. levels liệt kê chương, nhóm và phân nhóm của nhóm đứng nhất, mỗi cấp một gạch đầu dòng, câu chữ chép từ LINES; mã 8 số không viết ở đây: hệ thống in dòng theo tariff_ref. Không viết câu nào về thuế: hệ thống in khối thuế dưới dòng đã chọn.',
};

// Citations are [#id] with a quote in the same sentence: numbering left to the model ran on across sections and its cite_ids
// fell out of step (G runs 2026-09-15); code numbers them and takes the quotes verify() needs (normalizeWalkthrough).
const RULES = `Câu đầu trả lời thẳng. Hỏi "mã [mã n] được không" thì câu đầu nói dữ kiện đã đủ để đối chiếu chưa, không phán mã đó đúng sai: hệ thống tự so. Viết như đồng nghiệp nói chuyện (xưng mình, gọi bạn), không khuôn; chưa chốt được thì nói dữ kiện nào quyết định và mỗi khả năng của nó dẫn tới nhóm nào, không viết nhãn như "Kết luận:" rồi một nhóm hay "nếu/khi chưa rõ … thì phải xét/thuộc …".

Ràng buộc:
- Không viết thuế suất, không so mức thuế giữa các dòng: số do hệ thống in theo tariff_ref.
- Không viết hàng có thuộc danh mục, cần giấy phép hay kiểm tra chuyên ngành không: hệ thống in riêng.
- Mã chỉ lấy từ LINES hoặc từ câu chữ bằng chứng; nội dung nhóm chép nguyên văn trong "…", không cắt bỏ vế làm hẹp nghĩa.
- [mã n] là mã người hỏi viết, đã che: đừng đoán số hay nhóm của nó.
- Không chốt mã, "nên khai", "chắc chắn thuộc", "vậy là xong"; không % tin cậy, điểm rủi ro, bảng, emoji, HTML, lời chào, xưng chuyên gia, tên hàng khai báo viết sẵn, đặc điểm hàng người hỏi không viết.
- Markdown chỉ **đậm**, *nghiêng*, "- ", "1. ", "## ".

Dẫn nguồn:
- Câu dựa vào dòng nào thì ghi [#id] của dòng đó cuối câu, trước dấu chấm, và chép ngay trong câu một cụm quyết định nguyên văn 20–60 ký tự của dòng trong "…"; câu dựa hai dòng thì chép từ mỗi dòng một cụm riêng của dòng đó, câu mở chung như "Chương này không bao gồm" không tính. Cụm chép nguyên văn của Chú giải, Chú giải chi tiết, SEN, GRI hay ruling được mang %, số tiền, tiêu chí hay lời xếp mã, ngoài "…" thì câu có chúng bị cắt; cụm đó từ 20 ký tự, chép trọn, không rút bằng dấu …, và câu mang nó không nói thuế, ưu đãi, MFN, FTA, VAT. Không tự đánh số, không liệt kê nguồn trong sections. [#id] chỉ đặt ở câu mà dòng đó thật sự nói ra ý ấy; câu nêu số hiệu văn bản, ngày cần [#id] của dòng chứa đúng chuỗi đó; số, %, ngày viết y như dòng viết.
- Gọi nguồn theo kind: hs_note là Chú giải, gri là Quy tắc/GIR, cả hai ràng buộc; en là Chú giải chi tiết, có thẩm quyền, không ghi đè Chú giải; sen là SEN, tầng ASEAN, không tự ràng buộc, nêu điều kiện của SEN thì nói rõ là SEN; note, internal không phải căn cứ; CHƯA CÓ HIỆU LỰC thì nói từ ngày nào.
- ruling: kết luận hành chính cho đúng mặt hàng đó, ràng buộc theo phạm vi ghi ở dòng; hàng tương tự chỉ để đối chiếu; hai dòng dẫn tới nhóm khác nhau thì nêu cả hai. Dòng ghi "không nêu chú giải hay GIR" thì chỉ nói nó kết luận gì cho hàng nào, không viết "Hải quan lập luận".
- Câu nói về thuế, C/O không kèm [#id]: không dòng bằng chứng nào nói về thuế.

JSON:
- candidates: mỗi NHÓM in bên dưới đúng một mục, không bỏ nhóm nào. phu_hop: dữ kiện đã có khớp câu chữ nhóm và chú giải; co_the_neu: khớp nếu một dữ kiện chưa rõ đúng; loai: Chú giải hoặc Chú giải chi tiết đã dẫn loại nhóm (có cite_ids); chua_du_du_kien: dữ kiện đã có chưa đủ để xét. cite_ids của nhóm: id của Chú giải, GIR, dòng in dưới nhóm đó hoặc dòng có nêu nhóm đó.
- conclusion: headings tối đa 3 nhóm còn đứng, không nhóm nào đứng thì []; needs_advance_ruling true khi ≥2 nhóm cùng phu_hop hoặc thiếu dữ kiện quyết định.
- deciding_facts ≤3, missing_facts ≤3, mỗi mục ≤12 từ.
- tariff_ref: mỗi nhóm ở conclusion nhiều nhất một mã, là dòng trong LINES của nhóm đó mà dữ kiện người hỏi đã viết dẫn tới; dữ kiện chưa đủ để chọn một dòng thì không ghi mã nào cho nhóm đó. Hệ thống in mã và câu chữ của dòng dưới nhóm; trong sections không viết mã 8 số, gọi dòng bằng câu chữ của nó trong LINES.
Chỉ trả một dòng JSON; cite_ids là số nguyên, deciding_facts và missing_facts là mảng; xuống dòng trong markdown viết \\n:
{"sections":[{"key":"nature|candidates|exclusions|gir|levels|explanation|risk|conclusion","markdown":"…"}],"candidates":[{"heading":"00.00","assessment":"phu_hop|co_the_neu|loai|chua_du_du_kien","deciding_facts":["…"],"cite_ids":[0]}],"conclusion":{"headings":["00.00"],"needs_advance_ruling":false,"missing_facts":["…"]},"tariff_ref":["0000.00.00"]}`;

const STANDING: Record<Authority, string> = {
  binding: 'ràng buộc',
  authoritative: 'có thẩm quyền',
  administrative: 'hành chính',
  reference: 'tham khảo',
  undetermined: 'chưa xác định',
};

const BINDS: Record<string, string> = {
  chi_nguoi_de_nghi: 'chỉ ràng buộc người đề nghị',
  to_khai_cu_the: 'chỉ cho tờ khai cụ thể',
  huong_dan_noi_bo_hq: 'hướng dẫn nội bộ hải quan',
};

/** Standing in words, from data: printed raw, "sen · authoritative" led the model to state SEN conditions as binding (R2). */
const standing = (r: EvidenceRow): string =>
  r.kind === 'sen' ? 'tầng ASEAN, không tự ràng buộc' : r.kind === 'note' || r.kind === 'internal' ? 'không phải căn cứ pháp lý' : (STANDING[r.authority] ?? r.authority);

/** "[#id] kind · standing · title · tags" and the whole body: the runner checks quotes against the full body. */
function row(r: EvidenceRow): string {
  const m = r.meta ?? {};
  const ahtn = (m.ahtn_2022 as { trang_thai?: unknown } | undefined)?.trang_thai;
  const ruling = r.kind === 'ruling' || m.case_id != null;
  const tags = [
    r.window === 'upcoming' && `CHƯA CÓ HIỆU LỰC${typeof m.effective_from === 'string' ? ` (từ ${m.effective_from})` : ''}`,
    m.verification === 'auto_unverified' && 'tự nạp, chưa có người xác minh',
    // gather's ruling rows carry no rang_buoc yet: a TB xác định trước binds only its applicant, any other only its goods.
    typeof m.rang_buoc === 'string'
      ? (BINDS[m.rang_buoc] ?? m.rang_buoc)
      : ruling && (/xác định trước/iu.test(r.title) ? BINDS.chi_nguoi_de_nghi : 'chỉ cho mặt hàng nêu trong văn bản'),
    // A ruling without căn cứ may only be reported as a conclusion, never as customs' reasoning (17 of 29 rulings).
    ruling && (citesNoNoteOrGri(r) ? 'không nêu chú giải hay GIR' : 'có viện dẫn chú giải/GIR'),
    typeof ahtn === 'string' && /^(?:doi_ma|phan_nhom_da)/.test(ahtn) && 'mã trong văn bản đã đổi ở AHTN 2022',
  ].filter(Boolean);
  return `${[`[#${r.id}] ${r.kind}`, standing(r), r.title, ...tags].join(' · ')}\n${r.body.trim()}`;
}

/**
 * Whether the prompt prints DÒNG THUẾ, for the full report's duty sentence. Fail closed (R4): the runner drops the user's
 * own code from tariffLines, so a heading left without a line is the heading the user named.
 */
const tariffShown = (input: ClassifyInput): boolean =>
  input.tariffLines.length > 0 && input.candidates.every((c) => input.tariffLines.some((t) => digits(t.code).startsWith(digits(c.heading))));

/**
 * A LINES entry as the prompt prints it, and as the bot prints a picked line: the hs_description path after the heading
 * text printed just above it (repeating that text was 18 of 26 k chars of LINES on moxa).
 */
export const lineText = (path: string, headingText: string): string => (path.startsWith(headingText) && path.slice(headingText.length).replace(/^\s*›\s*/, '')) || path;

function candidateBlock(c: CandidateHeading, shared: (r: EvidenceRow) => boolean): string {
  return [
    `NHÓM ${c.heading}: "${c.headingText}"`,
    'LINES:',
    ...c.lines.map((l) => `- ${dotted(l.code)} · ${lineText(l.path, c.headingText)}`),
    ...c.evidence.filter((r) => !shared(r)).map((r) => `\n${row(r)}`),
  ].join('\n');
}

export function buildWalkthroughPrompt(input: ClassifyInput): string {
  // By heading, not by rank, and before anything is derived from the list: the user's heading joins last after the blind
  // search, and neither its place nor the place of its notes in the shared block may tell (R4).
  const candidates = [...input.candidates].sort((a, b) => a.heading.localeCompare(b.heading));
  // Binding notes, GRI and any row given for two or more headings print once in a neutral block: printed under the first
  // heading they tied a Section note to one candidate by position, and assessments of shared headings moved in the R4 probe.
  const given = new Map<number, number>();
  for (const c of candidates) for (const id of new Set(c.evidence.map((r) => r.id))) given.set(id, (given.get(id) ?? 0) + 1);
  const shared = (r: EvidenceRow): boolean => r.kind === 'gri' || r.kind === 'hs_note' || (given.get(r.id) ?? 0) > 1;
  const common = [...new Map(candidates.flatMap((c) => c.evidence.filter(shared)).map((r) => [r.id, r])).values()];
  // Rates are printed by code either way; the block only helps the duty sentence.
  const tariff = [...input.tariffLines].sort((a, b) => a.code.localeCompare(b.code));

  return [
    WALK,
    DEPTH[input.depth],
    RULES,
    [
      `ĐỀ BÀI (độ sâu: ${input.depth}; tính đến ${input.asOf})`,
      `Câu hỏi: ${input.question}`,
      `Hàng hóa theo lời người hỏi: ${input.goodsFacts.trim() || '(không mô tả thêm)'}`,
    ].join('\n'),
    common.length ? `BẰNG CHỨNG CHUNG (Chú giải, GIR và dòng dùng cho nhiều nhóm)\n${common.map(row).join('\n\n')}` : '',
    ...candidates.map((c) => candidateBlock(c, shared)),
    tariffShown(input)
      ? `DÒNG THUẾ (không phải căn cứ phân loại; chỉ để nói loại thuế nào áp khi nào; không chép số)\n${tariff.map((t) => `- ${dotted(t.code)}: ${t.line}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * [#id], [# id], [#1, #2] and a bare [n] or [n, m], with the blanks before it, so a dropped marker leaves no gap. A match
 * starts only at the first blank: without the lookbehind a run of 60k blanks took 3.4 s.
 */
const MARKER = /(?<![ \t])[ \t]*\[\s*(?:#\s*)?\d+(?:\s*,\s*(?:#\s*)?\d+)*\s*\]/g;
const refsIn = (marker: string): Array<{ hash: boolean; n: number }> => [...marker.matchAll(/(#?)\s*(\d+)/g)].map(([, h, n]) => ({ hash: h === '#', n: Number(n) }));
/** A marker once read: [#id] as cited, [?id] a bare number that names a row only if its sentence quotes that row. */
const READ = /\[([#?])(\d+)\]/g;
const RUN = /(?<![ \t])[ \t]*(?:\[[#?]\d+\])+/g;
const lead = (m: string): string => /^[ \t]*/.exec(m)![0];

/**
 * The model's JSON in the contract shape; pure, and its own output reads back unchanged. Per section, [#id] markers become
 * [1..k] by first appearance and cites[k-1] keeps the phrases quoted in "…" or “…” in that marker's own sentence that
 * quoteInBody finds in that row, for G2 in verify() to decide on. A marker is never re-pointed (R10): an id not given for
 * this answer (candidates' evidence or policyRows) loses its marker, and a marker no quote survives for keeps its cite with
 * quotes: []. Drift read as meant: [# id]; lists; an old-style [n] as the section's own cite_ids (or cites) [n-1], one out of
 * range dropped; a bare [id] only where its sentence quotes that row, since a per-section [1] may be a small GRI id; a
 * section's quotes map {"id": [...]} under the same body check. tariff_ref is the given LINES codes it names, dotted and
 * deduped; candidates keep only given cite_ids.
 */
export function normalizeWalkthrough(draft: unknown, input: ClassifyInput): WalkthroughOutput {
  const o = asObj(coerce(asObj(draft), SCHEMA));
  const rows = new Map([...input.candidates.flatMap((c) => c.evidence), ...input.policyRows].map((r) => [r.id, r]));
  const intList = (v: unknown): unknown[] => asList(coerce(v, ids));
  const found = new Map<string, boolean>();
  const inBody = (q: string, id: number): boolean => {
    const key = `${id} ${q}`;
    if (!found.has(key)) found.set(key, quoteInBody(q, rows.get(id)!.body));
    return found.get(key)!;
  };

  const sections: WalkthroughSection[] = [];
  for (const s of asList(o.sections).map(asObj)) {
    const cites = asList(s.cites).map(asObj);
    // Reading an [n] out of range as numbered across sections swapped rows whenever the lists lined up (review 2026-09-15).
    const list = intList(s.cite_ids ?? cites.map((c) => c.id));
    const token = ({ hash, n }: { hash: boolean; n: number }): string | undefined => {
      const id = hash || !list.length ? n : list[n - 1];
      return typeof id === 'number' && rows.has(id) ? `[${hash || list.length ? '#' : '?'}${id}]` : undefined;
    };
    // NFC, as the section checks read it (nfc in walkthrough.checks): on NFD output every sentence validateWalkthrough
    // named would match nothing in cutSentences or repairItems, and the rules only those checks own would cut nothing.
    const md = String(s.markdown ?? '')
      .normalize('NFC')
      .replace(MARKER, (m) => {
        const tokens = [...new Set(refsIn(m).map(token))].filter(Boolean);
        return tokens.length ? lead(m) + tokens.join('') : '';
      })
      .trim();

    // Sentences by offset; a piece holding only markers ("…". [#id]) belongs to the sentence before it.
    const groups: Array<{ start: number; end: number }> = [];
    let at = 0;
    for (const piece of splitSentences(md)) {
      const start = md.indexOf(piece, at);
      at = start + piece.length;
      if (groups.length && !piece.replace(READ, '').replace(/[\s.,;:!?]/g, '')) groups[groups.length - 1]!.end = at;
      else groups.push({ start, end: at });
    }
    // Also matched over the section: a note quoted with its "; " or ". " straddles two sentences.
    const straddling = [...md.matchAll(QUOTED)].map((m) => ({ from: m.index!, to: m.index! + m[0].length, q: m[0] }));
    const quotes = new Map<number, string[]>();
    let text = '';
    let prev = 0;
    for (const { start, end } of groups) {
      const sentence = md.slice(start, end);
      const spans = new Set([...sentence.matchAll(QUOTED)].map(([q]) => q));
      for (const x of straddling) if (x.from < end && x.to > start) spans.add(x.q);
      // A marker inside the quote is no part of it; "…" joins phrases each checked alone.
      const phrases = [...spans].flatMap((q) =>
        q
          .slice(1, -1)
          .replace(READ, '')
          .split(/…|\.{3}/)
          .map((p) => p.trim())
          .filter(Boolean),
      );
      const refs = [...sentence.matchAll(READ)].map(([, kind, id]) => ({ kind, id: Number(id) }));
      const kept = new Set(refs.filter(({ kind, id }) => kind === '#' || phrases.some((p) => inBody(p, id))).map(({ id }) => id));
      // A phrase two cited rows share ("Chương này không bao gồm") shows neither said the rest of the sentence.
      for (const p of phrases) {
        const by = [...kept].filter((id) => inBody(p, id));
        if (by.length === 1 && !(quotes.get(by[0]!) ?? []).includes(p)) quotes.set(by[0]!, [...(quotes.get(by[0]!) ?? []), p]);
      }
      text +=
        md.slice(prev, start) +
        sentence.replace(RUN, (run) => {
          const marked = [...new Set([...run.matchAll(READ)].map(([, , id]) => Number(id)))].filter((id) => kept.has(id));
          return marked.length ? lead(run) + marked.map((id) => `[#${id}]`).join('') : '';
        });
      prev = end;
    }
    text = (text + md.slice(prev)).trim();
    if (!text) continue;

    const order = [...new Set([...text.matchAll(/\[#(\d+)\]/g)].map(([, id]) => Number(id)))];
    // Quotes the draft listed itself, where in an old-style section a key within its list is a position, or cites read back:
    // they add to a marked cite, never add one.
    const listed: Array<[unknown, unknown]> = [
      ...Object.entries(asObj(s.quotes)).map(([k, qs]): [unknown, unknown] => [list.length && Number(k) <= list.length ? list[Number(k) - 1] : Number(k), qs]),
      ...cites.map((c): [unknown, unknown] => [c.id, c.quotes]),
    ];
    for (const [id, qs] of listed) {
      if (typeof id !== 'number' || !order.includes(id)) continue;
      for (const q of [qs].flat()) {
        const t = typeof q === 'string' ? q.trim() : '';
        if (t && inBody(t, id) && !(quotes.get(id) ?? []).includes(t)) quotes.set(id, [...(quotes.get(id) ?? []), t]);
      }
    }
    sections.push({
      key: s.key as WalkthroughSectionKey,
      markdown: text.replace(/\[#(\d+)\]/g, (_, id: string) => `[${order.indexOf(Number(id)) + 1}]`),
      cites: order.map((id) => ({ id, quotes: quotes.get(id) ?? [] })),
    });
  }

  const candidates = asList(o.candidates).map((c) =>
    c !== null && typeof c === 'object' && !Array.isArray(c) ? { ...c, cite_ids: [...new Set(intList((c as Obj).cite_ids).filter((id) => typeof id === 'number' && rows.has(id)))] } : c,
  );
  // Owner 2026-09-22 ("hs code 8 số"): tariff_ref is the model's pick among LINES; the runner keeps one per standing candidate.
  // A code outside LINES (a masked user code guessed) goes.
  const lines = new Set(input.candidates.flatMap((c) => c.lines.map((l) => digits(l.code))));
  const tariff_ref = [...new Set(asList(o.tariff_ref).map((c) => digits(String(c))))].filter((d) => lines.has(d)).map(dotted);
  return { sections, candidates, conclusion: o.conclusion, tariff_ref } as WalkthroughOutput;
}
