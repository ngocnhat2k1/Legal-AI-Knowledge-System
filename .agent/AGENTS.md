# Quy tắc Agent APB

File này là nguồn chân lý dùng chung cho các AI agent làm việc trong `Customs Assistant`.

## Giao tiếp

- Luôn trao đổi với chủ dự án bằng tiếng Việt.
- Toàn bộ tài liệu dự án phải được viết bằng tiếng Việt.
- Toàn bộ mã nguồn, chú thích trong mã, định danh, thông điệp commit, tên file, và tên API phải được viết bằng tiếng Anh.

## Quy trình làm việc mặc định

Với mỗi tác vụ phần mềm, hãy tuân theo thứ tự sau:

1. Lập kế hoạch
2. Rà soát kế hoạch
3. Chốt kế hoạch
4. Thiết kế triển khai
5. Rà soát thiết kế
6. Chốt thiết kế
7. Triển khai theo cột mốc
8. Rà soát mã nguồn
9. Sửa theo phản hồi
10. Cập nhật tài liệu
11. Cập nhật tri thức của agent
12. Cập nhật `planning/02-progress.md` — điểm tiếp tục, trạng thái tác vụ, nhật ký phiên
13. Chỉ commit khi được yêu cầu

Không bao giờ bắt đầu triển khai trước khi kế hoạch và thiết kế đã được rà soát.

## Tính liên tục giữa các phiên — Đọc đầu tiên, Cập nhật sau cùng

**`.agent/planning/02-progress.md` là điểm tiếp tục. Hãy đọc nó trước khi làm bất cứ điều gì khác trong một phiên mới.**

Nó nêu rõ giai đoạn hiện tại, tác vụ tiếp theo, những gì đang bị chặn, và những gì các phiên trước đã học được một cách vất vả. `00-bootstrap.md` là kế hoạch và `01-task-list.md` là công việc; **02-progress.md là những gì đã thực sự xảy ra**, thường khác với dự tính.

**Vào cuối mỗi phiên làm việc, trước khi commit cuối cùng, bạn PHẢI:**

1. Cập nhật **Resume Here** trong `02-progress.md` — giai đoạn, tác vụ tiếp theo, các yếu tố cản trở.
2. Cập nhật bảng **Task Status** ở đó **và** `01-task-list.md` trong cùng một commit. Nếu chúng
   mâu thuẫn, bảng tiến độ là một lời nói dối và agent kế tiếp sẽ hành động dựa trên nó.
3. Thêm một mục **Session Log** ở đầu nhật ký: điều gì đã thay đổi, điều gì đã học được, điều gì khiến bạn
   bất ngờ. Những ngõ cụt và những bước đi sai lầm là những mục có giá trị nhất — một kế hoạch ghi lại ý định, chỉ có nhật ký
   mới ghi lại được thực tế đã diễn ra như thế nào.

Đây không phải là hình thức. Chế độ thất bại của dự án này là âm thầm và bị trì hoãn, nên một agent tái phát hiện
một cái bẫy đã biết từ đầu thường sẽ tái phát hiện nó *sai* và đầy tự tin. Nhật ký là thứ ngăn chặn
điều đó.

**Kỷ luật định tuyến:** `02-progress.md` là một con trỏ và một cuốn nhật ký, không phải kho tri thức. Bất cứ điều gì
tồn tại lâu hơn phiên làm việc đều phải chuyển đến `concepts/`, `business-rules.md`, hoặc một ADR — không bao giờ chôn vùi trong
nhật ký. Hãy tuân theo các quy tắc Question Answer Routing bên dưới.

**`.agent/` phải luôn nằm ở gốc kho lưu trữ.** Các file cầu nối `AGENTS.md` và `CLAUDE.md` ở gốc
hardcode `.agent/AGENTS.md`. Việc di chuyển hoặc lồng `.agent/` sẽ âm thầm tách rời toàn bộ cơ sở tri thức
khỏi mọi agent — cầu nối phân giải thành không có gì và không có lỗi nào được báo. Điều này đã từng xảy ra
một lần; xem nhật ký phiên ngày 2026-07-17.

## Định hướng dự án

