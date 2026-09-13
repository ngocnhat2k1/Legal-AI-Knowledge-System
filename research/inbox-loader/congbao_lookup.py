#!/usr/bin/env python3
"""Find a document on Công báo WITHOUT the gazette_document index.

    python3 congbao_lookup.py 72/2022/NĐ-CP 52/2018/TT-BCT
    python3 congbao_lookup.py --title nghi-dinh-l1 'nhãn' 2026

The index (~15,500 documents) lived only in the VPS database and died with it.
Rebuilding it is ~8 hours of polite crawling. Nothing here needs it.

HOW. Công báo's search does not work server-side, and URL slugs are not checked (any
slug + a real id returns 200), so the only reliable read is the per-type listing, which
is ordered NEWEST FIRST. That ordering makes the listing binary-searchable on
(year, serial) of each entry's own number: ~11 page fetches instead of a linear walk of
up to ~940 pages for a 2011 circular. Measured 2026-09-10: nghị định page 100 ≈ 2022,
page 200 ≈ 2015; thông tư page 300 ≈ 2020, page 600 ≈ 2015.

Publication order within a year does not strictly follow the serial number, so the
search lands NEAR the target and then scans a window of pages around it.

Pages past the end are CLAMPED (they repeat the last page) rather than empty — a naive
walker never terminates. Clamping keeps the key sequence monotone, which is all the
binary search needs.

Listing pages are cached on disk for a day: re-runs cost nothing, and the current
year's pages still pick up newly published documents.
"""
from __future__ import annotations

import argparse
import html
import os
import re
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

BASE = "https://congbao.chinhphu.vn"
UA = {"User-Agent": "Mozilla/5.0 (compatible; CustomsAssistant/1.0; +internal tool)"}
CACHE = Path(os.environ.get("CONGBAO_CACHE", Path.home() / ".cache/customs-assistant/congbao"))
DELAY = float(os.environ.get("CONGBAO_DELAY", "0.8"))  # the gazette is a public service
CACHE_TTL = 24 * 3600
MAX_PAGE = 1200  # measured 2026-08-14: thông tư ≈ 940 pages, the deepest type

# Order matters: TTLT before TT-, and the suffix decides the listing, not the filename.
SLUG_BY_MARK = [
    ("NĐ-CP", "nghi-dinh-l1"),
    ("TTLT", "thong-tu-lien-tich-l5"),
    ("TT-", "thong-tu-l3"),
    ("QĐ-", "quyet-dinh-l2"),
    ("NQ-", "nghi-quyet-l6"),
    ("VBHN", "van-ban-hop-nhat-l7"),
    ("QH", "luat-l13"),
]
GAZETTE_DATE = re.compile(r"Công báo số[^<]*?ngày\s+(\d{4}-\d{2}-\d{2})")
ISSUED = re.compile(r"Ban hành:\s*(\d{2})/(\d{2})/(\d{4})")
NUMBER = re.compile(r"\bsố\s+(\d+[A-Za-zĐđ]?/\S+?)(?=[\s,;:]|$)", re.I)
_last_fetch = [0.0]


