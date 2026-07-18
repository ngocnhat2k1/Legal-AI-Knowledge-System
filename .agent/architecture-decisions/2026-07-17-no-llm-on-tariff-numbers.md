---
type: architecture-decision
status: approved
updated: 2026-07-18
related:
  - ../concepts/tariff-system.md
  - ../concepts/hs-classification.md
  - ../concepts/data-sources.md
  - ../concepts/legal-rag-retrieval.md
  - ../business-rules.md
  - ../project-context.md
---

# Thuế Suất Được Tra Cứu Theo Khóa, Không Bao Giờ Do LLM Sinh Ra

## Trạng thái

Đã phê duyệt — 2026-07-17 (chủ dự án).

## Bối cảnh

Customs Assistant có hai tính năng ở v1: tra cứu thuế suất chính xác, và gợi ý mã HS
ứng viên. Cách triển khai trông có vẻ hiển nhiên cho tính năng đầu tiên — nhúng các
dòng thuế, nhúng câu hỏi của người dùng, trả về kết quả khớp gần nhất, để LLM diễn đạt
câu trả lời — chính là cách không được phép xây dựng.

Một bảng biểu thuế là đối nghịch với độ tương đồng ngữ nghĩa theo một cách mà các kho
tài liệu thông thường không có. Về bản chất cấu tạo, các dòng của nó là những mô tả gần
như giống hệt nhau, chỉ khác đúng ở trường mang giá trị tiền bạc. Danh mục gồm 21 phần /
97 chương / 1.228 nhóm bốn chữ số / 4.084 phân nhóm sáu chữ số / 11.414 dòng tám chữ số
(Thông tư 31/2022/TT-BTC, vẫn còn hiệu lực) (đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx).
Những người hành nghề nói rõ rằng phần lớn lỗi phân loại xảy ra *sau khi* đã tìm được
đúng nhóm — sự phân tách giữa hai phân nhóm liền kề mới là thứ quyết định thuế suất,
rủi ro chống bán phá giá, đủ điều kiện FTA và cấp phép
(đã xác minh 2026-07-17, nguồn: https://aomeara.com/how-customs-actually-classifies-products/).
Vì vậy "dòng tương đồng nhất" và "dòng đúng" không chỉ đơn thuần là không tương quan trong
một bảng biểu thuế; sự tương đồng còn chủ động chỉ về đúng người láng giềng sai.

Hệ quả của việc trả về sai con số không phải là một trải nghiệm người dùng tồi. Đó là một
tờ khai ràng buộc về mặt pháp lý do nhân viên của chúng ta nộp:

- **Truy thu** — thu hồi đầy đủ khoản thuế còn thiếu.
- **Phạt 20%** trên khoản thiếu khi hải quan phát hiện lỗi (Nghị định
  128/2020/NĐ-CP Điều 9 khoản 3; 10% nếu người khai tự phát hiện và nộp
  khai bổ sung trong các thời hạn tại Điều 9 khoản 2) (đã xác minh 2026-07-17, nguồn:
  https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-9).
- **0,03%/ngày** tiền chậm nộp trên khoản thiếu.
- **Mất ưu đãi C/O** — một mã HS sai làm hỏng việc khớp mã trên giấy chứng nhận
  xuất xứ, và thuế suất FTA bị thu hồi có hiệu lực trở về trước.
- Leo thang thành **trốn thuế** (Điều 14): 1×–3× số thuế trốn, có thể bị chuyển
  hồ sơ hình sự. Thuế và tiền lãi có thể bị truy thu trong **10 năm** kể từ khi phát hiện.

Tiền lệ cho rủi ro đuôi: vào tháng 12 năm 2014, hải quan được cho là đã phân loại lại
Anhydrous Milk Fat từ 0405.90.10 sang 0405.90.90, phá hủy tính đủ điều kiện 0% của
AANZFTA, và truy thu tám doanh nghiệp sữa khoảng **700 tỷ VND**
đối với các tờ khai từ năm 2010. Một chữ số, bốn năm khai báo sạch, một hóa đơn chín chữ số.

⚠️ **Kỷ luật về nguồn:** báo cáo nghiên cứu 09 §2 nêu vụ việc này **mà không có bất kỳ URL
gốc nào**. Hãy coi nó là minh họa cho hình thái thất bại, không phải là một con số đã được
xác lập — đừng trích dẫn 700 tỷ với chủ dự án hoặc trong sản phẩm như một sự thật. Xem
[Quy tắc nghiệp vụ → Chưa xác minh](../business-rules.md#chưa-xác-minh--không-được-dựa-vào).
Biểu phạt ở trên được lấy nguồn riêng biệt và không phụ thuộc vào nó.

## Quyết định

**Không một thuế suất, số tiền thuế, chữ số mã HS hay ngày hiệu lực nào được tạo ra bằng
việc sinh token.**

1. Thuế suất được truy xuất bằng **khóa tổ hợp chính xác**: `(HS code, schedule, date)` —
   trong đó `schedule` là văn bản cụ thể (`NK_uu_dai`, `ATIGA`, `EVFTA_NK`,
   `RCEP_CN`, xuất khẩu, ngoài hạn ngạch TRQ, …) và `date` là ngày khai báo
   được giải quyết theo khoảng hiệu lực của dòng. Một phép tra cứu SQL bằng đẳng thức. Không
   tìm kiếm vector, không so khớp mờ, không dự phòng theo láng giềng gần nhất.
2. **Một cú trượt khóa trả về "không tìm thấy", không bao giờ là dòng gần nhất.** Không có
   ngưỡng tương đồng nào mà tại đó chúng ta hạ cấp xuống mức xấp xỉ trên một con số.
3. Sự tiếp xúc duy nhất được phép của LLM với một thuế suất là **ở hạ nguồn của việc tra cứu**:
   nó có thể giải thích dòng được truy xuất có nghĩa gì, các điều kiện đi kèm là gì, và
   nhân viên phải kiểm tra những gì. Nó không được phép nêu lại các chữ số từ ngữ cảnh
   của chính nó, tính toán lại chúng, hay đối chiếu hai dòng.
4. **pgvector chỉ giới hạn ở văn bản, không bao giờ áp lên bảng thuế suất.** Embedding phục vụ
   gợi ý mã HS ứng viên và (về sau) RAG trên văn xuôi pháp lý. Bảng biểu thuế là dữ liệu
   quan hệ có khóa chính; nó không được cấp một chỉ mục biết đoán mò.
5. Mọi thuế suất mà giao diện hiển thị đều mang theo **số hiệu nghị định, phụ lục và ngày
   hiệu lực**, và hệ thống từ chối (thay vì trả lời) khi ảnh chụp của nó có thể đã lỗi thời
   đối với ngày đó.

## Cơ sở lập luận

**Cái bẫy phụ lục là bằng chứng, và nó không phải giả định.** Nghị định
26/2023/NĐ-CP mang biểu xuất khẩu ở Phụ lục I và biểu nhập khẩu MFN
ở Phụ lục II. **1.520 mã HS xuất hiện ở cả hai phụ lục, và 1.329 mã trong số đó
mang thuế suất khác nhau.** Một trình phân tích bỏ qua ranh giới phụ lục trong quá trình
nghiên cứu đã trả về `0301.11.10 → 0` (thuế suất *xuất khẩu*) cho một câu hỏi *nhập khẩu*,
đồng thời báo cáo **94% tỷ lệ thành công biểu kiến** — không ngoại lệ, không lỗi, không điểm
thấp. Thuế suất MFN nhập khẩu đúng cho dòng đó là 15 (đã xác minh 2026-07-17, nguồn:
https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm).
Nếu một regex tất định có thể lặng lẽ trả về thuế xuất khẩu cho một truy vấn nhập khẩu
ở mức "thành công" 94%, thì một mô hình embedding — mà toàn bộ công việc của nó là gộp
sự phân biệt giữa các chuỗi tương tự — sẽ làm điều đó thường xuyên hơn và với văn xuôi mượt hơn.

**Hình thái thất bại không có dấu hiệu nào.** Benchmark độc lập HSCodeComp mô tả đặc trưng
lỗi của mô hình là *"Error but Valid"*: hệ thống phát ra một mã thật, trông hợp lệ, nhưng
sai, mà không có tín hiệu cú pháp nào của thất bại. Chuyên gia con người đạt 95,0% ở mức
10 chữ số; tác nhân tự trị tốt nhất đạt 46,8%; GPT-5 không công cụ đạt 29,0%. Việc mở rộng
tại thời điểm suy luận và tự phản tư mang lại lợi ích không đáng kể, và việc trao cho mô hình
các quy tắc quyết định do con người viết một cách tường minh còn *làm giảm* hiệu năng đối với
hầu hết các hệ thống (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631).
Không có bản vá prompt nào, không có ngưỡng tin cậy nào, và không có bản phát hành "mô hình
tốt hơn" nào biến việc sinh thành việc tra cứu. Một con số sai ở đây chảy vào VNACCS, được
thông quan, và ba năm sau nổi lên như một cuộc kiểm tra sau thông quan.

**Và LLM sẽ là một kẻ nịnh hót, không phải một thẩm phán.** Những người hành nghề lưu ý rằng
nếu một người khai muốn mã là X trong khi mã đúng là Y, một LLM sẽ cung cấp
một luận cứ — hoặc ba — ủng hộ X (đã xác minh 2026-07-17, nguồn:
https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/).
Trên một con số thuế, điều đó không chỉ đơn thuần tạo ra một câu trả lời sai: nó chế tác ra
chuỗi lập luận bằng văn bản làm cơ sở cho việc quy kết trốn thuế.

**(HS, quốc gia) → thuế suất thậm chí không phải là một hàm số**, đó là lý do sâu xa hơn khiến
một thiết kế truy-xuất-rồi-diễn-đạt không thể vận hành. Nghiên cứu đã xác minh tất cả những
điều sau đây trong văn bản nghị định: thuế suất FTA phụ thuộc vào quy tắc xuất xứ *cộng với một
C/O hợp lệ* (RCEP Điều 4) — "thuế là 0%" là sai ở nơi mà "0% nếu bạn có C/O hợp lệ, ngược lại
là thuế suất MFN" mới đúng; RCEP Điều 6.2 áp một **quy tắc thuế suất cao nhất** xuyên các phụ lục
đối với một số hàng hóa đa xuất xứ; `*` trong một ô của biểu có nghĩa là **loại trừ**, không phải
bằng không; hàng hóa TRQ (các nhóm 04.07, 17.01, 24.01, 25.01) phụ thuộc vào tình trạng hạn ngạch
với thuế suất ngoài hạn ngạch nằm ở một phụ lục khác; và thuế tuyệt đối/hỗn hợp tại Phụ lục III
đối với xe đã qua sử dụng là số tiền USD, không phải phần trăm (đã xác minh 2026-07-17, nguồn:
https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm).
Đây là những trạng thái mà lược đồ phải biểu diễn một cách tường minh. Một LLM được yêu cầu "cho
thuế suất" sẽ dẹp phẳng từng trạng thái trong số đó thành một phần trăm nghe hợp lý.

Thiết kế dựa trên khóa cũng chính là thứ làm cho LLM *hữu ích*. Một khi con số đã được xác định,
mô hình có thể làm điều mà nó thực sự giỏi: giải thích rằng mức 0% này là có điều kiện, rằng ô này
được đánh dấu sao, rằng dòng này cần kiểm tra tình trạng hạn ngạch — phần diễn giải, đặt trên nền
một sự thật mà nó không tự bịa ra.

## Phạm vi

Áp dụng cho:

- Mô-đun tra cứu biểu thuế và lược đồ của nó (`(hs_code, schedule, valid_from,
  valid_to)` làm khóa; danh tính phụ lục được lưu trữ, không bao giờ suy diễn).
- Bất kỳ prompt hay định nghĩa công cụ nào có thể đưa một thuế suất vào đường ra của một LLM.
- Phạm vi chỉ mục pgvector.
- Gợi ý mã HS ứng viên — nó có thể đề xuất **các mã như ứng viên cho con người**
  (top-3 + bằng chứng ghi chú pháp lý nguyên văn), và không bao giờ được gắn một thuế suất vào
  một ứng viên như thể ứng viên đó đã được chốt.

Ngoài phạm vi: VAT, thuế TTĐB, BVMT, và thuế chống bán phá giá, những khoản không được
gắn khóa theo HS một cách tự nhiên trong luật và không nằm trong v1. Xem
[Hệ thống biểu thuế](../concepts/tariff-system.md).

## Các phương án đã cân nhắc

**Tìm kiếm ngữ nghĩa trên bảng biểu thuế.** Bị bác — đây chính là quyết định. Nó
trả về dòng trông tương đồng nhất, mà trong một bảng gồm các mô tả gần như giống hệt nhau
chỉ khác ở các chữ số cuối thì đó một cách đáng tin cậy là dòng sai. Cái bẫy phụ lục
(1.329 mã, cùng khóa, khác thuế suất) là cùng một loại lỗi mà một regex đã mắc phải một cách lặng lẽ.

**LLM đọc văn bản nghị định và nêu thuế suất.** Bị bác. Phụ lục MFN là
1.016 trang bản fax quét đen trắng 200-DPI của Kodak Alaris trên chinhphu.vn, với không một
đối tượng `/Font` nào trong tập tin phụ lục — không có lớp văn bản để đọc (đã xác minh
2026-07-17, nguồn: https://datafiles.chinhphu.vn/cpp/files/vbpq/2023/6/26-nd-2.pdf).
Văn bản máy đọc được tồn tại dưới dạng Word trên Công báo, nhưng đọc nó là một công việc phân
tích cú pháp với yêu cầu về ranh giới phụ lục, không phải một công việc lĩnh hội.

**LLM làm phương án dự phòng khi trượt khóa.** Bị bác. Một cú trượt thường có nghĩa là
nhân viên có mã HS sai, một ngày nằm ngoài ảnh chụp của chúng ta, hoặc một biểu mà chúng ta
chưa nạp. Cả ba đều là những điều kiện mà một câu trả lời còn tệ hơn sự im lặng. "Không tìm
thấy — kiểm tra X" là đầu ra đúng.

**Mua một API thương mại thay vì tự giữ một bảng.** Hoãn lại, không bác bỏ.
caselaw.vn quảng cáo một API doanh nghiệp trên hơn 12.000 mã và hơn 17 FTA nhưng không trích
dẫn nguồn của nó; ecus.vn phân phối một tập tin Excel hợp nhất không có API
(đã xác minh 2026-07-17, nguồn: https://caselaw.vn/tra-cuu-ma-hs). Việc mua không loại bỏ
ADR này: bất kể nguồn là gì, con số được tra cứu theo khóa và được trích dẫn, không bao giờ được sinh ra.

## Rủi ro

- **Ảnh chụp của chúng ta trở nên lỗi thời và phép tra cứu khóa tự tin trả về một thuế suất đã
  bị thay thế.** Đây là rủi ro tồn dư mà quyết định không giải quyết được — tính tất định đảm bảo
  sự nhất quán với dữ liệu của chúng ta, chứ không phải với luật. Nghị định 72/2026/NĐ-CP
  có hiệu lực **ngay ngày ký (09/03/2026)** và chỉ lên Công báo vào
  **24/03/2026 — 15 ngày sau khi nó đã ràng buộc** — cắt thuế xăng/naphtha
  từ 10% xuống 0%; sau đó nó hết hiệu lực vào **30/04/2026**, sau đó thuế suất lặng lẽ
  trở lại theo NĐ 26/2023 (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/).
  Một mô hình "phiên bản mới nhất" sẽ phục vụ 0% xăng mãi mãi. Giảm thiểu:
  mô hình thời gian nhận biết ngày-hiệu-lực/ngày-hết-hạn, và từ chối khi ngày khai báo
  rơi vào một cửa sổ mà chúng ta không thể bảo đảm. Xem
  [Hệ thống biểu thuế](../concepts/tariff-system.md).
- **Nhân viên tin vào tính tất định và ngừng kiểm tra các điều kiện.** Một con số trông có vẻ
  có thẩm quyền mời gọi đúng sự dựa dẫm không được soi xét mà ADR này tồn tại để ngăn chặn.
  Điều kiện C/O, `*`, và các trạng thái TRQ phải hiện rõ về mặt thị giác không thể bỏ sót,
  không phải một chú thích cuối trang.
- **Toàn bộ kho corpus FTA hết hiệu lực vào 31/12/2027**, va chạm với việc chuyển đổi danh mục
  AHTN/HS 2028 vào 01/01/2028 (đã xác minh 2026-07-17, nguồn: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx).
  Phiên bản HS phải là một chiều dữ liệu hạng nhất với các ngày hiệu lực ngay từ ngày đầu tiên —
  đừng mô hình hóa "thuế suất hiện tại" như một đại lượng vô hướng.

## Chưa xác minh / Không được dựa vào

- **ĐÃ GIẢI QUYẾT — điểm cuối `APIBieuThue` của customs.gov.vn.** Báo cáo nghiên cứu 10
  tuyên bố đó là một JSON API không có tài liệu, không xác thực, không captcha, được tái tạo
  bằng `curl` thuần (`POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`),
  trả về MFN + tất cả thuế suất FTA cho mỗi dòng HS, ví dụ `87031010 → {NK_uu_dai: 70,
  ATIGA: 0, EVFTA_NK: 28.3, NK_TT: 105}`, và báo cáo captcha trên trang chỉ là
  phía client. Báo cáo nghiên cứu 12 phát hiện `/scripts/main.js` hardcode một
  backend khác tại `http://123.30.210.236:8080/hqcustomsapi/` **bao gồm một
  route `/captcha/CheckCaptcha`**, và hoàn toàn không thể tiếp cận IP đó — nó
  đã tường minh từ chối tuyên bố là không thể tiếp cận, không thể phân biệt được rào chặn địa lý
  với việc chặn lối ra của sandbox. **Xung đột này đã được giải quyết (2026-07-18).** Chủ dự án
  đã quan sát trực tiếp trên trình duyệt (tab Network của devtools) rằng cổng biểu thuế
  customs.gov.vn GỌI điểm cuối `bridge`
  (`POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`) và nhận
  dữ liệu trả về — xác nhận báo cáo 10 rằng `bridge` là điểm cuối sống, và bác bỏ giả thuyết của
  báo cáo 12 rằng cổng chỉ là một vỏ JS chết mà backend duy nhất là IP thô `123.30.210.236:8080`
  (vốn đã timeout). Hai báo cáo mô tả HAI điểm cuối khác nhau — cả hai đều có thể đúng — nhưng dự
  án cố ý KHÔNG theo đuổi backend IP thô. Đây mới là quan sát trên tab trình duyệt, CHƯA phải tái
  tạo bằng `curl` thuần và CHƯA bắt được phản hồi mẫu; vẫn còn phải làm (không chặn thiết kế): tái
  tạo bằng `curl` thuần từ mạng công ty, bắt một phản hồi mẫu cho một HS đã biết để đối chiếu với
  bộ phận khai báo, và dò giới hạn tốc độ. `bridge` vẫn chỉ là lớp đối chiếu tiện lợi, không phải
  nguồn chân lý — đừng đặt đường nạp dữ liệu chịu tải lên nó; đường Công báo (.doc) vẫn là đường
  chịu tải. Dù thế nào đi nữa nó
  cũng không thay đổi gì trong ADR này: bản thân báo cáo 10 đã đánh dấu điểm cuối này là
  không có tài liệu, không có phiên bản, với độ phủ FTA lỗi thời (không có VIFTA, không có CEPA;
  các giá trị `THOI_GIAN_CAP_NHAT` là 2019–2020), chỉ có thuế suất của năm hiện tại, và không có
  cấp phép ToS — **nguồn chân lý pháp lý vẫn là văn bản nghị định**.
- **Việc trích xuất Word của EVFTA chưa được chứng minh.** `textutil` đã gộp một dòng thuế suất thành
  `2101.11.11 | … | 2925,421,818,114,510,9` — sáu thuế suất dấu-phẩy-thập-phân
  bị nối liền không có dấu phân tách, không thể khôi phục nếu không có heuristic. Báo cáo 12
  *suy đoán* (không khẳng định) rằng đây là một sản phẩm phụ của công cụ, bởi vì cấu trúc sáu năm
  giống hệt của RCEP được trích xuất sạch sẽ; nó không thể kiểm thử một trình phân tích nhận biết
  bảng thực sự. **Một người xây dựng phải khép lại lỗ hổng này trước khi tin bất kỳ thuế suất FTA nào.**
- Chi tiết Quyết định 117/QĐ-CHQ (2026) có độ tin cậy trung bình — báo cáo 09 không thể
  lấy được toàn văn (tường phí/403).
- Các tuyên bố về độ chính xác của nhà cung cấp (ví dụ Zonos "90%+") gấp khoảng 2 lần so với hiệu
  năng được benchmark độc lập của họ (44,1% ở mức 10 chữ số, n=103). Đừng trích dẫn chúng.

## Hệ quả

- Bảng biểu thuế cần một đường ống nạp dữ liệu thực sự với phân tích cú pháp nhận biết phụ lục và một
  mô hình thời gian. ADR này khiến điều đó trở thành không thể tùy chọn; không có lối tắt LLM nào.
- Các lỗ hổng độ phủ trở nên hiển hiện dưới dạng những lời từ chối thay vì biến mất vào trong văn xuôi
  nghe hợp lý. Điều này sẽ có cảm giác tệ hơn nhưng an toàn hơn.
- Việc tra cứu có thể kiểm thử được: cho `(HS, schedule, date)`, thuế suất kỳ vọng là một fixture.
  Không có gì về tính đúng đắn của con số phụ thuộc vào một phiên bản mô hình.
- Nhân viên giữ trách nhiệm pháp lý, nơi nó vốn đã thuộc về — "nền tảng đã bảo tôi mã HS" không phải
  là một sự biện hộ, và nhà nhập khẩu chịu trách nhiệm bất kể công cụ (đã xác minh 2026-07-17, nguồn:
  https://internationaltradematters.com/discussion/ai-customs-compliance-for-smes/).

## Yêu cầu rà soát

- Xác minh không có đường mã nào có thể đặt một thuế suất, số tiền thuế, hay chữ số HS vào một phản hồi
  của LLM mà không có một phép tra cứu khóa thành công đứng trước.
- Xác minh chỉ mục pgvector chỉ bao phủ các bảng văn bản, và không bao giờ bao phủ bảng thuế suất.
- Xác minh danh tính phụ lục là một cột được lưu trên mọi dòng thuế suất, không bao giờ suy diễn từ
  mã HS — kiểm thử tường minh với một mã lấy từ phần chồng lấn 1.520 mã.
- Xác minh một cú trượt khóa trả về "không tìm thấy" mà không có dự phòng dòng-gần-nhất ở bất kỳ
  ngưỡng tương đồng nào.
- Xác minh các dòng `*` (loại trừ), có điều kiện C/O, TRQ, và thuế tuyệt đối có thể biểu diễn được
  và được hiển thị ra, không bị dẹp phẳng thành một phần trăm.
- Xác minh mọi thuế suất được hiển thị đều mang số hiệu nghị định, phụ lục, và ngày hiệu lực.

## Kiến thức liên quan

- [Hệ thống biểu thuế](../concepts/tariff-system.md) — cấu trúc biểu, chuỗi sửa đổi,
  khoảng trống thời gian.
- [Phân loại mã HS](../concepts/hs-classification.md) — trật tự GRI, hợp đồng
  top-3 + bằng chứng, "Error but Valid".
- [Nguồn dữ liệu](../concepts/data-sources.md) — Công báo với chinhphu.vn với
  API customs.gov.vn làm lớp đối chiếu.
- [Truy xuất RAG pháp lý](../concepts/legal-rag-retrieval.md) — nơi embedding
  *là* công cụ đúng.
- [Quy tắc nghiệp vụ](../business-rules.md) — quy tắc con-người-quyết-định, yêu cầu
  trích dẫn.
- [Bối cảnh dự án](../project-context.md) — phạm vi và ranh giới của v1.
