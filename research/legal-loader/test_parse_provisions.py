"""Tests for split_articles — the heading / reference / continuation rules.

Every case here is a real corruption seen while building the corpus, kept as a
regression. Each of these rules was paid for once with a bad reseed; none may be
re-lost silently.

    python3 -m unittest discover -s research/legal-loader -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_provisions import split_articles, parse_clauses


class SplitArticles(unittest.TestCase):
    def test_wrapped_heading_is_joined_not_left_in_the_body(self):
        arts = split_articles([
            'Điều 12. Thủ tục hải quan đối với hàng hóa xuất khẩu, nhập',
            'khẩu tại chỗ',
            '1. Hàng hóa xuất khẩu, nhập khẩu tại chỗ gồm:',
        ])
        self.assertEqual(len(arts), 1)
        self.assertEqual(
            arts[0]['heading'],
            'Điều 12. Thủ tục hải quan đối với hàng hóa xuất khẩu, nhập khẩu tại chỗ',
        )
        self.assertEqual(arts[0]['title'],
                         'Thủ tục hải quan đối với hàng hóa xuất khẩu, nhập khẩu tại chỗ')
        self.assertEqual(arts[0]['body_lines'],
                         ['1. Hàng hóa xuất khẩu, nhập khẩu tại chỗ gồm:'])

    def test_a_body_that_genuinely_starts_upper_case_is_not_eaten(self):
        arts = split_articles([
            'Điều 5. Giải thích từ ngữ',
            'Trong Thông tư này, các từ ngữ dưới đây được hiểu như sau:',
        ])
        self.assertEqual(arts[0]['heading'], 'Điều 5. Giải thích từ ngữ')
        self.assertEqual(arts[0]['body_lines'],
                         ['Trong Thông tư này, các từ ngữ dưới đây được hiểu như sau:'])

    def test_a_khoan_is_never_absorbed_into_the_heading(self):
        arts = split_articles(['Điều 7. Khai hải quan', '1. người khai hải quan phải…'])
        self.assertEqual(arts[0]['heading'], 'Điều 7. Khai hải quan')
        self.assertEqual(arts[0]['body_lines'], ['1. người khai hải quan phải…'])

    def test_a_diem_is_never_absorbed_into_the_heading(self):
        arts = split_articles(['Điều 8. Hồ sơ', 'a) tờ khai hải quan;'])
        self.assertEqual(arts[0]['heading'], 'Điều 8. Hồ sơ')
        self.assertEqual(arts[0]['body_lines'], ['a) tờ khai hải quan;'])

    def test_joining_is_bounded_so_it_cannot_eat_a_lower_case_body(self):
        """HEADING_WRAP_MAX lines and no more. The bound is what keeps a body that
        genuinely opens in lower case from being absorbed line after line."""
        arts = split_articles([
            'Điều 3. một tiêu đề rất dài bị ngắt',
            'thành nhiều dòng liên tiếp',
            'và còn dòng nữa',
            'và dòng thứ tư nữa',
            'thân điều thật bắt đầu ở đây',
        ])
        self.assertEqual(
            arts[0]['heading'],
            'Điều 3. một tiêu đề rất dài bị ngắt thành nhiều dòng liên tiếp và còn dòng nữa '
            'và dòng thứ tư nữa',
        )
        self.assertEqual(arts[0]['body_lines'], ['thân điều thật bắt đầu ở đây'])

    def test_a_cross_reference_landing_on_the_next_number_still_does_not_steal(self):
        arts = split_articles([
            'Điều 17. Khai bổ sung',
            'Người khai thực hiện theo quy định tại',
            'Điều 18 Luật Hải quan và lấy mẫu hàng hóa.',
            'Điều 18. Khai hải quan',
            'Nội dung điều 18.',
        ])
        self.assertEqual([a['dieu_num'] for a in arts], ['17', '18'])
        self.assertEqual(arts[1]['heading'], 'Điều 18. Khai hải quan')

    def test_a_footer_line_never_joins_the_heading(self):
        arts = split_articles([
            'Điều 4. Nguyên tắc quản lý',
            'CÔNG BÁO/Số 913 + 914/Ngày 20-8-2018',
            '1. Nội dung khoản một.',
        ])
        self.assertEqual(arts[0]['heading'], 'Điều 4. Nguyên tắc quản lý')

    def test_a_repealed_article_keeps_its_marker_and_drops_the_footnote(self):
        """Real case: Điều 40 of 25/VBHN-BTC. The heading is complete at the marker;
        the line under it is the amending circular's footnote, and joining it replaced
        a clean label with a paragraph."""
        arts = split_articles([
            'Điều 40. (được bãi bỏ)',
            'ngày 20 tháng 4 năm 2018 của Bộ trưởng Bộ Tài chính sửa đổi, bổ sung một số điều',
            'tại Thông tư số 38/2015/TT-BTC.',
        ])
        self.assertEqual(arts[0]['heading'], 'Điều 40. (được bãi bỏ)')
        self.assertEqual(len(arts[0]['body_lines']), 2)

    def test_the_heading_of_the_last_article_may_wrap_at_end_of_input(self):
        arts = split_articles([
            'Điều 9. Điều khoản thi hành đối với hàng hóa quá',
            'cảnh',
        ])
        self.assertEqual(arts[0]['heading'],
                         'Điều 9. Điều khoản thi hành đối với hàng hóa quá cảnh')
        self.assertEqual(arts[0]['body_lines'], [])


class ParseClauses(unittest.TestCase):
    def test_a_thousands_group_after_the_period_is_money_not_a_clause(self):
        # 46/VBHN-BTC Điều 10, inside điểm d of khoản 4: the PDF wraps the amount onto
        # its own line and the old regex read "20.000 tờ khai/năm." as khoản 20.
        chapeau, khoan = parse_clauses([
            '4. Điều kiện:',
            'd) Đại lý thủ tục hải quan: số tờ khai làm thủ tục hải quan trong năm đạt',
            '20.000 tờ khai/năm.',
            '5. Không áp dụng điều kiện kim ngạch.',
        ])
        self.assertEqual([k['num'] for k in khoan], ['4', '5'])
        self.assertIn('20.000 tờ khai/năm.', khoan[0]['lines'])

    def test_a_plain_clause_number_still_opens_a_clause(self):
        _, khoan = parse_clauses(['1. Người khai hải quan phải…', '2. Cơ quan hải quan…'])
        self.assertEqual([k['num'] for k in khoan], ['1', '2'])

    def test_a_fused_two_digit_footnote_is_still_tolerated(self):
        # "1.33 …" = khoản 1 + footnote 33 fused by the PDF render (comment above KHOAN).
        _, khoan = parse_clauses(['1.33 Hàng hóa xuất khẩu…'])
        self.assertEqual([k['num'] for k in khoan], ['1'])


if __name__ == '__main__':
    unittest.main()
