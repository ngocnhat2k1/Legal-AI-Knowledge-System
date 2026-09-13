"""Rewrite markdown into the subset that survives conversion to a Google Doc.

WHY THIS EXISTS. Notebook sources live on Drive as Google Docs, because only Drive
sources auto-sync (see ADR 2026-09-10-notebook-sources-as-google-docs). Conversion is
lossy, and it is lossy SILENTLY — nothing errors, the text simply comes back different.
Measured on 2026-09-10 by uploading a probe file and reading it back:

    <details><summary>          tag DELETED, inner text MERGED into the paragraph above
    > blockquote                '>' dropped, becomes ordinary body text
    ``` fenced code ```         fence lost, lines broken
    | **bold** in a cell |      bold lost, literal \\*\\* left behind
    - list                      kept, but '<!-- end list -->' injected
    tables, # headings          kept
    **bold** in a paragraph     kept

A second measurement (2026-09-10, after a notebook test question came back wrong) found
the three that do the real damage, because they change NUMBERS rather than markup —
compared on the Doc's plain-text export, which is what the notebook ingests:

    line\nline                  the two lines MERGED into one paragraph
    1. … (para) … 3. …          a LIST, renumbered by Docs: the '3.' came back as '2.'
    1) … 3) …                   same, AND the ')' became '.'
    text\n===  /  text\n---     setext heading: the '===' / '---' line vanishes
    _______________             thematic break: the signature line vanishes
    \xa0 (a line of NBSPs)       not blank to markdown: glues the lines around it together

Together they renumbered live khoản: in the Customs Law source, a merged `Điều 47a`
heading made its `1.` continue the previous article's list and come back as `4.`.
_protect_line_structure() below neutralises all three. verify_drive.py is the check.

The first one is the reason this module is not optional. The export carries 152
<details> blocks, every one of them wrapping the verbatim WCO English of an HS Section
or Chapter Note. Converted without this transform, the English flows into the tail of
the Vietnamese paragraph with NO boundary — and a reader arguing a classification
cannot tell where the translation ends and the original begins.

KNOWN LIMIT — idempotence. Running the transform twice is a no-op for ordinary prose,
but NOT for markup-like text that was inside a code fence: pass one removes the fence,
so pass two sees `> foo` as a blockquote rather than as data. Generated content is
transformed exactly once, so this does not arise in the pipeline; it is written down so
nobody discovers it the hard way.
"""
from __future__ import annotations

import re

__all__ = ["to_docs_safe", "char_count", "strip_word_field_codes", "decode_symbol_font", "literal_text",
           "table_line_indexes",
           "DETAILS_HEADING_LEVEL"]

#: Heading level a <details> summary is demoted to. Deep enough not to compete with the
#: document structure (# / ## / ###), shallow enough to be visible in a Docs outline.
DETAILS_HEADING_LEVEL = "####"

_FENCE = re.compile(r"^\s*(```|~~~)")
_DETAILS_OPEN = re.compile(r"<details[^>]*>\s*(?:<summary>(?P<label>.*?)</summary>)?\s*", re.I)
_DETAILS_CLOSE = re.compile(r"</details>", re.I)
_SUMMARY_ONLY = re.compile(r"^\s*<summary>(?P<label>.*?)</summary>\s*$", re.I)
_BLOCKQUOTE = re.compile(r"^(\s*)>+\s?")
_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
_BOLD = re.compile(r"\*\*(.+?)\*\*", re.S)


def _strip_bold_in_tables(line: str) -> str:
    """Bold inside a cell comes back as literal escaped asterisks — drop the markers.

    Only inside table rows: bold in ordinary prose converts correctly and carries
    meaning we want to keep.
    """
    if not _TABLE_ROW.match(line):
        return line
    return _BOLD.sub(r"\1", line)


def to_docs_safe(text: str) -> str:
    """Return `text` rewritten so a Google Docs conversion preserves its meaning."""
    out: list[str] = []
    in_fence = False

    for raw in text.split("\n"):
        # --- fenced code: drop the delimiters, pass the content through untouched ---
        if _FENCE.match(raw):
            in_fence = not in_fence
            continue
        if in_fence:
            out.append(raw)
            continue

        line = raw

        # --- <details> / <summary> / </details> ---
        if _DETAILS_CLOSE.search(line):
            line = _DETAILS_CLOSE.sub("", line)
            if not line.strip():
                out.append("")
                continue

        m = _DETAILS_OPEN.search(line)
        if m:
            label = (m.group("label") or "").strip()
            rest = _DETAILS_OPEN.sub("", line, count=1).strip()
            if label:
                out.extend(["", f"{DETAILS_HEADING_LEVEL} {label}", ""])
            if rest:
                out.append(_strip_bold_in_tables(_BLOCKQUOTE.sub(r"\1", rest)))
            continue

        m = _SUMMARY_ONLY.match(line)
        if m:
            out.extend(["", f"{DETAILS_HEADING_LEVEL} {m.group('label').strip()}", ""])
            continue

        # --- blockquote: '>' is dropped by the converter, so drop it here where we can
        #     still see what it was attached to. The text itself is preserved verbatim. ---
        line = _BLOCKQUOTE.sub(r"\1", line)

        out.append(_strip_bold_in_tables(line))

    return _collapse_blank_runs(_protect_line_structure("\n".join(out)))


