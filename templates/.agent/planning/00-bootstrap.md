---
type: planning
status: active
updated: 2026-07-17
related:
  - ../project-context.md
  - ../concepts/tariff-system.md
  - ../concepts/data-sources.md
  - ../concepts/hs-classification.md
  - ../concepts/legal-rag-retrieval.md
  - ../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md
  - ../architecture-decisions/2026-07-17-hs-candidates-not-answers.md
  - ../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md
  - ../architecture-decisions/2026-07-17-customs-first-law-later.md
  - 01-task-list.md
---

# Bootstrap Plan

## Project

`Customs Assistant` — an internal tool for the customs-declaration desk of a Vietnamese logistics company (5–50 staff).

## Purpose Of This Note

This is the roadmap: what we build, in what order, and what each phase must prove before the next one starts. It is not a schedule. Durations are effort estimates for one developer, not commitments.

The ordering principle: **each phase must be usable by the declaration desk on its own.** We do not build a platform and then find a use for it. Phase 1 is useful with zero AI in it. If the project stops after Phase 1, the company still gained something.

## Project Context Source

`.agent/project-context.md` is the durable project brief. This note assumes it. Read it first.

## Repository Scope

One repository. NestJS monorepo, PostgreSQL with the `pgvector` extension, Docker Compose for local development. No Qdrant, Neo4j, MinIO, or BullMQ in v1 — see [Postgres only for v1](../architecture-decisions/2026-07-17-postgres-only-for-v1.md). No Zalo integration — plain internal web app, see [Web app not Zalo](../architecture-decisions/2026-07-17-web-app-not-zalo.md).

## Code Organization Baseline

NestJS has an established module convention. Follow it and document the mapping in [code-organization.md](../docs/code-organization.md). Feature logic lives inside its NestJS module boundary. No `utils`/`helpers`/`common` catch-alls.

## What This Project Is (Scope)

1. **Exact tariff lookup** — deterministic, keyed by HS code + schedule + date. No AI anywhere near the numbers.
2. **HS code candidate suggestion** — top-3 with verbatim legal-note evidence. A human decides.

Later, and only later: RAG over Vietnamese logistics law.

## Out Of Scope For v1

- Autonomous HS assignment. See [HS candidates, not answers](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md).
- VAT / SCT (TTĐB) / environmental protection tax (BVMT) calculation. TTĐB and BVMT are **not HS-keyed in Vietnamese law** — the statutory tables are by product category, not HS line (verified 2026-07-17, source: research 10, which confirmed this against the customs.gov.vn API: a TTĐB query returns rows like `"1. Thuốc lá điếu…"` with `MA_HS: None`). Any HS→category mapping we build is our own editorial inference and a liability surface. Not in v1.
- Anti-dumping / safeguard duties. These live in individual Bộ Công Thương decisions with no consolidated machine-readable register (verified 2026-07-17, source: research 10). For the archetypal query "steel from China", the tariff table is the *least* important number — but we are not solving that in v1, and the UI must not imply we have.
- Automatic C/O eligibility determination.
- Any writing to VNACCS/ECUS.

---

## Phase 0 — Foundation (~1 week)

**Goal:** a repository a second developer could clone and run, and three answered questions that change the design if answered wrong.

**Write the `.agent` knowledge notes BEFORE any code.** This is deliberate. The research behind this project contains 2026 facts that no model's training data has, and several of them invert what a reasonable person would assume (the "convenient" legal aggregators are blocked and legally hostile; the authoritative government gazette is wide open). An agent that starts coding from priors will build the wrong thing confidently. The notes are the guardrail.

Deliverables:

- NestJS monorepo skeleton.
- Docker Compose: Postgres + pgvector.
- Migration tooling wired and one migration applied.
- The `.agent/` notes written and cross-linked.

### The three open questions Phase 0 must resolve

These are not research busywork. Each one flips a design decision.

**1. Is the customs.gov.vn API reachable, and does it exist as described? — RESEARCH 10 AND 12 DIRECTLY CONTRADICT EACH OTHER. UNRESOLVED.**

This conflict is reproduced in full in the Unverified section below and in [tariff-system.md](../concepts/tariff-system.md). Summary of the disagreement:

- Research 10 reports it drove the page in Chrome, captured the XHR, and reproduced it with bare `curl` against `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue` — no auth, no captcha — returning MFN plus all FTA rates per HS line (verified 2026-07-17, source: research 10).
- Research 12 reports the portal is a JS shell whose `/scripts/main.js` hardcodes a *different* backend at `http://123.30.210.236:8080/hqcustomsapi/` — raw IP, plain HTTP, including a `CheckCaptcha` endpoint — and that this IP **timed out**. Research 12 explicitly declines to claim unreachability, saying it cannot distinguish geo-fencing from its own sandbox egress block (verified 2026-07-17, source: research 12).

The two reports describe different endpoints, so they may both be true — a `bridge` proxy on the main host and a separate raw-IP backend. Nobody has verified that. **Resolve empirically before designing anything around it.** If the API works, it becomes a cross-check. It never becomes the source of truth: it has no legal authority, is undocumented, unversioned, has no ToS grant, and research 10 itself found its FTA coverage stale (no VIFTA, no CEPA; `THOI_GIAN_CAP_NHAT` values of 2019–2020) (verified 2026-07-17, source: research 10). The Nghị định is the law; the API is a convenience.

