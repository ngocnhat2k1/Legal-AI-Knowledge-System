# Golden set — bộ đối chứng thuế suất (TASK-001)

Thư mục này chứa **bộ golden set**: 30–50 câu hỏi tra cứu thuế suất thực tế, mỗi câu kèm đáp án đã biết là đúng, được ghi lại **trước khi** viết bất kỳ dòng parser nào.

Xem [TASK-001 trong danh sách công việc](../../.agent/planning/01-task-list.md) để biết bối cảnh đầy đủ.

## Trạng thái (2026-07-18)

Đã nạp từ **117 tờ khai nhập khẩu thật đã thông quan** (100 tờ đọc được; 1 file 0-byte `108337700001` cần gửi lại):

- **[cases.yaml](cases.yaml)** — **55 case tinh tuyển**, phủ 4 FTA (ACFTA/AANZFTA/ATIGA/EVFTA), ca CBPG (áp + miễn), bẫy xuất-xứ, thuế "M"/miễn, mức cao 17–30%, và bộ ba `8481.80.99` (MFN 10% / ACFTA 0% / AANZFTA 0%).
- **[import-corpus.yaml](import-corpus.yaml)** — **toàn bộ 259 dòng hàng** (pool để TASK-012 lấy mẫu ngẫu nhiên).
- **Đã cross-check: 249/249 dòng khớp** với biểu thuế thương mại `BIEU THUE XNK 2026.04.05` (nguồn thứ cấp độc lập) → xem [company-data-assets.md](../../.agent/concepts/company-data-assets.md).
- **Còn thiếu:** cờ `confidence` vẫn `unmarked` — cần bộ phận khai báo rà và đổi thành `confident`/`uncertain` (mục 3 Luật chơi).

## Vì sao nó tồn tại

Đây là **oracle độc lập** để bắt lỗi parser. Giá trị duy nhất của nó là nó **không nằm ở hạ nguồn cùng nguồn dữ liệu mà parser sẽ đọc**.

- Parser đọc nghị định (Công báo) → suy ra thuế suất.
- Nếu "đáp án đúng" mà ta so vào cũng chỉ là một bản chép lại của chính nghị định đó, thì test xanh chỉ chứng minh *"parser chép giống cách con người chép"* — không chứng minh nó xử lý đúng bẫy phụ lục.

Bằng chứng vì sao điều này quan trọng: parser nháp của research đạt **"94% thành công" nhưng thực ra trả về thuế xuất khẩu cho câu hỏi nhập khẩu** — 1.329 mã HS có thuế khác nhau giữa Phụ lục I và Phụ lục II của ND 26/2023. Parser đó **sẽ vượt qua mọi test do chính người viết nó soạn ra**. Golden set là artifact duy nhất trong dự án không dính lỗi đó — miễn là nó ra đời trước code.

## Luật chơi (bắt buộc)

1. **Chỉ hai nguồn hợp lệ:**
   - Một **tờ khai hải quan thật đã thông quan**, hoặc
   - Một dòng của **bảng biểu thuế nội bộ đã thực sự được dùng để khai và đã thông quan** (thực tế hải quan đã kiểm chứng dòng đó).
2. **CẤM chế đáp án bằng cách tra nghị định hay tra bảng biểu thuế.** Làm thế là tự tay đưa circularity (đo code bằng chính nó) vào — đúng thứ file này sinh ra để chặn.
3. **Mỗi case mang một cờ `confidence`:** `confident` hoặc `uncertain` — là mức độ chắc chắn của **chính bộ phận khai báo** về đáp án lịch sử của họ. Nếu họ không chắc, "độ chính xác" của hệ thống so với case đó chỉ nghĩa là *đồng thuận với thói quen cũ*, không phải *đúng luật*. Ghi rõ, đừng rửa thành tự tin.
4. **Mục tiêu ≥ 30 case, commit vào repo trước khi TASK-002 bắt đầu.** Không để trên bảng tính ở laptop của ai đó.

## 4 quy tắc để golden set thực sự "có răng"

