"""Trích MÔ TẢ hàng hoá phân cấp cho mỗi mã HS8 từ ND 26/2023 (.doc Công báo).

Bản nạp gốc (TASK-008) chỉ giữ mô tả LÁ ("- - - - Loại khác") — vô nghĩa nếu đứng
một mình. Ở đây ta khôi phục ngữ cảnh cha để mỗi mã có mô tả người-đọc-hiểu:

  84.81      Vòi, van và các thiết bị tương tự…      (tiêu đề NHÓM 4 số)
    8481.80    - Thiết bị khác
      8481.80.99  - - - - Loại khác                  (lá)
  => path: "Vòi, van và các thiết bị tương tự… › Thiết bị khác › … › Loại khác"

Mã (4/6/8 số) và mô tả nằm ở hai ô kề nhau; các dòng gạch ("- -") không có mã là
mức phân cấp trung gian. Ta theo một "stack theo độ sâu gạch" để dựng đường dẫn.

    python3 extract_descriptions.py doc/ --emit hs-descriptions.ndjson
"""
import glob
import json
import os
import re
import subprocess
import sys

HEAD4 = re.compile(r'^\d{2}\.\d{2}$')       # 84.81
HEAD6 = re.compile(r'^\d{4}\.\d{2}$')       # 8481.80
HS8 = re.compile(r'^\d{4}\.\d{2}\.\d{2}$')  # 8481.80.99
DASH = re.compile(r'^((?:-\s*)+)(.*)$')


def doc_cells(path):
    out = subprocess.run(['textutil', '-stdout', '-convert', 'txt', path],
                         capture_output=True, check=True).stdout.decode('utf-8', 'replace')
    return [t.strip() for t in re.split(r'[\x07\n]', out)]


def part_num(p):
    m = re.search(r'_(\d+)\.doc$', p)
    return int(m.group(1)) if m else 0


def split_dash(s):
    """('- - - Loại khác') -> (depth=3, 'Loại khác'); ('Van giảm áp') -> (0, ...)."""
    m = DASH.match(s)
    if not m:
        return 0, s.strip().rstrip(':').strip()
    return m.group(1).count('-'), m.group(2).strip().rstrip(':').strip()


def extract(doc_dir):
    parts = sorted(glob.glob(os.path.join(doc_dir, '*.doc')), key=part_num)
    cells = []
    for p in parts:
        cells.extend(doc_cells(p))

    heading_title = ''
    stack = {}  # depth -> text (mức phân cấp trung gian hiện hành)
    rows = {}
    i, n = 0, len(cells)

    def next_nonempty(j):
        while j < n and cells[j] == '':
            j += 1
        return j

    while i < n:
        c = cells[i]
        if HEAD4.match(c):
            j = next_nonempty(i + 1)
            heading_title = cells[j] if j < n else ''
            stack = {}
            i = j + 1
            continue
        if HEAD6.match(c) or HS8.match(c):
            j = next_nonempty(i + 1)
            depth, text = split_dash(cells[j]) if j < n else (0, '')
            depth = depth or 1
            for k in list(stack):
                if k >= depth:
                    del stack[k]
            if HS8.match(c):
                parts_desc = [heading_title] + [stack[k] for k in sorted(stack)] + [text]
                path = ' › '.join(p for p in parts_desc if p)
                hs = c.replace('.', '')
                rows.setdefault(hs, {'hs': hs, 'heading': heading_title, 'desc': text, 'path': path})
            else:
                stack[depth] = text
            i = j + 1
            continue
        # Dòng gạch không kèm mã = mức phân cấp trung gian → cập nhật stack.
        if c.startswith('-'):
            depth, text = split_dash(c)
            if depth:
                for k in list(stack):
                    if k >= depth:
                        del stack[k]
                stack[depth] = text
        i += 1
    return list(rows.values())


if __name__ == '__main__':
    rows = extract(sys.argv[1])
    print(f'{len(rows)} mã HS8 có mô tả')
    for hs in ['84818099', '03011110', '27101221', '87032391']:
        r = next((x for x in rows if x['hs'] == hs), None)
        print(f'  {hs}: {r["path"] if r else "MISSING"}')
    if '--emit' in sys.argv:
        out = sys.argv[sys.argv.index('--emit') + 1]
        with open(out, 'w', encoding='utf-8') as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        print(f'wrote -> {out}')
