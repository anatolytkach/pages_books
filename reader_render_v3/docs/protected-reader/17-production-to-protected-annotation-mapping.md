# Production To Protected Annotation Mapping

## Summary

Production and protected readers already overlap on `bookId`, timestamps, notes-as-user-data, and import/export needs, but they do not use the same anchor model.

Production is currently:
- CFI-first
- quote/comment-oriented for sharing
- snapshot-oriented for Drive sync

Protected `reader_render_v3` is currently:
- global-range-first
- range/offset-oriented
- reconstruction-minimized

## Field Mapping Table

| Concern | Production reader | Protected reader | Mapping status |
| --- | --- | --- | --- |
| Book id | numeric `id` / `i` | `bookId` | 1:1 |
| Reading position | `previousLocationCfi`, `readerpub:lastcfi:${id}`, `positions[bookId].cfi` | global position, restore token, page/chunk position | adapter needed |
| Note anchor | `cfi` | `rangeDescriptor.start/end` with global/local offsets | adapter needed |
| Note href | `href` | optional metadata only | adaptable |
| Highlight range | not primary persisted source; share note is single CFI + quote | stable global range descriptor | different internal model |
| Quote preview | `quote` | not source of truth; can be generated on demand | adapter needed |
| Note text | `comment` or legacy `body` | `noteText` | 1:1 |
| Highlight id | `id` | `annotationId` | adaptable |
| Timestamps | `annotatedAt`, implicit save times, snapshot `updatedAt` | `createdAt`, `updatedAt` | adaptable |
| Bundle format | Drive snapshot `readerpub-sync-v1.json` | protected annotation bundle | wrapper/adapter needed |
| Share-link state | `n`, `notesShare`, `notesz`, `notes`, `i`, `id` | protected share-state abstraction | adapter needed |
| Restore/open state | query params + localStorage + hash CFI | restore token + global location | adapter needed |

## Production Models

### Legacy local annotation

```json
{
  "annotatedAt": "Date",
  "anchor": "epubcfi(...)",
  "body": "user note text"
}
```

This still exists in legacy `reader.js`.

### Current production note

```json
{
  "id": "string",
  "cfi": "epubcfi(...)",
  "href": "string|null",
  "quote": "string",
  "comment": "string"
}
```

This is the active model in `fbreader-ui.js`.

## Protected models

### Highlight

```json
{
  "annotationId": "hl_*",
  "type": "highlight",
  "bookId": "19686",
  "rangeDescriptor": { "...": "protected-range-v1" },
  "color": "amber",
  "createdAt": "ISO string",
  "updatedAt": "ISO string",
  "metadata": {}
}
```

### Note

```json
{
  "annotationId": "note_*",
  "type": "note",
  "bookId": "19686",
  "rangeDescriptor": { "...": "protected-range-v1" },
  "highlightId": "hl_*",
  "noteText": "user note text",
  "createdAt": "ISO string",
  "updatedAt": "ISO string",
  "metadata": {}
}
```

## Recommended Mapping

### Protected -> production share note

- anchor source:
  - `rangeDescriptor` resolved to production-compatible `{ cfi, href }`
- quote source:
  - narrow reconstruction only when needed
- comment source:
  - linked protected note `noteText`
- item id:
  - `annotationId`

Result:

```json
{
  "id": "<highlight annotationId>",
  "cfi": "<resolved compatibility cfi>",
  "href": "<resolved href|null>",
  "quote": "<generated preview>",
  "comment": "<linked noteText or empty>"
}
```

### Production share note -> protected

Needs resolver:

- input:
  - `cfi`
  - `href`
  - `quote`
  - `comment`
- resolver:
  - `production note -> protected rangeDescriptor`

If resolved:
- create protected highlight
- create protected note if `comment` exists

If unresolved:
- keep item in unresolved compat list
- do not silently fake a range

## Reading-state mapping

Recommended protected reading-state object should carry both:

```json
{
  "globalPosition": { "...": "protected global position" },
  "page": { "...": "protected page state" },
  "compat": {
    "cfi": "epubcfi(...)"
  }
}
```

This allows:
- native protected restore
- production Drive/share compatibility later

## Bundle Strategy

### Native protected bundle

Use native protected bundle as internal format:

```json
{
  "kind": "protected-reader-state-v3",
  "schemaVersion": 3,
  "bookId": "19686",
  "bookFingerprint": {
    "fingerprint": "string",
    "artifactVersion": 3
  },
  "userScope": "default",
  "annotations": [],
  "readingState": {},
  "updatedAt": "ISO string",
  "metadata": {}
}
```

This bundle is now the local-first persisted source of truth for integrated protected
mode. Production formats remain adapter outputs rather than replacing the internal
range-first model.

### Production compatibility bundle

Treat production snapshot/share payloads as external compatibility formats:

- Drive snapshot patch
- notes share payload
- share-link query state

Do not replace protected internal model with these formats.

## Compatibility Risks

1. CFI to protected-range resolution may fail if the protected reader does not expose a compatible bridge.
2. Production quote preview depends on text reconstruction that protected runtime intentionally narrows.
3. Production local notes currently replace on share import instead of merging.
4. Production still has both legacy `annotations` and current `notes`.

## Recommended Integration Strategy

1. Keep protected annotations as range-first source of truth.
2. Store optional production compatibility anchors in metadata only when available.
3. Export production-compatible notes/share payload on demand through an adapter.
4. Import production notes through an explicit resolver, with unresolved-note reporting.
5. Keep repository API async so future Google Drive/share integration can be added without another model rewrite.

## Current bridge implementation

The current bridge resolves production payloads into protected annotations by:

- resolving `href` and `nodeId` against protected `sourceRefs`
- using `nodeIndex` / `spineIndex` heuristics for `cfi`-only cases
- returning exact vs approximate vs unresolved results explicitly

Export back into production format currently prefers stored compatibility anchors from imported payloads. That keeps export honest while the protected side is still missing a true EPUB CFI generator.
