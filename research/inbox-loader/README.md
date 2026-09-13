# Hộp thư đến → kho tri thức → notebook

Công cụ để **bổ sung văn bản mới** vào dự án và vào Gemini Notebook (trước là NotebookLM), lặp lại
được, không phải upload lại notebook. Thiết kế và lý do của từng quy tắc:
[.agent/docs/inbox-ingest-workflow.md](../../.agent/docs/inbox-ingest-workflow.md).

**Cách dùng nhanh nhất:** bỏ tài liệu vào một thư mục, rồi nhờ Claude:
> *"Có tài liệu mới trong thư mục `~/Downloads/<tên>`. Nạp theo `research/inbox-loader/README.md`."*

Phần dưới đây là chính quy trình đó, để người hoặc agent làm theo từng bước.

---

## Một lần, đã làm ngày 2026-09-10

| Việc | Lệnh / trạng thái |
|---|---|
| Thư viện Python | `python3 -m venv .venv && .venv/bin/pip install -r research/inbox-loader/requirements.txt` |
| rclone + quyền Google Drive | `brew install rclone` · `rclone authorize "drive" --auth-no-open-browser` rồi mở **đúng link nó in ra** (có tham số `state`). Remote tên `gdrive`, scope `drive.file` — rclone chỉ thấy file do nó tạo |
| OCR tiếng Việt (macOS Vision) | `swiftc -O research/inbox-loader/ocr_vision.swift -o /tmp/ocr_vision` |
| Thư mục Drive | `gdrive:Legal-AI-Notebook` · https://drive.google.com/drive/folders/1B8iRztcfSW5ZixcLwrM1il7sbz3XU5Nk |
| Notebook | Mọi nguồn được thêm **từ Google Drive** (không upload file) → tự đồng bộ vài phút một lần |

