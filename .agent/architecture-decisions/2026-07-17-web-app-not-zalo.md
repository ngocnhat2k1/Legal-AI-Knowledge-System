---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../concepts/tariff-system.md
  - ../concepts/hs-classification.md
---

# Ship A Web App, Not A Zalo OA Bot

## Status

Approved — the project owner approved this plan on 2026-07-17.

## Context

The original v1 premise from the owner was *"chưa có OA nên làm bot Zalo"* — roughly, "we don't have an Official Account yet, so let's build a Zalo bot."

That premise is incoherent on the official path. The OA **is** the bot mechanism, not an alternative to it. Every official Zalo automation route (developers.zalo.me app → link to an OA → webhook → Send API) requires an OA as the sending identity; the no-code builder at chatbot.zalo.me is likewise OA-bound (verified 2026-07-17, source: https://developers.zalo.me/docs/official-account/phu-luc/lam-the-nao-de-tao-chatbot-tra-loi-tu-dong-voi-zalo-api). Not having an OA is the blocker to building a bot, not a reason to build one.

The company **does** have a GPKD, so an OA is possible. The question is therefore not "can we?" but "should we?" — and the verified platform economics answer no for an internal tool serving 5–50 known staff.

### The 2026 package restructure

Since **01/06/2026** Zalo replaced the old tiers (Dùng thử / Nâng cao / Premium) with four new ones. Any guide dated before June 2026 is stale — notably the old free 30-day "Dùng thử" trial that used to unlock the API is gone as a renewable path (verified 2026-07-17, source: https://oa.zalo.me/home/resources/news/162026-zalo-official-account-trien-khai-4-goi-dich-vu-moi-toi-uu-hieu-suat-theo-nhu-cau-doanh-nghiep-_109742821673880689).

| | Cơ bản | Tiêu chuẩn | Tăng trưởng | Toàn diện |
|---|---|---|---|---|
| Price | 0đ | 1.000.000đ/năm | **2.500.000đ/năm** | 6.000.000đ/năm |
| Chatbot | ✗ | ✗ | ✓ 10 kịch bản | ✓ 50 kịch bản |
| Zalo Open API | ✗ | ✗ | ✓ 100 req/min | ✓ 2.000 req/min |
| Tin tư vấn ngoài 48h/tháng | — | — | 500 | 2.000 |

(verified 2026-07-17, source: https://zalo.solutions/oa/pricing — table parsed cell-by-cell from the official pricing page, not from a summary)

Three things follow that most "let's just do a Zalo bot" plans never budget for:

- **The free tier cannot run our code.** "Tự động hóa cơ bản" on Cơ bản is Zalo's built-in canned responder — welcome message and keyword auto-reply configured in the OA dashboard. It is not our backend, not webhook-driven, and cannot call an LLM.
- **Tiêu chuẩn (1tr/năm) is a trap.** It looks like the cheap on-ramp. Chatbot and Open API are ✗ on it. You pay a million đồng and get nothing at all toward a chatbot. The real floor for an API-driven bot is **Tăng trưởng at 2.500.000đ/năm**.
- **"Hồ sơ quảng cáo" is not an escape hatch.** The no-GPKD account type explicitly cannot use Nhắn tin, Broadcast, Bài viết, Chatbot, or Gọi thoại — it is an ad-buying shell that cannot talk (verified 2026-07-17, source: https://oa.zalo.me/home/documents/guides/khoi-tao-zalo-official-account_61).

### The messaging window makes it worse for our use case

Per Zalo's official message-fee policy (verified 2026-07-17, source: https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099):

- **8 free tin tư vấn** per 48h from the user's last interaction; quota resets on each new user interaction.
- Beyond 8, or outside the window: **55đ/tin**.
- **The OpenAPI sending window is only 7 days** from last interaction — OA Manager (human agents) gets 365 days, but our code does not.
- Anything proactive or outside the window must go through ZNS pre-approved templates, not free-form text.

These caps exist to meter *customer* messaging. Pointed inward they are pure friction: our own staff get rate-limited talking to our own tool, and a multi-turn HS-code clarification burns the 8-message allowance in a single exchange.

## Decision

**v1 ships as a plain internal web app.** No Zalo OA, no Zalo bot channel, no unofficial Zalo automation.

Distribution is a link — staff can pin it in an existing Zalo group. We get Zalo's distribution without Zalo's platform tax.

## Rationale

Why the web app wins on the merits, not just on cost:

- **Wrong tool class.** An OA is an outbound customer-notification channel. We are building an internal knowledge/query tool. The platform is architected for transactional notification, not back-and-forth internal Q&A.
- **The UI is the product.** v1 delivers an exact tariff lookup (a table: HS + schedule + date → rate) and top-3 HS candidates with verbatim legal-note evidence beside each. A chat bubble renders none of that well — no sortable table, no side-by-side evidence, no citation hover, no file upload. The core deliverable of this project is *evidence a human can audit*, and chat is the worst surface for auditable evidence. See [HS Classification](../concepts/hs-classification.md) and [Tariff System](../concepts/tariff-system.md).
- **Auth is worse, not better.** Zalo hands us an opaque `user_id`, not an employee identity. We would build a mapping table anyway — at which point the web app's own login is simpler and gives us real per-staff audit trails.
- **Zero of Zalo's value proposition applies.** Customer reach, follower discovery, ZNS broadcast — all irrelevant to 50 known internal users who already have company laptops.
- **Cost with no return.** 2.500.000đ/năm plus 55đ/tin overages, to serve users we can already reach for free.

## Alternatives Considered

**Zalo OA on Tăng trưởng (2.5tr/năm).** Rejected — see Rationale. Possible (we have a GPKD), not sensible.

**Zalo OA on Cơ bản or Tiêu chuẩn.** Not an alternative at all. Neither tier has Chatbot or Open API. Tiêu chuẩn is money for nothing.

**Unofficial libraries (zca-js, zlapi, zcago).** Disqualified. These are real and actively maintained — zca-js v2.1.2 released 17/03/2026 (verified 2026-07-17, source: https://github.com/RFS-ADRENO/zca-js) — and they work by simulating Zalo Web from a *personal* account via QR login. That is a direct ToS breach: zalo.vn/dieukhoan §4.7 prohibits *"Đăng nhập và sử dụng Dịch Vụ bằng một phần mềm tương thích của bên thứ ba hoặc hệ thống không được phát triển, cấp quyền hoặc chấp thuận bởi Chúng tôi"*, and §13.2 allows immediate account lock plus damages liability (verified 2026-07-17, source: https://zalo.vn/dieukhoan/). The maintainers say so themselves in SECURITY.md: *"Using this API could get your account locked or banned."*

  The decisive point is *whose* asset is at risk: the banned account would be **an employee's personal Zalo** — the same one they use for family, banking OTPs, and government services. In Vietnam a personal Zalo is close to civic infrastructure. Betting it on an internal convenience tool is a wildly asymmetric trade. The ban risk alone is disqualifying, independent of any legal analysis.

**Telegram Bot API.** Strictly better than Zalo OA *if* a chat interface were genuinely required — free, no business verification, no message caps, no time window. Still rejected for v1, because the chat-UI objection above applies to Telegram equally: it cannot render an auditable tariff table either. Its only real cost is Telegram penetration among Vietnamese logistics staff (low), though for 50 known people that is a one-time install, not a public-reach problem.

**Zalo Mini App.** Not a bot — a web app inside Zalo, still requiring a developer account tied to a business entity. If we ever want Zalo-native distribution, this is a closer fit than an OA bot, but it buys nothing over a plain link for internal users.

## Scope

Applies to:

- v1 channel choice: web app only.
- Excludes any Zalo, Telegram, or other chat-platform integration from v1 delivery.
- Does not constrain later phases if the audience changes — see Review Requirements.

## Consequences

- No per-message cost, no template approval, no 48h window, no 7-day OpenAPI window, no annual platform fee.
- Full UI freedom: tables, file upload, verbatim legal citations side-by-side with candidates.
- Staff identity is ours, so per-user audit trails on tariff lookups are straightforward — relevant to [Business Rules](../business-rules.md).
- We must acquire our own users. For 5–50 known internal staff this is a link in a group chat, not a growth problem.
- No mobile-native push. Accepted for v1; staff do this work at a desk.
- If the audience later extends outside the company, this decision must be revisited — the analysis above is explicitly conditioned on "internal only."

## Risks

- **Adoption friction if staff live in chat.** Mitigation: the web app must be linkable and fast; if staff resist opening a browser, that is a signal to revisit — but the answer would be a better web UI or a Mini App, not an OA bot.
- **The "outside users" roadmap surfaces late.** If drivers or customers who will not install anything must eventually be served, an OA becomes a real option and this ADR's premise expires. Ask early rather than discover it after v1 ships.
- **Pricing changes again.** The tiers changed on 01/06/2026 and could change again. The numbers here carry a verification date for exactly this reason; re-verify before citing them in a budget.

## Unverified / Do Not Rely On

**CONTESTED — two research passes contradict each other on whether an OA-less Zalo bot exists. This conflict is unresolved.**

- **Position A (research 11):** There is no ToS-compliant automated bot without an OA. Every official path requires an OA as the sending identity; there is no OA-less branch in Zalo's own chatbot tutorial.
- **Position B (research 01):** A **separate Zalo Bot Platform** exists and is independent of OA — a near-clone of Telegram's Bot API. Claimed: created by messaging a "Zalo Bot Manager" OA in-app, token DM'd to you; base URL `https://bot-api.zapps.me/bot{TOKEN}/{method}`; methods `getMe`/`getUpdates`/`setWebhook`/`sendMessage`/`sendPhoto`/etc.; **requires only a personal Zalo account, no OA and no business license** (source cited: https://bot.zapps.me/docs, console at https://bot.zaloplatforms.com, corroborated via https://www.zbot.com.vn/).

  Research 01 itself could **not** verify Bot Platform pricing (`/docs/pricing/` returned HTTP 500 on every attempt) nor whether the 48h/8-message advisory metering applies to the Bot channel.

**Do not treat either position as settled.** If a Zalo channel is ever reconsidered, the existence, ToS status, pricing, and quota of the Bot Platform must be verified in a browser first. Note that this contradiction does **not** change the v1 decision: even if Position B is entirely correct and a free OA-less Zalo bot exists, the chat-UI objection stands on its own — a chat bubble still cannot render an auditable tariff table, which is the whole point of the product.

Other items not verified from primary source:

- **Webhook signing details.** developers.zalo.me is a JS-rendered SPA behind Cloudflare Turnstile; WebFetch and curl returned only the page shell. The event list (`user_send_text`, `follow`, etc.) is corroborated via integrator docs, but the exact signature header and payload schema were **not** confirmed from official source.
- **The "Số lượng App được ủy quyền" anomaly.** The official pricing table shows **1** authorized app for Cơ bản and Tiêu chuẩn, which sits oddly against "Tích hợp Zalo Open API = ✗" on those same tiers. This could not be reconciled from official docs. The working read is that app-authorization quota is a generic account attribute while API *access* is separately gated — but this is an inference, not a verified fact. Confirm with oa@zalo.me before betting money on a cheaper tier.
- **Nghị định 15/2020 exposure.** Research 11 judged that it targets false information and spam messaging, not automation per se, and that realistic exposure from unofficial libraries is contractual ban rather than administrative fine. Recorded as that agent's assessment, not as legal advice. Do not overstate the legal angle; the ban risk is the operative one.

## Review Requirements

- Revisit this ADR **only** if the bot must face drivers or customers outside the company who will not install anything. That is a real reason and it changes the answer.
- Re-verify all Zalo pricing and messaging quotas before any budget decision — the tiers changed on 01/06/2026 and every number here is dated 2026-07-17.
- Resolve the Position A vs Position B contradiction on the Zalo Bot Platform in a browser before any Zalo channel work is scoped.
- Verify that the web app's tariff and HS-candidate views actually render the evidence a declarant needs to audit — the UI argument above is the load-bearing half of this decision, and it must hold in practice.

## Related Knowledge

- [Project Context](../project-context.md) — what Customs Assistant is, who it serves, v1 boundaries.
- [Business Rules](../business-rules.md) — durable policy, including audit and human-decides rules.
- [Tariff System](../concepts/tariff-system.md) — the deterministic lookup this UI must render.
- [HS Classification](../concepts/hs-classification.md) — why top-3 candidates need verbatim evidence beside them.
- [Customs Declaration Workflow](../workflows/customs-declaration.md) — where staff actually sit when they use this.
- [Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) — later-phase scope, same evidence-rendering constraint.
