#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_CSS="${BASE_CSS:-$SCRIPT_DIR/epub.base.css}"
COVER_IMAGE="${COVER_IMAGE:-$SCRIPT_DIR/cover.jpg}"
TMP_ROOT="${TMP_ROOT:-$SCRIPT_DIR/.epub_build_tmp}"
BOOK_LANG="${BOOK_LANG:-ru-RU}"
AUTHOR="${AUTHOR:-Unknown}"
NAV_TITLE="${NAV_TITLE:-Contents}"
STRIP_SYNTHETIC_PAGE_IMAGES="${STRIP_SYNTHETIC_PAGE_IMAGES:-1}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: command not found: $1" >&2; exit 1; }; }
need_file() { [[ -f "$1" ]] || { echo "ERROR: file not found: $1" >&2; exit 1; }; }

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") [path/to/book.pdf]

If pdf path is omitted, script expects exactly one .pdf in:
  $SCRIPT_DIR

Input requirements:
  - .pdf file (with text layer)
  - cover image at: $COVER_IMAGE

Output:
  - same-name .epub рядом с исходным .pdf

Optional env vars:
  AUTHOR="Author Name"           (default: Unknown)
  BOOK_LANG="ru-RU"              (default: ru-RU)
  NAV_TITLE="Contents"           (default: Contents)
  STRIP_SYNTHETIC_PAGE_IMAGES=1  (default: 1; removes only mass duplicated page-layer images)
USAGE
}

