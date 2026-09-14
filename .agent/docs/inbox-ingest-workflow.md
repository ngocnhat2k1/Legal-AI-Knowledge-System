---
type: design
status: active
updated: 2026-09-10
related:
  - ../architecture-decisions/2026-09-10-notebook-sources-as-google-docs.md
  - ../architecture-decisions/2026-09-10-received-file-is-a-pointer-not-a-source.md
  - ../architecture-decisions/2026-09-10-drafts-and-cong-van-outside-legal-corpus.md
  - legal-corpus-self-extension.md
  - ../business-rules.md
---

# Đường ống hộp thư đến: từ file nhận được tới kho tri thức và notebook

Quy trình lặp lại được để bổ sung văn bản pháp luật mới. Chủ dự án nhận tài liệu qua Zalo,
email, nhóm nội bộ — chúng rơi vào một thư mục trên máy. Tài liệu này mô tả cách biến đống
file đó thành tri thức dùng được, **mà không phải upload lại notebook mỗi lần**.

Bổ sung cho [Kho pháp luật tự mở rộng](legal-corpus-self-extension.md), vốn lo đường ngược
lại: bot gặp một số hiệu lạ và tự đi lấy. Ở đây con người là người khởi xướng, và tài liệu
đến dưới dạng file chứ không phải số hiệu.

> **Bản này đã qua rà soát phản biện 2026-09-10** (4 nhóm phê bình độc lập + thẩm tra từng
> phát hiện; 45 phát hiện thô → 38 xác nhận). Những chỗ đánh dấu 🔻 là chỗ bản nháp đầu tiên
> đã sai và bị sửa — giữ lại vì chúng là cạm bẫy thật, không phải lịch sử biên tập.

## Vì sao cần

Trước tài liệu này, bổ sung một văn bản có ba chỗ hỏng:

1. **Không có bước phân loại.** Mọi thứ trong thư mục trông như nhau: nghị định đã ban hành,
   bản chưa ký, công văn hướng dẫn, và bảng Excel nội bộ đều là "tài liệu".
2. **Không có kỷ luật bất biến.** Bộ sinh markdown tạo lại **cả bộ** file mỗi lần chạy. Thêm
   một văn bản làm đổi hash của bảy file, và bảy nguồn trong notebook lỗi thời cùng lúc.
3. **Notebook không đồng bộ được.** File upload thẳng từ máy **không bao giờ** tự cập nhật
   (xem [ADR nguồn notebook là Google Docs](../architecture-decisions/2026-09-10-notebook-sources-as-google-docs.md)).

## Phạm vi: notebook là bề mặt ĐỌC, không phải bề mặt TRẢ LỜI

**Ranh giới này phải đọc trước mọi thứ khác trong tài liệu.**

Từ 2026-09-10 VPS ngừng hoạt động và dự án **tạm thời** không dùng máy chủ. Điều đó khiến
Gemini Notebook thành nơi duy nhất tra được văn bản. Nó **không** khiến notebook thành nơi
được phép trả lời mọi câu hỏi.

Notebook không chạy được `validateCitations`, không có bộ lọc valid-time cứng, không từ chối
theo độ cũ. Nên ba ADR sau **vẫn nguyên hiệu lực** và notebook nằm ngoài phạm vi chúng cho
phép trả lời:

| ADR | Cấm gì trên notebook |
|---|---|
| [Không dùng LLM cho con số biểu thuế](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md) | Không hỏi thuế suất, số tiền thuế |
| [HS là ứng viên, không phải đáp án](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md) | Không chốt mã HS |
| [LLM sinh giả thuyết, không bao giờ khẳng định](../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md) | Không coi câu trả lời là khẳng định |

Thuế suất chỉ đi qua đường tra khoá chính xác `(hs_code, schedule, as_of)`. Khi hạ tầng trở
lại, đường trả lời có ràng buộc là API/bot — **không phải notebook**.

Cưỡng chế bằng code: `render_notebook.py` chèn vào **đầu mỗi file nguồn** một dòng cố định.

```
⚠️ Nguồn này để TRA VĂN BẢN. Không dùng để tra thuế suất hay chốt mã HS.
   Thuế suất chỉ tra qua khoá chính xác (mã HS, biểu, ngày as-of).
   Văn bản trong file có thể đã hết hiệu lực — xem 00-tinh-trang-hieu-luc.
```

🔻 *Bản nháp đầu tuyên bố "notebook trở thành mặt tiếp xúc chính của toàn bộ tri thức pháp lý"
mà không nhắc ba ADR trên. Đó là âm thầm lật quyết định cũ, điều `AGENTS.md` cấm.*

## Nguyên tắc trung tâm: file nhận được là con trỏ, không phải nguồn

File trong hộp thư đến cho biết **văn bản nào đáng quan tâm**. Nó không phải bản văn để nạp.
Bản văn lấy từ nơi có thẩm quyền — Công báo — theo số hiệu đọc được từ chính file đó.

Kiểm kê đợt đầu (2026-09-10) cho thấy vì sao: **7 file là bản scan không có lớp text, tổng
224 trang**. Đi theo file thì phải OCR 224 trang và tin vào OCR cho một văn bản pháp luật. Đi
theo số hiệu thì tải về bản `.doc` gốc, sạch, máy đọc được. Chi tiết ở
[ADR file nhận được là con trỏ](../architecture-decisions/2026-09-10-received-file-is-a-pointer-not-a-source.md).

## Bốn lớp tài liệu, bốn đích đến

| Lớp | Nhận dạng | Vào `legal_document`? | Vào notebook? |
|---|---|---|---|
| **A — VBQPPL chính thức** | Có số hiệu đầy đủ, có ngày ký, **hoặc** dò ra trên Công báo | ✅ luôn vào ở `auto_unverified` | ✅ |
| **B — Công văn hướng dẫn** | Số dạng `18648/CHQ-GSQL`, không mang năm trong số hiệu | ❌ enum `legal_doc_type` không có `cong_van` | ✅ nhãn "không phải QPPL" |
| **C — Chưa xác định tình trạng** | Ô số hiệu trống **và** dò Công báo không thấy văn bản khớp | ❌ | ✅ nhãn cảnh báo đỏ |
| **D — Nội bộ / vận hành** | Bảng tổng hợp, tóm tắt, danh sách tác nghiệp | ❌ | ✅ nhãn "không phải nguồn pháp lý" |

