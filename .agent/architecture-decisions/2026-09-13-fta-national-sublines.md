---
type: adr
status: accepted
updated: 2026-09-13
related:
  - ../concepts/tariff-system.md
  - ../business-rules.md
  - ../../research/fta-loader/README.md
  - 2026-07-17-no-llm-on-tariff-numbers.md
---

# Quyết định Kiến trúc: Dòng 10 số quốc gia của biểu FTA đi kèm mã 8 số; EVFTA chỉ nạp Phụ lục II

Ngày: 2026-09-13

Trạng thái: Accepted — chủ dự án chốt 2026-09-13 “Nạp đủ dòng 10 số, sửa trước”; phán quyết của controller
sau báo cáo nguồn (R-A…R-F) thay giả định về EVFTA trong thiết kế ban đầu.

## Bối cảnh

**Dòng 10 số là một phần của biểu.** Nghị định biểu thuế FTA cho phép chi tiết mã hàng tới cấp 10 số.
Nguyên văn:

- NĐ 118/2022/NĐ-CP (ACFTA) Điều 3 khoản 2: *“Cột “Mã hàng” và cột “Mô tả hàng hóa” tại Biểu thuế nhập khẩu
  ưu đãi đặc biệt ban hành kèm theo Nghị định này được xây dựng trên cơ sở Danh mục hàng hóa xuất khẩu, nhập
  khẩu Việt Nam và chi tiết theo cấp mã 8 số hoặc 10 số.”*
- NĐ 116/2022/NĐ-CP (EVFTA) Điều 3 khoản 3: *“Cột “Mã hàng” và cột “Mô tả hàng hóa” tại các Phụ lục ban hành
  kèm theo Nghị định này được xây dựng trên cơ sở Danh mục hàng hóa xuất khẩu, nhập khẩu Việt Nam và chi tiết
  theo cấp mã 8 số hoặc 10 số.”*
- NĐ 126/2022/NĐ-CP (ATIGA) Điều 3 khoản 2: *“… và chi tiết theo cấp mã 8 số.”* — ATIGA không có dòng 10 số.
- NĐ 121/2022/NĐ-CP (AANZFTA): file `.docx` chỉ có biểu, không có phần điều khoản; biểu có dòng 10 số cùng dạng.

Dạng ô trong nghị định (textutil, mỗi ô một chuỗi): mã 8 số cha có mô tả và **ô thuế trống**; mỗi dòng 10
số là một hàng riêng có mã, mô tả, thuế suất (và ô loại trừ ở ACFTA):

- ACFTA: `"1601.00.10", "- Đóng bao bì kín khí để bán lẻ:", "", "", "1601.00.10.10", "- - Từ côn trùng", "0", "KH", "1601.00.10.90", "- - Loại khác", "5", ""`
- AANZFTA: `"0307.22.00", "- - Đông lạnh:", "", "0307.22.00.10", "- - - Điệp, …", "0", "0307.22.00.90", "- - - Loại khác", "5"`
- EVFTA Phụ lục II (sáu cột năm): `"1508.90.00", "- Loại khác:", "", …, "1508.90.00.10", "- - Các phần phân đoạn của dầu lạc chưa tinh chế", "3,6", "3,1", "2,7", "2,2", "1,8", "1,3", "", "1508.90.00.90", "- - Loại khác", "18,1", "15,9", "13,6", "11,3", "9", "6,8"`
- EVFTA `4011.70.00` có thêm hai tiêu đề **không mã** giữa các dòng 10 số (`"- - Loại có hoa lốp hình chữ chi hoặc
  tương tự:"` trước `.11`/`.19`, `"- - Loại khác:"` trước `.91`/`.99`).

**Lỗi 1 — mã cha lấy thuế suất của dòng 10 số đầu tiên.** Parser coi ô mã 10 số là mô tả và lấy ô thuế đầu
tiên gặp được. Đo trên nguồn đầy đủ: ACFTA 74 dòng 10 số / 34 mã cha (10 mã có thuế suất khác nhau, vd
`1601.00.10` nạp 0 trong khi `.90` = 5), AANZFTA 16 / 8 (cả 8 khác nhau, vd `8703.31.41` nạp 17 trong khi
`.90` = 50), EVFTA Phụ lục II 122 / 58 (cả 58 khác nhau ở ít nhất một năm), ATIGA 0. Đúng kiểu [R3](../business-rules.md):
một con số trông hợp lệ nhưng sai với phần hàng còn lại.

