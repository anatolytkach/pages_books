#!/usr/bin/env python3
from __future__ import annotations
import argparse
import concurrent.futures
import html
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
DESCRIPTION_MIN = 120
DESCRIPTION_TARGET_MIN = 220
DESCRIPTION_TARGET_MAX = 700
META_DESCRIPTION_MIN = 140
META_DESCRIPTION_MAX = 220

HTML_SCRIPT_RE = re.compile(r"<script\b[^>]*>[\s\S]*?</script>", re.I)
HTML_STYLE_RE = re.compile(r"<style\b[^>]*>[\s\S]*?</style>", re.I)
HTML_TAG_RE = re.compile(r"<[^>]+>")
UNICODE_WHITESPACE_RE = re.compile(r"[\u00a0\u1680\u180e\u2000-\u200d\u2028\u2029\u202f\u205f\u3000]+")
WHITESPACE_RE = re.compile(r"\s+")
GUTENBERG_START_RE = re.compile(r"^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^.]*\*{3}\s*", re.I)
GUTENBERG_END_RE = re.compile(r"^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^.]*\*{3}\s*", re.I)
SERVICE_PREFIX_PATTERNS = [
    re.compile(r"^the project gutenberg ebook of\s+", re.I),
    re.compile(r"^project gutenberg'?s\s+", re.I),
    re.compile(r"^this ebook is for the use of anyone anywhere[\s\S]*?world\.?\s*", re.I),
    re.compile(r"^produced by\s+", re.I),
    re.compile(r"^transcribed from\s+", re.I),
    re.compile(r"^e-?text prepared by\s+", re.I),
]
BOILERPLATE_START_PATTERNS = [
    re.compile(r"^the project gutenberg ebook of", re.I),
    re.compile(r"^project gutenberg'?s", re.I),
    re.compile(r"^this ebook is for the use of anyone anywhere", re.I),
    re.compile(r"^the distributed proofreaders", re.I),
    re.compile(r"^produced by", re.I),
    re.compile(r"^transcribed from", re.I),
    re.compile(r"^e-?text prepared by", re.I),
    re.compile(r"^\*{3}\s*start of (?:the|this) project gutenberg ebook", re.I),
    re.compile(r"^start of this project gutenberg ebook", re.I),
]
BOILERPLATE_PHRASES = [
    re.compile(r"the project gutenberg ebook of", re.I),
    re.compile(r"this ebook is for the use of anyone anywhere", re.I),
    re.compile(r"at no cost and with almost no restrictions whatsoever", re.I),
    re.compile(r"you may copy it, give it away or re-use it", re.I),
    re.compile(r"project gutenberg license", re.I),
    re.compile(r"located at www\.gutenberg\.org", re.I),
    re.compile(r"general terms of use", re.I),
    re.compile(r"most other parts of the world", re.I),
    re.compile(r"before using this ebook", re.I),
    re.compile(r"how to help produce our new ebooks", re.I),
    re.compile(r"\*{3}\s*start of (?:the|this) project gutenberg ebook", re.I),
]
FRONTMATTER_LINE_RE = re.compile(
    r"^(contents|table of contents|illustrations|frontispiece|preface|introduction|foreword|prologue|epilogue)$",
    re.I,
)
HEADING_ONLY_RE = re.compile(r"^(chapter|book|part)\s+[ivxlcdm0-9]+\.?$", re.I)
NON_CONTENT_RE = re.compile(r"(cover|title|toc|nav|contents?|copyright|license|front|imprint|colophon)", re.I)
LETTER_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]")
ROMAN_ONLY_RE = re.compile(r"^[ivxlcdm\s\.\-—–:;,*]+$", re.I)
SECTION_START_RE = re.compile(r"^(chapter|book|part|letter)\s+[ivxlcdm0-9]+(?:\b|[.:\-—–])", re.I)
LEADING_HEADING_FRAGMENT_RE = re.compile(r"^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\.\s+(?=[A-Z“\"'])")
SALUTATION_START_RE = re.compile(r"^(my dear|dear\s+(sir|madam|friend|reader)|to\s+(mr|mrs|miss|ms|dr)\.?\s+[A-Z])", re.I)
LETTER_CUE_RE = re.compile(r"(to\s+(mr|mrs|miss|ms|dr)\.?\s+[A-Z]|yours ever|your affectionate|dear\s+(sir|madam|friend)|st\.\s+[A-Z][a-z]+,\s+[A-Z][a-z]+\.\s+\d)", re.I)
OPENING_DIALOGUE_RE = re.compile(r'^[“"\'‘—–-]')
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
PRONOUN_RE = re.compile(r"\b(he|she|they|him|her|them|his|hers|their|it)\b", re.I)
PERSON_OR_HONORIFIC_START_RE = re.compile(r"^((mr|mrs|miss|ms|dr|sir|lady|lord)\.?\s+|[A-Z]\s*[A-Z]\.\s+[A-Z][a-z]+|[A-Z][a-z]+,\s+[A-Z][a-z]+)", re.I)
DATELINE_RE = re.compile(r"\b(jan\.?|feb\.?|mar\.?|apr\.?|may|jun\.?|jul\.?|aug\.?|sep\.?|sept\.?|oct\.?|nov\.?|dec\.?)\b", re.I)
EARLY_HONORIFIC_RE = re.compile(r"\b(mr|mrs|miss|ms|dr|sir|lady|lord)\.?\s+[A-Z]", re.I)
IMAGE_ARTIFACT_RE = re.compile(r"\b\d{1,3}\s*-\s*\d{1,4}\s*\.\s*(jpg|png|gif|jpeg)\b|\b(jpg|png|gif|jpeg)\s*\(\d+[KMG]?\)", re.I)
ROMAN_HEADING_RE = re.compile(r"^[IVXLCDM]+\.\s+(?=[A-Z])")
ALLCAPS_HEADING_RE = re.compile(r"^(?:[A-Z][A-Z'\-]+(?:\s+[A-Z][A-Z'\-]+){0,6})\s+(?=[A-Z“\"'])")
CONTENTS_NOISE_RE = re.compile(r"(table of contents|contents\b|chapter\s+[ivxlcdm0-9]+|book\s+[ivxlcdm0-9]+|part\s+[ivxlcdm0-9]+)", re.I)
EDITORIAL_FRAMING_RE = re.compile(
    r"(how these papers have been placed in sequence|all needless matters have been eliminated|editor|prefatory note|introduction by|compiled from|these papers|this narrative|the following pages)",
    re.I,
)
CASE_STORY_HEADING_RE = re.compile(r"^(the )?(adventure|case|story|letter|chapter|book|part)\b", re.I)
JOURNAL_HEADING_RE = re.compile(r"(journal|diary|logbook|kept in shorthand|memorandum)", re.I)
ADDRESS_LINE_RE = re.compile(r"^(to\s+[A-Z][^,]{0,40},?|[A-Z][a-z]+,\s*(england|france|germany|italy|america)\.?)", re.I)
DATE_PLACE_START_RE = re.compile(r"^[A-Z][A-Za-z .'-]+,\s+\d{1,2}(st|nd|rd|th)?\s+[A-Z][a-z]+,?\s+\d{2,4}\b|^[A-Z][A-Za-z .'-]+,\s+[A-Z][a-z]+\.\s+\d", re.I)
TOC_SOURCE_RE = re.compile(r"(table of contents|<h2>\s*contents\s*</h2>|summary=\"toc\"|summary=\"loi\"|list of illustrations|<h2>\s*illustrations\s*</h2>)", re.I)
TOC_ENUMERATION_RE = re.compile(r"((chapter|part|book)\s+[ivxlcdm0-9]+\.?\s*){2,}", re.I)
SHORT_TITLE_SEQUENCE_RE = re.compile(r"(?:\b[A-Z][A-Za-z'’-]{2,}\b(?:\s+[A-Z][A-Za-z'’-]{2,}\b){0,3}\s*){5,}")
DETECTIVE_HEADING_RE = re.compile(r"^(a case of|the case of|story of|the story of|the adventure of|an adventure of|letter\s+[ivxlcdm0-9]+|book\s+[ivxlcdm0-9]+|part\s+[ivxlcdm0-9]+)", re.I)
EDITORIAL_NOTE_RE = re.compile(r"^(note|preface|editor'?s note|editorial note)\b", re.I)
DOCUMENT_FRAMING_RE = re.compile(r"(these papers|this manuscript|these documents|journal of|letters? from|editor'?s note|how these papers)", re.I)
PREFACE_AUTHORIAL_RE = re.compile(
    r"(most of the adventures recorded in this book|author'?s note|explanatory note|preface\b|note to the reader|in this book\b|the incidents narrated here)",
    re.I,
)
MID_SCENE_ACTION_RE = re.compile(
    r"^([A-Z][a-z]+|he|she|they|we)\s+(asked|said|cried|replied|answered|turned|rose|went|came|looked|heard|felt|saw|found|told|began|continued)\b",
    re.I,
)


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


