# Project Context

## What This Repository Contains

This repository contains the ReaderPub books site and the supporting code needed to:
- serve the public catalog under `books/`;
- run the legacy reader for unprotected books under `reader1/`;
- run the new protected-only reader through `reader/reader_new.html` plus `reader_render_v3/`;
- package and publish `reader1` book content from EPUB sources;
- build and validate protected book artifacts;
- generate EPUB files from source documents for catalog ingestion;
- build catalog indexes and SEO indexes;
- upload site data to Cloudflare-backed storage.

The deployed public site serves `https://reader.pub/books/`.

## Reader Architecture

### `reader1/`
- Old reader.
- Opens unprotected books only.
- Owns legacy EPUB rendering behavior.
- Operational packaging/publishing helpers live under `tools/reader1/`.

### `reader/reader_new.html` + `reader_render_v3/`
- New reader.
- Opens protected books only.
- `reader/reader_new.html` is the host page.
- `reader_render_v3/` contains the protected runtime, protected tooling, protected artifacts, and protected-reader docs.

## Main Repository Areas

### `books/`
- Public catalog frontend.
- Reader launch URL generation.
- Catalog configuration in `books/catalog.config.json`.
- Source-book helpers for EPUB creation and selective catalog publishing under `books/content/`.

### `reader1/`
- Legacy unprotected reader UI and engine.

### `tools/reader1/`
- EPUB unpacking and packaging for `reader1`.
- Source-qualified publish pipeline for `reader1` book content.

### `reader/`
- New-reader host page and shared shell assets used by the protected reader host.

### `reader_render_v3/`
- Protected runtime.
- Protected artifact build/validation tooling.
- Protected-reader smoke checks and supporting verification scripts.
- Protected-reader tool docs under `reader_render_v3/tools/*/README.md`.

### `reader_render_v5/`
- V5 protected reader runtime used by the sample protected production route.
- Served through `reader/reader_new_v5.html`.
- Production sample protected artifacts are stored in R2 under `protected-content/<protectedId>/`, not in the Pages bundle.

### `tools/catalog/`
- Catalog index generation.
- Book-location index generation.
- Newest-release index generation.

### `tools/seo/`
- SEO index generation and upload helpers.

### `_worker.js` and `tools/runtime/`
- Cloudflare routing and runtime endpoints.

## Content Model

- Gutenberg/public books use public IDs such as `?id=<gutenberg_id>`.
- Manual books remain source-qualified and use URLs such as `?id=<manual_id>&source=manual`.
- Catalog content lives under `books/content/`.
- Protected runtime artifacts live under `reader_render_v3/artifacts/protected-books/` for local and preview workflows.

## Current Tool Entry Points

### Verify the protected reader
- `npm --prefix reader_render_v3 run ui:smoke:desktop`
- `npm --prefix reader_render_v3 run ui:smoke:settings`
- `npm --prefix reader_render_v3 run ui:smoke:library`
- `npm --prefix reader_render_v3 run ui:smoke:search`
- `npm --prefix reader_render_v3 run ui:smoke:mobile`
- `npm --prefix reader_render_v3 run ui:smoke:mobile-settings`
- Canonical local protected URL:
  - `npm --prefix reader_render_v3 run ui:smoke:canonical-url`
- Additional protected verification helpers:
  - `node reader_render_v3/tools/internal/check-protected-reader-readiness.js ...`
  - `node reader_render_v3/tools/internal/check-live-rollout-smoke.js ...`
  - `node reader_render_v3/tools/internal/check-live-protected-route.js ...`
  - `node reader_render_v3/tools/internal/check-catalog-reader-routing.js ...`
  - `node reader_render_v3/tools/internal/check-catalog-test-sections.js ...`

### Package and publish unprotected books for `reader1`
- Convert EPUB into the `reader1` directory format:
  - `python3 tools/reader1/unpack_epub.py replace-dir ...`
  - `python3 tools/reader1/unpack_epub.py replace-manual ...`
- Run the `reader1` publish pipeline:
  - `python3 tools/reader1/publish_books.py status`
  - `python3 tools/reader1/publish_books.py run ...`
  - `python3 tools/reader1/publish_books.py resume`
  - `python3 tools/reader1/publish_books.py publish-epub ...`
  - `python3 tools/reader1/publish_books.py publish-dir ...`
  - `python3 tools/reader1/publish_books.py publish-zip ...`

### Build and validate protected books
- Build:
  - `npm --prefix reader_render_v3 run protected:build -- --input <source-book-path> --output <artifact-dir>`
- Debug build:
  - `npm --prefix reader_render_v3 run protected:build:debug -- --input <source-book-path> --output <artifact-dir>`
- Validate:
  - `npm --prefix reader_render_v3 run protected:validate -- --input <artifact-dir>`
- Font/corpus helpers:
  - `npm --prefix reader_render_v3 run protected:fonts:scan`
  - `npm --prefix reader_render_v3 run protected:fonts:plan`
  - `npm --prefix reader_render_v3 run protected:audit`

### Create EPUB files from source documents
- From DOCX:
  - `books/content/make_epub_from_docx.sh`
- From PDF:
  - `books/content/make_epub_from_pdf.sh`
- Publish selected EPUB/content updates plus related catalog indexes:
  - `books/content/epub_publish.sh`

### Build catalog and SEO indexes
- Catalog language indexes:
  - `python3 tools/catalog/build_lang_indexes.py ...`
- Book locations:
  - `python3 tools/catalog/build_book_locations.py ...`
- Newest releases:
  - `python3 tools/catalog/build_newest_releases.py ...`
- Gutenberg sync helpers:
  - `python3 tools/catalog/sync_gutenberg_indexes.py ...`
- SEO indexes:
  - `python3 tools/seo/build_seo_indexes.py ...`
- Manual SEO patching:
  - `python3 tools/seo/patch_manual_seo.py ...`
- SEO upload:
  - `tools/seo/upload_seo_indexes.sh ...`

### Cloudflare / preview workflows
- Local Pages preview is normally run with `wrangler pages dev`.
- Alternate local preview helper:
  - `node tools/dev/local_preview_server.mjs`
- R2 uploads in this repository are performed through the existing shell/python helpers and `wrangler r2 object put`-based scripts where applicable.
- Book content/artifact uploads to R2 should use `rclone` for bulk transfer.
- Current operational upload helpers include:
  - `books/content/epub_publish.sh` for selective catalog/content publication;
  - `tools/seo/upload_seo_indexes.sh` for SEO manifests.

## Documentation Entry Points

- Context files in `docs/` (`docs/PROJECT_CONTEXT.md`, `docs/PROJECT_RULES.md`, `docs/CURRENT_STATE.md`, `docs/COMPONENT_GUIDE.md`) are the handoff entry point.
- Tooling instructions live in:
  - `docs/README.md`
  - `tools/README.md`
  - `reader_render_v3/tools/protected-ingestion/README.md`
  - `reader_render_v3/tools/protected-fonts/README.md`
