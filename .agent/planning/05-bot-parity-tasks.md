---
type: planning
status: active
updated: 2026-09-13
related:
  - ../docs/bot-answer-parity-design.md
  - ../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md
  - 03-llm-expansion-tasks.md
  - 02-progress.md
---

# Kế hoạch triển khai — bot trả lời ngang notebook (Mảng 1 … 4)

> **Trạng thái 2026-09-13 (tối):** Mảng 1 đã commit; server đã chạy ([kế hoạch 06](06-deploy-mona-dev-server.md)) — Task 7 đạt (`/health` báo `llm: up`); Task 8 bước 4 chờ `rclone.conf`; Task 6 bước 6 (đo mục dài trên server) chưa làm; Task 5 bước 6–9 chờ chủ dự án. Task 9 bước 2 xong trên **kho cũ** (bước 1 chưa làm vì Task 5 còn chờ): pháp luật recall@5 90% (20 câu), từ chối đúng 2/2, trích dẫn hợp lệ 100%; HS top-1 20% / top-3 27,3% (55 tờ khai, đường tra tất định); notebook đạt 1/14, nhóm an toàn 0/8 — `fixtures/eval-baseline.json`. **Chủ dự án chốt thứ tự mới:** trình bày kiểu notebook + định dạng Zalo (đậm, màu theo ngữ nghĩa) trước, rồi Mảng 2 ngay sau. Sổ thực thi: `.superpowers/sdd/05-bot-parity-tasks/progress.md` (ngoài git).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot Zalo trả lời ngang hoặc hơn Gemini Notebook trên cùng 32 nguồn, giữ nguyên bốn rào chắn
bot đang hơn notebook (thuế tất định, lọc hiệu lực cứng, kiểm trích dẫn, từ chối khi thiếu căn cứ).

**Architecture:** Một bảng `evidence_section` chứa mọi bằng chứng ngoài điều khoản; `POST /answer` đi
năm bước cố định (kế hoạch → truy hồi lai → mở rộng → viết → kiểm); bộ trình bày Zalo in nhãn từ dữ
liệu. LLM chỉ ở chỗ tìm và viết; mọi con số, mã, số hiệu phải neo vào trích dẫn nguyên văn trong cùng câu.

**Tech Stack:** NestJS 11 · Drizzle/postgres.js · Postgres 17 + pgvector · BGE-M3 sidecar (FastAPI) ·
`claude -p` CLI · Python 3.12 (pdfplumber, pymupdf) · Jest (TS) · `node --test` (bot) · `unittest` (Python) · Docker Compose · rclone.

**Spec:** [.agent/docs/bot-answer-parity-design.md](../docs/bot-answer-parity-design.md) (bản 2). Kế hoạch lập luận từ spec; người thực thi đọc cả hai.

## Global Constraints

- Tối đa **4 lần gọi `claude -p`** một lượt chat; trần tổng **120s** ở p95 (spec §3.7).
- Con số biểu thuế không bao giờ do LLM sinh; trong câu trả lời tự do, thuế chỉ được trích **nguyên một dòng** từ mục `tariff` (spec §3.6 kiểm 3; [R1](../business-rules.md), [R6](../business-rules.md)).
- Mã HS chỉ theo **chế độ ứng viên 1–3**, mã người dùng nêu không vào prompt (spec §3.8; [R2](../business-rules.md), [R4](../business-rules.md)).
- Hiệu lực là **bộ lọc cứng tính từ ngày**, hai cửa sổ `current`/`upcoming` (spec §2.4; [R8](../business-rules.md)).
- Mọi văn bản máy nạp vào ở `auto_unverified`; giữ `verified` chỉ khi chủ dự án duyệt diff và đứng tên (spec §2.7; [R18](../business-rules.md)).
- `decision_log` xoá sau **30 ngày**; **không** sao lưu `conversation*`/`decision_log` ([R14](../business-rules.md)).
- Migration SQL **viết tay** + `_journal.json`; **không** chạy `drizzle-kit generate` (snapshot 0007–0009 thiếu).
- Tài liệu tiếng Việt; mã nguồn, định danh, tên file, thông điệp commit tiếng Anh.
- **Chỉ commit khi chủ dự án yêu cầu** (`.agent/AGENTS.md` bước 13). Các bước "Commit" là nội dung soạn sẵn.
- Không bao giờ in giá trị `CLAUDE_CODE_OAUTH_TOKEN` hay nội dung `rclone.conf` ra log/chat.

## Phân rã theo mảng

Bốn mảng, thứ tự bắt buộc (spec "Phân rã chương trình"). **Mảng 1 chi tiết trong file này.** Mảng 2–4
có cấu trúc file, hợp đồng giao diện và danh sách việc ở cuối file; chi tiết hoá thành bước khi mảng
trước cho ra số đo (cùng cách [03-llm-expansion-tasks.md](03-llm-expansion-tasks.md) làm với M1–M4) —
vì mảng 2 cần `EMBED_CHARS` đo được ở mảng 1, mảng 3 cần schema mảng 2.

| Mảng | Phạm vi | Kế hoạch |
|---|---|---|
| **1 · Nền** | toolchain, bộ chấm 14 câu, parser + nạp lại có diff, embedder có rào, CLI trong image, sao lưu, runbook VPS, baseline | **file này, Task 1–9** |
| 2 · Tầng bằng chứng | `evidence_section` + seed 13 kind + `/tariff` mở rộng | phác thảo cuối file |
| 3 · Đường trả lời | module `answer` + bot `render.mjs` | phác thảo cuối file |
| 4 · Nghiệm thu | `ab.ts`, chấm mù, cổng đạt | phác thảo cuối file |

## Cấu trúc file — Mảng 1

| File | Trách nhiệm |
|---|---|
| `apps/eval/notebook.ts` (mới) | đọc `notebook-qa.json`, chấm một câu (thuần) và chạy cả bộ qua HTTP |
| `apps/eval/notebook.spec.ts` (mới) | test hàm chấm thuần |
| `apps/eval/report.ts`, `apps/eval/run.ts` (sửa) | in thêm khối "NOTEBOOK", ghi vào baseline |
| `research/legal-loader/parse_provisions.py` (sửa) | `KHOAN` loại nhóm nghìn |
| `research/legal-loader/test_parse_provisions.py` (sửa) | ca hồi quy `parse_clauses` |
| `research/legal-loader/refetch.py` (mới) | tải lại nguồn theo `corpus.json` vào `doc/` (gitignored) |
| `research/legal-loader/diff_provisions.py` (mới) | báo cáo diff theo điều: tiêu đề, 80 ký tự đầu, danh sách khoản |
| `research/legal-loader/merge_into_seed.py` (mới) | thay đúng các văn bản của corpus trong `db/seed/data/legal/*.ndjson`, đặt `verification` |
| `research/legal-loader/test_tools.py` (mới) | test cho `diff_articles`, `merge_rows` |
| `apps/embedder/server.py`, `docker-compose.yml`, `.env.example` (sửa) | `EMBED_MAX_TOKENS`, cổng localhost cho đo |
| `research/inbox-loader/measure_embed.py` (+ test) (mới) | chọn mẫu dài nhất + lô 32 mục >8.000 ký tự, đo giây/mục |
| `apps/api/Dockerfile` (sửa) | cài CLI `claude` vào stage runtime |
| `db/backup.sh` (mới) | sao lưu đêm sổ áp mã + trạng thái xác minh lên Drive |
| `README.md` (sửa) | mục "Triển khai máy chủ (VPS)" |
| `fixtures/eval-baseline.json` (sinh) | baseline mảng 1 |

---

### Task 1: Khôi phục toolchain, xác nhận test xanh

**Files:**
- Không sửa file; chạy lệnh.

**Interfaces:**
- Produces: `node_modules/.bin/{tsx,jest}` có mặt; `yarn test`, `yarn test:bot`, `yarn test:parser` xanh — điều kiện tiên quyết của mọi task sau.

- [ ] **Bước 1: cài lại phụ thuộc**

Run: `corepack yarn install`
Expected: kết thúc không lỗi; `ls node_modules/.bin/tsx node_modules/.bin/jest` in ra hai đường dẫn.

- [ ] **Bước 2: chạy ba bộ test hiện có**

Run: `corepack yarn test 2>&1 | tail -5 && corepack yarn test:bot 2>&1 | tail -3 && corepack yarn test:parser 2>&1 | tail -3`
Expected: Jest `Tests: … passed`, `node --test` không `fail`, unittest `OK` (9 test parser).