def load_book_locations(index_root: Path) -> Dict[str, dict]:
    data = json_load(index_root / "book-locations.json", {}) or {}
    items = data.get("items") or {}
    return items if isinstance(items, dict) else {}


def normalize_content_path(book_id: str, content_path: str) -> str:
    raw = clean_text(content_path)
    if raw.startswith("/books/content/"):
        raw = raw
    elif raw:
        raw = f"/books/content/{raw.lstrip('/')}"
    else:
        raw = f"/books/content/{book_id}/"
    if not raw.endswith("/"):
        raw += "/"
    return raw


def content_path_to_local_root(content_root: Path, content_path: str) -> Path:
    raw = normalize_content_path("", content_path)
    rel = raw[len("/books/content/"):].strip("/")
    return content_root / rel


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


def find_metadata_description_candidate(root: ET.Element) -> str:
    candidates: List[str] = []
    dc_description = find_dc_text(root, "description")
    if dc_description:
        candidates.append(dc_description)
    for meta in root.findall(f".//{{{OPF_NS}}}metadata/{{{OPF_NS}}}meta"):
        prop = clean_text(meta.get("property", "")).lower()
        name = clean_text(meta.get("name", "")).lower()
        text = clean_text("".join(meta.itertext()))
        if not text:
            continue
        if prop in {"description", "summary", "schema:description"} or name in {"description", "summary"}:
            candidates.append(text)
    for candidate in candidates:
        if candidate:
            return candidate
    return ""


