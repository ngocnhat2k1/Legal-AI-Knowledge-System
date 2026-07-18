---
type: architecture-decision
status: approved
updated: 2026-07-18
supersedes:
  - 2026-07-17-web-app-not-zalo.md
related:
  - 2026-07-17-web-app-not-zalo.md
  - ../planning/00-bootstrap.md
---

# Bot Zalo tự lưu trữ, đóng gói trong app (bổ sung web app)

## Trạng thái

Đã phê duyệt — 2026-07-18, chủ dự án quyết định trực tiếp, **lật một phần** ADR
[Web app, không phải Zalo](2026-07-17-web-app-not-zalo.md).

## Bối cảnh

ADR trước bác Zalo cho v1 vì kinh tế nền tảng (OA gói Tăng trưởng 2.5tr/năm cho Open API), cửa sổ nhắn
tin, và vì chat là bề mặt tệ cho *bằng chứng kiểm toán được*. Những lập luận đó **vẫn đúng cho phần đó**.

Nhưng chủ dự án nêu một yêu cầu mới, và đó là quyết định của chủ dự án: **phải điều khiển/hỏi–đáp công cụ
qua Zalo** (giống cách họ điều khiển agent "openclaw" của mình qua Zalo). Kèm hai ràng buộc:

1. **Self-contained.** Không nối qua agent ngoài (openclaw) — điều đó làm app *rời rạc* và phụ thuộc hạ
   tầng riêng. Đổi server phải chỉ là `docker compose up` lại.
2. **Zalo là phần quan trọng nhất** với chủ dự án — "phải nhắn tin qua Zalo và nhận kết quả".

## Quyết định

**Giữ web app; THÊM một bot Zalo đóng gói bên trong stack.** Cả hai bổ sung nhau, không thay thế:

- **Web app** — bề mặt cho công việc bằng-chứng: bảng, nghị định điều chỉnh, as-of, điều kiện C/O, độ cũ,
  và **vòng xác nhận in-app** (đúng/sai/không chắc → `lookup_confirmation`). Đây vẫn là "sản phẩm".
- **Bot Zalo** — bề mặt cho tra cứu nhanh: nhắn "8481.80.99 TQ" → nhận thuế MFN + FTA có điều kiện + CBPG +
  cảnh báo độ cũ dưới dạng text. Một service `zalo-bot` trong `docker-compose.yml`, gọi API `/tariff` nội bộ.

**Đóng gói:** `db + migrate + seed + api(web) + zalo-bot` trong một compose. Đổi server = redeploy + quét
QR một lần. Không phụ thuộc openclaw.

## Đánh đổi đã chấp nhận (ghi rõ, không giấu)

"Tự build nhắn tin Zalo" mà không mua OA = **thư viện KHÔNG chính thức `zca-js`** (đăng nhập bằng một tài
khoản Zalo qua QR, giả lập Zalo Web). Đây chính là con đường ADR trước loại vì **vi phạm ToS Zalo (§4.7) và
rủi ro khóa tài khoản**. Chủ dự án chấp nhận rủi ro này với **biện pháp giảm thiểu bắt buộc**:

- **Dùng một tài khoản Zalo RIÊNG cho bot** (SIM phụ), **không bao giờ dùng Zalo cá nhân**. Bị khóa thì chỉ
  mất tài khoản bot dùng-một-việc, không mất tài sản dân sự (OTP ngân hàng, gia đình) — đúng mối lo cốt lõi
  mà ADR trước nêu.
- Session lưu ở volume (`/session`) → restart không cần quét lại QR.
- `ALLOWED_THREADS` giới hạn ai được hỏi bot (mặc định mở — nên đặt allowlist).

Nếu sau này cần độ bền/hợp pháp, đường nâng cấp là **OA chính thức + Open API** (gói Tăng trưởng) — kiến
trúc không đổi, chỉ thay lớp vận chuyển của service `zalo-bot`.

## Hệ quả

- Bot là **client thuần** của API tra cứu — không có logic thuế trong bot; mọi con số vẫn đi qua đường
  xác định (không LLM) của `/tariff`. Trung thực được giữ: text trả về luôn kèm nghị định + as-of + cảnh báo.
- Web + bot **chia sẻ cùng một cơ sở dữ liệu và cùng vòng xác nhận** — xác nhận từ web tích lũy chung.
- Portable: một image Docker, hai service (api, zalo-bot) khác command; state chỉ ở Postgres + volume session.

## Kiến thức liên quan

- [Web app, không phải Zalo](2026-07-17-web-app-not-zalo.md) — lập luận nền vẫn đúng cho phần "không mua OA";
  ADR này bổ sung kênh Zalo tự-host theo yêu cầu chủ dự án.
- [Không dùng LLM cho con số biểu thuế](2026-07-17-no-llm-on-tariff-numbers.md) — bot chỉ chuyển tiếp số từ API.
