# 08 Real Glyph Path Extraction

Updated: 2026-04-03

## Goal of this step

This step upgrades the protected pipeline from synthetic-only shape descriptors to real glyph path extraction for a substantial part of the smoke-book corpus.

The intent is still local and dev-only:

- no production cutover
- no hidden DOM text
- no debug artifact dependency in runtime

## Ingestion pipeline

The ingestion-side shape pipeline now has four stages:

1. resolve font policy
2. locate a usable font source
3. extract glyph path data
4. emit runtime-safe `shapes/chunk-*.shapes.json`

Relevant files:

- `reader_render_v3/tools/protected-ingestion/lib/extract-font-assets.js`
- `reader_render_v3/tools/protected-ingestion/lib/resolve-font-policy.js`
- `reader_render_v3/tools/protected-ingestion/lib/extract-glyph-paths.js`
- `reader_render_v3/tools/protected-ingestion/lib/build-shape-layer.js`

## Font source policy

The runtime-safe artifact does not depend on embedded font files at runtime, but ingestion now chooses a real source for path extraction.

Priority:

1. embedded book font, when present and usable
2. policy font derived from `styles.json` / font-plan
3. fallback serif policy

For smoke-book `19686`, the practical source is policy-driven rather than embedded.

Current real policy font used:

- `Times New Roman`

Current style variants available locally:

- regular
- italic
- bold
- bold-italic

## Shape record format

Each runtime-safe shape record can now contain:

- `shapeRef`
- `glyphId`
- `glyphToken`
- `styleToken`
- `scriptBucket`
- `source`
- `extractionStatus`
- `fontSourceType`
- `fontSourceName`
- `fontSourceRef`
- `advance`
- `advanceEm`
- `unitsPerEm`
- `bbox`
- `pathData`

Current `pathData` format:

- SVG path string

This is runtime-safe and can be converted into `Path2D` in the browser.

## Opaque runtime-safe contract

The current runtime-safe delivery form no longer exposes direct Unicode in the
shape layer.

The path bundle is now keyed by:

- chunk-local `glyphToken`
- `shapeRef`
- style and source metadata

It no longer exposes:

- `codePoint`
- `char`
- plain text strings

If runtime text reconstruction is needed for selection or copy, it happens through
the separate controlled internal reconstruction payload, not through `shapes/`.

## Extracted vs synthetic

This step does not require 100% extracted coverage.

Instead:

- extracted glyph paths are preferred
- synthetic shapes remain explicit fallback

For book `19686`, extracted coverage is already high enough to prove the path pipeline is real and materially useful.

## Runtime behavior

In shape mode, the dev runtime now:

- loads runtime-safe `shapes/`
- builds a shape registry
- parses extracted `pathData`
- paints extracted glyphs through path-based drawing
- uses synthetic fallback for remaining glyphs

Selection and copy still operate from the runtime-safe logical layout and the
controlled internal reconstruction model, not from debug files and not from DOM text.

After the path-aware metrics step, shape mode can also pair this extracted-path painting with:

- shape metrics backend
- glyph-box based offset mapping
- more precise hit-testing than the older text-metrics-only fallback

## What this changes relative to the previous step

Before:

- shape mode was architecturally shape-aware
- but visible drawing was still effectively synthetic everywhere

Now:

- shape mode uses real extracted glyph paths where available
- synthetic shapes are only fallback

This is much closer to the Kindle/Amazon direction, even though the layout and hit-testing layers are still approximate.

## What still remains

Still deferred:

- universal extraction for all scripts and font families
- production-grade shaping for complex scripts
- glyph-perfect layout metrics
- glyph-contour-accurate hit-testing
- final pagination engine

## Local verification

1. Build:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
```

2. Validate:

```bash
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

3. Open:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape
```

4. Confirm:

- shape mode renders the chunk
- diagnostics show extracted coverage greater than zero
- selection still works
- copy still works
- no `/debug/` requests appear
- no hidden DOM text implementation appears
