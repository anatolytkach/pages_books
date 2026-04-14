# 72. Phase 9 — Removal Scope Table

Update on April 14, 2026:
- `reader_render_v3/integration/protected-old-shell-host.js` is no longer present in code.
- `reader_render_v3/integration/protected-reader-routing.js` is no longer present in code.
- `reader_render_v3/integration/protected-reader-bootstrap.js` is no longer present in code.
- Active protected/new-reader ownership now lives under `reader_render_v3/reader_new/*`.

| File / module / path | Current role before removal | Phase 8 classification | Decision | Reason / proof |
| --- | --- | --- | --- | --- |
| `reader_render_v3/dev/protected-reader.js` — embedded protected bridge facade publication (`createProtectedReaderBridgeFacade`, `installEmbeddedBridge`, bridge notification publication) | Published live protected bridge facade in embedded runtime | Compatibility-only for protected direct readiness | Remove now | Phase 8 proved protected direct path operationally sufficient via adapter; live protected runtime no longer needs bridge facade |
| `reader_render_v3/dev/protected-reader-compat-adapter.js` — bridge facade constructor export | Helper for embedded bridge facade over adapter methods | Compatibility-only | Remove now | Safe because live protected path uses adapter directly and facade publication was removed |
| `reader_render_v3/integration/protected-old-shell-host.js` — transport selection returning bridge / iframe fallback | Host-side bridge transport selector for protected old-shell | Compatibility-only / rollback-only | Remove now | Phase 8 zero-critical-dependency proof + verified protected direct path; Phase 9 removes rollback-to-bridge operational path |
| `reader_render_v3/integration/protected-old-shell-host.js` — `handleBridgeMessage`, `postMessage` state sync, bridge-backed iframe host boot | Protected bridge message/state synchronization for fallback path | Compatibility-only / rollback-only | Remove now | Only served protected bridge-backed fallback; no longer part of active architecture after removal |
| `reader_render_v3/integration/protected-reader-routing.js` — protected route defaults resolving to bridge/iframe | Routing still allowed protected bridge runtime defaults | Compatibility-only after Phase 8 | Remove now | Protected path must become bridge-free by default and by active routing semantics |
| `reader_render_v3/tools/internal/check-old-reader-ux-parity.js` and related old-shell runners | Bridge-first assumptions in proof tooling | Tooling-only | Keep now, update | Still needed for evidence package; adapted to generic compat surface rather than removed |
| `reader_render_v3/tools/internal/check-phase8-bridge-readiness.js` | Phase 8 readiness proof | Diagnostics-only after removal | Keep now | Still useful as post-removal confirmation that no bridge dependency reappeared |
| `reader/js/fbreader-ui.js` — unprotected legacy helpers, `fb_user_gesture`, `__tryFsFromIframe`, protected helper stubs | Legacy old-reader / unprotected adjacent code | Out of protected removal scope | Keep now | Unprotected bridge safety check did not prove these safe to remove; Phase 9 cannot delete unprotected-adjacent code “заодно” |
| Any remaining harness / diagnostics UI panels | Developer verification surfaces | Diagnostics-only | Keep now | Harness cleanup belongs to Phase 10, not Phase 9 |
| Whole-reader iframe-related legacy code outside protected path | Shared / unprotected legacy architecture | Out of scope | Keep now | Phase 9 only removes protected bridge runtime dependency, not whole-reader iframe architecture |
