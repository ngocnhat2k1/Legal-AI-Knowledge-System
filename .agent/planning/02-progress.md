---
type: planning
status: active
updated: 2026-07-18
related:
  - 00-bootstrap.md
  - 01-task-list.md
  - ../index.md
  - ../business-rules.md
---

# Nhật ký tiến độ

**Đây là điểm tiếp tục.** Một agent tiếp nhận dự án này giữa chừng đọc file này trước tiên,
rồi theo các liên kết. Nó trả lời ba câu hỏi: chúng ta đang ở đâu, điều gì diễn ra tiếp theo, và
chúng ta đã học được điều gì một cách khó khăn mà không hiển nhiên từ code.

`00-bootstrap.md` là kế hoạch. `01-task-list.md` là công việc. **File này là sự thật về những gì
thực sự đã xảy ra**, thường khác đi.

## Tiếp tục từ đây

| | |
|---|---|
| **Giai đoạn hiện tại** | **Giai đoạn 8 — mở rộng LLM. M0 (nền móng) đã viết xong, test xanh trên máy dev (2026-08-14). CHƯA deploy, CHƯA nạp lại kho, CHƯA có baseline.** |
| **Công việc tiếp theo** | Ba việc, đúng thứ tự: (1) `docker compose build api` — chứng minh dòng cài CLI `claude` trong image chạy được (máy dev không có Docker nên chưa kiểm được); (2) `FORCE_RESEED=1 yarn db:seed:legal` để bản sửa tiêu đề vào kho, rồi **kiểm tra ngẫu nhiên nội dung**, không tin số đếm; (3) `yarn eval` lấy **baseline** và chép nguyên văn con số vào file này. Sau đó viết kế hoạch M1. |
| **Đang bị chặn bởi** | Không. Một câu hỏi chờ chủ dự án: có nạp NĐ 134/2016 khi Công báo **không có VBHN** hợp nhất nó không (xem nhật ký 2026-08-13). |
| **Code đã viết** | Khung repo (006) + schema (007) + loader ND 26/2023 (008) + chuỗi sửa đổi/hồi quy (009) + **API `/tariff` + staleness** (010/011) + **loader 4 FTA** + **validator nghiệm thu** (012) + **Legal RAG** (`modules/legal/`) + **bộ nhớ hội thoại** (`modules/conversation/`, migration 0006) + **bot Zalo dạng module** (`apps/zalo-bot/*.mjs`, `yarn test:bot`) + **M0 mở rộng LLM**: `health.llm.ts`, CLI trong image, sửa parser tiêu đề, `apps/eval/` (`yarn eval`). |
| **Phiên gần nhất** | 2026-08-14 (xem nhật ký bên dưới) |

### ⚠️ TASK-001 — phần còn lại cần con người, không phải agent

**Cập nhật 2026-07-18:** chủ sở hữu đã đưa 117 tờ khai nhập khẩu thật; agent đã bóc thành golden set
(55 case tinh tuyển + 259 dòng corpus) và cross-check 249/249 với biểu thuế thương mại. Xem
[company-data-assets.md](../concepts/company-data-assets.md). Phần DUY NHẤT còn lại là cờ `confidence`
(tự tin / không chắc) do **bộ phận khai báo** tự đánh dấu — agent KHÔNG được tự quyết. Cảnh báo gốc bên
dưới vẫn đúng về nguyên tắc; chỉ khác một điều: golden set nay đã tồn tại, chỉ chờ được đánh dấu.

**→ Đã đóng (2026-07-18):** chủ dự án quyết định `confidence = uncertain` cho **toàn bộ** golden set (đã-khai-qua ≠ chắc chắn đúng luật), và xác minh đúng/sai để **lúc dùng thật qua vòng xác nhận Zalo**, không staff certify trước. TASK-001 xong. Nguyên tắc "không rửa thực-tiễn-cũ thành chắc-chắn-đúng" được giữ nguyên — chỉ dời điểm xác minh về lúc sử dụng.

**TASK-001 là golden set: 30–50 câu hỏi từ chính các tờ khai của chủ sở hữu, với các đáp án mà
chủ sở hữu đã biết là đúng.** Không agent nào có thể viết nó. Không agent nào nên bịa ra nó.

Không có gì phía sau đáng tin cậy nếu không có nó, vì dạng thất bại của sản phẩm này là âm thầm:
một mã HS sai là một mã thật, định dạng đúng, và một mức thuế sai trông y hệt một mức
đúng. Không có exception, không lỗi phân tích, không cờ đỏ. Golden set là công cụ duy nhất
có thể phát hiện việc bị sai. Xem [Đánh giá](../docs/evaluation.md).

Nếu chủ sở hữu chưa tạo ra nó, **hãy yêu cầu nó — đừng bắt đầu TASK-006 để cảm thấy năng suất.**
Xây khung sườn trước khi có công cụ đo lường là cách dự án này thất bại trong khi báo cáo
thành công.

## Trạng thái công việc

Phản chiếu [01-task-list.md](01-task-list.md), vốn giữ chi tiết và tiêu chí nghiệm thu.
**Cập nhật cả hai, trong cùng một commit, nếu không chúng lệch nhau và bảng này trở thành một lời nói dối.**

| Công việc | Trạng thái | Ghi chú |
|---|---|---|
| TASK-001 — Golden set | ✅ xong 2026-07-18 | 55 case + 259 corpus, cross-check 249/249, chấm tay 15/15; confidence = uncertain toàn bộ (xác minh qua Zalo lúc dùng) |
| TASK-002 — Giải quyết xung đột API customs.gov.vn | ✅ xong 2026-07-18 | Quan sát trực tiếp trên trình duyệt (tab Network): portal gọi `/bridge` và nhận dữ liệu → xác nhận research 10, bác research 12; dùng `/bridge`, không đuổi IP-thô. Vẫn chỉ là lớp cross-check, không phải nguồn pháp lý. Còn tồn (không chặn thiết kế): bare-curl từ mạng công ty, lưu sample response, dò rate-limit |
| TASK-003 — Chứng minh phân tích DOCX nhận biết bảng | ✅ xong 2026-07-18 | Lỗ hổng GIẢ: cells ngăn bởi `\x07`/`\n`, research không thấy delimiter. Parse được → GĐ1 gồm EVFTA+RCEP |
| TASK-004 — Kiểm tra provisionTree của vbpl có được điền không | ✅ xong 2026-07-18 | MỘT PHẦN: `provisionTree`/`referenceProvisions` = null trên 21/21 văn bản; nhưng cây điều khoản Chương→Điều→Khoản→Điểm CÓ qua một Server Action khác. Cạnh trích dẫn cấp điều khoản phải tự dựng. Gateway MoJ còn sống, route chưa ánh xạ. Xem research/task-004-vbpl-provisiontree |
| TASK-005 — Viết các ghi chú kiến thức .agent | ✅ xong 2026-07-17 | Đã kiểm toán; xem Nhật ký phiên làm việc |
| TASK-006 — Khung sườn repository | ✅ xong 2026-07-18 | NestJS monorepo + Docker + Drizzle + Yarn 4; migration `0000` bật pgvector. Verify: clean-clone → `docker compose up` → `/health` ok (pgvector 0.8.5). db host cổng **5433**. Xem [ADR công cụ repo](../architecture-decisions/2026-07-18-repo-tooling-drizzle-yarn.md) |
| TASK-007 — Schema biểu thuế (thời gian + nhận biết phụ lục) | ✅ xong 2026-07-18 | Drizzle + migration `0001`/`0002`; annex NOT NULL, EXCLUDE chống chồng khoảng, trigger append-only, CBPG tách bảng. Chứng minh live **17/17** (6 ca khó + DB chối shape sai). Xem [research/task-007-schema](../../research/task-007-schema/README.md) |
| TASK-008 — Nạp Công báo (bộ phân tích nhận biết phụ lục) | ✅ xong 2026-07-18 | ND 26/2023, 13.161 dòng, 13/13 verify; annex-aware; Chương 98 tách schedule; khớp research 12 (11.874/11.150). Xem [research/task-008-congbao-loader](../../research/task-008-congbao-loader/README.md) |
| TASK-009 — Xác lập chuỗi sửa đổi MFN 2026 | ✅ xong 2026-07-18 | Chuỗi xác lập từ nguồn chính thức (R10+R12 bù nhau; 201/2026 là XK; 72/2026 gia hạn NQ 25/2026). Hồi quy 72/2026 nạp bằng cắt-khoảng append-only, live 6/6. Xem [research/task-009-amendment-chain](../../research/task-009-amendment-chain/README.md) |
| TASK-010 — Phát hiện độ cũ | ✅ xong 2026-07-18 | Trong API: snapshotDate + reliableThrough (−48 ngày lag) + stale/warning. Acceptance PASS (snapshot 2026-03-15/query 2026-03-10 → stale). |
| TASK-011 — API tra cứu | ✅ xong 2026-07-18 | `GET /tariff` SQL keyed, vị từ khoảng, không LLM; rate có kiểu + statement, FTA/Ch.98 có điều kiện, CBPG riêng, staleness. FTA `preferential[]` chờ nạp biểu FTA. Xem [research/task-010-011-lookup-api](../../research/task-010-011-lookup-api/README.md) |
| TASK-013 — Bot Zalo: bộ nhớ hội thoại + định tuyến theo chủ đề | ✅ xong + LIVE 2026-08-13 | Postgres `conversation`/`conversation_turn` (0006) + `/conversation` API; bot tách 8 module; `guardIntent` chặn cả regex lẫn LLM; router thấy transcript + viết lại `search_query`; lead có guard. 20/20 test thuần. Thiết kế: [zalo-bot-conversation-memory](../docs/zalo-bot-conversation-memory.md); quy tắc [R13/R14](../business-rules.md) |
| TASK-015 — Kho tự mở rộng (chỉ mục → nạp theo yêu cầu → thăng cấp) | ✅ xong + LIVE 2026-08-14 | `gazette_document` ~15.5k văn bản (0007/0008); worker `apps/ingest` + cổng tự kiểm; `verification`/`verified_by` (0009). Nghiệm thu: 36/2016/TT-BCT nạp tự động 14 điều/57 chunk rồi thăng cấp. 11 test đơn vị cho parser chỉ mục. Thiết kế: [legal-corpus-self-extension](../docs/legal-corpus-self-extension.md) |
| TASK-014 — Mở rộng corpus pháp luật 4 → 7 văn bản | ✅ xong + LIVE 2026-08-13 | +54/VBHN-VPQH (8/104), +25/VBHN-BTC = TT 38/2015+39/2018 (9/149), +33/2023/TT-BTC (5/23). **4475 provisions · 1806 chunks đã embed**, 7/7 qua cổng `expect`. Parser thêm 3 luật (dấu chấm+thứ tự; "Phụ lục" viết thường; tham chiếu chéo rơi đúng `điều+1`). **NĐ 134/2016 KHÔNG nạp** — không có VBHN công bố, vướng ADR |
| TASK-012 — Nghiệm thu Giai đoạn 1 | ✅ xong 2026-07-18 | **Corpus 249/249 khớp 100%** (MFN + 4 FTA); random 20/20 khớp source; star-case đủ 4 FTA 0%. Xem [research/task-012-acceptance](../../research/task-012-acceptance/README.md) + [fta-loader](../../research/fta-loader/README.md) |

