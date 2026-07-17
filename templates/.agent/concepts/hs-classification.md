---
type: concept
status: active
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../index.md
---

# HS Classification (Phân loại mã HS)

Durable domain knowledge for feature 2 of Customs Assistant: **HS code CANDIDATE suggestion**. The
short version: classification is a legal determination, not a lookup, and no published system
approaches human accuracy at the digit depth Vietnam declares at. This note records the numbers that
justify the "top-3 + verbatim evidence + human decides" contract so that a future agent does not
quietly redesign it into an answer engine.

All claims below come from research report 09 (HS classification) and report 12 (adversarial
verification of tariff data), unless marked otherwise.

---

## 1. What the HS is

The Harmonized System is a WCO nomenclature: **21 Sections / 97 Chapters**, harmonized
internationally to **6 digits**. Vietnam extends to **8 digits** via AHTN (ASEAN Harmonised Tariff
Nomenclature). (verified 2026-07-17, source: https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-interpretation-general-rules/0001_2012e_gir.pdf)

Vietnam's operative list is **Thông tư 31/2022/TT-BTC** (hiệu lực 01/12/2022), Danh mục hàng hóa xuất
khẩu, nhập khẩu Việt Nam on HS 2022 / AHTN 2022 — **21 phần / 97 chương / 1,228 nhóm / 4,084 phân
nhóm / 11,414 dòng hàng 8 số**. It is still the operative list in 2026. (verified 2026-07-17, source:
https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx)

**Version horizon.** HS revises roughly every 5 years. **HS 2028 amendments were provisionally
adopted at the 75th HSC session (April 2025) and enter force 01/01/2028.** (verified 2026-07-17,
source: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx)
**Do not hardcode AHTN 2022.** Every stored code, note, and mapping needs a nomenclature-version key.
Renomenclature re-bases codes and orphans historical mappings — a schema without a version column
will silently mix 2022 and 2028 meanings for the same digits.

## 2. The 6 GRI — a decision procedure, applied in strict sequential order

You may **not** jump to GRI 3 if GRI 1 resolves the good. The order is the law, not a heuristic.
(verified 2026-07-17, source: https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/nomenclature/instruments-and-tools/hs-interpretation-general-rules/0001_2012e_gir.pdf)

| Rule | What it does |
|---|---|
| **GRI 1** | Heading text **+ Section/Chapter Notes** decide. Section/Chapter **titles are reference only** and carry no legal force. |
| **GRI 2(a)** | Incomplete / unassembled goods that have the essential character of the finished article. |
| **GRI 2(b)** | Mixtures and composite goods (routes into GRI 3). |
| **GRI 3** | Two or more headings prima facie applicable: **3(a)** most specific description → **3(b)** essential character → **3(c)** last in numerical order. Strictly in that order. |
| **GRI 4** | Goods most akin. Rarely used. |
| **GRI 5** | Cases, containers, packing materials. |
| **GRI 6** | Subheadings — compare **only at the same level**, applying subheading notes *mutatis mutandis*. |

Vietnam's copy of the six rules is **Phụ lục II of Thông tư 31/2022/TT-BTC** ("6 quy tắc tổng quát").
(verified 2026-07-17, source: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx)

**Model the GRI order as CODE, not as a prompt instruction.** Why: GRI 3(a) → 3(b) → 3(c) is a
deterministic decision procedure with a defined fallthrough. If it lives in a prompt, the model is
free to reach 3(c) while 3(a) was still available, and nothing in the output will reveal that it did.
Encoded as control flow, "did we exhaust 3(a)?" is an assertion you can test. This is not a style
preference — see §5, where handing models the written rules **decreased** accuracy while a pipeline
whose control flow *is* the hierarchy roughly doubled it.

## 3. Hierarchy of authority — the key structural fact

Any evidence the system quotes must be tagged with its authority tier, because tiers are not
interchangeable in an argument before Chi cục Hải quan.

- **BINDING**: heading text, subheading text, and the **Legal Notes** — Section Notes, Chapter Notes,
  Subheading Notes. (verified 2026-07-17, source: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/guide/legal-notes-legales-eng.html)
