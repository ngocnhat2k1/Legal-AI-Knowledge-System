# TASK-007 — Schema biểu thuế: nhận biết thời gian + phụ lục ngay từ migration đầu

**Trạng thái: XONG (2026-07-18). Chứng minh live 17/17 trên Postgres thật.**

## Câu hỏi

Schema `(hs, xuất xứ) → thuế suất` là một lời nói dối. Research 12 xác minh 5 cách nó vỡ, dòng
thời gian làm vỡ cách thứ 6. Schema phải **biểu diễn được cả 6 mà không cần trường hợp đặc biệt**, và
**cơ sở dữ liệu — không phải quy ước — phải từ chối** các shape âm thầm sinh ra thuế suất sai.

## 6 ca khó + cách schema biểu diễn (không special-case)

| # | Ca | Cách mô hình hóa |
|---|---|---|
| 1 | Cùng HS, thuế khác nhau ở Phụ lục I (XK) vs II (NK) — 1.329/1.520 mã | `annex_id` là **FK NOT NULL**; không chèn được dòng thiếu phụ lục |
| 2 | `*` = **loại trừ**, không phải 0% | `rate_type='excluded'`, không mang số |
| 3 | Thuế tuyệt đối USD (xe cũ, Phụ lục III) | `rate_type='specific'`, `amount`+`amount_currency`+`amount_unit` |
| 4 | Thuế FTA **có điều kiện C/O** | `tariff_schedule.requires_co`; API ghép "0% nếu có C/O, ngược lại MFN" từ 2 dòng, không bao giờ 0% trần |
| 5 | Hàng **TRQ** (04.07, 17.01…) | `rate_type='trq'`, `out_of_quota_annex_id` trỏ phụ lục chứa thuế ngoài hạn ngạch |
| 6 | Nghị định hết hiệu lực rồi **âm thầm hồi quy** (ND 72/2026 hết 30/04/2026 → về ND 26/2023) | Hiệu lực là **khoảng** `[effective_from, effective_to]`; tra tại-một-thời-điểm là **vị từ khoảng**, không `ORDER BY date DESC`. Bộ nạp **cắt** khoảng gốc quanh cửa sổ chèn → các khoảng rời nhau, đúng 1 dòng khớp mỗi ngày |

## Bitemporal — hai trục thời gian

- **Valid time** (`effective_from`/`effective_to`): khi luật có hiệu lực. Từ nghị định.
- **Transaction time** (`recorded_at`/`superseded_at`): khi **ta** ghi nhận. **Append-only** — sửa sai là
  dòng mới; dòng cũ đóng dấu `superseded_at`, **không bao giờ UPDATE/DELETE**. TASK-010 đọc `recorded_at`
  làm ngày snapshot để biết câu trả lời có bị cũ không.

## Toàn vẹn do DB thực thi (không phải quy ước)

Trong migration `0001` (Drizzle sinh — CHECK theo `rate_type`/`duty_kind`, FK, annex NOT NULL) và
`0002` (SQL viết tay — thứ Drizzle không diễn đạt được):

- **`tariff_rate_no_interval_overlap`** — EXCLUDE constraint (btree_gist): **không hai dòng "sống"**
  (`superseded_at IS NULL`) nào cùng `(hs_code, hs_version, annex, schedule)` được có khoảng hiệu lực
  **chồng nhau**. Đây là thứ biến "đúng một thuế suất có hiệu lực vào một ngày" từ hy vọng thành **bảo
  đảm của DB** — và nó thỏa được **chính vì** bộ nạp cắt khoảng (ca 6).
- **Trigger append-only** — `DELETE` bị cấm; `UPDATE` chỉ cho phép đóng dấu `superseded_at` một lần trên
  dòng còn sống (server-clock), sau đó dòng bất biến.

## CBPG (chống bán phá giá) là bảng riêng

Khoản **tách biệt**, chồng lên thuế NK, phạm vi theo **xuất xứ** (đôi khi cả nhà XK), do **quyết định
Bộ Công Thương** ban hành chứ không phải nghị định thuế. Golden set có dòng thật bị áp CBPG ~35% chồng
lên thuế NK. Để trong `tariff_rate` sẽ làm hỏng con số thuế → `anti_dumping_duty` riêng.

## Kết quả nghiệm thu (đã xác minh 2026-07-18)

`prove_schema.ts` chạy trên Postgres thật (pgvector/pgvector:pg17), sau khi áp cả 3 migration:

```
17/17 checks passed
```

Gồm 9 phép **khẳng định biểu diễn được** (6 ca + hồi quy 2 chiều + supersede + CBPG stack) và 8 phép
**khẳng định DB từ chối** shape sai (`*` mang số; ad_valorem mang USD; trq thiếu phụ lục ngoài hạn ngạch;
khoảng chồng nhau; thiếu annex; DELETE; UPDATE đổi thuế; dòng đã supersede bị sửa lại).

Đường **clean-clone** cũng xanh: `docker compose down -v` → `up --build` → migrate áp 0000→0002 →
`/health` = `{"status":"ok","db":"up","pgvector":"0.8.5"}` (schema mới không phá boot).

## Tái hiện

```bash
docker compose up -d --wait db
DATABASE_URL="postgres://app:app@localhost:5433/customs_assistant" corepack yarn db:migrate
DATABASE_URL="postgres://app:app@localhost:5433/customs_assistant" node_modules/.bin/tsx research/task-007-schema/prove_schema.ts
```

## Liên quan

- [db/schema/index.ts](../../db/schema/index.ts) — định nghĩa schema
- [db/migrations/0001_grey_exodus.sql](../../db/migrations/0001_grey_exodus.sql), [0002_tariff_integrity.sql](../../db/migrations/0002_tariff_integrity.sql)
- [ADR Hiệu lực bitemporal](../../.agent/architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)
- [Danh sách công việc — TASK-007/008](../../.agent/planning/01-task-list.md)
