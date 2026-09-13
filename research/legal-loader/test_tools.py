"""diff_provisions / merge_into_seed are the two places a reseed can silently go wrong:
a diff that hides a change, or a merge that drops the other documents. Both are pure."""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from diff_provisions import diff_articles, render_report, text_conservation, truncated_heading_suspects
from merge_into_seed import main as merge_main, merge_rows, select_documents


def rows(doc, dieu, heading, body, khoan):
    key = f'{doc}::dieu-{dieu}'
    out = [{'document_number': doc, 'key': key, 'parent_key': None, 'ptype': 'dieu',
            'number': str(dieu), 'heading': heading, 'body': body}]
    for k in khoan:
        out.append({'document_number': doc, 'key': f'{key}-khoan-{k}', 'parent_key': key,
                    'ptype': 'khoan', 'number': str(k), 'heading': None, 'body': f'khoản {k}'})
    return out


def section(text, start, end):
    return text[text.index(start):text.index(end)]


class DiffArticles(unittest.TestCase):
    def test_reports_a_changed_heading_and_a_changed_clause_list(self):
        old = rows('46/VBHN-BTC', 10, 'Điều 10. Điều kiện', 'a', [1, 2, 3, 4, 20, 5, 6])
        new = rows('46/VBHN-BTC', 10, 'Điều 10. Điều kiện', 'a', [1, 2, 3, 4, 5, 6])
        d = diff_articles(old, new)
        self.assertEqual([x['change'] for x in d], ['khoan'])
        self.assertEqual(d[0]['old'], ['1', '2', '3', '4', '20', '5', '6'])
        self.assertEqual(d[0]['new'], ['1', '2', '3', '4', '5', '6'])

    def test_reports_heading_body_added_and_removed(self):
        old = rows('25/VBHN-BTC', 18, 'Điều 18 Luật Hải quan và lấy mẫu', 'x', [1]) + rows('25/VBHN-BTC', 19, 'Điều 19. A', 'y', [])
        new = rows('25/VBHN-BTC', 18, 'Điều 18. Khai hải quan', 'x2', [1]) + rows('25/VBHN-BTC', 20, 'Điều 20. B', 'z', [])
        kinds = sorted(x['change'] for x in diff_articles(old, new))
        self.assertEqual(kinds, ['added', 'body', 'heading', 'removed'])

    def test_identical_input_is_an_empty_diff(self):
        r = rows('31/2018/NĐ-CP', 1, 'Điều 1. Phạm vi', 'b', [1, 2])
        self.assertEqual(diff_articles(r, list(r)), [])

    def test_report_counts_each_kind(self):
        old = rows('D', 1, 'Điều 1. A', 'a', [1]) + rows('D', 2, 'Điều 2. B', 'b', [1])
        new = rows('D', 1, 'Điều 1. A2', 'a', [1]) + rows('D', 2, 'Điều 2. B', 'b', [1, 2])
        text = render_report(diff_articles(old, new))
        self.assertIn('heading: 1', text)
        self.assertIn('khoan: 1', text)
        self.assertIn('## D', text)

    def test_render_report_escapes_newlines_and_pipes_in_body_text(self):
        old = rows('D', 1, 'Điều 1. A', 'line1|old', [])
        new = rows('D', 1, 'Điều 1. A', 'line1\nline2|new', [])
        text = render_report(diff_articles(old, new))
        # The report has several markdown tables (summary sections + the Phụ lục appendix),
        # each with its own column count — group consecutive '|'-prefixed lines into blocks
        # and check each block is internally well-formed.
        blocks: list[list[str]] = []
        current: list[str] = []
        for line in text.split('\n'):
            if line.startswith('|'):
                current.append(line)
            elif current:
                blocks.append(current)
                current = []
        if current:
            blocks.append(current)
        self.assertTrue(blocks)
        for block in blocks:
            pipe_counts = [l.count('|') for l in block]
            self.assertEqual(len(set(pipe_counts)), 1, f"Inconsistent pipe counts in block: {block}")
        # No physical newline leaked into a cell, and pipes inside body text are escaped.
        self.assertNotIn('line1\nline2', text)
        self.assertIn('line1/old', text)
        self.assertIn('line1 line2/new', text)

    def test_body_change_past_char_80_is_detected_with_a_tail_snippet(self):
        # 33/2023/TT-BTC Điều 19 shape: the first 80 chars of the body are unchanged, only the
        # tail — comparing body80 alone makes this diff invisible.
        prefix = 'x' * 90
        old_body = prefix + ' theo quy định tại'
        new_body = prefix + ' theo quy định tại Điều 20 Thông tư này.'
        old = rows('D', 19, 'Điều 19. A', old_body, [])
        new = rows('D', 19, 'Điều 19. A', new_body, [])
        d = diff_articles(old, new)
        self.assertEqual([x['change'] for x in d], ['body'])
        entry = d[0]
        self.assertEqual(entry['old'], entry['new'])  # first 80 chars identical
        self.assertEqual(entry['delta'], len(new_body) - len(old_body))
        self.assertIn('old_tail', entry)
        self.assertTrue(entry['new_tail'].endswith('Điều 20 Thông tư này.'))
        # and it must show up in the report even though it never touches the first 80 chars
        text = render_report(d)
        self.assertIn('Điều 20 Thông tư này.', text)
        self.assertIn('## 1. Cần đọc kỹ (1 dòng)', text)

    def test_render_report_summary_sections_appear_in_order_with_counts(self):
        old = rows('D', 1, 'Điều 1 tham chiếu lạ', 'a', [1]) + rows('D', 2, 'Điều 2. B', 'b', [1])
        new = rows('D', 1, 'Điều 1. Tên đúng', 'a2', [1]) + rows('D', 2, 'Điều 2. B', 'b', [1, 2])
        diffs = diff_articles(old, new)
        suspects = [{'document_number': 'D', 'dieu': '3', 'heading': 'Điều 3. X', 'body_start': 'Y'}]
        text = render_report(diffs, suspects)
        markers = ['Tổng:', 'Bảo toàn chữ', '## 1. Cần đọc kỹ', '## 2. Tiêu đề có thể còn cụt',
                   '## 3. Đọc lướt', '## Phụ lục']
        for m in markers:
            self.assertIn(m, text)
        self.assertEqual([text.index(m) for m in markers], sorted(text.index(m) for m in markers))
        # Điều 1's heading was replaced wholesale (new doesn't start with old), so it's not a
        # wrap completion -> its own body change also has no explanation elsewhere and lands
        # in §1 too, alongside the heading row and Điều 2's khoản change (3 rows). Neither
        # Điều is a wrap completion, so section 3 is empty.
        self.assertIn('## 1. Cần đọc kỹ (3 dòng)', text)
        self.assertIn('## 2. Tiêu đề có thể còn cụt — cần kiểm tay (1 điều)', text)
        self.assertIn('## 3. Đọc lướt — tiêu đề bị cắt dòng nay đủ (0 tiêu đề)', text)

    def test_render_report_with_only_diffs_says_conservation_was_not_checked(self):
        old = rows('D', 1, 'Điều 1. A', 'a', [1])
        new = rows('D', 1, 'Điều 1. A', 'a2', [1])
        text = render_report(diff_articles(old, new))  # suspects and conservation omitted
        self.assertIn('## 2. Tiêu đề có thể còn cụt — cần kiểm tay (0 điều)', text)
        self.assertIn('Bảo toàn chữ: CHƯA KIỂM', text)
        self.assertNotIn('Không mất chữ', text)

    def test_completion_whose_body_lost_more_than_the_moved_tail_is_in_section_1(self):
        # The heading gained "xuất khẩu" from the body, but the body also lost "phải".
        old = rows('D', 5, 'Điều 5. Thủ tục đối với hàng hóa', 'xuất khẩu\n1. Người khai phải nộp hồ sơ.', [])
        new = rows('D', 5, 'Điều 5. Thủ tục đối với hàng hóa xuất khẩu', '1. Người khai nộp hồ sơ.', [])
        text = render_report(diff_articles(old, new))
        s1 = section(text, '## 1. Cần đọc kỹ', '## 2.')
        self.assertIn('| D | 5 | heading |', s1)
        self.assertIn('| D | 5 | body |', s1)
        self.assertIn('(0 tiêu đề)', section(text, '## 3.', '## Phụ lục'))

    def test_completion_from_an_empty_old_heading_does_not_explain_a_body_change(self):
        # The text only moved (conserved), but "" is a prefix of everything — not a completion.
        old = rows('D', 5, '', 'Điều 5. Thủ tục\n1. Nội dung.', [])
        new = rows('D', 5, 'Điều 5. Thủ tục', '1. Nội dung.', [])
        text = render_report(diff_articles(old, new))
        s1 = section(text, '## 1. Cần đọc kỹ', '## 2.')
        self.assertIn('| D | 5 | heading |', s1)
        self.assertIn('| D | 5 | body |', s1)
        self.assertIn('(0 tiêu đề)', section(text, '## 3.', '## Phụ lục'))

    def test_text_not_conserved_warns_and_puts_every_change_of_that_document_in_section_1(self):
        # D: Điều 1 is a clean wrap completion, but Điều 2 lost a sentence, so D's text changed.
        old = rows('D', 1, 'Điều 1. Phạm vi điều', 'chỉnh\nNội dung.', []) + rows('D', 2, 'Điều 2. B', 'Hai câu. Câu mất.', [])
        new = rows('D', 1, 'Điều 1. Phạm vi điều chỉnh', 'Nội dung.', []) + rows('D', 2, 'Điều 2. B', 'Hai câu.', [])
        # E: only a clean wrap completion, text conserved.
        old += rows('E', 1, 'Điều 1. Đối tượng áp', 'dụng\nNội dung.', [])
        new += rows('E', 1, 'Điều 1. Đối tượng áp dụng', 'Nội dung.', [])
        conservation = text_conservation(old, new)
        self.assertEqual(conservation, {'D': False, 'E': True})
        text = render_report(diff_articles(old, new), None, conservation)
        self.assertNotIn('Không mất chữ', text)
        self.assertIn('**CẢNH BÁO: chữ trong tiêu đề + thân điều (bỏ khoảng trắng) đã thay đổi ở 1 văn bản: D.', text)
        s1 = section(text, '## 1. Cần đọc kỹ', '## 2.')
        for row in ('| D | 1 | heading |', '| D | 1 | body |', '| D | 2 | body |'):
            self.assertIn(row, s1)
        self.assertNotIn('| E |', s1)
        s3 = section(text, '## 3.', '## Phụ lục')
        self.assertIn('| E | 1 |', s3)
        self.assertNotIn('| D |', s3)

    def test_text_conserved_prints_the_no_text_lost_line_and_skims_the_completion(self):
        old = rows('D', 1, 'Điều 1. Phạm vi điều', 'chỉnh\nNội dung.', [])
        new = rows('D', 1, 'Điều 1. Phạm vi điều chỉnh', 'Nội dung.', [])
        text = render_report(diff_articles(old, new), None, text_conservation(old, new))
        self.assertIn('Không mất chữ: nội dung tiêu đề + thân điều của từng văn bản (bỏ khoảng trắng) giữ nguyên.', text)
        self.assertNotIn('CẢNH BÁO', text)
        self.assertIn('## 1. Cần đọc kỹ (0 dòng)', text)
        self.assertIn('| D | 1 | chỉnh |', section(text, '## 3.', '## Phụ lục'))

    def test_added_removed_and_duplicate_entries_always_appear_in_section_1(self):
        # An added/removed/duplicate Điều is exactly the class of change this tool exists to
        # surface (see the module docstring), so it belongs in "Cần đọc kỹ" unconditionally,
        # never only in the Phụ lục appendix.
        old = (rows('D', 1, 'Điều 1. A', 'a', [])          # removed: absent from new
               + rows('D', 2, 'Điều 2. Dup', 'x', [])       # duplicate key on the old side
               + rows('D', 2, 'Điều 2. Dup2', 'x', []))
        new = (rows('D', 2, 'Điều 2. New', 'y', [])         # same duplicated key, one row now
               + rows('D', 3, 'Điều 3. B', 'b', []))        # added: absent from old
        d = diff_articles(old, new)
        self.assertEqual(sorted(x['change'] for x in d), ['added', 'duplicate', 'removed'])

        text = render_report(d)
        start = text.index('## 1. Cần đọc kỹ')
        end = text.index('## 2. Tiêu đề có thể còn cụt')
        section1 = text[start:end]
        self.assertIn('| D | 3 | added |', section1)
        self.assertIn('| D | 1 | removed |', section1)
        self.assertIn('| D | 2 | duplicate |', section1)
        self.assertIn('## 1. Cần đọc kỹ (3 dòng)', text)
        # and they are still in the appendix too (added/removed/duplicate were never removed
        # from there — §1 is additive, not a replacement for the full detail table)
        self.assertIn('| 3 | added |', text[text.index('## Phụ lục'):])
        self.assertIn('| 1 | removed |', text[text.index('## Phụ lục'):])
        self.assertIn('| 2 | duplicate |', text[text.index('## Phụ lục'):])

    def test_duplicate_dieu_rows_are_detected_and_reported(self):
        # Two rows with same key on old side
        old = rows('D', 1, 'Điều 1. Original', 'a', [1]) + rows('D', 1, 'Điều 1. Duplicate', 'a', [1])
        new = rows('D', 1, 'Điều 1. New', 'a', [1])
        d = diff_articles(old, new)
        # Should have a duplicate entry
        duplicates = [x for x in d if x['change'] == 'duplicate']
        self.assertEqual(len(duplicates), 1)
        self.assertEqual(duplicates[0]['old'], ['Điều 1. Original', 'Điều 1. Duplicate'])
        self.assertEqual(duplicates[0]['new'], None)
        # Report should show duplicate count
        text = render_report(d)
        self.assertIn('duplicate: 1', text)


