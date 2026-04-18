# Current State

## Current Reader Transition State

- The repository is in a transitional state where `reader_new` work and legacy `reader1` work coexist.
- Catalog and preview routing now treat `reader_new` as a protected-only user-facing route.
- `books/catalog.config.json` now contains the explicit protected-book allowlist used by catalog/test routing.
- The protected-reader subsystem has an active current-branch summary in `reader_render_v3/docs/protected-reader/109-current-branch-delta-summary.md`.

## Practically Relevant Current Decisions

- Historical numbered protected-reader docs exist, but the current branch delta summary is the canonical high-signal starting point for that subsystem.

## Known Transitional Reality

- Direct/internal compat artifacts for unprotected development may still exist in code, but user-facing catalog/test opens for unprotected books route to `reader1`.
- `reader1` remains the practical comparison point for existing unprotected EPUB behavior.
- `reader1` now keeps its legacy EPUB engine but uses a reader shell that is intentionally aligned much more closely to the current `reader_new` UX family for unprotected books.
- `reader1` shell parity work currently includes right-side `Book Navigation` and `Settings` overlays, touch full-screen overlay behavior, and shared top/bottom bar icon family with `reader_new`, while leaving the legacy reading engine and core DOM in place.
- `reader1` no longer uses the old left-sidebar runtime for active navigation; current unprotected shell behavior is centered on the right-side unified overlays.
- `reader1` shell icon assets used by the top-bar unified shell are now served from `reader1/icons/`, so cloud preview does not depend on `reader_render_v3` asset paths for those controls.
- `reader1` selection actions now use a horizontal icon-only toolbar; `Translate` opens external Google Translate instead of an internal translation sub-toolbar.
- `reader1` TTS now defaults the language picker from book metadata, keeps the language list alphabetized, and skips forward when the current page has no readable text.

## How To Use This File

- Keep this file focused on what is true now.
- When a significant task changes routing, ownership, active migration state, or accepted current behavior, update this file in the same change.
