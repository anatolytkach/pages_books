# 67. Phase 8 — Rollback Proof

## Current rollback mechanism
- Rollback target remains the bridge-backed protected old-shell route.
- This keeps:
  - `compatTransport=bridge`
  - `renderHost=iframe`
- Phase 8 does not change default production-safe rollback behavior.

## Exact rollback routes

### Localhost rollback route
- `http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

### Localhost direct readiness route
- `http://127.0.0.1:8788/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&protectedCompatTransport=adapter&protectedRenderHost=direct&renderMode=shape&metricsMode=shape`

### Preview rollback route
- `https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape&_cb=20260413c`

### Preview direct readiness route
- `https://codex-reader-render-v3.reader-books.pages.dev/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&protectedCompatTransport=adapter&protectedRenderHost=direct&renderMode=shape&metricsMode=shape&_cb=20260413c`

## What was actually verified
- Rollback route opened and stayed green on localhost.
- Rollback route opened and stayed green on preview.
- Critical rollback UX was exercised:
  - navigation
  - selection / toolbar / highlight
  - notes
  - bookmarks
  - search
  - share / export
  - theme / typography
  - security invariants

## Safe operational conclusion
- If direct protected path regresses after Phase 8, the safe rollback remains the bridge-backed old-shell protected route above.
- Rollback is not theoretical; it was exercised by the Phase 8 runner and full evidence matrix.
- Bridge removal is still blocked until Phase 9; in Phase 8 the bridge-backed rollback path remains mandatory.