⚠️ **`client_id` dùng chung của rclone đang bị Google khai tử trong 2026** và đã gặp rate-limit. Trước
khi phụ thuộc lâu dài: tạo OAuth client riêng (https://rclone.org/drive/#making-your-own-client-id),
publishing status = **In production** (để *Testing* thì token hết hạn sau 7 ngày).

---

## Mỗi lần có tài liệu mới

### 1. Kiểm kê — không tin tên file

Với mỗi file, ghi lại: số hiệu, ngày, cơ quan **đọc từ trang đầu** (tên file đã từng ghi số sai 2 lần).

- **File trùng**: so md5, loại bản trùng.
- **PDF có lớp text không**: quyết định **theo từng trang**, không lấy trung bình cả file — PDF lai
  (trang 1 có text, trang 2–4 là ảnh) từng làm mất đúng trang chứa mã HS kết luận.
- **Phân lớp** (xem [R15](../../.agent/business-rules.md)):

| Lớp | Là gì | Đi đâu |
|---|---|---|
| A | VBQPPL đã ban hành | Công báo → `ingest_congbao.py` → kho + notebook |
| B | Công văn hướng dẫn | `collect_notebook_only.py` → chỉ notebook (nguồn 40) |
| C | Ô số hiệu/ngày trống **và** dò Công báo không thấy | chỉ notebook, nhãn đỏ (nguồn 90) |
| D | Nội bộ, tóm tắt, bảng tổng hợp | chỉ notebook, nhãn nội bộ (nguồn 91) |

**Ô số hiệu trống ≠ dự thảo.** Ba lần trong đợt đầu, file "trông như dự thảo" hoá ra là bản chưa ký
của văn bản ĐÃ ban hành (TT 36/2026/TT-BKHCN; CV 18648/CHQ-GSQL giống 0,99). Luôn dò Công báo trước.

### 2. Tìm văn bản gốc trên Công báo

```
python3 congbao_lookup.py 292/2026/NĐ-CP                                   # nghị định: theo số hiệu
python3 congbao_lookup.py --near 11/2024/TT-BTTTT 2024-10-05 '03/2015'     # thông tư, quyết định: theo NGÀY ĐĂNG
python3 congbao_lookup.py --title thong-tu-l3 'rủi ro' 2026                # bản chưa ký: theo tiêu đề
```

Thông tư và quyết định **phải** tìm theo ngày: mỗi bộ đánh số riêng, nên `11/2024/TT-BTTTT` (tháng 9)
và `11/2024/TT-BTC` (tháng 2) cùng số mà cách nhau hàng trăm trang.

### 3. Nạp văn bản lớp A

Thêm một dòng vào `SOURCES` trong `ingest_congbao.py` — `(số hiệu, congbao id, tên thư mục, lĩnh vực)` —
và vào `LEGAL_SOURCES` trong `render_notebook.py` (chọn nguồn notebook chứa nó). Rồi:

```
.venv/bin/python ingest_congbao.py --work <thư-mục-tạm> --download --dry-run   # xem trước
.venv/bin/python ingest_congbao.py --work <thư-mục-tạm> --download             # ghi vào db/seed/data/legal/
```

Script **từ chối ghi** nếu: Điều không liên tục 1..N (cổng cấu trúc), còn rác mã trường Word
(`HYPERLINK …`), hoặc Công báo không nêu ngày hiệu lực. Văn bản vào ở `auto_unverified` ([R18](../../.agent/business-rules.md)).

Sau đó đọc "Điều khoản thi hành" và ghi quan hệ thay thế/bãi bỏ vào
`db/seed/data/legal/relations.ndjson` — **chép từ toàn văn**, không suy từ đoạn trích.

### 4. Công văn phân loại, văn bản scan — đọc kép

```
/tmp/ocr_vision "<file.pdf|.tif|.jpg>" 99 <thư-mục>/<slug>  > <thư-mục>/<slug>/ocr.txt
```

Mỗi thư mục cần `source.txt` (tên file gốc) và `ocr.txt` + `page-N.png`, hoặc `text.txt` nếu có lớp text.
Rồi nhờ Claude chạy workflow `workflows/classification-rulings-dual-read.js` với `args.workdir` là thư mục
cha: một agent đọc ảnh gốc, một agent độc lập thẩm tra số hiệu, ngày, **mã HS**. OCR máy làm hỏng mã HS
(`8479.89.30` → `84/9.89.30`); đợt đầu có 103 chỗ được ảnh gốc sửa lại. Gộp kết quả:

```
python3 merge_rulings.py <workflow-output.json>
```

### 5. Tài liệu chỉ vào notebook (lớp B, C, D)

Thêm mục vào `ENTRIES` trong `collect_notebook_only.py`, với câu `status` sẽ in ở đầu tài liệu:

```
python3 collect_notebook_only.py --texts <thư-mục-text> [--rulings-extra <ndjson>]
```

### 6. Render và đẩy

```
python3 render_notebook.py --dest ~/Desktop/Legal-AI-NotebookLM-Export/drive
python3 push_notebook.py  --dest ~/Desktop/Legal-AI-NotebookLM-Export/drive \
                          --remote gdrive:Legal-AI-Notebook --manifest drive-manifest.json
python3 verify_drive.py   --dest ~/Desktop/Legal-AI-NotebookLM-Export/drive \
                          --remote gdrive:Legal-AI-Notebook
```

- **Luôn chạy `verify_drive.py` sau khi đẩy.** Nó đọc ngược từng Google Doc dưới dạng text thuần — gần
  nhất với cái notebook đọc — và so **từng dòng** với file cục bộ. Phải ra `0 lệch · 0 thiếu`. `SAI` nghĩa
  là Docs đã đổi chữ hoặc số (đánh số lại khoản, nối dòng, xoá dòng): sửa `docs_safe.py`, render, đẩy lại.
  Đừng thay nó bằng đếm từ — đếm từ đã ĐẠT trên một kho bị đánh số lại khoản (bẫy 15 trong
  [thiết kế](../../.agent/docs/inbox-ingest-workflow.md)).

- **Nguồn mới** → vào notebook bấm *Thêm nguồn → Google Drive* một lần duy nhất.
- **Nguồn đã có mà nội dung đổi** → tự cập nhật sau vài phút, không làm gì cả.
- Mọi nguồn là **chỉ thêm, không sửa**. Thêm một văn bản vào nguồn gộp (15, 16, 40, 90…) thì đi qua
  bình thường — script báo `extended`; chỉ đổi định dạng (mọi dòng nhìn thấy giống hệt) thì báo `reformatted`. **Một đợt chỉ sửa định dạng mà có nguồn báo `extended` là có chữ MỚI xuất hiện** — dừng lại, so bản trước/sau; đó là cách bắt được lỗi in lặp khoản ngày 2026-09-10. Nếu một dòng **đã đẩy** bị sửa, xoá hoặc đổi thứ tự, script
  **dừng**: đó là cách một lỗi parser âm thầm viết lại luật. Cố ý thì chỉ định đích danh:
  `--force-file <tên>.md`. Ba nguồn phái sinh (00, 01, 30) được đổi tự do.
- Bằng chứng để phân biệt "thêm" với "sửa" là bản sao đúng từng byte của lần đẩy trước, ở
  `<dest>/.pushed/`. **Đừng xoá thư mục đó** — mất nó thì mọi thay đổi đều bị coi là sửa.

---

## Kiểm trước khi đẩy

| Kiểm | Đạt khi |
|---|---|
| `python3 -m unittest test_docs_safe test_manifest` | xanh |
| Render hai lần | byte-identical |
| `grep -l "<details>\|HYPERLINK" <dest>/*.md` | không có file nào |
| Mỗi nguồn | < 800.000 ký tự (Google Docs chặn ở 1.020.000) |
| Mẫu ngẫu nhiên điều khoản | khớp nguyên văn file nguồn |
| Đẩy lần hai | `0 file mới, 0 ghi đè, 0 đẩy` |
| **Sau khi đẩy:** `python3 verify_drive.py …` | `32 nguồn · 0 lệch · 0 thiếu` |

## `drive-manifest.json` — đừng xoá

Nó giữ `fileId` của từng Google Doc. Mất nó thì lần đẩy sau tạo Doc **mới**, và mọi nguồn trong notebook
trỏ vào Doc mồ côi, không bao giờ cập nhật nữa — không có lỗi nào báo.

## Khi có lại máy chủ

1. `yarn install` — `node_modules` hiện hỏng (TypeScript, `@types/node`, `postgres` thiếu file).
2. `FORCE_RESEED=1 yarn db:seed:legal` nạp 15 văn bản (8 văn bản mới ở `auto_unverified`).
3. Chú giải chi tiết, SEN, công văn phân loại, bảng phụ lục, tài liệu chỉ-notebook **chưa có bảng trong
   Postgres** — cần mở schema, vướng nợ snapshot drizzle 0007–0009 ([TASK-022](../../.agent/planning/04-inbox-ingest-tasks.md)).

## Tệp trong thư mục này

| Tệp | Vai trò |
|---|---|
| `congbao_lookup.py` | Tìm văn bản trên Công báo không cần chỉ mục DB |
| `ingest_congbao.py` | Công báo → `documents/provisions/chunks/annex-tables.ndjson` |
| `extract_explanatory_notes.py` | Chú giải chi tiết HS + SEN (cột tiếng Việt) |
| `ocr_vision.swift` | OCR tiếng Việt bằng macOS Vision, xuất ảnh trang |
| `workflows/classification-rulings-dual-read.js` | Đọc kép công văn scan |
| `merge_rulings.py` | Gộp kết quả đọc kép, chấm mã theo AHTN 2022 |
| `collect_notebook_only.py` | Tài liệu lớp B/C/D |
| `render_notebook.py` | Sinh 32 nguồn notebook |
| `push_notebook.py`, `manifest.py` + test | Đẩy lên Drive, giữ `fileId`, chặn sửa chữ đã đẩy |
| `docs_safe.py` + test | Markdown an toàn cho Google Docs: chặn đánh số lại, nối dòng, mất dòng; lọc rác mã trường Word |
| `verify_drive.py` | Đọc ngược Doc dạng text thuần, so từng dòng — bắt Docs đánh số lại, nối dòng, xoá dòng |
