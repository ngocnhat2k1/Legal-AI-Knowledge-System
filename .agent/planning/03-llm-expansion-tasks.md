---
type: planning
status: active
updated: 2026-08-14
related:
  - ../docs/llm-expansion-design.md
  - ../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md
  - 02-progress.md
  - ../docs/evaluation.md
---

# Kế hoạch triển khai — mở rộng LLM (M0 … M4)

> **Cho người thực thi:** đọc [spec thiết kế](../docs/llm-expansion-design.md) trước. Kế hoạch này
> lập luận từ spec đó; hai file đi cùng nhau. Các bước dùng checkbox `- [ ]` để theo dõi.

**Mục tiêu:** hệ thống dùng LLM ở nhiều chỗ hơn (mở rộng truy vấn, rerank, sinh chỉ mục chủ đề,
biên dịch chú giải, duyệt cây HS) mà không nới một rào chắn nào trong `business-rules.md`.

**Kiến trúc:** LLM sinh *giả thuyết* → hệ thống *kiểm chứng tất định* → LLM chỉ *chọn và loại* trên
bằng chứng nguyên văn. Việc nặng đẩy sang job nền vì `claude -p` là tuần tự.

**Tech stack:** NestJS 11 · Drizzle/postgres.js · Postgres 17 + pgvector · Python 3.12 (pdfplumber) ·
BGE-M3 · `claude -p` CLI · Jest (TS) · `unittest` (Python).

**Spec:** [../docs/llm-expansion-design.md](../docs/llm-expansion-design.md)

## Ràng buộc toàn cục

- **Ngân sách LLM:** tối đa **2 lần gọi** `claude -p` cho một lượt chat. Job nền không giới hạn.
- **Con số biểu thuế không bao giờ do LLM sinh** — [R1](../business-rules.md).
- **Mã HS là top-3 kèm bằng chứng nguyên văn**, không bao giờ là một mã trần — [R2](../business-rules.md).
- **Hiệu lực là bộ lọc cứng**, không phải tín hiệu xếp hạng — [R8](../business-rules.md).
- Mọi đầu ra LLM phải qua một cổng kiểu bằng code trước khi tới người dùng.
- Tài liệu viết tiếng Việt; mã nguồn, định danh, tên file, thông điệp commit viết tiếng Anh.
- **Chỉ commit khi chủ dự án yêu cầu** (`.agent/AGENTS.md` bước 13). Các bước "Commit" dưới đây
  là nội dung commit đã soạn sẵn, chạy khi được yêu cầu.

## Phân rã theo mốc

M0 nằm trọn trong kế hoạch này (Task 1–3). M1–M4 mỗi mốc là một hệ thống con độc lập và sẽ có kế
hoạch riêng, viết khi tới lượt — vì mỗi mốc phải tự nó cho ra phần mềm chạy được và đo được, và
viết trước 4 mốc bây giờ là viết chi tiết cho những thứ baseline M0 chưa đo.

| Mốc | Phạm vi | Kế hoạch |
|---|---|---|
| **M0** | Nền móng: wire CLI · sửa parser · `yarn eval` | **file này, Task 1–3** |
| M1 | Kho rộng: bulk ingest song song · tự nạp tức thì · `gazette_topic` | viết sau M0 |
| M2 | Truy hồi: đa truy vấn · rerank có cổng · vòng hai có trần | viết sau M1 |
| M3 | `hs_note` + biên dịch chú giải thành mệnh đề | viết sau M2 |
| M4 | Đường phân loại B1–B4 + kiểm toán nhất quán | viết sau M3 |

## Cấu trúc file M0

| File | Trách nhiệm |
|---|---|
| `apps/api/Dockerfile` (sửa) | cài `@anthropic-ai/claude-code` vào stage runtime — image dùng chung cho `api` và `zalo-bot` |
| `docker-compose.yml` (sửa) | truyền `CLAUDE_CODE_OAUTH_TOKEN` cho `api` và `zalo-bot` |
| `.env.example` (sửa) | ghi lại biến mới |
| `apps/api/src/modules/health/health.service.ts` (sửa) | thêm trường `llm` vào báo cáo sức khoẻ |
| `apps/api/src/modules/health/health.llm.ts` (mới) | dò CLI + token, có cache — tách khỏi health.service để test được |
| `research/legal-loader/parse_provisions.py` (sửa) | ghép dòng tiêu đề bị PDF ngắt vào tiêu đề |
| `research/legal-loader/test_parse_provisions.py` (mới) | test thuần cho `split_articles` |
| `apps/eval/run.ts` (mới) | cổng đo: chạy một lệnh, in baseline |
| `apps/eval/legal.ts` (mới) | đo RAG pháp luật: recall@k, abstain, trích dẫn hợp lệ |
| `apps/eval/hs.ts` (mới) | đo phân loại HS: top-1/top-3 nhóm 4 số trên golden set |
| `apps/eval/report.ts` (mới) | in bảng + ghi `fixtures/eval-baseline.json` |

