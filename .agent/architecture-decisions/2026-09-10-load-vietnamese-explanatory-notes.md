# Quyết định Kiến trúc: Nạp bản tiếng Việt của Chú giải chi tiết HS và SEN vào notebook

Ngày: 2026-09-10

Trạng thái: Accepted — **thay thế một phần** [ADR 2026-09-09](2026-09-09-load-hs-notes-and-gri.md)
(mục "Nạp cả Chú giải chi tiết HS: HOÃN")

## Bối cảnh

ADR 2026-09-09 hoãn việc nạp Chú giải chi tiết HS (Explanatory Notes) với lý do: *"Bộ EN đầy đủ
của WCO có bản quyền và không có trên Công báo."* Lý do đó đúng với **bản tiếng Anh của WCO**.

Ngày 2026-09-10 chủ dự án đưa vào hộp thư đến bằng chứng mới — hai tài liệu do **Tổng cục Hải
quan phát hành chính thức**, đọc được từ trang đầu của từng file:

| Tài liệu | Ban hành kèm | Khối lượng tiếng Việt |
|---|---|---|
| Chú giải chi tiết Danh mục HS 2022 (EN2022), 96 chương | Công văn **1810/TCHQ-TXNK** ngày 26/4/2024 | 4.769.851 ký tự · 1.306 bản ghi |
| Chú giải bổ sung AHTN 2022 (SEN) | Công văn **3866/TCHQ-TXNK** ngày 24/7/2023 | 237.172 ký tự · 96 chương |

Cả hai là PDF **song ngữ hai cột**: tiếng Việt bên trái, tiếng Anh bên phải (98% ký tự tiếng Việt
nằm cột trái, 98% tiếng Anh nằm cột phải, 95% số trang có hai cột). Cột tiếng Anh chính là văn
bản WCO mà ADR 2026-09-09 đã hoãn.

Đây đúng là tầng bằng chứng mà [thiết kế mở rộng LLM](../docs/llm-expansion-design.md) đã nêu
cần có: *"bằng chứng HS lấy từ TT 31/2022 + SEN 2022 + công văn phân loại + WCO EN (EN chờ
license)"*.

## Quyết định

1. **Nạp CHỈ cột tiếng Việt** của EN2022 và SEN 2022. Cột tiếng Anh không nạp — lập trường về bản
   quyền WCO của ADR 2026-09-09 **giữ nguyên**.
2. Đích đến: **notebook** (nguồn 50–57 và 58) và **bản trích xuất trong repo**
   (`db/seed/data/legal/hs-explanatory-notes.ndjson`, `hs-sen.ndjson`). **Chưa vào Postgres** — cần
   thay đổi schema, cùng khoản nợ snapshot drizzle 0007–0009 với ADR 2026-09-09.
3. **Gắn nhãn tính chất ở đầu mỗi nguồn**: *hướng dẫn áp dụng, không phải văn bản quy phạm pháp
   luật*. Chú giải Phần/Chương có giá trị pháp lý vẫn là TT 31/2022/TT-BTC ở nguồn 20.
4. **Không nạp SEN của TT 156/2011/TT-BTC** (AHTN 2012) có trong cùng thư mục: đã bị SEN 2022 thay
   thế, và notebook không lọc được theo hiệu lực ([R8](../business-rules.md)).

## Các phương án đã cân nhắc

- **Tiếp tục hoãn**: BÁC. Lý do hoãn là bản quyền của bản tiếng Anh; bản tiếng Việt do Tổng cục
  Hải quan phát hành không vướng lý do đó, và nó là tài liệu người khai hải quan dùng hằng ngày.
- **Nạp song ngữ như Chú giải Phần/Chương ở nguồn 20**: BÁC. Vướng đúng lý do bản quyền WCO, và tốn
  gấp đôi: ~13 nguồn thay vì 8, trên hạn mức 50 của bản miễn phí. Giá trị đối chiếu song ngữ được giữ ở
  nơi nó quan trọng nhất — Chú giải Phần/Chương có giá trị pháp lý.
- **Tách bản ghi theo từng trang**: BÁC. Trích dẫn sẽ trỏ tới "trang 85", vô nghĩa với người đọc.
  Tách theo **nhóm 4 số** thì trích dẫn trỏ tới "Nhóm 84.18".

## Hệ quả

**Được:**

- Lập luận phân loại có bằng chứng giải thích chi tiết theo từng nhóm, không chỉ chú giải Phần/Chương.
- Công văn phân loại (nguồn 40) viện dẫn Chú giải chi tiết; nay người đọc tra được đúng đoạn được viện dẫn.

**Chi phí và rủi ro — những gì đã đo được, không phải giả định:**

- **pypdf làm vỡ âm tiết trên 85/100 file** (`"truy ền ho ặc"`), hỏng âm thầm việc tìm kiếm chính
  những từ cần tra. Đã đổi sang pymupdf: 0,004 chỗ vỡ trên 1000 ký tự.
- **Tách được 1.210/1.228 nhóm (98,5%).** 16 bản ghi mà tiêu đề nhóm kế tiếp không tách được **ghi
  rõ "có thể gồm cả nhóm X"** thay vì âm thầm gán cho nhóm liền trước — gán sai nhóm là trích dẫn
  sai hàng hóa, đúng [R3](../business-rules.md). Tiêu đề chỉ được nhận nếu mã có thật trong danh
  mục của chương đó **và** đứng sau tiêu đề trước.
- **8 nguồn notebook** cho EN2022. Phạm vi chương mỗi nguồn là **hằng số** trong
  `render_notebook.py`, không tính theo kích thước — tên file là khoá nối với Google Doc.
- **Vách đá 2027.** EN2022 và SEN 2022 gắn với HS 2022; khi Việt Nam chuyển sang HS 2027 cả hai phải
  thay, cùng lúc với TT 31/2022 và các biểu FTA.

## Links

- Thiết kế: [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md)
- Công cụ: [`research/inbox-loader/extract_explanatory_notes.py`](../../research/inbox-loader/extract_explanatory_notes.py)
- Thay thế một phần: [Nạp Chú giải Phần/Chương và 6 quy tắc GRI](2026-09-09-load-hs-notes-and-gri.md)
