# AGENTS.md

## Scope

This file applies to the `pages_books` repository rooted here. This checkout is often used as a Git worktree under:

- `C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim`

Treat repo-root files and worktree files as the same codebase, but be aware that deployment and Git commands are commonly run from the active worktree.

## Repository Shape

Key areas:

- `books/`: public catalog, publisher UI, protected publishing flow
- `_worker.js`: Cloudflare Worker entrypoint and API/router logic
- `api/`, `publisher_tasks/`: worker-side helpers and publishing tasks
- `reader/`, `reader1/`, `reader_render_v3/`: reader clients and related assets
- `tests/`: JS unit tests, Python tests, and e2e coverage
- `docs/`: handoff notes and operational runbooks

## Working Rules

- Make the smallest safe change set that satisfies the request.
- Do not do unrelated cleanup.
- Do not touch `reader/` or `reader1/` unless the task clearly requires it.
- For unprotected reader work, `/books/reader/` is the active local route and currently serves the `reader1` runtime. Target and verify `reader1` only. Do not update the parallel `reader` client unless the user explicitly asks for it.
- Preserve existing backend contracts and data model unless a task explicitly calls for backend changes.
- Prefer targeted helpers/constants over broad rewrites.

## Editing And Git

- Use `apply_patch` for manual code edits.
- The worktree may be dirty. Never revert unrelated changes.
- Commit meaningful milestones instead of leaving large uncommitted state.
- Before any deploy, review all modified code/config files in the worktree. Commit every intentional code/config change that may affect runtime before deploying, even if the change was made earlier in the session; do not leave live-affecting dirty files uncommitted.
- When a milestone is worth preserving, update the session handoff note:
  - `docs/session-handoff-2026-04-12.md`

When Git needs a safe-directory override in this worktree, use:

```powershell
git -c safe.directory=C:/Users/yaran/Test1/pages_books/.worktrees/merge-reader-render-v3-staging-trim ...
```

## Testing

Default repo test command:

```powershell
npm.cmd test
```

Broader suite:

```powershell
npm.cmd run test:all
```

Use the narrowest relevant test command for the area you changed. Do not broaden test scope without a reason.

## Staging Deploys

Use the documented staging procedure in:

- `docs/windows-staging-deploy.md`

Use one platform-native helper per OS. Do not run the Windows PowerShell helper on macOS, and do not run the macOS shell helper on Windows.

Windows deploy:

```powershell
tools/dev/deploy_staging_windows.ps1
```

- this script is Windows-only
- it builds the deploy bundle in a Windows temp path
- it copies large trees with `robocopy`
- it deploys with Windows Wrangler, preferably `reader_render_v3\node_modules\.bin\wrangler.cmd` or root `node_modules\.bin\wrangler.cmd`

macOS deploy:

```bash
tools/dev/deploy_staging_macos.sh
```

- this script is macOS-only for this worktree
- it builds the deploy bundle in the macOS temp directory
- it copies large trees with `rsync`
- it deploys with POSIX Wrangler, resolved from `WRANGLER_BIN`, `reader_render_v3/node_modules/.bin/wrangler`, root `node_modules/.bin/wrangler`, or `wrangler` from `PATH`

Both helpers deploy to:

- Cloudflare Pages project: `readerpub-books-staging`
- Pages branch: `develop`
- canonical URL: `https://books-staging.reader.pub/books/`

## Deploy Target For `develop-anatoly`

In this branch/worktree, reader/catalog deployments default to staging only:

- default target: `https://books-staging.reader.pub/books/`
- do not deploy to `https://reader.pub/books/` unless the user explicitly asks for production/live/`reader.pub`
- if the user says only "deploy readers", "deploy catalog", "deploy this branch", or similar without naming production, deploy to staging
- production deploy instructions elsewhere in this repository apply only after the user explicitly requests production/live/`reader.pub`

Important constraints from that runbook:

- do not rely on `scripts/deploy-staging.sh` directly from this setup
- build the deploy bundle in a platform-native temp path
- exclude:
  - `books/content`
  - `books/gutenberg_protected_epub3_sources`
  - `reader_render_v3/node_modules`
  - `reader_render_v3/artifacts`

After a successful deploy, record it in:

- `deployments/history.jsonl`

After a successful staging deploy, stop and report the deploy result. Do not run additional post-deploy staging checks unless the user explicitly asks for them; the user will verify staging manually.

## Publisher Workflow Notes

Recent work in this repo reframed the self-publisher UI around:

- `Bookshelf`
- `Create New Title`
- `Content`
- `Details`
- `Pricing`
- `Publish`

When editing `books/publish/index.html`, preserve that workflow framing unless the task explicitly changes it.

For protected manuscript processing, successful conversion should return the user into review/edit flow rather than implying immediate publication.

## Local Noise

This repo has occasionally accumulated temporary deploy directories or malformed paths from failed Windows deploy attempts. Leave unrelated temporary artifacts alone unless the user explicitly asks for cleanup.
