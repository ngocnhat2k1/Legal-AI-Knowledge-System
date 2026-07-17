---
type: workflow
status: active
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../index.md
---

# Quy trình khai báo hải quan (những việc người dùng của chúng ta thực sự làm cả ngày)

Ghi chú này mô tả vòng lặp công việc hằng ngày thực tế của một người khai báo hải quan Việt Nam, để các tính năng được thiết kế xoay quanh công việc thật sự thay vì một công việc tưởng tượng. Hãy đọc nó trước khi đề xuất bất kỳ tính năng nào tuyên bố sẽ "tự động hóa việc khai báo".

Mỗi khẳng định thực tế bên dưới đều kèm theo ngày xác minh và một nguồn. Những khẳng định mà nghiên cứu không thể xác minh được cách ly trong [Chưa xác minh / Không được dựa vào](#chưa-xác-minh--không-được-dựa-vào) — không được nâng chúng lên phần nội dung chính.

## Vòng lặp công việc hằng ngày

Công việc của người khai báo là một chuỗi xử lý (pipeline). Mỗi bước có thể chặn bước tiếp theo, và những thất bại tốn kém lại được phát hiện ở cuối chuỗi (hoặc nhiều năm sau, trong một cuộc kiểm tra sau thông quan).

1. **Phân loại HS** — quyết định mã 8 chữ số theo Danh mục hàng hóa XNK Việt Nam.
2. **Kiểm tra chính sách cho mã HS đó** — hàng hóa thuộc diện `cấm`, `theo giấy phép`, `có điều kiện`, hay chịu `kiểm tra chuyên ngành`?
3. **Xin giấy phép & đăng ký kiểm tra trên VNSW** (Cơ chế một cửa quốc gia) — cùng với C/O nếu muốn hưởng thuế suất FTA.
4. **Khai báo trong ECUS** (phần mềm trung gian của nhà cung cấp, không phải khai trực tiếp trên VNACCS).
5. **Nhận phân luồng** — hệ thống quản lý rủi ro trả về một luồng: **xanh** (được chấp nhận), **vàng** (kiểm tra hồ sơ), **đỏ** (kiểm tra thực tế hàng hóa).
6. **Nộp thuế.**
7. **Thông quan.**

(đã xác minh 2026-07-17, nguồn: research 08 §7, tóm tắt quy trình thực hành của người hành nghề xuyên suốt tài liệu ECUS/VNACCS — xem các nguồn ECUS và TT 121 được trích dẫn bên dưới)

### Vì sao vòng lặp này quan trọng đối với thiết kế

Bước 1 quyết định các bước 2, 3 và 6. Một mã HS sai không thất bại ầm ĩ ở bước 4 — nó được hệ thống chấp nhận và nổi lên sau đó dưới dạng truy thu + phạt + mất ưu đãi FTA. Đây là đặc tính "Error but Valid" (Sai nhưng Hợp lệ): một mã 8 chữ số sai về mặt cú pháp không thể phân biệt được với một mã đúng (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631). Người khai báo gánh trách nhiệm pháp lý bất kể công cụ nào tạo ra con số đó.

### Những gì Customs Assistant v1 có và không đụng tới

| Bước | Mức độ tham gia của v1 |
|---|---|
| 1. Phân loại HS | **Có** — top-3 **ứng viên** + bằng chứng chú giải pháp lý nguyên văn. Con người quyết định. Không bao giờ đưa ra một câu trả lời 8 chữ số trần trụi. |
| 2. Kiểm tra chính sách | **Không có trong v1.** Ngoài phạm vi; xem phần quản lý chuyên ngành để hiểu vì sao việc này khó hơn nhiều so với vẻ ngoài. |
| 3. Giấy phép / kiểm tra VNSW | **Không.** Không có API công khai; yêu cầu chữ ký số. Chúng ta không đụng tới. |
| 4. Khai báo trong ECUS | **Không.** Không tích hợp. Người dùng tự sao chép mã vào ECUS. |
| 5. Phân luồng | **Không.** Do hệ thống quản lý rủi ro VCIS quyết định, không phải chúng ta. |
| 6. Nộp thuế | **Không có thanh toán.** v1 chỉ cung cấp **tra cứu biểu thuế** — mang tính xác định, khóa theo HS + biểu thuế + ngày, không dùng AI cho các con số. |
| 7. Thông quan | **Không.** |

Bề mặt sản phẩm được cố ý giới hạn ở bước 1 và bước 6, và trong bước 1 nó là hỗ trợ ra quyết định, không phải ra quyết định. Bằng chứng cho ràng buộc đó: độ chính xác phân loại top-1 tự động ở mức 10 chữ số là 29–47% so với 95% của chuyên gia con người, trong khi top-3 + bằng chứng truy xuất từ sổ tay HS đạt 93,9% và giảm được đáng kể thời gian rà soát của chuyên gia trong một nghiên cứu với 32 chuyên gia tại Korea Customs Service (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631 và https://arxiv.org/abs/2311.10922). Khoảng cách giữa 47% và 93,9% là **hợp đồng đầu ra (output contract)**, không phải năng lực mô hình. Thay đổi hợp đồng thành "ứng dụng gán mã" sẽ vứt bỏ toàn bộ lợi ích đã được đo lường.

## Các hệ thống mà người khai báo tương tác

- **VNACCS/VCIS** — do JICA xây dựng, vận hành từ năm 2014. VNACCS = xử lý thông quan; VCIS = tình báo/rủi ro (nó là hệ thống tạo ra phân luồng) (đã xác minh 2026-07-17, nguồn: research 08 §7; xem https://baophapluat.vn/hai-quan-tang-toc-chuyen-doi-so-thi-diem-mo-hinh-thong-quan-tap-trung-bai-1-tu-nen-tang-vnaccs-vcis-den-buoc-chuyen-moi-cua-hai-quan-so.html).
- **Người khai báo không tương tác trực tiếp với VNACCS.** Họ dùng phần mềm trung gian của nhà cung cấp. **ECUS5-VNACCS (Thái Sơn)** đang chiếm ưu thế; FPT.VNACCS và một phần mềm miễn phí do Hải quan phát hành cũng tồn tại. Các nhà cung cấp phát hành bản cập nhật chuẩn thông điệp mỗi khi thông tư thay đổi (đã xác minh 2026-07-17, nguồn: https://thaison.vn/san-pham/ecus).
- **⚠️ VNACCS/VCIS được lên kế hoạch thay thế** bằng hệ thống "Hải quan số", mục tiêu **31/12/2026**, với việc tích hợp đầy đủ nền tảng + VNSW vào cuối 2026 / đầu 2027. Một **Luật Hải quan** sửa đổi dự kiến trình Quốc hội vào khoảng **10/2026** (đã xác minh 2026-07-17, nguồn: https://baophapluat.vn/hai-quan-tang-toc-chuyen-doi-so-thi-diem-mo-hinh-thong-quan-tap-trung-bai-1-tu-nen-tang-vnaccs-vcis-den-buoc-chuyen-moi-cua-hai-quan-so.html và https://baophapluat.vn/sua-doi-luat-hai-quan-hoan-thien-hanh-lang-phap-ly-cho-hai-quan-so-quan-ly-hien-dai.html).

**Hệ quả thiết kế:** bất cứ thứ gì được xây dựng dựa trên định dạng thông điệp của VNACCS đều có **vòng đời khoảng 18 tháng**. Đây là lý do bậc nhất khiến v1 không tích hợp với ECUS/VNACCS — sự tích hợp sẽ lỗi thời gần như ngay khi nó ra mắt. Việc dừng lại ở ranh giới "đưa cho con người một mã và một mức thuế, họ tự gõ vào" chính là điều giúp sản phẩm sống sót qua đợt chuyển đổi Hải quan số.

## ⚠️ Thay đổi quy trình lớn nhất trong ngắn hạn: TT 121/2025/TT-BTC

- **Thông tư 121/2025/TT-BTC** — ban hành **18/12/2025**, **có hiệu lực 01/02/2026**. Sửa đổi **TT 38/2015/TT-BTC** (đã được sửa đổi bởi **TT 39/2018/TT-BTC**). Được mô tả là bản cập nhật quy trình hải quan lớn nhất trong nhiều năm: nó chuẩn hóa hồ sơ hải quan, cắt giảm chứng từ, và đẩy mạnh trao đổi dữ liệu qua VNSW (đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-121-2025-TT-BTC-sua-doi-cac-Thong-tu-ve-thu-tuc-hai-quan-giam-sat-hai-quan-633118.aspx, https://baochinhphu.vn/thong-tu-121-mo-duong-hai-quan-so-thu-tuc-gon-thong-quan-nhanh-102260114160631601.htm, https://www.pwc.com/vn/vn/publications/news-brief/251223-new-customs-procedures-effective-from-1-february-2026.html).
- Nó cũng tác động trực tiếp đến quy trình xác định trước: sửa đổi khoản 1 và bổ sung khoản 6 của **Điều 7** (hồ sơ xác định trước mã số) và giới thiệu các mẫu **01a-TB XDTMS / 01b-Thay the XDTMS / 01c-Huy XDTMS** (đã xác minh 2026-07-17, cùng nguồn).
- **Nghị định 167/2025/NĐ-CP** (có hiệu lực **15/8/2025**) sửa đổi **NĐ 08/2015/NĐ-CP** (đã xác minh 2026-07-17, nguồn: research 08 §7).

**Vì sao điều này được nhấn mạnh dữ dội như vậy:** gần như toàn bộ dữ liệu huấn luyện trước 2026, các bài blog, và thói quen của người hành nghề đều mô tả cách lập hồ sơ theo TT 38/2015 + TT 39/2018. **Bất kỳ logic lập hồ sơ nào cũng phải nhắm tới TT 121, chứ không phải TT 38/39 như đã biết trước đây.** Một tác nhân "biết" hồ sơ TT 38/39 sẽ tạo ra đầu ra lỗi thời một cách đầy tự tin.

Liên quan: **Quyết định 117/QĐ-CHQ (2026)**, Quy trình xác định trước mã số nội bộ áp dụng từ khoảng 01/02/2026, được xây dựng trên nguyên tắc **mỗi hàng hóa có đúng một mã HS** và trên một cơ sở dữ liệu phân loại thống nhất toàn ngành — cơ sở dữ liệu đó là **nội bộ**, đừng cho rằng nó sẽ được công khai (đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Quyet-dinh-117-QD-CHQ-2026-Quy-trinh-Xac-dinh-truoc-ma-so-Kiem-tra-ten-hang-mo-ta-hang-hoa-692998.aspx; research 09 gắn cờ toàn văn là không tải được/bị chặn phí, nên hãy coi chi tiết là mức độ tin cậy trung bình).

## Quản lý chuyên ngành (specialized management) — bước 2

**Không có một danh mục tổng thể duy nhất nào cả.** Mỗi bộ ban hành thông tư "bảng mã số HS" của riêng mình, và **chính thông tư đó là khóa nối (join key)** giữa một mã HS và một yêu cầu. Một tính năng hứa hẹn "cho tôi biết cần những giấy phép gì" thực chất là lời hứa tập hợp và duy trì các thông tư bảng HS riêng biệt của khoảng 6 bộ, mà sự thật gốc nằm ở các phụ lục PDF/Word (đã xác minh 2026-07-17, nguồn: research 08 §3 và §8).

Nghị định khung là **NĐ 69/2018/NĐ-CP** (hàng cấm, hàng theo giấy phép, hàng có điều kiện, TNTX/chuyển khẩu), vẫn còn hiệu lực; một bản thay thế đang ở dạng dự thảo và không được lập trình dựa vào nó (đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?pageid=27160&docid=193756).

**Bộ Công Thương**
- Hàng cấm/có điều kiện theo HS: **TT 12/2018/TT-BCT** + **TT 08/2023/TT-BCT**, thay thế Phụ lục I của TT 12/2018 (đã xác minh 2026-07-17, nguồn: https://www.vietnamtradeportal.gov.vn/kcfinder/upload/files/12_2018_TT-BCT.pdf, https://vanban.vcci.com.vn/thong-tu-082023tt-bct-sua-doi-quy-dinh-danh-muc-chi-tiet-theo-ma-so-hs-cua-hang-hoa-xuat-khau-nhap-khau-kem-theo-mot-so-thong-tu-cua-bo-truong-bo-cong-thuong).
- An toàn thực phẩm: **TT 28/2026/TT-BCT — có hiệu lực 17/7/2026** (đồ uống, rượu, bia, cồn thực phẩm, sữa chế biến, dầu thực vật) (đã xác minh 2026-07-17, nguồn: https://government.vn/?docid=218330&pageid=27160).

**Bộ Nông nghiệp và Môi trường (BNNMT)**
- Bảng HS tổng thể: **TT 01/2024/TT-BNNPTNT**, có hiệu lực **20/3/2024**, kế thừa TT 11/2021. ⚠️ Nghiên cứu không tìm thấy **bản thay thế nào của BNNMT được xác nhận** — coi là hiện hành nhưng **cần xác minh lại** (đã xác minh 2026-07-17, nguồn: https://chinhphu.vn/?pageid=27160&docid=209723).
- Kiểm dịch động vật trên cạn: **TT 01/2026/TT-BNNMT** (01/01/2026) (đã xác minh 2026-07-17, nguồn: https://luatvietnam.vn/tai-nguyen/thong-tu-01-2026-tt-bnnmt-quy-dinh-kiem-dich-dong-vat-san-pham-dong-vat-tren-can-423507-d1.html).
- Kiểm dịch động vật thủy sản: **TT 03/2026/TT-BNNMT** (13/01/2026) (đã xác minh 2026-07-17, nguồn: https://xuatnhapkhauleanh.edu.vn/thong-tu-03-2026-tt-bnnmt.html).

**Bộ Y tế** — an toàn thực phẩm (phần thuộc trách nhiệm của bộ theo **NĐ 15/2018/NĐ-CP**), dược phẩm, mỹ phẩm, trang thiết bị y tế (đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?pageid=27160&docid=192829).

**Bộ Khoa học và Công nghệ** — chế độ chất lượng/tiêu chuẩn; và cả thiết bị viễn thông/CNTT kể từ khi tiếp nhận nguyên Bộ TT&TT (đã xác minh 2026-07-17, nguồn: research 08 §1 và §3).

**Bộ Xây dựng** — vật liệu xây dựng; và cả giao thông vận tải kể từ khi tiếp nhận nguyên Bộ GTVT (đã xác minh 2026-07-17, nguồn: research 08 §1 và §3).

## ⚠️ Không phải mọi thứ đều khóa theo HS — một mô hình dữ liệu chỉ dựa trên HS là thiếu hụt về mặt cấu trúc

Đây là cảnh báo mô hình hóa quan trọng nhất trong ghi chú này. Nếu lược đồ là `hs_code → requirements`, thì có ba chế độ thực tế hoàn toàn không thể biểu diễn được:

- **CITES khóa theo loài, không theo HS.** **NĐ 06/2019/NĐ-CP** được sửa đổi bởi **NĐ 84/2021/NĐ-CP**. Giấy phép do Cơ quan thẩm quyền quản lý CITES Việt Nam cấp trong **8 ngày làm việc**, lên đến **22** ngày khi cần tham vấn cơ quan khoa học hoặc nước xuất khẩu; **hiệu lực tối đa 6 tháng**; **bản gốc duy nhất đi kèm lô hàng**. **Một mã HS đơn thuần không thể xác định được khả năng áp dụng CITES** — hai lô hàng cùng một mã HS có thể khác nhau về loài (đã xác minh 2026-07-17, nguồn: https://luatvietnam.vn/hanh-chinh/giay-phep-cites-570-95717-article.html, https://vbpl.ts24.com.vn/support/solutions/articles/16000126973-ngh%E1%BB%8B-%C4%91%E1%BB%8Bnh-84-2021-n%C4%91-cp-s%E1%BB%ADa-%C4%91%E1%BB%95i-ngh%E1%BB%8B-%C4%91%E1%BB%8Bnh-06-2019-n%C4%91-cp-v%E1%BB%81-qu%E1%BA%A3n-l%C3%BD-th%E1%BB%B1c-v%E1%BA%ADt-r%E1%BB%ABng-%C4%91%E1%BB%99ng-v%E1%BA%ADt-r%E1%BB%ABng-nguy-).
- **Phế liệu khóa theo HS *cộng với một giấy phép môi trường ở cấp doanh nghiệp*.** **QĐ 13/2023/QĐ-TTg**, có hiệu lực **01/6/2023**, thay thế QĐ 28/2020, liệt kê phế liệu được phép nhập khẩu làm nguyên liệu sản xuất (sắt thép, nhựa, giấy, thủy tinh, kim loại màu); yêu cầu giấy phép xuất phát từ **Luật BVMT 2020**. Các giấy phép cũ với tên gọi cũ nhưng HS không đổi vẫn còn hiệu lực đến khi hết hạn. Câu trả lời do đó phụ thuộc vào **ai là người nhập khẩu**, không chỉ vào hàng hóa là gì (đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?pageid=27160&docid=207922).
- **Chế độ chất lượng khóa theo bậc rủi ro.** **Luật 78/2025/QH15**, có hiệu lực **01/01/2026**, giới thiệu phân loại dựa trên rủi ro: **thấp** → tự công bố tiêu chuẩn áp dụng; **trung bình** → tự đánh giá hoặc chứng nhận bởi một tổ chức được công nhận; **cao** → chứng nhận bởi một tổ chức được **chỉ định** (đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?pageid=27160&docid=214606).

**Hệ quả thiết kế:** bất kỳ tính năng kiểm tra chính sách nào trong tương lai đều cần một mô hình quy tắc có *khóa* đa hình (HS, loài, danh tính doanh nghiệp, bậc rủi ro), chứ không phải một phép nối HS phẳng. Danh tính của bộ cũng là mục tiêu di động sau các cuộc sáp nhập năm 2025 — hãy mô hình hóa các bộ như những thực thể có bí danh (alias) và khoảng thời gian hiệu lực, bởi vì tiền tố thông tư đã thay đổi (`TT-BNNPTNT` → `TT-BNNMT`) trong khi các thông tư cũ vẫn giữ nguyên ký hiệu cũ của chúng (đã xác minh 2026-07-17, nguồn: research 08 §1).

## Các điều khoản chuyển tiếp có ý nghĩa về mặt vận hành

Các quy tắc **không phải là một sự chuyển đổi theo ngày đơn giản**. **TT 28/2026/TT-BCT**: hồ sơ nộp trước ngày có hiệu lực áp dụng theo quy tắc cũ **trừ khi thương nhân chủ động lựa chọn áp dụng quy tắc mới** (đã xác minh 2026-07-17, nguồn: https://government.vn/?docid=218330&pageid=27160).

Vậy nên câu hỏi đúng không bao giờ là "quy tắc hôm nay là gì" mà là "quy tắc cho *hồ sơ này* là gì, xét theo ngày nộp của nó và sự lựa chọn của thương nhân". Một kho quy tắc cần có effective-from / effective-to / suspended-by / superseded-by, cộng với một cờ opt-in trên hồ sơ — một cột `valid_from` đơn lẻ sẽ âm thầm tạo ra câu trả lời sai cho các hồ sơ đang xử lý dở dang.

Câu chuyện dài về an toàn thực phẩm là bằng chứng cho thấy trạng thái là một trường dữ liệu, không phải một chú thích cuối trang: **NĐ 46/2026/NĐ-CP** (26/01/2026) được ban hành để thay thế NĐ 15/2018, sau đó **NQ 09/2026/NQ-CP** (04/02/2026) đã **tạm hoãn** nó khoảng một tuần sau đó, và việc tạm hoãn được gia hạn cho đến khi Luật An toàn thực phẩm sửa đổi và nghị định của nó có hiệu lực — nên **NĐ 15/2018 vẫn còn hiệu lực** (đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?docid=216891&pageid=27160, https://baochinhphu.vn/tiep-tuc-ap-dung-nghi-dinh-15-2018-nd-cp-ve-an-toan-thuc-pham-cho-den-khi-co-quy-dinh-moi-102260408123934123.htm).

## C/O — thay đổi lớn năm 2025

- **QĐ 1103/QĐ-BCT (21/4/2025)** thu hồi thẩm quyền của **VCCI** trong việc cấp **C/O, CNM và mã số REX**. Việc chứng nhận xuất xứ được tập trung về MOIT / Sở Công Thương (đã xác minh 2026-07-17, nguồn: https://logistics.gov.vn/tin-hoat-dong/bo-cong-thuong-thu-hoi-quyen-cap-c-o-cnm-va-ma-so-rex-tu-vcci-de-chuan-hoa-he-thong-cap-c-o-trong-boi-canh-moi).
- **Bất kỳ kiến thức nào trước 2025 nói rằng "VCCI cấp form B" đều SAI.** Hãy nói rõ điều đó thay vì lặp lại nó.
- **TT 40/2025/TT-BCT (22/6/2025)** quy định việc cấp C/O và phê duyệt **tự chứng nhận** xuất xứ (đã xác minh 2026-07-17, nguồn: research 08 §5). **NĐ 146/2025/NĐ-CP** (12/6/2025, hiệu lực 1/7/2025) xử lý phân quyền/phân cấp trong lĩnh vực công thương (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-146-2025-nd-cp-45086.htm).
- **eCoSys đã chuyển sang https://co.moit.gov.vn vào lúc 12:00 ngày 22/12/2025** (đã xác minh 2026-07-17, nguồn: https://unicustomsconsulting.com/vi/bo-cong-thuong-nang-cap-va-van-hanh-he-thong-ecosys-moi-tu-12h00-ngay-22-12-2025/).
- **14 mẫu ưu đãi**: D (ASEAN), E (Trung Quốc), AHK, AJ/VJ (Nhật Bản), AK/VK (Hàn Quốc), AI (Ấn Độ), X (Campuchia), EUR.1 (EVFTA), EUR.1 UKVFTA, cùng các mẫu RCEP và CPTPP (đã xác minh 2026-07-17, nguồn: research 08 §5).
- **Dữ liệu eCoSys không công khai — không có API.** Nó là một hệ thống cấp phép giao dịch nằm sau lớp xác thực (đã xác minh 2026-07-17, nguồn: research 08 §5).

C/O quan trọng với chúng ta một cách gián tiếp: sự không khớp mã HS giữa tờ khai và C/O sẽ hủy hoại điều kiện hưởng ưu đãi FTA, mà điều này thường có giá trị lớn hơn nhiều so với chính khoản phạt phân loại (đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/tintuc/vn/thoi-su-phap-luat/tai-chinh/20921/xu-ly-khi-co-khac-biet-ma-so-hs-tren-c-o).

## VNSW / Cơ chế một cửa quốc gia

- Cơ sở pháp lý: **NĐ 85/2019/NĐ-CP**, có hiệu lực **1/1/2020**, **6 chương / 43 điều**, bao trùm NSW + ASW + kiểm tra chuyên ngành — đây là nghị định gắn kiểm tra chuyên ngành với cơ chế một cửa (đã xác minh 2026-07-17, nguồn: https://chinhphu.vn/default.aspx?pageid=27160&docid=198329).
- Cổng **https://vnsw.gov.vn**; đăng ký tài khoản được xác minh trong **1 ngày làm việc**; **yêu cầu chữ ký số (USB token)** (đã xác minh 2026-07-17, nguồn: https://vnsw.gov.vn/).
- **Không có API công khai.** NĐ 85 dự liệu kết nối hệ thống-tới-hệ thống, nhưng cơ chế kết nối NSW với hệ thống dữ liệu điện tử của hải quan và các hệ thống CNTT của các bộ **"chưa được quy định đầy đủ"**. Việc tích hợp là song phương, theo từng bộ, theo thỏa thuận (đã xác minh 2026-07-17, nguồn: research 08 §6).
- ⚠️ **vnsw.gov.vn thất bại trong việc xác minh TLS** trong quá trình nghiên cứu ("unable to verify the first certificate"). Hãy lường trước các vấn đề về chuỗi chứng chỉ cho bất kỳ ai tích hợp (đã xác minh 2026-07-17, nguồn: research 08 §6).
- ⚠️ Số lượng thủ tục đã **lỗi thời**: con số tốt nhất tìm được là **249/261 thủ tục tính đến 30/6/2022** (QĐ 1254/QĐ-TTg, QĐ 1258/QĐ-TTg). Không thể xác minh được con số hiện tại của năm 2026 — **đừng trích dẫn một con số hiện tại** (đã xác minh 2026-07-17, nguồn: research 08 §6).

Yêu cầu chữ ký số và sự vắng mặt của API cùng nhau có nghĩa là VNSW là một **bước thủ công của con người, vĩnh viễn, đối với mục đích của chúng ta**. Đừng thiết kế các luồng giả định rằng chúng ta có thể đọc được trạng thái giấy phép.

## AEO và xuất nhập khẩu tại chỗ

- **Luật 90/2025/QH15**, có hiệu lực **01/7/2025**, sửa đổi **Điều 42 và 43** của Luật Hải quan: thời gian tuân thủ để được công nhận AEO giảm từ **3 năm xuống 2 năm**, và người nộp đơn phải có một **hệ thống CNTT có khả năng chia sẻ dữ liệu với hải quan**.
- Cùng luật đó **bổ sung Điều 47a, luật hóa xuất nhập khẩu tại chỗ** — điều này quan trọng đối với các luồng logistics và EPE, vốn chính là ngành nghề kinh doanh của người dùng chúng ta.
- **Luật Quản lý thuế 108/2025/QH15**, có hiệu lực **01/7/2026**, thay thế Luật QLT 38/2019.

(đã xác minh 2026-07-17, nguồn: research 08, các phát hiện về AEO/xuất nhập khẩu tại chỗ; văn bản luật gốc không được truy xuất độc lập trong quá trình nghiên cứu — hãy xác minh lại số điều khoản trước khi trích dẫn chúng cho khách hàng)

## Đặt tên định chế — một cái bẫy kỹ nghệ dữ liệu

**Tổng cục Hải quan không còn tồn tại.** Kể từ **01/03/2025** (NĐ 29/2025/NĐ-CP, QĐ 382/QĐ-BTC) nó là **Cục Hải quan** trực thuộc Bộ Tài chính, với **20 Chi cục Hải quan khu vực**. Văn bản được đánh số **`-CHQ`**, không phải `-TCHQ` (đã xác minh 2026-07-17, nguồn: https://xaydungchinhsach.chinhphu.vn/quyet-dinh-382-qd-btc-quy-dinh-chuc-nang-nhiem-vu-quyen-han-va-co-cau-to-chuc-cua-cuc-hai-quan-119250228165530471.htm). Bất kỳ kho công văn nào cũng phải đối chiếu cách đánh số `-TCHQ` trước 3/2025 với `-CHQ` sau 3/2025, nếu không cùng một hướng dẫn sẽ trông như hai văn bản không liên quan.

## Chưa xác minh / Không được dựa vào

Được tái hiện nguyên vẹn về mặt tinh thần từ chính các cờ cảnh báo của research 08. Đừng "rửa" bất kỳ điều nào trong số này thành một khẳng định đầy tự tin.

- **TT 15/2026/TT-BCT, TT 26/2026/TT-BCT, và VBHN 47/VBHN-BCT (4/6/2026)** — một trích xuất đơn lẻ có độ tin cậy thấp (luatvietnam) mô tả VBHN 47 hợp nhất TT 12/2018 với TT 42/2019, TT 08/2023, TT 38/2025, TT 15/2026 và TT 26/2026. Hai thông tư năm 2026 đến từ chính một trích xuất đó. **Hãy xác minh trước khi sử dụng.**
- **NĐ 169/2026/NĐ-CP** (xử phạt hải quan, hiệu lực 1/7/2026, được cho là thay thế NĐ 128/2020) và **NĐ 153/2026/NĐ-CP** (địa bàn hoạt động hải quan, hiệu lực 5/7/2026) — chỉ một nguồn tóm tắt tìm kiếm; **cách đánh số đáng ngờ**. Hãy xác nhận trước khi trích dẫn. Cho đến khi được xác nhận, nghị định xử phạt còn hiệu lực vẫn là **NĐ 128/2020/NĐ-CP được sửa đổi bởi NĐ 102/2021/NĐ-CP**.
- **VBHN 67/VBHN-BNNMT (2026)** về kiểm dịch động vật trên cạn — một nguồn duy nhất.
- **"Danh mục hàng hóa nhóm 2 bị bãi bỏ từ 2026"** theo Luật 78/2025 — **gây tranh cãi, có tính quyết định, và chỉ dựa trên một nguồn thương mại duy nhất** (extendmax), nguồn này cũng khẳng định rằng công bố hợp quy được *tái cấu trúc, chứ không phải bị bãi bỏ*. Khẳng định này sẽ thay đổi hình dạng của bất kỳ bộ máy quy tắc nào. **Hãy xác minh với văn bản luật và nghị định hướng dẫn của nó trước khi xây dựng bất cứ điều gì trên đó.**
- **Liệu một thông tư của BNNMT đã thay thế TT 01/2024/TT-BNNPTNT hay chưa** — không tìm thấy bản thay thế nào được xác nhận.
- **Số lượng thủ tục / số bộ hiện tại của VNSW** — con số tốt nhất hiện có là từ năm 2022.
- **Liệu sự phân tách ecosys.gov.vn / co.moit.gov.vn còn đúng hay không.** ⚠️ Theo báo cáo, các mẫu **D, AK, VK** — những mẫu phải truyền tới VNSW — vẫn được khai tại **ecosys.gov.vn** trong khi mọi thứ khác đã chuyển sang **co.moit.gov.vn**. Hai hệ thống, một quy trình. Điều này được quan sát giữa chừng đợt di chuyển và **chưa được xác minh**.
- **Chi tiết Quyết định 117/QĐ-CHQ** — toàn văn bị chặn phí/403 trong quá trình nghiên cứu; hãy coi các chi tiết cụ thể là mức tin cậy trung bình.
- **Chi tiết cấp điều khoản của Luật 90/2025/QH15 và Luật 108/2025/QH15** — được báo cáo trong research 08 nhưng văn bản luật gốc không được truy xuất độc lập.

## Kiến thức liên quan

- [Bối cảnh dự án](../project-context.md) — Customs Assistant là gì, phục vụ ai, và các ranh giới v1 của nó.
- [Quy tắc nghiệp vụ](../business-rules.md) — các quy tắc bền vững về chính sách, kiểm tra hợp lệ và tuân thủ được rút ra từ quy trình này.
- [Chỉ mục tác nhân](../index.md) — bản đồ của bộ nhớ dự án bền vững.
- [Chỉ mục quyết định kiến trúc](../architecture-decisions/README.md) — ghi lại tại đây bất kỳ quyết định tích hợp (hoặc cố ý không tích hợp) với VNACCS, VNSW, hoặc eCoSys, xét đến vòng đời khoảng 18 tháng của VNACCS.