def strip_html_tags(value: str) -> str:
    text = str(value or "")
    text = HTML_SCRIPT_RE.sub(" ", text)
    text = HTML_STYLE_RE.sub(" ", text)
    text = HTML_TAG_RE.sub(" ", text)
    return text


def normalize_unicode_whitespace(value: str) -> str:
    text = UNICODE_WHITESPACE_RE.sub(" ", str(value or ""))
    text = text.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    return WHITESPACE_RE.sub(" ", text).strip()


def collapse_repeated_punctuation(value: str) -> str:
    text = str(value or "")
    text = re.sub(r"\*{2,}", " ", text)
    text = re.sub(r"([!?.,;:])(?:\s*\1)+", r"\1", text)
    text = re.sub(r"[-—–]{3,}", "—", text)
    text = re.sub(r"\s*([,;:.!?])\s*", r"\1 ", text)
    text = re.sub(r"\s*([—–-])\s*", r" \1 ", text)
    return WHITESPACE_RE.sub(" ", text).strip()


def normalize_description_text(text: str) -> str:
    value = strip_html_tags(text)
    value = html.unescape(value)
    value = normalize_unicode_whitespace(value)
    value = GUTENBERG_START_RE.sub("", value)
    value = GUTENBERG_END_RE.sub("", value)
    previous = None
    while previous != value:
        previous = value
        for pattern in SERVICE_PREFIX_PATTERNS:
            value = pattern.sub("", value)
        value = normalize_unicode_whitespace(value)
    value = re.sub(r"^\[[^\]]*(copyright|project gutenberg|distributed proofreaders)[^\]]*\]\s*", "", value, flags=re.I)
    value = re.sub(r"^(chapter|book|part|letter)\s+[ivxlcdm0-9]+\.?\s*[:;,\-—–]*\s*", "", value, flags=re.I)
    value = ROMAN_HEADING_RE.sub("", value)
    value = ALLCAPS_HEADING_RE.sub("", value)
    value = LEADING_HEADING_FRAGMENT_RE.sub("", value)
    value = IMAGE_ARTIFACT_RE.sub("", value)
    value = collapse_repeated_punctuation(value)
    value = re.sub(r'^[\s:;,\-—–*"\'`]+', "", value)
    value = re.sub(r'[\s:;,\-—–*"\'`]+$', "", value)
    return normalize_unicode_whitespace(value)


def split_sentences(text: str) -> List[str]:
    parts = [part.strip() for part in SENTENCE_SPLIT_RE.split(normalize_description_text(text)) if part.strip()]
    return parts


def is_toc_or_list_contamination(raw_text: str, normalized_text: str, source_xhtml: str = "") -> bool:
    opening = normalized_text[:260]
    if TOC_SOURCE_RE.search(source_xhtml[:2500]):
        return True
    if TOC_ENUMERATION_RE.search(opening):
        return True
    if SHORT_TITLE_SEQUENCE_RE.search(opening) and len(split_sentences(opening)) <= 2:
        return True
    if CONTENTS_NOISE_RE.search(opening) and len(re.findall(r"(chapter|book|part)\s+[ivxlcdm0-9]+", opening, re.I)) >= 1:
        return True
    return False


def is_detective_case_heading_opening(normalized_text: str) -> bool:
    opening = normalized_text[:220]
    if not DETECTIVE_HEADING_RE.search(opening):
        return False
    tail = normalize_description_text(opening[0:220])
    if OPENING_DIALOGUE_RE.search(tail) or "my dear" in tail.lower() or CASE_STORY_HEADING_RE.search(opening):
        return True
    return True


def is_editorial_document_framing(normalized_text: str) -> bool:
    opening = normalized_text[:240]
    if EDITORIAL_NOTE_RE.search(opening):
        return True
    if PREFACE_AUTHORIAL_RE.search(opening):
        return True
    if JOURNAL_HEADING_RE.search(opening):
        return True
    if DOCUMENT_FRAMING_RE.search(opening):
        return True
    if LETTER_CUE_RE.search(opening) or ADDRESS_LINE_RE.search(opening) or DATE_PLACE_START_RE.search(opening):
        return True
    if EDITORIAL_FRAMING_RE.search(opening):
        return True
    return False


