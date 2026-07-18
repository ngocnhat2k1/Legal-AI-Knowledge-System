---
type: concept
status: active
updated: 2026-07-18
related:
  - data-sources.md
  - hs-classification.md
  - ../project-context.md
  - ../business-rules.md
---

# Hệ thống Thuế quan Việt Nam — Cấu trúc, Cạm bẫy, và Vì sao "Mức thuế" Không phải một Đại lượng vô hướng

Ghi chú này là mô hình miền cho tính năng 1 của Customs Assistant (tra cứu thuế quan chính xác, tất
định, được khóa theo HS + biểu thuế + ngày). Nó tồn tại để ngăn một agent xây dựng ra thứ trông có vẻ
hợp lý, đầy tự tin, nhưng sai. Hãy đọc cái bẫy phụ lục và kẻ giết người thời gian trước khi viết bất kỳ
bộ phân tích cú pháp hay bất kỳ lược đồ nào.

Mọi thứ dưới đây đều mang một ngày xác minh và một nguồn. Ở những chỗ nghiên cứu không chắc chắn hay
tự-mâu-thuẫn, điều đó được giữ nguyên chứ không được làm phẳng đi. Xem
[Chưa xác minh / Không được dựa vào](#chưa-xác-minh--không-được-dựa-vào) và
[Xung đột đã giải quyết](#xung-đột-đã-giải-quyết).

---

## ⚠️ CÁI BẪY PHỤ LỤC — đọc phần này trước

**1,520 mã HS xuất hiện ở CẢ HAI Phụ lục I (biểu thuế xuất khẩu) và Phụ lục II (biểu thuế nhập khẩu ưu
đãi) của Nghị định 26/2023/NĐ-CP. Trong số đó, 1,329 mã mang một mức thuế KHÁC NHAU ở mỗi phụ lục.**
(đã xác minh 2026-07-17, nguồn: nghiên cứu 12 — phân tích cú pháp nhận-biết-phụ-lục 14 phần `.doc` Công
báo của NĐ 26/2023 tại https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm)

Một bộ phân tích cú pháp làm phẳng nghị định thành một ánh xạ `HS → rate` duy nhất, bỏ qua ranh giới
phụ lục, sẽ trả về mức thuế **xuất khẩu** để trả lời cho một câu hỏi **nhập khẩu**. Một cách âm thầm.
Không lỗi. Ở mức **thành công bề ngoài 94%**.

Ví dụ minh họa (đã xác minh 2026-07-17, nguồn: nghiên cứu 12, cùng lần trích xuất Công báo):

| Mã HS | Phụ lục | Ý nghĩa | Mức thuế |
|---|---|---|---|
| `0301.11.10` | Phụ lục I | Biểu thuế **xuất khẩu** | **0** |
| `0301.11.10` | Phụ lục II | Biểu thuế **nhập khẩu ưu đãi** (MFN) | **15** |

Một lần phân tích cú pháp ngây thơ mã đó cho ra `['0', '15']` và một bước làm phẳng chọn lấy một. Bất
kể nó chọn cái nào, nó đúng một nửa số lần và báo cáo thành công dù thế nào đi nữa.

**Tại sao đây là đoạn văn quan trọng nhất trong file:** đây là hình dạng của dự án này khi nó thất bại.
Không phải một sự sụp đổ. Không phải dữ liệu thiếu. Không phải một ô trống mà ai đó để ý thấy. Đó là dữ
liệu sai trông có vẻ hợp lý nhưng báo cáo thành công — gắn với một tờ khai hải quan ràng buộc về pháp
lý, nơi người khai (không phải công cụ) gánh trách nhiệm về việc nộp thiếu, truy áp hồi tố, và các chế
tài (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §3).

**Hệ quả thiết kế:** `annex` / `schedule` không phải là siêu dữ liệu (metadata). Nó là một phần của
khóa chính (primary key). Không hề tồn tại cái gọi là "mức thuế cho HS 0301.11.10".

---

## 1. Cơ sở MFN: NĐ 26/2023/NĐ-CP và chuỗi văn bản sửa đổi

**Nghị định 26/2023/NĐ-CP (ký 31/5/2023, hiệu lực 15/7/2023) VẪN là nghị định gốc — nó KHÔNG bị thay
thế.** Nó đã thay thế NĐ 122/2016, 125/2017, 57/2020, 101/2021, và 51/2022. (đã xác minh 2026-07-17,
nguồn: nghiên cứu 10 §1; https://vanban.chinhphu.vn/?pageid=27160&docid=208020)

Chuỗi sửa đổi — **tất cả những cái này đều sửa đổi 26/2023; không cái nào thay thế nó**:

| Nghị định | Ngày / hiệu lực | Phạm vi |
|---|---|---|
| **144/2024/NĐ-CP** | hiệu lực 16/12/2024 | Sửa đổi NĐ 26/2023 (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §3) |
| **199/2025/NĐ-CP** | 08/07/2025 | Tăng mức thuế xuất khẩu + nhập khẩu MFN đối với nhiều mặt hàng ở Phụ lục I & II; bổ sung các điểm c.3.6/c.3.7 vào Điều 8(3) (chương trình lắp ráp ô tô). Phốt pho vàng 5→10% vào 01/01/2026, →15% vào 01/01/2027; TMBP 0% chỉ đến hết 08/2025; điều kiện sản lượng linh kiện ô tô (đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §1 https://luatvietnam.vn/xuat-nhap-khau/nghi-dinh-199-2025-nd-cp-405228-d1.html ; nghiên cứu 12 §3) |
| **108/2025/NĐ-CP** | 2025 | Thuế xuất khẩu đối với clinker xi măng (đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §1) |
| **72/2026/NĐ-CP** | ký 09/03/2026, hiệu lực cùng ngày | Mức thuế MFN đối với xăng/naphtha/reformate và nguyên liệu lọc dầu, 10% → 0%. **Chỉ có hiệu lực đến 30/04/2026.** (đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §1 https://vanban.chinhphu.vn/?amp=&docid=217144&pageid=27160 ; nghiên cứu 12 §3) |
| **201/2026/NĐ-CP** | 08/06/2026 | Mức thuế xuất khẩu đối với một số mặt hàng (đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §1 https://english.luatvietnam.vn/decree-no-201-2026-nd-cp-dated-june-08-2026-of-the-government-amending-and-supplementing-export-duty-rates-of-a-number-of-commodity-items-in-the-exp-436911-doc1.html) |

### ⚠️ Chuỗi văn bản sửa đổi ở trên CHƯA được xác nhận là đầy đủ — đừng coi nó là mốc hợp nhất chuẩn

**Hai báo cáo nghiên cứu đưa ra các chuỗi khác nhau, và không cái nào tự nhận là đầy đủ:**

| Nguồn | Chuỗi được đưa ra |
|---|---|
| Nghiên cứu 10 §1 | 26/2023 ⊕ 199/2025 ⊕ 72/2026 ⊕ 201/2026 ⊕ 108/2025 — **không có 144/2024** |
| Nghiên cứu 12 §3 | 26/2023 ⊕ 144/2024 ⊕ 199/2025 ⊕ 72/2026 — **không có 108/2025, không có 201/2026**; cộng thêm các biểu thuế AJCEP và VJEPA mới hiệu lực 01/04/2026, một biểu thuế VN–Campuchia 2026, và NĐ 26/2026 (hóa chất) |

Bảng trên là **hợp (union)** của cả hai, được trình bày như một tập các đầu mối có nguồn riêng lẻ.
**Phép hợp này không phải là một chuỗi đã được xác minh.** Không báo cáo nào liệt kê chuỗi sửa đổi như
là câu hỏi nghiên cứu của nó; mỗi báo cáo chỉ đề cập đến những nghị định mà nó tình cờ gặp. Việc gộp
hai danh sách không đầy đủ tạo ra một danh sách vẫn không đầy đủ, và tạo cho nó một vẻ đầy đủ giả tạo.

**Đừng nạp dữ liệu dựa trên bảng này.** Hãy thiết lập chuỗi thực từ Công báo — nơi công bố mọi nghị
định theo thứ tự công báo — trước khi nạp dữ liệu Giai đoạn 1. Xem `Câu hỏi mở 6` trong
[Kế hoạch khởi tạo](../planning/00-bootstrap.md) và TASK-009 trong [Danh sách công việc](../planning/01-task-list.md),
vốn nêu cùng một ràng buộc: *đừng gộp chúng và cho rằng phép hợp là đúng*.

Một nghị định sửa đổi bị thiếu không phải là một thất bại hữu hình. Đó là một mức thuế sai một cách âm
thầm, đầy tự tin, và về mặt pháp lý — cùng một hình dạng thất bại với cái bẫy phụ lục ở trên.

⚠️ **Không có văn bản hợp nhất chính thức nào cho việc này được công bố dưới dạng dữ liệu đọc-được-bằng-máy**
(đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §1). Việc hợp nhất là của chúng ta để thực hiện, và do đó
là của chúng ta để làm sai. Mỗi bước hợp nhất là một hành động biên tập phải truy vết được về nghị định
sửa đổi và ngày của nó — bởi vì câu trả lời cho "mức thuế vào ngày D là bao nhiêu" khác với "mức thuế
hôm nay là bao nhiêu", và cả hai đều là những câu hỏi chính đáng từ một người khai đang sửa một tờ khai
trong quá khứ.

### Cấu trúc của NĐ 26/2023

(đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §1, phân tích cú pháp nhận-biết-phụ-lục các phần `.doc`
Công báo)

| Phụ lục | Nội dung | Số mã HS duy nhất | Có mức thuế `%` được khôi phục |
|---|---|---|---|
| **Phụ lục I** | Biểu thuế **XUẤT KHẨU** — chỉ là danh mục hàng chịu thuế, KHÔNG phải đủ 97 chương | 1,520 | 1,471 (96.8%) |
| **Phụ lục II** | Biểu thuế **NHẬP KHẨU ưu đãi** (MFN) — đủ 97 chương | **11,874** | 11,160 (94.0%) |
| **Phụ lục III** | Thuế tuyệt đối / hỗn hợp (xe đã qua sử dụng) | — | 0 — **số tiền USD, không phải phần trăm**; một regex `%` không tìm thấy gì ở đây |
| **Phụ lục IV** | Mức thuế ngoài hạn ngạch TRQ | — | 0 — cấu trúc riêng biệt |

Lưu ý sự bất đối xứng làm cho cái bẫy phụ lục trở nên khả dĩ: Phụ lục I là một **danh mục ngắn** (chỉ
những mặt hàng chịu thuế xuất khẩu), trong khi Phụ lục II là **toàn bộ danh pháp**. Phần giao nhau của
chúng chính xác là 1,520 mã ở trên.

Cũng lưu ý rằng việc Phụ lục III cho ra không có dòng `%` nào không phải là một lỗi phân tích cú pháp
cần sửa — thuế tuyệt đối thực sự không phải là phần trăm. Một pipeline coi "không trích xuất được mức
thuế" là một lỗi sẽ đuổi theo một bóng ma ở đây; một pipeline coi nó là 0% sẽ sai một cách thảm khốc.

---

## 2. Danh pháp — chiều HS/AHTN

- **Thông tư 31/2022/TT-BTC (08/06/2022, hiệu lực 01/12/2022) VẪN đang hiện hành.** Nó đã thay thế TT
  65/2017 và được xây dựng trên **HS 2022 / AHTN 2022**. Cấu trúc: **21 phần · 97 chương · 1,228 nhóm
  (4 chữ số) · 4,084 phân nhóm (6 chữ số) · 11,414 dòng hàng (8 chữ số)** (đã xác minh 2026-07-17,
  nguồn: nghiên cứu 10 §2,
  https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx)
- **HS 2028 có hiệu lực 01/01/2028** (phiên bản WCO thứ 8). AHTN 2028 đang được đàm phán; Việt Nam sẽ
  ban hành một Thông tư thay thế. **Không có HS 2028 nào có hiệu lực hôm nay.** (đã xác minh 2026-07-17,
  nguồn: nghiên cứu 10 §2, https://kv05.customs.gov.vn/index.jsp?aid=215061&cid=25&pageId=2)
- **Không được hardcode AHTN 2022.** Hãy mô hình hóa phiên bản HS như một chiều với các ngày hiệu lực.
  Việc tái danh pháp tái định cơ sở cho các mã HS và làm mồ côi các ánh xạ lịch sử (đã xác minh
  2026-07-17, nguồn: nghiên cứu 12 §6).

Riêng biệt nhưng thường bị nhầm lẫn: **Thông tư 85/2026/TT-BTC (hiệu lực 15/9/2026)** điều chỉnh việc
*phân loại hàng hóa và phân tích để phân loại* — nó thay thế TT 14/2015 + TT 17/2021. **Nó là QUY TRÌNH
phân loại, không phải danh pháp.** Nó không thay đổi các mã là gì. (đã xác minh 2026-07-17, nguồn:
nghiên cứu 10 §2, https://thuehaiquan.tapchikinhtetaichinh.vn/doi-moi-quy-dinh-phan-loai-phan-tich-hang-hoa-xuat-nhap-khau-161123.html)

Tham chiếu chéo: phương pháp luận phân loại (GRI, bằng chứng, xác định trước) nằm trong
[Phân loại mã HS](hs-classification.md). Ghi chú này chỉ bao quát phía mức thuế.

---

## 3. Biểu thuế ưu đãi FTA — đợt 17 nghị định năm 2022

Mười bảy nghị định, **tất cả ban hành 30/12/2022**, bao quát giai đoạn **2022–2027**. Hai nguồn độc lập
đồng thuận về ánh xạ này (đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §3,
https://www.haiquanvietnam.com/2022/12/17-nghi-dinh-bieu-thue-xuat-khau-uu-dai-bieu-thue-nhap-khau-uu-dai-dac-biet.html
và https://itslogisticsvn.blog/bieu-thue-xuat-nhap-khau-uu-dai-thuc-thi-cac-fta-tu-nam-2022-2028/):

| Nghị định | FTA | Giai đoạn |
|---|---|---|
| 112/2022 | VCFTA (Chile) | 2022–2027 |
| 113/2022 | VN–EAEU FTA | 2022–2027 |
| 114/2022 | VN–Cuba | 2022–2027 |
| 115/2022 | **CPTPP** (XK + NK) | 2022–2027 |
| 116/2022 | **EVFTA** (XK + NK) | 2022–2027 |
| 117/2022 | **UKVFTA** (XK + NK) | 2022–2027 |
| 118/2022 | ACFTA | 2022–2027 |
| 119/2022 | AKFTA | 2022–2027 |
| 120/2022 | AJCEP | **2022–2028** |
| 121/2022 | AANZFTA | 2022–2027 |
| 122/2022 | AIFTA | 2022–2027 |
| 123/2022 | AHKFTA | 2022–2027 |
| 124/2022 | VJEPA | **2022–2028** |
| 125/2022 | VKFTA | 2022–2027 |
| 126/2022 | ATIGA | 2022–2027 |
| 127/2022 | VN–Laos | 30/12/2022 – 04/10/2023 (**ĐÃ HẾT HIỆU LỰC**) |
| 129/2022 | RCEP | 2022–2027 |

⚠️ **128/2022/NĐ-CP KHÔNG phải là một nghị định biểu thuế FTA** — cả hai nguồn đều bỏ qua nó. **Đừng
cho rằng dải 112–129 là liên tục** và đừng để một vòng lặp tự sinh ra số hiệu nghị định (đã xác minh
2026-07-17, nguồn: nghiên cứu 10 §3).

⚠️ **127/2022 (VN–Lào) đã hết hiệu lực 04/10/2023.** Một bảng biểu thuế thiếu cột hết hạn sẽ phục vụ nó
mãi mãi.

Ngoài đợt 2022:

- **131/2024/NĐ-CP — VIFTA (Israel)**, hiệu lực 15/10/2024 → 31/12/2027. Hơn 11,400 dòng. Mức cam kết
  trung bình 10.3% (2024) → 9.3% (2025) → 8.4% (2026) → 7.5% (2027). (đã xác minh 2026-07-17, nguồn:
  nghiên cứu 10 §3,
  https://baochinhphu.vn/bieu-thue-nhap-khau-uu-dai-dac-biet-viet-nam-israel-giai-doan-2024-2027-102241016122557627.htm)
- **143/2026/NĐ-CP — CEPA (UAE)**, ban hành 05/05/2026, hiệu lực 05/05/2026 → 31/12/2027; **các mức
  thuế áp dụng hồi tố từ 03/02/2026**. (đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §3,
  https://luatvietnam.vn/thue/nghi-dinh-143-2026-nd-cp-bieu-thue-nhap-khau-uu-dai-viet-nam-uae-2026-2027-434005-d1.html)
  Tính hồi tố là một trục thời gian thứ ba bên cạnh ký/hiệu-lực/công-báo — một mức thuế có thể trở thành
  câu trả lời đúng cho một ngày đã trôi qua.
- Nghiên cứu 12 còn quan sát thấy, trong năm 2026: **các biểu thuế AJCEP và VJEPA mới hiệu lực
  01/04/2026**, một **biểu thuế Việt Nam–Campuchia 2026**, và **NĐ 26/2026 (hóa chất)**. (đã xác minh
  2026-07-17, nguồn: nghiên cứu 12 §3. Số hiệu nghị định cho các biểu thuế AJCEP/VJEPA/Campuchia 2026
  không được ghi lại — xem [Chưa xác minh](#chưa-xác-minh--không-được-dựa-vào).)

### ⚠️ VÁCH ĐÁ 2027

**Về cơ bản toàn bộ kho FTA hết hiệu lực vào 31/12/2027.** Một đợt kế tiếp gồm khoảng 17 nghị định sẽ
xuất hiện vào khoảng tháng 12/2027 — **đồng thời với việc chuyển đổi danh pháp AHTN/HS 2028 vào
01/01/2028**. Đó là một **cuộc thay thế toàn bộ kho tài liệu trong một lần, khoảng 18 tháng kể từ hôm
nay** (đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §3 và bản tóm tắt Tính khả thi; cũng được suy ra
độc lập trong nghiên cứu 12 §6).

**Tại sao điều này quyết định lược đồ ngay bây giờ, không phải năm 2027:** nếu `hs_version` và
`valid_from`/`valid_to` không phải là các chiều hạng nhất ngay từ ngày đầu, thì vực thẳm 2027 không
phải là một cuộc di trú (migration) — nó là một cuộc viết lại, được thực hiện dưới áp lực thời gian, đối
đầu với một kho tài liệu mà mọi mã đều có thể đã bị tái định cơ sở. **Không bao giờ mô hình hóa "mức
thuế hiện tại" như một đại lượng vô hướng (scalar).** Một dòng mức thuế tối thiểu là `(hs_code,
hs_version, schedule, valid_from, valid_to, source_decree)`.

---

## 4. Mức thuế không phải là hàm của (HS, quốc gia)

Đây là hạt nhân khái niệm. Mô hình trực giác — "cho tôi mã HS và nước xuất xứ, nhận về mức thuế" —
không chỉ đơn thuần là chưa đầy đủ. **Nó không phải là một hàm số**: cùng một cặp (HS, nước) ánh xạ tới
các mức thuế khác nhau tùy thuộc vào những sự kiện mà bảng thuế quan không chứa đựng.

- **Ưu đãi FTA là CÓ ĐIỀU KIỆN, không tự động.** RCEP **Điều 4** yêu cầu các quy tắc xuất xứ *cộng với
  một chứng nhận xuất xứ (C/O) hợp lệ*. "Thuế là 0%" là sai. "0% **nếu** bạn có C/O hợp lệ, ngược lại
  15% MFN" là đúng. (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §6, văn bản NĐ 129/2022 qua Công báo)
- **RCEP Điều 6.2 — quy tắc mức-thuế-cao-nhất.** Đối với một số hàng hóa đa xuất xứ, mức thuế áp dụng là
  mức cao nhất trên các phụ lục liên quan. Nguyên văn từ văn bản nghị định:
  > "Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."

  (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §6, văn bản NĐ 129/2022). Đây là điều khoản chính thức
  phá vỡ tính hàm số: mức thuế phụ thuộc vào một tập hợp các xuất xứ, không phải một.
- **`*` nghĩa là BỊ LOẠI TRỪ, không phải bằng không.** Nghiên cứu 12 đã đếm được **54 ô `*` chỉ trong
  một số công báo RCEP** (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §2). Một bộ phân tích số học ép
  `*` thành `0` hoặc `NULL` sẽ tạo ra một câu trả lời miễn thuế cho một mặt hàng hoàn toàn không có ưu
  đãi. `*` phải là một trạng thái hạng nhất.
- **RCEP có sáu phụ lục quốc gia** trong một file: A=ASEAN, B=Úc, C=Trung Quốc, D=Nhật Bản, E=Hàn Quốc,
  F=New Zealand (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §2). Chỉ tên FTA không xác định được biểu
  thuế; phụ lục theo đối tác mới xác định được.
- **Hàng hóa TRQ** phụ thuộc vào tình trạng hạn ngạch; các mức thuế ngoài hạn ngạch nằm ở một phụ lục
  khác (Phụ lục IV của NĐ 26/2023). Các nhóm TRQ đã xác minh: **04.07, 17.01, 24.01, 25.01** (trứng,
  đường, thuốc lá, muối) (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §6, văn bản NĐ 129/2022).
- **Thuế tuyệt đối / hỗn hợp** (xe đã qua sử dụng, Phụ lục III) là **số tiền USD, không phải phần trăm**
  (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §1/§6). Kiểu của cột mức thuế không phải là
  `numeric percent`.
- **Các mã đặc biệt của Chương 98** (ví dụ 98.49 linh kiện ô tô) mang **các điều kiện đủ điều kiện tham
  gia chương trình** (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §6). Các điều kiện sản lượng linh
  kiện ô tô của NĐ 199/2025 là một ví dụ: mức thuế phụ thuộc vào sản lượng sản xuất, vốn là một sự kiện
  về nhà nhập khẩu, không phải về hàng hóa.
- **Thuế chống bán phá giá / tự vệ là đặc thù theo quốc gia và nằm trong các quyết định của MOIT, không
  ở bất kỳ Nghị định nào.** Đối với truy vấn nguyên mẫu — "thép từ Trung Quốc" — **bảng thuế quan là
  con số ít quan trọng nhất** (đã xác minh 2026-07-17, nguồn: nghiên cứu 12 §6).

**Hệ quả thiết kế cho v1:** khâu tra cứu tất định trả về *các dòng mức-thuế-ứng-viên kèm theo điều kiện
của chúng và nghị định được trích dẫn* — không bao giờ là một con số đơn lẻ được trình bày như câu trả
lời. Các điều kiện (có giữ C/O không? trong hạn ngạch không? đủ điều kiện chương trình không? đa xuất xứ
không?) là những sự kiện mà công cụ không có và người khai thì có. Đây là cùng một tư thế con-người-quyết-định
như gợi ý ứng viên HS, và nó không phải là một sở thích về UX — nó bắt nguồn từ việc luật không phải là
một bảng tra cứu.

---

## 5. Các loại thuế khác khi nhập khẩu

**Chỉ thuế nhập khẩu/xuất khẩu và VAT là được khóa theo HS một cách nguyên bản.** (đã xác minh
2026-07-17, nguồn: nghiên cứu 10 §4)

| Thuế | Văn bản | Theo từng HS? |
|---|---|---|
| **GTGT (VAT)** | Luật 48/2024/QH15 + **NĐ 181/2025/NĐ-CP** (hiệu lực 01/7/2025). **NĐ 174/2025** gia hạn mức giảm 2% (tức là 8%) đến **31/12/2026** | **Một phần.** Tiêu chuẩn 10%. Phụ lục I/II của NĐ 181 liệt kê tài nguyên/khoáng sản xuất khẩu không chịu thuế **kèm mã HS**. **Danh mục 5% là THEO MÔ TẢ → cần ánh xạ.** (nguồn: https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-181-2025-nd-cp-565-102796-article.html) |
| **TTĐB (tiêu thụ đặc biệt)** | **Luật Thuế TTĐB 66/2025/QH15** | **KHÔNG — không khóa theo HS.** Xác minh qua chính API hải quan: một truy vấn TTĐB trả về các dòng như `"I. Hàng hóa"`, `"1. Thuốc lá điếu…"`, `"2. Rượu"` với **`MA_HS: None`**. Bảng luật định theo danh mục sản phẩm, không theo dòng HS. Bất kỳ ánh xạ HS→danh mục nào cũng là **suy diễn biên tập của riêng chúng ta và là một bề mặt trách nhiệm pháp lý.** |
| **BVMT (bảo vệ môi trường)** | Luật Thuế BVMT + các nghị quyết của UBTVQH/QH. **NQ 19/2026/QH16 (12/04/2026)** đặt xăng/nhiên liệu bay về **0 đ/lít** cho giai đoạn 16/4–30/6/2026; **gia hạn đến 30/9/2026** | **KHÔNG — không khóa theo HS.** Cùng phát hiện: API trả về `"I. Xăng, dầu, mỡ nhờn"`, `"1. Xăng, trừ etanol"` không có HS. **Rất biến động — mức thuế thay đổi vài tháng một lần bằng NGHỊ QUYẾT, không phải nghị định.** (nguồn: https://english.luatvietnam.vn/resolution-no-19-2026-qh16-dated-april-12-2026-of-the-national-assembly-on-promulgation-of-a-number-of-provisions-on-environmental-protection-tax-v-431850-doc1.html ; https://baochinhphu.vn/keo-dai-thoi-han-ap-dung-uu-dai-thue-voi-mat-hang-xang-dau-den-30-9-2026-102260701163839168.htm) |
| **Chống bán phá giá / tự vệ** | **Các Quyết định-BCT** riêng lẻ, theo từng vụ | **Có, được liệt kê theo HS, nhưng rải rác.** Mỗi QĐ liệt kê mã HS (ví dụ QĐ 228/QĐ-BCT 2026 kính nổi → 7005.29.20, 7005.29.90; thép hình chữ H → 7216.33.11/.19/.90, 7228.70.10/.90). **Không tồn tại sổ đăng ký hợp nhất đọc-được-bằng-máy nào.** Phải cào (scrape) pvtm.gov.vn / moit.gov.vn theo từng vụ và theo dõi vòng đời **sơ bộ → chính thức → rà soát cuối kỳ**. **Đây là tập dữ liệu khó nhất cho đến nay.** (nguồn: https://pvtm.gov.vn/ ; https://luatvietnam.vn/thue/quyet-dinh-228-qd-bct-2026-ap-dung-thue-chong-ban-pha-gia-tam-thoi-san-pham-kich-noi-khong-mau-tu-indonesia-va-malaysia-425919-d1.html) |

Tất cả các dòng ở trên: đã xác minh 2026-07-17, nguồn: nghiên cứu 10 §4.

**Tại sao phát hiện "KHÔNG khóa theo HS" quan trọng hơn vẻ ngoài của nó:** nó có nghĩa là TTĐB và BVMT
không thể được nối (join) vào bảng thuế quan mà không phát minh ra khóa nối. Ngay khoảnh khắc chúng ta
xuất bản một ánh xạ HS→danh-mục-TTĐB, chúng ta sở hữu nó — luật không xác nhận nó, và một ánh xạ sai
không thể phân biệt được với một mức thuế sai đối với người khai. BVMT làm điều này phức tạp thêm bằng
việc thay đổi theo nhịp nghị quyết đo bằng đơn vị tháng.

**Ghi chú phạm vi v1:** BVMT/TTĐB/chống bán phá giá được xác định rõ ràng là nằm ngoài phạm vi tra cứu
tất định của v1. Khi một truy vấn chạm đến chúng, hành vi đúng là nói rằng công cụ không bao quát chúng
— không phải suy diễn.

---

## 6. ⚠️ Sát thủ thời gian

Đây là phát hiện tái định khung toàn bộ dự án. Cả ba chân đều được xác minh trong nghiên cứu 12 §3 (đã
xác minh 2026-07-17, nguồn: nghiên cứu 12 §3; bản ghi công báo tại congbao.chinhphu.vn).

**Chân 1 — thời gian chuẩn bị bằng không.** NĐ 72/2026 được **ký 09/03/2026 và hiệu lực cùng ngày** —
"kể từ ngày ký". Không có thời hạn thông báo nào để lên lịch một lần cào.

**Chân 2 — độ trễ công báo vượt quá ngày hiệu lực.** NĐ 72/2026 được đăng trong **Công báo số 157 vào
24/03/2026 — 15 ngày SAU khi nó đã là luật ràng buộc.** Các độ trễ tương đương:

| Nghị định | Ngày ký | Ngày công báo | Độ trễ |
|---|---|---|---|
| **NĐ 72/2026** | 09/03/2026 (hiệu lực cùng ngày) | 24/03/2026, Công báo số 157 | **~15 ngày luật ràng buộc-nhưng-chưa-công-báo** |
| NĐ 26/2023 | 31/05/2023 | 19/06/2023 | ~19 ngày |
| NĐ 116/2022 (EVFTA) | 30/12/2022 | từ 16/02/2023 | ~48 ngày |

**Có một cửa sổ nhiều tuần trong đó mức thuế có hiệu lực pháp lý không tồn tại dưới dạng đọc-được-bằng-máy
ở bất kỳ đâu** — chỉ như một bản scan lưỡng cực (bitonal) 200-DPI (xem [Nguồn dữ liệu](data-sources.md)
về phát hiện bản scan Kodak Alaris). Không lịch cào nào đóng được khoảng trống này, bởi trong thời gian
đó câu trả lời đúng không được công bố dưới bất kỳ dạng nào mà chúng ta có thể phân tích cú pháp.

**Chân 3 — các nghị định hết hạn và lặng lẽ đảo ngược.** NĐ 72/2026 **chỉ có hiệu lực đến 30/04/2026 —
một cửa sổ 52 ngày** — sau đó các mức thuế xăng/naphtha/reformate **đảo ngược** về mức 10% của NĐ
26/2023. Một thiết kế "cào phiên bản mới nhất" không có khái niệm về sự đảo ngược. **Nó sẽ phục vụ xăng
0% mãi mãi.**

Lưu ý rằng chân 2 và 3 tương tác một cách hiểm ác: một hệ thống nạp NĐ 72/2026 vào 24/03/2026 (ngày
công báo) đã sai trong 15 ngày trước khi nạp và sai lần nữa kể từ 01/05/2026 trừ khi nó mô hình hóa
được sự hết hạn mà nó đọc thấy trong cùng văn bản đó.

### Kết luận cần nêu thẳng

**Đây không phải là một bài toán cào dữ liệu rồi giải quyết xong thành một cơ sở dữ liệu. Nó là một bài
toán về tính-cập-nhật-pháp-lý (legal-currency) khoác bộ đồ kỹ thuật dữ liệu.**

Phần nền tảng (baseline) là một công việc một-lần — nghiên cứu 12 đã lắp ráp một bảng MFN 11,874 dòng
đã được kiểm chứng trong một phiên duy nhất. **Việc giữ đúng thì không có giới hạn, mang tính đối kháng,
và vĩnh viễn tụt lại phía sau.** Mỗi khoảng trống là một câu trả lời sai ràng buộc về pháp lý trên tờ
khai của một ai đó.

Hình dạng có thể bảo vệ được suy ra từ đó (đã xác minh 2026-07-17, nguồn: nghiên cứu 12, kết luận cuối
cùng): `.doc` Công báo là nguồn duy nhất; phân tích cú pháp **nhận-biết-phụ-lục** với một bộ phân tích
bảng Word thực thụ; một **mô hình thời gian nhận-biết-ngày-hiệu-lực / ngày-hết-hạn** thay vì "mới nhất";
các trạng thái `*` / TRQ / thuế-tuyệt-đối / có-điều-kiện-C-O tường minh; và đầu ra **trích dẫn nghị
định và ngày và từ chối khi ảnh chụp nhanh (snapshot) của nó có thể đã cũ** — một công cụ hỗ trợ nghiên
cứu cho thấy nguồn của nó, không bao giờ là một cỗ máy trả lời phát biểu một mức thuế.

Mệnh đề cuối cùng đó là một ràng buộc sản phẩm suy ra từ luật, không phải một sự né tránh. Xem
[Bối cảnh dự án](../project-context.md) để biết nó định hình phạm vi v1 như thế nào.

---

## Chưa xác minh / Không được dựa vào

Được tái tạo từ nghiên cứu như đã được gắn cờ. Đừng "tẩy rửa" bất kỳ điều nào trong số này thành các
khẳng định đầy tự tin.

- **Việc trích xuất bảng `.doc` của EVFTA có thể không cứu vãn được — trạng thái: SUY LUẬN, chưa được
  chứng minh.** Trên NĐ 116/2022 (EVFTA), `textutil` đã dồn một dòng của bảng thành
  `2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9` — sáu mức thuế (`29 | 25,4 | 21,8 | 18,1 |
  14,5 | 10,9`) bị nối vào nhau **không có dấu phân cách**, trong một ngôn ngữ dùng dấu phẩy thập phân.
  Nghiên cứu 12 nói rõ ràng: *"Tôi đang suy luận, không phải khẳng định, rằng đây là một tạo tác của
  công cụ (tooling artifact)"* — RCEP có cấu trúc 6 năm y hệt và trích xuất hoàn hảo, điều này gợi ý
  rằng một bộ phân tích nhận-biết-bảng đúng đắn (LibreOffice → docx → `w:tbl/w:tr/w:tc`) sẽ sửa được
  nó, **nhưng điều này không thể được chứng minh** (không có `soffice`, `antiword`, hay `python-docx`
  trong môi trường đó). **Đây là khoảng trống duy nhất mà người xây dựng phải đóng lại trước khi tin
  tưởng vào bất cứ điều gì.** (nghiên cứu 12 §2)
- **Các biểu thuế AJCEP / VJEPA / Việt Nam–Campuchia 2026**: nghiên cứu 12 quan sát thấy các biểu thuế
  AJCEP và VJEPA mới hiệu lực 01/04/2026 và một biểu thuế VN–Campuchia 2026, nhưng **các số hiệu nghị
  định không được ghi lại**. Đừng đoán chúng.
- **`data.gov.vn` / `open.data.gov.vn`**: DNS không phân giải được (`getaddrinfo ENOTFOUND`, curl
  `000`). **Được gắn cờ là chưa xác minh, KHÔNG phải đã-xác-nhận-chết** — có thể bị chặn theo địa lý.
  (nghiên cứu 10 §5b)
- **ASEAN Tariff Finder**: kết nối hết thời gian chờ — không thể xác minh. (nghiên cứu 10 §5b)
- **Việc liệu NĐ 128/2022 có liên quan đến thuế quan hay không** là chưa rõ. Chỉ xác nhận được rằng cả
  hai nguồn danh sách FTA đều bỏ qua nó. (nghiên cứu 10, bản tóm tắt Tính khả thi)
- **Việc liệu `APIBieuThue` có giới hạn tốc độ (rate limiting) hay không**: chưa được thăm dò. (nghiên
  cứu 10, bản tóm tắt Tính khả thi)
- **Vực thẳm FTA 2027** được xác minh về các ngày hết hạn (các nghị định ghi 2022–2027). Khẳng định
  rằng một đợt kế tiếp gồm ~17 nghị định xuất hiện vào khoảng tháng 12/2027 là một **phép chiếu**, và
  nghiên cứu 12 đánh dấu phiên bản của nó về điều này là *"cũng được suy luận, chưa xác minh"* (nghiên
  cứu 12 §6). Các ngày tháng là chắc chắn; hình dạng của đợt kế tiếp thì không.
- **Không có khẳng định nào ở đây về VNACCS/VCIS như một nguồn dữ liệu**: nó là một hệ thống xử lý tờ
  khai, không phải một nguồn cấp (feed). (nghiên cứu 10 §5b)

---

## Xung đột đã giải quyết

### API customs.gov.vn: research 10 so với research 12 — ĐÃ GIẢI QUYẾT (2026-07-18, TASK-002)

**Kết quả (2026-07-18, quyết định chủ dự án):** endpoint `bridge` của nghiên cứu 10
(`POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`) **có phản hồi** —
đây là endpoint được dùng. Backend IP-thô `http://123.30.210.236:8080/hqcustomsapi/` của nghiên cứu 12
**bị bỏ qua một cách có chủ đích** (không theo đuổi). Cả hai lời tường thuật đều có thể đúng — chúng mô
tả *các endpoint khác nhau*, đúng như phần hòa giải bên dưới dự đoán — nhưng đối với dự án này, `bridge`
là con đường và IP thô không cần thiết.

Điều này **không** làm thay đổi vị thế của API: nó vẫn là một lớp kiểm chứng chéo tiện lợi, **không phải
nguồn của sự thật pháp lý** (bốn điểm đồng thuận bên dưới vẫn đứng vững nguyên vẹn). **Không quyết định
thiết kế nào phụ thuộc vào việc `bridge` hoạt động** — nếu nó biến mất hoặc bắt đầu thực thi captcha,
pipeline `.doc` Công báo vẫn là con đường chịu tải. Rate-limit của `bridge` vẫn chưa được thăm dò.

Bản ghi xung đột gốc được giữ nguyên bên dưới làm lịch sử.

---

Hai agent nghiên cứu đạt đến **những kết luận khác nhau về bản chất đối với cùng một hệ thống**. Cả hai
đều được tái tạo. Xung đột đã được dàn xếp bằng quan sát trực tiếp trên trình duyệt (tab Network,
TASK-002, 2026-07-18): `bridge` phản hồi, IP thô bị bỏ qua.

| | **Nghiên cứu 10** | **Nghiên cứu 12** |
|---|---|---|
| Phán quyết | *"CÓ một API JSON không có tài liệu, không xác thực, **không có captcha**… Tôi đã xác minh nó bằng `curl` thuần"* | *"ít nhất một phần của cổng thông tin **bị chặn bởi CAPTCHA**"*; *"IP đó đã **hết thời gian chờ** từ đây"* |
| Endpoint tìm thấy | `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue` | `http://123.30.210.236:8080/hqcustomsapi/` hardcode trong `/scripts/main.js`, bao gồm `.../hqcustomsapi/captcha/CheckCaptcha` |
| Xác thực / captcha | *"Không xác thực, không JSESSIONID, không captcha, không kiểm tra Referer/Origin. Captcha trên trang chỉ ở phía client — API không thực thi nó."* | Tìm thấy một endpoint `CheckCaptcha` tường minh trong gói client (client bundle) |
| Khả năng tiếp cận | Tái lập với `curl` trần; `"8703"` trả về **510 dòng** | Không thể tiếp cận IP; nói rõ *"Tôi không thể phân biệt giữa chặn theo địa lý và chặn lối ra của sandbox, nên tôi không khẳng định là nó không thể tiếp cận"* |
| Tính khả thi | ~1,228 POST (mỗi nhóm 4 chữ số một lần) tái dựng 11,414 dòng × 26 biểu thuế — *"vài giờ cào lịch sự"* | *"Việc liệt kê ~11k mã qua một endpoint không có tài liệu, được che bởi CAPTCHA trên một IP thô là mong manh và đối kháng"* |

**Cách hòa giải — nay ĐÃ được xác nhận (2026-07-18, TASK-002):** đúng như dự đoán, hai bên tìm thấy
*những endpoint khác nhau* — đường dẫn được proxy qua `bridge` trên host công khai so với một backend
IP-thô. Chủ dự án quan sát trực tiếp trên trình duyệt (tab Network) thấy cổng gọi `bridge` và nhận dữ liệu
→ `bridge` là endpoint sống (Quan điểm A đúng); backend IP-thô **cố ý không theo đuổi**. Còn to-do (không
chặn thiết kế): tái hiện bằng `curl` trần từ mạng công ty và bắt một mẫu response cho một HS đã biết.

**Những gì cả hai agent đồng thuận, và do đó đứng vững bất kể xung đột được giải quyết ra sao:**

1. **API không phải là nguồn của sự thật. Nghị định mới là.** Nghiên cứu 10: *"Không có tài liệu, không
   phiên bản, không SLA, không cấp phép ToS. Có thể biến mất hoặc bắt đầu thực thi captcha. Coi như một
   lớp tiện lợi, nguồn của sự thật pháp lý vẫn là văn bản nghị định."* Nghiên cứu 12: *"nó không có thẩm
   quyền pháp lý — Nghị định mới có."*
2. `www.customs.gov.vn/robots.txt` là dễ dãi — `User-agent: *` với **không có dòng `Disallow` nào** (cả
   hai agent, đã xác minh 2026-07-17).
3. Phạm vi bao phủ FTA của API là **cũ (stale)**: không có VIFTA, không có CEPA (UAE); các giá trị
   `THOI_GIAN_CAP_NHAT` là 2019–2020 (nghiên cứu 10 §5a). Những cái đó phải đến từ NĐ 131/2024 và NĐ
   143/2026.
4. API chỉ cho **mức thuế của năm hiện tại** — không có chuỗi năm tương lai. Mức thuế 2027 phải đến từ
   các phụ lục nghị định (nghiên cứu 10 §5a).

Ngay cả trên cách đọc lạc quan nhất của nghiên cứu 10, API cũng không thể trả lời những câu hỏi mà dự
án này tồn tại để trả lời (theo ngày, hướng tới tương lai, có trích dẫn nghị định), và nó là một lớp
tiện lợi ở mức tốt nhất. **Pipeline `.doc` Công báo là con đường chịu tải dù thế nào đi nữa.** Đánh giá
đầy đủ theo từng nguồn nằm trong [Nguồn dữ liệu](data-sources.md).

---

## Kiến thức liên quan

- [Nguồn dữ liệu](data-sources.md) — nơi văn bản thực sự đến từ (`.doc` Công báo so với các bản scan
  chinhphu.vn, các chặn của vbpl.vn/thuvienphapluat, và xung đột API customs.gov.vn đầy đủ).
- [Phân loại mã HS](hs-classification.md) — GRI, gợi ý ứng viên, bằng chứng, xác định trước. Ghi chú
  này là phía mức thuế; ghi chú đó là phía mã số.
- [Bối cảnh dự án](../project-context.md) — phạm vi v1, đối tượng, và tại sao công cụ trích dẫn thay vì
  trả lời.
- [Quy tắc nghiệp vụ](../business-rules.md) — chính sách bền vững và các quy tắc kiểm tra hợp lệ suy ra
  từ những điều trên.
