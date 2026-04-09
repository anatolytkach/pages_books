# 36. Internal Pilot Operations Strategy

## What is already ready

- protected worker-only runtime
- integrated protected reader
- local-first persistence
- protected sync file and handoff transport
- Google Drive transport
- rollout/eligibility layer
- published Pages preview protected route
- unified readiness runner

## What internal pilot means here

Internal pilot is:

- a limited set of pilot-certified books
- explicit protected opt-in
- a limited internal tester group
- old reader kept as the safe default
- fail-closed behavior for protected worker failures

Internal pilot is not:

- public rollout
- forced migration
- silent auto-enable
- replacement of the old reader

## Operational risks still present

- only books with published protected artifacts are usable
- Drive auth may be unavailable for some testers
- import compatibility mismatches can still happen
- rollout config mistakes can route users back to old reader
- future code changes can regress live/staging publication or browser flows

## Operational principle

- old reader stays the default path
- protected mode is used only by explicit opt-in and policy
- internal pilot books are a stricter subset of rollout-allowed books
- every change must pass localhost readiness and published-route readiness before internal use

## Initial pilot contour

- pilot-ready books:
  - `19686`
- candidate books:
  - none currently available in the repository with certified protected artifacts
- blocked books:
  - any book without a protected artifact

## Supported internal workflow

1. open the published preview protected URL for a pilot-certified book
2. verify rollout and pilot status in runtime diagnostics
3. read, select, copy, highlight, and note in protected mode
4. rely on local persistence for reload/reopen
5. optionally use sync file and Drive transport if authorized
6. fall back to old reader if rollout or artifact eligibility blocks protected mode

## Automation-safe UX workflow

For unattended UX verification and internal support, the preferred shell-integration route is:

- `/reader/?id=19686&reader=protected&protectedUx=old-shell&protectedDrive=disabled&protectedAutomation=1&renderMode=shape&metricsMode=shape`

This route keeps the old reader shell while disabling Drive as a blocker for smoke.
Internal pilot policy now treats “no-manual-UX-check” as a rule:

- browser-level shell integration checks must pass automatically
- manual OAuth/Drive interaction is not required for the core UX gate