resolve_input_pdf() {
  if [[ $# -ge 1 ]]; then
    printf '%s' "$1"
    return 0
  fi

  local -a found=()
  shopt -s nullglob nocaseglob
  found=("$SCRIPT_DIR"/*.pdf)
  shopt -u nocaseglob nullglob

  if [[ ${#found[@]} -eq 1 ]]; then
    printf '%s' "${found[0]}"
    return 0
  fi

  if [[ ${#found[@]} -eq 0 ]]; then
    echo "ERROR: no .pdf files found in $SCRIPT_DIR" >&2
  else
    echo "ERROR: multiple .pdf files found in $SCRIPT_DIR, pass the file explicitly" >&2
    printf '  - %s\n' "${found[@]}" >&2
  fi
  exit 1
}

repack_epub() {
  local src_dir="$1"
  local out_file="$2"
  rm -f "$out_file"
  (
    cd "$src_dir"
    if [[ -f "mimetype" ]]; then
      zip -X0 "$out_file" "mimetype" >/dev/null
      zip -Xur9 "$out_file" . -x "mimetype" >/dev/null
    else
      zip -Xur9 "$out_file" . >/dev/null
    fi
  )
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

need_cmd pdftohtml
need_cmd pandoc
need_cmd python3
need_cmd perl
need_cmd zip
need_cmd unzip

INPUT_PDF="$(resolve_input_pdf "$@")"
need_file "$INPUT_PDF"
need_file "$BASE_CSS"
need_file "$COVER_IMAGE"

PDF_DIR="$(cd "$(dirname "$INPUT_PDF")" && pwd)"
PDF_FILE="$(basename "$INPUT_PDF")"
BASENAME="${PDF_FILE%.*}"
TITLE="${TITLE:-$BASENAME}"
OUTPUT_EPUB="$PDF_DIR/$BASENAME.epub"

WORK_DIR="$TMP_ROOT/$BASENAME.$$"
HTML_BASE="$WORK_DIR/pdf_html"
RAW_HTML="$HTML_BASE.html"
SANITIZED_HTML="$WORK_DIR/pdf_clean.html"
RAW_EPUB="$WORK_DIR/raw.epub"
UNPACK_DIR="$WORK_DIR/unpack"

mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "[1/7] Convert PDF -> HTML (text + images)"
pdftohtml -enc UTF-8 -hidden -nodrm -noframes "$INPUT_PDF" "$HTML_BASE" >/dev/null 2>&1 || {
  echo "ERROR: pdftohtml failed for $INPUT_PDF" >&2
  exit 1
}

if [[ ! -f "$RAW_HTML" ]]; then
  first_html="$(find "$WORK_DIR" -maxdepth 1 -type f -name '*.html' | head -n1 || true)"
  [[ -n "$first_html" ]] || { echo "ERROR: pdftohtml produced no HTML output" >&2; exit 1; }
  RAW_HTML="$first_html"
fi

echo "[2/7] Normalize HTML for EPUB conversion"
python3 - "$RAW_HTML" "$SANITIZED_HTML" "$STRIP_SYNTHETIC_PAGE_IMAGES" <<'PY'
import re
import sys
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
html = src.read_text(encoding="utf-8", errors="ignore")
strip_synth = (sys.argv[3] == "1")

# Keep only content-relevant markup.
html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.I | re.S)
html = re.sub(r"<meta\b[^>]*http-equiv=[\"']Content-Type[\"'][^>]*>", "", html, flags=re.I)
html = re.sub(
    r"<a\b[^>]*name=[\"']([0-9]+)[\"'][^>]*>\s*</a>",
    r'<hr class="pdf-page-break" data-page="\1" />',
    html,
    flags=re.I | re.S,
)

page_count = len(re.findall(r'class=["\']pdf-page-break["\']', html, flags=re.I))

IMG_RE = re.compile(r"<img\b[^>]*>", flags=re.I)
ATTR_RE = re.compile(r'(\w+)\s*=\s*(".*?"|\'.*?\'|[^\s>]+)', flags=re.I | re.S)

def _num_from_text(s: str):
    if not s:
        return None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)", s)
    return float(m.group(1)) if m else None

img_entries = []
for m in IMG_RE.finditer(html):
    tag = m.group(0)
    attrs = {}
    for k, v in ATTR_RE.findall(tag):
        val = v.strip().strip('"').strip("'")
        attrs[k.lower()] = val
    style = attrs.get("style", "")
    width = _num_from_text(attrs.get("width", "")) or _num_from_text(re.search(r"width\s*:\s*([^;]+)", style, flags=re.I).group(1) if re.search(r"width\s*:\s*([^;]+)", style, flags=re.I) else "")
    height = _num_from_text(attrs.get("height", "")) or _num_from_text(re.search(r"height\s*:\s*([^;]+)", style, flags=re.I).group(1) if re.search(r"height\s*:\s*([^;]+)", style, flags=re.I) else "")
    area = (width or 0) * (height or 0)
    is_large = (width or 0) >= 450 and (height or 0) >= 600 and area >= 300000
    img_entries.append((m.start(), m.end(), is_large))

large_count = sum(1 for _, _, is_large in img_entries if is_large)
# In this stage we do not drop images to avoid false positives on genuine full-page illustrations.
drop_large = False

if drop_large and img_entries:
    chunks = []
    cur = 0
    for s, e, is_large in img_entries:
        if is_large:
            chunks.append(html[cur:s])
            cur = e
    chunks.append(html[cur:])
    html = "".join(chunks)
    # Remove links that became empty after image removal.
    html = re.sub(r"<a\b[^>]*>\s*</a>", "", html, flags=re.I | re.S)

# Drop visual/layout attrs that break flow in EPUB.
html = re.sub(r'\sstyle=["\'][^"\']*["\']', "", html, flags=re.I)
html = re.sub(r'\sclass=["\'][^"\']*["\']', "", html, flags=re.I)
html = re.sub(r'\sid=["\'][^"\']*["\']', "", html, flags=re.I)
html = re.sub(r'\s+lang=["\'][^"\']*["\']', "", html, flags=re.I)
html = re.sub(r'\s+xml:lang=["\'][^"\']*["\']', "", html, flags=re.I)

dst.write_text(html, encoding="utf-8")
PY

echo "[3/7] Build raw EPUB via pandoc"
pandoc "$SANITIZED_HTML" \
  --from=html \
  --to=epub3 \
  -o "$RAW_EPUB" \
  --css="$BASE_CSS" \
  --toc \
  --toc-depth=1 \
  --metadata title="$TITLE" \
  --metadata author="$AUTHOR" \
  --metadata lang="$BOOK_LANG" \
  --metadata language="$BOOK_LANG" \
  --metadata dc.language="$BOOK_LANG" \
  --epub-cover-image="$COVER_IMAGE"

echo "[4/7] Unpack and normalize EPUB internals"
unzip -q "$RAW_EPUB" -d "$UNPACK_DIR"

EPUB_DIR="$UNPACK_DIR/EPUB"
OPF_FILE="$EPUB_DIR/content.opf"
NCX_FILE="$EPUB_DIR/toc.ncx"
NAV_FILE="$EPUB_DIR/nav.xhtml"
TEXT_DIR="$EPUB_DIR/text"

[[ -f "$OPF_FILE" ]] || { echo "ERROR: missing file: $OPF_FILE" >&2; exit 1; }

echo "[4.1/7] Remove synthetic page-image layer (optional)"
if [[ -d "$TEXT_DIR" && "$STRIP_SYNTHETIC_PAGE_IMAGES" == "1" ]]; then
  python3 - "$TEXT_DIR" "$EPUB_DIR/media" <<'PY'
import re
import sys
from pathlib import Path

text_dir = Path(sys.argv[1])
media_dir = Path(sys.argv[2])

IMG_RE = re.compile(r"<img\b[^>]*>", re.I)
SRC_RE = re.compile(r'\bsrc=["\']([^"\']+)["\']', re.I)
SYN_SRC_RE = re.compile(r'(^|/)(file\d+\.(?:png|jpe?g|gif|webp|bmp))$', re.I)
ATTR_RE = re.compile(r'(\w+)\s*=\s*(".*?"|\'.*?\'|[^\s>]+)', re.I | re.S)

def _num_from_text(s: str):
    if not s:
        return None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)", s)
    return float(m.group(1)) if m else None

def _dims_from_tag(tag: str):
    attrs = {}
    for k, v in ATTR_RE.findall(tag or ""):
        attrs[k.lower()] = v.strip().strip('"').strip("'")
    style = attrs.get("style", "")

    w = _num_from_text(attrs.get("width", ""))
    h = _num_from_text(attrs.get("height", ""))

    if w is None:
        m = re.search(r"width\s*:\s*([^;]+)", style, re.I)
        if m:
            w = _num_from_text(m.group(1))
    if h is None:
        m = re.search(r"height\s*:\s*([^;]+)", style, re.I)
        if m:
            h = _num_from_text(m.group(1))
    return w or 0.0, h or 0.0

def is_page_sized_image(tag: str) -> bool:
    w, h = _dims_from_tag(tag)
    area = w * h
    # Keep this conservative: remove only obvious page-layer bitmaps.
    return (w >= 450 and h >= 600) or area >= 300000

def is_synthetic_tag(tag: str) -> bool:
    src_m = SRC_RE.search(tag or "")
    if not src_m:
        return False
    src = src_m.group(1).strip()
    if not SYN_SRC_RE.search(src):
        return False
    # Typical page-layer image exported by pdftohtml has empty/absent alt.
    alt_m = re.search(r'\balt=["\']([^"\']*)["\']', tag, re.I)
    if alt_m and alt_m.group(1).strip():
        return False
    return is_page_sized_image(tag)

def synthetic_ratio(html: str):
    tags = IMG_RE.findall(html)
    if not tags:
        return 0, 0, 0
    syn = sum(1 for t in tags if is_synthetic_tag(t))
    return len(tags), syn, syn / max(1, len(tags))

def strip_synthetic(html: str) -> str:
    # Remove only explicit page marker span + *page-sized* synthetic image + trailing <br />.
    # Genuine illustrations can also be named fileNNN, so size check is mandatory.
    pat = re.compile(
        r'(<span\b[^>]*\bid=["\']id_\d+["\'][^>]*>\s*</span>\s*)'
        r'(<img\b[^>]*\bsrc=["\'][^"\']*file\d+\.(?:png|jpe?g|gif|webp|bmp)["\'][^>]*>)\s*'
        r'((?:<br\s*/?>\s*)?)',
        re.I
    )
    all_matches = list(pat.finditer(html))
    synthetic_pairs = [m for m in all_matches if is_synthetic_tag(m.group(2))]
    # Remove only when this is clearly a page-layer duplication pattern.
    if len(synthetic_pairs) < 12:
        return html, []

    removed = []
    def _repl(m):
        img_tag = m.group(2)
        if not is_synthetic_tag(img_tag):
            return m.group(0)
        frag = m.group(0)
        sm = re.search(r'\bsrc=["\']([^"\']+)["\']', frag, re.I)
        if sm:
            src = sm.group(1).strip()
            if src.startswith("../media/"):
                removed.append(src.split("../media/", 1)[1])
        return ""
    out = pat.sub(_repl, html)
    out = re.sub(r'(<hr\b[^>]*>)\s*(<hr\b[^>]*>\s*)+', r'\1', out, flags=re.I)
    out = re.sub(r'\n{3,}', '\n\n', out)
    return out, removed

changed = False
removed_media = set()
for xhtml in sorted(text_dir.glob("*.xhtml")):
    s = xhtml.read_text(encoding="utf-8", errors="ignore")
    total, syn, ratio = synthetic_ratio(s)
    # Strong signal of duplicated page layer from PDF converter.
    if total >= 40 and syn >= 30 and ratio >= 0.85:
        cleaned, removed = strip_synthetic(s)
        if cleaned != s:
            xhtml.write_text(cleaned, encoding="utf-8")
            changed = True
            removed_media.update(removed)

if changed and media_dir.exists():
    # Delete only files that were explicitly removed from synthetic page-image tags.
    for name in sorted(removed_media):
        f = media_dir / name
        if f.is_file():
            try:
                f.unlink()
            except Exception:
                pass
PY
fi

echo "[4.2/7] Reflow wrapped lines and strip PDF headers/footers"
if [[ -d "$TEXT_DIR" ]]; then
  python3 - "$TEXT_DIR" <<'PY'
import re
import sys
from collections import Counter
from pathlib import Path

text_dir = Path(sys.argv[1])

HR_SPLIT_RE = re.compile(r'(<hr\b[^>]*\/?>)', re.I)
BR_SPLIT_RE = re.compile(r'<br\s*/?>', re.I)
TAG_RE = re.compile(r'<[^>]+>')
LETTER_RE = re.compile(r'[A-Za-zА-Яа-яЁё]')
BODY_RE = re.compile(r'(<body\b[^>]*>)(.*?)(</body>)', re.I | re.S)
HYPH_CHARS = "-\u2010\u2011\u2012\u2013\u00ad"
STOPWORDS_RU = {
    "и","а","но","да","или","либо","же","ли","бы","в","во","на","за","к","ко","о","об","обо","от","ото",
    "у","по","под","над","из","изо","с","со","для","до","при","про","без","не","ни","я","ты","он","она",
    "оно","мы","вы","они","это","тот","та","те","как","что","чтоб","чтобы","кто","где","когда","если"
}
PREFIXLIKE_RU = {
    "по","не","ни","без","бес","из","ис","раз","рас","воз","вос","вз","вс","под","над","пред","пре",
    "при","про","пере","об","от","со","за","на"
}
SUFFIXLIKE_RU = {"но","то","ка","ки","ко","ки","та","ся","сь","ли","ло","ла","ем","ет","ют","ая","ое","ые","ий","ый"}

def strip_tags(s: str) -> str:
    t = TAG_RE.sub('', s or '')
    t = t.replace('\u00ad', '')
    t = t.replace('\xa0', ' ')
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def norm_line(s: str) -> str:
    t = strip_tags(s).lower()
    return t

def is_page_number_line(s: str) -> bool:
    t = strip_tags(s)
    return bool(re.fullmatch(r'\d{1,4}', t))

def looks_like_running_line(s: str) -> bool:
    t = strip_tags(s)
    if not t:
        return False
    if len(t) > 40:
        return False
    if any(ch.isdigit() for ch in t):
        return False
    if re.search(r'[.!?:;…]', t):
        return False
    return bool(LETTER_RE.search(t))

def starts_with_letter(s: str) -> bool:
    t = strip_tags(s)
    return bool(t) and bool(LETTER_RE.match(t[0]))

def split_first_word(s: str):
    m = re.match(r'^\s*([A-Za-zА-Яа-яЁё]+)', s or "")
    return m.group(1) if m else ""

def split_last_word(s: str):
    m = re.search(r'([A-Za-zА-Яа-яЁё]+)\s*$', s or "")
    return m.group(1) if m else ""

def should_glue_broken_word(prev_plain: str, next_plain: str) -> bool:
    prev_last = split_last_word(prev_plain).lower()
    next_first = split_first_word(next_plain).lower()
    if not prev_last or not next_first:
        return False
    if len(prev_last) < 2 or len(next_first) < 2:
        return False
    if not re.search(r'[а-яё]', prev_last) or not re.search(r'[а-яё]', next_first):
        return False
    if re.search(r'[.!?…:;»"]\s*$', prev_plain):
        return False
    # Typical false split at line wrap: long-ish line + lowercased fragments.
    if len(prev_plain) < 26:
        return False
    # Case 1: both fragments are not standalone words.
    if prev_last not in STOPWORDS_RU and next_first not in STOPWORDS_RU:
        return True
    # Case 2: prefix-like first fragment + long second part (e.g. "по нимают").
    if prev_last in PREFIXLIKE_RU and len(next_first) >= 4:
        return True
    # Case 3: long first part + suffix-like tail (e.g. "смут но").
    if len(prev_last) >= 4 and next_first in SUFFIXLIKE_RU:
        return True
    return False

def looks_like_heading_line(s: str) -> bool:
    t = strip_tags(s)
    if not t:
        return False
    if len(t) < 2 or len(t) > 80:
        return False
    if re.search(r'[.!?]', t):
        return False
    words = t.split()
    if len(words) > 7:
        return False
    letters = [ch for ch in t if ch.isalpha()]
    if not letters:
        return False
    upper_ratio = sum(1 for ch in letters if ch.isupper()) / len(letters)
    if upper_ratio >= 0.86:
        return True
    return False

def looks_like_heading_raw(raw: str) -> bool:
    t = strip_tags(raw)
    if not t:
        return False
    if len(t) < 2 or len(t) > 110:
        return False
    words = t.split()
    if len(words) > 10:
        return False
    # Typical chapter/date heading: "17 февраля 1942, Ленинград"
    if re.match(r'^\d{1,2}\s+[A-Za-zА-Яа-яЁё][^.!?]{1,60},\s*[A-Za-zА-Яа-яЁё][^.!?]{1,40}$', t):
        return True
    low = t.lower().strip()
    if re.match(r'^(пролог|эпилог|предисловие|послесловие|заключение)$', low):
        return True
    if re.match(r'^(глава|часть|книга)\s+([ivxlcdm]+|\d+|[а-яёa-z]{1,12})$', low) and len(words) <= 4:
        return True
    if low in {"от автора", "вместо предисловия"}:
        return True
    letters = [ch for ch in t if ch.isalpha()]
    if letters:
        upper_ratio = sum(1 for ch in letters if ch.isupper()) / len(letters)
        if upper_ratio >= 0.92 and len(words) <= 8 and ',' not in t:
            return True
    return looks_like_heading_line(t)

def collapse_lines_to_paragraphs(lines):
    out = []
    cur = ""
    skipped_page_num = False
    for raw in lines:
        t = (raw or "").strip()
        t = t.replace('\u00ad', '')
        # Remove artifacts from PDF layer spacing.
        t = t.replace('\xa0', ' ')
        t = re.sub(r'\s+', ' ', t)
        plain = strip_tags(t)
        if not plain:
            if cur.strip():
                out.append((cur.strip(), False))
                cur = ""
            continue

        # Drop standalone PDF page number lines anywhere in the page core.
        if is_page_number_line(t):
            skipped_page_num = True
            continue

        # Force heading as standalone block only when not in the middle of a sentence flow.
        if looks_like_heading_raw(t):
            prev_plain = strip_tags(cur) if cur else ""
            if prev_plain and not re.search(r'[.!?…:;»"]\s*$', prev_plain):
                # Looks like sentence continuation, not a true heading.
                pass
            else:
                if cur.strip():
                    out.append((cur.strip(), False))
                    cur = ""
                out.append((plain, True))
                skipped_page_num = False
                continue

        if not cur:
            cur = plain
            skipped_page_num = False
            continue

        prev_plain = strip_tags(cur)
        next_plain = plain

        # Keep line-wrap hyphen inside a split word.
        if prev_plain and prev_plain[-1] in HYPH_CHARS and len(prev_plain) >= 2:
            prev2 = prev_plain[-2]
            next0 = next_plain[0] if next_plain else ''
            if prev2.isalpha() and next0.isalpha():
                cur = re.sub(rf'[{re.escape(HYPH_CHARS)}]\s*$', '', cur) + "-" + next_plain
                skipped_page_num = False
                continue

        # Dialogue line usually starts new paragraph.
        if next_plain.startswith("—"):
            out.append((cur.strip(), False))
            cur = next_plain
            skipped_page_num = False
            continue

        # Heuristic paragraph break: previous sentence ended and next looks like a new sentence.
        if re.search(r'[.!?…»"]\s*$', prev_plain) and starts_with_letter(next_plain) and len(prev_plain) > 45:
            out.append((cur.strip(), False))
            cur = next_plain
            skipped_page_num = False
            continue

        # If a PDF page number was between two word fragments, glue without space.
        if skipped_page_num:
            prev_last = prev_plain[-1] if prev_plain else ""
            next_first = next_plain[0] if next_plain else ""
            if prev_last.isalpha() and next_first.isalpha() and prev_last.islower() and next_first.islower():
                cur = cur.rstrip() + next_plain.lstrip()
                skipped_page_num = False
                continue

        # If PDF split one word across lines without hyphen, glue fragments.
        if should_glue_broken_word(prev_plain, next_plain):
            cur = cur.rstrip() + next_plain.lstrip()
            skipped_page_num = False
            continue

        # Default: wrapped line from PDF -> join with space.
        cur = cur.rstrip() + " " + next_plain.lstrip()
        skipped_page_num = False

    if cur.strip():
        out.append((cur.strip(), False))
    return out

for xhtml in sorted(text_dir.glob("*.xhtml")):
    s = xhtml.read_text(encoding="utf-8", errors="ignore")
    if s.count("<br") < 60 or s.count("<hr") < 3:
        continue

    bm = BODY_RE.search(s)
    if not bm:
        continue
    body = bm.group(2)

    parts = HR_SPLIT_RE.split(body)
    pages = []
    hr_tokens = []
    for i, p in enumerate(parts):
        if i % 2 == 0:
            pages.append(p)
        else:
            hr_tokens.append(p)

    # Build candidate running headers/footers from page edges.
    cand = Counter()
    page_lines = []
    for pg in pages:
        lines = BR_SPLIT_RE.split(pg)
        page_lines.append(lines)
        edge = lines[:3] + lines[-3:]
        for ln in edge:
            n = norm_line(ln)
            if n and looks_like_running_line(ln):
                cand[n] += 1

    running = {k for k, v in cand.items() if v >= 3}

    new_pages = []
    for lines in page_lines:
        # Remove headers/footers only on edges of page.
        start = 0
        end = len(lines)

        # Trim from top.
        for _ in range(3):
            if start >= end:
                break
            n = norm_line(lines[start])
            if is_page_number_line(lines[start]) or (n in running):
                start += 1
            else:
                break

        # Trim from bottom.
        for _ in range(3):
            if end <= start:
                break
            n = norm_line(lines[end - 1])
            if is_page_number_line(lines[end - 1]) or (n in running):
                end -= 1
            else:
                break

        core = lines[start:end]
        core = collapse_lines_to_paragraphs(core)
        # Build proper EPUB paragraphs to let renderer do its own line breaks/hyphenation.
        para_html = []
        for p, is_heading in core:
            if not p:
                continue
            if is_heading or looks_like_heading_line(p):
                para_html.append("<h2>" + p + "</h2>")
            else:
                para_html.append("<p>" + p + "</p>")
        new_pages.append("\n".join(para_html))

    # Flatten pages with cross-page merge for sentence continuations.
    blocks = []
    for pg in new_pages:
        # Parse back blocks from this page html.
        page_blocks = []
        for m in re.finditer(r'(?is)<(h2|p)>(.*?)</\1>', pg):
            tag = m.group(1).lower()
            txt = strip_tags(m.group(2))
            if not txt:
                continue
            page_blocks.append((txt, tag == "h2"))
        if not page_blocks:
            continue
        for idx, (txt, is_heading) in enumerate(page_blocks):
            if blocks and idx == 0 and (not is_heading) and (not blocks[-1][1]):
                prev = blocks[-1][0]
                start = txt.lstrip()
                starts_lower = bool(start) and (
                    start[0].islower() or
                    (len(start) > 1 and start[0] in '«"(' and start[1].islower())
                )
                if (not re.search(r'[.!?…:;»"]\s*$', prev)) and starts_lower:
                    blocks[-1] = (prev.rstrip() + " " + txt.lstrip(), False)
                    continue
            blocks.append((txt, is_heading))

    out_parts = []
    for txt, is_heading in blocks:
        if is_heading:
            out_parts.append("<h2>" + txt + "</h2>")
        else:
            out_parts.append("<p>" + txt + "</p>")
    out = "\n".join(out_parts)

    # Remove PDF page numbers that leaked into text right before page separators.
    out = re.sub(r'(?<!\d)\s*\d{1,4}\s*(?=<hr\b)', '', out, flags=re.I)

    # Remove page separator rules from final text (they are PDF artifacts, not book content).
    out = re.sub(r'\s*<hr\b[^>]*>\s*', '\n\n', out, flags=re.I)

    # Remove running header tokens that can survive page-edge cleanup.
    out = re.sub(r'(?im)^\s*(икс|Bykov_I-trilogiya_1_Iks\.535205)\s*$', '', out)

    # Drop synthetic first-page image sometimes left right after H1.
    out = re.sub(
        r'(<h1\b[^>]*>.*?</h1>)\s*'
        r'<img\b(?=[^>]*\bsrc=["\'][^"\']*file\d+\.(?:png|jpe?g|gif|webp|bmp)["\'])'
        r'(?=[^>]*\balt=["\']\s*["\'])[^>]*>\s*',
        r'\1\n',
        out,
        flags=re.I | re.S
    )

    # Remove duplicate title line from PDF body when it repeats the h1 text.
    mt = re.search(r'(?is)<h1\b[^>]*>(.*?)</h1>\s*<p>(.*?)</p>', out)
    if mt:
        h1_txt = strip_tags(mt.group(1))
        p1_txt = strip_tags(mt.group(2))
        if h1_txt and p1_txt and h1_txt == p1_txt:
            out = re.sub(
                r'(?is)(<h1\b[^>]*>.*?</h1>)\s*<p>\s*' + re.escape(h1_txt) + r'\s*</p>',
                r'\1',
                out,
                count=1
            )

    # Remove soft hyphen and fix in-line PDF split artifacts.
    out = out.replace('\u00ad', '')
    out = re.sub(r'([A-Za-zА-Яа-яЁё])\s*[-\u2010\u2011]\s+([A-Za-zА-Яа-яЁё])', r'\1\2', out)
    # Remove leaked page numbers inside a split word: "... слово 13 ча ..."
    out = re.sub(r'(?<=[A-Za-zА-Яа-яЁё])\s+\d{1,3}\s+(?=[A-Za-zА-Яа-яЁё])', '', out)

    # Final cleanup.
    out = re.sub(r'(?:\s*<p>\s*</p>\s*)+', '', out, flags=re.I)
    out = re.sub(r'\n{3,}', '\n\n', out)
    final = s[:bm.start(2)] + out + s[bm.end(2):]
    xhtml.write_text(final, encoding="utf-8")
PY
fi

perl -0777 -i -pe 's{(<dc:language>).*?(</dc:language>)}{$1'"$BOOK_LANG"'$2}si;' "$OPF_FILE"

if [[ -f "$NAV_FILE" ]]; then
  BOOK_LANG="$BOOK_LANG" NAV_TITLE="$NAV_TITLE" perl -0777 -i -pe '
    my $lang = $ENV{BOOK_LANG} // "ru-RU";
    my $nav_title = $ENV{NAV_TITLE} // "Contents";
    sub fix_tag {
      my ($tag, $attrs) = @_;
      $attrs //= "";
      $attrs =~ s/\s+xml:lang="[^"]*"//ig;
      $attrs =~ s/\s+lang="[^"]*"//ig;
      $attrs =~ s/\s+$//;
      return "<$tag$attrs xml:lang=\"$lang\" lang=\"$lang\">";
    }
    s/<html\b([^>]*)>/fix_tag("html",$1)/ige;
    s/<body\b([^>]*)>/fix_tag("body",$1)/ige;
    s/<h1>.*?<\/h1>/<h1>$nav_title<\/h1>/s;
  ' "$NAV_FILE"
