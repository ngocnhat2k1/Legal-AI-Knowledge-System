#!/usr/bin/env python3
"""Build the notebook sources: consolidated, Docs-safe, deterministic.

    python3 render_notebook.py --dest ~/Desktop/Legal-AI-NotebookLM-Export/drive

Reads the canonical extracts in `db/seed/data/` plus the durable notes in `.agent/`, and
writes one markdown file per notebook source. Nothing here touches Postgres — the same
extracts feed `yarn db:seed:legal` when infrastructure comes back, so the notebook and the
corpus never diverge at the source.

THREE PROPERTIES THIS FILE MUST KEEP (incidents behind each: .agent/docs/inbox-ingest-workflow.md)

1. DETERMINISTIC. No clock, no locale. Re-running on unchanged input must produce
   byte-identical output: the manifest decides what to push by comparing hashes.
2. DOCS-SAFE. Everything goes through docs_safe. Google Docs deletes <details> and merges
   the hidden text into the paragraph above; Word field codes leak as literal text.
3. EVERY HEADING CARRIES ITS DOCUMENT IDENTITY. Sources are consolidated, and a chunk
   retrieved mid-source does not carry the file's H1. `#### Điều 5.` is ambiguous across
   three customs instruments; `#### NĐ 08/2015/NĐ-CP — Điều 5.` is not.

FILENAMES ARE THE ONLY KEY joining a local file to its Google Doc: rename one and rclone
creates a new Doc, orphaning the notebook source silently. So names — and the chapter
ranges of the Explanatory Notes — are CONSTANTS here, never derived from content size.

Source map (gaps are deliberate, so a new source never forces a renumber):
  00 status · 01 guide
  10–16  legal instruments from Công báo          20  Section/Chapter Notes + GRI (binding)
  21–29  tariff                                   30  business notes regenerated from .agent/
  40     công văn: classification rulings + guidance
  50–57  Explanatory Notes EN2022, Vietnamese     58  SEN 2022
  90     status undetermined (R15)                91  internal / operational
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from docs_safe import char_count, literal_text, strip_word_field_codes, to_docs_safe  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "db/seed/data"
LEGAL = DATA / "legal"
AGENT = ROOT / ".agent"
STATIC = Path(__file__).parent / "static"

#: Google Docs hard limit. Warn well before it: splitting a source that is already linked
#: in the notebook is a MANUAL operation — precisely the work this pipeline removes.
CHAR_LIMIT = 1_020_000
CHAR_WARN = 800_000

BANNER = (
    "**⚠️ Nguồn này để TRA VĂN BẢN.** Không dùng để tra thuế suất hay chốt mã HS — "
    "thuế suất chỉ tra qua khoá chính xác (mã HS, biểu, ngày as-of). "
    "Văn bản trong file có thể đã hết hiệu lực; xem nguồn `00-tinh-trang-hieu-luc`."
)

DOC_TYPE = {"nghi_dinh": "Nghị định", "thong_tu": "Thông tư", "vbhn": "Văn bản hợp nhất", "luat": "Luật",
            "nghi_quyet": "Nghị quyết", "quyet_dinh": "Quyết định"}
EFFECTIVENESS = {"con_hieu_luc": "Còn hiệu lực", "het_hieu_luc": "Hết hiệu lực",
                 "het_hieu_luc_mot_phan": "Hết hiệu lực một phần", "chua_co_hieu_luc": "⚠️ CHƯA CÓ HIỆU LỰC"}
VERIFICATION = {
    "verified": "Đã được người đối chiếu (verified)",
    "auto_unverified": "⚠️ Máy tải từ Công báo và phân tích — CHƯA có người đối chiếu (auto_unverified)",
}
RELATION = {"thay_the": "thay thế", "bai_bo": "bãi bỏ", "sua_doi": "sửa đổi, bổ sung",
            "het_hieu_luc": "làm hết hiệu lực"}
HS_STATUS = {
    "hien_hanh": "mã còn trong Danh mục AHTN 2022",
    "hien_hanh_cap_nhom": "nhóm còn trong AHTN 2022 — văn bản không nêu mã 8 số",
    "hien_hanh_cap_phan_nhom": "phân nhóm còn trong AHTN 2022 — văn bản không nêu mã 8 số",
    "doi_ma_8_so": "⚠️ mã 8 số KHÔNG còn trong AHTN 2022 (phân nhóm 6 số vẫn còn) — phải tra lại mã hiện hành",
    "phan_nhom_da_tach_hoac_bo": "⚠️ phân nhóm KHÔNG còn trong AHTN 2022 (đã tách hoặc bỏ) — mã chỉ đúng theo danh mục cũ",
    "nhom_khong_con": "⚠️ nhóm KHÔNG còn trong AHTN 2022",
    "khong_co_ma": "văn bản không kết luận mã",
    "khong_hop_le": "mã không hợp lệ",
}
CLASS_NOTE = {
    "A-local": "văn bản quy phạm pháp luật của địa phương",
    "A-ocr": "văn bản chính thức không đăng Công báo — bản văn là OCR đã đọc kép",
    "B": "công văn hướng dẫn nghiệp vụ, không phải văn bản quy phạm pháp luật",
    "C": "CHƯA XÁC ĐỊNH TÌNH TRẠNG — không dùng làm căn cứ",
    "D": "tài liệu nội bộ hoặc tác nghiệp, không phải nguồn pháp lý",
}
LOAI = {"cong_van": "Công văn", "thong_bao_ket_qua_phan_loai": "Thông báo kết quả phân loại / xác định trước mã số",
        "khac": "Khác"}

FTA_YEARS = [2022, 2023, 2024, 2025, 2026, 2027]
CUR_YEAR_IDX = FTA_YEARS.index(2026)
FTA_META = [("atiga", "ATIGA", "126/2022/NĐ-CP", True), ("acfta", "ACFTA", "118/2022/NĐ-CP", False),
            ("aanzfta", "AANZFTA", "121/2022/NĐ-CP", False), ("evfta", "EVFTA", "116/2022/NĐ-CP", True)]
TARIFF_TARGET_WORDS = 50_000

#: (file slug, title, legal documents in order, notebook-only entries appended after them)
LEGAL_SOURCES = [
    ("10-luat-va-thu-tuc-hai-quan", "Luật Hải quan, Luật Thuế XNK và thủ tục hải quan",
     ["54/VBHN-VPQH", "96/VBHN-VPQH", "46/VBHN-BTC"], []),
    ("11-tt-38-2015-thu-tuc-hai-quan", "Thông tư 38/2015 về thủ tục hải quan (VBHN 25/VBHN-BTC)",
     ["25/VBHN-BTC"], []),
    ("12-xuat-xu-va-xu-phat", "Xuất xứ hàng hóa và xử phạt vi phạm hành chính hải quan",
     ["31/2018/NĐ-CP", "33/2023/TT-BTC", "128/2020/NĐ-CP"], []),
    ("13-quan-ly-ngoai-thuong-nd-292-2026",
     "Nghị định 292/2026/NĐ-CP về quản lý ngoại thương (thay thế Nghị định 69/2018/NĐ-CP)",
     ["292/2026/NĐ-CP"], []),
    ("14-thu-tuc-hanh-chinh-xnk-nd-336-2026",
     "Nghị định 336/2026/NĐ-CP về thủ tục hành chính đối với hàng hóa xuất khẩu, nhập khẩu, quá cảnh "
     "(thay thế Nghị định 85/2019/NĐ-CP) — CHƯA CÓ HIỆU LỰC tới 15/10/2026",
     ["336/2026/NĐ-CP"], []),
    ("15-chat-luong-nhan-hang-va-danh-muc-rui-ro",
     "Chất lượng sản phẩm, hàng hóa, nhãn hàng hóa và danh mục hàng hóa rủi ro",
     ["37/2026/NĐ-CP", "36/2026/TT-BKHCN"], []),
    ("16-quan-ly-chuyen-nganh-khac",
     "Quản lý chuyên ngành khác: in ấn, máy móc đã qua sử dụng, năng lượng, phí hạ tầng cảng biển",
     ["72/2022/NĐ-CP", "11/2024/TT-BTTTT", "18/2019/QĐ-TTg", "52/2018/TT-BCT"],
     ["nq-12-2026-nq-hdnd", "1725-qd-bct"]),
]
#: Explanatory Notes packing, fixed. Planned 2026-09-10 at ≤ 760K characters per source.
EN_RANGES = [(1, 27), (28, 33), (34, 50), (51, 71), (72, 83), (84, 84), (85, 91), (92, 97)]

NGHIEP_VU = [
    ("concepts/hs-classification.md", "Phân loại mã HS: 6 quy tắc GRI, thứ bậc thẩm quyền"),
    ("concepts/tariff-system.md", "Hệ thống biểu thuế: MFN, FTA, bẫy phụ lục, vách đá 2027"),
    ("concepts/vietnamese-legal-documents.md", "Văn bản pháp luật Việt Nam: thứ bậc, hiệu lực, VBHN"),
    ("business-rules.md", "Quy tắc nghiệp vụ bắt buộc — rào chắn an toàn"),
    ("workflows/customs-declaration.md", "Quy trình khai báo hải quan hằng ngày"),
    ("concepts/data-sources.md", "Nguồn dữ liệu pháp lý: cái nào tin được"),
]

STARS = re.compile(r"^\s*\*(?:\s*\*)*\s*$", re.M)   # "* * *" separators of the EN layout


# --------------------------------------------------------------------------- helpers
def read_ndjson(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def norm(value):
    return None if value in (None, "None", "") else value


def fmt_date(iso) -> str:
    iso = norm(iso)
    return f"{iso[8:10]}/{iso[5:7]}/{iso[0:4]}" if iso and len(iso) >= 10 else "—"


def inline(text) -> str:
    return " ".join(str(text or "").split())


def md_cell(text) -> str:
    return inline(text).replace("|", "/").replace("*", "\\*")


def md_table(rows: list[list[str]]) -> list[str]:
    width = max(len(r) for r in rows)
    fill = lambda r: [md_cell(c) for c in r] + [""] * (width - len(r))  # noqa: E731
    return (["| " + " | ".join(fill(rows[0])) + " |", "|" + "---|" * width]
            + ["| " + " | ".join(fill(r)) + " |" for r in rows[1:]])


def short_number(doc: dict) -> str:
    """Label every heading carries. Original instrument first — a declarant looks up
    "TT 38/2015", not "25/VBHN-BTC" — with the VBHN kept for traceability."""
    consolidates = norm(doc.get("consolidates"))
    if consolidates and doc["doc_type"] == "vbhn":
        first = consolidates.split(",")[0].strip()
        if first:
            return f"{first} (VBHN {doc['number']})"
    return doc["number"]


def rate_text(value) -> str:
    if value is None:
        return "n/a"
    value = str(value).strip()
    return "LOẠI TRỪ" if value == "*" else f"{value}%"


def dotted(hs: str) -> str:
    return f"{hs[:4]}.{hs[4:6]}.{hs[6:8]}"


# ----------------------------------------------------------------------- legal texts
def render_annex_tables(doc: dict, tables: list[dict]) -> list[str]:
    label, out = short_number(doc), []
    for t in tables:
        rows = ([t["header"]] if t.get("header") else []) + t.get("rows", [])
        if not rows:
            continue
        flat = " ".join(" ".join(r) for r in rows).upper()
        if ("CỘNG HÒA" in flat or "CỘNG HOÀ" in flat) and len(rows) <= 3:
            continue  # letterhead
        if "NƠI NHẬN" in flat:
            continue  # signature block
        where = f" (sau: {inline(t['anchor'])[:90]})" if t.get("anchor") else ""
        out += ["", f"#### {label} — Bảng {t['index']}{where}", ""] + md_table(rows) + [""]
    return (["", "---", "", f"## {label} — Phụ lục và bảng biểu", ""] + out) if out else []


def render_legal_document(doc: dict, rows: list[dict], tables: list[dict]) -> list[str]:
    label = short_number(doc)
    kids = collections.defaultdict(list)
    for row in rows:
        if norm(row.get("parent_key")):
            kids[row["parent_key"]].append(row)
    for group in kids.values():
        group.sort(key=lambda r: r["order_index"])
    roots = sorted((r for r in rows if not norm(r.get("parent_key"))), key=lambda r: r["order_index"])
    doc_type = DOC_TYPE.get(doc["doc_type"], doc["doc_type"])
    out = [f"# {label} — {doc.get('short', '')}", "", f"**{doc_type} số {doc['number']} — {doc.get('title', '')}**", "",
           "| Thuộc tính | Giá trị |", "|---|---|"]
    # These rows keep EXACTLY the format already live in the notebook for the hand-built
    # corpus: adding documents must not rewrite sources 10–12, which are append-only. Only
    # what is new is labelled differently — auto_unverified, and a not-yet-effective end.
    verification = doc.get("verification", "verified")
    until = norm(doc.get("effective_to")) or (
        "chưa xác định" if doc.get("effectiveness") == "chua_co_hieu_luc" else "chưa xác định (còn hiệu lực)")
    for key, value in [
        ("Số hiệu", doc["number"]), ("Loại văn bản", doc_type), ("Cơ quan ban hành", doc.get("issuing_body")),
        ("Ngày ký", doc.get("signed_date")), ("Số Công báo", doc.get("gazette_issue")),
        ("Hiệu lực từ", doc.get("effective_from")), ("Hiệu lực đến", until),
        ("Tình trạng", EFFECTIVENESS.get(doc.get("effectiveness"), doc.get("effectiveness"))),
        ("Hợp nhất từ", norm(doc.get("consolidates")) or "—"),
        ("Mức xác minh", verification if verification == "verified" else VERIFICATION[verification]),
        ("Nguồn", doc.get("source_url")),
    ]:
        out.append(f"| {key} | {value if value is not None else '—'} |")
    out.append("")
    if doc.get("summary"):
        out += [f"**Tóm tắt.** {doc['summary']}", ""]
    dieu = sorted((r for r in rows if r["ptype"] == "dieu"), key=lambda r: r["order_index"])
    if dieu:
        out += [f"## Mục lục các điều — {label}", ""]
        out += [f"- {r.get('heading') or 'Điều ' + str(r.get('number'))}" for r in dieu]
        out.append("")
    out += ["---", "", f"## Toàn văn — {label}", ""]

    def walk(row):
        # out.extend(), never `out += …` — augmented assignment would rebind `out` as a
        # local of walk() and shadow the enclosing list (UnboundLocalError, 2026-09-10).
        ptype, heading, body = row["ptype"], norm(row.get("heading")), norm(row.get("body"))
        # Escape on OUTPUT only. The duplicate check below compares raw child text against
        # the raw body; comparing it against an escaped body failed and printed four khoản
        # of 33/2023/TT-BTC twice (2026-09-10).
        shown_heading, shown_body = literal_text(heading), literal_text(body)
        children = kids.get(row["key"], [])
        if ptype == "chuong":
            out.extend(["", f"### {label} — {shown_heading or 'Chương ' + str(row.get('number'))}", ""])
        elif ptype == "muc":
            out.extend(["", f"#### {label} — {shown_heading or 'Mục ' + str(row.get('number'))}", ""])
        elif ptype == "dieu":
            out.extend(["", f"#### {label} — {shown_heading or 'Điều ' + str(row.get('number'))}", ""])
            if body:
                out.extend([shown_body, ""])
        elif ptype == "khoan" and body:
            out.extend([f"**{row.get('number')}.** {shown_body}", ""])
        elif ptype == "diem" and body:
            out.extend([f"**{row.get('number')})** {shown_body}", ""])   # not a blockquote: Docs drops '>'
        if not children:
            return
        if body and all((k.get("body") or "")[:60] in body for k in children if norm(k.get("body"))):
            return  # the parent already carries its children verbatim
        for child in children:
            walk(child)

    for root in roots:
        walk(root)
    out += render_annex_tables(doc, tables)
    out.append("")
    return out


def render_entry(e: dict, level: str = "##") -> list[str]:
    """A notebook-only document. Its status sentence is printed as the FIRST line under the
    heading: a label that lives only in metadata never reaches the reader."""
    ident = e.get("number") or e["slug"]
    out = ["", "---", "", f"{level} {ident} — {inline(e['title'])}", "",
           f"**TÌNH TRẠNG — {CLASS_NOTE[e['class']]}:** {inline(e['status'])}", "",
           "| Thuộc tính | Giá trị |", "|---|---|"]
    for k, v in (("Số hiệu", e.get("number") or "— (văn bản không mang số)"), ("Ngày", fmt_date(e.get("date"))),
                 ("Cơ quan", e.get("issuer")), ("File nhận được", e.get("source_file")), ("Cách lấy chữ", e.get("method"))):
        out.append(f"| {k} | {md_cell(v) if v else '—'} |")
    items = e.get("mat_hang") or []
    if items:
        out += ["", f"**Mặt hàng và mã HS — {ident}:**", ""]
        for m in items:
            out.append(f"- {literal_text(inline(m.get('ten_hang')))} → **{m.get('ma_hs') or 'không nêu mã'}** — "
                       f"{HS_STATUS.get(m.get('hs2022'), '')}")
    out += ["", f"{level}# Toàn văn — {ident}", "", literal_text(STARS.sub("", e["text"]).strip()), ""]
    return out


def build_legal_sources(dest, docs, by_doc, tables_by_doc, nb):
    made = []
    for slug, title, numbers, extras in LEGAL_SOURCES:
        missing = [n for n in numbers if n not in docs]
        if missing:
            raise SystemExit(f"{slug}: thiếu văn bản trong kho: {missing}")
        parts = [f"# {title}", "", BANNER, ""]
        if len(numbers) + len(extras) > 1:
            parts += ["**Nguồn này gộp nhiều văn bản.** Mỗi tiêu đề mang số hiệu của văn bản chứa nó, nên một trích "
                      "dẫn luôn nói rõ nó thuộc văn bản nào.", ""]
            parts += [f"- {short_number(docs[n])} — {docs[n].get('short', '')}" for n in numbers]
            parts += [f"- {nb[s].get('number') or s} — {inline(nb[s]['title'])[:90]}" for s in extras if s in nb]
            parts.append("")
        for number in numbers:
            parts += ["", "---", ""] + render_legal_document(docs[number], by_doc[number], tables_by_doc.get(number, []))
        for s in extras:
            if s in nb:
                parts += render_entry(nb[s], "##")
            else:
                print(f"   ⚠️ {slug}: chưa có '{s}' — nguồn này CHƯA được đẩy cho tới khi đủ")
        made.append((dest / f"{slug}.md", parts, title))
    return made


# ------------------------------------------------------------------ notes + GRI (TT 31/2022)
def build_notes_source(dest):
    notes, gri = read_ndjson(LEGAL / "hs-notes.ndjson"), read_ndjson(LEGAL / "hs-gri.ndjson")
    roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV",
             "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"]
    note_label = {"chu_giai": "Chú giải", "chu_giai_phan_nhom": "Chú giải phân nhóm"}
    title = "Chú giải Phần, Chú giải Chương và sáu quy tắc tổng quát (GRI)"
    parts = [f"# {title}", "", BANNER, "",
             "**Nguồn:** Thông tư số 31/2022/TT-BTC ngày 08/6/2022 (Danh mục AHTN 2022), Công báo 523+524 … 557+558 "
             "ngày 08/7/2022, hiệu lực 01/12/2022.",
             "**Link:** https://congbao.chinhphu.vn/van-ban/thong-tu-so-31-2022-tt-btc-37431.htm", "",
             "**Đây là phần MANG GIÁ TRỊ PHÁP LÝ khi phân loại.** Theo Quy tắc 1 GRI, tên của Phần, "
             "Chương, Phân chương **chỉ để dễ tra cứu, không có giá trị pháp lý**; cái có giá trị "
             "pháp lý là nội dung nhóm hàng và Chú giải Phần/Chương. Ba phần dưới đây được áp dụng "
             "cùng nhau trong một lập luận phân loại, nên chúng nằm chung một nguồn.", "",
             "**Bẫy thường gặp:** Chú giải 1 của một Phần thường là danh sách *\"Phần này KHÔNG bao "
             "gồm\"* — nó **loại trừ hàng RA KHỎI** Phần đó, không kéo hàng vào. Đọc ngược chiều điều "
             "khoản này là lỗi phân loại phổ biến.", ""]

    def block(row):
        out = [f"**{note_label[row['note_type']]}**", "", literal_text(row["text_vi"]), ""]
        if row.get("text_en"):
            out += ["##### Nguyên văn tiếng Anh (WCO)", "", literal_text(row["text_en"]), ""]
        return out

    parts += ["", "---", "", "## Sáu quy tắc tổng quát (GRI)", "",
              "**Thứ tự áp dụng là bắt buộc.** Không nhảy sang Quy tắc 3 khi Quy tắc 1 đã giải "
              "quyết được hàng hóa. Trong Quy tắc 3, thứ tự 3(a) → 3(b) → 3(c) cũng bắt buộc.", ""]
    seen, order = set(), []
    for row in gri:
        if row["rule"] not in seen:
            seen.add(row["rule"])
            order.append(row["rule"])
    for rule in order:
        parts += ["", f"### GRI — Quy tắc {rule}", ""]
        for kind, lbl in (("rule", "Nội dung quy tắc"), ("note", f"Chú giải Quy tắc {rule}")):
            for row in gri:
                if row["rule"] == rule and row["kind"] == kind:
                    parts += [f"#### {lbl}", "", literal_text(row["text_vi"]), ""]
                    if row.get("text_en"):
                        parts += ["##### Nguyên văn tiếng Anh (WCO)", "", literal_text(row["text_en"]), ""]
    sections = [r for r in notes if r["scope"] == "phan"]
    have = sorted({r["phan"] for r in sections}, key=roman.index)
    parts += ["", "---", "", "## Chú giải Phần (Section Notes)", "",
              f"Trong HS 2022 chỉ **{len(have)} Phần** có Chú giải: {', '.join(have)}. "
              "Các Phần còn lại không có Chú giải — đó là đặc điểm của HS, không phải thiếu dữ liệu.", ""]
    for rm in have:
        group = [r for r in sections if r["phan"] == rm]
        parts += ["", f"### PHẦN {rm} — {group[0]['title_vi']}", ""]
        if group[0].get("title_en"):
            parts += [f"*{group[0]['title_en']}*", ""]
        for row in group:
            parts += block(row)
    chapters = sorted((r for r in notes if r["scope"] == "chuong"), key=lambda r: (int(r["chuong"]), r["note_type"]))
    parts += ["", "---", "", "## Chú giải Chương (Chapter Notes)", "",
              "Chú giải Chương được áp dụng **sau** Chú giải Phần. `Chú giải phân nhóm` "
              "(Subheading Notes) chỉ dùng khi so sánh ở **cùng một cấp phân nhóm** theo Quy tắc 6.", "",
              "Chương không xuất hiện ở đây là chương không có chú giải trong HS 2022 "
              "(ví dụ Chương 50, 53, 81); riêng **Chương 77 được để trống dự phòng**.", ""]
    for chapter in sorted({int(r["chuong"]) for r in chapters}):
        group = [r for r in chapters if int(r["chuong"]) == chapter]
        parts += ["", f"### Chương {chapter:02d} — {group[0]['title_vi']}", ""]
        if group[0].get("title_en"):
            parts += [f"*{group[0]['title_en']}*", ""]
        for row in group:
            parts += block(row)
    return dest / "20-chu-giai-va-quy-tac-GRI.md", parts, title


# ---------------------------------------------------------------------- tariff
def build_tariff_sources(dest):
    desc = {r["hs"]: r for r in read_ndjson(DATA / "hs-descriptions.ndjson")}
    nd26 = read_ndjson(DATA / "nd26-muc1.ndjson")
    mfn = {r["hs"]: r for r in nd26 if r["annex"] == "II"}
    xk = {r["hs"]: r for r in nd26 if r["annex"] == "I"}
    ch98 = read_ndjson(DATA / "nd26-chapter98.ndjson")
    trq = {r["hs"]: r["rate"] for r in json.loads((DATA / "nd26-annex-iv.json").read_text(encoding="utf-8"))}
    ftas = {k: {r["hs"]: r for r in read_ndjson(DATA / f"fta-{k}.ndjson")} for k, *_ in FTA_META}
    all_hs = sorted(h for h in (set(desc) | set(mfn)) if not h.startswith("98"))
    by_chapter = collections.defaultdict(list)
    for hs in all_hs:
        by_chapter[hs[:2]].append(hs)

    def line(hs):
        d, m = desc.get(hs, {}), mfn.get(hs)
        label = (d.get("desc") or (m or {}).get("desc") or "").strip()
        cells, extra = [f"MFN {rate_text(m['rate']) if m else 'n/a'}"], []
        for key, name, _decree, per_year in FTA_META:
            row = ftas[key].get(hs)
            if not row or not row["rates"]:
                cells.append(f"{name} n/a")
                continue
            rates = row["rates"]
            if per_year and len(rates) == len(FTA_YEARS):
                cells.append(f"{name} {rate_text(rates[CUR_YEAR_IDX])}")
                if len(set(rates)) > 1:
                    extra.append(f"{name} " + "/".join(rate_text(v) for v in rates))
            else:
                cells.append(f"{name} {rate_text(rates[0])}")
        out = [f"- **{dotted(hs)}** {label}".rstrip() + " · " + " · ".join(cells)]
        if extra:
            out.append("  - Lộ trình " + " (2022→2027) · ".join(extra) + " (2022→2027)")
        if hs in xk and xk[hs].get("rate") is not None:
            out.append(f"  - Thuế xuất khẩu: {rate_text(xk[hs]['rate'])}")
        if hs in trq:
            out.append(f"  - Ngoài hạn ngạch (Phụ lục IV): {rate_text(trq[hs])}")
        return "\n".join(out)

    blocks = []
    for chapter in sorted(by_chapter):
        groups = collections.OrderedDict()
        for hs in by_chapter[chapter]:
            groups.setdefault(hs[:4], []).append(hs)
        for gid, hs_list in groups.items():
            heading = next((desc[x].get("heading") for x in hs_list if desc.get(x, {}).get("heading")), None)
            title = f"### Nhóm {gid[:2]}.{gid[2:]}" + (f" — {heading}" if heading else "")
            blocks.append((chapter, gid, title + "\n\n" + "\n".join(line(h) for h in hs_list) + "\n"))
    bins, current, words = [], [], 0
    for block in blocks:
        bw = len(block[2].split())
        if current and words + bw > TARIFF_TARGET_WORDS:
            bins.append(current)
            current, words = [], 0
        current.append(block)
        words += bw
    if current:
        bins.append(current)
    header = ["Danh mục mã HS 8 số (AHTN 2022) kèm thuế suất.",
              "**Mức FTA hiển thị là năm 2026 và chỉ áp dụng khi có C/O hợp lệ** — không có C/O thì áp MFN.",
              "`LOẠI TRỪ` = mặt hàng bị loại khỏi cam kết FTA đó (KHÔNG phải 0%). `n/a` = không có dòng tương ứng.", ""]
    made = []
    for index, group in enumerate(bins, start=21):
        chapters = sorted({b[0] for b in group})
        span = f"chuong-{chapters[0]}" if len(chapters) == 1 else f"chuong-{chapters[0]}-den-{chapters[-1]}"
        gfrom, gto = group[0][1], group[-1][1]
        title = f"Mã HS và biểu thuế — Chương {chapters[0]}" + (f"–{chapters[-1]}" if len(chapters) > 1 else "")
        title += f" (nhóm {gfrom[:2]}.{gfrom[2:]} → {gto[:2]}.{gto[2:]})"
        parts = [f"# {title}", "", BANNER, ""] + header
        last = None
        for chapter, _gid, text in group:
            if chapter != last:
                parts += ["", f"## Chương {chapter}", ""]
                last = chapter
            parts.append(text)
        made.append((dest / f"{index:02d}-{span}.md", parts, title))
    title = "Chương 98 (ưu đãi riêng) và Biểu thuế xuất khẩu"
    parts = [f"# {title}", "", BANNER, "",
             "## Chương 98 — Biểu thuế nhập khẩu ưu đãi riêng (Mục II, Phụ lục II NĐ 26/2023)", "",
             "Chương 98 là chương **riêng của Việt Nam**, không thuộc danh mục HS quốc tế. Một số mặt "
             "hàng được xếp mã `98xx` với thuế suất ưu đãi riêng, kèm **mã tương ứng** ở chương thông "
             "thường. Muốn hưởng mức Chương 98 phải **đáp ứng điều kiện sử dụng/đối tượng** — không "
             "phải cứ khai `98xx` là được hưởng.", "", f"Tổng cộng **{len(ch98)} mã**.", ""]
    for row in sorted(ch98, key=lambda r: r["hs"]):
        c = row.get("corresponding")
        parts.append(f"- **{row['hs_dotted']}** {row.get('desc', '').strip()} · NK ưu đãi **{rate_text(row.get('rate'))}**"
                     + (f" · mã tương ứng chương thường: **{dotted(c)}**" if c else ""))
    parts += ["", "---", "", "## Biểu thuế xuất khẩu (Phụ lục I, Nghị định 26/2023/NĐ-CP)", "",
              "Việt Nam **chỉ đánh thuế xuất khẩu với một danh mục hạn chế** — chủ yếu khoáng sản, "
              "nguyên liệu thô, phế liệu và kim loại. **Mã HS không có trong danh sách dưới đây thì "
              "thuế xuất khẩu = 0%.**", "",
              "**⚠️ Cảnh báo độ cũ:** Nghị định **201/2026/NĐ-CP** sửa Biểu thuế xuất khẩu của "
              "NĐ 26/2023 nhưng **chưa được nạp vào dữ liệu này**. Với hàng xuất khẩu phải đối chiếu "
              "lại NĐ 201/2026.", "", f"Tổng cộng **{len(xk)} mã** có quy định thuế xuất khẩu.", ""]
    for hs in sorted(xk):
        row = xk[hs]
        parts.append(f"- **{row['hs_dotted']}** {row.get('desc', '').strip()} · thuế XK **{rate_text(row.get('rate'))}**")
    made.append((dest / "29-chuong-98-va-bieu-thue-xuat-khau.md", parts, title))
    return made


# ------------------------------------------------------- Explanatory Notes + SEN (công văn)
EN_INTRO = ("**Nguồn:** Chú giải chi tiết Danh mục HS 2022 (EN2022), ban hành kèm Công văn 1810/TCHQ-TXNK ngày 26/4/2024 "
            "của Tổng cục Hải quan. **Tính chất:** tài liệu HƯỚNG DẪN ÁP DỤNG — không phải văn bản quy phạm pháp luật. "
            "Chú giải Phần/Chương có giá trị pháp lý nằm ở nguồn `20-chu-giai-va-quy-tac-GRI` (TT 31/2022/TT-BTC). "
            "**Chỉ gồm bản tiếng Việt**; cột tiếng Anh (nguyên văn WCO) không nạp. Mỗi tiêu đề mang số chương và nhóm; "
            "nhóm nào không tách được tiêu đề được ghi rõ *có thể gồm cả*.")


def build_en_sources(dest):
    en = read_ndjson(LEGAL / "hs-explanatory-notes.ndjson")
    by_ch = collections.OrderedDict()
    for r in en:
        by_ch.setdefault(r["chapter"], []).append(r)
    made = []
    for i, (lo, hi) in enumerate(EN_RANGES):
        title = f"Chú giải chi tiết HS 2022 — Chương {lo:02d}–{hi:02d}" if lo != hi else f"Chú giải chi tiết HS 2022 — Chương {lo:02d}"
        parts = [f"# {title}", "", BANNER, "", EN_INTRO, ""]
        for ch in range(lo, hi + 1):
            for r in by_ch.get(ch, []):
                if r["heading"]:
                    head = f"### EN2022 · Chương {ch:02d} · Nhóm {r['heading']} — {inline(r['title'])[:160]}"
                    if r.get("also_contains"):
                        head += f" (có thể gồm cả nhóm {', '.join(r['also_contains'])})"
                else:
                    head = f"### EN2022 · Chương {ch:02d} · Chú giải chương và phần mở đầu"
                    if r.get("also_contains"):
                        head += f" (có thể gồm cả nhóm {', '.join(r['also_contains'])})"
                parts += ["", head, "", literal_text(STARS.sub("", r["text_vi"]).strip()), ""]
        name = f"{50 + i}-chu-giai-chi-tiet-hs-chuong-{lo:02d}" + (f"-{hi:02d}" if hi != lo else "")
        made.append((dest / f"{name}.md", parts, title))
    return made


def build_sen_source(dest):
    title = "Chú giải bổ sung AHTN 2022 (SEN)"
    parts = [f"# {title}", "", BANNER, "",
             "**Nguồn:** Chú giải bổ sung (SEN) của Danh mục thuế quan hài hòa ASEAN (AHTN 2022), ban hành kèm Công văn "
             "3866/TCHQ-TXNK ngày 24/7/2023 của Tổng cục Hải quan. **Tính chất:** hướng dẫn phân loại các phân nhóm ASEAN "
             "(8 số) — không phải văn bản quy phạm pháp luật. **Chỉ gồm bản tiếng Việt.** SEN của AHTN 2012 "
             "(TT 156/2011/TT-BTC) KHÔNG nạp vì đã bị bản này thay thế.", ""]
    for r in read_ndjson(LEGAL / "hs-sen.ndjson"):
        head = f"### SEN 2022 · Chương {r['chapter']:02d}" if r["chapter"] else "### SEN 2022 · Lời nói đầu"
        parts += ["", head, "", literal_text(STARS.sub("", r["text_vi"]).strip()), ""]
    return dest / "58-chu-giai-bo-sung-sen-ahtn-2022.md", parts, title


# ------------------------------------------------------------------ công văn (40)
def build_congvan_source(dest, rulings, nb):
    title = "Công văn của cơ quan Hải quan: phân loại hàng hóa và hướng dẫn nghiệp vụ"
    parts = [f"# {title}", "", BANNER, "",
             "**Tính chất:** công văn và thông báo là văn bản hành chính — KHÔNG phải văn bản quy phạm pháp luật. Kết quả "
             "phân loại hoặc xác định trước mã số áp dụng cho đúng mặt hàng, đúng hồ sơ được nêu; dùng để tham khảo khi áp "
             "mã, không thay việc tự phân loại theo 6 quy tắc GRI.", "",
             "**Cách đọc nhãn mã HS.** Mỗi mã đã được đối chiếu tự động với Danh mục AHTN 2022 hiện hành. Văn bản cũ dùng "
             "danh mục cũ, nên mã có thể không còn tồn tại:", ""]
    parts += [f"- *{v}*" for v in HS_STATUS.values()]
    parts += ["", "**Cách lấy chữ.** Bản scan được OCR máy, rồi một agent đọc lại ẢNH GỐC và một agent độc lập khác thẩm tra "
              "số hiệu, ngày, mã HS. OCR máy làm hỏng mã HS trên bản scan cũ (`8479.89.30` → `84/9.89.30`; `6592` → `6593`) — "
              "vì vậy không có dòng nào lấy thẳng từ OCR.", "",
              "## Phần 1 — Công văn, thông báo phân loại hàng hóa", ""]
    for r in sorted(rulings, key=lambda r: (r.get("ngay_ban_hanh") or "", r.get("so_hieu") or ""), reverse=True):
        ident = r.get("so_hieu") or "(không rõ số hiệu)"
        parts += ["", f"### {ident} ngày {fmt_date(r.get('ngay_ban_hanh'))} — {inline(r['trich_yeu'])}", "",
                  "| Thuộc tính | Giá trị |", "|---|---|",
                  f"| Cơ quan | {md_cell(r['co_quan_ban_hanh'])} |", f"| Loại | {LOAI.get(r['loai'], r['loai'])} |",
                  f"| Danh mục áp dụng | {md_cell(r['danh_muc_ap_dung'])} |",
                  f"| Cách lấy chữ | {'Bản scan — OCR, đọc ảnh gốc, thẩm tra độc lập' if r['scanned'] else 'Lớp text của file'} |",
                  f"| Độ tin cậy trích xuất | {r['do_tin_cay']} |", "", f"**Kết luận phân loại — {ident}:**", ""]
        for m in r["mat_hang"]:
            parts.append(f"- {literal_text(inline(m['ten_hang']))} → **{m.get('ma_hs') or 'không kết luận mã'}** — "
                         f"{HS_STATUS.get(m.get('hs2022'), '')}")
            parts.append(f"  - {literal_text(inline(m['ket_luan']))}")
        if r.get("do_tin_cay") != "cao" and r.get("ghi_chu"):
            parts += ["", f"**Ghi chú trích xuất:** {inline(r['ghi_chu'])}"]
        parts += ["", f"#### Toàn văn — {ident}", "", literal_text(r["noi_dung"].strip()), ""]
    guidance = sorted((e for e in nb.values() if e["class"] == "B"), key=lambda e: e.get("date") or "", reverse=True)
    parts += ["", "---", "", "## Phần 2 — Công văn hướng dẫn nghiệp vụ", ""]
    for e in guidance:
        parts += render_entry(e, "###")
    return dest / "40-cong-van-hai-quan.md", parts, title


def build_class_source(dest, name, title, intro, klass, nb):
    entries = sorted((e for e in nb.values() if e["class"] == klass), key=lambda e: e["slug"])
    parts = [f"# {title}", "", BANNER, "", intro, ""]
    for e in entries:
        parts += render_entry(e, "##")
    return dest / f"{name}.md", parts, title


# ------------------------------------------------------------- guide / notes / status
def build_nghiep_vu_source(dest):
    title = "Kiến thức nghiệp vụ hải quan"
    parts = [f"# {title}", "", BANNER, "",
             "Ghi chú nghiệp vụ biên soạn trong dự án — phần giải thích *vì sao* mà đọc luật trần không thấy. "
             "Sinh trực tiếp từ `.agent/` nên không lệch với repo.", ""]
    for rel, sub in NGHIEP_VU:
        path = AGENT / rel
        if not path.exists():
            raise SystemExit(f"thiếu ghi chú nghiệp vụ: {path}")
        text = path.read_text(encoding="utf-8")
        if text.startswith("---"):
            end = text.find("\n---", 3)
            if end != -1:
                text = text[end + 4:]
        parts += ["", "---", "", f"## {sub}", "", f"*Nguồn trong repo: `.agent/{rel}`*", "", text]
    return dest / "30-kien-thuc-nghiep-vu.md", parts, title


def build_status_source(dest, docs, relations, nb, rulings):
    title = "Tình trạng hiệu lực của các văn bản trong notebook"
    parts = [f"# {title}", "",
             "**Đọc nguồn này trước khi trích dẫn bất kỳ điều khoản nào.** Notebook truy hồi theo ngữ nghĩa trên toàn bộ "
             "nguồn và KHÔNG có bộ lọc hiệu lực — một điều khoản đã bị bãi bỏ vẫn được trả về với số hiệu đúng, ngày đúng.",
             "", "## Văn bản quy phạm pháp luật", "",
             "| Số hiệu | Văn bản | Hiệu lực từ | Tình trạng | Mức xác minh |", "|---|---|---|---|---|"]
    for d in sorted(docs.values(), key=lambda d: (d.get("effective_from") or "", d["number"])):
        ver = "verified" if d.get("verification", "verified") == "verified" else "⚠️ auto_unverified"
        parts.append(f"| {d['number']} | {md_cell(d.get('short'))} | {fmt_date(d.get('effective_from'))} | "
                     f"{EFFECTIVENESS.get(d.get('effectiveness'), d.get('effectiveness'))} | {ver} |")
    parts += ["", "## Quan hệ thay thế, bãi bỏ, sửa đổi đã biết", "",
              "*Đọc nguyên văn từ \"Điều khoản thi hành\" của văn bản mới. Đây là DỮ LIỆU VỀ chuyển đổi — hệ thống không "
              "tự hợp nhất văn bản.*", "",
              "| Văn bản | Quan hệ | Văn bản bị tác động | Từ ngày | Căn cứ |", "|---|---|---|---|---|"]
    for r in relations:
        parts.append(f"| {r['from']} | {RELATION.get(r['relation'], r['relation'])} | {md_cell(r['to'])} | "
                     f"{fmt_date(r.get('from_date'))} | {md_cell(r.get('evidence'))} |")
    pending = [d for d in docs.values() if d.get("effectiveness") == "chua_co_hieu_luc"]
    if pending:
        parts += ["", "## ⚠️ Văn bản CHƯA CÓ HIỆU LỰC", ""]
        parts += [f"- **{d['number']}** — có hiệu lực từ **{fmt_date(d['effective_from'])}**. Trước ngày đó, văn bản mà nó "
                  f"thay thế vẫn là căn cứ đang áp dụng." for d in pending]
    undetermined = sorted((e for e in nb.values() if e["class"] == "C"), key=lambda e: e["slug"])
    if undetermined:
        parts += ["", "## Tài liệu CHƯA XÁC ĐỊNH TÌNH TRẠNG (nguồn 90)", ""]
        parts += [f"- **{inline(e['title'])[:110]}** — {inline(e['status'])[:260]}" for e in undetermined]
    stale = [(r, m) for r in rulings for m in r["mat_hang"]
             if m.get("hs2022") in ("doi_ma_8_so", "phan_nhom_da_tach_hoac_bo", "nhom_khong_con")]
    if stale:
        parts += ["", "## Công văn phân loại dùng mã KHÔNG còn trong AHTN 2022 (nguồn 40)", ""]
        parts += [f"- {r['so_hieu']} ({fmt_date(r.get('ngay_ban_hanh'))}): **{m['ma_hs']}** — {HS_STATUS[m['hs2022']]}"
                  for r, m in stale]
    parts.append("")
    return dest / "00-tinh-trang-hieu-luc.md", parts, title


def build_guide_source(dest, inventory):
    title = "Hướng dẫn sử dụng bộ tri thức hải quan"
    parts = [f"# {title}", "", BANNER, "",
             "Bộ nguồn này được sinh tự động từ kho dữ liệu dự án Customs Assistant và **tự đồng bộ qua Google Drive** — nội "
             "dung đổi thì nguồn trong notebook cập nhật theo sau vài phút, không cần thêm lại nguồn.", "",
             "## Các nguồn trong notebook", "", "| Nguồn | Nội dung | Số ký tự |", "|---|---|---|"]
    for stem, sub, chars in inventory:
        parts.append(f"| {stem} | {md_cell(sub)} | {chars:,} |")
    parts += ["", "## Cách đọc nhãn", "",
              "- **auto_unverified** — máy tải từ Công báo và phân tích; CHƯA có người đối chiếu. Trích dẫn phải kèm cảnh báo.",
              "- **CHƯA CÓ HIỆU LỰC** — văn bản đã ký nhưng chưa tới ngày hiệu lực.",
              "- **CHƯA XÁC ĐỊNH TÌNH TRẠNG** (nguồn 90) — bản chưa ký, không tìm thấy trên Công báo. Không dùng làm căn cứ.",
              "- **Công văn** (nguồn 40) — văn bản hành chính, không phải quy phạm pháp luật.",
              "- **Nội bộ** (nguồn 91) — tài liệu tổng hợp, tác nghiệp; không phải nguồn pháp lý.", "",
              "## Cái gì KHÔNG có trong bộ dữ liệu này", "",
              "- **Thuế GTGT, TTĐB, BVMT** — không được khoá theo mã HS trong luật.",
              "- **Thuế chống bán phá giá** — không có sổ đăng ký hợp nhất máy đọc được.",
              "- **Toàn bộ giấy phép, kiểm tra chuyên ngành** — chỉ có phần đã nạp; không đầy đủ.", ""]
    for name in ("cach-doc-bieu-thue.md", "cach-hoi-de-tra-cuu.md"):
        path = STATIC / name
        if path.exists():
            parts += ["", "---", "", path.read_text(encoding="utf-8")]
    return dest / "01-huong-dan-su-dung.md", parts, title


# ------------------------------------------------------------------------- main
def finish(parts: list[str]) -> str:
    return to_docs_safe(strip_word_field_codes("\n".join(parts).rstrip() + "\n"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dest", required=True, help="thư mục đích (sẽ được đẩy lên Drive)")
    args = ap.parse_args()
    dest = Path(args.dest).expanduser()
    dest.mkdir(parents=True, exist_ok=True)

    docs = {d["number"]: d for d in read_ndjson(LEGAL / "documents.ndjson")}
    by_doc = collections.defaultdict(list)
    for row in read_ndjson(LEGAL / "provisions.ndjson"):
        by_doc[row["document_number"]].append(row)
    tables_by_doc = collections.defaultdict(list)
    for t in read_ndjson(LEGAL / "annex-tables.ndjson"):
        tables_by_doc[t["document_number"]].append(t)
    nb = {e["slug"]: e for e in read_ndjson(LEGAL / "notebook-only.ndjson")}
    rulings = read_ndjson(LEGAL / "classification-rulings.ndjson")
    relations = read_ndjson(LEGAL / "relations.ndjson")

    pending = build_legal_sources(dest, docs, by_doc, tables_by_doc, nb)
    pending.append(build_notes_source(dest))
    pending += build_tariff_sources(dest)
    pending.append(build_nghiep_vu_source(dest))
    pending.append(build_congvan_source(dest, rulings, nb))
    pending += build_en_sources(dest)
    pending.append(build_sen_source(dest))
    pending.append(build_class_source(
        dest, "90-CHUA-XAC-DINH-tinh-trang", "Tài liệu CHƯA XÁC ĐỊNH tình trạng — không dùng làm căn cứ",
        "**🔴 Mọi tài liệu trong nguồn này đều CHƯA XÁC ĐỊNH TÌNH TRẠNG.** Bản trong tay chưa ký (ô số hiệu hoặc ngày để "
        "trống) và dò Công báo không thấy văn bản khớp. Có thể là dự thảo, cũng có thể đã ban hành với số khác. Chỉ dùng "
        "để biết cái gì có thể sắp tới — không bao giờ trích làm căn cứ.", "C", nb))
    pending.append(build_class_source(
        dest, "91-tai-lieu-noi-bo-tham-khao", "Tài liệu nội bộ và tác nghiệp — không phải nguồn pháp lý",
        "**⚠️ Tài liệu trong nguồn này là bảng tổng hợp, bản tóm tắt, danh sách tác nghiệp — KHÔNG phải nguồn pháp lý.** "
        "Luôn đối chiếu với văn bản gốc được nêu trong phần tình trạng của từng tài liệu.", "D", nb))
    pending.append(build_status_source(dest, docs, relations, nb, rulings))

    written, inventory, over = [], [], []
    for path, parts, title in pending:
        text = finish(parts)
        path.write_text(text, encoding="utf-8")
        written.append((path, char_count(text)))
        inventory.append((path.stem, title, char_count(text)))
    guide_path, guide_parts, _ = build_guide_source(dest, sorted(inventory))
    guide = finish(guide_parts)
    guide_path.write_text(guide, encoding="utf-8")
    written.append((guide_path, char_count(guide)))

    total = 0
    for path, chars in sorted(written):
        flag = "  ⚠️ VƯỢT NGƯỠNG CẢNH BÁO" if chars > CHAR_WARN else ""
        print(f"{chars:>9,} ký tự  {chars / CHAR_LIMIT * 100:>5.1f}%  {path.name}{flag}")
        total += chars
        if chars > CHAR_WARN:
            over.append(path.name)
    print(f"\n{len(written)} nguồn · {total:,} ký tự · giới hạn 50 nguồn cho bản miễn phí")
    if any(c > CHAR_LIMIT for _, c in written):
        print("🔴 CÓ NGUỒN VƯỢT 1.020.000 KÝ TỰ — Google Docs sẽ từ chối. Dừng.")
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