def _collapse_blank_runs(text: str) -> str:
    """Removing tags leaves ragged blank lines; more than one blank adds nothing."""
    return re.sub(r"\n{3,}", "\n\n", text)


_HEADING = re.compile(r"^ {0,3}#{1,6}(\s|$)")
_BULLET = re.compile(r"^[ \t]*[-*+][ \t]")
_ORDERED_MARKER = re.compile(r"^([ \t]*)(\d{1,9})([.)])(?=[ \t]|$)")
_PLUS_MARKER = re.compile(r"^([ \t]*)\+(?=[ \t]|$)")
#: `- - Tranh khảm`: in a tariff description the dashes ARE the subheading level. As
#: markdown it is a bullet holding a bullet — Docs nests two bullets and the dashes vanish.
_DASH_LEVELS = re.compile(r"^([ \t]*)-(?=[ \t]+-[ \t])")
_RULE_LIKE = re.compile(r"^[ \t]*([-_*=])(?:[ \t]*\1)*[ \t]*$")
_DELIMITER_ROW = re.compile(r"^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$")
#: Two trailing spaces: a markdown hard line break. Docs keeps it as a line break INSIDE the
#: paragraph, so the Doc reads line for line like the file — measured, not assumed.
HARD_BREAK = "  "


def _cell_count(line: str) -> int:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    return len(re.split(r"(?<!\\)\|", s))


def table_line_indexes(lines: list[str]) -> set[int]:
    """Indexes of the lines a GFM parser reads as a TABLE: a header row, then a delimiter row
    with the same number of cells, then every line up to the next blank one.

    A line that merely CONTAINS pipes is text. Copied documents carry tables-inside-tables
    with no delimiter row (source 40), and spreadsheet sheets render as `a | b |` lines
    (source 91); Docs shows all of those as literal text, so they need line protection
    like any other text — treating them as table rows is what left them merged."""
    found: set[int] = set()
    i = 0
    while i < len(lines) - 1:
        head, delim = lines[i], lines[i + 1]
        if ("|" in head and "|" in delim and _DELIMITER_ROW.match(delim)
                and _cell_count(head) == _cell_count(delim)):
            j = i
            while j < len(lines) and lines[j].strip(" \t"):
                found.add(j)
                j += 1
            i = j
        else:
            i += 1
    return found


def _escape_first_char(line: str) -> str:
    indent = len(line) - len(line.lstrip(" \t"))
    return line[:indent] + "\\" + line[indent:]


def _protect_line_structure(text: str) -> str:
    """Stop Docs from renumbering, merging or deleting lines. Every change is MARKUP ONLY —
    the text a reader sees is unchanged, which manifest.is_extension relies on:

    - A whitespace-only line becomes truly empty. Python calls `\\xa0` whitespace; markdown
      does not, so a line of NBSPs is TEXT that glues its neighbours into one paragraph.
    - `1.` / `3)` at the start of a line is escaped (`1\\.`), so it is literal text rather
      than a list item Docs renumbers. `+ ` likewise (Docs turns it into a `*` bullet), and
      the first dash of `- - Loại khác`, whose dashes are an HS subheading level.
    - Leading spaces go (except on bullets, whose indent is nesting): Docs drops them from
      a paragraph anyway, and four of them after a blank line open a code block.
    - A line made only of `-` `_` `*` `=` is escaped: under text it is a setext underline,
      alone it is a thematic break — either way Docs deletes the line. The renderer's own
      `---` separator is kept as a rule and given the blank line above it that it needs.
    - Consecutive lines get a hard break, so they stay separate lines instead of merging.

    Lines of a real GFM table are left alone: cells cannot hold lists, and a hard break
    would end the table.
    """
    lines = ["" if not line.strip() else line for line in text.split("\n")]
    tables = table_line_indexes(lines)
    out: list[tuple[str, bool]] = []          # (line, belongs to a table)
    for i, line in enumerate(lines):
        if i in tables or not line:
            out.append((line, i in tables))
            continue
        line = _PLUS_MARKER.sub(r"\1\\+", line)
        line = _DASH_LEVELS.sub(r"\1\\-", line)
        line = _ORDERED_MARKER.sub(r"\1\2\\\3", line)
        if not _BULLET.match(line):
            line = line.lstrip(" \t")
        if _RULE_LIKE.match(line):
            if line.strip() == "---":
                if out and out[-1][0]:
                    out.append(("", False))
            else:
                line = _escape_first_char(line)
        out.append((line, False))

    result = [line for line, _ in out]
    for k in range(len(out) - 1):
        (a, a_table), (b, b_table) = out[k], out[k + 1]
        if (a and b and not a_table and not b_table and not a.endswith(HARD_BREAK)
                and not _HEADING.match(a) and not _HEADING.match(b)):
            result[k] = a.rstrip() + HARD_BREAK
    return "\n".join(result)


