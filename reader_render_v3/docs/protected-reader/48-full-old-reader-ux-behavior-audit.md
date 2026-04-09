# 48. Full Old Reader UX Behavior Audit

## Old reader behavior inventory

- Reflow is tied to typography and viewport.
  Font-size controls and shell resize change line/page composition, not just scale.
- Reading viewport is stable.
  Loader clears after readiness; text does not sit under a permanent spinner.
- Page turn has adjacent-page context.
  `#viewer-prev`, `#viewer-next`, and `#swipe-shadow` provide the old underlay feel.
- Progress is whole-book.
  Footer and chapter line reflect whole-book position instead of chapter-local resets.
- Selection actions are custom.
  Desktop right-click selection leads into `#selectionToolbar` and then `#commentSheet`, not the browser context menu.
- Notes are interactive shell objects.
  Notes list jumps to the target and visibly marks the referenced range.
- Next/prev flow is continuous across chapter boundaries.

## Protected old-shell gaps that were visible before the final conformance pass

- page-turn iframe animation still introduced horizontal jerk
- underlay/shadow existed but was too weak to feel like old reader
- wide-screen spread/two-column mode was missing
- TOC entries could be no-ops inside the same chunk
- TOC items rendered as default boxed buttons
- dark-theme TOC emphasis was too light
- bookmark UX was not fully wired and verifiable
- chapter label context could degrade to `none`
- legacy readiness probes were still partially hardcoded to `1 / 2 -> 2 / 2`
- touch swipe needed full end-to-end verification in old-shell mode

## Primary blockers

- real viewport resize reflow
- no horizontal page-turn jerk
- visible underlay during turn
- shell-owned global counter authority
- TOC navigation/styling parity
- note/bookmark lifecycle parity
- touch parity
- comparative automation that fails on real UX gaps instead of stale assumptions
