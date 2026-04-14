# 91. Unprotected Runtime Replacement Architecture

## Scope

This document records the architectural pivot for the unprotected no-iframe track.

It defines:
- why the legacy unprotected runtime is not a portable base for no-iframe migration;
- what the replacement target model is;
- what runtime contract must exist before implementation;
- how `Phase 13` and `Phase 14` change after the pivot.

It does **not**:
- implement the new runtime;
- remove iframe from any live route;
- continue the old strategy of patching EPUB.js direct-host behavior;
- claim whole-reader no-iframe completion.

## 1. Why The Legacy Unprotected Runtime Is Not Portable

### 1.1. Layout and pagination are iframe-coupled

The current old-reader unprotected runtime is built around:
- `book.renderTo("viewer")`
- `book.renderTo("viewer-prev")`
- `book.renderTo("viewer-next")`
- iframe-backed rendition views
- iframe-local swipe neighbor ownership

Observed coupling points:
- `reader/js/reader.js`
  - `book.renderTo("viewer", ...)`
  - `book.renderTo("viewer-prev", ...)`
  - `book.renderTo("viewer-next", ...)`
  - neighbor preview readiness / underlay lifecycle
  - iframe-local theme propagation
- `reader/js/fbreader-ui.js`
  - iframe scans
  - iframe-targeted attach/re-attach logic

This is not a surface-level rendering detail.
It is the current layout, navigation, and underlay model.

### 1.2. Input delivery is iframe-coupled

Current old-reader input model depends on:
- iframe-local tap/swipe listeners
- iframe document re-attachment after relocation
- mutation-observer rescue logic when iframe docs are recreated

Observed coupling points:
- `attachSwipeToDoc(...)`
- `attachUiTapToDoc(...)`
- iframe mutation scanning in `reader.js`

Meaning:
- direct host cannot be treated as a drop-in swap for the old runtime;
- the current input model assumes iframe document boundaries as the primary delivery path.

### 1.3. Search is DOM- and iframe-coupled

Current search/highlight behavior depends on:
- iframe content documents
- injected CSS into iframe-owned docs
- iframe rescans after relocation

Observed coupling points:
- `ensureSearchHlCss(...)`
- `scanIframes()`
- content-document attach hooks in `fbreader-ui.js`

Meaning:
- the current search model is not runtime-contract-first;
- it is tied to DOM ownership under iframe-backed rendition views.

### 1.4. Theme and layout propagation are iframe-coupled

Current theme/layout behavior still propagates through:
- `rendition.themes.*`
- neighbor iframe renditions
- iframe document theme application

Meaning:
- theme is not just shell state;
- the old runtime still treats iframe-backed views as the actual layout ownership boundary.

### 1.5. Multi-spine behavior exposes structural fragility

Observed on book `45`:
- repeated runtime errors:
  - `Cannot read properties of undefined (reading 'package')`
- direct route can appear partially functional on a happy path while remaining structurally unsafe on edge corpus content

This is the practical proof that the legacy model does not become removal-ready by incremental patching.

### 1.6. Navigation and restore are coupled to legacy display cascades

Current runtime still relies on:
- multiple `display(...)` cascades
- global page map reconstruction
- shell page-counter recovery logic
- route/bootstrap timing that was designed around legacy EPUB.js lifecycle

Meaning:
- restore correctness and location stability are not owned by a clean runtime core;
- they emerge from a legacy interaction between shell, rendition, iframe docs, and recovery code.

## 2. Exact Dependencies That Make The Legacy Runtime Non-Portable

The legacy unprotected runtime is considered non-portable because it depends on all of the following classes of assumptions:

### 2.1. Runtime boundary assumptions
- iframe-backed `renderTo(...)` views are the default render boundary
- iframe docs are treated as the main source for interaction hooks
- content ownership is discovered through `contentDocument`, not through runtime-owned render state

### 2.2. Navigation assumptions
- prev/next underlay model depends on neighbor iframe renditions
- page-turn readiness depends on pre-rendered iframe neighbors
- relocation recovery depends on iframe/view churn behavior

### 2.3. Search assumptions
- search/highlight attach path is DOM/iframe-driven
- search styling is injected into docs discovered via iframe/view scanning

### 2.4. Theme assumptions
- theme is applied through rendition/iframe view propagation
- shell theme and runtime layout are joined through iframe-era hooks

### 2.5. Input assumptions
- touch and swipe lifecycle are attached inside iframe docs
- selection-related attach points assume iframe-local documents

### 2.6. Proof and recovery assumptions
- parity is measured against the old iframe lifecycle
- recovery code compensates for iframe churn instead of avoiding iframe dependence by design

## 3. Why Fixing The Legacy Model Does Not Scale

The old strategy was:
- introduce a direct host under a flag;
- keep patching the EPUB.js-based old runtime until it works without iframe.

