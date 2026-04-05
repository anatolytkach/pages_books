# Protected Reader Feature-Flag Integration

## Entry URL

Internal test entry:

- `/books/reader/?id=19686&reader=protected`

This is the real reader route with an explicit switch, not a replacement of the default old reader path.

## Coexistence model

- old reader remains default and unchanged
- protected reader is reachable only when explicitly requested
- dev shell remains available separately for isolated debugging

## Integration files

- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader.html`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader.html)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-entry.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-entry.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js)
- [`/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-routing.js`](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-routing.js)

## Restore behavior

Integrated protected mode restores in this order:

1. explicit restore token from route state (`restoreToken` or `rt`)
2. persisted protected reading state from the protected repository
3. production `readerpub:lastcfi:<bookId>` through the CFI-to-protected bridge
4. first page fallback if neither exists

The protected global/page model stays the source of truth.

Reading state is persisted on every page-changing snapshot, including page turns, chunk transitions, go-to-annotation, and restore actions.

Integrated protected mode now persists a versioned local-first protected bundle that
contains both reading state and annotations. That bundle is the internal source of truth
for local reopen/reload continuity.

On top of that internal state, integrated mode now also supports:

- protected sync file export/import
- production snapshot patch export
- production snapshot fragment import

## Notes and share compatibility

Integrated protected mode parses the production-style open/share state:

- `id`
- `i`
- `source`
- `n`
- `notesShare`
- `notes`
- `notesz`

Behavior:

- `notes` and `notesz` are decoded and imported through the protected compatibility bridge
- `n` / `notesShare` uses the same notes-share endpoint family as the old reader when available
- unresolved share fetches stay explicit in diagnostics

Import ordering is now fail-safe:

1. protected artifact bootstrap
2. reading-state restore
3. compat share decode/import

That means a broken `notesz` token can no longer leave the integrated reader stuck at `Awaiting protected artifact.`.

## Security boundaries

This integration does not relax the protected runtime model:

- worker isolation stays active
- protected mode now opens only with a secure worker host
- protected mode fails closed instead of falling back to a weaker main-thread runtime
- no hidden DOM text is introduced
- no debug artifact usage is introduced
- reconstruction remains scoped
- the reader surface remains canvas-only

Main-thread render packets are shape-only. Decoded page fragments are not part of the
normal snapshot path.

## Controlled failure URL

Internal fail-closed smoke test:

- `/books/reader/?id=19686&reader=protected&worker=disabled`

Expected result:

- protected page opens
- artifact does not load
- status reports protected mode unavailable
- old reader link remains usable

## Still missing before rollout

- production cutover policy
- live file handoff transport such as Google Drive upload/download around the protected sync file
- shared cloud persistence for protected annotations
- final production share backend hookup for all environments
- production UI polish and rollout gating

## Current transport workflow

Integrated protected mode now supports:

- export sync file
- download sync file
- load sync file from disk
- import sync file
- copy handoff state
- check Drive availability
- upload sync file to Drive
- download sync file from Drive
- apply downloaded Drive state

These transport actions work on top of protected local-first persistence and do not alter
the default old-reader route or behavior.
