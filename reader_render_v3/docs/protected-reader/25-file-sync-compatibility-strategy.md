# 25 File-Sync Compatibility Strategy

Updated: 2026-04-04

## What Already Exists

The protected reader already has:

- a local-first persisted bundle: `protected-reader-state-v3`
- a range-first reading-state model
- range-first highlights and notes
- production compatibility adapters for:
  - notes/share payloads
  - production snapshot fragments
  - reading-state bridges

The production ecosystem still centers on:

- `readerpub-sync-v1.json` snapshot files
- `positions[bookId]`
- `notes[bookId]`
- share payloads and query-state handoff
- CFI-based compatibility anchors

## Strategy

The correct strategy is:

1. keep the protected persisted bundle as the internal source of truth
2. build a dedicated file-sync transport format on top of that state
3. treat production snapshot/share formats as adapter edges
4. make future Google Drive handoff a transport step rather than a model rewrite

The file transport intentionally strips text-like helper fields such as quote/context
previews. Range anchors and user note text are kept; reconstructed book text is not.

## Layer Roles

### Internal persisted state

- local-first
- range-first
- book-fingerprint-aware
- used directly by the integrated protected reader

### Protected sync file

- exportable/importable file transport
- versioned independently
- safe to store locally or hand off to a future Drive file workflow
- derived from protected persisted state

### Production compatibility payloads

- snapshot patch
- notes/share payloads
- reading-position compatibility objects

These are not the internal source of truth.

## What Not To Do

Do not:

- roll protected state back to CFI-first
- store reconstructed book text in sync files
- keep two competing internal persistence schemas
- let production snapshot shape replace the protected range-first model

## Practical File-Sync Path

The intended future path is:

1. reader mutates protected local state
2. repository produces protected sync file
3. sync file becomes the file-based handoff unit
4. Drive upload/download later becomes a transport adapter around that file
5. production snapshot/share adapters remain compatibility edges for coexistence

This keeps the model stable while making future Drive integration straightforward.

## Transport and handoff

The sync file now has a dedicated transport layer and companion handoff metadata. That
layer carries file identity, compatibility diagnostics, and exchange metadata without
changing the protected file format or the protected internal persistence model.

## Drive backend

Google Drive can now act as a remote transport backend around the same protected sync
file. The remote file is a replica of protected local state, not a replacement for it.
