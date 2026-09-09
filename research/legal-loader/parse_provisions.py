"""Parse Vietnamese legal `.doc` PROSE into a Chương/Điều/Khoản/Điểm tree.

This is a NEW parser, not a reuse of parse_nd26.py — that one reads TARIFF TABLES
(cells split on the Word cell mark \x07). Legal instruments are prose: the load-
bearing structure is the numbering (Điều N. / N. / a)), so we split on newlines
and walk boundary markers, keeping a depth stack (the idea, not the code, comes
from extract_descriptions.py).

Structure (Luật/Nghị định/Thông tư):
    Chương I            ^Chương <roman>          → title on the next line
    Điều 1. <heading>   ^Điều (\\d+)\\.           → body follows until next Điều/Chương
      1. <khoản text>   ^(\\d+)\\.                → a clause inside the Điều
        a) <điểm text>  ^([a-zđ])\\)             → a point inside the Khoản

Retrieval discipline (legal-rag-retrieval.md): a chunk is indexed at the Khoản but
returns its parent Điều, so we store the FULL verbatim article as the Điều body and
the full verbatim clause (chapeau + its điểm) as the Khoản body — never paraphrased.
Điểm rows are kept for citation granularity; the chunk text lives in the Khoản.

    python3 parse_provisions.py corpus.json ../../db/seed/data/legal
"""
from __future__ import annotations

import html
import json
import os
import re
import subprocess
import sys
import zipfile

CHUONG = re.compile(r'^Chương\s+([IVXLCDM]+)\b', re.IGNORECASE)
MUC = re.compile(r'^Mục\s+(\d+)\b')
# A footnote superscript can fuse to the number in a PDF render ("Điều 50.40 …" =
# Điều 50 + footnote 40; "1.33 …" = khoản 1 + footnote 33). \.?\d* / \.\d* eat the
# footnote digits (only right after the period, never a space-separated title number).
# \s* (not \s+) after the number: dropping the reference superscript can leave no
# space ("Điều 6.⁷Đối" → "Điều 6.Đối").
DIEU = re.compile(r'^Điều\s+(\d+)\.?\d*\s*(.+)$')  # also tolerates a missing period
# The same line WITH the period present — the mark of a real heading rather than a
# cross-reference that happened to wrap onto its own line. See split_articles.
DIEU_HEADING = re.compile(r'^Điều\s+\d+\.')
# A period-less "Điều N …" that is a REFERENCE, not a heading. What follows the number
# decides: a heading is followed by its TITLE ("Điều 71 Thủ tục xử lý phế liệu" — a real
# heading whose period the PDF render ate), a reference is followed by the name of the
# document it points into ("Điều 18 Luật Hải quan và …", "Điều 9 Thông tư này.") or by a
# sub-article letter ("Điều 51a hoặc điểm a …"). Without this, a reference that happens to
# land on the NEXT article's number slips through the successor branch and steals that
# article's heading — it cost Điều 18/33/51/71 of 25/VBHN-BTC and 9/20 of 33/2023/TT-BTC.
DIEU_REFERENCE = re.compile(
    r'^Điều\s+\d+(?:[a-zđ]\b'
    r'|\s+(?:của|này|nêu|hoặc|và|tại|theo|trên|Luật|Bộ luật|Nghị định|Nghị quyết'
    r'|Thông tư|Quyết định|Pháp lệnh|Hiệp định)\b)',
)
KHOAN = re.compile(r'^(\d+)\.\d*\s+(.+)$')
DIEM = re.compile(r'^([a-zđ])\)\s+(.*)$')
# A heading longer than one rendered line WRAPS, and its tail lands as the first line of
# the body: "Điều 12. Thủ tục hải quan đối với hàng hóa xuất khẩu, nhập" / "khẩu tại chỗ".
# The citation then reads truncated and the body starts mid-sentence — the same visible
# damage a stolen heading does, from a different cause, and it affects the whole corpus.
# Bounded, because an unbounded join would swallow a genuinely lower-case body line: two
# is what a real title needs even at the width of a Công báo column. Measured over the
# four multi-part documents in the corpus (387 articles): 0 -> 126 truncated headings,
# 2 -> 2, 3 -> 1, and raising 2 to 3 changes exactly ONE article — Điều 87 of
# 25/VBHN-BTC, whose title genuinely runs three lines. Nothing else moves, which is the
# evidence that 3 does not reach into bodies.
HEADING_WRAP_MAX = 3
# A repealed article's heading is COMPLETE at the marker: "Điều 26. (được bãi bỏ)". What
# follows on the next line is the amending document's footnote ("ngày 20 tháng 4 năm 2018
# của Bộ trưởng…"), which opens in lower case and would otherwise read as a wrap. 41 such
# articles sit in the corpus; without this the join dragged a whole footnote into the
# label of Điều 40 of 25/VBHN-BTC, replacing a clean heading with a paragraph.
HEADING_TERMINATED = re.compile(r'\((?:được|bị|đã)\s+bãi bỏ\)\s*$')
# End of the enacting text — signature block / appendix. Everything after is not
# Điều-structured (forms, tables), so we stop before it.
TERMINATOR = re.compile(r'^(TM\.|KT\.|Nơi nhận|THỦ TƯỚNG\b|BỘ TRƯỞNG\b|CHỦ TỊCH\b|PHỤ LỤC\b)')
# A mixed-case "Phụ lục …" ends the enacting text ONLY when the line is just the
# marker (plus a numeral). A procedural circular cites its own appendices in nearly
# every article ("theo mẫu số 02/… Phụ lục VI ban hành kèm Thông tư này;"), and PDF
# line-wrapping regularly puts that citation at the head of a line — treating it as
# the appendix boundary stopped 25/VBHN-BTC after 7 of its 149 articles.
APPENDIX_HEADING = re.compile(r'^Phụ lục\s*[IVXLCDM\d]*\s*$')
# Công báo running header/footer + VBHN boilerplate that repeats at each part
# boundary of a multi-part circular (must be dropped so it doesn't pollute the last
# article of a part). All anchored/specific — none occur in legal prose.
FOOTER = re.compile(
    r'CÔNG BÁO/Số|^\s*PAGE\s+\d+|^\s*\d+\s*$'
    r'|^VĂN BẢN PHÁP LUẬT KHÁC|^VĂN BẢN HỢP NHẤT'
    r'|^Số\s+\d+\s*\+\s*\d+|^MỤC LỤC$|^Trang$'
    r'|^Văn bản hợp nhất số\s+\d+/VBHN|^\(Đăng từ Công báo'
    r'|^\d{1,2}-\d{1,2}-\d{4}\s*-?\s*$'
    # VBHN footnote annotations (textutil dumps them after each part's articles):
    # "Khoản/Điều/Điểm/Mục/Chương này được (bãi bỏ|sửa đổi|bổ sung|…) theo quy định
    # tại …". Article bodies never begin a line this way, so this is safe.
    r'|^\d*\s*(Khoản|Điều|Điểm|Mục|Chương|Phần)\s+này\s+được\s+(bãi bỏ|sửa đổi|bổ sung|thay thế|hủy bỏ)'
    r'|^Văn bản này được hợp nhất|^Văn bản hợp nhất này không',
)

