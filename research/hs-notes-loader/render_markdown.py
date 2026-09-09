"""Render the extracted Section/Chapter Notes and GRI as markdown for NotebookLM.

    python3 render_markdown.py out/ --dest <export-dir>

Vietnamese first (it is the operative text for a Vietnamese declarant), English second
and clearly labelled — the English is the WCO wording the Vietnamese translates, and
having both in the same block is what lets a reader catch a mistranslated note.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date

ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI',
         'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI']
NOTE_LABEL = {'chu_giai': 'Chú giải', 'chu_giai_phan_nhom': 'Chú giải phân nhóm'}

SRC = ('Thông tư số 31/2022/TT-BTC ngày 08/6/2022 của Bộ Tài chính ban hành Danh mục hàng hóa '
       'xuất khẩu, nhập khẩu Việt Nam (AHTN 2022) — Công báo số 523+524 … 557+558 ngày 08/7/2022. '
       'Hiệu lực từ 01/12/2022.')
URL = 'https://congbao.chinhphu.vn/van-ban/thong-tu-so-31-2022-tt-btc-37431.htm'


def load(p):
    return [json.loads(l) for l in open(p, encoding='utf-8')]


def block(r) -> str:
    out = [f"**{NOTE_LABEL[r['note_type']]}**\n", r['text_vi'], ""]
    if r['text_en']:
        out += ["<details><summary>Nguyên văn tiếng Anh (WCO)</summary>\n", r['text_en'], "\n</details>", ""]
    return '\n'.join(out)


def header(title: str, blurb: str) -> str:
    return (f"# {title}\n\n"
            f"> **Nguồn:** {SRC}\n"
            f"> **Link:** {URL}\n"
            f"> **Trích xuất:** {date.today().isoformat()}\n\n"
            f"{blurb}\n\n---\n")


def render_gri(gri, dest):
    order, seen = [], set()
    for r in gri:
        if r['rule'] not in seen:
            seen.add(r['rule']); order.append(r['rule'])
    parts = [header(
        'Sáu quy tắc tổng quát giải thích việc phân loại hàng hóa (GRI)',
        'Đây là **văn bản pháp lý bắt buộc** khi phân loại mã HS, kèm phần Chú giải chi tiết '
        '(Explanatory Notes) của từng quy tắc.\n\n'
        '**Thứ tự áp dụng là bắt buộc.** Không được nhảy sang Quy tắc 3 khi Quy tắc 1 đã giải '
        'quyết được hàng hóa. Trong Quy tắc 3, thứ tự 3(a) → 3(b) → 3(c) cũng là bắt buộc.\n\n'
        '> **Quy tắc 1 nói rõ:** tên của Phần, Chương, Phân chương **chỉ để dễ tra cứu, không có '
        'giá trị pháp lý**. Cái có giá trị pháp lý là *nội dung nhóm hàng* và *Chú giải Phần/Chương* '
        '— xem hai file `11-chu-giai-phan.md` và `12/13-chu-giai-chuong-*.md`.')]
    for rule in order:
        parts.append(f"\n## Quy tắc {rule}\n")
        for kind, lbl in (('rule', 'Nội dung quy tắc'), ('note', f'Chú giải Quy tắc {rule}')):
            for r in gri:
                if r['rule'] == rule and r['kind'] == kind:
                    parts.append(f"### {lbl}\n\n{r['text_vi']}\n")
                    if r['text_en']:
                        parts.append(f"<details><summary>Nguyên văn tiếng Anh (WCO)</summary>\n\n{r['text_en']}\n\n</details>\n")
    p = os.path.join(dest, '10-sau-quy-tac-tong-quat-GRI.md')
    open(p, 'w', encoding='utf-8').write('\n'.join(parts) + '\n')
    return p


def render_sections(notes, dest):
    rows = [r for r in notes if r['scope'] == 'phan']
    parts = [header(
        'Chú giải Phần (Section Notes) — Phần I đến XXI',
        'Chú giải Phần có **giá trị pháp lý ngang với nội dung nhóm hàng** theo Quy tắc 1 GRI. '
        'Đây là căn cứ quyết định trong hầu hết tranh chấp phân loại thực tế.\n\n'
        f'Trong HS 2022, chỉ **{len({r["phan"] for r in rows})} Phần** có Chú giải: '
        f'{", ".join(sorted({r["phan"] for r in rows}, key=ROMAN.index))}. '
        'Các Phần còn lại không có Chú giải — đó là đặc điểm của HS, không phải thiếu dữ liệu.\n\n'
        '> **Bẫy thường gặp:** Chú giải 1 của một Phần thường là danh sách *"Phần này KHÔNG bao gồm"* '
        '— tức nó **loại trừ hàng RA KHỎI** Phần đó, chứ không phải kéo hàng vào. Đọc ngược chiều '
        'điều khoản này là lỗi phân loại phổ biến.')]
    for rm in sorted({r['phan'] for r in rows}, key=ROMAN.index):
        grp = [r for r in rows if r['phan'] == rm]
        parts.append(f"\n## PHẦN {rm} — {grp[0]['title_vi']}\n")
        if grp[0]['title_en']:
            parts.append(f"*{grp[0]['title_en']}*\n")
        for r in grp:
            parts.append(block(r))
    p = os.path.join(dest, '11-chu-giai-phan.md')
    open(p, 'w', encoding='utf-8').write('\n'.join(parts) + '\n')
    return p


def render_chapters(notes, dest, split_at=50):
    rows = sorted((r for r in notes if r['scope'] == 'chuong'), key=lambda r: (int(r['chuong']), r['note_type']))
    made = []
    for idx, (lo, hi) in enumerate([(1, split_at - 1), (split_at, 97)], start=12):
        grp = [r for r in rows if lo <= int(r['chuong']) <= hi]
        chs = sorted({int(r['chuong']) for r in grp})
        parts = [header(
            f'Chú giải Chương (Chapter Notes) — Chương {lo:02d} đến {hi}',
            'Chú giải Chương có **giá trị pháp lý** theo Quy tắc 1 GRI, và được áp dụng **sau** '
            'Chú giải Phần. `Chú giải phân nhóm` (Subheading Notes) chỉ dùng khi so sánh ở **cùng '
            'một cấp phân nhóm** theo Quy tắc 6.\n\n'
            f'Phần này chứa {len(chs)} chương có chú giải. '
            'Chương không xuất hiện ở đây là chương không có chú giải trong HS 2022 '
            '(ví dụ Chương 50, 53, 81), riêng **Chương 77 được để trống dự phòng**.')]
        for ch in chs:
            g = [r for r in grp if int(r['chuong']) == ch]
            parts.append(f"\n## Chương {ch:02d} — {g[0]['title_vi']}\n")
            if g[0]['title_en']:
                parts.append(f"*{g[0]['title_en']}*\n")
            for r in g:
                parts.append(block(r))
        p = os.path.join(dest, f'{idx}-chu-giai-chuong-{lo:02d}-{hi}.md')
        open(p, 'w', encoding='utf-8').write('\n'.join(parts) + '\n')
        made.append(p)
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out_dir')
    ap.add_argument('--dest', required=True)
    a = ap.parse_args()
    os.makedirs(a.dest, exist_ok=True)
    notes = load(os.path.join(a.out_dir, 'hs-notes.ndjson'))
    gri = load(os.path.join(a.out_dir, 'hs-gri.ndjson'))
    made = [render_gri(gri, a.dest), render_sections(notes, a.dest)] + render_chapters(notes, a.dest)
    for p in made:
        t = open(p, encoding='utf-8').read()
        print(f'{len(t.split()):>8,} từ  {os.path.getsize(p)/1024:>7.0f} KB  {os.path.basename(p)}')


if __name__ == '__main__':
    main()
