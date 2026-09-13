# Cách đọc bộ dữ liệu mã HS và biểu thuế

> **Đọc file này trước khi dùng bất kỳ con số thuế suất nào trong các file cùng thư mục.**

## 1. Bộ dữ liệu này gồm gì

| Nội dung | Nguồn pháp lý | Số mã |
|---|---|---|
| Danh mục mã HS 8 số + mô tả | AHTN 2022 (Danh mục hàng hóa XNK Việt Nam) | 11.414 |
| Thuế nhập khẩu ưu đãi (MFN) | Phụ lục II Mục I, **NĐ 26/2023/NĐ-CP** | 11.414 |
| Thuế nhập khẩu ưu đãi Chương 98 | Phụ lục II Mục II, **NĐ 26/2023/NĐ-CP** | 460 |
| Thuế xuất khẩu | Phụ lục I, **NĐ 26/2023/NĐ-CP** | 1.520 |
| Ngoài hạn ngạch thuế quan (TRQ) | Phụ lục IV, **NĐ 26/2023/NĐ-CP** | 31 |
| ATIGA (ASEAN) — form D | **NĐ 126/2022/NĐ-CP** | 11.414 |
| ACFTA (ASEAN–Trung Quốc) — form E | **NĐ 118/2022/NĐ-CP** | 11.414 |
| AANZFTA (ASEAN–Úc–NZ) — form AANZ | **NĐ 121/2022/NĐ-CP** | 11.414 |
| EVFTA (Việt Nam–EU) — form EUR.1/REX | **NĐ 116/2022/NĐ-CP** | 11.414 |

NĐ 26/2023 có hiệu lực từ **2023-07-15**. Bốn nghị định FTA có hiệu lực từ **2022-12-30**.

## 2. Cách đọc một dòng

```
- **8481.80.99** Loại khác · MFN 10% · ATIGA 0% · ACFTA 0% · AANZFTA 0% · EVFTA 0%
  - Lộ trình EVFTA 5%/3,3%/1,6%/0%/0%/0% (2022→2027)
```

- `8481.80.99` — mã HS 8 số, viết theo dạng chấm. Trong dữ liệu gốc là `84818099`.
- `MFN 10%` — thuế nhập khẩu **ưu đãi thông thường**, áp dụng khi **không** xuất trình được C/O ưu đãi.
- `ATIGA 0%` … — thuế nhập khẩu **ưu đãi đặc biệt** theo từng FTA, **giá trị của năm 2026**.
- Dòng `Lộ trình` chỉ xuất hiện khi mức thuế **thay đổi theo năm**; đọc theo thứ tự
  2022 / 2023 / 2024 / 2025 / 2026 / 2027.

### Ký hiệu đặc biệt

| Ký hiệu | Nghĩa |
|---|---|
| `LOẠI TRỪ` | Mặt hàng **bị loại khỏi cam kết** của FTA đó. **KHÔNG phải 0%** — không có ưu đãi, phải áp MFN. Đây là lỗi hiểu nhầm phổ biến và tốn tiền nhất. |
| `n/a` | Không có dòng tương ứng trong biểu đó. |
| Thiếu dòng `Lộ trình` | Mức thuế **giữ nguyên** suốt 2022–2027. |

### ATIGA và EVFTA có cột theo từng năm; ACFTA và AANZFTA thì không

- **ATIGA, EVFTA**: 6 cột, mỗi cột một năm (2022…2027). Tra năm nào lấy cột năm đó.
- **ACFTA, AANZFTA**: **một mức duy nhất** áp dụng cho cả kỳ 2022–2027.

## 3. Quy tắc bắt buộc: thuế FTA là thuế CÓ ĐIỀU KIỆN

**Mọi mức thuế FTA trong bộ dữ liệu này chỉ áp dụng khi có C/O hợp lệ đúng form.**

| FTA | Form C/O bắt buộc |
|---|---|
| ATIGA | form **D** |
| ACFTA | form **E** |
| AANZFTA | form **AANZ** |
| EVFTA | **EUR.1** hoặc tự chứng nhận **REX** |

Không có C/O, hoặc C/O bị bác → **áp MFN**, không phải 0%. Khi trả lời câu hỏi về thuế,
luôn phải phát biểu dạng *"X% nếu có C/O form Y, ngược lại MFN Z%"*, không bao giờ nói trống "0%".

Ngoài C/O còn phải đáp ứng **quy tắc xuất xứ** của FTA đó (tiêu chí CTC/RVC/De Minimis) —
xem `1-van-ban-phap-luat/05-nd-31-2018-xuat-xu-hang-hoa.md` và `06-tt-33-2023-xac-dinh-xuat-xu.md`.

## 4. Những gì bộ dữ liệu này KHÔNG có

Đây là phần quan trọng nhất. Tổng thuế phải nộp **không chỉ là thuế nhập khẩu**.

- ❌ **Thuế GTGT (VAT)** — không có trong dữ liệu này.
- ❌ **Thuế tiêu thụ đặc biệt (TTĐB)** — không có.
- ❌ **Thuế bảo vệ môi trường** — không có.
- ❌ **Thuế chống bán phá giá / chống trợ cấp / tự vệ** — không có. Các mặt hàng như thép, nhôm,
  đường, bột ngọt, sorbitol… có thể chịu thuế CBPG **cao hơn nhiều lần** thuế nhập khẩu.