**2. Are vbpl.vn's `provisionTree` and `referenceProvisions` fields ever populated?**

vbpl.vn was rebuilt on 2026-04-23; every existing scraper and public dataset targets a site that no longer exists (verified 2026-07-17, source: research 04). Its Server Action JSON carries `references[]` with a `referenceProvisions` field and a `provisionTree` field — both `null` on the two documents research 04 sampled. It could not verify whether they are ever populated (verified 2026-07-17, source: research 04). If they are populated site-wide, that is a provision-level (điều/khoản) legal graph, which research 04 calls "the whole ballgame" for the eventual RAG phase. Test 10–20 recent documents. This does not block Phase 1 — vbpl is not a tariff source — but it determines the Phase 5 schema, and it is cheap to answer now.

**3. Does table-aware DOCX parsing close the gap research 12 left open?**

This is the one that blocks Phase 1, and it is the single most important technical question in the project right now.

Research 12 extracted 11,874 unique 8-digit HS codes from the Công báo `.doc` parts of Nghị định 26/2023/NĐ-CP using macOS `textutil`, and the annex tables came out cleanly, one cell per line (verified 2026-07-17, source: research 12). But on the EVFTA decree (Nghị định 116/2022/NĐ-CP) `textutil` collapsed a table row into a single line and produced this:

```
2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9
```

That is six annual rates — `29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9` — concatenated with **no delimiter**, in a decimal-comma locale. Unrecoverable without heuristics. Research 12 is explicit that it is **inferring, not asserting**, that this is a `textutil` artifact: RCEP (Nghị định 129/2022/NĐ-CP) has the identical six-year column structure and extracted perfectly, which suggests a real table-aware parser reading `w:tbl/w:tr/w:tc` from the XML would fix it. It could not prove this — no `soffice`, `antiword`, or `python-docx` was available in that environment. It names this as "the one gap a builder must close before trusting anything" (verified 2026-07-17, source: research 12).

Close it: LibreOffice `.doc` → `.docx`, then `python-docx` (or equivalent) reading table cells structurally. Prove it on the exact EVFTA row above. If a real parser also fails to separate those six rates, Phase 1's scope shrinks to MFN only and FTA schedules need a different approach entirely.

---

## Phase 1 — Tariff lookup, no AI (~1–2 weeks)

**Goal:** the declaration desk can look up a rate and trust it. Usable the day it ships.

There is no model in this phase. See [No LLM on tariff numbers](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md). A tariff rate is a fact with a legal source, not a generated token.

### Source of truth: Công báo `.doc`

**Primary source is `congbao.chinhphu.vn`**, and the reasoning matters more than the choice:

- It is **authoritative**. Công báo is the publication of record; the `_signed` versions are the legally published text (verified 2026-07-17, source: research 04).
- It is **robots-permissive**: `robots.txt` is `User-agent: * / Allow: /`, no Cloudflare, no JS required — plain `curl` returns server-rendered HTML (verified 2026-07-17, source: research 04 and research 12, independently).
- It has **real Word tables**. Research 12 extracted 11,874 unique 8-digit HS codes from its 14 `.doc` parts for ND 26/2023 (verified 2026-07-17, source: research 12).

What we are *not* using, and why — this inverts the obvious assumption:

- **chinhphu.vn PDFs are scans.** Research 12 downloaded both PDFs of ND 26/2023 and inspected the internals: producer string `Kodak Alaris Inc.`, exactly one `/CCITTFaxDecode` bilevel image per page, 1666×2329 px ≈ 200 DPI bitonal, and `26-nd-2.pdf` contains **zero `/Font` objects** — no text layer at all. 1,016 pages of pure fax-compressed scan, at a DPI below the 300 normally wanted for dense numeric tables with Vietnamese diacritics (verified 2026-07-17, source: research 12, `datafiles.chinhphu.vn/cpp/files/vbpq/2023/6/26-nd.signed.pdf` and `26-nd-2.pdf`).
- **vbpl.vn is not a tariff source** and its `robots.txt` disallows `/Pages/`, which is exactly where the legacy corpus lived (verified 2026-07-17, source: research 12). The rebuilt site allows `/van-ban/` (verified 2026-07-17, source: research 04) — relevant for Phase 5, not here.
- **thuvienphapluat.vn: do not scrape.** 403 via Cloudflare; `robots.txt` names `ClaudeBot` with `Disallow: /`; `Content-Signal: search=yes, ai-train=no, use=reference`, framed as an express reservation of rights under Article 4 of EU Directive 2019/790. Its Excel tariff files are a commercial product (verified 2026-07-17, source: research 04 and research 12). This is the worst-liability source, not the shortcut it appears to be.

Research 12 states the irony plainly, and it is worth internalizing: **the two "convenient" aggregators are both technically blocked and legally hostile, while the authoritative primary source is wide open and has strictly better data.**

The customs.gov.vn API, **if and only if** Phase 0 proves it reachable, is a **cross-check**: a second opinion that disagrees loudly when our parse is wrong. Not a source.

### Annex-aware parsing is a hard requirement, not a nicety

