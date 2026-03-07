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
