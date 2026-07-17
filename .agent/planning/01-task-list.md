---
type: planning
status: active
updated: 2026-07-17
related:
  - 00-bootstrap.md
  - ../project-context.md
  - ../concepts/tariff-system.md
  - ../concepts/data-sources.md
  - ../concepts/hs-classification.md
  - ../docs/code-organization.md
---

# Danh sách công việc — Giai đoạn 0 và Giai đoạn 1

## Mục tiêu hiện tại

Cung cấp một công cụ tra cứu thuế suất mà bộ phận khai báo có thể tin tưởng: với HS + xuất xứ + ngày, trả về thuế suất, nghị định điều chỉnh, ngày hiệu lực (as-of), và các điều kiện. Không có AI trong đó.

Phạm vi của ghi chú này: Giai đoạn 0 (Nền tảng) và Giai đoạn 1 (Tra cứu thuế suất). Giai đoạn 2 trở đi được vạch lộ trình trong [00-bootstrap.md](00-bootstrap.md) và sẽ có danh sách công việc riêng khi Giai đoạn 1 hoàn tất.

## Chú giải trạng thái

- `todo`: Chưa bắt đầu.
- `doing`: Đang thực hiện.
- `done`: Đã hoàn thành.
- `blocked`: Đang chờ một quyết định hoặc thiếu đầu vào.

---

## TASK-001: Xây dựng bộ golden set

Status: todo

**Công việc này đến trước tiên. Trước repo, trước parser, trước bất kỳ đoạn mã truy xuất nào.**

Mục tiêu: 30–50 câu hỏi thực tế từ chính các tờ khai đã nộp trước đây của chủ sở hữu, với đáp án đã biết là đúng, được ghi lại trước khi ta xây dựng bất cứ thứ gì có thể được tinh chỉnh để vượt qua chúng.

Vì sao đến trước: một bộ golden set viết sau khi mã đã tồn tại là đo mã dựa trên chính nó. Parser sơ khai của research 12 báo cáo **thành công 94% trong khi trả về thuế xuất khẩu cho các truy vấn nhập khẩu** — 1.520 mã HS xuất hiện ở cả Phụ lục I và Phụ lục II của Nghị định 26/2023/NĐ-CP, và 1.329 mã trong số đó có thuế suất khác nhau (đã xác minh 2026-07-17, nguồn: research 12). Parser đó lẽ ra đã vượt qua bất kỳ bộ kiểm thử nào do chính người viết ra nó soạn thảo. Bộ golden set là tạo phẩm duy nhất trong dự án này không nằm ở hạ nguồn của các giả định của chính ta, và nó chỉ đáng tin cậy nếu nó có trước các giả định đó.

Đầu ra kỳ vọng:

- 30–50 mục, mỗi mục: mô tả hàng hóa đúng như bộ phận khai báo thực sự đã viết, mã HS đã dùng, xuất xứ, ngày khai báo, thuế suất đã áp dụng, biểu thuế (MFN hoặc FTA nào), và nghị định nếu biết.
- Lấy từ **các tờ khai thực tế trong quá khứ**, không bịa ra.
- Cố ý bao gồm các trường hợp khó mà bộ phận khai báo còn nhớ đã từng tranh luận — đó là nơi công cụ chứng minh hoặc đánh mất giá trị của nó.
- Lưu trong repo dưới dạng fixture có phiên bản, không phải một bảng tính trên laptop của ai đó.

Tiêu chí chấp nhận:

- ≥30 mục, từ hồ sơ thực tế, với đáp án thực tế của bộ phận khai báo.
- Commit trước khi TASK-002 bắt đầu.
- Mỗi mục được đánh dấu bộ phận khai báo **tự tin** hay **không chắc chắn** về chính đáp án lịch sử của họ.

Ghi chú:

- Cờ "tự tin / không chắc chắn" không phải là thủ tục quan liêu. Research 09 ghi nhận rằng ground truth của HS thực sự có thể tranh cãi: một cuộc rà soát 226 bất đồng cho thấy **~42,5% các dự đoán "sai" của mô hình thực ra được các quy tắc HS hỗ trợ tốt hơn so với ground truth đã công bố**, và **76% doanh nghiệp Việt Nam báo cáo gặp trở ngại trong việc xác nhận mã HS**, tăng từ 66,3% năm 2018 (đã xác minh 2026-07-17, nguồn: research 09). Nếu bộ phận khai báo không chắc chắn, "độ chính xác" của ta so với mục đó nghĩa là sự đồng thuận với thực tiễn quá khứ, không phải tính đúng đắn. Hãy nói rõ điều đó thay vì giả vờ.
- Hỏi trực tiếp chủ sở hữu. Không suy ra điều này từ bất cứ thứ gì khác.

---

## TASK-002: Giải quyết mâu thuẫn về API customs.gov.vn

Status: todo

Mục tiêu: xác lập, bằng thực nghiệm, liệu một API JSON dùng được có tồn tại trên customs.gov.vn hay không — bởi vì hai báo cáo nghiên cứu mâu thuẫn trực tiếp với nhau và câu trả lời làm thay đổi bản chất của bước kiểm chứng chéo ở Giai đoạn 1.

**Mâu thuẫn, cả hai phía, chưa được giải quyết:**

