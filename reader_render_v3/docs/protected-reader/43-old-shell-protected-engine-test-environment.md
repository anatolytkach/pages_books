# 43. Old-Shell Protected-Engine Test Environment

## Canonical automation route

Localhost:

- `http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

Published preview:

- `https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

## What this route guarantees

- old reader shell is present
- protected engine is active
- embedded protected surface stays canvas-only
- Drive is non-blocking for automation
- no manual OAuth step is required for UX smoke
- normal UX path does not show the green technical panel
- menu/sidebar metadata and top-right controls can be verified automatically

## How Drive blocker is isolated

Automation-safe old-shell mode uses:

- `protectedDrive=disabled`
- `protectedAutomation=1`

Effect:

- Drive status becomes explicit `disabled`
- no Drive popup/login flow is triggered
- read/navigate/select/copy/highlight/note/persistence smoke can run unattended

## How to verify shell vs engine

Shell is old when:

- `#titlebar` exists
- `#viewerStack` exists
- no standalone protected diagnostics page is shown as the outer document

Engine is protected when:

- embedded frame points to `reader_render_v3/integration/protected-reader`
- bridge summary reports `readerMode = protected`
- protected surface children are only `CANVAS`

## Repeatable check

Run:

```bash
node reader_render_v3/tools/internal/check-old-reader-reading-parity.js \
  '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=http://127.0.0.1:8790/reader/?id=19686'

node reader_render_v3/tools/internal/check-old-reader-ux-parity.js \
  '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=http://127.0.0.1:8790/reader/?id=19686'

node reader_render_v3/tools/internal/check-old-shell-protected-ux-integration.js \
  '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape'
```

Published preview:

```bash
node reader_render_v3/tools/internal/check-old-reader-reading-parity.js \
  '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'

node reader_render_v3/tools/internal/check-old-reader-ux-parity.js \
  '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'

node reader_render_v3/tools/internal/check-old-shell-protected-ux-integration.js \
  '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'

node reader_render_v3/tools/internal/check-old-reader-full-ux-parity.js \
  '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'
```

## Current limitations

- automation-safe old-shell smoke intentionally disables Drive interactions
- standalone protected integration page still exists for lower-level debugging
- old-shell integration is currently certified only for pilot book `19686`
- reading-behavior parity checks now require:
  - font reflow
  - viewport resize reflow and two-column mode
  - no horizontal page-turn jerk
  - visible underlay during turn
  - viewport resize reflow
  - custom context note flow
  - visible note-jump emphasis
  - note list refresh
  - bookmark create/list/jump/persistence
  - loader hidden after ready
  - global counting
  - chapter-boundary continuation
  - TOC navigation/styling parity
  - touch swipe

Preferred end-to-end route for this pass:

- `https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`
