"""The manifest: what was exported, what actually reached Drive, and under which fileId.

WHY TWO HASHES. The obvious design keeps one hash per file and pushes when it changes.
That design loses data silently. rclone can die halfway through a batch — network drop,
expired token, a 403 quota, a convert timeout on a 640K-character file. If the manifest
was written for the whole batch, the next run sees matching hashes and SKIPS exactly the
files that never reached Drive. The notebook then serves stale text forever, and there
is no error anywhere.

Worse, it cannot be detected afterwards: a Google Doc reports `size = -1` and exposes no
hash, so there is no way to compare local against Drive. The manifest is the only record,
and a single-hash manifest records INTENT rather than RESULT.

So:

    hash_exported   written by the renderer, the moment the file is produced
    hash_pushed     written ONLY after rclone exits 0 for that specific file

    push when   hash_exported != hash_pushed   OR   hash_pushed is absent

`hash_pushed` absent means "never reached Drive", so it is always pushed. That single
rule makes a half-finished run self-healing on the next attempt, with no retry logic.

WHY fileId IS RECORDED. rclone updates an existing Doc in place, keeping its fileId — as
long as the local filename still matches the Doc name. If it ever creates a NEW file
instead, the notebook source still points at the OLD, now-orphaned Doc and silently stops
updating. Comparing fileId across runs is the only way to catch that, so a change is an
alarm, not a note.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

MANIFEST_VERSION = 1

#: Sources that are DERIVED — an index, a status table, notes regenerated from .agent/ —
#: and so change by design whenever anything else changes. The append-only rule protects
#: legal text; applying it to an index would force `--force` on every run, and a flag that
#: is always passed protects nothing. Everything not listed here stays append-only.
MUTABLE = frozenset({
    "00-tinh-trang-hieu-luc.md",
    "01-huong-dan-su-dung.md",
    "30-kien-thuc-nghiep-vu.md",
})


def is_extension(old: str, new: str) -> bool:
    """True when every non-blank line of `old` is still in `new`, in the same order.

    This is what "append-only" means for a CONSOLIDATED source. Several documents share one
    notebook source, so adding a document necessarily changes the file: a new section, one
    more line in the source's document list. That must pass — the owner adds material
    gradually, and a guard that fires on every addition trains everyone to pass --force,
    after which it protects nothing. What must NOT pass is any edit, removal or reordering
    of text that is already live: that is exactly how a parser regression would silently
    rewrite the law inside a source nobody is re-reading.
    """
    remaining = iter(_visible(line) for line in new.splitlines() if line.strip())
    return all(any(_visible(line) == candidate for candidate in remaining)
               for line in old.splitlines() if line.strip())


_MD_ESCAPE = re.compile(r"\\([!-/:-@\[-`{-~])")


def _visible(line: str) -> str:
    """The line as a reader of the Doc sees it. Backslash escapes, trailing hard-break spaces
    and leading indentation are MARKUP — docs_safe adds or removes them so Docs keeps
    numbering and line breaks, and a Doc paragraph shows no leading spaces anyway. Comparing
    on this is what lets a markup-only fix pass without --force — and proves, in the same
    step, that it changed no text. A changed digit still fails."""
    return _MD_ESCAPE.sub(r"\1", line).strip()


def visible_lines(text: str) -> list[str]:
    return [_visible(line) for line in text.splitlines() if line.strip()]


def content_hash(text: str) -> str:
    """SHA-256 of the file's text. Not the mtime: the renderer is deterministic, so
    identical input must look identical here even across machines and days."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Manifest:
    def __init__(self, path: Path):
        self.path = Path(path)
        if self.path.exists():
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            self.entries: dict[str, dict] = raw.get("entries", {})
        else:
            self.entries = {}

    # ---------------------------------------------------------------- persistence
    def save(self) -> None:
        payload = {"version": MANIFEST_VERSION, "entries": self.entries}
        self.path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    # ------------------------------------------------------------------- exporting
    def record_export(self, name: str, text: str, *, documents: list[str] | None = None,
                      previous_text: str | None = None, force: bool = False) -> str:
        """Record that `name` was rendered. Returns 'new' | 'unchanged' | 'reformatted' | 'extended' | 'changed'.

        A file already in the manifest may only GROW: `previous_text` — the exact text last
        pushed — must survive line for line (see is_extension). With no snapshot of what
        was pushed there is nothing to prove an extension against, so any change is refused.
        `force` (a derived source, or an explicit --force-file) overrides.
        """
        digest = content_hash(text)
        entry = self.entries.get(name)
        if entry is None:
            self.entries[name] = {
                "hash_exported": digest,
                "hash_pushed": None,
                "drive_file_id": None,
                "drive_modtime": None,
                "pushed_at": None,
                "documents": sorted(documents or []),
            }
            return "new"
        if entry["hash_exported"] == digest:
            if documents:
                entry["documents"] = sorted(documents)
            return "unchanged"
        if not force and previous_text is not None and is_extension(previous_text, text):
            entry["hash_exported"] = digest
            if documents:
                entry["documents"] = sorted(documents)
            if visible_lines(previous_text) == visible_lines(text):
                return "reformatted"   # markup only — every visible line identical
            return "extended"
        if not force:
            raise ValueError(
                f"{name}: nội dung ĐÃ ĐẨY bị sửa hoặc xoá (không phải chỉ thêm). Nếu đúng là "
                f"cố ý — sửa parser, lọc rác, gỡ một tài liệu — chỉ định đích danh bằng "
                f"--force-file {name}."
            )
        entry["hash_exported"] = digest
        if documents:
            entry["documents"] = sorted(documents)
        return "changed"

    # -------------------------------------------------------------------- pushing
    def needs_push(self, name: str) -> bool:
        entry = self.entries.get(name)
        if entry is None:
            return True
        return entry.get("hash_pushed") != entry["hash_exported"]

    def pending(self) -> list[str]:
        return sorted(n for n in self.entries if self.needs_push(n))

    def record_push(self, name: str, *, file_id: str | None, modtime: str | None,
                    pushed_at: str) -> str | None:
        """Mark `name` as actually on Drive. Returns the PREVIOUS fileId if it changed.

        A changed fileId means rclone created a new Doc instead of updating the old one:
        the notebook source now points at an orphan. Callers must treat a non-None
        return as an alarm, not a log line.
        """
        entry = self.entries[name]
        previous = entry.get("drive_file_id")
        entry["hash_pushed"] = entry["hash_exported"]
        entry["drive_file_id"] = file_id
        entry["drive_modtime"] = modtime
        entry["pushed_at"] = pushed_at
        return previous if (previous and file_id and previous != file_id) else None

    # ---------------------------------------------------------------------- report
    def summary(self) -> dict[str, int]:
        pending = sum(1 for n in self.entries if self.needs_push(n))
        return {
            "total": len(self.entries),
            "pending": pending,
            "in_sync": len(self.entries) - pending,
        }
