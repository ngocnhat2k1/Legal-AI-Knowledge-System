---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../concepts/vietnamese-legal-documents.md
  - ../concepts/data-sources.md
  - ../concepts/legal-rag-retrieval.md
  - ../concepts/tariff-system.md
  - ../business-rules.md
  - ../project-context.md
---

# Dùng Văn Bản Hợp Nhất Đã Công Bố Làm Lớp Văn Bản; Không Tự Tính Toán Hợp Nhất

## Trạng thái

Đã phê duyệt (chủ dự án phê duyệt 2026-07-17)

## Bối cảnh

Luật Việt Nam được sửa đổi tại chỗ bởi các văn bản khác: một Nghị định nói "sửa đổi Khoản 2 Điều 5", "bổ sung Điều 5a", "bãi bỏ cụm từ X tại Khoản 2". Do đó một văn bản gốc đọc một mình là chủ động sai. Kiểm kê kho corpus phát hiện văn bản gốc gây hiểu lầm ở ít nhất sáu tiểu lĩnh vực logistics, và các văn bản hợp nhất hiện hành đã tồn tại cho những cái mà chúng ta quan tâm: 96/VBHN-VPQH (Luật Thuế XNK, 31/03/2026), 46/VBHN-BTC (NĐ 08/2015 về thủ tục hải quan), 24/VBHN-BCT (NĐ 69/2018 về ngoại thương), 52/VBHN-VPQH (Bộ luật Hàng hải), 56/VBHN-VPQH (Luật GTĐTNĐ), 08/VBHN-BGTVT (NĐ 08/2021) (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 03 — kiểm kê kho corpus pháp lý logistics Việt Nam).

Vì vậy câu hỏi không phải là "chúng ta có cần văn bản hợp nhất không" — chúng ta cần — mà là **ai hợp nhất: nhà nước, hay chúng ta?** Xây dựng một cỗ máy biến đổi văn bản áp dụng các chỉ dẫn sửa đổi lên văn bản gốc là phương án được đặt lên bàn.

Sự phản đối lịch sử đối với việc phụ thuộc vào hợp nhất đã công bố là về mặt pháp lý, không phải kỹ thuật: văn bản hợp nhất (VBHN) trước đây từng là một văn bản mang tính tiện lợi không có thẩm quyền độc lập. Về mặt hình thức bạn buộc phải trích dẫn văn bản gốc cộng với từng văn bản sửa đổi, nên một trích dẫn dựa trên VBHN không phải là thứ mà một người khai có thể đứng ra bảo vệ.

**Sự phản đối đó đã bị gỡ bỏ hai tuần trước quyết định này.** Pháp lệnh 01/2026/UBTVQH16 (UBTVQH, ban hành 10/6/2026, hiệu lực 01/7/2026) sửa đổi Pháp lệnh hợp nhất VBQPPL 2012 và quy định:

> "Văn bản hợp nhất được cơ quan, tổ chức, cá nhân sử dụng làm căn cứ chính thức trong viện dẫn và áp dụng pháp luật"

