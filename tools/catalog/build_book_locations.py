#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
INDEX_ROOT = ROOT_DIR / "reader_lang_indexes"
REGISTRY_PATH = ROOT_DIR / "tools" / "state" / "source_registry.json"
OVERRIDES_PATH = ROOT_DIR / "tools" / "state" / "book_path_overrides.json"
DEFAULT_SHARDS_DIR = INDEX_ROOT / "book-locations"


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


def load_registry(path: Path) -> dict:
    data = read_json(path, {}) or {}
    source_defaults = data.get("defaults") if isinstance(data.get("defaults"), dict) else {}
    by_reader_id = {}
    for source, items in data.items():
        if source == "defaults":
            continue
        if not isinstance(items, dict):
            continue
        source_default = source_defaults.get(source) if isinstance(source_defaults.get(source), dict) else {}
        for key, item in items.items():
            reader_id = str((item or {}).get("reader_id") or key).strip()
            if not reader_id:
                continue
            source_book_id = str((item or {}).get("source_book_id") or key).strip() or reader_id
            public_path_mode = str((item or {}).get("public_path_mode") or source_default.get("public_path_mode") or "legacy").strip() or "legacy"
            local_content_path = str((item or {}).get("local_content_path") or source_default.get("local_content_path") or f"/books/content/{reader_id}/").strip() or f"/books/content/{reader_id}/"
            by_reader_id[reader_id] = {
                "source": source,
                "sourceBookId": source_book_id,
                "label": str((item or {}).get("label") or "").strip(),
                "publicPathMode": public_path_mode,
                "localContentPath": local_content_path,
            }
    return {"defaults": source_defaults, "by_reader_id": by_reader_id}


def load_state_overrides(path: Path | None) -> dict:
    if not path:
        return {}
    data = read_json(path, {}) or {}
    processed = data.get("processed") if isinstance(data.get("processed"), dict) else {}
    overrides = {}
    for reader_id, item in processed.items():
        if not isinstance(item, dict):
            continue
        public_content_path = str(item.get("public_content_path") or "").strip()
        target_path = str(item.get("target_path") or "").strip()
        local_content_path = str(item.get("local_content_path") or "").strip()
        public_path_mode = str(item.get("public_path_mode") or "").strip()
        source = str(item.get("source") or "").strip()
        source_book_id = str(item.get("source_book_id") or "").strip()
        if not any([public_content_path, target_path, local_content_path, public_path_mode, source, source_book_id]):
            continue
        overrides[str(reader_id)] = {
            "publicContentPath": public_content_path,
            "targetPath": target_path,
            "localContentPath": local_content_path,
            "publicPathMode": public_path_mode,
            "source": source,
            "sourceBookId": source_book_id,
        }
    return overrides


def load_path_overrides(path: Path | None) -> dict:
    if not path:
        return {}
    data = read_json(path, {}) or {}
    items = data.get("items") if isinstance(data.get("items"), dict) else data if isinstance(data, dict) else {}
    overrides = {}
    for reader_id, item in items.items():
        if not isinstance(item, dict):
            continue
        overrides[str(reader_id)] = {
            "publicContentPath": str(item.get("publicContentPath") or item.get("contentPath") or "").strip(),
            "targetPath": str(item.get("targetPath") or "").strip(),
            "localContentPath": str(item.get("localContentPath") or "").strip(),
            "publicPathMode": str(item.get("publicPathMode") or "").strip(),
            "source": str(item.get("source") or "").strip(),
            "sourceBookId": str(item.get("sourceBookId") or "").strip(),
        }
    return overrides


def shard_for_reader_id(reader_id: str) -> str:
    raw = str(reader_id or "").strip()
    if raw.isdigit():
        return f"{int(raw) % 100:02d}"
    total = 0
    for char in raw:
        total = (total + ord(char)) % 100
    return f"{total:02d}"


