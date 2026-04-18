# Current State

## Current Reader Transition State

- The repository is in a transitional state where `reader_new` work and legacy `reader1` work coexist.
- Catalog and preview routing now treat `reader_new` as a protected-only user-facing route.
- `books/catalog.config.json` now contains the explicit protected-book allowlist used by catalog/test routing.
- The protected-reader subsystem has an active current-branch summary in `reader_render_v3/docs/protected-reader/109-current-branch-delta-summary.md`.

## Practically Relevant Current Decisions

- Historical numbered protected-reader docs exist, but the current branch delta summary is the canonical high-signal starting point for that subsystem.
- `reader_render_v3/package.json` now exposes fast `ui:smoke*` local checks for `reader_new` protected old-shell UI flows, and the host publishes `window.__READERPUB_READER_NEW_UI_STATE__` as the smoke-readiness marker used by those checks.
- `reader_new` protected old-shell boot now waits for persisted resume restoration before the first visible protected snapshot, so users should not see a default-start page flash before jumping to their saved position; the shell must stay hidden after boot until the user explicitly taps/clicks the reading surface center.
- protected `reader_new` reading-state persistence now stores a text-anchor resume hint in addition to the restore token: plain reading restores by the saved visible-page midpoint, while active selection/focused-note flows restore by that anchor text so reopening after a viewport resize stays on the same text slice instead of drifting to a chapter/page start.
- local `wrangler pages dev` fallback now proxies `/books/api/*`, `/books/content/*`, and `/books/protected-content/*` to `https://reader.pub` when the local worker has no R2 binding, so the local catalog and protected-reader checks can run against Cloudflare-backed book data.

## Known Transitional Reality

- Direct/internal compat artifacts for unprotected development may still exist in code, but user-facing catalog/test opens for unprotected books route to `reader1`.
- `reader1` remains the practical comparison point for existing unprotected EPUB behavior.
- `reader1` now keeps its legacy EPUB engine but uses a reader shell that is intentionally aligned much more closely to the current `reader_new` UX family for unprotected books.
- `reader1` shell parity work currently includes right-side `Book Navigation` and `Settings` overlays, touch full-screen overlay behavior, and shared top/bottom bar icon family with `reader_new`, while leaving the legacy reading engine and core DOM in place.
- `reader1` no longer uses the old left-sidebar runtime for active navigation; current unprotected shell behavior is centered on the right-side unified overlays.
- `reader1` shell icon assets used by the top-bar unified shell are now served from `reader1/icons/`, so cloud preview does not depend on `reader_render_v3` asset paths for those controls.
- `reader1` selection actions now use a horizontal icon-only toolbar; `Translate` opens external Google Translate instead of an internal translation sub-toolbar.
- `reader1` touch selection toolbar positioning must stay near the selected text without overlapping the selection; top-edge touch selections use the same non-overlapping near-selection rule instead of a distant fallback.
- `reader1` note/comment quote text on phones and tablets is normalized to a single inline flow rather than preserving line-by-line selection breaks.
- `reader1` TTS now defaults the language picker from book metadata, keeps the language list alphabetized, and skips forward when the current page has no readable text.
- `reader1` TTS now auto-advances across chapter boundaries and should continue until the user stops playback or reading reaches the true end of the book.
- `reader1` touch page-turn behavior depends on the production-style `reader.js` gesture pipeline, and the outer `fb-tap-layer` must remain non-interactive by default; enabling pointer events on its left/center/right zones breaks swipe/drag on phones and tablets.
- `reader1` paginated mobile layout depends on the legacy `epub.js` body padding baseline of `20px` top/bottom; increasing that internal padding inflates visible vertical page margins even when the shell bars are overlayed and hidden.

## How To Use This File

- Keep this file focused on what is true now.
- When a significant task changes routing, ownership, active migration state, or accepted current behavior, update this file in the same change.