Trước khi theo các liên kết dẫn vào những ghi chú chuyên biệt, hãy bắt đầu từ `.agent/index.md` khi nó tồn tại. Chỉ mục là bản đồ của bộ nhớ dự án bền vững và nên trỏ đến các ghi chú nguồn-chân-lý hiện tại về bối cảnh, quy tắc, quyết định, lập kế hoạch, rà soát, và tri thức về tính năng hoặc module.

Trước khi bắt đầu một tác vụ không tầm thường, hãy đọc `.agent/project-context.md` để hiểu dự án làm gì, phục vụ ai, ranh giới của nó, các quy trình cốt lõi, thuật ngữ chuyên ngành, ràng buộc, và các câu hỏi còn để ngỏ.

Chỉ trong lần bootstrap đầu tiên, nếu `.agent/project-context.md` thiếu, trống, hoặc vẫn chỉ chứa nội dung placeholder, hãy hỏi chủ dự án một mô tả dự án dùng một lần và dùng nó để điền vào `.agent/project-context.md`. Sau khi `.agent/project-context.md` đã được điền, không lặp lại bước mô tả ban đầu; hãy đọc file như bản tóm tắt dự án bền vững và chỉ cập nhật nó khi bối cảnh dự án thực sự thay đổi.

Nếu `.agent/project-context.md` vẫn chưa hoàn chỉnh sau khi bootstrap, hãy coi việc định hướng dự án là chưa hoàn chỉnh. Hãy hỏi chủ dự án bối cảnh tối thiểu cần thiết trước khi thực hiện các thay đổi về sản phẩm, kiến trúc, hoặc logic nghiệp vụ.

Với các tác vụ known-known nhỏ, chỉ đọc bối cảnh dự án khi thay đổi có thể ảnh hưởng đến hành vi sản phẩm, quy tắc nghiệp vụ, quy trình hướng đến người dùng, thuật ngữ, hoặc kiến trúc.

## Phạm vi tri thức và những điều chưa biết

Lập kế hoạch và thiết kế giúp giảm hiểu lầm nhưng không loại bỏ bối cảnh còn thiếu. Với mỗi yêu cầu tính năng hoặc quy trình, hãy phân loại tri thức dự án vào các nhóm sau khi tác vụ có sự mơ hồ, rủi ro, hoặc tác động triển khai đáng kể:

- Yêu cầu đã xác nhận (Confirmed Requirements): chủ dự án đã mô tả rõ ràng yêu cầu và agent có thể truy vết nó về yêu cầu hoặc tài liệu hiện có.
- Giả định (Assumptions): chủ dự án có thể biết yêu cầu, nhưng nó chưa được mô tả đầy đủ cho agent. Hãy nêu rõ giả định và chỉ tiếp tục khi giả định là an toàn và có thể đảo ngược.
- Câu hỏi để ngỏ (Open Questions): thông tin cần thiết trước khi triển khai có thể tiến hành an toàn. Hãy hỏi chủ dự án thay vì đoán khi một Open Question chặn việc triển khai.
- Vùng rủi ro / Điều chưa biết (Risk Areas / Unknowns): những vùng chủ dự án có thể chưa nhận ra và agent không thể suy luận đầy đủ từ yêu cầu.
- Ngoài phạm vi (Out of Scope): hành vi liên quan bị loại trừ có chủ đích khỏi tác vụ hiện tại.
- Kế hoạch kiểm chứng (Validation Plan): cách triển khai sẽ chứng minh các yêu cầu đã xác nhận và các giả định.

Với công việc known-known, khi chủ dự án nêu rõ thay đổi được yêu cầu và agent hiểu nó, hãy dùng một hình thức nhẹ nhàng. Các tác vụ nhỏ như sửa lỗi chính tả, thay đổi văn bản, và cập nhật cấu hình đơn giản chỉ cần các ghi chú về giả định, rủi ro, hoặc kiểm chứng khi chúng thực sự tồn tại.

Rà soát Kế hoạch và Rà soát Thiết kế nên co giãn theo độ phức tạp của tác vụ. Với các tác vụ phức tạp hoặc mơ hồ, hãy chủ động yêu cầu chủ dự án xác nhận các giả định và vùng rủi ro trước khi chốt kế hoạch hoặc thiết kế. Với các tác vụ known-known nhỏ không có điều chưa biết đáng kể, yêu cầu của chủ dự án có thể xem là đủ để rà soát.

