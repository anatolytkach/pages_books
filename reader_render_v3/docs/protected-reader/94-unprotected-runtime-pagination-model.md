# 94. Unprotected Runtime Pagination Model

## Scope

This document defines the page-level pagination model for the **new** unprotected runtime.

It documents what is real now, what semantics the shell may rely on, and what is still intentionally missing.

## 1. Page-Level Location Semantics

The new runtime now treats location as a runtime-owned page descriptor.

Minimum location fields:
- `sectionIndex`
- `sectionCount`
- `spineIndex`
- `spineCount`
- `href`
- `title`
- `pageIndex`
- `pageCount`
- `pageToken`
- `canGoPrev`
- `canGoNext`
- `label`

Current label form:
- `Page X/Y - Section A/B`

Current token form:
- `spine:<sectionIndex>/page:<pageIndex>@v1`

Meaning:
- `pageIndex` / `pageCount` are the authoritative page position inside the current rendered section;
- section identity remains explicit;
- token is runtime-owned and suitable as the base for later restore/search integration work.

## 2. How Pages Are Built

The new runtime builds pages from:
- direct-host viewport width and height;
- extracted section text blocks;
- runtime-owned page fitting logic;
- direct-host measurement in the same render environment as the visible page.

The new runtime does **not** use:
- iframe-backed stage managers;
- iframe `contentDocument`;
- legacy EPUB.js `renderTo(...)` view ownership as the page authority.

Current implementation model:
- section text is extracted into runtime-owned blocks;
- blocks are fitted into visible pages against the direct-host viewport;
- oversized blocks are split into page-fitting text chunks;
- each page has its own rendered text slice;
- visible page output is produced from runtime page state.

This is a real pagination model, not a visual counter shim.

## 3. Runtime-Owned Pagination State

Current runtime-owned pagination state includes:
- `ready`
- `mode`
- `directRootPresent`
- `firstRenderableStateReached`
- `viewportWidth`
- `viewportHeight`
- `currentSectionIndex`
- `currentPageIndex`
- `currentPageCount`
- `locationToken`
- `canAdvanceWithinSection`
- `canRetreatWithinSection`
- `boundaryTransitionNeeded`
- `visibleTextLength`

Current mode:
- `page-model-v1`

## 4. Navigation Semantics

### Inside a multi-page section
- `nextPage()` moves to the next page in the same section
- `prevPage()` moves to the previous page in the same section
- `pageIndex` changes
- visible rendered text changes
- `label` changes

### At section boundaries
- if the current page is the last page of the section and another section exists, `nextPage()` loads the next section and lands on its first page
- if the current page is the first page of the section and a previous section exists, `prevPage()` loads the previous section and lands on its last page

### Honest no-op
- only allowed at the true book start or book end

## 5. What Is Acceptable At This Step

Accepted now:
- page-level navigation inside a section where more than one page exists
- page-aware direct-host rendering
- page-aware counter and location semantics
- honest section boundary transitions when reached

Still intentionally missing:
- restore
- search
- annotations
- selection
- bookmarks
- feature parity with the legacy route

## 6. Proof Boundary

Current proofs establish:
- `19686` has real intra-section page pagination in the new runtime
- `45` has runtime-owned page/location state and honest section-boundary behavior
- the route remains iframe-free at runtime boundary level

Current proofs do not establish:
- restore parity
- search parity
- annotation parity
- whole-reader no-iframe completion

## 7. Next-Step Readiness

This pagination model is sufficient to unblock the next runtime-capability step.

The next step may build on:
- runtime-owned page token
- runtime-owned page count
- runtime-owned page transitions
- runtime-owned direct-host render output

The next step still must not:
- remove iframe from the legacy route
- overclaim parity
- claim whole-reader completion
