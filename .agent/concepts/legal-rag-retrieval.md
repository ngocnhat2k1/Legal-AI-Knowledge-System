---
type: concept
status: future-phase
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../index.md
---

# Truy xuất RAG Pháp lý (Luật thành văn Việt Nam)

> **TRẠNG THÁI: GIAI ĐOẠN TƯƠNG LAI — KHÔNG XÂY DỰNG PHẦN NÀY TRONG v1.**
> v1 của Customs Assistant gồm (1) tra cứu thuế suất mang tính tất định và (2) gợi ý
> phương án ứng viên mã HS kèm bằng chứng là ghi chú pháp lý nguyên văn. Cả hai đều không cần RAG. Ghi chú này tồn tại chỉ
> để lưu giữ bằng chứng nghiên cứu khi còn mới, để khi RAG trên pháp luật logistics
> của Việt Nam thực sự được xác định phạm vi, các quyết định bắt đầu từ số liệu đo lường thay vì
> từ cảm tính. Không có gì ở đây cho phép triển khai công việc.

Tất cả các con số bên dưới đến từ báo cáo nghiên cứu 02 (đã xác minh 2026-07-17). Mỗi khẳng định đều mang theo
nguồn của nó. Ở những chỗ nghiên cứu đánh dấu điều gì đó là chưa xác minh hoặc còn tranh cãi, nó được tái hiện
dưới dạng một cảnh báo — xem [Chưa xác minh / Không được dựa vào](#chưa-xác-minh--không-được-dựa-vào).

---

## 1. Chunking: đánh chỉ mục theo từng Khoản, trả về Điều cha

**Quy tắc:** chia theo chính cấu trúc của văn bản. Đánh chỉ mục theo đơn vị con (Khoản), trả về
đơn vị cha (Điều). Không bao giờ dùng kích thước cố định.

**Bằng chứng** — "Chunking German Legal Code", Prior, Milanova & Schultz, ASAIL 2026
(đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2605.19806). Đây là phép loại suy cấu trúc
gần nhất hiện có với pháp luật Việt Nam: tiếng Đức `§` (Paragraph) ≈ **Điều**,
`Absatz` ≈ **Khoản**, `Satz` ≈ đại khái **Điểm**. Thiết lập: toàn bộ BGB (2.455 điều), 525
câu hỏi của người ngoài ngành với nhãn chuẩn ở cấp điều, gemini-embedding-001, 21 chiến lược.

Recall@10, đo ở cấp điều:

| Strategy | R@10 |
|---|---|
| **Subsection (≈Khoản)** | **0.47** |
| **Section (≈Điều)** | **0.46** |
| Sentence | 0.45 |
| Proposition | 0.44 |
| Contextual chunking (Anthropic-style, subsection) | 0.43 |
| RAPTOR / semantic cluster | ~0.40 |
| Lumber-style (LLM boundary prediction) | 0.37 |
| Fixed-size 32/8 (best fixed-size) | 0.37 |
| Fixed-size 256/64 (worst fixed-size) | 0.31 |

Thống kê được thực hiện đúng chuẩn: Friedman omnibus (p < 0.0001), rồi paired permutation
tests với hiệu chỉnh Holm, được xác nhận bằng một ablation top-25.

### VÌ SAO điều này quan trọng, và kết quả thực sự nói lên điều gì

Cách hiểu ngây thơ là "Khoản thắng, dùng Khoản." Đó **không** phải là phát hiện, và hành động dựa trên nó
lãng phí công sức vào sai trục.

**Kết quả then chốt: truy xuất theo cấu trúc tốt hơn đáng kể so với mọi
chiến lược phi cấu trúc, nhưng các đơn vị cấu trúc KHÔNG khác nhau đáng kể so với
nhau.** 0.47 vs 0.46 vs 0.45 vs 0.44 là nhiễu thống kê. 0.46 vs 0.31 thì không.

Vậy: **đừng vật vã giữa Điều vs Khoản.** Thứ mang toàn bộ hiệu ứng là
**không cắt ngang qua các ranh giới cấu trúc**. Một bộ chunk kích thước cố định cắt giữa Khoản,
tách một điều kiện khỏi hệ quả của nó và một ngoại lệ khỏi quy tắc của nó — và nó mất
~15 điểm recall vì điều đó. Bất kỳ agent tương lai nào bị cám dỗ "tinh chỉnh kích thước chunk" đang tối ưu một
chiều mà bằng chứng cho biết là phẳng, trong khi chiều thực sự quan trọng (tôn trọng
cấu trúc) đã là nhị phân và đã được quyết định.

### Bỏ qua chunking dựa trên LLM — một kết quả phủ định hữu ích

Phản xạ "quăng một LLM vào việc chunking" là sai một cách đo lường được ở đây:

| Method | Build time | R@10 |
|---|---|---|
| Section chunking | **51 seconds** | 0.46 |
| Contextual chunking | 38 minutes | 0.43 |
| RAPTOR | 3h – 5h51m | ~0.40 |
| Lumber (LLM boundary prediction) | 9h – 11h41m | 0.37 |

Chi phí build gấp 100–800× **để đổi lấy recall tệ hơn** (đã xác minh 2026-07-17, nguồn:
https://arxiv.org/pdf/2605.19806). Cấu trúc đã có sẵn trong văn bản; một LLM
suy diễn lại nó chỉ có thể thêm lỗi và độ trễ.

### Parent-child là nền tảng, không phải một lựa chọn

Đây là điểm tinh tế mà hầu hết các triển khai làm sai. **Cả 21 chiến lược trong nghiên cứu
đều đánh giá ở cấp điều cha.** Các chunk, lá và cụm được truy xuất *luôn luôn* được
ánh xạ trở lại về § cha của chúng và điểm số của chúng được lan truyền (top-100 đơn vị được đánh chỉ mục →
tổng hợp về cha → trả về top-10 điều). Truy xuất parent-child không phải là một lựa chọn thiết kế
trong số nhiều lựa chọn — nó là nền tảng được giả định của toàn bộ phép so sánh. **Câu hỏi
duy nhất còn để ngỏ là bạn đánh chỉ mục cái gì bên dưới nó.** Một tài liệu thiết kế tương lai trình bày
"parent-child vs flat" như một câu hỏi mở là đã đọc sai bằng chứng.

### Chunking là điều kiện cơ bản, không phải nơi quyết định thắng thua của RAG pháp lý

**Recall tuyệt đối chỉ ~0.47 ngay cả với chiến lược thắng cuộc** (đã xác minh 2026-07-17, nguồn:
https://arxiv.org/pdf/2605.19806). Hơn một nửa số điều chuẩn bị bỏ sót ở k=10 bởi
chiến lược tốt nhất. Hãy làm chunking cho đúng một cách rẻ (51 giây chia theo cấu trúc), rồi dồn
công sức vào nơi còn dư địa: truy xuất, reranking, và lọc theo cấu trúc/thời gian.

---

## 2. Sự không khớp truy xuất ở cấp tài liệu (DRM)

**Thất bại:** bộ truy xuất trả về một chunk trông đúng chủ đề hoàn hảo nhưng đến từ
**hoàn toàn sai văn bản nguồn**. Văn bản pháp luật dư thừa về từ vựng và gần như giống hệt về cấu trúc
qua các văn bản, nên embedding có rất ít cơ sở để phân biệt chúng.

**Đo được: tỷ lệ DRM vượt 95% trên một số tập dữ liệu** (đã xác minh 2026-07-17, nguồn:
https://arxiv.org/html/2510.06999v1).

**Vì sao điều này nghiêm trọng ở Việt Nam:** "Điều 5. Giải thích từ ngữ" tồn tại trong hàng trăm văn bản
và gần như giống hệt nhau về câu chữ giữa chúng. Một truy vấn về một thuật ngữ đã định nghĩa sẽ khớp với hàng chục
điều định nghĩa mà chỉ sai về xuất xứ — chính là điều mà dense embedding
không thể thấy và chính là điều quyết định câu trả lời pháp lý.

**Cách khắc phục — Summary-Augmented Chunking (SAC):** thêm vào đầu một bản tóm tắt cấp văn bản
~150 ký tự cho mỗi chunk trước khi embedding. **Giảm DRM xuống còn khoảng một nửa.** Rẻ (một bản tóm tắt cho mỗi
văn bản, không phải cho mỗi chunk) và mở rộng được với một corpus thay đổi. Trái với trực giác, **bản tóm tắt chung
đánh bại bản tóm tắt do chuyên gia hướng dẫn** (đã xác minh 2026-07-17, nguồn:
https://arxiv.org/html/2510.06999v1).

**⚠️ Loại phần tiền tố SAC khỏi chỉ mục BM25.** Xem điểm dữ liệu phản biện trong
[Chưa xác minh / Không được dựa vào](#chưa-xác-minh--không-được-dựa-vào) — BM25 bám vào bản tóm tắt được thêm vào đầu
thay vì phần thân chunk, cải thiện độ chính xác ở cấp văn bản nhưng *làm giảm*
precision/recall ở cấp văn bản chữ.

---

## 3. ⚠️ Điều phản trực giác: BM25 vượt dense ngây thơ trên văn bản pháp luật tiếng Việt

Hai kết quả đã công bố chỉ về hai hướng ngược nhau. Cả hai đều có thật. Hiểu được vì sao mới là toàn bộ
bài học.

**Phía A — BM25 nghiền nát dense out-of-the-box** (SBV-LawGraph, ACIIDS 2026, trên ALQAC2025;
đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf):

- BM25 R@1 = **0.57**
- Naive dense RAG (`paraphrase-vietnamese-law`, không rerank) R@1 = **0.36**
- "AdvancedRAG" hybrid của họ đặt trọng số **75% BM25 / 25% semantic**

**Phía B — dense đã fine-tune tiêu diệt BM25** (TVPL; đã xác minh 2026-07-17, nguồn:
https://arxiv.org/html/2412.00657v1):

- BM25 MRR@10 = **21.60**
- ColBERT đã fine-tune = **74.61**; bi-encoder đã fine-tune = **70.69**
- **nhưng chỉ sau khi fine-tune theo miền trên 507K truy vấn tổng hợp**

Và một điểm thứ ba: hybrid ở **50/50** với bi-encoder BKAI → R@1 **0.86**, R@10
**0.98** (2.081 câu hỏi / 1.29M điều; đã xác minh 2026-07-17, nguồn:
https://arxiv.org/html/2409.13699v1).

### Sự dung hòa — đây là quy tắc bền vững

Đây **không** mâu thuẫn. Chúng là cùng một phát hiện nhìn từ hai phía: tỷ lệ trọng số
BM25:dense là một hàm của mức độ thích ứng tốt của embedding model của bạn.

- Embedding chung / được thích ứng nhẹ → đặt trọng số BM25 nặng (~75/25).
- Embedding được fine-tune đúng cách trong miền → dense có thể dẫn dắt, và hybrid dịch về phía 50/50.

**Đừng sao chép một tỷ lệ trọng số từ một bài báo mà bạn không dùng embedding model của nó.** Tỷ lệ
này không phải là thuộc tính của văn bản pháp luật; nó là thuộc tính của sự ghép cặp giữa model của bạn với
corpus của bạn. Một agent tương lai hardcode 75/25 sau khi fine-tune, hay 50/50 trước khi fine-tune, đã
sao chép con số mà bỏ lỡ phát hiện.

### VÌ SAO BM25 mạnh về mặt cấu trúc ở đây

Truy xuất pháp luật xoay quanh các thuật ngữ chuyên môn chính xác và các chuỗi trích dẫn — "Điều 12",
"Nghị định 168/2024/NĐ-CP", "Thông tư 23/2025/TT-NHNN" — vốn phải khớp *chính xác*. Dense
embedding làm mờ đúng những token mang trọng lượng pháp lý quyết định.

Ví dụ tiếng Đức làm điều này không thể bỏ qua: **`unverzüglich` ("không chậm trễ vô lý") vs
`sofort` ("ngay lập tức")** gần như giống hệt nhau trong không gian embedding nhưng khác nhau về pháp lý
(đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2605.19806).

Những tương đương tiếng Việt mà dự án này sẽ gặp:

- **"có thể" (may) vs "phải" (must)** — sự khác biệt giữa một quyền tùy nghi và một nghĩa vụ
- **"trong thời hạn" (within the period) vs "chậm nhất" (no later than)**

Một bộ truy xuất chỉ dựa vào ngữ nghĩa coi những cụm này là đồng nghĩa. Một cán bộ hải quan thì không.

### Reranking có cơ sở vững chắc

RRF fusion → cross-encoder rerank, dùng **ViRanker** + **BAAI/bge-reranker-v2-m3**
(đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).
LegalBench-RAG cũng phát hiện bằng thực nghiệm rằng reranking vượt trội (đã xác minh 2026-07-17, nguồn:
https://arxiv.org/html/2408.10343v1).

---

## 4. Mô hình embedding — tiêu đề trung thực là một khoảng trống

**KHÔNG có phép so sánh trực tiếp đã công bố nào giữa OpenAI `text-embedding-3-large` vs Voyage vs
các model chuyên biệt cho tiếng Việt trên văn bản pháp luật tiếng Việt.** Mọi bài báo pháp luật tiếng Việt tìm được đều
benchmark chỉ trên các model open-source / tiếng Việt và cố tình bỏ qua OpenAI (đã xác minh
2026-07-17, nguồn: https://arxiv.org/pdf/2507.14619). Benchmark duy nhất có so sánh
model thương mại với open-source trên truy xuất tiếng Việt thì **bị tường phí** — phương pháp thì thấy được,
kết quả thì không (đã xác minh 2026-07-17, nguồn:
https://nqbao.medium.com/benchmarking-text-embedding-models-for-vietnamese-retrieval-tasks-3c4342e0ff9d).

**Đây là một khoảng trống thực sự mà dự án này có thể phải tự lấp bằng eval của chính mình.** Nếu
quyết định model-thương-mại-vs-model-tiếng-Việt trở thành yếu tố then chốt, hãy dự trù cho việc chạy
benchmark, không phải cho việc đọc một cái. **TVPL + MTEB là bộ khung có sẵn.**

### Các mô hình thực sự được dùng bởi các hệ thống pháp lý Việt Nam đã công bố

| Model | Used by | Note |
|---|---|---|
| `bkai-foundation-models/vietnamese-bi-encoder` | https://arxiv.org/html/2409.13699v1, https://arxiv.org/pdf/2507.14619 | Mặc định trên thực tế. **Giới hạn 256 token** (dựa trên PhoBERT) |
| `minhquan6203/paraphrase-vietnamese-law-embedding` | SBV-LawGraph | Fine-tune từ `paraphrase-multilingual-mpnet-base-v2` trên ViLQA + ALQAC2024; 768 chiều |
| BGE-M3, mE5-base, vietnamese-sbert | https://arxiv.org/html/2412.00657v1 baselines | Bị đánh bại bởi bi-encoder / ColBERT đã fine-tune |

(tất cả đã xác minh 2026-07-17)

**Giới hạn 256 token** của các model họ PhoBERT là một ràng buộc kiến trúc
*buộc* phải chunk dưới cấp Điều — điều tình cờ đồng thuận với §1, nên nó không tốn gì thêm ở đây. Nó
có nghĩa là *embedding* ở cấp Điều đối với các điều dài đòi hỏi một model ngữ cảnh dài
(BGE-M3 ở mức 8192, hoặc một API thương mại) — và khi đó bạn lại rơi vào khoảng trống benchmark ở trên.

### ⚠️ Truy xuất ≠ reranking — đừng chọn mô hình từ bảng xếp hạng sai

Từ phép so sánh embedding tiếng Việt tổng quát sạch sẽ nhất (đã xác minh 2026-07-17, nguồn:
https://arxiv.org/pdf/2503.07470):

- **Reranking** (mAP, ViRerank): sup-SimCSE-VietNamese-phobert-base **69.46** > 67.86 > sbert 66.9 > bi-encoder 65.41
- **Retrieval** (acc, ViMedRetrieve@20): **bi-encoder 0.73** > 0.50 > sbert 0.32 > **sup-SimCSE 0.12**

`sup-SimCSE-VietNamese-phobert-base` **tốt nhất ở reranking và tệ nhất một cách thảm họa ở
retrieval — 0.12 vs 0.73**. Đó là một khoảng cách 6× theo hướng sai. **Đừng chọn một
embedding model tiếng Việt từ một bảng xếp hạng reranking cho một công việc retrieval.** Các tác vụ này
thưởng cho các dạng hình học đối lập nhau; một thứ hạng trên bảng xếp hạng là vô nghĩa nếu tách khỏi tác vụ của nó.

### Fine-tuning là đòn bẩy có tác động lớn nhất

Lớn hơn việc chọn model. **MRR@10 21.6 (BM25) → ~74 (dense đã fine-tune)** (đã xác minh
2026-07-17, nguồn: https://arxiv.org/html/2412.00657v1). **Semi-hard negative mining**
cụ thể là thứ thúc đẩy điều này (đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2507.14619).
**Tạo truy vấn tổng hợp trên các đoạn văn bản quy phạm là một công thức đã được chứng minh** để chế tạo
dữ liệu huấn luyện (Llama3-70B, 507K truy vấn).

Nếu công sức khan hiếm, hãy dồn vào fine-tuning trước khi dồn vào việc đi tìm model.

### Tách từ tiếng Việt gắn chặt với mô hình, không phải lựa chọn tự do

Tiếng Việt không có ranh giới từ tường minh. **Các model họ PhoBERT được pretrain trên
văn bản đã tách từ, nên bạn PHẢI tách từ khi suy luận để khớp với pretraining.** Các công cụ đang được dùng:

- **RDRSegmenter / VnCoreNLP** — được chọn một cách rõ ràng "vì tập dữ liệu gốc dùng để huấn luyện model BKAI đã dùng phương pháp tách từ này" (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2409.13699v1)
- **Underthesea** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/html/2412.00657v1)
- **PyVi** (đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2507.14619)

**Bộ tách từ phải khớp với pretraining của embedding model của bạn.** Nó là một phụ thuộc của
model, không phải một sở thích. Tách từ, dấu thanh và biến thể vùng miền đều làm suy giảm
chất lượng embedding tiếng Việt khi không khớp (đã xác minh 2026-07-17, nguồn:
https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).

---

## 5. Hiệu lực theo thời gian phải là BỘ LỌC CỨNG, không phải tín hiệu xếp hạng

**Đây là một chế độ thất bại đã đo được, không phải một lo lắng lý thuyết.**

"Asking For An Old Friend: Diagnosing and Mitigating Temporal Failure Modes in LLM-based
Statutory Question Answering" — 312 cặp QA quy phạm tiếng Đức đã được kiểm định, năm LLM lớn
(đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2605.23497). Hai chế độ thất bại **riêng biệt**:

1. **Áp dụng quy tắc lỗi thời** sau khi pháp luật thay đổi — sự cũ kỹ do mốc cắt huấn luyện.
2. **Ưa chuộng quy định mới hơn ngay cả khi phiên bản cũ mới là cái áp dụng** — một **thiên kiến ưa mới
   mà chỉ riêng RAG không sửa được.**

Chế độ 2 là lý do vì sao đây phải là một bộ lọc. Việc truy xuất chỉ *đưa ra* quy định đúng niên đại
bên cạnh một quy định mới hơn sẽ thua: model dù sao cũng ưa cái mới hơn. **Các cách tiếp cận truy xuất
coi tính hiệu lực thời gian là một ràng buộc cứng cải thiện hiệu năng đáng kể.**

**Chỉ thị thiết kế:** trích xuất ngày as-of từ truy vấn, rồi **LỌC tập phương án ứng viên**
trước khi xếp hạng. Đừng hy vọng bộ rerank sắp xếp được — phép đo cho biết nó không làm được.

### Mô hình dữ liệu song thời gian — SAT-Graph

Model công khai phát triển nhất là SAT-Graph RAG (nghiên cứu tình huống Hiến pháp Brazil;
đã xác minh 2026-07-17, nguồn: https://arxiv.org/abs/2505.00039). Lấy cảm hứng từ LRMoo: một
**Work** trừu tượng vs các **Expression** có phiên bản.

- **Components** (Titles / Chapters / **Articles**) tạo thành khung xương của đồ thị, được suy ra từ
  **cấu trúc nội tại của văn bản — rõ ràng KHÔNG phải trích xuất thực thể bằng LLM.** (Cùng bài học với
  §1: cấu trúc đã có sẵn ở đó; suy ra nó bằng một LLM chỉ thêm lỗi.)
- **Component Temporal Versions (CTV)** — được đóng dấu ngày với các khoảng hiệu lực.
- Truy vấn tại một thời điểm là một **vị từ khoảng mang tính tất định**:
  `tv.valid_start ≤ t < coalesce(tv.valid_end, +∞)`.

**Mẹo hiệu quả đáng học hỏi:** một CTV cha mới ở ngày Dₙ là một **PHÉP TỔNG HỢP
tái sử dụng các CTV hiện có của các con không thay đổi.** Bạn không nhân bản toàn bộ Luật ở
mỗi lần sửa đổi — chỉ các thành phần thay đổi mới có phiên bản mới. Không có điều này, việc quản lý phiên bản của một Luật
bị sửa đổi thường xuyên nhân bội dung lượng lưu trữ và biến mỗi lần đọc thành một bản sao toàn cây.

**Những cảnh báo trung thực (hãy tái hiện chúng, đừng tẩy trắng chúng):**

- Bất chấp cách đóng khung, SAT-Graph chỉ triển khai **valid time, không phải true bitemporality thực sự.**
- Nó **KHÔNG báo cáo đánh giá định lượng nào.** Đó là một đề xuất kiến trúc, không phải một
  kết quả thực nghiệm. **Hãy áp dụng model dữ liệu; đừng trích dẫn nó như bằng chứng về hiệu năng.**

---

## 6. Tham chiếu chéo — loại ngầm định mới là ca khó

Phân loại (đã xác minh 2026-07-17, nguồn: https://arxiv.org/pdf/2605.19806):

- **Explicit (tường minh)** — một đích được nêu tên ("theo quy định tại Điều 12 của Luật này"). Phân tích được.
- **Implicit (ngầm)** — được viện dẫn qua **thuật ngữ**, không phải trích dẫn. Dùng từ "người tiêu dùng"
  ngầm định giả thiết điều định nghĩa. **Đây là cái khó: không parser nào tìm ra nó**,
  và nó tràn lan trong pháp luật Việt Nam qua các điều "Giải thích từ ngữ".
- **Nội bộ vs bên ngoài** (trong Luật này vs một văn bản khác).
- **Nội bộ trong điều** (Khoản → Khoản trong cùng một Điều).

**SAT-Graph rõ ràng KHÔNG giải quyết việc phân giải tham chiếu chéo** (đã xác minh 2026-07-17,
nguồn: https://arxiv.org/abs/2505.00039). Chỉ riêng cấu trúc không bao phủ được điều này.

**SBV-LawGraph là hệ thống duy nhất giải quyết nó một cách thực nghiệm trên pháp luật Việt Nam** (đã xác minh
2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf):

- **4 loại quan hệ:** Sửa đổi/Bổ sung, Bãi bỏ, Thay thế, Hướng dẫn/Quy định (loại cuối cùng là
  hệ thống phân cấp Luật → Nghị định → Thông tư của Việt Nam)
- Được trích xuất bằng **gpt-oss-120b few-shot**, lưu trong **Neo4j**
- Duyệt **1 hop** vào/ra từ các thực thể truy vấn

Hãy chú ý sự khiêm tốn của điều đó: bốn loại quan hệ, một hop. Đây là trình độ tiên tiến nhất trên
pháp luật Việt Nam, không phải một điểm xuất phát để cải tiến một cách hời hợt.

---

## 7. Hallucination — hãy neo kỳ vọng ở đây

Nguồn có tính quyết định: Magesh, Surani, Dahl, Suzgun, Manning & Ho, "Hallucination-Free?
Assessing the Reliability of Leading AI Legal Research Tools", *Journal of Empirical Legal
Studies* 2025 — đánh giá **được preregister đầu tiên**, 202 truy vấn, được chuyên gia chấm điểm
(đã xác minh 2026-07-17, nguồn: https://doi.org/10.1111/jels.12413 ·
https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf).

| System | Result |
|---|---|
| Lexis+ AI | 65% chính xác; **hallucinate >17%** |
| Westlaw AI-Assisted Research | 42% chính xác; **hallucinate >34%** |
| Ask Practical Law AI | trong dải hallucinate 17–33% |
| GPT-4 (no RAG) | ~43% hallucinate |

Đây là các sản phẩm legal-RAG thương mại với corpus án lệ đầy đủ, được xây bởi các công ty mà
đây là công việc cốt lõi. Đối lập với chúng là các tuyên bố của nhà cung cấp về "trích dẫn pháp lý liên kết
không hallucinate" (LexisNexis) và RAG "giảm mạnh hallucinate xuống gần như bằng không"
(Thomson Reuters). **Đây là những con số để neo kỳ vọng của các bên liên quan.**

### ⚠️ Ví dụ Wilgarten là cốt lõi khái niệm

Khi được hỏi ý kiến của **"Luther A. Wilgarten", một thẩm phán hư cấu**, Lexis+ AI trả về một
**vụ án có thật với một trích dẫn có thật, được định dạng đúng** — một vụ án không do vị thẩm phán không tồn tại đó viết. Câu chữ của bài báo: *"không hallucinate theo nghĩa hẹp."*

**⚠️ Do đó "mọi trích dẫn đều phân giải về một văn bản có thật" là một bảo đảm VÔ GIÁ TRỊ.** Nó
đúng là bảo đảm mà các nhà cung cấp tiếp thị và đúng là cái thất bại. Một bộ kiểm định số Điều
mang lại sự an tâm giả: nó sẽ cho qua mọi Wilgarten.

**Việc kiểm tra tính grounding phải xác minh rằng quy định được trích dẫn HỖ TRỢ mệnh đề
được khẳng định** — không phải rằng nó tồn tại.

Đây cũng là lý do vì sao v1 hiển thị **bằng chứng là ghi chú pháp lý nguyên văn** bên cạnh các phương án HS và để một
con người quyết định. Văn bản nguyên văn không thể không-hallucinate-theo-nghĩa-hẹp; hoặc là các
từ ngữ hỗ trợ việc phân loại hoặc chúng hiển nhiên không.

### Từ chối trả lời như một đầu ra hạng nhất

Algorithm 2 của SBV-LawGraph là một bản thiết kế dùng được (đã xác minh 2026-07-17, nguồn:
https://lexuanbach.github.io/publication/ACIIDS2026a.pdf):

- **Sau sinh (post-generation):** `if ¬HasCitations(a) or EvidenceMismatch(a, D, G) → return Unknown Answer`
- **Cổng trước sinh (pre-generation gate):** nếu không chunk nào vượt ngưỡng tương đồng (cosine **0.9**,
  top-k **5**), **từ chối trước khi sinh.**

"Unknown Answer" là một đầu ra được hỗ trợ, không phải một thất bại. Một hệ thống luôn trả lời sẽ
luôn sai 17–34% số lần và không bao giờ cho bạn biết lần nào.

### Giữ ngữ cảnh truy xuất NHỎ

Legal RAG dễ tổn thương với **"lost in the middle"** — nhồi 20 Điều vào ngữ cảnh
**chủ động làm suy giảm tính trung thành** (đã xác minh 2026-07-17, nguồn:
https://arxiv.org/pdf/2605.19806). Điều này ủng hộ **reranking mạnh mẽ + top-k thấp**
(SBV dùng k=5), **không phải** "truy xuất nhiều hơn cho chắc." Bản năng mở rộng lưới khi
không chắc chắn làm câu trả lời tệ hơn, không chỉ đơn thuần chậm hơn.

### Dữ liệu huấn luyện lấn át ngữ cảnh truy xuất

Một chế độ thất bại được nêu tên: *"LLM có thể đã được huấn luyện trên một khối lượng văn bản lớn hơn nhiều
ủng hộ quy tắc áp dụng rộng rãi và có thể trung thành với dữ liệu huấn luyện của nó hơn là với
ngữ cảnh truy xuất"* (đã xác minh 2026-07-17, nguồn:
https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf).

**Liên quan trực tiếp đến dự án này:** một ngoại lệ hẹp của Việt Nam trong một **Thông tư** so với
quy tắc chung trong **Luật**. Quy tắc chung có ở khắp nơi trong dữ liệu huấn luyện; ngoại lệ
nằm trong một văn bản bạn đã truy xuất. Model sẽ có xu hướng trả lời bằng quy tắc chung
ngay cả khi đang trích dẫn ngoại lệ.

### Các chế độ lỗi khác được nêu tên

| # | Failure mode | Evidence |
|---|---|---|
| 1 | **Document-Level Retrieval Mismatch** — chunk trông đúng, sai văn bản | >95% trên một số tập dữ liệu (https://arxiv.org/html/2510.06999v1) |
| 2 | **Lỗi thời gian (temporal anachronism)** — áp dụng luật đã bãi bỏ / chưa có hiệu lực | https://arxiv.org/abs/2605.23497 |
| 3 | **Thiên kiến ưa mới** — ưa quy định mới hơn khi cái cũ mới áp dụng; sống sót qua naive RAG | https://arxiv.org/abs/2605.23497 |
| 4 | **Grounding chỉ theo nghĩa hẹp** — trích dẫn có thật, mệnh đề không được hỗ trợ | Magesh et al. (Wilgarten) |
| 5 | **Liên quan về câu chữ ≠ liên quan về pháp lý** — đúng từ, sai thẩm quyền / điều kiện / thứ bậc | Magesh et al. §3.2 |
| 6 | **Dữ liệu huấn luyện lấn át ngữ cảnh truy xuất** | Magesh et al. |
| 7 | **Tham chiếu chéo ngầm** — thuật ngữ ngầm viện dẫn các định nghĩa | https://arxiv.org/pdf/2605.19806 |
| 8 | **Làm mờ ngữ nghĩa trên các token quyết định** — `unverzüglich`/`sofort`; "có thể"/"phải" | https://arxiv.org/pdf/2605.19806 |
| 9 | **Lost-in-the-middle** do truy xuất quá mức | https://arxiv.org/pdf/2605.19806 |

(tất cả đã xác minh 2026-07-17)

---

## 8. Đánh giá

**Đánh giá truy xuất tách biệt với sinh (generation).** Một điểm số gộp không thể cho bạn biết liệu một
câu trả lời sai đến từ một quy định bị bỏ sót hay một quy định bị đọc sai, và cách sửa là khác nhau.

**LegalBench-RAG** (Pipitone & Alami) — 6.858 cặp QA / 79M ký tự — chấm điểm theo **chỉ số tệp + chỉ số
ký tự chính xác**, buộc phải **precision ở khoảng nhỏ nhất** thay vì "văn bản đúng nằm đâu đó
trong top 10." Đó là kỷ luật mà trích dẫn pháp lý đòi hỏi (đã xác minh
2026-07-17, nguồn: https://arxiv.org/html/2408.10343v1).
**Cảnh báo: corpus của nó là hợp đồng và chính sách quyền riêng tư (CUAD/MAUD/ContractNLI/PrivacyQA),
không phải văn bản quy phạm. Phương pháp thì chuyển giao được; các phát hiện thì có thể không.**

**Các benchmark tiếng Việt hiện có** (tất cả đã xác minh 2026-07-17):

- **ALQAC 2025** (Automated Legal Question Answering Competition) — venue pháp luật tiếng Việt chính
- **TVPL** — **224.006 đoạn, 165.334 truy vấn train / 10.000 truy vấn test**, từ thuvienphapluat.vn. **Benchmark truy xuất pháp luật tiếng Việt công khai lớn nhất** (nguồn: https://arxiv.org/html/2412.00657v1)
- **Zalo Legal Text Retrieval 2021** — 61.425 đoạn

**Metric:** Recall@k / Precision@k / MRR / **F2@k**. Dùng **F2@k** — nó đặt trọng số theo recall,
đúng là bản năng đúng cho công việc pháp lý, nơi **bỏ sót một quy định áp dụng được thì tệ hơn
là đưa ra thừa một quy định** (đã xác minh 2026-07-17, nguồn:
https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).

**Tính đúng theo kiểu hội (conjunctive correctness).** Một câu trả lời được tính là đúng chỉ khi **(i)** nó tương đương về ngữ nghĩa
với câu trả lời chuẩn, **(ii)** nó chứa ≥1 trích dẫn pháp lý, **và** **(iii)** các
trích dẫn **hợp lệ VÀ liên quan**. Điều kiện (iii) là sự hiện thực hóa của
bài học Wilgarten — chỉ riêng tính hợp lệ là cái thất bại.

**Preregister (đăng ký trước).** Đây là đóng góp phương pháp luận cốt lõi của Magesh et al.: lĩnh vực này đầy rẫy
các tuyên bố của nhà cung cấp không sống sót khi va chạm với một quy trình được preregister. Quyết định
metric sau khi thấy số liệu là cách mà "gần như không hallucinate" được công bố.

### Các con số tham chiếu (SBV-LawGraph, luật thành văn Việt Nam)

| Model | ALQAC R@1 | ALQAC R@10 | SBV R@1 | SBV R@10 |
|---|---|---|---|---|
| BM25 | 0.57 | 0.74 | 0.38 | 0.65 |
| Naive RAG (dense) | 0.36 | 0.58 | 0.32 | 0.61 |
| Advanced RAG (75/25 hybrid) | 0.57 | 0.74 | 0.40 | 0.67 |
| **SBV-LawGraph (hybrid + rerank + KG)** | **0.69** | **0.77** | **0.49** | **0.76** |

(đã xác minh 2026-07-17, nguồn: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)

Nó cũng đánh bại GPT-5 và Gemini 2.5 Pro zero-shot có truy xuất web về tính đúng, trích dẫn
và tính nhất quán pháp lý.

**⚠️ Những cảnh báo mà chính các tác giả liệt kê — hãy coi các con số này là mang tính định hướng, không
phải dứt khoát:**

- Tập eval SBV nhỏ: **100 cặp QA**
- **Không có ablation tách bạch SBV-LR vs SBV-RR** — nên đóng góp độc lập của knowledge graph
  là **chưa được chứng minh**
- **Không có kiểm toán chất lượng KG**
- Tính đúng nhị phân chỉ với **2 người chú thích** và **không báo cáo mức đồng thuận giữa các người chú thích**

---

## Kết luận cốt lõi (cho bất cứ khi nào giai đoạn này thực sự được xác định phạm vi)

1. **Chunk theo cấu trúc — đánh chỉ mục theo Khoản, trả về Điều cha.** Không bao giờ dùng kích thước cố định. Bỏ qua chunking dựa trên LLM: recall tệ hơn với chi phí build gấp 100–800×.
2. **Thêm định danh/tiêu đề văn bản vào đầu mỗi chunk (kiểu SAC)** — DRM là thất bại truy xuất hàng đầu và cách này giảm nó còn một nửa. **Loại tiền tố khỏi chỉ mục BM25.**
3. **Hybrid BM25 + dense + cross-encoder rerank.** Bắt đầu ~75/25 nghiêng về BM25 với một embedding model chung; dịch về phía dense **chỉ sau khi** fine-tune trong miền.
4. **Fine-tune embedding model trên các truy vấn pháp luật tiếng Việt tổng hợp với semi-hard negative** — hành động đơn lẻ có đòn bẩy cao nhất (MRR@10 21.6 → ~74). Tách từ bằng tokenizer khớp với pretraining của model.
5. **Mô hình hóa valid-time một cách rõ ràng và lọc như một ràng buộc cứng,** không phải một tín hiệu xếp hạng. Tái sử dụng CTV của các con không thay đổi.
6. **Ground trích dẫn theo entailment, không theo tồn tại.** Từ chối khi bằng chứng mỏng. Giữ top-k thấp.
7. **Benchmark trên ALQAC 2025 / TVPL với precision ở cấp khoảng, F2, và tính đúng theo kiểu hội. Preregister.**

---

## Chưa xác minh / Không được dựa vào

Tái hiện nguyên văn về mặt tinh thần từ chính các cảnh báo của nghiên cứu 02. Đừng nâng cấp những điều này thành
các khẳng định chắc chắn.

- **SAT-Graph (https://arxiv.org/abs/2505.00039) KHÔNG báo cáo đánh giá định lượng nào** và chỉ triển khai **valid time, không phải true bitemporality thực sự**, bất chấp cách đóng khung của nó. Hãy áp dụng model dữ liệu; đừng bao giờ trích dẫn nó như bằng chứng về hiệu năng.
- **Điểm dữ liệu phản biện về hybrid search [nghiên cứu đơn]:** https://arxiv.org/html/2510.06999v1 phát hiện hybrid BM25+dense *cải thiện* độ chính xác ở cấp văn bản (DRM) nhưng **làm giảm precision/recall ở cấp văn bản chữ** so với dense thuần — vì BM25 bám vào bản tóm tắt SAC được thêm vào đầu thay vì phần thân chunk. **Cảnh báo: corpus hợp đồng/NDA (LegalBench-RAG), không phải văn bản quy phạm, và đó là một hiệu ứng tương tác riêng với SAC.** Giảm thiểu: loại tiền tố SAC khỏi chỉ mục BM25.
- **"Faithful Passage Grounding"** — một cross-encoder chấm điểm liệu mỗi khẳng định có được suy ra (entailed) từ đoạn được trích dẫn của nó hay không, được báo cáo là loại bỏ **63%** trích dẫn hallucinate trên án lệ. **Nhà nghiên cứu có được điều này chỉ từ các đoạn trích tìm kiếm và không xác minh nguồn gốc.** Đừng dựa vào con số 63%.
- **Grounding theo đồ thị trích dẫn — https://arxiv.org/html/2606.00898** ("Citation Grounding: Detecting and Reducing LLM Citation Hallucinations via Legal Citation Graphs"). **Chỉ có đoạn trích; chưa được fetch. Chưa xác minh.**
- **https://arxiv.org/pdf/2606.21155** ("Who Checks the Citations?") — **chưa xác minh.**
- **VLegal-Bench** — một benchmark *suy luận* pháp luật tiếng Việt (Dec 2025). **Chỉ có đoạn trích, chưa xác minh.**
- **Phép so sánh embedding thương-mại-vs-tiếng-Việt không tồn tại trong tài liệu công khai.** Benchmark duy nhất so sánh chúng trên truy xuất tiếng Việt thì **bị tường phí** (kết quả không thấy được). Bất kỳ khẳng định nào rằng OpenAI/Voyage có hay không đánh bại `bkai-foundation-models/vietnamese-bi-encoder` trên văn bản pháp luật tiếng Việt hiện đều **không được bằng chứng hỗ trợ theo cả hai hướng.** Dự án này sẽ phải chạy eval của riêng mình.
- **Ràng buộc 256 token của PhoBERT buộc chunk dưới cấp Điều** được nhà nghiên cứu đánh dấu là **mang tính suy đoán** — một suy diễn, không phải một kết quả đo được. Nó tình cờ đồng thuận với phát hiện chunking đo được, nên tuân theo không tốn gì, nhưng nó không được chứng cứ độc lập.
- **Ghi chú phương pháp của nghiên cứu 02:** một bản tóm tắt PDF một-lượt của https://arxiv.org/abs/2605.23497 **đã hallucinate một hệ thống giả ("LLMaaJ") và bịa ra các biện pháp giảm thiểu**; nội dung thật đến từ trang abstract. **Hãy nghi ngờ các bản tóm tắt PDF một-lượt của bài báo đó** — kể cả của bất kỳ agent tương lai nào.
- **Ranh giới ý nghĩa thống kê:** nghiên cứu chunking tiếng Đức xác lập rằng cấu trúc > phi cấu trúc. Nó **KHÔNG** xác lập rằng Khoản > Điều. Bất kỳ ghi chú hay tài liệu thiết kế tương lai nào khẳng định Khoản *tốt hơn* Điều là đọc quá mức nguồn.

---

## Kiến thức liên quan

- [Bối cảnh dự án](../project-context.md) — Customs Assistant là gì, phạm vi v1, và vì sao RAG nằm ngoài phạm vi cho v1
- [Quy tắc nghiệp vụ](../business-rules.md) — các quy tắc chính sách và kiểm định bền vững
- [Chỉ mục bộ nhớ tác nhân](../index.md) — bản đồ bộ nhớ dự án bền vững
- [Quy tắc tác nhân](../AGENTS.md) — các quy ước tài liệu và ghi chú mà file này tuân theo
