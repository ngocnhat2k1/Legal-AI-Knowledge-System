"""Tests for the markdown → Google-Docs-safe transform.

Every rule here comes from an EMPIRICAL measurement (2026-09-10): a markdown file was
uploaded to Drive, converted to a Google Doc, and read back. What survived and what did
not is recorded in .agent/docs/inbox-ingest-workflow.md. These tests pin that behaviour
so a future edit cannot quietly reintroduce a construct the converter destroys.

    python3 -m unittest discover research/inbox-loader
"""
import unittest

from docs_safe import char_count, decode_symbol_font, literal_text, strip_word_field_codes, to_docs_safe


class TestDetails(unittest.TestCase):
    """<details> is the dangerous one: Docs DELETES the tag and MERGES the text."""

    def test_details_becomes_heading(self):
        src = (
            "Chú giải 1 Phần XVI nói rằng...\n"
            "\n"
            "<details><summary>Nguyên văn tiếng Anh (WCO)</summary>\n"
            "\n"
            "This Section does not cover:\n"
            "\n"
            "</details>\n"
        )
        out = to_docs_safe(src)
        self.assertNotIn("<details>", out)
        self.assertNotIn("</details>", out)
        self.assertNotIn("<summary>", out)
        self.assertIn("#### Nguyên văn tiếng Anh (WCO)", out)
        self.assertIn("This Section does not cover:", out)

    def test_boundary_survives_between_languages(self):
        """The whole point: the reader must still see where Vietnamese ends."""
        src = (
            "Phần này không bao gồm:\n"
            "<details><summary>Nguyên văn tiếng Anh (WCO)</summary>\n"
            "This Section does not cover:\n"
            "</details>\n"
        )
        out = to_docs_safe(src)
        vi = out.index("Phần này không bao gồm")
        marker = out.index("#### Nguyên văn tiếng Anh")
        en = out.index("This Section does not cover")
        self.assertLess(vi, marker)
        self.assertLess(marker, en)

    def test_multiple_details_blocks(self):
        src = "".join(
            f"<details><summary>Khối {i}</summary>\nnội dung {i}\n</details>\n" for i in range(3)
        )
        out = to_docs_safe(src)
        self.assertNotIn("details", out)
        for i in range(3):
            self.assertIn(f"#### Khối {i}", out)
            self.assertIn(f"nội dung {i}", out)


class TestBlockquote(unittest.TestCase):
    """Docs drops the '>' marker entirely, leaving text indistinguishable from body."""

    def test_marker_stripped_text_kept(self):
        out = to_docs_safe("> **Nguồn:** Thông tư 31/2022/TT-BTC\n")
        self.assertNotIn(">", out)
        self.assertIn("**Nguồn:** Thông tư 31/2022/TT-BTC", out)

    def test_nested_blockquote(self):
        out = to_docs_safe(">> sâu hai cấp\n")
        self.assertNotIn(">", out)
        self.assertIn("sâu hai cấp", out)

    def test_diem_marker_keeps_its_letter(self):
        """build_legal.py renders điểm as '> **a)** body'. The letter is load-bearing."""
        out = to_docs_safe("> **a)** Hàng hóa nhập khẩu\n")
        self.assertIn("**a)**", out)
        self.assertIn("Hàng hóa nhập khẩu", out)


class TestCodeFence(unittest.TestCase):
    def test_fence_removed_content_kept(self):
        src = "Ví dụ:\n\n```bash\nrclone copyto a b\n```\n\nxong\n"
        out = to_docs_safe(src)
        self.assertNotIn("```", out)
        self.assertIn("rclone copyto a b", out)
        self.assertIn("xong", out)

    def test_content_inside_fence_is_not_otherwise_transformed(self):
        """A '>' or '|' inside a code block is data, not markup."""
        src = "```\n> not a quote\n| not | a table |\n```\n"
        out = to_docs_safe(src)
        self.assertIn("> not a quote", out)
        self.assertIn("| not | a table |", out)


class TestTableCells(unittest.TestCase):
    """Bold inside a cell comes back as literal escaped asterisks."""

    def test_bold_stripped_inside_cells(self):
        out = to_docs_safe("| **Mã HS** | Mô tả |\n|---|---|\n| **8481.80.99** | Van |\n")
        self.assertNotIn("**", out)
        self.assertIn("Mã HS", out)
        self.assertIn("8481.80.99", out)

    def test_bold_outside_tables_untouched(self):
        out = to_docs_safe("Đây là **quan trọng** lắm.\n")
        self.assertIn("**quan trọng**", out)

    def test_table_structure_preserved(self):
        src = "| a | b |\n|---|---|\n| 1 | 2 |\n"
        out = to_docs_safe(src)
        self.assertIn("| a | b |", out)
        self.assertIn("|---|---|", out)


