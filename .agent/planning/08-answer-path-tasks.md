---
type: planning
status: active
updated: 2026-09-14
related:
  - ../docs/bot-answer-parity-design.md
  - 05-bot-parity-tasks.md
  - 02-progress.md
  - ../business-rules.md
  - ../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md
  - ../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md
  - ../architecture-decisions/2026-07-17-hs-candidates-not-answers.md
  - ../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md
  - ../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md
---

# Kế hoạch 08: bot đọc câu hỏi và lập luận từ nguồn qua `POST /answer`, số liệu do code giữ

> **Nguồn gốc.** Kế hoạch này gộp ba bản thiết kế và ba báo cáo chấm, rồi đối chiếu với code ở `a37c663`.
> - **Xương sống:** bản "spec-minimal".
> - **Ghép thêm:** các rào chắn G4 và G6, hạn giờ 120 s, bước sửa riêng câu vi phạm, lời báo đã hiểu, và lọc dữ kiện hàng bằng code.
> - **Đã gỡ:** mọi lỗi chết mà người chấm nêu:
>   - chủ đề `classify` không có trong enum;
>   - bước kiểm lọt mã chạy trên cả thân bằng chứng;
>   - một tin đính chính ngầm ghi thẳng vào sổ;
>   - dựa vào lời văn cố định để chặn kết luận vội;
>   - không có bước sửa.
>
> **Phạm vi.** Kế hoạch thay phần đường bot của Mảng 3 trong [kế hoạch 05](05-bot-parity-tasks.md). Mảng 4 (chấm A/B) vẫn thuộc kế hoạch 05.

## 0. Quyết định đã chốt (2026-09-14, tối) — có hiệu lực cao hơn mọi mặc định bên dưới

Chủ dự án trả lời ba câu hỏi ngay trong phiên (không đợi Việc 0):

| # | Câu hỏi | Chủ dự án chọn | Sửa gì trong kế hoạch này |
|---|---|---|---|
| Q1 | Câu hỏi thuế suất ("8479.89.10 thuế của hscode này") | **Văn xuôi + khối thuế gọn** | Hàng 5 và 9 của §2.2 **không còn là 0 lần gọi LLM**: sau `answerByHs`, compose chế độ `tariff` viết 2–4 câu giải thích (biểu nào áp khi nào, cần C/O form gì, lưu ý phạm vi kho) từ các dòng `statement` của `/tariff`; **không con số nào trong văn xuôi** (G1, `ratesInProse`); khối thuế gọn do `formatAnswer` in ngay dưới. Chế độ `tariff` dùng `sonnet`/`medium` để giữ ≈ 20–40 s; không có LLM hoặc lỗi → khối thuế một mình như hôm nay. |
| Q2 | "Mã X có đúng/dùng được không": LLM có đọc chú giải nhóm của X không | **Có, không nói là mã của họ** (D1 = có) | Nhóm 4 số của mã người dùng được ghim cùng các nhóm ứng viên mù, **không gắn nhãn, xếp theo số**, sau bước tìm ứng viên mù. Mã 8 số của người dùng vẫn không bao giờ vào prompt (`userCodesIn`). **Probe bất biến R4 ở §9 là cổng chặn deploy** của Việc 12–13. |
| Q3 | Chấp nhận chờ bao lâu | **Tới khoảng 2 phút** | Giữ cổng p95 ≤ 120 s; ack nói lại câu hỏi; compose `high`; một lượt repair. |

Mặc định còn lại giữ như §11: D3 (a) không in MFN của ứng viên, (b) một câu mời nhỏ ở lượt tra đầu; D5 có sau khi duyệt trên Zalo; D6 chỉ khi Việc 14 không đạt. **D4 đổi: không commit câu hỏi thật vào repo public** — `real-questions.json` nằm ở `.agent/local/` (gitignore), test dùng câu viết lại không có dữ liệu người dùng.

**Chia việc với phiên c8 (chế độ hướng dẫn phân loại).**
- c8 viết `apps/api/src/modules/answer/walkthrough.ts` (+ spec) và `policy.ts` (+ spec), cùng dữ liệu `db/seed/data/legal/*`, `research/inbox-loader/*`, phần EN/SEN/rulings của `db/seed/evidence-build.ts`. Phiên này làm mọi thứ còn lại của kế hoạch.
- **Chế độ `hs` của compose = walkthrough của c8** khi file đó có mặt (`buildWalkthroughPrompt`, `walkthroughSchema`, `validateWalkthrough`; hợp đồng ở `answer/types.ts`: `ClassifyInput` không chứa mã người dùng, `WalkthroughOutput` có `candidates[{heading, assessment, deciding_facts, cite_ids}]`, `conclusion{headings, needs_advance_ruling, missing_facts}`, `tariff_ref`). Đến lúc đó compose dùng prompt `CHẾ ĐỘ hs` ở §3.1. Runner ánh xạ `WalkthroughOutput` → `answerMd`/`candidates`/`missingFacts` của §2.4; `validateWalkthrough` chạy **sau** guards chung.
- Dữ liệu c8 sẽ đổi: dòng cửa sổ (`meta.part`, `meta.parent`) cho EN/SEN/ruling dài — retrieve gộp về dòng cha; mỗi nhóm EN một dòng riêng (`meta.also_headings` khi PDF in gộp); `hs_codes` chuẩn hoá có cấp cha 4/6 số; `policyStatus(registry, rows, code, asOf)` thuần — retrieve lấy dòng và truyền vào. Pin đã lọc `meta.part IS NULL` và khớp tiền tố (`8b8d6c5`).
- Hai phiên báo nhau trước mỗi lần push `main` và sau khi deploy xong; c8 báo trước khi chạy `seed-evidence` trên server.
- **G11 đọc hẹp:** "không bao giờ vào prompt" là **phán quyết chuyên viên xác nhận** (`lookup_confirmation`, `ConfirmationService.matchByProduct`, trường `ruling` của response). Bằng chứng `kind = 'ruling'` (công văn phân loại) vẫn vào prompt kèm nhãn thẩm quyền như spec. Riêng **dòng case** (`meta.case_id`) chỉ vào khi `meta.ahtn_2022.trang_thai` bắt đầu bằng `hien_hanh` và `hs_heading` là một nhóm ứng viên; `gather` thêm dòng case theo `hs_heading` với bộ lọc đó. Case không có căn cứ chỉ được nói "công văn kết luận …", không "Hải quan lập luận rằng …".
- **D3(a) theo độ sâu:** walkthrough `depth = full` → runner in khối thuế gọn (`formatAnswer`, `candidate: true`, không xanh) cho các mã `tariff_ref`, tối đa 2; `depth = brief` → không khối, một câu gợi ý gửi mã kèm xuất xứ.
- **`policyRows` và pin `annex_table`/provision** mang trong `meta`: `hs_codes` (chuẩn hoá, giữ cấp cha), `document_number`, `anchor` (tên phụ lục hoặc nhãn điều khoản), `effective_from`, `effective_to`, `effectiveness`, `verification`. `policyStatus(registry, rows, code, asOf)` trả **mảng** `{listId, status, instrument, annex, quote, rowId}` — một kết quả cho mỗi danh mục áp dụng tại `asOf`; registry `db/seed/data/legal/policy-lists.json` do c8 giữ.

