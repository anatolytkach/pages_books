#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Tuple

from sync_gutenberg_indexes import BookRecord, load_book_maps


def read_json(path: Path, default=None):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def parse_timestamp(value: str) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def build_payload(
    ids: List[str],
    books_by_id: Dict[str, BookRecord],
    added_at_by_id: Dict[str, str],
    generated_at: str,
    window_days: int,
) -> dict:
    books = []
    for book_id in ids:
        record = books_by_id.get(book_id)
        if not record:
            continue
        books.append(
            {
                "id": record.id,
                "source": getattr(record, "source", "gutenberg") or "gutenberg",
                "legacyId": getattr(record, "legacy_id", "") or "",
                "title": record.title,
                "author": record.author,
                "cover": record.cover or "",
                "language": record.language or "",
                "catalogAddedAt": added_at_by_id.get(book_id, ""),
            }
        )
    return {
        "windowDays": window_days,
        "generatedAt": generated_at,
        "count": len(books),
        "books": books,
    }


def collect_recent_ids(state: dict, now: datetime, window_days: int, max_books: int) -> Tuple[List[str], Dict[str, str]]:
    cutoff = now - timedelta(days=window_days)
    processed = state.get("processed") or {}
    recent = []
    added_at_by_id: Dict[str, str] = {}
    for book_id, item in processed.items():
        if str(item.get("status") or "").strip() != "success":
            continue
        added_at = parse_timestamp(item.get("catalog_added_at") or "")
        if not added_at or added_at < cutoff:
            continue
        recent.append((added_at, str(book_id)))
        added_at_by_id[str(book_id)] = added_at.isoformat().replace("+00:00", "Z")
    recent.sort(key=lambda pair: (pair[0], pair[1]), reverse=True)
    selected_ids = [book_id for _dt, book_id in recent[:max_books]]
    selected_added_at = {book_id: added_at_by_id[book_id] for book_id in selected_ids if book_id in added_at_by_id}
    return selected_ids, selected_added_at


def main() -> int:
    parser = argparse.ArgumentParser(description="Build ReaderPub newest-releases discover payloads.")
    parser.add_argument("--state", required=True, help="Path to downloaded Gutenberg pipeline state JSON")
    parser.add_argument("--index-root", default=str(Path(__file__).resolve().parents[2] / "reader_lang_indexes"))
    parser.add_argument("--window-days", type=int, default=7)
    parser.add_argument("--max-books", type=int, default=12)
    parser.add_argument("--now")
    args = parser.parse_args()

    state = read_json(Path(args.state), {}) or {}
    now = parse_timestamp(args.now) if args.now else None
    if now is None:
        now = datetime.now(timezone.utc)
    generated_at = now.isoformat().replace("+00:00", "Z")

    recent_ids, added_at_by_id = collect_recent_ids(state, now, args.window_days, max(args.max_books, 0))
    index_root = Path(args.index_root).resolve()
    global_books, language_books = load_book_maps(index_root)

    global_payload = build_payload(recent_ids, global_books, added_at_by_id, generated_at, args.window_days)
    write_json(index_root / "discover" / "newest.json", global_payload)

    for lang, book_map in language_books.items():
        lang_ids = [book_id for book_id in recent_ids if book_id in book_map]
        payload = build_payload(lang_ids, book_map, added_at_by_id, generated_at, args.window_days)
        write_json(index_root / "lang" / lang / "discover" / "newest.json", payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
