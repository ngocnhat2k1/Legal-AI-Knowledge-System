---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../concepts/tariff-system.md
  - ../concepts/hs-classification.md
  - ../concepts/legal-rag-retrieval.md
  - ../concepts/data-sources.md
  - ../workflows/customs-declaration.md
---

# Build The Customs Assistant Before The Legal RAG

## Status

Approved — the owner approved this plan on 2026-07-17.

## Context

The original roadmap for this repository described a legal reading assistant: RAG plus a knowledge graph over Vietnamese logistics statute prose. The owner is a customs declarant. His actual daily loop is: classify HS → check policy (cấm / giấy phép / điều kiện / kiểm tra chuyên ngành) → licences and inspection on VNSW → declare via ECUS → phân luồng → pay duty → thông quan (verified 2026-07-17, source: research report 08). Reading statute prose is not in that loop; looking up a number and defending a code is.

The two products are different shapes of problem:

- **Tariff/HS is table data with exact-key lookup.** A duty rate is correct for a `(HS, schedule, date)` tuple or it is a wrong answer on a legally binding declaration. There is no "semantically close" rate.
- **Statute RAG is prose semantic search.** Its best published Vietnamese numbers are Recall@1 0.69 / Recall@10 0.77 on ALQAC and 0.49 / 0.76 on the SBV corpus for a hybrid + rerank + knowledge-graph system — with the authors themselves flagging a 100-QA eval set and no ablation isolating the KG's contribution (verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf). Those are research-aid numbers, not answer-engine numbers.

They share infrastructure — a bitemporal document store, a Công báo ingestion pipeline, a citation model — and share **no core**. Nothing in a keyed table read is reused by a retriever, and nothing in a retriever helps a table read.

The verification work also showed the data is obtainable, so scarcity is not the reason to sequence. Report 12 assembled a real 11,874-row MFN table from `congbao.chinhphu.vn` `.doc` gazette parts in a few hours, and independently validated it (verified 2026-07-17, source: research report 12, https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm). The reason to sequence is **feedback speed against a failure mode that is silent**.

## Decision

Build the Customs Assistant first. Ship v1 as exactly two features — deterministic tariff lookup and HS candidate suggestion — and defer RAG over Vietnamese logistics law to a later phase.

Ordering rule: **the owner is the first and primary user of everything we ship.** Any capability whose errors he cannot detect within roughly a week of his own daily use does not go in v1.

## Rationale

**1. The characteristic failure is plausible-looking wrong data that reports success — so detection latency is the whole ballgame.**

A naive parse of the MFN decree reported **94% success and was confidently wrong**: 1,520 HS codes appear in both Phụ lục I (export schedule) and Phụ lục II (import schedule), and **1,329 carry different rates**. An annex-blind parser returns the *export* rate for an *import* question, silently, at 94% apparent success (verified 2026-07-17, source: research report 12).