class TestIdempotence(unittest.TestCase):
    def test_running_twice_changes_nothing(self):
        src = (
            "# Tiêu đề\n\n> trích dẫn\n\n<details><summary>X</summary>\ny\n</details>\n\n"
            "| **a** | b |\n|---|---|\n\n```\ncode\n```\n"
        )
        once = to_docs_safe(src)
        self.assertEqual(once, to_docs_safe(once))

    def test_already_safe_text_unchanged(self):
        src = "# Tiêu đề\n\nĐoạn văn có **in đậm** và *nghiêng*.\n\n- gạch đầu dòng\n"
        self.assertEqual(to_docs_safe(src).strip(), src.strip())


class TestLineStructure(unittest.TestCase):
    """Measured 2026-09-10 on the Doc's plain-text export (what the notebook ingests):
    Docs merges consecutive lines, and RENUMBERS anything it reads as a list. Live result:
    a merged `Điều 47a` heading made its `1.` continue the previous list and read `4.`."""

    def test_ordered_marker_escaped(self):
        out = to_docs_safe("Điều 47a. Kiểm tra\n1. Hàng hóa tại chỗ\n")
        self.assertIn("\n1\\. Hàng hóa tại chỗ", out)

    def test_paren_marker_escaped(self):
        """`3)` came back as `2.` — renumbered AND re-punctuated."""
        self.assertTrue(to_docs_safe("3) Khoản ba\n").startswith("3\\) Khoản ba"))

    def test_decimal_numbering_untouched(self):
        self.assertEqual(to_docs_safe("2.1. Về mã số\n"), "2.1. Về mã số\n")

    def test_numbers_inside_table_cells_untouched(self):
        src = "| a | b |\n|---|---|\n| 1. ô | 3. ô |\n"
        self.assertEqual(to_docs_safe(src), src)

    def test_consecutive_lines_get_hard_break_last_line_does_not(self):
        out = to_docs_safe("dòng một\ndòng hai\n\nđoạn mới\n")
        self.assertEqual(out, "dòng một  \ndòng hai\n\nđoạn mới\n")

    def test_no_hard_break_around_headings_or_tables(self):
        src = "## Điều 5.\nNội dung\n| a |\n|---|\n"
        out = to_docs_safe(src)
        self.assertIn("## Điều 5.\n", out)
        self.assertIn("Nội dung\n| a |", out)

    def test_setext_underline_escaped(self):
        """Under text, `-------` is a setext underline: Docs deletes it and makes the line above a heading."""
        out = to_docs_safe("CỤC HẢI QUAN\n-------\nSố: 1\n")
        self.assertIn("\\-------", out)

    def test_rule_after_text_stays_a_rule(self):
        self.assertIn("đoạn\n\n---", to_docs_safe("đoạn\n---\n\n## X\n"))

    def test_plus_escaped(self):
        self.assertTrue(to_docs_safe("+ Trường hợp a\n").startswith("\\+ Trường hợp a"))

    def test_nbsp_only_line_becomes_blank(self):
        """Measured in CV 18648: the NBSP line glued `Hà Nội, ngày…` to `Kính gửi:`."""
        self.assertEqual(to_docs_safe("Hà Nội, ngày 08\n\xa0\nKính gửi:\n"), "Hà Nội, ngày 08\n\nKính gửi:\n")

    def test_pipe_lines_without_delimiter_are_text(self):
        """A table nested in a copied document has no `|---|` row: Docs shows it as text."""
        out = to_docs_safe("Thông số:\n| Kích thước | 10.3 |\n| Loại | E Ink |\n")
        self.assertEqual(out, "Thông số:  \n| Kích thước | 10.3 |  \n| Loại | E Ink |\n")

    def test_underscore_signature_line_escaped(self):
        self.assertIn("\\_______________", to_docs_safe("TỔNG CỤC HẢI QUAN\n_______________\nSố: 1601\n"))

    def test_lone_dash_line_escaped(self):
        self.assertIn("\\-", to_docs_safe("a\n\n-\n\nb\n"))

    def test_deep_indent_dedented_so_no_code_block(self):
        self.assertIn("\nTHÔNG TƯ\n", to_docs_safe("đoạn\n\n" + " " * 54 + "THÔNG TƯ\n"))

    def test_nested_bullet_keeps_indent(self):
        self.assertIn("\n  - con", to_docs_safe("- cha\n  - con\n"))

    def test_hs_dash_levels_stay_literal(self):
        """Measured in source 90: `- - Tranh khảm` came back as a nested bullet, dashes gone."""
        out = to_docs_safe("9701.22.00\n- - Tranh khảm\n- Loại khác\n")
        self.assertIn("\\- - Tranh khảm", out)
        self.assertIn("\n- Loại khác", out)

    def test_visible_text_is_unchanged(self):
        """Markup only — which manifest.is_extension relies on to accept this rewrite."""
        import re
        src = "Điều 3.\n1. một\n3) ba\n+ cộng\nCỤC\n-------\n2.1. hai\n"
        out = to_docs_safe(src)
        seen = [re.sub(r"\\(.)", r"\1", l).rstrip() for l in out.splitlines() if l.strip()]
        self.assertEqual(seen, [l for l in src.splitlines() if l.strip()])

    def test_numbered_text_idempotent(self):
        src = "Điều 3.\n1. một\n3) ba\nCỤC\n-------\nđoạn\n---\n"
        once = to_docs_safe(src)
        self.assertEqual(once, to_docs_safe(once))


