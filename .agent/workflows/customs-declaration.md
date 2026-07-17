---
type: workflow
status: active
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../index.md
---

# Customs Declaration Workflow (what our users actually do all day)

This note describes the real day-to-day loop of a Vietnamese customs declarant, so that features are designed around the actual job rather than an imagined one. Read it before proposing any feature that claims to "automate declaration".

Every factual claim below carries a verification date and a source. Claims the research could not verify are quarantined in [Unverified / Do Not Rely On](#unverified--do-not-rely-on) — do not promote them into the body.

## The day-to-day loop

The declarant's job is a pipeline. Each step can block the next, and the expensive failures are discovered at the end (or years later, in a post-clearance audit).

1. **Classify HS** — decide the 8-digit code under Danh mục hàng hóa XNK Việt Nam.
2. **Check policy for that HS** — is the good `cấm` (prohibited), `theo giấy phép` (licensed), `có điều kiện` (conditional), or subject to `kiểm tra chuyên ngành` (specialized inspection)?
3. **Obtain licences & register inspection on VNSW** (Cơ chế một cửa quốc gia) — plus C/O if claiming an FTA rate.
4. **Declare in ECUS** (vendor middleware, not VNACCS directly).
5. **Receive phân luồng** — the risk-management system returns a channel: **green** (accepted), **yellow** (document check), **red** (physical inspection).
6. **Pay duty.**
7. **Thông quan** (clearance).

(verified 2026-07-17, source: research 08 §7, summarising practitioner workflow across ECUS/VNACCS material — see the ECUS and TT 121 sources cited below)

### Why the loop matters for design

Step 1 determines steps 2, 3 and 6. A wrong HS code does not fail loudly at step 4 — it is accepted by the system and surfaces later as truy thu + penalty + lost FTA preference. This is the "Error but Valid" property: a wrong 8-digit code is syntactically indistinguishable from a right one (verified 2026-07-17, source: https://arxiv.org/html/2510.19631). The declarant carries the liability regardless of what tool produced the number.

### What Customs Assistant v1 does and does not touch

| Step | v1 involvement |
|---|---|
| 1. Classify HS | **Yes** — top-3 **candidates** + verbatim legal-note evidence. Human decides. Never a bare 8-digit answer. |
| 2. Check policy | **No in v1.** Out of scope; see the quản lý chuyên ngành section for why this is much harder than it looks. |
| 3. VNSW licences / inspection | **No.** No public API; requires chữ ký số. We do not touch it. |
| 4. Declare in ECUS | **No.** No integration. The user copies the code into ECUS themselves. |
| 5. Phân luồng | **No.** Determined by VCIS risk management, not by us. |
| 6. Pay duty | **No payment.** v1 provides **tariff lookup** only — deterministic, keyed by HS + schedule + date, no AI on the numbers. |
| 7. Thông quan | **No.** |

The product surface is deliberately steps 1 and 6 only, and in step 1 it is decision support, not decision. The evidence for that contract: autonomous top-1 classification at 10-digit is 29–47% against 95% for human experts, while top-3 + retrieved HS-manual evidence reaches 93.9% and measurably cut expert review time in a 32-expert study at Korea Customs Service (verified 2026-07-17, sources: https://arxiv.org/html/2510.19631 and https://arxiv.org/abs/2311.10922). The gap between 47% and 93.9% is the **output contract**, not model capability. Changing the contract to "the app assigns the code" throws away the entire measured benefit.

## Systems the declarant touches

- **VNACCS/VCIS** — built by JICA, live since 2014. VNACCS = clearance processing; VCIS = intelligence/risk (it is what produces phân luồng) (verified 2026-07-17, source: research 08 §7; see https://baophapluat.vn/hai-quan-tang-toc-chuyen-doi-so-thi-diem-mo-hinh-thong-quan-tap-trung-bai-1-tu-nen-tang-vnaccs-vcis-den-buoc-chuyen-moi-cua-hai-quan-so.html).
- **Declarants do not touch VNACCS directly.** They use vendor middleware. **ECUS5-VNACCS (Thái Sơn)** is dominant; FPT.VNACCS and a free Customs-issued client also exist. Vendors ship message-standard updates as circulars change (verified 2026-07-17, source: https://thaison.vn/san-pham/ecus).
- **⚠️ VNACCS/VCIS is scheduled for replacement** by the "Hải quan số" system, targeted **31/12/2026**, with full platform + VNSW integration in late 2026 / early 2027. A revised **Luật Hải quan** is expected before the National Assembly around **10/2026** (verified 2026-07-17, sources: https://baophapluat.vn/hai-quan-tang-toc-chuyen-doi-so-thi-diem-mo-hinh-thong-quan-tap-trung-bai-1-tu-nen-tang-vnaccs-vcis-den-buoc-chuyen-moi-cua-hai-quan-so.html and https://baophapluat.vn/sua-doi-luat-hai-quan-hoan-thien-hanh-lang-phap-ly-cho-hai-quan-so-quan-ly-hien-dai.html).

**Design consequence:** anything built against VNACCS message formats has a **~18-month shelf life**. This is a first-order reason v1 does not integrate with ECUS/VNACCS — the integration would be obsolete roughly when it shipped. Staying at the "give the human a code and a duty rate, they type it in" boundary is what makes the product survive the Hải quan số cutover.

## ⚠️ The biggest near-term procedural change: TT 121/2025/TT-BTC

- **Thông tư 121/2025/TT-BTC** — issued **18/12/2025**, **effective 01/02/2026**. Amends **TT 38/2015/TT-BTC** (as already amended by **TT 39/2018/TT-BTC**). Described as the largest customs-procedure update in years: it standardises the customs dossier, cuts documents, and pushes data interchange via VNSW (verified 2026-07-17, sources: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-121-2025-TT-BTC-sua-doi-cac-Thong-tu-ve-thu-tuc-hai-quan-giam-sat-hai-quan-633118.aspx, https://baochinhphu.vn/thong-tu-121-mo-duong-hai-quan-so-thu-tuc-gon-thong-quan-nhanh-102260114160631601.htm, https://www.pwc.com/vn/vn/publications/news-brief/251223-new-customs-procedures-effective-from-1-february-2026.html).
- It also touches the advance-ruling path directly: it amends khoản 1 and adds khoản 6 of **Điều 7** (hồ sơ xác định trước mã số) and introduces forms **01a-TB XDTMS / 01b-Thay the XDTMS / 01c-Huy XDTMS** (verified 2026-07-17, same sources).
- **Nghị định 167/2025/NĐ-CP** (effective **15/8/2025**) amends **NĐ 08/2015/NĐ-CP** (verified 2026-07-17, source: research 08 §7).

**Why this is called out so loudly:** almost all pre-2026 training data, blog posts, and practitioner habit describe dossier composition under TT 38/2015 + TT 39/2018. **Any dossier-composition logic must target TT 121, not TT 38/39 as previously known.** An agent that "knows" the TT 38/39 dossier will produce confidently obsolete output.

Related: **Quyết định 117/QĐ-CHQ (2026)**, the internal Quy trình xác định trước mã số applied from ~01/02/2026, is built on the principle that **each good has exactly one HS code** and on a unified sector-wide classification database — the database is **internal**, do not assume it will ever be exposed (verified 2026-07-17, source: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Quyet-dinh-117-QD-CHQ-2026-Quy-trinh-Xac-dinh-truoc-ma-so-Kiem-tra-ten-hang-mo-ta-hang-hoa-692998.aspx; research 09 flags the full text as unfetchable/paywalled, so treat the detail as medium confidence).

## Quản lý chuyên ngành (specialized management) — step 2

**There is no single master list.** Each ministry publishes its own "bảng mã số HS" circular, and **that circular is the join key** between an HS code and a requirement. A feature that promises "tell me what licences I need" is really a promise to assemble and maintain ~6 ministries' separate HS-table circulars, whose ground truth is PDF/Word annexes (verified 2026-07-17, source: research 08 §3 and §8).

The framework decree is **NĐ 69/2018/NĐ-CP** (hàng cấm, hàng theo giấy phép, hàng có điều kiện, TNTX/chuyển khẩu), still in force; a replacement is in draft and must not be coded against (verified 2026-07-17, source: https://vanban.chinhphu.vn/?pageid=27160&docid=193756).

**Bộ Công Thương**
- Prohibited/conditional goods by HS: **TT 12/2018/TT-BCT** + **TT 08/2023/TT-BCT**, which replaced Phụ lục I of TT 12/2018 (verified 2026-07-17, sources: https://www.vietnamtradeportal.gov.vn/kcfinder/upload/files/12_2018_TT-BCT.pdf, https://vanban.vcci.com.vn/thong-tu-082023tt-bct-sua-doi-quy-dinh-danh-muc-chi-tiet-theo-ma-so-hs-cua-hang-hoa-xuat-khau-nhap-khau-kem-theo-mot-so-thong-tu-cua-bo-truong-bo-cong-thuong).
- Food safety: **TT 28/2026/TT-BCT — effective 17/7/2026** (đồ uống, rượu, bia, cồn thực phẩm, sữa chế biến, dầu thực vật) (verified 2026-07-17, source: https://government.vn/?docid=218330&pageid=27160).

**Bộ Nông nghiệp và Môi trường (BNNMT)**
- Master HS table: **TT 01/2024/TT-BNNPTNT**, effective **20/3/2024**, succeeded TT 11/2021. ⚠️ Research found **no confirmed BNNMT replacement** — treat as current but **re-verify** (verified 2026-07-17, source: https://chinhphu.vn/?pageid=27160&docid=209723).
- Kiểm dịch động vật trên cạn: **TT 01/2026/TT-BNNMT** (01/01/2026) (verified 2026-07-17, source: https://luatvietnam.vn/tai-nguyen/thong-tu-01-2026-tt-bnnmt-quy-dinh-kiem-dich-dong-vat-san-pham-dong-vat-tren-can-423507-d1.html).
- Kiểm dịch động vật thủy sản: **TT 03/2026/TT-BNNMT** (13/01/2026) (verified 2026-07-17, source: https://xuatnhapkhauleanh.edu.vn/thong-tu-03-2026-tt-bnnmt.html).

**Bộ Y tế** — food safety (its share under **NĐ 15/2018/NĐ-CP**), drugs, cosmetics, medical devices (verified 2026-07-17, source: https://vanban.chinhphu.vn/?pageid=27160&docid=192829).

**Bộ Khoa học và Công nghệ** — quality/standards regime; also telecom/IT equipment since absorbing ex-Bộ TT&TT (verified 2026-07-17, source: research 08 §1 and §3).

**Bộ Xây dựng** — construction materials; also transport since absorbing ex-Bộ GTVT (verified 2026-07-17, source: research 08 §1 and §3).

## ⚠️ Not everything keys on HS — an HS-only data model is structurally insufficient

This is the single most important modelling warning in this note. If the schema is `hs_code → requirements`, three real regimes cannot be expressed at all:

- **CITES keys on species, not HS.** **NĐ 06/2019/NĐ-CP** as amended by **NĐ 84/2021/NĐ-CP**. Permit issued by Cơ quan thẩm quyền quản lý CITES Việt Nam in **8 working days**, up to **22** where scientific-authority or exporting-country consultation is needed; **maximum 6 months validity**; the **single original travels with the shipment**. **An HS code alone cannot determine CITES applicability** — two shipments under the same HS differ by species (verified 2026-07-17, sources: https://luatvietnam.vn/hanh-chinh/giay-phep-cites-570-95717-article.html, https://vbpl.ts24.com.vn/support/solutions/articles/16000126973-ngh%E1%BB%8B-%C4%91%E1%BB%8Bnh-84-2021-n%C4%91-cp-s%E1%BB%ADa-%C4%91%E1%BB%95i-ngh%E1%BB%8B-%C4%91%E1%BB%8Bnh-06-2019-n%C4%91-cp-v%E1%BB%81-qu%E1%BA%A3n-l%C3%BD-th%E1%BB%B1c-v%E1%BA%ADt-r%E1%BB%ABng-%C4%91%E1%BB%99ng-v%E1%BA%ADt-r%E1%BB%ABng-nguy-).
- **Phế liệu keys on HS *plus a firm-level giấy phép môi trường*.** **QĐ 13/2023/QĐ-TTg**, effective **01/6/2023**, replaced QĐ 28/2020, listing phế liệu permitted for import as production material (sắt thép, nhựa, giấy, thủy tinh, kim loại màu); the permit requirement comes from **Luật BVMT 2020**. Legacy permits with old naming but unchanged HS remain valid until expiry. The answer therefore depends on **who the importer is**, not only on what the good is (verified 2026-07-17, source: https://vanban.chinhphu.vn/?pageid=27160&docid=207922).
- **The quality regime keys on a risk tier.** **Luật 78/2025/QH15**, effective **01/01/2026**, introduces risk-based classification: **thấp** → tự công bố tiêu chuẩn áp dụng; **trung bình** → tự đánh giá or certification by an accredited body; **cao** → certification by a **designated** body (verified 2026-07-17, source: https://vanban.chinhphu.vn/?pageid=27160&docid=214606).

**Design consequence:** any future policy-check feature needs a rule model whose *key* is polymorphic (HS, species, firm identity, risk tier), not a flat HS join. Ministry identity is also a moving target after the 2025 mergers — model ministries as entities with aliases and validity ranges, because circular prefixes changed (`TT-BNNPTNT` → `TT-BNNMT`) while legacy circulars keep their old designation (verified 2026-07-17, source: research 08 §1).

## Transitional clauses matter operationally

Rules are **not a simple date cutover**. **TT 28/2026/TT-BCT**: files submitted before the effective date follow the old rules **unless the trader opts in** (verified 2026-07-17, source: https://government.vn/?docid=218330&pageid=27160).

So the correct question is never "what is the rule today" but "what is the rule for *this dossier*, given its submission date and the trader's election". A rule store needs effective-from / effective-to / suspended-by / superseded-by, plus an opt-in flag on the dossier — a single `valid_from` column silently produces wrong answers for in-flight filings.

The food-safety saga is the proof that status is a field, not a footnote: **NĐ 46/2026/NĐ-CP** (26/01/2026) was issued to replace NĐ 15/2018, then **NQ 09/2026/NQ-CP** (04/02/2026) **suspended** it about a week later, and the suspension was extended until the amended Food Safety Law and its decree take effect — so **NĐ 15/2018 remains operative** (verified 2026-07-17, sources: https://vanban.chinhphu.vn/?docid=216891&pageid=27160, https://baochinhphu.vn/tiep-tuc-ap-dung-nghi-dinh-15-2018-nd-cp-ve-an-toan-thuc-pham-cho-den-khi-co-quy-dinh-moi-102260408123934123.htm).

## C/O — the major 2025 change

- **QĐ 1103/QĐ-BCT (21/4/2025)** revoked **VCCI's** authority to issue **C/O, CNM and REX codes**. Origin certification is centralised under MOIT / Sở Công Thương (verified 2026-07-17, source: https://logistics.gov.vn/tin-hoat-dong/bo-cong-thuong-thu-hoi-quyen-cap-c-o-cnm-va-ma-so-rex-tu-vcci-de-chuan-hoa-he-thong-cap-c-o-trong-boi-canh-moi).
- **Any pre-2025 knowledge saying "VCCI issues form B" is WRONG.** Say so out loud rather than repeating it.
- **TT 40/2025/TT-BCT (22/6/2025)** covers C/O issuance and approval of **self-certification** of origin (verified 2026-07-17, source: research 08 §5). **NĐ 146/2025/NĐ-CP** (12/6/2025, eff. 1/7/2025) handles phân quyền/phân cấp in industry & trade (verified 2026-07-17, source: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-146-2025-nd-cp-45086.htm).
- **eCoSys migrated to https://co.moit.gov.vn at 12:00 on 22/12/2025** (verified 2026-07-17, source: https://unicustomsconsulting.com/vi/bo-cong-thuong-nang-cap-va-van-hanh-he-thong-ecosys-moi-tu-12h00-ngay-22-12-2025/).
- **14 preferential forms**: D (ASEAN), E (China), AHK, AJ/VJ (Japan), AK/VK (Korea), AI (India), X (Cambodia), EUR.1 (EVFTA), EUR.1 UKVFTA, plus RCEP and CPTPP forms (verified 2026-07-17, source: research 08 §5).
- **eCoSys data is not public — no API.** It is a transactional licensing system behind auth (verified 2026-07-17, source: research 08 §5).

C/O matters to us indirectly: an HS mismatch between the declaration and the C/O destroys FTA preferential eligibility, which is usually worth far more than the classification penalty itself (verified 2026-07-17, source: https://thuvienphapluat.vn/tintuc/vn/thoi-su-phap-luat/tai-chinh/20921/xu-ly-khi-co-khac-biet-ma-so-hs-tren-c-o).

## VNSW / Cơ chế một cửa quốc gia

- Legal base: **NĐ 85/2019/NĐ-CP**, effective **1/1/2020**, **6 chapters / 43 articles**, covering NSW + ASW + kiểm tra chuyên ngành — it is the decree that ties specialized inspection to the single window (verified 2026-07-17, source: https://chinhphu.vn/default.aspx?pageid=27160&docid=198329).
- Portal **https://vnsw.gov.vn**; account registration verified within **1 working day**; **requires chữ ký số (USB token)** (verified 2026-07-17, source: https://vnsw.gov.vn/).
- **No public API.** NĐ 85 anticipates system-to-system connection, but the mechanism for connecting NSW to customs' e-data system and ministries' IT systems **"has not been fully regulated"**. Integration is bilateral, per-ministry, by agreement (verified 2026-07-17, source: research 08 §6).
- ⚠️ **vnsw.gov.vn failed TLS verification** during research ("unable to verify the first certificate"). Expect cert-chain issues for anyone integrating (verified 2026-07-17, source: research 08 §6).
- ⚠️ Procedure counts are **stale**: the best figure found is **249/261 procedures as of 30/6/2022** (QĐ 1254/QĐ-TTg, QĐ 1258/QĐ-TTg). No current 2026 count could be verified — **do not quote a current number** (verified 2026-07-17, source: research 08 §6).

The digital-signature requirement and the absence of an API together mean VNSW is a **human step, permanently, for our purposes**. Do not design flows that assume we can read licence status.

## AEO and xuất nhập khẩu tại chỗ

- **Luật 90/2025/QH15**, effective **01/7/2025**, amended Luật Hải quan **Điều 42 and 43**: the AEO compliance period drops from **3 years to 2 years**, and the applicant must have an **IT system able to share data with hải quan**.
- The same law **added Điều 47a, luật hóa xuất nhập khẩu tại chỗ** — significant for logistics and EPE flows, which is exactly our users' business.
- **Luật Quản lý thuế 108/2025/QH15**, effective **01/7/2026**, replaces Luật QLT 38/2019.

(verified 2026-07-17, source: research 08, AEO/xuất nhập khẩu tại chỗ findings; primary statute text was not independently fetched during research — re-verify article numbers before citing them to a customer)

## Institutional naming — a data-engineering trap

**Tổng cục Hải quan no longer exists.** Since **01/03/2025** (NĐ 29/2025/NĐ-CP, QĐ 382/QĐ-BTC) it is **Cục Hải quan** under Bộ Tài chính, with **20 Chi cục Hải quan khu vực**. Documents are numbered **`-CHQ`**, not `-TCHQ` (verified 2026-07-17, source: https://xaydungchinhsach.chinhphu.vn/quyet-dinh-382-qd-btc-quy-dinh-chuc-nang-nhiem-vu-quyen-han-va-co-cau-to-chuc-cua-cuc-hai-quan-119250228165530471.htm). Any corpus of công văn must reconcile the pre-3/2025 `-TCHQ` and post-3/2025 `-CHQ` numbering, or the same guidance will look like two unrelated documents.

## Unverified / Do Not Rely On

Reproduced verbatim in spirit from research 08's own flags. Do not launder any of these into a confident claim.

- **TT 15/2026/TT-BCT, TT 26/2026/TT-BCT, and VBHN 47/VBHN-BCT (4/6/2026)** — a single low-confidence extraction (luatvietnam) describes VBHN 47 consolidating TT 12/2018 with TT 42/2019, TT 08/2023, TT 38/2025, TT 15/2026 and TT 26/2026. The two 2026 circulars came from that one extraction. **Verify before use.**
- **NĐ 169/2026/NĐ-CP** (customs penalties, eff. 1/7/2026, said to replace NĐ 128/2020) and **NĐ 153/2026/NĐ-CP** (địa bàn hoạt động hải quan, eff. 5/7/2026) — single search-summary source; **the numbering is suspicious**. Confirm before citing. Until confirmed, the operative penalty decree remains **NĐ 128/2020/NĐ-CP as amended by NĐ 102/2021/NĐ-CP**.
- **VBHN 67/VBHN-BNNMT (2026)** on terrestrial animal quarantine — single source.
- **"Danh mục hàng hóa nhóm 2 abolished from 2026"** under Luật 78/2025 — **contested, load-bearing, and resting on a single commercial source** (extendmax), which also asserts that công bố hợp quy is *restructured, not abolished*. This claim would change the shape of any rules engine. **Verify against the statute text and its implementing decree before building anything on it.**
- **Whether a BNNMT circular has replaced TT 01/2024/TT-BNNPTNT** — no confirmed replacement found.
- **Current VNSW procedure / ministry count** — best available figure is from 2022.
- **Whether the ecosys.gov.vn / co.moit.gov.vn split still holds.** ⚠️ Reportedly forms **D, AK, VK** — the ones that must transmit to VNSW — are still declared at **ecosys.gov.vn** while everything else moved to **co.moit.gov.vn**. Two systems, one workflow. This was observed mid-migration and is **unverified**.
- **Quyết định 117/QĐ-CHQ detail** — full text was paywalled/403 during research; treat specifics as medium confidence.
- **Luật 90/2025/QH15 and Luật 108/2025/QH15 article-level detail** — reported in research 08 but primary statute text was not independently fetched.

## Related Knowledge

- [Project Context](../project-context.md) — what Customs Assistant is, who it serves, and its v1 boundaries.
- [Business Rules](../business-rules.md) — durable policy, validation, and compliance rules derived from this workflow.
- [Agent Index](../index.md) — map of durable project memory.
- [Architecture Decisions](../architecture-decisions/README.md) — record here any decision to integrate (or deliberately not integrate) with VNACCS, VNSW, or eCoSys, given the ~18-month VNACCS shelf life.
