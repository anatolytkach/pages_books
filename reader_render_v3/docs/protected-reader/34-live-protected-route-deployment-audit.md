# 34. Live Protected Route Deployment Audit

## Current Deployment Flow

- `reader.pub/books/reader/*` is not served directly from the `reader_render_v3` integration page.
- Canonical reader traffic goes through the production router:
  - `/Volumes/2T/se_ingest/pages_books/tools/runtime/reader-books-router.js`
- That router proxies:
  - `reader.pub/books/reader/*`
  - to
  - `https://reader-books.pages.dev/reader/*`
- The Pages project itself is:
  - `reader-books`
- The production alias for that project is:
  - `https://reader-books.pages.dev`
- `master.reader-books.pages.dev` is only a preview deployment for branch `master`, not the production alias used by `reader.pub`.

## Current Live Route Gap

Observed before this step:

- `https://master.reader-books.pages.dev/books/reader/?id=19686&reader=protected...`
  - returned `404`
- `https://master.reader-books.pages.dev/reader_render_v3/integration/protected-reader.html?...`
  - returned `404`
- `https://reader.pub/books/reader/?id=19686&reader=protected...`
  - returned `200`
  - but served the old/proxy reader shell, not the integrated protected page

Root causes:

1. `master.reader-books.pages.dev` was not a usable target for protected integration checks.
   - It is only the `master` preview alias.
   - It did not contain a published `reader_render_v3/` tree.

2. The canonical `reader.pub` route still intentionally proxied the old reader shell.
   - That kept old-reader default behavior intact.
   - It also meant `?reader=protected` on `reader.pub` was not yet a meaningful published protected route.

3. The committed deploy bundle was incomplete for protected integration publication.
   - `/Volumes/2T/se_ingest/pages_books/deploy/` had:
     - `_worker.js`
     - `books`
     - `reader`
   - but it did not include:
     - `reader_render_v3`
     - `reader1`
     - `publisher_tasks`

4. The protected integration page built fallback/open URLs as `/books/reader/` unconditionally.
   - That worked on localhost.
   - On `*.pages.dev`, the reader lives under `/reader/`.
   - So published preview fallback/open behavior would be wrong even after assets were published.

## Chosen Fix Strategy

Use a Pages preview deployment as the internal live/staging target.

Why this strategy:

- keeps `reader.pub/books/reader/*` unchanged for ordinary users
- keeps old reader as the default canonical path
- allows publishing a real protected route on a live URL outside localhost
- allows browser-level readiness checks against a real deployment
- avoids a production-wide cutover

Fix components:

1. Publish `reader_render_v3/` in the Pages deploy bundle.
2. Publish `reader1/` and `publisher_tasks/` together with the existing reader assets so the bundle matches the documented reader deploy shape.
3. Make protected integration routing aware of `*.pages.dev` so fallback/open URLs use `/reader/` there.
4. Treat the Pages preview alias as the canonical internal live testing target for protected readiness.

## Why The Previous Live Route Was Not Usable

- `master.reader-books.pages.dev` was the wrong deployment target and did not have the protected integration assets.
- `reader.pub` still intentionally opened the old reader shell.
- The protected integration route was therefore only fully usable on localhost before this step.
