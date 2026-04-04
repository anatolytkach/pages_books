# Reading Position Restore Bugfix

## Root cause

Integrated protected mode had two restore bugs in the bootstrap path:

1. The initial `initBook()` snapshot carried `bookSummary` and `tocItems`, but the restored snapshot returned by `restoreFromToken()` did not. The UI then applied the restored snapshot without carrying forward the initial metadata, which left the reading-state lifecycle partially detached from the active book context.
2. Production/share compatibility imports could clear an existing protected reading state because the import path replaced repository state with `keepReadingState: false` even when the imported payload did not include any reading-state payload.

There was also a correctness issue in worker restore:

3. `goToChunk({ globalOffset })` used `chunk.startOffset` from the loaded chunk payload even though the canonical start offset belongs to the global location model. That made restore-by-global-offset less reliable outside the first chunk.

## Files involved

- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-annotation-repository.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-annotation-repository.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-worker-core.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-worker-core.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-routing.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-routing.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js)

## Correct restore priority

Integrated protected mode now restores in this order:

1. explicit restore token from route state (`restoreToken` or `rt`)
2. persisted protected reading state from the protected repository
3. production-compatible CFI fallback only if protected state is absent
4. default start of book

## Persist-on-page-change rule

Any snapshot that changes the effective reading position must save the protected reading state through the repository abstraction. In practice this includes:

- next/prev page
- next/prev chunk
- TOC navigation
- go-to-annotation
- restore from token
- any other worker snapshot that changes the current page

The saved state includes:

- `restoreToken`
- `globalPosition`
- `page.pageIndex`
- `page.pageCount`
- optional compat anchor
- `updatedAt`

## Result

Reload and reopen in integrated protected mode now prefer the last persisted protected page instead of silently falling back to page 1.
