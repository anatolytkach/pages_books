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

## Current Local V4 Audit Reality

- `reader_render_v4/` is the local-only v4 fidelity work area; it is not the current production protected-reader stack.
- Local v4 parity checks for protected artifact book `1` currently use:
  - `http://127.0.0.1:8792/reader/reader_new_v4.html?artifactBookId=1`
- Current v4 pagination is expected to consume `semanticReadingFlow` rather than raw `structuredFlow` entries before pagination.
- Current local v4 UX uses a v3-derived shell around the v4 paginated reading surface rather than the earlier standalone prototype card shell.
- Parity comparisons for v4 use the clean local `reader1` baseline, not the production catalog reader.

## Current Local V5 Target-Line Reality

- `reader_render_v5/` plus `reader/reader_new_v5.html` is the new local protected-reader target line for future work.
- `reader_render_v5/` starts from a full copy of the `reader_render_v3/` reader line; the original `reader_render_v3/` codebase remains the untouched baseline in place.
- Current local v5 manual verification for protected artifact book `1` uses:
  - `http://127.0.0.1:8792/reader/reader_new_v5.html?artifactBookId=1`
- Current local v5 product-facing shell now derives from `reader_render_v5/reader_new/*`, which is the copied `reader_render_v3/reader_new/*` line.
- `reader/reader_new_v5.html` now carries the full host document and shared CSS contract needed by that copied `reader_render_v3/reader_new` shell line; it is not itself the source of product UX logic.
- Current local v5 is now back on the copied `reader_render_v3/` runtime contract rather than the earlier hybrid HTML-paginated prototype path.
- Current local v5 opens the new `/books/protected-content-v4/<bookId>` route through a compatibility adapter at `reader_render_v5/runtime/protected-book-model.js`.
- That adapter currently keeps the copied `v3` runtime alive by feeding it the existing runtime-safe substrate while merging selected metadata and chunk-level presentation/media semantics from the new bootstrap manifest.
- Current chunk-level merge in `reader_render_v5/runtime/protected-book-model.js` now carries into the copied `v3` runtime:
  - synthetic TOC and updated book metadata from `/books/protected-content-v4/<bookId>`
  - figure-lead + image composition hints
  - `breakBefore` propagation for figure/list openings
  - sequence-aware comment-thread markers (`comment-heading` / `comment-body`)
  - `list-item` block matching for ordered-list sections
  - initial `blockquote` block-role propagation where the old substrate shape can be matched safely
- Current chunk adapter also tags chapter-opening clusters and suppresses internal page breaks inside those opening clusters, while comment-body paragraphs now inherit zero-indent thread composition from the new artifact.

## Current Reader1 Tooling Reality

- `tools/reader1/unpack_epub.py` is the current EPUB-to-`reader1` packaging entrypoint.
- `tools/reader1/publish_books.py` is the current `reader1` publish pipeline entrypoint.
- Local parity baseline for unprotected-reader audits is the locally served `reader1` route for manual book `1`:
  - `http://127.0.0.1:8788/books/reader1/?id=1&source=manual&entry=catalog`
- That local `reader1` baseline must stay clean for parity use: no missing-resource requests, no console errors, and no page errors during open.
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
