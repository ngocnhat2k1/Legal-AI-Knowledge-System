---
type: doc
status: active
updated: 2026-09-13
related:
  - llm-expansion-design.md
  - inbox-ingest-workflow.md
  - evaluation.md
  - ../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md
  - ../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md
  - ../business-rules.md
  - ../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md
  - ../concepts/tariff-system.md
---

# Thiết kế: bot Zalo trả lời ngang hoặc hơn Gemini Notebook

> Bản 2 (2026-09-13, tối). Bản 1 được chủ dự án duyệt rồi đưa qua một đợt kiểm độc lập (3 góc soát,
> mỗi phát hiện một agent phản biện): 21 phát hiện đứng vững, 8 mức chặn. Bản này vá tất cả. Những chỗ
> đổi so với bản 1 đánh dấu **[v2]**.
>
> **Bản 3 (2026-09-13, khuya):** thêm §5b — trình bày kiểu notebook trên Zalo cho các đường đang chạy
> (chữ định dạng, màu do dữ liệu quyết, lọc FTA theo bảng thành viên đã có người xác nhận, dòng phạm vi
> kho từ bảng `decree`, sửa lỗi 69/2018), làm **trước** Mảng 2; §5 trỏ về §5b. Chỗ đổi đánh dấu
> **[v3]**. Đã rà với mã thật khi lập kế hoạch 07 (2026-09-13); chủ dự án cho triển khai và deploy.

## Vì sao

Chủ dự án (2026-09-13): bot Zalo *"trả lời khá rập khuôn, máy móc và không linh hoạt"*; muốn nâng
cấp — kể cả kiến trúc và nguyên tắc câu trả lời — để chất lượng **tương đương hoặc hơn notebook** trên
cùng kho tài liệu, **và mọi thứ vừa nhập vào notebook đợt 2026-09-10 phải có trong đợt nâng cấp này.**

Chẩn đoán từ mã nguồn, không phải từ cảm giác:

| Triệu chứng | Nguyên nhân trong code |
|---|---|
| Câu trả lời cụt, cứng | `legal.generation.ts` ép ≤130 từ, chỉ dùng ≤5 điều đã truy hồi, cấm giải thích ngoài đó |
| Trình bày như biểu mẫu | `format.mjs`: 3 trích dẫn × 480 ký tự, emoji, chân trang lặp trên mọi tin |
| Không biết Chú giải, công văn, bảng phụ lục, ghi chú nghiệp vụ | `db/seed/legal.ts` chỉ nạp `documents/provisions/chunks` — 15 văn bản, chỉ điều khoản |
| Từ chối oan, không tổng hợp được | Một lượt truy hồi, 6 điều, cổng cứng `MAX_DIST = 0.58`; không đọc dài, không so nhiều văn bản |
| Không thể mở rộng đường trả lời | Ngân sách 2 lần `claude -p`/lượt, 45s, tuần tự (quyết định 2026-08-14) |

Notebook hơn bot đúng ở chỗ bot bị trói: đọc cả nguồn dài, tổng hợp nhiều văn bản, viết tự nhiên.
Bot hơn notebook ở chỗ notebook không có: thuế suất tất định, lọc hiệu lực cứng, kiểm trích dẫn, từ
chối khi thiếu căn cứ ([R17](../business-rules.md)). Mục tiêu: **giữ phần sau, lấy thêm phần trước.**

## Quyết định của chủ dự án (2026-09-13)

| Câu hỏi | Quyết định |
|---|---|
| Tầng LLM | **Giữ `claude -p` subscription; nới ngân sách** — tối đa 4 lần gọi/lượt, chờ tới 120s |
| Nơi chạy | ~~Thuê VPS mới 4 core / 8 GB~~ → **đổi cùng ngày: server dev dùng chung của MONA**, dùng lại docker-compose ([ADR](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md)) |
| Bot được đi xa tới đâu | **Tổng hợp tự do từ kho, không dùng kiến thức ngoài** |
| Ai chấm "ngang notebook" | **Chủ dự án tự chấm mù** |
| Hướng kiến trúc | **C — lai, theo giai đoạn** |
| Phạm vi dữ liệu | **Đủ 32 nguồn notebook** — không chỉ các `.ndjson` |

Ghi thành ADR: [Bảng bằng chứng chung và câu trả lời dài có kiểm nguyên văn](../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md).

## Phân rã chương trình

| # | Mảng | Sản phẩm đo được |
|---|---|---|
| 1 | **Nền** | VPS chạy; `yarn eval` in baseline (gồm bộ 14 câu notebook đã có trong repo — **[v2]** `fixtures/legal-golden/notebook-qa.json`); kho nạp lại sau sửa parser có báo cáo diff; **số đo embed mục dài trên VPS** |
| 2 | **Tầng bằng chứng** | `evidence_section` phủ **32/32 nguồn notebook** theo ma trận §2.5; 14/14 câu notebook có bằng chứng truy hồi được (đo bằng `expectEvidence`) |
| 3 | **Đường trả lời** | `POST /answer` + bot dùng nó; test cổng kiểm xanh |
| 4 | **Nghiệm thu** | Chấm mù ≥ 70% thắng/ngang; nhóm an toàn 100% |

Phân loại HS theo GRI/Chú giải (M3–M4 của [kế hoạch mở rộng LLM](../planning/03-llm-expansion-tasks.md))
**không** nằm trong chương trình này. **[v2]** Nhưng câu hỏi "hàng này mã gì" **có** được trả lời từ
công văn / Chú giải chi tiết theo chế độ ứng viên (§3.8) — vì notebook trả lời được, và bỏ đi là mất
ngang bằng ở 3/14 câu test.

---

## 1. Kiến trúc tổng thể

**Giữ nguyên:** Postgres + pgvector; embedder BGE-M3 (1024 chiều); `legal_document` / `legal_provision`
/ `legal_chunk` với bộ lọc hiệu lực cứng; `/tariff` tất định; sổ verify-on-use `lookup_confirmation`;
bộ nhớ hội thoại; đường tắt `đúng/sai/HS đúng là…`; tra đích danh `/legal/provision`; vision;
`tariffByClues` (đường ứng viên từ từ khoá + `/tariff/search`).

**Thêm:**

```
                 ┌──────────────── API ────────────────┐
Zalo ──► bot ──► │ POST /answer                         │
                 │  1 plan (claude -p)  ── intent ──► trả về ngay nếu confirm/correction/general/tariff
                 │  2 retrieve  legal_chunk ∪ evidence  │──► Postgres + pgvector
                 │  3 expand    → mục đầy đủ            │
                 │  4 compose (claude -p)  văn xuôi | ứng viên HS
                 │  5 verify   id ∈ tập, quote ⊂ nguồn, số neo theo câu
                 │  (6 repair, claude -p — khi cần)     │
                 └──────────────────────────────────────┘
      ◄── render cho Zalo: markdown → chữ, tách tin, nguồn cuối tin, khối thuế tất định
```

- **`evidence_section`** — một bảng cho mọi bằng chứng ngoài điều khoản.
- **Module `answer`** (`apps/api/src/modules/answer/`) — thay `legal.generation.ts`. `/legal` và
  `/tariff` giữ hợp đồng; web UI có thể trỏ sang `/answer` sau.
- **`apps/zalo-bot/render.mjs`** — thay phần câu trả lời pháp luật của `format.mjs`; `formatAnswer`
  (khối thuế) giữ và **[v2]** thêm một dòng Chương 98 (§2.2).
- **[v2] `GET /evidence/:id`** — đọc một mục theo id, cho câu hỏi tiếp nối "cho tôi toàn văn…".

Bot vẫn **không phải agent tự do**: số bước cố định, mỗi đầu ra LLM qua cổng code, viết eval lên trên
được. Đúng [ADR 2026-08-14](../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md);
chỉ ngân sách gọi thay đổi.

## 2. Tầng bằng chứng

### 2.1 Bảng `evidence_section`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | bigserial | |
| `kind` | varchar(16) | `hs_note` · `gri` · `en` · `sen` · `ruling` · `guidance` · `annex_table` · `status` · `local_doc` · `draft` · `internal` · **[v2]** `note` · `tariff` |
| `instrument` | text | số hiệu hoặc tên nguồn: `31/2022/TT-BTC`, `CV 1810/TCHQ-TXNK`, `3831/TCHQ-TXNK`, `.agent/concepts/hs-classification.md` |
| `instrument_date` | date | null nếu không có |
| `authority` | varchar(16) | `binding` > `authoritative` > `administrative` > `reference` > `undetermined` |
| `hs_chapter` | smallint | phạm vi; **[v2]** chú giải Phần: NULL, số Phần (`XVI`) vào `meta.phan` |
| `hs_heading` | varchar(5) | `84.18`, nullable |
| `hs_codes` | text[] | **[v2]** mọi mã `\d{4}\.\d{2}\.\d{2}` trích bằng regex từ `body`, cho **mọi** kind — không chỉ công văn |
| `document_number` | varchar(48) | văn bản mẹ (bảng phụ lục, `status`) |
| `title` | text | **[v2] danh tính trích dẫn được, theo kind** — đúng thứ notebook in ở tiêu đề: `Chú giải Phần XVI (TT 31/2022/TT-BTC) — <tiêu đề>`; `Chú giải Chương 84 (TT 31/2022/TT-BTC) — …`; `Quy tắc 2(a) GRI — chú giải`; `Chú giải chi tiết HS 2022 · Chương 84 · nhóm 84.18 — <tên nhóm>`; `SEN 2022 · Chương 84`; `CV 3831/TCHQ-TXNK ngày 15/09/2022 — <trích yếu>`; `<số hiệu hoặc slug> — <tiêu đề> (<tên sheet/mục>, cửa sổ k/n)`; `<H1 file> — <H2>` cho `note` |
| `body` | text | **nguyên văn** |
| `embed_text` | text | **[v2]** `title + "\n" + body[:EMBED_CHARS]`; `EMBED_CHARS` là **số đo** ở §2.6, khởi điểm 6.000 ký tự. Không có `sac_prefix` — danh tính đã nằm trong `title` |
| `embedding` | vector(1024) | HNSW cosine |
| `tsv` | tsvector generated | **[v2]** `to_tsvector('simple', coalesce(title,'') || ' ' || body)` — khác `legal_chunk` (loại `sac_prefix` vì đó là tóm tắt cấp văn bản lặp trên mọi đoạn); `title` ở đây là danh tính riêng từng mục, người dùng gõ đúng chữ đó ("Phần XVI", "16/2026") |
| `effective_from` / `effective_to` | date | |
| `effectiveness` | legal_effectiveness | tái dùng enum có sẵn; **[v2]** cửa sổ `current`/`upcoming` **tính từ ngày**, không từ cột này (cột tĩnh của 336/2026 sẽ cũ sau 15/10/2026) |
| `verification` | legal_verification | mặc định `auto_unverified` ([R18](../business-rules.md)); `note` = `verified`, `verified_by` = tác giả repo |
| `source_ref` | text | file + trang/anchor/H2 để truy vết |
| `meta` | jsonb | nhãn hs2022 của công văn, mặt hàng, `also_contains`, `phan`, `row_from/row_to`, **[v2]** `status` = câu tình trạng nguyên văn của bản ghi notebook-only (gắn cho **mọi** cửa sổ của bản ghi đó) |

Migration **viết tay** `db/migrations/0011_evidence_section.sql` (0010 đã là `0010_tariff_by_subline`) (gồm cả `decision_log` ở §6) + mục
trong `_journal.json`, cùng cách 0007–0009 đã làm. Không chạy `drizzle-kit generate` — snapshot
0007–0009 vẫn thiếu, đó là nợ riêng (TASK-022), không chặn việc này. Bảng khai báo thêm trong
`db/schema/index.ts` để có kiểu. Khoá idempotent: `(kind, instrument, source_ref)`; thân đổi thì
embed lại (so `md5(body)` lưu trong `meta`).

### 2.2 Ánh xạ nguồn → mục

Một mục = một đơn vị **trích dẫn được**. Nạp từ các `.ndjson` trong `db/seed/data/legal/`, **[v2]** từ
sáu ghi chú `.agent/` trong `NGHIEP_VU` của `render_notebook.py`, từ hai đoạn tĩnh của
`research/inbox-loader/static/cach-doc-bieu-thue.md`, và từ bảng `decree`:

| Nguồn | kind | authority | Một mục là | Ước lượng |
|---|---|---|---|---|
| `hs-notes.ndjson` (TT 31/2022) | `hs_note` | **binding** | một chú giải Phần/Chương; `body` = tiếng Việt + `#### Nguyên văn tiếng Anh (WCO)` + `text_en` (134/134 bản ghi có) | 134 |
| `hs-gri.ndjson` | `gri` | **binding** | một quy tắc hoặc một chú giải quy tắc, **[v2]** kèm `text_en` | 18 |
| `hs-explanatory-notes.ndjson` | `en` | authoritative | một bản ghi nhóm (`also_contains` vào `meta`); 96 bản ghi "chú giải chương" có `hs_heading` NULL | 1.306 |
| `hs-sen.ndjson` | `sen` | authoritative | một chương | 97 |
| `classification-rulings.ndjson` | `ruling` | administrative | một công văn; **[v2]** `body` = khối đầu tất định (số hiệu · ngày · cơ quan · danh mục áp dụng · độ tin cậy) + bảng mặt hàng → mã kèm nhãn hs2022 + toàn văn | 29 |
| `notebook-only.ndjson` lớp B | `guidance` | administrative | một công văn hướng dẫn | 2 |
| `annex-tables.ndjson` | `annex_table` | binding (theo văn bản mẹ) | **[v2] một khối dòng liên tiếp ≤ 15.000 ký tự** tại ranh giới dòng, **lặp header ở mỗi khối**; `meta.row_from/row_to`, `anchor`; bỏ bảng letterhead/chữ ký đúng luật `render_annex_tables` (61/134 bảng rỗng) | 73 bảng → ≈115 khối |
| `documents.ndjson` + `relations.ndjson` | `status` | binding | **một văn bản một mục** — sinh tất định, quy tắc ở §2.3 | 15 + 18 = 33 |
| **[v2]** bảng `decree` (`db/seed/index.ts`) | `status` | binding | một nghị định biểu thuế: tiêu đề, hiệu lực từ/đến, "đã nạp N dòng thuế" hoặc "**CHƯA nạp dòng thuế nào** — chỉ ghi nhận tồn tại" (144/2024, 108/2025, 199/2025, 201/2026) | ≈10 |
| **[v2]** `static/cach-doc-bieu-thue.md` §4 "Những gì bộ dữ liệu này KHÔNG có" + §5 "Cảnh báo về độ cũ" | `internal` | reference | một mục "Phạm vi kho biểu thuế", nguyên văn | 1 |
| `notebook-only.ndjson` lớp A-local / A-ocr | `local_doc` | binding | cửa sổ theo §2.4; **[v2]** bản ghi có `mat_hang` (1725/QĐ-BCT, 87 mã) → cửa sổ mang `hs_codes` = mã có trong thân và nhãn `hs2022` trong `meta` (mọi dòng `hien_hanh*` → không kích `old_catalog`) | ≈6 |
| `notebook-only.ndjson` lớp C | `draft` | **undetermined** | cửa sổ theo §2.4; `meta.status` = câu tình trạng kèm bản ghi tra Công báo ([R15](../business-rules.md)) | ≈20 |
| `notebook-only.ndjson` lớp D | `internal` | reference | cửa sổ theo §2.4; sheet Excel = một mục cấu trúc | ≈140 (≈96 nếu bỏ 3 sheet TT 36 đã có trong `annex-tables`) |
| **[v2]** `.agent/` sáu ghi chú (`NGHIEP_VU`: hs-classification, tariff-system, vietnamese-legal-documents, business-rules, customs-declaration, data-sources) | `note` | reference | **một H2 một mục**, bỏ frontmatter như renderer; **bỏ** các H2 "Chưa xác minh / Không được dựa vào", "Xung đột chưa giải quyết", "Kiến thức liên quan"; `instrument` = đường dẫn `.agent/…`, `source_ref` = `file#H2`. `db/seed/evidence.ts` **đọc cùng danh sách** `NGHIEP_VU` (xuất ra `nghiep-vu.json`) để notebook và DB không lệch | ≈65 |
| `/tariff` | `tariff` | binding | **không nạp sẵn** — sinh tức thì (§2.2.1) | — |

Tổng ≈ 2.000 mục.

**2.2.1 Mục `tariff` [v2].** Sinh khi kế hoạch có `scope.hs` (4–8 số):

- 8 số: `body` = phản hồi `/tariff` render tất định, **mỗi mức thuế đúng một dòng, đúng dạng
  `formatAnswer` in**: `MFN: 10% (26/2023/NĐ-CP)`; `• ATIGA: 0% nếu có C/O form D hợp lệ, ngược lại
  10% (MFN)`; `Ngoài hạn ngạch: …`; `Xuất khẩu: …`; `⚠️ CBPG …`; `⚠️ staleness …`. Thêm dòng
  **`Lộ trình 2022→2027`** cho ATIGA/EVFTA khi mức đổi theo năm (`tariff_rate` đã có một dòng mỗi
  năm; `/tariff` thêm tham số `schedule=all` hoặc endpoint `/tariff/schedule?hs=`). Thêm **Chương 98
  hai chiều**: `/tariff` thêm một SELECT `s.code = 'NK_uu_dai_98' AND r.conditions->>'ma_hang_tuong_ung'
  = hs` khi `hs` là mã thường (trả trong `import.chapter98` kèm mã 98xx); khi `hs` là 98xx, trả mã
  tương ứng. Khi không có dòng Phụ lục I: ghi chú *"Mã không có dòng riêng trong Phụ lục I NĐ 26/2023
  đã nạp; NĐ 201/2026 sửa Biểu XK chưa được nạp"* — **không** ghi "0%" cho tới khi chủ dự án xác nhận
  căn cứ.
