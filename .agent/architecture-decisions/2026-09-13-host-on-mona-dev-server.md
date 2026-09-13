---
type: architecture-decision
status: accepted
updated: 2026-09-13
related:
  - ../planning/06-deploy-mona-dev-server.md
  - ../docs/mona-dev-server-operations.md
  - ../business-rules.md
  - 2026-07-18-self-hosted-zalo-bot.md
  - 2026-07-18-repo-tooling-drizzle-yarn.md
  - 2026-09-13-evidence-sections-and-long-form-answers.md
---

# Quyết định Kiến trúc: Chạy stack trên server dev dùng chung của MONA

Ngày: 2026-09-13

Trạng thái: Accepted — 2026-09-13, chủ dự án yêu cầu trực tiếp. **Thay thế một phần**: giả định "thuê
VPS mới" trong phần bối cảnh của [ADR bảng bằng chứng chung](2026-09-13-evidence-sections-and-long-form-answers.md)
và dòng "Nơi chạy: VPS 4 core / 8 GB" của [spec bot ngang notebook](../docs/bot-answer-parity-design.md).
Phần còn lại của ADR và spec đó giữ nguyên.

## Bối cảnh

**Máy chủ cũ mất cùng dữ liệu.** VPS Contabo (Docker, Caddy `basic_auth` đứng trước
`bieuthue.ngocnhat.info`) ngừng hoạt động ngày 2026-09-10. Ngày 2026-09-13 chủ dự án xác nhận Contabo hết
dịch vụ và VPS đã bị xoá. Mất vĩnh viễn:

- `lookup_confirmation`: phán quyết của chuyên viên và bộ nhớ áp mã HS. Không có bản sao lưu nào, phải học
  lại từ đầu.
- Session Zalo của bot và danh sách `ALLOWED_THREADS`.
- `.env` cũ, gồm token Claude.
- Danh mục Công báo `gazette_document` (khoảng 15.500 văn bản). Tái tạo được bằng crawl lại (lần 2026-09-13 mất
  khoảng 51 phút, được 24.581 văn bản).

Biểu thuế, kho pháp lý và schema seed lại được từ git, đúng như [ADR bot Zalo tự host](2026-07-18-self-hosted-zalo-bot.md)
hứa: "đổi server = redeploy". Lần mất này cho thấy hứa hẹn đó chỉ đúng với dữ liệu nằm trong git.

**Yêu cầu của chủ dự án.** Sáng 2026-09-13, spec bot ngang notebook vẫn giả định thuê VPS mới. Cũng trong ngày
đó, chủ dự án yêu cầu triển khai lên server dev dùng chung của MONA, với điều kiện: "gọn, không ảnh hưởng dự án
khác, gỡ nhanh được". Tài liệu dự án không ghi lý do chọn server này thay cho một VPS thuê mới.

**Ràng buộc của một máy dùng chung** (khảo sát 2026-09-13; giá trị thật chỉ nằm trong `.agent/local/mona-dev-server.md`):

- Nhiều team khác chạy dự án trên cùng máy. Không được restart hay đổi cấu hình các dịch vụ dùng chung trên host
  (CSDL, công cụ tìm kiếm, php-fpm, nginx) khi chưa có quản trị MONA đồng ý. Với nginx chỉ được `-t` rồi `-s reload`.
- Không có swap, RAM trống khoảng 4,9 GB lúc khảo sát. Nếu một container ăn hết RAM, kernel có thể giết tiến
  trình của team khác.
- Cổng 3000 và 5433 đã bị dự án khác chiếm.
- `docker-compose` là bản standalone v2.15.1. Bản này không có `!reset`: `ports` trong file override bị cộng dồn
  chứ không thay thế, nên không đổi cổng host bằng override được. Không có plugin buildx, nhưng BuildKit vẫn build được.
- Không dùng registry, nên image phải build ngay trên server.
- Repo GitHub công khai, trong khi tài liệu triển khai mô tả một máy chủ của công ty đang chạy dự án của khách
  hàng khác.

## Quyết định

