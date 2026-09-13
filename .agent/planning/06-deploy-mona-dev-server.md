---
type: planning
status: active
updated: 2026-09-13
related:
  - 02-progress.md
  - 05-bot-parity-tasks.md
  - ../architecture-decisions/2026-07-18-self-hosted-zalo-bot.md
  - ../docs/legal-corpus-self-extension.md
  - ../docs/zalo-bot-conversation-memory.md
  - ../docs/mona-dev-server-operations.md
  - ../architecture-decisions/2026-09-13-host-on-mona-dev-server.md
---

# Kế hoạch triển khai lại Customs Assistant lên server dev dùng chung của MONA

> **Giá trị thật** của `<MONA_DEV_HOST>` (đích ssh) và chi tiết các dịch vụ dùng chung trên host nằm trong `.agent/local/mona-dev-server.md` — file ngoài git, chỉ có trên máy của chủ dự án, vì repo này public. Lệnh vận hành sau khi deploy: [runbook](../docs/mona-dev-server-operations.md).

> **Cho agent thực thi:** dùng `superpowers:executing-plans`, chạy **tuần tự, dừng ở mỗi checkpoint** — server này dùng chung với nhiều dự án khác, không chạy song song bằng subagent. Các bước dùng checkbox (`- [ ]`).

**Mục tiêu:** Chạy lại toàn bộ stack (Postgres + pgvector, API + web UI, embedder BGE-M3, worker ingest, bot Zalo) trên server dev dùng chung của MONA (`<MONA_DEV_HOST>`), thay VPS Contabo đã chết ngày 2026-09-10.

**Kiến trúc:** Giữ nguyên `docker-compose.yml` của repo, chỉ tham số hoá 3 cổng host (API, DB, embedder). Mọi thứ riêng của server nằm **ngoài git** trong `/opt/docker-projects/customs-assistant/` (`.env`, `docker-compose.override.yml`). TLS và reverse proxy dùng nginx có sẵn của server (`/opt/nginx`), **không** cài Caddy. Bot Zalo không cần domain.

**Công nghệ:** Docker Engine · `docker-compose` v2.15.1 (bản standalone — gõ `docker-compose`, có gạch) · nginx `/opt/nginx` · Claude Code CLI (npm `@anthropic-ai/claude-code`, cài trong image) · Let's Encrypt (certbot, webroot).

**Trạng thái:** 🟢 **Đang thực thi từ 2026-09-13** — chủ dự án yêu cầu commit và deploy lên server này, "gọn, không ảnh hưởng dự án khác, gỡ nhanh được". Task 1–7 xong (crawl Công báo xong 11:34 UTC, còn xoá container); token đã gõ, `/health` báo `llm: up`. **Task 9 (bot Zalo) đang làm:** đã đăng nhập QR (~11:33 UTC) và đặt `ALLOWED_THREADS` (~11:36 UTC); còn kiểm thử đầu-cuối (Step 5). Còn chờ chủ dự án: Q2 (domain + mật khẩu basic auth → Task 8), `rclone.conf` (Task 10), và quyết định corpus theo từng văn bản của kế hoạch 05 (server đang chạy corpus cũ đã commit).

