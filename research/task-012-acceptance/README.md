# TASK-012 — Nghiệm thu Giai đoạn 1: đối chiếu với thực tế

**Trạng thái: XONG (2026-07-18) — 249/249 dòng tờ khai thật khớp 100% (MFN + 4 FTA) + 20/20 random.**

Chứng minh Giai đoạn 1 đối chiếu với **thế giới** (tờ khai đã nộp), không phải với chính nó.

## Hai sự thật định hình cách đọc

1. **Mọi case golden set là `confidence=uncertain`** (quyết định chủ dự án): "chạy xanh" = **tái hiện thực
   tiễn quá khứ**, không phải "chứng nhận đúng luật". Đúng/sai xác minh lúc dùng qua vòng Zalo.
2. Tờ khai là **2025–2026**; dữ liệu đã nạp là **ND 26/2023 nền + hồi quy xăng 72/2026**. Mức thay đổi bởi
   144/2024 / 108/2025 / 199/2025 (chưa áp từng dòng) và biểu **FTA** (chưa nạp) **được kỳ vọng khác** —
   phân loại riêng, không tính là trượt.

## Kết quả (đã xác minh live 2026-07-18, sau khi nạp 4 biểu FTA)

| Schedule | Golden set curated (55) | Full corpus (259) |
|---|---|---|
| MFN | 27/27 (100%) | 192/192 (100%) |
| ACFTA | 9/9 | 25/25 |
| AANZFTA | 8/8 | 26/26 |
| ATIGA | 1/1 | 4/4 |
| EVFTA | 2/2 | 2/2 |
| **TỔNG so sánh được** | **47/47 (100%)** | **249/249 (100%)** |
| FTA pending / skip | 0 / 8 | 0 / 10 |

**249/249 — đúng con số cross-check khi dựng golden set.** Pipeline tái hiện **toàn bộ 249 dòng tờ khai
thật** (MFN + cả 4 FTA công ty dùng) ở 100%. `skip` là các dòng thiếu hs/date/rate hoặc `applied_rate`
phi số (vd ghi chú), không phải trượt.

**Mẫu ngẫu nhiên: 20/20 mức nạp khớp CHÍNH XÁC ô nguồn verbatim** (`source_cell_text` từ `.doc` Công báo).
Random — không phải chọn tay — đúng tiêu chí: mẫu chọn tay xác nhận parser của mình; mẫu ngẫu nhiên tìm
bẫy phụ lục. Không mã nào bị hỏng rate.

**Star-case** `8481.80.99` CN: MFN **10%** / ACFTA **0%** (C/O form E) / AANZFTA **0%** (AANZ) / ATIGA
**0%** (D) / EVFTA **0%** (EUR.1/REX) — mọi mức FTA đều có điều kiện C/O.

## Ghi chú phạm vi (không chặn nghiệm thu)

- **RCEP** cố ý chưa nạp — golden set công ty không dùng; cấu trúc cột-theo-nước cần xử lý riêng
  (xem [fta-loader](../fta-loader/README.md)).
- **0 mismatch MFN** cũng cho biết goods trong golden set không bị các sửa đổi 2024–2025 (144/108/199)
  đụng tới; nếu bị sẽ lộ ở đây. Áp đầy đủ mức sửa đổi từng dòng là việc mở rộng khi cần.

## Tái hiện

```bash
docker compose up -d --wait db
DATABASE_URL="postgres://app:app@localhost:5433/customs_assistant" corepack yarn db:migrate
DATABASE_URL="postgres://app:app@localhost:5433/customs_assistant" node_modules/.bin/tsx research/task-008-congbao-loader/load.ts
DATABASE_URL="postgres://app:app@localhost:5433/customs_assistant" node_modules/.bin/tsx research/task-009-amendment-chain/apply_amendments.ts
DATABASE_URL="postgres://app:app@localhost:5433/customs_assistant" node_modules/.bin/tsx research/task-012-acceptance/validate.ts
```

## Liên quan

- [Golden set (TASK-001)](../../fixtures/golden-set/README.md) · [Loader (TASK-008)](../task-008-congbao-loader/README.md) · [API (TASK-011)](../task-010-011-lookup-api/README.md)
