---
type: planning
status: active
updated: 2026-07-18
related:
  - ../project-context.md
  - ../concepts/tariff-system.md
  - ../concepts/data-sources.md
  - ../concepts/hs-classification.md
  - ../concepts/legal-rag-retrieval.md
  - ../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md
  - ../architecture-decisions/2026-07-17-hs-candidates-not-answers.md
  - ../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md
  - ../architecture-decisions/2026-07-17-customs-first-law-later.md
  - 01-task-list.md
---

# Kế hoạch Bootstrap

## Dự án

`Customs Assistant` — một công cụ nội bộ cho bộ phận khai báo hải quan của một công ty logistics Việt Nam (5–50 nhân viên).

## Mục đích của ghi chú này

Đây là lộ trình: ta xây dựng gì, theo thứ tự nào, và mỗi giai đoạn phải chứng minh điều gì trước khi giai đoạn tiếp theo bắt đầu. Nó không phải là một lịch trình. Thời lượng là ước tính công sức cho một lập trình viên, không phải cam kết.

Nguyên tắc sắp xếp trình tự: **mỗi giai đoạn phải tự nó dùng được bởi bộ phận khai báo.** Ta không xây dựng một nền tảng rồi mới tìm cách dùng nó. Giai đoạn 1 hữu ích với zero AI trong đó. Nếu dự án dừng lại sau Giai đoạn 1, công ty vẫn thu được điều gì đó.

## Nguồn ngữ cảnh dự án

`.agent/project-context.md` là bản tóm tắt dự án lâu bền. Ghi chú này giả định nó. Đọc nó trước.

## Phạm vi repository

Một repository. Monorepo NestJS, PostgreSQL với extension `pgvector`, Docker Compose cho phát triển cục bộ. Không có Qdrant, Neo4j, MinIO, hay BullMQ trong v1 — xem [Chỉ dùng PostgreSQL cho v1](../architecture-decisions/2026-07-17-postgres-only-for-v1.md). Không tích hợp Zalo — chỉ ứng dụng web nội bộ thuần túy, xem [Web app, không phải Zalo](../architecture-decisions/2026-07-17-web-app-not-zalo.md).

## Cơ sở tổ chức mã

NestJS có một quy ước module đã được xác lập. Tuân theo nó và ghi lại ánh xạ trong [code-organization.md](../docs/code-organization.md). Logic tính năng nằm bên trong ranh giới module NestJS của nó. Không có các thùng chứa gộp `utils`/`helpers`/`common`.

## Dự án này là gì (Phạm vi)

1. **Tra cứu thuế suất chính xác** — xác định, khóa bởi mã HS + biểu thuế + ngày. Không có AI ở bất cứ đâu gần các con số.
2. **Gợi ý ứng viên mã HS** — top-3 với bằng chứng ghi chú pháp lý nguyên văn. Con người quyết định.

Về sau, và chỉ về sau: RAG trên luật logistics Việt Nam.

## Ngoài phạm vi cho v1

- Gán HS tự động. Xem [HS là ứng viên, không phải đáp án](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md).
- Tính toán VAT / TTĐB (SCT) / thuế bảo vệ môi trường (BVMT). TTĐB và BVMT **không được khóa theo HS trong luật Việt Nam** — các bảng luật định theo danh mục sản phẩm, không phải dòng HS (đã xác minh 2026-07-17, nguồn: research 10, đã xác nhận điều này đối chiếu với API customs.gov.vn: một truy vấn TTĐB trả về các dòng như `"1. Thuốc lá điếu…"` với `MA_HS: None`). Bất kỳ ánh xạ HS→danh mục nào ta xây dựng đều là suy luận biên tập của chính ta và là một bề mặt trách nhiệm pháp lý. Không có trong v1.
- Thuế chống bán phá giá / tự vệ. Chúng nằm trong các quyết định riêng lẻ của Bộ Công Thương không có sổ đăng ký hợp nhất máy đọc được (đã xác minh 2026-07-17, nguồn: research 10). Với truy vấn nguyên mẫu "thép từ Trung Quốc", bảng thuế suất là con số *ít* quan trọng nhất — nhưng ta không giải quyết điều đó trong v1, và giao diện không được ngụ ý rằng ta có.
- Xác định tự động điều kiện đủ điều kiện C/O.
- Bất kỳ việc ghi nào vào VNACCS/ECUS.

---

## Giai đoạn 0 — Nền tảng (~1 tuần)

**Mục tiêu:** một repository mà một lập trình viên thứ hai có thể clone và chạy, và ba câu hỏi được trả lời làm thay đổi thiết kế nếu trả lời sai.

**Viết các ghi chú kiến thức `.agent` TRƯỚC bất kỳ đoạn mã nào.** Đây là điều có chủ đích. Nghiên cứu đằng sau dự án này chứa các sự kiện năm 2026 mà không dữ liệu huấn luyện của mô hình nào có, và một số trong đó đảo ngược những gì một người hợp lý sẽ giả định (các trang tổng hợp pháp lý "tiện lợi" bị chặn và thù địch về mặt pháp lý; công báo chính phủ có thẩm quyền thì mở toang). Một agent bắt đầu viết mã từ định kiến sẽ xây dựng sai thứ một cách tự tin. Các ghi chú là lan can bảo vệ.

Sản phẩm bàn giao:

- Khung sườn monorepo NestJS.
- Docker Compose: Postgres + pgvector.
- Công cụ migration được kết nối và một migration được áp dụng.
- Các ghi chú `.agent/` được viết và liên kết chéo.

### Ba câu hỏi mở mà Giai đoạn 0 phải giải quyết

Đây không phải là việc bận rộn nghiên cứu vô ích. Mỗi câu lật ngược một quyết định thiết kế.

**1. API customs.gov.vn có truy cập được không, và nó có tồn tại như mô tả không? — RESEARCH 10 VÀ 12 MÂU THUẪN TRỰC TIẾP VỚI NHAU. ĐÃ GIẢI QUYẾT (2026-07-18).**

**Đã giải quyết 2026-07-18.** Chủ sở hữu quan sát trực tiếp trên trình duyệt (tab Network của devtools) rằng cổng biểu thuế customs.gov.vn *gọi* endpoint `bridge` (`POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`) và nhận dữ liệu trả về. Điều này bác bỏ giả thuyết của research 12 rằng cổng chỉ là một lớp vỏ JS mà backend duy nhất là IP thô `123.30.210.236:8080` (đã timeout), và xác nhận research 10 rằng `bridge` là endpoint sống. Hai báo cáo mô tả các endpoint khác nhau — cả hai có thể đều đúng — nhưng dự án này cố ý KHÔNG theo đuổi backend IP-thô; quyết định của chủ sở hữu là dùng `bridge`. Đây là một **quan sát trên tab Network, không phải một lần tái tạo bằng `curl` trần**: việc tái tạo bằng `curl` từ mạng công ty, bắt một phản hồi mẫu cho một mã HS đã biết để đối chiếu với bộ phận khai báo, và thăm dò giới hạn tốc độ vẫn còn phải làm (chưa xong, nhưng không chặn thiết kế). Trạng thái của API **không đổi**: vẫn là một lớp kiểm chứng chéo tiện lợi, KHÔNG phải nguồn chân lý — pipeline `.doc` Công báo vẫn là con đường chịu tải.

Mâu thuẫn này được tái hiện đầy đủ trong mục Chưa xác minh bên dưới và trong [tariff-system.md](../concepts/tariff-system.md). Tóm tắt bất đồng:

- Research 10 báo cáo đã điều khiển trang trong Chrome, bắt được XHR, và tái tạo nó bằng `curl` trần đối chiếu với `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue` — không xác thực, không captcha — trả về MFN cộng với tất cả các thuế suất FTA cho mỗi dòng HS (đã xác minh 2026-07-17, nguồn: research 10).
- Research 12 báo cáo cổng thông tin là một lớp vỏ JS mà `/scripts/main.js` của nó mã hóa cứng một backend *khác* tại `http://123.30.210.236:8080/hqcustomsapi/` — IP thô, HTTP thuần, bao gồm một endpoint `CheckCaptcha` — và rằng IP này **bị timeout**. Research 12 dứt khoát từ chối tuyên bố không thể truy cập, nói rằng nó không thể phân biệt việc chặn theo địa lý với việc chặn egress của sandbox của chính nó (đã xác minh 2026-07-17, nguồn: research 12).