class TestSymbolFont(unittest.TestCase):
    """Private-use code points are DELETED by Google Docs. Symbol-font ones are decoded with
    the published table; the font was checked in the source PDFs (SymbolMT) first."""

    def test_greek_decoded(self):
        self.assertEqual(decode_symbol_font("Axit \uf061-Naphthylacetic"), "Axit α-Naphthylacetic")
        self.assertEqual(decode_symbol_font("Ômêga hoa (\uf057)"), "Ômêga hoa (Ω)")

    def test_brackets_and_relations(self):
        self.assertEqual(decode_symbol_font("\uf05bx\uf05d \uf0b3 1"), "[x] ≥ 1")

    def test_unlisted_code_point_left_for_the_verifier(self):
        self.assertEqual(decode_symbol_font("\uf0ff"), "\uf0ff")

    def test_ordinary_text_untouched(self):
        self.assertEqual(decode_symbol_font("Điều 5. α đã đúng"), "Điều 5. α đã đúng")


class TestLiteralSourceText(unittest.TestCase):
    """Source text inserted by the renderer must never be read as markup (audit 2026-09-10)."""

    def test_multiplication_asterisks_survive(self):
        out = to_docs_safe(literal_text("+ Khi mở: 173.6*162.6*12.1 (mm)."))
        self.assertIn("173.6\\*162.6\\*12.1", out)

    def test_hs_dash_without_space_keeps_both_dashes(self):
        self.assertTrue(to_docs_safe(literal_text("- -Vây cá mập\n")).startswith("\\- -Vây cá mập"))

    def test_single_dash_level_is_text(self):
        self.assertTrue(to_docs_safe(literal_text("- Ngựa: 0101.21\n")).startswith("\\- Ngựa"))

    def test_mid_line_dash_untouched(self):
        self.assertEqual(literal_text("a - b"), "a - b")

    def test_idempotent_through_docs_safe(self):
        once = to_docs_safe(literal_text("- -X\n1. a*b*c\n"))
        self.assertEqual(once, to_docs_safe(once))


class TestWordFieldCodes(unittest.TestCase):
    """Real debris from 31/2018/NĐ-CP, 72/2022/NĐ-CP and 11/2024/TT-BTTTT."""

    def test_instruction_removed_display_text_kept(self):
        src = 'tại địa chỉ HYPERLINK "http://www.ecosys.gov.vn/"www.ecosys.gov.vn hoặc'
        self.assertEqual(strip_word_field_codes(src), "tại địa chỉ www.ecosys.gov.vn hoặc")

    def test_instruction_with_space_before_display_text(self):
        src = 'Nghị định số HYPERLINK "https://thuvienphapluat.vn/van-ban/x.aspx" 72/2013/NĐ-CP'
        self.assertEqual(strip_word_field_codes(src), "Nghị định số 72/2013/NĐ-CP")

    def test_plain_text_untouched(self):
        src = "Điều 5. Hàng hóa nhập khẩu theo hợp đồng (REF không phải lệnh trường)"
        self.assertEqual(strip_word_field_codes(src), src)


class TestCharCount(unittest.TestCase):
    """The binding limit is 1.02M CHARACTERS per Google Doc, not bytes, not words."""

    def test_counts_characters_not_bytes(self):
        self.assertEqual(char_count("Điều"), 4)

    def test_empty(self):
        self.assertEqual(char_count(""), 0)


if __name__ == "__main__":
    unittest.main()