class TruncatedHeadingSuspects(unittest.TestCase):
    def test_flags_a_place_name_split_across_the_line_break(self):
        # 54/VBHN-VPQH Điều 55: heading ends "...đồng Việt", body opens "Nam tiền mặt...".
        r = rows('54/VBHN-VPQH', 55,
                 'Điều 55. Kiểm tra, giám sát hải quan đối với ngoại tệ tiền mặt, đồng Việt',
                 'Nam tiền mặt, công cụ chuyển nhượng, vàng, kim loại quý, đá quý của người\n'
                 'xuất cảnh, nhập cảnh', [])
        s = truncated_heading_suspects(r)
        self.assertEqual([(x['document_number'], x['dieu']) for x in s], [('54/VBHN-VPQH', '55')])
        self.assertTrue(s[0]['body_start'].startswith('Nam tiền mặt'))

    def test_flags_a_digit_tail(self):
        # 54/VBHN-VPQH Điều 101: heading ends "...Luật Quản lý thuế số", body opens the number.
        r = rows('54/VBHN-VPQH', 101,
                 'Điều 101. Sửa đổi, bổ sung một số điều của Luật Quản lý thuế số',
                 '78/2006/QH11 đã được sửa đổi, bổ sung một số điều theo Luật số\n21/2012/QH13', [])
        s = truncated_heading_suspects(r)
        self.assertEqual([(x['document_number'], x['dieu']) for x in s], [('54/VBHN-VPQH', '101')])
        self.assertTrue(s[0]['body_start'].startswith('78/2006/QH11'))

    def test_does_not_flag_a_khoan_opening(self):
        r = rows('D', 1, 'Điều 1. A', '1. Người khai hải quan phải khai đầy đủ các thông tin.', [])
        self.assertEqual(truncated_heading_suspects(r), [])

    def test_does_not_flag_a_chapeau_ending_in_colon(self):
        r = rows('D', 1, 'Điều 1. Giải thích từ ngữ',
                 'Trong Thông tư này, các từ ngữ dưới đây được hiểu như sau:', [])
        self.assertEqual(truncated_heading_suspects(r), [])