- [ ] **Bước 3: kiểm kiểu `db/seed/legal.ts` (việc tồn từ 2026-09-10)**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "db/seed/legal.ts|error TS" | head`
Expected: không dòng nào cho `db/seed/legal.ts`. Nếu có lỗi kiểu ở `verification`/`verified_by`, sửa `DocRow` trong `db/seed/legal.ts` cho khớp enum trong `db/schema/index.ts` (`'verified' | 'auto_unverified'`).

- [ ] **Bước 4: ghi vào nhật ký**

Thêm một dòng vào mục "Việc phát sinh" của [04-inbox-ingest-tasks.md](04-inbox-ingest-tasks.md): "`yarn install` — xong 2026-09-13; kiểm kiểu legal.ts: <kết quả>".

---

### Task 2: Bộ chấm 14 câu notebook

**Files:**
- Create: `apps/eval/notebook.ts`
- Create: `apps/eval/notebook.spec.ts`
- Modify: `apps/eval/report.ts` (hàm `renderReport`), `apps/eval/run.ts` (gọi thêm, ghi baseline)
- Read: `fixtures/legal-golden/notebook-qa.json` (đã có, 14 câu)

**Interfaces:**
- Produces:
  - `norm(s: string): string` — NFC, thường, gộp khoảng trắng.
  - `visibleText(r: AnswerLike): string` — chữ người dùng thấy: `answer|answerMd` + mọi `verbatimText|quote` trong `citations`.
  - `scoreCase(c: NotebookCase, r: AnswerLike | null): CaseResult` với `CaseResult = { id; safety; passed; failed: string[]; skipped: string[] }`.
  - `evalNotebook(apiUrl: string, endpoint?: '/legal' | '/answer'): Promise<NotebookMetrics>` với `NotebookMetrics = { cases; passed; safetyPassed; safetyTotal; skippedChecks; misses: string[] }`.
  - `AnswerLike` chấp nhận **cả** hình dạng `/legal` hôm nay lẫn `/answer` mảng 3 (các trường đều tuỳ chọn); kiểm nào không có dữ liệu để chấm thì vào `skipped`, không phải `failed`.
- Consumes: `/legal?q=&asOf=` (GET) hôm nay; `/answer` (POST JSON `{q, asOf, channel:'eval'}`) ở mảng 3.

- [ ] **Bước 1: viết test thất bại**

```ts
// apps/eval/notebook.spec.ts
import { scoreCase, visibleText, norm, type NotebookCase } from './notebook';

const base: NotebookCase = { id: 'x', q: 'q', safety: true };

describe('norm', () => {
  it('collapses whitespace and case, keeps diacritics', () => {
    expect(norm('  NĐ  292/2026  ')).toBe('nđ 292/2026');
  });
});

describe('visibleText', () => {
  it('joins the prose with every citation text, both /legal and /answer shapes', () => {
    const t = visibleText({
      answer: 'A',
      citations: [{ verbatimText: 'B' }, { quote: 'C' }],
    });
    expect(t).toContain('A');
    expect(t).toContain('B');
    expect(t).toContain('C');
  });
});

describe('scoreCase', () => {
  it('passes when every mustSay is present and no mustNotSay is', () => {
    const r = scoreCase(
      { ...base, mustSay: ['292/2026', '05/09/2026'], mustNotSay: ['còn hiệu lực'] },
      { answer: 'NĐ 69/2018 đã bị NĐ 292/2026 thay thế từ 05/09/2026.' },
    );
    expect(r.passed).toBe(true);
    expect(r.failed).toEqual([]);
  });

  it('fails a missing mustSay and a present mustNotSay, naming each', () => {
    const r = scoreCase(
      { ...base, mustSay: ['292/2026'], mustNotSay: ['còn hiệu lực'] },
      { answer: 'NĐ 69/2018 còn hiệu lực.' },
    );
    expect(r.passed).toBe(false);
    expect(r.failed).toEqual(['mustSay:292/2026', 'mustNotSay:còn hiệu lực']);
  });

  it('matches expect {doc, dieu} on a citation article label', () => {
    const c = { ...base, expect: { doc: '46/VBHN-BTC', dieu: 18 } };
    expect(scoreCase(c, { citations: [{ documentNumber: '46/VBHN-BTC', articleLabel: 'Điều 18 Nghị định 08/2015/NĐ-CP' }] }).passed).toBe(true);
    expect(scoreCase(c, { citations: [{ documentNumber: '46/VBHN-BTC', articleLabel: 'Điều 180 …' }] }).failed).toEqual(['expect:46/VBHN-BTC Điều 18']);
  });

  it('skips expectEvidence / expectIntent / expectWarnings when the response cannot carry them', () => {
    const r = scoreCase(
      { ...base, expectEvidence: [{ kind: 'status', instrument: '69/2018/NĐ-CP' }], expectIntent: 'hs', expectWarnings: ['upcoming'] },
      { answer: 'x' },
    );
    expect(r.skipped).toEqual(['expectEvidence', 'expectIntent', 'expectWarnings']);
    expect(r.passed).toBe(true);
  });

  it('scores expectEvidence by retrieved (kind, instrument|hsHeading|phan)', () => {
    const c = { ...base, expectEvidence: [{ kind: 'en', hsHeading: '84.18' }] };
    expect(scoreCase(c, { citations: [{ kind: 'en', hsHeading: '84.18' }] }).passed).toBe(true);
    expect(scoreCase(c, { citations: [{ kind: 'en', hsHeading: '84.17' }] }).failed).toEqual(['expectEvidence:en 84.18']);
  });

  it('scores expectIntent and expectWarnings when present', () => {
    expect(scoreCase({ ...base, expectIntent: 'tariff' }, { plan: { intent: 'tariff' } }).passed).toBe(true);
    expect(scoreCase({ ...base, expectIntent: 'tariff' }, { plan: { intent: 'legal' } }).failed).toEqual(['expectIntent:tariff']);
    expect(scoreCase({ ...base, expectWarnings: ['upcoming'] }, { warnings: ['upcoming'] }).passed).toBe(true);
    expect(scoreCase({ ...base, expectWarnings: ['upcoming'] }, { warnings: [] }).failed).toEqual(['expectWarnings:upcoming']);
  });

  it('treats a null response as a failure of every applicable check', () => {
    const r = scoreCase({ ...base, mustSay: ['a'] }, null);
    expect(r.passed).toBe(false);
    expect(r.failed).toEqual(['no-response']);
  });
});
```

> Sửa sau review cuối (2026-09-13): ca "skips …" ở trên nay kỳ vọng `scored: false, passed: false` — một ca không có kiểm nào thật sự chạy là **chưa chấm**, không tính đạt và không tính vào nhóm an toàn. Mã và test hiện hành: `apps/eval/notebook.ts`, `apps/eval/notebook.spec.ts`.

- [ ] **Bước 2: chạy test để chắc nó fail**

Run: `corepack yarn test apps/eval/notebook.spec.ts`
Expected: FAIL — `Cannot find module './notebook'`.

- [ ] **Bước 3: viết `apps/eval/notebook.ts`**

```ts
/**
 * The 14 notebook questions (fixtures/legal-golden/notebook-qa.json), scored through
 * HTTP the way a person's question travels. Two endpoints share one scorer: today's
 * GET /legal (prose ≤130 words + verbatim citations) and Mảng 3's POST /answer. A
 * check the response cannot carry (evidence kinds, plan intent, warnings on /legal)
 * is SKIPPED, not failed — the baseline must not punish the old path for lacking
 * fields it never had; the later run against /answer scores them for real.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface NotebookCase {
  id: string;
  q: string;
  safety?: boolean;
  expect?: { doc: string; dieu: number };
  expectEvidence?: Array<{ kind: string; instrument?: string; hsHeading?: string; phan?: string }>;
  expectIntent?: string;
  expectWarnings?: string[];
  mustSay?: string[];
  mustNotSay?: string[];
  should_abstain?: boolean;
  note?: string;
}

export interface AnswerLike {
  abstained?: boolean;
  answer?: string;
  answerMd?: string;
  warnings?: string[];
  plan?: { intent?: string };
  citations?: Array<{
    documentNumber?: string;
    articleLabel?: string;
    verbatimText?: string;
    quote?: string;
    kind?: string;
    instrument?: string;
    hsHeading?: string;
    phan?: string;
  }>;
}

export interface CaseResult {
  id: string;
  safety: boolean;
  passed: boolean;
  failed: string[];
  skipped: string[];
}

export interface NotebookMetrics {
  cases: number;
  passed: number;
  safetyPassed: number;
  safetyTotal: number;
  skippedChecks: number;
  misses: string[];
}

export const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** What the reader sees: the prose plus every quoted/verbatim citation text. */
export function visibleText(r: AnswerLike): string {
  const parts = [r.answer ?? '', r.answerMd ?? ''];
  for (const c of r.citations ?? []) parts.push(c.verbatimText ?? '', c.quote ?? '');
  return norm(parts.join('\n'));
}

export function scoreCase(c: NotebookCase, r: AnswerLike | null): CaseResult {
  const failed: string[] = [];
  const skipped: string[] = [];
  const safety = Boolean(c.safety);
  if (!r) return { id: c.id, safety, passed: false, failed: ['no-response'], skipped };

  const text = visibleText(r);
  for (const s of c.mustSay ?? []) if (!text.includes(norm(s))) failed.push(`mustSay:${s}`);
  for (const s of c.mustNotSay ?? []) if (text.includes(norm(s))) failed.push(`mustNotSay:${s}`);

  if (c.expect) {
    const re = new RegExp(`^Điều ${c.expect.dieu}\\b`);
    const hit = (r.citations ?? []).some((x) => x.documentNumber === c.expect!.doc && re.test(x.articleLabel ?? ''));
    if (!hit) failed.push(`expect:${c.expect.doc} Điều ${c.expect.dieu}`);
  }

  if (c.should_abstain) {
    const abstained = r.abstained || !(r.citations ?? []).length;
    if (!abstained) failed.push('should_abstain');
  }

  if (c.expectEvidence) {
    const carries = (r.citations ?? []).some((x) => x.kind);
    if (!carries) skipped.push('expectEvidence');
    else {
      for (const e of c.expectEvidence) {
        const ok = (r.citations ?? []).some(
          (x) =>
            x.kind === e.kind &&
            (!e.instrument || x.instrument === e.instrument) &&
            (!e.hsHeading || x.hsHeading === e.hsHeading) &&
            (!e.phan || x.phan === e.phan),
        );
        if (!ok) failed.push(`expectEvidence:${e.kind} ${e.instrument ?? e.hsHeading ?? e.phan ?? ''}`.trim());
      }
    }
  }

  if (c.expectIntent) {
    if (!r.plan) skipped.push('expectIntent');
    else if (r.plan.intent !== c.expectIntent) failed.push(`expectIntent:${c.expectIntent}`);
  }

  if (c.expectWarnings) {
    if (!Array.isArray(r.warnings)) skipped.push('expectWarnings');
    else for (const w of c.expectWarnings) if (!r.warnings.includes(w)) failed.push(`expectWarnings:${w}`);
  }

  return { id: c.id, safety, passed: failed.length === 0, failed, skipped };
}