The HS side has the same property, named: HSCodeComp errors are overwhelmingly **"Error but Valid"** — the model emits a real, legitimate-looking HS code that is wrong, with no exception, no parse failure, no red flag (verified 2026-07-17, source: https://arxiv.org/html/2510.19631). It flows into VNACCS, is accepted, and surfaces three years later as a post-clearance audit at **20% of the shortfall** plus **0.03%/day** interest (verified 2026-07-17, source: https://hethongphapluat.com/nghi-dinh-128-2020-nd-cp-quy-dinh-ve-xu-phat-vi-pham-hanh-chinh-trong-linh-vuc-hai-quan/dieu-9).

Neither failure is caught by tests, by a schema, or by a confidence score. It is caught by a domain expert who knows that 0301.11.10 is 15% on import and sees the tool say 0%. The owner is that expert and he opens the tool every working day. Customs first buys us **error detection in a week instead of six months**, on the exact class of error the project is most likely to produce.

**2. Both v1 features have a known-good output contract; the RAG one does not yet.**

Tariff lookup has no AI in it — it is a keyed table read, and its correctness is verifiable against the decree text. HS suggestion has a *measured* winning contract: the Korea Customs Service system predicts 6-digit subheadings and retrieves the relevant key sentences from the HS manual as explainable evidence per candidate, reaching **top-3 accuracy 93.9%** across 925 difficult subheadings on 5,000 recent classification requests, with a 32-expert user study confirming reduced review time (verified 2026-07-17, source: https://arxiv.org/abs/2311.10922). Against autonomous top-1 at 10-digit of **46.8%** (best agent) and **29.0%** (GPT-5, no tools) versus **95.0%** human (verified 2026-07-17, source: https://arxiv.org/html/2510.19631). **The gap between 47% and 93.9% is the output contract, not model capability.**

We know what "done" looks like for both v1 features. For legal RAG we do not: no published comparison of commercial embeddings against Vietnamese-specific models on Vietnamese *legal* text exists, and we would have to run that eval ourselves (verified 2026-07-17, source: research report 02).

**3. The shared infrastructure gets built anyway, and gets built under load.**

Bitemporality, Công báo ingestion, and citation-with-as-of-date are all mandatory for tariff (see [Project Context](../project-context.md)). Doing them first for a domain where the owner can check every output means the RAG phase inherits a store that has already been proven wrong and fixed, rather than one that was designed against a hypothetical.

Bitemporality specifically is not deferrable. ND 72/2026/NĐ-CP was signed **09/03/2026** and effective **the same day** ("kể từ ngày ký"); it reached Công báo số 157 on **24/03/2026 — 15 days after it was already binding law**; and it expired **30/04/2026**, a 52-day window, after which rates revert to ND 26/2023 (verified 2026-07-17, source: research report 12). A "latest value" schema serves 0% petrol forever, and retrofitting temporality onto it is a rewrite.

**4. Value density.** Tariff/HS is where the money and the liability are. 76% of enterprises report obstacles confirming HS codes, up from 66.3% in 2018 (verified 2026-07-17, source: https://diendandoanhnghiep.vn/ganh-nang-ma-hs-trach-nhiem-cua-co-quan-hai-quan-o-dau-10077631.html). A single reclassification reportedly cost 8 dairy producers ~700 tỷ VND in retroactive truy thu (source: research 09 §2 — **the report carries no primary URL for this case; illustrative, not established fact**; see [Business Rules → Unverified](../business-rules.md#unverified--do-not-rely-on)). Nobody gets fined for reading Nghị định 163/2017 slowly.

## Alternatives Considered

**Law-first (RAG over logistics statute first).** Rejected. The data is safer — Công báo and vbpl are both usable, and văn bản hợp nhất became an official basis for citing and applying law as of **01/07/2026** under Pháp lệnh 01/2026/UBTVQH16, which removes the legal objection that would previously have blocked a hợp nhất-based text layer (verified 2026-07-17, source: https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm). But the value is lower and, decisively, **the feedback loop is worse**: prose answers are graded on plausibility, and a wrong-but-fluent retrieval over Luật Thương mại Điều 233–240 costs the owner nothing he will notice. We would optimize for six months against a metric nobody feels. The comparable failure rate is real and measured — in the only preregistered evaluation of leading legal AI tools, Lexis+ AI was 65% accurate and hallucinated >17%, Westlaw AI-Assisted Research 42% accurate and hallucinated >34%, against vendor claims of "hallucination-free" (verified 2026-07-17, source: https://doi.org/10.1111/jels.12413).

**Both at once.** Rejected — the classic trap. The two share infrastructure but no core, so "both" is not one project with leverage; it is two projects with one deadline. It would also force the Neo4j/Qdrant/BullMQ stack that [Project Context](../project-context.md) excludes: a graph DB and a dedicated vector store are only arguable once the amendment graph and the prose corpus are live, and v1's semantic surface is HS-note retrieval only, which pgvector covers. Adding them now is operational surface a 5–50-person internal tool cannot amortize, paid for before either product proves itself.

**Buy instead of build.** Not viable as stated. caselaw.vn covers 12,000+ HS codes and 17+ FTAs and advertises an enterprise API, and ecus.vn publishes a 32-table consolidated Excel over ~8,000 HS codes updated 05/04/2026 — but **nobody exposes a free public API**, caselaw.vn does not cite its sources, and an uncited rate is unusable for the one thing this tool exists to produce: a defensible paper trail (verified 2026-07-17, source: research report 10).

## Scope

Applies to:

- `.agent/planning/01-task-list.md` — v1 sequencing
- `.agent/concepts/tariff-system.md`, `.agent/concepts/hs-classification.md` — built first
- `.agent/concepts/legal-rag-retrieval.md` — retained as durable knowledge, **not** a v1 build target
- `.agent/docs/code-organization.md` — module boundaries must keep the tariff core free of retrieval dependencies

Does not apply to: the shared substrate (bitemporal store, Công báo ingestion, citation model), which is v1 work regardless of sequencing.

## Consequences

- v1 ships two features, both of which the owner exercises daily and can falsify from memory.
- The RAG concept note stays in memory and stays unbuilt. Do not let it leak into v1 designs.
- Module boundaries must make the sequencing physical: the tariff lookup path has no LLM, no embedding, and no retrieval dependency. If a future change adds one, that is a violation of [Business Rules](../business-rules.md), not a refactor.
- The infrastructure v1 builds is the infrastructure the RAG phase needs. If a v1 shortcut would make the store non-bitemporal or drop provenance, it is not a shortcut — it is a prepayment on a rewrite.
- We accept that the archetypal query "steel from China" is not answerable in v1: anti-dumping/safeguard duties are the most important number there and are excluded (no consolidated machine-readable register; per-case Quyết định-BCT scraping with sơ bộ → chính thức → rà soát cuối kỳ lifecycle tracking). A half-built version is worse than none, and the UI must say so rather than return a tariff rate that reads like an answer (verified 2026-07-17, source: research report 10, https://pvtm.gov.vn/).

## Risks

- **Customs data is not the "safe" choice on currency.** The amendment stream is the real blocker, not acquisition. Decrees take effect the day they are signed, reach machine-readable Công báo 15–48 days later, and some expire and silently revert (verified 2026-07-17, source: research report 12). Mitigation is the output contract, not the crawler: cite the decree and as-of date, and **refuse when the snapshot may be stale**.
- **Two hard deadlines land together around 31/12/2027 – 01/01/2028**: the FTA decree corpus expiry and the AHTN/HS 2028 nomenclature switch (HS 2028 in force 01/01/2028 per WCO; the FTA cliff is *inferred*, see below). Model HS version and validity period as first-class dimensions from day one (verified 2026-07-17, source: https://www.wcoomd.org/en/topics/nomenclature/instrument-and-tools/hs-nomenclature-2028-edition/amendments-effective-from-1-january-2028.aspx).
- **Sequencing does not remove the owner-as-single-point-of-review risk.** One expert checking his own tool's output is a fast loop, not an independent one. Confirmation bias is the documented worst-case failure of AI classification tools; the [Business Rules](../business-rules.md) prohibition on a preferred code entering a prompt as a premise is the structural guard, and it does not weaken because the reviewer is the owner.
- **Deferring RAG defers learning about the harder retrieval problems**, notably Document-Level Retrieval Mismatch, observed above 95% on some datasets (verified 2026-07-17, source: https://arxiv.org/html/2510.06999v1). Accepted: the HS-note retrieval surface in v1 exercises a small version of the same machinery.

## Unverified / Do Not Rely On

Reproduced from the research's own flags. Do not restate as fact.

- **The 2022–2027 FTA decree cliff on 31/12/2027 is inferred, not verified.** Report 12 marks it explicitly as inferred; report 10 asserts it more confidently but sources it to secondary aggregators. Treat as a planning assumption to re-verify.
- **The customs.gov.vn tariff API — reports 10 and 12 directly contradict each other, and the conflict is unresolved.** Report 10 says it verified `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue` with bare `curl`: no auth, no captcha, the on-page captcha client-side only, `"8703"` returning 510 rows, bulk extraction ≈1,228 POSTs. Report 12 says `/scripts/main.js` hardcodes `http://123.30.210.236:8080/hqcustomsapi/` including `.../captcha/CheckCaptcha`, that the IP timed out, and that it cannot distinguish geo-fencing from a sandbox egress block. They may be describing different endpoints — that is a hypothesis nobody tested. **This decision does not depend on resolving it:** both reports agree the API has no ToS grant, no SLA, no versioning and no legal authority, and that the Nghị định is the source of truth. v1 must not depend on it.
- **The EVFTA table-parse artifact is the one gap a builder must close first.** `textutil` collapsed a row to `2101.11.11 | ... | 2925,421,818,114,510,9` — six rates concatenated with no delimiter in a decimal-comma locale. Report 12 states plainly: *"I am inferring, not asserting, that this is a tooling artifact."* A real Word parser (LibreOffice → docx → `w:tbl/w:tr/w:tc`) probably fixes it; no `soffice`/`python-docx` was available to prove it.

## Review Requirements

- Verify no v1 design places an LLM, embedding, or retrieval call in the tariff lookup path.
- Verify the bitemporal store and Công báo ingestion are specified before any feature work, not alongside it.
- Verify the HS suggestion contract is candidates + verbatim evidence + explicit abstention, never a bare 8-digit number.
- Re-verify the 31/12/2027 FTA cliff before it becomes load-bearing in a schema or a migration plan.
- Revisit this ADR's sequencing if the owner stops being a daily user, or if a v1 feature ships whose errors he cannot detect.

## Related Knowledge

- [Project Context](../project-context.md)
- [Business Rules](../business-rules.md)
- [Tariff System](../concepts/tariff-system.md)
- [HS Classification](../concepts/hs-classification.md)
- [Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) — deferred, not built in v1
- [Data Sources](../concepts/data-sources.md)
- [Vietnamese Legal Documents](../concepts/vietnamese-legal-documents.md)
- [Customs Declaration Workflow](../workflows/customs-declaration.md)
- [Architecture Decisions README](README.md)