**Phụ thuộc:** chỉ chạy **sau khi [kế hoạch 05 Mảng 1](05-bot-parity-tasks.md) đã commit** — đã commit 2026-09-13 (`e332360`, `ad04ef2`, `41ac65a`). Corpus sinh lại vẫn ở `research/legal-loader/out/`, chưa gộp vào `db/seed/` (chờ quyết Task 5 Bước 6 của kế hoạch 05), nên server đang chạy corpus cũ; khi gộp thì nạp lại theo [runbook §5](../docs/mona-dev-server-operations.md#nạp-lại-kho-pháp-lý-force_reseed) (`FORCE_RESEED`). Mảng 1 sửa `docker-compose.yml` (khối embedder: `EMBED_MAX_TOKENS`, cổng `EMBEDDER_HOST_PORT`), `.env.example`, `apps/api/Dockerfile` (cài CLI vào image), `README.md` (mục triển khai), thêm `db/backup.sh`, và tạo lại corpus `db/seed/data/legal/*.ndjson` (đang tạm dừng chờ chủ dự án quyết; metadata số Công báo của 128/2020/NĐ-CP trong `documents.ndjson` cũng có thể được sửa). Deploy trước commit đó sẽ seed corpus cũ.

## Hiện trạng server (khảo sát 2026-09-13)

| Hạng mục | Giá trị | Hệ quả |
|---|---|---|
| Máy | CPU dư; RAM dùng chung với nhiều dự án, **không swap** | RAM là điểm nghẽn |
| RAM trống | Khoảng 4,9 GB lúc khảo sát | Ước tính ban đầu stack cần ~3,5–4 GB → rất sát, xem Q3 (đo thực tế lúc ổn định: ~1,5 GiB) |
| Ổ đĩa | Đủ chỗ cho image của dự án (~7 GB) | Đủ |
| Cổng đã bị chiếm | `127.0.0.1:3000` và `127.0.0.1:5433` đã bị dự án khác chiếm | Dùng **3060** (API) và **5435** (DB) |
| Compose | v2.15.1 standalone, **không hỗ trợ `!reset`** (đã thử) — `ports` trong override bị **cộng dồn** chứ không thay | Phải tham số hoá cổng ngay trong `docker-compose.yml` (Task 1) |
| BuildKit | **Build được** qua `docker-compose build` dù không có plugin buildx (đã thử `RUN --mount`) | Build ngay trên server, không cần registry |
| Mạng ra ngoài | api.anthropic.com, claude.ai, registry.yarnpkg.com, huggingface.co, download.pytorch.org, chat.zalo.me đều tới được | Đủ để build và chạy |
| Vị trí của dự án | Stack `/opt/docker-projects/customs-assistant/`, vhost `/opt/nginx/conf/vhosts/bieuthue.ngocnhat.info.conf` | Làm theo |
| Cert | Dự án dùng cert Let's Encrypt riêng | Xin cert riêng (Q2, Task 8) |

## Ràng buộc chung

- **Không ghi chi tiết server vào git** (IP, hostname, dự án khác trên host) — repo public. Dùng `<MONA_DEV_HOST>`; giá trị thật ở `.agent/local/mona-dev-server.md`.
- **Không restart hay đổi cấu hình dịch vụ dùng chung trên host** (CSDL, công cụ tìm kiếm, php-fpm, nginx) nếu chưa có quản trị MONA đồng ý. nginx chỉ `-t` rồi `-s reload`, không restart.
- **Chỉ public cổng 80/443.** API và DB luôn bind `127.0.0.1`.
- **Web phải có basic auth.** API không có xác thực, còn web UI gọi `POST /tariff/confirm` — thứ ghi vào `lookup_confirmation`. Contabo cũng đã chặn bằng `basic_auth` của Caddy.
- **Không in token ra terminal hay log.** `.env` đặt `chmod 600`. Đừng chạy `docker-compose config` mà không lọc (lệnh đó in cả token).
- **Mỗi tài khoản Zalo chỉ chạy một bot tại một thời điểm.**
- **Image api được build qua service `migrate`** (`docker-compose build migrate`); `build api` không làm gì cả.
- **Nhúng corpus pháp lý lúc seed trên server**, không làm trên laptop (BGE-M3 trên CPU làm sập VM Docker của laptop).
- **Prompt đưa vào `claude -p` qua stdin** — code đã làm vậy, không đổi.
- **Bản sao lưu không chứa dữ liệu chat** (`conversation`, `conversation_turn`, `decision_log`). Lý do: [R14](../business-rules.md) chỉ cho lưu chat tối đa 30 ngày, trong đó có tên và số điện thoại khách; [spec bot-parity §8](../docs/bot-answer-parity-design.md) cũng loại các bảng này khỏi sao lưu.

## Câu hỏi chặn — cần chủ dự án trả lời trước khi làm

| # | Câu hỏi | Khuyến nghị | Ảnh hưởng |
|---|---|---|---|
| ~~Q1~~ | ~~Còn cứu được dữ liệu Contabo không?~~ | **Đã trả lời 2026-09-13:** Contabo hết dịch vụ, VPS đã bị xoá — không cứu được | Seed mới (Task 6). Mất vĩnh viễn `lookup_confirmation`, session Zalo và `.env` cũ; crawl lại `gazette_document` (thực tế 2026-09-13: ~51 phút) |
| Q2 | Domain cho web UI? | Dùng lại **`bieuthue.ngocnhat.info`**: sửa A record sang IP public của server (giá trị trong `.agent/local/mona-dev-server.md`), xin cert Let's Encrypt riêng, không dựa vào cert sẵn có trên host | Không cần web → bỏ Task 8, bot vẫn chạy |
| Q3 | Lấy thêm RAM bằng cách nào? **Đã chốt 2026-09-13: không đụng dịch vụ dùng chung, không thêm swap** — giới hạn RAM cứng từng container (embedder `3500m` + `EMBED_BATCH=8`, seed `2g`, còn lại `1g`); chunk dài nhất của corpus hiện tại chỉ 1.600 ký tự nên embedder không cần nhiều | Hạ bộ nhớ một dịch vụ dùng chung trên host — cần quản trị MONA đồng ý (không làm) | Không làm gì → embedder dễ bị OOM khi seed; có thể thay bằng swap 4 GB |
| Q4 | Commit phần đang dở trước khi deploy? **Đã commit 2026-09-13:** `e332360`, `ad04ef2`, `41ac65a` (gồm Task 1); tài liệu (spec, ADR, kế hoạch 05–06) commit lại sau khi làm sạch chi tiết server | Có — gồm toàn bộ Mảng 1 của kế hoạch 05 và `research/legal-loader/*` (image ingest `COPY` các file này). `git archive HEAD` chỉ mang theo những gì đã commit | Và commit thay đổi của Task 1 |
| Q5 | Bí mật mới | Chủ dự án tự chạy `claude setup-token` lấy token mới, đặt mật khẩu basic auth, chuẩn bị `rclone.conf` có remote `gdrive` (để sao lưu lên Drive — Task 10), và tìm lại `ALLOWED_THREADS` (bản cũ mất cùng Contabo — làm theo Task 9 Step 4) | Bot và `/legal` cần token; thiếu `ALLOWED_THREADS` thì bot trả lời mọi người |
| Q6 | Quản trị MONA có đồng ý cho chạy bot phục vụ người dùng thật trên server dev dùng chung? **Chủ dự án yêu cầu deploy lên đây (2026-09-13)** | Hỏi trước | Server dev không có SLA |

## Vùng rủi ro

- **OOM lan sang dự án khác.** Máy không có swap; nếu embedder ăn hết RAM, kernel có thể giết dịch vụ dùng chung hoặc container của team khác. → `mem_limit` cho embedder (Task 4) để OOM chỉ xảy ra trong container của nó.
- **Seed nặng CPU.** Nhúng khoảng 2.800 chunk trên CPU (con số sẽ đổi sau khi kế hoạch 05 tạo lại corpus), ước tính 20–60 phút (đo thực tế 2026-09-13: ~18 phút). → `cpus: 6` cho embedder; nên chạy ngoài giờ làm việc.
- **Zalo có thể coi đăng nhập từ IP mới là bất thường** — session cũ đã mất nên đằng nào cũng phải quét QR lại (Task 9).
- **Cert:** chỉ kiểm cert của dự án bằng `certbot renew --dry-run --cert-name bieuthue.ngocnhat.info` (Task 8 Step 6).

## Ngoài phạm vi

Cấu hình của host (thuộc quản trị MONA) · TASK-022 (snapshot drizzle 0007–0009 — không cần để *áp* migration) · xuất `lookup_confirmation` ra `.ndjson` commit được (bài học từ lần mất VPS, nên là một task riêng).

---

### Task 1: Tham số hoá cổng host trong `docker-compose.yml`

Thay đổi code **duy nhất** của kế hoạch. Mặc định giữ nguyên 3000/5433, nên chạy local không đổi.

**Files:**
- Modify: `docker-compose.yml:20` (cổng db), `docker-compose.yml:112` (cổng api)
- Modify: `.env.example` (ghi chú hai biến mới)

- [x] **Step 1: Ghi lại hành vi hiện tại**

Run: `docker compose config | grep -E 'published'`
Expected: có `published: "5433"` và `published: "3000"`

- [x] **Step 2: Sửa hai dòng cổng**

```yaml
    ports:
      # Bound to localhost only: reached inside the compose network as db:5432.
      - "127.0.0.1:${DB_HOST_PORT:-5433}:5432"
```

```yaml
    ports:
      # Localhost only — a reverse proxy fronts it with TLS on the server.
      - "127.0.0.1:${API_HOST_PORT:-3000}:3000"
```

- [x] **Step 3: Kiểm chứng mặc định không đổi, biến môi trường có tác dụng**

Run: `docker compose config | grep -E 'published'`
Expected: vẫn là `"5433"` và `"3000"` (thêm `"8000"` của embedder nếu thay đổi của kế hoạch 05 Mảng 1 đã vào)

Run: `API_HOST_PORT=3060 DB_HOST_PORT=5435 docker compose config | grep -E 'published'`
Expected: `"5435"` và `"3060"`

- [x] **Step 4: Ghi chú trong `.env.example`** — Mảng 1 cũng thêm ghi chú vào file này; chỉ thêm hai dòng cổng, không lặp lại biến đã có

```bash
# Host-side ports, always bound to 127.0.0.1. Override when the host already uses them
# (the MONA dev server has 3000 and 5433 taken).
API_HOST_PORT=3000
DB_HOST_PORT=5433
```

- [x] **Step 5: Commit (khi chủ dự án cho phép — Q4)**

```bash
git add docker-compose.yml .env.example
git commit -m "Parameterize host ports in docker-compose"
```

---

### Task 2: Chuẩn bị server — thư mục, Claude CLI, RAM

> **Nếu image đã có sẵn CLI:** Mảng 1 của kế hoạch 05 cài CLI thẳng vào image (`apps/api/Dockerfile`: `npm install -g @anthropic-ai/claude-code`). Nếu commit deploy đã có dòng đó thì **bỏ Step 2–3** ở đây và bỏ hai mount `claude` trong override ở Task 4. Sau Task 5, kiểm chứng bằng `docker-compose run --rm --no-deps migrate claude --version`.

- [x] **Step 1: Tạo thư mục stack** — *chỉ tạo thư mục stack; không tạo `/opt/backups/customs-assistant` vì `db/backup.sh` không ghi ra host*

Run: `ssh <MONA_DEV_HOST> 'mkdir -p /opt/docker-projects/customs-assistant'`

- [ ] **Step 2: Cài Claude CLI native trên host, cố định vào một đường dẫn** — *bỏ qua 2026-09-13: CLI đã nằm trong image (2.1.270)*

```bash
ssh <MONA_DEV_HOST>
curl -fsSL https://claude.ai/install.sh | bash
install -m 755 "$(readlink -f "$HOME/.local/bin/claude")" /usr/local/bin/claude
/usr/local/bin/claude --version
```

Expected: in ra số phiên bản. Bản copy này **không tự cập nhật**; muốn nâng cấp thì chạy lại bước này rồi recreate `api` và `zalo-bot`.

- [ ] **Step 3: Kiểm chứng binary chạy được trong image nền của app (glibc của Debian)** — *bỏ qua, cùng lý do*

Run: `docker run --rm -v /usr/local/bin/claude:/usr/local/bin/claude:ro node:22-slim claude --version`
Expected: cùng số phiên bản. **Nếu lỗi → dừng lại và báo.** Khi đó phải cài CLI ngay trong Dockerfile, theo hướng trong [llm-expansion-design](../docs/llm-expansion-design.md).

- [ ] **Step 4: Lấy thêm RAM — chỉ làm phương án đã chốt ở Q3** — *không làm cả A lẫn B (Q3): giới hạn RAM từng container thay thế*

*Phương án A — hạ bộ nhớ một dịch vụ dùng chung trên host:* cần quản trị MONA đồng ý trước; dịch vụ nào và cách làm ghi trong `.agent/local/mona-dev-server.md`. **Không làm** (2026-09-13).

*Phương án B — thêm swap 4 GB:*

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
```

**Checkpoint 1** — báo chủ dự án: CLI chạy được trong container, RAM trống bao nhiêu.

---

### Task 3: Đưa code lên server

- [x] **Step 1: Trên máy dev, xác nhận thứ sẽ deploy**

Run: `git status --short && git log -1 --oneline`
Expected: không còn thay đổi nào ảnh hưởng runtime ngoài những gì đã chốt ở Q4.

- [x] **Step 2: Chuyển code bằng `git archive`** (giữ nguyên `.env` và override chưa commit trên server)

```bash
git archive HEAD | ssh <MONA_DEV_HOST> 'tar xf - -C /opt/docker-projects/customs-assistant'
git rev-parse HEAD | ssh <MONA_DEV_HOST> 'cat > /opt/docker-projects/customs-assistant/DEPLOYED_COMMIT'
```

- [x] **Step 3: Kiểm chứng**

Run: `ssh <MONA_DEV_HOST> 'cd /opt/docker-projects/customs-assistant && grep -cE "API_HOST_PORT|DB_HOST_PORT" docker-compose.yml && cat DEPLOYED_COMMIT'`
Expected: `2` và đúng hash commit.

---

### Task 4: Cấu hình riêng server (ngoài git)

- [x] **Step 1: Tạo `.env`** — **chủ dự án tự gõ token**, không dán vào chat — *token gõ ~11:23 UTC 2026-09-13. Sửa `.env` không tới container đang chạy: phải recreate (`docker-compose up -d --no-deps api`, và `zalo-bot`)*

```bash
ssh <MONA_DEV_HOST>
cd /opt/docker-projects/customs-assistant
cat > .env <<'ENV'
COMPOSE_PROJECT_NAME=customs-assistant
API_HOST_PORT=3060
DB_HOST_PORT=5435
EMBEDDER_HOST_PORT=8060
CLAUDE_CODE_OAUTH_TOKEN=
ALLOWED_THREADS=
DATA_SNAPSHOT_DATE=
ENV
chmod 600 .env
nano .env   # dán token từ `claude setup-token`; điền ALLOWED_THREADS nếu đã có (Q5)
```

- [x] **Step 2: Tạo `docker-compose.override.yml`** — *bản đang chạy trên server 2026-09-13. Bản nháp đầu mount `claude` từ host và cho embedder `5g`; đã bỏ vì CLI nằm trong image (Task 2) và theo Q3*

```yaml
x-logging: &logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
  db:         { mem_limit: 1g, logging: *logging }
  migrate:    { mem_limit: 1g, logging: *logging }
  seed:       { mem_limit: 2g, logging: *logging }
  seed-legal: { mem_limit: 1g, logging: *logging }
  api:        { mem_limit: 1g, logging: *logging }
  ingest:     { mem_limit: 1g, logging: *logging }
  zalo-bot:   { mem_limit: 1g, logging: *logging }
  embedder:
    # Shared host, no swap: keep an OOM inside this container instead of letting the
    # kernel pick a shared service or another team's container.
    mem_limit: 3500m
    cpus: 6
    environment:
      EMBED_BATCH: "8"
    logging: *logging
```

- [x] **Step 3: Kiểm chứng cấu hình đã gộp** (lọc để không in token)

Run: `docker-compose config | grep -E 'published|/usr/local/bin/claude|mem_limit|cpus|max-size|max-file|EMBED_BATCH'`
Expected: `published: "5435"`, `"3060"`, `"8060"`; `mem_limit` cho từng service; `cpus: 6`; `max-size`/`max-file`; `EMBED_BATCH: "8"`; **không** có dòng mount `claude`.

---

### Task 5: Build image trên server

- [x] **Step 1: Build** (lâu: embedder tải torch CPU và model BGE-M3 ~2,3 GB)

Run: `cd /opt/docker-projects/customs-assistant && docker-compose build migrate embedder ingest`
Expected: kết thúc không lỗi.

- [x] **Step 2: Kiểm chứng**

Run: `docker images | grep -E 'customs-assistant|legal-embedder' && df -h /`
Expected: 3 image `customs-assistant:local`, `legal-embedder:local`, `customs-assistant-ingest:local`; ổ đĩa còn đủ chỗ (`df -h /`).

**Checkpoint 2** — build xong; báo chủ dự án trước khi seed (seed nặng CPU, nên chạy ngoài giờ làm việc).

---

### Task 6: Seed dữ liệu mới

Không còn nhánh khôi phục: Contabo hết dịch vụ và VPS đã bị xoá (chủ dự án xác nhận 2026-09-13).

- [x] **Step 1: Bật db và embedder, chờ embedder healthy** (nạp model mất ~2 phút)

```bash
cd /opt/docker-projects/customs-assistant
docker-compose up -d db embedder
until docker inspect -f '{{.State.Health.Status}}' customs-assistant-embedder-1 | grep -q healthy; do sleep 10; done
```

- [x] **Step 2: Migration**

Run: `docker-compose run --rm --no-deps migrate`
Expected: áp từ 0000 đến 0009, không lỗi.

- [x] **Step 3: Seed biểu thuế**

Run: `docker-compose run --rm --no-deps seed`
Expected: kết thúc không lỗi (bản trên Contabo nạp 172.962 dòng).

- [x] **Step 4: Seed pháp lý và nhúng vector** (ước tính 20–60 phút; thực tế 2026-09-13 ~18 phút) — mở terminal khác theo dõi `docker stats customs-assistant-embedder-1`

Run: `docker-compose run --rm --no-deps seed-legal`
Expected: kết thúc không lỗi; RAM của embedder dưới `mem_limit`.
Nếu embedder bị OOM (`docker inspect -f '{{.State.OOMKilled}}' customs-assistant-embedder-1` ra `true`): hạ `EMBED_BATCH` trong `environment` của embedder ở override xuống `"4"`, chạy `docker-compose up -d --no-deps embedder`, rồi chạy lại bằng `FORCE_RESEED=1 docker-compose run --rm --no-deps seed-legal`.

- [x] **Step 5: Kiểm chứng số dòng khớp ndjson** — *thực tế 2026-09-13: 15 / 6.637 / 2.806, vì deploy corpus cũ đã commit*

Run: `docker-compose exec -T db psql -U app -d customs_assistant -c "select (select count(*) from legal_document) docs, (select count(*) from legal_provision) provisions, (select count(*) from legal_chunk) chunks"`
Expected: bằng số dòng của các file ndjson ở commit deploy, đếm bằng `wc -l db/seed/data/legal/{documents,provisions,chunks}.ndjson`. Đừng dùng con số cũ 15/6637/2806 — kế hoạch 05 đang tạo lại corpus.

- [x] **Step 6: Crawl lại danh mục Công báo `gazette_document`** (chạy nền, không chặn các task sau; ước tính ban đầu ~8 giờ) — *chạy 10:43 → 11:34 UTC 2026-09-13 (~51 phút), exit 0, 24.581 văn bản; còn `docker rm customs-assistant-gazette-full`*

```bash
docker-compose run -d --no-deps --name customs-assistant-gazette-full -e FULL=1 migrate node_modules/.bin/tsx apps/ingest/crawl-gazette.ts
docker logs -f --tail 20 customs-assistant-gazette-full
```

Chạy xong khi container ở trạng thái `Exited (0)` và log cuối có dòng `Xong: +N mới, chỉ mục hiện có N văn bản.`; `select count(*) from gazette_document` phải khớp số đó (2026-09-13: 24.581; bản Contabo cũ khoảng 15.500). Rồi `docker rm customs-assistant-gazette-full`.

`lookup_confirmation` bắt đầu rỗng — bộ nhớ áp mã phải học lại từ đầu qua xác nhận của nhân viên.

---

### Task 7: Chạy API và worker ingest, kiểm chứng

- [x] **Step 1: Bật**

Run: `docker-compose up -d --no-deps api ingest`

- [x] **Step 2: Health** — *lúc đầu `llm: no_token`; sau khi gõ token và recreate `api` (~11:23 UTC) ra `llm: up`*

Run: `curl -s http://127.0.0.1:3060/health`
Expected: `"status":"ok"`, `"db":"up"`, và trường LLM báo `up` (không phải `no_token` hay `no_cli`).

- [x] **Step 3: Tra cứu biểu thuế**

Run: `curl -s "http://127.0.0.1:3060/tariff/search?q=th%C3%A9p" | head -c 300`
Expected: mảng JSON không rỗng.

- [x] **Step 4: Pháp lý**

Run: `curl -s http://127.0.0.1:3060/legal/documents | head -c 300`
Expected: danh sách văn bản không rỗng.

- [x] **Step 5: Worker ingest không lỗi**

Run: `docker-compose logs --tail 30 ingest`
Expected: không có traceback.

- [x] **Step 6: Đo RAM thực tế**

Run: `docker stats --no-stream | grep customs-assistant && free -h`
Expected: `available` còn trên 1 GB. Ghi con số vào nhật ký tiến độ.

**Checkpoint 3** — API chạy; báo chủ dự án kèm con số RAM.

---

### Task 8: nginx, domain, TLS, basic auth (nếu Q2 có domain)

Các bước dưới dùng `bieuthue.ngocnhat.info` theo khuyến nghị ở Q2. Nếu chốt domain khác, thay tên trong mọi lệnh.

- [ ] **Step 1: Chủ dự án sửa A record** `bieuthue.ngocnhat.info` → IP public của server (DNS only; IP trong `.agent/local/mona-dev-server.md`)

Run: `dig +short bieuthue.ngocnhat.info`
Expected: đúng IP public của server.

- [ ] **Step 2: Vhost HTTP tạm để lấy cert** — tạo `/opt/nginx/conf/vhosts/bieuthue.ngocnhat.info.conf`

```nginx
server {
    listen       80;
    server_name  bieuthue.ngocnhat.info;
    access_log   /opt/log/nginx/bieuthue.ngocnhat.info-access.log;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://bieuthue.ngocnhat.info$request_uri; }
}
```

Run: `/opt/nginx/sbin/nginx -t && /opt/nginx/sbin/nginx -s reload`

- [ ] **Step 3: Xin cert** (tự gia hạn và tự reload nginx)

Run: `certbot certonly --webroot -w /var/www/html -d bieuthue.ngocnhat.info --deploy-hook "/opt/nginx/sbin/nginx -s reload"`
Expected: `Successfully received certificate`.

- [ ] **Step 4: Tạo mật khẩu basic auth** (`openssl` sẽ hỏi mật khẩu)

Run: `printf 'staff:%s\n' "$(openssl passwd -apr1)" > /opt/nginx/conf/htpasswd-customs-assistant && chmod 640 /opt/nginx/conf/htpasswd-customs-assistant`

- [ ] **Step 5: Thêm khối 443 vào cùng file vhost**

```nginx
server {
    listen       443 ssl;
    server_name  bieuthue.ngocnhat.info;
    ssl_certificate      /etc/letsencrypt/live/bieuthue.ngocnhat.info/fullchain.pem;
    ssl_certificate_key  /etc/letsencrypt/live/bieuthue.ngocnhat.info/privkey.pem;
    access_log  /opt/log/nginx/bieuthue.ngocnhat.info-access.log;
    error_log   /opt/log/nginx/bieuthue.ngocnhat.info-error.log error;
    client_max_body_size 20m;

    # The API has no auth of its own and the web UI writes lookup_confirmation.
    auth_basic           "Customs Assistant";
    auth_basic_user_file /opt/nginx/conf/htpasswd-customs-assistant;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Grounded legal answers wait on `claude -p`.
        proxy_read_timeout 300s;
        proxy_pass http://127.0.0.1:3060;
    }
}
```

Run: `/opt/nginx/sbin/nginx -t && /opt/nginx/sbin/nginx -s reload`

- [ ] **Step 6: Kiểm chứng từ máy dev**

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://bieuthue.ngocnhat.info/health`
Expected: `401` (chưa đăng nhập)

Run: `curl -s -u staff https://bieuthue.ngocnhat.info/health`
Expected: `"status":"ok"`

Run: `certbot renew --dry-run --cert-name bieuthue.ngocnhat.info`
Expected: gia hạn thử thành công.

- [ ] **Step 7: Các site khác trên server không bị ảnh hưởng**

So với file baseline mã HTTP các site khác (ngoài git — đường dẫn trong `.agent/local/mona-dev-server.md`), mỗi dòng dạng `<host> <mã HTTP>`:

```bash
BASELINE='<đường dẫn baseline trong .agent/local/mona-dev-server.md>'
while read h code; do n=$(curl -sk -o /dev/null -m 20 -w '%{http_code}' --resolve "$h:443:127.0.0.1" "https://$h/"); [ "$n" = "$code" ] && echo "same $h" || echo "CHANGED $h $code -> $n"; done < "$BASELINE"
```

Expected: tất cả `same`.

---

### Task 9: Bot Zalo — *đang làm (2026-09-13)*

- [x] **Step 1: Bảo đảm không còn bot nào khác đang chạy trên cùng tài khoản**

Contabo đã bị xoá nên bot cũ không thể còn chạy. Chỉ cần chắc chắn không có ai khác đang chạy thử bot trên cùng tài khoản Zalo (ví dụ trên laptop) — mỗi tài khoản Zalo chỉ một bot tại một thời điểm.

- [x] **Step 2: Bật bot** — *bật lần đầu trước 11:33 UTC 2026-09-13 với `ALLOWED_THREADS` trống (cho Step 4), `mem_limit` 1g; recreate khoảng 11:35–11:36 UTC khi đã có allowlist*

Run: `docker-compose up -d --no-deps zalo-bot && docker-compose logs -f --tail 30 zalo-bot`

- [x] **Step 3: Đăng nhập bằng QR** — *xong ~11:33 UTC 2026-09-13; session trong volume `customs-assistant_zalo_session`, lần recreate sau log `khôi phục session sẵn có`*

Khi chưa có session, bot (zca-js) ghi QR vào `/session/qr.png` trong container và tạo mã mới khoảng 90 giây một lần cho tới khi được quét (log `QR MỚI tại /session/qr.png`). Lấy ảnh về Mac ngay sau một dòng log như vậy:

```bash
ssh <MONA_DEV_HOST> 'docker exec customs-assistant-zalo-bot-1 cat /session/qr.png' > ~/Desktop/zalo-qr.png && open ~/Desktop/zalo-qr.png
```

Quét **ảnh** này bằng app Zalo của **tài khoản bot** — không quét QR vẽ trong log terminal. Mã hết hạn thì chạy lại lệnh.
Expected: log báo `đã lưu session`. Session nằm ở `/session/zalo-session.json` trong volume `customs-assistant_zalo_session`, nên các lần restart sau đăng nhập không cần QR (log `khôi phục session sẵn có`).

- [x] **Step 4: `ALLOWED_THREADS`** (bản cũ đã mất cùng Contabo) — *đặt ~11:36 UTC 2026-09-13, cửa sổ mở ~3 phút; giá trị chỉ ghi trong `.agent/local/mona-dev-server.md`*

Bot bỏ **im lặng, không log** mọi tin từ thread ngoài `ALLOWED_THREADS` (`apps/zalo-bot/index.mjs:229`), và trong nhóm chỉ trả lời khi được **@tag**. Vì vậy phải mở một cửa sổ ngắn với `ALLOWED_THREADS` trống:

1. Chủ dự án **@tag bot một lần** trong đúng nhóm cần phục vụ.
2. Agent đọc threadId từ DB: `docker-compose exec -T db psql -U app -d customs_assistant -c "select thread_id, count(*) from conversation group by 1 order by 2 desc" </dev/null`
3. Ghi threadId vào `ALLOWED_THREADS` trong `.env`, rồi `docker-compose up -d --no-deps zalo-bot` (recreate — sửa `.env` không tới container đang chạy).

Trong lúc cửa sổ mở, bot trả lời **bất kỳ ai** nhắn riêng cho tài khoản đó, và bất kỳ nhóm nào có bot mà @tag bot — giữ cửa sổ này càng ngắn càng tốt.

- [ ] **Step 5: Kiểm chứng đầu-cuối** trong nhóm được phép — *chưa kiểm*

Gửi lần lượt: 1 câu tra mã HS · 1 câu hỏi pháp lý · 1 ảnh hàng hoá.
Expected: cả ba được trả lời; câu pháp lý có trích dẫn điều khoản (LLM đang chạy). Nhắn từ một thread ngoài danh sách → bot im lặng.

**Checkpoint 4** — bot sống; báo chủ dự án.

---

### Task 10: Sao lưu hằng đêm lên Google Drive (bài học từ lần mất Contabo)

Dùng đúng `db/backup.sh` của repo theo bước 7 "Sao lưu đêm" trong [README](../../README.md#triển-khai-máy-chủ). **Không** tạo thêm script hay cron thứ hai.

- **Sao lưu gì:** script chỉ sao lưu hai thứ không tái tạo được từ git — bảng `lookup_confirmation` và trạng thái xác minh của `legal_document` — rồi đẩy lên `gdrive:Legal-AI-Backup/`, tức nằm **ngoài server**.
- **Không sao lưu dữ liệu chat** ([R14](../business-rules.md)).
- **Phần còn lại của DB cố ý không sao lưu.** Nếu mất server: seed lại từ git (Task 6, khoảng 20 phút theo số đo 2026-09-13, chưa tính build), crawl lại `gazette_document` (khoảng 1 giờ), và nạp lại `lookup_confirmation` từ Drive.

- [ ] **Step 1: Cài rclone và cấu hình cho root** (cron chạy bằng root; server chưa có rclone — kiểm tra ngày 2026-09-13)

```bash
# Trên server
curl -fsSL https://rclone.org/install.sh | bash   # nếu báo thiếu unzip: apt-get install -y unzip
rclone version | head -1
```

```bash
# Trên máy dev — rclone.conf chứa token Drive: không commit, không dán vào chat
scp ~/.config/rclone/rclone.conf <MONA_DEV_HOST>:/tmp/rclone.conf
ssh <MONA_DEV_HOST> 'sudo install -D -m 600 /tmp/rclone.conf /root/.config/rclone/rclone.conf && rm /tmp/rclone.conf && sudo -H rclone listremotes'
```

Expected: có dòng `gdrive:`.

- [ ] **Step 2: Chạy tay lần đầu** với đúng người dùng mà cron dùng (`sudo -H`, như README)

Run: `cd /opt/docker-projects/customs-assistant && sudo -H ./db/backup.sh`
Expected: `backup <ngày hôm nay> ok`. Nếu báo `Permission denied` thì chạy `sudo -H bash db/backup.sh`.

- [ ] **Step 3: Kiểm chứng bản sao lưu nằm trên Drive và đọc được**

Run: `sudo -H rclone ls gdrive:Legal-AI-Backup/ | tail -3`
Expected: có file `customs-backup-<ngày hôm nay>.tgz`.

Run: `sudo -H rclone cat "gdrive:Legal-AI-Backup/customs-backup-$(date +%F).tgz" | tar tzf -`
Expected: có `./lookup_confirmation.sql` và `./legal_document_verification.csv`. Vừa seed xong thì `lookup_confirmation` còn rỗng, nhưng file vẫn phải có mặt.

- [ ] **Step 4: Cron 02:00** — dùng đúng tên file của README để trên máy chỉ có **một** cron sao lưu

Run: `echo '0 2 * * * root cd /opt/docker-projects/customs-assistant && ./db/backup.sh >> /var/log/customs-backup.log 2>&1' | sudo tee /etc/cron.d/customs-backup && ls /etc/cron.d | grep -i backup`
Expected: chỉ một dòng `customs-backup`. Sáng hôm sau: `tail -3 /var/log/customs-backup.log` ra `backup … ok`.

---

### Task 11: Cập nhật tri thức dự án

- [x] **Step 1: ADR** [2026-09-13-host-on-mona-dev-server.md](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md) — vì sao chọn server này, ràng buộc dùng chung, nginx thay Caddy, cổng 3060/5435, chiến lược sao lưu; cùng [runbook vận hành](../docs/mona-dev-server-operations.md) — *đã viết 2026-09-13; cập nhật khi Task 8–10 xong*.
- [ ] **Step 2: `02-progress.md`** — cập nhật Tiếp tục từ đây (bot/API đã online lại), bảng trạng thái, nhật ký phiên kèm con số RAM thực tế và thời gian seed — *đã cập nhật 2026-09-13; cập nhật lại khi Task 9 xong*.
- [ ] **Step 3: `.agent/index.md`** — trỏ tới ADR mới; đổi trạng thái kế hoạch này thành `done` — *index đã trỏ ADR + runbook; đổi `done` khi Task 8–10 xong*.
- [ ] **Step 4: Commit** tài liệu (khi được yêu cầu).

---

## Deploy các lần sau

Xem [runbook §5](../docs/mona-dev-server-operations.md#5-deploy-bản-mới).

## Gỡ bỏ (rollback)

Xem [runbook §8](../docs/mona-dev-server-operations.md#8-tạm-dừng-và-gỡ-bỏ). Không có gì cần hoàn tác ở dịch vụ dùng chung (Q3 không hạ bộ nhớ dịch vụ dùng chung, không thêm swap).

## Cấu hình thực tế trên server (2026-09-13, ngoài git)

- `.env` (`chmod 600`): `COMPOSE_PROJECT_NAME=customs-assistant`, `API_HOST_PORT=3060`, `DB_HOST_PORT=5435`, `EMBEDDER_HOST_PORT=8060` (không chiếm 8000). `CLAUDE_CODE_OAUTH_TOKEN` chủ dự án đã gõ (~11:23 UTC); `ALLOWED_THREADS` đã đặt ~11:36 UTC (giá trị chỉ ở `.agent/local/mona-dev-server.md`); `DATA_SNAPSHOT_DATE` trống.
- `docker-compose.override.yml`: đúng khối ở Task 4 Step 2 — giới hạn RAM như Q3 (bot `1g`), `cpus: 6` và `EMBED_BATCH=8` cho embedder, log `json-file` 10m × 3 cho mọi service, đặt trong override (không dựa vào cấu hình log của Docker trên host). **Không** có mount `claude` — Task 2 Step 2–3 bỏ qua vì CLI đã nằm trong image.

## Kết quả thực thi 2026-09-13

- **Commit deploy:** `DEPLOYED_COMMIT` trên server ghi một commit cục bộ không có trên GitHub, mã runtime giống hệt `41ac65a` (chỉ khác trong `.agent/`). Lần deploy đầu sau khi push: so diff với `41ac65a` (runbook §5). Corpus pháp lý là bản **đã commit** — bản sinh lại của kế hoạch 05 vẫn chờ chủ dự án quyết theo từng văn bản.
- **Build** trên server khoảng 5 phút: `legal-embedder:local` 6 GB, `customs-assistant:local` 823 MB, `customs-assistant-ingest:local` 206 MB.
- **Seed:** migration OK; biểu thuế 172.962 dòng trong 30 giây; pháp lý 15 văn bản / 6.637 điều khoản / 2.806 chunk, 0 chunk thiếu vector, khoảng 18 phút (10:43 → 11:01 UTC). Embedder đỉnh 1,19 GiB trên giới hạn 3,4 GiB, không OOM, không restart.
- **API:** `/health` lúc đầu → `status ok`, `db up`, pgvector 0.8.6, `llm: no_token`. `/tariff/search` và `/legal/documents` trả dữ liệu; `GET /legal?q=Điều 18 Nghị định 08/2015…` truy hồi đúng Điều 18 của 46/VBHN-BTC trong 0,6 giây (lúc chưa có token nên trả nguyên văn, không tổng hợp); worker ingest chờ việc mỗi 15 giây.
- **Token (~11:23 UTC):** chủ dự án gõ `CLAUDE_CODE_OAUTH_TOKEN` vào `.env`, recreate bằng `docker-compose up -d --no-deps api` → `/health` ra `{"status":"ok","db":"up","pgvector":"0.8.6","llm":"up"}`.
- **Bot Zalo (Task 9) — đang làm:** bật lần đầu với `ALLOWED_THREADS` trống (`mem_limit` 1g); đăng nhập QR ~11:33 UTC; chủ dự án @tag bot trong nhóm, `ALLOWED_THREADS` đặt ~11:36 UTC (cửa sổ mở ~3 phút); recreate xong, log `khôi phục session sẵn có` → `đăng nhập OK` với allowlist một thread → `đang lắng nghe tin nhắn…`. Kiểm chứng đầu-cuối (Step 5): chưa có.
- **Crawl Công báo:** container `customs-assistant-gazette-full` (`FULL=1`) chạy 10:43 → 11:34 UTC (~51 phút), exit 0, log `Xong: +24581 mới`; `gazette_document` = 24.581. Còn `docker rm customs-assistant-gazette-full`.
- **RAM lúc chạy ổn định (trước khi có token và bot):** embedder 1,13 GiB · db 199 MiB · api 41 MiB · ingest 32 MiB · crawl Công báo ~100 MiB. Host còn 3,8 GB `available`. Sau khi có token và bot (11:44 UTC, crawl đã thoát): embedder ~1,3 GiB · api ~215 MiB · db ~191 MiB · zalo-bot ~58 MiB · ingest ~31 MiB.
- **Không ảnh hưởng dự án khác:** các site khác giữ nguyên mã HTTP so với file baseline (ngoài git); các dịch vụ dùng chung vẫn active, container của team khác vẫn `Up`, không cái nào restart; không có sự kiện OOM của kernel.
- **Bài học:**
  - `ssh host 'bash -s' <<'EOF'` cộng `docker-compose run`/`exec` → lệnh docker đọc stdin và nuốt phần còn lại của script (bash thoát giữa chừng, tiến trình nền bị mồ côi). Mọi `docker-compose run/exec` trong script dạng này phải có `</dev/null`.
  - Sửa `.env` không tới container đang chạy — phải recreate (`docker-compose up -d --no-deps <service>`).
- **Còn chờ chủ dự án:** kiểm thử đầu-cuối bot trong nhóm (Task 9 Step 5), Task 8 (Q2 domain + mật khẩu basic auth), Task 10 (`rclone.conf`), quyết định corpus theo từng văn bản của kế hoạch 05. Việc của agent: `docker rm customs-assistant-gazette-full`. Task 11: ADR và runbook đã viết, cập nhật khi Task 8–10 xong.

## Kế hoạch kiểm chứng tổng

| Yêu cầu | Chứng minh bằng |
|---|---|
| API sống, DB có pgvector, LLM hoạt động | Task 7 Step 2 |
| Tra cứu biểu thuế và pháp lý trả dữ liệu | Task 7 Step 3–4 |
| Dữ liệu seed đúng | Task 6 Step 5 |
| Web chỉ vào được khi có mật khẩu, qua HTTPS | Task 8 Step 6 |
| Bot chỉ trả lời thread được phép, có trích dẫn | Task 9 Step 5 |
| Không làm hỏng dự án khác | Task 8 Step 7, và RAM ở Task 7 Step 6 |
| Có bản sao lưu ngoài server, đọc được | Task 10 Step 3 |

## Kiến thức liên quan

- [Nhật ký tiến độ](02-progress.md) — sự kiện VPS chết ngày 2026-09-10 và danh sách dữ liệu đã mất
- [ADR bot Zalo tự host](../architecture-decisions/2026-07-18-self-hosted-zalo-bot.md)
- [Kho pháp luật tự mở rộng](../docs/legal-corpus-self-extension.md) — `gazette_document`, worker ingest
- [Bộ nhớ hội thoại bot Zalo](../docs/zalo-bot-conversation-memory.md) — bảng `conversation`
- [ADR: host trên server dev dùng chung của MONA](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md) — vì sao chọn server này, ràng buộc dùng chung, sao lưu
- [Runbook vận hành server MONA dev](../docs/mona-dev-server-operations.md) — lệnh vận hành stack sau khi deploy
