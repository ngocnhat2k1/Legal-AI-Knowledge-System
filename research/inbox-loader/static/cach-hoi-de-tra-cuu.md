# Cách hỏi NotebookLM để tra cứu mã HS cho đúng

> Đọc sau `00-cach-doc-bieu-thue.md`. File này là **prompt mẫu** — copy nguyên khối, thay phần mô tả hàng.

## Vì sao cần prompt mẫu

Hỏi trống *"máy này HS code gì?"* thì mô hình sẽ trả về **một mã duy nhất kèm giọng chắc nịch**.
Đó là chế độ hỏng đã được đo: benchmark độc lập đặt độ chính xác phân loại HS tự động của LLM ở
**29–47%** ở cấp 10 chữ số, so với ~95% của con người. Nhưng khi buộc nó trả về **top-3 ứng viên
kèm bằng chứng**, độ chính xác có-giải-thích lên **93,9%**.

Khoảng cách đó nằm ở **cách hỏi**, không phải ở mô hình.

---

## Prompt 1 — Phân loại một mặt hàng (dùng thường xuyên nhất)

```
Phân loại mặt hàng sau theo Danh mục hàng hóa XNK Việt Nam (AHTN 2022).

MÔ TẢ HÀNG:
- Tên thương mại:
- Chất liệu cấu thành:
- Công dụng / chức năng cụ thể:
- Cơ chế hoạt động:
- Lắp trên máy/thiết bị nào (nếu là bộ phận):
- Kích thước, khối lượng:
- Tình trạng (mới/đã qua sử dụng):
- Nước xuất xứ:

YÊU CẦU TRẢ LỜI — theo đúng thứ tự này:

1. BẢN CHẤT HÀNG HÓA: mô tả lại bằng ngôn ngữ của Danh mục, không dùng tên thương mại.

2. CÁC NHÓM ỨNG VIÊN: liệt kê 3–5 nhóm 4 số có thể áp dụng. Với mỗi nhóm, trích
   NGUYÊN VĂN nội dung nhóm.

3. CHÚ GIẢI RÀNG BUỘC: trích NGUYÊN VĂN mọi Chú giải Phần và Chú giải Chương có liên
   quan, kèm số hiệu đầy đủ (ví dụ "Chú giải 1(g) Phần XVI"). Nói rõ mỗi chú giải
   LOẠI TRỪ hay ĐƯA VÀO nhóm nào — đọc đúng chiều của điều khoản.

4. ÁP DỤNG GRI THEO THỨ TỰ: bắt đầu từ Quy tắc 1. Chỉ chuyển sang quy tắc sau khi quy
   tắc trước KHÔNG giải quyết được, và nói rõ vì sao không giải quyết được. Trích nguyên
   văn quy tắc đã dùng.

5. TOP-3 ỨNG VIÊN mã 8 số, xếp theo độ phù hợp giảm dần. Với mỗi ứng viên:
   - Mã 8 số và mô tả nguyên văn trong Danh mục
   - Lập luận ủng hộ
   - Lập luận phản đối
   - Thuế MFN và 4 FTA (chỉ khi tìm thấy đúng dòng trong file biểu thuế; nếu không
     tìm thấy thì ghi "chưa tra được", KHÔNG suy đoán)

6. TÁCH 8 SỐ: nếu trong cùng phân nhóm 6 số có nhiều mã 8 số, liệt kê TẤT CẢ và nêu
   rõ mã nào lệch thuế suất. Không được nhảy thẳng vào "Loại khác".

7. CHỨNG TỪ CẦN CÓ để bảo vệ mã này khi hải quan kiểm tra.

8. CÂU KHAI BÁO ĐỀ XUẤT cho ô mô tả hàng hóa trên tờ khai.

RÀNG BUỘC BẮT BUỘC:
- Chỉ dùng nội dung có trong các nguồn đã nạp. Không dùng kiến thức ngoài.
- Mọi trích dẫn Chú giải/GRI phải là NGUYÊN VĂN, có số hiệu, và phải nêu tên file nguồn.
- TUYỆT ĐỐI KHÔNG đưa ra "mức độ tin cậy %" — con số đó không có cơ sở.
- Không kết luận một mã duy nhất. Nếu dữ liệu không đủ, nói rõ THIẾU GÌ.
- Không nói gì về giấy phép, dán nhãn, kiểm tra chuyên ngành, hàng đã qua sử dụng —
  các nguồn đã nạp KHÔNG chứa thông tin đó.
```

## Prompt 2 — Phản biện một mã đã có

Dùng khi ai đó (kể cả AI khác, kể cả bạn) đã đề xuất một mã. Đây là prompt giá trị nhất.

