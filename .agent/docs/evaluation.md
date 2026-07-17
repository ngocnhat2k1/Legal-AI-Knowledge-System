---
type: doc
status: active
updated: 2026-07-17
related:
  - ../concepts/hs-classification.md
  - ../concepts/tariff-system.md
  - ../concepts/legal-rag-retrieval.md
  - ../concepts/data-sources.md
  - ../concepts/vietnamese-legal-documents.md
  - ../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md
  - ../architecture-decisions/2026-07-17-hs-candidates-not-answers.md
  - ../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md
  - ../business-rules.md
---

# Hợp đồng đánh giá

Ghi chú này định nghĩa cách Customs Assistant chứng minh nó hoạt động. Đây là một hợp đồng, không phải một gợi ý: các cổng kiểm soát bên dưới là điều kiện ship/không-ship.

Toàn bộ tài liệu này tồn tại vì một đặc tính của lĩnh vực này, đã được thiết lập bởi benchmark độc lập: **lỗi ở đây là lỗi âm thầm.** Một mã HS sai là một mã thật, định dạng đúng, trông hợp pháp. Một mức thuế sai là một mức thật lấy từ một phụ lục thật của một nghị định thật. Cả hai đều không ném ra exception, không làm hỏng kiểm tra schema, và không trông có vẻ sai với người rà soát. Không có tín hiệu cú pháp nào của thất bại, vì vậy **bạn không thể nhìn bằng mắt mà biết đúng hay sai** — bạn chỉ có thể đo nó dựa trên các câu trả lời đã biết là đúng mà bạn ghi lại trước.

---

## 1. Golden set phải có trước, trước bất kỳ đoạn code truy xuất nào

**Quy tắc: không viết bất kỳ đoạn code truy xuất, xếp hạng hay sinh câu trả lời nào cho đến khi có một golden set gồm 30-50 câu hỏi, lấy từ chính các tờ khai trong quá khứ của chủ sở hữu, mỗi câu kèm một đáp án đã biết là đúng.**

### Vì sao thứ tự này là bất khả thương lượng

RAG pháp lý mà không có tập đánh giá là dựa vào niềm tin. Mọi nút vặn trong hệ thống — đơn vị chunk, trọng số BM25/dense, top-k, mô hình rerank, prompt — đều thay đổi câu trả lời, và không nút nào tự báo cho bạn biết thay đổi đó là cải thiện hay không. Không có golden set thì bạn không phải đang tinh chỉnh, bạn đang lang thang. Tệ hơn, bạn sẽ cảm thấy làm việc năng suất suốt cả quãng đó, vì đầu ra luôn trông có vẻ hợp lý.

Hai phát hiện đã được đo lường biến điều này thành cụ thể chứ không phải triết lý:

1. **Lỗi HS là "Sai nhưng Hợp lệ."** Trên HSCodeComp (632 sản phẩm thương mại điện tử thật được chuyên gia chú thích, 27 chương HS, mục tiêu 10 chữ số, chú thích kép), lỗi phần lớn là các trường hợp mô hình xuất ra một mã HS *thật, trông hợp pháp* nhưng sai. Không có lỗi phân tích cú pháp, không có cờ đỏ, không có dấu hiệu độ tin cậy thấp tương quan với kết quả pháp lý. Nó chảy vào VNACCS, được chấp nhận, và nhiều năm sau nổi lên như một cuộc kiểm tra sau thông quan. (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631)

2. **Bộ phân tích thuế ngây thơ báo cáo thành công 94% trong khi sai một cách tự tin.** Xem §3 — đây là cùng một dạng thất bại ở nửa mang tính tất định của sản phẩm, nơi người ta cho rằng nó không thể xảy ra.

Một golden set xây từ chính các tờ khai của chủ sở hữu có một đặc tính mà không benchmark công khai nào có: các đáp án đã được Hải quan chấp nhận cho hàng hóa thực tế của công ty này. Đó là mục tiêu mà sản phẩm đang tối ưu về mặt thương mại.

### Cấu thành

- **30-50 câu hỏi.** Đủ nhỏ để chủ sở hữu thực sự có thể tạo ra; đủ lớn để thấy được chênh lệch độ chính xác 10 điểm.
- **Từ các tờ khai thật trong quá khứ**, không phải câu bịa ra. Câu hỏi bịa ra thì kiểm tra câu hỏi, không kiểm tra công cụ.
- **Mỗi câu mang một đáp án đã biết là đúng** cùng bằng chứng khiến nó đúng (phụ lục, nghị định, chú giải chương, phán quyết).
- **Có trọng số nghiêng về cơ cấu hàng hóa thực của công ty**, không nghiêng về các ca biên thú vị. Các ca biên đưa vào một tập stress riêng.
- **Được ghi lại trước khi có code.** Một golden set lắp ráp sau khi đã xem đầu ra của hệ thống là một bản ghi các ý kiến của chính hệ thống.

### Giới hạn trung thực về "đã biết là đúng"

Dữ liệu chuẩn (ground truth) trong lĩnh vực này bản thân nó cũng có thể bị tranh cãi. Một cuộc kiểm toán 226 bất đồng trong một nghiên cứu HS phát hiện **~42,5% các dự đoán "sai" của mô hình thực ra được các quy tắc HS ủng hộ tốt hơn so với ground truth đã công bố** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2605.14857). Hai chuyên gia xây dựng HSCodeComp bất đồng đủ nhiều đến mức cần một chuyên gia cấp cao phân xử (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631).

Điều này không làm suy yếu golden set — nó làm rõ golden set đo cái gì. **Sự khớp với những gì hải quan đã chấp nhận là mục tiêu đúng về mặt thương mại, và nó không giống với việc thực sự đúng.** Hãy ghi lại sự phân biệt đó thay vì cố giải quyết nó.

---

## 2. Đánh giá truy xuất tách biệt với sinh câu trả lời

**Quy tắc: truy xuất và sinh câu trả lời có điểm số riêng biệt. Không bao giờ dùng một con số end-to-end duy nhất.**

Một con số end-to-end duy nhất không thể cho bạn biết hệ thống thất bại vì đúng Điều không bao giờ được truy xuất (một sửa chữa ở khâu truy xuất) hay vì mô hình bỏ qua một Điều đã được truy xuất đúng (một sửa chữa ở khâu sinh). Hai cái này có phương thuốc trái ngược nhau, và một điểm số pha trộn sẽ đẩy bạn đến sai chỗ.

