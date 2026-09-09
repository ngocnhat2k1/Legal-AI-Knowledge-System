---
type: doc
status: active
updated: 2026-08-14
related:
  - legal-corpus-self-extension.md
  - evaluation.md
  - ../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md
  - ../architecture-decisions/2026-07-17-hs-candidates-not-answers.md
  - ../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md
  - ../business-rules.md
  - ../concepts/hs-classification.md
  - ../concepts/legal-rag-retrieval.md
  - ../planning/03-llm-expansion-tasks.md
---

# Thiết kế: dùng nhiều LLM hơn mà không nới một rào chắn nào

## Bối cảnh — ba triệu chứng của chủ dự án, và nguyên nhân thật trong code

Chủ dự án báo (2026-08-14): hệ thống **quá hẹp**, **thường xuyên tra không ra văn bản pháp luật
lẫn mã HS**, và **chưa hiểu đúng mã HS**. Ba câu đó nghe như một vấn đề nhưng là ba vấn đề khác nhau,
và chỉ có một cái là vấn đề truy hồi:

| Triệu chứng | Nguyên nhân đọc được từ mã nguồn |
|---|---|
| Tra không ra văn bản | Kho có **7 văn bản**. Mọi câu hỏi ngoài 7 văn bản đó rơi vào nhánh `missingDoc` rồi abstain. Retriever không kém — **không có gì để truy hồi**. |
| Quá hẹp | `parseLooseDocRef` chỉ hiểu "thông tư + số + tên bộ". Hỏi theo **chủ đề** mà không nêu số hiệu thì chỉ có **một** lượt truy hồi với **một** cách diễn đạt, không mở rộng truy vấn, không đi vòng hai. |
| Chưa hiểu đúng mã HS | Đường phân loại hiện tại là: LLM đoán từ khoá → khớp **chuỗi** trên `hs_description.path`. Không có chú giải Phần/Chương, không có GRI, không có bằng chứng. Phần *quyết định* của phân loại HS **chưa được xây**. |

Ba nguyên nhân, ba lời giải khác nhau. Gộp chúng thành "cải thiện RAG" là cách chắc chắn nhất để tiêu
hai tháng mà không sửa được cái thứ ba.

## Ràng buộc do chủ dự án chốt (2026-08-14)

1. **Tầng LLM chạy trên `claude -p` (subscription CLI)**, không dùng API trả phí. Hệ quả cứng:
   tuần tự, timeout 45s, không song song trên đường chat.
   → **Ngân sách: tối đa 2 lần gọi LLM cho một lượt chat.** Job nền **không giới hạn** số lần gọi
   (không tốn tiền, không ai chờ). Đây là đòn bẩy trung tâm của toàn bộ thiết kế.
2. **Mở rộng kho theo cả hai hướng**: nạp sẵn hàng loạt theo lĩnh vực **và** tự nạp tức thì
   (bỏ bước hỏi "nạp?").
3. **Bốn nguồn bằng chứng HS được phép**: chú giải Phần/Chương (TT 31/2022/TT-BTC), SEN 2022
   (Công văn 3866/TCHQ-TXNK), công văn phân loại/xác định trước mã số, và WCO Explanatory Notes.
   WCO EN **có bản quyền** → chỉ nạp sau khi chủ dự án xác nhận license hợp lệ; thiết kế phải chạy
   đủ mà không có nó.

## Nguyên tắc chi phối

> **LLM được dùng nhiều ở chỗ *tìm và điều hướng*. Không bao giờ ở chỗ *khẳng định*.**

Cụ thể hoá thành ba mệnh đề, mỗi mệnh đề có một chỗ cưỡng chế bằng code:

- LLM sinh **giả thuyết** (nhiều cách diễn đạt truy vấn, nhiều nhánh HS ứng viên, đề xuất văn bản
  cần đọc). Giả thuyết rẻ và được phép sai.
- Hệ thống **kiểm chứng tất định**: truy hồi, tra khoá chính xác, đối chiếu với tập đã truy hồi.
- LLM ở bước cuối chỉ được **chọn và loại trên bằng chứng nguyên văn** — không sinh số, không sinh
  mã, không sinh số hiệu điều khoản.

Ghi thành ADR: [LLM sinh giả thuyết, không bao giờ khẳng định](../architecture-decisions/2026-08-14-llm-generates-hypotheses-never-assertions.md).

## Vì sao KHÔNG làm "agent tự do"

Phương án hiển nhiên là cho LLM tool-calling tự do: tự tra DB, tự tải Công báo, tự quyết. Bị loại vì
ba lý do, theo thứ tự nghiêm trọng:

