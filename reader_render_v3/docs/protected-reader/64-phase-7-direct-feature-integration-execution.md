# Phase 7 — Direct Feature Integration Execution

## Scope
- Make the protected old-shell direct path feature-complete under explicit flags.
- Route shell feature flows through runtime/adapter/event contract instead of bridge-first / polling-first ownership.
- Keep bridge path, iframe path, old-shell baseline, and unprotected baseline alive.

## Features in scope
- Selection lifecycle
  - selection start/change/clear
  - toolbar visibility / anchor from shell contract
  - copy / capture / highlight / note actions
- Search lifecycle
  - open / submit / next / prev / clear / return-to-origin
  - search highlights and current-result state
- Notes / bookmarks / annotations
  - create / delete
  - list refresh
  - jump / focus highlight
- Share / export
  - `exportNotesSharePayload`
  - protected route semantics preserved
  - no payload drift
- Theme / typography
  - shell theme toggle
  - render theme sync
  - font scale / font mode
  - feature-state survival across cycles

## Intentionally not fully direct-owned in Phase 7
- bridge transport remains present
- iframe path remains present
- bookmark persistence remains shell-owned storage backed by shared contract inputs, not protected-runtime-owned persistence
- harness / diagnostics UI remains present
- no dependency removal and no cleanup work from Phase 8+

## Explicit flags / routes used
- Bridge-backed old-shell baseline:
  - `reader=protected&protectedUx=old-shell`
- Direct feature path:
  - `reader=protected&protectedUx=old-shell&protectedCompatTransport=adapter&protectedRenderHost=direct`
- Existing standalone protected route remains part of regression matrix
- Old reader / unprotected route remains baseline

## Primary risks
- selection / toolbar lifecycle drifting between bridge and direct path
- search state or return-to-origin regressions
- notes / bookmarks list refresh desync
- share/export payload drift
- theme / typography cycles breaking feature state
- unprotected shell contract regressions
- localhost / preview mismatch

## Required evidence package
- protected build / validate
- existing regression matrix remains green
- new Phase 7 direct-feature parity runner green on localhost and preview
- bridge-backed old-shell path green
- direct feature path green
- unprotected shell baseline green
- compat / security checks green
- perf sanity within non-material regression band

## Completion Facts
- Direct feature verification ran under:
  - `reader=protected&protectedUx=old-shell&protectedCompatTransport=adapter&protectedRenderHost=direct`
- Feature domains verified green on bridge-backed and direct protected old-shell paths:
  - selection / toolbar
  - search lifecycle
  - notes create / focus / list refresh
  - bookmark create / jump / delete / list refresh
  - share/export payload shape parity
  - theme / typography cycles
- Unprotected baseline remained part of the shell-contract verification matrix through:
  - theme
  - search UI
  - sidebar visibility
  - shared reader event vocabulary
- Still intentionally legacy-backed after Phase 7:
  - bridge transport
  - iframe path
  - bookmark persistence storage ownership in old-shell host
  - rollout / fallback route machinery