- **Research 10** báo cáo đã điều khiển trang "Tra cứu biểu thuế" trong Chrome, bắt được XHR, và tái tạo lại nó bằng `curl` trần: `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`, body `{"l_class":"TIM_KIEM","l_action":"GET","l_param":"8703","l_bieu_thue":"NK_uu_dai"}`. Nó khẳng định: không xác thực, không JSESSIONID, không captcha, không kiểm tra Referer/Origin; captcha trên trang là **chỉ phía client**; `l_param` là tiền tố HS với tối thiểu 4 chữ số (`"87"` trả về rỗng, `"8703"` trả về 510 dòng); một dòng cho mỗi dòng HS với một cột cho mỗi chế độ thuế (đã xác minh 2026-07-17, nguồn: research 10).
- **Research 12** báo cáo cổng thông tin là một lớp vỏ JS — trang chủ và URL tra cứu thuế trả về phản hồi giống hệt từng byte 12.013 byte — và rằng `/scripts/main.js` mã hóa cứng một backend **khác**: `http://123.30.210.236:8080/hqcustomsapi/`, IP thô, HTTP thuần, cổng 8080, bao gồm `.../hqcustomsapi/captcha/CheckCaptcha`. **IP đó bị timeout.** Research 12 dứt khoát từ chối tuyên bố rằng nó không thể truy cập được, nói rằng nó không thể phân biệt việc chặn theo địa lý với việc chặn egress của sandbox của chính nó (đã xác minh 2026-07-17, nguồn: research 12).

Chúng mô tả **các endpoint khác nhau**, nên cả hai lời tường thuật đều có thể chính xác. Chưa ai kiểm tra.

Đầu ra kỳ vọng:

- Một câu trả lời bằng văn bản: endpoint `bridge` có phản hồi từ mạng của công ty không? IP thô có phản hồi không? Chúng có phải cùng một backend không?
- Nếu truy cập được: một phản hồi mẫu đã bắt được cho một mã HS đã biết, đối chiếu với kiến thức của bộ phận khai báo.
- Nếu không truy cập được: từ đâu, với lỗi gì, và liệu một mạng Việt Nam có truy cập được nó không.

Tiêu chí chấp nhận:

- Cả hai endpoint được kiểm tra từ mạng thực tế của công ty, không phải từ một sandbox.
- Kết quả được ghi lại trong [tariff-system.md](../concepts/tariff-system.md) với ngày hôm nay, **kể cả khi câu trả lời vẫn là "chưa biết"** và những gì đã thử.
- **Không quyết định thiết kế nào phụ thuộc vào việc câu trả lời là có.**

Ghi chú:

- Ngay cả khi nó hoạt động, nó **không** phải là nguồn chân lý. Chính các cảnh báo của research 10: không có VIFTA và không có CEPA trong danh sách biểu thuế, giá trị `THOI_GIAN_CAP_NHAT` là 2019–2020, chỉ có thuế suất năm hiện tại (không có chuỗi thuế suất năm tương lai), `l_bieu_thue` dường như bị bỏ qua đối với truy vấn nhập khẩu, không có tài liệu, không có phiên bản, không có SLA, không có sự cho phép trong ToS, và **giới hạn tốc độ chưa được thăm dò** — nó "có thể biến mất hoặc bắt đầu bắt buộc captcha" (đã xác minh 2026-07-17, nguồn: research 10). Nghị định là luật. Đây là một bước kiểm chứng chéo.
- Hãy lịch sự. Đừng liệt kê hết 1.228 nhóm khi đang trả lời câu "nó có phản hồi không."

---

## TASK-003: Chứng minh phân tích DOCX nhận biết bảng trên dòng EVFTA

Status: todo

Mục tiêu: bịt lỗ hổng duy nhất mà research 12 nêu ra là điểm nghẽn. **Điều này quyết định phạm vi FTA của Giai đoạn 1.**

Vấn đề, nguyên văn từ nghiên cứu: `textutil` gộp một dòng bảng EVFTA (Nghị định 116/2022/NĐ-CP, Phụ lục II) thành một dòng, tạo ra

```
2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9
```

Đó là sáu thuế suất hằng năm — `29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9` — nối liền với nhau **không có dấu phân cách**, trong một locale dùng dấu phẩy thập phân. Không thể khôi phục nếu không có heuristic. Research 12 nói rõ rằng nó đang **suy luận, không khẳng định**, rằng đây là một tạo phẩm của công cụ: RCEP (ND 129/2022) có cấu trúc cột sáu năm giống hệt và trích xuất hoàn hảo, với các cột thuế suất là các ô riêng biệt:

```
0101.21.00 | - - Loại thuần chủng để nhân giống | 0 | 0 | 0 | 0 | 0 | 0
```

điều này gợi ý mạnh mẽ rằng một parser nhận biết bảng đúng cách (LibreOffice → docx → `w:tbl/w:tr/w:tc`) sẽ khắc phục được. Nó **không thể chứng minh điều này** — không có `soffice`, `antiword`, hay `python-docx` trong môi trường đó. Nó gọi đây là "lỗ hổng duy nhất mà người xây dựng phải bịt trước khi tin tưởng bất cứ thứ gì" (đã xác minh 2026-07-17, nguồn: research 12).

Đầu ra kỳ vọng:

- LibreOffice `.doc` → `.docx`, rồi đọc bảng theo cấu trúc (`python-docx` hoặc tương đương), chạy trên **đúng** phần EVFTA chứa `2101.11.11`.
- Sáu thuế suất hiện ra dưới dạng sáu ô riêng biệt, hoặc một phát hiện bằng văn bản rằng chúng không như vậy.

Tiêu chí chấp nhận:

- `2101.11.11` cho ra `29`, `25,4`, `21,8`, `18,1`, `14,5`, `10,9` dưới dạng **sáu giá trị riêng biệt**.
- Chính parser đó chạy lại trên dòng RCEP ở trên vẫn cho ra sáu ô `0` riêng biệt (không hồi quy trên trường hợp vốn đã hoạt động).
- Nếu thất bại: ghi lại thành một phát hiện, và Giai đoạn 1 thu hẹp chỉ còn MFN, chờ một cách tiếp cận khác.

Ghi chú:

- Đừng viết heuristic dấu phân cách để tách `2925,421,818,114,510,9`. Nếu parser cấu trúc không làm được, câu trả lời là "chúng ta không thể phân tích EVFTA một cách đáng tin cậy," chứ không phải "chúng ta đã đoán." Một heuristic ở đây tạo ra các thuế suất sai trông có vẻ hợp lý — đúng kiểu thất bại mà dự án này tuyệt đối không được có.

