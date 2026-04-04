# Production Reader Notes Compatibility Audit

## Scope

This audit covers the current production reader under `/reader` and shared sync/share code under `/books/shared` and `/tools/runtime`.

Production behavior was not changed during this step.

## Production File Map

### Note / highlight models

- `/Volumes/2T/se_ingest/pages_books/reader/js/reader.js`
  - legacy EPUB.js reader settings model
  - legacy note controller stores `settings.annotations`
  - bookmark storage helpers
- `/Volumes/2T/se_ingest/pages_books/reader/js/fbreader-ui.js`
  - current production notes UI
  - selection toolbar note action
  - note comment modal
  - share-link creation and import
  - notes list rendering and delete flow

### Storage and sync layer

- `/Volumes/2T/se_ingest/pages_books/books/shared/drive-sync.js`
  - Google Drive appData snapshot file
  - localStorage extraction
  - local restore from Drive snapshot
  - current reader sync scheduling

### Share layer

- `/Volumes/2T/se_ingest/pages_books/reader/js/fbreader-ui.js`
  - create shareable notes payload
  - build book-with-notes URL
  - import notes from URL or short share
- `/Volumes/2T/se_ingest/pages_books/tools/runtime/notes-share-proxy-worker.js`
  - short share create/read API
  - persisted share payload shape

### Reading position layer

- `/Volumes/2T/se_ingest/pages_books/reader/index.html`
  - `readerpub:lastcfi:${id}`
  - `readerpub:lastid`
  - `readerpub:lastsource`
- `/Volumes/2T/se_ingest/pages_books/reader/js/reader.js`
  - `settings.previousLocationCfi`
  - per-book `epubjsreader:*` blob
- `/Volumes/2T/se_ingest/pages_books/books/shared/drive-sync.js`
  - `snapshot.positions[bookId] = { cfi, updatedAt }`

## Current Production Data Flow

### Create note

Current production note creation is driven by the selection toolbar in `/Volumes/2T/se_ingest/pages_books/reader/js/fbreader-ui.js`.

Flow:

1. User selects text.
2. Toolbar action `note` runs in `handleAction`.
3. It builds:
   - `cfi`
   - `quote`
   - `href`
4. `window.__fbOpenNoteComment(payload)` opens the comment sheet.
5. User enters comment text.
6. `save()` in `setupNoteComment()` sanitizes the comment and calls `window.__fbAddNote(data)`.
7. `addNote()` in `setupNotes()` appends note to `reader.settings.notes`.
8. `save()` calls `reader.saveSettings()`.
9. Notes list re-renders in overlay.

Current note object shape in the active production UI:

```json
{
  "id": "string",
  "cfi": "epubcfi(...)",
  "href": "chapter href or null",
  "quote": "selected quote preview",
  "comment": "user note text"
}
```

### Local storage

#### Primary per-book blob

Key:

```text
epubjsreader:${EPUBJS.VERSION}:${window.location.host}:/books/content/${bookId}/
```

Source:
- `/Volumes/2T/se_ingest/pages_books/reader/js/reader.js`
- `/Volumes/2T/se_ingest/pages_books/books/shared/drive-sync.js`

Persisted via:
- `reader.saveSettings()`

Important fields currently used:
- `previousLocationCfi`
- `bookmarks`
- `notes`
- `annotations`
- other reader settings

#### Shortcut reading-state keys

- `readerpub:lastcfi:${id}`
- `readerpub:lastid`
- `readerpub:lastsource`

Source:
- `/Volumes/2T/se_ingest/pages_books/reader/index.html`

### Restore notes

Local notes restore happens by loading the saved `epubjsreader:*` JSON blob back into `reader.settings`.

Then current notes UI in `setupNotes()` reads:

- `reader.settings.notes`

Legacy note UI still exists in `reader.js` and uses:

- `reader.settings.annotations`

This means production still carries two note containers:

- legacy: `annotations`
- current: `notes`

Drive sync code is explicitly backward-compatible and prefers:

1. `annotations`
2. otherwise `notes`

for export.

### Google Drive sync file

File:

```text
readerpub-sync-v1.json
```

Location:
- Google Drive `appDataFolder`

Code:
- `/Volumes/2T/se_ingest/pages_books/books/shared/drive-sync.js`

Snapshot shape:

```json
{
  "version": 1,
  "updatedAt": 0,
  "books": {
    "<bookId>": {
      "id": "<bookId>",
      "title": "string",
      "author": "string",
      "cover": "string",
      "openedAt": 0,
      "updatedAt": 0
    }
  },
  "positions": {
    "<bookId>": {
      "cfi": "epubcfi(...)",
      "updatedAt": 0
    }
  },
  "bookmarks": {
    "<bookId>": []
  },
  "notes": {
    "<bookId>": []
  },
  "preferences": {
    "tts": {
      "lastDetectedLanguage": "string",
      "updatedAt": 0,
      "lastBookId": "string"
    }
  }
}
```

#### Sync semantics

Per-book sync is replace-oriented, not merge-oriented.

`syncCurrentReaderState()` overwrites:
- `snapshot.positions[id]`
- `snapshot.bookmarks[id]`
- `snapshot.notes[id]`

`applySnapshotToLocalReader()` writes those values back into localStorage and also mirrors:
- `saved.notes`
- `saved.annotations = saved.notes`