---

## Task 1: Tầng LLM ngừng tắt âm thầm

**Files:**
- Create: `apps/api/src/modules/health/health.llm.ts`
- Create: `apps/api/src/modules/health/health.llm.spec.ts`
- Modify: `apps/api/src/modules/health/health.service.ts`
- Modify: `apps/api/Dockerfile` (stage `runtime`)
- Modify: `docker-compose.yml` (service `api`, `zalo-bot`)
- Modify: `.env.example`

**Interfaces:**
- Produces: `probeLlm(deps?: { env?: Record<string, string | undefined>; run?: RunCli; now?: () => number }): Promise<LlmStatus>` với
  `type LlmStatus = 'up' | 'no_token' | 'no_cli'`; `HealthReport` thêm trường `llm: LlmStatus`.
- Consumes: không có.

**Vì sao task này đi trước:** hôm nay không image nào cài CLI `claude` và compose không truyền
token. Một bản deploy sạch chạy hoàn toàn không có LLM mà **không có gì báo** — router rơi về
`fallbackIntent`, `/legal` chỉ trả nguyên văn, vision tắt. Xây thêm tầng LLM lên trên một hệ thống
có thể lặng lẽ không có LLM là xây trên cát.

**Quyết định thiết kế:** thiếu LLM **không** làm `/health` trả 503. Hệ thống được thiết kế để suy
giảm êm — tra thuế không cần LLM. Trạng thái phải **nhìn thấy được**, không phải **gây chết**.

- [x] **Bước 1: viết test thất bại**

```ts
// apps/api/src/modules/health/health.llm.spec.ts
import { probeLlm } from './health.llm';

describe('probeLlm', () => {
  const withToken = { CLAUDE_CODE_OAUTH_TOKEN: 'x' };

  it('reports no_token when the token is absent', async () => {
    expect(await probeLlm({ env: {}, run: async () => true })).toBe('no_token');
  });

  it('reports no_cli when the token is set but the binary is missing', async () => {
    expect(await probeLlm({ env: withToken, run: async () => false })).toBe('no_cli');
  });

  it('reports up when both are present', async () => {
    expect(await probeLlm({ env: withToken, run: async () => true })).toBe('up');
  });

  it('caches the probe so /health does not spawn a process per request', async () => {
    let calls = 0;
    const run = async () => { calls += 1; return true; };
    let clock = 1_000;
    const deps = { env: withToken, run, now: () => clock };
    await probeLlm(deps);
    await probeLlm(deps);
    expect(calls).toBe(1);
    clock += 61_000;
    await probeLlm(deps);
    expect(calls).toBe(2);
  });
});
```

- [x] **Bước 2: chạy test cho chắc là nó fail**

Chạy: `corepack yarn test health.llm`
Kỳ vọng: FAIL — `Cannot find module './health.llm'`

- [x] **Bước 3: viết bản cài đặt tối thiểu**

```ts
// apps/api/src/modules/health/health.llm.ts
import { spawn } from 'node:child_process';

/**
 * Whether the LLM layer can actually run.
 *
 * `up` requires BOTH the subscription token and the `claude` binary. Neither is
 * fatal — tariff lookup has no model on its path at all — but a deploy that
 * silently lost the model layer looks identical to a working one from the
 * outside, and that is exactly the silent-failure shape this project exists to
 * prevent. So it is reported, never hidden, and never turned into a 503.
 */
export type LlmStatus = 'up' | 'no_token' | 'no_cli';

type RunCli = () => Promise<boolean>;

interface ProbeDeps {
  env?: Record<string, string | undefined>;
  run?: RunCli;
  now?: () => number;
}

/** Spawning a process on every /health hit would make a liveness probe expensive. */
const CACHE_MS = 60_000;
let cached: { at: number; status: LlmStatus } | null = null;

/** `claude --version` exits 0 when the CLI is installed and on PATH. */
const defaultRun: RunCli = () =>
  new Promise((resolve) => {
    const child = spawn('claude', ['--version'], { timeout: 5_000 });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });

export async function probeLlm(deps: ProbeDeps = {}): Promise<LlmStatus> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  if (cached && now() - cached.at < CACHE_MS) return cached.status;

  const status: LlmStatus = !env.CLAUDE_CODE_OAUTH_TOKEN
    ? 'no_token'
    : (await (deps.run ?? defaultRun)())
      ? 'up'
      : 'no_cli';
  cached = { at: now(), status };
  return status;
}

/** Test seam: forget the cached probe. */
export function resetLlmProbe(): void {
  cached = null;
}
```

