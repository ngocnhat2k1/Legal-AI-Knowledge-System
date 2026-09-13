# FTA loader — nạp các biểu thuế ưu đãi đặc biệt (ACFTA/AANZFTA/ATIGA/EVFTA)

**Trạng thái: XONG cho 4 FTA công ty dùng (2026-07-18). Đóng 77 dòng FTA của golden set → TASK-012 100%.**
Cập nhật 2026-09-13: dòng 10 số quốc gia + EVFTA chỉ nạp Phụ lục II — xem bên dưới và
[ADR](../../.agent/architecture-decisions/2026-09-13-fta-national-sublines.md).

Nạp các biểu thuế nhập khẩu ưu đãi **đặc biệt** (FTA) — thêm schedule bên cạnh MFN, **không truncate**.
Mỗi mức FTA là **có điều kiện** (schedule `requires_co=true`); API trình bày "X% nếu có C/O form Y, ngược
lại MFN", không bao giờ 0% trần.

## Nguồn + cấu trúc (đã xác minh)

| FTA | Nghị định | Phần | Cột thuế (`--cols`) | Dòng 10 số | C/O form |
|---|---|---|---|---|---|
| **ACFTA** (ASEAN–TQ) | 118/2022 | 10 `.doc` Công báo 529+530 → 547+548 | **1** (2022–2027) | 74 / 34 mã cha | E |
| **AANZFTA** (ASEAN–Úc–NZ) | 121/2022 | 1 `.docx` (datafiles.chinhphu.vn) | **1** (2022–2027) | 16 / 8 | AANZ |
| **ATIGA** (ASEAN) | 126/2022 | 9 `.doc` Công báo 461+462 → 477+478 | **6** (2022…2027/năm) | 0 | D |
| **EVFTA** (VN–EU) | 116/2022 | 16 `.doc` Công báo 391+392 → 421+422 | **6** (giảm dần theo năm) | 122 / 58 (Phụ lục II) | EUR.1/REX |

- **ACFTA/AANZFTA**: một mức cho cả kỳ 2022–2027 → 1 khoảng hiệu lực `[2022-12-30, 2027-12-31]`.
- **ATIGA/EVFTA**: một cột mỗi năm → **6 khoảng một-năm** `[Y-01-01, Y-12-31]`. Tra 2026 → cột 2026.
  EVFTA `8481.80.99` = `[5, 3,3, 1,6, 0, 0, 0]` → 2026 = 0%.
- Số cột là tham số bắt buộc `--cols`: hàng hoặc dòng 10 số có số ô thuế khác → parser dừng có lỗi.
- **AANZFTA** lấy từ `datafiles.chinhphu.vn` (`.docx`, không token) vì trang Công báo định tuyến theo id
  nội bộ khó dò; `parse_fta.py` đọc cả `.doc` lẫn `.docx` qua textutil.
- Mỗi biểu **11.414 mã**, mỗi mã đúng **một hàng** (khớp danh mục AHTN 2022). `*` → `rate_type = excluded`
  (không phải 0%). Cột loại trừ theo nước chỉ có ở ACFTA — xem bên dưới.
- Nguồn `.doc`/`.docx` nằm ở `research/fta-loader/<fta>/doc/` và **không commit** (`.gitignore`).

## Dòng 10 số quốc gia (2026-09-13)

Nghị định cho phép chi tiết mã tới cấp 10 số (ACFTA Điều 3 khoản 2, EVFTA Điều 3 khoản 3: “chi tiết theo cấp mã 8
số hoặc 10 số”; ATIGA chỉ “8 số”). Mã 8 số cha có mô tả và **ô thuế trống**; mỗi dòng 10 số là một hàng riêng có
thuế suất. Trước 2026-09-13 parser lấy ô thuế đầu tiên sau mã cha, tức là của dòng 10 số đầu tiên (vd ACFTA
`1601.00.10` nạp 0 dù `.90` = 5; AANZFTA `8703.31.41` nạp 17 dù `.90` = 50).

`parse_cells(cells, ncols)` (hàm thuần) nay ghi mã cha với `rates: []` và `sublines` theo thứ tự nghị định:

```json
{"hs":"16010010","hs_dotted":"1601.00.10","desc":"- Đóng bao bì kín khí để bán lẻ:","rates":[],
 "sublines":[{"hs10":"1601001010","hs_dotted":"1601.00.10.10","desc":"- - Từ côn trùng","rates":["0"],"excluded":["KH"]},
             {"hs10":"1601001090","hs_dotted":"1601.00.10.90","desc":"- - Loại khác","rates":["5"],"excluded":[]}]}
```

- Tiêu đề không mã giữa các dòng 10 số (chỉ EVFTA `4011.70.00`) được ghép trước mô tả các dòng sâu hơn nó.
- Seed ghi mỗi khoảng hiệu lực: các dòng 10 số **cùng mức** → mã cha mang mức chung; **khác mức** → `rate_type =
  'by_subline'`, không có con số; `conditions.sublines` luôn có mức của từng dòng cho khoảng đó.
- Đếm theo khoảng: ACFTA 24 mã cha cùng mức + 10 `by_subline`; AANZFTA 8 `by_subline`; EVFTA 22 `by_subline` cả sáu
  năm + 36 `by_subline` một số năm.

