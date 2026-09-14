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

## TASK-016 … TASK-020 — xong 2026-09-10

| Việc | Kết quả |
|---|---|
| TASK-016 bộ sinh notebook vào repo | `research/inbox-loader/`; render tất định (32/32 file giống hệt giữa hai lần chạy) |
| TASK-017 phân lớp + dò Công báo | `congbao_lookup.py`; kiểm kê theo checklist trong runbook, không có `triage.py` |
| TASK-018 parse hai nhánh | nhánh bảng đọc `w:tbl` / dòng `\x07` vào `annex-tables.ndjson`; cổng chặn: Điều liên tục + rác mã trường |
| TASK-019 `render_notebook.py` | 32 nguồn Docs-safe, mỗi tiêu đề mang số hiệu |
| TASK-020 manifest + rclone | 32/32 đồng bộ, giữ `fileId`, đẩy lần hai `0 đẩy` |

Tiêu chí nghiệm thu từng việc: git `11275bc`.

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

## Kiến thức liên quan

- [Đường ống hộp thư đến](../docs/inbox-ingest-workflow.md) — thiết kế đầy đủ
- [Quy tắc nghiệp vụ](../business-rules.md) — R15, R16, R17 sinh ra từ giai đoạn này
- [Nhật ký tiến độ](02-progress.md)
