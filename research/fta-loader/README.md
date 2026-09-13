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
- Mỗi biểu **11.414 mã** (khớp danh mục AHTN 2022). `*` → `rate_type = excluded` (không phải 0%). Cột loại trừ theo nước chỉ có ở ACFTA — xem bên dưới.

## ACFTA — cột “Nước không được hưởng ưu đãi” (2026-09-13)

Biểu NĐ 118/2022 có cột loại trừ xuất xứ theo dòng (Điều 3 khoản 5), ô ngay sau thuế suất, dạng
`MM, TH, CN` (ký hiệu theo Điều 4 khoản 2). Trước 2026-09-13 parser bỏ cột này → hàng CN ở dòng bị loại
trừ vẫn nhận 0% ACFTA. Nay `parse_cells` (hàm thuần, test không cần `.doc`) ghi thêm hai trường, **chỉ khi
có** (dòng không có loại trừ giữ nguyên từng byte):

- `excluded`: `["CN","MM","TH"]` — ký hiệu đã sắp xếp, không trùng.
- `excluded_sublines`: dòng 10 số có loại trừ riêng, gắn vào mã 8 số cha —
  `[{"hs10":"1211600010","hs_dotted":"1211.60.00.10","desc":"…","rates":["0"],"excluded":["MM","TH"]}]`.
  Loại trừ của dòng 10 số **không** được chép thành `excluded` của mã cha — trừ khi **mọi** dòng 10 số của
  mã cha cùng loại trừ một nước (hiện chỉ ID ở `4011.80.31/39/40`).

Kết quả tái trích (2026-09-13): 3.154 dòng 8 số có `excluded` (3.151 ghi trực tiếp + 3 mã gộp từ dòng 10 số),
34 dòng 10 số trên 28 mã cha; **0 khác biệt** mã/mô tả/thuế suất so với extract trước (9e3431d).
AANZFTA/ATIGA/EVFTA: đầu ra parser giống hệt từng byte trên nguồn có tại máy — AANZFTA đầy đủ, ATIGA chỉ phần
461–462, EVFTA chỉ phần 391–392 + 421–422.
Nguồn `.doc` là 10 phần Công báo 529+530 → 547+548 (không commit, xem `.gitignore`).

```bash
python3 research/fta-loader/parse_fta.py research/fta-loader/acfta/doc/ --emit db/seed/data/fta-acfta.ndjson
corepack yarn test:parser                                             # gồm cell walk research/fta-loader
node_modules/.bin/jest db/seed/fta-acfta.spec.ts                      # 0 thuế suất lệch so với 9e3431d
```

Còn mở: 34 mã cha có dòng 10 số lấy thuế suất từ dòng 10 số đầu tiên; 10 mã trong đó có dòng 10 số với
thuế suất khác nhau (vd `1601.00.10`). Cùng lỗi có ở AANZFTA (8/8 mã cha) và EVFTA (139/155 trong 2/16 phần).
Xem [tariff-system](../../.agent/concepts/tariff-system.md).

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