def is_mid_scene_action_opening(normalized_text: str) -> bool:
    opening = normalized_text[:220]
    if MID_SCENE_ACTION_RE.search(opening):
        return True
    pronouns = len(PRONOUN_RE.findall(opening[:140]))
    if pronouns >= 4 and re.search(r"\b(said|asked|heard|felt|saw|went|came|told|looked|turned|rose)\b", opening, re.I):
        return True
    return False


def requires_conservative_fallback(title: str) -> bool:
    title_norm = normalize_description_text(title).lower()
    if "sherlock holmes" in title_norm:
        return True
    if "adventures of sherlock holmes" in title_norm:
        return True
    if "dracula" in title_norm:
        return True
    if "tom sawyer" in title_norm:
        return True
    return False


def is_scene_dependent_collection_opening(text: str) -> bool:
    opening = normalize_description_text(text)[:220].lower()
    if opening.startswith(("we were seated", "he was seated", "she was seated", "they were seated")):
        return True
    if "when the maid brought in" in opening:
        return True
    if "asked the attendant" in opening:
        return True
    if "telegram" in opening:
        return True
    if "it was like coming back to life" in opening:
        return True
    if opening.startswith(("harker ", "seward ", "utterson ", "holmes ", "watson ")):
        return True
    if any(token in opening[:160] for token in [" said,", " asked,", " replied", " groaned", " cried", " answered"]):
        return True
    if "“" in opening[:80] or '"' in opening[:80]:
        return True
    return False


def hard_reject_class(text: str, source_xhtml: str = "") -> str:
    normalized = normalize_description_text(text)
    opening = normalized[:240]
    if not opening:
        return "too_short"
    if is_toc_or_list_contamination(text, normalized, source_xhtml):
        return "toc_or_list_contamination"
    if SECTION_START_RE.search(opening) or ALLCAPS_HEADING_RE.search(opening) or ROMAN_HEADING_RE.search(opening):
        return "heading_opening"
    if is_detective_case_heading_opening(normalized):
        return "detective_case_heading"
    if OPENING_DIALOGUE_RE.search(opening) or SALUTATION_START_RE.search(opening) or "my dear" in opening.lower()[:40]:
        return "dialogue_opening"
    if is_editorial_document_framing(normalized):
        return "editorial_document_framing"
    if is_mid_scene_action_opening(normalized):
        return "mid_scene_action"
    return ""


def score_chapter_candidate(text: str, *, title: str = "", chapter_title: str = "") -> Tuple[int, str, List[str]]:
    normalized = normalize_description_text(text)
    reasons: List[str] = []
    score = 0
    if not normalized:
        return -10, "poor", ["empty"]

    opening = normalized[:180]
    first_sentence = split_sentences(normalized)[:1]
    first_sentence_text = first_sentence[0] if first_sentence else normalized
    lower_opening = opening.lower()

    if len(normalized) >= DESCRIPTION_TARGET_MIN:
        score += 3
        reasons.append("target_length")
    elif len(normalized) >= DESCRIPTION_MIN:
        score += 1
        reasons.append("usable_length")
    else:
        score -= 4
        reasons.append("too_short")
    if SECTION_START_RE.search(opening):
        score -= 6
        reasons.append("starts_with_section_heading")
    if OPENING_DIALOGUE_RE.search(opening):
        score -= 5
        reasons.append("starts_with_dialogue")
    if SALUTATION_START_RE.search(lower_opening):
        score -= 5
        reasons.append("starts_with_salutation")
    if PERSON_OR_HONORIFIC_START_RE.search(opening):
        score -= 3
        reasons.append("starts_with_person_or_address")
    if EARLY_HONORIFIC_RE.search(opening[:120]):
        score -= 2
        reasons.append("early_honorific_context")
    if LETTER_CUE_RE.search(opening):
        score -= 4
        reasons.append("looks_like_letter")
    if DATELINE_RE.search(opening[:100]) and "," in opening[:60]:
        score -= 3
        reasons.append("looks_like_dateline")
    if IMAGE_ARTIFACT_RE.search(opening[:120]):
        score -= 5
        reasons.append("image_artifact")
    if CONTENTS_NOISE_RE.search(opening[:180]) and len(re.findall(r"(chapter|book|part)\s+[ivxlcdm0-9]+", opening[:220], re.I)) >= 2:
        score -= 8
        reasons.append("contents_noise")
    if ALLCAPS_HEADING_RE.search(opening[:120]):
        score -= 4
        reasons.append("all_caps_heading")
    if CASE_STORY_HEADING_RE.search(opening[:80]):
        score -= 4
        reasons.append("case_story_heading")
    if CASE_STORY_HEADING_RE.search(opening[:80]) and OPENING_DIALOGUE_RE.search(normalized[:220].lstrip()):
        score -= 4
        reasons.append("heading_plus_dialogue")
    if EDITORIAL_FRAMING_RE.search(opening[:220]):
        score -= 7
        reasons.append("editorial_framing")
    if looks_like_frontmatter_heading(normalized):
        score -= 5
        reasons.append("frontmatter_like")
    if first_sentence_text and len(first_sentence_text) >= 50:
        score += 2
        reasons.append("strong_first_sentence")
    if len(split_sentences(normalized)) >= 2:
        score += 2
        reasons.append("multiple_sentences")
    if not any(flag in reasons for flag in ["starts_with_dialogue", "starts_with_salutation", "looks_like_letter", "starts_with_section_heading"]):
        score += 2
        reasons.append("narrative_opening")
    pronouns = len(PRONOUN_RE.findall(opening[:160]))
    if pronouns >= 5:
        score -= 2
        reasons.append("context_heavy_pronouns")
    if title and normalize_description_text(title).lower() in lower_opening[:120]:
        score -= 1
        reasons.append("title_echo")
    if chapter_title and normalize_description_text(chapter_title).lower() in lower_opening[:120]:
        score -= 2
        reasons.append("chapter_title_echo")

    quality = "good" if score >= 7 else "weak" if score >= 4 else "poor"
    return score, quality, reasons