This is now explicitly rejected.

Why it does not scale:
- every fix preserves the old ownership model instead of replacing it;
- edge cases are not independent bugs, they are symptoms of iframe-first design;
- multi-spine correctness, search behavior, theme/layout propagation, and input delivery are all coupled;
- proof stays reactive: green on one corpus slice, red on another;
- reader shell remains forced to understand legacy display side-effects;
- the system accumulates more hybrid complexity without approaching a stable removal point.

Decision:
- the legacy unprotected runtime is **not** the base for the no-iframe architecture;
- it remains the legacy path only;
- the no-iframe path must be implemented as a **new runtime layer**.

## 4. Target Model

The new unprotected runtime must:
- live under the same shell;
- use the same reader contract semantics as protected where possible;
- use a direct render host;
- have no iframe runtime boundary;
- have no dependency on `contentDocument`;
- own pagination, location, search state, annotations, and layout as runtime state;
- expose shell-safe events and state without DOM reconstruction heuristics.

Important rule:
- backend internals may differ;
- shell contract may not diverge.

Target whole-reader model after completion:
- shared shell
- protected runtime backend
- unprotected runtime backend
- same contract surface
- no iframe runtime boundary for either backend

## 5. Protected Vs Unprotected Runtime

### 5.1. What protected already solved

Protected runtime already provides the architectural pattern that the new unprotected runtime should follow:
- runtime-owned pagination
- runtime-owned rendering pipeline
- runtime-owned event model
- runtime-owned selection/copy model
- explicit state ownership
- no iframe runtime transport dependency

### 5.2. What can be reused

Reusable architecture patterns from protected:
- render model based on runtime-owned layout, not iframe-owned documents
- event model with explicit reader/runtime contract
- state model with runtime ownership and shell subscriptions
- layout pipeline where shell consumes summaries and state instead of reconstructing them from DOM boundaries
- direct render host ownership

### 5.3. What differs

Protected and new unprotected runtimes will still differ in:
- source data
  - protected: sealed chunks / protected artifacts
  - unprotected: EPUB-derived content
- ingestion pipeline
  - protected already has protected ingestion
  - unprotected will need EPUB-to-runtime ingestion suitable for the new runtime

Those differences are acceptable.
What is not acceptable is keeping iframe as the runtime boundary.

## 6. Unprotected Runtime Core API

The new unprotected runtime must expose a core API compatible in meaning with the protected runtime.

Minimum API:

### Boot / load
- `loadBook(bookId | manifestRef, options)`

### Location / navigation
- `goToLocation(location)`
- `nextPage()`
- `prevPage()`
- `getLocation()`

### Search
- `search(query, options)`
- `getSearchState()`

### Annotation
- `createHighlight(rangeDescriptor, options)`
- `addNote(rangeDescriptor, text, options)`
- `getAnnotations()`

### Appearance
- `setTheme(theme)`
- `setFontScale(scale)`

### Required contract properties
- no iframe dependency
- no `contentDocument` dependency
- runtime-owned pagination
- runtime-owned search state
- runtime-owned location state
- runtime-owned annotation state
- shell-visible events emitted from runtime state, not DOM inference

## 7. Responsibility Split

### UI shell owns
- toolbar
- sidebar
- search UI
- theme UI
- route and shell state
- presentation of runtime state

### Runtime owns
- pagination
- layout
- location
- search index and search state
- annotations
- selection geometry and selection state

Hard rules:
- no duplicated source of truth
- iframe cannot remain a source of truth
- shell must not reconstruct runtime truth from legacy DOM boundaries

## 8. Migration Boundary

### Legacy path
- remains in place
- stays default until new runtime reaches required parity
- is not to be ported further as the no-iframe strategy

### New path
- is built separately
- stays behind an explicit flag during implementation
- does not hybridize with the legacy runtime

Explicit anti-goal:
- no hybrid model where the new path still depends on iframe-era logic as required runtime behavior.

## 9. Phase 13–14 New Strategy

### Phase 13 (redefined)

Phase 13 is no longer:
- “make EPUB.js direct-host path behave without iframe”

Phase 13 is now:
- create the new unprotected runtime skeleton
- establish the new direct render host path behind a flag
- define the runtime/shell contract implementation path
- keep the legacy iframe path untouched and working

What Phase 13 must not do after the pivot:
- continue patching legacy EPUB.js direct-host behavior as the main strategy
- remove iframe
- claim feature parity

### Phase 14

Phase 14 becomes:
- implement features in the new unprotected runtime
- bring the new runtime to parity
- prove parity and stability
- only after that allow real iframe removal work

Meaning:
- `Phase 13` builds the new runtime path
- `Phase 14` completes features and certification
- iframe removal happens only after the new runtime is already the real replacement

