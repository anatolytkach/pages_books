# 07 Shape-Aware Renderer Foundation

Updated: 2026-04-03

## Why this step exists

The dev-only protected reader already proved that runtime-safe artifact files are sufficient for:

- chunk rendering on canvas
- fine-grained intra-chunk selection
- controlled copy without hidden DOM text

This step adds the next architectural layer: a shape-aware renderer foundation.

The goal is not yet a production glyph-path engine. The goal is to stop treating the renderer as "just draw text spans" and instead route rendering through:

runtime-safe artifact -> layout model -> glyph render ops -> renderer backend

## Render modes

The dev shell now supports two runtime modes.

### Text mode

URL example:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=text
```

Characteristics:

- browser `measureText()`
- browser `fillText()`
- current stable fallback
- selection/copy accuracy is based on browser text metrics

### Shape mode

URL example:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape
```

Characteristics:

- chunk-local shape registry
- glyph render ops
- synthetic/placeholder shape descriptors from runtime-safe `shapes/`
- shape-aware metrics backend
- temporary readable drawing fallback for dev verification

This proves that rendering can proceed through a shape abstraction without reading debug payloads.

## Glyph render ops

For each laid-out fragment/run, runtime now derives glyph render ops with fields such as:

- `glyphId`
- `codePoint`
- `styleToken`
- `fontFamilyCandidate`
- `scriptBucket`
- `x`
- `y`
- `baselineY`
- `advance`
- `width`
- `height`
- `lineIndex`
- `blockId`
- `segmentId`
- `startOffset`
- `endOffset`
- `shapeRef`
- `shapeStatus`
- `shapeSource`
- `renderMode`

These ops are the bridge between runtime-safe artifact data and the renderer backend.

## Shape bundle format

Protected build now emits runtime-safe shape bundles:

- `shapes/chunk-000001.shapes.json`
- `shapes/chunk-000002.shapes.json`

Each bundle currently contains:

- `chunkId`
- `version`
- `shapeRecords[]`

Each shape record currently includes:

- `shapeRef`
- `glyphId`
- `styleToken`
- `scriptBucket`
- `source`
- `primitiveType`
- `advanceEm`
- `bbox`
- optional `path`

Current `source` is mostly:

- `synthetic`

After the real path-extraction step, the bundle may also contain:

- `extracted`

This is intentional. The format is already runtime-safe and forward-compatible even though true extracted glyph paths are not yet present.

## Shape registry

The runtime shape registry:

- indexes `shapeRef -> shapeRecord`
- maps glyphs to shape records
- computes coverage diagnostics
- tracks source counts such as `synthetic`, `placeholder`, `extracted`, `missing`

This registry is built only from runtime-safe artifact files and must not consult debug payloads.

## Shape-aware metrics

The layout engine now supports a metrics backend abstraction:

- text metrics backend
- shape metrics backend

The shape metrics backend currently uses synthetic advance heuristics derived from runtime-safe glyph metadata and shape descriptors.

This is not yet typographically perfect, but it allows the layout engine to stop depending exclusively on browser text metrics.

After the path-aware metrics step, shape mode prefers the shape metrics backend by default and falls back to text metrics only when needed.

## What shape mode already does

In shape mode the runtime now:

- loads `shapes/` for the current chunk
- creates a shape registry
- builds glyph render ops
- renders through a shape-aware renderer entry point
- paints extracted glyphs through path-based drawing where `pathData` is available
- falls back to synthetic drawing for the remaining glyphs

The visible output is now mixed-mode:

- extracted glyphs: path-based drawing
- fallback glyphs: synthetic/readable fallback drawing

This is still not final production fidelity, but it is a real move away from pure synthetic placeholders.

## What remains different from Amazon/Kindle

Still missing relative to a production-grade glyph-aware web reader:

- extracted glyph paths for the real runtime fonts
- glyph-path rendering instead of temporary readable fallback drawing
- glyph-aware hit-testing from actual contours
- higher-precision shaping for complex scripts
- pagination coupled to final glyph metrics

## Guardrails that remain in force

Even after adding shape mode, the runtime must still not:

- read `debug/` payloads
- inject hidden DOM text
- expose convenience APIs for whole-book or whole-chunk text
- leak reconstructed text through diagnostics or UI

## Practical local check

1. Rebuild runtime-safe artifact:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
```

2. Validate:

```bash
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

3. Open both:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape
```

4. Confirm:

- the chunk renders in both modes
- selection still works in both modes
- copy still works in both modes
- no `/debug/` requests appear
- no hidden DOM text implementation appears
