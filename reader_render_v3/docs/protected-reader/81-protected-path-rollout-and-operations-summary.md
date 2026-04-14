# 81. Protected Path Rollout And Operations Summary

## Supported protected routes
- Standard protected route:
  - `/reader/?id=<book>&reader=protected&renderMode=shape&metricsMode=shape`
- Protected old-shell compatibility route:
  - `/reader/?id=<book>&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`
- Direct-render verification mode when explicitly needed:
  - add `protectedRenderHost=direct`

## Supported preview routes
- Published preview alias:
  - `https://codex-reader-render-v3.reader-books.pages.dev/reader/...`

## Supported ops / support usage
- Use the standard protected route for live protected verification.
- Use the protected old-shell route only for compatibility/regression verification.
- Use readiness, parity, conformance, security, and cleanup-proof runners as the supported evidence toolchain.

## Deprecated or not-for-ops usage
- Removed protected bridge runtime path.
- Removed protected bridge rollback as an operational path.
- Production-visible integrated harness controls should not be used as UI affordances.

## Still belongs to legacy unprotected branch
- Standard old/unprotected route.
- Unprotected iframe-backed runtime model.
- Unprotected legacy helpers not proven safe to remove.
