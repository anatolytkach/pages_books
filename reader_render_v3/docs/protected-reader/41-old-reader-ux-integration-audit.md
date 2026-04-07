# 41. Old Reader UX Integration Audit

## Old-reader UX shell inventory

The user-facing old shell lives in:

- [/Volumes/2T/se_ingest/pages_books/reader/index.html](/Volumes/2T/se_ingest/pages_books/reader/index.html)
- [/Volumes/2T/se_ingest/pages_books/reader/js/reader.js](/Volumes/2T/se_ingest/pages_books/reader/js/reader.js)
- [/Volumes/2T/se_ingest/pages_books/reader/js/fbreader-ui.js](/Volumes/2T/se_ingest/pages_books/reader/js/fbreader-ui.js)

Old-shell UX pieces that matter for protected integration:

- top title/header area
- viewer stack and surrounding layout
- overlay menu and notes affordances
- top-level navigation shell
- overall reader route and URL behavior

## Current protected surfaces

Protected runtime and integration code lives in:

- [/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader.html](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader.html)
- [/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-entry.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-entry.js)
- [/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/integration/protected-reader-bootstrap.js)
- [/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/dev/protected-reader.js)

Temporary or technical-only protected shell pieces that are not the desired end-user UX:

- standalone protected diagnostics-heavy page
- standalone protected toolbar/cards layout
- direct dev-shell-only controls panel

## What is reused

Reused from the old shell:

- reader route shell
- titlebar and overlay shell
- notes entry point
- top-level page layout
- reader UX context that users already recognize

Reused from protected integration:

- protected worker runtime
- protected canvas reading surface
- protected selection/copy/highlight/note model
- protected persistence and transport stack

## What blocked full UX integration before this step

- protected mode opened as a separate integration page instead of inside old shell UX
- browser automation for the user-shell path was not self-contained
- Drive/OAuth state could distract or block smoke expectations
- menu metadata parity was missing
- top-right shell controls were incomplete
- notes were not rendered in the old-reader style
- the green technical panel was still visible as part of the user flow

## Chosen integration target

Protected books should open inside the old reader shell on the normal reader route, with:

- old shell as the user-facing container
- protected engine embedded beneath that shell
- protected reading surface still canvas-only and worker-backed
- automation-safe route parameters that disable Drive blocking in UX smoke mode
- old-shell metadata/search/theme/notes/navigation parity restored as the canonical user-facing path
