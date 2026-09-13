#!/usr/bin/env python3
"""Turn documents downloaded from Công báo into the canonical legal extracts.

    python3 ingest_congbao.py --work <dir-with-downloads> [--dry-run]

Writes (idempotently — rows for the same document number are replaced, others kept):
    db/seed/data/legal/documents.ndjson     one row per instrument, verification=auto_unverified
    db/seed/data/legal/provisions.ndjson    Chương/Mục/Điều/Khoản/Điểm tree
    db/seed/data/legal/chunks.ndjson        one chunk per Điều, embedded at seed time
    db/seed/data/legal/annex-tables.ndjson  every table, cell by cell (not yet seeded)

These files ARE the backup: `yarn db:seed:legal` loads the first three, so nothing done
while the project has no server has to be redone when it gets one back.

TWO BRANCHES, BECAUSE ONE WOULD LOSE THE ANNEXES. The project's prose parser
(research/legal-loader/parse_provisions.py) drops every line carrying a Word cell mark —
right for prose, fatal for a danh mục: NĐ 292/2026 alone has 66 tables, 349 rows. So
prose goes through parse_provisions.build() verbatim, and tables go through a table
reader that keeps cells. The gate refuses a document whose Điều do not run 1..N.

WORD FILES FROM CÔNG BÁO NEED TWO REPAIRS, both found the hard way (2026-09-10):
  * .docx zip entries use Windows back-slashes (`customXml\\item1.xml`) and include a
    `[trash]` entry; neither textutil nor python-docx opens them until repacked.
  * a heading paragraph can hold a soft line break ("Mục 2\\nĐÁNH GIÁ SỰ PHÙ HỢP"). Fed
    as one line, the parser takes the NEXT paragraph — "Điều 71. …" — for the wrapped
    tail of the section title and swallows the article. NĐ 37/2026 lost 5 of 99 that way.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEGAL = ROOT / "db/seed/data/legal"
sys.path.insert(0, str(ROOT / "research/legal-loader"))
sys.path.insert(0, str(ROOT / "apps/ingest"))
sys.path.insert(0, str(Path(__file__).parent))
import parse_provisions as pp  # noqa: E402
from build_chunks import build_chunks  # noqa: E402

TODAY = date.today().isoformat()
DOC_TYPE = [("NĐ-CP", "nghi_dinh", "Nghị định"), ("QĐ-", "quyet_dinh", "Quyết định"),
            ("TT-", "thong_tu", "Thông tư"), ("NQ-", "nghi_quyet", "Nghị quyết")]

# (number, congbao id, work sub-directory, domain) — the domain is ours, not Công báo's.
SOURCES = [
    ("292/2026/NĐ-CP", 470149, "292-2026-nd-cp", "Quản lý ngoại thương"),
    ("336/2026/NĐ-CP", 470341, "336-2026-nd-cp", "Thủ tục hải quan"),
    ("37/2026/NĐ-CP", 468865, "37-2026-nd-cp", "Chất lượng sản phẩm, hàng hóa"),
    ("36/2026/TT-BKHCN", 469968, "36-2026-tt-bkhcn", "Danh mục hàng hóa rủi ro"),
    ("72/2022/NĐ-CP", 38012, "72-2022-nd-cp", "In ấn — thiết bị in"),
    ("11/2024/TT-BTTTT", 42827, "11-2024-tt-btttt", "In ấn — thiết bị in"),
    ("52/2018/TT-BCT", 28155, "52-2018-tt-bct", "Năng lượng"),
    ("18/2019/QĐ-TTg", 28889, "18-2019-qd-ttg", "Máy móc, thiết bị đã qua sử dụng"),
]


def repack_docx(src: Path) -> Path:
    dst = src.with_name(src.stem + ".fixed.docx")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            name = item.filename.replace("\\", "/")
            if not name.startswith("[trash]"):
                zout.writestr(name, zin.read(item.filename))
    return dst


from docs_safe import strip_word_field_codes as clean  # noqa: E402  (one definition), decode_symbol_font

DEBRIS = re.compile(r"HYPERLINK|MERGEFORMAT|PAGEREF|_Toc\d")


ANCHOR = re.compile(r"^(Điều\s+\d+\s*\.|PHỤ LỤC|Phụ lục\s+[IVXLC0-9]+\b)")


#: Glyphs a Word run draws from a PICTURE font, stored as private-use code points. Google Docs
#: deletes private-use characters, so they must become the Unicode they draw — and the
#: meaning depends on the FONT, not the code point: U+F02A is `∗` in Symbol but the empty
#: tick box of a form in Wingdings 2. Wingdings 2 entries were read off the rendered Công báo
#: PDF of 37/2026/NĐ-CP (form in the GS1 annex: "Điền ✓ vào ô trống" beside □ boxes), not
#: from memory. A code point not listed stays as it is, and verify_drive.py flags it.
_PICTURE_FONTS = {"Wingdings 2": {0xF020: " ", 0xF02A: "□", 0xF050: "✓"}}


def decode_glyph_runs(body, qn) -> None:
    """Rewrite, in place, every run whose font is Symbol or a listed picture font."""
    for run in body.iter(qn("w:r")):
        fonts = run.find(qn("w:rPr") + "/" + qn("w:rFonts"))
        if fonts is None:
            continue
        name = fonts.get(qn("w:hAnsi")) or fonts.get(qn("w:ascii")) or ""
        table = _PICTURE_FONTS.get(name)
        for t in run.iter(qn("w:t")):
            if t.text and any(0xF000 <= ord(c) <= 0xF0FF for c in t.text):
                t.text = t.text.translate(table) if table else (
                    decode_symbol_font(t.text) if "Symbol" in name else t.text)


def read_docx(path: Path) -> tuple[list[str], list[dict]]:
    import docx
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    d = docx.Document(str(repack_docx(path)))
    decode_glyph_runs(d.element.body, qn)
    lines, tables, anchor = [], [], None
    for el in d.element.body.iterchildren():
        if el.tag == qn("w:p"):
            for line in Paragraph(el, d._body).text.split("\n"):
                line = line.strip()
                if line:
                    lines.append(line)
                    if ANCHOR.match(line):
                        anchor = line[:120]
        elif el.tag == qn("w:tbl"):
            rows = [[c.text.strip() for c in r.cells] for r in Table(el, d._body).rows]
            tables.append({"anchor": anchor, "rows": rows})
    return lines, tables


def read_doc(path: Path) -> tuple[list[str], list[dict]]:
    """Legacy .doc via textutil: prose lines through the project reader, table rows
    rebuilt from the Word cell mark (\\x07), exactly as the tariff loaders do."""
    import subprocess
    raw = subprocess.run(["textutil", "-convert", "txt", "-stdout", str(path)],
                         capture_output=True, text=True).stdout
    tables, current, anchor = [], None, None
    for line in raw.split("\n"):
        line = clean(line)
        if "\x07" in line:
            cells = [c.strip() for c in line.split("\x07")]
            while cells and not cells[-1]:
                cells.pop()
            if current is None:
                current = {"anchor": anchor, "rows": []}
                tables.append(current)
            if cells:
                current["rows"].append(cells)
        else:
            current = None
            if ANCHOR.match(line.strip()):
                anchor = line.strip()[:120]
    return [clean(l) for l in pp.doc_lines(str(path))], tables


def page_title(cid: int) -> str:
    import ingest_document as ig
    page = ig.get(f"https://congbao.chinhphu.vn/van-ban/x-{cid}.htm").decode("utf-8", "ignore")
    m = re.search(r"<title>(.*?)</title>", page, re.S)
    return re.sub(r"\s+", " ", html.unescape(m.group(1))).strip() if m else ""


def doc_row(number: str, cid: int, domain: str) -> dict:
    import ingest_document as ig
    meta = ig.fetch_metadata(cid)
    code, label = next((c, l) for m, c, l in DOC_TYPE if m in number)
    title = page_title(cid)
    title = re.sub(rf"^{label}\s+số\s+{re.escape(number)}\s*", "", title, flags=re.I).strip(" .-–|")
    title = re.split(r"\s+[-|]\s+Công báo", title)[0]
    title = title[:1].upper() + title[1:]   # hand-built rows are capitalised; the summary
    # reads as a sentence ("Nghị định 31/2018/NĐ-CP quy định…") and keeps it lower — as they do
    eff = meta.get("effective_from")
    if not eff:
        raise SystemExit(f"{number}: Công báo không nêu ngày hiệu lực — từ chối, không đoán")
    return {
        "number": number, "doc_type": code, "title": title[:500],
        "issuing_body": meta.get("issuing_body"), "signed_date": meta.get("signed_date"),
        "gazette_date": meta.get("gazette_date"), "effective_from": eff, "effective_to": None,
        # Công báo publishes no machine-readable in-force status (it reports NĐ 134/2016
        # as never amended). The only thing we can state is whether the effective date has
        # arrived; everything else is carried by `auto_unverified` and its warning.
        "effectiveness": "chua_co_hieu_luc" if eff > TODAY else "con_hieu_luc",
        "is_consolidated": False, "consolidates": None, "gazette_issue": None,
        "source_url": f"https://congbao.chinhphu.vn/van-ban/x-{cid}.htm",
        "summary": f"{label} {number} {title[:1].lower() + title[1:]}"[:400], "domain": domain,
        "short": f"{label} {number}", "verification": "auto_unverified", "verified_by": None,
    }


def download(number: str, cid: int, target: Path) -> None:
    """Fetch every part (.doc/.docx/.pdf) of one document from Công báo into `target`.

    curl, not urllib: the download CDN sends only its leaf certificate and omits the
    GlobalSign intermediate. macOS curl verifies through the system trust store; Python's
    OpenSSL does not, and fails with CERTIFICATE_VERIFY_FAILED. (The Docker image solves
    the same thing by pinning the intermediate — apps/ingest/Dockerfile.) The g7 links are
    tokenised and expire fast, so they are read from the page and used at once.
    """
    import subprocess
    import ingest_document as ig
    if target.exists() and any(target.iterdir()):
        return
    target.mkdir(parents=True, exist_ok=True)
    parts = ig.fetch_part_urls(f"https://congbao.chinhphu.vn/van-ban/x-{cid}.htm")
    if not parts:
        raise SystemExit(f"{number}: trang Công báo không có file tải về")
    for i, (name, url) in enumerate(parts, 1):
        out = target / f"{i:02d}{Path(name).suffix.lower() or '.bin'}"
        r = subprocess.run(["curl", "-sS", "-L", "--max-time", "240", "-o", str(out), "-w", "%{http_code}", url],
                           capture_output=True, text=True)
        if r.stdout != "200":
            raise SystemExit(f"{number}: tải phần {i} lỗi HTTP {r.stdout} {r.stderr[:120]}")


def gate(number: str, rows: list[dict]) -> None:
    nums = [int(re.match(r"\d+", str(r["number"])).group()) for r in rows if r["ptype"] == "dieu"]
    if not nums or nums != list(range(1, len(nums) + 1)):
        missing = sorted(set(range(1, max(nums or [0]) + 1)) - set(nums))
        raise SystemExit(f"{number}: CỔNG CẤU TRÚC — Điều không liên tục (thiếu {missing[:10]}). Không ghi.")


def gate_debris(number: str, rows: list[dict]) -> None:
    dirty = [r["key"] for r in rows if DEBRIS.search((r.get("body") or "") + (r.get("heading") or ""))]
    if dirty:
        raise SystemExit(f"{number}: CỔNG RÁC MÃ TRƯỜNG — {len(dirty)} điều khoản còn lệnh trường Word ({dirty[:3]}). Không ghi.")


def load(name: str) -> list[dict]:
    path = LEGAL / name
    return [json.loads(l) for l in path.open(encoding="utf-8")] if path.exists() else []


def save(name: str, rows: list[dict]) -> None:
    with (LEGAL / name).open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--work", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--download", action="store_true", help="tải từ Công báo văn bản nào chưa có trong --work")
    args = ap.parse_args()
    work = Path(args.work)

    new_docs, new_provs, new_tables = {}, [], []
    for number, cid, stem, domain in SOURCES:
        d = work / stem
        if args.download:
            download(number, cid, d)
        src = next((p for p in sorted(d.glob("*.docx")) if ".fixed." not in p.name), None) \
            or next(iter(sorted(d.glob("*.doc"))), None)
        if src is None:
            raise SystemExit(f"{number}: không có file Word trong {d}")
        lines, tables = read_docx(src) if src.suffix == ".docx" else read_doc(src)
        doc = doc_row(number, cid, domain)
        pp.read_doc = lambda _doc, _l=lines: _l  # reuse the project's article logic verbatim
        rows = pp.build(doc)
        gate(number, rows)
        gate_debris(number, rows)
        new_docs[number] = doc
        new_provs += rows
        for i, t in enumerate(tables, 1):
            new_tables.append({"document_number": number, "index": i, "anchor": t["anchor"],
                               "header": t["rows"][0] if t["rows"] else [], "rows": t["rows"][1:]})
        kinds = {k: sum(1 for r in rows if r["ptype"] == k) for k in ("chuong", "dieu", "khoan", "diem")}
        print(f"✅ {number:18} {src.suffix[1:]:4} {kinds} · {len(tables)} bảng/{sum(len(t['rows']) for t in tables)} dòng"
              f" · hiệu lực {doc['effective_from']} ({doc['effectiveness']})")

    chunks = build_chunks(new_docs, new_provs)
    print(f"   {len(chunks)} chunk (một chunk mỗi Điều)")
    if args.dry_run:
        return 0
    keep = lambda rows, key: [r for r in rows if r[key] not in new_docs]
    save("documents.ndjson", keep(load("documents.ndjson"), "number") + list(new_docs.values()))
    save("provisions.ndjson", keep(load("provisions.ndjson"), "document_number") + new_provs)
    save("chunks.ndjson", keep(load("chunks.ndjson"), "document_number") + chunks)
    save("annex-tables.ndjson", keep(load("annex-tables.ndjson"), "document_number") + new_tables)
    print(f"Đã ghi: {len(load('documents.ndjson'))} văn bản · {len(load('provisions.ndjson')):,} điều khoản · "
          f"{len(load('chunks.ndjson')):,} chunk · {len(load('annex-tables.ndjson'))} bảng phụ lục")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
