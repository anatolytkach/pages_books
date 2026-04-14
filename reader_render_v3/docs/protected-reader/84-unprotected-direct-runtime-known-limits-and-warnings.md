# 84. Unprotected Direct Runtime Known Limits And Warnings

## Current Non-Blocking Limits

### 1. Unprotected iframe still present
Meaning:
- current unprotected route is still served through iframe-backed runtime boundaries.
- runtime evidence on localhost and preview shows `frameCount: 3`.

Why not a Phase-12 blocker:
- `Phase 12` is readiness packaging, not removal.

Future owner:
- `Phase 13` and `Phase 14`

### 2. Whole-reader no-iframe claim still forbidden
Meaning:
- protected completion does not extend to unprotected architecture yet.

Why not a Phase-12 blocker:
- preserving this claim boundary is required behavior, not a defect.

Future owner:
- `Phase 14`

### 3. Unprotected dependency classification may reveal real blockers
Meaning:
- `Phase 12` can conclude that some unprotected dependencies are still critical.

Why not a Phase-12 blocker:
- surfacing exact blockers is a valid readiness outcome.

Future owner:
- `Phase 13` implementation planning

## Known Risks That Must Stay Visible

### Route/bootstrap coupling
- unprotected route open and restore may still depend on iframe load ordering.
- current route bootstrap still enters the old reader path; there is no flagged unprotected direct-host path yet.

### Search lifecycle coupling
- search state may still be partially coupled to iframe-local state transitions.
- current search highlighting injects CSS into iframe docs and rescans newly created iframes.

### Rendering/overlay coupling
- any future direct host must prove overlay, highlight, and coordinate-space behavior rather than assume parity.
- current navigation/tap/swipe behavior attaches listeners inside iframe content docs because those events do not bubble to the parent shell.

### Persistence coupling
- reading-position or bookmark persistence may still assume iframe lifecycle and must be audited before migration.

### Audit-scope warning: desktop bridge audit is not iframe-readiness proof
- current browser probe proves zero critical bridge dependencies for the scoped desktop old-route flows;
- it does **not** prove direct-runtime readiness or iframe-removal readiness by itself.

### Audit-scope warning: desktop old-route search return control is not exposed
- the current bridge-dependency runner verified `submit/next/prev/clear`;
- `searchReturn` remained `null` in the desktop old-route scenario and must not be overclaimed as already proven.

## Claim-Discipline Warnings

The following remain explicitly disallowed after `Phase 12`:
- saying unprotected migration is complete;
- saying unprotected iframe removal is done;
- saying the whole reader is iframe-free;
- saying the whole reader is bridge-free.

## Tooling / Evidence Warnings

`Phase 12` should preserve conservative wording if evidence is incomplete in any area:
- unresolved dependency inventory items must stay unresolved, not guessed away;
- unsupported unprotected feature domains must be marked `not applicable` or `not yet proven`, not silently treated as green;
- preview and localhost differences must be treated as blockers for future implementation phases.
