---
type: concept
status: active
updated: 2026-07-17
related:
  - tariff-system.md
  - hs-classification.md
  - ../project-context.md
  - ../business-rules.md
---

# Data Sources

Where Customs Assistant's data comes from, and — just as important — where it **must not** come from. Every claim below carries a verification date and a source. Where the research was uncertain or self-contradictory, that is preserved, not smoothed over.

**The single governing rule:** the legal source of truth is always the **decree text** (Nghị định / Thông tư), never an API, never an aggregator, never a scraped table. Everything else on this page is a convenience layer over that text, and every convenience layer here has a documented way of being silently wrong.

---

## ⚠️ OPEN CONFLICT — the customs.gov.vn tariff API

Two research agents investigated the same portal and reached incompatible conclusions. **This conflict is unresolved.** Both accounts are reproduced; do not design around either until Phase 0 tests both.

### Position A — research 10: a working, unauthenticated JSON API (verified with plain curl)

```
POST https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Body (raw JSON despite the header):
{"l_class":"TIM_KIEM","l_action":"GET","l_param":"8703","l_bieu_thue":"NK_uu_dai"}
```

Verified behaviour (verified 2026-07-17, source: https://www.customs.gov.vn/bridge?url=/customs/servletws/bieuthue/APIBieuThue):

- **No auth, no JSESSIONID, no captcha, no Referer/Origin check.** The captcha shown on the lookup page is **client-side only** — the API does not enforce it.
- `l_param` = HS prefix, **minimum 4 digits**. `"87"` returns empty; `"8703"` returns **510 rows**. Vietnamese description keywords also accepted.
- One row per HS line, **one column per tariff regime**. Live sample for `87031010`:
  `NK_uu_dai 70 · ATIGA 0 · ACFTA 0 · CPTPP_NK 28 · EVFTA_NK 28.3 · RCEP_JP 38.2 · NK_TT 105`.
  Why this matters: EVFTA 28.3 matches the 2026 phase-down step and `NK_TT` = 150% × 70 (the MFN rate), so the data is **live and current for 2026**, not a 2019 fossil.
- `TO_JSON` carries `RATE o flag o flag o flag o flag` per regime (footnote/quota flags) plus unit (`kg/con`).

Discovery calls (all verified working):

- `{"l_class":"BT_SAC_THUE","l_action":"GET","l_param":"All"}` → the 5 tax types: `NHAP_KHAU, XUAT_KHAU, GTGT, TTDB, BVMT`
- `{"l_class":"BT_LOAI_BIEU_THUE","l_action":"GET","l_param":"NHAP_KHAU"}` → the 26 import schedule codes:
  `NK_uu_dai, ATIGA, ACFTA, AJCEP, AKFTA, AHKFTA, AANZFTA, AIFTA, VJEPA, VKFTA, VN-EAEU, EVFTA_NK, UKVFTA_NK, VCFTA, VNL, VNCB, CPTPP_NK, CPTPP_NK_MEX, RCEP_ASEAN, RCEP_AU, RCEP_CN, RCEP_JP, RCEP_KR, RCEP_NZ, NK_TT`
- Same shape for `XUAT_KHAU` (`XK, EVFTA_XK, …`)

Bulk extraction ≈ **1,228 POSTs** (one per 4-digit nhóm), i.e. hours of polite crawling rather than a PDF-parsing project.

### Position B — research 12: could not reach it; found a captcha-gated backend instead

(verified 2026-07-17, source: https://www.customs.gov.vn/scripts/main.js)

- `/scripts/main.js` **hardcodes** `http://123.30.210.236:8080/hqcustomsapi/` — a raw IP, plain HTTP, port 8080 — including `.../hqcustomsapi/captcha/CheckCaptcha`. So **at least part of the portal IS captcha-gated**.
- **That IP timed out** from the research environment. The agent explicitly **declined to claim it unreachable** — it could not distinguish geo-fencing from a sandbox egress block.
- `www.customs.gov.vn/robots.txt` returns `User-agent: *` with **no `Disallow` lines at all** (verified 2026-07-17, source: https://www.customs.gov.vn/robots.txt). No sitemap; `/sitemap.xml` → 404.

### Resolution: unresolved

These are **probably different endpoints** — the `/bridge` reverse-proxy path (Position A) vs the raw backend IP hardcoded in the page JS (Position B). That would make both reports true simultaneously. But this is a hypothesis, not a verified fact. **Test both in Phase 0 before designing around either.** Do not let a plan assume the API exists, and do not let a plan assume it doesn't.

### Caveats that hold regardless of which position wins

1. **Undocumented, unversioned, no SLA, no ToS grant.** It can vanish or start enforcing captcha on any deploy.
2. **Stale FTA coverage** — the schedule list has **no VIFTA and no CEPA (UAE)** entries; `THOI_GIAN_CAP_NHAT` values are **2019–2020**. Those two FTAs must come from the decree text.
3. **Current-year rates only.** Flat columns give today's rate; there is **no forward-year series**. 2027 rates must come from the decree annexes.
4. `l_bieu_thue` appears **ignored** for import queries — you always get all columns back.
5. **The legal source of truth remains the decree text, never the API.** The API has no legal authority; the Nghị định does.

---

## ⭐ congbao.chinhphu.vn (Công báo) — the recommended primary source

The official gazette. Robots-permissive, authoritative, and — the decisive property — **Word-formatted**.

- `robots.txt` = `User-agent: * / Allow: /`. No Cloudflare, no JS required; plain `curl` returns server-rendered HTML, HTTP 200 (verified 2026-07-17, source: https://congbao.chinhphu.vn/robots.txt).
- URL patterns: issue `/cong-bao/cong-bao-so-406-ngay-17-07-2026-47329.htm`; document `/van-ban/thong-tu-so-33-2026-tt-bct-469965.htm` (verified 2026-07-17, source: https://congbao.chinhphu.vn/).
- **Each document exposes both signed PDF and DOCX**: `congbaocdn.chinhphu.vn/..._signed.pdf` and DOCX via `g7.cdnchinhphu.vn/api/download/stream?Url=...&file_name=...docx` (tokenized links).
- The PDFs have a **real text layer** — research 04 verified one at 70 pages / 1.07MB with `/Font` present and **13,919 text-showing operators**. **No OCR needed** (verified 2026-07-17, source: https://congbaocdn.chinhphu.vn/).
- These are the `_signed`, **legally authoritative** versions. Công báo is the *publication of record*; vbpl is the database. Where authority matters, Công báo is the stronger citation.

**Why this source and not the "obvious" ones:** research 12 actually assembled the table from it. It downloaded **all 14 `.doc` parts** of NĐ 26/2023 (gazette issues 743+744 → 769+770) and extracted **11,874 unique 8-digit HS codes** from 14,101 row cells (verified 2026-07-17, source: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-26-2023-nd-cp-39522.htm):

| Annex | Content | Unique HS | With rate |
|---|---|---|---|
| Phụ lục I | Biểu thuế **xuất khẩu** | 1,520 | 1,471 (96.8%) |
| Phụ lục II | Biểu thuế **nhập khẩu ưu đãi** (MFN) | 11,874 | **11,160 (94.0%)** |
| Phụ lục III | Absolute/mixed duty (used cars) | — | 0 (USD amounts, not %) |
| Phụ lục IV | Out-of-quota TRQ rates | — | 0 (separate structure) |

Annex cells are genuine Word table cells, cleanly recoverable: `0301.11.10 | - - - Cá bột | 15`.

FTA decrees have the same shape:

- **RCEP NĐ 129/2022 = 51 `.doc` parts.** One part alone yielded **1,591 HS codes** with the **six annual rate columns as separate cells** (`0101.21.00 | - - Loại thuần chủng để nhân giống | 0 | 0 | 0 | 0 | 0 | 0`), plus **six country annexes** (A=ASEAN, B=Australia, C=China, D=Japan, E=Korea, F=New Zealand) and **54 `*` cells** in that issue (`*` = good **excluded**, not zero).
- **EVFTA NĐ 116/2022 = 16 `.doc` parts.** Phụ lục II ("BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI ĐẶC BIỆT … EVFTA GIAI ĐOẠN 2022-2027"), columns `Mã hàng | Mô tả hàng hóa | Thuế suất EVFTA (%)`, **774 HS codes** in a single part.

**Weaknesses.** Organised by gazette *issue*, not by document identity. **No hiệu lực status, no relationship metadata** — it is a point-in-time publication by design. **Pair it with vbpl; do not use it alone.** No API or bulk endpoint found. And the fundamental limit is the **gazette lag** — see [Tariff System](tariff-system.md).

### ⚠️ Parser warning — the one gap a builder must close first

Research 12 flagged this honestly against its own conclusion. `textutil` collapsed the EVFTA table into a single line, producing:

```
2101.11.11 | ...không dưới 20kg | 2925,421,818,114,510,9
```

That is **six rates** (`29 | 25,4 | 21,8 | 18,1 | 14,5 | 10,9`) concatenated with **no delimiter**, in a **decimal-comma locale**. Unrecoverable without heuristics — you cannot tell where one rate ends and the next begins.

The agent **INFERRED — and could not prove** (no `soffice` / `antiword` / `python-docx` available in that environment) — that this is a tooling artifact, and that a proper table-aware parser (LibreOffice → `.docx` → walk `w:tbl/w:tr/w:tc`) fixes it. The evidence for the inference: RCEP has the **identical 6-year column structure and extracted perfectly**. **This is the one gap a builder must close before trusting anything downstream.**

**And the reason the parser matters more than it looks:** research 12's first naive parse reported **94% success and was confidently wrong**. `0301.11.10` resolved to `['0', '15']` — `0` from Phụ lục I (export) and `15` from Phụ lục II (import). **1,520 HS codes appear in both annexes; 1,329 have different rates.** An annex-blind parser returns the **export** rate for an **import** question, silently, with no error, at 94% apparent success. That is the failure mode of this whole project category: not missing data — **plausible-looking wrong data**. Any ingestion code must be **annex-aware** and must carry the annex identity into the row.

---

## 🚫 chinhphu.vn PDFs are scans — do NOT parse them

NĐ 26/2023 on `datafiles.chinhphu.vn` (verified 2026-07-17, source: https://vanban.chinhphu.vn/?pageid=27160&docid=208020):

- `26-nd.signed.pdf` — 19.0 MB, **560 pages**
- `26-nd-2.pdf` — 15.5 MB, **456 pages**

Internals inspected: Producer string **`Kodak Alaris Inc.`** (a document-scanner vendor). Exactly **one `/CCITTFaxDecode` bilevel image per page** (560 and 456 respectively). Page images **1666×2329 px ≈ 200 DPI bitonal**. `26-nd-2.pdf` contains **zero `/Font` objects** — literally no text layer at all; the 11 fonts in the signed file are the signature-stamp overlay only.

**1,016 pages of fax-compressed scan, at a DPI below the 300 normally wanted for dense numeric tables with Vietnamese diacritics.** RCEP NĐ 129/2022 is the same story on chinhphu.vn — 16 PDFs, of which 3 were checked (`129-nd.signed.pdf` 196pp, `129-2.pdf` 152pp, `129-5.pdf` 218pp), all Kodak Alaris CCITT scans with zero fonts in the annex files.

**Go to Công báo instead.** The same decrees are there as Word. The scanned-PDF fear is real, but only for chinhphu.vn — it is not a property of the corpus.

---

## vbpl.vn — rebuilt 2026-04-23

**⚠️ Two research reports disagree here, and the reconciliation below is OUR INFERENCE — neither report states it.**

- **Research 04** fetched the **rebuilt** site: `robots.txt` = `Allow: /` with `Disallow: /api/` and `Disallow: /Pages/`; documents live at `/van-ban/chi-tiet/...`, which is **explicitly allowed**. It read the relaunch as the current state.
- **Research 12** fetched `robots.txt: Disallow: /Pages/` and concluded **robots excludes exactly the corpus**, because on the site it saw, every document URL *was* `/Pages/vbpq-toanvan.aspx?ItemID=...`. It also got an identical 52,199-byte 404 shell on a Google-indexed ItemID, and called vbpl "not reliably scrapable".
- **Our reading:** both are internally consistent and describe **different site generations**. `Disallow: /Pages/` is the same line in both; what changed is whether the corpus lives under `/Pages/`. After the 2026-04-23 relaunch it does not, so the same directive now excludes only the dead legacy tree.

**This reconciliation is plausible but unverified.** It is our inference, not a finding. Neither report says "research 12 is superseded". **Re-check `vbpl.vn/robots.txt` and a live document fetch before the RAG phase depends on it** — and note the stakes are low for v1, which does not touch vbpl at all. The same unresolved status is recorded in [Business Rules](../business-rules.md#unresolved-conflicts), [ADR: Use Published VBHN](../architecture-decisions/2026-07-17-use-published-vbhn-not-computed-consolidation.md), and [Bootstrap Plan](../planning/00-bootstrap.md). Keep them consistent.

The legacy ASP.NET portal is dead (verified 2026-07-17, source: https://vbpl.vn/): `/TW/Pages/vbpq-toanvan.aspx?ItemID=187045` → **404**; `/Pages/portal.aspx` → **308 → https://vbpl.vn/**.

**Every GitHub crawler predates the relaunch** — `duyet/vietnamese-legal-documents-dataset` (last push 2026-04-10, 13 days before), `mlalab/VNLegalText` (2023), `NguyenNamUET/laws_project_crawler` (2022). **Do not start from any of them.**

**URL pattern:** `https://vbpl.vn/van-ban/chi-tiet/{slug}--{ItemID}`

- The `--` separator is **REQUIRED**. `/van-ban/chi-tiet/12898` (slugless) renders "Văn bản không tồn tại" — **despite `<link rel="canonical">` advertising that exact slugless form. It's a bug; don't rely on it.**
- Tabs are deep-linkable: `?tabs=noi-dung|thuoc-tinh|luoc-do|van-ban-goc|tai-ve`. This is the crawl handle.

**⚠️ Fully client-rendered — and the trap.** `curl` returns a 57KB loading shell with **ZERO law text** (0 hits for body text, 10 hits for "Đang tải"). The `Còn hiệu lực` strings present in the static HTML are **i18n labels, not data — a trap that silently poisons a naive scraper** into recording every document as in force. Rendered via JS you get **~32,198 chars** of clean HTML (Luật 109/2025/QH15), and **tables survive as real `<table>` elements** — materially better than PDF for RAG.

**Server Action shortcut:** POST to the page URL, header `next-action: <build-specific hash>` (the observed value was `0fb12b3561faa05adec51a82efb3e4f4f427f07b`), body `["187045"]`, accept `text/x-component`. **The hash is build-specific and breaks on every deploy.** ~100× cheaper than a browser. Recommended shape: use a browser to discover the current hash, then bulk-replay the action, guarded by a hash-staleness check.

**Hiệu lực is first-class** — JSON fields `effFrom`, `effTo`, `status`; badge values `Còn hiệu lực`, `Hết hiệu lực một phần`, `Hết hiệu lực toàn bộ`, `Chưa có hiệu lực`. Plus a **Lịch sử** version diff ("Hệ thống chỉ hiển thị các nội dung thay đổi so với phiên bản trước") and article-level **`Điều khoản được sửa đổi, bổ sung`**. With `Hết hiệu lực một phần` documents, article-level amendment tracking is what stops the system citing repealed text.

**Relationships — best-in-class: 27 typed, bidirectional relations**, verified rendering live on `?tabs=luoc-do` with counts (`Căn cứ ban hành (3)`, `Văn bản bị bãi bỏ (3)`, `Văn bản được quy định chi tiết, hướng dẫn thi hành (2)`). Full enum extracted:

`guided` / `guides` · `detailAndGuided` / `detailAndGuides` · `consolidated` / `consolidates` · `amended` / `amends` · `corrected` / `corrects` · `replaced` / `replaces` · `abrogated` / `abrogates` · `referenced` / `referencedText` · `basis` / `basedText` · `explained` / `explanatoryText` · `suspendedFromExecution` / `suspendExecution` · `suspended` / `temporarilySuspended` · `published` / `publish` · `relatedContent`

The Server Action JSON carries `references[]` → `{targetDocument:{id,docType,docNum,title,issueDate,effFrom,effTo,status}, referenceType:int, referenceProvisions}`.

**⚠️ Dangling references — the graph loader must tolerate broken edges.** `referenceType` is an **integer** (values `3` and `12` observed) with **no int→label mapping recovered**. Worse, reference targets can point at **UNPUBLISHED** documents: Luật Thuế TNCN 2007 (`id=12898`) is referenced by 187045 with `status:"Confirm_Step2"` (not `"Publish"`), is **absent from the sitemap**, and its page returns "Văn bản không tồn tại".

**Crawlability: good.** `robots.txt` (verified 2026-07-17, source: https://vbpl.vn/robots.txt):

```
User-Agent: *
Allow: /
Disallow: /api/
Disallow: /Pages/
Sitemap: https://vbpl.vn/sitemap.xml
```

`/van-ban/` is **explicitly allowed**; the disallowed `/Pages/` is the dead legacy tree. No Cloudflare, no ToS page, no copyright/reuse restriction on `/gioi-thieu` (its own words: *"dễ khai thác các thông tin và tải về sử dụng"*).

**Corpus size, enumerated directly from 33 sitemap files** (verified 2026-07-17, source: https://vbpl.vn/sitemap.xml): Trung ương **54,480** = **43,895 Vietnamese** + **10,585 official English translations** (`--vbpqta_{id}` — a genuinely valuable bilingual asset); địa phương ~**104,346**; **total ≈ 158,826**, ItemID range 1–187,517.

**Legal basis — why vbpl text is citable.** It is **Điều 4 of Nghị định 52/2015/NĐ-CP** — *not* Điều 3, which is what most secondary sources wrongly cite. Verified verbatim from vbpl itself (`--67193`, status "Hết hiệu lực một phần"):

> **Điều 4. Sử dụng văn bản trên Cơ sở dữ liệu quốc gia về pháp luật** — "Văn bản trên Cơ sở dữ liệu quốc gia về pháp luật **được sử dụng chính thức** trong việc quản lý nhà nước, phổ biến pháp luật, nghiên cứu, tìm hiểu, áp dụng và thi hành pháp luật của cơ quan, tổ chức, cá nhân."

This is the citation-trust foundation: vbpl text is **officially usable**, including for research. **Nothing else on this page has that property.**

---

## ⭐ HF bootstrap — `th1nhng0/vietnamese-legal-documents`

Updated 2026-04-27. Verified against the **datasets-server API**, not README claims (verified 2026-07-17, source: https://huggingface.co/datasets/th1nhng0/vietnamese-legal-documents):

| config | rows | size | fields |
|---|---|---|---|
| `metadata` | **153,420** | 33 MB | incl. `ngay_co_hieu_luc`, `ngay_het_hieu_luc`, **`tinh_trang_hieu_luc`**, `co_quan_ban_hanh`, `nguoi_ky`, `linh_vuc` |
| `relationships` | **897,890** | 5.4 MB | `doc_id`, `other_doc_id`, `relationship` |
| `content` | 178,665 | 3.2 GB | `id`, `content_html` |
| `legacy` | 518,235 + 518,601 | 10.7 GB | TVPL-derived — **avoid: inherits TVPL's terms** |

**The single most useful fact:** **`id` IS the vbpl ItemID, and the new portal kept the same ID space** (its `references` cite `12898`, `32801`). **So this dataset joins directly to the new site.** You get 897k relationship edges + hiệu lực status for free, then re-fetch only current text. Sampled rows confirm real data: `{'doc_id': 77, 'other_doc_id': '195', 'relationship': 'Văn bản hết hiệu lực'}`.

Also usable: **`tmquan/vbpl-vn`** — 158,822 docs captured 2026-05-23 (post-relaunch, sitemap-harvested), CC-BY-4.0. Its count **independently corroborates the sitemap enumeration of ~158,826** (Δ=4), which is why the corpus figure above is trustworthy. But: **no hiệu lực, no relationships**, no điều/khoản structure, `markdown` **null for 11,505 docs**, 71% lack `legal_area`.

All existing datasets are **stale w.r.t. the April relaunch** and none carry the new provision-level structure.

---

## 🚫 DO NOT SCRAPE — thuvienphapluat.vn

**Three independent refusals** (verified 2026-07-17, source: https://thuvienphapluat.vn/robots.txt):

1. **`robots.txt` names ClaudeBot explicitly** → `User-agent: ClaudeBot` / `Disallow: /` (alongside GPTBot, CCBot, Google-Extended, Bytespider, Amazonbot, meta-externalagent).
2. **`Content-Signal: search=yes, ai-train=no, use=reference`**, framed as *"express reservations of rights under Article 4 of EU Directive 2019/790"*.
3. **Cloudflare 403s it anyway** — "Just a moment" on all attempts (browser UA, default curl UA, ClaudeBot UA).

**Why this is a refusal and not an obstacle to route around:** we are the crawler they named by name; `ai-train=no` covers building a training/embedding corpus; no `ai-input` signal is granted. What TVPL adds over vbpl — curated văn bản hợp nhất, plain-language summaries, English translations, better search — is real, but it is **their editorial work product**, which is exactly what they are reserving. **The underlying laws are all in vbpl.** If the project wants TVPL specifically, **license it** — they sell API/data access.

---

## 🚫 DO NOT USE — luatvietnam.vn

Commercial freemium. HTTP 200 with a browser UA, but heavily login-walled (11× "Đăng nhập", "Thành viên", "Tải văn bản", VIP tiers). `robots.txt` disallows `/VL/*` and all `?Keywords=` search URLs (verified 2026-07-17, source: https://luatvietnam.vn/robots.txt).

**The disqualifying finding:** it **resolves by numeric ID and IGNORES the slug**. During research, the URL `/thue/luat-thue-thu-nhap-ca-nhan-2007-30759-d1.html` (Luật Thuế TNCN 2007) **silently 301'd to a completely unrelated Công văn về đất đai** at `-30759-d6.html`. **Silent wrong-document resolution is disqualifying for a legal tool** — the failure is invisible, and the output looks correct. No advantage over vbpl anyway.

---

## 🚫 data.gov.vn does not exist

Search engines confidently describe `data.gov.vn` and `open.data.gov.vn` as live. **They are not.** Authoritative DNS returns **NXDOMAIN** from the `gov.vn` zone (SOA `dns-master.vnnic.vn`), via **both 8.8.8.8 and 1.1.1.1**. Controls resolve fine (`vbpl.vn` → 124.197.21.218, `dichvucong.gov.vn` → 14.238.3.76), **so this is not geo-blocking**. `open.data.gov.vn`, `opendata.gov.vn`, `dulieuquocgia.gov.vn` are likewise NXDOMAIN (verified 2026-07-17, source: DNS queries against 8.8.8.8 and 1.1.1.1).

**There is no national open-data API for legal documents.** **NĐ 278/2025/NĐ-CP** (in force 22/10/2025) mandates data connection/sharing — but **agency-to-agency via Nền tảng chia sẻ dữ liệu, not public open data**. Standardization deadline for remaining systems: 31/12/2026. **Not a channel available to this project.**

Note: research 10 hit the same DNS failure but flagged it as *unverified, not confirmed-dead* (it could not rule out geo-fencing from its network). Research 04 closed that gap with authoritative-nameserver queries plus resolving controls. **The "does not exist" verdict is research 04's and it supersedes.**

---

## VNTR / Vietnam Trade Portal / VNSW / eCoSys — no API

Closest thing to structured non-tariff-measure data, and the reason quản lý chuyên ngành data is hard:

- **VNTR (`vntr.moit.gov.vn`)** — official MoIT repository, covers all FTAs + rules of origin. **No public API or bulk download found.** Form-based only. (verified 2026-07-17, source: https://vntr.moit.gov.vn/)
- **Vietnam Trade Portal**, **VNSW**, **eCoSys** — **no API or bulk export found on any of them.** VNSW additionally requires a **digital signature** and **failed TLS verification** during research.
- **ASEAN Tariff Finder** — connection timed out; could not verify.
- **VNACCS/VCIS** — no public data feed; it is a declaration-processing system, not a data source. Requires enterprise registration + digital cert.

---

## Crawl politeness

Research made only **~40 requests** to vbpl and observed **no throttling** (verified 2026-07-17, source: https://vbpl.vn/). **That is not evidence of no throttling at 158k scale.** Rate-limit ourselves; treat a sudden 403/429 as expected, not exceptional.

---

## Related Knowledge

- [Tariff System](tariff-system.md) — the decree structure, the annex trap, and the gazette-lag temporal gap that bounds every source on this page.
- [HS Classification](hs-classification.md) — why the nomenclature is a dimension with validity dates, not a constant.
- [Project Context](../project-context.md) — what Customs Assistant is and is not.
- [Business Rules](../business-rules.md) — the human-decides / cite-the-decree rules these sources feed.

---

## Unverified / Do Not Rely On

Reproduced from the research agents' own honest flags. **Do not launder any of these into a confident claim.**

- **customs.gov.vn API — the 10-vs-12 conflict itself is UNRESOLVED.** The "different endpoints" explanation (`/bridge` proxy vs raw backend IP `123.30.210.236:8080`) is a **hypothesis**, not a finding. Test both in Phase 0.
- **Whether `APIBieuThue` has rate limiting** — research 10 did not probe aggressively.
- **Whether `123.30.210.236:8080` is actually unreachable** — research 12 explicitly declined to claim this; it could not distinguish geo-fencing from a sandbox egress block.
- **vbpl gateway routes** — `https://vbpl-bientap-gateway.moj.gov.vn/api` was **found and reachable but UNMAPPED**. It is a Spring Cloud Gateway, publicly reachable and unauthenticated at the edge, but every probed path 404s, `/actuator` exposes only `health`, and there is no Swagger. The frontend calls it **server-side via Next.js Server Actions**, so routes never appear client-side. Worth ~30 more minutes: a documented API would delete the whole headless-browser step.
- **`referenceType` int → label mapping** — values `3` and `12` observed; we have the 27 labels but **not the join**.
- **Whether `provisionTree` / `referenceProvisions` are EVER populated** — `null` on both sampled documents. **This is the highest-value open question.** If populated site-wide, it is a **provision-level legal graph**, which is exactly what the April relaunch press claims ("quản lý chi tiết đến từng điều, khoản, điểm... máy có thể tự động đọc, hiểu") — and it would reshape the retrieval schema. **Test 10–20 recent documents before designing the schema.**
- **`?tabs=tai-ve` file links** — the panel rendered no links on the sample; the JSON has `hasOriginalPdf` / `hasContent` flags. May be document-specific.
- **Công báo total corpus size / date coverage** — not enumerated. Unknown.
- **Sustained-rate crawl behaviour on vbpl** — ~40 requests, no throttling seen; **not evidence of none at 158k scale**.
- **The EVFTA parser fix is INFERRED, not proven** — that LibreOffice → docx → `w:tbl/w:tr/w:tc` recovers the collapsed rate columns is an inference from RCEP's identical structure parsing correctly. No `soffice` / `python-docx` was available to prove it. **Close this gap first.**
- **Bộ Tư pháp "datafiles" bulk export** — searched for, not found. Absence of evidence only.
