# Protected Sync Transport And Handoff Strategy

## Existing Layers

- Internal persisted bundle: `protected-reader-state-v3`
- Exportable protected sync file: `protected-sync-file-v1`
- Production snapshot/share compatibility: adapter edge only

## What This Step Adds

- A transport layer around the sync file
- A separate handoff descriptor for portable file exchange
- Download/upload workflow in integrated protected mode
- Transport compatibility reporting before import is applied

## Correct Model Boundaries

- Protected local state remains the only internal source of truth.
- Protected sync file remains the portable file payload.
- Handoff state is metadata about a sync file, not a second persistence source.
- Production snapshot/share export remains compatibility-only.

## Future Google Drive Path

The next file-based sync step can upload/download:

1. `protected-sync-file-v1`
2. its companion `protected-sync-handoff-v1`

That makes Drive integration a transport concern instead of a model redesign.

## Explicit Non-Goals

- no Google Drive API calls
- no backend/cloud sync
- no multi-device merge
- no production rollout
- no rollback from range-first protected state to CFI-first state

## Tooling expectation

Fingerprint compatibility checks must use the same helper as runtime persistence and sync
export. A valid synthetic fixture for the current artifact should therefore round-trip as
`exact`, while only intentionally mismatched fixtures should report
`fingerprint-mismatch`.