fi

if [[ -d "$TEXT_DIR" ]]; then
  BOOK_LANG="$BOOK_LANG" perl -0777 -i -pe '
    my $lang = $ENV{BOOK_LANG} // "ru-RU";
    sub fix_tag {
      my ($tag, $attrs) = @_;
      $attrs //= "";
      $attrs =~ s/\s+xml:lang="[^"]*"//ig;
      $attrs =~ s/\s+lang="[^"]*"//ig;
      $attrs =~ s/\s+$//;
      return "<$tag$attrs xml:lang=\"$lang\" lang=\"$lang\">";
    }
    s/<html\b([^>]*)>/fix_tag("html",$1)/ige;
    s/<body\b([^>]*)>/fix_tag("body",$1)/ige;
  ' "$TEXT_DIR"/*.xhtml
fi

echo "[5/7] Strip duplicate first-page TOC links from spine"
perl -0777 -i -pe '
  s/\s*<itemref\b[^>]*\bidref="nav"[^>]*\/>\s*//g;
  s/\s*<itemref\b[^>]*\bidref="title_page_xhtml"[^>]*\/>\s*//g;
  s/\s*<itemref\b[^>]*\bidref="ch001"[^>]*\/>\s*//g;
  s/<guide>.*?<\/guide>//s;
