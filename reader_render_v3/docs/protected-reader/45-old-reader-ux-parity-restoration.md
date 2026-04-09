# 45. Old Reader UX Parity Restoration

## What was restored

- menu/sidebar metadata:
  - cover
  - title
  - author
- top-right control area:
  - desktop search entry point
  - search next/prev flow
  - theme toggle wired to protected engine
  - old shell icon area kept visually intact
- notes panel:
  - protected notes are rendered with old-style notes list classes
  - note link/comment affordances match the old reader structure closely
- old-shell navigation:
  - `#next` and `#prev` drive the protected engine
  - page summary stays in sync with the shell
  - embedded page-turn animation now follows old-shell navigation actions
- technical green panel:
  - hidden in normal UX mode
  - only available behind an explicit dev/internal flag

## What intentionally differs

- protected reading surface remains:
  - worker-backed
  - canvas-only
  - no hidden DOM text
- automation-safe route disables Drive to keep UX smoke unattended and repeatable

## Reading-behavior parity additions

- font controls are no longer fixed or cosmetic in protected old-shell mode:
  - they drive real protected reflow
- note jump now carries focused annotation state and visibly marks the target range
- old-shell footer counter is synced to global protected pagination
- old-shell page turn now shows adjacent-page underlay / swipe-shadow feel in protected mode
- TOC now renders as old-reader-like links and navigates to exact protected offsets
- bookmarks are restored in old-shell mode
- touch swipe is restored in old-shell mode

Detailed behavior restoration is tracked in:

- [47-old-reader-reading-behavior-parity-restoration.md](/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/47-old-reader-reading-behavior-parity-restoration.md)

## Canonical protected-books-in-old-shell UX

Localhost:

- `http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

Published preview:

- `https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

## Automatic parity verification

Run:

```bash
node reader_render_v3/tools/internal/check-old-reader-ux-parity.js \
  '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=http://127.0.0.1:8790/reader/?id=19686'
```

Published preview:

```bash
node reader_render_v3/tools/internal/check-old-reader-ux-parity.js \
  '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'
```

Expected result:

- old shell present
- protected engine active
- top controls present
- menu metadata present
- search active
- theme toggle working
- notes rendered in old-style list
- no tech panel in normal UX
- protected surface still `CANVAS`, `CANVAS`
- no `/debug/`

For reading-behavior parity beyond shell chrome, also run:

- [check-old-reader-full-ux-parity.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/tools/internal/check-old-reader-full-ux-parity.js)
- [check-full-old-reader-ux-conformance.js](/Volumes/2T/se_ingest/pages_books/reader_render_v3/tools/internal/check-full-old-reader-ux-conformance.js)