ROMAN = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}


def docx_paragraphs(path: str) -> list[str]:
    """Extract paragraph text from a .docx (one string per <w:p>).

    Công báo .docx are exported by a tool that writes BACKSLASH zip paths
    (word\\document.xml) and trips textutil, so we read the part directly. Word
    footnotes (the VBHN amendment markers) live in a separate part and are not
    <w:t> runs, so they are naturally excluded — the consolidated body stays clean.
    """
    z = zipfile.ZipFile(path)
    docname = next(n for n in z.namelist() if n.replace('\\', '/').endswith('word/document.xml'))
    xml = z.read(docname).decode('utf-8', 'replace')
    # Match ONLY the <w:t> text element — the word boundary after `w:t` (whitespace
    # for attributes, or immediate `>`) is essential: a bare `<w:t[^>]*>` also
    # matches <w:tabs>/<w:tab …/>, and then (.*?)</w:t> slurps all the run/paragraph
    # formatting XML (<w:pBdr>, <w:spacing>, <w:rFonts>…) into the text.
    run = re.compile(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>', re.S)
    return [html.unescape(''.join(run.findall(p))) for p in xml.split('</w:p>')]


def pdf_lines(path: str) -> list[str]:
    """Extract the BODY text from a Công báo signed PDF with pdfplumber.

    Used when a document has no clean .docx and its .doc is a footnote-polluted
    multi-part (e.g. VBHN of NĐ 08/2015). A signed PDF is a FLAT RENDER: the body is
    the current consolidated text (no duplicate-Khoản artifact the .doc has).

    The VBHN sets BOTH amendment footnotes AND the amended (in-force) provision text
    in a smaller font (body 14pt, footnotes/amended 12pt, ref superscripts 8-9pt), so
    font size alone can't tell them apart — but POSITION can: footnotes always sit
    BELOW the last body line of the page, while amended 12pt text is inline within the
    body flow. So per page we keep: body/headings (≥13pt) + inline smaller text (≥11pt
    at or above the last body line); we drop footnotes (small text below the body) and
    reference superscripts (<11pt, e.g. the "40" in "Điều 50.40" → "Điều 50.").

    pdfplumber (not pypdf) is required — pypdf inserts mid-word spaces ("n ăm").
    """
    import pdfplumber

    out: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            body_bottom = max((c['top'] for c in page.chars if round(c['size']) >= 13),
                              default=page.height)

            def keep(o, _bottom=body_bottom):
                size = o.get('size')
                if size is None:
                    return True  # non-char objects don't affect extracted text
                return size >= 13 or (size >= 11 and o.get('top', 0) <= _bottom + 2)

            out.extend((page.filter(keep).extract_text() or '').split('\n'))
    return out


def doc_lines(path: str) -> list[str]:
    """.doc → textutil; .docx → direct part read; .pdf → pdfplumber. Split into
    prose lines; drop footer/empty/table lines."""
    low = path.lower()
    if low.endswith('.docx'):
        raw = docx_paragraphs(path)
    elif low.endswith('.pdf'):
        raw = pdf_lines(path)
    else:
        out = subprocess.run(['textutil', '-stdout', '-convert', 'txt', path],
                             capture_output=True, check=True).stdout.decode('utf-8', 'replace')
        raw = out.split('\n')
    lines = []
    for r in raw:
        # Word cell mark (\x07) means a TABLE row (a Mẫu/biểu form) — legal prose has
        # none, so drop it. Keeps form tables out of the article bodies.
        if '\x07' in r:
            continue
        s = r.strip()
        if not s or FOOTER.search(s):
            continue
        lines.append(s)
    return lines


def read_doc(doc: dict) -> list[str]:
    """Concatenate lines from a document's part(s). Multi-part circulars list their
    ARTICLE parts in order via `doc_files` (TOC/appendix parts are omitted); a single
    document uses `doc_file`. Chapter context carries across parts (we concatenate,
    not parse-per-part), but EACH part repeats the VBHN preamble (consolidation note +
    Căn cứ…) — so from each part we take only from its first Chương/Mục/Điều, dropping
    that repeated preamble so it can't leak into the previous part's last article."""
    files = doc.get('doc_files') or [doc['doc_file']]
    lines: list[str] = []
    for f in files:
        pl = doc_lines(f)
        start = next((i for i, ln in enumerate(pl)
                      if CHUONG.match(ln) or MUC.match(ln) or DIEU.match(ln)), 0)
        lines.extend(pl[start:])
    return lines


def _is_heading_continuation(line: str) -> bool:
    """Is this line the wrapped tail of the heading above it, rather than the body?

    Legal prose opens a real body line with a capital or a numbered khoản, so LOWER
    CASE at the head of an article body means the line above it was cut by the render.
    Anything that opens a new structural unit ends the heading whatever its case, so
    those are checked first — a khoản absorbed into a heading would lose a clause.
    """
    s = line.strip()
    if not s:
        return False
    if (KHOAN.match(s) or DIEM.match(s) or DIEU.match(s) or CHUONG.match(s)
            or MUC.match(s) or TERMINATOR.match(s) or APPENDIX_HEADING.match(s)
            or FOOTER.search(s)):
        return False
    return s[0].islower()


def split_articles(lines: list[str]) -> list[dict]:
    """Walk lines into articles, each tagged with its chapter/section context.

    A line starting "Điều N" is not necessarily a new article — in a long circular
    the body is full of CROSS-REFERENCES that happen to wrap onto their own line
    ("… quy định tại\\nĐiều 7 Nghị định số 08/2015/NĐ-CP …"), and DIEU tolerates a
    missing period, so they match. Left unchecked, 25/VBHN-BTC parsed as 62 articles
    in a range that contains 40: the sequence came out 1, 2, *7*, *21*, 3, 4, …

    Two signals separate a heading from a reference, and BOTH are needed:

      * the PERIOD. A heading is "Điều 12. Khai hải quan"; a reference is "Điều 7
        Nghị định số 08/2015". The period is the reliable mark, but not sufficient
        on its own — a sentence can end mid-reference.
      * the ORDER. Article numbers ascend through a document. A match at or below
        the article we are already inside is a reference.

    Order alone is NOT enough, and assuming it was cost 28 articles of 46/VBHN-BTC
    on the first attempt: a single spurious HIGH reference ("Điều 50 của Luật Hải
    quan") would raise the watermark and swallow every real article beneath it. So
    a jump forward is only believed when the line also carries the period.

    The strict successor (N = last + 1) is accepted without the period — that is the
    case the period-optional tolerance exists for — but only after DIEU_REFERENCE
    clears it. A reference whose number happens to be exactly the next article's is
    the one shape both signals miss, and it does not merely add a phantom article: it
    STEALS the real article's heading, which then reads as a sentence fragment while
    the citation label points at the wrong subject.
    """
    articles: list[dict] = []
    chuong_num = chuong_title = muc_num = muc_title = None
    cur: dict | None = None
    last_dieu = 0
    started = False
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        if started and (TERMINATOR.match(line) or APPENDIX_HEADING.match(line)):
            break
        m = CHUONG.match(line)
        if m:
            chuong_num = m.group(1).upper()
            chuong_title = lines[i + 1] if i + 1 < n else ''
            muc_num = muc_title = None
            cur = None
            started = True
            i += 2  # consume the title line
            continue
        m = MUC.match(line)
        if m:
            muc_num = m.group(1)
            muc_title = lines[i + 1] if i + 1 < n else ''
            cur = None
            started = True
            i += 2
            continue
        m = DIEU.match(line)
        num = int(m.group(1)) if m else 0
        is_heading = (
            (num > last_dieu and DIEU_HEADING.match(line))
            or (num == last_dieu + 1 and not DIEU_REFERENCE.match(line))
        )
        if m and is_heading:
            started = True
            last_dieu = num
            cur = {
                'chuong_num': chuong_num, 'chuong_title': chuong_title,
                'muc_num': muc_num, 'muc_title': muc_title,
                'dieu_num': m.group(1), 'heading': line, 'title': m.group(2).strip(),
                'body_lines': [],
            }
            # Take back the wrapped tail of the heading before the body starts.
            wrapped = 0
            while wrapped < HEADING_WRAP_MAX and i + 1 < n:
                if HEADING_TERMINATED.search(cur['heading']):
                    break
                tail = lines[i + 1]
                if not _is_heading_continuation(tail):
                    break
                cur['heading'] = f"{cur['heading']} {tail.strip()}"
                cur['title'] = f"{cur['title']} {tail.strip()}"
                i += 1
                wrapped += 1
            articles.append(cur)
            i += 1
            continue
        if cur is not None:
            cur['body_lines'].append(line)
        i += 1
    return articles


def parse_clauses(body_lines: list[str]) -> tuple[list[str], list[dict]]:
    """Split an article body into (chapeau lines, [khoản {num, lines, diem[]}])."""
    chapeau: list[str] = []
    khoan: list[dict] = []
    cur_k: dict | None = None
    cur_d: dict | None = None
    for line in body_lines:
        mk = KHOAN.match(line)
        md = DIEM.match(line)
        if mk:
            cur_k = {'num': mk.group(1), 'lines': [mk.group(2).strip()], 'diem': []}
            khoan.append(cur_k)
            cur_d = None
        elif md and cur_k is not None:
            cur_d = {'letter': md.group(1), 'lines': [md.group(2).strip()]}
            cur_k['diem'].append(cur_d)
            cur_k['lines'].append(line)  # keep điểm text in the khoản body (verbatim)
        elif cur_d is not None:
            cur_d['lines'].append(line)
            cur_k['lines'].append(line)
        elif cur_k is not None:
            cur_k['lines'].append(line)
        else:
            chapeau.append(line)
    return chapeau, khoan


def build(doc: dict) -> list[dict]:
    """Return provision rows (chương/mục/điều/khoản/điểm) for one document."""
    short = doc['short']
    lines = read_doc(doc)
    articles = split_articles(lines)

    rows: list[dict] = []
    order = 0
    seen_chuong: dict[str, str] = {}   # roman -> key
    seen_muc: dict[str, str] = {}
    seen_dieu: set[str] = set()

    def add(key, parent_key, ptype, number, heading, body, path, citation):
        nonlocal order
        rows.append({
            'document_number': doc['number'], 'key': key, 'parent_key': parent_key,
            'ptype': ptype, 'number': number, 'order_index': order,
            'heading': heading, 'body': body, 'path': path, 'citation_label': citation,
        })
        order += 1

    for a in articles:
        # A VBHN appends the amending decree's own "Điều khoản thi hành" after the
        # main body — those reuse main article numbers. Keep the FIRST (main body).
        if a['dieu_num'] in seen_dieu:
            continue
        seen_dieu.add(a['dieu_num'])
        cnum, ctitle = a['chuong_num'], a['chuong_title']
        chuong_key = None
        chuong_path = short
        if cnum:
            chuong_key = f"{doc['number']}::chuong-{cnum}"
            chuong_path = f"{short} › Chương {cnum}"
            if cnum not in seen_chuong:
                seen_chuong[cnum] = chuong_key
                add(chuong_key, None, 'chuong', cnum, f'Chương {cnum}. {ctitle}', None,
                    chuong_path, f'Chương {cnum} {short}')

        parent_key = chuong_key
        parent_path = chuong_path
        if a['muc_num']:
            muc_key = f"{doc['number']}::chuong-{cnum}-muc-{a['muc_num']}"
            muc_path = f"{chuong_path} › Mục {a['muc_num']}"
            if muc_key not in seen_muc:
                seen_muc[muc_key] = muc_key
                add(muc_key, chuong_key, 'muc', a['muc_num'], f"Mục {a['muc_num']}. {a['muc_title']}",
                    None, muc_path, f"Mục {a['muc_num']} Chương {cnum} {short}")
            parent_key, parent_path = muc_key, muc_path

        dn = a['dieu_num']
        dieu_key = f"{doc['number']}::dieu-{dn}"
        dieu_path = f"{parent_path} › Điều {dn}"
        dieu_body = '\n'.join(a['body_lines']).strip()
        add(dieu_key, parent_key, 'dieu', dn, a['heading'], dieu_body, dieu_path,
            f'Điều {dn} {short}')

        _, khoan = parse_clauses(a['body_lines'])
        for k in khoan:
            kn = k['num']
            khoan_key = f"{dieu_key}-khoan-{kn}"
            khoan_path = f"{dieu_path} › Khoản {kn}"
            khoan_body = '\n'.join(k['lines']).strip()
            add(khoan_key, dieu_key, 'khoan', kn, None, khoan_body, khoan_path,
                f'Khoản {kn} Điều {dn} {short}')
            for d in k['diem']:
                ltr = d['letter']
                add(f"{khoan_key}-diem-{ltr}", khoan_key, 'diem', ltr, None,
                    '\n'.join(d['lines']).strip(), f"{khoan_path} › Điểm {ltr}",
                    f'Điểm {ltr} Khoản {kn} Điều {dn} {short}')
    return rows


def main() -> None:
    corpus_path, out_dir = sys.argv[1], sys.argv[2]
    corpus = json.load(open(corpus_path, encoding='utf-8'))
    os.makedirs(out_dir, exist_ok=True)

    doc_rows, prov_rows, ok = [], [], True
    for doc in corpus:
        rows = build(doc)
        n_chuong = sum(1 for r in rows if r['ptype'] == 'chuong')
        n_dieu = sum(1 for r in rows if r['ptype'] == 'dieu')
        n_khoan = sum(1 for r in rows if r['ptype'] == 'khoan')
        n_diem = sum(1 for r in rows if r['ptype'] == 'diem')
        exp = doc.get('expect', {})
        checks = []
        for label, got in [('chuong', n_chuong), ('dieu', n_dieu)]:
            if label in exp:
                good = got == exp[label]
                ok = ok and good
                checks.append(f"{label} {got}/{exp[label]} {'OK' if good else 'CHECK!!'}")
        print(f"{doc['number']}: {n_chuong} chương · {n_dieu} điều · {n_khoan} khoản · "
              f"{n_diem} điểm  [{' · '.join(checks)}]")
        doc_rows.append({k: v for k, v in doc.items() if k not in ('doc_file', 'doc_files', 'expect', 'short')}
                        | {'short': doc['short']})
        prov_rows.extend(rows)

    with open(os.path.join(out_dir, 'documents.ndjson'), 'w', encoding='utf-8') as f:
        for r in doc_rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    with open(os.path.join(out_dir, 'provisions.ndjson'), 'w', encoding='utf-8') as f:
        for r in prov_rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f"\nwrote {len(doc_rows)} documents.ndjson · {len(prov_rows)} provisions.ndjson -> {out_dir}")
    if not ok:
        print('ACCEPTANCE CHECK FAILED — parser counts differ from expected.')
        sys.exit(2)


if __name__ == '__main__':
    main()
