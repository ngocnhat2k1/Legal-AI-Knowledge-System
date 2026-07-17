---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../concepts/tariff-system.md
  - ../concepts/vietnamese-legal-documents.md
  - ../concepts/hs-classification.md
  - ../concepts/data-sources.md
  - ../business-rules.md
  - ../project-context.md
---

# Tính Hiệu Lực Của Mô Hình Và Phiên Bản HS Là Các Chiều Hạng Nhất Ngay Từ Ngày Đầu Tiên

## Trạng thái

Đã phê duyệt (2026-07-17).

## Bối cảnh

Customs Assistant trả lời hai câu hỏi trong v1: thuế suất chính xác cho một
bộ ba (HS code, schedule, date), và một danh sách xếp hạng các mã HS ứng viên kèm
bằng chứng pháp lý nguyên văn. Cả hai đều là những đầu ra ràng buộc về mặt pháp lý — người
khai, chứ không phải công cụ này, gánh trách nhiệm cho một con số sai.

Sự cám dỗ là lưu một dòng cho mỗi mã HS với một cột `rate`, xuất xưởng v1,
rồi "thêm lịch sử về sau". Nghiên cứu nói rằng thiết kế đó sai ngay từ khi đến, chứ không
chỉ đơn thuần là chưa hoàn chỉnh:

- **Kho corpus đa phần là luật đã chết.** SBV-LawGraph đã đo một kho corpus pháp lý
  Việt Nam thực tế: trong 1.703 văn bản của Ngân hàng Nhà nước, 863 bị bãi bỏ toàn bộ, 191 bị
  bãi bỏ một phần, 639 còn hiệu lực — **~62% là luật đã chết hoặc chết một phần** (đã xác minh
  2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).
  Một kho không có chiều trạng thái/hiệu lực là một kho có phần lớn nội dung
  sai mà không được đánh dấu.

