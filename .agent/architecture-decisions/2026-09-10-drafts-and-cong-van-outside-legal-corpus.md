# Quyết định Kiến trúc: Văn bản chưa xác định tình trạng và công văn nằm ngoài kho pháp lý

Ngày: 2026-09-10

Trạng thái: Accepted

## Bối cảnh

Trong 20 tài liệu của đợt kiểm kê đầu tiên (2026-09-10), **5 file có ô số hiệu để trống** ở góc
trên bên trái:

```
Số: /2026/TT-BNV        Hà Nội, ngày    tháng    năm 2026
Số: /2026/TT-BKHCN      Hà Nội, ngày    tháng    năm 2026
Số: /2023/TT-BVHTTDL    Hà Nội, ngày    tháng 8 năm 2023     ← tháng và năm ĐÃ điền
Số: /CHQ-GSQL           Hà Nội, ngày    tháng    năm 2026
Số: /CHQ-GSQL           Hà Nội, ngày    tháng    năm 2026
```

Nếu nạp thẳng vào `legal_document`, hệ thống sẽ trích dẫn một số hiệu **chưa tồn tại** — định
dạng đúng, đọc trôi chảy, không gì bắt được. Đây chính là chế độ hỏng [R3 "Error but
Valid"](../business-rules.md) và là lý do tầng `auto_unverified` tồn tại.

**Nhưng chiều ngược lại cũng nguy hiểm không kém, và bản nháp đầu của ADR này đã mắc phải.**

Bản nháp đặt luật cứng *"ô số hiệu trống ⇒ dự thảo"* và xếp cả 5 file vào nhóm mang nhãn
**"KHÔNG CÓ GIÁ TRỊ PHÁP LÝ"**. Dò Công báo sau đó cho thấy **2/5 là bản chưa ký của văn bản đã ban
hành**: `THONG TU 36 KHCN.pdf` = Thông tư 36/2026/TT-BKHCN (id 469968, cùng 113 trang) và `KO QE.pdf`
= Công văn 18648/CHQ-GSQL (thân văn bản giống 0,99). Dán nhãn "không có giá trị pháp lý" lên hai văn
bản đang áp dụng là hệ thống **tự phát ra một khẳng định sai**, đúng loại sai mà nó được dựng lên để
chặn. *(Một nhận định của rà soát phản biện — rằng `09-bvhttdl.pdf` là thông tư BVHTTDL đã ban hành năm
2023 — **không kiểm chứng được**: mọi thông tư BVHTTDL đăng từ 07/2023 đến 06/2024 đều không khớp. File
đó ở lại lớp C.)*

Sai lầm gốc: **ô trống chỉ chứng minh bản trong tay chưa ký. Nó không chứng minh văn bản chưa
tồn tại.** Đó là thuộc tính của *hiện vật*, không phải của *quy phạm*.

Cùng lúc, **công văn** đặt ra vấn đề khác về bản chất. `18648/CHQ-GSQL` và `20991/CHQ-GSQL` là
văn bản thật, có số, có ngày, có người ký. Nhưng công văn là **văn bản hành chính hướng dẫn
nghiệp vụ, không phải văn bản quy phạm pháp luật** — không có Chương/Điều/Khoản, không có hiệu
lực theo nghĩa VBQPPL, không thể bị trích dẫn như một điều luật.

Schema phản ánh đúng ranh giới đó và hiện không có chỗ cho cả hai:

```
legal_doc_type     = luat | phap_lenh | nghi_dinh | nghi_quyet | thong_tu | quyet_dinh | vbhn
legal_verification = verified | auto_unverified
```

Không có `cong_van`. Không có mức "chưa ban hành". Và `db/migrations/meta/` **chỉ có snapshot
0000–0006 trong khi migration đã đi tới 0009** — chạy `drizzle-kit generate` lúc này sẽ tính
diff sai.

## Quyết định

**1. Ô trống là bước SÀNG, không phải kết luận.**

Quy trình bắt buộc, ba bước:

| Bước | Hành động | Kết quả |
|---|---|---|
| 1 | Ô số hiệu **hoặc** ô ngày trống | ⇒ **nghi vấn**, chưa phân lớp |
| 2 | Dò Công báo bằng **tiêu đề + cơ quan + năm** (không bằng số hiệu — bản chưa ký không có số) | |
| 3a | Khớp | ⇒ **lớp A**, lấy bản Công báo, bỏ bản chưa ký |
| 3b | Không khớp | ⇒ **lớp C — chưa xác định tình trạng** |

Cơ quan suy ra từ đuôi số hiệu (`/2023/TT-BVHTTDL` → BVHTTDL); bảng ánh xạ đã có ở
`apps/api/src/modules/legal/legal.scope.ts`.

**Không có bản ghi tra cứu Công báo thì không được dán nhãn cảnh báo.**

**Cờ đỏ năm lệch:** nghi vấn mang năm **nhỏ hơn năm kiểm kê** phải chặn thủ công. Dự thảo treo
qua năm là bất thường — gần như luôn là bản trước khi ký của văn bản đã ban hành.

**Tên file là manh mối, không phải căn cứ.** Không bao giờ dùng để kết luận; luôn dùng làm đầu
vào cho bước dò. Chính `09-bvhttdl.pdf` mang số hiệu thật trong tên, trong khi
`16 2026 TT BNV…` và `THONG TU 36 KHCN` mang số **do người gửi tự gán**.

**2. Lớp C và công văn không vào `legal_document`. Chúng vào notebook, có nhãn.**

| Lớp | Vào kho | Nguồn notebook | Nhãn |
|---|---|---|---|
| C — chưa xác định | ❌ | `90-CHUA-XAC-DINH-tinh-trang.md` | 🔴 **CHƯA XÁC ĐỊNH TÌNH TRẠNG — không dùng làm căn cứ** |
| B — công văn | ❌ | `40-cong-van-hai-quan.md` | ⚠️ hướng dẫn nghiệp vụ, không phải QPPL |

**3. Lịch rà định kỳ, dùng chính cơ chế trên.**

Chạy lại bước dò Công báo trên toàn bộ nội dung `90-CHUA-XAC-DINH` theo lịch. Cái nào đã lên
Công báo thì cắt khỏi file đó và đẩy sang đường bậc 1. Thêm tài liệu vào nguồn 90 là *mở rộng* nên đi qua
bình thường; cắt một tài liệu ra là *xoá chữ đã đẩy*, nên phải chỉ định đích danh
`--force-file 90-CHUA-XAC-DINH-tinh-trang.md` — xem [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md#manifest).

Việc mở enum để đưa hai lớp này vào kho **bị hoãn có chủ đích**, không phải bỏ. Điều kiện tiên
quyết: vá snapshot 0007–0009 rồi mới sửa `db/schema/index.ts` và để drizzle sinh migration.

## Các phương án đã cân nhắc

- **Luật cứng "ô trống ⇒ dự thảo", không dò Công báo**: BÁC — đây là bản nháp đầu và nó đã bị
  bằng chứng lật ngay trong đợt kiểm kê đầu tiên. Rẻ, nhưng sinh ra khẳng định sai về văn bản
  đang còn hiệu lực.

- **Bỏ hẳn lớp C, không đưa vào đâu cả**: BÁC. Dự thảo thật có giá trị nghiệp vụ — biết trước
  danh mục hàng hoá rủi ro của một bộ sắp thay đổi là thông tin dùng được ngay, miễn người đọc
  biết đó là dự thảo. Vứt đi là mất thông tin để đổi lấy sự an toàn mà nhãn đã cung cấp đủ.

- **Nạp lớp C với `effectiveness = 'chua_co_hieu_luc'`**: BÁC. Giá trị đó dành cho văn bản **đã
  ký nhưng chưa tới ngày hiệu lực** — vẫn có số hiệu và ngày ban hành. Lớp C không có gì cả.
  Dùng nó là nói dối về trạng thái và sinh ra `citation_label` trỏ tới số hiệu không tồn tại.

- **Thêm ngay `cong_van` và `draft` vào enum**: HOÃN. Đúng hướng, sai thời điểm. Chuỗi migration
  đang thiếu snapshot 0007–0009; chồng thay đổi schema lên đó là tạo ra một lỗi âm thầm ở tầng
  dữ liệu để chữa một lỗi âm thầm ở tầng nội dung.

- **Ép công văn vào `quyet_dinh` cho gần đúng**: BÁC. Công văn không phải quyết định. Cùng loại
  sai lầm mà [ADR nạp Chú giải và GRI](2026-09-09-load-hs-notes-and-gri.md) đã bác khi từ chối
  ép Chú giải vào `provision_type` sẵn có: nói dối về cấu trúc để tránh một migration.

- **Trộn lớp C chung file với văn bản chính thức, chỉ ghi chú ở đầu mỗi mục**: BÁC. Nhãn ở cấp
  **nguồn** mạnh hơn nhãn ở cấp đoạn. Khi mô hình truy hồi một đoạn giữa file, nó thấy tên nguồn;
  nó không nhất thiết thấy dòng cảnh báo cách đó ba trang. Tên nguồn `90-CHUA-XAC-DINH-tinh-trang`
  đi theo mọi trích dẫn.

## Hệ quả

**Được:**

- Không thể trích dẫn một số hiệu chưa tồn tại như thể là luật — **và** không thể tuyên bố một
  văn bản đang còn hiệu lực là "không có giá trị pháp lý". Cả hai chiều đều được chặn.
- Ranh giới VBQPPL / văn bản hành chính được giữ đúng — ranh giới nghiệp vụ thật, không phải sự
  sạch sẽ kỹ thuật.
- Bước dò Công báo bắt buộc biến mỗi ca nghi vấn thành một lần **thu nhận văn bản mới** thay vì
  một lần dán nhãn.

**Chi phí và rủi ro:**

- **Mỗi ca nghi vấn tốn một lần dò Công báo bằng tiêu đề** — chậm hơn tra theo số hiệu, và khớp
  mờ trên tiêu đề tiếng Việt có thể sai cả hai chiều. Ca không chắc phải đưa cho người quyết.
- **Notebook và kho lệch nội dung.** Notebook có nhiều tài liệu hơn kho. Khi hạ tầng trở lại,
  người seed lại kho phải hiểu rằng phần thiếu là **cố ý**. Danh sách chính xác nằm trong
  manifest, không phải trong ADR này — con số sẽ đổi sau mỗi đợt.
- **Nhãn phải được mô hình nhắc lại thì mới có tác dụng.** Đây là mục kiểm chứng bắt buộc, và
  tiêu chí ĐẠT phải gồm **cả** bản ghi tra cứu Công báo — nếu không, mục kiểm sẽ nghiệm thu
  chính cái sai mà ADR này vừa sửa.
- **Nợ kỹ thuật được ghi nhận, không được xoá:** enum `legal_doc_type` thiếu `cong_van`, enum
  `legal_verification` thiếu mức chưa-ban-hành, snapshot 0007–0009 vẫn thiếu.

**Việc còn tồn, chưa có người và chưa có hạn** — phải chuyển vào
[`04-inbox-ingest-tasks.md`](../planning/04-inbox-ingest-tasks.md), không được để sống trong ADR:

1. ~~Dò Công báo cho cả 5 ca nghi vấn của đợt đầu.~~ **Xong 2026-09-10**: 2 đã ban hành (TT 36/2026/TT-BKHCN, CV 18648/CHQ-GSQL) — nạp bản đã ký; 3 không tìm thấy (dự thảo TT BNV, dự thảo CV lưỡng dụng, `09-bvhttdl.pdf`) — ở lớp C.
2. Đặt lịch rà định kỳ cho `90-CHUA-XAC-DINH`.
3. Vá snapshot 0007–0009, rồi mở enum.

## Links

- Design: [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md)
- Liên quan: [Quy tắc nghiệp vụ](../business-rules.md) (R3, R8, R10) ·
  [Kho pháp luật tự mở rộng](../docs/legal-corpus-self-extension.md) ·
  [Văn bản pháp luật Việt Nam](../concepts/vietnamese-legal-documents.md) ·
  [Nạp Chú giải Phần/Chương và 6 quy tắc GRI](2026-09-09-load-hs-notes-and-gri.md)
