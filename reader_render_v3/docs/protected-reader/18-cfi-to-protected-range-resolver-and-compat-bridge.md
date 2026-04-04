# CFI To Protected Range Resolver And Compat Bridge

## Goal

This step adds the first real compatibility bridge between production note/share payloads and the protected range-first reader model.

The bridge is intentionally honest:

- `exact`
- `approximate`
- `unresolved`

It does not silently fabricate a successful import.

## New runtime modules

- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-cfi-resolver.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-production-import.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-production-export.js`

## Resolver strategy

The resolver uses only runtime-safe protected metadata:

- manifest
- locations
- global location model
- chunk/block boundaries
- `sourceRefs`
- `href`
- `nodeId`
- `nodeIndex`
- `spineIndex`

Resolution priority:

1. `href` + fragment -> exact node id block match
2. `cfi` -> approximate node index match
3. `href` without fragment -> approximate first block in href
4. `cfi` spine-only -> approximate first block in spine
5. otherwise unresolved

Imported ranges are currently expanded to block-level compatible ranges for note anchoring. This is a compatibility bridge, not a full CFI-to-intra-line reconstruction engine.

## Supported production payloads

The import bridge understands:

1. current production note objects
   - `{ id, cfi, href, quote, comment }`
2. legacy note objects
   - `{ annotatedAt, anchor, body }`
3. share payloads
   - `{ v, bookId, createdAt, notes[] }`
4. snapshot fragments
   - `notes[bookId]`
   - `positions[bookId]`

## Import report

Each import produces:

- `total`
- `exact`
- `approximate`
- `unresolved`
- `createdHighlights`
- `createdNotes`
- `warnings[]`
- per-item resolution entries

## Export bridge

Protected annotations export back into production-compatible structures through:

- production notes array
- share payload
- snapshot patch

Current limitation:

- truly native protected highlights do not yet have a real production CFI generator
- export therefore prefers stored production compatibility anchors from imported payloads
- annotations without compat anchors are reported as unresolved rather than silently mis-exported

## Dev shell integration

The dev shell now uses:

- repository abstraction
- production payload import
- production payload export
- import report diagnostics

This allows practical compatibility checking before any production cutover.

## Integrated reader usage

The same bridge now also powers the feature-flagged protected integration route. It is used for:

- production-style note/share import on open
- production CFI reading-state fallback
- protected annotation export back into production-compatible payloads

`notesz` now goes through the same bridge after a post-bootstrap gzip/base64url decode step. This keeps compressed-share transport compatible without making share decoding a hard dependency for protected artifact startup.