Test phải gọi `resetLlmProbe()` trong `beforeEach` — thêm import và `beforeEach(resetLlmProbe)`
vào file spec ở Bước 1.

- [x] **Bước 4: chạy test cho xanh**

Chạy: `corepack yarn test health.llm`
Kỳ vọng: PASS 4/4

- [x] **Bước 5: nối vào /health**

```ts
// apps/api/src/modules/health/health.service.ts — thay HealthReport và check()
import { probeLlm, type LlmStatus } from './health.llm';

export interface HealthReport {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  pgvector: string | null;
  /**
   * Whether the model layer is wired. NOT part of `status`: tariff lookup and the
   * web UI work with no model at all, so a missing CLI is a reduced service, not a
   * broken one. It is reported so a deploy cannot lose it unnoticed.
   */
  llm: LlmStatus;
}
```

Trong `check()`: gọi `const llm = await probeLlm();` trước khối `try`, và thêm `llm` vào **cả hai**
đường trả về (nhánh thành công và nhánh `catch`).

- [x] **Bước 6: cài CLI vào image**

> **Ghi chú 2026-09-13:** trước ngày này Dockerfile KHÔNG có dòng cài CLI — VPS cũ chỉ có CLI qua `docker-compose.override.yml` ngoài git. Đã thêm vào `apps/api/Dockerfile` theo [05-bot-parity-tasks.md](05-bot-parity-tasks.md) Task 7; đã build và kiểm trên server 2026-09-13: CLI 2.1.270 trong image, `/health` báo `llm: up`.

Trong `apps/api/Dockerfile`, stage `runtime`, ngay sau `ENV NODE_ENV=production`:

```dockerfile
# The model layer (intent router, vision, grounded legal synthesis) shells out to the
# Claude Code CLI, which runs on the project's subscription rather than a metered API
# key. Installing it HERE — in the shared runtime stage — covers both `api` and
# `zalo-bot`, which run the same image with different commands. Before this, a clean
# deploy had no CLI at all and every model-backed feature degraded silently.
RUN npm install -g @anthropic-ai/claude-code && claude --version
```

- [x] **Bước 7: truyền token qua compose**

Thêm vào `environment:` của **cả** service `api` và `zalo-bot` trong `docker-compose.yml`:

```yaml
      # Subscription credential for the Claude Code CLI. Empty = the model layer is
      # off and /health reports llm=no_token; tariff lookup is unaffected.
      CLAUDE_CODE_OAUTH_TOKEN: "${CLAUDE_CODE_OAUTH_TOKEN:-}"
```

Và vào `.env.example`:

```bash
# Subscription token for the Claude Code CLI, used by the intent router, image
# vision, and grounded legal synthesis. Leave empty to run without the model layer:
# tariff lookup still works, /health then reports "llm":"no_token".
CLAUDE_CODE_OAUTH_TOKEN=
```

- [ ] **Bước 8: kiểm chứng end-to-end**

Chạy: `corepack yarn build && corepack yarn test health`
Kỳ vọng: build sạch, test xanh.
Trên máy có Docker: `docker compose build api && docker compose up -d api && curl -s localhost:3000/health`
Kỳ vọng: JSON có trường `"llm"`, và `"llm":"up"` khi `CLAUDE_CODE_OAUTH_TOKEN` đã đặt.

