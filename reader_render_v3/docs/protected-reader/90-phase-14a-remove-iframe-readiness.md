# 90. Phase 14A — Whole-Reader Remove-Iframe Readiness

## Scope

This is a readiness-only phase before any real iframe removal for the reader as a whole.

It exists to answer one question with code-backed evidence:
- is the project ready to begin a real remove-iframe migration for both unprotected and protected books?

It does **not**:
- remove iframe from any production or default route;
- claim whole-reader iframe-free completion;
- reinterpret protected completion as whole-reader completion;
- hide shared-runtime or proof-pack gaps.

## Evidence Inputs

Code areas audited:
- `reader/index.html`
- `reader/js/reader.js`
- `reader/js/fbreader-ui.js`
- `reader/js/unprotected-direct-view.js`
- `reader_render_v3/integration/*`
- `reader_render_v3/dev/*`
- `reader_render_v3/tools/internal/check-phase9-post-removal-proof.js`
- `reader_render_v3/tools/internal/check-phase10-cleanup-proof.js`
- `reader_render_v3/tools/internal/check-phase13-pagination-proof.js`
- `reader_render_v3/tools/internal/check-phase13-restore-proof.js`
- `reader_render_v3/tools/internal/check-phase13-unprotected-direct-parity.js`
- `reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js`
- `reader_render_v3/tools/internal/check-live-rollout-smoke.js`
- `reader_render_v3/tools/internal/check-live-protected-route.js`

Primary books used for readiness evidence:
- `19686`
  - single-chunk protected artifact
  - single-spine unprotected direct happy-path proof
- `45`
  - unprotected multi-spine / cover-wrapper / long TOC / restore-sensitive edge case

Route environments exercised:
- localhost
- preview

## Exact Readiness Conclusion

Current decision:
- **NO-GO for real whole-reader iframe removal**

Exact reason:
- protected path is operationally much closer to iframe-free end-state and remains green;
- unprotected direct path is proven only on the limited `19686` corpus slice;
- unprotected direct path is **not** removal-ready across the minimal edge-case corpus;
- shared old-reader runtime still encodes many iframe-default assumptions in boot, swipe neighbors, theme application, search hookup, and page-counter/global-page reconstruction;
- proof tooling is strong enough to reject false readiness, but not yet sufficient to certify whole-reader removal readiness as green across the required corpus.

## Findings

### 1. Unprotected path

What is already proven:
- explicit direct route exists: `unprotectedRenderHost=direct`
- direct route on `19686` is real and iframe-free at runtime
- on `19686`, direct route has real pagination, real restore, TOC jump, search submit, and theme toggle parity on localhost and preview
- bridge is not a critical operational dependency for the audited unprotected old-route desktop flows

What is not yet proven:
- unprotected direct path is safe as a removal target across the minimal edge-case corpus
- multi-spine / cover-wrapper / long-TOC books are removal-ready
- page-label/global-page behavior is deterministic enough across those books for iframe removal

Observed edge-case failure on `45`:
- direct route still mounts and paginates, but emits repeated runtime errors:
  - `Cannot read properties of undefined (reading 'package')`
- direct restore proof on `45` is green only for the direct route, while the current iframe baseline and shell page-counter semantics diverge under the same generic restore tooling
- the current generic pagination proof also reports `iframe-pagination` red on the cover-wrapper baseline because the baseline route does not satisfy the generic `paginatedColumnsFormed` heuristic on the cover wrapper

Engineering implication:
- unprotected direct path is **partially ready**, not removal-ready
- remaining work is not just iframe deletion; it is hardening for multi-spine runtime correctness and edge-case proof coverage

### 2. Protected path

What is proven:
- protected runtime no longer depends on iframe as a live runtime transport
- protected runtime no longer depends on bridge as a live runtime transport
- localhost protected build/validate are green
- localhost protected post-removal and cleanup proofs are green
- preview protected rollout smoke and protected route smoke are green

No active protected runtime iframe blocker was found in:
- boot
- display
- restore
- TOC jump
- search
- theme/layout

Protected-path caveat:
- some shared tooling and shared runtime code still retain iframe-era assumptions for the old reader shell
- those assumptions are now whole-reader blockers only when they affect unprotected or shared removal sequencing

