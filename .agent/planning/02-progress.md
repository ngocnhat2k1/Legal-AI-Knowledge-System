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
| **Giai đoạn hiện tại** | Giai đoạn 0 — Nền móng |
| **Công việc tiếp theo** | TASK-001 đã xong. Tiếp: TASK-002/003/004 (điều tra độc lập) hoặc TASK-006 (khung repo) |
| **Đang bị chặn bởi** | Không có. TASK-001 đã đóng (confidence = uncertain toàn bộ; xác minh để lúc dùng qua Zalo). |
| **Code đã viết** | Chưa có code ứng dụng (cố ý). Đã có fixtures golden set `fixtures/golden-set/`. |
| **Phiên gần nhất** | 2026-07-18 (xem nhật ký bên dưới) |

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
| TASK-002 — Giải quyết xung đột API customs.gov.vn | 🔲 chưa làm | Research 10 và 12 mâu thuẫn; chưa giải quyết |
| TASK-003 — Chứng minh phân tích DOCX nhận biết bảng | 🔲 chưa làm | Research 12 để lại khoảng trống này một cách tường minh |
| TASK-004 — Kiểm tra provisionTree của vbpl có được điền không | 🔲 chưa làm | Câu hỏi mở giá trị cao nhất cho giai đoạn RAG |
| TASK-005 — Viết các ghi chú kiến thức .agent | ✅ xong 2026-07-17 | Đã kiểm toán; xem Nhật ký phiên làm việc |
| TASK-006 — Khung sườn repository | 🔲 chưa làm | |
| TASK-007 — Schema biểu thuế (thời gian + nhận biết phụ lục) | 🔲 chưa làm | Nhận biết phụ lục từ migration **đầu tiên**, không trang bị thêm |
| TASK-008 — Nạp Công báo (bộ phân tích nhận biết phụ lục) | 🔲 chưa làm | Phụ thuộc TASK-003 |
| TASK-009 — Xác lập chuỗi sửa đổi MFN 2026 | 🔲 chưa làm | **Đừng** gộp research 10 + 12 và giả định hợp của chúng |
| TASK-010 — Phát hiện độ cũ | 🔲 chưa làm | |
| TASK-011 — API tra cứu | 🔲 chưa làm | |
| TASK-012 — Nghiệm thu Giai đoạn 1 | 🔲 chưa làm | Cổng: các con số khớp ECUS trên một lô hàng thật |

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

1. **API biểu thuế customs.gov.vn có tiếp cận được và không captcha không?** Research 10 nói có (xác minh bằng curl
   qua `/bridge`); research 12 tìm thấy một backend IP-thô bị captcha chặn mà nó không thể tiếp cận. Có lẽ
   là các endpoint khác nhau. **Chưa giải quyết.** → TASK-002
2. **Một bộ phân tích DOCX nhận biết bảng có khôi phục các cột sáu-mức-thuế EVFTA không?** Research 12 suy luận nó
   sẽ khôi phục được nhưng không thể chứng minh (không có LibreOffice/python-docx khả dụng). Khoảng trống này phải khép lại trước
   khi bất kỳ dữ liệu thuế nào được tin. → TASK-003
3. **`provisionTree` / `referenceProvisions` của vbpl có bao giờ được điền không?** `null` trên cả hai mẫu. Nếu
   được điền, nó là một đồ thị pháp lý cấp điều khoản và nó thay đổi toàn bộ thiết kế RAG. → TASK-004
4. **Chuỗi sửa đổi MFN 2026 thực sự là gì?** Research 10 và 12 cho các danh sách khác nhau, mỗi cái đều
   không đầy đủ. Xác lập nó từ Công báo. → TASK-009

## Nhật ký phiên làm việc

Thêm một mục mới ở **đầu** phần này vào cuối mỗi phiên làm việc. Giữ các mục
ngắn gọn. Ghi lại cái gì đã thay đổi, cái gì đã học được, và cái gì mà agent tiếp theo sẽ khám phá lại một cách khó
khăn. **Bất ngờ và ngõ cụt là thứ giá trị nhất ở đây** — một kế hoạch cho bạn biết cái gì được
dự định, chỉ cái này cho bạn biết địa hình thực sự đã làm gì.

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
