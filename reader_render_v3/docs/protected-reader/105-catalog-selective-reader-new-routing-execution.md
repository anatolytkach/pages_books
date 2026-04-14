# Phase 15? No. Catalog Selective `reader_new` Routing Execution

## Scope

- keep the current catalog reader baseline for most books
- route only an explicit allowlist of book ids from catalog links to `/books/reader_new/`
- prove that routed protected and routed unprotected books open in the new reader path

## In Scope

- one centralized allowlist/config for catalog-to-`reader_new` routing
- catalog link generation updates
- `/books/reader_new/` and `/reader_new/` route aliasing to the new reader entry
- focused localhost and preview routing proof

## Out Of Scope

- mass catalog rollout to `reader_new`
- replacing the current catalog default reader for all books
- protected removal
- whole-reader iframe-free claims
- unrelated reader cleanup

## Completion Criteria

- most catalog books still resolve to the existing catalog reader baseline
- the explicit protected allowlist resolves to `/books/reader_new/`
- the explicit unprotected allowlist resolves to `/books/reader_new/`
- routed protected books open as protected
- routed unprotected books open as unprotected
- no accidental mass reroute is detected on localhost or preview

## Baseline Routing In This Workspace

- the current catalog baseline route is `/books/reader1/`, not `/books/reader/`
- this task preserves that baseline for non-allowlisted books
- `reader_new` is introduced as a selective alias to the newer `reader/` stack

## Explicit Allowlist

- protected to `reader_new`:
  - `19686`
  - `45`
- unprotected to `reader_new`:
  - `11`
  - `84`
  - `1342`
- control books kept on the current catalog baseline:
  - `1661`
  - `2701`

## Source Of Truth

- catalog routing allowlist lives in [books/catalog.config.json](/Volumes/2T/se_ingest/pages_books/books/catalog.config.json) under `readerRouting.readerNewAllowlist`
- catalog link resolution is centralized in [books/index.html](/Volumes/2T/se_ingest/pages_books/books/index.html) via `openReaderUrl(...)`

## Expand / Clean Up

- add or remove ids only in `books/catalog.config.json`
- keep protected and unprotected ids in separate lists
- do not duplicate routing logic in catalog cards, hero links, or reader routes

## Failure Criteria

- any non-allowlisted control books are rerouted to `reader_new`
- routed books still resolve to the old reader baseline
- `reader_new` cannot open routed protected or unprotected books
- localhost and preview disagree on routing behavior