- 4–7 số: thêm phần **danh mục**: tiêu đề nhóm + một dòng `mã — mô tả` cho mọi mã 8 số dưới tiền tố
  (nhánh prefix của `/tariff/search`, bỏ `LIMIT 25`, trần 200 dòng, dòng khớp mã trong kế hoạch lên
  đầu). Đây là cách nguồn 21–28 vào bot: "nhóm 84.18 gồm những dòng nào", "các mã 8 số cùng phân nhóm".

### 2.3 Sinh mục `status` [v2]

`to` trong `relations.ndjson` là chữ tự do (`43/2017/NĐ-CP (nhãn hàng hóa)`, `khoản 3, 4, 5, 6, 7 Điều
1 Nghị định 13/2022/NĐ-CP`, `Điều 31 và Phụ lục X Nghị định 146/2025/NĐ-CP`). Quy tắc:

- `instrument` = khớp **đầu tiên** của `\d{1,4}/\d{4}/[A-ZĐ][A-ZĐ-]+|\d{1,4}/VBHN-[A-Z]+` trong `to`
  (cùng hình `NUMBER_RE` ở `legal.scope.ts`, thêm hậu tố); phần chữ còn lại → `meta.scope` và một dòng
  thân `phạm vi: …`. Dòng có hai số (111/2021 *(sửa đổi NĐ 43/2017…)*) chỉ sinh cho số đầu.
- **Một mục cho mỗi `instrument` riêng biệt**: 15 văn bản trong kho + 18 đích (19 quan hệ; 13/2022/NĐ-CP
  hai lần → một mục hai dòng). `document_number = instrument`.
- Thân, mỗi dòng một sự kiện, ngày **dd/mm/yyyy** (cùng `fmt_date` của renderer, để qua kiểm 3):
  văn bản trong kho: `<số hiệu> · <tình trạng> · hiệu lực từ <ngày>` + chiều thuận "thay thế / bãi
  bỏ / sửa đổi <to> từ <ngày> — căn cứ <evidence>"; đích ngoài kho: `thay_the`/`bai_bo`/`het_hieu_luc`
  → "hết hiệu lực [phạm vi] từ <ngày> bởi <from> — căn cứ <evidence>", `sua_doi` → "còn hiệu lực,
  được sửa đổi bởi <from> từ <ngày>"; VBHN thêm "hợp nhất <consolidates>" để "08/2015" khớp
  46/VBHN-BTC.
- **Mục `status` mô tả sự kiện, không kế thừa cửa sổ của văn bản bị tác động** — nếu không, bộ lọc
  cứng §3.3 sẽ giấu đúng mục trả lời "không còn áp dụng". `effective_from` = `from_date` nhỏ nhất
  của quan hệ trỏ tới nó (hoặc `effective_from` của văn bản khi không có quan hệ), `effective_to` =
  null, `effectiveness = con_hieu_luc`. Quan hệ có `from_date > as_of` (336/2026 → 85/2019) tự rơi
  vào cửa sổ `upcoming` (§2.4).
- `verification` = `auto_unverified` (mặc định bảng). `evidence.seed.spec.ts` khoá **33 mục**.
- `scope.doc` và "danh mục kho" (§3.2) phân giải trên `legal_document.number | consolidates` **∪**
  `evidence_section.instrument`, không chỉ `legal_document`.

### 2.4 Cửa sổ, hiệu lực, văn bản sắp có hiệu lực

**Cửa sổ cho `local_doc` / `draft` / `internal` [v2].** Cắt theo **mốc cấu trúc trước** (`### Sheet:`,
`<<<TRANG N>>>`, `Điều N`, `Phụ lục`, dòng "A./B. Danh mục…"), rồi mới cửa sổ 4.000/400 bên trong
mỗi mục; **mỗi cửa sổ lặp lại phần đầu của mục** (tên sheet, dòng "Ban hành kèm theo Thông tư…",
dòng tiêu đề cột) ở đầu `body`. Không làm vậy thì cửa sổ thứ hai của sheet "PLI TT36 — RR Cao"
không biết mình thuộc thông tư nào, mức rủi ro nào — câu trả lời sai rủi ro là hệ quả thật. Sheet
"Tong hop TT" nêu 10 số hiệu **không có trong kho** (33/2026/TT-BCT, 27/2026/TT-BYT, 27/2026/TT-BNNMT,
41 và 49/2026/TT-BXD, 125/2026/TT-BCA, 16/2026/TT-BNV, 14/2026/TT-BKHCN, 169/2026/NĐ-CP,
108/2025/QH15) — bot phải nói "văn bản gốc chưa nạp" (nguyên tắc 2, và bước 4 nhận danh mục kho).

**Hai cửa sổ hiệu lực.** `legal_chunk` lọc `effective_from ≤ as_of` nên **NĐ 336/2026 (hiệu lực
15/10/2026) vô hình** trước ngày đó. Truy hồi chạy hai cửa sổ tính **từ ngày**: `current`
(`effective_from ≤ as_of < coalesce(effective_to, ∞)`) và `upcoming` (`as_of < effective_from ≤ as_of
+ 18 tháng`), gắn nhãn từng mục. Mục `upcoming` **không bao giờ** được trình bày như luật hiện hành:
prompt bắt buộc nói "chưa có hiệu lực, từ ngày …", bộ trình bày in nhãn từ dữ liệu.

`draft` (`undetermined`) truy hồi được nhưng mọi trích dẫn từ đó mang nhãn cưỡng chế ở tầng trình
bày kèm **câu tình trạng có bản ghi tra Công báo** ([R15](../business-rules.md)).

### 2.5 Ma trận 32 nguồn notebook → bot [v2]

| Nguồn notebook | Vào bot bằng |
|---|---|
| 00 tình trạng hiệu lực | `status` (33 + ≈10 nghị định biểu thuế) + `warnings.old_catalog` từ `meta` công văn |
| 01 hướng dẫn sử dụng | **không nạp** phần hướng dẫn hỏi (phái sinh cho notebook); "danh mục kho" ở bước 1 thay bảng kiểm kê; §4 + §5 của `cach-doc-bieu-thue.md` nạp thành mục "Phạm vi kho biểu thuế" |
| 10, 11, 12 | `legal_chunk` (nạp lại sau sửa parser) + `status` |
| 13, 14, 15, 16 | `legal_chunk` + `annex_table` + `status`; 16 thêm `local_doc` (NQ 12/2026, QĐ 1725 kèm `hs_codes`) |
| 20 Chú giải + GRI | `hs_note` (song ngữ) + `gri` (song ngữ) + lời dẫn biên tập vào "quy ước đọc bằng chứng" (§4) |
| 21–28 biểu thuế 8 chương | `tariff` theo tiền tố 4–7 số (danh mục) và 8 số (mức thuế + lộ trình) |
| 29 Chương 98 + XK | `tariff` hai chiều Chương 98 + dòng Phụ lục I; ghi chú NĐ 201/2026 chưa nạp |
| 30 kiến thức nghiệp vụ | `note` ≈65 mục |
| 40 công văn | `ruling` + `guidance` |
| 50–57 Chú giải chi tiết | `en` |
| 58 SEN | `sen` |
| 90 chưa xác định | `draft` kèm `meta.status` |
| 91 nội bộ | `internal` theo sheet/mục |

Không có nguồn nào thiếu. Những gì **cố ý không lên notebook** ở đợt 2026-09-10 (file trùng, bản chưa
ký của văn bản đã có bản ký, dữ liệu khách hàng, file cá nhân — danh sách `EXCLUDED` trong
`collect_notebook_only.py`) cũng không vào bot.

### 2.6 Embed mục dài — đo trước, không giả định [v2]

Mọi thứ đã embed tới nay ≤ 1.600 ký tự. Mục mới: Chú giải chi tiết tới 48.998 ký tự, chú giải Phần
≈28.000, công văn ≈11.000. Không có gì đếm token ở phía seed và `apps/embedder/server.py` không đặt
`max_seq_length`. Vì vậy:

1. `apps/embedder/server.py`: `model.max_seq_length = int(os.environ.get("EMBED_MAX_TOKENS", "2048"))`;
   biến vào `docker-compose.yml`. Đây là rào cứng độc lập với seed.
2. Seed gửi lô ≤ 32 mục **hoặc** ≤ 64.000 ký tự mỗi request.
3. **Việc đầu tiên của mảng 2 trên VPS:** embed bản ghi EN dài nhất và một lô 32 mục > 8.000 ký tự;
   ghi giây/mục và RSS đỉnh của container vào mục này; chọn `EMBED_CHARS` / `EMBED_MAX_TOKENS` từ số
   đo. Mốc so sánh đã có: ≈2 s/đoạn ở 1.600 ký tự, ≈55 phút cả kho cũ.

### 2.7 Sửa parser và nạp lại [v2]

Đợt kiểm 2026-09-10 tìm thấy trong dữ liệu **đã xác minh**: tiêu đề điều nhận nhầm từ dòng viện dẫn
(25/VBHN-BTC Điều 18/33/51; 33/2023/TT-BTC Điều 9/20) và khoản ma "20" ở Điều 10 46/VBHN-BTC.

- (a) `DIEU_REFERENCE` **đã có** (`parse_provisions.py:50-54`, commit f19dcfd, test
  `test_parse_provisions.py:71`) — `provisions.ndjson` **chưa được sinh lại** từ nó. Việc cần làm: tải
  lại nguồn theo `corpus.json` (thư mục `research/legal-loader/doc/` bị gitignore, hiện rỗng), chạy
  lại parser hiện tại. Diff phải cho đúng 5 tiêu đề đổi (Điều 71 là tiêu đề thật mất dấu chấm — giữ).
  Không đổi → mở rộng regex và thêm ca thật.
- (b) `KHOAN`: loại nhóm nghìn sau dấu chấm — `20.000 tờ khai/năm.` không phải khoản. Hai ca hồi quy.
  Tolerance `\d*` (footnote dính) không có dòng nào trong kho dùng; bỏ hoặc giữ kèm loại trừ, sửa
  comment cho khớp.
- **Báo cáo diff** theo điều: tiêu đề cũ/mới, 80 ký tự đầu thân, **danh sách số khoản cũ/mới**
  (46/VBHN-BTC Điều 10: 1,2,3,4,20,5,6 → 1,2,3,4,5,6). Năm văn bản: 54/VBHN-VPQH, 96/VBHN-VPQH,
  46/VBHN-BTC, 25/VBHN-BTC, 33/2023/TT-BTC. Chủ dự án duyệt → giữ `verified` với `verified_by`; không
  duyệt → `auto_unverified` ([R18](../business-rules.md)).

## 3. Đường trả lời — một lượt

### 3.1 Hợp đồng `POST /answer` [v2]

Yêu cầu:

```json
{
  "q": "câu hỏi mới",
  "asOf": "2026-09-13",
  "channel": "zalo",
  "context": {"turns": [{"role": "user|bot", "body": "…"}],
              "state": {"tariff": {…}, "legal": {"evidenceIds": [12, 40], "citations": [...]}, "topic": "legal"}},
  "scope": {"doc": "38/2015/TT-BTC", "article": "18", "clause": null, "hs": "8418"},
  "forceIntent": null
}
```

Trả về:

```json
{
  "plan": {"intent": "legal|status|mixed|hs|tariff|general|confirm|correction|refine",
           "question": "câu hỏi độc lập", "queries": ["…"], "kinds": ["status"], "asOf": "…",
           "scope": {"doc": null, "article": null, "hs": "8418"},
           "verdict": null, "reply": null, "keywords": [], "hsHints": [], "origin": null, "reuseLastHs": false},
  "answerMd": "…[1]…[2]…",
  "candidates": [{"hs": "8806", "level": 4, "label": "Phương tiện bay không người lái", "evidence": [1]}],
  "citations": [{"n": 1, "id": 812, "kind": "status", "instrument": "43/2017/NĐ-CP", "label": "Tình trạng 43/2017/NĐ-CP",
                 "quote": "…", "url": null, "authority": "binding", "verification": "auto_unverified",
                 "window": "current", "status": null}],
  "coverage": "full|partial|none", "missing": "…",
  "warnings": ["unverified", "undetermined", "upcoming", "old_catalog", "note_only"],
  "evidenceIds": [812, 40, 1201], "followups": ["…"],
  "calls": 2, "timingMs": {"plan": 8100, "retrieve": 900, "compose": 61200, "verify": 30}
}
```

**Trả về ngay sau bước 1** (`calls: 1`, `answerMd: ""`) khi `plan.intent ∈ {confirm, correction,
general, tariff}` — bot xử lý bằng đường tất định đã có (§5). `refine` được kế hoạch gấp vào một
`question` độc lập rồi đi tiếp như `legal`. `url` chỉ có với văn bản Công báo; các kind khác `null`.

### 3.2 Bước 1 — kế hoạch (`claude -p` #1, trần 30s)

Vào: 6 lượt gần nhất, trạng thái đang mở, **danh mục kho** — số hiệu văn bản trong `legal_document`
∪ `status` (kể cả các mục "CHƯA nạp") ∪ mục "Phạm vi kho biểu thuế" — và tin nhắn mới. Ra (JSON một
dòng, qua `normalize`):

- `intent` — **[v2]** tập của router hôm nay ∪ mới: `{tariff, legal, general, confirm, correction,
  refine, status, hs, mixed}`; giữ `verdict` (confirm), `reply` (general), `keywords`/`hsHints`/
  `origin`/`reuseLastHs` (tariff) đúng như `router.mjs`.
- `question` độc lập; `queries` 3–5 cách diễn đạt gồm một truy vấn kiểu "câu trả lời giả định";
- `scope`: số hiệu **chỉ khi người dùng viết ra** (`docNumberStatedIn` giữ nguyên); điều; khoản;
  `hs` 4–8 số;
- `kinds` — **[v2] gợi ý, không phải bộ lọc**; thiếu/rỗng không ảnh hưởng truy hồi;
- `asOf` nếu câu hỏi nêu thời điểm.

Kế hoạch **không** viết lời dẫn (`lead` bỏ).

### 3.3 Bước 2 — truy hồi (code)

Với mỗi truy vấn: embed (sidecar) → một câu SQL lai từ khoá + vector trên **`legal_chunk`** và một câu
tương tự trên **`evidence_section`** (cùng khuôn `hybridRetrieve`: RRF, `RRF_K = 12`, 50 ứng viên mỗi
nhánh), lọc cứng **hiệu lực (hai cửa sổ) + phạm vi văn bản**. **[v2]** `kinds` **không** lọc — chỉ
dùng ở bước đa dạng hoá. Gộp các truy vấn bằng RRF trong code. Đa dạng hoá: tối đa 4 mục/văn bản, ít
nhất 1 mục mỗi `kind` kế hoạch gợi ý nếu có điểm > 0. Giữ top 15.

**[v2] Phạm vi HS.** `scope.hs` chuẩn hoá về chữ số (2–8 số) và **chỉ** lọc các kind có phạm vi HS
(`hs_note`, `en`, `sen`, `ruling`, `annex_table`, `local_doc`): giữ mục khi `hs_chapter` = 2 số đầu,
hoặc `replace(hs_heading,'.','')` = 4 số đầu, hoặc một phần tử `hs_codes` bắt đầu bằng `scope.hs`,
**hoặc mục không có phạm vi HS** (cả ba cột NULL — chú giải Phần, GRI, lời nói đầu SEN). Kind khác
không lọc theo HS.

**[v2] Từ khoá.** `toTsQuery` giữ `\d{2}\.\d{2}` làm **một** token (parser `simple` chỉ mục `84.18`
thành một lexeme; tách `84 | 18` chỉ bắt "Điều 18"); khi `scope.hs` ≥ 4 số thêm dạng chấm vào
tsquery. Test: `toTsQuery('nhóm 84.18')` → `nhóm | 84.18`. Kiểm luôn giả định về số hiệu
(`69/2018/NĐ-CP` có bị parser gộp thành một lexeme `file` không) bằng một test SQL thật.

Cổng liên quan: giữ `MAX_DIST` nhưng nới lên **0.70** — **chỉ chốt sau khi eval** chứng minh recall
tăng mà tỉ lệ trả lời sai không tăng.

### 3.4 Bước 3 — mở rộng (code)

| Mục | Mở thành |
|---|---|
| khoản (`legal_chunk`) | **toàn điều** + 1 khoản trước/sau nếu điều rất dài |
| `en` / `sen` / `hs_note` / `gri` / `note` / `status` | cả mục |
| `ruling` / `guidance` | cả mục (khối đầu + bảng mặt hàng + toàn văn) |
| `annex_table` | **[v2]** khối khớp (+ khối kề nếu mã HS trong kế hoạch nằm ở biên); trong khối, dòng khớp mã lên đầu |
| `local_doc` / `draft` / `internal` | cửa sổ khớp + cửa sổ kề cùng mục |
| `tariff` | cả mục (danh mục nhóm + mức thuế + lộ trình) |

Trần **40.000 token** (≈120.000 ký tự) — xếp theo `authority` rồi điểm, cắt phần đuôi. Mỗi mục vào
prompt: `[id=NNN] <title> — <instrument> · <authority> · <window>` + (nếu có) `TÌNH TRẠNG:
<meta.status>` + thân.

### 3.5 Bước 4 — viết (`claude -p` #2, trần 100s)

Prompt gồm: nguyên tắc câu trả lời (§4), **[v2] khối "quy ước đọc bằng chứng"** cố định (thứ tự GRI
là bắt buộc; Chú giải 1 của Phần là *loại trừ*; Chương 98 có điều kiện, không phải mức mặc định;
chú giải nhãn hs2022; NĐ 201/2026 sửa Biểu XK chưa nạp — chép nguyên văn từ các lời dẫn biên tập
của `render_notebook.py`), câu hỏi độc lập, hội thoại rút gọn, **danh mục kho**, bằng chứng. Ra:

```json
{"answerMd": "…[1]…", "citations": [{"n": 1, "id": 812, "quote": "≥ 12 từ nguyên văn"}],
 "coverage": "full|partial|none", "missing": "…", "followups": ["…"]}
```

Với `intent = hs` ra thêm `candidates` (§3.8).

### 3.6 Bước 5 — kiểm (code, `apps/api/src/modules/answer/guards.ts`)

Hợp nhất `validateCitations`, `sanitizeLead`, `docNumberStatedIn` vào một module và thêm:

