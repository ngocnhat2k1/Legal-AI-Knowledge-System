---
type: architecture-decision
status: approved
updated: 2026-07-18
related:
  - README.md
  - ../project-context.md
  - ../business-rules.md
  - ../concepts/tariff-system.md
  - ../concepts/data-sources.md
  - ../concepts/hs-classification.md
  - ../concepts/legal-rag-retrieval.md
---

# Chỉ Dùng PostgreSQL Cho v1 — Không Qdrant, Neo4j, MinIO Hay BullMQ

## Trạng thái

Đã phê duyệt — 2026-07-17, bởi chủ dự án.

## Bối cảnh

Customs Assistant v1 làm hai việc: tra cứu biểu thuế tất định khóa theo HS + biểu + ngày, và gợi ý ứng viên mã HS trả về top-3 kèm bằng chứng ghi chú pháp lý nguyên văn. Xem [Bối cảnh Dự án](../project-context.md).

Lộ trình ban đầu đặt tên một cơ sở dữ liệu vector, một cơ sở dữ liệu đồ thị, một kho lưu trữ đối tượng và một hàng đợi công việc. ADR này loại bỏ cả bốn khỏi v1.

**Đây không phải là câu hỏi về năng lực.** Chủ dự án vững backend và có thể vận hành bất kỳ thứ nào trong số này. Đây là câu hỏi về những gì một công cụ nội bộ 5–50 người dùng có thể phân bổ chi phí. Mỗi thành phần thêm vào là thêm một tiến trình phải chạy, thêm một thứ phải sao lưu, thêm một thứ phải gỡ lỗi lúc 11 giờ đêm, và — ràng buộc quyết định — thêm một bề mặt code do AI sinh ra mà chủ dự án thiếu bối cảnh để rà soát cho đúng. Ngân sách rà soát, chứ không phải kỹ năng, mới là thứ khan hiếm.

Khối lượng công việc nhỏ và hình dạng của nó đã biết:

- Danh mục có **11.414 dòng tám chữ số** trải trên 21 phần / 97 chương / 1.228 nhóm / 4.084 phân nhóm (Thông tư 31/2022/TT-BTC) (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 10). Một lần phân tích độc lập có nhận biết phụ lục trên các phần `.doc` từ Công báo của Nghị định 26/2023 đã khôi phục **11.874 mã 8 chữ số duy nhất**, trong đó 11.160 mã có một mức thuế suất trong Phụ lục II (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12, https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm).
- Tra cứu biểu thuế **hoàn toàn không có thành phần ngữ nghĩa nào** — nó là một lần đọc bảng theo khóa với một vị từ thời gian, và không LLM nào chạm vào các con số ([Quy tắc Nghiệp vụ](../business-rules.md)).
- Bề mặt ngữ nghĩa duy nhất trong v1 là truy xuất trên Ghi chú Phần/Chương HS và Ghi chú Giải thích — cỡ 10⁴ đoạn, và thực hành đã công bố truy xuất **top-k = 5**, bởi vì RAG pháp lý suy giảm do lost-in-the-middle khi truy xuất quá nhiều (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 02, dẫn https://arxiv.org/pdf/2605.19806).
- Nhịp nạp dữ liệu tính bằng **tuần**, không phải sự kiện. Việc đăng Công báo trễ so với hiệu lực pháp lý **15–48 ngày** trên các nghị định được lấy mẫu (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12).

## Quyết định

**PostgreSQL là dịch vụ có trạng thái duy nhất trong v1.** NestJS + PostgreSQL (với pgvector) + Docker, và không gì khác.

- **pgvector thay thế Qdrant.** Các embedding sống trong cùng cơ sở dữ liệu với các khoảng hiệu lực thời gian mà chúng phải được lọc theo.
- **Bảng quan hệ và JOIN thay thế Neo4j.** Đồ thị sửa đổi/tham chiếu được mô hình hóa trong SQL.
- **Một bảng `jobs` cộng với một trình lập lịch thay thế BullMQ.** Việc nạp dữ liệu chạy dưới dạng một mẻ với các dòng ghi lại trạng thái, số lần thử, và kết quả.
- **Hệ thống tệp (một Docker volume) thay thế MinIO.** Các artifact `.doc` / PDF nguồn được lưu trên đĩa với checksum và xuất xứ của chúng được ghi trong PostgreSQL.

Mỗi thành phần có thể được thêm vào sau — nhưng chỉ khi một lý do cụ thể, được nêu tên, được quan sát xuất hiện. "Có thể chúng ta sẽ cần nó" không phải là một lý do. Gánh nặng chứng minh thuộc về việc bổ sung.

## Lý do căn bản

### pgvector, không phải Qdrant — bởi vì bộ lọc thời gian phải là một JOIN, không phải một tác vụ đồng bộ

Hiệu lực thời gian phải là một **bộ lọc cứng, không phải một tín hiệu xếp hạng**. Các LLM cho thấy một thiên lệch về tính mới có thể đo được — thiên về các điều khoản mới hơn ngay cả khi phiên bản cũ mới là phiên bản áp dụng — mà chỉ riêng RAG không khắc phục được; các cách tiếp cận coi hiệu lực là một ràng buộc cứng cải thiện hiệu năng đáng kể (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 02, dẫn https://arxiv.org/abs/2605.23497). Truy vấn tại-một-thời-điểm là một vị từ khoảng tất định: `tv.valid_start ≤ t < coalesce(tv.valid_end, +∞)` (đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2505.00039).

Trong pgvector vị từ đó là một mệnh đề `WHERE` trong cùng một transaction với phép tìm kiếm vector. Với Qdrant, các khoảng hiệu lực trở thành một payload phi chuẩn hóa trong một hệ thống thứ hai, và tính đúng đắn giờ đây phụ thuộc vào hai kho dữ liệu đồng thuận với nhau. **Chế độ hỏng của dự án này là dữ liệu sai trông có vẻ hợp lý mà lại báo thành công** — một payload lỗi thời trong một vector DB chính xác là như vậy, và nó tạo ra một câu trả lời tự tin trích dẫn một điều khoản đã bị bãi bỏ. Qdrant mua cho chúng ta throughput mà chúng ta không cần với cái giá là chính thuộc tính duy nhất mà chúng ta không thể đánh mất.

Quy mô khẳng định điều đó: ~10⁴ đoạn với top-k = 5. Đây không phải là một khối lượng công việc làm căng thẳng một chỉ mục Postgres.

### JOIN, không phải Neo4j — bởi vì bằng chứng mạnh nhất ủng hộ một đồ thị lại tự thừa nhận nó chưa được chứng minh

Tiền lệ Việt Nam đã công bố tốt nhất là SBV-LawGraph: một đồ thị tri thức pháp lý trong Neo4j với bốn loại quan hệ (Sửa đổi/Bổ sung, Bãi bỏ, Thay thế, Hướng dẫn/Quy định), duyệt 1 bước, đạt điểm ALQAC R@1 **0.69** so với **0.57** của một baseline hybrid-RAG (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf). Hấp dẫn — cho đến khi xét các cảnh báo của chính các tác giả: **không có ablation nào cô lập đóng góp của đồ thị** (nên tác động độc lập của KG là chưa được chứng minh), một tập đánh giá 100 cặp hỏi–đáp, không có kiểm toán chất lượng KG, tính đúng đắn nhị phân với hai người chú giải và không có độ đồng thuận giữa các người chú giải (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 02).

Vậy nên lập luận cho Neo4j là: một đóng góp chưa được đo lường cho một nhiệm vụ mà v1 không xây. Bốn loại quan hệ, duyệt 1 bước, ở quy mô kho ngữ liệu của chúng ta, là một bảng với một khóa ngoại và một phép tự-join.

**Chỉ xem xét lại khi có một trigger cụ thể:** nếu `provisionTree` / `referenceProvisions` của vbpl hóa ra được điền dữ liệu trên toàn trang, thì đó là một đồ thị pháp lý ở cấp điều khoản (điều/khoản) trên ~158.826 văn bản với 27 quan hệ hai chiều có kiểu — một tài sản thực sự mang hình dạng đồ thị, và đáng để mở lại quyết định này. Hôm nay cả hai trường đều **`null` trên mọi văn bản được lấy mẫu**, và ánh xạ `referenceType` int → nhãn là chưa biết (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 04). Xem [Nguồn Dữ liệu](../concepts/data-sources.md) và Các câu hỏi mở trong [Bối cảnh Dự án](../project-context.md#câu-hỏi-mở).

### Một bảng jobs, không phải BullMQ — bởi vì hàng đợi tối ưu sai trục

Trực giác cho rằng luật mới cần các pipeline nhanh. Phép đo lường lại nói khác: **Nghị định 72/2026/NĐ-CP được ký ngày 09/03/2026 và có hiệu lực pháp lý ngay trong ngày ("kể từ ngày ký"), nhưng chỉ được đăng Công báo số 157 vào 24/03/2026 — 15 ngày sau khi nó đã là luật ràng buộc** (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12). Trong khoảng thời gian đó mức thuế suất đang có hiệu lực không tồn tại ở dạng máy đọc được ở bất kỳ đâu.

Một hàng đợi công việc giảm độ trễ điều phối vài giây so với một nút thắt cổ chai đo bằng tuần, và nó không thể tạo ra một văn bản chưa được đăng công báo. Biện pháp giảm thiểu đúng đắn là **từ chối khi dữ liệu lỗi thời trong hợp đồng đầu ra**, chứ không phải worker nhanh hơn. Nạp dữ liệu là một mẻ theo lịch trên một số ít văn bản; một bảng `jobs` cho ta tính idempotent, trạng thái thử lại và một dấu vết kiểm toán trong cùng transaction với dữ liệu mà nó tạo ra — điều mà BullMQ, sống trong một kho riêng, sẽ không làm được.

### Đĩa, không phải MinIO — bởi vì dung lượng nhỏ và xuất xứ mới là yêu cầu thực sự

Kho ngữ liệu khiêm tốn: Nghị định 26/2023 là **14 phần `.doc`** trên Công báo; RCEP (129/2022) là **51**; EVFTA (116/2022) là **16** (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12). Ngay cả các bản quét dự phòng cũng nhỏ — hai file PDF của ND 26/2023 là 19.0 MB và 15.5 MB cho 1.016 trang quét đen-trắng CCITT-fax (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12). Cùng lắm là vài gigabyte, hiếm khi ghi, hiếm khi đọc.

Thứ chúng ta thực sự cần từ kho lưu trữ artifact là **xuất xứ** — số công báo nào, URL nào, checksum nào, truy xuất khi nào — và đó là một dòng Postgres trỏ tới một file, không phải một API S3. MinIO sẽ thêm một dịch vụ, một bộ thông tin xác thực và một câu chuyện sao lưu để giải quyết một bài toán mà `cp` đã giải.

## Các phương án đã cân nhắc

- **Thêm pgvector ngay bây giờ, thêm Qdrant sau nếu chất lượng truy xuất đòi hỏi.** Được giữ làm phương án còn hiệu lực — nó là con đường di trú, không phải một phương án bị bác. Trigger sẽ là recall hoặc độ trễ được đo lường thất bại, không phải chỉ riêng kho ngữ liệu tăng trưởng.
- **Neo4j ngay bây giờ vì giai đoạn RAG sau này sẽ cần nó.** Bị bác. Giai đoạn sau rõ ràng không nằm trong phạm vi ([Truy xuất RAG Pháp lý](../concepts/legal-rag-retrieval.md) được đánh dấu KHÔNG XÂY TRONG v1). Cấp phát một cơ sở dữ liệu cho một giai đoạn mà yêu cầu của nó chưa được viết ra là cách bạn có được một schema mà không ai chọn.
- **BullMQ ngay bây giờ vì việc nạp dữ liệu sẽ tăng trưởng.** Bị bác. Nó cùng lắm sẽ tăng lên thành ~1.228 lệnh gọi HTTP lịch sự, trên con đường customs.gov.vn gây tranh cãi mà dù sao chúng ta cũng không phụ thuộc (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 10). Một mẻ xử lý được nó.
- **SQLite thay vì PostgreSQL.** Bị bác: pgvector, tìm kiếm toàn văn, và các kiểu range/interval chính xác là thứ mà mô hình song thời gian cần, và Postgres là thứ chủ dự án đã sẵn vận hành.

## Phạm vi

Chỉ áp dụng cho v1 — hai tính năng được nêu tên trong [Bối cảnh Dự án](../project-context.md#trong-phạm-vi):

- Các dịch vụ `docker-compose`: chỉ ứng dụng NestJS + PostgreSQL (extension pgvector).
- Kho biểu thuế, các bảng phiên bản hóa song thời gian, các bảng sửa đổi/tham chiếu, các embedding ghi chú HS, bảng `jobs`, và bảng xuất xứ artifact đều sống trong một cơ sở dữ liệu PostgreSQL.
- Các artifact nguồn trên một Docker volume, được tham chiếu theo dòng.

**Không** quyết định điều gì cho giai đoạn RAG-trên-luật-logistics sau này. Giai đoạn đó mở lại ADR này với bằng chứng của riêng nó.

## Hệ quả

- Một tiến trình phải chạy, một thứ phải sao lưu, một lần diễn tập khôi phục, một chuỗi kết nối.
- Các lỗi nhất quán chéo giữa các kho là bất khả về mặt cấu trúc trong v1, bởi vì không có kho thứ hai.
- Bề mặt rà soát code do AI sinh ra nằm gọn bên trong SQL và NestJS — hai thứ mà chủ dự án thực sự có thể rà soát từng dòng.
- Chất lượng truy xuất bị giới hạn bởi những gì pgvector + tìm kiếm toàn văn Postgres có thể làm. Nếu giới hạn đó chạm ngưỡng, chúng ta sẽ biết từ một phép đo lường, và việc thay vào một vector DB là một thay đổi có phạm vi giới hạn bởi vì các embedding đã được cô lập sau một repository.
- Không có câu chuyện mở rộng theo chiều ngang. Đúng vậy: 5–50 người dùng nội bộ không cần đến nó, và xây một cái ngay bây giờ sẽ là công sức bỏ ra chống lại một tải trọng không tồn tại.
- Bất kỳ ai đề xuất một thành phần mới phải mang theo quan sát thúc đẩy nó. Ma sát đó chính là điểm mấu chốt.

## Rủi ro

- **Xếp hạng tìm kiếm toàn văn của Postgres không phải là BM25.** Nghiên cứu chỉ định truy xuất hybrid từ vựng + dense, có trọng số ~75/25 nghiêng về phía từ vựng khi dùng một embedding chưa được tinh chỉnh — bởi vì các embedding dense dùng ngay ra khỏi hộp *thua* BM25 trên văn bản pháp lý tiếng Việt (BM25 R@1 **0.57** so với dense ngây thơ R@1 **0.36**), và các thuật ngữ chuyên môn như "có thể" so với "phải" chính xác là những token mà embedding dense làm mờ đi (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 02, https://lexuanbach.github.io/publication/ACIIDS2026a.pdf). Liệu xếp hạng `tsvector` của Postgres có phải là một vật thay thế thỏa đáng cho BM25 trên kho ngữ liệu này hay không là **một giả định kỹ thuật, không phải một phát hiện nghiên cứu — không ai đo lường nó cả.** Hãy kiểm thử nó trước khi tin cậy nhánh truy xuất. Đây là lý do có khả năng nhất khiến ADR này bị xem xét lại.
- **Cấu hình tìm kiếm văn bản tiếng Việt.** Việc tách từ tiếng Việt gắn với mô hình và phải khớp với việc tiền huấn luyện của mô hình embedding (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 02). Việc đó tương tác thế nào với các cấu hình tìm kiếm văn bản của Postgres thì chưa được kiểm thử ở đây.
- **Lưu trữ đĩa "tạm thời" trở thành trạng thái không được quản lý vĩnh viễn.** Giảm thiểu: mỗi file artifact có một dòng Postgres với checksum và URL nguồn; một file không có dòng là rác, một dòng không có file là một cảnh báo.
- **Ai đó đọc ADR này thành "không bao giờ dùng những công cụ này."** Nó nói: không phải bây giờ, và đây là trigger cho từng cái.

## Yêu cầu rà soát

- Xác minh rằng không đường code v1 nào phụ thuộc vào API customs.gov.vn gây tranh cãi. Báo cáo 10 và 12 từng mâu thuẫn về việc endpoint nào là backend sống, nhưng chúng mô tả hai endpoint khác nhau và **xung đột đã được giải quyết (2026-07-18)**: chủ dự án quan sát trực tiếp trên trình duyệt (tab Network) rằng cổng biểu thuế gọi endpoint "bridge" (POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue) và nhận về dữ liệu — xác nhận báo cáo 10, bác giả thuyết "vỏ JS chết chỉ trỏ tới raw IP" của báo cáo 12; raw IP 123.30.210.236:8080 cố tình không theo đuổi — xem [Nguồn Dữ liệu](../concepts/data-sources.md) và [Bối cảnh Dự án](../project-context.md#câu-hỏi-mở). Việc này không nâng trạng thái của API: nó vẫn chỉ là lớp đối chiếu tiện lợi, không phải nguồn chân lý pháp lý — cả hai báo cáo đồng thuận nó không có cấp phép Điều khoản dịch vụ, không có SLA, không có phiên bản hóa và **không có thẩm quyền pháp lý — Nghị định mới có**.
- Xác minh rằng vị từ thời gian là một bộ lọc `WHERE` trong cùng truy vấn với bất kỳ tìm kiếm vector nào, không bao giờ là một hậu-lọc và không bao giờ là một đầu vào xếp hạng.
- Xác minh rằng định danh phụ lục (Phụ lục I xuất khẩu so với Phụ lục II nhập khẩu) là một phần của khóa chính, không phải được suy ra. **1.520 mã HS xuất hiện trong cả hai phụ lục của ND 26/2023 và 1.329 mã mang mức thuế suất khác nhau** — một bộ phân tích mù phụ lục trả về mức thuế xuất khẩu cho một câu hỏi nhập khẩu ở tỷ lệ thành công biểu kiến 94% (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12). Xem [Hệ thống Biểu thuế](../concepts/tariff-system.md).
- Xác minh rằng bảng `jobs` ghi lại số lần thử và kết quả một cách bền vững đủ để trả lời "lần cuối chúng ta nạp thành công X là khi nào, và từ số công báo nào?"
- Xác minh rằng mỗi file artifact trên đĩa có một dòng xuất xứ tương ứng.
- Trước khi thêm bất kỳ thành phần nào đã bị loại bỏ ở đây, hãy ghi lại quan sát thúc đẩy nó trong một ADR mới thay thế ADR này.

## Chưa xác minh / Không được dựa vào

- **Xung đột về API customs.gov.vn đã được giải quyết (2026-07-18)**: chủ dự án quan sát trực tiếp trên trình duyệt (tab Network) rằng cổng gọi endpoint "bridge" và nhận về dữ liệu (xác nhận báo cáo 10, bác giả thuyết "vỏ JS chết" của báo cáo 12). Đây là quan sát trên tab Network — **chưa** tái hiện bằng bare curl từ mạng công ty, **chưa** bắt mẫu response cho một HS đã biết để đối chiếu với bộ phận khai báo, và **chưa** dò giới hạn tốc độ; các việc này còn tồn đọng nhưng không chặn thiết kế. Được tái hiện đầy đủ trong [Nguồn Dữ liệu](../concepts/data-sources.md).
- **Postgres FTS như một vật thay thế BM25 là chưa được đo lường** — xem Rủi ro. Đây là giả định của chúng ta, không phải của nghiên cứu.
- **Việc liệu đồ thị cấp điều khoản của vbpl có được điền dữ liệu hay không là câu hỏi mở có giá trị cao nhất** và là trigger được nêu tên duy nhất để cân nhắc lại Neo4j. Cả `provisionTree` và `referenceProvisions` đều `null` trên mọi văn bản được lấy mẫu; thông cáo tái ra mắt tháng 4 năm 2026 tuyên bố có mô hình hóa ở cấp điều khoản, nhưng không ai xác nhận được điều đó (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 04).
- **Đóng góp đồ thị của SBV-LawGraph là chưa được chính các tác giả của nó chứng minh** (không ablation, tập đánh giá 100 cặp hỏi–đáp). Đừng trích dẫn điểm 0.69 R@1 của nó làm bằng chứng rằng một cơ sở dữ liệu đồ thị sẽ giúp ích cho chúng ta.

## Kiến thức liên quan

- [Bối cảnh Dự án](../project-context.md)
- [Quy tắc Nghiệp vụ](../business-rules.md)
- [Chỉ mục Quyết định Kiến trúc](README.md)
- [Hệ thống Biểu thuế](../concepts/tariff-system.md)
- [Nguồn Dữ liệu](../concepts/data-sources.md)
- [Phân loại HS](../concepts/hs-classification.md)
- [Truy xuất RAG Pháp lý](../concepts/legal-rag-retrieval.md) — giai đoạn tương lai; mở lại quyết định này
- [Văn bản Pháp luật Việt Nam](../concepts/vietnamese-legal-documents.md)
- [Tổ chức Mã nguồn](../docs/code-organization.md)
- [Chỉ mục Bộ nhớ Agent](../index.md)
