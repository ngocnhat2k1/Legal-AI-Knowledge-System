#!/usr/bin/env python3
"""Check a classification-cases ndjson file against the rulings it reads.

    python3 research/inbox-loader/check_cases.py <cases.ndjson> [--rulings db/seed/data/legal/classification-rulings.ndjson]

A case is one conclusion of one ruling, taken apart into quotes. Quotes are the product: every
value under a key starting with "trich" must be verbatim ruling text (whitespace runs collapsed).
The AHTN 2022 grade is recomputed with merge_rulings.grade, never trusted from the file.
Prints "case_id: message" per error and exits 1; otherwise prints a one-line summary.
"""
from __future__ import annotations

import argparse
import datetime
import functools
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from merge_rulings import DATA, OUT, grade, nomenclature

LEGAL = DATA / "legal"
cached_nomenclature = functools.cache(nomenclature)


def one(s: str) -> str:
    return " ".join(s.split())


def pat(rx: str, null: bool = False):
    return lambda v: (null and v is None) or (isinstance(v, str) and re.fullmatch(rx, v) is not None)


def enum(*xs):
    return lambda v: isinstance(v, (str, int, type(None))) and not isinstance(v, bool) and v in xs


def is_date(v) -> bool:
    try:
        return isinstance(v, str) and len(v) == 10 and bool(datetime.date.fromisoformat(v))
    except ValueError:
        return False


TEXT = lambda v: isinstance(v, str) and v.strip() != ""  # noqa: E731
TEXT_OR_NULL = lambda v: v is None or TEXT(v)  # noqa: E731
BOOL = lambda v: isinstance(v, bool)  # noqa: E731
NHOM = pat(r"\d{2}\.\d{2}")

SCHEMA = {
    "case_id": pat(r".+#[1-9]\d*"),
    "source_dir": TEXT,
    "so_hieu": TEXT,
    "ngay_ban_hanh": is_date,
    "loai_van_ban": enum("tb_xac_dinh_truoc_ma_so", "tb_ket_qua_phan_loai", "cv_tra_loi_co_quan_hq",
                         "cv_tra_loi_doanh_nghiep", "cv_huong_dan_chung"),
    "pham_vi": {"rang_buoc": enum("chi_nguoi_de_nghi", "to_khai_cu_the", "huong_dan_noi_bo_hq"),
                "trich_doi_tuong": TEXT_OR_NULL, "trich_gia_tri": TEXT_OR_NULL},
    "hang_hoa": {"trich_ten": TEXT},
    "su_kien": [{"loai": enum("ten_goi", "thanh_phan", "cau_tao", "co_che", "cong_dung", "thong_so", "dieu_kien",
                              "phu_dinh", "san_pham_cuoi"),
                 "phan": enum("ho_so_de_nghi", "ket_qua", "van_ban"), "trich": TEXT}],
    "can_cu": [{"loai": enum("gri", "chu_giai_phan", "chu_giai_chuong", "chu_giai_phan_nhom", "en", "sen", "wco",
                             "loi_nhom", "ket_qua_phan_tich", "giam_dinh"),
                "tham_chieu": TEXT, "phien_ban_hs": TEXT_OR_NULL, "trich": TEXT,
                "lien_ket": pat(r"[\w.-]+\.ndjson#[1-9]\d*", null=True),
                "khop_nguyen_van_kho": lambda v: v is None or BOOL(v)}],
    "ung_vien": [{"nhom": NHOM, "trich": TEXT, "ket_qua": enum("chon", "loai_tuong_minh", "khong_neu_ly_do")}],
    "loai_tru": [{"nhom": NHOM, "trich_nhom": TEXT, "trich_ly_do": TEXT, "can_cu": TEXT_OR_NULL}],
    "ket_luan": {"trich": TEXT, "trich_nhom": TEXT_OR_NULL, "nhom": pat(r"\d{2}\.\d{2}", null=True),
                 "phan_nhom": pat(r"\d{4}\.\d{2}", null=True), "ma": pat(r"\d{4}\.\d{2}\.\d{2}", null=True),
                 "cap": enum(4, 6, 8, None), "trich_dieu_kien": TEXT_OR_NULL,
                 "ap_dung_tu": is_date, "ap_dung_den": lambda v: v is None or is_date(v)},
    "danh_muc": {"van_ban": TEXT_OR_NULL, "phien_ban": TEXT_OR_NULL, "trich": TEXT_OR_NULL},
    "ahtn_2022": {"trang_thai": TEXT, "ma_cung_phan_nhom": [pat(r"\d{4}\.\d{2}\.\d{2}")], "doi_chieu_ngay": is_date},
    "muc_lap_luan": enum("L0", "L1", "L2", "L3", "L4"),
    "xac_minh": {"verification": enum("auto_unverified"), "verified_by": lambda v: v is None,
                 "than_van_doc_kep": BOOL, "co_trich_khong_chac": BOOL},
}
# Which of nhom/phan_nhom/ma a conclusion of each level sets; None = no code (L0 only).
LEVEL_KEYS = {8: ("nhom", "phan_nhom", "ma"), 6: ("nhom", "phan_nhom"), 4: ("nhom",), None: ()}


