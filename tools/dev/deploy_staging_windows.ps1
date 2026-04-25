param(
  [string]$ProjectName = "readerpub-books-staging",
  [string]$PagesBranch = "develop",
  [string]$CanonicalUrl = "https://books-staging.reader.pub/books/"
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  $root = git rev-parse --show-toplevel 2>$null
  if (-not $root) {
    throw "Could not determine repository root. Run this script from inside a Git worktree."
  }
  return $root.Trim()
}

function Get-WorktreeRoots {
  $output = git worktree list --porcelain 2>$null
  if (-not $output) {
    return @()
  }
  $roots = @()
  foreach ($line in $output) {
    if ($line -like "worktree *") {
      $roots += $line.Substring(9).Trim()
    }
  }
  return $roots
}

function Resolve-WranglerPath {
  param(
    [string]$RepoRoot,
    [string[]]$WorktreeRoots
  )

  $candidates = New-Object System.Collections.Generic.List[string]
  $candidates.Add((Join-Path $RepoRoot "reader_render_v3\node_modules\.bin\wrangler.cmd"))
  foreach ($root in $WorktreeRoots) {
    $candidate = Join-Path $root "reader_render_v3\node_modules\.bin\wrangler.cmd"
    if (-not $candidates.Contains($candidate)) {
      $candidates.Add($candidate)
    }
  }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw @"
Could not find reader_render_v3\node_modules\.bin\wrangler.cmd in this repo or its linked worktrees.
Install the project dependencies in one worktree first, then rerun this script.
"@
}

function Copy-Tree {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$ExcludeDirs = @()
  )

  if (-not (Test-Path $Source)) {
    throw "Missing source path: $Source"
  }

  $robocopyArgs = @($Source, $Destination, "/E")
  if ($ExcludeDirs.Count -gt 0) {
    $robocopyArgs += "/XD"
    $robocopyArgs += $ExcludeDirs
  }

  & robocopy @robocopyArgs | Out-Null
  $exitCode = $LASTEXITCODE
  if ($exitCode -ge 8) {
    throw "robocopy failed for $Source -> $Destination with exit code $exitCode"
  }
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

$branch = (git branch --show-current).Trim()
$commit = (git rev-parse HEAD).Trim()
$worktreeRoots = Get-WorktreeRoots
$wranglerPath = Resolve-WranglerPath -RepoRoot $repoRoot -WorktreeRoots $worktreeRoots

$deployDir = Join-Path $env:TEMP ("readerpub-books-staging-deploy-" + ([guid]::NewGuid().ToString("N")))
New-Item -ItemType Directory -Path $deployDir | Out-Null

try {
  Copy-Item (Join-Path $repoRoot "_worker.js") $deployDir
  Copy-Tree -Source (Join-Path $repoRoot "api") -Destination (Join-Path $deployDir "api")
  Copy-Tree -Source (Join-Path $repoRoot "publisher_tasks") -Destination (Join-Path $deployDir "publisher_tasks")
  Copy-Tree -Source (Join-Path $repoRoot "books") -Destination (Join-Path $deployDir "books")
  Copy-Tree -Source (Join-Path $repoRoot "reader") -Destination (Join-Path $deployDir "reader")
  Copy-Tree -Source (Join-Path $repoRoot "reader1") -Destination (Join-Path $deployDir "reader1")
  Copy-Tree -Source (Join-Path $repoRoot "reader_render_v3") -Destination (Join-Path $deployDir "reader_render_v3") -ExcludeDirs @("node_modules", "artifacts")
  if (Test-Path (Join-Path $repoRoot "reader_render_v5")) {
    Copy-Tree -Source (Join-Path $repoRoot "reader_render_v5") -Destination (Join-Path $deployDir "reader_render_v5") -ExcludeDirs @("node_modules", "artifacts")
  }

  $booksContent = Join-Path $deployDir "books\content"
  if (Test-Path $booksContent) {
    Remove-Item -Recurse -Force $booksContent
  }

  Write-Host "[deploy-staging] Repo root: $repoRoot"
  Write-Host "[deploy-staging] Branch: $branch"
  Write-Host "[deploy-staging] Commit: $commit"
  Write-Host "[deploy-staging] Wrangler: $wranglerPath"
  Write-Host "[deploy-staging] Bundle: $deployDir"

  $deployOutput = & $wranglerPath pages deploy $deployDir --project-name $ProjectName --branch $PagesBranch --commit-dirty=true 2>&1
  $deployOutput | ForEach-Object { $_ }

  $previewUrl = $null
  foreach ($line in $deployOutput) {
    if ($line -match 'https://[A-Za-z0-9.-]+\.pages\.dev') {
      $previewUrl = $Matches[0]
    }
  }

  if (-not $previewUrl) {
    throw "Wrangler deploy succeeded but no Pages preview URL was found in the output."
  }

  node (Join-Path $repoRoot "tools\deploy\record-deployment.mjs") `
    --environment staging `
    --project $ProjectName `
    --pages-branch $PagesBranch `
    --source-branch $branch `
    --commit $commit `
    --url $CanonicalUrl `
    --deployment-url $previewUrl

  Write-Host "[deploy-staging] Canonical URL: $CanonicalUrl"
  Write-Host "[deploy-staging] Preview URL: $previewUrl"
}
finally {
  if (Test-Path $deployDir) {
    Remove-Item -Recurse -Force $deployDir
  }
}
