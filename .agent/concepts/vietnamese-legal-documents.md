---
type: concept
status: active
updated: 2026-07-17
related:
  - ../project-context.md
  - ../business-rules.md
  - ../index.md
---

# Vietnamese Legal Documents (VBQPPL)

How the Vietnamese legal document system actually behaves, for agents building the Customs Assistant. **Assume your training data is wrong about this domain.** Vietnam restructured its ministries in 2025, split and replaced several core logistics statutes in 2025–2026, and changed the legal status of consolidated texts in June 2026. Every claim below carries a verification date and a source; claims the research could not confirm are quarantined in [Unverified / Do Not Rely On](#unverified--do-not-rely-on).

**Verification baseline for this whole note: 2026-07-17.** Anything without a source line is a modelling recommendation, not a fact.

---

## 1. Hierarchy of norms

| Tier | Instrument | Issued by | Notes |
|---|---|---|---|
| 1 | **Luật / Bộ luật** | Quốc hội | Highest ordinary norm. `NN/YYYY/QHXX` (e.g. `35/2024/QH15`). |
| 1b | **Pháp lệnh / Nghị quyết** | Ủy ban Thường vụ Quốc hội | `NN/YYYY/UBTVQHXX`. Also **Nghị quyết** of Chính phủ (`NQ-CP`) — see the food-safety saga in §5, where an NQ suspended a Nghị định. |
| 2 | **Nghị định** | Chính phủ | `NN/YYYY/NĐ-CP`. "Quy định chi tiết" a Luật. Where most operative customs detail lives. |
| 3 | **Thông tư** | A Bộ trưởng | `NN/YYYY/TT-<BỘ>`. The HS↔requirement mapping annexes live here. |
| 4 | **Quyết định / Công văn** | Thủ tướng, Bộ, Cục | `QĐ-TTg`, `QĐ-BCT`, `CV .../CHQ-GSQL`. Công văn is **guidance, not a norm** — it does not create obligations, but customs officers act on it. |

**Why the tiering matters for retrieval, not just for tidiness:** research 02 documents failure mode #6 — *training data overriding retrieval context*. An LLM has read far more text stating a general rule (from a Luật) than text stating a narrow exception (in a Thông tư), and will stay loyal to its training data over your retrieved chunk. In customs work the exception in the Thông tư is usually the answer. Hierarchy must be an explicit, surfaced field so the model cannot silently prefer the more famous general rule. *(verified 2026-07-17, source: https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf)*

### The 2025 restructuring — this breaks issuer-based lookup

Effective ~Feb–Mar 2025, government reorganised to **14 bộ + 3 cơ quan ngang bộ**, and the **cấp tổng cục tier was abolished entirely**. *(verified 2026-07-17, source: https://thesaigontimes.vn/chinh-phu-khoa-xv-con-14-bo-3-co-quan-ngang-bo-bo-cap-tong-cuc/)*

| Before | Now (2026) | When |
|---|---|---|
| Bộ Giao thông vận tải + Bộ Xây dựng | **Bộ Xây dựng** (23 units) | Bộ GTVT ceased **18/02/2025**; merger effective **01/03/2025** |
| Bộ NN&PTNT + Bộ TN&MT | **Bộ Nông nghiệp và Môi trường (BNNMT)** (30 units) | operational **01/03/2025** |
| Bộ TT&TT + Bộ KH&CN | **Bộ Khoa học và Công nghệ** | 2025 |
| **Tổng cục Hải quan** | **Cục Hải quan**, under Bộ Tài chính | tổng cục tier removed |
| Cục Hàng hải VN + Cục ĐTNĐ | **Cục Hàng hải và Đường thủy VN (VIMAWA)** | 2025 |
| Bộ Công Thương, Bộ Y tế | unchanged | — |

*(verified 2026-07-17, sources: https://xaydungchinhsach.chinhphu.vn/co-cau-to-chuc-moi-cua-bo-nong-nghiep-va-moi-truong-tu-1-3-2025-119250301070610666.htm · https://vnexpress.net/bo-xay-dung-sau-hop-nhat-co-23-don-vi-4855091.html · https://plo.vn/tu-ngay-1-3-khong-con-ten-bo-giao-thong-van-tai-post836639.html · https://moc.gov.vn/vn/tin-tuc/1173/83921/ky-vong-lon-sau-hop-nhat-bo-giao-thong-van-tai-va-bo-xay-dung.aspx)*

Note the two dates for Bộ GTVT: research 08 records the ministry ceasing **18/02/2025**, research 03 records the merger effective **01/03/2025**. Both are reported; treat 18/02 as the cessation and 01/03 as the new structure going operational rather than assuming one is an error.

**The practical consequence — this is the part that breaks code.** Circular prefixes changed mid-corpus:

- `TT-BGTVT` → `TT-BXD`
- `TT-BNNPTNT` → `TT-BNNMT`
- `...-TCHQ` → `...-CHQ` (e.g. rollout guidance for NĐ 167/2025 issued as **CV 21067/CHQ-GSQL**)

Legacy circulars **keep their old designation** — TT 01/2024/TT-BNNPTNT is still called that — but the issuing authority is now BNNMT. So the document number and the live issuer disagree, permanently, for the entire pre-2025 corpus.

> **Model ministries as entities with aliases and validity ranges, never as a name string on the document.** A lookup keyed on ministry name breaks across the entire vertical: "find all Bộ Xây dựng transport circulars" must return `TT-BGTVT` documents, and "who issues this?" for a 2021 `TT-BGTVT` must answer "Bộ Xây dựng" today and "Bộ GTVT" as of 2021. Both queries are real and both are wrong under a string field. *(verified 2026-07-17, source: research 03 headline correction #5 and research 08 §1)*

---

## 2. Internal structure

```
Phần → Chương → Mục → Điều → Khoản → Điểm
```

**Điều is the citable unit.** A practitioner cites "Điều 42 Luật Đường bộ", not a page or a paragraph. Khoản and Điểm are addressable *within* an Điều ("điểm a khoản 20 Điều 7").

**Why this is load-bearing rather than cosmetic:** structural chunking is not a stylistic preference — it is measured. On the German civil code (structurally near-identical: `§`≈Điều, `Absatz`≈Khoản, `Satz`≈Điểm), 21 chunking strategies over 525 gold-labelled questions gave Recall@10 of **0.47 (subsection) / 0.46 (section) / 0.45 (sentence)** versus **0.31–0.37 for every fixed-size strategy**. Structural units are statistically indistinguishable from each other but decisively beat everything non-structural. *(verified 2026-07-17, source: https://arxiv.org/pdf/2605.19806)*

The actionable form: **index per Khoản, return the parent Điều.** Don't agonise over Điều-vs-Khoản as the index unit — the measurable rule is *never cut across a structural boundary*. See the RAG concept notes for the full retrieval argument; what belongs here is why the document model must carry the hierarchy explicitly: you cannot retrieve on a structure you didn't store.

---

## 3. Hiệu lực is not a boolean and not an afterthought

Four states, all of which occur:

| State | Meaning |
|---|---|
| **Còn hiệu lực** | In force. |
| **Hết hiệu lực một phần** | Partly repealed — some Điều/Khoản dead, the rest live. |
| **Hết hiệu lực toàn bộ** | Fully repealed. |
| **Chưa có hiệu lực** | Issued, published, **not yet in force**. Real law-on-paper that must not be served as current. |

**The number that justifies the entire temporal apparatus:** SBV-LawGraph inventoried 1,703 State Bank of Vietnam documents and found **863 fully repealed, 191 partially repealed, 639 effective** — i.e. **~62% of a real Vietnamese corpus is dead or partly dead law**. *(verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)*

If you ingest a Vietnamese legal corpus without temporal filtering, the majority of what you retrieve is wrong. This is not a tail risk; it is the base rate.

And it is a *measured* LLM failure mode, not a hypothetical: across 312 validated German statutory QA pairs and five major LLMs, two distinct temporal failures appear — (1) applying **outdated rules** after legislation changed (training-cutoff staleness), and (2) **preferring newer provisions even when the older version applies** — a recency bias that **RAG alone does not fix**. The finding that matters: approaches treating temporal validity as a **hard constraint (a filter, not a ranking signal)** substantially improve performance. *(verified 2026-07-17, source: https://arxiv.org/abs/2605.23497)*

> **Design directive:** extract the as-of date from the query, then *filter* the candidate set. Do not hope the reranker sorts it out. It measurably does not.

### Valid time vs transaction time are genuinely different here

Not academic pedantry — four concrete Vietnamese mechanisms force the distinction *(verified 2026-07-17, source: https://arxiv.org/abs/2505.00039 and research 02 §2)*:

- **vacatio legis is ubiquitous.** Published date ≠ effective date. Vietnamese statutes state it in the text: *"Luật này có hiệu lực thi hành từ ngày 01/7/2026."* The gap is normally months.
- **Retroactive effect (hiệu lực trở về trước)** is restricted but permitted.
- **Delayed / conditional effectiveness** — per-clause, see §4.
- **Corrigenda (đính chính)** change the official record **without changing valid time**. The text you hold was wrong; the law was never different.

Only a bitemporal model distinguishes "what was the law on 2023-05-01?" from "what did we *believe* the law was on 2023-05-01, given the record as it then stood?" A customs declaration is judged against the first; a dispute about a past declaration needs the second.

**Modelling pattern worth stealing (SAT-Graph):** abstract **Work** vs versioned **Expression**; components (Chương/Điều) form the graph backbone taken from the document's *intrinsic structure*, explicitly **not** from LLM entity extraction; each component carries **Component Temporal Versions (CTV)** with validity intervals; a point-in-time query is a deterministic interval predicate `tv.valid_start ≤ t < coalesce(tv.valid_end, +∞)`. The efficiency trick: a new parent CTV on date Dₙ is an **aggregation that reuses the unchanged children's existing CTVs** — you do not duplicate a whole Luật on every amendment, only changed components get new versions. **Honest caveat: SAT-Graph implements valid time only, not true bitemporality, and reports no quantitative evaluation.** Adopt the data model; do not cite it as proof of performance. *(verified 2026-07-17, source: https://arxiv.org/abs/2505.00039)*

---

## 4. ⚠️ The worked example that proves per-clause temporal modelling is mandatory

This single case contains all three traps. It is the reason a `document.effective_date` column is insufficient.

**Luật Giao thông đường bộ 2008 (23/2008/QH12) is DEAD since 01/01/2025.** It was **split, not amended**, into two laws, both passed 27/06/2024 (QH XV, kỳ họp 7), both effective 01/01/2025 *(verified 2026-07-17, sources: https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/49-vbhn-vpqh.pdf · https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf · https://vanban.chinhphu.vn/?pageid=27160&docid=211194&classid=1&typegroupid=3)*:

| Law | Scope | Administered by |
|---|---|---|
| **35/2024/QH15 — Luật Đường bộ** (6 chương, 86 điều) | hạ tầng đường bộ, quy hoạch, đầu tư/xây dựng, quản lý–vận hành–bảo trì, **vận tải đường bộ**, cơ sở dữ liệu đường bộ, ITS | **Bộ Xây dựng** ← the logistics-relevant half |
| **36/2024/QH15 — Luật Trật tự, an toàn giao thông đường bộ** | quy tắc giao thông, người lái, phương tiện, GPLX, đăng ký xe | **Bộ Công an** |

The dividing line: **infrastructure + transport business → 35/2024; traffic rules + drivers → 36/2024.**

**Trap 1 — per-clause delayed effect.** Điều 85 khoản 2 of Luật Đường bộ puts **four provisions in force early, on 01/10/2024**: *"Điểm a và điểm b khoản 2 Điều 42, Điều 43, Điều 50, khoản 1 Điều 84 của Luật này có hiệu lực thi hành từ ngày 01 tháng 10 năm 2024."* A single `effective_date = 2025-01-01` on the document is wrong for four articles by three months.

**Trap 2 — a later law amended the effective-date article itself.** Điều 88 khoản 2 of Luật 36/2024 (the article that schedules the delayed clauses) was **itself amended** by **Luật 118/2025/QH15** (sửa đổi 10 luật về an ninh, trật tự; ban hành 10/12/2025). The effective-date metadata is not metadata — **it is text, and text gets amended.**

**Trap 3 — the amending law has its own split effective dates.** Điều 11 of Luật 118/2025: effective **01/7/2026**, **except điểm a khoản 20 Điều 7 — effective 01/01/2026**. That earlier-effective clause is *precisely* the one rewriting Điều 88 khoản 2, i.e. the postponement of the child-restraint rule landed **01/01/2026, one day before the original deadline would have bitten.**

Net result, current as of 17/07/2026:

| Provision | Commonly cited | **Actual** |
|---|---|---|
| Khoản 3 Điều 10 — child restraint (<10 tuổi & <1,35 m; not in the driver's row) | 01/01/2026 | **01/7/2026** — in force now |
| Khoản 2a Điều 35 — camera recording the driver (xe KDVT hành khách <8 chỗ; xe KDVT hàng hóa trừ đầu kéo; xe vận tải nội bộ) | — (new) | **01/01/2028** |
| Khoản 2a Điều 35 — camera in the passenger cabin (xe KDVT hành khách ≥8 chỗ) | — (new) | **01/01/2029**, per a Government roadmap |

*(verified 2026-07-17, sources: https://vanban.chinhphu.vn/?classid=1&docid=216534&orggroupid=1&pageid=27160 · https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/3/55-vbhn-vpqh.pdf)*

**The "01/01/2026 child restraint" date that a model will confidently produce from training data is stale. It is 01/7/2026.** That is the whole lesson in one line.

Repeal carve-outs, for completeness: Luật GTĐB 2008 is repealed by Điều 88 khoản 3 of Luật 36/2024 and Điều 85 khoản 3 of Luật 35/2024, **with narrow carve-outs** via Điều 89 khoản 1, 2, 5, 6 of Luật 36/2024 and Điều 86 of Luật 35/2024 (chuyển tiếp for expressway projects). Even "dead" is not a boolean.

**A law's headline effective date is not enough.** The engine must track (a) per-clause delayed effect, (b) later amendments to the effective-date article itself, and (c) amending laws whose own clauses have split effective dates.

---

## 5. The volatility that makes a static rules DB wrong

Food safety, 2026, verified — the single best argument against a static rules table *(verified 2026-07-17, sources: https://vanban.chinhphu.vn/?pageid=27160&docid=192829 · https://vanban.chinhphu.vn/?docid=216891&pageid=27160 · https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-09-2026-nd-cp-ve-tam-ngung-nghi-dinh-46-2026-nd-cp-ve-huong-dan-thi-hanh-luat-an-toan-thuc-pham-119260205135642533.htm · https://baochinhphu.vn/tiep-tuc-ap-dung-nghi-dinh-15-2018-nd-cp-ve-an-toan-thuc-pham-cho-den-khi-co-quy-dinh-moi-102260408123934123.htm)*:

1. **NĐ 15/2018/NĐ-CP** — the long-standing framework. Phụ lục I splits responsibility across Bộ Y tế / Bộ Công Thương / Bộ NN.
2. **NĐ 46/2026/NĐ-CP (26/01/2026)** issued to replace it, plus **NQ 66.13/2026/NQ-CP (27/01/2026)** on công bố/đăng ký sản phẩm.
3. **NQ 09/2026/NQ-CP (04/02/2026) SUSPENDED both** — barely a week after issuance — initially until 15/4/2026.
4. Suspension **extended** (report dated 08/4/2026): now suspended **until the amended Food Safety Law and its implementing decree take effect**.
5. **NĐ 15/2018 therefore remains the operative rule today, 17/07/2026.**

A decree can be law-on-paper, superseded, suspended, and un-suspended **within 10 weeks**. A model that "knows" NĐ 46/2026 replaced NĐ 15/2018 is reading step 2 and stopping.

> **Every rule needs an `as_of` date and a status field, not just a citation.** Minimum: `effective_from`, `effective_to`, `suspended_by`, `superseded_by`. Note that **suspension is a distinct state from repeal** — a suspended decree is not dead, it is paused, and it can come back. A two-state (`active`/`repealed`) model cannot represent NĐ 46/2026 at all.

Two corollaries from the same research:

- **Transitional clauses are not a clean date cutover.** TT 28/2026/TT-BCT (food safety, Bộ Công Thương, effective 17/7/2026): filings submitted before the effective date follow the **old** rules *unless the trader opts in*. The applicable rule depends on filing date **and a trader election** — not on the query date alone.
- **Not everything keys on HS code.** CITES keys on **species**; phế liệu keys on HS **plus a firm-level giấy phép môi trường**; the post-Luật 78/2025 quality regime keys on **risk tier**. An HS-only data model is structurally insufficient for the non-tariff layer. *(verified 2026-07-17, source: research 08 §3)*

---

## 6. ⭐ Văn bản hợp nhất (VBHN) became officially citable on 01/7/2026

**This is the most consequential legal change for this project's architecture, and it happened last month.**

**Pháp lệnh 01/2026/UBTVQH16** (UBTVQH, issued **10/6/2026**, effective **01/7/2026**) amends the 2012 Pháp lệnh hợp nhất VBQPPL. Verified against Công báo, not law-firm blogs. The decisive text:

> **"Văn bản hợp nhất được cơ quan, tổ chức, cá nhân sử dụng làm căn cứ chính thức trong viện dẫn và áp dụng pháp luật."**

Consolidated texts are now an **official basis for citing and applying law**. *(verified 2026-07-17, sources: https://congbao.chinhphu.vn/van-ban/phap-lenh-so-01-2026-ubtvqh16-469837.htm · https://xaydungchinhsach.chinhphu.vn/van-ban-hop-nhat-duoc-su-dung-lam-can-cu-chinh-thuc-trong-vien-dan-va-ap-dung-phap-luat-119260625165619689.htm)*

**Why this matters so much:** previously hợp nhất was a *convenience with no independent legal authority* — you were formally obliged to cite the original document plus each amending document. That was exactly the legal objection that would have blocked a hợp nhất-based architecture. **It was removed this month.** Any reasoning inherited from pre-June-2026 sources (including model training data) is arguing against a rule that no longer exists.

Also in the Ordinance:

- Scope **expanded to local (provincial/commune) VBQPPL** — previously central agencies only.
- Objects **expanded** to partial repeal / partial suspension / partial continuation of effect.
- **First time AI / digital transformation is officially named** in Vietnamese law on consolidation, with MOJ leading.

Free consolidated texts are published at **vbpl.vn**.

### Use published VBHN as the text layer. Do NOT compute consolidation.

Three reasons, in order of strength:

1. **[Established]** It is now legally citable (above), so your citations inherit official authority. Computed text has no authority to fall back on.
2. **[Established]** **SAT-Graph — the most developed academic temporal model available — also declines to compute it.** It "assumes the legal text corpus already contains these finalized versions"; amendment Actions **explain** transitions rather than **execute** them. If the leading structural approach won't parse "sửa đổi Khoản 2 Điều 5" into a text mutation, that is a strong signal about the difficulty. *(verified 2026-07-17, source: https://arxiv.org/abs/2505.00039)*
3. Vietnamese amendment instructions are **natural-language and irregular**: *"bổ sung Điều 5a"*, *"bãi bỏ cụm từ X tại Khoản 2"*, *"thay thế cụm từ..."*. A text-mutation engine is a correctness liability with unbounded edge cases.

### But VBHN alone is insufficient — three gaps

- **Coverage gaps.** Not every văn bản has a current hợp nhất; publication lags amendment. (Live example: NĐ 218/2026 amends NĐ 158/2024 effective 10/08/2026 — no consolidated text will exist at the moment it bites.)
- **No temporal history.** A VBHN is a *snapshot*. "What applied in 2023?" needs versioning **on top of** it — the CTV/valid-interval model from §3.
- **No provenance.** "Which Nghị định changed this Khoản, and when?" needs the **amendment graph** regardless.

**Synthesis:** VBHN as the *text* layer; an explicit amendment/reference **graph** as the *provenance + temporal* layer. *(the legal change is Established; this architecture split is a design inference from research 02, not a published result)*

The graph needs few relation types. SBV-LawGraph — the one system empirically tackling this on Vietnamese law — uses exactly four: **Amend/Supplement, Repeal, Replace, Guidance/Regulation** (the last being the Luật→Nghị định→Thông tư hierarchy). *(verified 2026-07-17, source: https://lexuanbach.github.io/publication/ACIIDS2026a.pdf)*

### Known VBHN for this vertical

Index these as the primary text wherever one exists. **Base texts alone are actively misleading in ≥6 sub-domains.** *(verified 2026-07-17, source: research 03; individual sources in the corpus tables below)*

| VBHN | Consolidates | Dated |
|---|---|---|
| **52/VBHN-VPQH** | Bộ luật Hàng hải | ~05/2026 |
| **56/VBHN-VPQH** | Luật GTĐTNĐ | 23/03/2026 |
| **96/VBHN-VPQH** | Luật Thuế XNK | 31/03/2026 |
| **49/VBHN-VPQH** | Luật Đường bộ | 03/2026 |
| **55/VBHN-VPQH** | Luật TTATGTĐB | 03/2026 |
| **46/VBHN-BTC** | NĐ 08/2015 (customs procedure) | — |
| **24/VBHN-BCT** | NĐ 69/2018 (quản lý ngoại thương) | 2026 |

Research 03 also lists **08/VBHN-BGTVT** (NĐ 08/2021, đường thủy nội địa) — note the legacy `-BGTVT` suffix on a document consolidated after the ministry ceased to exist, which is itself an instance of the aliasing problem in §1.

---

## 7. The logistics corpus — inventory by sub-domain

Condensed from research 03 (verified 2026-07-17 against chinhphu.vn / vanban.chinhphu.vn, moc.gov.vn, caa.gov.vn, luatvietnam.vn). **Method caveat carried forward: thuvienphapluat.vn `/van-ban/` pages return HTTP 403 to automated fetch, so statuses came from mirrors and government portals — and vanban.chinhphu.vn does not render a hiệu lực field, so "no termination note" is weak evidence of being in force.**

### ⚠️ Headline corrections to stale training data

| Belief a model will hold | Verified reality |
|---|---|
| Luật Giao thông đường bộ 2008 governs road transport | **DEAD 01/01/2025** — split into 35/2024 + 36/2024 (§4) |
| **NĐ 10/2020** governs road transport business | **BÃI BỎ 01/01/2025** → **NĐ 158/2024** (18/12/2024, eff. 01/01/2025), *itself already amended* by **NĐ 218/2026** (19/06/2026, **eff. 10/08/2026 — not yet in force**) |
| Luật Đường sắt 2017 (06/2017/QH14) | **DEAD 01/01/2026** → **Luật Đường sắt 2025 (95/2025/QH15)** |
| Luật HKDD 2006/2014 | **DEAD 01/07/2026 — 17 days ago** → **Luật HKDD 2025 (130/2025/QH15)**. Highest-volatility area in the corpus right now |
| Bộ GTVT issues transport circulars | **Bộ GTVT no longer exists** (§1) |
| — | **Luật TMĐT 122/2025/QH15 is NEW**, eff. 01/07/2026 — first standalone e-commerce law; covers "dịch vụ hỗ trợ TMĐT", which reaches logistics providers |

*(sources: https://vanban.chinhphu.vn/?pageid=27160&docid=212082 · https://vanban.chinhphu.vn/?classid=1&docid=218537&orggroupid=2&pageid=27160 · https://moc.gov.vn/pl/pages/ChiTietVanBan.aspx?vID=460&TypeVB=1 · https://vanban.chinhphu.vn/?pageid=27160&docid=216536&classid=1&orggroupid=1 · https://vanban.chinhphu.vn/?pageid=27160&docid=216503&classid=1&orggroupid=1)*

### 7.1 Dịch vụ logistics (framework)

- **36/2005/QH11 Luật Thương mại — Điều 233–240** (dịch vụ logistics: định nghĩa, quyền/nghĩa vụ, miễn trách, giới hạn trách nhiệm, quyền cầm giữ). In force since 01/01/2006; amended by Luật QLNT 05/2017/QH14 and Luật PCTH rượu bia 44/2019/QH14 — **Điều 233–240 untouched**.
- **163/2017/NĐ-CP** — kinh doanh dịch vụ logistics (17 loại dịch vụ; giới hạn trách nhiệm; điều kiện đầu tư nước ngoài). In force (30/12/2017, eff. 20/02/2018) and **never amended in 8.5 years** — remarkable in this corpus. A full replacement is **publicly committed but not issued** (the 17-service list is obsolete; no e-commerce/green/circular logistics; MOIT–MOC jurisdiction unclear).
- **122/2025/QH15 Luật Thương mại điện tử** — passed 10/12/2025, eff. **01/07/2026**. Transitional: pre-01/07/2026 registrations valid to 30/06/2027.

### 7.2 Vận tải đa phương thức — the most neglected sub-domain

- **87/2009/NĐ-CP** — in force but **partially gutted**: **Chương 3 bãi bỏ** by NĐ 144/2018.
- **89/2011/NĐ-CP** — **HẾT HIỆU LỰC**, bãi bỏ toàn bộ by NĐ 144/2018.
- **144/2018/NĐ-CP** (16/10/2018, eff. same day) — in force, not replaced.

Governing text is 17 years old with no update in 8. **Read via VBHN (87/2009 + 144/2018), not the base decree** — the base decree still contains a repealed Chương 3.

### 7.3 Hàng hải

- **95/2015/QH13 Bộ luật Hàng hải** (eff. 01/07/2017), amended by **35/2018/QH14**, **Luật Giá 16/2023/QH15**, **81/2025/QH15**, **Luật Quy hoạch 112/2025/QH15** (eff. 01/03/2026). → **use 52/VBHN-VPQH**.
- **58/2017/NĐ-CP** — quản lý hoạt động hàng hải (cảng biển, luồng, thủ tục tàu vào/rời cảng). In force, amended.
- **34/2025/NĐ-CP** (25/02/2025, eff. 10/04/2025) — sửa các NĐ lĩnh vực hàng hải. Key change: public shipping lanes now managed by **VIMAWA** directly, not by maritime-safety enterprises.
- **160/2016/NĐ-CP** — điều kiện KD vận tải biển, đại lý tàu biển, lai dắt. Amended by **147/2018** (abolished the "Giấy chứng nhận đủ điều kiện KD vận tải biển") and **69/2022**.
- **38/2017/NĐ-CP** — cảng cạn / **ICD** (eff. 01/07/2017). Điều 18 = ICD→cảng cạn conversion.

### 7.4 Đường bộ

- **35/2024/QH15** + **36/2024/QH15** — see §4. VBHN: 49 and 55/VBHN-VPQH.
- **165/2024/NĐ-CP** (26/12/2024, eff. 01/01/2025) — chi tiết Luật Đường bộ + Điều 77 Luật TTATGTĐB: quy hoạch, phân loại đường, hành lang ATĐB, đất dành cho đường bộ, tổ chức giao thông, thẩm tra ATGT.
- **168/2024/NĐ-CP** (26/12/2024, eff. 01/01/2025; some provisions eff. 01/01/2026) — xử phạt VPHC về TTATGT đường bộ; **trừ điểm/phục hồi điểm GPLX**. Replaced NĐ 100/2019; fines up sharply — a material compliance-cost item for fleets.
- **158/2024/NĐ-CP** (eff. 01/01/2025) — hoạt động vận tải đường bộ; replaced NĐ 10/2020 in full. Covers ô tô + xe bốn bánh có gắn động cơ + vận tải quốc tế theo điều ước.
- **218/2026/NĐ-CP** (19/06/2026, **eff. 10/08/2026 — NOT YET IN FORCE**) — sửa NĐ 158/2024. Tightens xe hợp đồng (no per-passenger seat confirmation, no ticket sales, no fare collection like tuyến cố định); niên hạn xe hợp đồng; bus subsidy policy. **From 01/01/2028**: contract-transport operators must share contract data with Bộ Công an / Cục CSGT pre-trip. **Must be date-gated, not served as current law today.**

### 7.5 Đường thủy nội địa

- **23/2004/QH11** (eff. 01/01/2005) + **48/2014/QH13**, further amended by Luật Phí & lệ phí 2015, **35/2018/QH14**, Luật PCTH rượu bia 2019, **Luật Quy hoạch 112/2025/QH15** (eff. 01/03/2026) → **use 56/VBHN-VPQH (23/03/2026)**.
- **08/2021/NĐ-CP** (28/01/2021) — quản lý hoạt động ĐTNĐ; amended by **54/2022** (eff. 01/11/2022) and **06/2024** (eff. 10/03/2024).
- **78/2016/NĐ-CP** — điều kiện KD đào tạo thuyền viên; amended by 54/2022.

### 7.6 Đường sắt

- **06/2017/QH14 — HẾT HIỆU LỰC 01/01/2026.**
- **95/2025/QH15 Luật Đường sắt 2025** — passed 27/06/2025 (Lệnh 36/2025/L-CTN, 30/06/2025), in force **01/01/2026**, some provisions early **01/07/2025**. Adds đặc thù mechanisms for socialised rail-infra investment; tax/land/credit incentives.
- **16/2026/NĐ-CP** (14/01/2026) — chi tiết Luật Đường sắt.

### 7.7 Hàng không dân dụng 🔴 highest volatility

- **66/2006/QH11 + 61/2014/QH13 — HẾT HIỆU LỰC 01/07/2026.**
- **130/2025/QH15 Luật HKDD 2025** — passed 10/12/2025, 11 chương / 107 điều, in force **01/07/2026**. Covers tàu bay, cảng hàng không, nhân viên HK, hoạt động bay, **vận tải hàng không thương mại**, hàng không chung, an toàn/an ninh HK, trách nhiệm dân sự. Strengthens Bộ Công an's role in aviation security.
- **133/QĐ-TTg** (19/01/2026) — kế hoạch triển khai.
- Implementing decrees: **see F1 below. This is the highest-risk gap in the inventory.**

### 7.8 Hải quan

- **54/2014/QH13 Luật Hải quan** (eff. 01/01/2015), amended by **71/2014/QH13** and **90/2025/QH15**.
- **90/2025/QH15** — Luật sửa đổi 8 luật (Đấu thầu, PPP, **Hải quan**, Thuế GTGT, **Thuế XNK**, Đầu tư, Đầu tư công, QL tài sản công); passed 25/06/2025, eff. **01/07/2025**. For customs: **sửa Điều 42, 43** (chế độ ưu tiên / AEO — compliance period **3 yrs → 2 yrs**; requires an IT system able to connect and share data with hải quan) and **bổ sung Điều 47a — luật hóa xuất nhập khẩu tại chỗ**. Major for logistics/EPE flows.
- **08/2015/NĐ-CP** — thủ tục HQ, kiểm tra, giám sát, kiểm soát HQ. Heavily amended (**59/2018**, **167/2025**) → **use 46/VBHN-BTC**.
- **167/2025/NĐ-CP** (eff. **15/08/2025**) — sửa NĐ 08/2015, implements Luật 90/2025. Adds **Điều 22a — trị giá hải quan cho mục đích thống kê**; reworks trị giá hải quan; reorganises the customs org model. Rollout guidance: **CV 21067/CHQ-GSQL**.
- **38/2015/TT-BTC** — the operational core (thủ tục HQ; kiểm tra, giám sát; thuế XNK; quản lý thuế hàng XNK). Amended by **39/2018/TT-BTC** and **121/2025/TT-BTC** (18/12/2025, eff. **01/02/2026**) — described as the largest customs-procedure update in years: standardises the dossier, cuts documents, pushes data interchange via VNSW. **Any dossier-composition logic must target TT 121, not TT 38/39 as previously known.**
- **39/2015/TT-BTC** (+ TT 60/2019) — trị giá hải quan.
- **31/2022/TT-BTC** — Danh mục hàng hóa XNK Việt Nam (**HS code**).
- **85/2019/NĐ-CP** — cơ chế một cửa quốc gia / ASEAN + kiểm tra chuyên ngành. The e-customs backbone; ties specialized inspection to the single window.
- **68/2016/NĐ-CP** + **67/2020/NĐ-CP** — điều kiện KD hàng miễn thuế, **kho bãi, địa điểm làm thủ tục hải quan**, kho ngoại quan, CFS. ← the "kho bãi" legal hook.
- **31/2018/NĐ-CP** — xuất xứ hàng hóa / **C/O**.

### 7.9 Thuế xuất nhập khẩu

- **107/2016/QH13 Luật Thuế XNK** (eff. 01/09/2016), amended by **90/2025/QH15** and **133/2025/QH15** → **use 96/VBHN-VPQH (31/03/2026)**.
- **134/2016/NĐ-CP** — miễn thuế, hoàn thuế, SXXK, GC. Amended by **18/2021** and **182/2025** (eff. 01/07/2025 — sửa Điều 24; **bãi bỏ Điều 19**).
- **26/2023/NĐ-CP** — Biểu thuế XK, Biểu thuế NK ưu đãi, danh mục & mức thuế tuyệt đối, **plus a family of ~15–20 FTA-specific biểu thuế decrees, one per FTA** (CPTPP, EVFTA, RCEP, UKVFTA, ATIGA, ACFTA…).
- **48/2024/QH15 Luật Thuế GTGT 2024** (eff. 01/07/2025) — import VAT; 0% for exported services, which bites directly on international freight forwarding.
- **108/2025/QH15 Luật Quản lý thuế** (ban hành 10/12/2025, eff. **01/07/2026**) — **replaces Luật QLT 38/2019/QH14**. Governs customs-tax administration, ấn định thuế, kiểm tra sau thông quan. **In force 17 days.**

### 7.10 Quản lý ngoại thương

- **05/2017/QH14 Luật Quản lý ngoại thương** (eff. 01/01/2018).
- **69/2018/NĐ-CP** (15/05/2018) — danh mục cấm/hạn chế XNK, giấy phép, **tạm nhập tái xuất, quá cảnh, chuyển khẩu**, gia công. In force, evidenced by **24/VBHN-BCT (2026)** consolidating it. Implementing circular: **TT 12/2018/TT-BCT** — Phụ lục I (used consumer goods / medical devices / vehicles banned from import, by HS; **replaced by TT 08/2023/TT-BCT**), Phụ lục II (goods suspended from TNTX/chuyển khẩu).
- **10/2018/NĐ-CP** — phòng vệ thương mại.

### 7.11 Kho bãi / cảng / ICD — no standalone statute

**There is no "Luật Kho bãi."** Coverage is assembled:

| Facility | Legal hook |
|---|---|
| Cảng biển | BLHH 2015 Chương IV + NĐ 58/2017 + NĐ 34/2025 |
| Cảng cạn / ICD | NĐ 38/2017 (+ QĐ 979/QĐ-TTg quy hoạch cảng cạn) |
| **Kho ngoại quan / CFS / địa điểm làm thủ tục HQ** | **NĐ 68/2016 + NĐ 67/2020** |
| Cảng thủy nội địa / bến thủy | NĐ 08/2021 + 54/2022 + 06/2024 |
| Cảng hàng không | Luật HKDD 130/2025 + its pending cảng hàng không decree (see F1) |
| Kho hàng hóa thông thường | Luật Đất đai 2024, Luật Xây dựng 2014/2020, Luật PCCC&CNCH 2024 (eff. 01/07/2025), Luật BVMT 2020 — **generic, not logistics-specific** |

---

## 8. Corpus sizing

*(verified 2026-07-17, source: research 03 — these are the research's estimates, and the Thông tư component is explicitly unverified; see F7)*

| Target | Size |
|---|---|
| **Core working set** (what a practitioner must actually know) | **~55–70 documents** — roughly 15 luật/bộ luật, 20–25 nghị định, 20–30 thông tư |
| **Reasonable RAG coverage** of the vertical | **≈190–230 documents** (~18 luật, ~55 nghị định, ~120–140 thông tư) |
| **Exhaustive** incl. QCVN, quyết định, biểu thuế FTA, công văn hướng dẫn, VBHN | **≈420–550 documents** |

Useful calibration: the core working set is small enough that **human curation of the ~60 documents is tractable and probably correct for v1**, and the exhaustive set is small enough that the corpus is never a scale problem. The problem is temporal correctness, not volume.

---

## Unverified / Do Not Rely On

Reproduced from research 03's flags F1–F10 and research 08's unverified list. **Do not launder any of these into a confident statement.**

### From research 03 (logistics corpus inventory)

| # | Item | Problem |
|---|---|---|
| **F1** 🔴 | **Hàng không implementing decrees — HIGHEST RISK** | Luật HKDD 130/2025 took effect **17 days ago**. Five decrees (nhà chức trách HK & quản lý an toàn; tàu bay & khai thác tàu bay; hoạt động bay; **cảng hàng không, bãi cất hạ cánh**; **vận tải hàng không**) were slated for Government submission **04/2026** — **issuance could not be confirmed for any of them.** The air-cargo-relevant decree is in this batch. **NĐ 215/2026 (an ninh hàng không, eff. 01/07/2026)** rests on **one secondary snippet**, not independently confirmed. **Air-cargo rules may currently sit in a transitional gap.** |
| **F2** | **NĐ 69/2018 replacement (ngoại thương)** | Draft public 09/2025 (Deputy PM direction CV 6906/VPCP-KTTH, 24/07/2025; Bộ Tư pháp appraisal 28/11/2025), due to Government 11/2025, with a **01/07/2026** liberalisation date for tạm nhập tái xuất of frozen food / used goods / SCT goods. **No decree number found; promulgation not confirmed.** The existence of 24/VBHN-BCT (2026) implies 69/2018 is still live — but an H1/2026 replacement could have been missed. **Verify directly.** |
| **F3** | **NĐ 163/2017 status** | Confirmed in force via vanban.chinhphu.vn, but **that portal does not render a hiệu lực field** — absence of a termination note is weak evidence. thuvienphapluat.vn (which does show status) **403s to automated fetch**. Replacement decree confirmed as *intended*, not as *issued*. **Medium confidence.** |
| **F4** | **NĐ 87/2009 / 144/2018 (VTĐPT)** | "Still in force, not replaced" comes from **secondary commentary**, not a status page. **Medium confidence.** |
| **F5** | **NĐ 38/2017 (cảng cạn / ICD)** | No live confirmation of amendment status. **QĐ 428/QĐ-BXD (31/03/2026)** surfaced in this space and VIMAWA is publicly building new cảng cạn policy — **relationship to NĐ 38/2017 unverified.** |
| **F6** | **NĐ 160/2016 post-2025** | Amendments by 147/2018 + 69/2022 confirmed. **Could not verify** whether **NĐ 34/2025** ("sửa đổi các NĐ trong lĩnh vực hàng hải" — plural) also touched 160/2016. Likely, unconfirmed. |
| **F7** ⚠️ | **The Thông tư layer was never enumerated — the single largest unverified mass** | All circular counts in §8 are **estimates, not verified lists**. The Bộ GTVT→Bộ Xây dựng merger (01/03/2025) means **an unknown number of `TT-BGTVT` circulars have been reissued or amended as `TT-BXD`** — and the Thông tư layer is exactly where the operational HS↔requirement detail lives. |
| **F8** | **NĐ 218/2026** | Confirmed via luatvietnam + vanban.chinhphu.vn (docid=218537). **Eff. 10/08/2026 — not yet in force.** Any system **must date-gate it**, not serve it as current law today. |
| **F9** | **Bộ luật Hàng hải (sửa đổi)** | Bộ Xây dựng comparison table dated **27/04/2026** confirms active redrafting. **Timeline and scope unknown.** |
| **F10** | **Luật Thương mại (sửa đổi)** | MOIT package (with Cạnh tranh / QLNT / BVQLNTD) confirmed in drafting; **no passage confirmed.** **Điều 233–240 (dịch vụ logistics) could move.** |

### From research 08 (quản lý chuyên ngành)

- **TT 15/2026/TT-BCT, TT 26/2026/TT-BCT, VBHN 47/VBHN-BCT** — single low-confidence extraction.
- **NĐ 169/2026/NĐ-CP** (customs penalties, eff. 01/07/2026, replacing NĐ 128/2020) and **NĐ 153/2026/NĐ-CP** (địa bàn hoạt động hải quan, eff. 05/07/2026) — single search-summary source; **numbering is suspicious**. Confirm before citing.
- **VBHN 67/VBHN-BNNMT** (kiểm dịch động vật trên cạn) — single source.
- **"Danh mục hàng hóa nhóm 2 bị xóa bỏ từ 2026"** under **Luật 78/2025/QH15** (sửa Luật Chất lượng sản phẩm hàng hóa, eff. 01/01/2026) — **contested, load-bearing for any rules engine, and resting on a single commercial source**. What *is* confirmed about Luật 78/2025: it repeals Điều 7; khoản 4 Điều 13; khoản 2,3 Điều 17; Điều 19, 20, 24, 25, 26, 27, 29, 30, 31, 35, 36, 37, 55, and introduces **risk-based classification (thấp/trung bình/cao)**. Whether công bố hợp quy is *restructured* or *abolished* is **not settled**.
- Whether any **BNNMT circular has replaced TT 01/2024/TT-BNNPTNT** (the master HS table) — unconfirmed; treat 01/2024 as current but re-verify.

### From research 05 (road traffic)

- **Luật Quy hoạch 112/2025/QH15's effect on Luật Đường bộ is contested in the sources themselves.** Luật 118/2025's own căn cứ (quoted in both VBHN) cites *"Luật Đường bộ số 35/2024/QH15 đã được sửa đổi, bổ sung theo Luật số 112/2025/QH15"* — but the header of **49/VBHN-VPQH** (signed 03/2026) lists **only** Luật 118/2025 as an amending law and **does not mention 112/2025**. Treat Luật Đường bộ as amended by both, but **the exact articles touched by 112/2025 were not confirmable** and need a check against the full text (https://congbao.chinhphu.vn/van-ban/luat-so-112-2025-qh15-468674.htm). *This is itself a good illustration: two official consolidated documents disagree about the amendment chain.*
- **Not verified:** the xử phạt regime under NĐ 168/2024 and its amendments; press reports of an 800.000–1.000.000 đ fine from 01/07–14/08/2026 then cảnh cáo from 15/08/2026 for the child-restraint rule.

---

## What this means for the data model

A checklist derived from the above, not a restatement of it:

1. **Ministries are entities with aliases and validity ranges**, never name strings (§1).
2. **Hiệu lực is a per-provision interval, not a per-document flag** (§3, §4). The unit of temporal versioning is the Điều/Khoản, not the văn bản.
3. **Effective-date articles are amendable text** — model them as content, and expect the amendment chain to reach them (§4, trap 2).
4. **Status ≠ {active, repealed}.** You need at least: `effective_from`, `effective_to`, `suspended_by`, `superseded_by`, `partially_repealed_by`, plus `chưa có hiệu lực` as a first-class state (§3, §5).
5. **Temporal validity is a hard filter, not a ranking signal** — measured, not assumed (§3).
6. **VBHN is the text layer; the amendment graph is the provenance + temporal layer. Never compute consolidation** (§6).
7. **Everything carries an `as_of`.** The food-safety saga (§5) took 10 weeks to go issued → suspended → extended. A citation without a date is not an answer.
8. **Not everything keys on HS** — species (CITES), firm-level permits (phế liệu), risk tier (Luật 78/2025) (§5).

---

## Related Knowledge

- [Project Context](../project-context.md) — what Customs Assistant is, its v1 boundaries, and why v1 keeps AI off the tariff numbers.
- [Business Rules](../business-rules.md) — durable policy and compliance rules; the `as_of` + status discipline in §5 belongs here when rules are recorded.
- [Agent Memory Index](../index.md) — navigation map for durable memory, including sibling `concepts/` notes.
- [Agent Rules](../AGENTS.md) — repo conventions this note follows (English docs, plain Markdown, relative links).
- [Architecture Decision Index](../architecture-decisions/README.md) — record the VBHN-as-text-layer and hard-temporal-filter choices (§3, §6) as ADRs when they are taken.
