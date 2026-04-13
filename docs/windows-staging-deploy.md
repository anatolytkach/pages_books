# Windows Staging Deploy

## Purpose

This note records the deployment problems we hit on Windows and the procedure that actually worked for deploying the current worktree to:

- `https://books-staging.reader.pub/books/`

Target project:

- Cloudflare Pages project: `readerpub-books-staging`
- Pages branch: `develop`

## What Failed

### 1. Running `scripts/deploy-staging.sh` from PowerShell with default `npx wrangler`

Observed failure:

- `sh: 1: npx wrangler: not found`

Why:

- the bash deploy script defaults to:
  - `WRANGLER_BIN="${WRANGLER_BIN:-npx wrangler}"`
- in this environment that fallback is unreliable on Windows
- using transient `npx` is also a bad fit because earlier sessions already showed cache lock problems around `wrangler`, `workerd`, and `esbuild`

### 2. Pointing bash at the Windows `wrangler.cmd`

Observed failure:

- `sh: 1: .../wrangler.cmd: not found`

Why:

- `scripts/deploy-staging.sh` runs under `bash`
- `wrangler.cmd` is a Windows command shim, not a native Unix executable
- bash cannot invoke it as if it were a normal POSIX binary

### 3. Running the POSIX `wrangler` under bash

Observed failure:

- `You installed workerd on another platform than the one you're currently using`
- specifically:
  - installed package: `@cloudflare/workerd-windows-64`
  - runtime platform expected by bash/WSL path: `@cloudflare/workerd-linux-64`

Why:

- the repo has a Windows-installed `reader_render_v3/node_modules`
- the POSIX `wrangler` launcher then runs in a Linux-like environment and expects Linux-native `workerd`
- this creates a hard platform mismatch

### 4. Copying the deploy bundle with PowerShell `Copy-Item -Recurse`

Observed failure:

- `Copy-Item : The data present in the reparse point buffer is invalid.`

Why:

- some directories/files under the repo tree are problematic for naive Windows recursive copy
- this is especially risky under `reader_render_v3`
- the earlier deploy fixes already established that the deploy bundle must exclude:
  - `reader_render_v3/node_modules`
  - `reader_render_v3/artifacts`

### 5. Building the bundle in bash and deploying it from PowerShell

Observed failure:

- `ENOENT: no such file or directory, scandir ...`

Why:

- mixing bash-built paths and PowerShell/Windows-native Wrangler introduced path translation problems
- the safest approach is to keep the deploy directory in a plain Windows path and use a Windows-native deploy command against that same path

## What Worked

Use a Windows-native deploy flow:

1. build the deploy bundle in a Windows path
2. use `robocopy` instead of naive `Copy-Item -Recurse` for the large directory trees
3. explicitly exclude:
   - `reader_render_v3/node_modules`
   - `reader_render_v3/artifacts`
4. deploy with:
   - `reader_render_v3\node_modules\.bin\wrangler.cmd`
5. record the deployment with:
   - `tools/deploy/record-deployment.mjs`

## Correct Windows Procedure

Run from:

```powershell
cd C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim
```

Then run:

```powershell
$ErrorActionPreference = 'Stop'

$root = 'C:\Users\yaran\Test1\pages_books\.worktrees\merge-reader-render-v3-staging-trim'
$deployDir = Join-Path $root ('.tmp_staging_deploy_' + [guid]::NewGuid().ToString('N'))

New-Item -ItemType Directory -Path $deployDir | Out-Null

Copy-Item -LiteralPath (Join-Path $root '_worker.js') -Destination (Join-Path $deployDir '_worker.js')
Copy-Item -LiteralPath (Join-Path $root 'api') -Destination (Join-Path $deployDir 'api') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'publisher_tasks') -Destination (Join-Path $deployDir 'publisher_tasks') -Recurse

$null = robocopy (Join-Path $root 'books') (Join-Path $deployDir 'books') /E /XJ /R:1 /W:1
if (Test-Path (Join-Path $deployDir 'books\content')) {
  Remove-Item -LiteralPath (Join-Path $deployDir 'books\content') -Recurse -Force
}

$null = robocopy (Join-Path $root 'reader') (Join-Path $deployDir 'reader') /E /XJ /R:1 /W:1
$null = robocopy (Join-Path $root 'reader1') (Join-Path $deployDir 'reader1') /E /XJ /R:1 /W:1
$null = robocopy (Join-Path $root 'reader_render_v3') (Join-Path $deployDir 'reader_render_v3') /E /XJ /XD node_modules artifacts /R:1 /W:1

if (Test-Path (Join-Path $root 'docs')) {
  $null = robocopy (Join-Path $root 'docs') (Join-Path $deployDir 'docs') /E /XJ /R:1 /W:1
}

$branch = git -c safe.directory=C:/Users/yaran/Test1/pages_books -c safe.directory=C:/Users/yaran/Test1/pages_books/.worktrees/merge-reader-render-v3-staging-trim -C $root rev-parse --abbrev-ref HEAD
$commit = git -c safe.directory=C:/Users/yaran/Test1/pages_books -c safe.directory=C:/Users/yaran/Test1/pages_books/.worktrees/merge-reader-render-v3-staging-trim -C $root rev-parse HEAD

$env:CLOUDFLARE_ACCOUNT_ID = '764a8c94ce002764fc1d3d29faa4bb09'
$wrangler = Join-Path $root 'reader_render_v3\node_modules\.bin\wrangler.cmd'

$deployOutput = & $wrangler pages deploy $deployDir --project-name readerpub-books-staging --branch develop --commit-dirty=true 2>&1
$deployOutput | ForEach-Object { $_ }

$previewUrl = ($deployOutput |
  Select-String -Pattern 'https://[a-z0-9-]+\.readerpub-books-staging\.pages\.dev' -AllMatches |
  ForEach-Object { $_.Matches.Value } |
  Select-Object -Last 1)

if (-not $previewUrl) { $previewUrl = '' }

node (Join-Path $root 'tools\deploy\record-deployment.mjs') `
  --environment staging `
  --project readerpub-books-staging `
  --pages-branch develop `
  --source-branch $branch `
  --commit $commit `
  --url https://books-staging.reader.pub/books/ `
  --deployment-url $previewUrl
```

## Why This Procedure Is Correct

- it uses the already-installed Windows `wrangler.cmd`
- it avoids `npx` cache churn
- it avoids the Linux-vs-Windows `workerd` mismatch
- it avoids problematic recursive copy behavior by using `robocopy`
- it excludes bundle content that must not go to Pages:
  - local `node_modules`
  - generated `artifacts`
- it records the deployment in repo history after a successful upload

## Expected Success Output

You should see lines like:

- `✨ Success! Uploaded ...`
- `✨ Compiled Worker successfully`
- `🌎 Deploying...`
- `✨ Deployment complete! Take a peek over at https://<hash>.readerpub-books-staging.pages.dev`

Then `tools/deploy/record-deployment.mjs` should append a new entry to:

- `deployments/history.jsonl`

## Current Known Limitation

This is the reliable Windows procedure for the current repo state.

The existing `scripts/deploy-staging.sh` script is still useful as the logical deploy recipe, but on this machine it is not sufficient by itself because:

- bash cannot use `wrangler.cmd`
- bash using the POSIX `wrangler` hits the platform-specific `workerd` mismatch

If we want one-command deploys on Windows later, the repo should gain a dedicated PowerShell deploy script that wraps the exact working flow above.
