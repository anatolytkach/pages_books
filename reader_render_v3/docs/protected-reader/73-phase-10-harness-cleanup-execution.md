# 73. Phase 10 — Harness Cleanup Execution

## Scope
- Убрать только obsolete protected harness/dev/bridge scaffolding, который больше не нужен после `Phase 9`.
- Убрать production-visible harness controls из standard protected integrated route, сохранив required diagnostics DOM/state surfaces.
- Удалить dead one-off internal debug probes, которые не входят в readiness/support toolchain.

## Cleanup targets
- Obsolete protected-only harness UI on the standard integrated protected page.
- Dead protected bridge leftovers already made inactive in `Phase 9`.
- Dead temporary internal debug / tmp probes not referenced by readiness or support flows.

## Explicitly out of scope
- Unprotected backend cleanup.
- Whole-reader cleanup.
- Whole-reader no-iframe completion.
- Legacy old-reader cleanup outside shared non-regression obligations.
- Removal of required diagnostics, readiness runners, parity runners, security runners, or post-removal proof tooling.

## Diagnostics / runners that must survive
- `check-live-protected-route.js`
- `check-old-reader-ux-parity.js`
- `check-old-reader-full-ux-parity.js`
- `check-full-old-reader-ux-conformance.js`
- `check-old-shell-protected-ux-integration.js`
- `check-phase5-event-contract.js`
- `check-phase6-touch-selection-proof.js`
- `check-phase6-direct-render-parity.js`
- `check-phase7-direct-feature-parity.js`
- `check-phase8-bridge-readiness.js`
- `check-unprotected-bridge-dependency.js`
- `check-phase9-post-removal-proof.js`
- `check-protected-reader-readiness.js`
- `run-pilot-readiness.js`
- geometry / summary / event inspection via the adapter surface

## Required evidence
- Cleanup scope table with remove-now / keep-now decisions.
- Required diagnostics minimum doc.
- `check-phase10-cleanup-proof.js`
- Full localhost + preview evidence package.