**Đã làm trước khi có kế hoạch** (các Việc liên quan chỉ còn phần thiếu):
- `a37c663` (deploy): câu hỏi không bao giờ ghi sổ; `codebook` che đủ cách viết + NFD; `namedHeadings` không đọc số tiền/giờ (phát hiện rà #1, #3, #5).
- `8b8d6c5`: pin trả cả mục, khớp tiền tố mã và `also_headings`.
- `1f567bd` `answer/types.ts` + stub `walkthrough.ts` (thay `answer.types.ts` ở §7).
- `b43cd82` `answer/guards.ts`: `splitSentences`, `ratesInProse`, `settlementClaims` (bắt cả "phải xét 38.24" không có "vào"), `userCodesIn`, `unknownCitations`, `quoteInBody` — Việc 7 còn `verify()`, G2–G5 đầy đủ, `numberMarkers` có `opts`.
- `e70a53e` `answer/claude.ts`: `runClaude(prompt, {timeoutMs, effort, model})`, `claudeArgs`, `firstJson`; `legal.generation.ts` dùng chung — Việc 4 còn `--system-prompt`, `--output-format json`, cờ tắt tool, `cwd` tạm, semaphore 2.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 1. Mục tiêu

Lời chủ dự án ngày 2026-09-14:

> "cuối cùng, yêu cầu của tôi vẫn chưa được thực hiện, tôi muốn bot có tính người hơn, có suy nghĩ và phân tích câu hỏi, có thể chậm 1 chút cũng được, hiện tại đang quá máy móc, rập khuôn về câu trả lời"
>
> "không phải lúc nào user hỏi cũng sẽ là hỏi thuế và hscode, hãy làm cho bot zalo thực sự hiểu nội dung và linh động trong câu trả lời"
>
> "khi user cần thêm thông tin, chú thích cũng như cách suy luận để giải nghĩa cho hscode thì cũng thực sự đọc và phân tích, hãy suy nghĩ thay vì bắt keyword và trả lời 1 cách máy móc như ctrl + F"

Diễn ra việc cần làm:

- **Câu trả lời đọc như một đồng nghiệp đã phân tích câu hỏi.** Cụ thể:
  - khi câu chữ khác nhu cầu thật thì nói lại câu hỏi thật;
  - lập luận từ nguồn;
  - nói rõ chỗ chưa chắc và dữ kiện nào sẽ quyết;
  - độ dài và bố cục theo câu hỏi;
  - không có câu mở, câu kết hay chân trang cố định.
- **Không nới quy tắc nào từ R1 đến R18.** Mức thuế, mã HS, số hiệu văn bản, ngày và khẳng định hiệu lực vẫn do code cưỡng chế.
- **Chậm hơn thì được, nhưng có trần:** p95 không quá 120 s (ADR 2026-09-13).

**Vì sao bot còn máy móc (đã đọc code ở `a37c663`):**

| Người đọc thấy | Nguồn gốc |
|---|---|
| Câu hỏi "mã này dùng được không" nhận về một chồng câu mẫu | `answerCodeCheck` (`apps/zalo-bot/answer.mjs:207-280`). Có 6 câu do code viết ("Mã X bạn tham khảo thuộc nhóm…", "Danh mục mô tả mã này", "Căn cứ phân loại", "Đây là gợi ý để đối chiếu…"). Văn xuôi của mô hình nằm kẹt giữa. |
| Mô hình không đọc câu người hỏi | `/legal` nhận câu hỏi do bot ghép (`answer.mjs:223` "…Các nhóm ứng viên cần phân biệt: 38.24, …"). Prompt `legal.generation.ts` là prompt hỏi–đáp pháp luật. |
| Câu tìm mã và câu tra thuế không có văn xuôi | `tariffByClues` (`answer.mjs:93-198`) và `formatAnswer` (`format.mjs:108-259`) là đường tất định. `lead` của router bị `sanitizeLead` chặn hết dữ kiện. |
| Khối nguồn dài hơn câu trả lời | `formatLegal` + `excerpt` (`format.mjs:297-367`): mỗi nguồn in 140–480 ký tự đầu, dù văn xuôi không dùng đoạn đó. |
| Chân trang lặp | "trả lời "đúng"/"sai"" (`format.mjs:255`), "Chốt mã đúng: nhắn…" (`answer.mjs:187`), "Đây là gợi ý…" (`answer.mjs:260`) |
| Định tuyến bằng lưới regex | `legalAboutCode` (`index.mjs:153`) chạy trước router; `asksCodeFit` (`index.mjs:179`) không gập dấu; `hs_hints` đổi giữa các lần chạy |
| "hi" bị hiểu là tên hàng | Log thật: "Mình chưa tìm được mã HS phù hợp cho hi". Không có router thì `fallbackIntent` rơi vào `tariffByClues`. |
| Văn bản đã hết hiệu lực vẫn được nói là còn | Log thật: "Có, Nghị định 69/2018/NĐ-CP hiện vẫn còn hiệu lực" (trước lớp `dropInForceClaims`) |

File `format-cau-tra-loi.md` (chưa track) là đầu ra của một công cụ bên ngoài.
- **Lấy:** khung phân tích dữ kiện hàng → nhóm cạnh tranh → loại trừ theo chú giải → GRI → hồ sơ cần bổ sung.
- **Không lấy:** "HS đề xuất" một mã, "Mức độ tin cậy 95%", thuế suất và VAT do mô hình gõ (phạm R1, R2, R3).
- File có số điện thoại của bên thứ ba và repo là public, nên **không commit**.

## 2. Kiến trúc chốt

### 2.1 Luồng một lượt

```
Zalo ─► bot respond()
  0  "xác nhận văn bản …"                                        tất định, giữ nguyên
  1  fastPath: nạp · đúng/sai · đính chính tường minh · lời chào    0 LLM
  2  ảnh ─► claudeVision (caption bỏ chữ số) ─► tariffByClues        Việc 16: ─► /answer chế độ hs
  3  isBareLookup ─► answerByHs ─► formatAnswer                     0 LLM
  4  POST /answer {q, quote, context, planOnly: true}
       API plan.ts: maskCodes → assertNoUserCodes → claude #1 → normalizePlan
                    codeRole + userCodes (code) · scope() tìm văn bản thiếu (SQL)
       ◄─ {plan, codeRole, userCodes, ack, missingDoc}
  5  bot guardIntent (R13) ─► nhánh tất định: tariff · general · confirm/correction
                             · offer · provision · missingDoc · needsGoods
  6  sắp soạn văn xuôi → bot gửi ack (quote câu hỏi)
  7  POST /answer {q, quote, context, plan, forceIntent?, deadlineAt}
       gather() ≤ 3 truy vấn (code) → compose claude #2 → guards (code)
       → repair claude #3 (khi có vi phạm và còn giờ) → cắt câu
       ◄─ {answerMd, citations, candidates, userCodes, missingFacts, warnings, cut, calls, timingMs}
  8  bot formatAnswerMd(res) [+ formatAnswer khi mixed] ─► render()
```

- **Bot không phải agent tự do** (ADR 2026-08-14): số bước cố định, và mỗi đầu ra LLM đều qua cổng code.
- **Bước 4 và bước 7 là hai request HTTP nhưng không thêm lần gọi LLM.** Bước 7 nhận `plan` có sẵn nên bỏ qua bước 1. `guardIntent` bác kế hoạch thì cũng dùng đúng request này, kèm `forceIntent`.
- **Không có bảng mới, không có migration.**

### 2.2 Bảng định tuyến theo loại câu hỏi

`codeRole` do code quyết (§4.2), không phải mô hình.

| # | Loại câu | Ví dụ thật hoặc tiêu biểu | Quyết bởi | Đường | Lần gọi LLM |
|---|---|---|---|---|---|
| 1 | Nhận lời mời nạp văn bản | "nạp" | `fastPath` (`pendingIngest`) | `requestIngest` | 0 |
| 2 | Một từ phán quyết cho kết quả tra thuế còn mới | "đúng", "sai" | `fastPath` | `handleConfirm` | 0 |
| 3 | Đính chính tường minh, không phải câu hỏi | "sai rồi, HS đúng là 7326.90.99"; "HS đúng là 8422.90.90" sau câu trả lời ứng viên | `fastPath` + cue tường minh | `handleCorrection` | 0 |
| 4 | Lời chào | "hi", "chào bot" | `fastPath` (danh sách từ) | `CAPABILITIES` | 0 |
| 5 | Tra thuế trần | "8479.89.10 thuế của hscode này", "thue nk 84818099 tq" | `isBareLookup` (gập dấu, thêm "hscode", "này") | `answerByHs` → `formatAnswer` | 0 |
| 6 | Ảnh | — | nhánh ảnh | `claudeVision` → `tariffByClues`; sau Việc 16 là vision → compose hs | 1 (sau Việc 16: 2–3) |
| 7 | Hỏi bot làm được gì | "bot làm được gì" | kế hoạch `general` | `formatGeneral(plan.reply)` | 1 |
| 8 | Hỏi tiếp thuế của mã vừa tra | "còn từ Nhật thì sao" | kế hoạch `tariff` + `reuseLastHs` | `answerByHs` | 1 |
| 9 | Có mã và hỏi thuế, câu chưa trần | "cho mình hỏi thuế 8481.80.99 bao nhiêu vậy" | kế hoạch `tariff`, vai `key` | `answerByHs` | 1 |
| 10 | Có mã, đính chính hoặc xác nhận ngầm, không có cue | "63079090 mới đũng" | kế hoạch `correction` + tin có mã | `codeOffer`: một câu mời, **không ghi sổ** (§6.3) | 1 |
| 11 | Tìm mã cho hàng mô tả | "hs code Hộp cách ly nhiễu RF"; "HS Code của máy này" sau mô tả máy kiểm tra điện trở | kế hoạch `hs` | **compose chế độ hs** | 2–3 |
| 12 | Tinh chỉnh bằng dữ kiện mới | "chỉ là hộp vải có chức năng cách ly nhiều RF" | kế hoạch `refine`, `refines: true` | compose hs, có lượt trước | 2–3 |
| 13 | "Mã của tôi có hợp với hàng không" | câu ảnh chụp: miếng dán ngải cứu + 30051010 | `codeRole = premise` ép `hs` | **compose hs**; mã người dùng chỉ so bằng code | 2–3 |
| 14 | Hỏi nghi ngờ một mã mà luồng chưa có mô tả | "8481.80.99 có sai không ạ" (sau tra thuế trần) | premise, `goods.facts` rỗng | `needsGoods`: hỏi mô tả, không ghi sổ | 1 |
| 15 | Giải nghĩa mã hoặc nhóm | "3005.10.10 gồm những hàng gì, khác 3005.90 chỗ nào" | `subject` + kế hoạch `legal` | compose legal; ghim chú giải của nhóm | 2–3 |
| 16 | Mã thuộc danh mục pháp lý nào | "Mũ bảo hiểm mã 6506.10.10 thuộc danh mục rủi ro nào theo Thông tư 36/2026?" | `subject` + kế hoạch `legal` | compose legal; ghim `hsCodeSections` | 2–3 |
| 17 | Văn bản còn hiệu lực không | "Nghị định 69/2018/NĐ-CP còn áp dụng không" | kế hoạch `status` | compose status; ghim `namedStatus` | 2–3 |
| 18 | Nội dung pháp luật | "Thời hạn nộp thuế đối với hàng nhập khẩu là bao lâu?" | kế hoạch `legal` | compose legal | 2–3 |
| 19 | Xin nguyên văn một điều | "cho mình nguyên văn Điều 18 NĐ 08/2015" | `scope.article` + cue "nguyên văn/toàn văn" | `legalProvision` → `formatProvisions` | 1 |
| 20 | Văn bản kho không có | "thông tư 36 của bộ KHCN" | `scope()` trong `planOnly` | `formatMissingDoc` + `pendingIngest` | 1 |
| 21 | Hỏi thuế kèm câu hỏi pháp lý | "thuế 8481.80.99 TQ, có phải kiểm tra chuyên ngành không" | kế hoạch `mixed`, vai `subject` | compose phần pháp lý; khối `formatAnswer` in bên dưới | 2–3 |
| 22 | "không phải / sai rồi" sau một câu văn xuôi | "không phải cái đó" | `refine` theo chủ đề | chạy lại chế độ cũ; **không bao giờ ghi sổ** | 2–3 |
| 23 | Không có LLM, timeout hoặc `is_error` | bất kỳ | `defaultPlan` (code) | xem dưới bảng | 0 |

**Hàng 23, `defaultPlan` chọn theo thứ tự:**
1. Có mã và có cue FIT → một câu thật: "Mình chưa đọc được chú giải lúc này…". **Không in khối thuế.**
2. Có mã → `answerByHs`.
3. Có số hiệu văn bản chắc chắn → chỉ trả nguồn.
4. Còn lại → tìm theo từ khoá bằng `tariffByClues`.

**Vì sao câu tra thuế vẫn tất định:**
- Người hỏi mức thuế cần đúng con số ngay; `formatAnswer` đã mang điều kiện, nghị định và ngày (R6, R7).
- Soạn văn xuôi sẽ thêm khoảng 60 s và đưa con số vào đầu ra của mô hình mà không được gì thêm.
- Phần "tính người" ở đây đến từ việc gọn chân trang (D3).

### 2.3 Lần gọi LLM, model, effort, trần và độ trễ

| # | Bước | Khi nào | Model / effort | Trần |
|---|---|---|---|---|
| 1 | plan | mọi tin không đi đường tắt | `sonnet` / `low` (hằng số) | 30 s |
| 2 | compose | `hs`, `legal`, `status`, `mixed` và có bằng chứng | `ANSWER_COMPOSE_MODEL` / `ANSWER_COMPOSE_EFFORT`. Khởi điểm `opus` / `high`, chốt ở Việc 2 và 14 (D2) | min(100 s, `deadlineAt` − now − 5 s) |
| 3 | repair | chỉ khi guards có vi phạm **và** đã trôi dưới 90 s | `sonnet` / `low` | min(30 s, `deadlineAt` − now − 3 s) |
| 4 | vision | chỉ khi có ảnh; thay bước #1 (Việc 16) | như hôm nay | 45 s |

**Cờ gọi CLI.** Mọi lần gọi đều dùng:
- `--system-prompt <hằng số>` và `--output-format json` (đọc các trường `result`, `is_error`, `duration_ms`);
- cờ tắt tool mà `claude --help` của CLI 2.1.270 liệt kê (xác minh ở Việc 2);
- `cwd` là một thư mục tạm rỗng, prompt đi qua stdin.

**Giới hạn.**
- Tối đa 2 tiến trình `claude` cùng lúc trong API, vì server dùng chung. Tiến trình thứ ba xếp hàng, và thời gian chờ tính vào hạn.
- `deadlineAt` là lúc bot nhận tin + 120 s. API kẹp giá trị này về không quá now + 120 s.
- Tối đa 3 lần gọi cho một tin chữ, 3 lần cho ảnh. Nằm trong ngân sách 4 lần của ADR.

| Bước | Dự kiến p50 (Việc 14 đo lại) |
|---|---|
| Đường tắt, tra thuế trần | < 1 s |
| #1 plan (prompt đã che mã, khoảng 4–6k token) | 8–20 s |
| Gửi ack | khoảng 10–20 s sau tin nhắn |
| `gather` (≤ 3 truy vấn song song: embed + SQL) | 1–4 s |
| #2 compose (≤ `ANSWER_PROMPT_CHARS`, khởi điểm 40.000 ký tự) | 35–80 s |
| guards | < 0,2 s |
| #3 repair (chỉ các câu vi phạm) | 10–20 s |
| **Tổng một câu soạn** | **p50 60–80 s; cổng p95 ≤ 120 s** |

**Nếu p95 vượt 120 s, xử lý theo thứ tự:**
1. Hạ effort.
2. Hạ `ANSWER_PROMPT_CHARS`.
3. Giảm còn 2 truy vấn.
4. Nếu vẫn vượt thì chủ dự án quyết (D6).

Không bao giờ bỏ guards.

### 2.4 Hợp đồng `POST /answer` (bản thu gọn của spec §3.1)

Yêu cầu:

```json
{ "q": "tin nhắn mới", "quote": "tin được reply hoặc null", "asOf": null, "planOnly": false,
  "context": { "topic": "tariff|legal|general|null", "state": {}, "turns": [{ "role": "user|bot", "body": "…" }] },
  "plan": null, "forceIntent": null, "deadlineAt": null }
```

Đầu ra của bước kế hoạch, sau `normalizePlan`:

```json
{ "intent": "tariff|hs|legal|status|mixed|general|confirm|correction|refine",
  "understanding": "≤ 30 từ: người hỏi cần gì; không chữ số, trừ số hiệu văn bản họ đã viết",
  "question": "câu hỏi độc lập, ghép ngữ cảnh; mã HS là [mã n]",
  "queries": ["tối đa 2 cách diễn đạt khác, một câu viết như câu trả lời giả định"],
  "goods": { "facts": ["chỉ điều người dùng đã viết"], "missing": ["dữ kiện còn thiếu có thể quyết định nhóm"] },
  "refines": false,
  "scope": { "doc": null, "article": null, "clause": null },
  "keywords": [], "hsHints": [], "origin": null, "date": null,
  "reuseLastHs": false, "verdict": null, "reply": null }
```

Kế hoạch không có `lead`, `note` hay `search_query`. Chữ duy nhất người đọc thấy là `reply` (khi `general`) và `understanding` (ack), cả hai đều qua `sanitizeLead`.

Trả về:

```json
{ "plan": {}, "codeRole": "none|premise|subject|key", "mode": "hs|legal|status|mixed|null",
  "userCodes": [{ "code": "3005.10.10", "level": 8, "heading": "30.05", "exists": true, "inCandidates": true }],
  "ack": "…", "answerMd": "…[1]…",
  "citations": [{ "n": 1, "key": "e:812", "kind": "en", "label": "…", "instrument": "…", "hsHeading": "30.05",
                  "quotes": ["nguyên văn đã dùng"], "authority": "authoritative", "note": "…", "verification": "…",
                  "window": "current", "expired": null, "effectiveness": "…", "documentNumber": "…", "url": null }],
  "candidates": [{ "hs": "30.05", "level": 4, "title": "<hs_description.heading>", "evidence": [1] }],
  "ruling": null, "missingFacts": ["…"], "coverage": "full|partial|none",
  "warnings": ["unverified", "undetermined", "upcoming", "old_catalog"],
  "cut": 0, "repaired": false,
  "missingDoc": null, "gazetteMatchKind": "none", "gazetteMatches": [],
  "calls": 2, "timingMs": { "plan": 0, "retrieve": 0, "compose": 0, "verify": 0, "repair": 0 } }
```

**Nguồn tái dùng (Việc 8).** `LegalService` tách thành:
- `scope(query, doc)`: phần tìm văn bản và Công báo ở `legal.service.ts:147-225`;
- `gather(query, {asOf, doc, article, hsCodes, headings, clauses})`: phần truy hồi ở `:227-272`.

`ask()` = `scope` + `gather` + `generate` như hiện nay, nên hợp đồng `GET /legal` không đổi và baseline eval còn so được.

**`answer.service`:**
- **Truy vấn:** `unique([plan.question, ...plan.queries]).slice(0, 3)`, chạy song song. Chỉ truy vấn đầu mang pin.
- **Nhóm được ghim:**
  - chế độ hs: `plan.hsHints` đổi thành tối đa 5 nhóm có chấm (giả thuyết mù) và `clauses: 0`, tức không lấy điều luật;
  - vai subject: nhóm của chính mã.
- **Mã premise của người dùng không bao giờ thành pin** (D1).
- **Gộp và cắt:** gộp theo `key`, mục ghim đứng trước, rồi xếp theo `bestDist`. Tối đa 12 nguồn và `ANSWER_PROMPT_CHARS`. Citation giữ nguyên thân để kiểm quote.

### 2.5 Lệch khỏi spec `bot-answer-parity-design.md` (ghi vào ADR ở Việc 0)

| Spec | Kế hoạch này | Vì sao an toàn |
|---|---|---|
| §2.2.1 / ADR QĐ 4: mục `tariff` được vào văn xuôi | **Không** ở v1. Câu có mức thuế trong văn xuôi bị cắt; khối thuế tất định in bên dưới | Chặt hơn R1 và R6 |
| §3.8: in khối thuế của ứng viên đầu | Không in (D3) | Người hỏi mã chưa hỏi thuế; muốn xem thì nhắn mã kèm xuất xứ |
| §3.6 kiểm 3: mọi số neo trong `quote` | Nhóm hoặc mã HS, số hiệu văn bản và nhãn Điều được neo trong `quote` **hoặc nhãn** của `[n]` cùng câu. %, tiền, ngày, thời hạn chỉ neo trong `quote` | Nhãn là dữ liệu DB ("… · nhóm 30.05"), không phải chữ mô hình. Quote vẫn phải là chuỗi con của thân thì citation mới sống (R10) |
| §3.1: một `quote` | `quotes[]` | Một mục thường đỡ hai câu khác nhau |
| §3.3–3.4: `retrieve.ts`, `expand.ts`, đa dạng hoá, trần 40k token | Dùng lại `gather()` và trần ký tự | Chỉ ảnh hưởng recall, không làm sai dữ kiện; thêm khi `expectEvidence` trượt |
| §3.6 `note_only`, `decision_log`, `GET /evidence/:id` | Hoãn. Mỗi lượt ghi một dòng log JSON không chứa chữ người dùng | Nhãn thẩm quyền vẫn in từ dữ liệu; không có gì đọc `decision_log` |
| §3.7: gửi "🔍 Đang tra…" ngay | Ack nói lại câu hỏi, gửi sau bước kế hoạch, không emoji | Trễ hơn khoảng 10 s nhưng cụ thể; không hứa đọc khi không soạn |
| §5: `parseQuery` bắt "nhóm dddd" để đi đường ứng viên tất định | `codeRole` theo cue, câu hỏi hợp mã đi compose | R4 giữ bằng che mã + `assertNoUserCodes` (§4.2) |
| §3.2: kế hoạch không có trường dữ kiện hàng | Thêm `understanding`, `goods`, `refines` | Dữ kiện lọc bằng code theo chữ người dùng |

## 3. Giọng và lập luận

### 3.1 System prompt của compose (hằng số trong `compose.ts`, tóm tắt)

```text
VAI
Bạn là chuyên viên hải quan nhiều năm kinh nghiệm, đang nhắn Zalo trả lời đồng nghiệp. Bạn chỉ biết những gì
nằm trong NGUỒN của lượt này; ngoài chúng ra bạn không biết gì về pháp luật, biểu thuế hay mặt hàng.

NGHĨ TRƯỚC KHI VIẾT (không in ra)
1. Người hỏi cần quyết định việc gì? Câu chữ có thể hẹp hơn nhu cầu ("mã này được không" = hàng này thuộc nhóm nào, vì sao).
2. Dữ kiện nào đã có, dữ kiện nào còn thiếu (DỮ KIỆN HÀNG).
3. Với từng nguồn liên quan: câu nào của nguồn quyết định, áp vào dữ kiện nào; thứ tự GRI và thứ bậc thẩm quyền.
4. Nguồn mâu thuẫn thì giữ cả hai hướng.
5. Kết luận đi được tới đâu: trả lời được / nghiêng về / còn mở / chưa đủ dữ kiện.

CÁCH VIẾT
- Câu đầu trả lời đúng điều người hỏi cần (có / không / chưa chốt được) và vì sao.
  Nếu câu hỏi thật khác chữ họ gõ, hoặc tin là lời đính chính, nói ngắn cách bạn hiểu ("À, là hộp bằng vải — …").
  Câu hỏi đã rõ thì không nhắc lại.
- Giải thích như nói chuyện: dữ kiện → nguồn → hệ quả. Đặt [n] ngay sau câu dựa vào nguồn n.
- Thiếu dữ kiện quyết định: nói theo điều kiện "nếu … thì …", nêu tối đa ba dữ kiện sẽ quyết, được hỏi lại một câu.
- Dài vừa đủ: hiệu lực văn bản 1–3 câu; nội dung điều khoản 1–2 đoạn; phân loại 2–4 đoạn ngắn, không quá khoảng 250 từ.
- Gạch đầu dòng chỉ cho các hướng song song thật. **Đậm** thuật ngữ, số hiệu, nhóm then chốt. "## " chỉ khi dài hơn 3 đoạn.
- Không chào, không kết, không mời hỏi thêm, không emoji, không bảng, không "Theo quy định của pháp luật…".
- Không liệt kê lại ứng viên, nguồn, cảnh báo, khối thuế: hệ thống in chúng bên dưới. Xưng "mình", gọi "bạn".

QUY TẮC CỨNG (code kiểm lại từng điều)
- Mọi ý nằm trong nguồn; kho không có thì nói kho chưa có.
- Con số, ngày, số hiệu, Điều/khoản, mã/nhóm HS chỉ viết khi chép đúng từ quotes hoặc nhãn của [n] trong chính câu đó.
- Không nêu thuế suất, VAT, phần trăm thuế. Không nêu "độ tin cậy". Không viết "phải xét/chắc chắn/chốt/đề xuất" + mã hay nhóm.
- Không đưa một mã 8 số làm đáp án cho hàng người hỏi mô tả.
- Nguồn "không phải căn cứ pháp lý" chỉ để giải thích. "CHƯA CÓ HIỆU LỰC" phải nói ngày.
  "ĐÃ HẾT HIỆU LỰC từ …" là sự kiện: không bao giờ viết văn bản đó còn hiệu lực.

QUY ƯỚC ĐỌC BẰNG CHỨNG (spec §3.5, chép từ render_notebook.py)
Thứ tự GRI bắt buộc; Chú giải 1 của Phần là loại trừ; Chương 98 có điều kiện; công văn chỉ đúng cho mặt hàng và
hồ sơ nó nêu; SEN không tự ràng buộc; mã trong công văn cũ mang nhãn danh mục cũ; NĐ 201/2026 sửa Biểu XK chưa nạp.

CHẾ ĐỘ hs
- candidates 1–3 ở cấp nhóm 4 số (sâu hơn chỉ khi quote nêu nguyên mã); mỗi ứng viên ≥ 1 [n] là chú giải, SEN,
  công văn nói về nhóm đó. Nêu tiêu chí phân biệt và dữ kiện nào của hàng quyết định.
- Từ 2 ứng viên trở lên thì missingFacts không được rỗng.

TRẢ VỀ đúng một JSON:
{"answerMd":"…","citations":[{"n":1,"quotes":["nguyên văn ≥ 20 ký tự"]}],
 "candidates":[{"hs":"30.05","evidence":[1]}],"missingFacts":["…"],"coverage":"full|partial|none"}
```

**Vì sao dùng `--effort`:** phần "có suy nghĩ" nằm trong ngân sách suy luận ẩn của model, còn đầu ra chỉ là câu trả lời.

### 3.2 User prompt của compose

```text
NGÀY ÁP DỤNG: 2026-09-14 · CHẾ ĐỘ: hs
NGUYÊN VĂN TIN NHẮN (đã che mã; vai premise: bỏ cả nhãn): "e có măt hàng miếng dán bàn chân thành phần từ ngải cứu, …"
NGƯỜI HỎI CẦN: <plan.understanding>
CÂU HỎI THẬT: <plan.question>
DỮ KIỆN HÀNG: đã có — miếng dán bàn chân; thành phần ngải cứu · còn thiếu — có tẩm dược chất không; công dụng ghi trên nhãn
LƯỢT TRƯỚC: <state.answer.question>                            (chỉ khi plan.refines)
SỰ KIỆN ĐÃ XÁC ĐỊNH TỪ DỮ LIỆU (không được mâu thuẫn): - …
HỆ THỐNG IN RIÊNG BÊN DƯỚI, ĐỪNG VIẾT LẠI: danh sách ứng viên · khối thuế · cảnh báo · nguồn
NGUỒN:
[1] <label>
(<note · window>)
<thân, cắt theo ANSWER_PROMPT_CHARS>
---
```

**Compose không nhận transcript.** Nó chỉ nhận `plan.question` (đã ghép ngữ cảnh), lượt trước dạng đã che, và dữ kiện hàng. Như vậy không còn đường nào để mã người dùng ở lượt cũ lọt vào.

### 3.3 Dữ kiện tất định đến compose thế nào

| Dữ kiện | Code tạo ra ở đâu | Vào prompt | Ra màn hình |
|---|---|---|---|
| Hết hoặc sắp hết hiệu lực | `evidenceSource` so với ngày hỏi | "SỰ KIỆN ĐÃ XÁC ĐỊNH" + nhãn dưới nguồn | dòng đỏ từ `citation.expired` |
| Thẩm quyền, văn bản bot tự nạp | `AUTHORITY_NOTE`, `verification` | nhãn dưới nguồn | nhãn trên dòng nguồn (in một lần); một dòng cam (R18) |
| Mức thuế, điều kiện FTA | `/tariff` | **không** (chỉ dòng "HỆ THỐNG IN RIÊNG") | `formatAnswer` bên dưới (mixed) |
| Tên và sự tồn tại của nhóm ứng viên | `hs_description` (`hs_code LIKE 'dddd%'`, bảng chỉ có mã 8 số) | không | dòng ứng viên |
| Mã người dùng nêu | `userCodes` (code) | không (premise, key); nguyên văn (subject) | một câu so sánh do code viết |
| Phán quyết người đã xác nhận | `ConfirmationService.matchByProduct` | không | một dòng, chỉ khi mã nằm trong nhóm ứng viên |
| Danh mục kho | `LegalService.documents()` | chỉ prompt kế hoạch | — |

### 3.4 Ba ví dụ tin Zalo

**Ký hiệu:**
- `**x**` là đậm;
- `{nhỏ: x}` là chữ nhỏ nghiêng, `{đỏ: x}` và `{cam: x}` là màu;
- `•` là dòng danh sách của Zalo;
- `‹…›` là chữ phải lấy từ bằng chứng hoặc dữ liệu lúc chạy; guards đòi đúng nguyên văn thật.

Các nhóm 30.04, 30.05, 38.24, việc Chú giải Chương 30 loại trừ 33.03–33.07, và việc EN 30.05 tách 3005.10 (loại có lớp dính) đều là những gì các lần chạy khô ngày 14/09 đã đọc được (`02-progress.md`).

#### Ví dụ 1: câu ảnh chụp (hàng 13, D1 mặc định)

> Người dùng: "e có măt hàng miếng dán bàn chân thành phần từ ngải cứu, e đang tham khảo mã này không biết được không ạ 30051010 …"

**Tin 0 (ack, quote câu hỏi, khoảng 15 s):**

```text
Bạn đang muốn biết miếng dán bàn chân ngải cứu có khai được vào mã bạn tham khảo không — mình đọc chú giải các nhóm liên quan rồi trả lời, khoảng một phút nhé.
```

**Tin 1 (khoảng 60–85 s, một tin):**

```text
Chỉ từ "miếng dán bàn chân, thành phần ngải cứu" thì mình chưa chốt được nhóm: chỗ quyết định không phải nguyên liệu mà là miếng dán **có tẩm dược chất và được trình bày để dùng cho y tế** hay không.

• Nếu có — nhãn ghi công dụng chữa bệnh, hoạt chất tẩm vào miếng dán có lớp dính — thì đó đúng dạng hàng Chú giải chi tiết nhóm **30.05** mô tả, và loại có lớp dính tách riêng ở phân nhóm **3005.10** [1].
• Nếu ngải cứu chỉ để làm ấm, tạo mùi, "chăm sóc bàn chân" mà không trình bày cho mục đích y tế, thì Chú giải Chương 30 loại khỏi chương các chế phẩm thuộc nhóm 33.03 đến 33.07 [2]; khi đó phải xét tiếp theo ‹tiêu chí trong nguồn›, trong đó có nhóm **38.24** [3].

Bạn xem giúp mình hai điểm: nhãn hoặc hồ sơ có ghi công dụng chữa bệnh không, và ngải cứu ở dạng hoạt chất tẩm vào miếng dán hay chỉ là bột thảo mộc đóng túi.

Mã **3005.10.10** bạn nêu thuộc nhóm **30.05** — nằm trong các nhóm dưới đây.
Ứng viên để chuyên viên chốt:
• **30.05** · Bông, gạc, băng và các sản phẩm tương tự… · [1]
• **38.24** · ‹tiêu đề nhóm trong hs_description› · [3]
{nhỏ: Hàng khó chốt thì có thể đề nghị hải quan xác định trước mã số.}

{nhỏ: Nguồn:}
{nhỏ: [1] Chú giải chi tiết HS 2022 · Chương 30 · nhóm 30.05 (tài liệu hướng dẫn áp dụng của cơ quan hải quan, không phải văn bản quy phạm pháp luật) — “‹câu nguyên văn đã dùng›”}
{nhỏ: [2] ‹nhãn Chú giải Chương 30› — “‹…các chế phẩm thuộc các nhóm từ 33.03 đến 33.07…›”}
{nhỏ: [3] Chú giải chi tiết HS 2022 · Chương 38 · nhóm 38.24 (như [1]) — “‹câu nguyên văn đã dùng›”}
```

**Code đã làm gì ở ví dụ này:**
- **Compose không thấy 30051010**, và prompt #1 lẫn #2 đều không có "3005" nào từ người dùng.
- **Neo số liệu:**
  - "3005.10" phải nằm trong quote [1];
  - "33.03 đến 33.07" nằm trong quote [2];
  - "30.05" và "38.24" neo vào nhãn [1] và [3].
- **Nếu bản nháp viết "phải xét 38.24"** thì G4 đánh vi phạm → repair → vẫn sai thì cắt câu.
- **Câu "Mã … bạn nêu …" và dòng R5 do code in.** Dòng R5 chỉ in khi có từ 2 ứng viên và văn xuôi chưa nói "xác định trước".
- **So với trước:** trước là 3 tin, khoảng 65 s, 6 câu mẫu, khối nguồn 10 dòng. Sau là ack + 1 tin, 2–3 lần gọi.

#### Ví dụ 2: "8479.89.10 thuế của hscode này" (hàng 5, tất định, 0 lần gọi)

```text
Hàng hóa có mã HS **8479.89.10** (*Máy và thiết bị cơ khí có chức năng riêng…*) có thuế nhập khẩu ưu đãi thông thường (**MFN**) **0%** [1]. Mức ưu đãi đặc biệt theo FTA chỉ áp dụng khi hàng có xuất xứ từ nước thành viên và có C/O hợp lệ đúng form:
• AANZFTA (form AANZ): **0%** [2]
• ‹mỗi biểu FTA còn lại một dòng, từ /tariff›

{cam: ‹staleness.warning từ dữ liệu›}
{nhỏ: Tra theo ngày 14/09/2026 · [1] NĐ ‹số› — ‹tên biểu› · [2] NĐ ‹số› — ‹tên biểu›}
{nhỏ: Cho mình biết xuất xứ để lọc đúng biểu ưu đãi; mã khớp lô hàng thì nhắn "đúng", chưa khớp thì "sai" hoặc gửi mã đúng.}
```

- Hôm nay tin này **không** được coi là tra trần: "hscode" và "này" không có trong `LOOKUP_WORDS`, nên nó phải đợi router 45 s. Việc 3 sửa chỗ này.
- Khối thuế giữ nguyên R1, R6, R7.
- Chân trang rút còn một câu nhỏ, chỉ ở lượt tra đầu của luồng (quy tắc `showFooter` sẵn có; D3).

#### Ví dụ 3: mô tả máy kiểm tra điện trở, rồi "HS Code của máy này" (hàng 11)

- **Lượt trước:** người dùng dán mô tả máy kiểm tra điện trở bo mạch điện tử có thiết bị ghi, điện áp, năm sản xuất, hàng đã qua sử dụng (kèm model và số serial).
- **Lượt này:** kế hoạch ghép mô tả vào `question`.
  - `goods.facts` chỉ giữ chữ chức năng: "kiểm tra điện trở bo mạch", "kèm thiết bị ghi", "đã qua sử dụng".
  - Model, serial và mọi nhóm số từ 4 chữ số bị bỏ (G10).
- **Chưa có tên nhóm thật.** ‹A›, ‹B› là nhóm do bằng chứng quyết; kế hoạch này không phân loại hộ.

**Tin 0:**

```text
Bạn cần mã HS cho máy kiểm tra điện trở bo mạch vừa mô tả — mình đọc chú giải các nhóm liên quan rồi trả lời, khoảng một phút nhé.
```

**Tin 1:**

```text
Việc chính của máy là đo, kiểm tra điện trở trên bo mạch — tức là thiết bị đo hoặc kiểm tra đại lượng điện — nên hướng đầu tiên là nhóm **‹A›** [1]. Nếu nó kiểm tra theo chương trình cả mạch hở, ngắn mạch và linh kiện chứ không chỉ đo điện trở, thì ‹tiêu chí trong chú giải› kéo sang phải so thêm với nhóm **‹B›** [2].

Thiết bị ghi đi kèm chỉ đi theo máy khi ‹điều kiện về bộ phận, phụ kiện trong nguồn› [3]; nếu nó dùng được độc lập thì phân loại riêng.

Để chốt, bạn cho mình biết: máy chỉ đo điện trở hay kiểm tra cả mạch; thiết bị ghi có dùng độc lập được không. Còn điều kiện nhập khẩu hàng đã qua sử dụng thì kho văn bản mình đang có chưa có căn cứ, nên mình chưa trả lời phần đó.

Ứng viên để chuyên viên chốt:
• **‹A›** · ‹tiêu đề nhóm› · [1]
• **‹B›** · ‹tiêu đề nhóm› · [2]
{nhỏ: Hàng khó chốt thì có thể đề nghị hải quan xác định trước mã số.}

{nhỏ: Nguồn:}
{nhỏ: [1] ‹nhãn nguồn› — “‹câu nguyên văn›”} …
```

- Câu "kho chưa có căn cứ" chỉ xuất hiện khi truy hồi không có nguồn cho phần đó. Có nguồn thì phần đó được trả lời, kèm `[n]`.
- Model và serial không bao giờ vào prompt compose, `state`, hay log.

## 4. Rào chắn bằng code

### 4.1 Quy tắc → rào chắn → test

| # | Quy tắc | Hỏng mà nó chặn | Rào chắn (`apps/api/src/modules/answer/guards.ts` trừ khi ghi khác) | Test chứng minh |
|---|---|---|---|---|
| G1 | R1, R6 | "MFN là 0% [1]" trong văn xuôi | Câu có (`thuế suất`, `MFN`, `ưu đãi`, tên FTA) kèm `\d+%` thì bị cắt. %, tiền không neo trong quote cùng câu thì bỏ cả văn xuôi, chỉ trả nguồn | `guards.spec`: "MFN là 0% [1]" bị cắt; "Đúng, 5% [1]" với thân chỉ có 10% → `answerMd` rỗng |
| G2 | R10 | `[n]` bịa, quote là diễn giải | `n ∈ 1..k`. Mỗi quote, sau chuẩn hoá (NFC, gộp khoảng trắng, không phân biệt hoa thường, bỏ dấu câu ở mép), phải là chuỗi con của thân. Citation không còn quote nào thì gỡ mọi `[n]` trỏ tới nó | quote không phải chuỗi con → `[n]` biến mất |
| G3 | R10 | Số liệu đứng cạnh một nguồn không chứa nó | `numberMarkers` với tùy chọn `{cut: true, labels}`. Theo từng câu: %, tiền, ngày, thời hạn neo trong quote; số hiệu văn bản, nhóm/mã HS, "Điều/khoản/điểm N" neo trong quote **hoặc nhãn**; chỗ người dùng tự viết thì miễn (không bao giờ miễn cho mã premise, không bao giờ cho %/tiền). Câu không neo được thì cắt. Mặc định của `/legal` không đổi | "…điểm b khoản 4 Điều 97 NĐ 37/2026/NĐ-CP [1]" qua khi quote có, bị cắt khi quote thiếu "Điều 97"; "Nhóm 30.05 chỉ nhận … [1]" qua nhờ nhãn; "NĐ 336/2026 thay thế NĐ 85/2019 [1]; kho không có quan hệ nào với NĐ 08/2015" qua (08/2015 do người dùng viết); `legal.grounding.spec` cũ vẫn xanh |
| G4 | R3, R5 | "chưa rõ công dụng → phải xét 38.24" (log 14/09) | Câu không có `nếu\|khi\|trường hợp\|trừ khi\|tùy` mà ghép `phải\|chỉ có thể\|chắc chắn\|nên\|đề xuất\|chốt` (kèm tùy chọn `xét\|khai\|áp\|vào\|là\|thuộc`) với một mã/nhóm → vi phạm. Có "độ tin cậy" → vi phạm. Từ 2 ứng viên mà `missingFacts` rỗng → vi phạm, chỉ để kích repair | câu thật bị cắt; "phải xét vào 38.24" bị cắt; "nếu có tẩm dược chất thì xét 30.05 [1]" qua |
| G5 | R2 | Mã 8 số trần, ứng viên không có căn cứ | 1–3 ứng viên. Mỗi ứng viên cần một `[n]` còn sống có kind ∈ {`en`, `sen`, `hs_note`, `gri`, `ruling`, `guidance`, `annex_table`}, thoả một trong: `hs_heading` bằng nó, `hs_codes` bắt đầu bằng nó, hoặc quote/nhãn chứa dạng có chấm. Phải tồn tại trong `hs_description`. Cấp 8 số chỉ khi quote của ruling hoặc annex nêu nguyên mã. Mã 8 số trong văn xuôi phải là ứng viên | ứng viên 38.24 chỉ dựa `note` → bị bỏ; nhóm không có dòng `hs_description` → bỏ; "8422.90.90" trong văn xuôi bị cắt; "Chú giải Chương 30 loại trừ nhóm 33.07 [2]" qua khi quote [2] có 33.07 |
| G6 | R4 | Mã người dùng thành tiền đề | Xem §4.2. Thêm: ở vai subject theo cue giải nghĩa, câu `(thuộc\|vào\|áp\|phân loại vào\|khai) (mã\|nhóm) <mã hoặc nhóm người dùng>` bị cắt | `plan.spec` + `answer.service.spec`: prompt #1 và #2 không chứa chữ số của mọi cách viết trong danh sách; "miếng dán thuộc mã 3005.10.10 [1]" ở vai subject bị cắt |
| G7 | R8 | "Có, Nghị định 69/2018/NĐ-CP hiện vẫn còn hiệu lực" | `evidenceSource` so ngày → sự kiện; `dropInForceClaims` dùng lại; `formatAnswerMd` in dòng đỏ từ `citation.expired` bất kể văn xuôi viết gì | câu log thật bị bỏ; fixture status có văn xuôi "còn hiệu lực" vẫn in dòng đỏ |
| G8 | R7 | Mức thuế không kèm nghị định hay ngày | G1 giữ văn xuôi sạch mức thuế; `formatAnswer` giữ "Tra theo ngày", NĐ và dòng staleness | test render fixture mixed |
| G9 | R13 | Câu hỏi hay câu văn xuôi ghi vào sổ | Xem §6.3 | `dispatch.test.mjs` với bộ đếm `postConfirm` |
| G10 | R14 | Serial, tên, SĐT vào state, log, note của phán quyết | `normalizePlan`: bỏ khỏi `goods.facts` và `understanding` mọi nhóm số từ 4 chữ số và mẫu `SN\|S/N\|serial\|model\|lô\|SĐT`; chỉ giữ fact có đủ từ nội dung xuất hiện trong chữ người dùng; state lưu câu hỏi đã che; log một dòng không có chữ người dùng | `plan.spec`: fact "thải độc" (người dùng không viết) bị bỏ; "SN: …" bị bỏ; `answer.service.spec`: dòng log không chứa `q` |
| G11 | R18 | Văn bản tự nạp trông như đã kiểm; phán quyết cũ kéo mã lạ | `unverifiedLines` và nhãn thẩm quyền in từ dữ liệu. `ruling` chỉ trả khi mã đã xác nhận nằm trong nhóm ứng viên, và không bao giờ vào prompt | test `formatAnswerMd` |
| G12 | ADR màu | Mô hình tô màu | `md()` chỉ ra `b`, `i`, `ul`, `ol` (không đổi) | `render.test.mjs` hiện có |

**Sửa và cắt (`compose.ts`):**
- Có vi phạm và đã trôi dưới 90 s → gọi #3 với **chỉ các câu vi phạm** cùng quote của chúng: "Viết lại từng câu, chỉ dùng số, mã, số hiệu có trong quote kèm theo; không được thì trả chuỗi rỗng."
- Kiểm lại. Câu còn vi phạm thì cắt; `verify` chỉ báo `cut`, dòng "Một phần câu trả lời bị lược vì không dẫn được nguồn." do `formatAnswerMd` in đúng một lần khi `cut > 0` (chủ kế hoạch chốt 2026-09-14).
- Câu đầu bị cắt, hoặc hơn một phần ba số câu bị cắt → chỉ trả nguồn, kèm một câu thật.
- Không bao giờ gửi câu văn không có nguồn.

**Giới hạn, nói rõ:** đây là kiểm chuỗi, không phải kiểm suy diễn (R10). Một quote đúng vẫn có thể bị gắn vào một suy luận sai. Chỗ bắt được lỗi đó là phần chấm của chủ dự án (§9).

### 4.2 R4: mã do người dùng nêu

1. **Che mã** bằng `maskCodes` trong `plan.ts`: port nguyên `HS_TOKEN`, `JOINED_HEADING` và `key` của `dispatch.mjs` ở `a37c663`.
   - Chuẩn hoá NFC trước.
   - Che mọi cách viết mã 8 số, `dddd.dd(.dd)`, `dd.dd(.dd)` đứng riêng, và chữ số sau `nhóm (hàng)|mã (số)|hs (code)|chương` (có hoặc không có `:`).
   - Không che: ngày, số tiền, giờ, năm, số hiệu văn bản.
   - Áp cho tin mới, quote, lượt cũ và dòng trạng thái.
2. **`codeRole` do code quyết**, trên chữ đã gập dấu (NFD, bỏ dấu, đ→d):

   | Vai | Khi nào | Hệ quả |
   |---|---|---|
   | `premise` | Có cue FIT: `(ma\|code\|hs)[^.?!]{0,40}(duoc\|dung\|sai\|phu hop\|ok\|chuan)\s*(khong\|ko\|k\|chua\|ha\|a\|nhi)`, `vi sao\|tai sao\|sao lai`, `(ap\|vao\|thuoc\|khai\|dung\|tham khao)\s+(ma\|nhom\|code)`. **Cũng là mặc định khi không có cue nào.** | Mã bị che ở mọi nơi; nhãn `[mã n]` bị bỏ trước compose. Kế hoạch `legal`, `status` hoặc `mixed` bị ép sang `hs`. |
   | `subject` | Không có FIT, và có cue danh mục (`LEGAL_LIST_CUE` gập dấu ∪ `nhap khau duoc\|co can\|co phai`) hoặc cue giải nghĩa (`gom\|bao gom\|khac\|phan biet\|giai thich\|chu giai\|nghia la\|la gi\|nhung hang`) | Mã là khoá tra (`hsCodeSections`, `headingSections`), được viết nguyên văn trong câu hỏi. Chỉ hợp lệ với `legal`, `status`, `mixed`. |
   | `key` | Có cue thuế, không có FIT, danh mục hay giải nghĩa | Chỉ là khoá cho `answerByHs`, không vào prompt compose. Nếu kế hoạch không phải `tariff` thì xử như `premise`. |
   | `none` | Tin không có mã | — |

   - **FIT luôn thắng danh mục và giải nghĩa.**
   - **Kế hoạch chỉ được siết thêm:** vai subject có từ cue giải nghĩa mà `plan.goods.facts` không rỗng thì hạ xuống `premise`.
   - **Ca mẫu:**
     - "Xe 8703.23.51 đã qua sử dụng nhập khẩu được không" → `subject`;
     - "nhập 94054090 có phải kiểm tra năng lượng, áp mã này được không" → `premise`.
3. **Premise.** Compose chỉ nhận câu hỏi và tin nhắn đã che, không nhãn, không transcript. Pin chỉ lấy từ `hsHints` mù. Mã người dùng chỉ gặp kết quả trong `userCodes`, sau guards.
4. **`assertNoUserCodes(parts, userCodes)`** chạy trước **mọi** lần spawn.
   - Kiểm các phần: tin nhắn, quote, lượt cũ, dòng trạng thái, `question`, `understanding`, `goods`, lượt trước. **Không kiểm thân bằng chứng.**
   - Kiểm mọi cách viết (8 số, dạng có chấm, nhóm 4 số).
   - Trúng thì **bỏ phần đó**, ghi `leakDrops` vào log và chạy tiếp. Đây là chốt đóng an toàn.
5. **Ảnh.** Việc 3 bỏ các nhóm chữ số khỏi caption trước `claudeVision`. Từ Việc 16, caption đi vào `q` và được che như tin chữ.
6. **D1 mặc định là đọc chặt**: chú giải nhóm của người dùng không được ghim. Nếu chủ dự án chọn "có", probe bất biến ở §9 phải đạt trước khi deploy.

## 5. Trình bày trên Zalo

**Thứ tự một câu trả lời soạn** (`formatAnswerMd(res)` trong `format.mjs`; `render.mjs` không đổi):

1. **Tin ack riêng**, quote câu hỏi. Chỉ gửi khi sắp compose. Nội dung: `sanitizeLead(understanding, userText)` + một vế theo chế độ ("mình đọc chú giải các nhóm liên quan rồi trả lời, khoảng một phút nhé" / "mình tra văn bản rồi trả lời nhé").
2. **Văn xuôi** qua `md()`.
3. **Chế độ hs, dòng so sánh mã người dùng** (khi có `userCodes`), một câu do code viết:
   - "Mã **X** bạn nêu thuộc nhóm **Y** — nằm trong các nhóm dưới đây."
   - "…— không nằm trong các nhóm dưới đây; nếu hàng có đặc điểm khiến nó thuộc nhóm đó, bạn gửi thêm để mình đọc lại."
   - "Mã **X** không có trong Danh mục hàng hóa đã nạp."
   - Không bao giờ tô cam.
4. **"Ứng viên để chuyên viên chốt:"** + tối đa 3 dòng `**30.05** · <heading ≤ 50> · [n]` (R2). Có `ruling` thì thêm một dòng theo lời văn hôm nay (`answer.mjs:155`).
5. **Dòng R5** chữ nhỏ: chỉ khi có từ 2 ứng viên và văn xuôi chưa có "xác định trước".
6. **Chế độ mixed:** `formatAnswer(q, tariff, confirm, {showFooter: false})`, mang dòng ngày, nghị định và cảnh báo phạm vi.
7. **Dòng đỏ từ dữ liệu:** `citation.expired`, `effectLine`.
8. **Tối đa một dòng cam** (`render` gộp): unverified, undetermined, upcoming, old_catalog.
9. **Nguồn**, chữ nhỏ nghiêng, qua `sourceLines`:
   - dạng `[n] <nhãn> (<thẩm quyền>, lần sau "như [k]") — “<quote đầu còn sống ≤ 160 ký tự>”`;
   - link khử trùng lặp, tối đa 3;
   - nhãn EN giữ "(có thể gồm cả nhóm …)".
10. **Dòng "bị lược"** khi `cut > 0`.

| Thành phần hôm nay | Sau kế hoạch |
|---|---|
| `lead` của router, "Với mô tả …, mình tra được các mã ứng viên…" | Xoá |
| "Danh mục mô tả mã này", "Nhóm ứng viên theo mô tả hàng", "Căn cứ phân loại" | Xoá; thay bằng dòng ứng viên dữ liệu (mục 4) |
| "phần căn cứ bên dưới so cả nhóm này…" | Xoá (không có căn cứ; review #7) |
| Trích 480 ký tự "(trích đoạn đầu)" | Thay bằng quote đã kiểm, ≤ 160 ký tự |
| Cam "Mặt hàng có thể thuộc nhiều nhóm — cần bạn hoặc chuyên viên chốt…" | Xoá; văn xuôi nói điều đó khi đúng; R2 do dòng ứng viên và G4, G5 giữ |
| "Chốt mã đúng: nhắn "HS đúng là <mã>"…", "Muốn xem thuế, nhắn…" | Xoá khỏi câu soạn; chỉ còn trong câu mời `codeOffer` (hàng 10) |
| "Đây là gợi ý để đối chiếu… xác định trước mã số" | Thành dòng R5 có điều kiện (mục 5) |
| Tin cố định "Mình đang đọc chú giải… chờ khoảng một phút" | Thay bằng ack nói lại câu hỏi |
| "trả lời "đúng"/"sai"" trên tra thuế trần | D3: mặc định rút thành một câu nhỏ, chỉ ở lượt tra đầu của luồng; dòng lịch sử phán quyết giữ nguyên |
| Khối thuế, dòng đỏ, cam R7/R18, "Chưa nạp: …" | Giữ nguyên, từ dữ liệu |

**Kích thước:** văn xuôi 900–1.300 ký tự + ứng viên 250 + nguồn 400. Đích là ≤ 2 tin (không tính ack), `render` tách ở ranh giới đoạn, đánh `(k/n)`.

## 6. Bộ nhớ hội thoại và câu tiếp nối

### 6.1 Lưu gì

- **Lượt hội thoại:** không đổi, 20 lượt / 30 ngày (R14). Bot gửi 6 lượt gần nhất, `topic` và `state`; API chỉ che mã cho prompt kế hoạch.
- **Sau câu soạn chế độ hs:**
  - `topic: 'tariff'` (enum `conversation_topic` chỉ có tariff/legal/general, không cần migration);
  - `state.tariff = {hs: null, candidates: ['30.05', …], desc: goods.facts.join(', '), keywords, at}`.
- **Sau câu soạn legal, status, mixed:**
  - `topic: 'legal'`;
  - `state.legal = {question (đã che), asOf, citations: [{label, kind, instrument, documentNumber}] ≤ 5, missingDoc: null, pendingIngest: null}`.
- **Sau mọi câu soạn:** `state.answer = {mode, question (đã che, bỏ nhãn), goods: {facts}, at}`.
- **Không lưu mã người dùng** ở bất cứ đâu trong `state`.
- **Tra thuế trần, văn bản thiếu:** `stampTariff` và `pendingIngest` như hôm nay.
- **`loadContext`** thêm `candidatesFresh`: `hs` null, có `candidates`, còn trong `TARIFF_TTL_MS`. Khi `candidatesFresh` thì `ctx.tariff = state.tariff`, để `handleCorrection` giữ được `desc` cho note của phán quyết.

### 6.2 Câu tiếp nối

- **Đại từ, mảnh câu:** kế hoạch viết `question` độc lập.
- **"chỉ là hộp vải có chức năng cách ly nhiều RF":**
  1. kế hoạch trả `refine`, `refines: true` và `goods` đã sửa;
  2. API chạy lại chế độ hs;
  3. compose nhận LƯỢT TRƯỚC và được dặn mở bằng một câu ghi nhận đính chính ("À, là hộp bằng vải — …").
- **"nguyên văn điều đó":** `scope.article` lấy từ `state.legal.citations` → `legalProvision`.
- **"còn từ Nhật thì sao":** `reuseLastHs` → `answerByHs`.
- **Mục tiêu so sánh** chỉ lấy từ mã **có trong tin nhắn**, không bao giờ từ `ctx.tariff`. Vì vậy phát hiện "câu hỏi hợp nhóm chỉ nêu nhóm lại so mã vừa tra" không còn xảy ra.

### 6.3 Sổ `lookup_confirmation` (R13)

| Nơi ghi | Được ghi khi | Không bao giờ |
|---|---|---|
| `handleConfirm` | tin chỉ là một từ phán quyết, `topic = tariff`, `tariffFresh` (có `hs`) | sau câu soạn (`hs: null` nên không fresh) |
| `handleCorrection` | có cue phản đối hoặc đính chính, `!readsAsQuestion` (đã có ở `a37c663`), `topic = tariff`, và một trong: `tariffFresh`, `tariffReply(quote)`, hoặc (`candidatesFresh` + cue `đúng là\|mã đúng\|hs đúng` ngay trước mã) | ghi `wrong` cho ứng viên của bot; đọc "mã cũ" từ quote khi `state.tariff.candidates` có mặt |
| `/answer`, plan, compose | — | không ghi gì |

- **Tin có mã, kế hoạch `confirm` hoặc `correction`, không có cue tường minh** (ví dụ "63079090 mới đũng") → `codeOffer`, không ghi:
  > "Mã **6307.90.90** (*<heading>*) nằm trong/khác các nhóm mình vừa nêu. Muốn mình ghi nhận mã này cho *<desc>*, nhắn "HS đúng là 6307.90.90". Cần thuế thì nhắn thêm xuất xứ."
- **"HS đúng là 8422.90.90" sau ứng viên** ghi đúng một dòng `correct` với note = `desc` + `citationFrom(text)` (đã lọc PII), không có dòng `wrong`.
- **Bất biến:** đầu ra `formatAnswerMd` không bao giờ khớp `tariffReply`. Có test giữ điều này; nếu D3 thêm "MFN" vào câu trả lời ứng viên thì test đỏ.

## 7. Giữ / xoá code hiện có

**Giữ (tái dùng):**

| Nơi | Cái giữ |
|---|---|
| `apps/zalo-bot/render.mjs` | toàn bộ |
| `format.mjs` | `formatAnswer`, `confirmFooter`, `dmy`, `effectLine`, `unverifiedLines`, `sourceLines`, `formatMissingDoc`, `formatProvisions`, `formatGeneral`, `sanitizeLead` (ack, general), `formatIngest*`, `CAPABILITIES` |
| `answer.mjs` | `answerByHs`, `handleConfirm`, `handleCorrection` (+ luồng ứng viên), `answerImage`, `gatherCandidates`, `tariffByClues` (chỉ cho ảnh đến Việc 16 và khi không có LLM; bỏ `lead`) |
| `dispatch.mjs` | `CONFIRM_WORDS`, `confirmVerdict`, `DISAGREE_CUE`, `isDisagreement`, `isBareLookup` (+ gập dấu), `readsAsQuestion`, `tariffReply`, `fastPath` (+ lời chào, + cue trên luồng ứng viên), `isAcceptIngest`, `parseVerifyDocCommand`, `guardIntent` (+ `status`/`hs`/`mixed` đi thẳng, + `candidatesFresh`) |
| `parse.mjs`, `conversation.mjs`, `images.mjs` | toàn bộ (`conversation.mjs` + `candidatesFresh`) |
| `router.mjs` | `claudeVision`, `runClaude`, `normalize` (cho vision) |
| API `legal/` | `legal.retrieval.ts`; `legal.evidence.ts` (+ cột HS, + limit); `legal.grounding.ts` (`numberMarkers` thêm tùy chọn, `dropInForceClaims`, `keepRelevant`); `legal.scope.ts`; `legal.asof.ts`; `LegalService` (`documents`, `provision`, `scope`, `gather`, `ask`; export `evidenceSource`, `articleSource`, `focusOn`, `AUTHORITY_NOTE`); `EmbeddingService` |
| API `tariff/` | `ConfirmationService.matchByProduct` (export khỏi `TariffModule` nếu chưa export) |

**Thêm:**
- `apps/api/src/modules/answer/`: `answer.module.ts`, `answer.controller.ts`, `answer.service.ts`, `answer.types.ts`, `plan.ts`, `compose.ts` (compose + repair), `guards.ts`, `claude.ts`, cùng các file spec.
- Không thêm module dùng chung nào.

**Xoá:**

| Nơi | Cái xoá | Việc |
|---|---|---|
| `answer.mjs` | `answerCodeCheck`; `answerLegal`; `missingDocAnswer` (phần `pendingIngest` chuyển sang `index.mjs` bằng `missingKind`) | 13 |
| `format.mjs` | `formatLegal`, `withLead`, `excerpt` | 13 |
| `dispatch.mjs` | `HS_TOKEN`, `JOINED_HEADING`, `CODE_MARK`, `codebook`, `unmaskCodes`, `asksCodeFit`, `legalAboutCode`, `LEGAL_LIST_CUE`, `TARIFF_CUE` (chuyển sang `plan.ts`), `fallbackIntent` (thành `defaultPlan`) | 13 |
| `router.mjs` | `route`, `transcriptOf`, `stateOf`, `manifestOf`, `INTENTS` (chuyển sang `plan.ts`) | 13 |
| `api.mjs` | `legalAnswer`, `legalDocuments` | 13 |
| `index.mjs` | nhánh `legalAboutCode` (153), `check_code` (180–186), `legal` (193–217), `notify` | 12–13 |
| `legal.service.ts` | `namedHeadings` | 17 |
| `legal.generation.ts` | cả file (D5) | 17 |

**Bảy phát hiện đã xác nhận của đợt rà soát hôm nay:**

| # | Phát hiện | Trạng thái code ở `a37c663` | Trong kế hoạch này |
|---|---|---|---|
| 1 | Che mã thiếu cách viết, text NFD lọt | **Đã sửa** (HS_TOKEN rộng, NFC, `JOINED_HEADING`, có test) | Port nguyên sang `maskCodes` (Việc 5) + test không dấu, `3005 10 10`; `codebook` bot xoá ở Việc 13 |
| 2 | Câu hỏi hợp mã lọt `asksCodeFit` nên mã vào `/legal` | **Còn mở** (`index.mjs:179`, regex không gập dấu) | Vá tạm ở Việc 3 (gập dấu, dạng tắt). Lỗi thời từ Việc 12: vai mặc định `premise`, bot không gọi `/legal`, compose không có transcript |
| 3 | "8481.80.99 có sai không ạ" ghi `correct` | **Đã sửa** (`readsAsQuestion` ở `fastPath` và `index.mjs:174`, cue trong `handleCorrection`) | Giữ; thêm test cho luồng ứng viên (Việc 12) |
| 4 | Từ danh mục + câu hỏi hợp mã bỏ qua đối chiếu (`index.mjs:153`) | **Còn mở** | Vá tạm ở Việc 3 (`&& !asksCodeFit(text)`). Lỗi thời ở Việc 13: `legalAboutCode` xoá, cue FIT thắng cue danh mục |
| 5 | `namedHeadings` đọc số tiền, giờ thành nhóm | **Đã sửa** | Lỗi thời: `/answer` truyền headings có cấu trúc; hàm xoá ở Việc 17 |
| 6 | Trần 3 nhóm làm rơi nhóm của người dùng | Trần đã thành 4; `headingSections LIMIT 6` vẫn cắt chú giải chương | Việc 8: limit = headings + 2 × chapters. Lỗi thời phần còn lại: nhóm người dùng không bao giờ được ghim (D1) |
| 7 | "phần căn cứ bên dưới so cả nhóm này" không có căn cứ | **Còn mở** (`answer.mjs:236`) | Vá tạm ở Việc 3 (chỉ in khi có citation mang nhãn nhóm đó). Lỗi thời ở Việc 13: câu bị xoá, dòng so sánh chỉ nêu dữ kiện code tính |

**Phát hiện chưa xác minh gộp vào luôn:**
- caption vào vision không che mã → Việc 3;
- `legal.query` lưu cả danh sách nhóm → Việc 3, lỗi thời ở Việc 13;
- `isBareLookup` thiếu dạng không dấu → Việc 3;
- `tariffReply` từ chối câu của luồng xác nhận → đã sửa ở `a37c663`;
- `notify` gửi khi không đọc gì → Việc 12, chỉ ack khi sắp compose;
- nhãn EN mất "(có thể gồm cả nhóm…)" → Việc 3 và 11;
- lời mở "điều khoản" cho chú giải, và "bạn kiểm tra lại mã" khi tra thất bại → lỗi thời ở Việc 13.

## 8. Việc theo thứ tự

**Nhịp deploy:**
- Việc 1–3: chỉ bot.
- Việc 4–10: API, bot chưa đổi.
- Việc 11–13: bot chuyển sang `/answer`, deploy cùng lúc.
- Việc 14–15: đo.
- Việc 16–17: chỉ sau khi chủ dự án duyệt trên Zalo.

**Mỗi việc:**
- viết test trước với phần logic;
- cập nhật `02-progress.md`;
- kiểm `corepack yarn test`, `corepack yarn test:bot`, `npx tsc --noEmit -p apps/api/tsconfig.app.json` đều xanh trước commit.

### Việc 0: Chủ dự án chốt D1–D4; ghi ADR và hộp [v4] trong spec

- [ ] **File:**
  - `.agent/architecture-decisions/2026-09-14-answer-path-conversational-compose.md` (mới): các lệch ở §2.5 và câu trả lời D1–D4;
  - `.agent/docs/bot-answer-parity-design.md`: hộp **[v4]** đầu §3 trỏ sang ADR và kế hoạch 08;
  - `.agent/planning/05-bot-parity-tasks.md`: Mảng 3 trỏ sang kế hoạch 08;
  - `.agent/index.md`: thêm kế hoạch 08.
- [ ] **Chứng minh:** mọi link tương đối vừa thêm đều trỏ tới file có thật (`ls` từng đường dẫn).
- [ ] **Xong khi:** ADR ở trạng thái Accepted và ghi câu trả lời D1–D4.

### Việc 1: Chạy khô theo luồng, không ghi sổ; chụp bản "trước"

- [ ] **File:**
  - `apps/zalo-bot/dry-run.mjs`:
    - `--stdin` nhận JSON `[{thread, turns: [text…]}]`;
    - giữ `ctx` trong bộ nhớ giữa các lượt;
    - bọc `fetch`: `POST /tariff/confirm`, `/ingest/request`, `/conversation/turn` chỉ được ghi lại, không gửi đi;
    - mỗi câu trả lời in intent, số tin, ký tự, số giây, `templateHits`, `trailWrites`;
    - `import('./index.mjs')` động, chỉ chạy khi file là entry point.
  - `apps/zalo-bot/dry-run.test.mjs` (mới).
  - `fixtures/legal-golden/real-questions.json`: 10 câu thật, dạng 5 luồng, đã bỏ serial, model và tên (D4).
- [ ] **Test:**
  - `templateHits` đếm đúng trên văn bản chứa "Căn cứ phân loại", "Với mô tả", `trả lời "đúng"`;
  - bộ bọc `fetch` ghi lại một `POST /tariff/confirm` mà không gọi mạng thật.
- [ ] **Xong khi:**
  - trên server đã chạy `docker-compose exec -T zalo-bot node apps/zalo-bot/dry-run.mjs --stdin < fixtures/legal-golden/real-questions.json > .agent/local/voice-before.txt`;
  - `02-progress` ghi số tin, số ký tự và số giây của câu ảnh chụp.

### Việc 2: Đo cờ và thời gian `claude -p` trên server (không commit code)

- [ ] **Làm:**
  - `docker-compose exec -T api claude --help`: ghi dòng mô tả `--model`, `--effort`, `--system-prompt`, `--output-format` và cờ tắt tool.
  - Chạy tuần tự 5 lượt cho mỗi cấu hình:
    - `sonnet/low` với prompt cỡ kế hoạch;
    - `opus/high`, `opus/medium`, `sonnet/high` với prompt cỡ câu đối chiếu mã hôm nay (`buildPrompt`, khoảng 40k ký tự).
- [ ] **Chứng minh:** bảng trong `02-progress` gồm p50/p95, tỉ lệ đọc được JSON, `is_error`, RAM trống thấp nhất của host.
- [ ] **Xong khi:** biết tên cờ tắt tool và có số liệu để chủ dự án quyết D2.

### Việc 3: Vá tạm các lỗ R4 còn sống và mấy chỗ rẻ (chỉ bot)

- [ ] **File:**
  - `apps/zalo-bot/dispatch.mjs`:
    - `fold()` một dòng;
    - `asksCodeFit` so trên chữ gập dấu, chỉ nhận câu hỏi về chính mã, cộng dạng tắt `dc k`, `đc ko`;
    - `isBareLookup` gập dấu, thêm `hscode`, `này`;
    - `fastPath` trả `{action: 'greeting'}` cho danh sách lời chào.
  - `index.mjs`: dòng 153 thành `legalAboutCode(text) && !asksCodeFit(text)`; nhánh greeting → `CAPABILITIES`.
  - `answer.mjs`:
    - câu dòng 236 chỉ in khi có citation mang nhãn `nhóm ${dot4(own)}`;
    - `legal.query` lưu `ask`, không kèm danh sách nhóm;
    - export `captionForVision` (bỏ nhóm chữ số) và dùng trước `claudeVision`.
  - `format.mjs`: nhãn EN giữ hậu tố "(có thể gồm cả nhóm …)".
  - `dispatch.test.mjs`.
- [ ] **Test:**
  - `asksCodeFit` = true với "vi sao mieng dan ngai cuu vao ma 30051010", "mã 30051010 dùng cho miếng dán ngải cứu được ko", "miếng dán ngải cứu mã 30051010 đc k";
  - `asksCodeFit` = false với "Xe 8703.23.51 đã qua sử dụng nhập khẩu được không";
  - `respond` với "nhập 94054090 có phải kiểm tra năng lượng, áp mã này được không" (fetch giả): không có request `/legal` nào chứa 94054090;
  - "hi" trả `CAPABILITIES` và không gọi `route`;
  - "8479.89.10 thuế của hscode này" và "thue nk 84818099 tq" là tra trần;
  - `captionForVision('e tham khảo mã 30051010 được không')` không còn 30051010;
  - nhãn EN giữ "(có thể gồm cả nhóm 28.06)".
- [ ] **Xong khi:** `test:bot` xanh, bot đã deploy, commit ghi rõ các vá này bị xoá ở Việc 13.

### Việc 4: `answer/claude.ts` chạy `claude -p` có cờ, JSON, hạn giờ, tối đa 2 tiến trình

- [ ] **File:** `apps/api/src/modules/answer/claude.ts`, `claude.spec.ts`.
- [ ] **Test (Jest):** đặt một script `claude` giả lên đầu `PATH`.
  1. Envelope `{"result":…,"is_error":false,"duration_ms":…}` → `{text, isError: false, durationMs}`.
  2. `is_error: true` → `isError`.
  3. Script ngủ quá timeout → trả `null` trong vòng timeout + 1 s.
  4. Ba lời gọi script 300 ms thì không lúc nào có quá 2 tiến trình sống (script ghi file đếm).
  5. argv có `--system-prompt`, `--model`, `--effort`, `--output-format json` và cờ tắt tool; `cwd` là thư mục tạm rỗng; prompt đi qua stdin.
- [ ] **Xong khi:** Jest xanh, `legal.generation.ts` không đổi. Semaphore có comment `ponytail: global cap 2, per-thread queue if rate limits bite`.

### Việc 5: `plan.ts` phần thuần: che mã, vai mã, kiểm lọt, chuẩn hoá kế hoạch (TDD)

- [ ] **File:** `apps/api/src/modules/answer/plan.ts`, `plan.spec.ts`, `answer.types.ts`.
- [ ] **Nội dung:**
  - `fold`;
  - `maskCodes(text, book)`, port từ `dispatch.mjs` ở `a37c663`;
  - `codeRole(text, plan?)` với bảng §4.2;
  - `userCodes`;
  - `assertNoUserCodes(parts, codes)`;
  - `normalizePlan(raw, userTexts)`: tập intent, lọc `goods.facts`, G10, `scope.doc` qua bản TS của `docNumberStatedIn` + `statedDocNumber` (`parse.mjs:226-248`), `hsHints` 4–6 chữ số;
  - `defaultPlan(text, topic)`.
- [ ] **Test:**
  1. **Che** không còn chữ số của mã trong: "khai 3005.10 được không", "HS: 3005", "mã số 30.05.10.10", "nhóm hàng 3005 hay 3824", "thuộc chương 30", NFD "nhóm 3005", "3005 10 10", "vi sao mieng dan ngai cuu vao ma 30051010".
  2. **Không đổi:** "Nghị định 26/2023/NĐ-CP ngày 31/05/2023, năm 2026", "ngày 30.05 nộp 12.50% lúc 08.30 sáng, phạt 12.50 triệu", "1234.56 USD", "15.000.000 đồng".
  3. **`codeRole`:**
     - câu ảnh chụp → `premise`;
     - "Mũ bảo hiểm mã 6506.10.10 thuộc danh mục rủi ro nào theo Thông tư 36/2026?" → `subject`;
     - "3005.10.10 gồm những hàng gì, khác 3005.90 chỗ nào" → `subject`;
     - "Xe 8703.23.51 đã qua sử dụng nhập khẩu được không" → `subject`;
     - "nhập 94054090 có phải kiểm tra năng lượng, áp mã này được không" → `premise`;
     - "8481.80.99 có sai không ạ" → `premise`;
     - "miếng dán ngải cứu 30051010 gồm những gì" + `goods.facts` không rỗng → `premise`;
     - "cho mình hỏi thuế 8481.80.99 bao nhiêu vậy" → `key`.
  4. **`assertNoUserCodes`** bỏ một lượt chứa "3005.10.10", giữ dòng danh mục "26/2023/NĐ-CP".
  5. **`normalizePlan`:**
     - bỏ fact "thải độc" khi người dùng không viết;
     - bỏ "SN: …" và các nhóm số từ 4 chữ số;
     - chỉ giữ `doc` "36/2016/TT-BKHCN" khi tin có 36/2016.
  6. **`defaultPlan`:** "Nghị định 69/2018/NĐ-CP còn áp dụng không" → `intent: 'status'`.
- [ ] **Xong khi:** Jest xanh.

### Việc 6: Bước kế hoạch: prompt (port `router.mjs`) và gọi claude #1

- [ ] **File:** `plan.ts`, `plan.spec.ts`.
  - `buildPlanPrompt`: port `transcriptOf`, `stateOf`, `manifestOf`, đọc thêm `state.tariff.candidates` và `state.answer`; tập intent 9 giá trị; trường theo §2.4; không có `lead`.
  - `planStep(input, run)`.
- [ ] **Test (runner giả ghi lại prompt):**
  - luồng câu ảnh + `state.tariff` 3005.10.10 → prompt không chứa "3005", "30.05", "30051010";
  - prompt có danh mục kho;
  - JSON hỏng → `defaultPlan`;
  - `isError` → `defaultPlan`;
  - runner nhận timeout 30 s.
- [ ] **Xong khi:** Jest xanh.

### Việc 7: `guards.ts` (TDD)

- [ ] **File:**
  - `apps/api/src/modules/answer/guards.ts`, `guards.spec.ts`;
  - `apps/api/src/modules/legal/legal.grounding.ts`: `numberMarkers(answer, cited, sources, userText, opts?)` với `opts = {cut, labels}`; FACTS thêm `(Điều|khoản|điểm)\s+\d+[a-zđ]?` (không chí mạng, miễn khi người dùng viết); không truyền `opts` thì hành vi như cũ;
  - `legal.grounding.spec.ts`.
- [ ] **Giao diện:** `verify(draft, sources, ctx) → {answerMd, citations, candidates, violations, cut}`. Hàm thuần; sự tồn tại của nhóm nhận vào dưới dạng `Set`.
- [ ] **Test (mỗi ca một `it`):**
  - các ca kiểm chứng của G1–G7 ở §4.1;
  - thêm: `cut` đếm câu bị cắt, `verify` không nối dòng "bị lược" (của `formatAnswerMd`);
  - "Mức độ tin cậy 95%" làm rỗng văn xuôi;
  - "phải xét 38.24" và "phải xét vào 38.24" đều là vi phạm;
  - từ 2 ứng viên mà `missingFacts` rỗng → vi phạm loại `repairOnly`.
- [ ] **Xong khi:** Jest xanh, 15 test grounding cũ vẫn xanh.

### Việc 8: `LegalService.scope()` và `gather()`; cột HS của bằng chứng; limit `headingSections`

- [ ] **File:**
  - `legal.service.ts`:
    - tách `scope(query, doc)` và `gather(query, {asOf, doc, article, hsCodes, headings, clauses})`;
    - `gather` trả `{asOf, sources}`; mỗi source có thêm `key`, `body`, `hs: {heading, chapter, codes}`, `hs2022`;
    - `ask()` = `scope` + `gather` + `generate` + `numberMarkers`;
    - export `evidenceSource`, `articleSource`, `focusOn`, `AUTHORITY_NOTE`.
  - `legal.evidence.ts`: `columns` thêm `hs_heading`, `hs_chapter`, `hs_codes`, `meta->'hs2022'`; `headingSections` mặc định `limit = headings.length + 2 × chapters.length`.
  - `legal.service.spec.ts`.
- [ ] **Test:**
  - 14 test service cũ xanh;
  - `gather(q, {headings: ['38.24','33.07','30.04','30.05']})` truyền đủ 4 nhóm và limit 10 (DB giả bắt tham số);
  - `gather(q, {clauses: 0})` không gọi `hybridRetrieve`;
  - `scope` trả `missingDoc` cho "thông tư 36 của bộ KHCN" với catalogue giả;
  - `GET /legal` với fixture 69/2018 trả đúng nhãn citation như snapshot chụp trước khi tách.
- [ ] **Xong khi:** Jest và tsc xanh.

### Việc 9: `compose.ts`: prompt viết, đọc JSON, sửa câu vi phạm

- [ ] **File:** `apps/api/src/modules/answer/compose.ts` (`SYSTEM`, `buildComposeInput`, `parseDraft`, `buildRepairPrompt`, `parseRepair`), `compose.spec.ts`.
- [ ] **Test:**
  - `SYSTEM` chứa khối "quy ước đọc bằng chứng" và không có chữ người dùng;
  - user prompt của fixture câu ảnh (premise) không có "3005", "30051010", "[mã" và có dữ kiện đã có/còn thiếu;
  - `LƯỢT TRƯỚC` chỉ xuất hiện khi `refines`;
  - `parseDraft` chịu được xuống dòng thô trong chuỗi và JSON bọc trong fence; JSON hỏng → `null`;
  - prompt repair chỉ chứa câu vi phạm và quote của các `[n]` trong câu đó.
- [ ] **Xong khi:** Jest xanh.

### Việc 10: `POST /answer`: điều phối, `planOnly`, hạn giờ, ứng viên, so mã người dùng, log

- [ ] **File:**
  - `answer.module.ts`, `answer.controller.ts`, `answer.service.ts`, `answer.service.spec.ts`;
  - `apps/api/src/app.module.ts`; `apps/api/src/modules/tariff/tariff.module.ts` (export `ConfirmationService`);
  - `.agent/docs/code-organization.md` (thêm module `answer`).
- [ ] **Test (runner, `gather`, DB đều giả):**
  - (a) `planOnly` với câu ảnh → `plan.intent 'hs'`, `codeRole 'premise'`, `userCodes[0].code '3005.10.10'`, `ack` không có chữ số, `calls 1`.
  - (b) Kế hoạch `tariff` → không compose, `calls 1`.
  - (c) Có `plan` + `forceIntent 'legal'` → runner kế hoạch không được gọi.
  - (d) Prompt compose ghi lại được không chứa chữ số của người dùng hay thân lượt cũ nào; compose trả 30.05 có EN 30.05 đỡ → `userCodes[0].inCandidates === true`.
  - (e) Bản nháp "MFN là 0% [1]" + repair trả câu sạch → `cut 0`, `repaired true`, `calls 3`; repair vẫn vi phạm → `cut 1`.
  - (f) `deadlineAt` còn dưới 30 s sau compose → không gọi repair.
  - (g) `gather` rỗng → không compose, `coverage 'none'`.
  - (h) `scope` báo thiếu văn bản → `planOnly` trả `missingDoc`.
  - (i) Nguồn status có `expired` → `citations[0].expired` đúng chuỗi dữ liệu.
  - (j) Dòng log JSON không chứa `q`.
- [ ] **Kiểm tay (Docker local):** `curl -XPOST localhost:3000/answer -H 'content-type: application/json' -d '{"q":"Nghị định 69/2018/NĐ-CP còn áp dụng không","context":{}}'` → `mode 'status'`, có quote chứa 292/2026.
- [ ] **Xong khi:** CI xanh, API đã deploy, bot chưa dùng.

### Việc 11: `formatAnswerMd` (TDD, chưa nối)

- [ ] **File:** `apps/zalo-bot/format.mjs` (`formatAnswerMd(res, {tariffLines})`), `render.test.mjs`.
- [ ] **Test (fixture JSON của `/answer`):**
  - **Câu ảnh (hs):**
    - không có "MFN", "Căn cứ phân loại", "Với mô tả", `trả lời "đúng"`;
    - đúng một dòng `userCodes`, đúng một dòng "Ứng viên để chuyên viên chốt:";
    - dòng R5 có khi từ 2 ứng viên và văn xuôi thiếu "xác định trước", không có khi văn xuôi đã có;
    - `render(...)` ra ≤ 2 tin.
  - **Status:** văn xuôi "còn hiệu lực" vẫn in dòng đỏ từ `expired`.
  - **Unverified:** một dòng cam đã gộp.
  - **Nguồn:** nhãn thẩm quyền in một lần rồi "như [1]"; quote ≤ 160 ký tự; không có "(trích đoạn đầu)".
  - **Bất biến R13:** `tariffReply(toText(formatAnswerMd(fixture)))` là false.
- [ ] **Xong khi:** `test:bot` xanh.

### Việc 12: Nối bot vào `/answer`; bộ nhớ ứng viên; R13 trên luồng ứng viên

- [ ] **File:**
  - `api.mjs`: `answer(body)`.
  - `index.mjs`: `respond` theo §2.1; ack chỉ khi sắp compose; lưu `state.answer`, `state.tariff.candidates`; nguyên văn điều → `legalProvision`; `missingDoc` → `formatMissingDoc` + `pendingIngest`.
  - `conversation.mjs`: `candidatesFresh`.
  - `dispatch.mjs`: `guardIntent` cho `status`/`hs`/`mixed` đi thẳng, thêm `candidatesFresh`; `fastPath` nhận đính chính có cue trên luồng ứng viên.
  - `answer.mjs`: `handleCorrection` không đọc quote khi có `candidates`; thêm `codeOffer`.
  - `.agent/docs/zalo-bot-conversation-memory.md` (thêm `candidatesFresh`, `state.answer`, `state.tariff.candidates`).
  - `dispatch.test.mjs`.
- [ ] **Test (fetch giả):**
  1. "thuế nk 8481.80.99 tq" và "thue nk 84818099 tq" không bao giờ gọi `/answer`.
  2. Câu ảnh gọi `/answer` với `planOnly` rồi gọi `/answer` kèm `plan`; ack gửi đúng một lần và không có chữ số.
  3. `guardIntent('status', {topic: 'tariff', tariffFresh: true}) === 'status'`.
  4. Khi guard bác kế hoạch, request thứ hai mang `plan` + `forceIntent`, và `planOnly` chỉ được gọi 1 lần.
  5. Sau fixture hs đã lưu, tin "HS đúng là 8422.90.90" tạo đúng một `POST /tariff/confirm` với `{verdict: 'correct', hs: '84229090'}`, note chứa `desc`, không có dòng `wrong`. Kết quả phải giống hệt khi tin đó quote câu trả lời hs.
  6. Sau fixture hs, "đúng" không ghi gì. "sai rồi, không phải nhóm này" quote câu trả lời hs cũng không ghi gì và đi nhánh `refine`.
  7. "63079090 mới đũng" sau fixture hs (kế hoạch trả `correction`): không có `postConfirm`, câu trả lời nêu 6307.90.90 và "HS đúng là".
  8. Test cũ "8481.80.99 có sai không ạ" trên tra thuế còn mới vẫn không ghi gì.
  9. `/answer` trả `null`: bot trả một câu báo lỗi thật, không gọi `answerByHs`.
- [ ] **Xong khi:** `test:bot` xanh. Việc 13 gộp vào cùng lần deploy.

### Việc 13: Xoá lớp khuôn mẫu và regex định tuyến

- [ ] **File:** xoá theo bảng "Xoá" ở §7 (các dòng Việc 13), gồm `answer.mjs`, `format.mjs`, `dispatch.mjs`, `router.mjs`, `api.mjs` và `index.mjs`. Trong `tariffByClues`, bỏ `lead` và `withLead`.
- [ ] **Chuyển test:** trong `dispatch.test.mjs` có 27 chỗ dùng symbol bị xoá.
  - Ca còn giá trị chuyển sang `plan.spec.ts` (che mã, cue), `guards.spec.ts` hoặc test của `formatAnswerMd`.
  - Ca còn lại xoá.
- [ ] **Chứng minh:**
  - `grep -rn "answerCodeCheck\|formatLegal\|withLead\|codebook\|asksCodeFit\|legalAboutCode\|fallbackIntent\|route(" apps/zalo-bot` không ra gì.
  - `test:bot` xanh.
  - `wc -l` các file `apps/zalo-bot/*.mjs` (không tính test) giảm; ghi số dòng trước/sau vào commit.
- [ ] **Xong khi:** CI xanh và bot mới đã deploy.

### Việc 14: Hiệu chỉnh model, effort và cỡ prompt trên server

- [ ] **File:**
  - `docker-compose.yml`: thêm `ANSWER_COMPOSE_MODEL`, `ANSWER_COMPOSE_EFFORT`, `ANSWER_PROMPT_CHARS` cho service `api`.
  - `.agent/planning/02-progress.md`.
- [ ] **Làm:**
  - Chạy khô 10 câu thật và 14 câu notebook, mỗi cấu hình 2 lượt.
  - Tối đa 3 cấu hình, trong phạm vi chủ dự án cho ở D2.
  - Chạy tuần tự, không song song, vì server dùng chung.
- [ ] **Chứng minh:** bảng trong `02-progress.md` gồm:
  - p50/p95 của từng bước plan, gather, compose, repair và tổng;
  - số lần timeout và `is_error`;
  - tỉ lệ bị cắt, tỉ lệ phải repair;
  - RAM trống thấp nhất của host.
- [ ] **Xong khi:** cấu hình mặc định đạt đủ ba điều sau. Nếu không đạt, chuyển D6.
  - p95 tổng ≤ 120 s;
  - 0 timeout trên 24 câu;
  - RAM trống không lúc nào dưới 700 MB.

### Việc 15: Eval qua `/answer`, câu hỏi thật, bảng chấm của chủ dự án

- [ ] **File:**
  - `apps/eval/notebook.ts`: khi `EVAL_ENDPOINT=answer` thì gửi `POST /answer`; tính `numbersOutsideSentenceQuote` bằng cách gọi lại hàm neo số trong `guards.ts` trên `answerMd` + `quotes`; tính `citationsProven` và p95.
  - `apps/eval/real.ts` (mới): đọc `real-questions.json`, kiểm `expectIntent`, `mustNotSay`, `expectCandidate`, `expectUserCodeCompared`.
  - `apps/eval/run.ts`, `apps/eval/report.ts`.
  - `apps/eval/notebook.spec.ts` và `apps/eval/real.spec.ts`.
- [ ] **Test:** unit test chấm điểm trên response mẫu: có quote hợp lệ, có quote bịa, có số nằm ngoài quote.
- [ ] **Chứng minh:** chạy `EVAL_API_URL=http://localhost:3060 EVAL_ENDPOINT=answer corepack yarn eval` qua SSH tunnel. Kết quả phải đạt:
  - nhóm an toàn notebook 8/8;
  - số câu đạt ≥ 1/14 (baseline);
  - `numbersOutsideSentenceQuote` = 0;
  - `citationsProven` = 100%;
  - p95 ≤ 120 s;
  - câu thật: `expectIntent` ≥ 9/10 và 0 lần dính `mustNotSay`.

  Sau đó chạy lại dry-run của Việc 1, ghi ra `.agent/local/voice-after.txt`.
- [ ] **Xong khi:** chủ dự án đã chấm bảng 4 dấu có/không (§9) và thử trên Zalo.

### Việc 16 (sau khi chủ dự án duyệt): ảnh đi qua `/answer` ở chế độ hs

- [ ] **File:**
  - `apps/zalo-bot/answer.mjs`, hàm `answerImage`: `claudeVision` trả clues, bot dựng `plan = {intent: 'hs', question: sanitizeLead(note), hsHints, keywords, goods}` rồi gọi `POST /answer {q: caption, plan, forceIntent: 'hs'}` và hiển thị bằng `formatAnswerMd`.
  - `tariffByClues` chỉ còn là đường dự phòng khi không có LLM.
  - `dispatch.test.mjs`.
- [ ] **Test:** caption "e tham khảo mã 30051010 được không":
  - `plan.question` gửi đi không chứa chữ số;
  - `userCodes` do API tính từ `q`;
  - câu trả lời không có "MFN".
- [ ] **Xong khi:** `test:bot` xanh và một lần chạy khô với ảnh thật cho ra ≤ 2 tin.

### Việc 17 (D5): bỏ bước viết văn xuôi của `GET /legal`

- [ ] **File:**
  - `legal.service.ts`: `ask()` chỉ trả citations; xoá `namedHeadings`.
  - Xoá `legal.generation.ts`.
  - `legal.service.spec.ts`.
  - `apps/eval/legal.ts`: đo `citationsValid` qua `/answer`.
  - `.agent/docs/bot-answer-parity-design.md`: đóng hộp [v4].
- [ ] **Chứng minh:**
  - `grep -rn "legal.generation\|namedHeadings" apps` không ra gì;
  - `corepack yarn test` xanh;
  - eval: recall@5 ≥ 90%, nhóm an toàn 8/8.
- [ ] **Xong khi:** CI xanh. Kế hoạch 08 xoá, kết quả ghi vào `02-progress.md`.

## 9. Đo trước/sau

**Trước.** Làm ở Việc 1, trước khi deploy Việc 12:
- Lệnh: `docker-compose exec -T zalo-bot node apps/zalo-bot/dry-run.mjs --stdin < fixtures/legal-golden/real-questions.json > .agent/local/voice-before.txt`
- Chạy lại lệnh đó với 14 câu notebook.
- Thư mục `.agent/local/` nằm trong gitignore vì file chứa chữ người dùng.

**Cổng tự động, chặn deploy:**
- `corepack yarn test`, `corepack yarn test:bot`, `npx tsc --noEmit -p apps/api/tsconfig.app.json`
- `EVAL_API_URL=http://localhost:3060 EVAL_ENDPOINT=answer corepack yarn eval`, đạt các ngưỡng ở Việc 15.

**Đo độ máy móc.** `dry-run` in số liệu cho từng câu trả lời:

| Chỉ số | Trước (đo ở Việc 1) | Đích sau |
|---|---|---|
| `templateHits` (các chuỗi cố định ở bảng §5) | câu ảnh ≥ 6 | 0 |
| Số tin mỗi câu phân loại, không tính ack | câu ảnh 3 | ≤ 2 |
| Số tin mỗi câu hiệu lực | — | 1 |
| Dòng do code viết trong câu hs (ứng viên, so mã, R5, nguồn) | — | ≤ 7 |
| Lần ghi sổ ngoài dự kiến (`trailWrites`) | — | 0 |
| p95 thời gian một lượt soạn | ~65 s (1 lần đo) | ≤ 120 s |

**Bảng chấm của chủ dự án.** Đây là phần nghiệm thu thật; chủ dự án duyệt bằng cách thử.
- Đọc hai file `voice-before` và `voice-after` song song.
- Với mỗi câu trả lời "sau", đánh 4 dấu có/không:
  1. Hiểu đúng người hỏi cần gì.
  2. Lập luận từ nguồn nhìn thấy được.
  3. Nói rõ chỗ chưa chắc và dữ kiện nào sẽ quyết.
  4. Độ dài và bố cục hợp câu hỏi, không có câu mẫu.
- Đạt khi mỗi dấu có ≥ 80% "có" và 0 lỗi an toàn. Sau đó chủ dự án thử trên Zalo.

**Probe bất biến R4.** Chỉ bắt buộc khi D1 = "có":
- Với 3 mặt hàng (miếng dán ngải cứu, hộp vải cách ly RF, máy kiểm tra điện trở), mỗi mặt hàng hỏi 2 lần: một lần kèm mã hợp lý, một lần kèm mã sai rõ (8481.80.99). Mỗi cặp chạy 3 lượt.
- Đạt khi Jaccard trung bình của tập nhóm 4 số giữa mã sai và mã hợp lý lệch không quá 0,1 so với Jaccard giữa các lượt cùng mã hợp lý.

## 10. Rủi ro

1. **Hạn mức thuê bao và độ trễ.** Ngày 14/09 đã hết hạn mức trong khi `/health` vẫn báo `llm: up`.
   - Đọc `is_error` và ghi log.
   - Khi lỗi, bot chỉ trả nguồn kèm một câu thật.
   - Chặn 2 tiến trình chạy cùng lúc, có hạn 120 s.
   - Việc 14 hiệu chỉnh; nếu vẫn không đạt thì chuyển D6.
2. **Rào chắn chuỗi không thấy suy luận sai (sàn R10).** Có G4, bắt nêu `missingFacts`, tối đa 3 ứng viên, và chủ dự án chấm dấu 2.
3. **Kết luận vội vẫn lọt qua cách diễn đạt khác.** Mỗi mẫu câu mới gặp trong log Zalo thành một test của G4.
4. **Cue FIT/giải nghĩa thiếu mẫu.** Mặc định là `premise`, nên sai thì nghiêng về an toàn. Mẫu mới gặp thì thêm test ở `plan.spec`.
5. **Kế hoạch đọc sai intent.** Đường tất định vẫn đúng. Sai intent chỉ tốn một câu trả lời, không ghi sổ, vì `guardIntent` và §6.3 chặn.
6. **Guards cắt nhiều khiến văn xuôi rời rạc.** Repair chỉ sửa câu vi phạm. Theo dõi `cut` và `repaired` trong log. Chỉnh prompt dựa trên eval, không nới guards.
7. **Nịnh qua mô tả hàng.** Người dùng có thể tả hàng bằng đúng lời của nhóm họ muốn; che mã không chặn được. Câu trả lời luôn nêu nhóm cạnh tranh và dữ kiện còn thiếu.
8. **RAM server dùng chung** (tiến trình claude + embedder, đỉnh đã đo 2.580 MB). Chặn 2 tiến trình; Việc 14 theo dõi RAM trống.
9. **Lỗi dữ liệu bằng chứng** (EN 84.18 tràn, tiêu đề parser bị cắt). Chúng hiện ra dưới dạng trích nguyên văn đúng mà nội dung sai. Giữ ca `nb-13` trong eval.
10. **Đổi nhiều code bot cùng lúc.** Việc 11–13 chuyển test trước khi xoá. `GET /legal` giữ nguyên đến Việc 17 để có đường so sánh.
11. **`format-cau-tra-loi.md`** có số điện thoại của bên thứ ba, repo lại public. Không commit file này và không chép giọng "đề xuất mã, độ tin cậy" của nó.

## 11. Cần chủ dự án quyết

- **D1: cách đọc R4 cho câu "mã này dùng được không".** — **ĐÃ CHỐT: có** (§0).
  - Mặc định là **đọc chặt**: chú giải nhóm của người dùng không được ghim vào bằng chứng. Mã chỉ được so bằng code ("nằm/không nằm trong các nhóm trên").
  - Nếu chọn "có": chú giải nhóm người dùng vào bằng chứng, không gắn nhãn, xếp theo số. Văn xuôi khi đó giải thích được vì sao mã hợp hoặc không hợp. Bắt buộc qua probe ở §9.
  - Commit `3d71049` ở đường cũ đang làm theo cách "có", và vẫn đang chờ xác nhận.
- **D2: model, effort và hạn mức.**
  - Kế hoạch dùng `sonnet/low`; repair dùng `sonnet/low`.
  - Compose khởi điểm `opus/high`. Chốt sau số liệu của Việc 2 và Việc 14.
  - Phương án rẻ hơn: `sonnet/high`.
- **D3: thuế trong câu trả lời ứng viên, và chân trang đúng/sai.**
  - (a) Không in MFN của ứng viên; đây là lệch khỏi spec §3.8. Mặc định: **không in**.
  - (b) Câu mời "đúng"/"sai" trên tra thuế trần. Mặc định: **giữ một câu nhỏ, chỉ ở lượt tra đầu của luồng**, vì sổ R18 đang phải học lại từ đầu sau khi mất VPS.
- **D4: commit 10 câu hỏi thật vào repo public.** — **ĐÃ CHỐT: không**, để trong `.agent/local/` (§0).
- **D5: bỏ văn xuôi của `GET /legal` và xoá `legal.generation.ts`** sau khi duyệt trên Zalo. Mặc định: có (Việc 17).
- **D6: chỉ cần quyết khi Việc 14 không đạt p95 ≤ 120 s** sau khi đã hạ effort và cỡ prompt. Chọn một trong hai: cho câu phân loại trần 150 s, hoặc chuyển sang API trả phí (lối thoát theo ADR 2026-09-13).

## Kiến thức liên quan

- [Thiết kế bot trả lời ngang notebook](../docs/bot-answer-parity-design.md): §3, §3.8, §4, §5, §5b.10
- [Kế hoạch 05](05-bot-parity-tasks.md): Mảng 3 (bản phác thảo được thay) và Mảng 4
- [Quy tắc nghiệp vụ](../business-rules.md): R1–R8, R10, R13, R14, R18
- [ADR bảng bằng chứng và câu trả lời dài](../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md)
- [ADR LLM sinh giả thuyết, không khẳng định](../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md)
- [ADR không LLM trên con số biểu thuế](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)
- [ADR HS là ứng viên](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
- [ADR chữ định dạng Zalo, màu do dữ liệu](../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md)
- [Bộ nhớ hội thoại bot Zalo](../docs/zalo-bot-conversation-memory.md)
- [Nhật ký tiến độ](02-progress.md)