# 04 Runtime Contract v0

Updated: 2026-04-03

## Purpose

This document defines the boundary between the protected-ingestion artifact and the future `reader_render_v3` runtime.

It describes only runtime-safe data consumption. It does not define production routing or production cutover.

## Runtime-safe inputs

The future runtime may read only:

- `manifest.json`
- `toc.json`
- `locations.json`
- `styles.json`
- `chunks/chunk-*.json`
- `glyphs/chunk-*.glyphs.json`
- `shapes/chunk-*.shapes.json` when present

It must not require:

- `debug/chunks/*.debug.json`
- `debug/glyphs/*.glyphs.debug.json`

The runtime must reject any attempt to load `/debug/` payloads.

## Runtime-safe chunk contract

Each runtime chunk exposes:

- `chunkId`
- `sourceRefs`
- `logicalBlockList`
- `renderLayer`
- `selectionLayer`

### renderLayer

`renderLayer` provides:

- `chunkGlyphsRef`
- `textRuns[]`

Each text run exposes:

- `runId`
- `blockId`
- `styleToken`
- `glyphIds[]`
- `textLength`
- `sourceRef`
- `linkTarget`
- `styleSignals`

This gives the future renderer enough information to map chunk-local glyph ids onto a render surface without exposing raw chunk text.

### shape bundles

When present, `shapes/chunk-*.shapes.json` provides a runtime-safe shape layer for the same chunk.

Each shape record currently exposes:

- `shapeRef`
- `glyphId`
- `codePoint`
- `styleToken`
- `scriptBucket`
- `source`
- `extractionStatus`
- `fontSourceType`
- `fontSourceName`
- `fontSourceRef`
- `advance`
- `primitiveType`
- `advanceEm`
- `unitsPerEm`
- `bbox`
- optional `pathData`

Current allowed `source` values:

- `synthetic`
- `placeholder`
- `extracted`

At this stage, the protected runtime must treat:

- extracted shapes as the preferred runtime path
- synthetic shapes as honest fallback
- placeholder shapes as explicit future-compatible fallback

These are runtime-safe inputs, not debug data.

### selectionLayer

`selectionLayer` provides only runtime-safe logical range data:

- `textLength`
- `textSegments[]`
- `ranges[]`
- `blockAnchors[]`
- `noteAnchors[]`
- `copyRanges[]`
- `chunkRange`

It intentionally does not provide:

- `fullText`
- per-segment raw text
- hidden HTML text surrogates

## How selection/copy/highlights/notes stay possible

The runtime-safe contract keeps the structure needed for future controlled interaction:

- `textSegments` identify logical segment boundaries
- `ranges` define selectable logical intervals
- `blockAnchors` preserve stable block-level anchors
- `noteAnchors` preserve link/note attachment positions
- `copyRanges` preserve block-safe copy boundaries
- `locations.json` preserves chunk and block offsets

The future runtime can therefore:

- hit-test a user selection into logical ranges
- build a controlled copy plan from `copyRanges`
- anchor highlights and notes to `blockAnchors` and logical offsets
- restore reading position from `locations.json`

## Runtime text reconstruction policy

`reader_render_v3` may reconstruct only scoped text in memory from runtime-safe data:

- current run
- current block
- current selection range
- current chunk needed for immediate rendering

It must not expose convenience APIs such as:

- "return full text of the whole book"
- "inject full chunk text into DOM"
- hidden preview surfaces for the whole artifact

The temporary dev runtime may reconstruct code points into visible canvas text for contract testing, but only in memory and only for the currently loaded chunk.

This temporary renderer may still reconstruct code points into readable canvas output for fallback drawing, but extracted path shapes are now part of the runtime-safe contract.

## Render backend abstraction

The dev/runtime contract now supports two renderer backends:

- `text` mode
  - browser font metrics
  - `fillText`
  - offset mapping from measured text spans
- `shape` mode
  - glyph render ops
  - shape registry from runtime-safe `shapes/`
  - extracted path shapes where available
  - synthetic/placeholder shape descriptors where true extracted shapes do not yet exist

Both modes must consume only runtime-safe artifact files.

The renderer backend may change, but:

- the selection model
- the offset map
- the hit-testing model
- the controlled copy model

must continue to operate over the same logical runtime-safe data.

## Path payload format

Current extracted shapes use:

- `pathData`: SVG path string

This is runtime-safe and `Path2D`-friendly.

Runtime may parse it into cached path objects, but must not require debug payloads to do so.

## Controlled copy policy

Copy must be driven by runtime-safe selection metadata:

- selected logical positions
- selected line/segment spans
- logical offsets
- copy ranges
- block anchors
- chunk/location ids

Copy must not:

- use hidden DOM text
- read debug payloads
- depend on `fullText`

The runtime may reconstruct only the selected text needed for the current copy action and should surface only copy status in UI.

## Hidden DOM text is forbidden

The protected runtime must not implement selection/copy/highlights through:

- hidden text layers
- `opacity: 0` text mirrors
- offscreen text DOM
- clipped invisible HTML

Any selection/highlight/copy flow must operate on runtime-safe data plus controlled in-memory reconstruction.

## Data reserved for debug only

The following stay in debug-only payloads:

- glyph `char`
- chunk `fullText`
- any inspection-only friendly text fields

These fields exist only to verify ingestion locally and must never be treated as runtime requirements.

## Current dev-only contract testing layer

The first dev-only runtime reader inside `reader_render_v3/dev/` uses:

- runtime-safe `manifest`
- runtime-safe `locations`
- runtime-safe `styles`
- runtime-safe `chunk` and `glyph` files
- a temporary canvas renderer that can run in:
  - `text` mode
  - `shape` mode with extracted path painting where available

This is only a contract-testing layer. It is not the final glyph-shape renderer.

The dev shell must never:

- read debug files
- render text as DOM paragraphs
- expose reconstructed text in DOM widgets

It may expose diagnostics such as:

- render mode
- glyph op counts
- shape coverage
- metrics backend

but it must not log or surface raw chunk text as a convenience API.

## Fine-grained selection model

The current dev-only protected runtime already targets selection beyond whole-block granularity.

Runtime selection is modeled as:

- `anchor`
- `focus`
- normalized `start/end` logical positions

Each logical position is described with chunk-local runtime information such as:

- `chunkId`
- `blockId`
- `lineIndex`
- `segmentId`
- logical `offset`

The runtime converts this into:

- selected fragment spans
- selected line spans
- copy range requests
- future note/highlight anchors

This model is chunk-local for now. Cross-chunk selection remains deferred.

## Boundary between ingestion and runtime

### Ingestion is responsible for

- parsing book source
- preserving source traceability
- chunking text deterministically
- building runtime-safe render and selection layers
- emitting optional debug payloads separately

### Runtime is responsible for

- loading only runtime-safe artifact files
- validating artifact shape
- resolving chunk/glyph/style/location references
- later rendering and controlled interaction

## Deferred work

Still deferred beyond this step:

- final glyph path/shape renderer
- full pagination engine
- live note/highlight persistence
- production wiring