### 3. Shared reader runtime

Shared-runtime blocker layer still exists in:
- `reader/js/reader.js`
- `reader/js/fbreader-ui.js`

The code still encodes iframe-default architecture through:
- `book.renderTo("viewer")`, `book.renderTo("viewer-prev")`, `book.renderTo("viewer-next")`
- iframe-local swipe/tap attachment
- iframe scanning and mutation-observer rescue logic
- iframe-targeted theme propagation
- iframe-targeted search CSS/highlight hookup
- neighbor-preview underlay model centered on iframe-backed layers
- page-counter/global-page reconstruction with transient multi-display cascades

This means:
- protected completion does not yet imply whole-reader runtime simplification
- real iframe removal still needs a scoped shared-runtime hardening step before deletion is safe

## Areas With No Gating Blocker Found

| Area | Mode | Finding |
| --- | --- | --- |
| Protected runtime transport | protected | No active iframe runtime dependency found |
| Protected bridge transport | protected | No active bridge runtime dependency found |
| Unprotected bridge dependency | unprotected | No critical bridge dependency found for audited old-route desktop flows |
| Protected localhost/preview operational proof | protected | Green on required routes checked in this phase |

## Exact Blocker Register

| blocker_id | short_title | exact file(s) | exact function/module/path | affected mode | impact | severity | why it blocks iframe removal | required before real removal? | recommended fix direction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WR-001 | Multi-spine direct runtime emits package errors | `reader/js/reader.js` | `isRtlReadingOrderSafe()` call paths reached during direct old-reader runtime on multi-spine books | unprotected | display | gating | Direct route on `45` repeatedly throws `Cannot read properties of undefined (reading 'package')`; removal cannot proceed while direct runtime still throws on corpus books that must survive iframe deletion | yes | isolate the offending code path so direct route never dereferences missing `book/package` state during multi-spine section churn |
| WR-002 | Unprotected direct proof only green on limited corpus | `reader_render_v3/tools/internal/check-phase13-pagination-proof.js`, `reader_render_v3/tools/internal/check-phase13-restore-proof.js`, `reader/js/unprotected-direct-view.js`, `reader/js/reader.js` | Phase-13 direct proof pack exercised successfully on `19686`, not on `45` | unprotected | rollout | gating | Whole-reader removal readiness cannot be claimed when direct path is certified only on a single-spine happy-path book | yes | harden direct runtime against multi-spine/cover-wrapper books and expand required corpus gate beyond `19686` |
| WR-003 | Iframe-default neighbor preview architecture still active | `reader/js/reader.js` | `book.renderTo("viewer-prev")`, `book.renderTo("viewer-next")`, swipe neighbor readiness and underlay code | unprotected | navigation | gating | Real iframe removal needs a non-iframe navigation/preview model or an explicit decision to remove this behavior without UX regression; current default old-reader runtime still assumes iframe neighbor layers | yes | replace neighbor-preview ownership with direct-host-safe model before deletion |
| WR-004 | Search hookup still encodes iframe-content assumptions | `reader/js/fbreader-ui.js` | `ensureSearchHlCss`, `scanIframes`, rendition content hooks around iframe docs | unprotected | search | major | Search logic still treats iframe docs as first-class runtime surfaces; removal without replacing these assumptions risks search highlight and attach drift | yes | define direct-first search/highlight hookup and demote iframe scanning to legacy-only path before removal |
| WR-005 | Theme/layout propagation still includes iframe-specific path | `reader/js/reader.js` | `applyThemeToDoc`, iframe scanning, `renditionPrev/Next.themes.*` propagation | both | theme, reflow | major | Shared runtime still prefers iframe-local theme propagation and neighbor rendition propagation; removal without simplification risks divergent layout/theme behavior | yes | split default direct-host theme pipeline from legacy iframe path and remove iframe-first propagation assumptions only after proof is green |
| WR-006 | Page counter / global-page proof not deterministic across corpus | `reader/js/reader.js`, `reader_render_v3/tools/internal/check-phase13-pagination-proof.js`, `reader_render_v3/tools/internal/check-phase13-restore-proof.js` | global page map rebuild, `#page-count` recovery, multi-display restore/display cascades | both | restore, navigation, rollout | gating | Removal-ready default direct path requires deterministic enough page/restore lifecycle; on `45`, current baseline/proof behavior shows page-counter ambiguity (`…/…`) and multiple display cascades | yes | stabilize page-count/global-page semantics across cover wrappers and multi-spine reloads, then update proof gates accordingly |
| WR-007 | Touch/swipe model still depends on iframe-local listeners | `reader/js/reader.js` | `attachSwipeToDoc`, `attachUiTapToDoc`, iframe document attach/rescan paths | unprotected | navigation, selection | major | A real iframe-free default cannot still depend on iframe-local input hooks | yes | move old-reader input delivery to direct-host-safe attachment model and keep iframe path behind legacy fallback until removal phase |
| WR-008 | Internal old-reader proof pack lacks explicit whole-reader remove-iframe corpus gate | `reader_render_v3/tools/internal/check-phase13-pagination-proof.js`, `reader_render_v3/tools/internal/check-phase13-restore-proof.js`, `reader_render_v3/tools/internal/check-phase13-unprotected-direct-parity.js` | current proof scripts target route parity, not final removal readiness across minimal corpus | both | rollout | major | Existing proof pack can certify a happy path and still miss whole-reader blockers | yes | add a remove-iframe readiness matrix gate that requires localhost + preview green on the minimal corpus for both protected and unprotected relevant routes |
| WR-009 | Current iframe baseline itself exposes restore/page-label inconsistency on edge corpus | `reader/js/reader.js`, `reader_render_v3/tools/internal/check-phase13-restore-proof.js` | iframe route reload on `45` | unprotected | restore | major | Removal readiness cannot be certified while the baseline semantics used for parity are themselves unstable on edge corpus | yes | separate product bug vs proof heuristic; either stabilize baseline page-count semantics or scope the parity oracle more precisely before removal |
| WR-010 | Shared old-reader shell still carries iframe-era rescue complexity | `reader/js/fbreader-ui.js`, `reader/js/reader.js` | iframe mutation observers, iframe scans, contentDocument rescue paths | both | boot, display, rollout | minor | Not every rescue path is a live blocker by itself, but the accumulated complexity is a risk multiplier during deletion | no | keep until replacement is proven, then remove in the real removal phase under proof gating |

