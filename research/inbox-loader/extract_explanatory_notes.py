#!/usr/bin/env python3
"""Extract the Vietnamese text of the HS Explanatory Notes and the AHTN SEN.

    python3 extract_explanatory_notes.py \
        --en-dir "<…>/CHU GIAI/chu giai HS 2024" \
        --sen    "<…>/CHU GIAI/Chu-giai-SEN (1).pdf" \
        --out    db/seed/data/legal

Sources (read from each PDF's first page, 2026-09-10):
  EN2022  Chú giải chi tiết Danh mục HS 2022 — kèm công văn 1810/TCHQ-TXNK ngày 26/4/2024
  SEN     Chú giải bổ sung AHTN 2022        — kèm công văn 3866/TCHQ-TXNK ngày 24/7/2023

Both are attachments to công văn, not VBQPPL: interpretive guidance, not binding law.
The legally binding Section/Chapter Notes are TT 31/2022/TT-BTC (hs-notes.ndjson).

WHY PYMUPDF. pypdf inserts spaces inside Vietnamese syllables on these files
("truy ền ho ặc băng t ải"): 85 of 100 files sampled were broken, which silently defeats
search for the very words a classifier looks up. pdfplumber does not split syllables but
interleaves the two columns line by line. pymupdf reads by text block: 0.003 broken
syllables per 1000 Vietnamese characters across 3,279 pages.

WHY VIETNAMESE ONLY. The PDFs are two-column, Vietnamese left, English right (98% / 98%
of characters, 95% of pages two-column). The English column is the WCO original, whose
full text ADR 2026-09-09 deferred on copyright. It is also half the volume: dropping it
takes the notebook cost from ~13 sources to ~7 of the free tier's 50.

NOT LOADED: `PHU LUC III_SEN.pdf` is the SEN of TT 156/2011/TT-BTC (AHTN 2012), superseded
by SEN 2022. Two SEN editions side by side in a notebook that cannot filter by validity
is exactly R8.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import pymupdf

from docs_safe import decode_symbol_font

VI = set("ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ")
# A heading: "84.18 - Tủ lạnh…". Requiring the dash AND an upper-case first letter keeps out
# cross-references that also start lines: "84.72 (nhóm 84.73)", "84.01 đến 84.24 hoặc…".
HEADING = re.compile(r"^(\d{2}\.\d{2})\s*[-–—‒]\s*(\S.*)$")
# Upper case in the PDF ("CHƯƠNG 1"); the first version matched "Chương" only and split
# nothing — all 250K characters landed in one record titled "Lời nói đầu".
SEN_CHAPTER = re.compile(r"^CHƯƠNG\s+(\d{1,2})\b", re.I)
PAGE_LABEL = re.compile(r"^(?:[IVXL]+\s*-\s*\d+|\d{1,4})$")
CHAPTER_FILE = re.compile(r"[Cc]huong\s+(\d+)")
LIST_MARK = re.compile(r"^(?:\(\w{1,3}\)|[-–•●]|\d+[.)]|[a-zđ]\))\s")

EN_INSTRUMENT = "Chú giải chi tiết HS 2022 — kèm CV 1810/TCHQ-TXNK ngày 26/4/2024"
SEN_INSTRUMENT = "Chú giải bổ sung AHTN 2022 (SEN) — kèm CV 3866/TCHQ-TXNK ngày 24/7/2023"


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def vi_ratio(text: str) -> float:
    letters = [c for c in text.lower() if c.isalpha()]
    return sum(c in VI for c in letters) / max(len(letters), 1)


def unwrap(block: str) -> str:
    """Join visually wrapped lines inside one block, but keep list items apart."""
    out: list[str] = []
    for line in (l.strip() for l in block.split("\n")):
        if not line:
            continue
        if out and not LIST_MARK.match(line) and not HEADING.match(line):
            out[-1] = f"{out[-1]} {line}"
        else:
            out.append(line)
    return "\n".join(out)


def official_headings(path: Path) -> dict[int, set[str]]:
    """Four-digit headings per chapter, from the tariff nomenclature already in the repo.

    A heading is accepted only if it is a REAL heading of that chapter and strictly after
    the previous one. Format alone is not enough: cross-references start lines too
    ("84.28 hoặc 84.29 …"). Same lesson as the article parser — a number that looks right
    and sits in the right place can still belong to something else.
    """
    out: dict[int, set[str]] = {}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            hs = json.loads(line)["hs"]
            out.setdefault(int(hs[:2]), set()).add(f"{hs[:2]}.{hs[2:4]}")
    return out


def symbol_font_codepoints(page) -> bool:
    """True when this page draws private-use code points ONLY in a Symbol font.

    "blocks" text carries no font, and the same U+F0xx means different glyphs in different
    fonts (U+F02A is `∗` in Symbol, a box in Wingdings 2 — both occur in this corpus). So a
    page is decoded only when every private-use character on it comes from a Symbol span;
    any other font leaves the page untouched, and verify_drive.py flags the survivor."""
    fonts = {sp["font"] for b in page.get_text("dict")["blocks"] for l in b.get("lines", [])
             for sp in l["spans"] if any(0xE000 <= ord(c) <= 0xF8FF for c in sp["text"])}
    return bool(fonts) and all("Symbol" in f for f in fonts)


def vietnamese_paragraphs(page) -> list[str]:
    """Vietnamese paragraphs of one page, top to bottom.

    Two-column page: keep the left column. One-column page (5%): keep every block that
    is not English. Deciding per page rather than globally matters — a one-column page
    has Vietnamese text whose centre sits right of the midline.
    """
    mid = page.rect.width / 2
    symbol = symbol_font_codepoints(page)
    blocks = [(*b[:4], decode_symbol_font(b[4]) if symbol else b[4], *b[5:])
              for b in page.get_text("blocks") if b[6] == 0]
    two_col = any((b[0] + b[2]) / 2 >= mid and vi_ratio(b[4]) <= 0.01 and len(b[4]) > 15 for b in blocks)
    kept = []
    for b in blocks:
        text = nfc(b[4]).strip()
        if not text or PAGE_LABEL.match(text):
            continue
        centre = (b[0] + b[2]) / 2
        # A block that straddles the midline holds BOTH languages line by line — this is
        # where most Vietnamese headings live. Dropping it as "right column" lost 84.18 and
        # ~60% of headings in the first version. Keep its Vietnamese lines only.
        if b[0] < mid - 10 and b[2] > mid + 10:
            lines = [l for l in text.split("\n") if l.strip() and vi_ratio(l) > 0.02]
            if lines:
                kept.append((round(b[1]), round(b[0]), unwrap("\n".join(lines))))
            continue
        if two_col and centre >= mid:
            continue
        if vi_ratio(text) <= 0.01 and len(text) > 15:
            continue
        kept.append((round(b[1]), round(b[0]), unwrap(text)))
    kept.sort()
    return [t for _, _, t in kept]


def new_record(chapter: int, heading: str | None, title: str | None, page: int) -> dict:
    return {"source": "EN2022", "instrument": EN_INSTRUMENT, "chapter": chapter,
            "heading": heading, "title": title, "page_from": page, "page_to": page, "paras": []}


def extract_en(en_dir: Path, official: dict[int, set[str]]) -> list[dict]:
    files = []
    for path in en_dir.glob("*.pdf"):
        m = CHAPTER_FILE.search(path.name)
        if m:
            files.append((int(m.group(1)), path))
    files.sort()
    records: list[dict] = []
    for chapter, path in files:
        valid = official.get(chapter, set())
        current = new_record(chapter, None, None, 1)
        last = ""
        for pno, page in enumerate(pymupdf.open(path), 1):
            for block in vietnamese_paragraphs(page):
                # Test EVERY line, not just the block's first: a heading often sits
                # mid-block, after "* * *" separators or the tail of the previous note.
                # Testing line one only caught 94.4% of headings; this catches ~99%.
                part: list[str] = []
                for line in block.split("\n"):
                    h = HEADING.match(line.strip())
                    if h and h.group(1) in valid and h.group(1) > last:
                        if part:
                            current["paras"].append("\n".join(part))
                            part = []
                        if current["paras"]:
                            records.append(current)
                        last = h.group(1)
                        current = new_record(chapter, h.group(1), h.group(2).strip(), pno)
                    part.append(line)
                    current["page_to"] = pno
                if part:
                    current["paras"].append("\n".join(part))
        if current["paras"]:
            records.append(current)
    return [finish(r) for r in label_gaps(records, official)]


def label_gaps(records: list[dict], official: dict[int, set[str]]) -> list[dict]:
    """Never claim a precise heading the parser could not see.

    When heading X is followed by heading Z and the nomenclature has Y in between, Y's
    text is inside X's record. Labelling it plainly "X" would cite the wrong heading — a
    real, well-formed heading number pointing at the wrong goods, which is R3 exactly.
    So the record says which headings it may also contain.
    """
    by_ch: dict[int, list[dict]] = {}
    for r in records:
        by_ch.setdefault(r["chapter"], []).append(r)
    for ch, rows in by_ch.items():
        codes = sorted(official.get(ch, set()))
        found = [r["heading"] for r in rows if r["heading"]]
        for i, r in enumerate(rows):
            lo = r["heading"] or ""
            nxt = next((x["heading"] for x in rows[i + 1:] if x["heading"]), None)
            missing = [c for c in codes if c > lo and (nxt is None or c < nxt) and c not in found
                       and (r["heading"] or not found or c < found[0])]
            r["also_contains"] = missing
    return records


def extract_sen(sen_pdf: Path) -> list[dict]:
    records: list[dict] = []
    current = {"source": "SEN2022", "instrument": SEN_INSTRUMENT, "chapter": None,
               "heading": None, "title": "Lời nói đầu", "page_from": 1, "page_to": 1, "paras": []}
    for pno, page in enumerate(pymupdf.open(sen_pdf), 1):
        for para in vietnamese_paragraphs(page):
            m = SEN_CHAPTER.match(para)
            if m:
                if current["paras"]:
                    records.append(current)
                current = {"source": "SEN2022", "instrument": SEN_INSTRUMENT, "chapter": int(m.group(1)),
                           "heading": None, "title": para.split("\n", 1)[0][:160],
                           "page_from": pno, "page_to": pno, "paras": []}
            current["paras"].append(para)
            current["page_to"] = pno
    if current["paras"]:
        records.append(current)
    return [finish(r) for r in records]


def finish(record: dict) -> dict:
    text = "\n\n".join(record.pop("paras"))
    return {**record, "text_vi": text, "chars": len(text)}


def write(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--en-dir", required=True)
    ap.add_argument("--sen", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    out = Path(args.out)
    root = Path(__file__).resolve().parents[2]
    official = official_headings(root / "db/seed/data/hs-descriptions.ndjson")
    en = extract_en(Path(args.en_dir), official)
    sen = extract_sen(Path(args.sen))
    write(out / "hs-explanatory-notes.ndjson", en)
    write(out / "hs-sen.ndjson", sen)
    for name, rows in (("EN2022", en), ("SEN2022", sen)):
        chapters = sorted({r["chapter"] for r in rows if r["chapter"]})
        total = sum(r["chars"] for r in rows)
        print(f"{name}: {len(rows):,} bản ghi · {len(chapters)} chương · {total:,} ký tự")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
