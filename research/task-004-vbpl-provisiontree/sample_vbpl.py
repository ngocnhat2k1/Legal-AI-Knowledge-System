#!/usr/bin/env python3
"""
TASK-004 probe: are vbpl.vn's `provisionTree` / `referenceProvisions` fields populated?

FINDING (verified 2026-07-18):
  vbpl.vn (rebuilt 2026-04-23 as a Next.js SPA) exposes its data through Next.js
  Server Actions (POST to the document page URL, `next-action` header, body ["<id>"],
  `accept: text/x-component`). Two distinct actions matter here:

    * DOC-DETAIL action 0fb12b3561faa05adec51a82efb3e4f4f427f07b
        -> the payload research 04 sampled. It carries `references[]`
           (each with targetDocument / referenceType / referenceProvisions) and a
           top-level `provisionTree` field.
        -> Across every document sampled, `provisionTree` is NULL and every
           `referenceProvisions` is NULL. References are DOCUMENT-level only;
           the int `referenceType` (values 3, 12, ...) has no recovered label map.

    * OUTLINE action 94635012466e8fede44782d4237c10fe75501920
        -> a SEPARATE action research 04 did not observe. It returns a fully
           populated clause-level tree: Chapter -> Article -> Clause -> Point
           (ptype 2/5/6/7, level Chapter/Article/Clause/Point), per document.
        -> So the clause-level STRUCTURE exists and is machine-readable; it is
           just not delivered through the `provisionTree` field.

  Net answer for TASK-004: PARTIAL.
    - `provisionTree` field (relationship payload): NULL everywhere sampled.
    - `referenceProvisions` (clause-level cross-reference edges): NULL everywhere.
    - clause-level document OUTLINE (via the outline action): POPULATED everywhere.

ACCEPTANCE:
  - Doc-detail: provisionTree == null and all referenceProvisions == null for every
    sampled recent document (Luat / Nghi dinh / Thong tu).
  - Outline: a non-empty Chapter/Article/Clause/Point tree for every published document.
  - The unpublished dangling control (id=12898, "Confirm_Step2", absent from sitemap)
    returns no document payload -- confirming references can point at documents that
    are not themselves retrievable.

CAVEAT:
  - The `next-action` hashes are build-specific and BREAK on every vbpl deploy. If a
    hash goes stale the doc-detail response no longer contains the "references"/"provisionTree"
    markers; this script detects that and aborts instead of silently reporting "all null".
    Re-discover the current hash with a headless browser (open a document, read the
    `next-action` request header) and update DOC_DETAIL_ACTION / OUTLINE_ACTION below.
  - Do not turn "provisionTree is null" into "vbpl has no clause structure" -- it does,
    via the outline action. The two layers must be reported separately.

Usage:  python3 sample_vbpl.py            # sample the built-in list, write samples.json
        python3 sample_vbpl.py <id> ...   # sample specific ids (numeric ItemID or UUID)

Stdlib only (urllib + json + re). No third-party dependencies, no browser at run time.
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter

DOC_DETAIL_ACTION = "0fb12b3561faa05adec51a82efb3e4f4f427f07b"
OUTLINE_ACTION = "94635012466e8fede44782d4237c10fe75501920"
BASE = "https://vbpl.vn/van-ban/chi-tiet/"
UA = "Mozilla/5.0 (research; Legal-AI-Knowledge-System TASK-004 provisionTree probe)"
DELAY_SECONDS = 1.5  # be polite; research 04 made ~40 requests without throttling

# Sample: recent (2026) documents pulled from the vbpl.vn homepage "newest" list on
# 2026-07-18, mixed across Luat / Nghi dinh / Thong tu, plus two controls.
# id is whatever follows the mandatory "--" in the URL: a numeric ItemID (migrated
# documents) or a UUID (documents created after the April 2026 relaunch).
SAMPLES = [
    # --- Luat ---
    ("187045", "Luat", "Luat Thue TNCN 109/2025/QH15 (control, recent)"),
    ("ec5cde10-54bc-11f1-abb8-a5ee305e759c", "Luat", "Luat Ho tich 03/2026/QH16"),
    ("f6e54110-4b5c-11f1-8c06-b5d7fb756254", "Luat", "Luat sd Luat Co quan dai dien"),
    ("9f320090-54c9-11f1-aa08-59e3f5ee2be8", "Luat", "Luat sd Luat Tro giup phap ly 05/2026"),
    # --- Nghi dinh ---
    ("113ff190-8023-11f1-9806-1dab8b6c3e51", "Nghi dinh", "ND 280/2026/ND-CP"),
    ("abc1ead0-7e97-11f1-b894-6dc9dff16474", "Nghi dinh", "ND 278/2026/ND-CP"),
    ("9d85c890-7f39-11f1-a307-ef47d5d415c6", "Nghi dinh", "ND 275/2026/ND-CP"),
    ("ee626bf0-8007-11f1-9817-a78f5fdc4853", "Nghi dinh", "ND 276/2026/ND-CP"),
    ("9402dd90-79c5-11f1-b498-9564c12b186d", "Nghi dinh", "ND 272/2026/ND-CP"),
    ("d4ba5790-8010-11f1-93ea-dd502af5ba0e", "Nghi dinh", "VBHN 68/2026/VBHN-ND-BCT"),
    ("187835", "Nghi dinh", "ND 135/2026/ND-CP (numeric ItemID)"),
    # --- Thong tu ---
    ("4fda4da0-80ec-11f1-ac2d-554d7f9461b5", "Thong tu", "TT 100/2026/TT-BTC"),
    ("2e0bbb80-8017-11f1-95e2-45a2bc394098", "Thong tu", "TT kiem toan noi bo"),
    ("839f4ab0-79a7-11f1-84f8-c94e29623f00", "Thong tu", "TT cong tac xa hoi"),
    ("399d9310-7e69-11f1-be38-974ae1f59c4b", "Thong tu", "TT 96/2026/TT-BTC"),
    ("7f147190-5009-11f1-a1c0-795b56a45f32", "Thong tu", "TT 08/2026/TT-NHNN"),
    ("28328cd0-4aba-11f1-954d-59440f3447aa", "Thong tu", "TT 24/2026/TT-BCT (AJCEP UAE)"),
    ("56b78ef0-5269-11f1-9836-b95caea4a391", "Thong tu", "TT 05/2026/TT-BTP"),
    ("a52b2d20-532d-11f1-8ff6-81b63e115254", "Thong tu", "TT 49/2026/TT-BCA"),
    ("66801", "Thong tu", "TT 200/2014/TT-BTC (numeric, older contrast)"),
    ("187977", "Thong tu", "TT 04/2026/TT-NHNN (numeric ItemID)"),
    # --- Control: unpublished dangling reference target (research 04) ---
    ("12898", "control", "Luat Thue TNCN 2007 (Confirm_Step2, dangling)"),
]


def _router_state_tree(id_segment):
    """Build the next-router-state-tree header value the App Router expects."""
    tree = ["", {"children": ["van-ban", {"children": [
        ["category", "chi-tiet", "d"], {"children": [
            ["id", id_segment, "d"], {"children": ["__PAGE__", {}, None, None]},
            None, None]}, None, None]}, None, None]}, None, None, True]
    return urllib.parse.quote(json.dumps(tree, separators=(",", ":")))


def _post_action(ident, action):
    id_segment = "--" + ident
    url = BASE + id_segment
    req = urllib.request.Request(url, data=json.dumps([ident]).encode(), method="POST")
    req.add_header("next-action", action)
    req.add_header("accept", "text/x-component")
    req.add_header("content-type", "text/plain;charset=UTF-8")
    req.add_header("next-router-state-tree", _router_state_tree(id_segment))
    req.add_header("user-agent", UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status, resp.read().decode("utf-8", "replace")


def analyse_doc_detail(text):
    """Extract the answer-bearing fields from the doc-detail RSC payload via regex.

    Returns dict, or {'has_payload': False} when the document has no retrievable
    payload (dangling / unpublished) or the action hash has gone stale.
    """
    has_payload = '"references":' in text or '"provisionTree":' in text
    if not has_payload:
        return {"has_payload": False}

    pt = re.search(r'"provisionTree":(null|\[|\{)', text)
    provision_tree = "null" if (pt and pt.group(1) == "null") else (
        "populated" if pt else "absent")

    # Each reference serialises as ...referenceProvisions:<v>...referenceType:<int>
    ref_pairs = re.findall(
        r'"referenceProvisions":(null|\[[^\]]*\]|\{[^}]*\}),"referenceType":(\d+)', text)
    ref_prov_values = Counter(("null" if v == "null" else "populated") for v, _ in ref_pairs)
    ref_types = sorted({int(t) for _, t in ref_pairs})

    def first(pat):
        m = re.search(pat, text)
        return m.group(1) if m else None

    return {
        "has_payload": True,
        "docNum": first(r'"docNum":"([^"]*)"'),
        "issueDate": (first(r'"issueDate":"([^"]*)"') or "")[:10],
        "provisionTree": provision_tree,
        "references_count": len(ref_pairs),
        "referenceProvisions": dict(ref_prov_values),
        "referenceType_values": ref_types,
    }


def analyse_outline(text):
    levels = re.findall(r'"level":"(Chapter|Article|Clause|Point)"', text)
    return {"nodes": len(levels), "by_level": dict(Counter(levels))}


def main():
    ids = sys.argv[1:]
    samples = [(i, "cli", i) for i in ids] if ids else SAMPLES

    results = []
    stale = False
    for ident, dtype, label in samples:
        row = {"id": ident, "type": dtype, "label": label}
        try:
            _, detail_txt = _post_action(ident, DOC_DETAIL_ACTION)
            row["doc_detail"] = analyse_doc_detail(detail_txt)
        except Exception as exc:  # noqa: BLE001 - report, do not crash the run
            row["doc_detail"] = {"error": repr(exc)}
        time.sleep(DELAY_SECONDS)
        try:
            _, outline_txt = _post_action(ident, OUTLINE_ACTION)
            row["outline"] = analyse_outline(outline_txt)
        except Exception as exc:  # noqa: BLE001
            row["outline"] = {"error": repr(exc)}
        time.sleep(DELAY_SECONDS)
        results.append(row)

        d = row["doc_detail"]
        o = row["outline"]
        if d.get("has_payload"):
            print(f"{ident[:16]:17} {dtype:9} pt={d['provisionTree']:9} "
                  f"refs={d['references_count']:>2} refProv={d['referenceProvisions']} "
                  f"refType={d['referenceType_values']} | outline={o.get('nodes',0):>3} "
                  f"{o.get('by_level',{})}")
        else:
            print(f"{ident[:16]:17} {dtype:9} NO DOC PAYLOAD (dangling/unpublished or stale hash)"
                  f" | outline={o.get('nodes',0)}")

    # Stale-hash guard: a published document must yield a doc-detail payload. If NONE
    # of the recent published samples did, the action hash is almost certainly stale.
    published = [r for r in results if r["type"] != "control"]
    if published and all(not r["doc_detail"].get("has_payload") for r in published):
        stale = True

    # Aggregate self-check over published documents.
    pt_states = Counter(r["doc_detail"].get("provisionTree")
                        for r in published if r["doc_detail"].get("has_payload"))
    refprov_any_populated = any(
        r["doc_detail"].get("referenceProvisions", {}).get("populated")
        for r in published if r["doc_detail"].get("has_payload"))
    outline_populated = sum(1 for r in results if r["outline"].get("nodes", 0) > 0)

    print("\n=== SELF-CHECK (published samples) ===")
    print(f"provisionTree field states: {dict(pt_states)}")
    print(f"any referenceProvisions populated? {refprov_any_populated}")
    print(f"documents with a populated outline tree: {outline_populated}/{len(results)}")
    if stale:
        print("!! STALE HASH: no published document returned a doc-detail payload. "
              "Re-discover next-action hashes before trusting any 'null' above.")

    with open("samples.json", "w", encoding="utf-8") as fh:
        json.dump({
            "verified": "2026-07-18",
            "doc_detail_action": DOC_DETAIL_ACTION,
            "outline_action": OUTLINE_ACTION,
            "stale_hash_suspected": stale,
            "results": results,
        }, fh, ensure_ascii=False, indent=2)
    print("\nWrote samples.json")


if __name__ == "__main__":
    main()
