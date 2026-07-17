---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../concepts/hs-classification.md
  - ../concepts/tariff-system.md
  - ../concepts/legal-rag-retrieval.md
  - ../business-rules.md
  - ../project-context.md
  - ../workflows/customs-declaration.md
---

# HS Output Is Top-3 Candidates With Verbatim Evidence, Never A Bare Code

## Status

Approved — the project owner approved this plan on 2026-07-17.

## Context

Feature 2 of v1 suggests HS codes. The obvious product is "type a product description, get the HS code." The measured evidence says that product does not work, and the failure is silent.

Independent benchmark numbers (verified 2026-07-17):

| System | Accuracy at 10-digit | Source |
|---|---|---|
| Human experts | **95.0%** | [HSCodeComp, arXiv:2510.19631](https://arxiv.org/html/2510.19631) |
| Best agent (SmolAgent + GPT-5 VLM) | **46.8%** | same |
| Gemini Deep Research | 40.8% | same |
| GPT-5, LLM only, no tools | **29.0%** | same |
| Qwen2.5-72B | 0.16% | same |

Accuracy collapses down the hierarchy: ~82% at 2-digit → 29–47% at 10-digit (verified 2026-07-17, source: https://arxiv.org/html/2510.19631). HSCodeComp is 632 expert-annotated real e-commerce products across 27 HS chapters.

Against that, the one published design that clearly works — Korea Customs Service, which predicts 6-digit subheadings and **retrieves the relevant key sentences from the HS manual as evidence for each candidate**:

- **Top-3 accuracy 93.9%** across 925 difficult subheadings, evaluated on 5,000 recent classification requests.
- A user study with **32 customs experts** confirmed the suggestions plus explanations substantially reduced review time and effort.
- (verified 2026-07-17, source: https://arxiv.org/abs/2311.10922 · https://dl.acm.org/doi/10.1145/3635158)

**The gap between 46.8% and 93.9% is the output contract, not the model.** Same class of technology, different promise. Only one of the two promises is shippable.

Why a wrong code is not a normal software bug: HSCodeComp found errors are overwhelmingly **"Error but Valid"** — the model emits a real, legitimately-formatted, existing HS code that is wrong. There is no parse failure, no exception, no confidence dip, no syntactic signal of any kind (verified 2026-07-17, source: https://arxiv.org/html/2510.19631). It flows into the declaration, gets accepted, and surfaces later as a post-clearance audit: 20% of the shortfall when customs finds it (Nghị định 128/2020/NĐ-CP Điều 9 khoản 3), truy thu of the full shortfall, late-payment interest 0.03%/day, plus lost FTA preference and retroactive anti-dumping exposure (verified 2026-07-17, source: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-9). The AI's confidence is uncorrelated with the legal outcome, and the failure is silent and delayed by years.

## Decision

The HS suggestion feature **never returns a code as an answer**. Its response type is a ranked candidate set, and the API makes the bare-code shape unrepresentable.

1. **Output is top-3 candidates.** Not top-1. Not a "best guess" field. A single-element result is still a candidate list, not an answer.
2. **Every candidate carries verbatim legal evidence** — the specific Chapter Note, Section Note, heading text, EN paragraph, SEN entry, or công văn, **quoted, not paraphrased**, with its source document identifier. A candidate with no retrievable evidence is not rendered.
3. **Abstention is a first-class success**, returned through the same contract, not an error path. The highest-value output on a hard good is: *"these two headings both plausibly apply, here are the competing notes, this needs xác định trước mã số under Luật Hải quan 2014 Điều 28."* Routing to Điều 28 is a feature — it is the only mechanism that produces legal certainty in Vietnam (max 3 years, and only for the exact good described) (verified 2026-07-17, source: https://luatvietan.vn/huong-dan-thu-tuc-xac-dinh-truoc-ma-so-hang-hoa.html).
4. **The user's preferred code never enters the prompt as a premise.** No "is 8544.49.49 right for this?" input, no prior-declaration code passed into the classification context, no "confirm this code" endpoint. Consistency checks against history run as a **separate deterministic comparison after** candidates are generated — never as prompt context before.
5. **The human decides, and the UI records that they decided.** The system stores which candidate the staff member picked and the evidence shown at pick time. That record is the hồ sơ.
6. **Surface disagreement rather than resolving it.** Where công văn conflict, show both.

## Rationale

**Why top-3 rather than top-1.** Top-1 autonomous at 10-digit is 46.8% — worse than a coin flip on the digits that decide duty. Top-3 with evidence at 6-digit is 93.9% *with measured expert time savings*. A declarant reviewing three candidates with the notes attached is doing the classification faster; a declarant handed one number is doing nothing at all, which is exactly the mode that fails. The structured-pipeline preprint reports the same shape — 4-digit 75.0% top-1 vs **91.5% top-3**; 6-digit 64.2% top-1 vs **78.3% top-3** (verified 2026-07-17, source: https://arxiv.org/html/2605.14857, 2026 preprint, not peer-reviewed).

**Why verbatim evidence and not an explanation.** The KCS result is not "the model explains itself." It is *retrieval of the actual manual sentences*. That distinction matters twice over: retrieval is the part of the stack that is strong, and generated prose is where HSCodeComp's failure mode 4, **reasoning hallucination** — plausible-but-false reasoning chains — lives (verified 2026-07-17, source: https://arxiv.org/html/2510.19631). A quoted Chapter Note is checkable by a human in seconds. A generated paragraph about a Chapter Note is a new liability. The quote is also the only defensible artifact when a Chi cục Hải quan khu vực challenges the code.

**Why the preferred code is banned from the prompt.** The practitioner warning is blunt: *"if you want your HTS to be X (even if the correct HTS is Y), AI will give you an argument (or three) to support your preferred HTS"* (verified 2026-07-17, source: https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/). The model is a sycophantic advocate, not a judge. Feeding it a target code makes it manufacture a legal argument for that code — which is precisely the paper trail that supports a **trốn thuế** characterization under Nghị định 128/2020/NĐ-CP Điều 14: **1× to 3× the evaded tax, criminal referral possible** (verified 2026-07-17, source: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-8). A confirmation-biased HS tool does not merely give a wrong answer; it upgrades a 20% penalty into an intent finding, in writing, with our product's name on it. This constraint is a schema-level guarantee, not a prompt instruction.

**Why abstention is a success and not a failure.** 76% of Vietnamese enterprises report obstacles confirming HS codes, up from 66.3% in 2018 (verified 2026-07-17, source: https://diendandoanhnghiep.vn/ganh-nang-ma-hs-trach-nhiem-cua-co-quan-hai-quan-o-dau-10077631.html). That is not user ignorance — it reflects that there is often no stable single right answer. Reasonable experts disagree; an audit of 226 disagreements found **~42.5% of "wrong" model predictions were arguably better supported by HS rules than the published ground truth** (verified 2026-07-17, source: https://arxiv.org/html/2605.14857). A system that always produces a confident code is lying about the domain. The dairy case — 8 producers reportedly facing retroactive truy thu of ~700 tỷ VND after customs reclassified Anhydrous Milk Fat 0405.90.10 → 0405.90.90 in Dec 2014, applied back to 2010 declarations — is what "confident single answer" costs at scale (source: research 09 §2 — **the report gives no source for this case; illustrative, not established fact**; see [Business Rules → Unverified](../business-rules.md#unverified--do-not-rely-on)).

**Why more prompt rules will not rescue top-1.** Two HSCodeComp findings pre-empt the obvious optimizations: **test-time scaling does not help** (majority voting and self-reflection gave negligible gains, unlike other reasoning domains), and **giving the model explicit human-written decision rules decreased performance for most systems** (verified 2026-07-17, source: https://arxiv.org/html/2510.19631). There is no prompt that turns 46.8% into 95%. Do not attempt one.

## Scope

Applies to:

- The HS candidate suggestion feature (v1 scope item 2) and every API surface that exposes it.
- Any future RAG feature that returns a classification-relevant conclusion.

Does **not** apply to tariff lookup (v1 scope item 1), which is deterministic and keyed by HS + schedule + date, with no model in the path. See [Tariff System](../concepts/tariff-system.md). The two features must not be blended in the UI in a way that lets a suggested candidate flow into a rate lookup as though it were confirmed.

## Alternatives Considered

- **Top-1 with a confidence score.** Rejected. Errors are "Error but Valid" and the score would be model self-report on a task where self-reflection measurably does not help. A confidence number next to a wrong-but-valid code makes the failure more persuasive, not less.
- **Autonomous classification with human spot-check.** Rejected. At 46.8%, spot-checking a sample does not bound the error — you would have to re-do every one, which is the manual process plus a cost centre.
- **Buy a vendor classifier.** Rejected on the numbers. Zonos markets "90%+ accuracy out of the box"; independent testing on 103 randomized CBP rulings put it at **44.1%** at 10-digit. Avalara's **80.0%** comes from a product that explicitly includes human expert review in the loop. Tarifflo scored 89.2% (verified 2026-07-17, source: https://arxiv.org/html/2412.14179v1 · https://zonos.com/classify · https://www.avalara.com/us/en/products/global-commerce-offerings/item-classification.html). The benchmark is small (n=103) and US-HTS-specific, so it does not transfer cleanly to AHTN 8-digit — but the pattern holds: vendor claims run ~2× their independently measured performance, and the only 80%+ number that is not disputed has humans inside it. Which is this ADR's design, bought instead of built.
- **A "confirm my code" endpoint** (the feature users will ask for first). Rejected — this is the confirmation-bias failure, deliberately productized.

## Consequences

- The API response type for HS suggestion has no field that can hold a single accepted code. Adding one is a breaking change requiring a new ADR.
- Evidence retrieval — not the classifier — is the load-bearing component. Product quality is capped by corpus coverage, not by model choice. Vietnam has **no CROSS/EBTI equivalent**: the nomenclature (Thông tư 31/2022/TT-BTC, HS 2022/AHTN 2022, 8 digits, still operative in 2026) is public as Word/PDF annexes with no official API, and the ruling corpus is scattered, partly paywalled, and not machine-readable (verified 2026-07-17, source: https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx · research report 09). See [Data Sources](../concepts/data-sources.md).
- If we cannot quote a note, we cannot ship the candidate. That is intended; it makes corpus gaps visible instead of letting the model paper over them.
- Staff must be told the honest limit at the point of use: no published or commercial AI system reaches human expert accuracy at 8/10-digit.
- Every candidate must be versioned against HS 2022/AHTN 2022 now, HS 2028 from 01/01/2028, and must track the `-TCHQ` → `-CHQ` document-numbering break at 01/03/2025 (Tổng cục Hải quan became Cục Hải quan under Bộ Tài chính per Nghị định 29/2025/NĐ-CP) (verified 2026-07-17, source: https://xaydungchinhsach.chinhphu.vn/quyet-dinh-382-qd-btc-quy-dinh-chuc-nang-nhiem-vu-quyen-han-va-co-cau-to-chuc-cua-cuc-hai-quan-119250228165530471.htm).

## Risks

- **Users route around the contract.** Staff will paste candidate 1 into VNACCS without reading the evidence, reconstructing top-1 by habit. The contract constrains our output, not their behavior. Mitigation is UI-level (no one-click copy of a code without its evidence) and is not solved by this ADR.
- **Corpus gaps cause over-abstention.** With a thin ruling corpus, the honest answer is "needs xác định trước mã số" more often than users will tolerate. Abstention is correct but has a usage cost, and a tool that abstains constantly gets abandoned for a tool that lies.
- **Ground truth is contestable.** Optimizing candidates toward agreement with customs is the commercially correct target but is not the same thing as being right (the ~42.5% finding above). We are building an agreement engine, and should say so internally.
- **The legal ground is moving.** A further Luật Hải quan amendment was tabled to the UBTVQH on 15/7/2026 — two days before this ADR (verified 2026-07-17, source: research report 09). Penalty tiers and the Điều 28 process cited here may change.

## Unverified / Do Not Rely On

- **"Claude 3.5 Sonnet and GPT-4 achieve ~80% at 6-digit and >90% at 2-digit."** Surfaced in a search snippet with **no traceable primary source**, and it contradicts HSCodeComp (GPT-5 LLM-only: 29.0% at 10-digit, ~82% at 2-digit). Do not use this to argue top-1 is viable.
- **"1 in 3 customs entries is misclassified; tens of billions in duties incorrectly paid."** Appears on vendor blogs with no primary citation. Directionally plausible, unsourced. Do not put it in any user-facing or investor-facing material.
- **Quyết định 117/QĐ-CHQ (2026)** — the new internal quy trình xác định trước mã số, applied from ~01/02/2026, reportedly built on the principle that **each good has exactly one HS code** and on a unified sector-wide classification database. **The full text could not be fetched (paywall/403) — medium confidence on detail.** Two cautions: that database is an *internal* system and must not be assumed to become available to us; and if the "exactly one HS code" principle is real, it sits in tension with the ~42.5% ground-truth finding, which is a live question this ADR does not resolve.
- **Thông tư 121/2025/TT-BTC** (ban hành 18/12/2025, hiệu lực 01/02/2026) amends the advance-ruling dossier rules (sửa đổi khoản 1, bổ sung khoản 6 Điều 7 of TT 38/2015) with new forms 01a-TB XDTMS / 01b-Thay the XDTMS / 01c-Huy XDTMS. If we ever draft the hồ sơ, verify the current form set before building against `01/XĐTMS/TXNK`.
- The Deterministic Agentic Workflow numbers (arXiv:2605.14857) come from a **2026 preprint that is not peer-reviewed**. Cited above as directional support for top-3 > top-1, not as a target.

## Review Requirements

- Verify the HS suggestion response schema cannot express a bare code — no `hs_code`, `best_match`, or `recommended` scalar field.
- Verify no code path places a user-supplied, historical, or prior-declaration HS code into the classification prompt context.
- Verify every candidate renders with quoted source text and a resolvable document identifier, and that candidates without evidence are dropped rather than shown bare.
- Verify abstention returns through the normal success contract with the Điều 28 route named.
- Verify the tariff-lookup path (deterministic) shares no code with the suggestion path and that a suggested candidate cannot silently become a lookup key.

## Related Knowledge

- [HS Classification](../concepts/hs-classification.md) — GRI order, legal-note hierarchy, why classification is legal reasoning rather than lookup.
- [Tariff System](../concepts/tariff-system.md) — the deterministic side this ADR explicitly does not govern.
- [Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) — the retrieval stack that carries the evidence requirement.
- [Data Sources](../concepts/data-sources.md) — corpus availability, which caps evidence coverage.
- [Business Rules](../business-rules.md) — penalty tiers, advance-ruling rules, declarant liability.
- [Project Context](../project-context.md) — v1 scope and the human-decides boundary.
- [Customs Declaration Workflow](../workflows/customs-declaration.md) — where the candidate set is consumed.
