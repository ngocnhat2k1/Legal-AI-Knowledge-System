# Trợ lý Hải quan

Một công cụ nội bộ cho đội ngũ nhân viên khai báo hải quan của một công ty logistics Việt Nam.

Nó trả lời hai câu hỏi mà một người khai báo đặt ra mỗi ngày:

1. **Thuế của lô hàng này là bao nhiêu?** — được tra cứu theo khóa chính xác `(HS code, schedule, date)`, kèm
   nghị định điều chỉnh, ngày chụp ảnh dữ liệu (data snapshot date), và các điều kiện đi kèm.
2. **Hàng hóa này thuộc mã HS nào?** — được trả lời bằng **ba ứng viên và chú giải chương và
   phần nguyên văn hỗ trợ cho từng ứng viên**, để một con người quyết định. Không bao giờ là một mã trần trụi.

## Trạng thái

Đang chạy nội bộ: tra biểu thuế (MFN + 4 FTA), RAG pháp luật có trích dẫn, bot Zalo. Đang ở đâu và việc tiếp theo:
[`.agent/planning/02-progress.md`](.agent/planning/02-progress.md).

## Chạy local

Yêu cầu duy nhất: **Docker + git**. Từ một bản clone sạch:

```bash
docker compose up --build
```

Thứ tự được đảm bảo: `db` (Postgres 17 + pgvector) → `migrate` → `seed` → `seed-legal` (cần `embedder`) → `api`
→ `zalo-bot`. Kiểm tra:

```bash
curl http://localhost:3000/health
# {"status":"ok","db":"up","pgvector":"0.8.5","llm":"no_token"}
```

Postgres publish ra host cổng **5433** (tránh đụng Postgres sẵn có trên 5432). Phát triển ngoài Docker:
`corepack yarn install` rồi `corepack yarn start:dev` (đặt `DATABASE_URL`, xem [`.env.example`](.env.example)).
Toolchain: Node 22 LTS, Yarn 4 (Corepack), Drizzle (migration SQL), Jest. Chi tiết lựa chọn:
[ADR công cụ repo](.agent/architecture-decisions/2026-07-18-repo-tooling-drizzle-yarn.md).

## Triển khai máy chủ

Máy: Ubuntu 24.04, 4 core / 8 GB, Docker Engine. Thư mục deploy ví dụ `/opt/customs-assistant` trên `<host>`.
Máy chủ đang chạy là server dev dùng chung của MONA — vận hành hằng ngày: [runbook](.agent/docs/mona-dev-server-operations.md);
việc còn dở: [kế hoạch 06](.agent/planning/06-deploy-mona-dev-server.md). Địa chỉ và thông tin riêng của máy không nằm trong git (repo công khai).

**Cảnh báo: API không có xác thực ở tầng ứng dụng** — web UI có thể POST `/tariff/confirm` (ghi vào sổ xác
minh mã HS). Bất kỳ máy chủ nào lộ ra ngoài internet phải đặt sau một reverse proxy có basic auth (máy chủ
cũ dùng Caddy `basic_auth`).

Một số máy chỉ có `docker-compose` độc lập (ví dụ v2.15.1), không có plugin `docker compose` — nếu vậy, gõ
`docker-compose` thay cho `docker compose` trong mọi lệnh dưới đây. Bản độc lập này không có `!reset`, nên
không thể gỡ cổng host qua file override; cổng host là biến môi trường ngay trong `docker-compose.yml`
(gồm `API_HOST_PORT`, `DB_HOST_PORT`, `EMBEDDER_HOST_PORT` — kiểm lại bằng `grep -n '\${' docker-compose.yml`). BuildKit build được
mà không cần plugin buildx.

1. **Đưa mã lên** (giữ nguyên `.env` trên máy chủ). `git archive HEAD` chỉ gói các file **đã commit** — commit trước, file chưa commit sẽ không lên máy chủ: `git archive HEAD | ssh <host> 'mkdir -p /opt/customs-assistant && cd /opt/customs-assistant && tar xf -'`
2. **`.env`** theo `.env.example`: `CLAUDE_CODE_OAUTH_TOKEN` (lấy bằng `claude setup-token` trên máy đã đăng nhập, không bao giờ in ra), `ALLOWED_THREADS`, `EMBED_MAX_TOKENS`.
3. **rclone** cho sao lưu: `scp ~/.config/rclone/rclone.conf <host>:~/.config/rclone/` — file này chứa token Drive, không commit.
4. **Dựng**: `docker compose build migrate embedder && docker compose up -d` — thứ tự tự đảm bảo: db → migrate → seed → seed-legal (embed qua sidecar, ~1 giờ lần đầu) → api → zalo-bot.
   Lần đầu, `up -d` đứng chờ `seed-legal` khoảng một giờ — chạy trong `tmux`, hoặc tách bước:
   `docker compose up -d db embedder`, rồi `docker compose run --rm --no-deps migrate`,
   `docker compose run --rm --no-deps seed`, `docker compose run --rm --no-deps seed-legal`, rồi
   `docker compose up -d --no-deps api zalo-bot`.
