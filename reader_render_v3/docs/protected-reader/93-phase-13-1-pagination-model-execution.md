# 93. Phase 13.1 — Pagination Model Execution

## Scope

This step adds a real page-level pagination and location model to the **new** unprotected runtime.

It is allowed to:
- replace section-only navigation with runtime-owned page navigation;
- introduce page-level runtime state and page-level location semantics;
- make the direct render host page-aware;
- prove page-level next/prev behavior on the new runtime route.

It is not allowed to:
- return to legacy EPUB.js direct-host patching as the main strategy;
- remove iframe;
- change the default unprotected route;
- claim restore/search/annotations parity;
- claim whole-reader no-iframe completion.

## What Counts As A Pagination Model

The pagination model is considered present only if all of the following are true:
- the new runtime owns page index and page count in runtime state;
- `nextPage()` and `prevPage()` move at page level inside the current section when more than one page exists;
- `getLocation()` reports page-level semantics;
- the direct render host visibly changes rendered page content when page navigation occurs;
- the visible counter is fed by runtime-owned page state, not by legacy shell heuristics;
- no iframe runtime boundary is used on the new route.

## In Scope

- page-level location semantics;
- page-level runtime state;
- direct-host page rendering;
- page-aware event emission for `pageChanged` and `readingPositionChanged`;
- page-level proof tooling.

## Out Of Scope

- restore parity;
- search parity;
- annotations parity;
- selection parity;
- bookmark parity;
- iframe removal.

## Required Evidence Package

Minimum required evidence:
- localhost proof on `19686` with real intra-section page movement;
- localhost proof on `45` with runtime-owned page/location state and honest boundary behavior;
- legacy unprotected path non-regression;
- protected sanity non-regression;
- preview proof only after localhost is green.

## Completion Result

This step is complete only if:
- the new runtime exposes real page-level state and location;
- `nextPage()` / `prevPage()` are not section-only in the happy-path paginated case;
- visible page content changes with state;
- localhost proof is green;
- preview does not contradict localhost if preview is reached;
- docs remain honest about still-missing runtime capabilities.
