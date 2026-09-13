---
type: planning
status: active
updated: 2026-09-14
related:
  - ../docs/bot-answer-parity-design.md
  - ../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md
  - ../architecture-decisions/2026-09-13-fta-national-sublines.md
  - ../business-rules.md
  - 05-bot-parity-tasks.md
  - 02-progress.md
  - ../docs/mona-dev-server-operations.md
  - ../review-history/2026-09-13-fta-members-verification.md
---

# Kế hoạch triển khai — trình bày kiểu notebook trên Zalo (§5b)

> **Trạng thái 2026-09-14:** Task 1–7 và Task 9 **đã code, kiểm và commit** (không push), trên BASE `853d09d`: Task 1
> `276c866`, `8616092`; Task 2 `148b983`, `ff576b3`; Task 3 `8a42c61`, `39f59d4`; Task 4 `9aa4d02`, `0d2364b`; Task 5
> `97bfb5c`, `28a22f9`, `7c689b2`, `44f0297`; Task 6 `1c950cb`, `da5b3ed`; Task 7 `3b793ee`; sửa sau rà soát cuối
> `f5e0348`, `952f15d`; Task 9 là commit tài liệu ngay sau. Tại `952f15d`: bot 62/62; Jest tariff + legal + `apps/eval`
> 68/68; `tsc` sạch; `yarn build` sạch. Số test vượt số ghi trong task (50 và 62) vì mỗi vòng sửa sau rà soát thêm test;
> mã trong các task dưới đây là bản trước các vòng sửa — spec §5b và mã là nguồn đúng. **Task 8 (deploy) do controller
> thực hiện ngay sau**; ngày deploy, đầu ra chạy khô trên server và kết quả kiểm của chủ dự án (điện thoại + Zalo PC)
> ghi vào [nhật ký tiến độ](02-progress.md) khi có — hiện **chờ chủ dự án kiểm**. Làm **trước** Mảng 2 của
> [kế hoạch 05](05-bot-parity-tasks.md), Mảng 2 làm ngay sau. Không thêm bảng, seed, migration hay lần gọi LLM nào.
>
> **Quyết định của chủ dự án (2026-09-13), ghi đè chữ cũ của kế hoạch nếu mâu thuẫn:** làm xong là deploy luôn —
> controller deploy ở Task 8, không có điểm dừng chủ dự án trước deploy, chủ dự án duyệt bằng cách nhắn thử trên Zalo
> sau deploy; commit theo từng task được phép; bảng thành viên FTA đã được duyệt nên lọc theo xuất xứ và tô xanh **bật
> ngay khi deploy**.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Câu trả lời của bot Zalo đọc như notebook (câu dẫn tự nhiên, gạch đầu dòng cho lựa chọn thật, `[n]` và
nguồn cuối tin) và có định dạng Zalo (đậm, nghiêng, chữ nhỏ, danh sách, xanh/cam/đỏ theo nghĩa) do code quyết từ dữ
liệu; kèm lọc FTA theo bảng thành viên đã ký, dòng phạm vi kho từ bảng `decree`, và sửa lỗi 69/2018.

**Architecture:** Một bộ trình bày thuần `apps/zalo-bot/render.mjs` nhận `Line[]` (đoạn chữ + nhãn ngữ nghĩa) từ các
builder tất định trong `format.mjs`, hoặc văn xuôi LLM qua `md()` (không sinh được màu), rồi tách tin ~1.800 ký tự và
tính `styles` của `zca-js` cho từng tin. API bổ sung `PreferentialView.rate`/`originEligible`,
`TariffResponse.ftaMembership` và `StalenessView` mới đọc từ bảng `decree`; `/legal` đánh số `[n]` theo vị trí và kiểm
số liệu từng câu (`numberMarkers`). Mảng 3 dùng lại nguyên `render.mjs` và `sourceLines`.

**Tech Stack:** Node 22 ESM (bot, `node:test`) · NestJS 11 + Drizzle (API, Jest + ts-jest) · `zca-js` 2.1.2 ·
Docker Compose trên server dev dùng chung.