def is_gutenberg_boilerplate(text: str) -> bool:
    raw = normalize_unicode_whitespace(html.unescape(strip_html_tags(text)))
    sample = raw[:500]
    for pattern in BOILERPLATE_START_PATTERNS:
        if pattern.search(raw):
            return True
    hits = sum(1 for pattern in BOILERPLATE_PHRASES if pattern.search(sample))
    if hits >= 1:
        return True
    legal_hits = sum(1 for pattern in BOILERPLATE_PHRASES if pattern.search(raw[:1200]))
    if legal_hits >= 2:
        return True
    return False


def looks_like_frontmatter_heading(text: str) -> bool:
    normalized = normalize_description_text(text).strip(" .:;,-—–").lower()
    if not normalized:
        return True
    if FRONTMATTER_LINE_RE.match(normalized):
        return True
    if HEADING_ONLY_RE.match(normalized):
        return True
    if normalized.startswith(("contents ", "table of contents", "illustrations ", "frontispiece", "preface ", "introduction ", "foreword ")):
        return True
    if "copyright" in normalized[:120] or "project gutenberg" in normalized[:160]:
        return True
    return False


def looks_like_title_only(text: str, title: str = "", chapter_title: str = "") -> bool:
    normalized = normalize_description_text(text).strip(" .:;,-—–").lower()
    if not normalized:
        return True
    if ROMAN_ONLY_RE.match(normalized):
        return True
    title_norm = normalize_description_text(title).strip(" .:;,-—–").lower()
    chapter_norm = normalize_description_text(chapter_title).strip(" .:;,-—–").lower()
    if title_norm and normalized == title_norm:
        return True
    if chapter_norm and normalized == chapter_norm:
        return True
    return False


def evaluate_description_candidate(raw_text: str, *, title: str = "", chapter_title: str = "") -> Tuple[str, str]:
    normalized = normalize_description_text(raw_text)
    if not normalized:
        return "", "too_short"
    if is_gutenberg_boilerplate(raw_text) or is_gutenberg_boilerplate(normalized):
        return normalized, "boilerplate"
    if looks_like_frontmatter_heading(normalized):
        return normalized, "frontmatter"
    if len(normalized) < DESCRIPTION_MIN:
        return normalized, "too_short"
    if looks_like_title_only(normalized, title=title, chapter_title=chapter_title):
        return normalized, "frontmatter"
    return normalized, "ok"


def is_usable_description(text: str, *, title: str = "", chapter_title: str = "") -> bool:
    normalized, reason = evaluate_description_candidate(text, title=title, chapter_title=chapter_title)
    return bool(normalized) and reason == "ok"


def trim_text_to_boundary(text: str, min_chars: int, max_chars: int) -> str:
    normalized = normalize_description_text(text)
    if len(normalized) <= max_chars:
        return normalized
    sample = normalized[: max_chars + 1]
    sentence_breaks = [sample.rfind(marker) for marker in [". ", "! ", "? ", ".” ", "!” ", "?” "]]
    sentence_break = max(sentence_breaks)
    if sentence_break >= min_chars:
        return sample[: sentence_break + 1].strip()
    word_break = sample.rfind(" ")
    if word_break >= min_chars:
        return sample[:word_break].strip()
    return sample[:max_chars].strip()