- [ ] **Bước 9: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add apps/api/Dockerfile docker-compose.yml .env.example apps/api/src/modules/health/
git commit -m "Health: report whether the model layer is actually wired, and ship the CLI"
```

---

## Task 2: Tiêu đề điều bị PDF ngắt dòng không còn rơi vào thân điều

**Files:**
- Modify: `research/legal-loader/parse_provisions.py:181-258` (`split_articles`)
- Create: `research/legal-loader/test_parse_provisions.py`
- Modify: `package.json` (thêm script `test:parser`)

**Interfaces:**
- Consumes: không có.
- Produces: `split_articles(lines: list[str]) -> list[dict]` giữ nguyên chữ ký; mỗi article giờ có
  `heading`/`title` đã ghép phần đuôi bị ngắt, và `body_lines` không còn chứa phần đuôi đó.

**Vì sao:** một tiêu đề dài hơn một dòng render PDF bị ngắt, phần đuôi trở thành dòng **đầu tiên của
thân điều**. Hệ quả: nhãn hiển thị cụt (`Điều 12. Thủ tục hải quan đối với hàng hóa xuất khẩu, nhập`)
và thân điều bắt đầu giữa câu. Việc này ảnh hưởng **cả kho**, không riêng văn bản tự nạp, và Task
M1 sắp nhân nó ra hàng trăm văn bản.

**Bằng chứng đây đúng là hình dạng lỗi:** cổng tự kiểm trong `apps/ingest/ingest_document.py` đã ghi
rằng trên một bản parse ĐÚNG của 33/2023/TT-BTC, **5/23** điều có thân bắt đầu bằng chữ thường — và
chú thích ở đó quy đúng nguyên nhân là tiêu đề dài bị ngắt dòng. Sau khi sửa, con số đó phải về gần 0.

> **Ghi nhận trong lúc triển khai (2026-08-14) — hai điều kế hoạch này không lường trước.**
>
> 1. **`HEADING_WRAP_MAX` là 3, không phải 2.** Đo trên 387 điều thật của 4 văn bản: 0 → 126 tiêu đề
>    cụt · 2 → 2 · 3 → 1. Nới 2→3 đổi **đúng một** điều (Điều 87 của 25/VBHN-BTC, tiêu đề thật dài ba
>    dòng) và không đụng ba văn bản kia — chính sự bất động đó là bằng chứng ngưỡng 3 không thò vào
>    thân điều.
> 2. **Cần thêm `HEADING_TERMINATED`.** Bản sửa đầu tiên **làm hỏng** Điều 40 của 25/VBHN-BTC: tiêu đề
>    vốn sạch (`Điều 40. (được bãi bỏ)`) bị kéo cả footnote văn bản sửa đổi vào. Kho có **41 điều**
>    mang dấu `(được bãi bỏ)`; tiêu đề phải dừng ở dấu đó. Chỉ số "thân bắt đầu chữ thường" **không
>    phát hiện được** lỗi này — nó giảm trong cả hai trường hợp. Chỉ so từng dòng trước/sau trên văn
>    bản thật mới thấy.

- [x] **Bước 1: viết test thất bại**

```python
# research/legal-loader/test_parse_provisions.py
"""Tests for split_articles — the heading/reference/continuation rules.

Every case here is a real corruption seen while building the corpus, kept as a
regression: the parser's rules were each paid for once and must not be re-lost.

    python3 -m unittest discover -s research/legal-loader -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_provisions import split_articles


class SplitArticles(unittest.TestCase):
    def test_wrapped_heading_is_joined_not_left_in_the_body(self):
        arts = split_articles([
            'Điều 12. Thủ tục hải quan đối với hàng hóa xuất khẩu, nhập',
            'khẩu tại chỗ',
            '1. Hàng hóa xuất khẩu, nhập khẩu tại chỗ gồm:',
        ])
        self.assertEqual(len(arts), 1)
        self.assertEqual(
            arts[0]['heading'],
            'Điều 12. Thủ tục hải quan đối với hàng hóa xuất khẩu, nhập khẩu tại chỗ',
        )
        self.assertEqual(arts[0]['body_lines'], ['1. Hàng hóa xuất khẩu, nhập khẩu tại chỗ gồm:'])

    def test_a_body_that_genuinely_starts_upper_case_is_not_eaten(self):
        arts = split_articles([
            'Điều 5. Giải thích từ ngữ',
            'Trong Thông tư này, các từ ngữ dưới đây được hiểu như sau:',
        ])
        self.assertEqual(arts[0]['heading'], 'Điều 5. Giải thích từ ngữ')
        self.assertEqual(arts[0]['body_lines'], ['Trong Thông tư này, các từ ngữ dưới đây được hiểu như sau:'])

    def test_a_khoan_is_never_absorbed_into_the_heading(self):
        arts = split_articles(['Điều 7. Khai hải quan', '1. người khai hải quan phải…'])
        self.assertEqual(arts[0]['heading'], 'Điều 7. Khai hải quan')
        self.assertEqual(arts[0]['body_lines'], ['1. người khai hải quan phải…'])

    def test_a_diem_is_never_absorbed_into_the_heading(self):
        arts = split_articles(['Điều 8. Hồ sơ', 'a) tờ khai hải quan;'])
        self.assertEqual(arts[0]['heading'], 'Điều 8. Hồ sơ')
        self.assertEqual(arts[0]['body_lines'], ['a) tờ khai hải quan;'])

    def test_joining_stops_after_two_continuation_lines(self):
        arts = split_articles([
            'Điều 3. một tiêu đề rất dài bị ngắt',
            'thành nhiều dòng liên tiếp',
            'và còn dòng nữa',
            'thêm một dòng thường nữa',
        ])
        self.assertEqual(
            arts[0]['heading'],
            'Điều 3. một tiêu đề rất dài bị ngắt thành nhiều dòng liên tiếp và còn dòng nữa',
        )
        self.assertEqual(arts[0]['body_lines'], ['thêm một dòng thường nữa'])

    def test_a_cross_reference_landing_on_the_next_number_still_does_not_steal(self):
        arts = split_articles([
            'Điều 17. Khai bổ sung',
            'Người khai thực hiện theo quy định tại',
            'Điều 18 Luật Hải quan và lấy mẫu hàng hóa.',
            'Điều 18. Khai hải quan',
            'Nội dung điều 18.',
        ])
        self.assertEqual([a['dieu_num'] for a in arts], ['17', '18'])
        self.assertEqual(arts[1]['heading'], 'Điều 18. Khai hải quan')


if __name__ == '__main__':
    unittest.main()
```

- [x] **Bước 2: chạy test cho chắc là nó fail**

Chạy: `python3 -m unittest discover -s research/legal-loader -p 'test_*.py' -v`
Kỳ vọng: FAIL ở `test_wrapped_heading_is_joined_not_left_in_the_body` và
`test_joining_stops_after_two_continuation_lines`; các test khác PASS (chúng mô tả hành vi đang đúng).

- [x] **Bước 3: viết bản cài đặt tối thiểu**

Thêm hằng số cạnh `DIEU_REFERENCE` trong `research/legal-loader/parse_provisions.py`:

```python
# A heading longer than one rendered PDF line wraps, and its tail becomes the first
# line of the body: "Điều 12. Thủ tục hải quan đối với hàng hóa xuất khẩu, nhập" /
# "khẩu tại chỗ". The label then reads truncated and the body starts mid-sentence.
# A continuation is a line that opens in LOWER CASE and is not a khoản, a điểm, or a
# new structural marker — legal prose starts a real body line with a capital or a
# numbered khoản, so lower case at the head of an article body means the line above
# it was cut. Bounded to HEADING_WRAP_MAX lines: a real title never wraps further,
# and an unbounded join would swallow a lower-case body.
HEADING_WRAP_MAX = 2
```

Trong `split_articles`, ngay sau khi tạo `cur` và trước `articles.append(cur)`, chèn khối ghép:

```python
            # Consume the wrapped tail of the heading, if the render cut it.
            wrapped = 0
            while wrapped < HEADING_WRAP_MAX and i + 1 < n:
                nxt = lines[i + 1]
                if not _is_heading_continuation(nxt):
                    break
                cur['heading'] = f"{cur['heading']} {nxt}"
                cur['title'] = f"{cur['title']} {nxt}"
                i += 1
                wrapped += 1
```

Và hàm trợ giúp, đặt ngay trước `split_articles`:

```python
def _is_heading_continuation(line: str) -> bool:
    """Is this line the wrapped tail of the heading above it, rather than the body?"""
    s = line.strip()
    if not s:
        return False
    # Anything that opens a new structural unit ends the heading, whatever its case.
    if (KHOAN.match(s) or DIEM.match(s) or DIEU.match(s) or CHUONG.match(s)
            or MUC.match(s) or TERMINATOR.match(s) or APPENDIX_HEADING.match(s)
            or FOOTER.search(s)):
        return False
    # Lower case at the head of an article body means the line above was cut.
    return s[0].islower()
```

Lưu ý thứ tự: `i += 1` bên trong vòng lặp ghép, rồi `i += 1` của nhánh heading bên dưới vẫn giữ
nguyên — dòng tiêu đề chính vẫn được tiêu thụ đúng một lần.

- [x] **Bước 4: chạy test cho xanh**

Chạy: `python3 -m unittest discover -s research/legal-loader -p 'test_*.py' -v`
Kỳ vọng: PASS 6/6

- [x] **Bước 5: nối vào yarn**

Thêm vào `package.json` mục `scripts`:

```json
    "test:parser": "python3 -m unittest discover -s research/legal-loader -p 'test_*.py'",
```

- [x] **Bước 6: nới cổng tự kiểm cho khớp**

Trong `apps/ingest/ingest_document.py`, luật `frag` hiện chấp nhận tới 50% thân điều bắt đầu bằng
chữ thường vì tiêu đề bị ngắt là chuyện thường. Sau bản sửa này nó **không còn** thường nữa, nên hạ
ngưỡng xuống `0.2` và cập nhật chú thích để nói rõ vì sao ngưỡng đổi. Đừng hạ về 0: một thân điều mở
đầu bằng dấu ngoặc hoặc ký tự lạ vẫn có thể lọt.

- [ ] **Bước 7: nạp lại kho và kiểm tra mẫu ngẫu nhiên**

```bash
FORCE_RESEED=1 DATABASE_URL=... EMBEDDER_URL=... corepack yarn db:seed:legal
```

Rồi kiểm tra bằng mắt 10 điều lấy ngẫu nhiên:

```sql
SELECT citation_label, heading FROM legal_provision
WHERE ptype = 'dieu' ORDER BY random() LIMIT 10;
```

Kỳ vọng: mọi `heading` là một cụm danh từ hoàn chỉnh, không cụt giữa chừng.
**Không tin vào số đếm chương/điều** — bài học 2026-08-13 là số đếm vẫn xanh trong khi 6 điều bị
cướp tiêu đề.

- [ ] **Bước 8: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add research/legal-loader/parse_provisions.py research/legal-loader/test_parse_provisions.py \
        apps/ingest/ingest_document.py package.json
git commit -m "Legal parser: a heading wrapped by the PDF render belongs to the heading"
```

---

## Task 3: Cổng đo — một lệnh, một baseline

**Files:**
- Create: `apps/eval/run.ts`, `apps/eval/legal.ts`, `apps/eval/hs.ts`, `apps/eval/report.ts`
- Modify: `package.json` (script `eval`)
- Đọc: `fixtures/legal-golden/legal-qa.json`, `fixtures/golden-set/cases.yaml`

**Interfaces:**
- Consumes: API đang chạy tại `EVAL_API_URL` (mặc định `http://localhost:3000`).
- Produces:
  - `evalLegal(apiUrl: string): Promise<LegalMetrics>` với
    `LegalMetrics = { cases: number; recallAtK: number; k: number; abstainCorrect: number; abstainTotal: number; citationsValid: number; misses: string[] }`
  - `evalHs(apiUrl: string): Promise<HsMetrics>` với
    `HsMetrics = { cases: number; top1: number; top3: number; misses: string[] }`
  - `renderReport(legal: LegalMetrics, hs: HsMetrics): string`

**Vì sao qua HTTP chứ không gọi thẳng hàm:** `legal-golden.spec.ts` đã đo **retrieval** ở mức hàm, và
việc đó vẫn giữ. Cổng đo này đo **đường thật người dùng đi** — gồm cả scope, cổng liên quan, sinh câu
trả lời và kiểm tra trích dẫn. Hai thứ đo hai tầng khác nhau; M2 sẽ đổi tầng trên mà không đổi tầng dưới.

- [x] **Bước 1: viết `apps/eval/legal.ts`**

```ts
/**
 * Legal RAG measured through the SAME HTTP path a person's question takes —
 * scope, retrieval, the relevance gate, generation and citation validation
 * included. `db/seed/legal-golden.spec.ts` measures the retrieval function
 * underneath; this measures what the bot would actually have said.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Case {
  id: string;
  q: string;
  expect?: { doc: string; dieu: number };
  should_abstain?: boolean;
}
interface Golden { k: number; asOf: string; cases: Case[] }

export interface LegalMetrics {
  cases: number;
  k: number;
  recallAtK: number;
  abstainCorrect: number;
  abstainTotal: number;
  /** Share of answers whose prose came back WITH at least one verbatim citation. */
  citationsValid: number;
  misses: string[];
}

interface LegalAnswer {
  abstained: boolean;
  answer: string;
  citations: Array<{ documentNumber: string; articleLabel: string }>;
}

const article = (dieu: number) => new RegExp(`^Điều ${dieu} `);

export async function evalLegal(apiUrl: string): Promise<LegalMetrics> {
  const golden = JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures', 'legal-golden', 'legal-qa.json'), 'utf8'),
  ) as Golden;

  const answerable = golden.cases.filter((c) => c.expect);
  const abstainCases = golden.cases.filter((c) => c.should_abstain);
  const misses: string[] = [];
  let hit = 0;
  let cited = 0;

  for (const c of answerable) {
    const r = await ask(apiUrl, c.q, golden.asOf);
    const found = (r?.citations ?? []).some(
      (x) => x.documentNumber === c.expect!.doc && article(c.expect!.dieu).test(x.articleLabel),
    );
    if (found) hit += 1;
    else misses.push(`${c.id}: mong Điều ${c.expect!.dieu} ${c.expect!.doc}, nhận ${labelOf(r)}`);
    if (r && !r.abstained && r.answer && r.citations.length > 0) cited += 1;
  }

  let abstainCorrect = 0;
  for (const c of abstainCases) {
    const r = await ask(apiUrl, c.q, golden.asOf);
    if (!r || r.abstained || r.citations.length === 0) abstainCorrect += 1;
    else misses.push(`${c.id}: đáng lẽ phải từ chối, nhưng đã trả lời`);
  }

  return {
    cases: answerable.length,
    k: golden.k,
    recallAtK: answerable.length ? hit / answerable.length : 0,
    abstainCorrect,
    abstainTotal: abstainCases.length,
    citationsValid: answerable.length ? cited / answerable.length : 0,
    misses,
  };
}

function labelOf(r: LegalAnswer | null): string {
  if (!r) return 'lỗi gọi API';
  if (r.abstained) return 'từ chối';
  return r.citations.map((c) => `${c.articleLabel}`).join(' · ') || 'không trích dẫn';
}

async function ask(apiUrl: string, q: string, asOf: string): Promise<LegalAnswer | null> {
  const qs = new URLSearchParams({ q, asOf });
  try {
    const res = await fetch(`${apiUrl}/legal?${qs}`);
    return res.ok ? ((await res.json()) as LegalAnswer) : null;
  } catch {
    return null;
  }
}
```

- [x] **Bước 2: viết `apps/eval/hs.ts`**

```ts
/**
 * HS classification measured against the company's own cleared declarations.
 *
 * Scored at the 4-DIGIT heading, not the 8-digit line, and that is deliberate:
 * the golden set is past practice (`confidence: uncertain` on every row — see
 * TASK-001), so agreement at the leaf would be measuring agreement with a
 * decision nobody certified. The heading is where the classification argument
 * actually lives.
 *
 * Today this exercises the CURRENT candidate path (`/tariff/search` by product
 * words). M4 replaces what is behind that call; this number is the before.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface HsMetrics {
  cases: number;
  top1: number;
  top3: number;
  misses: string[];
}

interface Candidate { hs: string; hsDotted: string }

/** cases.yaml is a flat list of scalars per case — read the three fields we need. */
function readCases(): Array<{ id: string; goods: string; hs: string }> {
  const text = readFileSync(join(process.cwd(), 'fixtures', 'golden-set', 'cases.yaml'), 'utf8');
  const out: Array<{ id: string; goods: string; hs: string }> = [];
  let cur: { id?: string; goods?: string; hs?: string } = {};
  let pending: 'goods' | null = null;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const id = line.match(/^- id:\s*(\S+)/);
    if (id) {
      if (cur.id && cur.goods && cur.hs) out.push(cur as { id: string; goods: string; hs: string });
      cur = { id: id[1] };
      pending = null;
      continue;
    }
    const goods = line.match(/^\s{2}goods_description:\s*(.*)$/);
    if (goods) { cur.goods = goods[1]!.trim(); pending = 'goods'; continue; }
    const hs = line.match(/^\s{2}hs_code:\s*(\S+)/);
    if (hs) { cur.hs = hs[1]!.replace(/\D/g, ''); pending = null; continue; }
    // A wrapped YAML scalar continues on an indented line with no `key:` of its own.
    if (pending === 'goods' && /^\s{4}\S/.test(line) && !/^\s{2}\w+:/.test(line)) {
      cur.goods = `${cur.goods} ${line.trim()}`;
      continue;
    }
    if (/^\s{2}\w+:/.test(line)) pending = null;
  }
  if (cur.id && cur.goods && cur.hs) out.push(cur as { id: string; goods: string; hs: string });
  return out;
}

export async function evalHs(apiUrl: string): Promise<HsMetrics> {
  const cases = readCases();
  const misses: string[] = [];
  let top1 = 0;
  let top3 = 0;

  for (const c of cases) {
    const expected = c.hs.slice(0, 4);
    const groups = await candidateHeadings(apiUrl, c.goods);
    if (groups[0] === expected) top1 += 1;
    if (groups.slice(0, 3).includes(expected)) top3 += 1;
    else misses.push(`${c.id}: mong nhóm ${expected}, nhận ${groups.slice(0, 3).join('/') || '—'}`);
  }

  return {
    cases: cases.length,
    top1: cases.length ? top1 / cases.length : 0,
    top3: cases.length ? top3 / cases.length : 0,
    misses,
  };
}

/** Distinct 4-digit headings, in rank order, from the deterministic search path. */
async function candidateHeadings(apiUrl: string, goods: string): Promise<string[]> {
  // The declaration's own wording is long and comma-separated; the first clause is
  // the goods name, the rest is specification. Search the name.
  const q = goods.split(/[,(]/)[0]!.trim().slice(0, 60);
  try {
    const res = await fetch(`${apiUrl}/tariff/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const rows = (await res.json()) as Candidate[];
    return [...new Set(rows.map((r) => r.hs.slice(0, 4)))];
  } catch {
    return [];
  }
}
```

- [x] **Bước 3: viết `apps/eval/report.ts` và `apps/eval/run.ts`**

```ts
// apps/eval/report.ts
import type { HsMetrics } from './hs';
import type { LegalMetrics } from './legal';

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** One screen a person can read, then the misses — the misses are the useful part. */
export function renderReport(legal: LegalMetrics, hs: HsMetrics): string {
  const lines = [
    '',
    '  PHÁP LUẬT',
    `    recall@${legal.k} trên điều mong đợi   ${pct(legal.recallAtK)}  (${legal.cases} câu)`,
    `    từ chối đúng khi ngoài kho          ${legal.abstainCorrect}/${legal.abstainTotal}`,
    `    câu trả lời có trích dẫn hợp lệ     ${pct(legal.citationsValid)}`,
    '',
    '  MÃ HS  (chấm ở nhóm 4 số)',
    `    top-1                               ${pct(hs.top1)}  (${hs.cases} tờ khai)`,
    `    top-3                               ${pct(hs.top3)}`,
    '',
  ];
  const misses = [...legal.misses, ...hs.misses];
  if (misses.length) lines.push('  TRƯỢT', ...misses.map((m) => `    ${m}`), '');
  return lines.join('\n');
}
```

```ts
// apps/eval/run.ts
/**
 * The measurement gate. One command, one baseline.
 *
 *   EVAL_API_URL=http://localhost:3000 corepack yarn eval
 *
 * Every prompt change from here on is a software change and must pass through
 * this — "the answers feel better" is not a result. Writes the numbers to
 * fixtures/eval-baseline.json so a later run can be compared against this one.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { evalHs } from './hs';
import { evalLegal } from './legal';
import { renderReport } from './report';

async function main(): Promise<void> {
  const apiUrl = (process.env.EVAL_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const health = await fetch(`${apiUrl}/health`).then((r) => r.json()).catch(() => null);
  if (!health) {
    console.error(`Không gọi được API tại ${apiUrl}. Chạy API trước rồi thử lại.`);
    process.exit(1);
  }
  console.log(`API ${apiUrl} · db=${health.db} · llm=${health.llm ?? 'không rõ'}`);
  if (health.llm !== 'up') {
    // Not fatal: retrieval numbers stay valid. But the generation-dependent number
    // (citations on a prose answer) is measuring a different system, so say so.
    console.warn('CẢNH BÁO: tầng LLM không sẵn sàng — chỉ số "có trích dẫn hợp lệ" đo đường không-LLM.');
  }

  const legal = await evalLegal(apiUrl);
  const hs = await evalHs(apiUrl);
  console.log(renderReport(legal, hs));

  const out = join(process.cwd(), 'fixtures', 'eval-baseline.json');
  writeFileSync(out, `${JSON.stringify({ at: new Date().toISOString(), legal, hs }, null, 2)}\n`);
  console.log(`Đã ghi ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [x] **Bước 4: nối vào yarn**

Thêm vào `package.json` mục `scripts`:

```json
    "eval": "tsx apps/eval/run.ts",
```

- [ ] **Bước 5: chạy và ghi lại baseline**

Chạy: `corepack yarn eval` (cần API đang chạy và DB đã seed)
Kỳ vọng: in ra bảng, ghi `fixtures/eval-baseline.json`. **Con số đầu tiên là baseline — dù nó xấu.**
Ghi nguyên văn con số đó vào `02-progress.md`; M1–M4 được chấm so với nó.

- [ ] **Bước 6: commit (chỉ khi chủ dự án yêu cầu)**

```bash
git add apps/eval package.json fixtures/eval-baseline.json
git commit -m "Eval: one command that measures the path a question actually takes"
```

---

## Sau M0

Khi baseline đã có, viết kế hoạch M1 (`04-...`). Thứ tự M1 → M2 → M3 → M4 là bắt buộc: M1 tạo ra dữ
liệu để M2 có cái mà truy hồi, và M3 tạo ra bằng chứng để M4 có cái mà trích.
