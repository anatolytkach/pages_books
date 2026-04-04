# Glyph Layout And Word Snapping

This step tightens the protected dev reader in two visible ways:

1. Selection is normalized to whole-word boundaries.
2. Highlight rendering is merged per line instead of exposing fragment or glyph rectangles.

## Word Snapping

The runtime now builds a word-boundary model from runtime-safe segment data only:

- `chunk.selectionLayer.textSegments`
- runtime-safe glyph `codePoint`
- reconstructed in-memory run text

No debug artifact is used, and no hidden DOM text is introduced.

`protected-word-boundary.js` scans segment text as an offset-addressable stream and records:

- `startOffset`
- `endOffset`
- block and segment identity

The current heuristic treats these as word characters:

- Unicode letters
- Unicode numbers
- apostrophe or hyphen when they are surrounded by word characters

Whitespace, hard gaps between segments, and basic punctuation terminate words.

Selection now keeps two offset forms:

- raw offsets from hit-testing
- snapped offsets for visible selection and copy

Copy always uses the snapped range, so copied output never contains a half-word boundary caused by dragging into the middle of a token.

## Merged Highlight

Internal geometry still exists at fragment and glyph level, but the visible overlay no longer exposes that structure by default.

The highlight pipeline now:

1. Computes the snapped selection range.
2. Intersects that range with each laid out line.
3. Produces one continuous highlight rect per selected line span.
4. Paints a soft gray rounded fill with no stroke.

This keeps the internal precision needed for hit-testing while making the UI look like a reading app instead of a geometry debugger.

## Debug Geometry

`debugGeometry=1` still enables development overlays, including:

- line boxes
- fragment boxes
- glyph boundary ticks
- word boundary markers

These overlays are never shown by default.

## Remaining Gaps

This is closer to Kindle-like behavior, but not yet glyph-perfect:

- snapping is word-oriented, not language-aware tokenization for every script
- cross-chunk selection is still out of scope
- shape-mode line breaking and hit-testing still use approximations where exact shaping data is unavailable
- highlight is line-merged, not contour-following around individual glyph shapes

## Interaction With Global Reading Model

Word-snapped selection now feeds directly into the global range model:

- raw offsets stay local and transient
- snapped offsets are used to build serializable range descriptors
- those descriptors can later cross chunk boundaries without introducing raw text leakage

That means the current word-snapping work is already aligned with future
highlights/notes persistence and restore flows.