This is the single most important correctness constraint in Phase 1, and it earns that status from a measured failure.

Research 12's first naive parse reported **94% success and was confidently wrong**. Tracing `0301.11.10`:

- **Phụ lục I (Biểu thuế xuất khẩu)** → `0301.11.10 = 0`
- **Phụ lục II (Biểu thuế nhập khẩu ưu đãi)** → `0301.11.10 = 15`

**1,520 HS codes appear in both annexes; 1,329 of them have different rates.** A parser that ignores annex boundaries returns the **export** rate for an **import** question — silently, with no error, at 94% apparent success (verified 2026-07-17, source: research 12).

Research 12's own summary of what this means for the whole project category: *"not missing data, but plausible-looking wrong data"* — and the parser fails **while reporting success**. Every row we ingest must carry the annex it came from as a first-class field. A row without a known annex is not ingested.

Annex structure of ND 26/2023 as extracted (verified 2026-07-17, source: research 12):

| Annex | Content | Unique HS | With rate |
|---|---|---|---|
| Phụ lục I | Biểu thuế xuất khẩu | 1,520 | 1,471 (96.8%) |
| Phụ lục II | Biểu thuế nhập khẩu ưu đãi (MFN) | 11,874 | 11,160 (94.0%) |
| Phụ lục III | Absolute/mixed duty (used cars) | — | 0 — USD amounts, not % |
| Phụ lục IV | Out-of-quota TRQ rates | — | 0 — separate structure |

Phụ lục III and IV returning zero to a `%` regex is not a parser bug; it is the data telling you those annexes are a different shape. Model them as such or exclude them explicitly.

### Temporal model: as-of, not "latest"

Research 12's central finding is that the hard problem is not acquisition — it is legal currency. Three compounding facts, all verified:

1. **Zero lead time.** Nghị định 72/2026/NĐ-CP was **signed 2026-03-09 and effective the same day** ("kể từ ngày ký"), cutting petrol/naphtha/reformate from 10% to 0% (verified 2026-07-17, source: research 12).
2. **Gazette lag exceeds the effect date.** That same decree was published in Công báo số 157 on **2026-03-24 — 15 days after it was already binding law.** (ND 26/2023: signed 2023-05-31, gazetted 2023-06-19, ~19 days. EVFTA ND 116/2022: signed 2022-12-30, gazetted from 2023-02-16, ~48 days.) **There is a multi-week window in which the legally-in-force rate exists in machine-readable form nowhere — only as a 200-DPI scan** (verified 2026-07-17, source: research 12).
3. **Decrees expire and silently revert.** ND 72/2026 was valid **only until 2026-04-30** — a 52-day window — after which rates revert to ND 26/2023. A "scrape the latest version" design has no concept of this. It would serve 0% petrol forever (verified 2026-07-17, source: research 12).

Therefore: `effective_from` / `effective_to` are first-class, the query takes an as-of date, and the system **refuses or warns when its snapshot may be stale** rather than guessing. See [Bitemporal validity from day one](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md).

Also model HS version as a dimension with validity dates — do not hardcode AHTN 2022. HS 2028 takes effect 2028-01-01 (verified 2026-07-17, source: research 10, citing WCO; corroborated by research 09 citing the 75th HSC session, April 2025). Research 10 additionally warns that essentially the entire FTA decree corpus expires 2027-12-31, colliding with the AHTN 2028 switch — a total corpus replacement roughly 18 months out (verified 2026-07-17, source: research 10). Research 12 flags the same 2027 cliff but marks it **inferred, not verified**.

### API contract

```
GET /tariff?hs=<8-digit>&origin=<country>&date=<YYYY-MM-DD>
```

Returns: rate + governing decree + as-of date + conditions.

The `conditions` field is not decoration. Research 12 is emphatic that `(HS, country) → rate` **is not even a function**:

- **MFN vs FTA is conditional, not automatic.** RCEP Điều 4 requires origin rules *plus a valid certificate of origin*. "The tax is 0%" is wrong; "0% *if* you hold a valid C/O, else 15% MFN" is right (verified 2026-07-17, source: research 12).
- **RCEP Điều 6.2 has a highest-rate rule** across annexes for certain multi-origin goods — verified verbatim in the decree text: *"Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."* (verified 2026-07-17, source: research 12).
- **`*` means excluded, not zero.** Research 12 found 54 `*` cells in a single RCEP gazette issue (verified 2026-07-17, source: research 12).
- **TRQ goods** (headings 04.07, 17.01, 24.01, 25.01, verified in the ND 129/2022 text) depend on quota status; out-of-quota rates live in a different annex (verified 2026-07-17, source: research 12).

So the response must be able to say "conditional", and the UI must show the condition. An unconditional number would be a lie.

### Done when

- **A real shipment's rate matches ECUS.** Not a test fixture — an actual declaration the desk filed.
- **20 randomly sampled HS codes reconcile by hand.** Randomly sampled, not hand-picked. Hand-picked samples confirm the parser you wrote; random samples find the annex bug.

---

## Phase 2 — HS candidates with evidence (~3–4 weeks)

**Goal:** given a goods description, return three candidate codes, each with the verbatim legal text that supports it, so a human can decide faster and defend the decision later.

### Why candidates and not answers