**Lỗi 2 — EVFTA nạp nhầm thuế xuất khẩu.** Thiết kế ban đầu tưởng 553 mã lặp trong `fta-evfta.ndjson` là dòng
con. Đọc toàn văn thì không phải: NĐ 116/2022 có hai biểu. Điều 3 khoản 1: *“Biểu thuế xuất khẩu ưu đãi của
Việt Nam để thực hiện Hiệp định EVFTA giai đoạn 2022 - 2027 tại Phụ lục I Nghị định này …”*; khoản 2: *“Biểu
thuế nhập khẩu ưu đãi đặc biệt của Việt Nam để thực hiện Hiệp định EVFTA giai đoạn 2022 - 2027 tại Phụ lục II
Nghị định này …”*. Tiêu đề bảng: `"Phụ lục I", "BIỂU THUẾ XUẤT KHẨU ƯU ĐÃI CỦA VIỆT NAM"` (553 mã) rồi
`"Phụ lục II", "BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI ĐẶC BIỆT CỦA VIỆT NAM"` (11.414 mã). Mỗi mã lặp là một hàng Phụ lục I
+ một hàng Phụ lục II; seed giữ hàng đầu tiên nên 553 mã được phục vụ **thuế xuất khẩu** như ưu đãi nhập khẩu
EVFTA: 464 vector sáu năm sai, 422 sai ở năm 2026, trong đó 408 mã mức đã nạp **cao hơn** mức nhập khẩu thật
(vd `1211.20.90`: Phụ lục I `0/0/0/0/0/0`, Phụ lục II `25/20/15/10/5/0`).

**Lỗi 3 — ô rác cuối bảng.** Sau hàng cuối Phụ lục II (`9706.90.00`, `0` × 6) có 8 ô `"*"` trước `"Phụ lục III"`;
parser đọc thành 14 thuế suất, seed ghi một khoảng 2022–2027 thay vì sáu khoảng một năm (giá trị đúng, hình sai).

## Quyết định

1. **Đơn vị tra cứu vẫn là mã 8 số** — tờ khai và danh mục AHTN là 8 số (`tariff_rate.hs_code` CHECK
   `^[0-9]{8}$`). Dòng 10 số đi kèm dòng `tariff_rate` của mã cha, trong `conditions.sublines`, mỗi dòng một phần tử
   theo thứ tự nghị định, mang thuế suất **của khoảng hiệu lực của dòng đó** (ATIGA/EVFTA: sáu khoảng một năm):
   `{"code":"1601001010","code_dotted":"1601.00.10.10","desc":"- - Từ côn trùng","rate_type":"ad_valorem"|"excluded","rate_percent":"0"|null,"excluded_origins":["KH"]}`.
   Trường cũ `excluded_sublines` (ACFTA) được gộp vào đây: `excluded_origins` của từng dòng 10 số.
2. **Cùng thuế suất trong một khoảng** → mã cha giữ `rate_type`/`rate_percent` = mức chung (đúng cho mọi dòng
   10 số) và vẫn lưu `sublines`. **Khác nhau** → mã cha **không mang con số nào**: `rate_type = 'by_subline'`
   (migration `0010_tariff_by_subline`, CHECK `tariff_rate_shape`: `rate_percent IS NULL AND amount IS NULL` và
   `conditions.sublines` là mảng).
3. **Nhận diện dòng 10 số bằng mã 10 số in trong nghị định** — cả ACFTA, AANZFTA và EVFTA Phụ lục II đều in mã.
   Không có trường hợp nào phải dựa vào mô tả/thứ tự. Tiêu đề không mã (chỉ `4011.70.00` EVFTA) được ghép trước mô
   tả của các dòng sâu hơn nó: `"- - Loại khác: - - - Loại khác"`, để hai dòng `"- - - Loại khác"` không trùng nhau.
   Mọi cấu trúc khác (dòng 10 số không đứng sau mã cha, chữ lạ trước dòng 10 số đầu tiên) làm parser **dừng có lỗi**.
4. **EVFTA chỉ nạp Phụ lục II.** Parser chỉ đọc hàng dưới tiêu đề `BIỂU THUẾ NHẬP KHẨU`; tiêu đề
   `BIỂU THUẾ XUẤT KHẨU` hoặc `Phụ lục <số La Mã>` kết thúc bảng. **Thuế xuất khẩu ưu đãi EVFTA (Phụ lục I) không được
   nạp ở đâu cả.** Mã lặp trong bảng nhập khẩu → parser lỗi; seed cũng lỗi nếu file FTA còn mã lặp (bỏ “giữ hàng đầu”).