1. **`id ∈ tập truy hồi`**.
2. **`quote ⊂ body`** sau chuẩn hoá (NFC, gộp khoảng trắng, bỏ dấu câu đầu/cuối, không phân biệt
   hoa/thường). Kiểm **sự hậu thuẫn** ở mức chuỗi ([R10](../business-rules.md)); chưa phải kiểm suy
   diễn — ghi rõ giới hạn.
3. **[v2] Số liệu neo theo câu.** Tách `answerMd` thành câu. Mọi `\d+([.,]\d+)?\s*%`, tiền
   (`\d[\d.,]*\s*(USD|VND|đ)`), mã HS `\d{4}(\.\d{2}){1,2}`, số hiệu `\d+/\d{4}/…`, ngày `dd/mm/yyyy`
   trong một câu phải nằm (sau chuẩn hoá như kiểm 2) **trong `quote` của một `[n]` có mặt trong chính
   câu đó** — không phải "đâu đó trong hợp các thân bằng chứng". Lý do: thân mục `tariff` có cả
   "MFN 10%" lẫn "ATIGA 0% nếu có C/O"; kiểm theo hợp cho câu "MFN là 0%" đi qua — đúng câu
   [R6](../business-rules.md) gọi là sai. **Riêng mục `tariff`: `quote` phải bằng nguyên một dòng
   mức thuế** (biểu + mức + điều kiện + nghị định), không phải con số trần. **Miễn trừ:** số hiệu,
   mã HS, ngày mà **chính người dùng đã viết** trong tin nhắn / `plan.question` (so bằng
   `docNumberStatedIn`, bỏ số 0 đầu) — để nói được "kho không có NĐ 8/2015" hay "336/2026 không thay
   NĐ 08/2015". `%` và tiền **không** được miễn.
