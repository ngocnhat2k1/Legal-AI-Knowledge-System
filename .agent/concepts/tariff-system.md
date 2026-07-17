---
type: concept
status: active
updated: 2026-07-17
related:
  - data-sources.md
  - hs-classification.md
  - ../project-context.md
  - ../business-rules.md
---

# Vietnam Tariff System — Structure, Traps, and Why "The Rate" Is Not a Scalar

This note is the domain model for feature 1 of Customs Assistant (exact, deterministic tariff
lookup keyed by HS + schedule + date). It exists to stop an agent from building the plausible,
confident, wrong thing. Read the annex trap and the temporal killer before writing any parser
or any schema.

Everything below carries a verification date and a source. Where the research was uncertain or
self-contradictory, that is preserved, not smoothed over. See
[Unverified / Do Not Rely On](#unverified--do-not-rely-on) and [Open Conflicts](#open-conflicts).

---

## ⚠️ THE ANNEX TRAP — read this first

**1,520 HS codes appear in BOTH Phụ lục I (export schedule) and Phụ lục II (preferential import
schedule) of Nghị định 26/2023/NĐ-CP. Of those, 1,329 carry a DIFFERENT rate in each annex.**
(verified 2026-07-17, source: research 12 — annex-aware parse of the 14 Công báo `.doc` parts of
NĐ 26/2023 at https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm)

A parser that flattens the decree into one `HS → rate` map, ignoring annex boundaries, returns the
**export** rate in answer to an **import** question. Silently. With no error. At **94% apparent
success**.

Worked example (verified 2026-07-17, source: research 12, same Công báo extraction):

| HS code | Annex | Meaning | Rate |
|---|---|---|---|
| `0301.11.10` | Phụ lục I | Biểu thuế **xuất khẩu** | **0** |
| `0301.11.10` | Phụ lục II | Biểu thuế **nhập khẩu ưu đãi** (MFN) | **15** |

A naive parse of that code yields `['0', '15']` and a flattening step picks one. Whichever it picks,
it is right half the time and reports success either way.

**Why this is the single most important paragraph in the file:** this is what this project looks
like when it fails. Not a crash. Not missing data. Not a blank cell someone notices. It is
plausible-looking wrong data that reports success — attached to a legally binding customs
declaration, where the declarant (not the tool) carries the liability for underpayment,
back-assessment, and penalties (verified 2026-07-17, source: research 12 §3).

**Design consequence:** `annex` / `schedule` is not metadata. It is part of the primary key.
There is no such thing as "the rate for HS 0301.11.10".

---

## 1. MFN base: NĐ 26/2023/NĐ-CP and its amendment chain

**Nghị định 26/2023/NĐ-CP (signed 31/5/2023, effective 15/7/2023) is STILL the base decree — it is
NOT superseded.** It replaced NĐ 122/2016, 125/2017, 57/2020, 101/2021, and 51/2022.
(verified 2026-07-17, source: research 10 §1; https://vanban.chinhphu.vn/?pageid=27160&docid=208020)

Amendment chain — **all of these amend 26/2023; none of them replace it**:

| Decree | Date / effect | Scope |
|---|---|---|
| **144/2024/NĐ-CP** | eff. 16/12/2024 | Amends NĐ 26/2023 (verified 2026-07-17, source: research 12 §3) |
| **199/2025/NĐ-CP** | 08/07/2025 | Raises export + MFN import rates on various items in Phụ lục I & II; adds points c.3.6/c.3.7 to Art. 8(3) (auto assembly programme). Yellow phosphorus 5→10% on 01/01/2026, →15% on 01/01/2027; TMBP 0% only through 08/2025; auto-component volume conditions (verified 2026-07-17, sources: research 10 §1 https://luatvietnam.vn/xuat-nhap-khau/nghi-dinh-199-2025-nd-cp-405228-d1.html ; research 12 §3) |
| **108/2025/NĐ-CP** | 2025 | Export duty on cement clinker (verified 2026-07-17, source: research 10 §1) |
| **72/2026/NĐ-CP** | signed 09/03/2026, eff. same day | MFN rates on petrol/naphtha/reformate and refinery feedstock, 10% → 0%. **Valid only to 30/04/2026.** (verified 2026-07-17, sources: research 10 §1 https://vanban.chinhphu.vn/?amp=&docid=217144&pageid=27160 ; research 12 §3) |
| **201/2026/NĐ-CP** | 08/06/2026 | Export duty rates on several items (verified 2026-07-17, source: research 10 §1 https://english.luatvietnam.vn/decree-no-201-2026-nd-cp-dated-june-08-2026-of-the-government-amending-and-supplementing-export-duty-rates-of-a-number-of-commodity-items-in-the-exp-436911-doc1.html) |

### ⚠️ The amendment chain above is NOT confirmed complete — do not treat it as the consolidation baseline

**The two research reports give different chains, and neither claims to be exhaustive:**

| Source | Chain given |
|---|---|
| Research 10 §1 | 26/2023 ⊕ 199/2025 ⊕ 72/2026 ⊕ 201/2026 ⊕ 108/2025 — **no 144/2024** |
| Research 12 §3 | 26/2023 ⊕ 144/2024 ⊕ 199/2025 ⊕ 72/2026 — **no 108/2025, no 201/2026**; plus new AJCEP and VJEPA schedules eff. 01/04/2026, a VN–Cambodia 2026 schedule, and NĐ 26/2026 (chemicals) |

The table above is the **union** of both, presented as a set of individually-sourced leads. **The union is
not a verified chain.** Neither report enumerated the amendment chain as its research question; each
mentioned the decrees it happened to encounter. Merging two non-exhaustive lists produces a list that is
still non-exhaustive, and gives it a false air of completeness.

**Do not ingest against this table.** Establish the real chain from Công báo — which publishes every
decree in gazette order — before Phase 1 ingestion. See `Open Question 6` in
[Bootstrap Plan](../planning/00-bootstrap.md) and TASK-009 in [Task List](../planning/01-task-list.md),
which state the same constraint: *do not merge them and assume the union is correct*.

A missing amending decree is not a visible failure. It is a rate that is silently, confidently, legally
wrong — the same failure shape as the annex trap above.

⚠️ **There is no official văn bản hợp nhất (consolidated text) for this published as machine-readable
data** (verified 2026-07-17, source: research 10 §1). The consolidation is ours to perform, and
therefore ours to get wrong. Every consolidation step is an editorial act that must be traceable to
the amending decree and its date — because the answer to "what was the rate on date D" is different
from "what is the rate today", and both are legitimate questions from a declarant amending a past
declaration.

### Structure of NĐ 26/2023

(verified 2026-07-17, source: research 12 §1, annex-aware parse of Công báo `.doc` parts)

| Annex | Content | Unique HS codes | With a `%` rate recovered |
|---|---|---|---|
| **Phụ lục I** | Biểu thuế **XUẤT KHẨU** — taxable-goods list only, NOT the full 97 chapters | 1,520 | 1,471 (96.8%) |
| **Phụ lục II** | Biểu thuế **NHẬP KHẨU ưu đãi** (MFN) — full 97 chapters | **11,874** | 11,160 (94.0%) |
| **Phụ lục III** | Absolute / mixed duty (used cars) | — | 0 — **USD amounts, not percentages**; a `%` regex finds nothing here |
| **Phụ lục IV** | Out-of-quota TRQ rates | — | 0 — separate structure |

Note the asymmetry that makes the annex trap possible: Phụ lục I is a **short list** (only goods that
are subject to export duty at all), while Phụ lục II is the **full nomenclature**. Their overlap is
exactly the 1,520 codes above.

Note also that Phụ lục III yielding zero `%` rows is not a parse failure to be fixed — absolute duty
is genuinely not a percentage. A pipeline that treats "no rate extracted" as an error will chase a
phantom here; one that treats it as 0% will be catastrophically wrong.

---

## 2. Nomenclature — the HS/AHTN dimension

- **Thông tư 31/2022/TT-BTC (08/06/2022, eff. 01/12/2022) is STILL current.** It replaced TT 65/2017
  and is built on **HS 2022 / AHTN 2022**. Structure: **21 phần · 97 chương · 1,228 nhóm (4-digit) ·
  4,084 phân nhóm (6-digit) · 11,414 dòng hàng (8-digit)** (verified 2026-07-17, source: research 10 §2,
  https://thuvienphapluat.vn/van-ban/Xuat-nhap-khau/Thong-tu-31-2022-TT-BTC-Danh-muc-hang-hoa-xuat-nhap-khau-Viet-Nam-343978.aspx)
- **HS 2028 takes effect 01/01/2028** (8th WCO edition). AHTN 2028 is under negotiation; Vietnam will
  issue a replacement Thông tư. **There is no HS 2028 in force today.** (verified 2026-07-17, source:
  research 10 §2, https://kv05.customs.gov.vn/index.jsp?aid=215061&cid=25&pageId=2)
- **Do not hardcode AHTN 2022.** Model HS version as a dimension with validity dates. Renomenclature
  re-bases HS codes and orphans historical mappings (verified 2026-07-17, source: research 12 §6).

Separate but frequently confused: **Thông tư 85/2026/TT-BTC (eff. 15/9/2026)** governs *phân loại
hàng hóa và phân tích để phân loại* — it replaces TT 14/2015 + TT 17/2021. **It is the classification
PROCEDURE, not the nomenclature.** It does not change what the codes are. (verified 2026-07-17, source:
research 10 §2, https://thuehaiquan.tapchikinhtetaichinh.vn/doi-moi-quy-dinh-phan-loai-phan-tich-hang-hoa-xuat-nhap-khau-161123.html)

Cross-reference: classification methodology (GRI, evidence, advance rulings) lives in
[HS Classification](hs-classification.md). This note covers the rate side only.

---

## 3. FTA preferential schedules — the 2022 batch of 17

Seventeen decrees, **all issued 30/12/2022**, covering **2022–2027**. Two independent sources agree on
this mapping (verified 2026-07-17, source: research 10 §3,
https://www.haiquanvietnam.com/2022/12/17-nghi-dinh-bieu-thue-xuat-khau-uu-dai-bieu-thue-nhap-khau-uu-dai-dac-biet.html
and https://itslogisticsvn.blog/bieu-thue-xuat-nhap-khau-uu-dai-thuc-thi-cac-fta-tu-nam-2022-2028/):

| Nghị định | FTA | Period |
|---|---|---|
| 112/2022 | VCFTA (Chile) | 2022–2027 |
| 113/2022 | VN–EAEU FTA | 2022–2027 |
| 114/2022 | VN–Cuba | 2022–2027 |
| 115/2022 | **CPTPP** (XK + NK) | 2022–2027 |
| 116/2022 | **EVFTA** (XK + NK) | 2022–2027 |
| 117/2022 | **UKVFTA** (XK + NK) | 2022–2027 |
| 118/2022 | ACFTA | 2022–2027 |
| 119/2022 | AKFTA | 2022–2027 |
| 120/2022 | AJCEP | **2022–2028** |
| 121/2022 | AANZFTA | 2022–2027 |
| 122/2022 | AIFTA | 2022–2027 |
| 123/2022 | AHKFTA | 2022–2027 |
| 124/2022 | VJEPA | **2022–2028** |
| 125/2022 | VKFTA | 2022–2027 |
| 126/2022 | ATIGA | 2022–2027 |
| 127/2022 | VN–Laos | 30/12/2022 – 04/10/2023 (**EXPIRED**) |
| 129/2022 | RCEP | 2022–2027 |

⚠️ **128/2022/NĐ-CP is NOT an FTA tariff decree** — both sources skip it. **Do not assume a contiguous
112–129 range** and do not let a loop generate decree numbers (verified 2026-07-17, source: research 10 §3).

⚠️ **127/2022 (VN–Laos) expired 04/10/2023.** A schedule table that lacks an expiry column will serve
it forever.

Outside the 2022 batch:

- **131/2024/NĐ-CP — VIFTA (Israel)**, eff. 15/10/2024 → 31/12/2027. 11,400+ lines. Average committed
  rate 10.3% (2024) → 9.3% (2025) → 8.4% (2026) → 7.5% (2027). (verified 2026-07-17, source: research 10 §3,
  https://baochinhphu.vn/bieu-thue-nhap-khau-uu-dai-dac-biet-viet-nam-israel-giai-doan-2024-2027-102241016122557627.htm)
- **143/2026/NĐ-CP — CEPA (UAE)**, issued 05/05/2026, eff. 05/05/2026 → 31/12/2027; **rates apply
  retroactively from 03/02/2026**. (verified 2026-07-17, source: research 10 §3,
  https://luatvietnam.vn/thue/nghi-dinh-143-2026-nd-cp-bieu-thue-nhap-khau-uu-dai-viet-nam-uae-2026-2027-434005-d1.html)
  Retroactivity is a third temporal axis beyond signed/effective/gazetted — a rate can become the
  correct answer for a date that has already passed.
- Research 12 additionally observed, in 2026: **new AJCEP and VJEPA schedules effective 01/04/2026**,
  a **Vietnam–Cambodia 2026 schedule**, and **NĐ 26/2026 (chemicals)**. (verified 2026-07-17, source:
  research 12 §3. Decree numbers for the 2026 AJCEP/VJEPA/Cambodia schedules were not captured — see
  [Unverified](#unverified--do-not-rely-on).)

### ⚠️ THE 2027 CLIFF

**Essentially the entire FTA corpus expires 31/12/2027.** A successor batch of roughly 17 decrees will
land around December 2027 — **simultaneously with the AHTN/HS 2028 nomenclature switch on 01/01/2028**.
That is a **total corpus replacement in one shot, roughly 18 months from today** (verified 2026-07-17,
source: research 10 §3 and Feasibility summary; also inferred independently in research 12 §6).

**Why this dictates the schema now, not in 2027:** if `hs_version` and `valid_from`/`valid_to` are not
first-class dimensions from day one, the 2027 cliff is not a migration — it is a rewrite, performed
under time pressure, against a corpus where every code may have re-based. **Never model "the current
rate" as a scalar.** A rate row is `(hs_code, hs_version, schedule, valid_from, valid_to, source_decree)`
at minimum.

---

## 4. A rate is not a function of (HS, country)

This is the conceptual core. The intuitive model — "give me the HS code and the origin country, get
the rate" — is not merely incomplete. **It is not a function**: the same (HS, country) pair maps to
different rates depending on facts the tariff table does not contain.

- **FTA preference is CONDITIONAL, not automatic.** RCEP **Điều 4** requires origin rules *plus a
  valid certificate of origin* (C/O). "The tax is 0%" is wrong. "0% **if** you hold a valid C/O, else
  15% MFN" is right. (verified 2026-07-17, source: research 12 §6, NĐ 129/2022 text via Công báo)
- **RCEP Điều 6.2 — the highest-rate rule.** For certain multi-origin goods, the applicable rate is
  the highest across the relevant annexes. Verbatim from the decree text:
  > "Mức thuế suất cao nhất tại các Phụ lục Biểu thuế áp dụng cho cùng hàng hóa có xuất xứ từ các nước thành viên..."

  (verified 2026-07-17, source: research 12 §6, NĐ 129/2022 text). This is the clause that formally
  breaks the function: the rate depends on a set of origins, not one.
- **`*` means EXCLUDED, not zero.** Research 12 counted **54 `*` cells in a single RCEP gazette issue
  alone** (verified 2026-07-17, source: research 12 §2). A numeric parser that coerces `*` to `0` or to
  `NULL` produces a duty-free answer for a good that has no preference at all. `*` must be a first-class
  state.
- **RCEP has six country annexes** in one file: A=ASEAN, B=Australia, C=China, D=Japan, E=Korea,
  F=New Zealand (verified 2026-07-17, source: research 12 §2). The FTA name alone does not identify the
  schedule; the partner annex does.
- **TRQ goods** depend on quota status; out-of-quota rates live in a different annex (Phụ lục IV of
  NĐ 26/2023). Verified TRQ headings: **04.07, 17.01, 24.01, 25.01** (eggs, sugar, tobacco, salt)
  (verified 2026-07-17, source: research 12 §6, NĐ 129/2022 text).
- **Absolute / mixed duties** (used cars, Phụ lục III) are **USD amounts, not percentages** (verified
  2026-07-17, source: research 12 §1/§6). The rate column's type is not `numeric percent`.
- **Chapter 98 special codes** (e.g. 98.49 auto components) carry **programme-eligibility conditions**
  (verified 2026-07-17, source: research 12 §6). NĐ 199/2025's auto-component volume conditions are an
  instance: the rate depends on production volume, which is a fact about the importer, not the good.
- **Anti-dumping / safeguard duties are country-specific and live in MOIT decisions, in no Nghị định at
  all.** For the archetypal query — "steel from China" — **the tariff table is the least important
  number** (verified 2026-07-17, source: research 12 §6).

**Design consequence for v1:** the deterministic lookup returns *candidate rate rows with their
conditions attached and their decree cited* — never a single number presented as the answer. The
conditions (C/O held? in-quota? programme-eligible? multi-origin?) are facts the tool does not have
and the declarant does. This is the same human-decides posture as HS candidate suggestion, and it is
not a UX preference — it follows from the law not being a lookup table.

---

## 5. Other taxes at import

**Only import/export duty and VAT are natively HS-keyed.** (verified 2026-07-17, source: research 10 §4)

| Tax | Instrument | Per-HS? |
|---|---|---|
| **GTGT (VAT)** | Luật 48/2024/QH15 + **NĐ 181/2025/NĐ-CP** (eff. 01/7/2025). **NĐ 174/2025** extends the 2% reduction (i.e. 8%) to **31/12/2026** | **Partially.** Standard 10%. Phụ lục I/II of NĐ 181 list non-taxable exported resources/minerals **with HS codes**. **The 5% list is BY DESCRIPTION → needs mapping.** (source: https://luatvietnam.vn/thue-phi-le-phi/diem-moi-cua-nghi-dinh-181-2025-nd-cp-565-102796-article.html) |
| **TTĐB (special consumption)** | **Luật Thuế TTĐB 66/2025/QH15** | **NO — not HS-keyed.** Verified via the customs API itself: a TTĐB query returns rows like `"I. Hàng hóa"`, `"1. Thuốc lá điếu…"`, `"2. Rượu"` with **`MA_HS: None`**. The statutory table is by product category, not HS line. Any HS→category mapping is **our own editorial inference and a liability surface.** |
| **BVMT (environmental protection)** | Luật Thuế BVMT + UBTVQH/QH resolutions. **NQ 19/2026/QH16 (12/04/2026)** set petrol/jet fuel to **0 đ/lít** for 16/4–30/6/2026; **extended to 30/9/2026** | **NO — not HS-keyed.** Same finding: API returns `"I. Xăng, dầu, mỡ nhờn"`, `"1. Xăng, trừ etanol"` with no HS. **Highly volatile — rates change every few months by RESOLUTION, not decree.** (sources: https://english.luatvietnam.vn/resolution-no-19-2026-qh16-dated-april-12-2026-of-the-national-assembly-on-promulgation-of-a-number-of-provisions-on-environmental-protection-tax-v-431850-doc1.html ; https://baochinhphu.vn/keo-dai-thoi-han-ap-dung-uu-dai-thue-voi-mat-hang-xang-dau-den-30-9-2026-102260701163839168.htm) |
| **Chống bán phá giá / tự vệ (anti-dumping / safeguard)** | Individual **Quyết định-BCT**, case-by-case | **Yes HS-listed, but scattered.** Each QĐ lists HS codes (e.g. QĐ 228/QĐ-BCT 2026 float glass → 7005.29.20, 7005.29.90; H-beam steel → 7216.33.11/.19/.90, 7228.70.10/.90). **No consolidated machine-readable register exists.** Must scrape pvtm.gov.vn / moit.gov.vn per case and track the **sơ bộ → chính thức → rà soát cuối kỳ** lifecycle. **This is the hardest dataset by far.** (sources: https://pvtm.gov.vn/ ; https://luatvietnam.vn/thue/quyet-dinh-228-qd-bct-2026-ap-dung-thue-chong-ban-pha-gia-tam-thoi-san-pham-kich-noi-khong-mau-tu-indonesia-va-malaysia-425919-d1.html) |

All rows above: verified 2026-07-17, source: research 10 §4.

**Why the "NOT HS-keyed" finding matters more than it looks:** it means TTĐB and BVMT cannot be joined
into the tariff table without inventing the join key. The instant we ship an HS→TTĐB-category mapping,
we own it — the law does not endorse it, and a wrong mapping is indistinguishable from a wrong rate to
the declarant. BVMT compounds this by changing on a resolution cadence measured in months.

**v1 scope note:** BVMT/TTĐB/anti-dumping are explicitly out of v1's deterministic-lookup scope. When
a query touches them, the correct behaviour is to say the tool does not cover them — not to infer.

---

## 6. ⚠️ The temporal killer

This is the finding that reframes the whole project. All three legs verified in research 12 §3
(verified 2026-07-17, source: research 12 §3; gazette record at congbao.chinhphu.vn).

**Leg 1 — zero lead time.** NĐ 72/2026 was **signed 09/03/2026 and effective the same day** — "kể từ
ngày ký". There is no notice period to schedule a crawl against.

**Leg 2 — the gazette lag exceeds the effective date.** NĐ 72/2026 was published in **Công báo số 157
on 24/03/2026 — 15 days AFTER it was already binding law.** Comparable lags:

| Decree | Signed | Gazetted | Lag |
|---|---|---|---|
| **NĐ 72/2026** | 09/03/2026 (eff. same day) | 24/03/2026, Công báo số 157 | **~15 days of binding-but-ungazetted law** |
| NĐ 26/2023 | 31/05/2023 | 19/06/2023 | ~19 days |
| NĐ 116/2022 (EVFTA) | 30/12/2022 | from 16/02/2023 | ~48 days |

**There is a multi-week window in which the legally-in-force rate exists in machine-readable form
nowhere** — only as a 200-DPI bitonal scan (see [Data Sources](data-sources.md) for the Kodak Alaris
scan finding). No crawl schedule closes this gap, because during it the correct answer is not
published in any form we can parse.

**Leg 3 — decrees expire and silently revert.** NĐ 72/2026 was **valid only until 30/04/2026 — a
52-day window** — after which petrol/naphtha/reformate rates **revert** to NĐ 26/2023's 10%. A
"scrape the latest version" design has no concept of reversion. **It would serve 0% petrol forever.**

Note that legs 2 and 3 interact viciously: a system that ingested NĐ 72/2026 on 24/03/2026 (gazette
day) was wrong for 15 days before ingestion and wrong again from 01/05/2026 unless it modelled the
expiry it read in the same document.

### The conclusion to state plainly

**This is not a crawling problem that resolves into a database. It is a legal-currency problem wearing
a data-engineering costume.**

The baseline is a one-time job — research 12 assembled a validated 11,874-row MFN table in a single
session. **Staying correct is unbounded, adversarial, and permanently behind.** Every gap is a legally
binding wrong answer on someone else's declaration.

The defensible shape that follows (verified 2026-07-17, source: research 12, bottom line): Công báo
`.doc` as the sole source; **annex-aware** parsing with a real Word table parser; an
**effective-date / expiry-aware temporal model** rather than "latest"; explicit `*` / TRQ /
absolute-duty / C-O-conditional states; and output that **cites the decree and date and refuses when
its snapshot may be stale** — a research aid that shows its sources, never an answer engine that
states a rate.

That last clause is a product constraint derived from law, not a hedge. See
[Project Context](../project-context.md) for how it shapes v1 scope.

---

## Unverified / Do Not Rely On

Reproduced from the research as flagged. Do not launder any of these into confident claims.

- **The EVFTA `.doc` table extraction may be irrecoverable — status: INFERRED, not proven.** On
  NĐ 116/2022 (EVFTA), `textutil` collapsed a table row into
  `2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9` — six rates (`29 | 25,4 | 21,8 | 18,1 |
  14,5 | 10,9`) concatenated with **no delimiter**, in a decimal-comma locale. Research 12 states
  explicitly: *"I am inferring, not asserting, that this is a tooling artifact"* — RCEP has the
  identical 6-year structure and extracted perfectly, which suggests a proper table-aware parser
  (LibreOffice → docx → `w:tbl/w:tr/w:tc`) fixes it, **but this could not be proven** (no `soffice`,
  `antiword`, or `python-docx` in that environment). **This is the one gap a builder must close before
  trusting anything.** (research 12 §2)
- **The 2026 AJCEP / VJEPA / Vietnam–Cambodia schedules**: research 12 observed new AJCEP and VJEPA
  schedules eff. 01/04/2026 and a VN–Cambodia 2026 schedule, but **the decree numbers were not
  captured**. Do not guess them.
- **`data.gov.vn` / `open.data.gov.vn`**: DNS did not resolve (`getaddrinfo ENOTFOUND`, curl `000`).
  **Flagged as unverified, NOT confirmed-dead** — may be geo-fenced. (research 10 §5b)
- **ASEAN Tariff Finder**: connection timed out — could not verify. (research 10 §5b)
- **Whether NĐ 128/2022 is tariff-related at all** is unknown. It is confirmed only that both FTA-list
  sources skip it. (research 10, Feasibility summary)
- **Whether `APIBieuThue` has rate limiting**: not probed. (research 10, Feasibility summary)
- **The 2027 FTA cliff** is verified as to expiry dates (the decrees state 2022–2027). The claim that a
  ~17-decree successor batch lands around Dec 2027 is a **projection**, and research 12 marks its
  version of this as *"also inferred, not verified"* (research 12 §6). The dates are hard; the shape of
  the successor batch is not.
- **No claim here about VNACCS/VCIS as a data source**: it is a declaration processing system, not a
  feed. (research 10 §5b)

---

## Open Conflicts

### customs.gov.vn API: research 10 vs research 12 — UNRESOLVED

Two research agents reached **materially different conclusions about the same system**. Both are
reproduced. **This conflict is unresolved and must be settled by first-hand testing before any design
depends on it.**

| | **Research 10** | **Research 12** |
|---|---|---|
| Verdict | *"There IS an undocumented, unauthenticated, **captcha-free** JSON API… I verified it with plain `curl`"* | *"at least part of the portal is **CAPTCHA-gated**"*; *"That IP **timed out** from here"* |
| Endpoint found | `POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue` | `http://123.30.210.236:8080/hqcustomsapi/` hardcoded in `/scripts/main.js`, incl. `.../hqcustomsapi/captcha/CheckCaptcha` |
| Auth / captcha | *"No auth, no JSESSIONID, no captcha, no Referer/Origin check. The on-page captcha is client-side only — the API does not enforce it."* | Found an explicit `CheckCaptcha` endpoint in the client bundle |
| Reachability | Reproduced with bare `curl`; `"8703"` returned **510 rows** | Could not reach the IP; explicitly *"I cannot distinguish geo-fencing from a sandbox egress block, so I am not claiming it's unreachable"* |
| Feasibility | ~1,228 POSTs (one per 4-digit nhóm) reconstructs 11,414 lines × 26 schedules — *"a few hours of polite crawling"* | *"Enumerating ~11k codes through a CAPTCHA-fronted undocumented endpoint on a raw IP is fragile and adversarial"* |

**Possible reconciliation (NOT verified — do not treat as settled):** the two may have found *different
endpoints* — a `bridge`-proxied path on the public host vs. a raw-IP backend — and the captcha may
gate one and not the other. Nobody tested both. Treat as open.

**What both agents agree on, and what therefore stands regardless of how the conflict resolves:**

1. **The API is not the source of truth. The Nghị định is.** Research 10: *"Undocumented, unversioned,
   no SLA, no ToS grant. Can vanish or start enforcing captcha. Treat as a convenience layer, legal
   source of truth remains the decree text."* Research 12: *"it has no legal authority — the Nghị định
   does."*
2. `www.customs.gov.vn/robots.txt` is permissive — `User-agent: *` with **no `Disallow` lines**
   (both agents, verified 2026-07-17).
3. The API's FTA coverage is **stale**: no VIFTA, no CEPA (UAE); `THOI_GIAN_CAP_NHAT` values are
   2019–2020 (research 10 §5a). Those must come from NĐ 131/2024 and NĐ 143/2026.
4. The API gives **current-year rates only** — no forward-year series. 2027 rates must come from the
   decree annexes (research 10 §5a).

Even on research 10's most optimistic reading, the API cannot answer the questions this project exists
to answer (dated, forward-looking, decree-cited), and it is a convenience layer at best. **The
Công báo `.doc` pipeline is the load-bearing path either way.** Full source-by-source assessment lives
in [Data Sources](data-sources.md).

---

## Related Knowledge

- [Data Sources](data-sources.md) — where the text actually comes from (Công báo `.doc` vs. the
  chinhphu.vn scans, vbpl.vn/thuvienphapluat blocks, the customs.gov.vn API conflict in full).
- [HS Classification](hs-classification.md) — GRI, candidate suggestion, evidence, advance rulings.
  This note is the rate side; that note is the code side.
- [Project Context](../project-context.md) — v1 scope, audience, and why the tool cites rather than
  answers.
- [Business Rules](../business-rules.md) — durable policy and validation rules derived from the above.
