# Bộ đánh giá Giai đoạn 1 — neo vào Nghị định

Fixture có phiên bản cho các cổng kiểm soát tra cứu thuế của Giai đoạn 1. Đây là **phương án thay thế
khi chưa có golden set từ tờ khai thật** (TASK-001): thay vì neo ground truth vào các tờ khai đã được
Hải quan chấp nhận, bộ này neo vào **văn bản Nghị định trên Công báo** — vốn dù sao cũng là thẩm quyền
pháp lý cho tra cứu thuế tất định.

Đọc `../.agent/docs/evaluation.md` để hiểu hợp đồng đánh giá đầy đủ. Các ca ở đây hiện thực hóa các cổng
§3.2 (cạm bẫy phụ lục), §5.2 (hoàn nguyên), và §5.3 (độ trễ công báo).

## File

- `phase1-decree-anchored.jsonl` — một ca mỗi dòng (JSON Lines).

## Bộ này chứng minh và KHÔNG chứng minh điều gì

**Chứng minh:** parser/tra cứu trả về đúng con số mà **Nghị định** quy định — cạm bẫy phụ lục, hoàn
nguyên theo thời gian, thuế tuyệt đối, loại trừ `*`, điều kiện C/O, và cảnh báo độ cũ.

**KHÔNG chứng minh:** sự khớp với thực tiễn khai báo của công ty. Đó là mục tiêu thương mại mà **chỉ
golden set từ tờ khai thật (TASK-001)** và đối chiếu ECUS (TASK-012) đo được. Bộ này không thay thế
được chúng — nó bổ sung, và cho phép Giai đoạn 1 tiến hành khi chưa có tờ khai.

**Rủi ro đã biết:** một bộ đánh giá không đến từ tờ khai đã được chấp nhận có nguy cơ đo "sự đồng thuận
với chính suy luận của ta". Giảm thiểu ở đây: **mọi ground truth đều neo vào văn bản luật sơ cấp**
(trường `provenance`), không phải phỏng đoán của ta; và mọi ca chưa có số cụ thể đều đánh dấu
`structural-invariant` thay vì bịa một con số.

## Lược đồ trường (khóa bằng tiếng Anh — quy tắc mã nguồn)

| Trường | Ý nghĩa |
|--------|---------|
| `id` | Định danh ca, ổn định giữa các phiên bản |
| `type` | `annex-trap` / `reversion` / `invariant` / `structural` |
| `goods` | Mô tả hàng hóa (có thể `null` với ca bất biến) |
| `hs` | Mã HS 8 chữ số (có thể `null`) |
| `direction` | `import` / `export` |
| `schedule` | Biểu thuế: `NK_uu_dai` (MFN nhập), `XK` (xuất), hoặc mã FTA |
| `as_of_date` | Ngày tra cứu (YYYY-MM-DD) — quan trọng cho ca theo thời gian |
| `expected_rate` | Kết quả kỳ vọng (`null` với ca cấu trúc) |
| `unit` | `percent` / `usd-absolute` / `exclusion` / `conditional` / `trq-dependent` / `warning` |
| `source_annex` | Phụ lục nguồn (bẫy phụ lục phụ thuộc trường này) |
| `decree` | Nghị định điều chỉnh |
| `evidence` | Bằng chứng khiến đáp án đúng |
| `assertion` | Bất biến cần khẳng định (với ca cấu trúc) |
| `confidence` | `verified-from-decree` / `structural-invariant` |
| `provenance` | Nguồn: mục evaluation.md và/hoặc URL Công báo |
| `notes` | Bối cảnh |

## Nâng cấp lên golden set thật

Khi có ≥30 tờ khai thật (TASK-001), tạo file `golden-set.jsonl` riêng cùng thư mục với thêm các trường
tờ khai (`declared_by_confidence`: `tự tin`/`không chắc chắn`). Bộ neo-Nghị-định này **vẫn giữ nguyên** —
nó là hồi quy cấu trúc, không bao giờ xóa (theo evaluation.md §3.2).

## Mở rộng khi nạp biểu thuế (TASK-008)

Sau khi nạp Nghị định 26/2023 từ Công báo, bổ sung ~20 ca **lấy mẫu ngẫu nhiên** (không chọn tay — xem
evaluation.md §3.1) và điền số cụ thể cho các ca `structural` hiện đang để `null` (thuế tuyệt đối USD ở
Phụ lục III, giá trị TRQ Phụ lục IV).