- **Luật-trên-giấy đến bị đình chỉ trong 10 tuần.** NĐ 46/2026/NĐ-CP được ban hành
  26/01/2026 để thay thế NĐ 15/2018 về an toàn thực phẩm, kèm theo NQ 66.13/2026/NQ-CP
  (27/01/2026). **NQ 09/2026/NQ-CP đã đình chỉ cả hai vào 04/02/2026** — chín ngày
  sau — ban đầu đến 15/4/2026, sau đó gia hạn cho đến khi Luật An toàn thực phẩm sửa đổi
  và nghị định hướng dẫn thi hành có hiệu lực. Do đó NĐ 15/2018 hiện vẫn là
  quy tắc đang vận hành cho đến hôm nay (đã xác minh 2026-07-17, nguồn:
  https://vanban.chinhphu.vn/?docid=216891&pageid=27160 ·
  https://baochinhphu.vn/tiep-tuc-ap-dung-nghi-dinh-15-2018-nd-cp-ve-an-toan-thuc-pham-cho-den-khi-co-quy-dinh-moi-102260408123934123.htm).
  Một con trỏ `superseded_by` đơn thuần không thể biểu đạt điều này: nghị định thay thế
  tồn tại, được ban hành hợp lệ, và không áp dụng.

- **Không thời gian chuẩn bị, độ trễ công báo, và đảo ngược lặng lẽ — tất cả cùng một lúc.**
  NĐ 72/2026/NĐ-CP cắt thuế suất MFN đối với xăng/naphtha/reformate từ 10% xuống 0%.
  Nó được **ký 09/03/2026 và có hiệu lực ngay cùng ngày** ("kể từ ngày ký"),
  **đăng Công báo số 157 vào 24/03/2026 — 15 ngày sau khi nó đã là luật ràng buộc** —
  và **chỉ có hiệu lực đến 30/04/2026, một cửa sổ 52 ngày**,
  sau đó thuế suất lặng lẽ trở lại theo NĐ 26/2023 mà không có văn bản nào thêm
  (đã xác minh 2026-07-17, nguồn: research/12.md xác minh lấy dữ liệu trực tiếp ·
  https://vanban.chinhphu.vn/?amp=&docid=217144&pageid=27160). Để so sánh,
  NĐ 26/2023 được ký 31/05/2023 và đăng công báo 19/06/2023 (~19 ngày); EVFTA
  NĐ 116/2022 ký 30/12/2022, đăng công báo từ 16/02/2023 (~48 ngày).
  Có một cửa sổ nhiều tuần trong đó thuế suất đang có hiệu lực pháp lý tồn tại dưới dạng
  máy đọc được **ở đâu cả** — chỉ dưới dạng một bản quét 200-DPI.

- **Ngày hiệu lực không phải là một ngày.** Luật Đường bộ 35/2024/QH15 Điều 85
  khoản 2 cho bốn điều khoản một hiệu lực *sớm hơn* (01/10/2024) so với chính bộ luật đó
  (01/01/2025). Luật TTATGTĐB 36/2024/QH15 Điều 88 khoản 2 — chính điều
  quy định hiệu lực trì hoãn — **đã tự nó bị sửa đổi** bởi Luật
  118/2025/QH15 (10/12/2025), mà Điều 11 của chính luật này có **các ngày hiệu lực tách rời**
  (01/7/2026 nói chung, trừ điểm a khoản 20 Điều 7 vốn có hiệu lực
  01/01/2026 — chính là điều khoản đã đẩy quy tắc thiết bị an toàn cho trẻ em từ
  01/01/2026 sang 01/7/2026, đáp xuống một ngày trước khi thời hạn ban đầu cắn xé).
  Cùng bản sửa đổi đó đã thêm nghĩa vụ về camera có hiệu lực 01/01/2028 và
  01/01/2029 (đã xác minh 2026-07-17, nguồn:
  https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf ·
  https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/49-vbhn-vpqh.pdf).
  Hiệu lực trì hoãn theo từng khoản, sửa đổi chính điều về ngày hiệu lực,
  và một văn bản sửa đổi với các ngày hiệu lực tách rời — một trường hợp, cả ba điều.

- **Các thuế suất được ấn định cho tương lai đã nằm sẵn bên trong các nghị định hiện hành.** NĐ 199/2025/NĐ-CP
  (08/07/2025) nâng phốt pho vàng 5% → 10% vào 01/01/2026 → 15% vào
  01/01/2027 (đã xác minh 2026-07-17, nguồn:
  https://luatvietnam.vn/xuat-nhap-khau/nghi-dinh-199-2025-nd-cp-405228-d1.html).
  Một cột `rate` vô hướng không có chỗ nào để đặt giá trị năm 2027.

- **Phiên bản HS là một trục riêng biệt sắp sửa dịch chuyển.** TT 31/2022/TT-BTC
  (hiệu lực 01/12/2022) là hiện hành và được xây dựng trên **HS 2022 / AHTN 2022**:
  21 phần · 97 chương · 1.228 nhóm · 4.084 phân nhóm · 11.414 dòng tám chữ số.
  **HS 2028 có hiệu lực 01/01/2028**; AHTN 2028 đang được đàm phán và không có
  danh mục HS 2028 nào có hiệu lực hôm nay (đã xác minh 2026-07-17, nguồn:
  https://kv05.customs.gov.vn/index.jsp?aid=215061&cid=25&pageId=2).
  Trong khi đó kho corpus biểu FTA — 17 nghị định đều ban hành 30/12/2022 bao trùm
  2022–2027, cộng với VIFTA NĐ 131/2024 và CEPA NĐ 143/2026 — được viết để chạy đến
  **31/12/2027**. Việc tái cơ sở hóa danh mục và thay thế toàn bộ biểu va chạm
  trong cùng một quý, còn khoảng chừng 18 tháng nữa.

## Quyết định

**Tính hiệu lực, biểu, và phiên bản HS là các chiều hạng nhất của mô hình dữ liệu
ngay từ lần migration đầu tiên. Không có "giai đoạn 2" cho tính thời gian.**

1. **Mọi sự kiện pháp lý được lưu trữ là một dòng có phiên bản, không bao giờ là một dòng được cập nhật.**
   Các cột tối thiểu trên mọi bản ghi thuế suất, dòng danh mục, và quy tắc:
   `valid_from`, `valid_to` (nullable = mở không giới hạn), `status`,
   `source_doc`, `as_of`. Việc ghi là các phép chèn (insert). Không có gì bị biến đổi tại chỗ.

2. **Bitemporal (song thời gian), không chỉ valid-time.** `valid_from`/`valid_to` là thời gian
   của luật; `as_of` là thời gian của *chúng ta* — khi chúng ta thu được và xác minh bản ghi.
   Chúng phân kỳ theo thiết kế, bởi vì một nghị định có thể ràng buộc 15 ngày trước khi nó
   máy đọc được ở bất cứ đâu. `as_of` là thứ cho phép hệ thống nói "ảnh chụp của tôi
   có thể đã lỗi thời" thay vì tự tin phục vụ một thuế suất mà một nghị định đã-ký-và-có-hiệu-lực
   đã ghi đè.

3. **`status` là một liệt kê, không phải một boolean.** Nó phải biểu đạt tối thiểu:
   còn hiệu lực, chưa có hiệu lực, bị đình chỉ, hết hiệu lực, bị bãi bỏ, bị bãi bỏ một phần.
   Trường hợp NĐ 46/2026 đòi hỏi `suspended` khác biệt với `repealed` và với
   `in force`; con số 62% đòi hỏi `partly repealed` khác biệt với `repealed`.

4. **`hs_version` là chiều riêng của nó**, được mang trên các dòng danh mục và trên
   mọi dòng thuế suất tham chiếu chúng. AHTN 2022 hôm nay; AHTN/HS 2028 từ
   01/01/2028. Không mã, truy vấn, hay lược đồ nào được giả định AHTN 2022.

5. **Tra cứu thuế được gắn khóa theo (HS code, schedule, effective date)** — không bao giờ theo
   riêng mã HS. `schedule` bao trùm xuất khẩu với nhập khẩu ưu đãi với từng phụ lục FTA.
   Nghiên cứu đã chứng minh vì sao: trong NĐ 26/2023, **1.520 mã HS xuất hiện ở
   cả Phụ lục I (biểu xuất khẩu) và Phụ lục II (biểu nhập khẩu MFN), và
   1.329 mã trong số đó mang thuế suất khác nhau**. Một trình phân tích mù phụ lục đã trả về
   thuế suất *xuất khẩu* cho một câu hỏi *nhập khẩu* — một cách lặng lẽ, ở mức 94% thành công biểu kiến
   (đã xác minh 2026-07-17, nguồn: research/12.md, phân tích 14 phần `.doc` Công báo
   của NĐ 26/2023).

6. **Hai thiết kế bị cấm hoàn toàn:**
   - "Thuế suất hiện tại" như một đại lượng vô hướng trên một dòng HS.
   - "Lấy phiên bản mới nhất" như một chiến lược giải quyết. NĐ 72/2026 hết hiệu lực vào
     30/04/2026 và đảo ngược mà không có văn bản kế nhiệm — "mới nhất" phục vụ 0%
     xăng mãi mãi.

7. **Cơ quan ban hành và các khóa phi-HS cũng là các thực thể có khoảng hiệu lực.**
   Bộ GTVT không còn tồn tại từ 01/03/2025 (sáp nhập vào Bộ Xây dựng); Cục Hàng hải
   VN và Cục ĐTNĐ trở thành VIMAWA. Mọi `TT-BGTVT` nay là cơ-quan-ban-hành-cũ
   (đã xác minh 2026-07-17, nguồn:
   https://plo.vn/tu-ngay-1-3-khong-con-ten-bo-giao-thong-van-tai-post836639.html).
   Tra cứu dựa trên cơ quan ban hành sẽ hỏng nếu không có bí danh và khoảng hiệu lực.

8. **Tính hiệu lực là một bộ lọc cứng, không phải một tín hiệu xếp hạng.** Nghiên cứu RAG nói
   rõ về điểm này: valid-time phải được mô hình hóa và lọc như một ràng buộc, bởi vì
   phi thời (temporal anachronism) — phục vụ luật đã bị bãi bỏ hoặc chưa có hiệu lực — là một
   trong hai hình thái thất bại chủ đạo của RAG pháp lý (đã xác minh 2026-07-17, nguồn: research/02.md,
   trích dẫn https://lexuanbach.github.io/publication/ACIIDS2026a.pdf và
   https://arxiv.org/abs/2605.23497). Điều này áp dụng cho giai đoạn RAG về sau, nhưng
   lược đồ mà giai đoạn đó đọc phải đã mang sẵn chiều này.

## Cơ sở lập luận

Hình thái thất bại của loại dự án này là **không phải dữ liệu thiếu — mà là dữ liệu sai
trông có vẻ hợp lý nhưng báo cáo thành công.** Cái bẫy phụ lục là bằng chứng: một trình phân
tích báo cáo độ phủ 94% đang trả về thuế xuất khẩu cho các truy vấn nhập khẩu mà không có bề mặt
lỗi nào ở bất cứ đâu. Một lược đồ thuế-suất-vô-hướng có cùng hình thái: nó không bao giờ báo lỗi,
bởi vì nó không có từ vựng cho "tôi không biết điều gì đã áp dụng vào ngày đó."

Tính thời gian không thể được lắp thêm sau vì một lý do cấu trúc: việc lắp thêm sau
đòi hỏi tái dựng lịch sử mà bạn đã không ghi lại. Một khi các dòng đã bị biến đổi tại chỗ,
thuế suất năm 2025 biến mất. Các tờ khai hải quan được kiểm tra và
truy thu sau sự việc — "thuế suất nào áp dụng vào 12/03/2026?" là một câu hỏi thường quy,
không phải một sự tò mò lưu trữ, và trong cửa sổ cụ thể đó câu trả lời
là 0% trong 52 ngày và 10% ở hai phía của nó.

Tính song thời gian một cách cụ thể (thay vì chỉ valid-time) bị ép buộc bởi
độ trễ công báo. Chỉ valid-time giả định rằng chúng ta biết luật ngay khi nó ràng buộc. Chúng ta
rõ ràng là không: có một cửa sổ 15–48 ngày cho mỗi nghị định nơi văn bản
ràng buộc chỉ tồn tại dưới dạng một bản quét. Ghi lại `as_of` là thứ chuyển điều đó từ một
câu trả lời sai lặng lẽ thành một giới hạn lỗi-thời có thể tiết lộ — đó là
sự khác biệt giữa một công cụ hỗ trợ nghiên cứu và một trách nhiệm pháp lý.

Việc biến `hs_version` thành một chiều ngay bây giờ tốn một cột và một khóa join. Việc biến nó
thành một chiều vào Q4 2027, trong khi đồng thời nạp một lô thay thế FTA ~17 nghị định,
có nghĩa là phải tái cơ sở hóa mọi ánh xạ lịch sử dưới sức ép thời hạn.

## Phạm vi

Áp dụng cho:

- Lược đồ biểu thuế: các dòng danh mục, thuế suất, biểu, các dòng thuế tuyệt đối/hỗn hợp,
  các dòng TRQ.
- Kho bằng chứng cho mã HS ứng viên (các ghi chú pháp lý cũng là văn bản có phiên bản).
- Mọi công việc nạp dữ liệu: thời điểm phân tích phải nắm bắt `source_doc` và `as_of`;
  việc nạp không bao giờ cập nhật, chỉ nối thêm (append).
- Kho corpus RAG về sau (bộ lọc hiệu lực như một ràng buộc cứng).

Không áp dụng cho: các bảng vận hành không có ngữ nghĩa pháp lý (người dùng, nhật ký kiểm
toán, các lần chạy job).

## Các phương án đã cân nhắc

**Cột "thuế suất hiện tại" vô hướng, thêm lịch sử về sau.** Bị bác. Nó không thể trả lời
các câu hỏi truy thu, không thể biểu diễn bước phốt pho vàng 01/01/2027 đã được viết sẵn
vào NĐ 199/2025, và hoàn toàn không thể biểu đạt cửa sổ 52 ngày của NĐ 72/2026.
Việc lắp thêm sau là bất khả nếu không có lịch sử mà nó đã vứt bỏ.

**Giải quyết theo "phiên bản mới nhất thắng".** Bị bác. Bị bác bỏ trực tiếp bởi
việc hết hiệu lực và đảo ngược lặng lẽ của NĐ 72/2026, và bởi NQ 09/2026 đình chỉ một
nghị định mới hơn để ưu tiên một nghị định cũ hơn.

**Dựa vào văn bản hợp nhất (consolidated texts) như là câu trả lời thời gian.**
Bị bác về mặt đủ điều kiện, giữ lại vì hữu ích. VBHN là lớp *văn bản* đúng ở nơi nó
tồn tại, nhưng nó là một ảnh chụp không có lịch sử phiên bản, việc công bố trễ hơn
việc sửa đổi, và **không có VBHN máy đọc được chính thức nào tồn tại cho biểu thuế cả**
(đã xác minh 2026-07-17, nguồn: research/10.md) — MFN 2026 đúng là
NĐ 26/2023 cộng với một chuỗi sửa đổi mà dự án này phải tự lắp ráp và
do đó có thể làm sai. ⚠️ Chuỗi này bản thân nó chưa được giải quyết: nghiên cứu 10 và
nghiên cứu 12 đưa ra các danh sách khác nhau, mỗi bên đều không đầy đủ. Xem
[Hệ thống biểu thuế](../concepts/tariff-system.md) — đừng coi hợp của chúng là
đã xác minh.

**Coi API biểu thuế của customs.gov.vn là nguồn chân lý.** Bị bác trên chính căn cứ của
ADR này bất kể nó có hoạt động hay không (xem Chưa xác minh bên dưới):
nó trả về **chỉ thuế suất của năm hiện tại, trong các cột phẳng theo từng chế độ, không có
chuỗi năm tương lai**, danh sách biểu của nó mang các giá trị `THOI_GIAN_CAP_NHAT` là
2019–2020 và hoàn toàn thiếu VIFTA và CEPA. Về cấu trúc nó là một nguồn "vô hướng mới nhất"
và không thể chống đỡ một kho song thời gian. Thẩm quyền pháp lý nằm ở
văn bản nghị định.

## Rủi ro

- **Độ phức tạp truy vấn.** Mỗi lần đọc trở thành một truy vấn theo khoảng ngày, theo phạm vi
  biểu, theo phạm vi phiên bản. Giảm thiểu: một hàm giải quyết duy nhất; không có phép đọc
  thuế suất tùy tiện nào ở bất cứ đâu trong codebase.
- **Các khoảng hiệu lực chồng lấn/mâu thuẫn** từ các chuỗi sửa đổi.
  Giảm thiểu: phát hiện chồng lấn như một cổng kiểm soát chất lượng dữ liệu tại lúc nạp, không
  phải một bất ngờ tại thời điểm chạy.
- **Sự lỗi thời của `as_of` chỉ hữu ích nếu được hiển thị ra.** Một `as_of` được-ghi-nhưng-ẩn
  không mua được gì. Hợp đồng đầu ra phải trích dẫn nghị định và ngày
  chụp ảnh, và phải từ chối thay vì đoán khi ảnh chụp có thể
  cũ hơn một sửa đổi đã biết.
- **Đình chỉ và đảo ngược không có tín hiệu máy đáng tin cậy.** Việc hết hiệu lực của NĐ 72/2026
  là một điều khoản bên trong chính nó; NQ 09/2026 là một nghị quyết riêng biệt.
  Việc phát hiện một phần là thủ công. Giảm thiểu: `valid_to` được điền tại lúc nạp
  từ chính văn bản của công cụ, và một hàng đợi rà soát của con người sở hữu phần còn lại.

## Hệ quả

- Toàn bộ việc nạp dữ liệu là chỉ-nối-thêm. Không có `UPDATE rate SET ...` nào tồn tại trong
  codebase này.
- Tra cứu biểu thuế tất định của v1 nhận một ngày khai báo tường minh; không có
  lối tắt mặc-định-về-hôm-nay trong lớp dữ liệu.
- Hệ thống có thể trả lời "điều gì đã áp dụng vào ngày D" ngay từ ngày đầu tiên, đó là điều mà
  các cuộc kiểm tra truy thu thực sự hỏi.
- Bộ lưu trữ tăng lên theo lịch sử sửa đổi. Điều này chấp nhận được ở quy mô 5–50 nhân viên và
  ~11.414 dòng × 26 biểu.
- Sự va chạm AHTN 2028 / FTA-hết-hiệu-lực vào Q4 2027 trở thành một công việc nạp dữ liệu
  thay vì một cuộc migration.

## Chưa xác minh / Không được dựa vào

- **API biểu thuế của customs.gov.vn — hai tác nhân nghiên cứu mâu thuẫn với nhau,
  và xung đột chưa được giải quyết.** Báo cáo 10 nêu rằng nó đã xác minh
  `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`
  bằng `curl` trần trụi: không xác thực, không cookie, không captcha, trả về MFN + tất cả các cột
  FTA cho mỗi dòng HS (ví dụ `87031010` → `NK_uu_dai: 70, EVFTA_NK: 28.3`).
  Báo cáo 12 phát hiện `/scripts/main.js` hardcode một backend *khác* —
  `http://123.30.210.236:8080/hqcustomsapi/`, một IP thô qua HTTP thuần,
  bao gồm `.../captcha/CheckCaptcha` — và **IP đó bị timeout**; báo cáo 12
  không thể phân biệt rào chặn địa lý với việc chặn lối ra của sandbox và đã tường minh
  từ chối tuyên bố rằng nó không thể tiếp cận. **Cả hai báo cáo được tái hiện ở đây như đã
  nộp. ADR này không phụ thuộc vào việc giải quyết** — văn bản nghị định là
  nguồn chân lý dù thế nào đi nữa, và §Các phương án đã cân nhắc giải thích vì sao API không thể
  chống đỡ một kho song thời gian ngay cả khi báo cáo 10 đúng.
- **Vực thẳm FTA 31/12/2027 một phần là suy diễn.** Báo cáo 10 nêu rằng lô 2022 bao trùm
  2022–2027 (với AJCEP NĐ 120/2022 và VJEPA NĐ 124/2022 chạy đến 2028). Báo cáo 12 tường minh
  đánh dấu "tất cả chúng đều hết hiệu lực cùng nhau, đòi hỏi một bộ kế nhiệm đầy đủ" là
  **suy diễn, không phải đã xác minh**. Hãy coi sự va chạm này là một giả định lập kế hoạch
  cần xác nhận đối chiếu với chính điều về hiệu lực của mỗi nghị định.
- **Việc phân tích Word các phụ lục `.doc` của Công báo chưa được chứng minh.** Việc trích xuất bằng
  `textutil` của EVFTA NĐ 116/2022 trong báo cáo 12 đã gộp sáu cột thuế suất hằng năm
  thành một chuỗi không phân tách (`2925,421,818,114,510,9` = 29 | 25,4 | 21,8 |
  18,1 | 14,5 | 10,9) trong một ngôn ngữ dùng dấu-phẩy-thập-phân. Báo cáo 12 **suy diễn, nhưng không thể
  chứng minh**, rằng một trình phân tích nhận biết bảng (LibreOffice → docx → `w:tbl/w:tr/w:tc`)
  khắc phục nó — không có công cụ nào như vậy khả dụng trong môi trường đó. **Đây là lỗ hổng mà một
  người xây dựng phải khép lại trước khi tin bất kỳ thuế suất được nạp nào.**
- **Báo cáo 10 không thăm dò giới hạn tốc độ (rate limiting)** trên API hải quan, và không thể
  xác minh data.gov.vn / open.data.gov.vn (lỗi DNS) hay ASEAN Tariff Finder
  (timeout).

## Kiến thức liên quan

- [Hệ thống biểu thuế](../concepts/tariff-system.md) — các biểu, các phụ lục, chuỗi
  sửa đổi đến NĐ 26/2023.
- [Văn bản pháp luật Việt Nam](../concepts/vietnamese-legal-documents.md) —
  cơ chế hiệu lực, VBHN, danh tính cơ quan ban hành.
- [Phân loại mã HS](../concepts/hs-classification.md) — AHTN 2022, việc tái cơ sở hóa
  2028, GRI.
- [Nguồn dữ liệu](../concepts/data-sources.md) — Công báo, customs.gov.vn,
  tư thế robots/cấp phép.
- [Truy xuất RAG pháp lý](../concepts/legal-rag-retrieval.md) — vì sao tính hiệu lực là một
  bộ lọc cứng, không phải một tín hiệu xếp hạng.
- [Quy tắc nghiệp vụ](../business-rules.md) — hợp đồng đầu ra: trích dẫn nghị định
  và ngày, từ chối khi lỗi thời.
- [Bối cảnh dự án](../project-context.md) — phạm vi v1 và tư thế trách nhiệm pháp lý.

## Yêu cầu rà soát

- Xác minh không có bảng lược đồ nào lưu một sự kiện pháp lý mà thiếu `valid_from`, `valid_to`,
  `status`, `source_doc`, `as_of`.
- Xác minh không có phép tra cứu thuế nào được gắn khóa chỉ theo mã HS — biểu và ngày là
  các đối số bắt buộc không có giá trị mặc định trong lớp dữ liệu.
- Xác minh `hs_version` hiện diện và không bao giờ được mặc định về AHTN 2022 trong mã.
- Xác minh việc nạp dữ liệu là chỉ-nối-thêm và rằng phát hiện chồng lấn chạy như một cổng kiểm soát.
- Xác minh hợp đồng đầu ra hiển thị `as_of` và nghị định được trích dẫn, và từ chối
  khi có khả năng lỗi thời.