- ❌ **RCEP** — cố ý chưa nạp (cấu trúc cột thuế theo từng nước thành viên, khác hẳn 4 FTA trên).
- ❌ **CPTPP, UKVFTA, VJEPA, VKFTA…** và các FTA khác — chưa nạp.
- ❌ **Phụ lục III NĐ 26/2023 (xe ô tô đã qua sử dụng)** — không nạp được vì tính theo nhóm
  87.02/87.03 + dung tích xi-lanh + công thức USD tuyệt đối, không phải mã HS 8 số.
- ❌ **Danh mục quản lý chuyên ngành**, giấy phép, kiểm tra chuyên ngành — không có.

## 5. Cảnh báo về độ cũ của dữ liệu

Bộ dữ liệu được trích ngày **2026-09-09** từ kho seed của dự án, phản ánh trạng thái nạp lúc đó.

1. **NĐ 199/2025/NĐ-CP** (sửa Biểu XK + NK ưu đãi của NĐ 26/2023, hiệu lực 2025-07-08) —
   **CHƯA được nạp vào dữ liệu này.**
2. **NĐ 201/2026/NĐ-CP** (sửa thuế **xuất khẩu**, hiệu lực 2026-01-01) —
   **CHƯA được nạp vào dữ liệu này.**
3. **NĐ 72/2026/NĐ-CP** đưa thuế nhập khẩu 5 mã xăng (`2710.12.21`, `.22`, `.24`, `.25`, `.80`)
   về 0% trong khoảng **2026-03-09 → 2026-04-30**, sau đó **hồi quy về mức cũ từ 2026-05-01**.
   Các file ở đây hiển thị mức **10%** — đúng với hiện tại, nhưng không thể hiện khoảng 0% đã qua.
4. **Vách đá 2027**: cột thuế FTA chỉ có đến năm **2027**. Mọi biểu FTA ở đây hết lộ trình
   sau 2027-12-31; danh mục AHTN cũng sẽ được thay thế.

→ **Với mọi tờ khai thực tế, phải đối chiếu lại văn bản hiện hành.** Con số ở đây là
manh mối để định hướng, không phải căn cứ pháp lý.

## 6. Cảnh báo quan trọng nhất: đừng để LLM đọc số thuế cho bạn

Chính dự án Customs Assistant đặt ra quy tắc số một:

> **Thuế suất phải được tra cứu theo khóa chính xác (mã HS + biểu + ngày), không bao giờ do LLM sinh ra.**
> Tìm kiếm ngữ nghĩa trên một bảng biểu thuế sẽ trả về hàng *trông giống nhất* — mà trong bảng
> biểu thuế thì hàng trông giống nhất thường là **hàng sai**.

NotebookLM là công cụ tìm kiếm ngữ nghĩa. Khi bạn hỏi "thuế nhập khẩu máy bơm nước bao nhiêu",
nó sẽ lấy về một dòng *na ná* và trả lời rất tự tin. Các mã HS liền kề nhau thường có mức
thuế khác hẳn nhau (0% và 20% cách nhau đúng một dòng).

**Dùng bộ dữ liệu này để:**
- ✅ Hiểu cấu trúc danh mục, tìm **ứng viên** mã HS cho một mặt hàng
- ✅ Đọc mô tả nhóm/phân nhóm, so sánh các mã gần nhau
- ✅ **Tra nguyên văn Chú giải Phần/Chương và GRI** để dựng lập luận phân loại có căn cứ
- ✅ Kiểm tra một FTA **có hay không có** loại trừ với mặt hàng nào đó
- ✅ Nắm lộ trình giảm thuế theo năm

**KHÔNG dùng để:**
- ❌ Chốt con số thuế đưa vào tờ khai
- ❌ Báo giá cho khách hàng
- ❌ Kết luận mã HS cuối cùng

Luôn **tự mở đúng dòng** trong file để mắt người đọc lại con số, hoặc tra bằng công cụ
tra cứu theo khóa chính xác.

## 7. Các file trong thư mục này

| File | Phạm vi |
|---|---|
| `01-chuong-01-den-20.md` … `08-chuong-93-den-97.md` | Danh mục HS chương 01–97 + MFN + 4 FTA |
| `09-cach-hoi-de-tra-cuu-ma-hs.md` | **Prompt mẫu** — copy-paste để hỏi cho đúng cách |
| `10-sau-quy-tac-tong-quat-GRI.md` | **6 quy tắc GRI nguyên văn** + Chú giải từng quy tắc |
| `11-chu-giai-phan.md` | **Chú giải Phần** — 9 Phần có chú giải |
| `12-` / `13-chu-giai-chuong-*.md` | **Chú giải Chương** 01–97 + Chú giải phân nhóm |
| `90-chuong-98-uu-dai-rieng.md` | Chương 98 — ưu đãi riêng của Việt Nam, có điều kiện |
| `91-bieu-thue-xuat-khau.md` | Thuế xuất khẩu (danh mục hạn chế) |

### Bốn file `09`–`13` mới là chỗ quyết định khi áp mã

Bảng biểu thuế cho bạn *con số*. Nhưng theo **Quy tắc 1 GRI**, cái quyết định **mã nào** lại là
*nội dung nhóm hàng* và **Chú giải Phần/Chương** — tên Phần/Chương *"chỉ nhằm mục đích dễ tra cứu"*
và **không có giá trị pháp lý**.

Nguồn: **Thông tư 31/2022/TT-BTC** (ban hành Danh mục AHTN 2022, hiệu lực 01/12/2022),
Công báo 523+524 … 557+558. Giữ song ngữ Việt–Anh để đối chiếu được bản dịch.

Lưu ý: **Chương 77 không tồn tại** trong Hệ thống hài hòa (được để trống dự phòng) — đây là
đặc điểm chuẩn của HS, không phải thiếu dữ liệu.
