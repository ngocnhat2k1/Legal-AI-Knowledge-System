---
type: business-rules
status: active
updated: 2026-07-17
related:
  - project-context.md
  - index.md
  - naming-conventions.md
  - architecture-decisions/README.md
  - planning/01-task-list.md
---

# Business Rules

This is the safety spine of **Customs Assistant**. Every rule below states the rule, the evidence for it, and the consequence of breaking it.

**Read this before designing any feature that touches an HS code, a tax rate, or a legal citation.**

The framing that unifies all twelve rules: **this product's failure mode is not a crash, an empty result, or an obviously wrong answer. It is a plausible, correctly-formatted, confidently-presented wrong answer that flows into a legally binding customs declaration and surfaces years later as a post-clearance audit.** Every rule here exists to make that specific failure impossible or loud.

Evidence convention: every factual claim carries `(verified YYYY-MM-DD, source: <URL>)`. Claims the research could not verify live under [Unverified / Do Not Rely On](#unverified--do-not-rely-on) — never promote them into the rules above without new verification.

---

## R1 — Tariff rates must never be produced by an LLM

**Rule.** A tariff rate is retrieved by exact key lookup in SQL: `(hs_code, schedule, effective_date)` → row. No embedding search, no vector similarity, no LLM generation, no LLM "correction" of a retrieved value ever sits on the path between the tariff table and the number the user sees. AI may help the user *find which key to look up*; it may never *produce the value*.

**Why.** Semantic search returns the most similar-looking row. In a tariff table, the most similar-looking row is almost always the wrong row — the nomenclature is deliberately built out of near-identical sibling lines that differ by one qualifier and by tens of percentage points. `0405.90.10` and `0405.90.90` are one digit and one clause apart, and that gap is reported to have been worth roughly 700 tỷ VND (see [R3](#r3--error-but-valid-is-the-defining-failure-mode) — the figure is illustrative, not independently verified). Similarity is the wrong metric for a table whose entire design is to make similar things legally distinct.

**Consequence of breaking it.** A rate that is off by a plausible amount is invisible to the user, invisible in review, and legally binding once declared. The declarant pays truy thu + penalty + 0.03%/day interest. See [R3](#r3--error-but-valid-is-the-defining-failure-mode) for the schedule.

**Evidence.** The full MFN table is obtainable as machine-readable text — 11,874 unique 8-digit HS codes, 11,160 (94.0%) with rates, extracted from the 14 Công báo `.doc` parts of Nghị định 26/2023/NĐ-CP (verified 2026-07-17, source: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm). There is no data-availability excuse for generating a rate. Deterministic lookup is available; use it.

---

## R2 — Never output a bare HS code

**Rule.** The output contract for classification is: **top-3 candidates, starting at 4-digit heading level, each carrying verbatim chapter/section-note evidence, decided by a human.** Never a single bare 8-digit number. Never a paraphrase of a legal note — quote it.

**Why — the gap is the output contract, not model capability.** This is the single most load-bearing empirical finding in the whole project:

| System | 10-digit accuracy | Source |
|---|---|---|
| Human experts | **95.0%** | HSCodeComp |
| Best agent (SmolAgent + GPT-5 VLM) | **46.8%** | HSCodeComp |
| Gemini Deep Research | 40.8% | HSCodeComp |
| GPT-5, LLM only, no tools | **29.0%** | HSCodeComp |

(verified 2026-07-17, source: https://arxiv.org/html/2510.19631 — 632 expert-annotated products, 27 HS chapters, double-annotated)

Accuracy collapses down the hierarchy: **~82% at 2-digit → 29–47% at 10-digit** (same source). Now the other side:

- **Korea Customs Service**: predicts 6-digit subheadings, then **retrieves the relevant key sentences from the HS manual as explainable evidence** for each candidate. **Top-3 accuracy 93.9%** across 925 difficult subheadings on 5,000 recent classification requests, with a 32-expert user study confirming **substantially reduced review time and effort** (verified 2026-07-17, source: https://arxiv.org/abs/2311.10922 · https://dl.acm.org/doi/10.1145/3635158).
- **Deterministic Agentic Workflow** (fixed pipeline, tariff hierarchy as control flow, chapter notes pre-compiled offline into typed clauses): 4-digit **75.0% top-1 / 91.5% top-3**; 6-digit **64.2% top-1 / 78.3% top-3** — roughly 2× the best autonomous agent on the same benchmark (verified 2026-07-17, source: https://arxiv.org/html/2605.14857 — 2026 preprint, **not peer-reviewed**).

**47% → 93.9% is not a model upgrade. It is a different output contract.** Top-1 autonomous and top-3-with-evidence-for-a-human are two different products, and only one of them works.

**Two findings that kill the obvious "improvements":**
- **Test-time scaling does not help.** Majority voting and self-reflection gave negligible gains — unlike other reasoning domains.
- **Giving the model explicit human-written decision rules *decreased* performance for most systems.** More prompt-stuffed rules ≠ better. (both verified 2026-07-17, source: https://arxiv.org/html/2510.19631)

Do not "fix" accuracy by prompt-stuffing the nomenclature or by voting over samples. The measured answer is: change the contract.

**Consequence of breaking it.** A bare code is an answer, and an answer transfers responsibility in the user's mind while transferring none in law. "An AI tool that produces a plausible-looking ten-digit number is not reasonable care"; the importer is liable and the vendor assumes nothing — "the platform told me the HS code" is not a defence (verified 2026-07-17, source: https://internationaltradematters.com/discussion/ai-customs-compliance-for-smes/ · https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/).

**Corollary — the evidence IS the product.** What the KCS study proved delivers value is not the prediction, it is the **evidence retrieval**. The verbatim Chapter Note / Section Note / EN paragraph / SEN entry / công văn is also the only defensible artifact when a Chi cục Hải quan khu vực challenges the code — it becomes the hồ sơ. Quote it; never paraphrase it.

**Authority hierarchy the evidence must respect** (verified 2026-07-17, source: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/guide/legal-notes-legales-eng.html · https://taxation-customs.ec.europa.eu/customs/common-customs-tariff-cct/tariff-classification-goods/harmonized-system_en):
- **Binding**: heading/subheading text + Section, Chapter and Subheading Notes ("Legal Notes"). GRI 1 — titles are for reference only.
- **Not binding but authoritative**: WCO Explanatory Notes (EN) and the Compendium of Classification Opinions.
- **ASEAN layer**: SEN (Supplementary Explanatory Notes) for AHTN 8-digit, circulated in Vietnam by **Công văn 3866/TCHQ-TXNK (24/07/2023)** (verified 2026-07-17, source: https://thuvienxuatnhapkhau.com/wp-content/uploads/2023/07/3866_Chu-giai-SEN-2022.pdf). **SEN is not independently binding** — an argument resting on SEN that contradicts the HS EN is legally weak.

An evidence panel that cites a SEN entry with the same visual weight as a binding Chapter Note misrepresents the law. Rank the evidence by authority, visibly.

---

## R3 — "Error but Valid" is the defining failure mode

**Rule.** Design every classification surface on the assumption that a wrong answer looks exactly like a right answer. There is no exception to catch, no parse failure, no red flag, no confidence signal that correlates with the legal outcome. Any design that relies on "we'd notice if it were wrong" is invalid.

**Why.** HSCodeComp's error taxonomy found errors are overwhelmingly **"Error but Valid"** — the model outputs a real, legitimate-looking HS code that is wrong. **There is no syntactic signal of failure** (verified 2026-07-17, source: https://arxiv.org/html/2510.19631). The wrong code flows straight into VNACCS, is accepted, clears — and surfaces years later as a post-clearance audit. **The AI's confidence is uncorrelated with the eventual legal outcome, and the failure is silent and delayed.**

The six documented failure modes, all of which produce valid-looking output: premature decisions; information misprocessing (long-context loss of product details); unnecessary self-correction (talking itself out of a correct answer); reasoning hallucination (plausible-but-false chains); wrong rule application (misusing GRI on ambiguous text); domain knowledge gaps (e.g. calling silicone "rubber") (same source).

**Consequence of breaking it — the penalty schedule.** Nghị định 128/2020/NĐ-CP, sửa đổi bởi 102/2021/NĐ-CP (verified 2026-07-17, source: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-8 · https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-9):

| Situation | Consequence |
|---|---|
| Wrong HS, **no tax effect** | **1–2 triệu VND** (Điều 8 khoản 1) |
| Wrong HS → underpaid tax, **self-discovered** & khai bổ sung within the Điều 9 khoản 2 windows | **10%** of the shortfall |
| Wrong HS → underpaid tax, **found by customs** | **20%** of the shortfall (Điều 9 khoản 3) |
| Characterized as **trốn thuế** (Điều 14) | **1× to 3×** the evaded tax; criminal referral possible |
| All of the above | **Truy thu** full shortfall + late-payment interest **0.03%/day** |

Also: no fine if the tax difference is under **500.000đ (cá nhân) / 2.000.000đ (tổ chức)**; **50% reduction** where the declarant self-detects and files a late khai bổ sung (Điều 8 khoản 6); **statute of limitations 5 years for the administrative penalty, but tax + interest recoverable for 10 years from discovery** (same source).

**Note the asymmetry that shapes the product:** self-discovery is 10%, customs discovery is 20%, and a bad paper trail is 100–300%. The product's value is disproportionately in *finding the error before customs does* — which is why consistency auditing (flagging where a company's own historical declarations used different codes for the same good) is a first-class feature, not a nice-to-have.

**The knock-on damage dwarfs the fine:** loss of FTA preferential rates on C/O mismatch, retroactive anti-dumping duty assessment, and being flagged **luồng đỏ / high-risk** in the risk-management system (verified 2026-07-17, source: https://thuvienphapluat.vn/tintuc/vn/thoi-su-phap-luat/tai-chinh/20921/xu-ly-khi-co-khac-biet-ma-so-hs-tren-c-o).

**The case that makes it concrete — the dairy case.** Eight producers (Vinamilk, Hanoimilk, Nutifood…) faced retroactive truy thu of **~700 tỷ VND** after customs reclassified Anhydrous Milk Fat in December 2014 from **0405.90.10 → 0405.90.90**, destroying AANZFTA 0% eligibility — **applied back to 2010 declarations** (source: research 09 §2; the report carries no per-case primary URL — see [Unverified](#unverified--do-not-rely-on)). Related: **Polvita** — 78 clean declarations 2010–2019, then sudden reclassification. **Nhật Thiên Kim** — years at 8544.49.49, then reassessed. Some firms went bankrupt. Businesses ask why the 5-year retroactive power, designed for fraud, falls on them when *customs itself* accepted the code for 5–10 years (verified 2026-07-17, source: https://diendandoanhnghiep.vn/ganh-nang-ma-hs-trach-nhiem-cua-co-quan-hai-quan-o-dau-10077631.html).

**76% of enterprises** report obstacles confirming HS codes, up from 66.3% in 2018 (same source). Inconsistency between customs units for the same good is a recurring documented complaint (verified 2026-07-17, source: https://trungtamwto.vn/hiep-dinh-khac/18495-doanh-nghiep-va-hai-quan-van-co-khuc-mac-ve-ma-hs).

**The deepest implication.** The risk is not just "AI picks wrong code." It is that **there is often no stable single right answer, and the liability sits entirely on the declarant regardless.** In an audit of 226 HSCodeComp disagreements, **~42.5% of "wrong" model predictions were arguably better supported by HS rules than the published ground truth** (verified 2026-07-17, source: https://arxiv.org/html/2605.14857). Optimizing for agreement with customs is the commercially correct target — but it is not the same thing as being right, and the product must not conflate them.

---

## R4 — Never put the user's preferred HS code into the prompt as a premise

**Rule.** The user's desired/expected/historical HS code must never enter a classification prompt as context, hint, premise, or "for reference". Classification input is the **goods description and technical facts only**. If the user supplies a preferred code, hold it **outside** the classification path and use it **only afterwards**, as a comparison target ("your code X is / is not among the evidence-supported candidates").

**Why.** The LLM is a sycophantic advocate, not a judge. Verbatim from practitioners:

> "if you want your HTS to be X (even if the correct HTS is Y), AI will give you an argument (or three) to support your preferred HTS"

(verified 2026-07-17, source: https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/)

This is the failure mode an LLM is *most* prone to and the one with the **worst** legal consequences — it does not merely produce a wrong code, it **manufactures the written argument for why the declarant chose it**. That artifact is precisely what converts a "wrong HS → 20% shortfall" case into a **trốn thuế** characterization at **1×–3× the evaded tax plus criminal referral** (see [R3](#r3--error-but-valid-is-the-defining-failure-mode)). The tool would be generating the prosecution's evidence.

**Consequence of breaking it.** The product becomes a machine for producing self-incriminating paper trails. This is the worst outcome available in the design space — worse than being wrong, because being wrong is 20% and this is 300% plus referral.

**Related biases, same root** (same source):
- **Functional vs verbal classification** — a "clock with a radio" may legally be a "radio with a clock". LLMs pattern-match the description, not the function.
- **Ambiguity collapse** — a health-monitoring smartwatch is a watch, a medical device, or a communications device depending on legal interpretation; "AI will select the 'most probable' match, which could very well be the wrong match."

---

## R5 — Abstention is a first-class success

**Rule.** "These two headings both plausibly apply; here are the competing notes; this needs **xác định trước mã số** under Điều 28 Luật Hải quan" is a **correct, successful, shippable output** for a hard good. Routing to the advance-ruling process is a **feature**. Metrics, UI, and reviews must treat abstention as a win, never as coverage lost.

**Why.** For high-stakes goods, **xác định trước mã số under Điều 28 Luật Hải quan 2014 is the only mechanism that produces legal certainty in Vietnam** (source: research 09 §2; procedure detail verified 2026-07-17, source: https://luatvietan.vn/huong-dan-thu-tuc-xac-dinh-truoc-ma-so-hang-hoa.html). No AI output has legal weight; a ruling does. A tool that answers confidently where the law is genuinely unsettled is not more useful than one that abstains — it is *less* useful, because it suppresses the only action that actually resolves the risk.

Abstention is also the empirically-supported design in adjacent legal RAG: a pre-generation similarity gate plus a post-generation evidence check, returning `Unknown Answer` on failure, is the published blueprint (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf — SBV-LawGraph Algorithm 2; single-study).

**The advance-ruling facts the product must encode** (verified 2026-07-17, source: https://luatvietan.vn/huong-dan-thu-tuc-xac-dinh-truoc-ma-so-hang-hoa.html; framework: Luật Hải quan 2014 Điều 28; Nghị định 08/2015/NĐ-CP sửa đổi bởi 59/2018/NĐ-CP; Thông tư 38/2015/TT-BTC Điều 7 sửa đổi bởi Thông tư 39/2018/TT-BTC):

- **File**: Đơn mẫu **01/XĐTMS/TXNK** + technical dossier (phân tích thành phần, catalogue, ảnh, mẫu hàng), **at least 60 days before** the shipment.
- **Processing**: **30 days**, extended to **60 days** for complex cases needing verification.
- **Validity**: **maximum 3 years** from issuance.
- **Refusal grounds**: incomplete dossier; goods awaiting another agency's determination; the code has already been guided by a state agency.
- **The trap**: the ruling **ceases to apply** if the actual goods/documents differ from the samples and documents submitted. **It protects the *described* good, not the *shipment*.** Any UI that says "you have a ruling, you're safe" is wrong.

**Corollary — surface disagreement, do not hide it.** Where customs công văn conflict — and they do; that is what the 76% complaint is made of — **show both**. Concealing conflict behind a confident single answer is the actively harmful design (source: research 09 §5).

**Where AI clearly wins, with no accuracy controversy** — these are the abstention-compatible features to build (source: research 09 §5):
- Retrieving the relevant chapter/section notes and exclusions for a good — genuinely hard manual work, and a **retrieval problem**, where the tech is strong.
- Finding prior Vietnamese công văn / thông báo xác định trước mã số for similar goods — currently near-impossible manually because the corpus is not indexed.
- **Consistency auditing** — flagging where a company's own historical declarations diverge for the same good. This is the Polvita scenario, and it is detectable *before* the audit.
- Drafting the hồ sơ xác định trước mã số (mẫu 01/XĐTMS/TXNK) with the technical description and legal argument assembled.
- Watching for FTA/C/O HS mismatches.

---

## R6 — A rate is never a scalar; it is a conditional claim with an as-of date

**Rule.** The data model must never contain a column that means "the tax on this good". `(HS, country) → rate` **is not even a function.** Every rate is a conditional claim carrying its conditions, its schedule, its annex, its state flags, and its as-of date. Reject any schema, API response, or UI string that flattens it.

**Why — the verified conditions, each of which independently breaks the scalar model** (all verified 2026-07-17 from decree text obtained via Công báo, source: research 12 §6; RCEP = Nghị định 129/2022/NĐ-CP, https://congbao.chinhphu.vn/):

1. **MFN vs FTA is conditional, not automatic.** RCEP Điều 4 requires origin rules **plus a valid certificate of origin**. "The tax is 0%" is **wrong**. "**0% if you hold a valid C/O, else 15% MFN**" is right. The C/O is a document the user may or may not have; the tool cannot know, so it must present both branches.
2. **RCEP Điều 6.2 has a highest-rate rule.** Verified verbatim in the decree text: *"Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."* — for certain multi-origin goods the applicable rate is the **highest** across the country annexes. This is why `(HS, country) → rate` is not a function: the answer depends on the *set* of origins, not on one origin.
3. **`*` means EXCLUDED, not zero.** 54 `*` cells were found in a single RCEP gazette issue alone. A parser that coerces `*` to 0 (or to null-then-0 downstream) invents a 0% preference that does not exist.
4. **TRQ goods depend on quota status.** Headings **04.07, 17.01, 24.01, 25.01** (verified in ND 129 text). Out-of-quota rates live in a **different annex** (ND 26/2023 Phụ lục IV). In-quota vs out-of-quota is a fact about the importer's quota allocation, not about the HS code.
5. **Absolute/mixed duties are USD amounts, not percentages.** Used cars, ND 26/2023 **Phụ lục III**. The adversarial parse found **0 rows** there with a `%` regex — the annex is structurally different, and a `%`-shaped schema silently drops it.
6. **Chapter 98 special codes** (e.g. 98.49 auto components) carry program-eligibility conditions, not just rates.
7. **The tariff is often the least important number.** Anti-dumping/safeguard duties are country-specific and live in **MOIT Quyết định — in no Nghị định at all**. For the archetypal query "steel from China", the tariff table is the *least* important input. The declarant also needs **VAT + TTĐB + BVMT**, which are separate instruments entirely (see [R12](#r12--ttđb-and-bvmt-are-not-hs-keyed-in-law)).

**Consequence of breaking it.** Every one of these produces a *confident, well-formatted, wrong* number. A user told "0%" who lacks a valid C/O underpays by the full MFN rate and lands in [R3](#r3--error-but-valid-is-the-defining-failure-mode).

**Design directive.** Model schedule, annex, effective interval, and state flags (`excluded`, `trq_in`, `trq_out`, `absolute_duty`, `co_required`) as **first-class columns**. The v1 output for a rate is a *set of conditional branches with their conditions stated*, not a number.

---

## R7 — Every answer cites the decree and the data snapshot date, and refuses when the snapshot may be stale

**Rule.** No rate is ever displayed without (a) the decree it comes from and (b) the date the snapshot was taken. When the current date falls in a window where the snapshot could be behind the in-force law, the system **refuses or warns loudly** — it does not serve the last-known value silently.

**Why — the gazette gap is real, measured, and unclosable by any crawl schedule** (all verified 2026-07-17, source: research 12 §3; https://congbao.chinhphu.vn/):

- **Nghị định 72/2026/NĐ-CP** was **signed 09/03/2026 and took effect the same day** ("kể từ ngày ký") — petrol/naphtha/reformate **10% → 0%**. **Zero lead time.**
- It was published in **Công báo số 157 on 24/03/2026 — 15 days *after* it was already binding law.**
- Comparable lags: ND 26/2023 signed 31/05/2023, gazetted 19/06/2023 (~19 days). EVFTA ND 116/2022 signed 30/12/2022, gazetted from 16/02/2023 (~48 days).

**During that window the legally in-force rate exists in machine-readable form NOWHERE.** It exists only as a 200-DPI bitonal scan on chinhphu.vn — producer string `Kodak Alaris Inc.`, exactly one `/CCITTFaxDecode` bilevel image per page, page images 1666×2329 px, and `26-nd-2.pdf` contains **zero `/Font` objects: literally no text layer** across 1,016 scanned pages (verified 2026-07-17, source: https://datafiles.chinhphu.vn/cpp/files/vbpq/2023/6/26-nd.signed.pdf · https://datafiles.chinhphu.vn/cpp/files/vbpq/2023/6/26-nd-2.pdf).

**No crawl schedule can close a gap where the source does not yet exist.** This is not an engineering problem to optimize; it is a property of the legal system. The only honest response is to *know the gap exists and say so*.

**Consequence of breaking it.** Customs declarations are legally binding. A stale rate means underpayment → back-assessment, penalties, and **the declarant, not the AI vendor, carries the liability** ([R3](#r3--error-but-valid-is-the-defining-failure-mode)).

**The framing to internalize** (source: research 12, conclusion):

> "This is not a crawling problem that resolves into a database. It is a **legal-currency problem wearing a data-engineering costume.**"

The baseline table is a one-time job of a few hours. Staying correct is unbounded, adversarial, and permanently behind — and every gap is a legally binding wrong answer on someone else's declaration. Price the product accordingly: **a research aid that shows its sources, never an answer engine that states a rate.**

**Source-of-truth rule that follows.** Công báo `.doc` is the sole ingestion source (robots.txt = `User-agent: * / Allow: /`, verified 2026-07-17, source: https://congbao.chinhphu.vn/robots.txt). Parse with a real Word/OOXML parser reading `w:tbl/w:tr/w:tc` — **not** `textutil`. See [R9](#r9--annex-boundaries-are-load-bearing) and [Unverified](#unverified--do-not-rely-on).

---

## R8 — Never model "the latest version"

**Rule.** The temporal model is **effective-date/expiry-aware**, with valid-time intervals as a hard filter: `valid_start ≤ as_of < coalesce(valid_end, +∞)`. There is no "current rate" column. "Latest" is not a concept this system has.

**Why — decrees expire and silently revert.** **ND 72/2026 was valid only until 30/04/2026 — a 52-day window — after which rates revert to ND 26/2023** (verified 2026-07-17, source: research 12 §3). A "scrape the latest version" design has no concept of expiry-and-revert. **It would serve 0% petrol forever.** Note the shape of that failure: nothing errors, nothing 404s, no new document appears to trigger a re-crawl. The system is wrong because *nothing happened*.

**Consequence of breaking it.** Silent, permanent, undetectable-by-monitoring wrongness on exactly the goods that move the most money.

**Supporting evidence from statutory RAG generally.** Two distinct measured temporal failure modes in LLMs: applying **outdated rules** after legislation changes, and **preferring newer provisions even when the older version applies** — a recency bias that **RAG alone does not fix**. The actionable result: **retrieval approaches that treat temporal validity as a *hard constraint* (filter, not ranking signal) substantially improve performance** (verified 2026-07-17, source: https://arxiv.org/abs/2605.23497 — 312 validated German statutory QA pairs, five major LLMs). Extract the as-of date from the query, then **filter** the candidate set. Do not hope the reranker sorts it out.

Scale check on why this matters: in a real Vietnamese corpus (1,703 SBV documents), **863 fully repealed, 191 partially repealed, 639 effective — ~62% of the corpus is dead or partly dead law** (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).

**The amendment chain to model, not flatten.** ND 26/2023 is the base decree and has **not** been superseded; it is amended by a chain: **144/2024** (eff. 16/12/2024), **199/2025** (08/07/2025 — yellow phosphorus 5→10% on 01/01/2026, →15% on 01/01/2027; TMBP 0% only through 08/2025; auto-component volume conditions), **72/2026** (09/03/2026–30/04/2026), plus new **AJCEP and VJEPA** schedules eff. **01/04/2026**, a Vietnam–Cambodia 2026 schedule, and ND 26/2026 (chemicals) (verified 2026-07-17, source: research 12 §3 — chain live-confirmed). **Correct 2026 MFN is a composition, not a document.** There is no official văn bản hợp nhất of the tariff published as machine-readable data.

**Hard deadlines to design for now:**
- **HS 2028 takes effect 01/01/2028** (8th WCO edition; amendments provisionally adopted at the 75th HSC session, April 2025). **Do not hardcode AHTN 2022** — model HS version as a dimension with validity dates. Renomenclature re-bases HS codes and orphans historical mappings. The current nomenclature is **Thông tư 31/2022/TT-BTC** (eff. 01/12/2022; HS 2022/AHTN 2022; **21 phần · 97 chương · 1.228 nhóm · 4.084 phân nhóm · 11.414 dòng hàng**), still operative in 2026 (verified 2026-07-17, source: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx · research 10 §2).
- **Essentially the entire FTA corpus expires 31/12/2027** — the ~17 decrees issued 30/12/2022 (112–129/2022; **128/2022 is not a tariff decree — do not assume a contiguous range**) cover 2022–2027, colliding with the AHTN 2028 switch. Total corpus replacement in one shot, roughly 18 months out (verified 2026-07-17, source: research 10 §3 — but see [Unverified](#unverified--do-not-rely-on) on the *simultaneity* inference).
- **The `-TCHQ` → `-CHQ` document-number break at 01/03/2025.** Tổng cục Hải quan no longer exists; it is **Cục Hải quan** under Bộ Tài chính, with **20 Chi cục Hải quan khu vực** (Nghị định 29/2025/NĐ-CP, Quyết định 382/QĐ-BTC) (verified 2026-07-17, source: https://xaydungchinhsach.chinhphu.vn/quyet-dinh-382-qd-btc-quy-dinh-chuc-nang-nhiem-vu-quyen-han-va-co-cau-to-chuc-cua-cuc-hai-quan-119250228165530471.htm). Any document-number parser or citation formatter must handle both eras.

---

## R9 — Annex boundaries are load-bearing

**Rule.** Every parsed tariff row carries its annex identity (`Phụ lục I` = export, `Phụ lục II` = import MFN, `Phụ lục III` = absolute/mixed, `Phụ lục IV` = out-of-quota TRQ). Every query filters on it. A row without an annex is not ingested.

**Why — this is the best evidence in the whole research set for what this project looks like when it fails.** The adversarial investigation's first naive parse **reported 94% success and was confidently wrong**:

```
0301.11.10 → ['0', '15']
```

Tracing it (verified 2026-07-17, source: research 12 §6, from the ND 26/2023 Công báo `.doc` parts):
- **Phụ lục I (BIỂU THUẾ XUẤT KHẨU)** → `0301.11.10 = 0`
- **Phụ lục II (BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI)** → `0301.11.10 = 15`

**1,520 HS codes appear in both annexes. 1,329 of them have DIFFERENT rates.** An annex-blind parser returns the **export** rate for an **import** question — **silently, with no error, at 94% apparent success.**

**Consequence of breaking it.** 1,329 codes' worth of wrong answers, indistinguishable from right answers, with a green dashboard. This is [R3](#r3--error-but-valid-is-the-defining-failure-mode) reproduced at the data layer: *not missing data, but plausible-looking wrong data.*

**Once annex-aware, the table validated.** `2710.12.21/.22/.24/.25/.80 = 10%` was extracted from ND 26/2023, and independent press reporting of ND 72/2026 describes it as cutting those exact codes **"từ 10% xuống 0%"** — two independent sources agreeing on the same five codes. The parser is correct **once it respects annexes** (verified 2026-07-17, source: research 12 §6).

**Annex shape, for the schema** (verified 2026-07-17, source: research 12 §1):

| Annex | Content | Unique HS | With rate |
|---|---|---|---|
| Phụ lục I | Biểu thuế **xuất khẩu** | 1,520 | 1,471 (96.8%) |
| Phụ lục II | Biểu thuế **nhập khẩu ưu đãi** (MFN) | 11,874 | **11,160 (94.0%)** |
| Phụ lục III | Absolute/mixed duty (used cars) | — | 0 (USD amounts, not %) |
| Phụ lục IV | Out-of-quota TRQ rates | — | 0 (separate structure) |

Note that Phụ lục I is a **taxable-goods list only**, not the full 97 chapters — its 1,520 codes are exactly the overlap set above. The absence of an HS code from Phụ lục I is meaningful; it is not missing data.

**The generalization.** Annexes are one instance of a class: **structural boundaries in legal documents carry legal meaning, and flattening them produces silent wrongness.** The same principle is why structural chunking beats fixed-size chunking in statutory RAG — Recall@10 **0.46–0.47** for section/subsection-level chunking vs **0.31–0.37** for fixed-size, statistically significant (Friedman omnibus p < 0.0001, then paired permutation tests with Holm correction) (verified 2026-07-17, source: https://arxiv.org/pdf/2605.19806 — full BGB, 2,455 sections, 525 questions). Never cut across a boundary the law drew on purpose.

---

## R10 — Citation grounding must verify SUPPORT, not EXISTENCE

**Rule.** A grounding check must verify that **the cited provision supports the proposition asserted**. "The citation resolves to a real document" is not a grounding check and must never be shipped as one. A Điều-number validator gives false comfort.

**Why.** The definitive source is the first **preregistered** evaluation of leading AI legal research tools — 202 queries, expert-scored (verified 2026-07-17, source: https://doi.org/10.1111/jels.12413 · PDF: https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf · writeup: https://hai.stanford.edu/news/ai-trial-legal-models-hallucinate-1-out-6-or-more-benchmarking-queries):

| System | Result |
|---|---|
| Lexis+ AI | 65% accurate; **hallucinates >17%** |
| Westlaw AI-Assisted Research | 42% accurate; **hallucinates >34%** |
| Ask Practical Law AI | 17–33% hallucination band |
| GPT-4 (no RAG) | ~43% hallucination |

Measured against vendor claims of "hallucination-free linked legal citations" (LexisNexis) and RAG "dramatically reduces hallucinations to nearly zero" (Thomson Reuters exec). **These are the numbers to anchor stakeholder expectations with.**

**The Wilgarten case is the whole point.** Asked for opinions by **"Luther A. Wilgarten" — a fictitious judge** — Lexis+ AI returned a **real case with a real, correctly-formatted citation**, not written by that (nonexistent) judge. The authors' phrase: *"hallucination-free in a narrow sense."*

**"Every citation resolves" is exactly the guarantee vendors market and exactly the one that fails.** It is not a weak guarantee; it is the guarantee that is *compatible with the failure*.

**Consequence of breaking it.** A user is shown a real Chapter Note next to a claim the note does not support. Because the note is real and correctly cited, review passes. This is [R3](#r3--error-but-valid-is-the-defining-failure-mode) at the citation layer, and it defeats the exact mechanism [R2](#r2--never-output-a-bare-hs-code) relies on to make the product safe — **evidence that does not support the candidate is worse than no evidence, because it launders it.**

**Related measured failure modes to design against** (verified 2026-07-17, sources as noted):
- **Document-Level Retrieval Mismatch (DRM)** — right-looking chunk, **wrong văn bản**; observed **>95%** on some datasets (source: https://arxiv.org/html/2510.06999v1). Highly relevant here: "Điều 5. Giải thích từ ngữ" exists in hundreds of văn bản and is near-textually-identical. Mitigation: prepend a ~150-char document-level summary/identity to every chunk before embedding — roughly **halved DRM**, and *generic* summaries beat expert-guided ones. Exclude the prefix from the BM25 index (BM25 otherwise latches onto the prefix rather than the chunk body).
- **Training data overriding retrieval context** — "the LLM may have been trained on a much greater volume of text supporting the broadly applicable rule and may be more faithful to its training data than to the retrieval context" (Magesh et al.). **Directly relevant: a Vietnamese exception in a Thông tư vs the general rule in the Luật.**
- **Textual relevance ≠ legal relevance** — right words, wrong jurisdiction/conditions/hierarchy (Magesh et al. §3.2).
- **Semantic blur on decisive tokens** — `unverzüglich` ("without undue delay") vs `sofort` ("immediately") are near-identical in embedding space and legally different. Vietnamese equivalents: **"có thể" vs "phải"**, **"trong thời hạn" vs "chậm nhất"**. Dense embeddings blur precisely the tokens carrying decisive legal weight — a structural argument for hybrid BM25 + dense (source: https://arxiv.org/pdf/2605.19806).
- **Lost in the middle** — dumping 20 Điều into context actively degrades faithfulness. Argues for aggressive reranking and **low top-k** (k=5 in SBV-LawGraph), not "retrieve more to be safe" (source: https://arxiv.org/pdf/2605.19806).

**Correctness definition to adopt.** An answer counts correct only if **(i)** semantically equivalent, **(ii)** contains ≥1 legal citation, and **(iii)** **citations are valid AND relevant** — conjunctive (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf). Condition (iii) is the operationalization of the Wilgarten lesson. **Preregister evaluations** — that is Magesh et al.'s core methodological contribution, and the field is full of vendor claims that do not survive contact with a preregistered protocol.

---

## R11 — Do not scrape thuvienphapluat.vn or luatvietnam.vn

**Rule.** Neither site is an ingestion source. Not for text, not for their Excel biểu thuế, not "just for cross-checking". Use **congbao.chinhphu.vn** (authority + Word format) and **vbpl.vn** (hiệu lực status + relationship graph).

**Why — thuvienphapluat.vn: three independent refusals** (all verified 2026-07-17, source: https://thuvienphapluat.vn/robots.txt and direct fetch attempts, research 04 §2 / research 12 §4):

1. **robots.txt names ClaudeBot explicitly**: `User-agent: ClaudeBot` → `Disallow: /` (alongside GPTBot, CCBot, Google-Extended, Bytespider, Amazonbot, meta-externalagent).
2. **Content-Signal: `search=yes, ai-train=no, use=reference`**, framed as *"express reservations of rights under Article 4 of EU Directive 2019/790"*. `ai-train=no` covers building a training/embedding corpus. No `ai-input` signal is granted.
3. **Cloudflare hard-blocks it anyway** — 403 "Just a moment" on all three attempts (browser UA, default curl UA, ClaudeBot UA).

Their consolidated texts are **editorial work product**, not public-record text — which is exactly what they are reserving. Their Excel biểu thuế is a **commercial product**. This makes TVPL the **worst-liability source, not the shortcut it appears to be**. Everything it has that matters is in vbpl and Công báo. If TVPL specifically is wanted, **license it** — they sell API/data access.

**Why — luatvietnam.vn: silent wrong-document resolution.** It **resolves by numeric ID and ignores the slug**. During research, the URL `/thue/luat-thue-thu-nhap-ca-nhan-2007-30759-d1.html` **silently 301'd to a completely unrelated Công văn về đất đai** at `-30759-d6.html` (verified 2026-07-17, source: research 04 §4, direct fetch). No error. No warning. A different law entirely, served under the URL of the one requested. It is also heavily login-walled and its robots.txt disallows `/VL/*` and all `?Keywords=` search URLs.

**Consequence of breaking it.** For TVPL: a named-and-refused crawl, an express EU DSM Art. 4 rights reservation, and a corpus built on someone else's commercial editorial product — legal exposure on a product whose entire value proposition is legal defensibility. For luatvietnam: **silent wrong-document resolution is disqualifying for a legal tool by definition.** It is [R3](#r3--error-but-valid-is-the-defining-failure-mode) at the fetch layer.

**The irony worth internalizing** (source: research 12 §4):

> "The two 'convenient' aggregators are both technically blocked and legally hostile, while the authoritative primary source is wide open and has strictly better data."

**Approved sources** (all verified 2026-07-17):

- **congbao.chinhphu.vn** — `robots.txt`: `User-agent: * / Allow: /`. No Cloudflare, no JS required; plain `curl` returns server-rendered HTML. Both PDF (**real text layer** — `/Font` present, 13,919 text-showing operators on a 70-page sample; **no OCR needed**) and **DOCX** per document, the latter via `https://g7.cdnchinhphu.vn/api/download/stream?...`. These are the **`_signed`, legally authoritative** versions — Công báo is the **publication of record**; vbpl is the database. **Sole ingestion source for tariff decrees.** Weakness: organized by gazette issue, not document identity — **no hiệu lực status, no relationship metadata**, by design. Pair with vbpl; do not use alone. (source: https://congbao.chinhphu.vn/robots.txt, research 04 §3, research 12 §1)
- **vbpl.vn** — `robots.txt`: `Allow: /`, `Disallow: /api/`, `Disallow: /Pages/`. **⚠️ Two research agents disagree on what that `Disallow: /Pages/` means** — see [Unresolved Conflicts](#unresolved-conflicts). **Rebuilt 2026-04-23**: the legacy ASP.NET portal is dead (every `Pages/vbpq-*.aspx` URL 404s) and **every existing scraper and HF dataset targets a site that no longer exists**. New URL pattern `https://vbpl.vn/van-ban/chi-tiet/{slug}--{ItemID}` (the `--` separator is **required**; the canonical slugless form advertised in `<link rel="canonical">` renders "Văn bản không tồn tại" — a bug, do not rely on it). Fully client-rendered: `curl` returns a 57KB loading shell with **zero law text**, and the `Còn hiệu lực` strings in the static HTML are **i18n labels, not data** — a trap that silently poisons a naive scraper. First-class hiệu lực (`effFrom`, `effTo`, `status`; values `Còn hiệu lực` / `Hết hiệu lực một phần` / `Hết hiệu lực toàn bộ` / `Chưa có hiệu lực`) and **27 typed bidirectional relations**. Corpus ≈ **158,826** (Trung ương 54,480 = 43,895 VI + **10,585 official English translations**; Địa phương ~104,346). **Graph loaders must tolerate broken edges** — reference targets can point at unpublished documents that 404. Citation-trust foundation, verified verbatim from **Điều 4 Nghị định 52/2015/NĐ-CP** (*not* Điều 3, which most secondary sources cite): *"Văn bản trên Cơ sở dữ liệu quốc gia về pháp luật **được sử dụng chính thức** trong việc quản lý nhà nước, phổ biến pháp luật, nghiên cứu, tìm hiểu, áp dụng và thi hành pháp luật của cơ quan, tổ chức, cá nhân."* **Nothing else on this list has that property.** (source: https://vbpl.vn/robots.txt, research 04 §1)
- **customs.gov.vn** — `robots.txt` returns `User-agent: *` **with no `Disallow` lines at all**; nothing is excluded (no sitemap; `/sitemap.xml` → 404). Crawling is permitted, but it has **no legal authority — the Nghị định does** — and its API status is contested. See [Unresolved Conflicts](#unresolved-conflicts).

**Note on văn bản hợp nhất — relevant to the later RAG phase, not v1.** **Pháp lệnh 01/2026/UBTVQH16** (issued 10/06/2026, effective 01/07/2026) established: *"Văn bản hợp nhất được cơ quan, tổ chức, cá nhân sử dụng làm căn cứ chính thức trong viện dẫn và áp dụng pháp luật"* — consolidated texts are now an **official basis for citing and applying law**, removing the legal objection that would have blocked a hợp nhất-based architecture (verified 2026-07-17, source: https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm · https://xaydungchinhsach.chinhphu.vn/van-ban-hop-nhat-duoc-su-dung-lam-can-cu-chinh-thuc-trong-vien-dan-va-ap-dung-phap-luat-119260625165619689.htm). This does **not** help v1 tariffs: no official machine-readable văn bản hợp nhất of the tariff exists ([R8](#r8--never-model-the-latest-version)). Where it does apply — **use published hợp nhất as the text layer; do not compute consolidation from amendment instructions.** Vietnamese amendment instructions are natural-language and irregular ("bổ sung Điều 5a", "bãi bỏ cụm từ X tại Khoản 2", "thay thế cụm từ…"); a text-mutation engine is a correctness liability with unbounded edge cases and no authority to fall back on. The leading academic temporal model (SAT-Graph) **also declines to compute consolidation** — it assumes finalized versions exist and uses amendment nodes to *explain* transitions rather than *execute* them. That is a strong signal about the difficulty (verified 2026-07-17, source: https://arxiv.org/abs/2505.00039).

---

## R12 — TTĐB and BVMT are not HS-keyed in law

**Rule.** Only import/export duty and (partially) VAT are natively HS-keyed. **Any HS → TTĐB category or HS → BVMT category mapping is the project's own editorial inference and a liability surface.** It must be **labelled as such in the UI** — visibly, at the point of display, not in a footer disclaimer.

**Why.** Verified against the customs API itself (verified 2026-07-17, source: research 10 §4):
- A **TTĐB** query returns rows like `"I. Hàng hóa"`, `"1. Thuốc lá điếu…"`, `"2. Rượu"` with **`MA_HS: None`**. The statutory table (**Luật Thuế TTĐB 66/2025/QH15**) is **by product category, not by HS line**. HS→category mapping is inference work.
- A **BVMT** query returns `"I. Xăng, dầu, mỡ nhờn"`, `"1. Xăng, trừ etanol"` — **no HS**. Same finding.

**BVMT is also highly volatile** — rates change every few months **by resolution, not decree**. **NQ 19/2026/QH16** (12/04/2026) set petrol/jet fuel to **0 đ/lít** for 16/04–30/06/2026, extended to **30/09/2026** (verified 2026-07-17, source: https://english.luatvietnam.vn/resolution-no-19-2026-qh16-dated-april-12-2026-of-the-national-assembly-on-promulgation-of-a-number-of-provisions-on-environmental-protection-tax-v-431850-doc1.html · https://baochinhphu.vn/keo-dai-thoi-han-ap-dung-uu-dai-thue-voi-mat-hang-xang-dau-den-30-9-2026-102260701163839168.htm). This is [R8](#r8--never-model-the-latest-version) again, on a ~3-month cycle.

**VAT is only partially HS-keyed**: standard 10%; Phụ lục I/II of **NĐ 181/2025/NĐ-CP** (01/07/2025) list non-taxable exported resources/minerals **with HS codes**, but the **5% list is by description → needs mapping** (the same inference problem, smaller). **NĐ 174/2025** extends the 2% reduction (8%) to 31/12/2026 (verified 2026-07-17, source: research 10 §4; the report's reference URL is on luatvietnam — **cited as the research's reference only; luatvietnam is not an ingestion source per [R11](#r11--do-not-scrape-thuvienphapluatvn-or-luatvietnamvn)** — re-verify against Công báo before use).

**Anti-dumping/safeguards are HS-keyed but scattered.** Each Quyết định-BCT lists HS codes (e.g. QĐ 228/QĐ-BCT 2026 float glass → 7005.29.20, 7005.29.90; H-beam steel → 7216.33.11/.19/.90, 7228.70.10/.90). **No consolidated machine-readable register exists.** It requires per-case scraping of pvtm.gov.vn / moit.gov.vn with sơ bộ → chính thức → rà soát cuối kỳ lifecycle tracking. **This is the hardest dataset by far** and is **out of scope for v1** (verified 2026-07-17, source: research 10 §4 · https://pvtm.gov.vn/). Note the tension with [R6](#r6--a-rate-is-never-a-scalar-it-is-a-conditional-claim-with-an-as-of-date) item 7: for some archetypal queries this out-of-scope dataset carries the biggest number. Say so; do not imply completeness.

**Consequence of breaking it.** The project silently invents a legal mapping that does not exist in law, presents it with the same authority as the deterministic tariff lookup, and the user relies on it. Unlike the tariff table, there is **no decree to cite** when it is challenged — because the decree does not key by HS. The product would be manufacturing legal claims out of its own editorial judgement, unmarked. **This is the one place where the product could be wrong and have no source to point to.**

**Design directive.** If HS → TTĐB/BVMT mapping is built at all, it lives in a **visibly separate, visibly labelled layer** ("suy luận nội bộ, không có căn cứ pháp lý theo mã HS") with a different visual treatment from cited rates. Never merge it into the tariff response object.

---

## Unverified / Do Not Rely On

Reproduced from the research's own honesty flags. **Do not launder any of these into a confident claim.**

- **The `textutil` EVFTA parse artifact — the one gap a builder must close before trusting anything.** On Nghị định 116/2022 (EVFTA), `textutil` collapsed a table row into `2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9` — six rates (`29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9`) concatenated **with no delimiter**, in a decimal-comma locale. Unrecoverable without heuristics. The researcher's own words: *"I am inferring, not asserting, that this is a tooling artifact"* — RCEP has the identical 6-year structure and extracted perfectly, which strongly suggests a proper table-aware parser (LibreOffice → docx → `w:tbl/w:tr/w:tc`) fixes it. **This could not be proven** — no `soffice`/`antiword`/`python-docx` was available in that environment. (source: research 12 §2)
- **The dairy case (~700 tỷ, AMF 0405.90.10 → 0405.90.90, retroactive to 2010), Polvita, Nhật Thiên Kim.** Reported in research 09 §2 **without a per-case primary URL**. Directionally well-corroborated by the enterprise-complaint reporting cited in [R3](#r3--error-but-valid-is-the-defining-failure-mode), but the specific figures and dates are **not independently URL-verified here**. Cite as illustrative; do not quote the number as established fact.
- **Quyết định 117/QĐ-CHQ (2026)** — new internal *Quy trình xác định trước mã số*, applied from ~01/02/2026, reported to rest on the principle that **each good has exactly one HS code** and on a **unified sector-wide classification database**. **Full text could not be fetched (paywall/403) — medium confidence.** Note the tension: a "one code per good" doctrine sits awkwardly against the ~42.5% contestable-ground-truth finding in [R3](#r3--error-but-valid-is-the-defining-failure-mode). **Do not assume the unified database will ever be exposed publicly — it is an internal system.** (source: research 09 §2)
- **"Claude 3.5 Sonnet and GPT-4 achieve ~80% at 6-digit and >90% at 2-digit."** Surfaced in a search snippet with **no traceable primary source**, and it **contradicts HSCodeComp** (GPT-5 LLM-only: 29% at 10-digit, ~82% at 2-digit). **Do not rely on it.** (source: research 09 §4)
- **"1 in 3 customs entries is misclassified; tens of billions in duties incorrectly paid."** Appears on vendor blogs with **no primary citation**. Directionally plausible, unsourced. **Do not cite.** (source: research 09 §4)
- **Vendor accuracy claims generally.** Zonos advertises "90%+ accuracy out of the box"; independent benchmarking put it at **44.1% at 10-digit**. Avalara's **80% comes from a product that explicitly includes human expert review in the loop**. Vendor claims and independent benchmarks differ by **~2×**. **Treat every vendor number as marketing until independently reproduced** — and note that benchmark is itself small (n=103) and US-HTS-specific (verified 2026-07-17, source: https://arxiv.org/html/2412.14179v1 · https://zonos.com/classify · https://www.avalara.com/us/en/products/global-commerce-offerings/item-classification.html).
- **The 2022–2027 FTA decrees hitting a cliff on 31/12/2027 as a *simultaneous* event.** Research 12 explicitly flags this as **inferred, not verified**. Research 10 independently maps the decree→FTA→period table and reaches the same conclusion. Treat the **direction as solid, the simultaneity as an inference**.
- **`data.gov.vn` / `open.data.gov.vn`.** Research 10 could not resolve them (`getaddrinfo ENOTFOUND`) and **flagged them as unverified, not confirmed-dead**. Research 04 went further: authoritative DNS says **NXDOMAIN** from the `gov.vn` zone (SOA `dns-master.vnnic.vn`) via both 8.8.8.8 and 1.1.1.1, with control domains resolving fine — **so not geo-blocking**; `opendata.gov.vn` and `dulieuquocgia.gov.vn` also NXDOMAIN. **Working conclusion: there is no national open-data API for legal documents.** Nghị định 278/2025/NĐ-CP (in force 22/10/2025) mandates data connection/sharing **agency-to-agency via Nền tảng chia sẻ dữ liệu, not public open data**; standardization deadline 31/12/2026. Not a channel available to this project. (source: research 04 §6, research 10 §5b)
- **Post-hoc entailment verification ("Faithful Passage Grounding"), reported to eliminate 63% of hallucinated citations on case law.** From **search snippets only; the primary source was not verified.** Attractive for [R10](#r10--citation-grounding-must-verify-support-not-existence) — verify before adopting. Same status for arXiv:2606.00898 "Citation Grounding … via Legal Citation Graphs" (snippet-only, not fetched). (source: research 02 §6)
- **Whether `APIBieuThue` has rate limiting.** Not probed. (source: research 10 §5c)
- **vbpl.vn `provisionTree` / `referenceProvisions`.** The payload fields exist but were **`null` on both sampled documents**. If populated site-wide, that is a **provision-level legal graph** — research 04 calls it "the highest-value open question" and "the whole ballgame" for the RAG phase. **Unverified. Test 10–20 recent documents before designing any schema on it.** Related unverifieds from the same report: the `vbpl-bientap-gateway.moj.gov.vn` API gateway is **found, reachable, unmapped** (every probed path 404s; `/actuator` exposes only `health`; no Swagger); the `referenceType` int → label mapping is **unknown** (saw `3`, `12`; have the 27 labels, not the join); sustained-rate crawl behaviour at 158k scale is **untested** (~40 requests made, no throttling observed — that is not evidence of none). (source: research 04 §1, §"Could NOT verify")
- **ASEAN Tariff Finder** — connection timed out; could not verify. **tongcuc.customs.gov.vn** — internal-only host, does not resolve publicly. **VNTR (vntr.moit.gov.vn)** — official MoIT repository covering all FTAs + rules of origin, but **no public API or bulk download found**; form-based only, and its administrative-rulings table is explicitly "for consultation purpose only". (source: research 10 §5b, research 09 §3)
- **No CROSS/EBTI equivalent exists in Vietnam.** There is no clean, complete, machine-readable, publicly queryable corpus of classification rulings comparable to US CBP CROSS or EU EBTI. Thông báo kết quả phân loại are effectively internal (pushed to **Customslab**, searchable by customs units, not the public); volume is small (~2,500 samples processed; first half of 2026 → **257 dossiers received, 143 classification notices issued**). **This caps retrieval quality by data access, not by model capability** — state that limit to users rather than papering over it. (verified 2026-07-17, source: research 09 §3 · https://thuehaiquan.tapchikinhtetaichinh.vn/hai-quan-xu-ly-gan-2-500-mam-phan-tich-phan-loai-hang-hoa-xuat-nhap-khau-160924.html)

---

## Unresolved Conflicts

### 1. The customs.gov.vn API — research 10 vs research 12. **UNRESOLVED.**

Two research agents reached materially different conclusions about the same system on the same day. **Both are reproduced. Neither is settled. Do not build on either without live re-verification.**

**Research 10 says: a working, open, captcha-free JSON API exists.** (verified 2026-07-17, source: research 10 §5a — headline finding)
- Drove the "Tra cứu biểu thuế" page in Chrome, captured the XHR, **reproduced it with bare `curl`**:
  ```
  POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue
  Content-Type: application/x-www-form-urlencoded; charset=UTF-8
  Body (raw JSON despite the header):
  {"l_class":"TIM_KIEM","l_action":"GET","l_param":"8703","l_bieu_thue":"NK_uu_dai"}
  ```
- **"No auth, no JSESSIONID, no captcha, no Referer/Origin check. The on-page captcha is client-side only — the API does not enforce it."**
- `l_param` = HS prefix, minimum 4 digits (`"87"` returns empty; `"8703"` returns **510 rows**). One row per HS line, one column per tariff regime. Sample `87031010`: `{'NK_uu_dai':'70','ATIGA':'0','ACFTA':'0','CPTPP_NK':'28','EVFTA_NK':'28.3','RCEP_JP':'38.2','NK_TT':'105'}` — EVFTA 28.3% is consistent with the 2026 phase-down step, and NK_TT = 150% × 70 MFN, so **the data is live and current for 2026**.
- Metadata calls work: `BT_SAC_THUE` → the 5 tax types; `BT_LOAI_BIEU_THUE` → all 26 import schedule codes.
- Verdict: **bulk extraction ≈ 1,228 POSTs (one per 4-digit nhóm), a few hours of polite crawling, not a PDF-parsing project.**

**Research 12 says: the site is a JS shell, and the API it found is on a raw IP that timed out and is CAPTCHA-fronted.** (verified 2026-07-17, source: research 12 §5)
- The site is a **JS shell** — the homepage and the tariff-lookup URL return a **byte-identical 12,013-byte response**. It loads `kendo.all.min.js` (Kendo UI grid ⇒ a JSON transport exists).
- **"Hidden API: yes."** But: `/scripts/main.js` hardcodes **`http://123.30.210.236:8080/hqcustomsapi/`** — a raw IP, plain HTTP, port 8080 — **including `.../hqcustomsapi/captcha/CheckCaptcha`. So at least part of the portal is CAPTCHA-gated.**
- **"That IP timed out from here. I *cannot* distinguish geo-fencing from a sandbox egress block, so I am not claiming it's unreachable — only that I could not reach it."**
- Verdict: *"it's a lookup tool, not bulk export. Enumerating ~11k codes through a CAPTCHA-fronted undocumented endpoint on a raw IP is fragile and adversarial."*

**What the conflict is.** These are **plausibly two different endpoints** — 10 found a same-origin bridge/proxy path (`www.customs.gov.vn/bridge?url=…/APIBieuThue`); 12 found a raw-IP backend hardcoded in `main.js` (`http://123.30.210.236:8080/hqcustomsapi/`). That would reconcile "no captcha" (10, bridge path) with "CheckCaptcha exists" (12, raw-IP path). **This reconciliation is our inference and was verified by neither agent.** They may instead be the same backend behind different fronts, in which case 10's "the API does not enforce the captcha" and 12's captcha endpoint are in direct tension. **Unresolved. Resolve by live re-verification before any design depends on it.**

**What is NOT in conflict — and is what actually governs:**

1. **customs.gov.vn is not the source of truth.** Both agents say so independently. Research 10: *"Undocumented, unversioned, no SLA, no ToS grant. Can vanish or start enforcing captcha. Treat as a convenience layer, **legal source of truth remains the decree text**."* Research 12: *"it has no legal authority — the Nghị định does."* **Whatever the API's status, it cannot be cited to a customs officer.** [R7](#r7--every-answer-cites-the-decree-and-the-data-snapshot-date-and-refuses-when-the-snapshot-may-be-stale) applies regardless.
2. **The API's coverage is provably incomplete even if it works.** Research 10's own caveats: **no VIFTA and no CEPA (UAE)** entries in the schedule list, with `THOI_GIAN_CAP_NHAT` values of **2019–2020**; **current-year rates only**, no forward-year series (2027 rates must come from the decree annexes); `l_bieu_thue` appears **ignored** for import queries.
3. **The Công báo `.doc` path is verified, permitted, authoritative, and sufficient.** 11,874 HS codes extracted and independently validated ([R1](#r1--tariff-rates-must-never-be-produced-by-an-llm), [R9](#r9--annex-boundaries-are-load-bearing)). **This is the ingestion path. The API dispute does not block v1.**

**Design directive.** Build on Công báo. If the API is later confirmed working, it is a **cross-check** — a second opinion that flags disagreement for a human — **never the source of a displayed rate**.

### 2. vbpl.vn robots.txt — what does `Disallow: /Pages/` exclude? **UNRESOLVED (low stakes for v1).**

- **Research 12 §4**: *"vbpl.vn `robots.txt`: `Disallow: /Pages/` — and every document URL is `vbpl.vn/.../Pages/vbpq-toanvan.aspx?ItemID=…`. **Robots excludes exactly the corpus.**"* It also reports an identical 52,199-byte 404 shell returned to both `curl` and WebFetch, including on a Google-indexed URL. Conclusion: **not reliably scrapable.**
- **Research 04 §1**: the site was **rebuilt on 2026-04-23**; `/Pages/` is the **dead legacy tree** and the live corpus is at `/van-ban/`, which is **explicitly allowed**. The 404s research 12 observed are consistent with — and explained by — the relaunch.

**Assessment**: research 04's account explains research 12's observations, and 04 investigated the relaunch directly while 12 was probing tariff availability. **The probable resolution is that both observations are true and 12 tested the legacy tree.** This is **our inference, not a verified reconciliation** — re-check `vbpl.vn/robots.txt` and a live `/van-ban/chi-tiet/{slug}--{ItemID}` fetch before the RAG phase depends on it. **It does not affect v1**: tariffs come from Công báo either way.

### 3. Institutional flux — re-verify before shipping

**A further Luật Hải quan amendment was tabled to the UBTVQH on 15/07/2026** — two days before these notes were written. The legal framework underpinning [R3](#r3--error-but-valid-is-the-defining-failure-mode) and [R5](#r5--abstention-is-a-first-class-success) is **in flux** (source: research 09 §2). Also live:

- **Thông tư 121/2025/TT-BTC** (ban hành 18/12/2025, **hiệu lực 01/02/2026**) amends TT 38/2015 & 39/2018, including **sửa đổi khoản 1 và bổ sung khoản 6 Điều 7** on the advance-ruling dossier/samples, with new forms **01a-TB XDTMS / 01b-Thay the XDTMS / 01c-Huy XDTMS** (verified 2026-07-17, source: https://www.pwc.com/vn/vn/publications/news-brief/251223-new-customs-procedures-effective-from-1-february-2026.html).
- **Thông tư 85/2026/TT-BTC** (eff. **15/09/2026**) governs *phân loại hàng hóa và phân tích để phân loại*, replacing TT 14/2015 + 17/2021 — the classification **procedure**, not the nomenclature (verified 2026-07-17, source: https://thuehaiquan.tapchikinhtetaichinh.vn/doi-moi-quy-dinh-phan-loai-phan-tich-hang-hoa-xuat-nhap-khau-161123.html).

**Re-verify the penalty schedule ([R3](#r3--error-but-valid-is-the-defining-failure-mode)) and the Điều 28 procedure ([R5](#r5--abstention-is-a-first-class-success)) before shipping anything that cites them.** The rules themselves — never generate a rate, never output a bare code, abstention is a success — do not depend on which version is in force. The numbers do.

---

## Related Knowledge

- [Project Context](project-context.md) — what Customs Assistant is, who it serves, and its v1 boundaries.
- [Index](index.md) — map of durable project memory.
- [Naming Conventions](naming-conventions.md) — terminology and identifier rules, including HS / schedule / annex naming.
- [Architecture Decisions](architecture-decisions/README.md) — ADRs. The temporal model ([R8](#r8--never-model-the-latest-version)), the annex-aware Công báo ingestion path ([R9](#r9--annex-boundaries-are-load-bearing), [R11](#r11--do-not-scrape-thuvienphapluatvn-or-luatvietnamvn)), and the deterministic-lookup boundary ([R1](#r1--tariff-rates-must-never-be-produced-by-an-llm)) each warrant their own ADR.
- [Task List](planning/01-task-list.md) — current scope and sequencing.
- [Code Organization](docs/code-organization.md) — where the tariff-lookup module, the candidate-suggestion module, and the ingestion pipeline live.
- [Agent Rules](AGENTS.md) — workflow, documentation, and knowledge-routing rules.
