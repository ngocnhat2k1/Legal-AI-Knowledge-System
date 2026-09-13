# Trợ lý Hải quan

Một công cụ nội bộ cho đội ngũ nhân viên khai báo hải quan của một công ty logistics Việt Nam.

Nó trả lời hai câu hỏi mà một người khai báo đặt ra mỗi ngày:

1. **Thuế của lô hàng này là bao nhiêu?** — được tra cứu theo khóa chính xác `(HS code, schedule, date)`, kèm
   nghị định điều chỉnh, ngày chụp ảnh dữ liệu (data snapshot date), và các điều kiện đi kèm.
2. **Hàng hóa này thuộc mã HS nào?** — được trả lời bằng **ba ứng viên và chú giải chương và
   phần nguyên văn hỗ trợ cho từng ứng viên**, để một con người quyết định. Không bao giờ là một mã trần trụi.

## Trạng thái

**Giai đoạn 0 — Nền móng.** Bộ vàng (golden set) đã có (TASK-001), và **khung sườn repo đã dựng** (TASK-006):
monorepo NestJS + PostgreSQL/pgvector + Docker, với một migration bật `pgvector` được áp dụng. Chưa có
logic biểu thuế — đó là TASK-007 trở đi. Xem **[`.agent/planning/02-progress.md`](.agent/planning/02-progress.md)**
để biết mọi thứ thực sự đang ở đâu.

## Chạy local

Yêu cầu duy nhất: **Docker + git**. Từ một bản clone sạch:

```bash
docker compose up --build
```

Thứ tự được đảm bảo: `db` (Postgres 17 + pgvector, khỏe) → `migrate` (áp dụng migration, chạy xong rồi thoát)
→ `api` (NestJS, boot). Kiểm tra:

```bash
curl http://localhost:3000/health
# {"status":"ok","db":"up","pgvector":"0.8.5"}
```

Postgres publish ra host cổng **5433** (tránh đụng Postgres sẵn có trên 5432). Phát triển ngoài Docker:
`corepack yarn install` rồi `corepack yarn start:dev` (đặt `DATABASE_URL`, xem [`.env.example`](.env.example)).
Toolchain: Node 22 LTS, Yarn 4 (Corepack), Drizzle (migration SQL), Jest. Chi tiết lựa chọn:
[ADR công cụ repo](.agent/architecture-decisions/2026-07-18-repo-tooling-drizzle-yarn.md).

## Triển khai máy chủ

Máy: Ubuntu 24.04, 4 core / 8 GB, Docker Engine. Thư mục deploy ví dụ `/opt/customs-assistant` trên `<host>`.
Máy chủ đang chạy là server dev dùng chung của MONA — vận hành hằng ngày: [runbook](.agent/docs/mona-dev-server-operations.md);
dựng lần đầu: [kế hoạch 06](.agent/planning/06-deploy-mona-dev-server.md). Địa chỉ và thông tin riêng của máy không nằm trong git (repo công khai).

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

**Thuế suất không bao giờ do một LLM tạo ra.** Chúng được tra cứu theo khóa chính xác trong SQL. Tìm kiếm
ngữ nghĩa trên một bảng biểu thuế trả về hàng trông giống nhất, và trong một bảng biểu thuế thì
hàng trông giống nhất thường là hàng sai — danh mục được xây dựng từ các dòng anh em gần như giống hệt
nhau, chỉ khác nhau một định tố (qualifier) và khác nhau hàng chục điểm phần trăm.

**Mã HS được gợi ý, không bao giờ được khẳng định.** Các benchmark độc lập đặt độ chính xác tự động của LLM ở mức
29–47% ở 10 chữ số so với mốc chuẩn 95% của con người. Cùng những mô hình đó đạt 93,9% khi chúng trả về ba
ứng viên kèm bằng chứng đã truy xuất và để một con người quyết định. Khoảng cách này là hợp đồng đầu ra, không phải năng lực
mô hình.

Cả hai tồn tại bởi vì kiểu thất bại ở đây là âm thầm. Một mã HS sai là một mã thật, được định dạng đúng
— không có ngoại lệ, không có lỗi phân tích cú pháp, không có cờ đỏ. Nó thông quan và nổi lên nhiều năm sau như một cuộc
kiểm tra sau thông quan với truy thu, phạt, và lãi tính theo ngày. Người khai báo gánh trách nhiệm pháp lý
đó, không phải công cụ.