`deleteBooksCascade()` removes all book-specific entries from:
- `books`
- `positions`
- `bookmarks`
- `notes`

### Share link generation

Current production share-link logic lives in `/Volumes/2T/se_ingest/pages_books/reader/js/fbreader-ui.js`.

#### Book-only share

`copyBookLinkBtn` builds a clean URL:

- clears hash
- clears search
- sets only `?id=<bookId>`

This does not include notes or reading position.

#### Book with notes share

Current production share path uses three fallbacks:

1. short share via API
2. compressed `notesz` URL payload
3. legacy base64 `notes` URL payload

Generated URL prefers:

```text
?i=<bookId>&n=<shareId>
```

Fallback compressed:

```text
?i=<bookId>&notesz=<gzip-base64url-token>
```

Legacy fallback:

```text
?i=<bookId>&notes=<base64-json>
```

Notes payload used for sharing is normalized to:

```json
{
  "id": "string",
  "cfi": "epubcfi(...)",
  "href": "string|null",
  "quote": "string",
  "comment": "string"
}
```

### Share/open restore flow

On open, production reader checks URL params in `setupNotes()`:

1. `n` or `notesShare`
2. else `notesz`
3. else `notes`

If short share id exists:
- fetch share payload from `/books/api/ns/:id` or `/books/api/notes-share/:id`
- normalize returned notes
- replace `reader.settings.notes`

If no share id:
- decode `notesz` or `notes`
- normalize notes
- replace `reader.settings.notes`

Important:

- imported shared notes replace current `reader.settings.notes`
- there is no sophisticated merge with local notes in this path

### Notes share backend format

Worker:
- `/Volumes/2T/se_ingest/pages_books/tools/runtime/notes-share-proxy-worker.js`

Stored payload:

```json
{
  "v": 2,
  "bookId": "<bookId>",
  "createdAt": 0,
  "notes": [
    {
      "id": "string",
      "cfi": "epubcfi(...)",
      "href": "string|null",
      "quote": "string",
      "comment": "string"
    }
  ]
}
```

This is not identical to the old legacy `annotations` model.

### Reading position restore

Current production reader has two active restore mechanisms:

1. `reader/index.html`
   - reads `readerpub:lastcfi:${id}`
   - displays that CFI immediately
2. `reader.saveSettings()`
   - keeps `previousLocationCfi` inside the `epubjsreader:*` blob
3. Drive sync
   - stores `positions[bookId].cfi`
   - restores it back into `previousLocationCfi`

Current notes share links do not directly encode reading position. Book-only share also clears hash, so share position is not the primary production sharing path.

## Schema/version handling

- Drive snapshot has explicit `version`
- notes short-share backend has explicit `v`
- local `epubjsreader:*` blob has no explicit notes schema version beyond being part of reader settings

## Compatibility Constraints

`reader_render_v3` should preserve compatibility with:

1. production book identifier
   - numeric `bookId`
2. production reading-state anchor
   - CFI remains required for Drive/share compatibility
3. production sync bundle structure
   - `books`
   - `positions`
   - `bookmarks`
   - `notes`
4. production notes share structure
   - `{ id, cfi, href, quote, comment }`
5. production URL params
   - `id`
   - `i`
   - `source`
   - `n`
   - `notesShare`
   - `notesz`
   - `notes`

Things that must not be broken later:

- existing Google Drive snapshot file shape
- existing short-share API payload contract
- current open-from-link behavior
- current reading-position keys until migration is explicit

## Gap Analysis: Production vs Protected

### Direct matches

- `bookId`
- timestamps
- user note text
- import/export bundle concept
- reading-state concept

### Adaptable with an adapter

- protected `rangeDescriptor` -> production share note `{ cfi, href, quote, comment }`
- protected `readingState` -> production `positions[bookId].cfi`
- protected annotation export bundle -> production sync snapshot patch

### Hard gaps

1. Production notes are CFI-point anchored.
2. Protected annotations are global-range anchored.
3. Production share payload includes quote preview.
4. Protected model intentionally avoids raw text as source of truth.

This means compatibility needs:

- a CFI/export anchor resolver
- a quote resolver based on narrow reconstruction
- a migration adapter, not direct field copying

## Recommendation

Recommended strategy:

1. Keep protected internal source of truth as range-first annotations.
2. Add a compatibility adapter that can export:
   - production share notes
   - production sync snapshot patch
3. Keep reading-state abstraction able to hold:
   - protected global position
   - optional production CFI compatibility anchor
4. Do not import production notes directly into protected runtime without a resolver.
   - use `CFI -> protected range` resolver bridge
   - return unresolved notes explicitly if mapping fails
5. Treat production share format as external compatibility format, not internal protected storage format.

This keeps `reader_render_v3` compatible with the current production ecosystem without forcing the protected reader to collapse back into the old CFI-only note model.

## Bridge status

The first real bridge now exists in:

- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-cfi-resolver.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-production-import.js`
- `/Volumes/2T/se_ingest/pages_books/reader_render_v3/runtime/protected-production-export.js`

This bridge is still limited by the lack of a full production-quality CFI generator on the protected side, but it is no longer speculative: import/export compatibility can now be exercised with exact/approximate/unresolved reporting.