Chú thích: ✅ xong · 🟡 đang tiến hành · 🔲 chưa làm · ⛔ bị chặn · ❌ bỏ dở (nói lý do)

## Các quyết định đã đưa ra — Đừng tranh luận lại

Những điều này đã được quyết và ghi lại thành các ADR. Nếu bạn định mở lại một cái, bạn có lẽ thiếu
bối cảnh đã được ghi lại. Đọc ADR trước; chỉ mở lại với bằng chứng mới, và thay thế nó đúng cách.

- Các con số thuế không bao giờ đến từ một LLM — [ADR](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)
- Đầu ra HS là top-3 + bằng chứng nguyên văn, không bao giờ là một mã trần — [ADR](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
- Chỉ Postgres cho v1 — [ADR](../architecture-decisions/2026-07-17-postgres-only-for-v1.md)
- Web app, không phải Zalo — [ADR](../architecture-decisions/2026-07-17-web-app-not-zalo.md)
- Hải quan trước, RAG pháp lý sau — [ADR](../architecture-decisions/2026-07-17-customs-first-law-later.md)
- VBHN đã công bố làm lớp văn bản; đừng tính toán hợp nhất — [ADR](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)
- Hiệu lực và phiên bản HS là hạng nhất từ ngày đầu — [ADR](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)

## Câu hỏi mở vẫn chưa trả lời

Mang theo từ nghiên cứu. **Mỗi cái là một ẩn số thật, không phải một thủ tục hình thức.** Trả lời chúng ở Giai đoạn 0 —
vài cái thay đổi thiết kế.

1. ✅ **ĐÃ GIẢI QUYẾT 2026-07-18 (TASK-002):** Chủ dự án **quan sát trực tiếp trên trình duyệt (tab Network)**
   thấy portal biểu thuế customs.gov.vn gọi endpoint `/bridge`
   (`POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`) và nhận dữ liệu về.
   Điều này **xác nhận research 10** (`/bridge` là endpoint sống) và **bác giả thuyết research 12** (rằng portal
   chỉ là vỏ JS chết, backend duy nhất là IP-thô `123.30.210.236:8080` — vốn timeout). Hai báo cáo mô tả **hai
   endpoint khác nhau**, có thể cả hai đều đúng; dự án **cố ý không đuổi** backend IP-thô. Đây vẫn chỉ là **lớp
   cross-check tiện lợi, KHÔNG phải nguồn sự thật pháp lý** — không quyết định thiết kế nào phụ thuộc `/bridge`;
   pipeline `.doc` Công báo vẫn là đường chịu tải. Lưu ý trung thực: đây là **quan sát trên tab trình duyệt**, chưa
   phải bare-curl. Các mục nghiệm thu TASK-002 còn tồn (không chặn thiết kế): tái hiện bằng bare-curl từ mạng công
   ty, lưu một sample response cho một HS đã biết để đối chiếu với bộ phận khai báo, và dò rate-limit. → TASK-002
2. ✅ **ĐÃ GIẢI QUYẾT 2026-07-18 (TASK-003):** CÓ — parse được (cells ngăn bởi dấu ô Word `\x07`/`\n`, không cần LibreOffice, không heuristic); GĐ1 gồm EVFTA + RCEP. Xem [research/task-003-evfta-parser](../../research/task-003-evfta-parser/README.md). ~~Câu hỏi gốc:~~ **Một bộ phân tích DOCX nhận biết bảng có khôi phục các cột sáu-mức-thuế EVFTA không?** Research 12 suy luận nó
   sẽ khôi phục được nhưng không thể chứng minh (không có LibreOffice/python-docx khả dụng). Khoảng trống này phải khép lại trước
   khi bất kỳ dữ liệu thuế nào được tin. → TASK-003
3. ✅ **ĐÃ GIẢI QUYẾT 2026-07-18 (TASK-004, một phần):** `provisionTree`/`referenceProvisions` = `null` trên **21/21** văn bản đã lấy mẫu — tham chiếu chỉ ở cấp văn bản. **NHƯNG** cây điều khoản Chương→Điều→Khoản→Điểm CÓ qua một Server Action **khác** (research 04 không thấy). Vậy: cấu trúc cấp điều khoản để chunk RAG **có sẵn, máy đọc được**; **cạnh trích dẫn cấp điều khoản thì KHÔNG — phải tự dựng.** Xem [research/task-004-vbpl-provisiontree](../../research/task-004-vbpl-provisiontree/README.md). → TASK-004
4. **Chuỗi sửa đổi MFN 2026 thực sự là gì?** Research 10 và 12 cho các danh sách khác nhau, mỗi cái đều
   không đầy đủ. Xác lập nó từ Công báo. → TASK-009

## Nhật ký phiên làm việc

Thêm một mục mới ở **đầu** phần này vào cuối mỗi phiên làm việc. Giữ các mục
ngắn gọn. Ghi lại cái gì đã thay đổi, cái gì đã học được, và cái gì mà agent tiếp theo sẽ khám phá lại một cách khó
khăn. **Bất ngờ và ngõ cụt là thứ giá trị nhất ở đây** — một kế hoạch cho bạn biết cái gì được
dự định, chỉ cái này cho bạn biết địa hình thực sự đã làm gì.

---

### 2026-08-14 (chiều) — Giai đoạn 8 chốt hướng, M0 xong: LLM sinh giả thuyết, hệ thống kiểm chứng

**Vì sao** — chủ dự án báo ba triệu chứng: hệ thống **quá hẹp**, **thường xuyên tra không ra** văn bản
lẫn mã HS, và **chưa hiểu đúng mã HS**; muốn dùng nhiều LLM hơn mà vẫn đảm bảo kết quả. Đọc code cho
thấy đó là **ba** vấn đề khác nhau: kho chỉ có 7 văn bản (không phải retriever kém — không có gì để
truy hồi); chỉ một cách diễn đạt truy vấn cho mỗi câu hỏi; và phần *quyết định* của phân loại HS
(chú giải Phần/Chương, GRI, bằng chứng) **chưa từng được xây**.

**Ràng buộc chủ dự án chốt**: giữ `claude -p` subscription (không dùng API trả phí) → ngân sách cứng
**2 lần gọi LLM mỗi lượt chat**, job nền không giới hạn; mở rộng kho **cả** bulk **lẫn** tự nạp tức
thì; bằng chứng HS lấy từ TT 31/2022 + SEN 2022 + công văn phân loại + WCO EN (EN chờ license).

**Thiết kế**: [llm-expansion-design.md](../docs/llm-expansion-design.md), ADR
[LLM sinh giả thuyết, không bao giờ khẳng định](../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md),
kế hoạch [03-llm-expansion-tasks.md](03-llm-expansion-tasks.md). Hai điểm tự quyết, ghi rõ trong spec:
**không** thêm mức `auto_gated` (giữ hai mức, đúng ADR kho tự mở rộng); mốc M4 = **top-3 nhóm 4 số ≥ 85%**.

**M0 đã làm — ba việc nền, tất cả có test**
- **Tầng LLM ngừng tắt âm thầm.** Repo trước đây **không** cài CLI `claude` trong image và **không**
  truyền `CLAUDE_CODE_OAUTH_TOKEN` qua compose — một bản deploy sạch chạy hoàn toàn không có LLM mà
  không có gì báo. Nay: `npm i -g @anthropic-ai/claude-code` trong stage `runtime` (dùng chung cho
  `api` và `zalo-bot`), token qua compose + `.env.example`, và `/health` có trường
  `llm: up|no_token|no_cli` (dò có cache 60s). **Cố ý KHÔNG cho nó làm 503** — tra thuế không cần LLM,
  503 vì thiếu CLI sẽ kéo sập nửa tất định của sản phẩm.
- **Tiêu đề điều bị PDF ngắt dòng.** `_is_heading_continuation` + `HEADING_WRAP_MAX`: dòng mở đầu
  bằng **chữ thường** ngay dưới tiêu đề là phần đuôi bị cắt, không phải thân điều.
- **Cổng đo** `yarn eval` (`apps/eval/`): gọi qua HTTP đúng đường người dùng đi — recall@k, từ chối
  đúng, tỉ lệ trả lời có trích dẫn, HS top-1/top-3 chấm ở **nhóm 4 số**. Ghi `fixtures/eval-baseline.json`.

**Đã học — địa hình thật**
- **🔴 Chỉ số "thân điều bắt đầu chữ thường" KHÔNG phân biệt được "vá đúng chỗ cụt" với "nuốt nhầm
  footnote".** Cả hai đều làm con số giảm. Chạy so sánh trước/sau trên 387 điều thật (4 văn bản) mới
  lộ ra: bản sửa đầu tiên **làm hỏng Điều 40 của 25/VBHN-BTC** — tiêu đề vốn sạch `Điều 40. (được bãi
  bỏ)` bị kéo cả footnote văn bản sửa đổi vào. Kho có **41 điều** mang dấu `(được bãi bỏ)`; thêm
  `HEADING_TERMINATED` để tiêu đề dừng ở dấu đó. Bài học lặp lại lần thứ ba trong dự án này: **một chỉ
  số đi đúng hướng không phải bằng chứng thay đổi là đúng** — phải so từng dòng trên văn bản thật.
- **Hằng số chọn bằng đo, không bằng cảm giác.** `HEADING_WRAP_MAX`: 0 → 126/387 tiêu đề cụt, 2 → 2,
  3 → 1. Nới 2→3 đổi **đúng một** điều trên toàn bộ 387 (Điều 87 của 25/VBHN-BTC, tiêu đề thật dài 3
  dòng) và **không đụng** ba văn bản kia — chính sự bất động đó là bằng chứng ngưỡng 3 không thò vào
  thân điều. Chốt 3. Kết quả cuối: **126 → 1** tiêu đề cụt, số điều không đổi (23/149/104/111), 0
  điều bãi bỏ bị nuốt footnote.
- **Cổng tự kiểm phải đi theo parser.** Luật `frag` trong `ingest_document.py` để ngưỡng 0.5 vì tiêu
  đề cụt là chuyện thường; nay không thường nữa → hạ 0.2. Cổng nới rộng hơn thực tế thì im lặng đúng
  lúc cần kêu.
- Test parser là `unittest` stdlib (`yarn test:parser`) — không thêm dependency cho 9 test thuần.

**Còn tồn (không chặn, nhưng M0 chưa đóng)**
- **Chưa build image**: máy dev không có Docker. Dòng `npm i -g @anthropic-ai/claude-code` chỉ mới
  xác nhận package tồn tại (v2.1.232), chưa chứng minh build chạy.
- **Chưa nạp lại kho**: bản sửa parser mới nằm trong code, kho trên VPS vẫn mang tiêu đề cụt.
- **Chưa có baseline**: `yarn eval` cần API sống + DB đã seed. Con số đầu tiên phải chép vào file này.
- Điều 40 của 25/VBHN-BTC vẫn là ca duy nhất còn thân bắt đầu chữ thường — đúng vì đó là footnote,
  không phải tiêu đề.

---

### 2026-08-14 — Kho pháp luật TỰ MỞ RỘNG: chỉ mục Công báo → nạp theo yêu cầu → thăng cấp

**Vì sao** — sau bản vá 13/08, bot trả lời trung thực nhưng cụt: hỏi `36/2016/TT-BKHCN` thì nó liệt kê
thứ mình có rồi dừng. Chủ dự án muốn hệ thống tự đi lấy dữ liệu thay vì đứng yên.

**Không làm "crawl xong trả lời luôn".** Tải văn bản là phần dễ; hai phần khó đều là chỗ sai âm thầm:
(1) không có nguồn máy-đọc-được nào đáng tin để biết văn bản còn hiệu lực — "sơ đồ văn bản" của Công báo
báo NĐ 134/2016 có **0 văn bản sửa đổi** trong khi NĐ 18/2021 sửa rất nhiều; (2) cổng `expect` là tri
thức con người, không ai có cho văn bản lạ. Nên: nạp thì được, **nhưng dữ liệu tự nạp không được lặng lẽ
lên ngang hàng với dữ liệu đã đối chiếu tay**. Thiết kế: [legal-corpus-self-extension](../docs/legal-corpus-self-extension.md).

**Đã làm — ba lớp, tất cả đã LIVE và nghiệm thu**
- **Lớp 1 — chỉ mục `gazette_document`** (migration 0007/0008): crawler Node đi 8 loại VBQPPL trên Công
  báo. **~15.500+ văn bản** (thông tư 9.800 · nghị định 2.668 · luật 823 · …). Tách bạch "văn bản TỒN TẠI"
  với "văn bản ĐÃ NẠP toàn văn" — nhờ đó bot phân biệt được *"tôi chưa nạp"* với *"không có số hiệu này"*.
- **Lớp 2 — nạp theo yêu cầu**: service `apps/ingest` (Python + pdfplumber) làm worker rút hàng đợi
  `ingest_request` bot ghi vào. Tải → parse → **cổng tự kiểm cấu trúc** → chunk → embed → ghi lẻ trong
  MỘT transaction. Bot hỏi trước, người trả lời "nạp", worker chạy vài phút rồi **tự nhắn lại** thread đã hỏi.
- **Lớp 3 — thăng cấp**: cột `verification` + `verified_by` (migration 0009). Văn bản tự nạp vào ở
  `auto_unverified`, **mọi trích dẫn từ nó hiện cảnh báo**; chuyên viên đối chiếu xong thì thăng lên
  `verified` kèm tên — chính là [R9 verify-on-use](../business-rules.md) mở rộng từ mã HS sang văn bản.

**Nghiệm thu toàn tuyến (2026-08-14)**: hỏi `36/2016/TT-BKHCN` → không có thật → bot nêu *"số hiệu gần
giống, KHÁC văn bản bạn hỏi"*, không mời nạp. Hỏi `36/2016/TT-BCT` → có thật → mời nạp → xếp hàng →
worker tải, parse **14 điều/57 khoản**, qua cổng, embed 57 chunk, ghi vào kho `auto_unverified` → hỏi lại
trả lời có căn cứ, trích dẫn mang nhãn cảnh báo → `POST /ingest/verify` → thành `verified · Ngọc Nhật`.

**Đã học — xem [ghi chú thiết kế](../docs/legal-corpus-self-extension.md#địa-hình-thật--những-thứ-chỉ-lộ-ra-khi-chạy-2026-08-14)**
cho cả 5 cái bẫy. Ba cái đắt nhất: trang vượt phạm vi **bị clamp** chứ không rỗng (crawler dừng sai =
chạy vô tận); **slug danh mục không cho biết loại văn bản** (705 nghị định bị gắn nhãn thông tư → suy loại
từ chính số hiệu); và **CDN tải file không gửi chứng thư trung gian** nên Python không verify được —
sửa bằng cách nhúng chứng thư GlobalSign có **ghim SHA-256**, không tắt verify.

Một luật cổng tự kiểm đã phải gỡ vì **báo động giả trên bản parse đúng** (5/23 điều), hoá ra chỉ là đuôi
tiêu đề bị PDF ngắt dòng. Cổng kêu oan trên văn bản lành thì sẽ bị bỏ qua đúng lúc cần nhất.

**Còn tồn** — tiêu đề dài hơn một dòng PDF bị cắt đuôi vào thân điều; ảnh hưởng nhãn trích dẫn của **cả
kho**, không riêng văn bản tự nạp. Sửa phải đụng parser + nạp lại toàn bộ, chờ chủ dự án quyết.

---

### 2026-08-13 — Bot Zalo có BỘ NHỚ HỘI THOẠI + định tuyến theo chủ đề; corpus 4→7 văn bản

**Triệu chứng** — chủ dự án test thật: hỏi về một **Thông tư**, bot trả lệch; reply *"không phải câu
trả lời tôi muốn. bạn tìm đúng thông tư mà tôi yêu cầu"* → bot đáp *"Đã ghi nhận: mã trước chưa đúng.
Bạn gửi MÃ HS đúng"*. Bot nhảy từ pháp luật sang đính chính mã HS.

**Nguyên nhân — một vị từ.** Cổng vào luồng đính chính là `(có lastLookup) || !!quote`. **Chỉ cần bấm
reply là lọt**, rồi cụm "không phải" khớp `CORRECTION_CUE`. Sâu hơn: trạng thái duy nhất bot giữ là
`lastLookup` (Map trong RAM, chỉ nhớ mã HS gần nhất, TTL 30′) — không lịch sử, không chủ đề, không
trạng thái pháp luật. Mỗi tin là một phiên độc lập.

**Đã làm**
- **Bộ nhớ hội thoại trong Postgres** — migration `0006`, bảng `conversation` + `conversation_turn`,
  module API `/conversation` (GET / POST turn / DELETE). `topic` là cột thật, `state` là jsonb.
  Quy ước vá: thiếu trường = giữ, `null` = xoá. Dọn ngay khi ghi: 20 lượt/hội thoại, 30 ngày
  (**[R14](../business-rules.md)** — staff dán tên/SĐT/số lô của khách vào chat).
- **Tách bot thành module** (873 dòng → 8 file) để phần quyết định là **hàm thuần test được**:
  `dispatch.mjs` (nhánh), `conversation.mjs`, `router.mjs`, `answer.mjs`, `format.mjs`, `parse.mjs`,
  `api.mjs`, `images.mjs`. **Deploy đổi: copy CẢ thư mục, không phải một file.**
- **Tín hiệu tiếp nối đọc theo chủ đề** (**[R13](../business-rules.md)**) — regex đường tắt VÀ kết quả
  của LLM router đều bị `guardIntent` chặn: "correction"/"confirm" không tới được handler ghi sổ nếu
  chủ đề không phải tra thuế và không còn kết quả để trỏ tới.
- **Router thấy hội thoại**: transcript 6 lượt + tóm tắt state + **danh mục văn bản trong kho**; trả
  thêm `search_query` (**viết lại câu hỏi thành độc lập** — cách chuẩn chữa RAG nhiều lượt), `doc_number`,
  `article`, `reuse_last_hs`, và `lead`.
- **Lời dẫn tự nhiên, cưỡng chế bằng code**: `sanitizeLead` bỏ lead chứa `%`; lead trích Điều/Khoản/mã HS
  chỉ được giữ nếu chuỗi đó CÓ trong khối tất định sắp in ra. Footer/dòng "Trích nguyên văn" thành có
  điều kiện.
- **Nhắm đúng văn bản**: `legal.scope.ts` (khớp **từ vựng** trên số hiệu — số hiệu là định danh, không
  phải văn xuôi; nhánh `consolidates` để "NĐ 08/2015" ra đúng VBHN), hard filter `doc`/`article` trong
  `hybridRetrieve`, `GET /legal/documents`, `GET /legal/provision`. Kho không có văn bản được hỏi →
  **liệt kê những gì kho có**, không đưa đoạn gần nhất của văn bản khác.
- **Corpus 4 → 7 văn bản** (2001 → 4472 provisions, 809 → **1807 chunks**): thêm **54/VBHN-VPQH** (Luật
  Hải quan, 8/104), **25/VBHN-BTC** (TT 38/2015 + 39/2018 thủ tục HQ, 9/149), **33/2023/TT-BTC** (xuất
  xứ XNK, 5/23). Cả 7 qua cổng `expect`.
- Test: `yarn test:bot` (20 ca thuần, gồm **đúng ca trong ảnh chụp**) + 3 ca scope mới trong golden spec.

**Đã học — địa hình thật**
- **🔴 Thứ tự KHÔNG đủ để nhận diện tiêu đề điều.** Lần đầu tôi lọc "Điều N" theo tính tăng dần —
  46/VBHN-BTC **mất 28/111 điều**: một tham chiếu chéo số CAO ("Điều 50 của Luật Hải quan") nâng mốc
  rồi nuốt hết điều thật phía sau. Luật đúng = **dấu chấm** (tiêu đề thật có "Điều 12.") **hoặc** đúng
  bằng `điều trước + 1`. Cả hai văn bản cũ giữ nguyên chương/điều và 46/VBHN-BTC còn **thu thêm +39
  khoản/+57 điểm** trước đây bị nuốt.
- **🔴 "Phụ lục" viết thường KHÔNG phải ranh giới phụ lục.** Thông tư thủ tục dẫn phụ lục ở gần như mọi
  điều và PDF ngắt dòng ngay đó → 25/VBHN-BTC dừng sau **7/149** điều. Chỉ dòng CHỈ CÓ marker, hoặc
  `PHỤ LỤC` viết HOA, mới là ranh giới.
- **🔴 Drizzle không bind mảng JS thành mảng Postgres**: `= ANY(${ids})` → `= ANY($1,$2)` → *malformed
  array literal*. `inArray()` cần đối tượng cột mà SQL thô có alias thì không có → dùng `inIds()`
  (`col IN ${inIds(ids)}`), vẫn là tham số bind.
- **Search của congbao.chinhphu.vn không chạy server-side** (mọi query trả về trang chủ) và slug trong
  URL **không được kiểm** — `/van-ban/<slug bất kỳ>-<id>.htm` luôn 200. Tìm TT 33/2023 phải quét `id`
  rồi đọc `<title>` (ra **39571**). Link tải là token g7 hết hạn nhanh → lấy từ chính trang nội dung.
- **25/VBHN-BTC nằm ở 8 kỳ Công báo** (913+914 → 927+928); chỉ **4 kỳ đầu** chứa điều, phần còn lại là
  phụ lục/biểu mẫu.

**Bắt được khi nghiệm thu trên VPS — luật parser thứ BA**

Seed xong lần 1, kiểm tra ngẫu nhiên phát hiện **6 điều bị mất tiêu đề**: Điều 18/33/51/71 của
25/VBHN-BTC và 9/20 của 33/2023. Nguyên nhân là dạng mà **cả hai luật trước đều không bắt được**: một
tham chiếu chéo mà số của nó **tình cờ đúng bằng `điều trước + 1`** → lọt qua nhánh chấp nhận-không-dấu-chấm.
Nó không chỉ thêm điều ma, nó **cướp tiêu đề của điều thật** — `Điều 18. Khai hải quan` biến thành
"Điều 18 Luật Hải quan và lấy mẫu hàng hóa…", thân điều bắt đầu giữa câu, nhãn trích dẫn trỏ sai chủ đề.
Đúng dạng sai âm thầm mà [R2](../business-rules.md) tồn tại để chặn.

Không thể chữa bằng cách **bắt buộc dấu chấm**: "Điều 71 Thủ tục xử lý phế liệu…" là tiêu đề THẬT bị
PDF ăn mất dấu chấm — siết là mất Điều 71. Phân biệt bằng **thứ đứng ngay sau số**: tiêu đề đi kèm
TÊN ĐIỀU, tham chiếu đi kèm TÊN VĂN BẢN ("Luật", "Nghị định", "Thông tư này") hoặc chữ cái phụ ("51a").
`DIEU_REFERENCE` chặn đúng 6 ca, giữ nguyên Điều 71, cả 7 văn bản vẫn qua cổng `expect` (+3 điểm thu
lại). Phải nạp lại lần 2 (~55′) — cái giá của việc **kiểm tra ngẫu nhiên nội dung sau khi seed**, không
chỉ tin vào số đếm chương/điều.

**Đã deploy + nghiệm thu (2026-08-13)** — 7 docs · 4475 provisions · 1806/1806 chunks đã embed; 12 route
map đúng; bot khôi phục session (không cần quét QR lại); `Điều 18 TT 38/2015` trả đúng "Nguyên tắc khai
hải quan"; hỏi văn bản ngoài kho → `missingDoc` + abstain; hồi quy `8481.80.99 CN` → MFN 10% + 4 FTA;
bộ nhớ hội thoại sống sót qua 2 lần recreate api.

**Còn tồn / quyết định**
- Đã commit (`a117816`) và **đã đối chiếu checksum: VPS khớp HEAD** trên toàn bộ file seed/bot/api —
  lần deploy sau bằng `git archive HEAD` sẽ không lùi bản.
- **NĐ 134/2016 (miễn/giảm/hoàn thuế) KHÔNG nạp.** Chủ dự án có chọn, nhưng Công báo **không có VBHN**
  hợp nhất nó (NĐ 18/2021 đã sửa rất nhiều), mà [ADR dùng VBHN đã công bố](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)
  cấm tự hợp nhất. Nạp bản gốc = phục vụ điều khoản đã bị sửa — đúng dạng sai âm thầm dự án này sợ
  nhất. Miễn/giảm/hoàn đã có ở cấp luật qua 96/VBHN-VPQH. **Cần chủ dự án quyết** nếu muốn nạp kèm cảnh
  báo hiệu lực.
- **Chưa deploy VPS.** Cần: `docker compose build migrate` → `run --rm migrate` (0006) →
  `FORCE_RESEED=1 seed-legal` (**embed 1807 chunks ≈ 35-40′** trên VPS) → `up -d --force-recreate api
  zalo-bot` (copy CẢ thư mục `apps/zalo-bot/`).

---

### 2026-07-20 — Bot Zalo hiểu ẢNH + tin QUOTE (vision → đường thuế tất định)

**Đã làm** — bot cũ bỏ 2 nguồn ngữ cảnh: ảnh (content là object / `quote.attach`) và tin được reply (`quote.msg`). Sửa trong [apps/zalo-bot/index.mjs](../../apps/zalo-bot/index.mjs):
- **Ảnh** → `claudeVision` đọc ảnh (claude subscription, tool Read) → keywords/hs_hints/origin → `tariffByClues` (DB tất định, **không LLM tính số**). Có ack "🔍 Đang xem ảnh…". Xử lý cả ảnh-gửi-kèm lẫn *reply vào ảnh*. Không xuất xứ → MFN + nhắc gửi xuất xứ.
- **Reply/quote** → `mergeQuote` ghép ngữ cảnh cho câu hỏi tiếp nối. `answer(text, routerText)`: regex HS chỉ soi câu MỚI, router LLM thấy ngữ cảnh.
- Thiết kế: [../docs/zalo-bot-image-and-quote-context.md](../docs/zalo-bot-image-and-quote-context.md).

**Đã học — địa hình thật**
- **🔴 Prompt injection qua caption**: `claude --allowedTools Read` KHÔNG giới hạn = đọc được `/session/zalo-session.json` (credential Zalo bot) rồi tuồn ra qua `note`/`keywords` bot echo. Bịt bằng **confine Read vào thư mục cô lập**: cú pháp path tuyệt đối của Claude Code là **`Read(//tmp/zalo-vision/**)`** (HAI gạch chéo) + `cwd` cô lập. Test VPS: đọc được ảnh staged, `/session` bị chặn. Mẫu tái dùng cho mọi LLM-subprocess trên input người dùng.
- **`claude -p` cần cấp quyền tool**: mặc định từ chối Read; phải `--allowedTools`, và prompt đẩy qua **stdin** (nếu để sau `--allowedTools` sẽ bị nuốt làm giá trị cờ).
- **Vision khả thi & miễn phí** qua subscription CLI (~15-30s/ảnh); zca-js 2.1.2 **không** có helper tải ảnh → `fetch(href)`.
- Video/file cũng có `thumbUrl` zadn → phải lọc theo `msgType` + Content-Type kẻo nhận nhầm là ảnh.

**Sửa tiếp sau test thật (cùng ngày)** — [chi tiết](../docs/zalo-bot-image-and-quote-context.md):
- **`detectOrigin` bịa xuất xứ**: "**Hàng** mới"⊃"hàn"→KR (và "anh"⊂"nhanh", "in"⊂"inch", "phi"(Ø)…). Sửa: khớp **ranh giới từ** + chỉ nhận tên nước rõ / mã ISO HOA đứng riêng; thà null còn hơn sai. `keywordFrom` cũng strip theo ranh giới từ.
- **Đính chính không được ghi nhận**: `handleCorrection` — staff sửa ("HS đúng là X") → ghi mã cũ = `wrong` + nguyên văn lời sửa vào `/tariff/confirm` (cột `note` có sẵn), tra mã đúng, mời "đúng" chốt. "đúng là <mã cũ>" = xác nhận. Đơn "đúng/sai" vẫn về `confirmVerdict`.
- **Số % thừa "0000"**: thêm `pct()` ở [tariff.service.ts](../../apps/api/src/modules/tariff/tariff.service.ts) rút số 0 đuôi trong `statement` ("10.0000%"→"10%"). Value-preserving; phủ web+bot (cả hai đọc `statement`). Recreate api riêng.

*(Bối cảnh: Giai đoạn 5 — Legal RAG 4 nhóm đã ship 2026-07-19, xem memory `legal-rag`; file này khi đó chưa cập nhật.)*

---

### 2026-07-18 — Giai đoạn 3: web UI + bot Zalo, deploy VPS Contabo

**Đã làm** (chủ dự án đổi hướng: lật ADR web-app-only, thêm điều khiển Zalo, YÊU CẦU self-contained)
- **Web UI** `public/index.html` (serve-static): tra cứu honesty-first (nghị định + as-of + điều kiện C/O + banner độ cũ) + **vòng xác nhận in-app** (đúng/sai/không chắc → `lookup_confirmation`, migration 0003, `POST /tariff/confirm` + `GET /tariff/confirmations`).
- **Bot Zalo** `apps/zalo-bot/` (zca-js, ESM): nhắn "8481.80.99 TQ" → thuế MFN + FTA có điều kiện + CBPG + độ cũ dạng text. Client thuần của `/tariff` (không LLM). Session lưu volume, QR login (tự làm mới ~90s tới khi quét).
- **Self-contained**: một `docker-compose.yml` = db+migrate+**seed**+api(web)+zalo-bot. Seed idempotent (skip nếu đã có data). Đổi server = `docker compose up`. ADR [self-hosted-zalo-bot](../architecture-decisions/2026-07-18-self-hosted-zalo-bot.md).
- **Deploy VPS Contabo** (`ssh vps-contabo`, Ubuntu 24.04, Docker+Caddy): git archive → /opt/customs-assistant → `docker compose up --build`. Live: seed 172.962, /health ok, web + /tariff + confirm chạy, bot sinh QR. Caddy: site block `bieuthue.ngocnhat.info` → 127.0.0.1:3000 + basic_auth (giữ nguyên block agent-webhook). restart:unless-stopped cho db/api/bot (sống lại sau reboot).

**Đã học — địa hình thật**
- **congbao/Caddy định tuyến theo domain; DNS chưa có wildcard** → subdomain mới cần A record của chủ dự án. Bot Zalo KHÔNG cần domain (nối thẳng Zalo).
- **zca-js QR hết hạn thì throw** → ban đầu bot crash-restart; sửa thành vòng lặp tạo QR mới, process ổn định.
- **Rủi ro đã ghi**: zca-js vi phạm ToS Zalo → dùng TÀI KHOẢN BOT RIÊNG, không dùng Zalo cá nhân.

**Chờ chủ dự án**: DNS A record (web HTTPS) + quét QR (kích hoạt bot). basic_auth web: khaibao / (đã đưa).

---

### 2026-07-18 — Đóng gói Giai đoạn 1 cho production (seed + test CI + dọn nit)

**Đã làm** (chủ dự án chọn hướng "đóng gói production" sau khi 12 task xong)
- **A — Seed hợp nhất:** gộp 3 load script research thành **`yarn db:seed`** (`db/seed/index.ts` + `db/seed/data/`). Idempotent (TRUNCATE + nạp), **portable (không textutil)**, đọc extract JSON đã commit. Verify fresh: 172.962 dòng, golden 249/249. Extract canonical chuyển về `db/seed/data/`; bản research regenerate gitignored; xoá 3 load script cũ.
- **B — Golden set thành test CI:** `db/seed/golden.spec.ts` (jest) — corpus 249/249 + hồi quy xăng (10→0→10) + star-case (MFN 10% + 4 FTA 0%). Guard `DATABASE_URL`: có DB → 4/4 (giờ 5/5 với health 503); không DB → skip sạch (CI không fail).
- **C — Dọn nit review scaffold:** bỏ alias `@app/database` chết (tsconfig+jest; không ai dùng, footgun runtime); `/health` trả **503** khi degraded; `engines.node` `>=22`→`22.x`; drizzle fallback URL đúng (5433); doc: README 7→10 ADR + db/, code-organization bỏ ngụ ý `shared/kernel/` tồn tại + ghi `db/seed/`.

**Đã học**
- **Tách "nạp" khỏi "parse".** Parse `.doc` cần `textutil` (macOS) → giữ ở `research/` như bước vận hành host. Seed chỉ chèn JSON → portable, chạy trong container. Extract `.ndjson` commit là ranh giới bền giữa hai bên.
- **Golden set = cổng hồi quy thật.** Giờ đổi schema/loader mà làm lệch dữ liệu là `yarn test` đỏ.

**Tiếp theo** — Giai đoạn 1 đã shippable. Mở rộng: RCEP, mức 144/108/199 từng dòng, NQ 25/2026. Rồi Giai đoạn 2 (gợi ý HS) / Giai đoạn 3 (UI + vòng Zalo).

---

### 2026-07-18 — Nạp 4 biểu FTA + TASK-012 nghiệm thu: Giai đoạn 1 HOÀN TẤT

**Đã làm**
- Nạp 4 biểu FTA công ty dùng từ Công báo (`research/fta-loader/`, `parse_fta.py` + `load_fta.ts` tham số hoá): ACFTA (118/2022, 10 phần, 1 cột) · ATIGA (126/2022, 9 phần, 6 cột-năm) · EVFTA (116/2022, 16 phần, 6 cột giảm dần) · AANZFTA (121/2022, 1 `.docx` datafiles, 1 cột). Mỗi biểu 11.414 mã; ATIGA/EVFTA nạp 6 khoảng một-năm/mã (~68k dòng). Mức FTA có điều kiện (`requires_co`).
- **TASK-012 nghiệm thu (`research/task-012-acceptance/validate.ts`): corpus 249/249 khớp 100%** (MFN 192 + ACFTA 25 + AANZFTA 26 + ATIGA 4 + EVFTA 2); curated 47/47. **Mẫu ngẫu nhiên 20/20** khớp verbatim ô nguồn. → **toàn bộ Giai đoạn 1 đối chiếu được với thực tế.**

**Đã học — địa hình thật**
- **Cấu trúc FTA khác nhau:** ACFTA/AANZFTA một mức 2022–2027; ATIGA/EVFTA một cột mỗi năm (tra 2026 = cột 2026; EVFTA giảm dần 5→0%). Phải kiểm distribution rate-count trước khi map năm, không giả định.
- **congbao định tuyến theo id nội bộ, bỏ qua slug** — dò URL AANZFTA bằng slug vô ích (id là của văn bản khác). Lối thoát: `datafiles.chinhphu.vn/cpp/files/vbpq/.../<số>_<năm>_nd-cp_*.docx` (không token, ổn định). `textutil` đọc `.docx` như `.doc`.
- **RCEP khác hẳn (51 phần, cột-theo-nước RCEP_CN/JP/KR/AU/NZ)** — golden set không dùng → cố ý để sau, không ép vào khuôn ACFTA.
- **249/249 = đúng con số cross-check golden set** — oracle độc lập (tờ khai thật) đồng thuận 100% với dữ liệu nạp từ Công báo. Đóng vòng: golden set (TASK-001) ↔ pipeline (TASK-007→011).

**Tiếp theo**
- Giai đoạn 1 xong. Mở rộng tùy chọn: RCEP; áp mức 144/108/199 từng dòng; NQ 25/2026. Rồi Giai đoạn 2 (gợi ý HS top-3).

---

### 2026-07-18 — TASK-010 + TASK-011: API tra cứu + phát hiện độ cũ, live

**Đã làm**
- Module `apps/api/src/modules/tariff/` (controller + service + types): `GET /tariff?hs=&date=&origin=`. SQL keyed qua `db.execute(sql\`\`)`, **vị từ khoảng**, **không LLM**. Rate là view có kiểu (ad_valorem/specific/excluded/trq) + `statement` chữ; FTA/Ch.98 trả **có điều kiện**; CBPG khoản riêng; staleness (snapshotDate + reliableThrough −48 ngày + stale/warning). Đăng ký vào `app.module`, build tsc sạch, chạy `node dist/apps/api/main.js`.
- Kiểm chứng live (dữ liệu ND 26/2023): star-case 8481.80.99→MFN 10%; 0301.11.10→15(NK)/0(XK); 2710.12.21→10; 0407.21.00→TRQ trong 40/ngoài 80; 9804.15.00→Ch.98 27% có điều kiện; 400 cho hs xấu; 404 cho dòng không-rate; **TASK-010 acceptance**: snapshot 2026-03-15/query 2026-03-10→stale+warning.

**Đã học — địa hình thật**
- **Tra cứu = SQL thô, cố ý.** Không dùng query-builder có type → giữ vị-từ-khoảng hiện rõ (đúng ADR bitemporal) và **né footgun path-alias** (`@db/schema` build ra không resolve runtime; phát hiện ở review scaffold). Không import schema vào API.
- **Server nền: đừng lồng `&` trong run_in_background** — process bị mồ côi/thoát. Chạy trực tiếp (tool tự background).
- **Rate không bao giờ là số trần.** Mỗi loại có `statement` chữ; FTA "0% nếu có C/O form Y, ngược lại MFN"; excluded "không phải 0%"; trq "trong/ngoài hạn ngạch". Đây là chỗ nguyên tắc research 12 thành code.

**Tiếp theo**
- Nạp biểu FTA để `preferential[]` có dữ liệu (star-case trả 0% ACFTA). → TASK-009 (cắt khoảng 2026) → TASK-012.

---

### 2026-07-18 — TASK-008: nạp ND 26/2023 (parser nhận biết phụ lục), 13/13 live

**Đã làm**
- Tải 14 phần `.doc` ND 26/2023 từ Công báo (link g7 có token). Parser `parse_nd26.py`: textutil → tách ô `\x07` → **gán phụ lục hạng nhất** (marker tiến-một-chiều) → `load.ts` nạp `tariff_rate`. **13/13 acceptance** trên Postgres thật. Tổng 13.161 dòng.
- Kết quả: Annex I 1.520 · Mục I MFN 11.150 · Chương 98 460 (schedule riêng) · Annex IV 31 (+ đánh dấu trq). Nomenclature Annex II 11.874 unique — **khớp research 12**. `0301.11.10`=15(NK)/0(XK); `0306.15.00`=10(MFN, không phải 27 của Ch.98); `2710.12.21`=10.

**Đã học — địa hình thật (3 cạm bẫy)**
- **Bẫy chữ HOA phá annex detection.** `.upper()` cả ô rồi so → tiêu đề nghị định "Biểu thuế nhập khẩu" (thường) khớp → lật sang Annex II **trước bảng xuất khẩu**, nuốt trọn Annex I. Sửa: so **case gốc** (header thật viết HOA). Bài học: đừng normalize case khi chính case là tín hiệu.
- **Chương 98 (Mục II) là bảng 4 cột** `98xx | mô tả | mã tương ứng Mục I | thuế`. Cột "mã tương ứng" (vd `0306.15.00`) bị đọc thành **551 dòng HS8 giả** mang thuế Chương 98 (27%), chồng lên MFN thật (10%). "Keep first" tình cờ cứu (Mục I đứng trước), nhưng phải sửa gốc: nhận diện `98xx`, **tiêu thụ** mã tương ứng làm cross-ref. Bài học: **cùng một mã HS mang nghĩa khác nhau theo cột/mục** — phải hiểu layout, không quét mù.
- **Mô tả soft-break thành nhiều ô** làm parser một-ô bỏ sót rate (`2903.91.00`). Sửa: quét tới RATE đầu tiên, dừng ở HS8 kế. Sau sửa khớp research 12 chính xác.
- **Số đếm là oracle thật.** 11.874/11.160 của research 12 (tạo độc lập) khớp → xác nhận trích đúng nomenclature. Chênh 10 (11.150 vs 11.160) truy được: mã cross-ref Ch.98 mà parse ngây thơ đếm nhầm vào Mục I.

**Tiếp theo**
- Nạp các biểu FTA (ACFTA/AANZFTA/ATIGA/EVFTA/RCEP) — nghị định riêng, cùng parser. Cần cho star-case 8481.80.99 (0% ACFTA) ở TASK-011/012.
- TASK-009: xác lập chuỗi sửa đổi MFN 2026 từ Công báo (144/2024, 199/2025, 72/2026…); **cắt khoảng** hiệu lực để thỏa EXCLUDE (ND 72/2026 hết 30/04/2026 → hồi quy ND 26/2023).

---

### 2026-07-18 — TASK-007: schema biểu thuế (bitemporal + phụ lục + CBPG), chứng minh live

**Đã làm**
- Viết schema Drizzle `db/schema/index.ts`: `hs_version` (chiều phiên bản HS), `decree` (4 mốc ngày), `annex` (phụ lục hạng nhất), `tariff_schedule` (MFN/FTA + `requires_co`), `tariff_rate` (lõi, bitemporal, append-only), `anti_dumping_duty` (CBPG tách riêng).
- Migration `0001` (Drizzle sinh): CHECK shape theo `rate_type`/`duty_kind`, FK, **annex NOT NULL**. Migration `0002` (viết tay, custom): `btree_gist` + **EXCLUDE** cấm 2 dòng sống chồng khoảng hiệu lực + **trigger append-only** (cấm DELETE; UPDATE chỉ được đóng dấu `superseded_at`).
- Proof `research/task-007-schema/prove_schema.ts` trên Postgres thật: **17/17**. Clean-clone `docker compose up --build` → migrate 0000→0002 → `/health` ok. Dọn sạch (`down -v`).

**Đã học — địa hình thật**
- **EXCLUDE khả thi CHÍNH VÌ bộ nạp cắt khoảng.** Ca hồi quy ND 72/2026 không mô hình bằng "mới nhất thắng" (vi phạm "không ORDER BY date DESC"). Thay vào đó: cắt khoảng gốc ND 26/2023 thành `[.., 03-08]` và `[05-01, ..]`, chèn `[03-09, 04-30]` của 72/2026 vào giữa → 3 khoảng **rời nhau**, `daterange('[]')` canonical hóa thành các range kề-mà-không-chồng, vị từ khoảng trả **đúng 1 dòng**/ngày. Đây là ràng buộc cứng cho TASK-008/009: **bộ nạp phải cắt khoảng**, không chèn đè.
- **Trigger append-only so nguyên dòng.** `NEW IS DISTINCT FROM OLD` sau khi ép `superseded_at` bằng nhau → phát hiện mọi thay đổi cột khác mà không cần liệt kê cột; hợp cho cả 2 bảng (đều có `id`). `TRUNCATE` KHÔNG kích trigger DELETE cấp-dòng → reset test được.
- **`bridge` customs.gov.vn trả DATA THẬT từ môi trường agent** (thử HS 8481 → JSON đủ cột FTA). Cùng với Công báo + CDN `.doc` đều thông → phần tồn TASK-002 (bắt sample) làm được, và TASK-008/009 **không cần chủ dự án tải file**.

**Tiếp theo**
- TASK-008: nạp ND 26/2023 từ `.doc` Công báo bằng parser task-003. Bộ nạp phải: gắn `annex_id` thật (không default), **cắt khoảng** khi có nghị định đè, map `*`→excluded / USD→specific. Cross-check số đếm research 12 (11.874 mã / 11.160 có thuế) + khẳng định hai-phụ-lục `0301.11.10` = 15 (NK) & 0 (XK).
- **Chờ chủ dự án 1 quyết định:** ngoài MFN (ND 26/2023), nạp thêm biểu FTA nào (mặc định đề xuất: 4 FTA quan sát trong 117 tờ khai — AANZFTA/ACFTA/ATIGA/EVFTA — + RCEP đã chứng minh).

---

### 2026-07-18 — TASK-006: khung sườn repo (NestJS + Docker + Drizzle)

**Đã làm**
- Dựng monorepo NestJS (`apps/api`) + Docker Compose (Postgres 17 + pgvector) + Drizzle (migration SQL) + Yarn 4 (Corepack). Module `health` chứng minh boot + DB + pgvector. Migration `0000_enable_pgvector.sql` (custom, bật `vector`).
- Verify thật: clean-clone (copy cây trừ gitignored, không `node_modules`) → `docker compose up --build` → `db` healthy → `migrate` exit 0 → `api` boot → `/health` = `{"status":"ok","db":"up","pgvector":"0.8.5"}`. Idempotent (up lại 2 lần, migration count = 1). Quyết định ghi ở [ADR công cụ repo](../architecture-decisions/2026-07-18-repo-tooling-drizzle-yarn.md).

**Đã học — địa hình thật**
- **Cổng 5432 đụng Postgres local của máy dev** → publish db ra host **5433** (trong compose api vẫn `db:5432`). Publish DB ra cổng phổ biến là bẫy "chạy trên máy bất kỳ".
- **`typescript@latest` = 7.0.2** (bản Go-native mới) và `@types/node` = 26 — quá mới, vỡ ts-jest/ts-node/NestJS. Pin TS **5.9.x**, @types/node 22. Đừng lấy "latest" cho toolchain.
- **Yarn 4 tắt build script** (hardened) → esbuild vẫn chạy nhờ optional-dep binary theo platform (cài trong container = binary linux đúng kiến trúc). `tsx` chạy migrate TS OK.
- **NOTICE "already exists, skipping" từ postgres.js trông như lỗi** khi migrate chạy lại — tắt bằng `onnotice: () => {}`. Idempotency thật ở tầng migrator (skip theo hash).
- **⚠️ Mâu thuẫn ngôn ngữ doc chưa chốt:** AGENTS.md nói doc tiếng Việt; project-context.md + 00-bootstrap.md nói tiếng Anh (đều viện dẫn AGENTS.md). Theo AGENTS.md (tiếng Việt) tới khi chủ dự án quyết.

**Tiếp theo**
- TASK-007: schema biểu thuế bitemporal + nhận biết phụ lục + tách CBPG. `db/schema/` + `db/migrations/` đã sẵn.
- Lưu ý commit: scaffold đang trên branch `task-003-evfta-parser` lẫn với work task-003/004 — cân nhắc tách branch riêng cho TASK-006.

---

### 2026-07-18 — TASK-004: provisionTree của vbpl (một phần) + gateway MoJ

**Đã làm**
- Lấy mẫu **21 văn bản đã công bố** (4 Luật, 7 Nghị định, 10 Thông tư; 2014 → 15/07/2026) + 1 control, qua Server Action vbpl.vn. Dùng Playwright khám phá `next-action` hash một lần, rồi replay bằng Python stdlib (`urllib`) — reproducible. Parser + bằng chứng: `research/task-004-vbpl-provisiontree/`.
- Trả lời câu hỏi mở #3: **MỘT PHẦN.** `provisionTree` (trường) = `null` trên 21/21; `referenceProvisions` = `null` trên mọi tham chiếu. NHƯNG cây điều khoản Chương→Điều→Khoản→Điểm CÓ qua một action khác.

**Đã học — bất ngờ lớn**
- **Research 04 đúng về trường nó thấy, nhưng bỏ sót một Server Action.** Trang chi tiết có ≥3 action: `0fb12b3561…` (payload chi tiết: references[], `provisionTree:null`), `94635012466e…` (**cây outline điều khoản đầy đủ** — cái research 04 không thấy), `4a3423ce…` (payload nhỏ khác). Bài học: **"trường X null" ≠ "dữ liệu X không tồn tại"** — có thể nó ở một action/endpoint khác. Liệt kê hết action trước khi kết luận.
- **Cấu trúc cấp điều khoản CÓ, cạnh trích dẫn cấp điều khoản thì KHÔNG.** Cây outline đầy đủ (5 → 1.300 node, cả văn bản cũ đã di trú như TT 200/2014). Nhưng tham chiếu chỉ nối văn bản↔văn bản; `referenceType` là số nguyên (8 giá trị: 1,3,4,7,8,9,10,12), không có ánh xạ nhãn. → Giai đoạn 5: chunk RAG cấp điều khoản làm được từ outline+nội dung; **đồ thị trích dẫn cấp điều khoản phải tự dựng.**
- **URL id là ItemID số (văn bản di trú) HOẶC UUID (văn bản tạo sau relaunch 2026-04-23).** Body action = `["<id>"]` cho cả hai. Dạng không-slug `--<id>` hoạt động (cả số lẫn UUID). `next-action` hash vỡ theo mỗi deploy — script có bảo vệ stale-hash.
- **Tham chiếu treo có thật:** control `12898` (chưa công bố, `Confirm_Step2`) → HTTP 500. Bộ nạp đồ thị phải chịu được cạnh gãy.
- **Bonus gateway MoJ:** base URL `https://vbpl-bientap-gateway.moj.gov.vn/api` hardcode trong bundle client (axios, timeout 600s). Còn sống (`/actuator/health` UP; `/api` → 404 JSON Spring). Nhưng **route không ánh xạ được từ client** — không literal `/api/...` trong ~4MB JS; đường dẫn ghép động, gọi phía server. Đúng như research 04.

**Tiếp theo**
- TASK-004 không đổi quyết định v1 (vẫn Postgres-only, v1 không đụng vbpl). Tiếp: TASK-006 (khung repo) / TASK-007 (schema).

---

### 2026-07-18 — TASK-003: parser EVFTA ("lỗ hổng" hóa ra là giả)

**Đã làm**
- Chứng minh dòng sáu-thuế-suất EVFTA parse được. Tải ND 116/2022 (EVFTA) + ND 129/2022 (RCEP) từ Công báo (link `.doc` g7 có token), `textutil -convert txt` → tách theo dấu ô Word.
- EVFTA `2101.11.11` → 6 ô `29/25,4/21,8/18,1/14,5/10,9` (773/773 dòng đúng 6 cột). RCEP `0101.21.00` → 6 ô `0` (không hồi quy; 9 dòng có `*` loại trừ).
- Parser lưu `research/task-003-evfta-parser/` cho TASK-008.

**Đã học — bất ngờ lớn**
- **"Lỗ hổng EVFTA" là GIẢ.** `2925,421,818,114,510,9` không dính — sáu ô ngăn bởi `\x07` (BEL, dấu ô Word, KHÔNG hiển thị). Research tưởng dính chỉ vì không thấy `\x07`. Bài học: **ký tự điều khiển vô hình giả làm "dữ liệu hỏng"** — `repr()` bytes trước khi kết luận không parse được.
- **Delimiter khác theo văn bản:** EVFTA `\x07`; RCEP mỗi ô một dòng `\n`. Parser phải tách cả hai VÀ kiểm tra bề rộng dòng (6 cột) + gắn cờ ngoại lệ (15 dòng 0-cột + 9 dòng `*` của RCEP lộ ra, không bị nuốt).
- **Không cần LibreOffice.** textutil (macOS) đủ; LibreOffice→`w:tbl` nặng hơn, giữ làm dự phòng.

**Tiếp theo**
- Giai đoạn 1 gồm được EVFTA + RCEP (không chỉ MFN). Tiếp: TASK-006 (khung repo) / TASK-007 (schema).

---

### 2026-07-18 — Golden set từ tờ khai thật + cross-check 249/249

**Đã làm**
- Chủ sở hữu đưa 137 tờ khai PDF (Google Drive) + biểu thuế thương mại (`BIEU THUE XNK 2026.04.05`, 19.901 dòng × 109 cột) + 2 file SOP khai báo nội bộ.
- Bóc song song 117 tờ nhập khẩu bằng workflow (14 agent) → 100 tờ đọc được, 259 dòng hàng; 18 tờ xuất khẩu → 41 dòng (thuế XK = 0).
- Dựng golden set: `fixtures/golden-set/cases.yaml` (55 tinh tuyển) + `import-corpus.yaml` (259, pool TASK-012). Ghi chú `concepts/company-data-assets.md` (5 nguồn dữ liệu).
- Cross-check tự động 259 dòng với biểu thuế thương mại: **249/249 khớp** (map đúng form C/O → cột FTA).

**Đã học — bất ngờ / địa hình thật**
- **Đính kèm chat bị cắt; file phải nằm trên đĩa để subagent đọc.** Dán 100+ PDF vào chat chỉ tới ~35 tờ; subagent không mở được đính kèm chat, chỉ đọc file theo path. Danh sách file cố định → hard-code path vào script workflow, đừng nhờ list-agent (nó trả rỗng dù `find` chạy tay ra đủ — flaky).
- **Đừng khái quát từ mẫu nhỏ.** Lô 35 tờ chỉ thấy ACFTA → kết luận sai "công ty chỉ dùng ACFTA". Full 117 lộ **4 FTA**: AANZFTA, ACFTA, ATIGA, EVFTA (REX). Đã sửa note.
- **CBPG (chống bán phá giá) là khoản riêng, có thật.** Có dòng bị áp CBPG 35,58% chồng lên thuế NK (thu thật ~9,4tr VND), có dòng được miễn. Schema TASK-007 phải tách CBPG khỏi thuế NK — bề mặt trách nhiệm pháp lý mới.
- **Cross-check 249/249 là validation thật.** Tờ khai thật (oracle độc lập) đồng thuận 100% với biểu thuế thương mại (nguồn thứ cấp). Nhưng cả hai đều phái sinh từ nghị định; **Công báo mới là thẩm quyền** (TASK-008 vẫn phải đối chiếu văn bản gốc).
- **Bẫy xuất xứ ≠ nước người bán phổ biến (36/259).** Vd Bossard Malaysia (MY) → hàng xuất xứ CN; Webcontrol Đài Loan (TW) → xuất xứ DE. Đọc "Nước xuất xứ" theo dòng. (Baosteel "Singapore" khai mã nước CN = xuất xứ — tên khác mã nước, KHÔNG tính vào 36; chấm tay bắt được chỗ ghi nhầm này.)

**Chốt TASK-001 (cùng phiên)**
- Chủ dự án quyết: `confidence = uncertain` cho toàn bộ 55 case + 259 corpus. Lý do: dữ liệu đã-khai-qua ≠ đúng luật; **xác minh đúng/sai để lúc dùng thật qua vòng xác nhận Zalo**, không staff certify trước. → "chạy xanh" TASK-012 = tái hiện thực tiễn quá khứ.
- File rỗng `108337700001` bỏ qua. Bảng review `confidence-review.csv` gỡ (không cần tick từng dòng nữa).
- Chấm tay 4 tờ: 15/15 dòng khớp (HS/xuất xứ/ngày/thuế/C/O/CBPG).
- **TASK-001 → done.** (Đáng cân nhắc: viết ADR riêng cho "verify-on-use qua Zalo" khi thiết kế Giai đoạn 3.)

**Tiếp theo**
- TASK-002/003/004 (điều tra độc lập, không phụ thuộc dữ liệu chủ dự án) hoặc TASK-006 (khung repo NestJS + Postgres).

---

### 2026-07-17 — Nghiên cứu, cơ sở kiến thức, và một bước ngoặt phạm vi

**Đã làm**
- Chạy 12 agent nghiên cứu dựa trên các nguồn trực tiếp, bao gồm 3 lượt xác minh đối kháng.
- Xoay trục sản phẩm: lộ trình ban đầu mô tả RAG trên văn xuôi luật định; công việc thực tế của chủ sở hữu
  là khai báo hải quan, vốn là tra cứu bảng. Hải quan trước, luật sau.
- Viết cơ sở kiến thức (27 ghi chú, ~5.800 dòng) và 7 ADR. TASK-005 xong.
- Repo được khởi tạo, đẩy lên `ngocnhat2k1/Legal-AI-Knowledge-System` (riêng tư).

**Đã học — những điều mà nếu không sẽ tốn nhiều tuần**
- **Các nguồn tiện lợi thì bị chặn còn nguồn có thẩm quyền thì mở toang.** thuvienphapluat nêu tên
  ClaudeBot trong robots.txt với `ai-train=no`; luatvietnam âm thầm giải quyết sang *sai tài liệu*.
  Công báo là `Allow: /`, không cần JS, và phục vụ DOCX thật. Điều này đảo ngược giả định hiển nhiên.
- **Nguồn PDF "hiển nhiên" là một bản quét fax 200-DPI với không đối tượng `/Font` nào.** Đừng phân tích
  các PDF của chinhphu.vn. Hãy đến Công báo.
- **Cạm bẫy phụ lục.** 1.520 mã HS xuất hiện ở cả Phụ lục I (xuất khẩu) lẫn II (nhập khẩu); 1.329 có
  mức thuế khác nhau. Bộ phân tích ngây thơ của Research 12 đạt **94% thành công biểu kiến trong khi trả về thuế xuất khẩu
  cho các truy vấn nhập khẩu.** Đây là hình dạng của mọi thất bại trong dự án này: không phải thiếu dữ liệu, mà là
  dữ liệu sai có vẻ hợp lý mà báo cáo thành công.
- **Đây là một vấn đề về tính thời sự pháp lý, không phải một vấn đề crawl.** NĐ 72/2026 được ký và có hiệu lực pháp lý
  cùng ngày, đăng công báo 15 ngày sau, và hết hiệu lực 52 ngày sau đó với mức thuế âm thầm
  hoàn nguyên. Không lịch crawl nào khép lại được cửa sổ đó. Hệ thống phải trích dẫn ngày snapshot của nó và từ chối
  khi đã cũ — một công cụ hỗ trợ nghiên cứu, không bao giờ là một cỗ máy trả lời.
- **Bản thân cơ sở kiến thức đã ảo giác ở lượt đầu.** Một cuộc kiểm toán đối kháng bắt được các
  agent viết ghép một URL thật lên một tuyên bố không nguồn, bịa ra "lấy nguồn từ báo chí thương mại
  Việt Nam", và in đậm một hợp của sáu nghị định không xuất hiện trong bất kỳ báo cáo nghiên cứu nào. Tất cả đã sửa.
  **Văn xuôi trôi chảy che giấu nguồn gốc thiếu.** Kiểm toán lại bất cứ khi nào KB này được mở rộng đáng kể.

**Sự cố cấu trúc (đã sửa cùng ngày)**
- `.agent/` bị chuyển vào `templates/.agent/`. Điều này âm thầm phá vỡ hai thứ: file cầu nối gốc `CLAUDE.md`
  trỏ tới một `.agent/AGENTS.md` không còn tồn tại (làm mồ côi toàn bộ cơ sở kiến thức khỏi mọi agent),
  và template APB bị ghi đè bằng nội dung lĩnh vực hải quan (nên
  `create-apb` lẽ ra đã sinh ra một trợ lý hải quan cho mọi dự án tương lai). Đã khôi phục: `.agent/`
  về lại gốc, `templates/.agent/` được kéo lại sạch từ `github.com/truongthuc/apb`.
- **Bài học:** `.agent/` phải nằm ở gốc repository. Các file cầu nối gốc hardcode đường dẫn đó.

**Tiếp theo**
- TASK-001, golden set. Chỉ chủ sở hữu. Mọi thứ chờ nó.

---

## Cách cập nhật file này

Vào cuối một phiên, trước commit cuối cùng:

1. Cập nhật **Tiếp tục từ đây** — giai đoạn, công việc tiếp theo, các yếu tố chặn.
2. Cập nhật bảng **Trạng thái công việc**, và `01-task-list.md` trong cùng một commit.
3. Thêm một mục **Nhật ký phiên làm việc** ở đầu nhật ký. Bao gồm điều gì làm bạn bất ngờ.
4. Nếu một quyết định được đưa ra, viết một ADR — đừng chôn nó ở đây.
5. Nếu một sự thật bền vững được học, đặt nó vào đúng ghi chú `concepts/` — đừng chôn nó ở đây.

File này là một con trỏ và một cuốn nhật ký, **không phải** một kho kiến thức. Bất cứ thứ gì sống lâu hơn phiên
đều thuộc về `concepts/`, `business-rules.md`, hoặc một ADR. Khi nghi ngờ, theo các quy tắc định tuyến trong
[AGENTS.md](../AGENTS.md).

## Kiến thức liên quan

- [Kế hoạch khởi động](00-bootstrap.md) — lộ trình theo giai đoạn
- [Danh sách công việc](01-task-list.md) — chi tiết công việc và tiêu chí nghiệm thu
- [Đánh giá](../docs/evaluation.md) — golden set và các cổng ship
- [Quy tắc nghiệp vụ](../business-rules.md) — xương sống an toàn
- [Chỉ mục bộ nhớ Agent](../index.md)
