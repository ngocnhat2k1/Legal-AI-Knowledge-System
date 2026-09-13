---
type: planning
status: active
updated: 2026-09-10
related:
  - 02-progress.md
  - ../docs/inbox-ingest-workflow.md
  - ../architecture-decisions/2026-09-10-notebook-sources-as-google-docs.md
  - ../architecture-decisions/2026-09-10-received-file-is-a-pointer-not-a-source.md
  - ../architecture-decisions/2026-09-10-drafts-and-cong-van-outside-legal-corpus.md
---

# Danh sách công việc — Đường ống hộp thư đến (Giai đoạn 9)

Thiết kế: [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md).

**Bối cảnh mới (2026-09-10):** VPS ngừng hoạt động, dự án tạm không dùng máy chủ. Đường ống này
cố ý **không cần Postgres** — nó sinh `.ndjson` (commit vào git) và markdown cho notebook. Khi
hạ tầng trở lại, `yarn db:seed:legal` nạp cả kho kèm mọi văn bản bổ sung trong giai đoạn này.

## Chú giải trạng thái

`todo` · `doing` · `done` · `blocked`

---

## TASK-016: Chuyển bộ sinh notebook vào repo + render tất định

**Trạng thái:** done 2026-09-10 — bộ sinh ở `research/inbox-loader/`; render tất định (32/32 file giống hệt giữa hai lần chạy)

`build_legal.py`, `build_hs.py`, `build_bundles_cu.py` đang sống ở
`~/Desktop/Legal-AI-NotebookLM-Export/_scripts/` — **ngoài git**, trên thư mục Desktop được
iCloud đồng bộ. Hạ tầng chịu tải không được sống ngoài kiểm soát phiên bản.

Chuyển vào `research/inbox-loader/`. Đồng thời **bỏ `date.today()` khỏi thân file**: hiện nó
nhúng ngày chạy vào nội dung, nên chạy lại cùng `.ndjson` vào ngày khác cũng đổi hash và làm
manifest báo "đã thay đổi" sai.

**Nghiệm thu:** chạy render hai lần, đổi ngày hệ thống giữa hai lần → hash thân file không đổi.

---

## TASK-017: `triage.py` — phân lớp và dò Công báo

**Trạng thái:** done 2026-09-10 — `congbao_lookup.py` (theo số hiệu / ngày đăng / tiêu đề). **Không** có một `triage.py` duy nhất: kiểm kê làm theo checklist trong runbook, vì mỗi đợt tài liệu một khác

Phân lớp A/B/C/D theo [R15](../business-rules.md) và [R16](../business-rules.md): đọc số hiệu,
dò lớp text của PDF, phát hiện file trùng theo md5, và **dò Công báo bằng tiêu đề + cơ quan +
năm** cho mọi ca có ô số hiệu trống.

Trích quan hệ `thay_the` / `sua_doi` / `bai_bo` từ "Điều khoản thi hành", ghi thành cạnh trong
manifest — **dữ liệu về chuyển đổi, không bao giờ thực thi thành phép biến đổi văn bản**.

**Nghiệm thu:** phân lớp đúng 20/20 tài liệu đợt đầu, kiểm tay. Mỗi ca lớp C kèm bản ghi tra
cứu Công báo. Cờ đỏ năm lệch chặn được `09-bvhttdl.pdf`.

---

## TASK-018: Parse hai nhánh + cổng `\x07`

**Trạng thái:** done 2026-09-10 — nhánh bảng đọc thẳng `w:tbl` (docx) và dòng `\x07` (doc) vào `annex-tables.ndjson`; cổng chặn là Điều liên tục + rác mã trường. Cổng "đếm dòng `\x07` bị bỏ" như thiết kế ban đầu **không** làm — nhánh bảng bắt mọi bảng nên không còn cần

`parse_provisions.py` vứt mọi dòng chứa dấu ô Word `\x07` — đúng cho văn xuôi, nhưng bỏ **toàn
bộ bảng**. Bốn văn bản lớp A của đợt đầu là danh mục dạng bảng (TT 52/2018-BCT, QĐ 18/2019-TTg,
QĐ 1725/QĐ-BCT, TT 11/2024-BTTTT), cộng phụ lục NĐ 292/2026.

Thêm nhánh parser bảng (mẫu đã có: `research/task-008-congbao-loader/parse_nd26.py`,
`research/task-003-evfta-parser/parse_tariff_doc.py`), hợp nhất, mỗi hàng bảng mang danh tính
phụ lục theo [R9](../business-rules.md).

**Cổng chặn:** `parse_provisions.py` phải đếm và ghi log số dòng `\x07` bị bỏ thay vì `continue`
im lặng. Khác 0 mà chưa có nhánh bảng chạy ⇒ dừng đường ống.

