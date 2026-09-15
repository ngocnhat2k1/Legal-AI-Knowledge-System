"""Tests for the classification-cases checker, against the committed rulings and nomenclature.

    python3 -m unittest test_check_cases
"""
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # also runnable from the repo root

from check_cases import OUT, check, read_ndjson  # noqa: E402

# Hand-filled, checker-clean: 3831/TCHQ-TXNK, the 88.06 branch (L4, a linked chapter note, a 4-digit conclusion).
FLYCAM = {
    "case_id": "flycam-3831-tchq-txnk-1#1", "source_dir": "flycam-3831-tchq-txnk-1",
    "so_hieu": "3831/TCHQ-TXNK", "ngay_ban_hanh": "2022-09-15", "loai_van_ban": "cv_huong_dan_chung",
    "pham_vi": {"rang_buoc": "huong_dan_noi_bo_hq", "trich_doi_tuong": "Kính gửi: Các Cục Hải quan tỉnh, thành phố.",
                "trich_gia_tri": "Tổng cục Hải quan thông báo để các Cục Hải quan tỉnh, thành phố được biết và thực hiện./."},
    "hang_hoa": {"trich_ten": "Phương tiện bay không người lái tích hợp camera"},
    "su_kien": [{"loai": "cau_tao", "phan": "van_ban", "trich": "Mặt hàng Flycam là thiết bị có cấu tạo gồm: (1) Phương tiện bay không người lái, (2) Một hoặc nhiều camera được gắn cố định trên thân của phương tiện bay không người lái."}],
    "can_cu": [
        {"loai": "chu_giai_chuong", "tham_chieu": "Chương 88, Chú giải 1", "phien_ban_hs": "AHTN 2022 (TT 31/2022/TT-BTC)",
         "trich": "1. Theo mục đích của chương này, khái niệm \"phương tiện bay không người lái\" có nghĩa là bất kỳ phương tiện bay nào, trừ các phương tiện bay thuộc nhóm 88.01, được thiết kế để bay mà không có người lái trên phương tiện bay. Chúng có thể được thiết kế để mang trọng tải hoặc được trang bị camera kỹ thuật số tích hợp vĩnh viễn hoặc các thiết bị khác cho phép chúng thực hiện các chức năng sử dụng thực tế suốt chuyến bay",
         "lien_ket": "hs-notes.ndjson#123", "khop_nguyen_van_kho": False},
        {"loai": "en", "tham_chieu": "Chú giải chi tiết HS 2017 (không nêu nhóm)", "phien_ban_hs": "HS 2017",
         "trich": "Tham khảo Chú giải chi tiết HS năm 2017;", "lien_ket": None, "khop_nguyen_van_kho": None}],
    "ung_vien": [
        {"nhom": "85.25", "trich": "mặt hàng Flycam được phân loại vào nhóm 85.25, phân nhóm 8525.80", "ket_qua": "loai_tuong_minh"},
        {"nhom": "88.06", "trich": "mặt hàng Phương tiện bay không người lái thuộc nhóm 88.06", "ket_qua": "chon"}],
    "loai_tru": [
        {"nhom": "85.25", "trich_nhom": "2.1. Về mã số phân loại của mặt hàng Flycam trước ngày 01/12/2022:",
         "trich_ly_do": "Như vậy kể từ ngày 01/12/2022 mặt hàng Flycam có bản chất là Phương tiện bay không người lái đã được trang bị camera kỹ thuật số tích hợp vĩnh viễn được phân loại vào Chương 88.",
         "can_cu": "Chương 88, Chú giải 1"}],
    "ket_luan": {"trich": "Theo cấu trúc Chương 88, mặt hàng Phương tiện bay không người lái thuộc nhóm 88.06 \"Phương tiện bay không người lái\".",
                 "trich_nhom": None, "nhom": "88.06", "phan_nhom": None, "ma": None, "cap": 4,
                 "trich_dieu_kien": "Mã số chi tiết tùy thuộc theo đặc tính kỹ thuật của phương tiện bay không người lái (ví dụ có hay không được điều khiển từ xa, trọng lượng cất cánh...)",
                 "ap_dung_tu": "2022-12-01", "ap_dung_den": None},
    "danh_muc": {"van_ban": "31/2022/TT-BTC", "phien_ban": "AHTN 2022",
                 "trich": "Căn cứ Thông tư số 31/2022/TT-BTC ngày 08/6/2022 của Bộ Tài chính về việc ban hành Danh mục hàng hóa xuất khẩu, nhập khẩu Việt Nam;"},
    "ahtn_2022": {"trang_thai": "hien_hanh_cap_nhom", "ma_cung_phan_nhom": [], "doi_chieu_ngay": "2026-09-14"},
    "muc_lap_luan": "L4",
    "xac_minh": {"verification": "auto_unverified", "verified_by": None, "than_van_doc_kep": False, "co_trich_khong_chac": False},
}


class TestCheckCases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rulings = {r["source_dir"]: r for r in read_ndjson(OUT, [])}

    def errors(self, mutate=None):
        case = copy.deepcopy(FLYCAM)
        if mutate:
            mutate(case)
        return check([case], self.rulings)

    def assertOneError(self, mutate, needle):
        errs = self.errors(mutate)
        self.assertEqual(len(errs), 1, errs)
        self.assertIn(needle, errs[0])

    def test_example_passes(self):
        self.assertEqual(self.errors(), [])

    def test_mutated_quote_fails(self):
        self.assertOneError(lambda c: c["hang_hoa"].update(trich_ten="Phương tiện bay có người lái tích hợp camera"),
                            "hang_hoa.trich_ten not verbatim")

    def test_rate_in_quote_fails_even_when_verbatim(self):
        self.assertOneError(lambda c: c["hang_hoa"].update(trich_ten="thuộc đối tượng chịu thuế GTGT 10%"), "'%'")

    def test_wrong_grade_fails(self):
        self.assertOneError(lambda c: c["ahtn_2022"].update(trang_thai="hien_hanh"), "recomputed 'hien_hanh_cap_nhom'")

    def test_numbering_gap_fails(self):
        self.assertOneError(lambda c: c.update(case_id="flycam-3831-tchq-txnk-1#2"), "not 1..n")

    def test_bad_lien_ket_fails(self):
        self.assertOneError(lambda c: c["can_cu"][0].update(lien_ket="hs-notes.ndjson#99999"), "lien_ket")


if __name__ == "__main__":
    unittest.main()
