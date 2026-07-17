---
type: planning
status: active
updated: 2026-07-17
related:
  - 00-bootstrap.md
  - ../project-context.md
  - ../concepts/tariff-system.md
  - ../concepts/data-sources.md
  - ../concepts/hs-classification.md
  - ../docs/code-organization.md
---

# Task List — Phase 0 and Phase 1

## Current Goal

Ship a tariff lookup the declaration desk trusts: given HS + origin + date, return the rate, the governing decree, the as-of date, and the conditions. No AI in it.

Scope of this note: Phase 0 (Foundation) and Phase 1 (Tariff lookup). Phase 2+ is roadmapped in [00-bootstrap.md](00-bootstrap.md) and gets its own task list when Phase 1 is done.

## Status Legend

- `todo`: Not started.
- `doing`: In progress.
- `done`: Completed.
- `blocked`: Waiting on a decision or missing input.

---

## TASK-001: Build the golden set

Status: todo

**This task comes first. Before the repo, before the parser, before any retrieval code.**

Goal: 30–50 real questions from the owner's own past declarations, with known-correct answers, written down before we build anything that could be tuned to pass them.

Why first: a golden set written after the code exists measures the code against itself. Research 12's naive parser reported **94% success while returning export duty for import queries** — 1,520 HS codes appear in both Phụ lục I and Phụ lục II of Nghị định 26/2023/NĐ-CP, and 1,329 of them have different rates (verified 2026-07-17, source: research 12). That parser would have passed any test suite written by the person who wrote it. The golden set is the only artifact in this project that is not downstream of our own assumptions, and it is only trustworthy if it predates them.

Expected output:

- 30–50 entries, each: goods description as the desk actually wrote it, HS code used, origin, declaration date, rate applied, schedule (MFN or which FTA), and the decree if known.
- Sourced from **real past declarations**, not invented.
- Deliberately include the hard cases the desk remembers arguing about — those are where the tool earns or loses its keep.
- Stored in the repo as a versioned fixture, not a spreadsheet on someone's laptop.

Acceptance criteria:

- ≥30 entries, from real filings, with the desk's actual answers.
- Committed before TASK-002 starts.
- Each entry marked with whether the desk is **confident** or **unsure** about its own historical answer.

Notes:

- The "confident / unsure" flag is not bureaucracy. Research 09 documents that HS ground truth is genuinely contestable: an audit of 226 disagreements found **~42.5% of "wrong" model predictions were actually better supported by HS rules than the published ground truth**, and **76% of Vietnamese enterprises report obstacles confirming HS codes**, up from 66.3% in 2018 (verified 2026-07-17, source: research 09). If the desk is unsure, our "accuracy" against that entry means agreement with past practice, not correctness. Say so rather than pretending.
- Ask the owner directly. Do not derive this from anything else.

---

## TASK-002: Resolve the customs.gov.vn API conflict

Status: todo

Goal: establish, empirically, whether a usable JSON API exists on customs.gov.vn — because two research reports directly contradict each other and the answer changes what Phase 1's cross-check is.

**The conflict, both sides, unresolved:**

- **Research 10** reports it drove the "Tra cứu biểu thuế" page in Chrome, captured the XHR, and reproduced it with bare `curl`: `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`, body `{"l_class":"TIM_KIEM","l_action":"GET","l_param":"8703","l_bieu_thue":"NK_uu_dai"}`. It states: no auth, no JSESSIONID, no captcha, no Referer/Origin check; the on-page captcha is **client-side only**; `l_param` is an HS prefix with a 4-digit minimum (`"87"` returns empty, `"8703"` returns 510 rows); one row per HS line with one column per tariff regime (verified 2026-07-17, source: research 10).
- **Research 12** reports the portal is a JS shell — homepage and tariff-lookup URL return a byte-identical 12,013-byte response — and that `/scripts/main.js` hardcodes a **different** backend: `http://123.30.210.236:8080/hqcustomsapi/`, raw IP, plain HTTP, port 8080, including `.../hqcustomsapi/captcha/CheckCaptcha`. **That IP timed out.** Research 12 explicitly refuses to claim it is unreachable, stating it cannot distinguish geo-fencing from its own sandbox egress block (verified 2026-07-17, source: research 12).

They describe **different endpoints**, so both accounts may be accurate. Nobody has checked.

Expected output:

