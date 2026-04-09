# Protected Sync File Handoff Format

## Protected Sync File

The protected transport file remains `protected-sync-file-v1`.

Core fields:

- `kind`
- `schemaVersion`
- `bundleVersion`
- `bookId`
- `userScope`
- `bookFingerprint`
- `artifactVersion`
- `exportedAt`
- `state.readingState`
- `state.annotations`
- `metadata`
- `compat`

The file stores protected reading state, range-first annotations, and user-authored note text. It does not store raw book text as a source of truth.

## Handoff State

The transport companion descriptor is `protected-sync-handoff-v1`.

Core fields:

- `kind`
- `version`
- `syncFileKind`
- `syncSchemaVersion`
- `bookId`
- `userScope`
- `bookFingerprint`
- `artifactVersion`
- `exportedAt`
- `fileName`
- `fileSize`
- `fileHash`
- `readingStateSummary`
- `annotationCount`
- `metadata`

## Export Workflow

1. Build sync file from protected persisted state.
2. Build handoff state from the sync file.
3. Offer file download.
4. Offer clipboard copy of handoff metadata.
5. Report compatibility and transfer status in the integrated UI.

## Import Workflow

1. Load sync file from pasted JSON or file picker.
2. Optionally load handoff state.
3. Validate schema, book identity, fingerprint, and corruption status.
4. Apply only compatible state into the protected repository.

## Compatibility Statuses

- `exact`
- `legacy-upgraded`
- `fingerprint-mismatch`
- `wrong-book`
- `corrupt`
- `schema-unsupported`

## Future-Safe Property

The handoff state contains only transport metadata and summaries. It never includes raw book text, reconstruction payloads, render packets, or decoded visible text, so a later Drive file association can reuse it without weakening the protected reader model.