**Nghiệm thu:** đếm dòng hàng hoá trong danh mục máy ra, so tay với bản `.doc`, cho từng văn bản
dạng danh mục.

---

## TASK-019: `render_notebook.py` — Docs-safe + gộp nguồn

**Trạng thái:** done 2026-09-10 — 32 nguồn, Docs-safe, tiêu đề mang số hiệu

Ba việc trong một bộ sinh:

1. **Docs-safe**: bỏ 152 khối `<details>` (thay bằng heading con), bỏ code fence, chuyển
   blockquote thành dòng có nhãn in đậm, bỏ bold trong ô bảng.
2. **Gộp 30 → 15 nguồn** theo bảng trong thiết kế. Nhóm biểu thuế **giữ nguyên 8 file**.
3. **Mỗi tiêu đề điều mang số hiệu văn bản** (`## NĐ 08/2015/NĐ-CP — Điều 5. …`) — điều kiện bắt
   buộc của việc gộp, vì đoạn truy hồi giữa tài liệu không mang theo H1 đầu file.

Thêm dòng cảnh báo cố định đầu mỗi file theo [R17](../business-rules.md). Cảnh báo khi một file
vượt 800.000 ký tự.

**Nghiệm thu:** export ngược một Doc đã convert về `.md`, mọi mốc phân cách Việt/Anh còn nguyên.

---

## TASK-020: Manifest + rclone

**Trạng thái:** done 2026-09-10 — 32/32 đồng bộ; fileId 16 nguồn cũ giữ nguyên 16/16; đẩy lần hai `0 đẩy`; quy tắc chỉ-thêm-không-sửa có test

Manifest với `hash_exported` / `hash_pushed` tách bạch; `hash_pushed` **chỉ ghi sau khi rclone
trả mã thoát 0 cho đúng file đó**, kèm `drive_file_id` và `drive_modtime` từ `rclone lsjson`.

Đẩy **từng file một lệnh** với cả hai cờ `--drive-import-formats md --drive-export-formats md`.
Không bao giờ `rclone sync`. Không bao giờ `--checksum`.

**Nghiệm thu:** (a) chạy hai lần liên tiếp → lần hai báo `0 file mới, 0 ghi đè, 0 đẩy`; (b) sửa
một file, đẩy lại, `drive_file_id` **không đổi**; (c) ngắt mạng giữa chừng → lần chạy sau tự đẩy
lại đúng những file chưa lên.

---

## TASK-021: Nạp đợt đầu + chuyển notebook sang Google Docs

**Trạng thái:** doing — dữ liệu và Drive xong; **chờ chủ dự án thêm 16 nguồn mới vào notebook**

**2026-09-10 tối:** câu test lộ lỗi Google Docs **đánh số lại khoản** trên 31/32 nguồn đã đẩy (xem bẫy 15
trong [thiết kế](../docs/inbox-ingest-workflow.md)). Đã sửa `docs_safe.py`, đẩy lại cùng `fileId`, kiểm bằng
`verify_drive.py`. Nghiệm thu TASK-021 bổ sung: `verify_drive.py` ra `0 lệch` trên cả 32 nguồn.

20 tài liệu trong `~/Downloads/THÔNG TƯ`. Sau đó chuyển toàn bộ notebook sang nguồn Drive: xoá
30 nguồn upload cũ, thêm 20 nguồn Doc mới. **Đây là lần upload lại cuối cùng.**

**Nghiệm thu:** ba câu hỏi trên notebook — một về nội dung lớp C (phải nêu chưa xác định tình
trạng), một về điều khoản thuộc văn bản đã bị thay thế (phải nêu hết hiệu lực), một về thuế suất
(phải **từ chối** nêu con số).

---

## TASK-022: Vá snapshot drizzle 0007–0009, rồi mở enum

**Trạng thái:** blocked — hoãn có chủ đích

`db/migrations/meta/` chỉ có snapshot 0000–0006 trong khi migration đã tới 0009. Phải vá trước,
rồi mới thêm `cong_van` vào `legal_doc_type` và một mức chưa-ban-hành vào `legal_verification`.
Cho tới lúc đó, công văn và lớp C chỉ vào notebook.

---

## Quyết định của chủ dự án — 2026-09-10

| Câu hỏi | Quyết định |
|---|---|
| Cứu dữ liệu VPS? | **Không.** `lookup_confirmation` và `gazette_document` coi như mất. Chấp nhận |
| Nạp NĐ 336/2026 đợt này? | **Có** — đã đưa vào phạm vi TASK-017/018/021, xem dưới |
| Số hiệu R9 trùng nghĩa? | **Đã giải quyết**: giữ nguyên R9 = *Ranh giới phụ lục*, cấp số mới **R18** cho verify-on-use. Thêm số không phá tham chiếu nào; đánh số lại thì có |

