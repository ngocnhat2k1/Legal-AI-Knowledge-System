#!/usr/bin/env python3
"""Merge a dual-read workflow result into db/seed/data/legal/classification-rulings.ndjson.

    python3 merge_rulings.py <workflow-output.json> [--allow-flagged]

The workflow (workflows/classification-rulings-dual-read.js) returns, per ruling, an
extraction and an INDEPENDENT verification against the page images. This script:

  * upserts by source directory, so re-reading one ruling replaces just that ruling;
  * derives the digits-only HS code FROM `ma_hs` and never trusts the agent's own digits
    field — on 2026-09-10 one agent typed 85343000 for 8534.00.30;
  * grades every code against the AHTN 2022 nomenclature in the repo (`hs2022`): a 2005
    ruling cites the 2003 nomenclature, and its code may no longer exist. A code that no
    longer exists is still a real-looking code — exactly R3 — so the grade is printed next
    to it in the notebook;
  * refuses rulings whose verification is not `khop` unless --allow-flagged.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "db/seed/data"
OUT = DATA / "legal/classification-rulings.ndjson"


def nomenclature() -> tuple[set[str], set[str], set[str]]:
    codes: set[str] = set()
    for name in ("hs-descriptions.ndjson", "nd26-muc1.ndjson"):
        with (DATA / name).open(encoding="utf-8") as fh:
            codes |= {json.loads(l)["hs"] for l in fh if l.strip()}
    return codes, {c[:6] for c in codes}, {c[:4] for c in codes}


def grade(digits: str, codes, h6, h4) -> str:
    if not digits:
        return "khong_co_ma"
    if len(digits) == 8:
        if digits in codes:
            return "hien_hanh"
        return "doi_ma_8_so" if digits[:6] in h6 else "phan_nhom_da_tach_hoac_bo"
    if len(digits) == 6:
        return "hien_hanh_cap_phan_nhom" if digits in h6 else "phan_nhom_da_tach_hoac_bo"
    if len(digits) == 4:
        return "hien_hanh_cap_nhom" if digits in h4 else "nhom_khong_con"
    return "khong_hop_le"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("workflow_output")
    ap.add_argument("--allow-flagged", action="store_true")
    args = ap.parse_args()
    raw = json.loads(Path(args.workflow_output).read_text(encoding="utf-8"))
    results = raw.get("result", raw)["results"]
    codes, h6, h4 = nomenclature()
    rows = {r["source_dir"]: r for r in map(json.loads, OUT.read_text(encoding="utf-8").splitlines()) if r} \
        if OUT.exists() else {}
    refused = []
    for x in results:
        v = x.get("verify") or {}
        if v.get("ket_luan") != "khop" and not args.allow_flagged:
            refused.append((x["dir"], v.get("ket_luan"), v.get("sai_khac")))
            continue
        e = x["extract"]
        for m in e["mat_hang"]:
            digits = "".join(ch for ch in (m.get("ma_hs") or "") if ch.isdigit())
            m["ma_hs_so"] = digits or None
            m["hs2022"] = grade(digits, codes, h6, h4)
        rows[x["dir"]] = {**e, "source_dir": x["dir"], "scanned": x["scanned"],
                          "verification": {"ket_luan": v.get("ket_luan"), "ma_hs": v.get("ma_hs"),
                                           "sai_khac": v.get("sai_khac")}}
        print(f"   gộp {x['dir']:40} {e.get('so_hieu') or '—':18} {len(e['mat_hang'])} mặt hàng")
    ordered = sorted(rows.values(), key=lambda r: (r.get("ngay_ban_hanh") or "9999", r.get("so_hieu") or ""))
    with OUT.open("w", encoding="utf-8") as fh:
        for r in ordered:
            fh.write(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n")
    print(f"{len(ordered)} văn bản trong {OUT.relative_to(ROOT)}")
    for d, k, why in refused:
        print(f"   ❌ KHÔNG gộp {d}: thẩm tra = {k} — {str(why)[:160]}")
    return 1 if refused else 0


if __name__ == "__main__":
    raise SystemExit(main())
