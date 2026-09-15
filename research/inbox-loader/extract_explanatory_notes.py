#!/usr/bin/env python3
"""Extract the Vietnamese text of the HS Explanatory Notes, one row per heading.

    python3 extract_explanatory_notes.py \
        --en-dir "<…>/CHU GIAI/chu giai HS 2024" \
        --out    db/seed/data/legal
    python3 -m doctest extract_explanatory_notes.py

The AHTN SEN is extract_sen.py, which reuses the page helpers below.

Source (read from each PDF's first page, 2026-09-10):
  EN2022  Chú giải chi tiết Danh mục HS 2022 — kèm công văn 1810/TCHQ-TXNK ngày 26/4/2024

An attachment to a công văn, not a VBQPPL: interpretive guidance, not binding law.
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
# A heading: "84.18 - Tủ lạnh…". The Vietnamese column also prints "32.08.- Sơn…", "84.81. Vòi…",
# "84. 82 - Ổ bi…" and, with no dash, "52.05  Sợi bông…" (52.05, 52.06, 67.02, 84.85, 86.07).
# See heading_of() for how a dashless line is told apart from a cross-reference.
HEADING = re.compile(r"^(\d{2})\.\s?(\d{2})\.?\s*([-–—‒])?\s*(\S.*)$")
# Heading numbers misprinted in the source, fixed by hand: ch 68 p17 prints "868.08 – Panen…".
# Only the record's `heading` is corrected; text_vi keeps the line as printed.
HEADING_TYPOS = {"868.08": "68.08"}
# Below this share of Vietnamese letters a page's left column holds no Vietnamese notes, only a
# Latin-script annex (ch 29 drug/precursor lists and formulas, ch 33 essential oils, ch 44 wood
# names, ch 71 gem names): those pages measure ≤ 0.018, every page of notes ≥ 0.027 (3,279 pages,
# 2026-09-14). Such pages keep the language filter. The annexes stay out pending the owner's decision
# under the copyright ADR: that filter alone let short Latin blocks through, so an ANNEX marker also
# ends its chapter file and a page with no Vietnamese letter gives nothing (vietnamese_paragraphs).
# ponytail: one page-level threshold; list the annex pages explicitly if a new PDF lands near it.
VI_COLUMN_MIN = 0.02
# First line of the block that opens an annex. All three close their chapter file: ch 33 p16
# "ANNEX / List of the principal essential oils", ch 44 p46 "ANNEX / APPELLATION OF CERTAIN TROPICAL
# WOODS" (to p83), ch 71 p43 "PHỤ LỤC / Danh mục các loại đá quý…". Upper case only: ch 1 p1 is the
# công văn's cover, "Phụ lục / CHÚ GIẢI CHI TIẾT…".
ANNEX = re.compile(r"^(?:ANNEX|PHỤ LỤC)$")
# "VII-1", "41-1", "12": the EN page labels. "41-1" used to be dropped only as an off-column block;
# since columns are decided by position, a label printed just left of the midline must match here.
PAGE_LABEL = re.compile(r"^(?:(?:[IVXL]+|\d{1,2})\s*-\s*\d+|\d{1,4})$")
CHAPTER_FILE = re.compile(r"[Cc]huong\s+(\d+)")
# A list item: "(a)", "(A)", "(ij)" (the Notes letter after "(h)"), "(iii)", "(12)", "- ", "1.", "a)". Not any
# short word in brackets: "(lều) (kể cả mái che…)" is the rest of the 63.06 title, "(INN) và…" the line above.
# ponytail: roman numerals stop at 3 letters as before; "(viii)", "(xiii)"… still join the line above (8 rows).
LIST_MARK = re.compile(r"^(?:\((?i:[a-zđ]|[iị]j|[ivxl]{1,3}|\d{1,3})\)|[-–•●]|\d+[.)]|[a-zđ]\))\s")
# "0809.10 - Quả mơ", "8481.10     - Van giảm áp", a bare "0809.21": a subheading line is a list item.
SUBHEADING_LINE = re.compile(r"^\d{4}\.\d{2}(?:\s*[-–]|$)")

EN_INSTRUMENT = "Chú giải chi tiết HS 2022 — kèm CV 1810/TCHQ-TXNK ngày 26/4/2024"


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def vi_ratio(text: str) -> float:
    letters = [c for c in text.lower() if c.isalpha()]
    return sum(c in VI for c in letters) / max(len(letters), 1)


def heading_of(line: str, prev: str = "") -> tuple[str, str] | None:
    """(heading, title) when `line` opens a heading note; `prev` is the line read before it.

    A dashless "NN.NN Title" is also how a wrapped cross-reference starts a line ("…vào nhóm" /
    "29.02. Những điều khoản…": 9 such lines in the corpus). So without a dash the title must start
    upper case and `prev` must not run on into it (end in a letter, digit or comma). Callers still
    require a real heading of the chapter, strictly after the previous one.

    >>> heading_of("84.18 - Tủ lạnh, tủ kết đông")
    ('84.18', 'Tủ lạnh, tủ kết đông')
    >>> heading_of("84. 82 - Ổ bi hoặc ổ đũa."), heading_of("32.08.- Sơn và vecni")
    (('84.82', 'Ổ bi hoặc ổ đũa.'), ('32.08', 'Sơn và vecni'))
    >>> heading_of("84.85 Máy móc sử dụng công nghệ sản xuất bồi đắp.", "Các vòng bịt dầu của nhóm 84.87.")
    ('84.85', 'Máy móc sử dụng công nghệ sản xuất bồi đắp.')
    >>> heading_of("868.08 – Panen, tấm, tấm lát")
    ('68.08', 'Panen, tấm, tấm lát')
    >>> [heading_of(l, p) for l, p in [("29.02. Những điều khoản", "được phân loại vào nhóm"),
    ...     ("84.72 (nhóm 84.73)", ""), ("84.01 đến 84.24 hoặc", ""), ("27.07.10 - Benzen", "")]]
    [None, None, None, None]
    """
    line = line.strip()
    for typo, fixed in HEADING_TYPOS.items():
        if line.startswith(typo):
            line = fixed + line[len(typo):]
    m = HEADING.match(line)
    if not m:
        return None
    title = m.group(4).strip()
    if not m.group(3) and (not title[0].isupper() or re.search(r"[\w,]$", prev.strip())):
        return None
    return f"{m.group(1)}.{m.group(2)}", title


def unwrap(block: str) -> str:
    """Join visually wrapped lines inside one block, but keep list items apart."""
    out: list[str] = []
    for line in (l.strip() for l in block.split("\n")):
        if not line:
            continue
        if out and not LIST_MARK.match(line) and not SUBHEADING_LINE.match(line) and not heading_of(line, out[-1]):
            out[-1] = f"{out[-1]} {line}"
        else:
            out.append(line)
    return "\n".join(out)


def continues_title(line: str) -> bool:
    """True when `line`, read right after a heading title with no final period, is the rest of that title.

    The title's second line is often a block of its own: at the top of the next page (08.14 "…bảo quản
    tạm thời trong" / "nước muối, …"), or not bold (32.15). Read as the next paragraph, it cut 85 titles
    mid-phrase. What follows a finished title starts upper case ("Nhóm này…") or is a list item or code line.

    >>> [continues_title(l) for l in ("bán lẻ.", "(China clay) hoặc bằng", "85.17.", "(lều) (kể cả mái che",
    ...                                "Nhóm này bao gồm:", "- Sợi đơn", "5509.11 - - Sợi đơn", "(A) Mực in", "(ij) Hoa")]
    [True, True, True, True, False, False, False, False, False]
    """
    c = line[:1]
    return (c.islower() or c.isdigit() or c == "(") and not LIST_MARK.match(line) and not SUBHEADING_LINE.match(line)


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


def left_words(chars: list[dict], mid: float) -> list[dict]:
    """The characters of one line that belong to the left column, decided WORD by word.

    A span is not a column: 20 heading lines are ONE span holding both titles ("55.09 - Sợi …  55.09
    - Yarn …", x 58→787), and "… tổng hợp  The" / "hoặc| dùng trong việc  84.77 - Machinery" cross
    the midline mid-span. A word right of it is dropped, unless Vietnamese carries on across it:
    the ch 1 cover title is centred on the page ("CHÚ GIẢI CHI TIẾT DANH MỤC HS2022", x 254→583).

    >>> line = lambda s, x: [{"c": c, "bbox": (x + 6 * i, 0, x + 6 * i + 6, 10)} for i, c in enumerate(s)]
    >>> ["".join(c["c"] for c in left_words(line(s, x), 421)) for s, x in [("tổng hợp  The", 360), ("DANH MỤC", 400), ("Yarn", 450)]]
    ['tổng hợp  ', 'DANH MỤC', '']
    """
    words: list[list[dict]] = [[]]
    for c in chars:
        if c["c"].strip():
            words[-1].append(c)
        elif words[-1]:
            words.append([])
    words = [w for w in words if w]
    right = [w for w in words if w[0]["bbox"][0] + w[-1]["bbox"][2] >= 2 * mid]
    if len(right) == len(words):
        return []
    if any(c["c"].lower() in VI for w in right for c in w):
        return chars
    drop = {id(c) for w in right for c in w}
    return [c for c in chars if id(c) not in drop]


def vietnamese_paragraphs(page) -> list[str]:
    """Vietnamese paragraphs of one page, top to bottom.

    Two-column page: the left column, decided by POSITION — every word whose centre is left of
    the midline, whatever its letters (left_words). The first version decided by Vietnamese letters and lost
    title lines without diacritics ("28.10 – Oxit bo; axit boric." — 8 ch 28 headings), bare
    subheading codes and ore/species names. It also sorted a block straddling the midline by the
    block's own top edge, so "12.04 - Hạt lanh…" printed at its bottom came before the 12.03 body
    beside it, and ~30 notes were filed under the next heading. Here each side of such a block
    is placed by its own spans.

    One-column page (5%), or a left column that is a Latin-script annex (VI_COLUMN_MIN): keep
    every block that is not English. Deciding per page rather than globally matters — a
    one-column page has Vietnamese text whose centre sits right of the midline.
    """
    mid = page.rect.width / 2
    fix = decode_symbol_font if symbol_font_codepoints(page) else str
    raw_blocks = [b for b in page.get_text("rawdict")["blocks"] if b["type"] == 0]

    def joined(lines: list[list[dict]]) -> str:  # lines of chars; same text as get_text("blocks")
        return fix("".join("".join(c["c"] for c in chars) + "\n" for chars in lines))

    def chars_of(line: dict) -> list[dict]:
        return [c for s in line["spans"] for c in s["chars"]]

    blocks = [(*b["bbox"], joined([chars_of(l) for l in b["lines"]])) for b in raw_blocks]
    # Not one Vietnamese letter: a Latin-only annex page (ch 29 pp264-331 precursor list and chemical
    # structures, pp212-235 narcotics list). The language filter below kept its short blocks —
    # "PRECURSOR (P)", "29.04", "(1) Aniline" — 1,085 of the 1,557 chars filed under 29.42.
    if not any(c in VI for b in blocks for c in b[4].lower()):
        return []
    two_col = any((b[0] + b[2]) / 2 >= mid and vi_ratio(b[4]) <= 0.01 and len(b[4]) > 15 for b in blocks)
    if two_col:
        left = []
        for b, (*_, full) in zip(raw_blocks, blocks):
            if PAGE_LABEL.match(nfc(full).strip()):  # "29-134" at x 404→441 would leave "29-" behind
                continue
            rows: list[list] = []  # one per printed line: [top, x0, x1, bold, text]
            for line in b["lines"]:
                chars = left_words(chars_of(line), mid)
                ink = [c for c in chars if c["c"].strip()]
                if not ink:
                    continue
                if not rows:
                    # Placed by its FIRST line: formula fragments share one row ("nhóm (- CH2SH), (" at
                    # x 78 / "CSH) tương ứng." at x 259), and a block's later lines start further left.
                    key = (round(min(c["bbox"][1] for c in chars)), round(min(c["bbox"][0] for c in chars)))
                ids = {id(c) for c in ink}
                bold = all(s["flags"] & 16 or "Bold" in s["font"] for s in line["spans"]
                           if any(id(c) in ids for c in s["chars"]))
                top, x0, x1 = min(c["bbox"][1] for c in ink), ink[0]["bbox"][0], ink[-1]["bbox"][2]
                text = nfc(fix("".join(c["c"] for c in chars))).strip()
                if rows and abs(top - rows[-1][0]) < 2 and x0 > rows[-1][2] - 1:
                    # One printed line that pymupdf split at a wide gap: "0809.10" | "- Quả mơ" (ch 8 p11,
                    # y 204). Read apart, the code was glued to the label above it: "tươi. 0809.10".
                    rows[-1][2:] = [x1, rows[-1][3] and bold, f"{rows[-1][4]} {text}"]
                else:
                    rows.append([top, x0, x1, bold, text])
            if rows:
                # Rows are unwrapped in groups, and a group never spans
                # - a change of weight: a bold heading line and the regular lines under it are never one
                #   sentence (joined, the title "Dây thép hợp kim khác." took "7229.20 - Bằng thép…" and the body);
                # - the end of a subheading line: the row after it starts the body when it starts 10 pt or more
                #   left of the code, or a paragraph gap below (step ≥ 20 pt; a wrapped label steps 13.8-17).
                #   Joined, ch 39 p38 read "3907.99 - - Loại khác Nhóm này bao gồm:" (516 such lines).
                groups: list[list] = []
                code = None  # the subheading row whose line the next row would continue
                for r in rows:
                    if groups and r[3] == groups[-1][-1][3] and not (
                            code and (r[1] < code[1] - 10 or r[0] - groups[-1][-1][0] >= 20)):
                        groups[-1].append(r)
                    else:
                        groups.append([r])
                        code = None
                    if SUBHEADING_LINE.match(r[4]):
                        code = r
                    elif LIST_MARK.match(r[4]):
                        code = None
                left.append((*key, "\n".join(unwrap("\n".join(r[4] for r in g)) for g in groups)))
        if vi_ratio("".join(t for _, _, t in left)) > VI_COLUMN_MIN:
            return [t for _, _, t in sorted(k for k in left if k[2] and not PAGE_LABEL.match(k[2]))]
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
        last = prev = ""  # prev: the line before, across paragraphs and pages ("…nhóm 84.59 hoặc" / "84.60. BỘ…")
        title_open = False  # the line before ends a heading title that has no final period
        for pno, page in enumerate(pymupdf.open(path), 1):
            if any(ANNEX.match(nfc(b[4]).strip().split("\n")[0].strip()) for b in page.get_text("blocks") if b[6] == 0):
                break
            for block in vietnamese_paragraphs(page):
                # Test EVERY line, not just the block's first: a heading often sits
                # mid-block, after "* * *" separators or the tail of the previous note.
                # Testing line one only caught 94.4% of headings; this catches ~99%.
                part: list[str] = []
                for line in block.split("\n"):
                    h = heading_of(line, prev)
                    is_heading = bool(h) and h[0] in valid and h[0] > last
                    if is_heading:
                        if part:
                            current["paras"].append("\n".join(part))
                            part = []
                        if current["paras"]:
                            records.append(current)
                        last = h[0]
                        current = new_record(chapter, h[0], h[1], pno)
                    merge = not is_heading and title_open and continues_title(line)
                    if merge:  # one line with the heading, as when the title is printed in one block
                        part = part or [current["paras"].pop()]
                        part[-1] = f"{part[-1]} {line}"
                        current["title"] = f"{current['title']} {line}"
                    else:
                        part.append(line)
                    title_open = (is_heading or merge) and not current["title"].endswith(".")
                    current["page_to"] = pno
                    prev = line
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
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    root = Path(__file__).resolve().parents[2]
    en = extract_en(Path(args.en_dir), official_headings(root / "db/seed/data/hs-descriptions.ndjson"))
    write(Path(args.out) / "hs-explanatory-notes.ndjson", en)
    chapters = {r["chapter"] for r in en if r["chapter"]}
    print(f"EN2022: {len(en):,} bản ghi · {len(chapters)} chương · {sum(r['chars'] for r in en):,} ký tự")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
