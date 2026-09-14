# Quy tắc Agent

Nguồn chân lý dùng chung cho mọi AI agent làm việc trong **Customs Assistant**. `AGENTS.md` và `CLAUDE.md` ở gốc
repo chỉ trỏ tới file này — giữ chúng mỏng. `.agent/` phải nằm ở gốc repo: di chuyển nó thì các file cầu nối trỏ
vào khoảng không mà không báo lỗi (đã xảy ra ngày 2026-07-17).

## Giao tiếp và ngôn ngữ

- Trao đổi với chủ dự án bằng tiếng Việt; tài liệu dự án bằng tiếng Việt.
- Mã nguồn, chú thích trong mã, định danh, tên file, tên API, thông điệp commit bằng tiếng Anh.

## Bắt đầu một phiên

1. Đọc [`planning/02-progress.md`](planning/02-progress.md) — giai đoạn hiện tại, việc tiếp theo, việc bị chặn.
2. Theo [`index.md`](index.md) tới ghi chú cần cho việc đang làm.
3. Trước khi đụng đầu ra biểu thuế hoặc mã HS: đọc [`business-rules.md`](business-rules.md).

## Cách làm việc

- Việc lớn, mơ hồ hoặc rủi ro (kiến trúc, dữ liệu, quy tắc nghiệp vụ): lập kế hoạch, cho chủ dự án duyệt, rồi mới
  làm. Việc nhỏ đã rõ: làm luôn.
- Nêu rõ giả định. Khi một câu hỏi mở chặn việc triển khai an toàn thì hỏi chủ dự án, đừng đoán.
- Trước khi thêm helper, abstraction hay module dùng chung, tìm thứ tương đương trong repo. Code dùng chung chỉ
  khi ít nhất hai module cần. Không tạo `utils`, `helpers`, `common`, `misc`.
- Chỉ commit khi được yêu cầu.

## Cuối phiên, trước commit cuối

1. Cập nhật **Tiếp tục từ đây** và bảng trạng thái trong `02-progress.md`.
2. Thêm một mục nhật ký ở đầu phần nhật ký: điều gì đổi, học được gì, ngõ cụt nào. Giữ khoảng 5 phiên gần nhất;
   mục cũ hơn đã có trong git.
3. Tri thức sống lâu hơn phiên thì chuyển ra đúng chỗ (bảng dưới), không chôn trong nhật ký.

Đây không phải thủ tục: dự án này hỏng âm thầm và muộn, nên agent sau phát hiện lại một cái bẫy đã biết thường
phát hiện nó *sai* một cách tự tin.

## Tri thức đặt ở đâu

| Loại | Nơi |
|---|---|
| Sản phẩm là gì, phục vụ ai, ranh giới | `project-context.md` |
| Quy tắc nghiệp vụ, tuân thủ, an toàn | `business-rules.md` |
| Kiến thức lĩnh vực (HS, biểu thuế, văn bản pháp luật, nguồn dữ liệu) | `concepts/` |
| Quyết định kỹ thuật và đánh đổi | một ADR mỗi quyết định trong `architecture-decisions/`, tên `YYYY-MM-DD-<tiêu-đề-ngắn>.md`, theo [mẫu](architecture-decisions/template.md); không viết lại ADR cũ — thêm ADR mới thay thế nó |
| Thiết kế, hợp đồng API, runbook | `docs/` |
| Kế hoạch đang chạy | `planning/`; kế hoạch xong thì xoá (git giữ lịch sử) và ghi kết quả vào `02-progress.md` |
| Phiếu duyệt, xác minh của chủ dự án | `review-history/YYYY-MM-DD-<chủ-đề>.md` |
| Quy ước đặt tên | `naming-conventions.md` |

Thêm, đổi tên hay xoá một ghi chú quan trọng thì cập nhật `index.md`. Dùng liên kết Markdown tương đối; không lưu
tri thức bắt buộc trong cú pháp riêng của Obsidian.

## Tài liệu là sản phẩm sống

Khi code, API, kiến trúc, thiết lập hay logic nghiệp vụ đổi, cập nhật tài liệu liên quan trong cùng thay đổi. Cấu
trúc code: [`docs/code-organization.md`](docs/code-organization.md).