Văn bản hợp nhất nay là một **căn cứ chính thức để viện dẫn và áp dụng pháp luật**. Pháp lệnh cũng mở rộng phạm vi VBHN đến VBQPPL cấp tỉnh/xã (trước đây chỉ cơ quan trung ương), mở rộng nó đến bãi bỏ một phần / đình chỉ một phần / tiếp tục hiệu lực một phần, và — lần đầu tiên trong luật Việt Nam về hợp nhất — nêu tên AI/chuyển đổi số một cách tường minh, với Bộ Tư pháp chủ trì (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm · https://xaydungchinhsach.chinhphu.vn/van-ban-hop-nhat-duoc-su-dung-lam-can-cu-chinh-thuc-trong-vien-dan-va-ap-dung-phap-luat-119260625165619689.htm).

ADR này bao trùm **lớp văn bản pháp lý** (các đoạn bằng chứng v1 cho gợi ý HS; RAG về sau). Nó không bao trùm các con số biểu thuế — xem Phạm vi.

## Quyết định

1. **VBHN đã công bố là lớp văn bản chính.** Ở nơi nào tồn tại một VBHN hiện hành cho một văn bản mà chúng ta nạp, hãy lập chỉ mục VBHN, không phải văn bản gốc. Văn bản gốc chỉ được nạp khi không có VBHN.
2. **Chúng ta không tính toán hợp nhất.** Không có thành phần nào phân tích "sửa đổi Khoản 2 Điều 5" thành một phép biến đổi văn bản. Các chỉ dẫn sửa đổi được lưu như *dữ liệu về* các chuyển đổi, không bao giờ được thực thi như các phép chỉnh sửa.
3. **Chúng ta duy trì một đồ thị sửa đổi phía trên lớp văn bản**, giữ nguồn gốc xuất xứ (văn bản nào đã thay đổi điều khoản nào, khi nào) và các khoảng hiệu lực theo từng phiên bản của điều khoản.
4. **Trích dẫn là đến một VBHN cụ thể với số hiệu và ngày của nó** (ví dụ "96/VBHN-VPQH, 31/03/2026"), vì một VBHN là một ảnh chụp và một trích dẫn không có ngày của nó là không thể phản chứng.
5. **Ở nơi không có VBHN và văn bản gốc đã biết là bị sửa đổi, hệ thống nói ra điều đó** thay vì phục vụ văn bản gốc như thể nó là hiện hành.

## Cơ sở lập luận

**Vì sao là đã công bố, không phải tự tính toán:**

- **Thẩm quyền.** Các trích dẫn thừa hưởng vị thế chính thức theo Pháp lệnh 01/2026/UBTVQH16 (ở trên). Một văn bản mà chúng ta tự hợp nhất hoàn toàn không có thẩm quyền — nếu một người khai bị chất vấn, "cỗ máy của chúng tôi đã gộp các sửa đổi" không phải là một sự biện hộ. Đây là toàn bộ điểm mấu chốt đối với một công cụ nội bộ mà đầu ra của nó nằm trên một tờ khai ràng buộc về mặt pháp lý.
- **Mô hình học thuật hàng đầu cũng từ chối làm điều đó.** SAT-Graph RAG (Hudson de Martim, arXiv:2505.00039, nghiên cứu trường hợp Hiến pháp Brazil) là mô hình thời gian công khai phát triển nhất cho lập pháp — phân tách Work/Expression lấy cảm hứng từ LRMoo, Component Temporal Versions với các khoảng hiệu lực, truy vấn tại-một-thời-điểm như một vị từ khoảng tất định `tv.valid_start ≤ t < coalesce(tv.valid_end, +∞)`. Nó **"giả định rằng kho corpus văn bản pháp lý đã chứa sẵn các phiên bản đã hoàn thiện này"**; các nút Action sửa đổi của nó *giải thích* các chuyển đổi chứ không *thực thi* chúng. Nếu cách tiếp cận cấu trúc tinh vi nhất hiện có từ chối phân tích các chỉ dẫn sửa đổi thành các phép biến đổi văn bản, thì đó là một tín hiệu mạnh về mức độ khó, không phải một sự sơ suất (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 02, trích dẫn https://arxiv.org/abs/2505.00039).
- **Các trường hợp biên là vô hạn và bằng ngôn ngữ tự nhiên.** Các chỉ dẫn sửa đổi của Việt Nam là văn xuôi bất quy tắc: "bổ sung Điều 5a", "bãi bỏ cụm từ X tại Khoản 2", "thay thế cụm từ...". Một cỗ máy biến đổi không có văn phạm đóng nào để triển khai theo, không có oracle nào để kiểm thử theo, và không có thẩm quyền nào để lui về khi nó sai. Hình thái thất bại của nó là lặng lẽ: văn bản nghe hợp lý, luật sai. Đó chính là cùng một hình thái thất bại mà nghiên cứu biểu thuế đã tìm thấy ở một trình phân tích "thành công" 94% vốn trả về thuế xuất khẩu cho các câu hỏi nhập khẩu (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 12).

**Vì sao VBHN đơn thuần là chưa đủ** — ba lỗ hổng buộc phải có đồ thị sửa đổi:

- **Độ phủ.** Không phải mọi văn bản đều có một VBHN hiện hành; việc công bố trễ hơn việc sửa đổi. Chính khuyến nghị của báo cáo 03 là VBHN "ở bất cứ đâu tồn tại một cái" — chính cái điều kiện đó là vấn đề.
- **Không có lịch sử thời gian.** Một VBHN là một ảnh chụp của "hiện tại". "Quy tắc nào đã áp dụng vào ngày khai báo năm 2023?" không thể trả lời được từ nó. Tính hiệu lực thời gian phải là một **bộ lọc cứng, không phải một tín hiệu xếp hạng**: các LLM một cách đo lường được áp dụng các quy tắc lỗi thời *và* ưu tiên các điều khoản mới hơn khi điều khoản cũ hơn mới là cái áp dụng, và riêng RAG không khắc phục sự thiên lệch về mới đó (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 02, trích dẫn arXiv:2605.23497, 312 cặp hỏi-đáp luật định tiếng Đức đã được kiểm chứng trên năm LLM lớn). Quy mô của vấn đề: trong 1.703 văn bản của Ngân hàng Nhà nước, 863 bị bãi bỏ toàn bộ, 191 bị bãi bỏ một phần, 639 còn hiệu lực — **~62% của một kho corpus Việt Nam thực tế là luật đã chết hoặc chết một phần** (nguồn: SBV-LawGraph, ACIIDS 2026, https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).
- **Nguồn gốc xuất xứ.** "Nghị định nào đã thay đổi Khoản này, và khi nào?" là một câu hỏi mà người dùng của chúng ta sẽ hỏi, và không ảnh chụp nào trả lời được.

**Vì sao điều này rẻ để xây dựng:** vbpl.vn đã phơi bày 27 quan hệ song hướng có kiểu bao gồm `consolidated/consolidates`, `amended/amends`, `replaced/replaces`, `abrogated/abrogates` — các cạnh của đồ thị được công bố, không phải suy diễn (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 04). Bộ dữ liệu HF `th1nhng0/vietnamese-legal-documents` mang 897.890 dòng quan hệ và `tinh_trang_hieu_luc`, được gắn khóa theo các vbpl ItemID mà lần tái dựng trang tháng 4 năm 2026 đã bảo toàn — một khung xương đồ thị miễn phí (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 04, đã xác minh đối chiếu với HF datasets-server API).

**Mẫu hình hiệu quả đáng học từ SAT-Graph:** một phiên bản cha mới vào ngày Dₙ là một phép *tổng hợp* tái sử dụng các phiên bản hiện có của các con không thay đổi. Chúng ta không nhân bản cả một Luật cho mỗi sửa đổi; chỉ các thành phần đã thay đổi mới nhận được các phiên bản mới.

## Phạm vi

Áp dụng cho:

- Đường ống nạp văn bản pháp lý và lược đồ lưu trữ của nó (lớp văn bản + đồ thị sửa đổi/hiệu lực).
- Các đoạn bằng chứng được trả về cùng với các mã HS ứng viên (tính năng 2 của v1) — ghi chú pháp lý nguyên văn phải đến từ một VBHN có ngày hoặc một văn bản gốc được nêu rõ.
- RAG về sau trên luật logistics Việt Nam.

**Không** áp dụng cho:

- **Các con số thuế suất.** Những con số đó đến từ bảng biểu thuế tất định được gắn khóa theo HS + schedule + date, lấy nguồn từ các phần công báo `.doc` của Công báo, không phải từ văn xuôi VBHN. VBHN của một nghị định biểu thuế không giải quyết cái bẫy phụ lục hay khoảng trống độ-trễ-công-báo — xem [Hệ thống biểu thuế](../concepts/tariff-system.md) và báo cáo 12.
- Bất kỳ việc sinh nội dung bằng AI nào trên các con số. Không bị thay đổi bởi ADR này.

## Các phương án đã cân nhắc

| Phương án | Vì sao bị bác |
|---|---|
| **Tự tính toán hợp nhất từ các chỉ dẫn sửa đổi** | Các trường hợp biên bằng ngôn ngữ tự nhiên là vô hạn; không có thẩm quyền để lui về; hình thái thất bại lặng lẽ; SAT-Graph — mô hình hàng đầu — từ chối làm điều đó. |
| **Phục vụ văn bản gốc + các văn bản sửa đổi, để người dùng tự gộp** | Đây là thứ mà chế độ pháp lý trước-01/7/2026 đã ép buộc, và là thứ mà nhân viên đã làm bằng tay. Nó tái tạo lại chính công việc thủ công mà công cụ tồn tại để loại bỏ, và giờ đây nó là không cần thiết. |
| **Mua một kho corpus hợp nhất thương mại (thuvienphapluat.vn)** | Bản hợp nhất được biên tập của họ là công việc biên tập thực sự, nhưng robots.txt của họ nêu tên ClaudeBot với `Disallow: /`, mang `Content-Signal: search=yes, ai-train=no, use=reference` như một tuyên bố bảo lưu theo Điều 4 EU DSM, và dù sao Cloudflare cũng chặn cứng việc lấy dữ liệu tự động (đã xác minh 2026-07-17, nguồn: báo cáo 04 và 12). Nếu chúng ta muốn nó, chúng ta cấp phép nó. Không phải một quyết định về scraping. |
| **Chỉ VBHN, không có đồ thị sửa đổi** | Thất bại ở các lỗ hổng độ phủ, không có lịch sử thời gian, và không thể trả lời về nguồn gốc xuất xứ. |

## Hệ quả

- Các trích dẫn mang vị thế chính thức (hậu-01/7/2026) thay vì là bản tái dựng của chính chúng ta.
- Chúng ta phải theo dõi **độ tươi mới của VBHN**, không chỉ sự tồn tại của văn bản: một VBHN lỗi thời cũng sai như một văn bản gốc, và trông có thẩm quyền hơn.
- Đường ống nạp dữ liệu cần một nhánh "không có VBHN hiện hành" vốn hạ cấp một cách trung thực thay vì lặng lẽ phục vụ văn bản gốc.
- Mỗi phiên bản điều khoản cần một khoảng hiệu lực, và việc truy xuất phải lọc theo nó như một ràng buộc cứng trước khi xếp hạng.
- Trình nạp đồ thị **phải chịu được các cạnh gãy**: các đích tham chiếu của vbpl có thể trỏ tới các văn bản chưa được công bố (ví dụ Luật Thuế TNCN 2007, id 12898, được tham chiếu với `status:"Confirm_Step2"`, vắng mặt trong sitemap, trang hiển thị "Văn bản không tồn tại") (đã xác minh 2026-07-17, nguồn: báo cáo 04).
- Quyết định này tự nó không làm giảm rủi ro ảo giác. Việc neo cơ sở vẫn phải xác minh rằng điều khoản được trích dẫn *ủng hộ mệnh đề*, không chỉ là nó giải quyết được — Lexis+ AI đã trả về một trích dẫn thật, được định dạng đúng cho các ý kiến của một thẩm phán hư cấu, tức là "không ảo giác theo một nghĩa hẹp" (đã xác minh 2026-07-17, nguồn: Magesh et al., *Hallucination-Free?*, JELS 2025, https://doi.org/10.1111/jels.12413).

## Rủi ro

- **Độ trễ công bố VBHN.** Giữa lúc một sửa đổi có hiệu lực và lúc VBHN của nó xuất hiện, lớp văn bản của chúng ta tụt sau luật và chúng ta có thể không biết. Giảm thiểu: đồ thị sửa đổi cho chúng ta tín hiệu (một văn bản sửa đổi mới không có cập nhật VBHN tương ứng = một cờ đã-biết-là-lỗi-thời), nhưng cửa sổ đó là có thực.
- **Quá tin vào thẩm quyền mới.** Pháp lệnh 01/2026/UBTVQH16 làm cho VBHN có thể trích dẫn được; nó không làm cho bất kỳ VBHN cụ thể nào đúng hay hiện hành. Ngày trên trích dẫn mới là thứ làm việc.
- **Trích dẫn VBHN không có ngày.** Nếu chúng ta từng phát ra "theo VBHN Luật Thuế XNK" mà không có số hiệu và ngày, chúng ta đã tạo ra một trích dẫn không thể phản chứng. Hãy coi đó là một khiếm khuyết.

## Chưa xác minh / Không được dựa vào

- **Bản thân sự tổng hợp là một suy diễn thiết kế, không phải một kết quả đã công bố.** Báo cáo 02 gắn thẻ "hợp nhất làm lớp văn bản + đồ thị sửa đổi làm lớp nguồn-gốc/thời-gian" là **[Speculative — my design inference, not a published result]**. *Thay đổi pháp lý* (VBHN có thể trích dẫn từ 01/7/2026) là **[Established]**; *kiến trúc* thì không.
- **SAT-Graph không báo cáo đánh giá định lượng nào.** Nó là một đề xuất kiến trúc, không phải một kết quả thực nghiệm, và bất chấp cách nó tự định khung, nó triển khai **chỉ valid time, không phải song thời gian thực sự**. Hãy áp dụng mô hình dữ liệu; đừng trích dẫn nó như bằng chứng về hiệu năng (nguồn: báo cáo 02).
- **Các con số của SBV-LawGraph có tính định hướng, không phải dứt khoát.** Chính các tác giả liệt kê: tập đánh giá 100-QA, **không có ablation cô lập đóng góp của KG**, không có kiểm toán chất lượng KG, tính đúng đắn nhị phân với hai người chú giải và không báo cáo mức đồng thuận giữa các người chú giải.
- **Liên kết cấp điều khoản trên vbpl — ĐO 2026-07-18 (TASK-004): KHÔNG có.** Lấy mẫu 21 văn bản đã công bố: `referenceProvisions` và `provisionTree` = `null` trên 21/21 (tham chiếu chỉ ở cấp văn bản). **Có** cây điều khoản Chương→Điều→Khoản→Điểm qua một Server Action *khác* — nhưng đó là *cấu trúc*, không phải *cạnh trích dẫn cấp điều khoản*; **đồ thị nguồn-gốc/sửa-đổi cấp điều khoản vẫn phải tự dựng** (đúng như "ba khoảng trống" của VBHN đã nêu). Xem [research/task-004-vbpl-provisiontree](../../research/task-004-vbpl-provisiontree/README.md). `referenceType` int→nhãn vẫn chưa join được (nay thấy 8 giá trị: 1, 3, 4, 7, 8, 9, 10, 12).
- **Báo cáo 04 và 12 bất đồng về khả năng crawl của vbpl.vn, và xung đột chưa được giải quyết hoàn toàn.** Báo cáo 12 phát hiện `Disallow: /Pages/` loại trừ mọi URL văn bản (`vbpl.vn/.../Pages/vbpq-toanvan.aspx?ItemID=...`) và các lỗi 404 trên các URL đã được lập chỉ mục. Báo cáo 04, kiểm tra sau lần **tái dựng trang 2026-04-23**, phát hiện cây `/Pages/` là cổng *cũ đã chết* và rằng `/van-ban/` được `Allow` một cách tường minh, với ~158.826 URL trong sitemap. Báo cáo 04 muộn hơn và cụ thể hơn, và sự hòa giải (12 đã kiểm thử các URL cũ) là hợp lý — nhưng đó là suy diễn của chúng ta, không phải điều mà một trong hai báo cáo nêu ra. **Hãy kiểm tra lại robots.txt và một URL văn bản đang hoạt động trước bất kỳ lần crawl nào.**
- **Báo cáo 03 đánh dấu F2:** một nghị định thay thế cho NĐ 69/2018 được soạn thảo với ngày tự do hóa 01/07/2026; việc ban hành không thể xác nhận được. Sự tồn tại của VBHN 24/VBHN-BCT (2026) hàm ý rằng 69/2018 vẫn còn sống — hàm ý, không phải chứng minh. Hãy xác minh trực tiếp trước khi dựa vào VBHN đó.
- **Báo cáo 03 đánh dấu F7:** lớp Thông tư chưa bao giờ được liệt kê đầy đủ; việc sáp nhập Bộ GTVT→Bộ Xây dựng (01/03/2025) đã tái ban hành một số lượng không rõ các thông tư `TT-BGTVT` thành `TT-BXD`. Độ phủ VBHN trên lớp đó là chưa rõ.

## Yêu cầu rà soát

- Xác minh mọi trích dẫn pháp lý được phát ra đều mang một số hiệu văn bản **và** một ngày.
- Xác minh đường ống nạp dữ liệu ưu tiên VBHN và ghi lại *vì sao* khi nó lui về văn bản gốc.
- Xác minh không có thành phần nào biến đổi văn bản luật định. Grep bất cứ thứ gì áp dụng các chỉ dẫn "sửa đổi/bổ sung/bãi bỏ" lên một thân văn bản được lưu trữ — sự tồn tại của nó là một vi phạm ADR này.
- Xác minh tính hiệu lực thời gian được áp dụng như một bộ lọc trước khi xếp hạng, không phải như một đặc trưng xếp hạng.
- Xác minh trình nạp đồ thị sống sót qua các cạnh treo lơ lửng tới các văn bản chưa được công bố.
- Xác minh lại trích dẫn Pháp lệnh 01/2026/UBTVQH16 đối chiếu với Công báo trước khi nó xuất hiện trong bất kỳ tài liệu hướng tới người dùng hay đối ngoại nào.

## Kiến thức liên quan

- [Văn bản pháp luật Việt Nam](../concepts/vietnamese-legal-documents.md) — VBHN, hiệu lực, cấu trúc phân cấp văn bản
- [Nguồn dữ liệu](../concepts/data-sources.md) — vbpl.vn, Công báo, cái gì bị cấm và vì sao
- [Truy xuất RAG pháp lý](../concepts/legal-rag-retrieval.md) — chia đoạn theo cấu trúc, truy xuất lai, lọc thời gian, neo cơ sở
- [Hệ thống biểu thuế](../concepts/tariff-system.md) — vì sao các con số không đến từ lớp văn bản này
- [Phân loại mã HS](../concepts/hs-classification.md) — các đoạn bằng chứng mà lớp văn bản này cấp dữ liệu
- [Quy tắc nghiệp vụ](../business-rules.md)
- [Bối cảnh dự án](../project-context.md)