---

## TASK-004: Kiểm tra xem provisionTree / referenceProvisions của vbpl có được điền dữ liệu không

Status: todo

Mục tiêu: trả lời một câu hỏi rẻ tiền ngay bây giờ mà nó quyết định schema của Giai đoạn 5 về sau.

vbpl.vn đã được xây dựng lại **2026-04-23**; mọi scraper hiện có và mọi tập dữ liệu công khai đều nhắm vào một trang không còn tồn tại (đã xác minh 2026-07-17, nguồn: research 04). JSON của Server Action của nó mang `references[]` → `{targetDocument:{...}, referenceType:int, referenceProvisions}` cùng một trường `provisionTree`. **Cả hai đều là `null` trên hai tài liệu mà research 04 lấy mẫu**, và nó không thể xác minh liệu chúng có bao giờ được điền dữ liệu không. Nó gọi đây là "câu hỏi mở có giá trị cao nhất": nếu được điền dữ liệu trên toàn trang, đó là một đồ thị pháp lý ở cấp điều khoản (điều/khoản) — chính xác điều mà báo chí về đợt ra mắt lại tháng Tư tuyên bố ("quản lý chi tiết đến từng điều, khoản, điểm... máy có thể tự động đọc, hiểu") (đã xác minh 2026-07-17, nguồn: research 04).

Đầu ra kỳ vọng:

- Lấy mẫu 10–20 tài liệu gần đây; `provisionTree` và `referenceProvisions` được điền dữ liệu hay null trên mỗi tài liệu.
- Phát hiện được ghi lại trong [vietnamese-legal-documents.md](../concepts/vietnamese-legal-documents.md).

Tiêu chí chấp nhận:

- ≥10 tài liệu được lấy mẫu, thiên về các tài liệu gần đây.
- Một câu trả lời có/không/một phần kèm theo mẫu, không phải một ấn tượng.

Ghi chú:

- **Không chặn Giai đoạn 1.** vbpl không phải là nguồn thuế suất. Đây là công việc chuẩn bị cho Giai đoạn 5 làm khi còn rẻ.
- Trang được render hoàn toàn phía client: `curl` trả về một vỏ tải trang 57KB với **không có** văn bản luật nào. Các chuỗi `Còn hiệu lực` trong HTML tĩnh là **nhãn i18n, không phải dữ liệu** — một cái bẫy âm thầm đầu độc một scraper ngây thơ (đã xác minh 2026-07-17, nguồn: research 04). Dùng một trình duyệt headless.
- `robots.txt` cho phép `/van-ban/` và cấm `/Pages/` (cây legacy đã chết) (đã xác minh 2026-07-17, nguồn: research 04). Hãy lịch sự — research 04 chỉ thực hiện ~40 yêu cầu và nói rõ đó không phải là bằng chứng cho việc không có điều tiết ở quy mô lớn.

---

## TASK-005: Viết các ghi chú kiến thức .agent

Status: done (2026-07-17)

Mục tiêu: các ghi chú lâu bền tồn tại và được liên kết chéo **trước khi** việc triển khai bắt đầu.

Đây là sự sắp xếp trình tự có chủ đích, không phải nghi thức. Nghiên cứu chứa các sự kiện năm 2026 mà không dữ liệu huấn luyện của mô hình nào có, và một số trong đó đảo ngược những định kiến hợp lý — công báo chính phủ có thẩm quyền thì mở toang trong khi các trang tổng hợp tiện lợi lại bị chặn và thù địch về mặt pháp lý; nguồn PDF "hiển nhiên" lại là một bản quét 200-DPI không có lớp văn bản. Một agent bắt đầu từ định kiến sẽ xây dựng sai thứ một cách tự tin.

Đầu ra kỳ vọng:

- Các ghi chú dưới `.agent/concepts/`, `.agent/architecture-decisions/`, `.agent/workflows/`, theo [AGENTS.md](../AGENTS.md).
- `.agent/index.md` được cập nhật.

Tiêu chí chấp nhận:

- Mọi tuyên bố sự kiện đều mang ngày xác minh và nguồn.
- Mọi điều không chắc chắn được nghiên cứu đánh dấu đều được tái hiện dưới dạng một điều không chắc chắn, không được rửa thành sự tự tin.
- Nơi research 10 và 12 mâu thuẫn, **cả hai** đều được trình bày và mâu thuẫn được nêu là chưa được giải quyết.
- Toàn bộ bằng tiếng Anh. Liên kết tương đối. Frontmatter với `type`, `status`, `updated`, `related`.

Kết quả (2026-07-17): các ghi chú đã được viết, rồi được kiểm toán một cách phản biện đối chiếu với nghiên cứu. Cuộc kiểm toán đã phát hiện
và ta đã sửa: một URL nguồn sơ cấp được ghép vào trường hợp sữa không có nguồn trong hai ADR; cùng trường hợp đó
được nêu như sự thật đã xác lập trong ba ghi chú trong khi được cách ly đúng cách trong ghi chú thứ tư; một liên hợp
"MFN 2026 đúng" sáu nghị định bịa đặt không xuất hiện trong bất kỳ báo cáo nghiên cứu nào, in đậm như sự thật trong
`concepts/tariff-system.md`; và `concepts/data-sources.md` tuyên bố mâu thuẫn robots.txt của vbpl là
"đã giải quyết" trong khi ba ghi chú khác gọi chính sự hòa giải đó là một suy luận chưa được xác minh.

**Bài học, được ghi lại vì nó sẽ tái diễn:** mỗi một trong số đó là một agent dọn dẹp một
điều không chắc chắn thành một câu tự tin — chính kiểu thất bại mà sản phẩm này được xây dựng để ngăn chặn, phạm phải
bởi chính công cụ đã ghi chép về nó. Văn xuôi trôi chảy che giấu việc thiếu xuất xứ. **Kiểm toán cơ sở kiến thức
đối chiếu với các nguồn của nó bất cứ khi nào nó được mở rộng đáng kể.**