The numbers make this case without hand-waving (all verified 2026-07-17, source: research 09):

| System | Accuracy |
|---|---|
| Human experts (HSCodeComp, 10-digit) | **95.0%** |
| Best autonomous agent (SmolAgent + GPT-5 VLM) | 46.8% |
| GPT-5, LLM only, no tools | 29.0% |
| Korea Customs Service — **top-3 at 6-digit, with evidence** | **93.9%** |
| Deterministic agentic workflow — top-3 at 6-digit | 78.3% |
| Deterministic agentic workflow — top-3 at 4-digit | 91.5% |

Sources: [HSCodeComp, arXiv:2510.19631](https://arxiv.org/html/2510.19631); [KCS, arXiv:2311.10922](https://arxiv.org/abs/2311.10922); [Deterministic Agentic Workflow, arXiv:2605.14857](https://arxiv.org/html/2605.14857).

Research 09's conclusion: *"The gap between 47% and 93.9% is not model capability — it's output contract."* The KCS system was evaluated on 5,000 recent classification requests across 925 difficult subheadings, and a user study with 32 customs experts confirmed the suggestions plus explanations substantially reduced review time. Top-3 + evidence + human decides is a shippable product. Top-1 autonomous is not.

The danger is specific and it is why this phase has a hard gate. Research 09: errors are overwhelmingly **"Error but Valid"** — the model outputs a real, legitimate-looking HS code that is wrong. **There is no syntactic signal of failure.** No exception, no parse error, no red flag. It flows into VNACCS, gets accepted, and surfaces three years later as a post-clearance audit. Under Nghị định 128/2020/NĐ-CP (amended by 102/2021/NĐ-CP): 20% of the shortfall if customs finds it, plus full back-assessment (truy thu) plus late-payment interest at 0.03%/day, plus loss of FTA preference and retroactive anti-dumping exposure (verified 2026-07-17, source: research 09).

And the liability is entirely the declarant's. Research 09, quoting practitioner commentary: *"An AI tool that produces a plausible-looking ten-digit number is not reasonable care."* "The platform told me the HS code" is not a defence.

### Data to ingest

- **Chapter and section notes** — Thông tư 31/2022/TT-BTC, still the operative nomenclature in 2026 (verified 2026-07-17, source: research 09 and research 10). Phụ lục II of TT 31/2022 carries the 6 general interpretation rules. Structure: 21 sections / 97 chapters / 1,228 four-digit headings / 4,084 six-digit subheadings / 11,414 eight-digit lines (verified 2026-07-17, source: research 10).
- **SEN 2022** — circulated by Công văn 3866/TCHQ-TXNK (2023-07-24), PDF only (verified 2026-07-17, source: research 09, [PDF](https://thuvienxuatnhapkhau.com/wp-content/uploads/2023/07/3866_Chu-giai-SEN-2022.pdf)). Note SEN is **not independently binding** — an argument resting on SEN that contradicts the WCO Explanatory Notes is legally weak (verified 2026-07-17, source: research 09). Label evidence by its authority tier; do not present SEN as if it were a chapter note.

### Pipeline shape

Structured, not agentic. Research 09 on the deterministic agentic workflow paper: it rejects autonomous agents, uses a **fixed pipeline whose control flow is dictated by the tariff hierarchy itself** rather than discovered by the LLM at runtime, and **pre-compiles GRI and chapter/section notes offline into typed clauses — inclusions, exclusions, priority rules** — loading the expensive chapter-note context only at the stage that needs it. It reaches roughly **2× the best autonomous agent** on the same benchmark (verified 2026-07-17, source: research 09).

So: chapter → heading → subheading as **separate stages**. Chapter notes pre-compiled offline into typed inclusion/exclusion/priority clauses. Do not dump the nomenclature into a prompt.

Three findings from research 09 that should kill the obvious shortcuts before someone tries them:

- **Test-time scaling does not help here.** Majority voting and self-reflection gave negligible gains on HSCodeComp — unlike other reasoning domains.
- **Giving the model explicit human-written decision rules *decreased* performance for most systems.** More prompt-stuffed rules ≠ better. This is why the rules get compiled into typed clauses and used as control flow, not pasted into context.
- **A 27B open-weight model reaches 84.2% (4-digit) / 77.4% (6-digit) agreement with the frontier model** in the structured pipeline. Most of the pipeline does not need a frontier model.

The diagnosis of why end-to-end prompting fails, worth carrying: it *"fails characteristically by resolving one axis while ignoring the priority constraints on the others"* (material vs function vs form must be resolved in the right order).

### Design constraints that are not negotiable

- **Every candidate cites its authority verbatim.** Quote the chapter note / section note / SEN entry — do not paraphrase. Research 09: this is what the KCS study proved delivers the value — *not the prediction, the evidence retrieval*. It is also the only defensible artifact when a Chi cục Hải quan khu vực challenges the code; it becomes the hồ sơ.
- **Never put the user's preferred code into the prompt as a premise.** Research 09 flags confirmation-bias amplification as the failure an LLM is most prone to and the one with the worst legal consequences — *"if you want your HTS to be X (even if the correct HTS is Y), AI will give you an argument (or three) to support your preferred HTS"*. It manufactures the paper trail for a trốn thuế characterization. The model is a sycophantic advocate, not a judge.
- **Abstain loudly.** The highest-value output on a hard good is "these two headings both plausibly apply, here are the competing notes, this needs xác định trước mã số." Routing to the Điều 28 advance-ruling process is a **feature**, not a failure — it is the only mechanism that produces legal certainty in Vietnam (verified 2026-07-17, source: research 09).

### Done when — and this is a hard gate

- **Top-3 ≥ 80% on the golden set.**
- **Every candidate carries a checkable verbatim citation.**

**If top-3 < 80%, do not ship.** Not "ship with a disclaimer." Do not ship. A wrong HS tool is worse than no HS tool, because it manufactures false confidence in exactly the place where the errors are invisible — "Error but Valid" means the staff member cannot tell a wrong answer from a right one without redoing the whole job, which is the job the tool claimed to save.

---

## Phase 3 — Web UI + internal auth (~1 week)

Internal users only. Plain web app. The UI's main job is honesty: show the governing decree, the as-of date, the annex, the conditions, and the staleness state. A number without its source is not shippable output in this project.

---

## Phase 4 — Policy / permit alerts (~2–3 weeks, HIGH RISK)

**Goal:** tell the declarant that a shipment needs a licence, an inspection, or hits a prohibition — before they file.

**This phase is high risk and the estimate is the least trustworthy in this document.** The reasons are structural (all verified 2026-07-17, source: research 08):

- **No API anywhere.** VNTR (`vntr.moit.gov.vn`) and the Vietnam Trade Portal both *internally* model commodity ↔ measure ↔ procedure relationships, but neither exposes it — web UI only, no bulk export. VNSW has no public API and the connection mechanism "has not been fully regulated." eCoSys has no public API.
- **The ground truth is PDF/Word annexes attached to ministry circulars.** There is **no single master list**. Each ministry publishes its own "bảng mã số HS" circular. That is the join key, and it must be assembled from ~6 ministries separately.
- **The ministries themselves moved in 2025.** Bộ NN&PTNT + Bộ TN&MT → **Bộ Nông nghiệp và Môi trường** (operational 2025-03-01). Bộ GTVT + Bộ Xây dựng → **Bộ Xây dựng**. Bộ TT&TT + Bộ KH&CN → **Bộ Khoa học và Công nghệ**. Circular prefixes changed: `TT-BNNPTNT` → `TT-BNNMT`. **A code table keyed on ministry name breaks here.** Model ministries as entities with aliases and validity ranges.
- **Not everything keys on HS.** CITES keys on **species** — HS code alone cannot determine CITES applicability. Phế liệu keys on HS **plus a firm-level giấy phép môi trường**. The post-Luật 78/2025 quality regime keys on **risk tier**. An HS-only data model is structurally insufficient.

The cautionary tale that justifies the temporal model, verified end to end: **Nghị định 46/2026/NĐ-CP** (2026-01-26) was issued to replace ND 15/2018 on food safety; **Nghị quyết 09/2026/NQ-CP** (2026-02-04) **suspended it barely a week later**; the suspension was then extended until the amended Food Safety Law takes effect. **ND 15/2018 therefore remains operative today.** A decree can be law-on-paper, superseded, suspended, and un-suspended within 10 weeks (verified 2026-07-17, source: research 08). Every rule needs an `as_of` date and a status field, not just a citation.

**Start with Bộ Công Thương only.** One ministry, one set of annexes, prove the shape, then decide whether the remaining five are worth it. Do not attempt six ministries at once.

---

## Phase 5+ — Legal RAG (only after customs runs for real)

Do not start this until Phases 1–3 have been in daily use by the desk. See [Customs first, law later](../architecture-decisions/2026-07-17-customs-first-law-later.md).

What the research already tells us, so the eventual design does not start from zero (all verified 2026-07-17, source: research 02):

- **Chunk by structure — index per Khoản, return the parent Điều.** The German BGB study (2,455 sections, 525 questions with section-level gold labels, 21 strategies compared, [arXiv:2605.19806](https://arxiv.org/pdf/2605.19806)) measured Recall@10: subsection 0.47, section 0.46, sentence 0.45, best fixed-size 0.37, worst fixed-size 0.31. **Structural beats fixed-size decisively; Điều vs Khoản as the index unit is statistically a wash.** What matters is not cutting across structural boundaries. This is why "chunk by Điều" as a bare instruction is useless — the reason is that legal meaning is bounded by the structure, and fixed-size windows sever it.
- **Skip LLM-based chunking.** Same study: Lumber took 9h–11h41m to build and RAPTOR 3h–5h51m, versus **51 seconds** for section chunking — for *worse* recall (0.37 and ~0.40 vs 0.46). A useful negative result against the "throw an LLM at chunking" reflex.
- **Absolute recall is ~0.47 even for the winner.** Chunking is table stakes, not where legal RAG is won.
- **Document-Level Retrieval Mismatch is the top failure** — right-looking chunk, wrong văn bản — observed **exceeding 95% on some datasets** ([arXiv:2510.06999](https://arxiv.org/html/2510.06999v1)). Prepending a ~150-char document-level summary to each chunk roughly halved it. Highly relevant to Vietnamese law, where "Điều 5. Giải thích từ ngữ" is near-textually-identical across hundreds of văn bản.
- **Hybrid BM25 + dense, weighted by how adapted your embedding is.** Out-of-the-box dense **loses** to BM25 on Vietnamese legal text (SBV-LawGraph: BM25 R@1 0.57 vs naive dense 0.36; their hybrid is 75% BM25 / 25% semantic). Fine-tuned dense **beats** BM25 decisively (TVPL: BM25 MRR@10 21.60 vs fine-tuned ColBERT 74.61). These are the same finding from two sides — do not copy a weight ratio from a paper whose embedding model you are not using.
- **Treat temporal validity as a hard filter, not a ranking signal** ([arXiv:2605.23497](https://arxiv.org/abs/2605.23497)). Models exhibit recency bias — preferring newer provisions even when the older version applies — and **RAG alone does not fix it**. SBV-LawGraph's corpus: of 1,703 documents, 863 fully repealed, 191 partially repealed, 639 effective — **~62% dead or partly dead law**.
- **Use published văn bản hợp nhất; do not compute consolidation.** As of **2026-07-01**, Pháp lệnh 01/2026/UBTVQH16 (issued 2026-06-10) makes consolidated texts an official basis for citing and applying law: *"Văn bản hợp nhất được cơ quan, tổ chức, cá nhân sử dụng làm căn cứ chính thức trong viện dẫn và áp dụng pháp luật"* (source: [congbao.chinhphu.vn](https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm)). The legal objection that would have blocked a hợp nhất-based architecture was removed weeks ago. See [Use published VBHN, not computed consolidation](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md).
- **Ground citations by entailment, not existence.** Magesh et al., *Journal of Empirical Legal Studies* 2025 ([doi:10.1111/jels.12413](https://doi.org/10.1111/jels.12413)) — first preregistered evaluation, 202 queries: Lexis+ AI 65% accurate and hallucinates >17%; Westlaw AI-Assisted Research 42% accurate, hallucinates >34%. Their "Wilgarten" example is the design lesson: asked for opinions by a **fictitious judge**, Lexis+ AI returned a **real case with a real, correctly-formatted citation** — not written by that nonexistent judge. **"Every citation resolves to a real document" is a worthless guarantee** — it is exactly what vendors market and exactly what fails.

---

## Confirmed Requirements

- Deterministic tariff lookup keyed by HS + schedule + date, with the governing decree and as-of date in every response.
- HS candidate suggestion as top-3 with verbatim legal-note evidence; the human decides.
- Internal web app, 5–50 staff, no Zalo.
- NestJS + PostgreSQL/pgvector + Docker.
- All documentation in English (per [AGENTS.md](../AGENTS.md)); owner communication in Vietnamese.

## Assumptions

- **The desk's own past declarations are available and their HS codes are known-correct enough to serve as a golden set.** If the desk's historical codes are themselves contested, the Phase 2 gate measures agreement with past practice, not correctness. Flag to the owner before building the golden set.
- **ECUS output is available as the Phase 1 ground truth for at least one real shipment.** Phase 1's acceptance criterion depends on this.
- **Công báo remains robots-permissive and keeps publishing `.doc` alongside PDF.** Verified today; not guaranteed.
- **The Công báo tokenized download links (`g7.cdnchinhphu.vn/api/download/stream`) remain usable in bulk.** Research 12 downloaded 14 parts successfully (verified 2026-07-17, source: research 12); sustained-rate behaviour is untested.
- **Five to fifty staff means a single Postgres instance is sufficient.** Nothing in the research contradicts this; it is a scale assumption, and it is reversible.
- **Research 12's parser correctness generalizes.** Its table validated independently: it extracted `2710.12.21/.22/.24/.25/.80 = 10%` from ND 26/2023, and press reporting of ND 72/2026 independently describes it as cutting those exact codes *"từ 10% xuống 0%"* (verified 2026-07-17, source: research 12). That is one cross-check on one commodity family, not a proof over 11,874 rows. The 20-random-sample criterion exists because of this.

## Open Questions

1. **Is the customs.gov.vn API reachable?** Research 10 and 12 contradict. Unresolved — see Phase 0.
2. **Are vbpl `provisionTree` / `referenceProvisions` populated?** Null on both sampled documents. Determines the Phase 5 schema.
3. **Does table-aware DOCX parsing recover the EVFTA six-rate row?** Blocks Phase 1 scope.
4. **Which FTA schedules does the desk actually use?** ~26 import schedule codes exist per research 10's discovery call, but this company will use a handful. Ask the owner rather than ingesting all of them.
5. **Are the desk's historical HS codes trustworthy as ground truth?** See Assumptions.
6. **What is the consolidation baseline for 2026 MFN?** Research 10 states there is **no official văn bản hợp nhất published as machine-readable data**, and that correct 2026 MFN = ND 26/2023 ⊕ 199/2025 ⊕ 72/2026 ⊕ 201/2026 ⊕ 108/2025 (verified 2026-07-17, source: research 10). Research 12 gives a partially different chain (144/2024, 199/2025, 72/2026). **The two lists do not match and neither is confirmed complete.** Establish the real chain from Công báo before ingesting.

## Risk Areas / Unknowns

- **The temporal gap is unclosable by engineering.** During the 15–48 day window between signature and gazette publication, the binding law exists publicly only as a 200-DPI scan. No crawl schedule fixes this. The system must *know* it is possibly stale and say so. This is the risk that most deserves the owner's attention, because the mitigation is a product decision (refuse / warn), not a technical one.
- **A wrong rate is a legal liability carried by the declarant, not by this tool.** Research 12: customs declarations are legally binding; a wrong rate means underpayment → back-assessment, penalties, and the declarant carries it.
- **The 94%-success parser that returns export duty for import queries is what this project looks like when it fails — and it fails while reporting success.** Success metrics must be adversarial, not confirmatory.
- **HS ground truth is itself contestable.** An audit of 226 disagreements found **~42.5% of "wrong" model predictions were actually better supported by HS rules than the published ground truth** (verified 2026-07-17, source: research 09, [arXiv:2605.14857](https://arxiv.org/html/2605.14857)). And 76% of Vietnamese enterprises reported obstacles confirming HS codes, up from 66.3% in 2018. There is often no stable single right answer.
- **Institutional churn.** Tổng cục Hải quan ceased to exist on 2025-03-01 (Nghị định 29/2025/NĐ-CP); it is now Cục Hải quan under Bộ Tài chính with 20 Chi cục Hải quan khu vực. Documents are now `-CHQ`, not `-TCHQ` (verified 2026-07-17, source: research 09). Any document-number parsing must handle the break.
- **VNACCS/VCIS is scheduled for replacement** by the "Hải quan số" system, targeted 2026-12-31 (verified 2026-07-17, source: research 08). Anything built against VNACCS message formats has a ~18-month shelf life. v1 does not touch VNACCS, which is partly why.
- **The 2027-12-31 FTA cliff + AHTN 2028**, roughly 18 months out. Research 10 verifies the expiry dates; research 12 marks the "they all expire together" framing as **inferred**.

## Validation Plan

| Phase | How it proves itself |
|---|---|
| 0 | Repo clones and runs clean on a second machine. Each of the three open questions has a written answer with evidence, or an explicit "still unknown" with what was tried. |
| 1 | A real shipment's rate matches ECUS. 20 **randomly sampled** HS codes reconcile by hand. Annex provenance present on every ingested row. A query with a stale-snapshot date returns a warning, not a confident number. Cross-check against customs.gov.vn API **if** Phase 0 proved it reachable — disagreements investigated, not averaged. |
| 2 | Top-3 ≥ 80% on the golden set built in TASK-001. Every candidate carries a verbatim citation that a human can check against the source text. Below 80% → do not ship. |
| 3 | The desk uses it for a week without asking anyone how to read the output. Governing decree and as-of date visible on every result. |
| 4 | One ministry (Bộ Công Thương) end to end, with `as_of` + status on every rule. Re-verify against the ND 46/2026 suspension case: does the model represent "issued then suspended" correctly? |
| 5+ | Not planned in detail. Do not plan it until Phase 1–3 are in daily use. |

## Unverified / Do Not Rely On

Reproduced from the research. Do not launder any of these into confident claims.

**CONTESTED — research 10 vs research 12 on customs.gov.vn.** The core conflict of this project's data strategy, **unresolved**:

- Research 10 claims a **verified working** endpoint: `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`, reproduced with bare `curl`, no auth, no captcha, no Referer/Origin check, returning ~510 rows for `l_param: "8703"` and one column per tariff regime. It states the on-page captcha is client-side only and not enforced by the API.
- Research 12 found a **different** backend hardcoded in `/scripts/main.js` — `http://123.30.210.236:8080/hqcustomsapi/`, raw IP, plain HTTP, port 8080, including `.../hqcustomsapi/captcha/CheckCaptcha` — and **that IP timed out**. It explicitly refuses to claim unreachability, saying it cannot distinguish geo-fencing from a sandbox egress block.

They may both be true (different endpoints) or one may be mistaken. **Nobody has resolved this.** Present both to anyone who asks. Do not design around either until Phase 0 answers it. Even under research 10's account, its own caveats stand: stale FTA coverage (no VIFTA, no CEPA; `THOI_GIAN_CAP_NHAT` 2019–2020), current-year rates only with no forward-year series, `l_bieu_thue` apparently ignored for import queries, undocumented/unversioned/no SLA/no ToS grant, and rate limiting **not probed**.

Other flags carried forward:

- **The EVFTA six-rate concatenation is a `textutil` artifact — INFERRED, NOT PROVEN.** Research 12 could not test a real table-aware parser. If the inference is wrong, Phase 1 FTA scope changes.
- **The "all 2022-batch FTA decrees expire together on 2027-12-31" framing is INFERRED** by research 12, though research 10 verifies the individual expiry dates from two independent sources. Note research 10 also flags that **AJCEP (ND 120/2022) and VJEPA (ND 124/2022) run to 2028**, not 2027 — so "they all expire together" is already imprecise.
- **Nghị định 128/2022/NĐ-CP may not be an FTA tariff decree at all.** Research 10: both its sources skip it; do not assume a contiguous 112–129 range.
- **data.gov.vn / open.data.gov.vn — CONTESTED.** Research 10 got DNS failure and flagged it "unverified, not confirmed-dead." Research 04 went further: authoritative DNS says **NXDOMAIN** from the `gov.vn` zone via both 8.8.8.8 and 1.1.1.1, with controls resolving fine, concluding it **does not exist** and that search engines are wrong about this. Research 04's evidence is stronger, but the two do not formally agree. Either way: no national open-data API for legal documents.
- **Quyết định 117/QĐ-CHQ (2026)** — research 09 could not fetch the full text (paywall/403); marks its detail **medium confidence**. Its "unified sector-wide classification database" is an **internal** system; do not assume it will ever be exposed.
- **Claims that "Claude 3.5 Sonnet and GPT-4 achieve ~80% at 6-digit and >90% at 2-digit"** — research 09 found this in a search snippet with no traceable primary source, and it **contradicts HSCodeComp**. Do not rely on it.
- **"1 in 3 customs entries is misclassified"** — vendor-blog claim, no primary citation. Directionally plausible, unsourced.
- **Vendor accuracy claims are ~2× their independently benchmarked performance.** Zonos advertises "90%+ out of the box"; independent testing put it at **44.1% at 10-digit**. Avalara's 80% comes from a product that **explicitly includes human expert review**. Note the benchmark is small (n=103) and US-HTS-specific (verified 2026-07-17, source: research 09, [arXiv:2412.14179](https://arxiv.org/html/2412.14179v1)).
- **vbpl gateway routes** (`vbpl-bientap-gateway.moj.gov.vn/api`) — found, reachable, **unmapped**. `referenceType` int → label mapping unknown (saw `3`, `12`).
- **Sustained-rate crawl behaviour on vbpl is untested** — research 04 made only ~40 requests. Not evidence of no throttling at 158k scale.
- **Research 08's explicitly unverified list** carries into Phase 4 wholesale: TT 15/2026/TT-BCT, TT 26/2026/TT-BCT, VBHN 47/VBHN-BCT (single low-confidence extraction); ND 169/2026/NĐ-CP and ND 153/2026/NĐ-CP (single search summary, **numbering suspicious**); VBHN 67/VBHN-BNNMT (single source); whether a BNNMT circular has replaced TT 01/2024/TT-BNNPTNT; the current VNSW procedure count (best figure is from 2022). And **"danh mục hàng hóa nhóm 2 is eliminated from 2026"** under Luật 78/2025 — **contested, load-bearing for any rules engine, and resting on a single commercial source.** Verify against the statute before building.
- **SAT-Graph reports no quantitative evaluation** — adopt the data model, do not cite it as proof of performance. **SBV-LawGraph** has a small eval set (100 QA pairs), no ablation isolating the knowledge graph's contribution, and no inter-annotator agreement reported. Directional, not definitive.
- **No published comparison of commercial embeddings (OpenAI/Voyage) against Vietnamese-specific models on Vietnamese legal text exists.** Research 02 looked and states the benchmark does not exist. If that choice matters in Phase 5, we run it ourselves.

## Reuse Check

- Existing helpers, modules, or patterns searched: repository contains `.agent/` notes only; no application code yet.
- Existing code to reuse or extend: none.
- New modules needed: tariff ingestion, tariff lookup, HS candidates. Justified — nothing exists.
- Reason existing code is insufficient: greenfield.

## Success Criteria

The declaration desk uses Phase 1 for real work and stops opening the Excel tariff file. Everything after that is upside.

## Bootstrap Decisions

Recorded as ADRs in [architecture-decisions/](../architecture-decisions/):

- [No LLM on tariff numbers](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)
- [HS candidates, not answers](../architecture-decisions/2026-07-17-hs-candidates-not-answers.md)
- [Bitemporal validity from day one](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md)
- [Customs first, law later](../architecture-decisions/2026-07-17-customs-first-law-later.md)
- [Postgres only for v1](../architecture-decisions/2026-07-17-postgres-only-for-v1.md)
- [Web app not Zalo](../architecture-decisions/2026-07-17-web-app-not-zalo.md)
- [Use published VBHN, not computed consolidation](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md)

## Next Action

The owner approved this plan and the seven ADRs on 2026-07-17.

Start [01-task-list.md](01-task-list.md) at TASK-001 — the golden set. It comes before any retrieval code.

⚠️ **The golden set requires the owner, not an agent.** It is 30–50 questions from their own declarations with answers they already know to be correct. Nobody else can write it, and nothing downstream can be trusted without it.

## Related Knowledge

- [Project Context](../project-context.md) — what this project is and who it serves
- [Task List](01-task-list.md) — concrete Phase 0 + Phase 1 tasks
- [Tariff System](../concepts/tariff-system.md) — schedule structure, the annex trap, the temporal gap
- [Data Sources](../concepts/data-sources.md) — Công báo vs chinhphu.vn vs vbpl vs the aggregators
- [HS Classification](../concepts/hs-classification.md) — GRI, accuracy benchmarks, penalties, advance rulings
- [Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) — chunking, hybrid search, temporal filtering, hallucination
- [Vietnamese Legal Documents](../concepts/vietnamese-legal-documents.md) — document types, hiệu lực, hợp nhất
- [Customs Declaration Workflow](../workflows/customs-declaration.md) — what the desk actually does
- [Business Rules](../business-rules.md)
- [Agent Rules](../AGENTS.md)