### Hai trục độc lập: độ tin cậy bản văn ≠ trạng thái xác minh

🔻 **Đây là chỗ bản nháp đầu sai nặng nhất.** Nó gán `verified` cho văn bản lấy từ Công báo.

`db/schema/index.ts:393` định nghĩa rõ:

```
'verified',        // a human produced and checked the extract
'auto_unverified', // fetched and parsed on request; passed the structural gate, nobody read it
```

`verified` là trạng thái **do con người cấp**, không phải thuộc tính của nguồn. Chính
`ingest_document.py` cũng tải từ Công báo và ghi `auto_unverified`, kèm câu
*"Machine-fetched text never quietly acquires the standing of text a human read."*

Vậy hai trục tách bạch:

- **Thang bậc 1–4 xếp hạng ĐỘ TIN CẬY CỦA BẢN VĂN** — quyết định lấy bản nào, và có truy vết
  được số Công báo/ngày đăng hay không.
- **`legal_document.verification` là TRẠNG THÁI DO NGƯỜI CẤP** — mọi văn bản máy nạp đều vào ở
  `auto_unverified`, chỉ thăng lên `verified` khi một chuyên viên đọc và **đứng tên**, qua
  `IngestService.verify(number, staffName)` ghi `verified_by`.

Nếu để nhãn suy ra từ nguồn, mọi trích dẫn tự nạp sẽ **âm thầm mất cảnh báo** — đúng chế độ
hỏng [R3 "Error but Valid"](../business-rules.md).

### Quy tắc nhận dạng lớp C — sàng, không phải kết luận

🔻 **Bản nháp đầu đặt luật cứng "ô số hiệu trống ⇒ dự thảo". Luật đó cho kết quả sai.**

Dò Công báo cho 5 file có ô số hiệu trống: **2 là bản chưa ký của văn bản đã ban hành** —
`THONG TU 36 KHCN.pdf` = TT 36/2026/TT-BKHCN, `KO QE.pdf` = CV 18648/CHQ-GSQL (thân văn bản giống
0,99). Dán nhãn "KHÔNG CÓ GIÁ TRỊ PHÁP LÝ" lên chúng là hệ thống tự phát ra một khẳng định sai.

Ô trống chỉ chứng minh **bản trong tay chưa ký** — thuộc tính của *hiện vật*, không phải của
*quy phạm*. Quy trình đúng:

1. Ô số hiệu **hoặc** ô ngày trống ⇒ **nghi vấn**, chưa phải kết luận.
2. **Dò Công báo bằng tiêu đề + cơ quan + năm**, không bằng số hiệu — vì bản chưa ký không có
   số hiệu, nên đường tra theo số hiệu không kích hoạt được. Cơ quan suy ra từ đuôi số hiệu
   (`/2023/TT-BVHTTDL` → BVHTTDL; bảng ánh xạ đã có ở `apps/api/src/modules/legal/legal.scope.ts`).
3. **Khớp** ⇒ lớp A, lấy bản Công báo theo bậc 1. **Không khớp** ⇒ mới là lớp C.
4. **Cờ đỏ năm lệch**: bất kỳ nghi vấn nào mang năm **nhỏ hơn năm kiểm kê** phải chặn thủ công.
   Dự thảo treo qua năm là bất thường — gần như luôn là bản trước khi ký của văn bản đã ban hành.
5. **Tên file là manh mối, không phải căn cứ.** Không bao giờ dùng để kết luận; luôn dùng làm
   đầu vào cho bước dò. Chính `09-bvhttdl.pdf` mang số hiệu thật trong tên.

Không có bản ghi tra cứu Công báo thì **không được dán nhãn "CHƯA BAN HÀNH"**.

## Thang ưu tiên lấy bản văn

Dừng ở bậc đầu tiên thành công. Mọi bậc đều vào kho ở `auto_unverified`.

| Bậc | Đường | Dùng cho |
|---|---|---|
| 1 | **Công báo → VBHN hiện hành nếu có**, văn bản gốc chỉ khi không có VBHN | Mọi VBQPPL đã đăng, kể cả khi trong tay chỉ có scan |
| 2 | `.doc`/`.docx` cục bộ → parser | Văn bản chính thức chưa lên Công báo |
| 3 | PDF có lớp text → `pdfplumber` → parser | Văn bản địa phương, bản chưa ký |
| 4 | Scan hoặc ảnh → OCR bằng vision | Chỉ khi 1–3 đều không có; ngoài kho, chỉ vào notebook có nhãn |

**Ưu tiên VBHN là bắt buộc**, theo [ADR dùng VBHN đã công bố](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md).
Khi lui về văn bản gốc, phải **ghi lại vì sao**.

Bậc 4 dùng mẫu **confine Read** đã ghi trong [Bot Zalo: hiểu ảnh + tin
quote](zalo-bot-image-and-quote-context.md) — đường dẫn tuyệt đối của Claude Code là
`Read(//tmp/...)` với **hai** gạch chéo, kèm `cwd` cô lập.

### Parse có HAI nhánh, không phải một

🔻 **Bản nháp đầu kê một parser duy nhất cho mọi lớp A. Nó sẽ nuốt mất phụ lục.**

`research/legal-loader/parse_provisions.py:172` **cố ý vứt bỏ mọi dòng chứa dấu ô Word `\x07`**,
tức bỏ toàn bộ bảng. Điều đó **đúng** cho văn xuôi — nó giữ biểu mẫu ra khỏi thân Điều. Nhưng
phần lớn tài liệu lớp A của đợt này (TT 52/2018-BCT, QĐ 18/2019-TTg, QĐ 1725/QĐ-BCT,
TT 11/2024-BTTTT, phụ lục NĐ 292/2026) **chính là danh mục hàng hoá dạng bảng**. Chạy một
parser văn xuôi lên chúng thì ra đủ căn cứ và điều khoản, **mất sạch danh mục, không báo lỗi** —
đúng chế độ hỏng mà [R9 ranh giới phụ lục](../business-rules.md) mô tả.

```
                    ┌─ văn xuôi Điều/Khoản  → parse_provisions.py
văn bản lớp A ──────┤
                    └─ danh mục/phụ lục     → parser tách ô \x07
                                              (research/task-008-congbao-loader/parse_nd26.py,
                                               task-003 parse_tariff_doc.py (git 11275bc))
                              │
                              └─► hợp nhất, mỗi hàng bảng mang danh tính phụ lục (Phụ lục I/II/…)
```

