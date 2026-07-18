---
type: concept
status: active
updated: 2026-07-18
related:
  - data-sources.md
  - tariff-system.md
  - hs-classification.md
  - ../../fixtures/golden-set/README.md
  - ../planning/01-task-list.md
---

# Tài sản dữ liệu nội bộ của công ty

Ghi chú này liệt kê các dữ liệu **do chủ dự án cung cấp** — tờ khai lịch sử, file SOP khai báo nội bộ, và một biểu thuế thương mại đã mua. Nó bổ sung cho [Nguồn dữ liệu](data-sources.md) (vốn nói về các nguồn công khai / có thẩm quyền: Công báo, vbpl, API hải quan). Ở đây là dữ liệu **riêng của công ty**.

**Quy tắc chi phối — sao chép nguyên từ triết lý dự án:**

1. **Chỉ tờ khai đã thông quan mới là oracle độc lập.** Đó là giao dịch thật, được hải quan kiểm chứng, không nằm ở hạ nguồn giả định của parser. → nguồn chính cho golden set ([TASK-001](../planning/01-task-list.md), xem [fixtures/golden-set](../../fixtures/golden-set/README.md)).
2. **Biểu thuế thương mại và file SOP là nguồn THỨ CẤP** — chúng là bản chép/tra từ nghị định. Dùng làm **cross-check** và **kiến thức phân loại**, **không bao giờ** làm oracle vàng cũng **không** làm nguồn nạp có thẩm quyền. Nguồn chân lý pháp lý vẫn là văn bản nghị định (xem [Nguồn dữ liệu](data-sources.md)).
3. Không được rửa một điều chưa chắc thành một khẳng định chắc. Các file này có bẫy snapshot và lỗi biên soạn riêng — ghi rõ, đừng làm mượt.

Vị trí gốc (phiên nạp 2026-07-18): thư mục tải từ Google Drive `~/Downloads/drive-download-20260718T031630Z-1-001/` và các CSV trong `~/Downloads/`. **Các file gốc nằm NGOÀI repo** (chứa thông tin thương mại nhạy cảm) — chỉ dạng đã bóc gọn, đã ẩn danh trong `fixtures/golden-set/` mới được commit.

---

## 1. ⭐ Kho tờ khai lịch sử — oracle độc lập

137 PDF tờ khai ECUS đã thông quan (đã xác minh 2026-07-18, nguồn: thư mục Drive nêu trên):

- **117 tờ nhập khẩu (`ToKhaiHQ7N_*`)** — chương 84/85/39/73/82/90/40 (máy móc, phụ tùng, nhựa, kim loại). Mỗi dòng hàng cho: mã HS, **xuất xứ theo từng dòng**, ngày đăng ký, thuế suất NK đã áp, chữ cái biểu thuế (A=MFN, C=ACFTA…), có/không C/O, loại hình (A12/E31/E62/A41/H11/G/E13), VAT. **Đã bóc (2026-07-18):** 100 tờ đọc được (1 file 0-byte `108337700001`), **259 dòng hàng, 96 mã HS** → [import-corpus.yaml](../../fixtures/golden-set/import-corpus.yaml) (toàn bộ) + [cases.yaml](../../fixtures/golden-set/cases.yaml) (55 tinh tuyển).
- **18 tờ xuất khẩu (`ToKhaiHQ7X_*`)** — nhãn vải/giấy (5807/4821/5609), túi (4202), băng keo (3919), xe nâng/máy tái xuất. **Thuế XK = 0% cho toàn bộ 41 dòng** (đã xác minh 2026-07-18). 30/41 là **xuất khẩu tại chỗ** (người mua nước ngoài, giao nội địa, nước đến = VN).
- **2 file không phải tờ khai**: `78_TCHQ-GSQL_372077.pdf` (công văn TCHQ) và `PO#8041735 - DTE.pdf` (đơn hàng) — bỏ qua.

**Vì sao đây là oracle:** một tờ khai nói *"chúng tôi đã nhập cái này, xuất xứ này, ngày này, áp thuế này, và hải quan chấp nhận."* Đó là tín hiệu độc lập với việc parser đọc nghị định thế nào. Đúng nghĩa TASK-001.

