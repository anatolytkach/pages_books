#!/usr/bin/env python3
import argparse
import concurrent.futures
import json
import os
import re
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


CATEGORIES_URL = "https://www.gutenberg.org/ebooks/categories"
POPULAR_URL = "https://www.gutenberg.org/browse/scores/top"
USER_AGENT = "ReaderPub Gutenberg Sync/1.0 (+https://reader.pub)"
POPULAR_KEYS = ("yesterday", "last7days", "last30days")
DEFAULT_POPULAR_KEY = "last30days"


def clean_text(value: str) -> str:
    return " ".join(str(value or "").split())


def slugify(value: str) -> str:
    base = clean_text(value).lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    return base or "category"


def read_json(path: Path, default=None):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def fetch_html(url: str, timeout: int, retries: int = 3, retry_delay: float = 1.5) -> str:
    last_error = None
    for attempt in range(retries + 1):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except HTTPError as error:
            last_error = error
            if error.code < 500 or attempt >= retries:
                raise
        except URLError as error:
            last_error = error
            if attempt >= retries:
                raise
        if attempt < retries:
            time.sleep(retry_delay * (attempt + 1))
    if last_error:
        raise last_error
    raise RuntimeError(f"Failed to fetch {url}")


@dataclass
class BookRecord:
    id: str
    title: str
    author: str
    cover: str
    language: Optional[str] = None

    def to_payload(self, include_language: bool = False) -> dict:
        payload = {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "cover": self.cover or "",
        }
        if include_language and self.language:
            payload["language"] = self.language
        return payload


@dataclass
class CategorySource:
    title: str
    url: str
    source_id: str


