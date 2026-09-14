---
type: planning
status: active
updated: 2026-09-14
related:
  - ../index.md
  - ../business-rules.md
---

# Nhật ký tiến độ

**Đây là điểm tiếp tục.** Agent tiếp nhận giữa chừng đọc file này trước tiên. Nó trả lời: đang ở đâu, việc gì
tiếp theo, và điều gì đã học được mà code không cho thấy.

## Tiếp tục từ đây

| | |
|---|---|
| **Đang chạy** | Server dev dùng chung của MONA (`<MONA_DEV_HOST>`; giá trị thật trong `.agent/local/mona-dev-server.md`), stack `/opt/docker-projects/customs-assistant`, cổng 127.0.0.1 3060/5435/8060: API + web UI + kho pháp lý 15 văn bản + worker ingest + bot Zalo (đã đăng nhập, `ALLOWED_THREADS` đã đặt), `/health` báo `llm: up`. Deploy mới nhất `7aff4ed` (2026-09-14, lần đầu qua CI/CD; mã gồm tầng bằng chứng `8fa69dc`). **Từ 2026-09-14 deploy bằng CI/CD:** push `main` → GitHub Actions test, build image lên ghcr.io, server chỉ kéo về ([runbook §5](../docs/mona-dev-server-operations.md#5-deploy-bản-mới)). **LLM đang hết hạn mức subscription** (`claude -p`: "org's monthly spend limit", reset 2026-09-15 09:00 UTC): legal RAG chỉ trả nguyên văn, router bot chạy đường dự phòng; `/health` vẫn báo `llm: up` vì chỉ kiểm token + binary. Vận hành: [runbook](../docs/mona-dev-server-operations.md). |
| **Việc tiếp theo** | (1) Deploy lát đầu Mảng 3 (`/legal` dùng tầng bằng chứng — commit sau `8fa69dc`) qua CI/CD, rồi kiểm trên Zalo khi LLM có lại hạn mức (sau 2026-09-15 09:00 UTC). (2) Mảng 3 đầy đủ của [kế hoạch 05](05-bot-parity-tasks.md): `POST /answer`. |
| **Chờ chủ dự án** | (1) chat thử bot sau deploy `69d1ab4`, báo chỗ chưa ổn; (2) có nạp 4 nghị định biểu thuế còn thiếu (144/2024, 108/2025, 199/2025, 201/2026) không; (3) đối chiếu PDF Công báo EVFTA 8711.20.x (9,3% năm 2026 → 20,4% năm 2027); (4) quyết corpus sinh lại theo từng văn bản và sửa `gazette_issue` 128/2020/NĐ-CP — [kế hoạch 05](05-bot-parity-tasks.md) Task 5; (5) [kế hoạch 06](06-deploy-mona-dev-server.md): kiểm thử bot trong nhóm, domain + mật khẩu basic auth, `rclone.conf`; (6) thêm 16 nguồn mới vào notebook (TASK-021; sau mỗi lần đẩy `verify_drive.py` phải ra `0 lệch`); (7) các câu hỏi mở của phiên 2026-09-14 bên dưới. |
| **Việc của agent** | — (container seed-evidence và API nháp đã gỡ 2026-09-14). |
| **Đã mất vĩnh viễn** | VPS Contabo bị xoá (xác nhận 2026-09-13): `lookup_confirmation` (phán quyết chuyên viên), session Zalo, `.env` cũ. Bộ nhớ áp mã HS học lại từ đầu. |

## Trạng thái công việc

Giai đoạn 0–8 **xong**: golden set 249/249, schema bitemporal, loader NĐ 26/2023 + 4 FTA, API tra cứu + độ cũ,
legal RAG, bộ nhớ hội thoại, kho pháp luật tự mở rộng (TASK-001…015). Tiêu chí nghiệm thu từng việc:
`.agent/planning/01-task-list.md` trong git `11275bc`.

### Giai đoạn 9 — đường ống hộp thư đến (chi tiết ở [04-inbox-ingest-tasks.md](04-inbox-ingest-tasks.md))

| Công việc | Trạng thái | Ghi chú |
|---|---|---|
| TASK-016 — Chuyển bộ sinh notebook vào repo + render tất định | ✅ xong | `research/inbox-loader/`, render tất định |
| TASK-017 — `triage.py` phân lớp + dò Công báo | ✅ xong | [R15](../business-rules.md): ô số trống là nghi vấn, không phải kết luận |
| TASK-018 — Parse hai nhánh + cổng `\x07` | ✅ xong | 4 văn bản đợt này là danh mục dạng bảng |
| TASK-019 — `render_notebook.py` Docs-safe + gộp 30→15 nguồn | ✅ xong | Bỏ 152 khối `<details>`; mỗi tiêu đề mang số hiệu |
| TASK-020 — Manifest + rclone | ✅ xong | `hash_exported`/`hash_pushed` tách bạch; giữ `fileId` |
| TASK-021 — Nạp 20 tài liệu + chuyển notebook sang Google Docs | 🟡 chờ chủ dự án thêm nguồn | Lần upload lại **cuối cùng** |
| TASK-022 — Vá snapshot drizzle 0007–0009, mở enum | ⛔ bị chặn | Hoãn có chủ đích; công văn + lớp C chỉ vào notebook cho tới lúc đó |

### Kế hoạch 05–07

| Kế hoạch | Trạng thái | Ghi chú |
|---|---|---|
| [05 — Bot ngang notebook](05-bot-parity-tasks.md) | 🟡 đang tiến hành | Mảng 1 đã commit (còn Task 5 Bước 6–9 chờ chủ dự án, Task 9). Mảng 2 xong, deploy `8fa69dc` (1.989 mục). Mảng 3: lát `/legal` + bằng chứng đã code, chưa deploy; `POST /answer` chưa làm. Mảng 4 chưa làm |
| [06 — Triển khai server MONA](06-deploy-mona-dev-server.md) | 🟡 còn Task 8, 9 Step 5, 10 | Chờ chủ dự án |
| 07 — Trình bày kiểu notebook trên Zalo | ✅ deploy `69d1ab4` | Kế hoạch trong git `11275bc` |

Chú thích: ✅ xong · 🟡 đang tiến hành · 🔲 chưa làm · ⛔ bị chặn

## Quyết định đã đưa ra

Mọi quyết định đã chốt nằm trong [danh sách ADR](../index.md#quyết-định). Chỉ mở lại một ADR khi có bằng chứng
mới, và thay nó bằng một ADR mới.

## Nhật ký phiên làm việc

Thêm một mục mới ở **đầu** phần này vào cuối mỗi phiên làm việc. Giữ các mục
ngắn gọn. Ghi lại cái gì đã thay đổi, cái gì đã học được, và cái gì mà agent tiếp theo sẽ khám phá lại một cách khó
khăn. **Bất ngờ và ngõ cụt là thứ giá trị nhất ở đây** — một kế hoạch cho bạn biết cái gì được
dự định, chỉ cái này cho bạn biết địa hình thực sự đã làm gì.

---

### 2026-09-14 (chiều) — Mảng 2 xong trên server; lát đầu Mảng 3: `/legal` dùng tầng bằng chứng (chưa deploy)

- **Tầng LLM:** chủ dự án chốt giữ `claude -p` thuê bao (khớp ADR 2026-09-13: tối đa 4 lần gọi/lượt, 120 s).
- **Đo embed trên server (Task 6 Bước 6):** lô 32 mục dài 170,7 s (5,3 s/mục), RAM đỉnh embedder 2.580 MB, 3,46 ký tự/token → `EMBED_CHARS = 6800`. Đo có bộ canh RAM host (dừng khi < 700 MB) vì server dùng chung còn ~2,3 GB.
- **Mảng 2 (`8fa69dc`, đã deploy):** migration 0011 `evidence_section`; `db/seed/evidence-build.ts` sinh 1.989 mục từ extract đã commit (+10 mục nghị định biểu thuế lúc seed); seed upsert tiếp tục được. Kiểm migration trên DB nháp (rỗng và ở 0010), chạy seed 100 s rồi ngắt, chạy lại đúng "256 sections unchanged". Seed production 73,5 phút, 1.989/1.989 có vector.
- **Lát đầu Mảng 3 (`e17e0a1`, `2ee0c60`, `eaae4ec`, `19da3b0` — CHƯA deploy):** `GET /legal` truy hồi thêm bằng chứng, nhãn nguồn vào prompt và dòng nguồn của bot. Trên API nháp với dữ liệu thật: NĐ 43/2017 từ "chưa có văn bản" → trả mục tình trạng; NĐ 336/2026 từ từ chối → mục tình trạng nhãn "CHƯA CÓ HIỆU LỰC — từ 15/10/2026". Chi tiết và hai bài học (mục `status` văn bản được nêu luôn đi kèm; cổng khoảng cách riêng cho bằng chứng) ở [kế hoạch 05](05-bot-parity-tasks.md) Mảng 3.
- **Bất ngờ:** (1) parser `simple` cắt `69/2018/NĐ-CP` thành `69/2018/n`, `đ`, `đ-cp`, `cp` — tìm số hiệu bằng từ khoá không khớp (spec §3.3). (2) giữa lúc seed chạy, thư mục stack thành git clone của phiên CI/CD (mục bên dưới); từ nay deploy qua push `main`, không `git archive | tar` vào thư mục stack.
- **Kiểm:** Jest 122, bot 62, parser inbox 62, `tsc` sạch (trừ lỗi `import.meta` có sẵn).
- **LLM vẫn hết hạn mức tới 2026-09-15 09:00 UTC:** mọi kiểm trên API nháp là chế độ chỉ trích dẫn; văn xuôi có dùng bằng chứng chưa thấy được.

### 2026-09-14 (chiều) — CI/CD trên GitHub: test mọi PR/push, image build trên GitHub, server chỉ kéo về; deploy đầu `7aff4ed`

- **Vì sao:** chủ dự án muốn push `main` là deploy và đổi server phải dễ, rồi hỏi build trên server có làm quá tải không.
  Có: `docker build` không chịu `mem_limit` của override, còn host lúc kiểm chỉ có 2,2 GiB `available`, không swap. Deploy
  tay còn dính bẫy `tar` không xoá file cũ và `| tail` nuốt mã lỗi.
- **Đã làm:** `.github/workflows/ci-cd.yml` (test → images → deploy), `deploy.sh`,
  [ADR](../architecture-decisions/2026-09-14-ci-cd-build-on-github-pull-on-server.md), runbook §5 viết lại (CD, khoá và
  secret, chuyển server, deploy tay dự phòng). Trên server: thư mục stack thành git clone, thêm dòng khoá `restrict,command=…/deploy.sh` vào `authorized_keys`. Trên GitHub: environment `production`
  chỉ cho `main`, 3 secret `DEPLOY_*`.
- **Kiểm trước khi push:** actionlint và shellcheck sạch. 7 nhánh của `deploy.sh` chạy với docker giả: SHA sai hoặc cờ chèn
  qua ssh thì thoát 2; SHA không ở đầu `main` thì thoát 0, không làm gì; server cũ và server mới đi đúng chuỗi lệnh; api
  chạy image cũ thì thoát 1, không ghi `DEPLOYED_COMMIT`; thiếu token thì dừng trước mọi lệnh compose. Job test chạy thử
  trên clone sạch: `c75e8ca` và `8fa69dc` đều xanh (Jest 97 và 116, bot 61, parser 3 bộ). Khoá mới thử từ máy dev: không
  mở được shell, lệnh tuỳ ý bị thay bằng `deploy.sh`.
- **Lần chạy đầu:** run trên `f94b2aa` đỏ ở Jest. `db/seed/fta-extracts.spec.ts` đọc commit mốc `19b6222` bằng `git show`
  và cố ý báo lỗi khi thiếu mốc, mà `actions/checkout` mặc định chỉ lấy một commit. Đã tái hiện trên clone depth 1 (4 fail;
  sau `--unshallow` 15/15 qua) và sửa bằng `fetch-depth: 0` (`7aff4ed`). Job images và deploy tự bỏ qua nên server không bị
  đụng. Golden set qua ngay lần đầu với DB seed trên CI. Run trên `7aff4ed` xanh: test 1,5 phút, images 7 phút (embedder
  5,5 phút), deploy 6,5 phút (phần lớn là kéo embedder 6 GB).
- **Kiểm sau deploy:** `DEPLOYED_COMMIT` và git HEAD trên server đều là `7aff4ed`; api, zalo-bot, ingest, embedder chạy đúng
  image vừa kéo, không OOM; `/health` ok (`llm: up`), `/tariff/search` 200, `/legal` 200; bot khôi phục session, không cần
  QR; image embedder cũ 6 GB đã được dọn. Log công khai của job deploy không có địa chỉ host.
- **Bất ngờ:** một phiên khác commit `8fa69dc` (tầng bằng chứng, migration 0011) lúc 14:34 ngay trong working tree này,
  chưa push, rồi tự deploy nó lên server lúc 14:39 bằng `git archive` và chạy `seed-evidence`. Chín phút sau, lệnh
  `git checkout -f` biến thư mục stack thành git clone của phiên này đè các file đã track của `8fa69dc` về `c75e8ca`
  (container đang chạy không bị ảnh hưởng); đã khôi phục bằng `git archive 8fa69dc`. Commit CI/CD soạn trong git worktree
  riêng để không đụng working tree của phiên kia. Chủ dự án chọn đặt nó lên trên `8fa69dc` và push sau khi `seed-evidence`
  xong, để lần deploy đầu chạy đúng mã đang chạy và không thay embedder giữa lúc seed. Phiên kia chỉ cần `git pull --rebase`.

### 2026-09-14 (sau deploy) — Dọn over-engineering: code gọn hơn, markdown từ ~20k còn ~12k dòng; đã deploy `40fc5b3`

- **Deploy:** `main` fast-forward và push (`49ff39b`, `40fc5b3`); image cũ giữ ở `customs-assistant:rollback-11275bc`. Lần build đầu lỗi vì `shared/adapters/embedding/embedding.service.ts` cũ còn trên server (git coi là đổi tên nên không vào danh sách xoá) và `| tail` nuốt mã lỗi, nên api + bot bị recreate bằng image cũ — không mất gì, chỉ khởi động lại. Gỡ file, build lại: api + bot chạy image `6bf7e74`. Kiểm trên server: `/health` ok, web UI `/` 200, 8481.80.99 CN đúng (ACFTA 0% được hưởng, 3 biểu khác ẩn), 16 văn bản pháp lý, `/ingest/status` và `DELETE /conversation` 404, bot khôi phục session; chạy khô 2 câu trong container bot đúng. Runbook §5 đã ghi hai bẫy này.
- **Phát hiện khi kiểm:** subscription Claude hết hạn mức (reset 2026-09-15 09:00 UTC) — xem "Tiếp tục từ đây". Kho pháp lý có thêm 69/2018/NĐ-CP do bot tự nạp (`auto_unverified`).

- **Code:** adapter DB 4 file gộp thành `shared/adapters/database/index.ts` (đóng kết nối qua `db.$client`); `EmbeddingService` chuyển vào `modules/legal/`; bỏ `@nestjs/config` (`process.loadEnvFile()` trong `main.ts`), `@nestjs/serve-static` (`useStaticAssets`), `qrcode-terminal`, `ts-node`, `tsconfig-paths`; `probeLlm` dò một lần; bỏ `GET /ingest/status`, `DELETE /conversation` (không ai gọi) và nhánh `EVAL_ANSWER_ENDPOINT` (chưa có `POST /answer`); bot bỏ `corpusHas` vì API đã trả `missingDoc`.
- **Tài liệu:** xoá kế hoạch đã xong (00, 01, 03, 07), các README chỉ mục, `project-rules.md`, thư mục rỗng, script của spike task-003/004/007/012; kế hoạch 05 và 06 chỉ còn việc dở; nhật ký cũ về git. Viết lại AGENTS.md, index, README, code-organization, naming-conventions. Quy tắc ngôn ngữ chỉ còn ở AGENTS.md (project-context từng ghi "tài liệu tiếng Anh").
- **Kiểm:** `tsc` sạch, Jest 97, bot 61, parser 117, `yarn build` OK, 0 link chết. Chạy thử bản build với DB giả: `/` trả web UI, `/health` 503 đúng, `/tariff` sai tham số 400, đường lạ 404.
- **Cố ý không làm:** bỏ hẳn Drizzle trong API — các spec dựng lại SQL bằng `PgDialect` để kiểm truy vấn, đổi sang postgres.js phải viết lại mọi fake DB. Giữ §5b của spec bot (code trích dẫn từng mục) và 17 bẫy trong `inbox-ingest-workflow.md`.
- **Bất ngờ:** bỏ bước tự kiểm kho của bot làm mất câu "Không gọi được dịch vụ tra cứu văn bản" khi API sập — test hồi quy bắt được, đã đưa câu đó vào nhánh chung (sau bước lấy nguyên văn điều khoản, vì embedder khởi động cũng làm `/legal` trả lỗi).

### 2026-09-14 — Trình bày kiểu notebook trên Zalo: kế hoạch 07 đã code, kiểm và deploy (`69d1ab4`)

- **Deploy (2026-09-14, `69d1ab4`):** kiểm trước bằng API nháp đọc CSDL thật — 8481.80.99 CN: ACFTA `originEligible: true`, AANZFTA `false`; 69/2018/NĐ-CP khớp `exact`; bot chạy khô 6 câu mẫu trên dữ liệu thật, 0 lỗi dịch vụ. Deploy: giữ image cũ `customs-assistant:rollback-e823678`, build, tạo lại API + bot (session Zalo và allowlist giữ nguyên), `/health` ok. Chạy khô trong container bot thật: 6/6 câu, tin dài 338–1.232 ký tự, câu pháp lý dài tách 2 tin (1.127 + 761). Sửa thêm ngay trước deploy: `parseQuery` đọc mã xuất xứ viết hoa ("8481.80.99 TQ" trước đây bị coi là không nêu xuất xứ).
- **Giới hạn còn lại:** (1) danh sách ứng viên HS in "MFN —" từ 0h đến 7h giờ Việt Nam (`/tariff/search` dùng ngày UTC); (2) mã xuất xứ viết thường ("tq") không được đọc — gõ "TQ" hoặc tên nước; (3) dòng cam báo 4 nghị định biểu thuế còn hiệu lực chưa nạp (144/2024, 108/2025, 199/2025, 201/2026) — thiếu hụt dữ liệu có từ trước, nay bot nói ra; (4) câu "chưa có toàn văn" của văn bản ngoài kho còn thừa dấu chấm ("..").
- **Chờ chủ dự án:** chat thử trong nhóm và báo chỗ chưa ổn; quyết có nạp 4 nghị định biểu thuế còn thiếu không. Sau đó: Mảng 2 của kế hoạch 05 (nạp 32 nguồn notebook) để giảm câu "không biết".

- **Đã làm:** thực thi kế hoạch 07 (git `11275bc`) (spec §5b, [ADR](../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md)) theo từng task, mỗi task một vòng rà soát và sửa, commit theo đường dẫn cụ thể, không push. BASE `853d09d`.
  - **Bộ trình bày** `apps/zalo-bot/render.mjs` (`276c866`, `8616092`): `Line[]` → `{msg, styles}[]`, gộp mọi dòng `warn` thành một dòng cam, tách tin 1.800 ký tự; `md()` chỉ sinh đậm/nghiêng/danh sách, số khoản nguồn không liền mạch giữ nguyên chữ (R10).
  - **API** (`148b983`, `ff576b3`): bảng thành viên FTA có cổng `verifiedHash` (R18), `PreferentialView.rate`/`originEligible`, `TariffResponse.ftaMembership`, dòng phạm vi kho `StalenessView` đọc bảng `decree` (R8), bỏ `DATA_SNAPSHOT_DATE`; web UI tô xanh theo `originEligible`.
  - **Khối thuế** `formatAnswer` (`8a42c61`, `39f59d4`): dạng A/B/C, màu do dữ liệu quyết, ẩn biểu mà xuất xứ không phải thành viên (kể cả `by_subline`), không bao giờ in một con số cho dòng `by_subline`.
  - **Ứng viên HS** `tariffByClues` (`9aa4d02`, `0d2364b`): top-3 không màu, mọi văn xuôi LLM qua `sanitizeLead` neo theo ranh giới chữ số (R1, R2).
  - **Pháp luật** (`97bfb5c`, `28a22f9`, `7c689b2`, `44f0297`): `[n]` đánh theo vị trí và kiểm số liệu từng câu (`numberMarkers`), `sourceLines`, khớp đúng số hiệu đầy đủ (sửa 69/2018, giữ chữ số cơ quan QH13), cảnh báo điều khoản nạp tự động chưa xác minh.
  - **Đường gửi** (`1c950cb`, `da5b3ed`): mọi câu trả lời đi qua `render()`, chỉ tin đầu quote, tin không style gửi `{ msg }`.
  - **Chạy khô** `dry-run.mjs` (`3b793ee`); sửa sau rà soát cuối (`f5e0348`, `952f15d`): số liệu `[n]` khớp theo ranh giới chữ số, ngày tra theo giờ Việt Nam, số hiệu router tự thêm cơ quan chỉ dùng khi người dùng viết.
- **Số liệu:** bot `corepack yarn test:bot` 25 → **62/62**; Jest tariff + legal + `apps/eval` 30 → **68/68**; `tsc --noEmit -p apps/api/tsconfig.app.json` sạch; `yarn build` sạch. Kế hoạch ghi 50 và 62 — các vòng sửa thêm test. Độ dài tin của sáu câu mẫu trên dữ liệu thật và số câu tách tin: **chờ Task 8 bước 5** (chưa có CSDL cục bộ đã seed). Bản xem trước tại máy dùng dữ liệu giả (không phải số đo thật): câu 1 950, câu 2 1.070, câu 3 717, câu 6 1.208 ký tự, đều một tin; câu 4–5 cần router và API thật.
- **Bất ngờ:**
  - Bản nháp Task 2 bước 4a để trùng `import { sql }` (TS2300) — phát hiện khi áp thử kế hoạch lên bản sao, sửa trước khi thực thi.
  - `verifiedHash` ghi ở commit chuẩn bị theo phê duyệt `853a01f` (Trần Ngọc Nhật, 2026-09-13); agent không đụng `verifiedBy`/`verifiedAt`.
  - Dòng phạm vi kho ngày 13/09/2026 là 26/2023/NĐ-CP, không phải 72/2026 như câu mẫu (72/2026 hết hiệu lực 30/04/2026).
  - `zca-js` 2.1.2 gửi cả `styles: []` thành `textProperties` → tin không style phải gửi `{ msg }`.
  - Kiểm con số bằng chuỗi con cho qua "0%" trong "10%", "30 ngày" trong "130 ngày" — ở cả `numberMarkers` (API) lẫn `sanitizeLead` (bot); cả hai nay neo theo ranh giới chữ số.
  - Ghi chú của LLM đọc ảnh lọt vào câu trả lời không qua cổng ("khoảng 20%") — nay chặn ngay ở `answerImage`.
  - Promise đọc bảng `decree` được await sau truy vấn thứ hai: một lỗi CSDL thành unhandled rejection (chết process trên Node 22) — đã sửa.
  - Bot lấy ngày UTC: 00:00–07:00 giờ Việt Nam tra theo ngày hôm trước. Đã đổi sang `todayVN`; riêng menu ứng viên chỉ in MFN khi ngày tra trùng ngày UTC vì `/tariff/search` tính theo `CURRENT_DATE` của Postgres.
  - `/legal` trả lời rỗng vì API không gọi được bị đọc thành "không có trên Công báo" — nay báo "Không gọi được dịch vụ tra cứu văn bản".
  - Chưa sửa (có từ trước): "8481.80.99 TQ" không đọc được xuất xứ vì `parseQuery` hạ chữ thường trước `detectOrigin` (chỉ nhận mã in hoa); tên nước vẫn đọc được.
- **Chờ chủ dự án:**
  - Kiểm trên điện thoại + Zalo PC sau deploy theo danh sách Task 8 bước 6 (đậm/nghiêng/chữ nhỏ, đúng một dòng cam, một chữ xanh ở câu 1, câu tách hai tin, 69/2018).
  - Dòng `excluded` của biểu mà xuất xứ không phải thành viên in đỏ theo chữ spec — giữ hay ẩn?
  - R19 trong ADR chưa duyệt (ADR vẫn `Proposed`); có in "bảng thành viên do … xác nhận" ở dòng nguồn không (mặc định không).
  - Độ dài trích đoạn 140–480 ký tự khi đã có câu trả lời — quyết sau khi đọc trên Zalo.
  - Có sửa việc đọc mã xuất xứ "TQ"/"CN" không (đổi tập xuất xứ đọc được, cần rà riêng).
  - Nghị định sửa đổi biểu FTA sau 30/12/2022 chưa đối chiếu với bảng thành viên (đã biết khi duyệt).

### 2026-09-13 (đêm) — Dòng 10 số FTA + EVFTA chỉ nạp Phụ lục II: đã commit (`21ddcb4`) và deploy

- **Đã làm:** `parse_fta.py` ghi mã cha `rates: []` + `sublines` (dòng 10 số theo thứ tự nghị định); EVFTA chỉ đọc Phụ lục II; số cột thuế cố định theo biểu, thiếu **hoặc thừa** ô thuế → lỗi (chỉ tha 8 ô `*` rác trước "Phụ lục III"); seed dừng khi file FTA còn mã lặp; migration `0010_tariff_by_subline` (`rate_type = 'by_subline'`, không mang con số); API `PreferentialView.sublines` + câu liệt kê từng dòng 10 số. Quyết định và bằng chứng nguyên văn: [ADR](../architecture-decisions/2026-09-13-fta-national-sublines.md). Kế hoạch 05 dời `evidence_section` sang `0011`.
- **Số liệu:** mã cha ACFTA 34 (10 `by_subline`), AANZFTA 8 (8), ATIGA 0, EVFTA 58 (256 khoảng năm `by_subline`). EVFTA: 553 mã trước đây mang thuế **xuất khẩu** Phụ lục I nay mang hàng Phụ lục II (464 vector khác; 408 mã năm 2026 đang nạp cao hơn mức nhập khẩu thật). Thuế XK ưu đãi EVFTA không nạp ở đâu. Mọi mã khác không đổi một byte so với `19b6222` (`db/seed/fta-extracts.spec.ts`). Golden set: không ca nào rơi vào mã cha; hai ca MFN (imp-101, imp-151) nằm trên mã thuộc 553 mã EVFTA nhưng so biểu MFN — không đổi.
- **Kiểm chứng:** chuỗi migration 0000–0010 nguyên bản (pgvector 0.8.0 trên PG 16 cục bộ) chạy sạch từ CSDL rỗng và trên CSDL đã ở 0009 có dữ liệu HEAD; golden 3/3 cả hai. `ALTER TYPE … ADD VALUE` chạy được trong transaction chung của drizzle vì CHECK so sánh `rate_type::text`.
- **Deploy (xong 2026-09-13 khuya):** kiểm trước trên CSDL nháp dựng riêng trên server — migrate bằng image đang chạy lên 0009 rồi image mới áp 0010, nạp biểu thuế, golden + kiểm dữ liệu trích 18/18, API nháp đúng, gỡ sạch — rồi deploy thật: build 12 giây, migrate 10 → 11, nạp lại biểu thuế 28 giây (172.967 mức thuế sống; 274 khoảng `by_subline`; loại trừ ACFTA 3.154; sổ xác nhận 0 dòng, không ảnh hưởng). Golden + kiểm dữ liệu trích 18/18 trên CSDL thật. API thật: 1211.20.90 EVFTA 2026 = 5% (trước là 0% lấy nhầm thuế XK); 1601.00.10 và 0307.22.00 liệt kê từng dòng 10 số; 0901.11.20 CN vẫn không áp dụng. Lưu ý vận hành: Seed thường **bỏ qua** khi `tariff_rate` đã có dòng: chỉ migrate thì dữ liệu cũ (thuế XK cho 553 mã EVFTA, thuế dòng 10 số đầu cho mã cha) vẫn phục vụ.
- **Chờ chủ dự án:** EVFTA 8711.20.13, .14, .15, .16, .19.90 (dòng 10 số), .94, .95 in `9,3` năm 2026 rồi `20,4` năm 2027 — dòng duy nhất trong biểu có thuế tăng lại. Dữ liệu chép đúng ô nghị định; cần đối chiếu bản PDF Công báo. Nếu đúng, mã cha 8711.20.19 năm 2027 mang 20,4% (hai dòng 10 số cùng mức).
- **Bài học:** hai kiểu im lặng cùng loại R3 — seed "giữ hàng đầu tiên" che cả một biểu khác (xuất khẩu) từ 2026-07-18; parser cắt ô thuế về đúng số cột che ô rác cuối bảng. Khi commit: stage từng file; `.agent/docs/bot-answer-parity-design.md` (trừ dòng đổi 0010→0011) và ADR Zalo rich-text là của phiên khác.

### 2026-09-13 (khuya) — Bot báo sai ưu đãi ACFTA cho nước bị loại trừ theo dòng: đã sửa, đã deploy

- **Phát hiện:** khi trích bảng nước thành viên FTA, agent thấy NĐ 118/2022/NĐ-CP (ACFTA) có cột **"Nước không được hưởng ưu đãi" theo từng dòng thuế** (Điều 3 khoản 5). `research/fta-loader/parse_fta.py` bỏ cột này nên `/tariff` trả "ACFTA 0% nếu có C/O form E" cho cả nước bị loại trừ. Đã kiểm trên API thật: 0901.11.20 (cà phê Arabica) loại trừ MM, TH, CN nhưng bot báo ACFTA 0% cho hàng Trung Quốc — đúng phải là MFN 15%. Quy mô: 3.154 dòng 8 số có loại trừ; riêng Trung Quốc 509 dòng bị báo ưu đãi, 446 dòng 0%. AANZFTA, ATIGA, EVFTA chỉ có ký hiệu `*`, không có cột này.
- **Sửa (`19eda99`):** bộ nạp đọc cột loại trừ và các dòng 10 số (chỉ hiện thành ghi chú, không áp cho cả mã 8 số; riêng 4011.80.31/39/40 mọi dòng 10 số đều loại trừ ID nên áp cả mã); seed ghi `tariff_rate.conditions`; API trả `excludedOrigins`, `originExcluded` và câu "Không áp dụng … áp mức MFN" không in con số ưu đãi; `TQ`→`CN`, `UK`→`GB`, xuất xứ không đọc được bị từ chối (400) để không lặng lẽ bỏ qua loại trừ và thuế chống bán phá giá; bot in `⛔`. Thuế suất không đổi: 0 khác biệt trên 11.414 dòng; một agent tự trích lại toàn bộ cột loại trừ từ nghị định: 0 lệch.
- **Deploy:** build 27 giây, nạp lại biểu thuế 29 giây (172.962 mức thuế sống; sổ xác nhận 0 dòng, không bảng nào khác bị ảnh hưởng). API thật: CN/TQ trên 0901.11.20 → không áp dụng; không nêu xuất xứ → liệt kê nước bị loại trừ; 8481.80.99 CN vẫn 0%; 4011.80.31 ID → không áp dụng; 1211.60.00 MM → ghi chú dòng 10 số; "Trung Quốc" → 400. Golden trên CSDL thật qua đường hầm SSH: 9/9 — test "văn bản ngoài kho" đã lỗi thời từ khi có 25/VBHN-BTC (bản hợp nhất TT 38/2015), đổi ví dụ sang 69/2018/NĐ-CP và thêm kiểm TT 38/2015 → 25/VBHN-BTC.
- **Bài học:** golden biểu thuế 249/249 không bắt được lỗi này — cả 25 tờ khai ACFTA trong golden set là hàng Trung Quốc ở dòng không bị loại trừ. Chỉ đối chiếu dữ liệu với chính văn bản gốc mới lộ ra.
- **Lỗi cũ lộ ra, chờ chủ dự án quyết:** mã 8 số được nghị định chia dòng 10 số đang mang thuế suất của dòng 10 số đầu tiên, các dòng khác có thể khác mức (ACFTA 10 mã, AANZFTA 8, EVFTA ít nhất 139 trên 2/16 phần văn bản đã xem). Ví dụ 1601.00.10: dòng .10 là 0%, dòng .90 là 5%.
- **Bảng nước thành viên:** `db/seed/data/fta-members.json` **đã được Trần Ngọc Nhật duyệt 2026-09-13** — [phiếu đối chiếu](../review-history/2026-09-13-fta-members-verification.md). Chưa code nào đọc; phần trình bày kiểu notebook sẽ dùng nó để lọc FTA theo xuất xứ.

### 2026-09-13 (tối) — Host lại trên server dev dùng chung của MONA: API + kho pháp lý chạy, LLM up, bot đã đăng nhập

- **Chủ dự án thử bot:** trả lời "quá cứng nhắc, nhiều câu không biết"; văn phong và trình bày khác notebook. Nguyên nhân: server chạy bot cũ — Mảng 2 (nạp 32 nguồn notebook vào CSDL) và Mảng 3 (đường trả lời mới) chưa xây. Baseline trên server (kho cũ, `/legal`): pháp luật recall@5 90%, HS top-1 20% / top-3 27,3%, notebook 1/14, nhóm an toàn 0/8.
- **Lỗi tìm ra:** hỏi "Nghị định 69/2018/NĐ-CP còn áp dụng không" → bot nói không tìm thấy rồi liệt kê chính văn bản đó dưới "cùng số nhưng của cơ quan khác". `answerLegal` gọi API với `doc: ref.core` (mất đuôi `/NĐ-CP`), API chỉ khớp theo đầu số (`gazetteMatchKind: similar`); gọi thẳng API bằng câu hỏi thì ra `exact`.
- **Quyết định mới:** làm trình bày kiểu notebook + định dạng Zalo trước — `zca-js` 2.1.2 gửi được đậm, nghiêng, gạch chân, 4 màu, cỡ chữ, danh sách qua `styles`; màu do dữ liệu quyết, không để mô hình tô — rồi Mảng 2 ngay sau. Đã gửi một tin mẫu định dạng vào nhóm để kiểm hiển thị trên điện thoại và máy tính.
- **Chủ dự án chốt thêm (tối 2026-09-13):** (1) tin mẫu định dạng hiện đúng trên cả điện thoại lẫn Zalo PC; (2) lọc FTA theo xuất xứ bằng **bảng nước thành viên trích từ 4 nghị định biểu thuế** (118/2022 ACFTA, 121/2022 AANZFTA, 126/2022 ATIGA, 116/2022 EVFTA) — file `db/seed/data/fta-members.json` ở trạng thái `verifiedBy: null`, **chủ dự án duyệt trước khi bot dùng** ([R18](../business-rules.md)); chưa duyệt thì không lọc, không tô xanh; (3) cảnh báo độ trễ Công báo đổi sang mốc **văn bản biểu thuế mới nhất đã nạp** lấy từ bảng `decree`, bỏ cách suy từ thời điểm seed (`DATA_SNAPSHOT_DATE` trống → `max(recorded_at)`).
- **Đang làm:** workflow viết phần bổ sung spec §5b + ADR + kế hoạch 07 (có vòng soi an toàn / trải nghiệm / khả năng triển khai), song song một agent trích bảng nước thành viên FTA. Chưa sửa code bot. `render.mjs` làm một lần, Mảng 3 dùng lại.

- **Commit:** `e332360` (parser + công cụ diff/merge), `ad04ef2` (eval notebook), `41ac65a` (chuẩn bị deploy: CLI trong image, cổng tham số, sao lưu). Tài liệu (spec, ADR, kế hoạch 05–06, runbook) commit sau khi làm sạch chi tiết server — repo GitHub public. Chưa push GitHub.
- **Cô lập trên máy dùng chung:** một compose project `customs-assistant`; không cài gì lên host; không đụng dịch vụ dùng chung trên host; giới hạn RAM cứng từng container thay cho hạ bộ nhớ dịch vụ dùng chung hay thêm swap; log 10m×3. Gỡ hẳn bằng `teardown.sh` trong thư mục stack.
- **Số đo:** build ~5 phút; seed thuế 30 giây; seed pháp lý ~18 phút, embedder đỉnh 1,19 GiB/3,4 GiB; lúc ổn định (trước khi có token và bot) cả stack ~1,5 GiB, host còn 3,8 GB available; sau khi có token và bot (11:44 UTC) api ~215 MiB, zalo-bot ~58 MiB, embedder ~1,3 GiB. Crawl Công báo 10:43 → 11:34 UTC (~51 phút), 24.581 văn bản — nhanh hơn nhiều so với ước tính ~8 giờ.
- **Không ảnh hưởng:** các site khác giữ nguyên mã HTTP so với baseline; container của team khác vẫn Up, không restart; không OOM.
- **Token + bot:** ~11:23 UTC chủ dự án gõ `CLAUDE_CODE_OAUTH_TOKEN`, recreate `api` → `/health` `llm: up`. Bật `zalo-bot` (`mem_limit` 1g) với `ALLOWED_THREADS` trống; đăng nhập QR ~11:33 UTC; `ALLOWED_THREADS` đặt ~11:36 UTC (cửa sổ mở ~3 phút), recreate và bot khôi phục session không cần QR. Kiểm chứng đầu-cuối **chưa có** (đang làm).
- **Bài học:**
  - `ssh 'bash -s' <<heredoc` + `docker-compose run/exec` nuốt phần còn lại của script — thêm `</dev/null`.
  - Sửa `.env` không tới container đang chạy: phải recreate (`docker-compose up -d --no-deps <service>`).
  - Bot bỏ im lặng, không log, mọi tin ngoài `ALLOWED_THREADS` (`apps/zalo-bot/index.mjs:229`), và trong nhóm chỉ trả lời khi được @tag — lấy threadId cần một cửa sổ ngắn để trống allowlist; trong cửa sổ đó ai nhắn riêng cho tài khoản bot, và nhóm nào có bot mà @tag bot, cũng được trả lời.
  - QR đăng nhập: quét **ảnh** `/session/qr.png` (tạo lại ~90 giây một lần) bằng tài khoản bot, không quét QR vẽ trong log.
  - Chi tiết server (IP, hostname, dự án khác trên host) không ghi vào git — repo public; tài liệu dùng `<MONA_DEV_HOST>`, giá trị thật ở `.agent/local/mona-dev-server.md`.
- **Còn lại:** kiểm thử đầu-cuối bot (Task 9 Step 5), domain + basic auth (Task 8), rclone (Task 10), `docker rm customs-assistant-gazette-full`. [ADR host trên server MONA dev](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md) và [runbook vận hành](../docs/mona-dev-server-operations.md) viết cùng ngày. Corpus trên server là bản đã commit (cũ).

### 2026-09-13 — Nâng cấp bot ngang notebook: spec duyệt, Mảng 1 thực thi (đã commit tối cùng ngày)

**Kết quả** — Spec [bot-answer-parity-design.md](../docs/bot-answer-parity-design.md) (bản 2, qua đợt kiểm độc lập
25 agent) + ADR 2026-09-13 + kế hoạch [05-bot-parity-tasks.md](05-bot-parity-tasks.md). Mảng 1 chạy theo từng task, mỗi
task một agent + rà soát, cuối cùng rà soát toàn bộ + một lượt sửa:
- `apps/eval/notebook.ts` — chấm 14 câu notebook (`fixtures/legal-golden/notebook-qa.json`) trong `yarn eval`; câu không
  kiểm được gì là "chưa chấm", không phải "đạt".
- Parser: `KHOAN` không còn đọc "20.000 tờ khai/năm." thành khoản 20.
- Kho 7 văn bản corpus sinh lại vào `research/legal-loader/out/` (8 văn bản Công báo sinh lại giống hệt từng byte):
  sửa 5 tiêu đề bị cướp + khoản ma, 124 tiêu đề bị cắt dòng nay đủ, 6 chỗ khoản gắn nhầm điều về đúng chỗ; **không
  mất chữ** (kiểm bằng code trên cả 15 văn bản). **Chưa gộp vào `db/seed/`** — chờ chủ dự án đọc `out/diff-report.md`.
- `diff_provisions.py` (báo cáo diff có tóm tắt 3 phần) + `merge_into_seed.py --only` (quyết định xác minh theo từng văn bản).
- Embedder: `EMBED_MAX_TOKENS`, cổng `EMBEDDER_HOST_PORT`; `measure_embed.py`. CLI `claude` vào `apps/api/Dockerfile`.
- `db/backup.sh` (chỉ `lookup_confirmation` + trạng thái xác minh, lên Drive, không chat — R14) + README "Triển khai máy chủ".

**Đã học**
- **🔴 Kế hoạch M0 đánh dấu "CLI trong image" là xong, nhưng Dockerfile chưa bao giờ có dòng đó** — VPS cũ chỉ có qua
  override ngoài git. Checkbox trong kế hoạch không phải bằng chứng.
- **🔴 Báo cáo diff bản đầu in "không mất chữ" mà không tính** — đúng lần này chỉ vì agent kiểm toán kiểm riêng. Rà soát
  toàn bộ bắt được; nay tính thật. Cùng họ lỗi: bộ chấm tính câu "bỏ qua hết" là đạt; script gộp áp một quyết định cho
  cả 7 văn bản; cron sao lưu chết vì PATH thiếu `/usr/local/bin`.
- **5 tiêu đề vẫn cụt** (25/VBHN-BTC Điều 14, 76; 46/VBHN-BTC Điều 18; 54/VBHN-VPQH Điều 55, 101): parser chỉ nối dòng
  bắt đầu chữ thường. Cố ý không sửa lần này (nối dòng chữ hoa/số có thể nuốt thân điều) — ghi ở "Việc phát sinh" của kế hoạch 05.
- **128/2020/NĐ-CP ghi sai số Công báo** từ đầu: trang Công báo ghi `1027 + 1028`, kho ghi `1023+1024`.
- Hai phiên Claude cùng sửa một working tree (phiên kế hoạch 06): phải chia file rõ và nhắn nhau; hai cơ chế sao lưu đã
  thống nhất về một (`db/backup.sh`, cron 02:00).
- zsh không tách từ biến chưa trích dẫn: `git diff -- $F` với nhiều đường dẫn trong một biến ra rỗng — dùng mảng.

---

### 2026-09-13 — Khảo sát server dev dùng chung của MONA, lập kế hoạch triển khai lại

**Kết quả** — Server dev dùng chung của MONA: không swap, RAM trống khoảng 4,9 GB lúc khảo sát, cổng 3000 và 5433
đã bị dự án khác chiếm. Chi tiết khảo sát nằm ngoài git (`.agent/local/mona-dev-server.md`) vì repo public. Kế hoạch triển khai:
[06-deploy-mona-dev-server.md](06-deploy-mona-dev-server.md) (nháp).

**Đã học**
- **Compose v2.15.1 standalone không hỗ trợ `!reset`** — `ports` trong override bị cộng dồn. Cổng 3000/5433
  đã có dự án khác dùng, nên phải tham số hoá cổng ngay trong `docker-compose.yml` (Task 1 của kế hoạch).
- **Không có plugin buildx vẫn build được bằng BuildKit** qua `docker-compose build` — đã thử với
  `RUN --mount`. Giả định ban đầu "thiếu buildx thì Dockerfile ingest (`ADD --checksum`) không build được" là sai.
- **Trên host dùng chung, chỉ xoá hoặc dừng những gì thuộc compose project `customs-assistant`**; mọi thứ khác thuộc
  quản trị MONA.
- **API không có xác thực, còn web UI ghi vào `lookup_confirmation`** (`POST /tariff/confirm`) — bản
  Contabo chặn bằng `basic_auth` của Caddy (`bieuthue.ngocnhat.info`). Server mới phải chặn tương đương ở nginx.

**Chủ dự án xác nhận** — Contabo hết dịch vụ, VPS đã bị xoá: không còn đường khôi phục dữ liệu. Deploy đi
nhánh seed mới; `lookup_confirmation`, session Zalo, `.env` và danh sách `ALLOWED_THREADS` đều phải làm lại.

**Còn tồn** — 5 câu hỏi chặn trong kế hoạch 06. Chưa commit gì.

---

Nhật ký trước 2026-09-13 (tối) — Giai đoạn 0–9, từ 2026-07-17 — nằm trong git:
`git show 11275bc:.agent/planning/02-progress.md`.

---

## Cách cập nhật file này

Cuối mỗi phiên, trước commit cuối:

1. Cập nhật **Tiếp tục từ đây** và bảng trạng thái.
2. Thêm một mục nhật ký ở **đầu** phần nhật ký: cái gì đổi, học được gì, điều gì bất ngờ. Giữ khoảng 5 phiên gần
   nhất; mục cũ hơn đã có trong git.
3. Quyết định → ADR; sự thật bền vững → `concepts/` hoặc `business-rules.md`. Không chôn ở đây.

## Kiến thức liên quan

- [Chỉ mục](../index.md) · [Quy tắc nghiệp vụ](../business-rules.md) · [Đánh giá](../docs/evaluation.md)
