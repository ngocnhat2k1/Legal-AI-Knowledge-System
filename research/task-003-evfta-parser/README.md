# TASK-003 — Chứng minh parser nhận-biết-bảng trên dòng EVFTA

**Trạng thái: XONG (2026-07-18). Lỗ hổng đã bịt. Giai đoạn 1 có thể gồm EVFTA + RCEP, không chỉ MFN.**

## Câu hỏi

Research trước báo: dòng EVFTA (ND 116/2022, Phụ lục II) khi trích bằng `textutil` ra
`2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9` — sáu thuế suất hằng năm
(`29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9`) **dính liền không dấu phân cách**, trong locale
dấu phẩy thập phân → *không khôi phục được nếu không có heuristic*. Họ **suy luận** (không chứng
minh) rằng một parser nhận-biết-bảng (LibreOffice → docx → `w:tbl/w:tr/w:tc`) sẽ khắc phục.

## Phát hiện — research bị lừa

**Chuỗi đó KHÔNG dính.** Sáu thuế suất được ngăn bởi **`\x07` (BEL) — dấu ô của Word**, một ký tự
điều khiển **không hiển thị**. `29\x0725,4\x0721,8...` khi in ra (bỏ `\x07`) trông thành
`2925,421,818,...`. Research chỉ đơn giản **không thấy delimiter**.

`textutil -convert txt` (macOS, có sẵn) **giữ nguyên ranh giới ô**. Tách theo dấu ô thật →
khôi phục đủ 6 ô. **Không cần LibreOffice.** Và đây **không** phải "heuristic đoán chỗ cắt số"
(thứ task cấm) — mà là đọc đúng delimiter công cụ phát ra.

Delimiter khác nhau theo văn bản:
- **EVFTA (ND 116/2022):** ô ngăn bởi `\x07`.
- **RCEP (ND 129/2022):** mỗi ô một dòng (`\n`).

Parser thống nhất tách theo **cả hai** (`[\x07\n]`).

## Kết quả nghiệm thu (đã xác minh 2026-07-18)

| Văn bản | Dòng test | Kết quả | Nhất quán toàn phần |
|---|---|---|---|
| EVFTA ND 116/2022 (phần công báo 397+398) | `2101.11.11` | `['29','25,4','21,8','18,1','14,5','10,9']` — **6 ô** ✓ | **773/773 dòng HS = 6 cột** |
| RCEP ND 129/2022 (phần công báo 115+116) | `0101.21.00` | `['0','0','0','0','0','0']` — **6 ô** ✓ (không hồi quy) | 1309/1324 = 6 cột; 15 dòng 0 cột; **9 dòng có `*`** (loại trừ) |

Cùng một parser ([parse_tariff_doc.py](parse_tariff_doc.py)) chạy cho cả hai — thỏa tiêu chí
"không hồi quy trên trường hợp RCEP vốn đã hoạt động".

## Cảnh báo cho bộ nạp production (TASK-008)

- `\n` là delimiter **yếu hơn** `\x07` (văn xuôi cũng có xuống dòng). **Không tin mù.** Bộ nạp phải
  **kiểm tra bề rộng dòng** (số cột thuế = 6) và **gắn cờ** các ngoại lệ thay vì âm thầm chấp nhận.
  Phân bố cột-thu/dòng ở trên chính là bước kiểm tra đó — 15 dòng 0-cột và 9 dòng `*` của RCEP
  **lộ ra**, không bị nuốt.
- `*` = **loại trừ**, không phải 0% (khớp cảnh báo research). Bộ nạp phải giữ `*` là "excluded".
- LibreOffice → `w:tbl` là phương án chuẩn nặng hơn; **không cần** ở đây vì `textutil` đã đủ, nhưng
  giữ làm dự phòng nếu gặp văn bản mà `textutil` xử lý kém.

## Tái hiện

1. Lấy trang văn bản Công báo (server-render, `Allow: /`, không JS):
   - EVFTA: `https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-116-2022-nd-cp-38821.htm`
   - RCEP: `https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-129-2022-nd-cp-38603/43198.htm`
2. Trích các link `.doc` (`g7.cdnchinhphu.vn/api/download/stream?...&file_name=..._NĐ-CP.doc`, có token, giải HTML-entity), tải phần chứa mã HS cần (EVFTA `2101.11.11` ở phần 397+398; RCEP `0101.21.00` ở phần 115+116).
3. `python3 parse_tariff_doc.py <file.doc>` — in phân bố cột-thuế/dòng.

Cần: macOS `textutil` (có sẵn). Không cần LibreOffice, không cần `python-docx`.

## Liên quan

- [Nguồn dữ liệu](../../.agent/concepts/data-sources.md) — mục cảnh báo parser (nay đã giải quyết).
- [Hệ thống biểu thuế](../../.agent/concepts/tariff-system.md) — cấu trúc phụ lục, `*` loại trừ.
- [Danh sách công việc — TASK-003](../../.agent/planning/01-task-list.md), TASK-008 (bộ nạp).