def iter_books(index_root: Path):
    for path in sorted((index_root / "a").glob("*.json")):
        data = read_json(path, {}) or {}
        author = str(data.get("name") or "").strip()
        for book in data.get("books") or []:
            # Prefer the canonical/public id over legacyId so non-Gutenberg
            # sources keep their source-qualified ids in book-locations.
            reader_id = str(book.get("readerId") or book.get("reader_id") or book.get("id") or book.get("legacyId") or book.get("legacy_id") or "").strip()
            public_id = str(book.get("sourceBookId") or book.get("source_book_id") or book.get("id") or reader_id).strip()
            source = str(book.get("source") or "").strip()
            title = str(book.get("title") or public_id or reader_id).strip()
            cover = str(book.get("cover") or "").strip()
            if not reader_id:
                continue
            yield reader_id, {
                "publicId": public_id or reader_id,
                "source": source,
                "title": title,
                "author": author,
                "cover": cover,
                "readerType": str(book.get("readerType") or book.get("reader_type") or "legacy").strip() or "legacy",
            }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build reader_id -> content path mapping.")
    parser.add_argument("--index-root", default=str(INDEX_ROOT))
    parser.add_argument("--registry", default=str(REGISTRY_PATH))
    parser.add_argument("--overrides", default=str(OVERRIDES_PATH))
    parser.add_argument("--state")
    parser.add_argument("--output", default=str(INDEX_ROOT / "book-locations.json"))
    parser.add_argument("--shards-dir", default=str(DEFAULT_SHARDS_DIR))
    args = parser.parse_args()

    index_root = Path(args.index_root).resolve()
    registry = load_registry(Path(args.registry).resolve())
    by_reader_id = registry["by_reader_id"]
    path_overrides = load_path_overrides(Path(args.overrides).resolve()) if args.overrides else {}
    state_overrides = load_state_overrides(Path(args.state).resolve()) if args.state else {}
    shards_dir = Path(args.shards_dir).resolve()

    items = {}
    legacy_shards = {}
    source_shards = {}
    for reader_id, book in iter_books(index_root):
        source_info = by_reader_id.get(reader_id)
        path_info = path_overrides.get(reader_id, {})
        state_info = state_overrides.get(reader_id, {})
        merged_info = {}
        merged_info.update(path_info)
        merged_info.update({key: value for key, value in state_info.items() if value})
        if source_info:
            source = str(merged_info.get("source") or book.get("source") or source_info["source"]).strip()
            source_book_id = str(merged_info.get("sourceBookId") or book.get("publicId") or source_info["sourceBookId"]).strip()
            public_path_mode = str(merged_info.get("publicPathMode") or source_info.get("publicPathMode") or "legacy").strip() or "legacy"
            local_content_path = str(merged_info.get("localContentPath") or source_info.get("localContentPath") or f"/books/content/{reader_id}/").strip() or f"/books/content/{reader_id}/"
        else:
            source = str(merged_info.get("source") or book.get("source") or "gutenberg").strip() or "gutenberg"
            source_book_id = str(merged_info.get("sourceBookId") or book.get("publicId") or reader_id).strip() or reader_id
            public_path_mode = str(merged_info.get("publicPathMode") or "legacy").strip() or "legacy"
            local_content_path = str(merged_info.get("localContentPath") or f"/books/content/{reader_id}/").strip() or f"/books/content/{reader_id}/"
        legacy_path = f"/books/content/{reader_id}/"
        target_path = str(merged_info.get("targetPath") or f"/books/content/{source}/{source_book_id}/").strip() or f"/books/content/{source}/{source_book_id}/"
        public_content_path = str(merged_info.get("publicContentPath") or (target_path if public_path_mode == "target" else legacy_path)).strip() or legacy_path
        item = {
            "readerId": reader_id,
            "legacyId": reader_id,
            "source": source,
            "sourceBookId": source_book_id,
            "legacyPath": legacy_path,
            "localContentPath": local_content_path,
            "contentPath": public_content_path,
            "targetPath": target_path,
            "publicPathMode": public_path_mode,
            "title": book["title"],
            "author": book["author"],
            "cover": book["cover"],
            "readerType": book.get("readerType", "legacy"),
        }
        items[reader_id] = item
        if source == "gutenberg":
            legacy_shard = shard_for_reader_id(reader_id)
            legacy_shards.setdefault(legacy_shard, {})[reader_id] = item
        source_shard = shard_for_reader_id(source_book_id)
        source_shards.setdefault(source, {}).setdefault(source_shard, {})[source_book_id] = item

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    payload = {
        "version": "1",
        "generatedAt": generated_at,
        "count": len(items),
        "items": items,
    }
    write_json(Path(args.output).resolve(), payload)
    for shard, shard_items in sorted(legacy_shards.items()):
        write_json(shards_dir / f"{shard}.json", {
            "version": "1",
            "generatedAt": generated_at,
            "count": len(shard_items),
            "shard": shard,
            "items": shard_items,
        })
    for source, shard_map in sorted(source_shards.items()):
        for shard, shard_items in sorted(shard_map.items()):
            write_json(shards_dir / source / f"{shard}.json", {
                "version": "1",
                "generatedAt": generated_at,
                "source": source,
                "count": len(shard_items),
                "shard": shard,
                "items": shard_items,
            })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
