#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import posixpath
import re
import sys
import zipfile
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional
from xml.etree import ElementTree as ET

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
PIC_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
V_NS = "urn:schemas-microsoft-com:vml"
WPS_NS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"

NS = {
    "w": W_NS,
    "wp": WP_NS,
    "a": A_NS,
    "pic": PIC_NS,
    "rel": REL_NS,
    "v": V_NS,
    "wps": WPS_NS,
}

ALLOWED_HEADING_IDS = {f"Heading{level}" for level in range(1, 10)}
ALLOWED_HEADING_NAMES = {f"heading {level}" for level in range(1, 10)}
RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp"}


@dataclass
class ValidationError:
    rule: str
    message: str
    location: str

    def as_dict(self) -> Dict[str, str]:
        return {
            "rule": self.rule,
            "message": self.message,
            "location": self.location,
        }


def w_attr(name: str) -> str:
    return f"{{{W_NS}}}{name}"


def rel_attr(name: str) -> str:
    return f"{{{REL_NS}}}{name}"


def normalize_text(value: Optional[str]) -> str:
    return (value or "").strip()


def read_xml_from_zip(docx_path: str, inner_path: str) -> Optional[ET.Element]:
    with zipfile.ZipFile(docx_path, "r") as archive:
        try:
            payload = archive.read(inner_path)
        except KeyError:
            return None
    return ET.fromstring(payload)


def list_zip_names(docx_path: str) -> List[str]:
    with zipfile.ZipFile(docx_path, "r") as archive:
        return archive.namelist()


def parse_styles(styles_root: Optional[ET.Element]) -> Dict[str, Dict[str, str]]:
    if styles_root is None:
        return {}
    styles: Dict[str, Dict[str, str]] = {}
    for style in styles_root.findall("w:style", NS):
        style_id = normalize_text(style.get(w_attr("styleId")))
        if not style_id:
            continue
        styles[style_id] = {
            "type": normalize_text(style.get(w_attr("type"))),
            "name": "",
            "based_on": "",
            "outline_level": "",
            "custom_style": normalize_text(style.get(w_attr("customStyle"))).lower(),
        }
        name_node = style.find("w:name", NS)
        if name_node is not None:
            styles[style_id]["name"] = normalize_text(name_node.get(w_attr("val")))
        based_on = style.find("w:basedOn", NS)
        if based_on is not None:
            styles[style_id]["based_on"] = normalize_text(based_on.get(w_attr("val")))
        outline = style.find("w:pPr/w:outlineLvl", NS)
        if outline is not None:
            styles[style_id]["outline_level"] = normalize_text(outline.get(w_attr("val")))
    return styles


def resolve_style_chain(style_id: str, styles: Dict[str, Dict[str, str]]) -> Iterable[Dict[str, str]]:
    seen = set()
    current = normalize_text(style_id)
    while current and current not in seen and current in styles:
        seen.add(current)
        data = styles[current]
        yield data | {"style_id": current}
        current = normalize_text(data.get("based_on"))


def is_heading_like(style_id: str, styles: Dict[str, Dict[str, str]], paragraph: ET.Element) -> bool:
    style_id = normalize_text(style_id)
    lower_style = style_id.lower()
    if lower_style.startswith("heading"):
        return True
    for data in resolve_style_chain(style_id, styles):
        name = normalize_text(data.get("name")).lower()
        if name in ALLOWED_HEADING_NAMES or "heading" in name:
            return True
        if normalize_text(data.get("outline_level")):
            return True
    if paragraph.find("w:pPr/w:outlineLvl", NS) is not None:
        return True
    return False


def validate_headings(document_root: Optional[ET.Element], styles: Dict[str, Dict[str, str]]) -> List[ValidationError]:
    if document_root is None:
        return [ValidationError("docx_structure", "Missing word/document.xml in DOCX package.", "word/document.xml")]

    errors: List[ValidationError] = []
    paragraphs = document_root.findall(".//w:body/w:p", NS)
    for index, paragraph in enumerate(paragraphs, start=1):
        style_node = paragraph.find("w:pPr/w:pStyle", NS)
        style_id = normalize_text(style_node.get(w_attr("val")) if style_node is not None else "")
        if not style_id:
            continue
        if not is_heading_like(style_id, styles, paragraph):
            continue
        if style_id in ALLOWED_HEADING_IDS:
            continue
        style_data = styles.get(style_id, {})
        style_name = normalize_text(style_data.get("name"))
        message = f"Paragraph uses non-standard heading style '{style_name or style_id}'. Use Word standard Heading 1-9 styles only."
        errors.append(ValidationError("standard_headings_only", message, f"paragraph:{index}"))
    return errors


