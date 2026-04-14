# 75. Phase 10 — Required Diagnostics Minimum

## Runtime / surface inspection that must remain
- `window.__PROTECTED_READER_COMPAT_ADAPTER__`
- `getSummary()`
- `getDebugLayoutState()`
- `getSupportedEvents()`
- canonical event delivery for:
  - `pageChanged`
  - `selectionChanged`
  - `searchStateChanged`
  - `annotationsChanged`
  - `themeChanged`
  - `readingPositionChanged`
  - `toolbarStateChanged`

## DOM diagnostics that must remain available to runners
- `#status`
- `#runtime-meta`
- `#selection-meta`
- `#reader-canvas`
- `#overlay-canvas`
- `#protectedDirectReaderRoot` on old-shell direct path

## Required runners that must continue to work
- route / rollout:
  - `check-live-protected-route.js`
  - `check-live-rollout-smoke.js`
- old-shell parity / conformance:
  - `check-old-reader-ux-parity.js`
  - `check-old-reader-full-ux-parity.js`
  - `check-full-old-reader-ux-conformance.js`
  - `check-old-shell-protected-ux-integration.js`
- contract / direct path:
  - `check-phase5-event-contract.js`
  - `check-phase6-touch-selection-proof.js`
  - `check-phase6-direct-render-parity.js`
  - `check-phase7-direct-feature-parity.js`
  - `check-phase8-bridge-readiness.js`
  - `check-phase9-post-removal-proof.js`
  - `check-phase10-cleanup-proof.js`
- unprotected safety:
  - `check-unprotected-bridge-dependency.js`
- compat / security:
  - `check-transport-roundtrip.js`
  - `check-local-persistence-e2e.js`
  - `check-selection-highlight-flow.js`
  - `check-copy-surface-hardening.js`
- readiness:
  - `check-protected-reader-readiness.js`
  - `run-pilot-readiness.js`

## Phase 10 rule
- Cleanup may remove visible harness UI and dead internal probes.
- Cleanup may not remove the last remaining surfaces needed for:
  - support triage
  - geometry verification
  - event/contract verification
  - Phase 11 readiness certification
