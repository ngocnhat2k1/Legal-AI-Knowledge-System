# TASK-008 — Nạp Nghị định 26/2023 từ Công báo (parser nhận biết phụ lục)

**Trạng thái: XONG (2026-07-18). Nạp live, 13/13 acceptance PASS, khớp số đếm research 12.**

Nạp biểu thuế MFN + xuất khẩu của **Nghị định 26/2023/NĐ-CP** từ 14 phần `.doc` Công báo,
**nhận biết phụ lục là bước hạng nhất** (không phải regex hậu kỳ), mỗi dòng mang xuất xứ (phụ lục)
của nó. Không dòng nào nhận phụ lục mặc định; dòng không phân giải được phụ lục làm hỏng việc nạp.

## Đường ống

```
fetch_doc.py   page.html -> tải 14 phần .doc (link g7.cdnchinhphu.vn có token)
parse_nd26.py  .doc -> textutil -> tách ô \x07 -> gán phụ lục -> rows.ndjson + chapter98.ndjson + annex_iv.json + annex_iii.txt
load.ts        các artifact -> seed decree/annex/schedule -> nạp tariff_rate + verify
```

`doc/` (36MB thô) và `page.html` (có token) **không commit**; **extract trong `out/` được commit** để
loader chạy offline kể cả khi token hết hạn.

## Nhận biết phụ lục (bẫy chịu lực của dự án)

Các phụ lục chạy theo thứ tự **I → II → III → IV**. Parser theo dõi phụ lục hiện hành bằng marker
**tiến-một-chiều** (running-header của phụ lục trước không thể kéo lùi):

| Phụ lục | Marker | Xử lý |
|---|---|---|
| **I** Biểu thuế **xuất khẩu** | `BIỂU THUẾ XUẤT KHẨU` (HOA) | schedule `XK`, ad valorem % |
| **II** Biểu thuế **nhập khẩu** ưu đãi (Mục I) | `BIỂU THUẾ NHẬP KHẨU` (HOA) | schedule `NK_uu_dai`, ad valorem % (MFN) |
| **II** — **Chương 98** (Mục II) | ô `Mã hàng tương ứng…` + mã `98xx` | schedule `NK_uu_dai_98`, mã tương ứng lưu ở `conditions` |
| **III** Xe cũ | ô `Phụ lục III` | **KHÔNG nạp** — theo nhóm 87.02/87.03 + dung tích + công thức USD, không phải HS8. Log verbatim |
| **IV** Ngoài hạn ngạch (TRQ) | ô `Phụ lục IV` | schedule `NK_ngoai_han_ngach`; mã Mục I tương ứng được đánh dấu `rate_type='trq'` |

**Bẫy chữ HOA:** header thật viết HOA (`BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI`), còn tiêu đề nghị định và văn xuôi
xe-cũ nhắc "Biểu thuế nhập khẩu" chữ thường. Upper-case cả ô rồi so sẽ khiến văn xuôi lật phụ lục sang II
**trước cả bảng xuất khẩu** — bug đã nuốt trọn Annex I ở lần chạy đầu. Sửa: so khớp **case gốc**.

## Ba cạm bẫy dữ liệu đã lộ ra khi kiểm chứng (không nuốt im)

1. **Mô tả tách nhiều ô.** `2903.91.00 | "...Chlorobenzene, và" | "p-dichlorobenzene" | 0` — mô tả bị soft-break
   thành 2 ô, làm parser một-ô-nhìn-trước bỏ sót rate `0`. Sửa: quét tới RATE đầu tiên, bỏ qua ô mô tả nối,
   dừng ở HS8 kế. Kéo "Mục I có thuế" từ 11.154 → khớp research 12.
2. **Chương 98 (Mục II) 4 cột.** `9804.15.00 | mô tả | 0306.15.00 (mã tương ứng) | 27`. Cột "mã tương ứng" bị
   đọc thành **551 dòng HS8 giả** mang rate Chương 98 (vd `0306.15.00 = 27`, chồng lên MFN thật `= 10`). Sửa:
   nhận diện mã `98xx`, **tiêu thụ** mã tương ứng làm cross-ref (lưu `conditions`), không sinh dòng giả.
3. **Dòng không-số thật.** `8702.10.10 → "Theo hướng dẫn tại khoản 1.1 Chương 98"` — 264 mã Mục I không có
   số thật (không phải bug); bỏ qua có log, **không gán mặc định**.

## Kết quả nghiệm thu (đã xác minh 2026-07-18, Postgres thật)

```
13/13 checks passed
```

| Kiểm tra | Kết quả |
|---|---|
| Tổng dòng nạp | **13.161** |
| Mục I MFN unique có thuế | **11.150** (research 12: ~11.160; chênh ~10 là mã cross-ref Ch.98 mà parse ngây thơ đếm nhầm) |
| Nomenclature Annex II unique (gồm Ch.98) | **11.874** (khớp research 12 chính xác) |
| **`0301.11.10`** | **15** (Annex II NK) & **0** (Annex I XK) — hai dòng riêng ✓ **bẫy phụ lục** |
| **`0306.15.00`** | MFN **10** (KHÔNG phải dòng giả `27` của Ch.98) ✓ |
| `9804.15.00` (Chương 98) | **27** (schedule riêng, `ma_hang_tuong_ung=0306.15.00`) ✓ |
| `2710.12.21/.22/.24/.25` | **10** ✓ (cross-check báo chí ND 72/2026 "10%→0%") |
| `0407.21.00` ngoài hạn ngạch (Annex IV) | **80**; dòng Mục I tương ứng đánh dấu `trq` ✓ |
| Dòng thiếu phụ lục | **0** (schema NOT NULL + parser không mặc định) |

## Ranh giới v1 (ghi rõ, không nuốt im)

- **Phụ lục III (xe cũ)**: không nạp tariff_rate (theo nhóm + công thức USD `X = giá × thuế xe mới`).
  Giữ verbatim `out/annex_iii.txt`. Cần mô hình riêng nếu sau này công ty nhập xe cũ.
- **Chương 98**: nạp vào schedule `NK_uu_dai_98`; đây là chương trình ưu đãi riêng, áp dụng có điều kiện —
  API phải trình bày như một lựa chọn có điều kiện, không trộn vào MFN Mục I.
- Chỉ ND 26/2023. Các biểu **FTA** (ACFTA/AANZFTA/ATIGA/EVFTA/RCEP) là nghị định khác — nạp ở bước kế
  (cùng parser task-003/008).

## Tái hiện

```bash
# (1) tải .doc (token hết hạn thì mở lại trang lấy page.html mới)
curl -sS --compressed -A "Mozilla/5.0" "https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm" -o page.html
python3 fetch_doc.py page.html doc/
# (2) parse
python3 parse_nd26.py doc/            # diagnostics
python3 parse_nd26.py doc/ --emit out/
# (3) load (hoặc bỏ qua (1)(2), dùng out/ đã commit)
docker compose up -d --wait db
DATABASE_URL="postgres://app:app@localhost:5433/customs_assistant" corepack yarn db:migrate
DATABASE_URL="postgres://app:app@localhost:5433/customs_assistant" node_modules/.bin/tsx research/task-008-congbao-loader/load.ts
```

## Liên quan

- [Parser bảng .doc (TASK-003)](../task-003-evfta-parser/README.md) — textutil + dấu ô `\x07`
- [Schema (TASK-007)](../task-007-schema/README.md) — annex-in-PK, EXCLUDE khoảng, append-only
- [Danh sách công việc — TASK-008/009](../../.agent/planning/01-task-list.md)
