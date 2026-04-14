# 87. Phase 13 — Direct Unprotected Execution

## Scope
- Introduce an unprotected direct-render host path behind `unprotectedRenderHost=direct`.
- Keep the iframe-backed unprotected path live and default.
- Prove or disprove direct-path parity with browser-level evidence.

## Flag / route
- Direct path: `/reader/?id=<bookId>&unprotectedRenderHost=direct`
- Default path: `/reader/?id=<bookId>`

## Architectural split
- iframe path:
  - existing `book.renderTo(...)` iframe view
  - iframe-local event pipeline
  - iframe-local DOM/search/theme assumptions
- direct path:
  - custom EPUB.js view class
  - direct DOM/shadow-root render host
  - no iframe creation in live route

## Hard constraints
- Do not remove iframe.
- Do not change default route semantics.
- Do not over-claim whole-reader no-iframe completion.
- Do not treat partial direct boot as parity success.

## Evidence required for Phase 13 completion
- direct route exists under explicit flag
- iframe route remains green
- direct route passes browser-level parity for:
  - navigation
  - search
  - selection
  - theme/typography
  - TOC
  - repeated interactions
- localhost green
- preview green

## Actual Phase 13 execution outcome
- direct route was introduced under `unprotectedRenderHost=direct`
- default iframe route remained intact
- recovery pass [88-phase-13-paginated-direct-host-recovery.md](/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/88-phase-13-paginated-direct-host-recovery.md) resolved the original direct pagination blocker:
  - direct host forms real paginated width
  - `reader.rendition.next()` and `reader.rendition.prev()` are no longer no-op
  - `currentLocation().start.displayed` advances
  - `#page-count` tracks direct next/prev parity with the iframe baseline
- recovery pass [89-phase-13-direct-restore-recovery.md](/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/89-phase-13-direct-restore-recovery.md) resolved the remaining persisted-location blocker:
  - direct route now stores a replay-safe persisted location
  - direct next+reload restore is green
  - direct TOC+jump+reload restore is green
  - localhost and preview restore proof are green
- browser-level localhost and preview evidence now shows:
  - iframe path remains working and default
  - direct path under explicit flag works without iframe
  - direct-vs-iframe parity is green for the scoped Phase 13 domains

## Phase 13 decision
- `PHASE 13 COMPLETE WITH WARNINGS`

## What remains before Phase 14 can even be considered
- Nothing from Phase 14 is included in this phase.
- iframe removal for unprotected still has not happened.
- whole-reader no-iframe completion is still forbidden as a claim.
- Phase 14 may only start as a separate phase after this dual-path Phase 13 result is accepted.
