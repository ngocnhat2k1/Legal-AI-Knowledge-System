---
type: concept
status: active
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../index.md
---

# Phân loại mã HS (HS Classification)

Kiến thức miền bền vững cho tính năng 2 của Customs Assistant: **gợi ý ỨNG VIÊN mã HS**. Nói ngắn
gọn: phân loại là một sự xác định pháp lý, không phải là tra cứu, và không có hệ thống công bố nào
tiệm cận độ chính xác của con người ở độ sâu chữ số mà Việt Nam khai báo. Ghi chú này ghi lại những
con số biện minh cho hợp đồng "top-3 + bằng chứng nguyên văn + con người quyết định" để một agent
trong tương lai không lặng lẽ thiết kế lại nó thành một cỗ máy trả lời.

Tất cả các khẳng định dưới đây đều đến từ báo cáo nghiên cứu 09 (phân loại HS) và báo cáo 12 (xác
minh đối kháng dữ liệu thuế quan), trừ khi có ghi chú khác.

---

## 1. HS là gì

Hệ thống hài hòa (Harmonized System) là một danh pháp của WCO: **21 Phần / 97 Chương**, được hài hòa
quốc tế đến **6 chữ số**. Việt Nam mở rộng đến **8 chữ số** thông qua AHTN (Danh mục thuế quan hài hòa
ASEAN). (đã xác minh 2026-07-17, nguồn: https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-interpretation-general-rules/0001_2012e_gir.pdf)

Danh mục có hiệu lực của Việt Nam là **Thông tư 31/2022/TT-BTC** (hiệu lực 01/12/2022), Danh mục hàng
hóa xuất khẩu, nhập khẩu Việt Nam trên nền HS 2022 / AHTN 2022 — **21 phần / 97 chương / 1,228 nhóm /
4,084 phân nhóm / 11,414 dòng hàng 8 số**. Đây vẫn là danh mục có hiệu lực trong năm 2026. (đã xác minh
2026-07-17, nguồn:
https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx)

**Chân trời phiên bản.** HS được sửa đổi khoảng mỗi 5 năm. **Các sửa đổi HS 2028 đã được thông qua tạm
thời tại phiên họp HSC lần thứ 75 (tháng 4/2025) và có hiệu lực từ 01/01/2028.** (đã xác minh 2026-07-17,
nguồn: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx)
**Không được hardcode AHTN 2022.** Mọi mã, ghi chú và ánh xạ được lưu trữ đều cần một khóa phiên-bản-danh-pháp.
Việc tái danh pháp (renomenclature) tái định cơ sở cho các mã và làm mồ côi các ánh xạ lịch sử — một
lược đồ không có cột phiên bản sẽ lặng lẽ trộn lẫn ý nghĩa 2022 và 2028 cho cùng một dãy chữ số.

## 2. 6 quy tắc GRI — một quy trình quyết định, áp dụng theo trình tự nghiêm ngặt

Bạn **không được** nhảy sang GRI 3 nếu GRI 1 đã giải quyết được hàng hóa. Thứ tự chính là luật, không
phải là một heuristic. (đã xác minh 2026-07-17, nguồn:
https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-interpretation-general-rules/0001_2012e_gir.pdf)

| Quy tắc | Nội dung |
|---|---|
| **GRI 1** | Nội dung nhóm **+ Chú giải Phần/Chương** quyết định. Tiêu đề Phần/Chương **chỉ mang tính tham khảo** và không có giá trị pháp lý. |
| **GRI 2(a)** | Hàng hóa chưa hoàn chỉnh / chưa lắp ráp nhưng đã có đặc trưng cơ bản của sản phẩm hoàn chỉnh. |
| **GRI 2(b)** | Hỗn hợp và hàng hóa hợp thành (dẫn vào GRI 3). |
| **GRI 3** | Hai hoặc nhiều nhóm thoạt nhìn đều có thể áp dụng: **3(a)** mô tả cụ thể nhất → **3(b)** đặc trưng cơ bản → **3(c)** nhóm có thứ tự số cuối cùng. Nghiêm ngặt theo thứ tự đó. |
| **GRI 4** | Hàng hóa giống nhất. Hiếm khi được dùng. |
| **GRI 5** | Bao, hộp, vật liệu đóng gói. |
| **GRI 6** | Phân nhóm — chỉ so sánh **ở cùng một cấp**, áp dụng chú giải phân nhóm với những sửa đổi thích hợp (*mutatis mutandis*). |

Bản sao sáu quy tắc của Việt Nam nằm ở **Phụ lục II của Thông tư 31/2022/TT-BTC** ("6 quy tắc tổng
quát"). (đã xác minh 2026-07-17, nguồn:
https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx)

**Hãy mô hình hóa thứ tự GRI dưới dạng CODE, chứ không phải dưới dạng chỉ dẫn trong prompt.** Lý do:
GRI 3(a) → 3(b) → 3(c) là một quy trình quyết định tất định với một đường rơi qua (fallthrough) đã được
định nghĩa. Nếu nó nằm trong prompt, mô hình được tự do đạt đến 3(c) trong khi 3(a) vẫn còn khả dụng,
và không có gì trong đầu ra tiết lộ rằng nó đã làm vậy. Được mã hóa thành luồng điều khiển, "chúng ta
đã vét cạn 3(a) chưa?" là một khẳng định có thể kiểm tra được. Đây không phải là một sở thích về phong
cách — xem §5, nơi việc trao cho mô hình các quy tắc được viết ra **làm GIẢM** độ chính xác trong khi
một pipeline mà luồng điều khiển của nó *chính là* cấu trúc phân cấp đã tăng gần gấp đôi độ chính xác.

