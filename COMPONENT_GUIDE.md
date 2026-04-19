# Component Guide

## `books/` Catalog

### Responsibility
- Public catalog UI.
- Reader launch URL generation.
- Catalog configuration and temporary/manual verification sections.
- Source-book helper scripts under `books/content/`.

### Main Files
- `books/index.html`
- `books/catalog.config.json`
- `books/content/*`

### Cross-Component Risk
- Changes here can silently reroute books into the wrong reader.
- Changes to book IDs, source handling, or launch params affect readers and worker routing.

## `reader1/` Unprotected Reader

### Responsibility
- Old reader for unprotected books.
- Legacy EPUB rendering behavior and reader UI.

### Main Files
- `reader1/index.html`
- `reader1/js/*`
- `reader1/icons/*`

### Cross-Component Risk
- Route changes from the catalog or worker can break opens into `reader1`.
- Shared shell/UI expectations must not be assumed to be owned by `reader_new`.

## `tools/reader1/` Reader1 Packaging And Publish Tooling

### Responsibility
- Convert EPUBs into the `reader1` directory format.
- Publish source-qualified unprotected content for `reader1`.
- Keep `reader1` content, catalog indexes, and related state files aligned.

### Main Files
- `tools/reader1/unpack_epub.py`
- `tools/reader1/publish_books.py`

### Cross-Component Risk
- Bad packaging or publish-state handling can desynchronize `reader1` content from catalog indexes.
- Changes here can affect book-location data and catalog launches into `reader1`.

## `reader/` Protected Reader Host

### Responsibility
- Host page for the new protected reader.
- Shared shell assets used by the protected host page.

### Main Files
- `reader/reader_new.html`
- `reader/css/*`
- selected `reader/js/*` assets that are still host-owned

### Cross-Component Risk
- Host changes can break integration with `reader_render_v3`.
- Reader-launch assumptions must stay aligned with catalog and worker routes.

## `reader_render_v3/` Protected Reader Runtime And Tooling

### Responsibility
- Protected reader runtime.
- Protected artifact build and validation tooling.
- Protected smoke checks and related verification tools.
- Protected-reader detailed docs.

### Main Files
- `reader_render_v3/reader_new/*`
- `reader_render_v3/dev/*`
- `reader_render_v3/runtime/*`
- `reader_render_v3/tools/protected-ingestion/*`
- `reader_render_v3/tools/internal/*`
- `reader_render_v3/package.json`

### Cross-Component Risk
- Runtime changes can break `reader/reader_new.html` host integration.
- Artifact-format changes can break existing protected artifacts and validation tooling.
- Smoke-tooling changes can silently weaken protected-reader verification if the canonical scenarios drift from production behavior.

## `tools/catalog/`

### Responsibility
- Catalog index generation and related derived data.

### Main Files
- `tools/catalog/build_lang_indexes.py`
- `tools/catalog/build_book_locations.py`
- `tools/catalog/build_newest_releases.py`

### Cross-Component Risk
- A bad index build affects the catalog and downstream SEO/build scripts.

## `tools/seo/`

### Responsibility
- SEO index generation and upload helpers.

### Main Files
- `tools/seo/build_seo_indexes.py`
- `tools/seo/upload_seo_indexes.sh`
- `tools/seo/patch_manual_seo.py`

### Cross-Component Risk
- SEO outputs depend on catalog indexes and book-location data.

## `_worker.js` And `tools/runtime/`

### Responsibility
- Cloudflare routing and runtime endpoints.

### Main Files
- `_worker.js`
- `tools/runtime/*`

### Cross-Component Risk
- Small routing changes can affect catalog opens, reader opens, and asset serving.
