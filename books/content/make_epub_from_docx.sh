#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BASE_CSS="${BASE_CSS:-$SCRIPT_DIR/epub.base.css}"
GEN_SCRIPT="${GEN_SCRIPT:-$SCRIPT_DIR/gen_epub_css_from_docx.py}"
COVER_IMAGE="${COVER_IMAGE:-$SCRIPT_DIR/cover.jpg}"
TMP_ROOT="${TMP_ROOT:-$SCRIPT_DIR/.epub_build_tmp}"
BOOK_LANG="${BOOK_LANG:-ru}"
AUTHOR="${AUTHOR:-Unknown}"
TITLE="${TITLE:-}"
NAV_TITLE="${NAV_TITLE:-Contents}"
NOTES_TITLE="${NOTES_TITLE:-Notes}"

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: command not found: $1" >&2; exit 1; }; }
need_file() { [[ -f "$1" ]] || { echo "ERROR: file not found: $1" >&2; exit 1; }; }

usage() {
  cat <<USAGE
Usage:
  $(basename "$0") <lang2> "<book_title>" "<author_name>"
  Example: $(basename "$0") ru "Вопрос" "Тони Вивер"

Input requirements:
  - exactly one .docx file in: $SCRIPT_DIR
  - cover image at: $COVER_IMAGE

Output:
  - same-name .epub рядом с исходным .docx
  - source .docx and cover.jpg are deleted after successful run

Optional env vars:
  NAV_TITLE="Contents"            (default: Contents)
  NOTES_TITLE="Notes"             (default: Notes)
USAGE
}

