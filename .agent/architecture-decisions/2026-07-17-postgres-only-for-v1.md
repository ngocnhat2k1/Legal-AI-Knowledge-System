---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - README.md
  - ../project-context.md
  - ../business-rules.md
  - ../concepts/tariff-system.md
  - ../concepts/data-sources.md
  - ../concepts/hs-classification.md
  - ../concepts/legal-rag-retrieval.md
---

# PostgreSQL Alone For v1 — No Qdrant, Neo4j, MinIO Or BullMQ

## Status

Approved — 2026-07-17, by the project owner.

## Context

Customs Assistant v1 does two things: deterministic tariff lookup keyed by HS + schedule + date, and HS code candidate suggestion returning top-3 with verbatim legal-note evidence. See [Project Context](../project-context.md).

The original roadmap named a vector database, a graph database, an object store and a job queue. This ADR removes all four from v1.

**This is not a capability question.** The owner is backend-solid and could run any of these. It is a question of what a 5–50-user internal tool can amortize. Every component added is another process to run, another thing to back up, another thing to debug at 11pm, and — the binding constraint — another surface of AI-generated code the owner lacks the context to review properly. The review budget, not the skill, is scarce.

The workload is small and its shape is known:

- The nomenclature is **11,414 eight-digit lines** across 21 phần / 97 chương / 1,228 nhóm / 4,084 phân nhóm (Thông tư 31/2022/TT-BTC) (verified 2026-07-17, source: research report 10). An independent annex-aware parse of the Công báo `.doc` parts of Nghị định 26/2023 recovered **11,874 unique 8-digit codes**, 11,160 of them with a rate in Phụ lục II (verified 2026-07-17, source: research report 12, https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm).
- Tariff lookup has **no semantic component at all** — it is a keyed table read with a temporal predicate, and no LLM touches the numbers ([Business Rules](../business-rules.md)).
- The only semantic surface in v1 is retrieval over HS Section/Chapter Notes and Explanatory Notes — order 10⁴ chunks, and published practice retrieves **top-k = 5**, because legal RAG degrades from lost-in-the-middle when over-retrieved (verified 2026-07-17, source: research report 02, citing https://arxiv.org/pdf/2605.19806).
- The ingestion cadence is **weeks**, not events. Gazette publication lags legal effect by **15–48 days** across the sampled decrees (verified 2026-07-17, source: research report 12).

## Decision

**PostgreSQL is the only stateful service in v1.** NestJS + PostgreSQL (with pgvector) + Docker, and nothing else.

- **pgvector replaces Qdrant.** Embeddings live in the same database as the temporal validity intervals they must be filtered by.
- **Relational tables and JOINs replace Neo4j.** The amendment/reference graph is modelled in SQL.
- **A `jobs` table plus a scheduler replaces BullMQ.** Ingestion runs as a batch with rows recording state, attempts, and outcome.
- **The filesystem (a Docker volume) replaces MinIO.** Source `.doc` / PDF artifacts are stored on disk with their checksum and provenance recorded in PostgreSQL.

Each component may be added later — but only when a specific, named, observed reason appears. "We might need it" is not a reason. The burden of proof is on the addition.

## Rationale

### pgvector, not Qdrant — because the temporal filter must be a JOIN, not a sync job

Temporal validity has to be a **hard filter, not a ranking signal**. LLMs show a measured recency bias — preferring newer provisions even when the older version applies — that RAG alone does not fix; approaches that treat validity as a hard constraint substantially improve performance (verified 2026-07-17, source: research report 02, citing https://arxiv.org/abs/2605.23497). The point-in-time query is a deterministic interval predicate: `tv.valid_start ≤ t < coalesce(tv.valid_end, +∞)` (verified 2026-07-17, source: https://arxiv.org/abs/2505.00039).

In pgvector that predicate is a `WHERE` clause in the same transaction as the vector search. With Qdrant, validity intervals become a denormalized payload in a second system, and correctness now depends on two stores agreeing. **The failure mode of this project is plausible-looking wrong data that reports success** — a stale payload in a vector DB is exactly that, and it produces a confident answer citing a repealed provision. Qdrant buys throughput we do not need at the price of the one property we cannot lose.

Scale confirms it: ~10⁴ chunks with top-k = 5. This is not a workload that strains a Postgres index.

### JOINs, not Neo4j — because the strongest evidence for a graph admits it is unproven

The best published Vietnamese precedent is SBV-LawGraph: a legal knowledge graph in Neo4j with four relation types (Amend/Supplement, Repeal, Replace, Guidance/Regulation), traversed 1 hop, scoring ALQAC R@1 **0.69** against **0.57** for a hybrid-RAG baseline (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf). Attractive — until the authors' own caveats: **no ablation isolating the graph's contribution** (so the KG's independent effect is unproven), a 100-QA-pair eval set, no KG quality audit, binary correctness with two annotators and no inter-annotator agreement (verified 2026-07-17, source: research report 02).

So the case for Neo4j is: an unmeasured contribution to a task v1 is not building. Four relation types, 1-hop traversal, at our corpus size, is a table with a foreign key and a self-join.

**Revisit only on a specific trigger:** if vbpl's `provisionTree` / `referenceProvisions` turn out to be populated site-wide, that is a provision-level (điều/khoản) legal graph over ~158,826 documents with 27 typed bidirectional relations — a genuinely graph-shaped asset, and worth re-opening this decision. Today both fields were **`null` on every document sampled**, and the `referenceType` int → label mapping is unknown (verified 2026-07-17, source: research report 04). See [Data Sources](../concepts/data-sources.md) and Open Questions in [Project Context](../project-context.md#open-questions).

### A jobs table, not BullMQ — because the queue optimizes the wrong axis

The instinct is that fresh law needs fast pipelines. The measurement says otherwise: **Nghị định 72/2026/NĐ-CP was signed 09/03/2026 and took legal effect the same day ("kể từ ngày ký"), but was published in Công báo số 157 only on 24/03/2026 — 15 days after it was already binding law** (verified 2026-07-17, source: research report 12). During that window the in-force rate exists in machine-readable form nowhere.

A job queue reduces dispatch latency by seconds against a bottleneck measured in weeks, and it cannot invent a document that has not been gazetted. The correct mitigation is the **staleness refusal in the output contract**, not faster workers. Ingestion is a scheduled batch over a handful of documents; a `jobs` table gives idempotency, retry state and an audit trail in the same transaction as the data it produces — which BullMQ, living in a separate store, would not.

### Disk, not MinIO — because the volume is small and provenance is the actual requirement

The corpus is modest: Nghị định 26/2023 is **14 `.doc` parts** on Công báo; RCEP (129/2022) is **51**; EVFTA (116/2022) is **16** (verified 2026-07-17, source: research report 12). Even the scanned fallbacks are small — the two ND 26/2023 PDFs are 19.0 MB and 15.5 MB for 1,016 pages of CCITT-fax bitonal scan (verified 2026-07-17, source: research report 12). Gigabytes at most, written rarely, read rarely.

What we actually need from artifact storage is **provenance** — which gazette issue, which URL, which checksum, retrieved when — and that is a Postgres row pointing at a file, not an S3 API. MinIO would add a service, credentials and a backup story to solve a problem `cp` solves.

## Alternatives Considered

- **Add pgvector now, Qdrant later if retrieval quality demands it.** Kept as the live option — it is the migration path, not a rejected alternative. The trigger would be measured recall or latency failure, not corpus growth alone.
- **Neo4j now because the later RAG phase will want it.** Rejected. The later phase is explicitly not scoped ([Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) is marked DO NOT BUILD IN v1). Provisioning a database for a phase whose requirements are unwritten is how you get a schema nobody chose.
- **BullMQ now because ingestion will grow.** Rejected. It would grow into ~1,228 polite HTTP calls at most, on the contested customs.gov.vn path we are not depending on anyway (verified 2026-07-17, source: research report 10). A batch handles it.
- **SQLite instead of PostgreSQL.** Rejected: pgvector, full-text search, and range/interval types are exactly what the bitemporal model needs, and Postgres is what the owner already runs.

## Scope

Applies to v1 only — the two features named in [Project Context](../project-context.md#in-scope):

- `docker-compose` services: NestJS app + PostgreSQL (pgvector extension) only.
- The tariff store, the bitemporal versioning tables, the amendment/reference tables, the HS-note embeddings, the `jobs` table, and the artifact-provenance table all live in one PostgreSQL database.
- Source artifacts on a Docker volume, referenced by row.

Does **not** decide anything for the later RAG-over-logistics-law phase. That phase re-opens this ADR with its own evidence.

## Consequences

- One process to run, one thing to back up, one restore drill, one connection string.
- Cross-store consistency bugs are structurally impossible in v1, because there is no second store.
- The AI-generated-code review surface stays inside SQL and NestJS — the two things the owner can actually review line by line.
- Retrieval quality is capped by what pgvector + Postgres full-text search can do. If that cap binds, we will know from a measurement, and swapping in a vector DB is a bounded change because the embeddings are already isolated behind a repository.
- No horizontal scaling story. Correct: 5–50 internal users do not need one, and building one now would be work spent against a load that does not exist.
- Anyone proposing a new component must bring the observation that motivates it. That friction is the point.

## Risks

- **Postgres full-text search ranking is not BM25.** The research prescribes hybrid lexical + dense retrieval, weighted ~75/25 toward the lexical side when using a non-fine-tuned embedding — because out-of-the-box dense embeddings *lose* to BM25 on Vietnamese legal text (BM25 R@1 **0.57** vs naive dense R@1 **0.36**), and terms of art like "có thể" vs "phải" are exactly the tokens dense embeddings blur (verified 2026-07-17, source: research report 02, https://lexuanbach.github.io/publication/ACIIDS2026a.pdf). Whether Postgres `tsvector` ranking is an adequate stand-in for BM25 on this corpus is **an engineering assumption, not a research finding — nobody measured it.** Test it before trusting the retrieval leg. This is the most likely reason this ADR gets revisited.
- **Vietnamese text search configuration.** Vietnamese word segmentation is model-coupled and must match the embedding model's pretraining (verified 2026-07-17, source: research report 02). How that interacts with Postgres text-search configurations is untested here.
- **"Temporary" disk storage becoming permanent unmanaged state.** Mitigation: every artifact file has a Postgres row with checksum and source URL; a file with no row is garbage, a row with no file is an alert.
- **Someone reads this ADR as "never use these tools."** It says: not now, and here is the trigger for each.

## Review Requirements

- Verify no v1 code path depends on the contested customs.gov.vn API. Reports 10 and 12 **directly contradict each other** on whether it is reachable and captcha-gated, and **the conflict is unresolved** — see [Data Sources](../concepts/data-sources.md) and [Project Context](../project-context.md#open-questions). Both reports agree on the part that binds us: it has no ToS grant, no SLA, no versioning and **no legal authority — the Nghị định does**.
- Verify the temporal predicate is a `WHERE` filter in the same query as any vector search, never a post-filter and never a ranking input.
- Verify annex identity (Phụ lục I export vs Phụ lục II import) is part of the primary key, not inferred. **1,520 HS codes appear in both annexes of ND 26/2023 and 1,329 carry different rates** — an annex-blind parser returns the export rate for an import question at 94% apparent success (verified 2026-07-17, source: research report 12). See [Tariff System](../concepts/tariff-system.md).
- Verify the `jobs` table records attempts and outcomes durably enough to answer "when did we last successfully ingest X, and from which gazette issue?"
- Verify each artifact file on disk has a corresponding provenance row.
- Before adding any component removed here, record the observation that motivates it in a new ADR that supersedes this one.

## Unverified / Do Not Rely On

- **The customs.gov.vn API conflict is unresolved** (reports 10 vs 12). Do not treat either account as settled. Reproduced in full in [Data Sources](../concepts/data-sources.md).
- **Postgres FTS as a BM25 substitute is unmeasured** — see Risks. This is our assumption, not the research's.
- **Whether vbpl's provision-level graph is populated is the highest-value open question** and the only named trigger for reconsidering Neo4j. Both `provisionTree` and `referenceProvisions` were `null` on every sampled document; the April 2026 relaunch press claims provision-level modelling, but nobody has confirmed it (verified 2026-07-17, source: research report 04).
- **SBV-LawGraph's graph contribution is unproven by its own authors** (no ablation, 100-QA-pair eval). Do not cite its 0.69 R@1 as evidence that a graph database would help us.

## Related Knowledge

- [Project Context](../project-context.md)
- [Business Rules](../business-rules.md)
- [Architecture Decision Index](README.md)
- [Tariff System](../concepts/tariff-system.md)
- [Data Sources](../concepts/data-sources.md)
- [HS Classification](../concepts/hs-classification.md)
- [Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) — future phase; re-opens this decision
- [Vietnamese Legal Documents](../concepts/vietnamese-legal-documents.md)
- [Code Organization](../docs/code-organization.md)
- [Agent Memory Index](../index.md)