Hai báo cáo mô tả các endpoint khác nhau, nên cả hai có thể đều đúng — một proxy `bridge` trên host chính và một backend IP-thô riêng biệt. **Đã giải quyết 2026-07-18 (xem đầu mục): quan sát trực tiếp trên trình duyệt cho thấy cổng gọi `bridge` và nhận dữ liệu; backend IP-thô cố ý không theo đuổi.** API là một bước kiểm chứng chéo. Nó không bao giờ trở thành nguồn chân lý: nó không có thẩm quyền pháp lý, không có tài liệu, không có phiên bản, không có sự cho phép trong ToS, và chính research 10 phát hiện độ phủ FTA của nó lỗi thời (không có VIFTA, không có CEPA; giá trị `THOI_GIAN_CAP_NHAT` là 2019–2020) (đã xác minh 2026-07-17, nguồn: research 10). Nghị định là luật; API là một tiện lợi.

**2. Các trường `provisionTree` và `referenceProvisions` của vbpl.vn có bao giờ được điền dữ liệu không?**

vbpl.vn đã được xây dựng lại vào 2026-04-23; mọi scraper hiện có và mọi tập dữ liệu công khai đều nhắm vào một trang không còn tồn tại (đã xác minh 2026-07-17, nguồn: research 04). JSON của Server Action của nó mang `references[]` với một trường `referenceProvisions` và một trường `provisionTree` — cả hai đều `null` trên hai tài liệu mà research 04 lấy mẫu. Nó không thể xác minh liệu chúng có bao giờ được điền dữ liệu không (đã xác minh 2026-07-17, nguồn: research 04). Nếu chúng được điền dữ liệu trên toàn trang, đó là một đồ thị pháp lý ở cấp điều khoản (điều/khoản), điều mà research 04 gọi là "toàn bộ trận đấu" cho giai đoạn RAG về sau. Kiểm thử 10–20 tài liệu gần đây. Điều này không chặn Giai đoạn 1 — vbpl không phải là nguồn thuế suất — nhưng nó quyết định schema của Giai đoạn 5, và nó rẻ để trả lời ngay bây giờ.

**3. Phân tích DOCX nhận biết bảng có bịt được lỗ hổng mà research 12 để lại không?**

Đây là câu chặn Giai đoạn 1, và nó là câu hỏi kỹ thuật đơn lẻ quan trọng nhất trong dự án ngay bây giờ.

Research 12 đã trích xuất 11.874 mã HS 8 chữ số duy nhất từ các phần `.doc` Công báo của Nghị định 26/2023/NĐ-CP bằng `textutil` của macOS, và các bảng phụ lục ra sạch sẽ, một ô mỗi dòng (đã xác minh 2026-07-17, nguồn: research 12). Nhưng trên nghị định EVFTA (Nghị định 116/2022/NĐ-CP) `textutil` gộp một dòng bảng thành một dòng duy nhất và tạo ra thế này:

```
2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9
```

Đó là sáu thuế suất hằng năm — `29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9` — nối liền với nhau **không có dấu phân cách**, trong một locale dùng dấu phẩy thập phân. Không thể khôi phục nếu không có heuristic. Research 12 nói rõ rằng nó đang **suy luận, không khẳng định**, rằng đây là một tạo phẩm của `textutil`: RCEP (Nghị định 129/2022/NĐ-CP) có cấu trúc cột sáu năm giống hệt và trích xuất hoàn hảo, điều này gợi ý rằng một parser nhận biết bảng thật sự đọc `w:tbl/w:tr/w:tc` từ XML sẽ khắc phục được. Nó không thể chứng minh điều này — không có `soffice`, `antiword`, hay `python-docx` khả dụng trong môi trường đó. Nó gọi đây là "lỗ hổng duy nhất mà người xây dựng phải bịt trước khi tin tưởng bất cứ thứ gì" (đã xác minh 2026-07-17, nguồn: research 12).

Bịt nó: LibreOffice `.doc` → `.docx`, rồi `python-docx` (hoặc tương đương) đọc các ô bảng theo cấu trúc. Chứng minh nó trên đúng dòng EVFTA ở trên. Nếu một parser thật sự cũng thất bại trong việc tách sáu thuế suất đó, phạm vi của Giai đoạn 1 thu hẹp chỉ còn MFN và các biểu thuế FTA cần một cách tiếp cận hoàn toàn khác.

---

## Giai đoạn 1 — Tra cứu thuế suất, không AI (~1–2 tuần)

**Mục tiêu:** bộ phận khai báo có thể tra cứu một thuế suất và tin tưởng nó. Dùng được ngay ngày ra mắt.

Không có mô hình nào trong giai đoạn này. Xem [Không dùng LLM cho con số biểu thuế](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md). Một thuế suất là một sự kiện với một nguồn pháp lý, không phải một token được sinh ra.

### Nguồn chân lý: `.doc` Công báo

**Nguồn chính là `congbao.chinhphu.vn`**, và lý do quan trọng hơn lựa chọn:

- Nó **có thẩm quyền**. Công báo là bản công bố chính thức; các phiên bản `_signed` là văn bản được công bố hợp pháp (đã xác minh 2026-07-17, nguồn: research 04).
- Nó **cho phép robots**: `robots.txt` là `User-agent: * / Allow: /`, không có Cloudflare, không cần JS — `curl` thuần trả về HTML được render phía máy chủ (đã xác minh 2026-07-17, nguồn: research 04 và research 12, độc lập).
- Nó có **bảng Word thật sự**. Research 12 đã trích xuất 11.874 mã HS 8 chữ số duy nhất từ 14 phần `.doc` của nó cho ND 26/2023 (đã xác minh 2026-07-17, nguồn: research 12).

Những gì ta *không* dùng, và vì sao — điều này đảo ngược giả định hiển nhiên:

- **PDF của chinhphu.vn là bản quét.** Research 12 đã tải cả hai PDF của ND 26/2023 và kiểm tra bên trong: chuỗi producer `Kodak Alaris Inc.`, đúng một ảnh bilevel `/CCITTFaxDecode` mỗi trang, 1666×2329 px ≈ 200 DPI đơn sắc, và `26-nd-2.pdf` chứa **không đối tượng `/Font` nào** — hoàn toàn không có lớp văn bản. 1.016 trang quét nén fax thuần túy, ở DPI dưới mức 300 thường cần cho các bảng số dày đặc với dấu tiếng Việt (đã xác minh 2026-07-17, nguồn: research 12, `datafiles.chinhphu.vn/cpp/files/vbpq/2023/6/26-nd.signed.pdf` và `26-nd-2.pdf`).
- **vbpl.vn không phải là nguồn thuế suất** và `robots.txt` của nó cấm `/Pages/`, chính là nơi kho legacy nằm (đã xác minh 2026-07-17, nguồn: research 12). Trang được xây dựng lại cho phép `/van-ban/` (đã xác minh 2026-07-17, nguồn: research 04) — liên quan đến Giai đoạn 5, không phải ở đây.
- **thuvienphapluat.vn: không cào.** 403 qua Cloudflare; `robots.txt` nêu tên `ClaudeBot` với `Disallow: /`; `Content-Signal: search=yes, ai-train=no, use=reference`, được diễn đạt như một bảo lưu quyền minh thị theo Điều 4 của Chỉ thị EU 2019/790. Các file Excel biểu thuế của nó là một sản phẩm thương mại (đã xác minh 2026-07-17, nguồn: research 04 và research 12). Đây là nguồn rủi ro pháp lý cao nhất, không phải lối tắt như nó trông có vẻ.

Research 12 nêu sự trớ trêu một cách rõ ràng, và nó đáng được thấm nhuần: **hai trang tổng hợp "tiện lợi" đều bị chặn về mặt kỹ thuật và thù địch về mặt pháp lý, trong khi nguồn sơ cấp có thẩm quyền thì mở toang và có dữ liệu tốt hơn hẳn.**

