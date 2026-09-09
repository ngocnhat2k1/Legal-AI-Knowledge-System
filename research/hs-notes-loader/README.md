# HS notes loader — nạp Chú giải Phần/Chương và 6 quy tắc GRI

**Trạng thái: TRÍCH XUẤT XONG + ĐÃ KIỂM CHỨNG (2026-09-09). CHƯA nạp vào Postgres — xem [Việc còn lại](#việc-còn-lại).**

Bổ sung phần còn thiếu của AHTN 2022 trong kho dữ liệu: **Chú giải Phần (Section Notes),
Chú giải Chương (Chapter Notes), Chú giải phân nhóm (Subheading Notes)** và **sáu quy tắc
tổng quát (GRI)** kèm Chú giải chi tiết của từng quy tắc.

## Vì sao cần

Danh mục 11.414 mã HS đã được nạp từ NĐ 26/2023 (xem [TASK-008](../task-008-congbao-loader/README.md)),
nhưng đó mới là **bảng**. Phần **mang giá trị pháp lý** khi phân loại lại nằm ở chỗ khác:

> **Quy tắc 1 GRI:** *"Tên của Phần, Chương hoặc Phân chương được đưa ra chỉ nhằm mục đích dễ
> tra cứu. Để đảm bảo tính pháp lý, việc phân loại hàng hóa phải được xác định theo nội dung
> của từng nhóm và bất cứ chú giải của các Phần, Chương liên quan…"*

Trước thay đổi này, kho dữ liệu chứa **đúng 1 lần** xuất hiện của chuỗi "Chú giải" trên toàn bộ
4.472 điều khoản. Nghĩa là mọi lập luận phân loại thực tế — vốn xoay quanh Chú giải Phần/Chương —
đều **không kiểm chứng được** bằng kho dữ liệu, và một mô hình được hỏi *"Chú giải 1(g) Phần XVI
nói gì?"* sẽ bịa ra câu trả lời.

Điều đó đã được quan sát trực tiếp: trong một transcript của công cụ tra cứu HS khác, **cùng một
mặt hàng hỏi hai lần cho ra hai cách đọc trái ngược nhau** về Chú giải 1(g) Phần XVI — một lần
đúng, một lần ngược chiều — mà cả hai đều tự chấm "độ tin cậy 95%".

## Nguồn

**Thông tư 31/2022/TT-BTC** ngày 08/6/2022 của Bộ Tài chính, ban hành Danh mục hàng hóa xuất khẩu,
nhập khẩu Việt Nam (AHTN 2022). Hiệu lực **01/12/2022**, thay thế Thông tư 65/2017/TT-BTC.

- Công báo số **523+524 … 557+558** ngày 08/7/2022 — **18 phần** `.doc`
- congbao id `37431` · <https://congbao.chinhphu.vn/van-ban/thong-tu-so-31-2022-tt-btc-37431.htm>
- Phụ lục I = Danh mục (chứa Chú giải Phần/Chương) · Phụ lục II = Sáu quy tắc tổng quát
- Bản `.doc` được dùng thay `.pdf`, cùng lý do như NĐ 26/2023: PDF là bản scan 200 DPI không có lớp text

## Đường ống

```
congbao (18 phần .doc)  ->  textutil -convert txt  ->  parse_hs_notes.py  ->  out/*.ndjson
                                                                              |
                                                       render_markdown.py  ->  markdown cho NotebookLM
```

`doc/`, `txt/` và `out/` **không commit** (~54 MB thô). Bản trích xuất chuẩn được commit ở
**`db/seed/data/legal/hs-notes.ndjson`** và **`hs-gri.ndjson`**, để loader chạy được offline sau
khi token CDN hết hạn — cùng quy ước với [TASK-008](../task-008-congbao-loader/README.md) và
[legal-loader](../legal-loader/).

## Bốn cái bẫy đã lộ ra khi làm

1. **Unicode trộn NFC/NFD — bẫy nguy hiểm nhất.**
   `PHẦN XV` được viết bằng **Ầ dạng tổ hợp** (`U+00C2` + `U+0300`), trong khi 20 Phần còn lại
   dùng dạng dựng sẵn `U+1EA6`. Grep bằng `Ầ` dựng sẵn **âm thầm bỏ sót đúng một Phần** — và
   Phần XV là phần kim loại cơ bản, thứ mà một nửa số tranh chấp *"Chương 73 hay Chương 84?"*
   xoay quanh. Không có lỗi nào được báo; chỉ thiếu dữ liệu.
   **Sửa:** chuẩn hóa NFC toàn bộ khi đọc.

2. **Sort key bắt nhầm số.** `re.search(r'(\d+)', 'tt31_523.txt')` khớp `31` của tiền tố `tt31`,
   không phải số Công báo `523`. Mọi file cùng key → `sorted()` giữ nguyên thứ tự `os.listdir`,
   và 18 phần bị xáo trộn (Phần XXI đứng trước Phần XV). Kết quả trích xuất *trông vẫn hợp lệ*
   vì mỗi khối chú giải nằm ngay sau tiêu đề của nó. **Sửa:** khớp `_(\d+)`.

3. **Running header ở mỗi đầu phần.** Mỗi phần Công báo mở lại bằng `(Tiếp theo Công báo số N + M)`,
   `Phụ lục I`, và tiêu đề thông tư. Để nguyên thì chúng rơi vào giữa khối chú giải đang mở dở
   vắt qua ranh giới phần.

4. **Chú giải kết thúc ở đầu bảng, không ở dòng trống.** Terminator là dòng tiêu đề bảng
   `Mã hàng` / `Code`, không phải một chuỗi dòng trống.

Văn bản song ngữ (dòng Việt, dòng trống, dòng Anh). Hai ngôn ngữ được tách bằng **nhận dạng chữ
viết** (dấu thanh tổ hợp + chữ cái riêng của tiếng Việt), không dựa vào vị trí — vì dòng trống
không đáng tin và nhiều mục không mang số thứ tự.

## Kết quả (đã kiểm chứng)

| Chỉ số | Giá trị |
|---|---|
| Dòng đọc vào | 132.412 |
| Khối chú giải | **134** (96 `Chú giải` + 38 `Chú giải phân nhóm`) |
| Phần có chú giải | **9** — I, II, IV, VI, VII, XI, XV, XVI, XVII |
| Chương có chú giải | **93** / 97 |
| Chương KHÔNG có chú giải | 50, 53, 81 (đúng — vào thẳng bảng), **77** (để trống dự phòng) |
| Khối GRI | **18** — Quy tắc 1, 2, 2(a), 2(b), 3, 3(a), 3(b), 3(c), 4, 5, 5(a), 5(b), 6 |
| Khối lượng | 55.793 từ tiếng Việt + 41.038 từ tiếng Anh (chú giải), 5.073 từ (GRI) |

**Kiểm chứng đã chạy:**

- 21/21 marker `PHẦN` và 97/97 marker `Chương` được tìm thấy sau khi chuẩn hóa NFC (trước đó: 20 và 97).
- Danh sách 9 Phần có chú giải **khớp đúng** HS 2022 (I, II, IV, VI, VII, XI, XV, XVI, XVII).
- 3 chương báo "không có chú giải" được **đối chiếu text thô**: cả ba đi thẳng từ tiêu đề chương
  sang `Mã hàng`. Chương 77 mang đúng dòng *"(Dự phòng cho việc phân loại tiếp theo trong tương lai)"*.
- **0/134** khối rỗng; **0/134** khối lệch tỉ lệ từ Việt/Anh bất thường → tách ngôn ngữ sạch.
- Đối chiếu nội dung: Chú giải **1(g)** và **2(b)** Phần XVI trích ra nguyên văn, khớp bản WCO tiếng Anh đi kèm.

## Tái hiện

```bash
# 1. Lấy link tải từ trang văn bản (token CDN hết hạn nhanh — tải ngay)
#    https://congbao.chinhphu.vn/van-ban/thong-tu-so-31-2022-tt-btc-37431.htm
#    18 link .doc dạng g7.cdnchinhphu.vn/api/download/stream?...
# 2. Chuyển sang text (macOS)
for f in doc/*.doc; do textutil -convert txt -encoding UTF-8 -output "txt/$(basename "$f" .doc).txt" "$f"; done
# 3. Trích xuất, rồi chép sang bản canonical
python3 parse_hs_notes.py txt/ --emit out/
cp out/hs-notes.ndjson out/hs-gri.ndjson ../../db/seed/data/legal/
# 4. Render markdown (tuỳ chọn — cho NotebookLM). Đọc thẳng từ bản canonical:
python3 render_markdown.py ../../db/seed/data/legal/ --dest <thư-mục-đích>
```

⚠️ `parse_hs_notes.py` yêu cầu tên file dạng `*_<số công báo>.txt` (ví dụ `tt31_523.txt`) —
nó dựng thứ tự văn bản từ số Công báo và **báo lỗi** nếu tên file không mang số đó.

## Cấu trúc `db/seed/data/legal/hs-notes.ndjson`

```json
{"scope":"phan","phan":"XVI","chuong":null,"note_type":"chu_giai",
 "title_vi":"MÁY VÀ CÁC TRANG THIẾT BỊ CƠ KHÍ; …","title_en":"MACHINERY AND MECHANICAL APPLIANCES; …",
 "text_vi":"1. Phần này không bao gồm:\n(a) …","text_en":"1. This Section does not cover:\n(a) …"}
```

`hs-gri.ndjson`: `{"rule":"3(b)","kind":"rule|note","text_vi":…,"text_en":…}` —
`kind=rule` là nội dung quy tắc, `kind=note` là Chú giải chi tiết của quy tắc đó.

## Việc còn lại

Phần trích xuất đã xong và kiểm chứng. **Chưa nạp vào Postgres** vì việc đó cần một thay đổi
schema, và schema nên đi qua đúng luồng `drizzle-kit generate` của dự án.

### Thay đổi schema cần thiết

`provision_type` hiện là `('chuong','muc','dieu','khoan','diem')` — không có chỗ cho Phần và
Chú giải. Cần bổ sung:

```sql
ALTER TYPE provision_type ADD VALUE IF NOT EXISTS 'phan';
ALTER TYPE provision_type ADD VALUE IF NOT EXISTS 'chu_giai';
ALTER TYPE provision_type ADD VALUE IF NOT EXISTS 'quy_tac';
```

⚠️ **Đừng viết tay file vào `db/migrations/`.** `db/migrations/meta/` hiện thiếu snapshot cho
0007–0009, nên `drizzle-kit generate` sẽ tính diff sai nếu chồng thêm migration thủ công lên
chuỗi đó. Vá phần snapshot thiếu trước, rồi sửa `db/schema/index.ts` và để drizzle sinh migration.

### Hình dạng dữ liệu khi nạp

- **`legal_document`**: một dòng cho `31/2022/TT-BTC` — `doc_type='thong_tu'`,
  `effective_from='2022-12-01'`, `gazette_issue='523+524…557+558'`, `verification='verified'`.
- **`legal_provision`**: cây `phan` → `chuong` → `chu_giai`. `citation_label` phải đọc được
  nguyên vẹn khi trích, ví dụ `Chú giải 1(g) Phần XVI Thông tư 31/2022/TT-BTC`.
  GRI vào `ptype='quy_tac'`, `number='3(b)'`.
- **`legal_chunk`**: **cắt theo từng mục đánh số** (`1.`, `2.`, `(a)`…), **không** cắt theo cả
  khối. Khối chú giải trung bình 416 từ, nhưng Chú giải Phần XI (dệt may) dài hơn nhiều lần —
  nhúng nguyên khối sẽ làm loãng vector và trả về cả chú giải khi chỉ cần một mục.
- `sac_prefix` nên nêu rõ đây là chú giải của Phần/Chương nào, vì bản thân câu chú giải
  thường không tự nêu bối cảnh (*"Phần này không bao gồm:"* — phần nào?).

## Liên quan

- [ADR: Nạp Chú giải và GRI vào kho pháp lý](../../.agent/architecture-decisions/2026-09-09-load-hs-notes-and-gri.md)
- [Khái niệm: Phân loại mã HS](../../.agent/concepts/hs-classification.md)
- [TASK-008 — loader NĐ 26/2023](../task-008-congbao-loader/README.md) · [FTA loader](../fta-loader/README.md)
- [Kho pháp luật tự mở rộng](../../.agent/docs/legal-corpus-self-extension.md)
