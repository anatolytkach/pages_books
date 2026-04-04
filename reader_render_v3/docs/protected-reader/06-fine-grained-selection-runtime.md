# 06 Fine-Grained Selection Runtime

Updated: 2026-04-03

## Goal of this step

This step raises the dev-only protected runtime from block-level selection to fine-grained intra-chunk selection.

The current runtime can now target:

- part of a line inside one paragraph
- multiple neighboring words inside one block
- a range that starts in one block and ends in another block inside the same chunk
- partial copy from that actual selected range

It still avoids:

- hidden DOM text
- debug artifact reads
- production cutover

## Selection model

Selection state is held as runtime positions:

- `anchor`
- `focus`
- normalized `start`
- normalized `end`

Each position currently includes:

- `blockId`
- `lineIndex`
- `segmentId`
- `offset`

The runtime then derives:

- selected fragment spans
- selected line spans
- selected block anchors
- selected char count
- copy-ready start/end logical offsets

## Offset-aware hit-testing

Hit-testing is now canvas-driven and offset-aware:

1. find the line box under the pointer
2. find the fragment on that line
3. use browser text metrics and cumulative prefix widths
4. return the nearest logical offset inside that fragment

This is an approximation layer based on browser fonts and `measureText()`.
It is good enough for dev-only selection/copy testing, but it is not yet glyph-path exact.

In the current renderer foundation, this offset-aware selection model remains stable across two renderer backends:

- `text` mode
- `shape` mode

The render backend may change, but selection continues to operate over the shared logical layout and offset model.

Even after real extracted shapes are introduced, selection is intentionally allowed to stay on the current approximation backend until glyph-path metrics and hit-testing become precise enough to replace it safely.

That transition has now started:

- shape mode can run with text-metrics fallback
- or with shape-aware metrics and glyph-box based offset mapping

Selection still uses the same logical range model, but the start/end offsets chosen in shape mode can now come from a more precise geometry backend.

## Current selection interactions

Implemented now:

- `mousedown` sets anchor
- drag updates focus across offsets
- `mouseup` finalizes the range
- `Shift+click` extends selection from existing anchor

Current scope:

- fine-grained selection **within the current chunk**
- multi-line selection inside the current chunk
- multi-block selection inside the current chunk

Not yet implemented:

- cross-chunk selection
- touch handles
- glyph-perfect caret placement

Word snapping is now enabled for the visible runtime selection:

- raw pointer offsets are still collected internally
- visible selection and copy are normalized to word boundaries
- click selects a whole word
- drag selection expands to whole-word boundaries

## Partial text reconstruction for copy

Copy no longer works by whole-block reconstruction.

It now:

- takes normalized start/end offsets
- walks runtime-safe `textSegments`
- reconstructs only the intersecting part of each segment from `glyph.codePoint`
- joins those pieces in reading order

This uses only:

- `renderLayer.textRuns`
- `selectionLayer.textSegments`
- runtime-safe glyph tables
- logical offsets

It does not use:

- debug `fullText`
- debug glyph `char`
- DOM text mirrors

## Visualization

Selection is visualized with merged per-line highlight spans:

- partial line spans
- multiple lines
- multiple blocks in one chunk

The runtime still keeps fragment and glyph geometry internally, but default UI highlight is
rendered as soft gray merged line rectangles rather than debug-style fragment boxes.

## Global range foundation

The current selection model now feeds a global reading layer:

- local snapped offsets can be converted to global book offsets
- runtime-safe selection can be serialized as a stable range descriptor
- the same descriptor can later be extended to cross-chunk highlights and notes

Current dev shell also exposes restore-token and serialized-range controls built on top
of the same offset model.

## Why this is still not Amazon-like precision

The current runtime is still an approximation compared to Kindle Web:

- it reconstructs visible text from `codePoint`
- it still primarily uses browser/font-derived layout metrics
- it now can paint extracted glyph paths in shape mode, but layout/hit-testing remain approximate
- it does not yet shape complex scripts with final runtime glyph geometry

What it already matches conceptually:

- no hidden DOM text
- no debug payload dependency
- canvas-based visible surface
- controlled in-memory reconstruction for rendering and copy
- renderer backend abstraction decoupled from selection/hit-testing

## Next precision steps

To move closer to Amazon/Kindle behavior later:

- replace temporary text drawing with glyph path/shape rendering
- improve shaping for mixed scripts/styles
- move from approximation hit-testing to glyph-aware hit-testing
- add highlight/note persistence on the same logical range model
