# 09 Path-Aware Metrics And Hit-Testing

Updated: 2026-04-03

## Goal of this step

This step moves shape mode closer to Kindle/Amazon behavior by reducing its dependence on browser text metrics.

It does this by introducing:

- a shape-aware metrics backend
- per-glyph geometry for current chunk layout
- shape-aware offset mapping
- path-aware hit-testing in shape mode

It does not yet attempt:

- glyph-perfect contour hit-testing
- cross-chunk selection
- final pagination

## Metrics backends

The dev shell can now compare three practical states:

1. `renderMode=text`
   - text renderer
   - text metrics
2. `renderMode=shape&metricsMode=text`
   - shape renderer
   - text metrics fallback
3. `renderMode=shape&metricsMode=shape`
   - shape renderer
   - shape-aware metrics backend

## Shape-aware metrics backend

The shape metrics backend uses runtime-safe shape data:

- `advance`
- `advanceEm`
- `bbox`
- extracted/synthetic source information

From that it derives:

- per-glyph advances
- cumulative x positions
- glyph boxes
- fragment width
- line ascent/descent approximation
- line height contribution

This is still an approximation, but it is now based on shape records rather than only `measureText()`.

## Geometry model

Current chunk layout now exposes enough geometry for better hit-testing:

- line boxes
- fragment boxes
- glyph boxes / per-glyph advance spans
- logical start/end offsets
- mapping from offset to geometry and back

This geometry stays runtime-safe and does not require debug payloads.

## Hit-testing

Shape-mode hit-testing now prefers geometry derived from the shape metrics backend.

That means pointer resolution inside a fragment now consults:

- glyph boxes
- local x positions
- nearest glyph boundary

instead of only using coarse text-span width approximation.

This produces better start/end boundary placement during drag selection and shift-click extension.

## Selection and copy impact

Selection and copy still use the same logical model:

- normalized `anchor/focus`
- logical offsets
- selection layer segments and ranges
- reconstruction by controlled internal scalar payload

What changed is primarily the precision of choosing those offsets in shape mode.

On top of that, the runtime now applies a word-boundary snapping pass:

- raw hit-tested offsets remain available for internal diagnostics
- user-visible selection resolves to snapped whole-word boundaries
- copy uses snapped offsets, so it never emits half-word fragments caused by drag endpoints

This keeps the geometry pipeline precise while making the UX behave more like a reading app.

## Debug geometry overlay

Dev shell now supports an optional geometry overlay that can show:

- line boxes
- fragment boxes
- glyph boundary ticks
- word boundary markers

This is graphics-only and does not expose hidden text.

## Local comparison URLs

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape&metricsMode=text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape&metricsMode=shape
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape&metricsMode=shape&debugGeometry=1
```

## Remaining gap to production-grade precision

Still missing:

- contour-accurate glyph hit-testing
- fully path-driven line breaking
- better shaping for complex scripts
- final pagination tied to extracted glyph geometry

This step now feeds a broader reading model:

- page slices map back to global offsets
- hit-tested offsets can be serialized into stable range descriptors
- restore tokens can resolve back into chunk/page targets

## Opaque render path boundary

After the opaque-glyph contract update, shape-mode geometry is derived from runtime-safe
glyph tokens and shape refs, not from a readable Unicode stream in the delivery payload.

That means:

- render path stays glyph-oriented and opaque
- metrics and hit-testing work from shape geometry
- reconstruction remains a separate controlled internal path used only when runtime
  logic explicitly needs text for selection or copy

After the window-scoped reconstruction step, text-mode painting is also expected to
decode only the current visible page slice rather than materializing whole-chunk text
as a convenience layer.

## Annotation interaction

The highlight/note foundation now reuses the same geometry model:

- current selection uses hit-tested and word-snapped offsets
- saved highlights project their stable ranges back into the current chunk/page
- overlay rendering stays canvas-only

This means annotations do not introduce a second text-oriented layout path.
