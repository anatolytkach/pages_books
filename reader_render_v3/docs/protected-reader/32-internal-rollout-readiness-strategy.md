# Internal Rollout Readiness Strategy

## Confirmed protected capabilities

The protected reader now has a verified internal stack for:

- worker-only protected runtime
- canvas-only integrated `/books/reader/` flow
- notes and highlights
- reload/reopen restore
- local-first persistence
- protected sync file export/import
- Google Drive transport around the sync file
- production notes/share compatibility edges

This makes the protected reader operationally useful, but not yet safe to auto-enable
for every book or every session.

## Remaining risks before broader usage

Internal rollout must still account for:

- books that do not have a protected artifact
- environments where a worker boundary is unavailable
- rollout-disabled books or sessions
- Google Drive not being configured or authorized
- unresolved `n` / `notesShare` fetches
- incompatible imported bundles or fingerprint mismatches

Those are rollout-readiness issues, not reasons to weaken the protected runtime.

## Rollout principle

The protected reader now follows these rules:

- old reader remains the default route
- protected mode opens only when explicitly requested and allowed
- protected mode stays fail-closed if the worker boundary is unavailable
- ineligible protected requests fall back to the old reader with an explicit reason
- rollout decisions are machine-readable and visible in diagnostics

## Eligibility model

Protected mode is considered eligible only when all hard requirements pass:

- explicit protected request is present
- rollout policy is enabled
- the book is allowed by allowlist/denylist policy
- a protected artifact is present
- worker mode is available
- no hard compatibility blocker is active

Possible statuses include:

- `eligible`
- `eligible-with-warnings`
- `ineligible-rollout-disabled`
- `ineligible-book-not-allowed`
- `ineligible-no-protected-artifact`
- `ineligible-worker-unavailable`
- `ineligible-hard-compat-failure`

Warnings such as `drive-unconfigured` do not block protected mode by themselves.

## Rollout flags

The internal rollout layer supports:

- global enabled/disabled state
- explicit opt-in requirement
- allowlist by `bookId`
- denylist by `bookId`
- query overrides for internal testing:
  - `protectedRollout=on|off`
  - `protectedAllowAll=1|0`
  - `protectedBooks=...`
  - `protectedDenyBooks=...`

Default internal config keeps protected mode opt-in and book-scoped rather than global.

## Fallback policy

There are three allowed outcomes:

- `open-protected-reader`
- `redirect-to-old-reader-with-reason`
- `protected-unavailable-show-message`

The important distinction is:

- rollout/policy or artifact failures redirect to the old reader
- worker-unavailable stays fail-closed inside protected mode and shows a controlled message

That keeps the old reader as the stable safety net without silently downgrading protected
mode to a weaker runtime.

## Operational status surfaced in UI

Integrated protected diagnostics now expose:

- rollout enabled
- eligibility status
- rollout decision
- book allowed / allowlisted / denylisted
- protected artifact available
- worker available
- fallback reason
- Drive transport status
- compatibility status

This is enough for controlled internal use without introducing hidden text or debug
artifacts.

## What this step does not do

- no production-wide rollout
- no automatic migration from old reader
- no removal of the old reader
- no weakening of secure worker-only behavior
- no new backend sync model

## Published staging target

For live internal checks, the published target is a Pages preview deployment, not
`reader.pub`.

Expected preview route shape:

- old reader:
  - `/reader/?id=<bookId>`
- protected reader:
  - `/reader/?id=<bookId>&reader=protected&renderMode=shape&metricsMode=shape`

This keeps canonical production behavior unchanged while still making the protected route
available on a real deployment for readiness probes.