Do đó: đây là một **công cụ trợ giúp nghiên cứu hiển thị nguồn của nó và từ chối khi dữ liệu của nó có thể đã
cũ**, không bao giờ là một cỗ máy trả lời phát biểu một mức thuế.

## Vì sao có quá nhiều tài liệu và quá ít mã

Luật hải quan Việt Nam biến động nhiều hơn cả phần mềm. Trong quá trình nghiên cứu, một nghị định được ký và
có hiệu lực pháp lý **cùng ngày**, được công bố dưới dạng máy đọc được **mười lăm ngày
sau đó**, và **hết hiệu lực năm mươi hai ngày sau nữa** với các mức thuế âm thầm trở về như cũ. Một nửa số luật được nêu
trong lộ trình dự án ban đầu đã chết — một luật đã bị thay thế mười bảy ngày trước đó.

Không điều nào trong số đó có thể suy ra từ mã, và không dữ liệu huấn luyện của mô hình nào có nó. Các
ghi chú trong [`.agent/concepts/`](.agent/concepts/) mang nó, với một ngày xác minh và nguồn trên mỗi
khẳng định thực tế, và một phần `Chưa xác minh / Không được dựa vào` rõ ràng trên mỗi ghi chú. Những phần đó
mang tính chịu lực (load-bearing) — đừng dọn dẹp chúng thành văn xuôi đầy tự tin.

## Bố cục kho mã (Repository Layout)

```
.agent/                    durable agent memory (the actual product of the work so far)
  index.md                 navigation map — start here
  project-context.md       what this is, who it serves, what is out of scope
  business-rules.md        12 safety rules, with evidence and consequences
  concepts/                domain knowledge: HS classification, tariffs, VN legal system,
                           data sources, legal RAG
  workflows/               the declarant's real daily loop
  architecture-decisions/  10 ADRs
  planning/                roadmap, task list, progress log
  docs/evaluation.md       the golden set and the ship gates
AGENTS.md, CLAUDE.md       thin bridges to .agent/AGENTS.md — keep them thin
apps/api/                  the NestJS application (monorepo workspace, one app)
  src/modules/             feature modules (health, tariff lookup)
db/                        schema, migrations, and the production seed (yarn db:seed)
  src/shared/adapters/     infrastructure adapters (database: Drizzle client)
db/                        Drizzle schema, SQL migrations, migrate runner
docker-compose.yml         db + migrate + api, one-command local bring-up
fixtures/golden-set/       the golden set from real declarations (TASK-001)
```

`.agent/` **phải nằm ở gốc kho mã (repository root).** Các file cầu nối (bridge files) mã hóa cứng đường dẫn đó; di chuyển nó
sẽ tách rời toàn bộ kho tri thức khỏi mọi tác nhân.

## Xuất xứ (Provenance)

Kho tri thức được xây dựng vào ngày 2026-07-17 từ mười hai tác nhân nghiên cứu đã truy xuất các nguồn trực tiếp,
bao gồm ba lượt xác minh đối kháng. Ở những nơi hai báo cáo mâu thuẫn với nhau, cả hai đều được
ghi lại và mâu thuẫn được đánh dấu là chưa giải quyết thay vì âm thầm dàn xếp.

Các ghi chú sau đó được kiểm toán đối chiếu với chính nguồn của chúng. Cuộc kiểm toán đã bắt được các tác nhân viết ghép một
URL thật vào một khẳng định không có nguồn, bịa ra một cụm từ xuất xứ, và khẳng định một sự hợp nhất nghị định
không xuất hiện trong báo cáo nào — đúng kiểu "rửa" sự bất định mà sản phẩm này tồn tại để ngăn chặn, được thực hiện bởi
chính bộ công cụ đã ghi chép nó. Tất cả đã được sửa. **Hãy kiểm toán lại mỗi khi kho tri thức được mở rộng
đáng kể:** văn xuôi trôi chảy che giấu sự thiếu vắng xuất xứ.

Bộ khung (scaffold) đến từ [APB](https://github.com/truongthuc/apb), được duy trì trong kho mã riêng của nó
và không được vendor hóa (vendored) tại đây.
