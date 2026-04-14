# Local Protected To Unprotected UX Port Log

## Scope

- track every localhost UX fix first implemented against the protected reader baseline
- classify whether the fix lives in shared shell, protected-only runtime, or a portable contract that must also be applied to unprotected
- record exact port status so the unprotected implementation is not reconstructed from memory later

## Working Rule

- protected localhost UX is the baseline reference
- every protected UX fix must get an entry in this file before the task is considered locally closed
- every entry must explicitly state whether it is:
  - `shared-shell`
  - `protected-only`
  - `portable-to-unprotected`
  - `blocked-for-unprotected`

## Port Status Values

- `protected-fixed`
- `pending-port`
- `ported`
- `blocked`
- `not-applicable`

## Entry Template

```md
## UX-PORT-00X - Short Title

- date:
- protected baseline book:
- symptom:
- root cause:
- files changed:
  - `/abs/path/file`
- protected fix summary:
- classification:
  - `shared-shell` | `protected-only` | `portable-to-unprotected` | `blocked-for-unprotected`
- unprotected port status:
  - `protected-fixed` | `pending-port` | `ported` | `blocked` | `not-applicable`
- unprotected port plan:
- verification:
  - localhost:
  - preview:
- notes:
```

## Current Baseline

- protected localhost UX baseline book for active debugging: `45`
- reference shell host: `protected-old-shell-host`
- reference route family: `reader_new` with protected params

## Entries

## UX-PORT-001 - Start Logging Discipline

- date: `2026-04-14`
- protected baseline book: `45`
- symptom:
  - protected and unprotected UX work was previously tracked ad hoc in chat and code diffs
- root cause:
  - no persistent in-repo port log existed for localhost-first UX fixes
- files changed:
  - `/Volumes/2T/se_ingest/pages_books/reader_render_v3/docs/protected-reader/107-local-protected-to-unprotected-ux-port-log.md`
- protected fix summary:
  - established a permanent log and classification contract for all future protected-first UX fixes
- classification:
  - `shared-shell`
- unprotected port status:
  - `pending-port`
- unprotected port plan:
  - every new protected localhost UX fix will be appended here and explicitly marked for shared-shell reuse, protected-only retention, or blocked porting
- verification:
  - localhost:
    - file created in repo
  - preview:
    - not applicable
- notes:
  - this is process infrastructure, not a runtime UX change
