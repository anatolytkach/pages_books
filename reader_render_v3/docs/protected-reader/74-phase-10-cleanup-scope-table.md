# 74. Phase 10 — Cleanup Scope Table

| File / module / path | Current role | Why it looks removable | Decision | Reason |
| --- | --- | --- | --- | --- |
| `reader_render_v3/dev/protected-reader.css` integrated-route sidebar / controls / annotations visibility | Live protected route still exposed harness-style controls after Phase 9 | Standard protected route no longer needs visible harness UI | Remove now from visible surface | Phase 10 allows removing obsolete harness UI if diagnostics remain available; DOM/state surfaces stay in place for runners |
| `reader_render_v3/integration/protected-old-shell-host.js` `HOST_STATE.pollTimer` | Bridge-era host polling leftover | No references remain after event/subscription migration and Phase 9 removal | Remove now | Dead field, not part of diagnostics minimum |
| `reader_render_v3/tools/internal/debug-menu-toc-open.js` | One-off debug probe | Not part of readiness / support / parity matrix | Remove now | Unreferenced dead internal debug tool |
| `reader_render_v3/tools/internal/debug-old-reader-style-snapshot.js` | One-off debug probe | Not part of readiness / support / parity matrix | Remove now | Unreferenced dead internal debug tool |
| `reader_render_v3/tools/internal/debug-toc-screenshot.js` | One-off debug probe | Still assumed bridge-era frame state | Remove now | Dead post-Phase-9, not required for supportability minimum |
| `reader_render_v3/tools/internal/debug-toc-sequence.js` | One-off debug probe | Not part of required evidence package | Remove now | Unreferenced dead internal debug tool |
| `reader_render_v3/tools/internal/tmp-*.js` listed in this pass | Temporary migration probes | Temporary by name and unreferenced | Remove now | Not part of any certified runner or support path |
| `reader_render_v3/dev/protected-reader.js` adapter event / summary / debug-layout surfaces | Runtime diagnostics and contract inspection | Looks debug-adjacent | Keep now | Required for verification, geometry proof, supportability, and Phase 11 sign-off |
| `reader_render_v3/tools/internal/check-phase9-post-removal-proof.js` | Post-removal proof | Looks transitional | Keep now | Still required for proving protected bridge-free state after cleanup |
| `reader_render_v3/tools/internal/check-unprotected-bridge-dependency.js` | Unprotected safety runner | Not part of protected cleanup itself | Keep now | Required to prove cleanup did not regress unprotected path |
| `reader_render_v3/tools/internal/check-phase6-direct-render-parity.js` | Direct geometry proof | Debug-heavy output | Keep now | Required diagnostics minimum for direct-path supportability |
| `reader/js/fbreader-ui.js` unprotected legacy helpers | Legacy old-route backend | Bridge-adjacent code still present | Keep now | Out of Phase 10 scope; still belongs to unprotected legacy model |
| `reader_render_v3/dev/protected-reader.html` | Dev-only page | Harness-heavy by design | Keep now | Dev/support surface, not live integrated route |
