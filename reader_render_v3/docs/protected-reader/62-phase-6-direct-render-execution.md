# Phase 6 — Direct Render Execution

## Scope
- Introduce a protected old-shell direct-render host path behind an explicit flag.
- Keep the iframe-backed old-shell path alive and unchanged.
- Prove direct render uses the same DOM coordinate space as the shell without removing bridge or iframe.

## Direct render path in this phase
- Direct render mode is:
  - `protectedRenderHost=direct`
- Current baseline iframe mode remains:
  - no `protectedRenderHost=direct`

## Intentionally unchanged
- iframe path remains required and supported
- bridge transport remains present
- compatibility layer remains present
- old reader route semantics remain unchanged
- unprotected route semantics remain unchanged
- no default-route switch to direct render
- no bridge cleanup
- no iframe cleanup

## Primary risks / blockers
- coordinate drift between shell and render surface
- selection geometry misalignment
- search / note / focus highlight misalignment
- toolbar anchor drift
- theme divergence in direct mode
- touch/pointer lifecycle mismatch
- localhost vs preview divergence

## Required evidence package
- `protected:build`
- `protected:validate`
- existing iframe-backed regression matrix remains green
- direct-render parity runner exists and is green
- browser-level checks cover:
  - desktop light/dark
  - selection geometry
  - search highlight visibility
  - focused note/highlight visibility
  - toolbar anchor
  - touch page-turn
  - touch selection
- preview verification is required before phase closure if localhost passes

## Current factual status
- direct-render old-shell host flag introduced
- iframe path preserved
- direct old-shell bridge-shaped surface now publishes in direct mode
- direct mobile sizing bug fixed
- touch-selection blocker was traced to:
  - incorrect runtime touch coordinate translation in iframe/direct shared code
  - direct-path touch pipeline needing explicit fallback handling under headless touch emulation
- focused touch-proof tooling added:
  - `reader_render_v3/tools/internal/check-phase6-touch-selection-proof.js`
- localhost touch proof is green for:
  - iframe path
  - direct path
- preview touch proof is green for:
  - iframe path
  - direct path
- direct-render parity runner is green on localhost and preview
- current phase status after recovery:
  - complete with warnings only for non-blocking pilot-readiness skip on missing production payload fixture
