# Protected Ingestion Dry-Run

This module can either:

- build a local-only protected artifact
- or build, upload, and register a protected artifact for the live catalog

## Commands

Run from the repository root:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
```

Build, upload to R2, and register the book in catalog metadata:

```bash
npm --prefix reader_render_v3 run protected:publish -- --input books/content/19686 --output artifacts/protected-books/19686
```

Or from inside `/Volumes/2T/se_ingest/pages_books/reader_render_v3`:

```bash
npm run protected:build -- --input ../books/content/19686 --output artifacts/protected-books/19686
```

Debug build:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686 --debug-artifact
```

Validate runtime-safe artifact:

```bash
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

Explicit control:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686 --upload
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686 --register
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686 --publish
```

## Accepted input

- an exploded EPUB directory with `META-INF/container.xml`
- a current local book root such as:
  - `/Volumes/2T/se_ingest/pages_books/books/content/19686`
  - `/Volumes/2T/se_ingest/pages_books/books/content/manual/19`
- an `.epub` file (unzipped to a temp folder for dry-run processing)

## Output

The builder writes a runtime-safe protected artifact with:

- `manifest.json`
- `toc.json`
- `locations.json`
- `styles.json`
- `chunks/*.json`
- `glyphs/*.glyphs.json`
- `assets/`

When `--debug-artifact` is enabled it also writes:

- `debug/chunks/*.debug.json`
- `debug/glyphs/*.glyphs.debug.json`

Each runtime-safe chunk contains two distinct layers:

- `renderLayer`
- `selectionLayer`

The render layer does not expose readable text runs directly.
The runtime-safe selection layer stores only logical range metadata and does not contain `fullText`.

Readable debug fields such as `char` and `fullText` live only inside the optional `debug/` subtree.

## Publish behavior

When `--upload` is enabled, the artifact is uploaded to:

- `protected-content/<bookId>/...`

When `--register` is enabled, the tool:

- writes `readerType: "protected"` into `tools/state/book_path_overrides.json`
- rebuilds catalog author/search indexes for the book
- rebuilds `reader_lang_indexes/book-locations*.json`

When `--publish` is enabled, it does both and also uploads the changed API files to R2.

The tool preserves the book's existing source/sourceBookId/content-path identity when it can find it in the current catalog metadata. If no prior catalog identity exists, it falls back to:

- `source=gutenberg`
- `sourceBookId=<bookId>`
- legacy `/books/content/<bookId>/` public paths

Useful flags:

- `--book-id <id>` to override the inferred book id
- `--bucket <bucket>` to change the R2 bucket
- `--wrangler-bin <path>` to choose the Wrangler binary
- `--rclone-bin <path>` and `--rclone-remote <name>` for bulk sync
- `--skip-rclone` to force per-file Wrangler uploads
- `--python-bin <path>` for catalog rebuilds
- `--content-root <path>` if local EPUB content is not under `books/content`
- `--index-root <path>` if catalog JSON is not under `reader_lang_indexes`
- `--protected-prefix <prefix>` to override `protected-content/<bookId>`
- `--dry-run` to print external commands without uploading or writing catalog overrides

## Current limitations

- this tool assumes the book already has local EPUB content available under the catalog content root if you use `--register` or `--publish`
- it updates catalog metadata and R2 objects, but it does not deploy Pages by itself
