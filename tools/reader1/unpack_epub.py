#!/usr/bin/env python3
import argparse
import hashlib
import json
import mimetypes
import posixpath
import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_CONTENT_ROOT = ROOT_DIR / "books" / "content"
MANIFEST_NAME = "reader1-manifest.json"
ID_ATTR_RE = re.compile(r'(?P<prefix>\b(?:xml:)?id\s*=\s*)(?P<quote>["\'])(?P<value>.*?)(?P=quote)', re.IGNORECASE)
URL_ATTR_RE = re.compile(r'(?P<attr>\b(?:href|src|poster|xlink:href)\s*=\s*)(?P<quote>["\'])(?P<value>.*?)(?P=quote)', re.IGNORECASE)
CSS_URL_RE = re.compile(r"url\(\s*(?P<quote>['\"]?)(?P<value>.*?)(?P=quote)\s*\)", re.IGNORECASE)
EXTERNAL_PREFIXES = ("data:", "http:", "https:", "mailto:", "tel:", "javascript:")


def log(message: str) -> None:
    print(f"[reader1-unpack] {message}")


def ensure_empty_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def local_name(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


def media_extension(media_type: str) -> str:
    guessed = mimetypes.guess_extension(media_type or "", strict=False) or ""
    if guessed == ".jpe":
        return ".jpg"
    return guessed


def is_content_doc(media_type: str) -> bool:
    lowered = (media_type or "").lower()
    return lowered in {"application/xhtml+xml", "text/html"}


def normalized_href(base_dir: str, href: str) -> str:
    joined = posixpath.normpath(posixpath.join(base_dir, href))
    return joined.lstrip("./")


def split_ref(value: str) -> tuple[str, str]:
    path, frag = value, ""
    if "#" in value:
        path, frag = value.split("#", 1)
    return path, frag


def build_hash_token(*parts: str, prefix: str = "", length: int = 12) -> str:
    digest = hashlib.sha1("::".join(parts).encode("utf-8")).hexdigest()
    return f"{prefix}{digest[:length]}"


def relative_href(current_new_href: str, target_new_href: str) -> str:
    current_dir = posixpath.dirname(current_new_href)
    rel = posixpath.relpath(target_new_href, start=current_dir or ".")
    return rel if rel != "." else posixpath.basename(target_new_href)


def safe_json(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}


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


def parse_nav_toc(path: Path, nav_href: str) -> list[dict]:
    if not nav_href:
        return []
    nav_path = path.parent / nav_href
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


def parse_ncx_toc(path: Path, opf_data: dict) -> list[dict]:
    toc_id = str(opf_data.get("toc_id") or "").strip()
    manifest = opf_data.get("manifest") or {}
    toc_item = manifest.get(toc_id) if toc_id else None
    if not toc_item:
        return []
    if (toc_item.get("media_type") or "").lower() != "application/x-dtbncx+xml":
        return []
    ncx_path = path.parent / str(toc_item.get("href") or "").strip()
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


def rewrite_url_value(raw_value: str, current_old_href: str, current_new_href: str, href_map: dict, id_map: dict) -> str:
    value = str(raw_value or "").strip()
    if not value:
        return raw_value
    lowered = value.lower()
    if lowered.startswith(EXTERNAL_PREFIXES):
        return raw_value

    path_part, frag = split_ref(value)
    if not path_part and frag:
        old_target_href = current_old_href
    elif not path_part:
        old_target_href = current_old_href
    else:
        old_target_href = normalized_href(posixpath.dirname(current_old_href), path_part)

    new_target_href = href_map.get(old_target_href)
    if new_target_href:
        rewritten = relative_href(current_new_href, new_target_href)
    else:
        rewritten = path_part

    if frag:
        mapped_frag = id_map.get((old_target_href, frag)) or id_map.get((current_old_href, frag)) or frag
        if rewritten:
            return f"{rewritten}#{mapped_frag}"
        return f"#{mapped_frag}"
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
        quote = match.group("quote") or ""
        return f"url({quote}{rewritten}{quote})"

    updated = ID_ATTR_RE.sub(replace_id, raw)
    updated = URL_ATTR_RE.sub(replace_attr, updated)
    updated = CSS_URL_RE.sub(replace_css_url, updated)
    return updated


def collect_id_map(content_files: dict) -> dict:
    id_map = {}
    for old_href, raw in content_files.items():
        for match in ID_ATTR_RE.finditer(raw):
            old_id = match.group("value")
            if not old_id:
                continue
            id_map[(old_href, old_id)] = build_hash_token(old_href, old_id, prefix="x", length=10)
    return id_map


def iter_local_refs(raw: str) -> list[str]:
    refs = []
    for match in URL_ATTR_RE.finditer(raw):
        refs.append(match.group("value"))
    for match in CSS_URL_RE.finditer(raw):
        refs.append(match.group("value"))
    return refs


def guess_media_type(path_value: str) -> str:
    suffix = Path(path_value).suffix.lower()
    if suffix == ".css":
        return "text/css"
    if suffix in {".xhtml", ".html", ".htm"}:
        return "application/xhtml+xml"
    guessed, _ = mimetypes.guess_type(path_value)
    return guessed or "application/octet-stream"


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
            item_id = f"extra-{build_hash_token(target_href, prefix='', length=12)}"
            manifest[item_id] = {
                "id": item_id,
                "href": posixpath.relpath(target_href, opf_dir) if opf_dir else target_href,
                "media_type": media_type,
                "properties": [],
            }
            known_hrefs.add(target_href)
            if is_content_doc(media_type) or media_type == "text/css":
                pending_text.append(target_href)

    return {
        **opf_data,
        "manifest": manifest,
    }


def build_href_map(opf_data: dict) -> tuple[dict, list[str], list[dict]]:
    manifest = opf_data["manifest"]
    opf_dir = opf_data["opf_dir"]
    spine_ids = {item["idref"] for item in opf_data["spine"] if item.get("idref")}
    href_map = {}
    resource_entries = []
    spine_hrefs = []

    for item_id, item in manifest.items():
        old_href = normalized_href(opf_dir, item["href"])
        media_type = item.get("media_type") or ""
        suffix = Path(item["href"]).suffix or media_extension(media_type)
        if item_id in spine_ids or is_content_doc(media_type):
            prefix = "c"
        elif media_type == "text/css":
            prefix = "s"
        else:
            prefix = "r"
        filename = f"{build_hash_token(old_href, item_id, prefix='', length=12)}{suffix}"
        new_href = f"{prefix}/{filename}"
        href_map[old_href] = new_href

    for spine_item in opf_data["spine"]:
        manifest_item = manifest.get(spine_item["idref"])
        if not manifest_item:
            continue
        spine_hrefs.append(normalized_href(opf_dir, manifest_item["href"]))

    cover_old_href = normalized_href(opf_dir, opf_data["cover_href"]) if opf_data.get("cover_href") else ""

    for item_id, item in manifest.items():
        old_href = normalized_href(opf_dir, item["href"])
        if old_href in spine_hrefs:
            continue
        if (item.get("media_type") or "").lower() == "application/x-dtbncx+xml":
            continue
        entry = {
            "href": href_map[old_href],
            "type": item.get("media_type") or "application/octet-stream",
        }
        if old_href == cover_old_href:
            entry["rel"] = ["cover"]
        resource_entries.append(entry)

    return href_map, spine_hrefs, resource_entries


def build_manifest_payload(opf_data: dict, href_map: dict, spine_hrefs: list[str], resource_entries: list[dict], toc_items: list[dict], id_map: dict) -> dict:
    opf_dir = opf_data["opf_dir"]
    metadata = {
        "title": opf_data["metadata"]["title"],
        "bookTitle": opf_data["metadata"]["title"],
        "creator": opf_data["metadata"]["creators"][0] if opf_data["metadata"]["creators"] else "",
        "creators": opf_data["metadata"]["creators"],
        "language": opf_data["metadata"]["languages"][0] if opf_data["metadata"]["languages"] else "",
        "languages": opf_data["metadata"]["languages"],
        "identifier": opf_data["metadata"]["identifier"],
        "direction": opf_data.get("page_progression") or "",
    }
    spine = []
    manifest = opf_data["manifest"]
    for index, spine_item in enumerate(opf_data["spine"]):
        manifest_item = manifest.get(spine_item["idref"])
        if not manifest_item:
            continue
        old_href = normalized_href(opf_dir, manifest_item["href"])
        spine.append({
            "id": spine_item["idref"] or f"item-{index + 1}",
            "idref": spine_item["idref"] or f"item-{index + 1}",
            "href": href_map[old_href],
            "linear": spine_item.get("linear") or "yes",
            "properties": manifest_item.get("properties") or [],
        })

    toc = []
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
        final_href = new_target
        if frag:
            final_href = f"{new_target}#{id_map.get((old_target, frag), frag)}"
        toc.append({
            "id": build_hash_token(final_href, title, prefix="toc-", length=10),
            "href": final_href,
            "label": title,
            "title": title,
            "subitems": [],
        })

    if not toc:
        for old_href in spine_hrefs:
            toc.append({
                "href": href_map[old_href],
                "id": build_hash_token(href_map[old_href], prefix="toc-", length=10),
                "label": Path(old_href).stem,
                "title": Path(old_href).stem,
                "subitems": [],
            })

    return {
        "format": "reader1",
        "version": 1,
        "metadata": metadata,
        "spine": spine,
        "resources": resource_entries,
        "toc": toc,
    }


def convert_epub(epub_path: Path, output_dir: Path) -> None:
    if not epub_path.exists():
        raise FileNotFoundError(f"EPUB not found: {epub_path}")

    with tempfile.TemporaryDirectory(prefix="reader1_epub_") as unpack_tmp, tempfile.TemporaryDirectory(prefix="reader1_out_") as build_tmp:
        unpack_root = Path(unpack_tmp)
        build_root = Path(build_tmp)
        with zipfile.ZipFile(epub_path, "r") as archive:
            archive.extractall(unpack_root)

        container_path = unpack_root / "META-INF" / "container.xml"
        if not container_path.exists():
            raise RuntimeError("Unpacked EPUB is missing META-INF/container.xml")

        opf_rel = parse_container(container_path)
        opf_path = unpack_root / opf_rel
        if not opf_path.exists():
            raise RuntimeError(f"OPF file not found: {opf_rel}")

        opf_data = discover_supplemental_manifest(unpack_root, parse_opf(opf_path, opf_rel))
        href_map, spine_hrefs, resource_entries = build_href_map(opf_data)

        content_files = {}
        css_files = {}
        for item in opf_data["manifest"].values():
            old_href = normalized_href(opf_data["opf_dir"], item["href"])
            source_path = unpack_root / old_href
            if not source_path.exists():
                continue
            if is_content_doc(item.get("media_type") or ""):
                content_files[old_href] = read_text(source_path)
            elif (item.get("media_type") or "") == "text/css":
                css_files[old_href] = read_text(source_path)

        id_map = collect_id_map(content_files)

        for item in opf_data["manifest"].values():
            old_href = normalized_href(opf_data["opf_dir"], item["href"])
            source_path = unpack_root / old_href
            new_href = href_map.get(old_href)
            if not source_path.exists() or not new_href:
                continue
            target_path = build_root / new_href
            media_type = item.get("media_type") or ""
            if is_content_doc(media_type):
                rewritten = rewrite_markup(content_files.get(old_href, read_text(source_path)), old_href, new_href, href_map, id_map)
                write_text(target_path, rewritten)
            elif media_type == "text/css":
                rewritten = rewrite_markup(css_files.get(old_href, read_text(source_path)), old_href, new_href, href_map, id_map)
                write_text(target_path, rewritten)
            else:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_path, target_path)

        toc_items = parse_nav_toc(opf_path, opf_data.get("nav_href") or "")
        if not toc_items:
            toc_items = parse_ncx_toc(opf_path, opf_data)
        payload = build_manifest_payload(opf_data, href_map, spine_hrefs, resource_entries, toc_items, id_map)

        write_text(build_root / MANIFEST_NAME, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))

        tmp_dest = output_dir.parent / f".{output_dir.name}.reader1-tmp"
        ensure_empty_dir(tmp_dest)
        for child in build_root.iterdir():
            shutil.move(str(child), tmp_dest / child.name)
        if output_dir.exists():
            shutil.rmtree(output_dir)
        tmp_dest.replace(output_dir)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Unpack EPUBs into the obfuscated reader1 directory format.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    replace_dir = subparsers.add_parser("replace-dir")
    replace_dir.add_argument("output_dir")
    replace_dir.add_argument("epub_file")
    replace_dir.add_argument("--delete-source", action="store_true")

    replace_manual = subparsers.add_parser("replace-manual")
    replace_manual.add_argument("manual_id")
    replace_manual.add_argument("epub_file")
    replace_manual.add_argument("--content-root", default=str(DEFAULT_CONTENT_ROOT))
    replace_manual.add_argument("--delete-source", action="store_true")

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    epub_path = Path(args.epub_file).resolve()
    if args.command == "replace-dir":
        output_dir = Path(args.output_dir).resolve()
    else:
        output_dir = Path(args.content_root).resolve() / "manual" / str(args.manual_id).strip()

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    log(f"Building reader1 package: {epub_path.name} -> {output_dir}")
    convert_epub(epub_path, output_dir)
    if args.delete_source:
        epub_path.unlink(missing_ok=True)
    log("Done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
