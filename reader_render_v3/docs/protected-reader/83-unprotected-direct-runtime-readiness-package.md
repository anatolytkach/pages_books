# 83. Unprotected Direct Runtime Readiness Package

## 1. Scope Of This Package

This package defines what must be known before unprotected no-iframe implementation work begins.

It is not an implementation report.
It is not a completion report.
It is not permission to remove the iframe.

## 2. Current Architectural Baseline

Current proven state:
- protected migration track is complete;
- protected live path no longer depends on bridge/iframe runtime transport;
- unprotected path remains live on a legacy iframe-backed runtime model;
- unprotected shell contract is non-regressed and verified;
- whole-reader no-iframe claim remains forbidden.

Current unprotected architectural fact:
- the iframe serving unprotected books is still part of the active architecture;
- removal is required later work, not optional cleanup;
- that removal does not start in `Phase 12`.

## 3. Phase-12 Runtime Readiness Objective

`Phase 12` must answer these questions with evidence:
- what exact unprotected runtime responsibilities currently sit behind iframe boundaries;
- which of those responsibilities are critical for user-visible behavior;
- which bridge-adjacent or message-adjacent helpers are operational vs incidental;
- what direct runtime host contract is required before a no-iframe host can exist;
- what must be proven before `Phase 13` is allowed to begin.

## 4. Inventory Plan For Unprotected Iframe Touchpoints

The execution pass produced the following baseline:
- current unprotected route is still the old-reader route;
- current unprotected live path uses three iframe-backed rendition surfaces;
- current unprotected shell event vocabulary exists, but state is emitted with `source: "legacy-shell"`;
- current bridge-adjacent fullscreen helpers were observed as present but not critical in the audited desktop flows on localhost and preview.

The concrete audit record is:
- `reader_render_v3/docs/protected-reader/86-phase-12-unprotected-iframe-dependency-audit.md`

The inventory enumerates:

### 4.1 Route bootstrap touchpoints
- standard unprotected route entry;
- route parsing / open-book flow;
- iframe creation and load ordering;
- reading-position restore bootstrap;
- shell readiness gating.

### 4.2 Runtime command touchpoints
- page navigation commands;
- TOC navigation commands;
- search submit / next / prev / clear;
- theme and typography application;
- bookmark and note actions where supported;
- share/export related shell requests where applicable.

### 4.3 State and event touchpoints
- page / reading-position state;
- search state;
- selection state if applicable;
- annotations/bookmark counters;
- sidebar/top-bar state reflection;
- any summary-sync or polling-based state reconstruction still used on unprotected path.

### 4.4 Rendering and interaction touchpoints
- iframe-hosted rendering surface;
- coordinate space boundary;
- pointer / touch delivery path;
- selection geometry and overlay behavior where applicable;
- search highlight and note focus visibility.

### 4.5 Persistence and integration touchpoints
- reading-position persistence;
- notes/bookmarks persistence where supported;
- share/export payload preparation;
- shell-visible route reconstruction behavior.

### 4.6 File and module inventory plan
The Phase 12 audit must explicitly walk these code areas:
- `reader/index.html`
  - unprotected route shell entry and iframe bootstrap assumptions
- `reader/js/reader.js`
  - old reader orchestration, open-book lifecycle, route bootstrap, persistence hooks
- `reader/js/fbreader-ui.js`
  - search, theme, sidebar, bookmark, shell event, bridge-adjacent and iframe-adjacent helpers
- `reader_render_v3/integration/*`
  - shared routing or migration-era integration code that may still affect unprotected shell behavior
- `reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js`
  - current audit baseline and what it does not yet prove about iframe removal readiness
- `reader_render_v3/docs/protected-reader/68-unprotected-no-iframe-completion-strategy.md`
  - claim boundary and reserved work for later phases

Each touched area must be classified as:
- current unprotected live-path dependency;
- shared shell dependency;
- protected-only and irrelevant to unprotected migration;
- future migration surface for Phase 13/14;
- keep-now legacy boundary.

## 5. Dependency Classification Model

Every touchpoint in the audit is classified as one of:
- critical blocker for Phase 13;
- migration-required but non-blocking;
- legacy wrapper only;
- verification-only dependency;
- dead residue / removable later;
- false dependency.

Execution outcome:
- `book.renderTo("viewer" | "viewer-prev" | "viewer-next")`: critical blocker for Phase 13
- iframe-local touch/swipe attachment in `reader.js`: critical blocker for Phase 13
- iframe-local search/highlight lifecycle in `fbreader-ui.js`: critical blocker for Phase 13
- shared event hub in `fbreader-ui.js`: false dependency
- `__tryFsFromIframe` / `fb_user_gesture`: legacy wrapper only for the audited scope
- `check-unprotected-bridge-dependency.js`: verification-only dependency

