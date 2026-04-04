# Narrow Copy And Annotation Selection APIs

The previous protected worker protocol exposed a generic `REQUEST_COPY_PAYLOAD` action. Even though it was selection-scoped in practice, the API shape was too broad and invited future drift toward generic range-text extraction.

This step replaces that surface with two explicit worker-only actions:

- `copyCurrentSelection`
- `createAnnotationFromCurrentSelection`

## Why `REQUEST_COPY_PAYLOAD` Was Removed

`REQUEST_COPY_PAYLOAD` mixed two concerns:

- user-initiated clipboard copy
- a reusable text extraction endpoint

That made the protocol weaker than necessary. A protected reader should not expose a generic "give me text for the current range" primitive to the main thread.

## New APIs

### `copyCurrentSelection`

Works only on the active worker-side selection state. It does not accept an arbitrary range.

Response:

```json
{
  "success": true,
  "clipboardText": "…",
  "selectedChars": 42,
  "selectedBlocks": 1,
  "selectedLines": 1
}
```

Constraints:

- reconstructs only the current selection
- returns only clipboard text plus minimal counts
- does not return page text, chunk text, diagnostics text, or previews

### `createAnnotationFromCurrentSelection`

Also works only on the active worker-side selection state.

Response fields:

- persisted annotation fields:
  - `annotationId`
  - `type`
  - `bookId`
  - `rangeDescriptor`
  - `color`
  - `createdAt`
  - `updatedAt`
  - `metadata`
- narrow helper fields:
  - `anchor`
  - `quote`
  - `quoteHash`
  - `contextBefore`
  - `contextAfter`
  - `selectedChars`
  - `selectedBlocks`
  - `selectedLines`
  - `noteText` for note annotations

`anchor` is the source of truth. `quote` is only a helper field.

## Reconstruction Limits

Worker reconstruction is action-scoped:

- selected quote only
- `contextBefore` limited to 48 characters
- `contextAfter` limited to 48 characters

This intentionally prevents:

- paragraph dumps
- page text dumps
- chunk text dumps

## Main-Thread Boundary

Regular snapshots and render packets remain text-free. The main thread only receives readable book text through the two narrow user-initiated actions above.

Specifically, snapshots still must not contain:

- `textFragments`
- `pageText`
- `lineText`
- `segmentText`
- `quoteText`
- `previewText`
- `fullText`

## Security Effect

Compared with the previous design:

- there is no generic copy-payload API
- annotation creation no longer reconstructs text in the main thread
- reconstruction is constrained to explicit user actions
- the worker protocol is narrower and easier to audit

## Remaining Risk

This still does not make browser extraction impossible. A strong attacker can still instrument the worker and intercept action results. The goal here is narrower protocol surface and reduced accidental exposure, not absolute DRM claims.