---

## TASK-006: Khung sườn repository

Status: todo

Mục tiêu: monorepo NestJS + Docker Compose (Postgres + pgvector) + migrations, có thể chạy được bởi một người thứ hai từ một bản clone sạch.

Đầu ra kỳ vọng:

- Monorepo NestJS tuân theo quy ước module của framework; ánh xạ được ghi trong [code-organization.md](../docs/code-organization.md).
- `docker compose up` → Postgres với `pgvector` khả dụng.
- Công cụ migration được kết nối; một migration được áp dụng.
- README với các bước từ clone đến chạy.

Tiêu chí chấp nhận:

- Clone sạch → `docker compose up` → migrations chạy → app khởi động, trên một máy chưa từng thấy dự án bao giờ.
- Không có Qdrant, Neo4j, MinIO, hay BullMQ (xem [Chỉ dùng PostgreSQL cho v1](../architecture-decisions/2026-07-17-postgres-only-for-v1.md)).
- `pgvector` được cài đặt nhưng chưa dùng ở Giai đoạn 1 — Giai đoạn 2 cần nó; cài đặt bây giờ tránh được một migration về sau.

---

## TASK-007: Schema thuế suất — nhận biết thời gian và phụ lục ngay từ migration đầu tiên

Status: todo

Mục tiêu: một schema có thể biểu diễn luật đúng như cách nó thực sự vận hành. Trang bị lại điều này về sau nghĩa là phải nạp lại toàn bộ.

**Vì sao schema hiển nhiên lại sai.** `(hs, origin) → rate` không phải là một hàm. Research 12 đã xác minh:

- **MFN so với FTA là có điều kiện.** RCEP Điều 4 yêu cầu quy tắc xuất xứ *cộng với một C/O hợp lệ*. "Thuế là 0%" là sai; "0% *nếu* bạn có C/O hợp lệ, ngược lại 15% MFN" mới đúng.
- **RCEP Điều 6.2 có quy tắc thuế suất cao nhất** trên toàn các phụ lục đối với một số hàng hóa đa xuất xứ — nguyên văn: *"Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."*
- **`*` nghĩa là loại trừ, không phải bằng không** — 54 ô `*` trong một số công báo RCEP duy nhất.
- **Hàng hóa TRQ** (nhóm 04.07, 17.01, 24.01, 25.01) phụ thuộc vào tình trạng hạn ngạch; thuế suất ngoài hạn ngạch nằm ở một phụ lục khác.
- **Thuế tuyệt đối/hỗn hợp** (xe đã qua sử dụng, Phụ lục III) là **số tiền USD, không phải phần trăm** — một regex `%` tìm thấy không dòng nào ở đó.

(tất cả đã xác minh 2026-07-17, nguồn: research 12)

Và "mới nhất" là sai với tư cách một mô hình thời gian, bởi vì các nghị định **hết hiệu lực và âm thầm hồi quy**: Nghị định 72/2026/NĐ-CP chỉ có hiệu lực đến **2026-04-30** — một cửa sổ 52 ngày — sau đó thuế suất hồi quy về ND 26/2023. Một thiết kế "cào bản mới nhất" sẽ phục vụ xăng 0% mãi mãi (đã xác minh 2026-07-17, nguồn: research 12).

Đầu ra kỳ vọng:

- Các dòng thuế suất được khóa bằng: mã HS, **danh tính phụ lục**, biểu thuế, `effective_from`, `effective_to`, nghị định nguồn, **loại** thuế suất (percent / absolute / mixed / excluded / TRQ-dependent), và các điều kiện.
- **Phiên bản** HS như một chiều với ngày hiệu lực — không mã hóa cứng AHTN 2022.
- Các thực thể nghị định với ngày ký, ngày công báo, ngày hiệu lực, và ngày hết hiệu lực.

Tiêu chí chấp nhận:

- Schema có thể biểu diễn, không cần trường hợp đặc biệt: một nghị định hết hiệu lực rồi hồi quy; một loại trừ `*`; một thuế tuyệt đối tính bằng USD; một thuế suất có điều kiện dựa trên C/O; cùng một mã HS với các thuế suất khác nhau ở Phụ lục I và Phụ lục II.
- **Không thể chèn một dòng nếu không có phụ lục.** Được thực thi bởi cơ sở dữ liệu, không phải bởi quy ước.
- Một truy vấn tại một thời điểm là một vị từ khoảng (interval predicate), không phải một `ORDER BY date DESC LIMIT 1`.

Ghi chú:

- HS 2028 có hiệu lực **2028-01-01** (đã xác minh 2026-07-17, nguồn: research 10, dẫn WCO; được research 09 chứng thực). Research 10 cũng cảnh báo rằng về cơ bản toàn bộ kho nghị định FTA hết hiệu lực **2027-12-31**, va chạm với việc chuyển đổi danh mục AHTN 2028. Đừng mô hình hóa "thuế suất hiện tại" như một đại lượng vô hướng.
- Research 10 lưu ý rằng **AJCEP (ND 120/2022) và VJEPA (ND 124/2022) kéo dài đến 2028**, không phải 2027 — nên ngày hết hiệu lực theo từng nghị định phải là một trường, không phải một hằng số toàn cục.
- Xem [Hiệu lực bitemporal ngay từ đầu](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md).

---

## TASK-008: Nạp Công báo — parser nhận biết phụ lục

Status: todo

Depends on: TASK-003, TASK-007.

Mục tiêu: nạp Nghị định 26/2023/NĐ-CP từ `.doc` của Công báo, nhận biết phụ lục, với mỗi dòng mang xuất xứ của nó.

**Vì sao Công báo chứ không phải các nguồn hiển nhiên** (tất cả đã xác minh 2026-07-17):

