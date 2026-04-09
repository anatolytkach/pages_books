# Internal Rollout Test Matrix

## Matrix

| Scenario | Expected outcome | Fallback behavior | User-facing result | Diagnostics expectation |
| --- | --- | --- | --- | --- |
| eligible book + protected flag | open protected | none | protected reader opens | `Eligibility status=eligible` or `eligible-with-warnings`, `Rollout decision=open-protected-reader` |
| old reader default open | open old reader | not applicable | old reader opens normally | no protected diagnostics |
| rollout disabled globally or by query | redirect to old reader | redirect with reason | old reader opens | URL contains `protectedFallbackReason=ineligible-rollout-disabled` |
| book on denylist | redirect to old reader | redirect with reason | old reader opens | URL contains `protectedFallbackReason=ineligible-book-not-allowed` |
| allowlisted book | open protected | none | protected reader opens | `Book allowed=yes`, `Allowlisted=yes` |
| protected artifact missing | redirect to old reader | redirect with reason | old reader opens | URL contains `protectedFallbackReason=ineligible-no-protected-artifact` |
| worker unavailable | protected unavailable page | fail-closed | controlled protected-unavailable message | `Rollout decision=protected-unavailable-show-message`, `Worker available=no` |
| Drive unavailable | open protected with warning | none | protected reader still opens | `Eligibility status=eligible-with-warnings`, warning includes `drive-unconfigured` |
| hard compatibility failure | redirect to old reader or stay blocked by policy | redirect with reason | old reader opens | `protectedFallbackReason=ineligible-hard-compat-failure` |
| imported fingerprint mismatch | open protected, reject imported state | none | reader opens, import warning shown | compatibility status reports mismatch, not silent apply |

## Minimum internal smoke flow

1. open old reader without `reader=protected`
2. open allowlisted protected book with `reader=protected`
3. verify denylist override redirects back to old reader
4. verify rollout-disabled override redirects back to old reader
5. verify worker-unavailable stays fail-closed
6. verify artifact-missing redirects to old reader
7. verify Drive-unconfigured stays warning-only

## Tooling

Two internal probes support this matrix:

- `check-rollout-eligibility.js`
- `check-rollout-matrix.js`

The first checks policy/eligibility decisions in a machine-readable way. The second
replays key browser outcomes so internal testing does not rely on manual interpretation.

For published staging checks, use the same matrix against the Pages preview alias with
`/reader/` as the reader base path. `reader.pub/books/reader/` is intentionally not the
protected rollout target at this stage.