- A written answer: does the `bridge` endpoint respond from the company's network? Does the raw IP? Are they the same backend?
- If reachable: a captured sample response for a known HS code, checked against the desk's knowledge.
- If unreachable: from where, with what error, and whether a Vietnamese network reaches it.

Acceptance criteria:

- Both endpoints tested from the company's actual network, not a sandbox.
- Result recorded in [tariff-system.md](../concepts/tariff-system.md) with today's date, **including if the answer is still "unknown"** and what was tried.
- **No design decision depends on the answer being yes.**

Notes:

- Even if it works, it is **not** the source of truth. Research 10's own caveats: no VIFTA and no CEPA in the schedule list, `THOI_GIAN_CAP_NHAT` values of 2019–2020, current-year rates only (no forward-year series), `l_bieu_thue` apparently ignored for import queries, undocumented, unversioned, no SLA, no ToS grant, and **rate limiting not probed** — it "can vanish or start enforcing captcha" (verified 2026-07-17, source: research 10). The Nghị định is the law. This is a cross-check.
- Be polite. Do not enumerate 1,228 headings while answering "does it respond."

---

## TASK-003: Prove table-aware DOCX parsing on the EVFTA row

Status: todo

Goal: close the one gap research 12 named as blocking. **This gates Phase 1's FTA scope.**

The problem, verbatim from the research: `textutil` collapsed an EVFTA table row (Nghị định 116/2022/NĐ-CP, Phụ lục II) into one line, producing

```
2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9
```

That is six annual rates — `29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9` — concatenated with **no delimiter**, in a decimal-comma locale. Unrecoverable without heuristics. Research 12 is explicit that it is **inferring, not asserting**, that this is a tooling artifact: RCEP (ND 129/2022) has the identical six-year column structure and extracted perfectly, with the rate columns as separate cells:

```
0101.21.00 | - - Loại thuần chủng để nhân giống | 0 | 0 | 0 | 0 | 0 | 0
```

which strongly suggests a proper table-aware parser (LibreOffice → docx → `w:tbl/w:tr/w:tc`) fixes it. It **could not prove this** — no `soffice`, `antiword`, or `python-docx` was available in that environment. It calls this "the one gap a builder must close before trusting anything" (verified 2026-07-17, source: research 12).

Expected output:

- LibreOffice `.doc` → `.docx`, then structural table reading (`python-docx` or equivalent), run against the **exact** EVFTA part containing `2101.11.11`.
- The six rates emerging as six separate cells, or a written finding that they do not.

Acceptance criteria:

- `2101.11.11` yields `29`, `25,4`, `21,8`, `18,1`, `14,5`, `10,9` as **six distinct values**.
- The same parser re-run on the RCEP row above still yields six separate `0` cells (no regression on the case that already worked).
- If it fails: recorded as a finding, and Phase 1 narrows to MFN only pending a different approach.

Notes:

- Do not write delimiter heuristics to split `2925,421,818,114,510,9`. If the structural parser cannot do it, the answer is "we cannot parse EVFTA reliably," not "we guessed." A heuristic here produces plausible-looking wrong rates — the exact failure mode this project must not have.

---

## TASK-004: Check whether vbpl provisionTree / referenceProvisions are populated

Status: todo

Goal: answer a cheap question now that determines the Phase 5 schema later.

vbpl.vn was rebuilt **2026-04-23**; every existing scraper and public dataset targets a site that no longer exists (verified 2026-07-17, source: research 04). Its Server Action JSON carries `references[]` → `{targetDocument:{...}, referenceType:int, referenceProvisions}` plus a `provisionTree` field. **Both were `null` on the two documents research 04 sampled**, and it could not verify whether they are ever populated. It calls this "the highest-value open question": if populated site-wide, that is a provision-level (điều/khoản) legal graph — exactly what the April relaunch press claims ("quản lý chi tiết đến từng điều, khoản, điểm... máy có thể tự động đọc, hiểu") (verified 2026-07-17, source: research 04).

Expected output:

- 10–20 recent documents sampled; `provisionTree` and `referenceProvisions` populated or null on each.
- Finding recorded in [vietnamese-legal-documents.md](../concepts/vietnamese-legal-documents.md).

Acceptance criteria:

- ≥10 documents sampled, biased toward recent ones.
- A yes/no/partial answer with the sample, not an impression.

Notes:

- **Does not block Phase 1.** vbpl is not a tariff source. This is Phase 5 groundwork done while it is cheap.
- The site is fully client-rendered: `curl` returns a 57KB loading shell with **zero** law text. The `Còn hiệu lực` strings in the static HTML are **i18n labels, not data** — a trap that silently poisons a naive scraper (verified 2026-07-17, source: research 04). Use a headless browser.
- `robots.txt` allows `/van-ban/` and disallows `/Pages/` (the dead legacy tree) (verified 2026-07-17, source: research 04). Be polite — research 04 made only ~40 requests and explicitly notes that is not evidence of no throttling at scale.

---

## TASK-005: Write the .agent knowledge notes

Status: done (2026-07-17)

Goal: the durable notes exist and are cross-linked **before** implementation starts.

This is deliberate sequencing, not ceremony. The research contains 2026 facts no model's training data has, and several invert reasonable priors — the authoritative government gazette is wide open while the convenient aggregators are blocked and legally hostile; the "obvious" PDF source is a 200-DPI scan with no text layer. An agent starting from priors will build the wrong thing confidently.

Expected output:

- Notes under `.agent/concepts/`, `.agent/architecture-decisions/`, `.agent/workflows/`, per [AGENTS.md](../AGENTS.md).
- `.agent/index.md` updated.

Acceptance criteria:

- Every factual claim carries a verification date and source.
- Every research-flagged uncertainty is reproduced as an uncertainty, not laundered into confidence.
- Where research 10 and 12 contradict, **both** are presented and the conflict is stated as unresolved.
- All English. Relative links. Frontmatter with `type`, `status`, `updated`, `related`.

Outcome (2026-07-17): notes written, then audited adversarially against the research. The audit found
and we fixed: a primary-source URL grafted onto the unsourced dairy case in two ADRs; the same case
stated as established fact in three notes while correctly quarantined in a fourth; an invented
six-decree "correct 2026 MFN" union that appears in neither research report, bolded as fact in
`concepts/tariff-system.md`; and `concepts/data-sources.md` declaring the vbpl robots.txt conflict
"resolved" while three other notes called the same reconciliation an unverified inference.

**The lesson, recorded because it will recur:** every one of those was an agent tidying an
uncertainty into a confident sentence — the same failure this product is built to prevent, committed
by the tooling that documented it. Fluent prose hides missing provenance. **Audit the knowledge base
against its sources whenever it is materially extended.**

---

## TASK-006: Repository skeleton

Status: todo

Goal: NestJS monorepo + Docker Compose (Postgres + pgvector) + migrations, runnable by a second person from a clean clone.

Expected output:

- NestJS monorepo following the framework's module convention; mapping documented in [code-organization.md](../docs/code-organization.md).
- `docker compose up` → Postgres with `pgvector` available.
- Migration tooling wired; one migration applied.
- README with the clone-to-running steps.

Acceptance criteria:

- Clean clone → `docker compose up` → migrations run → app boots, on a machine that has never seen the project.
- No Qdrant, Neo4j, MinIO, or BullMQ (see [Postgres only for v1](../architecture-decisions/2026-07-17-postgres-only-for-v1.md)).
- `pgvector` installed but unused in Phase 1 — Phase 2 needs it; installing it now avoids a migration later.

---

## TASK-007: Tariff schema — temporal and annex-aware from the first migration

Status: todo

Goal: a schema that can represent the law as it actually behaves. Retrofitting this later means re-ingesting everything.

**Why the obvious schema is wrong.** `(hs, origin) → rate` is not a function. Research 12 verified:

- **MFN vs FTA is conditional.** RCEP Điều 4 requires origin rules *plus a valid C/O*. "The tax is 0%" is wrong; "0% *if* you hold a valid C/O, else 15% MFN" is right.
- **RCEP Điều 6.2 has a highest-rate rule** across annexes for certain multi-origin goods — verbatim: *"Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."*
- **`*` means excluded, not zero** — 54 `*` cells in a single RCEP gazette issue.
- **TRQ goods** (headings 04.07, 17.01, 24.01, 25.01) depend on quota status; out-of-quota rates live in a different annex.
- **Absolute/mixed duties** (used cars, Phụ lục III) are **USD amounts, not percentages** — a `%` regex finds zero rows there.

(all verified 2026-07-17, source: research 12)

And "latest" is wrong as a temporal model, because decrees **expire and silently revert**: Nghị định 72/2026/NĐ-CP was valid only until **2026-04-30** — a 52-day window — after which rates revert to ND 26/2023. A "scrape the latest" design would serve 0% petrol forever (verified 2026-07-17, source: research 12).