- Công báo là **có thẩm quyền** — bản công bố chính thức; các phiên bản `_signed` là văn bản được công bố hợp pháp (nguồn: research 04).
- **Cho phép robots**: `congbao.chinhphu.vn/robots.txt` là `User-agent: * / Allow: /`. Không có Cloudflare, không có JS — `curl` thuần trả về HTML được render phía máy chủ (nguồn: research 04 và research 12, độc lập).
- **Bảng Word thật sự.** Research 12 đã tải toàn bộ 14 phần `.doc` của ND 26/2023 (số công báo 743+744 → 769+770, qua các liên kết `g7.cdnchinhphu.vn/api/download/stream` có token) và trích xuất **11.874 mã HS 8 chữ số duy nhất**, các ô khôi phục sạch sẽ dưới dạng `0301.11.10 | - - - Cá bột | 15` (nguồn: research 12).
- **PDF của chinhphu.vn là bản quét**: producer `Kodak Alaris Inc.`, một ảnh bilevel `/CCITTFaxDecode` mỗi trang, 1666×2329 px ≈ 200 DPI đơn sắc, và `26-nd-2.pdf` có **không đối tượng `/Font` nào** — không có lớp văn bản. 1.016 trang quét nén fax (nguồn: research 12).
- **thuvienphapluat.vn: không cào.** 403 qua Cloudflare; `robots.txt` nêu tên `ClaudeBot` với `Disallow: /`; `Content-Signal: search=yes, ai-train=no, use=reference` như một bảo lưu minh thị theo Điều 4 của Chỉ thị EU 2019/790; các file Excel biểu thuế của nó là một sản phẩm thương mại (nguồn: research 04 và research 12).

Đầu ra kỳ vọng:

- Parser: `.doc` Công báo → LibreOffice `.docx` → đọc bảng theo cấu trúc → các dòng có kiểu.
- Phát hiện ranh giới phụ lục như một **bước hạng nhất**, không phải một suy nghĩ sau regex.
- Mỗi dòng mang: nghị định nguồn, số công báo, phụ lục, và văn bản ô nguồn nguyên văn.

Tiêu chí chấp nhận:

- **~11.874 mã HS 8 chữ số duy nhất** từ Phụ lục II, ~11.160 mã có thuế suất — khớp với các con số research 12 tạo ra một cách độc lập. Một số đếm khác biệt đáng kể nghĩa là parser sai; hãy điều tra thay vì điều chỉnh kỳ vọng.
- **`0301.11.10` trả về 15 (Phụ lục II, nhập khẩu) và 0 (Phụ lục I, xuất khẩu) như hai dòng riêng biệt.** Khẳng định đơn lẻ này là bài kiểm thử hồi quy cho bẫy phụ lục. Nó phải tồn tại trước bất kỳ kiểm thử parser nào khác.
- Các dòng Phụ lục III được nạp dưới dạng **thuế tuyệt đối USD hoặc bị bỏ qua rõ ràng với một lý do được ghi log** — không bao giờ bị âm thầm loại bỏ bởi một regex `%`.
- Các dòng không có phụ lục phân giải được **làm thất bại việc nạp**. Chúng không được nhận một giá trị mặc định.
- Kiểm chứng chéo: `2710.12.21/.22/.24/.25` = **10%** theo ND 26/2023 — research 12 đã xác nhận điều này một cách độc lập đối chiếu với báo chí về ND 72/2026 mô tả việc cắt giảm *"từ 10% xuống 0%"* trên đúng các mã đó (đã xác minh 2026-07-17, nguồn: research 12).

Ghi chú:

- Bản phân tích ngây thơ của research 12 **báo cáo thành công 94% và đã sai** — 1.329 trong 1.520 mã hai-phụ-lục có thuế suất khác nhau giữa Phụ lục I và II. Nó trả về thuế suất xuất khẩu cho các câu hỏi nhập khẩu, một cách âm thầm. Cách diễn đạt của chính nó: *"không phải dữ liệu thiếu, mà là dữ liệu sai trông có vẻ hợp lý"* — và *"nó thất bại trong khi báo cáo thành công."* Hãy coi một tỷ lệ thành công cao là chưa được chứng minh cho đến khi khẳng định về phụ lục ở trên vượt qua.

---

## TASK-009: Xác lập chuỗi sửa đổi cho MFN 2026

Status: todo

Depends on: TASK-008.

Mục tiêu: biết những nghị định nào thực sự cấu thành thuế suất MFN 2026 đúng — bởi vì hai báo cáo nghiên cứu đưa ra **các danh sách khác nhau và không danh sách nào được xác nhận là đầy đủ**.

- **Research 10**: MFN 2026 đúng = ND 26/2023 ⊕ **199/2025** ⊕ **72/2026** ⊕ **201/2026** ⊕ **108/2025**. Nó khẳng định ND 26/2023 vẫn là nghị định gốc, không bị thay thế, và rằng **không có văn bản hợp nhất chính thức nào được công bố dưới dạng dữ liệu máy đọc được** (đã xác minh 2026-07-17, nguồn: research 10).
- **Research 12** đưa ra chuỗi là ND 26/2023 ← **144/2024** (hiệu lực 2024-12-16), **199/2025** (2025-07-08), **72/2026** (ký 2026-03-09), cộng với các bổ sung năm 2026: các biểu thuế AJCEP và VJEPA mới hiệu lực 2026-04-01, một biểu thuế Việt Nam–Campuchia 2026, và ND 26/2026 về hóa chất (đã xác minh 2026-07-17, nguồn: research 12).

**144/2024 chỉ xuất hiện trong research 12; 201/2026 và 108/2025 chỉ xuất hiện trong research 10.** Các danh sách này không khớp. Đừng gộp chúng và giả định liên hợp là đúng — hãy xác lập chuỗi thực từ Công báo.

Đầu ra kỳ vọng:

- Chuỗi sửa đổi, mỗi mục kèm ngày ký, ngày công báo, ngày hiệu lực, và ngày hết hiệu lực (nếu có), lấy từ Công báo.
- Được ghi lại trong [tariff-system.md](../concepts/tariff-system.md).

