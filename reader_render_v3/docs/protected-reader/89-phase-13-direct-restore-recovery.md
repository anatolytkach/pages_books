# 89. Phase 13 Direct Restore Recovery

## Scope
- Recover only persisted location restore for `unprotectedRenderHost=direct`.
- Prove restore-safe parity on localhost before any preview certification.
- Stop before iframe removal, Phase 14, or broad UX cleanup.

## Exact failing behavior at recovery start
- direct route already had real paginated next/prev behavior
- persisted `previousLocationCfi` was written
- reload on direct route still fell back to page 1 after non-trivial navigation
- direct `rendition.display(previousLocationCfi)` on fresh load could resolve without restoring the meaningful same page
- page counter and restored position diverged from the pre-reload direct state

## Hypothesis space
- direct-generated start CFIs were not replay-safe on a fresh direct host
- coarse canonicalization through `book.locations.percentageFromCfi/cfiFromPercentage` lost page-exactness
- restore replay could be running before direct layout stabilized
- a later default `display()` call could override restore
- stored restore source could be correct structurally but not page-exact for the direct paginated model

## Recovery success criteria
- direct route stores a replay-safe persisted location
- reload restores the meaningful same position after ordinary next/prev navigation
- reload restores the meaningful same position after a TOC jump
- `#page-count` before reload matches `#page-count` after reload
- `currentLocation().start.displayed.page` before reload matches the restored page meaningfully
- localhost restore proof is green
- localhost Phase 13 parity runner is green

## Intentionally out of scope
- iframe removal
- Phase 14 work
- broad selection/search/theme changes
- whole-reader no-iframe claims
- cleanup unrelated to direct persisted restore

## Actual recovery result
- root cause identified:
  - direct-generated CFIs from the custom direct view were not replay-safe on a fresh load
  - fallback canonicalization through `book.locations` was too coarse and restored the wrong page
- product fix applied:
  - direct-mode persistence now derives a replay-safe canonical CFI from the hidden `_pageCalcRendition`
  - direct-mode save scheduling persists that canonical CFI instead of a coarse percentage-derived fallback
  - direct-mode restore replay continues to use real `rendition.display(...)`
- tooling fix applied:
  - new restore proof runner added:
    - `reader_render_v3/tools/internal/check-phase13-restore-proof.js`
  - existing unprotected bridge audit runner now accepts `#page-count` as a restore/page-label fallback and has preview-safe wait budgets

## Verified result
- localhost:
  - iframe restore baseline green
  - direct next+reload restore green
  - direct TOC+jump+reload restore green
  - direct parity runner green
- preview:
  - iframe restore proof green
  - direct restore proof green
  - direct parity runner green

## Recovery decision
- direct persisted restore recovery: resolved
- preview reached: yes
- `Phase 13` can close
- `Phase 14` remains a later phase and must not be conflated with this recovery
