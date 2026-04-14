# 86. Phase 12 — Unprotected Iframe Dependency Audit

## 1. Audit Scope

This artifact records the actual unprotected iframe dependency baseline for `Phase 12`.

It answers only these questions:
- where unprotected runtime still depends on iframe-hosted execution;
- which dependencies are critical blockers for `Phase 13`;
- which dependencies are migration-required but non-blocking;
- which bridge-adjacent paths are only legacy wrappers or verification surfaces.

It does **not** claim:
- unprotected iframe removal is done;
- unprotected direct host exists;
- whole-reader no-iframe completion.

## 2. Evidence Sources

Static code inventory:
- `reader/index.html`
- `reader/js/reader.js`
- `reader/js/fbreader-ui.js`
- `reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js`

Runtime/browser evidence:
- `node reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js --url='http://127.0.0.1:8788/reader/?id=19686'`
- `node reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js --url='https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&_cb=20260413_phase12a'`
- `node reader_render_v3/tools/internal/check-live-rollout-smoke.js --base-url=http://127.0.0.1:8788 --reader-path=/reader/`
- `node reader_render_v3/tools/internal/check-live-rollout-smoke.js --base-url='https://codex-reader-render-v3.reader-books.pages.dev' --reader-path=/reader/`

Key runtime observations:
- localhost and preview both report `zeroCriticalBridgeDependencies: true` for scoped unprotected old-route critical flows;
- localhost and preview both report `frameCount: 3`;
- current unprotected shell events are emitted from `legacy-shell`;
- `fb_user_gesture` calls observed: `0`;
- `__tryFsFromIframe` assignments observed: `1`;
- `__tryFsFromIframe` calls observed: `0`;
- unprotected route remains the active old-reader route with `viewerStack=true`.

## 3. Honest Conclusion

`Phase 12` proves:
- unprotected old-route critical flows are **not** currently blocked by bridge as an operational dependency;
- unprotected old-route runtime is still **actively iframe-backed**;
- several iframe-specific runtime and feature surfaces are real `Phase 13` blockers.

Current conclusion:
- `zero critical bridge dependencies` for the scoped unprotected route: **proven**
- `zero critical iframe dependencies` for the unprotected route: **not proven**
- `Phase 13 ready to implement direct host`: **blocked until the prerequisites in section 8 are explicitly prepared**

## 4. Route And Bootstrap Inventory

| Surface | Location | Evidence | Classification | Why | Later change |
|---|---|---|---|---|---|
| Unprotected route entry remains old reader route | `reader/index.html` | protected requests are redirected to `reader_render_v3/integration/protected-reader.html`; unprotected stays on old route | critical blocker for Phase 13 | there is no unprotected direct-host route or flag yet | Phase 13 must introduce explicit flagged direct-host entry |
| Reading-position restore on unprotected route | `reader/index.html`, `reader/js/reader.js` | old route reloads into reader boot and `rendition.display(last)` / previous location flow | migration-required but non-blocking | restore semantics must be preserved, but this is not itself proof that iframe is unavoidable | direct host must preserve restore token / reading-position semantics |
| Viewer stack shell structure | `reader/index.html` | `#viewer`, `#viewer-prev`, `#viewer-next` present in live unprotected route | critical blocker for Phase 13 | current runtime boot assumes rendition targets that become iframe hosts | direct host must define replacement render roots |

## 5. Runtime / Rendering / Interaction Inventory

