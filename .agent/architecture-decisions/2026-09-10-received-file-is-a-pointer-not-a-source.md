# Quyết định Kiến trúc: File nhận được là con trỏ, không phải nguồn

Ngày: 2026-09-10

Trạng thái: Accepted

## Bối cảnh

Văn bản pháp luật đến tay chủ dự án qua Zalo, email, nhóm nội bộ — dưới dạng file rơi vào một
thư mục trên máy. Phản xạ tự nhiên là nạp chính file đó vào kho.

Kiểm kê đợt đầu tiên (2026-09-10, 20 tài liệu phân biệt) cho thấy phản xạ đó dẫn thẳng vào tường:

| Nhóm | Số lượng | Vấn đề |
|---|---|---|
| PDF **không có lớp text** | 7 file, **224 trang**, 0 ký tự/trang | Phải OCR, và phải tin OCR trên văn bản pháp luật |
| File **trùng byte-for-byte** | 1 cặp (md5 `1bce7c7d…`) | Cùng một thông tư mang hai tên khác nhau |
| Tên file **mâu thuẫn nội dung** | ít nhất 2 | `16 2026 TT BNV…` và `THONG TU 36 KHCN` — nội dung bên trong **không mang số nào**; người gửi tự gán số dự kiến |
| Bản **chưa ký** của văn bản ĐÃ ban hành | 2 xác nhận | `THONG TU 36 KHCN.pdf` = TT 36/2026/TT-BKHCN; `KO QE.pdf` = CV 18648/CHQ-GSQL (giống 0,99) |

Đồng thời, dự án đã có sẵn máy móc tải văn bản từ Công báo theo số hiệu
([`apps/ingest/ingest_document.py`](../../apps/ingest/ingest_document.py)), và Công báo phát hành
bản `.doc` sạch, máy đọc được, cho đúng những văn bản đang nằm trong tay dưới dạng scan.

Nguyên tắc này đã tồn tại sẵn ở dạng khác trong dự án: ADR
[Dùng VBHN đã công bố, không tự hợp nhất](2026-07-17-use-published-vbhn-not-computed-consolidation.md)
từ chối tự dựng văn bản hợp nhất, dù kỹ thuật hoàn toàn làm được. Lý do giống hệt: bản văn phải
đến từ nơi có thẩm quyền công bố nó.

## Quyết định

**File trong hộp thư đến chỉ dùng để trả lời câu hỏi "văn bản nào đáng quan tâm".** Bản văn để
nạp lấy từ nơi có thẩm quyền, theo số hiệu — hoặc theo tiêu đề, khi số hiệu không đọc được.

Thang ưu tiên, dừng ở bậc đầu tiên thành công:

| Bậc | Đường |
|---|---|
| 1 | **Công báo → VBHN hiện hành nếu có**; văn bản gốc chỉ khi không có VBHN, và phải ghi lại vì sao |
| 2 | `.doc`/`.docx` cục bộ → parser |
| 3 | PDF có lớp text → `pdfplumber` → parser |
| 4 | Scan hoặc ảnh → OCR bằng vision; ngoài kho, chỉ vào notebook có nhãn |

Bậc 4 là lối thoát cuối, không phải một lựa chọn ngang hàng.

**Thang này xếp hạng ĐỘ TIN CẬY CỦA BẢN VĂN — nó không cấp trạng thái xác minh.** Mọi văn bản
máy nạp đều vào kho ở `auto_unverified`, bất kể bậc nào; chỉ chuyên viên đọc và đứng tên mới
thăng lên `verified`. Xem
[ADR dự thảo và công văn](2026-09-10-drafts-and-cong-van-outside-legal-corpus.md) và
`db/schema/index.ts:393`.

**Parse có hai nhánh.** `parse_provisions.py` cố ý vứt mọi dòng chứa dấu ô Word `\x07` — đúng
cho văn xuôi, nhưng nó bỏ **toàn bộ bảng**. Văn bản dạng danh mục hàng hoá phải đi thêm nhánh
parser bảng, và cổng chặn đếm số dòng `\x07` bị bỏ. Chi tiết ở
[Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md).

Kết quả thật trên đợt đầu: **6/7 văn bản scan có trên Công báo** và được nạp từ bản gốc máy đọc
được. Chỉ QĐ 1725/QĐ-BCT — quyết định cá biệt, không đăng Công báo — phải OCR: **11 trang thay vì 224**.

