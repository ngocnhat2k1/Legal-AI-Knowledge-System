"""Read every notebook source back from Drive AS PLAIN TEXT and diff it against the local file.

WHY THIS EXISTS. Conversion to a Google Doc is lossy and SILENT (see docs_safe.py). The
first run of this pipeline checked round-trips by WORD COUNT — and passed — while Docs was
renumbering the khoản of every article whose heading had been merged into the previous
list: `1. Hàng hóa xuất khẩu, nhập khẩu tại chỗ là…` came back as `4.`. Word count cannot
see that; the words are all still there. Found 2026-09-10 by a notebook test question, not
by the pipeline.

So this compares LINE BY LINE, on plain text — the Doc exported as .txt, which is the
closest thing we can fetch to what the notebook actually ingests. Markup that does not
change what a reader sees is normalised away on both sides (bullet glyph, `#`, `**`,
backslash escapes, table pipes); everything else must match exactly. A renumbered khoản,
a merged line, a dropped line or a changed digit is a difference.

    python3 research/inbox-loader/verify_drive.py \
        --dest ~/Desktop/Legal-AI-NotebookLM-Export/drive --remote gdrive:Legal-AI-Notebook

Exit status 1 if any source differs.
"""
from __future__ import annotations

import argparse
import difflib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from docs_safe import table_line_indexes

ESCAPE = re.compile(r"\\([!-/:-@\[-`{-~])")
LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


#: A markdown bullet may be `-`, `*` or `+` after ASCII indentation — NOT after NBSP, which
#: markdown treats as text. Docs' plain-text export writes every bullet as `*`. An ESCAPED
#: `\+` is text and comes back as a literal `+`, so the Doc side must not strip `+`, or a
#: dropped character would go unseen.
LOCAL_BULLET = re.compile(r"^[ \t]*[-*+][ \t]+")
DOC_BULLET = re.compile(r"^\*\s+")      # measured: every level exports as `*`; a literal `●` stays text
#: A line of underscores carries no text. Docs may render one as a rule; ignore it both sides.
UNDERSCORES = re.compile(r"_{3,}")


#: Emphasis the RENDERER writes: `**bold**` and `*italic*`, delimiters at word boundaries.
#: Only these asterisks are markup. An escaped `\*` is text, and so is an intraword `*` —
#: `173.6*162.6*12.1` — which markdown would also eat: keeping it here is what makes a
#: missed escape show up as a difference instead of vanishing on both sides (audit 2026-09-10:
#: the old rule deleted EVERY `*`, and hid exactly that).
BOLD = re.compile(r"(?<![\\\w*])\*\*(?=\S)(.+?)(?<=\S)\*\*(?![\w*])")
ITALIC = re.compile(r"(?<![\\\w*])\*(?=[^\s*])(.+?)(?<=[^\s*\\])\*(?![\w*])")
BOLD_S = re.compile(BOLD.pattern, re.S)
ITALIC_S = re.compile(ITALIC.pattern, re.S)


def norm(s: str) -> str:
    """LOCAL markdown → what a reader sees: no heading marks, emphasis, escapes or link targets."""
    s = s.strip().lstrip("﻿")
    s = re.sub(r"^#{1,6}\s+", "", s)
    s = LINK.sub(r"\1", s)
    s = _shield_code(s)
    s = BOLD.sub(r"\1", s)
    s = ITALIC.sub(r"\1", s)
    s = s.replace(SHIELD, "*").replace("~~", "").replace("`", "")
    s = ESCAPE.sub(r"\1", s)
    return " ".join(s.split())


def doc_norm(s: str) -> str:
    """DOC plain text: only the bullet glyph and whitespace. A plain-text export has no escapes
    or emphasis, so nothing else is removed — a stray backslash or `*` must stay visible."""
    s = DOC_BULLET.sub("", s.strip().lstrip("﻿"))
    return " ".join(s.split())


def _join_code_spans(lines: list[str]) -> list[str]:
    """An inline code span that runs past the end of a line swallows the line break — in
    markdown it renders as ONE space. Docs does that correctly; the expected text must too."""
    out: list[str] = []
    for line in lines:
        if out and out[-1] and line and len(re.findall(r"(?<!\\)`", out[-1])) % 2:
            out[-1] = out[-1].rstrip() + " " + line.strip()
        else:
            out.append(line)
    return out


_HEADING_LINE = re.compile(r"^ {0,3}#{1,6}\s")


#: A `*` inside a code span is literal (`` `*` nghĩa là LOẠI TRỪ ``) — shield it from the
#: emphasis rules, or two such spans pair up and the check invents a deletion Docs never made.
SHIELD = "\x01"
CODE_SPAN = re.compile(r"`[^`]*`")


