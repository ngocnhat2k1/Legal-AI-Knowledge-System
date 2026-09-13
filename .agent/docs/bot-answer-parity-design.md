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
---

# Thiết kế: bot Zalo trả lời ngang hoặc hơn Gemini Notebook

> Bản 2 (2026-09-13, tối). Bản 1 được chủ dự án duyệt rồi đưa qua một đợt kiểm độc lập (3 góc soát,
> mỗi phát hiện một agent phản biện): 21 phát hiện đứng vững, 8 mức chặn. Bản này vá tất cả. Những chỗ
> đổi so với bản 1 đánh dấu **[v2]**.

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

Migration **viết tay** `db/migrations/0010_evidence_section.sql` (gồm cả `decision_log` ở §6) + mục
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
- **`render.mjs`** — markdown → chữ Zalo: `## ` → dòng in hoa; `- ` → `•`; `**x**` → `x`; `[n]` giữ;
  bảng → `a · b · c`; cuối tin `Nguồn:` `[1] <label> (<instrument>)` + `↗ link` **chỉ khi có**; trên
  dòng nguồn in `authority`/`window`/`meta.status` khi không phải `binding`/`current`; `note` in
  "ghi chú nghiệp vụ của dự án — không phải căn cứ pháp lý". Một dòng ⚠️ từ `warnings`. Khối
  `candidates` và khối thuế (`formatAnswer`, thêm dòng `Chương 98: <98xx> ↔ <mã thường> · <thuế> · có
  điều kiện`) đặt **dưới** câu trả lời.
- **Tách tin** ở ~1.800 ký tự tại ranh giới đoạn, đánh số `(1/3)`. *Giả định* — đo giới hạn thật của
  `zca-js` khi triển khai (không kiểm được từ repo: `node_modules/zca-js/dist` rỗng).
- Bộ nhớ hội thoại: `state.legal.evidenceIds` + `citations` (cùng tên trường `router.stateOf` đọc);
  "cho tôi toàn văn điều đó" → `/legal/provision`; "toàn văn mục đó" → `GET /evidence/:id`.

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
  [ADR HS là ứng viên](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