Expected output:

- Tariff rows keyed with: HS code, **annex identity**, schedule, `effective_from`, `effective_to`, source decree, rate **type** (percent / absolute / mixed / excluded / TRQ-dependent), and conditions.
- HS **version** as a dimension with validity dates — not hardcoded AHTN 2022.
- Decree entities with signature date, gazette date, effective date, and expiry.

Acceptance criteria:

- The schema can represent, without a special case: an expiring decree that reverts; a `*` exclusion; a USD-denominated absolute duty; a rate conditional on a C/O; the same HS code with different rates in Phụ lục I and Phụ lục II.
- **A row cannot be inserted without an annex.** Enforced by the database, not by convention.
- A point-in-time query is an interval predicate, not an `ORDER BY date DESC LIMIT 1`.

Notes:

- HS 2028 takes effect **2028-01-01** (verified 2026-07-17, source: research 10, citing WCO; corroborated by research 09). Research 10 also warns essentially the entire FTA decree corpus expires **2027-12-31**, colliding with the AHTN 2028 nomenclature switch. Do not model "the current rate" as a scalar.
- Research 10 flags that **AJCEP (ND 120/2022) and VJEPA (ND 124/2022) run to 2028**, not 2027 — so per-decree expiry must be a field, not a global constant.
- See [Bitemporal validity from day one](../architecture-decisions/2026-07-17-bitemporal-validity-from-day-one.md).

---

## TASK-008: Công báo ingestion — annex-aware parser

Status: todo

Depends on: TASK-003, TASK-007.

Goal: ingest Nghị định 26/2023/NĐ-CP from Công báo `.doc`, annex-aware, with every row carrying its provenance.

**Why Công báo and not the obvious sources** (all verified 2026-07-17):

- Công báo is **authoritative** — the publication of record; `_signed` versions are the legally published text (source: research 04).
- **Robots-permissive**: `congbao.chinhphu.vn/robots.txt` is `User-agent: * / Allow: /`. No Cloudflare, no JS — plain `curl` returns server-rendered HTML (source: research 04 and research 12, independently).
- **Real Word tables.** Research 12 downloaded all 14 `.doc` parts of ND 26/2023 (gazette issues 743+744 → 769+770, via tokenized `g7.cdnchinhphu.vn/api/download/stream` links) and extracted **11,874 unique 8-digit HS codes**, cells cleanly recoverable as `0301.11.10 | - - - Cá bột | 15` (source: research 12).
- **chinhphu.vn PDFs are scans**: producer `Kodak Alaris Inc.`, one `/CCITTFaxDecode` bilevel image per page, 1666×2329 px ≈ 200 DPI bitonal, and `26-nd-2.pdf` has **zero `/Font` objects** — no text layer. 1,016 pages of fax-compressed scan (source: research 12).
- **thuvienphapluat.vn: do not scrape.** 403 via Cloudflare; `robots.txt` names `ClaudeBot` with `Disallow: /`; `Content-Signal: search=yes, ai-train=no, use=reference` as an express reservation under Article 4 of EU Directive 2019/790; its Excel tariff files are a commercial product (source: research 04 and research 12).

Expected output:

- Parser: Công báo `.doc` → LibreOffice `.docx` → structural table read → typed rows.
- Annex boundary detection as a **first-class step**, not a regex afterthought.
- Every row carries: source decree, gazette issue, annex, and the verbatim source cell text.

Acceptance criteria:

- **~11,874 unique 8-digit HS codes** from Phụ lục II, ~11,160 with a rate — matching research 12's independently produced numbers. A materially different count means the parser is wrong; investigate rather than adjust the expectation.
- **`0301.11.10` returns 15 (Phụ lục II, import) and 0 (Phụ lục I, export) as two distinct rows.** This single assertion is the annex-trap regression test. It must exist before any other parser test.
- Phụ lục III rows are ingested as **absolute USD duties or explicitly skipped with a logged reason** — never silently dropped by a `%` regex.
- Rows without a resolvable annex **fail the ingest**. They do not get a default.
- Cross-check: `2710.12.21/.22/.24/.25` = **10%** under ND 26/2023 — research 12 validated this independently against press reporting of ND 72/2026 describing the cut *"từ 10% xuống 0%"* on those exact codes (verified 2026-07-17, source: research 12).