## Proof Coverage Status

### Green now

Localhost:
- `npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686`
- `npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686`
- `node reader_render_v3/tools/internal/check-phase9-post-removal-proof.js`
- `node reader_render_v3/tools/internal/check-phase10-cleanup-proof.js`
- `node reader_render_v3/tools/internal/check-phase13-pagination-proof.js`
- `node reader_render_v3/tools/internal/check-phase13-restore-proof.js`
- `node reader_render_v3/tools/internal/check-phase13-unprotected-direct-parity.js`
- `node reader_render_v3/tools/internal/check-live-rollout-smoke.js --base-url=http://127.0.0.1:8788 --reader-path=/reader/`
- `node reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js --url='http://127.0.0.1:8788/reader/?id=19686'`

Preview:
- `node reader_render_v3/tools/internal/check-live-rollout-smoke.js --base-url='https://codex-phase12-unprotected-re.reader-books.pages.dev' --reader-path=/reader/`
- `node reader_render_v3/tools/internal/check-live-protected-route.js --url='https://codex-phase12-unprotected-re.reader-books.pages.dev/reader/?id=19686&reader=protected&renderMode=shape&metricsMode=shape&_cb=20260413_readiness'`
- `node reader_render_v3/tools/internal/check-phase13-pagination-proof.js --iframe-url='https://codex-phase12-unprotected-re.reader-books.pages.dev/reader/?id=19686&_cb=20260413_restore' --direct-url='https://codex-phase12-unprotected-re.reader-books.pages.dev/reader/?id=19686&unprotectedRenderHost=direct&_cb=20260413_restore'`
- `node reader_render_v3/tools/internal/check-phase13-restore-proof.js --iframe-url='https://codex-phase12-unprotected-re.reader-books.pages.dev/reader/?id=19686&_cb=20260413_restore' --direct-url='https://codex-phase12-unprotected-re.reader-books.pages.dev/reader/?id=19686&unprotectedRenderHost=direct&_cb=20260413_restore'`
- `node reader_render_v3/tools/internal/check-phase13-unprotected-direct-parity.js --iframe-url='https://codex-phase12-unprotected-re.reader-books.pages.dev/reader/?id=19686&_cb=20260413_restore' --direct-url='https://codex-phase12-unprotected-re.reader-books.pages.dev/reader/?id=19686&unprotectedRenderHost=direct&_cb=20260413_restore'`
- `node reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js --url='https://codex-phase12-unprotected-re.reader-books.pages.dev/reader/?id=19686&_cb=20260413_restore'`

