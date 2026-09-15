---
type: planning
status: active
updated: 2026-09-15
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
| **Đang chạy** | Server dev dùng chung của MONA (`<MONA_DEV_HOST>`; giá trị thật trong `.agent/local/mona-dev-server.md`), stack `/opt/docker-projects/customs-assistant`, cổng 127.0.0.1 3060/5435/8060. Deploy mới nhất **`2476aab`** (2026-09-15, cả kế hoạch 08 Việc 4–13 + stack dữ liệu của c8): API + web UI + worker ingest + bot Zalo (đã đăng nhập, `ALLOWED_THREADS` đã đặt). Kho pháp lý **23 văn bản**, 7.598 điều khoản, 3.196 chunk (`FORCE_RESEED=1 seed-legal`, 2026-09-15). `/health` ok và **`/health?llm=deep` trả `llmDeep: up`** — dùng cái sau để biết mô hình có thật sự trả lời, `llm` chỉ nói token + binary có mặt. Deploy bằng CI/CD: push `main` → GitHub Actions test → image lên ghcr.io → server kéo về ([runbook §5](../docs/mona-dev-server-operations.md#5-deploy-bản-mới)). Vận hành: [runbook](../docs/mona-dev-server-operations.md). |
| **Việc tiếp theo** | 1. Probe R4 (`.agent/local/r4-probe.mjs`, chênh Jaccard ≤ 0,1) — cổng deploy của Việc 12–13.<br>2. Chủ dự án thử bot trên Zalo, báo chỗ chưa ổn.<br>3. **Nối walkthrough phân loại vào `POST /answer` chế độ hs** (phiên c8 mất trước khi chốt; code đã có ở `walkthrough*.ts`, `501eb2d`): runner `ClassifyInput`, `normalizeWalkthrough` → `verify` từng mục → `validateWalkthrough`, dựng lại `cites`, dòng thuế cho mọi ứng viên ở độ sâu đầy đủ, khối `policyStatus` do code in.<br>4. Các câu hỏi còn chờ chủ dự án ở [mục 2026-09-15 của c8](#2026-09-15--kho-tri-thức-ngochi-thành-json) (nạp 15/2024/TT-BYT, trường `notes`, phụ lục chữ Latin, bảng chuyển 18/2019/QĐ-TTg, người thẩm tra 36 case). |
| **Chờ chủ dự án** | (1) chat thử bot sau deploy `69d1ab4`, báo chỗ chưa ổn; (2) có nạp 4 nghị định biểu thuế còn thiếu (144/2024, 108/2025, 199/2025, 201/2026) không; (3) đối chiếu PDF Công báo EVFTA 8711.20.x (9,3% năm 2026 → 20,4% năm 2027); (4) quyết corpus sinh lại theo từng văn bản và sửa `gazette_issue` 128/2020/NĐ-CP — [kế hoạch 05](05-bot-parity-tasks.md) Task 5; (5) [kế hoạch 06](06-deploy-mona-dev-server.md): kiểm thử bot trong nhóm, domain + mật khẩu basic auth, `rclone.conf`; (6) thêm 16 nguồn mới vào notebook (TASK-021; sau mỗi lần đẩy `verify_drive.py` phải ra `0 lệch`); (7) các câu hỏi mở của phiên 2026-09-14 bên dưới. |
| **Việc của agent** | `seed-evidence` chạy 2026-09-15 sau deploy `2476aab`; gỡ container `customs-assistant-seed-evidence` khi xong. |
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

### 2026-09-15 (chiều) — Đẩy plan 08 lên server: CI bắt được một ReDoS phụ thuộc phiên bản Node, và `test:parser` thiếu thư viện Python

- **Vì sao:** gộp xong Việc 4–13 của [kế hoạch 08](08-answer-path-tasks.md) cộng stack dữ liệu của phiên c8 (63 commit,
  `8a01e94..8220f34`), push `main`. CI đỏ hai chỗ, mà deploy nằm sau `test` nên không có gì lên server.
- **Đã làm:**
  - **Bậc hai trong `maskCodes` ([plan.ts](../../apps/api/src/modules/answer/plan.ts)):** nhánh từ khoá của `HS_TOKEN` **mở đầu** bằng lookbehind, nên V8 thử đọc ngược
    `từ khoá + GAP` ở **mọi vị trí**, kể cả từng dấu cách của một dãy dài. Tuyến tính ở mỗi vị trí × cả dãy = bậc hai.
    Sửa bằng một guard rộng 0: `(?=\d)` đặt **trước** lookbehind. Mỗi dãy khoảng trắng chỉ được đọc ngược một lần, từ
    chữ số đi sau nó; các dãy rời nhau nên tổng vẫn O(n). 40.000 ký tự trên node 20: **7.317 ms → 0,67 ms**.
  - **`test:parser`:** thêm `actions/setup-python` (pin v7.0.0, đồng bộ với checkout/setup-node) + `pip install -r
    research/inbox-loader/requirements.txt` vào job `test`, ngay trước `yarn test:parser`.
  - Deploy `2476aab`; chạy `FORCE_RESEED=1 seed-legal` (23 văn bản, 7.598 điều khoản, 3.196 chunk) rồi `seed-evidence`.
- **Bất ngờ:**
  - **Lỗi chỉ lộ trên đúng phiên bản Node của server.** Node 20 và 22 chậm bậc hai; **24 và 25 tự tối ưu mất**. Máy này
    chạy 25 nên bộ test thời gian xanh tại chỗ và đỏ trên CI. Bài học: đo ReDoS phải đo trên Node của `.nvmrc`, không
    phải Node đang cắm.
  - **Nguyên nhân không phải `GAP`.** Tôi đoán đầu tiên là chuỗi `\s*` lồng nhau trong `GAP` và định chặn bằng
    `\s{0,8}`. Bản chặn đó **làm thủng R4**: `Mã HS` + 10 dấu cách + `300510` (một dòng dán từ bảng có đệm — tin nhắn
    hải quan có thật) thôi không được che nữa. Đã fuzz ra trong 100.000 câu. Chỗ tốn kém là **vị trí đọc**, không phải
    độ dài dãy; guard `(?=\d)` trị đúng chỗ đó mà không đổi một byte kết quả che mã (1,1 triệu câu sinh ngẫu nhiên,
    5 bộ ngữ liệu, 2 bộ trùng từng byte). Hai dòng trong `plan.spec.ts` ghim lại chuyện này để lần sau ai chặn `\s{0,8}`
    thì test đỏ.
  - Cùng nguyên nhân còn 10 dạng nữa mà log CI không lộ: tab, xuống dòng, NBSP, dấu nháy hay dấu hai chấm nằm giữa
    khoảng trắng, và cả **từ khoá không có chữ số nào phía sau** (x199–x312). Một dòng vá hết.
  - `guards.ts` đã soi cùng cách: mọi lookbehind ở đó đều bị chặn sẵn bằng construction (`\s{1,8}`, `[^,;:]{0,300}`),
    không có lỗi anh em.
  - Đường **dùng lại vector theo md5** của `seed-evidence` (viết 2026-09-15, chưa từng chạy trên CSDL thật) chạy đúng:
    174 mục đổi `source_ref` mà giữ được vector.
  - **Probe R4 báo PASS giả khi đường hầm chết.** `jaccard` của hai tập rỗng trả 1.00, mà một lượt hỏi lỗi mạng cho tập
    rỗng, nên 13/18 lượt trượt vẫn ra "mean gap -0.037 → PASS". Đã thêm bộ đếm `failed` và câu `NO READING` (exit 2):
    có lượt nào không tới được API thì probe từ chối chấm. Cổng deploy mà tự xanh khi hỏng thì tệ hơn là không có cổng.
  - **Đừng chạy probe qua `ssh -L`.** Đường hầm đứt hai lần giữa chừng (một lượt treo 718 giây). Lần đầu nghi do dùng
    chung kênh SSH với lệnh khác (ControlMaster); đặt `ControlPath=none` vẫn đứt. Cách chạy được: `docker cp` script vào
    container `zalo-bot` rồi `docker exec -d ... node /tmp/r4-probe.mjs > /tmp/r4.log`, ghi log trong container và đọc
    lại sau — SSH đứt cũng không ảnh hưởng. Xoá file trong container khi xong (D4).
  - `pgrep -f deploy.sh` qua ssh **luôn tự khớp chính lệnh của mình**; phải dùng `ps -eo args | grep "[d]eploy\.sh"`.
  - Chạy jest từ trong `.claude/worktrees/*` thì `testPathIgnorePatterns: /\.claude/` (thêm ở `8220f34`) nuốt sạch
    test; phải thêm `--testPathIgnorePatterns /node_modules/`. Checkout sạch của CI không dính.
  - `node --test "apps/zalo-bot/*.test.mjs"` không nở glob trên node 20; CI chạy node 22 nên vẫn được.
- **Kiểm:** `test:growth` xanh trên node 20 và 24 (10/10); jest mặc định 383 pass / 12 skip; `test:bot` 136/136; `tsc`
  sạch. Trên server: `/health` ok, **`/health?llm=deep` trả `llmDeep: "up"`** (lần đầu chạy thật — mô hình có trả lời,
  không chỉ có token), tra cứu biểu thuế và `/legal` đều trả dữ liệu, không container nào OOM hay restart.
- **Giới hạn:**
  - **Node 22 chưa chạy được ở máy này** (chỉ có 20, 24, 25). Lỗi tái hiện trên node 20 — cùng đời V8 — còn số của 22 là
    số CI đọc được.
  - Bước Python mới chỉ ghim 4 gói trực tiếp; các gói phụ thuộc (lxml, pillow, cryptography, pdfminer.six) không ghim,
    nên một bản phát hành mới của chúng có thể làm job `test` đỏ mà repo không đổi dòng nào. Nếu dính thì
    `pip-compile` cho riêng file đó.
  - `legal_document` của `128/2020/NĐ-CP` vẫn là `con_hieu_luc`, `effective_to` rỗng, đúng như nguồn; chuyện nó hết hiệu
    lực từ 01/07/2026 nằm ở `relations.ndjson` và do `seed-evidence` dựng thành mục tình trạng. Ai đọc thẳng cột thô sẽ
    hiểu sai.
  - Walkthrough phân loại vẫn **chưa nối** vào `POST /answer` (phiên c8 mất trước khi chốt) — để deploy sau.

### 2026-09-15 — Kho tri thức `ngochi` thành JSON: case phân loại, Chú giải chi tiết/SEN trích lại, 8 văn bản Công báo mới, sổ danh mục HS, chế độ hướng dẫn phân loại

*(Mục của phiên c8.)*

- **Vì sao:**
  - Chủ dự án (2026-09-14) muốn bot dạy phân loại HS từng bước, không chỉ đưa mã. Tham khảo cấu trúc `format-cau-tra-loi.md`; không commit file này vì có số điện thoại của bên thứ ba.
  - Chủ dự án cũng muốn tri thức trong thư mục `ngochi` nằm thành JSON trong git, để chuyển server chỉ cần nhúng lại.
  - Chủ dự án chốt:
    - giữ chữ bảng tổng hợp nội bộ VVMV trong repo;
    - nạp các thông tư danh mục rủi ro chính thức;
    - nạp 169/2026/NĐ-CP và 85/2026/TT-BTC;
    - 20035/TB-CHQ không có bản đủ.
- **Đã làm (dữ liệu, `db/seed/data/legal/`):**
  - `classification-cases.ndjson` (mới): 36 case chỉ gồm trích dẫn nguyên văn, lấy từ 26/29 công văn. Bộ kiểm: `research/inbox-loader/check_cases.py` kèm test.
  - `hs-explanatory-notes.ndjson` trích lại, 1.306 → 1.324 dòng: mỗi nhóm một dòng (1.228), cộng một dòng chung mỗi chương (96).
    - Đã sửa: chữ rơi sang nhóm trước, nhóm bị gộp, trang phụ lục chữ Latin, dòng phân nhóm.
    - `LIST_MARK` hẹp lại. Script EN không còn ghi SEN.
  - `hs-sen.ndjson`: do `extract_sen.py` mới sinh, mỗi chú giải một dòng (97 → 425), có `codes`/`subheadings`/`headings`/`title`.
  - `ingest_congbao.py` (kèm `test_ingest_congbao.py`):
    - đọc ô từ `w:tc` thô;
    - neo "Phụ lục" trần, bậc A./B., tiêu đề ở hàng 1;
    - bỏ bảng quốc hiệu và khối chữ ký; văn xuôi sau phụ lục vào `notes`;
    - lấy `gazette_issue`/`gazette_date` từ chú thích Công báo;
    - thêm `--only`, `--out`;
    - khôi phục khoản Word đánh số tự động;
    - "DANH MỤC" trần cho `.doc` chỉ tính sau Điều cuối.
  - Văn bản 15 → 23: thêm 33/2026/TT-BCT, 41 và 49/2026/TT-BXD, 27/2026/TT-BNNMT, 27/2026/TT-BYT, 125/2026/TT-BCA, 169/2026/NĐ-CP, 85/2026/TT-BTC. Quan hệ 19 → 37. Thêm Phụ lục I của QĐ 18/2019/QĐ-TTg.
  - `policy-lists.json` + `apps/api/src/modules/answer/policy.ts`: sổ 26 danh mục khoá theo mã HS; `policyStatus` trả `LISTED`/`NOT_LISTED`/`NOT_LOADED`/`UNCERTAIN`. Sổ ghi mã in sai (`unreadable`), mã hoãn áp dụng (`deferred`) và điều kiện áp dụng (`applies_when`).
  - `notebook-only.ndjson`: ẩn tên doanh nghiệp, mã số thuế, số tờ khai và số quản lý hàng hóa trong `ds-hang-qua-kvgs`.
- **Đã làm (seed), `evidence-build.ts`:**
  - Sinh thêm dòng case (kind `ruling`, `meta.case_id`) và dòng SEN có `hs_codes`/`hs_heading`/`meta.also_headings`.
  - Dòng cửa sổ: EN hoặc công văn dài hơn 6.800 ký tự giữ nguyên dòng đầy đủ, có thêm các cửa sổ tối đa 4.000 ký tự (`meta.parent/part/parts/offset`). Không sinh cửa sổ nằm trong 6.800 ký tự đầu.
  - Mã cha 4/6 số chỉ lấy từ ô bảng phụ lục, nhãn SEN và kết luận case.
  - Mục tình trạng bỏ chữ "còn hiệu lực" khi cả văn bản đã hết hiệu lực. Ví dụ 128/2020 → "hiệu lực từ 10/12/2020 đến trước 01/07/2026".
  - `evidence.ts` dùng lại vector khi md5 của `embed_text` đã có trong bảng.
  - Tổng 1.979 → khoảng 2.882 mục.
- **Đã làm (chế độ hướng dẫn phân loại, `apps/api/src/modules/answer/walkthrough*.ts`):**
  - Prompt "teaching walk", thắng prompt tối giản qua hai giám khảo.
  - `normalizeWalkthrough`: mô hình ghi `[#id]` kèm cụm nguyên văn 20–60 ký tự trong câu; code đánh số lại theo mục, dựng `cites`, xoá `tariff_ref` khi không in DÒNG THUẾ.
  - Các kiểm cấp mục. Chưa nối vào `POST /answer` (việc của phiên plan 08).
- **Đã làm (ghi chú kiến thức):**
  - Đổi theo NĐ 169/2026 (128/2020 hết hiệu lực từ 01/07/2026) và TT 85/2026: R3, R1, `hs-classification.md` §3/§7/§8/§11, `project-context.md`, `tariff-system.md`, `customs-declaration.md`, `evaluation.md`.
  - Ghi chú ngày trên ba ADR. Mọi con số đã đối chiếu với bản Công báo.
- **Tài liệu:**
  - [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md): thêm bảng bộ trích xuất, cách đọc bảng Word, case, sổ danh mục, bẫy 18–29.
  - [Runbook §5](../docs/mona-dev-server-operations.md#5-deploy-bản-mới): thêm số dòng và thời gian `seed-evidence`, việc dùng lại vector, quy tắc chỉ chạy seed sau khi deploy xong, và mục "Dựng lại kho tri thức trên server mới".
- **Bất ngờ:**
  - Script SEN cũ bỏ 646/667 nhãn mã. Không chú giải nào còn cho biết nó giải thích phân nhóm nào, mà file vẫn trông đầy đủ.
  - `row.cells` của python-docx lặp ô gộp. Ở 125/2026/TT-BCA, tên nhóm "Pháo hoa" nằm trong cột Mã HS, và một ô 13 mã bị chép sang bảy mặt hàng.
  - Word giữ số khoản trong `numbering.xml`, nên 169/2026 Điều 9 và 85/2026 Điều 1 mất khoản 1 trong chữ.
  - Công báo có thể đăng muộn rất lâu: 15/2024/TT-BYT muộn 205 ngày. Không suy ra "quá lâu nên chắc không ban hành".
  - File BNV hoá ra là bản ký số của 16/2026/TT-BNV, dù ô số hiệu trống trong lớp text.
  - Mã in sai trên Công báo ("404.29.90", "6802.92.90", "8507.60.10") được giữ nguyên và gắn cờ, không sửa.
  - `source_ref` là số dòng: thêm một dòng giữa file làm đổi khoá mọi dòng sau, nên phải dùng lại vector theo md5.
  - Mô hình tự đánh số `[n]` thì số chạy sang mục sau, nên code phải giữ sổ trích dẫn. Không giới hạn độ dài thì bước viết mất 109–202 s, vượt trần 100 s.
  - Qua `verify()` của plan 08, 42% câu của bản brief bị G3 cắt vì nhóm ứng viên nêu ngoài trích dẫn. Đã báo phiên plan 08; hướng xử lý là `anchors`.
- **Kiểm:**
  - `evidence-build.spec` 37/37, `policy.spec` 48/48, `walkthrough.spec` 35 (+3 bỏ qua khi không đặt `WALKTHROUGH_RUNS`), `tsc -p apps/api/tsconfig.app.json` sạch.
  - `check_cases.py`: "OK: 36 cases from 26 rulings". Inbox-loader unittest 77 OK.
  - Chạy thử walkthrough bằng `claude -p` (Opus, high): brief 62–83 s, full 82–107 s.
- **Giới hạn:**
  - Chưa deploy, chưa chạy `seed-evidence` trên server. Ước lượng khoảng 2.260 mục phải nhúng, 80–85 phút. Đường dùng lại vector chưa chạy trên CSDL thật.
  - **15/2024/TT-BYT chưa nạp:** textutil làm lệch cột dưới ô gộp, nên danh mục 27/2026/TT-BYT chưa có mã HS nguồn.
  - Đã ký nhưng chưa lên Công báo, đang chờ (R16): 16/2026/TT-BNV; 24, 26, 28/2026/TT-BYT; 126/2026/TT-BQP.
  - Trường `notes` của bảng phụ lục chưa in vào thân mục bằng chứng.
  - Công văn 4778/TB-TCHQ vẫn để `scanned=false`.
  - Lần đẩy notebook tới sẽ bị chặn ở nguồn 13–16, 50–58, 90, 91; nguồn 21, 23–27 đã bị chặn từ trước. Mỗi nguồn cần `--force-file`.
- **Chờ chủ dự án:**
  - (1) Đẩy notebook với `--force-file` cho các nguồn trên, gồm nguồn 91 để thay bản chưa ẩn thông tin riêng (Google Doc cũ vẫn còn bản chưa ẩn). Chưa agent nào đẩy.
  - (2) Chọn cách nạp 15/2024/TT-BYT (+ 988/QĐ-BYT).
  - (3) Có in trường `notes` của bảng phụ lục vào bằng chứng không.
  - (4) Có nạp phụ lục chữ Latin của Chú giải chi tiết (Chương 29, 33, 44, 71) không.
  - (5) 18/2019/QĐ-TTg (mã theo HS 2017) có cần bảng chuyển sang AHTN 2022 không.
  - (6) Chọn người có tên thẩm tra 36 case (R18).

### 2026-09-14 (tối) — Bot đọc câu hỏi trước khi tra mã; "mã này dùng được không" được trả lời bằng chú giải (`4367d6b`, `33fe661`)

- **Vì sao:** chủ dự án gửi ảnh chat nhóm: người dùng mô tả miếng dán bàn chân ngải cứu, hỏi "tham khảo mã 30051010 không biết được không", bot trả MFN + 4 biểu FTA. Chủ dự án: không phải câu nào có mã cũng là hỏi thuế; câu giải nghĩa mã phải đọc chú giải và lập luận, không dò từ khoá.
- **Gốc rễ:** `respond()` đưa mọi tin có mã 8 số thẳng vào `answerByHs`, router không bao giờ đọc câu.
- **Đã làm (bot):** tra thẳng chỉ khi tin chỉ gồm mã + xuất xứ + ngày + từ tra thuế (`isBareLookup`). Router thấy mọi mã/nhóm HS dưới dạng `[mã n]` (`codebook`, cả lượt cũ và dòng trạng thái — R4). Intent mới `check_code` → `answerCodeCheck`: nhóm ứng viên từ mô tả, `/legal` đọc chú giải của đúng các nhóm đó, so mã người dùng bằng code; không lời dẫn router, không lưu mã vào trí nhớ, chủ đề `legal`. Tin có mã không bao giờ để router ghi xác nhận/đính chính cho mã cũ; quote một câu không phải câu tra thuế không đi nhánh đính chính (R13). Tin "đang đọc chú giải" cho nhánh dài.
- **Đã làm (API):** `headingSections` — câu hỏi nêu nhóm (`30.05`, `nhóm 3005`, 4 số đầu của mã) giữ luôn Chú giải chi tiết của nhóm và chú giải chương.
- **Bất ngờ:** (1) `hs_heading` của mục `en` lưu dạng `30.05`, không phải `3005`; `hs_note` chỉ có `hs_chapter`. (2) "3005.10.10 gồm những hàng gì" bị từ chối dù EN 30.05 có trong kho — cả từ khoá lẫn vector không khớp "3005" với "30.05". (3) Nêu 5 nhóm trong câu hỏi làm rơi EN 30.05 vì `/legal` chỉ lấy 3 mục bằng chứng — nay chỉ nêu 3 nhóm đang hiển thị. (4) Agent rà code bắt 3 lỗi nặng ở bản đầu (ghi sổ cho mã cũ, mã lọt prompt qua dòng trạng thái, "vì sao vào mã X" lọt sang `/legal`) — đã sửa trước khi push.
- **Kiểm:** bot 68, Jest legal 34, `tsc` sạch. SQL `headingSections` chạy trên CSDL thật: EN 30.04/30.05/33.07 + chú giải Chương 30, 33. Chạy khô bản đầu trong container bot: câu ảnh ra `check_code`; "8481.80.99 TQ" vẫn tra thẳng. Sau deploy `33fe661` (CI xanh, chạy khô trong container bot): "3005.10.10 gồm những hàng gì, khác 3005.90 chỗ nào" → văn xuôi đọc EN 30.05 phân biệt 3005.10 (có lớp dính) / 3005.90, nói rõ nguồn không chi tiết cấp 8 số; "vì sao miếng dán ngải cứu vào mã 30051010" → ép sang đối chiếu, lập luận loại 30.04/38.24 có trích dẫn; "thuế nk 8481.80.99 tq form E" tra thẳng. Câu ảnh lần đó báo cam oan: router cùng một câu lúc xếp 3005 đầu, lúc thứ tư (đo 2 lần) → so với 6 nhóm, hiện thêm nhóm của người dùng; `/legal` 3 nhóm mất 68 s (sát 90 s) → không có văn xuôi vẫn in chú giải; router tự thêm "thải độc"/"giảm đau" → prompt cấm thêm đặc tính. Sau deploy `dbb95ac`, câu ảnh 2 lần: lần 1 so đúng ("trùng nhóm 30.05") nhưng bước viết quá 90 s (5 điều luật + 6 chú giải) nên in 10 nguồn, lẫn điều ghi nhãn NĐ 37/2026; lần 2 router bỏ hẳn 30.05 khỏi 6 nhóm đầu → báo cam, văn xuôi hay (Chú giải Chương 30 loại 33.03–33.07) nhưng không nói gì về 30.05. Sửa: nêu nhóm thì tối đa 2 điều luật, bước viết 100 s (spec §3.7); nhóm của người dùng vào danh sách nhóm cần phân biệt, không gắn nhãn, sau khi router xếp mù — **cách đọc R4 này ("mục tiêu so sánh") chờ chủ dự án xác nhận**; vắng khỏi ứng viên không còn cam; không văn xuôi thì chỉ in chú giải HS. Sau deploy `3d71049`, câu ảnh 2 lần (~65 s mỗi lần): cả hai "trùng nhóm 30.05", ứng viên 30.04/30.05/38.24, có văn xuôi, không quá thời gian, không điều luật lạc đề; lần 1 văn xuôi kết luận "chưa rõ công dụng → phải xét 38.24" (R3) → câu hỏi gửi `/legal` nay đòi tiêu chí, không chốt nhóm khi thiếu dữ kiện; nhãn thẩm quyền lặp 3 lần → in một lần rồi "như [n]". Workflow rà 5 góc + phản biện (15 agent) xác nhận 7 lỗi; sửa ở `a37c663` (deploy 2026-09-14, CI xanh, `/health` ok): câu hỏi "mã này sai không ạ" không bao giờ ghi sổ, cùng mã chỉ xác nhận khi có từ "đúng là…" (R13 — lỗi có từ trước); `codebook` che thêm "3005.10", "30.05", "HS: 3005", "mã số", "chương 30", "nhóm 3005 hay 3824", chữ NFD (R4); `namedHeadings` chỉ đọc số sau từ chỉ mã, mã đủ chấm, danh sách nhóm của câu đối chiếu, tối đa 4, chỉ EN mới cắt điều luật. Bot 69, Jest legal 34.
- **Chủ dự án sau đó (2026-09-14 tối):** "yêu cầu của tôi vẫn chưa được thực hiện … có tính người hơn, có suy nghĩ và phân tích câu hỏi, có thể chậm 1 chút cũng được" — sửa định tuyến không đủ khi câu trả lời vẫn do khuôn dựng. Hướng: làm `POST /answer` (Mảng 3) để LLM viết câu trả lời trên bằng chứng, rào chắn bằng code. Workflow thiết kế (3 phương án, 3 giám khảo) đang chạy → kế hoạch 08. Chia việc với phiên c8: c8 làm chế độ hướng dẫn phân loại (`apps/api/src/modules/answer/walkthrough.ts`) và nạp công văn `ngochi` vào `evidence_section`; phiên này làm khung `/answer` và bot. Mốc so sánh 8 câu hỏi thật trên `3d71049` lưu ngoài repo (scratchpad).
- **Kế hoạch 08 đã chốt và bắt đầu:** workflow thiết kế (3 phương án, 3 người chấm; agent tổng hợp viết 70 nghìn ký tự thành hai đoạn, output workflow chỉ giữ đoạn cuối — khôi phục từ transcript agent). Chủ dự án trả lời 3 câu: câu thuế = văn xuôi + khối thuế gọn, số không vào văn xuôi; D1 = có (nhóm của mã người dùng được đọc, không gắn nhãn, có probe bất biến); chờ tới ~2 phút. ADR `2026-09-14-answer-path-conversational-compose.md`.
- **Đo sớm Việc 2 (server, CLI 2.1.270):** `sonnet/low` prompt 5k ký tự 22–30 s, 2/3 lượt JSON bên trong không đọc được (có chữ/xuống dòng quanh JSON → `parseDraft` phải chịu được); `opus/high` prompt 40k ký tự **133 s**, trả 9,7k ký tự — vượt trần 100 s.
- **Việc 2 xong (3 lượt/cấu hình, tuần tự, prompt 40k EN + chú giải chương 30.04/30.05/33.07/38.24, KHÔNG giới hạn độ dài đầu ra — mô hình viết 7–11k ký tự):** `opus/high` 131–137 s, JSON 3/3; `opus/medium` 82–91 s, 3/3; `sonnet/high` 49–119 s (dao động), 2/3. `sonnet/low` prompt 5k: 22–30 s, JSON bên trong 1/3. RAM trống ≥ 3,1 GB, 0 `is_error`. Cờ tắt tool: `--tools ''` (còn `--disallowedTools`, `--permission-mode`). **Bài học:** độ dài đầu ra quyết định thời gian; prompt compose phải giới hạn chữ, và `parseDraft` phải chịu chữ quanh JSON. **Đo lại có giới hạn "~250 từ"** (cùng prompt 40k, `--tools ''`; mô hình viết 312–352 từ): `opus/high` 61–79 s, `opus/medium` 50–51 s, JSON 4/4. **D2 chốt mặc định `opus/high`** (chủ dự án chọn suy luận cao), `ANSWER_COMPOSE_EFFORT=medium` là lối lùi nếu p95 thật ở Việc 14 vượt 120 s.
- **Mốc "trước" (Việc 1, bot `a37c663`, `.agent/local/voice-before.txt`, 9 luồng / 13 lượt, 216 s):** câu ảnh chụp 2 tin · 3.080 ký tự · 68 s · **templateHits 11**; tra thuế / tìm mã 1 tin · 870–1.000 ký tự · 6–15 s · templateHits 0–2; mũ bảo hiểm danh mục 2 tin · 2.592 ký tự; giải nghĩa 3005.10.10 1 tin · 1.623 ký tự · 38 s; "hi" 343 ký tự; trailWrites 0 ở mọi lượt.
- **Deploy `2d5bdd6` (CI xanh, kiểm trên server):** `/health` ok; `/legal` có văn xuôi qua `answer/claude.ts` dùng chung (6 s); chạy khô: "hi" → danh sách năng lực không qua router (0,0 s), "8479.89.10 thuế của hscode này" tra thẳng 0,3 s (trước 9,2 s), "thue nk 84818099 tq" tra thẳng. Việc 4/5/7/8/11 đang ở workflow (worktree `.claude/worktrees/`, đã gitignore `26dce6d`, chưa push); vòng rà đầu: Việc 4 và 8 đạt, Việc 5 có lỗi chặn R4 (biểu thức đơn vị làm lọt "3005.10 sang 3824.90"), Việc 11 có 3 lỗi lớn (R13 khi in khối thuế đủ, lời mời đúng/sai trong khối thuế, `[n]` trùng giữa khối thuế và nguồn) — đang sửa.
- **Đã gộp vào `main` (chưa push):** Việc 4 (`3a95dde`, rà lại đạt; cờ `--no-session-persistence`, `--strict-mcp-config` đã thử trên CLI 2.1.270 của server: 3 s, JSON đúng, không sinh thư mục transcript) và Việc 8 (`2b4a7bf`, rà lại đạt). SQL mới của Việc 8 (cửa sổ, `array_agg`, `NOT EXISTS`, lọc case) chạy thật trên Postgres server bằng câu `PgDialect` sinh ra: `evidenceRetrieve` 10 dòng 50 ms, `headingSections` 9, `hsCodeSections` 2, `namedStatus` 1, `caseSections` 0 (chưa seed case). Việc 7 rà đầu chưa đạt (G4 bỏ lọt câu chốt diễn đạt khác, G6 cắt câu giải thích đúng, miễn G3 quá rộng) — sửa ở `a0d5864`; rà lại còn 1 lỗi lớn (bản sửa làm "sau khi … thì chắc chắn thuộc 38.24" lọt vì "khi" được coi là điều kiện) + 2 nhỏ (G6 miễn khi mã đứng bất kỳ đâu trước động từ; "Chưa đủ căn cứ để chốt 38.24" bị cắt oan) → sửa ở `dffffbd`, gộp `cd33a02` (answer + legal 178 test, `tsc` sạch). Còn biết mà chưa làm: "Khi chưa rõ công dụng thì phải xét 38.24" vẫn qua G4, "**Kết luận:** nhóm 38.24" chưa bắt, G6 cắt "Các hàng thuộc mã 3005.10.10 gồm …" — thêm test khi gặp trong log.
- **2026-09-15 (sau khi hết hạn mức phiên và phục hồi):**
  - **Việc 10 (`POST /answer`) đã gộp `a62b4f9`**, chưa push.
    - Workflow rà 4 góc (R4/R14; hợp đồng + đường lỗi; guards/repair; SQL và `gather` chạy thật trên CSDL server, chỉ đọc) có 25 phát hiện đã xác nhận.
    - Blocker: ở vai subject, mã trong quote hoặc state bị viết thẳng vào prompt compose và câu truy vấn.
    - Major:
      - khoá R4 bỏ cả khối dòng thuế vì dòng 10 số nêu mã → văn xuôi không nguồn;
      - lỗi DB lộ tham số SQL vào log (R14) → thêm `QuietExceptionFilter`;
      - compose lỗi thì mất hết nguồn;
      - repair trả rỗng không tính vào `cut`;
      - `[1, 2]` làm lệch câu repair.
    - Sửa ở `304ae25`, rà lại đạt. 3 lỗi nhỏ còn lại sửa tay ở `2d63dea`: mở rộng marker sau repair, cảnh báo cho đường chỉ trả nguồn, không in dòng nhóm trùng mã. Bỏ bản sửa thì đúng 3 test đỏ.
    - `main` đã commit, kiểm trong worktree sạch: jest 240 qua, `tsc` sạch, bot 83.
    - Trên cây chung, `walkthrough.checks.ts` (còn `cite_ids`) và 1 test `policy.spec` của c8 đang đỏ; cả hai là file chưa commit của c8.
  - **Workflow `plan08/predeploy-api-followups`** đang chạy các việc (1), (2), (3), (6) ở mục dưới, chỉ API.
  - **Việc 12** (bot gọi `/answer`), nhánh `plan08/viec12-bot-answer`.
    - Rà 4 góc, 45 phát hiện. Blocker R13:
      - tin soạn bị đọc là tin tra thuế;
      - `readsAsQuestion` bỏ lọt câu hỏi không dấu ("mã này sai k");
      - `DISAGREE_CUE` coi "ý tôi là…" là phán quyết.
    - Blocker R4: câu hỏi chữ đi `tariffByClues` trên chữ thô.
    - Sửa ở `e7c3fc0`, `584e7c6`, `7494d94`; bot 108 test.
    - Rà lại chưa đạt: 1 blocker (dòng "Hàng hóa có mã HS …" do mô hình viết vẫn làm tin soạn khớp `tariffReply`) và 2 major (phán quyết quote tin tra cũ bị ghi cho mã mới; "em gõ sai" bị ghi `wrong`).
    - Đang chạy vòng sửa + rà lại (tối đa 2 vòng), quyết theo mã đang tra thay vì câu chữ.
  - **Việc 12, thêm 2 vòng sửa/rà** (`be1b468`, `3b48b93`; bot 122): số lỗi thu hẹp dần (blocker 4 → 1) nhưng không hội tụ.
    - Còn lại: "đúng?" vẫn ghi sổ; câu có mã kèm quote trên luồng ứng viên ghi được; "mã đúng là X thì thuế bao nhiêu" ghi được; khối thuế mixed dài tách tin.
    - **Đổi cách làm:** sổ phán quyết chỉ ghi từ danh sách lệnh đóng khớp cả tin nhắn ("đúng", "sai rồi", "mã này sai", "HS đúng là X [xuất xứ] [căn cứ]"), và chỉ khi tin cuối của bot là kết quả tra đó. Mọi dạng khác không ghi, trả câu mời nêu đúng lệnh. Bỏ sót lệnh thật thì chấp nhận; ghi ngoài dự kiến là blocker.
    - Cùng vòng này: nhãn R18 trên dòng nguồn, "còn từ Nhật thì sao" có prose, nhãn khối mixed đi cùng dòng mở đầu.
  - **Đã gộp `451809c`: nhánh API trước deploy, đợt 1 + đợt 2.** Worktree sạch: jest 354 qua, `tsc` sạch, bot 83.
    - Đợt 2 có 5 commit và 1 commit sửa `861d8a6`; rà lại đạt.
    - Nội dung: `maskCodes` che mã viết liền sau từ khoá, dòng 10 số, danh sách phân nhóm viết liền; chuỗi ≥ 9 số (mã số thuế, SĐT) để nguyên; "HS 2022" không còn bị hiểu là nhóm.
    - Response thêm `fallback` và `reason`; FIT nhận "có hợp không".
    - `hsCodeSections` xếp dòng nêu đúng mã lên trước.
    - Thứ tự pin: hs_note đứng trước SEN. Hệ quả đã ghi ở §2.4: nhóm hỏi trải từ 3 chương trở lên thì không còn chỗ cho SEN.
    - Row 19: `stateOf` nêu văn bản của nguồn đã trích; `normalizePlan` giữ `scope.doc` khớp với văn bản đó.
    - Tài liệu plan 08 §0, §2.4, §4.2, §6.2 đã cập nhật.
  - **`plan08/guards-minimal` đã rà lại đạt ở `990d02f`** (8 commit + 1 sửa; jest 356 qua).
    - Mọi guard chạy tuyến tính. Ở 5k ký tự: main mất 46–401 ms, nhánh mất 0,2–9 ms.
    - Vòng rà bắt được 2 ReDoS (trim số hiệu văn bản trong numberMarkers; đầu mệnh đề của G6), G1 dò bằng Array, G2 chuẩn hoá thân nguồn lặp lại, và luật `LISTED` gây hồi quy. Tất cả đã sửa.
    - AMOUNT chỉ coi là số tiền khi có đơn vị tiền theo sau; TARIFF_WORDS thêm thuế/VAT/GTGT.
    - Quoted criteria chỉ lấy từ nguồn chính câu đó đánh dấu; anchors chỉ neo vào nguồn còn quote.
    - Đang chạy vòng dọn: AMOUNT với số lượng kèm markdown/dấu câu; trần chi phí item 6; export `dotted('')` và AMOUNT không cờ g.
    - **Quyết (R10 không nới):** câu pháp lý đổi "20.000.000 đồng" thành "20 triệu đồng" thì văn xuôi bị bỏ, chỉ còn trích dẫn. Prompt compose và legal thêm dòng "viết số tiền/%/ngày đúng như nguồn".
  - **Việc 12, vòng danh sách lệnh đóng** (`333173a`, `d20860a`, `9a27e85`, `94d9725`, sửa ở `33ed479`; bot 139).
    - Sổ chỉ ghi qua `ruling()` với các dạng: một từ phán quyết; "mã này sai"; "HS đúng là X [xuất xứ] [căn cứ]".
    - Điều kiện:
      - chữ có dấu phải khớp đúng dấu; có "?", "à" hoặc "hả" thì không ghi;
      - bảng đang mở, tin trả lời gần nhất của bot trong luồng là cho chính người đó, và bảng chưa có phán quyết;
      - quote phải là tin tra có "Tra theo ngày" đúng ngày; quote câu mời hoặc tin ứng viên không bao giờ ghi.
    - Nhãn khối mixed đi cùng dòng mở đầu; R18 in "(trích tự động, chưa đối chiếu)" trên dòng nguồn; "còn từ Nhật thì sao" có prose.
    - Rà lại: 150 kịch bản tấn công, không có lần ghi ngoài dự kiến; sweep render 942.566 phần, 0 vi phạm.
    - Còn 1 blocker: "xuất xứ jp/nhat ban…" khớp cú pháp nhưng `detectOrigin` không đọc được, nên ghi sai xuất xứ.
    - Đang sửa theo hướng không ghi:
      - không đọc được xuất xứ thì không ghi; danh sách nước phải trùng với `detectOrigin`;
      - bỏ các dạng không dấu mơ hồ ("dung a", "khong dung", "nhầm mã");
      - lưu bộ nhớ lỗi thì đóng bảng ngay trong tiến trình.
  - **`plan08/guards-minimal`, vòng dọn `2f08e09`:** 5 lỗi nhỏ đã đúng. Gồm: AMOUNT không coi số lượng kèm markdown/dấu câu là tiền; item 6 chuẩn hoá một lần + trần 20 span/câu; export không cờ g, `dotted('')` = ''; prompt compose và legal có dòng "chép đúng như nguồn, không quy đổi đơn vị".
    - Rà lại chưa đạt vì một lý do: test thời gian "< 50 ms" chập chờn khi full jest chạy song song (có từ `2aea4ea`). CI chạy full jest trước deploy, nên không được gộp như vậy.
    - Đang sửa: đổi sang kiểm tỉ lệ tăng t(20k)/t(10k) < 3 và chứng minh vẫn bắt được code bậc hai; full jest phải qua 5 lần liên tiếp. Kèm các việc nhỏ: trần span theo cả lượt `verify`, ghi giới hạn AMOUNT, sửa câu prompt compose cho khỏi mâu thuẫn.
    - **`plan08/api-mask-minors` rà lại đạt ở `32b7a7b`.** Đã sửa lỗi lọt: danh sách mã dừng ở số tiền/năm; so với main 0 hồi quy che mã, 0 lần lọt vào prompt.
      - Tôi đổi test thời gian "< 50 ms" sang kiểm tỉ lệ tăng. Full jest trượt với tỉ lệ 4,5–7,8. Không phải chập chờn: callback của `maskCodes` chạy bậc hai (`HS_WORD_BEFORE` quét lại cả đoạn trước, `codes.indexOf`, `codes.some`).
      - Trên production vẫn dưới 1 ms vì q ≤ 2000 ký tự, nhưng lượt hội thoại và state cũng đi qua `maskCodes`.
      - Đang sửa cho tuyến tính. Điều kiện gộp: kết quả battery và attack giống hệt `32b7a7b`, test tăng trưởng đo xen kẽ, full jest 5 lần có tải.
  - **Việc 12 `f1256fe`:** đã đóng lỗi ghi sai xuất xứ khi ô "xuất xứ" không đọc được; bỏ các dạng không dấu mơ hồ; lưu bộ nhớ lỗi thì đóng bảng. Bot 143 test.
    - Rà lại vẫn còn cùng họ lỗi, người rà đã kiểm cách sửa trên bản sao:
      - Blocker: lệnh có mã, không có ô xuất xứ, nhưng số hiệu căn cứ chứa mã nước ("CV 12/HQ-CN") → ghi phán quyết dưới xuất xứ CN.
      - Major: lưu bộ nhớ lỗi ở lượt tra/soạn thì bảng cũ vẫn mở, nên "đúng" ghi cho bảng cũ.
      - Minor: "mã undefined" ở bảng ứng viên; các dạng không dấu mơ hồ ("dung nhe", "nay sai", "hs dung la X").
    - Đang chạy vòng cuối. Theo hướng không ghi: đọc được xuất xứ ngoài ô thì không ghi; lưu lỗi ở bất kỳ lượt nào cũng đóng đường không quote; lệnh có mã viết không dấu không ghi.
  - **Đã gộp `1b62d71`: `plan08/guards-minimal`.**
    - Kiểm chức năng (bỏ riêng test thời gian): jest 365 qua, `tsc` sạch, bot 83.
    - Test thời gian vẫn chập chờn sau vòng `eac5808`: trượt 4/10 lần full jest. So 10k với 20k thì tỉ lệ ~2 (tuyến tính) và ~4 (bậc hai) quá sát nhau, trong khi máy đang gánh tải 5–6/10 core từ các phiên khác.
    - Đang chạy `plan08/timing-growth` từ main: một helper dùng chung, khoảng cách đo rộng (vd 2,5k so với 40k), cân nhắc đo bằng CPU time. Yêu cầu full jest xanh 10 lần liên tiếp, xanh khi có tải, và vẫn bắt được code bậc hai.
    - `plan.spec` chuyển sang helper này sau khi gộp nhánh che mã.
    - **CHẶN PUSH:** full jest phải xanh ổn định.
  - **Đã gộp `5479bf1`: Việc 12** (bot gọi `/answer`), sau vòng chốt `6dd2fe7` + minor `b6c82da`.
    - Rà lại đạt: 150 kịch bản tấn công không có lần ghi sai, sweep render 942.566 phần 0 vi phạm, 56 kịch bản mới của người rà cũng sạch.
    - Sổ phán quyết chỉ ghi từ danh sách lệnh đóng; số hiệu công văn đọc ra mã nước thì không ghi; lưu bộ nhớ lỗi thì đóng bảng.
    - Trên `main`: jest chức năng 365, bot 146, `tsc` sạch.
  - **Đã gộp `21d52a1`: `plan08/api-mask-minors`** (gồm bản sửa ReDoS cubic của GAP). Rà lại đạt ở `5f504e3`.
    - Callback của `maskCodes` đã tuyến tính (lookbehind sticky thay cho cắt chuỗi, Map chỉ số mã, Set nhóm 4 số). Kết quả che mã giống hệt bản trước: battery/probe byte-identical, 300.000 câu sinh ngẫu nhiên không lệch.
    - Test tăng trưởng chứng minh bắt được 3 biến thể bậc hai.
    - Trên `main`: jest chức năng 367, bot 146, `tsc` sạch.
  - **Đã gộp `866df1c`: Việc 13.** Rà độc lập: không blocker; 3 major đã sửa ở `12cfca0` (mặt nạ caption mất test, bản che mã ở bot lệch bản API nên lọt mã 6 số vào prompt vision, quy tắc "mục bằng chứng không sinh dòng đỏ" mất test) — mỗi bản sửa có mutation test chứng minh. `noCodes` nay dùng chung cho caption và state, chạy trước `HS_TOKEN`. Xoá thêm code chết: `DISAGREE_CUE`/`isDisagreement`, `mergeQuote`, `parseDocRef` bản bot, nhánh "(trích đoạn đầu)", 6 chuỗi `TEMPLATE_STRINGS`. Trên `main`: jest 367, bot 136, `tsc` sạch, bot còn 2.806 dòng.
  - **Việc 13, chi tiết:** xoá lớp khuôn mẫu và lưới regex định tuyến của bot — `answerCodeCheck`,
    `answerLegal`, `missingDocAnswer` (chuyển vào `index.mjs`), `formatLegal`, `withLead`, `excerpt`, `codebook`/`unmaskCodes`/
    `asksCodeFit`/`legalAboutCode`/`fallbackIntent` và cả bộ `route()` của `router.mjs` (còn `claudeVision` + `normalize` cho ảnh),
    `legalAnswer`/`legalDocuments` của `api.mjs`; `tariffByClues` không còn `lead`. Ảnh vẫn che mã trước khi vào vision
    (`captionForVision` tự giữ mặt nạ, vì `maskCodes` nằm ở API). Bot `*.mjs` không tính test: 3.279 → 2.861 dòng. Bot 137 test
    (146 − 10 ca chỉ kiểm code đã xoá, 1 viết lại, 1 thêm cho `redLines`); che mã và cue FIT nay do `plan.spec.ts` giữ, khối
    nguồn và dòng đỏ/cam do `render.test.mjs`.
  - **Đang chạy `plan08/timing-growth`:** gộp hai test thời gian về một helper chung, hiệu chỉnh trên máy có tải, yêu cầu full jest xanh 10 lần và vẫn bắt được code bậc hai. Đây là việc cuối chặn push.
  - **Đã gộp `397501d`: `/health?llm=deep`.** Vá lỗ "hết hạn mức mà `/health` vẫn báo `llm: up`" (14/09).
    - Mặc định vẫn là kiểm rẻ (token + binary), không đổi hình dạng response; thêm trường `llmDeep` khi gọi kèm `?llm=deep`.
    - Kiểm sâu gọi `claude -p` prompt cố định (không có chữ người dùng), tools off, qua `runClaude` nên dùng chung hàng đợi 2 tiến trình.
    - `up` nhớ 5 phút, mọi kết quả hỏng chỉ nhớ 30 giây. Ngưỡng 30 s (đo thật 3,6–10,9 s). CLI chết ngay → `error`, không phải `timeout`. `llmDeep` không bao giờ làm `/health` trả 503.
    - Rà 2 góc: 1 blocker + 3 major đã sửa ở `47bc2b2`; người rà cuối chạy CLI giả 10 kiểu hỏng qua code thật.
    - Trên `main`: jest 381, bot 136, `tsc` sạch.
  - **CHẶN PUSH — ReDoS có sẵn trên `main` (`451809c`):** GAP trong lookbehind từ khoá của `maskCodes` có ba `\s*` liền nhau. Số đo: 800 dấu cách mất 410 ms, 10k dấu cách + một chữ số treo nhiều giờ; trần q 2000 ký tự vẫn tốn vài giây mỗi tin. Đã sửa ở `plan08/api-mask-minors` (`3e94301`), nên nhánh này phải gộp trước khi push.
    - Vòng 2 (`addb765`): dấu gạch chỉ được nằm giữa mọi cặp số, nên khoảng năm/số lượng/số hiệu tiêu chuẩn không bị che.
    - Rà lại chưa đạt, 1 major (lọt R4 mới): `JOINED` đặt `NOT_HEADING` trong mục danh sách, nên danh sách dừng ở số tiền/năm và mã phía sau không được che. Đang sửa bằng cách kiểm từng mục trong callback.
  - **Đang chạy `plan08/api-mask-minors`:** mã 10 số tách 4+6; `JOINED_HEADING` áp `NOT_HEADING`; dấu nháy đơn, "hs số", các từ nối với/hay là/"/"/"-"; dấu gạch làm dấu tách mã ("8481-80-99", vẫn giữ nguyên ngày ISO); ghi chú HS 2002/2007; row 19 nhận số hiệu văn bản không có phần cơ quan ban hành.
  - **Việc API đợt 2** (sau khi workflow trước deploy xong, vì cùng đụng `plan.ts`):
    - (a) `maskCodes` che mã 6 số viết liền sau từ khoá ("mã hs 848180") — blocker R4.
    - (b) `stateOf` thêm `documentNumber` để "nguyên văn điều đó" điền được `scope.article`.
    - (c) response có `fallback: true` khi `defaultPlan` thay kế hoạch (hàng 23), và FIT nhận "có hợp không".
    - (d) response có `reason: no_sources | compose_failed | deadline | latch`.
  - **Chủ dự án đã chốt (2026-09-15):**
    - (i) R18: trích dẫn EN/SEN in chữ nhỏ "(trích tự động, chưa đối chiếu)" trên dòng nguồn. Không dùng dòng cam.
    - (ii) Câu hỏi thuế không có mã: tìm mã trước, có phân tích (compose hs). Không dùng `tariffByClues`. Cần thêm hàng này vào §2.2.
  - **Chốt với c8 về walkthrough:**
    - (1) `VerifyContext.anchors`: nhóm ứng viên và mã LINES do code đưa vào được G3 coi là có neo.
    - (2) % và từ chốt nằm trong cụm trích nguyên văn đã kiểm với dòng en/sen/hs_note/gri/ruling được che trước G1/G4. Không áp cho annex_table; không áp khi câu có thuế suất/MFN/ưu đãi/FTA.
    - (3) Runner dựng lại `cites` sau `verify`.
    - (4) Chế độ full: mỗi ứng viên một dòng thuế, chọn trung lập; effort medium cho full, high cho brief.
  - **Dữ liệu c8:**
    - Bỏ các window nằm trong 6.800 ký tự đầu của dòng cha.
    - SEN ghi `hs_heading` (nhóm đầu) và `meta.also_headings` (mọi nhóm).
    - Mã cha trong `hs_codes` lên cùng đợt push này → `hsCodeSections` phải xếp dòng khớp đúng mã lên trước.
    - Hai stack push chung một lần: c8 commit trước trên `main`, không rebase.
    - 169/2026 và 85/2026 đã nạp (chưa commit). Chặn (a) 128/2020 giữ tới khi thấy dòng status đã seed trên server.
  - Việc phía API phát sinh từ Việc 12, chưa làm:
    - `PlanState` đọc `provisionLabel` nhưng bot lưu `label`;
    - "còn từ Nhật thì sao" cần API lấy mã từ `context.state.tariff`.
  - **Bỏ nhánh `plan08/guards-uncertain-condition` (không gộp).**
    - Sau 2 vòng sửa/rà, vòng nào cũng sinh ReDoS mới: ngôi sao lập phương, dấu đầu dòng + chuỗi khoảng trắng chạy hàng chục giây ở 10k ký tự. Kèm 4 hồi quy so với `main`.
    - Làm lại từ `main` trên nhánh `plan08/guards-minimal`, theo nguyên tắc tối giản và tuyến tính:
      - test thời gian < 50 ms ở 10k cho mọi guard; sửa các điểm chậm sẵn có của main (RATE với chuỗi số, lookbehind "để", normQuote);
      - G4 chỉ bắt điều kiện "khi/nếu … thì" có cụm "chưa rõ/thiếu thông tin…";
      - SETTLING nhận "Kết luận:";
      - G6 chỉ miễn "các hàng/hàng hóa/mã này … gồm";
      - `anchors` và che cụm trích tiêu chí (theo thỏa thuận với c8); G1 bắt "triệu/tỷ/nghìn đồng"; export `digits`/`dotted`/`HEADING_OR_CODE`.
    - Ca cần hiểu ngôn ngữ ghi thành giới hạn, để prompt và repair xử lý.
  - **`plan08/predeploy-api-followups` đã được rà lại và duyệt (`df1f363`).** Đang chạy đợt 2 trên chính nhánh này:
    - `maskCodes` che mã viết liền sau từ khoá;
    - `stateOf` thêm `documentNumber`;
    - response thêm `fallback`, `reason`; FIT nhận "hợp";
    - `hsCodeSections` xếp mã khớp đúng lên trước;
    - thứ tự pin: hs_note (ràng buộc) đứng trước SEN;
    - test cho `reuseLastHs`; cập nhật tài liệu plan 08.
  - **Vá G4/G6, vòng 1:** `4f6e054`, `dcfcc6a` — bắt kết luận chốt mã khi thiếu dữ kiện với nhiều cách viết, nhãn "**Kết luận phân loại:**", G6 thôi cắt câu giải nghĩa. Tấn công 24 ca.
    - Rà lại chưa đạt, 4 major: ReDoS (2,76 s ở 10k ký tự so với ~1 ms trên main); câu có dấu phẩy trước "thì" vẫn lọt; "nên" nghĩa "vì vậy" bị coi là rào đón; "…, <nhóm>" bị coi là danh sách ứng viên. Kèm 5 minor.
    - Đang chạy vòng sửa + rà lại, tối đa 2 vòng, có test chặn thời gian < 50 ms ở 10k ký tự.
    - Nguyên tắc: regex chỉ là lưới chặn cuối; ca cần hiểu ngôn ngữ thì ghi thành giới hạn và để repair xử lý.
  - **Workflow vá G4/G6** trên nhánh `plan08/guards-uncertain-condition`, 3 chỗ hở ban đầu:
    - câu kết luận có điều kiện là "chưa rõ" vẫn bị coi là chốt mã;
    - "**Kết luận:** nhóm …";
    - G6 cắt oan câu giải nghĩa.
  - **Việc phải làm sau khi gộp các nhánh, trước deploy:**
    - (1) `PlanState` đọc `label` (bot lưu `label`).
    - (2) Tra thuế "còn từ Nhật thì sao": API lấy mã từ `context.state.tariff`.
    - (3) `/answer` bỏ mọi nguồn thuộc 128/2020/NĐ-CP và 102/2021/NĐ-CP trước compose, cho tới khi c8 nạp 169/2026/NĐ-CP. Lý do: chủ dự án đã duyệt nạp; 169/2026 hiệu lực 01/07/2026, rất có thể thay 128/2020, mà kho vẫn ghi `con_hieu_luc` → không để mức phạt cũ vào prompt.
    - (4) G1 bắt số tiền có chữ đơn vị ("20 triệu đồng", "1 tỷ đồng"); `RATE` hiện bỏ lọt.
    - (5) Sau khi c8 tích hợp EN/SEN mới: kiểm lại số dòng pin.
      - Dữ liệu mới: EN 1.324 dòng, mỗi nhóm một dòng; SEN 425 dòng, mỗi chú giải một dòng, 658 mã.
      - Pin không bao giờ bị cắt trong `gather()`, nên nếu `headingSections`/`hsCodeSections` ra hơn khoảng 6 dòng thì phải thêm giới hạn theo loại trước khi deploy. Đã nhờ c8 báo số dòng cho 30.05/38.24, 84.81, 85.17, 8481.80.99, 8517.62.53.
    - (6) Số ước lượng của c8 (chưa chạy SQL):
      - 30.05 + 38.24 ra 2 EN, 4 SEN;
      - 27.10, 40.01, 85.04 mỗi nhóm 8 SEN; 03.01, 39.26, 73.08 mỗi nhóm 7;
      - một số SEN là nhóm theo khoảng ("39.01–39.12") nên ghim dưới nhiều nhóm.
      Đã thống nhất giới hạn pin trong `legal.evidence.ts` + `gather()`:
      - SEN ≤ 3 cho mỗi nhóm được hỏi, ưu tiên chú giải có mã trùng mã được hỏi;
      - EN 1 cho mỗi nhóm; case ≤ 2 cho mỗi nhóm; `hsCodeSections` ≤ 3 cho mỗi mã và mỗi loại;
      - tổng pin ≤ 8, áp cả `GET /legal`, theo thứ tự: tình trạng hiệu lực → dòng nêu đúng mã → EN → SEN → case.
      - **Sửa lại (6) sau khi đọc SQL** (`legal.evidence.ts`):
        - `headingSections` chỉ ghim EN theo nhóm (hoặc `also_headings`) và `hs_note` theo chương, không ghim SEN. SEN chỉ vào qua `hsCodeSections` (LIMIT 3 tổng, binding trước).
        - Chỗ phình thật là LIMIT của `headingSections` = số nhóm + 2 × số chương: chế độ hs 6 nhóm / 4 chương → 14 dòng, cộng case.
        - `/legal`: 4 nhóm → tới 12 pin, mỗi pin tới 6k ký tự, đúng dạng timeout 100 s trước đây.
        - Việc cần làm, đã chốt với c8:
          - Cap tổng pin trong `gather()`: 8 cho `/legal`.
          - Chế độ hs ghim SEN theo nhóm ứng viên, tối đa 2 mỗi nhóm. SEN là lớp duy nhất giảng cấp 8 số; EN chỉ tới 6 số.
          - Xếp SEN trung lập: chú giải có `codes` trùng một dòng trong LINES của ứng viên đó trước, rồi theo thứ tự mã. Không xếp theo mã người dùng khi `codeRole = premise` (lối R4 kín); xếp theo mã được hỏi chỉ ở vai `subject`.
          - Chỉ bỏ ruling/case cho đều giữa các ứng viên. Không làm vậy với SEN/EN: SEN thưa (382 chú giải / khoảng 1.200 nhóm), nên thiếu SEN không lộ gì.
      - **(3) chốt với c8:** chặn cứng 128/2020 và 102/2021, không ngoại lệ lịch sử.
        - Căn cứ: khoản 2 Điều 38 NĐ 169/2026 làm 128/2020 và Điều 2 của 102/2021 hết hiệu lực từ 01/07/2026; khoản 1 Điều 39 cho áp mức nhẹ hơn.
        - Bỏ chặn khi c8 nạp xong điều khoản 169/2026.
        - c8 đang sửa R3 và các ghi chú khái niệm có trích số liệu 128/2020; phiên này không đụng các file đó.
      - (10) Sau khi nạp 85/2026/TT-BTC (hiệu lực 15/09/2026): chế độ hs ghim Điều 4 và Điều 6 làm căn cứ "hải quan phân loại thế nào".
      - (7) Walkthrough của c8 gần chốt; c8 sẽ báo khi xong. `policy.ts`, `policy.spec.ts` và `policy-lists.json` chỉ lên cùng commit dữ liệu/tích hợp của c8 (cùng annex-tables + evidence-build); commit riêng thì CI đỏ vì spec cần dòng của danh mục chưa commit. c8 báo SHA trước khi push, sau đó mới nối `policyStatus`. `policyRows` không còn vào prompt, vì văn xuôi không được khẳng định có/không trong danh mục.
        - API gọi `policyStatus()` và trả kết quả.
        - Bot in mỗi kết quả LISTED/UNCERTAIN một dòng kèm quote, cộng một dòng nhỏ "đã đối chiếu: … · chưa nạp: …" (từ NOT_LISTED/NOT_LOADED). Bỏ các danh mục có `applies_when` không hợp câu hỏi.
      - (8) Khi nối walkthrough:
        - chạy `verify()` trên các section, vì `validateWalkthrough` không còn kiểm thuế/chốt/neo số/quote;
        - các ứng viên phải có cùng loại bằng chứng: nếu không phải nhóm nào cũng có công văn thì bỏ công văn, tránh để lộ nhóm của người dùng qua R4;
        - bỏ dòng 8 số của người dùng nhưng giữ một dòng cùng nhóm;
        - `conclusion.headings` được phép rỗng: đã sửa chú thích ở `types.ts`.
        - Chạy xác nhận của c8: bản brief có 4–9 vi phạm vì mô hình đếm [n] nối qua các mục và tự điền `tariff_ref`. c8 thêm `normalizeWalkthrough(draft, input)` để đánh số lại [1..k] mỗi mục, dựng `cite_ids`, bỏ id lạ, và ép `tariff_ref` rỗng khi không in khối thuế.
        - Luồng runner: `looseJson` → `normalizeWalkthrough` → `verify` → `validateWalkthrough`.
        - Lỗ hợp đồng đã nêu với c8: section chỉ có `cite_ids`, không có quote, nên `verify()` sẽ giết mọi [n] ở G2 và mọi câu có số ở G3.
        - **Đã chốt `196a794`:** `WalkthroughSection.cites: [{id, quotes}]` thay `cite_ids`; `candidates[].cite_ids` giữ nguyên.
        - Quote lấy từ chính câu văn: mỗi `[#id]` phải nằm trong câu có cụm nguyên văn ≥ 20 ký tự trong "…".
        - `normalizeWalkthrough` chỉ giữ cụm có trong thân nguồn, không bịa quote. Không bắt mô hình viết map quote ẩn vì tốn thời gian.
        - Runner đánh số lại toàn cục qua các mục cho `formatAnswerMd`.
      - (9) Sau khi gộp nhánh G4: `guards.ts` export `digits`/`dotted`/`HEADING_OR_CODE` để walkthrough dùng chung.
      - c8 không sửa SQL pin hay `modules/legal/`. Test không được giả định `hs_codes` có mã cha: chỉ có sau khi seed của c8 lên; CSDL hiện chỉ có mã 8 số có chấm.
  - **c8:** walkthrough chưa nối cho tới khi c8 báo chốt. Trước khi tích hợp evidence-build và chạy `seed-evidence` trên server, c8 sẽ báo danh sách file và cửa sổ seed. Gộp tiếp: Việc 5 (`9dc857d`; che mã theo cấu trúc, không theo từ đơn vị — "1234.56 USD" bị che thừa, chấp nhận; danh sách "nhóm 3005 hoặc 3824, và 3926" che đủ ở cả bot `8661ad8`), Việc 6 (`21ae09b`, bước kế hoạch `sonnet/low` 30 s, lỗi gì cũng về `defaultPlan`), Việc 11 (`14df4e9`; rà lại còn 1 lỗi lớn: câu hs đủ dài làm khối thuế ứng viên rơi sang tin thứ 2 và khớp `tariffReply` → thêm "Nếu hàng thuộc mã" vào `COMPOSED`, test quét văn xuôi 0–4.000 ký tự, bỏ bản sửa thì test đỏ ở +100). Bot 83 test. Việc 10 (`POST /answer`) đang làm.
- **Giới hạn:** nhánh đối chiếu mất ~1 phút (router + `/legal`); an toàn R4 ở nhánh `legal` vẫn dựa một phần vào router chọn đúng intent (lưới code: `asksCodeFit`); `isBareLookup` là danh sách từ, câu tra thuế dùng từ lạ sẽ đi router (chậm hơn, không sai).

### 2026-09-14 (chiều) — Mảng 2 xong trên server; lát đầu Mảng 3: `/legal` dùng tầng bằng chứng, đã deploy qua CI/CD

- **Tầng LLM:** chủ dự án chốt giữ `claude -p` thuê bao (khớp ADR 2026-09-13: tối đa 4 lần gọi/lượt, 120 s).
- **Đo embed trên server (Task 6 Bước 6):** lô 32 mục dài 170,7 s (5,3 s/mục), RAM đỉnh embedder 2.580 MB, 3,46 ký tự/token → `EMBED_CHARS = 6800`. Đo có bộ canh RAM host (dừng khi < 700 MB) vì server dùng chung còn ~2,3 GB.
- **Mảng 2 (`8fa69dc`, đã deploy):** migration 0011 `evidence_section`; `db/seed/evidence-build.ts` sinh 1.989 mục từ extract đã commit (+10 mục nghị định biểu thuế lúc seed); seed upsert tiếp tục được. Kiểm migration trên DB nháp (rỗng và ở 0010), chạy seed 100 s rồi ngắt, chạy lại đúng "256 sections unchanged". Seed production 73,5 phút, 1.989/1.989 có vector.
- **Lát đầu Mảng 3 (`e17e0a1`, `2ee0c60`, `eaae4ec`, `19da3b0`, sau rebase lên CI/CD là `72b0adf`…`a4b50d3`; deploy `0bf25af`):** `GET /legal` truy hồi thêm bằng chứng, nhãn nguồn vào prompt và dòng nguồn của bot. Trên API nháp với dữ liệu thật: NĐ 43/2017 từ "chưa có văn bản" → trả mục tình trạng; NĐ 336/2026 từ từ chối → mục tình trạng nhãn "CHƯA CÓ HIỆU LỰC — từ 15/10/2026". Chi tiết và hai bài học (mục `status` văn bản được nêu luôn đi kèm; cổng khoảng cách riêng cho bằng chứng) ở [kế hoạch 05](05-bot-parity-tasks.md) Mảng 3.
- **Bất ngờ:** (1) parser `simple` cắt `69/2018/NĐ-CP` thành `69/2018/n`, `đ`, `đ-cp`, `cp` — tìm số hiệu bằng từ khoá không khớp (spec §3.3). (2) giữa lúc seed chạy, thư mục stack thành git clone của phiên CI/CD (mục bên dưới); từ nay deploy qua push `main`, không `git archive | tar` vào thư mục stack.
- **Kiểm:** Jest 124, bot 64, parser 34 + 21 + 62, `tsc` sạch (trừ lỗi `import.meta` có sẵn). Kiểm trên API nháp chạy lúc LLM còn hết hạn mức, nên chỉ ở chế độ trích dẫn.
- **Kiểm production sau deploy `0bf25af` (LLM đã có lại):** văn xuôi đúng cho 69/2018, 336/2026, mũ bảo hiểm 6506.10.10, thời hạn nộp thuế. Hai lỗi sửa ngay: bot viết NĐ 43/2017 "vẫn còn hiệu lực"; câu có mã HS hỏi về danh mục đi nhầm sang tra thuế (chi tiết ở [kế hoạch 05](05-bot-parity-tasks.md) Mảng 3). "Chú giải Phần XVI" chưa ra văn xuôi.

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
