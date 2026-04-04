# Global Reading Model And Pagination Foundation

This step lifts the protected dev reader from a chunk-only runtime to a book-level
reading model.

## Global location model

The runtime now builds a stable coordinate space from runtime-safe `manifest.json`
and `locations.json`.

Each global position can carry:

- `bookId`
- `chunkId`
- `chunkOrder`
- `localOffset`
- `globalOffset`
- `blockId`
- `lineIndex`
- `locationId`
- `sourceRef`
- `restoreAnchor`

This lets the reader convert:

- chunk-local offsets to global offsets
- global offsets back to chunk/local targets
- current page position into a restore token

## Serializable ranges

Selections can now be serialized as runtime-safe range descriptors.

The range descriptor stores:

- `bookId`
- `selectionMode`
- `wordSnapped`
- `start`
- `end`
- source anchors
- a non-text seed for future excerpt/checksum work

It does not store raw excerpt text or debug payload.

The descriptor is intentionally independent from direct Unicode leakage in the
runtime-safe render contract. It is built from stable offsets, anchors, and chunk
metadata, while actual text reconstruction stays in the controlled internal layer.

## Cross-chunk foundation

The engine can now represent and reconstruct a range that spans multiple chunks.

Current scope:

- normalize a range with `start <= end`
- list affected chunks
- reconstruct copy text across chunk boundaries in memory

This is the data/model layer only. Full multi-chunk drag UI is still deferred.

## Pagination foundation

The dev reader now treats the current chunk as a sequence of page slices.

Each page slice stores:

- page index
- page count within chunk
- line start/end indexes
- viewport top/height
- local start/end offsets
- global start/end offsets

Prev/next page navigation can now:

- move within the current chunk
- roll forward into the next chunk
- roll backward into the previous chunk

This is not yet a final book-wide pagination engine, but it already ties page
navigation to stable global offsets.

## Restore token model

The runtime can now produce a serializable restore token from the current page.

The token stores:

- `bookId`
- current page index/count
- stable global position payload

The dev shell can:

- copy restore token
- restore reader state from token

No raw book text is stored in the token.

## Render path vs reconstruction path

The current protected reader now has a clearer architectural split:

- runtime-safe render path:
  - opaque chunk-local glyph tokens
  - shape refs and placement ops
  - no direct `codePoint` or `char` fields
- controlled reconstruction path:
  - sealed embedded substrate
  - used only for runtime actions that require text reconstruction
  - still not exposed in DOM or debug delivery

This matters for future highlights and notes, because book-level range persistence
must survive even if the render contract remains glyph-oriented rather than text-oriented.

After the reconstruction-surface minimization step, page navigation and restore logic
still use the same global offsets, but visible-page text reconstruction is now expected
to be page-scoped and ephemeral rather than chunk-scoped and retained.

## Why this is the right foundation

Notes, highlights, saved selections, and reading-position persistence all need a stable
book-level coordinate system before persistence logic is added.

This step provides that foundation while keeping the current constraints:

- no hidden DOM text
- no debug artifact usage
- no production cutover

## Remaining gaps

- cross-chunk drag selection UI
- highlight persistence
- notes/annotations persistence
- final pagination edge cases
- richer restore heuristics if the underlying chunking ever changes

## Annotation foundation on top of global ranges

The next layer now uses this model directly for highlights and notes.

Highlights are anchored by the existing serializable range descriptor, and notes attach
to either the same range or a related highlight id. Page and chunk re-entry use the same
global offsets and page-resolution helpers already described above.

This keeps annotations aligned with:

- global offsets
- chunk/local offsets
- location ids
- restore anchors

without adding a second competing coordinate system.

## Worker-hosted page preparation

Page navigation and restore flows can now be prepared behind a worker boundary.

The same stable global offsets are still the source of truth, but:

- chunk loading
- page model preparation
- restore resolution

no longer need to live directly in the UI controller when worker mode is available.
