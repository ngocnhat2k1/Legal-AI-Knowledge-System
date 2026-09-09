# Quyết định Kiến trúc: Nạp Chú giải Phần/Chương và 6 quy tắc GRI vào kho pháp lý

Ngày: 2026-09-09

Trạng thái: Accepted (phần trích xuất) / Proposed (phần nạp vào Postgres)

## Bối cảnh

Kho dữ liệu chứa 11.414 mã HS kèm mô tả (từ NĐ 26/2023) nhưng **không chứa phần mang giá trị
pháp lý** khi phân loại. Quy tắc 1 GRI nói rõ:

> *"Tên của Phần, Chương hoặc Phân chương được đưa ra chỉ nhằm mục đích dễ tra cứu. Để đảm bảo
> tính pháp lý, việc phân loại hàng hóa phải được xác định theo nội dung của từng nhóm và bất cứ
> chú giải của các Phần, Chương liên quan…"*

Trước thay đổi này, chuỗi `"Chú giải"` xuất hiện **đúng 1 lần** trên toàn bộ 4.472 điều khoản
trong `db/seed/data/legal/provisions.ndjson`. Hệ quả:

1. ADR [HS là ứng viên, không phải đáp án](2026-07-17-hs-candidates-not-answers.md) yêu cầu trả
   về ứng viên **kèm bằng chứng pháp lý nguyên văn**. Với phân loại HS, bằng chứng đó *chính là*
   Chú giải Phần/Chương — thứ hệ thống không có. Bằng chứng bị thiếu đúng ở chỗ nó quan trọng nhất.
2. Một mô hình được hỏi *"Chú giải 1(g) Phần XVI nói gì?"* sẽ **bịa**, và không có gì trong hệ
   thống bắt được lỗi đó.

Bằng chứng thực nghiệm: trong transcript của một công cụ tra cứu HS thương mại, **cùng một mặt
hàng hỏi hai lần cho ra hai cách đọc trái ngược** về Chú giải 1(g) Phần XVI —

- Lần 1: *"các bộ phận của máy móc… thì không được phân loại vào Chương 73"* — **đọc ngược chiều**
- Lần 2: *"các bộ phận có công dụng chung… thuộc Phần XV bị loại trừ khỏi Phần XVI"* — **đúng**

Cả hai đều tự chấm *"độ tin cậy 95%"*. Nguyên văn (đã trích được) xác nhận lần 2 đúng: Chú giải
1(g) nằm dưới câu *"1. Phần này **không bao gồm**:"*, tức nó **loại trừ RA KHỎI** Phần XVI. Điều
đưa bộ phận chuyên dùng **VÀO** nhóm của máy chính là **Chú giải 2(b)**, một điều khoản khác.

Lập luận sai vẫn ra đúng mã trong trường hợp đó — nhưng nó sụp ngay khi hải quan phản biện, và
không có cách nào phát hiện nếu kho dữ liệu không giữ nguyên văn.

## Quyết định

Nạp từ **Thông tư 31/2022/TT-BTC** (ban hành Danh mục AHTN 2022, hiệu lực 01/12/2022):

- **Chú giải Phần** (9 Phần có chú giải) và **Chú giải Chương** (93/97 chương)
- **Chú giải phân nhóm** (38 khối)
- **Sáu quy tắc tổng quát (GRI)** kèm Chú giải chi tiết của từng quy tắc

Giữ **song ngữ Việt–Anh**. Bản tiếng Anh là nguyên văn WCO mà bản tiếng Việt dịch ra; giữ cả hai
là cách duy nhất để phát hiện một chú giải bị dịch lệch — và tranh chấp phân loại thường xoay
quanh đúng một từ.

Bộ trích xuất và kiểm chứng nằm ở [`research/hs-notes-loader/`](../../research/hs-notes-loader/README.md).

## Các phương án đã cân nhắc

- **Để LLM tự nhớ chú giải HS**: BÁC. Đây chính là chế độ hỏng đã quan sát được ở trên — nó nhớ
  *gần đúng*, và một chú giải đọc ngược chiều vẫn đọc rất trôi chảy. Trái với ADR
  [LLM sinh giả thuyết, không bao giờ khẳng định](2026-08-14-llm-generates-hypotheses-never-assertions.md).
- **Chỉ nạp bản tiếng Việt**: BÁC. Mất khả năng đối chiếu bản dịch, mà đó là lớp kiểm tra rẻ nhất.
- **Nạp cả Chú giải chi tiết HS (Explanatory Notes đầy đủ của WCO)**: HOÃN. Bộ EN đầy đủ của WCO
  có bản quyền và không có trên Công báo. Phần Chú giải GRI trong Phụ lục II của TT 31/2022 đã
  được công bố hợp pháp và đủ dùng cho tầng lập luận GRI.
- **Nạp Chú giải như một `legal_document` riêng, tách khỏi TT 31/2022**: BÁC. Chú giải là bộ phận
  của Phụ lục I trong chính thông tư đó; tách ra sẽ làm hỏng khả năng truy vết trích dẫn.
- **Ép Chú giải vào `provision_type` sẵn có (`dieu`/`khoan`)**: BÁC. Đó là nói dối về cấu trúc và
  sẽ sinh ra `citation_label` sai — trích dẫn sai điều khoản là đúng thứ ADR này muốn chặn.

## Hệ quả

**Được:**

- Lập luận phân loại HS lần đầu tiên có bằng chứng nguyên văn kiểm chứng được, đúng như ADR
  [HS là ứng viên](2026-07-17-hs-candidates-not-answers.md) yêu cầu.
- Câu hỏi *"chú giải nào loại trừ mặt hàng này?"* trở thành truy hồi được, thay vì phải bịa.

**Chi phí và rủi ro:**

- **Cần mở rộng enum `provision_type`** thêm `'phan'`, `'chu_giai'`, `'quy_tac'`. Đây là thay đổi
  schema và phải đi qua `drizzle-kit generate`.
  ⚠️ `db/migrations/meta/` **đang thiếu snapshot 0007–0009**; chồng migration thủ công lên chuỗi
  đó sẽ khiến drizzle tính diff sai. **Vá snapshot trước.**
- **Chunk phải cắt theo từng mục đánh số**, không cắt theo cả khối. Trung bình 416 từ/khối nhưng
  Chú giải Phần XI (dệt may) dài gấp nhiều lần; nhúng nguyên khối làm loãng vector.
- `sac_prefix` phải nêu Phần/Chương nào, vì câu chú giải không tự nêu bối cảnh
  (*"Phần này không bao gồm:"* — phần nào?).
- **Độ cũ:** TT 31/2022 sẽ bị thay khi Việt Nam chuyển sang AHTN 2027. Cùng vách đá 2027 với
  các biểu FTA — xem [Hệ thống biểu thuế](../concepts/tariff-system.md).

**Bẫy đã ghi lại** (chi tiết trong README của loader): Unicode NFC/NFD trộn lẫn khiến `PHẦN XV`
bị bỏ sót âm thầm; sort key bắt nhầm `31` thay vì số Công báo làm xáo trộn 18 phần.

## Links

- Design: [`research/hs-notes-loader/README.md`](../../research/hs-notes-loader/README.md)
- Nguồn: <https://congbao.chinhphu.vn/van-ban/thong-tu-so-31-2022-tt-btc-37431.htm>
- Liên quan: [Phân loại mã HS](../concepts/hs-classification.md) ·
  [HS là ứng viên, không phải đáp án](2026-07-17-hs-candidates-not-answers.md) ·
  [LLM sinh giả thuyết, không bao giờ khẳng định](2026-08-14-llm-generates-hypotheses-never-assertions.md)