def nfc(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def canon(number: str) -> str:
    return nfc(number).upper().replace("Đ", "Đ").strip().rstrip(".,;:")


def key_of(number: str) -> tuple[int, int] | None:
    """(year, serial) — the ordering key. None when the number carries no year
    (e.g. `1725/QĐ-BCT`, an individual decision), which cannot be binary-searched."""
    m = re.match(r"(\d+)[A-Za-zĐđ]?/(\d{4})/", canon(number))
    return (int(m.group(2)), int(m.group(1))) if m else None


def slug_for(number: str) -> str | None:
    up = canon(number)
    for mark, slug in SLUG_BY_MARK:
        if mark in up:
            return slug
    return None


def fetch(slug: str, page: int) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{slug}-{page}.html"
    if path.exists() and time.time() - path.stat().st_mtime < CACHE_TTL:
        return path.read_text(encoding="utf-8")
    wait = DELAY - (time.time() - _last_fetch[0])
    if wait > 0:
        time.sleep(wait)
    url = f"{BASE}/van-ban-dang-cong-bao/{slug}/trang-{page}.htm"
    for attempt in range(3):
        try:
            body = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            text = body.decode("utf-8", "replace")
            _last_fetch[0] = time.time()
            path.write_text(text, encoding="utf-8")
            return text
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def entries(slug: str, page: int) -> list[dict]:
    """Documents on one listing page, newest first, de-duplicated by congbao id.

    Each entry also carries its gazette date ("Công báo số … ngày 2025-01-18") — the key
    the listing is actually ordered by — and its signing date ("Ban hành: 31/12/2024").
    """
    body = fetch(slug, page)
    seen, out = set(), []
    for m in re.finditer(r'href="(/van-ban/[^"]*?-(\d+)\.htm)"[^>]*>(.*?)</a>', body, re.S):
        href, cid, raw = m.group(1), m.group(2), m.group(3)
        title = nfc(re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", raw))).strip())
        if len(title) < 15 or cid in seen:
            continue
        num = NUMBER.search(title)
        if not num:
            continue
        seen.add(cid)
        tail = nfc(html.unescape(body[m.end(): m.end() + 3000]))
        g, i = GAZETTE_DATE.search(tail), ISSUED.search(tail)
        number = canon(num.group(1))
        out.append({"number": number, "key": key_of(number), "title": title, "id": int(cid),
                    "url": BASE + href, "gazette_date": g.group(1) if g else None,
                    "issued": f"{i.group(3)}-{i.group(2)}-{i.group(1)}" if i else None})
    return out


def oldest_key(slug: str, page: int) -> tuple[int, int] | None:
    keys = [e["key"] for e in entries(slug, page) if e["key"]]
    return min(keys) if keys else None


def find(number: str, window: int = 4) -> dict:
    """Locate `number` on Công báo. Returns the entry, or a dict with 'error'."""
    slug, target = slug_for(number), key_of(number)
    if not slug:
        return {"number": number, "error": "không suy được loại văn bản từ số hiệu"}
    if not target:
        return {"number": number, "error": "số hiệu không mang năm — không tìm nhị phân được "
                                           "(thường là văn bản cá biệt, có thể không đăng Công báo)"}
    lo, hi, probes = 1, MAX_PAGE, 0
    while lo < hi:
        mid = (lo + hi) // 2
        probes += 1
        k = oldest_key(slug, mid)
        if k is None or k > target:
            lo = mid + 1
        else:
            hi = mid
    want = canon(number)
    for radius in (window, window * 3):
        for page in sorted(range(max(1, lo - radius), lo + radius + 1), key=lambda p: abs(p - lo)):
            for e in entries(slug, page):
                if e["number"] == want:
                    return {**e, "page": page, "probes": probes}
    return {"number": number, "error": f"không thấy quanh trang {lo} của {slug}", "page": lo,
            "probes": probes}


def oldest_date(slug: str, page: int) -> str | None:
    dates = [e["gazette_date"] for e in entries(slug, page) if e["gazette_date"]]
    return min(dates) if dates else None


def find_near(number: str, approx: str, title_rx: str | None = None, window: int = 10) -> dict:
    """Locate `number` by GAZETTE DATE rather than by number.

    Needed for thông tư and quyết định: every ministry numbers its own series, so
    `11/2024/TT-BTTTT` (September) and `11/2024/TT-BTC` (February) share a serial yet sit
    hundreds of pages apart. Ordering by (year, serial) is only valid for single-issuer
    types — which is why `find()` works for nghị định and quietly misses these. The
    listing is ordered by publication, so publication date is the key that is monotone.

    `approx` is an estimate (signing date + a few weeks). If the number itself was misread
    (OCR), `title_rx` returns near-misses by title instead of nothing.
    """
    slug = slug_for(number)
    if not slug:
        return {"number": number, "error": "không suy được loại văn bản từ số hiệu"}
    lo, hi, probes = 1, MAX_PAGE, 0
    while lo < hi:
        mid = (lo + hi) // 2
        probes += 1
        d = oldest_date(slug, mid)
        if d is None or d > approx:
            lo = mid + 1
        else:
            hi = mid
    want, near = canon(number), []
    for page in sorted(range(max(1, lo - window), lo + window + 1), key=lambda p: abs(p - lo)):
        for e in entries(slug, page):
            if e["number"] == want:
                return {**e, "page": page, "probes": probes}
            if title_rx and re.search(title_rx, e["title"], re.I):
                near.append({**e, "page": page})
    return {"number": number, "error": f"không thấy trong ±{window} trang quanh trang {lo} ({approx})",
            "near": near, "probes": probes}


def scan_titles(slug: str, pattern: str, year_from: int) -> list[dict]:
    """Walk newest-first until entries fall below `year_from`; return titles matching
    `pattern`. The route for documents WITHOUT a number to search on — an unsigned
    copy whose number box is blank (R15)."""
    rx, hits = re.compile(pattern, re.I), []
    for page in range(1, MAX_PAGE + 1):
        rows = entries(slug, page)
        if not rows:
            break
        hits += [{**e, "page": page} for e in rows if rx.search(e["title"])]
        k = oldest_key(slug, page)
        if k and k[0] < year_from:
            break
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("numbers", nargs="*")
    ap.add_argument("--title", nargs=3, action="append", metavar=("SLUG", "REGEX", "YEAR_FROM"))
    ap.add_argument("--near", nargs="+", action="append", metavar="NUMBER DATE [TITLE_REGEX]",
                    help="tìm theo ngày đăng Công báo — dùng cho thông tư/quyết định")
    args = ap.parse_args()
    for number in args.numbers:
        r = find(number)
        if "error" in r:
            print(f"❌ {number:22} {r['error']}")
        else:
            print(f"✅ {number:22} id {r['id']:<7} trang {r['page']:<4} ({r['probes']} lần dò) {r['title'][:80]}")
            print(f"   {r['url']}")
        sys.stdout.flush()
    for spec in args.near or []:
        number, approx, rx = spec[0], spec[1], (spec[2] if len(spec) > 2 else None)
        r = find_near(number, approx, rx)
        if "error" in r:
            print(f"❌ {number:22} {r['error']}")
            for n in r.get("near", []):
                print(f"   ~ gần giống: {n['number']:22} id {n['id']:<7} {n['gazette_date']} {n['title'][:80]}")
        else:
            print(f"✅ {number:22} id {r['id']:<7} đăng {r['gazette_date']} ký {r['issued']} ({r['probes']} lần dò) {r['title'][:70]}")
            print(f"   {r['url']}")
        sys.stdout.flush()
    for slug, pattern, year in args.title or []:
        hits = scan_titles(slug, pattern, int(year))
        print(f"\n🔎 {slug} · /{pattern}/ · từ {year}: {len(hits)} kết quả")
        for h in hits:
            print(f"   {h['number']:22} id {h['id']:<7} {h['title'][:95]}")
        sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