LegalBench-RAG (6.858 cặp QA / 79M ký tự) là kỷ luật cần sao chép: nó chấm điểm **chính xác file cộng với chỉ số ký tự**, buộc phải có precision theo khoảng tối thiểu thay vì "đúng tài liệu xuất hiện đâu đó trong top 10." Đó là chuẩn mà trích dẫn pháp lý thực sự đòi hỏi. (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2408.10343v1)

Lưu ý cần mang theo một cách trung thực: kho ngữ liệu của LegalBench-RAG là hợp đồng/chính sách bảo mật (CUAD/MAUD/ContractNLI/PrivacyQA), **không phải văn bản luật**. Phương pháp luận của nó chuyển giao được; các phát hiện của nó thì có thể không.

---

## 3. Cổng Giai đoạn 1 — tra cứu thuế

Giai đoạn 1 mang tính tất định: tra cứu thuế chính xác theo khóa HS + biểu thuế + ngày. Không có AI chạm vào các con số. Điều đó không làm nó an toàn — nó làm nó sai âm thầm thay vì sai ầm ĩ.

### Cổng 3.1 — Đối chiếu thủ công. Một dòng sai = dừng.

**Lấy mẫu ngẫu nhiên 20 mã HS từ cơ sở dữ liệu và đối chiếu từng mã bằng tay dựa trên ECUS và/hoặc customs.gov.vn. Nếu chỉ một dòng không khớp, giai đoạn không được ship.**

Không phải 19 trên 20. Một dòng sai nghĩa là bộ phân tích có một khiếm khuyết hệ thống, và một khiếm khuyết hệ thống trong một bảng 11.874 dòng không phải là 1 dòng xấu — nó là một số lượng chưa biết các dòng xấu mà bạn tình cờ lấy trúng một trong số đó. Tỷ lệ đạt 95% ở đây không phải là "tốt"; nó là một báo cáo bom chưa nổ.

Kỷ luật cỡ mẫu: 20 dòng kiểm bằng tay là mức mà một con người sẽ thực sự làm cẩn thận. Lấy mẫu 200 và kiểm chúng cẩu thả còn tệ hơn lấy mẫu 20 và kiểm chúng đúng cách, vì nó chế tạo ra sự tự tin.

Thang đối chiếu để có bối cảnh: phụ lục nhập khẩu MFN (Phụ lục II của NĐ 26/2023) chứa **11.874 mã HS 8 chữ số duy nhất**, trong đó 11.160 (94,0%) có mức thuế; phụ lục xuất khẩu (Phụ lục I) chứa 1.520 (đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm, trích xuất từ 14 phần `.doc` công báo).

### Cổng 3.2 — Bài kiểm tra hồi quy CẠM BẪY PHỤ LỤC

**Đây là bài kiểm tra quan trọng nhất trong toàn bộ repository.** Nó phải tồn tại trước khi phục vụ bất kỳ dữ liệu thuế nào, và nó không bao giờ được xóa.

**Khẳng định bắt buộc:**

```
assert lookup(hs="0301.11.10", schedule="NK_uu_dai", direction="import", date=<in-force date>) == 15
assert lookup(hs="0301.11.10", schedule="NK_uu_dai", direction="import", date=<in-force date>) != 0
```

- `0301.11.10` trong **Phụ lục II (Biểu thuế nhập khẩu ưu đãi / MFN import)** = **15**
- `0301.11.10` trong **Phụ lục I (Biểu thuế xuất khẩu / export)** = **0**

(đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm — phân tích có nhận biết phụ lục trên các phần Word công báo)

**Và bất biến tổng quát, thứ còn quan trọng hơn ca đơn lẻ:**

```
# No import query may EVER return a Phụ lục I rate.
for every import query:
    assert result.source_annex != "Phụ lục I"
```

**Vì sao bài kiểm tra này tồn tại — câu chuyện chính là lý do biện minh.** Lần phân tích ngây thơ đầu tiên của Research 12 với NĐ 26/2023 báo cáo **thành công 94%**. Nó sai một cách tự tin. Nó trả về `0301.11.10 → ['0', '15']` vì nó bỏ qua ranh giới phụ lục và vơ vét cả mức thuế xuất khẩu lẫn mức thuế nhập khẩu. **1.520 mã HS xuất hiện ở cả hai phụ lục; 1.329 trong số đó có mức thuế khác nhau.** Một bộ phân tích bỏ qua ranh giới phụ lục sẽ trả về thuế **xuất khẩu** cho một câu hỏi **nhập khẩu** — âm thầm, không lỗi, với vẻ thành công 94%. (đã xác minh 2026-07-17, nguồn: research/12.md xác minh đối kháng, tái lập từ https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm)

Đó là dạng thất bại của cả loại dự án này: **không phải thiếu dữ liệu, mà là dữ liệu sai trông có vẻ hợp lý — và nó thất bại trong khi báo cáo thành công.** Một bộ test khẳng định "94% dòng đã phân tích" sẽ đạt. Một bộ test khẳng định "truy vấn nhập khẩu không bao giờ trả về Phụ lục I" sẽ bắt được nó.

Mở rộng cùng bất biến đó ra các trạng thái cấu trúc khác mà các phụ lục mã hóa, vì mỗi trạng thái là một cỗ máy sinh câu trả lời sai âm thầm riêng biệt:

| Trạng thái | Khẳng định bắt buộc |
|---|---|
| **Phụ lục III** — thuế tuyệt đối/hỗn hợp (xe đã qua sử dụng) | Trả về một số tiền USD, không bao giờ là `%`. Một regex `%` tìm thấy **không có** dòng nào ở đây. |
| **Phụ lục IV** — mức thuế TRQ ngoài hạn ngạch | Trả về giá trị phụ thuộc TRQ, không bao giờ là mức thuế trong hạn ngạch. Các nhóm TRQ đã xác minh trong NĐ 129/2022: 04.07, 17.01, 24.01, 25.01. |
| **`*` trong một biểu thuế FTA** | Có nghĩa là **loại trừ**, không phải bằng không. Khẳng định `*` không bao giờ hiển thị thành `0`. |
| **Mức thuế FTA không có C/O** | MFN so với FTA là có điều kiện. Điều 4 RCEP yêu cầu quy tắc xuất xứ **cộng với một chứng nhận xuất xứ hợp lệ**. "Thuế là 0%" là sai; "0% *nếu* bạn có C/O hợp lệ, nếu không thì 15% MFN" mới đúng. |

(tất cả đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm và các phần công báo NĐ 129/2022)

### Cổng 3.3 — Độ trung thực của bộ phân tích

Bản trích xuất của chính nghiên cứu dùng `textutil`, cái mà trên phụ lục EVFTA đã gộp một dòng mức thuế sáu năm thành `2925,421,818,114,510,9` — sáu mức thuế (`29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9`) nối liền **không có dấu phân cách**, trong một locale dùng dấu phẩy thập phân. Không thể khôi phục nếu không có heuristic.