def write_ndjson(path, rows):
    path.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in rows), encoding='utf-8')


def read_ndjson(path):
    return [json.loads(l) for l in path.read_text(encoding='utf-8').splitlines() if l.strip()]


class MergeRows(unittest.TestCase):
    def test_replaces_only_the_named_documents_and_keeps_the_rest(self):
        existing = [{'document_number': 'A', 'v': 1}, {'document_number': 'B', 'v': 1}]
        incoming = [{'document_number': 'A', 'v': 2}]
        out = merge_rows(existing, incoming, 'document_number', {'A'})
        self.assertEqual(out, [{'document_number': 'B', 'v': 1}, {'document_number': 'A', 'v': 2}])

    def test_drops_incoming_rows_outside_the_replace_set(self):
        existing = [{'document_number': 'A', 'v': 1}, {'document_number': 'B', 'v': 1}]
        incoming = [{'document_number': 'A', 'v': 2}, {'document_number': 'B', 'v': 2}]
        out = merge_rows(existing, incoming, 'document_number', {'A'})
        self.assertEqual(out, [{'document_number': 'B', 'v': 1}, {'document_number': 'A', 'v': 2}])

    def test_only_merges_the_subset_without_duplicates_and_marks_only_the_subset(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, dst = Path(tmp, 'out'), Path(tmp, 'seed')
            src.mkdir()
            dst.mkdir()
            write_ndjson(src / 'documents.ndjson', [{'number': 'A', 'v': 2}, {'number': 'B', 'v': 2}])
            old_docs = [{'number': 'A', 'v': 1, 'verification': 'verified', 'verified_by': 'Cũ'},
                        {'number': 'B', 'v': 1, 'verification': 'verified', 'verified_by': 'Cũ'},
                        {'number': 'G', 'v': 1, 'verification': 'auto_unverified', 'verified_by': None}]
            write_ndjson(dst / 'documents.ndjson', old_docs)
            for name in ('provisions.ndjson', 'chunks.ndjson'):
                write_ndjson(src / name, [{'document_number': 'A', 'v': 2}, {'document_number': 'B', 'v': 2}])
                write_ndjson(dst / name, [{'document_number': d, 'v': 1} for d in ('A', 'B', 'G')])

            with contextlib.redirect_stdout(io.StringIO()):
                merge_main(['--from', str(src), '--into', str(dst), '--only', 'A', '--unverified'])

            docs = {d['number']: d for d in read_ndjson(dst / 'documents.ndjson')}
            self.assertEqual(len(read_ndjson(dst / 'documents.ndjson')), 3)
            self.assertEqual(docs['A'], {'number': 'A', 'v': 2, 'verification': 'auto_unverified', 'verified_by': None})
            self.assertEqual(docs['B'], old_docs[1])
            self.assertEqual(docs['G'], old_docs[2])
            for name in ('provisions.ndjson', 'chunks.ndjson'):
                self.assertEqual(sorted((r['document_number'], r['v']) for r in read_ndjson(dst / name)),
                                 [('A', 2), ('B', 1), ('G', 1)])

    def test_select_documents_defaults_to_all_and_rejects_unknown_numbers(self):
        self.assertEqual(select_documents({'A', 'B'}, None), {'A', 'B'})
        self.assertEqual(select_documents({'A', 'B'}, ' B ,'), {'B'})
        with self.assertRaises(ValueError) as e:
            select_documents({'A', 'B'}, 'A,25/VBHN-BTX')
        self.assertIn('25/VBHN-BTX', str(e.exception))
        with self.assertRaises(ValueError):
            select_documents({'A'}, ' , ')


if __name__ == '__main__':
    unittest.main()
