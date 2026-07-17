---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../concepts/tariff-system.md
  - ../concepts/hs-classification.md
  - ../concepts/legal-rag-retrieval.md
  - ../concepts/data-sources.md
  - ../workflows/customs-declaration.md
---

# Xây Customs Assistant Trước, RAG Pháp Lý Sau

## Trạng thái

Đã phê duyệt — chủ dự án đã phê duyệt kế hoạch này vào ngày 2026-07-17.

## Bối cảnh

Lộ trình ban đầu cho kho mã này mô tả một trợ lý đọc pháp lý: RAG cộng với một đồ thị tri thức trên văn xuôi luật logistics Việt Nam. Chủ dự án là một người khai hải quan. Vòng lặp hằng ngày thực tế của anh ấy là: phân loại HS → kiểm tra chính sách (cấm / giấy phép / điều kiện / kiểm tra chuyên ngành) → giấy phép và kiểm tra trên VNSW → khai qua ECUS → phân luồng → nộp thuế → thông quan (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 08). Đọc văn xuôi luật không nằm trong vòng lặp đó; tra một con số và bảo vệ một mã số mới nằm trong đó.

Hai sản phẩm là hai hình dạng bài toán khác nhau:

- **Biểu thuế/HS là dữ liệu bảng với tra cứu khóa chính xác.** Một mức thuế suất là đúng cho một bộ ba `(HS, biểu, ngày)` hoặc nó là một câu trả lời sai trên một tờ khai ràng buộc pháp lý. Không có mức thuế suất "gần về mặt ngữ nghĩa".
- **RAG luật là tìm kiếm ngữ nghĩa trên văn xuôi.** Các con số Việt Nam đã công bố tốt nhất của nó là Recall@1 0.69 / Recall@10 0.77 trên ALQAC và 0.49 / 0.76 trên kho ngữ liệu SBV cho một hệ thống hybrid + rerank + đồ thị tri thức — với chính các tác giả cảnh báo về một tập đánh giá 100 cặp hỏi–đáp và không có ablation nào cô lập đóng góp của KG (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf). Đó là những con số của một công cụ hỗ trợ nghiên cứu, không phải của một cỗ máy trả lời.

Chúng dùng chung hạ tầng — một kho văn bản song thời gian, một pipeline nạp Công báo, một mô hình trích dẫn — và **không dùng chung phần lõi**. Không gì trong một lần đọc bảng theo khóa được tái sử dụng bởi một bộ truy xuất, và không gì trong một bộ truy xuất giúp ích cho một lần đọc bảng.

Công việc xác minh cũng cho thấy dữ liệu là lấy được, nên khan hiếm không phải là lý do để sắp thứ tự. Báo cáo 12 đã lắp ráp một bảng MFN thực 11.874 dòng từ các phần công báo `.doc` của `congbao.chinhphu.vn` trong vài giờ, và độc lập kiểm định nó (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12, https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm). Lý do để sắp thứ tự là **tốc độ phản hồi chống lại một chế độ hỏng âm thầm**.

## Quyết định

Xây Customs Assistant trước. Triển khai v1 với đúng hai tính năng — tra cứu biểu thuế tất định và gợi ý ứng viên HS — và hoãn RAG trên luật logistics Việt Nam sang một giai đoạn sau.

Quy tắc sắp thứ tự: **chủ dự án là người dùng đầu tiên và chính của mọi thứ chúng ta giao.** Bất kỳ năng lực nào mà lỗi của nó anh ấy không thể phát hiện trong khoảng một tuần sử dụng hằng ngày của chính mình đều không được đưa vào v1.

## Lý do căn bản

**1. Chế độ hỏng đặc trưng là dữ liệu sai trông có vẻ hợp lý mà lại báo thành công — nên độ trễ phát hiện là toàn bộ ván cờ.**

Một lần phân tích ngây thơ nghị định MFN báo **94% thành công và tự tin sai**: 1.520 mã HS xuất hiện trong cả Phụ lục I (biểu xuất khẩu) và Phụ lục II (biểu nhập khẩu), và **1.329 mã mang mức thuế suất khác nhau**. Một bộ phân tích mù phụ lục trả về mức thuế *xuất khẩu* cho một câu hỏi *nhập khẩu*, một cách âm thầm, ở tỷ lệ thành công biểu kiến 94% (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12).

