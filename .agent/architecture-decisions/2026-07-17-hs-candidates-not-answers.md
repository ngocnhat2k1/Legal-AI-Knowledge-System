---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../concepts/hs-classification.md
  - ../concepts/tariff-system.md
  - ../concepts/legal-rag-retrieval.md
  - ../business-rules.md
  - ../project-context.md
  - ../workflows/customs-declaration.md
---

# Đầu Ra HS Là Top-3 Ứng Viên Kèm Bằng Chứng Nguyên Văn, Không Bao Giờ Là Một Mã Số Trần

## Trạng thái

Đã phê duyệt — chủ dự án đã phê duyệt kế hoạch này vào ngày 2026-07-17.

## Bối cảnh

Tính năng 2 của v1 gợi ý mã HS. Sản phẩm hiển nhiên là "gõ một mô tả sản phẩm, nhận mã HS." Bằng chứng đã đo lường nói rằng sản phẩm đó không hoạt động, và chế độ hỏng là âm thầm.

Các con số benchmark độc lập (đã xác minh 2026-07-17):

| Hệ thống | Độ chính xác ở 10 chữ số | Nguồn |
|---|---|---|
| Chuyên gia con người | **95.0%** | [HSCodeComp, arXiv:2510.19631](https://arxiv.org/html/2510.19631) |
| Agent tốt nhất (SmolAgent + GPT-5 VLM) | **46.8%** | như trên |
| Gemini Deep Research | 40.8% | như trên |
| GPT-5, chỉ LLM, không công cụ | **29.0%** | như trên |
| Qwen2.5-72B | 0.16% | như trên |

Độ chính xác sụp đổ khi đi xuống theo phân cấp: ~82% ở 2 chữ số → 29–47% ở 10 chữ số (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631). HSCodeComp là 632 sản phẩm thương mại điện tử thực được chuyên gia chú giải trên 27 chương HS.

Đối lại, thiết kế đã công bố duy nhất rõ ràng hoạt động — Cơ quan Hải quan Hàn Quốc, dự đoán các phân nhóm 6 chữ số và **truy xuất các câu chủ chốt liên quan từ sổ tay HS làm bằng chứng cho mỗi ứng viên**:

- **Độ chính xác top-3 93.9%** trên 925 phân nhóm khó, được đánh giá trên 5.000 yêu cầu phân loại gần đây.
- Một nghiên cứu người dùng với **32 chuyên gia hải quan** xác nhận rằng các gợi ý cộng với giải thích đã giảm đáng kể thời gian và công sức rà soát.
- (đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2311.10922 · https://dl.acm.org/doi/10.1145/3635158)

**Khoảng cách giữa 46.8% và 93.9% là hợp đồng đầu ra, không phải mô hình.** Cùng một lớp công nghệ, lời hứa khác nhau. Chỉ một trong hai lời hứa là giao được.

Vì sao một mã số sai không phải là một lỗi phần mềm bình thường: HSCodeComp phát hiện các lỗi áp đảo là **"Error but Valid"** — mô hình phát ra một mã HS có thật, được định dạng hợp lệ, đang tồn tại mà lại sai. Không có lỗi phân tích, không có ngoại lệ, không có tụt độ tin cậy, không có tín hiệu cú pháp nào thuộc bất kỳ loại nào (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631). Nó chảy vào tờ khai, được chấp nhận, và nổi lên sau đó dưới dạng một cuộc kiểm tra sau thông quan: 20% của phần thiếu khi hải quan phát hiện ra (Nghị định 128/2020/NĐ-CP Điều 9 khoản 3), truy thu toàn bộ phần thiếu, lãi chậm nộp 0.03%/ngày, cộng với mất ưu đãi FTA và phơi nhiễm chống bán phá giá hồi tố (đã xác minh 2026-07-17, nguồn: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-9). Độ tin cậy của AI không tương quan với kết quả pháp lý, và chế độ hỏng là âm thầm và bị trễ đi nhiều năm.

## Quyết định

Tính năng gợi ý HS **không bao giờ trả về một mã số như một câu trả lời**. Kiểu phản hồi của nó là một tập ứng viên được xếp hạng, và API làm cho hình dạng mã-số-trần trở nên không biểu diễn được.

1. **Đầu ra là top-3 ứng viên.** Không phải top-1. Không phải một trường "phỏng đoán tốt nhất". Một kết quả một-phần-tử vẫn là một danh sách ứng viên, không phải một câu trả lời.
2. **Mỗi ứng viên mang bằng chứng pháp lý nguyên văn** — Ghi chú Chương, Ghi chú Phần, văn bản nhóm, đoạn EN, mục SEN, hoặc công văn cụ thể, **được trích nguyên văn, không diễn giải lại**, kèm định danh văn bản nguồn của nó. Một ứng viên không có bằng chứng truy xuất được thì không được hiển thị.
3. **Từ chối là một thành công hạng nhất**, được trả về qua chính hợp đồng đó, không phải một nhánh lỗi. Đầu ra có giá trị cao nhất trên một mặt hàng khó là: *"cả hai nhóm này đều có vẻ áp dụng được, đây là các ghi chú cạnh tranh, việc này cần xác định trước mã số theo Luật Hải quan 2014 Điều 28."* Định tuyến tới Điều 28 là một tính năng — nó là cơ chế duy nhất tạo ra sự chắc chắn pháp lý ở Việt Nam (tối đa 3 năm, và chỉ cho đúng mặt hàng được mô tả) (đã xác minh 2026-07-17, nguồn: https://luatvietan.vn/huong-dan-thu-tuc-xac-dinh-truoc-ma-so-hang-hoa.html).
4. **Mã số ưa thích của người dùng không bao giờ đi vào prompt như một tiền đề.** Không có đầu vào "8544.49.49 có đúng cho cái này không?", không có mã của tờ khai trước được truyền vào ngữ cảnh phân loại, không có endpoint "xác nhận mã này". Các kiểm tra nhất quán với lịch sử chạy như một **so sánh tất định riêng biệt sau khi** các ứng viên được sinh ra — không bao giờ như ngữ cảnh prompt trước đó.
5. **Con người quyết định, và giao diện ghi lại rằng họ đã quyết định.** Hệ thống lưu ứng viên nào mà nhân sự đã chọn và bằng chứng được hiển thị tại thời điểm chọn. Bản ghi đó là hồ sơ.
6. **Phơi bày bất đồng thay vì giải quyết nó.** Nơi các công văn xung đột nhau, hiển thị cả hai.

## Lý do căn bản

**Vì sao top-3 chứ không phải top-1.** Top-1 tự động ở 10 chữ số là 46.8% — tệ hơn một cú tung đồng xu trên các chữ số quyết định mức thuế. Top-3 kèm bằng chứng ở 6 chữ số là 93.9% *với thời gian tiết kiệm của chuyên gia đã đo lường được*. Một người khai hải quan rà soát ba ứng viên với các ghi chú đính kèm đang làm việc phân loại nhanh hơn; một người khai hải quan được trao một con số đang chẳng làm gì cả, chính xác là chế độ thất bại. Bản tiền in về pipeline có cấu trúc báo cáo cùng hình dạng — 4 chữ số 75.0% top-1 so với **91.5% top-3**; 6 chữ số 64.2% top-1 so với **78.3% top-3** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2605.14857, bản tiền in 2026, chưa bình duyệt).

**Vì sao bằng chứng nguyên văn chứ không phải một lời giải thích.** Kết quả của KCS không phải là "mô hình tự giải thích." Nó là *truy xuất chính các câu trong sổ tay*. Sự phân biệt đó quan trọng gấp đôi: truy xuất là phần của stack vốn mạnh, còn văn xuôi được sinh ra là nơi trú ngụ của chế độ hỏng số 4 của HSCodeComp, **ảo giác lập luận** — các chuỗi lập luận có vẻ hợp lý mà sai (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631). Một Ghi chú Chương được trích dẫn thì con người kiểm được trong vài giây. Một đoạn văn được sinh ra về một Ghi chú Chương là một trách nhiệm pháp lý mới. Trích dẫn cũng là artifact bảo vệ được duy nhất khi một Chi cục Hải quan khu vực chất vấn mã số.

**Vì sao mã số ưa thích bị cấm khỏi prompt.** Cảnh báo của người hành nghề rất thẳng thừng: *"if you want your HTS to be X (even if the correct HTS is Y), AI will give you an argument (or three) to support your preferred HTS"* (đã xác minh 2026-07-17, nguồn: https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/). Mô hình là một luật sư bào chữa xu nịnh, không phải một quan tòa. Cho nó một mã số đích khiến nó chế tạo ra một lập luận pháp lý cho mã đó — chính là dấu vết giấy tờ hỗ trợ một sự quy kết **trốn thuế** theo Nghị định 128/2020/NĐ-CP Điều 14: **1× đến 3× số thuế trốn, có thể chuyển hồ sơ hình sự** (đã xác minh 2026-07-17, nguồn: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-8). Một công cụ HS thiên lệch xác nhận không chỉ đưa ra một câu trả lời sai; nó nâng cấp một mức phạt 20% thành một kết luận về ý định, bằng văn bản, với tên sản phẩm của chúng ta trên đó. Ràng buộc này là một bảo đảm ở cấp schema, không phải một chỉ dẫn prompt.

**Vì sao từ chối là một thành công chứ không phải một thất bại.** 76% doanh nghiệp Việt Nam báo cáo gặp trở ngại khi xác nhận mã HS, tăng từ 66.3% năm 2018 (đã xác minh 2026-07-17, nguồn: https://diendandoanhnghiep.vn/ganh-nang-ma-hs-trach-nhiem-cua-co-quan-hai-quan-o-dau-10077631.html). Đó không phải là sự thiếu hiểu biết của người dùng — nó phản ánh rằng thường không có một câu trả lời đúng duy nhất ổn định. Các chuyên gia hợp lý vẫn bất đồng; một cuộc kiểm toán 226 bất đồng phát hiện **~42.5% các dự đoán "sai" của mô hình thực ra được các quy tắc HS hỗ trợ tốt hơn so với ground truth đã công bố** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2605.14857). Một hệ thống luôn tạo ra một mã số tự tin là đang nói dối về lĩnh vực này. Vụ sữa — 8 nhà sản xuất được cho là đối mặt truy thu hồi tố ~700 tỷ VND sau khi hải quan phân loại lại Anhydrous Milk Fat 0405.90.10 → 0405.90.90 vào tháng 12 năm 2014, áp dụng ngược về các tờ khai từ 2010 — là cái giá mà "câu trả lời đơn nhất tự tin" phải trả ở quy mô lớn (nguồn: nghiên cứu 09 §2 — **báo cáo không đưa nguồn cho vụ việc này; mang tính minh họa, không phải sự thật đã xác lập**; xem [Quy tắc Nghiệp vụ → Chưa xác minh](../business-rules.md#chưa-xác-minh--không-được-dựa-vào)).

**Vì sao thêm quy tắc prompt sẽ không cứu được top-1.** Hai phát hiện của HSCodeComp chặn trước các tối ưu hiển nhiên: **mở rộng quy mô tại thời điểm suy luận không giúp ích** (bỏ phiếu đa số và tự-phản-tư cho lợi ích không đáng kể, khác với các lĩnh vực lập luận khác), và **cho mô hình các quy tắc quyết định do con người viết một cách tường minh đã làm giảm hiệu năng với hầu hết các hệ thống** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631). Không có prompt nào biến 46.8% thành 95%. Đừng thử làm điều đó.

## Phạm vi

Áp dụng cho:

- Tính năng gợi ý ứng viên HS (mục phạm vi v1 số 2) và mọi bề mặt API phơi bày nó.
- Bất kỳ tính năng RAG tương lai nào trả về một kết luận liên quan đến phân loại.

**Không** áp dụng cho tra cứu biểu thuế (mục phạm vi v1 số 1), vốn là tất định và khóa theo HS + biểu + ngày, không có mô hình nào trong đường xử lý. Xem [Hệ thống Biểu thuế](../concepts/tariff-system.md). Hai tính năng không được trộn lẫn trong giao diện theo cách cho phép một ứng viên được gợi ý chảy vào một lần tra cứu mức thuế như thể nó đã được xác nhận.

## Các phương án đã cân nhắc

- **Top-1 với một điểm số độ tin cậy.** Bị bác. Các lỗi là "Error but Valid" và điểm số sẽ là mô hình tự báo cáo trên một nhiệm vụ mà tự-phản-tư có thể đo được là không giúp ích. Một con số độ tin cậy bên cạnh một mã sai-nhưng-hợp-lệ làm cho thất bại thuyết phục hơn, chứ không kém đi.
- **Phân loại tự động với con người kiểm tra ngẫu nhiên.** Bị bác. Ở 46.8%, kiểm tra ngẫu nhiên một mẫu không giới hạn được sai số — bạn sẽ phải làm lại từng cái, chính là quy trình thủ công cộng thêm một trung tâm chi phí.
- **Mua một bộ phân loại của nhà cung cấp.** Bị bác trên các con số. Zonos tiếp thị "độ chính xác 90%+ ngay ra khỏi hộp"; kiểm thử độc lập trên 103 phán quyết CBP được lấy ngẫu nhiên đặt nó ở **44.1%** ở 10 chữ số. Con số **80.0%** của Avalara đến từ một sản phẩm rõ ràng bao gồm rà soát của chuyên gia con người trong vòng lặp. Tarifflo đạt 89.2% (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2412.14179v1 · https://zonos.com/classify · https://www.avalara.com/us/en/products/global-commerce-offerings/item-classification.html). Benchmark nhỏ (n=103) và đặc thù US-HTS, nên nó không chuyển giao sạch sẽ sang AHTN 8 chữ số — nhưng khuôn mẫu vẫn đúng: các tuyên bố của nhà cung cấp chạy ~2× hiệu năng được đo lường độc lập của họ, và con số 80%+ duy nhất không bị tranh cãi lại có con người bên trong nó. Đó chính là thiết kế của ADR này, mua thay vì xây.
- **Một endpoint "xác nhận mã của tôi"** (tính năng người dùng sẽ đòi hỏi đầu tiên). Bị bác — đây là chế độ hỏng thiên lệch xác nhận, được cố ý sản phẩm hóa.

## Hệ quả

- Kiểu phản hồi API cho gợi ý HS không có trường nào có thể chứa một mã được chấp nhận đơn nhất. Thêm một trường như vậy là một thay đổi phá vỡ đòi hỏi một ADR mới.
- Truy xuất bằng chứng — chứ không phải bộ phân loại — là thành phần chịu lực. Chất lượng sản phẩm bị giới hạn bởi độ bao phủ kho ngữ liệu, không phải bởi lựa chọn mô hình. Việt Nam **không có cái tương đương CROSS/EBTI**: danh mục (Thông tư 31/2022/TT-BTC, HS 2022/AHTN 2022, 8 chữ số, vẫn còn hiệu lực trong 2026) công khai dưới dạng phụ lục Word/PDF không có API chính thức, và kho phán quyết thì phân tán, một phần có tường phí, và không máy đọc được (đã xác minh 2026-07-17, nguồn: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx · báo cáo nghiên cứu 09). Xem [Nguồn Dữ liệu](../concepts/data-sources.md).
- Nếu chúng ta không thể trích dẫn một ghi chú, chúng ta không thể giao ứng viên đó. Điều đó là có chủ ý; nó làm cho các lỗ hổng kho ngữ liệu trở nên hữu hình thay vì để mô hình che lấp chúng.
- Nhân sự phải được nói cho biết giới hạn trung thực tại điểm sử dụng: không có hệ thống AI nào đã công bố hay thương mại đạt được độ chính xác của chuyên gia con người ở 8/10 chữ số.
- Mỗi ứng viên phải được phiên bản hóa theo HS 2022/AHTN 2022 hiện nay, HS 2028 từ 01/01/2028, và phải theo dõi điểm gãy đánh số văn bản `-TCHQ` → `-CHQ` vào 01/03/2025 (Tổng cục Hải quan trở thành Cục Hải quan thuộc Bộ Tài chính theo Nghị định 29/2025/NĐ-CP) (đã xác minh 2026-07-17, nguồn: https://xaydungchinhsach.chinhphu.vn/quyet-dinh-382-qd-btc-quy-dinh-chuc-nang-nhiem-vu-quyen-han-va-co-cau-to-chuc-cua-cuc-hai-quan-119250228165530471.htm).

## Rủi ro

- **Người dùng lách qua hợp đồng.** Nhân sự sẽ dán ứng viên 1 vào VNACCS mà không đọc bằng chứng, tái dựng top-1 theo thói quen. Hợp đồng ràng buộc đầu ra của chúng ta, không phải hành vi của họ. Biện pháp giảm thiểu ở cấp giao diện (không cho sao chép một-cú-nhấp một mã mà không kèm bằng chứng của nó) và không được giải quyết bởi ADR này.
- **Các lỗ hổng kho ngữ liệu gây từ chối quá mức.** Với một kho phán quyết mỏng, câu trả lời trung thực là "cần xác định trước mã số" thường xuyên hơn mức người dùng chịu đựng được. Từ chối là đúng nhưng có một chi phí sử dụng, và một công cụ từ chối liên tục sẽ bị bỏ để đổi lấy một công cụ nói dối.
- **Ground truth là gây tranh cãi.** Tối ưu các ứng viên hướng tới đồng thuận với hải quan là mục tiêu đúng về mặt thương mại nhưng không giống với việc đúng (phát hiện ~42.5% ở trên). Chúng ta đang xây một cỗ máy đồng thuận, và nên nói vậy trong nội bộ.
- **Nền tảng pháp lý đang dịch chuyển.** Một sửa đổi Luật Hải quan nữa đã được trình lên UBTVQH vào 15/7/2026 — hai ngày trước ADR này (đã xác minh 2026-07-17, nguồn: báo cáo nghiên cứu 09). Các bậc phạt và quy trình Điều 28 được trích dẫn ở đây có thể thay đổi.

## Chưa xác minh / Không được dựa vào

- **"Claude 3.5 Sonnet và GPT-4 đạt ~80% ở 6 chữ số và >90% ở 2 chữ số."** Xuất hiện trong một đoạn trích tìm kiếm với **không có nguồn sơ cấp truy vết được**, và nó mâu thuẫn với HSCodeComp (GPT-5 chỉ-LLM: 29.0% ở 10 chữ số, ~82% ở 2 chữ số). Đừng dùng cái này để lập luận rằng top-1 là khả thi.
- **"1 trong 3 tờ khai hải quan bị phân loại sai; hàng chục tỷ tiền thuế bị nộp sai."** Xuất hiện trên các blog của nhà cung cấp không có trích dẫn sơ cấp. Có vẻ đúng về mặt định hướng, nhưng không nguồn. Đừng đưa nó vào bất kỳ tài liệu nào hướng tới người dùng hay nhà đầu tư.
- **Quyết định 117/QĐ-CHQ (2026)** — quy trình nội bộ xác định trước mã số mới, áp dụng từ ~01/02/2026, được cho là xây trên nguyên tắc rằng **mỗi mặt hàng có đúng một mã HS** và trên một cơ sở dữ liệu phân loại thống nhất toàn ngành. **Không thể lấy được toàn văn (tường phí/403) — độ tin cậy trung bình về chi tiết.** Hai lưu ý: cơ sở dữ liệu đó là một hệ thống *nội bộ* và không được giả định rằng nó sẽ trở nên sẵn có cho chúng ta; và nếu nguyên tắc "đúng một mã HS" là có thật, nó nằm trong sự căng thẳng với phát hiện ~42.5% về ground truth, một câu hỏi còn tồn tại mà ADR này không giải quyết.
- **Thông tư 121/2025/TT-BTC** (ban hành 18/12/2025, hiệu lực 01/02/2026) sửa đổi các quy tắc hồ sơ xác định trước (sửa đổi khoản 1, bổ sung khoản 6 Điều 7 của TT 38/2015) với các biểu mẫu mới 01a-TB XDTMS / 01b-Thay the XDTMS / 01c-Huy XDTMS. Nếu chúng ta có bao giờ soạn hồ sơ, hãy xác minh bộ biểu mẫu hiện hành trước khi xây dựng theo `01/XĐTMS/TXNK`.
- Các con số Deterministic Agentic Workflow (arXiv:2605.14857) đến từ một **bản tiền in 2026 chưa được bình duyệt**. Được trích dẫn ở trên như hỗ trợ định hướng cho top-3 > top-1, không phải như một mục tiêu.

## Yêu cầu rà soát

- Xác minh rằng schema phản hồi gợi ý HS không thể biểu diễn một mã trần — không có trường vô hướng `hs_code`, `best_match`, hay `recommended`.
- Xác minh rằng không đường code nào đặt một mã HS do người dùng cung cấp, mang tính lịch sử, hay của tờ khai trước vào ngữ cảnh prompt phân loại.
- Xác minh rằng mỗi ứng viên được hiển thị kèm văn bản nguồn được trích dẫn và một định danh văn bản phân giải được, và rằng các ứng viên không có bằng chứng bị loại bỏ thay vì hiển thị trần.
- Xác minh rằng từ chối được trả về qua hợp đồng thành công thông thường với tuyến Điều 28 được nêu tên.
- Xác minh rằng đường tra cứu biểu thuế (tất định) không dùng chung code với đường gợi ý và rằng một ứng viên được gợi ý không thể âm thầm trở thành một khóa tra cứu.

## Kiến thức liên quan

- [Phân loại HS](../concepts/hs-classification.md) — thứ tự GRI, phân cấp ghi chú pháp lý, vì sao phân loại là lập luận pháp lý chứ không phải tra cứu.
- [Hệ thống Biểu thuế](../concepts/tariff-system.md) — phía tất định mà ADR này rõ ràng không chi phối.
- [Truy xuất RAG Pháp lý](../concepts/legal-rag-retrieval.md) — stack truy xuất mang theo yêu cầu bằng chứng.
- [Nguồn Dữ liệu](../concepts/data-sources.md) — tính sẵn có của kho ngữ liệu, thứ giới hạn độ bao phủ bằng chứng.
- [Quy tắc Nghiệp vụ](../business-rules.md) — các bậc phạt, quy tắc xác định trước, trách nhiệm của người khai.
- [Bối cảnh Dự án](../project-context.md) — phạm vi v1 và ranh giới con-người-quyết-định.
- [Quy trình Khai báo Hải quan](../workflows/customs-declaration.md) — nơi tập ứng viên được tiêu thụ.