1. **Đúng vào chế độ thất bại [R2](../business-rules.md) đo được.** Agent tự chủ tốt nhất đạt 46,8%
   ở 10 chữ số; pipeline cố định dùng thứ bậc thuế quan làm luồng điều khiển đạt **91,5% top-3 ở
   4 chữ số**. Khoảng cách đó là *cấu trúc*, không phải năng lực mô hình.
2. **Không test được.** Một agent tự do không có tập bước cố định để viết eval lên trên.
3. **Với CLI tuần tự thì chậm tới mức không dùng nổi** — mỗi vòng tool-call là một lần spawn tiến trình.

## Kiến trúc — năm phần

### Phần 0 · Nền móng (chặn mọi thứ khác)

| Việc | Vì sao phải làm trước |
|---|---|
| Đưa CLI `claude` + `CLAUDE_CODE_OAUTH_TOKEN` vào image và `docker-compose.yml`; `/health` báo trạng thái LLM | Hôm nay repo **không** cài CLI trong image và **không** truyền token qua compose. Một bản deploy sạch **im lặng** rớt về chế độ không-LLM: router dùng fallback, `/legal` chỉ trả nguyên văn, vision tắt. Thêm tầng LLM lên trên một hệ thống có thể lặng lẽ không có LLM là xây trên cát. |
| Sửa lỗi cắt đuôi tiêu đề điều trong `parse_provisions.py`, nạp lại kho | Lỗi này đang ở **cả kho**; Phần 1 sắp nhân nó ra hàng trăm văn bản. Sửa sau nghĩa là nạp lại hàng trăm văn bản. |
| `yarn eval` — một lệnh, in ra recall@k, tỉ lệ abstain, tỉ lệ trích dẫn hợp lệ, HS top-1/top-3 | Không có số đo thì không chứng minh được "nhiều LLM hơn" là tốt hơn, và mọi thay đổi prompt phía sau là đoán mò. |

### Phần 1 · Kho rộng ra

1. **Nạp sẵn theo lĩnh vực.** Lọc `gazette_document` (loại + cơ quan ban hành + từ khoá tiêu đề)
   → xếp hàng ưu tiên thấp. Mục tiêu vài trăm văn bản hải quan/thuế/XNK.
   Cần: worker chạy **N tiến trình song song**, có **retry + backoff**, và theo dõi tỉ lệ qua cổng
   tự kiểm (hôm nay: một tiến trình, thất bại là bỏ).
2. **Tự nạp tức thì.** Bỏ bước hỏi. Phát hiện văn bản có thật mà chưa có → xếp hàng **ưu tiên cao**
   ngay trong lượt đó và trả lời "đang nạp, vài phút nữa tôi nhắn lại". Cơ chế báo về thread đã có.
3. **Chỉ mục chủ đề bằng LLM — đây là chỗ "hẹp" được nới ra.** Job nền đi qua ~15.500 tiêu đề trong
   `gazette_document`, mỗi văn bản sinh *thẻ chủ đề + những câu hỏi mà văn bản này trả lời được*,
   lưu ở bảng mới `gazette_topic` và embed. Nhờ đó một câu hỏi theo **chủ đề** tìm ra đúng **văn bản**
   dù chưa nạp toàn văn, rồi tự nạp. Rẻ (chạy một đêm), và không phải nạp toàn văn 15.500 văn bản.
4. **Cảnh báo không được tràn.** Kho lên vài trăm văn bản `auto_unverified` thì cảnh báo trên mọi
   trích dẫn thành nhiễu và người đọc bỏ qua đúng lúc cần nhất.
   → **Quyết định: KHÔNG thêm mức `auto_gated`.** Giữ hai mức, đúng
   [ADR kho tự mở rộng](legal-corpus-self-extension.md): máy nạp được, chỉ người phong được. Thay vào
   đó gom cảnh báo về **một dòng cho cả câu trả lời** thay vì lặp trên từng trích dẫn, và thêm
   `GET /legal/unverified` để chuyên viên duyệt hàng loạt.

### Phần 2 · Truy hồi thông minh hơn, vẫn trong ngân sách 2 lần gọi