Notes:

- Research 12's naive parse **reported 94% success and was wrong** — 1,329 of 1,520 dual-annex codes have different rates between Phụ lục I and II. It returned the export rate for import questions, silently. Its own framing: *"not missing data, but plausible-looking wrong data"* — and *"it fails while reporting success."* Treat a high success percentage as unproven until the annex assertion above passes.

---

## TASK-009: Establish the amendment chain for 2026 MFN

Status: todo

Depends on: TASK-008.

Goal: know which decrees actually compose the correct 2026 MFN rate — because the two research reports give **different lists and neither is confirmed complete**.

- **Research 10**: correct 2026 MFN = ND 26/2023 ⊕ **199/2025** ⊕ **72/2026** ⊕ **201/2026** ⊕ **108/2025**. It states ND 26/2023 is still the base decree, not superseded, and that **there is no official văn bản hợp nhất published as machine-readable data** (verified 2026-07-17, source: research 10).
- **Research 12** gives the chain as ND 26/2023 ← **144/2024** (eff. 2024-12-16), **199/2025** (2025-07-08), **72/2026** (signed 2026-03-09), plus 2026 additions: new AJCEP and VJEPA schedules eff. 2026-04-01, a Vietnam–Cambodia 2026 schedule, and ND 26/2026 on chemicals (verified 2026-07-17, source: research 12).

**144/2024 appears only in research 12; 201/2026 and 108/2025 appear only in research 10.** These lists do not reconcile. Do not merge them and assume the union is correct — establish the real chain from Công báo.

Expected output:

- The amendment chain, each entry with signature date, gazette date, effective date, and expiry (if any), sourced from Công báo.
- Recorded in [tariff-system.md](../concepts/tariff-system.md).

Acceptance criteria:

- Every decree in the chain verified against a Công báo listing, not a secondary source.
- Discrepancies with either research report recorded rather than silently resolved.
- ND 72/2026's expiry on **2026-04-30** represented — after which rates revert to ND 26/2023 (verified 2026-07-17, source: research 12). If the ingested data serves 0% petrol for a date after 2026-04-30, the temporal model is broken.

---

## TASK-010: Staleness detection

Status: todo

Depends on: TASK-007.

Goal: the system knows when it might be wrong, and says so.

**This is the finding that most deserves the owner's attention, because the mitigation is a product decision, not a technical one.** Research 12's three compounding facts, all verified (source: research 12):

1. **Zero lead time.** ND 72/2026 took legal effect **the day it was signed** (2026-03-09, "kể từ ngày ký").
2. **Gazette lag exceeds the effect date.** It was published in Công báo số 157 on **2026-03-24 — 15 days after it was already binding law.** (ND 26/2023: ~19 days. EVFTA ND 116/2022: ~48 days.) **There is a multi-week window in which the legally-in-force rate exists in machine-readable form nowhere — only as a 200-DPI scan.**
3. **Decrees expire and silently revert.**

Research 12's conclusion: *"No crawl schedule can close that gap."* So we do not pretend to. The system tracks its own snapshot date and surfaces it.

Expected output:

- Every response carries the ingestion snapshot date alongside the as-of date.
- A configurable staleness window; beyond it, the response is a **warning**, not a bare number.
- The UI shows the governing decree and the as-of date on every result (Phase 3).

Acceptance criteria:

- A query for a date newer than the snapshot returns a warning state, not a confident rate.
- The warning is visible in the API response, not buried in a log.
- Tested against the ND 72/2026 case: a query dated 2026-03-10 (effective, pre-gazette) against a 2026-03-15 snapshot must **not** silently return the ND 26/2023 rate as if it were current.

Notes:

- Research 12's framing of the whole project: *"It is a legal-currency problem wearing a data-engineering costume."* The defensible shape is *"a research aid that shows its sources, never an answer engine that states a rate."* This task is where that principle becomes code.

---

## TASK-011: The lookup API

Status: todo

Depends on: TASK-007, TASK-008, TASK-010.

Goal:

```
GET /tariff?hs=<8-digit>&origin=<country>&date=<YYYY-MM-DD>
```

→ rate + governing decree + as-of date + conditions.

Expected output:

- The endpoint, with `conditions` as a real field, not a note.
- Deterministic. No model call anywhere in the path (see [No LLM on tariff numbers](../architecture-decisions/2026-07-17-no-llm-on-tariff-numbers.md)).