**Spec:** [§5b thiết kế bot trả lời ngang notebook](../docs/bot-answer-parity-design.md#5b-trình-bày-kiểu-notebook-trên-zalo-v3)
và [ADR chữ định dạng Zalo theo giọng notebook](../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md).
Người thực thi đọc cả hai; kế hoạch chỉ lập luận từ đó.

## Global Constraints

- **R1:** "Một mức thuế được truy hồi bằng tra cứu khóa chính xác trong SQL … AI có thể giúp người dùng *tìm ra khóa
  nào cần tra cứu*; nó không bao giờ được *tạo ra giá trị*." Bot in `rate`/`statement` của API nguyên văn, không tự
  ghép mức thuế ([R1](../business-rules.md)).
- **R2:** "top-3 ứng viên … mỗi cái mang bằng chứng … do một con người quyết định. Không bao giờ là một con số 8 chữ số
  trần trụi đơn lẻ." Trả lời ứng viên HS luôn có dòng ứng viên cố định, không bao giờ tô xanh
  ([R2](../business-rules.md)).
- **R8:** "valid-time làm bộ lọc cứng: `valid_start ≤ as_of < coalesce(valid_end, +∞)`. … 'Mới nhất' không phải là
  một khái niệm mà hệ thống này có." Dòng phạm vi kho chọn văn bản **còn hiệu lực tại ngày tra**
  ([R8](../business-rules.md)).
- **R10:** "Một kiểm tra căn cứ phải xác minh rằng điều khoản được viện dẫn hậu thuẫn cho mệnh đề được khẳng định."
  `[n]` trỏ đúng trích dẫn thứ n; số liệu trong câu phải có trong nguồn của chính câu đó
  ([R10](../business-rules.md)).
- **R18:** "Thẩm quyền của một dữ liệu chỉ do con người cấp, và dấu vết phải nói ai cấp." Không lọc, không xanh khi
  `fta-members.json` thiếu `verifiedBy` hoặc `verifiedHash` không khớp. **Agent không bao giờ cấp xác minh:** không
  ghi, không sửa `verifiedBy`, `verifiedAt`. Controller (phiên điều phối) ghi `verifiedHash` **chỉ khi có phê duyệt rõ
  của chủ dự án đã ghi trong git**, tính trên đúng nội dung đã duyệt — lần này: commit `853a01f`, chủ dự án Trần Ngọc
  Nhật, 2026-09-13; hash ghi ở commit chuẩn bị. Agent thực thi task không đụng `fta-members.json`
  ([R18](../business-rules.md)).
- **Màu chỉ do code quyết từ dữ liệu.** Chỉ builder trong `format.mjs`/`answer.mjs`/`index.mjs` gắn `green`,
  `orange`, `red`; `md()` chỉ sinh `b`, `i`, `ul`, `ol`. Không bao giờ gọi `md()` trên dữ liệu DB hay chữ người dùng.
- Xanh chỉ ở dòng `originEligible === true` có một mức chung (`ad_valorem`/`specific`/`compound`), ngoài chế độ ứng
  viên. Tối đa **một** dòng cam (`warn`) mỗi câu trả lời; dòng đỏ là nội dung, không tính.
- `PreferentialView.statement` và `decree` **không đổi** (bất biến bằng chứng Mảng 2, spec §5b.10).
- Offset `styles` = chỉ số chuỗi JavaScript (UTF-16) trên chuỗi đã NFC; ngân sách tách tin `1800` là hằng.
- Không emoji trang trí, không viết HOA để nhấn trong chữ gửi người dùng; ngày hiển thị `dd/mm/yyyy`.
- **Không thêm dependency.** Bot: `node:test`, `test()` phẳng, fixture nội tuyến, thông điệp assert tiếng Việt; không
  import `index.mjs` trong test. API: Jest (`*.spec.ts`), db giả, không đụng CSDL thật.
- Tài liệu tiếng Việt; mã, định danh, tên file, thông điệp commit tiếng Anh.
- **Commit theo từng task: chủ dự án đã cho phép (2026-09-13)**, thay mặc định "chỉ commit khi được yêu cầu" của
  [AGENTS](../AGENTS.md) bước 13 cho kế hoạch này. Chỉ `git add <đường dẫn cụ thể>` đúng các file task sửa — không bao
  giờ `git add -A` hay `git add .`, không commit `.agent/local`, không push. Thông điệp tiếng Anh, kết bằng dòng
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Có `.git/index.lock` thì chờ vài giây rồi
  thử lại. Trước khi commit, soát diff đã stage không có IP, `root@`, dự án MONA khác, threadId hay accountId.
- Không ghi IP server, `root@`, dự án MONA khác, threadId hay accountId vào file có trong git (repo public). Đích ssh
  viết là `<MONA_DEV_HOST>`. Không `cat .env`.
- **Agent thực thi Task 1–7 và 9 không bao giờ ssh, không đụng server hay CSDL thật, không gửi tin Zalo.** Task 8
  (deploy) do controller làm sau khi Task 1–7 đã commit, **không có điểm dừng chủ dự án trước deploy** (chủ dự án
  2026-09-13: "sau khi có kết quả của các agent thì thực hiện code và deploy lên luôn cho tôi"). Không script nào gửi
  tin Zalo; sau deploy chủ dự án tự nhắn thử trong nhóm được phép.

## Điều kiện tiên quyết (kiểm trước Task 1)

- [ ] `git log --oneline -1 -- apps/api/src/modules/tariff/tariff.types.ts` ra `21ddcb4` (dòng 10 số FTA đã commit,
  `PreferentialView.sublines`, `by_subline`) và `git status --short apps db public docker-compose.yml` rỗng.
- [ ] `git log --oneline -1 -- db/seed/data/fta-members.json` ra commit chuẩn bị ("Design notebook-style Zalo
  replies…"); `git diff 853a01f -- db/seed/data/fta-members.json` chỉ thêm đúng một dòng `verifiedHash`; và
  `node -e 'const j=require("./db/seed/data/fta-members.json");console.log(require("crypto").createHash("sha256").update(JSON.stringify(j.schedules)).digest("hex")===j.verifiedHash)'`
  in `true`.
- [ ] Baseline xanh (đo lại 2026-09-13 tại `e823678`): `corepack yarn test:bot` → `ℹ tests 25`, `ℹ pass 25`,
  `ℹ fail 0`; `node_modules/.bin/jest apps/api/src/modules/tariff` → `Tests: 15 passed, 15 total`;
  `node_modules/.bin/jest apps/api/src/modules/legal apps/eval` → `Tests: 15 passed, 15 total` (hai suite của
  `apps/eval`; `legal` chưa có spec); `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | grep -v TS1343` →
  không in gì (ba lỗi `TS1343 import.meta` ở `db/seed/index.ts`, `db/seed/legal.ts`,
  `research/task-012-acceptance/validate.ts` có sẵn, không liên quan).
- Dùng `corepack yarn`, không dùng `yarn` toàn cục (bản 1.22 từ chối `packageManager: yarn@4`).
- Số dòng ghi trong mục **Files** của mỗi task là số dòng tại `e823678`, trước mọi task; task sau neo theo tên hàm hoặc
  chuỗi, không theo số dòng.

## Cấu trúc file

| File | Trách nhiệm | Task |
|---|---|---|
| `apps/zalo-bot/render.mjs` (mới) | `L`, `ST`, `toText`, `render`, `md`: Line[] → `{msg, styles}[]`, gộp `warn`, tách tin | 1 |
| `apps/zalo-bot/render.test.mjs` (mới) | 10 test thuần của bộ trình bày | 1 |
| `apps/api/src/modules/tariff/tariff.types.ts` | `rate`, `originEligible`, `ftaMembership`, `StalenessView` mới | 2 |
| `apps/api/src/modules/tariff/tariff.service.ts` | `ftaMembership`, `originEligible`, `stalenessView`, đọc `decree` một lần, bỏ `ConfigService` | 2 |
| `apps/api/src/modules/tariff/tariff.service.spec.ts` | db giả định tuyến theo SQL; test bảng thành viên + phạm vi kho | 2 |
| `public/index.html` | web UI đọc `staleness` mới và `originEligible` | 2 |
| `docker-compose.yml`, `.agent/docs/mona-dev-server-operations.md` | bỏ `DATA_SNAPSHOT_DATE` | 2 |
| `apps/zalo-bot/parse.mjs` | `ORIGIN_LABEL` (3); `full`, `sameDocNumber`, `missingKind`, `corpusHas` (5) | 3, 5 |
| `apps/zalo-bot/format.mjs` | khối thuế (3); cổng văn xuôi, bỏ `formatCandidates` (4); pháp luật (5); chung, nạp (6) | 3–6 |
| `apps/zalo-bot/answer.mjs` | `answerByHs`, `handleCorrection` (3); `tariffByClues` (4); pháp luật (5); `handleConfirm` (6) | 3–6 |
| `apps/zalo-bot/index.mjs` | cầu tạm `toText` (3); bỏ `showSourceNote` (5); đường gửi `render` (6); `export respond` (7) | 3, 5–7 |
| `apps/zalo-bot/router.mjs` | danh sách năng lực trong prompt | 6 |
| `apps/zalo-bot/dispatch.test.mjs` | test 10–22 của spec §5b.9 | 3–6 |
| `apps/api/src/modules/legal/legal.grounding.ts` (+ `legal.grounding.spec.ts` mới) | `numberMarkers` thay `validateCitations` | 5 |
| `apps/api/src/modules/legal/legal.generation.ts` | khối `[n]`, prompt Markdown ≤200 từ | 5 |
| `apps/api/src/modules/legal/legal.scope.ts` (+ `legal.scope.spec.ts` mới) | `foldDocNumber`, khớp đúng gập trong SQL, `resolveDocuments` theo số đầy đủ | 5 |
| `apps/api/src/modules/legal/legal.service.ts` (+ `legal.service.spec.ts` mới) | `docType` từ câu hỏi, ánh xạ `[n] → kept[n-1]` | 5 |
| `apps/eval/notebook.ts`, `apps/eval/notebook.spec.ts` | `norm` bỏ `*` | 5 |
| `apps/zalo-bot/dry-run.mjs` (mới) | in câu trả lời + styles cho sáu câu mẫu, không đăng nhập Zalo | 7 |

## Trạng thái trung gian giữa các task

Mỗi task kết thúc với test xanh **và** bot vẫn chạy được, nhờ ba cầu tạm có chủ đích (mỗi cầu ghi task gỡ):

- Task 3: `withLead` nhận cả chuỗi (các builder pháp luật còn trả chuỗi) — **Task 5 gỡ**.
- Task 3: `tariffByClues` bọc `toText(formatAnswer(...))` — **Task 4 gỡ**.
- Task 3: `index.mjs` gửi `toText(result.text)` (chưa có style) — **Task 6 gỡ**.

Không deploy trước Task 8.

## Bảng thành viên FTA — đã duyệt, có hiệu lực khi deploy

**Hiện trạng (commit chuẩn bị):** `db/seed/data/fta-members.json` mang `verifiedBy: "Trần Ngọc Nhật"` và
`verifiedAt: "2026-09-13"` do chủ dự án duyệt ở commit `853a01f`
([phiếu đối chiếu](../review-history/2026-09-13-fta-members-verification.md)), và
`verifiedHash: "2e94452aaeb79aa9103be6c2fff13adcf66cc584ce4150eb0212ecaa2e044ba0"`. Controller ghi hash theo quyết định
của chủ dự án 2026-09-13 (bảng đã xác minh; lọc theo xuất xứ và tô xanh phải bật khi deploy), sau khi kiểm bằng git
rằng nội dung file trùng từng byte với `853a01f`. Hash tính đúng định nghĩa §5b.4 — `sha256` hex của
`JSON.stringify(schedules)`; `verifiedBy`, `verifiedAt` giữ nguyên.

Điều kiện ký §5b.11 đã thỏa theo (a): migration 0010 và nạp lại biểu thuế đã deploy 2026-09-13 (nhật ký phiên
2026-09-13 (đêm) trong [02-progress](02-progress.md)). Rủi ro chủ dự án đã biết khi duyệt: các nghị định sửa đổi, bổ
sung sau 30/12/2022 chưa được đối chiếu.

**Hệ quả cho các task:**

- Sau Task 2, API đọc file lúc khởi động và coi bảng **có hiệu lực**: không có dòng log
  `fta-members.json is not in effect`. Mọi test dùng fixture (`svc.membership = ftaMembership(…)`), không assert trạng
  thái file thật.
- Khi deploy (Task 8): câu "8481.80.99 xuất xứ Trung Quốc" ra ví dụ 1 §5b.3 (dạng A): một mức xanh "Có C/O form E hợp
  lệ (ACFTA)", dòng MFN "Không có C/O ưu đãi hợp lệ", `Đã ẩn AANZFTA, ATIGA, EVFTA …`; xuất xứ không thành viên ra
  dạng B; dòng kết thêm gợi ý "Muốn xem xuất xứ khác, nhắn tên nước" hoặc "Cho mình biết xuất xứ…"; web UI tô lớp
  `pref` cho đúng dòng `originEligible === true`. **Không đổi:** trả lời ứng viên HS vẫn không xanh, không ẩn biểu;
  `statement` giữ nguyên; `EU`/`VN` và Chương 98 vẫn `null`.
- **Không agent thực thi nào sửa file này.** Sửa bất kỳ nội dung nào trong `schedules` làm hash lệch → API quay về
  đóng an toàn (ví dụ 2 §5b.3, một dòng log cảnh báo lúc khởi động) cho tới khi chủ dự án duyệt lại và controller ghi
  hash mới.

---

### Task 1: Bộ trình bày `render.mjs`

**Files:**
- Create: `apps/zalo-bot/render.mjs`
- Create: `apps/zalo-bot/render.test.mjs`

**Interfaces:**
- Consumes: không (module thuần; test import `TextStyle` từ `zca-js` chỉ để so bảng nhãn).
- Produces:
  - `L(segs, ...marks) → Line`, với `Line = { segs: Array<string | [string, ...Mark]>, marks: Mark[] }`; `segs` rỗng = dòng trống (ranh giới đoạn).
  - `Mark` = `'b' | 'i' | 'green' | 'orange' | 'red' | 'small' | 'ul' | 'ol' | 'note' | 'warn'`. `note` = chữ nhỏ + nghiêng; `warn` = dòng cam, mọi dòng `warn` của một lần `render` gộp thành một, nối `; `. Nhãn lạ → `throw` (bắt lỗi gõ ở test).
  - `ST: Record<'b'|'i'|'green'|'orange'|'red'|'small'|'ul'|'ol', string>` — giá trị `TextStyle`.
  - `toText(input: string | Line[]) → string` — chữ thuần, không gộp `warn`.
  - `render(input: string | Line[], { budget = 1800 }) → Array<{ msg: string, styles: Array<{ start, len, st }> }>` — chuỗi thuần không bao giờ bị đọc ký hiệu; nhiều tin thì mỗi tin kết bằng dòng `note` `(k/n)`.
  - `md(text: string) → Line[]` — chỉ cho văn xuôi LLM; nhãn đầu ra ⊂ `{b, i, ul, ol}`.

- [ ] **Bước 1: Viết test thất bại**

```js
/**
 * The Zalo presenter: offsets, splitting, escaping and the colour boundary.
 *
 *   node --test apps/zalo-bot/
 *
 * Pure functions only — no Zalo login, no API, no LLM.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TextStyle } from 'zca-js';

import { L, md, render, ST, toText } from './render.mjs';

const texts = (p, st) => p.styles.filter((s) => s.st === st).map((s) => p.msg.slice(s.start, s.start + s.len));
const marksOf = (lines) => new Set(lines.flatMap((ln) => [...(ln.marks ?? []), ...ln.segs.flatMap((s) => (typeof s === 'string' ? [] : s.slice(1)))]));

test('bảng nhãn khớp TextStyle của zca-js', () => {
  assert.deepEqual(ST, {
    b: TextStyle.Bold,
    i: TextStyle.Italic,
    green: TextStyle.Green,
    orange: TextStyle.Orange,
    red: TextStyle.Red,
    small: TextStyle.Small,
    ul: TextStyle.UnorderedList,
    ol: TextStyle.OrderedList,
  }, 'nâng zca-js mà đổi mã style thì màu/đậm gửi đi sai âm thầm');
});

test('offset đúng trên chữ có dấu, kể cả khi đầu vào là NFD', () => {
  const [p] = render([L(['Đối với mã ', ['8481.80.99', 'b'], ' có xuất xứ ', ['Trung Quốc', 'b']])]);
  const bold = p.styles.filter((s) => s.st === 'b');
  assert.equal(bold[1].start, p.msg.indexOf('Trung Quốc'));
  assert.equal(bold[1].len, 10);
  const [q] = render([L(['Đối với mã '.normalize('NFD'), ['Trung Quốc'.normalize('NFD'), 'b']])]);
  assert.equal(q.msg, q.msg.normalize('NFC'), 'msg gửi đi phải là NFC');
  assert.deepEqual(texts(q, 'b'), ['Trung Quốc'], 'offset phải tính trên chuỗi đã NFC');
});

test('emoji đếm 2 đơn vị UTF-16', () => {
  const [p] = render([L(['🔍 ', ['x', 'b']])]);
  assert.equal(p.styles[0].start, 3);
});

test('đậm + xanh cùng đoạn ra hai style trùng khoảng; nhãn dòng không gồm \\n', () => {
  const [p] = render([L(['Có C/O: ', ['0%', 'b', 'green']], 'ul'), L(['dòng sau'])]);
  const b = p.styles.find((s) => s.st === 'b');
  const g = p.styles.find((s) => s.st === ST.green);
  assert.deepEqual([b.start, b.len], [g.start, g.len]);
  const ul = p.styles.find((s) => s.st === ST.ul);
  assert.deepEqual([ul.start, ul.len], [0, 'Có C/O: 0%'.length]);
});

test('tách tin tại ranh giới đoạn, style mỗi tin tính từ 0, có (k/n)', () => {
  const lines = [
    L(['Đoạn một có ', ['chữ đậm', 'b'], ' ở giữa, thêm vài chữ nữa.']),
    L([]),
    L([['Đoạn hai toàn chữ đỏ', 'red']]),
    L([]),
    L(['Đoạn ba ', ['nghiêng', 'i'], ' ở cuối câu.']),
  ];
  const parts = render(lines, { budget: 60 });
  assert.ok(parts.length >= 2, 'phải tách thành nhiều tin');
  for (const [k, p] of parts.entries()) {
    assert.ok(p.msg.length <= 60, `tin ${k + 1} dài ${p.msg.length}`);
    assert.ok(p.msg.endsWith(`(${k + 1}/${parts.length})`), 'mỗi tin kết bằng (k/n)');
    for (const s of p.styles) assert.ok(s.start + s.len <= p.msg.length, 'style vượt khỏi tin');
  }
  for (const piece of ['chữ đậm', 'Đoạn hai toàn chữ đỏ', 'nghiêng']) {
    assert.equal(parts.filter((p) => p.msg.includes(piece)).length, 1, `"${piece}" phải nằm trọn trong đúng một tin`);
  }
  const redPart = parts.find((p) => p.msg.includes('Đoạn hai'));
  assert.notEqual(redPart, parts[0], 'đoạn hai phải sang tin sau để kiểm offset tính lại từ 0');
  assert.deepEqual(texts(redPart, ST.red), ['Đoạn hai toàn chữ đỏ'], 'style của tin sau tính từ 0');
});

test('đoạn có nhãn dài hơn ngân sách bị cắt ở khoảng trắng, hai nửa cùng nhãn', () => {
  const long = 'một hai ba bốn năm sáu bảy tám chín mười mười một mười hai mười ba mười bốn';
  const parts = render([L([[long, 'red']], 'ul')], { budget: 50 });
  assert.ok(parts.length >= 2);
  for (const p of parts) {
    const red = texts(p, ST.red);
    assert.equal(red.length, 1, 'mỗi nửa giữ nhãn đỏ');
    assert.ok(!red[0].startsWith(' ') && !red[0].endsWith(' '), 'cắt ở khoảng trắng, không cắt giữa từ');
    assert.equal(texts(p, ST.ul).length, 1, 'nhãn dòng lặp trên mỗi nửa');
  }
  assert.equal(parts.map((p) => texts(p, ST.red)[0]).join(' '), long);
});

test('thoát ký tự: chỉ chuỗi đưa vào md() mới bị đọc ký hiệu', () => {
  for (const s of ['173.6*162.6*12.1', '**không**']) {
    const [p] = render([L([s])]);
    assert.equal(p.msg, s);
    assert.equal(p.styles.length, 0, 'đoạn thuần của builder không bao giờ sinh style');
  }
  const plain = (x) => render(md(x))[0];
  assert.equal(plain('173.6*162.6*12.1').styles.length, 0);
  const excl = plain('0405.90.10 (*) và 0405.90.90 (*)');
  assert.equal(excl.msg, '0405.90.10 (*) và 0405.90.90 (*)');
  assert.equal(excl.styles.length, 0, '(*) là dấu loại trừ trong văn bản, không phải nghiêng');
  assert.equal(plain('\\*x\\*').msg, '*x*');
  assert.equal(plain('**x').msg, '**x');
  assert.equal(plain('**x').styles.length, 0);
});

test('md(): danh sách, tiêu đề, đậm, nghiêng lồng nhau, [n] giữ nguyên', () => {
  const lines = md('## Tiêu đề\n- a\n1. b\nThuế **0% *có* điều kiện** [1]');
  assert.deepEqual(lines.map((l) => l.marks), [['b'], ['ul'], ['ol'], []]);
  assert.equal(toText(lines), 'Tiêu đề\na\nb\nThuế 0% có điều kiện [1]');
  const [p] = render(lines);
  assert.deepEqual(texts(p, 'b'), ['Tiêu đề', '0% có điều kiện']);
  assert.deepEqual(texts(p, 'i'), ['có']);
});

test('md() không có đường nào sinh màu', () => {
  const lines = md('{red}0%{/red} <b>x</b> ~~y~~ `z` [l](u)\n- **a** *b*');
  const allowed = new Set(['b', 'i', 'ul', 'ol']);
  for (const m of marksOf(lines)) assert.ok(allowed.has(m), `md() sinh nhãn ngoài tập cho phép: ${m}`);
  const [p] = render(md('{red}0%{/red} <b>x</b>'));
  assert.equal(p.styles.length, 0);
});

test('mọi dòng warn gộp thành một dòng cam, không bị thu nhỏ', () => {
  const [p] = render([
    L(['Mặt hàng có thể thuộc nhiều nhóm'], 'warn'),
    L(['thân']),
    L(['Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP'], 'warn'),
  ]);
  const orange = texts(p, ST.orange);
  assert.equal(orange.length, 1, 'đúng một dòng cảnh báo');
  assert.equal(orange[0], 'Mặt hàng có thể thuộc nhiều nhóm; Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP');
  assert.equal(p.styles.filter((s) => s.st === ST.small).length, 0, 'warn không bao giờ thành chữ nhỏ');
  assert.equal(p.msg.split('\n').length, 2);
});
```

- [ ] **Bước 2: Chạy để thấy thất bại**

Run: `node --test apps/zalo-bot/render.test.mjs`
Expected: FAIL — `Cannot find module '…/apps/zalo-bot/render.mjs'`.

- [ ] **Bước 3: Viết `render.mjs`**

```js
/**
 * The one presenter for Zalo. Pure: no I/O, no zca-js import.
 *
 * Two ways in, one way out. Deterministic builders (format.mjs) hand over Line[] whose
 * segments carry semantic marks; only they can colour anything. LLM prose goes through
 * md(), whose output marks are {b, i, ul, ol} by construction: no syntax a model writes
 * can produce a colour. That is how "colours are decided by code from data" holds in code.
 *
 * Offsets are JavaScript string indices (UTF-16 units) on NFC text, the way the demo
 * message that rendered correctly on phone and Zalo PC computed them.
 */

/** Semantic mark → zca-js TextStyle value (2.1.2). render.test.mjs compares this with the library enum. */
export const ST = {
  b: 'b',
  i: 'i',
  green: 'c_15a85f',
  orange: 'c_f27806',
  red: 'c_db342e',
  small: 'f_13',
  ul: 'lst_1',
  ol: 'lst_2',
};
const EXPAND = { note: [ST.small, ST.i], warn: [ST.orange] };

/** Line = { segs: Array<string | [string, ...mark]>, marks?: mark[] }; empty segs = blank line (paragraph break). */
export const L = (segs, ...marks) => ({ segs, marks });

const seg = (s) => (typeof s === 'string' ? [s.normalize('NFC')] : [String(s[0]).normalize('NFC'), ...s.slice(1)]);
const lineText = (ln) => ln.segs.map((s) => seg(s)[0]).join('');
const BLANK = L([]);

/** Plain text of a reply: for sanitizeLead, the saved bot turn, and tests. Never an evidence body. */
export function toText(input) {
  return typeof input === 'string' ? input.normalize('NFC') : input.map(lineText).join('\n');
}

/** Merge every `warn` line into one orange line at the first one's place, joined by "; ". */
function mergeWarnings(lines) {
  const warns = lines.filter((ln) => ln.marks?.includes('warn'));
  if (warns.length < 2) return lines;
  const merged = L(
    warns.flatMap((ln, k) => (k ? ['; ', ...ln.segs] : ln.segs)),
    'warn',
  );
  return lines.flatMap((ln) => (ln === warns[0] ? [merged] : warns.includes(ln) ? [] : [ln]));
}

function build(lines) {
  let msg = '';
  const styles = [];
  const add = (start, len, mark) => {
    const sts = EXPAND[mark] ?? (ST[mark] ? [ST[mark]] : null);
    if (!sts) throw new Error(`render: unknown mark "${mark}"`);
    for (const st of sts) {
      // Nested markup splits one run into adjacent segments; send it as one style.
      const prev = styles.findLast((x) => x.st === st && x.start + x.len === start);
      if (prev) prev.len += len;
      else styles.push({ start, len, st });
    }
  };
  lines.forEach((ln, k) => {
    if (k) msg += '\n';
    const lineStart = msg.length;
    for (const s of ln.segs) {
      const [text, ...marks] = seg(s);
      const start = msg.length;
      msg += text;
      if (text) for (const m of marks) add(start, text.length, m);
    }
    const len = msg.length - lineStart;
    if (len) for (const m of ln.marks ?? []) add(lineStart, len, m);
  });
  return { msg, styles };
}

const size = (lines) => lines.reduce((n, ln) => n + lineText(ln).length, 0) + Math.max(0, lines.length - 1);

/** Cut one over-long line at segment boundaries; a marked segment is only cut when it alone exceeds the limit. */
function splitLine(line, limit) {
  const out = [];
  let cur = [];
  let len = 0;
  const push = () => {
    if (cur.length) out.push({ segs: cur, marks: line.marks });
    cur = [];
    len = 0;
  };
  const queue = line.segs.map(seg);
  while (queue.length) {
    const [text, ...marks] = queue.shift();
    if (len + text.length <= limit) {
      cur.push([text, ...marks]);
      len += text.length;
      continue;
    }
    if (len && (marks.length || text.lastIndexOf(' ', limit - len) <= 0)) {
      push();
      queue.unshift([text, ...marks]);
      continue;
    }
    const room = limit - len;
    const space = text.lastIndexOf(' ', room);
    const cut = space > 0 ? space : room;
    cur.push([text.slice(0, cut), ...marks]);
    push();
    queue.unshift([text.slice(cut).replace(/^ /, ''), ...marks]);
  }
  push();
  return out;
}

/**
 * Line[] (or a plain string, never read for markup) → Zalo messages with styles.
 * Splits on paragraph boundaries BEFORE computing offsets, so every message counts from 0.
 */
export function render(input, { budget = 1800 } = {}) {
  const raw = typeof input === 'string' ? input.normalize('NFC').replace(/\r\n?/g, '\n').split('\n').map((t) => L([t])) : input;
  const lines = mergeWarnings(raw);
  const paras = [];
  let para = [];
  for (const ln of lines) {
    if (lineText(ln) === '') {
      if (para.length) paras.push(para);
      para = [];
    } else para.push(ln);
  }
  if (para.length) paras.push(para);

  const all = paras.flatMap((p, k) => (k ? [BLANK, ...p] : p));
  if (size(all) <= budget) return [build(all)];

  const limit = budget - 8; // room for the "(k/n)" line
  const msgs = [];
  let cur = [];
  const flush = () => {
    if (cur.length) msgs.push(cur);
    cur = [];
  };
  for (const p of paras) {
    const next = cur.length ? [BLANK, ...p] : p;
    if (size([...cur, ...next]) <= limit) {
      cur.push(...next);
      continue;
    }
    flush();
    if (size(p) <= limit) {
      cur.push(...p);
      continue;
    }
    for (const ln of p.flatMap((l) => (lineText(l).length > limit ? splitLine(l, limit) : [l]))) {
      if (cur.length && size([...cur, ln]) > limit) flush();
      cur.push(ln);
    }
  }
  flush();
  return msgs.map((m, k) => build([...m, L([`(${k + 1}/${msgs.length})`], 'note')]));
}

// --- md(): the Markdown subset LLM prose may use ------------------------------

const WORD = /[\p{L}\p{N}]/u;

/** Inline `**b**` / `*i*` with CommonMark-like flanking; everything else is text. */
function inline(text) {
  const toks = [];
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (ch === '\\' && (text[i + 1] === '*' || text[i + 1] === '\\')) {
      toks.push({ text: text[i + 1] });
      i += 2;
      continue;
    }
    if (ch === '*') {
      let j = i;
      while (text[j] === '*') j++;
      const run = text.slice(i, j);
      const prev = text[i - 1] ?? '';
      const next = text[j] ?? '';
      // A `*` between letters/digits (173.6*162.6) or against a parenthesis ("(*)") is text.
      const literal = run.length > 2 || (WORD.test(prev) && WORD.test(next)) || /[()]/.test(prev) || /[()]/.test(next);
      toks.push(
        literal
          ? { text: run }
          : { delim: run, open: next !== '' && (WORD.test(next) || next === '*'), close: prev !== '' && !/\s/.test(prev) },
      );
      i = j;
      continue;
    }
    let j = i;
    while (j < text.length && text[j] !== '*' && text[j] !== '\\') j++;
    if (j === i) j = i + 1; // a lone backslash
    toks.push({ text: text.slice(i, j) });
    i = j;
  }
  const stack = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (!t.delim) continue;
    const at = t.close ? stack.findLastIndex((o) => toks[o].delim === t.delim) : -1;
    if (at >= 0) {
      toks[stack[at]].role = 'open';
      t.role = 'close';
      stack.length = at;
    } else if (t.open) stack.push(k);
  }
  const segs = [];
  const active = [];
  for (const t of toks) {
    if (t.role) {
      const mark = t.delim === '**' ? 'b' : 'i';
      if (t.role === 'open') active.push(mark);
      else active.splice(active.lastIndexOf(mark), 1);
      continue;
    }
    const s = t.text ?? t.delim;
    const last = segs[segs.length - 1];
    const sameMarks = last && JSON.stringify(last.slice(1)) === JSON.stringify(active);
    if (sameMarks) last[0] += s;
    else segs.push([s, ...active]);
  }
  return segs.map((s) => (s.length === 1 ? s[0] : s));
}

/** LLM prose → Line[]. Output marks are only b, i, ul, ol. */
export function md(text) {
  const src = String(text ?? '').normalize('NFC').replace(/\r\n?/g, '\n');
  const out = [];
  for (const raw of src.split('\n')) {
    if (!raw.trim()) {
      if (out.length && lineText(out[out.length - 1]) !== '') out.push(L([]));
      continue;
    }
    let m;
    if ((m = raw.match(/^\s*#{1,3}\s+(.*)$/))) out.push({ segs: inline(m[1]), marks: ['b'] });
    else if ((m = raw.match(/^\s*[-*•]\s+(.*)$/))) out.push({ segs: inline(m[1]), marks: ['ul'] });
    else if ((m = raw.match(/^\s*\d+[.)]\s+(.*)$/))) out.push({ segs: inline(m[1]), marks: ['ol'] });
    else out.push({ segs: inline(raw), marks: [] });
  }
  return out;
}
```

- [ ] **Bước 4: Chạy lại**

Run: `node --test apps/zalo-bot/render.test.mjs && corepack yarn test:bot 2>&1 | grep -E "ℹ (pass|fail)"`
Expected: `ℹ pass 10`, `ℹ fail 0` cho file mới; toàn bộ bot `ℹ pass 35`, `ℹ fail 0`.

- [ ] **Bước 5: Commit**

```bash
git add apps/zalo-bot/render.mjs apps/zalo-bot/render.test.mjs
git commit -m "Add the Zalo rich-text presenter: Line[] to styled, split messages" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: API — bảng thành viên FTA có cổng ký, `originEligible`, dòng phạm vi kho

**Files:**
- Modify: `apps/api/src/modules/tariff/tariff.types.ts` (`PreferentialView` dòng 47–60, `StalenessView` dòng 77–84, `TariffResponse` dòng 101–117)
- Modify: `apps/api/src/modules/tariff/tariff.service.ts` (import dòng 1–3, `subtractDays` dòng 104–108, constructor dòng 116–120, `lookup`, `toPreferentialView`, `staleness` cuối file)
- Test: `apps/api/src/modules/tariff/tariff.service.spec.ts` (thay helper dòng 1–26, thêm test cuối file)
- Modify: `public/index.html` (dòng 112–114), `docker-compose.yml` (dòng 104–105), `.agent/docs/mona-dev-server-operations.md` (bảng biến môi trường, dòng `DATA_SNAPSHOT_DATE`)

**Interfaces:**
- Consumes: `PreferentialView.sublines`, `originExcluded`, `excludedOrigins` (commit `21ddcb4`).
- Produces (bot Task 3 và web UI đọc):
  - `PreferentialView.rate: string` — `statement` gốc không kèm điều kiện C/O ("0%", "Loại trừ khỏi biểu (không phải 0%)", "Theo dòng 10 số (…)").
  - `PreferentialView.originEligible: boolean | null`.
  - `TariffResponse.ftaMembership: { verifiedBy: string; verifiedAt: string } | null`.
  - `StalenessView = { latestInstrument: { number; effectiveFrom; effectiveTo } | null; unloadedInstruments: string[]; pendingExtension: string | null; warning: string }` — bỏ `snapshotDate`, `reliableThrough`, `stale`.
  - Export thuần: `ftaMembership(json: unknown): FtaMembership | null`, `originEligible(m, schedule, origin, originExcluded, sublineExcluded): boolean | null`, `stalenessView(decrees: DecreeRow[], date: string, extendedBy: string[]): StalenessView`, `interface DecreeRow`.
  - `TariffService` không còn nhận `ConfigService`; trường công khai `membership: FtaMembership | null`.

**Vì sao "mới nhất" = `effective_from` lớn nhất trong các nghị định có dòng thuế đã nạp và còn hiệu lực tại ngày tra:**
`effective_from` NOT NULL và chính là trục mà truy vấn thuế lọc (R8); `signed_date` có thể null, `gazette_date` null ở
mọi dòng seed, `recorded_at` là giờ seed (nguồn của câu sai "dữ liệu chốt 2026-09-13"). Lọc "còn hiệu lực" để
72/2026/NĐ-CP (hết 30/04/2026) không đứng tên biểu ngày 13/09/2026; lọc "có dòng thuế đã nạp" để 201/2026/NĐ-CP
(01/01/2026, chưa nạp dòng nào) không làm câu "cập nhật tới" nói quá. Ngày 13/09/2026 kết quả là **26/2023/NĐ-CP
(hiệu lực 15/07/2023)**, không phải 72/2026/NĐ-CP như câu mẫu ban đầu (spec §5b.4).

- [ ] **Bước 1: Viết test thất bại**

Thay toàn bộ phần đầu `tariff.service.spec.ts` — từ dòng 1 tới hết hàm `lookup` (ngay trước `const CONDITIONAL`) — bằng:

```ts
import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { ftaMembership, originEligible, stalenessView, TariffService, type DecreeRow } from './tariff.service';

/**
 * ND 118/2022/NĐ-CP (ACFTA) excludes named origins per tariff line, and FTA decrees detail some
 * 8-digit codes into 10-digit national sub-lines with their own rates. Serving the ACFTA 0% to an
 * excluded origin, or one sub-line's rate as the whole 8-digit line's, is the characteristic
 * wrong-but-valid answer, so these pin the statement a user reads. No database: queries are routed
 * to fixtures by their SQL text.
 */
const dialect = new PgDialect();
function fakeDb(rateRows: unknown[], { decrees = [] as DecreeRow[], extended = [] as unknown[] } = {}) {
  const calls: string[] = [];
  return {
    calls,
    execute: async (q: SQL) => {
      const text = dialect.sqlToQuery(q).sql;
      calls.push(text);
      if (text.includes('FROM decree d')) return decrees;
      if (text.includes('extended_by')) return extended;
      if (text.includes('JOIN annex a')) return rateRows;
      return []; // goods, anti-dumping
    },
  };
}

const common = { annex: 'ACFTA', trade_direction: 'import', amount: null, amount_currency: null, amount_unit: null, out_of_quota_annex_id: null };
const MFN = { ...common, annex: 'II', schedule: 'NK_uu_dai', schedule_name: 'MFN', fta_form: null, requires_co: false, rate_type: 'ad_valorem', rate_percent: '15.0000', effective_from: '2023-07-15', effective_to: null, conditions: null, decree: '26/2023/NĐ-CP' };
const acfta = (conditions: Record<string, unknown> | null, rate: Record<string, unknown> = {}) => ({
  ...common, schedule: 'ACFTA', schedule_name: 'ASEAN–Trung Quốc (ACFTA)', fta_form: 'E', requires_co: true,
  rate_type: 'ad_valorem', rate_percent: '0.0000', effective_from: '2022-12-30', effective_to: '2027-12-31', conditions, decree: '118/2022/NĐ-CP',
  ...rate,
});

async function lookup(conditions: Record<string, unknown> | null, origin?: string, rate: Record<string, unknown> = {}) {
  const svc = new TariffService(fakeDb([MFN, acfta(conditions, rate)]) as never);
  const res = await svc.lookup('0901.11.20', origin, '2026-06-01');
  return { res, pref: res.import.preferential[0]! };
}
```

Giữ nguyên mọi `describe` hiện có (kể cả test "an ad_valorem sub-line without a percent"). Thêm vào **cuối file**:

```ts
// --- FTA membership: the verifiedBy gate (R18, §5b.4) --------------------------

const SCHEDULES = [
  { schedule: 'ACFTA', members: [{ iso2: 'CN', name: 'Trung Quốc' }, { iso2: 'TH', name: 'Thái Lan' }] },
  { schedule: 'AANZFTA', members: [{ iso2: 'AU', name: 'Úc' }] },
  { schedule: 'ATIGA', members: [] as Array<{ iso2: string; name: string }> },
];
/** A table as the owner would sign it: the hash is taken over exactly these schedules. */
function signed(over: Record<string, unknown> = {}, schedules: unknown = SCHEDULES) {
  const copy = structuredClone(schedules);
  return {
    version: 1,
    verifiedBy: 'Người Xác Minh',
    verifiedAt: '2026-09-20',
    schedules: copy,
    verifiedHash: createHash('sha256').update(JSON.stringify(copy)).digest('hex'),
    ...over,
  };
}

describe('ftaMembership — only a named, unedited signature counts', () => {
  it('is null until a person signs', () => {
    expect(ftaMembership(signed({ verifiedBy: null }))).toBeNull();
    expect(ftaMembership(signed({ verifiedBy: '' }))).toBeNull();
    expect(ftaMembership(null)).toBeNull();
  });

  it('is null on a bad date, a bad ISO code or a missing hash', () => {
    expect(ftaMembership(signed({ verifiedAt: '20/09/2026' }))).toBeNull();
    expect(ftaMembership(signed({}, [{ schedule: 'ACFTA', members: [{ iso2: 'China' }] }]))).toBeNull();
    expect(ftaMembership(signed({ verifiedHash: undefined }))).toBeNull();
  });

  it('is null when a member is changed after signing', () => {
    const j = signed();
    (j.schedules as typeof SCHEDULES)[0]!.members.push({ iso2: 'JP', name: 'Nhật Bản' });
    expect(ftaMembership(j)).toBeNull();
  });

  it('reads a signed table; an empty member list is absent, never "no members"', () => {
    const m = ftaMembership(signed())!;
    expect(m.verifiedBy).toBe('Người Xác Minh');
    expect([...m.members.get('ACFTA')!]).toEqual(['CN', 'TH']);
    expect(m.members.has('ATIGA')).toBe(false);
  });
});

describe('originEligible — membership is necessary, not sufficient', () => {
  const m = ftaMembership(signed());

  it('member → true, non-member → false', () => {
    expect(originEligible(m, 'ACFTA', 'CN', null, false)).toBe(true);
    expect(originEligible(m, 'AANZFTA', 'CN', null, false)).toBe(false);
  });

  it('excluded on the line → false; excluded on a 10-digit sub-line only → null', () => {
    expect(originEligible(m, 'ACFTA', 'CN', true, false)).toBe(false);
    expect(originEligible(m, 'ACFTA', 'CN', false, true)).toBeNull();
  });

  it('null whenever the table cannot say', () => {
    const cases: Array<[typeof m, string, string | null]> = [
      [m, 'ACFTA', 'EU'], [m, 'ACFTA', 'VN'], [m, 'ACFTA', null], [null, 'ACFTA', 'CN'], [m, 'NK_uu_dai_98', 'CN'], [m, 'ATIGA', 'TH'],
    ];
    for (const [mm, schedule, origin] of cases) expect(originEligible(mm, schedule, origin, null, false)).toBeNull();
  });
});

describe('TariffService — membership and rate in the response', () => {
  async function withTable(table: unknown, conditions: Record<string, unknown> | null, origin: string) {
    const svc = new TariffService(fakeDb([MFN, acfta(conditions)]) as never);
    svc.membership = ftaMembership(table);
    return svc.lookup('0901.11.20', origin, '2026-06-01');
  }

  it('unverified table: ftaMembership null and every FTA row null', async () => {
    const res = await withTable(signed({ verifiedBy: null }), null, 'CN');
    expect(res.ftaMembership).toBeNull();
    expect(res.import.preferential[0]!.originEligible).toBeNull();
  });

  it('verified table, member origin: eligible, rate without the condition, statement unchanged', async () => {
    const res = await withTable(signed(), null, 'CN');
    const pref = res.import.preferential[0]!;
    expect(res.ftaMembership).toEqual({ verifiedBy: 'Người Xác Minh', verifiedAt: '2026-09-20' });
    expect(pref.originEligible).toBe(true);
    expect(pref.rate).toBe('0%');
    expect(pref.statement).toBe(CONDITIONAL);
  });

  it('verified table, member origin excluded on one 10-digit sub-line: null, never eligible', async () => {
    const conditions = { sublines: [sub('0901.11.20.10', '- - Loại một', '0', ['CN']), sub('0901.11.20.90', '- - Loại khác', '0')] };
    expect((await withTable(signed(), conditions, 'CN')).import.preferential[0]!.originEligible).toBeNull();
  });

  it('every FTA statement not refused by origin still carries the C/O condition (evidence invariant for Mảng 2)', async () => {
    const cases: Array<[Record<string, unknown> | null, string | undefined, Record<string, unknown>]> = [
      [null, 'CN', {}], [LINE, 'SG', {}], [BY_SUBLINE, undefined, BY_SUBLINE_RATE], [UNIFORM, 'TH', {}],
    ];
    for (const [conditions, origin, rate] of cases) {
      expect((await lookup(conditions, origin, rate)).pref.statement).toContain('nếu có C/O form');
    }
  });
});

// --- Scope line from the decree table (R7, R8, §5b.4) ---------------------------

/** The decree rows db/seed/index.ts writes, with whether any tariff line cites them. */
const DECREES: DecreeRow[] = [
  { number: '26/2023/NĐ-CP', effective_from: '2023-07-15', effective_to: null, signed_date: '2023-05-31', loaded: true },
  { number: '144/2024/NĐ-CP', effective_from: '2024-12-16', effective_to: null, signed_date: '2024-11-01', loaded: false },
  { number: '108/2025/NĐ-CP', effective_from: '2025-05-19', effective_to: null, signed_date: '2025-05-19', loaded: false },
  { number: '199/2025/NĐ-CP', effective_from: '2025-07-08', effective_to: null, signed_date: '2025-07-08', loaded: false },
  { number: '72/2026/NĐ-CP', effective_from: '2026-03-09', effective_to: '2026-04-30', signed_date: '2026-03-09', loaded: true },
  { number: '201/2026/NĐ-CP', effective_from: '2026-01-01', effective_to: null, signed_date: '2026-01-01', loaded: false },
  ...['118/2022/NĐ-CP', '121/2022/NĐ-CP', '126/2022/NĐ-CP', '116/2022/NĐ-CP'].map((number) => ({
    number, effective_from: '2022-12-30', effective_to: '2027-12-31', signed_date: '2022-12-30', loaded: true,
  })),
];

describe('stalenessView — names the loaded decree in force on the query date', () => {
  it('2026-09-13: 26/2023, not the expired 72/2026; four recorded decrees have no lines', () => {
    const v = stalenessView(DECREES, '2026-09-13', []);
    expect(v.latestInstrument).toEqual({ number: '26/2023/NĐ-CP', effectiveFrom: '2023-07-15', effectiveTo: null });
    expect(v.unloadedInstruments).toEqual(['144/2024/NĐ-CP', '108/2025/NĐ-CP', '199/2025/NĐ-CP', '201/2026/NĐ-CP']);
    expect(v.warning).toBe(
      'Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP (hiệu lực 15/07/2023); chưa nạp dòng thuế của 4 nghị định biểu thuế còn hiệu lực — đối chiếu trước khi khai.',
    );
    expect(v.pendingExtension).toBeNull();
  });

  it('2026-04-01: 72/2026 is in force and its window is printed', () => {
    const v = stalenessView(DECREES, '2026-04-01', []);
    expect(v.latestInstrument?.number).toBe('72/2026/NĐ-CP');
    expect(v.warning).toContain('NĐ 72/2026/NĐ-CP (hiệu lực 09/03/2026–30/04/2026)');
  });

  it('2023-08-01: nothing recorded is missing yet', () => {
    const v = stalenessView(DECREES, '2023-08-01', []);
    expect(v.latestInstrument?.number).toBe('26/2023/NĐ-CP');
    expect(v.unloadedInstruments).toEqual([]);
    expect(v.warning).toBe('Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP (hiệu lực 15/07/2023); văn bản ban hành sau mốc này có thể chưa có.');
  });

  it('no decree rows: says it cannot tell', () => {
    expect(stalenessView([], '2026-09-13', []).warning).toBe(
      'Không xác định được văn bản biểu thuế đã nạp cho ngày 13/09/2026 — đối chiếu nguồn trước khi dùng.',
    );
  });

  it('a recorded extension is surfaced only up to its own end date', () => {
    const ext = ['NQ 25/2026 đến 2026-06-30 — cần nạp riêng'];
    const v = stalenessView(DECREES, '2026-05-15', ext).pendingExtension!;
    expect(v).toContain('NQ 25/2026');
    expect(v).toContain('30/06/2026');
    expect(stalenessView(DECREES, '2026-07-01', ext).pendingExtension).toBeNull();
  });

  it('the service reads the decree table once and passes this code\'s extensions through', async () => {
    const db = fakeDb([MFN, acfta(null)], { decrees: DECREES, extended: [{ extended_by: 'NQ 25/2026 đến 2026-06-30 — cần nạp riêng' }] });
    const svc = new TariffService(db as never);
    await svc.lookup('0901.11.20', undefined, '2026-05-15');
    const res = await svc.lookup('0901.11.20', undefined, '2026-05-15');
    expect(db.calls.filter((t) => t.includes('FROM decree d'))).toHaveLength(1);
    expect(res.staleness.latestInstrument?.number).toBe('26/2023/NĐ-CP');
    expect(res.staleness.pendingExtension).toContain('NQ 25/2026');
  });
});
```

- [ ] **Bước 2: Chạy để thấy thất bại**

Run: `node_modules/.bin/jest apps/api/src/modules/tariff`
Expected: FAIL — `Module '"./tariff.service"' has no exported member 'ftaMembership'` (và `stalenessView`, `DecreeRow`).

- [ ] **Bước 3: Đổi hợp đồng trong `tariff.types.ts`**

Trong `PreferentialView`, sau `sublines: SublineView[];` thêm:

```ts
  /**
   * The rate alone, without the C/O condition: the base statement ("0%", "Loại trừ khỏi biểu (không phải 0%)",
   * "Theo dòng 10 số (không có một mức chung cho mã 8 số)").
   */
  rate: string;
  /**
   * true: member per the verified table, excluded neither on this line nor on a 10-digit sub-line;
   * false: not a member, or excluded on this line; null: no origin, table unverified, EU/VN,
   * schedule absent from the table, or excluded on a sub-line only.
   */
  originEligible: boolean | null;
```

Thay cả khối `/** Data-freshness verdict (TASK-010). */ export interface StalenessView { … }` bằng:

```ts
/** Which loaded tariff instrument the answer stands on, and what is recorded but not loaded (R7). */
export interface StalenessView {
  /** The loaded tariff decree in force on the query date with the latest effective_from; null when none. */
  latestInstrument: { number: string; effectiveFrom: string; effectiveTo: string | null } | null;
  /** Decrees recorded in the decree table, in force on the query date, with no tariff line loaded. */
  unloadedInstruments: string[];
  /** A recorded, unloaded extension of an expired rate on this HS that may cover the query date. */
  pendingExtension: string | null;
  /** Always present: one line naming the latest loaded instrument. */
  warning: string;
}
```

Trong `TariffResponse`, sau `staleness: StalenessView;` thêm:

```ts
  /** Who verified the FTA membership table (R18); null = unverified, so no origin filtering and no "eligible". */
  ftaMembership: { verifiedBy: string; verifiedAt: string } | null;
```

- [ ] **Bước 4: Viết phần service**

4a. Thay **ba** dòng import đầu (`@nestjs/common`, `@nestjs/config`, `drizzle-orm`) bằng khối dưới — khối đã gồm
`import { sql }`; chỉ thay hai dòng thì còn một `import { sql }` trùng và `tsc`/Jest báo `TS2300 Duplicate identifier 'sql'`:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
```

4b. Thay hàm `subtractDays` bằng (hàm thuần, export để test):

```ts
const dmy = (iso: string): string => iso.split('-').reverse().join('/');

export interface FtaMembership {
  verifiedBy: string;
  verifiedAt: string;
  members: Map<string, Set<string>>;
}

/**
 * Membership per schedule code, or null unless the file parses, a named person verified it (R18),
 * AND verifiedHash still matches the schedules they verified. Null means: no origin filtering, no green.
 */
export function ftaMembership(json: unknown): FtaMembership | null {
  const j = (json ?? {}) as { verifiedBy?: unknown; verifiedAt?: unknown; verifiedHash?: unknown; schedules?: unknown };
  if (typeof j.verifiedBy !== 'string' || !j.verifiedBy.trim()) return null;
  if (typeof j.verifiedAt !== 'string' || !ISO_DATE.test(j.verifiedAt)) return null;
  if (!Array.isArray(j.schedules)) return null;
  // The signature covers exactly the content that was read: an edit after signing voids it.
  if (j.verifiedHash !== createHash('sha256').update(JSON.stringify(j.schedules)).digest('hex')) return null;
  const members = new Map<string, Set<string>>();
  for (const s of j.schedules as Array<{ schedule?: unknown; members?: unknown }>) {
    const codes = arr<{ iso2?: unknown }>(s?.members).map((m) => m?.iso2);
    if (typeof s?.schedule !== 'string' || codes.some((c) => typeof c !== 'string' || !ALPHA2.test(c))) return null;
    if (codes.length) members.set(s.schedule, new Set(codes as string[])); // empty list: absent, never "not a member"
  }
  return { verifiedBy: j.verifiedBy, verifiedAt: j.verifiedAt, members };
}

/** EU is a bloc (ND 116 lists member states); VN goods from non-tariff zones are a special origin, not a member row. */
const UNDETERMINED_ORIGINS = new Set(['EU', 'VN']);

export function originEligible(
  m: FtaMembership | null,
  schedule: string,
  origin: string | null,
  originExcluded: boolean | null,
  sublineExcluded: boolean,
): boolean | null {
  if (!m || !origin || UNDETERMINED_ORIGINS.has(origin)) return null;
  const set = m.members.get(schedule);
  if (!set) return null; // schedule absent from the table (Chapter 98, a later FTA load): unknown, never "not a member"
  if (!set.has(origin)) return false;
  if (originExcluded === true) return false; // membership is necessary, not sufficient (ND 118 per-line exclusions)
  return sublineExcluded ? null : true; // excluded on a 10-digit sub-line: depends on the goods, never green
}

function readMembership(): FtaMembership | null {
  let json: unknown = null;
  try {
    json = JSON.parse(readFileSync(join(process.cwd(), 'db/seed/data/fta-members.json'), 'utf8'));
  } catch {
    /* missing or unreadable: stays null (fail closed) */
  }
  const m = ftaMembership(json);
  if (!m) {
    new Logger('TariffService').warn(
      'db/seed/data/fta-members.json is not in effect (unverified, missing, invalid, or edited after verification): FTA rows are not filtered by origin and never marked eligible',
    );
  }
  return m;
}

/** One row of the decree table, with whether any current tariff line cites it. */
export interface DecreeRow {
  number: string;
  effective_from: string;
  effective_to: string | null;
  signed_date: string | null;
  loaded: boolean;
}

/**
 * What the answer stands on, from the decree table — not from when the seed ran.
 * "Latest" = the loaded decree IN FORCE on the query date with the greatest effective_from
 * (ties: signed_date, then number), so a 2023 question never cites a 2026 decree and an
 * expired decree (72/2026 after 30/04/2026) never names the schedule in force.
 */
export function stalenessView(decrees: DecreeRow[], date: string, extendedBy: string[]): StalenessView {
  const inForce = decrees.filter((d) => d.effective_from <= date && (d.effective_to == null || date <= d.effective_to));
  const latest = inForce
    .filter((d) => d.loaded)
    .sort(
      (a, b) =>
        b.effective_from.localeCompare(a.effective_from) ||
        (b.signed_date ?? '').localeCompare(a.signed_date ?? '') ||
        b.number.localeCompare(a.number),
    )[0];
  const unloadedInstruments = inForce
    .filter((d) => !d.loaded)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    .map((d) => d.number);
  let warning: string;
  if (!latest) {
    warning = `Không xác định được văn bản biểu thuế đã nạp cho ngày ${dmy(date)} — đối chiếu nguồn trước khi dùng.`;
  } else {
    const window = `${dmy(latest.effective_from)}${latest.effective_to ? `–${dmy(latest.effective_to)}` : ''}`;
    warning = `Biểu thuế trong kho cập nhật tới NĐ ${latest.number} (hiệu lực ${window}); ${
      unloadedInstruments.length
        ? `chưa nạp dòng thuế của ${unloadedInstruments.length} nghị định biểu thuế còn hiệu lực — đối chiếu trước khi khai.`
        : 'văn bản ban hành sau mốc này có thể chưa có.'
    }`;
  }
  // The date comes only from the recorded string; an unreadable one is still printed (fail closed).
  const pendingExtension =
    extendedBy
      .map((s) => {
        const m = s.match(/^(.+?) đến (\d{4}-\d{2}-\d{2})/);
        if (!m) return `Mức thuế nhập khẩu ưu đãi của mã này có thể đã được gia hạn (${s}) nhưng văn bản đó chưa nạp — đối chiếu trước khi khai.`;
        return date <= m[2]!
          ? `Mức thuế nhập khẩu ưu đãi của mã này có thể đã được ${m[1]} gia hạn tới ${dmy(m[2]!)} nhưng văn bản đó chưa nạp — đối chiếu trước khi khai.`
          : null;
      })
      .find((x) => x) ?? null;
  return {
    latestInstrument: latest ? { number: latest.number, effectiveFrom: latest.effective_from, effectiveTo: latest.effective_to } : null,
    unloadedInstruments,
    pendingExtension,
    warning,
  };
}
```

4c. Thay đầu class (từ `export class TariffService {` tới hết constructor) bằng:

```ts
export class TariffService {
  /** Read once at start-up; not readonly so a spec can assign a fixture. */
  membership: FtaMembership | null = readMembership();
  /** The decree table changes only with a seed, and a seed ships with a restart. */
  private decrees?: Promise<DecreeRow[]>;

  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}
```

4d. Trong `lookup`: đổi `const staleness = await this.staleness(dateRaw);` thành `const staleness = await this.staleness(hs, dateRaw);`; trong thân 404 đổi `snapshotDate: staleness.snapshotDate,` thành `latestInstrument: staleness.latestInstrument,`. Thay khối từ `const preferential = prefRows.map(…)` tới hết `if (origin && preferential.length === 0) { … }` bằng:

```ts
    // Every conditional statement already carries "nếu có C/O … hợp lệ, ngược lại … (MFN)".
    const preferential = prefRows.map((r) => this.toPreferentialView(r, mfn, nd118Origin, origin));
    if (origin && preferential.length === 0) {
      notes.push('Mã này không có dòng trong các biểu FTA đã nạp; chỉ trả về MFN.');
    }
```

Đổi `chapter98: ch98Rows.map((r) => this.toPreferentialView(r, mfn, nd118Origin)),` thành `chapter98: ch98Rows.map((r) => this.toPreferentialView(r, mfn, nd118Origin, origin)),`, và phần cuối object trả về thành:

```ts
      antiDumping: await this.antiDumping(hs, origin, dateRaw),
      staleness,
      ftaMembership: this.membership ? { verifiedBy: this.membership.verifiedBy, verifiedAt: this.membership.verifiedAt } : null,
      notes,
    };
```

4e. Đổi chữ ký `toPreferentialView` (giữ nguyên thân, kể cả nhánh `s.percent == null`):

```ts
  /**
   * `origin`: the queried origin only when it is an ND 118 code, else null (see lookup) — it drives the per-line
   * exclusions. `queried`: the origin as given, for membership.
   */
  private toPreferentialView(r: RateRow, mfn: RateView | null, origin: string | null, queried: string | null): PreferentialView {
```

và cuối object nó trả về:

```ts
      sublines,
      statement,
      rate: base.statement,
      originEligible: originEligible(this.membership, r.schedule, queried, originExcluded, sublines.some((s) => s.originExcluded === true)),
    };
```

4f. Thay cả khối JSDoc `TASK-010…` và phương thức `staleness(date)` bằng:

```ts
  /** R7: name the instrument the answer stands on (see stalenessView). */
  private async staleness(hs: string, date: string): Promise<StalenessView> {
    this.decrees ??= (
      this.db.execute(sql`
        SELECT d.number, d.effective_from::text AS effective_from, d.effective_to::text AS effective_to,
               d.signed_date::text AS signed_date,
               EXISTS (SELECT 1 FROM tariff_rate r WHERE r.source_decree_id = d.id AND r.superseded_at IS NULL) AS loaded
        FROM decree d
      `) as unknown as Promise<DecreeRow[]>
    ).catch((e: unknown) => {
      this.decrees = undefined; // a failed read is retried on the next lookup, not cached
      throw e;
    });
    const extended = (await this.db.execute(sql`
      SELECT r.conditions->>'extended_by' AS extended_by FROM tariff_rate r
      WHERE r.hs_code = ${hs} AND r.superseded_at IS NULL AND r.effective_to < ${date}
        AND r.conditions->>'extended_by' IS NOT NULL
    `)) as unknown as Array<{ extended_by: string }>;
    return stalenessView(await this.decrees, date, extended.map((x) => x.extended_by));
  }
```

- [ ] **Bước 5: Chạy lại**

Run: `node_modules/.bin/jest apps/api/src/modules/tariff`
Expected: `Tests: 32 passed, 32 total`, và **không** có dòng `WARN [TariffService] db/seed/data/fta-members.json is not in effect …`
nào: file thật đã có `verifiedHash` khớp. Mỗi `new TariffService(…)` trong spec đọc file thật một lần, nhưng không test nào
phụ thuộc kết quả đó (test cần bảng thì gán `svc.membership`). Thấy dòng `WARN` lặp ở mọi test nghĩa là file bị sửa sau
khi duyệt — dừng, báo controller, không tự sửa file.

- [ ] **Bước 6: Web UI dùng hợp đồng mới**

Trong `public/index.html` thay:

```js
        if (d.staleness?.stale) h += `<div class="warn">⚠️ ${esc(d.staleness.warning)}</div>`;
```

bằng:

```js
        if (d.staleness?.warning) {
          const extra = [
            d.staleness.unloadedInstruments?.length ? `Chưa nạp: ${d.staleness.unloadedInstruments.join(', ')}.` : '',
            d.staleness.pendingExtension || '',
          ].filter(Boolean).join(' ');
          h += `<div class="warn">⚠️ ${esc(d.staleness.warning)}${extra ? ' ' + esc(extra) : ''}</div>`;
        }
```

và thay dòng `(d.import?.preferential || []).forEach((p) => (h += rateRow(p, p.originExcluded ? '' : 'pref'))); …` bằng:

```js
        // Same condition as the bot's only green line: verified member, not excluded, one rate for the 8-digit line.
        (d.import?.preferential || []).forEach((p) => (h += rateRow(p, p.originEligible === true && ['ad_valorem', 'specific', 'compound'].includes(p.type) ? 'pref' : '')));
```

- [ ] **Bước 7: Bỏ `DATA_SNAPSHOT_DATE`**

Trong `docker-compose.yml` (service `api`) xoá hai dòng:

```yaml
      # How stale is the loaded data? Defaults to max(recorded_at); override when known.
      DATA_SNAPSHOT_DATE: "${DATA_SNAPSHOT_DATE:-}"
```

Trong `.agent/docs/mona-dev-server-operations.md` xoá hàng bảng biến môi trường có `DATA_SNAPSHOT_DATE`. Kiểm: `grep -rn "DATA_SNAPSHOT_DATE\|GAZETTE_LAG_DAYS" apps docker-compose.yml .agent/docs/mona-dev-server-operations.md` → không in gì.

- [ ] **Bước 8: Typecheck và bot**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | grep -v TS1343; corepack yarn test:bot 2>&1 | grep -E "ℹ (pass|fail)"`
Expected: tsc không in gì; bot `ℹ pass 35`, `ℹ fail 0` (bot cũ đọc `staleness.stale` → `undefined` → không in dòng cảnh báo cũ; Task 3 thay).

- [ ] **Bước 9: Commit**

```bash
git add apps/api/src/modules/tariff/tariff.types.ts apps/api/src/modules/tariff/tariff.service.ts apps/api/src/modules/tariff/tariff.service.spec.ts public/index.html docker-compose.yml .agent/docs/mona-dev-server-operations.md
git commit -m "Tariff: gate FTA membership on a signed hash, add originEligible, derive the data scope from the decree table" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Trả lời thuế kiểu notebook (`formatAnswer`)

**Files:**
- Modify: `apps/zalo-bot/parse.mjs` (thêm `ORIGIN_LABEL` sau `ORIGIN_CODE`, dòng 25)
- Modify: `apps/zalo-bot/format.mjs` (import dòng 11; `withLead` dòng 42–46; khối `// --- Tariff ---` dòng 48–93)
- Modify: `apps/zalo-bot/answer.mjs` (import; `answerByHs` dòng 35–61; một dòng trong `tariffByClues` dòng 141; `handleCorrection` dòng 294–349)
- Modify: `apps/zalo-bot/index.mjs` (import; dòng 209; dòng 268 và 280)
- Test: `apps/zalo-bot/dispatch.test.mjs`

**Interfaces:**
- Consumes: `L`, `render`, `toText` (Task 1); `rate`, `originEligible`, `ftaMembership`, `staleness.{warning, unloadedInstruments, pendingExtension}` (Task 2).
- Produces:
  - `ORIGIN_LABEL: Record<string, string>` trong `parse.mjs` — chỉ để in.
  - `dmy(iso: string) → 'dd/mm/yyyy'` trong `format.mjs`.
  - `formatAnswer(q: {dotted, origin, date}, r: TariffResponse, confirm, { showFooter = true, candidate = false }) → Line[]` — `candidate: true` cho câu dẫn "Nếu hàng thuộc mã…", không xanh, không ẩn biểu (Task 4 dùng).
  - `confirmFooter(c) → Line | null` — `null` khi chưa có lịch sử xác nhận (lời mời do `formatAnswer` viết).
  - `withLead(lead, lines: string | Line[])` — nhánh chuỗi là cầu tạm, Task 5 gỡ.

Bảng trạng thái mỗi dòng FTA (hàng đầu tiên khớp thắng, spec §5b.3) nằm trong `prefState`; cách in theo dạng A/B/C/C′/ứng
viên nằm ngay dưới. `[n]` cấp theo thứ tự in, cùng số hiệu văn bản cùng số. Nguồn chống bán phá giá in
`{decisionNumber} — thuế chống bán phá giá` (quyết định không phải NĐ).

- [ ] **Bước 1: Viết test thất bại**

Trong `dispatch.test.mjs`, ngay sau dòng `import { formatAnswer, sanitizeLead, withLead } from './format.mjs';` thêm:

```js
import { L, render, toText } from './render.mjs';
```

Thay test `withLead falls back to the deterministic block alone` bằng (giữ ba assert chuỗi tới Task 5):

```js
test('withLead falls back to the deterministic block alone', () => {
  assert.equal(withLead('Thuế là 15%.', 'BLOCK'), 'BLOCK');
  assert.equal(withLead('Đây bạn nhé.', 'BLOCK'), 'Đây bạn nhé.\n\nBLOCK');
  assert.equal(withLead(null, 'BLOCK'), 'BLOCK');
  const block = [L(['BLOCK'])];
  assert.equal(withLead('Thuế là 15%.', block), block);
  assert.equal(toText(withLead('Đây bạn nhé.', block)), 'Đây bạn nhé.\n\nBLOCK');
});
```

Xoá test `an FTA line whose 10-digit sub-lines differ prints the API statement, with no single rate and no crash on percent null` (bố cục `• ACFTA: statement` không còn; test 15 dưới đây thay nó). Thêm vào cuối file:

```js
// --- Tariff reply, notebook layout (spec §5b.3) ------------------------------

const GREEN = 'c_15a85f';
const ORANGE = 'c_f27806';
const RED = 'c_db342e';
const HEADING =
  'Vòi, van và các thiết bị tương tự dùng cho đường ống, thân nồi hơi, bể chứa hoặc các loại tương tự, kể cả van giảm áp và van điều chỉnh bằng nhiệt';
const WARNING =
  'Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP (hiệu lực 15/07/2023); chưa nạp dòng thuế của 4 nghị định biểu thuế còn hiệu lực — đối chiếu trước khi khai.';
const fta = (schedule, scheduleName, form, decree, over = {}) => ({
  schedule, scheduleName, type: 'ad_valorem', percent: '0', decree, form, requiresCo: true, rate: '0%',
  statement: `0% nếu có C/O form ${form} hợp lệ, ngược lại 10% (MFN)`,
  excludedOrigins: [], originExcluded: null, sublines: [], originEligible: null, ...over,
});
/** /tariff for 8481.80.99 on 13/09/2026 as seeded (spec §5b.3 example). `eligible`: originEligible per schedule. */
function tariff8481({ origin = null, verified = false, eligible = {}, acfta = {} } = {}) {
  const el = (s) => (s in eligible ? eligible[s] : null);
  return {
    hs: '84818099', origin, date: '2026-09-13',
    goods: { heading: HEADING, path: 'Vòi, van …' },
    import: {
      mfn: { schedule: 'NK_uu_dai', scheduleName: 'Biểu thuế nhập khẩu ưu đãi (MFN, Mục I)', type: 'ad_valorem', percent: '10', decree: '26/2023/NĐ-CP', statement: '10%' },
      preferential: [
        fta('ACFTA', 'ASEAN–Trung Quốc (ACFTA)', 'E', '118/2022/NĐ-CP', { excludedOrigins: ['KH', 'PH'], originExcluded: origin ? false : null, originEligible: el('ACFTA'), ...acfta }),
        fta('AANZFTA', 'ASEAN–Úc–New Zealand (AANZFTA)', 'AANZ', '121/2022/NĐ-CP', { originEligible: el('AANZFTA') }),
        fta('ATIGA', 'ASEAN (ATIGA)', 'D', '126/2022/NĐ-CP', { originEligible: el('ATIGA') }),
        fta('EVFTA', 'Việt Nam–EU (EVFTA)', 'EUR.1/REX', '116/2022/NĐ-CP', { originEligible: el('EVFTA') }),
      ],
      outOfQuota: null,
      chapter98: [],
    },
    export: null,
    antiDumping: [],
    staleness: {
      latestInstrument: { number: '26/2023/NĐ-CP', effectiveFrom: '2023-07-15', effectiveTo: null },
      unloadedInstruments: ['144/2024/NĐ-CP', '108/2025/NĐ-CP', '199/2025/NĐ-CP', '201/2026/NĐ-CP'],
      pendingExtension: null,
      warning: WARNING,
    },
    notes: [],
    ftaMembership: verified ? { verifiedBy: 'Người Xác Minh', verifiedAt: '2026-09-20' } : null,
  };
}
const CN = { dotted: '8481.80.99', origin: 'CN', date: '2026-09-13' };
const NO_ORIGIN = { ...CN, origin: null };
const NOT_MEMBER = { AANZFTA: false, ATIGA: false, EVFTA: false };
/** A tariff reply must fit one Zalo message; returns it. */
const one = (lines) => {
  const parts = render(lines);
  assert.equal(parts.length, 1, 'câu trả lời thuế phải vừa một tin');
  return parts[0];
};
const styled = (p, st) => p.styles.filter((s) => s.st === st).map((s) => p.msg.slice(s.start, s.start + s.len));
const lineWith = (p, needle) => p.msg.split('\n').find((l) => l.includes(needle));

test('thuế CN, bảng thành viên đã xác nhận: đúng một chỗ xanh, ẩn ba biểu Trung Quốc không phải thành viên', () => {
  const p = one(formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: { ACFTA: true, ...NOT_MEMBER } }), null));
  const lead = p.msg.split('\n')[0];
  assert.ok(lead.includes('có xuất xứ') && !lead.includes('nhập khẩu từ'), 'bộ lọc dùng nước xuất xứ, không phải nước gửi hàng');
  assert.deepEqual(styled(p, GREEN), ['0%'], 'chỉ mức ACFTA được tô xanh');
  assert.ok(lineWith(p, 'Có C/O form E hợp lệ (ACFTA)').endsWith('0% [1]'));
  assert.ok(lineWith(p, 'Không có C/O ưu đãi hợp lệ').endsWith('(MFN) 10% [2]'));
  const sources = lineWith(p, 'Tra theo ngày 13/09/2026');
  assert.ok(sources.includes('[1] NĐ 118/2022/NĐ-CP') && sources.includes('[2] NĐ 26/2023/NĐ-CP'));
  assert.ok(lineWith(p, 'Đã ẩn AANZFTA, ATIGA, EVFTA'), 'phải nói rõ đã ẩn biểu nào');
  for (const s of ['AANZFTA', 'ATIGA', 'EVFTA']) {
    assert.equal(p.msg.split('\n').filter((l) => l.includes(s)).length, 1, `${s} chỉ được nêu ở dòng "Đã ẩn"`);
  }
});

test('thuế CN, bảng chưa xác nhận: đủ bốn biểu, không xanh, không gợi ý đổi xuất xứ', () => {
  const p = one(formatAnswer(CN, tariff8481({ origin: 'CN' }), null));
  assert.equal(styled(p, GREEN).length, 0, 'chưa có người ký bảng thành viên thì không được tô xanh (R18)');
  assert.ok(p.msg.split('\n')[0].includes('Mình chưa lọc được các biểu FTA theo xuất xứ'));
  for (const s of ['ACFTA (form E)', 'AANZFTA (form AANZ)', 'ATIGA (form D)', 'EVFTA (form EUR.1/REX)']) assert.ok(lineWith(p, s), `thiếu dòng ${s}`);
  assert.ok(!p.msg.split('\n').at(-1).includes('nhắn tên nước'), 'chưa ký bảng thì đổi xuất xứ không đổi gì, không gợi ý');
});

test('thuế không có xuất xứ: dòng gọn, không xanh, ACFTA nêu các nước bị loại trừ ở dòng', () => {
  const p = one(formatAnswer(NO_ORIGIN, tariff8481(), null));
  assert.equal(styled(p, GREEN).length, 0);
  assert.ok(lineWith(p, 'ACFTA (form E)').includes('trừ hàng xuất xứ KH, PH'));
});

test('xuất xứ bị NĐ 118 loại trừ ở dòng: "không được hưởng" màu đỏ, không con số ưu đãi, vẫn có MFN', () => {
  const r = tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { excludedOrigins: ['CN'], originExcluded: true, originEligible: false } });
  const p = one(formatAnswer(CN, r, null));
  assert.deepEqual(styled(p, RED), ['không được hưởng']);
  assert.ok(!lineWith(p, 'ACFTA (form E)').includes('%'), 'không bao giờ in mức ưu đãi cho xuất xứ bị loại trừ');
  assert.ok(p.msg.split('\n')[0].includes('(MFN) 10% [1]'));
  assert.equal(styled(p, GREEN).length, 0);
});

test('dòng loại khỏi biểu và dòng hạn ngạch không bao giờ xanh; câu dẫn dạng B', () => {
  const excluded = one(
    formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { type: 'excluded', rate: 'Loại trừ khỏi biểu (không phải 0%)', originEligible: true } }), null),
  );
  assert.deepEqual(styled(excluded, RED), ['không được hưởng']);
  assert.ok(!lineWith(excluded, 'ACFTA (form E)').includes('%'));
  assert.ok(!excluded.msg.includes('phụ thuộc vào việc có C/O'));
  const trq = one(
    formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { type: 'trq', rate: 'Trong hạn ngạch 0%; ngoài hạn ngạch xem biểu ngoài hạn ngạch', originEligible: true } }), null),
  );
  assert.equal(styled(trq, GREEN).length, 0);
  assert.ok(!trq.msg.includes('phụ thuộc vào việc có C/O'));
});

test('dòng 10 số: loại trừ ở một dòng con thì mức tô cam; by_subline in từng dòng; không xanh', () => {
  const sub = (codeDotted, desc, percent, originExcluded = null) => ({
    code: codeDotted.replace(/\./g, ''), codeDotted, desc, type: 'ad_valorem', percent, excludedOrigins: originExcluded ? ['CN'] : [], originExcluded,
  });
  const partial = one(
    formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { originEligible: null, sublines: [sub('8481.80.99.10', '- - Loại một', 0, true), sub('8481.80.99.90', '- - Loại khác', 0, false)] } }), null),
  );
  assert.equal(styled(partial, GREEN).length, 0);
  assert.deepEqual(styled(partial, ORANGE).filter((t) => t !== WARNING), ['0%']);
  assert.ok(lineWith(partial, 'ACFTA (form E)').includes('riêng dòng 10 số 8481.80.99.10'));
  const bySub = one(
    formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: NOT_MEMBER, acfta: { type: 'by_subline', percent: null, rate: 'Theo dòng 10 số (không có một mức chung cho mã 8 số)', originEligible: true, sublines: [sub('8481.80.99.10', '- - Loại một', 0, false), sub('8481.80.99.90', '- - Loại khác', 5), sub('8481.80.99.91', '- - Loại lỗi dữ liệu', null)] } }), null),
  );
  assert.ok(lineWith(bySub, '8481.80.99.91').includes('không rõ mức') && !bySub.msg.includes('null%'), 'dòng 10 số thiếu mức không bao giờ in thành null% hay 0%');
  assert.equal(styled(bySub, GREEN).length, 0, 'chưa ai chốt hàng thuộc dòng 10 số nào');
  assert.ok(bySub.msg.includes('8481.80.99.10') && bySub.msg.includes('8481.80.99.90'));
  assert.ok(!lineWith(bySub, 'ACFTA (form E)').includes('%'), 'không có một con số chung cho mã 8 số');
  assert.ok(!bySub.msg.includes('phụ thuộc vào việc có C/O'));
});

test('chống bán phá giá và gia hạn chưa nạp: dòng đỏ, chữ nguyên văn từ API', () => {
  const statement = 'Chống bán phá giá 4.28% (cộng thêm thuế NK), xuất xứ CN';
  const ext = 'Mức thuế nhập khẩu ưu đãi của mã này có thể đã được NQ 25/2026 gia hạn tới 30/06/2026 nhưng văn bản đó chưa nạp — đối chiếu trước khi khai.';
  const base = tariff8481({ origin: 'CN' });
  const r = { ...base, antiDumping: [{ statement, decisionNumber: 'QĐ-TEST-01' }], staleness: { ...base.staleness, pendingExtension: ext } };
  const red = styled(one(formatAnswer(CN, r, null)), RED);
  assert.ok(red.some((t) => t.includes(statement) && t.includes('QĐ-TEST-01')));
  assert.ok(red.includes(ext));
});

test('dòng phạm vi kho là dòng cam nguyên văn; gộp với cảnh báo nhiều nhóm thành đúng một dòng', () => {
  const lines = formatAnswer(CN, tariff8481({ origin: 'CN' }), null);
  assert.deepEqual(styled(one(lines), ORANGE), [WARNING]);
  const merged = styled(one([L(['Mặt hàng có thể thuộc nhiều nhóm — cần bạn hoặc chuyên viên chốt mã'], 'warn'), ...lines]), ORANGE);
  assert.equal(merged.length, 1, 'tối đa một dòng cảnh báo mỗi câu trả lời');
  assert.ok(merged[0].includes('nhiều nhóm') && merged[0].includes('Biểu thuế trong kho'));
});

test('dòng kết: lịch sử xác nhận thay lời mời; không lịch sử thì theo showFooter', () => {
  const r = tariff8481({ origin: 'CN' });
  const afterSources = (p) => {
    const ls = p.msg.split('\n');
    return ls.slice(ls.findIndex((l) => l.startsWith('Tra theo ngày')) + 1);
  };
  const wrong = { correct: 0, wrong: 1, unsure: 0, recent: [{ verdict: 'wrong', staffName: 'Lan', note: 'là 8481.80.91' }] };
  const hist = one(formatAnswer(CN, r, wrong));
  assert.equal(afterSources(hist).length, 1);
  assert.ok(afterSources(hist)[0].startsWith('Từng bị báo sai 1 lần'), 'lịch sử xác nhận phải còn hiện (R18)');
  assert.ok(styled(hist, ORANGE).some((t) => t.startsWith('Từng bị báo sai')));
  assert.ok(!afterSources(hist)[0].includes('nhắn tên nước'), 'có lịch sử thì không gợi ý');
  assert.equal(afterSources(one(formatAnswer(CN, r, null))).length, 1);
  assert.equal(afterSources(one(formatAnswer(CN, r, null, { showFooter: false }))).length, 0);
});

test('chế độ ứng viên: câu dẫn có điều kiện, không xanh, không ẩn biểu (R2)', () => {
  const p = one(formatAnswer(CN, tariff8481({ origin: 'CN', verified: true, eligible: { ACFTA: true, ...NOT_MEMBER } }), null, { candidate: true, showFooter: false }));
  assert.ok(p.msg.startsWith('Nếu hàng thuộc mã 8481.80.99'));
  assert.equal(styled(p, 'b')[0], '8481.80.99');
  assert.equal(styled(p, GREEN).length, 0, 'mức ưu đãi phụ thuộc một phân loại chưa ai chốt');
  assert.ok(!p.msg.includes('Đã ẩn'));
});
```

- [ ] **Bước 2: Chạy để thấy thất bại**

Run: `corepack yarn test:bot 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: FAIL — các test "thuế …", "dòng …", "chế độ ứng viên …" và `withLead` báo `AssertionError` hoặc `TypeError` (`formatAnswer` còn trả chuỗi).

- [ ] **Bước 3: `ORIGIN_LABEL` trong `parse.mjs`**

Ngay sau hằng `ORIGIN_CODE` thêm:

```js
/** Display names for origin codes. For printing only — never used to READ an origin. */
export const ORIGIN_LABEL = {
  CN: 'Trung Quốc', JP: 'Nhật Bản', KR: 'Hàn Quốc', AU: 'Úc', NZ: 'New Zealand', TH: 'Thái Lan', MY: 'Malaysia',
  SG: 'Singapore', ID: 'Indonesia', PH: 'Philippines', DE: 'Đức', EU: 'EU', GB: 'Anh', US: 'Hoa Kỳ', VN: 'Việt Nam', IN: 'Ấn Độ',
};
```

- [ ] **Bước 4: Khối thuế trong `format.mjs`**

Đổi import đầu file thành:

```js
import { cleanGazetteTitle, ORIGIN_LABEL } from './parse.mjs';
import { L, toText } from './render.mjs';
```

Thay `withLead` bằng:

```js
/** A gated lead as its own line above the reply; it never replaces a line of the reply. */
export function withLead(lead, lines) {
  // The legal builders still return strings; this branch goes when they return Line[].
  if (typeof lines === 'string') {
    const clean = sanitizeLead(lead, lines);
    return clean ? `${clean}\n\n${lines}` : lines;
  }
  const clean = sanitizeLead(lead, toText(lines));
  return clean ? [L([clean]), L([]), ...lines] : lines;
}
```

Thay toàn bộ khối từ `// --- Tariff ---` tới **trước** `export function formatCandidates` (tức `confirmFooter` và `formatAnswer` cũ) bằng:

```js
/** 2026-09-13 → 13/09/2026 */
export const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

// --- Tariff -----------------------------------------------------------------

const RATE_TYPES = new Set(['ad_valorem', 'specific', 'compound']);

/** Which row of the §5b.3 table a preferential line falls in. The first match wins. */
function prefState(p) {
  if (p.type === 'excluded') return 'excludedLine';
  if (p.originExcluded === true) return 'excludedOrigin';
  if (p.type === 'by_subline') return 'bySubline';
  if (p.originEligible === null && (p.sublines ?? []).some((s) => s.originExcluded === true)) return 'subExcluded';
  if (p.originEligible === true && RATE_TYPES.has(p.type)) return 'true';
  if (p.originEligible === true && p.type === 'trq') return 'trq';
  if (p.originEligible === false) return 'false';
  return 'null';
}

/** Verdict history as one small line, or null when nobody has confirmed anything yet (R18). */
export function confirmFooter(c) {
  if (!c || !(c.correct || c.wrong || c.unsure)) return null;
  const recent = Array.isArray(c.recent) ? c.recent : [];
  const lastOf = (v) => recent.find((r) => r.verdict === v);
  const parts = [];
  if (c.correct) {
    const l = lastOf('correct');
    parts.push([`đã xác nhận đúng ${c.correct} lần${l ? ` (gần nhất: ${l.staffName})` : ''}`]);
  }
  if (c.wrong) {
    const l = lastOf('wrong');
    const who = l ? ` (${l.staffName}${l.note ? `: ${String(l.note).replace(/\s+/g, ' ').slice(0, 60)}` : ''})` : '';
    parts.push([`từng bị báo sai ${c.wrong} lần${who} — kiểm tra kỹ`, 'orange']);
  }
  if (c.unsure) parts.push([`chưa chắc ${c.unsure} lần`]);
  parts[0][0] = parts[0][0][0].toUpperCase() + parts[0][0].slice(1);
  return L([...parts.flatMap((p, k) => (k ? [' · ', p] : [p])), ' — trả lời "đúng"/"sai" để cập nhật.'], 'note');
}

/**
 * The tariff reply (spec §5b.3). Prints API fields verbatim: `rate` / `statement` are never
 * recomposed here. Colours: green only on an eligible single rate outside candidate mode;
 * red for "không được hưởng", anti-dumping and a pending extension; orange for rates that
 * depend on which 10-digit line the goods fall in; one `warn` line for the data scope.
 *
 * @param {{dotted: string, origin: string|null, date: string}} q
 * @param {object} r         TariffResponse
 * @param {object|null} confirm  verdict history from /tariff/confirmations
 * @param {{showFooter?: boolean, candidate?: boolean}} opts  candidate: the code is not settled (R2)
 */
export function formatAnswer(q, r, confirm, { showFooter = true, candidate = false } = {}) {
  const origin = r.origin ?? q.origin ?? null;
  const name = origin ? (ORIGIN_LABEL[origin] ?? origin) : null;
  const verified = Boolean(r.ftaMembership);
  const date = dmy(r.date ?? q.date);

  // [n] in print order; the same source keeps its number.
  const refs = [];
  const cite = (key, label) => {
    let i = refs.findIndex((x) => x.key === key);
    if (i < 0) i = refs.push({ key, label }) - 1;
    return ` [${i + 1}]`;
  };
  const dec = (v) => cite(v.decree, `NĐ ${v.decree} — ${v.scheduleName}`);

  const mfn = r.import?.mfn ?? null;
  const heading = r.goods?.heading ? cleanGazetteTitle('', r.goods.heading, 45) : '';
  const hs = [[q.dotted, 'b'], ...(heading ? [' (', [heading, 'i'], ')'] : [])];
  const mfnRate = (verb = '') =>
    mfn
      ? ['thuế nhập khẩu ưu đãi thông thường (', ['MFN', 'b'], `) ${verb}`, [mfn.statement, 'b'], dec(mfn)]
      : [`chưa có dòng MFN tại ngày ${date}`];
  const has = (verb) => (mfn ? [` ${verb} `, ...mfnRate()] : [' ', ...mfnRate()]);

  const sched = (p) => `${p.schedule}${p.form ? ` (form ${p.form})` : ''}`;
  const refused = (p, why) => L([[sched(p), 'b'], ': ', ['không được hưởng', 'red'], ` — ${why}`, dec(p)]);
  const compact = (p) =>
    L(
      [
        `${sched(p)}: `,
        [p.rate, 'b'],
        dec(p),
        p.originExcluded === null && p.excludedOrigins?.length
          ? ` — trừ hàng xuất xứ ${p.excludedOrigins.join(', ')} (NĐ ${p.decree} loại trừ ở dòng này)`
          : '',
      ],
      'ul',
    );
  const row = (p, state) => {
    switch (state) {
      case 'excludedLine':
        return [refused(p, 'dòng này bị loại khỏi biểu')];
      case 'excludedOrigin':
        return [refused(p, `NĐ ${p.decree} loại trừ hàng xuất xứ ${name} ở dòng này`)];
      case 'bySubline':
        return [
          L([`${sched(p)}: `, ['mức theo dòng 10 số — đối chiếu dòng của hàng', 'orange'], dec(p)], 'ul'),
          ...(p.sublines ?? []).map((s) =>
            L([
              `${s.codeDotted} ${s.desc}: `,
              s.type === 'excluded' || s.originExcluded === true
                ? ['không được hưởng', 'red']
                : s.percent == null
                  ? ['không rõ mức — đối chiếu nghị định', 'orange'] // malformed jsonb: never "null%" or 0%
                  : [`${s.percent}%`, 'b'],
            ]),
          ),
        ];
      case 'subExcluded': {
        const codes = p.sublines.filter((s) => s.originExcluded === true).map((s) => s.codeDotted).join(', ');
        return [
          L(
            [`${sched(p)}: `, [p.rate, 'b', 'orange'], dec(p), ` — riêng dòng 10 số ${codes} không áp dụng cho xuất xứ ${name}; đối chiếu dòng của hàng`],
            'ul',
          ),
        ];
      }
      case 'true':
        // The only green in the bot: a verified member origin, not excluded, one rate for the whole 8-digit line.
        return candidate
          ? [compact(p)]
          : [L([[`Có C/O${p.form ? ` form ${p.form}` : ''} hợp lệ (${p.schedule})`, 'b'], ': thuế nhập khẩu ưu đãi đặc biệt ', [p.rate, 'b', 'green'], dec(p)], 'ul')];
      default:
        return [compact(p)]; // trq, null, and false in candidate / unfiltered modes
    }
  };

  const rows = (r.import?.preferential ?? []).map((p) => ({ p, s: prefState(p) }));
  const pick = (...states) => rows.filter((x) => states.includes(x.s)).flatMap((x) => row(x.p, x.s));
  const all = () => rows.flatMap((x) => row(x.p, x.s));
  const unknown = () => (rows.some((x) => x.s === 'null') ? [L(['Biểu chưa xác định được theo xuất xứ:']), ...pick('null')] : []);
  const hidden = rows.filter((x) => x.s === 'false').map((x) => x.p.schedule);
  const COND = 'chỉ áp dụng khi hàng có xuất xứ từ nước thành viên và có C/O hợp lệ đúng form:';

  const lines = [];
  if (candidate) {
    lines.push(L(['Nếu hàng thuộc mã ', ...hs, ', ', ...mfnRate('là '), rows.length ? `; mức FTA dưới đây ${COND}` : '.']), ...all());
  } else if (!origin || !verified) {
    const second = !rows.length
      ? []
      : !origin
        ? [` Mức ưu đãi đặc biệt theo FTA ${COND}`]
        : [' Mình chưa lọc được các biểu FTA theo xuất xứ ', [name, 'b'], `; mỗi mức dưới đây ${COND}`];
    lines.push(L(['Hàng hóa có mã HS ', ...hs, ...has('có'), '.', ...second]), ...all());
  } else if (rows.some((x) => x.s === 'true')) {
    lines.push(
      L(['Đối với hàng hóa có mã HS ', ...hs, ' có xuất xứ ', [name, 'b'], ', mức thuế nhập khẩu phụ thuộc vào việc có C/O ưu đãi hợp lệ hay không:']),
      ...pick('true'),
      ...pick('excludedLine', 'excludedOrigin'),
      L([['Không có C/O ưu đãi hợp lệ', 'b'], ': ', ...mfnRate()], 'ul'),
      ...pick('trq', 'bySubline', 'subExcluded'),
      ...unknown(),
    );
    if (hidden.length) {
      lines.push(L([`Đã ẩn ${hidden.join(', ')} vì ${name} không có trong danh sách nước thành viên đã xác nhận; nếu nước xuất xứ khác nước gửi hàng, nhắn tên nước xuất xứ.`], 'note'));
    }
  } else {
    lines.push(
      L(['Hàng hóa có mã HS ', ...hs, ' có xuất xứ ', [name, 'b'], ...has('áp'), '.']),
      ...pick('excludedLine', 'excludedOrigin'),
      ...pick('trq', 'bySubline', 'subExcluded'),
      ...unknown(),
    );
    if (hidden.length) {
      lines.push(L([`Các biểu FTA đã nạp khác (${hidden.join(', ')}) không áp dụng cho xuất xứ này; các hiệp định khác chưa được nạp. Nếu nước xuất xứ khác nước gửi hàng, nhắn tên nước xuất xứ.`]));
    }
  }

  const oq = r.import?.outOfQuota;
  if (oq) lines.push(L(['Ngoài hạn ngạch: ', [oq.statement, 'b'], dec(oq)]));
  if (r.export) lines.push(L(['Thuế xuất khẩu: ', [r.export.statement, 'b'], dec(r.export)]));
  for (const c of r.antiDumping ?? []) {
    lines.push(L([[c.statement, 'b'], ` — theo ${c.decisionNumber}`, cite(c.decisionNumber, `${c.decisionNumber} — thuế chống bán phá giá`)], 'red'));
  }
  if (r.staleness?.pendingExtension) lines.push(L([r.staleness.pendingExtension], 'red'));
  for (const n of r.notes ?? []) lines.push(L([`Lưu ý: ${n}`], 'note'));

  lines.push(L([]));
  if (r.staleness?.warning) lines.push(L([r.staleness.warning], 'warn'));
  const unloaded = r.staleness?.unloadedInstruments ?? [];
  const sources = [
    `Tra theo ngày ${date}`,
    ...refs.map((x, i) => `[${i + 1}] ${x.label}`),
    ...(unloaded.length ? [`Chưa nạp: ${unloaded.map((u) => `NĐ ${u}`).join(', ')}`] : []),
  ];
  lines.push(L([sources.join(' · ')], 'note'));

  const history = confirmFooter(confirm);
  if (history) {
    lines.push(history);
  } else if (showFooter) {
    // Suggest only what the bot can do now; an origin changes nothing until the membership table is signed.
    const hint = !verified ? '' : origin ? 'Muốn xem xuất xứ khác, nhắn tên nước; ' : 'Cho mình biết xuất xứ để lọc đúng biểu ưu đãi; ';
    const sentence = `${hint}mã đúng với lô hàng thì trả lời "đúng", chưa đúng thì trả lời "sai" hoặc gửi mã đúng.`;
    lines.push(L([[sentence[0].toUpperCase() + sentence.slice(1), 'i']]));
  }
  return lines;
}
```

(`formatCandidates` và các hàm pháp luật giữ nguyên tới Task 4/5.)

- [ ] **Bước 5: Nơi gọi trong `answer.mjs` và `index.mjs`**

`answer.mjs`: thêm `import { L, toText } from './render.mjs';` trước dòng import `router.mjs`. Thay `answerByHs` từ chữ ký tới `return`:

```js
export async function answerByHs(q, { showFooter = true } = {}) {
```

và

```js
  return {
    // The tariff block writes its own lead from data (spec §5b.2): no LLM lead here.
    text: formatAnswer(q, data, confirm, { showFooter }),
```

(xoá dòng `const block = formatAnswer(…)`). Trong `tariffByClues` đổi dòng `? formatAnswer({ dotted: top.hsDotted, origin, date }, full, confirm, { showFooter })` thành:

```js
      ? toText(formatAnswer({ dotted: top.hsDotted, origin, date }, full, confirm, { showFooter })) // bridge: Task 4 builds Line[]
```

Thay cả hàm `handleCorrection` bằng:

```js
export async function handleCorrection(tariff, text, senderName, quote) {
  // Mã CŨ (bị coi là sai): ưu tiên kết quả đã nhớ; nếu hết hạn thì lấy lại từ tin được quote.
  const old = tariff?.hs
    ? { hs: tariff.hs, dotted: tariff.dotted, origin: tariff.origin, date: tariff.date, snapshot: tariff.snapshot }
    : parseQuery(String(quote?.msg || ''));
  const fix = parseQuery(text); // mã đúng người dùng đưa ra (nếu có)
  const now = today();
  // Mô tả hàng đã lưu từ lần phân loại trước — để đính vào bản ghi 'correct' cho mã đúng,
  // nhờ đó lần sau tra hàng TƯƠNG TỰ mới khớp lại được (matchByProduct).
  const prodDesc = String(tariff?.desc || '').replace(/\s+/g, ' ').trim();
  const prevKw = Array.isArray(tariff?.keywords) ? tariff.keywords : [];
  // note LƯU vào sổ = MÔ TẢ SẢN PHẨM + SỐ CĂN CỨ (công văn). KHÔNG lưu free-text lời sửa
  // (có thể chứa tên/SĐT/số lô của khách) vì note bị khớp mờ + echo chéo ngữ cảnh.
  const rulingNote = [prodDesc, citationFrom(text)].filter(Boolean).join(' | ').slice(0, 300) || null;

  // "đúng là <mã cũ>" = XÁC NHẬN (người GÕ MÃ) → ghi correct KÈM mô tả để tra lại được.
  if (fix && old?.hs && fix.hs === old.hs) {
    await postConfirm({ hs: old.hs, origin: old.origin || null, date: old.date || now, verdict: 'correct', staffName: senderName, note: rulingNote, snapshot: old.snapshot || null });
    return {
      text: [L(['Đã xác nhận mã ', [old.dotted, 'b'], `${old.origin ? ` (xuất xứ ${old.origin})` : ''} là đúng. Cảm ơn ${senderName}.`])],
      topic: 'tariff',
      tariff: tariff?.hs ? stampTariff({ ...old, desc: prodDesc || undefined, keywords: prevKw }) : null,
    };
  }

  if (old?.hs) {
    await postConfirm({ hs: old.hs, origin: old.origin || null, date: old.date || now, verdict: 'wrong', staffName: senderName, note: rulingNote, snapshot: old.snapshot || null });
  }

  if (!fix) {
    return {
      text: [L(['Đã ghi nhận: mã ', old?.dotted ? [old.dotted, 'b'] : 'trước', ` chưa đúng (theo ${senderName}). Bạn gửi mã HS đúng, hoặc mô tả hay ảnh mặt hàng để mình tra lại nhé.`])],
      topic: 'tariff',
      tariff: null,
    };
  }

  // Tra mã đúng. Xuất xứ chỉ lấy khi lời sửa nêu rõ (không kéo theo xuất xứ cũ có thể sai).
  const origin = detectOrigin(text);
  const head = L([`Đã ghi nhận đính chính từ ${senderName}: mã `, ...(old?.dotted ? [[old.dotted, 'b'], ' '] : []), 'chưa đúng, sửa thành ', [fix.dotted, 'b'], '.']);
  const res = await tariffResponse(fix.hs, origin, fix.date);
  if (!res.ok) {
    const why = res.status === 404 ? 'không có trong dữ liệu đã nạp' : `lỗi ${res.status}`;
    return { text: [head, L(['Nhưng mình chưa tra được thuế cho ', [fix.dotted, 'b'], ` (${why}). Bạn kiểm tra lại mã giúp mình nhé.`])], topic: 'tariff', tariff: null };
  }
  const data = await res.json();
  // Ghi mã ĐÚNG = 'correct' KÈM mô tả sản phẩm + số căn cứ (rulingNote, đã lọc PII) → tra lại được sau này.
  await postConfirm({ hs: fix.hs, origin: origin || null, date: fix.date, verdict: 'correct', staffName: senderName, note: rulingNote, snapshot: data });
  const confirm = await confirmations(fix.hs, origin);
  return {
    text: [head, L([]), ...formatAnswer({ dotted: fix.dotted, origin, date: fix.date }, data, confirm)],
    topic: 'tariff',
    tariff: stampTariff({ hs: fix.hs, dotted: fix.dotted, origin, date: fix.date, snapshot: data, desc: prodDesc || undefined, keywords: prevKw }),
  };
}
```

`index.mjs`: thêm `import { toText } from './render.mjs';` trước import `router.mjs`; đổi `answerByHs(q, { lead: routed.lead, showFooter: false })` thành `answerByHs(q, { showFooter: false })`; đổi dòng gửi và dòng ghi nhớ thành:

```js
      const reply = toText(result.text); // bridge: plain text until Task 6 sends styles
      await api.sendMessage({ msg: reply, quote: msg.data }, msg.threadId, msg.type);
```

```js
        botText: reply,
```

(Tên `reply`, không phải `text`: `text` đã là chữ của tin nhắn đến trong cùng hàm.)

- [ ] **Bước 6: Chạy lại**

Run: `node --check apps/zalo-bot/index.mjs && node --check apps/zalo-bot/answer.mjs && corepack yarn test:bot 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ pass 44`, `ℹ fail 0`.

- [ ] **Bước 7: Commit**

```bash
git add apps/zalo-bot/parse.mjs apps/zalo-bot/format.mjs apps/zalo-bot/answer.mjs apps/zalo-bot/index.mjs apps/zalo-bot/dispatch.test.mjs
git commit -m "Bot: notebook-style tariff reply with data-driven colours" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Trả lời ứng viên HS (`tariffByClues`) và cổng văn xuôi LLM

**Files:**
- Modify: `apps/zalo-bot/format.mjs` (hằng regex + `sanitizeLead` dòng 13–40; xoá `formatCandidates` dòng 95–106)
- Modify: `apps/zalo-bot/answer.mjs` (import; `tariffByClues` dòng 86–165)
- Test: `apps/zalo-bot/dispatch.test.mjs`

**Interfaces:**
- Consumes: `formatAnswer(…, { candidate: true })`, `dmy`, `withLead` (Task 3); `L` (Task 1).
- Produces: `sanitizeLead(lead, block = '', max = 400) → string` — bác `%`, "phần trăm"; bác số hiệu văn bản và mã HS mọi
  dạng sau "mã|nhóm|HS" không có trong `block`; `block === ''` bác thêm "thuế suất". Task 5 (lý do từ chối) và Task 6
  (`formatGeneral`) dùng `sanitizeLead(x, '')`.

Bố cục theo spec §5b.5: dòng ứng viên cố định luôn in (lời dẫn LLM chỉ đứng trên nó); `borderline` không có ÁP MÃ →
một dòng `warn` + đúng ba ứng viên (mã đầu + 2 nhóm khác) + nguồn, không khối FTA; còn lại → khối thuế chế độ ứng
viên + menu + ghi chú chốt mã. Khối `borderline` có thêm `staleness.warning` của mã đầu làm dòng `warn` (render gộp
với cảnh báo nhiều nhóm) — spec §5b.5 nhắc việc gộp nhưng bố cục đó không có khối thuế nào mang dòng này.

- [ ] **Bước 1: Viết test thất bại**

Thêm vào cuối `dispatch.test.mjs`:

```js
test('lời dẫn LLM có mã HS vẫn không thay được dòng ứng viên cố định', () => {
  const lines = [
    L(['Với mô tả ', ['van điều áp', 'i'], ', mình tra được các mã ứng viên dưới đây — đây là ứng viên để bạn chốt, chưa phải mã đã xác định.']),
    ...formatAnswer(CN, tariff8481({ origin: 'CN' }), null, { candidate: true, showFooter: false }),
  ];
  const text = toText(withLead('Sản phẩm này thuộc mã 8481.80.99', lines));
  assert.ok(text.startsWith('Sản phẩm này thuộc mã 8481.80.99'), 'lời dẫn khớp khối thì được giữ');
  assert.ok(text.includes('đây là ứng viên để bạn chốt, chưa phải mã đã xác định'));
});

test('cổng văn xuôi LLM: phần trăm, số hiệu, mã HS mọi dạng chỉ qua khi khối tất định có', () => {
  assert.equal(sanitizeLead('khoảng mười phần trăm', 'MFN 10%'), '');
  assert.equal(sanitizeLead('thuộc nhóm 8481 nhé', ''), '');
  assert.equal(sanitizeLead('thuộc nhóm 8481 nhé', 'Mã 8481.80.99'), 'thuộc nhóm 8481 nhé');
  assert.equal(sanitizeLead('theo Nghị định 26/2023/NĐ-CP', ''), '');
  assert.equal(sanitizeLead('theo Nghị định 26/2023/NĐ-CP', '[1] NĐ 26/2023/NĐ-CP — MFN'), 'theo Nghị định 26/2023/NĐ-CP');
  assert.equal(sanitizeLead('thuế suất tuỳ loại hàng', ''), '');
  assert.equal(sanitizeLead('Hộp kim loại chắn sóng vô tuyến', ''), 'Hộp kim loại chắn sóng vô tuyến');
});
```

- [ ] **Bước 2: Chạy để thấy thất bại**

Run: `corepack yarn test:bot 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: FAIL — `cổng văn xuôi LLM …` (`sanitizeLead('khoảng mười phần trăm', …)` còn trả chữ).

- [ ] **Bước 3: Cổng văn xuôi trong `format.mjs`**

Thay các hằng `PERCENT_RE`, `CITATION_RE`, `HS_DOTTED_RE` và hàm `sanitizeLead` (kể cả JSDoc) bằng:

```js
const PERCENT_RE = /\d+([.,]\d+)?\s*%|phần\s*trăm/i;
const CITATION_RE = /(?:điều|khoản|điểm)\s*\d+[a-zà-ỹ]?/gi;
const HS_DOTTED_RE = /\d{4}\.\d{2}\.\d{2}/g;
const DOC_NO_RE = /\d{1,4}\s*\/\s*(?:\d{4}|vbhn)[^\s,;)]*/gi;
const HS_ANY_RE = /(?:mã|nhóm|hs)\s*(?:hs\s*)?(\d{4}(?:\.?\d{2}){0,2})(?!\d)/gi;

/**
 * The gate for LLM prose. Dropped outright: a rate ("%", "phần trăm") — a percentage in
 * conversational prose is a tariff number produced by an LLM. Dropped unless the
 * deterministic block carries the same thing: a provision, an HS code in any spelling,
 * a document number. With `block === ''` every such fact is dropped, and so is "thuế suất".
 *
 * @param {string} lead   the model's text
 * @param {string} block  plain text of the deterministic reply it sits on ('' when none)
 * @param {number} max    length cap
 */
export function sanitizeLead(lead, block = '', max = 400) {
  const text = String(lead ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (PERCENT_RE.test(text)) return '';
  if (!block && /thuế suất/i.test(text)) return '';
  const low = text.toLowerCase();
  const hay = String(block ?? '').toLowerCase().replace(/\s+/g, ' ');
  const bare = hay.replace(/[.\s]/g, '');
  for (const c of [...(low.match(CITATION_RE) ?? []), ...(low.match(HS_DOTTED_RE) ?? [])]) {
    if (!hay.includes(c.replace(/\s+/g, ' '))) return '';
  }
  for (const c of low.match(DOC_NO_RE) ?? []) if (!bare.includes(c.replace(/[.:\s]/g, ''))) return '';
  for (const [, code] of low.matchAll(HS_ANY_RE)) if (!bare.includes(code.replace(/\./g, ''))) return '';
  return text.slice(0, max);
}
```

Xoá hàm `formatCandidates` (không còn nơi gọi: `grep -rn formatCandidates apps` → chỉ định nghĩa).

- [ ] **Bước 4: `tariffByClues` trong `answer.mjs`**

Đổi import thành:

```js
import { dmy, formatAnswer, formatLegal, formatMissingDoc, formatProvisions, sanitizeLead, withLead } from './format.mjs';
```

```js
import { L } from './render.mjs';
```

(`toText` không còn dùng ở file này). Thay đoạn từ `  if (!cands.length) {` tới hết dòng `const desc = …` bằng:

```js
  if (!cands.length) {
    return {
      text: [
        L([
          'Mình chưa tìm được mã HS phù hợp',
          ...(keywords.length ? [' cho ', [keywords.join(', '), 'i']] : []),
          '. Bạn mô tả rõ hơn (chất liệu, công dụng) hoặc gõ thẳng mã HS nhé.',
        ]),
      ],
      topic: 'tariff',
      tariff: null,
    };
  }

  // Chữ ký sản phẩm để (a) tra ruling đã xác nhận, (b) đính kèm khi có đính chính sau này.
  const productKw = (clues?.keywords?.length ? clues.keywords : keywords).filter((k) => k && k.length >= 2).slice(0, 6);
  // `note` is LLM text: it passes the prose gate before it is shown or stored; rejected → keywords.
  const desc = (sanitizeLead(clues?.note, '') || productKw.join(', ') || text).replace(/\s+/g, ' ').trim().slice(0, 300);
```

Thay đoạn từ `  const top = cands[0];` tới hết hàm `tariffByClues` bằng:

```js
  const top = cands[0];
  const full = await lookupFull(top.hsDotted, origin, date);
  const confirm = full ? await confirmations(top.hsDotted, origin) : null;
  const tail = (c) => (c.path || '').split(' › ').slice(-2).join(' › ');
  const mfnOf = (c) => (c.mfn != null ? `${Number(c.mfn)}%` : '—');
  const menu = (c) => L([[c.hsDotted, 'b'], ' · MFN ', [mfnOf(c), 'b'], ' · ', [tail(c), 'i']], 'ul');

  // R2: always said, and the LLM lead can only stand above it — a lead naming the top code passes the gate.
  const lines = [L(['Với mô tả ', [desc, 'i'], ', mình tra được các mã ứng viên dưới đây — đây là ứng viên để bạn chốt, chưa phải mã đã xác định.'])];
  if (citedRuling) {
    const cite = String(citedRuling.note || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    lines.push(L(['Mã ', [citedRuling.dotted, 'b'], ' đã được ', [citedRuling.staffName, 'b'], ` xác nhận cho hàng tương tự${cite ? ` (${cite})` : ''} — mình ưu tiên mã này, bạn vẫn đối chiếu căn cứ.`]));
    if (borderline) lines.push(L(['Mặt hàng có thể thuộc nhiều nhóm; mã trên là mã đã được người xác nhận, không phải bot tự suy.'], 'note'));
  }

  if (borderline && !citedRuling) {
    // Three candidates side by side, none looking settled: no FTA block, no rate lead of its own.
    const top3 = [top, ...reps.filter((c) => c.hs !== top.hs).slice(0, 2)];
    lines.push(
      L(['Mặt hàng có thể thuộc nhiều nhóm — cần bạn hoặc chuyên viên chốt mã (kèm số công văn nếu có) trước khi khai.'], 'warn'),
      ...top3.map((c) => L([[c.hsDotted, 'b'], ' · ', [cleanGazetteTitle('', c.heading || tail(c), 50), 'i'], ' · MFN ', [mfnOf(c), 'b']], 'ul')),
      L([]),
      ...(full?.staleness?.warning ? [L([full.staleness.warning], 'warn')] : []),
      L([`Tra theo ngày ${dmy(date)} · MFN theo Biểu thuế nhập khẩu ưu đãi đã nạp${full?.import?.mfn ? ` (mã đầu: NĐ ${full.import.mfn.decree})` : ''}`], 'note'),
      L(['Nhắn mã bạn chốt (kèm xuất xứ) để mình tra đủ thuế ưu đãi, hoặc nhắn "HS đúng là <mã>" (kèm số công văn nếu có) để mình ghi nhận cho lần sau.'], 'note'),
    );
  } else {
    lines.push(
      ...(full
        ? formatAnswer({ dotted: top.hsDotted, origin, date }, full, confirm, { showFooter: false, candidate: true })
        : [L(['Chưa có dòng thuế hiệu lực cho ', [top.hsDotted, 'b'], ` tại ngày ${dmy(date)} — ${top.path}.`])]),
    );
    if (citedRuling && borderline) {
      lines.push(L(['Các nhóm ứng viên khác:']), ...reps.filter((c) => c.hs !== top.hs).slice(0, 2).map(menu));
    } else if (!borderline && cands.length > 1) {
      lines.push(L(['Nếu chưa đúng loại hàng, bạn chọn mã khác:']), ...cands.slice(1, 6).map(menu));
    }
    lines.push(
      L(
        [citedRuling
          ? 'Nếu mã đã xác nhận trên chưa đúng cho lô này, nhắn "HS đúng là <mã>" (kèm số công văn).'
          : 'Chốt mã đúng: nhắn "HS đúng là <mã>" (kèm số công văn nếu có) để mình ghi nhận cho lần sau.'],
        'note',
      ),
    );
  }

  const tariff =
    full || citedRuling
      ? stampTariff({ hs: top.hsDotted.replace(/\./g, ''), dotted: top.hsDotted, origin, date, snapshot: full || null, desc, keywords: productKw })
      : null;
  return { text: withLead(clues?.lead, lines), topic: 'tariff', tariff };
}
```

- [ ] **Bước 5: Chạy lại**

Run: `node --check apps/zalo-bot/answer.mjs && corepack yarn test:bot 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ pass 46`, `ℹ fail 0`.

- [ ] **Bước 6: Commit**

```bash
git add apps/zalo-bot/format.mjs apps/zalo-bot/answer.mjs apps/zalo-bot/dispatch.test.mjs
git commit -m "Bot: candidate reply as top-3 without colour; gate every LLM note and reason" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Pháp luật — `[n]` được kiểm, bố cục nguồn, sửa lỗi 69/2018

Hai phần, mỗi phần một chu kỳ test. Phần A (API) không phụ thuộc phần B; phần B cần `sanitizeLead` của Task 4.

#### Phần A — API

**Files:**
- Modify: `apps/api/src/modules/legal/legal.grounding.ts` (JSDoc đầu file; thay `validateCitations` dòng 34–38)
- Create: `apps/api/src/modules/legal/legal.grounding.spec.ts`
- Modify: `apps/api/src/modules/legal/legal.generation.ts` (`GenerationResult`, `buildPrompt` dòng 49–80)
- Modify: `apps/api/src/modules/legal/legal.scope.ts` (thêm `foldDocNumber`; `ResolvedDoc`; `resolveDocuments` dòng 125–149; `lookupGazette` dòng 255–258)
- Create: `apps/api/src/modules/legal/legal.scope.spec.ts`
- Modify: `apps/api/src/modules/legal/legal.service.ts` (import dòng 8; `ask` dòng 104–105 và 256–281)
- Create: `apps/api/src/modules/legal/legal.service.spec.ts`
- Modify: `apps/eval/notebook.ts` (dòng 69), `apps/eval/notebook.spec.ts`

**Interfaces:**
- Produces:
  - `numberMarkers(answer: string, cited: number[], sources: string[], userText: string): { answer: string; order: number[] }` — Mảng 3 chuyển nó sang `guards.ts`.
  - `foldDocNumber(s: string | null | undefined): string` (bot `sameDocNumber` gập cùng cách).
  - Hợp đồng `/legal`: `[n]` trong `answer` trỏ `citations[n-1]`; `answer` là Markdown ≤200 từ; `validateCitations` bị xoá.
  - `ResolvedDoc.consolidates: string | null`.

- [ ] **Bước A1: Viết test thất bại**

`apps/api/src/modules/legal/legal.grounding.spec.ts`:

```ts
import { numberMarkers } from './legal.grounding';

/** Five provisions as the model saw them: "{articleCitation}\n{articleBody}". */
const five = [
  'Điều 1 Nghị định 08/2015/NĐ-CP\nNội dung một',
  'Điều 2 Nghị định 08/2015/NĐ-CP\nNộp thuế trong thời hạn 15 ngày',
  'Điều 3\nba',
  'Điều 4\nbốn',
  'Điều 5\nnăm',
];

describe('numberMarkers — [n] points at citations[n-1], and the numbers beside it are in that source (R10)', () => {
  it('renumbers by first appearance and returns the original positions', () => {
    expect(numberMarkers('A [3]. B [1].', [1, 3], five, '')).toEqual({ answer: 'A [1]. B [2].', order: [3, 1] });
  });

  it('removes a marker outside the provision list', () => {
    expect(numberMarkers('A [9]. B [2].', [2], five, '')).toEqual({ answer: 'A. B [1].', order: [2] });
  });

  it('splits a grouped marker and merges an adjacent duplicate', () => {
    expect(numberMarkers('A [1, 2].', [1, 2], five, '').answer).toBe('A [1] [2].');
    expect(numberMarkers('A [1] [1].', [1], five, '').answer).toBe('A [1].');
  });

  it('keeps an answer without markers; citations follow the model list', () => {
    expect(numberMarkers('Không có dấu.', [2], five, '')).toEqual({ answer: 'Không có dấu.', order: [2] });
  });

  it('empties the answer when a rate is not in the source its sentence cites', () => {
    expect(numberMarkers('Thuế suất **0%** [1].', [1], five, '').answer).toBe('');
  });

  it('strips marker and bold from a sentence whose duration its source lacks; the next sentence keeps its marker', () => {
    expect(numberMarkers('Nộp trong **30 ngày** [2]. Câu khác [1].', [1, 2], five, '')).toEqual({
      answer: 'Nộp trong 30 ngày. Câu khác [1].',
      order: [1],
    });
  });

  it('keeps a duration its source states', () => {
    expect(numberMarkers('Nộp trong **15 ngày** [2].', [2], five, '').answer).toBe('Nộp trong **15 ngày** [1].');
  });

  it('exempts a document number the user wrote, never a percentage', () => {
    const s = 'Kho chưa có Nghị định 43/2017/NĐ-CP [3].';
    expect(numberMarkers(s, [3], five, 'nghị định 43/2017 còn hiệu lực không').answer).toBe('Kho chưa có Nghị định 43/2017/NĐ-CP [1].');
    expect(numberMarkers(s, [3], five, '').answer).toBe('Kho chưa có Nghị định 43/2017/NĐ-CP.');
    expect(numberMarkers('Mức 5% [3].', [3], five, 'mức 5% đúng không').answer).toBe('');
  });
});
```

`apps/api/src/modules/legal/legal.scope.spec.ts`:

```ts
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { foldDocNumber, lookupGazette, parseDocRef, resolveDocuments } from './legal.scope';

/**
 * The 69/2018 bug (spec §5b.8): a number the user wrote in full must match that one document —
 * however Đ and a leading zero are typed — and never another agency's document with the same serial.
 */
const dialect = new PgDialect();

describe('foldDocNumber', () => {
  it('reads Đ/D and a leading zero as the same number, a different issuer as a different one', () => {
    expect(foldDocNumber('08/2015/NĐ-CP')).toBe(foldDocNumber('8/2015/ND-CP'));
    expect(foldDocNumber('08/2015/NĐ-CP')).not.toBe(foldDocNumber('08/2015/TT-BTC'));
  });
});

describe('lookupGazette — a full number is matched exactly, folded in SQL', () => {
  it('sends the folded number to the exact query and reports an exact hit', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      execute: async (q: SQL) => {
        queries.push(dialect.sqlToQuery(q));
        return [{ number: '69/2018/NĐ-CP', docType: 'nghi_dinh', title: 't', sourceUrl: 'u', congbaoId: 1 }];
      },
    };
    const res = await lookupGazette(db as never, parseDocRef('69/2018/ND-CP')!);
    expect(res.exact).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toContain("translate(upper(number), 'Đđ', 'DD')");
    expect(queries[0]!.params).toContain('69/2018/ND-CP');
  });
});