Phía HS có cùng thuộc tính, được đặt tên: các lỗi của HSCodeComp áp đảo là **"Error but Valid"** — mô hình phát ra một mã HS có thật, trông hợp lệ, mà lại sai, không có ngoại lệ, không có lỗi phân tích, không có cờ đỏ nào (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631). Nó chảy vào VNACCS, được chấp nhận, và nổi lên ba năm sau dưới dạng một cuộc kiểm tra sau thông quan ở mức **20% của phần thiếu** cộng với lãi **0.03%/ngày** (đã xác minh 2026-07-17, nguồn: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-9).

Cả hai chế độ hỏng đều không bị bắt bởi test, bởi một schema, hay bởi một điểm số độ tin cậy. Nó bị bắt bởi một chuyên gia lĩnh vực, người biết rằng 0301.11.10 là 15% khi nhập khẩu và thấy công cụ nói 0%. Chủ dự án là chuyên gia đó và anh ấy mở công cụ mỗi ngày làm việc. Customs-trước mua cho chúng ta **phát hiện lỗi trong một tuần thay vì sáu tháng**, trên đúng lớp lỗi mà dự án có khả năng tạo ra nhất.

**2. Cả hai tính năng v1 đều có một hợp đồng đầu ra tốt-đã-biết; tính năng RAG thì chưa.**

Tra cứu biểu thuế không có AI trong nó — nó là một lần đọc bảng theo khóa, và tính đúng đắn của nó có thể kiểm chứng dựa trên văn bản nghị định. Gợi ý HS có một hợp đồng thắng lợi *đã được đo lường*: hệ thống của Cơ quan Hải quan Hàn Quốc dự đoán các phân nhóm 6 chữ số và truy xuất các câu chủ chốt liên quan từ sổ tay HS làm bằng chứng giải thích được cho mỗi ứng viên, đạt **độ chính xác top-3 93.9%** trên 925 phân nhóm khó với 5.000 yêu cầu phân loại gần đây, cùng một nghiên cứu người dùng với 32 chuyên gia xác nhận thời gian rà soát giảm (đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2311.10922). So với top-1 tự động ở 10 chữ số là **46.8%** (agent tốt nhất) và **29.0%** (GPT-5, không công cụ) so với **95.0%** của con người (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631). **Khoảng cách giữa 47% và 93.9% là hợp đồng đầu ra, không phải năng lực mô hình.**

Chúng ta biết "xong" trông như thế nào đối với cả hai tính năng v1. Đối với RAG pháp lý thì chúng ta không biết: không tồn tại một so sánh đã công bố nào giữa các embedding thương mại với các mô hình chuyên biệt cho tiếng Việt trên văn bản *pháp lý* tiếng Việt, và chúng ta sẽ phải tự chạy cuộc đánh giá đó (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 02).

**3. Hạ tầng dùng chung dù sao cũng được xây, và được xây dưới tải.**

Tính song thời gian, nạp Công báo, và trích dẫn kèm ngày hiệu lực đều bắt buộc cho biểu thuế (xem [Bối cảnh Dự án](../project-context.md)). Làm chúng trước cho một lĩnh vực mà chủ dự án có thể kiểm tra mọi đầu ra nghĩa là giai đoạn RAG kế thừa một kho đã được chứng minh là sai và đã được sửa, thay vì một kho được thiết kế chống lại một giả thuyết.

Tính song thời gian nói riêng là không thể hoãn. ND 72/2026/NĐ-CP được ký **09/03/2026** và có hiệu lực **ngay trong ngày** ("kể từ ngày ký"); nó đến Công báo số 157 vào **24/03/2026 — 15 ngày sau khi nó đã là luật ràng buộc**; và nó hết hiệu lực **30/04/2026**, một cửa sổ 52 ngày, sau đó mức thuế suất quay lại ND 26/2023 (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12). Một schema "giá trị mới nhất" phục vụ xăng 0% mãi mãi, và việc trang bị lại tính thời gian lên nó là một cuộc viết lại.

