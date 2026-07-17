---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../concepts/vietnamese-legal-documents.md
  - ../concepts/data-sources.md
  - ../concepts/legal-rag-retrieval.md
  - ../concepts/tariff-system.md
  - ../business-rules.md
  - ../project-context.md
---

# Use Published Văn Bản Hợp Nhất As The Text Layer; Do Not Compute Consolidation

## Status

Approved (owner approved 2026-07-17)

## Context

Vietnamese law is amended in place by other documents: a Nghị định says "sửa đổi Khoản 2 Điều 5", "bổ sung Điều 5a", "bãi bỏ cụm từ X tại Khoản 2". A base text read on its own is therefore actively wrong. The corpus inventory found the base text misleading in at least six logistics sub-domains, and current consolidated texts already exist for the ones we care about: 96/VBHN-VPQH (Luật Thuế XNK, 31/03/2026), 46/VBHN-BTC (NĐ 08/2015 on customs procedure), 24/VBHN-BCT (NĐ 69/2018 on ngoại thương), 52/VBHN-VPQH (Bộ luật Hàng hải), 56/VBHN-VPQH (Luật GTĐTNĐ), 08/VBHN-BGTVT (NĐ 08/2021) (verified 2026-07-17, source: research report 03 — Vietnamese logistics legal corpus inventory).

So the question is not "do we need consolidated text" — we do — but **who consolidates: the state, or us?** Building a text-mutation engine that applies amendment instructions to base text was the alternative on the table.

The historical objection to depending on published consolidation was legal, not technical: văn bản hợp nhất (VBHN) used to be a convenience document with no independent authority. You were formally obliged to cite the original plus each amending document, so a VBHN-based citation was not something a declarant could stand behind.

**That objection was removed two weeks before this decision.** Pháp lệnh 01/2026/UBTVQH16 (UBTVQH, issued 10/6/2026, effective 01/7/2026) amends the 2012 Pháp lệnh hợp nhất VBQPPL and states:

> "Văn bản hợp nhất được cơ quan, tổ chức, cá nhân sử dụng làm căn cứ chính thức trong viện dẫn và áp dụng pháp luật"

