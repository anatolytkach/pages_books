# Protected Reader UI Integration Plan

## Current open flow summary

The real user-facing reader entry point is [`/Volumes/2T/se_ingest/pages_books/reader/index.html`](/Volumes/2T/se_ingest/pages_books/reader/index.html).

Current live flow already does:

- `?id=<bookId>` and `?i=<bookId>` parsing
- numeric `#<bookId>` fallback
- `source` normalization
- `readerpub:lastid` / `readerpub:lastsource` fallback
- `readerpub:lastcfi:<bookId>` restore for the old reader
- `n`, `notesShare`, `notes`, and `notesz` handling in the old notes/share stack

That makes `reader/index.html` the correct integration point for a protected feature-flag switch.

## Integration point

The protected integration is inserted at the earliest query bootstrap in the real reader page:

- [`/Volumes/2T/se_ingest/pages_books/reader/index.html`](/Volumes/2T/se_ingest/pages_books/reader/index.html)

If `reader=protected` is present, the real reader route redirects into the protected integration page before EPUB.js boots.

This keeps:

- the real book-open route
- the real `id/i/source/hash` lifecycle
- the old reader as default

while avoiding a production cutover.

## Feature flag strategy

Protected mode is explicit only:

- `/books/reader/?id=19686&reader=protected`

Default behavior remains:

- no `reader=protected` -> old reader
- `reader=protected` -> protected integration route

## Fallback strategy

Fallback stays simple and explicit:

- old reader remains available through the normal route
- integrated protected page includes a direct link back to the old reader
- unresolved share/compat state is surfaced in diagnostics rather than silently fabricated

## Known risks

- production short-share fetch may still depend on endpoint availability in the current environment
- protected local persistence is currently browser-local, not cloud-synced
- this step intentionally does not replace the old reader or its persistence model
