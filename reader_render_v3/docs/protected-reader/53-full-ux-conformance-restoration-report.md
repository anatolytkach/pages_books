# 53. Full UX Conformance Restoration Report

## Fixed issues with root cause, fix, and verification

### 1. Horizontal page-turn jerk

- Root cause:
  Old-shell host animated `#protectedOldShellFrame` with horizontal `translateX(...)`, so the active page physically shifted during next/prev.
- Fix:
  Removed horizontal translation from protected old-shell page-turn keyframes and kept the turn effect on opacity/filter plus underlay layers only.
- Verification:
  `check-full-old-reader-ux-conformance.js` reports `horizontalJumpPx = 0` on localhost and published preview.

### 2. Missing/too-weak underlay

- Root cause:
  Underlay canvases were present but shadow/background opacity was too weak to feel like old reader.
- Fix:
  Strengthened `#viewer-prev/#viewer-next` preview opacity, darkened `protected-turn-layer`, and increased `#swipe-shadow` opacity.
- Verification:
  Runner reports `underlayPresent = true` and `shadowOpacity ~= 0.56` on localhost and preview.

### 3. No wide two-column behavior

- Root cause:
  Protected layout was paginated as a single vertical column and did not model spread-like composition.
- Fix:
  Added column-aware layout and pagination in `protected-layout-engine.js` / `protected-pagination-model.js` with:
  - two-column mode on wide widths
  - one-column mode on narrow widths
  - page-slot-aware line placement
- Verification:
  Runner reports `initialColumnCount = 2`, `afterNarrowColumnCount = 1`, `afterWideColumnCount = 2`.

### 4. New note missing from note list

- Root cause:
  Old-shell note list depended on bridge summary refresh, but the UX flow previously did not guarantee a clean state transition after composer save.
- Fix:
  Kept selection stable through right-click flow, hid toolbar before opening composer, and refreshed shell note list from the updated bridge summary after `addNoteToSelection`.
- Verification:
  Runner reports `noteListState.count = 1` and `containsCreated = true`.

### 5. Whole-book counter still looked chapter-limited

- Root cause:
  Protected whole-book counter was already available, but chapter context could degrade to `none`, which made the shell feel chapter-local/incomplete.
- Fix:
  Replaced chunk-local TOC context lookup with whole-book backward lookup via `getActiveTocAnchorForPosition(...)`.
- Verification:
  Runner reports:
  - `visibleCounter = summaryCounter = 4 / 23`
  - `globalPageCount = 23`
  - `chapterLine = Aldous Huxley · CREDITS · 4 / 23`

### 6. Page turn stopped at chapter boundary

- Root cause:
  Protected navigation already crossed chunks, but parity had to be proven through end-to-end shell actions and whole-book counters.
- Fix:
  Kept chunk-crossing next/prev and verified it against whole-book labels and chapter context after the TOC/global-pagination fixes.
- Verification:
  Runner reports `chapterBoundary.crossedNext = true` and `crossedPrev = true` on localhost and preview.

### 7. TOC click did nothing

- Root cause:
  TOC navigation used `tocId -> chunkIndex` only, so multiple TOC entries inside the same chunk landed on the same chunk start and appeared inert.
- Fix:
  Added exact protected anchor resolution with `findGlobalOffsetForToc(...)` and routed `goToToc()` through exact `globalOffset`.
- Verification:
  Runner reports:
  - `beforeLabel = 2 / 23`
  - `afterLabel = 4 / 23`
  - `activeChapterLabel = CREDITS`

### 8. TOC items looked like boxed rectangles

- Root cause:
  Host rendered TOC entries as default `<button>` controls with browser chrome.
- Fix:
  Switched TOC host rendering to old-reader-like links and stripped default button chrome in old-shell host CSS.
- Verification:
  Runner reports `hasButtons = false`, `backgroundColor = rgba(0, 0, 0, 0)`, `borderTopWidth = 0px`.

### 9. TOC dark theme styling was too light

- Root cause:
  TOC active/current styling inherited light-looking emphasis inside the dark shell theme.
- Fix:
  Added dark-theme-specific TOC/bookmark color overrides in old-shell host CSS.
- Verification:
  Preview and localhost conformance runner both report transparent background and controlled dark-theme text color for current TOC items.

### 10. Touch swipe broken

- Root cause:
  Host-level touch listeners were not guaranteed to bind after protected host creation, so swipe handling could be absent in old-shell mode.
- Fix:
  Bound `installTouchSwipe(host)` inside `ensureProtectedHost()` after the host node exists and kept frame-doc swipe listeners as well.
- Verification:
  Runner reports `touch.start = 1 / 27`, `afterNext = 2 / 27`, `afterPrev = 1 / 27`.

### 11. Bookmarks broken

- Root cause:
  Bookmark controls had been explicitly disabled in old-shell mode and there was no old-shell render/persist/jump flow.
- Fix:
  Added bookmark storage, list rendering, shell control state, restore-token jumps, and persistence in `protected-old-shell-host.js`.
- Verification:
  Runner reports:
  - `filled = true`
  - `list.count = 1`
  - `jumpedLabel = expectedLabel`
  - `countAfterReload = 1`

### 12. Loader stuck in the center

- Root cause:
  Loader state was correct for ready/open, but previous checks around restore/jump were sampling stale state before bridge completion.
- Fix:
  Kept host loading sync authoritative in `invokeBridge()` / `updateFromSummary()` and tightened conformance tooling to wait for post-restore settled state.
- Verification:
  Runner reports `loaderAfterReady.visible = false` and `loaderAfterBookmarkJump.visible = false`.

## Remaining intentional differences

- Protected surface is still canvas-only and worker-backed.
- Automation-safe conformance routes still disable Drive to avoid OAuth/pop-up blockers during unattended UX checks.

## Exact automation checks

Build and validate:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

Full conformance:

```bash
node reader_render_v3/tools/internal/check-full-old-reader-ux-conformance.js \
  '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=http://127.0.0.1:8790/reader/?id=19686'

node reader_render_v3/tools/internal/check-full-old-reader-ux-conformance.js \
  '--url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape' \
  '--old-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686'
```

Readiness:

```bash
node reader_render_v3/tools/internal/check-protected-reader-readiness.js \
  '--url=http://127.0.0.1:8790/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape' \
  --headless=true \
  '--live-url=https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape' \
  --expect-live-protected=true
```
