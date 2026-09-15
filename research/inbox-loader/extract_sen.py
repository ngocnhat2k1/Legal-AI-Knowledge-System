#!/usr/bin/env python3
"""Extract the AHTN SEN 2022, one row per note, each row carrying the codes it explains.

    python3 extract_sen.py --sen "<…>/CHU GIAI/Chu-giai-SEN (1).pdf" --out db/seed/data/legal
    python3 -m doctest extract_sen.py        # label parser check

Source: Chú giải bổ sung AHTN 2022 — kèm công văn 3866/TCHQ-TXNK ngày 24/7/2023.
Interpretive guidance for the ASEAN 8-digit subheadings, not binding law.

WHY A SEPARATE SCRIPT. extract_explanatory_notes.py wrote one SEN row per chapter and kept
only lines with Vietnamese letters, so the code label that opens each note ("0210.99.10",
"87.02  87.03") was dropped: 646 of the PDF's 667 codes were lost and no note said which
subheading it explains. A SEN note is laid out as

    8702.10.71  8702.10.72 …        code label (VI and EN copies, often one straddling block)
    ĐƯỢC THIẾT KẾ ĐẶC BIỆT …        title (VI line + EN line)
    body …                          two columns
    (Nguồn: Việt Nam)

so a label starts a new row. Text between a CHƯƠNG marker and the chapter's first label is
the chapter-level row (heading null), as before; a PHẦN marker (Section XI, XV notes) starts
a row with chapter null. The PDF has no chapter 86 (p356 goes from CHƯƠNG 85 straight to
CHƯƠNG 87); that is a gap in the source.

NOT LOADED: `PHU LUC III_SEN.pdf` is the SEN of TT 156/2011/TT-BTC (AHTN 2012), superseded
by SEN 2022. Two SEN editions side by side in a notebook that cannot filter by validity
is exactly R8.

The page reader below is vietnamese_paragraphs() from extract_explanatory_notes.py plus two
changes: code labels are recognised before the Vietnamese-letter filter, and a two-line
straddling block with no Vietnamese letters to test (TEMPEH / TEMPEH, SAM-SU / SAMSU) keeps
its first (VI) line instead of dropping both.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

import pymupdf

from docs_safe import decode_symbol_font
# Page-reading helpers shared with the EN extractor.
from extract_explanatory_notes import (PAGE_LABEL, nfc, official_headings, symbol_font_codepoints, unwrap,
                                       vi_ratio, write)

# Upper case in the PDF ("CHƯƠNG 1"); the first version matched "Chương" only and split
# nothing — all 250K characters landed in one record titled "Lời nói đầu".
SEN_CHAPTER = re.compile(r"^CHƯƠNG\s+(\d{1,2})\b", re.I)
SEN_INSTRUMENT = "Chú giải bổ sung AHTN 2022 (SEN) — kèm CV 3866/TCHQ-TXNK ngày 24/7/2023"

# One token of a label: 8-digit code (also the source typo "271012.39"), 6-digit subheading
# or 4-digit heading.
TOKEN = re.compile(r"(\d{4})\.?(\d{2})\.(\d{2})|(\d{4})\.(\d{2})|(\d{2})\.(\d{2})")
_T = r"(?:\d{4}\.?\d{2}\.\d{2}|\d{4}\.\d{2}|\d{2}\.\d{2})"
# "0301.93.21  0301.93.31", "87.02  87.03", "39.01 - 39.12": tokens and separators only. A code
# inside prose ("0301.99.42 là cá chép…") or a title ("… 8418.21.90 HOẶC") is not a label.
LABEL_LINE = re.compile(rf"^{_T}(?:\s*(?:[,;/&]|\s-\s|\s)\s*{_T})*[\s,;/]*$")
# Labels sit at the left margin (x0 = 72). A title wrapped onto a bare code line is centred
# ("8418.29.00" at x0 = 204 on p329), and table cells sit further right.
LABEL_MAX_X0 = 90
SECTION = re.compile(r"^PHẦN\s+[IVXL]+\s*(?:\n|$)")


def is_label(lines: list[str]) -> bool:
    """
    >>> is_label(["0301.93.21  0301.93.31", "0301.93.21  0301.93.31"]), is_label(["39.01 - 39.12"])
    (True, True)
    >>> is_label(["0301.99.42 là cá chép không được chi tiết tại phân nhóm"]), is_label([])
    (False, False)
    """
    return bool(lines) and all(LABEL_LINE.match(l) for l in lines)


def is_caps(para: str) -> bool:
    letters = [c for c in para if c.isalpha()]
    return len(letters) >= 3 and para == para.upper()


def page_items(page) -> list[tuple[str, object]]:
    """("label", lines) and ("text", paragraph) items of one page, top to bottom."""
    mid = page.rect.width / 2
    symbol = symbol_font_codepoints(page)
    blocks = [(*b[:4], decode_symbol_font(b[4]) if symbol else b[4], *b[5:])
              for b in page.get_text("blocks") if b[6] == 0]
    two_col = any((b[0] + b[2]) / 2 >= mid and vi_ratio(b[4]) <= 0.01 and len(b[4]) > 15 for b in blocks)
    english = lambda t: vi_ratio(t) <= 0.01 and sum(c.isalpha() for c in t) > 15  # noqa: E731
    vi_right = max((b[2] for b in blocks if vi_ratio(nfc(b[4])) > 0.01), default=page.rect.width)
    kept = []
    for b in blocks:
        text = nfc(b[4]).strip()
        if not text or PAGE_LABEL.match(text):
            continue
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if is_label(lines):
            if b[0] < LABEL_MAX_X0:
                kept.append((round(b[1]), round(b[0]), ("label", lines)))
            if b[0] < LABEL_MAX_X0 or b[0] >= mid - 10:  # right-column copy is the EN label
                continue
        centre = (b[0] + b[2]) / 2
        if b[0] < mid - 10 and b[2] > mid + 10:
            # Tested per gap-separated chunk: p385 prints the VI title's last word in the EN cell
            # ("MÁT  MATTRESSES, …"). And é is not evidence of Vietnamese here: it spells the EN
            # titles MANGO PURÉE (p86) and SAKÉ (p98).
            vi = [" ".join(c for c in re.split(r"\s{2,}", l) if vi_ratio(c.replace("é", "e").replace("É", "E")) > 0.02)
                  for l in lines]
            vi = [l for l in vi if l]
            # A two-line straddling block is the VI line then its EN copy. Identical lines
            # ("Sulphonamide: 5%") or an all-caps pair (SAM-SU / SAMSU, REFORMATE / REFORMATES)
            # carry no Vietnamese letters to test, so keep the first line once.
            if len(lines) == 2 and (" ".join(lines[0].split()).casefold() == " ".join(lines[1].split()).casefold()
                                    or (not vi and is_caps(lines[0]) and is_caps(lines[1]))):
                vi = lines[:1]
            if vi:
                kept.append((round(b[1]), round(b[0]), ("text", unwrap("\n".join(vi)))))
            continue
        if two_col and centre >= mid:
            continue
        # English is told by its LETTERS: "1401.20.21 - 1401.20.29." (p73) or "- Protein: ±39.04%"
        # (p80) is too few letters to call English, and dropping it cut a note mid-sentence. Such a block
        # is English by position: it starts right of every Vietnamese block (p124: the English table starts
        # at x 340, left of the midline, and the Vietnamese column ends at x 332, so the cell "100/130
        # (Avgas 100) High lead" is centred left of the midline), or it is the last line of an English block
        # printed as a block of its own, touching it from below (p87 "water-14690219173.html" under
        # "Source: https://…coconut-", p204 "and scattered.", p205 "mould").
        if vi_ratio(text) <= 0.01 and (sum(c.isalpha() for c in text) > 15 or b[0] > vi_right or any(
                0 <= b[1] - a[3] < 3 and a[0] < b[2] and b[0] < a[2] and english(nfc(a[4])) for a in blocks)):
            continue
        kept.append((round(b[1]), round(b[0]), ("text", unwrap(text))))
    kept.sort()
    return [item for _, _, item in kept]


def parse_label(lines: list[str], official: dict[int, set[str]]) -> tuple[list[str], list[str], list[str]]:
    """Ordered, de-duplicated codes, subheadings and headings named by label lines.

    >>> parse_label(["2710.12.31  271012.39", "2710.12.31  271012.39"], {})
    (['2710.12.31', '2710.12.39'], [], [])
    >>> parse_label(["39.01 - 39.03  4001.21"], {39: {"39.01", "39.02", "39.03", "39.04"}})
    ([], ['4001.21'], ['39.01', '39.02', '39.03'])
    """
    codes: list[str] = []
    subs: list[str] = []
    heads: list[str] = []
    for line in lines:
        prev_end, prev_head = 0, None
        for m in TOKEN.finditer(line):
            if m.group(1):
                codes.append(f"{m.group(1)}.{m.group(2)}.{m.group(3)}")
            elif m.group(4):
                subs.append(f"{m.group(4)}.{m.group(5)}")
            else:
                h = f"{m.group(6)}.{m.group(7)}"
                if prev_head and line[prev_end:m.start()].strip() == "-":  # a range names all between
                    heads += sorted(x for x in official.get(int(h[:2]), ()) if prev_head < x < h)
                heads.append(h)
                prev_head = h
            prev_end = m.end()
    dedup = lambda xs: list(dict.fromkeys(xs))  # noqa: E731
    return dedup(codes), dedup(subs), dedup(heads)


def new_row(chapter: int | None, page: int, title: str | None = None) -> dict:
    return {"source": "SEN2022", "instrument": SEN_INSTRUMENT, "chapter": chapter, "heading": None,
            "headings": [], "subheadings": [], "codes": [], "title": title,
            "page_from": page, "page_to": page, "label": [], "paras": []}


def finish(row: dict) -> dict:
    if row["title"] is None:
        # Note and section titles: the leading upper-case paragraphs (a long title wraps over
        # several blocks, sometimes onto a bare code line: "… HOẶC" / "8418.29.00").
        caps: list[str] = []
        for p in row["paras"]:
            if p != p.upper() or not (caps or is_caps(p)):
                break
            caps.append(" ".join(p.split()))
        row["title"] = " ".join(caps) or None
    if row["label"]:
        first = (row["codes"] or row["subheadings"] or row["headings"])[0]
        row["heading"] = f"{first[:2]}.{first[2:4]}" if len(first) > 5 else first
    # The VI copy of each label line once, so text_vi still shows the codes (and the dotted
    # 8-digit ones feed extractHsCodes in evidence-build).
    label = "\n".join(dict.fromkeys(" ".join(l.split()) for l in row.pop("label")))
    text = "\n\n".join(([label] if label else []) + row.pop("paras"))
    return {**row, "text_vi": text, "chars": len(text)}


def extract_sen(sen_pdf: Path, official: dict[int, set[str]]) -> list[dict]:
    rows: list[dict] = []
    current = new_row(None, 1, "Lời nói đầu")

    def start(chapter: int | None, page: int, title: str | None = None) -> dict:
        if current["label"] or current["paras"]:
            rows.append(current)
        return new_row(chapter, page, title)

    for pno, page in enumerate(pymupdf.open(sen_pdf), 1):
        for kind, value in page_items(page):
            if kind == "label":
                # Consecutive label blocks (a long list wrapping onto the next page) are one label.
                if not (current["label"] and not current["paras"]):
                    current = start(current["chapter"], pno)
                codes, subs, heads = parse_label(value, official)
                for key, vals in (("codes", codes), ("subheadings", subs), ("headings", heads)):
                    current[key] = list(dict.fromkeys(current[key] + vals))
                current["label"] += value
            else:
                if m := SEN_CHAPTER.match(value):
                    current = start(int(m.group(1)), pno, value.split("\n", 1)[0][:160])
                elif SECTION.match(value):
                    current = start(None, pno)
                current["paras"].append(value)
            current["page_to"] = pno
    rows.append(current)
    # A chapter row holding only its "CHƯƠNG N" line says nothing: its notes are the rows after it.
    return [finish(r) for r in rows
            if r["label"] or r["chapter"] is None or len(r["paras"]) > 1 or "\n" in r["paras"][0]]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sen", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[2]
    rows = extract_sen(Path(args.sen), official_headings(root / "db/seed/data/hs-descriptions.ndjson"))
    write(Path(args.out) / "hs-sen.ndjson", rows)
    codes = {c for r in rows for c in r["codes"]}
    print(f"SEN2022: {len(rows):,} bản ghi · {len({r['chapter'] for r in rows if r['chapter']})} chương · "
          f"{len(codes)} mã 8 số · {sum(r['chars'] for r in rows):,} ký tự")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
