# Protected Drive File Workflow

## File Strategy

Protected reader stores one file per:

- `bookId`
- `userScope`

Location:

- Google Drive `appDataFolder`

Name:

- `readerpub-protected-sync-v1-<bookId>-<userScope>.json`

The file body is the normal `protected-sync-file-v1` payload. Handoff metadata is rebuilt locally and is not required to be stored as a second file.

## Upload / Update

1. export current protected state to `protected-sync-file-v1`
2. build Drive file identity and appProperties
3. find existing Drive file by stable name
4. create if missing, update if present
5. report file id, modified time, size, and freshness

## Download / Apply

1. find the remote Drive file
2. download JSON body
3. validate schema, book identity, fingerprint, and corruption status
4. surface compatibility result
5. apply only on explicit user action

## Status Model

Integrated protected mode surfaces:

- configured / unavailable
- authorized / unauthorized
- uploading / downloading / applied / error
- remote file present yes/no
- remote file id
- remote modified time
- freshness against local persisted state

## Why This Is Still Transport-Only

Drive stores only a remote copy of the protected sync file. The reader still opens from local state, and the protected range-first model remains the only internal source of truth.

## Current Limitations

- no merge engine
- no background auto-apply
- no cross-device conflict resolution
- no collaborative workflows
- no production cutover

## Live Smoke-Test Limitation In This Environment

The current local preview environment does not expose a Google client id in
`meta[name="google-drive-client-id"]`, so the reader reports:

- Drive transport: `unavailable`
- Drive configured: `no`
- Drive authorized: `no`

That means a real Google login/consent step cannot start yet in this environment.