describe('resolveDocuments — a full number names one document', () => {
  it('returns [] for 69/2018/TT-BTC when the corpus holds only 69/2018/NĐ-CP', async () => {
    const db = { execute: async () => [{ id: 1, number: '69/2018/NĐ-CP', title: 't', docType: 'nghi_dinh', consolidates: null }] };
    expect(await resolveDocuments(db as never, parseDocRef('Thông tư 69/2018/TT-BTC')!)).toEqual([]);
  });

  it('still reaches the VBHN that consolidates the decree asked for', async () => {
    const row = { id: 7, number: '46/VBHN-BTC', title: 't', docType: 'vbhn', consolidates: '08/2015/NĐ-CP' };
    const db = { execute: async () => [row] };
    expect(await resolveDocuments(db as never, parseDocRef('Nghị định 8/2015/ND-CP')!)).toEqual([row]);
  });
});
```

`apps/api/src/modules/legal/legal.service.spec.ts`:

```ts
import { generate } from './legal.generation';
import { hybridRetrieve, type RetrievedArticle } from './legal.retrieval';
import { LegalService } from './legal.service';

jest.mock('./legal.generation', () => ({ generate: jest.fn() }));
jest.mock('./legal.retrieval', () => ({ hybridRetrieve: jest.fn() }));