### Red or partial now

- `node reader_render_v3/tools/internal/check-phase13-pagination-proof.js --iframe-url='http://127.0.0.1:8788/reader/?id=45' --direct-url='http://127.0.0.1:8788/reader/?id=45&unprotectedRenderHost=direct'`
  - red:
    - `iframe-pagination`
  - warnings:
    - page-counter labels diverge between iframe and direct
    - direct `currentLocation().start.displayed.total` diverges from shell page counter
  - direct route also emits repeated `Cannot read properties of undefined (reading 'package')`

- `node reader_render_v3/tools/internal/check-phase13-restore-proof.js --iframe-url='http://127.0.0.1:8788/reader/?id=45' --direct-url='http://127.0.0.1:8788/reader/?id=45&unprotectedRenderHost=direct'`
  - red:
    - `iframe-restore`
  - warning:
    - iframe/direct next-reload page-counter divergence
  - direct route restores, but still emits repeated `package` errors
  - iframe baseline reload lands on correct content CFI while shell page counter degrades to `…/…`

### Exact proof-pack gap

Current scripts are sufficient to say **NO-GO**.
Current scripts are **not** sufficient to say **GO**, because they do not yet produce a corpus-level whole-reader remove-iframe certification artifact.

Required readiness proof pack still missing:
- a whole-reader remove-iframe readiness matrix that runs:
  - protected routes
  - unprotected iframe baseline routes
  - unprotected direct routes
  - minimal corpus set beyond `19686`
  - localhost and preview
- explicit hidden iframe-dependency detection on shared runtime after unprotected default flips in the future removal phase

## Minimal Content Corpus Needed Before Real Removal

Required:
- `19686`
  - single-spine / restore-safe / protected artifact coverage
- `45`
  - cover wrapper
  - many spine items
  - long TOC
  - reload-restore sensitivity
  - image-heavy front matter and anchor-heavy structure

Still missing from convenient audited set:
- explicit protected edge-case artifact with internal-anchor-heavy content beyond `19686`
- a compact footnote-heavy unprotected book already wired into the current proof scripts

Readiness implication:
- the current corpus is enough to block a false GO
- it is not enough to certify full GO for whole-reader iframe removal

## Exact Go / No-Go Criteria For Real Removal Phase

Removal phase may start only if all conditions below are true:

1. Protected runtime remains green on localhost and preview for:
- build/validate
- protected route smoke
- post-removal proof
- cleanup proof

2. Unprotected direct route is green on localhost and preview for the minimal corpus:
- `19686`
- `45`
- and any newly added footnote/anchor-heavy book if introduced into the proof pack

3. No unresolved `gating` blocker remains in this document with `required before real removal = yes`.

4. Unprotected direct route has no repeated runtime errors on the readiness corpus.

5. Page counter / restore / navigation lifecycle is deterministic enough that:
- `currentLocation()`
- page counter
- reload restore
- TOC jump restore
- internal link jump
remain coherent on the readiness corpus.

6. Shared runtime no longer relies on iframe-only input/search/theme rescue paths as required operational behavior for the route that is about to lose iframe.

7. Localhost and preview agree on required direct-only relevant routes.

8. The blocker register has been updated and shows no unresolved whole-reader `gating` blocker.

If any of the above is false:
- removal phase is **NO-GO**

## Exact Migration Plan For The Next Real Removal Phase

