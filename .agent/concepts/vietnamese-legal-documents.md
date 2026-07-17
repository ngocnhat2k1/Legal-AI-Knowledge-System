---
type: concept
status: active
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../index.md
---

# Văn bản pháp luật Việt Nam (VBQPPL)

Hệ thống văn bản quy phạm pháp luật Việt Nam thực sự vận hành như thế nào, dành cho các agent xây dựng Customs Assistant. **Hãy giả định rằng dữ liệu huấn luyện của bạn sai về lĩnh vực này.** Việt Nam đã tái cơ cấu các bộ ngành năm 2025, tách và thay thế nhiều đạo luật cốt lõi về logistics trong giai đoạn 2025–2026, và thay đổi địa vị pháp lý của các văn bản hợp nhất vào tháng 6/2026. Mọi khẳng định dưới đây đều kèm ngày xác minh và một nguồn; những khẳng định mà nghiên cứu không thể xác nhận được cách ly trong mục [Chưa xác minh / Không được dựa vào](#chưa-xác-minh--không-được-dựa-vào).

**Mốc xác minh chung cho toàn bộ ghi chú này: 2026-07-17.** Bất kỳ nội dung nào không có dòng nguồn đều là khuyến nghị mô hình hóa, không phải sự thật.

---

## 1. Thứ bậc các quy phạm

| Cấp | Văn bản | Cơ quan ban hành | Ghi chú |
|---|---|---|---|
| 1 | **Luật / Bộ luật** | Quốc hội | Norm cao nhất trong nhóm thông thường. `NN/YYYY/QHXX` (vd `35/2024/QH15`). |
| 1b | **Pháp lệnh / Nghị quyết** | Ủy ban Thường vụ Quốc hội | `NN/YYYY/UBTVQHXX`. Cũng có **Nghị quyết** của Chính phủ (`NQ-CP`) — xem câu chuyện an toàn thực phẩm ở §5, nơi một NQ đình chỉ một Nghị định. |
| 2 | **Nghị định** | Chính phủ | `NN/YYYY/NĐ-CP`. "Quy định chi tiết" một Luật. Nơi phần lớn chi tiết hải quan có hiệu lực thực thi nằm ở đây. |
| 3 | **Thông tư** | A Bộ trưởng | `NN/YYYY/TT-<BỘ>`. Các phụ lục ánh xạ HS↔yêu cầu nằm ở đây. |
| 4 | **Quyết định / Công văn** | Thủ tướng, Bộ, Cục | `QĐ-TTg`, `QĐ-BCT`, `CV .../CHQ-GSQL`. Công văn là **hướng dẫn, không phải norm** — nó không tạo ra nghĩa vụ, nhưng cán bộ hải quan lại hành động dựa trên nó. |

**Vì sao phân tầng lại quan trọng cho việc truy hồi (retrieval), chứ không chỉ để gọn gàng:** research 02 ghi nhận chế độ thất bại số 6 — *dữ liệu huấn luyện lấn át ngữ cảnh truy hồi*. Một LLM đã đọc rất nhiều văn bản nêu quy tắc chung (từ một Luật) hơn là văn bản nêu ngoại lệ hẹp (trong một Thông tư), và sẽ trung thành với dữ liệu huấn luyện của nó thay vì với đoạn văn bản bạn truy hồi được. Trong công việc hải quan, ngoại lệ trong Thông tư thường mới là câu trả lời. Thứ bậc phải là một trường được nêu rõ và hiển thị (surfaced) để mô hình không thể âm thầm ưu tiên quy tắc chung nổi tiếng hơn. *(đã xác minh 2026-07-17, nguồn: https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf)*

### Cuộc tái cơ cấu 2025 — điều này phá vỡ tra cứu dựa trên cơ quan ban hành

Có hiệu lực khoảng tháng 2–3/2025, chính phủ tái tổ chức thành **14 bộ + 3 cơ quan ngang bộ**, và **cấp tổng cục bị bãi bỏ hoàn toàn**. *(đã xác minh 2026-07-17, nguồn: https://thesaigontimes.vn/chinh-phu-khoa-xv-con-14-bo-3-co-quan-ngang-bo-bo-cap-tong-cuc/)*

| Trước | Nay (2026) | Khi nào |
|---|---|---|
| Bộ Giao thông vận tải + Bộ Xây dựng | **Bộ Xây dựng** (23 đơn vị) | Bộ GTVT chấm dứt **18/02/2025**; hợp nhất có hiệu lực **01/03/2025** |
| Bộ NN&PTNT + Bộ TN&MT | **Bộ Nông nghiệp và Môi trường (BNNMT)** (30 đơn vị) | vận hành **01/03/2025** |
| Bộ TT&TT + Bộ KH&CN | **Bộ Khoa học và Công nghệ** | 2025 |
| **Tổng cục Hải quan** | **Cục Hải quan**, thuộc Bộ Tài chính | cấp tổng cục bị bỏ |
| Cục Hàng hải VN + Cục ĐTNĐ | **Cục Hàng hải và Đường thủy VN (VIMAWA)** | 2025 |
| Bộ Công Thương, Bộ Y tế | không đổi | — |

*(đã xác minh 2026-07-17, nguồn: https://xaydungchinhsach.chinhphu.vn/co-cau-to-chuc-moi-cua-bo-nong-nghiep-va-moi-truong-tu-1-3-2025-119250301070610666.htm · https://vnexpress.net/bo-xay-dung-sau-hop-nhat-co-23-don-vi-4855091.html · https://plo.vn/tu-ngay-1-3-khong-con-ten-bo-giao-thong-van-tai-post836639.html · https://moc.gov.vn/vn/tin-tuc/1173/83921/ky-vong-lon-sau-hop-nhat-bo-giao-thong-van-tai-va-bo-xay-dung.aspx)*

Lưu ý hai mốc ngày cho Bộ GTVT: research 08 ghi nhận bộ này chấm dứt **18/02/2025**, research 03 ghi nhận hợp nhất có hiệu lực **01/03/2025**. Cả hai đều được báo cáo; hãy coi 18/02 là ngày chấm dứt và 01/03 là ngày cơ cấu mới đi vào vận hành, thay vì cho rằng một trong hai là lỗi.

**Hệ quả thực tế — đây là phần làm hỏng code.** Tiền tố của thông tư đã thay đổi giữa chừng trong kho văn bản:

- `TT-BGTVT` → `TT-BXD`
- `TT-BNNPTNT` → `TT-BNNMT`
- `...-TCHQ` → `...-CHQ` (vd hướng dẫn triển khai NĐ 167/2025 ban hành dưới dạng **CV 21067/CHQ-GSQL**)

Các thông tư cũ **giữ nguyên ký hiệu cũ** — TT 01/2024/TT-BNNPTNT vẫn được gọi như vậy — nhưng cơ quan ban hành nay là BNNMT. Vì thế số hiệu văn bản và cơ quan ban hành hiện hành mâu thuẫn với nhau, vĩnh viễn, đối với toàn bộ kho văn bản trước 2025.

> **Hãy mô hình hóa các bộ như thực thể (entity) có bí danh (alias) và khoảng thời gian hiệu lực, không bao giờ là một chuỗi tên trên văn bản.** Một phép tra cứu dựa trên tên bộ sẽ hỏng trên toàn bộ mảng dọc: "tìm tất cả thông tư giao thông của Bộ Xây dựng" phải trả về các văn bản `TT-BGTVT`, và "ai ban hành cái này?" đối với một `TT-BGTVT` năm 2021 phải trả lời "Bộ Xây dựng" ở thời điểm hôm nay và "Bộ GTVT" tính theo năm 2021. Cả hai truy vấn đều có thật và cả hai đều sai nếu dùng trường chuỗi. *(đã xác minh 2026-07-17, nguồn: research 03 headline correction #5 và research 08 §1)*

---

## 2. Cấu trúc nội tại

```
Phần → Chương → Mục → Điều → Khoản → Điểm
```

**Điều là đơn vị được viện dẫn.** Người hành nghề viện dẫn "Điều 42 Luật Đường bộ", không phải một trang hay một đoạn. Khoản và Điểm được định địa chỉ *bên trong* một Điều ("điểm a khoản 20 Điều 7").

**Vì sao điều này mang tính chịu lực chứ không phải trang trí:** chia đoạn theo cấu trúc (structural chunking) không phải là sở thích văn phong — nó đã được đo lường. Trên bộ luật dân sự Đức (cấu trúc gần như y hệt: `§`≈Điều, `Absatz`≈Khoản, `Satz`≈Điểm), 21 chiến lược chia đoạn trên 525 câu hỏi được gán nhãn vàng cho Recall@10 là **0.47 (subsection) / 0.46 (section) / 0.45 (sentence)** so với **0.31–0.37 cho mọi chiến lược kích thước cố định**. Các đơn vị cấu trúc về mặt thống kê không phân biệt được với nhau nhưng đánh bại dứt khoát mọi thứ phi cấu trúc. *(đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2605.19806)*

Dạng khả thi: **index theo từng Khoản, trả về Điều cha.** Đừng dằn vặt về việc chọn Điều-hay-Khoản làm đơn vị index — quy tắc đo được là *đừng bao giờ cắt ngang một ranh giới cấu trúc*. Xem các ghi chú khái niệm về RAG để có toàn bộ lập luận truy hồi; điều thuộc về đây là vì sao mô hình văn bản phải mang thứ bậc một cách tường minh: bạn không thể truy hồi trên một cấu trúc mà bạn không lưu.

---

## 3. Hiệu lực không phải một giá trị boolean và không phải điều nghĩ đến sau cùng

Bốn trạng thái, tất cả đều xảy ra:

| Trạng thái | Ý nghĩa |
|---|---|
| **Còn hiệu lực** | Đang có hiệu lực. |
| **Hết hiệu lực một phần** | Bị bãi bỏ một phần — một số Điều/Khoản đã chết, phần còn lại còn sống. |
| **Hết hiệu lực toàn bộ** | Bị bãi bỏ hoàn toàn. |
| **Chưa có hiệu lực** | Đã ban hành, đã công bố, **chưa có hiệu lực**. Luật-trên-giấy thật sự mà không được phục vụ như luật hiện hành. |

**Con số biện minh cho toàn bộ bộ máy thời gian:** SBV-LawGraph kiểm kê 1.703 văn bản của Ngân hàng Nhà nước Việt Nam và thấy **863 hết hiệu lực toàn bộ, 191 hết hiệu lực một phần, 639 còn hiệu lực** — tức là **~62% của một kho văn bản Việt Nam thực tế là luật đã chết hoặc chết một phần**. *(đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)*

Nếu bạn nạp một kho văn bản pháp luật Việt Nam mà không lọc theo thời gian, phần lớn những gì bạn truy hồi được là sai. Đây không phải rủi ro đuôi (tail risk); đó là tỷ lệ nền (base rate).

Và đây là một chế độ thất bại của LLM đã được *đo lường*, không phải giả định: trên 312 cặp hỏi-đáp luật định của Đức đã được kiểm định và năm LLM lớn, xuất hiện hai kiểu thất bại thời gian riêng biệt — (1) áp dụng **quy tắc lỗi thời** sau khi pháp luật thay đổi (sự cũ kỹ do mốc cắt huấn luyện), và (2) **ưu tiên điều khoản mới hơn ngay cả khi phiên bản cũ mới đúng áp dụng** — một thiên lệch ưa cái mới mà **riêng RAG không sửa được**. Phát hiện quan trọng: các cách tiếp cận coi hiệu lực thời gian như một **ràng buộc cứng (một bộ lọc, không phải tín hiệu xếp hạng)** cải thiện hiệu năng đáng kể. *(đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2605.23497)*

> **Chỉ thị thiết kế:** trích xuất ngày as-of từ truy vấn, rồi *lọc* tập ứng viên. Đừng hy vọng bộ reranker sẽ sắp xếp cho ổn. Nó, đo được, không làm được.

### Valid time vs transaction time thực sự khác nhau ở đây

Không phải sự tỉ mỉ học thuật — bốn cơ chế cụ thể của Việt Nam buộc phải phân biệt *(đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2505.00039 và research 02 §2)*:

- **vacatio legis là phổ biến khắp nơi.** Ngày công bố ≠ ngày có hiệu lực. Các đạo luật Việt Nam nêu điều này trong chính văn bản: *"Luật này có hiệu lực thi hành từ ngày 01/7/2026."* Khoảng cách thường là vài tháng.
- **Hiệu lực trở về trước (retroactive effect)** bị hạn chế nhưng được cho phép.
- **Hiệu lực trì hoãn / có điều kiện** — theo từng khoản, xem §4.
- **Đính chính (corrigenda)** thay đổi hồ sơ chính thức **mà không thay đổi valid time**. Văn bản bạn đang giữ là sai; luật thì chưa bao giờ khác đi.

Chỉ một mô hình song thời gian (bitemporal) mới phân biệt được "luật vào ngày 2023-05-01 là gì?" với "chúng ta *tin* luật vào ngày 2023-05-01 là gì, với hồ sơ như nó tồn tại lúc đó?" Một tờ khai hải quan được xét theo cái thứ nhất; một tranh chấp về tờ khai quá khứ cần cái thứ hai.

**Mẫu mô hình hóa đáng học hỏi (SAT-Graph):** trừu tượng **Work** so với **Expression** có phiên bản; các thành phần (Chương/Điều) tạo nên bộ khung của graph lấy từ *cấu trúc nội tại* của văn bản, **không** phải từ trích xuất thực thể bằng LLM; mỗi thành phần mang **Component Temporal Versions (CTV)** với khoảng hiệu lực; một truy vấn điểm-thời-gian là một vị từ khoảng có tính tất định `tv.valid_start ≤ t < coalesce(tv.valid_end, +∞)`. Mẹo hiệu quả: một CTV cha mới ở ngày Dₙ là một **phép tổng hợp tái sử dụng các CTV hiện có của những đứa con không thay đổi** — bạn không nhân bản cả một Luật ở mỗi lần sửa đổi, chỉ những thành phần thay đổi mới có phiên bản mới. **Cảnh báo trung thực: SAT-Graph chỉ triển khai valid time, không phải song thời gian thực thụ, và không báo cáo đánh giá định lượng nào.** Hãy áp dụng mô hình dữ liệu; đừng viện dẫn nó như bằng chứng về hiệu năng. *(đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2505.00039)*

---

## 4. ⚠️ Ví dụ minh họa chứng minh mô hình hóa thời gian theo từng khoản là bắt buộc

Trường hợp đơn lẻ này chứa cả ba cái bẫy. Nó là lý do vì sao một cột `document.effective_date` là không đủ.

**Luật Giao thông đường bộ 2008 (23/2008/QH12) đã CHẾT kể từ 01/01/2025.** Nó bị **tách ra, không phải sửa đổi**, thành hai luật, cả hai đều được thông qua 27/06/2024 (QH XV, kỳ họp 7), cả hai đều có hiệu lực 01/01/2025 *(đã xác minh 2026-07-17, nguồn: https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/49-vbhn-vpqh.pdf · https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf · https://vanban.chinhphu.vn/?pageid=27160&docid=211194&classid=1&typegroupid=3)*:

| Luật | Phạm vi | Cơ quan quản lý |
|---|---|---|
| **35/2024/QH15 — Luật Đường bộ** (6 chương, 86 điều) | hạ tầng đường bộ, quy hoạch, đầu tư/xây dựng, quản lý–vận hành–bảo trì, **vận tải đường bộ**, cơ sở dữ liệu đường bộ, ITS | **Bộ Xây dựng** ← nửa liên quan đến logistics |
| **36/2024/QH15 — Luật Trật tự, an toàn giao thông đường bộ** | quy tắc giao thông, người lái, phương tiện, GPLX, đăng ký xe | **Bộ Công an** |

Đường phân chia: **hạ tầng + kinh doanh vận tải → 35/2024; quy tắc giao thông + người lái → 36/2024.**

**Bẫy 1 — hiệu lực trì hoãn theo từng khoản.** Điều 85 khoản 2 của Luật Đường bộ đưa **bốn quy định có hiệu lực sớm, vào 01/10/2024**: *"Điểm a và điểm b khoản 2 Điều 42, Điều 43, Điều 50, khoản 1 Điều 84 của Luật này có hiệu lực thi hành từ ngày 01 tháng 10 năm 2024."* Một `effective_date = 2025-01-01` đơn lẻ trên văn bản là sai cho bốn điều đến ba tháng.

**Bẫy 2 — một luật ban hành sau đã sửa đổi chính điều về ngày hiệu lực.** Điều 88 khoản 2 của Luật 36/2024 (điều lên lịch cho các khoản trì hoãn) **tự nó bị sửa đổi** bởi **Luật 118/2025/QH15** (sửa đổi 10 luật về an ninh, trật tự; ban hành 10/12/2025). Metadata về ngày hiệu lực không phải metadata — **nó là văn bản, và văn bản thì bị sửa đổi.**

**Bẫy 3 — luật sửa đổi lại có ngày hiệu lực tách riêng của chính nó.** Điều 11 của Luật 118/2025: có hiệu lực **01/7/2026**, **trừ điểm a khoản 20 Điều 7 — có hiệu lực 01/01/2026**. Cái khoản có hiệu lực sớm hơn đó *chính là* khoản viết lại Điều 88 khoản 2, tức là việc hoãn quy tắc thiết bị an toàn cho trẻ em đã đáp xuống **01/01/2026, một ngày trước khi thời hạn gốc lẽ ra bắt đầu cắn.**

Kết quả ròng, hiện hành tính đến 17/07/2026:

| Điều khoản | Thường được viện dẫn | **Thực tế** |
|---|---|---|
| Khoản 3 Điều 10 — thiết bị an toàn cho trẻ em (<10 tuổi & <1,35 m; không nằm ở hàng người lái) | 01/01/2026 | **01/7/2026** — đang có hiệu lực |
| Khoản 2a Điều 35 — camera ghi hình người lái (xe KDVT hành khách <8 chỗ; xe KDVT hàng hóa trừ đầu kéo; xe vận tải nội bộ) | — (mới) | **01/01/2028** |
| Khoản 2a Điều 35 — camera trong khoang hành khách (xe KDVT hành khách ≥8 chỗ) | — (mới) | **01/01/2029**, theo lộ trình của Chính phủ |

*(đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?classid=1&docid=216534&orggroupid=1&pageid=27160 · https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf)*

**Cái mốc "thiết bị an toàn trẻ em 01/01/2026" mà một mô hình sẽ tự tin đưa ra từ dữ liệu huấn luyện đã lỗi thời. Nó là 01/7/2026.** Đó là toàn bộ bài học trong một dòng.

Các trường hợp loại trừ khỏi bãi bỏ, để đầy đủ: Luật GTĐB 2008 bị bãi bỏ bởi Điều 88 khoản 3 của Luật 36/2024 và Điều 85 khoản 3 của Luật 35/2024, **với các trường hợp loại trừ hẹp** qua Điều 89 khoản 1, 2, 5, 6 của Luật 36/2024 và Điều 86 của Luật 35/2024 (chuyển tiếp cho các dự án đường cao tốc). Ngay cả "chết" cũng không phải là một giá trị boolean.

**Ngày hiệu lực chủ đạo của một luật là không đủ.** Engine phải theo dõi (a) hiệu lực trì hoãn theo từng khoản, (b) các sửa đổi về sau đối với chính điều về ngày hiệu lực, và (c) các luật sửa đổi mà chính các khoản của chúng có ngày hiệu lực tách riêng.

---

## 5. Sự biến động khiến một cơ sở dữ liệu quy tắc tĩnh trở nên sai

An toàn thực phẩm, 2026, đã xác minh — lập luận đơn lẻ tốt nhất chống lại một bảng quy tắc tĩnh *(đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?pageid=27160&docid=192829 · https://vanban.chinhphu.vn/?docid=216891&pageid=27160 · https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-09-2026-nd-cp-ve-tam-ngung-nghi-dinh-46-2026-nd-cp-ve-huong-dan-thi-hanh-luat-an-toan-thuc-pham-119260205135642533.htm · https://baochinhphu.vn/tiep-tuc-ap-dung-nghi-dinh-15-2018-nd-cp-ve-an-toan-thuc-pham-cho-den-khi-co-quy-dinh-moi-102260408123934123.htm)*:

1. **NĐ 15/2018/NĐ-CP** — khung pháp lý tồn tại lâu nay. Phụ lục I phân chia trách nhiệm giữa Bộ Y tế / Bộ Công Thương / Bộ NN.
2. **NĐ 46/2026/NĐ-CP (26/01/2026)** ban hành để thay thế nó, cộng với **NQ 66.13/2026/NQ-CP (27/01/2026)** về công bố/đăng ký sản phẩm.
3. **NQ 09/2026/NQ-CP (04/02/2026) ĐÌNH CHỈ cả hai** — chỉ hơn một tuần sau khi ban hành — ban đầu đến 15/4/2026.
4. Việc đình chỉ được **gia hạn** (báo cáo ngày 08/4/2026): nay đình chỉ **cho đến khi Luật An toàn thực phẩm sửa đổi và nghị định hướng dẫn của nó có hiệu lực**.
5. **NĐ 15/2018 do đó vẫn là quy tắc có hiệu lực thực thi hôm nay, 17/07/2026.**

Một nghị định có thể là luật-trên-giấy, bị thay thế, bị đình chỉ, và bị bỏ đình chỉ **trong vòng 10 tuần**. Một mô hình "biết" rằng NĐ 46/2026 đã thay thế NĐ 15/2018 là đang đọc bước 2 và dừng lại ở đó.

> **Mỗi quy tắc cần một ngày `as_of` và một trường trạng thái, không chỉ một trích dẫn.** Tối thiểu: `effective_from`, `effective_to`, `suspended_by`, `superseded_by`. Lưu ý rằng **đình chỉ là một trạng thái khác biệt với bãi bỏ** — một nghị định bị đình chỉ không chết, nó bị tạm dừng, và nó có thể quay lại. Một mô hình hai trạng thái (`active`/`repealed`) không thể biểu diễn NĐ 46/2026 chút nào.

Hai hệ luận từ cùng nghiên cứu:

- **Điều khoản chuyển tiếp không phải là một mốc cắt ngày sạch sẽ.** TT 28/2026/TT-BCT (an toàn thực phẩm, Bộ Công Thương, hiệu lực 17/7/2026): các hồ sơ nộp trước ngày hiệu lực theo quy tắc **cũ** *trừ khi thương nhân chọn áp dụng quy tắc mới*. Quy tắc áp dụng phụ thuộc vào ngày nộp **và một lựa chọn của thương nhân** — không phải chỉ vào ngày truy vấn.
- **Không phải mọi thứ đều dựa trên mã HS.** CITES dựa trên **loài**; phế liệu dựa trên HS **cộng với giấy phép môi trường ở cấp doanh nghiệp**; chế độ chất lượng sau Luật 78/2025 dựa trên **cấp độ rủi ro**. Một mô hình dữ liệu chỉ-có-HS về mặt cấu trúc là không đủ cho tầng phi thuế quan. *(đã xác minh 2026-07-17, nguồn: research 08 §3)*

---

## 6. ⭐ Văn bản hợp nhất (VBHN) trở nên chính thức viện dẫn được vào 01/7/2026

**Đây là thay đổi pháp lý hệ trọng nhất đối với kiến trúc của dự án này, và nó xảy ra tháng trước.**

**Pháp lệnh 01/2026/UBTVQH16** (UBTVQH, ban hành **10/6/2026**, hiệu lực **01/7/2026**) sửa đổi Pháp lệnh hợp nhất VBQPPL năm 2012. Đã đối chiếu với Công báo, không phải các blog của công ty luật. Văn bản mang tính quyết định:

> **"Văn bản hợp nhất được cơ quan, tổ chức, cá nhân sử dụng làm căn cứ chính thức trong viện dẫn và áp dụng pháp luật."**

Văn bản hợp nhất nay là **căn cứ chính thức để viện dẫn và áp dụng pháp luật**. *(đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm · https://xaydungchinhsach.chinhphu.vn/van-ban-hop-nhat-duoc-su-dung-lam-can-cu-chinh-thuc-trong-vien-dan-va-ap-dung-phap-luat-119260625165619689.htm)*

**Vì sao điều này quan trọng đến vậy:** trước đây hợp nhất chỉ là một *tiện ích không có thẩm quyền pháp lý độc lập* — bạn về mặt hình thức có nghĩa vụ viện dẫn văn bản gốc cộng với từng văn bản sửa đổi. Đó chính xác là phản bác pháp lý lẽ ra sẽ chặn một kiến trúc dựa trên hợp nhất. **Nó đã được gỡ bỏ trong tháng này.** Bất kỳ suy luận nào kế thừa từ các nguồn trước tháng 6/2026 (bao gồm cả dữ liệu huấn luyện của mô hình) đang tranh luận chống lại một quy tắc không còn tồn tại.

Cũng trong Pháp lệnh này:

- Phạm vi **mở rộng sang VBQPPL địa phương (cấp tỉnh/xã)** — trước đây chỉ có cơ quan trung ương.
- Đối tượng **mở rộng** sang bãi bỏ một phần / đình chỉ một phần / tiếp tục hiệu lực một phần.
- **Lần đầu tiên AI / chuyển đổi số được nêu tên chính thức** trong pháp luật Việt Nam về hợp nhất, với Bộ Tư pháp chủ trì.

Văn bản hợp nhất miễn phí được công bố tại **vbpl.vn**.

### Dùng VBHN đã công bố làm tầng văn bản. ĐỪNG tính toán hợp nhất.

Ba lý do, theo thứ tự sức thuyết phục:

1. **[Đã thiết lập]** Nó nay được viện dẫn về mặt pháp lý (như trên), nên các trích dẫn của bạn kế thừa thẩm quyền chính thức. Văn bản tự tính toán không có thẩm quyền nào để dựa vào.
2. **[Đã thiết lập]** **SAT-Graph — mô hình thời gian học thuật phát triển nhất hiện có — cũng từ chối tính toán nó.** Nó "giả định kho văn bản pháp luật đã chứa sẵn các phiên bản đã hoàn tất này"; các Action sửa đổi **giải thích** các chuyển tiếp thay vì **thực thi** chúng. Nếu cách tiếp cận cấu trúc dẫn đầu không chịu phân tích cú pháp "sửa đổi Khoản 2 Điều 5" thành một biến đổi văn bản, đó là tín hiệu mạnh về độ khó. *(đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2505.00039)*
3. Các chỉ dẫn sửa đổi của Việt Nam là **ngôn ngữ tự nhiên và không đều đặn**: *"bổ sung Điều 5a"*, *"bãi bỏ cụm từ X tại Khoản 2"*, *"thay thế cụm từ..."*. Một engine biến đổi văn bản là một mối nguy về tính đúng đắn với vô số ca biên (edge case).

### Nhưng riêng VBHN là không đủ — ba khoảng trống

- **Khoảng trống bao phủ.** Không phải văn bản nào cũng có hợp nhất hiện hành; việc công bố tụt hậu so với sửa đổi. (Ví dụ trực tiếp: NĐ 218/2026 sửa NĐ 158/2024 hiệu lực 10/08/2026 — sẽ không có văn bản hợp nhất tồn tại tại thời điểm nó bắt đầu cắn.)
- **Không có lịch sử thời gian.** Một VBHN là một *ảnh chụp (snapshot)*. "Cái gì áp dụng năm 2023?" cần versioning **bên trên** nó — mô hình CTV/khoảng-hiệu-lực từ §3.
- **Không có xuất xứ (provenance).** "Nghị định nào đã thay đổi Khoản này, và khi nào?" cần **graph sửa đổi** bất kể thế nào.

**Tổng hợp:** VBHN là tầng *văn bản*; một **graph** sửa đổi/tham chiếu tường minh là tầng *xuất xứ + thời gian*. *(thay đổi pháp lý là Đã thiết lập; việc tách kiến trúc này là một suy luận thiết kế từ research 02, không phải một kết quả đã công bố)*

Graph cần ít loại quan hệ. SBV-LawGraph — hệ thống duy nhất thực nghiệm giải quyết việc này trên pháp luật Việt Nam — dùng đúng bốn: **Amend/Supplement, Repeal, Replace, Guidance/Regulation** (loại cuối là thứ bậc Luật→Nghị định→Thông tư). *(đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)*

### Các VBHN đã biết cho mảng dọc này

Index những cái này làm văn bản chính ở bất kỳ nơi nào có một cái tồn tại. **Chỉ riêng văn bản gốc thì gây hiểu lầm chủ động trong ≥6 tiểu lĩnh vực.** *(đã xác minh 2026-07-17, nguồn: research 03; các nguồn riêng lẻ trong các bảng kho văn bản bên dưới)*

| VBHN | Hợp nhất | Ngày |
|---|---|---|
| **52/VBHN-VPQH** | Bộ luật Hàng hải | ~05/2026 |
| **56/VBHN-VPQH** | Luật GTĐTNĐ | 23/03/2026 |
| **96/VBHN-VPQH** | Luật Thuế XNK | 31/03/2026 |
| **49/VBHN-VPQH** | Luật Đường bộ | 03/2026 |
| **55/VBHN-VPQH** | Luật TTATGTĐB | 03/2026 |
| **46/VBHN-BTC** | NĐ 08/2015 (thủ tục hải quan) | — |
| **24/VBHN-BCT** | NĐ 69/2018 (quản lý ngoại thương) | 2026 |

Research 03 cũng liệt kê **08/VBHN-BGTVT** (NĐ 08/2021, đường thủy nội địa) — lưu ý hậu tố cũ `-BGTVT` trên một văn bản được hợp nhất sau khi bộ này đã ngừng tồn tại, bản thân điều đó là một trường hợp của vấn đề bí danh (aliasing) ở §1.

---

## 7. Kho văn bản logistics — kiểm kê theo tiểu lĩnh vực

Cô đọng từ research 03 (đã xác minh 2026-07-17 đối chiếu chinhphu.vn / vanban.chinhphu.vn, moc.gov.vn, caa.gov.vn, luatvietnam.vn). **Cảnh báo về phương pháp cần mang theo: các trang `/van-ban/` của thuvienphapluat.vn trả về HTTP 403 khi fetch tự động, nên các trạng thái đến từ các mirror và cổng thông tin chính phủ — và vanban.chinhphu.vn không hiển thị trường hiệu lực, nên "không có ghi chú chấm dứt" là bằng chứng yếu về việc còn hiệu lực.**

### ⚠️ Các đính chính chủ đạo cho dữ liệu huấn luyện lỗi thời

| Niềm tin mà một mô hình sẽ giữ | Thực tế đã xác minh |
|---|---|
| Luật Giao thông đường bộ 2008 điều chỉnh vận tải đường bộ | **CHẾT 01/01/2025** — tách thành 35/2024 + 36/2024 (§4) |
| **NĐ 10/2020** điều chỉnh kinh doanh vận tải đường bộ | **BÃI BỎ 01/01/2025** → **NĐ 158/2024** (18/12/2024, hiệu lực 01/01/2025), *bản thân đã bị sửa đổi* bởi **NĐ 218/2026** (19/06/2026, **hiệu lực 10/08/2026 — chưa có hiệu lực**) |
| Luật Đường sắt 2017 (06/2017/QH14) | **CHẾT 01/01/2026** → **Luật Đường sắt 2025 (95/2025/QH15)** |
| Luật HKDD 2006/2014 | **CHẾT 01/07/2026 — 17 ngày trước** → **Luật HKDD 2025 (130/2025/QH15)**. Khu vực biến động cao nhất trong kho văn bản hiện tại |
| Bộ GTVT ban hành các thông tư giao thông | **Bộ GTVT không còn tồn tại** (§1) |
| — | **Luật TMĐT 122/2025/QH15 là MỚI**, hiệu lực 01/07/2026 — luật thương mại điện tử độc lập đầu tiên; bao trùm "dịch vụ hỗ trợ TMĐT", vươn tới các nhà cung cấp logistics |

*(nguồn: https://vanban.chinhphu.vn/?pageid=27160&docid=212082 · https://vanban.chinhphu.vn/?classid=1&docid=218537&orggroupid=2&pageid=27160 · https://moc.gov.vn/pl/pages/ChiTietVanBan.aspx?vID=460&TypeVB=1 · https://vanban.chinhphu.vn/?pageid=27160&docid=216536&classid=1&orggroupid=1 · https://vanban.chinhphu.vn/?pageid=27160&docid=216503&classid=1&orggroupid=1)*

### 7.1 Dịch vụ logistics (khung)

- **36/2005/QH11 Luật Thương mại — Điều 233–240** (dịch vụ logistics: định nghĩa, quyền/nghĩa vụ, miễn trách, giới hạn trách nhiệm, quyền cầm giữ). Có hiệu lực từ 01/01/2006; sửa đổi bởi Luật QLNT 05/2017/QH14 và Luật PCTH rượu bia 44/2019/QH14 — **Điều 233–240 không bị đụng đến**.
- **163/2017/NĐ-CP** — kinh doanh dịch vụ logistics (17 loại dịch vụ; giới hạn trách nhiệm; điều kiện đầu tư nước ngoài). Còn hiệu lực (30/12/2017, hiệu lực 20/02/2018) và **chưa bao giờ bị sửa đổi trong 8,5 năm** — điều đáng chú ý trong kho văn bản này. Một bản thay thế toàn bộ **đã được cam kết công khai nhưng chưa ban hành** (danh sách 17 dịch vụ đã lỗi thời; không có logistics thương mại điện tử/xanh/tuần hoàn; thẩm quyền MOIT–MOC chưa rõ).
- **122/2025/QH15 Luật Thương mại điện tử** — thông qua 10/12/2025, hiệu lực **01/07/2026**. Chuyển tiếp: các đăng ký trước 01/07/2026 có giá trị đến 30/06/2027.

### 7.2 Vận tải đa phương thức — tiểu lĩnh vực bị bỏ bê nhất

- **87/2009/NĐ-CP** — còn hiệu lực nhưng **bị moi ruột một phần**: **Chương 3 bãi bỏ** bởi NĐ 144/2018.
- **89/2011/NĐ-CP** — **HẾT HIỆU LỰC**, bãi bỏ toàn bộ bởi NĐ 144/2018.
- **144/2018/NĐ-CP** (16/10/2018, hiệu lực cùng ngày) — còn hiệu lực, chưa bị thay thế.

Văn bản điều chỉnh đã 17 năm tuổi mà không có cập nhật trong 8 năm. **Đọc qua VBHN (87/2009 + 144/2018), không phải nghị định gốc** — nghị định gốc vẫn chứa một Chương 3 đã bị bãi bỏ.

### 7.3 Hàng hải

- **95/2015/QH13 Bộ luật Hàng hải** (hiệu lực 01/07/2017), sửa đổi bởi **35/2018/QH14**, **Luật Giá 16/2023/QH15**, **81/2025/QH15**, **Luật Quy hoạch 112/2025/QH15** (hiệu lực 01/03/2026). → **dùng 52/VBHN-VPQH**.
- **58/2017/NĐ-CP** — quản lý hoạt động hàng hải (cảng biển, luồng, thủ tục tàu vào/rời cảng). Còn hiệu lực, đã sửa đổi.
- **34/2025/NĐ-CP** (25/02/2025, hiệu lực 10/04/2025) — sửa các NĐ lĩnh vực hàng hải. Thay đổi then chốt: các luồng hàng hải công cộng nay do **VIMAWA** quản lý trực tiếp, không phải bởi các doanh nghiệp bảo đảm an toàn hàng hải.
- **160/2016/NĐ-CP** — điều kiện KD vận tải biển, đại lý tàu biển, lai dắt. Sửa đổi bởi **147/2018** (bãi bỏ "Giấy chứng nhận đủ điều kiện KD vận tải biển") và **69/2022**.
- **38/2017/NĐ-CP** — cảng cạn / **ICD** (hiệu lực 01/07/2017). Điều 18 = chuyển đổi ICD→cảng cạn.

### 7.4 Đường bộ

- **35/2024/QH15** + **36/2024/QH15** — xem §4. VBHN: 49 và 55/VBHN-VPQH.
- **165/2024/NĐ-CP** (26/12/2024, hiệu lực 01/01/2025) — chi tiết Luật Đường bộ + Điều 77 Luật TTATGTĐB: quy hoạch, phân loại đường, hành lang ATĐB, đất dành cho đường bộ, tổ chức giao thông, thẩm tra ATGT.
- **168/2024/NĐ-CP** (26/12/2024, hiệu lực 01/01/2025; một số quy định hiệu lực 01/01/2026) — xử phạt VPHC về TTATGT đường bộ; **trừ điểm/phục hồi điểm GPLX**. Thay thế NĐ 100/2019; mức phạt tăng mạnh — một khoản chi phí tuân thủ đáng kể cho các đội xe.
- **158/2024/NĐ-CP** (hiệu lực 01/01/2025) — hoạt động vận tải đường bộ; thay thế NĐ 10/2020 toàn bộ. Bao trùm ô tô + xe bốn bánh có gắn động cơ + vận tải quốc tế theo điều ước.
- **218/2026/NĐ-CP** (19/06/2026, **hiệu lực 10/08/2026 — CHƯA CÓ HIỆU LỰC**) — sửa NĐ 158/2024. Siết xe hợp đồng (không xác nhận từng ghế cho từng khách, không bán vé, không thu tiền như tuyến cố định); niên hạn xe hợp đồng; chính sách trợ giá xe buýt. **Từ 01/01/2028**: đơn vị vận tải hợp đồng phải chia sẻ dữ liệu hợp đồng với Bộ Công an / Cục CSGT trước chuyến đi. **Phải được cổng theo ngày (date-gate), không phục vụ như luật hiện hành hôm nay.**

### 7.5 Đường thủy nội địa

- **23/2004/QH11** (hiệu lực 01/01/2005) + **48/2014/QH13**, sửa đổi thêm bởi Luật Phí & lệ phí 2015, **35/2018/QH14**, Luật PCTH rượu bia 2019, **Luật Quy hoạch 112/2025/QH15** (hiệu lực 01/03/2026) → **dùng 56/VBHN-VPQH (23/03/2026)**.
- **08/2021/NĐ-CP** (28/01/2021) — quản lý hoạt động ĐTNĐ; sửa đổi bởi **54/2022** (hiệu lực 01/11/2022) và **06/2024** (hiệu lực 10/03/2024).
- **78/2016/NĐ-CP** — điều kiện KD đào tạo thuyền viên; sửa đổi bởi 54/2022.

### 7.6 Đường sắt

- **06/2017/QH14 — HẾT HIỆU LỰC 01/01/2026.**
- **95/2025/QH15 Luật Đường sắt 2025** — thông qua 27/06/2025 (Lệnh 36/2025/L-CTN, 30/06/2025), có hiệu lực **01/01/2026**, một số quy định sớm hơn **01/07/2025**. Bổ sung các cơ chế đặc thù cho đầu tư hạ tầng đường sắt được xã hội hóa; ưu đãi thuế/đất/tín dụng.
- **16/2026/NĐ-CP** (14/01/2026) — chi tiết Luật Đường sắt.

### 7.7 Hàng không dân dụng 🔴 biến động cao nhất

- **66/2006/QH11 + 61/2014/QH13 — HẾT HIỆU LỰC 01/07/2026.**
- **130/2025/QH15 Luật HKDD 2025** — thông qua 10/12/2025, 11 chương / 107 điều, có hiệu lực **01/07/2026**. Bao trùm tàu bay, cảng hàng không, nhân viên HK, hoạt động bay, **vận tải hàng không thương mại**, hàng không chung, an toàn/an ninh HK, trách nhiệm dân sự. Củng cố vai trò của Bộ Công an trong an ninh hàng không.
- **133/QĐ-TTg** (19/01/2026) — kế hoạch triển khai.
- Các nghị định hướng dẫn: **xem F1 bên dưới. Đây là khoảng trống rủi ro cao nhất trong danh mục kiểm kê.**

### 7.8 Hải quan

- **54/2014/QH13 Luật Hải quan** (hiệu lực 01/01/2015), sửa đổi bởi **71/2014/QH13** và **90/2025/QH15**.
- **90/2025/QH15** — Luật sửa đổi 8 luật (Đấu thầu, PPP, **Hải quan**, Thuế GTGT, **Thuế XNK**, Đầu tư, Đầu tư công, QL tài sản công); thông qua 25/06/2025, hiệu lực **01/07/2025**. Với hải quan: **sửa Điều 42, 43** (chế độ ưu tiên / AEO — thời gian tuân thủ **3 năm → 2 năm**; yêu cầu một hệ thống CNTT có khả năng kết nối và chia sẻ dữ liệu với hải quan) và **bổ sung Điều 47a — luật hóa xuất nhập khẩu tại chỗ**. Quan trọng đối với các luồng logistics/EPE.
- **08/2015/NĐ-CP** — thủ tục HQ, kiểm tra, giám sát, kiểm soát HQ. Bị sửa đổi nhiều (**59/2018**, **167/2025**) → **dùng 46/VBHN-BTC**.
- **167/2025/NĐ-CP** (hiệu lực **15/08/2025**) — sửa NĐ 08/2015, triển khai Luật 90/2025. Bổ sung **Điều 22a — trị giá hải quan cho mục đích thống kê**; làm lại trị giá hải quan; tái tổ chức mô hình tổ chức hải quan. Hướng dẫn triển khai: **CV 21067/CHQ-GSQL**.
- **38/2015/TT-BTC** — lõi vận hành (thủ tục HQ; kiểm tra, giám sát; thuế XNK; quản lý thuế hàng XNK). Sửa đổi bởi **39/2018/TT-BTC** và **121/2025/TT-BTC** (18/12/2025, hiệu lực **01/02/2026**) — được mô tả là bản cập nhật thủ tục hải quan lớn nhất trong nhiều năm: chuẩn hóa hồ sơ, cắt giảm chứng từ, đẩy trao đổi dữ liệu qua VNSW. **Mọi logic thành phần hồ sơ phải nhắm tới TT 121, không phải TT 38/39 như đã biết trước đây.**
- **39/2015/TT-BTC** (+ TT 60/2019) — trị giá hải quan.
- **31/2022/TT-BTC** — Danh mục hàng hóa XNK Việt Nam (**HS code**).
- **85/2019/NĐ-CP** — cơ chế một cửa quốc gia / ASEAN + kiểm tra chuyên ngành. Xương sống hải quan điện tử; gắn kiểm tra chuyên ngành với một cửa.
- **68/2016/NĐ-CP** + **67/2020/NĐ-CP** — điều kiện KD hàng miễn thuế, **kho bãi, địa điểm làm thủ tục hải quan**, kho ngoại quan, CFS. ← móc pháp lý cho "kho bãi".
- **31/2018/NĐ-CP** — xuất xứ hàng hóa / **C/O**.

### 7.9 Thuế xuất nhập khẩu

- **107/2016/QH13 Luật Thuế XNK** (hiệu lực 01/09/2016), sửa đổi bởi **90/2025/QH15** và **133/2025/QH15** → **dùng 96/VBHN-VPQH (31/03/2026)**.
- **134/2016/NĐ-CP** — miễn thuế, hoàn thuế, SXXK, GC. Sửa đổi bởi **18/2021** và **182/2025** (hiệu lực 01/07/2025 — sửa Điều 24; **bãi bỏ Điều 19**).
- **26/2023/NĐ-CP** — Biểu thuế XK, Biểu thuế NK ưu đãi, danh mục & mức thuế tuyệt đối, **cộng một họ ~15–20 nghị định biểu thuế riêng theo từng FTA, mỗi FTA một nghị định** (CPTPP, EVFTA, RCEP, UKVFTA, ATIGA, ACFTA…).
- **48/2024/QH15 Luật Thuế GTGT 2024** (hiệu lực 01/07/2025) — VAT nhập khẩu; 0% cho dịch vụ xuất khẩu, tác động trực tiếp đến giao nhận vận tải quốc tế.
- **108/2025/QH15 Luật Quản lý thuế** (ban hành 10/12/2025, hiệu lực **01/07/2026**) — **thay thế Luật QLT 38/2019/QH14**. Điều chỉnh quản lý thuế hải quan, ấn định thuế, kiểm tra sau thông quan. **Có hiệu lực 17 ngày.**

### 7.10 Quản lý ngoại thương

- **05/2017/QH14 Luật Quản lý ngoại thương** (hiệu lực 01/01/2018).
- **69/2018/NĐ-CP** (15/05/2018) — danh mục cấm/hạn chế XNK, giấy phép, **tạm nhập tái xuất, quá cảnh, chuyển khẩu**, gia công. Còn hiệu lực, được chứng minh bằng **24/VBHN-BCT (2026)** hợp nhất nó. Thông tư hướng dẫn: **TT 12/2018/TT-BCT** — Phụ lục I (hàng tiêu dùng đã qua sử dụng / thiết bị y tế / phương tiện bị cấm nhập, theo HS; **thay thế bởi TT 08/2023/TT-BCT**), Phụ lục II (hàng tạm ngừng TNTX/chuyển khẩu).
- **10/2018/NĐ-CP** — phòng vệ thương mại.

### 7.11 Kho bãi / cảng / ICD — không có đạo luật độc lập

**Không có "Luật Kho bãi."** Phạm vi bao phủ được ráp lại:

| Cơ sở | Móc pháp lý |
|---|---|
| Cảng biển | BLHH 2015 Chương IV + NĐ 58/2017 + NĐ 34/2025 |
| Cảng cạn / ICD | NĐ 38/2017 (+ QĐ 979/QĐ-TTg quy hoạch cảng cạn) |
| **Kho ngoại quan / CFS / địa điểm làm thủ tục HQ** | **NĐ 68/2016 + NĐ 67/2020** |
| Cảng thủy nội địa / bến thủy | NĐ 08/2021 + 54/2022 + 06/2024 |
| Cảng hàng không | Luật HKDD 130/2025 + nghị định cảng hàng không đang chờ của nó (xem F1) |
| Kho hàng hóa thông thường | Luật Đất đai 2024, Luật Xây dựng 2014/2020, Luật PCCC&CNCH 2024 (hiệu lực 01/07/2025), Luật BVMT 2020 — **chung chung, không đặc thù logistics** |

---

## 8. Định cỡ kho văn bản

*(đã xác minh 2026-07-17, nguồn: research 03 — đây là các ước tính của nghiên cứu, và thành phần Thông tư được nêu rõ là chưa xác minh; xem F7)*

| Mục tiêu | Kích cỡ |
|---|---|
| **Tập làm việc lõi** (những gì một người hành nghề thực sự phải biết) | **~55–70 văn bản** — khoảng 15 luật/bộ luật, 20–25 nghị định, 20–30 thông tư |
| **Bao phủ RAG hợp lý** của mảng dọc | **≈190–230 văn bản** (~18 luật, ~55 nghị định, ~120–140 thông tư) |
| **Toàn diện** bao gồm QCVN, quyết định, biểu thuế FTA, công văn hướng dẫn, VBHN | **≈420–550 văn bản** |

Hiệu chỉnh hữu ích: tập làm việc lõi nhỏ đủ để **việc con người biên soạn thủ công ~60 văn bản là khả thi và có lẽ đúng cho v1**, và tập toàn diện nhỏ đủ để kho văn bản không bao giờ là bài toán quy mô. Vấn đề là tính đúng đắn theo thời gian, không phải khối lượng.

---

## Chưa xác minh / Không được dựa vào

Tái tạo từ các cờ F1–F10 của research 03 và danh sách chưa xác minh của research 08. **Đừng "tẩy trắng" bất kỳ mục nào trong số này thành một khẳng định tự tin.**

### Từ research 03 (kiểm kê kho văn bản logistics)

| # | Mục | Vấn đề |
|---|---|---|
| **F1** 🔴 | **Các nghị định hướng dẫn Hàng không — RỦI RO CAO NHẤT** | Luật HKDD 130/2025 có hiệu lực **17 ngày trước**. Năm nghị định (nhà chức trách HK & quản lý an toàn; tàu bay & khai thác tàu bay; hoạt động bay; **cảng hàng không, bãi cất hạ cánh**; **vận tải hàng không**) dự kiến trình Chính phủ **04/2026** — **không xác nhận được việc ban hành đối với bất kỳ cái nào.** Nghị định liên quan đến hàng hóa hàng không nằm trong lô này. **NĐ 215/2026 (an ninh hàng không, hiệu lực 01/07/2026)** dựa trên **một mẩu thông tin thứ cấp duy nhất**, chưa được xác nhận độc lập. **Các quy tắc về hàng hóa hàng không hiện có thể đang nằm trong một khoảng trống chuyển tiếp.** |
| **F2** | **Bản thay thế NĐ 69/2018 (ngoại thương)** | Dự thảo công khai 09/2025 (chỉ đạo của Phó Thủ tướng CV 6906/VPCP-KTTH, 24/07/2025; Bộ Tư pháp thẩm định 28/11/2025), dự kiến trình Chính phủ 11/2025, với mốc tự do hóa **01/07/2026** cho tạm nhập tái xuất thực phẩm đông lạnh / hàng đã qua sử dụng / hàng chịu TTĐB. **Không tìm thấy số hiệu nghị định; chưa xác nhận ban hành.** Sự tồn tại của 24/VBHN-BCT (2026) ngụ ý 69/2018 vẫn còn sống — nhưng một bản thay thế nửa đầu 2026 có thể đã bị bỏ sót. **Xác minh trực tiếp.** |
| **F3** | **Trạng thái NĐ 163/2017** | Xác nhận còn hiệu lực qua vanban.chinhphu.vn, nhưng **cổng thông tin đó không hiển thị trường hiệu lực** — sự vắng mặt của ghi chú chấm dứt là bằng chứng yếu. thuvienphapluat.vn (có hiển thị trạng thái) **trả 403 khi fetch tự động**. Nghị định thay thế được xác nhận là *dự định*, không phải *đã ban hành*. **Tin cậy trung bình.** |
| **F4** | **NĐ 87/2009 / 144/2018 (VTĐPT)** | "Vẫn còn hiệu lực, chưa bị thay thế" đến từ **bình luận thứ cấp**, không phải trang trạng thái. **Tin cậy trung bình.** |
| **F5** | **NĐ 38/2017 (cảng cạn / ICD)** | Không có xác nhận trực tiếp về trạng thái sửa đổi. **QĐ 428/QĐ-BXD (31/03/2026)** xuất hiện trong không gian này và VIMAWA công khai xây dựng chính sách cảng cạn mới — **quan hệ với NĐ 38/2017 chưa xác minh.** |
| **F6** | **NĐ 160/2016 sau 2025** | Các sửa đổi bởi 147/2018 + 69/2022 đã xác nhận. **Không xác minh được** liệu **NĐ 34/2025** ("sửa đổi các NĐ trong lĩnh vực hàng hải" — số nhiều) có cũng đụng đến 160/2016 hay không. Nhiều khả năng, nhưng chưa xác nhận. |
| **F7** ⚠️ | **Tầng Thông tư chưa bao giờ được liệt kê đầy đủ — khối chưa xác minh lớn nhất đơn lẻ** | Mọi con số thông tư ở §8 đều là **ước tính, không phải danh sách đã xác minh**. Việc hợp nhất Bộ GTVT→Bộ Xây dựng (01/03/2025) nghĩa là **một số lượng không rõ các thông tư `TT-BGTVT` đã được tái ban hành hoặc sửa đổi thành `TT-BXD`** — và tầng Thông tư chính xác là nơi chi tiết vận hành HS↔yêu cầu nằm ở đó. |
| **F8** | **NĐ 218/2026** | Xác nhận qua luatvietnam + vanban.chinhphu.vn (docid=218537). **Hiệu lực 10/08/2026 — chưa có hiệu lực.** Bất kỳ hệ thống nào **phải cổng theo ngày (date-gate) nó**, không phục vụ như luật hiện hành hôm nay. |
| **F9** | **Bộ luật Hàng hải (sửa đổi)** | Bảng so sánh của Bộ Xây dựng ngày **27/04/2026** xác nhận đang tái soạn thảo tích cực. **Thời gian và phạm vi chưa rõ.** |
| **F10** | **Luật Thương mại (sửa đổi)** | Gói của MOIT (cùng với Cạnh tranh / QLNT / BVQLNTD) xác nhận đang soạn thảo; **chưa xác nhận thông qua.** **Điều 233–240 (dịch vụ logistics) có thể bị dịch chuyển.** |

### Từ research 08 (quản lý chuyên ngành)

- **TT 15/2026/TT-BCT, TT 26/2026/TT-BCT, VBHN 47/VBHN-BCT** — trích xuất đơn lẻ, tin cậy thấp.
- **NĐ 169/2026/NĐ-CP** (xử phạt hải quan, hiệu lực 01/07/2026, thay thế NĐ 128/2020) và **NĐ 153/2026/NĐ-CP** (địa bàn hoạt động hải quan, hiệu lực 05/07/2026) — nguồn tóm tắt tìm kiếm đơn lẻ; **số hiệu đáng ngờ**. Xác nhận trước khi viện dẫn.
- **VBHN 67/VBHN-BNNMT** (kiểm dịch động vật trên cạn) — nguồn đơn lẻ.
- **"Danh mục hàng hóa nhóm 2 bị xóa bỏ từ 2026"** theo **Luật 78/2025/QH15** (sửa Luật Chất lượng sản phẩm hàng hóa, hiệu lực 01/01/2026) — **gây tranh cãi, chịu lực cho bất kỳ engine quy tắc nào, và dựa trên một nguồn thương mại duy nhất**. Cái *được* xác nhận về Luật 78/2025: nó bãi bỏ Điều 7; khoản 4 Điều 13; khoản 2,3 Điều 17; Điều 19, 20, 24, 25, 26, 27, 29, 30, 31, 35, 36, 37, 55, và giới thiệu **phân loại theo rủi ro (thấp/trung bình/cao)**. Việc công bố hợp quy bị *tái cấu trúc* hay *bãi bỏ* thì **chưa ngã ngũ**.
- Liệu có **thông tư nào của BNNMT thay thế TT 01/2024/TT-BNNPTNT** (bảng HS chủ) — chưa xác nhận; coi 01/2024 là hiện hành nhưng cần xác minh lại.

### Từ research 05 (giao thông đường bộ)

- **Tác động của Luật Quy hoạch 112/2025/QH15 lên Luật Đường bộ bị chính các nguồn tranh cãi.** Căn cứ của chính Luật 118/2025 (được trích trong cả hai VBHN) viện dẫn *"Luật Đường bộ số 35/2024/QH15 đã được sửa đổi, bổ sung theo Luật số 112/2025/QH15"* — nhưng phần đầu của **49/VBHN-VPQH** (ký 03/2026) chỉ liệt kê **duy nhất** Luật 118/2025 là luật sửa đổi và **không nhắc đến 112/2025**. Hãy coi Luật Đường bộ được sửa đổi bởi cả hai, nhưng **các điều chính xác bị 112/2025 đụng đến thì không xác nhận được** và cần kiểm tra đối chiếu toàn văn (https://congbao.chinhphu.vn/van-ban/luat-so-112-2025-qh15-468674.htm). *Bản thân đây là một minh họa tốt: hai văn bản hợp nhất chính thức bất đồng về chuỗi sửa đổi.*
- **Chưa xác minh:** chế độ xử phạt theo NĐ 168/2024 và các sửa đổi của nó; các báo cáo báo chí về mức phạt 800.000–1.000.000 đ từ 01/07–14/08/2026 rồi cảnh cáo từ 15/08/2026 cho quy tắc thiết bị an toàn trẻ em.

---

## Điều này có ý nghĩa gì cho mô hình dữ liệu

Một danh mục kiểm tra rút ra từ những điều trên, không phải một sự trình bày lại:

1. **Các bộ là thực thể có bí danh và khoảng hiệu lực**, không bao giờ là chuỗi tên (§1).
2. **Hiệu lực là một khoảng thời gian theo từng điều khoản, không phải một cờ theo từng văn bản** (§3, §4). Đơn vị versioning theo thời gian là Điều/Khoản, không phải văn bản.
3. **Các điều về ngày hiệu lực là văn bản có thể bị sửa đổi** — hãy mô hình hóa chúng như nội dung, và kỳ vọng chuỗi sửa đổi vươn tới chúng (§4, bẫy 2).
4. **Trạng thái ≠ {active, repealed}.** Bạn cần tối thiểu: `effective_from`, `effective_to`, `suspended_by`, `superseded_by`, `partially_repealed_by`, cộng với `chưa có hiệu lực` như một trạng thái hạng nhất (§3, §5).
5. **Hiệu lực thời gian là một bộ lọc cứng, không phải tín hiệu xếp hạng** — đã đo, không phải giả định (§3).
6. **VBHN là tầng văn bản; graph sửa đổi là tầng xuất xứ + thời gian. Đừng bao giờ tính toán hợp nhất** (§6).
7. **Mọi thứ mang theo một `as_of`.** Câu chuyện an toàn thực phẩm (§5) mất 10 tuần để đi từ ban hành → đình chỉ → gia hạn. Một trích dẫn không có ngày không phải là một câu trả lời.
8. **Không phải mọi thứ đều dựa trên HS** — loài (CITES), giấy phép cấp doanh nghiệp (phế liệu), cấp độ rủi ro (Luật 78/2025) (§5).

---

## Kiến thức liên quan

- [Bối cảnh dự án](../project-context.md) — Customs Assistant là gì, các ranh giới v1 của nó, và vì sao v1 giữ AI ra khỏi các con số thuế quan.
- [Quy tắc nghiệp vụ](../business-rules.md) — chính sách bền vững và các quy tắc tuân thủ; kỷ luật `as_of` + trạng thái ở §5 thuộc về đây khi các quy tắc được ghi lại.
- [Chỉ mục bộ nhớ tác nhân](../index.md) — bản đồ điều hướng cho bộ nhớ bền vững, bao gồm các ghi chú `concepts/` cùng cấp.
- [Quy tắc tác nhân](../AGENTS.md) — quy ước kho mã mà ghi chú này tuân theo (tài liệu tiếng Anh, Markdown thuần, liên kết tương đối).
- [Chỉ mục quyết định kiến trúc](../architecture-decisions/README.md) — ghi nhận lựa chọn VBHN-làm-tầng-văn-bản và bộ-lọc-thời-gian-cứng (§3, §6) dưới dạng ADR khi chúng được đưa ra.
