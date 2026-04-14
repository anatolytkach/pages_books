# 85. Phase 12–14 Branch Boundary Summary

## Phase 12 — Unprotected Direct Runtime Readiness

`Phase 12` is a readiness phase.

It must produce:
- dependency baseline;
- iframe touchpoint inventory;
- bridge-adjacent inventory;
- direct runtime host requirements;
- risk map;
- verification matrix;
- Phase 13 entry gates.

It must not:
- remove iframe;
- introduce direct rendering;
- claim unprotected completion.

Actual outcome of the execution pass:
- bridge is not the main unprotected blocker for the scoped old-route flows;
- iframe-backed rendition/search/touch/theme ownership is the main blocker;
- `Phase 13` remains the first implementation phase.

## Phase 13 — Unprotected Runtime Replacement Skeleton

`Phase 13` is the first implementation phase for the replacement unprotected runtime.

After the pivot, `Phase 13` is no longer:
- an attempt to extract the legacy EPUB.js iframe runtime into a direct host

It is now allowed to:
- introduce a flagged new unprotected runtime path;
- introduce a direct render host for that new runtime;
- implement the runtime skeleton and contract wiring;
- keep the legacy iframe runtime untouched as the default path.

It is not allowed to:
- keep patching the legacy EPUB.js direct-host attempt as the main migration strategy;
- remove iframe;
- claim full unprotected feature completion;
- claim whole-reader no-iframe completion.

Current factual status after the first redefined implementation step:
- new unprotected runtime skeleton exists behind an explicit flag;
- legacy iframe path remains default;
- the new skeleton is real but not parity-complete.
- observed flag:
  - `unprotectedRuntime=new`
- observed current capability boundary:
  - direct host boot
  - runtime-owned API/state/events
  - first renderable state
  - basic section-level navigation/location
- observed missing capability boundary:
  - parity pagination
  - restore
  - search
  - annotations
  - selection

## Phase 14 — Unprotected Feature Completion And Whole-Reader Certification

`Phase 14` is the certification and completion phase.

It must prove:
- unprotected feature parity under the new replacement runtime;
- localhost + preview certification for the unprotected no-iframe path;
- whole-reader claims validity across both protected and unprotected paths.

Only after `Phase 14` may the project claim:
- unprotected iframe removed;
- whole reader no longer relies on iframe architecture.

## Boundary Rules

- `Phase 12` defines what must be migrated.
- `Phase 13` builds the new unprotected runtime skeleton.
- `Phase 14` closes feature parity and whole-reader certification.
- iframe removal is a post-parity removal step, not the definition of `Phase 13`.

Any document or rollout note that collapses these three phases into one completion claim is incorrect.
