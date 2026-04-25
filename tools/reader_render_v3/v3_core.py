from __future__ import annotations

import hashlib
import json
import mimetypes
import posixpath
import re
import shutil
import tempfile
import zipfile
from html import escape
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


MANIFEST_NAME = "book-manifest.json"
EXTERNAL_PREFIXES = ("data:", "http:", "https:", "mailto:", "tel:", "javascript:")
ID_ATTR_RE = re.compile(r'(?P<prefix>\b(?:xml:)?id\s*=\s*)(?P<quote>["\'])(?P<value>.*?)(?P=quote)', re.IGNORECASE)
URL_ATTR_RE = re.compile(r'(?P<attr>\b(?:href|src|poster|xlink:href)\s*=\s*)(?P<quote>["\'])(?P<value>.*?)(?P=quote)', re.IGNORECASE)
CSS_URL_RE = re.compile(r"url\(\s*(?P<quote>['\"]?)(?P<value>.*?)(?P=quote)\s*\)", re.IGNORECASE)
BLOCK_SPLIT_RE = re.compile(r"(?is)<(h[1-6]|p|li|blockquote|div|section|article|aside)\b.*?>.*?</\1>")
TAG_RE = re.compile(r"(?is)<[^>]+>")
WS_RE = re.compile(r"\s+")


@dataclass
class SourceBook:
    kind: str
    root: Path
    cleanup_root: Path | None = None