Acceptance criteria:

- Every response names its governing decree and as-of date. No exceptions.
- An FTA rate returns **conditionally** — "0% if a valid C/O, else X% MFN" — never a bare 0%.
- A `*`-marked line returns **excluded**, not 0%.
- A TRQ good returns quota-dependent, with the out-of-quota rate identified as a separate annex.
- An absolute-duty line returns a USD amount with its unit, not a percentage.
- A date outside the ingested window returns a warning state (TASK-010).

Notes:

- Research 12: *"'The tax is 0%' is wrong; '0% if you hold a valid C/O, else 15% MFN' is right."* An unconditional number is a lie the API tells confidently.

---

## TASK-012: Phase 1 acceptance — reconcile against reality

Status: todo

Depends on: TASK-001, TASK-011.

Goal: prove Phase 1 against the world, not against itself.

Expected output:

- One **real shipment**'s rate, from an actual declaration the desk filed, matching ECUS.
- **20 randomly sampled** HS codes reconciled by hand.

Acceptance criteria:

- The real shipment matches. If it does not, Phase 1 is not done — no partial credit.
- 20 codes chosen by **random sample** over the ingested set, then checked by hand against the Công báo source text.
- The golden set from TASK-001 runs green, with any "unsure" entries reported separately from "confident" ones.

Notes:

- **Random, not hand-picked.** Hand-picked samples confirm the parser you wrote. Random samples find the annex bug. This is the entire reason the criterion is worded this way — research 12's 94%-success parser would have passed a hand-picked sample and failed a random one.

---

## Assumptions

- The owner can supply 30–50 real declarations for TASK-001, and ECUS output for at least one real shipment for TASK-012. **Both are hard dependencies from outside the repo.** If either is unavailable, say so rather than substituting invented data.
- Công báo stays robots-permissive and keeps publishing `.doc` alongside PDF.
- The tokenized `g7.cdnchinhphu.vn/api/download/stream` links work in bulk. Research 12 pulled 14 parts successfully; sustained-rate behaviour is untested.
- A single Postgres instance suffices for 5–50 staff.
- Research 12's extraction numbers (11,874 / 11,160) are reproducible. TASK-008 treats them as the expected result precisely so that a mismatch is loud.

## Open Questions

1. **customs.gov.vn API** — research 10 and 12 contradict. TASK-002. Unresolved.
2. **EVFTA six-rate parse** — TASK-003. Gates Phase 1's FTA scope.
3. **vbpl `provisionTree` / `referenceProvisions`** — TASK-004. Gates the Phase 5 schema.
4. **The real MFN amendment chain** — TASK-009. Research 10 and 12 give non-matching lists.
5. **Which FTA schedules does this company actually use?** Research 10's discovery call returned 26 import schedule codes (`NK_uu_dai, ATIGA, ACFTA, AJCEP, AKFTA, AHKFTA, AANZFTA, AIFTA, VJEPA, VKFTA, VN-EAEU, EVFTA_NK, UKVFTA_NK, VCFTA, VNL, VNCB, CPTPP_NK, CPTPP_NK_MEX, RCEP_ASEAN, RCEP_AU, RCEP_CN, RCEP_JP, RCEP_KR, RCEP_NZ, NK_TT`) (verified 2026-07-17, source: research 10). This desk will use a handful. **Ask the owner** — ingesting all 26 is weeks of work for schedules nobody queries.
6. **Are the desk's historical HS codes trustworthy as ground truth?** See TASK-001's confident/unsure flag.

## Risk Areas / Unknowns

- **The parser that fails while reporting success** is the defining risk of Phase 1. Every acceptance criterion here is written to be adversarial for this reason. If a criterion feels like it is trying to catch us out, that is intentional.
- **The temporal gap cannot be engineered away.** During the 15–48 day signature-to-gazette window, the binding law is machine-readable nowhere. TASK-010 makes the system honest about it; it does not fix it. **The owner should understand this before Phase 1 ships** — it is a permanent property of the domain, not a bug we will get to later.
- **A wrong rate is the declarant's legal liability, not the tool's.** Research 12: customs declarations are legally binding; a wrong rate means back-assessment and penalties, carried by the declarant.
- **TASK-001 and TASK-012 depend on the owner.** They are the two tasks that make the difference between a tool that works and a tool that appears to work, and neither can be done from inside the repo.
- **Scope creep toward "just add VAT."** VAT is partially HS-keyed; **TTĐB and BVMT are not HS-keyed in law at all** — verified via the customs API itself, which returns rows like `"1. Thuốc lá điếu…"` with `MA_HS: None` (verified 2026-07-17, source: research 10). Any HS→category mapping is our own editorial inference and a liability surface. Out of scope for v1; see [00-bootstrap.md](00-bootstrap.md).

