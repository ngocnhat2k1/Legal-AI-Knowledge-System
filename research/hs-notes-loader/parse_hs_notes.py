"""Extract Section/Chapter Notes and the six GRI from Thông tư 31/2022/TT-BTC.

    python3 parse_hs_notes.py txt/ --emit out/

The nomenclature itself (11.414 HS lines) is already loaded from ND 26/2023; what was
missing is the part of AHTN that CARRIES LEGAL FORCE under GRI 1 — the Section and
Chapter Notes — plus the six General Interpretative Rules in Phụ lục II. Every real
classification argument turns on those, and without them a model asked "what does Note
1(g) to Section XVI say?" will invent an answer.

Source: 18 gazette parts (Công báo 523+524 … 557+558, 08-7-2022), `.doc` → textutil.
The PDF twins are 200-DPI scans with no text layer, same as ND 26/2023.

TRAPS THIS FILE EXISTS TO SURVIVE
---------------------------------
1. MIXED UNICODE NORMALISATION. `PHẦN XV` is written with a DECOMPOSED Ầ
   (U+00C2 + U+0300) while the other twenty Phần use the precomposed U+1EA6. A grep
   with a precomposed Ầ silently drops exactly one Section — and Section XV is the base
   metals section that half of all "is it Chapter 73 or Chapter 84?" disputes turn on.
   Everything is NFC-normalised on read.

2. RUNNING HEADERS. Every part restarts with "(Tiếp theo Công báo số N + M)", "Phụ lục I"
   and the decree title. Left in place they land inside whichever note block was open
   across the part boundary.

3. BILINGUAL INTERLEAVING. Notes appear as Vietnamese line, blank, English line. The two
   are separated by script detection, not by position, because the blank lines are not
   reliable and some items carry no enumerator.

4. NOTES END WHERE THE TABLE BEGINS. The terminator is the table header `Mã hàng` /
   `Code`, not a blank run.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata

# Structural markers, matched on NFC-normalised text.
RE_PHAN = re.compile(r'^PHẦN\s+([IVXL]+)\s*$')
RE_SECTION = re.compile(r'^SECTION\s+([IVXL]+)\s*$')
RE_CHUONG = re.compile(r'^Chương\s+(\d+)\s*$')
RE_CHAPTER = re.compile(r'^Chapter\s+(\d+)\s*$')
# "Chú giải", "Chú giải.", "Chú giải phân nhóm", "Chú giải phân nhóm."
RE_NOTE_HEAD = re.compile(r'^Chú giải(\s+phân nhóm)?\.?\s*$')
RE_NOTE_HEAD_EN = re.compile(r'^(Sub-?heading\s+)?Notes?\.?\s*$', re.I)
# Table header — where notes stop and the nomenclature starts.
RE_TABLE_HEAD = re.compile(r'^(Mã hàng|Code)\s*$')
# Running headers to drop.
RE_RUNNING = re.compile(
    r'^(\(Tiếp theo Công báo số .*\)|Phụ lục [IV]+|DANH MỤC HÀNG HÓA XUẤT KHẨU, NHẬP KHẨU VIỆT NAM'
    r'|\(Ban hành kèm theo Thông tư số 31/2022/TT-BTC.*\)|CÔNG BÁO/Số .*|\d+\s*)$'
)

# Vietnamese-only letters (NFC) — presence of any of these makes a line Vietnamese.
VI_LETTERS = set('ăâđêôơưĂÂĐÊÔƠƯ')


def is_vietnamese(line: str) -> bool:
    """True if the line is Vietnamese rather than the English twin.

    Decompose and look for a combining tone mark, or for a Vietnamese-only base letter.
    English legal text in this document carries neither.
    """
    if any(c in VI_LETTERS for c in line):
        return True
    for c in unicodedata.normalize('NFD', line):
        if 0x0300 <= ord(c) <= 0x0323:
            return True
    return False


def load_lines(txt_dir: str) -> list[str]:
    """All parts in gazette order, NFC-normalised, running headers dropped."""
    # Sort by GAZETTE ISSUE, which is the number after the underscore. A naive
    # `\d+` matches the `31` of `tt31_` in every filename, so every key ties and the
    # parts stay in os.listdir order — which scrambled the Sections on the first run.
    def issue(f: str) -> int:
        m = re.search(r'_(\d+)', f)
        if not m:
            raise SystemExit(f'tên file không mang số Công báo: {f}')
        return int(m.group(1))

    files = sorted((f for f in os.listdir(txt_dir) if f.endswith('.txt')), key=issue)
    out: list[str] = []
    for f in files:
        raw = open(os.path.join(txt_dir, f), encoding='utf-8', errors='replace').read()
        for line in unicodedata.normalize('NFC', raw).split('\n'):
            line = line.replace(' ', ' ').rstrip()
            if RE_RUNNING.match(line.strip()):
                continue
            out.append(line)
    return out


def split_bilingual(block: list[str]) -> tuple[str, str]:
    vi = [l for l in block if l.strip() and is_vietnamese(l)]
    en = [l for l in block if l.strip() and not is_vietnamese(l)]
    return '\n'.join(vi).strip(), '\n'.join(en).strip()


def parse_notes(lines: list[str]) -> list[dict]:
    """Section and Chapter notes, in document order."""
    rows: list[dict] = []
    phan: str | None = None
    phan_title: list[str] = []
    chuong: str | None = None
    chuong_title: list[str] = []
    i = 0
    n = len(lines)

    def titles_after(idx: int, en_marker: re.Pattern) -> tuple[list[str], int]:
        """Collect the Vietnamese/English title lines that follow a PHẦN/Chương marker."""
        buf, j, seen_en = [], idx, False
        while j < n and j < idx + 12:
            s = lines[j].strip()
            if RE_NOTE_HEAD.match(s) or RE_TABLE_HEAD.match(s):
                break
            if en_marker.match(s):
                seen_en = True
            elif s:
                buf.append(s)
            j += 1
        return buf, j

    while i < n:
        s = lines[i].strip()

        m = RE_PHAN.match(s)
        if m:
            phan, chuong, chuong_title = m.group(1), None, []
            phan_title, _ = titles_after(i + 1, RE_SECTION)
            i += 1
            continue

        m = RE_CHUONG.match(s)
        if m:
            chuong = m.group(1)
            chuong_title, _ = titles_after(i + 1, RE_CHAPTER)
            i += 1
            continue

        m = RE_NOTE_HEAD.match(s)
        if m:
            note_type = 'chu_giai_phan_nhom' if m.group(1) else 'chu_giai'
            block, j = [], i + 1
            while j < n:
                t = lines[j].strip()
                if (RE_TABLE_HEAD.match(t) or RE_PHAN.match(t) or RE_CHUONG.match(t)
                        or RE_NOTE_HEAD.match(t)):
                    break
                if not RE_NOTE_HEAD_EN.match(t):
                    block.append(lines[j])
                j += 1
            vi, en = split_bilingual(block)
            if vi or en:
                vi_t, en_t = split_bilingual(chuong_title if chuong else phan_title)
                rows.append({
                    'scope': 'chuong' if chuong else 'phan',
                    'phan': phan,
                    'chuong': chuong,
                    'note_type': note_type,
                    'title_vi': vi_t, 'title_en': en_t,
                    'text_vi': vi, 'text_en': en,
                })
            i = j
            continue
        i += 1
    return rows


def parse_gri(lines: list[str]) -> list[dict]:
    """The six rules with their explanatory notes, from Phụ lục II."""
    start = next((i for i, l in enumerate(lines) if l.strip() == 'SÁU QUY TẮC TỔNG QUÁT'), None)
    if start is None:
        raise SystemExit('không tìm thấy "SÁU QUY TẮC TỔNG QUÁT" — Phụ lục II thiếu')
    seg = lines[start:]
    re_rule = re.compile(r'^QUY TẮC\s+(\d+)\s*(\([a-c]\))?\s*$')
    re_expl = re.compile(r'^CHÚ GIẢI QUY TẮC\s+(\d+)\s*(\([a-c]\))?\s*$')
    re_rule_en = re.compile(r'^RULE\s+\d+\s*(\([a-c]\))?\s*$', re.I)
    re_expl_en = re.compile(r'^EXPLANATORY NOTE\s*$', re.I)

    marks: list[tuple[int, str, str]] = []
    for i, l in enumerate(seg):
        s = l.strip()
        m = re_rule.match(s)
        if m:
            marks.append((i, 'rule', (m.group(1) + (m.group(2) or '')))); continue
        m = re_expl.match(s)
        if m:
            marks.append((i, 'note', (m.group(1) + (m.group(2) or ''))))
    rows = []
    for k, (idx, kind, rule) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(seg)
        block = [l for l in seg[idx + 1:end]
                 if not re_rule_en.match(l.strip()) and not re_expl_en.match(l.strip())]
        vi, en = split_bilingual(block)
        if vi or en:
            rows.append({'rule': rule, 'kind': kind, 'text_vi': vi, 'text_en': en})
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('txt_dir')
    ap.add_argument('--emit', required=True)
    a = ap.parse_args()
    os.makedirs(a.emit, exist_ok=True)

    lines = load_lines(a.txt_dir)
    notes = parse_notes(lines)
    gri = parse_gri(lines)

    with open(os.path.join(a.emit, 'hs-notes.ndjson'), 'w', encoding='utf-8') as f:
        for r in notes:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    with open(os.path.join(a.emit, 'hs-gri.ndjson'), 'w', encoding='utf-8') as f:
        for r in gri:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    phan = sorted({r['phan'] for r in notes if r['scope'] == 'phan'})
    chuong = sorted({int(r['chuong']) for r in notes if r['scope'] == 'chuong'})
    print(f'{len(lines):,} dòng đọc vào')
    print(f'Chú giải: {len(notes)} khối — {len(phan)} Phần, {len(chuong)} Chương')
    print(f'  Phần có chú giải : {" ".join(phan)}')
    missing = [c for c in range(1, 98) if c not in chuong]
    print(f'  Chương KHÔNG có chú giải ({len(missing)}): {missing}')
    print(f'GRI: {len(gri)} khối — {sorted({r["rule"] for r in gri})}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