Đừng biến các nhóm tri thức thành một danh sách kiểm tra hình thức. Giá trị của chúng là phơi bày tri thức còn thiếu, không phải ép buộc các tiêu đề vào mọi tác vụ nhỏ.

Khi một yêu cầu được phát hiện sau khi việc triển khai đã bắt đầu, hãy ghi lại nó trong ghi chú kế hoạch liên quan, lịch sử rà soát, quy tắc nghiệp vụ, hoặc quyết định kiến trúc trước khi tiếp tục.

## Định tuyến câu hỏi và câu trả lời

Khi tài liệu nguồn hoặc yêu cầu của chủ dự án không rõ ràng, hãy đặt các Open Question thay vì âm thầm đoán. Dùng câu trả lời của chủ dự án để định tuyến tri thức đã xác nhận vào đúng vị trí bộ nhớ của agent.

Quy tắc định tuyến:

- Mục đích sản phẩm, đối tượng, ranh giới, và bối cảnh vận hành chuyển đến `.agent/project-context.md` và các file `.agent/planning/*.md` liên quan.
- Hành vi nghiệp vụ bền vững, chính sách, quy tắc kiểm chứng, quy tắc phân quyền, quy tắc tuân thủ, và quy tắc kế toán chuyển đến `.agent/business-rules.md`.
- Cấu trúc kỹ thuật, lựa chọn tích hợp, lựa chọn lưu trữ, và các đánh đổi lớn chuyển đến các file ADR riêng trong `.agent/architecture-decisions/`.
- Mẫu đặt tên, thuật ngữ, quy tắc đặt tên mã nguồn, và quy tắc đặt tên API chuyển đến `.agent/naming-conventions.md`.
- Phạm vi tác vụ hiện tại, giả định, hành vi ngoài phạm vi, tiêu chí nghiệm thu, và kế hoạch kiểm chứng chuyển đến `.agent/planning/*.md`.
- Hợp đồng API, ghi chú thiết lập, thiết kế triển khai, và tài liệu module chuyển đến `.agent/docs/*.md`.
- Quyết định rà soát, phê duyệt, giả định bị bác bỏ, và các mối lo đã được giải quyết chuyển đến `.agent/review-history/*.md`.
- Các diễn giải chưa được giải quyết hoặc có độ tin cậy thấp chuyển đến `.agent/reviews/` hoặc `.agent/previews/` cho đến khi được phê duyệt.

Nếu một câu trả lời của chủ dự án chứa nhiều loại tri thức, hãy tách nó ra các file phù hợp thay vì ép nó vào một tài liệu duy nhất. Hãy bảo toàn khả năng truy vết bằng cách ghi chú câu hỏi nguồn, câu trả lời, hoặc quyết định rà soát khi khả thi.

## Bộ nhớ agent liên kết bằng ghi chú

Dùng `.agent/` như một đồ thị tri thức Markdown thuần túy. Hãy duy trì các ghi chú dễ đọc liên kết tri thức dự án liên quan với nhau mà không cần Obsidian hay bất kỳ runtime đặc thù của trình soạn thảo nào.

Dùng `.agent/index.md` làm bề mặt điều hướng đầu tiên cho bộ nhớ bền vững. Hãy cập nhật nó bất cứ khi nào thêm, di chuyển, đổi tên, hoặc thăng cấp một ghi chú quan trọng.

Ưu tiên dùng liên kết Markdown tương đối cho tri thức bắt buộc:

```md
[Bối cảnh dự án](project-context.md)
```

Các liên kết kiểu wiki như `[[Project Context]]` chỉ có thể dùng như tiện ích bổ trợ cho trình soạn thảo. Không lưu trữ tri thức bắt buộc chỉ trong cú pháp riêng của Obsidian, file canvas, truy vấn Dataview, embed, hoặc metadata của plugin.

Các ghi chú quan trọng nên đủ tự chứa để đọc được bên ngoài chế độ xem đồ thị. Khi hữu ích, hãy thêm YAML frontmatter đơn giản:

```yaml
---
type: feature
status: active
updated: YYYY-MM-DD
related:
  - ../business-rules.md
---
```

