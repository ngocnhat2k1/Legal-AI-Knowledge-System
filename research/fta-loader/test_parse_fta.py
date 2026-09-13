"""Tests for parse_cells — the cell walk that turns a Công báo FTA biểu into rows.

The ACFTA biểu (ND 118/2022) has a per-line column "Nước không được hưởng ưu đãi".
Dropping it served 0% to China-origin goods the decree excludes. FTA decrees also
detail some 8-digit codes into 10-digit national sub-lines whose rates differ; the
8-digit parent row has no rate of its own. Every case here guards one way a column,
a sub-line or a whole table can be lost, mis-attached, or leak into another row.

    python3 -m unittest discover -s research/fta-loader -p 'test_*.py'
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_fta import parse_cells


class ExclusionColumn(unittest.TestCase):
    def test_exclusion_cell_after_the_rate_is_captured_sorted(self):
        rows = parse_cells(['0901.11.20', '- - - Arabica', '0', 'MM, TH, CN',
                            '0901.11.30', '- - - Robusta', '0', ''], 1)
        self.assertEqual(rows[0], {'hs': '09011120', 'hs_dotted': '0901.11.20', 'desc': '- - - Arabica',
                                   'rates': ['0'], 'excluded': ['CN', 'MM', 'TH']})
        self.assertEqual(rows[1], {'hs': '09011130', 'hs_dotted': '0901.11.30', 'desc': '- - - Robusta',
                                   'rates': ['0']})

    def test_a_description_that_looks_like_codes_is_not_an_exclusion(self):
        rows = parse_cells(['1234.56.78', 'CN', '5', '',
                            '1234.56.79', '- - Loại khác', '5', 'TH',
                            '1234.56.80', '- - Khác', '0', 'EU'], 1)
        self.assertEqual(len(rows), 3)
        self.assertEqual((rows[0]['desc'], rows[0]['rates']), ('CN', ['5']))
        self.assertNotIn('excluded', rows[0])
        self.assertEqual(rows[1]['excluded'], ['TH'])
        self.assertNotIn('excluded', rows[2])  # EU is not a code of ND 118 Điều 4 khoản 2

    def test_star_is_still_a_rate_not_an_exclusion(self):
        rows = parse_cells(['0101.21.00', '- - Thuần chủng', '*', 'CN',
                            '0101.29.00', '- - Loại khác', '*', ''], 1)
        self.assertEqual((rows[0]['rates'], rows[0]['excluded']), (['*'], ['CN']))
        self.assertEqual(rows[1]['rates'], ['*'])
        self.assertNotIn('excluded', rows[1])


class TenDigitSubLines(unittest.TestCase):
    # ND 118/2022 (ACFTA), verbatim cells: the parent has a description and two empty cells.
    ACFTA = ['1601.00.10', '- Đóng bao bì kín khí để bán lẻ:', '', '',
             '1601.00.10.10', '- - Từ côn trùng', '0', 'KH',
             '1601.00.10.90', '- - Loại khác', '5', '',
             '1601.00.90', '- Loại khác:', '0', '']

    def test_parent_has_no_rate_of_its_own_and_carries_every_sub_line(self):
        rows = parse_cells(self.ACFTA, 1)
        self.assertEqual([r['hs'] for r in rows], ['16010010', '16010090'])
        self.assertEqual(rows[0], {
            'hs': '16010010', 'hs_dotted': '1601.00.10', 'desc': '- Đóng bao bì kín khí để bán lẻ:', 'rates': [],
            'sublines': [
                {'hs10': '1601001010', 'hs_dotted': '1601.00.10.10', 'desc': '- - Từ côn trùng',
                 'rates': ['0'], 'excluded': ['KH']},
                {'hs10': '1601001090', 'hs_dotted': '1601.00.10.90', 'desc': '- - Loại khác',
                 'rates': ['5'], 'excluded': []},
            ]})
        self.assertEqual(rows[1], {'hs': '16010090', 'hs_dotted': '1601.00.90', 'desc': '- Loại khác:', 'rates': ['0']})

    def test_sub_line_exclusion_is_never_applied_to_the_whole_line(self):
        self.assertNotIn('excluded', parse_cells(self.ACFTA, 1)[0])

    def test_an_origin_excluded_on_every_sub_line_is_excluded_on_the_whole_line(self):
        # ND 118, 4011.80.31: .10 excludes ID, MY and the residual .90 "Loại khác" excludes ID,
        # so every good of the 8-digit line is excluded for ID; MY only on .10.
        rows = parse_cells(['4011.80.31', '- - - Loại khác', '',
                            '4011.80.31.10', '- - - - Có hoa lốp hình chữ chi', '0', 'ID, MY',
                            '4011.80.31.90', '- - - - Loại khác', '0', 'ID',
                            '4011.80.39', '- - - Loại khác', '0', ''], 1)
        self.assertEqual(rows[0]['excluded'], ['ID'])
        self.assertEqual([s['excluded'] for s in rows[0]['sublines']], [['ID', 'MY'], ['ID']])
        self.assertNotIn('excluded', rows[1])

    def test_aanzfta_parent_without_exclusion_column(self):
        # ND 121/2022, verbatim: one empty cell after the parent, sub-line = code, desc, rate.
        rows = parse_cells(['0307.22.00', '- - Đông lạnh:', '',
                            '0307.22.00.10', '- - - Điệp, kể cả Điệp nữ hoàng', '0',
                            '0307.22.00.90', '- - - Loại khác', '5',
                            '0307.29.10', '- - - Loại khác', '10'], 1)
        self.assertEqual(rows[0]['rates'], [])
        self.assertEqual([(s['hs_dotted'], s['rates'], s['excluded']) for s in rows[0]['sublines']],
                         [('0307.22.00.10', ['0'], []), ('0307.22.00.90', ['5'], [])])
        self.assertEqual(rows[1], {'hs': '03072910', 'hs_dotted': '0307.29.10', 'desc': '- - - Loại khác', 'rates': ['10']})

    def test_evfta_yearly_sub_lines_keep_six_rates_each(self):
        # ND 116/2022 Phụ lục II, verbatim: parent with seven empty cells, six yearly rates per sub-line.
        rows = parse_cells(['1508.90.00', '- Loại khác:', '', '', '', '', '', '', '',
                            '1508.90.00.10', '- - Các phần phân đoạn của dầu lạc chưa tinh chế',
                            '3,6', '3,1', '2,7', '2,2', '1,8', '1,3', '',
                            '1508.90.00.90', '- - Loại khác', '18,1', '15,9', '13,6', '11,3', '9', '6,8', '',
                            '1509.20.00', '- Dầu ô liu', '0', '0', '0', '0', '0', '0', ''], 6)
        self.assertEqual([s['rates'] for s in rows[0]['sublines']],
                         [['3,6', '3,1', '2,7', '2,2', '1,8', '1,3'], ['18,1', '15,9', '13,6', '11,3', '9', '6,8']])
        self.assertEqual(rows[1]['rates'], ['0'] * 6)
        self.assertNotIn('sublines', rows[1])

    def test_an_unnumbered_heading_between_sub_lines_prefixes_their_description(self):
        # ND 116/2022 Phụ lục II, 4011.70.00 verbatim: two unnumbered headings group four sub-lines;
        # without them ".19 - - - Loại khác" and ".99 - - - Loại khác" would read the same.
        cells = ['4011.70.00', '- Loại dùng cho xe và máy nông nghiệp hoặc lâm nghiệp:', '', '', '', '', '', '', '', '',
                 '- - Loại có hoa lốp hình chữ chi hoặc tương tự:', '', '', '', '', '', '', '',
                 '4011.70.00.11', '- - - Loại dùng cho máy kéo nông nghiệp', '9,3', '7,5', '5,6', '3,7', '1,8', '0', '',
                 '4011.70.00.19', '- - - Loại khác', '12,5', '10', '7,5', '5', '2,5', '0', '', '',
                 '- - Loại khác:', '', '', '', '', '', '', '',
                 '4011.70.00.91', '- - - Loại dùng cho máy kéo, máy thuộc phân nhóm 84.29 hoặc 84.30 hoặc xe cút kít',
                 '7,5', '5', '2,5', '0', '0', '0', '',
                 '4011.70.00.99', '- - - Loại khác', '10', '6,6', '3,3', '0', '0', '0', '',
                 '4011.80', '- Loại dùng cho xe và máy xây dựng, khai thác mỏ hoặc xếp dỡ công nghiệp:', '', '', '']
        rows = parse_cells(cells, 6)
        self.assertEqual([(r['hs_dotted'], r['desc'], r['rates']) for r in rows],
                         [('4011.70.00', '- Loại dùng cho xe và máy nông nghiệp hoặc lâm nghiệp:', [])])
        self.assertEqual([(s['hs_dotted'], s['desc'], s['rates']) for s in rows[0]['sublines']], [
            ('4011.70.00.11', '- - Loại có hoa lốp hình chữ chi hoặc tương tự: - - - Loại dùng cho máy kéo nông nghiệp',
             ['9,3', '7,5', '5,6', '3,7', '1,8', '0']),
            ('4011.70.00.19', '- - Loại có hoa lốp hình chữ chi hoặc tương tự: - - - Loại khác',
             ['12,5', '10', '7,5', '5', '2,5', '0']),
            ('4011.70.00.91', '- - Loại khác: - - - Loại dùng cho máy kéo, máy thuộc phân nhóm 84.29 hoặc 84.30 hoặc xe cút kít',
             ['7,5', '5', '2,5', '0', '0', '0']),
            ('4011.70.00.99', '- - Loại khác: - - - Loại khác', ['10', '6,6', '3,3', '0', '0', '0']),
        ])

    def test_a_heading_does_not_prefix_a_sub_line_at_its_own_level(self):
        rows = parse_cells(['1234.56.00', '- Parent:', '',
                            '- - Group:', '',
                            '1234.56.00.11', '- - - In group', '1',
                            '1234.56.00.90', '- - Loại khác', '2'], 1)
        self.assertEqual([s['desc'] for s in rows[0]['sublines']], ['- - Group: - - - In group', '- - Loại khác'])

    def test_stray_text_before_the_first_sub_line_fails_even_with_a_later_heading(self):
        # A heading between later sub-lines must not widen the allowance for the parent's own text.
        with self.assertRaises(ValueError):
            parse_cells(['1234.56.00', '- Parent:', 'NOTE TEXT', '',
                         '1234.56.00.10', '- - a', '1',
                         '- - H:', '',
                         '1234.56.00.91', '- - - b', '2'], 1)

    def test_a_ten_digit_line_away_from_its_parent_fails_loudly(self):
        with self.assertRaises(ValueError):
            parse_cells(['1601.00.10', '- Loại khác', '0', '', '1602.10.10.10', '- - Từ côn trùng', '0', 'KH'], 1)


class EvftaExportAnnex(unittest.TestCase):
    # ND 116/2022 carries two tables: Phụ lục I is the EXPORT tariff, Phụ lục II the import one.
    # The seed kept the first row per code, so export rates were served as EVFTA import rates.
    CELLS = ['Phụ lục I', 'BIỂU THUẾ XUẤT KHẨU ƯU ĐÃI CỦA VIỆT NAM',
             '1211.20.90', '- - Loại khác', '0', '0', '0', '0', '0', '0', '',
             '1211.90.17', '- - - Loại khác, tươi hoặc khô:', '', '', '', '', '', '', '',
             '1211.90.17.10', '- - - - Trầm hương, kỳ nam', '10,9', '9,5', '8,1', '6,8', '5,4', '4', '',
             '1211.90.17.90', '- - - - Loại khác', '0', '0', '0', '0', '0', '0',
             'Phụ lục II', 'BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI ĐẶC BIỆT CỦA VIỆT NAM',
             '1211.20.90', '- - Loại khác', '25', '20', '15', '10', '5', '0', '',
             '1211.90.17', '- - - Loại khác, tươi hoặc khô', '0', '0', '0', '0', '0', '0', '']

    def test_only_the_import_table_is_read(self):
        rows = parse_cells(self.CELLS, 6)
        self.assertEqual([(r['hs_dotted'], r['rates']) for r in rows],
                         [('1211.20.90', ['25', '20', '15', '10', '5', '0']), ('1211.90.17', ['0'] * 6)])
        self.assertNotIn('sublines', rows[1])  # the export table's sub-lines stay out too

    def test_a_code_repeated_inside_the_import_table_fails_loudly(self):
        # The seed used to keep the first row per code; a repeat must never be resolved silently.
        with self.assertRaises(ValueError):
            parse_cells(self.CELLS + ['1211.20.90', '- - Loại khác', '0', '0', '0', '0', '0', '0', ''], 6)

    def test_the_table_ends_at_the_next_annex_and_stray_cells_are_not_rates(self):
        # ND 116/2022, verbatim tail of Phụ lục II: eight stray "*" cells follow the last row.
        rows = parse_cells(['BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI ĐẶC BIỆT CỦA VIỆT NAM',
                            '9706.90.00', '- Loại khác', '0', '0', '0', '0', '0', '0', '',
                            '*', '*', '*', '*', '*', '*', '*', '*', '', '',
                            'Phụ lục III', 'DANH SÁCH LÃNH THỔ THÀNH VIÊN LIÊN MINH CHÂU ÂU',
                            '0101.21.00', '- - Thuần chủng', '5', '5', '5', '5', '5', '5'], 6)
        self.assertEqual(rows, [{'hs': '97069000', 'hs_dotted': '9706.90.00', 'desc': '- Loại khác', 'rates': ['0'] * 6}])


class RateColumnCount(unittest.TestCase):
    """A row carries exactly the schedule's number of rate columns (1 ACFTA/AANZFTA, 6 ATIGA/EVFTA)."""

    def test_a_yearly_row_with_a_missing_column_fails_loudly(self):
        with self.assertRaises(ValueError):
            parse_cells(['8481.80.99', '- - Loại khác', '5', '3,3', '1,6', '0', '0', ''], 6)

    def test_a_sub_line_with_a_missing_column_fails_loudly(self):
        with self.assertRaises(ValueError):
            parse_cells(['1508.90.00', '- Loại khác:', '',
                         '1508.90.00.10', '- - Dầu lạc', '3,6', '3,1', '',
                         '1508.90.00.90', '- - Loại khác', '18,1', '15,9', '13,6', '11,3', '9', '6,8'], 6)

    def test_a_row_with_neither_rates_nor_sub_lines_fails_loudly(self):
        with self.assertRaises(ValueError):
            parse_cells(['1601.00.10', '- Loại khác:', '', '1602.10.10', '- - Khác', '0', ''], 1)

    def test_a_rate_cell_beyond_the_schedule_columns_fails_loudly(self):
        # Truncating to `ncols` would hide a stray cell that shifts every yearly rate by one.
        cases = {
            'single-rate row': (['0101.21.00', '- - Thuần chủng', '5', '7', '0101.29.00', '- - Loại khác', '5'], 1),
            'seventh yearly rate mid-table': (['1234.56.78', '- x', '*', '5', '4', '3', '2', '1', '0', '',
                                               '1234.56.79', '- y', '0', '0', '0', '0', '0', '0', ''], 6),
            'last sub-line': (['1601.00.10', '- P:', '', '', '1601.00.10.10', '- - a', '0', '',
                               '1601.00.10.90', '- - b', '5', '7', '1601.00.90', '- c', '0'], 1),
            'after the exclusion cell': (['0901.11.20', '- - - Arabica', '0', 'CN', '5', '0901.11.30', '- - - Robusta', '0'], 1),
        }
        for name, (cells, ncols) in cases.items():
            with self.subTest(name), self.assertRaises(ValueError):
                parse_cells(cells, ncols)

    def test_stray_cells_after_the_last_row_are_tolerated_only_before_an_annex_heading(self):
        with self.assertRaises(ValueError):
            parse_cells(['BIỂU THUẾ NHẬP KHẨU ƯU ĐÃI ĐẶC BIỆT CỦA VIỆT NAM',
                         '9706.90.00', '- Loại khác', '0', '0', '0', '0', '0', '0', '',
                         '*', '*', '*', '*', '*', '*', '*', '*', '', ''], 6)


class OtherSchedulesUnaffected(unittest.TestCase):
    def test_evfta_six_rate_row_has_no_new_fields(self):
        rows = parse_cells(['8481.80.99', '- - Loại khác', '5', '3,3', '1,6', '0', '0', '0', '',
                            '8481.90.10', '- - Khác', '0', '0', '0', '0', '0', '0'], 6)
        self.assertEqual(rows[0], {'hs': '84818099', 'hs_dotted': '8481.80.99', 'desc': '- - Loại khác',
                                   'rates': ['5', '3,3', '1,6', '0', '0', '0']})
        self.assertEqual(sorted(rows[1]), ['desc', 'hs', 'hs_dotted', 'rates'])


if __name__ == '__main__':
    unittest.main()
