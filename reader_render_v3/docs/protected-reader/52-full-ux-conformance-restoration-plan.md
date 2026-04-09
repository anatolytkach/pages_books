# 52. Full UX Conformance Restoration Plan

## Must match now

- No horizontal page-turn jerk in protected old-shell mode.
- Adjacent-page underlay is visible during turn.
- Wide viewport activates two-column composition.
- Narrow viewport falls back to one-column composition without desync.
- Font-size changes cause real reflow.
- Viewport resize causes real reflow.
- Whole-book counter stays authoritative in the shell.
- Next/prev continue through chapter boundaries.
- TOC click opens the correct chapter/position.
- TOC items are link-like, not boxed browser buttons.
- Dark-theme TOC styling stays dark-reader-compatible.
- Right-click note flow keeps selection stable and opens a usable composer.
- New note appears in the list immediately.
- Note click visibly highlights the target text.
- Bookmark create/list/jump/persistence work in old-shell mode.
- Touch swipe works in mobile/touch emulation.
- Loader clears after ready, after page turn, and after bookmark/note restore jumps.

## Secondary differences

- Protected text remains canvas-only.
- Search and note/bookmark shell actions are backed by protected worker APIs instead of EPUB.js internals.
- Automation-safe routes disable Drive to keep UX conformance checks deterministic.

## Release rule for this pass

This pass is not accepted unless all of the following are green on both localhost and published preview:

- `check-full-old-reader-ux-conformance.js`
- `check-protected-reader-readiness.js`
- old reader default regression checks

Any remaining difference must be recorded as a warning with a measured reason, not left implicit.
