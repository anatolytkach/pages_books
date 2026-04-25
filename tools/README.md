# Tools

`tools/` is grouped by purpose so it is obvious which scripts are live production utilities and which area they belong to.

## Structure

- `catalog/`
  - Catalog and discover builders used by publishing and Gutenberg ingest.
- `gutenberg/`
  - Manual Gutenberg ingestion CLI and its shared helper/orchestrator.
- `reader1/`
  - Reader1 EPUB conversion and publish pipeline for source-qualified books in the new format.
- `seo/`
  - SEO builders, selective patchers, and SEO upload helper.
- `runtime/`
  - Cloudflare workers and Wrangler configs for routing, docs, and notes-share APIs.
- `dev/`
  - Local development and deployment helpers.
- `state/`
  - Small checked-in JSON registries used by builders and routing.

## Main entry points

- Manual Gutenberg import:
  - `python3 tools/gutenberg/gutenberg_manual_ingest.py ...`
- Reader1 source-qualified import:
  - `python3 tools/reader1/publish_books.py status`
  - `python3 tools/reader1/publish_books.py run --source <name> --epub /abs/path/book.epub`
  - `python3 tools/reader1/publish_books.py resume`
- Catalog rebuild:
  - `python3 tools/catalog/build_lang_indexes.py ...`
  - `python3 tools/catalog/build_book_locations.py ...`
- SEO rebuild:
  - `python3 tools/seo/build_seo_indexes.py ...`
  - `tools/seo/upload_seo_indexes.sh ...`
- Docs deploy:
  - `tools/dev/deploy_docs.sh`
- Local preview server:
  - local frontend mode:
    - PowerShell: `node tools/dev/local_preview_server.mjs`
  - live frontend proxy mode:
    - PowerShell: `$env:READERPUB_PREVIEW_FRONTEND_SOURCE='remote'; node tools/dev/local_preview_server.mjs`
  - one-off live frontend request without restart:
    - `http://127.0.0.1:8788/books/?readerFrontendSource=remote#view=letters&bookView=grid`

## Notes

- `tools/reader1/publish_books.py` is only for non-Gutenberg books.
- Gutenberg books must continue to use the legacy Gutenberg pipeline and remain source-less in root storage.
- `tools/dev/local_preview_server.mjs` serves the local catalog frontend by default; the new `READERPUB_PREVIEW_FRONTEND_SOURCE=remote` mode proxies the catalog frontend from `https://reader.pub` while keeping the same local preview port.
- Detailed operational instructions live in:
  - `docs/README.md`, section `7.6 Reader1 publish pipeline`
