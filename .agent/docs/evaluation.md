---
type: doc
status: active
updated: 2026-07-17
related:
  - ../concepts/hs-classification.md
  - ../concepts/tariff-system.md
  - ../concepts/legal-rag-retrieval.md
  - ../concepts/data-sources.md
  - ../concepts/vietnamese-legal-documents.md
  - ../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md
  - ../architecture-decisions/2026-07-17-hs-candidates-not-answers.md
  - ../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md
  - ../business-rules.md
---

# Evaluation Contract

This note defines how Customs Assistant proves it works. It is a contract, not a suggestion: the gates below are ship/no-ship conditions.

The whole document exists because of one property of this domain, established by independent benchmark: **the errors are silent.** A wrong HS code is a real, correctly-formatted, legitimate-looking code. A wrong tariff rate is a real rate from a real annex of a real decree. Neither throws an exception, fails a schema check, or looks wrong to a reviewer. There is no syntactic signal of failure, so **you cannot eyeball correctness** — you can only measure it against known-correct answers you wrote down in advance.

---

## 1. The golden set comes first, before any retrieval code

**Rule: no retrieval, ranking, or generation code is written until a golden set of 30-50 questions exists, drawn from the owner's own past declarations, each with a known-correct answer.**

### Why this ordering is non-negotiable

Legal RAG without an eval set is faith-based. Every knob in the system — chunk unit, BM25/dense weighting, top-k, rerank model, prompt — changes the answer, and none of them announce whether the change was an improvement. Without a golden set you are not tuning, you are wandering. Worse, you will feel productive the entire time, because the output always looks plausible.

Two measured findings make this concrete rather than philosophical:

1. **HS errors are "Error but Valid."** On HSCodeComp (632 expert-annotated real e-commerce products, 27 HS chapters, 10-digit target, double-annotated), errors are overwhelmingly cases where the model outputs a *real, legitimate-looking* HS code that is wrong. There is no parse failure, no red flag, no low-confidence marker correlated with the legal outcome. It flows into VNACCS, is accepted, and surfaces years later as a post-clearance audit. (verified 2026-07-17, source: https://arxiv.org/html/2510.19631)

2. **The naive tariff parser reported 94% success while being confidently wrong.** See §3 — this is the same failure shape on the deterministic half of the product, where people assume it cannot happen.

A golden set built from the owner's own declarations has a property no public benchmark has: the answers were already accepted by Hải quan for this company's actual goods. That is the target the product is commercially optimizing for.

### Composition

- **30-50 questions.** Small enough that the owner can actually produce them; large enough that a 10-point accuracy difference is visible.
- **From real past declarations**, not invented. Invented questions test the questions, not the tool.
- **Each carries a known-correct answer** plus the evidence that made it correct (the annex, the decree, the chapter note, the ruling).
- **Weighted toward the company's real goods mix**, not toward the interesting edge cases. Edge cases go in a separate stress set.
- **Written down before the code exists.** A golden set assembled after seeing the system's output is a record of the system's opinions.

### Honest limit on "known-correct"

The ground truth in this domain is itself contestable. An audit of 226 disagreements in one HS study found **~42.5% of "wrong" model predictions were actually better supported by HS rules than the published ground truth** (verified 2026-07-17, source: https://arxiv.org/html/2605.14857). Two experts constructing HSCodeComp disagreed enough to need a senior tiebreaker (verified 2026-07-17, source: https://arxiv.org/html/2510.19631).

This does not weaken the golden set — it clarifies what it measures. **Agreement with what customs accepted is the commercially correct target, and it is not the same thing as being right.** Record that distinction rather than resolving it.

---

## 2. Evaluate retrieval separately from generation

**Rule: retrieval and generation get separate scores. Never a single end-to-end number.**

A single end-to-end number cannot tell you whether the system failed because the right Điều was never retrieved (a retrieval fix) or because the model ignored a correctly retrieved Điều (a generation fix). These have opposite remedies, and a blended score will send you to the wrong one.

LegalBench-RAG (6,858 QA pairs / 79M chars) is the discipline to copy: it scores **exact file plus character indices**, forcing minimal-span precision rather than "the right document appeared somewhere in the top 10." That is the standard legal citation actually demands. (verified 2026-07-17, source: https://arxiv.org/html/2408.10343v1)

Caveat carried forward honestly: LegalBench-RAG's corpus is contracts/privacy policies (CUAD/MAUD/ContractNLI/PrivacyQA), **not statute**. Its methodology transfers; its findings may not.

---

## 3. Phase 1 gate — the tariff lookup

Phase 1 is deterministic: exact tariff lookup keyed by HS + schedule + date. No AI touches the numbers. That does not make it safe — it makes it silently wrong instead of loudly wrong.

### Gate 3.1 — Manual reconciliation. One wrong row = stop.

**Randomly sample 20 HS codes from the database and reconcile every one by hand against ECUS and/or customs.gov.vn. If a single row disagrees, the phase does not ship.**

Not 19 of 20. One wrong row means the parser has a systematic defect, and a systematic defect in an 11,874-row table is not 1 bad row — it is an unknown number of bad rows of which you happened to sample one. A 95% pass rate here is not "good"; it is an unexploded ordnance report.

Sample size discipline: 20 hand-checked rows is what a human will actually do carefully. Sampling 200 and checking them sloppily is worse than sampling 20 and checking them properly, because it manufactures confidence.

Reference scale for context: the MFN import annex (Phụ lục II of NĐ 26/2023) contains **11,874 unique 8-digit HS codes**, of which 11,160 (94.0%) carry a rate; the export annex (Phụ lục I) contains 1,520 (verified 2026-07-17, source: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm, extracted from the 14 gazette `.doc` parts).

### Gate 3.2 — The ANNEX TRAP regression test

**This is the single most important test in the repository.** It must exist before any tariff data is served, and it must never be deleted.

**Required assertion:**

```
assert lookup(hs="0301.11.10", schedule="NK_uu_dai", direction="import", date=<in-force date>) == 15
assert lookup(hs="0301.11.10", schedule="NK_uu_dai", direction="import", date=<in-force date>) != 0
```

- `0301.11.10` in **Phụ lục II (Biểu thuế nhập khẩu ưu đãi / MFN import)** = **15**
- `0301.11.10` in **Phụ lục I (Biểu thuế xuất khẩu / export)** = **0**

(verified 2026-07-17, source: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm — annex-aware parse of the gazette Word parts)

**And the general invariant, which matters more than the single case:**

```
# No import query may EVER return a Phụ lục I rate.
for every import query:
    assert result.source_annex != "Phụ lục I"
```

**Why this test exists — the story is the justification.** Research 12's first naive parse of NĐ 26/2023 reported **94% success**. It was confidently wrong. It returned `0301.11.10 → ['0', '15']` because it ignored annex boundaries and swept up both the export rate and the import rate. **1,520 HS codes appear in both annexes; 1,329 of them have different rates.** A parser that ignores annex boundaries returns the **export** duty for an **import** question — silently, with no error, at 94% apparent success. (verified 2026-07-17, source: research/12.md adversarial verification, reproducing from https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm)

That is the failure mode of this entire project category: **not missing data, but plausible-looking wrong data — and it fails while reporting success.** A test suite that asserts "94% of rows parsed" would have passed. A test suite that asserts "import queries never return Phụ lục I" catches it.

Extend the same invariant to the other structural states the annexes encode, because each is a distinct silent-wrong-answer generator:

| State | Assertion required |
|---|---|
| **Phụ lục III** — absolute/mixed duty (used cars) | Returns a USD amount, never a `%`. A `%` regex finds **zero** rows here. |
| **Phụ lục IV** — out-of-quota TRQ rates | Returns TRQ-conditional, never the in-quota rate. TRQ headings verified in ND 129/2022: 04.07, 17.01, 24.01, 25.01. |
| **`*` in an FTA schedule** | Means **excluded**, not zero. Assert `*` never renders as `0`. |
| **FTA rate without C/O** | MFN vs FTA is conditional. RCEP Điều 4 requires origin rules **plus a valid certificate of origin**. "The tax is 0%" is wrong; "0% *if* you hold a valid C/O, else 15% MFN" is right. |

(all verified 2026-07-17, source: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm and the ND 129/2022 gazette parts)

### Gate 3.3 — Parser fidelity

The research's own extraction used `textutil`, which on the EVFTA annex collapsed a six-year rate row into `2925,421,818,114,510,9` — six rates (`29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9`) concatenated with **no delimiter**, in a decimal-comma locale. Unrecoverable without heuristics.

**Flagged as inference, not fact:** research 12 believed this to be a tooling artifact — RCEP has the identical 6-year structure and extracted perfectly, suggesting a real table-aware parser (LibreOffice → docx → `w:tbl/w:tr/w:tc`) fixes it — **but could not prove it**; no `soffice`/`antiword`/`python-docx` was available. **This is the one gap a builder must close before trusting anything.** (verified 2026-07-17, source: research/12.md)

**Gate: a rate-concatenation regression test must exist** — assert that a known multi-column FTA row parses into the correct *count* of separate rate cells, not a single fused number.

---

## 4. Phase 2 gate — HS candidate suggestion

Phase 2 ships top-3 HS candidates with verbatim legal-note evidence. A human decides.

### The numbers to beat, and the numbers that prove the shape of the product

| System | Accuracy | Source |
|---|---|---|
| **Human experts** (HSCodeComp, 10-digit) | **95.0%** | https://arxiv.org/html/2510.19631 |
| Best agent (SmolAgent + GPT-5 VLM), 10-digit | 46.8% | same |
| Gemini Deep Research, 10-digit | 40.8% | same |
| GPT-5, LLM only, no tools, 10-digit | 29.0% | same |
| Deterministic pipeline, 6-digit **top-3** | 78.3% | https://arxiv.org/html/2605.14857 |
| Deterministic pipeline, 4-digit **top-3** | 91.5% | same |
| **KCS explainable candidates + evidence, 6-digit top-3** | **93.9%** | https://arxiv.org/abs/2311.10922 |

(all verified 2026-07-17)

Accuracy collapses down the hierarchy: **~82% at 2-digit → 29-47% at 10-digit.** Report accuracy *per digit depth*. A single headline number hides where the money is — practitioners note most errors happen *after* the correct heading is found, in the subheading split that drives duty rate, AD/CVD exposure, and FTA eligibility.

**The gap between 47% and 93.9% is not model capability — it is the output contract.** Top-3 + evidence + human-decides is a different product than top-1 + autonomy, and only one of them works. The evaluation must therefore score the product we are actually shipping.

### Gate 4.1 — Ship threshold

**Measure top-1 and top-3 on the golden set. Compare against the human baseline of 95% at 10-digit.**

- **Ship threshold: top-3 ≥ 80%.**
- **Below 80%: do not ship.** Not "ship with a warning label." Do not ship.

This threshold is a project decision, not a research finding. It is set where it is because it sits between the deterministic pipeline's measured 78.3% (6-digit top-3) and KCS's 93.9% — i.e. it is demonstrably achievable by a well-built retrieve-and-cite system, and a system below it is underperforming published prior art rather than hitting a domain ceiling.

**Report top-1 too, and never ship on it.** Top-1 is a diagnostic for ranking quality. It is not the contract. Publishing a top-1 number to users would invite exactly the autonomous use the product refuses.

### Gate 4.2 — Findings that must not be optimized away

Two HSCodeComp results should stop a specific class of wasted effort before it starts (verified 2026-07-17, source: https://arxiv.org/html/2510.19631):

- **Test-time scaling does not help.** Majority voting and self-reflection gave negligible gains — unlike other reasoning domains. Do not build them and do not evaluate them as if they were free upside.
- **Giving the model explicit human-written decision rules *decreased* performance for most systems.** More prompt-stuffed rules ≠ better. If an eval run shows a rule-stuffed prompt winning, suspect the eval before believing the result.

---

## 5. Temporal evaluation — a separate suite

**Rule: 10 questions whose correct answer depends on knowing that a law is dead. Citing dead law is a failure regardless of prose quality.**

This is scored separately because it is a different failure mechanism. The prose will be excellent. The citation will resolve. The law will be repealed.

Temporal failure is measured, not theoretical. On 312 validated statutory QA pairs across five major LLMs, two distinct failure modes appeared: models applying **outdated rules** after legislation changes, and models **preferring newer provisions even when the older version applies** — a recency bias that **RAG alone does not fix**. The actionable finding: approaches treating temporal validity as a **hard constraint (filter, not ranking signal)** substantially improve performance. (verified 2026-07-17, source: https://arxiv.org/abs/2605.23497)

Scale of the problem in a real Vietnamese corpus: of 1,703 SBV documents, **863 fully repealed, 191 partially repealed, 639 effective** — **~62% of the corpus is dead or partly dead law** (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).

### Gate 5.1 — Dead-law suite (10 questions minimum)

Each question must be answerable *only* if the system knows the governing text is repealed. Citing the dead instrument = automatic fail.

| Dead instrument | Died | Replaced by | Source (verified 2026-07-17) |
|---|---|---|---|
| **Luật Giao thông đường bộ 2008** (23/2008/QH12) | **01/01/2025** | Split into **Luật Đường bộ 35/2024/QH15** + **Luật TTATGTĐB 36/2024/QH15**, both passed 27/06/2024 | Điều 88 khoản 3 Luật 36/2024; Điều 85 khoản 3 Luật 35/2024 — https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf |
| **Nghị định 10/2020/NĐ-CP** | **01/01/2025** | **NĐ 158/2024/NĐ-CP** (18/12/2024) — itself already amended by **NĐ 218/2026/NĐ-CP** (19/06/2026, eff. **10/08/2026**) | https://vanban.chinhphu.vn/?pageid=27160&docid=212082 · https://vanban.chinhphu.vn/?classid=1&docid=218537&orggroupid=2&pageid=27160 |
| **Luật Đường sắt 2017** (06/2017/QH14) | **01/01/2026** | **Luật Đường sắt 2025 (95/2025/QH15)** | https://moc.gov.vn/pl/pages/ChiTietVanBan.aspx?vID=460&TypeVB=1 |
| **Luật HKDD 2006/2014** (66/2006/QH11 + 61/2014/QH13) | **01/07/2026** | **Luật HKDD 2025 (130/2025/QH15)** | https://caa.gov.vn/van-ban/130-2025-qh15-30644.htm |

Note the **NĐ 218/2026 case is the inverse test**: effective 10/08/2026, i.e. **not yet in force on 2026-07-17**. A system must date-gate it, not serve it as current law today. Include at least one question that fails if the system serves a not-yet-effective instrument.

Include at least one question exercising the harder layer: **a law's headline effective date is not enough.** Luật TTATGTĐB 36/2024 demonstrates all three complications at once — (a) per-clause delayed effect, (b) later amendments to the effective-date article *itself*, (c) amending laws whose own clauses have split effective dates. The child-restraint rule (khoản 3 Điều 10) was widely cited as effective 01/01/2026; it was moved to **01/7/2026** by Luật 118/2025/QH15, whose relevant clause took effect 01/01/2026 — one day before the original deadline would have bitten. (verified 2026-07-17, source: https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf)

### Gate 5.2 — The reversion test

**Required: a paired query, identical except for the as-of date, straddling NĐ 72/2026's expiry.**

NĐ 72/2026/NĐ-CP was **signed 09/03/2026 and effective the same day** ("kể từ ngày ký"), cutting petrol/naphtha/reformate MFN from 10% → **0%**. It was valid **only until 30/04/2026** — a **52-day window** — after which rates **revert to NĐ 26/2023**. (verified 2026-07-17, source: https://vanban.chinhphu.vn/?amp=&docid=217144&pageid=27160; the 10% baseline for 2710.12.21/.22/.24/.25/.80 extracted from NĐ 26/2023 and independently corroborated by press reporting of the cut "từ 10% xuống 0%")

```
assert lookup(hs="2710.12.21", schedule="NK_uu_dai", date="2026-04-01") == 0    # inside the window
assert lookup(hs="2710.12.21", schedule="NK_uu_dai", date="2026-05-01") == 10   # reverted
```

**Why this specific test:** a "scrape the latest version" design has no concept of expiry. It would serve 0% petrol forever. This test is the one that fails on the architecture, not on a row of data — which is exactly why it must be in the suite from day one.

### Gate 5.3 — The gazette-lag honesty test

There is a **multi-week window in which the legally-in-force rate exists in machine-readable form nowhere** — only as a 200-DPI scan.

- **NĐ 72/2026:** binding 09/03/2026; published in **Công báo số 157 on 24/03/2026 — 15 days *after* it was already law.**
- **NĐ 26/2023:** signed 31/05/2023, gazetted 19/06/2023 (~19 days).
- **EVFTA NĐ 116/2022:** signed 30/12/2022, gazetted from 16/02/2023 (~48 days).

(all verified 2026-07-17, source: https://congbao.chinhphu.vn/)

**No crawl schedule can close this gap.** The gate is therefore not "be current" — that is unachievable. The gate is: **the system must know its snapshot date and refuse, or visibly flag staleness, rather than answer confidently from a snapshot that may predate a binding amendment.** Test that the refusal/flag actually fires.

This is why the output contract is "a research aid that shows its sources and its as-of date," never "an answer engine that states a rate." Customs declarations are legally binding; a wrong rate means underpayment → back-assessment, penalties, and **the declarant — not the tool — carries the liability.**

---

## 6. Citation grounding verifies SUPPORT, not EXISTENCE

**This is the most misunderstood requirement in the document. Read the Wilgarten case before writing any grounding check.**

The definitive source is **Magesh, Surani, Dahl, Suzgun, Manning & Ho, "Hallucination-Free? Assessing the Reliability of Leading AI Legal Research Tools," Journal of Empirical Legal Studies 2025** — the **first preregistered** evaluation of these tools, 202 queries, expert-scored. (verified 2026-07-17, source: https://doi.org/10.1111/jels.12413 · PDF: https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf)

| System | Result |
|---|---|
| **Lexis+ AI** | 65% accurate; **hallucinates >17%** |
| **Westlaw AI-Assisted Research** | 42% accurate; **hallucinates >34%** |
| Ask Practical Law AI | 17-33% hallucination band |
| GPT-4 (no RAG) | ~43% hallucination |

These are commercial legal-research products from LexisNexis and Thomson Reuters, marketed against claims of "hallucination-free linked legal citations" and RAG that "dramatically reduces hallucinations to nearly zero." **This is the number to anchor stakeholder expectations with.** RAG reduces legal hallucination; it does not eliminate it.

### The Wilgarten case — why an existence check is worthless

Asked for opinions by **"Luther A. Wilgarten," a fictitious judge**, Lexis+ AI returned **a real case with a real, correctly-formatted citation** — simply not written by that (nonexistent) judge. The authors' phrase: *"hallucination-free in a narrow sense."*

**The implication, stated as bluntly as the research states it: "every citation resolves to a real document" is a worthless guarantee. It is exactly the guarantee vendors market and exactly the one that fails.**

**Therefore: a Điều-number validator gives false comfort.** A check that "Điều 12 Nghị định 26/2023/NĐ-CP" parses, exists, and is in force will pass on an answer where Điều 12 says nothing whatsoever about the proposition asserted. The check must verify **that the cited provision supports the proposition** — not that it exists.

This is not a hypothetical for Vietnamese law. It is the near-certain failure mode, because legal text here is lexically redundant across documents ("Điều 5. Giải thích từ ngữ" exists in hundreds of văn bản and is near-textually-identical), which is the same property that produces **Document-Level Retrieval Mismatch — observed at rates exceeding 95% on some datasets** (verified 2026-07-17, source: https://arxiv.org/html/2510.06999v1).

### Gate 6.1 — Grounding checks that count

- **Support, not existence.** Score whether the cited Điều/Khoản/chapter note entails the claim. An entailment/cross-encoder check, or human scoring on the golden set. Existence checks may run *in addition*, never *instead*.
- **Verbatim evidence.** Every HS candidate must quote its authority verbatim — the specific Chapter Note, Section Note, EN paragraph, SEN entry, or công văn. Quote, do not paraphrase. This is what the KCS study proved delivers the value: **not the prediction — the evidence retrieval**. A user study with **32 customs experts** confirmed candidates + explanations substantially reduced review time and effort. (verified 2026-07-17, source: https://arxiv.org/abs/2311.10922)
- **Refusal is a first-class output and must be scored as one.** A pre-generation gate (no chunk clears the similarity threshold → refuse before generating) plus a post-generation evidence check (`if ¬HasCitations(a) or EvidenceMismatch(a, D, G) → return Unknown Answer`) is a usable blueprint. An eval that penalizes refusal equally with a wrong answer will train the system into confident wrongness. **Score refusal separately from error.** (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)
- **Never let the user's preferred code into the prompt as a premise.** Practitioner warning worth quoting: *"if you want your HTS to be X (even if the correct HTS is Y), AI will give you an argument (or three) to support your preferred HTS."* The model is a sycophantic advocate, not a judge. **This failure manufactures the paper trail for a trốn thuế characterization** — the worst legal outcome available. Include an adversarial eval case: submit a query containing a wrong preferred code and assert the system does not ratify it. (verified 2026-07-17, source: https://aomeara.com/why-ai-tools-for-tariff-classification-may-lead-you-down-the-wrong-road/)

---

## 7. Metrics

### Retrieval

- **Recall@k**
- **Precision@k**
- **MRR**
- **F2@k** — the primary metric.

**Why F2 and not F1:** F2 weights recall over precision. **Missing an applicable provision is worse than surfacing an extra one.** A missed exclusion note is a wrong classification; an extra retrieved note costs the reviewer thirty seconds. The asymmetry is real, so the metric must encode it rather than averaging it away. (F2 usage verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)

**Counter-pressure that stops F2 from being gamed:** you cannot fix recall by raising k. Legal RAG is vulnerable to **"lost in the middle"** — dumping 20 Điều into context actively degrades faithfulness. This argues for aggressive reranking + low top-k (SBV-LawGraph uses k=5), not "retrieve more to be safe." **Report F2@k at a fixed, low k** so recall gains must come from ranking, not from flooding the context. (verified 2026-07-17, sources: https://arxiv.org/pdf/2605.19806 · https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)

### Generation — conjunctive correctness

An answer counts correct **only if all three hold**:

1. **Semantically equivalent** to the known-correct answer, **AND**
2. **Contains ≥1 legal citation**, **AND**
3. **Citations are valid AND relevant.**

Conjunctive, not weighted. A fluent answer with no citation scores zero. A well-cited answer whose citation does not support the claim scores zero — that is condition (iii), and it is the operationalization of the Wilgarten lesson. (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf, which uses two annotators)

### Reference numbers for calibration

Vietnamese statutory retrieval, SBV-LawGraph (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf):

| Method | ALQAC R@1 | ALQAC R@10 | SBV R@1 | SBV R@10 |
|---|---|---|---|---|
| BM25 | 0.57 | 0.74 | 0.38 | 0.65 |
| Naive RAG (dense, no rerank) | 0.36 | 0.58 | 0.32 | 0.61 |
| Advanced RAG (75/25 hybrid) | 0.57 | 0.74 | 0.40 | 0.67 |
| SBV-LawGraph (hybrid+rerank+KG) | **0.69** | **0.77** | **0.49** | **0.76** |

**Caveats the authors themselves list, reproduced rather than laundered:** small SBV eval set (100 QA pairs); **no ablation isolating the KG's independent contribution**; no KG quality audit; binary correctness with only 2 annotators and **no inter-annotator agreement reported**. Treat as directional, not definitive.

Note the shape: **out-of-the-box dense embeddings LOSE to BM25 on Vietnamese legal text** (0.36 vs 0.57 R@1) and win decisively only after in-domain fine-tuning (TVPL: BM25 MRR@10 21.60 → fine-tuned ColBERT 74.61) (verified 2026-07-17, source: https://arxiv.org/html/2412.00657v1). Any eval comparing hybrid weightings must report which embedding model was used, because the correct BM25:dense ratio is a function of how well-adapted the embedding is — not a constant to copy from a paper.

---

## 8. Preregister the protocol

**Rule: write down the metric definitions, the golden set, the thresholds, and the analysis plan BEFORE running the evaluation. Commit them. Do not edit them after seeing results.**

Preregistration was **the core methodological contribution of Magesh et al.**, and the reason their numbers contradict vendor marketing so cleanly. **The field is full of vendor claims that do not survive contact with a preregistered protocol.** (verified 2026-07-17, source: https://doi.org/10.1111/jels.12413)

The independently-measured gap between marketing and reality is roughly 2×, and it is documented on named products:

- **Zonos claims "90%+ accuracy out of the box"**, backed by 500k+ manually classified labels. Independent testing on 103 randomized CBP rulings put it at **44.1% at 10-digit**.
- **Avalara's 80.0%** comes from a product that explicitly includes **human expert review in the loop**.
- **Tarifflo: 89.2%** at 10-digit.
- **WCO BACUDA: 12.75%** (at 6-digit, its ceiling).

(verified 2026-07-17, sources: https://arxiv.org/html/2412.14179v1 · https://zonos.com/classify · https://www.avalara.com/us/en/products/global-commerce-offerings/item-classification.html)

**Treat every vendor number — including our own — as marketing until independently reproduced.** Note the benchmark that produced these is itself small (n=103) and US-HTS-specific.

The preregistration discipline applies internally. The failure it prevents is specific and likely: running the eval, seeing 74% top-3, and deciding that top-3 ≥80% was always a bit arbitrary anyway. **That decision must be impossible to make after seeing the number.**

---

## 9. Vietnamese benchmarks available for reference

Use these for calibration and for embedding-model selection work — **not** as a substitute for the golden set. They measure Vietnamese legal retrieval in general; the golden set measures this company's declarations.

| Benchmark | Scale | Note |
|---|---|---|
| **ALQAC 2025** | — | Automated Legal Question Answering Competition; the main Vietnamese legal venue |
| **TVPL** | **224,006 passages**; 165,334 train / 10,000 test queries | The largest public Vietnamese legal retrieval benchmark. Sourced from thuvienphapluat.vn — **see the licensing flag in §10** |
| **Zalo Legal Text Retrieval 2021** | **61,425 passages** | — |
| VLegal-Bench | — | Vietnamese legal *reasoning* benchmark (Dec 2025) — **snippet-only, unverified** |

(verified 2026-07-17, sources: https://arxiv.org/html/2412.00657v1 · https://arxiv.org/html/2409.13699v1)

---

## 10. Open benchmark gap — the eval we may have to run ourselves

**There is no published head-to-head comparison of OpenAI (`text-embedding-3-large`) or Voyage against Vietnamese-specific embedding models on Vietnamese legal text. The benchmark does not exist in the literature.** (verified 2026-07-17)

What was found instead:

- Every Vietnamese legal paper located benchmarks **only open-source/Vietnamese models and explicitly omits OpenAI** (verified 2026-07-17, source: https://arxiv.org/pdf/2507.14619).
- The one benchmark that *does* compare OpenAI to open-source on Vietnamese retrieval — MTEB over VieQuAD/WebFAQ/**Zalo Legal Text** — is **paywalled**: methodology visible, results not (verified 2026-07-17, source: https://nqbao.medium.com/benchmarking-text-embedding-models-for-vietnamese-retrieval-tasks-3c4342e0ff9d).

**If that architecture choice matters, run it: TVPL + MTEB is the ready-made harness.** Do not resolve it by assumption, and do not cite a leaderboard from a different task — retrieval and reranking rank models differently, sometimes inversely. Measured example: `sup-SimCSE-VietNamese-phobert-base` is **best at reranking (mAP 69.46) and catastrophically worst at retrieval (acc 0.12 vs 0.73 for the bi-encoder)** (verified 2026-07-17, source: https://arxiv.org/pdf/2503.07470).

**Licensing flag before using TVPL:** thuvienphapluat.vn's `robots.txt` carries an explicit `Content-Signal: search=yes, **ai-train=no**, use=reference`, framed as an express reservation of rights under EU DSM Art. 4, and blocks Amazonbot/Applebot-Extended/Bytespider by name. The site returns **403 Forbidden** (Cloudflare) to automated fetch, and its Excel biểu thuế are a **commercial product**. TVPL-the-benchmark is derived from that corpus. **Resolve the licensing question before building on it** — this is the worst-liability source in the inventory, not the shortcut it appears to be. (verified 2026-07-17, source: research/12.md live fetch of https://thuvienphapluat.vn/robots.txt)

---

## Unverified / Do Not Rely On

Reproduced from the research with their original flags. **Do not promote any of these into a confident claim without independent verification.**

### Contested — two research agents directly contradict each other

**The customs.gov.vn tariff API. The conflict is UNRESOLVED.** This matters to evaluation specifically because customs.gov.vn is one of the two proposed reconciliation sources for the §3.1 Phase 1 gate. If the API is not reachable, the gate must run against ECUS alone or against the decree text.

| Research 10 claims | Research 12 claims |
|---|---|
| **"There IS an undocumented, unauthenticated, captcha-free JSON API on customs.gov.vn that returns MFN + all 22 FTA rates per HS line in a single call."** Verified with plain `curl` — no session, no cookie, no captcha, no Referer/Origin check. Endpoint: `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`. `l_param` = HS prefix, min 4 digits; `"8703"` returned 510 rows. Example `87031010` → `{'NK_uu_dai':'70','ATIGA':'0','EVFTA_NK':'28.3','NK_TT':'105'}`. Claims the data is live and current for 2026. Bulk extraction ≈ 1,228 POSTs. | **Could not reach it.** Found `/scripts/main.js` hardcoding a *different* base — `http://123.30.210.236:8080/hqcustomsapi/`, a raw IP on plain HTTP port 8080 — **including `.../hqcustomsapi/captcha/CheckCaptcha`, i.e. at least part of the portal is CAPTCHA-gated.** That IP **timed out**; could not distinguish geo-fencing from a sandbox egress block, so explicitly **did not claim it is unreachable**. Judges enumeration through a CAPTCHA-fronted undocumented endpoint on a raw IP as "fragile and adversarial." |

Both agents agree on two points: `www.customs.gov.vn/robots.txt` returns `User-agent: *` with **no `Disallow` lines**; and **customs.gov.vn is not the legal source of truth — the Nghị định is.** Research 10 adds its own caveats: the schedule list has **no VIFTA and no CEPA (UAE)** entries and `THOI_GIAN_CAP_NHAT` values are 2019-2020; it returns **current-year rates only**, no forward-year series; and it is undocumented, unversioned, with no SLA and no ToS grant — it can vanish or start enforcing captcha at any time.

**Do not design the Phase 1 gate to depend on the API being available. Verify reachability yourself before relying on either account.**

### Unverified claims reproduced with their flags

- **`textutil` rate-concatenation is "a tooling artifact fixable with a real Word parser"** — **inferred, not proven** (research 12 could not test: no `soffice`/`antiword`/`python-docx` available). §3.3 exists because of this.
- **"The 2022-2027 FTA decrees hit a cliff on 31/12/2027"** — research 12 flags this as **inferred, not verified**. Research 10 independently reports the same expiry from the decree list. Directionally corroborated; the simultaneous collision with the AHTN/HS 2028 nomenclature switch (HS 2028 in force **01/01/2028**, verified: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx) is a design constraint, not an eval gate — yet.
- **"Claude 3.5 Sonnet and GPT-4 achieve ~80% at 6-digit and >90% at 2-digit."** Surfaced in a search snippet with **no traceable primary source**, and it **contradicts HSCodeComp** (GPT-5 LLM-only: 29% at 10-digit, ~82% at 2-digit). **Do not rely on it. Do not use it to set a threshold.**
- **"1 in 3 customs entries is misclassified; tens of billions in duties incorrectly paid."** Vendor blogs, **no primary citation**. Directionally plausible, unsourced.
- **"Faithful Passage Grounding" eliminating 63% of hallucinated citations** — from **search snippets only**; primary source not verified. Do not cite as a design justification.
- **arXiv:2606.00898 "Citation Grounding via Legal Citation Graphs"** and **arXiv:2606.21155 "Who Checks the Citations?"** — **snippet-only, not fetched.**
- **VLegal-Bench** — snippet-only, unverified.
- **Quyết định 117/QĐ-CHQ (2026)** internal classification-database detail — full text could not be fetched (paywall/403). **Medium confidence.** Its "unified sector-wide classification database" is an *internal* system; **do not assume it will be exposed.**
- **SAT-Graph RAG (arXiv:2505.00039)** — the temporal architecture reference — **reports no quantitative evaluation.** It is an architecture proposal, not an empirical result. Adopt the data model; **do not cite it as proof of performance.**

### Structural limits that no eval score can paper over

- **Vietnam has no CROSS/EBTI equivalent.** No clean, complete, machine-readable, publicly-queryable corpus of classification rulings. **Retrieval quality is capped by data access, not by the model** — a low F2 may be an honest reflection of the corpus, not a tuning failure. (verified 2026-07-17, source: research/09.md; VNTR at https://vntr.moit.gov.vn/administrative_rulings is HTML links only, sample set ~Sept 2021-Jan 2022, "for consultation purpose only")
- **TTĐB and BVMT are not HS-keyed in law.** Verified via the customs API itself: TTĐB queries return `"1. Thuốc lá điếu…"` with **`MA_HS: None`**. Any per-HS mapping is **our own editorial inference and a liability surface** — it must be evaluated as a product of ours, never presented as law. (verified 2026-07-17, source: research/10.md)
- **Anti-dumping/safeguard duties live in individual MOIT quyết định, with no consolidated register.** For the archetypal query — "steel from China" — **the tariff table is the least important number.** Out of v1 scope; an eval that scores "correct rate" without stating this is measuring the wrong thing. (verified 2026-07-17, source: research/10.md, research/12.md)
- **`(HS, country) → rate` is not even a function.** RCEP Điều 6.2 contains a highest-rate rule across annexes for certain multi-origin goods (verified in text: *"Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."*). Any eval assuming a single correct rate per (HS, country) pair has a bug in the eval. (verified 2026-07-17, source: ND 129/2022 gazette text via https://congbao.chinhphu.vn/)

---

## Related Knowledge

- [HS Classification](../concepts/hs-classification.md) — GRI machinery, the accuracy benchmarks behind §4, penalties, advance rulings
- [Tariff System](../concepts/tariff-system.md) — schedule structure, the annexes behind the §3.2 trap, amendment chain
- [Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) — chunking, hybrid search, and the retrieval design these metrics score
- [Data Sources](../concepts/data-sources.md) — Công báo, the customs.gov.vn conflict, robots/licensing posture
- [Vietnamese Legal Documents](../concepts/vietnamese-legal-documents.md) — hiệu lực, VBHN, the temporal model behind §5
- [ADR: No LLM on tariff numbers](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md) — why Phase 1 is a reconciliation gate, not an accuracy score
- [ADR: HS candidates, not answers](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md) — the output contract §4 scores
- [ADR: Bitemporal validity from day one](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md) — the model §5 tests
- [ADR: Use published VBHN, not computed consolidation](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)
- [Business Rules](../business-rules.md) — declarant liability, refusal policy
- [Customs Declaration Workflow](../workflows/customs-declaration.md) — where the golden set questions come from
- [Agent Documentation Index](README.md)
