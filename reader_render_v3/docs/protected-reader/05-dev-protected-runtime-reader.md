# 05 Dev Protected Runtime Reader

Updated: 2026-04-03

## Purpose

`reader_render_v3/dev/protected-reader.html` is a dev-only entry point that opens a runtime-safe protected artifact locally without touching:

- the current production reader
- the current catalog open flow
- worker routing for real users
- R2 upload logic

Its job is to prove that the runtime-safe contract is already sufficient for:

- loading one protected artifact
- rendering one chunk at a time to canvas
- navigating between chunks
- jumping by TOC
- performing controlled fine-grained intra-chunk selection and copy

## Entry point

Local URL:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686
```

Equivalent direct artifact form:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?artifact=../artifacts/protected-books/19686
```

Render mode variants:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape
```

## Files involved

Dev shell:

- `reader_render_v3/dev/protected-reader.html`
- `reader_render_v3/dev/protected-reader.css`
- `reader_render_v3/dev/protected-reader.js`

Runtime helpers used by the dev shell:

- `reader_render_v3/runtime/load-protected-manifest.js`
- `reader_render_v3/runtime/load-protected-chunk.js`
- `reader_render_v3/runtime/load-protected-locations.js`
- `reader_render_v3/runtime/load-protected-styles.js`
- `reader_render_v3/runtime/protected-book-model.js`
- `reader_render_v3/runtime/protected-navigation-model.js`
- `reader_render_v3/runtime/protected-layout-engine.js`
- `reader_render_v3/runtime/protected-canvas-renderer.js`
- `reader_render_v3/runtime/protected-hit-testing.js`
- `reader_render_v3/runtime/protected-selection-model.js`
- `reader_render_v3/runtime/protected-text-reconstruction.js`
- `reader_render_v3/runtime/protected-glyph-shape-registry.js`
- `reader_render_v3/runtime/protected-shape-metrics.js`
- `reader_render_v3/runtime/protected-shape-layout.js`
- `reader_render_v3/runtime/protected-shape-renderer.js`

## What runtime-safe data it reads

The shell reads only:

- `manifest.json`
- `toc.json`
- `locations.json`
- `styles.json`
- `chunks/chunk-*.json`
- `glyphs/chunk-*.glyphs.json`
- `shapes/chunk-*.shapes.json` when present

It must not read:

- `debug/chunks/*.debug.json`
- `debug/glyphs/*.glyphs.debug.json`

`loadProtectedBook()` and `loadProtectedChunkModel()` enforce this and throw on `/debug/` URLs or runtime-safe leakage fields such as `char`, `fullText`, or `text`.

## Temporary canvas renderer

The current renderer is intentionally temporary.

It:

- reconstructs visible glyphs in memory from runtime-safe `codePoint`
- uses `styles.json` as a temporary font policy
- lays out one chunk at a time with simple flow layout
- draws to canvas only
- can switch between:
  - `text` mode
  - `shape` mode

It does **not**:

- render final glyph paths
- perform Kindle-like pagination
- insert text nodes for the book into DOM

This is a contract-testing renderer, not a final production renderer.

### text mode

`text` mode is the current stable fallback:

- browser `measureText()`
- browser `fillText()`
- fine-grained selection already proven on top of this backend

### shape mode

`shape` mode is the new foundation layer:

- builds glyph render ops from chunk layout
- loads runtime-safe chunk-local `shapes/`
- creates a shape registry
- uses synthetic/placeholder shape descriptors to drive render intent
- still uses temporary visible fallback drawing for readable output

This is not yet glyph-path perfect, but it proves the runtime can render through a shape-aware abstraction rather than only text spans.

## Navigation behavior

The shell currently supports:

- load artifact root
- open first chunk
- prev/next chunk
- TOC jump to the chunk that carries the target anchor
- runtime metadata display:
  - title
  - current chunk id
  - order / total
  - current location id
  - active TOC label when present

## Selection and copy prototype

Current granularity is now **line/segment/offset aware inside the current chunk**.

Implemented behavior:

- `mousedown` starts selection at an offset inside a line fragment
- drag updates selection focus inside the current chunk
- `mouseup` finalizes a real range
- `Shift+click` extends from the existing anchor
- partial line spans are highlighted on overlay canvas
- `Copy selected text` reconstructs only the selected range in memory and writes it to the clipboard
- UI shows only status and counts, not the selected text itself

Not yet implemented:

- cross-chunk selection
- word snapping
- persistent highlights
- notes UI

Both render modes are expected to keep this selection/copy model working from runtime-safe artifact only.

## Why text does not enter DOM

The shell renders to canvas only.

It does not:

- inject book paragraphs into DOM
- keep a hidden text mirror
- use offscreen HTML for selection or copy

Selection and copy operate from runtime-safe metadata plus scoped in-memory text reconstruction.

The dev shell does not read any debug payloads while doing this.

## Manual local smoke test

1. Build runtime-safe artifact:

```bash
npm --prefix reader_render_v3 run protected:build -- --input books/content/19686 --output artifacts/protected-books/19686
```

2. Validate runtime-safe artifact:

```bash
npm --prefix reader_render_v3 run protected:validate -- --input artifacts/protected-books/19686
```

3. Start the local preview server if it is not already running:

```bash
node tools/dev/local_preview_server.mjs
```

4. Open:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686
```

To compare modes:

```text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=text
http://127.0.0.1:8788/reader_render_v3/dev/protected-reader.html?book=19686&renderMode=shape
```

5. Verify manually:

- first chunk is visible on canvas
- `Next chunk` and `Prev chunk` work
- TOC click jumps to a mapped chunk
- partial drag selection works inside a line
- multi-line selection works inside the current chunk
- `Shift+click` extends selection from the current anchor
- `Copy selected text` succeeds and reports copied length
- switching render mode does not trigger any `/debug/` fetches
- no hidden DOM text is used

## Remaining work before production-ready protected reader

- replace temporary `codePoint -> fillText` renderer with glyph path/shape renderer
- implement line/range hit-testing instead of block-only selection
- add controlled highlight/note persistence
- add better chunk-to-chunk reading state restoration
- later integrate dual-mode routing without changing old-book behavior