**4. Mật độ giá trị.** Biểu thuế/HS là nơi có tiền và trách nhiệm pháp lý. 76% doanh nghiệp báo cáo gặp trở ngại khi xác nhận mã HS, tăng từ 66.3% năm 2018 (đã xác minh 2026-07-17, nguồn: https://diendandoanhnghiep.vn/ganh-nang-ma-hs-trach-nhiem-cua-co-quan-hai-quan-o-dau-10077631.html). Một lần phân loại lại được cho là đã khiến 8 nhà sản xuất sữa tốn ~700 tỷ VND truy thu hồi tố (nguồn: nghiên cứu 09 §2 — **báo cáo không mang URL sơ cấp cho vụ việc này; mang tính minh họa, không phải sự thật đã xác lập**; xem [Quy tắc Nghiệp vụ → Chưa xác minh](../business-rules.md#chưa-xác-minh--không-được-dựa-vào)). Không ai bị phạt vì đọc Nghị định 163/2017 chậm.

## Các phương án đã cân nhắc

**Luật-trước (RAG trên luật logistics trước).** Bị bác. Dữ liệu an toàn hơn — Công báo và vbpl đều dùng được, và văn bản hợp nhất đã trở thành cơ sở chính thức để trích dẫn và áp dụng luật kể từ **01/07/2026** theo Pháp lệnh 01/2026/UBTVQH16, điều này loại bỏ phản đối pháp lý mà trước đây sẽ chặn một lớp văn bản dựa trên hợp nhất (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm). Nhưng giá trị thấp hơn và, mang tính quyết định, **vòng phản hồi tệ hơn**: các câu trả lời văn xuôi được chấm điểm theo tính hợp lý, và một lần truy xuất sai-nhưng-trôi-chảy trên Luật Thương mại Điều 233–240 chẳng khiến chủ dự án tốn gì mà anh ấy nhận ra. Chúng ta sẽ tối ưu trong sáu tháng chống lại một chỉ số không ai cảm nhận được. Tỷ lệ hỏng tương đương là có thật và đã được đo lường — trong cuộc đánh giá tiền đăng ký duy nhất về các công cụ AI pháp lý hàng đầu, Lexis+ AI chính xác 65% và ảo giác >17%, Westlaw AI-Assisted Research chính xác 42% và ảo giác >34%, so với tuyên bố "không ảo giác" của nhà cung cấp (đã xác minh 2026-07-17, nguồn: https://doi.org/10.1111/jels.12413).

**Cả hai cùng lúc.** Bị bác — cái bẫy kinh điển. Hai sản phẩm dùng chung hạ tầng nhưng không dùng chung lõi, nên "cả hai" không phải là một dự án với đòn bẩy; nó là hai dự án với một hạn chót. Nó cũng sẽ buộc phải dùng stack Neo4j/Qdrant/BullMQ mà [Bối cảnh Dự án](../project-context.md) loại trừ: một graph DB và một vector store chuyên dụng chỉ có thể tranh luận được một khi đồ thị sửa đổi và kho văn xuôi đã hoạt động, và bề mặt ngữ nghĩa của v1 chỉ là truy xuất ghi chú HS, thứ mà pgvector đã bao phủ. Thêm chúng ngay bây giờ là bề mặt vận hành mà một công cụ nội bộ 5–50 người không thể phân bổ chi phí, trả trước khi cả hai sản phẩm tự chứng minh.

**Mua thay vì xây.** Không khả thi như đã nêu. caselaw.vn bao phủ hơn 12.000 mã HS và hơn 17 FTA và quảng cáo một API doanh nghiệp, còn ecus.vn công bố một file Excel hợp nhất 32 bảng trên ~8.000 mã HS được cập nhật 05/04/2026 — nhưng **không ai cung cấp một API công khai miễn phí**, caselaw.vn không trích dẫn nguồn của nó, và một mức thuế suất không được trích dẫn là vô dụng cho đúng cái điều mà công cụ này tồn tại để tạo ra: một dấu vết giấy tờ có thể bảo vệ được (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 10).

## Phạm vi

Áp dụng cho:

- `.agent/planning/01-task-list.md` — sắp thứ tự v1
- `.agent/concepts/tariff-system.md`, `.agent/concepts/hs-classification.md` — xây trước
- `.agent/concepts/legal-rag-retrieval.md` — được giữ làm kiến thức bền vững, **không** phải mục tiêu xây dựng của v1
- `.agent/docs/code-organization.md` — ranh giới module phải giữ cho lõi biểu thuế không có phụ thuộc truy xuất

Không áp dụng cho: nền tảng dùng chung (kho song thời gian, nạp Công báo, mô hình trích dẫn), vốn là công việc v1 bất kể sắp thứ tự thế nào.

## Hệ quả

- v1 giao hai tính năng, cả hai đều được chủ dự án sử dụng hằng ngày và có thể chứng bác từ trí nhớ.
- Ghi chú khái niệm RAG ở lại trong bộ nhớ và ở trạng thái chưa xây. Đừng để nó rò rỉ vào các thiết kế v1.
- Ranh giới module phải làm cho việc sắp thứ tự trở nên vật lý: đường tra cứu biểu thuế không có LLM, không có embedding, và không có phụ thuộc truy xuất. Nếu một thay đổi trong tương lai thêm một cái vào, đó là một vi phạm [Quy tắc Nghiệp vụ](../business-rules.md), không phải một refactor.
- Hạ tầng mà v1 xây là hạ tầng mà giai đoạn RAG cần. Nếu một lối tắt v1 làm cho kho trở nên phi-song-thời-gian hoặc bỏ mất xuất xứ, thì đó không phải là một lối tắt — nó là một khoản trả trước cho một cuộc viết lại.
- Chúng ta chấp nhận rằng truy vấn nguyên mẫu "thép từ Trung Quốc" là không trả lời được trong v1: thuế chống bán phá giá/tự vệ là con số quan trọng nhất ở đó và bị loại trừ (không có sổ đăng ký hợp nhất máy đọc được; phải scrape từng Quyết định-BCT với vòng đời sơ bộ → chính thức → rà soát cuối kỳ để theo dõi). Một phiên bản làm nửa vời còn tệ hơn không có gì, và giao diện phải nói vậy chứ không trả về một mức thuế suất trông giống một câu trả lời (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 10, https://pvtm.gov.vn/).

## Rủi ro

- **Dữ liệu hải quan không phải là lựa chọn "an toàn" về tính cập nhật.** Dòng sửa đổi mới là trở ngại thực, không phải việc thu thập. Các nghị định có hiệu lực ngay ngày chúng được ký, đến Công báo máy đọc được 15–48 ngày sau, và một số hết hiệu lực rồi âm thầm quay trở lại (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12). Biện pháp giảm thiểu là hợp đồng đầu ra, không phải bộ thu thập: trích dẫn nghị định và ngày hiệu lực, và **từ chối khi ảnh chụp có thể đã lỗi thời**.
- **Hai hạn chót cứng rơi cùng nhau quanh 31/12/2027 – 01/01/2028**: hết hiệu lực kho nghị định FTA và chuyển đổi danh mục AHTN/HS 2028 (HS 2028 có hiệu lực 01/01/2028 theo WCO; điểm gãy FTA là *suy ra*, xem bên dưới). Mô hình hóa phiên bản HS và khoảng hiệu lực như những chiều hạng nhất ngay từ ngày đầu (đã xác minh 2026-07-17, nguồn: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx).
- **Sắp thứ tự không loại bỏ rủi ro chủ-dự-án-là-điểm-rà-soát-duy-nhất.** Một chuyên gia kiểm tra đầu ra của chính công cụ của mình là một vòng lặp nhanh, không phải một vòng lặp độc lập. Thiên lệch xác nhận là chế độ hỏng tệ nhất đã được ghi nhận của các công cụ phân loại AI; điều cấm trong [Quy tắc Nghiệp vụ](../business-rules.md) về việc một mã số ưa thích đi vào một prompt như một tiền đề là bảo vệ mang tính cấu trúc, và nó không yếu đi vì người rà soát là chủ dự án.
- **Hoãn RAG là hoãn việc học hỏi về các bài toán truy xuất khó hơn**, đáng chú ý là Document-Level Retrieval Mismatch, quan sát được trên 95% ở một số tập dữ liệu (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.06999v1). Chấp nhận: bề mặt truy xuất ghi chú HS trong v1 luyện tập một phiên bản nhỏ của cùng cỗ máy đó.

## Chưa xác minh / Không được dựa vào

Được tái hiện từ các cảnh báo của chính nghiên cứu. Đừng phát biểu lại như sự thật.

- **Điểm gãy kho nghị định FTA 2022–2027 vào 31/12/2027 là suy ra, không phải đã xác minh.** Báo cáo 12 đánh dấu nó rõ ràng là suy ra; báo cáo 10 khẳng định nó tự tin hơn nhưng dẫn nguồn tới các trang tổng hợp thứ cấp. Coi như một giả định lập kế hoạch cần xác minh lại.
- **API biểu thuế customs.gov.vn — báo cáo 10 và 12 trực tiếp mâu thuẫn với nhau, và xung đột chưa được giải quyết.** Báo cáo 10 nói nó đã xác minh `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue` với `curl` trần: không auth, không captcha, captcha trên trang chỉ ở phía client, `"8703"` trả về 510 dòng, trích xuất hàng loạt ≈1.228 POST. Báo cáo 12 nói `/scripts/main.js` hardcode `http://123.30.210.236:8080/hqcustomsapi/` bao gồm `.../captcha/CheckCaptcha`, rằng IP đó timeout, và rằng nó không thể phân biệt geo-fencing với một chặn egress của sandbox. Chúng có thể đang mô tả các endpoint khác nhau — đó là một giả thuyết chưa ai kiểm thử. **Quyết định này không phụ thuộc vào việc giải quyết nó:** cả hai báo cáo đồng thuận rằng API không có cấp phép Điều khoản dịch vụ, không có SLA, không có phiên bản hóa và không có thẩm quyền pháp lý, và rằng Nghị định là nguồn chân lý. v1 không được phụ thuộc vào nó.
- **Artifact phân tích bảng EVFTA là lỗ hổng duy nhất mà một người xây phải bịt trước.** `textutil` gộp một dòng thành `2101.11.11 | ... | 2925,421,818,114,510,9` — sáu mức thuế suất bị nối liền không có dấu phân cách trong một locale dùng dấu phẩy thập phân. Báo cáo 12 nói thẳng: *"I am inferring, not asserting, that this is a tooling artifact."* Một bộ phân tích Word thực (LibreOffice → docx → `w:tbl/w:tr/w:tc`) có lẽ khắc phục được nó; không có `soffice`/`python-docx` nào sẵn có để chứng minh điều đó.

## Yêu cầu rà soát

- Xác minh rằng không thiết kế v1 nào đặt một lệnh gọi LLM, embedding, hay truy xuất vào đường tra cứu biểu thuế.
- Xác minh rằng kho song thời gian và nạp Công báo được đặc tả trước bất kỳ công việc tính năng nào, không phải song song với nó.
- Xác minh rằng hợp đồng gợi ý HS là các ứng viên + bằng chứng nguyên văn + từ chối rõ ràng, không bao giờ là một con số 8 chữ số trần.
- Xác minh lại điểm gãy FTA 31/12/2027 trước khi nó trở nên chịu lực trong một schema hay một kế hoạch di trú.
- Xem xét lại việc sắp thứ tự của ADR này nếu chủ dự án không còn là người dùng hằng ngày, hoặc nếu một tính năng v1 được giao mà lỗi của nó anh ấy không thể phát hiện.

## Kiến thức liên quan

- [Bối cảnh Dự án](../project-context.md)
- [Quy tắc Nghiệp vụ](../business-rules.md)
- [Hệ thống Biểu thuế](../concepts/tariff-system.md)
- [Phân loại HS](../concepts/hs-classification.md)
- [Truy xuất RAG Pháp lý](../concepts/legal-rag-retrieval.md) — hoãn lại, không xây trong v1
- [Nguồn Dữ liệu](../concepts/data-sources.md)
- [Văn bản Pháp luật Việt Nam](../concepts/vietnamese-legal-documents.md)
- [Quy trình Khai báo Hải quan](../workflows/customs-declaration.md)
- [README Quyết định Kiến trúc](README.md)