## Các phương án đã cân nhắc

- **OCR toàn bộ bản scan, coi kết quả là bản văn**: BÁC. OCR trên văn bản pháp luật tiếng Việt
  sai ở đúng chỗ đắt nhất — số hiệu, số điều khoản, con số phần trăm, dấu thanh phân biệt từ.
  Sai kiểu đó không tạo ra lỗi phân tích, nó tạo ra một điều khoản trông hoàn toàn hợp lệ. Đúng
  chế độ hỏng [R3 "Error but Valid"](../business-rules.md).

- **Tin số hiệu lấy từ tên file**: BÁC làm *căn cứ*, GIỮ làm *manh mối*. Đã bác được bằng bằng
  chứng trực tiếp trong chính đợt kiểm kê: hai file mang số trong tên mà nội dung không có số
  nào. Nhưng cấm hẳn cũng sai — `09-bvhttdl.pdf` mang số hiệu thật, và đó là đầu vào duy nhất
  cho bước dò Công báo.

- **Chỉ nạp những gì Công báo có, bỏ hẳn phần còn lại**: BÁC. Quá chặt. Công văn Cục Hải quan
  không lên Công báo nhưng là hướng dẫn nghiệp vụ có giá trị hằng ngày.

- **Ưu tiên PDF cục bộ vì "nó là thứ chủ dự án thực sự cầm trong tay"**: BÁC. Bản trong tay có
  thể là bản chụp lại, bản thiếu phụ lục, hoặc bản lưu hành trước khi ký. Bản Công báo là bản
  duy nhất có ngày đăng và số Công báo để truy vết.

- **Lấy văn bản gốc thay vì VBHN cho gọn**: BÁC. Trái ADR
  [dùng VBHN đã công bố](2026-07-17-use-published-vbhn-not-computed-consolidation.md). Nạp bản
  gốc của một văn bản đã bị sửa nhiều lần là phục vụ điều khoản đã bãi bỏ.

## Hệ quả

**Được:**

- Bản scan không còn là vật cản. Có scan trong tay vẫn nạp được bản sạch, miễn đọc ra số hiệu
  hoặc tiêu đề.
- Trích dẫn truy vết được tới số Công báo và ngày đăng, không phải tới "một file ai đó gửi".
- Tái dùng được đường tải và parser đã có.

**Chi phí và rủi ro:**

- **Phải đọc được số hiệu hoặc tiêu đề từ file trước đã.** Với bản scan, việc này vẫn cần nhìn
  vào trang đầu — bằng mắt hoặc bằng vision. Khác biệt là vision chỉ đọc **một dòng**, không
  phải dựng lại 224 trang.
- **Chỉ mục `gazette_document` hiện không có sẵn.** Nó sống trong DB trên VPS đã ngừng hoạt
  động; bảng này không được commit vào repo. Trước mắt phải dò trực tiếp trang danh sách Công
  báo — đã chứng minh khả thi (tìm ra NĐ 292/2026 ở trang 5) nhưng chậm với văn bản cũ.
- ~~Chưa biết bao nhiêu trong 7 văn bản scan có trên Công báo.~~ **Đã giải: 6/7.** Tìm theo số hiệu chỉ
  đúng với nghị định; thông tư và quyết định phải tìm theo ngày đăng (`congbao_lookup.py --near`).
- **Công báo có thể chậm hơn thực tế.** Một nghị định vừa ký có thể chưa lên Công báo; khi đó
  bậc 2 gánh.
- **Máy móc được viện dẫn ở trên chưa chạy được ở trạng thái hiện tại**: `ingest_document.py`
  cần `DATABASE_URL` và chỉ mục `gazette_document`, cả hai đều mất cùng VPS. Nó là **mẫu để tái
  dùng**, không phải công cụ dùng ngay.

## Links

- Design: [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md)
- Liên quan: [Dùng VBHN đã công bố, không tự hợp nhất](2026-07-17-use-published-vbhn-not-computed-consolidation.md) ·
  [Dự thảo và công văn nằm ngoài kho pháp lý](2026-09-10-drafts-and-cong-van-outside-legal-corpus.md) ·
  [Kho pháp luật tự mở rộng](../docs/legal-corpus-self-extension.md) ·
  [Nguồn dữ liệu](../concepts/data-sources.md)
