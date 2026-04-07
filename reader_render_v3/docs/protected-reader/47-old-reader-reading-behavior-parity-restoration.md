# 47. Old Reader Reading Behavior Parity Restoration

## Restored behavior

### Reflow and font size

- `#fontDec` and `#fontInc` in the old shell now call the protected worker layout pipeline
- protected pagination is rebuilt with `fontScale`
- automation checks verify real reflow by comparing page offset windows before and after font changes:
  - `0..870 -> 0..820` at `1.0 -> 1.1`

### Page-turn feel

- old-shell arrows still drive the protected engine
- protected old-shell host now primes `#viewer-prev` / `#viewer-next` with a canvas snapshot underlay
- `#swipe-shadow` and adjacent-layer preview are shown during next / prev transitions
- automation checks verify:
  - preview class seen
  - transition layer canvas present
  - next / prev continue across chunk boundaries

### Note popup flow

- on the protected reading surface, active selection + right click now prevents the browser context menu
- the old reader `#selectionToolbar` is shown instead
- note creation continues through the old shell `commentSheet`

### Note jump highlighting

- `goToAnnotation` now carries `annotationId` into the worker
- focused annotation state returns to the host summary
- protected overlay now renders a visible focus rect for note jumps, with a worker-side fallback if exact range rects are unavailable

### Global counting

- old-shell footer counter uses the protected engine global page label
- bridge summary now preserves numeric global page fields from `snapshot.pageSummary`
- current page state is book-wide:
  - example: `2 / 25`, not a chapter-local reset

### Chapter-boundary continuation

- next from the end of a chunk continues into the next chunk
- prev from the next chunk can return across the boundary
- automated parity checks now require this behavior explicitly

## Intentional differences that remain

- protected surface is still canvas-only and worker-backed
- adjacent-page preview uses protected canvas snapshots rather than EPUB iframe DOM
- Drive remains disabled in the automation-safe old-shell route

## Automatic verification

Canonical localhost route:

- `http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

Canonical published preview route:

- `https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

Run:

```bash
node reader_render_v3/tools/internal/check-old-reader-reading-parity.js \
  '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=http://127.0.0.1:8790/reader/?id=19686'

node reader_render_v3/tools/internal/check-old-reader-reading-parity.js \
  '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'
```

Expected:

- reflow changed = `true`
- context menu `defaultPrevented = true`
- note jump `focusHighlightCount > 0`
- global counter synced with summary
- chapter-boundary next / prev = `true`
- frame tags = `CANVAS`, `CANVAS`
- no `/debug/`

## Full-parity follow-up

- viewport resize now changes protected layout width and page composition
- loader visibility is now part of the parity gate
- full comparative proof moved to [50-full-old-reader-ux-parity-restoration.md](/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/50-full-old-reader-ux-parity-restoration.md)