**Cổng chặn:** `parse_provisions.py` phải **đếm và ghi log** số dòng `\x07` nó bỏ, thay vì
`continue` im lặng. Số đó khác 0 mà chưa có nhánh parser bảng chạy trên cùng văn bản ⇒ **dừng
đường ống**, không sinh `.ndjson`, không đẩy Drive.

*Ghi chú về `textutil`:* `business-rules.md:199` ghi *"không phải `textutil`"*. Vế đó đã bị
bằng chứng TASK-003 lật (`research/task-003-evfta-parser/README.md` — textutil giữ nguyên ranh
giới ô `\x07`). Điều còn đúng là **phải là parser NHẬN BIẾT Ô/PHỤ LỤC**; công cụ nào đạt được
điều đó là chuyện đã đo, không phải chuyện quy định.

## Văn bản bị sửa đổi hoặc thay thế

🔻 **Bản nháp đầu mù hoàn toàn ở đây**, dù ca này có sẵn trong chính đợt kiểm kê: NĐ 292/2026
**thay thế NĐ 69/2018**, mà NĐ 69/2018 đang được viện dẫn trong các tài liệu đã nạp.

Gemini Notebook **không có bộ lọc valid-time** — nó truy hồi theo ngữ nghĩa trên toàn bộ nguồn.
Để hai bản song song mà không dấu hiệu gì thì mô hình sẽ trích điều khoản đã bị bãi bỏ với số
hiệu đúng, ngày đúng, định dạng đúng. Vi phạm trực tiếp [R8 — đừng mô hình hoá "phiên bản mới
nhất"](../business-rules.md), nơi hiệu lực thời gian là **ràng buộc cứng**, không phải tín hiệu
xếp hạng.

Ba biện pháp:

1. **Khối trạng thái — ngoại lệ thứ hai được phép ghi đè.** File đã xuất được phép sửa **duy
   nhất** vùng giữa hai mốc `<!-- STATUS:BEGIN -->` / `<!-- STATUS:END -->` ở đầu file; hash
   phần thân ngoài mốc phải không đổi, script tự kiểm điều đó. Vì rclone giữ `fileId`, chi phí
   đẩy lại gần bằng 0.
   Cú pháp phải là **dòng có nhãn in đậm**, không phải blockquote — blockquote mất dấu `>` khi
   convert sang Docs:
   ```
   **TRẠNG THÁI: ĐÃ BỊ THAY THẾ bởi NĐ 292/2026/NĐ-CP từ 22/7/2026**
   ```
2. **Trích quan hệ trong bước phân loại.** Đọc "Điều khoản thi hành" để lấy `thay_the` /
   `sua_doi` / `bai_bo`, ghi thành **cạnh trong manifest**. Lưu như *dữ liệu về* chuyển đổi,
   **không bao giờ thực thi thành phép biến đổi văn bản** (bắt buộc theo ADR dùng VBHN).
   Khi văn bản mới nêu một số hiệu đang có trong manifest mà chưa có annotation tương ứng:
   cảnh báo và **chặn bước đẩy Drive** cho cả đợt, không chặn bước phân loại/parse.
3. **Nguồn `00-tinh-trang-hieu-luc.md`** — bảng mọi số hiệu trong notebook + trạng thái + ngày
   + văn bản thay thế + link Công báo. Sinh lại và đẩy **cuối cùng** mỗi lần chạy. Đây là phần
   rẻ nhất và giá trị nhất của cả thiết kế.

## Đường ống

```
Hộp thư đến (thư mục bất kỳ)
        │
        ├─ triage.py ──────────────► phân lớp A/B/C/D · đọc số hiệu · dò lớp text
        │                            · dò Công báo cho ca nghi vấn · trích quan hệ thay thế
        │
        ├─ fetch_congbao.py ───────► lớp A: tải bản .doc gốc (ưu tiên VBHN)
        │
        ├─ parse (2 nhánh) ────────► văn xuôi + bảng, hợp nhất, qua cổng \x07
        │
        ├─ *.ndjson ───────────────► db/seed/data/legal/  (BẢN CHUẨN, commit vào git)
        │
        ├─ render_notebook.py ─────► markdown "Docs-safe", TẤT ĐỊNH (không nhúng ngày chạy)
        │
        ├─ manifest.json ──────────► hash_exported / hash_pushed / fileId
        │
        └─ rclone (từng file) ─────► Google Drive → Google Docs, GIỮ NGUYÊN fileId
                                              │
                                              └─► Gemini Notebook tự đồng bộ sau vài phút
```

**Không có Postgres trong đường ống này.** Bộ sinh markdown đọc thẳng từ
`db/seed/data/legal/*.ndjson`, không truy vấn database — nên toàn bộ chạy được trên máy trạm.

`.ndjson` vẫn là dạng chuẩn bền. Khi có hạ tầng trở lại, `yarn db:seed:legal` nạp cả kho **kèm
mọi văn bản bổ sung trong giai đoạn không server**. Đây đúng ranh giới dự án đã chọn từ
2026-07-18: *"Tách nạp khỏi parse. Extract `.ndjson` commit là ranh giới bền giữa hai bên."*

### 🔻 Bộ sinh hiện nằm NGOÀI repo

`build_legal.py`, `build_hs.py`, `build_bundles_cu.py` đang sống ở
`~/Desktop/Legal-AI-NotebookLM-Export/_scripts/` — **ngoài git**, trên một thư mục Desktop.
Bản nháp đầu viện dẫn `build_legal.py` như thể nó nằm trong repo, kể cả cho luận điểm chịu lực
nhất ("không có Postgres trong đường ống").

**Việc đầu tiên của triển khai là chuyển chúng vào `research/inbox-loader/`.** Hạ tầng chịu tải
không được sống ngoài kiểm soát phiên bản.

### 🔻 Render phải TẤT ĐỊNH

Bộ sinh hiện nhúng `date.today()` vào **thân file**. Chạy lại cùng một `.ndjson` vào ngày khác
sinh ra bytes khác ⇒ hash khác ⇒ manifest tuyên bố "đã thay đổi" trong khi nội dung y hệt, rồi
đẩy lại toàn bộ Drive vô ích.

Ngày trích xuất phải nằm **trong khối trạng thái** (vùng được phép ghi đè) hoặc trong manifest,
**không nằm trong thân file**.

## Markdown an toàn cho Google Docs

Convert sang Google Docs phá một phần cú pháp markdown. Đã đo bằng thực nghiệm: tạo file,
convert, đọc ngược lại.

| Cú pháp | Sau khi convert | Xử lý |
|---|---|---|
| `<details><summary>` | 🔴 **Thẻ bị xoá, nội dung gộp thẳng vào đoạn trên, không còn ranh giới** | Thay bằng heading con `#### Nguyên văn tiếng Anh (WCO)` |
| Blockquote `> ` | Mất dấu `>`, thành đoạn thường | Dòng có nhãn in đậm ở đầu |
| Code fence | Mất khung, nội dung vỡ dòng | Bỏ; dùng bảng hoặc danh sách |
| **Bold trong ô bảng** | Mất, còn lại dấu sao thô `\*\*Mã HS\*\*` | Bỏ bold trong ô |
| Danh sách gạch đầu dòng `- ` | Giữ; gạch thành chấm `*`, chèn rác `<!-- end list -->` | Chấp nhận — chữ không đổi |
| **Hai dòng liền nhau** | 🔴 **Nối thành một đoạn** | Hai dấu cách cuối dòng (ngắt dòng cứng) — Doc giữ đúng từng dòng |
| **`1.` / `3)` đầu dòng** | 🔴 **Thành danh sách và Docs ĐÁNH SỐ LẠI** — `3)` về thành `2.` | Thoát: `1\.`, `3\)` |
| `- - Loại khác` | 🔴 Hai gạch đầu dòng lồng nhau, **mất dấu gạch cấp phân nhóm HS** | Thoát gạch đầu: `\- -` |
| `+ ` đầu dòng | Thành chấm `*` | Thoát: `\+` |
| `-------` / `===` dưới một dòng chữ; `_______` | 🔴 **Dòng biến mất** (tiêu đề setext; đường kẻ ngang) | Thoát ký tự đầu |
| Dòng chỉ có NBSP (`\xa0`) | 🔴 Markdown **không** coi là dòng trống → **dán hai đoạn hai bên lại** | Đổi thành dòng trống thật |
| Dòng có `\|` nhưng không có dòng `\|---\|` | Chữ thường, không phải bảng | Bảo vệ như chữ thường |
| Thụt ≥ 4 dấu cách sau dòng trống | Khối code | Bỏ thụt đầu dòng (Doc không hiện nó) |
| Code nội dòng vắt qua hai dòng | Chỗ xuống dòng thành một dấu cách — **đúng** markdown | Chấp nhận |
| **`*` trong CHỮ GỐC** (`173.6*162.6*12.1 (mm)`; dấu `*` của Chú giải Chương 29) và `- ` đầu dòng của chữ gốc | 🔴 Hai `*` ghép thành in nghiêng rồi **bị xoá — ba số dính thành một**; `- -Vây cá mập` mất một cấp gạch | Thoát `*` và `- ` đầu dòng của **chữ gốc** tại mọi chỗ renderer chèn dữ liệu (`docs_safe.literal_text`) — không thoát mẫu của renderer, nơi `**đậm**` là cố ý |
| **Ký tự vùng riêng (PUA) — font Symbol, Wingdings** | 🔴 **Bị xoá** — `Axit α-Naphthylacetic` về thành `Axit -Naphthylacetic` | Giải mã **ở bước trích xuất, theo font** — không ở tầng hiển thị, vì cùng U+F02A là `∗` trong Symbol nhưng `□` trong Wingdings 2 |
| Bảng, heading H1–H6, bold/italic/link trong đoạn văn | ✅ Giữ nguyên | — |

🔴 **Chín dòng in đậm ở trên phát hiện SAU khi đợt đầu đã chạy thật** (2026-09-10 tối), từ một câu hỏi
test trên notebook — không phải từ đường ống. Đợt đầu kiểm round-trip bằng **đếm từ**, và đã ĐẠT, trong
khi Docs đang đánh số lại khoản trên 31/32 nguồn: `1. Hàng hóa xuất khẩu, nhập khẩu tại chỗ là…` của
Điều 47a Luật Hải quan về thành `4.`, vì dòng tiêu đề `Điều 47a` bị nối vào khoản 3 của điều trước nên
danh sách chạy tiếp. Đếm từ mù với lỗi này — chữ vẫn đủ, chỉ số sai chỗ. Đúng chế độ hỏng
[R3 "Error but Valid"](../business-rules.md). Nay mọi quy tắc trên nằm trong `docs_safe.py` (có test), và
mỗi đợt đẩy kết thúc bằng `verify_drive.py`: export Doc sang **text thuần** — thứ gần nhất với cái
notebook đọc — và so **từng dòng** với file cục bộ.

**Phạm vi sửa** — 🔻 hẹp hơn bản nháp đầu tưởng. 7 file trong `1-van-ban-phap-luat/` **đã sạch
hoàn toàn**: 0 `<details>`, 0 code fence. Chỗ cần sửa là:

```
2-ma-hs-va-bieu-thue/10-sau-quy-tac-tong-quat-GRI.md      18 khối <details>
2-ma-hs-va-bieu-thue/11-chu-giai-phan.md                  10
2-ma-hs-va-bieu-thue/12-chu-giai-chuong-01-49.md          68
2-ma-hs-va-bieu-thue/13-chu-giai-chuong-50-97.md          56
                                                 tổng    152
```

Mỗi khối bọc **nguyên văn tiếng Anh WCO** của một chú giải. Convert mà không sửa thì tiếng Anh
chảy vào cuối đoạn tiếng Việt không còn dấu phân cách — người đọc lẫn mô hình đều không biết
chỗ nào hết bản dịch, bắt đầu bản gốc. Với Chú giải Phần/Chương, nơi tranh chấp phân loại xoay
quanh đúng một từ, đó là dạng hỏng âm thầm mà [ADR nạp Chú giải và
GRI](../architecture-decisions/2026-09-09-load-hs-notes-and-gri.md) tồn tại để chặn.

Blockquote và bold-trong-ô còn xuất hiện rải rác ở nhóm biểu thuế và kiến thức nghiệp vụ.

## Bố cục notebook: gom nguồn

Đo chính xác bộ hiện tại: **4.082.818 ký tự · 824.279 từ · 30 file**.

Ràng buộc chặt nhất **không phải** giới hạn 50 nguồn mà là **1,02 triệu ký tự mỗi Google Doc**.

**30 nguồn → 15 nguồn:**

| # | Nguồn | Gồm | Ký tự | % ngưỡng |
|---|---|---|---|---|
| 1 | Hướng dẫn sử dụng | `00-DOC-TRUOC` + `00-cach-doc-bieu-thue` + `09-cach-hoi` | 20.822 | 2% |
| 2 | Luật & thủ tục hải quan | Luật HQ + Luật thuế XNK + NĐ 08/2015 | 390.156 | 38% |
| 3 | TT 38/2015 thủ tục hải quan | *(riêng — quá lớn để gộp)* | 637.676 | 63% |
| 4 | Xuất xứ & xử phạt | NĐ 31/2018 + TT 33/2023 + NĐ 128/2020 | 210.667 | 21% |
| 5 | **Chú giải & GRI** | GRI + Chú giải Phần + Chú giải Chương 01–97 | 600.616 | 59% |
| 6–13 | Biểu thuế chương 01–97 | **giữ nguyên 8 file** | 1.793.297 | mỗi file ≤ 25% |
| 14 | Chương 98 & biểu thuế xuất khẩu | 2 file | 172.488 | 17% |
| 15 | Kiến thức nghiệp vụ | 6 file | 257.096 | 25% |

Sau đợt đầu: **32/50** — thêm 4 nguồn văn bản (13–16), công văn (40), Chú giải chi tiết (50–57), SEN (58),
lớp C (90), nội bộ (91).

Nhóm 5 gộp GRI với Chú giải Phần và Chú giải Chương là gộp **đúng nghiệp vụ**: theo Quy tắc 1
GRI, ba thứ đó được áp dụng cùng nhau trong một lập luận phân loại.

Nhóm biểu thuế **cố ý không gộp** — giữ được khả năng lọc theo khoảng chương khi hỏi, và mỗi
file còn nhiều biên cho việc thêm cột FTA tương lai.

### Điều kiện bắt buộc của việc gộp: mỗi tiêu đề mang số hiệu

Khi nhiều văn bản nằm chung một nguồn, đoạn được truy hồi ở giữa tài liệu **không mang theo
tiêu đề H1 ở đầu file**. Mô hình sẽ trích "Điều 5" mà không rõ Điều 5 của văn bản nào — trong
nhóm 2 có ba văn bản thủ tục hải quan cùng chỗ, đó là lỗi thật.

```
trước:  ## Điều 5. Địa điểm làm thủ tục hải quan
sau:    ## NĐ 08/2015/NĐ-CP — Điều 5. Địa điểm làm thủ tục hải quan
```

Mỗi đoạn tự khai nó thuộc văn bản nào, bất kể bị cắt ở đâu. **Đây là điều kiện của việc gộp,
không phải tuỳ chọn.**

### Tách một nguồn đã liên kết là đắt

Nếu một nguồn vượt ngưỡng và phải tách, thao tác đó **không** rẻ: nó là đúng cái việc thủ công
mà cả thiết kế này tồn tại để loại bỏ — Doc cũ phải bị gỡ khỏi notebook, hai Doc mới phải được
thêm vào bằng tay. Nên script phải **cảnh báo ở mốc 800.000 ký tự**, sớm hơn ngưỡng thật, để
việc tách được lên kế hoạch chứ không xảy ra bất ngờ.

## Đồng bộ notebook

### Cơ chế

Nguồn nhập từ Google Drive **tự động đồng bộ vài phút một lần** kể từ 2026-05-26, không có
thiết lập tắt:

> "Sources imported from Google Drive are auto-updated and will sync every few minutes. Changes
> to your original document will automatically update when you open your Notebook."

File **upload thẳng từ máy** thì ngược lại: không bao giờ đồng bộ, muốn cập nhật phải xoá nguồn
rồi thêm lại.

### Lệnh: đẩy TỪNG FILE, kiểm mã thoát từng file

```bash
set -euo pipefail
rclone copyto "<file>" "gdrive:Legal-AI-Notebook/<ten>.md" \
  --drive-import-formats md \
  --drive-export-formats md
rclone lsjson "gdrive:Legal-AI-Notebook/<ten>.md"   # lấy ID + ModTime ghi vào manifest
```

Manifest đã quyết định file nào cần đẩy — **đừng để lớp so sánh của rclone phủ quyết ngầm bên
dưới**, vì nó mù với Google Doc (xem bẫy 2).

### Sáu cái bẫy, tất cả đều làm hỏng âm thầm

*(Bẫy 5 và 6 phát hiện khi chạy thật 2026-09-10.)*

**5. `rclone lsjson` KÈM `--drive-export-formats md` không phân biệt được Google Doc với file
markdown thô.** Cả hai đều hiện ra `tên.md` / `text/markdown; charset=utf-8`, vì đó là **khung
nhìn export** chứ không phải kiểu lưu trữ. Kiểm bằng cách đó sẽ kết luận "convert thất bại"
trên một kho đã convert hoàn toàn đúng — đã xảy ra hai lần liên tiếp trong cùng một phiên.

Cách kiểm ĐÚNG, chọn một trong ba:

```bash
rclone lsjson gdrive:<thư-mục>          # KHÔNG cờ: Google Doc hiện .docx + mime Word
rclone size  gdrive:<thư-mục>           # Google Doc báo "objects with unknown size" (size = -1)
rclone cat   gdrive:<file>.md --drive-import-formats md --drive-export-formats md
                                         # bảng quay về mang dấu căn lề `| :---- |` mà bản gốc
                                         # không có -> Google dựng lại từ đối tượng table
```

**6. `client_id` dùng chung của rclone đang bị Google khai tử và ĐÃ bị rate-limit.** Lỗi thật
gặp phải:

```
403: Quota exceeded for quota metric 'Queries' … consumer 'project_number:202264815644'
NOTICE: This remote uses rclone's shared Google Drive client_id, which is being retired
        and will stop working during 2026.
```

Hạn mức đó chia cho **mọi người dùng rclone trên thế giới**, nên nó bị chạm vào những lúc không
liên quan gì tới mình. Trước mắt chỉ làm chậm; nhưng khi client bị khai tử thì **toàn bộ đường
đẩy chết**. Việc cần làm trước khi phụ thuộc nặng vào đường ống này: tạo OAuth client_id riêng
trong Google Cloud Console và đặt vào remote — xem <https://rclone.org/drive/#making-your-own-client-id>.
Nhớ đặt publishing status = **In production**, vì để *Testing* thì refresh token hết hạn sau 7
ngày (bẫy 4).

### Bốn cái bẫy nền, phải tránh ngay từ lệnh đầu tiên

1. **Thiếu `--drive-export-formats md`.** Chỉ có `--drive-import-formats md` thì rclone liệt kê
   Doc trên Drive dưới tên `foo.docx`, không khớp `foo.md` cục bộ → **báo lỗi dừng**:
   `can't convert ".md" to a document with a different export filetype (".docx")`. Phải có **cả
   hai** cờ thì tên mới khớp, và khớp tên là điều kiện để rclone đi vào nhánh `Update` trên đúng
   `fileId` cũ thay vì tạo file mới.

2. **Dùng `--checksum`.** Google Doc báo `size = -1` và không có hash. Với `--checksum`, rclone
   tụt về so sánh kích thước rồi **tuyên bố giống nhau và bỏ qua** — nội dung mới không bao giờ
   lên, không lỗi nào báo. `--ignore-size` thì thừa.

3. **Dùng service account.** Service account **không có Drive cá nhân**; ghi vào My Drive trả
   403, và quyền sở hữu không chuyển được sang tài khoản cá nhân. Phải OAuth bằng chính tài
   khoản chủ dự án.

4. **OAuth client ở chế độ Testing hết hạn sau 7 ngày.** Nếu tự tạo OAuth client trong Google
   Cloud Console mà để publishing status = *Testing*, refresh token **hết hạn sau 7 ngày** và
   toàn bộ đường đẩy chết im lặng cho tới lần chạy sau. Phải chuyển sang *In production*, hoặc
   dùng client ID mặc định của rclone.

### 🔻 Tên file là khoá nối duy nhất

Tên file cục bộ ↔ tên Google Doc là **thứ duy nhất** nối hai bên. Đổi tên một file cục bộ ⇒
rclone không tìm thấy Doc tương ứng ⇒ **tạo Doc mới với `fileId` mới** ⇒ nguồn cũ trong notebook
trỏ vào Doc mồ côi, không bao giờ cập nhật nữa, **và không có lỗi nào báo**.

Manifest phải coi tên file là **bất biến**. Đổi tên là thao tác thủ công có kiểm soát, không
phải hệ quả phụ của việc sửa script.

### Cơ chế giữ `fileId` và cách kiểm

rclone cập nhật Doc đã tồn tại bằng `files.update` trên **đúng `fileId` cũ**, không xoá tạo lại.
Google xác nhận: *"When you upload and convert media during an `update` request to a Docs,
Sheets, or Slides file, the full contents of the document are replaced."*

*(Số dòng cụ thể trong `backend/drive/drive.go` khác nhau giữa các bản phát hành — đừng ghim số
dòng, hãy kiểm bằng hành vi: `rclone lsjson` sau khi đẩy, so `ID` với lần trước.)*

Giữ `fileId` là điều kiện sống còn: **xoá file khỏi Drive thì nguồn tương ứng bị gỡ khỏi
notebook.** Nếu `ID` đổi so với lần trước ⇒ rclone đã tạo file mới thay vì update ⇒ **báo động
ngay**, đừng im lặng.

Phòng vệ tối thiểu cho thư mục Drive:
- **Không bao giờ dùng `rclone sync`** trên thư mục này — `sync` xoá file phía đích. Chỉ `copyto`.
- Bật `--drive-use-trash` (mặc định) để file xoá nhầm còn trong Thùng rác 30 ngày.
- `.ndjson` trong git là bản gốc thật; Drive chỉ là bản dẫn xuất, dựng lại được — nhưng dựng lại
  sinh `fileId` mới, tức phải thêm lại nguồn bằng tay. Đó là chi phí thật của việc xoá nhầm.

### Hạn mức đã xác minh

| Hạn mức | Giá trị | Hiện trạng |
|---|---|---|
| Nguồn mỗi notebook, bản Standard (miễn phí) | **50** | 15 sau khi gộp + 5 đợt mới = **20** |
| Mỗi nguồn | 500.000 từ hoặc 200 MB | File lớn nhất 138.765 từ = **27,8%** |
| Mỗi Google Doc | **1,02 triệu ký tự** | File lớn nhất 637.676 ký tự = **62,5%** |
| Convert tài liệu văn bản | tối đa 50 MB | không chạm tới |

*(NotebookLM đổi tên thành **Gemini Notebook** từ 2026-07-16. Cùng sản phẩm, link cũ tự chuyển
hướng, trợ giúp ở `support.google.com/gemininotebook`.)*

## Manifest

`manifest.json` giữ cho mỗi file đã xuất:

| Trường | Ý nghĩa |
|---|---|
| `path` | Đường dẫn cục bộ — **bất biến**, xem bẫy tên file |
| `hash_exported` | Ghi lúc render. Thứ mà quy tắc "chỉ thêm" dùng để cưỡng chế |
| `hash_pushed` | **Chỉ ghi sau khi rclone trả mã thoát 0 cho đúng file đó** |
| `pushed_at`, `drive_file_id`, `drive_modtime` | Bằng chứng phía Drive, lấy từ `rclone lsjson` |
| `documents[]` | Số hiệu các văn bản chứa trong file |
| `relations[]` | Cạnh `thay_the` / `sua_doi` / `bai_bo` — dữ liệu, không phải phép biến đổi |

Ba quy tắc, cưỡng chế bằng code chứ không bằng trí nhớ:

1. **Chỉ thêm, không sửa.** Một nguồn đã đẩy chỉ được **lớn lên**: mọi dòng đã đẩy phải còn nguyên,
   đúng thứ tự, trong bản mới (`manifest.is_extension`, có test). Thêm một văn bản vào nguồn gộp thì
   qua; sửa, xoá, đổi thứ tự chữ đã đẩy thì bị chặn — đó chính là cách một lỗi parser âm thầm viết lại
   luật trong một nguồn không ai đọc lại. Bằng chứng so sánh là bản sao đúng từng byte của lần đẩy
   trước, giữ ở `<dest>/.pushed/`; không có bản sao thì mọi thay đổi đều bị chặn.
   Ba nguồn **phái sinh** (00 tình trạng, 01 hướng dẫn, 30 kiến thức nghiệp vụ) được đổi tự do. Ghi đè
   có chủ đích thì chỉ định **đích danh**: `--force-file <tên>.md`.
   🔻 *Bản đầu chặn MỌI thay đổi. Với nguồn gộp, mỗi lần thêm tài liệu đều thành một lần `--force` — và
   một cờ lúc nào cũng phải truyền thì không bảo vệ gì. Tiêu đề trong nguồn chỉ-thêm cũng không được
   mang số đếm ("29 văn bản"), vì số đếm đổi thì dòng cũ biến mất.*
2. **Đẩy khi `hash_exported != hash_pushed`, hoặc khi `hash_pushed` vắng mặt.** Vắng mặt = chưa
   bao giờ lên Drive ⇒ **luôn phải đẩy**. 🔻 Điều này khiến rclone hỏng giữa chừng **tự động
   được thử lại** ở lần chạy sau, không cần thêm cơ chế nào.
3. **Không bao giờ ghi `hash_pushed` theo lô.** Bản nháp đầu để ngỏ điểm này; nếu ghi cả lô thì
   lần chạy sau thấy hash khớp và **bỏ qua đúng những file chưa bao giờ lên tới Drive** —
   notebook phục vụ văn bản cũ vĩnh viễn, không lỗi nào báo.

Trường hợp `--force` hợp lệ duy nhất hiện biết: **sửa parser rồi sinh lại cả kho** — đã xảy ra
hai lần. Đúng trường hợp đó thì Google Docs phát huy giá trị: nội dung đổi, `fileId` giữ nguyên,
notebook tự cập nhật, không ai đụng vào giao diện.

## Kế hoạch kiểm chứng

*"Một chỉ số đi đúng hướng không phải bằng chứng thay đổi là đúng"* — bài học lặp ba lần trong
nhật ký dự án. Mọi mục dưới đây so với văn bản thật, không phải số đếm.

| Kiểm | Cách làm | Đạt khi |
|---|---|---|
| Parse đúng | Đếm Chương/Điều máy ra, **đối chiếu tay** trên bản `.doc` | Khớp tuyệt đối |
| **Không mất phụ lục** | Đếm dòng `\x07` bị bỏ; đếm dòng hàng hoá trong danh mục máy ra, so tay với bản gốc | 0 dòng bảng bị bỏ mà không có nhánh bảng chạy |
| Không nuốt chữ | Bốc **ngẫu nhiên 5 điều**, so nguyên văn với nguồn | 5/5 khớp từng chữ |
| Phân lớp đúng | Kiểm tay nhãn A/B/C/D của cả 20 tài liệu | 20/20 |
| **Lớp C có căn cứ** | Mỗi văn bản trong `90-CHUA-XAC-DINH` phải kèm bản ghi tra cứu Công báo | 100% thật sự không có trên Công báo |
| Manifest chặn thật | Chạy script **hai lần liên tiếp** | Lần hai báo `0 file mới, 0 ghi đè, 0 đẩy` |
| **Render tất định** | Chạy render hai lần, đổi ngày hệ thống giữa hai lần | Hash thân file không đổi |
| rclone giữ `fileId` | `rclone lsjson` sau **mỗi** đợt đẩy, so `ID` với manifest | `ID` không đổi |
| **Docs không nuốt, không đánh số lại** | `verify_drive.py`: export Doc sang **text thuần**, so **từng dòng** với bản cục bộ, sau **mỗi** đợt đẩy | `0 lệch` trên mọi nguồn. *Không* dùng đếm từ — nó đã ĐẠT trên một kho bị đánh số lại |
| Notebook cảnh báo lớp C | Hỏi một câu về nội dung lớp C | Nêu rõ **chưa xác định tình trạng** |
| **Notebook cảnh báo hết hiệu lực** | Hỏi một điều khoản thuộc văn bản đã bị thay thế | Nêu rõ đã hết hiệu lực và chỉ ra văn bản thay thế |
| **Notebook từ chối con số thuế** | Hỏi thuế suất/mã HS của một mặt hàng | **Không** nêu con số, chỉ dẫn sang đường tra khoá |

Ba mục cuối quan trọng nhất. Nhãn nằm trong file mà mô hình không nhắc lại thì nhãn đó vô dụng.

🔻 *Bản nháp đầu có mục "Notebook cảnh báo dự thảo" mà tiêu chí ĐẠT là "câu trả lời nêu rõ chưa
ban hành" — với `09-bvhttdl.pdf` thì mục đó sẽ **nghiệm thu chính cái sai**. Nay tiêu chí gắn
thêm điều kiện phải có bản ghi tra cứu Công báo.*

## Bẫy đã gặp khi chạy thật (đợt đầu 2026-09-10)

1. **pypdf làm vỡ âm tiết tiếng Việt** (`"truy ền ho ặc"`) trên 85/100 file Chú giải — trông vẫn có
   chữ, nhưng tìm "hoặc" không khớp. pymupdf: 0,004 chỗ/1000 ký tự. pdfplumber không vỡ âm tiết
   nhưng **đọc lẫn hai cột** Việt–Anh vào nhau từng dòng.
2. **Tiêu đề nhóm nằm trong khối chữ vắt ngang hai cột**; lọc theo vị trí cột làm mất ~60% tiêu đề.
   Nhận tiêu đề chỉ khi mã có thật trong danh mục chương đó **và** đứng sau tiêu đề trước — định
   dạng đúng chưa đủ, vì tham chiếu chéo cũng mở đầu dòng.
3. **`.docx` của Công báo có đường dẫn zip kiểu Windows** (`customXml\item1.xml`) và mục `[trash]`
   — cả textutil lẫn python-docx đều không mở được. Đóng gói lại với `/`.
4. **Ngắt dòng mềm trong đoạn tiêu đề** (`"Mục 2\nĐÁNH GIÁ…"`) làm parser nuốt điều kế tiếp như
   phần đuôi tên mục — NĐ 37/2026 mất 5/99 điều cho tới khi tách đoạn theo `\n`.
5. **PDF lai**: 9/37 PDF có trang 1 là text, các trang sau là ảnh. Quyết định "có text" theo trung
   bình cả file đã bỏ qua ba trang chứa kết luận mã HS của công văn Flycam. Phải theo **từng trang**.
6. **OCR làm hỏng mã HS** (`8479.89.30` → `84/9.89.30`, `6592` → `6593`). Đọc kép (agent đọc ảnh gốc +
   agent thẩm tra độc lập) sửa 103 chỗ; không mã nào lấy thẳng từ OCR.
7. **Agent tự gõ trường chỉ-chữ-số lệch với trường có dấu chấm** (`8534.00.30` → `85343000`). Mọi
   trường suy ra được thì suy bằng code, không để agent gõ.
8. **Tìm nhị phân theo số hiệu chỉ đúng với nghị định.** Thông tư, quyết định: mỗi bộ đánh số riêng,
   nên phải theo **ngày đăng Công báo** (có sẵn trên từng mục của trang danh sách).
9. **CDN tải file chỉ gửi chứng thư lá** → Python báo `CERTIFICATE_VERIFY_FAILED`; curl dùng kho tin
   cậy của macOS thì qua. Docker image giải bằng cách ghim chứng thư GlobalSign.
10. **Rác mã trường Word** (`HYPERLINK "http://…"`) nằm sẵn trong 11 điều khoản của NĐ 31/2018 và đã
    lên notebook từ trước; lọc ở tầng hiển thị, dữ liệu verified giữ nguyên.
11. **Đọc đoạn trích có thể ghi sai quan hệ**: một đoạn cắt giữa câu gợi ý NĐ 37/2026 *sửa* NĐ 43/2017;
    toàn văn cho thấy nó **làm hết hiệu lực** NĐ 43/2017. Quan hệ chỉ ghi từ toàn văn.
12. **`rclone lsjson` kèm cờ export** hiển thị Google Doc như file `.md` thô — báo động nhầm "không
    convert" hai lần. Kiểm bằng `rclone size` (Google Doc có size −1).
13. **`rclone config create` không in link xác thực** khi chạy nền; mở `/auth` trần bị *"State did not
    match"*. Dùng `rclone authorize "drive" --auth-no-open-browser`.
14. **`node_modules` hỏng** (TypeScript, `@types/node`, `postgres` thiếu file) — không kiểm kiểu được
    trên máy này. Cần `yarn install` trước khi tin bất cứ lần build nào.
15. **Google Docs đánh số lại khoản — kiểm bằng đếm từ không thấy.** Markdown `1.` đầu dòng là danh
    sách; dòng liền nhau bị nối; Docs đánh số danh sách theo ý nó. 31/32 nguồn lệch khi so từng dòng
    (nguồn 11: 9.660 dòng dồn còn 912). Sửa trong `docs_safe.py`, kiểm bằng `verify_drive.py`. Việc
    sửa chỉ đổi định dạng — `manifest.is_extension` so trên chữ nhìn thấy, nên nó qua mà không cần
    `--force` và **đồng thời chứng minh** không chữ nào đổi (29 nguồn báo `reformatted`).
16. **Ký tự font Symbol/Wingdings nằm ở vùng Unicode riêng (U+F0xx), và Docs xoá chúng.** 22 ký tự trong 3
    nguồn: α β Ω [ ] ≥ trong Chú giải chi tiết (font `SymbolMT` — kiểm từng đoạn chữ trong PDF), □ ✓
    trong biểu mẫu GS1 của NĐ 37/2026 (font `Wingdings 2` — đọc bằng mắt trên PDF Công báo). **Cùng một mã
    khác nghĩa theo font**, nên giải mã ở tầng hiển thị là đoán; phải giải mã lúc trích xuất, nơi còn
    biết font. Chạy lại cả hai bộ trích xuất: chỉ đúng 5 bản ghi Chú giải và 1 bảng phụ lục đổi, không
    dòng nào khác.
17. **Bộ kiểm tra tự viết cũng phải bị kiểm.** `verify_drive.py` bản đầu xoá MỌI dấu `*` ở cả hai phía để bỏ
    nhấn mạnh — nên nó báo `0 lệch` trong khi `173.6*162.6*12.1` trên Doc đã thành `173.6162.612.1`. Bắt được
    nhờ một đợt kiểm độc lập (5 góc nhìn, 23 agent, mỗi phát hiện có một agent phản biện): so số khoản với dữ
    liệu Công báo, so tập hợp mọi con số, và một agent chuyên tìm chỗ bộ chuẩn hoá che lỗi. Nay phía Doc
    không bị chuẩn hoá gì ngoài dấu chấm đầu dòng; phía cục bộ chỉ bỏ nhấn mạnh đúng dạng renderer viết.

## Chưa xác minh / không được dựa vào

- **Bài test golden (recall@k) chưa đo lại** với kho 15 văn bản — cần DB. Kho lớn hơn có thể làm
  recall trên câu hỏi cũ dịch chuyển.
- **Tình trạng hiệu lực của 52/2018, 18/2019, 72/2022, 11/2024** chỉ dựa trên ngày hiệu lực đã tới —
  không biết sau đó đã bị sửa/thay chưa. Nhãn `auto_unverified` gánh phần này.
- **16 bản ghi Chú giải chi tiết** mang nhãn "có thể gồm cả nhóm X".
- **3 tài liệu lớp C** (TT BNV, CV lưỡng dụng, `09-bvhttdl.pdf`): không tìm thấy bản đã ký — có thể
  chưa ban hành, cũng có thể đã ban hành với số khác. Chưa có lịch rà định kỳ.
- **`client_id` dùng chung của rclone** đang bị khai tử trong 2026.
- **Đồng bộ với `.md` đặt trên Drive mà không convert** — vùng xám, thiết kế không dùng.
- **Giới hạn 500.000 từ mỗi nguồn theo gói trả phí** — không có tài liệu chính thức.

## Liên quan

- [Kho pháp luật tự mở rộng](legal-corpus-self-extension.md) — đường ngược lại: bot tự đi lấy
- [Quy tắc nghiệp vụ](../business-rules.md) — R3 sai âm thầm, R7 độ cũ, R8 hiệu lực là ràng buộc
  cứng, R9 ranh giới phụ lục, R10 kiểm căn cứ trích dẫn
- [Nguồn dữ liệu](../concepts/data-sources.md)
- [Văn bản pháp luật Việt Nam](../concepts/vietnamese-legal-documents.md)
- [Bot Zalo: hiểu ảnh + tin quote](zalo-bot-image-and-quote-context.md) — mẫu confine Read cho bậc 4
- [Runbook — lần sau làm thế nào](../../research/inbox-loader/README.md)
- [ADR nạp bản tiếng Việt Chú giải chi tiết và SEN](../architecture-decisions/2026-09-10-load-vietnamese-explanatory-notes.md)
