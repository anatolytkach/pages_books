# 82. Phase 12 — Unprotected Direct Runtime Readiness Execution

## Scope

`Phase 12` is a readiness-only phase for the unprotected no-iframe branch.

It exists to:
- establish the exact unprotected iframe and bridge dependency baseline;
- classify critical vs non-critical runtime dependencies;
- define the direct runtime host requirements for unprotected books;
- define the migration surface that Phase 13 will have to implement;
- define the verification gates required before any unprotected no-iframe host work begins.

It does **not**:
- remove the unprotected iframe;
- introduce unprotected direct rendering;
- claim unprotected completion;
- claim whole-reader no-iframe completion.

## Allowed Claims

After `Phase 12`, the strongest allowed claim is:
- unprotected no-iframe migration readiness has been baselined and packaged.

Still forbidden after `Phase 12`:
- unprotected path is no-iframe complete;
- unprotected iframe removal is done;
- whole reader is iframe-free;
- whole reader is bridge-free.

## Critical Dependency Definition

For `Phase 12`, a dependency counts as critical if removing or bypassing it would break any required unprotected user-visible flow:
- book open / route bootstrap;
- next / prev navigation;
- TOC navigation;
- reading-position restore;
- search lifecycle;
- theme / typography shell behavior;
- notes / bookmarks / share flows where supported on unprotected;
- shell lifecycle and sidebar/top-bar behavior.

## Required Inventory Output

`Phase 12` must produce:
- unprotected iframe touchpoint inventory;
- unprotected bridge-adjacent touchpoint inventory;
- shell/runtime/state/event/transport surface map;
- risk map for direct runtime adoption;
- verification matrix for Phase 13 entry.

Execution artifact produced from code and runtime evidence:
- `reader_render_v3/docs/protected-reader/86-phase-12-unprotected-iframe-dependency-audit.md`

## Required Verification Baseline

The readiness package must define exact expected checks for:
- localhost unprotected route;
- preview unprotected route;
- protected non-regression guardrail routes;
- parity, annotation, selection, persistence, copy surface, navigation, TOC, search, toolbar, and shell behavior where applicable.

## Phase 12 Done Criteria

`Phase 12` is done only when all of the following exist:
- explicit unprotected dependency baseline;
- explicit critical vs non-critical dependency classification;
- direct runtime host requirements for unprotected path;
- explicit migration surface list for Phase 13 and Phase 14;
- explicit verification gates for moving to `Phase 13`;
- explicit no-overclaim claim discipline;
- updated claims matrix and strategy docs aligned with the new branch.

Current factual outcome of the execution pass:
- zero critical bridge dependencies for the scoped unprotected old-route flows are proven on localhost and preview;
- zero critical iframe dependencies are **not** proven;
- actual Phase 13 blockers are now identified in route bootstrap, rendition host creation, search, theme application, and touch/swipe attachment;
- unprotected iframe removal remains future implementation work.

## Out Of Scope

Still out of scope in `Phase 12`:
- unprotected iframe removal;
- unprotected direct render host implementation;
- unprotected feature migration execution;
- whole-reader certification;
- cleanup beyond documentation needed for the readiness package.
