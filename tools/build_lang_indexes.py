#!/usr/bin/env python3
import argparse
import json
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict

def clean_text(value: str) -> str:
    return " ".join(str(value or "").split())

def strip_diacritics(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return normalized.encode("ascii", "ignore").decode("ascii")

def normalize_lang(code: str) -> str:
    base = clean_text(code).lower().replace("_", "-")
    base = re.sub(r"[^a-z0-9-]+", "-", base)
    base = re.sub(r"-+", "-", base).strip("-")
    return base or "und"

def normalize_index(value: str) -> str:
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
    base = re.sub(r"[^a-z0-9]+", "", base)
    return base[:2] if len(base) >= 2 else ""

DC_NS = "http://purl.org/dc/elements/1.1/"
OPF_NS = "http://www.idpf.org/2007/opf"
CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"


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
    }


def iter_books(root_dir: str):
    for entry in os.scandir(root_dir):
        if not entry.is_dir():
            continue
        if not entry.name.isdigit():
            continue
        yield entry.name, entry.path


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def write_json(path: str, data):
    ensure_dir(os.path.dirname(path))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def build_indexes(input_root: str, output_root: str, max_prefix: int, threshold: int, limit: int | None):
    by_lang_authors = defaultdict(dict)
    by_lang_books = defaultdict(list)

    processed = 0
    for book_id, book_path in iter_books(input_root):
        container_path = os.path.join(book_path, "META-INF", "container.xml")
        if not os.path.exists(container_path):
            continue
        try:
            opf_rel = parse_container(container_path)
            if not opf_rel:
                continue
            opf_path = os.path.join(book_path, opf_rel)
            if not os.path.exists(opf_path):
                continue
            opf_data = parse_opf(opf_path)
        except Exception:
            continue

        title = opf_data.get("title") or book_id
        creators = opf_data.get("creators") or []
        author_name = creators[0] if creators else "Unknown"
        author_key = slugify(author_name) or f"author-{book_id}"
        index_value = normalize_index(author_name) or author_key

        languages = opf_data.get("languages") or ["und"]
        lang_codes = [normalize_lang(code) for code in languages if code]
        if not lang_codes:
            lang_codes = ["und"]

        cover_href = opf_data.get("cover_href") or ""
        cover_url = ""
        if cover_href:
            cover_rel_dir = os.path.dirname(opf_rel)
            cover_rel = os.path.normpath(os.path.join(cover_rel_dir, cover_href))
            cover_url = f"/books/content/{book_id}/{cover_rel}"

        book_entry = {
            "id": book_id,
            "title": title,
            "cover": cover_url,
        }

        for lang in set(lang_codes):
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
            by_lang_books[lang].append({
                "id": book_id,
                "title": title,
                "author": author_name,
                "author_key": author_key,
                "cover": cover_url,
            })

        processed += 1
        if limit and processed >= limit:
            break

    language_summary = []

    for lang, author_map in by_lang_authors.items():
        authors = list(author_map.values())
        for author in authors:
            author["books"].sort(key=lambda b: b.get("title", ""))

        authors_by_key = {a["key"]: a for a in authors}

        letters = defaultdict(set)
        prefix_authors = defaultdict(set)

        for author in authors:
            idx = author.get("index") or ""
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
            letter_items.append({"letter": letter, "key": letter.lower(), "count": len(keys)})

        lang_root = os.path.join(output_root, "lang", lang)
        write_json(os.path.join(lang_root, "letters.json"), {"letters": letter_items})

        # Build letter-level prefix lists or author lists
        for letter, keys in letters.items():
            letter_key = letter.lower()
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
                        "count": len(author["books"]),
                    })
                node = {
                    "authors": authors_payload,
                    "authorCount": len(authors_payload),
                }
                write_json(os.path.join(lang_root, "p", f"{letter_key}.json"), node)
                continue

            # Prefix list for the letter (length 2)
            prefixes = []
            seen = set()
            for prefix, pkeys in prefix_authors.items():
                if len(prefix) < 2:
                    continue
                if prefix[0].upper() != letter:
                    continue
                if prefix in seen:
                    continue
                seen.add(prefix)
                prefixes.append({"prefix": prefix, "count": len(pkeys)})
            prefixes.sort(key=lambda item: item["prefix"])
            write_json(os.path.join(lang_root, "p", f"{letter_key}.json"), {"prefixes": prefixes})

        # Build prefix nodes
        for prefix, keys in prefix_authors.items():
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
                        "count": len(author["books"]),
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

        # Build author JSON files
        for author in authors:
            author_out = {
                "key": author["key"],
                "name": author["name"],
                "books": author["books"],
            }
            write_json(os.path.join(lang_root, "a", f"{author['key']}.json"), author_out)

        # Build search indexes
        search_map = defaultdict(list)
        seen_author_tokens = defaultdict(set)
        for author in authors:
            token = normalize_search_token(author["name"])
            if token:
                if author["key"] not in seen_author_tokens[token]:
                    search_map[token].append({
                        "t": "a",
                        "k": author["key"],
                        "n": author["name"],
                        "c": len(author["books"]),
                    })
                    seen_author_tokens[token].add(author["key"])

        for book in by_lang_books.get(lang, []):
            token = normalize_search_token(book["title"])
            if not token:
                continue
            search_map[token].append({
                "id": book["id"],
                "title": book["title"],
                "a": book["author"],
                "k": book["author_key"],
                "cover": book["cover"],
            })

        for token, items in search_map.items():
            write_json(os.path.join(lang_root, "search", f"{token}.json"), {"items": items})

        language_summary.append({
            "code": lang,
            "count": len(by_lang_books.get(lang, [])),
        })

    language_summary.sort(key=lambda item: (-item["count"], item["code"]))
    write_json(os.path.join(output_root, "languages.json"), {"languages": language_summary})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="/Volumes/2T/se_ingest/webbooks")
    parser.add_argument("--output", default="/tmp/reader_lang_indexes")
    parser.add_argument("--max-prefix", type=int, default=5)
    parser.add_argument("--threshold", type=int, default=50)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    build_indexes(args.input, args.output, args.max_prefix, args.threshold, args.limit)


if __name__ == "__main__":
    main()
