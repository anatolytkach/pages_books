#!/usr/bin/env python3
import argparse
import json
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

BOOK_SEARCH_STOP_WORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "for",
    "by",
}

BOOK_SEARCH_SERVICE_WORDS = {
    "vol",
    "volume",
    "no",
    "part",
    "chapter",
}

def clean_text(value: str) -> str:
    return " ".join(str(value or "").split())

def strip_diacritics(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")

def normalize_lang(code: str) -> str:
    base = clean_text(code).lower().replace("_", "-")
    base = re.sub(r"[^a-z0-9-]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    if "-" in base:
        base = base.split("-", 1)[0]
    return base or "und"

def normalize_index(value: str) -> str:
    base = strip_diacritics(clean_text(value)).lower()
    base = re.sub(r"[^\w]+", "", base, flags=re.UNICODE)
    base = base.replace("_", "")
    return base

def normalize_index_ascii(value: str) -> str:
    base = strip_diacritics(clean_text(value)).lower()
    base = re.sub(r"[^a-z0-9]+", "", base)
    return base

def slugify(value: str) -> str:
    return normalize_index(value)

def normalize_search_match(value: str) -> str:
    base = strip_diacritics(clean_text(value)).lower()
    return base

def normalize_search_token(value: str) -> str:
    base = normalize_search_match(value)
    base = re.sub(r"[^\w]+", "", base, flags=re.UNICODE)
    base = base.replace("_", "")
    return base[:3] if len(base) >= 3 else ""


def tokenize_search_words(value: str) -> list[str]:
    words = re.findall(r"[\w]+", normalize_search_match(value), flags=re.UNICODE)
    return [word.replace("_", "") for word in words if word]


def build_author_search_tokens(value: str) -> list[str]:
    tokens = []
    seen = set()
    for word in tokenize_search_words(value):
        if len(word) < 3:
            continue
        if word in BOOK_SEARCH_STOP_WORDS:
            continue
        token = word[:3] if len(word) >= 3 else ""
        if not token or token in seen:
            continue
        seen.add(token)
        tokens.append(token)
    return tokens


def build_book_search_tokens(value: str) -> list[str]:
    tokens = []
    seen = set()
    for word in tokenize_search_words(value):
        if len(word) < 3:
            continue
        if word in BOOK_SEARCH_STOP_WORDS or word in BOOK_SEARCH_SERVICE_WORDS:
            continue
        token = word[:3]
        if token in seen:
            continue
        seen.add(token)
        tokens.append(token)
    return tokens

def parse_author_name(name: str) -> tuple[str, str, str, str]:
    raw = clean_text(name)
    if not raw:
        return "", "", "", ""

    if "," in raw:
        last, rest = raw.split(",", 1)
        last = last.strip()
        rest = rest.strip()
    else:
        parts = raw.split(" ")
        if len(parts) == 1:
            last = raw
            rest = ""
        else:
            suffixes = {"jr.", "jr", "sr.", "sr", "ii", "iii", "iv", "v"}
            particles = {
                "da",
                "de",
                "del",
                "der",
                "di",
                "du",
                "la",
                "le",
                "van",
                "von",
                "st",
                "st.",
                "saint",
                "san",
                "den",
                "ter",
                "ten",
                "dos",
                "das",
                "della",
                "dell",
                "dall",
                "d'",
                "l'",
            }
            last_token = parts[-1].lower()
            if last_token in suffixes and len(parts) >= 2:
                last = " ".join(parts[-2:])
                rest = " ".join(parts[:-2])
            else:
                penult = parts[-2].lower()
                if penult in particles:
                    last = " ".join(parts[-2:])
                    rest = " ".join(parts[:-2])
                else:
                    last = parts[-1]
                    rest = " ".join(parts[:-1])

    if not last:
        last = raw
    display = f"{last}, {rest}" if rest else last
    index_name = f"{last} {rest}".strip()
    return display, last, rest, index_name

DC_NS = "http://purl.org/dc/elements/1.1/"
OPF_NS = "http://www.idpf.org/2007/opf"
CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
READER1_MANIFEST = "reader1-manifest.json"


def find_first_text(root, tag):
    el = root.find(f".//{{{DC_NS}}}{tag}")
    if el is not None and el.text:
        return clean_text(el.text)
    return ""


def find_all_text(root, tag):
    return [clean_text(el.text) for el in root.findall(f".//{{{DC_NS}}}{tag}") if el.text]


def find_cover_href(root):
    cover_id = None
    for meta in root.findall(f".//{{{OPF_NS}}}meta"):
        if meta.attrib.get("name") == "cover":
            cover_id = meta.attrib.get("content")
            if cover_id:
                break

    items = list(root.findall(f".//{{{OPF_NS}}}item"))

    if cover_id:
        for item in items:
            if item.attrib.get("id") == cover_id:
                return item.attrib.get("href")

    for item in items:
        props = item.attrib.get("properties", "")
        if "cover-image" in props:
            return item.attrib.get("href")

    return ""


def parse_container(container_path: str) -> str:
    tree = ET.parse(container_path)
    root = tree.getroot()
    rootfile = root.find(f".//{{{CONTAINER_NS}}}rootfile")
    if rootfile is None:
        return ""
    return rootfile.attrib.get("full-path", "")


def parse_opf(opf_path: str) -> dict:
    tree = ET.parse(opf_path)
    root = tree.getroot()
    title = find_first_text(root, "title")
    creators = find_all_text(root, "creator")
    languages = find_all_text(root, "language")
    cover_href = find_cover_href(root)
    return {
        "title": title,
        "creators": creators,
        "languages": languages,
        "cover_href": cover_href,
        "reader_type": "legacy",
    }


def parse_reader1_manifest(manifest_path: str) -> dict:
    data = read_json(manifest_path, {}) or {}
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    resources = data.get("resources") if isinstance(data.get("resources"), list) else []

    title = clean_text(metadata.get("title") or metadata.get("bookTitle") or "")
    creators = metadata.get("creators") if isinstance(metadata.get("creators"), list) else []
    if not creators:
        creator = clean_text(metadata.get("creator") or "")
        if creator:
            creators = [creator]
    creators = [clean_text(value) for value in creators if clean_text(value)]

    languages = metadata.get("languages") if isinstance(metadata.get("languages"), list) else []
    if not languages:
        language = clean_text(metadata.get("language") or "")
        if language:
            languages = [language]
    languages = [clean_text(value) for value in languages if clean_text(value)]

    cover_href = ""
    for item in resources:
        if not isinstance(item, dict):
            continue
        rel = item.get("rel")
        rel_values = rel if isinstance(rel, list) else [rel]
        if any(clean_text(value) == "cover" for value in rel_values if value):
            cover_href = clean_text(item.get("href") or "")
            if cover_href:
                break

    return {
        "title": title,
        "creators": creators,
        "languages": languages,
        "cover_href": cover_href,
        "reader_type": "reader1",
    }


def load_book_package(book_path: str) -> tuple[dict, str]:
    reader1_manifest_path = os.path.join(book_path, READER1_MANIFEST)
    if os.path.exists(reader1_manifest_path):
        return parse_reader1_manifest(reader1_manifest_path), "reader1"

    container_path = os.path.join(book_path, "META-INF", "container.xml")
    if not os.path.exists(container_path):
        raise FileNotFoundError(f"Missing container.xml for book path: {book_path}")

    opf_rel = parse_container(container_path)
    if not opf_rel:
        raise FileNotFoundError(f"Missing OPF path for book path: {book_path}")
    opf_path = os.path.join(book_path, opf_rel)
    if not os.path.exists(opf_path):
        raise FileNotFoundError(f"Missing OPF file for book path: {book_path}")
    return parse_opf(opf_path), opf_rel


def iter_books(root_dir: str):
    for entry in os.scandir(root_dir):
        if not entry.is_dir():
            continue
        if not entry.name.isdigit():
            continue
        yield entry.name, entry.path


def load_book_locations(path: str):
    data = read_json(path, {}) or {}
    items = data.get("items") or {}
    if not isinstance(items, dict):
        return {}
    return items


def load_source_registry(path: str):
    data = read_json(path, {}) or {}
    by_reader_id = {}
    defaults = data.get("defaults") if isinstance(data.get("defaults"), dict) else {}
    for source, items in data.items():
        if source == "defaults" or not isinstance(items, dict):
            continue
        source_default = defaults.get(source) if isinstance(defaults.get(source), dict) else {}
        for key, item in items.items():
            reader_id = clean_text((item or {}).get("reader_id") or key)
            if not reader_id:
                continue
            by_reader_id[reader_id] = {
                "source": source,
                "sourceBookId": clean_text((item or {}).get("source_book_id") or key) or reader_id,
                "publicPathMode": clean_text((item or {}).get("public_path_mode") or source_default.get("public_path_mode") or ""),
                "localContentPath": clean_text((item or {}).get("local_content_path") or source_default.get("local_content_path") or ""),
            }
    return by_reader_id


def content_root_to_fs_path(root_dir: str, content_path: str) -> str:
    raw = clean_text(content_path)
    if raw.startswith("/books/content/"):
      raw = raw[len("/books/content/"):]
    raw = raw.strip("/")
    return os.path.join(root_dir, raw) if raw else root_dir


def iter_books_from_locations(root_dir: str, locations: dict):
    for book_id, item in sorted(locations.items(), key=lambda pair: int(pair[0]) if str(pair[0]).isdigit() else pair[0]):
        path = content_root_to_fs_path(root_dir, item.get("localContentPath") or item.get("contentPath") or f"/books/content/{book_id}/")
        if not os.path.isdir(path):
            continue
        yield str(book_id), path, item


def get_book_location(locations: dict, registry: dict, book_id: str):
    base = {
        "readerId": str(book_id),
        "legacyId": str(book_id),
        "source": "gutenberg",
        "sourceBookId": str(book_id),
        "localContentPath": f"/books/content/{book_id}/",
        "contentPath": f"/books/content/{book_id}/",
        "legacyPath": f"/books/content/{book_id}/",
    }
    item = dict(base)
    item.update(locations.get(str(book_id)) or {})
    registry_item = registry.get(str(book_id)) or {}
    if registry_item.get("source"):
        item["source"] = registry_item["source"]
    if registry_item.get("sourceBookId"):
        item["sourceBookId"] = registry_item["sourceBookId"]
    if registry_item.get("localContentPath"):
        item["localContentPath"] = registry_item["localContentPath"]
    return item


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def write_json(path: str, data):
    ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

def read_json(path: str, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def load_existing_authors(lang_root: str):
    authors_by_key = {}
    a_dir = os.path.join(lang_root, "a")
    if not os.path.isdir(a_dir):
        return authors_by_key, []
    for entry in os.scandir(a_dir):
        if not entry.is_file() or not entry.name.endswith(".json"):
            continue
        data = read_json(entry.path, {}) or {}
        key = data.get("key") or os.path.splitext(entry.name)[0]
        name = data.get("name") or key
        books = data.get("books") or []
        authors_by_key[key] = {
            "key": key,
            "name": name,
            "books": books,
        }
    return authors_by_key, list(authors_by_key.values())

def build_language_indexes(lang: str, authors: list, output_root: str, max_prefix: int, threshold: int) -> int:
    authors_by_key = {a["key"]: a for a in authors}
    for author in authors:
        display, _last, _rest, index_name = parse_author_name(author.get("name", ""))
        author["name"] = display or author.get("name", "")
        author["index"] = normalize_index(index_name or author["name"]) or slugify(author["name"])
        author["index_ascii"] = normalize_index_ascii(index_name or author["name"])
        if "books" not in author or not isinstance(author["books"], list):
            author["books"] = []
        author["books"].sort(key=lambda b: b.get("title", ""))

    books = []
    for author in authors:
        for book in author.get("books", []):
            books.append({
                "id": book.get("id"),
                "source": book.get("source"),
                "sourceBookId": book.get("sourceBookId"),
                "legacyId": book.get("legacyId"),
                "title": book.get("title"),
                "author": author.get("name", ""),
                "author_key": author.get("key", ""),
                "cover": book.get("cover", ""),
                "readerType": book.get("readerType", "legacy"),
            })

    letters = defaultdict(set)
    prefix_authors = defaultdict(set)

    for author in authors:
        idx = author.get("index") or ""
        if lang == "en":
            idx = author.get("index_ascii") or idx
        if not idx:
            continue
        first = idx[0]
        letter = "#" if first.isdigit() else first.upper()
        letters[letter].add(author["key"])
        max_len = min(max_prefix, len(idx))
        for length in range(1, max_len + 1):
            prefix_authors[idx[:length]].add(author["key"])

    letter_items = []
    for letter, keys in sorted(letters.items(), key=lambda item: item[0]):
        if letter == "#":
            letter_key = "num"
        else:
            letter_key = letter.lower()
        letter_items.append({"letter": letter, "key": letter_key, "count": len(keys)})

    lang_root = output_root if lang == "all" else os.path.join(output_root, "lang", lang)
    write_json(os.path.join(lang_root, "letters.json"), {"letters": letter_items})

    for letter, keys in letters.items():
        letter_key = "num" if letter == "#" else letter.lower()
        author_keys = sorted(keys)
        if len(author_keys) < threshold:
            authors_payload = []
            for key in author_keys:
                author = authors_by_key.get(key)
                if not author:
                    continue
                authors_payload.append({
                    "key": author["key"],
                    "name": author["name"],
                    "count": len(author.get("books", [])),
                })
            node = {
                "authors": authors_payload,
                "authorCount": len(authors_payload),
            }
            write_json(os.path.join(lang_root, "p", f"{letter_key}.json"), node)
            continue

        prefixes = []
        seen = set()
        for prefix, pkeys in prefix_authors.items():
            if len(prefix) < 2:
                continue
            if letter == "#":
                if not prefix[0].isdigit():
                    continue
            else:
                if prefix[0].upper() != letter:
                    continue
            if prefix in seen:
                continue
            seen.add(prefix)
            prefixes.append({"prefix": prefix, "count": len(pkeys)})
        prefixes.sort(key=lambda item: item["prefix"])
        write_json(os.path.join(lang_root, "p", f"{letter_key}.json"), {"prefixes": prefixes})

    for prefix, keys in prefix_authors.items():
        # Do not build one-letter prefix nodes (keep p/<letter>.json as letter node only).
        if len(prefix) < 2:
            continue
        author_keys = sorted(keys)
        prefix_node = {
            "authorCount": len(author_keys),
        }
        next_length = len(prefix) + 1
        if len(author_keys) < threshold or len(prefix) >= max_prefix:
            authors_payload = []
            for key in author_keys:
                author = authors_by_key.get(key)
                if not author:
                    continue
                authors_payload.append({
                    "key": author["key"],
                    "name": author["name"],
                    "count": len(author.get("books", [])),
                })
            prefix_node["authors"] = authors_payload
        else:
            child_prefixes = []
            seen = set()
            for key in author_keys:
                idx = authors_by_key[key]["index"]
                if len(idx) < next_length:
                    continue
                child = idx[:next_length]
                if child in seen:
                    continue
                seen.add(child)
                child_keys = prefix_authors.get(child, set())
                child_prefixes.append({"prefix": child, "count": len(child_keys)})
            child_prefixes.sort(key=lambda item: item["prefix"])
            prefix_node["prefixes"] = child_prefixes

        write_json(os.path.join(lang_root, "p", f"{prefix}.json"), prefix_node)

    for author in authors:
        author_out = {
            "key": author["key"],
            "name": author["name"],
            "books": author.get("books", []),
        }
        write_json(os.path.join(lang_root, "a", f"{author['key']}.json"), author_out)

    search_map = defaultdict(list)
    seen_author_tokens = defaultdict(set)
    for author in authors:
        author_search_name = author.get("name") or ""
        for token in build_author_search_tokens(author_search_name):
            if author["key"] not in seen_author_tokens[token]:
                search_map[token].append({
                    "t": "a",
                    "k": author["key"],
                    "n": author["name"],
                    "c": len(author.get("books", [])),
                })
                seen_author_tokens[token].add(author["key"])

    for book in books:
        for token in build_book_search_tokens(book.get("title") or ""):
            search_map[token].append({
                "id": book.get("id"),
                "source": book.get("source") or "gutenberg",
                "legacyId": book.get("legacyId") or book.get("id"),
                "title": book.get("title"),
                "a": book.get("author"),
                "k": book.get("author_key"),
                "cover": book.get("cover"),
                "readerType": book.get("readerType", "legacy"),
            })

    if lang == "all":
        for token, items in search_map.items():
            write_json(os.path.join(lang_root, "search", f"{token}.json"), {"items": items})

    return len(books)

def build_incremental(input_root: str, output_root: str, book_id: str, max_prefix: int, threshold: int, locations: dict | None = None, registry: dict | None = None):
    location = get_book_location(locations or {}, registry or {}, book_id)
    book_path = content_root_to_fs_path(input_root, location.get("localContentPath") or location.get("contentPath") or f"/books/content/{book_id}/")
    opf_data, package_ref = load_book_package(book_path)
    title = opf_data.get("title") or book_id
    creators = opf_data.get("creators") or []
    author_name_raw = creators[0] if creators else "Unknown"
    author_display, _last, _rest, index_name = parse_author_name(author_name_raw)
    author_name = author_display or author_name_raw
    author_key = slugify(author_name_raw) or f"author-{book_id}"

    languages = opf_data.get("languages") or ["und"]
    lang_codes = [normalize_lang(code) for code in languages if code]
    if not lang_codes:
        lang_codes = ["und"]
    lang_codes = set(lang_codes)
    lang_codes.add("all")

    cover_href = opf_data.get("cover_href") or ""
    cover_url = ""
    if cover_href:
        cover_rel_dir = os.path.dirname(package_ref) if package_ref != "reader1" else ""
        cover_rel = os.path.normpath(os.path.join(cover_rel_dir, cover_href))
        base = str(location.get("contentPath") or location.get("legacyPath") or f"/books/content/{book_id}/").rstrip("/")
        cover_url = f"{base}/{cover_rel}"

    public_id = str(location.get("sourceBookId") or book_id)
    source = str(location.get("source") or "gutenberg")
    book_entry = {
        "readerId": str(book_id),
        "id": public_id,
        "source": source,
        "sourceBookId": public_id,
        "legacyId": str(book_id),
        "title": title,
        "cover": cover_url,
        "readerType": str(opf_data.get("reader_type") or "legacy"),
    }

    languages_path = os.path.join(output_root, "languages.json")
    languages_data = read_json(languages_path, {"languages": []}) or {"languages": []}
    lang_map = {item.get("code"): item.get("count", 0) for item in languages_data.get("languages", []) if item.get("code")}

    for lang in lang_codes:
        lang_root = output_root if lang == "all" else os.path.join(output_root, "lang", lang)
        authors_by_key, authors = load_existing_authors(lang_root)
        author = authors_by_key.get(author_key)
        if not author:
            author = {
                "key": author_key,
                "name": author_name,
                "books": [],
            }
            authors_by_key[author_key] = author
            authors.append(author)
        else:
            author["name"] = author_name
        author["books"] = [
            existing for existing in author.get("books", [])
            if not (
                str(existing.get("legacyId") or existing.get("id") or "") == str(book_id)
                or (
                    str(existing.get("source") or "") == source
                    and str(existing.get("sourceBookId") or existing.get("id") or "") == public_id
                )
            )
        ]
        author["books"].append(book_entry)

        book_count = build_language_indexes(lang, authors, output_root, max_prefix, threshold)
        if lang != "all":
            lang_map[lang] = book_count

    lang_items = [{"code": code, "count": count} for code, count in lang_map.items()]
    lang_items.sort(key=lambda item: (-item["count"], item["code"]))
    write_json(languages_path, {"languages": lang_items})


def build_indexes(input_root: str, output_root: str, max_prefix: int, threshold: int, limit: int | None, locations: dict | None = None, registry: dict | None = None):
    by_lang_authors = defaultdict(dict)

    processed = 0
    iterator = iter_books_from_locations(input_root, locations or {}) if locations else ((book_id, book_path, None) for book_id, book_path in iter_books(input_root))
    for book_id, book_path, location in iterator:
        if not location:
            location = get_book_location(locations or {}, registry or {}, book_id)
        try:
            opf_data, package_ref = load_book_package(book_path)
        except Exception:
            continue

        title = opf_data.get("title") or book_id
        creators = opf_data.get("creators") or []
        author_name_raw = creators[0] if creators else "Unknown"
        author_display, _last, _rest, index_name = parse_author_name(author_name_raw)
        author_name = author_display or author_name_raw
        author_key = slugify(author_name_raw) or f"author-{book_id}"
        index_value = normalize_index(index_name or author_name_raw) or author_key

        languages = opf_data.get("languages") or ["und"]
        lang_codes = [normalize_lang(code) for code in languages if code]
        if not lang_codes:
            lang_codes = ["und"]
        lang_codes = set(lang_codes)
        lang_codes.add("all")

        cover_href = opf_data.get("cover_href") or ""
        cover_url = ""
        if cover_href:
            cover_rel_dir = os.path.dirname(package_ref) if package_ref != "reader1" else ""
            cover_rel = os.path.normpath(os.path.join(cover_rel_dir, cover_href))
            base = str((location or {}).get("contentPath") or (location or {}).get("legacyPath") or f"/books/content/{book_id}/").rstrip("/")
            cover_url = f"{base}/{cover_rel}"

        public_id = str((location or {}).get("sourceBookId") or book_id)
        source = str((location or {}).get("source") or "gutenberg")
        book_entry = {
            "readerId": str(book_id),
            "id": public_id,
            "source": source,
            "sourceBookId": public_id,
            "legacyId": str(book_id),
            "title": title,
            "cover": cover_url,
            "readerType": str(opf_data.get("reader_type") or "legacy"),
        }

        for lang in lang_codes:
            author_map = by_lang_authors[lang]
            author = author_map.get(author_key)
            if not author:
                author = {
                    "key": author_key,
                    "name": author_name,
                    "index": index_value,
                    "books": [],
                }
                author_map[author_key] = author
            author["books"].append(book_entry)

        processed += 1
        if limit and processed >= limit:
            break

    language_summary = []

    for lang, author_map in by_lang_authors.items():
        authors = list(author_map.values())
        book_count = build_language_indexes(lang, authors, output_root, max_prefix, threshold)
        if lang != "all":
            language_summary.append({
                "code": lang,
                "count": book_count,
            })

    language_summary.sort(key=lambda item: (-item["count"], item["code"]))
    write_json(os.path.join(output_root, "languages.json"), {"languages": language_summary})


def main():
    default_output = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "reader_lang_indexes"))
    default_locations = os.path.abspath(os.path.join(default_output, "book-locations.json"))
    default_registry = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "state", "source_registry.json"))
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="/Volumes/2T/se_ingest/webbooks")
    parser.add_argument("--output", default=default_output)
    parser.add_argument("--locations", default=default_locations)
    parser.add_argument("--registry", default=default_registry)
    parser.add_argument("--max-prefix", type=int, default=5)
    parser.add_argument("--threshold", type=int, default=50)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--book-id")
    args = parser.parse_args()

    locations = load_book_locations(args.locations)
    registry = load_source_registry(args.registry)
    if args.book_id:
        build_incremental(args.input, args.output, str(args.book_id), args.max_prefix, args.threshold, locations, registry)
        return
    build_indexes(args.input, args.output, args.max_prefix, args.threshold, args.limit, locations, registry)


if __name__ == "__main__":
    main()