def build_meta_description(normalized_description: str, title: str, author: str) -> str:
    fallback = f'Read "{title}" by {author} on ReaderPub.'
    source = normalize_description_text(normalized_description)
    if not source:
        return fallback
    if len(source) > META_DESCRIPTION_MAX:
        source = trim_text_to_boundary(source, META_DESCRIPTION_MIN, META_DESCRIPTION_MAX)
    return source or fallback


def fallback_description(title: str, author: str) -> str:
    return f'Read "{title}" by {author} on ReaderPub.'


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
        "description": find_metadata_description_candidate(root),
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


def normalize_href_path(base_dir: str, href_path: str) -> str:
    if not href_path:
        return ""
    return os.path.normpath(f"{base_dir}/{href_path}" if base_dir else href_path).replace("\\", "/")


def is_non_content_href_or_title(href: str, title: str) -> bool:
    href_norm = clean_text(href).lower()
    title_norm = clean_text(title).lower()
    filename = href_norm.rsplit("/", 1)[-1]
    combined = f"{href_norm} {filename} {title_norm}"
    if filename in {"cover.xhtml", "title_page.xhtml", "nav.xhtml", "toc.xhtml"}:
        return True
    if NON_CONTENT_RE.search(combined):
        return True
    if title_norm in {
        "cover",
        "cover page",
        "title",
        "title page",
        "table of contents",
        "contents",
        "toc",
        "navigation",
        "copyright",
        "license",
        "imprint",
        "colophon",
        "frontmatter",
    }:
        return True
    if title_norm in {"preface", "introduction", "foreword"} and re.search(r"(front|preface|intro|foreword)", href_norm, re.I):
        return True
    return False


def is_wrapper_chapter(title: str, href_path: str) -> bool:
    return is_non_content_href_or_title(href_path, title)


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


def extract_text_blocks_from_xhtml(xhtml_text: str) -> List[str]:
    blocks: List[str] = []
    try:
        root = ET.fromstring(xhtml_text)
    except ET.ParseError:
        text = normalize_unicode_whitespace(html.unescape(body_inner_html(xhtml_text)))
        return [text] if text else []
    body = root.find(f".//{{{XHTML_NS}}}body")
    if body is None:
        return []

    for node in body.findall(f".//{{{XHTML_NS}}}p"):
        text = normalize_unicode_whitespace(html.unescape(" ".join(node.itertext())))
        if text:
            blocks.append(text)

    if blocks:
        return blocks

    for node in body.iter():
        tag = node.tag.rsplit("}", 1)[-1].lower() if isinstance(node.tag, str) else ""
        if tag not in {"div", "section"}:
            continue
        text = normalize_unicode_whitespace(html.unescape(" ".join(node.itertext())))
        if text:
            blocks.append(text)
    return blocks


def extract_description_from_first_meaningful_chapter(
    seed: BookSeed,
    title: str,
    author: str,
    opf: dict,
    opf_dir: str,
    chapter_titles_by_path: Dict[str, str],
    local_root: Path,
    remote_base: str,
) -> Tuple[str, str, Optional[int], str, int, str]:
    chapter_number = 0
    last_reason = "frontmatter"
    best_score = -999
    best_quality = "poor"
    for spine_item in opf.get("spine", []) or []:
        if not spine_item.get("linear", True):
            continue
        href = clean_text(spine_item.get("href", ""))
        if not href:
            continue
        normalized_path = normalize_href_path(opf_dir, href)
        chapter_title = chapter_titles_by_path.get(normalized_path, "")
        if is_non_content_href_or_title(normalized_path, chapter_title):
            last_reason = "frontmatter"
            continue
        chapter_number += 1
        try:
            xhtml_text = fetch_book_content(seed, normalized_path, local_root, remote_base)
        except Exception:
            continue
        if TOC_SOURCE_RE.search(xhtml_text[:4000]):
            last_reason = "toc_or_list_contamination"
            continue
        usable_blocks: List[Tuple[str, str]] = []
        rejection_reason = "too_short"
        for block in extract_text_blocks_from_xhtml(xhtml_text):
            raw_block = block
            normalized, reason = evaluate_description_candidate(
                block,
                title=title,
                chapter_title=chapter_title,
            )
            if reason != "ok":
                rejection_reason = reason
                continue
            if len(normalized) < 80 or not LETTER_RE.search(normalized):
                rejection_reason = "too_short"
                continue
            usable_blocks.append((raw_block, normalized))
            if len(usable_blocks) >= 6:
                break
        if not usable_blocks:
            last_reason = rejection_reason
            continue
        best_window = None
        window_specs = [(0, 1), (0, 2), (1, 3), (1, 4), (2, 4)]
        for start, end in window_specs:
            subset = usable_blocks[start:end]
            if not subset:
                continue
            raw_description = " ".join(item[0] for item in subset).strip()
            normalized_description = trim_text_to_boundary(
                " ".join(item[1] for item in subset),
                DESCRIPTION_TARGET_MIN,
                DESCRIPTION_TARGET_MAX,
            )
            hard_reject_reason = hard_reject_class(raw_description, xhtml_text)
            if hard_reject_reason:
                rejection_reason = hard_reject_reason
                continue
            normalized_description, reason = evaluate_description_candidate(
                normalized_description,
                title=title,
                chapter_title=chapter_title,
            )
            if reason != "ok":
                rejection_reason = reason
                continue
            score, quality, reasons = score_chapter_candidate(
                normalized_description,
                title=title,
                chapter_title=chapter_title,
            )
            if score > best_score:
                best_score = score
                best_quality = quality
            if best_window is None or score > best_window[4]:
                best_window = (
                    raw_description,
                    normalized_description,
                    chapter_number,
                    "chapter_paragraphs",
                    score,
                    quality,
                    reasons,
                )
        if best_window and best_window[5] == "good":
            return best_window[0], best_window[1], best_window[2], best_window[3], best_window[4], best_window[5]
        if best_window:
            last_reason = f"weak_chapter_candidate:{best_window[4]}"
        else:
            last_reason = rejection_reason
    return "", "", None, last_reason, best_score, best_quality


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
    if text:
        return build_meta_description(text, "", "")
    return normalize_description_text(fallback)


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
    legacy_id: str
    title: str
    author_name: str
    author_key: str
    cover: str
    content_path: str
    local_content_path: str