| Surface | Location | Evidence | Classification | Why | Later change |
|---|---|---|---|---|---|
| Main rendition renders into `#viewer` | `reader/js/reader.js` | `this.rendition = book.renderTo("viewer", ...)` | critical blocker for Phase 13 | current unprotected runtime is instantiated as iframe-backed epub.js rendition | direct host must replace iframe rendition ownership |
| Neighbor renditions render into `#viewer-prev` and `#viewer-next` | `reader/js/reader.js` | `book.renderTo("viewer-prev")`, `book.renderTo("viewer-next")` | critical blocker for Phase 13 | swipe preview and neighbor rendering assume always-mounted iframe neighbors | direct host must define equivalent neighbor/page-turn model |
| Theme application assumes iframe content docs | `reader/js/reader.js` | comment states content is rendered inside an iframe; theme applied via `rendition.themes.select(...)` | critical blocker for Phase 13 | theme/layout pipeline currently targets iframe documents | direct host must define non-iframe theme/layout contract |
| Touch bar-toggle path attached to iframe docs | `reader/js/reader.js` | `attachUiTapToDoc(doc)` attaches `touch*` and `pointer*` handlers inside iframe docs | critical blocker for Phase 13 | visible UI behavior depends on events captured inside content docs because they do not bubble to parent | direct host must redefine pointer/touch delivery without iframe boundary |
| Swipe/page-turn path attached to iframe docs | `reader/js/reader.js` | `attachSwipeToDoc(doc)` plus comments about iframe touch capture | critical blocker for Phase 13 | page navigation on mobile/tablet depends on iframe-local event capture | direct host must provide equivalent gesture model |
| Iframe rescanning and reattachment | `reader/js/reader.js` | `scanIframes()`, `MutationObserver`, `querySelectorAll("#viewerStack iframe, ...")` | critical blocker for Phase 13 | runtime expects iframe recreation and repairs listeners around it | Phase 13 must eliminate or replace this lifecycle assumption |
| Selection callback from epub.js rendition | `reader/js/reader.js` | `this.rendition.on("selected", this.selectedRange.bind(this))` | migration-required but non-blocking | selection pipeline must later be preserved or intentionally scoped, but this line alone does not define the host boundary | Phase 13/14 must decide direct selection ownership |

## 6. Feature-Level Iframe Assumptions

| Surface | Location | Evidence | Classification | Why | Later change |
|---|---|---|---|---|---|
| Search CSS injection into iframe and parent docs | `reader/js/fbreader-ui.js` | `ensureSearchHlCss(doc)`, `hooks.content.register`, iframe scanning, delayed rescans | critical blocker for Phase 13 | search highlight visibility currently depends on iframe content docs and late iframe attachment | direct host must provide explicit search-highlight surface and lifecycle |
| Search runtime content traversal | `reader/js/fbreader-ui.js` | repeated `reader.rendition.getContents()` usage and `reader.rendition.display(...)` during search flows | critical blocker for Phase 13 | current search model is tied to epub.js iframe contents API | direct host must define equivalent search content/state contract |
| Selection toolbar attachment to iframe docs | `reader/js/fbreader-ui.js` | toolbar setup attaches to rendition content docs and iframe scans | critical blocker for Phase 13 | toolbar / highlight / note action capture currently assumes iframe-local selection documents | direct host must define selection-to-toolbar contract |
| Note focus jump | `reader/js/fbreader-ui.js`, `reader/js/reader.js` | `reader.rendition.display(cfi)` used for note/bookmark jumps | migration-required but non-blocking | jump semantics matter, but the requirement is the anchor contract, not iframe itself | direct host must preserve CFI/href jump semantics |
| Bookmark shell state and refresh | `reader/js/fbreader-ui.js`, `reader/js/reader.js` | bookmark icon sync, bookmarks list refresh, `BookmarksController.refresh()` | migration-required but non-blocking | user-visible parity required later | direct host must preserve list state and indicator behavior |
| TOC controller | `reader/js/reader.js` | `EPUBJS.reader.TocController` and `rendition.display(url)` | migration-required but non-blocking | shell-side TOC is not itself iframe-dependent, but its command target still is | direct host must preserve TOC contract while changing transport target |
| Share/export and notes payload plumbing | `reader/js/fbreader-ui.js` | shell-side notes/share logic present outside iframe scans | false dependency | these payload flows are not evidence that iframe is required | preserve compat semantics later, but no host blocker proven here |

## 7. Bridge-Adjacent / Legacy / Verification Inventory

