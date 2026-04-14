# 102. Unprotected Iframe Removal Readiness Criteria

## Canonical Corpus

The decision corpus is fixed:
- `19686`
- `45`
- `19&source=manual`

No exploratory book may change the decision unless it is first promoted into the canonical equivalent corpus.

## A. Runtime Capability

Required green conditions:
- pagination green
- restore green
- search green
- selection green
- annotations green
- bookmarks green

Decision status:
- green only if `check-phase13-3-corpus.js` is green on localhost and preview for the canonical corpus

## B. Shell / UX Integration

Required green conditions:
- page counter is sane
- theme and font controls are sane
- TOC is sane
- no hidden reliance on legacy iframe path for the new route

Decision status:
- green only if the new route shows:
  - `runtimePath = new`
  - `iframeCount = 0`
  - direct root present
  - counter/state changes are real on the canonical corpus

## C. Corpus Certification

Required green conditions:
- canonical corpus is the same on localhost and preview
- all canonical books are green on localhost
- all canonical books are green on preview
- no unresolved critical blocker remains on the certified corpus

Decision status:
- green only if `check-phase13-4-corpus-equivalence.js` is green and the corpus reruns are green in both environments

## D. Architecture

Required green conditions:
- the new runtime does not depend on iframe as a runtime boundary
- the new runtime does not depend on `contentDocument`
- no silent fallback to the legacy iframe runtime path
- the legacy path is still available as rollback baseline before removal

Decision status:
- green only if:
  - dynamic proofs show `runtimePath = new` and `iframeCount = 0`
  - static audit of new runtime modules finds no active `contentDocument`, `ePubReader(...)`, or `renderTo(...)` dependency
  - legacy bypass remains explicit rather than silent

## E. Regression Control

Required green conditions:
- protected path green
- legacy unprotected path green
- no hidden debug leakage
- no unexpected `/debug/`
- compat/security green

Decision status:
- green only if:
  - `check-live-rollout-smoke.js` is green on localhost and preview
  - `check-live-protected-route.js` is green on localhost and preview
  - `check-unprotected-bridge-dependency.js` is green on localhost and preview
  - `check-phase9-post-removal-proof.js` is green

## F. Decision Rule

### `GO`

Only if:
- `runtimeCapability = true`
- `shellUxIntegration = true`
- `corpusCertification = true`
- `architectureReadiness = true`
- `regressionControl = true`
- no warnings remain

### `GO_WITH_WARNINGS`

Only if:
- all five required criteria are `true`
- remaining issues are explicitly non-gating
- warnings do not contradict the removal decision

### `NO_GO`

Required if:
- any required criterion is `false`
- localhost and preview disagree on the canonical corpus
- hidden iframe dependence remains on the new route
- any removal-specific blocker remains unresolved

## Final Decision Evaluation

Canonical corpus used for the decision:
- `19686`
- `45`
- `19&source=manual`

Criteria status:
- `runtimeCapability = true`
- `shellUxIntegration = true`
- `corpusCertification = true`
- `architectureReadiness = true`
- `regressionControl = true`

Final decision:
- `GO_WITH_WARNINGS`

Justification:
- the new runtime is green on the canonical corpus on localhost and preview;
- corpus equivalence is proven for the canonical set;
- the new route remains `runtimePath = new` with `iframeCount = 0`;
- static audit of the new runtime modules found no active `contentDocument`, `ePubReader(...)`, `renderTo(...)`, or `scanIframes(...)` dependency;
- protected and legacy rollback / regression controls remain green.

Remaining non-gating warnings:
- `77752` and `77753` remain exploratory-only and are excluded from the decision corpus because they are not cross-environment equivalent;
- legacy iframe path remains intentionally available as rollback until removal implementation is complete;
- this decision does not authorize protected-path removal or whole-reader iframe-free claims.

## Phase 14 Decision Follow-Through

The criteria above were used as the go/no-go gate for the next phase.

Post-implementation observed state:
- the default unprotected route now satisfies the removal goal operationally;
- rollback remains explicit via `?unprotectedRuntime=legacy`;
- protected and whole-reader claims remain out of scope.
