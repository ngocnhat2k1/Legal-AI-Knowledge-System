# TASK-012 — Nghiệm thu Giai đoạn 1: đối chiếu với thực tế

**Trạng thái: MFN XONG (2026-07-18) — 100% khớp tờ khai thật + 20/20 random. FTA chờ nạp biểu FTA.**

Chứng minh Giai đoạn 1 đối chiếu với **thế giới** (tờ khai đã nộp), không phải với chính nó.

## Hai sự thật định hình cách đọc

1. **Mọi case golden set là `confidence=uncertain`** (quyết định chủ dự án): "chạy xanh" = **tái hiện thực
   tiễn quá khứ**, không phải "chứng nhận đúng luật". Đúng/sai xác minh lúc dùng qua vòng Zalo.
2. Tờ khai là **2025–2026**; dữ liệu đã nạp là **ND 26/2023 nền + hồi quy xăng 72/2026**. Mức thay đổi bởi
   144/2024 / 108/2025 / 199/2025 (chưa áp từng dòng) và biểu **FTA** (chưa nạp) **được kỳ vọng khác** —
   phân loại riêng, không tính là trượt.

## Kết quả (đã xác minh live 2026-07-18)

| | Golden set curated (55) | Full corpus (259) |
|---|---|---|
| MFN có rate nạp | 27 | 192 |
| **✓ khớp tờ khai** | **27 (100%)** | **192 (100%)** |
| ✗ khác (sửa đổi chưa nạp / cần điều tra) | **0** | **0** |
| MFN, HS không có rate (structural) | 0 | 0 |
| FTA (schedule chưa nạp — pending) | 20 | 57 |
| skip (thiếu hs/date/rate) | 8 | 10 |

**Mẫu ngẫu nhiên: 20/20 mức nạp khớp CHÍNH XÁC ô nguồn verbatim** (`source_cell_text` từ `.doc` Công báo).
Random — không phải chọn tay — đúng như tiêu chí: mẫu chọn tay xác nhận parser của mình; mẫu ngẫu nhiên
tìm bẫy phụ lục. Không mã nào bị hỏng rate.

**Ý nghĩa:** pipeline base **tái hiện 219 dòng tờ khai thật 100%** + không lỗi random → phần MFN của
Giai đoạn 1 đối chiếu được với thực tế. **0 mismatch MFN** cũng cho biết: goods trong golden set không
bị các sửa đổi 2024–2025 đụng tới (nếu bị, sẽ lộ ra ở cột "khác").

## Còn lại để full green (không phải điểm một phần — là dữ liệu còn thiếu)

- **77 dòng FTA** (ACFTA 34 · AANZFTA 34 · ATIGA 5 · EVFTA 4 across cả hai tập): nạp 4 biểu FTA + RCEP
  từ Công báo (cùng pipeline TASK-008/003; mỗi biểu có cột thuế theo năm). Sau đó `preferential[]` của API
  có dữ liệu → validate được ca "0% nếu có C/O".
- **Mức sửa đổi 144/2024 · 108/2025 · 199/2025** (ngoài xăng dầu): áp từng dòng nếu muốn khớp tuyệt đối
  tờ khai của các goods đã bị sửa (hiện 0 mismatch nên chưa cấp thiết cho tập này).

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