Hãy dùng ghi chú nhỏ nhất đại diện cho một khái niệm bền vững, không phải một ghi chú cho mỗi hàm. Ranh giới ghi chú tốt bao gồm bối cảnh dự án, quy tắc nghiệp vụ, quyết định kiến trúc, ranh giới module, khái niệm chuyên ngành, quy trình, hợp đồng API, kết quả rà soát, và các mẫu triển khai có thể tái sử dụng.

Mỗi ghi chú bền vững nên bao gồm một mục `Related Knowledge` khi các liên kết chéo có thể giúp các agent tương lai truy vết hành vi, ràng buộc, hoặc quyết định.

## Tổ chức mã nguồn

Dùng `.agent/docs/code-organization.md` làm nguồn chân lý cho cấu trúc mã nguồn của kho lưu trữ.

Nếu dự án đã dùng một framework, nền tảng, bố cục monorepo, hoặc quy ước kho lưu trữ đã thiết lập, hãy tuân theo quy ước đó trước và ghi lại ánh xạ trong `.agent/docs/code-organization.md`.

Với các dự án chưa có cấu trúc, hãy dùng baseline khuyến nghị sau:

```text
src/
  app/
  modules/
  shared/
    kernel/
    adapters/
  integrations/
  tests/
    helpers/
```

Logic đặc thù của tính năng phải nằm trong ranh giới feature/module của framework, hoặc bên trong `src/modules/<module-name>/` khi dùng baseline khuyến nghị.

Mã có thể tái sử dụng chỉ được thêm vào vị trí mã dùng chung của dự án khi ít nhất hai module cần nó, hoặc khi chủ dự án phê duyệt rõ ràng nó là hạ tầng dùng chung.

Không tạo các helper hoặc thư mục gom chung chung như `utils`, `helpers`, `common`, `misc`, `shared.ts`, hoặc `helpers.ts`.

Trước khi thêm một helper, tiện ích, trừu tượng, module dùng chung, hoặc module mới, hãy tìm trong kho lưu trữ hành vi tương đương đã có. Hãy tái sử dụng hoặc mở rộng mã hiện có khi phù hợp.

Khi mã dùng chung mới là cần thiết, hãy ghi lại lý do mã hiện có không đủ trong kế hoạch tác vụ hoặc tóm tắt rà soát, rồi cập nhật `.agent/docs/code-organization.md` nếu cấu trúc, ánh xạ framework, hoặc mẫu tái sử dụng thay đổi.

## Cấu trúc dự án

Hãy dùng cấu trúc này cho tài liệu quy trình hướng đến agent:

```text
.agent/
  AGENTS.md
  index.md
  artifacts/
  planning/
  docs/
    code-organization.md
  architecture-decisions/
    README.md
  previews/
  review-history/
  reviews/
  business-rules.md
  naming-conventions.md
  project-context.md
```

Thư mục `docs/` ở gốc là tùy chọn. Chỉ dùng nó cho tài liệu dành cho con người bên ngoài quy trình agent.

`AGENTS.md` và `CLAUDE.md` ở gốc là các file cầu nối trỏ đến `.agent/AGENTS.md`. Hãy giữ các file cầu nối này mỏng và không sao chép quy tắc dự án vào chúng. Codex, Claude, và các agent khác chia sẻ `.agent/AGENTS.md` làm nguồn chân lý.

## Tài liệu

Tài liệu là một sản phẩm sống.

Bất cứ khi nào mã nguồn, hành vi API, kiến trúc, thiết lập, hoặc logic nghiệp vụ thay đổi, hãy tự động cập nhật các tài liệu liên quan:

- `.agent/planning/*.md`
- `.agent/docs/*.md`
- `.agent/architecture-decisions/*.md`
- `.agent/review-history/*.md`
- `README.md`

Không bao giờ để tài liệu lỗi thời.

## Tri thức agent

Dùng `.agent/` làm bộ nhớ dài hạn của dự án.

Khi cập nhật bộ nhớ agent, hãy cập nhật thêm các liên kết ghi chú liên quan và `.agent/index.md` nếu thay đổi ảnh hưởng đến điều hướng bền vững.

Ghi lại các quyết định kiến trúc thành các file ADR riêng trong `.agent/architecture-decisions/`.

Dùng định dạng đặt tên này:

```text
YYYY-MM-DD-<short-decision-title>.md
```

Không giữ tất cả các quyết định kiến trúc trong một file markdown duy nhất.
