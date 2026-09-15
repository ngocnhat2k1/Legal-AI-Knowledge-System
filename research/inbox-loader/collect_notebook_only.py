#!/usr/bin/env python3
"""Collect the documents that go to the NOTEBOOK but not to `legal_document`.

    python3 collect_notebook_only.py --texts <dir of extracted .txt> [--rulings-extra <ndjson>]

Output: db/seed/data/legal/notebook-only.ndjson — the extracted text itself, so the
notebook can be regenerated from the repository alone once the inbox folder is gone.

Classes (ADR 2026-09-10-drafts-and-cong-van-outside-legal-corpus):
  B        công văn — real, signed, but administrative guidance, not law
  C        status undetermined — number/date box blank AND not found on Công báo (R15)
  D        internal / operational — not a legal source at all
  A-local  a local legal instrument (HĐND) that the national gazette does not carry
  A-ocr    an official document that is not on Công báo, so its text is OCR (rung 4)

Every entry carries a `status` sentence the renderer prints verbatim at the top of the
document. The label has to reach the reader; if it only lives in metadata, the notebook
will quote the text without it.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "db/seed/data/legal/notebook-only.ndjson"

ENTRIES = [
    {"slug": "cv-18648-chq-gsql", "class": "B", "number": "18648/CHQ-GSQL", "date": "2026-07-08",
     "issuer": "Cục Hải quan", "title": "V/v khai hàng hóa là sản phẩm mật mã dân sự",
     "source_file": "THÔNG TƯ/18648_CHQ-GSQL_715240.doc", "method": "textutil",
     "status": "Công văn hướng dẫn nghiệp vụ — KHÔNG phải văn bản quy phạm pháp luật."},
    {"slug": "nq-12-2026-nq-hdnd", "class": "A-local", "number": "12/2026/NQ-HĐND", "date": "2026-06-19",
     "issuer": "HĐND Thành phố Hồ Chí Minh",
     "title": "Về miễn phí sử dụng công trình kết cấu hạ tầng, công trình dịch vụ, tiện ích công cộng "
              "trong khu vực cửa khẩu cảng biển trên địa bàn Thành phố Hồ Chí Minh nhằm hỗ trợ sản xuất kinh doanh",
     "source_file": "THÔNG TƯ/Nghị-quyết-12-2026-NQ-HĐND.pdf", "method": "lớp text PDF",
     "status": "Văn bản quy phạm pháp luật của ĐỊA PHƯƠNG — không đăng Công báo Chính phủ; "
               "bản văn lấy từ file nhận được (bậc 3), chưa đối chiếu với nguồn công bố của Thành phố."},
    # Issued, not a draft, but not on Công báo yet, so its text stays out of the corpus (R16). The class stays C
    # because the code picks notebook source 90 and the bot's evidence kind, and no kind means "awaiting the gazette".
    {"slug": "du-thao-tt-bnv-rui-ro", "class": "C", "number": None, "date": None, "issuer": "Bộ Nội vụ",
     "title": "Thông tư quy định Danh mục sản phẩm, hàng hóa có mức độ rủi ro trung bình, mức độ rủi ro cao "
              "thuộc trách nhiệm quản lý nhà nước của Bộ Nội vụ",
     "source_file": "THÔNG TƯ/16 2026 TT BNV bộ nội vụ đối với hàng hóa có mức dộ rủi ro.pdf", "method": "lớp text PDF",
     "status": "ĐÃ BAN HÀNH, CHƯA ĐĂNG CÔNG BÁO — không phải dự thảo. Danh mục văn bản trên vanban.chinhphu.vn ghi "
               "Thông tư 16/2026/TT-BNV ngày 28/07/2026; file nhận được là bản Cổng Thông tin điện tử Chính phủ ký số "
               "(người ký: Cục Thông tin và Truyền thông Chính phủ, lúc 29/07/2026 14:57:36), mang dấu '16', '28', '7', "
               "dù ô số hiệu và ngày trong lớp text vẫn trống. Đã dò Công báo ngày 2026-09-14: CHƯA đăng. Bản văn lấy "
               "từ file nhận được, chưa đối chiếu bản Công báo, nên chưa nạp vào kho văn bản; khi Công báo đăng thì nạp "
               "bản Công báo (R16). Chưa dùng làm căn cứ cho tới khi đối chiếu."},
    {"slug": "09-bvhttdl", "class": "C", "number": None, "date": None, "issuer": "Bộ Văn hóa, Thể thao và Du lịch",
     "title": "Thông tư ban hành Danh mục hàng hóa xuất khẩu, nhập khẩu thuộc phạm vi quản lý chuyên ngành văn hóa "
              "của Bộ Văn hóa, Thể thao và Du lịch xác định mã số hàng hóa theo Danh mục hàng hóa xuất khẩu, nhập khẩu Việt Nam",
     "source_file": "THÔNG TƯ/09-bvhttdl.pdf", "method": "lớp text PDF",
     "status": "CHƯA XÁC ĐỊNH TÌNH TRẠNG — bản chưa ký, ô số trống, ngày ghi 'tháng 8 năm 2023'. Đã dò mọi thông tư "
               "của BVHTTDL đăng Công báo từ 07/2023 đến 06/2024: KHÔNG có văn bản danh mục văn hóa XNK nào. Cờ đỏ năm "
               "lệch (bản chưa ký của năm 2023). Có thể đã ban hành với số hiệu khác, hoặc chưa từng ban hành. "
               "Văn bản còn viện dẫn NĐ 69/2018/NĐ-CP — đã bị NĐ 292/2026/NĐ-CP thay thế."},
    {"slug": "du-thao-cv-luong-dung", "class": "C", "number": None, "date": None, "issuer": "Cục Hải quan", "title": None,
     "source_file": "THÔNG TƯ/Khai báo hàng hoá lưỡng dụng.pdf", "method": "lớp text PDF",
     "status": "CHƯA XÁC ĐỊNH TÌNH TRẠNG — bản công văn chưa có số và ngày (đã có tên người ký). Công văn không đăng "
               "Công báo nên không có nguồn công bố để đối chiếu. Không dùng làm căn cứ."},
    {"slug": "ds-hang-qua-kvgs", "class": "D", "number": None, "date": "2026-08-12",
     "issuer": "Chi cục Hải quan khu vực II — Hải quan Thủ Dầu Một",
     "title": "Danh sách hàng hóa đủ điều kiện qua khu vực giám sát", "source_file": "THÔNG TƯ/_.pdf",
     "method": "lớp text PDF", "status": "Tài liệu tác nghiệp — KHÔNG phải nguồn pháp lý."},
    {"slug": "tom-tat-nd-292", "class": "D", "number": None, "date": None, "issuer": "(không rõ người soạn)",
     "title": "Bản tóm tắt Nghị định 292/2026/NĐ-CP — FDI, tạm nhập tái xuất, gia công",
     "source_file": "THÔNG TƯ/Nghị định số 2922026NĐ-CP thay thế NĐ 69/BAN TOM TAT_ND_292_2026_FDI_TNTX_GIA_CONG.docx",
     "method": "python-docx (đoạn + bảng)",
     "status": "Bản tóm tắt do bên thứ ba soạn — KHÔNG phải văn bản gốc. Luôn đối chiếu với toàn văn NĐ 292/2026/NĐ-CP."},
    {"slug": "xlsx-danh-muc-rr-noi-bo", "class": "D", "number": None, "date": "2026-07-01", "issuer": "Nội bộ (VVMV)",
     "title": "Danh mục hàng hóa rủi ro cao, rủi ro trung bình các bộ ngành từ 01/07/2026",
     "source_file": "THÔNG TƯ/Danh_muc_Hang_hoa_RR CAO,RR TRUNG BINH cac bo nganh tu 01.07.2026 - luu hanh noi bo VVMV.xlsx",
     "method": "openpyxl",
     "status": "Bảng tổng hợp NỘI BỘ, ghi rõ 'lưu hành nội bộ' — KHÔNG phải nguồn pháp lý. Căn cứ gốc là thông tư "
               "danh mục của từng bộ (đã có trên Công báo: 36/2026/TT-BKHCN, 33/2026/TT-BCT, 27/2026/TT-BYT, "
               "27/2026/TT-BNNMT, 49/2026/TT-BXD, 125/2026/TT-BCA)."},
]

EXCLUDED = [
    ("THÔNG TƯ/…/Phu_luc_Nghi_dinh_292_2026_ND-CP.xlsx", "Trùng phụ lục chính thức lấy từ Công báo"),
    ("CHU GIAI/PHU LUC III_SEN.pdf", "SEN AHTN 2012 (TT 156/2011/TT-BTC) — đã bị SEN 2022 thay thế (R8)"),
    ("CHU GIAI/Chuong 84 ok.pdf, Chuong 90 ok.pdf (ở gốc)", "Bản trùng của file trong 'chu giai HS 2024'"),
    ("CHU GIAI/…/EN 2022 phat hanh/~WRL3753.tmp", "File tạm của Word"),
    ("*.rar", "Nén của chính các thư mục đã giải nén — không thiếu, không khác"),
    ("khach-hang-20260910-1019.csv", "Dữ liệu khách hàng — không phải tài liệu; không mở, không nạp"),
    ("THÔNG TƯ/Số 112024TT-BTTTT… ≡ 11-btttt…", "Trùng byte-for-byte"),
    ("THÔNG TƯ/KO QE.pdf", "Bản chưa ký của CV 18648/CHQ-GSQL ĐÃ BAN HÀNH (thân văn bản giống 0,99) — "
                          "nạp bản đã ký, không nạp bản nháp (R15)"),
]


#: The repository is PUBLIC. Private identifiers in an operational printout are replaced in the
#: extracted text before it is written. Patterns key on the form's field LABELS, never on the
#: values, so the values themselves are not committed here. Each pattern must match, or its
#: placeholder already be present (a re-run over redacted text); otherwise the run stops
#: instead of writing the text unredacted.
REDACT = {
    "ds-hang-qua-kvgs": [
        (r"(Đơn vị XNK:[ \t]*)(?![\s\[])[^\n]+?(?=\s+\d+\.\s|$)", r"\1[đã ẩn tên doanh nghiệp]"),
        (r"(Mã số thuế:[ \t]*)\d[\d-]*", r"\1[đã ẩn MST]"),
        (r"(Số tờ khai:[ \t]*)\d+", r"\1[đã ẩn số tờ khai]"),
        (r"(Số quản lý hàng hóa:[ \t]*)(?!\[)\S+", r"\1[đã ẩn số quản lý hàng hóa]"),
    ],
}


def redact(slug: str, text: str) -> str:
    for pattern, repl in REDACT.get(slug, []):
        text, n = re.subn(pattern, repl, text, flags=re.M)
        if not n and repl[2:] not in text:
            raise SystemExit(f"{slug}: không tìm thấy trường cần ẩn {repl[2:]} — dừng, không ghi")
    return text


def nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s or "")


def vv_title(text: str) -> str | None:
    m = re.search(r"V/v\s*:?\s*([^\n]{5,160})", text)
    return m.group(1).strip() if m else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--texts", required=True)
    ap.add_argument("--rulings-extra", help="ndjson from the dual-read of OCR'd official documents")
    args = ap.parse_args()
    texts = Path(args.texts)
    rows = []
    for e in ENTRIES:
        path = texts / f"{e['slug']}.txt"
        if not path.exists():
            raise SystemExit(f"thiếu text cho {e['slug']}")
        text = redact(e["slug"], nfc(path.read_text(encoding="utf-8")).strip())
        title = e["title"] or vv_title(text) or e["slug"]
        rows.append({**e, "title": title, "text": text, "chars": len(text)})
    if args.rulings_extra:
        for line in Path(args.rulings_extra).read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
    rows.sort(key=lambda r: (r["class"], r["slug"]))
    with OUT.open("w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
    for r in rows:
        print(f"{r['class']:8} {r['slug']:26} {r['chars']:>9,} ký tự · {r['title'][:60]}")
    print(f"\n{len(rows)} tài liệu → {OUT.relative_to(ROOT)} · {len(EXCLUDED)} nhóm cố ý KHÔNG nạp")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