1. **Chỉ một compose project `customs-assistant`,** cố định bằng `COMPOSE_PROJECT_NAME` trong `.env`, đặt ở
   `/opt/docker-projects/customs-assistant`. Container, network, volume và image đều mang tiền tố
   `customs-assistant-*` (thêm `legal-embedder:local`), nên nhận diện và gỡ được theo tên.
2. **Cấu hình riêng của server nằm ngoài git:** `.env` (`chmod 600`) và `docker-compose.override.yml`. Code đưa lên
   bằng `git archive HEAD | ssh <MONA_DEV_HOST> 'tar xf - -C /opt/docker-projects/customs-assistant'`, không đè
   hai file này.
3. **Cổng host được tham số hoá ngay trong `docker-compose.yml`:** `API_HOST_PORT`, `DB_HOST_PORT`,
   `EMBEDDER_HOST_PORT`, mặc định 3000/5433/8000 nên chạy local không đổi. Trên server là `127.0.0.1:3060` (API),
   `127.0.0.1:5435` (DB), `127.0.0.1:8060` (embedder). Không cổng nào nghe ngoài localhost.
4. **Giới hạn RAM cứng cho từng container thay vì đụng vào host:** embedder `mem_limit: 3500m` với
   `EMBED_BATCH=8` và `cpus: 6`; seed `2g`; các service còn lại `1g`. Mọi service ghi log `json-file` 10m × 3.
   Nếu có OOM thì nó xảy ra bên trong container của dự án này. Không hạ bộ nhớ của dịch vụ dùng chung, không thêm swap.
5. **Claude Code CLI nằm trong image** (`apps/api/Dockerfile`). Không cài gì lên host, không mount binary từ host.
6. **TLS và basic auth đi qua nginx sẵn có của host, không cài Caddy.** Dự án có vhost riêng
   (`/opt/nginx/conf/vhosts/bieuthue.ngocnhat.info.conf`), htpasswd riêng
   (`/opt/nginx/conf/htpasswd-customs-assistant`) và cert Let's Encrypt riêng cho domain của mình. Basic auth là
   bắt buộc: API không có xác thực, mà web UI ghi vào `lookup_confirmation` qua `POST /tariff/confirm`. Phần này
   chờ chủ dự án chốt domain (khuyến nghị dùng lại `bieuthue.ngocnhat.info`) và mật khẩu. Bot Zalo không cần domain.
7. **Sao lưu đêm chỉ dữ liệu không tái tạo được.** `db/backup.sh` sẽ chạy qua `/etc/cron.d/customs-backup` lúc
   02:00 (chưa bật, chờ Task 10): dump `lookup_confirmation` và trạng thái xác minh của `legal_document`, rồi đẩy lên Google Drive
   (`gdrive:Legal-AI-Backup/`), tức là ra ngoài server. **Không bao giờ sao lưu dữ liệu chat** (`conversation`,
   `conversation_turn`, `decision_log`), theo [R14](../business-rules.md). Phần còn lại của DB cố ý không sao lưu:
   seed lại từ git và crawl lại Công báo.
8. **Gỡ bằng một lệnh.** `teardown.sh` nằm trong thư mục stack trên server (ngoài git) và bắt gõ tên project để
   xác nhận. Script chạy `down -v --remove-orphans`, xoá container crawl `customs-assistant-gazette-full`, rồi xoá
   image, cron và log sao lưu, vhost/htpasswd, cert, thư mục stack và build cache. Không có gì cần hoàn tác ở dịch vụ
   dùng chung; rclone (nếu đã cài để sao lưu) thì gỡ tay theo mục 8 của runbook.
9. **Chính sách cho repo công khai.** Tài liệu trong git dùng chỗ trống `<MONA_DEV_HOST>` cho đích ssh và chỉ mô
   tả stack của dự án này. Địa chỉ, tài khoản và thông tin về host dùng chung nằm trong `.agent/local/` (có trong
   gitignore, chỉ tồn tại trên máy của chủ dự án).

## Các phương án đã cân nhắc

- **Lấy thêm RAM bằng cách hạ bộ nhớ một dịch vụ dùng chung, hoặc thêm swap:** được thêm vài GB, nhưng phải đụng
  vào host dùng chung, cần quản trị MONA đồng ý, và gỡ dự án không còn sạch vì phải hoàn tác cấu hình host. Bác
  (chốt 2026-09-13). Số đo lúc seed cho thấy không cần: embedder đạt đỉnh 1,19 GiB.
