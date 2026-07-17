---
type: business-rules
status: active
updated: 2026-07-17
related:
  - project-context.md
  - index.md
  - naming-conventions.md
  - architecture-decisions/README.md
  - planning/01-task-list.md
---

# Quy tắc nghiệp vụ

Đây là xương sống an toàn của **Customs Assistant**. Mỗi quy tắc dưới đây nêu rõ quy tắc, bằng chứng cho nó, và hậu quả của việc phá vỡ nó.

**Đọc phần này trước khi thiết kế bất kỳ tính năng nào chạm tới một mã HS, một mức thuế, hoặc một trích dẫn pháp lý.**

Khung tư duy hợp nhất cả mười hai quy tắc: **chế độ thất bại của sản phẩm này không phải là một sự cố sập, một kết quả rỗng, hay một câu trả lời sai rõ ràng. Đó là một câu trả lời sai nghe hợp lý, được định dạng đúng, được trình bày đầy tự tin, chảy vào một tờ khai hải quan có ràng buộc pháp lý và nổi lên nhiều năm sau dưới dạng một cuộc kiểm tra sau thông quan.** Mọi quy tắc ở đây tồn tại để khiến chế độ thất bại cụ thể đó trở nên bất khả thi hoặc phát ra tiếng động lớn.

Quy ước bằng chứng: mọi khẳng định thực tế đều kèm `(đã xác minh YYYY-MM-DD, nguồn: <URL>)`. Những khẳng định mà nghiên cứu không thể xác minh nằm dưới mục [Chưa xác minh / Không được dựa vào](#chưa-xác-minh--không-được-dựa-vào) — đừng bao giờ nâng chúng lên thành các quy tắc phía trên mà không có xác minh mới.

---

## R1 — Mức thuế quan không bao giờ được sinh ra bởi một LLM

**Quy tắc.** Một mức thuế được truy hồi bằng tra cứu khóa chính xác trong SQL: `(hs_code, schedule, effective_date)` → hàng (row). Không có tìm kiếm embedding, không có độ tương đồng vector, không có sinh ra bởi LLM, không có "hiệu chỉnh" bởi LLM lên một giá trị đã truy hồi, bao giờ nằm trên đường đi giữa bảng thuế và con số người dùng nhìn thấy. AI có thể giúp người dùng *tìm ra khóa nào cần tra cứu*; nó không bao giờ được *tạo ra giá trị*.

**Vì sao.** Tìm kiếm ngữ nghĩa trả về hàng trông giống nhất. Trong một bảng thuế, hàng trông giống nhất gần như luôn là hàng sai — danh mục được cố tình xây dựng từ các dòng anh em gần-giống-hệt nhau, khác nhau bởi một định tố và bởi hàng chục điểm phần trăm. `0405.90.10` và `0405.90.90` cách nhau một chữ số và một mệnh đề, và khoảng cách đó được báo cáo là đã trị giá khoảng 700 tỷ VND (xem [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng) — con số này mang tính minh họa, chưa được xác minh độc lập). Độ tương đồng là sai thước đo cho một bảng mà toàn bộ thiết kế của nó là làm cho những thứ giống nhau trở nên khác biệt về mặt pháp lý.

**Hậu quả của việc phá vỡ nó.** Một mức thuế sai đi một lượng nghe hợp lý là vô hình với người dùng, vô hình khi rà soát, và có ràng buộc pháp lý một khi đã khai. Người khai nộp truy thu + phạt + lãi 0.03%/ngày. Xem [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng) để biết biểu chi tiết.

**Bằng chứng.** Toàn bộ bảng MFN có thể lấy được ở dạng văn bản máy đọc được — 11.874 mã HS 8 chữ số duy nhất, 11.160 (94,0%) có mức thuế, trích xuất từ 14 phần `.doc` trên Công báo của Nghị định 26/2023/NĐ-CP (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm). Không có lý do biện minh về tính sẵn có của dữ liệu để sinh ra một mức thuế. Tra cứu tất định là sẵn có; hãy dùng nó.

---

## R2 — Không bao giờ xuất ra một mã HS trần trụi

**Quy tắc.** Hợp đồng đầu ra cho phân loại là: **top-3 ứng viên, bắt đầu ở cấp nhóm 4 chữ số, mỗi cái mang bằng chứng chú giải chương/phần nguyên văn, do một con người quyết định.** Không bao giờ là một con số 8 chữ số trần trụi đơn lẻ. Không bao giờ diễn giải một chú giải pháp lý — hãy trích dẫn nó.

**Vì sao — khoảng trống nằm ở hợp đồng đầu ra, không phải năng lực mô hình.** Đây là phát hiện thực nghiệm chịu lực nhất trong toàn bộ dự án:

| Hệ thống | Độ chính xác 10 chữ số | Nguồn |
|---|---|---|
| Chuyên gia con người | **95.0%** | HSCodeComp |
| Agent tốt nhất (SmolAgent + GPT-5 VLM) | **46.8%** | HSCodeComp |
| Gemini Deep Research | 40.8% | HSCodeComp |
| GPT-5, chỉ LLM, không công cụ | **29.0%** | HSCodeComp |

(đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631 — 632 sản phẩm được chuyên gia chú thích, 27 chương HS, chú thích kép)

Độ chính xác sụp đổ khi đi xuống thứ bậc: **~82% ở 2 chữ số → 29–47% ở 10 chữ số** (cùng nguồn). Giờ đến mặt còn lại:

- **Korea Customs Service**: dự đoán các phân nhóm 6 chữ số, rồi **truy hồi các câu chốt liên quan từ sổ tay HS làm bằng chứng giải thích được** cho mỗi ứng viên. **Độ chính xác top-3 93,9%** trên 925 phân nhóm khó thuộc 5.000 yêu cầu phân loại gần đây, với một nghiên cứu người dùng gồm 32 chuyên gia xác nhận **giảm đáng kể thời gian và công sức rà soát** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2311.10922 · https://dl.acm.org/doi/10.1145/3635158).
- **Deterministic Agentic Workflow** (pipeline cố định, thứ bậc thuế quan như luồng điều khiển, chú giải chương được biên dịch trước ngoại tuyến thành các mệnh đề có kiểu): 4 chữ số **75,0% top-1 / 91,5% top-3**; 6 chữ số **64,2% top-1 / 78,3% top-3** — khoảng gấp 2 lần agent tự chủ tốt nhất trên cùng benchmark (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2605.14857 — bản preprint 2026, **chưa được bình duyệt**).

**47% → 93,9% không phải là một nâng cấp mô hình. Đó là một hợp đồng đầu ra khác.** Top-1 tự chủ và top-3-kèm-bằng-chứng-cho-con-người là hai sản phẩm khác nhau, và chỉ một trong hai hoạt động.

**Hai phát hiện giết chết các "cải tiến" hiển nhiên:**
- **Test-time scaling không giúp ích.** Bỏ phiếu đa số và tự phản ánh (self-reflection) cho lợi ích không đáng kể — khác với các lĩnh vực suy luận khác.
- **Cung cấp cho mô hình các quy tắc quyết định do con người viết một cách tường minh lại *giảm* hiệu năng đối với hầu hết các hệ thống.** Nhồi thêm quy tắc vào prompt ≠ tốt hơn. (cả hai đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631)

Đừng "sửa" độ chính xác bằng cách nhồi danh mục vào prompt hoặc bỏ phiếu trên nhiều mẫu. Câu trả lời đã đo được là: thay đổi hợp đồng.

**Hậu quả của việc phá vỡ nó.** Một mã trần trụi là một câu trả lời, và một câu trả lời chuyển giao trách nhiệm trong tâm trí người dùng trong khi không chuyển giao gì về mặt pháp lý. "Một công cụ AI tạo ra một con số mười chữ số trông hợp lý không phải là sự cẩn trọng hợp lý"; nhà nhập khẩu chịu trách nhiệm và nhà cung cấp không gánh gì — "nền tảng đã báo tôi mã HS" không phải là một biện hộ (đã xác minh 2026-07-17, nguồn: https://internationaltradematters.com/discussion/ai-customs-compliance-for-smes/ · https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/).

**Hệ luận — bằng chứng CHÍNH LÀ sản phẩm.** Cái mà nghiên cứu KCS chứng minh là mang lại giá trị không phải dự đoán, mà là **truy hồi bằng chứng**. Chú giải Chương / Chú giải Phần / đoạn EN / mục SEN / công văn nguyên văn cũng là hiện vật duy nhất có thể bảo vệ được khi một Chi cục Hải quan khu vực chất vấn mã số — nó trở thành hồ sơ. Trích dẫn nó; đừng bao giờ diễn giải nó.

**Thứ bậc thẩm quyền mà bằng chứng phải tôn trọng** (đã xác minh 2026-07-17, nguồn: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/guide/legal-notes-legales-eng.html · https://taxation-customs.ec.europa.eu/customs/common-customs-tariff-cct/tariff-classification-goods/harmonized-system_en):
- **Ràng buộc**: văn bản nhóm/phân nhóm + Chú giải Phần, Chương và Phân nhóm ("Legal Notes"). GRI 1 — tiêu đề chỉ để tham khảo.
- **Không ràng buộc nhưng có thẩm quyền**: WCO Explanatory Notes (EN) và Compendium of Classification Opinions.
- **Tầng ASEAN**: SEN (Supplementary Explanatory Notes) cho AHTN 8 chữ số, được lưu hành tại Việt Nam bởi **Công văn 3866/TCHQ-TXNK (24/07/2023)** (đã xác minh 2026-07-17, nguồn: https://thuvienxuatnhapkhau.com/wp-content/uploads/2023/07/3866_Chu-giai-SEN-2022.pdf). **SEN không tự nó ràng buộc độc lập** — một lập luận dựa trên SEN mà mâu thuẫn với HS EN thì yếu về mặt pháp lý.

Một bảng bằng chứng viện dẫn một mục SEN với cùng trọng lượng thị giác như một Chú giải Chương ràng buộc là trình bày sai luật. Hãy xếp hạng bằng chứng theo thẩm quyền, một cách hiển thị.

---

## R3 — "Error but Valid" là chế độ thất bại đặc trưng

**Quy tắc.** Thiết kế mọi bề mặt phân loại trên giả định rằng một câu trả lời sai trông y hệt một câu trả lời đúng. Không có ngoại lệ nào để bắt, không có lỗi phân tích cú pháp nào, không có cờ đỏ nào, không có tín hiệu độ tin cậy nào tương quan với kết quả pháp lý. Bất kỳ thiết kế nào dựa vào "chúng ta hẳn sẽ nhận ra nếu nó sai" đều vô hiệu.

**Vì sao.** Bảng phân loại lỗi của HSCodeComp thấy rằng lỗi phần lớn là **"Error but Valid"** — mô hình đưa ra một mã HS thật, trông hợp pháp mà lại sai. **Không có tín hiệu cú pháp nào của sự thất bại** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631). Mã sai chảy thẳng vào VNACCS, được chấp nhận, được thông quan — và nổi lên nhiều năm sau dưới dạng một cuộc kiểm tra sau thông quan. **Độ tự tin của AI không tương quan với kết quả pháp lý cuối cùng, và sự thất bại là âm thầm và trì hoãn.**

Sáu chế độ thất bại được ghi nhận, tất cả đều tạo ra đầu ra trông hợp lệ: quyết định vội vàng; xử lý sai thông tin (mất chi tiết sản phẩm trong ngữ cảnh dài); tự-hiệu-chỉnh không cần thiết (tự nói mình ra khỏi một câu trả lời đúng); ảo giác suy luận (các chuỗi hợp lý-nhưng-sai); áp dụng sai quy tắc (dùng sai GRI trên văn bản mơ hồ); khoảng trống kiến thức lĩnh vực (vd gọi silicone là "cao su") (cùng nguồn).

**Hậu quả của việc phá vỡ nó — biểu chi tiết mức phạt.** Nghị định 128/2020/NĐ-CP, sửa đổi bởi 102/2021/NĐ-CP (đã xác minh 2026-07-17, nguồn: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-8 · https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-9):

| Tình huống | Hậu quả |
|---|---|
| Sai HS, **không ảnh hưởng thuế** | **1–2 triệu VND** (Điều 8 khoản 1) |
| Sai HS → thiếu thuế, **tự phát hiện** & khai bổ sung trong các thời hạn của Điều 9 khoản 2 | **10%** của phần thiếu |
| Sai HS → thiếu thuế, **bị hải quan phát hiện** | **20%** của phần thiếu (Điều 9 khoản 3) |
| Bị coi là **trốn thuế** (Điều 14) | **1× đến 3×** số thuế trốn; có thể chuyển hồ sơ hình sự |
| Tất cả những điều trên | **Truy thu** toàn bộ phần thiếu + lãi chậm nộp **0.03%/ngày** |

Ngoài ra: không phạt nếu chênh lệch thuế dưới **500.000đ (cá nhân) / 2.000.000đ (tổ chức)**; **giảm 50%** khi người khai tự phát hiện và nộp khai bổ sung muộn (Điều 8 khoản 6); **thời hiệu 5 năm cho xử phạt hành chính, nhưng thuế + lãi có thể truy thu trong 10 năm kể từ khi phát hiện** (cùng nguồn).

**Lưu ý sự bất đối xứng định hình sản phẩm:** tự phát hiện là 10%, hải quan phát hiện là 20%, và một dấu vết giấy tờ xấu là 100–300%. Giá trị của sản phẩm nằm không cân xứng ở việc *tìm ra lỗi trước khi hải quan tìm ra* — đó là lý do vì sao kiểm toán tính nhất quán (đánh dấu nơi các tờ khai lịch sử của chính một công ty dùng mã khác nhau cho cùng một hàng hóa) là một tính năng hạng nhất, không phải một thứ có-thì-tốt.

**Thiệt hại dây chuyền lấn át tiền phạt:** mất ưu đãi thuế FTA khi C/O lệch, bị áp thuế chống bán phá giá hồi tố, và bị đánh dấu **luồng đỏ / rủi ro cao** trong hệ thống quản lý rủi ro (đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/tintuc/vn/thoi-su-phap-luat/tai-chinh/20921/xu-ly-khi-co-khac-biet-ma-so-hs-tren-c-o).

**Trường hợp làm nó cụ thể — vụ sữa.** Tám nhà sản xuất (Vinamilk, Hanoimilk, Nutifood…) đối mặt truy thu hồi tố khoảng **~700 tỷ VND** sau khi hải quan phân loại lại Anhydrous Milk Fat vào tháng 12/2014 từ **0405.90.10 → 0405.90.90**, phá hủy tính đủ điều kiện AANZFTA 0% — **áp ngược về các tờ khai từ 2010**. (nguồn: research 09 §2; báo cáo không kèm URL sơ cấp theo từng vụ — xem [Chưa xác minh](#chưa-xác-minh--không-được-dựa-vào)). Liên quan: **Polvita** — 78 tờ khai sạch 2010–2019, rồi bị phân loại lại đột ngột. **Nhật Thiên Kim** — nhiều năm ở 8544.49.49, rồi bị đánh giá lại. Một số doanh nghiệp phá sản. Doanh nghiệp hỏi vì sao quyền hồi tố 5 năm, thiết kế cho gian lận, lại đổ lên họ khi *chính hải quan* đã chấp nhận mã đó trong 5–10 năm (đã xác minh 2026-07-17, nguồn: https://diendandoanhnghiep.vn/ganh-nang-ma-hs-trach-nhiem-cua-co-quan-hai-quan-o-dau-10077631.html).

**76% doanh nghiệp** báo cáo trở ngại khi xác nhận mã HS, tăng từ 66,3% năm 2018 (cùng nguồn). Sự thiếu nhất quán giữa các đơn vị hải quan cho cùng một hàng hóa là một than phiền được ghi nhận lặp đi lặp lại (đã xác minh 2026-07-17, nguồn: https://trungtamwto.vn/hiep-dinh-khac/18495-doanh-nghiep-va-hai-quan-van-co-khuc-mac-ve-ma-hs).

**Hàm ý sâu nhất.** Rủi ro không chỉ là "AI chọn mã sai". Mà là **thường không có một câu trả lời đúng đơn lẻ ổn định nào, và trách nhiệm pháp lý hoàn toàn đè lên người khai bất kể thế nào.** Trong một cuộc kiểm toán 226 bất đồng của HSCodeComp, **~42,5% dự đoán "sai" của mô hình lại được HS rules hậu thuẫn tốt hơn dữ liệu chuẩn (ground truth) được công bố** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2605.14857). Tối ưu hóa cho sự đồng thuận với hải quan là mục tiêu đúng về mặt thương mại — nhưng nó không giống với việc đúng, và sản phẩm không được nhập nhằng hai điều đó.

---

## R4 — Không bao giờ đưa mã HS ưa thích của người dùng vào prompt như một tiền đề

**Quy tắc.** Mã HS mong muốn/kỳ vọng/lịch sử của người dùng không bao giờ được đưa vào một prompt phân loại như ngữ cảnh, gợi ý, tiền đề, hay "để tham khảo". Đầu vào phân loại là **mô tả hàng hóa và các dữ kiện kỹ thuật mà thôi**. Nếu người dùng cung cấp một mã ưa thích, hãy giữ nó **bên ngoài** đường đi phân loại và chỉ dùng nó **về sau**, như một mục tiêu so sánh ("mã X của bạn có / không nằm trong số các ứng viên được bằng chứng hậu thuẫn").

**Vì sao.** LLM là một luật sư biện hộ nịnh hót (sycophantic advocate), không phải một thẩm phán. Nguyên văn từ những người hành nghề:

> "nếu bạn muốn HTS của mình là X (dù HTS đúng là Y), AI sẽ đưa cho bạn một lập luận (hoặc ba) để hậu thuẫn HTS ưa thích của bạn"

(đã xác minh 2026-07-17, nguồn: https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/)

Đây là chế độ thất bại mà một LLM *dễ mắc nhất* và cũng là chế độ có **hậu quả pháp lý tồi tệ nhất** — nó không chỉ tạo ra một mã sai, mà **chế tác ra lập luận thành văn giải thích vì sao người khai đã chọn nó**. Hiện vật đó chính xác là thứ biến một vụ "sai HS → thiếu 20%" thành một sự đánh giá **trốn thuế** ở mức **1×–3× số thuế trốn cộng chuyển hồ sơ hình sự** (xem [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng)). Công cụ khi đó sẽ đang tạo ra chứng cứ cho bên công tố.

**Hậu quả của việc phá vỡ nó.** Sản phẩm trở thành một cỗ máy sản xuất các dấu vết giấy tờ tự buộc tội mình. Đây là kết cục tồi tệ nhất có sẵn trong không gian thiết kế — tồi tệ hơn cả việc sai, bởi vì sai là 20% còn cái này là 300% cộng chuyển hồ sơ.

**Các thiên lệch liên quan, cùng gốc rễ** (cùng nguồn):
- **Phân loại theo chức năng vs theo lời** — một "đồng hồ có radio" về mặt pháp lý có thể là một "radio có đồng hồ". LLM khớp mẫu mô tả, không phải chức năng.
- **Sụp đổ tính mơ hồ** — một đồng hồ thông minh theo dõi sức khỏe là một chiếc đồng hồ, một thiết bị y tế, hay một thiết bị truyền thông tùy vào cách diễn giải pháp lý; "AI sẽ chọn khớp 'khả dĩ nhất', mà rất có thể là khớp sai."

---

## R5 — Từ chối trả lời (abstention) là một thành công hạng nhất

**Quy tắc.** "Hai nhóm này đều khả dĩ áp dụng; đây là các chú giải đối chọi nhau; việc này cần **xác định trước mã số** theo Điều 28 Luật Hải quan" là một đầu ra **đúng, thành công, có thể giao được** cho một hàng hóa khó. Định tuyến sang quy trình xác định trước là một **tính năng**. Chỉ số, giao diện, và các cuộc rà soát phải coi việc từ chối trả lời (abstention) là một thắng lợi, không bao giờ là độ bao phủ bị mất.

**Vì sao.** Đối với hàng hóa rủi ro cao, **xác định trước mã số theo Điều 28 Luật Hải quan 2014 là cơ chế duy nhất tạo ra sự chắc chắn về pháp lý tại Việt Nam** (nguồn: research 09 §2; chi tiết thủ tục đã xác minh 2026-07-17, nguồn: https://luatvietan.vn/huong-dan-thu-tuc-xac-dinh-truoc-ma-so-hang-hoa.html). Không đầu ra AI nào có trọng lượng pháp lý; một quyết định xác định trước thì có. Một công cụ trả lời tự tin ở nơi luật thực sự chưa ngã ngũ không hữu ích hơn một công cụ từ chối trả lời — nó *kém* hữu ích hơn, bởi vì nó ức chế hành động duy nhất thực sự giải quyết được rủi ro.

Từ chối trả lời (abstention) cũng là thiết kế được thực nghiệm hậu thuẫn trong legal RAG lân cận: một cổng tương đồng trước-khi-sinh cộng một kiểm tra bằng chứng sau-khi-sinh, trả về `Unknown Answer` khi thất bại, là bản thiết kế đã công bố (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf — SBV-LawGraph Algorithm 2; nghiên cứu đơn lẻ).

**Các dữ kiện về xác định trước mà sản phẩm phải mã hóa** (đã xác minh 2026-07-17, nguồn: https://luatvietan.vn/huong-dan-thu-tuc-xac-dinh-truoc-ma-so-hang-hoa.html; khung: Luật Hải quan 2014 Điều 28; Nghị định 08/2015/NĐ-CP sửa đổi bởi 59/2018/NĐ-CP; Thông tư 38/2015/TT-BTC Điều 7 sửa đổi bởi Thông tư 39/2018/TT-BTC):

- **Hồ sơ**: Đơn mẫu **01/XĐTMS/TXNK** + hồ sơ kỹ thuật (phân tích thành phần, catalogue, ảnh, mẫu hàng), **ít nhất 60 ngày trước** lô hàng.
- **Xử lý**: **30 ngày**, gia hạn đến **60 ngày** cho các trường hợp phức tạp cần xác minh.
- **Hiệu lực**: **tối đa 3 năm** kể từ khi ban hành.
- **Căn cứ từ chối**: hồ sơ không đầy đủ; hàng hóa đang chờ một cơ quan khác xác định; mã đã được một cơ quan nhà nước hướng dẫn.
- **Cái bẫy**: quyết định xác định trước **ngừng áp dụng** nếu hàng hóa/chứng từ thực tế khác với các mẫu và tài liệu đã nộp. **Nó bảo vệ hàng hóa được *mô tả*, không phải *lô hàng*.** Bất kỳ giao diện nào nói "bạn có quyết định xác định trước, bạn an toàn" đều sai.

**Hệ luận — hiển thị bất đồng, đừng che giấu nó.** Nơi các công văn hải quan xung đột — và chúng có xung đột; đó chính là bản chất của than phiền 76% — **hãy hiển thị cả hai**. Che giấu xung đột sau một câu trả lời đơn lẻ tự tin là thiết kế gây hại chủ động (nguồn: research 09 §5).

**Nơi AI rõ ràng thắng thế, không có tranh cãi về độ chính xác** — đây là các tính năng tương thích với từ chối trả lời (abstention) cần xây dựng (nguồn: research 09 §5):
- Truy hồi các chú giải chương/phần và loại trừ liên quan cho một hàng hóa — công việc thủ công thực sự khó, và là một **bài toán truy hồi**, nơi công nghệ mạnh.
- Tìm các công văn / thông báo xác định trước mã số của Việt Nam trước đó cho hàng hóa tương tự — hiện gần như bất khả thi thủ công vì kho văn bản không được index.
- **Kiểm toán tính nhất quán** — đánh dấu nơi các tờ khai lịch sử của chính một công ty phân kỳ cho cùng một hàng hóa. Đây là kịch bản Polvita, và nó có thể phát hiện được *trước* cuộc kiểm toán.
- Soạn thảo hồ sơ xác định trước mã số (mẫu 01/XĐTMS/TXNK) với mô tả kỹ thuật và lập luận pháp lý được lắp ráp sẵn.
- Theo dõi các trường hợp lệch HS giữa FTA/C/O.

---

## R6 — Một mức thuế không bao giờ là một scalar; nó là một tuyên bố có điều kiện kèm ngày as-of

**Quy tắc.** Mô hình dữ liệu không bao giờ được chứa một cột có nghĩa là "mức thuế trên hàng hóa này". `(HS, country) → rate` **thậm chí không phải là một hàm.** Mỗi mức thuế là một tuyên bố có điều kiện mang theo các điều kiện của nó, biểu thuế của nó, phụ lục của nó, các cờ trạng thái của nó, và ngày as-of của nó. Bác bỏ bất kỳ schema, phản hồi API, hay chuỗi giao diện nào làm phẳng nó.

**Vì sao — các điều kiện đã xác minh, mỗi cái độc lập phá vỡ mô hình scalar** (tất cả đã xác minh 2026-07-17 từ văn bản nghị định lấy qua Công báo, nguồn: research 12 §6; RCEP = Nghị định 129/2022/NĐ-CP, https://congbao.chinhphu.vn/):

1. **MFN vs FTA là có điều kiện, không tự động.** RCEP Điều 4 yêu cầu quy tắc xuất xứ **cộng với một chứng nhận xuất xứ hợp lệ**. "Thuế là 0%" là **sai**. "**0% nếu bạn giữ một C/O hợp lệ, nếu không thì 15% MFN**" là đúng. C/O là một chứng từ mà người dùng có thể có hoặc không; công cụ không thể biết, nên phải trình bày cả hai nhánh.
2. **RCEP Điều 6.2 có quy tắc mức thuế cao nhất.** Đã xác minh nguyên văn trong văn bản nghị định: *"Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."* — với một số hàng hóa đa xuất xứ nhất định, mức thuế áp dụng là mức **cao nhất** trên các phụ lục quốc gia. Đây là lý do vì sao `(HS, country) → rate` không phải là một hàm: câu trả lời phụ thuộc vào *tập* các xuất xứ, không phải vào một xuất xứ.
3. **`*` nghĩa là LOẠI TRỪ, không phải zero.** 54 ô `*` được tìm thấy chỉ trong một số Công báo RCEP đơn lẻ. Một parser ép `*` thành 0 (hoặc thành null-rồi-0 ở hạ nguồn) bịa ra một ưu đãi 0% không hề tồn tại.
4. **Hàng TRQ phụ thuộc trạng thái hạn ngạch.** Các nhóm **04.07, 17.01, 24.01, 25.01** (đã xác minh trong văn bản ND 129). Mức thuế ngoài hạn ngạch nằm ở một **phụ lục khác** (ND 26/2023 Phụ lục IV). Trong-hạn-ngạch vs ngoài-hạn-ngạch là một dữ kiện về phân bổ hạn ngạch của nhà nhập khẩu, không phải về mã HS.
5. **Thuế tuyệt đối/hỗn hợp là số tiền USD, không phải phần trăm.** Xe đã qua sử dụng, ND 26/2023 **Phụ lục III**. Phân tích cú pháp đối kháng tìm thấy **0 hàng** ở đó với regex `%` — phụ lục có cấu trúc khác về bản chất, và một schema kiểu `%` âm thầm bỏ mất nó.
6. **Các mã đặc biệt Chương 98** (vd 98.49 linh kiện ô tô) mang theo các điều kiện đủ-điều-kiện-chương-trình, không chỉ mức thuế.
7. **Thuế quan thường là con số ít quan trọng nhất.** Thuế chống bán phá giá/tự vệ là theo từng quốc gia và nằm trong **Quyết định của Bộ Công Thương — không nằm trong bất kỳ Nghị định nào cả**. Với truy vấn nguyên mẫu "thép từ Trung Quốc", bảng thuế quan là đầu vào *ít* quan trọng nhất. Người khai còn cần **VAT + TTĐB + BVMT**, vốn là các sắc thuế hoàn toàn riêng biệt (xem [R12](#r12--ttđb-và-bvmt-không-dựa-trên-hs-trong-luật)).

**Hậu quả của việc phá vỡ nó.** Mỗi điều trong số này tạo ra một con số *tự tin, định dạng đẹp, sai*. Một người dùng được bảo "0%" nhưng thiếu một C/O hợp lệ sẽ nộp thiếu toàn bộ mức MFN và rơi vào [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng).

**Chỉ thị thiết kế.** Mô hình hóa biểu thuế, phụ lục, khoảng hiệu lực, và các cờ trạng thái (`excluded`, `trq_in`, `trq_out`, `absolute_duty`, `co_required`) như các **cột hạng nhất**. Đầu ra v1 cho một mức thuế là một *tập các nhánh có điều kiện với các điều kiện được nêu rõ*, không phải một con số.

---

## R7 — Mọi câu trả lời viện dẫn nghị định và ngày chụp dữ liệu, và từ chối khi ảnh chụp có thể lỗi thời

**Quy tắc.** Không mức thuế nào được hiển thị mà không có (a) nghị định mà nó đến từ đó và (b) ngày chụp ảnh (snapshot). Khi ngày hiện tại rơi vào một cửa sổ nơi snapshot có thể tụt hậu so với luật đang có hiệu lực, hệ thống **từ chối hoặc cảnh báo lớn tiếng** — nó không âm thầm phục vụ giá trị cuối-cùng-được-biết.

**Vì sao — khoảng trống công báo là có thật, đo được, và không thể đóng lại bằng bất kỳ lịch crawl nào** (tất cả đã xác minh 2026-07-17, nguồn: research 12 §3; https://congbao.chinhphu.vn/):

- **Nghị định 72/2026/NĐ-CP** được **ký 09/03/2026 và có hiệu lực cùng ngày** ("kể từ ngày ký") — xăng/naphtha/reformate **10% → 0%**. **Không có thời gian chuẩn bị.**
- Nó được đăng trong **Công báo số 157 ngày 24/03/2026 — 15 ngày *sau khi* nó đã là luật ràng buộc.**
- Các độ trễ tương đương: ND 26/2023 ký 31/05/2023, đăng công báo 19/06/2023 (~19 ngày). EVFTA ND 116/2022 ký 30/12/2022, đăng công báo từ 16/02/2023 (~48 ngày).

**Trong cửa sổ đó, mức thuế đang có hiệu lực về mặt pháp lý tồn tại ở dạng máy đọc được KHÔNG Ở ĐÂU CẢ.** Nó chỉ tồn tại như một bản quét bitonal 200-DPI trên chinhphu.vn — chuỗi producer `Kodak Alaris Inc.`, đúng một ảnh bilevel `/CCITTFaxDecode` mỗi trang, ảnh trang 1666×2329 px, và `26-nd-2.pdf` chứa **không có đối tượng `/Font` nào: không hề có tầng văn bản** trên 1.016 trang được quét (đã xác minh 2026-07-17, nguồn: https://datafiles.chinhphu.vn/cpp/files/vbpq/2023/6/26-nd.signed.pdf · https://datafiles.chinhphu.vn/cpp/files/vbpq/2023/6/26-nd-2.pdf).

**Không lịch crawl nào có thể đóng một khoảng trống nơi nguồn còn chưa tồn tại.** Đây không phải một bài toán kỹ thuật để tối ưu; đó là một thuộc tính của hệ thống pháp luật. Phản ứng trung thực duy nhất là *biết khoảng trống tồn tại và nói ra*.

**Hậu quả của việc phá vỡ nó.** Tờ khai hải quan có ràng buộc pháp lý. Một mức thuế lỗi thời nghĩa là nộp thiếu → bị đánh giá lại, phạt, và **người khai, không phải nhà cung cấp AI, gánh trách nhiệm** ([R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng)).

**Khung tư duy cần nội hóa** (nguồn: research 12, kết luận):

> "Đây không phải một bài toán crawl rồi tan vào một cơ sở dữ liệu. Đó là một **bài toán tính-thời-sự-pháp-lý khoác trang phục kỹ thuật dữ liệu.**"

Bảng cơ sở là một công việc một-lần vài giờ. Giữ cho đúng là vô hạn, đối kháng, và vĩnh viễn tụt hậu — và mỗi khoảng trống là một câu trả lời sai có ràng buộc pháp lý trên tờ khai của người khác. Định giá sản phẩm cho phù hợp: **một trợ thủ nghiên cứu hiển thị nguồn của nó, không bao giờ là một cỗ máy trả lời nêu ra một mức thuế.**

**Quy tắc nguồn-chân-lý theo sau.** Công báo `.doc` là nguồn nạp duy nhất (robots.txt = `User-agent: * / Allow: /`, đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/robots.txt). Phân tích cú pháp bằng một parser Word/OOXML thật đọc `w:tbl/w:tr/w:tc` — **không phải** `textutil`. Xem [R9](#r9--ranh-giới-phụ-lục-là-chịu-lực) và [Chưa xác minh](#chưa-xác-minh--không-được-dựa-vào).

---

## R8 — Đừng bao giờ mô hình hóa "phiên bản mới nhất"

**Quy tắc.** Mô hình thời gian là **nhận biết ngày-hiệu-lực/ngày-hết-hạn**, với các khoảng valid-time làm bộ lọc cứng: `valid_start ≤ as_of < coalesce(valid_end, +∞)`. Không có cột "mức thuế hiện tại". "Mới nhất" không phải là một khái niệm mà hệ thống này có.

**Vì sao — các nghị định hết hạn và âm thầm quay ngược lại.** **ND 72/2026 chỉ có hiệu lực đến 30/04/2026 — một cửa sổ 52 ngày — sau đó mức thuế quay về ND 26/2023** (đã xác minh 2026-07-17, nguồn: research 12 §3). Một thiết kế "cào bản mới nhất" không có khái niệm hết-hạn-và-quay-ngược. **Nó sẽ phục vụ xăng 0% mãi mãi.** Lưu ý hình dạng của sự thất bại đó: không có gì báo lỗi, không có gì 404, không có văn bản mới nào xuất hiện để kích hoạt một lần crawl lại. Hệ thống sai vì *không có gì xảy ra*.

**Hậu quả của việc phá vỡ nó.** Sai lầm âm thầm, vĩnh viễn, không-thể-phát-hiện-bằng-giám-sát trên chính những hàng hóa dịch chuyển nhiều tiền nhất.

**Bằng chứng hỗ trợ từ statutory RAG nói chung.** Hai chế độ thất bại thời gian được đo lường trong LLM: áp dụng **quy tắc lỗi thời** sau khi pháp luật thay đổi, và **ưu tiên điều khoản mới hơn ngay cả khi phiên bản cũ mới đúng áp dụng** — một thiên lệch ưa cái mới mà **riêng RAG không sửa được**. Kết quả khả thi: **các cách tiếp cận truy hồi coi hiệu lực thời gian như một *ràng buộc cứng* (bộ lọc, không phải tín hiệu xếp hạng) cải thiện hiệu năng đáng kể** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2605.23497 — 312 cặp hỏi-đáp luật định Đức đã kiểm định, năm LLM lớn). Trích xuất ngày as-of từ truy vấn, rồi **lọc** tập ứng viên. Đừng hy vọng bộ reranker sắp xếp cho ổn.

Kiểm tra quy mô về vì sao điều này quan trọng: trong một kho văn bản Việt Nam thực tế (1.703 văn bản NHNN), **863 hết hiệu lực toàn bộ, 191 hết hiệu lực một phần, 639 còn hiệu lực — ~62% kho văn bản là luật đã chết hoặc chết một phần** (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).

**Chuỗi sửa đổi cần mô hình hóa, không làm phẳng.** ND 26/2023 là nghị định gốc và **chưa** bị thay thế; nó được sửa đổi bởi một chuỗi: **144/2024** (hiệu lực 16/12/2024), **199/2025** (08/07/2025 — phốt pho vàng 5→10% vào 01/01/2026, →15% vào 01/01/2027; TMBP 0% chỉ đến hết 08/2025; các điều kiện khối lượng linh kiện ô tô), **72/2026** (09/03/2026–30/04/2026), cộng các biểu thuế mới **AJCEP và VJEPA** hiệu lực **01/04/2026**, một biểu thuế Việt Nam–Campuchia 2026, và ND 26/2026 (hóa chất) (đã xác minh 2026-07-17, nguồn: research 12 §3 — chuỗi đã xác nhận trực tiếp). **MFN 2026 đúng là một phép hợp thành, không phải một văn bản.** Không có văn bản hợp nhất chính thức nào của biểu thuế được công bố dưới dạng dữ liệu máy đọc được.

**Các thời hạn cứng cần thiết kế cho ngay bây giờ:**
- **HS 2028 có hiệu lực 01/01/2028** (ấn bản WCO thứ 8; các sửa đổi được tạm thời thông qua tại phiên họp HSC thứ 75, tháng 4/2025). **Đừng hardcode AHTN 2022** — mô hình hóa phiên bản HS như một chiều (dimension) có ngày hiệu lực. Tái danh mục hóa (renomenclature) tái-định-cơ-sở các mã HS và làm mồ côi các ánh xạ lịch sử. Danh mục hiện hành là **Thông tư 31/2022/TT-BTC** (hiệu lực 01/12/2022; HS 2022/AHTN 2022; **21 phần · 97 chương · 1.228 nhóm · 4.084 phân nhóm · 11.414 dòng hàng**), vẫn còn hiệu lực năm 2026 (đã xác minh 2026-07-17, nguồn: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx · research 10 §2).
- **Về cơ bản toàn bộ kho văn bản FTA hết hạn 31/12/2027** — khoảng ~17 nghị định ban hành 30/12/2022 (112–129/2022; **128/2022 không phải là nghị định thuế quan — đừng giả định một dải liên tục**) bao trùm 2022–2027, va chạm với việc chuyển đổi AHTN 2028. Thay thế toàn bộ kho văn bản trong một lần, khoảng 18 tháng nữa (đã xác minh 2026-07-17, nguồn: research 10 §3 — nhưng xem [Chưa xác minh](#chưa-xác-minh--không-được-dựa-vào) về suy luận *đồng thời*).
- **Điểm gãy số hiệu văn bản `-TCHQ` → `-CHQ` vào 01/03/2025.** Tổng cục Hải quan không còn tồn tại; nó là **Cục Hải quan** thuộc Bộ Tài chính, với **20 Chi cục Hải quan khu vực** (Nghị định 29/2025/NĐ-CP, Quyết định 382/QĐ-BTC) (đã xác minh 2026-07-17, nguồn: https://xaydungchinhsach.chinhphu.vn/quyet-dinh-382-qd-btc-quy-dinh-chuc-nang-nhiem-vu-quyen-han-va-co-cau-to-chuc-cua-cuc-hai-quan-119250228165530471.htm). Bất kỳ parser số-hiệu-văn-bản hay bộ định dạng trích dẫn nào cũng phải xử lý được cả hai thời kỳ.

---

## R9 — Ranh giới phụ lục là chịu lực

**Quy tắc.** Mỗi hàng thuế được phân tích ra đều mang danh tính phụ lục của nó (`Phụ lục I` = xuất khẩu, `Phụ lục II` = nhập khẩu MFN, `Phụ lục III` = tuyệt đối/hỗn hợp, `Phụ lục IV` = ngoài-hạn-ngạch TRQ). Mỗi truy vấn lọc trên nó. Một hàng không có phụ lục thì không được nạp.

**Vì sao — đây là bằng chứng tốt nhất trong cả tập nghiên cứu về việc dự án này trông thế nào khi nó thất bại.** Lần phân tích cú pháp ngây thơ đầu tiên của cuộc điều tra đối kháng **báo cáo thành công 94% và tự tin sai**:

```
0301.11.10 → ['0', '15']
```

Truy vết nó (đã xác minh 2026-07-17, nguồn: research 12 §6, từ các phần `.doc` Công báo của ND 26/2023):
- **Phụ lục I (BIỂU THUẾ XUẤT KHẨU)** → `0301.11.10 = 0`
- **Phụ lục II (BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI)** → `0301.11.10 = 15`

**1.520 mã HS xuất hiện trong cả hai phụ lục. 1.329 trong số đó có mức thuế KHÁC NHAU.** Một parser mù-phụ-lục trả về mức thuế **xuất khẩu** cho một câu hỏi **nhập khẩu** — **âm thầm, không báo lỗi, ở mức thành công biểu kiến 94%.**

**Hậu quả của việc phá vỡ nó.** 1.329 mã tương đương với câu trả lời sai, không phân biệt được với câu trả lời đúng, với một dashboard xanh. Đây là [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng) tái hiện ở tầng dữ liệu: *không phải dữ liệu thiếu, mà là dữ liệu sai trông hợp lý.*

**Một khi nhận biết phụ lục, bảng được kiểm định.** `2710.12.21/.22/.24/.25/.80 = 10%` được trích xuất từ ND 26/2023, và tin tức báo chí độc lập về ND 72/2026 mô tả nó là cắt đúng các mã đó **"từ 10% xuống 0%"** — hai nguồn độc lập đồng thuận về cùng năm mã. Parser là đúng **một khi nó tôn trọng phụ lục** (đã xác minh 2026-07-17, nguồn: research 12 §6).

**Hình dạng phụ lục, cho schema** (đã xác minh 2026-07-17, nguồn: research 12 §1):

| Phụ lục | Nội dung | HS duy nhất | Có mức thuế |
|---|---|---|---|
| Phụ lục I | Biểu thuế **xuất khẩu** | 1,520 | 1,471 (96.8%) |
| Phụ lục II | Biểu thuế **nhập khẩu ưu đãi** (MFN) | 11,874 | **11,160 (94.0%)** |
| Phụ lục III | Thuế tuyệt đối/hỗn hợp (xe đã qua sử dụng) | — | 0 (số tiền USD, không phải %) |
| Phụ lục IV | Mức thuế TRQ ngoài hạn ngạch | — | 0 (cấu trúc riêng) |

Lưu ý rằng Phụ lục I chỉ là một **danh sách hàng hóa chịu thuế**, không phải đầy đủ 97 chương — 1.520 mã của nó chính xác là tập giao ở trên. Sự vắng mặt của một mã HS khỏi Phụ lục I là có ý nghĩa; đó không phải là dữ liệu thiếu.

**Sự khái quát hóa.** Phụ lục là một trường hợp của một lớp: **các ranh giới cấu trúc trong văn bản pháp luật mang ý nghĩa pháp lý, và làm phẳng chúng tạo ra sai lầm âm thầm.** Đó cũng chính là lý do vì sao chia đoạn theo cấu trúc đánh bại chia đoạn kích thước cố định trong statutory RAG — Recall@10 **0.46–0.47** cho chia đoạn cấp section/subsection so với **0.31–0.37** cho kích thước cố định, có ý nghĩa thống kê (Friedman omnibus p < 0.0001, rồi các kiểm định hoán vị theo cặp với hiệu chỉnh Holm) (đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2605.19806 — toàn bộ BGB, 2.455 sections, 525 câu hỏi). Đừng bao giờ cắt ngang một ranh giới mà luật đã vẽ ra có chủ đích.

---

## R10 — Kiểm tra căn cứ trích dẫn phải xác minh SỰ HẬU THUẪN, không phải SỰ TỒN TẠI

**Quy tắc.** Một kiểm tra căn cứ (grounding) phải xác minh rằng **điều khoản được viện dẫn hậu thuẫn cho mệnh đề được khẳng định**. "Trích dẫn phân giải ra một văn bản thật" không phải là một kiểm tra căn cứ và không bao giờ được giao ra như một cái. Một bộ kiểm tra số-Điều tạo ra sự an tâm giả tạo.

**Vì sao.** Nguồn xác đáng là đánh giá **được đăng ký trước (preregistered)** đầu tiên về các công cụ nghiên cứu pháp lý AI hàng đầu — 202 truy vấn, chấm điểm bởi chuyên gia (đã xác minh 2026-07-17, nguồn: https://doi.org/10.1111/jels.12413 · PDF: https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf · bài viết: https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries):

| Hệ thống | Kết quả |
|---|---|
| Lexis+ AI | 65% chính xác; **ảo giác >17%** |
| Westlaw AI-Assisted Research | 42% chính xác; **ảo giác >34%** |
| Ask Practical Law AI | dải ảo giác 17–33% |
| GPT-4 (no RAG) | ~43% ảo giác |

Đo lường so với các tuyên bố của nhà cung cấp về "trích dẫn pháp lý được liên kết, không ảo giác" (LexisNexis) và RAG "giảm ảo giác một cách đột phá xuống gần như bằng không" (một lãnh đạo Thomson Reuters). **Đây là những con số để neo kỳ vọng của các bên liên quan.**

**Vụ Wilgarten mới là toàn bộ vấn đề.** Được hỏi về các bản án của **"Luther A. Wilgarten" — một thẩm phán hư cấu** — Lexis+ AI trả về một **vụ án thật với một trích dẫn thật, định dạng đúng**, không phải do vị thẩm phán (không tồn tại) đó viết. Cụm từ của các tác giả: *"không ảo giác theo một nghĩa hẹp."*

**"Mọi trích dẫn đều phân giải được" chính xác là sự đảm bảo mà các nhà cung cấp tiếp thị và chính xác là sự đảm bảo thất bại.** Nó không phải là một đảm bảo yếu; nó là đảm bảo *tương thích với* sự thất bại.

**Hậu quả của việc phá vỡ nó.** Một người dùng được hiển thị một Chú giải Chương thật bên cạnh một khẳng định mà chú giải không hậu thuẫn. Bởi vì chú giải là thật và được viện dẫn đúng, cuộc rà soát vượt qua. Đây là [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng) ở tầng trích dẫn, và nó đánh bại chính cơ chế mà [R2](#r2--không-bao-giờ-xuất-ra-một-mã-hs-trần-trụi) dựa vào để làm sản phẩm an toàn — **bằng chứng không hậu thuẫn cho ứng viên còn tệ hơn không có bằng chứng, vì nó "tẩy trắng" cho ứng viên đó.**

**Các chế độ thất bại đã đo được cần thiết kế để chống lại** (đã xác minh 2026-07-17, các nguồn như ghi chú):
- **Document-Level Retrieval Mismatch (DRM)** — đoạn trông đúng, **sai văn bản**; quan sát thấy **>95%** trên một số bộ dữ liệu (nguồn: https://arxiv.org/html/2510.06999v1). Rất liên quan ở đây: "Điều 5. Giải thích từ ngữ" tồn tại trong hàng trăm văn bản và gần như giống hệt nhau về mặt câu chữ. Giảm thiểu: gắn thêm một tóm tắt/danh tính cấp-văn-bản ~150 ký tự vào mỗi đoạn trước khi embedding — giảm khoảng **một nửa DRM**, và tóm tắt *chung chung* đánh bại tóm tắt do chuyên gia định hướng. Loại phần tiền tố khỏi index BM25 (nếu không BM25 sẽ bám vào tiền tố thay vì phần thân đoạn).
- **Dữ liệu huấn luyện lấn át ngữ cảnh truy hồi** — "LLM có thể đã được huấn luyện trên một khối lượng văn bản lớn hơn nhiều hậu thuẫn cho quy tắc áp dụng rộng và có thể trung thành với dữ liệu huấn luyện hơn là với ngữ cảnh truy hồi" (Magesh et al.). **Trực tiếp liên quan: một ngoại lệ tiếng Việt trong một Thông tư so với quy tắc chung trong một Luật.**
- **Liên quan về câu chữ ≠ liên quan về pháp lý** — đúng từ ngữ, sai thẩm quyền/điều kiện/thứ bậc (Magesh et al. §3.2).
- **Mờ ngữ nghĩa trên các token quyết định** — `unverzüglich` ("không chậm trễ vô cớ") vs `sofort` ("ngay lập tức") gần như giống hệt trong không gian embedding và khác nhau về pháp lý. Các tương đương tiếng Việt: **"có thể" vs "phải"**, **"trong thời hạn" vs "chậm nhất"**. Dense embeddings làm mờ chính xác các token mang trọng lượng pháp lý quyết định — một lập luận cấu trúc cho hybrid BM25 + dense (nguồn: https://arxiv.org/pdf/2605.19806).
- **Lost in the middle** — nhồi 20 Điều vào ngữ cảnh làm suy giảm chủ động độ trung thực (faithfulness). Lập luận cho việc rerank quyết liệt và **top-k thấp** (k=5 trong SBV-LawGraph), không phải "truy hồi thêm cho chắc" (nguồn: https://arxiv.org/pdf/2605.19806).

**Định nghĩa tính đúng cần áp dụng.** Một câu trả lời chỉ được tính là đúng nếu **(i)** tương đương về ngữ nghĩa, **(ii)** chứa ≥1 trích dẫn pháp lý, và **(iii)** **các trích dẫn hợp lệ VÀ liên quan** — hội (conjunctive) (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf). Điều kiện (iii) là sự vận hành hóa bài học Wilgarten. **Đăng ký trước các đánh giá** — đó là đóng góp phương pháp luận cốt lõi của Magesh et al., và lĩnh vực này đầy rẫy các tuyên bố của nhà cung cấp không sống sót khi va chạm với một giao thức được đăng ký trước.

---

## R11 — Không scrape thuvienphapluat.vn hay luatvietnam.vn

**Quy tắc.** Cả hai trang đều không phải nguồn nạp. Không dùng cho văn bản, không dùng cho biểu thuế Excel của họ, không "chỉ để đối chiếu". Dùng **congbao.chinhphu.vn** (thẩm quyền + định dạng Word) và **vbpl.vn** (trạng thái hiệu lực + graph quan hệ).

**Vì sao — thuvienphapluat.vn: ba sự từ chối độc lập** (tất cả đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/robots.txt và các lần thử fetch trực tiếp, research 04 §2 / research 12 §4):

1. **robots.txt nêu đích danh ClaudeBot**: `User-agent: ClaudeBot` → `Disallow: /` (cùng với GPTBot, CCBot, Google-Extended, Bytespider, Amazonbot, meta-externalagent).
2. **Content-Signal: `search=yes, ai-train=no, use=reference`**, đóng khung là *"bảo lưu quyền một cách minh thị theo Điều 4 EU Directive 2019/790"*. `ai-train=no` bao trùm việc xây dựng một kho huấn luyện/embedding. Không có tín hiệu `ai-input` nào được cấp.
3. **Cloudflare vẫn cứng chặn nó bất kể** — 403 "Just a moment" trên cả ba lần thử (browser UA, curl UA mặc định, ClaudeBot UA).

Các văn bản hợp nhất của họ là **sản phẩm công việc biên tập (editorial work product)**, không phải văn bản hồ-sơ-công — mà đó chính xác là cái họ đang bảo lưu. Biểu thuế Excel của họ là một **sản phẩm thương mại**. Điều này khiến TVPL là **nguồn rủi ro pháp lý cao nhất, không phải lối tắt như nó có vẻ**. Mọi thứ nó có mà quan trọng đều nằm trong vbpl và Công báo. Nếu nhất định muốn TVPL, **hãy mua bản quyền (license)** — họ bán quyền truy cập API/dữ liệu.

**Vì sao — luatvietnam.vn: phân giải sai văn bản một cách âm thầm.** Nó **phân giải theo ID số và bỏ qua slug**. Trong quá trình nghiên cứu, URL `/thue/luat-thue-thu-nhap-ca-nhan-2007-30759-d1.html` **âm thầm 301 sang một Công văn về đất đai hoàn toàn không liên quan** tại `-30759-d6.html` (đã xác minh 2026-07-17, nguồn: research 04 §4, fetch trực tiếp). Không lỗi. Không cảnh báo. Một luật hoàn toàn khác, được phục vụ dưới URL của luật được yêu cầu. Nó cũng bị tường-đăng-nhập nặng nề và robots.txt của nó chặn `/VL/*` và mọi URL tìm kiếm `?Keywords=`.

**Hậu quả của việc phá vỡ nó.** Với TVPL: một lần crawl bị nêu-đích-danh-và-từ-chối, một sự bảo lưu quyền minh thị theo EU DSM Điều 4, và một kho văn bản xây trên sản phẩm biên tập thương mại của người khác — phơi nhiễm pháp lý trên một sản phẩm mà toàn bộ giá trị cốt lõi là khả năng bảo vệ pháp lý. Với luatvietnam: **phân giải sai văn bản một cách âm thầm là điều loại bỏ tư cách đối với một công cụ pháp lý theo định nghĩa.** Đó là [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng) ở tầng fetch.

**Sự trớ trêu đáng nội hóa** (nguồn: research 12 §4):

> "Hai trang tổng hợp 'tiện lợi' đều bị chặn về mặt kỹ thuật và thù địch về mặt pháp lý, trong khi nguồn sơ cấp có thẩm quyền lại mở toang và có dữ liệu tốt hơn hẳn."

**Các nguồn được duyệt** (tất cả đã xác minh 2026-07-17):

- **congbao.chinhphu.vn** — `robots.txt`: `User-agent: * / Allow: /`. Không Cloudflare, không cần JS; `curl` thuần trả về HTML render sẵn từ server. Cả PDF (**có tầng văn bản thật** — `/Font` hiện diện, 13.919 toán tử hiển thị văn bản trên một mẫu 70 trang; **không cần OCR**) và **DOCX** cho mỗi văn bản, cái sau qua `https://g7.cdnchinhphu.vn/api/download/stream?...`. Đây là các phiên bản **`_signed`, có thẩm quyền pháp lý** — Công báo là **ấn phẩm hồ sơ (publication of record)**; vbpl là cơ sở dữ liệu. **Nguồn nạp duy nhất cho các nghị định thuế quan.** Điểm yếu: tổ chức theo số công báo, không theo danh tính văn bản — **không có trạng thái hiệu lực, không có metadata quan hệ**, theo thiết kế. Ghép cặp với vbpl; đừng dùng một mình. (nguồn: https://congbao.chinhphu.vn/robots.txt, research 04 §3, research 12 §1)
- **vbpl.vn** — `robots.txt`: `Allow: /`, `Disallow: /api/`, `Disallow: /Pages/`. **⚠️ Hai agent nghiên cứu bất đồng về ý nghĩa của `Disallow: /Pages/` đó** — xem [Xung đột chưa giải quyết](#xung-đột-chưa-giải-quyết). **Xây lại 2026-04-23**: cổng ASP.NET cũ đã chết (mọi URL `Pages/vbpq-*.aspx` đều 404) và **mọi scraper hiện có cùng mọi bộ dữ liệu HF đều nhắm vào một trang không còn tồn tại**. Mẫu URL mới `https://vbpl.vn/van-ban/chi-tiet/{slug}--{ItemID}` (dấu phân cách `--` là **bắt buộc**; dạng slugless chuẩn tắc được quảng cáo trong `<link rel="canonical">` lại render "Văn bản không tồn tại" — một lỗi, đừng dựa vào nó). Render hoàn toàn phía client: `curl` trả về một vỏ tải 57KB với **không có văn bản luật nào**, và các chuỗi `Còn hiệu lực` trong HTML tĩnh là **nhãn i18n, không phải dữ liệu** — một cái bẫy âm thầm đầu độc một scraper ngây thơ. Hiệu lực hạng nhất (`effFrom`, `effTo`, `status`; các giá trị `Còn hiệu lực` / `Hết hiệu lực một phần` / `Hết hiệu lực toàn bộ` / `Chưa có hiệu lực`) và **27 quan hệ hai chiều có kiểu**. Kho văn bản ≈ **158.826** (Trung ương 54.480 = 43.895 VI + **10.585 bản dịch tiếng Anh chính thức**; Địa phương ~104.346). **Bộ nạp graph phải chịu được các cạnh gãy** — các đích tham chiếu có thể trỏ đến các văn bản chưa công bố và 404. Nền tảng tin cậy trích dẫn, đã xác minh nguyên văn từ **Điều 4 Nghị định 52/2015/NĐ-CP** (*không phải* Điều 3, cái mà hầu hết nguồn thứ cấp viện dẫn): *"Văn bản trên Cơ sở dữ liệu quốc gia về pháp luật **được sử dụng chính thức** trong việc quản lý nhà nước, phổ biến pháp luật, nghiên cứu, tìm hiểu, áp dụng và thi hành pháp luật của cơ quan, tổ chức, cá nhân."* **Không gì khác trong danh sách này có thuộc tính đó.** (nguồn: https://vbpl.vn/robots.txt, research 04 §1)
- **customs.gov.vn** — `robots.txt` trả về `User-agent: *` **mà không có dòng `Disallow` nào cả**; không có gì bị loại trừ (không sitemap; `/sitemap.xml` → 404). Crawl được phép, nhưng nó **không có thẩm quyền pháp lý — Nghị định mới có**, và trạng thái API của nó gây tranh cãi. Xem [Xung đột chưa giải quyết](#xung-đột-chưa-giải-quyết).

**Ghi chú về văn bản hợp nhất — liên quan đến giai đoạn RAG sau, không phải v1.** **Pháp lệnh 01/2026/UBTVQH16** (ban hành 10/06/2026, hiệu lực 01/07/2026) thiết lập: *"Văn bản hợp nhất được cơ quan, tổ chức, cá nhân sử dụng làm căn cứ chính thức trong viện dẫn và áp dụng pháp luật"* — văn bản hợp nhất nay là **căn cứ chính thức để viện dẫn và áp dụng pháp luật**, gỡ bỏ phản bác pháp lý lẽ ra sẽ chặn một kiến trúc dựa trên hợp nhất (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm · https://xaydungchinhsach.chinhphu.vn/van-ban-hop-nhat-duoc-su-dung-lam-can-cu-chinh-thuc-trong-vien-dan-va-ap-dung-phap-luat-119260625165619689.htm). Điều này **không** giúp cho thuế quan v1: không có văn bản hợp nhất chính thức máy-đọc-được nào của biểu thuế tồn tại ([R8](#r8--đừng-bao-giờ-mô-hình-hóa-phiên-bản-mới-nhất)). Nơi nó có áp dụng — **dùng hợp nhất đã công bố làm tầng văn bản; đừng tính toán hợp nhất từ các chỉ dẫn sửa đổi.** Các chỉ dẫn sửa đổi của Việt Nam là ngôn ngữ tự nhiên và không đều đặn ("bổ sung Điều 5a", "bãi bỏ cụm từ X tại Khoản 2", "thay thế cụm từ…"); một engine biến đổi văn bản là một mối nguy về tính đúng với vô số ca biên và không có thẩm quyền để dựa vào. Mô hình thời gian học thuật dẫn đầu (SAT-Graph) **cũng từ chối tính toán hợp nhất** — nó giả định các phiên bản đã hoàn tất tồn tại và dùng các nút sửa đổi để *giải thích* chuyển tiếp thay vì *thực thi* chúng. Đó là một tín hiệu mạnh về độ khó (đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2505.00039).

---

## R12 — TTĐB và BVMT không dựa trên HS trong luật

**Quy tắc.** Chỉ có thuế nhập khẩu/xuất khẩu và (một phần) VAT là dựa trên HS một cách bản địa. **Bất kỳ ánh xạ HS → hạng mục TTĐB hay HS → hạng mục BVMT nào cũng là suy luận biên tập của chính dự án và là một bề mặt rủi ro.** Nó phải được **dán nhãn như vậy trong giao diện** — một cách hiển thị, tại điểm hiển thị, không phải trong một tuyên bố miễn trừ ở chân trang.

**Vì sao.** Đã xác minh đối chiếu với chính API hải quan (đã xác minh 2026-07-17, nguồn: research 10 §4):
- Một truy vấn **TTĐB** trả về các hàng như `"I. Hàng hóa"`, `"1. Thuốc lá điếu…"`, `"2. Rượu"` với **`MA_HS: None`**. Bảng luật định (**Luật Thuế TTĐB 66/2025/QH15**) là **theo hạng mục sản phẩm, không theo dòng HS**. Ánh xạ HS→hạng mục là công việc suy luận.
- Một truy vấn **BVMT** trả về `"I. Xăng, dầu, mỡ nhờn"`, `"1. Xăng, trừ etanol"` — **không có HS**. Cùng phát hiện.

**BVMT cũng rất biến động** — mức thuế thay đổi vài tháng một lần **bằng nghị quyết, không phải nghị định**. **NQ 19/2026/QH16** (12/04/2026) đặt xăng/nhiên liệu bay về **0 đ/lít** cho giai đoạn 16/04–30/06/2026, gia hạn đến **30/09/2026** (đã xác minh 2026-07-17, nguồn: https://english.luatvietnam.vn/resolution-no-19-2026-qh16-dated-april-12-2026-of-the-national-assembly-on-promulgation-of-a-number-of-provisions-on-environmental-protection-tax-v-431850-doc1.html · https://baochinhphu.vn/keo-dai-thoi-han-ap-dung-uu-dai-thue-voi-mat-hang-xang-dau-den-30-9-2026-102260701163839168.htm). Đây là [R8](#r8--đừng-bao-giờ-mô-hình-hóa-phiên-bản-mới-nhất) một lần nữa, trên chu kỳ ~3 tháng.

**VAT chỉ dựa trên HS một phần**: chuẩn 10%; Phụ lục I/II của **NĐ 181/2025/NĐ-CP** (01/07/2025) liệt kê tài nguyên/khoáng sản xuất khẩu không chịu thuế **kèm mã HS**, nhưng **danh sách 5% là theo mô tả → cần ánh xạ** (cùng bài toán suy luận, nhỏ hơn). **NĐ 174/2025** gia hạn mức giảm 2% (còn 8%) đến 31/12/2026 (đã xác minh 2026-07-17, nguồn: research 10 §4; URL tham chiếu của báo cáo nằm trên luatvietnam — **chỉ được viện dẫn như tham chiếu của nghiên cứu; luatvietnam không phải nguồn nạp theo [R11](#r11--không-scrape-thuvienphapluatvn-hay-luatvietnamvn)** — xác minh lại đối chiếu Công báo trước khi dùng).

**Chống bán phá giá/tự vệ là dựa trên HS nhưng phân tán.** Mỗi Quyết định-BCT liệt kê các mã HS (vd QĐ 228/QĐ-BCT 2026 kính nổi → 7005.29.20, 7005.29.90; thép chữ H → 7216.33.11/.19/.90, 7228.70.10/.90). **Không có sổ đăng ký máy-đọc-được hợp nhất nào tồn tại.** Nó đòi hỏi scrape từng vụ trên pvtm.gov.vn / moit.gov.vn với việc theo dõi vòng đời sơ bộ → chính thức → rà soát cuối kỳ. **Đây là bộ dữ liệu khó nhất cho đến nay** và **nằm ngoài phạm vi v1** (đã xác minh 2026-07-17, nguồn: research 10 §4 · https://pvtm.gov.vn/). Lưu ý sự căng thẳng với [R6](#r6--một-mức-thuế-không-bao-giờ-là-một-scalar-nó-là-một-tuyên-bố-có-điều-kiện-kèm-ngày-as-of) mục 7: với một số truy vấn nguyên mẫu, bộ dữ liệu ngoài-phạm-vi này lại mang con số lớn nhất. Hãy nói ra điều đó; đừng ngụ ý sự đầy đủ.

**Hậu quả của việc phá vỡ nó.** Dự án âm thầm bịa ra một ánh xạ pháp lý không tồn tại trong luật, trình bày nó với cùng thẩm quyền như phép tra cứu thuế quan tất định, và người dùng dựa vào nó. Khác với bảng thuế quan, **không có nghị định nào để viện dẫn** khi nó bị chất vấn — vì nghị định không dựa trên HS. Sản phẩm khi đó sẽ chế tạo ra các tuyên bố pháp lý từ chính phán đoán biên tập của nó, không được dán nhãn. **Đây là nơi duy nhất mà sản phẩm có thể sai và không có nguồn nào để trỏ tới.**

**Chỉ thị thiết kế.** Nếu ánh xạ HS → TTĐB/BVMT được xây dựng chút nào, nó phải nằm trong một **tầng riêng biệt hiển thị, được dán nhãn hiển thị** ("suy luận nội bộ, không có căn cứ pháp lý theo mã HS") với một xử lý thị giác khác với các mức thuế được viện dẫn. Đừng bao giờ hợp nhất nó vào đối tượng phản hồi thuế quan.

---

## Chưa xác minh / Không được dựa vào

Tái tạo từ chính các cờ trung thực của nghiên cứu. **Đừng "tẩy trắng" bất kỳ mục nào trong số này thành một khẳng định tự tin.**

- **Hiện tượng phân tích cú pháp `textutil` với EVFTA — khoảng trống duy nhất một người xây dựng phải đóng lại trước khi tin bất cứ điều gì.** Trên Nghị định 116/2022 (EVFTA), `textutil` gộp một hàng bảng thành `2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9` — sáu mức thuế (`29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9`) nối liền **không có dấu phân cách**, trong một locale dùng dấu phẩy thập phân. Không thể khôi phục nếu không có heuristic. Nguyên văn lời người nghiên cứu: *"Tôi đang suy luận, không phải khẳng định, rằng đây là một hiện tượng do công cụ"* — RCEP có cấu trúc 6 năm y hệt và trích xuất hoàn hảo, gợi ý mạnh mẽ rằng một parser nhận-biết-bảng đúng cách (LibreOffice → docx → `w:tbl/w:tr/w:tc`) sẽ sửa được. **Điều này không thể chứng minh được** — không có `soffice`/`antiword`/`python-docx` trong môi trường đó. (nguồn: research 12 §2)
- **Vụ sữa (~700 tỷ, AMF 0405.90.10 → 0405.90.90, hồi tố về 2010), Polvita, Nhật Thiên Kim.** Báo cáo trong research 09 §2 **không có URL sơ cấp theo từng vụ**. Được củng cố theo hướng tốt bởi tin tức về than phiền của doanh nghiệp được viện dẫn trong [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng), nhưng các con số và mốc cụ thể **chưa được xác minh độc lập bằng URL ở đây**. Viện dẫn như minh họa; đừng trích con số như sự thật đã thiết lập.
- **Quyết định 117/QĐ-CHQ (2026)** — một *Quy trình xác định trước mã số* nội bộ mới, áp dụng từ khoảng 01/02/2026, được báo cáo là dựa trên nguyên tắc rằng **mỗi hàng hóa có đúng một mã HS** và trên một **cơ sở dữ liệu phân loại thống nhất toàn ngành**. **Toàn văn không fetch được (tường phí/403) — tin cậy trung bình.** Lưu ý sự căng thẳng: một học thuyết "một mã cho một hàng" đứng gượng gạo với phát hiện ~42,5% dữ liệu-chuẩn-gây-tranh-cãi trong [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng). **Đừng giả định cơ sở dữ liệu thống nhất sẽ từng được phơi bày công khai — nó là một hệ thống nội bộ.** (nguồn: research 09 §2)
- **"Claude 3.5 Sonnet và GPT-4 đạt ~80% ở 6 chữ số và >90% ở 2 chữ số."** Nổi lên trong một mẩu tìm kiếm với **không có nguồn sơ cấp truy vết được**, và nó **mâu thuẫn với HSCodeComp** (GPT-5 chỉ-LLM: 29% ở 10 chữ số, ~82% ở 2 chữ số). **Đừng dựa vào nó.** (nguồn: research 09 §4)
- **"1 trong 3 lô khai hải quan bị phân loại sai; hàng chục tỷ tiền thuế bị nộp sai."** Xuất hiện trên các blog của nhà cung cấp với **không có trích dẫn sơ cấp**. Hợp lý theo hướng, nhưng vô nguồn. **Đừng viện dẫn.** (nguồn: research 09 §4)
- **Các tuyên bố về độ chính xác của nhà cung cấp nói chung.** Zonos quảng cáo "độ chính xác 90%+ ngay khi dùng"; benchmark độc lập đặt nó ở **44,1% ở 10 chữ số**. Con số **80% của Avalara đến từ một sản phẩm rõ ràng có con người chuyên gia rà soát trong vòng lặp**. Các tuyên bố của nhà cung cấp và benchmark độc lập chênh nhau khoảng **~2×**. **Coi mọi con số của nhà cung cấp là tiếp thị cho đến khi được tái lập độc lập** — và lưu ý benchmark đó bản thân nó nhỏ (n=103) và đặc thù US-HTS (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2412.14179v1 · https://zonos.com/classify · https://www.avalara.com/us/en/products/global-commerce-offerings/item-classification.html).
- **Các nghị định FTA 2022–2027 đâm vào một vách đá vào 31/12/2027 như một sự kiện *đồng thời*.** Research 12 nêu rõ đây là **suy luận, không phải đã xác minh**. Research 10 độc lập lập bản đồ bảng nghị định→FTA→giai đoạn và đi tới cùng kết luận. Coi **hướng là chắc chắn, tính đồng thời là một suy luận**.
- **`data.gov.vn` / `open.data.gov.vn`.** Research 10 không phân giải được chúng (`getaddrinfo ENOTFOUND`) và **đánh dấu là chưa xác minh, không phải xác nhận đã chết**. Research 04 đi xa hơn: DNS có thẩm quyền nói **NXDOMAIN** từ vùng `gov.vn` (SOA `dns-master.vnnic.vn`) qua cả 8.8.8.8 và 1.1.1.1, với các domain đối chứng phân giải bình thường — **nên không phải chặn theo địa lý**; `opendata.gov.vn` và `dulieuquocgia.gov.vn` cũng NXDOMAIN. **Kết luận làm việc: không có API dữ liệu mở quốc gia cho văn bản pháp luật.** Nghị định 278/2025/NĐ-CP (có hiệu lực 22/10/2025) yêu cầu kết nối/chia sẻ dữ liệu **cơ-quan-với-cơ-quan qua Nền tảng chia sẻ dữ liệu, không phải dữ liệu mở công khai**; thời hạn chuẩn hóa 31/12/2026. Không phải một kênh sẵn có cho dự án này. (nguồn: research 04 §6, research 10 §5b)
- **Xác minh kéo theo hậu kiểm ("Faithful Passage Grounding"), được báo cáo là loại bỏ 63% trích dẫn ảo giác trên án lệ.** Từ **chỉ các mẩu tìm kiếm; nguồn sơ cấp chưa được xác minh.** Hấp dẫn cho [R10](#r10--kiểm-tra-căn-cứ-trích-dẫn-phải-xác-minh-sự-hậu-thuẫn-không-phải-sự-tồn-tại) — xác minh trước khi áp dụng. Cùng trạng thái cho arXiv:2606.00898 "Citation Grounding … via Legal Citation Graphs" (chỉ có mẩu, chưa fetch). (nguồn: research 02 §6)
- **Liệu `APIBieuThue` có giới hạn tốc độ hay không.** Chưa thăm dò. (nguồn: research 10 §5c)
- **vbpl.vn `provisionTree` / `referenceProvisions`.** Các trường payload tồn tại nhưng **`null` trên cả hai văn bản được lấy mẫu**. Nếu được điền trên toàn trang, đó là một **graph pháp lý cấp-điều-khoản** — research 04 gọi nó là "câu hỏi mở giá trị cao nhất" và "toàn bộ ván bài" cho giai đoạn RAG. **Chưa xác minh. Kiểm tra 10–20 văn bản gần đây trước khi thiết kế bất kỳ schema nào trên nó.** Các mục chưa xác minh liên quan từ cùng báo cáo: API gateway `vbpl-bientap-gateway.moj.gov.vn` được **tìm thấy, có thể tới, chưa lập bản đồ** (mọi path thăm dò đều 404; `/actuator` chỉ phơi bày `health`; không có Swagger); ánh xạ `referenceType` int → nhãn **chưa rõ** (thấy `3`, `12`; có 27 nhãn, không có phép nối); hành vi crawl tốc-độ-bền-vững ở quy mô 158k **chưa được kiểm thử** (~40 request đã thực hiện, không quan sát thấy throttle — đó không phải bằng chứng về việc không có). (nguồn: research 04 §1, §"Could NOT verify")
- **ASEAN Tariff Finder** — kết nối hết thời gian chờ; không xác minh được. **tongcuc.customs.gov.vn** — host chỉ-nội-bộ, không phân giải công khai. **VNTR (vntr.moit.gov.vn)** — kho chính thức của Bộ Công Thương bao trùm mọi FTA + quy tắc xuất xứ, nhưng **không tìm thấy API công khai hay tải hàng loạt nào**; chỉ dựa trên biểu mẫu, và bảng phán quyết hành chính của nó nói rõ là "chỉ để tham khảo". (nguồn: research 10 §5b, research 09 §3)
- **Không có tương đương CROSS/EBTI nào tồn tại tại Việt Nam.** Không có một kho phán quyết phân loại sạch, đầy đủ, máy-đọc-được, có thể truy vấn công khai nào tương đương với US CBP CROSS hay EU EBTI. Các Thông báo kết quả phân loại về cơ bản là nội bộ (được đẩy vào **Customslab**, tìm kiếm được bởi các đơn vị hải quan, không phải công chúng); khối lượng nhỏ (~2.500 mẫu được xử lý; nửa đầu 2026 → **257 hồ sơ nhận, 143 thông báo phân loại được ban hành**). **Điều này giới hạn chất lượng truy hồi bởi khả năng tiếp cận dữ liệu, không phải bởi năng lực mô hình** — hãy nêu giới hạn đó với người dùng thay vì che đậy nó. (đã xác minh 2026-07-17, nguồn: research 09 §3 · https://thuehaiquan.tapchikinhtetaichinh.vn/hai-quan-xu-ly-gan-2-500-mam-phan-tich-phan-loai-hang-hoa-xuat-nhap-khau-160924.html)

---

## Xung đột chưa giải quyết

### 1. API customs.gov.vn — research 10 vs research 12. **CHƯA GIẢI QUYẾT.**

Hai agent nghiên cứu đi tới các kết luận khác nhau về bản chất cho cùng một hệ thống trong cùng một ngày. **Cả hai được tái tạo. Không cái nào đã ngã ngũ. Đừng xây trên cái nào mà không xác minh lại trực tiếp.**

**Research 10 nói: một API JSON hoạt động, mở, không-captcha tồn tại.** (đã xác minh 2026-07-17, nguồn: research 10 §5a — phát hiện chủ đạo)
- Điều khiển trang "Tra cứu biểu thuế" trong Chrome, bắt XHR, **tái lập nó bằng `curl` thuần**:
  ```
  POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue
  Content-Type: application/x-www-form-urlencoded; charset=UTF-8
  Body (raw JSON despite the header):
  {"l_class":"TIM_KIEM","l_action":"GET","l_param":"8703","l_bieu_thue":"NK_uu_dai"}
  ```
- **"Không auth, không JSESSIONID, không captcha, không kiểm tra Referer/Origin. Captcha trên trang chỉ ở phía client — API không cưỡng chế nó."**
- `l_param` = tiền tố HS, tối thiểu 4 chữ số (`"87"` trả về rỗng; `"8703"` trả về **510 hàng**). Một hàng cho mỗi dòng HS, một cột cho mỗi biểu thuế. Mẫu `87031010`: `{'NK_uu_dai':'70','ATIGA':'0','ACFTA':'0','CPTPP_NK':'28','EVFTA_NK':'28.3','RCEP_JP':'38.2','NK_TT':'105'}` — EVFTA 28.3% nhất quán với bước giảm dần 2026, và NK_TT = 150% × 70 MFN, nên **dữ liệu là trực tiếp và hiện hành cho 2026**.
- Các lệnh metadata hoạt động: `BT_SAC_THUE` → 5 loại thuế; `BT_LOAI_BIEU_THUE` → toàn bộ 26 mã biểu thuế nhập khẩu.
- Kết luận: **trích xuất hàng loạt ≈ 1.228 POST (một cho mỗi nhóm 4 chữ số), vài giờ crawl lịch sự, không phải một dự án phân tích PDF.**

**Research 12 nói: trang là một vỏ JS, và API mà nó tìm thấy nằm trên một IP thô hết thời gian chờ và có CAPTCHA phía trước.** (đã xác minh 2026-07-17, nguồn: research 12 §5)
- Trang là một **vỏ JS** — trang chủ và URL tra-cứu-biểu-thuế trả về một **phản hồi 12.013 byte giống hệt nhau từng byte**. Nó tải `kendo.all.min.js` (Kendo UI grid ⇒ một JSON transport tồn tại).
- **"API ẩn: có."** Nhưng: `/scripts/main.js` hardcode **`http://123.30.210.236:8080/hqcustomsapi/`** — một IP thô, HTTP thuần, cổng 8080 — **bao gồm `.../hqcustomsapi/captcha/CheckCaptcha`. Nên ít nhất một phần của cổng thông tin có CAPTCHA chặn.**
- **"IP đó hết thời gian chờ từ đây. Tôi *không thể* phân biệt chặn theo địa lý với một block egress của sandbox, nên tôi không khẳng định nó không thể tới được — chỉ là tôi không thể tới nó."**
- Kết luận: *"đó là một công cụ tra cứu, không phải xuất hàng loạt. Liệt kê ~11k mã qua một endpoint không tài liệu có CAPTCHA phía trước trên một IP thô là mong manh và đối kháng."*

**Xung đột là gì.** Đây **khả dĩ là hai endpoint khác nhau** — 10 tìm thấy một path bridge/proxy cùng-origin (`www.customs.gov.vn/bridge?url=…/APIBieuThue`); 12 tìm thấy một backend IP-thô hardcode trong `main.js` (`http://123.30.210.236:8080/hqcustomsapi/`). Điều đó sẽ hòa giải "không captcha" (10, path bridge) với "CheckCaptcha tồn tại" (12, path IP-thô). **Sự hòa giải này là suy luận của chúng ta và không được xác minh bởi agent nào.** Chúng có thể thay vào đó là cùng một backend sau các mặt tiền khác nhau, trong trường hợp đó "API không cưỡng chế captcha" của 10 và endpoint captcha của 12 ở trong sự căng thẳng trực tiếp. **Chưa giải quyết. Giải quyết bằng xác minh lại trực tiếp trước khi bất kỳ thiết kế nào phụ thuộc vào nó.**

**Cái KHÔNG xung đột — và là cái thực sự chi phối:**

1. **customs.gov.vn không phải nguồn chân lý.** Cả hai agent đều nói vậy một cách độc lập. Research 10: *"Không tài liệu, không phiên bản, không SLA, không cấp phép ToS. Có thể biến mất hoặc bắt đầu cưỡng chế captcha. Coi như một tầng tiện lợi, **nguồn chân lý pháp lý vẫn là văn bản nghị định**."* Research 12: *"nó không có thẩm quyền pháp lý — Nghị định mới có."* **Bất kể trạng thái của API, nó không thể được viện dẫn cho một cán bộ hải quan.** [R7](#r7--mọi-câu-trả-lời-viện-dẫn-nghị-định-và-ngày-chụp-dữ-liệu-và-từ-chối-khi-ảnh-chụp-có-thể-lỗi-thời) áp dụng bất kể thế nào.
2. **Độ bao phủ của API chứng minh là không đầy đủ ngay cả khi nó hoạt động.** Các cảnh báo của chính research 10: **không có VIFTA và không có CEPA (UAE)** trong danh sách biểu thuế, với các giá trị `THOI_GIAN_CAP_NHAT` là **2019–2020**; **chỉ mức thuế năm hiện tại**, không có chuỗi năm tương lai (mức thuế 2027 phải đến từ các phụ lục nghị định); `l_bieu_thue` có vẻ **bị bỏ qua** đối với các truy vấn nhập khẩu.
3. **Đường đi Công báo `.doc` đã được xác minh, được cho phép, có thẩm quyền, và đủ.** 11.874 mã HS được trích xuất và kiểm định độc lập ([R1](#r1--mức-thuế-quan-không-bao-giờ-được-sinh-ra-bởi-một-llm), [R9](#r9--ranh-giới-phụ-lục-là-chịu-lực)). **Đây là đường nạp. Tranh chấp API không chặn v1.**

**Chỉ thị thiết kế.** Xây trên Công báo. Nếu API sau này được xác nhận hoạt động, nó là một **đối chiếu chéo** — một ý kiến thứ hai đánh dấu bất đồng cho một con người — **không bao giờ là nguồn của một mức thuế được hiển thị.**

### 2. vbpl.vn robots.txt — `Disallow: /Pages/` loại trừ cái gì? **CHƯA GIẢI QUYẾT (ít quan trọng cho v1).**

- **Research 12 §4**: *"vbpl.vn `robots.txt`: `Disallow: /Pages/` — và mọi URL văn bản là `vbpl.vn/.../Pages/vbpq-toanvan.aspx?ItemID=…`. **Robots loại trừ chính xác kho văn bản.**"* Nó cũng báo cáo một vỏ 404 giống hệt 52.199 byte trả về cho cả `curl` và WebFetch, bao gồm trên một URL đã được Google index. Kết luận: **không thể scrape đáng tin cậy.**
- **Research 04 §1**: trang được **xây lại vào 2026-04-23**; `/Pages/` là **cây cũ đã chết** và kho văn bản trực tiếp nằm ở `/van-ban/`, cái **được cho phép rõ ràng**. Các lỗi 404 mà research 12 quan sát nhất quán với — và được giải thích bởi — việc tái khởi động.

**Đánh giá**: lời kể của research 04 giải thích các quan sát của research 12, và 04 điều tra việc tái khởi động một cách trực tiếp trong khi 12 đang thăm dò tính sẵn có của thuế quan. **Sự giải quyết khả dĩ là cả hai quan sát đều đúng và 12 đã kiểm tra cây cũ.** Đây là **suy luận của chúng ta, không phải một sự hòa giải đã xác minh** — kiểm tra lại `vbpl.vn/robots.txt` và một fetch `/van-ban/chi-tiet/{slug}--{ItemID}` trực tiếp trước khi giai đoạn RAG phụ thuộc vào nó. **Nó không ảnh hưởng v1**: thuế quan đến từ Công báo bất kể thế nào.

### 3. Biến động thể chế — xác minh lại trước khi giao

**Một sửa đổi Luật Hải quan nữa đã được trình lên UBTVQH vào 15/07/2026** — hai ngày trước khi các ghi chú này được viết. Khung pháp lý làm nền cho [R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng) và [R5](#r5--từ-chối-trả-lời-abstention-là-một-thành-công-hạng-nhất) đang **trong trạng thái biến động** (nguồn: research 09 §2). Cũng đang diễn ra:

- **Thông tư 121/2025/TT-BTC** (ban hành 18/12/2025, **hiệu lực 01/02/2026**) sửa TT 38/2015 & 39/2018, bao gồm **sửa đổi khoản 1 và bổ sung khoản 6 Điều 7** về hồ sơ/mẫu hàng xác định trước, với các mẫu mới **01a-TB XDTMS / 01b-Thay the XDTMS / 01c-Huy XDTMS** (đã xác minh 2026-07-17, nguồn: https://www.pwc.com/vn/vn/publications/news-brief/251223-new-customs-procedures-effective-from-1-february-2026.html).
- **Thông tư 85/2026/TT-BTC** (hiệu lực **15/09/2026**) điều chỉnh *phân loại hàng hóa và phân tích để phân loại*, thay thế TT 14/2015 + 17/2021 — **quy trình** phân loại, không phải danh mục (đã xác minh 2026-07-17, nguồn: https://thuehaiquan.tapchikinhtetaichinh.vn/doi-moi-quy-dinh-phan-loai-phan-tich-hang-hoa-xuat-nhap-khau-161123.html).

**Xác minh lại biểu chi tiết mức phạt ([R3](#r3--error-but-valid-là-chế-độ-thất-bại-đặc-trưng)) và thủ tục Điều 28 ([R5](#r5--từ-chối-trả-lời-abstention-là-một-thành-công-hạng-nhất)) trước khi giao bất cứ thứ gì viện dẫn chúng.** Bản thân các quy tắc — không bao giờ sinh ra một mức thuế, không bao giờ xuất một mã trần trụi, từ chối trả lời (abstention) là một thành công — không phụ thuộc vào phiên bản nào đang có hiệu lực. Các con số thì có.

---

## Kiến thức liên quan

- [Bối cảnh dự án](project-context.md) — Customs Assistant là gì, phục vụ ai, và các ranh giới v1 của nó.
- [Chỉ mục](index.md) — bản đồ bộ nhớ bền vững của dự án.
- [Quy ước đặt tên](naming-conventions.md) — quy tắc thuật ngữ và định danh, bao gồm cách đặt tên HS / biểu thuế / phụ lục.
- [Chỉ mục quyết định kiến trúc](architecture-decisions/README.md) — các ADR. Mô hình thời gian ([R8](#r8--đừng-bao-giờ-mô-hình-hóa-phiên-bản-mới-nhất)), đường nạp Công báo nhận-biết-phụ-lục ([R9](#r9--ranh-giới-phụ-lục-là-chịu-lực), [R11](#r11--không-scrape-thuvienphapluatvn-hay-luatvietnamvn)), và ranh giới tra-cứu-tất-định ([R1](#r1--mức-thuế-quan-không-bao-giờ-được-sinh-ra-bởi-một-llm)) mỗi cái xứng đáng có ADR riêng.
- [Danh sách công việc](planning/01-task-list.md) — phạm vi và trình tự hiện tại.
- [Tổ chức mã nguồn](docs/code-organization.md) — nơi module tra-cứu-thuế-quan, module gợi-ý-ứng-viên, và pipeline nạp dữ liệu nằm ở đó.
- [Quy tắc tác nhân](AGENTS.md) — quy tắc quy trình làm việc, tài liệu, và định tuyến tri thức.
