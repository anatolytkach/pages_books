#!/usr/bin/env python3
from __future__ import annotations

import json
import time
from pathlib import Path

from build_seo_indexes import (
    AUTHOR_SLUG_MAX,
    clean_text,
    json_load,
    json_dump,
    kebab_slug,
    load_author_indexes,
    load_book_locations,
    stable_ascii_fallback,
    trim_slug,
)


ROOT = Path(__file__).resolve().parents[2]
INDEX_ROOT = ROOT / "reader_lang_indexes"
SEO_ROOT = ROOT / "reader_seo_indexes"


def load_manual_books():
    book_locations = load_book_locations(INDEX_ROOT)
    authors, books_by_id = load_author_indexes(INDEX_ROOT, book_locations)

    author_slug_seen = set()
    author_slug_by_key = {}
    for author_key, author in authors.items():
        base = trim_slug(
            kebab_slug(author["name"], stable_ascii_fallback("author", author_key)),
            AUTHOR_SLUG_MAX,
        )
        collision_suffix = stable_ascii_fallback("a", author_key).split("-", 1)[1]
        if base not in author_slug_seen:
            slug = base
        else:
            suffix = trim_slug(collision_suffix, 16)
            slug = trim_slug(f"{base}-{suffix}", AUTHOR_SLUG_MAX)
        author_slug_seen.add(slug)
        author_slug_by_key[author_key] = slug

    manual_books = {}
    manual_authors = {}
    for author_key, author in authors.items():
        books = []
        for seed in author["books"]:
            if not seed.content_path.startswith("/books/content/manual/"):
                continue
            source_book_id = seed.content_path.rstrip("/").split("/")[-1]
            books.append(
                {
                    "id": seed.id,
                    "legacyId": seed.legacy_id,
                    "sourceBookId": source_book_id,
                    "title": seed.title,
                    "authorName": seed.author_name,
                    "authorKey": seed.author_key,
                    "authorSlug": author_slug_by_key[seed.author_key],
                    "cover": seed.cover,
                    "contentPath": seed.content_path,
                    "readerUrl": f"/books/reader/?id={seed.id}&source=manual",
                }
            )
        if books:
            books.sort(key=lambda item: item["title"].lower())
            manual_authors[author_key] = {
                "name": author["name"],
                "slug": author_slug_by_key[author_key],
                "books": books,
            }
            for book in books:
                manual_books[book["legacyId"]] = book
    return manual_books, manual_authors


def patch_book_shards(manual_books: dict[str, dict], version: str):
    changed = []
    for path in sorted((SEO_ROOT / "book-shards").glob("*.json")):
        payload = json_load(path, {}) or {}
        items = payload.get("items") or {}
        touched = False
        for item in items.values():
            legacy_id = clean_text(item.get("id", ""))
            replacement = manual_books.get(legacy_id)
            if not replacement:
                continue
            item["id"] = replacement["id"]
            item["authorName"] = replacement["authorName"]
            item["authorKey"] = replacement["authorKey"]
            item["authorSlug"] = replacement["authorSlug"]
            item["cover"] = replacement["cover"]
            item["contentPath"] = replacement["contentPath"]
            item["readerUrl"] = replacement["readerUrl"]
            item["version"] = version
            item["generatedAt"] = version
            touched = True
        if touched:
            payload["version"] = version
            json_dump(path, payload)
            changed.append(path)
    return changed


def patch_author_shards(manual_authors: dict[str, dict], version: str):
    changed = []
    for path in sorted((SEO_ROOT / "author-shards").glob("*.json")):
        payload = json_load(path, {}) or {}
        items = payload.get("items") or {}
        touched = False
        for author in items.values():
            author_key = clean_text(author.get("key", ""))
            replacement = manual_authors.get(author_key)
            if not replacement:
                continue
            existing_books = author.get("books", []) or []
            existing_by_id = {clean_text(book.get("id", "")): book for book in existing_books}
            existing_by_title = {clean_text(book.get("title", "")): book for book in existing_books}
            author["slug"] = replacement["slug"]
            author["name"] = replacement["name"]
            author["key"] = author_key
            author["books"] = [
                {
                    "id": book["id"],
                    "slug": (
                        existing_by_id.get(book["legacyId"], {}).get("slug")
                        or existing_by_title.get(book["title"], {}).get("slug")
                        or kebab_slug(book["title"], f"book-{book['id']}")
                    ),
                    "title": book["title"],
                    "cover": book["cover"],
                }
                for book in replacement["books"]
            ]
            author["count"] = len(author["books"])
            author["version"] = version
            author["generatedAt"] = version
            touched = True
        if touched:
            payload["version"] = version
            json_dump(path, payload)
            changed.append(path)
    return changed


def patch_version(version: str):
    path = SEO_ROOT / "version.json"
    payload = json_load(path, {}) or {}
    payload["version"] = version
    payload["generatedAt"] = version
    json_dump(path, payload)
    return path


def main() -> int:
    version = str(int(time.time()))
    manual_books, manual_authors = load_manual_books()
    if not manual_books:
        print("No manual books found.")
        return 1

    book_files = patch_book_shards(manual_books, version)
    author_files = patch_author_shards(manual_authors, version)
    version_file = patch_version(version)

    output = {
        "version": version,
        "manual_books": len(manual_books),
        "manual_authors": len(manual_authors),
        "book_shards": [str(path.relative_to(ROOT)) for path in book_files],
        "author_shards": [str(path.relative_to(ROOT)) for path in author_files],
        "version_file": str(version_file.relative_to(ROOT)),
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