## 9.1 Current Implementation Boundary After Phase 13.2

Current factual state on the new runtime path:
- runtime-owned pagination/location model exists;
- runtime-owned restore is green on the audited corpus;
- runtime-owned search is green on the audited corpus;
- selection state + toolbar wiring are green on the audited corpus;
- highlights / notes and bookmarks are green on the audited corpus;
- TOC jump and shell counter/theme/font wiring are green on the audited corpus.

Still not authorized:
- parity-complete runtime claim;
- iframe removal readiness claim;
- whole-reader no-iframe completion claim.

## 9.2 Corpus Hardening Result After Phase 13.3

Current factual certification result:
- the new runtime is green on the localhost corpus `19686`, `45`, and `19`;
- the new runtime is green on the preview expansion corpus `19686`, `45`, `77752`, and `77753`;
- no hidden iframe fallback was observed on the new route for the audited corpus;
- manual-package boot is now supported by the new runtime;
- manual-package search is now green on `19`.

Current factual limitation:
- the current workspace does not contain local mirrors for mapped preview IDs `77752` and `77753`;
- therefore expanded-corpus localhost certification is incomplete even though preview evidence is green.
- `id=19` is not cross-environment stable:
  - localhost `19` resolves to manual content;
  - preview `19` resolves to different Project Gutenberg content.

Architectural consequence:
- the runtime architecture remains on the correct replacement path;
- iframe-removal readiness is still **not** authorized until the local expanded-corpus certification gap is closed.

## 10. Risk Register

### R-001 Pagination correctness
- Risk: page boundaries and page identity differ from legacy expectations
- Response: runtime-owned pagination model with deterministic location contract

### R-002 Multi-spine handling
- Risk: spine transitions and cover-wrapper/front-matter behavior break parity
- Response: design multi-spine navigation in the new runtime as a first-class runtime problem, not as a patched iframe/view transition problem

### R-003 Search index vs DOM scan
- Risk: search remains coupled to rendered DOM
- Response: move to runtime-owned search state/index model; rendered DOM is presentation, not the search authority

### R-004 Selection geometry
- Risk: selection/copy/highlight geometry drifts without iframe-local assumptions
- Response: runtime-owned geometry and range descriptors, aligned with protected-style contract patterns

### R-005 Performance
- Risk: direct rendering and search indexing regress startup or interaction latency
- Response: keep ingestion/runtime boundaries explicit; prove perf under the new runtime path before default flip

### R-006 Memory
- Risk: direct runtime keeps too much rendered/search state in memory
- Response: design pagination, section loading, and search state with bounded caches and explicit lifecycle ownership

## 11. Exact Next Step

After this pivot, the next implementation step is:
- build the new unprotected runtime skeleton behind a flag

It is **not**:
- fix more EPUB.js direct-host edge cases
- keep porting the legacy iframe runtime
- start iframe removal

## 12. Final Decision

The legacy unprotected runtime is now officially treated as:
- legacy-only

## 13. Observed Skeleton Realization Boundary

The first redefined `Phase 13` implementation step has now established the new runtime as a real route, not only a paper architecture.

Observed facts:
- explicit route flag: `unprotectedRuntime=new`
- direct render host is mounted without iframe runtime boundary
- runtime-owned state exists independently of the legacy EPUB.js iframe path
- runtime-owned API exists with honest `not_implemented` responses for incomplete features
- runtime event surface exists and is shell-facing
- legacy route remains default and untouched

Current realized capability boundary:
- implemented:
  - `loadBook()`
  - `goToLocation()`
  - `nextPage()`
  - `prevPage()`
  - `getLocation()`
  - `setTheme()`
  - `setFontScale()`
  - direct-host loading / ready / error lifecycle
  - page-level location model
  - page-level pagination state
  - direct-host page rendering
  - section-boundary transitions through the new runtime
- intentionally skeletal:
  - `search()`
  - `getSearchState()`
  - `createHighlight()`
  - `addNote()`
  - `getAnnotations()`
  - restore

Meaning:
- the architectural pivot is now embodied in code;
- it is still only a skeleton;
- the next implementation step must add runtime capability, not fall back to more legacy EPUB.js direct-host patching.
- non-portable to the target no-iframe architecture

The new unprotected no-iframe path must therefore be:
- a runtime replacement
- contract-first
- direct-host-native
- separate from the legacy iframe runtime until parity is proven

## 13. Observed Skeleton Realization Boundary

After the first implementation step, the architecture should be read like this:
- the new runtime path may exist before parity;
- skeleton existence is not feature completion;
- legacy path must remain untouched and default;
- missing features must stay explicit in runtime capabilities, not be hidden behind fake success.

Execution artifact for the first implementation step:
- `reader_render_v3/docs/protected-reader/92-phase-13-redefined-unprotected-runtime-skeleton-execution.md`
