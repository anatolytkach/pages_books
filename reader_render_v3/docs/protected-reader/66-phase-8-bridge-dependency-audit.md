# 66. Phase 8 — Bridge Dependency Audit

## Surface inventory

| File / module | Bridge-related surface | Current role |
| --- | --- | --- |
| `reader_render_v3/dev/protected-reader.js` | `buildEmbeddedCompatHandlers()`, `installEmbeddedBridge()`, `notifyEmbeddedBridge()` | Publishes embedded bridge facade and bridge notifications for compatibility / fallback paths |
| `reader_render_v3/dev/protected-reader-compat-adapter.js` | bridge-shaped adapter surface, bridge facade over adapter methods | In-process compatibility layer; operational direct path lives here |
| `reader_render_v3/integration/protected-old-shell-host.js` | `getCompatSurface()`, `invokeBridge()`, `invokeBridgeRaw()`, `handleBridgeMessage()` | Host-side compat selector; bridge-backed fallback retained, adapter/direct path operational |
| `reader/js/fbreader-ui.js` | legacy protected iframe bridge helpers | Legacy/unprotected shell code; outside protected direct-path critical dependency proof |

## Classification

| Usage | Classification | Notes |
| --- | --- | --- |
| Protected old-shell direct path with `protectedCompatTransport=adapter&protectedRenderHost=direct` | Not a bridge dependency | Direct path served by in-process adapter/runtime surface |
| Bridge-backed protected old-shell route | Compatibility-only | Required rollback / baseline path in Phase 8 |
| Embedded bridge facade publication | Compatibility-only | Retained so rollback path and bridge-backed mode still work |
| Bridge message / `state-changed` listener in old-shell host | Compatibility-only | Retained for bridge-backed fallback path only |
| Legacy iframe-backed protected route | Compatibility-only | Baseline / rollback coverage |
| Legacy old-reader / unprotected bridge-adjacent helpers | Non-critical operational outside protected direct proof | Must remain non-regressed; not part of protected bridge-readiness blocker set |

## Critical flow proof status

| Critical flow | Direct path status | Bridge status |
| --- | --- | --- |
| Navigation | Direct path proven | Bridge only fallback |
| Selection / toolbar / highlights | Direct path proven | Bridge only fallback |
| Search lifecycle | Direct path proven | Bridge only fallback |
| Notes flows | Direct path proven | Bridge only fallback |
| Bookmarks flows | Direct path proven | Bridge only fallback |
| Share / export | Direct path proven | Bridge only fallback |
| Theme / typography | Direct path proven | Bridge only fallback |
| Security invariants | Direct path proven | Bridge only fallback |

## Proof method
- `check-phase8-bridge-readiness.js` runs bridge-backed rollback path and direct protected path side by side.
- In direct mode it poisons `window.__PROTECTED_READER_BRIDGE__` so any accidental live bridge call would fail immediately and be recorded.
- Direct-path proof passed with:
  - `compatTransport=adapter`
  - `renderHost=direct`
  - empty poison log
  - all critical flows green
- Rollback route passed independently with:
  - `compatTransport=bridge`
  - `renderHost=iframe`

## Zero-critical-dependency conclusion
- **Zero critical bridge dependencies achieved for protected direct path.**
- Remaining bridge usages are compatibility-only / rollback-only in Phase 8.
- No unresolved critical protected flow was found that still requires bridge as mandatory operational transport.
