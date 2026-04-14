# Phase 5 — Typed Events / Subscription Replacement Execution

## Scope
`Phase 5` заменяет critical UI dependency on `summary/polling` на typed events/subscriptions.

Primary target:
- protected runtime → old-shell host state flow
- adapter event delivery
- canonical UI-level reader contract events

Secondary target:
- shared shell event semantics for unprotected path without runtime rewrite

## Что именно заменяется
Primary source of truth for critical flows changes from:
- `getSummary()` polling
- host-side state reconstruction from repeated summary reads

to:
- runtime subscriptions
- canonical UI-level events
- direct event delivery through adapter and bridge-compatible surfaces

## Canonical events
Canonical reader-interface events for this phase:
- `pageChanged`
- `selectionChanged`
- `searchStateChanged`
- `annotationsChanged`
- `themeChanged`
- `readingPositionChanged`
- `toolbarStateChanged`

Shared shell may also use:
- `sidebarStateChanged`
- `bookmarkUpdated`
- `noteFocused`

## Summary paths downgraded in this phase
The following paths must stop being primary for critical UX:
- old-shell host interval polling of `getSummary()`
- selection-toolbar reopening based on repeated summary polling
- search / page / theme shell refresh driven mainly by polling

Allowed to remain:
- `getSummary()` as compatibility snapshot/fallback
- one-shot summary reads during bootstrap or explicit fallback recovery

## What must not be touched
- bridge removal
- iframe removal
- compatibility-layer removal
- direct rendering work
- route semantics rewrite
- payload format changes
- deep runtime rewrite
- protected-only internal event leakage into public contract

## Required Phase 5 evidence
- canonical event model documented
- protected runtime emits typed UI-level events
- adapter surface delivers events
- bridge path remains working
- unprotected path remains non-regressed and exposes shared shell events
- localhost green
- preview green
- compat green
- browser-level behavior confirmed