def parse_relationships(relationships_root: Optional[ET.Element]) -> Dict[str, str]:
    if relationships_root is None:
        return {}
    mapping: Dict[str, str] = {}
    for rel in relationships_root.findall("rel:Relationship", NS):
        rel_id = normalize_text(rel.get("Id"))
        target = normalize_text(rel.get("Target"))
        rel_type = normalize_text(rel.get("Type"))
        if rel_id and target:
            mapping[rel_id] = f"{rel_type}|{target}"
    return mapping


def validate_images(document_root: Optional[ET.Element], rels: Dict[str, str], archive_names: List[str]) -> List[ValidationError]:
    if document_root is None:
        return []
    errors: List[ValidationError] = []

    for index, anchor in enumerate(document_root.findall(".//wp:anchor", NS), start=1):
        behind_doc = normalize_text(anchor.get("behindDoc"))
        message = "Floating or wrapped images are not allowed. Use inline raster images with no text wrap."
        if behind_doc == "1":
            message = "Background or floating image detected. Use inline raster images with no text wrap."
        errors.append(ValidationError("inline_images_only", message, f"anchor:{index}"))

    if document_root.find(".//v:shape", NS) is not None or document_root.find(".//wps:wsp", NS) is not None:
        errors.append(ValidationError(
            "raster_images_only",
            "Vector drawing shapes are not allowed. Use raster image files only.",
            "word/document.xml",
        ))

    for index, blip in enumerate(document_root.findall(".//a:blip", NS), start=1):
        rel_id = normalize_text(blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"))
        rel_entry = rels.get(rel_id, "")
        _, _, target = rel_entry.partition("|")
        target = normalize_text(target)
        if not target:
            continue
        normalized_target = posixpath.normpath(posixpath.join("word", target))
        extension = posixpath.splitext(normalized_target)[1].lower()
        if extension not in RASTER_EXTENSIONS:
            errors.append(ValidationError(
                "raster_images_only",
                f"Image '{target}' is not a supported raster format.",
                f"image:{index}",
            ))
            continue
        if normalized_target not in archive_names:
            errors.append(ValidationError(
                "docx_structure",
                f"Referenced image '{target}' is missing from the DOCX package.",
                f"image:{index}",
            ))
    return errors


def validate_docx(docx_path: str) -> List[ValidationError]:
    archive_names = list_zip_names(docx_path)
    archive_name_set = set(archive_names)
    document_root = read_xml_from_zip(docx_path, "word/document.xml")
    styles_root = read_xml_from_zip(docx_path, "word/styles.xml")
    relationships_root = read_xml_from_zip(docx_path, "word/_rels/document.xml.rels")
    styles = parse_styles(styles_root)
    rels = parse_relationships(relationships_root)

    errors: List[ValidationError] = []
    errors.extend(validate_headings(document_root, styles))
    errors.extend(validate_images(document_root, rels, archive_name_set))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate DOCX inputs for protected publishing.")
    parser.add_argument("input_docx")
    parser.add_argument("--json", action="store_true", help="Emit JSON result.")
    args = parser.parse_args()

    try:
        errors = validate_docx(args.input_docx)
    except zipfile.BadZipFile:
        errors = [ValidationError("docx_structure", "File is not a valid DOCX/ZIP package.", args.input_docx)]
    except Exception as exc:
        errors = [ValidationError("docx_structure", str(exc), args.input_docx)]

    if args.json:
        payload = {
            "ok": not errors,
            "errors": [item.as_dict() for item in errors],
        }
        json.dump(payload, sys.stdout)
        sys.stdout.write("\n")
        return 0 if not errors else 2

    if errors:
        for item in errors:
            print(f"{item.rule}: {item.location}: {item.message}", file=sys.stderr)
        return 2
    print("DOCX validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