- **Cài CLI lên host rồi mount vào container:** cách làm trong bản nháp đầu của kế hoạch 06 (Task 2). Bác vì để
  lại dấu vết trên host, bản copy không tự cập nhật, và không dựng lại được chỉ từ git. CLI trong image thì đi theo commit.
- **Thuê VPS mới:** đây là giả định của spec bot ngang notebook và ADR bảng bằng chứng, viết cùng ngày. Máy riêng
  không có các ràng buộc dùng chung ở trên. Chủ dự án yêu cầu dùng server MONA, và không có ghi chép so sánh hai
  phương án. Đây vẫn là đường lui: ngoài Docker, nginx và cron, stack không phụ thuộc gì vào host.
- **Chuyển repo sang private để tài liệu ghi thẳng địa chỉ server:** đơn giản nhất cho tài liệu. Chủ dự án chọn
  giữ repo công khai và làm sạch trước khi push.
- **Dùng lại Caddy như trên Contabo:** bác. Host đã có nginx phục vụ cổng 80/443 cho các site khác; thêm Caddy thì
  hoặc tranh cổng, hoặc thành hai tầng proxy.

## Hệ quả

**Được (số đo 2026-09-13):**

- Build trên server mất khoảng 5 phút: `legal-embedder:local` 6 GB, `customs-assistant:local` 823 MB,
  `customs-assistant-ingest:local` 206 MB.
- Seed biểu thuế: 172.962 dòng trong 30 giây. Seed pháp lý: 15 văn bản / 6.637 điều khoản / 2.806 chunk, không
  chunk nào thiếu vector, mất khoảng 18 phút. Embedder đạt đỉnh 1,19 GiB trên giới hạn 3,4 GiB, không OOM, không restart.
- Khi chạy ổn định, trước khi có token và bot, cả stack dùng khoảng 1,5 GiB: embedder 1,13 GiB, db 199 MiB, api
  41 MiB, ingest 32 MiB, crawl Công báo khoảng 100 MiB. RAM trống của host còn khoảng 3,8 GB. Sau khi có token và bot
  (11:44 UTC, crawl đã thoát): embedder khoảng 1,3 GiB, api 215 MiB, db 191 MiB, zalo-bot 58 MiB, ingest 31 MiB.
- Crawl lại `gazette_document` chạy 10:43 → 11:34 UTC (khoảng 51 phút), được 24.581 văn bản.
- Không ảnh hưởng dự án khác: các site trên host giữ nguyên mã HTTP so với file baseline mã HTTP các site khác
  (ngoài git); container của dự án khác vẫn chạy, không cái nào restart; không có sự kiện OOM của kernel.
- Chủ dự án điền `CLAUDE_CODE_OAUTH_TOKEN` vào `.env` lúc khoảng 11:23 UTC. Sau khi recreate `api`, `/health` trả
  `{"status":"ok","db":"up","pgvector":"0.8.6","llm":"up"}`. Lưu ý: sửa `.env` không tác động tới container đang
  chạy, phải `docker-compose up -d --no-deps api` (và `zalo-bot`).

**Chi phí và rủi ro:**

- Đây là server dev, không có SLA, và dự án này không quản trị máy. Người dùng thật của bot đang
  dựa vào hạ tầng không được cam kết cho việc đó. Kế hoạch 06 (Q6) chỉ ghi yêu cầu của chủ dự án, chưa ghi ý kiến
  của quản trị MONA.
- Dư địa RAM là của chung. Giới hạn cứng ngăn dự án này làm hại dự án khác, nhưng không ngăn chiều ngược lại: một
  dự án khác ăn hết RAM vẫn có thể làm stack này chậm đi hoặc bị kernel giết.
- Việc nạp tầng bằng chứng (mục dài) của kế hoạch 05 chưa được đo trên server này. Nếu vượt `mem_limit` 3500m của
  embedder, chỉnh `EMBED_BATCH` hoặc `EMBED_MAX_TOKENS` trước, không nới bằng cách đụng vào host.
