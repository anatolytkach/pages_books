# 88. Phase 13 Paginated Direct-Host Recovery

## Scope
- Recover only the unprotected direct-host paginated model behind `unprotectedRenderHost=direct`.
- Prove or disprove real paginated behavior on localhost before any preview work.
- Stop before Phase 14 and before iframe removal.

## Exact failing behavior at recovery start
- direct route mounted without iframe
- `frameCount=0`
- `directRootCount=1`
- `rendition.next()` was a no-op
- `rendition.prev()` did not prove reverse movement
- `currentLocation()` stayed pinned
- page counter proof was reading empty nodes
- direct view width stayed at one spread instead of the full paginated width

## Hypothesis space
- cloned direct-host HTML nodes lost normal block layout semantics
- direct view missed the `contents.expand` / `contents.resize` re-expansion loop used by `IframeView`
- width measurement read the wrong root during paginated layout
- proof tooling was checking nonexistent `#cur/#pages` nodes instead of the real `#page-count` surface
- direct-generated CFIs could still diverge from replay-safe restore CFIs after pagination was fixed

## Success criteria for this recovery
- localhost direct route has real paginated width
- `rendition.next()` changes `currentLocation()`
- `rendition.prev()` returns to the previous location
- `currentLocation().start.displayed` advances
- visible `#page-count` is real and changes on next/prev
- focused pagination proof runner is green on localhost
- iframe baseline remains non-regressed

## Intentionally out of scope until pagination is green
- preview validation
- Phase 14 work
- iframe removal
- broad selection/search/theme cleanup
- whole-reader no-iframe claims

## Actual recovery result
- pagination root cause resolved on localhost
- focused pagination proof is green on localhost and preview
- iframe baseline remains green
- direct TOC/search/theme sanity is green on localhost and preview
- the later restore blocker was not part of this recovery itself and was closed separately in:
  - [89-phase-13-direct-restore-recovery.md](/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/89-phase-13-direct-restore-recovery.md)

## Recovery decision
- pagination/layout recovery: resolved
- preview: reached after localhost success and remained consistent
- this recovery no longer blocks Phase 13 close
- remaining work, if any, belongs to later scoped phases rather than this pagination recovery
