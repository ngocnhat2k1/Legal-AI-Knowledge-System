# FTA loader — nạp các biểu thuế ưu đãi đặc biệt (ACFTA/AANZFTA/ATIGA/EVFTA)

**Trạng thái: XONG cho 4 FTA công ty dùng (2026-07-18). Đóng 77 dòng FTA của golden set → TASK-012 100%.**

Nạp các biểu thuế nhập khẩu ưu đãi **đặc biệt** (FTA) — thêm schedule bên cạnh MFN, **không truncate**.
Mỗi mức FTA là **có điều kiện** (schedule `requires_co=true`); API trình bày "X% nếu có C/O form Y, ngược
lại MFN", không bao giờ 0% trần.

## Nguồn + cấu trúc (đã xác minh)

| FTA | Nghị định | Phần | Cột thuế | C/O form |
|---|---|---|---|---|
| **ACFTA** (ASEAN–TQ) | 118/2022 | 10 `.doc` Công báo | **1** (2022–2027) | E |
| **AANZFTA** (ASEAN–Úc–NZ) | 121/2022 | 1 `.docx` (datafiles.chinhphu.vn) | **1** (2022–2027) | AANZ |
| **ATIGA** (ASEAN) | 126/2022 | 9 `.doc` Công báo | **6** (2022…2027/năm) | D |
| **EVFTA** (VN–EU) | 116/2022 | 16 `.doc` Công báo | **6** (giảm dần theo năm) | EUR.1/REX |

- **ACFTA/AANZFTA**: một mức cho cả kỳ 2022–2027 → 1 khoảng hiệu lực `[2022-12-30, 2027-12-31]`.
- **ATIGA/EVFTA**: một cột mỗi năm → **6 khoảng một-năm** `[Y-01-01, Y-12-31]`. Tra 2026 → cột 2026.
  EVFTA `8481.80.99` = `[5, 3,3, 1,6, 0, 0, 0]` → 2026 = 0%.
- **AANZFTA** lấy từ `datafiles.chinhphu.vn` (`.docx`, không token) vì trang Công báo định tuyến theo id
  nội bộ khó dò; `parse_fta.py` đọc cả `.doc` lẫn `.docx` qua textutil.
- Mỗi biểu **11.414 mã** (khớp danh mục AHTN 2022). `*` → `excluded` (không phải 0%).

## RCEP — cố ý CHƯA nạp

RCEP (129/2022, **51 phần**) có **cột thuế theo từng nước thành viên** (RCEP_CN/JP/KR/AU/NZ/ASEAN) —
cấu trúc khác hẳn, cần xử lý riêng. **Golden set của công ty KHÔNG dùng RCEP** (chỉ 4 FTA trên), nên
để lại cho sau. Parser bảng đã chứng minh chạy được RCEP ở [TASK-003](../task-003-evfta-parser/README.md).

## Kết quả (đã xác minh live 2026-07-18)

Sau khi nạp 4 FTA, **TASK-012 đạt 100%** (xem [research/task-012-acceptance](../task-012-acceptance/README.md)):
corpus **249/249** dòng tờ khai thật khớp (MFN 192 + ACFTA 25 + AANZFTA 26 + ATIGA 4 + EVFTA 2). Star-case
`8481.80.99` CN: MFN **10%** / ACFTA **0%** (form E) / AANZFTA **0%** (form AANZ) / ATIGA **0%** (form D) /
EVFTA **0%** (form EUR.1/REX) — tất cả có điều kiện C/O.

## Tái hiện

```bash
# raw doc/ gitignored; nếu cần tải lại: fetch_doc.py trên trang Công báo mỗi FTA
# (AANZFTA: datafiles.chinhphu.vn/cpp/files/vbpq/2023/01/121_2022_nd-cp_30122022.docx)
for k in acfta atiga evfta aanzfta; do
  python3 research/fta-loader/parse_fta.py research/fta-loader/$k/doc/ --emit research/fta-loader/$k/rows.ndjson
done
# Nạp production (ND26 + amendments + 4 FTA trong một lệnh):
DATABASE_URL=... corepack yarn db:seed
```

## Liên quan

- [Parser bảng (TASK-003)](../task-003-evfta-parser/README.md) · [Loader MFN (TASK-008)](../task-008-congbao-loader/README.md) · [Nghiệm thu (TASK-012)](../task-012-acceptance/README.md)
