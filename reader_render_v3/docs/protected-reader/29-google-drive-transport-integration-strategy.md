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
- rollout eligibility must not depend on Drive availability

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

Live internal smoke has now confirmed:

- OAuth path reaches Google correctly once a valid client id is configured
- upload updates the remote protected sync file
- download returns `exact` compatibility
- apply restores local protected state from Drive

Drive remains an operational dependency only for transport. It is not part of rollout
eligibility for opening the protected reader.

On published staging routes, Drive UI must remain graceful even when the browser session is
not authorized. That state is reported as availability/authorization metadata, not as a
reader-open blocker.