const gazette = (number: string, docType: string) => ({ number, docType, title: `${number} — tiêu đề`, sourceUrl: 'https://congbao.chinhphu.vn/x', congbaoId: 1 });

describe('LegalService.ask — "Nghị định 69/2018 còn áp dụng không" (§5b.8)', () => {
  it('takes the kind from the question when doc= carries only the serial, so other agencies drop out', async () => {
    // 1st query: resolveDocuments (corpus lacks it); 2nd: the Công báo prefix lookup.
    const results: unknown[][] = [[], [gazette('69/2018/NĐ-CP', 'nghi_dinh'), gazette('69/2018/TT-BTC', 'thong_tu')]];
    const svc = new LegalService({ execute: async () => results.shift() ?? [] } as never, {} as never);
    const res = await svc.ask('Nghị định 69/2018 còn áp dụng không', '2026-09-13', '69/2018');
    expect(res.gazetteMatchKind).toBe('exact');
    expect(res.gazetteMatches.map((g) => g.number)).toEqual(['69/2018/NĐ-CP']);
  });
});

describe('LegalService.ask — [n] maps to the n-th provision given to the model', () => {
  it('orders citations by the renumbered markers', async () => {
    const article = (id: number, label: string): RetrievedArticle => ({
      articleProvisionId: id, clauseProvisionId: id, documentId: 1, documentNumber: '08/2015/NĐ-CP', documentTitle: 't',
      articleCitation: label, clauseCitation: `Khoản 1 ${label}`, path: label, articleBody: 'thân', clauseBody: 'thân',
      effectiveness: 'con_hieu_luc', effectiveFrom: null, effectiveTo: null, gazetteUrl: null, verification: 'verified',
      score: 1, bestDist: 0.2, kwHit: true,
    });
    (hybridRetrieve as jest.Mock).mockResolvedValue([article(11, 'Điều 11'), article(22, 'Điều 22')]);
    (generate as jest.Mock).mockResolvedValue({ answer: 'Ý một [2]. Ý hai [1].', citations: [1, 2], abstain: false, reason: null });
    const svc = new LegalService({ execute: async () => [] } as never, { embed: async () => [0] } as never);
    const res = await svc.ask('Hàng nào được miễn thuế nhập khẩu', '2026-09-13');
    expect(res.answer).toBe('Ý một [1]. Ý hai [2].');
    expect(res.citations.map((c) => c.articleLabel)).toEqual(['Điều 22', 'Điều 11']);
  });
});
```

Trong `apps/eval/notebook.spec.ts`, trong `describe('norm', …)` sau test đầu thêm:

```ts
  it('ignores Markdown emphasis, so bold cannot split a mustSay phrase', () => {
    expect(norm('**không** bao gồm')).toBe(norm('không bao gồm'));
  });