**Được đánh dấu là suy luận, không phải sự thật:** research 12 tin rằng đây là một hiện tượng do công cụ — RCEP có cấu trúc 6 năm giống hệt và trích xuất hoàn hảo, gợi ý rằng một bộ phân tích thực sự nhận biết bảng (LibreOffice → docx → `w:tbl/w:tr/w:tc`) sẽ khắc phục được — **nhưng không thể chứng minh**; không có `soffice`/`antiword`/`python-docx` khả dụng. **Đây là khoảng trống duy nhất mà một người xây dựng phải khép lại trước khi tin bất cứ thứ gì.** (đã xác minh 2026-07-17, nguồn: research/12.md)

**Cổng: phải tồn tại một bài kiểm tra hồi quy nối-liền-mức-thuế** — khẳng định rằng một dòng FTA đa cột đã biết được phân tích thành đúng *số lượng* các ô mức thuế riêng biệt, không phải một con số duy nhất bị hợp nhất.

---

## 4. Cổng Giai đoạn 2 — gợi ý mã HS ứng viên

Giai đoạn 2 ship top-3 mã HS ứng viên kèm bằng chứng chú giải pháp lý nguyên văn. Một con người quyết định.

### Các con số cần vượt qua, và các con số chứng minh hình dạng của sản phẩm

| Hệ thống | Độ chính xác | Nguồn |
|---|---|---|
| **Chuyên gia con người** (HSCodeComp, 10 chữ số) | **95,0%** | https://arxiv.org/html/2510.19631 |
| Agent tốt nhất (SmolAgent + GPT-5 VLM), 10 chữ số | 46,8% | như trên |
| Gemini Deep Research, 10 chữ số | 40,8% | như trên |
| GPT-5, chỉ LLM, không công cụ, 10 chữ số | 29,0% | như trên |
| Pipeline tất định, **top-3** 6 chữ số | 78,3% | https://arxiv.org/html/2605.14857 |
| Pipeline tất định, **top-3** 4 chữ số | 91,5% | như trên |
| **KCS phương án ứng viên có giải thích + bằng chứng, top-3 6 chữ số** | **93,9%** | https://arxiv.org/abs/2311.10922 |

(tất cả đã xác minh 2026-07-17)

Độ chính xác sụp đổ khi đi xuống hệ thống phân cấp: **~82% ở 2 chữ số → 29-47% ở 10 chữ số.** Báo cáo độ chính xác *theo từng độ sâu chữ số*. Một con số tiêu đề duy nhất che giấu chỗ tiền nằm — người hành nghề lưu ý rằng đa số lỗi xảy ra *sau khi* đã tìm đúng nhóm, ở bước tách phân nhóm vốn quyết định mức thuế, mức độ rủi ro AD/CVD, và điều kiện hưởng FTA.

**Khoảng cách giữa 47% và 93,9% không phải là năng lực mô hình — nó là hợp đồng đầu ra.** Top-3 + bằng chứng + con người quyết định là một sản phẩm khác với top-1 + tự chủ, và chỉ một trong hai thứ đó hoạt động. Việc đánh giá do đó phải chấm điểm sản phẩm mà ta thực sự đang ship.

### Cổng 4.1 — Ngưỡng ship

**Đo top-1 và top-3 trên golden set. So với baseline con người 95% ở 10 chữ số.**

- **Ngưỡng ship: top-3 ≥ 80%.**
- **Dưới 80%: không ship.** Không phải "ship kèm nhãn cảnh báo." Không ship.

Ngưỡng này là một quyết định dự án, không phải một phát hiện nghiên cứu. Nó được đặt ở chỗ hiện tại vì nó nằm giữa mức 78,3% đã đo của pipeline tất định (top-3 6 chữ số) và 93,9% của KCS — tức là nó rõ ràng khả thi với một hệ thống retrieve-and-cite được xây tốt, và một hệ thống dưới ngưỡng đó là đang thua kém prior art đã công bố chứ không phải chạm trần của lĩnh vực.

**Cũng báo cáo top-1, và không bao giờ ship dựa trên nó.** Top-1 là một chỉ báo chẩn đoán cho chất lượng xếp hạng. Nó không phải hợp đồng. Công bố một con số top-1 cho người dùng sẽ mời gọi đúng kiểu sử dụng tự chủ mà sản phẩm từ chối.

### Cổng 4.2 — Những phát hiện không được tối ưu bỏ đi

Hai kết quả HSCodeComp nên chặn một loại công sức lãng phí cụ thể trước khi nó bắt đầu (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.19631):

- **Mở rộng tại thời điểm test không giúp ích.** Bỏ phiếu đa số và tự phản chiếu cho lợi ích không đáng kể — khác với các lĩnh vực suy luận khác. Đừng xây chúng và đừng đánh giá chúng như thể chúng là lợi ích miễn phí.
- **Cấp cho mô hình các quy tắc quyết định do con người viết một cách tường minh *làm giảm* hiệu năng của hầu hết các hệ thống.** Nhồi thêm quy tắc vào prompt ≠ tốt hơn. Nếu một lần chạy đánh giá cho thấy một prompt nhồi đầy quy tắc thắng, hãy nghi ngờ chính bản đánh giá trước khi tin kết quả.

---

## 5. Đánh giá theo thời gian — một bộ riêng

**Quy tắc: 10 câu hỏi mà đáp án đúng phụ thuộc vào việc biết rằng một điều luật đã chết. Trích dẫn luật đã chết là một thất bại bất kể chất lượng văn xuôi.**

Đây được chấm điểm riêng vì nó là một cơ chế thất bại khác. Văn xuôi sẽ xuất sắc. Trích dẫn sẽ giải quyết được. Điều luật đã bị bãi bỏ.

Thất bại theo thời gian đã được đo lường, không phải lý thuyết. Trên 312 cặp QA luật định đã được xác thực trên năm LLM lớn, hai dạng thất bại riêng biệt xuất hiện: mô hình áp dụng **quy tắc lỗi thời** sau khi luật thay đổi, và mô hình **thiên vị điều khoản mới hơn ngay cả khi phiên bản cũ mới là áp dụng được** — một thiên lệch mới đây mà **chỉ RAG không sửa được**. Phát hiện có tính hành động: các cách tiếp cận coi hiệu lực theo thời gian là một **ràng buộc cứng (bộ lọc, không phải tín hiệu xếp hạng)** cải thiện hiệu năng đáng kể. (đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2605.23497)