Tiêu chí chấp nhận:

- Mọi nghị định trong chuỗi được xác minh đối chiếu với một danh mục Công báo, không phải một nguồn thứ cấp.
- Các khác biệt so với mỗi báo cáo nghiên cứu được ghi lại thay vì âm thầm giải quyết.
- Ngày hết hiệu lực của ND 72/2026 vào **2026-04-30** được biểu diễn — sau đó thuế suất hồi quy về ND 26/2023 (đã xác minh 2026-07-17, nguồn: research 12). Nếu dữ liệu đã nạp phục vụ xăng 0% cho một ngày sau 2026-04-30, mô hình thời gian đã hỏng.

---

## TASK-010: Phát hiện tình trạng lỗi thời

Status: todo

Depends on: TASK-007.

Mục tiêu: hệ thống biết khi nào nó có thể sai, và nói ra điều đó.

**Đây là phát hiện xứng đáng nhất với sự chú ý của chủ sở hữu, bởi vì biện pháp giảm thiểu là một quyết định sản phẩm, không phải kỹ thuật.** Ba sự kiện cộng dồn của research 12, tất cả đã xác minh (nguồn: research 12):

1. **Không có thời gian chuẩn bị.** ND 72/2026 có hiệu lực pháp lý **ngay ngày ký** (2026-03-09, "kể từ ngày ký").
2. **Độ trễ công báo vượt quá ngày hiệu lực.** Nó được công bố trong Công báo số 157 vào **2026-03-24 — 15 ngày sau khi nó đã là luật có hiệu lực ràng buộc.** (ND 26/2023: ~19 ngày. EVFTA ND 116/2022: ~48 ngày.) **Có một cửa sổ nhiều tuần trong đó thuế suất có hiệu lực pháp lý không tồn tại ở dạng máy đọc được ở bất cứ đâu — chỉ có dưới dạng một bản quét 200-DPI.**
3. **Các nghị định hết hiệu lực và âm thầm hồi quy.**

Kết luận của research 12: *"Không lịch cào nào có thể đóng lại khoảng cách đó."* Nên ta không giả vờ. Hệ thống theo dõi ngày snapshot của chính nó và hiển thị nó.

Đầu ra kỳ vọng:

- Mỗi phản hồi mang ngày snapshot nạp dữ liệu bên cạnh ngày hiệu lực (as-of).
- Một cửa sổ lỗi thời có thể cấu hình; vượt quá nó, phản hồi là một **cảnh báo**, không phải một con số trần trụi.
- Giao diện hiển thị nghị định điều chỉnh và ngày hiệu lực trên mọi kết quả (Giai đoạn 3).

Tiêu chí chấp nhận:

- Một truy vấn cho một ngày mới hơn snapshot trả về một trạng thái cảnh báo, không phải một thuế suất tự tin.
- Cảnh báo hiển thị trong phản hồi API, không bị chôn trong một log.
- Được kiểm thử đối chiếu với trường hợp ND 72/2026: một truy vấn ngày 2026-03-10 (đã hiệu lực, trước công báo) đối chiếu với một snapshot 2026-03-15 phải **không** âm thầm trả về thuế suất ND 26/2023 như thể nó là hiện hành.

Ghi chú:

- Cách diễn đạt của research 12 về toàn bộ dự án: *"Đó là một vấn đề về tính thời sự pháp lý khoác lên bộ trang phục kỹ thuật dữ liệu."* Hình dạng bảo vệ được là *"một công cụ hỗ trợ nghiên cứu hiển thị các nguồn của nó, không bao giờ là một cỗ máy trả lời tuyên bố một thuế suất."* Công việc này là nơi nguyên tắc đó trở thành mã.

---

## TASK-011: API tra cứu

Status: todo

Depends on: TASK-007, TASK-008, TASK-010.

Mục tiêu:

```
GET /tariff?hs=<8-digit>&origin=<country>&date=<YYYY-MM-DD>
```

→ thuế suất + nghị định điều chỉnh + ngày hiệu lực (as-of) + điều kiện.

Đầu ra kỳ vọng:

- Endpoint, với `conditions` là một trường thực sự, không phải một ghi chú.
- Xác định (deterministic). Không có lời gọi mô hình nào ở bất kỳ đâu trong đường xử lý (xem [Không dùng LLM cho con số biểu thuế](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)).

Tiêu chí chấp nhận:

- Mọi phản hồi nêu tên nghị định điều chỉnh và ngày hiệu lực (as-of). Không ngoại lệ.
- Một thuế suất FTA trả về **có điều kiện** — "0% nếu có C/O hợp lệ, ngược lại X% MFN" — không bao giờ là một số 0% trần trụi.
- Một dòng đánh dấu `*` trả về **loại trừ**, không phải 0%.
- Một hàng hóa TRQ trả về phụ thuộc-hạn-ngạch, với thuế suất ngoài hạn ngạch được xác định là một phụ lục riêng.
- Một dòng thuế tuyệt đối trả về một số tiền USD kèm đơn vị, không phải một phần trăm.
- Một ngày ngoài cửa sổ đã nạp trả về một trạng thái cảnh báo (TASK-010).

Ghi chú:

- Research 12: *"'Thuế là 0%' là sai; '0% nếu bạn có C/O hợp lệ, ngược lại 15% MFN' mới đúng."* Một con số vô điều kiện là một lời nói dối mà API nói ra một cách tự tin.

---

## TASK-012: Chấp nhận Giai đoạn 1 — đối chiếu với thực tế

Status: todo

Depends on: TASK-001, TASK-011.

Mục tiêu: chứng minh Giai đoạn 1 đối chiếu với thế giới, không phải với chính nó.

Đầu ra kỳ vọng:

- Thuế suất của một **lô hàng thực tế**, từ một tờ khai thực tế mà bộ phận khai báo đã nộp, khớp với ECUS.
- **20 mã HS được lấy mẫu ngẫu nhiên** đối chiếu bằng tay.