Consolidated texts are now an **official basis for citing and applying law**. The Ordinance also expands VBHN scope to provincial/commune VBQPPL (previously central agencies only), extends it to partial repeal / partial suspension / partial continuation of effect, and — for the first time in Vietnamese law on consolidation — names AI/digital transformation explicitly, with MOJ leading (verified 2026-07-17, sources: https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm · https://xaydungchinhsach.chinhphu.vn/van-ban-hop-nhat-duoc-su-dung-lam-can-cu-chinh-thuc-trong-vien-dan-va-ap-dung-phap-luat-119260625165619689.htm).

This ADR covers the **legal-text layer** (v1 evidence snippets for HS suggestion; later RAG). It does not cover the tariff numbers — see Scope.

## Decision

1. **Published VBHN is the primary text layer.** Where a current VBHN exists for a document we ingest, index the VBHN, not the base text. Base text is ingested only when no VBHN exists.
2. **We do not compute consolidation.** No component parses "sửa đổi Khoản 2 Điều 5" into a text mutation. Amendment instructions are stored as *data about* transitions, never executed as edits.
3. **We keep an amendment graph on top of the text layer**, holding provenance (which document changed which provision, when) and validity intervals per provision version.
4. **Citations are to a specific VBHN with its number and date** (e.g. "96/VBHN-VPQH, 31/03/2026"), because a VBHN is a snapshot and a citation without its date is unfalsifiable.
5. **Where no VBHN exists and the base text is known-amended, the system says so** rather than serving the base text as if current.

## Rationale

**Why published, not computed:**

- **Authority.** Citations inherit official standing under Pháp lệnh 01/2026/UBTVQH16 (above). A text we consolidated ourselves has no authority at all — if a declarant is challenged, "our engine merged the amendments" is not a defence. This is the whole point for an internal tool whose output ends up on a legally binding declaration.
- **The leading academic model also refuses to do it.** SAT-Graph RAG (Hudson de Martim, arXiv:2505.00039, Brazilian Constitution case study) is the most developed public temporal model for legislation — LRMoo-inspired Work/Expression split, Component Temporal Versions with validity intervals, point-in-time query as a deterministic interval predicate `tv.valid_start ≤ t < coalesce(tv.valid_end, +∞)`. It **"assumes the legal text corpus already contains these finalized versions"**; its amendment Action nodes *explain* transitions rather than *execute* them. If the most sophisticated structural approach available declines to parse amendment instructions into text mutations, that is a strong signal about the difficulty, not an oversight (verified 2026-07-17, source: research report 02, citing https://arxiv.org/abs/2505.00039).
- **The edge cases are unbounded and natural-language.** Vietnamese amendment instructions are irregular prose: "bổ sung Điều 5a", "bãi bỏ cụm từ X tại Khoản 2", "thay thế cụm từ...". A mutation engine has no closed grammar to implement against, no oracle to test against, and no authority to fall back on when it is wrong. Its failure mode is silent: plausible text, wrong law. That is the same failure shape the tariff research found in a 94%-"successful" parser that returned export duty for import questions (verified 2026-07-17, source: research report 12).

**Why VBHN alone is not enough** — the three gaps that force the amendment graph:

- **Coverage.** Not every văn bản has a current VBHN; publication lags amendment. Report 03's own recommendation is VBHN "wherever one exists" — the qualifier is the problem.
- **No temporal history.** A VBHN is a snapshot of "now". "Which rule applied on the declaration date in 2023?" cannot be answered from it. Temporal validity must be a **hard filter, not a ranking signal**: LLMs measurably apply outdated rules *and* prefer newer provisions when the older one applies, and RAG alone does not fix that recency bias (verified 2026-07-17, source: research report 02, citing arXiv:2605.23497, 312 validated German statutory QA pairs across five major LLMs). Scale of the problem: of 1,703 SBV documents, 863 fully repealed, 191 partially repealed, 639 effective — **~62% of a real Vietnamese corpus is dead or partly dead law** (source: SBV-LawGraph, ACIIDS 2026, https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).
- **Provenance.** "Which Nghị định changed this Khoản, and when?" is a question our users will ask, and no snapshot answers it.

**Why this is cheap to build:** vbpl.vn already exposes 27 typed bidirectional relations including `consolidated/consolidates`, `amended/amends`, `replaced/replaces`, `abrogated/abrogates` — the graph edges are published, not inferred (verified 2026-07-17, source: research report 04). The HF dataset `th1nhng0/vietnamese-legal-documents` carries 897,890 relationship rows and `tinh_trang_hieu_luc`, keyed on vbpl ItemIDs that the April 2026 site rebuild preserved — a graph skeleton for free (verified 2026-07-17, source: research report 04, verified against the HF datasets-server API).

**Efficiency pattern worth stealing from SAT-Graph:** a new parent version on date Dₙ is an *aggregation* that reuses the existing versions of unchanged children. We do not duplicate a whole Luật per amendment; only changed components get new versions.

## Scope

Applies to:

- The legal-text ingestion pipeline and its storage schema (text layer + amendment/validity graph).
- Evidence snippets returned with HS code candidates (v1 feature 2) — the verbatim legal note must come from a dated VBHN or a stated base text.
- Later RAG over Vietnamese logistics law.

Does **not** apply to:

- **Tariff rate numbers.** Those come from the deterministic tariff table keyed by HS + schedule + date, sourced from Công báo `.doc` gazette parts, not from VBHN prose. VBHN of a biểu thuế decree does not solve the annex trap or the gazette-lag gap — see [Tariff System](../concepts/tariff-system.md) and report 12.
- Any AI generation over the numbers. Unchanged by this ADR.

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| **Compute consolidation from amendment instructions** | Unbounded natural-language edge cases; no authority to fall back on; silent failure mode; SAT-Graph — the leading model — declines to do it. |
| **Serve base text + amending documents, let the user merge** | This is what the pre-01/7/2026 legal regime forced, and it is what staff already do by hand. It reproduces the manual work the tool exists to remove, and it is now unnecessary. |
| **Buy a commercial consolidated corpus (thuvienphapluat.vn)** | Their curated hợp nhất is real editorial work, but their robots.txt names ClaudeBot with `Disallow: /`, carries `Content-Signal: search=yes, ai-train=no, use=reference` as an express Art. 4 EU DSM reservation, and Cloudflare hard-blocks automated fetch anyway (verified 2026-07-17, source: reports 04 and 12). If we want it, we license it. Not a scraping decision. |
| **VBHN only, no amendment graph** | Fails on coverage gaps, has no temporal history, and cannot answer provenance. |

## Consequences

- Citations carry official standing (post-01/7/2026) instead of being our own reconstruction.
- We must track **VBHN freshness**, not just document existence: a stale VBHN is as wrong as a base text, and looks more authoritative.
- The ingestion pipeline needs a "no current VBHN" branch that degrades honestly rather than silently serving base text.
- Every provision version needs a validity interval, and retrieval must filter on it as a hard constraint before ranking.
- The graph loader **must tolerate broken edges**: vbpl reference targets can point at unpublished documents (e.g. Luật Thuế TNCN 2007, id 12898, referenced with `status:"Confirm_Step2"`, absent from the sitemap, page renders "Văn bản không tồn tại") (verified 2026-07-17, source: report 04).
- This decision does not reduce hallucination risk on its own. Grounding must still verify that the cited provision *supports the proposition*, not merely that it resolves — Lexis+ AI returned a real, correctly-formatted citation for opinions by a fictitious judge, i.e. "hallucination-free in a narrow sense" (verified 2026-07-17, source: Magesh et al., *Hallucination-Free?*, JELS 2025, https://doi.org/10.1111/jels.12413).

## Risks

- **VBHN publication lag.** Between an amendment taking effect and its VBHN appearing, our text layer is behind the law and we may not know it. Mitigation: the amendment graph gives us the signal (a new amending document with no corresponding VBHN update = a known-stale flag), but the window is real.
- **Overtrust in the new authority.** Pháp lệnh 01/2026/UBTVQH16 makes VBHN citable; it does not make any particular VBHN correct or current. The date on the citation is doing the work.
- **Undated VBHN citation.** If we ever emit "theo VBHN Luật Thuế XNK" without the number and date, we have created an unfalsifiable citation. Treat as a defect.

## Unverified / Do Not Rely On

- **The synthesis itself is a design inference, not a published result.** Report 02 tags "hợp nhất as the text layer + amendment graph as the provenance/temporal layer" as **[Speculative — my design inference, not a published result]**. The *legal change* (VBHN citable from 01/7/2026) is **[Established]**; the *architecture* is not.
- **SAT-Graph reports no quantitative evaluation.** It is an architecture proposal, not an empirical result, and despite its framing it implements **valid time only, not true bitemporality**. Adopt the data model; do not cite it as proof of performance (source: report 02).
- **SBV-LawGraph's numbers are directional, not definitive.** The authors themselves list: 100-QA eval set, **no ablation isolating the KG's contribution**, no KG quality audit, binary correctness with two annotators and no inter-annotator agreement reported.
- **Provision-level linking on vbpl is unconfirmed.** The Server Action payload exposes `referenceProvisions` and `provisionTree`, but both were `null` on every sampled document. Report 04 calls this "the highest-value open question" — if populated site-wide, it is a provision-level legal graph and changes our schema. **Test 10–20 recent documents before designing the schema.** Also unmapped: `referenceType` is an integer (saw `3`, `12`) and the int→label join was not recovered.
- **Reports 04 and 12 disagree about vbpl.vn crawlability, and the conflict is not fully resolved.** Report 12 found `Disallow: /Pages/` excluding every document URL (`vbpl.vn/.../Pages/vbpq-toanvan.aspx?ItemID=...`) and 404s on indexed URLs. Report 04, checking after the **2026-04-23 site rebuild**, found the `/Pages/` tree is the *dead legacy* portal and that `/van-ban/` is explicitly `Allow`ed, with ~158,826 sitemap URLs. Report 04 is later and more specific, and the reconciliation (12 tested legacy URLs) is plausible — but it is our inference, not something either report states. **Re-check robots.txt and one live document URL before any crawl.**
- **Report 03 flags F2:** a replacement decree for NĐ 69/2018 was drafted with a 01/07/2026 liberalisation date; issuance could not be confirmed. The existence of VBHN 24/VBHN-BCT (2026) implies 69/2018 is still live — implies, not proves. Verify directly before relying on that VBHN.
- **Report 03 flags F7:** the Thông tư layer was never enumerated; the Bộ GTVT→Bộ Xây dựng merger (01/03/2025) reissued an unknown number of `TT-BGTVT` circulars as `TT-BXD`. VBHN coverage over that layer is unknown.

## Review Requirements

- Verify every emitted legal citation carries a document number **and** a date.
- Verify the ingestion pipeline prefers VBHN and records *why* when it falls back to base text.
- Verify no component mutates statutory text. Grep for anything that applies "sửa đổi/bổ sung/bãi bỏ" instructions to a stored text body — its existence is a violation of this ADR.
- Verify temporal validity is applied as a filter before ranking, not as a ranking feature.
- Verify the graph loader survives dangling edges to unpublished documents.
- Re-verify the Pháp lệnh 01/2026/UBTVQH16 citation against Công báo before it appears in any user-facing or external material.

## Related Knowledge

- [Vietnamese Legal Documents](../concepts/vietnamese-legal-documents.md) — VBHN, hiệu lực, the document hierarchy
- [Data Sources](../concepts/data-sources.md) — vbpl.vn, Công báo, what is off-limits and why
- [Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) — structural chunking, hybrid retrieval, temporal filtering, grounding
- [Tariff System](../concepts/tariff-system.md) — why the numbers do not come from this text layer
- [HS Classification](../concepts/hs-classification.md) — the evidence snippets this text layer feeds
- [Business Rules](../business-rules.md)
- [Project Context](../project-context.md)
