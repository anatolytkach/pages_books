# 70. Unprotected Bridge Dependency Audit

## Surface inventory

| File / module | Bridge-adjacent surface | Current relevance to unprotected |
| --- | --- | --- |
| `reader/js/fbreader-ui.js` | `window.__tryFsFromIframe`, `fb_user_gesture` message listener, `enableIframeGestures()` | Legacy mobile/fullscreen gesture bridge; not part of desktop critical unprotected flow proof |
| `reader/js/fbreader-ui.js` | `getProtectedReaderBridge()`, `getProtectedSpeechPayload()` | Protected-only read-aloud helper; not used by standard unprotected route critical flows |
| `reader/js/fbreader-ui.js` | `window.__READERPUB_READER_EVENTS__` event hub | Shared shell contract path for unprotected; non-bridge operational surface |
| `reader/index.html` | old-reader route bootstrap and rollout fallback shell | Standard unprotected route; audited through browser-level flows |

## Classification

| Usage | Classification | Notes |
| --- | --- | --- |
| `window.__READERPUB_READER_EVENTS__` shell event hub | Not a bridge dependency | Canonical shell-level event surface for unprotected |
| `fb_user_gesture` postMessage path | Legacy-but-not-used-in-critical-flow | Mobile/fullscreen helper; not touched in audited desktop critical flow |
| `window.__tryFsFromIframe` | Legacy-but-not-used-in-critical-flow | Mobile/fullscreen helper; not touched in audited desktop critical flow |
| `getProtectedReaderBridge()` in old reader shell | Compatibility-only / protected-only helper | No protected host on audited unprotected route |
| Unprotected route bootstrap / search / theme / sidebar logic | Bridge not required | DOM + EPUB runtime + shell event hub path |

## Flow coverage

| Critical unprotected flow | Status |
| --- | --- |
| Open book | Bridge not required |
| Next / prev | Bridge not required |
| TOC navigation | Bridge not required |
| Reading position restore | Bridge not required |
| Search submit / next / prev / clear | Bridge not required |
| Search return | Bridge not exposed in the audited desktop route; no bridge dependency observed |
| Theme toggle | Bridge not required |
| Typography controls where exposed | Bridge not required |
| Bookmark create / delete | Bridge not required |
| Sidebar open / close | Bridge not required |
| Route stability on localhost / preview | Bridge not required |

## Proof basis
- Focused runner:
  - `reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js`
- The runner:
  - opens the standard unprotected route;
  - instruments `fb_user_gesture` message traffic and `__tryFsFromIframe` calls;
  - verifies critical unprotected flows on localhost and preview;
  - confirms absence of protected host / protected bridge dependency in the audited route.

## Honest conclusion
- **Zero critical bridge dependencies proven for the scoped unprotected critical flows.**
- Remaining bridge-adjacent code is legacy/mobile/fullscreen or protected-only helper code, not an operational blocker for the audited unprotected route.
- This check does **not** prove unprotected no-iframe completion; it only proves that Phase 9 is not blocked by a hidden critical unprotected bridge dependency in the audited shell flows.
