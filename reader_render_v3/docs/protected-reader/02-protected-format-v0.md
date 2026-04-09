# 02 Protected Format v0

Updated: 2026-04-03

## Status

This is the current working protected-book contract for the dry-run ingestion skeleton inside `reader_render_v3`. It exists only for local tooling and future runtime preparation. It does not change the current public reader, catalog, or R2 behavior.

## Non-negotiable compatibility rules

1. Existing books continue to work without changes.
2. New protected books must **not** be delivered as direct HTML / exploded EPUB directories.
3. `reader_render_v3` must support both existing unprotected books and new protected books.
4. Protected-book text must **not** land in the DOM as normal text.
5. Hidden DOM text is forbidden as the primary strategy for selection / copy / notes.
6. Each protected chunk must contain two explicit layers:
   - render layer
   - selection layer
7. Runtime-safe artifact and debug artifact must be physically separated.
8. Runtime-safe payloads must not contain raw `char`, `fullText`, or equivalent plain-text leakage fields.
9. `glyph id -> symbol` mapping must not be global.
10. Glyph mapping must change at least at the chunk level.
11. This step does not implement server-side anti-fast-flip protection.

## Artifact layout

```
manifest.json
toc.json
locations.json
styles.json
assets/...
chunks/chunk-000001.json
chunks/chunk-000002.json
glyphs/chunk-000001.glyphs.json
glyphs/chunk-000002.glyphs.json
debug/                  # only when debug artifact is enabled
debug/chunks/chunk-000001.debug.json
debug/glyphs/chunk-000001.glyphs.debug.json
```

## Runtime-safe vs debug artifact

### Runtime-safe artifact

This is the default output of `protected:build`.

It is the only artifact the future `reader_render_v3` runtime helpers are allowed to read.

It must not contain:

- `char` in glyph records
- `fullText` in selection payloads
- any equivalent direct plain-text fields that would let a caller reconstruct chunk text by trivially reading one runtime-safe JSON file

### Debug artifact

This is generated only with `--debug-artifact`.

It may contain:

- `char`
- `fullText`
- additional friendly inspection fields

It must live under `debug/` and must not be required for runtime-safe validation.

## File purposes

### manifest.json

Top-level runtime-safe descriptor.

Contains:

- protected format version
- book metadata
- chunk list
- pointers to `toc.json`, `locations.json`, and `styles.json`
- runtime-safe mode marker
- debug availability marker

Must not contain:

- readable book text
- global glyph tables
- exploded EPUB structure

### toc.json

Logical TOC retained for user-facing navigation.

Contains:

- labels
- href/fragment metadata from the source
- enough information to map TOC entries back to chunks and anchors later

### locations.json

Runtime-safe logical locator map.

Contains, per chunk:

- `chunkId`
- chunk order
- stable location id
- cumulative logical offsets
- text length
- block boundaries
- source refs
- TOC-related anchors where available
- restore-position anchor
- note-anchor placeholders

This is not final pagination. It is a viewport-independent logical map for future reader state, notes, and highlights.

### styles.json

Runtime-safe style registry.

Contains:

- style tokens
- block role and heading level where available
- bold / italic / bold-italic / superscript / linkLike flags
- script bucket
- font policy hints
- font plan gaps if known

### chunks/chunk-000001.json
### chunks/chunk-000002.json

Runtime-safe chunk payloads.

Must contain:

- `chunkId`
- source refs
- logical block list without raw text
- `renderLayer`
- `selectionLayer`

#### renderLayer

Carries:

- refs to chunk glyph payload
- text runs as glyph ids
- style tokens
- source traceability

Must not carry direct text strings.

#### selectionLayer

Carries only runtime-safe logical selection data:

- `textLength`
- `textSegments` without raw text
- `ranges`
- `blockAnchors`
- `noteAnchors`
- `copyRanges`
- `chunkRange`

It preserves the architecture required for future selection/copy/highlights/notes without using hidden DOM text.

### glyphs/chunk-000001.glyphs.json
### glyphs/chunk-000002.glyphs.json

Runtime-safe chunk-local glyph tables.

Each glyph record may contain:

- `glyphId`
- `codePoint`
- `styleToken`
- `fontFamilyCandidate`
- `scriptBucket`
- `glyphClass`
- `stableRenderClass`
- placeholder shape metadata

It must not contain:

- `char`
- raw text payload

### debug/chunks/*.debug.json
### debug/glyphs/*.glyphs.debug.json

Optional debug-only payloads.

These may contain `fullText`, `char`, and other convenience fields for local inspection. They are not part of the runtime-safe contract.

## Current operating model

### Existing unprotected books

Remain unchanged:

- stored as exploded EPUB-style directories or current local storage roots
- opened by the current working reader flow
- catalog behavior unchanged

### New protected books

Are built locally by the protected dry-run builder into runtime-safe chunk artifacts plus optional debug payloads.

## What this spec intentionally does not include yet

- final page layout engine
- final canvas renderer
- server-side throttling / bot protection
- production upload orchestration
- production catalog cutover