class GutenbergCategoriesPageParser(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.current_href = ""
        self.current_text: List[str] = []
        self.categories: List[CategorySource] = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        attr = dict(attrs)
        href = urljoin(self.base_url, attr.get("href", ""))
        if "/ebooks/bookshelf/" not in href:
            return
        self.current_href = href
        self.current_text = []

    def handle_data(self, data):
        if self.current_href:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self.current_href:
            text = clean_text("".join(self.current_text))
            href = self.current_href
            self.current_href = ""
            self.current_text = []
            if not text or "/ebooks/bookshelf/" not in href:
                return
            source_id = urlparse(href).path.rstrip("/").split("/")[-1]
            self.categories.append(CategorySource(title=text, url=href, source_id=source_id))


class GutenbergCategoryDetailParser(HTMLParser):
    def __init__(self, page_url: str):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.ebook_ids: Set[str] = set()
        self.next_url = ""
        self._current_href = ""
        self._current_text: List[str] = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        attr = dict(attrs)
        href = attr.get("href", "")
        abs_href = urljoin(self.page_url, href)
        self._current_href = abs_href
        self._current_text = []
        match = re.search(r"/ebooks/(\d+)", urlparse(abs_href).path)
        if match:
            self.ebook_ids.add(match.group(1))

    def handle_data(self, data):
        if self._current_href:
            self._current_text.append(data)

    def handle_endtag(self, tag):
        if tag != "a" or not self._current_href:
            return
        text = clean_text("".join(self._current_text)).lower()
        href = self._current_href
        self._current_href = ""
        self._current_text = []
        if text == "next" and "/ebooks/bookshelf/" in href:
            self.next_url = href


class GutenbergPopularParser(HTMLParser):
    def __init__(self, page_url: str):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.current_key: Optional[str] = None
        self.lists = {key: [] for key in POPULAR_KEYS}
        self._heading_tag: Optional[str] = None
        self._heading_text: List[str] = []
        self._current_href = ""
        self._current_text: List[str] = []

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if tag in {"h2", "h3"}:
            self._heading_tag = tag
            self._heading_text = []
        elif tag == "a":
            self._current_href = urljoin(self.page_url, attr.get("href", ""))
            self._current_text = []

    def handle_data(self, data):
        if self._heading_tag:
            self._heading_text.append(data)
        if self._current_href:
            self._current_text.append(data)

    def handle_endtag(self, tag):
        if tag in {"h2", "h3"} and self._heading_tag == tag:
            text = clean_text("".join(self._heading_text)).lower()
            self._heading_tag = None
            self._heading_text = []
            if "top 100 ebooks yesterday" in text:
                self.current_key = "yesterday"
            elif "top 100 ebooks last 7 days" in text:
                self.current_key = "last7days"
            elif "top 100 ebooks last 30 days" in text:
                self.current_key = "last30days"
        elif tag == "a" and self._current_href:
            href = self._current_href
            self._current_href = ""
            self._current_text = []
            if not self.current_key:
                return
            match = re.search(r"/ebooks/(\d+)", urlparse(href).path)
            if match:
                self.lists[self.current_key].append(match.group(1))


def load_book_maps(index_root: Path) -> Tuple[Dict[str, BookRecord], Dict[str, Dict[str, BookRecord]]]:
    def build_map(author_dir: Path, language: Optional[str] = None) -> Dict[str, BookRecord]:
        by_id: Dict[str, BookRecord] = {}
        if not author_dir.is_dir():
            return by_id
        for entry in author_dir.iterdir():
            if entry.suffix != ".json" or not entry.is_file():
                continue
            data = read_json(entry, {}) or {}
            author_name = clean_text(data.get("name") or "")
            for book in data.get("books") or []:
                book_id = str(book.get("id") or "").strip()
                if not book_id:
                    continue
                by_id[book_id] = BookRecord(
                    id=book_id,
                    title=clean_text(book.get("title") or book_id),
                    author=author_name,
                    cover=str(book.get("cover") or ""),
                    language=language,
                )
        return by_id

    global_map = build_map(index_root / "a")
    language_maps: Dict[str, Dict[str, BookRecord]] = {}
    lang_root = index_root / "lang"
    if lang_root.is_dir():
        for entry in lang_root.iterdir():
            if not entry.is_dir():
                continue
            language_maps[entry.name] = build_map(entry / "a", entry.name)
    return global_map, language_maps


def parse_categories_index(html: str, url: str) -> List[CategorySource]:
    parser = GutenbergCategoriesPageParser(url)
    parser.feed(html)
    categories = []
    seen = set()
    for item in parser.categories:
        if item.source_id in seen:
            continue
        seen.add(item.source_id)
        categories.append(item)
    return categories


def parse_category_pages(category: CategorySource, timeout: int, page_limit: int | None = None) -> Tuple[List[str], Dict[str, int]]:
    visited: Set[str] = set()
    seen_ids: Set[str] = set()
    url = category.url
    pages = 0
    pages_with_ids = 0
    stagnant_pages = 0
    while url and url not in visited:
        visited.add(url)
        pages += 1
        html = fetch_html(url, timeout)
        parser = GutenbergCategoryDetailParser(url)
        parser.feed(html)
        before = len(seen_ids)
        seen_ids.update(parser.ebook_ids)
        if len(seen_ids) > before:
            pages_with_ids += 1
            stagnant_pages = 0
        else:
            stagnant_pages += 1
        if stagnant_pages >= 2:
            break
        if page_limit and pages >= page_limit:
            break
        url = parser.next_url
    stats = {
        "pages": pages,
        "pagesWithIds": pages_with_ids,
        "ids": len(seen_ids),
    }
    return sorted(seen_ids, key=lambda value: int(value)), stats


def build_category_indexes(
    categories: List[CategorySource],
    global_books: Dict[str, BookRecord],
    language_books: Dict[str, Dict[str, BookRecord]],
    timeout: int,
    workers: int,
    page_limit: int | None,
) -> Tuple[dict, Dict[str, dict], Dict[str, dict], Dict[str, Dict[str, dict]], Dict[str, Dict[str, dict]], Dict[str, int]]:
    global_summary = []
    global_details: Dict[str, dict] = {}
    lang_summaries: Dict[str, List[dict]] = {lang: [] for lang in language_books}
    lang_details: Dict[str, Dict[str, dict]] = {lang: {} for lang in language_books}
    parse_stats = {
        "categoriesFound": len(categories),
        "categoriesParsed": 0,
        "categoriesWithSourceBooks": 0,
        "categoriesMatched": 0,
    }
    slug_seen: Set[str] = set()

    parsed_results: List[Tuple[CategorySource, List[str], Dict[str, int]]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        future_map = {executor.submit(parse_category_pages, category, timeout, page_limit): category for category in categories}
        completed = 0
        for future in concurrent.futures.as_completed(future_map):
            category = future_map[future]
            ids, stats = future.result()
            parsed_results.append((category, ids, stats))
            completed += 1
            if completed % 10 == 0 or completed == len(categories):
                print(f"Parsed categories: {completed}/{len(categories)}", flush=True)

    parsed_results.sort(key=lambda item: item[0].title.lower())

    for category, ids, stats in parsed_results:
        parse_stats["categoriesParsed"] += 1
        if stats["ids"] > 0:
            parse_stats["categoriesWithSourceBooks"] += 1
        if not ids:
            continue

        slug_base = slugify(category.title)
        slug = slug_base
        if slug in slug_seen:
            slug = f"{slug_base}-{slugify(category.source_id)}"
        slug_seen.add(slug)

        matched_global = [global_books[book_id] for book_id in ids if book_id in global_books]
        if matched_global:
            parse_stats["categoriesMatched"] += 1
            books_payload = [book.to_payload() for book in matched_global]
            global_summary.append({"slug": slug, "title": category.title, "count": len(books_payload)})
            global_details[slug] = {"slug": slug, "title": category.title, "count": len(books_payload), "books": books_payload}

        for lang, book_map in language_books.items():
            matched_lang = [book_map[book_id] for book_id in ids if book_id in book_map]
            if not matched_lang:
                continue
            books_payload = [book.to_payload() for book in matched_lang]
            lang_summaries[lang].append({"slug": slug, "title": category.title, "count": len(books_payload)})
            lang_details[lang][slug] = {"slug": slug, "title": category.title, "count": len(books_payload), "books": books_payload}

    global_summary.sort(key=lambda item: (-item["count"], item["title"].lower()))
    for items in lang_summaries.values():
        items.sort(key=lambda item: (-item["count"], item["title"].lower()))

    global_summary_payload = {
        "categories": global_summary,
        "totalCategories": len(global_summary),
        "totalMatchedBooks": sum(item["count"] for item in global_summary),
    }
    lang_summary_payloads = {
        lang: {
            "categories": items,
            "totalCategories": len(items),
            "totalMatchedBooks": sum(item["count"] for item in items),
        }
        for lang, items in lang_summaries.items()
    }
    return global_summary_payload, global_details, lang_summary_payloads, lang_details, {}, parse_stats


def build_popular_payload(ids_by_list: Dict[str, List[str]], book_map: Dict[str, BookRecord]) -> dict:
    lists = {}
    for key in POPULAR_KEYS:
        seen = set()
        books = []
        for book_id in ids_by_list.get(key, []):
            if book_id in seen or book_id not in book_map:
                continue
            seen.add(book_id)
            books.append(book_map[book_id].to_payload())
        lists[key] = {"count": len(books), "books": books}
    return {"defaultList": DEFAULT_POPULAR_KEY, "lists": lists}


def parse_popular_lists(html: str, url: str) -> Dict[str, List[str]]:
    parser = GutenbergPopularParser(url)
    parser.feed(html)
    normalized = {}
    for key in POPULAR_KEYS:
        seen = set()
        ordered = []
        for book_id in parser.lists.get(key, []):
            if book_id in seen:
                continue
            seen.add(book_id)
            ordered.append(book_id)
        normalized[key] = ordered
    return normalized


def validate_categories_payload(new_payload: dict, existing_payload: Optional[dict], stats: Dict[str, int]) -> Tuple[bool, str]:
    categories = new_payload.get("categories") or []
    if not stats.get("categoriesFound"):
        return False, "No categories found on Gutenberg index page."
    if not stats.get("categoriesParsed"):
        return False, "No category pages were parsed."
    if not categories:
        return False, "No local category matches were produced."
    if existing_payload:
        prev_count = len(existing_payload.get("categories") or [])
        if prev_count and len(categories) < max(5, prev_count // 4):
            return False, "Category result dropped too far below the previous successful snapshot."
    return True, ""


def validate_popular_payload(new_payload: dict, existing_payload: Optional[dict]) -> Tuple[bool, str]:
    lists = new_payload.get("lists") or {}
    if not lists:
        return False, "Popular payload is empty."
    default_books = (lists.get(DEFAULT_POPULAR_KEY) or {}).get("books") or []
    if not default_books:
        return False, "Default 30-day popular list is empty."
    if existing_payload:
        prev_books = (((existing_payload.get("lists") or {}).get(DEFAULT_POPULAR_KEY) or {}).get("books") or [])
        if prev_books and len(default_books) < max(3, len(prev_books) // 4):
            return False, "Popular payload dropped too far below the previous successful snapshot."
    return True, ""


def stage_category_payloads(
    stage_root: Path,
    summary_payload: dict,
    detail_payloads: Dict[str, dict],
    lang_summary_payloads: Dict[str, dict],
    lang_detail_payloads: Dict[str, Dict[str, dict]],
):
    write_json(stage_root / "discover" / "categories.json", summary_payload)
    for slug, payload in detail_payloads.items():
        write_json(stage_root / "discover" / "category" / f"{slug}.json", payload)
    for lang, payload in lang_summary_payloads.items():
        write_json(stage_root / "lang" / lang / "discover" / "categories.json", payload)
    for lang, details in lang_detail_payloads.items():
        for slug, payload in details.items():
            write_json(stage_root / "lang" / lang / "discover" / "category" / f"{slug}.json", payload)


def stage_popular_payloads(
    stage_root: Path,
    global_payload: dict,
    lang_payloads: Dict[str, dict],
):
    write_json(stage_root / "discover" / "popular.json", global_payload)
    for lang, payload in lang_payloads.items():
        write_json(stage_root / "lang" / lang / "discover" / "popular.json", payload)


def publish_path(stage_path: Path, target_path: Path):
    if not stage_path.exists():
        if target_path.is_dir():
            shutil.rmtree(target_path, ignore_errors=True)
        elif target_path.exists():
            target_path.unlink()
        return
    if stage_path.is_dir():
        if target_path.exists():
            shutil.rmtree(target_path)
        shutil.copytree(stage_path, target_path)
        return
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(stage_path, target_path)


def main():
    parser = argparse.ArgumentParser(description="Sync Gutenberg categories and popular lists into ReaderPub indexes.")
    parser.add_argument("--index-root", default=str(Path(__file__).resolve().parents[1] / "reader_lang_indexes"))
    parser.add_argument("--categories-url", default=CATEGORIES_URL)
    parser.add_argument("--popular-url", default=POPULAR_URL)
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--category-workers", type=int, default=8)
    parser.add_argument("--page-limit-per-category", type=int)
    parser.add_argument("--skip-categories", action="store_true")
    parser.add_argument("--skip-popular", action="store_true")
    args = parser.parse_args()

    index_root = Path(args.index_root).resolve()
    global_books, language_books = load_book_maps(index_root)
    if not global_books:
        print("No local books were found in reader_lang_indexes.", file=sys.stderr)
        return 1

    temp_dir = Path(tempfile.mkdtemp(prefix="readerpub_gutenberg_sync_", dir="/tmp"))
    categories_stage = temp_dir / "categories"
    popular_stage = temp_dir / "popular"
    exit_code = 0

    try:
        if not args.skip_categories:
            try:
                index_html = fetch_html(args.categories_url, args.timeout)
                sources = parse_categories_index(index_html, args.categories_url)
                summary_payload, detail_payloads, lang_summary_payloads, lang_detail_payloads, _unused, stats = build_category_indexes(
                    sources,
                    global_books,
                    language_books,
                    args.timeout,
                    args.category_workers,
                    args.page_limit_per_category,
                )
                existing_summary = read_json(index_root / "discover" / "categories.json", {}) or {}
                valid, reason = validate_categories_payload(summary_payload, existing_summary, stats)
                if not valid:
                    raise RuntimeError(reason)
                stage_category_payloads(categories_stage, summary_payload, detail_payloads, lang_summary_payloads, lang_detail_payloads)
                publish_path(categories_stage / "discover" / "categories.json", index_root / "discover" / "categories.json")
                publish_path(categories_stage / "discover" / "category", index_root / "discover" / "category")
                for lang in language_books:
                    staged_lang = categories_stage / "lang" / lang / "discover"
                    target_lang = index_root / "lang" / lang / "discover"
                    if staged_lang.exists():
                        publish_path(staged_lang / "categories.json", target_lang / "categories.json")
                        publish_path(staged_lang / "category", target_lang / "category")
                print(f"Categories updated: {summary_payload['totalCategories']} categories, {summary_payload['totalMatchedBooks']} matched books.")
            except (HTTPError, URLError, RuntimeError) as error:
                exit_code = 1
                print(f"Categories update skipped: {error}", file=sys.stderr)

        if not args.skip_popular:
            try:
                top_html = fetch_html(args.popular_url, args.timeout)
                ids_by_list = parse_popular_lists(top_html, args.popular_url)
                global_payload = build_popular_payload(ids_by_list, global_books)
                lang_payloads = {
                    lang: build_popular_payload(ids_by_list, book_map)
                    for lang, book_map in language_books.items()
                }
                existing_popular = read_json(index_root / "discover" / "popular.json", {}) or {}
                valid, reason = validate_popular_payload(global_payload, existing_popular)
                if not valid:
                    raise RuntimeError(reason)
                stage_popular_payloads(popular_stage, global_payload, lang_payloads)
                write_json(popular_stage / "discover" / "popular.json", global_payload)
                publish_path(popular_stage / "discover" / "popular.json", index_root / "discover" / "popular.json")
                for lang in language_books:
                    staged_lang = popular_stage / "lang" / lang / "discover"
                    target_lang = index_root / "lang" / lang / "discover"
                    if staged_lang.exists():
                        target_lang.mkdir(parents=True, exist_ok=True)
                        write_json(target_lang / "popular.json", read_json(staged_lang / "popular.json", {}))
                default_count = ((global_payload.get("lists") or {}).get(DEFAULT_POPULAR_KEY) or {}).get("count") or 0
                print(f"Popular lists updated: {default_count} books in default 30-day list.")
            except (HTTPError, URLError, RuntimeError) as error:
                exit_code = 1
                print(f"Popular update skipped: {error}", file=sys.stderr)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
