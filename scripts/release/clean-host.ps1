<#
  v2.3 plan 08 — the Windows half of the clean-host check. Same steps as clean-host.sh: clone
  SillyTavern at a pinned revision into a temp directory, copy this extension in at the third-party
  path WITHOUT node_modules/dist, install with an isolated cache, and run the gates there. The review
  host that failed to typecheck is a Windows host, so this is the one that has to exist.

  Usage:
    pwsh scripts\release\clean-host.ps1 [-Ref <commit|branch|tag>] [-Keep] [-Gates typecheck,typecheck-test,lint,test,build,release,debug,plugin,storybook]
#>
[CmdletBinding()]
param(
  [string]$Ref = $env:ST_REF,
  [string]$Repo = $(if ($env:ST_REPO) { $env:ST_REPO } else { "https://github.com/SillyTavern/SillyTavern.git" }),
  [string]$Gates = "typecheck,typecheck-test,lint,test,build,release,debug,plugin,storybook",
  [string]$Store,
  [switch]$Keep
)

$ErrorActionPreference = "Stop"
$extDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $Store) { $Store = Join-Path $extDir "docs\release\clean-host" }
New-Item -ItemType Directory -Force -Path $Store | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$log = Join-Path $Store "$stamp.log"
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("so-clean-host-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$clone = Join-Path $work "SillyTavern"
$target = Join-Path $clone "public\scripts\extensions\third-party\story-orchestrator"
$status = 0

function Say([string]$message) { Write-Host "[clean-host] $message"; Add-Content -Path $log -Value "[clean-host] $message" }

Say "extension: $extDir"
Say "log: $log"

New-Item -ItemType Directory -Force -Path $work | Out-Null
git clone --quiet $Repo $clone
if ($Ref) { git -C $clone checkout --quiet $Ref }
$commit = (git -C $clone rev-parse HEAD).Trim()
Say "SillyTavern $commit"

New-Item -ItemType Directory -Force -Path $target | Out-Null
Get-ChildItem -Path $extDir -Force | Where-Object { $_.Name -notin @("node_modules", "dist", ".debug", ".sb-static", ".git") } |
  Copy-Item -Destination $target -Recurse -Force
Say "copied the extension without node_modules/dist"

if ($env:ST_PUBLIC) { Remove-Item Env:\ST_PUBLIC; Say "unset ST_PUBLIC for the gates" }

Push-Location $target
function Invoke-Gate([string]$name, [string]$command, [string[]]$arguments) {
  Say "== $name =="
  & $command @arguments *>> $log
  if ($LASTEXITCODE -eq 0) { Say "$name OK" } else { Say "$name FAILED"; $script:status = 1 }
}

Invoke-Gate "npm ci" "npm" @("ci", "--no-audit", "--no-fund", "--cache", (Join-Path $work "npm-cache"))
$selected = $Gates.Split(",")
if ($selected -contains "typecheck") { Invoke-Gate "typecheck" "npm" @("run", "typecheck") }
if ($selected -contains "typecheck-test") { Invoke-Gate "typecheck:test" "npm" @("run", "typecheck:test") }
if ($selected -contains "lint") { Invoke-Gate "lint" "npm" @("run", "lint") }
if ($selected -contains "test") { Invoke-Gate "test" "npm" @("test") }
if ($selected -contains "build") { Invoke-Gate "build" "npm" @("run", "build") }
if ($selected -contains "release") { Invoke-Gate "test:release" "npm" @("run", "test:release") }
if ($selected -contains "debug") { Invoke-Gate "test:debug" "npm" @("run", "test:debug") }
if ($selected -contains "plugin") { Invoke-Gate "test:plugin" "npm" @("run", "test:plugin") }
if ($selected -contains "storybook") { Invoke-Gate "test-storybook:ci" "npm" @("run", "test-storybook:ci") }
Pop-Location

$extPkg = Get-Content (Join-Path $target "package.json") | ConvertFrom-Json
$stPkgPath = Join-Path $clone "package.json"
$stPkg = if (Test-Path $stPkgPath) { Get-Content $stPkgPath | ConvertFrom-Json } else { $null }
$manifestPath = Join-Path $target "dist\manifest.json"
$record = [ordered]@{
  kind     = "clean-host-record"
  at       = (Get-Date).ToUniversalTime().ToString("o")
  status   = if ($status -eq 0) { "green" } else { "failed" }
  platform = "windows"
  host     = [ordered]@{ dir = $clone; sha = $commit; version = $stPkg.version }
  extension = [ordered]@{ version = $extPkg.version }
  manifest = if (Test-Path $manifestPath) { Get-Content $manifestPath -Raw | ConvertFrom-Json } else { $null }
}
$record | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $Store "$stamp.host.json")
Say "host record: $(Join-Path $Store "$stamp.host.json")"
Say "result: $(if ($status -eq 0) { 'green' } else { 'FAILED' })"

if (-not $Keep) { Remove-Item -Recurse -Force $work } else { Say "keeping $work" }
exit $status