# Word field instructions leak into extracted text: `tại địa chỉ HYPERLINK
# "http://www.ecosys.gov.vn/"www.ecosys.gov.vn`. The instruction goes; the display text,
# which is what the document actually says, stays. Found 2026-09-10 in 11 provisions of
# 31/2018/NĐ-CP (already live in the notebook) and 8 of 72/2022 and 11/2024.
_FIELD_CODE = re.compile(r'\b(?:HYPERLINK|PAGEREF|REF)\s+(?:\\[a-z]\s+)*"[^"]*"(?:\s+\\[a-z*]+(?:\s+"[^"]*")?)*\s*')


def strip_word_field_codes(text: str) -> str:
    return _FIELD_CODE.sub("", text)


# Symbol-font glyphs arrive in the PRIVATE USE AREA: Word and PDF encode a character set in the
# `Symbol` font as U+F000 + its Symbol code, so `α` is stored as U+F061. Google Docs DELETES
# private-use characters — measured 2026-09-10: `Axit \uf061-Naphthylacetic` came back as
# `Axit -Naphthylacetic`, `Ômêga hoa (\uf057)` as `Ômêga hoa ()`. Every occurrence checked in the
# source PDFs is font `SymbolMT`, so this is a DECODING with a published table (Adobe Symbol
# encoding), not a guess. Codes outside the table are left alone, so verify_drive still flags them.
_SYMBOL_FONT = {
    **{0xF020 + i: ch for i, ch in enumerate(" !∀#∃%&∋()∗+,−./0123456789:;<=>?≅")},
    **{0xF041 + i: ch for i, ch in enumerate("ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ")},
    **{0xF05B + i: ch for i, ch in enumerate("[∴]⊥_‾")},
    **{0xF061 + i: ch for i, ch in enumerate("αβχδεφγηιϕκλμνοπθρστυϖωξψζ")},
    **{0xF07B + i: ch for i, ch in enumerate("{|}∼")},
    0xF0A2: "′", 0xF0A3: "≤", 0xF0A5: "∞", 0xF0AC: "←", 0xF0AD: "↑", 0xF0AE: "→", 0xF0AF: "↓",
    0xF0B0: "°", 0xF0B1: "±", 0xF0B2: "″", 0xF0B3: "≥", 0xF0B4: "×", 0xF0B5: "∝", 0xF0B7: "•",
    0xF0B8: "÷", 0xF0B9: "≠", 0xF0BA: "≡", 0xF0BB: "≈", 0xF0D6: "√", 0xF0D7: "⋅",
}


def decode_symbol_font(text: str) -> str:
    """Replace Symbol-font private-use code points with the Unicode character they draw."""
    return text.translate(_SYMBOL_FONT)


_SOURCE_LEADING_DASH = re.compile(r"^([ \t]*)-(?=[ \t])", re.M)


def literal_text(text) -> str:
    """Escape SOURCE text — a gazette provision, a ruling, an Explanatory Note — before it is
    placed into markdown. Source text is text; it never means markup. Applied where the
    renderer inserts data, never to the renderer's own templates (whose `**bold**` is meant).

    - Every `*`. Two of them on a line pair up as emphasis and Docs deletes both — measured:
      `173.6*162.6*12.1 (mm)` came back as `173.6162.612.1`, and the Chapter 29 Note marker
      `*` (structure in the Annex) vanished in pairs.
    - A line-leading `- `. It is an HS subheading level or a list dash in the original; as
      markdown it is a bullet, so the dash stops being text — `- -Vây cá mập` read as one dash.
    """
    return _SOURCE_LEADING_DASH.sub(r"\1\\-", str(text or "").replace("*", "\\*"))


def char_count(text: str) -> int:
    """Characters, not bytes and not words.

    The binding limit in this pipeline is Google Docs' 1.02 million CHARACTERS per
    document — tighter than the notebook's own 500,000 words per source. Vietnamese
    runs 1.12–1.28 UTF-8 bytes per character, so byte-based estimates overshoot by a
    quarter and would trigger a needless file split.
    """
    return len(text)
