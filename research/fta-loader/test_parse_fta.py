"""Tests for parse_cells — the cell walk that turns a Công báo FTA biểu into rows.

The ACFTA biểu (ND 118/2022) has a per-line column "Nước không được hưởng ưu đãi".
Dropping it served 0% to China-origin goods the decree excludes. Every case here
guards one way that column can be lost, mis-attached, or leak into other FTAs.

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
                            '0901.11.30', '- - - Robusta', '0', ''])
        self.assertEqual(rows[0], {'hs': '09011120', 'hs_dotted': '0901.11.20', 'desc': '- - - Arabica',
                                   'rates': ['0'], 'excluded': ['CN', 'MM', 'TH']})
        self.assertEqual(rows[1], {'hs': '09011130', 'hs_dotted': '0901.11.30', 'desc': '- - - Robusta',
                                   'rates': ['0']})

    def test_a_description_that_looks_like_codes_is_not_an_exclusion(self):
        rows = parse_cells(['1234.56.78', 'CN', '5', '',
                            '1234.56.79', '- - Loại khác', '5', 'TH',
                            '1234.56.80', '- - Khác', '0', 'EU'])
        self.assertEqual(len(rows), 3)
        self.assertEqual((rows[0]['desc'], rows[0]['rates']), ('CN', ['5']))
        self.assertNotIn('excluded', rows[0])
        self.assertEqual(rows[1]['excluded'], ['TH'])
        self.assertNotIn('excluded', rows[2])  # EU is not a code of ND 118 Điều 4 khoản 2

    def test_star_is_still_a_rate_not_an_exclusion(self):
        rows = parse_cells(['0101.21.00', '- - Thuần chủng', '*', 'CN',
                            '0101.29.00', '- - Loại khác', '*', ''])
        self.assertEqual((rows[0]['rates'], rows[0]['excluded']), (['*'], ['CN']))
        self.assertEqual(rows[1]['rates'], ['*'])
        self.assertNotIn('excluded', rows[1])


class TenDigitSubLines(unittest.TestCase):
    CELLS = ['1211.60.00', '- Vỏ cây anh đào Châu Phi (Prunus africana):', '', '',
             '1211.60.00.10', '- - Dạng ướp lạnh hoặc đông lạnh', '0', 'MM, TH',
             '1211.60.00.20', '- - Dạng tươi hoặc khô', '0', '',
             '1211.90.11', '- - - Cây gai dầu', '0', '']

    def test_sub_line_exclusion_is_attached_to_its_parent_not_to_the_whole_line(self):
        rows = parse_cells(self.CELLS)
        self.assertEqual([r['hs'] for r in rows], ['12116000', '12119011'])
        parent = rows[0]
        self.assertNotIn('excluded', parent)
        self.assertEqual(parent['excluded_sublines'], [
            {'hs10': '1211600010', 'hs_dotted': '1211.60.00.10', 'desc': '- - Dạng ướp lạnh hoặc đông lạnh',
             'rates': ['0'], 'excluded': ['MM', 'TH']},
        ])
        self.assertNotIn('excluded_sublines', rows[1])

    def test_parent_rate_walk_is_unchanged(self):
        # Legacy behaviour kept on purpose (seed rates must not move): the parent row
        # takes the first rate cell after it, which here is sub-line .10's.
        self.assertEqual(parse_cells(self.CELLS)[0]['rates'], ['0'])

    def test_an_origin_excluded_on_every_sub_line_is_excluded_on_the_whole_line(self):
        # ND 118, 4011.80.31: .10 excludes ID, MY and the residual .90 "Loại khác" excludes ID,
        # so every good of the 8-digit line is excluded for ID; MY only on .10.
        rows = parse_cells(['4011.80.31', '- - - Loại khác', '',
                            '4011.80.31.10', '- - - - Có hoa lốp hình chữ chi', '0', 'ID, MY',
                            '4011.80.31.90', '- - - - Loại khác', '0', 'ID',
                            '4011.80.39', '- - - Loại khác', '0', ''])
        self.assertEqual(rows[0]['excluded'], ['ID'])
        self.assertEqual([s['excluded'] for s in rows[0]['excluded_sublines']], [['ID', 'MY'], ['ID']])
        self.assertNotIn('excluded', rows[1])

class OtherSchedulesUnaffected(unittest.TestCase):
    def test_evfta_six_rate_row_has_no_new_fields(self):
        rows = parse_cells(['8481.80.99', '- - Loại khác', '5', '3,3', '1,6', '0', '0', '0', '',
                            '8481.90.10', '- - Khác', '0', '0', '0', '0', '0', '0'])
        self.assertEqual(rows[0], {'hs': '84818099', 'hs_dotted': '8481.80.99', 'desc': '- - Loại khác',
                                   'rates': ['5', '3,3', '1,6', '0', '0', '0']})
        self.assertEqual(sorted(rows[1]), ['desc', 'hs', 'hs_dotted', 'rates'])


if __name__ == '__main__':
    unittest.main()