normalize_book_lang() {
  local raw="${1:-}"
  raw="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"
  if [[ "$raw" =~ ^[a-z]{2}$ ]]; then
    printf '%s' "$raw"
    return 0
  fi
  if [[ "$raw" =~ ^([a-z]{2})-[a-z]{2}$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  echo "ERROR: BOOK_LANG must be a two-letter code (e.g. ru, en, de)" >&2
  exit 1
}

resolve_input_docx() {
  local -a found=()
  shopt -s nullglob nocaseglob
  found=("$SCRIPT_DIR"/*.docx)
  shopt -u nocaseglob nullglob

  if [[ ${#found[@]} -eq 1 ]]; then
    printf '%s' "${found[0]}"
    return 0
  fi

  if [[ ${#found[@]} -eq 0 ]]; then
    echo "ERROR: no .docx files found in $SCRIPT_DIR" >&2
  else
    echo "ERROR: expected exactly one .docx in $SCRIPT_DIR (found: ${#found[@]})" >&2
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

need_cmd pandoc
need_cmd python3
need_cmd perl
need_cmd zip
need_cmd unzip

python3 -c "import docx" >/dev/null 2>&1 || {
  echo "ERROR: python-docx is not installed." >&2
  echo "Install with: python3 -m pip install --user python-docx" >&2
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

[[ $# -eq 3 ]] || {
  usage
  exit 2
}

BOOK_LANG="$(normalize_book_lang "$1")"
TITLE="$2"
AUTHOR="$3"
[[ -n "$TITLE" ]] || { echo "ERROR: book title must not be empty" >&2; exit 2; }
[[ -n "$AUTHOR" ]] || { echo "ERROR: author name must not be empty" >&2; exit 2; }

need_file "$BASE_CSS"
need_file "$GEN_SCRIPT"
need_file "$COVER_IMAGE"

process_one_docx() {
local input_docx="$1"
local docx_dir docx_file basename title output_epub
local work_dir auto_css css_file raw_epub unpack_dir
local epub_dir opf_file ncx_file nav_file text_dir

docx_dir="$(cd "$(dirname "$input_docx")" && pwd)"
docx_file="$(basename "$input_docx")"
basename="${docx_file%.*}"
title="$TITLE"
output_epub="$docx_dir/$basename.epub"

work_dir="$TMP_ROOT/$basename.$$"
auto_css="$work_dir/epub.headings.auto.css"
css_file="$work_dir/epub.css"
raw_epub="$work_dir/raw.epub"
unpack_dir="$work_dir/unpack"

mkdir -p "$work_dir"
trap 'rm -rf "$work_dir"' RETURN

echo "[1/6] Generate heading CSS for $docx_file"
python3 "$GEN_SCRIPT" "$input_docx" "$auto_css" --force-no-bold

echo "[2/6] Build merged CSS for $docx_file"
{
  echo "/* AUTO-BUILT: DO NOT EDIT */"
  cat "$BASE_CSS"
  cat <<'CSS'

/* Inline avatar fix: keep tiny speaker icons on the same line with the name. */
img.inline-avatar {
  display: inline-block !important;
  margin: 0 0.35em 0 0 !important;
  vertical-align: middle !important;
  max-width: none !important;
  max-height: 1em !important;
  height: 1em !important;
  width: auto !important;
}
CSS
  echo
  cat "$auto_css"
} > "$css_file"

echo "[3/6] Build raw EPUB via pandoc for $docx_file"
pandoc "$input_docx" \
  --from=docx \
  --to=epub3 \
  -o "$raw_epub" \
  --css="$css_file" \
  --toc \
  --toc-depth=1 \
  --metadata title="$title" \
  --metadata author="$AUTHOR" \
  --metadata lang="$BOOK_LANG" \
  --metadata language="$BOOK_LANG" \
  --metadata dc.language="$BOOK_LANG" \
  --epub-cover-image="$COVER_IMAGE"

echo "[4/6] Unpack and normalize EPUB internals for $docx_file"
unzip -q "$raw_epub" -d "$unpack_dir"

epub_dir="$unpack_dir/EPUB"
opf_file="$epub_dir/content.opf"
ncx_file="$epub_dir/toc.ncx"
nav_file="$epub_dir/nav.xhtml"
text_dir="$epub_dir/text"

[[ -d "$text_dir" ]] || { echo "ERROR: missing dir: $text_dir" >&2; exit 1; }

perl -0777 -i -pe 's{(<dc:language>).*?(</dc:language>)}{$1'"$BOOK_LANG"'$2}si;' "$opf_file"

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
' "$nav_file" "$text_dir"/*.xhtml

echo "[4.1/6] Mark tiny inline avatars for $docx_file"
python3 - "$text_dir" <<'PY'
import re
import sys
from pathlib import Path

text_dir = Path(sys.argv[1])

img_re = re.compile(r"<img\b[^>]*>", re.I)
class_re = re.compile(r'\bclass\s*=\s*"([^"]*)"', re.I)
style_re = re.compile(r'\bstyle\s*=\s*"([^"]*)"', re.I)
width_css_re = re.compile(r'width\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(in|px)\b', re.I)

def is_tiny_avatar_tag(tag: str) -> bool:
    sm = style_re.search(tag or "")
    if not sm:
        return False
    style = sm.group(1)
    wm = width_css_re.search(style)
    if not wm:
        return False
    w = float(wm.group(1))
    unit = wm.group(2).lower()
    if unit == "in":
        return w <= 0.35
    if unit == "px":
        return w <= 36.0
    return False

def add_class(tag: str, cls: str) -> str:
    cm = class_re.search(tag)
    if cm:
        cur = cm.group(1).strip()
        parts = [p for p in cur.split() if p]
        if cls not in parts:
            parts.append(cls)
        return tag[:cm.start(1)] + " ".join(parts) + tag[cm.end(1):]
    return re.sub(r"<img\b", f'<img class="{cls}"', tag, count=1, flags=re.I)

for xhtml in sorted(text_dir.glob("*.xhtml")):
    src = xhtml.read_text(encoding="utf-8", errors="ignore")
    changed = [False]

    def repl(m):
        tag = m.group(0)
        if is_tiny_avatar_tag(tag):
            changed[0] = True
            return add_class(tag, "inline-avatar")
        return tag

    out = img_re.sub(repl, src)
    if changed[0] and out != src:
        xhtml.write_text(out, encoding="utf-8")
PY

echo "[4.2/6] Keep paragraph lead-in with the next standalone image for $docx_file"
python3 - "$text_dir" <<'PY'
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
import re

text_dir = Path(sys.argv[1])
XHTML_NS = "http://www.w3.org/1999/xhtml"
EPUB_NS = "http://www.idpf.org/2007/ops"
ET.register_namespace("", XHTML_NS)
ET.register_namespace("epub", EPUB_NS)
SIZE_RE = re.compile(r"(width|height)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(in|px)\b", re.I)
STYLE_PROP_RE = re.compile(r"\s*([a-zA-Z-]+)\s*:\s*([^;]+)\s*")

def qn(tag: str) -> str:
    return f"{{{XHTML_NS}}}{tag}"

def local_name(tag: str) -> str:
    if not isinstance(tag, str):
        return ""
    return tag.split("}", 1)[-1]

def is_inline_avatar(img: ET.Element) -> bool:
    cls = (img.get("class") or "").split()
    return "inline-avatar" in cls

def is_standalone_image_block(el: ET.Element) -> bool:
    if local_name(el.tag) != "p":
        return False
    children = list(el)
    if len(children) != 1:
        return False
    img = children[0]
    if local_name(img.tag) != "img":
        return False
    if is_inline_avatar(img):
        return False
    text = (el.text or "").strip()
    tail = (img.tail or "").strip()
    return not text and not tail

def is_text_paragraph(el: ET.Element) -> bool:
    if local_name(el.tag) != "p":
        return False
    if is_standalone_image_block(el):
        return False
    text_parts = []
    if el.text:
        text_parts.append(el.text)
    for child in el:
        if child.tail:
            text_parts.append(child.tail)
    if "".join(text_parts).strip():
        return True
    # Text can also live inside inline descendants.
    return bool("".join(el.itertext()).strip())

def append_class(el: ET.Element, cls: str) -> None:
    cur = (el.get("class") or "").split()
    if cls not in cur:
        cur.append(cls)
    el.set("class", " ".join(cur).strip())

def merge_style(el: ET.Element, extra: dict[str, str]) -> None:
    cur = {}
    raw = el.get("style") or ""
    for part in raw.split(";"):
        part = part.strip()
        if not part:
            continue
        m = STYLE_PROP_RE.fullmatch(part)
        if not m:
            continue
        cur[m.group(1).lower()] = m.group(2).strip()
    for k, v in extra.items():
        cur[k.lower()] = v
    el.set("style", ";".join(f"{k}:{v}" for k, v in cur.items()))

def image_size_in(img: ET.Element):
    style = img.get("style") or ""
    dims = {}
    for kind, value, unit in SIZE_RE.findall(style):
        v = float(value)
        u = unit.lower()
        if u == "px":
            v = v / 96.0
        dims[kind.lower()] = v
    return dims.get("width", 0.0), dims.get("height", 0.0)

def is_large_standalone_image_block(el: ET.Element) -> bool:
    if not is_standalone_image_block(el):
        return False
    img = list(el)[0]
    width_in, height_in = image_size_in(img)
    return height_in >= 3.0 or width_in >= 4.5

def estimate_lead_lines(el: ET.Element) -> int:
    text = " ".join("".join(el.itertext()).split())
    if not text:
        return 1
    chars_per_line = 32.0
    weighted_len = 0.0
    for ch in text:
        if ch.isspace():
            weighted_len += 0.35
        elif ch.isupper():
            weighted_len += 1.05
        else:
            weighted_len += 1.0
    lines = int((weighted_len / chars_per_line) + 0.999)
    return max(1, lines)

def apply_pair_image_fit(lead: ET.Element, image_block: ET.Element) -> None:
    if not is_standalone_image_block(image_block):
        return
    img = list(image_block)[0]
    lead_lines = estimate_lead_lines(lead)
    total_column_lines = 18.5
    lead_gap_lines = 1.1
    remaining_lines = max(8.0, total_column_lines - lead_lines - lead_gap_lines)
    max_height_em = remaining_lines * 1.35
    merge_style(img, {
        "max-height": f"{max_height_em:.2f}em",
        "height": "auto",
        "width": "auto",
    })

def process_parent(parent: ET.Element) -> bool:
    changed = False
    children = list(parent)
    i = 0
    while i < len(children) - 1:
        current = children[i]
        nxt = children[i + 1]
        if is_text_paragraph(current) and is_standalone_image_block(nxt):
            wrapper = ET.Element(qn("table"), {"class": "figure-block figure-pair"})
            if is_large_standalone_image_block(nxt):
                append_class(wrapper, "figure-break-before")
            row = ET.SubElement(wrapper, qn("tr"))
            cell = ET.SubElement(row, qn("td"))
            parent.insert(i, wrapper)
            parent.remove(current)
            parent.remove(nxt)
            append_class(current, "figure-lead")
            cell.append(current)
            append_class(nxt, "image-block")
            apply_pair_image_fit(current, nxt)
            cell.append(nxt)
            changed = True
            children = list(parent)
            i += 1
            continue
        process_parent(current)
        i += 1
    if children:
        process_parent(children[-1])
    return changed

for xhtml in sorted(text_dir.glob("*.xhtml")):
    tree = ET.parse(xhtml)
    root = tree.getroot()
    before = ET.tostring(root, encoding="unicode")
    process_parent(root)
    after = ET.tostring(root, encoding="unicode")
    if after != before:
        tree.write(xhtml, encoding="utf-8", xml_declaration=True)
PY

echo "[5/6] Remove extra first-page TOC links and normalize TOC labels for $docx_file"
perl -0777 -i -pe '
  s/\s*<itemref\b[^>]*\bidref="nav"[^>]*\/>\s*//g;
  s/\s*<itemref\b[^>]*\bidref="title_page_xhtml"[^>]*\/>\s*//g;
  s/\s*<itemref\b[^>]*\bidref="ch001"[^>]*\/>\s*//g;
  s/<guide>.*?<\/guide>//s;
' "$opf_file"

if [[ -f "$ncx_file" ]]; then
  perl -0777 -i -pe '
    s/<docTitle>.*?<\/docTitle>/<docTitle><text>'"$title"'<\/text><\/docTitle>/s;
    s/<docAuthor>.*?<\/docAuthor>/<docAuthor><text>'"$AUTHOR"'<\/text><\/docAuthor>/s;
    s/<navPoint[^>]*>\s*<navLabel>\s*<text>\s*<\/text>\s*<\/navLabel>.*?<\/navPoint>//sg;
  ' "$ncx_file"
fi
if [[ -f "$nav_file" ]]; then
  perl -0777 -i -pe 's/<h1>.*?<\/h1>/<h1>'"$NAV_TITLE"'<\/h1>/s;' "$nav_file"
fi

echo "[5.1/6] Move end footnotes into notes-*.xhtml and rewrite links for $docx_file"
for ch in "$text_dir"/ch*.xhtml; do
  [[ -f "$ch" ]] || continue

  base="$(basename "$ch")"
  stem="${base%.xhtml}"
  notes_file="notes-${stem}.xhtml"
  notes_path="$text_dir/$notes_file"
  notes_id="notes_${stem}"

  set +e
  perl - "$ch" "$notes_path" "$base" "$notes_file" "$notes_id" "$opf_file" "$BOOK_LANG" "$NOTES_TITLE" <<'PERL'
use strict;
use warnings;
use utf8;

my ($chapter_path, $notes_path, $chapter_href, $notes_href, $notes_id, $opf_path, $book_lang, $notes_title) = @ARGV;

local $/ = undef;
open my $in, "<:encoding(UTF-8)", $chapter_path or die "Cannot read $chapter_path: $!";
my $html = <$in>;
close $in;

my $css_href = "../stylesheet.css";
if ($html =~ /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/i) {
  $css_href = $1;
}

my $re = qr{
  (\s*<section\b
      [^>]*\bid\s*=\s*["']footnotes["']
      [^>]*\bclass\s*=\s*["'][^"']*\bfootnotes-end-of-document\b[^"']*["']
      [^>]*>
      .*?
   </section>\s*)
  (</body>)
}six;

if ($html !~ $re) { exit 2; }

my $foot_block = $1;
$html =~ s/$re/$2/s;
$html =~ s/href\s*=\s*["']\#(fn\d+)["']/href="$notes_href#$1"/g;

open my $out, ">:encoding(UTF-8)", $chapter_path or die "Cannot write $chapter_path: $!";
print $out $html;
close $out;

$foot_block =~ s/href\s*=\s*["']\#(fnref\d+)["']/href="$chapter_href#$1"/g;

my $notes_xhtml = <<"XHTML";
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="$book_lang" lang="$book_lang">
  <head>
    <meta charset="utf-8" />
    <title>$notes_title</title>
    <link rel="stylesheet" type="text/css" href="$css_href" />
  </head>
  <body xml:lang="$book_lang" lang="$book_lang">
$foot_block
  </body>
</html>
XHTML

open my $nout, ">:encoding(UTF-8)", $notes_path or die "Cannot write $notes_path: $!";
print $nout $notes_xhtml;
close $nout;

open my $opf_in, "<:encoding(UTF-8)", $opf_path or die "Cannot read $opf_path: $!";
my $opf = <$opf_in>;
close $opf_in;

my $href = "text/" . $notes_href;
if ($opf !~ /\bid=["']\Q$notes_id\E["']/) {
  $opf =~ s{</manifest>}{<item id="$notes_id" href="$href" media-type="application/xhtml+xml"/>\n</manifest>}s
    or die "Cannot insert item into manifest\n";
}
if ($opf !~ /<itemref\b[^>]*\bidref=["']\Q$notes_id\E["']/s) {
  $opf =~ s{</spine>}{<itemref idref="$notes_id" linear="no"/>\n</spine>}s
    or die "Cannot insert itemref into spine\n";
}

open my $opf_out, ">:encoding(UTF-8)", $opf_path or die "Cannot write $opf_path: $!";
print $opf_out $opf;
close $opf_out;

exit 0;
PERL
  rc=$?
  set -e
  if [[ $rc -eq 0 || $rc -eq 2 ]]; then :; else echo "ERROR: $base (code $rc)" >&2; exit 1; fi
done

echo "[6/6] Repack final EPUB: $output_epub"
repack_epub "$unpack_dir" "$output_epub"

echo "Done: $output_epub"
}

DOCX_FILE="$(resolve_input_docx)"
process_one_docx "$DOCX_FILE"

echo "[cleanup] Remove source files: $(basename "$DOCX_FILE") and $(basename "$COVER_IMAGE")"
rm -f "$DOCX_FILE" "$COVER_IMAGE"
