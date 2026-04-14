# 104. Unprotected Iframe Removal Scope Table

| file/module/path | current role | post-Phase-14 role | removed / retained / rollback-only / untouched | why | removal forbidden or allowed |
| --- | --- | --- | --- | --- | --- |
| `reader/index.html` | unprotected route bootstrap chooses runtime path | default boot goes to new runtime; legacy boot only on explicit rollback flag | retained | route bootstrap must still exist; default/rollback split is implemented here | allowed |
| `reader/js/unprotected-runtime-shell.js` | new runtime shell gate and UI wiring | default unprotected gate now resolves to `new`; explicit `legacy` rollback remains available | retained | this is the active runtime entry for unprotected | allowed |
| `reader/js/unprotected-runtime-adapter.js` | adapter surface for new runtime | unchanged active adapter for default unprotected path | retained | required active runtime contract | forbidden |
| `reader/js/unprotected-runtime-core.js` | runtime-owned unprotected reading engine | unchanged active runtime engine | retained | required active runtime engine | forbidden |
| `reader/js/unprotected-runtime-state.js` | runtime-owned state | unchanged active runtime state | retained | required active runtime state | forbidden |
| `reader/js/unprotected-runtime-events.js` | runtime event surface | unchanged active runtime event surface | retained | required shell contract | forbidden |
| `reader/js/unprotected-render-host.js` | direct render host for new runtime | unchanged active direct host | retained | required active direct rendering | forbidden |
| `reader/js/fbreader-ui.js` | legacy iframe-shell glue | bypassed on default unprotected route; remains for explicit rollback route | rollback-only | rollback remains intentionally available | removal forbidden in this phase |
| `reader/js/reader.js` | legacy EPUB.js iframe runtime | no longer default for unprotected; still used only by explicit rollback route | rollback-only | rollback baseline is intentionally retained | removal forbidden in this phase |
| `?unprotectedRuntime=new` | explicit opt-in to new runtime | still accepted, but no longer required because default is new | retained | backward-compatible explicit mode | allowed |
| `?unprotectedRuntime=legacy` | explicit legacy mode | rollback-only entry to old iframe runtime | retained | controlled rollback path | allowed |
| default `/reader/?id=...` | unprotected default route | default active new runtime route | retained | this is the operational path after removal | allowed |
| protected routes (`reader=protected`, integration route) | protected reading runtime | unchanged | untouched | Phase 14 does not touch protected removal | removal forbidden |
| legacy iframe-specific listeners / old search/theme/runtime hooks | active on old path | no longer active on default unprotected route | rollback-only | must not participate in the default path, but rollback still needs them | allowed to isolate, forbidden to remove entirely in this phase |
| `reader_render_v3/tools/internal/check-phase13-3-corpus.js` | canonical corpus certification runner | now certifies the default unprotected route by default | retained | proof must follow the active route | allowed |
| `reader_render_v3/tools/internal/check-phase13-4-corpus-equivalence.js` | corpus equivalence proof | now compares the default unprotected route by default | retained | equivalence proof must follow the active route | allowed |
| `reader_render_v3/tools/internal/check-phase13-5-removal-readiness.js` | pre-removal decision proof | remains as reference proof against the canonical corpus | retained | still useful for decision boundary reference | allowed |
| `reader_render_v3/tools/internal/check-phase14-unprotected-post-removal-proof.js` | post-removal default-route proof | authoritative proof for default-vs-rollback behavior | retained | required new proof artifact | forbidden |
