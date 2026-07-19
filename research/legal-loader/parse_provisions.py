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
DIEU = re.compile(r'^Điều\s+(\d+)\.\s*(.*)$')
KHOAN = re.compile(r'^(\d+)\.\s+(.*)$')
DIEM = re.compile(r'^([a-zđ])\)\s+(.*)$')
# End of the enacting text — signature block / appendix. Everything after is not
# Điều-structured (forms, tables), so we stop before it.
TERMINATOR = re.compile(r'^(TM\.|KT\.|Nơi nhận|THỦ TƯỚNG\b|BỘ TRƯỞNG\b|CHỦ TỊCH\b|Phụ lục\b|PHỤ LỤC\b)')
# Công báo running header/footer artifacts interleaved by textutil.
FOOTER = re.compile(r'CÔNG BÁO/Số|^\s*PAGE\s+\d+|^\s*\d+\s*$')

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


def doc_lines(path: str) -> list[str]:
    """.doc → textutil; .docx → direct part read. Split into prose lines; drop
    footer/empty lines."""
    if path.lower().endswith('.docx'):
        raw = docx_paragraphs(path)
    else:
        out = subprocess.run(['textutil', '-stdout', '-convert', 'txt', path],
                             capture_output=True, check=True).stdout.decode('utf-8', 'replace')
        raw = out.split('\n')
    lines = []
    for r in raw:
        s = r.strip()
        if not s or FOOTER.search(s):
            continue
        lines.append(s)
    return lines


def split_articles(lines: list[str]) -> list[dict]:
    """Walk lines into articles, each tagged with its chapter/section context."""
    articles: list[dict] = []
    chuong_num = chuong_title = muc_num = muc_title = None
    cur: dict | None = None
    started = False
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        if started and TERMINATOR.match(line):
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
        if m:
            started = True
            cur = {
                'chuong_num': chuong_num, 'chuong_title': chuong_title,
                'muc_num': muc_num, 'muc_title': muc_title,
                'dieu_num': m.group(1), 'heading': line, 'title': m.group(2).strip(),
                'body_lines': [],
            }
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
    lines = doc_lines(doc['doc_file'])
    articles = split_articles(lines)

    rows: list[dict] = []
    order = 0
    seen_chuong: dict[str, str] = {}   # roman -> key
    seen_muc: dict[str, str] = {}

    def add(key, parent_key, ptype, number, heading, body, path, citation):
        nonlocal order
        rows.append({
            'document_number': doc['number'], 'key': key, 'parent_key': parent_key,
            'ptype': ptype, 'number': number, 'order_index': order,
            'heading': heading, 'body': body, 'path': path, 'citation_label': citation,
        })
        order += 1

    for a in articles:
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
        doc_rows.append({k: v for k, v in doc.items() if k not in ('doc_file', 'expect', 'short')}
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
