# 78. Protected Migration Known Limits And Warnings

## Non-blocking warnings
- `run-pilot-readiness.js` skips production-payload reading-state import smoke when `/tmp/reader_render_v3_prod_notes.json` is absent.
- `check-phase6-direct-render-parity.js` still reports non-failing toolbar-anchor offset warnings while geometry regressions remain empty.
- Desktop unprotected old-route search return control is not exposed as a distinct control in the audited scenario; submit/next/prev/clear and route stability are verified instead.

## Why They Do Not Block Current Completion
- None of these warnings invalidate the protected production-ready claim.
- None of them introduce hidden DOM text, `/debug/` exposure, or compat drift.
- None of them contradict localhost or preview browser-level evidence.

## Future-branch relevance
- Unprotected no-iframe completion work remains future scope for `Phase 12–14`.
- These warnings do not imply that unprotected iframe removal is already done.

## Tooling-only gaps
- Missing production-payload fixture is a fixture availability gap, not a protected runtime regression.
- Non-failing toolbar-anchor warnings are tolerance/inspection noise, not a detected geometry failure.
