# Copy Surface Hardening

This hardening step removes the last generic text helper surface from the protected
runtime.

## What changed

- `reader_render_v3/runtime/protected-copy-engine.js` was removed.
- `buildCopyPayload()` no longer exists in the runtime.
- the only sanctioned book-text response is the narrow worker action
  `copyCurrentSelection`
- `createAnnotationFromCurrentSelection` no longer returns quote/context excerpts
  from the book

## Current text boundary

Protected worker responses now follow this rule:

- snapshot/render/runtime packets: no book text
- annotation creation payloads: no book text
- copy action payload: selected clipboard text only

The remaining copy response is intentionally narrow:

- `success`
- `clipboardText`
- `selectedChars`
- `selectedBlocks`
- `selectedLines`

## Guards

`protected-worker-protocol.js` now enforces forbidden text-like fields across
worker payloads, including:

- `text`
- `textFragments`
- `pageText`
- `lineText`
- `segmentText`
- `fullText`
- `quote`
- `quoteText`
- `previewText`

`protected-worker-core.js` asserts that snapshots and annotation payloads stay
clean before they leave the worker.

`protected-canvas-renderer.js` rejects any render packet that contains forbidden
text-like fields on the main thread.

## Why this matters

Previously, an attacker could target dormant helpers such as `buildCopyPayload()`
even after the UI stopped using them. Removing that helper and sealing worker
responses reduces the hidden extraction surface to one explicit, action-scoped
clipboard path.