## 6. Critical Unprotected Surfaces That Must Be Mapped

### 6.1 Event surfaces
- page changed
- reading position changed
- search state changed
- theme changed
- sidebar state changed
- bookmark updated
- annotations changed
- selection changed where meaningful on unprotected path

### 6.2 State surfaces
- current page label / total
- TOC active item
- search query / count / active result
- theme / font mode / font scale
- note/bookmark counters
- route/open state
- persisted reading-position state

### 6.3 Transport surfaces
- shell-to-iframe messages
- iframe-to-shell messages
- direct DOM coupling
- shared global helpers
- bridge-adjacent helpers that still influence unprotected behavior

### 6.4 Rendering surfaces
- reading surface root
- overlay surfaces
- toolbar anchor behavior
- search highlight visibility
- note/bookmark focus visibility
- page-turn and resize behavior

### 6.5 Feature surfaces
- navigation
- TOC
- search
- theme
- typography
- notes/bookmarks
- share/export semantics
- persistence and restore

## 7. Direct Runtime Host Requirements For Unprotected Path

Before `Phase 13`, unprotected direct host requirements must be explicit:
- no iframe boundary for runtime integration;
- same shell-level route semantics;
- same shell-level event vocabulary where shared;
- direct state delivery to shell without iframe-only synchronization assumptions;
- direct rendering host ownership defined;
- pointer/touch delivery path defined;
- persistence and share/export semantics preserved;
- security invariants preserved;
- no accidental protected-specific contract leakage.

Readiness map after the execution pass:
- boot/host contract must replace old-route bootstrap and `renderTo(...)` viewer ownership;
- rendering contract must replace iframe-backed rendition surfaces and neighbor-preview layers;
- event contract can reuse the shared shell vocabulary, but producer ownership must move away from `legacy-shell` reconstruction;
- navigation contract must preserve `rendition.display(...)` semantics while changing the host boundary;
- TOC/search contract must stop assuming iframe content-doc scanning;
- selection/annotation/copy contract must stop assuming iframe-local content documents as the only event/selection source;
- persistence contract must preserve reading-position and bookmark semantics without iframe lifecycle dependence;
- toolbar/theme/layout contract must stop depending on iframe theme hooks and iframe-local touch delivery.

## 8. Risk Map For Direct Runtime Adoption

### High-risk
- route bootstrap tied to iframe load ordering;
- hidden summary/polling dependencies;
- search lifecycle tied to iframe-internal state reconstruction;
- coordinate-space assumptions baked into overlays or selection behavior;
- persistence or restore logic coupled to iframe lifecycle;
- share/export payload preparation coupled to old route structure.

Execution findings refine the high-risk list:
- route bootstrap is still old-reader-only and has no direct-host entry;
- search highlight lifecycle currently injects CSS into iframe docs and rescans iframe creation;
- touch/page-turn behavior currently attaches listeners inside iframe documents because those events do not bubble to the parent shell;
- theme application still explicitly targets iframe content via `rendition.themes`.

### Medium-risk
- theme / typography state drift between shell and runtime;
- TOC active-state synchronization;
- sidebar/list refresh timing;
- bookmark counters and shell indicators;
- preview vs localhost divergence due to route/bootstrap timing.

### Lower-risk but still required
- non-critical bridge-adjacent helpers;
- diagnostics that must stay readable during migration;
- unused legacy code that should remain untouched until proven removable.

## 9. Proposed Verification Matrix

Phase 12 must define the matrix that later phases will use.

### 9.1 Route and bootstrap
- open book
- reload same route
- restore reading position
- preview route stability

### 9.2 Navigation and TOC
- next / prev
- TOC open / jump / return
- repeated navigation after theme and search activity

### 9.3 Search
- open / submit / next / prev / clear
- return behavior where supported
- shell-visible state parity
- highlight visibility

### 9.4 Selection and toolbar
- selection if applicable on unprotected path
- toolbar appearance and anchor behavior if applicable
- copy-related shell behavior if applicable

### 9.5 Notes, bookmarks, annotations
- note create / delete / list refresh if supported
- bookmark create / delete / list refresh
- note or bookmark jump / focus
- persistence across reload where supported

### 9.6 Theme and typography
- light / dark cycles
- font mode
- font scale
- search and bookmark state survival after cycles