**Phát hiện then chốt (đã xác minh 2026-07-18 từ chính dữ liệu này):**
- **✅ Cross-check 249/249 khớp** với biểu thuế thương mại (mục 2) ở đúng cột biểu thuế tương ứng (form E→ACFTA, AANZ→AANZFTA, D→ATIGA, REX→EVFTA, còn lại→MFN). Thuế NK khai trên tờ khai đồng thuận 100% với nguồn thứ cấp độc lập — bằng chứng mạnh rằng extraction không âm thầm sai.
- **Bộ ba minh chứng C/O `8481.80.99`** — *(HS, xuất xứ, ngày) không đủ suy ra thuế:* **10% MFN** (không C/O) vs **0% ACFTA** (CN, form E) vs **0% AANZFTA** (AU, form AANZ). Đáp án phải có điều kiện C/O.
- **Chống bán phá giá (CBPG) — khoản riêng chồng lên thuế NK:** `7604.10.10` nhôm JP bị áp **CBPG 35,58%** thật (thu ~9,4 triệu VND); `7210.70.12` thép CN có CBPG 34,27% nhưng **miễn** (form E); `7212.30.13` thép AU **không chịu** (mã GK). → schema TASK-007 phải mô hình hóa CBPG **tách khỏi** thuế NK.
- **Công ty dùng 4 FTA** (trả lời Open Question #5): **AANZFTA (26 dòng), ACFTA form E (25), ATIGA form D (4), EVFTA tự chứng nhận REX (2)** + rất nhiều MFN. Chưa thấy VJEPA/AJCEP/RCEP trong lô này.
- **Xuất xứ ≠ nước người bán — 36 dòng:** vd Bossard Malaysia (mã nước MY) → hàng *xuất xứ CN*; Webcontrol Đài Loan (TW) → *xuất xứ DE*; có dòng người XK Đức nhưng *xuất xứ CH* (Thụy Sĩ). → đọc `origin` theo dòng, không lấy nước người bán. (Lưu ý: Baosteel "Singapore" lại khai **mã nước = CN = xuất xứ**, nên KHÔNG thuộc nhóm 36 — tên công ty khác với mã nước khai báo.)
- **Loại hình ảnh hưởng thuế thu, KHÔNG ảnh hưởng thuế suất luật:** E31/E62 (SXXK) và E13/G (tạm/chuyển PTQ, hiển thị `M`) có thể miễn, nhưng mức luật vẫn hiện. Golden set dùng **thuế suất luật**.

**Giới hạn còn lại:** dải ngày **2025-12 → 2026-07** cho một ít trải thời gian, nhưng **chưa bắc qua một lần đổi nghị định lớn** (vd cửa sổ ND 72/2026 hết hiệu lực 2026-04-30) → TASK-010 vẫn cần thêm tờ khai quanh các mốc đó. **Không có ca bẫy phụ lục thật** (hàng vừa có thuế xuất vừa có thuế nhập) trong lô này.

---

## 2. `BIEU THUE XNK 2026.04.05.csv` — biểu thuế thương mại đầy đủ (cross-check)

`~/Downloads/BIEU THUE XNK 2026.04.05.csv` — UTF-8, phân cách `;`, **19.901 dòng × 109 cột**, chốt tại **2026-04-05** (đã xác minh 2026-07-18).

Mỗi HS × mọi biểu thuế: NK thông thường, NK ưu đãi (MFN), VAT, và **18 FTA** — ACFTA, ATIGA, AJCEP, VJEPA, AKFTA, AANZFTA, AIFTA, VKFTA, VCFTA, VN-EAEU, CPTPP, AHKFTA, EVFTA, UKVFTA, VN-LÀO, VN-CAM, VIFTA, RCEP (nhiều cột theo từng nước) — cộng TTĐB, BVMT, thuế XK (kèm XK CPTPP/EV/UKV). **Mỗi cột thuế đi kèm `Văn bản` (nghị định) + `Ngày hiệu lực`.**

**Vai trò:**
- **Cross-check tự động** cho [TASK-008](../planning/01-task-list.md)/TASK-012 (thay đối chiếu tay). Đã xác nhận: dòng `8481.80.99` cho NK ưu đãi=10 (ND 26/2023) + ACFTA=0 (ND 118/2022) → **khớp chính xác** dữ liệu tờ khai thật ở mục 1. Hai nguồn độc lập đồng thuận.
- **Bản đồ schema/phạm vi** cho [TASK-007](../planning/01-task-list.md): xác nhận các cấu trúc research cảnh báo — RCEP có cột **theo từng nước** (Điều 6.2), ký hiệu `0 (-KH, PH)` = **loại trừ** Campuchia/Philippines (không phải 0), tách cột **NK và XK riêng** (xử lý bẫy phụ lục về cấu trúc).

**Caveat (bắt buộc giữ):**
- **Snapshot một thời điểm (2026-04-05)** — mỗi biểu chỉ có MỘT mức hiện hành, **không có chuỗi thời gian** → không mô hình hóa được "nghị định hết hiệu lực rồi hồi quy" (bẫy ND 72/2026). Truy vấn ngày sau 2026-04-30 cho mã hồi quy sẽ sai.
- **Nguồn thứ cấp/thương mại** — bảng biên soạn, có thể mang lỗi biên soạn riêng. **Không làm oracle, không làm nguồn nạp thẩm quyền.** Đối chiếu, không tin mù.

---

## 3. File SOP khai báo nội bộ — kiến thức phân loại + mỏ ca khó

Hai file "dùng khai thực tế" (UTF-8, phân cách `;`), là bản đồ tên-hàng → HS mà bộ phận khai báo thực dùng, kèm **lý do phân loại và bài học xương máu**:

- **`KHAI QUAN SOP TEAM MACHINE - PTTT 2026.csv`** — ~1.027 dòng, phụ tùng thay thế. Cột: mã tra cứu nội bộ, mã hải quan, tên EN/VI, HS, đơn vị, khai hóa chất, ghi chú.
- **`KHAI QUAN SOP TEAM MACHINE 2026.csv`** — **644 dòng có HS thật** (160 mã distinct), máy móc. Thêm cột **Thuế suất NK / VAT / CBPG** + ghi chú. Thuế NK: 0% (306 dòng) áp đảo, còn lại 2/3/5/10/15%. **Cột CBPG trống toàn bộ.** 93 dòng có ghi chú. (đã xác minh 2026-07-18)

**Vai trò:** nuôi **Giai đoạn 2 (phân loại HS)** và là **mỏ ca khó** cho golden set (các dòng có ghi chú → đánh cờ `uncertain` hoặc `confident-có-lý-do`). Các HS ở đây có trọng lượng vì đã qua thông quan thực tế. Chúng **khóa chéo với tờ khai** (xe nâng 84271000, các dòng "TX từ mục 1 tk…" trỏ về tờ khai thật).

**Ca khó tiêu biểu (giá trị cốt lõi):**
- **Hải quan bắt sửa mã:** một chiller khai `8418.69.90` → *"HQ YÊU CẦU CHỈNH TÊN HÀNG"* → chỉnh `8415.82.91`.
- **Mã HS quyết định được nhập hay không:** máy RFID — *"nếu khai 8471 thì hàng đã qua sử dụng CẤM NHẬP"* → phải khai `9031.80.90`.
- **Tự sửa lịch sử:** máy tiện CAM — *"tờ khai 2023 đã khai, nhưng đọc lại tài liệu thấy chưa đúng, lô sau phải recheck."*
- **Loại trừ theo chú giải + C/O:** air cooler — *"phân vân HS 8418… theo chú giải thì dải nhiệt này được loại trừ; đồng thời hàng có Form E."*
- **Cảnh báo chống nhầm CBPG:** seal bar (SOP PTTT) — *"không được gọi là Thanh Hàn vì nhầm sang vật liệu hàn HS 8311 chịu thuế chống bán phá giá."*
- Rất nhiều dòng: giấy phép nhập (NĐ 72/2022 + TT 11/2024 cho máy in), giám định máy cũ (QĐ 18/2019).

**Caveat:** cho tên-hàng → HS + lý do, **không có xuất xứ/ngày/thuế theo từng giao dịch** → bổ sung cho tờ khai, không thay. Vẫn là nguồn thứ cấp (chép từ biểu thuế), không phải oracle.

**Lỗi dữ liệu cần dọn trước khi dùng:** hàng trăm dòng `#REF!` rỗng (Excel spill — bỏ; SOP MÁY có 769 dòng); **HS sai định dạng** `871680102`→`8716.80.10`, `902730002`→`9027.30.00`; ô thuế `#N/A` và lẫn `"2%"` với `"2"` (chuẩn hóa). File dán qua chat bị mojibake — luôn đọc bản đĩa (UTF-8).

---

## Ma trận vai trò

| Nguồn | Cho gì | Vai | Thẩm quyền |
|---|---|---|---|
| 117 tờ khai NK | HS + **xuất xứ + ngày → thuế đã áp** | **Golden oracle** (TASK-001) | Độc lập (giao dịch thật) |
| 18 tờ khai XK | HS → 0% XK | phụ | Độc lập |
| BIEU THUE CSV | HS → mọi biểu + nghị định + ngày hiệu lực | **Cross-check** (TASK-008/012) + bản đồ schema (TASK-007) | Thứ cấp (thương mại, snapshot) |
| SOP PTTT | phụ tùng → HS + lý do | Ca khó + phân loại (GĐ2) | Thứ cấp (đã dùng khai) |
| SOP MÁY | máy → HS + thuế + lý do + giấy phép | Ca khó + phân loại (GĐ2) | Thứ cấp (đã dùng khai) |

Không nguồn nào một mình đủ; cùng nhau là nền vững cho Giai đoạn 1. **Nguồn chân lý pháp lý vẫn là nghị định** — cả ba nguồn thứ cấp chỉ để đối chiếu và tăng tốc.

---

## Chưa xác minh / Không được dựa vào

- **BIEU THUE CSV đã được 249 dòng tờ khai chứng thực (249/249 khớp), nhưng CHƯA đối chiếu với Công báo.** Đồng thuận với tờ khai thật là mạnh, nhưng cả hai vẫn là *nguồn thứ cấp phái sinh từ nghị định*; chỉ Công báo mới là thẩm quyền. Đối chiếu với văn bản gốc ở TASK-008.
- **HS trong file SOP là "đồng thuận với thực tiễn quá khứ", không phải "đúng luật"** — chính các ghi chú (HQ bắt sửa mã, tự recheck) cho thấy phân loại nội bộ từng sai. Đánh cờ `uncertain` khi có tranh luận.
- **Đã bóc xong 117 tờ (2026-07-18): 259 dòng, cross-check 249/249 khớp; chấm tay 4 tờ (15/15 dòng khớp).** Cờ `confidence` = `uncertain` cho **toàn bộ** (quyết định chủ dự án): dữ liệu đã-khai-qua, không certify đúng luật. **Xác minh đúng/sai để lúc dùng thật qua vòng xác nhận Zalo**, không phải staff certify trước — nên "độ chính xác" so với golden set = tái hiện thực tiễn quá khứ, không phải đúng luật.
- **Đường dẫn `~/Downloads/...` là của phiên nạp này**, có thể đổi. Tạo phẩm bền vững là `fixtures/golden-set/`, không phải các file gốc.

## Kiến thức liên quan

- [Nguồn dữ liệu](data-sources.md) — nguồn công khai/có thẩm quyền; vì sao Công báo là nguồn chân lý.
- [Hệ thống biểu thuế](tariff-system.md) — bẫy phụ lục, khoảng trống thời gian, vì sao snapshot không đủ.
- [Phân loại mã HS](hs-classification.md) — vì sao HS là ứng viên kèm bằng chứng; các ca khó SOP nuôi phần này.
- [fixtures/golden-set](../../fixtures/golden-set/README.md) — luật chơi golden set và schema.
- [Danh sách công việc](../planning/01-task-list.md) — TASK-001, 007, 008, 010, 012.
