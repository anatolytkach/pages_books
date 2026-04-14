# 97. Phase 13.2 Capability Plan

## Scope

This step advances the **new** unprotected runtime from pagination-only capability toward controlled multi-domain UX completion.

It does not:
- remove iframe;
- change the default legacy route;
- claim full parity;
- claim whole-reader no-iframe completion.

## Domain Order

Execution order is fixed:
1. Restore
2. Search
3. Selection
4. Highlights / Notes
5. Bookmarks
6. TOC / navigation edge cases
7. Shell parity
8. Corpus stability

## 1. Restore

- current status:
  - complete on the current proof corpus (`19686`, `45`)
  - runtime-owned persisted location is written and replayed after reload
  - TOC-adjacent restore is covered where meaningful for the current corpus
- target status:
  - runtime-owned persisted location
  - reload restore after next/prev
  - reload restore after TOC jump
- proof required:
  - dedicated restore runner
  - localhost + preview on `19686` and `45`

## 2. Search

- current status:
  - complete on the current proof corpus
  - runtime-owned submit / next / prev / clear are green
  - origin handling is explicit in runtime state
- target status:
  - runtime-owned results
  - submit / next / prev / clear
  - result-linked location changes
  - explicit origin handling
- proof required:
  - dedicated search runner
  - browser-visible count and location changes

## 3. Selection

- current status:
  - complete on the current proof corpus
  - DOM selection is reflected into runtime state with page token and geometry
- target status:
  - runtime-owned selected text + page token + basic geometry
  - selection toolbar visible in new route
- proof required:
  - dedicated selection runner
  - browser-created DOM selection reflected in runtime state

## 4. Highlights / Notes

- current status:
  - complete on the current proof corpus
  - create-highlight and add-note flows are green
  - direct-host mark rendering is green on the current page
- target status:
  - `createHighlight()`
  - `addNote()`
  - runtime-owned annotation state
  - direct-host display for current page
  - note jump
- proof required:
  - dedicated annotations runner
  - browser-visible note/highlight evidence

## 5. Bookmarks

- current status:
  - complete on the current proof corpus
  - create / list / jump / delete are green
- target status:
  - create / delete / list / jump
  - runtime-owned bookmark state
- proof required:
  - dedicated bookmarks runner
  - browser-visible overlay/jump evidence

## 6. TOC / Navigation Edge Cases

- current status:
  - partial
  - TOC jump and post-jump runtime stability are green on the current corpus
  - broader edge-case certification is still deferred
- target status:
  - TOC jump
  - boundary-aware next/prev after TOC
  - correct page/section synchronization
- proof required:
  - capability-summary runner
  - browser-level TOC jump and post-jump navigation

## 7. Shell Parity

- current status:
  - partial
  - counter, sidebar overlays, selection toolbar, theme and font controls are green on the current corpus
  - full shell parity against every legacy surface is still deferred
- target status:
  - counter
  - sidebar overlays
  - selection toolbar
  - theme/font controls
  - search controls
- proof required:
  - capability-summary runner
  - browser-visible shell state changes

## 8. Corpus Stability

- current status:
  - expanded in `Phase 13.3`
  - localhost runtime proof is green on `19686`, `45`, and `19`
  - preview runtime proof is green on `19686`, `45`, `77752`, and `77753`
  - localhost proof for `77752` and `77753` is still blocked by missing local content mirrors, not by observed iframe fallback on preview
  - preview `id=19` route is green as a route, but it is not the same content as localhost `id=19`, so cross-environment certification for that book remains blocked
- target status:
  - all domain runners executed on the representative corpus where meaningful
  - no success claim based on a single convenient book
  - removal readiness still requires closing the local mirror gap for mapped preview-only books
  - removal readiness also requires stable localhost/preview identity for every certification book
- proof required:
  - localhost matrix on locally available corpus
  - preview matrix on expanded corpus
  - issue register for anything still blocking removal readiness
