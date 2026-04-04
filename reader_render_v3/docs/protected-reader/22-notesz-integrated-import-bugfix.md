# notesz Integrated Import Bugfix

## Root cause

The integrated protected route originally resolved share payloads too early.

`/reader_render_v3/integration/protected-reader-entry.js` awaited
`bootstrapProtectedReaderIntegration()`, and that bootstrap awaited
`resolveProductionPayloadFromRoute(route)` before importing
`/reader_render_v3/dev/protected-reader.js`.

That was safe for:

- `notes=...` because legacy token decode is synchronous and cheap
- `n` / `notesShare` because the unresolved fetch path eventually completes with warnings

But it was unsafe for:

- `notesz=...` because compressed-token decode used an async stream path before the protected reader module and artifact bootstrap even started

When `notesz` decode stalled or failed in that early phase, the protected reader module was never imported, `loadArtifact()` never ran, and the UI remained at the static initial state:

- `Awaiting protected artifact.`

## Files involved

- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-entry.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-entry.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-routing.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-routing.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader.js)

## Corrected lifecycle

Integrated protected mode now splits two phases explicitly.

### 1. Book bootstrap

- parse route
- determine `bookId`
- build artifact root
- initialize worker/runtime
- load protected artifact
- render initial page

### 2. Compat share import

- resolve `notesz` / `notes` / `n` / `notesShare`
- decode or fetch payload
- normalize to production-style payload
- import through the existing compatibility bridge and repository
- update annotation UI and import report

The import phase is no longer a hard dependency for artifact loading.

## Fail-safe behavior

`notesz` now supports three outcomes without killing bootstrap:

1. valid token
   - artifact loads
   - import runs
   - annotations appear
   - diagnostics show `Compat share import: notesz`

2. invalid or corrupt token
   - artifact still loads
   - annotations remain empty
   - diagnostics show `Compat share import: notesz-error`
   - import report carries warnings

3. missing or unresolved share backend
   - artifact still loads
   - diagnostics show `shareId-unresolved`
   - route remains usable

## Why `notes=` kept working

`notes=` was already decoded through a synchronous base64 JSON path. It did not block the protected reader module import in the same way, so the old lifecycle bug was mostly visible on `notesz`.

## Remaining limitations

- local preview still does not provide a live short-share backend for `n` / `notesShare`
- malformed `notesz` warnings depend on browser decode errors and are not yet normalized into richer error classes
