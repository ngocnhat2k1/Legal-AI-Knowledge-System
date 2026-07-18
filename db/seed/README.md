# db/seed — nạp dữ liệu biểu thuế Giai đoạn 1

Một lệnh, một loader review được, thay cho các script `research/` rời rạc.

```bash
DATABASE_URL=... yarn db:seed
```

`index.ts` nạp toàn bộ dataset Giai đoạn 1 từ các **extract đã commit** trong `data/` vào một DB đã
migrate:

- **Reference:** phiên bản HS (AHTN-2022), các nghị định (26/2023 + chuỗi sửa đổi 144/108/199/72/201 +
  4 nghị định FTA), phụ lục, schedule.
- **ND 26/2023:** Phụ lục I xuất khẩu → `XK`; Phụ lục II NK ưu đãi → `NK_uu_dai` (mã TRQ đánh dấu `trq`);
  Chương 98 → `NK_uu_dai_98`; Phụ lục IV ngoài hạn ngạch → `NK_ngoai_han_ngach`.
- **ND 72/2026:** hồi quy xăng dầu bằng **cắt khoảng append-only** (supersede + 3 khoảng rời).
- **4 FTA:** ACFTA/AANZFTA (một mức 2022–2027) + ATIGA/EVFTA (một khoảng mỗi năm 2022–2027).

**Idempotent:** `TRUNCATE` các bảng biểu thuế trước (TRUNCATE không kích trigger append-only cấp-dòng),
rồi nạp lại một snapshot sạch. Chạy lại cho cùng kết quả (~172.962 dòng sống).

**Portable:** chỉ chèn từ JSON — **không phụ thuộc `textutil` của macOS** — nên chạy được trong container.

## `data/` — extract canonical

| File | Nguồn | Nội dung |
|---|---|---|
| `nd26-muc1.ndjson` | ND 26/2023 Phụ lục I + II Mục I | `{annex, chapter98, hs, hs_dotted, desc, rate}` |
| `nd26-chapter98.ndjson` | ND 26/2023 Phụ lục II Chương 98 | thêm `corresponding` (mã Mục I tương ứng) |
| `nd26-annex-iv.json` | ND 26/2023 Phụ lục IV | `[{hs, rate}]` ngoài hạn ngạch |
| `fta-{acfta,aanzfta,atiga,evfta}.ndjson` | ND 118/121/126/116 /2022 | `{hs, hs_dotted, desc, rates[]}` |

## Làm mới dữ liệu từ Công báo (bước vận hành, chạy trên host macOS)

Extract được sinh bởi pipeline phân tích `.doc`/`.docx` (dùng `textutil`) — xem
[research/task-008-congbao-loader](../../research/task-008-congbao-loader/README.md) và
[research/fta-loader](../../research/fta-loader/README.md) để biết cách tải + parse + kiểm chứng. Khi
Công báo cập nhật, chạy lại parser với `--emit db/seed/data/<file>` rồi `yarn db:seed`.

## Kiểm chứng

Golden set 249/249 chạy trên DB đã seed — xem [db/seed/golden.spec.ts](golden.spec.ts) (test CI) và
[research/task-012-acceptance](../../research/task-012-acceptance/README.md).
