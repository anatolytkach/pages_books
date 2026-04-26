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

function Join-PathMany {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Base,
    [Parameter(Mandatory = $true)]
    [string[]]$Parts
  )

  $result = $Base
  foreach ($part in $Parts) {
    $result = Join-Path $result $part
  }
  return $result
}

function Test-IsWindows {
  if (Get-Variable -Name IsWindows -Scope Global -ErrorAction SilentlyContinue) {
    return $IsWindows
  }
  return [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
}

function Resolve-WranglerPath {
  param(
    [string]$RepoRoot,
    [string[]]$WorktreeRoots
  )

  $candidates = New-Object System.Collections.Generic.List[string]
  $roots = @($RepoRoot) + $WorktreeRoots
  foreach ($root in $roots) {
    foreach ($candidate in @(
      (Join-PathMany $root @("reader_render_v3", "node_modules", ".bin", "wrangler.cmd")),
      (Join-PathMany $root @("reader_render_v3", "node_modules", ".bin", "wrangler")),
      (Join-PathMany $root @("node_modules", ".bin", "wrangler.cmd")),
      (Join-PathMany $root @("node_modules", ".bin", "wrangler"))
    )) {
      if (-not $candidates.Contains($candidate)) {
        $candidates.Add($candidate)
      }
    }
  }

  if ($env:WRANGLER_BIN) {
    $envCandidate = $env:WRANGLER_BIN.Trim()
    if ($envCandidate -and -not $candidates.Contains($envCandidate)) {
      $candidates.Insert(0, $envCandidate)
    }
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  $pathWrangler = Get-Command wrangler -ErrorAction SilentlyContinue
  if ($pathWrangler -and $pathWrangler.Source) {
    return $pathWrangler.Source
  }

  throw @"
Could not find a local Wrangler executable in this repo or its linked worktrees.
Checked reader_render_v3/node_modules/.bin/wrangler(.cmd), root node_modules/.bin/wrangler(.cmd), WRANGLER_BIN, and PATH.
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

  if (Test-IsWindows) {
    $robocopyArgs = @($Source, $Destination, "/E", "/XJ", "/R:1", "/W:1")
    if ($ExcludeDirs.Count -gt 0) {
      $robocopyArgs += "/XD"
      $robocopyArgs += $ExcludeDirs
    }

    & robocopy @robocopyArgs | Out-Null
    $exitCode = $LASTEXITCODE
    if ($exitCode -ge 8) {
      throw "robocopy failed for $Source -> $Destination with exit code $exitCode"
    }
    return
  }

  $rsync = Get-Command rsync -ErrorAction SilentlyContinue
  if ($rsync) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $sourcePath = (Resolve-Path $Source).Path.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + "/"
    $rsyncArgs = @("-a", "--delete")
    foreach ($dir in $ExcludeDirs) {
      $rsyncArgs += "--exclude=$dir/"
    }
    $rsyncArgs += $sourcePath
    $rsyncArgs += $Destination
    & $rsync.Source @rsyncArgs
    if ($LASTEXITCODE -ne 0) {
      throw "rsync failed for $Source -> $Destination with exit code $LASTEXITCODE"
    }
    return
  }

  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
  foreach ($dir in $ExcludeDirs) {
    $excludedPath = Join-Path $Destination $dir
    if (Test-Path $excludedPath) {
      Remove-Item -LiteralPath $excludedPath -Recurse -Force
    }
  }
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

$branch = (git branch --show-current).Trim()
$commit = (git rev-parse HEAD).Trim()
$worktreeRoots = Get-WorktreeRoots
$wranglerPath = Resolve-WranglerPath -RepoRoot $repoRoot -WorktreeRoots $worktreeRoots

$tempRoot = if ($env:TEMP) { $env:TEMP } elseif ($env:TMPDIR) { $env:TMPDIR } else { [System.IO.Path]::GetTempPath() }
$deployDir = Join-Path $tempRoot ("readerpub-books-staging-deploy-" + ([guid]::NewGuid().ToString("N")))
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

  $booksContent = Join-PathMany $deployDir @("books", "content")
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

  node (Join-PathMany $repoRoot @("tools", "deploy", "record-deployment.mjs")) `
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