### Step 1 — Unprotected edge-case hardening
- Goal: make unprotected direct route runtime-safe on the minimal corpus
- Files/modules:
  - `reader/js/reader.js`
  - `reader/js/unprotected-direct-view.js`
  - narrowly `reader/js/fbreader-ui.js` if direct runtime hooks must move
- Green before:
  - current `19686` direct proof pack
  - protected guardrails
- Green after:
  - `check-phase13-pagination-proof.js` green on `19686` and `45`
  - `check-phase13-restore-proof.js` green on `19686` and `45`
  - no repeated runtime errors on direct `45`
- Done means:
  - direct route is corpus-safe enough to be considered for defaulting later
- Risk note:
  - do not remove iframe here; only remove blockers

### Step 2 — Shared runtime de-iframe hardening
- Goal: replace required iframe-default assumptions with direct-host-safe ownership
- Files/modules:
  - `reader/js/reader.js`
  - `reader/js/fbreader-ui.js`
- Green before:
  - Step 1 complete
- Green after:
  - direct route no longer needs iframe scanning for required search/theme/input behavior
  - old iframe path still non-regressed while both paths coexist
- Done means:
  - required operational behavior is direct-host-native, not iframe-rescued
- Rollback note:
  - keep iframe path alive until proof pack is green

### Step 3 — Whole-reader readiness proof expansion
- Goal: turn current route proofs into explicit removal gates
- Files/modules:
  - `reader_render_v3/tools/internal/check-phase13-pagination-proof.js`
  - `reader_render_v3/tools/internal/check-phase13-restore-proof.js`
  - `reader_render_v3/tools/internal/check-phase13-unprotected-direct-parity.js`
  - new readiness matrix script if needed
- Green before:
  - Steps 1 and 2 complete
- Green after:
  - localhost + preview minimal corpus green
  - protected + unprotected required routes all green
- Done means:
  - proof pack can block false removal and certify true readiness

### Step 4 — Default flip preparation without deletion
- Goal: prove direct unprotected path can act as default candidate without deleting iframe fallback
- Files/modules:
  - route/bootstrap files in `reader/index.html` and `reader/js/reader.js`
- Green before:
  - Step 3 complete
- Green after:
  - default-candidate direct route green under explicit flag
  - iframe fallback still available
- Done means:
  - removal phase can start from a proven direct default candidate

### Step 5 — Real iframe removal phase
- Goal: remove iframe dependency from unprotected and collapse shared runtime away from iframe-default architecture
- Files/modules:
  - `reader/index.html`
  - `reader/js/reader.js`
  - `reader/js/fbreader-ui.js`
  - route/bootstrap and any obsolete fallback tooling
- Green before:
  - all go criteria above green
- Green after:
  - unprotected reader no longer depends on iframe
  - protected reader remains iframe-free
  - shared runtime no longer preserves iframe-default architecture
  - whole-reader no-iframe claim becomes technically supportable
- Rollback note:
  - only safe once the direct path is already certified on the required corpus

## Claims Boundary After This Readiness Phase

### Claims supported now
- protected path is closer to final iframe-free architecture than unprotected
- protected runtime path is already free of active iframe runtime dependency
- unprotected direct path is real and works on the audited `19686` route set
- whole-reader remove-iframe readiness is **not yet achieved**

### Claims not supported now
- unprotected direct path is removal-ready
- protected path alone is enough to start whole-reader iframe removal
- whole reader is iframe-free
- unprotected iframe removal is done
- protected iframe removal is done as a whole-reader claim
- whole-reader no-iframe completion already achieved

### Claims reserved for the real removal phase and later closeout
- unprotected reader no longer depends on iframe
- protected and unprotected runtimes are both free of iframe-default architecture
- obsolete iframe-era fallback code can be removed
- final whole-reader no-iframe claim is technically supportable

## Final Status

- **NO-GO**

Current project state is not ready for the next real remove-iframe migration phase.

Exact readiness state:
- protected path: operationally ready, with no active runtime iframe dependency found
- unprotected direct path: partially ready, not removal-ready across the minimal corpus
- shared runtime: still carries iframe-default blocker layer
- proof pack: strong enough to block false progress, not yet strong enough to certify real whole-reader removal readiness
