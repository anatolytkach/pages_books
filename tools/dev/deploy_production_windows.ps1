param(
  [string]$ProjectName = "reader-books",
  [string]$PagesBranch = "production",
  [string]$CanonicalUrl = "https://reader.pub/books/"
)

$ErrorActionPreference = "Stop"

function Assert-Windows {
  $isWindowsHost = if (Get-Variable -Name IsWindows -Scope Global -ErrorAction SilentlyContinue) {
    $IsWindows
  } else {
    [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
  }
  if (-not $isWindowsHost) {
    throw "This script is Windows-only."
  }
}

function Get-RepoRoot {
  $root = git rev-parse --show-toplevel 2>$null
  if (-not $root) {
    throw "Could not determine repository root. Run this script from inside a Git worktree."
  }
  return $root.Trim()
}

function Get-WorktreeRoots {
  $output = git worktree list --porcelain 2>$null
  if (-not $output) { return @() }
  $roots = @()
  foreach ($line in $output) {
    if ($line -like "worktree *") {
      $roots += $line.Substring(9).Trim()
    }
  }
  return $roots
}

function Join-PathMany {
  param([string]$Base, [string[]]$Parts)
  $result = $Base
  foreach ($part in $Parts) {
    $result = Join-Path $result $part
  }
  return $result
}

function Resolve-WranglerPath {
  param([string]$RepoRoot, [string[]]$WorktreeRoots)
  $candidates = New-Object System.Collections.Generic.List[string]
  $roots = @($RepoRoot) + $WorktreeRoots
  foreach ($root in $roots) {
    foreach ($candidate in @(
      (Join-PathMany $root @("reader_render_v3", "node_modules", ".bin", "wrangler.cmd")),
      (Join-PathMany $root @("node_modules", ".bin", "wrangler.cmd"))
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
  $pathWrangler = Get-Command wrangler.cmd -ErrorAction SilentlyContinue
  if ($pathWrangler -and $pathWrangler.Source) {
    return $pathWrangler.Source
  }
  throw "Could not find a Windows Wrangler executable."
}

function Copy-Tree {
  param([string]$Source, [string]$Destination, [string[]]$ExcludeDirs = @())
  if (-not (Test-Path $Source)) {
    throw "Missing source path: $Source"
  }
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
}

Assert-Windows

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

$branch = (git branch --show-current).Trim()
if (-not $branch) { $branch = "detached" }
$commit = (git rev-parse HEAD).Trim()
$worktreeRoots = Get-WorktreeRoots
$wranglerPath = Resolve-WranglerPath -RepoRoot $repoRoot -WorktreeRoots $worktreeRoots

$tempRoot = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
$deployDir = Join-Path $tempRoot ("readerpub-books-production-deploy-" + ([guid]::NewGuid().ToString("N")))
New-Item -ItemType Directory -Path $deployDir | Out-Null

try {
  Copy-Item (Join-Path $repoRoot "_worker.js") $deployDir
  Copy-Tree -Source (Join-Path $repoRoot "api") -Destination (Join-Path $deployDir "api")
  Copy-Tree -Source (Join-Path $repoRoot "publisher_tasks") -Destination (Join-Path $deployDir "publisher_tasks")
  Copy-Tree -Source (Join-Path $repoRoot "books") -Destination (Join-Path $deployDir "books") -ExcludeDirs @("content", "gutenberg_protected_epub3_sources")
  Copy-Tree -Source (Join-Path $repoRoot "reader") -Destination (Join-Path $deployDir "reader")
  Copy-Tree -Source (Join-Path $repoRoot "reader1") -Destination (Join-Path $deployDir "reader1")
  Copy-Tree -Source (Join-Path $repoRoot "reader_render_v3") -Destination (Join-Path $deployDir "reader_render_v3") -ExcludeDirs @("node_modules", "artifacts")
  if (Test-Path (Join-Path $repoRoot "reader_render_v5")) {
    Copy-Tree -Source (Join-Path $repoRoot "reader_render_v5") -Destination (Join-Path $deployDir "reader_render_v5") -ExcludeDirs @("node_modules", "artifacts")
  }
  Copy-Item (Join-PathMany $repoRoot @("tools", "runtime", "reader-books-pages.wrangler.jsonc")) (Join-Path $deployDir "wrangler.jsonc")

  Write-Host "[deploy-production] Repo root: $repoRoot"
  Write-Host "[deploy-production] Branch: $branch"
  Write-Host "[deploy-production] Commit: $commit"
  Write-Host "[deploy-production] Wrangler: $wranglerPath"
  Write-Host "[deploy-production] Bundle: $deployDir"

  $deployOutput = & $wranglerPath pages deploy --cwd $deployDir --project-name $ProjectName --branch $PagesBranch --commit-dirty=true 2>&1
  $deployOutput | ForEach-Object { $_ }

  $previewUrl = $null
  foreach ($line in $deployOutput) {
    if ($line -match 'https://[A-Za-z0-9.-]+\.pages\.dev') {
      $previewUrl = $Matches[0]
    }
  }

  node (Join-PathMany $repoRoot @("tools", "deploy", "record-deployment.mjs")) `
    --environment production `
    --project $ProjectName `
    --pages-branch $PagesBranch `
    --source-branch $branch `
    --commit $commit `
    --url $CanonicalUrl `
    --deployment-url $previewUrl

  Write-Host "[deploy-production] Canonical URL: $CanonicalUrl"
  if ($previewUrl) {
    Write-Host "[deploy-production] Preview URL: $previewUrl"
  }
}
finally {
  if (Test-Path $deployDir) {
    Remove-Item -Recurse -Force $deployDir
  }
}
