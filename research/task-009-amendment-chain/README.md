# TASK-009 — Chuỗi sửa đổi MFN 2026 + hồi quy ND 72/2026

**Trạng thái: XONG (2026-07-18). Chuỗi xác lập từ nguồn chính thức; hồi quy biểu diễn live 6/6.**

## Chuỗi thực (đối chiếu nguồn chính thức, không gộp mù)

Research 10 và 12 mỗi bên đưa một danh sách **khác nhau và không đầy đủ**. TASK-009 xác minh từng nghị
định — **cả hai đều thiếu, nhưng bù nhau**:

| Nghị định | Hiệu lực | Vai trò | Ai thấy |
|---|---|---|---|
| 26/2023 | 15/07/2023 | Nền (không bị thay thế) | cả hai |
| **144/2024** | 16/12/2024 | Sửa Biểu NK | chỉ R12 |
| **108/2025** | 19/05/2025 | Sửa đổi, bổ sung 26/2023 | chỉ R10 — **xác nhận THẬT** |
| **199/2025** | 08/07/2025 | Sửa Biểu XK + NK MFN | cả hai |
| **72/2026** | 09/03→30/04/2026 | Xăng 10%→0%, hồi quy | cả hai |
| **201/2026** | 08/06/2026 | Sửa Biểu **XUẤT KHẨU** (không phải NK) | chỉ R10 |

**Phát hiện mới:** ND 72/2026 được **gia hạn tới 30/06/2026 bằng Nghị quyết 25/2026/NQ-CP** (bản thân
nghị định ghi 30/04). Một văn bản riêng kéo dài hiệu lực — hệ thống đầy đủ phải nạp nghị quyết đó riêng.
Ghi rõ, chưa nạp.

## Hồi quy ND 72/2026 — cắt khoảng append-only

Ca phá vỡ mô hình "giá trị mới nhất". `apply_amendments.ts` nạp bằng cách:
1. **Supersede** dòng mở `[2023-07-15, ∞) @ 10%` (đóng dấu `superseded_at` — trigger cho phép đúng thao tác này).
2. Chèn **3 khoảng rời**: `[.., 2026-03-08] @ 10%` (26/2023) · `[2026-03-09, 2026-04-30] @ 0%` (72/2026) · `[2026-05-01, ∞) @ 10%` (26/2023, hồi quy).

Ràng buộc **EXCLUDE** chấp nhận vì các khoảng rời nhau; vị-từ-khoảng trả đúng 1 dòng/ngày — **không
`ORDER BY date DESC`**.

## Kết quả (đã xác minh live 2026-07-18)

```
6/6 checks passed
```

| Ngày tra | Kết quả | Nghị định |
|---|---|---|
| 2024-06-01 | 10% | 26/2023 |
| 2026-03-15 | **0%** | **72/2026** |
| 2026-04-30 | **0%** | **72/2026** |
| 2026-05-15 | **10%** (hồi quy) | 26/2023 |
| 2026-07-15 | **10%** (hồi quy) | 26/2023 |
| số dòng khớp 2026-04-30 | **1** (không chồng) | — |

Query kiểm chứng **giống hệt** vị-từ-khoảng mà API `/tariff` dùng (TASK-011) → xác nhận full-stack bắc cầu.

## Còn lại (không chặn v1)

Thay đổi mức thuế của 144/2024 / 108/2025 / 199/2025 (ngoài xăng dầu) mới đăng ký thực thể nghị định +
demo cơ chế trên ca xăng dầu; áp đầy đủ từng dòng cần tải + parse `.doc` mỗi nghị định (cùng pipeline
TASK-008). Nghị quyết gia hạn NQ 25/2026 chưa nạp.

## Liên quan

- [tariff-system.md — Chuỗi đã xác lập](../../.agent/concepts/tariff-system.md)
- [Schema (TASK-007)](../task-007-schema/README.md) — EXCLUDE khoảng, append-only · [Loader (TASK-008)](../task-008-congbao-loader/README.md)