- Server đang chạy **kho pháp lý cũ đã commit** (15 văn bản / 6.637 điều khoản / 2.806 chunk) cho tới khi chủ dự án
  quyết từng văn bản ở kế hoạch 05. Bản sinh lại đã sửa lỗi parser chưa được đưa lên.
- `lookup_confirmation` bắt đầu rỗng. Sao lưu chưa chạy cho tới khi có `rclone.conf` (Task 10), nên trong khoảng
  đó các xác nhận mới vẫn chưa có bản sao ngoài server.
- Lấy `ALLOWED_THREADS` cần mở một cửa sổ ngắn. Bot bỏ qua im lặng, không ghi log, mọi tin từ thread ngoài danh sách
  ([`apps/zalo-bot/index.mjs`](../../apps/zalo-bot/index.mjs)), và trong nhóm chỉ trả lời khi được @tag. Vì vậy phải
  để trống `ALLOWED_THREADS`, chủ dự án @tag bot một lần trong nhóm, đọc `thread_id` từ bảng `conversation`, ghi
  vào `.env`, rồi recreate `zalo-bot`. Trong cửa sổ đó, ai nhắn riêng cho tài khoản bot, và bất kỳ nhóm nào có bot
  mà @tag bot, cũng được trả lời (lần 2026-09-13 cửa sổ mở khoảng 3 phút). Mỗi tài khoản Zalo chỉ được chạy một bot
  tại một thời điểm.
- Vì repo công khai, thông tin host chỉ nằm trong `.agent/local/` trên máy của chủ dự án. Mất máy đó là mất ghi chú
  về host, và agent làm việc từ bản clone GitHub sẽ không có địa chỉ server.

**Việc theo dõi (tính đến 2026-09-13):**

- Task 9, bot Zalo: **đang làm**. Đăng nhập QR xong khoảng 11:33 UTC, `ALLOWED_THREADS` đặt khoảng 11:36 UTC (cửa
  sổ mở khoảng 3 phút), bot đã restart bằng session lưu trong volume `customs-assistant_zalo_session` (`mem_limit`
  1g). Kiểm chứng đầu-cuối chưa có kết quả.
- Dọn container crawl đã thoát: `docker rm customs-assistant-gazette-full`.
- Còn chờ chủ dự án: Task 8 (domain và mật khẩu basic auth), Task 10 (`rclone.conf`), và quyết định corpus theo
  từng văn bản của kế hoạch 05.
- Xuất `lookup_confirmation` ra dạng commit được, rút kinh nghiệm từ lần mất VPS. Việc này nằm ngoài phạm vi kế
  hoạch 06 và nên thành một task riêng.

## Links

- Planning: [Kế hoạch 06: triển khai lên server MONA dev](../planning/06-deploy-mona-dev-server.md)
- Vận hành: [Runbook server MONA dev](../docs/mona-dev-server-operations.md)
- README: [Triển khai máy chủ](../../README.md#triển-khai-máy-chủ)
- Quy tắc: [R14: lưu giữ nội dung chat](../business-rules.md)
- Thông tin thật về host (ngoài git, chỉ có trên máy của chủ dự án): `.agent/local/mona-dev-server.md`

## Kiến thức liên quan

- [ADR bot Zalo tự host](2026-07-18-self-hosted-zalo-bot.md): hứa hẹn "đổi server = redeploy + quét QR"; ADR này
  bổ sung phần dữ liệu không nằm trong git.
- [ADR công cụ repo](2026-07-18-repo-tooling-drizzle-yarn.md): compose, image dùng chung cho `migrate` và `api`,
  cổng DB mặc định 5433.
- [ADR bảng bằng chứng chung](2026-09-13-evidence-sections-and-long-form-answers.md): nơi ghi giả định "thuê VPS
  mới" mà ADR này thay thế.
- [ADR nguồn notebook là Google Docs](2026-09-10-notebook-sources-as-google-docs.md) và
  [ADR file nhận được là con trỏ](2026-09-10-received-file-is-a-pointer-not-a-source.md): viết trong giai đoạn
  không có máy chủ (VPS ngừng từ 2026-09-10).
- [Kho pháp luật tự mở rộng](../docs/legal-corpus-self-extension.md): `gazette_document` và worker ingest.
- [Nhật ký tiến độ](../planning/02-progress.md)