def load_author_indexes(index_root: Path, book_locations: Dict[str, dict]) -> Tuple[Dict[str, dict], Dict[str, BookSeed]]:
    authors = {}
    books = {}
    for path in sorted((index_root / "a").glob("*.json")):
        data = json_load(path, {}) or {}
        key = clean_text(data.get("key", "")) or path.stem
        name = clean_text(data.get("name", "")) or "Unknown"
        book_items = []
        for item in data.get("books", []) or []:
            public_id = clean_text(item.get("id", ""))
            legacy_id = clean_text(item.get("legacyId", "")) or public_id
            source = clean_text(item.get("source", "")).lower()
            source_book_id = clean_text(item.get("sourceBookId", "")) or public_id
            title = clean_text(item.get("title", ""))
            if not public_id or not title:
                continue
            cover = clean_text(item.get("cover", ""))
            location = None
            if source == "manual":
                content_path = normalize_content_path(source_book_id, f"/books/content/manual/{source_book_id}/")
                local_content_path = content_path
            else:
                location = (book_locations.get(legacy_id) or {})
                content_path = normalize_content_path(
                    public_id,
                    location.get("contentPath") or f"/books/content/{legacy_id}/",
                )
                local_content_path = normalize_content_path(
                    public_id,
                    location.get("localContentPath") or location.get("legacyPath") or f"/books/content/{legacy_id}/",
                )
            seed = BookSeed(
                id=public_id,
                legacy_id=legacy_id,
                title=title,
                author_name=name,
                author_key=key,
                cover=cover,
                content_path=content_path,
                local_content_path=local_content_path,
            )
            books[public_id] = seed
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