' "$OPF_FILE"

if [[ -f "$NCX_FILE" ]]; then
  perl -0777 -i -pe '
    s/<docTitle>.*?<\/docTitle>/<docTitle><text>'"$TITLE"'<\/text><\/docTitle>/s;
    s/<docAuthor>.*?<\/docAuthor>/<docAuthor><text>'"$AUTHOR"'<\/text><\/docAuthor>/s;
    s/<navPoint[^>]*>\s*<navLabel>\s*<text>\s*<\/text>\s*<\/navLabel>.*?<\/navPoint>//sg;
  ' "$NCX_FILE"
fi

echo "[5.1/7] Drop manifest items for missing media files"
python3 - "$OPF_FILE" <<'PY'
import re
import sys
from pathlib import Path

opf_path = Path(sys.argv[1])
s = opf_path.read_text(encoding="utf-8", errors="ignore")
root = opf_path.parent

item_re = re.compile(r'<item\b[^>]*\bhref=["\']([^"\']+)["\'][^>]*/>', re.I)
to_remove = []
for m in item_re.finditer(s):
    href = m.group(1).strip()
    f = (root / href).resolve()
    if not f.exists():
        to_remove.append((m.start(), m.end()))

if to_remove:
    parts = []
    cur = 0
    for st, en in to_remove:
        parts.append(s[cur:st])
        cur = en
    parts.append(s[cur:])
    s = "".join(parts)
    opf_path.write_text(s, encoding="utf-8")
PY

echo "[6/7] Repack final EPUB: $OUTPUT_EPUB"
repack_epub "$UNPACK_DIR" "$OUTPUT_EPUB"

echo "[7/7] Remove source files: $(basename "$INPUT_PDF"), $(basename "$COVER_IMAGE")"
rm -f "$INPUT_PDF" "$COVER_IMAGE"

echo "Done: $OUTPUT_EPUB"
