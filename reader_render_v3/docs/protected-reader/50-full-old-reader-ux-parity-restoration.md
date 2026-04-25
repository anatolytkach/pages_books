# 50. Full Old Reader UX Parity Restoration

## What was restored

- real viewport-aware reflow in the protected layout pipeline
- real wide-screen two-column composition
- shell-owned loader lifecycle synced to protected readiness and actions
- shell footer counter sourced from protected whole-book pagination
- exact-offset TOC navigation and shell-style TOC rendering
- right-click selection flow that preserves selection and opens a usable note composer
- visible note-jump target emphasis
- bookmark create/list/jump/persistence in old-shell mode
- touch swipe in old-shell mode
- continuous next/prev across chapter boundaries

## How it works now

- worker layout uses both `viewportWidth` and `viewportHeight`
- old-shell host owns `#loader` while protected engine boots or navigates
- old EPUB.js footer counter updates are bypassed in protected old-shell mode
- TOC uses exact protected anchor offsets instead of chunk-only jumps
- selection toolbar is positioned from protected selection bounds instead of a naive cursor-only placement
- note composer hides the selection toolbar before opening
- bookmark entries persist restore tokens and jump through the protected bridge
- chapter label comes from whole-book active TOC context, not current-chunk-only fallback

## Automation proof

Localhost full conformance runner:

- `ok: true`
- `columnCount 2 -> 1 -> 2`
- `viewportWidth 1440 -> 860 -> 1440`
- `lineCount 27 -> 18`
- `layoutFingerprint` changes on font resize
- `shadowOpacity ~= 0.56`
- `horizontalJumpPx = 0`
- `loader visible after ready = false`
- `loader visible after bookmark jump = false`
- `selectedCharsBeforeContext = selectedCharsAfterContext = 40`
- `focusHighlightCount = 1`
- `bookmark count after reload = 1`
- `global counter = 4 / 23`
- `chapter line = Aldous Huxley · CREDITS · 4 / 23`
- `chapter boundary next/prev = true/true`
- `touch swipe = 1 / 27 -> 2 / 27 -> 1 / 27`

Published preview full conformance runner:

- `ok: true`
- same measured conformance assertions pass on `https://codex-reader-render-v3.reader-books.pages.dev`