### 9.7 Share, persistence, copy surface
- share/export shell semantics where applicable
- reading-position persistence
- annotation persistence where applicable
- copy surface hardening and no hidden DOM text

### 9.8 Non-regression guardrails
- protected live path still green
- protected docs/claims remain unchanged
- preview and localhost do not diverge

Current evidence-backed baseline for the future matrix:
- localhost and preview old-route behavior are aligned for open/navigate/TOC/search/theme/bookmark/sidebar flows;
- current bridge-adjacent helpers are not the main blocker;
- current iframe-backed rendition/search/touch/theme ownership is the main blocker.

## 10. Route And Command Expectations For Future Validation

Future validation must at minimum include:

### Localhost
- standard unprotected route
- any future flagged direct-runtime unprotected route
- protected live route as guardrail

### Preview
- published unprotected route
- future flagged direct-runtime unprotected route if introduced
- protected live route as guardrail

### Expected command families
- build / validate commands where relevant to shared packaging
- browser-level route and parity runners
- unprotected dependency audit runner
- security and copy-surface runners
- persistence and route-stability runners

### Expected concrete validation commands
The future implementation branch should expect at minimum:
- `node reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js --url=...`
- `node reader_render_v3/tools/internal/check-live-rollout-smoke.js --base-url=... --reader-path=/reader/`
- `node reader_render_v3/tools/internal/check-protected-reader-readiness.js --url=... --live-url=... --expect-live-protected=true`
- `node reader_render_v3/tools/internal/run-pilot-readiness.js --localhost-base=... --live-base=...`
- `node reader_render_v3/tools/annotation-compat/check-copy-surface-hardening.js --url=...`
- any future `check-phase12/13/14-*` unprotected parity runners introduced by the implementation phases

Expected route families:
- localhost unprotected baseline:
  - `/reader/?id=<bookId>`
- preview unprotected baseline:
  - `/reader/?id=<bookId>&_cb=<cache-bust>`
- future flagged no-iframe unprotected route:
  - same shell route plus an explicit unprotected direct-host flag introduced no earlier than `Phase 13`

Commands used in this execution pass:
- `rg -n "reader=protected|protected-reader|viewer-prev|viewer-next|rendered inside an iframe|attachUiTapToDoc|attachSwipeToDoc|scanIframes|themes\\.select|__tryFsFromIframe|fb_user_gesture|__READERPUB_READER_EVENTS__|ensureSearchHlCss|getContents\\(|MutationObserver|selectedRange|BookmarksController|TocController|rendition\\.display\\(" reader/index.html reader/js/reader.js reader/js/fbreader-ui.js`
- `sed -n '1,140p' reader/index.html`
- `sed -n '3338,3435p' reader/js/reader.js`
- `sed -n '4288,5795p' reader/js/reader.js`
- `sed -n '1600,1765p' reader/js/fbreader-ui.js`
- `sed -n '1880,1995p' reader/js/fbreader-ui.js`
- `sed -n '5208,5325p' reader/js/fbreader-ui.js`
- `sed -n '1,260p' reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js`
- `node reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js --url='http://127.0.0.1:8788/reader/?id=19686'`
- `node reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js --url='https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&_cb=20260413_phase12a'`
- `node reader_render_v3/tools/internal/check-live-rollout-smoke.js --base-url=http://127.0.0.1:8788 --reader-path=/reader/`
- `node reader_render_v3/tools/internal/check-live-rollout-smoke.js --base-url='https://codex-reader-render-v3.reader-books.pages.dev' --reader-path=/reader/`

## 11. What Must Be Proven Before Phase 13 Can Begin

`Phase 13` is blocked until all of the following are explicit:
- complete unprotected iframe touchpoint inventory;
- complete critical vs non-critical dependency classification;
- direct runtime host requirements agreed and documented;
- shell/event/state/transport/rendering/feature surfaces mapped;
- risk map documented with blockers called out;
- verification matrix defined for localhost and preview;
- claim discipline preserved in plan and claims docs.

## 12. Phase-12 Done Criteria Only

`Phase 12` is done when:
- the readiness package exists;
- the inventory and classification are specific enough to guide implementation;
- the boundary between `Phase 12`, `Phase 13`, and `Phase 14` is explicit;
- whole-reader and unprotected completion overclaims remain forbidden.

Execution result:
- readiness baseline established;
- dependency inventory and classification now evidence-backed;
- Phase 13 is still blocked on real iframe-host replacement work;
- unprotected iframe removal remains future implementation work.