```
Có người đề xuất mã <MÃ HS> cho mặt hàng: <mô tả>.

Hãy PHẢN BIỆN đề xuất này, đừng xác nhận nó:
1. Trích nguyên văn mô tả của mã <MÃ HS> trong Danh mục. Mô tả đó có thực sự khớp không?
2. Có Chú giải Phần/Chương nào LOẠI TRỪ mặt hàng này khỏi nhóm đó không? Trích nguyên văn.
3. Trong cùng phân nhóm 6 số còn những mã 8 số nào khác? Liệt kê hết kèm thuế suất.
   Mã nào trong số đó khớp mô tả hàng SÁT HƠN?
4. Có nhóm 4 số nào khác cạnh tranh không? Vì sao bị loại?
5. Kết luận: mã này VỮNG / CÓ RỦI RO / SAI — kèm lý do dựa trên văn bản.

Nếu không đủ căn cứ để kết luận, nói rõ thiếu thông tin gì.
```

## Prompt 3 — Tra nguyên văn một chú giải

```
Trích NGUYÊN VĂN Chú giải <số> Phần <số La Mã> (hoặc Chương <số>), cả tiếng Việt lẫn
tiếng Anh. Sau đó giải thích: chú giải này LOẠI TRỪ cái gì ra khỏi đâu, hoặc ĐƯA cái gì
vào đâu? Cho một ví dụ mặt hàng cụ thể.
```

## Prompt 4 — Tra thuế suất (dùng cẩn thận)

```
Tìm CHÍNH XÁC dòng có mã <MÃ HS 8 SỐ> trong các file biểu thuế.
Chép lại NGUYÊN VĂN cả dòng đó, kèm tên file và tiêu đề chương.
Nếu không tìm thấy đúng mã đó, trả lời "KHÔNG TÌM THẤY" — tuyệt đối không đưa dòng
của mã gần giống.
Sau đó nhắc lại: mỗi mức FTA áp dụng với điều kiện C/O form nào.
```

> ⚠️ Kể cả với prompt này, **vẫn phải tự mở file kiểm tra lại con số** trước khi dùng cho
> tờ khai hoặc báo giá. Xem mục 6 của `00-cach-doc-bieu-thue.md`.

---

## Bốn dấu hiệu câu trả lời không đáng tin

Nhận ra ngay khi thấy:

| Dấu hiệu | Vì sao là cờ đỏ |
|---|---|
| **"Mức độ tin cậy: 95%"** | Không có gì đằng sau con số này. Nó chỉ tạo cảm giác an tâm giả. |
| **Kết luận đúng một mã, không có ứng viên thay thế** | Phân loại HS gần như luôn có nhóm cạnh tranh. Không nêu ra nghĩa là chưa xét. |
| **Diễn giải chú giải mà không trích nguyên văn** | Đây là chỗ hay bịa nhất. Chú giải bị đọc **ngược chiều** rất thường xuyên. |
| **Bảng thuế không kèm số nghị định + năm** | Thuế suất không có ngày hiệu lực thì vô nghĩa. |

### Ví dụ thật về chú giải bị đọc ngược

**Chú giải 1(g) Phần XVI** nằm dưới câu *"1. Phần này **không bao gồm**:"* — tức nó
**loại bộ phận có công dụng chung RA KHỎI** Phần XVI (máy móc), đẩy chúng về Phần XV
(kim loại) hoặc Chương 39 (nhựa).

Nó **không** nói "bộ phận máy móc thì không được xếp vào chương nhựa/thép". Đó là chiều ngược lại.

Cái đưa bộ phận chuyên dùng **vào** nhóm của máy chính là **Chú giải 2(b) Phần XVI**, một
điều khoản khác. Trích sai điều khoản vẫn có thể ra đúng mã — nhưng lập luận sẽ sụp khi
hải quan phản biện.

→ Đối chiếu ở `11-chu-giai-phan.md`, mục **PHẦN XVI**.

---

## Trình tự làm việc khuyến nghị

1. **Hỏi Prompt 1** → nhận top-3 ứng viên kèm lập luận.
2. **Hỏi Prompt 2** với ứng viên số 1 → ép nó tự phản biện.
3. **Tự mở file** `12/13-chu-giai-chuong-*.md`, đọc chú giải chương bằng mắt.
4. **Tự mở file biểu thuế**, tìm đúng mã, đọc con số bằng mắt.
5. Còn phân vân giữa 2 mã → cân nhắc **xác định trước mã số** với cơ quan hải quan
   (thủ tục ở `1-van-ban-phap-luat/04-tt-38-2015-thu-tuc-hai-quan.md`).

Bước 3 và 4 không bỏ được. NotebookLM giúp bạn **thu hẹp từ 11.414 mã xuống 3 mã** —
đó là chỗ nó giỏi. Bước chọn 1 trong 3 vẫn là việc của người.
