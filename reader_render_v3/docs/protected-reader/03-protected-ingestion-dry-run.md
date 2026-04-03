# 03 Protected Ingestion Dry-Run

Updated: 2026-04-03

## What `protected:build` does

`protected:build` converts one local book into a runtime-safe protected artifact without touching:

- the current public reader
- the current catalog
- the current worker routing
- R2 upload behavior

It is a local-only dry-run builder for the future protected reader pipeline.

If `--debug-artifact` is passed, the builder also emits a physically separate debug artifact subtree.

## Current command

From the repository root:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
```

From inside `/Volumes/2T/se_ingest/pages_books/reader_render_v3`:

```bash
npm run protected:build -- --input ../books/content/19686 --output artifacts/protected-books/19686
```

Optional debug build:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686 --debug-artifact
```

Validation:

```bash
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

## Accepted inputs

- exploded EPUB directory with `META-INF/container.xml`
- current local storage root with `book-manifest.json`
- `.epub` file (unzipped into a temp folder for the dry run)

## What the builder produces

Output shape:

```text
<output>/
  manifest.json
  toc.json
  locations.json
  styles.json
  assets/
  chunks/
    chunk-000001.json
    chunk-000002.json
  glyphs/
    chunk-000001.glyphs.json
    chunk-000002.glyphs.json
  debug/                  # only when --debug-artifact is enabled
    chunks/
      chunk-000001.debug.json
    glyphs/
      chunk-000001.glyphs.debug.json
```

Each runtime-safe chunk contains:

- `logicalBlockList`
- `renderLayer`
- `selectionLayer`

Each runtime-safe glyph file contains:

- chunk-local glyph mapping only
- no `char`

Debug files may contain:

- `fullText`
- `char`
- additional inspection data

## What is already implemented

- loading one book from current local storage root
- loading one legacy exploded EPUB directory
- optional loading of a `.epub` file through temp unzip
- spine extraction
- block extraction from XHTML / HTML
- basic inline style signal extraction
- deterministic chunking by `maxCharacters` and `maxBlocks`
- chunk-local glyph mapping
- chunk-local render layer
- separate selection layer
- source traceability for blocks and runs
- preservation of TOC metadata where available
- preservation of link targets and inline ids where available
- chunk-local runtime-safe glyph tables without `char`
- optional separate debug artifact subtree
- runtime-safe validator

## What is not implemented yet

- final page layout engine
- viewport-dependent pagination
- canvas renderer
- copy UI
- highlight UI
- notes runtime
- full footnote runtime
- path/shape-only glyph payloads
- final runtime renderer
- controlled selection/copy/highlight runtime behavior

## Runtime-safe vs debug payloads

Runtime-safe artifact:

- does not contain `selectionLayer.fullText`
- does not contain glyph `char`
- does not depend on any debug file to validate structurally

Debug artifact:

- exists only when explicitly requested with `--debug-artifact`
- contains `selectionLayer.fullText`
- contains glyph `char`
- is meant only for local inspection and ingestion verification

## Local verification checklist

1. Build one book:

```bash
npm run protected:build -- --input ../books/content/19686 --output artifacts/protected-books/19686
```

2. Inspect:

- `artifacts/protected-books/19686/manifest.json`
- `artifacts/protected-books/19686/toc.json`
- `artifacts/protected-books/19686/locations.json`
- `artifacts/protected-books/19686/styles.json`
- `artifacts/protected-books/19686/chunks/*.json`
- `artifacts/protected-books/19686/glyphs/*.glyphs.json`
- `artifacts/protected-books/19686/debug/**/*` if built with `--debug-artifact`

3. Confirm:

- multiple chunks exist
- each chunk has `renderLayer`
- each chunk has `selectionLayer`
- runtime-safe chunks do not contain `fullText`
- runtime-safe glyph files do not contain `char`
- glyph ids in chunk 1 differ from glyph ids in chunk 2 for the same character
- source refs point back to original spine item / href / file
- `protected:validate` passes without reading debug files

## Current limitations that will be addressed later

- chunking is logical and deterministic, but not visual pagination
- style extraction is intentionally shallow
- TOC extraction is best-effort, not feature-complete across all EPUB variants
- internal links and footnote refs are preserved as metadata only, not yet re-executed at runtime