- **AUTHORITATIVE BUT NOT BINDING**: WCO **Explanatory Notes (EN)** and the **Compendium of
  Classification Opinions**. Administrations treat them as the authoritative interpretation and
  disputes are routinely resolved by reference to them, but they do not override the Legal Notes.
  (verified 2026-07-17, source: https://taxation-customs.ec.europa.eu/customs/common-customs-tariff-cct/tariff-classification-goods/harmonized-system_en)
- **ASEAN LAYER**: **SEN (Supplementary Explanatory Notes)** for the AHTN 8-digit lines. SEN 2022 was
  circulated in Vietnam by **Công văn 3866/TCHQ-TXNK (24/07/2023)**. **SEN is not independently
  binding** — an argument resting on SEN that contradicts the HS EN is legally weak. (verified
  2026-07-17, source: https://thuvienxuatnhapkhau.com/wp-content/uploads/2023/07/3866_Chu-giai-SEN-2022.pdf)

Why this matters for the product: a citation stack that leads with SEN and never reaches a Chapter
Note looks convincing and is legally thin. Rank and label evidence by tier in the UI so a staff
member can see whether they are holding a binding argument or a persuasive one.

## 4. Why classification is genuinely hard

1. **It is legal reasoning, not lookup.** The same physical object classifies differently by
   *function*, *material*, *essential character*, *state of assembly*, and *presentation*. Exclusion
   notes cross-reference chapters far away from the one you are reading.
2. **Multi-axis constraints with priority.** Material vs function vs form must be resolved in the
   right order. The characteristic failure mode is **resolving one axis while ignoring the priority
   constraints on the others** — diagnosed explicitly as the way end-to-end prompting fails.
   (verified 2026-07-17, source: https://arxiv.org/html/2605.14857)
3. **Deliberately open-textured drafting.** Legal notes use "for example", "such as", "principally",
   "of a kind used for". The vagueness is intentional and creates boundary confusion by design.
   (verified 2026-07-17, source: https://arxiv.org/html/2510.19631)
4. **Reasonable experts disagree.** In HSCodeComp's construction two experts disagreed enough to need
   a senior tiebreaker; a later audit of 226 disagreements found **~42.5% of "wrong" model
   predictions were actually better supported by HS rules than the published ground truth**.
   (verified 2026-07-17, source: https://arxiv.org/html/2605.14857) **The ground truth itself is
   contestable.** A system that reproduces the official label is optimizing for *agreement with
   customs* — commercially the right target, but not the same thing as being right. Say so out loud
   rather than calling it accuracy.
5. **The money is in the last digits.** Most errors happen *after* the correct heading is found: the
   split between two subheadings drives duty rate, AD/CVD exposure, FTA eligibility, licensing.
   (verified 2026-07-17, source: https://aomeara.com/how-customs-actually-classifies-products/)

## 5. AI accuracy — the real numbers

### HSCodeComp — 632 expert-annotated real e-commerce products, 27 chapters, 10-digit target
(verified 2026-07-17, source: https://arxiv.org/html/2510.19631)

| System | 10-digit accuracy |
|---|---|
| **Human experts** | **95.0%** |
| Best agent (SmolAgent + GPT-5 VLM) | 46.8% |
| Gemini Deep Research | 40.8% |
| GPT-5, LLM only (no tools) | 29.0% |
| Qwen2.5-72B | 0.16% |

**Accuracy collapses down the hierarchy: ~82% at 2-digit → 29–47% at 10-digit.** Depth is the whole
problem. A demo that shows "it got the chapter right" is measuring the easy 82% and telling you
nothing about the digits that decide the duty.

**Two counterintuitive findings that must shape the design:**

- **Test-time scaling does not help.** Majority voting and self-reflection gave **negligible** gains,
  unlike other reasoning domains. Why it matters: the obvious cheap fix — "sample 5 times and vote"
  — buys nothing here. Wrong answers are wrong *consistently*, because the model misapplies the same
  rule every sample. Do not budget for it.
- **Giving the model explicit human-written decision rules DECREASED performance** for most systems.
  Why it matters: the instinct to paste GRI + chapter notes into the prompt is actively harmful.
  More prompt-stuffed rules ≠ better. Rules belong in control flow and in retrieval, not in context.

**Errors are overwhelmingly "Error but Valid":** the model emits a real, legitimate-looking HS code
that is wrong. **There is no syntactic signal of failure** — no exception, no parse error, no red
flag. It flows into VNACCS, is accepted, and surfaces years later as a post-clearance audit. The
model's confidence is uncorrelated with the legal outcome, and the failure is silent and delayed.

Six documented failure modes: premature decisions (committing before gathering evidence),
information misprocessing (long-context loss of product details), unnecessary self-correction
(talking itself out of a correct answer), reasoning hallucination, wrong rule application, and
domain knowledge gaps (e.g. calling silicone "rubber").

### Vendor claims vs independent benchmarks
Independent benchmark: 103 test cases from randomized CBP rulings (verified 2026-07-17, source:
https://arxiv.org/html/2412.14179v1)

| Tool | 10-digit | Chapter-level |
|---|---|---|
| Tarifflo | 89.2% | 99/103 |
| Avalara (AI **+ human review**) | 80.0% | 100/103 |
| Zonos | **44.1%** | 93/103 |
| WCO BACUDA (6-digit ceiling) | 12.75% at 6-digit | 57/103 |

**Zonos markets "90%+ accuracy out of the box"** (verified 2026-07-17, source:
https://zonos.com/classify) and was **independently benchmarked at 44.1% at 10-digit** — a ~2× gap.
Avalara's 80% comes from a product that explicitly includes **human expert review in the loop**
(verified 2026-07-17, source: https://www.avalara.com/us/en/products/global-commerce-offerings/item-classification.html).
**Treat every vendor number as marketing until independently reproduced.** Note the benchmark is
itself small (n=103) and US-HTS-specific.

BACUDA is the WCO's own model, predicting HS from commercial descriptions with a 6-digit ceiling,
trained on historical declarations; its poor showing on CBP rulings is partly domain shift. BACUDA
ran a **National Workshop on Data Analytics for Viet Nam Customs in December 2025** — Vietnam Customs
is actively engaged with the WCO on this. (verified 2026-07-17, source:
https://bacuda.wcoomd.org/2025/12/05/national-workshop-on-data-analytics-for-viet-nam-customs/)

## 6. What actually works

**Korea Customs Service — explainable candidates + evidence, for a human decider.** Predicts 6-digit
subheadings, then **retrieves the relevant key sentences from the HS manual as explainable evidence**
for each candidate. **Top-3 accuracy 93.9%** across 925 difficult subheadings, evaluated on 5,000
recent classification requests. A user study with **32 customs experts** confirmed the suggestions +
explanations substantially reduced review time and effort. It is explicitly **decision support, not
autonomous classification**. (verified 2026-07-17, source: https://arxiv.org/abs/2311.10922 and
https://dl.acm.org/doi/10.1145/3635158)

**Deterministic Agentic Workflow.** Rejects autonomous agents. Uses a **fixed 6-stage pipeline whose
control flow is dictated by the tariff hierarchy itself**, not discovered by the LLM at runtime, and
**pre-compiles GRI and chapter/section notes offline into typed clauses — inclusions, exclusions,
priority rules** — loading the expensive chapter-note context only at the stage that needs it. On
HSCodeComp: **4-digit 75.0% top-1 / 91.5% top-3; 6-digit 64.2% top-1 / 78.3% top-3** — roughly **2×
the best autonomous agent** on the same benchmark. A **27B open-weight model reaches 84.2% (4-digit)
/ 77.4% (6-digit) agreement with the frontier model** — you do not need a frontier model for most of
the pipeline. (verified 2026-07-17, source: https://arxiv.org/html/2605.14857) 2026 preprint, not
peer-reviewed.

**The load-bearing conclusion.** Autonomous top-1 at 10-digit: 29–47%. Explainable top-3 + evidence
at 6-digit: 93.9%, with *measured* expert time savings. **The gap is not model capability — it is the
output contract.** Top-3 + evidence + human decides and top-1 + autonomy are different products, and
only one of them works. This is why v1 ships candidates and verbatim legal-note evidence, and why the
tariff numbers themselves are deterministic with no AI on them at all.

Corollaries worth keeping:

- **Ship candidates, never a bare 8-digit number.** Prefer heading (4-digit) level first.
- **Every candidate cites its authority verbatim** — the specific Chapter Note, Section Note, EN
  paragraph, SEN entry, or công văn. Quote, do not paraphrase. The KCS study proved the value is in
  the **evidence retrieval**, not the prediction. It is also the only defensible artifact when a Chi
  cục challenges the code — it becomes the hồ sơ.
- **Abstain loudly.** "These two headings both plausibly apply, here are the competing notes, this
  needs xác định trước mã số" is the highest-value output on a hard good. Routing to the Điều 28
  process is a feature, not a failure.
- **Surface disagreement.** Where công văn conflict — and they do — show both. Concealing conflict
  behind a confident single answer is the actively harmful design.
- **Never let the user's preferred code into the prompt as a premise.** Confirmation-bias
  amplification is documented: "if you want your HTS to be X (even if the correct HTS is Y), AI will
  give you an argument (or three) to support your preferred HTS." (verified 2026-07-17, source:
  https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/) The
  model is a sycophantic advocate, not a judge — and this failure manufactures the paper trail for a
  **trốn thuế** characterization.
- **"An AI tool that produces a plausible-looking ten-digit number is not reasonable care."** The
  importer is liable; the vendor assumes nothing. "The platform told me the HS code" is not a
  defence. (verified 2026-07-17, source: https://internationaltradematters.com/discussion/ai-customs-compliance-for-smes/)

**Where AI wins today with no accuracy controversy:** retrieving the relevant chapter/section notes
and exclusions for a good (a retrieval problem, where the tech is strong); finding prior Vietnamese
công văn / thông báo xác định trước mã số for similar goods (near-impossible manually because the
corpus is unindexed); **consistency auditing** — flagging where the company's own historical
declarations used different codes for the same good (this is the Polvita scenario, detectable
*before* the audit); drafting the hồ sơ xác định trước mã số; watching for FTA/C/O HS mismatches.

## 7. Vietnam-specific consequences of a wrong code

Penalties under **Nghị định 128/2020/NĐ-CP** (sửa đổi bởi **102/2021/NĐ-CP**):

| Situation | Consequence |
|---|---|
| Wrong HS, **no tax effect** | 1–2 triệu VND (Điều 8 khoản 1) |
| Wrong HS → underpaid tax, self-discovered and khai bổ sung within the Điều 9 khoản 2 windows | **10%** of the shortfall |
| Wrong HS → underpaid tax, **found by customs** | **20%** of the shortfall (Điều 9 khoản 3) |
| Characterized as **trốn thuế** (Điều 14) | **1×–3×** the evaded tax; criminal referral possible |
| All of the above | Truy thu the full shortfall + late-payment interest **0.03%/day** |

(verified 2026-07-17, source: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-8 and .../dieu-9)

- **De minimis**: no fine if the tax difference is under **500.000đ (cá nhân) / 2.000.000đ (tổ chức)**.
- **50% reduction** where the declarant self-detects and files a late khai bổ sung (Điều 8 khoản 6).
- **Limitation periods**: **5 years** for the administrative penalty, but **tax + interest recoverable
  for 10 years** from discovery. The asymmetry is the point — the fine expires long before the money does.
- **Knock-on damage dwarfs the fine**: loss of **FTA preferential rates** via C/O mismatch,
  retroactive **anti-dumping duty** assessment, and being flagged **luồng đỏ / high-risk** in the
  risk-management system. (verified 2026-07-17, source: https://thuvienphapluat.vn/tintuc/vn/thoi-su-phap-luat/tai-chinh/20921/xu-ly-khi-co-khac-biet-ma-so-hs-tren-c-o)

Why this shapes v1: the expected cost of a wrong suggestion is not the 1–2 triệu fine. It is a 10-year
truy thu window plus destroyed FTA eligibility on every past shipment of that good. This is what
makes "top-1, autonomous" indefensible at any accuracy the research reports.

## 8. Xác định trước mã số (advance ruling) — Điều 28 Luật Hải quan

The intended safety valve, and the only mechanism that produces legal certainty in Vietnam.
(verified 2026-07-17, source: https://luatvietan.vn/huong-dan-thu-tuc-xac-dinh-truoc-ma-so-hang-hoa.html)

- **File**: đơn mẫu **01/XĐTMS/TXNK** + technical dossier (phân tích thành phần, catalogue, ảnh, mẫu
  hàng), **at least 60 days before** the shipment.
- **Processing**: **30 days**, extended to **60 days** for complex cases needing verification.
- **Validity**: **maximum 3 years** from issuance.
- **Refusal grounds**: incomplete dossier; goods awaiting another agency's determination; the code has
  already been guided by a state agency.
- **The trap**: the ruling **ceases to apply if the actual goods or documents differ** from the
  samples and documents submitted. **It protects the DESCRIBED good, not the shipment.** A ruling in
  hand is not a shield if the spec drifted — so the dossier's description text is the asset, and it
  is exactly what an AI can help draft precisely.

Legal chain: Luật Hải quan 2014 Điều 28 → Nghị định 08/2015/NĐ-CP (sửa đổi bởi 59/2018/NĐ-CP) →
Thông tư 38/2015/TT-BTC Điều 7 (sửa đổi bởi Thông tư 39/2018/TT-BTC khoản 3 Điều 1). **Thông tư
121/2025/TT-BTC** (ban hành 18/12/2025, **hiệu lực 01/02/2026**) amends TT 38/2015 and 39/2018,
including sửa đổi khoản 1 and bổ sung khoản 6 Điều 7 on the advance-ruling dossier/samples, and
introduces new forms **01a-TB XDTMS / 01b-Thay the XDTMS / 01c-Huy XDTMS**. (verified 2026-07-17,
source: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-121-2025-TT-BTC-sua-doi-cac-Thong-tu-ve-thu-tuc-hai-quan-giam-sat-hai-quan-633118.aspx
and https://www.pwc.com/vn/vn/publications/news-brief/251223-new-customs-procedures-effective-from-1-february-2026.html)

## 9. The practitioner reality

- **76% of enterprises report obstacles confirming HS codes**, up from 66.3% in 2018. (verified
  2026-07-17, source: https://diendandoanhnghiep.vn/ganh-nang-ma-hs-trach-nhiem-cua-co-quan-hai-quan-o-dau-10077631.html)
The three case studies below are **⚠️ illustrative, not established fact.** Research 09 §2 reports them
**without any primary URL**. They describe the failure *shape* accurately and are directionally
corroborated by the sourced enterprise-complaint reporting above and below, but the specific figures,
codes, and dates are **not independently verified here**. Do not quote them as fact to the owner or in
the product. (source: research 09 §2; see §12 below and
[Business Rules → Unverified](../business-rules.md#unverified--do-not-rely-on))

- **The dairy case**: 8 producers (Vinamilk, Hanoimilk, Nutifood…) reportedly faced retroactive truy thu
  of **~700 tỷ VND** after customs reclassified Anhydrous Milk Fat in **Dec 2014 from 0405.90.10 →
  0405.90.90**, destroying AANZFTA 0% eligibility — **applied back to 2010 declarations**.
- **Polvita**: reportedly **78 clean declarations 2010–2019**, then sudden reclassification.
  **Nhật Thiên Kim**: years at 8544.49.49, then reassessed. Some firms are reported to have gone
  bankrupt. Businesses ask why a 5-year retroactive power designed for fraud lands on them when
  *customs itself* accepted the code for 5–10 years.
- **Inconsistency between customs units for the same good** is a documented recurring complaint.
  (verified 2026-07-17, source: https://trungtamwto.vn/hiep-dinh-khac/18495-doanh-nghiep-va-hai-quan-van-co-khuc-mac-ve-ma-hs)

**The implication to internalize**: the risk is not only "AI picks the wrong code". It is that **there
is often no stable single right answer**, and the liability sits entirely on the declarant regardless.
Past acceptance by customs is not protection. That is the argument for consistency auditing and for
routing high-stakes goods to Điều 28 — not for a better classifier.

## 10. Institutional change — document numbering and the new ruling process

**Tổng cục Hải quan ceased to exist on 01/03/2025** (Nghị định 29/2025/NĐ-CP, Quyết định
382/QĐ-BTC). It is now **Cục Hải quan** under Bộ Tài chính, with **20 Chi cục Hải quan khu vực**.
**Documents issued after that date are numbered `-CHQ`, not `-TCHQ`.** (verified 2026-07-17, source:
https://xaydungchinhsach.chinhphu.vn/quyet-dinh-382-qd-btc-quy-dinh-chuc-nang-nhiem-vu-quyen-han-va-co-cau-to-chuc-cua-cuc-hai-quan-119250228165530471.htm)

Why this is a data-model fact, not trivia: any corpus of công văn spans the break. Deduplication,
citation parsing, and "find the latest guidance on X" all need to reconcile `-TCHQ` (pre-01/03/2025)
against `-CHQ` (post). A retrieval system that only knows one prefix will silently miss half the
corpus.

**Quyết định 117/QĐ-CHQ (2026)** sets a new internal *Quy trình xác định trước mã số; kiểm tra tên
hàng, mô tả, mã số, mức thuế, đơn vị tính*, applied from **~01/02/2026**, built on the principle that
**each good has exactly one HS code** and on a **unified sector-wide classification database**.
(verified 2026-07-17, source: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Quyet-dinh-117-QD-CHQ-2026-Quy-trinh-Xac-dinh-truoc-ma-so-Kiem-tra-ten-hang-mo-ta-hang-hoa-692998.aspx)
**That database is an INTERNAL system — do not assume it will ever be exposed.** Note the tension
worth flagging to the owner: "each good has exactly one HS code" is an administrative principle, and
§4 of this note is the evidence that reality does not comply.

## 11. Data availability for classification evidence

Vietnam has **no CROSS/EBTI equivalent** — no clean, complete, machine-readable, publicly queryable
corpus of classification rulings comparable to US CBP CROSS or EU EBTI.

- The **nomenclature is public** (TT 31/2022) but published as Word/PDF annexes; **no official API**.
  Excel biểu thuế circulates commercially. Research 09 §3 describes customs.gov.vn as the only
  *nomenclature* publication with legal value for declarations. ⚠️ **Do not generalise that to the
  tariff API.** Research 10 and 12 are emphatic that the undocumented `APIBieuThue` endpoint carries
  **no legal authority — the Nghị định text does**. The nomenclature publication and the tariff lookup
  API are different artifacts on the same domain; only the first has standing. See
  [Data Sources](data-sources.md) and [Tariff System](tariff-system.md).
- **Chú giải chi tiết HS (WCO EN)** — the WCO EN is **copyrighted and not freely downloadable**.
- **Thông báo xác định trước mã số**: only partially published. VNTR
  (`vntr.moit.gov.vn/administrative_rulings`) mirrors rulings as an **HTML table of links — no API,
  no bulk download, no structured dataset**, the visible sample set was ~Sept 2021–Jan 2022, and it
  is explicitly "for consultation purpose only". (verified 2026-07-17, source:
  https://vntr.moit.gov.vn/administrative_rulings)
- **Thông báo kết quả phân loại** (Cục Kiểm định Hải quan, mẫu 04/TBKQPT-PL/2017) go to **Customslab**,
  an internal system searchable by customs units, not the public. Volume is small: **~2,500 samples
  processed**; first half of 2026 → **257 dossiers received, 143 classification notices issued**.
  (verified 2026-07-17, source: https://thuehaiquan.tapchikinhtetaichinh.vn/hai-quan-xu-ly-gan-2-500-mam-phan-tich-phan-loai-hang-hoa-xuat-nhap-khau-160924.html)

**Retrieval quality is capped by data access, not by the model.** This is the single biggest
data-engineering obstacle for the evidence half of the feature.

### The annex trap (from research 12) — the failure mode this whole project must fear

Report 12 built a real 11,874-row tariff table from Công báo `.doc` sources and its **first naive
parse reported 94% success and was confidently wrong**: `0301.11.10 → ['0', '15']`, because

- **Phụ lục I (BIỂU THUẾ XUẤT KHẨU)** → `0301.11.10 = 0`
- **Phụ lục II (BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI)** → `0301.11.10 = 15`

**1,520 HS codes appear in both annexes; 1,329 of them have different rates.** A parser that ignores
annex boundaries returns the **export** rate for an **import** question — silently, with no error, at
94% apparent success. (verified 2026-07-17, source: research 12, adversarial verification, working
artifacts in the session scratchpad)

Why it belongs in an HS-classification note: it is the *same* failure shape as "Error but Valid" HS
predictions. **The danger in this project category is never missing data — it is plausible-looking
wrong data that reports success.** Any ingestion of TT 31/2022 or a biểu thuế must be **annex-aware**
and must carry the annex identity as a first-class key, exactly as any classification output must
carry its authority tier and nomenclature version.

Report 12 also found a **temporal gap**: decrees can take legal effect the day they are signed
(ND 72/2026, signed and effective 09/03/2026) while appearing in Công báo machine-readable form
**15–48 days later**, and some **expire and silently revert** (ND 72/2026 was valid only until
30/04/2026). During that window the binding law exists publicly only as a 200-DPI scan. See the
tariff/data-source notes in this directory for the full treatment — it is their subject, not this
note's.

## 12. Unverified / Do Not Rely On

Reproduced verbatim in spirit from research 09 and 12. Do not launder these into confident claims.

- **The enforcement case studies in §9 — the dairy case (~700 tỷ VND, AMF 0405.90.10 → 0405.90.90,
  Dec 2014, retroactive to 2010), Polvita (78 clean declarations 2010–2019), Nhật Thiên Kim
  (8544.49.49), "some firms went bankrupt."** Research 09 §2 reports all of these **without a per-case
  primary URL**. They are directionally corroborated by the separately-sourced enterprise-complaint
  reporting (the 76% figure, and the customs-unit inconsistency complaint), but the **specific figures,
  HS codes, and dates are not independently verified**. They earn their place as illustrations of the
  failure shape. **Do not quote 700 tỷ as an established figure**, and do not put these cases in the
  product. Also see [Business Rules → Unverified](../business-rules.md#unverified--do-not-rely-on),
  which reaches the same conclusion.
- **"Claude 3.5 Sonnet and GPT-4 achieve ~80% at 6-digit and >90% at 2-digit."** Surfaced in a search
  snippet **without a traceable primary source**, and it **contradicts HSCodeComp** (GPT-5 LLM-only:
  29.0% at 10-digit, ~82% at 2-digit). **Do not rely on it.**
- **"1 in 3 customs entries is misclassified; tens of billions in duties incorrectly paid."** Appears
  on vendor blogs with **no primary citation**. Directionally plausible, **unsourced**.
- **Quyết định 117/QĐ-CHQ (2026) details** — research 09 could not fetch the full text
  (paywall/403). Treat the ruling-process details in §10 as **medium confidence**.
- **A further Luật Hải quan amendment was tabled to the UBTVQH on 15/7/2026** — the legal framework is
  **in flux**; §7–§8 may move.
- **Deterministic Agentic Workflow (arXiv:2605.14857)** is a **2026 preprint, not peer-reviewed**.
- The vendor benchmark (arXiv:2412.14179) is **small (n=103) and US-HTS-specific**. It does not
  transfer cleanly to AHTN 8-digit Vietnam.
- **CONTESTED / UNRESOLVED — customs.gov.vn API.** Research 10 reports the discovery of a
  customs.gov.vn API; **research 12 partially contradicts it**. Report 12 verified that
  `/scripts/main.js` hardcodes a JSON backend at `http://123.30.210.236:8080/hqcustomsapi/` — a raw
  IP over plain HTTP on port 8080, including a `.../hqcustomsapi/captcha/CheckCaptcha` endpoint, so
  **at least part of the portal is CAPTCHA-gated** — but **that IP timed out** from the research
  environment, and report 12 explicitly **could not distinguish geo-fencing from a sandbox egress
  block** and therefore does **not** claim it is unreachable. Report 12's further position is that
  even if reachable it is a *lookup* tool and not a bulk export, enumerating ~11k codes through a
  CAPTCHA-fronted undocumented endpoint on a raw IP is fragile and adversarial, and **it carries no
  legal authority — the Nghị định does**. **Both positions stand. The conflict is unresolved.** Do
  not plan a dependency on this API without first reproducing reachability from Vietnam.

## Related Knowledge

- [Project Context](../project-context.md) — what Customs Assistant is, who it serves, v1 scope.
- [Business Rules](../business-rules.md) — where durable policy and validation rules for the
  candidate-suggestion contract belong.
- [Agent Rules](../AGENTS.md) — documentation and note conventions this file follows.
- [Agent Memory Index](../index.md) — navigation map for durable memory.
- Sibling notes in this `concepts/` directory cover the tariff schedule structure, tariff data
  sources and their temporal model, and the Vietnamese legal corpus. This note deliberately stops at
  the annex trap (§11) and defers the amendment-stream problem to them.
