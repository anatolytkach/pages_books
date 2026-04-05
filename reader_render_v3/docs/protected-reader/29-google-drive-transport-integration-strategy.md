# Google Drive Transport Integration Strategy

## Existing Protected Layers

- local-first protected state: `protected-reader-state-v3`
- exportable protected sync file: `protected-sync-file-v1`
- handoff metadata: `protected-sync-handoff-v1`
- transport layer around file export/import

## What This Step Adds

- Google Drive as a remote file transport backend
- upload / download / refresh / apply flow for the protected sync file
- remote status and freshness reporting in integrated protected mode

## Core Principle

- local protected state is the source of truth during a reading session
- Google Drive stores a remote copy of the protected sync file
- apply from Drive is explicit
- no page rendering or reading lifecycle depends on Drive roundtrips

## Minimal Conflict Policy

- compare local persisted timestamp vs remote modified time
- report `local-newer`, `remote-newer`, `same`, or `unknown`
- upload explicitly overwrites remote
- download/apply explicitly overwrites local
- no merge engine in this step

## What This Step Does Not Do

- no multi-device merge
- no collaborative notes
- no production-wide rollout
- no backend database
- no change to the protected range-first internal model

## Live Verification Status

In the current local environment, the integrated protected reader reaches the Drive UI path
but stops before login because Google Drive is not configured for this build:

- `/books/shared/drive-sync.js` is loaded
- `meta[name="google-drive-client-id"]` is present
- its `content` is empty

So the live barrier is configuration, not reader bootstrap or transport wiring.
