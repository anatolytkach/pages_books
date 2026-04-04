# 26 Protected File-Sync Bundle Format

Updated: 2026-04-04

## Purpose

The protected sync file is a transport format for:

- file export/import
- local backup
- future Google Drive file handoff

It is derived from protected persisted state but is not required to be byte-for-byte identical to the local persistence object.

## Schema

```json
{
  "kind": "protected-sync-file-v1",
  "schemaVersion": 1,
  "bundleVersion": 1,
  "bookId": "19686",
  "userScope": "default",
  "bookFingerprint": {
    "fingerprint": "759e81c3",
    "artifactVersion": 3,
    "contractVersion": "opaque-chunk-local|opaque-glyph-ops|sealed-window-scoped"
  },
  "artifactVersion": 3,
  "exportedAt": "ISO string",
  "state": {
    "readingState": {},
    "annotations": []
  },
  "metadata": {},
  "compat": {}
}
```

## What It Stores

Allowed:

- reading state
- range-first annotations
- user note text
- book identity and compatibility metadata
- optional compatibility metadata that does not itself become a text dump

Not allowed:

- raw book text as source of truth
- reconstruction payloads
- render packets
- debug artifacts
- visible-page dumps
- quote/context preview text inside the sync-file state

The sync-file builder strips text-like helper fields such as:

- `quote`
- `contextBefore`
- `contextAfter`
- production quote previews inside compatibility metadata

## Compatibility Checks

Import checks return explicit statuses such as:

- `exact`
- `legacy-upgraded`
- `fingerprint-mismatch`
- `book-mismatch`
- `schema-unsupported`
- `corrupt`

If a file is incompatible, it is not silently applied.

## Relation To Local Persisted State

Local persisted state remains:

- `protected-reader-state-v3`

The sync file is built from that state and can be imported back into it.

This gives the reader:

- one internal source of truth
- one transport format
- explicit compatibility handling between them

## Relation To Production Snapshot Patch

The protected sync file can carry optional compatibility outputs in `compat`, including:

- production snapshot patch
- production notes array
- production share payload

Those are adapter outputs, not the internal source of truth.

## Import / Export Lifecycle

1. repository loads protected local state
2. export builds protected sync file
3. optional production snapshot patch is derived from the same protected state
4. import validates file compatibility
5. validated file is converted back into protected local state and persisted

## Why This Is Future-Safe

This bundle format keeps:

- range-first annotations
- protected reading-state semantics
- compatibility checks tied to artifact identity
- optional production adapters at the edge

That means future Google Drive handoff can upload/download the sync file without forcing another persistence redesign.