```

- [ ] **Bước A2: Chạy để thấy thất bại**

Run: `node_modules/.bin/jest apps/api/src/modules/legal apps/eval/notebook.spec.ts`
Expected: FAIL — `has no exported member 'numberMarkers'`, `has no exported member 'foldDocNumber'`; `legal.service.spec` báo `gazetteMatchKind` `'similar'` ≠ `'exact'`; `norm` giữ `**`.

- [ ] **Bước A3: `numberMarkers` trong `legal.grounding.ts`**

Trong JSDoc đầu file thay mục `2. validateCitations …` bằng:

```ts
 *   2. numberMarkers — a POST-generation check: [n] markers must point into the
 *      evidence set, and the numbers beside them must be in the provision they cite.
 *      "The citation resolves to a real document" is the worthless guarantee
 *      (Wilgarten); this is a floor, not proof of entailment.
```

Thay hàm `validateCitations` bằng:

```ts
const norm = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').replace(/\s*%/g, '%').toLowerCase().trim();

/** Every digit group of `fact` stands as its own token in `text`, leading zeros ignored (as the bot's docNumberStatedIn). */
const statedIn = (text: string, fact: string): boolean => {
  const groups = fact.match(/\d+/g) ?? [];
  return groups.length > 0 && groups.every((g) => new RegExp(`(?<!\\d)0*${g.replace(/^0+/, '') || '0'}(?!\\d)`).test(text));
};