def shape(v, spec, path: str, err) -> None:
    if isinstance(spec, dict):
        if not isinstance(v, dict):
            return err(f"{path or 'case'}: expected an object")
        for k in spec:
            p = f"{path}.{k}" if path else k
            if k not in v:
                err(f"{p}: missing")
            else:
                shape(v[k], spec[k], p, err)
        for k in v.keys() - spec.keys():
            err(f"{path}.{k}: unknown key" if path else f"{k}: unknown key")
    elif isinstance(spec, list):
        if not isinstance(v, list):
            return err(f"{path}: expected a list")
        for i, x in enumerate(v):
            shape(x, spec[0], f"{path}[{i}]", err)
    elif not spec(v):
        err(f"{path}: invalid value {str(v)[:80]!r}")


def quotes(o, path: str = ""):
    """Yield (path, value) for every key starting with "trich", at any depth."""
    if isinstance(o, dict):
        for k, v in o.items():
            p = f"{path}.{k}" if path else k
            if k.startswith("trich"):
                yield p, v
            else:
                yield from quotes(v, p)
    elif isinstance(o, list):
        for i, x in enumerate(o):
            yield from quotes(x, f"{path}[{i}]")


def digits(s: str | None) -> str:
    return "".join(ch for ch in (s or "") if ch.isdigit())


@functools.cache
def legal_lines(name: str) -> list[str] | None:
    path = LEGAL / name
    return path.read_text(encoding="utf-8").splitlines() if path.is_file() else None


