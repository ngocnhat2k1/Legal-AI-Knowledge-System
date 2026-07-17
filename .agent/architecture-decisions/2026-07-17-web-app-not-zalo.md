---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../concepts/tariff-system.md
  - ../concepts/hs-classification.md
---

# Triển Khai Web App, Không Phải Bot Zalo OA

## Trạng thái

Đã phê duyệt — chủ dự án đã phê duyệt kế hoạch này vào ngày 2026-07-17.

## Bối cảnh

Tiền đề ban đầu cho v1 từ phía chủ dự án là *"chưa có OA nên làm bot Zalo"* — hiểu nôm na là "chúng ta chưa có Official Account nên hãy xây một bot Zalo."

Tiền đề đó không nhất quán trên con đường chính thức. OA **chính là** cơ chế bot, chứ không phải một giải pháp thay thế cho nó. Mọi tuyến tự động hóa Zalo chính thức (ứng dụng developers.zalo.me → liên kết tới một OA → webhook → Send API) đều đòi hỏi một OA làm định danh gửi tin; trình dựng no-code tại chatbot.zalo.me cũng gắn với OA tương tự (đã xác minh 2026-07-17, nguồn: https://developers.zalo.me/docs/official-account/phu-luc/lam-the-nao-de-tao-chatbot-tra-loi-tu-dong-voi-zalo-api). Việc không có OA chính là trở ngại cho việc xây một bot, chứ không phải lý do để xây một bot.

Công ty **đã có** GPKD, nên một OA là khả thi. Do đó câu hỏi không phải là "chúng ta có thể không?" mà là "chúng ta có nên không?" — và bài toán kinh tế nền tảng đã được xác minh trả lời là không, đối với một công cụ nội bộ phục vụ 5–50 nhân sự đã biết.

### Tái cấu trúc gói dịch vụ năm 2026

Kể từ **01/06/2026** Zalo đã thay thế các gói cũ (Dùng thử / Nâng cao / Premium) bằng bốn gói mới. Bất kỳ hướng dẫn nào có ngày trước tháng 6 năm 2026 đều đã lỗi thời — đáng chú ý là gói dùng thử miễn phí 30 ngày "Dùng thử" cũ, vốn từng mở khóa API, nay đã không còn là một tuyến có thể gia hạn (đã xác minh 2026-07-17, nguồn: https://oa.zalo.me/home/resources/news/162026-zalo-official-account-trien-khai-4-goi-dich-vu-moi-toi-uu-hieu-suat-theo-nhu-cau-doanh-nghiep-_109742821673880689).

| | Cơ bản | Tiêu chuẩn | Tăng trưởng | Toàn diện |
|---|---|---|---|---|
| Giá | 0đ | 1.000.000đ/năm | **2.500.000đ/năm** | 6.000.000đ/năm |
| Chatbot | ✗ | ✗ | ✓ 10 kịch bản | ✓ 50 kịch bản |
| Zalo Open API | ✗ | ✗ | ✓ 100 req/min | ✓ 2.000 req/min |
| Tin tư vấn ngoài 48h/tháng | — | — | 500 | 2.000 |

(đã xác minh 2026-07-17, nguồn: https://zalo.solutions/oa/pricing — bảng được phân tích từng ô một từ trang bảng giá chính thức, không phải từ một bản tóm tắt)

Có ba điều kéo theo mà hầu hết các kế hoạch kiểu "cứ làm đại một bot Zalo" không bao giờ tính đến:

- **Gói miễn phí không thể chạy code của chúng ta.** "Tự động hóa cơ bản" trên gói Cơ bản là trình trả lời tự động đóng gói sẵn của Zalo — tin nhắn chào mừng và tự động trả lời theo từ khóa được cấu hình trong bảng điều khiển OA. Nó không phải backend của chúng ta, không dựa trên webhook, và không thể gọi một LLM.
- **Tiêu chuẩn (1tr/năm) là một cái bẫy.** Nó trông giống điểm khởi đầu giá rẻ. Chatbot và Open API đều là ✗ trên gói này. Bạn trả một triệu đồng và chẳng nhận được gì hướng tới một chatbot cả. Ngưỡng thực sự cho một bot vận hành bằng API là **Tăng trưởng ở mức 2.500.000đ/năm**.
- **"Hồ sơ quảng cáo" không phải là lối thoát.** Loại tài khoản không có GPKD này rõ ràng không thể dùng Nhắn tin, Broadcast, Bài viết, Chatbot, hay Gọi thoại — nó là một vỏ mua quảng cáo không thể trò chuyện (đã xác minh 2026-07-17, nguồn: https://oa.zalo.me/home/documents/guides/khoi-tao-zalo-official-account_61).

### Cửa sổ nhắn tin còn làm tình hình tệ hơn cho use case của chúng ta

Theo chính sách phí gửi tin chính thức của Zalo (đã xác minh 2026-07-17, nguồn: https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099):

- **8 tin tư vấn miễn phí** mỗi 48h kể từ lần tương tác cuối của người dùng; hạn mức được đặt lại mỗi lần người dùng tương tác mới.
- Vượt quá 8, hoặc ngoài cửa sổ: **55đ/tin**.
- **Cửa sổ gửi qua OpenAPI chỉ 7 ngày** kể từ lần tương tác cuối — OA Manager (nhân viên trực người thật) được 365 ngày, nhưng code của chúng ta thì không.
- Bất kỳ tin chủ động hoặc ngoài cửa sổ nào đều phải đi qua các mẫu ZNS đã được duyệt trước, không phải văn bản tự do.

Các giới hạn này tồn tại để đo đếm việc nhắn tin cho *khách hàng*. Hướng vào trong, chúng thuần túy là ma sát: chính nhân sự của chúng ta bị giới hạn tốc độ khi trò chuyện với chính công cụ của mình, và một lượt làm rõ mã HS nhiều lượt tương tác sẽ đốt hết hạn mức 8 tin chỉ trong một cuộc trao đổi.

## Quyết định

**v1 được triển khai dưới dạng một web app nội bộ đơn thuần.** Không Zalo OA, không kênh bot Zalo, không tự động hóa Zalo không chính thức.

Phân phối là một đường link — nhân sự có thể ghim nó vào một nhóm Zalo sẵn có. Chúng ta có được khả năng phân phối của Zalo mà không phải chịu thuế nền tảng của Zalo.

## Lý do căn bản

Vì sao web app thắng thế về mặt bản chất, chứ không chỉ về chi phí:

- **Sai lớp công cụ.** OA là một kênh thông báo hướng ra khách hàng. Chúng ta đang xây một công cụ tri thức/truy vấn nội bộ. Nền tảng được thiết kế cho thông báo giao dịch, không phải hỏi–đáp nội bộ qua lại.
- **Giao diện chính là sản phẩm.** v1 cung cấp một tra cứu biểu thuế chính xác (một bảng: HS + biểu + ngày → mức thuế suất) và top-3 ứng viên HS với bằng chứng ghi chú pháp lý nguyên văn bên cạnh mỗi ứng viên. Một bong bóng chat không hiển thị được thứ nào trong số đó cho ra hồn — không có bảng sắp xếp được, không có bằng chứng đặt cạnh nhau, không có di chuột xem trích dẫn, không có tải file lên. Sản phẩm cốt lõi của dự án này là *bằng chứng mà con người có thể kiểm toán*, và chat là bề mặt tệ nhất cho bằng chứng có thể kiểm toán. Xem [Phân loại HS](../concepts/hs-classification.md) và [Hệ thống Biểu thuế](../concepts/tariff-system.md).
- **Xác thực còn tệ hơn, không hề tốt hơn.** Zalo trao cho chúng ta một `user_id` mờ đục, không phải một định danh nhân viên. Dù sao chúng ta cũng sẽ phải xây một bảng ánh xạ — và đến lúc đó thì đăng nhập riêng của web app đơn giản hơn và cho chúng ta dấu vết kiểm toán thực theo từng nhân sự.
- **Không có gì trong đề xuất giá trị của Zalo áp dụng được.** Tiếp cận khách hàng, khám phá người theo dõi, broadcast ZNS — tất cả đều vô nghĩa với 50 người dùng nội bộ đã biết vốn đã có laptop công ty.
- **Chi phí mà không có hồi đáp.** 2.500.000đ/năm cộng phần vượt hạn mức 55đ/tin, để phục vụ những người dùng mà chúng ta đã có thể tiếp cận miễn phí.

## Các phương án đã cân nhắc

**Zalo OA gói Tăng trưởng (2.5tr/năm).** Bị bác — xem Lý do căn bản. Khả thi (chúng ta có GPKD), nhưng không hợp lý.

**Zalo OA gói Cơ bản hoặc Tiêu chuẩn.** Hoàn toàn không phải một phương án. Cả hai gói đều không có Chatbot hay Open API. Tiêu chuẩn là tiền mất mà chẳng được gì.

**Các thư viện không chính thức (zca-js, zlapi, zcago).** Bị loại. Chúng có thật và được duy trì tích cực — zca-js v2.1.2 phát hành 17/03/2026 (đã xác minh 2026-07-17, nguồn: https://github.com/RFS-ADRENO/zca-js) — và chúng hoạt động bằng cách giả lập Zalo Web từ một tài khoản *cá nhân* qua đăng nhập QR. Đó là vi phạm trực tiếp Điều khoản dịch vụ: zalo.vn/dieukhoan §4.7 cấm *"Đăng nhập và sử dụng Dịch Vụ bằng một phần mềm tương thích của bên thứ ba hoặc hệ thống không được phát triển, cấp quyền hoặc chấp thuận bởi Chúng tôi"*, và §13.2 cho phép khóa tài khoản ngay lập tức cộng với trách nhiệm bồi thường thiệt hại (đã xác minh 2026-07-17, nguồn: https://zalo.vn/dieukhoan/). Chính những người duy trì cũng nói vậy trong SECURITY.md: *"Using this API could get your account locked or banned."*

  Điểm mấu chốt là tài sản của *ai* bị đặt vào rủi ro: tài khoản bị cấm sẽ là **Zalo cá nhân của một nhân viên** — chính tài khoản họ dùng cho gia đình, OTP ngân hàng, và dịch vụ công. Ở Việt Nam một tài khoản Zalo cá nhân gần như là hạ tầng dân sự. Đem nó ra cược cho một công cụ tiện lợi nội bộ là một canh bạc cực kỳ bất cân xứng. Chỉ riêng rủi ro bị cấm đã đủ để loại, độc lập với bất kỳ phân tích pháp lý nào.

**Telegram Bot API.** Tốt hơn hẳn Zalo OA *nếu* thực sự cần một giao diện chat — miễn phí, không cần xác minh doanh nghiệp, không giới hạn tin nhắn, không cửa sổ thời gian. Vẫn bị bác cho v1, bởi vì phản đối về giao diện chat ở trên áp dụng y hệt cho Telegram: nó cũng không thể hiển thị một bảng biểu thuế có thể kiểm toán. Chi phí thực duy nhất của nó là mức độ phổ biến của Telegram trong đội ngũ logistics Việt Nam (thấp), tuy nhiên với 50 người đã biết thì đó là một lần cài đặt, không phải một bài toán tiếp cận công chúng.

**Zalo Mini App.** Không phải một bot — một web app bên trong Zalo, vẫn đòi hỏi một tài khoản nhà phát triển gắn với một pháp nhân doanh nghiệp. Nếu sau này chúng ta muốn phân phối kiểu Zalo-native, đây là lựa chọn khớp hơn một bot OA, nhưng nó chẳng mang lại gì hơn so với một đường link đơn thuần đối với người dùng nội bộ.

## Phạm vi

Áp dụng cho:

- Lựa chọn kênh v1: chỉ web app.
- Loại trừ mọi tích hợp Zalo, Telegram, hoặc nền tảng chat khác khỏi phần giao v1.
- Không ràng buộc các giai đoạn sau nếu đối tượng người dùng thay đổi — xem Yêu cầu rà soát.

## Hệ quả

- Không chi phí theo từng tin, không phê duyệt mẫu, không cửa sổ 48h, không cửa sổ OpenAPI 7 ngày, không phí nền tảng hằng năm.
- Toàn quyền về giao diện: bảng biểu, tải file lên, trích dẫn pháp lý nguyên văn đặt cạnh các ứng viên.
- Định danh nhân sự là của chúng ta, nên dấu vết kiểm toán theo từng người dùng cho các lần tra cứu biểu thuế là đơn giản — liên quan đến [Quy tắc Nghiệp vụ](../business-rules.md).
- Chúng ta phải tự thu hút người dùng của mình. Với 5–50 nhân sự nội bộ đã biết thì đây là một đường link trong nhóm chat, không phải bài toán tăng trưởng.
- Không có push kiểu mobile-native. Chấp nhận cho v1; nhân sự làm công việc này tại bàn làm việc.
- Nếu sau này đối tượng người dùng mở rộng ra ngoài công ty, quyết định này phải được xem xét lại — phân tích ở trên được đặt điều kiện rõ ràng trên phạm vi "chỉ nội bộ."

## Rủi ro

- **Ma sát tiếp nhận nếu nhân sự sống trong chat.** Giảm thiểu: web app phải liên kết được và nhanh; nếu nhân sự ngại mở trình duyệt, đó là một tín hiệu để xem xét lại — nhưng câu trả lời sẽ là một giao diện web tốt hơn hoặc một Mini App, chứ không phải một bot OA.
- **Lộ trình "người dùng bên ngoài" nổi lên muộn.** Nếu cuối cùng phải phục vụ những tài xế hoặc khách hàng không chịu cài gì, một OA trở thành một phương án thực sự và tiền đề của ADR này hết hiệu lực. Hãy hỏi sớm thay vì phát hiện ra sau khi v1 đã ra mắt.
- **Bảng giá lại thay đổi lần nữa.** Các gói đã thay đổi vào 01/06/2026 và có thể thay đổi lần nữa. Các con số ở đây mang một ngày xác minh chính vì lý do này; hãy xác minh lại trước khi trích dẫn chúng trong một dự toán ngân sách.

## Chưa xác minh / Không được dựa vào

**GÂY TRANH CÃI — hai lượt nghiên cứu mâu thuẫn với nhau về việc liệu có tồn tại một bot Zalo không cần OA hay không. Xung đột này chưa được giải quyết.**

- **Quan điểm A (nghiên cứu 11):** Không tồn tại một bot tự động tuân thủ Điều khoản dịch vụ nào mà không cần OA. Mọi tuyến chính thức đều đòi hỏi một OA làm định danh gửi tin; không có nhánh không-OA nào trong chính hướng dẫn chatbot của Zalo.
- **Quan điểm B (nghiên cứu 01):** Tồn tại một **Zalo Bot Platform riêng biệt** và độc lập với OA — gần như một bản sao của Bot API của Telegram. Khẳng định: được tạo bằng cách nhắn tin cho một OA "Zalo Bot Manager" trong ứng dụng, token được DM cho bạn; base URL `https://bot-api.zapps.me/bot{TOKEN}/{method}`; các phương thức `getMe`/`getUpdates`/`setWebhook`/`sendMessage`/`sendPhoto`/v.v.; **chỉ đòi hỏi một tài khoản Zalo cá nhân, không cần OA và không cần giấy phép kinh doanh** (nguồn được trích: https://bot.zapps.me/docs, console tại https://bot.zaloplatforms.com, được đối chứng qua https://www.zbot.com.vn/).

  Bản thân nghiên cứu 01 **không thể** xác minh giá của Bot Platform (`/docs/pricing/` trả về HTTP 500 mọi lần thử) cũng như liệu việc đo đếm tư vấn 48h/8-tin có áp dụng cho kênh Bot hay không.

**Đừng coi bất kỳ quan điểm nào là đã ngã ngũ.** Nếu một kênh Zalo từng được cân nhắc lại, sự tồn tại, tình trạng tuân thủ Điều khoản dịch vụ, giá cả, và hạn mức của Bot Platform phải được xác minh trên trình duyệt trước. Lưu ý rằng mâu thuẫn này **không** làm thay đổi quyết định v1: ngay cả khi Quan điểm B hoàn toàn đúng và một bot Zalo không-OA miễn phí có tồn tại, phản đối về giao diện chat vẫn tự đứng vững — một bong bóng chat vẫn không thể hiển thị một bảng biểu thuế có thể kiểm toán, vốn là toàn bộ mục đích của sản phẩm.

Các mục khác chưa được xác minh từ nguồn sơ cấp:

- **Chi tiết ký webhook.** developers.zalo.me là một SPA render bằng JS sau Cloudflare Turnstile; WebFetch và curl chỉ trả về khung trang. Danh sách sự kiện (`user_send_text`, `follow`, v.v.) được đối chứng qua tài liệu của bên tích hợp, nhưng header chữ ký chính xác và schema payload thì **không** được xác nhận từ nguồn chính thức.
- **Điểm bất thường "Số lượng App được ủy quyền".** Bảng giá chính thức hiển thị **1** app được ủy quyền cho Cơ bản và Tiêu chuẩn, điều này nằm khớp một cách kỳ lạ so với "Tích hợp Zalo Open API = ✗" trên chính các gói đó. Không thể dung hòa điều này từ tài liệu chính thức. Cách hiểu tạm thời là hạn mức ủy quyền app là một thuộc tính tài khoản chung trong khi *quyền truy cập* API được kiểm soát riêng — nhưng đây là một suy luận, không phải một sự thật đã xác minh. Hãy xác nhận với oa@zalo.me trước khi đặt cược tiền vào một gói rẻ hơn.
- **Mức độ phơi nhiễm Nghị định 15/2020.** Nghiên cứu 11 đánh giá rằng nó nhắm vào thông tin sai lệch và tin nhắn rác, chứ không phải tự động hóa nói chung, và rằng mức phơi nhiễm thực tế từ các thư viện không chính thức là bị cấm theo hợp đồng chứ không phải bị phạt hành chính. Được ghi nhận là đánh giá của agent đó, không phải là tư vấn pháp lý. Đừng thổi phồng góc độ pháp lý; rủi ro bị cấm mới là rủi ro có tác dụng thực.

## Yêu cầu rà soát

- Xem xét lại ADR này **chỉ khi** bot phải đối mặt với những tài xế hoặc khách hàng ngoài công ty, những người không chịu cài đặt gì. Đó là một lý do thực sự và nó làm thay đổi câu trả lời.
- Xác minh lại toàn bộ giá và hạn mức nhắn tin của Zalo trước bất kỳ quyết định ngân sách nào — các gói đã thay đổi vào 01/06/2026 và mọi con số ở đây đều mang ngày 2026-07-17.
- Giải quyết mâu thuẫn Quan điểm A so với Quan điểm B về Zalo Bot Platform trên trình duyệt trước khi định phạm vi bất kỳ công việc nào về kênh Zalo.
- Xác minh rằng các khung nhìn biểu thuế và ứng viên HS của web app thực sự hiển thị được bằng chứng mà một người khai hải quan cần để kiểm toán — lập luận về giao diện ở trên là nửa chịu lực của quyết định này, và nó phải đứng vững trong thực tế.

## Kiến thức liên quan

- [Bối cảnh Dự án](../project-context.md) — Customs Assistant là gì, phục vụ ai, ranh giới v1.
- [Quy tắc Nghiệp vụ](../business-rules.md) — chính sách bền vững, bao gồm quy tắc kiểm toán và quy tắc con-người-quyết-định.
- [Hệ thống Biểu thuế](../concepts/tariff-system.md) — tra cứu tất định mà giao diện này phải hiển thị.
- [Phân loại HS](../concepts/hs-classification.md) — vì sao top-3 ứng viên cần bằng chứng nguyên văn bên cạnh.
- [Quy trình Khai báo Hải quan](../workflows/customs-declaration.md) — nơi nhân sự thực sự ngồi khi họ dùng công cụ này.
- [Truy xuất RAG Pháp lý](../concepts/legal-rag-retrieval.md) — phạm vi giai đoạn sau, cùng ràng buộc hiển thị bằng chứng.
