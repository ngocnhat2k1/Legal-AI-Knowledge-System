---
type: architecture-decision
status: approved
updated: 2026-07-17
related:
  - ../concepts/tariff-system.md
  - ../concepts/vietnamese-legal-documents.md
  - ../concepts/hs-classification.md
  - ../concepts/data-sources.md
  - ../business-rules.md
  - ../project-context.md
---

# Model Validity And HS Version As First-Class Dimensions From Day One

## Status

Approved (2026-07-17).

## Context

Customs Assistant answers two questions in v1: the exact duty rate for a
(HS code, schedule, date) triple, and a ranked list of HS candidates with
verbatim legal evidence. Both are legally binding outputs — the declarant,
not this tool, carries the liability for a wrong number.

The temptation is to store one row per HS code with a `rate` column, ship v1,
and "add history later". The research says that design is wrong on arrival,
not merely incomplete:

- **The corpus is mostly dead law.** SBV-LawGraph measured a real Vietnamese
  legal corpus: of 1,703 State Bank documents, 863 fully repealed, 191 partly
  repealed, 639 effective — **~62% is dead or partly dead law** (verified
  2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf).
  A store without a status/validity dimension is a store whose majority
  content is wrong and unmarked.

- **Law-on-paper to suspended in 10 weeks.** NĐ 46/2026/NĐ-CP was issued
  26/01/2026 to replace NĐ 15/2018 on food safety, joined by NQ 66.13/2026/NQ-CP
  (27/01/2026). **NQ 09/2026/NQ-CP suspended both on 04/02/2026** — nine days
  later — initially until 15/4/2026, then extended until the amended Food Safety
  Law and its implementing decree take effect. NĐ 15/2018 is therefore still
  the operative rule today (verified 2026-07-17, sources:
  https://vanban.chinhphu.vn/?docid=216891&pageid=27160 ·
  https://baochinhphu.vn/tiep-tuc-ap-dung-nghi-dinh-15-2018-nd-cp-ve-an-toan-thuc-pham-cho-den-khi-co-quy-dinh-moi-102260408123934123.htm).
  A `superseded_by` pointer alone cannot express this: the superseding decree
  exists, is validly issued, and does not apply.

- **Zero lead time, gazette lag, and silent reversion — all at once.**
  NĐ 72/2026/NĐ-CP cut MFN rates on petrol/naphtha/reformate from 10% to 0%.
  It was **signed 09/03/2026 and effective the same day** ("kể từ ngày ký"),
  **gazetted in Công báo số 157 on 24/03/2026 — 15 days after it was already
  binding law** — and was **valid only until 30/04/2026, a 52-day window**,
  after which rates silently revert to NĐ 26/2023 with no further instrument
  (verified 2026-07-17, sources: research/12.md live-fetch verification ·
  https://vanban.chinhphu.vn/?amp=&docid=217144&pageid=27160). For comparison,
  NĐ 26/2023 was signed 31/05/2023 and gazetted 19/06/2023 (~19 days); EVFTA
  NĐ 116/2022 signed 30/12/2022, gazetted from 16/02/2023 (~48 days).
  There is a multi-week window in which the legally in-force rate exists in
  machine-readable form **nowhere** — only as a 200-DPI scan.

- **The effective date is not a date.** Luật Đường bộ 35/2024/QH15 Điều 85
  khoản 2 gives four provisions an *earlier* effect (01/10/2024) than the law
  itself (01/01/2025). Luật TTATGTĐB 36/2024/QH15 Điều 88 khoản 2 — the
  article that sets delayed effect — **was itself amended** by Luật
  118/2025/QH15 (10/12/2025), whose own Điều 11 has **split effective dates**
  (01/7/2026 generally, except điểm a khoản 20 Điều 7 which took effect
  01/01/2026 — precisely the clause that pushed the child-restraint rule from
  01/01/2026 to 01/7/2026, landing one day before the original deadline bit).
  The same amendment added camera obligations effective 01/01/2028 and
  01/01/2029 (verified 2026-07-17, sources:
  https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf ·
  https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/49-vbhn-vpqh.pdf).
  Per-clause delayed effect, amendment of the effective-date article itself,
  and an amending instrument with split effective dates — one case, all three.

- **Future-dated rates already sit inside current decrees.** NĐ 199/2025/NĐ-CP
  (08/07/2025) raises yellow phosphorus 5% → 10% on 01/01/2026 → 15% on
  01/01/2027 (verified 2026-07-17, source:
  https://luatvietnam.vn/xuat-nhap-khau/nghi-dinh-199-2025-nd-cp-405228-d1.html).
  A scalar `rate` column has nowhere to put the 2027 value.

- **HS version is a separate axis that is about to move.** TT 31/2022/TT-BTC
  (eff. 01/12/2022) is current and is built on **HS 2022 / AHTN 2022**:
  21 phần · 97 chương · 1,228 nhóm · 4,084 phân nhóm · 11,414 eight-digit lines.
  **HS 2028 takes effect 01/01/2028**; AHTN 2028 is under negotiation and no
  HS 2028 nomenclature is in force today (verified 2026-07-17, source:
  https://kv05.customs.gov.vn/index.jsp?aid=215061&cid=25&pageId=2).
  Meanwhile the FTA schedule corpus — 17 decrees all issued 30/12/2022 covering
  2022–2027, plus VIFTA NĐ 131/2024 and CEPA NĐ 143/2026 — is written to run to
  **31/12/2027**. Nomenclature re-basing and total schedule replacement collide
  in the same quarter, roughly 18 months out.

## Decision

**Validity, schedule, and HS version are first-class dimensions of the data
model from the first migration. There is no "phase 2" for temporality.**

1. **Every stored legal fact is a versioned row, never an updated one.**
   Minimum columns on every rate, nomenclature line, and rule record:
   `valid_from`, `valid_to` (nullable = open-ended), `status`,
   `source_doc`, `as_of`. Writes are inserts. Nothing is ever mutated in place.

2. **Bitemporal, not just valid-time.** `valid_from`/`valid_to` are the law's
   time; `as_of` is *our* time — when we obtained and verified the record.
   These diverge by design, because a decree can be binding 15 days before it is
   machine-readable anywhere. `as_of` is what lets the system say "my snapshot
   may be stale" instead of confidently serving a rate that a signed-and-effective
   decree already overrode.

3. **`status` is an enumeration, not a boolean.** It must at minimum express:
   in force, not yet in force, suspended, expired, repealed, partly repealed.
   The NĐ 46/2026 case requires `suspended` as distinct from `repealed` and from
   `in force`; the 62% figure requires `partly repealed` as distinct from
   `repealed`.

4. **`hs_version` is its own dimension**, carried on nomenclature lines and on
   every rate row that references them. AHTN 2022 today; AHTN/HS 2028 from
   01/01/2028. No code, query, or schema may assume AHTN 2022.

5. **Duty lookup is keyed by (HS code, schedule, effective date)** — never by
   HS code alone. `schedule` covers export vs preferential import vs each FTA
   annex. The research proved why: in NĐ 26/2023, **1,520 HS codes appear in
   both Phụ lục I (export schedule) and Phụ lục II (MFN import schedule), and
   1,329 of them carry different rates**. An annex-blind parser returned the
   *export* rate for an *import* question — silently, at 94% apparent success
   (verified 2026-07-17, source: research/12.md, parse of the 14 Công báo `.doc`
   parts of NĐ 26/2023).

6. **Two designs are banned outright:**
   - "The current rate" as a scalar on an HS row.
   - "Take the latest version" as a resolution strategy. NĐ 72/2026 expired on
     30/04/2026 and reverted with no successor instrument — "latest" serves 0%
     petrol forever.

7. **Issuers and non-HS keys are entities with validity ranges too.**
   Bộ GTVT ceased to exist on 01/03/2025 (merged into Bộ Xây dựng); Cục Hàng hải
   VN and Cục ĐTNĐ became VIMAWA. Every `TT-BGTVT` is now legacy-issuer
   (verified 2026-07-17, source:
   https://plo.vn/tu-ngay-1-3-khong-con-ten-bo-giao-thong-van-tai-post836639.html).
   Issuer-based lookup breaks without aliases and validity ranges.

8. **Validity is a hard filter, not a ranking signal.** The RAG research is
   explicit on this point: valid-time must be modelled and filtered as a
   constraint, because temporal anachronism — serving repealed or
   not-yet-effective law — is one of the two dominant failure modes for legal
   RAG (verified 2026-07-17, source: research/02.md, citing
   https://lexuanbach.github.io/publication/ACIIDS2026a.pdf and
   https://arxiv.org/abs/2605.23497). This applies to the later RAG phase, but
   the schema that phase reads must already carry the dimension.

## Rationale

The failure mode of this project category is **not missing data — it is
plausible-looking wrong data that reports success.** The annex trap is the
proof: a parser reporting 94% coverage was returning export duty for import
queries with no error surface anywhere. A scalar-rate schema has the same
shape: it never reports an error, because it has no vocabulary for "I do not
know what applied on that date."

Temporality cannot be retrofitted for a structural reason: retrofitting
requires reconstructing history you did not record. Once rows have been
mutated in place, the 2025 rate is gone. Customs declarations are audited and
back-assessed after the fact — "what rate applied on 12/03/2026?" is a routine
question, not an archival curiosity, and during that specific window the answer
was 0% for 52 days and 10% on either side of it.

Bitemporality specifically (rather than valid-time alone) is forced by the
gazette lag. Valid-time alone assumes we know the law as soon as it binds. We
demonstrably do not: there is a 15–48 day window per decree where the binding
text exists only as a scan. Recording `as_of` is what converts that from a
silent wrong answer into a disclosable staleness bound — which is the
difference between a research aid and a liability.

Making `hs_version` a dimension now costs one column and a join key. Making it
a dimension in Q4 2027, while simultaneously ingesting a ~17-decree FTA
replacement batch, means re-basing every historical mapping under deadline.

## Scope

Applies to:

- The tariff schema: nomenclature lines, duty rates, schedules, absolute/mixed
  duty rows, TRQ rows.
- The HS candidate evidence store (legal notes are versioned text too).
- Every ingestion job: parse-time must capture `source_doc` and `as_of`;
  ingestion never updates, only appends.
- The later RAG corpus (validity filter as a hard constraint).

Does not apply to: operational tables with no legal semantics (users, audit
logs, job runs).

## Alternatives Considered

**Scalar "current rate" column, add history later.** Rejected. It cannot answer
back-assessment questions, cannot represent the 01/01/2027 yellow-phosphorus
step already written into NĐ 199/2025, and cannot express the 52-day NĐ 72/2026
window at all. Retrofit is impossible without the history it discarded.

**"Latest version wins" resolution.** Rejected. Falsified directly by
NĐ 72/2026's silent expiry and reversion, and by NQ 09/2026 suspending a
newer decree in favour of an older one.

**Rely on văn bản hợp nhất (consolidated texts) as the temporal answer.**
Rejected as sufficient, kept as useful. VBHN is the right *text* layer where it
exists, but it is a snapshot with no version history, publication lags
amendment, and **no official machine-readable VBHN exists for the tariff at
all** (verified 2026-07-17, source: research/10.md) — the correct 2026 MFN is
NĐ 26/2023 plus an amendment chain that this project must assemble and
therefore can get wrong. ⚠️ The chain is itself unresolved: research 10 and
research 12 give different, individually non-exhaustive lists. See
[Tariff System](../concepts/tariff-system.md) — do not treat their union as
verified.

**Treat the customs.gov.vn tariff API as the source of truth.** Rejected on
this ADR's own grounds regardless of whether it works (see Unverified below):
it returns **current-year rates only, in flat per-regime columns, with no
forward-year series**, its schedule list carries `THOI_GIAN_CAP_NHAT` values of
2019–2020 and lacks VIFTA and CEPA entirely. It is structurally a "latest
scalar" source and cannot back a bitemporal store. Legal authority sits with
the decree text.

## Risks

- **Query complexity.** Every read becomes a date-ranged, schedule-scoped,
  version-scoped query. Mitigation: a single resolution function; no ad-hoc
  rate reads anywhere in the codebase.
- **Overlapping/contradictory validity intervals** from amendment chains.
  Mitigation: overlap detection as a data-quality gate at ingestion, not a
  runtime surprise.
- **`as_of` staleness is only useful if surfaced.** A recorded-but-hidden
  `as_of` buys nothing. The output contract must cite the decree and the
  snapshot date, and must refuse rather than guess when the snapshot may
  predate a known amendment.
- **Suspension and reversion have no reliable machine signal.** NĐ 72/2026's
  expiry was a clause inside itself; NQ 09/2026 was a separate resolution.
  Detection is partly manual. Mitigation: `valid_to` is populated at ingest
  from the instrument's own text, and a human review queue owns the rest.

## Consequences

- All ingestion is append-only. No `UPDATE rate SET ...` exists in this
  codebase.
- v1's deterministic tariff lookup takes an explicit declaration date; there is
  no default-to-today shortcut in the data layer.
- The system can answer "what applied on date D" from day one, which is what
  back-assessment audits actually ask.
- Storage grows with amendment history. This is acceptable at 5–50 staff and
  ~11,414 lines × 26 schedules.
- The AHTN 2028 / FTA-expiry collision in Q4 2027 becomes an ingestion job
  rather than a migration.

## Unverified / Do Not Rely On

- **The customs.gov.vn tariff API — two research agents contradict each other,
  and the conflict is unresolved.** Report 10 states it verified
  `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue`
  with bare `curl`: no auth, no cookie, no captcha, returning MFN + all FTA
  columns per HS line (e.g. `87031010` → `NK_uu_dai: 70, EVFTA_NK: 28.3`).
  Report 12 found `/scripts/main.js` hardcoding a *different* backend —
  `http://123.30.210.236:8080/hqcustomsapi/`, a raw IP over plain HTTP,
  including `.../captcha/CheckCaptcha` — and **that IP timed out**; report 12
  could not distinguish geo-fencing from a sandbox egress block and explicitly
  declined to claim it is unreachable. **Both reports are reproduced here as
  filed. This ADR does not depend on the resolution** — the decree text is the
  source of truth either way, and §Alternatives explains why the API cannot back
  a bitemporal store even if report 10 is correct.
- **The 31/12/2027 FTA cliff is partly inferred.** Report 10 states the 2022
  batch covers 2022–2027 (with AJCEP NĐ 120/2022 and VJEPA NĐ 124/2022 running
  to 2028). Report 12 explicitly flags "all of them expire together, requiring a
  full successor set" as **inferred, not verified**. Treat the collision as a
  planning assumption to confirm against each decree's own hiệu lực article.
- **Word-parsing of Công báo `.doc` annexes is not proven.** Report 12's
  `textutil` extraction of EVFTA NĐ 116/2022 collapsed six annual rate columns
  into an undelimited string (`2925,421,818,114,510,9` = 29 | 25,4 | 21,8 |
  18,1 | 14,5 | 10,9) in a decimal-comma locale. Report 12 **infers, but could
  not prove**, that a table-aware parser (LibreOffice → docx → `w:tbl/w:tr/w:tc`)
  fixes it — no such tool was available in that environment. **This is the gap a
  builder must close before trusting any ingested rate.**
- **Report 10 did not probe rate limiting** on the customs API, and could not
  verify data.gov.vn / open.data.gov.vn (DNS failure) or the ASEAN Tariff Finder
  (timeout).

## Related Knowledge

- [Tariff System](../concepts/tariff-system.md) — schedules, annexes, the
  amendment chain to NĐ 26/2023.
- [Vietnamese Legal Documents](../concepts/vietnamese-legal-documents.md) —
  hiệu lực mechanics, VBHN, issuer identity.
- [HS Classification](../concepts/hs-classification.md) — AHTN 2022, the 2028
  re-basing, GRI.
- [Data Sources](../concepts/data-sources.md) — Công báo, customs.gov.vn,
  robots/licensing posture.
- [Legal RAG Retrieval](../concepts/legal-rag-retrieval.md) — why validity is a
  hard filter, not a ranking signal.
- [Business Rules](../business-rules.md) — the output contract: cite the decree
  and date, refuse when stale.
- [Project Context](../project-context.md) — v1 scope and liability posture.

## Review Requirements

- Verify no schema table stores a legal fact without `valid_from`, `valid_to`,
  `status`, `source_doc`, `as_of`.
- Verify no duty lookup is keyed by HS code alone — schedule and date are
  mandatory arguments with no defaults in the data layer.
- Verify `hs_version` is present and never defaulted to AHTN 2022 in code.
- Verify ingestion is append-only and that overlap detection runs as a gate.
- Verify the output contract surfaces `as_of` and the citing decree, and refuses
  on possible staleness.