def fetch_book_content(seed: BookSeed, rel_path: str, local_root: Path, remote_base: str) -> str:
    local_path = content_path_to_local_root(local_root, seed.local_content_path) / rel_path
    remote_url = f"{remote_base.rstrip('/')}{seed.content_path.rstrip('/')}/{rel_path}"
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
    container_text = fetch_book_content(seed, "META-INF/container.xml", local_root, remote_base)
    opf_rel = parse_container(container_text)
    if not opf_rel:
        raise RuntimeError(f"container.xml does not declare OPF for book {book_id}")

    opf_text = fetch_book_content(seed, opf_rel, local_root, remote_base)
    opf = parse_opf(opf_text)
    opf_dir = Path(opf_rel).parent.as_posix()

    nav_entries: List[Tuple[str, str]] = []
    if opf.get("navHref"):
        nav_rel = f"{opf_dir}/{opf['navHref']}" if opf_dir else opf["navHref"]
        try:
            nav_text = fetch_book_content(seed, nav_rel, local_root, remote_base)
            nav_entries = parse_nav_chapters(nav_text)
        except Exception:
            nav_entries = []
    if not nav_entries and opf.get("tocHref"):
        toc_rel = f"{opf_dir}/{opf['tocHref']}" if opf_dir else opf["tocHref"]
        toc_text = fetch_book_content(seed, toc_rel, local_root, remote_base)
        nav_entries = parse_ncx_chapters(toc_text)

    chapters = []
    seen_paths = set()
    chapter_titles_by_path: Dict[str, str] = {}
    for href, title in nav_entries:
        href_path, fragment = split_href_fragment(href)
        if not href_path or is_wrapper_chapter(title, href_path):
            continue
        normalized_path = normalize_href_path(opf_dir, href_path)
        if normalized_path and title and normalized_path not in chapter_titles_by_path:
            chapter_titles_by_path[normalized_path] = title
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

    raw_metadata_description = opf.get("description", "")
    metadata_description, metadata_reason = evaluate_description_candidate(
        raw_metadata_description,
        title=opf.get("title") or seed.title,
    )
    raw_description = ""
    normalized_description = ""
    description_source = ""
    description_quality = "poor"
    chapter_candidate_score = None
    description_debug = {
        "metadata_candidate_reason": metadata_reason,
        "chapter_candidate_reason": "not_used",
        "chapter_candidate_score": None,
        "chapter_candidate_quality": None,
        "conservative_fallback": False,
        "final_reason": "",
    }

    if metadata_reason == "ok":
        raw_description = raw_metadata_description
        normalized_description = trim_text_to_boundary(
            metadata_description,
            DESCRIPTION_TARGET_MIN,
            DESCRIPTION_TARGET_MAX,
        )
        description_source = "metadata_description"
        description_quality = "good"
        description_debug["final_reason"] = "metadata_description"
    else:
        chapter_raw_description, chapter_description, chapter_description_source_n, chapter_reason, chapter_score, chapter_quality = extract_description_from_first_meaningful_chapter(
            seed=seed,
            title=opf.get("title") or seed.title,
            author=seed.author_name,
            opf=opf,
            opf_dir=opf_dir,
            chapter_titles_by_path=chapter_titles_by_path,
            local_root=local_root,
            remote_base=remote_base,
        )
        description_debug["chapter_candidate_reason"] = chapter_reason
        chapter_candidate_score = chapter_score if chapter_score != -999 else None
        description_debug["chapter_candidate_score"] = chapter_candidate_score
        description_debug["chapter_candidate_quality"] = chapter_quality
        conservative_mode = requires_conservative_fallback(opf.get("title") or seed.title)
        if conservative_mode and (
            chapter_quality != "good"
            or (chapter_candidate_score or 0) < 9
            or (chapter_description and is_scene_dependent_collection_opening(chapter_description))
        ):
            description_debug["conservative_fallback"] = True
            chapter_description = ""
        if chapter_description and chapter_reason == "chapter_paragraphs" and chapter_quality == "good":
            raw_description = chapter_raw_description
            normalized_description = chapter_description
            description_source = "chapter_paragraphs"
            description_quality = chapter_quality
            description_debug["final_reason"] = "chapter_paragraphs"
        else:
            raw_description = fallback_description(opf.get("title") or seed.title, seed.author_name)
            normalized_description = raw_description
            description_source = "fallback_title_author"
            description_quality = "fallback"
            if description_debug["conservative_fallback"]:
                description_debug["final_reason"] = "fallback_title_author_conservative_mode"
            else:
                description_debug["final_reason"] = "fallback_title_author"

    meta_description = build_meta_description(
        normalized_description,
        opf.get("title") or seed.title,
        seed.author_name,
    )

    excerpt = ""
    excerpt_source = None
    for chapter in chapters:
        try:
            xhtml_text = fetch_book_content(seed, chapter["sourcePath"], local_root, remote_base)
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
        excerpt = normalized_description

    if opf.get("coverHref"):
        cover_rel = os.path.normpath(f"{opf_dir}/{opf['coverHref']}" if opf_dir else opf["coverHref"]).replace("\\", "/")
        cover = f"{seed.content_path.rstrip('/')}/{cover_rel}"
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
        "contentPath": seed.content_path,
        "language": normalize_lang(opf.get("language") or "und"),
        "raw_description": normalize_unicode_whitespace(raw_description),
        "normalized_description": normalized_description,
        "meta_description": meta_description,
        "description_source": description_source,
        "description_quality": description_quality,
        "chapter_candidate_score": chapter_candidate_score,
        "description_debug": description_debug,
        "description": normalized_description,
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
    parser.add_argument("--index-root", default=str(Path(__file__).resolve().parents[2] / "reader_lang_indexes"))
    parser.add_argument("--content-root", default=str(Path(__file__).resolve().parents[2] / "books" / "content"))
    parser.add_argument("--output-root", default=str(Path(__file__).resolve().parents[2] / "reader_seo_indexes"))
    parser.add_argument("--remote-content-base", default="https://reader.pub")
    parser.add_argument("--book-id", action="append", dest="book_ids", default=[])
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    index_root = Path(args.index_root)
    content_root = Path(args.content_root)
    output_root = Path(args.output_root)
    selected_ids = {clean_text(value) for raw in args.book_ids for value in str(raw).split(",") if clean_text(value)}

    book_locations = load_book_locations(index_root)
    authors, books_by_id = load_author_indexes(index_root, book_locations)
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
