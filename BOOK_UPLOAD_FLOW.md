# Book Upload Flow — Complete Reference

## Overview

Books are added to the library through a command-line pipeline that converts source documents into EPUB3, unpacks them into a content directory, builds search/catalog indexes, uploads everything to Cloudflare R2, and deploys. There is no web-based upload UI — the process is driven by shell scripts and a Python indexer.

---

## 1. Supported Source Formats

| Format | Script | Notes |
|--------|--------|-------|
| **EPUB** | _(none — native)_ | Already in target format; goes straight to unpack |
| **DOCX** | `make_epub_from_docx.sh` | Pandoc-based conversion with CSS extracted from Word styles |
| **PDF** | `make_epub_from_pdf.sh` | `pdftohtml` extraction → Pandoc rebuild; requires a text layer |

Images inside books can be JPG, PNG, GIF, WebP, BMP, SVG, TIFF, or AVIF.

---

## 2. Step-by-Step Pipeline

### Step 1 — Prepare the Source File

Place the source file (`.docx`, `.pdf`, or `.epub`) in the `books/content/` directory. If a cover image is available, place it alongside as `cover.jpg`.

### Step 2 — Convert to EPUB (if needed)

#### DOCX → EPUB (`make_epub_from_docx.sh`)

```bash
./books/content/make_epub_from_docx.sh <lang> "<Title>" "<Author>"
```

What happens internally:

1. **CSS generation** — `gen_epub_css_from_docx.py` reads the `.docx` file and extracts heading styles (font family, size, weight, alignment, spacing, indentation). It produces a CSS file with em-based sizing.
2. **Pandoc conversion** — Converts the DOCX to EPUB3 using the generated CSS.
3. **OPF normalization** — Cleans up the Open Packaging Format metadata (title, creators, language).
4. **TOC normalization** — Rebuilds the navigation document.
5. **Footnote normalization** — Fixes internal footnote references.
6. **Cleanup** — Deletes the source `.docx` and `cover.jpg` after successful conversion.

Output: a single `.epub` file in the same directory.

#### PDF → EPUB (`make_epub_from_pdf.sh`)

```bash
./books/content/make_epub_from_pdf.sh <lang> "<Title>" "<Author>"
```

What happens internally:

1. **Text extraction** — `pdftohtml` extracts text and structure from the PDF.
2. **Image filtering** — Strips synthetic page-layer bitmaps (full-page background images that PDFs render per page) to avoid duplicating content as both text and image. Controlled by `STRIP_SYNTHETIC_PAGE_IMAGES=1` (default).
3. **Artifact filtering** — Removes PDF artifacts like headers, footers, and page numbers.
4. **Pandoc rebuild** — Converts the cleaned HTML into a consistent EPUB3 structure.
5. **Cover embedding** — Injects `cover.jpg` (or a custom `$COVER_IMAGE`).
6. **Cleanup** — Deletes the source `.pdf` and `cover.jpg`.

Environment variables:
- `NAV_TITLE` — Navigation title (default: "Contents")
- `COVER_IMAGE` — Path to cover (default: `books/content/cover.jpg`)
- `STRIP_SYNTHETIC_PAGE_IMAGES` — Whether to strip page-layer bitmaps (default: `1`)

### Step 3 — Unpack the EPUB

```bash
./books/content/epub_unpack.sh import-all
# or
./books/content/epub_unpack.sh replace <id> [epub_file]
```

Two modes:

- **`import-all`** — Finds all `.epub` files in the content directory and unpacks each into a new numbered folder. IDs are assigned sequentially from the current maximum ID + 1.
- **`replace <id> [epub_file]`** — Replaces an existing book's folder with freshly unpacked EPUB content.

Validation: the script checks for a valid `META-INF/container.xml` before committing the unpacked structure.

The resulting directory structure per book:

```
books/content/<book_id>/
├── mimetype
├── META-INF/
│   └── container.xml          # Points to the OPF file location
└── EPUB/
    ├── content.opf            # Metadata: title, author, language, cover ref
    ├── nav.xhtml              # EPUB3 navigation document
    ├── toc.ncx                # Legacy NCX table of contents
    ├── styles/
    │   └── *.css
    ├── text/
    │   ├── cover.xhtml
    │   ├── title_page.xhtml
    │   └── ch*.xhtml          # Content chapters
    └── media/
        └── *.{jpg,png,...}    # Book images including cover
```

### Step 4 — Publish

```bash
./books/content/epub_publish.sh upload-ids <id1> <id2> ...
```

This is the main orchestration step. It does three things in sequence:

#### 4a. Upload Content to R2

All files in `books/content/<id>/` are uploaded to the Cloudflare R2 bucket (`reader-books`) under `content/<id>/`. The upload uses retry logic with exponential backoff (up to 8 attempts per file).

Option: `--no-image-upload` skips re-uploading images (useful when only metadata changed).

#### 4b. Build & Upload Indexes

Runs `build_lang_indexes.py --book-id <id>` for each book ID. The indexer:

1. **Reads metadata** — Parses `META-INF/container.xml` to locate the OPF file, then extracts:
   - `dc:title` — Book title
   - `dc:creator` — Author(s), supporting multiple creators
   - `dc:language` — Language code(s), normalized
   - Cover image — Found via `meta[name="cover"]` or `properties="cover-image"`

2. **Parses author names** — Handles formats like "Last, First" and "First Last". Recognizes suffixes (Jr., Sr., II, III) and particles (van, von, de, la, etc.). Generates a display format ("Last, First") and a search key (lowercased, diacritics stripped).

3. **Updates index files**:
   - `a/<author_key>.json` — Author's book list with titles and cover URLs
   - `p/<prefix>.json` — Alphabetical prefix browse tree (A → Ab, Ac, …)
   - `search/<token>.json` — Search index using 2-character minimum tokens from both title and author
   - `letters.json` — A–Z letter navigation with book counts
   - `languages.json` — Available languages with book counts
   - All of the above are also generated per-language under `lang/<code>/`

4. **Selective upload** — Only changed index files are uploaded to R2 under the `api/` prefix. A consistency check verifies that all affected author files have corresponding search tokens before uploading.

#### 4c. Deploy

Runs `wrangler pages deploy deploy/` to push the updated site to Cloudflare Pages.

---

## 3. Storage Layout

### Local Disk

```
books/
├── content/
│   ├── <book_id>/              # Unpacked EPUB directories (one per book)
│   ├── make_epub_from_docx.sh
│   ├── make_epub_from_pdf.sh
│   ├── epub_unpack.sh
│   └── epub_publish.sh
├── catalog/
│   └── index.html              # Catalog browsing UI
└── reader/
    └── index.html              # EPUB reader UI
```

### Cloudflare R2 Bucket (`reader-books`)

```
reader-books/
├── content/
│   └── <book_id>/              # Full unpacked EPUB per book
└── api/
    ├── letters.json
    ├── languages.json
    ├── p/*.json                # Prefix browse nodes
    ├── a/*.json                # Author detail files
    ├── search/*.json           # Search token files
    └── lang/
        └── <lang_code>/       # Language-specific copies of all above
            ├── letters.json
            ├── p/*.json
            ├── a/*.json
            └── search/*.json
```

---

## 4. How the Book Becomes Readable

### Catalog Discovery (client-side)

1. The catalog page loads `catalog.config.json` to get API base URLs.
2. Fetches `api/letters.json` to render the A–Z letter navigation.
3. Clicking a letter fetches `api/p/<letter>.json` which returns either an author list or a deeper prefix tree.
4. Clicking an author fetches `api/a/<author_key>.json` with their books, covers, and IDs.
5. Search queries fetch `api/search/<2-char-token>.json` and filter client-side for longer queries.
6. A language dropdown loads `api/languages.json` and switches to language-scoped index variants.

### Reader Loading

1. The user clicks a book or navigates to `?id=<book_id>` (or the `#<book_id>` hash).
2. The reader fetches `content/<id>/META-INF/container.xml` from R2.
3. Parses the container to find the OPF path.
4. Fetches and parses the OPF for the full manifest (chapters, styles, images).
5. Loads chapters sequentially and renders them using `epub.js`.
6. Reading position and annotations can optionally sync to Google Drive via `drive-sync.js`.

---

## 5. Covers

- The cover is identified from the OPF manifest: either a `<meta name="cover" content="..."/>` reference or an `<item properties="cover-image" .../>` entry.
- The URL is resolved relative to the OPF file location (e.g., `/books/content/<id>/EPUB/media/cover.jpg`).
- The catalog displays covers at a 5:8 aspect ratio in a uniform card layout.
- No thumbnail generation occurs — the original cover image from the EPUB is used directly.
- If no cover is found, an empty placeholder is shown.

---

## 6. Validation & Error Handling

| Check | What happens on failure |
|-------|------------------------|
| `META-INF/container.xml` missing or invalid | Book is skipped during indexing |
| OPF file missing or unparseable | Book is skipped |
| No `dc:creator` | Author defaults to "Unknown" |
| No `dc:title` | Title defaults to "Unknown" |
| No `dc:language` or invalid code | Language set to "und" (undetermined) |
| Author name can't be slugified | Falls back to book ID as author key |
| R2 upload fails | Retried with exponential backoff, up to 8 attempts |
| Index consistency check fails | Upload aborted — author/search files must match |

---

## 7. Quick-Reference: Adding One Book

```bash
# 1. Place source file and optional cover
cp MyBook.docx books/content/
cp cover.jpg  books/content/

# 2. Convert to EPUB
./books/content/make_epub_from_docx.sh en "My Book Title" "Author Name"

# 3. Unpack into numbered folder
./books/content/epub_unpack.sh import-all
# Note the assigned ID (e.g., 147)

# 4. Publish: upload, index, deploy
./books/content/epub_publish.sh upload-ids 147
```

The book is now live in the catalog and readable at `?id=147`.