Quy mô của vấn đề trong một kho ngữ liệu Việt Nam thực: trong 1.703 văn bản của SBV, **863 bị bãi bỏ toàn bộ, 191 bãi bỏ một phần, 639 còn hiệu lực** — **~62% kho ngữ liệu là luật chết hoặc chết một phần** (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).

### Cổng 5.1 — Bộ luật chết (tối thiểu 10 câu hỏi)

Mỗi câu hỏi phải chỉ có thể trả lời được *nếu* hệ thống biết văn bản điều chỉnh đã bị bãi bỏ. Trích dẫn công cụ đã chết = tự động trượt.

| Văn bản đã chết | Chết | Được thay bởi | Nguồn (đã xác minh 2026-07-17) |
|---|---|---|---|
| **Luật Giao thông đường bộ 2008** (23/2008/QH12) | **01/01/2025** | Tách thành **Luật Đường bộ 35/2024/QH15** + **Luật TTATGTĐB 36/2024/QH15**, cả hai thông qua 27/06/2024 | Điều 88 khoản 3 Luật 36/2024; Điều 85 khoản 3 Luật 35/2024 — https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf |
| **Nghị định 10/2020/NĐ-CP** | **01/01/2025** | **NĐ 158/2024/NĐ-CP** (18/12/2024) — bản thân đã bị sửa đổi bởi **NĐ 218/2026/NĐ-CP** (19/06/2026, hiệu lực **10/08/2026**) | https://vanban.chinhphu.vn/?pageid=27160&docid=212082 · https://vanban.chinhphu.vn/?classid=1&docid=218537&orggroupid=2&pageid=27160 |
| **Luật Đường sắt 2017** (06/2017/QH14) | **01/01/2026** | **Luật Đường sắt 2025 (95/2025/QH15)** | https://moc.gov.vn/pl/pages/ChiTietVanBan.aspx?vID=460&TypeVB=1 |
| **Luật HKDD 2006/2014** (66/2006/QH11 + 61/2014/QH13) | **01/07/2026** | **Luật HKDD 2025 (130/2025/QH15)** | https://caa.gov.vn/van-ban/130-2025-qh15-30644.htm |

Lưu ý **ca NĐ 218/2026 là bài kiểm tra đảo ngược**: hiệu lực 10/08/2026, tức là **chưa có hiệu lực vào ngày 2026-07-17**. Một hệ thống phải kiểm soát theo ngày với nó, không phục vụ nó như luật hiện hành hôm nay. Bao gồm ít nhất một câu hỏi sẽ trượt nếu hệ thống phục vụ một văn bản chưa có hiệu lực.

Bao gồm ít nhất một câu hỏi luyện tầng khó hơn: **ngày hiệu lực tiêu đề của một điều luật là chưa đủ.** Luật TTATGTĐB 36/2024 thể hiện cả ba biến chứng cùng lúc — (a) hiệu lực chậm theo từng khoản, (b) các sửa đổi sau này với chính điều về ngày hiệu lực, (c) các luật sửa đổi mà bản thân các khoản của chúng cũng có ngày hiệu lực chia tách. Quy tắc thiết bị an toàn cho trẻ em (khoản 3 Điều 10) được nhiều nơi trích dẫn là có hiệu lực 01/01/2026; nó đã bị dời sang **01/7/2026** bởi Luật 118/2025/QH15, mà khoản liên quan của luật này có hiệu lực 01/01/2026 — một ngày trước khi hạn chót ban đầu cắn vào. (đã xác minh 2026-07-17, nguồn: https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf)

### Cổng 5.2 — Bài kiểm tra hoàn nguyên

**Bắt buộc: một cặp truy vấn, giống hệt nhau ngoại trừ ngày as-of, bắc ngang qua ngày hết hiệu lực của NĐ 72/2026.**