| Surface | Location | Evidence | Classification | Why | Later change |
|---|---|---|---|---|---|
| Shared reader event hub | `reader/js/fbreader-ui.js` | `window.__READERPUB_READER_EVENTS__` | false dependency | this is a useful shared shell contract, not a bridge dependency | keep and later switch producer from legacy-shell reconstruction to direct runtime ownership |
| Legacy-shell event reconstruction | `reader/js/fbreader-ui.js` | mutation-observer based shell emits with `source: "legacy-shell"` | migration-required but non-blocking | contract already exists, but producer is indirect and shell-derived | Phase 13 should migrate producer ownership closer to direct runtime |
| Fullscreen helper `__tryFsFromIframe` | `reader/js/fbreader-ui.js` | assignment observed once; no calls seen in audited flows | legacy wrapper only | mobile/fullscreen helper exists near iframe path but is not proven critical in scoped desktop critical flows | keep until direct mobile/fullscreen strategy is defined |
| `fb_user_gesture` message path | `reader/js/fbreader-ui.js` | no messages observed in localhost/preview audit | legacy wrapper only | bridge-adjacent helper remained unused in audited flows | later remove only when mobile fullscreen policy is settled |
| Protected bridge helper references in shared file | `reader/js/fbreader-ui.js` | protected-only helpers exist nearby | false dependency | not part of unprotected live path | ignore for Phase 12 readiness |
| `check-unprotected-bridge-dependency.js` | `reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js` | proves bridge non-criticality and current iframe count | verification-only dependency | useful evidence tool; does not prove no-iframe readiness | keep and extend later if needed |

## 8. Phase 13 Prerequisites

`Phase 13` must not start until all of these are explicitly prepared:

1. A concrete flagged unprotected direct-host route or mode exists on paper.
2. The replacement for `book.renderTo("viewer" | "viewer-prev" | "viewer-next")` is defined as a host contract, not as an ad-hoc implementation idea.
3. Pointer/touch delivery is designed without iframe-local listener dependence.
4. Search lifecycle ownership is defined without `rendition.getContents()` and iframe CSS injection as the primary model.
5. Theme and typography application are defined for non-iframe rendering roots.
6. Reading-position restore and route semantics are specified for the future direct host.
7. TOC / bookmark / note jump semantics are mapped onto a non-iframe navigation target.
8. A hidden-dependency detection plan exists for:
   - iframe recreation assumptions
   - mutation-observer shell reconstruction
   - late-attach search/highlight rescans
9. The verification matrix in section 9 is accepted as the minimum gate for any implementation attempt.

If any of the above remains vague, `Phase 13` should be considered blocked.

## 9. Verification Matrix Required Before And During Phase 13

| Domain | What must be proven later | Current Phase-12 status |
|---|---|---|
| Route loading | direct-host route boots without iframe dependency regressions | not yet implemented |
| Chapter/document navigation | next/prev and relocation parity without iframe listeners | blocked by current iframe gesture/nav ownership |
| TOC | TOC jump and active-state parity | contract identified; direct target not defined |
| Search | submit/next/prev/clear/return plus highlight visibility | blocked by iframe content-doc search model |
| Selection | selection lifecycle and geometry if kept in scope | blocked by iframe-local selection attach path |
| Annotations | note/highlight create/jump/list refresh parity where applicable | partially shell-side; anchor/display target still legacy |
| Persistence | reading-position and bookmark persistence parity | semantics present; direct-host contract not defined |
| Copy surface | no hidden DOM text and copy-surface hardening preserved | must be re-certified later |
| Toolbar | toolbar visibility/action capture without iframe selection docs | blocked by current attach model |
| Theme | light/dark/font cycles without iframe theme hooks | blocked by current `rendition.themes` ownership |
| Parity | localhost and preview stay aligned | required later; current old-route parity green |
| Legacy isolation | protected path stays untouched; unprotected legacy remains isolated during migration | currently green |
| Hidden dependency detection | no silent fallback to iframe scans/message helpers | explicit future gate |

## 10. What Phase 12 Proves And Does Not Prove

Proven now:
- unprotected route is still genuinely iframe-backed;
- the active unprotected route uses three iframe-backed rendition surfaces;
- bridge-adjacent helpers are not critical blockers for the scoped old-route flows audited on localhost and preview;
- the shared shell event vocabulary already exists on unprotected, but its producer is still `legacy-shell` reconstruction;
- search, touch/swipe, theme application, and rendition boot are the highest-confidence iframe blockers for `Phase 13`.

Not proven now:
- that unprotected can run without iframe;
- that direct runtime host integration is ready to implement without more design work;
- that selection/annotation parity can be preserved without additional migration work;
- that whole-reader no-iframe certification is close.

## 11. Phase-12 Status

`Phase 12` is successful only as a readiness audit if this artifact remains honest:
- unprotected iframe removal is still future implementation work;
- the dependency baseline is now explicit enough to govern `Phase 13`;
- the blockers listed above must be treated as real entry gates, not optional recommendations.