5. **Kiểm**: `curl -s localhost:3000/health` phải có `"db":"up"`, `"pgvector"`, `"llm":"up"`.
6. **Bot**: lần đầu quét QR tại `docker compose exec -T zalo-bot cat /session/qr.png > qr.png` (`-T` bắt
   buộc — thiếu nó, TTY sẽ làm hỏng file PNG nhị phân). Mở ảnh, quét bằng TÀI KHOẢN ZALO RIÊNG của bot.
   Session lưu trong volume `zalo_session`.
7. **Sao lưu đêm** — cron chạy bằng root, nên rclone đọc cấu hình của root. Chép cấu hình cho root:
   `sudo install -D -m 600 ~/.config/rclone/rclone.conf /root/.config/rclone/rclone.conf`, rồi cài file cron:
   `echo '0 2 * * * root cd /opt/customs-assistant && ./db/backup.sh >> /var/log/customs-backup.log 2>&1' | sudo tee /etc/cron.d/customs-backup`.
   Kiểm lần đầu bằng tay, với đúng người dùng mà cron dùng: `sudo -H ./db/backup.sh` rồi `sudo -H rclone ls gdrive:Legal-AI-Backup/`.
   Phục hồi: dựng tới hết `migrate` nhưng **chưa** bật `api`/`zalo-bot` (bước 4 kiểu tách bước, dừng trước lệnh
   `up -d … api zalo-bot`) để không có xác nhận mới ghi chen vào; giải nén archive rồi
   `docker compose exec -T db psql -v ON_ERROR_STOP=1 -U app -d customs_assistant < lookup_confirmation.sql`;
   xong mới bật `api`/`zalo-bot`. `legal_document_verification.csv` chỉ là bản tham chiếu để gán lại `verified_by` bằng tay.
8. **Đo embedder** (một lần, trước khi nạp tầng bằng chứng): xem `research/inbox-loader/measure_embed.py`. Script mặc định
   gọi cổng 8000; nếu đổi `EMBEDDER_HOST_PORT`, đặt `EMBEDDER_URL=http://127.0.0.1:<cổng>`.

Cập nhật mã: bước 1 lại, rồi `docker compose build migrate && docker compose run --rm --no-deps migrate && docker compose up -d --no-deps --force-recreate api zalo-bot` (không đụng db/embedder). Chỉ bot: `docker compose up -d --no-deps zalo-bot`.

## Bắt đầu tại đây

| Bạn là | Đọc |
|---|---|
| Một tác nhân AI | [`.agent/AGENTS.md`](.agent/AGENTS.md), rồi [`.agent/index.md`](.agent/index.md) |
| Đang tiếp tục công việc | [`.agent/planning/02-progress.md`](.agent/planning/02-progress.md) |
| Mới với dự án | [`.agent/project-context.md`](.agent/project-context.md) |
| Sắp đụng tới đầu ra biểu thuế hoặc HS | [`.agent/business-rules.md`](.agent/business-rules.md) — không phải tùy chọn |

## Hai quy tắc chi phối tất cả

**Thuế suất không bao giờ do LLM tạo ra** — tra theo khóa chính xác trong SQL; tìm kiếm ngữ nghĩa trên biểu thuế
trả về dòng *trông giống nhất*, mà thường là dòng sai. **Mã HS được gợi ý, không bao giờ khẳng định** — ba ứng viên
kèm bằng chứng nguyên văn, con người quyết định. Lý do và bằng chứng: [`.agent/business-rules.md`](.agent/business-rules.md).

Kiểu thất bại ở đây là âm thầm: một mã HS sai vẫn là mã thật, định dạng đúng, và nổi lên nhiều năm sau khi kiểm tra
sau thông quan. Vì vậy đây là công cụ trợ giúp nghiên cứu **hiển thị nguồn và từ chối khi dữ liệu có thể đã cũ**,
không phải cỗ máy phát biểu mức thuế.

## Bố cục repo

Xem [`.agent/docs/code-organization.md`](.agent/docs/code-organization.md). `.agent/` là bộ nhớ dự án cho agent và
**phải nằm ở gốc repo** — `AGENTS.md` / `CLAUDE.md` trỏ cứng vào đó.

Kiến thức lĩnh vực trong [`.agent/concepts/`](.agent/concepts/) ghi ngày xác minh và nguồn cho từng khẳng định, kèm
mục `Chưa xác minh / Không được dựa vào` — đừng dọn các mục đó thành văn xuôi tự tin.

Bộ khung tài liệu đến từ [APB](https://github.com/truongthuc/apb), không vendor vào đây.
