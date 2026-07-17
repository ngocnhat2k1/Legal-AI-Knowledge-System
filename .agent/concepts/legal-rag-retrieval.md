---
type: concept
status: future-phase
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../index.md
---

# Legal RAG Retrieval (Vietnamese Statutory Law)

> **STATUS: FUTURE PHASE — DO NOT BUILD THIS IN v1.**
> v1 of Customs Assistant is (1) deterministic tariff lookup and (2) HS code candidate
> suggestion with verbatim legal-note evidence. Neither needs RAG. This note exists only
> to preserve research evidence while it is fresh, so that when RAG over Vietnamese
> logistics law is actually scoped, the decisions start from measurements instead of
> from vibes. Nothing here authorizes work.

All numbers below come from research report 02 (verified 2026-07-17). Every claim carries
its source. Where the research flagged something unverified or contested, it is reproduced
as a flag — see [Unverified / Do Not Rely On](#unverified--do-not-rely-on).

---

## 1. Chunking: index per Khoản, return the parent Điều

**The rule:** split by the document's own structure. Index the sub-unit (Khoản), return the
parent unit (Điều). Never fixed-size.

**The evidence** — "Chunking German Legal Code", Prior, Milanova & Schultz, ASAIL 2026
(verified 2026-07-17, source: https://arxiv.org/pdf/2605.19806). This is the closest
available structural analogy to Vietnamese law: German `§` (Paragraph) ≈ **Điều**,
`Absatz` ≈ **Khoản**, `Satz` ≈ roughly **Điểm**. Setup: full BGB (2,455 sections), 525
layperson questions with section-level gold labels, gemini-embedding-001, 21 strategies.

Recall@10, measured at section level:

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

Statistics were done properly: Friedman omnibus (p < 0.0001), then paired permutation
tests with Holm correction, confirmed by a top-25 ablation.

### WHY this matters, and what the result actually says

The naive reading is "Khoản wins, use Khoản." That is **not** the finding, and acting on it
wastes effort on the wrong axis.

**The critical result: structural retrieval is significantly better than every
non-structural strategy, but the structural units are NOT significantly different from each
other.** 0.47 vs 0.46 vs 0.45 vs 0.44 is statistical noise. 0.46 vs 0.31 is not.

So: **do not agonize over Điều vs Khoản.** The thing that carries the entire effect is
**not cutting across structural boundaries**. A fixed-size chunker slices mid-Khoản,
severing a condition from its consequence and an exception from its rule — and it loses
~15 recall points for it. Any future agent tempted to "tune the chunk size" is optimizing a
dimension the evidence says is flat, while the dimension that matters (respect the
structure) is already binary and already decided.

### Skip LLM-based chunking — a useful negative result

The "throw an LLM at chunking" reflex is measurably wrong here:

| Method | Build time | R@10 |
|---|---|---|
| Section chunking | **51 seconds** | 0.46 |
| Contextual chunking | 38 minutes | 0.43 |
| RAPTOR | 3h – 5h51m | ~0.40 |
| Lumber (LLM boundary prediction) | 9h – 11h41m | 0.37 |

100–800× the build cost **for worse recall** (verified 2026-07-17, source:
https://arxiv.org/pdf/2605.19806). The structure is already in the document; an LLM
re-deriving it can only add error and latency.

### Parent-child is the substrate, not an option

This is the subtlety most implementations get wrong. **All 21 strategies in the study
evaluate at the parent-section level.** Retrieved chunks, leaves and clusters are *always*
mapped back to their parent § and their scores propagated (top-100 indexed units →
aggregate to parent → return top-10 sections). Parent-child retrieval is not one design
choice among several — it is the assumed substrate of the whole comparison. **The only
live question is what you index underneath it.** A future design doc that presents
"parent-child vs flat" as an open question has misread the evidence.

### Chunking is table stakes, not where legal RAG is won

**Absolute recall is ~0.47 even for the winner** (verified 2026-07-17, source:
https://arxiv.org/pdf/2605.19806). Over half the gold sections are missed at k=10 by the
best strategy. Get chunking right cheaply (51 seconds of structural splitting), then spend
the effort where the headroom is: retrieval, reranking, and structure/temporal filtering.

---

## 2. Document-Level Retrieval Mismatch (DRM)

**The failure:** the retriever returns a chunk that looks perfectly on-topic but comes from
**entirely the wrong source document**. Legal text is lexically redundant and structurally
near-identical across documents, so the embedding has little to distinguish them by.

**Measured: DRM rates exceeding 95% on some datasets** (verified 2026-07-17, source:
https://arxiv.org/html/2510.06999v1).

**Why this is acute in Vietnam:** "Điều 5. Giải thích từ ngữ" exists in hundreds of văn bản
and is near-textually identical across them. A query about a defined term will match dozens
of definition articles that are wrong only in provenance — the exact thing dense embeddings
cannot see and the exact thing that decides the legal answer.

**The fix — Summary-Augmented Chunking (SAC):** prepend a ~150-character document-level
summary to every chunk before embedding. **Roughly halves DRM.** Cheap (one summary per
document, not per chunk) and scales to a changing corpus. Counterintuitively, **generic
summaries beat expert-guided ones** (verified 2026-07-17, source:
https://arxiv.org/html/2510.06999v1).

**⚠️ Exclude the SAC prefix from the BM25 index.** See the dissenting data point in
[Unverified / Do Not Rely On](#unverified--do-not-rely-on) — BM25 latched onto the prepended
summary rather than the chunk body, improving document-level accuracy but *reducing*
text-level precision/recall.

---

## 3. ⚠️ The counterintuitive one: BM25 beats naive dense on Vietnamese legal text

Two published results point opposite ways. Both are real. Understanding why is the whole
lesson.

**Side A — BM25 crushes out-of-the-box dense** (SBV-LawGraph, ACIIDS 2026, on ALQAC2025;
verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf):

- BM25 R@1 = **0.57**
- Naive dense RAG (`paraphrase-vietnamese-law`, no rerank) R@1 = **0.36**
- Their "AdvancedRAG" hybrid weights **75% BM25 / 25% semantic**

**Side B — fine-tuned dense annihilates BM25** (TVPL; verified 2026-07-17, source:
https://arxiv.org/html/2412.00657v1):

- BM25 MRR@10 = **21.60**
- Fine-tuned ColBERT = **74.61**; fine-tuned bi-encoder = **70.69**
- **but only after domain fine-tuning on 507K synthetic queries**

And a third point: hybrid at **50/50** with the BKAI bi-encoder → R@1 **0.86**, R@10
**0.98** (2,081 questions / 1.29M articles; verified 2026-07-17, source:
https://arxiv.org/html/2409.13699v1).

### The reconciliation — this is the durable rule

These are **not contradictory. They are the same finding from two sides: the BM25:dense
weight ratio is a function of how well-adapted your embedding model is.**

- Generic / lightly-adapted embedding → weight BM25 heavily (~75/25).
- Properly fine-tuned in-domain embedding → dense can lead, and hybrid moves toward 50/50.

**Do not copy a weight ratio from a paper whose embedding model you are not using.** The
ratio is not a property of legal text; it is a property of the pairing of your model with
your corpus. A future agent that hardcodes 75/25 after fine-tuning, or 50/50 before it, has
copied the number and missed the finding.

### WHY BM25 is structurally strong here

Legal retrieval turns on exact terms of art and citation strings — "Điều 12",
"Nghị định 168/2024/NĐ-CP", "Thông tư 23/2025/TT-NHNN" — which must match *exactly*. Dense
embeddings blur precisely the tokens carrying decisive legal weight.

The German example makes it unmissable: **`unverzüglich` ("without undue delay") vs
`sofort` ("immediately")** are near-identical in embedding space and legally different
(verified 2026-07-17, source: https://arxiv.org/pdf/2605.19806).

The Vietnamese equivalents this project will hit:

- **"có thể" (may) vs "phải" (must)** — the difference between a discretion and an obligation
- **"trong thời hạn" (within the period) vs "chậm nhất" (no later than)**

A semantic-only retriever treats these as synonyms. A customs officer does not.

### Reranking is well-supported

RRF fusion → cross-encoder rerank, using **ViRanker** + **BAAI/bge-reranker-v2-m3**
(verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).
LegalBench-RAG also finds reranking empirically superior (verified 2026-07-17, source:
https://arxiv.org/html/2408.10343v1).

---

## 4. Embedding models — the honest headline is a gap

**There is NO published head-to-head of OpenAI `text-embedding-3-large` vs Voyage vs
Vietnamese-specific models on Vietnamese legal text.** Every Vietnamese legal paper found
benchmarks only open-source / Vietnamese models and expressly omits OpenAI (verified
2026-07-17, source: https://arxiv.org/pdf/2507.14619). The one benchmark that does compare
commercial to open-source on Vietnamese retrieval is **paywalled** — methodology visible,
results not (verified 2026-07-17, source:
https://nqbao.medium.com/benchmarking-text-embedding-models-for-vietnamese-retrieval-tasks-3c4342e0ff9d).

**This is a genuine gap this project may have to fill with its own eval.** If the
commercial-vs-Vietnamese-model decision ever becomes load-bearing, budget for running the
benchmark, not for reading one. **TVPL + MTEB is the ready-made harness.**

### Models actually used by published Vietnamese legal systems

| Model | Used by | Note |
|---|---|---|
| `bkai-foundation-models/vietnamese-bi-encoder` | https://arxiv.org/html/2409.13699v1, https://arxiv.org/pdf/2507.14619 | The de facto default. **256-token limit** (PhoBERT-based) |
| `minhquan6203/paraphrase-vietnamese-law-embedding` | SBV-LawGraph | Fine-tuned from `paraphrase-multilingual-mpnet-base-v2` on ViLQA + ALQAC2024; 768-dim |
| BGE-M3, mE5-base, vietnamese-sbert | https://arxiv.org/html/2412.00657v1 baselines | Beaten by fine-tuned bi-encoder / ColBERT |

(all verified 2026-07-17)

The **256-token limit** of PhoBERT-family models is an architectural constraint that
*forces* sub-Điều chunking — which happens to agree with §1, so it costs nothing here. It
does mean Điều-level *embedding* of long articles requires a long-context model
(BGE-M3 at 8192, or a commercial API) — and then you are back in the benchmark gap above.

### ⚠️ Retrieval ≠ reranking — do not pick a model off the wrong leaderboard

From the cleanest general Vietnamese embedding comparison (verified 2026-07-17, source:
https://arxiv.org/pdf/2503.07470):

- **Reranking** (mAP, ViRerank): sup-SimCSE-VietNamese-phobert-base **69.46** > 67.86 > sbert 66.9 > bi-encoder 65.41
- **Retrieval** (acc, ViMedRetrieve@20): **bi-encoder 0.73** > 0.50 > sbert 0.32 > **sup-SimCSE 0.12**

`sup-SimCSE-VietNamese-phobert-base` is **best at reranking and catastrophically worst at
retrieval — 0.12 vs 0.73**. That is a 6× gap in the wrong direction. **Do not pick a
Vietnamese embedding model off a reranking leaderboard for a retrieval job.** The tasks
reward opposite geometries; a leaderboard rank is meaningless without its task.

### Fine-tuning is the single highest-leverage lever

Bigger than model choice. **MRR@10 21.6 (BM25) → ~74 (fine-tuned dense)** (verified
2026-07-17, source: https://arxiv.org/html/2412.00657v1). **Semi-hard negative mining**
specifically drives this (verified 2026-07-17, source: https://arxiv.org/pdf/2507.14619).
**Synthetic query generation over statutory passages is a proven recipe** for manufacturing
the training data (Llama3-70B, 507K queries).

If effort is scarce, spend it on fine-tuning before spending it on model shopping.

### Vietnamese word segmentation is model-coupled, not a free choice

Vietnamese has no explicit word boundaries. **PhoBERT-family models were pretrained on
segmented text, so you MUST segment at inference to match pretraining.** Tools in use:

- **RDRSegmenter / VnCoreNLP** — chosen explicitly "as the original dataset for training the BKAI model used this segmentation method" (verified 2026-07-17, source: https://arxiv.org/html/2409.13699v1)
- **Underthesea** (verified 2026-07-17, source: https://arxiv.org/html/2412.00657v1)
- **PyVi** (verified 2026-07-17, source: https://arxiv.org/pdf/2507.14619)

**The segmenter must match your embedding model's pretraining.** It is a dependency of the
model, not a preference. Word segmentation, diacritics and regional variation all degrade
Vietnamese embedding quality when mismatched (verified 2026-07-17, source:
https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).

---

## 5. Temporal validity must be a HARD FILTER, not a ranking signal

**This is a measured failure mode, not a theoretical worry.**

"Asking For An Old Friend: Diagnosing and Mitigating Temporal Failure Modes in LLM-based
Statutory Question Answering" — 312 validated German statutory QA pairs, five major LLMs
(verified 2026-07-17, source: https://arxiv.org/abs/2605.23497). Two **distinct** failure
modes:

1. **Applying outdated rules** after legislation changes — training-cutoff staleness.
2. **Preferring newer provisions even when the older version applies** — a **recency bias
   that RAG alone does not fix.**

Mode 2 is why this must be a filter. Retrieval that merely *surfaces* the correct-vintage
provision alongside a newer one loses: the model prefers the newer one anyway. **Retrieval
approaches that treat temporal validity as a hard constraint substantially improve
performance.**

**The design directive:** extract the as-of date from the query, then **FILTER the candidate
set** before ranking. Do not hope the reranker sorts it out — the measurement says it does
not.

### Bitemporal data model — SAT-Graph

The most developed public model is SAT-Graph RAG (Brazilian Constitution case study;
verified 2026-07-17, source: https://arxiv.org/abs/2505.00039). LRMoo-inspired: an abstract
**Work** vs versioned **Expressions**.

- **Components** (Titles / Chapters / **Articles**) form the graph backbone, derived from the
  document's **intrinsic structure — explicitly NOT LLM entity extraction.** (Same lesson as
  §1: the structure is already there; deriving it with an LLM only adds error.)
- **Component Temporal Versions (CTV)** — date-stamped with validity intervals.
- Point-in-time query is a **deterministic interval predicate**:
  `tv.valid_start ≤ t < coalesce(tv.valid_end, +∞)`.

**Efficiency trick worth stealing:** a new parent CTV on date Dₙ is an **AGGREGATION that
reuses the existing CTVs of unchanged children.** You do not duplicate the whole Luật on
every amendment — only changed components get new versions. Without this, versioning a
frequently-amended Luật multiplies storage and makes every read a full-tree copy.

**Honest caveats (reproduce these, do not launder them):**

- Despite the framing, SAT-Graph implements **valid time only, not true bitemporality.**
- It **reports NO quantitative evaluation.** It is an architecture proposal, not an
  empirical result. **Adopt the data model; do not cite it as proof of performance.**

---

## 6. Cross-references — the implicit ones are the hard case

Taxonomy (verified 2026-07-17, source: https://arxiv.org/pdf/2605.19806):

- **Explicit** — a named target ("theo quy định tại Điều 12 của Luật này"). Parseable.
- **Implicit** — invoked via **terminology**, not citation. Using the word "consumer"
  silently presupposes the definition article. **This is the hard one: no parser finds it**,
  and it is rampant in Vietnamese law via "Giải thích từ ngữ" articles.
- **Internal vs external** (within Luật này vs another văn bản).
- **Intra-section** (Khoản → Khoản within the same Điều).

**SAT-Graph explicitly does NOT address cross-reference resolution** (verified 2026-07-17,
source: https://arxiv.org/abs/2505.00039). Structure alone does not cover this.

**SBV-LawGraph is the one system empirically tackling it on Vietnamese law** (verified
2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf):

- **4 relation types:** Amend/Supplement, Repeal, Replace, Guidance/Regulation (the last is
  the Vietnamese Luật → Nghị định → Thông tư hierarchy)
- Extracted by **gpt-oss-120b few-shot**, stored in **Neo4j**
- Traversed **1 hop** in/out from query entities

Note the modesty of that: four relation types, one hop. This is the state of the art on
Vietnamese law, not a starting point to improve on casually.

---

## 7. Hallucination — anchor expectations here

The definitive source: Magesh, Surani, Dahl, Suzgun, Manning & Ho, "Hallucination-Free?
Assessing the Reliability of Leading AI Legal Research Tools", *Journal of Empirical Legal
Studies* 2025 — the **first preregistered** evaluation, 202 queries, expert-scored
(verified 2026-07-17, source: https://doi.org/10.1111/jels.12413 ·
https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf).

| System | Result |
|---|---|
| Lexis+ AI | 65% accurate; **hallucinates >17%** |
| Westlaw AI-Assisted Research | 42% accurate; **hallucinates >34%** |
| Ask Practical Law AI | in the 17–33% hallucination band |
| GPT-4 (no RAG) | ~43% hallucination |

These are commercial legal-RAG products with full case-law corpora, built by companies whose
core business this is. Against them stand vendor claims of "hallucination-free linked legal
citations" (LexisNexis) and RAG "dramatically reduces hallucinations to nearly zero"
(Thomson Reuters). **These are the numbers to anchor stakeholder expectations with.**

### ⚠️ The Wilgarten example is the conceptual core

Asked for opinions by **"Luther A. Wilgarten", a fictitious judge**, Lexis+ AI returned a
**real case with a real, correctly-formatted citation** — a case not written by that
nonexistent judge. The paper's phrase: *"hallucination-free in a narrow sense."*

**⚠️ Therefore "every citation resolves to a real document" is a WORTHLESS guarantee.** It
is exactly the guarantee vendors market and exactly the one that fails. A Điều-number
validator gives false comfort: it will pass every Wilgarten.

**The grounding check must verify that the cited provision SUPPORTS the proposition
asserted** — not that it exists.

This is also why v1 shows **verbatim legal-note evidence** next to HS candidates and lets a
human decide. Verbatim text cannot be hallucination-free-in-a-narrow-sense; either the
words support the classification or they visibly do not.

### Refusal as a first-class output

SBV-LawGraph's Algorithm 2 is a usable blueprint (verified 2026-07-17, source:
https://lexuanbach.github.io/publication/ACIIDS2026a.pdf):

- **Post-generation:** `if ¬HasCitations(a) or EvidenceMismatch(a, D, G) → return Unknown Answer`
- **Pre-generation gate:** if no chunk clears the similarity threshold (cosine **0.9**,
  top-k **5**), **refuse before generating.**

"Unknown Answer" is a supported output, not a failure. A system that always answers will
always be wrong 17–34% of the time and never tell you which.

### Keep retrieved context SMALL

Legal RAG is vulnerable to **"lost in the middle"** — dumping 20 Điều into context
**actively degrades faithfulness** (verified 2026-07-17, source:
https://arxiv.org/pdf/2605.19806). This argues for **aggressive reranking + low top-k**
(SBV uses k=5), **not** "retrieve more to be safe." The instinct to widen the net when
unsure makes the answer worse, not merely slower.

### Training data overriding retrieval context

A named failure mode: *"the LLM may have been trained on a much greater volume of text
supporting the broadly applicable rule and may be more faithful to its training data than to
the retrieval context"* (verified 2026-07-17, source:
https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf).

**Directly relevant to this project:** a narrow Vietnamese exception in a **Thông tư** versus
the general rule in the **Luật**. The general rule is everywhere in training data; the
exception is in one document you retrieved. The model will tend to answer with the general
rule even while citing the exception.

### Other named failure modes

| # | Failure mode | Evidence |
|---|---|---|
| 1 | **Document-Level Retrieval Mismatch** — right-looking chunk, wrong văn bản | >95% on some datasets (https://arxiv.org/html/2510.06999v1) |
| 2 | **Temporal anachronism** — applying repealed / not-yet-effective law | https://arxiv.org/abs/2605.23497 |
| 3 | **Recency bias** — preferring newer provisions when older applies; survives naive RAG | https://arxiv.org/abs/2605.23497 |
| 4 | **Narrow-sense-only grounding** — real citation, unsupported proposition | Magesh et al. (Wilgarten) |
| 5 | **Textual relevance ≠ legal relevance** — right words, wrong jurisdiction / conditions / hierarchy | Magesh et al. §3.2 |
| 6 | **Training data overriding retrieval context** | Magesh et al. |
| 7 | **Implicit cross-references** — terminology silently invoking definitions | https://arxiv.org/pdf/2605.19806 |
| 8 | **Semantic blur on decisive tokens** — `unverzüglich`/`sofort`; "có thể"/"phải" | https://arxiv.org/pdf/2605.19806 |
| 9 | **Lost-in-the-middle** from over-retrieval | https://arxiv.org/pdf/2605.19806 |

(all verified 2026-07-17)

---

## 8. Evaluation

**Evaluate retrieval separately from generation.** A joint score cannot tell you whether a
wrong answer came from a missed provision or a misread one, and the fixes are different.

**LegalBench-RAG** (Pipitone & Alami) — 6,858 QA pairs / 79M chars — scores **exact file +
character indices**, forcing **minimal-span precision** rather than "the right document is
somewhere in the top 10." That is the discipline legal citation demands (verified
2026-07-17, source: https://arxiv.org/html/2408.10343v1).
**Caveat: its corpus is contracts and privacy policies (CUAD/MAUD/ContractNLI/PrivacyQA),
not statute. The methodology transfers; the findings may not.**

**Vietnamese benchmarks that exist** (all verified 2026-07-17):

- **ALQAC 2025** (Automated Legal Question Answering Competition) — the main Vietnamese legal venue
- **TVPL** — **224,006 passages, 165,334 train / 10,000 test queries**, from thuvienphapluat.vn. **The largest public Vietnamese legal retrieval benchmark** (source: https://arxiv.org/html/2412.00657v1)
- **Zalo Legal Text Retrieval 2021** — 61,425 passages

**Metrics:** Recall@k / Precision@k / MRR / **F2@k**. Use **F2@k** — it is recall-weighted,
which is the correct instinct for legal work, where **missing an applicable provision is
worse than surfacing an extra one** (verified 2026-07-17, source:
https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).

**Conjunctive correctness.** An answer counts correct only if **(i)** it is semantically
equivalent to the gold answer, **(ii)** it contains ≥1 legal citation, **and** **(iii)** the
citations are **valid AND relevant**. Condition (iii) is the operationalization of the
Wilgarten lesson — validity alone is what fails.

**Preregister.** This is Magesh et al.'s core methodological contribution: the field is full
of vendor claims that do not survive contact with a preregistered protocol. Deciding the
metric after seeing the numbers is how "nearly zero hallucinations" gets published.

### Reference numbers (SBV-LawGraph, Vietnamese statutory)

| Model | ALQAC R@1 | ALQAC R@10 | SBV R@1 | SBV R@10 |
|---|---|---|---|---|
| BM25 | 0.57 | 0.74 | 0.38 | 0.65 |
| Naive RAG (dense) | 0.36 | 0.58 | 0.32 | 0.61 |
| Advanced RAG (75/25 hybrid) | 0.57 | 0.74 | 0.40 | 0.67 |
| **SBV-LawGraph (hybrid + rerank + KG)** | **0.69** | **0.77** | **0.49** | **0.76** |

(verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)

It also beat GPT-5 and Gemini 2.5 Pro zero-shot with web retrieval on correctness, citation
and legal consistency.

**⚠️ Caveats the authors themselves list — treat these numbers as directional, not
definitive:**

- Small SBV eval set: **100 QA pairs**
- **No ablation isolating SBV-LR vs SBV-RR** — so the knowledge graph's independent
  contribution is **unproven**
- **No KG quality audit**
- Binary correctness with only **2 annotators** and **no inter-annotator agreement reported**

---

## Bottom line (for whenever this phase is actually scoped)

1. **Chunk by structure — index per Khoản, return the parent Điều.** Never fixed-size. Skip LLM-based chunking: worse recall at 100–800× the build cost.
2. **Prepend văn bản identity/title to every chunk (SAC-style)** — DRM is the top retrieval failure and this halves it. **Exclude the prefix from the BM25 index.**
3. **Hybrid BM25 + dense + cross-encoder rerank.** Start ~75/25 favoring BM25 with a generic embedding model; shift toward dense **only after** in-domain fine-tuning.
4. **Fine-tune the embedding model on synthetic Vietnamese legal queries with semi-hard negatives** — the highest-leverage single action (MRR@10 21.6 → ~74). Segment with the tokenizer matching the model's pretraining.
5. **Model valid-time explicitly and filter as a hard constraint,** not a ranking signal. Reuse unchanged children's CTVs.
6. **Ground citations by entailment, not existence.** Refuse when evidence is thin. Keep top-k low.
7. **Benchmark on ALQAC 2025 / TVPL with span-level precision, F2, and conjunctive correctness. Preregister.**

---

## Unverified / Do Not Rely On

Reproduced verbatim in spirit from research 02's own flags. Do not upgrade these to
confident claims.

- **SAT-Graph (https://arxiv.org/abs/2505.00039) reports NO quantitative evaluation** and implements **valid time only, not true bitemporality**, despite its framing. Adopt the data model; never cite it as evidence of performance.
- **Dissenting data point on hybrid search [single-study]:** https://arxiv.org/html/2510.06999v1 found hybrid BM25+dense *improved* document-level accuracy (DRM) but **reduced text-level precision/recall** vs pure dense — because BM25 latched onto the prepended SAC summary rather than the chunk body. **Caveat: contract/NDA corpus (LegalBench-RAG), not statute, and it is an interaction effect with SAC specifically.** Mitigation: exclude the SAC prefix from the BM25 index.
- **"Faithful Passage Grounding"** — a cross-encoder scoring whether each claim is entailed by its cited passage, reported to eliminate **63%** of hallucinated citations on case law. **The researcher had this from search snippets only and did not verify the primary source.** Do not rely on the 63%.
- **Citation-graph grounding — https://arxiv.org/html/2606.00898** ("Citation Grounding: Detecting and Reducing LLM Citation Hallucinations via Legal Citation Graphs"). **Snippet-only; not fetched. Unverified.**
- **https://arxiv.org/pdf/2606.21155** ("Who Checks the Citations?") — **unverified.**
- **VLegal-Bench** — a Vietnamese legal *reasoning* benchmark (Dec 2025). **Snippet-only, unverified.**
- **The commercial-vs-Vietnamese embedding comparison does not exist in public literature.** The one benchmark that compares them on Vietnamese retrieval is **paywalled** (results not visible). Any claim that OpenAI/Voyage does or does not beat `bkai-foundation-models/vietnamese-bi-encoder` on Vietnamese legal text is currently **unsupported by evidence in either direction.** This project would have to run its own eval.
- **The 256-token PhoBERT constraint forcing sub-Điều chunking** was flagged by the researcher as **speculative** — an inference, not a measured result. It happens to agree with the measured chunking finding, so it costs nothing to follow, but it is not independently evidenced.
- **Research 02's method note:** a single-pass PDF summary of https://arxiv.org/abs/2605.23497 **hallucinated a fake system ("LLMaaJ") and invented mitigations**; the real content came from the abstract page. **Treat single-pass PDF summaries of that paper with suspicion** — including any future agent's.
- **Statistical significance boundary:** the German chunking study establishes that structural > non-structural. It does **NOT** establish that Khoản > Điều. Any future note or design doc asserting Khoản is *better* than Điều is overreading the source.

---

## Related Knowledge

- [Project Context](../project-context.md) — what Customs Assistant is, v1 scope, and why RAG is out of scope for v1
- [Business Rules](../business-rules.md) — durable policy and validation rules
- [Agent Memory Index](../index.md) — map of durable project memory
- [Agent Rules](../AGENTS.md) — documentation and note conventions this file follows