API customs.gov.vn — endpoint `bridge` đã được **quan sát trực tiếp trên trình duyệt** là truy cập được (2026-07-18) — là một **bước kiểm chứng chéo**: một ý kiến thứ hai bất đồng ầm ĩ khi bản phân tích của ta sai. Không phải một nguồn.

### Phân tích nhận biết phụ lục là một yêu cầu cứng, không phải một điều tốt-có-thì-hay

Đây là ràng buộc tính đúng đắn đơn lẻ quan trọng nhất trong Giai đoạn 1, và nó xứng đáng với vị thế đó từ một thất bại đã được đo lường.

Bản phân tích ngây thơ đầu tiên của research 12 báo cáo **thành công 94% và đã sai một cách tự tin**. Truy vết `0301.11.10`:

- **Phụ lục I (Biểu thuế xuất khẩu)** → `0301.11.10 = 0`
- **Phụ lục II (Biểu thuế nhập khẩu ưu đãi)** → `0301.11.10 = 15`

**1.520 mã HS xuất hiện ở cả hai phụ lục; 1.329 mã trong số đó có thuế suất khác nhau.** Một parser bỏ qua ranh giới phụ lục trả về thuế suất **xuất khẩu** cho một câu hỏi **nhập khẩu** — một cách âm thầm, không lỗi, ở mức thành công biểu kiến 94% (đã xác minh 2026-07-17, nguồn: research 12).

Bản tóm tắt của chính research 12 về ý nghĩa của điều này với toàn bộ hạng mục dự án: *"không phải dữ liệu thiếu, mà là dữ liệu sai trông có vẻ hợp lý"* — và parser thất bại **trong khi báo cáo thành công**. Mỗi dòng ta nạp phải mang phụ lục mà nó đến từ đó như một trường hạng nhất. Một dòng không có phụ lục đã biết thì không được nạp.

Cấu trúc phụ lục của ND 26/2023 như đã trích xuất (đã xác minh 2026-07-17, nguồn: research 12):

| Phụ lục | Nội dung | HS duy nhất | Có thuế suất |
|---|---|---|---|
| Phụ lục I | Biểu thuế xuất khẩu | 1.520 | 1.471 (96,8%) |
| Phụ lục II | Biểu thuế nhập khẩu ưu đãi (MFN) | 11.874 | 11.160 (94,0%) |
| Phụ lục III | Thuế tuyệt đối/hỗn hợp (xe đã qua sử dụng) | — | 0 — số tiền USD, không phải % |
| Phụ lục IV | Thuế suất TRQ ngoài hạn ngạch | — | 0 — cấu trúc riêng |

Phụ lục III và IV trả về không cho một regex `%` không phải là một lỗi parser; đó là dữ liệu đang nói với bạn rằng những phụ lục đó có hình dạng khác. Hãy mô hình hóa chúng như vậy hoặc loại trừ chúng một cách rõ ràng.

### Mô hình thời gian: as-of, không phải "mới nhất"

Phát hiện trung tâm của research 12 là vấn đề khó không phải là việc thu thập — mà là tính thời sự pháp lý. Ba sự kiện cộng dồn, tất cả đã xác minh:

1. **Không có thời gian chuẩn bị.** Nghị định 72/2026/NĐ-CP được **ký 2026-03-09 và có hiệu lực cùng ngày** ("kể từ ngày ký"), cắt giảm xăng/naphtha/reformate từ 10% xuống 0% (đã xác minh 2026-07-17, nguồn: research 12).
2. **Độ trễ công báo vượt quá ngày hiệu lực.** Chính nghị định đó được công bố trong Công báo số 157 vào **2026-03-24 — 15 ngày sau khi nó đã là luật có hiệu lực ràng buộc.** (ND 26/2023: ký 2023-05-31, công báo 2023-06-19, ~19 ngày. EVFTA ND 116/2022: ký 2022-12-30, công báo từ 2023-02-16, ~48 ngày.) **Có một cửa sổ nhiều tuần trong đó thuế suất có hiệu lực pháp lý không tồn tại ở dạng máy đọc được ở bất cứ đâu — chỉ có dưới dạng một bản quét 200-DPI** (đã xác minh 2026-07-17, nguồn: research 12).
3. **Các nghị định hết hiệu lực và âm thầm hồi quy.** ND 72/2026 chỉ có hiệu lực **đến 2026-04-30** — một cửa sổ 52 ngày — sau đó thuế suất hồi quy về ND 26/2023. Một thiết kế "cào bản mới nhất" không có khái niệm về điều này. Nó sẽ phục vụ xăng 0% mãi mãi (đã xác minh 2026-07-17, nguồn: research 12).

Do đó: `effective_from` / `effective_to` là hạng nhất, truy vấn nhận một ngày as-of, và hệ thống **từ chối hoặc cảnh báo khi snapshot của nó có thể lỗi thời** thay vì đoán. Xem [Hiệu lực bitemporal ngay từ đầu](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md).

Cũng hãy mô hình hóa phiên bản HS như một chiều với ngày hiệu lực — đừng mã hóa cứng AHTN 2022. HS 2028 có hiệu lực 2028-01-01 (đã xác minh 2026-07-17, nguồn: research 10, dẫn WCO; được research 09 chứng thực dẫn phiên họp HSC lần thứ 75, tháng 4 năm 2025). Research 10 còn cảnh báo rằng về cơ bản toàn bộ kho nghị định FTA hết hiệu lực 2027-12-31, va chạm với việc chuyển đổi AHTN 2028 — một sự thay thế toàn bộ kho khoảng 18 tháng nữa (đã xác minh 2026-07-17, nguồn: research 10). Research 12 cũng đánh dấu chính vách đứng 2027 đó nhưng ghi nó là **suy luận, chưa xác minh**.

### Hợp đồng API

```
GET /tariff?hs=<8-digit>&origin=<country>&date=<YYYY-MM-DD>
```

Trả về: thuế suất + nghị định điều chỉnh + ngày as-of + điều kiện.

Trường `conditions` không phải là trang trí. Research 12 nhấn mạnh rằng `(HS, country) → rate` **thậm chí không phải là một hàm**:

- **MFN so với FTA là có điều kiện, không tự động.** RCEP Điều 4 yêu cầu quy tắc xuất xứ *cộng với một giấy chứng nhận xuất xứ hợp lệ*. "Thuế là 0%" là sai; "0% *nếu* bạn có C/O hợp lệ, ngược lại 15% MFN" mới đúng (đã xác minh 2026-07-17, nguồn: research 12).
- **RCEP Điều 6.2 có quy tắc thuế suất cao nhất** trên toàn các phụ lục đối với một số hàng hóa đa xuất xứ — đã xác minh nguyên văn trong văn bản nghị định: *"Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."* (đã xác minh 2026-07-17, nguồn: research 12).
- **`*` nghĩa là loại trừ, không phải bằng không.** Research 12 tìm thấy 54 ô `*` trong một số công báo RCEP duy nhất (đã xác minh 2026-07-17, nguồn: research 12).
- **Hàng hóa TRQ** (nhóm 04.07, 17.01, 24.01, 25.01, đã xác minh trong văn bản ND 129/2022) phụ thuộc vào tình trạng hạn ngạch; thuế suất ngoài hạn ngạch nằm ở một phụ lục khác (đã xác minh 2026-07-17, nguồn: research 12).

Vậy nên phản hồi phải có khả năng nói "có điều kiện", và giao diện phải hiển thị điều kiện. Một con số vô điều kiện sẽ là một lời nói dối.

### Xong khi

- **Thuế suất của một lô hàng thực tế khớp với ECUS.** Không phải một fixture kiểm thử — một tờ khai thực tế mà bộ phận khai báo đã nộp.
- **20 mã HS được lấy mẫu ngẫu nhiên đối chiếu bằng tay.** Lấy mẫu ngẫu nhiên, không chọn tay. Mẫu chọn tay xác nhận parser mà bạn đã viết; mẫu ngẫu nhiên tìm ra lỗi phụ lục.