## ACFTA — cột “Nước không được hưởng ưu đãi” (2026-09-13)

Biểu NĐ 118/2022 có cột loại trừ xuất xứ theo dòng (Điều 3 khoản 5), ô ngay sau thuế suất, dạng
`MM, TH, CN` (ký hiệu theo Điều 4 khoản 2). Trước 2026-09-13 parser bỏ cột này → hàng CN ở dòng bị loại
trừ vẫn nhận 0% ACFTA. Nay ghi **chỉ khi có** (dòng không có loại trừ giữ nguyên từng byte):

- `excluded` của mã 8 số: `["CN","MM","TH"]` — ký hiệu đã sắp xếp, không trùng.
- `excluded` của từng dòng 10 số trong `sublines` (thay trường cũ `excluded_sublines`). Loại trừ của dòng 10 số
  **không** được chép thành `excluded` của mã cha — trừ khi **mọi** dòng 10 số của mã cha cùng loại trừ một nước
  (hiện chỉ ID ở `4011.80.31/39/40`).

Kết quả: 3.154 dòng 8 số có `excluded` (3.151 ghi trực tiếp + 3 mã gộp từ dòng 10 số), 34 dòng 10 số có loại trừ.

## EVFTA — chỉ nạp Phụ lục II (2026-09-13)

NĐ 116/2022 có **hai biểu**: Phụ lục I “BIỂU THUẾ XUẤT KHẨU ƯU ĐÃI” (553 mã) rồi Phụ lục II “BIỂU THUẾ NHẬP KHẨU
ƯU ĐÃI ĐẶC BIỆT” (11.414 mã). Extract cũ chứa cả hai (11.967 hàng) và seed giữ hàng đầu tiên → 553 mã được phục vụ
thuế **xuất khẩu** như ưu đãi nhập khẩu (464 vector sai, 422 sai ở 2026). Parser nay chỉ đọc dưới tiêu đề
`BIỂU THUẾ NHẬP KHẨU`; `Phụ lục III` kết thúc bảng (8 ô `*` rác sau `9706.90.00` không còn bị đọc thành thuế suất).
Thuế XK ưu đãi EVFTA **không** được nạp. (Con số “139/155 mã cha” ghi trước đây là của Phụ lục I.)

## Cổng kiểm

```bash
for k in acfta:1 aanzfta:1 atiga:6 evfta:6; do
  python3 research/fta-loader/parse_fta.py research/fta-loader/${k%%:*}/doc/ --cols ${k##*:} --emit db/seed/data/fta-${k%%:*}.ndjson
done
corepack yarn test:parser                        # cell walk: loại trừ, dòng 10 số, bảng XK, cuối bảng, số cột
node_modules/.bin/jest db/seed/fta-extracts.spec.ts  # 4 file: 1 hàng/mã, 0 thuế suất lệch so với 19b6222 ngoài các ngoại lệ đã biết
```

## RCEP — cố ý CHƯA nạp

RCEP (129/2022, **51 phần**) có **cột thuế theo từng nước thành viên** (RCEP_CN/JP/KR/AU/NZ/ASEAN) —
cấu trúc khác hẳn, cần xử lý riêng. **Golden set của công ty KHÔNG dùng RCEP** (chỉ 4 FTA trên), nên
để lại cho sau. Parser bảng đã chứng minh chạy được RCEP ở [TASK-003](../task-003-evfta-parser/README.md).

## Kết quả (đã xác minh live 2026-07-18)

Sau khi nạp 4 FTA, **TASK-012 đạt 100%** (xem [research/task-012-acceptance](../task-012-acceptance/README.md)):
corpus **249/249** dòng tờ khai thật khớp (MFN 192 + ACFTA 25 + AANZFTA 26 + ATIGA 4 + EVFTA 2). Star-case
`8481.80.99` CN: MFN **10%** / ACFTA **0%** (form E) / AANZFTA **0%** (form AANZ) / ATIGA **0%** (form D) /
EVFTA **0%** (form EUR.1/REX) — tất cả có điều kiện C/O. Không ca golden nào rơi vào mã cha có dòng 10 số hay
553 mã EVFTA đổi (kiểm 2026-09-13).

## Tái hiện

```bash
# raw doc/ gitignored; nếu cần tải lại: fetch_doc.py trên trang Công báo mỗi FTA
# (AANZFTA: datafiles.chinhphu.vn/cpp/files/vbpq/2023/01/121_2022_nd-cp_30122022.docx)
# Sinh extract: xem "Cổng kiểm". Nạp production (ND26 + amendments + 4 FTA trong một lệnh), sau db:migrate:
DATABASE_URL=... corepack yarn db:seed
```

## Liên quan

- [Parser bảng (TASK-003)](../task-003-evfta-parser/README.md) · [Loader MFN (TASK-008)](../task-008-congbao-loader/README.md) · [Nghiệm thu (TASK-012)](../task-012-acceptance/README.md)
- [tariff-system](../../.agent/concepts/tariff-system.md) · [ADR dòng 10 số](../../.agent/architecture-decisions/2026-09-13-fta-national-sublines.md)
