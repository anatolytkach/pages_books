# 103. Phase 14 Unprotected Iframe Removal Execution

## Scope

This phase removes the iframe-backed runtime from the active default unprotected reading path.

It does:
- make the new unprotected runtime the default active runtime path;
- move the legacy iframe-backed unprotected runtime to an explicit rollback-only mode;
- prove browser-level that the default unprotected route is no longer iframe-backed;
- preserve protected-path behavior unchanged.

It does not:
- remove protected iframe dependencies;
- claim whole-reader iframe-free completion;
- remove every legacy helper or cleanup every old-path file;
- remove the rollback path.

## What Is Being Removed

Removed from the active default unprotected route:
- default boot into `ePubReader(...)`;
- default iframe-backed pagination ownership;
- default iframe-backed search / theme / input ownership;
- default reliance on iframe-backed reading runtime for unprotected books.

## What Intentionally Remains

Retained intentionally:
- explicit rollback route via `?unprotectedRuntime=legacy`;
- legacy unprotected runtime files needed for rollback;
- protected runtime and protected rollout wiring;
- old-path tooling needed to verify rollback and regressions.

## Completion Criteria

This phase is complete only if:
- the default active unprotected route boots the new runtime;
- the default active unprotected route shows `iframeCount = 0`;
- the canonical certified corpus stays green on localhost and preview;
- rollback remains explicit and non-default if retained;
- protected sanity remains green;
- no hidden iframe fallback remains on the default unprotected route.

## Failure Criteria

This phase fails if:
- the default unprotected route still uses the legacy iframe runtime;
- the default route silently falls back to iframe and still reports success;
- canonical localhost / preview behavior diverges;
- rollback remains implicit instead of explicit;
- protected path regresses;
- docs claim protected or whole-reader iframe-free completion.

## Final Outcome

Observed result:
- default unprotected route now boots the new runtime by default;
- explicit rollback route is:
  - `?unprotectedRuntime=legacy`
- canonical corpus stayed green on localhost and preview after the switch;
- protected sanity stayed green.

Final status:
- `COMPLETE WITH WARNINGS`

Warnings:
- canonical proof is limited to the certified corpus `19686`, `45`, `19&source=manual`;
- manual-package routes still probe `META-INF/container.xml` before correct manifest fallback;
- this phase does not authorize protected removal or whole-reader iframe-free claims.
