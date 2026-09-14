---
type: runbook
status: active
updated: 2026-09-14
related:
  - ../planning/06-deploy-mona-dev-server.md
  - ../architecture-decisions/2026-09-13-host-on-mona-dev-server.md
  - ../../README.md
  - zalo-bot-conversation-memory.md
  - legal-corpus-self-extension.md
  - ../business-rules.md
---

# Vận hành Customs Assistant trên server dev của MONA

Runbook cho bản đang chạy: kiểm tra, deploy bản mới, bot Zalo, sao lưu, gỡ bỏ. Cách dựng lần đầu nằm ở [README](../../README.md#triển-khai-máy-chủ), việc còn dở ở
[kế hoạch 06](../planning/06-deploy-mona-dev-server.md); lý do chọn server này nằm ở
[ADR 2026-09-13](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md).

Trong tài liệu này, `<MONA_DEV_HOST>` là đích ssh của server. Giá trị thật và đặc điểm của host dùng chung nằm ở
`.agent/local/mona-dev-server.md`. File này ngoài git, chỉ có trên máy của chủ dự án.

## 1. Tổng quan

Server dev dùng chung của MONA, nhiều dự án khác cùng chạy. Máy không có swap, lúc khảo sát còn trống khoảng
4,9 GB RAM, nên mỗi container có giới hạn RAM cứng (mục 3).

- **Thư mục stack:** `/opt/docker-projects/customs-assistant` (mã lấy từ `git archive`, cộng các file ngoài git ở mục 3).
- **Compose project:** `customs-assistant`. Container tên `customs-assistant-<service>-1`, network và volume cũng mang tiền tố này.

| Service | Image | Việc | Cổng host |
|---|---|---|---|
| `db` | `pgvector/pgvector:pg17` | Postgres + pgvector, dữ liệu ở volume `customs-assistant_db_data` | `127.0.0.1:5435` |
| `embedder` | `legal-embedder:local` | BGE-M3, nhúng câu hỏi pháp lý và chunk lúc seed/ingest | `127.0.0.1:8060` |
| `api` | `customs-assistant:local` | API + web UI | `127.0.0.1:3060` |
| `ingest` | `customs-assistant-ingest:local` | Worker xử lý hàng đợi `ingest_request` do bot ghi, hỏi việc mỗi 15 giây | — |
| `zalo-bot` | `customs-assistant:local` | Bot Zalo, session ở volume `customs-assistant_zalo_session` | — |

Năm service trên có `restart: unless-stopped`. Chạy một lần rồi thoát: `migrate` (service dùng để build image
`customs-assistant:local`), `seed` (biểu thuế), `seed-legal` (kho pháp lý, cần `embedder` healthy).

**Crawl danh mục Công báo** (`gazette_document`) là container rời `customs-assistant-gazette-full`, dùng image của
`migrate`. Lần crawl đầy đủ ngày 2026-09-13 chạy từ 10:43 tới 11:34 UTC (~51 phút), được 24.581 văn bản:

```bash
docker-compose run -d --no-deps --name customs-assistant-gazette-full -e FULL=1 migrate node_modules/.bin/tsx apps/ingest/crawl-gazette.ts
```

Bỏ `FULL=1` thì crawl chạy kiểu incremental: gặp một trang không có văn bản mới là dừng (`apps/ingest/crawl-gazette.ts`).

**Nằm ngoài thư mục stack:**

| Thứ | Trạng thái 2026-09-13 |
|---|---|
| Cron sao lưu `/etc/cron.d/customs-backup`, log `/var/log/customs-backup.log` | Chưa tạo, chờ `rclone.conf` (Task 10) |
| Vhost `/opt/nginx/conf/vhosts/bieuthue.ngocnhat.info.conf`, htpasswd `/opt/nginx/conf/htpasswd-customs-assistant`, cert Let's Encrypt của `bieuthue.ngocnhat.info` | Chưa tạo, chờ domain và mật khẩu basic auth (Task 8) |

Không có gì cài lên host. CLI `claude` nằm sẵn trong image.

**Dữ liệu đang chạy (2026-09-13):** kho pháp lý là bản cũ đã commit (15 văn bản / 6.637 điều khoản / 2.806 chunk).
Bản sinh lại của [kế hoạch 05](../planning/05-bot-parity-tasks.md) còn chờ chủ dự án quyết theo từng văn bản.
`lookup_confirmation` bắt đầu rỗng.

## 2. Truy cập

```bash
ssh <MONA_DEV_HOST>
cd /opt/docker-projects/customs-assistant
```

- Luôn đứng trong thư mục stack rồi mới gõ lệnh compose. Compose chỉ đọc `.env` và `docker-compose.override.yml` ở
  thư mục hiện tại. Gõ ở chỗ khác thì mất giới hạn RAM, còn cổng quay về mặc định 3000/5433 là hai cổng đã bị dự án khác chiếm.
- Luôn gõ `docker-compose` (có gạch). Host chỉ có bản standalone v2.15.1, không có plugin `docker compose`.
- Các lệnh trong runbook này để gõ tay trong phiên ssh. Nếu gom vào script `bash -s`, xem bẫy stdin ở mục 9.

**Web UI khi chưa có domain:** mở tunnel từ máy dev rồi vào `http://localhost:3060`.

```bash
ssh -L 3060:127.0.0.1:3060 <MONA_DEV_HOST>
```

API không có xác thực, mà web UI lại ghi được vào `lookup_confirmation` (`POST /tariff/confirm`). Vì vậy không bao
giờ mở cổng 3060 ra ngoài. Chỉ vào qua tunnel, hoặc qua nginx có basic auth khi Task 8 xong.

## 3. Cấu hình ngoài git

Hai file này nằm trong thư mục stack. `git archive` không đè lên chúng.

### `.env` (`chmod 600`)

| Biến | Tác dụng | Service đọc |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | Tên project `customs-assistant`, cũng là tiền tố của container và volume | compose |
| `API_HOST_PORT` | Cổng host của API: `3060` | `api` |
| `DB_HOST_PORT` | Cổng host của Postgres: `5435` | `db` |
| `EMBEDDER_HOST_PORT` | Cổng host của embedder: `8060` | `embedder` |
| `CLAUDE_CODE_OAUTH_TOKEN` | Token cho CLI `claude` (lấy bằng `claude setup-token`). Để trống thì `/health` báo `llm: no_token`, `/legal` trả nguyên văn điều khoản, bot chỉ chạy nhánh regex. Đã điền khoảng 11:23 UTC ngày 2026-09-13 | `api`, `zalo-bot` |
| `ALLOWED_THREADS` | Các threadId Zalo được bot trả lời, cách nhau dấu phẩy. Để trống là trả lời mọi người (mục 6) | `zalo-bot` |

Lúc deploy, `.env` không đặt `EMBED_MAX_TOKENS`, `EMBED_MODEL`, `EMBED_ID`, `EMBEDDER_URL`, nên các biến này lấy mặc
định trong `docker-compose.yml`. `FORCE_RESEED` chỉ truyền trên dòng lệnh (mục 5), không ghi vào `.env`.
Token chủ dự án tự gõ bằng `nano .env`, không dán vào chat hay log.

### `docker-compose.override.yml`

- Giới hạn RAM theo Q3 của kế hoạch 06: `embedder` `3500m` (kèm `EMBED_BATCH=8`, `cpus: 6`), seed `2g`, các service
  còn lại `1g` (`zalo-bot` `1g`). Nhờ vậy nếu hết RAM thì OOM chỉ xảy ra trong container của dự án này, không lan sang dự án khác trên host.
- Log `json-file` 10m × 3 cho mọi service.
- Không có mount `claude`, vì CLI đã nằm trong image.

Không thêm `ports` vào override (mục 9).

### Sửa cấu hình

Container chỉ đọc biến môi trường lúc được tạo. `docker-compose restart` **không** nhận giá trị mới, phải recreate:

```bash
nano .env
docker-compose up -d --no-deps api zalo-bot   # chỉ liệt kê service đọc biến vừa sửa (bảng trên)
```

Recreate `embedder` thì model phải nạp lại khoảng 2 phút. Trong lúc đó `/legal` trả 400, còn tra biểu thuế vẫn chạy.

Muốn xem cấu hình đã gộp thì luôn lọc qua `grep`. `docker-compose config` không lọc sẽ in cả token:

```bash
docker-compose config | grep -E 'published|mem_limit|cpus|max-size|max-file|EMBED_BATCH'
```

## 4. Kiểm tra nhanh

```bash
curl -s http://127.0.0.1:3060/health
```

Kết quả mong đợi: `{"status":"ok","db":"up","pgvector":"0.8.6","llm":"up"}`. Nếu `llm` khác `up` thì xem bảng này:

| `llm` | Nghĩa |
|---|---|
| `no_token` | `CLAUDE_CODE_OAUTH_TOKEN` trống trong container: điền `.env` rồi recreate |
| `no_cli` | CLI `claude` trong image không chạy được: kiểm tra `docker-compose run --rm --no-deps migrate claude --version` |

Container, RAM, OOM:

```bash
docker ps --filter label=com.docker.compose.project=customs-assistant --format 'table {{.Names}}\t{{.Status}}'
docker stats --no-stream $(docker ps -q --filter label=com.docker.compose.project=customs-assistant)
docker inspect -f '{{.Name}} OOMKilled={{.State.OOMKilled}} restarts={{.RestartCount}}' $(docker ps -aq --filter label=com.docker.compose.project=customs-assistant)
free -h
```

Log từng service:

```bash
docker-compose logs --tail 50 api
docker-compose logs --tail 50 ingest
docker-compose logs --tail 20 embedder
docker-compose logs -f --tail 30 zalo-bot
```

Tra cứu thử:

```bash
curl -s "http://127.0.0.1:3060/tariff/search?q=th%C3%A9p" | head -c 300
curl -s http://127.0.0.1:3060/legal/documents | head -c 300
```

Xem trước câu trả lời của bot (chữ + style, không gửi Zalo, không ghi bộ nhớ hội thoại):

```bash
docker-compose exec -T zalo-bot node apps/zalo-bot/dry-run.mjs                      # sáu câu mẫu
docker-compose exec -T zalo-bot node apps/zalo-bot/dry-run.mjs "câu hỏi của bạn"
```

Đếm dòng dữ liệu:

```bash
docker-compose exec -T db psql -U app -d customs_assistant -c "select (select count(*) from legal_document) docs, (select count(*) from legal_provision) provisions, (select count(*) from legal_chunk) chunks, (select count(*) from gazette_document) gazette, (select count(*) from lookup_confirmation) confirmations, (select count(*) from ingest_request) ingest_requests"
```

Với corpus hiện tại, ba cột đầu là 15 / 6.637 / 2.806, cộng thêm những văn bản worker ingest nạp theo yêu cầu.

**Tiến độ crawl Công báo:**

```bash
docker ps -a --filter name=customs-assistant-gazette-full --format '{{.Status}}'
docker logs --tail 5 customs-assistant-gazette-full
docker-compose exec -T db psql -U app -d customs_assistant -At -c "select count(*) from gazette_document"
```

Crawl xong khi container ở trạng thái `Exited (0)` và log cuối có dòng `Xong: +N mới, chỉ mục hiện có N văn bản.`
(2026-09-13: 24.581). Khi đó dọn container: `docker rm customs-assistant-gazette-full` (lần 2026-09-13 chưa dọn).
Nếu exit code khác 0, đọc log trước rồi mới chạy lại.

## 5. Deploy bản mới

`git archive HEAD` chỉ gói những gì **đã commit**. Commit trước khi deploy. Tar ghi đè file nhưng không xoá những file
đã bị xoá khỏi git, còn `.env`, override, `DEPLOYED_COMMIT` và `teardown.sh` thì giữ nguyên.

**Bước 1, trên máy dev:** xem khác gì so với bản đang chạy, rồi đẩy mã lên.

```bash
git status --short && git log -1 --oneline
git diff --stat "$(ssh <MONA_DEV_HOST> 'cat /opt/docker-projects/customs-assistant/DEPLOYED_COMMIT')" HEAD
git archive HEAD | ssh <MONA_DEV_HOST> 'tar xf - -C /opt/docker-projects/customs-assistant'
git rev-parse HEAD | ssh <MONA_DEV_HOST> 'cat > /opt/docker-projects/customs-assistant/DEPLOYED_COMMIT'
```

Lần deploy đầu sau khi push: `DEPLOYED_COMMIT` còn ghi một commit cục bộ không có trên GitHub (mã runtime giống
`41ac65a`). Nếu `git diff` báo `bad object` hoặc `bad revision` thì so với `41ac65a`. Lần deploy đó ghi lại
`DEPLOYED_COMMIT` bằng HEAD đã push.

**Bước 2: build đúng image cần build**, dựa vào danh sách file đổi ở bước 1.

| File đổi | Build | Recreate |
|---|---|---|
| `apps/api`, `apps/zalo-bot`, `db/` (gồm migration và dữ liệu seed), `public/`, file `.ts` trong `apps/ingest`, `package.json`, `yarn.lock`, `.yarnrc.yml`, `tsconfig.json`, `nest-cli.json`, `drizzle.config.ts` | `docker-compose build migrate` | `api zalo-bot` (chạy migration trước) |
| `apps/embedder` | `docker-compose build embedder` | `embedder` |
| `apps/ingest` (Dockerfile, Python), `research/legal-loader/parse_provisions.py`, `research/legal-loader/build_chunks.py` | `docker-compose build ingest` | `ingest` |

Image `api` được build qua service `migrate`. Lệnh `docker-compose build api` không làm gì.

**Bước 3: migration và recreate.** Đây là trường hợp thường gặp:

```bash
ssh <MONA_DEV_HOST> 'cd /opt/docker-projects/customs-assistant \
  && docker-compose build migrate \
  && docker-compose run --rm --no-deps migrate </dev/null \
  && docker-compose up -d --no-deps --force-recreate api zalo-bot ingest'
```

Nếu chỉ đổi code bot: `docker-compose build migrate && docker-compose up -d --no-deps zalo-bot`. Session Zalo nằm
trong volume nên recreate không phải quét QR lại. Container crawl đang chạy vẫn giữ image cũ cho tới khi thoát.

**Bước 4: kiểm tra** theo mục 4 (`/health`, log `api` và `zalo-bot`).

### Nạp lại kho pháp lý (`FORCE_RESEED`)

Chỉ làm khi `db/seed/data/legal/*.ndjson` đổi, ví dụ sau khi gộp corpus của kế hoạch 05. Những điều cần biết trước:

- `seed-legal` chạy `TRUNCATE legal_chunk, legal_provision, legal_document RESTART IDENTITY CASCADE`. Lệnh này xoá cả
  những văn bản worker ingest đã nạp theo yêu cầu và trạng thái `verification`/`verified_by`. Hãy xuất trạng thái xác minh trước.
- **Phải có `--no-deps`.** Không có nó, compose chạy luôn chuỗi phụ thuộc `seed`, và `FORCE_RESEED=1` cũng đi vào
  `seed`, nên cả các bảng biểu thuế bị TRUNCATE rồi nạp lại.
- `--no-deps` thì không tự bật embedder, nên embedder phải đang healthy.

```bash
docker-compose exec -T db psql -U app -d customs_assistant -At -c "COPY (SELECT number, verification, verified_by FROM legal_document ORDER BY number) TO STDOUT WITH CSV HEADER" > legal_document_verification-$(date +%F).csv && chmod 600 legal_document_verification-*.csv
docker inspect -f '{{.State.Health.Status}}' customs-assistant-embedder-1   # phải là healthy
FORCE_RESEED=1 docker-compose run --rm --no-deps seed-legal
docker-compose up -d --no-deps --force-recreate api
```

Mất khoảng 18 phút cho 2.806 chunk. Muốn theo dõi RAM thì mở `docker stats customs-assistant-embedder-1` ở terminal khác.
Nếu embedder bị OOM, làm theo Task 6 Step 4 của kế hoạch 06 (hạ `EMBED_BATCH`).

## 6. Bot Zalo

> **Trạng thái 2026-09-13: đang làm (Task 9).** Đăng nhập QR xong (~11:33 UTC), `ALLOWED_THREADS` đã đặt
> (~11:36 UTC, giá trị chỉ ở `.agent/local/mona-dev-server.md`), bot chạy lại bằng session đã lưu (giới hạn 1g).
> Còn: kiểm thử đầu-cuối.

### Đăng nhập lần đầu bằng QR

```bash
docker-compose up -d --no-deps zalo-bot
docker-compose logs -f --tail 30 zalo-bot
```

zca-js ghi QR ra `/session/qr.png` trong container và tạo mã mới khoảng mỗi 90 giây cho tới khi có người quét.
Mỗi lần tạo, log ghi dòng `QR MỚI tại /session/qr.png`. Lấy ảnh về máy dev:

```bash
ssh <MONA_DEV_HOST> 'docker exec customs-assistant-zalo-bot-1 cat /session/qr.png' > ~/Desktop/zalo-qr.png && open ~/Desktop/zalo-qr.png
```

- Quét **ảnh** này bằng app Zalo của **tài khoản bot**. Không quét QR vẽ trong log terminal, vì đó chỉ là mã polling nội bộ.
- Không thêm `-t` vào `docker exec`: TTY làm hỏng file PNG.
- Mã hết hạn thì chạy lại lệnh lấy ảnh sau dòng `QR MỚI` kế tiếp.
- Log thành công: `đã quét — xác nhận trên điện thoại…`, rồi `đã lưu session`, rồi `đăng nhập OK (id …)` kèm
  `Allowlist=…`, rồi `đang lắng nghe tin nhắn…`. Xong thì xoá ảnh: `rm ~/Desktop/zalo-qr.png`.

### Session

Session lưu ở `/session/zalo-session.json` trong volume `customs-assistant_zalo_session`. Restart, recreate và deploy
đều đăng nhập lại mà không cần QR (log `khôi phục session sẵn có`). Chỉ `docker-compose down -v` hoặc `teardown.sh` xoá volume này.

**Session hết hạn:** log báo `session cũ hỏng/hết hạn … chuyển sang QR`, rồi process chuyển sang vòng lặp QR. Process
vẫn sống nhưng không trả lời ai cho tới khi quét lại. Kiểm tra định kỳ bằng lệnh dưới, rồi lấy QR như trên:

```bash
docker-compose logs --tail 100 zalo-bot | grep -E 'hết hạn|QR MỚI|đăng nhập OK'
```

**Đổi sang tài khoản khác:** xoá session rồi quét QR mới.

```bash
docker-compose stop zalo-bot
docker-compose run --rm --no-deps zalo-bot rm /session/zalo-session.json
docker-compose up -d --no-deps zalo-bot
```

**Mỗi tài khoản Zalo chỉ chạy một bot tại một thời điểm.** Trước khi chạy bot ở nơi khác (ví dụ thử trên laptop),
dừng bot trên server, và ngược lại.

### Lấy threadId cho `ALLOWED_THREADS`

Có hai chỗ khiến không thể lấy threadId của nhóm trong lúc allowlist đang bật:

- `apps/zalo-bot/index.mjs:229` bỏ im lặng tin nhắn từ thread ngoài `ALLOWED_THREADS`, không ghi log.
- Trong nhóm, bot chỉ trả lời khi được @tag.

Vì vậy phải mở một cửa sổ ngắn với `ALLOWED_THREADS` trống:

1. `.env` có `ALLOWED_THREADS=` trống, bot đã đăng nhập (log `Allowlist=(mở)`).
2. Chủ dự án @tag bot **một lần** trong đúng nhóm cần phục vụ.
3. Đọc `thread_id` vừa ghi:

   ```bash
   docker-compose exec -T db psql -U app -d customs_assistant -c "select thread_id, user_id, staff_name, last_active_at from conversation order by last_active_at desc limit 5"
   ```

4. `nano .env`, điền `ALLOWED_THREADS=<threadId>` (nhiều thread thì cách nhau dấu phẩy).
5. `docker-compose up -d --no-deps zalo-bot`, rồi kiểm tra log có `Allowlist=<threadId>`.

**Rủi ro của cửa sổ mở:** trong lúc `ALLOWED_THREADS` trống, **bất kỳ ai** nhắn riêng cho tài khoản bot, và bất kỳ
nhóm nào có bot mà @tag bot, cũng được trả lời (tốn lượt LLM, và nội dung chat của họ vào bảng `conversation`). Làm
bước 2–5 liền một mạch. Lần 2026-09-13 cửa sổ mở khoảng 3 phút.

**Đổi allowlist về sau:** sửa `.env` rồi recreate `zalo-bot`. Muốn thêm một nhóm mới mà chưa biết threadId thì phải
mở lại cửa sổ trên, vì tin từ nhóm lạ bị bỏ im lặng.

### Kiểm thử đầu-cuối (chưa làm)

Trong nhóm được phép, gửi lần lượt: một câu tra mã HS, một câu hỏi pháp lý (phải có trích dẫn điều khoản), một ảnh
hàng hoá. Sau đó nhắn từ một thread ngoài danh sách: bot phải im lặng.

## 7. Sao lưu

> **Trạng thái 2026-09-13: chưa bật.** Chờ chủ dự án đưa `rclone.conf` có remote `gdrive` (Task 10 của kế hoạch 06).

Cách cài làm theo bước 7 "Sao lưu đêm" trong [README](../../README.md#triển-khai-máy-chủ) và Task 10 của
[kế hoạch 06](../planning/06-deploy-mona-dev-server.md). Chỉ dùng `db/backup.sh` và một file cron
`/etc/cron.d/customs-backup` chạy 02:00 giờ máy, không tạo script hay cron thứ hai.

**Có sao lưu** (lên `gdrive:Legal-AI-Backup/customs-backup-<ngày>.tgz`, tức nằm ngoài server):

- `lookup_confirmation`: phán quyết mã HS của chuyên viên (`pg_dump --data-only`).
- `legal_document`: các cột `number`, `verification`, `verified_by` (CSV).

**Không sao lưu:**

| Dữ liệu | Lý do / cách lấy lại |
|---|---|
| `conversation`, `conversation_turn`, `decision_log` | Cố ý: chứa dữ liệu cá nhân của bên thứ ba, chỉ được sống 30 ngày ([R14](../business-rules.md)) |
| Biểu thuế, kho pháp lý đã commit | Seed lại từ git (Task 6 của kế hoạch 06; kho pháp lý: mục 5 "Nạp lại kho pháp lý") |
| Nội dung văn bản do worker ingest nạp | Chỉ giữ trạng thái xác minh; nội dung phải yêu cầu ingest lại |
| `gazette_document` | Crawl lại, khoảng 1 giờ (2026-09-13: ~51 phút) |
| Session Zalo | Quét QR lại |
| `.env`, override | Dựng lại theo mục 3; token lấy mới bằng `claude setup-token` |

**Kiểm tra sau khi bật:**

```bash
tail -3 /var/log/customs-backup.log       # backup <ngày> ok
sudo -H rclone ls gdrive:Legal-AI-Backup/ | tail -3
```

Cách phục hồi: bước 7 của README.

## 8. Tạm dừng và gỡ bỏ

**Tạm dừng, giữ dữ liệu:**

```bash
cd /opt/docker-projects/customs-assistant
docker-compose stop            # hoặc một service: docker-compose stop zalo-bot
docker-compose start
docker stop customs-assistant-gazette-full   # container crawl chạy rời, dừng riêng nếu còn
```

Container đã `stop` sẽ không tự bật lại khi host khởi động lại (`unless-stopped`).

**Gỡ hẳn:**

```bash
bash /opt/docker-projects/customs-assistant/teardown.sh
```

Script nằm ngoài git, chỉ có trên server. Nó hỏi xác nhận, gõ `customs-assistant`. Script làm các việc sau:

- `docker-compose down -v --remove-orphans`: xoá container, network và **cả hai volume** `customs-assistant_db_data`,
  `customs-assistant_zalo_session`. DB và session Zalo mất theo.
- `docker rm -f customs-assistant-gazette-full` (container crawl chạy rời, compose không quản).
- Xoá 3 image `customs-assistant:local`, `legal-embedder:local`, `customs-assistant-ingest:local`.
- Xoá `/etc/cron.d/customs-backup` và `/var/log/customs-backup.log`.
- Xoá vhost và htpasswd nginx nếu có, rồi `nginx -t && nginx -s reload`.
- Xoá cert `bieuthue.ngocnhat.info` nếu có.
- Xoá thư mục stack (gồm `.env`, override, `DEPLOYED_COMMIT` và chính `teardown.sh`).
- Xoá build cache. Build cache là của cả host, lúc deploy chỉ có của dự án này; nếu về sau dự án khác cũng build trên máy thì kiểm tra trước.

Script không có `set -e`: một bước lỗi thì các bước sau vẫn chạy, nên đọc hết output.

Trước khi chạy:

- Đọc `cat teardown.sh` để chắc script vẫn khớp danh sách trên.
- Chạy `./db/backup.sh` nếu sao lưu đã bật.

Script không gỡ rclone. Nếu đã cài rclone ở Task 10 thì xoá tay:
`sudo rm /usr/bin/rclone /root/.config/rclone/rclone.conf`. Không có gì cần hoàn tác ở dịch vụ dùng chung của host.

## 9. Bẫy đã gặp

- **Compose v2.15.1 standalone không có `!reset`.** `ports` trong override bị **cộng dồn** chứ không thay thế. Vì vậy cổng
  host là biến ngay trong `docker-compose.yml` (`API_HOST_PORT`, `DB_HOST_PORT`, `EMBEDDER_HOST_PORT`) và đặt giá trị trong
  `.env`. Kiểm tra bằng `grep -n '\${' docker-compose.yml`. BuildKit vẫn build được dù không có plugin buildx.
- **Script qua `ssh <MONA_DEV_HOST> 'bash -s' <<'EOF'` bị nuốt stdin.** `docker-compose run`/`exec` đọc stdin nên nuốt
  phần còn lại của script: bash thoát giữa chừng, tiến trình nền bị mồ côi. Trong script dạng này, mọi
  `docker-compose run`/`exec` phải có `</dev/null`.
- **Image `api` build qua `migrate`.** Service `api` không có khối `build`, nên `docker-compose build api` không làm gì.
  `seed`, `seed-legal`, `zalo-bot` và container crawl dùng chung image này.
- **CLI `claude` nằm trong image** (`apps/api/Dockerfile`: `npm install -g @anthropic-ai/claude-code`). Không cài lên host,
  không mount. Nâng CLI thì build lại `migrate` rồi recreate `api zalo-bot`.
- **Sửa `.env` phải recreate**, `restart` không đủ (mục 3).
- **Giới hạn log nằm trong override.** Thêm service mới vào `docker-compose.yml` thì thêm
  luôn giới hạn log cho nó trong override, nếu không log sẽ phình không giới hạn.
- **Không có swap.** Giới hạn RAM từng container là thứ ngăn OOM lan sang dự án khác. Khi đổi giới hạn, kiểm tra lại
  `OOMKilled` (mục 4).
- **nginx chỉ `/opt/nginx/sbin/nginx -t && /opt/nginx/sbin/nginx -s reload`**, không restart. Không restart hay đổi cấu
  hình dịch vụ dùng chung trên host (CSDL, công cụ tìm kiếm, php-fpm, nginx) khi chưa có quản trị MONA đồng ý.
- **Không chạy lệnh dọn toàn host** (`docker system prune`, `docker image prune -a`, `docker volume prune`). Chúng xoá cả
  của dự án khác. Chỉ xoá theo tên hoặc theo nhãn `com.docker.compose.project=customs-assistant`; không xoá container
  hay volume nào không mang nhãn đó, kể cả khi trông như bỏ không.
- **`docker-compose config` không lọc in ra token.** Luôn `| grep`.
- **Lấy file nhị phân ra khỏi container:** `docker-compose exec` phải có `-T`, còn `docker exec` thì không thêm `-t`.

## 10. Số đo tham chiếu (2026-09-13)

| Việc | Số đo |
|---|---|
| Build `migrate embedder ingest` | ~5 phút; `legal-embedder:local` 6 GB, `customs-assistant:local` 823 MB, `customs-assistant-ingest:local` 206 MB |
| Embedder nạp model sau khi bật | ~2 phút |
| Seed biểu thuế | 30 giây, 172.962 dòng thuế |
| Seed pháp lý (nhúng qua embedder) | ~18 phút, 15 văn bản / 6.637 điều khoản / 2.806 chunk, 0 chunk thiếu vector |
| Embedder đỉnh lúc seed | 1,19 GiB (giới hạn 3,4 GiB), không OOM |
| RAM lúc ổn định, trước khi có token và bot | embedder 1,13 GiB · db 199 MiB · api 41 MiB · ingest 32 MiB · crawl Công báo ~100 MiB; cả stack ~1,5 GiB |
| RAM sau khi có token và bot (11:44 UTC, crawl đã thoát) | embedder ~1,3 GiB · api ~215 MiB · db ~191 MiB · zalo-bot ~58 MiB · ingest ~31 MiB |
| RAM trống của host | ~4,9 GB trước deploy, ~3,8 GB sau deploy (có crawl) |
| Truy hồi `/legal` không tổng hợp LLM | ~0,6 giây |
| Crawl Công báo đầy đủ | ~51 phút (10:43 → 11:34 UTC), 24.581 văn bản |

Số đo lệch nhiều so với bảng này là dấu hiệu cần điều tra: seed chậm gấp đôi, RAM embedder lúc ổn định vượt 2 GiB, hoặc `available` của host dưới 1 GB.

## 11. Kiến thức liên quan

- [Kế hoạch 06: triển khai lên server MONA dev](../planning/06-deploy-mona-dev-server.md): Task 8–10 còn dở
- [ADR 2026-09-13: host trên server dev dùng chung của MONA](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md)
- [README, mục Triển khai máy chủ](../../README.md#triển-khai-máy-chủ): sao lưu và phục hồi
- [Bộ nhớ hội thoại bot Zalo](zalo-bot-conversation-memory.md): bảng `conversation`, nơi lấy `thread_id`
- [Kho pháp luật tự mở rộng](legal-corpus-self-extension.md): `gazette_document`, worker ingest, trạng thái xác minh
- [Quy tắc nghiệp vụ](../business-rules.md): R14, lý do không sao lưu dữ liệu chat
