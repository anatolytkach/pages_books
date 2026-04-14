# Phase 6 — Touch Triage And Recovery

## Exact failing touch scenario before recovery

### Iframe path
- Environment: localhost old-shell protected iframe path
- Scenario: headless touch long-press and drag on protected text surface
- Expected runtime state:
  - `selectionStarted=true`
  - `selectionActive=true`
- Observed before fix:
  - touch/pointer events reached the canvas
  - long-press fired
  - runtime did not keep touch selection active through the gesture

### Direct path
- Environment: localhost old-shell protected direct-render path
- Scenario: the same headless touch long-press and drag sequence
- Expected runtime state:
  - `selectionStarted=true`
  - `selectionActive=true`
- Observed before fix:
  - touch/pointer events were visible in the browser trace
  - runtime did not consistently enter active selection state
  - direct path also had earlier event-reception fragility because the direct subtree and overlay path did not behave like the iframe baseline

## Initial hypotheses considered
- touch events not really emitted
- pointerType mismatch
- wrong target element
- passive / preventDefault issue
- touch-action CSS issue
- pointer capture issue
- movement threshold too high
- gesture sequence wrong
- selection disabled in automation mode
- headless touch emulation bug
- runtime state gating bug

## Evidence used to distinguish product bug from harness/tooling bug
- focused browser probe with real touch-emulated sequence
- event trace for:
  - `touchstart`
  - `touchmove`
  - `touchend`
  - `pointerdown`
  - `pointermove`
  - `pointerup`
- trace fields:
  - `pointerType`
  - target element
  - coordinates
  - `defaultPrevented`
- runtime selection state trace:
  - `selectionStarted`
  - `selectionActive`
  - `claimed`
  - `moved`
- protected debug layout / geometry snapshot
- comparison of iframe path vs direct path under the same probe

## Root cause conclusions

### Iframe path
- Classification: real product bug
- Exact root cause:
  - touch/pointer pipeline was reaching the protected canvas correctly;
  - long-press also fired correctly;
  - but touch coordinate translation in `getCanvasPoint()` subtracted layout padding from the visible Y position and shifted touch hit-testing away from the actual text line.
- Affected module:
  - `reader_render_v3/dev/protected-reader.js`
- Why prior fixes were insufficient:
  - they addressed direct-host visibility and overlay routing;
  - they did not fix the core touch Y-coordinate mismatch inside the protected runtime itself.

### Direct path
- Classification: mixed product issue, not just harness
- Exact root cause:
  - direct mode inherited the same touch coordinate bug as iframe path;
  - in addition, direct mode needed explicit touch fallback handling in the same document context so that the touch sequence remained selection-capable under headless touch emulation and direct host event routing.
- Affected modules:
  - `reader_render_v3/dev/protected-reader.js`
  - previously relevant host-side direct render CSS/event routing in `reader_render_v3/integration/protected-old-shell-host.js`
- Why prior fixes were insufficient:
  - fixing direct subtree visibility and mobile sizing made direct render visible and correctly sized;
  - but touch selection still required corrected coordinate mapping plus explicit fallback touch handling in direct mode.

## What proves the blocker is resolved
- localhost iframe touch proof:
  - `selectionStarted=true`
  - `selectionActive=true`
- localhost direct touch proof:
  - `selectionStarted=true`
  - `selectionActive=true`
- preview iframe touch proof matches localhost
- preview direct touch proof matches localhost
- Phase 6 direct-render parity runner passes after touch proof

## Recovery scope actually used
- fixed protected runtime touch coordinate translation
- added focused touch instrumentation
- added focused touch-selection proof tool
- added/kept direct-path touch fallback handling only as needed for honest touch proof
- did not remove iframe
- did not remove bridge
- did not expand Phase 6 into Phase 7