4. **[v2] Nhãn điều khoản:** "Điều N <văn bản>" nêu trong câu phải khớp `label` của một trích dẫn còn
   sống **hoặc** là chuỗi con của thân một trích dẫn còn sống (căn cứ "điểm b khoản 4 Điều 97 NĐ
   37/2026/NĐ-CP" nằm trong thân mục `status`). Trích dẫn `note` **không** thoả kiểm 4 và **không**
   được là `[n]` duy nhất sau một khẳng định pháp lý → `warnings.note_only` + coi như vi phạm.
5. **`[n]` mồ côi** → xoá dấu.

Có vi phạm → **bước 6, sửa** (`claude -p` #3, trần 45s): gửi lại câu trả lời + danh sách vi phạm +
bằng chứng, yêu cầu viết lại chỉ dùng trích dẫn còn sống. Kiểm lần hai; còn vi phạm → **cắt câu** và
thêm dòng "một phần câu trả lời bị lược vì không dẫn được nguồn". Không bao giờ trả câu văn không nguồn.

### 3.7 Ngân sách và thời gian

| Gọi | Khi | Trần |
|---|---|---|
| #1 kế hoạch | mọi lượt không đi đường tắt | 30s |
| #2 viết | lượt có bằng chứng, intent ∈ {legal, status, mixed, hs} | 100s |
| #3 sửa | chỉ khi kiểm thấy vi phạm | 45s |
| #4 vision | chỉ khi có ảnh, trước #1 | 45s |
| **[v2]** gọi lại với `forceIntent` | chỉ khi `guardIntent` bác `plan.intent` (hiếm) | thay #2 |

Thường 2 lần, tối đa 4, tổng dưới 120s ở p95. Bot gửi ngay "🔍 Đang tra…" cho mọi tin không đi đường
tắt/tra HS trực tiếp. Không có bằng chứng sau bước 2 → **không gọi #2**, trả lời "không tìm thấy" kèm
những gì đã tìm.

### 3.8 Chế độ ứng viên cho câu hỏi mã HS [v2]

`intent = hs` ("hàng này mã gì", "Flycam vào nhóm nào") **có** compose, nhưng theo hợp đồng của
[ADR HS là ứng viên](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md):

- Ra thêm `candidates`: **1–3** mục `{hs (4/6/8 số), level, evidence: [n…]}`; mỗi ứng viên phải có
  ≥ 1 trích dẫn còn sống mà `quote` chứa mã đó; mã phải **tồn tại** trong `hs_description` (hoặc nhóm
  4 số tồn tại). Mã trong `answerMd` ⊂ danh sách ứng viên. Vi phạm → cắt như §3.6.
- **[R4](../business-rules.md):** mã HS người dùng nêu trong tin nhắn **bị gỡ khỏi `plan.question`**
  trước bước 4 và không vào prompt; sau khi có ứng viên, code so mã đó với danh sách và bộ trình bày
  in "mã bạn nêu có/không nằm trong ứng viên".
- Bộ trình bày **luôn** in khối "ỨNG VIÊN — cần chuyên viên chốt" (cùng giọng `tariffByClues`), kèm
  khối thuế tất định của ứng viên đầu qua `/tariff`; mã đến từ công văn cũ mang `old_catalog`.
- Hai ứng viên ngang nhau → câu gợi ý xác định trước mã số theo Điều 28 ([R5](../business-rules.md)).

`intent = tariff` (mã 8 số + hỏi thuế) **không** compose — đường tất định `answerByHs`/`tariffByClues` giữ.

## 4. Nguyên tắc câu trả lời

| # | Nguyên tắc | Cưỡng chế |
|---|---|---|
| 1 | Trả lời thẳng ở câu đầu; độ dài theo câu hỏi | prompt |
| 2 | Tổng hợp, giải thích, so sánh **tự do trong phạm vi bằng chứng**; mọi khẳng định pháp lý có `[n]`; không dùng kiến thức ngoài; kho không có thì nói thiếu gì (kể cả "văn bản gốc chưa nạp" khi bằng chứng là sheet nội bộ) | prompt + kiểm 2, 3, 4 |
| 3 | Xếp hạng thẩm quyền hiển thị; `note` là ghi chú của dự án, không phải căn cứ pháp lý ([R2](../business-rules.md)) | `authority` in từ dữ liệu; `note_only` |
| 4 | Thuế suất chỉ trích **nguyên dòng** từ mục `tariff`; mã HS chỉ theo chế độ ứng viên §3.8 ([R1](../business-rules.md), [R2](../business-rules.md)) | kiểm 3 neo theo câu; `candidates`; khối thuế tất định |
| 5 | Văn bản bị thay thế: nói ngay và chỉ văn bản thay thế; chưa có hiệu lực: nói ngày ([R8](../business-rules.md)) | mục `status`; nhãn `upcoming` từ dữ liệu |
| 6 | Hai nguồn mâu thuẫn → trình bày cả hai ([R5](../business-rules.md)) | prompt |
| 7 | Giọng đồng nghiệp, không mẫu câu cố định, không emoji trang trí; **một** dòng cảnh báo từ `warnings` | bộ trình bày |
| 8 | Không nhắc lại nguyên văn dài trong thân; nguyên văn ở danh sách nguồn | prompt |
| 9 | **[v2]** Khối "quy ước đọc bằng chứng" (§3.5) là hằng số trong prompt, không phải bằng chứng | code |

## 5. Bot Zalo [v2]

- Luồng: `fastPath` (đường tắt) → ảnh → mã HS 8 số trong tin (`answerByHs`) → **`/answer`**.
  `parseQuery` bắt thêm dạng `\d{4}\.\d{2}` và "nhóm dddd" để "mã X có đúng không" đi đường ứng viên
  tất định, không vào prompt ([R4](../business-rules.md)).
- `guardIntent(plan.intent, {topic, tariffFresh, quoteText})` như nay ([R13](../business-rules.md));
  `INTENTS` thêm `status`, `hs`, `mixed` **pass-through** (không ghi sổ kiểm chứng). Test:
  `guardIntent('status', {topic:'tariff', tariffFresh:true}) === 'status'` — không bao giờ thành
  `tariff`. Guard bác → gọi lại `/answer` với `forceIntent`.
- Theo intent: `confirm`/`correction` → `handleConfirm`/`handleCorrection`; `general` → `plan.reply`;
  `tariff` → `answerByHs`/`tariffByClues` với `keywords`/`hsHints` từ kế hoạch; `legal`/`status`/
  `mixed`/`hs` → `render.mjs`.
- **`render.mjs`** — **[v3]** bộ trình bày duy nhất, định nghĩa ở [§5b](#5b-trình-bày-kiểu-notebook-trên-zalo-v3):
  `answerMd` đi qua `md()` (tập Markdown con §5b.1 — `**x**` giữ thành chữ đậm bằng `styles` của `zca-js`,
  không còn bỏ dấu; `## ` → dòng đậm, không in hoa; `- ` → danh sách Zalo; `[n]` giữ); bảng → `a · b · c`;
  cuối tin danh sách nguồn chữ nhỏ nghiêng `[1] <label> (<instrument>)` + link **chỉ khi có**; trên
  dòng nguồn in `authority`/`window`/`meta.status` khi không phải `binding`/`current`; `note` in
  "ghi chú nghiệp vụ của dự án — không phải căn cứ pháp lý". Một dòng cảnh báo (cam) từ `warnings`, do
  `render()` cưỡng chế. Khối `candidates` và khối thuế (`formatAnswer`, thêm dòng `Chương 98: <98xx> ↔
  <mã thường> · <thuế> · có điều kiện`) đặt **dưới** câu trả lời, theo mẫu §5b.3 và §5b.5.
- **Tách tin** — **[v3]** làm trong `render()` (§5b.1): ~1.800 ký tự tại ranh giới đoạn, `(k/n)` ở cuối
  mỗi tin. Giới hạn thật vẫn là *giả định* — đo khi triển khai; `zca-js` 2.1.2 đã có trong `node_modules`
  và phía client chỉ chặn tin rỗng.
- Bộ nhớ hội thoại: `state.legal.evidenceIds` + `citations` (cùng tên trường `router.stateOf` đọc);
  "cho tôi toàn văn điều đó" → `/legal/provision`; "toàn văn mục đó" → `GET /evidence/:id`.

## 5b. Trình bày kiểu notebook trên Zalo [v3]

> Chủ dự án (2026-09-13, sau khi thử bot live): câu trả lời "quá cứng nhắc", khác giọng và bố cục
> notebook trên cùng nguồn; muốn đồng bộ giọng, bố cục và định dạng (đậm, nghiêng, màu theo nghĩa). Thứ
> tự đã chốt: phần này trước, Mảng 2 ngay sau; phần này **không** chặn và **không** làm trùng Mảng 2/3.
> Quyết định: [ADR chữ định dạng Zalo theo giọng notebook](../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md).

**Phạm vi.** Đổi cách trình bày trên các đường **đang chạy** (`/tariff`, `/tariff/search`, `/legal`,
`/legal/provision`), cộng các thay đổi API nhỏ (§5b.4, §5b.6, §5b.8) và một dòng `norm` ở
`apps/eval/notebook.ts` (§5b.9). Không đổi dữ liệu thuế, không đổi hợp đồng ứng viên HS, không thêm lần
gọi LLM.

**Ký hiệu trong ví dụ:** `**x**` đậm · `*x*` nghiêng · `{xanh: x}` `{cam: x}` `{đỏ: x}` màu ·
`{nhỏ: x}` chữ nhỏ nghiêng · `•` dòng mang kiểu danh sách của Zalo (dấu chấm do Zalo vẽ, **không** nằm
trong `msg`).

### 5b.1 `apps/zalo-bot/render.mjs` — bộ trình bày duy nhất

Module thuần (không I/O, không import `zca-js`):

```js
// Line = { segs: Array<string | [string, ...Mark]>, marks?: Mark[] }  — segs rỗng = dòng trống (ranh giới đoạn)
export const L = (segs, ...marks) => ({ segs, marks });
export function md(text): Line[]          // CHỈ cho văn xuôi LLM: router `reply`, `/legal` `answer`, (Mảng 3) `answerMd`
export function toText(input): string     // chữ thuần: sanitizeLead, botText, test — không bao giờ làm thân bằng chứng (§5b.10)
export function render(input, { budget = 1800 } = {}): Array<{ msg: string, styles: Style[] }>
// input: string (một khối chữ thuần, không đọc ký hiệu) | Line[]
```

**Hai đường vào, một đầu ra.** Builder tất định (`format.mjs`) dựng `Line[]` từ đoạn chữ + nhãn ngữ
nghĩa — chỉ ở đây mới có màu. Văn xuôi LLM đi qua `md()`, và tập nhãn đầu ra của `md()` là `{b, i, ul,
ol}` theo cấu trúc hàm: không có cú pháp nào sinh màu. "Màu do code quyết từ dữ liệu" vì vậy đúng bằng
code, không bằng prompt.

**Nhãn → `TextStyle`** (zca-js 2.1.2, `node_modules/zca-js/dist/apis/sendMessage.d.ts`):

| Nhãn | Dùng cho | `st` gửi đi |
|---|---|---|
| `b` | mã HS, mức thuế, số hiệu, ý chính | `b` (Bold) |
| `i` | tên hàng, mô tả phụ, gợi ý kết | `i` (Italic) |
| `green` | mức ưu đãi **khi điều kiện xác định được là đáp ứng** (§5b.3) | `c_15a85f` (Green) |
| `orange` | cần chuyên viên chốt / chưa chắc | `c_f27806` (Orange) |
| `red` | cảnh báo pháp lý: không được hưởng, chống bán phá giá, hết/chưa có hiệu lực | `c_db342e` (Red) |
| `small` | cỡ nhỏ | `f_13` (Small) |
| `ul` / `ol` | nhãn dòng: danh sách | `lst_1` / `lst_2` |
| `note` (bí danh) | nguồn, ghi chú, chân trang | `f_13` + `i` |
| `warn` (bí danh dòng) | dòng cảnh báo | mọi dòng `warn` của một lần `render` **gộp thành một** dòng `c_f27806` ở vị trí dòng `warn` đầu tiên, nối bằng `; `. Không dòng nào bị hạ thành chữ nhỏ: cảnh báo "bot tự nạp, chưa có người đối chiếu" (R18) hay dòng phạm vi kho không bao giờ bị thu nhỏ chỉ vì đứng sau |

Không dùng `u`, `s`, `c_f7b503` (Yellow), `f_18` (Big), `ind_$`. Bảng nhãn là hằng trong `render.mjs`;
test so nó với `TextStyle` import từ `zca-js` để bắt lệch khi nâng phiên bản.

**`md()` — tập Markdown con.** Chuẩn hoá NFC, `\r\n` → `\n`, gộp dòng trống liên tiếp.

- Đầu dòng: `- `, `* `, `• ` → `ul`; `1. ` hoặc `1) ` → `ol`; `#` đến `###` + khoảng trắng → cả dòng
  `b` (không in hoa, không `Big`). Tiền tố bị bỏ khỏi chữ.
- Trong dòng: `**x**` → `b`; `*x*` → `i`; lồng `**a *b* c**` được. Dấu mở phải đứng ngay trước chữ, số
  hoặc `*`; dấu đóng đứng sau ký tự không trắng; cặp nằm trên cùng dòng. `*` có chữ hoặc số **ở cả hai
  bên**, hoặc đứng sát `(` hay `)`, không bao giờ là dấu (`173.6*162.6*12.1`, `a*b`, `0405.90.10 (*)` —
  dấu loại trừ trong văn bản); `\*` → `*`, `\\` → `\`. Dấu không khép → giữ nguyên là chữ.
- `[n]` giữ nguyên là chữ. Mọi cú pháp khác (`__`, `~~`, backtick, link, HTML, thẻ kiểu `{red}`) là chữ.

**Thoát ký tự — một quy tắc:** *chỉ chuỗi được đưa vào `md()` mới bị đọc ký hiệu.* Nguyên văn điều
khoản, dòng thuế (`*` = loại trừ), tên người gửi, số hiệu, tiêu đề Công báo luôn vào `Line` dưới dạng
đoạn chữ thuần, và `render()` không diễn giải ký tự nào. Builder không bao giờ gọi `md()` trên dữ liệu
DB hay chữ người dùng.

**Offset.** `start`/`len` là chỉ số chuỗi JavaScript (đơn vị UTF-16, `String.prototype.length`) trên
`msg` đã NFC — đúng cách của tin mẫu đã hiện đúng trên điện thoại và Zalo PC (465 ký tự, 25 kiểu).
Emoji đếm 2. Nhãn đoạn phủ đúng đoạn; nhãn dòng phủ `[đầu dòng, cuối dòng)`, không gồm `\n`. Nhãn chồng
nhau → nhiều `Style` cùng khoảng (đậm + xanh = hai mục). Đoạn rỗng không sinh style.

**Tách tin.** Tách trên `Line[]` **trước** khi tính offset, nên mỗi tin tính style từ 0 — không có phép
dời gốc nào để sai:

1. Gom dòng thành đoạn (ngăn bởi dòng trống). Xếp tham lam từng đoạn vào tin hiện tại khi tổng độ dài
   ≤ `budget − 8` (chừa chỗ `(k/n)`).
2. Một đoạn dài hơn ngân sách → xếp theo dòng. Một dòng dài hơn ngân sách → cắt ở ranh giới đoạn chữ;
   đoạn không nhãn được cắt ở khoảng trắng cuối cùng trước ngưỡng; **đoạn có nhãn không bị cắt**, trừ
   khi chính nó dài hơn ngân sách (builder không sinh đoạn như vậy) — khi đó cắt ở khoảng trắng và hai
   nửa cùng giữ nhãn. Nhãn dòng lặp trên cả hai nửa.
3. Bỏ dòng trống đầu/cuối mỗi tin. Có hơn một tin → thêm dòng `note` `(k/n)` ở cuối mỗi tin.

`budget = 1800` là hằng mặc định, không phải biến môi trường. Giới hạn thật của Zalo vẫn chưa đo; phía
client, `zca-js` chỉ chặn tin rỗng.

**Gửi (`index.mjs`).**

```js
const parts = render(result.text);
await api.sendMessage({ ...parts[0], quote: msg.data }, msg.threadId, msg.type);
await saveContext({ /* as today */ botText: parts.map((p) => p.msg).join('\n\n') });
for (const p of parts.slice(1)) {
  // Part 1 is delivered and remembered: a later failure only logs, never sends the generic error.
  await api.sendMessage(p, msg.threadId, msg.type).catch((e) => console.warn('[zalo] send part failed:', e?.message));
}
```

`quote` chỉ gắn vào tin đầu; các tin gửi tuần tự, chờ từng tin. Lỗi ở tin đầu vẫn rơi vào `catch` chung
như nay; ghi nhớ đi ngay sau tin đầu, để "đúng"/"sai" tiếp theo còn `tariffFresh` dù tin sau hỏng. `zca-js` gắn `textProperties` cả ở
nhánh `/quote` (đã đọc `sendMessage.js`), nhưng tin mẫu chưa thử kèm quote → gửi thử là bước kiểm tay
bắt buộc (§5b.9). Ba chỗ gửi còn lại (ack ảnh, lỗi chung, báo cáo nạp) cũng đi qua `render()`.

**Seam giữ nguyên, kiểu trả về đổi.** `text` trong kết quả của mọi hàm `answer.mjs` giờ là
`string | Line[]`.

| Hàm (`format.mjs`) | Trả về |
|---|---|
| `sanitizeLead(lead, block, max = 400)` | `string`; `block` là chữ thuần (`toText`) |
| `withLead(lead, lines)` | `Line[]`: `sanitizeLead(lead, toText(lines))`; lời dẫn còn lại thành một dòng thuần + dòng trống **đặt trước** `lines`, không bao giờ thay dòng nào của `lines` |
| `confirmFooter(c)` | `Line` hoặc `null` khi chưa có lịch sử xác nhận (lời mời do `formatAnswer` viết) |
| `formatAnswer`, `formatLegal`, `formatProvisions`, `formatMissingDoc`, `formatIngestQueued`, `formatIngestReport`, `formatGeneral`, `sourceLines` | `Line[]` |

Chỗ gọi đang ghép chuỗi phải đổi: `answer.mjs:345` (`handleCorrection`) →
`[L([head]), L([]), ...formatAnswer(…)]`, nhánh lỗi `answer.mjs:337` thành `Line[]` tương tự;
`index.mjs:310` → `for (const p of render(formatIngestReport(r))) await api.sendMessage(p, r.threadId, type)`;
`index.mjs:194` → `formatGeneral(routed?.reply)` (§5b.7).

### 5b.2 Giọng và bố cục chung

Rút từ câu trả lời notebook mẫu (ví dụ 1 ở §5b.3 là bản bot của chính câu hỏi đó):

1. **Câu dẫn tự nhiên** nêu thẳng dữ kiện chính, dữ kiện **đậm**. Khối thuế có câu dẫn do code viết từ
   dữ liệu; lời dẫn LLM (`lead`) chỉ còn ở hai chỗ chưa có câu dẫn riêng: ứng viên HS (`tariffByClues`)
   và nguyên văn theo trích dẫn (`formatProvisions`). Router vẫn trả `lead` (Mảng 3 bỏ, §3.2).
2. **Gạch đầu dòng chỉ cho lựa chọn thật** (có/không C/O, nhiều biểu, nhiều ứng viên, các trường hợp
   luật liệt kê). Một kết quả duy nhất → một câu.
3. **`[n]` ngay sau dữ kiện**; danh sách nguồn chữ nhỏ nghiêng ở cuối.
4. **Tối đa một dòng cảnh báo** (cam) mỗi câu trả lời — `render()` cưỡng chế qua `warn`. Dòng đỏ (không
   được hưởng, chống bán phá giá, hiệu lực) là **nội dung** làm đổi nghĩa vụ, không tính vào giới hạn.
   Ghi chú dữ liệu từ API là `note`.
5. **Không emoji trang trí, không viết HOA để nhấn** — nhấn bằng đậm hoặc màu. Bỏ `📋 📦 📖 💡 ⚠️ ℹ️
   📌 ✅ ❌ ⏳ 🔍 ⛔ ↗`. Chữ viết hoa sẵn của ký hiệu (`NĐ-CP`, `MFN`, `ACFTA`) giữ.
6. **Gợi ý kết** (tuỳ chọn, chữ nghiêng): code chọn từ danh sách cố định theo trạng thái câu trả lời,
   chỉ đề nghị việc bot làm được **ngay với dữ liệu hiện có** — cho biết xuất xứ, hoặc tra xuất xứ khác,
   chỉ khi bảng thành viên đã xác nhận (chưa xác nhận thì xuất xứ nào cũng ra cùng các dòng); nạp văn
   bản có trên Công báo. LLM không viết gợi ý; không bao giờ gợi ý chủ đề kho không có dữ liệu (VAT,
   TTĐB, BVMT, thủ tục). Sau danh sách nguồn có **tối đa một** dòng kết (§5b.3 mục 7).
7. Ngày hiển thị `dd/mm/yyyy`.

### 5b.3 Trả lời thuế (`formatAnswer`, tất định — R1)

**Dữ liệu vào:** `TariffResponse` cộng các trường mới ở §5b.4. Bot **không** tự ghép mức thuế: in
`PreferentialView.rate` hoặc `RateView.statement` nguyên văn.

**Tên xuất xứ:** hằng `ORIGIN_LABEL` trong `parse.mjs`, cạnh `ORIGIN_CODE` (CN Trung Quốc, JP Nhật Bản,
KR Hàn Quốc, AU Úc, NZ New Zealand, TH Thái Lan, MY Malaysia, SG Singapore, ID Indonesia, PH Philippines,
DE Đức, EU EU, GB Anh, US Hoa Kỳ, VN Việt Nam, IN Ấn Độ); không có thì in mã. Chỉ để hiển thị, không bao
giờ dùng để đọc xuất xứ.

**Mỗi dòng FTA** (`r.import.preferential`) in theo `type`, `originExcluded`, `sublines`,
`originEligible`. Hàng đầu tiên của bảng mà dòng thuế khớp là cách in:

| Trạng thái | Cách in |
|---|---|
| `type === 'excluded'` | "**{schedule} (form {form})**: {đỏ: không được hưởng} — dòng này bị loại khỏi biểu [n]". Không có con số |
| `originExcluded === true` | "**{schedule} (form {form})**: {đỏ: không được hưởng} — NĐ {decree} loại trừ hàng xuất xứ {nhãn} ở dòng này [n]". Không có con số |
| `originEligible === false` | ẩn; tên biểu vào dòng "Đã ẩn" (dạng A) hoặc câu thuần (dạng B). Đứng trước `by_subline`: API trả `false` cho mọi xuất xứ ngoài bảng thành viên bất kể `type`, nên mã `by_subline` của biểu mà xuất xứ không phải thành viên cũng ẩn, không in mức dòng 10 số |
| `type === 'by_subline'` | `ul` "{schedule} (form {form}): {cam: mức theo dòng 10 số — đối chiếu dòng của hàng} [n]", rồi mỗi `sublines[]` một dòng thuần "{codeDotted} {desc}: **{percent}%**" (`type === 'excluded'` hoặc `originExcluded === true` → {đỏ: không được hưởng}, không con số). Không xanh, không phải dòng `true` |
| mã có mức chung, một `sublines[].originExcluded === true` (API trả `originEligible: null`) | `ul` "{schedule} (form {form}): {cam: **{rate}**} [n] — riêng dòng 10 số {codeDotted} không áp dụng cho xuất xứ {nhãn}; đối chiếu dòng của hàng" |
| `originEligible === true` và `type` ∈ {`ad_valorem`, `specific`, `compound`}, gọi là **dòng `true`** | `ul` "**Có C/O form {form} hợp lệ ({schedule})**: thuế nhập khẩu ưu đãi đặc biệt {xanh: **{rate}**} [n]". **Chỗ duy nhất có xanh** |
| `originEligible === true`, `type === 'trq'` | `ul` "{schedule} (form {form}): **{rate}** [n]". Không xanh, không phải dòng `true` |
| `originEligible === null` | dạng gọn `ul` "{schedule} (form {form}): **{rate}** [n]"; khi `originExcluded === null` và `excludedOrigins` khác rỗng thêm " — trừ hàng xuất xứ {excludedOrigins} (NĐ {decree} loại trừ ở dòng này)"; không xanh |

Hai hàng đỏ đầu gọi chung là **dòng không được hưởng**.

**Mẫu, theo thứ tự dòng:**

1. **Câu dẫn**, một trong các dạng dưới. Xuất xứ luôn viết "có xuất xứ", không viết "nhập khẩu từ": bộ lọc
   dùng nước xuất xứ, còn người hỏi ("nhập từ Trung Quốc") có thể đang nói nước gửi hàng.
   - **(A)** có ít nhất một dòng `true`: "Đối với hàng hóa có mã HS **{dotted}** (*{heading}*) có xuất xứ
     **{nhãn}**, mức thuế nhập khẩu phụ thuộc vào việc có C/O ưu đãi hợp lệ hay không:" → các dòng
     `true`, các dòng không được hưởng, rồi `ul` "**Không có C/O ưu đãi hợp lệ**: thuế nhập khẩu ưu đãi
     thông thường (**MFN**) **{mfn.statement}** [n]". Có biểu bị ẩn → `note` "Đã ẩn {các biểu `false`}
     vì {nhãn} không có trong danh sách nước thành viên đã xác nhận; nếu nước xuất xứ khác nước gửi
     hàng, nhắn tên nước xuất xứ."
   - **(B)** có xuất xứ, bảng đã xác nhận, không có dòng `true`: "Hàng hóa có mã HS **{dotted}**
     (*{heading}*) có xuất xứ **{nhãn}** áp thuế nhập khẩu ưu đãi thông thường (**MFN**)
     **{mfn.statement}** [n]." → các dòng không được hưởng, các dòng `trq` → câu thuần "Các biểu FTA đã
     nạp khác ({chỉ các biểu `false`}) không áp dụng cho xuất xứ này; các hiệp định khác chưa được nạp.
     Nếu nước xuất xứ khác nước gửi hàng, nhắn tên nước xuất xứ." (bỏ câu khi không có biểu `false`).
     Câu dẫn chỉ nói "áp" khi mọi dòng là dòng không được hưởng hoặc `false`. Còn dòng có thể cho hưởng ưu
     đãi khi có C/O (`trq`, `by_subline`, mức chung có dòng 10 số bị loại trừ, `null`) thì "áp" đổi thành
     "có" và thêm câu "Mỗi mức dưới đây chỉ áp dụng khi hàng có xuất xứ từ nước thành viên và có C/O hợp lệ
     đúng form:": người khai đọc câu đầu như câu trả lời.
   - **(C)** không có xuất xứ: "Hàng hóa có mã HS **{dotted}** (*{heading}*) có thuế nhập khẩu ưu đãi
     thông thường (**MFN**) **{mfn.statement}** [n]. Mức ưu đãi đặc biệt theo FTA chỉ áp dụng khi hàng có
     xuất xứ từ nước thành viên và có C/O hợp lệ đúng form:" → các dòng theo bảng.
   - **(C')** có xuất xứ, bảng chưa xác nhận (`ftaMembership === null`): như (C), câu thứ hai thay bằng
     "Mình chưa lọc được các biểu FTA theo xuất xứ **{nhãn}**; mỗi mức dưới đây chỉ áp dụng khi hàng có
     xuất xứ từ nước thành viên và có C/O hợp lệ đúng form:". Không có dòng ghi chú riêng.
   - **Chế độ ứng viên** (`formatAnswer(…, { candidate: true })`, chỉ `tariffByClues` dùng, §5b.5): "Nếu
     hàng thuộc mã **{dotted}** (*{heading}*), thuế nhập khẩu ưu đãi thông thường (**MFN**) là
     **{mfn.statement}** [n]; mức FTA dưới đây chỉ áp dụng khi hàng có xuất xứ từ nước thành viên và có C/O
     hợp lệ đúng form:" → dòng in như (C): dòng `true` in dạng gọn, không xanh, không ẩn biểu; dòng không
     được hưởng vẫn đỏ. Mức ưu đãi phụ thuộc một phân loại chưa ai chốt, nên không được trông như đã áp
     dụng được.

   Trong (A)/(B), dòng `null` in dạng gọn sau tiêu đề "Biểu chưa xác định được theo xuất xứ:". `heading`
   cắt ≤ 45 ký tự ở ranh giới từ (dùng lại phần cắt của `cleanGazetteTitle`): tiêu đề nhóm 8481 dài 160
   ký tự, cắt 80 thì câu dẫn đã chiếm khoảng 6 dòng điện thoại trước gạch đầu dòng đầu tiên. Không có
   `mfn` → câu dẫn nói "chưa có dòng MFN tại ngày {date}" và không cấp [n] cho nó.

   Các dòng dưới đây **chỉ có khi dữ liệu có**:
2. "Ngoài hạn ngạch: **{outOfQuota.statement}** [n]" · "Thuế xuất khẩu: **{export.statement}** [n]".
3. Mỗi `antiDumping[]`: một dòng `red` "**{statement}** — theo {decisionNumber} [n]".
   `staleness.pendingExtension` (§5b.4): một dòng `red`, nguyên văn.
4. Mỗi `notes[]`: một dòng `note` "Lưu ý: {note}".
5. **Dòng phạm vi kho:** `staleness.warning` nguyên văn, nhãn `warn`.
6. **Nguồn** (`note`): "Tra theo ngày {dd/mm/yyyy} · [1] NĐ {decree} — {scheduleName} · [2] … · Chưa nạp:
   NĐ {u1}, NĐ {u2}…" (vế cuối từ `staleness.unloadedInstruments`, bỏ khi rỗng). [n] cấp **theo thứ tự
   in**: dòng mang dấu xuất hiện trước trong tin nhận số nhỏ hơn; cùng số hiệu nghị định → cùng [n], và nhãn
   của [n] đó nối thêm tên biểu trích sau ("; {scheduleName}"), ví dụ MFN và thuế xuất khẩu cùng NĐ
   26/2023/NĐ-CP: "[1] NĐ 26/2023/NĐ-CP — Biểu thuế nhập khẩu ưu đãi (MFN, Mục I); Biểu thuế xuất khẩu" (R10).
7. **Dòng kết: tối đa một dòng sau nguồn.**
   - Có lịch sử xác nhận → `confirmFooter` trả **một** dòng `note`, giữ lịch sử
     ([R18](../business-rules.md)): `Đã xác nhận đúng {n} lần (gần nhất: {tên}) · {cam: từng bị báo sai
     {n} lần ({tên}: {ghi chú}) — kiểm tra kỹ} · chưa chắc {n} lần — trả lời "đúng"/"sai" để cập nhật.`
     Đoạn cam là **đoạn**, không phải dòng cảnh báo. Không in gợi ý.
   - Không có lịch sử, `showFooter` → một câu nghiêng = gợi ý (nếu có) + lời mời. Gợi ý chỉ khi bảng đã
     xác nhận: không có xuất xứ "Cho mình biết xuất xứ để lọc đúng biểu ưu đãi; ", có xuất xứ "Muốn xem
     xuất xứ khác, nhắn tên nước; ". Lời mời: `mã đúng với lô hàng thì trả lời "đúng", chưa đúng thì trả
     lời "sai" hoặc gửi mã đúng.` (viết hoa chữ đầu câu khi đứng một mình).
   - Không có lịch sử, không `showFooter` → không có dòng kết.

**Dòng 10 số.** Theo [ADR dòng 10 số quốc gia](../architecture-decisions/2026-09-13-fta-national-sublines.md)
(chủ dự án chốt "nạp đủ dòng 10 số, sửa trước"), mã 8 số có các dòng 10 số khác mức mang
`type: 'by_subline'`, không có con số chung, và `sublines[]` mang mức từng dòng (mã cha khác mức: ACFTA
10, AANZFTA 8, EVFTA Phụ lục II 58 — [khái niệm biểu thuế](../concepts/tariff-system.md)); mã cùng mức giữ
mức chung và vẫn có `sublines[]`. Bot in theo bảng trên: không bao giờ một con số ưu đãi duy nhất cho mã
`by_subline`, không xanh ở mức dòng 10 số (chưa ai chốt hàng thuộc dòng nào), không tính là dòng cảnh
báo. Dữ liệu đang phục vụ chỉ có các trường này sau khi chạy migration 0010 và seed lại; trước đó
`sublines` rỗng và mức 8 số vẫn là mức của dòng 10 số đầu tiên. Ký `verifiedBy` bật xanh ở **mọi** mã,
nên điều kiện ký ở §5b.11 dựa vào mốc này.

**Ví dụ — `8481.80.99`, ngày 13/09/2026, chưa có lịch sử xác nhận.** Dữ liệu seed: MFN 10%
(26/2023/NĐ-CP); ACFTA 0%, loại trừ KH, PH; AANZFTA 0%; ATIGA năm 2026 0%; EVFTA năm 2026 0%; không có
thuế chống bán phá giá. Tiêu đề nhóm thật: "Vòi, van và các thiết bị tương tự dùng cho đường ống, thân
nồi hơi, bể chứa hoặc các loại tương tự, kể cả van giảm áp và van điều chỉnh bằng nhiệt".

*Ví dụ 1 — xuất xứ CN, bảng thành viên **đã** xác nhận* (ACFTA `true`; AANZFTA, ATIGA, EVFTA `false` →
ẩn):

```text
Đối với hàng hóa có mã HS **8481.80.99** (*Vòi, van và các thiết bị tương tự dùng cho…*) có xuất xứ **Trung Quốc**, mức thuế nhập khẩu phụ thuộc vào việc có C/O ưu đãi hợp lệ hay không:
• **Có C/O form E hợp lệ (ACFTA)**: thuế nhập khẩu ưu đãi đặc biệt {xanh: **0%**} [1]
• **Không có C/O ưu đãi hợp lệ**: thuế nhập khẩu ưu đãi thông thường (**MFN**) **10%** [2]
{nhỏ: Đã ẩn AANZFTA, ATIGA, EVFTA vì Trung Quốc không có trong danh sách nước thành viên đã xác nhận; nếu nước xuất xứ khác nước gửi hàng, nhắn tên nước xuất xứ.}

{cam: Biểu thuế trong kho cập nhật tới NĐ 26/2023/NĐ-CP (hiệu lực 15/07/2023); chưa nạp dòng thuế của 4 nghị định biểu thuế còn hiệu lực — đối chiếu trước khi khai.}
{nhỏ: Tra theo ngày 13/09/2026 · [1] NĐ 118/2022/NĐ-CP — ASEAN–Trung Quốc (ACFTA) · [2] NĐ 26/2023/NĐ-CP — Biểu thuế nhập khẩu ưu đãi (MFN, Mục I) · Chưa nạp: NĐ 144/2024/NĐ-CP, NĐ 108/2025/NĐ-CP, NĐ 199/2025/NĐ-CP, NĐ 201/2026/NĐ-CP}
*Muốn xem xuất xứ khác, nhắn tên nước; mã đúng với lô hàng thì trả lời "đúng", chưa đúng thì trả lời "sai" hoặc gửi mã đúng.*
```

*Ví dụ 2 — xuất xứ CN, bảng thành viên không có hiệu lực* (thiếu file, thiếu `verifiedBy`, hoặc `verifiedHash`
không khớp — đường đóng an toàn; ACFTA `originExcluded = false` vì CN không thuộc KH, PH):

```text
Hàng hóa có mã HS **8481.80.99** (*Vòi, van và các thiết bị tương tự dùng cho…*) có thuế nhập khẩu ưu đãi thông thường (**MFN**) **10%** [1]. Mình chưa lọc được các biểu FTA theo xuất xứ **Trung Quốc**; mỗi mức dưới đây chỉ áp dụng khi hàng có xuất xứ từ nước thành viên và có C/O hợp lệ đúng form:
• ACFTA (form E): **0%** [2]
• AANZFTA (form AANZ): **0%** [3]
• ATIGA (form D): **0%** [4]
• EVFTA (form EUR.1/REX): **0%** [5]

{cam: (như ví dụ 1)}
{nhỏ: Tra theo ngày 13/09/2026 · [1] NĐ 26/2023/NĐ-CP — Biểu thuế nhập khẩu ưu đãi (MFN, Mục I) · [2] NĐ 118/2022/NĐ-CP — ASEAN–Trung Quốc (ACFTA) · [3] NĐ 121/2022/NĐ-CP — ASEAN–Úc–New Zealand (AANZFTA) · [4] NĐ 126/2022/NĐ-CP — ASEAN (ATIGA) · [5] NĐ 116/2022/NĐ-CP — Việt Nam–EU (EVFTA) · Chưa nạp: (như ví dụ 1)}
*Mã đúng với lô hàng thì trả lời "đúng", chưa đúng thì trả lời "sai" hoặc gửi mã đúng.*
```

Ví dụ 2 vẫn liệt kê AANZFTA, ATIGA, EVFTA cho hàng Trung Quốc, đúng điều chủ dự án chê: ẩn chúng khi bảng
không có hiệu lực là trái quyết định 5 của ADR. Bảng đã được Trần Ngọc Nhật duyệt 2026-09-13 (commit
`853a01f`) và mang `verifiedHash`, nên câu thử của chủ dự án ra ví dụ 1 ngay khi deploy (§5b.9); ví dụ 2
chỉ còn là đường đóng an toàn khi file bị sửa sau khi duyệt.

*Ví dụ 3 — không có xuất xứ*:

```text
Hàng hóa có mã HS **8481.80.99** (*Vòi, van và các thiết bị tương tự dùng cho…*) có thuế nhập khẩu ưu đãi thông thường (**MFN**) **10%** [1]. Mức ưu đãi đặc biệt theo FTA chỉ áp dụng khi hàng có xuất xứ từ nước thành viên và có C/O hợp lệ đúng form:
• ACFTA (form E): **0%** [2] — trừ hàng xuất xứ KH, PH (NĐ 118/2022/NĐ-CP loại trừ ở dòng này)
• AANZFTA (form AANZ): **0%** [3]
• ATIGA (form D): **0%** [4]
• EVFTA (form EUR.1/REX): **0%** [5]

{cam: (như ví dụ 1)}
{nhỏ: (như ví dụ 2)}
*Cho mình biết xuất xứ để lọc đúng biểu ưu đãi; mã đúng với lô hàng thì trả lời "đúng", chưa đúng thì trả lời "sai" hoặc gửi mã đúng.*   ← vế gợi ý chỉ khi bảng đã xác nhận
```

*Ví dụ 4 (dạng B, rút gọn)* — `0901.11.20` xuất xứ CN, bảng đã xác nhận; NĐ 118 loại trừ CN ở dòng này:

```text
Hàng hóa có mã HS **0901.11.20** (*…*) có xuất xứ **Trung Quốc** áp thuế nhập khẩu ưu đãi thông thường (**MFN**) **{mức MFN}** [1].
**ACFTA (form E)**: {đỏ: không được hưởng} — NĐ 118/2022/NĐ-CP loại trừ hàng xuất xứ Trung Quốc ở dòng này [2]
Các biểu FTA đã nạp khác (AANZFTA, ATIGA, EVFTA) không áp dụng cho xuất xứ này; các hiệp định khác chưa được nạp. Nếu nước xuất xứ khác nước gửi hàng, nhắn tên nước xuất xứ.
…
```

### 5b.4 API: thành viên FTA và dòng phạm vi kho — một nguồn cho bot và web

**Nạp `db/seed/data/fta-members.json`: API đọc file lúc khởi động, không seed thành bảng.** Lý do: file
đã nằm trong image (`Dockerfile` chép `/app/db`; `app.module.ts` đã định vị file theo `process.cwd()`);
việc xác nhận của chủ dự án là một thay đổi có dấu vết git (`verifiedBy`, `verifiedAt`, `verifiedHash`)
và có hiệu lực khi deploy lại; seed thành bảng cần migration viết tay (nợ snapshot 0007–0009) và tạo thêm
một trạng thái DB có thể lệch khỏi file đã duyệt.

Trong `tariff.service.ts`:

```ts
/**
 * Membership per schedule code, or null unless the file parses, a named person verified it (R18),
 * AND verifiedHash still matches the schedules they verified.
 */
export function ftaMembership(json: unknown): { verifiedBy: string; verifiedAt: string; members: Map<string, Set<string>> } | null;

/** EU is a bloc (ND 116 lists member states); VN goods from non-tariff zones are a special origin, not a member row. */
const UNDETERMINED_ORIGINS = new Set(['EU', 'VN']);

export function originEligible(
  m: ReturnType<typeof ftaMembership>,
  schedule: string,
  origin: string | null,
  originExcluded: boolean | null,
  sublineExcluded: boolean,
): boolean | null {
  if (!m || !origin || UNDETERMINED_ORIGINS.has(origin)) return null;
  const set = m.members.get(schedule);
  if (!set) return null; // schedule absent from the table (Chapter 98, a later FTA load): unknown, never "not a member"
  if (!set.has(origin)) return false;
  if (originExcluded === true) return false; // membership is necessary, not sufficient (ND 118 per-line exclusions)
  return sublineExcluded ? null : true; // excluded on a 10-digit sub-line: depends on the goods, never green
}
```

- Service giữ trường `membership` (không `readonly`, để spec gán fixture) đọc một lần khi khởi tạo:
  `ftaMembership(readJson(join(process.cwd(), 'db/seed/data/fta-members.json')))`. Trả `null` (đóng an
  toàn: không lọc, không xanh) kèm một dòng log cảnh báo lúc khởi động khi: thiếu file, JSON hỏng,
  `verifiedBy` rỗng hoặc không phải chuỗi, `verifiedAt` không phải `YYYY-MM-DD`, `members[].iso2` không
  khớp `^[A-Z]{2}$`, **`verifiedHash` thiếu hoặc khác `sha256(JSON.stringify(schedules))`**. Biểu có
  `members` rỗng không vào `Map` (biểu vắng → `null`, không bao giờ `false`). Không có biến môi trường
  cho đường dẫn.
- **`verifiedHash`** buộc chữ ký đi cùng đúng nội dung đã đọc: sửa một nước thành viên sau khi ký (do
  agent hay do merge) làm bảng về `null` cho tới khi người xác nhận duyệt lại. Định nghĩa duy nhất: `sha256`
  hex của `JSON.stringify(schedules)`, với `schedules` đọc bằng `JSON.parse` (giữ thứ tự khoá như trong file),
  tính bằng
  `node -e 'const j=require("./db/seed/data/fta-members.json");console.log(require("crypto").createHash("sha256").update(JSON.stringify(j.schedules)).digest("hex"))'`.
  Đổi khoảng trắng trong file không đổi hash; đổi nội dung (kể cả `quote`, `notes`) thì đổi.
- Code không phân biệt được người với agent: điều kiện "người đứng tên" giữ bằng quy tắc và bằng review
  commit sửa file. Agent không bao giờ ghi hay sửa `verifiedBy`, `verifiedAt` (không bao giờ cấp xác minh).
  `verifiedHash` chỉ do controller (phiên điều phối) ghi, khi có phê duyệt rõ của chủ dự án **đã ghi trong
  git**, trên đúng nội dung đã duyệt (`git diff <commit duyệt> -- db/seed/data/fta-members.json` rỗng). Lần
  đầu: phê duyệt ở commit `853a01f` (Trần Ngọc Nhật, 2026-09-13), hash `2e94452a…2e044ba0` ghi ở commit
  chuẩn bị kế hoạch 07.
- Trường `coForm` trong file **không** được đọc — form C/O vẫn lấy từ `tariff_schedule.fta_form`.
- `toPreferentialView` gọi `originEligible` với `sublineExcluded = sublines.some((s) => s.originExcluded
  === true)`, tính từ `PreferentialView.sublines` mà
  [ADR dòng 10 số quốc gia](../architecture-decisions/2026-09-13-fta-national-sublines.md) đã thêm. Không
  thêm trường hay cờ nào, và loại trừ ở một dòng 10 số vẫn không áp cho cả mã 8 số (quyết định 6 của ADR đó).

**Trường mới trong phản hồi** (`tariff.types.ts`):

```ts
export interface PreferentialView extends RateView {
  // … existing fields, including sublines (ADR fta-national-sublines)
  /** The rate alone, without the C/O condition: the base statement ("0%", "Loại trừ khỏi biểu (không phải 0%)",
   *  "Theo dòng 10 số (không có một mức chung cho mã 8 số)"). */
  rate: string;
  /** true: member per the verified table, excluded neither on this line nor on a 10-digit sub-line;
   *  false: not a member, or excluded on this line; null: no origin, table unverified, EU/VN,
   *  schedule absent from the table, or excluded on a sub-line only. */
  originEligible: boolean | null;
}
export interface TariffResponse { /* … */ ftaMembership: { verifiedBy: string; verifiedAt: string } | null; }
export interface StalenessView {
  latestInstrument: { number: string; effectiveFrom: string; effectiveTo: string | null } | null;
  unloadedInstruments: string[];
  /** A recorded, unloaded extension of an expired rate on this HS that may cover the query date. */
  pendingExtension: string | null;
  warning: string; // always present (R7)
}
```

- `PreferentialView.statement` **không đổi**: web UI vẫn in nó, và mục `tariff` của Mảng 2 dựng từ nó
  (§5b.10).
- Bỏ note chung "Mức ưu đãi FTA chỉ áp dụng khi có C/O hợp lệ đúng form…": mọi `statement` có điều kiện
  đã nói đúng câu đó, và bố cục mới đặt điều kiện trong câu dẫn. Sửa note "(Các biểu FTA nạp ở bước
  sau.)" — sai từ khi bốn biểu được nạp — thành "Mã này không có dòng trong các biểu FTA đã nạp; chỉ trả
  về MFN."
- Web UI (`public/index.html`): `if (d.staleness?.stale)` → in `d.staleness.warning`, nối "Chưa nạp: …" từ
  `unloadedInstruments` và `pendingExtension` khi có; lớp `pref` chỉ khi `p.originEligible === true` và
  `p.type` ∈ {`ad_valorem`, `specific`, `compound`} — cùng điều kiện dòng `true` của bot (hôm nay: khi
  `!p.originExcluded`).

**"Văn bản biểu thuế mới nhất đã nạp" — định nghĩa.** Service đọc bảng `decree` **một lần, khi cần lần
đầu**, vào một trường riêng, rồi lọc theo ngày tra trong TypeScript:

```sql
SELECT d.number, d.effective_from::text AS effective_from, d.effective_to::text AS effective_to,
       d.signed_date::text AS signed_date,
       EXISTS (SELECT 1 FROM tariff_rate r WHERE r.source_decree_id = d.id AND r.superseded_at IS NULL) AS loaded
FROM decree d
```

Đọc một lần vì `tariff_rate.source_decree_id` không có chỉ mục (`db/schema/index.ts` chỉ mục `hs_code`,
`schedule_id`, `annex_id`): chạy `EXISTS` ở mỗi `/tariff` là quét bảng thuế một lượt cho mỗi nghị định.
Dữ liệu này chỉ đổi khi seed, và seed đi cùng deploy (API khởi động lại).

- **Còn hiệu lực tại ngày tra** = `effective_from ≤ ngày ≤ coalesce(effective_to, ∞)`, cùng vị từ khoảng
  mà truy vấn thuế dùng.
- `latestInstrument` = dòng `loaded` **còn hiệu lực tại ngày tra** có `effective_from` lớn nhất (hoà →
  `signed_date` lớn hơn, rồi `number`). Tính theo ngày tra, để câu hỏi về năm 2023 không viện dẫn văn bản
  năm 2026, và để văn bản đã hết hiệu lực không đứng tên cho biểu đang áp.
- `unloadedInstruments` = các dòng **không** `loaded` còn hiệu lực tại ngày tra, sắp theo `effective_from`.
- **Dữ kiện seed.** Ngày 13/09/2026: `latestInstrument` = **26/2023/NĐ-CP (hiệu lực 15/07/2023)**. NĐ
  72/2026/NĐ-CP ("Giảm thuế NK ưu đãi một số mặt hàng xăng, dầu về 0%") hết hiệu lực 30/04/2026 nên không
  được chọn. Nếu không lọc `effective_to`, mọi câu trả lời về van hay hộp chống nhiễu ngày 13/09/2026 sẽ
  gọi một nghị định xăng dầu đã hết hạn là "văn bản biểu thuế mới nhất", trong khi MFN 10% dẫn từ
  26/2023. **Câu mẫu của chủ dự án dùng 72/2026 — cần báo lại.** Ngày 01/04/2026 dòng này ghi
  72/2026/NĐ-CP (hiệu lực 09/03/2026–30/04/2026). Bốn biểu FTA (30/12/2022–31/12/2027) có `effective_from`
  nhỏ hơn 26/2023.
- **Vì sao `effective_from`**, không `signed_date`, `gazette_date` hay `max(recorded_at)`:
  `effective_from` NOT NULL và là trục thời gian hợp lệ mà chính truy vấn thuế lọc theo
  ([R8](../business-rules.md)); `signed_date` có thể null; `gazette_date` null ở mọi dòng seed;
  `recorded_at` là thời điểm seed, không nói gì về luật — đó chính là nguồn của câu sai "dữ liệu chốt
  2026-09-13, tin cậy đến 2026-07-27".
- **Vì sao "có dòng thuế đã nạp"**, không "có mặt trong bảng `decree`": bảng ghi nhận 144/2024, 108/2025,
  199/2025, 201/2026 nhưng seed không nạp dòng nào của chúng (§2.2). Lấy max theo cả bảng ngày 13/09/2026
  ra 201/2026/NĐ-CP (01/01/2026), một nghị định sửa thuế **xuất khẩu** chưa nạp dòng nào, và câu "cập nhật
  tới" khi đó nói quá. Vì vậy dòng cảnh báo nêu cả hai vế.
- Tính cả chiều xuất khẩu lẫn nhập khẩu: câu trả lời in cả thuế xuất khẩu.

Câu `warning`: một dòng, không `\n`, khoảng 150 ký tự. Cam nghĩa là "cần chốt", nên dòng có mặt ở mọi câu
trả lời thuế phải ngắn; số hiệu từng văn bản chưa nạp nằm ở dòng nguồn (§5b.3 mục 6).

- Có văn bản chưa nạp: `Biểu thuế trong kho cập nhật tới NĐ {latest} (hiệu lực {từ}[–{đến}]); chưa nạp
  dòng thuế của {n} nghị định biểu thuế còn hiệu lực — đối chiếu trước khi khai.`
- Không có: `Biểu thuế trong kho cập nhật tới NĐ {latest} (hiệu lực {từ}[–{đến}]); văn bản ban hành sau
  mốc này có thể chưa có.`
- `[–{đến}]` in khi `effectiveTo` khác null; ngày `dd/mm/yyyy`.
- `latestInstrument === null`: `Không xác định được văn bản biểu thuế đã nạp cho ngày {dd/mm/yyyy} — đối
  chiếu nguồn trước khi dùng.`

**Gia hạn đã ghi nhận nhưng chưa nạp (`pendingExtension`).** Seed ghi trên dòng 0% của NĐ 72/2026 (hết
30/04/2026) `conditions.extended_by = 'NQ 25/2026 đến 2026-06-30 — cần nạp riêng'`. Từ 01/05/2026 truy
vấn trả mức 26/2023 đã hồi quy, trong khi dữ liệu tự ghi rằng mức 0% có thể được gia hạn tới 30/06/2026.
`lookup` chạy thêm một câu theo `hs` (cột có chỉ mục):

```sql
SELECT r.conditions->>'extended_by' AS extended_by FROM tariff_rate r
WHERE r.hs_code = ${hs} AND r.superseded_at IS NULL AND r.effective_to < ${date} AND r.conditions ? 'extended_by'
```

Đọc `/^(.+?) đến (\d{4}-\d{2}-\d{2})/` từ chính chuỗi đó; ngày chỉ lấy từ chuỗi, không suy. Khớp và ngày
tra ≤ ngày đến → `Mức thuế nhập khẩu ưu đãi của mã này có thể đã được {văn bản} gia hạn tới {dd/mm/yyyy}
nhưng văn bản đó chưa nạp — đối chiếu trước khi khai.`; khớp mà ngày tra đã qua → `null`; không đọc được
ngày → vẫn in, kèm chuỗi nguyên văn (đóng an toàn). Bot in thành dòng đỏ (nội dung, không tính vào giới
hạn cảnh báo). NQ 25/2026 không có trong bảng `decree`, nên không vào `unloadedInstruments`.

**`DATA_SNAPSHOT_DATE` và `GAZETTE_LAG_DAYS`: bỏ.** Không còn gì cần chúng; giữ lại là giữ đúng
heuristic đã in sai. Xoá khỏi `tariff.service.ts` (cùng `subtractDays`), `docker-compose.yml`, bảng biến
môi trường ở [vận hành server dev](mona-dev-server-operations.md), mock config trong
`tariff.service.spec.ts`. Thân lỗi 404 thay `snapshotDate` bằng `latestInstrument`. Độ trễ Công báo đã
đo (15, 19, 48 ngày — [R7](../business-rules.md)) vẫn là lý do của vế "văn bản ban hành sau mốc này có
thể chưa có".

### 5b.5 Trả lời ứng viên HS (`tariffByClues` — R2)

Hợp đồng không đổi (ứng viên, người chốt, `/tariff/search` tất định); đổi giọng và thứ tự. Khối thuế ở
đây luôn dùng **chế độ ứng viên** của `formatAnswer` (§5b.3): câu dẫn điều kiện "Nếu hàng thuộc mã…",
không xanh, không ẩn biểu.

1. **Dòng ứng viên cố định, luôn in**, là dòng đầu của khối đưa vào `withLead`: "Với mô tả *{desc}*,
   mình tra được các mã ứng viên dưới đây — đây là ứng viên để bạn chốt, chưa phải mã đã xác định."
   `clues.lead` (nếu còn sau cổng) đứng **trước** dòng này, không bao giờ thay nó. Lý do: `sanitizeLead`
   giữ lời dẫn có mã HS trùng khối, nên "Sản phẩm này thuộc mã 8543.70.90" qua được cổng; dòng cố định
   cùng câu dẫn điều kiện mới là thứ giữ R2. `clues.note` (LLM, hôm nay **không** gác) qua cổng văn xuôi
   §5b.7 trước khi vào `desc`; bị gác thì dùng từ khoá.
2. **Có ÁP MÃ đã xác nhận** (`citedRuling`): dòng thuần "Mã **{dotted}** đã được **{staffName}** xác
   nhận cho hàng tương tự ({cite}) — mình ưu tiên mã này, bạn vẫn đối chiếu căn cứ." Nếu đồng thời
   `borderline` → `note` "Mặt hàng có thể thuộc nhiều nhóm; mã trên là mã đã được người xác nhận, không
   phải bot tự suy."
3. **`borderline` không có ÁP MÃ**: ba ứng viên song song, không ứng viên nào trông như đã chốt.
   - Dòng `warn` "Mặt hàng có thể thuộc nhiều nhóm — cần bạn hoặc chuyên viên chốt mã (kèm số công văn nếu
     có) trước khi khai." `render()` gộp nó với dòng phạm vi kho thành một dòng cam (§5b.1).
   - Ba dòng `ul` "**{hsDotted}** · *{heading ≤ 50}* · MFN **{mfn}%**": mã đầu và tối đa 2 nhóm khác, tổng
     đúng top-3 ([R2](../business-rules.md); hôm nay in mã đầu + 3).
   - Không khối FTA, không câu dẫn thuế riêng. `note` "Tra theo ngày {date} · MFN theo Biểu thuế nhập khẩu
     ưu đãi đã nạp (mã đầu: NĐ {mfn.decree})".
   - `note` "Nhắn mã bạn chốt (kèm xuất xứ) để mình tra đủ thuế ưu đãi, hoặc nhắn "HS đúng là <mã>" (kèm
     số công văn nếu có) để mình ghi nhận cho lần sau."
   Bố cục cũ đặt các nhóm khác sau cả khối thuế của mã đầu, và câu dẫn bị lặp hai lần ("Ứng viên đầu tiên
   là…" rồi câu dẫn của `formatAnswer`); dạng này đặt cả ba ngay dưới dòng cam.
4. **Còn lại** (không `borderline`, hoặc có ÁP MÃ): `formatAnswer(…, { showFooter: false, candidate: true })`
   (lịch sử xác nhận vẫn in nếu có), rồi:
   - có ÁP MÃ và `borderline` → "Các nhóm ứng viên khác:" + tối đa 2 `ul` "**{hsDotted}** · MFN
     **{mfn}%** · *{hai cấp cuối của path}*";
   - không `borderline` → "Nếu chưa đúng loại hàng, bạn chọn mã khác:" + tối đa 5 mã anh em cùng dạng
     (menu, như nay);
   - `note` "Chốt mã đúng: nhắn "HS đúng là <mã>" (kèm số công văn nếu có) để mình ghi nhận cho lần sau."
     (có ÁP MÃ: "Nếu mã đã xác nhận trên chưa đúng cho lô này, nhắn "HS đúng là <mã>" (kèm số công
     văn).") thay cho chân trang xác nhận.
   Không tra được thuế → "Chưa có dòng thuế hiệu lực cho **{dotted}** tại ngày {date} — {path}."
5. Không có ứng viên: "Mình chưa tìm được mã HS phù hợp cho *{từ khoá}*. Bạn mô tả rõ hơn (chất liệu,
   công dụng) hoặc gõ thẳng mã HS nhé."

`formatCandidates` trong `format.mjs` không có nơi gọi → xoá. Bằng chứng nguyên văn cho ứng viên vẫn là
việc của §3.8 (Mảng 2/3).

### 5b.6 Trả lời pháp luật — tạm thời, trước khi có `POST /answer`

**API** (`legal.generation.ts`, `legal.grounding.ts`, `legal.service.ts`) — giữ nguyên quy tắc bám căn
cứ, `abstain`, một lần gọi, trần 45s:

- Khối điều khoản đánh số theo vị trí, `[1] <articleCitation>\n<articleBody>`, thay `[id=NNN]`;
  `citations` trả **số thứ tự** `n`, code đổi `n → kept[n-1]`.
- Hợp đồng ra: `{"answer":"<Markdown tiếng Việt ≤200 từ>","citations":[<n>],"abstain":false,"reason":null}`;
  prompt nhắc xuống dòng viết `\n` trong chuỗi JSON.
- Thêm vào phần "CÁCH VIẾT": câu đầu trả lời thẳng; **đậm** thuật ngữ, số hiệu, điều khoản, thời hạn
  then chốt; `- ` chỉ khi liệt kê trường hợp hoặc điều kiện song song; `[n]` ngay sau câu dựa vào điều
  khoản n, mỗi nguồn một dấu (`[1] [2]`); mọi con số, ngày, thời hạn chép đúng cách điều khoản viết; không
  màu, emoji, HTML, bảng, lời chào, lời mời hỏi thêm; `## ` chỉ khi câu trả lời dài hơn 3 đoạn; không
  chép nguyên văn dài.
- **Trần ≤ 200 từ.** Đo trên câu trả lời notebook mẫu: 4,39 ký tự/từ → 200 từ ≈ 900–1.000 ký tự; cộng 3
  nguồn × ~190 ký tự ≈ 600 → ≈ 1.600 < 1.800: trường hợp thường vừa **một** tin; 5 nguồn thì tách hai tin
  tại ranh giới trước danh sách nguồn. 250 từ đã chạm ngưỡng khi mới có 3 nguồn. Mảng 3 bỏ trần cứng
  ("độ dài theo câu hỏi", §4).
- `numberMarkers(answer: string, cited: number[], sources: string[], userText: string): { answer: string;
  order: number[] }` — hàm thuần trong `legal.grounding.ts`, thay `validateCitations`. `sources[i]` =
  `"{articleCitation}\n{articleBody}"` của `kept[i]`; `k = sources.length`. Theo thứ tự:
  1. Tách `[1, 2]`/`[1,2]` thành `[1] [2]`; xoá mọi `[n]` ngoài `1..k` (mồ côi, như kiểm 5 §3.6).
  2. **Số liệu neo theo câu** — phần chuỗi của kiểm 3 §3.6, làm ngay ở đây vì bố cục mới đặt `[n]` sát
     dữ kiện và cho đậm con số do LLM viết ([R10](../business-rules.md)). Tách câu tại `. `, `? `, `! `,
     `; ` và xuống dòng. Trong mỗi câu, mọi `\d+([.,]\d+)?\s*%`, tiền `\d[\d.,]*\s*(USD|VND|đồng|đ)\b`,
     ngày `\d{1,2}/\d{1,2}/\d{4}`, thời hạn `\d+\s*(ngày|tháng)`, số hiệu `\d{1,4}/(\d{4}|VBHN)[^\s,;)*"'“”‘’[\]]*` (đuôi dừng ở `*`, dấu nháy, ngoặc vuông: số hiệu
     in **đậm**, trong ngoặc kép hay dính `[n]` vẫn neo được),
     mã HS `\d{4}(\.\d{2}){1,2}` phải nằm (sau NFC, gộp khoảng trắng, không phân biệt hoa/thường) trong
     `sources[n-1]` của một `[n]` **có trong chính câu đó**; câu không có dấu thì trong một nguồn thuộc
     `cited`. Miễn trừ: số hiệu, mã HS, ngày mà người dùng đã viết trong `userText` (so như
     `docNumberStatedIn`, bỏ số 0 đầu). `%` và tiền **không** được miễn.
  3. Câu có dữ kiện không neo được → câu đó mất mọi `[n]` và mọi `**`. Có một `%` hoặc khoản tiền không
     neo được ở bất kỳ câu nào → trả `answer: ''` (nhánh chỉ trích dẫn như nay).
  4. Đánh lại số theo thứ tự xuất hiện đầu tiên; gộp dấu trùng liền nhau; `order` = vị trí gốc theo số
     mới. Có ít nhất một dấu hợp lệ → `citations = order.map((n) => kept[n-1])`; không dấu nào nhưng
     `cited` hợp lệ → giữ `answer` không dấu, `citations` theo `cited`; cả hai rỗng → nhánh "chưa dẫn
     được" như nay.
- **Hợp đồng:** `[n]` trong `LegalAnswer.answer` trỏ `citations[n-1]`. Web UI không dùng `/legal`.

**Bot** (`formatLegal`):

```text
<md(r.answer)>
{đỏ: [2] [4] Nghị định 08/2015/NĐ-CP hết hiệu lực một phần — kiểm tra điều khoản còn áp dụng.}   ← mỗi cặp (văn bản, effectiveness ≠ con_hieu_luc) của từng trích dẫn
{cam: Nghị định 12/2026/NĐ-CP do bot tự nạp, chưa có người đối chiếu — đọc bản gốc trước khi dùng; đã đối chiếu thì nhắn "xác nhận văn bản 12/2026/NĐ-CP".}   ← warn, gộp mọi số hiệu auto_unverified
{nhỏ: Nguồn:}
{nhỏ: [1] Khoản 1 Điều 15 Nghị định 31/2018/NĐ-CP — “<trích đoạn>…” (trích đoạn đầu)}
{nhỏ: [2] Điều 5 Thông tư 33/2023/TT-BTC · hiệu lực 01/01/2024–31/12/2026 — “…”}
{nhỏ: Toàn văn: <gazetteUrl văn bản thứ nhất> · <gazetteUrl văn bản thứ hai>}                      ← khử trùng theo văn bản, tối đa 3
```

(Số hiệu và ngày trong khối trên là chỗ giữ vị trí, không phải dữ kiện.)

- `sourceLines(items: Array<{ n, label, quote?, cut?, url? }>): Line[]` trong `format.mjs` dựng các dòng
  `Nguồn:` và `Toàn văn:`. `formatLegal` ánh xạ `LegalCitation` vào: `label` = `provisionLabel` + vế hiệu
  lực, `quote` = trích đoạn, `cut` = trích đoạn đã bị cắt (in " (trích đoạn đầu)"), `url` = `gazetteUrl`.
  Mảng 3 dùng lại nó (§5b.10).
- In **mọi** trích dẫn API trả (≤ 5, `MAX_CITATIONS`) — cắt còn 3 như nay sẽ làm `[4]`, `[5]` mồ côi.
- **Dòng đỏ hiệu lực theo từng trích dẫn**, từ `effectiveness` của chính trích dẫn đó (đã là hiệu lực cấp
  điều khoản); các `[n]` chỉ gộp chung một dòng khi cùng văn bản **và** cùng giá trị. Nhãn viết từ enum,
  không từ chữ mô hình: `het_hieu_luc` "hết hiệu lực", `het_hieu_luc_mot_phan` "hết hiệu lực một phần — kiểm tra điều khoản còn áp dụng" (chỉ loại này có vế đuôi; hết hiệu lực toàn bộ thì không còn điều khoản nào áp dụng),
  `chua_co_hieu_luc` "chưa có hiệu lực (từ {effectiveFrom})".
- **Vế hiệu lực trên dòng nguồn:** " · hiệu lực {from}–{to}" khi `effectiveTo` khác null hoặc
  `effectiveFrom > asOf` ([R8](../business-rules.md)), như bố cục cũ.
- **Trích đoạn:** cắt tại ranh giới câu hoặc vế đầu tiên (`.`, `;`, `:`, hoặc xuống dòng trước `a)` / `1.`)
  nằm trong khoảng 140–480 ký tự; không có → cắt 480 như nay. Bị cắt → kết `…` và thêm " (trích đoạn
  đầu)". Điều khoản tiếng Việt hay đặt ngoại lệ sau vế đầu ("được miễn thuế … trừ trường hợp …"); cắt
  cứng ở 140 ký tự cạnh một `[n]` có thể đọc thành điều ngược lại. Toàn văn vẫn qua `/legal/provision`.
- `r.answer` rỗng (không có LLM, hoặc câu trả lời không dẫn được / không neo được số liệu): câu thuần
  "Mình chưa tổng hợp được câu trả lời chắc chắn; đây là các điều khoản liên quan nhất để bạn đối chiếu:"
  + danh sách nguồn với trích ≤ 480 ký tự như nay. Không in `lead`.
- `formatProvisions`: lời dẫn đã gác, hoặc câu tất định "Nguyên văn **{citationLabel}**:"; thân nguyên
  văn ≤ 1.200 ký tự là đoạn **thuần**; dòng đỏ hiệu lực nếu có; `note` "Toàn văn: {url}"; văn bản `auto_unverified` có cùng dòng cam "do bot tự nạp…" như `formatLegal` ([R18](../business-rules.md); `/legal/provision` trả thêm `verification`).
- Từ chối (`answer.mjs`, nhánh không có trích dẫn): "Mình chưa tìm thấy điều khoản đủ căn cứ trong
  **{ref.label}** nên chưa trả lời, để tránh sai." (không có `ref`: "trong các văn bản mình đang có") +
  `note` "Lý do: {reason}" chỉ khi `reason` qua cổng văn xuôi §5b.7 + "Nếu bạn biết số hiệu văn bản, nhắn
  số hiệu để mình tìm trên Công báo và nạp về."
- Giới hạn còn lại, ghi rõ: `numberMarkers` kiểm trên thân điều khoản, chưa trên `quote` của từng trích
  dẫn, và chỉ ở mức chuỗi — con số có trong điều khoản vẫn có thể bị gán cho nghĩa vụ khác. Bước sửa và
  kiểm 3/4 đầy đủ của `guards.ts` là Mảng 3.

**Thiếu văn bản** (`formatMissingDoc`, bốn loại, cùng giọng). Mọi nhánh trừ `none` mở bằng cùng một câu do
code viết, không đoán ý định câu hỏi: "Mình chưa có toàn văn và tình trạng hiệu lực của **{số}** nên chưa
trả lời được câu này."

- `exact` ({số} = `number`): câu mở + "Công báo có văn bản này: *{title ≤130}*." + `note` "Toàn văn:
  {sourceUrl}" + "Trả lời "nạp" là mình lấy toàn văn về rồi tra tiếp cho bạn (mất vài phút)."
- `ambiguous` ({số} = `label`): câu mở + "Công báo có {n} văn bản mang số này, bạn cần bản năm nào?" +
  `ul` "**{number}** — {title}" (≤ 6) + "Nhắn số hiệu đầy đủ (ví dụ 36/2025/TT-BKHCN) là mình nạp về."
- `similar` ({số} = `label`): nhãn có đoạn cơ quan ban hành → câu mở + "Công báo không có văn bản đúng số
  này; có {n} văn bản cùng số của cơ quan khác:"; nhãn không có → câu mở + "Công báo có {n} văn bản mang
  số này, bạn cần văn bản nào?"; tiếp `ul` (≤ 4) + "Nếu đúng là một trong số này, nhắn số hiệu đầy đủ để
  mình nạp."
- `none`: "Mình không tìm thấy **{label}** cả trong kho lẫn trên Công báo — bạn kiểm tra lại số hiệu giúp
  mình."
- Cộng sửa lỗi 69/2018 ở §5b.8.

### 5b.7 Trả lời chung, xác nhận, lỗi

- Mọi chuỗi còn lại đi qua `render()` dạng `string` (không màu, không đọc ký hiệu), hoặc `Line[]` khi cần
  đậm một mã hay số hiệu. Viết lại theo §5b.2 — bỏ emoji và chữ HOA. Ví dụ: `handleConfirm` "Đã ghi nhận
  **đúng** cho mã **8481.80.99** (xuất xứ CN, ngày 13/09/2026). Cảm ơn {tên}."; ack ảnh "Mình đang xem
  ảnh, bạn chờ khoảng 20 giây nhé."; `formatIngestReport` "Đã nạp xong **{number}** — {detail}. Bạn hỏi
  nội dung văn bản này được rồi; lưu ý bản này bot tự nạp, chưa có người đối chiếu."; lỗi chung giữ câu.
- **Cổng văn xuôi LLM.** `sanitizeLead` mở rộng, áp cho mọi nơi gọi: `phần trăm` bị bác như `%`; danh sách
  dữ kiện phải có trong `block` thêm số hiệu `\d{1,4}\s*/\s*(\d{4}|VBHN)` và mã HS dạng bất kỳ
  `\b\d{4}(\.?\d{2}){0,2}\b` đứng sau `mã|nhóm|phân nhóm|HS`; khi `block === ''` bác thêm chữ `thuế
  suất`. Với `block` rỗng, mọi dữ kiện đều không có trong khối nên đều bị bác. `reply` của router,
  `clues.note` (§5b.5) và `reason` của từ chối (§5b.6) dùng `sanitizeLead(x, '')`.
- **Trường `reply` của router (intent `general`) — hôm nay đi thẳng ra tin, không gác.** Hàm thuần mới
  `formatGeneral(reply): Line[]` trong `format.mjs` (test được mà không import `index.mjs`):
  - `sanitizeLead(reply, '', 900)` chỉ là **cổng**. Qua cổng → `md(String(reply).slice(0, 900))` trên
    **chuỗi gốc**: `sanitizeLead` gộp khoảng trắng, xuống dòng mất thì `md()` không thấy `- `.
  - Bị bác hoặc rỗng → hằng `CAPABILITIES: Line[]` trong `format.mjs`:

    ```text
    Mình tra được hai việc:
    1. **Biểu thuế xuất nhập khẩu** — gõ tên hàng hoặc mã HS, kèm xuất xứ.
    2. **Văn bản pháp luật hải quan** — hỏi nội dung văn bản mình đang có; chưa có thì mình tìm trên Công báo và nạp về.
    *Ví dụ: "thuế nhập khẩu 8481.80.99 xuất xứ Trung Quốc"*
    ```

  - Prompt router chèn `toText(CAPABILITIES)` làm danh sách năng lực **duy nhất** `reply` được nhắc tới.
    Code không kiểm được một lời hứa năng lực (VAT, thủ tục); cổng chỉ chặn dữ kiện, và hằng số là câu trả
    về khi cổng bác.
- `formatIngestQueued` và `formatIngestReport` trả `Line[]` để đậm số hiệu.

### 5b.8 Sửa lỗi "69/2018" — cả hai phía

Chuỗi lỗi: `parse.mjs` `parseDocRef` chỉ giữ đoạn cơ quan ban hành trong `label`, `core = '69/2018'`;
`answer.mjs` (ba chỗ gọi `legalAnswer`/`legalProvision`) gửi `ref.core`; API `parseDocRef('69/2018')` có
`full = null`, `lookupGazette` bỏ qua nhánh khớp đúng, tiền tố `69/2018%` ra nhiều văn bản →
`gazetteMatchKind: 'similar'`; `formatMissingDoc` liệt kê chính 69/2018/NĐ-CP dưới "cùng số nhưng của cơ
quan khác".

1. **Một phép gập số hiệu, hai phía.** `foldDocNumber(s)` (API, `legal.scope.ts`) và `sameDocNumber(a, b)`
   (bot, `parse.mjs`, so hai giá trị gập cùng cách): NFC, bỏ khoảng trắng, viết hoa, `Đ → D`, bỏ số 0 đầu
   của nhóm số đầu. `8/2015/ND-CP` ≡ `08/2015/NĐ-CP`: kho đã coi số 0 đầu là cách gõ thường
   (`docNumberStatedIn`, `corpusHas`, `resolveDocuments`). Đoạn cơ quan ban hành so chặt:
   `69/2018/TT-BTC` ≠ `69/2018/NĐ-CP`; `69/2018` ≠ `69/2018/NĐ-CP`.
2. **Bot gửi số đầy đủ.** `parseDocRef` trả thêm `full` như API: `issuer ? label : null`. Đoạn cơ quan
   ban hành có thể kết bằng chữ số (`107/2016/QH13`, `NQ-UBTVQH14`): cả hai phía đọc nó bằng
   `\/\s*[a-zà-ỹ][a-zà-ỹ\d-]*`, vì cắt ở chữ số đầu sẽ làm luật kho đang giữ (qua VBHN) thành "không có". Ba chỗ gọi gửi
   `ref.full ?? ref.core`. Khi có `ref.full`, `corpusHas` so bằng `sameDocNumber` với `number` /
   `consolidates` thay vì so tiền tố `core`: kho có 69/2018/NĐ-CP mà người dùng hỏi 69/2018/TT-BTC thì
   **không** coi là có.
3. **API.**
   - `lookupGazette`: nhánh khớp đúng so gập **trong SQL** — `regexp_replace(translate(upper(number), 'Đ',
     'D'), '^0+', '') = ${foldDocNumber(ref.full)}` — thay `upper(number) = ${ref.full}`. So trong SQL chứ
     không lọc kết quả câu tiền tố, vì câu tiền tố có `LIMIT 5`: hơn 5 số hiệu cùng đầu thì văn bản được
     hỏi có thể bị cắt trước khi so.
   - `resolveDocuments`: khi có `ref.full`, chỉ giữ dòng có `number` hoặc `consolidates` gập bằng
     `foldDocNumber(ref.full)`; không còn dòng → `[]`, để nhánh Công báo chạy thay vì trả lời bằng văn bản
     cùng số của cơ quan khác như thể nó là văn bản được hỏi.
   - `ask()`: `doc` không có `docType` mà `parseDocRef(query)` cùng `core` → lấy `docType` của câu hỏi.
     "Nghị định 69/2018 còn áp dụng không" (không `/NĐ-CP`) có `full = null` và bot gửi `doc=69/2018`;
     không có dòng này, bộ lọc loại ở `lookupGazette` không chạy và câu trả lời liệt kê cả thông tư, quyết
     định cùng số. Sửa ở `ask()` vì mọi nơi gọi `/legal` đều qua đó.
4. **Không bao giờ trình bày số được hỏi như văn bản khác.** Hàm thuần `missingKind(label, matches, kind):
   { kind, matches }` trong `parse.mjs`: một khớp `similar`/`ambiguous` có `sameDocNumber(label, number)` →
   `{ kind: 'exact', matches: [khớp đó] }`. `missingDocAnswer` gọi nó **trước** cả `formatMissingDoc` lẫn
   `pendingIngest` (nên có đề nghị "nạp"). `formatMissingDoc` tự lọc khớp bằng nhãn khỏi danh sách "khác"
   (phòng thủ khi được gọi thẳng).

### 5b.9 Kiểm thử

Bot: `yarn test:bot` (`node --test`), `test()` phẳng, fixture nội tuyến, thông điệp assert tiếng Việt. Chỉ
test hàm thuần: không import `index.mjs` (chạy `main()` và đăng nhập Zalo), không test hàm gọi API
(`tariffByClues`, `missingDocAnswer`); phần cần kiểm đã tách thành hàm thuần (`formatGeneral`,
`missingKind`, chế độ `candidate`).

**`apps/zalo-bot/render.test.mjs` (mới):**

1. Bảng nhãn khớp `TextStyle` import từ `zca-js`.
2. Offset có dấu tiếng Việt: `[L(['Đối với mã ', ['8481.80.99', 'b'], ' có xuất xứ ', ['Trung Quốc',
   'b']])]` → style thứ hai có `start === msg.indexOf('Trung Quốc')`, `len === 10`; đầu vào NFD ra `msg`
   NFC và offset vẫn đúng.
3. Emoji: đoạn thuần `'🔍 '` trước một đoạn đậm → `start === 3` (UTF-16).
4. Đậm + xanh cùng đoạn → hai style cùng `start`/`len`; nhãn dòng `ul` phủ `[đầu dòng, cuối dòng)`, không
   gồm `\n`.
5. Tách tin (`budget: 60`): mọi tin ≤ 60; ranh giới là ranh giới đoạn; mọi `start + len ≤ msg.length`;
   mỗi đoạn có nhãn nằm trọn trong đúng một tin; style của tin thứ hai tính từ 0; có dòng `(k/n)`.
6. Đoạn có nhãn dài hơn `budget` → cắt ở khoảng trắng, hai nửa cùng nhãn.
7. Thoát ký tự: đoạn thuần `'173.6*162.6*12.1'` và `'**không**'` → không style, chữ nguyên vẹn;
   `md('173.6*162.6*12.1')` → không style; `md('0405.90.10 (*) và 0405.90.90 (*)')` → không style, chữ
   nguyên vẹn; `md('\\*x\\*')` → chữ `*x*`; `md('**x')` → chữ `**x`.
8. `md()`: `- a` → `ul` chữ `a`; `1. a` → `ol`; `## T` → dòng `b`; `[1]` giữ; `md('{red}0%{/red} <b>x</b>')`
   → không style nào; tập nhãn của mọi đầu ra ⊂ `{b, i, ul, ol}`.
9. Hai dòng `warn` → **một** dòng `c_f27806` chứa cả hai chữ, nối bằng `; `; không `f_13` nào sinh từ
   `warn`.

**`apps/zalo-bot/dispatch.test.mjs` (thêm, cạnh các test `format.mjs`/`parse.mjs` sẵn có; sửa test
`withLead` sang `Line[]`).** Fixture `TariffResponse` nội tuyến cho `8481.80.99` như §5b.3:

10. CN, bảng đã xác nhận (ACFTA `originEligible: true`, ba biểu còn lại `false`) → câu dẫn chứa "có xuất
    xứ", không chứa "nhập khẩu từ"; đúng một style `c_15a85f`, phủ `0%` của dòng ACFTA; dòng ACFTA mang
    `[1]`, dòng MFN `10%` mang `[2]`; nguồn chứa `[1] NĐ 118/2022/NĐ-CP` và `[2] NĐ 26/2023/NĐ-CP`; có dòng
    `note` "Đã ẩn AANZFTA, ATIGA, EVFTA" (mang `f_13`); ngoài dòng đó không có chữ `AANZFTA`, `ATIGA`, `EVFTA`.
    EVFTA đổi thành `by_subline` với hai dòng 10 số, `originEligible: false` → EVFTA vẫn chỉ ở dòng "Đã ẩn",
    không in `codeDotted` nào. `parseQuotedTariff(toText(…))` → `origin === 'CN'`.
11. CN, `ftaMembership: null` → bốn dòng FTA, **không** style xanh, câu dẫn chứa "Mình chưa lọc được các
    biểu FTA theo xuất xứ"; dòng kết không chứa "nhắn tên nước".
12. Không xuất xứ → bốn dòng gọn, không xanh, dòng ACFTA chứa "trừ hàng xuất xứ KH, PH".
    `parseQuotedTariff` trên chữ trả lời ngày `2026-01-05` → `origin === null` dù hàng và nguồn có
    "ASEAN–Trung Quốc", `date === '2026-01-05'` (lấy lại từ "Tra theo ngày").
13. `originExcluded: true` → "không được hưởng" mang `c_db342e`; dòng đó không chứa `%`; vẫn có câu MFN;
    không xanh.
14. `type: 'excluded'` với `originEligible: true` → "không được hưởng" mang `c_db342e`, dòng không chứa
    `%`, câu dẫn dạng (B) (không chứa "phụ thuộc vào việc có C/O"); `type: 'trq'` với `originEligible:
    true` → không xanh, câu dẫn dạng (B). Câu dẫn của dòng `excluded` chứa " áp thuế"; câu dẫn của dòng `trq`
    và của xuất xứ `EU` (mọi dòng `null`) không chứa " áp thuế" mà chứa "Mỗi mức dưới đây chỉ áp dụng khi".
15. CN, bảng đã xác nhận, ACFTA mức chung `0%` có một `sublines[]` với `originExcluded: true`,
    `originEligible: null` → không `c_15a85f`; mức của dòng mang `c_f27806`; dòng chứa "riêng dòng 10 số".
    `type: 'by_subline'` với hai dòng 10 số `0` và `5` → không `c_15a85f`; có cả hai `codeDotted`; dòng tên
    biểu không chứa `%`; câu dẫn không phải dạng (A).
16. Một mục `antiDumping` → một dòng `c_db342e` chứa `statement` và `decisionNumber`;
    `staleness.pendingExtension` khác null → một dòng `c_db342e` nguyên văn. `export` cùng NĐ 26/2023/NĐ-CP
    với MFN → dòng "Thuế xuất khẩu" mang `[1]`; nhãn `[1]` chứa "Biểu thuế nhập khẩu ưu đãi (MFN, Mục I);
    Biểu thuế xuất khẩu".
17. Dòng phạm vi kho = `staleness.warning` nguyên văn, mang `c_f27806`. Fixture `Line[]` = một dòng `warn`
    (cảnh báo nhiều nhóm) nối trước đầu ra `formatAnswer(…)` → sau `render` đúng một dòng cam, chứa cả hai
    chữ.
18. Dòng kết: có lịch sử `wrong` → dòng cuối là `confirmFooter` (một dòng `note`, đoạn "từng bị báo sai"
    mang `f_13` và `c_f27806`), không có gợi ý; không lịch sử, `showFooter` → đúng một dòng sau dòng nguồn;
    `showFooter: false`, không lịch sử → không dòng nào sau dòng nguồn.
19. Chế độ ứng viên: `formatAnswer(…, { candidate: true })` với ACFTA `originEligible: true` → câu dẫn bắt
    đầu "Nếu hàng thuộc mã **8481.80.99**", không `c_15a85f`, không dòng "Đã ẩn", vẫn có dòng AANZFTA, ATIGA,
    EVFTA;
    `withLead('Sản phẩm này thuộc mã 8481.80.99', [dòng ứng viên cố định, …])` vẫn chứa dòng ứng viên cố
    định.
20. Pháp luật: `answer` có `[1]`, `[2]`, API trả 5 trích dẫn → in đủ `[1]`…`[5]`; hai văn bản
    `auto_unverified` → một dòng cam nêu cả hai; `[2]` và `[4]` cùng văn bản, cùng `het_hieu_luc_mot_phan`
    → một dòng đỏ nêu `[2] [4]`; thân có "trừ trường hợp" sau ký tự 140 và trước dấu chấm đầu tiên →
    trích đoạn chứa "trừ trường hợp" và kết bằng "(trích đoạn đầu)".
21. **Hồi quy 69/2018:** `parseDocRef('Nghị định 69/2018/NĐ-CP còn áp dụng không').full ===
    '69/2018/NĐ-CP'`; `parseDocRef('69/2018').full === null`; `sameDocNumber('69/2018/ND-CP',
    '69/2018/NĐ-CP') === true`; `sameDocNumber('8/2015/ND-CP', '08/2015/NĐ-CP') === true`;
    `sameDocNumber('69/2018/TT-BTC', '69/2018/NĐ-CP') === false`; `missingKind('69/2018/NĐ-CP',
    [69/2018/NĐ-CP, 69/2018/TT-BTC], 'similar')` → `exact` với đúng khớp NĐ; `formatMissingDoc` không
    liệt kê `69/2018/NĐ-CP` như văn bản của cơ quan khác; `corpusHas([{ number: '69/2018/NĐ-CP' }],
    parseDocRef('69/2018/TT-BTC')) === false`.
22. `formatGeneral`: `reply` chứa `15%`, `mười phần trăm`, `theo Nghị định 26/2023/NĐ-CP`, `mã 8481.80`,
    `mã HS 84818099` → mỗi ca ra `CAPABILITIES`; `'- a\n- b'` → hai dòng `ul`.

**Jest (API):**

- `tariff.service.spec.ts` — chỉ fixture JSON nội tuyến; **không** assert trạng thái `verifiedBy` của file
  thật trong repo (nó đổi vào ngày chủ dự án ký). `ftaMembership`: `verifiedBy: null` → `null`;
  `verifiedBy: ''` → `null`; iso2 sai → `null`; thiếu `verifiedHash` → `null`; sửa một nước sau khi tính
  hash → `null`; hợp lệ → có `members`; biểu `members: []` → không có trong `Map`. `originEligible`:
  CN/ACFTA đã xác nhận → `true`; CN/AANZFTA → `false`; `originExcluded: true` → `false`;
  `sublineExcluded: true` → `null`; `EU`, `VN`, không xuất xứ, bảng `null`, biểu `NK_uu_dai_98`, biểu
  `members: []` → `null`. `lookup` với `svc.membership = ftaMembership(fixture)` (db giả): dòng ACFTA mức
  chung có `conditions.sublines` với một dòng `excluded_origins` chứa CN → `originEligible: null`;
  `rate === '0%'` khi `statement` có điều kiện; `statement` của mọi dòng FTA không bị loại trừ theo xuất
  xứ (kể cả `by_subline`) vẫn chứa `nếu có C/O form` (bất biến Mảng 2 cần, §5b.10).
- Dòng phạm vi kho (db giả trả các dòng `decree` như seed): 2026-09-13 → `latestInstrument`
  `26/2023/NĐ-CP`, `unloadedInstruments` = 144/2024, 108/2025, 199/2025, 201/2026 theo `effective_from`,
  `warning` đúng nguyên văn; 2026-04-01 → `72/2026/NĐ-CP`, `warning` chứa `hiệu lực 09/03/2026–30/04/2026`;
  2023-08-01 → `26/2023/NĐ-CP`, `unloadedInstruments` rỗng; không có dòng → câu dạng `null`; hai lần
  `lookup` → câu `decree` chạy một lần. `pendingExtension`: dòng `extended_by = 'NQ 25/2026 đến 2026-06-30
  — cần nạp riêng'`, ngày 2026-05-15 → chứa `NQ 25/2026` và `30/06/2026`; ngày 2026-07-01 → `null`.
- `legal.grounding.spec.ts` (mới): `numberMarkers('A [3]. B [1].', [1, 3], năm nguồn, '')` → `'A [1]. B
  [2].'`, `order [3, 1]`; `[9]` với 5 nguồn bị xoá; `[1, 2]` → `[1] [2]`; `[1] [1]` → `[1]`; không dấu,
  `cited [2]` → `answer` giữ nguyên, `order [2]`; `'Thuế suất **0%** [1].'` mà nguồn 1 không chứa `0%` →
  `answer === ''`; `'Nộp trong **30 ngày** [2]. Câu khác [1].'` mà nguồn 2 không chứa `30 ngày` → câu đầu
  mất `[2]` và `**`, câu sau giữ dấu; số hiệu người dùng đã viết trong `userText` → được miễn.
- `legal.scope.spec.ts` (mới): `foldDocNumber('08/2015/NĐ-CP') === foldDocNumber('8/2015/ND-CP')` và khác
  `foldDocNumber('08/2015/TT-BTC')`; `lookupGazette` với `full '69/2018/ND-CP'` → câu khớp đúng nhận tham
  số đã gập, db giả trả một dòng → `exact: true`; `resolveDocuments` với `full '69/2018/TT-BTC'`, db giả
  trả `69/2018/NĐ-CP` → `[]`. `legal.service.spec.ts`: `ask('Nghị định 69/2018 còn áp dụng không', …, doc
  '69/2018')` → `lookupGazette` nhận `docType === 'nghi_dinh'`.
- `apps/eval/notebook.spec.ts`: `norm('**không** bao gồm') === norm('không bao gồm')`. `/legal` giờ trả
  Markdown; `norm` không bỏ `*` thì cụm `mustSay` bị dấu đậm chẻ đôi và điểm notebook tụt so với
  `fixtures/eval-baseline.json` vì lý do không liên quan nội dung. Sửa một dòng: `norm` thêm
  `.replace(/\*+/g, '')` trong `apps/eval/notebook.ts`.

**Kiểm tay và bảng thành viên** (chủ dự án 2026-09-13: làm xong là deploy, không có điểm dừng trước
deploy):

1. **Kiểm tay sau deploy:** chủ dự án gửi trong nhóm được phép một câu trả lời sẽ tách hai tin, tin đầu
   kèm `quote`; xác nhận style hiện đúng trên điện thoại và Zalo PC, kể cả ở tin có quote. Không đạt →
   rollback (kế hoạch 07 Task 8).
2. **Bảng thành viên — đã quyết (a).** Trần Ngọc Nhật duyệt `fta-members.json` 2026-09-13 (commit
   `853a01f`); điều kiện (a) ở §5b.11 đã thỏa; file mang `verifiedHash` khớp nội dung đã duyệt. Câu thử
   "thuế nhập khẩu 8481.80.99 xuất xứ Trung Quốc" ra ví dụ 1 ngay khi deploy. Không có lựa chọn ẩn biểu
   khi bảng không có hiệu lực (quyết định 5 của ADR).

### 5b.10 Ranh giới với Mảng 2 và Mảng 3

- **Mảng 2 không bị chạm:** không bảng, không seed, không migration mới. **Bố cục chat không bao giờ là
  bằng chứng.** Mục `tariff` (§2.2.1) do API dựng (`expand.ts`, TypeScript, không import được
  `format.mjs`) từ trường API, mỗi mức thuế một dòng phẳng `${schedule}: ${statement} (${decree})`, không
  `[n]`, không chữ bố cục. `statement` mang sẵn điều kiện C/O và loại trừ theo dòng; phần này **không
  đổi** `statement` hay `decree` (test bất biến ở §5b.9). Nhờ vậy kiểm 3 §3.6 (`quote` bằng nguyên một dòng
  mức thuế: biểu + mức + điều kiện + nghị định) vẫn làm được. Bố cục §5b.3 tách điều kiện vào câu dẫn và
  nghị định vào dòng nguồn, nên không dòng nào của nó đủ bốn vế; dùng nó làm thân thì câu "ACFTA (form E):
  0%" qua được kiểm như một dòng trọn vẹn. `render.mjs` không dựng thân bằng chứng.
- **Mảng 3 dùng lại, không viết lại:** `render.mjs` (`render`, `md`, tách tin, `warn`) là bộ trình bày
  của `/answer`. Mảng 3 chỉ thêm `formatAnswerMd(answer: AnswerResponse): Line[]` trong `format.mjs`, dựng
  danh sách nguồn bằng `sourceLines` (§5b.6; `citations[]` của `/answer` có sẵn `n`, `label`, `quote`,
  `url`) và bổ sung nhãn `authority` / `window` / `meta.status`. `formatAnswerMd` **bỏ qua** `followups`
  (§5b.2 mục 6: LLM không viết gợi ý); Mảng 3 bỏ `followups` khỏi đầu ra compose (§3.1, §3.5).
- `numberMarkers` là hạt giống của kiểm 3 (phần chuỗi) và kiểm 5 §3.6: `guards.ts` **chuyển** nó sang và
  đổi nguồn so từ thân điều khoản sang `quote` của từng trích dẫn, không viết lại. Prompt tạm ở
  `legal.generation.ts` bị `compose.ts` thay; tập Markdown con của `md()` là cú pháp duy nhất prompt
  `compose.ts` được phép cho `answerMd` (§3.1).
- Thay đổi với phần còn lại của spec: §5 gạch `render.mjs` và "Tách tin" trỏ về đây (bỏ "`**x**` → `x`",
  "`## ` → dòng in hoa", số `(1/3)` ở đầu tin); §4 nguyên tắc 7 có cưỡng chế bằng code (`warn`); §3.6 kiểm
  3 và 5 có mã sẵn; §3.2 "kế hoạch không viết lời dẫn" khớp §5b.2 mục 1; §2.2.1 "đúng dạng `formatAnswer`
  in" đọc thành "dựng từ trường API như trên"; §3.1, §3.5 bỏ `followups`.
- Kế hoạch 05, Mảng 3 cần sửa theo đoạn trên khi lập kế hoạch cho phần này: bảng file, và dòng hợp đồng
  giao diện `render(answer: AnswerResponse): string[]` thành `formatAnswerMd(AnswerResponse): Line[]` +
  `render(Line[]) → {msg, styles}[]`. Không để người làm Mảng 3 đọc dòng cũ rồi dựng bộ trình bày thứ hai
  mà ADR đã bác.

### 5b.11 Phân loại tri thức [v3]

**Đã xác nhận:** quyết định của chủ dự án 2026-09-13 — thứ tự làm; bảng màu; tin mẫu hiện đúng trên điện
thoại và Zalo PC; bảng thành viên đã được Trần Ngọc Nhật duyệt 2026-09-13 (commit `853a01f`; chưa rà các nghị định sửa đổi sau 30/12/2022); dòng phạm vi kho từ bảng `decree`; sửa 69/2018;
lỗi loại trừ ACFTA đã sửa ở commit 19eda99; nạp đủ dòng 10 số trước (ADR dòng 10 số quốc gia, `by_subline`,
`PreferentialView.sublines`). Từ seed (`db/seed/index.ts`): ngày 13/09/2026 văn bản biểu
thuế đã nạp còn hiệu lực mới nhất là 26/2023/NĐ-CP, không phải 72/2026/NĐ-CP như câu mẫu (72/2026 hết
hiệu lực 30/04/2026); dòng xăng dầu của 72/2026 mang `extended_by` "NQ 25/2026 đến 2026-06-30 — cần nạp
riêng".

**Giả định (đảo được):** ngân sách 1.800 ký tự/tin; style ở nhánh `quote` hiện như tin thường (đã đọc
code, chưa gửi thử); `EU` và `VN` là xuất xứ không xác định được theo bảng thành viên; "không được hưởng"
tô đỏ; top-3 ứng viên = mã đầu + 2; chuỗi `extended_by` giữ dạng "{văn bản} đến YYYY-MM-DD".

**Điều kiện ký `verifiedBy`.** Ký bảng bật lọc và xanh **ở mọi mã cùng lúc**. Trên dữ liệu seed cũ, mức 8
số của các mã có dòng 10 số khác mức (ACFTA 10, AANZFTA 8, EVFTA 58) là mức của dòng 10 số đầu tiên, và
553 mã EVFTA mang thuế xuất khẩu Phụ lục I
([ADR dòng 10 số quốc gia](../architecture-decisions/2026-09-13-fta-national-sublines.md)): xanh khi đó
khẳng định "được hưởng 0%" ở dòng có thể là 5%. Vì vậy chỉ ký khi (a) thay đổi của ADR đó (migration 0010
và seed lại) đã chạy trên dữ liệu đang phục vụ; **hoặc** (b) chủ dự án ghi rõ việc chấp nhận rủi ro này
trong cùng commit ký. `verifiedHash` ghi theo §5b.4. **Đã thỏa (a):** migration 0010 và nạp lại biểu thuế
đã deploy 2026-09-13 ([nhật ký](../planning/02-progress.md)); duyệt ở `853a01f`.

**Câu hỏi để ngỏ:** (1) ~~ai ký `verifiedBy`, khi nào, theo (a) hay (b)~~ — đã trả lời: Trần Ngọc Nhật,
2026-09-13, theo (a); (2) có in "bảng thành viên do
{verifiedBy} xác nhận ngày {verifiedAt}" trong dòng nguồn không — mặc định không.

**Vùng rủi ro:** mô hình viết xuống dòng thô trong JSON → `JSON.parse` hỏng → rơi về trích dẫn thuần (an
toàn nhưng tụt chất lượng; theo dõi tỉ lệ trong log); kiểm số liệu của `numberMarkers` gạt cả câu đúng mà
mô hình viết số khác cách điều khoản viết ("ba mươi ngày" / "30 ngày") → thêm lần rơi về trích dẫn thuần,
theo dõi cùng tỉ lệ đó; người dùng trả lời vào tin thứ hai của một câu trả lời đã tách thì `quote.msg` chỉ
có phần đó (luồng đính chính vẫn dựa được vào bộ nhớ `tariffFresh`); bảng `decree` đọc một lần mỗi tiến
trình — seed lại mà không khởi động lại API thì dòng phạm vi kho cũ; bảng thành viên chưa có thời gian
hiệu lực (gia nhập, rút khỏi hiệp định).

**Ngoài phạm vi:** nạp dòng 10 số (thay đổi riêng theo ADR dòng 10 số quốc gia, phần này chỉ trình bày
kết quả); nạp 144/2024, 108/2025, 199/2025, 201/2026 và NQ 25/2026;
bằng chứng nguyên văn cho ứng viên HS; bỏ `lead` khỏi prompt router; gợi ý kết dẫn sang quy định nộp C/O
(chờ Mảng 2 nạp nguồn và đo được câu trả lời cho câu hỏi đó).

## 6. Lỗi và suy giảm

| Tình huống | Hành vi |
|---|---|
| Không có CLI/token | Như nay: nguyên văn điều khoản + mục bằng chứng |
| #1 timeout | Kế hoạch mặc định: `question = tin nhắn`, một truy vấn |
| #2 timeout | Gửi các mục đã truy hồi (tiêu đề + 300 ký tự) + "mình chưa viết xong tổng hợp" |
| Rate limit subscription | Xếp hàng theo thread, báo "đang bận, ~1 phút" |
| Kiểm cắt hết trích dẫn | "Không đủ căn cứ" + liệt kê đã đọc gì |
| Embedder chưa sẵn sàng | 400 như nay; bot báo "đang khởi động" |
| `/answer` lỗi | Bot rơi về `/legal` cũ một thời gian, ghi log |

Mọi lượt ghi **`decision_log`** (jsonb: kế hoạch, id truy hồi, id trích dẫn, vi phạm, thời gian).
**[v2]** Theo [R14](../business-rules.md): xoá bản ghi cũ hơn 30 ngày trong cùng `sweepIdle` của
`ConversationService`, không job riêng — `plan.question`/`queries` chứa chữ của người dùng.

## 7. Kiểm thử và nghiệm thu

**Đơn vị.** `guards.spec.ts` — mỗi luật một ca thật: `173.6*162.6*12.1`; câu "NĐ 43/2017/NĐ-CP hết
hiệu lực từ 23/01/2026 theo điểm b khoản 4 Điều 97 NĐ 37/2026/NĐ-CP [1]" với [1] = `status` 43/2017
**đạt**, với [1] không chứa căn cứ **trượt kiểm 4**; "MFN là 0% [1]" với quote "0% nếu có C/O… ngược
lại 10%" **bị cắt**; "Không. NĐ 336/2026 thay thế NĐ 85/2019 [1]; kho không có quan hệ nào với NĐ
08/2015" **đạt** (miễn trừ số người dùng gõ); "Đúng, 5% [1]" với thân chỉ có 10% **trượt**; mã 8 số
anh em trích từ mục `tariff` **sống**. `render.test.mjs`; `dispatch.test.mjs` (status pass-through);
`evidence.seed.spec.ts` — 33 mục `status`, 13/2022 một mục hai dòng, 111/2021 không sinh mục cho
"43/2017" trong ngoặc, thân 46/VBHN-BTC chứa "08/2015/NĐ-CP", thân 69/2018 chứa "292/2026/NĐ-CP" và
"05/09/2026"; cửa sổ 1725 chứa "8539.31.10" có mã trong `hs_codes`; "Phần XVI" → chú giải Phần XVI
top 3 nhánh từ khoá; "Thông tư 16/2026/TT-BNV" → dự thảo lớp C top 3; "mũ bảo hiểm QCVN 2:2021" và
"6506.10.10" → khối Phụ lục II TT 36/2026 top 3 ở cả hai nhánh. `test_parse_provisions` hai ca (b).

**`yarn eval` mở rộng.** **[v2]** `fixtures/legal-golden/notebook-qa.json` — 14 câu notebook, schema
`{id, q, safety, expect?, expectEvidence?:[{kind, instrument?|hsHeading?}], expectIntent?, mustSay?,
mustNotSay?, should_abstain?}`; `apps/eval/legal.ts` chấm thêm `expectEvidence` theo `(kind,
instrument|hsHeading)` đã truy hồi và `mustSay/mustNotSay` theo chuỗi con chuẩn hoá. Có trong repo
**trước** baseline mảng 1 để so được. Chỉ số: recall@5, abstain, `citationsProven` (100%),
`numbersOutsideSentenceQuote` (= 0), `p95Ms`. Golden thuế thêm hai ca Chương 98: `0306.15.00` →
MFN 10% + Ch98 `9804.15.00` 27%; `9818.23.00` → mã tương ứng `8418.69.90`.

**Chấm mù** (`apps/eval/ab.ts`): bộ ~35 câu = 14 + 22 golden chọn lọc + câu chủ dự án cung cấp. Bot
qua `/answer`; notebook do chủ dự án lấy tay (dự phòng: Playwright — thử, không cam kết). Trang chấm
che tên, trộn thứ tự; chấm `A / B / ngang`; script tính.

**Đạt khi, đồng thời:**

| Tiêu chí | Ngưỡng |
|---|---|
| Thắng hoặc ngang notebook | ≥ 70% câu |
| Nhóm an toàn: thuế suất, hết hiệu lực, số hiệu bịa, dự thảo, mã danh mục cũ | **100%** |
| recall@5 | không tụt so với baseline |
| Trích dẫn hiển thị qua kiểm nguyên văn | 100% |
| Con số ngoài `quote` cùng câu | 0 |
| p95 thời gian trả lời | ≤ 120s |
| **[v2]** Seed `evidence_section` trên VPS | hoàn tất, không OOM, thời gian ≤ số đo §2.6 |

## 8. Hạ tầng và vận hành

- Server dev dùng chung của MONA ([ADR](../architecture-decisions/2026-09-13-host-on-mona-dev-server.md), [runbook](mona-dev-server-operations.md)); compose hiện có; CLI `claude` trong image (M0 Task 1), đăng nhập subscription
  trên máy chủ; token chỉ qua `.env`. `EMBED_MAX_TOKENS` vào compose.
- **Sao lưu đêm [v2]:** chỉ `lookup_confirmation` và `legal_document(number, verification,
  verified_by)` → nén → `rclone copy` lên `gdrive:Legal-AI-Backup/`. **`conversation`,
  `conversation_turn`, `decision_log` KHÔNG sao lưu** ([R14](../business-rules.md) — dữ liệu cá nhân,
  tồn tại theo hội thoại).
- `/health` báo `llm`, `embedder`, `evidenceSections`.
- Runbook deploy viết lại trong `README.md`.

## Phân loại tri thức

**Yêu cầu đã xác nhận:** các quyết định ở đầu tài liệu; giữ mọi quy tắc R1–R18; đủ 32 nguồn notebook.

**Giả định (an toàn, đảo ngược được):** giới hạn tin Zalo ~1.800 ký tự; `claude -p` chịu prompt ~40k
token trong 100s; trần 18 tháng cho `upcoming`; `business-rules.md` được nạp làm `note` (chủ dự án có
thể bỏ nếu không muốn bot trích quy tắc của chính nó).

**Câu hỏi để ngỏ:** (1) báo cáo diff sau nạp lại — chủ dự án có duyệt giữ `verified` không; (2) căn
cứ "mã không có trong Phụ lục I ⇒ XK 0%" — chưa ghi cho tới khi có văn bản; (3) có bỏ 3 sheet TT 36
trong nguồn 91 (đã có `annex_table` ràng buộc) không — mặc định **bỏ**.

**Vùng rủi ro:** rate limit subscription khi 2–3 người hỏi cùng lúc; kiểm chuỗi không bắt được suy
diễn sai từ đoạn trích đúng; Chú giải chi tiết còn lỗi tràn nhóm (84.17→84.18) chưa đo toàn bộ;
`simple` parser với số hiệu — phải kiểm bằng SQL thật.

**Ngoài phạm vi:** phân loại HS theo GRI đầy đủ (M3–M4); nạp hàng loạt Công báo (M1); giao diện web;
API trả phí; sửa gốc rác HYPERLINK trong NĐ 31/2018; phần hướng dẫn cách hỏi của nguồn 01.

## Kiến thức liên quan

- [Mở rộng LLM](llm-expansion-design.md) · [Đường ống hộp thư đến](inbox-ingest-workflow.md) ·
  [Đánh giá](evaluation.md) · [Quy tắc nghiệp vụ](../business-rules.md) ·
  [ADR 2026-09-13](../architecture-decisions/2026-09-13-evidence-sections-and-long-form-answers.md) ·
  [ADR HS là ứng viên](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md) ·
  [ADR chữ định dạng Zalo theo giọng notebook](../architecture-decisions/2026-09-13-zalo-rich-text-notebook-style.md) ·
  [Khái niệm biểu thuế](../concepts/tariff-system.md)