/** Facts a sentence may state only when its own [n] source contains them. `exempt`: the user may have written it. */
const FACTS: Array<{ re: RegExp; exempt: boolean; fatal: boolean }> = [
  { re: /\d+(?:[.,]\d+)?\s*%/g, exempt: false, fatal: true },
  { re: /\d[\d.,]*\s*(?:USD|VND|đồng|đ)(?![\p{L}\d])/giu, exempt: false, fatal: true },
  { re: /\d{1,2}\/\d{1,2}\/\d{4}/g, exempt: true, fatal: false },
  { re: /\d+\s*(?:ngày|tháng)(?![\p{L}])/giu, exempt: false, fatal: false },
  { re: /\d{1,4}\/(?:\d{4}|VBHN)[^\s,;)]*/gi, exempt: true, fatal: false },
  { re: /\d{4}(?:\.\d{2}){1,2}/g, exempt: true, fatal: false },
];

/**
 * Map the model's [n] markers onto the retrieved provisions and prove the numbers next to them (R10).
 * `sources[i]` is "{articleCitation}\n{articleBody}" of the i-th provision given to the model.
 *
 * - `[1, 2]` → `[1] [2]`; markers outside 1..k are removed.
 * - Per sentence, every %, amount, date, duration, document number and HS code must appear in a source the
 *   sentence itself marks (unmarked sentence: any cited source). A sentence failing that loses its markers
 *   and its bold; an unanchored % or amount anywhere empties the whole answer (citations-only reply).
 * - Markers are renumbered by first appearance; `order[k]` is the original position of new marker k+1.
 *
 * A string check of support, not of entailment: a number present in the provision can still be attached to
 * the wrong obligation. The full guards of the /answer path (Mảng 3) take this over.
 */
export function numberMarkers(answer: string, cited: number[], sources: string[], userText: string): { answer: string; order: number[] } {
  const k = sources.length;
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= k;
  const text = answer
    .replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, list: string) => list.split(',').map((n) => `[${n.trim()}]`).join(' '))
    .replace(/\s*\[(\d+)\]/g, (m, n: string) => (inRange(Number(n)) ? m : ''));
  const validCited = [...new Set(cited.filter(inRange))];

  const sentences = text.split(/(?<=[.?!;])(?= )|(?<=\n)/);
  const out: string[] = [];
  for (const s of sentences) {
    const marks = [...s.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const hay = (marks.length ? marks : validCited).map((n) => norm(sources[n - 1] ?? ''));
    let anchored = true;
    for (const { re, exempt, fatal } of FACTS) {
      for (const [fact] of s.matchAll(re)) {
        const f = norm(fact.replace(/[.:]+$/, ''));
        if (hay.some((h) => h.includes(f)) || (exempt && statedIn(userText, fact))) continue;
        if (fatal) return { answer: '', order: [] };
        anchored = false;
      }
    }
    out.push(anchored ? s : s.replace(/\s*\[\d+\]/g, '').replace(/\*\*/g, ''));
  }

  const order: number[] = [];
  const renumbered = out
    .join('')
    .replace(/\[(\d+)\]/g, (_, n: string) => {
      const at = order.indexOf(Number(n));
      if (at >= 0) return `[${at + 1}]`;
      order.push(Number(n));
      return `[${order.length}]`;
    })
    .replace(/(\[\d+\])(?:\s*\1)+/g, '$1');
  if (order.length) return { answer: renumbered, order };
  return { answer: renumbered, order: validCited };
}
```

- [ ] **Bước A4: Prompt đánh số trong `legal.generation.ts`**

Đổi chú thích `citations: number[]; // article provision ids …` thành `citations: number[]; // 1-based positions in the provision list the model says it used`. Đổi dòng dựng khối điều khoản thành:

```ts
    .map((a, i) => `[${i + 1}] ${a.articleCitation}\n${a.articleBody}`)
```

đổi dòng quy tắc `citations` thành:

```ts
    '- "citations" chỉ gồm SỐ THỨ TỰ [n] của CHÍNH các điều khoản bạn dựa vào (chỉ dùng số có trong danh sách).',
```

và thay đoạn từ dòng `'- Nếu các điều khoản chỉ trả lời được MỘT PHẦN …'` tới hết dòng hợp đồng JSON bằng:

```ts
    '- Nếu các điều khoản chỉ trả lời được MỘT PHẦN câu hỏi, nói rõ phần nào có căn cứ và phần nào chưa.',
    '- In **đậm** thuật ngữ, số hiệu, điều khoản, thời hạn then chốt. Dùng "- " đầu dòng CHỈ khi liệt kê các trường hợp hoặc điều kiện song song.',
    '- Đặt [n] ngay sau câu dựa vào điều khoản số n; mỗi nguồn một dấu, ví dụ [1] [2].',
    '- Mọi con số, ngày, thời hạn chép ĐÚNG cách điều khoản viết.',
    '- KHÔNG màu, emoji, HTML, bảng, lời chào, lời mời hỏi thêm. Chỉ dùng "## " khi câu trả lời dài hơn 3 đoạn.',
    '',
    'Trả về JSON MỘT dòng, không kèm giải thích. Xuống dòng trong câu trả lời viết là \\n bên trong chuỗi JSON:',
    '{"answer":"<Markdown tiếng Việt ≤200 từ>","citations":[<n>],"abstain":false,"reason":null}',
```

- [ ] **Bước A5: Gập số hiệu trong `legal.scope.ts`**

Ngay trước `/** Read a document reference out of free text. … */` thêm:

```ts
/**
 * One spelling per document number: NFC, no whitespace, upper case, Đ → D, no leading zeros on the serial.
 * `8/2015/ND-CP` ≡ `08/2015/NĐ-CP`; the issuer segment still counts (`69/2018/TT-BTC` ≠ `69/2018/NĐ-CP`).
 * The bot's sameDocNumber (apps/zalo-bot/parse.mjs) folds the same way.
 */
export function foldDocNumber(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/Đ/g, 'D')
    .replace(/^0+(?=\d)/, '');
}
```

Thêm `consolidates: string | null;` vào `interface ResolvedDoc`. Trong `resolveDocuments` thay câu SELECT tới trước `// Prefer the kind the user named` bằng:

```ts
  const rows = (await db.execute(sql`
    SELECT id, number, title, doc_type AS "docType", consolidates
    FROM legal_document
    WHERE ${matches}
    ORDER BY id
  `)) as unknown as ResolvedDoc[];

  // A full number names ONE document. Another issuer's document with the same serial is not it — and
  // returning [] lets the caller consult the Công báo catalogue instead of answering from the wrong one.
  if (ref.full) {
    const want = foldDocNumber(ref.full);
    return rows.filter((r) => foldDocNumber(r.number) === want || foldDocNumber(r.consolidates) === want);
  }
```

Trong `lookupGazette` thay dòng ``const hit = await select(sql`upper(number) = ${ref.full}`);`` bằng:

```ts
    // Folded in SQL, not by filtering the prefix query below: that one has a LIMIT, so with more than
    // `limit` numbers sharing the head, the document asked for could be cut before it is compared.
    const hit = await select(sql`regexp_replace(translate(upper(number), 'Đđ', 'DD'), '^0+', '') = ${foldDocNumber(ref.full)}`);
```

- [ ] **Bước A6: `ask()` trong `legal.service.ts`**

Đổi import `validateCitations` thành `numberMarkers`. Thay hai dòng `const inQuery = …; const ref = …;` bằng:

```ts
    const inQuery = parseDocRef(query);
    const docRef = parseDocRef(docParam ?? '');
    // `doc=69/2018` from the bot carries no kind; "Nghị định 69/2018 …" in the question does. Without it the
    // catalogue lookup cannot drop same-serial circulars and decisions of other agencies.
    const ref = docRef
      ? { ...docRef, docType: docRef.docType ?? (inQuery?.core === docRef.core ? inQuery.docType : null) }
      : inQuery?.confident
        ? inQuery
        : null;
```

Thay `const valid = validateCitations(gen.citations, kept); if (valid.length === 0) {` và chú thích ngay dưới bằng:

```ts
    const sources = kept.map((a) => `${a.articleCitation}\n${a.articleBody}`);
    const marked = numberMarkers(gen.answer, gen.citations, sources, query);
    if (!marked.answer || marked.order.length === 0) {
      // The model cited nothing we retrieved, or stated a rate or amount its source does not
      // contain → ungrounded. Drop the prose, keep the verbatim provisions as references.
      return {
        query,
        asOf,
        ...scope,
        abstained: false,
```

Thay khối `const citedSet = …` tới hết `return` cuối `ask` bằng:

```ts
    // Contract: [n] in `answer` points at citations[n-1].
    return {
      query,
      asOf,
      ...scope,
      abstained: false,
      reason: null,
      answer: marked.answer,
      citations: marked.order.map((n) => toCitation(kept[n - 1]!)),
    };
```

- [ ] **Bước A7: `norm` của bộ chấm notebook**

Trong `apps/eval/notebook.ts` thay dòng `export const norm = …` bằng:

```ts
/** `*` is dropped: /legal answers are Markdown, and `**không** bao gồm` must still contain "không bao gồm". */
export const norm = (s: string): string => s.normalize('NFC').toLowerCase().replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
```

- [ ] **Bước A8: Chạy lại**

Run: `node_modules/.bin/jest apps/api/src/modules/legal apps/api/src/modules/tariff apps/eval && node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | grep -v TS1343`
Expected: `Tests: 62 passed, 62 total` (legal 14 test mới, tariff 32, `apps/eval` 16 gồm test `norm` mới); tsc không in gì.

- [ ] **Bước A9: Commit**

```bash
git add apps/api/src/modules/legal/legal.grounding.ts apps/api/src/modules/legal/legal.grounding.spec.ts \
  apps/api/src/modules/legal/legal.generation.ts apps/api/src/modules/legal/legal.scope.ts \
  apps/api/src/modules/legal/legal.scope.spec.ts apps/api/src/modules/legal/legal.service.ts \
  apps/api/src/modules/legal/legal.service.spec.ts apps/eval/notebook.ts apps/eval/notebook.spec.ts
git commit -m "Legal: number [n] by position, anchor figures per sentence, match a full document number exactly" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

#### Phần B — Bot

**Files:**
- Modify: `apps/zalo-bot/parse.mjs` (`parseDocRef` dòng 148–157; thêm `sameDocNumber`, `missingKind`; `corpusHas` dòng 160–168)
- Modify: `apps/zalo-bot/format.mjs` (import; `withLead`; khối `// --- Legal ---` tới trước `formatIngestQueued`)
- Modify: `apps/zalo-bot/answer.mjs` (import; `answerLegal` + `missingDocAnswer` dòng 178–256)
- Modify: `apps/zalo-bot/index.mjs` (xoá `showSourceNote`, dòng 186)
- Test: `apps/zalo-bot/dispatch.test.mjs`

**Interfaces:**
- Consumes: `numberMarkers` đã chạy ở API (Phần A) — bot nhận `answer` có `[n]` trỏ `citations[n-1]`; `sanitizeLead` (Task 4).
- Produces:
  - `parseDocRef(raw) → { core, docType, label, full: string | null, confident }` — `full` = số hiệu kèm cơ quan ban hành khi người dùng viết.
  - `sameDocNumber(a, b) → boolean`; `missingKind(label, matches, kind) → { kind, matches }`.
  - `excerpt(raw, min = 140, max = 480) → { text, cut }`; `sourceLines(items: Array<{ n, label, quote?, cut?, url? }>) → Line[]` — Mảng 3 dùng lại (`cut` thêm vào hợp đồng spec để in "(trích đoạn đầu)").
  - `formatLegal(r) → Line[]` (không còn tuỳ chọn `showSourceNote`), `formatProvisions(rows) → Line[]`, `formatMissingDoc(label, matches, kind) → Line[]`.
  - `withLead(lead, lines: Line[]) → Line[]` — gỡ nhánh chuỗi.

- [ ] **Bước B1: Viết test thất bại**

Đổi hai dòng import của `dispatch.test.mjs` thành:

```js
import { formatAnswer, formatLegal, formatMissingDoc, sanitizeLead, withLead } from './format.mjs';
import { cleanGazetteTitle, corpusHas, docNumberStatedIn, missingKind, parseDocRef, sameDocNumber } from './parse.mjs';
```

Thay test `withLead falls back …` bằng bản chỉ còn `Line[]`:

```js
test('withLead falls back to the deterministic block alone', () => {
  const block = [L(['BLOCK'])];
  assert.equal(withLead('Thuế là 15%.', block), block);
  assert.equal(toText(withLead('Đây bạn nhé.', block)), 'Đây bạn nhé.\n\nBLOCK');
  assert.equal(withLead(null, block), block);
});
```

Thêm vào cuối file:

```js
// --- Legal reply (spec §5b.6) ----------------------------------------------------

test('pháp luật: in đủ năm nguồn, một dòng cam cho văn bản tự nạp, dòng đỏ gộp theo văn bản và hiệu lực, trích đoạn giữ vế ngoại lệ', () => {
  const clause =
    'Hàng hóa nhập khẩu để gia công cho thương nhân nước ngoài theo hợp đồng gia công đã ký kết và đã đăng ký với cơ quan hải quan nơi làm thủ tục được miễn thuế nhập khẩu, trừ trường hợp hàng hóa đó được bán hoặc tiêu thụ nội địa. ' +
    'Phần còn lại của khoản quy định hồ sơ, thủ tục và thời hạn thông báo cho cơ quan hải quan. '.repeat(5);
  assert.ok(clause.indexOf('trừ trường hợp') > 140, 'fixture: vế ngoại lệ phải nằm sau ký tự 140');
  const cite = (n, doc, over = {}) => ({
    documentNumber: doc, documentTitle: 't', articleLabel: `Điều ${n} ${doc}`, provisionLabel: `Khoản 1 Điều ${n} ${doc}`,
    verbatimText: `Nội dung khoản ${n}.`, path: '', effectiveness: 'con_hieu_luc', effectiveFrom: '2020-01-01', effectiveTo: null,
    gazetteUrl: `https://congbao.chinhphu.vn/van-ban/${n}`, verification: 'verified', ...over,
  });
  const r = {
    asOf: '2026-09-13',
    answer: 'Hàng gia công được **miễn thuế** [1], trừ khi bán nội địa [2] [4].',
    citations: [
      cite(1, 'VB-A', { verbatimText: clause }),
      cite(2, 'VB-B', { effectiveness: 'het_hieu_luc_mot_phan' }),
      cite(3, 'VB-C', { verification: 'auto_unverified' }),
      cite(4, 'VB-B', { effectiveness: 'het_hieu_luc_mot_phan' }),
      cite(5, 'VB-D', { verification: 'auto_unverified' }),
    ],
  };
  const lines = formatLegal(r);
  const text = toText(lines);
  for (const n of [1, 2, 3, 4, 5]) assert.ok(text.includes(`[${n}] Khoản 1 Điều ${n}`), `thiếu nguồn [${n}] — dấu trong câu trả lời sẽ mồ côi`);
  const parts = render(lines);
  const all = (st) => parts.flatMap((p) => styled(p, st));
  assert.equal(all(ORANGE).length, 1, 'một dòng cảnh báo');
  assert.ok(all(ORANGE)[0].includes('VB-C') && all(ORANGE)[0].includes('VB-D'));
  assert.deepEqual(all(RED), ['[2] [4] VB-B hết hiệu lực một phần — kiểm tra điều khoản còn áp dụng.']);
  const src1 = text.split('\n').find((l) => l.startsWith('[1] '));
  assert.ok(src1.includes('trừ trường hợp') && src1.endsWith('(trích đoạn đầu)'), src1);
  assert.deepEqual(all('b'), ['miễn thuế']);
});

// --- 69/2018 (spec §5b.8) ------------------------------------------------------------

test('HỒI QUY 69/2018: số hiệu đầy đủ đi nguyên vẹn; văn bản đúng số không bị liệt kê như của cơ quan khác', () => {
  assert.equal(parseDocRef('Nghị định 69/2018/NĐ-CP còn áp dụng không').full, '69/2018/NĐ-CP');
  assert.equal(parseDocRef('69/2018').full, null);
  assert.equal(sameDocNumber('69/2018/ND-CP', '69/2018/NĐ-CP'), true);
  assert.equal(sameDocNumber('8/2015/ND-CP', '08/2015/NĐ-CP'), true);
  assert.equal(sameDocNumber('69/2018/TT-BTC', '69/2018/NĐ-CP'), false);
  const nd = { number: '69/2018/NĐ-CP', title: 'Nghị định 69/2018/NĐ-CP tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/nd' };
  const tt = { number: '69/2018/TT-BTC', title: 'Thông tư 69/2018/TT-BTC tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/tt' };
  assert.deepEqual(missingKind('69/2018/NĐ-CP', [nd, tt], 'similar'), { kind: 'exact', matches: [nd] });
  const text = toText(formatMissingDoc('69/2018/NĐ-CP', [nd, tt], 'similar'));
  assert.ok(!text.includes('cơ quan khác'), 'chính văn bản được hỏi bị trình bày như văn bản của cơ quan khác');
  assert.ok(text.includes('Trả lời "nạp"'), 'văn bản đúng số thì được đề nghị nạp');
  assert.equal(corpusHas([{ number: '69/2018/NĐ-CP', consolidates: null }], parseDocRef('69/2018/TT-BTC')), false);
});

test('cùng số, khác cơ quan ban hành: vẫn là văn bản khác và không được đề nghị nạp', () => {
  const tt = { number: '69/2018/TT-BTC', title: 'Thông tư 69/2018/TT-BTC tiêu đề', sourceUrl: 'https://congbao.chinhphu.vn/van-ban/tt' };
  assert.equal(missingKind('69/2018/NĐ-CP', [tt], 'similar').kind, 'similar');
  const text = toText(formatMissingDoc('69/2018/NĐ-CP', [tt], 'similar'));
  assert.ok(text.includes('cùng số của cơ quan khác'));
  assert.ok(!text.includes('Trả lời "nạp"'), 'không bao giờ nạp một văn bản khác thay cho văn bản được hỏi');
});
```

- [ ] **Bước B2: Chạy để thấy thất bại**

Run: `corepack yarn test:bot 2>&1 | grep -E "^✖|ℹ (pass|fail)|SyntaxError"`
Expected: FAIL — `SyntaxError: The requested module './parse.mjs' does not provide an export named 'missingKind'`.

- [ ] **Bước B3: `parse.mjs`**

Thay đoạn từ `const isVbhn = /vbhn/i.test(m[2]);` trong `parseDocRef` tới **trước** dòng `const heads = [ref.core, …]` trong `corpusHas` bằng đoạn dưới (đoạn này gồm cuối `parseDocRef`, hai hàm mới, JSDoc và hai dòng đầu của `corpusHas`):

```js
  const isVbhn = /vbhn/i.test(m[2]);
  const label = (text.slice(start, start + m[0].length) + issuer).replace(/\s+/g, '').toUpperCase();
  return {
    core: `${m[1]}/${m[2]}`.toUpperCase(),
    docType,
    label,
    // The number as written, issuer included, when the user wrote one — what the API needs to match exactly.
    full: issuer ? label : null,
    confident: Boolean(docType) || Boolean(issuer) || isVbhn,
  };
}

/** The API's foldDocNumber (legal.scope.ts): NFC, no whitespace, upper case, Đ → D, no leading zeros. */
const foldDocNumber = (s) =>
  String(s ?? '').normalize('NFC').replace(/\s+/g, '').toUpperCase().replace(/Đ/g, 'D').replace(/^0+(?=\d)/, '');

/** Same document number? `08/2015/NĐ-CP` ≡ `8/2015/ND-CP`; `69/2018/TT-BTC` ≠ `69/2018/NĐ-CP`. */
export function sameDocNumber(a, b) {
  const x = foldDocNumber(a);
  return x !== '' && x === foldDocNumber(b);
}

/**
 * Never present the number asked for as a different document: a `similar`/`ambiguous` catalogue
 * hit equal to `label` IS the document, so it becomes `exact` (and can be offered for ingest).
 */
export function missingKind(label, matches = [], kind = 'none') {
  const list = matches || [];
  if (kind === 'similar' || kind === 'ambiguous') {
    const same = list.find((g) => sameDocNumber(label, g.number));
    if (same) return { kind: 'exact', matches: [same] };
  }
  return { kind, matches: list };
}

