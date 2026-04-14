# 92. Phase 13 (Redefined) — Unprotected Runtime Skeleton Execution

## Scope

This step introduces a **new** unprotected runtime skeleton behind an explicit flag.

It is allowed to do only this:
- create a new runtime branch;
- mount it in a direct host;
- expose runtime-owned API, state, and events;
- prove that the new path is real and does not use iframe as a runtime boundary.

It is not allowed to:
- continue legacy EPUB.js direct-host patching as the main strategy;
- remove iframe;
- change the default unprotected route;
- claim feature parity;
- claim whole-reader no-iframe completion.

## What Counts As The Skeleton

The skeleton is considered present only if all of the following are true:
- explicit route flag enables the new runtime;
- legacy route remains the default and stays alive;
- new runtime has separate modules for core/state/adapter/render host/event surface;
- new runtime owns its own state;
- new runtime emits shell-compatible events;
- new runtime mounts into a direct host with no iframe runtime boundary;
- new runtime API exists even where some methods are still marked not implemented.

## Intentionally Out Of Scope

Still out of scope for the redefined `Phase 13` track:
- final feature parity;
- iframe removal;
- default-route flip;
- legacy path cleanup;
- whole-reader no-iframe completion claim.

## Completion Criteria

This step is complete only if:
- new runtime skeleton route is real on localhost;
- skeleton proof runner is green for scoped goals;
- legacy unprotected route remains green;
- protected sanity remains green;
- preview does not contradict localhost if preview is reached;
- docs clearly state that this is a skeleton, not a parity-complete runtime.

## Current Execution Outcome

Implemented route flag:
- `unprotectedRuntime=new`

Observed route forms:
- localhost:
  - `/reader/?id=19686&unprotectedRuntime=new`
  - `/reader/?id=45&unprotectedRuntime=new`
- preview:
  - `/reader/?id=19686&unprotectedRuntime=new&_cb=20260413_phase13skeleton`
  - `/reader/?id=45&unprotectedRuntime=new&_cb=20260413_phase13skeleton`

Observed skeleton capabilities:
- runtime-owned API exists;
- runtime-owned state exists;
- runtime event surface exists;
- direct render root exists;
- no iframe runtime boundary is present on the new route;
- first renderable state is reached on localhost and preview;
- real page-level pagination/location model is live for the new runtime;
- basic section boundary transitions are live.

Observed follow-on capability status after `Phase 13.1` and `Phase 13.2`:
- implemented and browser-proven on the new runtime:
  - restore
  - runtime-owned search
  - selection state + toolbar wiring
  - highlights / notes create-and-display flow
  - bookmarks create / list / jump / delete
  - TOC jump and shell counter/theme/font wiring
- intentionally still not complete:
  - full parity certification
  - advanced navigation/search/selection edge cases beyond the current two-book corpus
  - iframe removal readiness

## Failure Criteria

This step fails if:
- the new route silently falls back to the legacy iframe runtime;
- iframe remains the runtime boundary for the new path;
- `contentDocument` remains the runtime source of truth;
- legacy route regresses;
- protected route regresses because of shared wiring changes;
- documentation overclaims parity or iframe removal readiness.