1. **Trải ngày.** Chọn case ở nhiều mốc thời gian, ưu tiên quanh lúc đổi nghị định (vd trước/sau cửa sổ ND 72/2026, hoặc các bước giảm thuế FTA hằng năm). Đây là cách golden set test được **chiều thời gian** mà một bảng snapshot mù hoàn toàn.
2. **Cắm bẫy phụ lục.** Ít nhất vài case **nhập khẩu** mà cùng mã HS đó cũng nằm ở biểu **xuất khẩu** (Phụ lục I vs II). Đây là regression test cho bug 1.329 mã.
3. **Xuất xứ thật + biểu thuế thật.** Dùng đúng các nước / FTA công ty thực sự nhập → trả lời câu hỏi "công ty dùng những FTA nào" (Open Question #5). **Đã lộ từ 117 tờ khai:** công ty dùng **ACFTA (form E), AANZFTA (form AANZ), ATIGA (form D), EVFTA (REX)** + rất nhiều MFN — khỏi phải nạp cả 26 biểu.
4. **Ca khó công ty từng cãi nhau.** Đúng chỗ công cụ chứng minh hoặc đánh mất giá trị của nó.

## Quy trình thu thập

1. Gửi [collection-template.csv](collection-template.csv) cho bộ phận khai báo. Họ chỉ điền cái họ **biết chắc từ việc khai** — không cần biết "biểu thuế nào", "nghị định nào".
2. Cột **"Có C/O? (form gì)"** là chìa khóa: từ đó suy ra được đây là thuế MFN hay FTA, và encode luôn tính có điều kiện — không phải đoán.
3. Dev nhận CSV đã điền → convert sang [cases.yaml](cases.yaml), điền các field suy ra được (`schedule`, `rate_type`, `conditions`).
4. Giữ **số tờ khai** ở `declaration_ref` để truy vết ngược về hồ sơ gốc.

## Lược đồ một case (`cases.yaml`)

| Field | Ý nghĩa |
|---|---|
| `id` | Định danh, vd `gs-001` |
| `source` | `declaration` (tờ khai thật đã thông quan) |
| `declaration_ref` | Số tờ khai (truy vết về hồ sơ gốc) |
| `declaration_date` | `YYYY-MM-DD` — chính ngày này chọn ra nghị định có hiệu lực |
| `regime` | Loại hình: `A12` (kinh doanh) \| `E31/E62` (SXXK) \| `H11` (mẫu) \| `G12/G13/E13` (tạm/chuyển PTQ) \| `A41`… |
| `goods_description` | Mô tả hàng **nguyên văn** như trên tờ khai |
| `hs_code` | HS 8 chữ số, dạng có dấu chấm, vd `8481.80.99` |
| `origin` | Mã nước ISO xuất xứ **theo dòng** (KHÔNG phải nước người bán) |
| `exporter_country` | Nước người xuất khẩu (thường ≠ `origin` — đây là bẫy) |
| `applied_rate` | Thuế NK đã áp, vd `"10%"`, `"0%"`, hoặc `"miễn (M)"` |
| `rate_type` | `percent` \| `conditional` (có C/O) \| `exempt` \| `absolute-usd` \| `excluded` \| `trq` |
| `schedule` | `MFN` \| `ACFTA` \| `AANZFTA` \| `ATIGA` \| `EVFTA` \| `VJEPA` \| `RCEP_*` … |
| `has_co` | `true` nếu có C/O ưu đãi (quyết định FTA hay MFN) |
| `co_form` | Loại C/O: `form E` (ACFTA) \| `form AANZ` \| `form D` (ATIGA) \| REX (EVFTA) \| `null` |
| `conditions` | Điều kiện áp ưu đãi, vd `"0% chỉ khi có C/O form E"`; ngược lại `null` |
| `cbpg` | Thuế chống bán phá giá nếu có — **khoản riêng** chồng lên thuế NK; ghi rõ áp/miễn |
| `decree` | Nghị định nguồn nếu biết (hiện `null` — xác lập ở TASK-009) |
| `cleared` | `true` nếu hải quan đã chấp nhận tờ khai |
| `confidence` | `confident` \| `uncertain` \| `unmarked` (chờ bộ phận khai báo đánh dấu) |
| `selected_for` | Vì sao case này vào golden set (nhãn phủ) |
| `note` | Ghi chú nguyên văn từ tờ khai (lý do, C/O, giấy phép, CBPG…) |

## Ví dụ thật nổi bật trong `cases.yaml`

Đây **là dữ liệu thật đã thông quan** (không phải minh họa) — nhưng `confidence` còn `unmarked`, chờ bộ phận khai báo xác nhận.

- **Bộ ba `8481.80.99` — (HS, xuất xứ, ngày) KHÔNG đủ để suy ra thuế:** `10%` MFN (không C/O) vs `0%` ACFTA (CN, form E) vs `0%` AANZFTA (AU, form AANZ). Đáp án phải **có điều kiện C/O**, không bao giờ là một số trơ.
- **CBPG áp thật:** `7604.10.10` nhôm JP — thuế NK `5%` **cộng thêm chống bán phá giá 35,58%** (thu ~9,4 triệu VND). CBPG là **khoản riêng**, không nằm trong biểu thuế NK.
- **CBPG được miễn:** `7210.70.12` thép CN — CBPG 34,27% nhưng miễn nhờ điều kiện; `7212.30.13` thép AU — không chịu (mã GK).
- **Bẫy xuất xứ ≠ người bán:** nhiều dòng người XK Singapore/Malaysia/Đài Loan nhưng *Nước xuất xứ* là CN/DE/JP → phải đọc `origin` theo dòng.
- **Thuế "M" (miễn):** loại hình E13/G (tạm nhập, chuyển khu phi thuế quan) hiển thị `M` thay vì `%`.

## Kiến thức liên quan

- [Danh sách công việc — TASK-001](../../.agent/planning/01-task-list.md)
- [Tài sản dữ liệu nội bộ của công ty](../../.agent/concepts/company-data-assets.md) — 5 nguồn dữ liệu, vai trò, và cross-check
- [Hệ thống biểu thuế](../../.agent/concepts/tariff-system.md) — biểu thuế, bẫy phụ lục, khoảng cách thời gian
- [Quy tắc tác nhân](../../.agent/AGENTS.md)