1. **Đa truy vấn — không tốn thêm round-trip.** Router đang trả một `search_query`; đổi thành
   **3–5** cách diễn đạt (cách nói của luật khác cách nói của người: "hoàn thuế" ↔ "hoàn trả tiền
   thuế nộp thừa"), cộng một truy vấn dạng câu-trả-lời-giả-định. Gộp bằng RRF **trong một câu SQL**.
2. **Rerank bằng LLM có cổng** (lần gọi thứ hai). Lấy top-20 thay vì top-6; LLM chấm điểm liên quan;
   giữ top-5. Mô hình **chỉ được trả `id` + điểm**; id ngoài tập bị vứt — cùng khuôn `validateCitations`.
3. **Nới cổng cứng, để rerank làm cổng mềm.** `MAX_DIST = 0.58` đang gây abstain oan khi câu hỏi lệch
   chữ. Nới lên ~0.70 và để LLM lọc. **Chỉ đổi khi eval chứng minh** recall tăng mà tỉ lệ trả lời sai
   không tăng.
4. **Vòng hai có trần.** Vòng một trắng → LLM đọc danh mục kho + chỉ mục Công báo, đề xuất văn
   bản/điều cụ thể → truy hồi lại đúng phạm vi đó. **Tối đa 2 vòng**; vẫn trắng thì abstain như cũ.

### Phần 3 · Kho bằng chứng HS (cái đang thiếu hoàn toàn)

Bảng mới `hs_note`: mỗi chú giải gắn với phạm vi (phần / chương / nhóm 4 số / phân nhóm) và
`authority_rank` — **ràng buộc** > **có thẩm quyền** > **tham khảo**, đúng thứ bậc trong
[R2](../business-rules.md). Giữ **nguyên văn**, không diễn giải.

- Chú giải Phần/Chương từ **TT 31/2022/TT-BTC** (Công báo, dùng đúng parser đang có) — ràng buộc
- **SEN 2022** từ Công văn 3866/TCHQ-TXNK — có thẩm quyền, không tự ràng buộc độc lập
- **Công văn phân loại / xác định trước mã số** — thu thập dần; giá trị thực dụng cao nhất
- **WCO EN** — chỉ nạp khi có license; lưu tách, đánh dấu nguồn

**Job nền biên dịch chú giải thành mệnh đề có kiểu** (LLM, không giới hạn số lần gọi): mỗi chú giải →
danh sách `{kind: exclude | include | define | condition, scope: '8471', verbatim: '…'}`. Mệnh đề chỉ
dùng để **lọc**; hiển thị thì luôn trích nguyên văn. Đây là cách "biên dịch trước ngoại tuyến thành
mệnh đề có kiểu" mà nghiên cứu DAW ghi trong [R2](../business-rules.md) đo được là gấp đôi độ chính
xác so với agent tự do.

### Phần 4 · Phân loại HS — cấu trúc tất định, LLM ở từng nút

| Bước | Ai làm | Ràng buộc cứng |
|---|---|---|
| B1 · mô tả/ảnh → **dữ kiện kỹ thuật có cấu trúc** (chất liệu, chức năng chính, nguyên lý, thành phần, dạng đóng gói) | LLM | Không được đoán mã. Mã HS người dùng mong muốn **không bao giờ** vào prompt này ([R4](../business-rules.md)). |
| B2 · chọn Phần/Chương ứng viên | vector trên chú giải + danh mục | Không phải LLM chọn |
| B3 · duyệt cây 4 số → 6 → 8 | LLM, mỗi cấp một lần | Chỉ được chọn trong tập **thật sự tồn tại** trong `hs_description`; mỗi lựa chọn phải **trích được một mệnh đề chú giải** làm căn cứ — không trích được thì nhánh bị loại |
| B4 · trả **top-3 nhóm** + chú giải nguyên văn + loại trừ đối chọi + thuế tra bằng luồng tất định | code | Hai nhánh đối chọi ngang nhau → gợi ý **xác định trước mã số theo Điều 28** ([R5](../business-rules.md): từ chối là thành công) |

Cộng thêm **kiểm toán tính nhất quán** trên 117 tờ khai của công ty: cùng mô tả hàng mà khác mã →
cảnh báo. Đây là chỗ AI thắng chắc, không có rủi ro khẳng định, và đúng kịch bản Polvita trong
[R3](../business-rules.md).

**Đánh đổi đã chấp nhận:** với CLI tuần tự, đường này mất **20–40s** mỗi lần phân loại. Bot đã có mẫu
"🔍 Đang xem ảnh…" nên chịu được. Nếu độ trễ này thành vấn đề, lối thoát duy nhất là xem lại ràng
buộc 1 (chuyển sang API trả phí) — không phải cắt bước bằng chứng.

### Phần 5 · Bốn cơ chế giữ chất lượng — bằng code, không bằng prompt

1. **Module `guards` dùng chung.** Mọi đầu ra LLM qua cổng kiểu: `id` ⊂ tập đã truy hồi; mã HS phải
   tồn tại trong danh mục; mọi con số phải đến từ DB. Gom `validateCitations`, `sanitizeLead`,
   `docNumberStatedIn` hiện có vào một chỗ, rồi mở rộng.
2. **Bắt buộc có bằng chứng.** Một khẳng định phân loại không trích được mệnh đề chú giải sẽ **tự
   động hạ xuống** "ứng viên chưa có căn cứ".
3. **Eval hồi quy trong CI.** Golden set 249 dòng + `legal-qa.json`. **Mỗi thay đổi prompt là một
   thay đổi phần mềm** và phải qua eval.
4. **`decision_log`.** Lưu (truy vấn → giả thuyết LLM → bằng chứng → kết quả cuối). Khi bot sai còn
   truy được sai ở nút nào; và đó là dữ liệu để tinh chỉnh về sau.

## Quyết định đã chốt

- **Không** thêm mức `auto_gated` (Phần 1.4). Giữ hai mức `verified` / `auto_unverified`.
- **Mốc M4**: top-3 ở nhóm 4 số **≥ 85%** trên golden set, và **100%** khẳng định phân loại có bằng
  chứng trích được. Mốc 85% đặt dưới 91,5% của DAW vì golden set của dự án là *thực tiễn quá khứ của
  công ty*, không phải ground truth pháp lý — xem [TASK-001](../planning/01-task-list.md).
- **WCO EN** không nằm trên đường tới hạn của bất kỳ mốc nào; cắm vào khi có license.

## Rủi ro đã biết

| Rủi ro | Cách chặn |
|---|---|
| Nới `MAX_DIST` làm tăng câu trả lời sai | Chỉ nới sau khi eval M0 có baseline; ngưỡng CI cấm tụt |
| Rerank LLM loại nhầm điều đúng | Rerank chỉ **sắp xếp lại và cắt**, không được thêm; điều bị cắt vẫn ghi vào `decision_log` |
| Bulk ingest kéo vào văn bản đã hết hiệu lực | Không đổi: mọi thứ tự nạp vào `auto_unverified` và mọi trích dẫn nói rõ |
| Job nền LLM chạm rate limit subscription | Chạy đêm, có checkpoint, tiếp tục được từ chỗ dừng |
| Mệnh đề chú giải bị LLM biên dịch sai | Mệnh đề chỉ để **lọc**; thứ hiển thị cho người đọc luôn là nguyên văn |

## Tiêu chí nghiệm thu theo mốc

| Mốc | Nghiệm thu (bằng số) |
|---|---|
| M0 | `yarn eval` chạy được và in baseline; `/health` báo đúng trạng thái LLM; kho nạp lại xong, 0 điều bị cắt đuôi tiêu đề trên mẫu kiểm tra ngẫu nhiên |
| M1 | Tỉ lệ "không tìm thấy văn bản" giảm **≥ 50%** trên bộ câu hỏi thật của chuyên viên |
| M2 | recall@5 tăng; tỉ lệ trả lời sai **không** tăng |
| M3 | **≥ 95%** nhóm 4 số có ít nhất một chú giải trích được |
| M4 | top-3 nhóm 4 số **≥ 85%**; 100% khẳng định có bằng chứng |

## Ngoài phạm vi

- Chuyển sang Claude API trả phí (đã bị loại ở ràng buộc 1).
- Làm mới dữ liệu biểu thuế (144/2024, 199/2025 mức từng dòng, RCEP, AJCEP/VJEPA) — việc thật và cấp
  thiết, nhưng là dữ liệu, không phải LLM; đi theo một nhánh riêng.
- Xác thực ở tầng ứng dụng cho API — nợ đã ghi, không thuộc kế hoạch này.
- Quyết định NĐ 134/2016 — vẫn chờ chủ dự án.

## Related Knowledge

- [Kho pháp luật tự mở rộng](legal-corpus-self-extension.md) — ba lớp mà Phần 1 mở rộng
- [Đánh giá](evaluation.md) — golden set và các cổng ship mà Phần 0 biến thành `yarn eval`
- [Truy xuất RAG pháp lý](../concepts/legal-rag-retrieval.md) — thiết kế truy hồi mà Phần 2 sửa
- [Phân loại mã HS](../concepts/hs-classification.md) — thứ tự GRI và thứ bậc thẩm quyền mà Phần 3/4 thi hành
- [Danh sách công việc mở rộng LLM](../planning/03-llm-expansion-tasks.md)
