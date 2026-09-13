#!/usr/bin/env python3
"""Push rendered notebook sources to Google Drive as Google Docs, one file at a time.

    python3 push_notebook.py --dest <thư-mục-đã-render> --remote gdrive:Legal-AI-Notebook

Drive is the only place a notebook source can live and still auto-sync (ADR
2026-09-10-notebook-sources-as-google-docs). rclone converts each `.md` into a Google
Doc and, on later runs, replaces that Doc's content **keeping the same fileId** — which
is what keeps the notebook source alive across updates.

FOUR FLAGS/HABITS THAT LOOK OPTIONAL AND ARE NOT:

  --drive-import-formats md    without it rclone will not convert markdown at all
  --drive-export-formats md    without it rclone lists the remote Doc as `<name>.docx`,
                               fails to match `<name>.md`, and errors out with
                               "can't convert \".md\" to a document with a different
                               export filetype (\".docx\")"
  never --checksum             a Google Doc has size -1 and no hash; with --checksum
                               rclone falls back to size-only, declares the pair equal
                               and SKIPS the upload — silently serving stale text
  never `rclone sync`          sync deletes on the destination; deleting a Drive file
                               removes the corresponding source from the notebook

The manifest — not rclone's own comparison logic — decides what to push. rclone cannot
see inside a Google Doc, so letting it judge would mean letting a blind comparator veto
a known-needed upload.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from manifest import MUTABLE, Manifest, content_hash  # noqa: E402

FLAGS = ["--drive-import-formats", "md", "--drive-export-formats", "md"]


def run(args: list[str], *, timeout: int = 600) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout)


def remote_info(remote_file: str) -> tuple[str | None, str | None]:
    """Read back the Doc we just wrote: its fileId and modification time.

    This is the only evidence the Drive side can give us — a Google Doc exposes neither
    size nor hash — and it is what makes a changed fileId detectable.
    """
    proc = run(["rclone", "lsjson", remote_file, *FLAGS])
    if proc.returncode != 0:
        return None, None
    try:
        rows = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None, None
    if not rows:
        return None, None
    return rows[0].get("ID"), rows[0].get("ModTime")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dest", required=True, help="thư mục chứa file .md đã render")
    ap.add_argument("--remote", required=True, help="ví dụ gdrive:Legal-AI-Notebook")
    ap.add_argument("--manifest", default=None, help="mặc định <dest>/manifest.json")
    ap.add_argument("--force", action="store_true",
                    help="cho phép ghi đè file đã có trong manifest (sinh lại cả kho)")
    ap.add_argument("--force-file", action="append", default=[], metavar="TÊN.md",
                    help="cho phép ghi đè ĐÚNG file này (lặp lại được) — hẹp hơn --force, vốn mở cho mọi file")
    ap.add_argument("--dry-run", action="store_true", help="chỉ báo sẽ đẩy gì, không đẩy")
    args = ap.parse_args()

    dest = Path(args.dest).expanduser()
    files = sorted(p for p in dest.glob("*.md"))
    if not files:
        print(f"không có file .md nào trong {dest}", file=sys.stderr)
        return 1

    man = Manifest(Path(args.manifest) if args.manifest else dest / "manifest.json")
    # Exact text of every file as last pushed — the evidence is_extension() compares against.
    # Kept beside the rendered files (not in git: it is a cache of what Drive holds).
    snapshots = dest / ".pushed"
    snapshots.mkdir(exist_ok=True)

    # --- 1. ghi nhận bản render, cưỡng chế luật không-ghi-đè -------------------
    for path in files:
        text = path.read_text(encoding="utf-8")
        snap = snapshots / path.name
        previous = snap.read_text(encoding="utf-8") if snap.exists() else None
        try:
            allowed = args.force or path.name in MUTABLE or path.name in args.force_file
            state = man.record_export(path.name, text, previous_text=previous, force=allowed)
        except ValueError as exc:
            print(f"❌ {exc}", file=sys.stderr)
            return 2
        if state != "unchanged":
            print(f"   {state:9} {path.name}")

    pending = [n for n in man.pending() if (dest / n).exists()]
    if not pending:
        man.save()
        s = man.summary()
        print(f"\n0 file mới, 0 ghi đè, 0 đẩy — {s['in_sync']}/{s['total']} nguồn đã đồng bộ")
        return 0

    print(f"\n{len(pending)}/{len(files)} nguồn cần đẩy lên {args.remote}")
    if args.dry_run:
        for name in pending:
            print(f"   sẽ đẩy  {name}")
        return 0

    # --- 2. đẩy TỪNG FILE, kiểm mã thoát từng file ----------------------------
    alarms: list[str] = []
    failed: list[str] = []
    for index, name in enumerate(pending, 1):
        local = dest / name
        remote_file = f"{args.remote}/{name}"
        print(f"   [{index}/{len(pending)}] {name} … ", end="", flush=True)
        proc = run(["rclone", "copyto", str(local), remote_file, *FLAGS])
        if proc.returncode != 0:
            failed.append(name)
            print("❌")
            print(f"      {proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else 'lỗi không rõ'}")
            # Cố ý KHÔNG ghi hash_pushed: lần chạy sau sẽ tự đẩy lại file này.
            continue
        file_id, modtime = remote_info(remote_file)
        previous = man.record_push(name, file_id=file_id, modtime=modtime,
                                   pushed_at=datetime.now(timezone.utc).isoformat())
        man.save()  # ghi ngay sau TỪNG file — không bao giờ theo lô
        (snapshots / name).write_text(local.read_text(encoding="utf-8"), encoding="utf-8")
        if previous:
            alarms.append(f"{name}: fileId {previous} → {file_id}")
            print("⚠️")
        else:
            print("✅")

    man.save()
    summary = man.summary()
    print(f"\n{summary['in_sync']}/{summary['total']} nguồn đã đồng bộ với Drive")

    if alarms:
        print("\n🔴 fileId ĐÃ ĐỔI — rclone tạo Doc MỚI thay vì cập nhật Doc cũ.")
        print("   Nguồn tương ứng trong notebook đang trỏ vào Doc mồ côi và sẽ KHÔNG cập nhật nữa.")
        print("   Phải gỡ nguồn cũ khỏi notebook và thêm lại từ Doc mới:")
        for line in alarms:
            print(f"   - {line}")
    if failed:
        print(f"\n⚠️ {len(failed)} file chưa lên được Drive — chạy lại lệnh này để đẩy tiếp:")
        for name in failed:
            print(f"   - {name}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