5. **Số cột thuế cố định theo biểu** (`--cols`: 1 cho ACFTA/AANZFTA, 6 cho ATIGA/EVFTA); hàng hoặc dòng 10 số có số ô
   khác → parser lỗi; seed kiểm lại trước khi ghi.
6. **API** (`/tariff`): `RateView.type` thêm `'by_subline'` (`percent = null`); `PreferentialView.sublines`
   = `[{ code, codeDotted, desc, type, percent, excludedOrigins, originExcluded }]`. Với `by_subline`, `statement` liệt kê
   từng dòng `"<mã> <mô tả>: X%"` (hoặc `"không hưởng (*)"`), giữ điều kiện C/O và mức MFN dự phòng; có xuất xứ bị
   dòng 10 số loại trừ thì dòng đó ghi `"không áp dụng cho <tên (mã)>"`. Không bao giờ in một con số ưu đãi duy nhất
   cho mã `by_subline`. Mã cha cùng mức mà có dòng 10 số loại trừ xuất xứ: `statement` thêm `"; riêng dòng 10 số …"`.
   Ghi chú (`notes`) cũ về loại trừ dòng 10 số bị thay bằng cấu trúc này. MFN và chống bán phá giá không đổi.

## Các phương án đã cân nhắc

- **Nạp dòng 10 số thành dòng `tariff_rate` riêng:** loại — mã khai báo là 8 số, CHECK `hs_code` 8 số, NĐ 26/2023
  (MFN) không có dòng 10 số; tra cứu 8 số sẽ không thấy gì hoặc phải tự chọn một dòng.
- **Giữ mức của dòng 10 số đầu tiên + ghi chú “đối chiếu nghị định”:** loại — con số vẫn sai với các dòng còn lại
  và trông hợp lệ (R3); ghi chú dễ bị bỏ qua.
- **Lấy mức thấp nhất / cao nhất / phổ biến nhất cho mã cha:** loại — là tự sinh con số, trái
  [ADR không dùng LLM/suy diễn cho số thuế](2026-07-17-no-llm-on-tariff-numbers.md) (R1).
- **Coi hàng EVFTA lặp là dòng con, nhận diện theo mô tả và thứ tự** (thiết kế ban đầu điểm 1): loại — bằng chứng
  nguyên văn ở trên cho thấy đó là biểu xuất khẩu Phụ lục I.
- **Nạp luôn Phụ lục I như biểu xuất khẩu EVFTA:** ngoài phạm vi việc này; ghi nhận là chưa nạp.

## Hệ quả

- Số mã cha (theo khoảng hiệu lực): **ACFTA** 34 (24 cùng mức, 10 `by_subline`); **AANZFTA** 8 (cả 8 `by_subline`);
  **ATIGA** 0; **EVFTA** 58 (22 `by_subline` cả sáu năm, 36 `by_subline` một số năm và cùng mức ở các năm khác —
  thường các năm cuối khi mọi dòng về 0).
- EVFTA: 553 mã đổi sang hàng Phụ lục II (464 vector đổi). Mọi mã khác, ở cả bốn file: không đổi một byte so với
  `19b6222` (`db/seed/fta-extracts.spec.ts`). ACFTA vẫn 3.154 mã 8 số có `excluded_origins`; 34 dòng 10 số có loại
  trừ nay nằm trong `sublines`.
- Golden set (259 ca): không ca nào (ở bất kỳ biểu nào) rơi vào mã cha có dòng 10 số; không ca FTA nào rơi vào 553 mã
  EVFTA đổi. Hai ca **MFN** nằm trên mã thuộc 553 mã đó — imp-101 (7106.92.00) và imp-151 (8104.90.00) — nhưng so với biểu
  MFN (`NK_uu_dai`), vốn không đổi. Không đổi giá trị kỳ vọng nào.
- Người đọc thấy câu dài hơn cho mã `by_subline` (bot Zalo và web in nguyên `statement`; không đọc `percent`/`type`).
- Việc cần theo dõi: triển khai phải chạy `db:migrate` (0010) rồi seed lại (`FORCE_RESEED=1`) — dữ liệu đang chạy vẫn
  là bản cũ cho tới khi đó. Thuế XK ưu đãi EVFTA (Phụ lục I) chưa nạp. Kế hoạch 05 dời `evidence_section` sang 0011.

## Links

- Planning: [05-bot-parity-tasks](../planning/05-bot-parity-tasks.md) (migration 0011)
- Design: [tariff-system](../concepts/tariff-system.md) · [research/fta-loader](../../research/fta-loader/README.md)
- Review: báo cáo nguồn và báo cáo triển khai của phiên 2026-09-13 (scratchpad, không commit)
