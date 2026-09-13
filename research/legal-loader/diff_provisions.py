"""Article-level diff between two provisions.ndjson extracts.

A reseed is only safe to accept when a person has SEEN what changed, article by article
— the 2026-08-13 lesson is that chương/điều COUNTS stayed green while six headings had
been stolen. So this reports heading, the full body (whitespace-collapsed, compared in
full — not just the first 80 chars, or a change at the END of a long Điều is invisible)
and the khoản number list per Điều, and a count per kind of change.

The report leads with a summary for a human who reads Vietnamese legal text, not code:
§1 every change to read closely, §2 headings that may still be cut off, §3 heading line-wrap
completions to skim; the full per-Điều table stays underneath as Phụ lục. Nothing reassuring
is printed unless it was computed: a heading change is skimmed only when the article's text
provably just moved (`_is_wrap_completion`), and "no text lost" is printed only when
`text_conservation` holds for every document.

    python3 diff_provisions.py <old provisions.ndjson> <new provisions.ndjson> [doc,doc,…] > out/diff-report.md
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict

_KHOAN_START = re.compile(r'^\d+\.\s')
_DIEM_START = re.compile(r'^[a-zđ]\)\s')
_END_PUNCT = '.:;,?!)”"\''
_SUSPECT_MAX_WORDS = 15  # see truncated_heading_suspects


def _normalize(text: str | None) -> str:
    """Whitespace-collapsed full text — every rendered line joined with a single space."""
    return ' '.join((text or '').split())


def _squash(text: str | None) -> str:
    """All whitespace removed — a moved line break must not count as changed text."""
    return ''.join((text or '').split())


def _num_key(dieu: str) -> tuple:
    return int(''.join(ch for ch in dieu if ch.isdigit()) or 0), dieu


def _articles(rows: list[dict]) -> tuple[dict[tuple[str, str], dict], dict[tuple[str, str], list[str]]]:
    khoan: dict[str, list[str]] = defaultdict(list)
    for r in rows:
        if r['ptype'] == 'khoan' and r.get('parent_key'):
            khoan[r['parent_key']].append(str(r['number']))
    out = {}
    seen_headings: dict[tuple[str, str], list[str]] = defaultdict(list)
    for r in rows:
        if r['ptype'] == 'dieu':
            key = (r['document_number'], str(r['number']))
            heading = r.get('heading') or ''
            seen_headings[key].append(heading)
            if key not in out:  # Keep first occurrence
                out[key] = {
                    'heading': heading,
                    'body': _normalize(r.get('body')),
                    'khoan': khoan.get(r['key'], []),
                }
    duplicates = {k: v for k, v in seen_headings.items() if len(v) > 1}
    return out, duplicates


def diff_articles(old_rows: list[dict], new_rows: list[dict]) -> list[dict]:
    old, old_dups = _articles(old_rows)
    new, new_dups = _articles(new_rows)
    diffs: list[dict] = []

    # Process duplicates first
    all_dup_keys = set(old_dups) | set(new_dups)
    for k in sorted(all_dup_keys, key=lambda x: (x[0], *_num_key(x[1]))):
        doc, dieu = k
        old_headings = old_dups.get(k)
        new_headings = new_dups.get(k)
        diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'duplicate', 'old': old_headings, 'new': new_headings})

    # Process regular changes (skip keys that have duplicates)
    all_keys = (set(old) | set(new)) - all_dup_keys
    for k in sorted(all_keys, key=lambda x: (x[0], *_num_key(x[1]))):
        doc, dieu = k
        if k not in new:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'removed', 'old': old[k]['heading'], 'new': None})
            continue
        if k not in old:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'added', 'old': None, 'new': new[k]['heading']})
            continue
        o, n = old[k], new[k]
        # True when the article's heading + body is the same text with whitespace removed, i.e.
        # text only moved between its heading and its body.
        conserved = _squash(o['heading'] + o['body']) == _squash(n['heading'] + n['body'])
        if o['heading'] != n['heading']:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'heading',
                          'old': o['heading'], 'new': n['heading'], 'conserved': conserved})
        if o['khoan'] != n['khoan']:
            diffs.append({'document_number': doc, 'dieu': dieu, 'change': 'khoan', 'old': o['khoan'], 'new': n['khoan']})
        if o['body'] != n['body']:
            old80, new80 = o['body'][:80], n['body'][:80]
            entry = {'document_number': doc, 'dieu': dieu, 'change': 'body',
                      'old': old80, 'new': new80, 'delta': len(n['body']) - len(o['body']),
                      'conserved': conserved}
            if old80 == new80:  # the change is past char 80 — show the tail too, or it's invisible
                entry['old_tail'] = o['body'][-80:]
                entry['new_tail'] = n['body'][-80:]
            diffs.append(entry)
    return diffs


def text_conservation(old_rows: list[dict], new_rows: list[dict]) -> dict[str, bool]:
    """Per document: is the concatenation of every Điều's heading + body, in row order, with all
    whitespace removed, identical old vs new? True means text only moved between headings,
    bodies and articles — no character was lost, added or altered. A document with Điều rows on
    one side only is False."""
    def texts(rows: list[dict]) -> dict[str, str]:
        parts: dict[str, list[str]] = defaultdict(list)
        for r in rows:
            if r['ptype'] == 'dieu':
                parts[r['document_number']].append(_squash(r.get('heading')) + _squash(r.get('body')))
        return {doc: ''.join(p) for doc, p in parts.items()}
    old, new = texts(old_rows), texts(new_rows)
    return {doc: old.get(doc) == new.get(doc) for doc in sorted(set(old) | set(new))}


def _first_body_line(body: str | None) -> str:
    for line in (body or '').split('\n'):
        line = line.strip()
        if line:
            return line
    return ''


def truncated_heading_suspects(rows: list[dict]) -> list[dict]:
    """Điều whose body's first rendered line still reads like a heading tail, not body text.

    Not a khoản (`^\\d+\\.\\s`), not an điểm (`^[a-zđ]\\)\\s`), no sentence-final punctuation,
    and short. "Short" is tuned against the 2026-09 reseed (research/legal-loader/out/): every
    genuine opening line of a body in that corpus runs 14 words or more; every one of the 5
    known cut-off headings runs 15 words or fewer. 15 words as the cutoff catches all 5 plus 3
    extra "cần kiểm tay" rows (8 total) on that data — cheap insurance, not proof a heading is
    cut, so a human still reads the flagged rows.
    ponytail: word-count heuristic tuned on one corpus, not a grammar check — if a future reseed
    pushes the false-positive count past ~15, tighten by requiring the body's first WORD to be
    all-digits or all-uppercase (the two clearest tells among the 5 known cases), accepting that
    narrows recall.
    """
    out = []
    for r in rows:
        if r.get('ptype') != 'dieu':
            continue
        line = _first_body_line(r.get('body'))
        if not line or _KHOAN_START.match(line) or _DIEM_START.match(line):
            continue
        if line[-1] in _END_PUNCT:
            continue
        if len(line.split()) > _SUSPECT_MAX_WORDS:
            continue
        out.append({'document_number': r['document_number'], 'dieu': str(r['number']),
                     'heading': r.get('heading') or '', 'body_start': line})
    out.sort(key=lambda x: (x['document_number'], *_num_key(x['dieu'])))
    return out


def _cell(v) -> str:
    text = ', '.join(v) if isinstance(v, list) else str(v or '—')
    text = text.replace('\n', ' ').replace('|', '/')
    return ' '.join(text.split())


def _is_wrap_completion(d: dict) -> bool:
    """A heading change is a boring line-wrap completion only when the text provably just moved:
    the old heading is non-empty, the new heading starts with it verbatim, and the article's
    heading + body is unchanged with whitespace removed — so the body lost exactly the tail that
    moved up. Anything else (a heading replaced wholesale, e.g. a stolen cross-reference, or a
    completion next to any other edit of the body) is worth a second look."""
    return (d['change'] == 'heading' and bool(d['old']) and (d['new'] or '').startswith(d['old'])
            and d.get('conserved', False))


def render_report(diffs: list[dict], suspects: list[dict] | None = None,
                  conservation: dict[str, bool] | None = None) -> str:
    """`conservation` is `text_conservation(old, new)`; without it the report says text
    conservation was not checked instead of claiming it."""
    suspects = suspects or []
    counts: dict[str, int] = defaultdict(int)
    for d in diffs:
        counts[d['change']] += 1

    # A document whose text changed gets no benefit of the doubt: all of its changes go to §1.
    changed_docs = sorted(doc for doc, same in (conservation or {}).items() if not same)
    # Điều whose heading change is a proven wrap completion: that heading row and the same
    # Điều's body row are skimmed in §3. Every other change goes to §1.
    completed_keys = {(d['document_number'], d['dieu']) for d in diffs
                      if _is_wrap_completion(d) and d['document_number'] not in changed_docs}

    def skimmed(d: dict) -> bool:
        return d['change'] in ('heading', 'body') and (d['document_number'], d['dieu']) in completed_keys

    if not conservation:
        text_line = ('Bảo toàn chữ: CHƯA KIỂM — báo cáo này không đối chiếu nội dung tiêu đề + thân điều '
                     'cũ và mới, nên không khẳng định được là không mất chữ.')
    elif changed_docs:
        text_line = (f"**CẢNH BÁO: chữ trong tiêu đề + thân điều (bỏ khoảng trắng) đã thay đổi ở "
                     f"{len(changed_docs)} văn bản: {', '.join(changed_docs)}. "
                     f"Mọi thay đổi của các văn bản này nằm ở mục 1.**")
    else:
        text_line = 'Không mất chữ: nội dung tiêu đề + thân điều của từng văn bản (bỏ khoảng trắng) giữ nguyên.'

    lines = [
        '# Báo cáo diff theo điều — sinh lại bằng parser hiện tại', '',
        'Tổng: ' + ', '.join(f'{k}: {counts[k]}' for k in ('heading', 'khoan', 'body', 'added', 'removed', 'duplicate')),
        text_line,
        '',
    ]

    # 1. Cần đọc kỹ: everything except a proven wrap completion and its own body row — khoản
    # moves, replaced headings, any other body edit (including a tail-only edit with no heading
    # or khoản signal), added / removed / duplicate Điều, and every change in a document whose
    # text was not conserved.
    important = [d for d in diffs if not skimmed(d)]
    important.sort(key=lambda d: (d['document_number'], *_num_key(d['dieu'])))
    lines += [f'## 1. Cần đọc kỹ ({len(important)} dòng)', '',
              '| Văn bản | Điều | Đổi | Cũ | Mới | Ghi chú |', '|---|---|---|---|---|---|']
    for d in important:
        old_c, new_c, note = d['old'], d['new'], '—'
        if d['change'] == 'body':
            delta = d.get('delta', 0)
            note = f"{'+' if delta >= 0 else ''}{delta} ký tự"
            if 'old_tail' in d:  # first 80 chars identical — the change is at the end
                old_c, new_c = d['old_tail'], d['new_tail']
                note += ', đổi ở cuối điều'
        lines.append(f"| {d['document_number']} | {d['dieu']} | {d['change']} | {_cell(old_c)} | {_cell(new_c)} | {note} |")
    lines.append('')

    # 2. Suspects: headings the parser could not complete (see truncated_heading_suspects).
    lines += [f'## 2. Tiêu đề có thể còn cụt — cần kiểm tay ({len(suspects)} điều)', '',
              '| Văn bản | Điều | Tiêu đề hiện kết thúc bằng | Thân điều mở đầu bằng |', '|---|---|---|---|']
    for s in suspects:
        lines.append(f"| {s['document_number']} | {s['dieu']} | …{_cell(s['heading'][-40:])} | {_cell(s['body_start'][:70])}… |")
    lines.append('')

    # 3. Wrap completions: skim only — the tail simply moved from body to heading.
    completions = sorted((d for d in diffs if d['change'] == 'heading' and skimmed(d)),
                          key=lambda d: (d['document_number'], *_num_key(d['dieu'])))
    lines += [f'## 3. Đọc lướt — tiêu đề bị cắt dòng nay đủ ({len(completions)} tiêu đề)', '',
              'Thân điều của các điều này chỉ bỏ đi đúng phần đuôi đã chuyển lên tiêu đề '
              '(đã đối chiếu từng ký tự tiêu đề + thân điều, bỏ khoảng trắng).', '',
              '| Văn bản | Điều | Phần nối thêm vào tiêu đề |', '|---|---|---|']
    for d in completions:
        tail = (d['new'] or '')[len(d['old'] or ''):].strip()
        lines.append(f"| {d['document_number']} | {d['dieu']} | {_cell(tail)} |")
    lines.append('')

    # Phụ lục: the full per-điều table, as before.
    lines += ['## Phụ lục — bảng chi tiết theo điều', '']
    by_doc: dict[str, list[dict]] = defaultdict(list)
    for d in diffs:
        by_doc[d['document_number']].append(d)
    for doc in sorted(by_doc):
        lines += [f'## {doc}', '', '| Điều | Đổi | Cũ | Mới |', '|---|---|---|---|']
        for d in by_doc[doc]:
            lines.append(f"| {d['dieu']} | {d['change']} | {_cell(d['old'])} | {_cell(d['new'])} |")
        lines.append('')
    return '\n'.join(lines)


def _read(path: str) -> list[dict]:
    return [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]


if __name__ == '__main__':
    old_path, new_path = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None
    old = [r for r in _read(old_path) if not only or r['document_number'] in only]
    new = [r for r in _read(new_path) if not only or r['document_number'] in only]
    print(render_report(diff_articles(old, new), truncated_heading_suspects(new), text_conservation(old, new)))