NĐ 72/2026/NĐ-CP được **ký 09/03/2026 và có hiệu lực cùng ngày** ("kể từ ngày ký"), cắt thuế MFN xăng/naphtha/reformate từ 10% → **0%**. Nó chỉ có hiệu lực **đến 30/04/2026** — một **cửa sổ 52 ngày** — sau đó mức thuế **hoàn nguyên về NĐ 26/2023**. (đã xác minh 2026-07-17, nguồn: https://vanban.chinhphu.vn/?amp=&docid=217144&pageid=27160; mức nền 10% cho 2710.12.21/.22/.24/.25/.80 được trích xuất từ NĐ 26/2023 và được xác nhận độc lập bởi đưa tin báo chí về việc cắt "từ 10% xuống 0%")

```
assert lookup(hs="2710.12.21", schedule="NK_uu_dai", date="2026-04-01") == 0    # inside the window
assert lookup(hs="2710.12.21", schedule="NK_uu_dai", date="2026-05-01") == 10   # reverted
```

**Vì sao chính bài kiểm tra này:** một thiết kế "scrape phiên bản mới nhất" không có khái niệm về hết hiệu lực. Nó sẽ phục vụ xăng 0% mãi mãi. Đây là bài kiểm tra thất bại ở kiến trúc, không phải ở một dòng dữ liệu — chính xác vì thế nó phải có trong bộ ngay từ ngày đầu.

### Cổng 5.3 — Bài kiểm tra trung thực về độ trễ công báo

Có một **cửa sổ nhiều tuần mà mức thuế đang có hiệu lực pháp lý không tồn tại ở dạng máy đọc được ở bất cứ đâu** — chỉ tồn tại dưới dạng bản quét 200-DPI.

- **NĐ 72/2026:** ràng buộc 09/03/2026; đăng trên **Công báo số 157 ngày 24/03/2026 — 15 ngày *sau* khi nó đã là luật.**
- **NĐ 26/2023:** ký 31/05/2023, đăng công báo 19/06/2023 (~19 ngày).
- **EVFTA NĐ 116/2022:** ký 30/12/2022, đăng công báo từ 16/02/2023 (~48 ngày).

(tất cả đã xác minh 2026-07-17, nguồn: https://congbao.chinhphu.vn/)

**Không lịch crawl nào có thể khép lại khoảng trống này.** Vì vậy cổng không phải là "luôn cập nhật" — điều đó bất khả thi. Cổng là: **hệ thống phải biết ngày snapshot của mình và từ chối, hoặc cảnh báo độ cũ một cách nhìn thấy được, thay vì trả lời tự tin từ một snapshot có thể có trước một sửa đổi ràng buộc.** Kiểm tra rằng việc từ chối/cảnh báo thực sự kích hoạt.

Đây là lý do hợp đồng đầu ra là "một công cụ hỗ trợ nghiên cứu cho thấy nguồn và ngày as-of của nó," không bao giờ là "một cỗ máy trả lời phát biểu một mức thuế." Tờ khai hải quan có tính ràng buộc pháp lý; một mức thuế sai nghĩa là nộp thiếu → truy thu, phạt, và **người khai — không phải công cụ — gánh trách nhiệm pháp lý.**

---

## 6. Việc bám trích dẫn xác minh SỰ ỦNG HỘ, không phải SỰ TỒN TẠI

**Đây là yêu cầu bị hiểu lầm nhiều nhất trong tài liệu. Đọc ca Wilgarten trước khi viết bất kỳ kiểm tra bám nào.**

Nguồn chuẩn mực là **Magesh, Surani, Dahl, Suzgun, Manning & Ho, "Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools," Journal of Empirical Legal Studies 2025** — đánh giá **được đăng ký trước đầu tiên** của các công cụ này, 202 truy vấn, chấm điểm bởi chuyên gia. (đã xác minh 2026-07-17, nguồn: https://doi.org/10.1111/jels.12413 · PDF: https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf)

| Hệ thống | Kết quả |
|---|---|
| **Lexis+ AI** | chính xác 65%; **ảo giác >17%** |
| **Westlaw AI-Assisted Research** | chính xác 42%; **ảo giác >34%** |
| Ask Practical Law AI | dải ảo giác 17-33% |
| GPT-4 (không RAG) | ~43% ảo giác |

Đây là các sản phẩm nghiên cứu pháp lý thương mại của LexisNexis và Thomson Reuters, được tiếp thị dựa trên các tuyên bố "trích dẫn pháp lý được liên kết không ảo giác" và RAG "giảm ảo giác một cách mạnh mẽ xuống gần như bằng không." **Đây là con số để neo kỳ vọng của các bên liên quan.** RAG giảm ảo giác pháp lý; nó không loại bỏ ảo giác.

### Ca Wilgarten — vì sao kiểm tra sự tồn tại là vô giá trị

Khi được hỏi các ý kiến của **"Luther A. Wilgarten," một thẩm phán hư cấu**, Lexis+ AI trả về **một vụ án thật với một trích dẫn thật, định dạng đúng** — chỉ đơn giản là không phải do vị (không hề tồn tại) thẩm phán đó viết. Cụm từ của các tác giả: *"không ảo giác theo một nghĩa hẹp."*

**Hàm ý, được phát biểu thẳng thừng như nghiên cứu phát biểu: "mọi trích dẫn đều giải quyết về một tài liệu thật" là một sự bảo đảm vô giá trị. Nó chính xác là sự bảo đảm mà các nhà cung cấp tiếp thị và chính xác là sự bảo đảm thất bại.**

**Do đó: một bộ xác thực số Điều mang lại sự an tâm giả.** Một kiểm tra rằng "Điều 12 Nghị định 26/2023/NĐ-CP" phân tích được, tồn tại, và còn hiệu lực sẽ đạt trên một câu trả lời mà Điều 12 chẳng nói gì về mệnh đề được khẳng định. Kiểm tra phải xác minh **rằng điều khoản được trích dẫn ủng hộ mệnh đề** — không phải rằng nó tồn tại.

Đây không phải là giả định với luật Việt Nam. Nó là dạng thất bại gần như chắc chắn, vì văn bản pháp lý ở đây dư thừa về từ vựng xuyên các tài liệu ("Điều 5. Giải thích từ ngữ" tồn tại trong hàng trăm văn bản và gần như giống hệt về mặt văn tự), chính là đặc tính sinh ra **Sai lệch Truy xuất Cấp Tài liệu (Document-Level Retrieval Mismatch) — quan sát được ở mức vượt 95% trên một số tập dữ liệu** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2510.06999v1).

### Cổng 6.1 — Các kiểm tra bám thực sự tính

- **Sự ủng hộ, không phải sự tồn tại.** Chấm điểm liệu Điều/Khoản/chú giải chương được trích dẫn có kéo theo khẳng định hay không. Một kiểm tra entailment/cross-encoder, hoặc chấm điểm bởi con người trên golden set. Kiểm tra sự tồn tại có thể chạy *bổ sung*, không bao giờ *thay thế*.
- **Bằng chứng nguyên văn.** Mỗi mã HS ứng viên phải trích dẫn nguyên văn thẩm quyền của nó — Chú giải Chương, Chú giải Phần, đoạn EN, mục SEN, hay công văn cụ thể. Trích dẫn, không diễn giải. Đây là điều nghiên cứu KCS chứng minh mang lại giá trị: **không phải dự đoán — mà là việc truy xuất bằng chứng**. Một nghiên cứu người dùng với **32 chuyên gia hải quan** xác nhận phương án ứng viên + giải thích làm giảm đáng kể thời gian và công sức rà soát. (đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2311.10922)
- **Từ chối trả lời (abstention) là một đầu ra hạng nhất và phải được chấm điểm như vậy.** Một cổng trước-sinh (không chunk nào vượt ngưỡng tương đồng → từ chối trước khi sinh) cộng với một kiểm tra bằng chứng sau-sinh (`if ¬HasCitations(a) or EvidenceMismatch(a, D, G) → return Unknown Answer`) là một khuôn mẫu dùng được. Một bản đánh giá phạt việc từ chối ngang với một câu trả lời sai sẽ huấn luyện hệ thống thành sai một cách tự tin. **Chấm điểm việc từ chối tách biệt với lỗi.** (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)
- **Không bao giờ để mã ưa thích của người dùng vào prompt như một tiền đề.** Lời cảnh báo của người hành nghề đáng trích: *"nếu bạn muốn HTS của mình là X (dù HTS đúng là Y), AI sẽ cho bạn một lập luận (hoặc ba) để ủng hộ HTS ưa thích của bạn."* Mô hình là một luật sư biện hộ nịnh hót, không phải một quan tòa. **Thất bại này chế tạo ra dấu vết giấy tờ cho một đặc trưng hóa trốn thuế** — kết cục pháp lý tệ nhất có thể có. Bao gồm một ca đánh giá đối kháng: gửi một truy vấn chứa một mã ưa thích sai và khẳng định hệ thống không phê chuẩn nó. (đã xác minh 2026-07-17, nguồn: https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/)

---

## 7. Các chỉ số đo

### Truy xuất

- **Recall@k**
- **Precision@k**
- **MRR**
- **F2@k** — chỉ số chính.

**Vì sao F2 chứ không phải F1:** F2 đặt trọng số recall cao hơn precision. **Bỏ sót một điều khoản áp dụng được thì tệ hơn là hiển thị thừa một điều khoản.** Một chú giải loại trừ bị bỏ sót là một phân loại sai; một chú giải truy xuất thừa tốn của người rà soát ba mươi giây. Sự bất đối xứng là có thật, nên chỉ số phải mã hóa nó thay vì lấy trung bình nó đi. (Việc dùng F2 đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)

**Áp lực đối trọng ngăn F2 bị chơi gian:** bạn không thể sửa recall bằng cách tăng k. RAG pháp lý dễ tổn thương với hiện tượng **"lạc giữa dòng" (lost in the middle)** — nhồi 20 Điều vào ngữ cảnh làm suy giảm chủ động độ trung thực. Điều này ủng hộ rerank quyết liệt + top-k thấp (SBV-LawGraph dùng k=5), không phải "truy xuất nhiều hơn cho chắc." **Báo cáo F2@k ở một k cố định, thấp** để lợi ích recall phải đến từ xếp hạng, không từ việc ngập ngữ cảnh. (đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2605.19806 · https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)

### Sinh — tính đúng theo phép hội

Một câu trả lời được tính là đúng **chỉ khi cả ba điều đều đúng**:

1. **Tương đương về ngữ nghĩa** với đáp án đã biết là đúng, **VÀ**
2. **Chứa ≥1 trích dẫn pháp lý**, **VÀ**
3. **Trích dẫn hợp lệ VÀ liên quan.**

Theo phép hội, không phải có trọng số. Một câu trả lời trôi chảy nhưng không trích dẫn thì được điểm không. Một câu trả lời trích dẫn tốt nhưng trích dẫn không ủng hộ khẳng định thì được điểm không — đó là điều kiện (iii), và nó là sự vận hành hóa bài học Wilgarten. (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf, dùng hai người chú thích)

### Các con số tham chiếu để hiệu chuẩn

Truy xuất luật định Việt Nam, SBV-LawGraph (đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf):

| Phương pháp | ALQAC R@1 | ALQAC R@10 | SBV R@1 | SBV R@10 |
|---|---|---|---|---|
| BM25 | 0.57 | 0.74 | 0.38 | 0.65 |
| Naive RAG (dense, không rerank) | 0.36 | 0.58 | 0.32 | 0.61 |
| Advanced RAG (hybrid 75/25) | 0.57 | 0.74 | 0.40 | 0.67 |
| SBV-LawGraph (hybrid+rerank+KG) | **0.69** | **0.77** | **0.49** | **0.76** |

**Các lưu ý mà chính các tác giả liệt kê, tái lập chứ không tẩy trắng:** tập đánh giá SBV nhỏ (100 cặp QA); **không có ablation cô lập đóng góp độc lập của KG**; không có kiểm toán chất lượng KG; đúng/sai nhị phân với chỉ 2 người chú thích và **không báo cáo độ đồng thuận giữa các người chú thích**. Coi là mang tính định hướng, không phải dứt khoát.

Lưu ý hình dạng: **embedding dense dùng ngay không tinh chỉnh THUA BM25 trên văn bản pháp lý Việt Nam** (0.36 so với 0.57 R@1) và chỉ thắng dứt khoát sau khi fine-tune trong lĩnh vực (TVPL: BM25 MRR@10 21.60 → ColBERT fine-tune 74.61) (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2412.00657v1). Bất kỳ đánh giá nào so sánh các trọng số hybrid đều phải báo cáo dùng mô hình embedding nào, vì tỷ lệ BM25:dense đúng là một hàm của mức độ thích ứng tốt của embedding — không phải một hằng số để chép từ một bài báo.

---

## 8. Đăng ký trước giao thức

**Quy tắc: ghi lại các định nghĩa chỉ số, golden set, các ngưỡng, và kế hoạch phân tích TRƯỚC KHI chạy đánh giá. Commit chúng. Không sửa chúng sau khi đã xem kết quả.**

Đăng ký trước là **đóng góp phương pháp luận cốt lõi của Magesh và cộng sự**, và là lý do các con số của họ mâu thuẫn với marketing của nhà cung cấp một cách sạch sẽ đến vậy. **Lĩnh vực này đầy các tuyên bố của nhà cung cấp không sống sót khi va chạm với một giao thức đăng ký trước.** (đã xác minh 2026-07-17, nguồn: https://doi.org/10.1111/jels.12413)

Khoảng cách được đo lường độc lập giữa marketing và thực tế là khoảng 2×, và nó được ghi chép trên các sản phẩm có tên:

- **Zonos tuyên bố "độ chính xác 90%+ ngay khi dùng"**, hậu thuẫn bởi 500k+ nhãn được phân loại thủ công. Kiểm thử độc lập trên 103 phán quyết CBP ngẫu nhiên đặt nó ở **44,1% ở 10 chữ số**.
- **80,0% của Avalara** đến từ một sản phẩm bao gồm tường minh **việc rà soát của chuyên gia con người trong vòng lặp**.
- **Tarifflo: 89,2%** ở 10 chữ số.
- **WCO BACUDA: 12,75%** (ở 6 chữ số, trần của nó).

(đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2412.14179v1 · https://zonos.com/classify · https://www.avalara.com/us/en/products/global-commerce-offerings/item-classification.html)

**Coi mọi con số của nhà cung cấp — bao gồm của chính chúng ta — là marketing cho đến khi được tái lập độc lập.** Lưu ý benchmark sinh ra các con số này bản thân nó nhỏ (n=103) và đặc thù US-HTS.

Kỷ luật đăng ký trước áp dụng nội bộ. Thất bại nó ngăn ngừa là cụ thể và có khả năng xảy ra: chạy đánh giá, thấy top-3 74%, và quyết định rằng ngưỡng top-3 ≥80% dù sao cũng luôn có phần tùy tiện. **Quyết định đó phải là không thể đưa ra sau khi đã thấy con số.**

---

## 9. Các benchmark Việt Nam có sẵn để tham chiếu

Dùng chúng để hiệu chuẩn và cho công việc chọn mô hình embedding — **không phải** như một thứ thay thế cho golden set. Chúng đo truy xuất pháp lý Việt Nam nói chung; golden set đo các tờ khai của công ty này.

| Benchmark | Quy mô | Ghi chú |
|---|---|---|
| **ALQAC 2025** | — | Automated Legal Question Answering Competition; sân chơi pháp lý Việt Nam chính |
| **TVPL** | **224.006 đoạn văn**; 165.334 truy vấn train / 10.000 test | Benchmark truy xuất pháp lý Việt Nam công khai lớn nhất. Lấy nguồn từ thuvienphapluat.vn — **xem cờ cấp phép ở §10** |
| **Zalo Legal Text Retrieval 2021** | **61.425 đoạn văn** | — |
| VLegal-Bench | — | Benchmark *suy luận* pháp lý Việt Nam (Tháng 12/2025) — **chỉ có snippet, chưa xác minh** |

(đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2412.00657v1 · https://arxiv.org/html/2409.13699v1)

---

## 10. Khoảng trống benchmark còn mở — bản đánh giá ta có thể phải tự chạy

**Không có so sánh đối đầu đã công bố nào giữa OpenAI (`text-embedding-3-large`) hoặc Voyage so với các mô hình embedding chuyên biệt Việt Nam trên văn bản pháp lý Việt Nam. Benchmark đó không tồn tại trong tài liệu học thuật.** (đã xác minh 2026-07-17)

Thay vào đó, đã tìm thấy:

- Mọi bài báo pháp lý Việt Nam được tìm thấy đều benchmark **chỉ các mô hình mã nguồn mở/Việt Nam và bỏ qua OpenAI một cách tường minh** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2507.14619).
- Benchmark duy nhất *có* so sánh OpenAI với mã nguồn mở trên truy xuất tiếng Việt — MTEB trên VieQuAD/WebFAQ/**Zalo Legal Text** — **bị tường phí**: phương pháp luận thì thấy được, kết quả thì không (đã xác minh 2026-07-17, nguồn: https://nqbao.medium.com/benchmarking-text-embedding-models-for-vietnamese-retrieval-tasks-3c4342e0ff9d).

**Nếu lựa chọn kiến trúc đó quan trọng, hãy chạy nó: TVPL + MTEB là bộ harness làm sẵn.** Đừng giải quyết nó bằng giả định, và đừng trích dẫn một bảng xếp hạng từ một tác vụ khác — truy xuất và rerank xếp hạng các mô hình khác nhau, đôi khi ngược nhau. Ví dụ đo được: `sup-SimCSE-VietNamese-phobert-base` **tốt nhất ở rerank (mAP 69.46) và tệ nhất một cách thảm họa ở truy xuất (acc 0.12 so với 0.73 của bi-encoder)** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2503.07470).

**Cờ cấp phép trước khi dùng TVPL:** `robots.txt` của thuvienphapluat.vn mang một `Content-Signal: search=yes, **ai-train=no**, use=reference` tường minh, được đóng khung như một sự bảo lưu quyền rõ ràng theo Điều 4 EU DSM, và chặn Amazonbot/Applebot-Extended/Bytespider theo tên. Trang trả về **403 Forbidden** (Cloudflare) cho fetch tự động, và các file Excel biểu thuế của nó là một **sản phẩm thương mại**. TVPL-benchmark được dẫn xuất từ kho ngữ liệu đó. **Giải quyết câu hỏi cấp phép trước khi xây dựng trên nó** — đây là nguồn có rủi ro pháp lý tệ nhất trong danh mục, không phải lối tắt như nó trông có vẻ. (đã xác minh 2026-07-17, nguồn: research/12.md fetch trực tiếp https://thuvienphapluat.vn/robots.txt)

---

## Chưa xác minh / Không được dựa vào

Tái lập từ nghiên cứu với các cờ gốc của chúng. **Đừng nâng bất kỳ cái nào trong số này thành một tuyên bố tự tin mà không có xác minh độc lập.**

### Còn tranh cãi — hai agent nghiên cứu trực tiếp mâu thuẫn nhau

**API biểu thuế customs.gov.vn. Xung đột CHƯA ĐƯỢC GIẢI QUYẾT.** Điều này quan trọng với việc đánh giá một cách cụ thể vì customs.gov.vn là một trong hai nguồn đối chiếu được đề xuất cho cổng Giai đoạn 1 §3.1. Nếu API không tiếp cận được, cổng phải chạy dựa trên riêng ECUS hoặc dựa trên văn bản nghị định.

| Research 10 khẳng định | Research 12 khẳng định |
|---|---|
| **"CÓ một JSON API không tài liệu, không xác thực, không captcha trên customs.gov.vn trả về MFN + tất cả 22 mức FTA cho mỗi dòng HS trong một lệnh gọi duy nhất."** Đã xác minh bằng `curl` thuần — không session, không cookie, không captcha, không kiểm tra Referer/Origin. Endpoint: `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`. `l_param` = tiền tố HS, tối thiểu 4 chữ số; `"8703"` trả về 510 dòng. Ví dụ `87031010` → `{'NK_uu_dai':'70','ATIGA':'0','EVFTA_NK':'28.3','NK_TT':'105'}`. Khẳng định dữ liệu là trực tiếp và cập nhật cho 2026. Trích xuất hàng loạt ≈ 1.228 POST. | **Không thể tiếp cận được nó.** Tìm thấy `/scripts/main.js` hardcode một base *khác* — `http://123.30.210.236:8080/hqcustomsapi/`, một IP thô trên HTTP thuần cổng 8080 — **bao gồm `.../hqcustomsapi/captcha/CheckCaptcha`, tức là ít nhất một phần của cổng thông tin bị chặn bằng CAPTCHA.** IP đó **hết thời gian chờ**; không thể phân biệt chặn địa lý với chặn egress sandbox, nên tường minh **không khẳng định là không tiếp cận được**. Đánh giá việc liệt kê qua một endpoint không tài liệu đứng sau CAPTCHA trên một IP thô là "mong manh và đối kháng." |

Cả hai agent đồng ý ở hai điểm: `www.customs.gov.vn/robots.txt` trả về `User-agent: *` với **không dòng `Disallow` nào**; và **customs.gov.vn không phải nguồn chân lý pháp lý — Nghị định mới là.** Research 10 thêm các lưu ý của riêng nó: danh sách biểu thuế **không có VIFTA và không có CEPA (UAE)** và các giá trị `THOI_GIAN_CAP_NHAT` là 2019-2020; nó trả về **chỉ mức thuế năm hiện tại**, không có chuỗi năm tương lai; và nó không tài liệu, không phiên bản, không SLA và không cấp phép ToS — nó có thể biến mất hoặc bắt đầu áp captcha bất cứ lúc nào.

**Đừng thiết kế cổng Giai đoạn 1 phụ thuộc vào việc API có sẵn. Tự xác minh khả năng tiếp cận trước khi dựa vào bất kỳ tường thuật nào.**

### Các tuyên bố chưa xác minh tái lập kèm cờ của chúng

- **Việc nối liền mức thuế của `textutil` là "một hiện tượng do công cụ có thể sửa được bằng một bộ phân tích Word thực sự"** — **suy luận, không được chứng minh** (research 12 không thể kiểm tra: không có `soffice`/`antiword`/`python-docx` khả dụng). §3.3 tồn tại vì điều này.
- **"Các nghị định FTA 2022-2027 gặp vách đứng vào 31/12/2027"** — research 12 đánh dấu đây là **suy luận, không được xác minh**. Research 10 độc lập báo cáo cùng ngày hết hiệu lực từ danh sách nghị định. Được xác nhận theo hướng; sự va chạm đồng thời với chuyển đổi danh pháp AHTN/HS 2028 (HS 2028 có hiệu lực **01/01/2028**, đã xác minh: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx) là một ràng buộc thiết kế, chưa phải một cổng đánh giá.
- **"Claude 3.5 Sonnet và GPT-4 đạt ~80% ở 6 chữ số và >90% ở 2 chữ số."** Nổi lên trong một snippet tìm kiếm với **không nguồn gốc chính có thể truy vết**, và nó **mâu thuẫn với HSCodeComp** (GPT-5 chỉ-LLM: 29% ở 10 chữ số, ~82% ở 2 chữ số). **Đừng dựa vào nó. Đừng dùng nó để đặt ngưỡng.**
- **"1 trên 3 tờ khai hải quan bị phân loại sai; hàng chục tỷ tiền thuế nộp sai."** Blog nhà cung cấp, **không trích dẫn gốc**. Hợp lý theo hướng, không nguồn.
- **"Faithful Passage Grounding" loại bỏ 63% trích dẫn ảo giác** — **chỉ từ snippet tìm kiếm**; nguồn gốc chính chưa được xác minh. Đừng trích dẫn như một biện minh thiết kế.
- **arXiv:2606.00898 "Citation Grounding via Legal Citation Graphs"** và **arXiv:2606.21155 "Who Checks the Citations?"** — **chỉ có snippet, chưa fetch.**
- **VLegal-Bench** — chỉ có snippet, chưa xác minh.
- **Quyết định 117/QĐ-CHQ (2026)** chi tiết cơ sở dữ liệu phân loại nội bộ — không thể fetch toàn văn (tường phí/403). **Độ tin cậy trung bình.** "Cơ sở dữ liệu phân loại thống nhất toàn ngành" của nó là một hệ thống *nội bộ*; **đừng cho rằng nó sẽ được phơi bày ra ngoài.**
- **SAT-Graph RAG (arXiv:2505.00039)** — tham chiếu kiến trúc theo thời gian — **không báo cáo đánh giá định lượng nào.** Nó là một đề xuất kiến trúc, không phải một kết quả thực nghiệm. Áp dụng mô hình dữ liệu; **đừng trích dẫn nó như bằng chứng về hiệu năng.**

### Các giới hạn cấu trúc mà không điểm đánh giá nào có thể che lấp

- **Việt Nam không có thứ tương đương CROSS/EBTI.** Không có kho ngữ liệu phán quyết phân loại sạch, đầy đủ, máy đọc được, truy vấn công khai được. **Chất lượng truy xuất bị giới hạn bởi khả năng tiếp cận dữ liệu, không phải bởi mô hình** — một F2 thấp có thể là một phản ánh trung thực của kho ngữ liệu, không phải một thất bại tinh chỉnh. (đã xác minh 2026-07-17, nguồn: research/09.md; VNTR tại https://vntr.moit.gov.vn/administrative_rulings chỉ là các liên kết HTML, tập mẫu ~Tháng 9/2021-Tháng 1/2022, "chỉ dùng cho mục đích tham khảo")
- **TTĐB và BVMT không được khóa theo HS trong luật.** Đã xác minh qua chính API hải quan: các truy vấn TTĐB trả về `"1. Thuốc lá điếu…"` với **`MA_HS: None`**. Bất kỳ ánh xạ theo-HS nào cũng là **suy luận biên tập của chính chúng ta và một bề mặt rủi ro pháp lý** — nó phải được đánh giá như một sản phẩm của chúng ta, không bao giờ trình bày như luật. (đã xác minh 2026-07-17, nguồn: research/10.md)
- **Thuế chống bán phá giá/tự vệ nằm trong từng quyết định của Bộ Công Thương, không có sổ đăng ký hợp nhất.** Với truy vấn nguyên mẫu — "thép từ Trung Quốc" — **bảng biểu thuế là con số ít quan trọng nhất.** Ngoài phạm vi v1; một bản đánh giá chấm "mức thuế đúng" mà không nêu điều này là đang đo sai thứ. (đã xác minh 2026-07-17, nguồn: research/10.md, research/12.md)
- **`(HS, country) → rate` thậm chí không phải là một hàm.** Điều 6.2 RCEP chứa một quy tắc mức-thuế-cao-nhất xuyên các phụ lục cho một số hàng hóa đa xuất xứ (đã xác minh trong văn bản: *"Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."*). Bất kỳ bản đánh giá nào giả định một mức thuế đúng duy nhất cho mỗi cặp (HS, country) đều có một bug trong bản đánh giá. (đã xác minh 2026-07-17, nguồn: văn bản công báo NĐ 129/2022 qua https://congbao.chinhphu.vn/)

---

## Kiến thức liên quan

- [Phân loại HS](../concepts/hs-classification.md) — bộ máy GRI, các benchmark độ chính xác đằng sau §4, hình phạt, phán quyết trước
- [Hệ thống biểu thuế](../concepts/tariff-system.md) — cấu trúc biểu thuế, các phụ lục đằng sau cạm bẫy §3.2, chuỗi sửa đổi
- [Truy xuất RAG pháp lý](../concepts/legal-rag-retrieval.md) — chia chunk, tìm kiếm hybrid, và thiết kế truy xuất mà các chỉ số này chấm điểm
- [Nguồn dữ liệu](../concepts/data-sources.md) — Công báo, xung đột customs.gov.vn, tư thế robots/cấp phép
- [Văn bản pháp luật Việt Nam](../concepts/vietnamese-legal-documents.md) — hiệu lực, VBHN, mô hình thời gian đằng sau §5
- [ADR: Không dùng LLM cho các con số thuế](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md) — vì sao Giai đoạn 1 là một cổng đối chiếu, không phải một điểm độ chính xác
- [ADR: Phương án ứng viên HS, không phải câu trả lời](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md) — hợp đồng đầu ra mà §4 chấm điểm
- [ADR: Hiệu lực song thời gian từ ngày đầu](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md) — mô hình mà §5 kiểm tra
- [ADR: Dùng VBHN đã công bố, không phải hợp nhất tính toán](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)
- [Quy tắc nghiệp vụ](../business-rules.md) — trách nhiệm pháp lý của người khai, chính sách từ chối
- [Quy trình khai báo hải quan](../workflows/customs-declaration.md) — nơi các câu hỏi golden set đến từ
- [Chỉ mục tài liệu Agent](README.md)
