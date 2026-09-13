"""Tests for the append-only rule of consolidated notebook sources.

    python3 -m unittest test_manifest
"""
import tempfile
import unittest
from pathlib import Path

from manifest import Manifest, is_extension

OLD = "# Công văn\n\n### 20320/TB-CHQ — Bộ nguồn LED\n\nmã 8504.40.30\n\n### 1483/TCHQ-GSQL — Máy hút ẩm\n"


class TestIsExtension(unittest.TestCase):
    def test_new_section_inserted_at_top_is_an_extension(self):
        new = "# Công văn\n\n### 21000/TB-CHQ — Hàng mới\n\nmã 8471.50.90\n\n" + OLD.split("\n\n", 1)[1]
        self.assertTrue(is_extension(OLD, new))

    def test_appended_section_is_an_extension(self):
        self.assertTrue(is_extension(OLD, OLD + "\n### 99/TB-CHQ — Thêm\n"))

    def test_edited_line_is_not(self):
        self.assertFalse(is_extension(OLD, OLD.replace("8504.40.30", "8504.40.90")))

    def test_removed_line_is_not(self):
        self.assertFalse(is_extension(OLD, OLD.replace("mã 8504.40.30\n", "")))

    def test_reordered_lines_are_not(self):
        a, b = "### 20320/TB-CHQ — Bộ nguồn LED", "### 1483/TCHQ-GSQL — Máy hút ẩm"
        self.assertFalse(is_extension(OLD, OLD.replace(a, "@@").replace(b, a).replace("@@", b)))

    def test_blank_lines_do_not_count(self):
        self.assertTrue(is_extension(OLD, OLD.replace("\n\n", "\n\n\n")))


class TestRecordExport(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.man = Manifest(Path(self.tmp.name) / "m.json")
        self.man.record_export("40.md", OLD)

    def tearDown(self):
        self.tmp.cleanup()

    def test_extension_accepted_without_force(self):
        self.assertEqual(self.man.record_export("40.md", OLD + "\nthêm\n", previous_text=OLD), "extended")

    def test_edit_refused_without_force(self):
        with self.assertRaises(ValueError):
            self.man.record_export("40.md", OLD.replace("LED", "đèn"), previous_text=OLD)

    def test_without_snapshot_any_change_is_refused(self):
        """No record of what was pushed means no way to prove an extension: stay strict."""
        with self.assertRaises(ValueError):
            self.man.record_export("40.md", OLD + "\nthêm\n")

    def test_force_still_overrides(self):
        self.assertEqual(self.man.record_export("40.md", "khác hẳn", force=True), "changed")


class TestMarkupOnlyChanges(unittest.TestCase):
    """docs_safe escapes list markers and adds hard breaks so Docs stops renumbering khoản.
    That rewrite touches every numbered line of every live source; it must pass as what it
    is — no text changed — and must NOT become a hole a real edit can slip through."""

    OLD = "Điều 47a. Kiểm tra\n1. Hàng hóa tại chỗ\n2. Phải làm thủ tục\n-------\n"
    NEW = "Điều 47a. Kiểm tra  \n1\\. Hàng hóa tại chỗ  \n2\\. Phải làm thủ tục  \n\\-------\n"

    def test_escapes_and_hard_breaks_are_an_extension(self):
        self.assertTrue(is_extension(self.OLD, self.NEW))

    def test_escape_cannot_hide_a_renumbered_khoan(self):
        self.assertFalse(is_extension(self.OLD, self.NEW.replace("2\\.", "3\\.")))

    def test_dedent_is_markup(self):
        self.assertTrue(is_extension("      THÔNG TƯ\nđoạn\n", "THÔNG TƯ  \nđoạn\n"))

    def test_record_export_reports_reformatted(self):
        man = Manifest(Path(tempfile.mkdtemp()) / "m.json")
        man.record_export("10.md", self.OLD)
        self.assertEqual(man.record_export("10.md", self.NEW, previous_text=self.OLD), "reformatted")

    def test_markup_plus_new_text_is_extended_not_reformatted(self):
        man = Manifest(Path(tempfile.mkdtemp()) / "m.json")
        man.record_export("10.md", self.OLD)
        grown = self.NEW + "3\\. Khoản mới\n"
        self.assertEqual(man.record_export("10.md", grown, previous_text=self.OLD), "extended")


if __name__ == "__main__":
    unittest.main()