/** Does the corpus manifest hold this reference? `docs` is the /legal/documents payload. */
export function corpusHas(docs, ref) {
  if (!ref) return true;
  // A full number names one document: holding 69/2018/NĐ-CP is not holding 69/2018/TT-BTC.
  if (ref.full) return (docs || []).some((d) => sameDocNumber(d.number, ref.full) || sameDocNumber(d.consolidates, ref.full));
```

- [ ] **Bước B4: `format.mjs`**

Đổi import thành:

```js
import { cleanGazetteTitle, missingKind, ORIGIN_LABEL } from './parse.mjs';
import { L, md, toText } from './render.mjs';
```

Thay `withLead` (gỡ nhánh chuỗi) bằng:

```js
/** A gated lead as its own line above the reply; it never replaces a line of the reply. */
export function withLead(lead, lines) {
  const clean = sanitizeLead(lead, toText(lines));
  return clean ? [L([clean]), L([]), ...lines] : lines;
}
```

Thay toàn bộ khối từ `// --- Legal ---` tới **trước** `/** Reply to an accepted ingest offer. */` (tức `formatLegal`, `formatProvisions`, `DOC_KIND`, `formatMissingDoc` cũ — `DOC_KIND` không có nơi dùng) bằng:

```js
// --- Legal ------------------------------------------------------------------

const EFFECT = {
  het_hieu_luc: 'hết hiệu lực',
  het_hieu_luc_mot_phan: 'hết hiệu lực một phần',
  chua_co_hieu_luc: 'chưa có hiệu lực',
};

/** A red effectiveness line, worded from the enum, never from model text (R8). */
function effectLine(c, ns = []) {
  const marks = ns.length ? `${ns.map((n) => `[${n}]`).join(' ')} ` : '';
  const tail =
    c.effectiveness === 'chua_co_hieu_luc'
      ? c.effectiveFrom ? ` (từ ${dmy(c.effectiveFrom)})` : ''
      : ' — kiểm tra điều khoản còn áp dụng';
  return L([`${marks}${c.documentNumber} ${EFFECT[c.effectiveness]}${tail}.`], 'red');
}

/**
 * The opening of a provision, cut at the first sentence or clause boundary between 140 and 480
 * characters: Vietnamese provisions put the exception after the first clause ("được miễn thuế …
 * trừ trường hợp …"), and a hard cut there can read as the opposite rule.
 */
export function excerpt(raw, min = 140, max = 480) {
  const text = String(raw ?? '').normalize('NFC').trim();
  const flat = (s) => s.replace(/\s+/g, ' ').trim();
  const whole = flat(text);
  if (whole.length <= max) return { text: whole, cut: false };
  for (const m of text.matchAll(/[.;:](?=\s)|\n(?=\s*(?:[a-zđ]\)|\d+\.)\s)/g)) {
    const head = flat(text.slice(0, m.index + (m[0] === '\n' ? 0 : 1)));
    if (head.length > max) break;
    if (head.length >= min) return { text: `${head.replace(/[.;:]$/, '')}…`, cut: true };
  }
  return { text: `${whole.slice(0, max)}…`, cut: true };
}

/**
 * "Nguồn:" block, small italic. items: { n, label, quote?, cut?, url? }. Links are de-duplicated
 * per document and capped at three. Reused by Mảng 3's formatAnswerMd.
 */
export function sourceLines(items) {
  if (!items.length) return [];
  const urls = [...new Set(items.map((x) => x.url).filter(Boolean))].slice(0, 3);
  return [
    L(['Nguồn:'], 'note'),
    ...items.map((x) => L([`[${x.n}] ${x.label}${x.quote ? ` — “${x.quote}”${x.cut ? ' (trích đoạn đầu)' : ''}` : ''}`], 'note')),
    ...(urls.length ? [L([`Toàn văn: ${urls.join(' · ')}`], 'note')] : []),
  ];
}

/** Grounded legal answer: md(prose with [n]) + effectiveness + unverified warning + every source. */
export function formatLegal(r) {
  const cites = r.citations ?? [];
  const lines = r.answer
    ? md(r.answer)
    : [L(['Mình chưa tổng hợp được câu trả lời chắc chắn; đây là các điều khoản liên quan nhất để bạn đối chiếu:'])];
  lines.push(L([]));

  // One red line per (document, effectiveness) — markers share a line only when both match.
  const groups = new Map();
  cites.forEach((c, i) => {
    if (!EFFECT[c.effectiveness]) return;
    const key = `${c.documentNumber}|${c.effectiveness}`;
    if (!groups.has(key)) groups.set(key, { c, ns: [] });
    groups.get(key).ns.push(i + 1);
  });
  for (const { c, ns } of groups.values()) lines.push(effectLine(c, ns));

  // Machine-fetched text never quietly acquires the standing of text a person checked (R18).
  const unverified = [...new Set(cites.filter((c) => c.verification === 'auto_unverified').map((c) => c.documentNumber))];
  if (unverified.length) {
    lines.push(
      L(
        [`${unverified.join(', ')} do bot tự nạp, chưa có người đối chiếu — đọc bản gốc trước khi dùng; đã đối chiếu thì nhắn "xác nhận văn bản ${unverified.length === 1 ? unverified[0] : '<số hiệu>'}".`],
        'warn',
      ),
    );
  }

  const items = cites.map((c, i) => {
    const ex = excerpt(c.verbatimText);
    const late = c.effectiveTo || (c.effectiveFrom && r.asOf && c.effectiveFrom > r.asOf);
    const window =
      late && c.effectiveFrom
        ? ` · hiệu lực ${c.effectiveTo ? `${dmy(c.effectiveFrom)}–${dmy(c.effectiveTo)}` : `từ ${dmy(c.effectiveFrom)}`}`
        : '';
    return { n: i + 1, label: `${c.provisionLabel}${window}`, quote: ex.text, cut: ex.cut, url: c.gazetteUrl };
  });
  lines.push(...sourceLines(items));
  return lines;
}

/** A provision fetched by citation (no retrieval, no model in the path). */
export function formatProvisions(rows) {
  return rows.slice(0, 2).flatMap((p, k) => {
    const body = (p.body || '').replace(/\s+/g, ' ').trim();
    return [
      ...(k ? [L([])] : []),
      L(['Nguyên văn ', [p.citationLabel, 'b'], ':']),
      L([body.length > 1200 ? `${body.slice(0, 1200)}…` : body]),
      ...(EFFECT[p.effectiveness] ? [effectLine(p)] : []),
      ...(p.gazetteUrl ? [L([`Toàn văn: ${p.gazetteUrl}`], 'note')] : []),
    ];
  });
}

/**
 * The honest out-of-corpus answer. "We don't hold it" and "no such document" differ, and a
 * catalogue hit equal to the number asked for is that document — never "another agency's".
 */
export function formatMissingDoc(label, gazetteMatches = [], kindIn = 'none') {
  const { kind, matches } = missingKind(label, gazetteMatches, kindIn);
  const opener = (num) => L(['Mình chưa có toàn văn và tình trạng hiệu lực của ', [num, 'b'], ' nên chưa trả lời được câu này.']);
  const item = (g) => L([[g.number, 'b'], ` — ${cleanGazetteTitle(g.number, g.title)}`], 'ul');

  if (kind === 'exact' && matches[0]) {
    const hit = matches[0];
    return [
      opener(hit.number),
      L(['Công báo có văn bản này: ', [cleanGazetteTitle(hit.number, hit.title, 130), 'i'], '.']),
      ...(hit.sourceUrl ? [L([`Toàn văn: ${hit.sourceUrl}`], 'note')] : []),
      L(['Trả lời "nạp" là mình lấy toàn văn về rồi tra tiếp cho bạn (mất vài phút).']),
    ];
  }
  if (kind === 'ambiguous' && matches.length) {
    return [
      opener(label),
      L([`Công báo có ${matches.length} văn bản mang số này, bạn cần bản năm nào?`]),
      ...matches.slice(0, 6).map(item),
      L(['Nhắn số hiệu đầy đủ (ví dụ 36/2025/TT-BKHCN) là mình nạp về.']),
    ];
  }
  if (matches.length) {
    // Same serial, and the requested number is not among them (missingKind moved that case to exact).
    const hasIssuer = /\/.*\/|vbhn-/i.test(label);
    return [
      opener(label),
      L([
        hasIssuer
          ? `Công báo không có văn bản đúng số này; có ${matches.length} văn bản cùng số của cơ quan khác:`
          : `Công báo có ${matches.length} văn bản mang số này, bạn cần văn bản nào?`,
      ]),
      ...matches.slice(0, 4).map(item),
      L(['Nếu đúng là một trong số này, nhắn số hiệu đầy đủ để mình nạp.']),
    ];
  }
  return [L(['Mình không tìm thấy ', [label, 'b'], ' cả trong kho lẫn trên Công báo — bạn kiểm tra lại số hiệu giúp mình.'])];
}
```

- [ ] **Bước B5: `answer.mjs` và `index.mjs`**

`answer.mjs`: thêm `missingKind` vào import từ `./parse.mjs`. Thay từ `export async function answerLegal` tới trước `// --- Verify-on-use` bằng:

```js
export async function answerLegal(query, { asOf, doc, article, clause, lead } = {}) {
  const docs = await legalDocuments();
  const ref = parseDocRef(doc || '') ?? (() => { const r = parseDocRef(query); return r?.confident ? r : null; })();

  if (ref && !corpusHas(docs, ref)) {
    // Ask the API anyway: it is the side that can consult the Công báo catalogue, and
    // "we don't hold it" reads very differently with the document's real title attached.
    // The full number when the user wrote one: the API can then match that ONE document (69/2018 bug).
    const probe = await legalAnswer(query, { asOf, doc: ref.full ?? ref.core });
    return missingDocAnswer(query, ref.label, probe, asOf);
  }

  const r = await legalAnswer(query, { asOf, doc: ref ? (ref.full ?? ref.core) : undefined, article });
  if (r?.missingDoc) return missingDocAnswer(query, r.missingDoc, r, r.asOf ?? asOf);

  if (!r || r.abstained || !(r.citations || []).length) {
    // A named Điều that retrieval could not ground is still fetchable verbatim —
    // "cho tôi Điều 18" is a lookup, and the text either exists or it does not.
    if (ref && article) {
      const rows = await legalProvision(ref.full ?? ref.core, article, clause);
      if (rows?.length) {
        return {
          text: withLead(lead, formatProvisions(rows)),
          topic: 'legal',
          legal: {
            query,
            asOf: asOf ?? null,
            docNumbers: [rows[0].documentNumber],
            citations: rows.slice(0, 3).map((p) => ({ documentNumber: p.documentNumber, provisionLabel: p.citationLabel })),
          },
        };
      }
    }
    // The API reason is shown only when it passes the same gate as LLM prose (it can be model text).
    const reason = sanitizeLead(r?.reason, '');
    return {
      text: [
        L(['Mình chưa tìm thấy điều khoản đủ căn cứ trong ', ref ? [ref.label, 'b'] : 'các văn bản mình đang có', ' nên chưa trả lời, để tránh sai.']),
        ...(reason ? [L([`Lý do: ${reason}`], 'note')] : []),
        L(['Nếu bạn biết số hiệu văn bản, nhắn số hiệu để mình tìm trên Công báo và nạp về.']),
      ],
      topic: 'legal',
      legal: { query, asOf: r?.asOf ?? null, missingDoc: null },
    };
  }

  return {
    text: formatLegal(r),
    topic: 'legal',
    legal: {
      query,
      asOf: r.asOf ?? null,
      docNumbers: [...new Set((r.citations || []).map((c) => c.documentNumber))],
      citations: (r.citations || []).slice(0, 3).map((c) => ({ documentNumber: c.documentNumber, provisionLabel: c.provisionLabel })),
      missingDoc: null,
    },
  };
}

/**
 * Answer for a document we do not hold, carrying whatever the gazette catalogue knows.
 * `pendingIngest` is what lets the next turn act on "nạp" — the offer and the thing
 * being offered have to survive between messages, which is what conversation memory is for.
 */
function missingDocAnswer(query, label, apiAnswer, asOf) {
  // A catalogue hit equal to the number asked for IS that document: offer it, never list it as another one.
  const { kind, matches } = missingKind(label, apiAnswer?.gazetteMatches ?? [], apiAnswer?.gazetteMatchKind ?? 'none');
  // Only an EXACT catalogue hit may be offered for ingest. A near-miss by number is a
  // different document, and an ambiguous year is a question for the user — fetching
  // either would answer something nobody asked.
  const hit = kind === 'exact' ? (matches[0] ?? null) : null;
  return {
    text: formatMissingDoc(label, matches, kind),
    topic: 'legal',
    legal: {
      query,
      asOf: asOf ?? null,
      missingDoc: label,
      pendingIngest: hit ? { number: hit.number, title: hit.title, sourceUrl: hit.sourceUrl } : null,
    },
  };
}
```

`index.mjs`: trong lời gọi `answerLegal(query, { … })` xoá dòng `showSourceNote: ctx.topic !== 'legal',`.

- [ ] **Bước B6: Chạy lại**

Run: `node --check apps/zalo-bot/answer.mjs && corepack yarn test:bot 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `ℹ pass 49`, `ℹ fail 0`.

- [ ] **Bước B7: Commit**

```bash
git add apps/zalo-bot/parse.mjs apps/zalo-bot/format.mjs apps/zalo-bot/answer.mjs apps/zalo-bot/index.mjs apps/zalo-bot/dispatch.test.mjs
git commit -m "Bot: notebook-style legal reply with sources; never list the requested document as another agency's" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Đường gửi có style; trả lời chung, xác nhận, nạp, lỗi đi qua bộ trình bày

**Files:**
- Modify: `apps/zalo-bot/format.mjs` (`formatIngestQueued`, `formatIngestReport`; thêm `CAPABILITIES`, `formatGeneral`)
- Modify: `apps/zalo-bot/router.mjs` (import; trường `reply` trong prompt dòng 143)
- Modify: `apps/zalo-bot/answer.mjs` (`handleConfirm` dòng 261–284)
- Modify: `apps/zalo-bot/index.mjs` (import; `verifyDoc` dòng 107–110; `general` dòng 191–199; ack ảnh dòng 261; gửi + ghi nhớ dòng 268–284; lỗi chung dòng 288; báo cáo nạp dòng 310)
- Test: `apps/zalo-bot/dispatch.test.mjs`

**Interfaces:**
- Consumes: `render`, `L`, `toText` (Task 1); `sanitizeLead`, `md`, `dmy` (Task 3–5).
- Produces:
  - `CAPABILITIES: Line[]` — danh sách năng lực duy nhất `reply` được nhắc; `formatGeneral(reply) → Line[]`.
  - `formatIngestQueued(number, alreadyQueued) → Line[]`, `formatIngestReport(report) → Line[]`.
  - Đường gửi: `render(result.text)`; chỉ tin đầu mang `quote`; ghi nhớ ngay sau tin đầu với `botText = parts.map((p) => p.msg).join('\n\n')`; tin sau lỗi chỉ ghi log.

- [ ] **Bước 1: Viết test thất bại**

Đổi import `./format.mjs` trong `dispatch.test.mjs` thành:

```js
import {
  CAPABILITIES,
  formatAnswer,
  formatGeneral,
  formatLegal,
  formatMissingDoc,
  sanitizeLead,
  withLead,
} from './format.mjs';
```

Thêm vào cuối file:

```js
// --- General reply (spec §5b.7) -------------------------------------------------------

test('formatGeneral: trả lời chung có dữ kiện bị thay bằng danh sách năng lực; danh sách giữ dạng', () => {
  for (const reply of ['Thuế khoảng 15% bạn nhé.', 'Khoảng mười phần trăm.', 'Theo Nghị định 26/2023/NĐ-CP thì được.', 'Hàng này thuộc mã 8481.80 đó.', 'Là mã HS 84818099 nhé.']) {
    assert.equal(formatGeneral(reply), CAPABILITIES, `phải bác: ${reply}`);
  }
  assert.deepEqual(formatGeneral('- a\n- b').map((l) => l.marks), [['ul'], ['ul']]);
});
```

- [ ] **Bước 2: Chạy để thấy thất bại**

Run: `corepack yarn test:bot 2>&1 | grep -E "^✖|ℹ (pass|fail)|SyntaxError"`
Expected: FAIL — `does not provide an export named 'CAPABILITIES'`.

- [ ] **Bước 3: `format.mjs`**

Thay `formatIngestQueued` và `formatIngestReport` tới cuối file bằng:

```js
/** Reply to an accepted ingest offer. */
export function formatIngestQueued(number, alreadyQueued) {
  return alreadyQueued
    ? [L([[number, 'b'], ' đang được nạp rồi — mình nhắn lại ngay khi xong.'])]
    : [L(['Đã xếp hàng nạp ', [number, 'b'], '. Tải, tách điều khoản và embed mất vài phút; xong mình nhắn lại đây.'])];
}

/** Report an ingest outcome back to the thread that asked for it. */
export function formatIngestReport(report) {
  if (report.status === 'done') {
    return [
      L([
        'Đã nạp xong ',
        [report.number, 'b'],
        `${report.detail ? ` — ${report.detail}` : ''}. Bạn hỏi nội dung văn bản này được rồi; lưu ý bản này bot tự nạp, chưa có người đối chiếu.`,
      ]),
    ];
  }
  return [L(['Không nạp được ', [report.number, 'b'], `: ${report.detail || 'không rõ lý do'}. Bạn tra trực tiếp trên congbao.chinhphu.vn giúp mình nhé.`])];
}

// --- General ------------------------------------------------------------------

/** The only capabilities the router's reply may mention, and the reply when the gate drops it. */
export const CAPABILITIES = [
  L(['Mình tra được hai việc:']),
  L([['Biểu thuế xuất nhập khẩu', 'b'], ' — gõ tên hàng hoặc mã HS, kèm xuất xứ.'], 'ol'),
  L([['Văn bản pháp luật hải quan', 'b'], ' — hỏi nội dung văn bản mình đang có; chưa có thì mình tìm trên Công báo và nạp về.'], 'ol'),
  L([['Ví dụ: "thuế nhập khẩu 8481.80.99 xuất xứ Trung Quốc"', 'i']]),
];

/** The router's free reply (intent general): gated like any LLM prose, then md() on the original text. */
export function formatGeneral(reply) {
  // sanitizeLead collapses whitespace, so it is only the gate; md() reads the original line breaks.
  return sanitizeLead(reply, '', 900) ? md(String(reply).slice(0, 900)) : CAPABILITIES;
}
```

- [ ] **Bước 4: `router.mjs`**

Sau `import { spawn } from 'node:child_process';` thêm:

```js

import { CAPABILITIES } from './format.mjs';
import { toText } from './render.mjs';
```

Thay dòng `'"reply":"<CHỈ khi intent=general: câu trả lời TIẾNG VIỆT ≤120 từ>"}',` và dòng trống ngay sau bằng:

```js
    '"reply":"<CHỈ khi intent=general: câu trả lời TIẾNG VIỆT ≤120 từ, chỉ nhắc các việc trong NĂNG LỰC CỦA BOT; KHÔNG nêu con số thuế, phần trăm, số hiệu văn bản hay mã HS>"}',
    '',
    'NĂNG LỰC CỦA BOT (reply chỉ được nhắc những việc này):',
    toText(CAPABILITIES),
    '',
```

- [ ] **Bước 5: `answer.mjs` — `handleConfirm`**

Thay cả hàm bằng:

```js
export async function handleConfirm(tariff, verdict, senderName) {
  if (!tariff?.hs) {
    return {
      text: 'Mình chưa có kết quả tra cứu gần đây của bạn để xác nhận. Bạn tra mã HS hoặc tên hàng trước, rồi trả lời "đúng", "sai" hoặc "không chắc" nhé.',
      topic: 'tariff',
    };
  }
  // KHÔNG gửi note ở đây: một cú "đúng" chỉ là ĐỒNG Ý với phỏng đoán của bot, KHÔNG phải
  // ÁP MÃ của con người. note=null → matchByProduct loại (chỉ ruling do người GÕ MÃ mới promote được).
  const ok = await postConfirm({
    hs: tariff.hs,
    origin: tariff.origin || null,
    date: tariff.date,
    verdict,
    staffName: senderName,
    snapshot: tariff.snapshot,
  });
  if (!ok) return { text: 'Ghi nhận xác nhận bị lỗi, thử lại sau nhé.', topic: 'tariff' };
  const label = verdict === 'correct' ? 'đúng' : verdict === 'wrong' ? 'sai' : 'chưa chắc';
  return {
    text: [L(['Đã ghi nhận ', [label, 'b'], ' cho mã ', [tariff.dotted, 'b'], ` (${tariff.origin ? `xuất xứ ${tariff.origin}, ` : ''}ngày ${dmy(tariff.date)}). Cảm ơn ${senderName}.`])],
    topic: 'tariff',
  };
}
```

- [ ] **Bước 6: `index.mjs` — gửi có style**

Import: đổi dòng format thành `import { formatGeneral, formatIngestQueued, formatIngestReport } from './format.mjs';` và dòng `import { toText } from './render.mjs';` thành `import { L, render } from './render.mjs';`. Trong khối chú thích đầu file, thay dòng `format.mjs` bằng hai dòng:

```js
 *   format.mjs       dựng câu trả lời (Line[]) từ dữ liệu API; lời văn LLM chỉ qua cổng sanitizeLead
 *   render.mjs       Line[] → tin Zalo có styles, tách tin ~1.800 ký tự
```

`verifyDoc`: thay hai nhánh chuỗi bằng:

```js
      text: res?.verified
        ? [L(['Đã ghi nhận ', [verifyDoc, 'b'], ` là đã đối chiếu (theo ${senderName}). Từ giờ trích dẫn từ văn bản này không còn cảnh báo nữa.`])]
        : [L(['Mình không tìm thấy ', [verifyDoc, 'b'], ' ở trạng thái "bot tự nạp" để xác nhận — có thể nó đã được xác nhận rồi, hoặc chưa có trong kho.'])],
```

`general`: thay `text: routed?.reply || '…'` bằng `text: formatGeneral(routed?.reply),`.

Ack ảnh: thay `{ msg: '🔍 Đang xem ảnh…', quote: msg.data }` bằng `{ ...render('Mình đang xem ảnh, bạn chờ khoảng 20 giây nhé.')[0], quote: msg.data }`.

Gửi và ghi nhớ: thay từ `const reply = toText(result.text); …` tới hết lời gọi `await saveContext({ … });` bằng (giữ nguyên các dòng `state` ở giữa như bản dưới):

```js
      // Only the first part quotes the question. Memory is saved right after it, so a later part
      // failing never costs the "đúng"/"sai" that follows (tariffFresh).
      const parts = render(result.text);
      await api.sendMessage({ ...parts[0], quote: msg.data }, msg.threadId, msg.type);

      // Ghi nhớ SAU khi đã trả lời — lỗi lưu trí nhớ không được làm mất câu trả lời.
      // `tariff`/`legal` vắng mặt = giữ nguyên phần trí nhớ đó; null = xoá (không còn gì để trỏ tới).
      const state = { ...(ctx.state || {}) };
      if ('tariff' in result) state.tariff = result.tariff;
      if ('legal' in result) state.legal = result.legal;
      await saveContext({
        threadId: msg.threadId,
        userId,
        staffName: senderName,
        userText: text || '(ảnh)',
        botText: parts.map((p) => p.msg).join('\n\n'),
        intent: result.intent,
        topic: result.topic ?? ctx.topic ?? null,
        state,
      });
      for (const p of parts.slice(1)) {
        // Part 1 is delivered and remembered: a later failure only logs, never sends the generic error.
        await api.sendMessage(p, msg.threadId, msg.type).catch((e) => console.warn('[zalo] send part failed:', e?.message));
      }
```

Lỗi chung: thay `{ msg: 'Xin lỗi, có lỗi khi tra cứu. Thử lại sau.' }` bằng `render('Xin lỗi, có lỗi khi tra cứu. Thử lại sau.')[0]`.

Báo cáo nạp: thay `await api.sendMessage({ msg: formatIngestReport(r) }, r.threadId, type);` bằng `for (const p of render(formatIngestReport(r))) await api.sendMessage(p, r.threadId, type);`.

- [ ] **Bước 7: Chạy lại**

Run: `for f in index answer router format; do node --check apps/zalo-bot/$f.mjs || exit 1; done; grep -nP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2139}\x{2197}\x{23F3}]" apps/zalo-bot/answer.mjs apps/zalo-bot/format.mjs apps/zalo-bot/index.mjs; corepack yarn test:bot 2>&1 | grep -E "^✖|ℹ (pass|fail)"`
Expected: `grep` không in gì (không còn emoji trong chữ gửi đi); `ℹ pass 50`, `ℹ fail 0`.

- [ ] **Bước 8: Commit**

```bash
git add apps/zalo-bot/format.mjs apps/zalo-bot/router.mjs apps/zalo-bot/answer.mjs apps/zalo-bot/index.mjs apps/zalo-bot/dispatch.test.mjs
git commit -m "Bot: send styled, split replies; gate the router's general reply" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Kiểm chứng đầy đủ và bản chạy khô `dry-run.mjs`

**Files:**
- Modify: `apps/zalo-bot/index.mjs` (import `node:url`; `export` cho `respond`; chạy `main()` chỉ khi là entry point)
- Create: `apps/zalo-bot/dry-run.mjs`

**Interfaces:**
- Consumes: `respond(...)` trong `index.mjs`, `render` (Task 1).
- Produces: `node apps/zalo-bot/dry-run.mjs [câu hỏi…]` in từng tin (chữ + mọi style) đúng như sẽ gửi, không đăng nhập Zalo, không ghi bộ nhớ hội thoại. Task 8 chạy nó trong container `zalo-bot`.

- [ ] **Bước 1: Cho phép import `respond` mà không đăng nhập**

Trong `index.mjs` thêm `import { pathToFileURL } from 'node:url';` sau import `node:path`; đổi `async function respond(` thành `export async function respond(`; thay khối cuối file `main().catch(…)` bằng:

```js
// Start only as the entry point: dry-run.mjs imports respond() without logging in to Zalo.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error('[zalo] khởi động thất bại:', e);
    process.exit(1);
  });
}
```

`docker-compose.yml` chạy `node apps/zalo-bot/index.mjs` — `argv[1]` là đúng file này, nên bot vẫn khởi động.

- [ ] **Bước 2: Tạo `apps/zalo-bot/dry-run.mjs`**

```js
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
```

- [ ] **Bước 3: Chạy khô không có API**

Run: `API_URL=http://127.0.0.1:9 node apps/zalo-bot/dry-run.mjs "8481.80.99 TQ"`
Expected (không có dòng `[zalo] …` nào — không đăng nhập):