---

## Giai đoạn 2 — Ứng viên HS kèm bằng chứng (~3–4 tuần)

**Mục tiêu:** với một mô tả hàng hóa, trả về ba mã ứng viên, mỗi mã kèm văn bản pháp lý nguyên văn hỗ trợ nó, để một con người có thể quyết định nhanh hơn và bảo vệ quyết định về sau.

### Vì sao ứng viên chứ không phải đáp án

Các con số làm rõ luận điểm này mà không cần vòng vo (tất cả đã xác minh 2026-07-17, nguồn: research 09):

| Hệ thống | Độ chính xác |
|---|---|
| Chuyên gia con người (HSCodeComp, 10 chữ số) | **95,0%** |
| Agent tự động tốt nhất (SmolAgent + GPT-5 VLM) | 46,8% |
| GPT-5, chỉ LLM, không công cụ | 29,0% |
| Cơ quan Hải quan Hàn Quốc — **top-3 ở 6 chữ số, kèm bằng chứng** | **93,9%** |
| Quy trình agentic xác định — top-3 ở 6 chữ số | 78,3% |
| Quy trình agentic xác định — top-3 ở 4 chữ số | 91,5% |

Nguồn: [HSCodeComp, arXiv:2510.19631](https://arxiv.org/html/2510.19631); [KCS, arXiv:2311.10922](https://arxiv.org/abs/2311.10922); [Deterministic Agentic Workflow, arXiv:2605.14857](https://arxiv.org/html/2605.14857).

Kết luận của research 09: *"Khoảng cách giữa 47% và 93,9% không phải là năng lực mô hình — mà là hợp đồng đầu ra."* Hệ thống KCS được đánh giá trên 5.000 yêu cầu phân loại gần đây trên 925 phân nhóm khó, và một nghiên cứu người dùng với 32 chuyên gia hải quan xác nhận các gợi ý cộng với giải thích đã giảm đáng kể thời gian rà soát. Top-3 + bằng chứng + con người quyết định là một sản phẩm có thể ra mắt. Top-1 tự động thì không.

Mối nguy hiểm rất cụ thể và đó là lý do giai đoạn này có một cổng chặn cứng. Research 09: các lỗi chủ yếu áp đảo là **"Error but Valid"** — mô hình xuất ra một mã HS thật, trông hợp pháp nhưng sai. **Không có tín hiệu cú pháp nào của thất bại.** Không ngoại lệ, không lỗi phân tích, không cờ đỏ. Nó trôi vào VNACCS, được chấp nhận, và nổi lên ba năm sau như một cuộc kiểm tra sau thông quan. Theo Nghị định 128/2020/NĐ-CP (được sửa đổi bởi 102/2021/NĐ-CP): 20% của phần thiếu nếu hải quan phát hiện, cộng với truy thu toàn bộ cộng với tiền chậm nộp ở mức 0,03%/ngày, cộng với mất ưu đãi FTA và rủi ro chống bán phá giá hồi tố (đã xác minh 2026-07-17, nguồn: research 09).

Và trách nhiệm pháp lý hoàn toàn thuộc về người khai. Research 09, dẫn bình luận của giới hành nghề: *"Một công cụ AI tạo ra một con số mười chữ số trông có vẻ hợp lý không phải là sự cẩn trọng hợp lý."* "Nền tảng đã cho tôi mã HS" không phải là một biện hộ.

### Dữ liệu cần nạp

- **Chú giải chương và phần** — Thông tư 31/2022/TT-BTC, vẫn là danh mục hiện hành vào năm 2026 (đã xác minh 2026-07-17, nguồn: research 09 và research 10). Phụ lục II của TT 31/2022 mang 6 quy tắc tổng quát về diễn giải. Cấu trúc: 21 phần / 97 chương / 1.228 nhóm bốn chữ số / 4.084 phân nhóm sáu chữ số / 11.414 dòng tám chữ số (đã xác minh 2026-07-17, nguồn: research 10).
- **SEN 2022** — được lưu hành bởi Công văn 3866/TCHQ-TXNK (2023-07-24), chỉ có PDF (đã xác minh 2026-07-17, nguồn: research 09, [PDF](https://thuvienxuatnhapkhau.com/wp-content/uploads/2023/07/3866_Chu-giai-SEN-2022.pdf)). Lưu ý SEN **không có tính ràng buộc độc lập** — một lập luận dựa trên SEN mà mâu thuẫn với Chú giải chi tiết của WCO là yếu về mặt pháp lý (đã xác minh 2026-07-17, nguồn: research 09). Gắn nhãn bằng chứng theo cấp thẩm quyền của nó; đừng trình bày SEN như thể nó là một chú giải chương.

### Hình dạng pipeline

Có cấu trúc, không agentic. Research 09 về bài báo quy trình agentic xác định: nó bác bỏ các agent tự động, dùng một **pipeline cố định mà luồng điều khiển được quyết định bởi chính hệ thống phân cấp biểu thuế** thay vì được LLM khám phá tại thời điểm chạy, và **biên dịch trước các GRI và chú giải chương/phần ngoại tuyến thành các mệnh đề có kiểu — bao gồm, loại trừ, quy tắc ưu tiên** — chỉ nạp ngữ cảnh chú giải chương đắt đỏ ở giai đoạn cần nó. Nó đạt khoảng **2× agent tự động tốt nhất** trên cùng benchmark (đã xác minh 2026-07-17, nguồn: research 09).

Vậy nên: chương → nhóm → phân nhóm như **các giai đoạn riêng biệt**. Chú giải chương được biên dịch trước ngoại tuyến thành các mệnh đề bao gồm/loại trừ/ưu tiên có kiểu. Đừng đổ danh mục vào một prompt.

Ba phát hiện từ research 09 nên giết chết các lối tắt hiển nhiên trước khi ai đó thử chúng:

- **Mở rộng quy mô tại thời điểm kiểm thử không giúp ích ở đây.** Bỏ phiếu đa số và tự phản ánh cho kết quả cải thiện không đáng kể trên HSCodeComp — khác với các miền suy luận khác.
- **Cung cấp cho mô hình các quy tắc quyết định do con người viết rõ ràng *làm giảm* hiệu suất đối với hầu hết các hệ thống.** Nhiều quy tắc nhồi vào prompt ≠ tốt hơn. Đây là lý do các quy tắc được biên dịch thành các mệnh đề có kiểu và dùng làm luồng điều khiển, không dán vào ngữ cảnh.
- **Một mô hình open-weight 27B đạt 84,2% (4 chữ số) / 77,4% (6 chữ số) đồng thuận với mô hình frontier** trong pipeline có cấu trúc. Hầu hết pipeline không cần một mô hình frontier.

Chẩn đoán về vì sao prompting đầu-cuối thất bại, đáng mang theo: nó *"thất bại một cách đặc trưng bằng cách giải quyết một trục trong khi bỏ qua các ràng buộc ưu tiên trên các trục khác"* (chất liệu vs chức năng vs hình thức phải được giải quyết theo đúng thứ tự).

### Các ràng buộc thiết kế không thể thương lượng

- **Mỗi ứng viên trích dẫn thẩm quyền của nó nguyên văn.** Trích dẫn chú giải chương / chú giải phần / mục SEN — đừng diễn giải lại. Research 09: đây là điều mà nghiên cứu KCS đã chứng minh mang lại giá trị — *không phải dự đoán, mà là việc truy xuất bằng chứng*. Nó cũng là tạo phẩm bảo vệ được duy nhất khi một Chi cục Hải quan khu vực thách thức mã; nó trở thành hồ sơ.
- **Không bao giờ đưa mã ưu tiên của người dùng vào prompt như một tiền đề.** Research 09 đánh dấu việc khuếch đại thiên kiến xác nhận là thất bại mà một LLM dễ mắc nhất và là thất bại có hậu quả pháp lý tệ nhất — *"nếu bạn muốn HTS của mình là X (ngay cả khi HTS đúng là Y), AI sẽ cho bạn một lập luận (hoặc ba) để hỗ trợ HTS ưu tiên của bạn"*. Nó chế tạo dấu vết giấy tờ cho một sự quy kết trốn thuế. Mô hình là một luật sư bào chữa xu nịnh, không phải một thẩm phán.
- **Từ chối một cách rõ ràng.** Đầu ra có giá trị cao nhất trên một hàng hóa khó là "hai nhóm này đều có vẻ áp dụng được, đây là các chú giải cạnh tranh, việc này cần xác định trước mã số." Định tuyến đến quy trình xác định trước theo Điều 28 là một **tính năng**, không phải một thất bại — đó là cơ chế duy nhất tạo ra sự chắc chắn pháp lý ở Việt Nam (đã xác minh 2026-07-17, nguồn: research 09).

### Xong khi — và đây là một cổng chặn cứng

- **Top-3 ≥ 80% trên bộ golden set.**
- **Mỗi ứng viên mang một trích dẫn nguyên văn kiểm tra được.**

**Nếu top-3 < 80%, không ra mắt.** Không phải "ra mắt với một tuyên bố miễn trừ." Không ra mắt. Một công cụ HS sai còn tệ hơn không có công cụ HS, bởi vì nó chế tạo sự tự tin sai lầm đúng tại nơi các lỗi vô hình — "Error but Valid" nghĩa là nhân viên không thể phân biệt một đáp án sai với một đáp án đúng nếu không làm lại toàn bộ công việc, chính là công việc mà công cụ tuyên bố sẽ tiết kiệm.

---

## Giai đoạn 3 — Web UI + xác thực nội bộ (~1 tuần)

Chỉ người dùng nội bộ. Ứng dụng web thuần túy. Nhiệm vụ chính của giao diện là sự trung thực: hiển thị nghị định điều chỉnh, ngày as-of, phụ lục, các điều kiện, và trạng thái lỗi thời. Một con số không có nguồn của nó không phải là đầu ra có thể ra mắt trong dự án này.

---

## Giai đoạn 4 — Cảnh báo chính sách / giấy phép (~2–3 tuần, RỦI RO CAO)

**Mục tiêu:** báo cho người khai rằng một lô hàng cần một giấy phép, một cuộc kiểm tra, hoặc chạm phải một điều cấm — trước khi họ khai.

**Giai đoạn này rủi ro cao và ước tính là kém đáng tin nhất trong tài liệu này.** Các lý do mang tính cấu trúc (tất cả đã xác minh 2026-07-17, nguồn: research 08):

- **Không có API ở bất cứ đâu.** VNTR (`vntr.moit.gov.vn`) và Vietnam Trade Portal cả hai đều *nội bộ* mô hình hóa các quan hệ hàng hóa ↔ biện pháp ↔ thủ tục, nhưng không bên nào phơi bày nó — chỉ có web UI, không xuất hàng loạt. VNSW không có API công khai và cơ chế kết nối "chưa được quy định đầy đủ." eCoSys không có API công khai.
- **Ground truth là các phụ lục PDF/Word đính kèm với các thông tư của bộ.** **Không có danh mục chủ duy nhất.** Mỗi bộ công bố "bảng mã số HS" thông tư riêng của mình. Đó là khóa nối, và nó phải được lắp ráp từ ~6 bộ riêng biệt.
- **Chính các bộ đã di chuyển vào năm 2025.** Bộ NN&PTNT + Bộ TN&MT → **Bộ Nông nghiệp và Môi trường** (vận hành 2025-03-01). Bộ GTVT + Bộ Xây dựng → **Bộ Xây dựng**. Bộ TT&TT + Bộ KH&CN → **Bộ Khoa học và Công nghệ**. Tiền tố thông tư thay đổi: `TT-BNNPTNT` → `TT-BNNMT`. **Một bảng mã khóa theo tên bộ vỡ ở đây.** Mô hình hóa các bộ như các thực thể với bí danh và khoảng thời gian hiệu lực.
- **Không phải mọi thứ đều khóa theo HS.** CITES khóa theo **loài** — chỉ mã HS không thể xác định khả năng áp dụng CITES. Phế liệu khóa theo HS **cộng với một giấy phép môi trường ở cấp doanh nghiệp**. Chế độ chất lượng hậu Luật 78/2025 khóa theo **cấp độ rủi ro**. Một mô hình dữ liệu chỉ-HS là không đủ về mặt cấu trúc.

Câu chuyện cảnh báo biện minh cho mô hình thời gian, đã xác minh từ đầu đến cuối: **Nghị định 46/2026/NĐ-CP** (2026-01-26) được ban hành để thay thế ND 15/2018 về an toàn thực phẩm; **Nghị quyết 09/2026/NQ-CP** (2026-02-04) **đình chỉ nó chỉ hơn một tuần sau đó**; việc đình chỉ sau đó được gia hạn cho đến khi Luật An toàn Thực phẩm sửa đổi có hiệu lực. **ND 15/2018 do đó vẫn còn hiệu lực đến hôm nay.** Một nghị định có thể là luật-trên-giấy, bị thay thế, bị đình chỉ, và được hủy đình chỉ trong vòng 10 tuần (đã xác minh 2026-07-17, nguồn: research 08). Mọi quy tắc cần một ngày `as_of` và một trường trạng thái, không chỉ một trích dẫn.

**Bắt đầu chỉ với Bộ Công Thương.** Một bộ, một tập phụ lục, chứng minh hình dạng, rồi quyết định liệu năm bộ còn lại có đáng không. Đừng cố gắng làm sáu bộ cùng một lúc.

---

## Giai đoạn 5+ — RAG pháp lý (chỉ sau khi hải quan chạy thực sự)

Đừng bắt đầu điều này cho đến khi Giai đoạn 1–3 đã được bộ phận khai báo sử dụng hàng ngày. Xem [Hải quan trước, luật sau](../architecture-decisions/2026-07-17-customs-first-law-later.md).

Những gì nghiên cứu đã cho ta biết, để thiết kế về sau không bắt đầu từ con số không (tất cả đã xác minh 2026-07-17, nguồn: research 02):

- **Chia khối theo cấu trúc — lập chỉ mục theo từng Khoản, trả về Điều cha.** Nghiên cứu BGB của Đức (2.455 điều, 525 câu hỏi với nhãn vàng ở cấp điều, 21 chiến lược được so sánh, [arXiv:2605.19806](https://arxiv.org/pdf/2605.19806)) đo Recall@10: khoản 0,47, điều 0,46, câu 0,45, kích thước cố định tốt nhất 0,37, kích thước cố định tệ nhất 0,31. **Cấu trúc thắng kích thước cố định một cách dứt khoát; Điều so với Khoản làm đơn vị chỉ mục về mặt thống kê là ngang nhau.** Điều quan trọng không phải là cắt ngang các ranh giới cấu trúc. Đây là lý do "chia khối theo Điều" như một chỉ dẫn trần trụi là vô dụng — lý do là ý nghĩa pháp lý bị giới hạn bởi cấu trúc, và các cửa sổ kích thước cố định cắt đứt nó.
- **Bỏ qua việc chia khối dựa trên LLM.** Cùng nghiên cứu: Lumber mất 9h–11h41m để xây dựng và RAPTOR 3h–5h51m, so với **51 giây** cho việc chia khối theo điều — cho recall *tệ hơn* (0,37 và ~0,40 so với 0,46). Một kết quả âm hữu ích chống lại phản xạ "ném một LLM vào việc chia khối."
- **Recall tuyệt đối là ~0,47 ngay cả với người thắng.** Chia khối là điều kiện cơ bản, không phải nơi RAG pháp lý được quyết định.
- **Document-Level Retrieval Mismatch là thất bại hàng đầu** — khối trông đúng, văn bản sai — được quan sát **vượt quá 95% trên một số tập dữ liệu** ([arXiv:2510.06999](https://arxiv.org/html/2510.06999v1)). Thêm một tóm tắt ~150 ký tự ở cấp tài liệu vào đầu mỗi khối giảm nó xuống khoảng một nửa. Rất liên quan đến luật Việt Nam, nơi "Điều 5. Giải thích từ ngữ" gần như giống hệt về mặt văn bản trên hàng trăm văn bản.
- **Kết hợp BM25 + dense, có trọng số theo mức độ embedding của bạn được thích nghi.** Dense sẵn-có **thua** BM25 trên văn bản pháp luật Việt Nam (SBV-LawGraph: BM25 R@1 0,57 so với dense ngây thơ 0,36; hybrid của họ là 75% BM25 / 25% ngữ nghĩa). Dense được tinh chỉnh **thắng** BM25 một cách dứt khoát (TVPL: BM25 MRR@10 21,60 so với ColBERT được tinh chỉnh 74,61). Đây là cùng một phát hiện từ hai phía — đừng sao chép một tỷ lệ trọng số từ một bài báo mà bạn không dùng mô hình embedding của nó.
- **Coi tính hiệu lực thời gian như một bộ lọc cứng, không phải một tín hiệu xếp hạng** ([arXiv:2605.23497](https://arxiv.org/abs/2605.23497)). Các mô hình biểu hiện thiên kiến gần đây — ưa thích các điều khoản mới hơn ngay cả khi phiên bản cũ hơn được áp dụng — và **chỉ RAG không sửa được điều đó**. Kho của SBV-LawGraph: trong 1.703 tài liệu, 863 bị bãi bỏ hoàn toàn, 191 bị bãi bỏ một phần, 639 còn hiệu lực — **~62% là luật chết hoặc chết một phần**.
- **Dùng văn bản hợp nhất đã công bố; đừng tự tính toán hợp nhất.** Kể từ **2026-07-01**, Pháp lệnh 01/2026/UBTVQH16 (ban hành 2026-06-10) làm cho các văn bản hợp nhất trở thành cơ sở chính thức để viện dẫn và áp dụng luật: *"Văn bản hợp nhất được cơ quan, tổ chức, cá nhân sử dụng làm căn cứ chính thức trong viện dẫn và áp dụng pháp luật"* (nguồn: [congbao.chinhphu.vn](https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm)). Phản đối pháp lý vốn sẽ chặn một kiến trúc dựa-trên-hợp-nhất đã được gỡ bỏ vài tuần trước. Xem [Dùng VBHN đã công bố, không tự hợp nhất](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md).
- **Đặt nền cho các trích dẫn bằng sự đòi hỏi lôgic (entailment), không phải sự tồn tại.** Magesh và cộng sự, *Journal of Empirical Legal Studies* 2025 ([doi:10.1111/jels.12413](https://doi.org/10.1111/jels.12413)) — đánh giá tiền đăng ký đầu tiên, 202 truy vấn: Lexis+ AI chính xác 65% và ảo giác >17%; Westlaw AI-Assisted Research chính xác 42%, ảo giác >34%. Ví dụ "Wilgarten" của họ là bài học thiết kế: khi được hỏi ý kiến của một **thẩm phán hư cấu**, Lexis+ AI trả về một **vụ án thật với một trích dẫn thật, được định dạng đúng** — không phải do vị thẩm phán không tồn tại đó viết. **"Mọi trích dẫn phân giải về một tài liệu thật" là một sự đảm bảo vô giá trị** — nó chính xác là điều nhà cung cấp quảng cáo và chính xác là điều thất bại.

---

## Yêu cầu đã xác nhận

- Tra cứu thuế suất xác định khóa bởi HS + biểu thuế + ngày, với nghị định điều chỉnh và ngày as-of trong mọi phản hồi.
- Gợi ý ứng viên HS dưới dạng top-3 với bằng chứng ghi chú pháp lý nguyên văn; con người quyết định.
- Ứng dụng web nội bộ, 5–50 nhân viên, không Zalo.
- NestJS + PostgreSQL/pgvector + Docker.
- Toàn bộ tài liệu bằng tiếng Anh (theo [AGENTS.md](../AGENTS.md)); giao tiếp với chủ sở hữu bằng tiếng Việt.

## Giả định

- **Các tờ khai quá khứ của bộ phận khai báo có sẵn và các mã HS của chúng đủ chuẩn để dùng làm bộ golden set.** Nếu các mã lịch sử của bộ phận khai báo bản thân chúng đang tranh cãi, cổng chặn Giai đoạn 2 đo sự đồng thuận với thực tiễn quá khứ, không phải tính đúng đắn. Báo cho chủ sở hữu trước khi xây dựng bộ golden set.
- **Đầu ra ECUS có sẵn làm ground truth Giai đoạn 1 cho ít nhất một lô hàng thực tế.** Tiêu chí chấp nhận của Giai đoạn 1 phụ thuộc vào điều này.
- **Công báo vẫn cho phép robots và tiếp tục công bố `.doc` bên cạnh PDF.** Đã xác minh hôm nay; không được đảm bảo.
- **Các liên kết tải có token của Công báo (`g7.cdnchinhphu.vn/api/download/stream`) vẫn dùng được hàng loạt.** Research 12 đã tải 14 phần thành công (đã xác minh 2026-07-17, nguồn: research 12); hành vi ở tốc độ duy trì chưa được kiểm tra.
- **Năm đến năm mươi nhân viên nghĩa là một instance Postgres duy nhất là đủ.** Không có gì trong nghiên cứu mâu thuẫn với điều này; đó là một giả định về quy mô, và nó có thể đảo ngược.
- **Tính đúng đắn của parser của research 12 khái quát hóa được.** Bảng của nó được xác thực độc lập: nó trích xuất `2710.12.21/.22/.24/.25/.80 = 10%` từ ND 26/2023, và báo chí về ND 72/2026 mô tả độc lập rằng nó cắt giảm đúng các mã đó *"từ 10% xuống 0%"* (đã xác minh 2026-07-17, nguồn: research 12). Đó là một kiểm chứng chéo trên một họ hàng hóa, không phải một chứng minh trên 11.874 dòng. Tiêu chí 20-mẫu-ngẫu-nhiên tồn tại vì điều này.

## Câu hỏi mở

1. **API customs.gov.vn có truy cập được không?** Research 10 và 12 mâu thuẫn. **Đã giải quyết 2026-07-18:** quan sát trực tiếp trên trình duyệt (tab Network) cho thấy cổng gọi endpoint `bridge` và nhận dữ liệu — dùng `bridge`, không theo đuổi backend IP-thô; vẫn là lớp kiểm chứng chéo, không phải nguồn chân lý. (Tái tạo bằng `curl`, bắt phản hồi mẫu, thăm dò rate-limit vẫn còn phải làm.)
2. **`provisionTree` / `referenceProvisions` của vbpl có được điền dữ liệu không?** Null trên cả hai tài liệu đã lấy mẫu. Quyết định schema của Giai đoạn 5.
3. **Phân tích DOCX nhận biết bảng có khôi phục được dòng sáu-thuế-suất EVFTA không?** Chặn phạm vi Giai đoạn 1.
4. **Bộ phận khai báo thực sự dùng những biểu thuế FTA nào?** ~26 mã biểu thuế nhập khẩu tồn tại theo cuộc gọi khám phá của research 10, nhưng công ty này sẽ dùng một số ít. Hỏi chủ sở hữu thay vì nạp toàn bộ chúng.
5. **Các mã HS lịch sử của bộ phận khai báo có đáng tin làm ground truth không?** Xem mục Giả định.
6. **Cơ sở hợp nhất cho MFN 2026 là gì?** Research 10 khẳng định **không có văn bản hợp nhất chính thức nào được công bố dưới dạng dữ liệu máy đọc được**, và rằng MFN 2026 đúng = ND 26/2023 ⊕ 199/2025 ⊕ 72/2026 ⊕ 201/2026 ⊕ 108/2025 (đã xác minh 2026-07-17, nguồn: research 10). Research 12 đưa ra một chuỗi khác một phần (144/2024, 199/2025, 72/2026). **Hai danh sách không khớp và không cái nào được xác nhận là đầy đủ.** Xác lập chuỗi thực từ Công báo trước khi nạp.

## Khu vực Rủi ro / Điều chưa biết

- **Khoảng cách thời gian không thể đóng lại bằng kỹ thuật.** Trong cửa sổ 15–48 ngày giữa ký và công bố công báo, luật ràng buộc chỉ tồn tại công khai dưới dạng một bản quét 200-DPI. Không lịch cào nào sửa được điều này. Hệ thống phải *biết* rằng nó có thể lỗi thời và nói ra. Đây là rủi ro xứng đáng nhất với sự chú ý của chủ sở hữu, bởi vì biện pháp giảm thiểu là một quyết định sản phẩm (từ chối / cảnh báo), không phải kỹ thuật.
- **Một thuế suất sai là trách nhiệm pháp lý do người khai gánh chịu, không phải do công cụ này.** Research 12: tờ khai hải quan có tính ràng buộc pháp lý; một thuế suất sai nghĩa là nộp thiếu → truy thu, phạt, và người khai gánh chịu.
- **Parser thành công 94% trả về thuế xuất khẩu cho các truy vấn nhập khẩu là hình ảnh của dự án này khi nó thất bại — và nó thất bại trong khi báo cáo thành công.** Các số liệu thành công phải mang tính phản biện, không phải xác nhận.
- **Ground truth của HS bản thân nó có thể tranh cãi.** Một cuộc rà soát 226 bất đồng cho thấy **~42,5% các dự đoán "sai" của mô hình thực ra được các quy tắc HS hỗ trợ tốt hơn so với ground truth đã công bố** (đã xác minh 2026-07-17, nguồn: research 09, [arXiv:2605.14857](https://arxiv.org/html/2605.14857)). Và 76% doanh nghiệp Việt Nam báo cáo gặp trở ngại trong việc xác nhận mã HS, tăng từ 66,3% năm 2018. Thường không có một đáp án đúng duy nhất ổn định.
- **Sự xáo trộn thể chế.** Tổng cục Hải quan chấm dứt tồn tại vào 2025-03-01 (Nghị định 29/2025/NĐ-CP); nay là Cục Hải quan thuộc Bộ Tài chính với 20 Chi cục Hải quan khu vực. Các tài liệu nay là `-CHQ`, không phải `-TCHQ` (đã xác minh 2026-07-17, nguồn: research 09). Bất kỳ việc phân tích số hiệu văn bản nào cũng phải xử lý được sự đứt gãy này.
- **VNACCS/VCIS được lên lịch thay thế** bởi hệ thống "Hải quan số", nhắm mục tiêu 2026-12-31 (đã xác minh 2026-07-17, nguồn: research 08). Bất cứ thứ gì được xây dựng dựa trên định dạng thông điệp VNACCS có vòng đời ~18 tháng. v1 không chạm vào VNACCS, một phần vì lý do đó.
- **Vách đứng FTA 2027-12-31 + AHTN 2028**, khoảng 18 tháng nữa. Research 10 xác minh các ngày hết hiệu lực; research 12 đánh dấu cách diễn đạt "chúng đều hết hiệu lực cùng nhau" là **suy luận**.

## Kế hoạch xác thực

| Giai đoạn | Cách nó tự chứng minh |
|---|---|
| 0 | Repo clone và chạy sạch trên một máy thứ hai. Mỗi trong ba câu hỏi mở có một câu trả lời bằng văn bản kèm bằng chứng, hoặc một "vẫn chưa biết" rõ ràng kèm những gì đã thử. |
| 1 | Thuế suất của một lô hàng thực tế khớp với ECUS. 20 mã HS **lấy mẫu ngẫu nhiên** đối chiếu bằng tay. Xuất xứ phụ lục hiện diện trên mọi dòng đã nạp. Một truy vấn với một ngày snapshot lỗi thời trả về một cảnh báo, không phải một con số tự tin. Kiểm chứng chéo đối chiếu với API customs.gov.vn qua endpoint `bridge` (đã quan sát truy cập được trên trình duyệt 2026-07-18) — các bất đồng được điều tra, không phải lấy trung bình. |
| 2 | Top-3 ≥ 80% trên bộ golden set được xây dựng trong TASK-001. Mỗi ứng viên mang một trích dẫn nguyên văn mà một con người có thể kiểm tra đối chiếu với văn bản nguồn. Dưới 80% → không ra mắt. |
| 3 | Bộ phận khai báo dùng nó trong một tuần mà không hỏi ai cách đọc đầu ra. Nghị định điều chỉnh và ngày as-of hiển thị trên mọi kết quả. |
| 4 | Một bộ (Bộ Công Thương) từ đầu đến cuối, với `as_of` + trạng thái trên mọi quy tắc. Xác minh lại đối chiếu với trường hợp đình chỉ ND 46/2026: mô hình có biểu diễn "ban hành rồi đình chỉ" đúng không? |
| 5+ | Chưa lên kế hoạch chi tiết. Đừng lên kế hoạch cho đến khi Giai đoạn 1–3 được dùng hàng ngày. |

## Chưa xác minh / Không được dựa vào

Tái hiện từ nghiên cứu. Đừng rửa bất kỳ điều nào trong số này thành các tuyên bố tự tin.

**research 10 vs research 12 về customs.gov.vn — ĐÃ GIẢI QUYẾT 2026-07-18.** Mâu thuẫn từng là cốt lõi của chiến lược dữ liệu của dự án này; hai báo cáo mô tả bất đồng như sau (giải quyết ở cuối mục):

- Research 10 tuyên bố một endpoint **đã xác minh hoạt động**: `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`, tái tạo bằng `curl` trần, không xác thực, không captcha, không kiểm tra Referer/Origin, trả về ~510 dòng cho `l_param: "8703"` và một cột cho mỗi chế độ thuế. Nó khẳng định captcha trên trang là chỉ phía client và không được API thực thi.
- Research 12 tìm thấy một backend **khác** được mã hóa cứng trong `/scripts/main.js` — `http://123.30.210.236:8080/hqcustomsapi/`, IP thô, HTTP thuần, cổng 8080, bao gồm `.../hqcustomsapi/captcha/CheckCaptcha` — và **IP đó bị timeout**. Nó dứt khoát từ chối tuyên bố không thể truy cập, nói rằng nó không thể phân biệt việc chặn theo địa lý với việc chặn egress của sandbox.

Cả hai có thể đều đúng (các endpoint khác nhau) hoặc một có thể sai. **Đã giải quyết 2026-07-18: chủ sở hữu quan sát trực tiếp trên trình duyệt (tab Network của devtools) rằng cổng gọi endpoint `bridge` và nhận dữ liệu trả về — xác nhận `bridge` (research 10) là endpoint sống; backend IP-thô của research 12 cố ý không theo đuổi.** Không quyết định thiết kế nào phụ thuộc vào `bridge`; nó vẫn là lớp kiểm chứng chéo, không phải nguồn chân lý. Ngay cả với `bridge` sống, các cảnh báo của chính research 10 vẫn đứng vững: độ phủ FTA lỗi thời (không có VIFTA, không có CEPA; `THOI_GIAN_CAP_NHAT` 2019–2020), chỉ có thuế suất năm hiện tại không có chuỗi năm tương lai, `l_bieu_thue` dường như bị bỏ qua đối với truy vấn nhập khẩu, không có tài liệu/không có phiên bản/không có SLA/không có sự cho phép trong ToS, và giới hạn tốc độ **vẫn chưa được thăm dò**.

Các cờ khác mang theo:

- **Việc nối liền sáu-thuế-suất EVFTA là một tạo phẩm của `textutil` — SUY LUẬN, KHÔNG CHỨNG MINH.** Research 12 không thể kiểm thử một parser nhận biết bảng thật sự. Nếu suy luận sai, phạm vi FTA Giai đoạn 1 thay đổi.
- **Cách diễn đạt "tất cả các nghị định FTA đợt 2022 đều hết hiệu lực cùng nhau vào 2027-12-31" được SUY LUẬN** bởi research 12, dù research 10 xác minh các ngày hết hiệu lực riêng lẻ từ hai nguồn độc lập. Lưu ý research 10 cũng đánh dấu rằng **AJCEP (ND 120/2022) và VJEPA (ND 124/2022) kéo dài đến 2028**, không phải 2027 — nên "chúng đều hết hiệu lực cùng nhau" vốn đã thiếu chính xác.
- **Nghị định 128/2022/NĐ-CP có thể hoàn toàn không phải một nghị định thuế FTA.** Research 10: cả hai nguồn của nó đều bỏ qua nó; đừng giả định một dải liền mạch 112–129.
- **data.gov.vn / open.data.gov.vn — CÓ TRANH CÃI.** Research 10 gặp lỗi DNS và đánh dấu nó "chưa xác minh, chưa xác nhận đã chết." Research 04 đi xa hơn: DNS có thẩm quyền nói **NXDOMAIN** từ zone `gov.vn` qua cả 8.8.8.8 và 1.1.1.1, với các control phân giải tốt, kết luận nó **không tồn tại** và rằng các công cụ tìm kiếm sai về điều này. Bằng chứng của research 04 mạnh hơn, nhưng hai bên không chính thức đồng thuận. Dù thế nào: không có API dữ liệu mở quốc gia cho các văn bản pháp luật.
- **Quyết định 117/QĐ-CHQ (2026)** — research 09 không thể lấy được toàn văn (paywall/403); đánh dấu chi tiết của nó là **độ tin cậy trung bình**. "Cơ sở dữ liệu phân loại thống nhất toàn ngành" của nó là một hệ thống **nội bộ**; đừng giả định nó sẽ bao giờ được phơi bày.
- **Các tuyên bố rằng "Claude 3.5 Sonnet và GPT-4 đạt ~80% ở 6 chữ số và >90% ở 2 chữ số"** — research 09 tìm thấy điều này trong một đoạn trích tìm kiếm không có nguồn sơ cấp truy vết được, và nó **mâu thuẫn với HSCodeComp**. Đừng dựa vào nó.
- **"1 trong 3 tờ khai hải quan bị phân loại sai"** — tuyên bố từ blog nhà cung cấp, không có trích dẫn sơ cấp. Có vẻ đúng hướng, không có nguồn.
- **Các tuyên bố về độ chính xác của nhà cung cấp là ~2× hiệu suất được đối chuẩn độc lập của họ.** Zonos quảng cáo "90%+ ngay từ đầu"; kiểm thử độc lập đặt nó ở **44,1% ở 10 chữ số**. 80% của Avalara đến từ một sản phẩm **rõ ràng bao gồm rà soát của chuyên gia con người**. Lưu ý benchmark nhỏ (n=103) và đặc thù US-HTS (đã xác minh 2026-07-17, nguồn: research 09, [arXiv:2412.14179](https://arxiv.org/html/2412.14179v1)).
- **Các route gateway của vbpl** (`vbpl-bientap-gateway.moj.gov.vn/api`) — đã tìm thấy, truy cập được, **chưa được ánh xạ**. Ánh xạ int `referenceType` → nhãn chưa biết (thấy `3`, `12`).
- **Hành vi cào ở tốc độ duy trì trên vbpl chưa được kiểm tra** — research 04 chỉ thực hiện ~40 yêu cầu. Không phải bằng chứng cho việc không có điều tiết ở quy mô 158k.
- **Danh sách chưa xác minh rõ ràng của research 08** mang vào Giai đoạn 4 trọn gói: TT 15/2026/TT-BCT, TT 26/2026/TT-BCT, VBHN 47/VBHN-BCT (một trích xuất độ tin cậy thấp duy nhất); ND 169/2026/NĐ-CP và ND 153/2026/NĐ-CP (một tóm tắt tìm kiếm duy nhất, **số hiệu đáng ngờ**); VBHN 67/VBHN-BNNMT (một nguồn duy nhất); liệu một thông tư BNNMT đã thay thế TT 01/2024/TT-BNNPTNT chưa; số lượng thủ tục VNSW hiện tại (con số tốt nhất là từ năm 2022). Và **"danh mục hàng hóa nhóm 2 bị loại bỏ từ 2026"** theo Luật 78/2025 — **có tranh cãi, có tính chi phối cho bất kỳ engine quy tắc nào, và dựa trên một nguồn thương mại duy nhất.** Xác minh đối chiếu với văn bản luật trước khi xây dựng.
- **SAT-Graph báo cáo không có đánh giá định lượng** — áp dụng mô hình dữ liệu, đừng trích dẫn nó như bằng chứng về hiệu suất. **SBV-LawGraph** có một tập đánh giá nhỏ (100 cặp QA), không có ablation cô lập đóng góp của knowledge graph, và không có báo cáo về sự đồng thuận giữa các người gán nhãn. Đúng hướng, không dứt khoát.
- **Không tồn tại so sánh đã công bố nào giữa các embedding thương mại (OpenAI/Voyage) với các mô hình đặc thù tiếng Việt trên văn bản pháp luật Việt Nam.** Research 02 đã tìm và khẳng định benchmark không tồn tại. Nếu lựa chọn đó quan trọng ở Giai đoạn 5, ta tự chạy nó.

## Kiểm tra tái sử dụng

- Các helper, module, hoặc mẫu hiện có đã tìm kiếm: repository chỉ chứa các ghi chú `.agent/`; chưa có mã ứng dụng nào.
- Mã hiện có để tái sử dụng hoặc mở rộng: không có.
- Các module mới cần thiết: nạp thuế suất, tra cứu thuế suất, ứng viên HS. Được biện minh — không có gì tồn tại.
- Lý do mã hiện có không đủ: greenfield.

## Tiêu chí thành công

Bộ phận khai báo dùng Giai đoạn 1 cho công việc thực tế và ngừng mở file Excel biểu thuế. Mọi thứ sau đó là phần lợi thêm.

## Các quyết định Bootstrap

Được ghi lại dưới dạng ADR trong [architecture-decisions/](../architecture-decisions/):

- [Không dùng LLM cho con số biểu thuế](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)
- [HS là ứng viên, không phải đáp án](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
- [Hiệu lực bitemporal ngay từ đầu](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)
- [Hải quan trước, luật sau](../architecture-decisions/2026-07-17-customs-first-law-later.md)
- [Chỉ dùng PostgreSQL cho v1](../architecture-decisions/2026-07-17-postgres-only-for-v1.md)
- [Web app, không phải Zalo](../architecture-decisions/2026-07-17-web-app-not-zalo.md)
- [Dùng VBHN đã công bố, không tự hợp nhất](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)

## Hành động tiếp theo

Chủ sở hữu đã phê duyệt kế hoạch này và bảy ADR vào 2026-07-17.

Bắt đầu [01-task-list.md](01-task-list.md) tại TASK-001 — bộ golden set. Nó đến trước bất kỳ đoạn mã truy xuất nào.

⚠️ **Bộ golden set cần chủ sở hữu, không phải một agent.** Đó là 30–50 câu hỏi từ các tờ khai của chính họ với các đáp án mà họ đã biết là đúng. Không ai khác có thể viết nó, và không gì ở hạ nguồn có thể được tin tưởng nếu không có nó.

## Kiến thức liên quan

- [Bối cảnh dự án](../project-context.md) — dự án này là gì và phục vụ ai
- [Danh sách công việc](01-task-list.md) — các công việc Giai đoạn 0 + Giai đoạn 1 cụ thể
- [Hệ thống biểu thuế](../concepts/tariff-system.md) — cấu trúc biểu thuế, bẫy phụ lục, khoảng cách thời gian
- [Nguồn dữ liệu](../concepts/data-sources.md) — Công báo vs chinhphu.vn vs vbpl vs các trang tổng hợp
- [Phân loại mã HS](../concepts/hs-classification.md) — GRI, các benchmark độ chính xác, các mức phạt, xác định trước
- [Truy xuất RAG pháp lý](../concepts/legal-rag-retrieval.md) — chia khối, tìm kiếm hybrid, lọc thời gian, ảo giác
- [Văn bản pháp luật Việt Nam](../concepts/vietnamese-legal-documents.md) — các loại văn bản, hiệu lực, hợp nhất
- [Quy trình khai báo hải quan](../workflows/customs-declaration.md) — bộ phận khai báo thực sự làm gì
- [Quy tắc nghiệp vụ](../business-rules.md)
- [Quy tắc tác nhân](../AGENTS.md)