Tiêu chí chấp nhận:

- Lô hàng thực tế khớp. Nếu không khớp, Giai đoạn 1 chưa xong — không có điểm một phần.
- 20 mã được chọn bằng **lấy mẫu ngẫu nhiên** trên tập đã nạp, rồi được kiểm tra bằng tay đối chiếu với văn bản nguồn Công báo.
- Bộ golden set từ TASK-001 chạy xanh, với bất kỳ mục "không chắc chắn" nào được báo cáo riêng với các mục "tự tin".

Ghi chú:

- **Ngẫu nhiên, không chọn tay.** Mẫu chọn tay xác nhận parser mà bạn đã viết. Mẫu ngẫu nhiên tìm ra lỗi phụ lục. Đây chính là toàn bộ lý do tiêu chí được viết theo cách này — parser thành công 94% của research 12 lẽ ra đã vượt qua một mẫu chọn tay và thất bại với một mẫu ngẫu nhiên.

---

## Giả định

- Chủ sở hữu có thể cung cấp 30–50 tờ khai thực tế cho TASK-001, và đầu ra ECUS cho ít nhất một lô hàng thực tế cho TASK-012. **Cả hai đều là phụ thuộc cứng từ bên ngoài repo.** Nếu một trong hai không có, hãy nói ra thay vì thay thế bằng dữ liệu bịa đặt.
- Công báo vẫn cho phép robots và tiếp tục công bố `.doc` bên cạnh PDF.
- Các liên kết `g7.cdnchinhphu.vn/api/download/stream` có token hoạt động hàng loạt. Research 12 đã kéo 14 phần thành công; hành vi ở tốc độ duy trì chưa được kiểm tra.
- Một instance Postgres duy nhất là đủ cho 5–50 nhân viên.
- Các con số trích xuất của research 12 (11.874 / 11.160) tái lập được. TASK-008 coi chúng là kết quả kỳ vọng chính xác để một sự sai lệch trở nên rõ ràng.

## Câu hỏi mở

1. **API customs.gov.vn** — research 10 và 12 mâu thuẫn. TASK-002. Chưa giải quyết.
2. **Phân tích sáu-thuế-suất EVFTA** — TASK-003. Quyết định phạm vi FTA của Giai đoạn 1.
3. **`provisionTree` / `referenceProvisions` của vbpl** — TASK-004. Quyết định schema của Giai đoạn 5.
4. **Chuỗi sửa đổi MFN thực** — TASK-009. Research 10 và 12 đưa ra các danh sách không khớp.
5. **Công ty này thực sự dùng những biểu thuế FTA nào?** Cuộc gọi khám phá của research 10 trả về 26 mã biểu thuế nhập khẩu (`NK_uu_dai, ATIGA, ACFTA, AJCEP, AKFTA, AHKFTA, AANZFTA, AIFTA, VJEPA, VKFTA, VN-EAEU, EVFTA_NK, UKVFTA_NK, VCFTA, VNL, VNCB, CPTPP_NK, CPTPP_NK_MEX, RCEP_ASEAN, RCEP_AU, RCEP_CN, RCEP_JP, RCEP_KR, RCEP_NZ, NK_TT`) (đã xác minh 2026-07-17, nguồn: research 10). Bộ phận này sẽ dùng một số ít. **Hỏi chủ sở hữu** — nạp toàn bộ 26 là hàng tuần công việc cho các biểu thuế không ai truy vấn.
6. **Các mã HS lịch sử của bộ phận khai báo có đáng tin làm ground truth không?** Xem cờ tự tin/không chắc chắn của TASK-001.

## Khu vực Rủi ro / Điều chưa biết

- **Parser thất bại trong khi báo cáo thành công** là rủi ro định hình của Giai đoạn 1. Mọi tiêu chí chấp nhận ở đây được viết để mang tính phản biện vì lý do này. Nếu một tiêu chí có cảm giác như đang cố bắt lỗi ta, đó là có chủ đích.
- **Khoảng cách thời gian không thể được kỹ thuật hóa để loại bỏ.** Trong cửa sổ 15–48 ngày từ ký đến công báo, luật có hiệu lực ràng buộc không có ở dạng máy đọc được ở bất cứ đâu. TASK-010 làm cho hệ thống trung thực về điều đó; nó không sửa được điều đó. **Chủ sở hữu nên hiểu điều này trước khi Giai đoạn 1 ra mắt** — đó là một thuộc tính vĩnh viễn của lĩnh vực, không phải một lỗi mà ta sẽ xử lý sau.
- **Một thuế suất sai là trách nhiệm pháp lý của người khai, không phải của công cụ.** Research 12: tờ khai hải quan có tính ràng buộc pháp lý; một thuế suất sai nghĩa là truy thu và phạt, do người khai gánh chịu.
- **TASK-001 và TASK-012 phụ thuộc vào chủ sở hữu.** Chúng là hai công việc tạo nên sự khác biệt giữa một công cụ hoạt động và một công cụ trông có vẻ hoạt động, và không cái nào có thể làm từ bên trong repo.
- **Sự mở rộng phạm vi hướng tới "cứ thêm VAT đi."** VAT được khóa một phần theo HS; **TTĐB và BVMT hoàn toàn không được khóa theo HS trong luật** — được xác minh qua chính API hải quan, vốn trả về các dòng như `"1. Thuốc lá điếu…"` với `MA_HS: None` (đã xác minh 2026-07-17, nguồn: research 10). Bất kỳ ánh xạ HS→danh mục nào cũng là suy luận biên tập của chính ta và là một bề mặt trách nhiệm pháp lý. Ngoài phạm vi cho v1; xem [00-bootstrap.md](00-bootstrap.md).

## Kế hoạch xác thực