```text
=== 8481.80.99 TQ
    intent=tariff · 1 tin
--- tin 1/1 (48 ký tự)
Không gọi được dịch vụ tra cứu. Thử lại sau nhé.
```

- [ ] **Bước 4: Toàn bộ kiểm chứng tại máy**

Run:

```bash
corepack yarn test:bot 2>&1 | grep -E "ℹ (pass|fail)"
node_modules/.bin/jest apps/api/src/modules/tariff apps/api/src/modules/legal apps/eval 2>&1 | grep -E "Tests:|Suites:"
node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "error TS" | grep -v TS1343
corepack yarn build 2>&1 | tail -2
grep -rn "validateCitations\|formatCandidates\|showSourceNote\|DATA_SNAPSHOT_DATE\|GAZETTE_LAG_DAYS\|staleness?.stale" apps public docker-compose.yml
```

Expected: `ℹ pass 50`, `ℹ fail 0`; `Tests: 62 passed, 62 total`; tsc không in gì; build không lỗi; `grep` cuối không in gì.

- [ ] **Bước 5 (tuỳ chọn, khi có stack cục bộ đã seed): chạy khô sáu câu mẫu**

Run: `API_URL=http://127.0.0.1:${API_HOST_PORT:-3000} node apps/zalo-bot/dry-run.mjs`
Không có `CLAUDE_CODE_OAUTH_TOKEN` thì router trả `null` và câu pháp luật rơi về nhánh thuế theo `fallbackIntent` — đó là
hành vi cũ, không phải lỗi. Bản chạy khô có đủ router nằm ở Task 8 bước 5.

- [ ] **Bước 6: Commit**

```bash
git add apps/zalo-bot/index.mjs apps/zalo-bot/dry-run.mjs
git commit -m "Bot: dry-run script that prints styled replies without logging in to Zalo" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Deploy lên server dev dùng chung — controller làm, không dừng trước deploy

**Người làm:** controller (phiên điều phối), sau khi Task 1–7 đã commit và Task 7 bước 4 xanh. Agent thực thi task không
chạy task này (không ssh). Theo quyết định của chủ dự án 2026-09-13, không có điểm dừng trước deploy; chủ dự án duyệt
bằng cách nhắn thử trên Zalo sau deploy (bước 6).

**Files:** không sửa file nào trong repo (ghi nhận kết quả ở Task 9). Runbook: [vận hành server dev](../docs/mona-dev-server-operations.md) mục 4–5.

**Interfaces:**
- Consumes: các commit của Task 1–7 (commit theo task đã được chủ dự án cho phép); `git archive HEAD` chỉ gói thứ đã commit.
- Produces: `api` + `zalo-bot` chạy mã mới; bản chạy khô trên server; xác nhận của chủ dự án trên điện thoại và Zalo PC.

- [ ] **Bước 1: Điều kiện trước và mốc rollback**

Run (máy dev):

```bash
git status --short && git log -1 --oneline
OLD=$(ssh <MONA_DEV_HOST> 'cat /opt/docker-projects/customs-assistant/DEPLOYED_COMMIT'); echo "rollback về: $OLD"
git diff --stat "$OLD" HEAD
```

Expected: `git status` rỗng; ghi lại giá trị `OLD` vào ghi chú phiên (dùng ở bước 7). `git diff --stat` chỉ gồm các file của kế hoạch này, tài liệu, và `db/seed/data/fta-members.json` (một dòng
`verifiedHash`, nếu `OLD` có trước commit chuẩn bị); không có `db/migrations`.

- [ ] **Bước 2: Đẩy mã**

```bash
git archive HEAD | ssh <MONA_DEV_HOST> 'tar xf - -C /opt/docker-projects/customs-assistant'
git rev-parse HEAD | ssh <MONA_DEV_HOST> 'cat > /opt/docker-projects/customs-assistant/DEPLOYED_COMMIT'
```

- [ ] **Bước 3: Build image qua `migrate`, recreate `api` và `zalo-bot`**

```bash
ssh <MONA_DEV_HOST> 'cd /opt/docker-projects/customs-assistant \
  && docker-compose build migrate \
  && docker-compose run --rm --no-deps migrate </dev/null \
  && docker-compose up -d --no-deps --force-recreate api zalo-bot'
```

Image `api` và `zalo-bot` build qua service `migrate` (`docker-compose build api` không làm gì). Không có migration mới;
recreate `api` còn áp `docker-compose.yml` đã bỏ `DATA_SNAPSHOT_DATE`. Session Zalo nằm trong volume, không phải quét QR.

- [ ] **Bước 4: Kiểm API và log**

```bash
ssh <MONA_DEV_HOST> 'curl -s http://127.0.0.1:3060/health; echo; curl -s "http://127.0.0.1:3060/tariff?hs=84818099&origin=CN&date=$(date +%F)" | grep -o "\"schedule\":\"[A-Za-z0-9_]*\"\|\"originEligible\":[a-z]*\|\"latestInstrument\":{[^}]*}\|\"ftaMembership\":{[^}]*}\|\"ftaMembership\":null"'
ssh <MONA_DEV_HOST> 'cd /opt/docker-projects/customs-assistant && docker-compose logs --tail 80 api | grep -E "fta-members|ERROR" ; docker-compose logs --tail 20 zalo-bot'
```

Expected: `/health` `status: ok`, `llm: up`. `grep -o` in theo thứ tự JSON (bản cũ có `| head -3` chỉ in được ba dòng
`originEligible` đầu, không bao giờ tới hai trường sau): `"schedule":"ACFTA"` rồi `"originEligible":true`; `AANZFTA`, `ATIGA`,
`EVFTA` mỗi biểu `"originEligible":false` (ACFTA không ra `true` thì đối chiếu `sublines`/`excludedOrigins` của dòng trước khi
coi là lỗi); `"latestInstrument":{"number":"26/2023/NĐ-CP","effectiveFrom":"2023-07-15","effectiveTo":null}`;
`"ftaMembership":{"verifiedBy":"Trần Ngọc Nhật","verifiedAt":"2026-09-13"}`. Log `api` **không** có dòng
`fta-members.json is not in effect`; có dòng đó hoặc `"ftaMembership":null` nghĩa là file trong image lệch nội dung đã duyệt —
rollback theo bước 7 và báo chủ dự án. Log `zalo-bot` có `đăng nhập OK` và `đang lắng nghe tin nhắn`, không có `ERROR`.

- [ ] **Bước 5: Chạy khô trên server (có router, có token, không gửi Zalo)**

```bash
ssh <MONA_DEV_HOST> 'cd /opt/docker-projects/customs-assistant && docker-compose exec -T zalo-bot node apps/zalo-bot/dry-run.mjs'
```

Đối chiếu đầu ra, từng câu:
1. "8481.80.99 xuất xứ Trung Quốc": dạng A — câu dẫn "Đối với hàng hóa có mã HS **8481.80.99** … có xuất xứ **Trung Quốc**", đúng một `c_15a85f` phủ "0%" ở dòng "Có C/O form E hợp lệ (ACFTA)", dòng `note` "Đã ẩn AANZFTA, ATIGA, EVFTA …"; đúng một `c_f27806` là dòng phạm vi kho. Ra câu "Mình chưa lọc được các biểu FTA theo xuất xứ" nghĩa là bảng không có hiệu lực → xem bước 4.
2. "8481.80.99" không xuất xứ: dòng ACFTA có "trừ hàng xuất xứ KH, PH" (nếu dữ liệu ghi loại trừ); không `c_15a85f`; khi mã chưa có lịch sử xác nhận, dòng kết có "Cho mình biết xuất xứ để lọc đúng biểu ưu đãi".
3. "hs code Hộp cách ly nhiễu RF": có "đây là ứng viên để bạn chốt, chưa phải mã đã xác định"; không `c_15a85f`; tối đa ba dòng `lst_1` ứng viên nếu nghiêng nhiều nhóm.
4. "Nghị định 69/2018/NĐ-CP còn áp dụng không": không có chữ "cơ quan khác"; có "Công báo có văn bản này" và "Trả lời \"nạp\"" (hoặc câu trả lời từ kho nếu kho đã có văn bản).
5. "Thời hạn nộp thuế …": có dòng `Nguồn:` và mọi `[n]` trong thân có dòng nguồn tương ứng.
6. "Thuế nhập khẩu 2710.12.21 ngày 2026-05-15": có một style `c_db342e` chứa "NQ 25/2026" và "30/06/2026".

Nếu không câu nào ra `2 tin`, chạy thêm câu liệt kê dài tới khi có một câu tách hai tin, ví dụ:
`docker-compose exec -T zalo-bot node apps/zalo-bot/dry-run.mjs "Các trường hợp được miễn thuế nhập khẩu là gì?"`. Ghi lại câu đó cho bước 6.

- [ ] **Bước 6: Chủ dự án kiểm trên Zalo (sau deploy, không chặn deploy)**

Controller báo chủ dự án: bot đã chạy bản mới (commit), đầu ra bước 5, và danh sách câu dưới đây. Không agent hay script nào
gửi tin vào nhóm. Chủ dự án tự nhắn trong nhóm được phép, có tag bot:

1. Sáu câu mẫu ở bước 5, cộng câu tách hai tin.
2. (Tuỳ chủ dự án) trả lời "đúng" vào câu 1 — lưu ý việc này **ghi thật** một phán quyết vào `lookup_confirmation`.

Chủ dự án xác nhận trên **cả điện thoại lẫn Zalo PC**:
- [ ] đậm, nghiêng, chữ nhỏ nghiêng (dòng nguồn), danh sách chấm hiện đúng; không còn emoji `📋 📦 ⚠️ ℹ️ 📌 ⛔`;
- [ ] đúng một dòng cam; dòng đỏ ở câu 6; đúng một chữ xanh ở câu 1 (ACFTA 0%), không chữ xanh ở câu 2 và câu 3;
- [ ] câu tách hai tin: tin đầu có quote câu hỏi, cả hai tin kết bằng `(1/2)`, `(2/2)`, style ở tin hai đúng chỗ;
- [ ] câu 69/2018 không liệt kê chính văn bản dưới "cơ quan khác";
- [ ] (nếu làm) "đúng" được ghi nhận: "Đã ghi nhận **đúng** cho mã **8481.80.99** (…)".

Trong lúc chủ dự án kiểm: `ssh <MONA_DEV_HOST> 'cd /opt/docker-projects/customs-assistant && docker-compose logs -f --tail 30 zalo-bot'` — không được có `send part failed` hay `lỗi xử lý tin`.

- [ ] **Bước 7: Rollback (khi bước 4 hỏng, hoặc chủ dự án báo không đạt và muốn trả bản cũ)**

```bash
git archive "$OLD" | ssh <MONA_DEV_HOST> 'tar xf - -C /opt/docker-projects/customs-assistant'
echo "$OLD" | ssh <MONA_DEV_HOST> 'cat > /opt/docker-projects/customs-assistant/DEPLOYED_COMMIT'
ssh <MONA_DEV_HOST> 'cd /opt/docker-projects/customs-assistant && docker-compose build migrate && docker-compose up -d --no-deps --force-recreate api zalo-bot'
```

An toàn vì kế hoạch này không đổi schema hay dữ liệu. `tar` không xoá file mới (`render.mjs`, `dry-run.mjs`, spec mới) —
mã cũ không import chúng. `docker-compose.yml` cũ trả lại `DATA_SNAPSHOT_DATE` rỗng, API cũ quay về heuristic cũ.
Kiểm lại theo bước 4 (câu cũ "dữ liệu chốt …" xuất hiện lại là đúng bản cũ).

---

### Task 9: Tài liệu

**Files:**
- Modify: `.agent/planning/02-progress.md` (hàng "Công việc tiếp theo"; một mục nhật ký phiên ở đầu phần nhật ký)
- Modify: `.agent/planning/05-bot-parity-tasks.md` (dòng trạng thái đầu file; bảng file và hợp đồng Mảng 3)
- Modify: `.agent/index.md` (mục Lập kế hoạch và Quyết định)
- Modify: `.agent/docs/mona-dev-server-operations.md` (mục 4 "Kiểm tra nhanh": lệnh chạy khô)
- Modify: `.agent/planning/07-zalo-notebook-style-tasks.md` (dòng trạng thái đầu file)

**Interfaces:** không có mã.

- [ ] **Bước 1: `02-progress.md`**

Trong hàng **Công việc tiếp theo**, thay vế "**Đang làm:** thiết kế §5b + kế hoạch 07 …" bằng trạng thái thật sau Task 8
(ví dụ: "Kế hoạch 07 **đã deploy** `<commit>`, lọc FTA theo xuất xứ đang bật; chủ dự án kiểm trên điện thoại + Zalo PC:
<kết quả thật, hoặc 'chờ chủ dự án kiểm'>; tiếp theo: Mảng 2 của kế hoạch 05"). Thêm mục nhật ký mới **ở đầu** "Nhật ký phiên làm việc", theo mẫu các mục sẵn có:
`### 2026-09-xx — Trình bày kiểu notebook trên Zalo: …` với bốn gạch **Đã làm** (render + khối thuế + ứng viên + pháp
luật + đường gửi + API), **Số liệu** (số test, độ dài tin của sáu câu mẫu từ bước 5 Task 8, số câu tách tin), **Bất ngờ**
(bản nháp Task 2 bước 4a để trùng `import { sql }`; `verifiedHash` ghi ở commit chuẩn bị theo phê duyệt `853a01f`; dòng phạm vi kho ngày 13/09/2026 là 26/2023/NĐ-CP, không phải 72/2026;
mọi điều thật sự bất ngờ khi thực thi), **Chờ chủ dự án**. Nếu thêm hàng vào bảng "Trạng thái công việc" thì thêm cùng
hàng vào `01-task-list.md` trong cùng commit.

- [ ] **Bước 2: `05-bot-parity-tasks.md` — Mảng 3 dùng lại, không viết lại (spec §5b.10)**

Cuối dòng trạng thái đầu file thêm: "**Kế hoạch 07 xong** ([07](07-zalo-notebook-style-tasks.md)): `render.mjs`, `md()`, tách tin,
`sourceLines`, `numberMarkers` đã có — Mảng 3 dùng lại."

Trong bảng file Mảng 3 thay hàng:

```md
| `apps/zalo-bot/render.mjs` (+ `render.test.mjs`) | markdown → chữ Zalo, danh sách nguồn, một dòng cảnh báo, khối ứng viên, tách tin ~1.800 |
```

bằng:

```md
| `apps/zalo-bot/format.mjs` (+ `dispatch.test.mjs`) | **chỉ thêm** `formatAnswerMd(answer: AnswerResponse): Line[]`: `md(answerMd)`, `sourceLines` với nhãn `authority`/`window`/`meta.status`, khối `candidates` và khối thuế đặt dưới; bỏ qua `followups`. `render.mjs` (bộ trình bày, tách tin, `warn`) đã có từ [kế hoạch 07](07-zalo-notebook-style-tasks.md) — không viết bộ trình bày thứ hai |
```

Thay `` `render(answer: AnswerResponse): string[]` (mảng tin đã tách) `` trong dòng **Hợp đồng giao diện** bằng
`` `formatAnswerMd(AnswerResponse): Line[]` + `render(Line[]) → {msg, styles}[]` (có sẵn); `guards.ts` chuyển `numberMarkers` từ `legal.grounding.ts` sang và so với `quote` từng trích dẫn ``.
Trong **Việc**, thay "(7) bot: `render.mjs` TDD" bằng "(7) bot: `formatAnswerMd` TDD".

- [ ] **Bước 3: `.agent/index.md`**

Dưới mục "Lập kế hoạch", sau dòng kế hoạch 05, thêm:

```md
- [Trình bày kiểu notebook trên Zalo — kế hoạch 07](planning/07-zalo-notebook-style-tasks.md) — chữ định dạng + màu do dữ liệu quyết, lọc FTA theo bảng thành viên đã ký, dòng phạm vi kho từ bảng `decree`, sửa 69/2018; làm trước Mảng 2
```

Dưới mục "Quyết định", thêm:

```md
- [Chữ định dạng Zalo theo giọng notebook, màu do dữ liệu quyết](architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md)
```

(bỏ qua nếu dòng đã có). Nếu `architecture-decisions/README.md` liệt kê từng ADR, thêm dòng tương ứng.

- [ ] **Bước 4: Runbook — xem trước câu trả lời bot**

Trong `.agent/docs/mona-dev-server-operations.md` mục 4, sau khối "Tra cứu thử" thêm:

````md
Xem trước câu trả lời của bot (chữ + style, không gửi Zalo, không ghi bộ nhớ hội thoại):

```bash
docker-compose exec -T zalo-bot node apps/zalo-bot/dry-run.mjs                      # sáu câu mẫu
docker-compose exec -T zalo-bot node apps/zalo-bot/dry-run.mjs "câu hỏi của bạn"
```
````

- [ ] **Bước 5: Trạng thái kế hoạch 07 và kiểm liên kết**

Đổi dòng `> **Trạng thái …**` đầu file này thành trạng thái thật (task nào xong, commit, ngày deploy, kết quả kiểm
của chủ dự án). Kiểm liên kết tương đối:

```bash
for f in .agent/index.md .agent/planning/05-bot-parity-tasks.md .agent/planning/07-zalo-notebook-style-tasks.md; do
  d=$(dirname "$f"); grep -o '](\([^)#]*\.md\)' "$f" | sed 's/^](//' | while read -r l; do [ -f "$d/$l" ] || echo "gãy: $f → $l"; done
done
```

Expected: không in dòng `gãy:` nào.

- [ ] **Bước 6: Commit**

```bash
git add .agent/planning/02-progress.md .agent/planning/05-bot-parity-tasks.md .agent/planning/07-zalo-notebook-style-tasks.md .agent/index.md .agent/docs/mona-dev-server-operations.md
git commit -m "Docs: record the notebook-style Zalo replies; plan 05 Mảng 3 reuses render.mjs" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Khoảng trống spec phát hiện khi lập kế hoạch

Rà lại 2026-09-13 với spec, ADR và mã tại `e823678`. **Đã giải quyết**: spec hoặc mã đã trả lời (spec đã sửa cho khớp
khi cần). **Kế hoạch chọn**: spec không nói, kế hoạch chọn cách an toàn nhất; chủ dự án đảo được mà không đổi kiến
trúc. Chỉ các mục **câu hỏi chủ dự án** còn mở.

1. **Đã giải quyết — `verifiedHash`.** File duyệt ở `853a01f` thiếu hash vì §5b.4 thêm trường này sau; theo quyết định
   2026-09-13 controller ghi hash ở commit chuẩn bị (mục "Bảng thành viên FTA" ở đầu kế hoạch). Bảng có hiệu lực khi
   deploy.
2. **Kế hoạch chọn — nguồn của thuế chống bán phá giá.** §5b.3 mục 6 chỉ có mẫu `[n] NĐ {decree} — {scheduleName}`;
   quyết định CBPG không phải NĐ → in `{decisionNumber} — thuế chống bán phá giá`.
3. **Kế hoạch chọn — vị trí dòng `trq`, `by_subline`, "riêng dòng 10 số" trong dạng A/B:** sau dòng MFN (A) / sau dòng
   không được hưởng (B), trước "Biểu chưa xác định được theo xuất xứ".
4. **Kế hoạch chọn — dạng C/C′/ứng viên khi mã không có dòng FTA nào:** bỏ câu điều kiện FTA (khi có xuất xứ, API đã
   thêm note "Mã này không có dòng trong các biểu FTA đã nạp; chỉ trả về MFN.").
5. **Đã giải quyết — ứng viên `borderline`:** §5b.5 nói `render()` gộp dòng cảnh báo nhiều nhóm với dòng phạm vi kho,
   nên dòng phạm vi kho phải có mặt → kế hoạch thêm `staleness.warning` của mã đầu làm dòng `warn` (giữ R7).
6. **Đã giải quyết — hình dạng hàm:** `confirmFooter` trả `Line | null` (mã cần `null` khi chưa có lịch sử xác nhận);
   `sourceLines` nhận thêm `cut` để in "(trích đoạn đầu)". Spec §5b.1 và §5b.6 đã sửa theo.
7. **Đã giải quyết — `formatProvisions`:** hợp đồng `withLead` ở §5b.1 (lời dẫn "đặt trước `lines`, không bao giờ thay
   dòng nào") → luôn in câu tất định, lời dẫn qua cổng đứng trên.
8. **Giới hạn đã biết, không chặn — miễn trừ số hiệu trong `numberMarkers`** so với `q` của `/legal`, mà bot gửi
   `search_query` do router viết lại: số hiệu router tự thêm vào câu hỏi cũng được miễn. Mảng 3 có `plan.question` và
   tin nhắn gốc để chặt hơn.
9. **Đã giải quyết — dòng đỏ hiệu lực:** ví dụ spec viết "Nghị định 08/2015/NĐ-CP" (chỗ giữ vị trí), nhưng
   `LegalCitation` không có loại văn bản → in số hiệu trần.
10. **Câu hỏi chủ dự án — dòng `type === 'excluded'` của biểu mà xuất xứ không phải thành viên:** theo "hàng đầu tiên
    thắng" của §5b.3 nó in đỏ thay vì ẩn — đúng chữ spec, kế hoạch làm như vậy; chủ dự án có thể muốn ẩn.
11. **Đã giải quyết — dòng 10 số thiếu mức:** API tại `21ddcb4` in "không rõ mức — đối chiếu nghị định"; bot in cam
    cùng câu đó, không bao giờ `null%` hay 0%.
12. **Câu hỏi chủ dự án — R19** đề xuất trong ADR chưa được duyệt; kế hoạch không ghi vào `business-rules.md`. ADR vẫn
    `Proposed`.
13. **Câu hỏi chủ dự án — §5b.11 (2):** có in "bảng thành viên do {verifiedBy} xác nhận ngày {verifiedAt}" ở dòng nguồn
    không — mặc định không.
14. **Giả định kiểm sau deploy:** ngân sách 1.800 ký tự/tin và style ở tin có `quote` chưa đo; chủ dự án kiểm ở Task 8
    bước 6, không đạt thì rollback (bước 7).

## Kiến thức liên quan

- [Thiết kế bot trả lời ngang notebook — §5b](../docs/bot-answer-parity-design.md#5b-trình-bày-kiểu-notebook-trên-zalo-v3)
- [ADR chữ định dạng Zalo theo giọng notebook](../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md)
- [ADR dòng 10 số quốc gia của biểu FTA](../architecture-decisions/2026-09-13-fta-national-sublines.md)
- [ADR không LLM trên con số thuế](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md) · [ADR HS là ứng viên](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
- [Quy tắc nghiệp vụ](../business-rules.md) — R1, R2, R7, R8, R10, R18
- [Phiếu xác minh bảng thành viên FTA](../review-history/2026-09-13-fta-members-verification.md)
- [Kế hoạch 05 — Mảng 2 làm ngay sau, Mảng 3 dùng lại `render.mjs`](05-bot-parity-tasks.md)
- [Runbook server dev](../docs/mona-dev-server-operations.md) · [Nhật ký tiến độ](02-progress.md)
