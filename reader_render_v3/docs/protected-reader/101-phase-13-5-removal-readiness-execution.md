# 101. Phase 13.5 Removal Readiness Execution

## Scope

This step makes the final decision on whether real unprotected iframe-removal implementation may start.

It does:
- evaluate removal readiness on the canonical certified corpus;
- formalize decision criteria;
- run a decision runner on localhost and preview;
- produce an explicit `GO`, `GO_WITH_WARNINGS`, or `NO_GO`.

It does not:
- remove iframe;
- add runtime features;
- expand the corpus beyond the already certified canonical subset;
- claim whole-reader no-iframe completion.

## What Counts As Removal Readiness

Removal readiness means:
- the new unprotected runtime is fully green on the canonical certified corpus;
- the new route does not depend on iframe as a runtime boundary;
- localhost and preview agree on the same corpus and the same results;
- protected and legacy paths remain green as rollback / non-regression controls;
- no unresolved removal-specific blocker remains on the new route.

## Out Of Scope

- iframe removal implementation
- broader exploratory corpus expansion
- whole-reader certification
- protected-path removal decisions

## Mandatory Evidence Package

- `check-phase13-4-corpus-equivalence.js`
- `check-phase13-3-corpus.js`
- `check-phase13-5-removal-readiness.js`
- `check-live-rollout-smoke.js`
- `check-live-protected-route.js`
- `check-unprotected-bridge-dependency.js`
- `check-phase9-post-removal-proof.js`
- `protected:build`
- `protected:validate`

## Possible Outcomes

- `GO`
  - all required criteria are green and no non-gating warning remains
- `GO_WITH_WARNINGS`
  - all required criteria are green, but non-gating warnings remain outside the certified removal gate
- `NO_GO`
  - at least one required criterion is red

## Final Decision Outcome

Final canonical decision corpus:
- `19686`
- `45`
- `19&source=manual`

Final decision status:
- `GO_WITH_WARNINGS`

Why:
- all required removal-readiness criteria are green on the canonical certified corpus on localhost and preview;
- no hidden iframe fallback was observed on the new runtime route for that corpus;
- no removal-specific blocker remains unresolved on that corpus;
- remaining warnings are outside the certified removal gate and do not contradict starting unprotected iframe-removal implementation.

Non-gating warnings:
- `77752` and `77753` remain exploratory-only because they are not cross-environment equivalent;
- broader exploratory corpus readiness is still not the same claim as canonical removal readiness;
- this step authorizes only the next unprotected iframe-removal implementation phase, not whole-reader no-iframe completion.

## Consumption By Phase 14

This execution note has now been consumed by `Phase 14`.

Observed implementation result:
- the authorized unprotected removal implementation was carried out on the canonical certified corpus;
- the default unprotected route now uses the new runtime;
- the legacy iframe path remains explicit rollback-only.
