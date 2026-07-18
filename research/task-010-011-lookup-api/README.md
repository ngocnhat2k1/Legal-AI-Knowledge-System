# TASK-010 + TASK-011 — API tra cứu + phát hiện độ cũ

**Trạng thái: XONG (2026-07-18). Chạy live trên dữ liệu ND 26/2023 đã nạp, mọi case kiểm chứng PASS.**

Xây cùng nhau vì độ-cũ là một thuộc tính của *câu trả lời*, không tách rời được khỏi lookup.

## Hợp đồng

```
GET /tariff?hs=<8 chữ số>&date=<YYYY-MM-DD>[&origin=<mã nước>]
```

Trả về, **xác định (deterministic), không có lời gọi mô hình nào trên đường xử lý**
([ADR no-LLM](../../.agent/architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)):

- `import.mfn` — mức MFN (Mục I), kèm `decree`, `effectiveFrom/To` (as-of), và một **`statement` chữ**
  (không bao giờ chỉ là con số trần).
- `import.preferential[]` — mức FTA (khi đã nạp): **có điều kiện theo cấu trúc** — "*X% nếu có C/O form Y
  hợp lệ, ngược lại MFN*". Không có 0% vô điều kiện.
- `import.chapter98[]` — mức ưu đãi riêng Chương 98, kèm mã tương ứng ở `conditions`.
- `import.outOfQuota` — mức ngoài hạn ngạch (TRQ); mfn cho hàng TRQ có `type='trq'`.
- `export` — mức Phụ lục I nếu có (bẫy hai-phụ-lục).
- `antiDumping[]` — CBPG, **khoản cộng thêm**, phạm vi theo xuất xứ.
- `staleness` — `snapshotDate`, `reliableThrough`, `stale`, `warning`.

Lõi là **một vị từ khoảng** (không `ORDER BY date DESC`):

```sql
WHERE r.hs_code = $hs AND r.superseded_at IS NULL
  AND r.effective_from <= $date AND (r.effective_to IS NULL OR $date <= r.effective_to)
```

## Phát hiện độ cũ (TASK-010)

Một nghị định có thể **có hiệu lực pháp lý nhiều tuần trước khi lên Công báo** (ND 72/2026: 15 ngày;
EVFTA: 48). Nên bất kỳ ngày tra cứu nào **trong vòng một "độ trễ công báo" quanh ngày chốt** — hoặc sau
nó — đều có thể thiếu một nghị định ta chưa thể thấy. Quy tắc:

```
reliableThrough = snapshotDate − GAZETTE_LAG_DAYS   (mặc định 48)
stale = (date > reliableThrough)
```

`snapshotDate` lấy từ `DATA_SNAPSHOT_DATE` (config) hoặc suy ra `max(recorded_at)` — **transaction time**
của dữ liệu. Câu trả lời stale mang `warning`, **không phải một con số tự tin**.

## Kết quả kiểm chứng (đã xác minh 2026-07-18, API chạy thật)

| Case | Kết quả |
|---|---|
| `8481.80.99` CN 2024-06-01 (star-case) | MFN **10%**, ND 26/2023; preferential `[]` + note "FTA chưa nạp" (trung thực) |
| `0301.11.10` 2024-06-01 | import **15%**, export **0%** — bẫy hai-phụ-lục |
| `2710.12.21` 2024-06-01 | **10%**, ND 26/2023 (cross-check xăng) |
| `0407.21.00` (TRQ) | mfn `type=trq` "trong hạn ngạch 40%"; `outOfQuota` **80%** + note |
| `9804.15.00` (Chương 98) | **27%** schedule `NK_uu_dai_98`, `conditions.ma_hang_tuong_ung=0306.15.00`, note có-điều-kiện |
| **TASK-010**: snapshot 2026-03-15, query **2026-03-10** | trả 10% **nhưng `stale=true` + cảnh báo** — không âm thầm coi ND 26/2023 là hiện hành ✓ |
| control: snapshot 2026-03-15, query 2023-08-01 | `stale=false` ✓ |
| `hs=123` | **400** |
| `8702.10.10` (dòng "theo hướng dẫn Chương 98", không rate) | **404** kèm giải thích (không bịa số) |

## Quyết định nhỏ đã áp

- **Tra cứu dùng SQL thô** (`db.execute(sql\`…\`)`), không query-builder có type — giữ vị-từ-khoảng hiện rõ
  và **tránh footgun path-alias** (`@db/schema` chưa resolve được ở runtime build; xem review scaffold).
  Không import schema vào API.

## Còn lại

- Nạp các biểu **FTA** để `preferential[]` có dữ liệu (star-case trả 0% ACFTA).
- **TASK-009**: chuỗi sửa đổi MFN 2026 (cắt khoảng) để tra ngày 2026 trả đúng nghị định điều chỉnh.
- **TASK-012**: đối chiếu golden set + 20 mã ngẫu nhiên (nghiệm thu tự động thay cho curl tay ở đây).

## Liên quan

- [Schema (TASK-007)](../task-007-schema/README.md) · [Loader (TASK-008)](../task-008-congbao-loader/README.md)
- Mã: [apps/api/src/modules/tariff/](../../apps/api/src/modules/tariff/)