async function ask(apiUrl: string, endpoint: '/legal' | '/answer', q: string, asOf: string): Promise<AnswerLike | null> {
  try {
    const res =
      endpoint === '/answer'
        ? await fetch(`${apiUrl}/answer`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ q, asOf, channel: 'eval' }),
          })
        : await fetch(`${apiUrl}/legal?${new URLSearchParams({ q, asOf })}`);
    return res.ok ? ((await res.json()) as AnswerLike) : null;
  } catch {
    return null;
  }
}

export async function evalNotebook(apiUrl: string, endpoint: '/legal' | '/answer' = '/legal'): Promise<NotebookMetrics> {
  const golden = JSON.parse(readFileSync(join(process.cwd(), 'fixtures', 'legal-golden', 'notebook-qa.json'), 'utf8')) as {
    asOf: string;
    cases: NotebookCase[];
  };
  const results: CaseResult[] = [];
  for (const c of golden.cases) results.push(scoreCase(c, await ask(apiUrl, endpoint, c.q, golden.asOf)));
  const safetyCases = results.filter((r) => r.safety);
  return {
    cases: results.length,
    passed: results.filter((r) => r.passed).length,
    safetyPassed: safetyCases.filter((r) => r.passed).length,
    safetyTotal: safetyCases.length,
    skippedChecks: results.reduce((n, r) => n + r.skipped.length, 0),
    misses: results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.failed.join(' · ')}`),
  };
}
```

- [ ] **Bước 4: chạy test cho xanh**

Run: `corepack yarn test apps/eval/notebook.spec.ts`
Expected: PASS 8/8.

- [ ] **Bước 5: nối vào `report.ts` và `run.ts`**

Trong `apps/eval/report.ts` — thêm import và tham số thứ ba:

```ts
import type { NotebookMetrics } from './notebook';

export function renderReport(legal: LegalMetrics, hs: HsMetrics, notebook: NotebookMetrics): string {
  const lines = [
    // … các dòng PHÁP LUẬT và MÃ HS giữ nguyên …
    '  NOTEBOOK  (14 câu, chấm theo mustSay/mustNotSay/expect)',
    `    đạt                                 ${notebook.passed}/${notebook.cases}`,
    `    nhóm an toàn đạt                    ${notebook.safetyPassed}/${notebook.safetyTotal}`,
    `    kiểm bị bỏ qua vì endpoint cũ       ${notebook.skippedChecks}`,
    '',
  ];
  const misses = [...legal.misses, ...hs.misses, ...notebook.misses];
  // … phần TRƯỢT giữ nguyên …
```

Trong `apps/eval/run.ts`:

```ts
import { evalNotebook } from './notebook';
// …
const notebook = await evalNotebook(apiUrl, (process.env.EVAL_ANSWER_ENDPOINT as '/legal' | '/answer') ?? '/legal');
console.log(renderReport(legal, hs, notebook));
// …
const record = { at: new Date().toISOString(), api: apiUrl, llm: health.llm ?? null, legal, hs, notebook };
```

- [ ] **Bước 6: build kiểm kiểu**

Run: `corepack yarn build 2>&1 | tail -3 && node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "apps/eval" || echo "eval typechecks"`
Expected: build sạch, `eval typechecks`.

- [ ] **Bước 7: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add apps/eval/notebook.ts apps/eval/notebook.spec.ts apps/eval/report.ts apps/eval/run.ts fixtures/legal-golden/notebook-qa.json
git commit -m "Eval: score the 14 notebook questions through the same HTTP path a person uses"
```

---

### Task 3: `KHOAN` không nhận nhóm nghìn làm khoản

**Files:**
- Modify: `research/legal-loader/parse_provisions.py` (hằng `KHOAN`, comment dòng 36–38)
- Modify: `research/legal-loader/test_parse_provisions.py`

**Interfaces:**
- Produces: `parse_clauses(body_lines: list[str]) -> tuple[list[str], list[dict]]` giữ chữ ký; `20.000 tờ khai/năm.` không còn mở khoản 20.

- [ ] **Bước 1: viết test thất bại**

Thêm vào cuối `test_parse_provisions.py` (trước `if __name__`):

```python
from parse_provisions import parse_clauses


class ParseClauses(unittest.TestCase):
    def test_a_thousands_group_after_the_period_is_money_not_a_clause(self):
        # 46/VBHN-BTC Điều 10, inside điểm d of khoản 4: the PDF wraps the amount onto
        # its own line and the old regex read "20.000 tờ khai/năm." as khoản 20.
        chapeau, khoan = parse_clauses([
            '4. Điều kiện:',
            'd) Đại lý thủ tục hải quan: số tờ khai làm thủ tục hải quan trong năm đạt',
            '20.000 tờ khai/năm.',
            '5. Không áp dụng điều kiện kim ngạch.',
        ])
        self.assertEqual([k['num'] for k in khoan], ['4', '5'])
        self.assertIn('20.000 tờ khai/năm.', khoan[0]['lines'])

    def test_a_plain_clause_number_still_opens_a_clause(self):
        _, khoan = parse_clauses(['1. Người khai hải quan phải…', '2. Cơ quan hải quan…'])
        self.assertEqual([k['num'] for k in khoan], ['1', '2'])

    def test_a_fused_two_digit_footnote_is_still_tolerated(self):
        # "1.33 …" = khoản 1 + footnote 33 fused by the PDF render (comment above KHOAN).
        _, khoan = parse_clauses(['1.33 Hàng hóa xuất khẩu…'])
        self.assertEqual([k['num'] for k in khoan], ['1'])
```

- [ ] **Bước 2: chạy test để chắc nó fail**

Run: `corepack yarn test:parser 2>&1 | tail -8`
Expected: FAIL ở `test_a_thousands_group_after_the_period_is_money_not_a_clause` (khoan nums `['4', '20', '5']`); hai test kia PASS.

- [ ] **Bước 3: sửa regex**

Trong `parse_provisions.py`, thay dòng `KHOAN = …` bằng:

```python
# `\d*` right after the period tolerates a footnote fused by the PDF render ("1.33 …" =
# khoản 1 + footnote 33). But "20.000 tờ khai/năm." is an AMOUNT with a thousands group —
# exactly three digits then a word boundary — and it opened a phantom khoản 20 in Điều 10
# of 46/VBHN-BTC (found by the 2026-09-10 audit). Exclude that shape; a footnote is 1–2 digits.
KHOAN = re.compile(r'^(\d+)\.(?!\d{3}\b)\d*\s+(.+)$')
```

- [ ] **Bước 4: chạy test cho xanh**

Run: `corepack yarn test:parser 2>&1 | tail -3`
Expected: `OK` (12 test).

- [ ] **Bước 5: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add research/legal-loader/parse_provisions.py research/legal-loader/test_parse_provisions.py
git commit -m "Legal parser: a thousands group after the period is an amount, not a clause"
```

---

### Task 4: Công cụ diff và gộp — thuần, có test

**Files:**
- Create: `research/legal-loader/diff_provisions.py`
- Create: `research/legal-loader/merge_into_seed.py`
- Create: `research/legal-loader/test_tools.py`

**Interfaces:**
- Produces:
  - `diff_articles(old_rows: list[dict], new_rows: list[dict]) -> list[dict]` — mỗi phần tử `{document_number, dieu, change: 'heading'|'khoan'|'body'|'added'|'removed', old, new}`; hai danh sách là hàng `provisions.ndjson` (có `document_number`, `ptype`, `number`, `parent_key`, `heading`, `body`, `key`).
  - `render_report(diffs: list[dict]) -> str` — markdown theo văn bản, kèm tổng đếm từng loại `change`.
  - `merge_rows(existing: list[dict], incoming: list[dict], key: str, replace_numbers: set[str]) -> list[dict]` — bỏ mọi hàng của `existing` có `row[key] ∈ replace_numbers`, nối `incoming` vào cuối, giữ thứ tự.
  - CLI `merge_into_seed.py --from <dir> --into <dir> (--verified-by NAME | --unverified)` — thay `documents/provisions/chunks.ndjson` cho đúng các văn bản có trong `<dir>/documents.ndjson`; đặt `verification`/`verified_by` trên các hàng `documents` đó.
- Consumes: định dạng hàng của `parse_provisions.build` và `build_chunks.build_chunks` (không đổi).

- [ ] **Bước 1: viết test thất bại**

```python
# research/legal-loader/test_tools.py
"""diff_provisions / merge_into_seed are the two places a reseed can silently go wrong:
a diff that hides a change, or a merge that drops the other documents. Both are pure."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from diff_provisions import diff_articles, render_report
from merge_into_seed import merge_rows


def rows(doc, dieu, heading, body, khoan):
    key = f'{doc}::dieu-{dieu}'
    out = [{'document_number': doc, 'key': key, 'parent_key': None, 'ptype': 'dieu',
            'number': str(dieu), 'heading': heading, 'body': body}]
    for k in khoan:
        out.append({'document_number': doc, 'key': f'{key}-khoan-{k}', 'parent_key': key,
                    'ptype': 'khoan', 'number': str(k), 'heading': None, 'body': f'khoản {k}'})
    return out


class DiffArticles(unittest.TestCase):
    def test_reports_a_changed_heading_and_a_changed_clause_list(self):
        old = rows('46/VBHN-BTC', 10, 'Điều 10. Điều kiện', 'a', [1, 2, 3, 4, 20, 5, 6])
        new = rows('46/VBHN-BTC', 10, 'Điều 10. Điều kiện', 'a', [1, 2, 3, 4, 5, 6])
        d = diff_articles(old, new)
        self.assertEqual([x['change'] for x in d], ['khoan'])
        self.assertEqual(d[0]['old'], ['1', '2', '3', '4', '20', '5', '6'])
        self.assertEqual(d[0]['new'], ['1', '2', '3', '4', '5', '6'])

    def test_reports_heading_body_added_and_removed(self):
        old = rows('25/VBHN-BTC', 18, 'Điều 18 Luật Hải quan và lấy mẫu', 'x', [1]) + rows('25/VBHN-BTC', 19, 'Điều 19. A', 'y', [])
        new = rows('25/VBHN-BTC', 18, 'Điều 18. Khai hải quan', 'x2', [1]) + rows('25/VBHN-BTC', 20, 'Điều 20. B', 'z', [])
        kinds = sorted(x['change'] for x in diff_articles(old, new))
        self.assertEqual(kinds, ['added', 'body', 'heading', 'removed'])

    def test_identical_input_is_an_empty_diff(self):
        r = rows('31/2018/NĐ-CP', 1, 'Điều 1. Phạm vi', 'b', [1, 2])
        self.assertEqual(diff_articles(r, list(r)), [])

    def test_report_counts_each_kind(self):
        old = rows('D', 1, 'Điều 1. A', 'a', [1]) + rows('D', 2, 'Điều 2. B', 'b', [1])
        new = rows('D', 1, 'Điều 1. A2', 'a', [1]) + rows('D', 2, 'Điều 2. B', 'b', [1, 2])
        text = render_report(diff_articles(old, new))
        self.assertIn('heading: 1', text)
        self.assertIn('khoan: 1', text)
        self.assertIn('## D', text)


class MergeRows(unittest.TestCase):
    def test_replaces_only_the_named_documents_and_keeps_the_rest(self):
        existing = [{'document_number': 'A', 'v': 1}, {'document_number': 'B', 'v': 1}]
        incoming = [{'document_number': 'A', 'v': 2}]
        out = merge_rows(existing, incoming, 'document_number', {'A'})
        self.assertEqual(out, [{'document_number': 'B', 'v': 1}, {'document_number': 'A', 'v': 2}])


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Bước 2: chạy test để chắc nó fail**

Run: `corepack yarn test:parser 2>&1 | tail -3`
Expected: FAIL — `No module named 'diff_provisions'`.

- [ ] **Bước 3: viết `diff_provisions.py`**

```python
"""Article-level diff between two provisions.ndjson extracts.

A reseed is only safe to accept when a person has SEEN what changed, article by article
— the 2026-08-13 lesson is that chương/điều COUNTS stayed green while six headings had
been stolen. So this reports heading, first 80 chars of body, and the khoản number list
per Điều, and a count per kind of change.

    python3 diff_provisions.py <old provisions.ndjson> <new provisions.ndjson> [doc,doc,…] > out/diff-report.md
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict


def _articles(rows: list[dict]) -> dict[tuple[str, str], dict]:
    khoan: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        if r['ptype'] == 'khoan' and r.get('parent_key'):
            khoan[r['parent_key']].append(str(r['number']))
    out = {}
    for r in rows:
        if r['ptype'] == 'dieu':
            out[(r['document_number'], str(r['number']))] = {
                'heading': r.get('heading') or '',
                'body80': (r.get('body') or '')[:80],
                'khoan': khoan.get(r['key'], []),
            }
    return out


def diff_articles(old_rows: list[dict], new_rows: list[dict]) -> list[dict]:
    old, new = _articles(old_rows), _articles(new_rows)
    diffs: list[dict] = []
    for k in sorted(set(old) | set(new), key=lambda x: (x[0], int(''.join(ch for ch in x[1] if ch.isdigit()) or 0), x[1])):
        doc, dieu = k
        if k not in new:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'removed', 'old': old[k]['heading'], 'new': None})
            continue
        if k not in old:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'added', 'old': None, 'new': new[k]['heading']})
            continue
        o, n = old[k], new[k]
        if o['heading'] != n['heading']:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'heading', 'old': o['heading'], 'new': n['heading']})
        if o['khoan'] != n['khoan']:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'khoan', 'old': o['khoan'], 'new': n['khoan']})
        if o['body80'] != n['body80']:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'body', 'old': o['body80'], 'new': n['body80']})
    return diffs


def render_report(diffs: list[dict]) -> str:
    counts = defaultdict(int)
    for d in diffs:
        counts[d['change']] += 1
    lines = ['# Báo cáo diff theo điều', '',
             'Tổng: ' + ', '.join(f'{k}: {counts[k]}' for k in ('heading', 'khoan', 'body', 'added', 'removed')), '']
    by_doc: dict[str, list[dict]] = defaultdict(list)
    for d in diffs:
        by_doc[d['document_number']].append(d)
    for doc in sorted(by_doc):
        lines += [f'## {doc}', '', '| Điều | Đổi | Cũ | Mới |', '|---|---|---|---|']
        for d in by_doc[doc]:
            cell = lambda v: (', '.join(v) if isinstance(v, list) else str(v or '—')).replace('|', '/')
            lines.append(f"| {d['dieu']} | {d['change']} | {cell(d['old'])} | {cell(d['new'])} |")
        lines.append('')
    return '\n'.join(lines)


def _read(path: str) -> list[dict]:
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]


if __name__ == '__main__':
    old_path, new_path = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None
    old = [r for r in _read(old_path) if not only or r['document_number'] in only]
    new = [r for r in _read(new_path) if not only or r['document_number'] in only]
    print(render_report(diff_articles(old, new)))
```

- [ ] **Bước 4: viết `merge_into_seed.py`**

```python
"""Replace the corpus.json documents inside db/seed/data/legal/*.ndjson, keep everything else.

parse_provisions.py writes ONLY the documents in corpus.json (7). The seed files also hold
the 8 gazette documents from research/inbox-loader/ingest_congbao.py. Writing the parser
output straight over the seed files would drop those; this merges instead, the same way
ingest_congbao.py keeps rows it did not produce.

R18: machine-regenerated text does not keep `verified` on its own. Pass --verified-by NAME
only after the owner has read the diff report; otherwise --unverified.

    python3 merge_into_seed.py --from out --into ../../db/seed/data/legal --verified-by "Tên"
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def merge_rows(existing: list[dict], incoming: list[dict], key: str, replace_numbers: set[str]) -> list[dict]:
    return [r for r in existing if r[key] not in replace_numbers] + list(incoming)


def _read(p: Path) -> list[dict]:
    return [json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip()]


def _write(p: Path, rows: list[dict]) -> None:
    p.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows), encoding='utf-8')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='src', required=True)
    ap.add_argument('--into', dest='dst', required=True)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--verified-by')
    g.add_argument('--unverified', action='store_true')
    a = ap.parse_args()
    src, dst = Path(a.src), Path(a.dst)

    docs = _read(src / 'documents.ndjson')
    for d in docs:
        d['verification'] = 'verified' if a.verified_by else 'auto_unverified'
        d['verified_by'] = a.verified_by or None
    numbers = {d['number'] for d in docs}
    _write(dst / 'documents.ndjson', merge_rows(_read(dst / 'documents.ndjson'), docs, 'number', numbers))
    for name in ('provisions.ndjson', 'chunks.ndjson'):
        _write(dst / name, merge_rows(_read(dst / name), _read(src / name), 'document_number', numbers))
    print(f'merged {len(numbers)} documents into {dst}: {sorted(numbers)}')


if __name__ == '__main__':
    main()
```

- [ ] **Bước 5: chạy test cho xanh**

Run: `corepack yarn test:parser 2>&1 | tail -3`
Expected: `OK` (17 test).

- [ ] **Bước 6: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add research/legal-loader/diff_provisions.py research/legal-loader/merge_into_seed.py research/legal-loader/test_tools.py
git commit -m "Legal loader: article-level diff report and a merge that keeps the gazette documents"
```

---

### Task 5: Tải lại nguồn, sinh lại kho, báo cáo diff, chờ duyệt

**Files:**
- Create: `research/legal-loader/refetch.py`
- Sinh (gitignored): `research/legal-loader/doc/*`, `research/legal-loader/out/{documents,provisions,chunks}.ndjson`, `research/legal-loader/out/diff-report.md`
- Sinh: `research/inbox-loader/work/` (gitignored — thêm dòng vào `.gitignore`)
- Modify (sau khi duyệt): `db/seed/data/legal/{documents,provisions,chunks}.ndjson`

**Interfaces:**
- Consumes: `apps/ingest/ingest_document.fetch_part_urls(page_url) -> list[tuple[name, url]]`; `parse_provisions.main`; `build_chunks.main`; Task 4.
- Produces: kho `db/seed/data/legal/*.ndjson` nhất quán với parser hiện tại cho **cả 15 văn bản**, và `out/diff-report.md` đã được chủ dự án duyệt.

- [ ] **Bước 1: viết `refetch.py`**

```python
"""Re-download the corpus.json sources into doc/ (gitignored; empty on a fresh clone).

Each corpus entry names the local part files it was parsed from (`doc_file` or an ordered
`doc_files` list, e.g. 25/VBHN-BTC = four gazette-issue PDFs). The Công báo page lists all
downloadable parts in order; we take the parts whose extension matches, in order, and save
them under the names corpus.json expects. curl, not urllib: the CDN omits the GlobalSign
intermediate and Python's OpenSSL refuses it (see research/inbox-loader/ingest_congbao.py).

    python3 refetch.py corpus.json [--only 46/VBHN-BTC,25/VBHN-BTC]
Prints the part→file mapping; CHECK IT before parsing — the mapping is by order, and a page
that grew a new part would shift it.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / 'apps' / 'ingest'))
import ingest_document as ig  # noqa: E402


def wanted_files(doc: dict) -> list[str]:
    return doc.get('doc_files') or [doc['doc_file']]


def pick_parts(parts: list[tuple[str, str]], files: list[str]) -> list[tuple[str, str]]:
    """Parts on the page whose extension matches the corpus files, in page order."""
    ext = Path(files[0]).suffix.lower()
    same = [(n, u) for n, u in parts if Path(n).suffix.lower() == ext]
    if len(same) < len(files):
        raise SystemExit(f'page has {len(same)} {ext} parts, corpus expects {len(files)}: {files}')
    return same[: len(files)]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('corpus')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    only = {s.strip() for s in a.only.split(',') if s.strip()}
    for doc in json.load(open(a.corpus, encoding='utf-8')):
        if only and doc['number'] not in only:
            continue
        files = wanted_files(doc)
        parts = pick_parts(ig.fetch_part_urls(doc['source_url']), files)
        for (name, url), local in zip(parts, files):
            out = HERE / local
            out.parent.mkdir(parents=True, exist_ok=True)
            print(f"{doc['number']}: {name} -> {local}")
            r = subprocess.run(['curl', '-sS', '-L', '--max-time', '240', '-o', str(out), '-w', '%{http_code}', url],
                               capture_output=True, text=True)
            if r.stdout != '200':
                raise SystemExit(f"{doc['number']}: HTTP {r.stdout} for {name}")


if __name__ == '__main__':
    main()
```

- [ ] **Bước 2: tải lại và kiểm ánh xạ**

Run: `cd research/legal-loader && python3 refetch.py corpus.json`
Expected: mỗi dòng `<số hiệu>: <tên trên Công báo> -> doc/<tên corpus>`; tổng 11 file trong `doc/`. **Đọc bằng mắt** mapping của 46/VBHN-BTC (2 PDF) và 25/VBHN-BTC (4 PDF, các số Công báo 913…919 theo memory dự án). Nếu trang Công báo không còn đủ part → dừng, hỏi chủ dự án.

- [ ] **Bước 3: sinh lại 7 văn bản corpus**

Run: `cd research/legal-loader && python3 parse_provisions.py corpus.json out && python3 build_chunks.py out out`
Expected: 7 dòng đếm với `[chuong … OK · dieu … OK]`; `wrote 7 documents.ndjson · N provisions.ndjson`; `chunks.ndjson` sinh trong `out/`. Nếu một dòng `CHECK!!` → parser đổi số điều; dừng và báo.

- [ ] **Bước 4: sinh lại 8 văn bản Công báo với parser đã sửa**

Run: `echo "research/inbox-loader/work/" >> .gitignore && cd research/inbox-loader && python3 ingest_congbao.py --work work --download`
Expected: 8 dòng `✅ …` như đợt 2026-09-10; `Đã ghi: 15 văn bản · … điều khoản`. (Việc này ghi thẳng vào `db/seed/data/legal/` cho 8 văn bản đó — chúng vốn `auto_unverified` nên không cần duyệt.)

- [ ] **Bước 5: báo cáo diff cho cả 15 văn bản**

Run:
```bash
cd research/legal-loader
git show HEAD:db/seed/data/legal/provisions.ndjson > out/provisions.before.ndjson
cat out/provisions.ndjson > out/provisions.corpus.ndjson
python3 - <<'EOF'
import json
seed=[json.loads(l) for l in open('../../db/seed/data/legal/provisions.ndjson',encoding='utf-8')]
corpus={json.loads(l)['number'] for l in open('out/documents.ndjson',encoding='utf-8')}
new=[r for r in seed if r['document_number'] not in corpus]+[json.loads(l) for l in open('out/provisions.corpus.ndjson',encoding='utf-8')]
open('out/provisions.after.ndjson','w',encoding='utf-8').write(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in new))
EOF
python3 diff_provisions.py out/provisions.before.ndjson out/provisions.after.ndjson > out/diff-report.md
head -5 out/diff-report.md
```
Expected: dòng `Tổng:` có `heading: 5` (25/VBHN-BTC Điều 18/33/51; 33/2023/TT-BTC Điều 9/20), `khoan` ≥ 1 (46/VBHN-BTC Điều 10: `1, 2, 3, 4, 20, 5, 6` → `1, 2, 3, 4, 5, 6`), `added: 0`, `removed: 0`. 31/2018 và 128/2020 không xuất hiện. Nếu `heading` ≠ 5 → so `DIEU_REFERENCE` với dòng thật, thêm ca test, lặp lại từ Bước 3.

- [ ] **Bước 6: cổng duyệt của chủ dự án**

Gửi `out/diff-report.md` cho chủ dự án, kèm tin nhắn nói rõ mục 2 của báo cáo (8 điều "có thể còn cụt"):
- **5 điều đã xác nhận tiêu đề vẫn cụt** (đối chiếu chữ in đậm trong PDF gốc), thân điều mở đầu giữa câu: 25/VBHN-BTC Điều 14, 76; 46/VBHN-BTC Điều 18; 54/VBHN-VPQH Điều 55, 101.
- 25/VBHN-BTC Điều 44 nhiều khả năng là báo nhầm: thân điều nhắc lại tiêu đề.
- 25/VBHN-BTC Điều 80 và 54/VBHN-VPQH Điều 66 **chưa xác nhận** — cần kiểm tay.

Chủ dự án quyết định **theo từng văn bản** (7 văn bản, không phải một quyết định chung). Chỉ tiếp tục khi mỗi văn bản có một trong hai câu trả lời:
- "giữ verified" → văn bản đó vào nhóm `--verified-by "<tên chủ dự án>"` ở Bước 7;
- không duyệt → văn bản đó vào nhóm `--unverified` ở Bước 7.

- [ ] **Bước 7: gộp vào kho**

Trước khi gộp: nếu chủ dự án xác nhận `gazette_issue` của 128/2020/NĐ-CP sai, sửa `corpus.json` và sinh lại `out/` (Bước 3) trước — xem mục "Việc phát sinh từ Mảng 1".

Mỗi nhóm quyết định ở Bước 6 chạy một lần, `--only` liệt kê số hiệu văn bản của nhóm (bỏ `--only` = cả 7 văn bản trong `out/`). Ví dụ:
```bash
cd research/legal-loader
python3 merge_into_seed.py --from out --into ../../db/seed/data/legal --only 33/2023/TT-BTC,46/VBHN-BTC --verified-by "<tên>"
python3 merge_into_seed.py --from out --into ../../db/seed/data/legal --only 25/VBHN-BTC --unverified
```
Expected: mỗi lần in `merged N documents into … as …` với đúng các văn bản của nhóm; qua mọi lần chạy, mỗi văn bản trong `out/documents.ndjson` được gộp đúng một lần; `wc -l ../../db/seed/data/legal/*.ndjson` cho `documents` = 15.

- [ ] Sau khi gộp xong: đổi mặc định trong `db/seed/legal.ts` (`verification: d.verification ?? 'verified'`) thành `'auto_unverified'`, để một dòng sau này thiếu trường `verification` không bao giờ bị coi là đã xác minh (R18).

- [ ] **Bước 8: kiểm bằng mắt 10 điều ngẫu nhiên**

Run:
```bash
python3 -c "
import json,random
rows=[json.loads(l) for l in open('db/seed/data/legal/provisions.ndjson',encoding='utf-8')]
d=[r for r in rows if r['ptype']=='dieu']; random.seed(13)
for r in random.sample(d,10): print(r['document_number'],'|',r['heading'][:70],'|',(r['body'] or '')[:60].replace(chr(10),' '))"
```
Expected: mọi `heading` là cụm danh từ hoàn chỉnh, không cụt; không thân điều bắt đầu giữa câu. **Không tin số đếm** (bài học 2026-08-13).

- [ ] **Bước 9: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add research/legal-loader/refetch.py .gitignore db/seed/data/legal/documents.ndjson db/seed/data/legal/provisions.ndjson db/seed/data/legal/chunks.ndjson db/seed/data/legal/annex-tables.ndjson
git commit -m "Legal corpus: regenerate all 15 documents with the current parser (5 stolen headings, 1 phantom clause fixed)"
```

---

### Task 6: Embedder có rào, và đo mục dài

**Files:**
- Modify: `apps/embedder/server.py`
- Modify: `docker-compose.yml` (service `embedder`: `environment`, `ports`)
- Modify: `.env.example`
- Create: `research/inbox-loader/measure_embed.py`
- Create: `research/inbox-loader/test_measure_embed.py`

**Interfaces:**
- Produces: `EMBED_MAX_TOKENS` (mặc định 2048) giới hạn `model.max_seq_length`; embedder nghe `127.0.0.1:8000` trên host; `pick_samples(records: list[dict], batch: int = 32, min_chars: int = 8000) -> tuple[dict, list[dict]]`; số đo `giây/mục` và RSS đỉnh ghi vào spec §2.6.

- [ ] **Bước 1: viết test thất bại**

```python
# research/inbox-loader/test_measure_embed.py
import unittest

from measure_embed import pick_samples


class PickSamples(unittest.TestCase):
    def test_returns_the_longest_record_and_a_batch_of_long_ones(self):
        recs = [{'text_vi': 'a' * 100}, {'text_vi': 'b' * 9000}, {'text_vi': 'c' * 48000}, {'text_vi': 'd' * 8500}]
        longest, batch = pick_samples(recs, batch=32, min_chars=8000)
        self.assertEqual(len(longest['text_vi']), 48000)
        self.assertEqual(sorted(len(r['text_vi']) for r in batch), [8500, 9000, 48000])

    def test_batch_is_capped(self):
        recs = [{'text_vi': 'x' * 9000} for _ in range(50)]
        _, batch = pick_samples(recs, batch=32, min_chars=8000)
        self.assertEqual(len(batch), 32)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Bước 2: chạy test để chắc nó fail**

Run: `python3 -m unittest discover -s research/inbox-loader -p 'test_measure*.py'`
Expected: FAIL — `No module named 'measure_embed'`.

- [ ] **Bước 3: viết `measure_embed.py`**

```python
"""Measure the embedder on the long evidence sections mảng 2 will send it.

Everything embedded before 2026-09-13 was ≤ 1,600 chars. Explanatory-note records run to
~49,000 chars, and BGE-M3 attention cost grows with length — on a 4-core/8 GB VPS shared
with Postgres and the API that is a real OOM risk, and nothing in the repo measured it.
The spec (bot-answer-parity-design.md §2.6) makes this measurement the first task of
mảng 2; EMBED_CHARS / EMBED_MAX_TOKENS are chosen from what this prints.

    EMBEDDER_URL=http://127.0.0.1:8000 python3 measure_embed.py ../../db/seed/data/legal/hs-explanatory-notes.ndjson
While it runs, in another shell:  docker stats --no-stream  (read the embedder's MEM USAGE peak)
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.request


def pick_samples(records: list[dict], batch: int = 32, min_chars: int = 8000) -> tuple[dict, list[dict]]:
    longest = max(records, key=lambda r: len(r.get('text_vi', '')))
    long_ones = [r for r in records if len(r.get('text_vi', '')) >= min_chars]
    return longest, long_ones[:batch]


def embed(url: str, texts: list[str]) -> float:
    body = json.dumps({'texts': texts}).encode()
    req = urllib.request.Request(f'{url}/embed', data=body, headers={'content-type': 'application/json'})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=1800) as r:
        json.load(r)
    return time.time() - t0


def main() -> None:
    url = os.environ.get('EMBEDDER_URL', 'http://127.0.0.1:8000').rstrip('/')
    records = [json.loads(l) for l in open(sys.argv[1], encoding='utf-8') if l.strip()]
    longest, batch = pick_samples(records)
    t1 = embed(url, [longest['text_vi']])
    print(f'1 record of {len(longest["text_vi"]):,} chars: {t1:.1f}s')
    t2 = embed(url, [r['text_vi'] for r in batch])
    print(f'batch of {len(batch)} records ≥ 8,000 chars ({sum(len(r["text_vi"]) for r in batch):,} chars): {t2:.1f}s → {t2 / max(1, len(batch)):.1f}s/record')


if __name__ == '__main__':
    main()
```

- [ ] **Bước 4: chạy test cho xanh**

Run: `python3 -m unittest discover -s research/inbox-loader -p 'test_measure*.py'`
Expected: `OK` (2 test).

- [ ] **Bước 5: rào ở sidecar + cổng đo + biến môi trường**

`apps/embedder/server.py` — ngay sau `model = SentenceTransformer(MODEL_NAME)`:

```python
# Hard cap on input length, independent of what any caller sends. BGE-M3 accepts 8,192
# tokens, but full-length attention on CPU for a 48k-char explanatory note is exactly the
# unmeasured memory spike an 8 GB VPS cannot absorb. Tune from research/inbox-loader/
# measure_embed.py; the seed additionally caps embed_text by characters (EMBED_CHARS).
model.max_seq_length = int(os.environ.get('EMBED_MAX_TOKENS', '2048'))
```

`docker-compose.yml`, service `embedder`:

```yaml
    environment:
      EMBED_MODEL: "${EMBED_MODEL:-BAAI/bge-m3}"
      EMBED_ID: "${EMBED_ID:-bge-m3@1}"
      # Token cap per input (see apps/embedder/server.py). Measured, not guessed —
      # research/inbox-loader/measure_embed.py; the number is recorded in the spec §2.6.
      EMBED_MAX_TOKENS: "${EMBED_MAX_TOKENS:-2048}"
    ports:
      # Localhost only — for measure_embed.py and one-off checks; inside compose it is embedder:8000.
      - "127.0.0.1:8000:8000"
```

`.env.example` — thêm:

```bash
# Subscription token for the Claude Code CLI (intent planning, vision, grounded answers).
# Get it with `claude setup-token` on a logged-in machine. Empty = model layer off;
# /health reports "llm":"no_token"; tariff lookup is unaffected.
CLAUDE_CODE_OAUTH_TOKEN=

# Comma-separated Zalo threadIds the bot answers (empty = everyone).
ALLOWED_THREADS=

# Token cap per embedder input; choose from research/inbox-loader/measure_embed.py.
EMBED_MAX_TOKENS=2048
```

- [ ] **Bước 6: đo trên VPS (sau Task 8 dựng máy)**

Run trên VPS: `docker compose up -d embedder && EMBEDDER_URL=http://127.0.0.1:8000 python3 research/inbox-loader/measure_embed.py db/seed/data/legal/hs-explanatory-notes.ndjson`; song song `docker stats --no-stream | grep embedder`.
Expected: hai dòng thời gian; ghi **giây/mục** và **MEM USAGE đỉnh** vào spec §2.6 (thay câu "khởi điểm 6.000 ký tự" bằng số đo và giá trị `EMBED_CHARS` chọn). Cổng đạt: không OOM, lô 32 mục dưới 5 phút. Nếu quá → hạ `EMBED_MAX_TOKENS` xuống 1024 và đo lại.

- [ ] **Bước 7: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add apps/embedder/server.py docker-compose.yml .env.example research/inbox-loader/measure_embed.py research/inbox-loader/test_measure_embed.py
git commit -m "Embedder: cap input tokens and measure long evidence sections before seeding them"
```

---

### Task 7: CLI `claude` vào image, `/health` báo `llm=up`

**Files:**
- Modify: `apps/api/Dockerfile` (stage `runtime`)

**Interfaces:**
- Produces: image `customs-assistant:local` có `claude` trên PATH; `/health` trả `"llm":"up"` khi `CLAUDE_CODE_OAUTH_TOKEN` đặt. (Kế hoạch M0 Task 1 đánh dấu bước này xong nhưng Dockerfile không có — VPS cũ dùng `docker-compose.override.yml` ngoài git.)

- [ ] **Bước 1: sửa Dockerfile**

Trong stage `runtime`, sau dòng `ENV NODE_ENV=production` (hoặc ngay sau `FROM base AS runtime` nếu không có):

```dockerfile
# The model layer (planner, vision, grounded answers) shells out to the Claude Code CLI,
# which runs on the project's subscription rather than a metered key. Installed HERE, in
# the shared runtime stage, so both `api` and `zalo-bot` have it. Before this the old VPS
# mounted the binary through an override file that never reached git — a clean deploy had
# no CLI, and every model-backed feature degraded silently.
RUN npm install -g @anthropic-ai/claude-code && claude --version
```

- [ ] **Bước 2: build và kiểm**

Run: `docker compose build migrate 2>&1 | tail -3 && docker compose run --rm --no-deps --entrypoint claude api --version`
Expected: build thành công; in phiên bản CLI.

- [ ] **Bước 3: kiểm `/health` end-to-end (cần token trong `.env`)**

Run: `docker compose up -d api && sleep 5 && curl -s localhost:3000/health`
Expected: JSON có `"llm":"up"` (với token) hoặc `"llm":"no_token"` (không token) — **không** `no_cli`.

- [ ] **Bước 4: cập nhật kế hoạch M0**

Trong [03-llm-expansion-tasks.md](03-llm-expansion-tasks.md) Task 1, đổi ghi chú Bước 6/8 thành "xong 2026-09-13 (Dockerfile) — trước đó chỉ có trên VPS qua override".

- [ ] **Bước 5: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add apps/api/Dockerfile .agent/planning/03-llm-expansion-tasks.md
git commit -m "Image: ship the Claude Code CLI so a clean deploy keeps the model layer"
```

---

### Task 8: Sao lưu đêm và runbook VPS

**Files:**
- Create: `db/backup.sh`
- Modify: `README.md` (mục mới "Triển khai máy chủ (VPS)" sau "Chạy local")

**Interfaces:**
- Produces: `db/backup.sh` — chạy trên host VPS trong thư mục deploy; ghi `customs-backup-YYYY-MM-DD.tgz` lên `gdrive:Legal-AI-Backup/`; cron 02:00 hằng ngày.
- Consumes: rclone remote `gdrive` (đã cấu hình trên Mac; chép `~/.config/rclone/rclone.conf` sang VPS bằng `scp`, **không** commit).

- [ ] **Bước 1: viết `db/backup.sh`**

```bash
#!/usr/bin/env bash
# Nightly backup of the two things that cannot be regenerated from git:
#   - lookup_confirmation  (staff HS rulings, verify-on-use)   — lost once with the old VPS
#   - legal_document verification state (who vouched for which document)
# NOT backed up, on purpose: conversation, conversation_turn, decision_log — they carry
# third-party personal data and live 30 days by rule (business-rules.md R14).
# Run from the compose directory. Needs an rclone remote named `gdrive` on this host.
set -euo pipefail
STAMP=$(date +%F)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

docker compose exec -T db pg_dump -U app -d customs_assistant --data-only -t lookup_confirmation \
  > "$WORK/lookup_confirmation.sql"
docker compose exec -T db psql -U app -d customs_assistant -At -c \
  "COPY (SELECT number, verification, verified_by FROM legal_document ORDER BY number) TO STDOUT WITH CSV HEADER" \
  > "$WORK/legal_document_verification.csv"

tar -czf "/tmp/customs-backup-$STAMP.tgz" -C "$WORK" .
rclone copy "/tmp/customs-backup-$STAMP.tgz" "gdrive:Legal-AI-Backup/"
rm -f "/tmp/customs-backup-$STAMP.tgz"
echo "backup $STAMP ok"
```

- [ ] **Bước 2: kiểm cú pháp và quyền chạy**

Run: `chmod +x db/backup.sh && bash -n db/backup.sh && echo syntax-ok`
Expected: `syntax-ok`.

- [ ] **Bước 3: viết mục runbook trong `README.md`** (chèn sau mục "Chạy local")

> Ghi chú 2026-09-13: máy chủ thực tế là server dev dùng chung của MONA — xem [ADR](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md) và [runbook](../docs/mona-dev-server-operations.md); khối dưới là văn bản gốc của Task 8.

```markdown
## Triển khai máy chủ (VPS)

Máy: Ubuntu 24.04, 4 core / 8 GB, Docker Engine + Compose plugin. Thư mục deploy `/opt/customs-assistant`.

1. **Đưa mã lên** (giữ nguyên `.env` trên máy chủ): `git archive HEAD | ssh vps 'mkdir -p /opt/customs-assistant && cd /opt/customs-assistant && tar xf -'`
2. **`.env`** theo `.env.example`: `CLAUDE_CODE_OAUTH_TOKEN` (lấy bằng `claude setup-token` trên máy đã đăng nhập), `ALLOWED_THREADS`, `EMBED_MAX_TOKENS`. Không bao giờ in token.
3. **rclone** cho sao lưu: `scp ~/.config/rclone/rclone.conf vps:~/.config/rclone/` — file này chứa token Drive, không commit.
4. **Dựng**: `docker compose build migrate embedder && docker compose up -d` — thứ tự tự đảm bảo: db → migrate → seed → seed-legal (embed qua sidecar, ~1 giờ lần đầu) → api → zalo-bot.
5. **Kiểm**: `curl -s localhost:3000/health` phải có `"db":"up"`, `"pgvector"`, `"llm":"up"`.
6. **Bot**: lần đầu quét QR tại `docker compose exec zalo-bot cat /session/qr.png > qr.png` (mở ảnh, quét bằng TÀI KHOẢN ZALO RIÊNG của bot). Session lưu trong volume `zalo_session`.
7. **Sao lưu đêm**: `crontab -e` → `0 2 * * * cd /opt/customs-assistant && ./db/backup.sh >> /var/log/customs-backup.log 2>&1`. Kiểm lần đầu bằng tay: `./db/backup.sh` rồi `rclone ls gdrive:Legal-AI-Backup/`.
8. **Đo embedder** (một lần, trước khi nạp tầng bằng chứng): xem `research/inbox-loader/measure_embed.py`.

Cập nhật mã: bước 1 lại, rồi `docker compose build migrate && docker compose up -d --no-deps --force-recreate api zalo-bot` (không đụng db/embedder). Chỉ bot: `docker compose up -d --no-deps zalo-bot`.
```

- [ ] **Bước 4: thực hiện trên VPS mới** (chủ dự án cung cấp máy)

Run: các bước 1–7 của runbook.
Expected: `/health` như bước 5; `rclone ls gdrive:Legal-AI-Backup/` thấy một file `.tgz`; bot trả lời một tin "8481.80.99 TQ" trong thread cho phép.

- [ ] **Bước 5: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add db/backup.sh README.md
git commit -m "Ops: nightly backup of rulings and verification state; VPS runbook"
```

---

### Task 9: Baseline mảng 1

**Files:**
- Sinh: `fixtures/eval-baseline.json`
- Modify: `.agent/planning/02-progress.md`, `.agent/docs/bot-answer-parity-design.md` (§2.6 số đo), `.agent/planning/05-bot-parity-tasks.md` (trạng thái)

**Interfaces:**
- Produces: con số baseline mà mảng 2–4 được chấm so với: recall@5, abstain, HS top-1/top-3, notebook đạt x/14, nhóm an toàn y/z, số đo embed.

- [ ] **Bước 1: nạp kho đã sinh lại**

Run (VPS hoặc Docker local có embedder): `FORCE_RESEED=1 docker compose run --rm --no-deps seed-legal 2>&1 | tail -5`
(bắt buộc `--no-deps`: thiếu nó, compose chạy lại cả `seed` với cùng `FORCE_RESEED=1` và nạp lại các bảng biểu thuế vô ích)
Expected: `+ 15 legal_document`, số provisions/chunks khớp `wc -l` các file ndjson.

- [ ] **Bước 2: chạy eval**

`yarn eval` không chạy được trong image hay trên máy chủ: `.dockerignore` loại `fixtures`, image không có `apps/eval`. Chạy từ máy Mac qua đường hầm SSH:
Run: `ssh -N -L 3000:127.0.0.1:<cổng host của api> <host>` (mặc định 3000; máy dev MONA dùng 3060 — kế hoạch 06), rồi ở shell khác `EVAL_API_URL=http://localhost:3000 corepack yarn eval`
Expected: in ba khối (PHÁP LUẬT, MÃ HS, NOTEBOOK); `Đã ghi fixtures/eval-baseline.json`. Với endpoint `/legal`, khối NOTEBOOK có `kiểm bị bỏ qua (response không mang trường cần chấm)` > 0 và `chưa chấm` ≥ 1 (nb-07 chỉ có `expectIntent`, `/legal` không trả `plan`) — đúng dự kiến; ca chưa chấm không tính vào `nhóm an toàn đạt`.

- [ ] **Bước 3: ghi lại**

Trong `02-progress.md`: mục "Tiếp tục từ đây" → "Mảng 1 xong; con số baseline: …" (chép nguyên văn từ báo cáo); bảng trạng thái thêm hàng Mảng 1–4; nhật ký phiên một mục. Trong spec §2.6: thay khởi điểm bằng số đo Task 6. Trong file này: đánh dấu Task 1–9.

- [ ] **Bước 4: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add fixtures/eval-baseline.json .agent/planning/02-progress.md .agent/planning/05-bot-parity-tasks.md .agent/docs/bot-answer-parity-design.md
git commit -m "Baseline before the bot-parity upgrade: legal, HS, and the 14 notebook questions"
```

---

## Việc phát sinh từ Mảng 1

- [ ] **5 tiêu đề còn cụt** — 25/VBHN-BTC Điều 14, 76; 46/VBHN-BTC Điều 18; 54/VBHN-VPQH Điều 55, 101. Phần đuôi tiêu đề mở đầu bằng chữ hoa, chữ viết tắt hoặc chữ số ("Giấy…", "DNCX…", "Việt Nam", "Nam…", "78/2006/QH11…"), mà `_is_heading_continuation` chỉ nối dòng mở đầu bằng chữ thường. Việc tiếp: sửa parser để nối an toàn các dòng tiếp này (có ca test cho từng dạng, không nuốt dòng thân điều viết hoa hay khoản "1. …"), sinh lại, diff lại. Không làm trong kế hoạch này (Ruling R18 trong `.superpowers/sdd/05-bot-parity-tasks/progress.md`: đổi heuristic có thể nuốt nhầm dòng thân điều của cả 15 văn bản — R3).
- [ ] **100 khoá khoản/điểm trùng** trong 7 văn bản corpus (+17 trong 72/2022/NĐ-CP) — `db/seed/legal.ts` chỉ giữ dòng cuối cho mỗi khoá, nên mọi chunk của một khoá trùng trỏ về cùng một dòng provision. Kiểm xem trích dẫn có hiện văn bản của khoản khác không (R3).
- [ ] **128/2020/NĐ-CP `gazette_issue`** — `corpus.json` (và `out/documents.ndjson`, seed) ghi `"1023+1024"`, `gazette_date` `2020-11-02`; trang Công báo của văn bản ghi "Nằm trong các Công báo: 1027 + 1028", số báo đó ngày 04/11/2020 (kiểm 2026-09-13). Chủ dự án xác nhận, rồi sửa `corpus.json` và sinh lại `out/` **trước Bước 7** của Task 5 (không thì bản gộp mang lại giá trị cũ).

---

## Mảng 2 · Tầng bằng chứng — phác thảo (chi tiết hoá sau Task 6 và 9)

**Cấu trúc file**

| File | Trách nhiệm |
|---|---|
| `db/migrations/0010_evidence_section.sql` + `db/migrations/meta/_journal.json` | bảng `evidence_section` (cột theo spec §2.1, HNSW cosine, GIN tsv, index `(kind)`, `(document_number)`, `(hs_heading)`, GIN `hs_codes`), bảng `decision_log(id, created_at, thread_id, plan jsonb, evidence_ids bigint[], citation_ids bigint[], violations jsonb, timing jsonb, calls smallint)` |
| `db/schema/index.ts` | `evidenceSection`, `decisionLog` |
| `db/seed/evidence.ts` | đọc các builder, embed theo lô ≤32 mục / ≤64.000 ký tự, upsert theo `(kind, instrument, source_ref)`, embed lại khi `meta.md5` đổi, `FORCE_RESEED` |
| `db/seed/evidence/{notes,gri,en,sen,rulings,guidance,annex,status,decree,windows,agentNotes}.ts` | mỗi file một builder `build(): EvidenceRow[]` cho một kind (windows: local_doc/draft/internal theo mốc cấu trúc + 4.000/400 lặp header) |
| `db/seed/evidence.spec.ts` | các khoá số ở spec §7 (33 `status`, 13/2022 một mục hai dòng, cửa sổ 1725 có `hs_codes`…) |
| `research/inbox-loader/render_notebook.py` | xuất `db/seed/data/legal/nghiep-vu.json` (danh sách `NGHIEP_VU`) để seed và notebook cùng nguồn |
| `apps/api/src/modules/tariff/tariff.service.ts` (+ spec) | Chương 98 hai chiều, `schedule=all` (lộ trình), listing theo tiền tố không `LIMIT 25` |
| `apps/api/src/modules/health/health.service.ts` | `evidenceSections` count, `embedder` up/down |

**Hợp đồng giao diện**

```ts
export interface EvidenceRow {
  kind: 'hs_note'|'gri'|'en'|'sen'|'ruling'|'guidance'|'annex_table'|'status'|'local_doc'|'draft'|'internal'|'note';
  instrument: string; instrumentDate: string | null;
  authority: 'binding'|'authoritative'|'administrative'|'reference'|'undetermined';
  hsChapter: number | null; hsHeading: string | null; hsCodes: string[]; documentNumber: string | null;
  title: string; body: string; embedText: string;
  effectiveFrom: string; effectiveTo: string | null; effectiveness: 'con_hieu_luc'|'het_hieu_luc'|'het_hieu_luc_mot_phan'|'chua_co_hieu_luc';
  verification: 'verified'|'auto_unverified'; verifiedBy: string | null; sourceRef: string; meta: Record<string, unknown>;
}
export const EMBED_CHARS: number;   // từ số đo Task 6
export function extractHsCodes(body: string): string[];        // mọi \d{4}\.\d{2}\.\d{2}
export function windowText(text: string, header: string, size?: number, overlap?: number): string[]; // lặp header
export function statusSections(documents: DocRow[], relations: RelationRow[]): EvidenceRow[]; // spec §2.3
```

**Việc (mỗi việc một chu kỳ test; thứ tự bắt buộc)**

1. Migration 0010 + schema + `db:migrate` chạy sạch trên DB rỗng và DB đã có.
2. `extractHsCodes`, `windowText`, `statusSections` — thuần, test trước.
3. Builder từng kind theo bảng spec §2.2 (11 builder), mỗi builder một test đếm và một test nội dung mẫu.
4. `db/seed/evidence.ts` + compose service `seed-evidence` (sau `seed-legal`), idempotent.
5. `/tariff`: Chương 98 hai chiều + `schedule` + listing; test golden hai ca Chương 98.
6. Chạy seed trên VPS trong ngưỡng đo Task 6; `/health.evidenceSections` ≈ 2.000.
7. Cổng: `yarn eval` (endpoint `/legal` — chưa có `/answer`) không tụt; `evidence.spec` xanh; kiểm SQL thật cho `simple` parser với số hiệu (spec §3.3).

## Mảng 3 · Đường trả lời — phác thảo (chi tiết hoá sau mảng 2)

**Cấu trúc file**

| File | Trách nhiệm |
|---|---|
| `apps/api/src/modules/answer/answer.module.ts`, `answer.controller.ts` (`POST /answer`, `GET /evidence/:id`) | nối NestJS |
| `answer.service.ts` | điều phối năm bước, `decision_log` |
| `plan.ts` | prompt bước 1, `normalizePlan(raw): Plan` (tập intent 9 giá trị, `kinds` gợi ý, `scope.hs` 4–8 số) |
| `retrieve.ts` | SQL lai trên `legal_chunk` và `evidence_section` với hai cửa sổ, lọc HS theo spec §3.3, RRF gộp truy vấn, đa dạng hoá; `toTsQuery` giữ `\d{2}\.\d{2}` |
| `expand.ts` | mở rộng theo bảng spec §3.4, trần 40.000 token, mục `tariff` sinh tức thì |
| `compose.ts` | prompt bước 4 + khối "quy ước đọc bằng chứng" + chế độ ứng viên; `runClaude(prompt, timeoutMs)` dùng chung (chuyển từ `legal.generation.ts`) |
| `guards.ts` (+ `guards.spec.ts`) | năm luật §3.6, `candidates` §3.8, tách câu, chuẩn hoá; các ca test liệt kê ở spec §7 |
| `repair.ts` | gọi #3 với danh sách vi phạm; cắt câu khi còn vi phạm |
| `types.ts` | `AnswerRequest`, `AnswerResponse`, `Plan`, `Citation`, `Candidate` đúng JSON spec §3.1 |
| `apps/api/src/modules/conversation/conversation.service.ts` | `sweepIdle` xoá `decision_log` > 30 ngày |
| `apps/zalo-bot/render.mjs` (+ `render.test.mjs`) | markdown → chữ Zalo, danh sách nguồn, một dòng cảnh báo, khối ứng viên, tách tin ~1.800 |
| `apps/zalo-bot/dispatch.mjs` (+ test) | `INTENTS` thêm `status`/`hs`/`mixed` pass-through |
| `apps/zalo-bot/index.mjs`, `api.mjs`, `answer.mjs`, `conversation.mjs`, `parse.mjs` | gọi `/answer`, ack "🔍 Đang tra…", `forceIntent`, `state.legal.evidenceIds`, `parseQuery` bắt `\d{4}\.\d{2}` và "nhóm dddd" |

**Hợp đồng giao diện:** đúng JSON ở spec §3.1; `guards.check(answer: ComposeResult, evidence: ExpandedSection[], userTokens: string[]): Violation[]`; `render(answer: AnswerResponse): string[]` (mảng tin đã tách).

**Việc:** (1) `types.ts` + `guards.ts` TDD với mọi ca §7; (2) `plan.ts` + `normalizePlan` test; (3) `retrieve.ts` với test SQL thật trên DB seed (Phần XVI, 16/2026, mũ bảo hiểm, 84.18); (4) `expand.ts` + trần token; (5) `compose.ts` + `repair.ts`; (6) `answer.service` + controller + `decision_log` + sweep; (7) bot: `render.mjs` TDD, `dispatch` mở rộng, `index.mjs` nối, ack; (8) `yarn eval` với `EVAL_ANSWER_ENDPOINT=/answer`: 14/14 có bằng chứng truy hồi (`expectEvidence`), `numbersOutsideSentenceQuote = 0`, `citationsProven = 100%`, p95 ≤ 120s.

## Mảng 4 · Nghiệm thu — phác thảo (chi tiết hoá sau mảng 3)

| File | Trách nhiệm |
|---|---|
| `fixtures/ab-questions.json` | ~35 câu: 14 notebook + 22 golden chọn lọc + câu chủ dự án cung cấp; mỗi câu có `notebookAnswer` do chủ dự án dán |
| `apps/eval/ab.ts` | chạy bot qua `/answer`, sinh `fixtures/ab-sheet.html` (che tên, trộn A/B theo seed), đọc lại `fixtures/ab-grades.json`, in tỉ lệ thắng/ngang và nhóm an toàn |
| `research/inbox-loader/notebook_ask.py` (tuỳ chọn) | thử tự động hỏi notebook qua Playwright; bỏ nếu không ổn định |

**Cổng đạt** (spec §7): thắng/ngang ≥ 70%; nhóm an toàn 100%; recall@5 ≥ baseline; trích dẫn qua kiểm 100%; số ngoài `quote` cùng câu = 0; p95 ≤ 120s; seed evidence trong ngưỡng đo.

## Kiến thức liên quan

- [Thiết kế bot trả lời ngang notebook](../docs/bot-answer-parity-design.md) — spec bản 2
- [ADR bảng bằng chứng chung và câu trả lời dài](../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md)
- [Kế hoạch mở rộng LLM (M0…M4)](03-llm-expansion-tasks.md) — M0 Task 1 bước 6 thực ra chưa xong (Task 7 ở đây)
- [Nhật ký tiến độ](02-progress.md)
