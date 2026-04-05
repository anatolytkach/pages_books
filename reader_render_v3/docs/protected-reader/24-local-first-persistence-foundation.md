# 24 Local-First Persistence Foundation

Updated: 2026-04-04

## Goal

The integrated protected reader now persists its own local state across reload and
reopen without waiting for backend rollout.

The design target is:

- local-first today
- file-sync-compatible tomorrow
- production-adapter-friendly at the edges

## Persistence architecture

The persistence stack is now split into four layers:

1. `protected-local-store.js`
   - async wrapper around local browser storage
2. `protected-persistence-manager.js`
   - orchestrates bundle load/save/clear and compatibility checks
3. `protected-reading-state-store.js`
   - reading-state normalization helpers
4. `protected-annotation-persistence.js`
   - annotation normalization helpers

The repository abstraction remains the API used by the reader UI.

## Source of truth

The source of truth is now a versioned protected bundle:

```json
{
  "kind": "protected-reader-state-v3",
  "schemaVersion": 3,
  "bookId": "19686",
  "userScope": "default",
  "bookFingerprint": {
    "fingerprint": "string",
    "artifactVersion": 3,
    "contractVersion": "string"
  },
  "artifactVersion": 3,
  "updatedAt": "ISO string",
  "readingState": {},
  "annotations": [],
  "metadata": {}
}
```

This bundle is used for:

- local persistence
- protected bundle export/import
- future file-based sync

The next transport layer is now a separate file-sync format:

- `protected-sync-file-v1`

That keeps local persisted state and file handoff related, but not conflated.

It does not store book text as its anchor of truth.

## Book fingerprint and compatibility

Persisted state is keyed not only by `bookId`, but also checked against a protected book
fingerprint derived from:

- artifact version
- runtime contract version
- chunk count
- toc count
- location count
- first/last chunk and location anchors

Compatibility status is explicit:

- `exact`
- `legacy-upgraded`
- `fingerprint-mismatch`
- `book-mismatch`
- `corrupt`
- `none`

Incompatible or corrupt bundles are not silently applied.

## Reading-state persistence

Reading state now persists inside the protected bundle and remains the primary internal
restore source for integrated protected mode.

Stored data includes:

- restore token
- global position
- page index/count
- optional compatibility anchor metadata
- timestamps

Restore priority remains:

1. explicit restore token
2. persisted protected reading state
3. production CFI fallback
4. start of book

## Annotation persistence

Highlights and notes now persist through the same protected bundle.

After create, update, delete, or import:

- repository state is normalized
- persistence manager writes the updated bundle
- reopen/reload restores both reading state and annotations

The persisted annotation source of truth remains:

- range descriptors
- ids
- note text
- metadata

not raw book text.

## Import/export lifecycle

Import/export now run against the persisted model rather than ad-hoc UI state scraping.

- export protected bundle -> current persisted protected state
- import protected bundle -> validate, apply, persist
- export protected sync file -> build file transport from current persisted state
- import protected sync file -> validate compatibility, convert back into persisted state
- import production payload -> convert to protected state, persist
- export production notes/share/snapshot -> adapter output from persisted protected state

## Local backend

Current local backend:

- browser `localStorage`
- namespaced under the integrated protected reader
- wrapped by an async store interface so later file-sync/backends do not require UI rewrites

## Diagnostics

Integrated protected mode now surfaces:

- storage backend
- bundle schema version
- bundle compatibility status
- compatibility warning
- persisted annotation count
- reading-state saved yes/no
- last saved timestamp
- book fingerprint

No book text is shown in diagnostics.

## Migration readiness

The normalizer upgrades legacy protected bundle format `protected-annotations-v2` into
the new `protected-reader-state-v3` bundle shape.

That prevents immediate local-state loss while moving the protected reader onto a more
stable persistence contract.

## Why this fits future file-based sync

This local-first layer is deliberately shaped like a future syncable file:

- one versioned bundle
- explicit book identity
- explicit compatibility checks
- annotations + reading state together
- adapter edges for production note/share workflows

So the next layer can add file-based sync or cloud sync adapters without replacing the
reader’s internal model.

## Transport relationship

Local persisted state remains `protected-reader-state-v3`. File export now builds a
separate `protected-sync-file-v1` plus `protected-sync-handoff-v1` on top of that
state. Download/upload workflows are transport edges, not alternate persistence truths.

Google Drive transport follows the same rule: remote files are copies of the local-first
protected state, not the primary store used for opening or rendering a book.