def local_name(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def ensure_empty_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def write_json(path: Path, payload: object) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def build_hash_token(*parts: str, prefix: str = "", length: int = 12) -> str:
    digest = hashlib.sha1("::".join(parts).encode("utf-8")).hexdigest()
    return f"{prefix}{digest[:length]}"


def normalized_href(base_dir: str, href: str) -> str:
    joined = posixpath.normpath(posixpath.join(base_dir, href))
    return joined.lstrip("./")


def split_ref(value: str) -> tuple[str, str]:
    if "#" in value:
        path, frag = value.split("#", 1)
        return path, frag
    return value, ""


def relative_href(current_new_href: str, target_new_href: str) -> str:
    current_dir = posixpath.dirname(current_new_href)
    rel = posixpath.relpath(target_new_href, start=current_dir or ".")
    return rel if rel != "." else posixpath.basename(target_new_href)


def media_extension(media_type: str) -> str:
    guessed = mimetypes.guess_extension(media_type or "", strict=False) or ""
    return ".jpg" if guessed == ".jpe" else guessed


def is_content_doc(media_type: str) -> bool:
    return (media_type or "").lower() in {"application/xhtml+xml", "text/html"}


def guess_media_type(path_value: str) -> str:
    suffix = Path(path_value).suffix.lower()
    if suffix == ".css":
        return "text/css"
    if suffix in {".xhtml", ".html", ".htm"}:
        return "application/xhtml+xml"
    guessed, _ = mimetypes.guess_type(path_value)
    return guessed or "application/octet-stream"


def parse_container(path: Path) -> str:
    tree = ET.parse(path)
    root = tree.getroot()
    for element in root.iter():
        if local_name(element.tag) != "rootfile":
            continue
        full_path = str(element.attrib.get("full-path") or "").strip()
        if full_path:
            return full_path
    raise RuntimeError("container.xml does not declare an OPF path")


def parse_opf(path: Path, opf_rel: str | None = None) -> dict:
    tree = ET.parse(path)
    root = tree.getroot()
    metadata = {"title": "", "creators": [], "languages": [], "identifier": ""}
    manifest = {}
    spine = []
    nav_href = ""
    cover_href = ""
    cover_id_hint = ""
    page_progression = ""
    toc_id = ""

    for element in root.iter():
        tag = local_name(element.tag)
        text = " ".join((element.text or "").split())
        if tag == "title" and not metadata["title"]:
            metadata["title"] = text
        elif tag == "creator" and text:
            metadata["creators"].append(text)
        elif tag == "language" and text:
            metadata["languages"].append(text)
        elif tag == "identifier" and text and not metadata["identifier"]:
            metadata["identifier"] = text
        elif tag == "meta" and element.attrib.get("name") == "cover" and not cover_href:
            cover_id = str(element.attrib.get("content") or "").strip()
            if cover_id:
                cover_id_hint = cover_id
                if cover_id in manifest:
                    cover_href = manifest[cover_id]["href"]
        elif tag == "item":
            item_id = str(element.attrib.get("id") or "").strip()
            href = str(element.attrib.get("href") or "").strip()
            media_type = str(element.attrib.get("media-type") or "").strip()
            props = [piece for piece in str(element.attrib.get("properties") or "").split() if piece]
            manifest[item_id] = {
                "id": item_id,
                "href": href,
                "media_type": media_type,
                "properties": props,
            }
            if "nav" in props:
                nav_href = href
            if "cover-image" in props and not cover_href:
                cover_href = href
        elif tag == "spine":
            page_progression = str(element.attrib.get("page-progression-direction") or "").strip()
            toc_id = str(element.attrib.get("toc") or "").strip()
        elif tag == "itemref":
            spine.append({
                "idref": str(element.attrib.get("idref") or "").strip(),
                "linear": str(element.attrib.get("linear") or "yes").strip() or "yes",
            })

    if not cover_href and cover_id_hint and cover_id_hint in manifest:
        cover_href = manifest[cover_id_hint]["href"]

    return {
        "metadata": metadata,
        "manifest": manifest,
        "spine": spine,
        "nav_href": nav_href,
        "toc_id": toc_id,
        "cover_href": cover_href,
        "page_progression": page_progression,
        "opf_dir": posixpath.dirname((opf_rel or path.as_posix()).replace("\\", "/")),
    }


def iter_local_refs(raw: str) -> list[str]:
    refs = []
    refs.extend(match.group("value") for match in URL_ATTR_RE.finditer(raw))
    refs.extend(match.group("value") for match in CSS_URL_RE.finditer(raw))
    return refs


def discover_supplemental_manifest(unpack_root: Path, opf_data: dict) -> dict:
    manifest = dict(opf_data["manifest"])
    opf_dir = opf_data["opf_dir"]
    known_hrefs = {normalized_href(opf_dir, item["href"]) for item in manifest.values()}
    pending_text = []

    for item in manifest.values():
        media_type = item.get("media_type") or ""
        if is_content_doc(media_type) or media_type == "text/css":
            pending_text.append(normalized_href(opf_dir, item["href"]))

    seen_text = set()
    while pending_text:
        current_href = pending_text.pop()
        if current_href in seen_text:
            continue
        seen_text.add(current_href)
        source_path = unpack_root / current_href
        if not source_path.exists():
            continue
        raw = read_text(source_path)
        for raw_ref in iter_local_refs(raw):
            value = str(raw_ref or "").strip()
            if not value or value.lower().startswith(EXTERNAL_PREFIXES):
                continue
            path_part, _frag = split_ref(value)
            if not path_part:
                continue
            target_href = normalized_href(posixpath.dirname(current_href), path_part)
            if target_href in known_hrefs:
                continue
            target_path = unpack_root / target_href
            if not target_path.exists() or not target_path.is_file():
                continue
            media_type = guess_media_type(target_href)
            item_id = f"extra-{build_hash_token(target_href, length=12)}"
            manifest[item_id] = {
                "id": item_id,
                "href": posixpath.relpath(target_href, opf_dir) if opf_dir else target_href,
                "media_type": media_type,
                "properties": [],
            }
            known_hrefs.add(target_href)
            if is_content_doc(media_type) or media_type == "text/css":
                pending_text.append(target_href)

    return {**opf_data, "manifest": manifest}


def parse_nav_toc(opf_path: Path, nav_href: str) -> list[dict]:
    if not nav_href:
        return []
    nav_path = opf_path.parent / nav_href
    if not nav_path.exists():
        return []
    tree = ET.parse(nav_path)
    root = tree.getroot()
    toc = []
    in_nav = False
    for element in root.iter():
        tag = local_name(element.tag)
        if tag == "nav":
            nav_type = str(element.attrib.get("{http://www.idpf.org/2007/ops}type") or element.attrib.get("type") or "")
            in_nav = nav_type == "toc" or not toc
        elif in_nav and tag == "a":
            href = str(element.attrib.get("href") or "").strip()
            title = " ".join("".join(element.itertext()).split())
            if href and title:
                toc.append({"href": href, "title": title})
    return toc


def parse_ncx_toc(opf_path: Path, opf_data: dict) -> list[dict]:
    toc_id = str(opf_data.get("toc_id") or "").strip()
    manifest = opf_data.get("manifest") or {}
    toc_item = manifest.get(toc_id) if toc_id else None
    if not toc_item:
        return []
    if (toc_item.get("media_type") or "").lower() != "application/x-dtbncx+xml":
        return []
    ncx_path = opf_path.parent / str(toc_item.get("href") or "").strip()
    if not ncx_path.exists():
        return []
    tree = ET.parse(ncx_path)
    root = tree.getroot()
    toc = []
    for nav_point in root.findall(".//{*}navPoint"):
        label_node = nav_point.find(".//{*}navLabel/{*}text")
        content_node = nav_point.find("./{*}content")
        href = str(content_node.attrib.get("src") or "").strip() if content_node is not None else ""
        title = " ".join("".join(label_node.itertext()).split()) if label_node is not None else ""
        if href and title:
            toc.append({"href": href, "title": title})
    return toc


def collect_id_map(content_files: dict[str, str]) -> dict[tuple[str, str], str]:
    id_map: dict[tuple[str, str], str] = {}
    for old_href, raw in content_files.items():
        for match in ID_ATTR_RE.finditer(raw):
            old_id = match.group("value")
            if old_id:
                id_map[(old_href, old_id)] = build_hash_token(old_href, old_id, prefix="x", length=10)
    return id_map


def rewrite_url_value(raw_value: str, current_old_href: str, current_new_href: str, href_map: dict, id_map: dict) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return raw_value
    if value.lower().startswith(EXTERNAL_PREFIXES):
        return raw_value
    path_part, frag = split_ref(value)
    old_target_href = current_old_href if not path_part else normalized_href(posixpath.dirname(current_old_href), path_part)
    new_target_href = href_map.get(old_target_href)
    rewritten = relative_href(current_new_href, new_target_href) if new_target_href else path_part
    if frag:
        mapped_frag = id_map.get((old_target_href, frag)) or id_map.get((current_old_href, frag)) or frag
        return f"{rewritten}#{mapped_frag}" if rewritten else f"#{mapped_frag}"
    return rewritten


def rewrite_markup(raw: str, current_old_href: str, current_new_href: str, href_map: dict, id_map: dict) -> str:
    def replace_id(match: re.Match) -> str:
        old_id = match.group("value")
        new_id = id_map.get((current_old_href, old_id), old_id)
        return f"{match.group('prefix')}{match.group('quote')}{new_id}{match.group('quote')}"

    def replace_attr(match: re.Match) -> str:
        rewritten = rewrite_url_value(match.group("value"), current_old_href, current_new_href, href_map, id_map)
        return f"{match.group('attr')}{match.group('quote')}{rewritten}{match.group('quote')}"

    def replace_css_url(match: re.Match) -> str:
        rewritten = rewrite_url_value(match.group("value"), current_old_href, current_new_href, href_map, id_map)
        quote = match.group("quote")
        return f"url({quote}{rewritten}{quote})"

    updated = ID_ATTR_RE.sub(replace_id, raw)
    updated = URL_ATTR_RE.sub(replace_attr, updated)
    updated = CSS_URL_RE.sub(replace_css_url, updated)
    return updated


def build_href_map(opf_data: dict) -> tuple[dict[str, str], list[str], list[dict]]:
    manifest = opf_data["manifest"]
    opf_dir = opf_data["opf_dir"]
    spine_ids = {item["idref"] for item in opf_data["spine"] if item.get("idref")}
    href_map: dict[str, str] = {}
    resource_entries: list[dict] = []
    spine_hrefs: list[str] = []

    for item_id, item in manifest.items():
        old_href = normalized_href(opf_dir, item["href"])
        media_type = item.get("media_type") or ""
        suffix = Path(item["href"]).suffix or media_extension(media_type)
        if item_id in spine_ids or is_content_doc(media_type):
            prefix = "assets/content"
        elif media_type == "text/css":
            prefix = "assets/styles"
        else:
            prefix = "assets/resources"
        filename = f"{build_hash_token(old_href, item_id, length=12)}{suffix}"
        href_map[old_href] = f"{prefix}/{filename}"

    for spine_item in opf_data["spine"]:
        manifest_item = manifest.get(spine_item["idref"])
        if manifest_item:
            spine_hrefs.append(normalized_href(opf_dir, manifest_item["href"]))

    cover_old_href = normalized_href(opf_dir, opf_data["cover_href"]) if opf_data.get("cover_href") else ""

    for item_id, item in manifest.items():
        old_href = normalized_href(opf_dir, item["href"])
        if old_href in spine_hrefs:
            continue
        if (item.get("media_type") or "").lower() == "application/x-dtbncx+xml":
            continue
        entry = {"href": href_map[old_href], "type": item.get("media_type") or "application/octet-stream"}
        if old_href == cover_old_href:
            entry["rel"] = ["cover"]
        resource_entries.append(entry)

    return href_map, spine_hrefs, resource_entries


def strip_tags(raw: str) -> str:
    without_tags = TAG_RE.sub(" ", raw)
    return WS_RE.sub(" ", without_tags).strip()


def iter_text_blocks(raw_markup: str) -> Iterable[str]:
    seen = False
    for match in BLOCK_SPLIT_RE.finditer(raw_markup):
        seen = True
        text = strip_tags(match.group(0))
        if text:
            yield text
    if not seen:
        text = strip_tags(raw_markup)
        if text:
            yield text


def tokenize_block_text(text: str) -> list[str]:
    return re.findall(r"\S+", text)


def estimate_token_width(token: str) -> int:
    width = 20
    for char in token:
        if char in "ilI.,:;!'|":
            width += 6
        elif char in "mwMWQG@%#&":
            width += 15
        else:
            width += 11
    return width


def estimate_glyph_width(char: str) -> int:
    if char == " ":
        return 10
    if char in "ilI.,:;!'|":
        return 8
    if char in "mwMWQG@%#&":
        return 19
    return 14


def build_glyph_sprite(char: str) -> dict:
    advance = estimate_glyph_width(char)
    sprite_width = max(advance + 4, 12)
    sprite_height = 44
    escaped_char = escape(char if char != " " else "\u00A0")
    return {
        "advance": advance,
        "width": sprite_width,
        "height": sprite_height,
        "svg": (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        '<text x="1" y="34" font-family="Georgia" font-size="32" '
        'fill="#223049">{}</text>'
        "</svg>"
        ).format(escaped_char, width=sprite_width, height=sprite_height),
    }


def build_nav_payload(opf_data: dict, href_map: dict, toc_items: list[dict], id_map: dict) -> dict:
    opf_dir = opf_data["opf_dir"]
    items = []
    for item in toc_items:
        href = str(item.get("href") or "").strip()
        title = str(item.get("title") or "").strip()
        if not href or not title:
            continue
        path_part, frag = split_ref(href)
        old_target = normalized_href(opf_dir, path_part)
        new_target = href_map.get(old_target)
        if not new_target:
            continue
        target = new_target
        if frag:
            target = f"{new_target}#{id_map.get((old_target, frag), frag)}"
        items.append({
            "id": build_hash_token(target, title, prefix="toc-", length=10),
            "label": title,
            "target": target,
            "children": [],
        })
    return {"items": items}


def build_section_payloads(
    opf_data: dict,
    href_map: dict,
    content_files: dict[str, str],
    id_map: dict,
) -> tuple[list[dict], dict[str, dict], dict[str, dict], dict[str, dict], dict[str, str]]:
    opf_dir = opf_data["opf_dir"]
    order_items: list[dict] = []
    page_payloads: dict[str, dict] = {}
    layout_payloads: dict[str, dict] = {}
    glyph_payloads: dict[str, dict] = {}
    glyph_assets: dict[str, str] = {}
    max_line_width = 560
    line_height = 42

    for index, spine_item in enumerate(opf_data["spine"]):
        manifest_item = opf_data["manifest"].get(spine_item["idref"])
        if not manifest_item:
            continue
        old_href = normalized_href(opf_dir, manifest_item["href"])
        asset_href = href_map[old_href]
        section_id = spine_item["idref"] or f"section-{index+1}"
        raw_markup = content_files[old_href]
        blocks = []
        local_glyphs: list[dict] = []
        for block_index, text in enumerate(iter_text_blocks(raw_markup)):
            glyph_ids = []
            positions = []
            cursor_x = 0
            cursor_y = 0
            for char_index, char in enumerate(text):
                glyph_id = build_hash_token(section_id, str(block_index), str(char_index), prefix="g-", length=12)
                sprite = build_glyph_sprite(char)
                href = f"assets/glyphs/{glyph_id}.svg"
                local_glyphs.append({
                    "id": glyph_id,
                    "href": href,
                    "advance": sprite["advance"],
                    "width": sprite["width"],
                    "height": sprite["height"],
                    "svg": sprite["svg"],
                })
                glyph_assets[href] = sprite["svg"]
                if cursor_x > 0 and cursor_x + sprite["advance"] > max_line_width:
                    cursor_x = 0
                    cursor_y += line_height
                glyph_ids.append(glyph_id)
                positions.append({
                    "x": cursor_x,
                    "y": cursor_y,
                    "width": sprite["width"],
                    "height": sprite["height"],
                })
                cursor_x += sprite["advance"]
            blocks.append({
                "id": build_hash_token(section_id, str(block_index), prefix="b-", length=10),
                "glyphs": glyph_ids,
                "positions": positions,
                "glyphCount": len(glyph_ids),
                "charEstimate": len(text),
                "height": (cursor_y + line_height) if glyph_ids else line_height,
            })
        page_key = f"pages/{build_hash_token(section_id, prefix='p-', length=10)}.json"
        layout_key = f"layout/{build_hash_token(section_id, prefix='l-', length=10)}.json"
        glyph_key = f"glyphs/{build_hash_token(section_id, prefix='g-', length=10)}.json"
        page_payloads[page_key] = {
            "sectionId": section_id,
            "href": asset_href,
            "blocks": blocks,
        }
        layout_payloads[layout_key] = {
            "sectionId": section_id,
            "renderMode": "page-glyph-canvas",
            "sourceHref": asset_href,
            "pagePayload": page_key,
            "glyphPayload": glyph_key,
            "blockCount": len(blocks),
        }
        glyph_payloads[glyph_key] = {
            "sectionId": section_id,
            "mode": "page-local-glyphs",
            "glyphs": [
                {
                    "id": glyph["id"],
                    "href": glyph["href"],
                    "advance": glyph["advance"],
                    "width": glyph["width"],
                    "height": glyph["height"],
                }
                for glyph in local_glyphs
            ],
            "count": len(local_glyphs),
        }
        order_items.append({
            "id": section_id,
            "assetHref": asset_href,
            "layout": layout_key,
            "page": page_key,
            "glyphs": glyph_key,
            "linear": spine_item.get("linear") or "yes",
            "properties": manifest_item.get("properties") or [],
        })

    return order_items, page_payloads, layout_payloads, glyph_payloads, glyph_assets


def chunk_order_items(items: list[dict], chunk_size: int = 8) -> list[dict]:
    chunks = []
    for start in range(0, len(items), chunk_size):
        chunk_items = items[start:start + chunk_size]
        next_key = ""
        if start + chunk_size < len(items):
            next_key = f"order/{build_hash_token(str(start + chunk_size), prefix='o-', length=10)}.json"
        chunks.append({
            "path": f"order/{build_hash_token(str(start), prefix='o-', length=10)}.json",
            "payload": {
                "items": chunk_items,
                "next": next_key,
            },
        })
    if not chunks:
        chunks.append({"path": "order/o-empty.json", "payload": {"items": [], "next": ""}})
    return chunks


def build_manifest(metadata: dict, resource_entries: list[dict], nav_entry: str, order_entry: str) -> dict:
    return {
        "version": 3,
        "metadata": {
            "title": metadata["title"],
            "bookTitle": metadata["title"],
            "creator": metadata["creators"][0] if metadata["creators"] else "",
            "creators": metadata["creators"],
            "language": metadata["languages"][0] if metadata["languages"] else "",
            "languages": metadata["languages"],
            "identifier": metadata["identifier"],
        },
        "resources": resource_entries,
        "navigation": {"entry": nav_entry},
        "readingOrder": {"entry": order_entry},
        "layout": {"entry": "layout/root.json"},
        "pageData": {"entry": "pages/root.json"},
    }


def load_source_book(input_path: Path) -> SourceBook:
    if input_path.is_file() and input_path.suffix.lower() == ".epub":
        tmpdir = Path(tempfile.mkdtemp(prefix="reader_render_v3_epub_"))
        with zipfile.ZipFile(input_path, "r") as archive:
            archive.extractall(tmpdir)
        return SourceBook(kind="epub", root=tmpdir, cleanup_root=tmpdir)
    if input_path.is_dir():
        return SourceBook(kind="legacy_dir", root=input_path, cleanup_root=None)
    raise FileNotFoundError(f"Unsupported input: {input_path}")


def convert_to_v3(input_path: Path, output_dir: Path) -> None:
    source = load_source_book(input_path)
    try:
        unpack_root = source.root
        container_path = unpack_root / "META-INF" / "container.xml"
        if not container_path.exists():
            raise RuntimeError("Source book is missing META-INF/container.xml")

        opf_rel = parse_container(container_path)
        opf_path = unpack_root / opf_rel
        if not opf_path.exists():
            raise RuntimeError(f"OPF file not found: {opf_rel}")

        opf_data = discover_supplemental_manifest(unpack_root, parse_opf(opf_path, opf_rel))
        href_map, spine_hrefs, resource_entries = build_href_map(opf_data)

        content_files: dict[str, str] = {}
        css_files: dict[str, str] = {}
        for item in opf_data["manifest"].values():
            old_href = normalized_href(opf_data["opf_dir"], item["href"])
            source_path = unpack_root / old_href
            if not source_path.exists():
                continue
            media_type = item.get("media_type") or ""
            if is_content_doc(media_type):
                content_files[old_href] = read_text(source_path)
            elif media_type == "text/css":
                css_files[old_href] = read_text(source_path)

        id_map = collect_id_map(content_files)

        with tempfile.TemporaryDirectory(prefix="reader_render_v3_out_") as build_tmp:
            build_root = Path(build_tmp)
            for item in opf_data["manifest"].values():
                old_href = normalized_href(opf_data["opf_dir"], item["href"])
                source_path = unpack_root / old_href
                new_href = href_map.get(old_href)
                if not source_path.exists() or not new_href:
                    continue
                target_path = build_root / new_href
                media_type = item.get("media_type") or ""
                if is_content_doc(media_type):
                    rewritten = rewrite_markup(content_files[old_href], old_href, new_href, href_map, id_map)
                    write_text(target_path, rewritten)
                elif media_type == "text/css":
                    rewritten = rewrite_markup(css_files[old_href], old_href, new_href, href_map, id_map)
                    write_text(target_path, rewritten)
                else:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source_path, target_path)

            toc_items = parse_nav_toc(opf_path, opf_data.get("nav_href") or "") or parse_ncx_toc(opf_path, opf_data)
            nav_payload = build_nav_payload(opf_data, href_map, toc_items, id_map)
            order_items, page_payloads, layout_payloads, glyph_payloads, glyph_assets = build_section_payloads(
                opf_data,
                href_map,
                content_files,
                id_map,
            )
            order_chunks = chunk_order_items(order_items, chunk_size=8)

            write_json(build_root / "nav" / "toc.json", nav_payload)
            for chunk in order_chunks:
                write_json(build_root / chunk["path"], chunk["payload"])
            for path_key, payload in page_payloads.items():
                write_json(build_root / path_key, payload)
            for path_key, payload in layout_payloads.items():
                write_json(build_root / path_key, payload)
            for href, svg in glyph_assets.items():
                write_text(build_root / href, svg)
            for path_key, payload in glyph_payloads.items():
                write_json(build_root / path_key, payload)

            write_json(build_root / "layout" / "root.json", {
                "sections": [{"id": item["id"], "layout": item["layout"], "assetHref": item["assetHref"], "page": item["page"], "glyphs": item["glyphs"]} for item in order_items]
            })
            write_json(build_root / "pages" / "root.json", {
                "sections": [{"id": item["id"], "page": item["page"], "glyphs": item["glyphs"], "assetHref": item["assetHref"]} for item in order_items]
            })

            manifest = build_manifest(
                opf_data["metadata"],
                resource_entries,
                nav_entry="nav/toc.json",
                order_entry=order_chunks[0]["path"],
            )
            write_json(build_root / MANIFEST_NAME, manifest)

            tmp_dest = output_dir.parent / f".{output_dir.name}.render-v3-tmp"
            ensure_empty_dir(tmp_dest)
            for child in build_root.iterdir():
                shutil.move(str(child), tmp_dest / child.name)
            if output_dir.exists():
                shutil.rmtree(output_dir)
            tmp_dest.replace(output_dir)
    finally:
        if source.cleanup_root and source.cleanup_root.exists():
            shutil.rmtree(source.cleanup_root, ignore_errors=True)
