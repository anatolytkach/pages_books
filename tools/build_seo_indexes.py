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
import unicodedata
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
OPF_NS = "http://www.idpf.org/2007/opf"
DC_NS = "http://purl.org/dc/elements/1.1/"
XHTML_NS = "http://www.w3.org/1999/xhtml"
EPUB_NS = "http://www.idpf.org/2007/ops"
NCX_NS = "http://www.daisy.org/z3986/2005/ncx/"
USER_AGENT = "ReaderPub SEO Build/1.0 (+https://reader.pub)"
SITEMAP_CHUNK_SIZE = 5000
EXCERPT_TARGET = 1400
EXCERPT_MIN = 500
BOOK_SLUG_MAX = 96
AUTHOR_SLUG_MAX = 96
CHAPTER_SLUG_MAX = 80
SEO_SHARD_PREFIX_LENGTH = 2
SEO_SHARD_MAX_BYTES = 24 * 1024 * 1024
SEO_SHARD_MAX_PREFIX_LENGTH = 8


def clean_text(value: str) -> str:
    return " ".join(str(value or "").split())


def strip_diacritics(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def kebab_slug(value: str, fallback: str) -> str:
    base = strip_diacritics(clean_text(value)).lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    if base:
        return base
    fb = strip_diacritics(clean_text(fallback)).lower()
    fb = re.sub(r"[^a-z0-9]+", "-", fb)
    fb = re.sub(r"-+", "-", fb).strip("-")
    return fb or "item"


def stable_ascii_fallback(prefix: str, source: str) -> str:
    token = (source or prefix).encode("utf-8").hex()[:16]
    return f"{prefix}-{token}"


def trim_slug(value: str, max_length: int) -> str:
    slug = clean_text(value).strip("-")
    if len(slug) <= max_length:
      return slug
    cut = slug[:max_length].rstrip("-")
    soft = re.sub(r"-[^-]*$", "", cut).strip("-")
    return (soft or cut or slug[:max_length]).strip("-")


def normalize_lang(code: str) -> str:
    base = clean_text(code).lower().replace("_", "-")
    base = re.sub(r"[^a-z0-9-]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    if "-" in base:
        base = base.split("-", 1)[0]
    return base or "und"


def json_dump(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def json_load(path: Path, default=None):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return default


def fetch_url_text(url: str, timeout: int = 20, retries: int = 2) -> str:
    last_error = None
    for attempt in range(retries + 1):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except (HTTPError, URLError) as error:
            last_error = error
            if attempt >= retries:
                raise
            time.sleep(1.2 * (attempt + 1))
    if last_error:
        raise last_error
    raise RuntimeError(f"Failed to fetch {url}")


def read_text_from_source(local_path: Path, remote_url: str) -> str:
    if local_path.exists():
        return local_path.read_text(encoding="utf-8")
    return fetch_url_text(remote_url)


def parse_container(xml_text: str) -> str:
    root = ET.fromstring(xml_text)
    rootfile = root.find(f".//{{{CONTAINER_NS}}}rootfile")
    return rootfile.get("full-path", "").strip() if rootfile is not None else ""


def find_dc_text(root: ET.Element, tag: str) -> str:
    node = root.find(f".//{{{DC_NS}}}{tag}")
    return clean_text(node.text if node is not None and node.text else "")


def parse_opf(xml_text: str) -> dict:
    root = ET.fromstring(xml_text)
    manifest = {}
    cover_href = ""
    nav_href = ""
    for item in root.findall(f".//{{{OPF_NS}}}manifest/{{{OPF_NS}}}item"):
        item_id = clean_text(item.get("id", ""))
        href = clean_text(item.get("href", ""))
        props = clean_text(item.get("properties", ""))
        media_type = clean_text(item.get("media-type", ""))
        manifest[item_id] = {
            "href": href,
            "properties": props,
            "mediaType": media_type,
        }
        if "cover-image" in props and href:
            cover_href = href
        if "nav" in props and href:
            nav_href = href

    metadata = {
        "title": find_dc_text(root, "title"),
        "description": find_dc_text(root, "description"),
        "language": normalize_lang(find_dc_text(root, "language")),
        "creator": find_dc_text(root, "creator") or "Unknown",
        "manifest": manifest,
        "spine": [],
        "coverHref": cover_href,
        "navHref": nav_href,
        "tocId": "",
    }

    spine = root.find(f".//{{{OPF_NS}}}spine")
    if spine is not None:
        metadata["tocId"] = clean_text(spine.get("toc", ""))
        for itemref in spine.findall(f"./{{{OPF_NS}}}itemref"):
            idref = clean_text(itemref.get("idref", ""))
            linear = clean_text(itemref.get("linear", "yes")).lower()
            if not idref:
                continue
            href = manifest.get(idref, {}).get("href", "")
            metadata["spine"].append(
                {
                    "idref": idref,
                    "href": href,
                    "linear": linear != "no",
                }
            )

    if not metadata["navHref"] and metadata["tocId"]:
        metadata["tocHref"] = manifest.get(metadata["tocId"], {}).get("href", "")
    else:
        metadata["tocHref"] = ""
    return metadata


def parse_nav_chapters(xml_text: str) -> List[Tuple[str, str]]:
    root = ET.fromstring(xml_text)
    ns = {"xhtml": XHTML_NS, "epub": EPUB_NS}
    toc_nav = None
    for nav in root.findall(".//xhtml:nav", ns):
        epub_type = nav.get(f"{{{EPUB_NS}}}type", "") or nav.get("epub:type", "")
        if "toc" in epub_type:
            toc_nav = nav
            break
    if toc_nav is None:
        return []
    out = []
    for anchor in toc_nav.findall(".//xhtml:a", ns):
        href = clean_text(anchor.get("href", ""))
        title = clean_text("".join(anchor.itertext()))
        if href and title:
            out.append((href, title))
    return out


def parse_ncx_chapters(xml_text: str) -> List[Tuple[str, str]]:
    root = ET.fromstring(xml_text)
    out = []
    for navpoint in root.findall(f".//{{{NCX_NS}}}navPoint"):
        text_node = navpoint.find(f"./{{{NCX_NS}}}navLabel/{{{NCX_NS}}}text")
        content_node = navpoint.find(f"./{{{NCX_NS}}}content")
        href = clean_text(content_node.get("src", "")) if content_node is not None else ""
        title = clean_text(text_node.text if text_node is not None and text_node.text else "")
        if href and title:
            out.append((href, title))
    return out


def split_href_fragment(href: str) -> Tuple[str, str]:
    if "#" in href:
        path, fragment = href.split("#", 1)
        return path.strip(), fragment.strip()
    return href.strip(), ""


def is_wrapper_chapter(title: str, href_path: str) -> bool:
    t = clean_text(title).lower()
    p = clean_text(href_path).lower()
    filename = p.rsplit("/", 1)[-1]
    if filename in {"cover.xhtml", "title_page.xhtml", "nav.xhtml", "toc.xhtml"}:
        return True
    wrappers = {
        "cover",
        "title page",
        "table of contents",
        "contents",
        "toc",
        "copyright",
        "imprint",
        "index",
        "navigation",
    }
    if t in wrappers:
        return True
    return False


def body_inner_html(xhtml_text: str) -> str:
    match = re.search(r"<body\b[^>]*>(.*)</body>", xhtml_text, flags=re.I | re.S)
    return match.group(1).strip() if match else ""


def body_text(xhtml_text: str) -> str:
    try:
        root = ET.fromstring(xhtml_text)
    except ET.ParseError:
        inner = body_inner_html(xhtml_text)
        inner = re.sub(r"<[^>]+>", " ", inner)
        return clean_text(inner)
    body = root.find(f".//{{{XHTML_NS}}}body")
    if body is None:
        return ""
    return clean_text(" ".join(body.itertext()))


def rewrite_relative_urls(html: str, asset_base: str) -> str:
    def replace_attr(match):
        attr = match.group(1)
        quote = match.group(2)
        value = match.group(3)
        if not value or value.startswith(("http://", "https://", "mailto:", "#", "data:")):
            return match.group(0)
        absolute = urljoin(asset_base, value)
        return f'{attr}={quote}{absolute}{quote}'

    return re.sub(r'(src|href)=("|\')([^"\']+)("|\')', lambda m: replace_attr(m), html)


def make_meta_description(text: str, fallback: str) -> str:
    source = clean_text(text or fallback or "")
    if len(source) <= 160:
        return source
    cut = source[:157].rsplit(" ", 1)[0].strip()
    return (cut or source[:157]).strip() + "..."


def chunk_items(items: List[dict], size: int) -> Iterable[List[dict]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def shard_prefix(slug: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "", clean_text(slug).lower())
    if not normalized:
        return "_" * SEO_SHARD_PREFIX_LENGTH
    if len(normalized) >= SEO_SHARD_PREFIX_LENGTH:
        return normalized[:SEO_SHARD_PREFIX_LENGTH]
    return normalized + ("_" * (SEO_SHARD_PREFIX_LENGTH - len(normalized)))


def estimate_shard_bytes(version: str, items: Dict[str, dict]) -> int:
    payload = {"version": version, "items": items}
    return len(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def build_shard_name(slug: str, prefix_length: int) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "", clean_text(slug).lower())
    if not normalized:
        return "_" * prefix_length
    if len(normalized) >= prefix_length:
        return normalized[:prefix_length]
    return normalized + ("_" * (prefix_length - len(normalized)))


def write_sharded_records(
    stage_root: Path,
    folder: str,
    records: Dict[str, dict],
    version: str,
    max_bytes: Optional[int] = None,
    max_prefix_length: int = SEO_SHARD_MAX_PREFIX_LENGTH,
) -> None:
    pending: List[Tuple[int, Dict[str, dict]]] = [(SEO_SHARD_PREFIX_LENGTH, records)]
    final_shards: Dict[str, Dict[str, dict]] = {}

    while pending:
        prefix_length, shard_records = pending.pop()
        grouped: Dict[str, Dict[str, dict]] = {}
        for slug, payload in shard_records.items():
            shard = build_shard_name(slug, prefix_length)
            grouped.setdefault(shard, {})[slug] = payload
        for shard, items in grouped.items():
            if max_bytes and prefix_length < max_prefix_length and estimate_shard_bytes(version, items) > max_bytes:
                pending.append((prefix_length + 1, items))
                continue
            final_shards[shard] = items

    for shard, items in sorted(final_shards.items()):
        json_dump(stage_root / "seo" / folder / f"{shard}.json", {"version": version, "items": items})


@dataclass
class BookSeed:
    id: str
    title: str
    author_name: str
    author_key: str
    cover: str


def load_author_indexes(index_root: Path) -> Tuple[Dict[str, dict], Dict[str, BookSeed]]:
    authors = {}
    books = {}
    for path in sorted((index_root / "a").glob("*.json")):
        data = json_load(path, {}) or {}
        key = clean_text(data.get("key", "")) or path.stem
        name = clean_text(data.get("name", "")) or "Unknown"
        book_items = []
        for item in data.get("books", []) or []:
            book_id = clean_text(item.get("id", ""))
            title = clean_text(item.get("title", ""))
            if not book_id or not title:
                continue
            cover = clean_text(item.get("cover", ""))
            seed = BookSeed(
                id=book_id,
                title=title,
                author_name=name,
                author_key=key,
                cover=cover,
            )
            books[book_id] = seed
            book_items.append(seed)
        authors[key] = {"key": key, "name": name, "books": book_items}
    return authors, books


def load_category_map(index_root: Path) -> Dict[str, List[dict]]:
    categories_by_book: Dict[str, List[dict]] = {}
    category_dir = index_root / "discover" / "category"
    for path in sorted(category_dir.glob("*.json")):
        payload = json_load(path, {}) or {}
        slug = clean_text(payload.get("slug", "")) or path.stem
        title = clean_text(payload.get("title", "")) or slug
        for item in payload.get("books", []) or []:
            book_id = clean_text(item.get("id", ""))
            if not book_id:
                continue
            categories_by_book.setdefault(book_id, []).append({"slug": slug, "title": title})
    for items in categories_by_book.values():
        items.sort(key=lambda item: item["title"])
    return categories_by_book


def fetch_book_content(book_id: str, rel_path: str, local_root: Path, remote_base: str) -> str:
    local_path = local_root / book_id / rel_path
    remote_url = f"{remote_base.rstrip('/')}/{book_id}/{rel_path}"
    return read_text_from_source(local_path, remote_url)


def build_book_manifest(
    seed: BookSeed,
    categories: List[dict],
    book_slug: str,
    author_slug: str,
    local_root: Path,
    remote_base: str,
    timeout: int,
) -> dict:
    book_id = seed.id
    container_text = fetch_book_content(book_id, "META-INF/container.xml", local_root, remote_base)
    opf_rel = parse_container(container_text)
    if not opf_rel:
        raise RuntimeError(f"container.xml does not declare OPF for book {book_id}")

    opf_text = fetch_book_content(book_id, opf_rel, local_root, remote_base)
    opf = parse_opf(opf_text)
    opf_dir = Path(opf_rel).parent.as_posix()

    nav_entries: List[Tuple[str, str]] = []
    if opf.get("navHref"):
        nav_rel = f"{opf_dir}/{opf['navHref']}" if opf_dir else opf["navHref"]
        try:
            nav_text = fetch_book_content(book_id, nav_rel, local_root, remote_base)
            nav_entries = parse_nav_chapters(nav_text)
        except Exception:
            nav_entries = []
    if not nav_entries and opf.get("tocHref"):
        toc_rel = f"{opf_dir}/{opf['tocHref']}" if opf_dir else opf["tocHref"]
        toc_text = fetch_book_content(book_id, toc_rel, local_root, remote_base)
        nav_entries = parse_ncx_chapters(toc_text)

    chapters = []
    seen_paths = set()
    for href, title in nav_entries:
        href_path, fragment = split_href_fragment(href)
        if not href_path or is_wrapper_chapter(title, href_path):
            continue
        normalized_path = os.path.normpath(f"{opf_dir}/{href_path}" if opf_dir else href_path).replace("\\", "/")
        key = (normalized_path, clean_text(title).lower())
        if key in seen_paths:
            continue
        seen_paths.add(key)
        chapter_slug_base = trim_slug(
            kebab_slug(title, f"chapter-{len(chapters) + 1}"),
            CHAPTER_SLUG_MAX,
        )
        chapters.append(
            {
                "n": len(chapters) + 1,
                "title": title,
                "slug": chapter_slug_base,
                "href": f"/book/{book_slug}/chapter-{len(chapters) + 1}-{chapter_slug_base}",
                "sourcePath": normalized_path,
                "fragment": fragment,
            }
        )

    description = clean_text(opf.get("description", ""))
    excerpt = ""
    excerpt_source = None
    for chapter in chapters:
        try:
            xhtml_text = fetch_book_content(book_id, chapter["sourcePath"], local_root, remote_base)
        except Exception:
            continue
        text = body_text(xhtml_text)
        if len(text) < EXCERPT_MIN:
            if not excerpt and text:
                excerpt = text[:EXCERPT_TARGET].strip()
                excerpt_source = chapter["n"]
            continue
        excerpt = text[:EXCERPT_TARGET].strip()
        excerpt_source = chapter["n"]
        break

    if not excerpt:
        excerpt = description

    if opf.get("coverHref"):
        cover_rel = os.path.normpath(f"{opf_dir}/{opf['coverHref']}" if opf_dir else opf["coverHref"]).replace("\\", "/")
        cover = f"/books/content/{book_id}/{cover_rel}"
    else:
        cover = seed.cover or ""

    return {
        "id": book_id,
        "slug": book_slug,
        "title": opf.get("title") or seed.title,
        "authorName": seed.author_name,
        "authorSlug": author_slug,
        "authorKey": seed.author_key,
        "cover": cover,
        "language": normalize_lang(opf.get("language") or "und"),
        "description": description,
        "excerpt": excerpt,
        "excerptSourceChapter": excerpt_source,
        "categories": categories,
        "readerUrl": f"/books/{book_id}/",
        "chapters": chapters,
    }


def write_sitemap_chunks(stage_root: Path, name: str, items: List[dict], base_path: str) -> List[dict]:
    chunks_meta = []
    for index, chunk in enumerate(chunk_items(items, SITEMAP_CHUNK_SIZE), start=1):
        slug = f"{name}-{index}.json"
        path = stage_root / "seo" / "sitemaps" / slug
        payload = {"items": chunk}
        json_dump(path, payload)
        chunks_meta.append(
            {
                "slug": slug,
                "path": f"{base_path}/{name}-{index}.xml",
                "count": len(chunk),
            }
        )
    return chunks_meta


def main() -> int:
    parser = argparse.ArgumentParser(description="Build ReaderPub SEO manifests and sitemap sources.")
    parser.add_argument("--index-root", default=str(Path(__file__).resolve().parents[1] / "reader_lang_indexes"))
    parser.add_argument("--content-root", default=str(Path(__file__).resolve().parents[1] / "books" / "content"))
    parser.add_argument("--output-root", default=str(Path(__file__).resolve().parents[1] / "reader_seo_indexes"))
    parser.add_argument("--remote-content-base", default="https://reader.pub/books/content")
    parser.add_argument("--book-id", action="append", dest="book_ids", default=[])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    index_root = Path(args.index_root)
    content_root = Path(args.content_root)
    output_root = Path(args.output_root)
    selected_ids = {clean_text(value) for raw in args.book_ids for value in str(raw).split(",") if clean_text(value)}

    authors, books_by_id = load_author_indexes(index_root)
    if not books_by_id:
        print("No books found in author indexes.", file=sys.stderr)
        return 1
    categories_by_book = load_category_map(index_root)

    book_slug_seen = set()
    book_slug_by_id = {}
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

    seeds = list(books_by_id.values())
    seeds.sort(key=lambda item: (item.title.lower(), item.id))
    if selected_ids:
        seeds = [item for item in seeds if item.id in selected_ids]
    if args.limit > 0:
        seeds = seeds[: args.limit]

    for seed in seeds:
        base = trim_slug(kebab_slug(seed.title, f"book-{seed.id}"), BOOK_SLUG_MAX)
        if base not in book_slug_seen:
            slug = base
        else:
            slug = trim_slug(f"{base}-{seed.id}", BOOK_SLUG_MAX)
        book_slug_seen.add(slug)
        book_slug_by_id[seed.id] = slug

    version = str(int(time.time()))
    stage_root = Path(tempfile.mkdtemp(prefix="readerpub-seo-"))
    try:
        book_manifests = {}
        failures = []

        def worker(seed: BookSeed):
            return build_book_manifest(
                seed=seed,
                categories=categories_by_book.get(seed.id, []),
                book_slug=book_slug_by_id[seed.id],
                author_slug=author_slug_by_key.get(seed.author_key, kebab_slug(seed.author_name, seed.author_key)),
                local_root=content_root,
                remote_base=args.remote_content_base,
                timeout=20,
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
            future_map = {executor.submit(worker, seed): seed for seed in seeds}
            completed = 0
            for future in concurrent.futures.as_completed(future_map):
                seed = future_map[future]
                try:
                    manifest = future.result()
                    manifest["version"] = version
                    manifest["generatedAt"] = version
                    book_manifests[seed.id] = manifest
                except Exception as error:
                    failures.append((seed.id, str(error)))
                completed += 1
                if completed % 500 == 0 or completed == len(future_map):
                    print(
                        f"[seo-build] processed {completed}/{len(future_map)} books "
                        f"(ok={len(book_manifests)} failed={len(failures)})",
                        flush=True,
                    )

        if selected_ids and failures and len(failures) == len(seeds):
            for book_id, detail in failures[:20]:
                print(f"Failed to build {book_id}: {detail}", file=sys.stderr)
            return 1

        books_for_author = {key: [] for key in authors}
        category_payloads = {}
        books_sitemap_items = []
        chapters_sitemap_items = []

        book_shard_records = {}
        author_shard_records = {}

        for book_id, manifest in sorted(book_manifests.items(), key=lambda item: item[1]["slug"]):
            book_shard_records[manifest["slug"]] = manifest
            books_for_author.setdefault(manifest["authorKey"], []).append(
                {
                    "id": book_id,
                    "slug": manifest["slug"],
                    "title": manifest["title"],
                    "cover": manifest.get("cover", ""),
                }
            )
            books_sitemap_items.append({"loc": f"/book/{manifest['slug']}", "lastmod": version})
            for chapter in manifest.get("chapters", []):
                chapters_sitemap_items.append({"loc": chapter["href"], "lastmod": version})
            for category in manifest.get("categories", []):
                slug = category["slug"]
                payload = category_payloads.setdefault(
                    slug,
                    {
                        "slug": slug,
                        "title": category["title"],
                        "count": 0,
                        "books": [],
                        "version": version,
                        "generatedAt": version,
                    },
                )
                payload["books"].append(
                    {
                        "id": book_id,
                        "slug": manifest["slug"],
                        "title": manifest["title"],
                        "author": manifest["authorName"],
                        "authorSlug": manifest["authorSlug"],
                        "cover": manifest.get("cover", ""),
                    }
                )

        author_sitemap_items = []
        for author_key, author in authors.items():
            slug = author_slug_by_key[author_key]
            items = sorted(books_for_author.get(author_key, []), key=lambda item: item["title"].lower())
            payload = {
                "slug": slug,
                "name": author["name"],
                "key": author_key,
                "books": items,
                "count": len(items),
                "version": version,
                "generatedAt": version,
            }
            author_shard_records[slug] = payload
            author_sitemap_items.append({"loc": f"/author/{slug}", "lastmod": version})

        category_sitemap_items = []
        for slug, payload in category_payloads.items():
            payload["books"].sort(key=lambda item: item["title"].lower())
            payload["count"] = len(payload["books"])
            json_dump(stage_root / "seo" / "category" / f"{slug}.json", payload)
            category_sitemap_items.append({"loc": f"/category/{slug}", "lastmod": version})

        write_sharded_records(
            stage_root,
            "book-shards",
            book_shard_records,
            version,
            max_bytes=SEO_SHARD_MAX_BYTES,
        )
        write_sharded_records(stage_root, "author-shards", author_shard_records, version)

        books_chunks = write_sitemap_chunks(stage_root, "books", books_sitemap_items, "/sitemaps")
        chapters_chunks = write_sitemap_chunks(stage_root, "chapters", chapters_sitemap_items, "/sitemaps")
        json_dump(stage_root / "seo" / "sitemaps" / "authors.json", {"items": author_sitemap_items})
        json_dump(stage_root / "seo" / "sitemaps" / "categories.json", {"items": category_sitemap_items})
        json_dump(
            stage_root / "seo" / "sitemaps" / "index.json",
            {
                "version": version,
                "generatedAt": version,
                "sitemaps": books_chunks
                + chapters_chunks
                + [
                    {"slug": "authors.json", "path": "/sitemaps/authors.xml", "count": len(author_sitemap_items)},
                    {"slug": "categories.json", "path": "/sitemaps/categories.xml", "count": len(category_sitemap_items)},
                ],
            },
        )
        json_dump(
            stage_root / "seo" / "version.json",
            {
                "version": version,
                "generatedAt": version,
                "books": len(book_manifests),
                "authors": len(authors),
                "categories": len(category_payloads),
                "chapters": len(chapters_sitemap_items),
                "failures": failures[:100],
            },
        )

        if output_root.exists():
            shutil.rmtree(output_root)
        shutil.move(str(stage_root / "seo"), str(output_root))
        print(
            f"SEO build complete: {len(book_manifests)} books, {len(chapters_sitemap_items)} chapters, "
            f"{len(authors)} authors, {len(category_payloads)} categories."
        )
        if failures:
            print(f"Build warnings: {len(failures)} books failed.")
        return 0
    finally:
        shutil.rmtree(stage_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
