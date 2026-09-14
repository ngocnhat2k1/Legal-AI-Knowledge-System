---
type: architecture-decision
status: accepted
updated: 2026-09-14
related:
  - 2026-09-13-host-on-mona-dev-server.md
  - ../docs/mona-dev-server-operations.md
  - ../business-rules.md
  - ../../.github/workflows/ci-cd.yml
  - ../../deploy.sh
---

# Quyết định Kiến trúc: CI/CD trên GitHub, image build trên GitHub, server chỉ kéo về

Ngày: 2026-09-14

Trạng thái: Accepted — 2026-09-14, chủ dự án chọn: push `main` là deploy, đổi server phải dễ, không build trên server.
**Thay thế một phần** [ADR host trên server dev dùng chung của MONA](2026-09-13-host-on-mona-dev-server.md): quyết định 2
(đưa mã lên bằng `git archive`) và ràng buộc "không dùng registry, nên image phải build ngay trên server". Phần còn lại
của ADR đó giữ nguyên.

## Bối cảnh

- **Build trên máy dùng chung không bị giới hạn RAM.** `mem_limit` trong override chỉ áp cho container đang chạy, không áp
  cho `docker build`. Lúc kiểm (2026-09-14, buổi chiều) host chỉ còn 2,2 GiB `available` và không có swap. Build image app
  (`yarn install`, `nest build`, cài CLI), nhất là build embedder (torch + BGE-M3), có thể đẩy host tới OOM, và kernel có
  thể giết tiến trình của dự án khác.
- **Deploy tay hỏng hai lần trong một ngày (2026-09-14).** `tar` không xoá file đã xoá hay đổi tên trong git, nên
  `nest build` biên dịch file cũ và lỗi. `| tail` nuốt mã lỗi của build, nên api và bot bị recreate bằng image cũ. Người
  deploy còn phải tự tra bảng "file đổi thì build image nào".
- **Chưa có CI.** Test chỉ chạy trên máy dev. `db/seed/golden.spec.ts` (TASK-012) ghi sẵn cách chạy "In CI" nhưng chưa
  lần nào chạy tự động.
- **Repo công khai,** nên log GitHub Actions cũng công khai.
- Server tới được ghcr.io và GitHub, có git và `docker-compose` 2.15.1. Bản compose này ghi digest image vào nhãn
  `com.docker.compose.image` của container, nên `up -d` tự tạo lại container khi image đổi.

## Quyết định

1. **Một workflow,** `.github/workflows/ci-cd.yml`. Mọi PR và mọi push lên `main` chạy job test: `yarn build`, migrate và
   seed một Postgres pgvector tạm, Jest (golden set bật vì có `DATABASE_URL`), test bot, test parser. Commit chỉ đổi
   `.agent/**` hoặc `*.md` không chạy workflow.
2. **Image build trên GitHub** khi push lên `main`, đẩy lên ghcr.io ở chế độ private: `customs-assistant:<sha>` (cache
   build ở tag `cache`), `customs-assistant-ingest:<sha>`, `legal-embedder:<tree hash của apps/embedder>`. Embedder 6 GB
   chỉ build khi chưa có image cho tree đó, tức là khi thư mục đổi. Build bằng `docker buildx` có sẵn trên runner, không
   dùng action bên thứ ba; hai action chính chủ (`checkout`, `setup-node`) ghim theo SHA.
3. **Deploy qua SSH bằng một khoá chỉ làm được một việc.** Job deploy nằm trong environment `production`, và chỉ nhánh
   `main` đọc được secret của environment đó. Dòng khoá trong `authorized_keys` có `restrict,command="…/deploy.sh"`: khoá
   không mở được shell, còn script chỉ deploy commit đang ở đầu `main`. `GITHUB_TOKEN` của job (chỉ đọc package, hết hạn
   khi job xong) đi qua stdin. Script đăng nhập ghcr.io bằng một thư mục cấu hình tạm, không đụng `~/.docker/config.json`
   của user trên server.
4. **`deploy.sh` nằm trong repo.** Script checkout commit, kéo 3 image và gắn lại tên `:local` (nhờ vậy compose và các lệnh
   gõ tay trong runbook không phải đổi), chạy `migrate`, rồi `up -d --no-deps embedder api zalo-bot ingest`. Sau đó script
   kiểm api chạy đúng image vừa kéo và `/health` ok, ghi `DEPLOYED_COMMIT`, xoá image cũ không còn ai giữ. Server chưa có
   `DEPLOYED_COMMIT` (server mới) thì script chạy `up -d` cả chuỗi seed.