## 3. Thứ bậc hiệu lực pháp lý — sự thật cấu trúc then chốt

Bất kỳ bằng chứng nào mà hệ thống trích dẫn đều phải được gắn thẻ với cấp độ thẩm quyền của nó, bởi vì
các cấp độ không thể thay thế cho nhau trong một lập luận trước Chi cục Hải quan.

- **RÀNG BUỘC (BINDING)**: nội dung nhóm, nội dung phân nhóm, và các **Chú giải pháp lý (Legal Notes)** —
  Chú giải Phần, Chú giải Chương, Chú giải Phân nhóm. (đã xác minh 2026-07-17, nguồn: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/guide/legal-notes-legales-eng.html)
- **CÓ THẨM QUYỀN NHƯNG KHÔNG RÀNG BUỘC**: **Chú giải chi tiết (EN)** của WCO và **Tuyển tập các ý
  kiến phân loại (Compendium of Classification Opinions)**. Các cơ quan quản lý coi chúng là cách giải
  thích có thẩm quyền và các tranh chấp thường được giải quyết bằng cách viện dẫn chúng, nhưng chúng
  không ghi đè lên các Chú giải pháp lý.
  (đã xác minh 2026-07-17, nguồn: https://taxation-customs.ec.europa.eu/customs/common-customs-tariff-cct/tariff-classification-goods/harmonized-system_en)
- **LỚP ASEAN**: **SEN (Chú giải bổ sung — Supplementary Explanatory Notes)** cho các dòng hàng 8 chữ
  số AHTN. SEN 2022 được lưu hành tại Việt Nam theo **Công văn 3866/TCHQ-TXNK (24/07/2023)**. **SEN
  không tự nó có tính ràng buộc độc lập** — một lập luận dựa trên SEN mà mâu thuẫn với EN của HS là yếu
  về mặt pháp lý. (đã xác minh
  2026-07-17, nguồn: https://thuvienxuatnhapkhau.com/wp-content/uploads/2023/07/3866_Chu-giai-SEN-2022.pdf)

Tại sao điều này quan trọng đối với sản phẩm: một chồng trích dẫn dẫn đầu bằng SEN và không bao giờ
đạt đến một Chú giải Chương trông có vẻ thuyết phục nhưng lại mỏng về mặt pháp lý. Hãy xếp hạng và gắn
nhãn bằng chứng theo cấp độ trong giao diện để một nhân viên có thể thấy liệu họ đang nắm trong tay một
lập luận ràng buộc hay một lập luận chỉ có tính thuyết phục.

## 4. Vì sao phân loại thực sự khó

1. **Đây là lập luận pháp lý, không phải tra cứu.** Cùng một vật thể vật lý sẽ được phân loại khác nhau
   theo *công dụng*, *vật liệu*, *đặc trưng cơ bản*, *trạng thái lắp ráp*, và *hình thức trình bày*.
   Các chú giải loại trừ tham chiếu chéo tới những chương ở rất xa chương mà bạn đang đọc.
2. **Các ràng buộc đa trục có ưu tiên.** Vật liệu, công dụng và hình thức phải được giải quyết theo
   đúng thứ tự. Kiểu thất bại đặc trưng là **giải quyết một trục trong khi bỏ qua các ràng buộc ưu tiên
   trên các trục khác** — được chẩn đoán rõ ràng là cách mà prompting đầu-cuối (end-to-end) thất bại.
   (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2605.14857)
3. **Cách soạn thảo cố ý để ngỏ (open-textured).** Các chú giải pháp lý dùng "ví dụ", "chẳng hạn như",
   "chủ yếu", "loại được dùng cho". Sự mơ hồ này là cố ý và tạo ra sự nhầm lẫn ranh giới một cách có
   chủ đích. (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631)
4. **Các chuyên gia có lý cũng bất đồng.** Trong quá trình xây dựng HSCodeComp, hai chuyên gia đã bất
   đồng đủ để cần một người thứ ba cấp cao phân xử; một cuộc rà soát sau đó trên 226 bất đồng phát hiện
   **~42,5% các dự đoán "sai" của mô hình thực ra được các quy tắc HS hỗ trợ tốt hơn so với dữ liệu
   chuẩn (ground truth) đã công bố**. (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2605.14857)
   **Bản thân dữ liệu chuẩn (ground truth) là có thể tranh cãi.** Một hệ thống tái tạo lại nhãn chính
   thức đang tối ưu cho *sự đồng thuận với hải quan* — về mặt thương mại đây là mục tiêu đúng, nhưng
   không phải là một điều giống với việc đúng. Hãy nói thẳng điều đó ra thay vì gọi nó là độ chính xác.
5. **Tiền nằm ở những chữ số cuối cùng.** Hầu hết sai sót xảy ra *sau khi* đã tìm được nhóm đúng: việc
   tách giữa hai phân nhóm quyết định mức thuế, mức độ chịu thuế AD/CVD, điều kiện hưởng FTA, giấy phép.
   (đã xác minh 2026-07-17, nguồn: https://aomeara.com/how-customs-actually-classifies-products/)

## 5. Độ chính xác của AI — những con số thực tế

### HSCodeComp — 632 sản phẩm thương mại điện tử thực tế do chuyên gia gán nhãn, 27 chương, mục tiêu mã 10 chữ số
(đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631)

| Hệ thống | Độ chính xác 10 chữ số |
|---|---|
| **Chuyên gia con người** | **95.0%** |
| Agent tốt nhất (SmolAgent + GPT-5 VLM) | 46.8% |
| Gemini Deep Research | 40.8% |
| GPT-5, chỉ LLM (không công cụ) | 29.0% |
| Qwen2.5-72B | 0.16% |

**Độ chính xác sụp đổ khi đi xuống theo cấu trúc phân cấp: ~82% ở 2 chữ số → 29–47% ở 10 chữ số.** Độ
sâu chính là toàn bộ vấn đề. Một bản demo cho thấy "nó đã đoán đúng chương" thực chất đang đo phần dễ
82% và không nói cho bạn biết gì về những chữ số quyết định mức thuế.

**Hai phát hiện phản trực giác phải định hình thiết kế:**

- **Mở rộng quy mô tại thời điểm suy luận (test-time scaling) không giúp ích.** Bỏ phiếu đa số và
  tự-phản-tư mang lại lợi ích **không đáng kể**, khác với các miền lập luận khác. Tại sao điều này quan
  trọng: cách khắc phục rẻ tiền hiển nhiên — "lấy mẫu 5 lần rồi bỏ phiếu" — chẳng mang lại gì ở đây.
  Các câu trả lời sai thì sai một cách *nhất quán*, bởi mô hình áp dụng sai cùng một quy tắc ở mỗi lần
  lấy mẫu. Đừng dự trù ngân sách cho nó.
- **Việc trao cho mô hình các quy tắc quyết định do con người viết ra một cách tường minh LÀM GIẢM hiệu
  suất** đối với hầu hết các hệ thống. Tại sao điều này quan trọng: bản năng dán GRI + chú giải chương
  vào prompt là chủ động gây hại. Nhồi thêm quy tắc vào prompt ≠ tốt hơn. Các quy tắc thuộc về luồng
  điều khiển và truy xuất, không phải trong ngữ cảnh (context).

**Sai sót áp đảo là dạng "Sai nhưng Hợp lệ" (Error but Valid):** mô hình phát ra một mã HS thật, trông
hợp lệ nhưng lại sai. **Không có tín hiệu cú pháp nào của thất bại** — không có ngoại lệ, không có lỗi
phân tích cú pháp, không có cờ đỏ. Nó chảy vào VNACCS, được chấp nhận, và nổi lên nhiều năm sau dưới
dạng một cuộc kiểm tra sau thông quan. Mức độ tự tin của mô hình không tương quan với kết quả pháp lý,
và thất bại thì âm thầm và bị trì hoãn.

Sáu kiểu thất bại được ghi nhận: quyết định vội vàng (cam kết trước khi thu thập bằng chứng), xử lý
sai thông tin (mất chi tiết sản phẩm trong ngữ cảnh dài), tự-sửa-lỗi không cần thiết (tự thuyết phục
mình rời bỏ một câu trả lời đúng), ảo giác lập luận, áp dụng sai quy tắc, và thiếu hụt kiến thức miền
(ví dụ gọi silicone là "cao su").

### Tuyên bố của nhà cung cấp so với các benchmark độc lập
Benchmark độc lập: 103 trường hợp thử nghiệm từ các phán quyết CBP được chọn ngẫu nhiên (đã xác minh
2026-07-17, nguồn: https://arxiv.org/html/2412.14179v1)

| Công cụ | 10 chữ số | Cấp chương |
|---|---|---|
| Tarifflo | 89.2% | 99/103 |
| Avalara (AI **+ rà soát bởi con người**) | 80.0% | 100/103 |
| Zonos | **44.1%** | 93/103 |
| WCO BACUDA (trần 6 chữ số) | 12.75% ở 6 chữ số | 57/103 |

**Zonos tiếp thị "độ chính xác 90%+ ngay từ đầu"** (đã xác minh 2026-07-17, nguồn:
https://zonos.com/classify) và được **benchmark độc lập ở mức 44.1% tại 10 chữ số** — chênh lệch ~2×.
Con số 80% của Avalara đến từ một sản phẩm bao gồm rõ ràng cả **khâu rà soát của chuyên gia con người
trong vòng lặp** (đã xác minh 2026-07-17, nguồn:
https://www.avalara.com/us/en/products/global-commerce-offerings/item-classification.html).
**Hãy coi mọi con số của nhà cung cấp là tiếp thị cho đến khi được tái lập một cách độc lập.** Lưu ý
rằng benchmark này tự thân đã nhỏ (n=103) và đặc thù cho US-HTS.

BACUDA là mô hình của chính WCO, dự đoán HS từ các mô tả thương mại với trần 6 chữ số, được huấn luyện
trên các tờ khai lịch sử; kết quả kém của nó trên các phán quyết CBP một phần là do dịch chuyển miền
(domain shift). BACUDA đã tổ chức một **Hội thảo quốc gia về Phân tích dữ liệu cho Hải quan Việt Nam
vào tháng 12/2025** — Hải quan Việt Nam đang tích cực hợp tác với WCO về vấn đề này. (đã xác minh
2026-07-17, nguồn:
https://bacuda.wcoomd.org/2025/12/05/national-workshop-on-data-analytics-for-viet-nam-customs/)

## 6. Những gì thực sự hiệu quả

**Cơ quan Hải quan Hàn Quốc (Korea Customs Service) — ứng viên có thể giải thích + bằng chứng, cho một
người quyết định.** Dự đoán các phân nhóm 6 chữ số, sau đó **truy xuất các câu then chốt liên quan từ
sổ tay HS làm bằng chứng có thể giải thích** cho mỗi ứng viên. **Độ chính xác top-3 đạt 93.9%** trên
925 phân nhóm khó, được đánh giá trên 5,000 yêu cầu phân loại gần đây. Một nghiên cứu người dùng với
**32 chuyên gia hải quan** xác nhận rằng các gợi ý + giải thích đã giảm đáng kể thời gian và công sức
rà soát. Nó được xác định rõ ràng là **hỗ trợ quyết định, không phải phân loại tự động.** (đã xác minh
2026-07-17, nguồn: https://arxiv.org/abs/2311.10922 và https://dl.acm.org/doi/10.1145/3635158)

**Quy trình Agentic Tất định (Deterministic Agentic Workflow).** Bác bỏ các agent tự động. Sử dụng một
**pipeline 6 giai đoạn cố định mà luồng điều khiển của nó được quy định bởi chính cấu trúc phân cấp thuế
quan**, chứ không phải do LLM khám phá tại thời điểm chạy, và **biên dịch trước GRI cùng các chú giải
chương/phần ngoại tuyến (offline) thành các mệnh đề có kiểu — bao gồm, loại trừ, quy tắc ưu tiên** —
chỉ nạp ngữ cảnh chú-giải-chương đắt đỏ ở đúng giai đoạn cần đến nó. Trên HSCodeComp: **4 chữ số 75.0%
top-1 / 91.5% top-3; 6 chữ số 64.2% top-1 / 78.3% top-3** — gần gấp **2× so với agent tự động tốt nhất**
trên cùng benchmark. Một **mô hình mở 27B đạt 84.2% (4 chữ số) / 77.4% (6 chữ số) đồng thuận với mô hình
tiền tuyến (frontier)** — bạn không cần một mô hình tiền tuyến cho hầu hết pipeline. (đã xác minh
2026-07-17, nguồn: https://arxiv.org/html/2605.14857) Bản tiền ấn (preprint) năm 2026, chưa được bình
duyệt.

**Kết luận chịu tải.** Top-1 tự động ở 10 chữ số: 29–47%. Top-3 có thể giải thích + bằng chứng ở 6 chữ
số: 93.9%, với mức tiết kiệm thời gian chuyên gia *đã được đo lường*. **Khoảng cách không nằm ở năng
lực của mô hình — nó nằm ở hợp đồng đầu ra (output contract).** "Top-3 + bằng chứng + con người quyết
định" và "top-1 + tự động" là hai sản phẩm khác nhau, và chỉ một trong số đó hoạt động. Đây là lý do
tại sao v1 xuất ra các ứng viên và bằng chứng chú-giải-pháp-lý nguyên văn, và tại sao bản thân các con
số thuế quan lại là tất định và hoàn toàn không có AI trên đó.

Các hệ quả đáng giữ lại:

- **Xuất ra ứng viên, không bao giờ là một con số 8 chữ số trơ trọi.** Ưu tiên cấp nhóm (4 chữ số)
  trước.
- **Mỗi ứng viên trích dẫn thẩm quyền của nó một cách nguyên văn** — Chú giải Chương, Chú giải Phần,
  đoạn EN, mục SEN, hay công văn cụ thể. Trích dẫn nguyên văn, đừng diễn giải lại. Nghiên cứu của KCS
  đã chứng minh giá trị nằm ở khâu **truy xuất bằng chứng**, không phải ở dự đoán. Đó cũng là hiện vật
  duy nhất có thể bảo vệ được khi một Chi cục chất vấn mã số — nó trở thành hồ sơ.
- **Từ chối một cách rõ ràng (Abstain loudly).** "Cả hai nhóm này đều có vẻ hợp lý áp dụng, đây là các
  chú giải cạnh tranh nhau, việc này cần xác định trước mã số" là đầu ra có giá trị cao nhất đối với
  một mặt hàng khó. Việc định tuyến sang quy trình Điều 28 là một tính năng, không phải một thất bại.
- **Đưa bất đồng ra ánh sáng (Surface disagreement).** Ở những chỗ công văn xung đột — và chúng có xung
  đột — hãy hiển thị cả hai. Che giấu xung đột đằng sau một câu trả lời đơn lẻ đầy tự tin là thiết kế
  chủ động gây hại.
- **Không bao giờ để mã ưa thích của người dùng lọt vào prompt như một tiền đề.** Việc khuếch đại thiên
  kiến xác nhận (confirmation bias) đã được ghi nhận: "nếu bạn muốn HTS của mình là X (dù cho HTS đúng
  là Y), AI sẽ đưa cho bạn một lập luận (hoặc ba) để hỗ trợ HTS ưa thích của bạn." (đã xác minh
  2026-07-17, nguồn:
  https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/) Mô hình
  là một luật sư biện hộ nịnh hót (sycophantic advocate), không phải một thẩm phán — và thất bại này
  chế tạo ra dấu vết giấy tờ cho một cáo buộc **trốn thuế**.
- **"Một công cụ AI tạo ra một con số mười chữ số trông có vẻ hợp lý không phải là sự cẩn trọng hợp lý
  (reasonable care)."** Nhà nhập khẩu chịu trách nhiệm; nhà cung cấp không gánh chịu gì. "Nền tảng bảo
  tôi mã HS đó" không phải là một biện hộ. (đã xác minh 2026-07-17, nguồn:
  https://internationaltradematters.com/discussion/ai-customs-compliance-for-smes/)

**Nơi AI chiến thắng ngày nay mà không có tranh cãi về độ chính xác:** truy xuất các chú giải
chương/phần và các loại trừ liên quan cho một mặt hàng (một bài toán truy xuất, nơi công nghệ mạnh);
tìm các công văn / thông báo xác định trước mã số của Việt Nam cho những mặt hàng tương tự (gần như bất
khả thi nếu làm thủ công vì kho tài liệu không được lập chỉ mục); **kiểm toán tính nhất quán** — gắn
cờ những chỗ mà chính các tờ khai lịch sử của doanh nghiệp đã dùng các mã khác nhau cho cùng một mặt
hàng (đây là kịch bản Polvita, có thể phát hiện *trước* cuộc kiểm tra); soạn thảo hồ sơ xác định trước
mã số; theo dõi các sai lệch HS giữa FTA/C/O.

## 7. Hậu quả riêng của Việt Nam khi sai mã

Chế tài theo **Nghị định 128/2020/NĐ-CP** (sửa đổi bởi **102/2021/NĐ-CP**):

| Tình huống | Hậu quả |
|---|---|
| Sai HS, **không ảnh hưởng thuế** | 1–2 triệu VND (Điều 8 khoản 1) |
| Sai HS → nộp thiếu thuế, tự phát hiện và khai bổ sung trong các thời hạn của Điều 9 khoản 2 | **10%** phần thiếu |
| Sai HS → nộp thiếu thuế, **bị hải quan phát hiện** | **20%** phần thiếu (Điều 9 khoản 3) |
| Bị quy kết là **trốn thuế** (Điều 14) | **1×–3×** số thuế trốn; có thể chuyển hồ sơ hình sự |
| Tất cả những điều trên | Truy thu toàn bộ phần thiếu + tiền chậm nộp **0.03%/ngày** |

(đã xác minh 2026-07-17, nguồn: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-8 và .../dieu-9)

- **Mức tối thiểu (de minimis)**: không phạt nếu chênh lệch thuế dưới **500.000đ (cá nhân) / 2.000.000đ
  (tổ chức)**.
- **Giảm 50%** khi người khai tự phát hiện và nộp khai bổ sung muộn (Điều 8 khoản 6).
- **Thời hiệu**: **5 năm** đối với chế tài hành chính, nhưng **thuế + tiền lãi có thể truy thu trong 10
  năm** kể từ khi phát hiện. Sự bất đối xứng chính là điểm mấu chốt — tiền phạt hết hiệu lực từ lâu
  trước khi khoản tiền hết hiệu lực.
- **Thiệt hại dây chuyền lấn át tiền phạt**: mất **mức thuế ưu đãi FTA** do sai lệch C/O, bị truy áp
  **thuế chống bán phá giá** hồi tố, và bị gắn cờ **luồng đỏ / rủi ro cao** trong hệ thống quản lý rủi
  ro. (đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/tintuc/vn/thoi-su-phap-luat/tai-chinh/20921/xu-ly-khi-co-khac-biet-ma-so-hs-tren-c-o)

Tại sao điều này định hình v1: chi phí kỳ vọng của một gợi ý sai không phải là khoản phạt 1–2 triệu. Đó
là một cửa sổ truy thu 10 năm cộng với việc phá hủy điều kiện hưởng FTA trên mọi lô hàng trong quá khứ
của mặt hàng đó. Đây là điều khiến cho "top-1, tự động" không thể bảo vệ được ở bất kỳ độ chính xác nào
mà các báo cáo nghiên cứu đưa ra.

## 8. Xác định trước mã số (advance ruling) — Điều 28 Luật Hải quan

Van an toàn dự kiến, và là cơ chế duy nhất tạo ra sự chắc chắn pháp lý ở Việt Nam. (đã xác minh
2026-07-17, nguồn: https://luatvietan.vn/huong-dan-thu-tuc-xac-dinh-truoc-ma-so-hang-hoa.html)

- **Nộp**: đơn mẫu **01/XĐTMS/TXNK** + hồ sơ kỹ thuật (phân tích thành phần, catalogue, ảnh, mẫu hàng),
  **ít nhất 60 ngày trước** khi lô hàng đến.
- **Xử lý**: **30 ngày**, gia hạn đến **60 ngày** đối với các trường hợp phức tạp cần xác minh.
- **Hiệu lực**: **tối đa 3 năm** kể từ ngày ban hành.
- **Căn cứ từ chối**: hồ sơ không đầy đủ; hàng hóa đang chờ một cơ quan khác xác định; mã số đã được
  một cơ quan nhà nước hướng dẫn.
- **Cái bẫy**: kết quả xác định **ngừng áp dụng nếu hàng hóa hoặc chứng từ thực tế khác** với mẫu và tài
  liệu đã nộp. **Nó bảo vệ mặt hàng ĐƯỢC MÔ TẢ, không phải lô hàng.** Một kết quả xác định trong tay
  không phải là tấm khiên nếu quy cách sản phẩm bị lệch — vì vậy phần mô tả của hồ sơ chính là tài sản,
  và đó chính xác là thứ mà AI có thể giúp soạn thảo một cách chính xác.

Chuỗi pháp lý: Luật Hải quan 2014 Điều 28 → Nghị định 08/2015/NĐ-CP (sửa đổi bởi 59/2018/NĐ-CP) → Thông
tư 38/2015/TT-BTC Điều 7 (sửa đổi bởi Thông tư 39/2018/TT-BTC khoản 3 Điều 1). **Thông tư 121/2025/TT-BTC**
(ban hành 18/12/2025, **hiệu lực 01/02/2026**) sửa đổi TT 38/2015 và 39/2018, bao gồm sửa đổi khoản 1
và bổ sung khoản 6 Điều 7 về hồ sơ/mẫu xác định trước, và giới thiệu các mẫu mới **01a-TB XDTMS /
01b-Thay the XDTMS / 01c-Huy XDTMS**. (đã xác minh 2026-07-17, nguồn:
https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-121-2025-TT-BTC-sua-doi-cac-Thong-tu-ve-thu-tuc-hai-quan-giam-sat-hai-quan-633118.aspx
và https://www.pwc.com/vn/vn/publications/news-brief/251223-new-customs-procedures-effective-from-1-february-2026.html)

## 9. Thực tế hành nghề

- **76% doanh nghiệp báo cáo gặp trở ngại trong việc xác nhận mã HS**, tăng từ 66.3% năm 2018. (đã xác
  minh 2026-07-17, nguồn: https://diendandoanhnghiep.vn/ganh-nang-ma-hs-trach-nhiem-cua-co-quan-hai-quan-o-dau-10077631.html)
Ba nghiên cứu điển hình dưới đây là **⚠️ có tính minh họa, không phải sự thật đã được xác lập.** Nghiên
cứu 09 §2 báo cáo chúng **không kèm bất kỳ URL gốc nào**. Chúng mô tả chính xác *hình dạng* của thất
bại và được chứng thực theo hướng phù hợp bởi các báo cáo phàn nàn của doanh nghiệp có nguồn ở trên và
dưới, nhưng các con số, mã, và ngày tháng cụ thể **không được xác minh độc lập ở đây**. Đừng trích dẫn
chúng như sự thật với chủ sở hữu hay trong sản phẩm. (nguồn: nghiên cứu 09 §2; xem §12 dưới đây và
[Quy tắc nghiệp vụ → Chưa xác minh](../business-rules.md#chưa-xác-minh--không-được-dựa-vào))

- **Vụ sữa**: 8 nhà sản xuất (Vinamilk, Hanoimilk, Nutifood…) được cho là đã đối mặt với truy thu hồi
  tố **~700 tỷ VND** sau khi hải quan phân loại lại Mỡ sữa khan (Anhydrous Milk Fat) vào **tháng 12/2014
  từ 0405.90.10 → 0405.90.90**, phá hủy điều kiện hưởng AANZFTA 0% — **áp dụng ngược về các tờ khai năm
  2010**.
- **Polvita**: được cho là **78 tờ khai sạch giai đoạn 2010–2019**, rồi bị phân loại lại đột ngột.
  **Nhật Thiên Kim**: nhiều năm ở 8544.49.49, rồi bị đánh giá lại. Một số doanh nghiệp được cho là đã
  phá sản. Doanh nghiệp hỏi tại sao một quyền lực truy thu hồi tố 5 năm được thiết kế cho gian lận lại
  giáng xuống họ khi *chính hải quan* đã chấp nhận mã số đó trong 5–10 năm.
- **Sự thiếu nhất quán giữa các đơn vị hải quan cho cùng một mặt hàng** là một khiếu nại tái diễn đã
  được ghi nhận. (đã xác minh 2026-07-17, nguồn: https://trungtamwto.vn/hiep-dinh-khac/18495-doanh-nghiep-va-hai-quan-van-co-khuc-mac-ve-ma-hs)

**Hàm ý cần thấm nhuần**: rủi ro không chỉ là "AI chọn sai mã". Mà là **thường không có một câu trả lời
đúng duy nhất ổn định**, và trách nhiệm pháp lý nằm hoàn toàn trên người khai bất kể thế nào. Việc hải
quan đã chấp nhận trong quá khứ không phải là sự bảo vệ. Đó là luận cứ cho việc kiểm toán tính nhất
quán và cho việc định tuyến các mặt hàng có rủi ro cao sang Điều 28 — chứ không phải cho một bộ phân
loại tốt hơn.

## 10. Thay đổi thể chế — cách đánh số văn bản và quy trình xác định trước mới

**Tổng cục Hải quan chấm dứt tồn tại vào 01/03/2025** (Nghị định 29/2025/NĐ-CP, Quyết định 382/QĐ-BTC).
Nay là **Cục Hải quan** thuộc Bộ Tài chính, với **20 Chi cục Hải quan khu vực**. **Các văn bản ban hành
sau ngày đó được đánh số `-CHQ`, không phải `-TCHQ`.** (đã xác minh 2026-07-17, nguồn:
https://xaydungchinhsach.chinhphu.vn/quyet-dinh-382-qd-btc-quy-dinh-chuc-nang-nhiem-vu-quyen-han-va-co-cau-to-chuc-cua-cuc-hai-quan-119250228165530471.htm)

Tại sao đây là một sự kiện của mô hình dữ liệu, không phải chuyện vặt: bất kỳ kho công văn nào cũng bắc
qua điểm gãy này. Việc khử trùng lặp, phân tích trích dẫn, và "tìm hướng dẫn mới nhất về X" đều cần đối
chiếu `-TCHQ` (trước 01/03/2025) với `-CHQ` (sau đó). Một hệ thống truy xuất chỉ biết một tiền tố sẽ
lặng lẽ bỏ sót một nửa kho tài liệu.

**Quyết định 117/QĐ-CHQ (2026)** đặt ra một *Quy trình xác định trước mã số; kiểm tra tên hàng, mô tả,
mã số, mức thuế, đơn vị tính* nội bộ mới, áp dụng từ **~01/02/2026**, xây dựng trên nguyên tắc **mỗi
mặt hàng có đúng một mã HS** và trên một **cơ sở dữ liệu phân loại thống nhất toàn ngành**. (đã xác minh
2026-07-17, nguồn: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Quyet-dinh-117-QD-CHQ-2026-Quy-trinh-Xac-dinh-truoc-ma-so-Kiem-tra-ten-hang-mo-ta-hang-hoa-692998.aspx)
**Cơ sở dữ liệu đó là một hệ thống NỘI BỘ — đừng cho rằng nó sẽ bao giờ được phơi bày ra ngoài.** Lưu ý
mâu thuẫn đáng nêu ra với chủ sở hữu: "mỗi mặt hàng có đúng một mã HS" là một nguyên tắc hành chính, và
§4 của ghi chú này là bằng chứng cho thấy thực tế không tuân theo.

## 11. Khả năng sẵn có của dữ liệu làm bằng chứng phân loại

Việt Nam **không có tương đương với CROSS/EBTI** — không có kho các phán quyết phân loại sạch, đầy đủ,
đọc được bằng máy, có thể truy vấn công khai nào so sánh được với US CBP CROSS hay EU EBTI.

- **Danh pháp là công khai** (TT 31/2022) nhưng được công bố dưới dạng phụ lục Word/PDF; **không có API
  chính thức**. Biểu thuế Excel được lưu hành thương mại. Nghiên cứu 09 §3 mô tả customs.gov.vn là ấn
  phẩm *danh pháp* duy nhất có giá trị pháp lý cho việc khai báo. ⚠️ **Đừng khái quát điều đó cho API
  thuế quan.** Nghiên cứu 10 và 12 nhấn mạnh rằng endpoint không có tài liệu `APIBieuThue` **không có
  thẩm quyền pháp lý — văn bản Nghị định mới có**. Ấn phẩm danh pháp và API tra cứu thuế quan là những
  hiện vật khác nhau trên cùng một tên miền; chỉ cái đầu tiên có giá trị pháp lý. Xem
  [Nguồn dữ liệu](data-sources.md) và [Hệ thống thuế quan](tariff-system.md).
- **Chú giải chi tiết HS (WCO EN)** — EN của WCO **có bản quyền và không thể tải xuống miễn phí**.
- **Thông báo xác định trước mã số**: chỉ được công bố một phần. VNTR
  (`vntr.moit.gov.vn/administrative_rulings`) phản chiếu các phán quyết dưới dạng một **bảng HTML gồm
  các liên kết — không API, không tải hàng loạt, không tập dữ liệu có cấu trúc**, tập mẫu hiển thị là
  ~tháng 9/2021–tháng 1/2022, và nó được ghi rõ ràng là "chỉ dành cho mục đích tham khảo". (đã xác minh
  2026-07-17, nguồn: https://vntr.moit.gov.vn/administrative_rulings)
- **Thông báo kết quả phân loại** (Cục Kiểm định Hải quan, mẫu 04/TBKQPT-PL/2017) đi vào **Customslab**,
  một hệ thống nội bộ có thể tìm kiếm bởi các đơn vị hải quan, không dành cho công chúng. Khối lượng
  nhỏ: **~2,500 mẫu đã xử lý**; nửa đầu 2026 → **257 hồ sơ tiếp nhận, 143 thông báo phân loại được ban
  hành**. (đã xác minh 2026-07-17, nguồn: https://thuehaiquan.tapchikinhtetaichinh.vn/hai-quan-xu-ly-gan-2-500-mam-phan-tich-phan-loai-hang-hoa-xuat-nhap-khau-160924.html)

**Chất lượng truy xuất bị giới hạn bởi khả năng truy cập dữ liệu, không phải bởi mô hình.** Đây là trở
ngại kỹ thuật dữ liệu lớn nhất đối với nửa bằng-chứng của tính năng.

### Cái bẫy phụ lục (từ research 12) — chế độ lỗi mà cả dự án này phải e sợ

Báo cáo 12 đã xây dựng một bảng thuế quan thật 11,874 dòng từ các nguồn `.doc` của Công báo và **lần
phân tích cú pháp ngây thơ đầu tiên báo cáo thành công 94% và đã sai một cách đầy tự tin**: `0301.11.10
→ ['0', '15']`, bởi vì

- **Phụ lục I (BIỂU THUẾ XUẤT KHẨU)** → `0301.11.10 = 0`
- **Phụ lục II (BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI)** → `0301.11.10 = 15`

**1,520 mã HS xuất hiện ở cả hai phụ lục; 1,329 trong số đó có mức thuế khác nhau.** Một bộ phân tích
cú pháp bỏ qua ranh giới phụ lục sẽ trả về mức thuế **xuất khẩu** cho một câu hỏi **nhập khẩu** — một
cách âm thầm, không lỗi, với thành công bề ngoài 94%. (đã xác minh 2026-07-17, nguồn: nghiên cứu 12,
xác minh đối kháng, các hiện vật làm việc nằm trong scratchpad của phiên)

Tại sao nó thuộc về một ghi chú phân-loại-HS: nó là *cùng* một hình dạng thất bại với các dự đoán HS
"Sai nhưng Hợp lệ". **Mối nguy trong loại dự án này không bao giờ là dữ liệu bị thiếu — mà là dữ liệu
sai trông có vẻ hợp lý nhưng báo cáo thành công.** Bất kỳ quá trình nạp TT 31/2022 hay một biểu thuế
nào cũng phải **nhận biết được phụ lục (annex-aware)** và phải mang định danh phụ lục như một khóa hạng
nhất, đúng như bất kỳ đầu ra phân loại nào cũng phải mang cấp độ thẩm quyền và phiên bản danh pháp của
nó.

Báo cáo 12 cũng phát hiện một **khoảng trống thời gian**: các nghị định có thể có hiệu lực pháp lý ngay
ngày ký (NĐ 72/2026, ký và có hiệu lực 09/03/2026) trong khi xuất hiện dưới dạng đọc-được-bằng-máy trên
Công báo **15–48 ngày sau đó**, và một số **hết hạn và lặng lẽ đảo ngược** (NĐ 72/2026 chỉ có hiệu lực
đến 30/04/2026). Trong cửa sổ đó, luật ràng buộc chỉ tồn tại công khai dưới dạng một bản scan 200-DPI.
Xem các ghi chú thuế-quan/nguồn-dữ-liệu trong thư mục này để có phần xử lý đầy đủ — đó là chủ đề của
chúng, không phải của ghi chú này.

## 12. Chưa xác minh / Không được dựa vào

Được tái tạo nguyên văn về mặt tinh thần từ nghiên cứu 09 và 12. Đừng "tẩy rửa" chúng thành các khẳng
định đầy tự tin.

- **Các nghiên cứu điển hình thực thi pháp luật trong §9 — vụ sữa (~700 tỷ VND, AMF 0405.90.10 →
  0405.90.90, tháng 12/2014, hồi tố về 2010), Polvita (78 tờ khai sạch 2010–2019), Nhật Thiên Kim
  (8544.49.49), "một số doanh nghiệp đã phá sản."** Nghiên cứu 09 §2 báo cáo tất cả những điều này
  **không kèm URL gốc cho từng vụ**. Chúng được chứng thực theo hướng phù hợp bởi các báo cáo phàn nàn
  của doanh nghiệp có nguồn riêng (con số 76%, và khiếu nại về sự thiếu nhất quán giữa các đơn vị hải
  quan), nhưng các **con số, mã HS, và ngày tháng cụ thể không được xác minh độc lập**. Chúng có chỗ
  đứng như là minh họa cho hình dạng thất bại. **Đừng trích dẫn 700 tỷ như một con số đã được xác lập**,
  và đừng đưa những vụ này vào sản phẩm. Cũng xem
  [Quy tắc nghiệp vụ → Chưa xác minh](../business-rules.md#chưa-xác-minh--không-được-dựa-vào), nơi đi đến cùng
  một kết luận.
- **"Claude 3.5 Sonnet và GPT-4 đạt ~80% ở 6 chữ số và >90% ở 2 chữ số."** Nổi lên trong một đoạn trích
  tìm kiếm **không có nguồn gốc có thể truy vết**, và nó **mâu thuẫn với HSCodeComp** (GPT-5 chỉ LLM:
  29.0% ở 10 chữ số, ~82% ở 2 chữ số). **Đừng dựa vào nó.**
- **"1 trên 3 tờ khai hải quan bị phân loại sai; hàng chục tỷ tiền thuế bị nộp sai."** Xuất hiện trên
  các blog của nhà cung cấp **không có trích dẫn gốc**. Hợp lý theo hướng, nhưng **không có nguồn**.
- **Chi tiết Quyết định 117/QĐ-CHQ (2026)** — nghiên cứu 09 không thể lấy được toàn văn (bị chặn/403).
  Hãy coi các chi tiết quy-trình-phán-quyết trong §10 là **độ tin cậy trung bình**.
- **Một sửa đổi Luật Hải quan tiếp theo đã được trình lên UBTVQH vào 15/7/2026** — khung pháp lý đang
  **biến động**; §7–§8 có thể thay đổi.
- **Quy trình Agentic Tất định (arXiv:2605.14857)** là một **bản tiền ấn năm 2026, chưa được bình
  duyệt**.
- Benchmark của nhà cung cấp (arXiv:2412.14179) là **nhỏ (n=103) và đặc thù US-HTS**. Nó không chuyển
  giao sạch sẽ sang AHTN 8 chữ số của Việt Nam.
- **TRANH CÃI / CHƯA GIẢI QUYẾT — API customs.gov.vn.** Nghiên cứu 10 báo cáo phát hiện một API
  customs.gov.vn; **nghiên cứu 12 mâu thuẫn một phần với nó**. Báo cáo 12 xác minh rằng `/scripts/main.js`
  hardcode một backend JSON tại `http://123.30.210.236:8080/hqcustomsapi/` — một IP thô qua HTTP trần
  trên cổng 8080, bao gồm một endpoint `.../hqcustomsapi/captcha/CheckCaptcha`, nên **ít nhất một phần
  của cổng thông tin bị chặn bởi CAPTCHA** — nhưng **IP đó đã hết thời gian chờ (timed out)** từ môi
  trường nghiên cứu, và báo cáo 12 nói rõ rằng nó **không thể phân biệt được giữa chặn theo địa lý
  (geo-fencing) và chặn lối ra của sandbox** và do đó **không** khẳng định là không thể tiếp cận. Lập
  trường thêm của báo cáo 12 là ngay cả khi tiếp cận được thì nó cũng là một công cụ *tra cứu* chứ
  không phải xuất hàng loạt, việc liệt kê ~11k mã qua một endpoint không có tài liệu, được che bởi
  CAPTCHA trên một IP thô là mong manh và đối kháng, và **nó không mang thẩm quyền pháp lý — Nghị định
  mới có**. **Cả hai lập trường đều đứng vững. Xung đột chưa được giải quyết.** Đừng lập kế hoạch phụ
  thuộc vào API này mà chưa tái lập được khả năng tiếp cận từ Việt Nam.

## Kiến thức liên quan

- [Bối cảnh dự án](../project-context.md) — Customs Assistant là gì, nó phục vụ ai, phạm vi v1.
- [Quy tắc nghiệp vụ](../business-rules.md) — nơi các chính sách bền vững và quy tắc kiểm tra hợp lệ cho
  hợp đồng gợi-ý-ứng-viên thuộc về.
- [Quy tắc Agent](../AGENTS.md) — các quy ước về tài liệu và ghi chú mà file này tuân theo.
- [Chỉ mục Bộ nhớ Agent](../index.md) — bản đồ điều hướng cho bộ nhớ bền vững.
- Các ghi chú anh em trong thư mục `concepts/` này bao quát cấu trúc biểu thuế, các nguồn dữ liệu thuế
  quan và mô hình thời gian của chúng, và kho văn bản pháp luật Việt Nam. Ghi chú này cố ý dừng lại ở
  cái bẫy phụ lục (§11) và nhường vấn đề dòng-chảy-sửa-đổi cho chúng.