- **TASK-001** được xác thực bằng cách tồn tại trước khi mã tồn tại. Giá trị của nó hoàn toàn nằm ở trình tự.
- **TASK-002, 003, 004** được xác thực bằng cách tạo ra một câu trả lời bằng văn bản kèm bằng chứng — **kể cả "vẫn chưa biết, đây là những gì đã thử."** Một điều chưa biết trung thực là kết quả đạt; một phỏng đoán tự tin là kết quả trượt.
- **TASK-007** được xác thực bằng cách biểu diễn sáu trường hợp khó xử (nghị định hết hiệu lực, `*`, thuế tuyệt đối USD, có điều kiện C/O, va chạm hai-phụ-lục, TRQ) mà không xử lý theo trường hợp đặc biệt.
- **TASK-008** được xác thực đối chiếu với các số đếm research 12 tạo ra độc lập và khẳng định hai-phụ-lục `0301.11.10`.
- **TASK-009** được xác thực đối chiếu với các danh mục Công báo, không phải các nguồn thứ cấp.
- **TASK-010** được xác thực đối chiếu với dòng thời gian ND 72/2026 — trường hợp cụ thể nơi ký, hiệu lực, công báo, và hết hiệu lực đều phân kỳ.
- **TASK-011** được xác thực bằng cách không bao giờ trả về một con số vô điều kiện nơi luật là có điều kiện.
- **TASK-012** được xác thực đối chiếu với ECUS và một mẫu ngẫu nhiên. Đây là tiêu chí duy nhất mà bộ phận khai báo quan tâm.

## Chưa xác minh / Không được dựa vào

Mang theo từ nghiên cứu; cũng có trong [00-bootstrap.md](00-bootstrap.md).

- **API customs.gov.vn: research 10 và 12 MÂU THUẪN.** Research 10 báo cáo một endpoint `bridge` đã xác minh hoạt động không có captcha. Research 12 báo cáo một backend IP-thô khác với một đường dẫn `CheckCaptcha` bị timeout, và dứt khoát từ chối tuyên bố không thể truy cập. Các endpoint khác nhau — có thể cả hai đều đúng, có thể một sai. **Chưa giải quyết.** Trình bày cả hai. TASK-002.
- **Việc nối liền EVFTA là một tạo phẩm của `textutil` được SUY LUẬN, không phải chứng minh** (research 12 không có parser nhận biết bảng khả dụng). TASK-003.
- **Chuỗi sửa đổi MFN khác nhau giữa research 10 và 12** và không cái nào được xác nhận là đầy đủ. TASK-009.
- **Cách diễn đạt "các nghị định FTA đợt 2022 đều hết hiệu lực cùng nhau vào 2027-12-31" được SUY LUẬN** bởi research 12; research 10 xác minh các ngày riêng lẻ từ hai nguồn độc lập nhưng cũng lưu ý **AJCEP và VJEPA kéo dài đến 2028** — nên "cùng nhau" vốn đã thiếu chính xác.
- **Nghị định 128/2022/NĐ-CP có thể hoàn toàn không phải một nghị định thuế FTA** — cả hai nguồn của research 10 đều bỏ qua nó; đừng giả định một dải liền mạch 112–129.
- **data.gov.vn — CÓ TRANH CÃI.** Research 10: lỗi DNS, đánh dấu "chưa xác minh, chưa xác nhận đã chết." Research 04: **NXDOMAIN** từ zone `gov.vn` qua cả 8.8.8.8 và 1.1.1.1 với các control phân giải tốt, kết luận nó **không tồn tại**. Bằng chứng của research 04 mạnh hơn; hai bên không chính thức đồng thuận. Dù thế nào, không có API dữ liệu mở quốc gia cho các văn bản pháp luật.
- **Giới hạn tốc độ trên API hải quan chưa bao giờ được thăm dò** (research 10, một cách rõ ràng).
- **Hành vi cào ở tốc độ duy trì trên vbpl chưa được kiểm tra** — chỉ ~40 yêu cầu (research 04).

## Kiểm tra tái sử dụng

- Các helper, module, hoặc mẫu hiện có đã tìm kiếm: chỉ các ghi chú `.agent/`; chưa có mã ứng dụng nào tồn tại.
- Mã hiện có để tái sử dụng hoặc mở rộng: không có.
- Các module mới cần thiết: nạp thuế suất, tra cứu thuế suất. Cả hai đều là các ranh giới miền mới không có tương đương trong repo.
- Lý do mã hiện có không đủ: greenfield.

## Ý tưởng hoãn lại

- Gợi ý ứng viên HS — Giai đoạn 2. Cổng chặn ở top-3 ≥ 80%; **dưới mức đó, không ra mắt.**
- Web UI + xác thực nội bộ — Giai đoạn 3.
- Cảnh báo chính sách/giấy phép — Giai đoạn 4, rủi ro cao, chỉ Bộ Công Thương để bắt đầu.
- RAG pháp lý — Giai đoạn 5+, chỉ sau khi hải quan chạy thực sự.
- VAT / TTĐB / BVMT — ngoài phạm vi; TTĐB và BVMT không được khóa theo HS trong luật.
- Thuế chống bán phá giá — ngoài phạm vi; không có sổ đăng ký hợp nhất máy đọc được nào tồn tại.

## Kiến thức liên quan

- [Kế hoạch khởi tạo](00-bootstrap.md) — lộ trình và các cổng giai đoạn
- [Bối cảnh dự án](../project-context.md)
- [Hệ thống biểu thuế](../concepts/tariff-system.md) — biểu thuế, bẫy phụ lục, khoảng cách thời gian
- [Nguồn dữ liệu](../concepts/data-sources.md) — vì sao Công báo, vì sao không phải các trang tổng hợp
- [Phân loại mã HS](../concepts/hs-classification.md) — cho Giai đoạn 2
- [Quy trình khai báo hải quan](../workflows/customs-declaration.md)
- [Tổ chức mã nguồn](../docs/code-organization.md)
- [Quy tắc nghiệp vụ](../business-rules.md)
- [Quy tắc tác nhân](../AGENTS.md)
