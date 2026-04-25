# 49. Protected Old-Shell Full UX Parity Plan

## Must match now

- old shell remains the only user-facing shell
- protected engine owns rendering, pagination, search, notes, and selection underneath that shell
- font-size controls drive worker re-pagination with live viewport width and height
- viewport resize also drives re-pagination
- wide screens use two-column composition
- shell footer/progress stays on whole-book values from the protected engine
- next/prev continue across chapter boundaries
- TOC click navigates by exact protected offset, not chunk-only fallback
- TOC styling matches old-reader link styling in light and dark themes
- loader is hidden once protected content is ready
- right-click selection opens the old shell selection toolbar and a usable note composer flow
- note jump visibly highlights the target
- bookmarks create, render, persist, and jump in old-shell mode
- touch swipe works in old-shell mode

## Acceptable temporary differences only if unavoidable

- protected text remains canvas-only instead of DOM-based EPUB iframe text
- Drive remains optional and disabled in automation-safe parity routes

## Verification rule

- parity is not accepted from isolated smoke only
- localhost and published preview must both pass:
  - full old-reader UX parity runner
  - full old-reader UX conformance runner
  - existing readiness runner
  - old reader default regression