def _shield_code(text: str) -> str:
    return CODE_SPAN.sub(lambda m: m.group(0).replace("*", SHIELD), text)


def _strip_paragraph_emphasis(lines: list[str], tables: set[int]) -> list[str]:
    """Emphasis may open on one line and close on the next — hard breaks keep a paragraph's
    lines separate, but `**…**` still spans them. Remove it per PARAGRAPH (a run of text lines
    ending at a blank line, a heading, a table or a new list item), keeping line count."""
    out = list(lines)
    i = 0
    while i < len(out):
        if not out[i] or i in tables or _HEADING_LINE.match(out[i]):
            i += 1
            continue
        j = i + 1
        while (j < len(out) and out[j] and j not in tables and not _HEADING_LINE.match(out[j])
               and not LOCAL_BULLET.match(out[j])):
            j += 1
        block = _shield_code("\n".join(out[i:j]))
        block = BOLD_S.sub(r"\1", block)
        block = ITALIC_S.sub(r"\1", block)
        out[i:j] = block.replace(SHIELD, "*").split("\n")
        i = j
    return out


def local_lines(md: str) -> list[str]:
    lines = ["" if not line.strip() else line for line in md.split("\n")]
    lines = _join_code_spans(lines)
    tables = table_line_indexes(lines)            # only a REAL table splits into cells
    lines = _strip_paragraph_emphasis(lines, tables)
    out: list[str] = []
    prev_blank = True
    for i, raw in enumerate(lines):
        if not raw:
            prev_blank = True
            continue
        s = raw.strip()
        if i in tables:
            if not re.fullmatch(r"[\s|:-]+", s):
                out += [norm(c) for c in s.strip("|").split("|")]
        elif s == "---" and prev_blank:
            pass                                  # thematic break: no text on either side
        else:
            # A literal `* ` opening a line exports exactly like a bullet glyph; strip one on
            # both sides so the two cannot be told apart by accident (the characters are equal).
            if LOCAL_BULLET.match(raw):          # the bullet IS the one the Doc exports as `* `
                out.append(norm(LOCAL_BULLET.sub("", raw, count=1)))
            else:
                out.append(DOC_BULLET.sub("", norm(raw)))
        prev_blank = False
    return [x for x in out if x and not UNDERSCORES.fullmatch(x)]


def drive_lines(txt: str) -> list[str]:
    return [x for x in (doc_norm(line) for line in txt.split("\n"))
            if x and not UNDERSCORES.fullmatch(x)]


def compare(name: str, md: str, txt: str, show: int) -> int:
    a, b = local_lines(md), drive_lines(txt)
    ops = [op for op in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
           if op[0] != "equal"]
    status = "OK " if not ops else "SAI"
    print(f"{status} {len(ops):5d} chỗ lệch · {len(a):6d} dòng cục bộ · {len(b):6d} dòng Doc  {name}")
    for tag, i1, i2, j1, j2 in ops[:show]:
        print(f"      {tag}: cục bộ {a[i1:i2][:3]}")
        print(f"      {' ' * len(tag)}  Doc    {b[j1:j2][:3]}")
    return len(ops)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dest", required=True, help="thư mục chứa file .md đã render")
    ap.add_argument("--remote", required=True, help="ví dụ gdrive:Legal-AI-Notebook")
    ap.add_argument("--only", action="append", default=[], metavar="TÊN.md", help="chỉ kiểm file này (lặp lại được)")
    ap.add_argument("--show", type=int, default=3, help="số chỗ lệch in ra cho mỗi file")
    ap.add_argument("--keep", default=None, help="giữ bản .txt tải về ở thư mục này")
    args = ap.parse_args()
    dest = Path(args.dest).expanduser()
    names = args.only or sorted(p.name for p in dest.glob("*.md"))

    work = Path(args.keep).expanduser() if args.keep else Path(tempfile.mkdtemp(prefix="verify-drive-"))
    work.mkdir(parents=True, exist_ok=True)
    cmd = ["rclone", "copy", args.remote, str(work), "--drive-export-formats", "txt", "--transfers", "4"]
    for n in names:
        cmd += ["--include", n[:-3] + ".txt"]
    subprocess.run(cmd, check=True, stderr=subprocess.DEVNULL)

    bad = missing = 0
    for n in names:
        txt_path = work / (n[:-3] + ".txt")
        if not txt_path.exists():
            print(f"THIẾU  không có Doc trên Drive: {n}")
            missing += 1
            continue
        if compare(n, (dest / n).read_text(encoding="utf-8"), txt_path.read_text(encoding="utf-8"), args.show):
            bad += 1
    print(f"\n{len(names)} nguồn · {bad} lệch · {missing} thiếu")
    return 1 if bad or missing else 0


if __name__ == "__main__":
    sys.exit(main())
