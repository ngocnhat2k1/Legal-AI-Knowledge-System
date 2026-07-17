---
type: planning
status: active
updated: 2026-07-17
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
| **Công việc tiếp theo** | [TASK-001 — Xây golden set](01-task-list.md) |
| **Đang bị chặn bởi** | TASK-001 cần **chủ sở hữu**, không phải một agent (xem bên dưới) |
| **Code đã viết** | Chưa có. Điều này là cố ý — xem [Kế hoạch khởi động](00-bootstrap.md). |
| **Phiên gần nhất** | 2026-07-17 (xem nhật ký bên dưới) |

### ⚠️ Công việc tiếp theo không thể do một agent làm

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
| TASK-001 — Golden set | ⛔ bị chặn (chủ sở hữu) | Phải có trước bất kỳ code truy xuất nào |
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