5. **Thư mục stack trên server là git clone.** `.env`, override, `teardown.sh` và `DEPLOYED_COMMIT` nằm ngoài git, checkout
   không đụng tới.
6. **Log công khai không làm lộ gì.** Job deploy che địa chỉ host bằng `::add-mask::`. `deploy.sh` không in log ứng dụng,
   vì log có thể chứa nội dung chat ([R14](../business-rules.md)); khi lỗi, script chỉ in trạng thái container.

## Các phương án đã cân nhắc

- **Giữ build trên server, chỉ tự động hoá phần gõ lệnh:** bác. Vẫn không giới hạn được RAM của build trên host dùng chung.
- **Self-hosted runner trên server:** bác. GitHub khuyên chỉ dùng self-hosted runner cho repo private, vì PR từ fork của repo
  công khai có thể chạy code trên máy đó. Runner cũng là thêm một tiến trình thường trú trên host dùng chung.
- **Server tự kéo theo cron:** GitHub không phải giữ khoá nào. Bác vì kết quả deploy không hiện trên GitHub, trong khi chủ
  dự án duyệt bằng cách thử bot ngay sau deploy nên cần biết lúc nào deploy xong. Cách này cũng thêm một cron trên host.
- **Khoá SSH thường, không có `command=`:** gọn hơn. Bác vì lộ secret là lộ một shell đầy quyền trên máy dùng chung.
- **Image public:** kéo về không cần token. Bác vì package đã public thì không đổi lại private được, và image chứa CLI Claude
  Code mà chưa ai kiểm điều khoản phân phối lại. Container registry hiện miễn phí cho cả image private.
- **`docker/build-push-action`, `docker/login-action`:** không cần. CLI `docker buildx` làm được việc đó, và job có quyền ghi
  package bớt được hai action bên thứ ba.

## Hệ quả

- **Đổi server:** cài Docker và git, `git clone`, tạo `.env` (và override nếu cần), thêm dòng khoá, sửa hai secret
  `DEPLOY_HOST` và `DEPLOY_KNOWN_HOSTS`, rồi Re-run job deploy. Server mới tự chạy cả chuỗi seed (~20 phút). Các bước chi
  tiết nằm ở runbook §5.
- **Server không build nữa.** Deploy chỉ tải image; embedder 6 GB chỉ tải lại khi `apps/embedder` đổi.
- **Lần deploy đầu thay embedder build trên server bằng bản build trên GitHub.** Cùng Dockerfile, các thư viện chính đã
  ghim, riêng `transformers` là phụ thuộc bắc cầu không ghim. Trong lúc embedder nạp model, `/legal` trả 400 khoảng 2 phút.
- **Mỗi push code lên `main` tạo lại `api`, `zalo-bot`, `ingest`,** và migration chạy tự động. Nạp lại dữ liệu
  (`FORCE_RESEED`, crawl Công báo) vẫn làm tay.
- **Quay lui bằng `git revert` rồi push.** Script từ chối commit không ở đầu `main`, nên re-run một run cũ không quay lui được.
- **CLI Claude Code đi theo cache build.** Muốn nâng CLI thì xoá phiên bản `cache` của package `customs-assistant`, rồi push.
- **Package trên ghcr.io tích dần theo từng commit.** Hiện miễn phí; GitHub hứa báo trước một tháng nếu bắt đầu tính phí.
- **Khi GitHub Actions không dùng được,** vẫn deploy tay kiểu cũ theo runbook §5, chấp nhận rủi ro RAM.
- **Push `main` giờ là deploy.** Mọi phiên làm việc trên repo phải biết điều này trước khi push.

## Links

- Vận hành: [Runbook server MONA dev §5](../docs/mona-dev-server-operations.md#5-deploy-bản-mới)
- Workflow: [`.github/workflows/ci-cd.yml`](../../.github/workflows/ci-cd.yml); script phía server: [`deploy.sh`](../../deploy.sh)
- ADR bị thay một phần: [Host trên server dev dùng chung của MONA](2026-09-13-host-on-mona-dev-server.md)