def check_case(c: dict, ruling: dict, err) -> None:
    body = one(ruling["noi_dung"])
    if c["so_hieu"] != ruling["so_hieu"]:
        err(f"so_hieu {c['so_hieu']!r} != ruling {ruling['so_hieu']!r}")
    if c["ngay_ban_hanh"] != ruling["ngay_ban_hanh"]:
        err(f"ngay_ban_hanh {c['ngay_ban_hanh']} != ruling {ruling['ngay_ban_hanh']}")

    # Quotes: verbatim, and no rates (R1) outside composition/spec facts.
    pct_ok = {f"su_kien[{i}].trich" for i, s in enumerate(c["su_kien"]) if s["loai"] in ("thanh_phan", "thong_so")}
    qs = [(p, q) for p, q in quotes(c) if q is not None]
    for p, q in qs:
        if one(q) not in body:
            err(f"{p} not verbatim in noi_dung: {q[:60]!r}")
        if "%" in q and p not in pct_ok:
            err(f"{p} contains '%' (R1: no rates inside quotes)")
    if c["xac_minh"]["co_trich_khong_chac"] != any("[?]" in q for _, q in qs):
        err("xac_minh.co_trich_khong_chac does not match presence of '[?]' in quotes")

    if c["loai_van_ban"] == "tb_xac_dinh_truoc_ma_so" and c["pham_vi"]["rang_buoc"] != "chi_nguoi_de_nghi":
        err("pham_vi.rang_buoc must be chi_nguoi_de_nghi for tb_xac_dinh_truoc_ma_so")
    dm = c["danh_muc"]
    if dm["trich"] is None and (dm["van_ban"] or dm["phien_ban"]):
        err("danh_muc.van_ban/phien_ban set without a danh_muc.trich (never infer the nomenclature)")

    # Conclusion: level matches the fields set; the code is in the quote; codes nest.
    kl = c["ket_luan"]
    if kl["ap_dung_den"] and kl["ap_dung_den"] < kl["ap_dung_tu"]:
        err("ket_luan.ap_dung_den before ap_dung_tu")
    set_keys = tuple(k for k in ("nhom", "phan_nhom", "ma") if kl[k] is not None)
    if set_keys != LEVEL_KEYS[kl["cap"]]:
        err(f"ket_luan.cap {kl['cap']} but set: {', '.join(set_keys) or 'none'}")
    else:
        code = digits(kl["ma"] or kl["phan_nhom"] or kl["nhom"])
        if not code and c["muc_lap_luan"] != "L0":
            err("ket_luan without a code requires muc_lap_luan L0")
        # Digits in order, only spaces/dots between them: "84 79", "8479.89.30", "84798930".
        if code and not re.search(r"(?<!\d)" + r"[\s.]*".join(code) + r"(?!\d)", kl["trich"]):
            err(f"ket_luan.trich does not contain {kl['ma'] or kl['phan_nhom'] or kl['nhom']}")
        if (kl["phan_nhom"] and digits(kl["phan_nhom"]) != code[:6]) or (kl["nhom"] and digits(kl["nhom"]) != code[:4]):
            err("ket_luan.nhom/phan_nhom are not prefixes of the code")
        codes, h6, h4 = cached_nomenclature()
        g = grade(code, codes, h6, h4)
        if c["ahtn_2022"]["trang_thai"] != g:
            err(f"ahtn_2022.trang_thai {c['ahtn_2022']['trang_thai']!r}, recomputed {g!r}")
        sibs = [] if g.startswith("hien_hanh") or len(code) < 6 else \
            sorted(f"{k[:4]}.{k[4:6]}.{k[6:]}" for k in codes if k.startswith(code[:6]))
        if c["ahtn_2022"]["ma_cung_phan_nhom"] != sibs:
            err(f"ahtn_2022.ma_cung_phan_nhom != recomputed {sibs}")

    for i, cc in enumerate(c["can_cu"]):
        p = f"can_cu[{i}]"
        if cc["lien_ket"] is None:
            if cc["khop_nguyen_van_kho"] is not None:
                err(f"{p}.khop_nguyen_van_kho must be null without lien_ket")
            continue
        if cc["khop_nguyen_van_kho"] is None:
            err(f"{p}.khop_nguyen_van_kho must be true/false with lien_ket")
        if "2022" not in (cc["phien_ban_hs"] or ""):
            err(f"{p}.lien_ket set but phien_ban_hs {cc['phien_ban_hs']!r} is not the 2022 corpus version")
        name, n = cc["lien_ket"].split("#")
        lines = legal_lines(name)
        if lines is None or int(n) > len(lines) or not lines[int(n) - 1].strip():
            err(f"{p}.lien_ket {cc['lien_ket']} is not a line of db/seed/data/legal/")

    muc, loai = c["muc_lap_luan"], [cc["loai"] for cc in c["can_cu"]]
    if muc == "L4" and not any(x == "gri" or x.startswith("chu_giai_") for x in loai):
        err("muc_lap_luan L4 requires a can_cu of loai gri or chu_giai_*")
    if not loai and muc not in ("L0", "L1", "L2") and not (muc == "L3" and c["ung_vien"]):
        err(f"muc_lap_luan {muc} with empty can_cu (only L0-L2, or L3 with ung_vien)")


def check(cases: list[dict], rulings: dict[str, dict]) -> list[str]:
    errors: list[str] = []
    numbers: dict[str, list[int]] = defaultdict(list)
    seen = Counter(c.get("case_id") if isinstance(c, dict) else None for c in cases)
    for idx, c in enumerate(cases, 1):
        cid = c.get("case_id") if isinstance(c, dict) and isinstance(c.get("case_id"), str) else f"line {idx}"
        err = lambda m, cid=cid: errors.append(f"{cid}: {m}")  # noqa: E731
        before = len(errors)
        shape(c, SCHEMA, "", err)
        if len(errors) > before:
            continue  # later checks index fields freely
        if seen[cid] > 1:
            err("duplicate case_id")
        src, n = cid.rsplit("#", 1)
        if src != c["source_dir"]:
            err(f"case_id prefix {src!r} != source_dir")
            continue
        numbers[src].append(int(n))
        if src not in rulings:
            err("source_dir not in rulings file")
            continue
        check_case(c, rulings[src], err)
    for src, ns in numbers.items():
        if sorted(set(ns)) != list(range(1, len(set(ns)) + 1)):
            errors.append(f"{src}#*: case numbers {sorted(ns)} are not 1..n without gaps")
    return errors


def read_ndjson(path: Path, errors: list[str]) -> list[dict]:
    rows = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.strip():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                errors.append(f"line {i}: invalid JSON: {e}")
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cases")
    ap.add_argument("--rulings", default=str(OUT))
    args = ap.parse_args()
    errors: list[str] = []
    rulings = {r["source_dir"]: r for r in read_ndjson(Path(args.rulings), [])}
    cases = read_ndjson(Path(args.cases), errors)
    errors += check(cases, rulings)
    for e in errors:
        print(e)
    if errors:
        return 1
    print(f"OK: {len(cases)} cases from {len({c['source_dir'] for c in cases})} rulings, all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