**Mục tiêu chủ dự án nêu rõ:** dùng được ngay trên notebook, **đồng thời** backup vào dự án để
sau này dựng lại VPS không phải làm lại. Đường ống này đáp ứng cả hai bằng cùng một sản phẩm:
`.ndjson` commit trong git **là** bản backup — `yarn db:seed:legal` sẽ nạp cả kho kèm mọi văn bản
bổ sung trong giai đoạn không server.

**Hệ quả của việc mất `gazette_document`:** bước dò Công báo trong TASK-017 phải đi thẳng vào
trang danh sách, không có chỉ mục cục bộ. Đã chứng minh khả thi (tìm NĐ 292/2026 ở trang 5;
NĐ 336/2026 ở trang 1) nhưng chậm với văn bản cũ — cần cache kết quả dò vào manifest để không
quét lại mỗi lần.

## Văn bản bổ sung ngoài hộp thư đến

| Số hiệu | Nội dung | congbao id | Vì sao nạp |
|---|---|---|---|
| **336/2026/NĐ-CP** | Thủ tục hành chính đối với hàng hóa XK, NK, quá cảnh; phương tiện vận tải | `470341` | Mới hơn NĐ 292. Đã kiểm Điều 48: nó **thay thế NĐ 85/2019/NĐ-CP** (một cửa quốc gia), **không** thay NĐ 08/2015 — `46/VBHN-BTC` vẫn là căn cứ. Hiệu lực từ 15/10/2026 |

## Việc phát sinh từ đợt đầu

| Việc | Vì sao |
|---|---|
| Tạo OAuth client_id riêng cho rclone (publishing = In production) | `client_id` dùng chung đang bị Google khai tử trong 2026 và đã gặp rate-limit |
| Đo lại `yarn eval` / golden recall@k | Kho từ 7 lên 15 văn bản; recall trên câu hỏi cũ có thể dịch chuyển |
| Rà định kỳ nguồn 90 | 3 tài liệu lớp C có thể được ban hành sau này |
| (Đề xuất) nạp 5 thông tư danh mục rủi ro còn lại | BYT 27, BCA 125, BNNMT 27, BXD 49, BCT 33/2026 — bản gốc của thứ file Excel nội bộ đang tổng hợp |
| Sửa rác HYPERLINK ở GỐC trong `provisions.ndjson` của NĐ 31/2018 | Hiện chỉ lọc ở tầng hiển thị; dữ liệu verified chờ chủ dự án quyết |
| Giữ bộ câu hỏi test notebook trong repo, chạy lại sau mỗi đợt nạp | Câu test bắt được lỗi đánh số lại mà đường ống không bắt |
| **Parser nhận nhầm dòng viện dẫn thành tiêu đề điều** — dòng bắt đầu bằng "Điều N …" giữa thân điều bị coi là tiêu đề, còn tiêu đề thật thành chữ thường: 25/VBHN-BTC (TT 38/2015) Điều 18, 33, 51, 71; 33/2023/TT-BTC Điều 9, 20. Và một **khoản ma** "khoản 20 Điều 10" 46/VBHN-BTC (dòng gập "20.000 tờ khai/năm."). Khoản bị gán sai điều → trích dẫn sai | Tìm bởi đợt kiểm độc lập 2026-09-10. Dữ liệu `verified` từ các giai đoạn trước — **chờ chủ dự án quyết** sửa parser và parse lại |
| **EN2022: đuôi danh sách của nhóm trước tràn sang bản ghi nhóm sau** — phần loại trừ cuối của 84.17 nằm dưới tiêu đề 84.18 | Chưa đo trên toàn bộ 1.306 bản ghi; có thể có hệ thống ở chỗ tiêu đề nhóm rơi giữa trang hai cột |
| `yarn install` — xong 2026-09-13 (đã xoá `node_modules` hỏng và cài lại sạch) | kiểm kiểu `legal.ts`: không có lỗi enum `verification`/`verified_by` (đã khớp sẵn); chỉ còn 1 lỗi TS1343 `import.meta`/`module` dùng chung với `db/seed/index.ts` và `research/task-012-acceptance/validate.ts` — lỗi cấu hình `tsconfig.json` toàn dự án, không phải lỗi riêng của `legal.ts`, không sửa vì ngoài phạm vi Task 1 |

## Kiến thức liên quan

- [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md) — thiết kế đầy đủ
- [Quy tắc nghiệp vụ](../business-rules.md) — R15, R16, R17 sinh ra từ giai đoạn này
- [Nhật ký tiến độ](02-progress.md)
