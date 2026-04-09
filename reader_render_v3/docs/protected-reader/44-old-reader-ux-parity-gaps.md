# 44. Old Reader UX Parity Gaps

## Primary gaps found before this step

- menu/sidebar for protected books did not show:
  - cover
  - title
  - author
- protected books were using shell-adjacent technical controls instead of the old reader shell controls
- top-right control area was visibly incomplete:
  - search missing
  - old shell icons/actions missing
  - theme toggle present but not actually wired for protected engine
- notes for protected books were rendered in a temporary technical list instead of the old-style notes UI
- old-shell protected smoke depended on fragile selection/copy behavior and manual interpretation

## Gaps treated as mandatory for restoration

- menu metadata parity:
  - cover
  - title
  - author
- top-right control parity:
  - search entry point
  - theme toggle working
  - old shell icon area visibly restored
- removal of the green technical panel from normal UX mode
- notes panel parity using old-style notes rendering
- page-turn parity through old shell arrows and page state sync

## Acceptable controlled limitations

- bookmark and font controls remain visible in the top-right area, but are intentionally disabled with explicit unavailable state for protected books until protected-compatible implementations exist
- automation-safe UX smoke disables Drive in the embedded old-shell route:
  - this is for unattended testing only
  - it does not remove real Drive transport from the architecture
- cover can fall back to a generated protected-safe visual placeholder if no stable cover asset is available for the protected artifact

## Resulting parity target

Protected books in old-shell mode should now look and behave like:

- old reader shell outside
- protected engine inside
- no technical panel in the normal path
- old-style metadata and notes affordances
- search and theme controls present and working without degrading protected security boundaries

## Reading-behavior gaps that were promoted to primary parity items

See:

- [46-old-reader-reading-behavior-parity-gaps.md](/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/46-old-reader-reading-behavior-parity-gaps.md)

Primary reading gaps were:

- no real reflow from old-shell font controls
- page turn felt jumpy and lacked adjacent-page underlay
- right-click selection could fall back to the browser menu
- note jump did not visibly emphasize the target
- global counter and chapter-boundary continuity were not verified as first-class UX parity requirements