## Validation Plan

- **TASK-001** validates by existing before the code does. Its value is entirely in the ordering.
- **TASK-002, 003, 004** validate by producing a written answer with evidence — **including "still unknown, here is what was tried."** An honest unknown is a passing result; a confident guess is a failing one.
- **TASK-007** validates by representing the six awkward cases (expiring decree, `*`, USD absolute duty, C/O-conditional, dual-annex collision, TRQ) without special-casing.
- **TASK-008** validates against research 12's independently produced counts and the `0301.11.10` dual-annex assertion.
- **TASK-009** validates against Công báo listings, not secondary sources.
- **TASK-010** validates against the ND 72/2026 timeline — the concrete case where signature, effect, gazette, and expiry all diverge.
- **TASK-011** validates by never returning an unconditional number where the law is conditional.
- **TASK-012** validates against ECUS and a random sample. This is the only criterion the desk cares about.

## Unverified / Do Not Rely On

Carried forward from the research; also in [00-bootstrap.md](00-bootstrap.md).

- **customs.gov.vn API: research 10 and 12 CONTRADICT.** Research 10 reports a verified working `bridge` endpoint with no captcha. Research 12 reports a different raw-IP backend with a `CheckCaptcha` path that timed out, and explicitly declines to claim unreachability. Different endpoints — possibly both true, possibly one mistaken. **Unresolved.** Present both. TASK-002.
- **The EVFTA concatenation being a `textutil` artifact is INFERRED, not proven** (research 12 had no table-aware parser available). TASK-003.
- **The MFN amendment chain differs between research 10 and 12** and neither is confirmed complete. TASK-009.
- **The "2022-batch FTA decrees all expire together on 2027-12-31" framing is INFERRED** by research 12; research 10 verifies individual dates from two independent sources but also notes **AJCEP and VJEPA run to 2028** — so "together" is already imprecise.
- **Nghị định 128/2022/NĐ-CP may not be an FTA tariff decree at all** — research 10's sources both skip it; do not assume a contiguous 112–129 range.
- **data.gov.vn — CONTESTED.** Research 10: DNS failure, flagged "unverified, not confirmed-dead." Research 04: **NXDOMAIN** from the `gov.vn` zone via both 8.8.8.8 and 1.1.1.1 with controls resolving fine, concluding it **does not exist**. Research 04's evidence is stronger; the two do not formally agree. Either way, no national open-data API for legal documents.
- **Rate limiting on the customs API was never probed** (research 10, explicitly).
- **Sustained-rate crawl behaviour on vbpl is untested** — ~40 requests only (research 04).

## Reuse Check

- Existing helpers, modules, or patterns searched: `.agent/` notes only; no application code exists yet.
- Existing code to reuse or extend: none.
- New modules needed: tariff ingestion, tariff lookup. Both are new domain boundaries with no equivalent in the repo.
- Reason existing code is insufficient: greenfield.

## Deferred Ideas

- HS candidate suggestion — Phase 2. Gated at top-3 ≥ 80%; **below that, do not ship.**
- Web UI + internal auth — Phase 3.
- Policy/permit alerts — Phase 4, high risk, Bộ Công Thương only to start.
- Legal RAG — Phase 5+, only after customs runs for real.
- VAT / TTĐB / BVMT — out of scope; TTĐB and BVMT are not HS-keyed in law.
- Anti-dumping duties — out of scope; no consolidated machine-readable register exists.

## Related Knowledge

- [Bootstrap Plan](00-bootstrap.md) — the roadmap and phase gates
- [Project Context](../project-context.md)
- [Tariff System](../concepts/tariff-system.md) — schedules, the annex trap, the temporal gap
- [Data Sources](../concepts/data-sources.md) — why Công báo, why not the aggregators
- [HS Classification](../concepts/hs-classification.md) — for Phase 2
- [Customs Declaration Workflow](../workflows/customs-declaration.md)
- [Code Organization](../docs/code-organization.md)
- [Business Rules](../business-rules.md)
- [Agent Rules](../AGENTS.md)
