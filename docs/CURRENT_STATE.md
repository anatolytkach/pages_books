# Current State

## Current Reader Roles

- `reader1/` is the current reader for unprotected books.
- `reader/reader_new.html` plus `reader_render_v3/` is the current reader stack for protected books only.
- The protected reader is fail-closed: invalid protected opens do not fall back into another reader path.

## Current Protected Reader Reality

- Active protected reader route and host vocabulary use `protected-shell`.
- Active protected-reader smoke tooling uses the protected host bridge surface and the canonical protected-shell route.
- The protected host owns its own shell visibility, overlay behavior, search UI, settings UI, menu metadata, and typography persistence.
- Protected reading-state restore starts from the saved protected reading position and saved typography state instead of first painting a default page/layout.

## Current Catalog / Routing Reality

- Catalog routing distinguishes the two readers:
  - unprotected books open `reader1`;
  - protected books open `reader_new`.
- Local `wrangler pages dev` fallback proxies `/books/api/*`, `/books/content/*`, and `/books/protected-content/*` to `https://reader.pub` when local R2 bindings are absent, so local catalog and protected-reader checks can use Cloudflare-backed data.

## Current Protected Tooling Reality

- `reader_render_v3/package.json` provides the main protected smoke commands:
  - `ui:smoke:desktop`
  - `ui:smoke:settings`
  - `ui:smoke:library`
  - `ui:smoke:search`
  - `ui:smoke:mobile`
  - `ui:smoke:mobile-settings`
  - `ui:smoke:canonical-url`
- Protected artifact build and validation entrypoints are:
  - `protected:build`
  - `protected:build:debug`
  - `protected:validate`
- Protected font/corpus support entrypoints are:
  - `protected:audit`
  - `protected:fonts:scan`
  - `protected:fonts:plan`
- The kept protected internal verification surface is now centered on:
  - `reader-new-ui-smoke.js`
  - `check-protected-reader-readiness.js`
  - `check-live-rollout-smoke.js`
  - `check-live-protected-route.js`
  - `check-catalog-reader-routing.js`
  - `check-catalog-test-sections.js`

## Current Reader1 Tooling Reality

- `tools/reader1/unpack_epub.py` is the current EPUB-to-`reader1` packaging entrypoint.
- `tools/reader1/publish_books.py` is the current `reader1` publish pipeline entrypoint.
- The `reader1` publish CLI exposes:
  - `status`
  - `run`
  - `resume`
  - `publish-epub`
  - `publish-dir`
  - `publish-zip`

## Current Content / Publishing Tooling Reality

- Source-document to EPUB helpers live under `books/content/`:
  - `make_epub_from_docx.sh`
  - `make_epub_from_pdf.sh`
  - `gen_epub_css_from_docx.py`
  - `epub_publish.sh`
- Catalog index generation lives under `tools/catalog/`.
- Gutenberg catalog-sync support also lives under `tools/catalog/`.
- SEO generation and upload helpers live under `tools/seo/`.
- Selective catalog/content publication to Cloudflare-backed storage currently goes through `books/content/epub_publish.sh`.
- SEO manifest publication currently goes through `tools/seo/upload_seo_indexes.sh`.

## Handoff Guidance

- Root context files are the startup documentation for this repository.
- The intended handoff picture is:
  - `reader1` for unprotected books;
  - `reader_new` plus `reader_render_v3` for protected books.
- Operational tooling instructions live in:
  - `docs/README.md`
  - `docs/gutenberg-pipeline.md`
  - `tools/README.md`
  - `reader_render_v3/tools/protected-ingestion/README.md`
  - `reader_render_v3/tools/protected-fonts/README.md`
- Historical and exploratory docs outside that set are no longer part of the intended handoff package.
