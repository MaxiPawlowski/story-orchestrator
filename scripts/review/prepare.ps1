param(
    [string]$Source = (Resolve-Path "$PSScriptRoot/../..").Path,
    [string]$HostSource = 'C:\dev\SillyTavern-MainBranch',
    [string]$Destination = "$env:TEMP\story-orchestrator-review-20260918",
    [string]$EvidenceDestination = ''
)
$ErrorActionPreference = 'Stop'
$Source = [IO.Path]::GetFullPath($Source)
$HostSource = [IO.Path]::GetFullPath($HostSource)
$Destination = [IO.Path]::GetFullPath($Destination)
$EvidenceDestination = if ([string]::IsNullOrWhiteSpace($EvidenceDestination)) {
    Join-Path $Source 'docs/review/2026-09-18/evidence'
} else {
    [IO.Path]::GetFullPath($EvidenceDestination)
}
if ($Destination.StartsWith($HostSource, [StringComparison]::OrdinalIgnoreCase)) { throw 'Review copy must be outside the original host.' }
if (Test-Path -LiteralPath $Destination) { throw "Destination already exists: $Destination" }

# A review run is immutable evidence. Refuse the dated directory once it has an
# inventory (or any other content) and require a new explicit destination.
if (Test-Path -LiteralPath $EvidenceDestination) {
    if (Test-Path -LiteralPath (Join-Path $EvidenceDestination 'inventory.json')) {
        throw "Evidence inventory already exists: $EvidenceDestination. Pass -EvidenceDestination with a new directory."
    }
    if (@(Get-ChildItem -LiteralPath $EvidenceDestination -Force).Count -gt 0) {
        throw "Evidence destination is not empty: $EvidenceDestination. Pass -EvidenceDestination with a new directory."
    }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-Utf8Text {
    param([string]$Path, [AllowEmptyString()][string]$Text)
    [IO.File]::WriteAllText($Path, $Text, $script:utf8NoBom)
}
function Join-OutputLines {
    param([object[]]$Lines)
    return (@($Lines) -join [Environment]::NewLine) + [Environment]::NewLine
}

$head = git -C $Source rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not read the source Git revision.' }
$status = git -C $Source status --porcelain=v1
if ($LASTEXITCODE -ne 0) { throw 'Could not read the source Git status.' }
$history = git -C $Source log --all --format='%h %ad %s' --date=iso-strict
if ($LASTEXITCODE -ne 0) { throw 'Could not read the source Git history.' }
$files = @(git -C $Source ls-files --cached --others --exclude-standard) | Sort-Object -Unique
if ($LASTEXITCODE -ne 0) { throw 'Could not inventory source files.' }

# Review output lives under docs/review. Never copy a prior snapshot into the
# next snapshot, including evidence written by an interrupted earlier run.
$files = @($files | Where-Object { ($_.Replace('\', '/')) -notlike 'docs/review/*' })
$manifest = @(foreach ($relative in $files) {
    $path = Join-Path $Source $relative
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $item = Get-Item -LiteralPath $path
        [pscustomobject]@{ path=$relative; bytes=$item.Length; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower(); review='inventoried' }
    }
})

New-Item -ItemType Directory -Force -Path $Destination,$EvidenceDestination | Out-Null
Write-Utf8Text (Join-Path $EvidenceDestination 'baseline-status.txt') (Join-OutputLines $status)
Write-Utf8Text (Join-Path $EvidenceDestination 'history.txt') (Join-OutputLines $history)
Write-Utf8Text (Join-Path $EvidenceDestination 'inventory.json') ((ConvertTo-Json -InputObject $manifest -Depth 4) + [Environment]::NewLine)

$copyHost = Join-Path $Destination 'host'
robocopy $HostSource $copyHost /E /XJ /XD .git node_modules data backups cache uploads plugins third-party .gemini .vscode /XF config.yaml config.conf.bak /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Host copy failed: $LASTEXITCODE" }

# /XF protects the active root config, but also excludes default/config.yaml.
# Restore only the distributable default; the generated root config is based on it.
$defaultConfig = Join-Path $HostSource 'default/config.yaml'
$copiedDefaultConfig = Join-Path $copyHost 'default/config.yaml'
if (!(Test-Path -LiteralPath $defaultConfig -PathType Leaf)) { throw "Default host config not found: $defaultConfig" }
New-Item -ItemType Directory -Force -Path (Split-Path $copiedDefaultConfig) | Out-Null
Copy-Item -LiteralPath $defaultConfig -Destination $copiedDefaultConfig

$copyExtension = Join-Path $copyHost 'public/scripts/extensions/third-party/story-orchestrator'
New-Item -ItemType Directory -Force -Path $copyExtension | Out-Null
foreach ($entry in $manifest) {
    $target = Join-Path $copyExtension $entry.path
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath (Join-Path $Source $entry.path) -Destination $target
}

# Generate the isolated root config while changing only the top-level port and
# browserLaunch.enabled. Other enabled features retain the host defaults.
$configLines = @(Get-Content -LiteralPath $defaultConfig)
$insideBrowserLaunch = $false
$browserLaunchEdits = 0
$portEdits = 0
for ($index = 0; $index -lt $configLines.Count; $index += 1) {
    $line = $configLines[$index]
    if ($line -match '^browserLaunch:\s*(?:#.*)?$') {
        $insideBrowserLaunch = $true
        continue
    }
    if ($insideBrowserLaunch -and $line -match '^[^\s#]') {
        $insideBrowserLaunch = $false
    }
    if ($insideBrowserLaunch -and $line -match '^(\s+)enabled:\s*(?:true|false)([ \t]*(?:#.*)?)$') {
        $configLines[$index] = "$($Matches[1])enabled: false$($Matches[2])"
        $browserLaunchEdits += 1
        continue
    }
    if ($line -match '^port:\s*\d+([ \t]*(?:#.*)?)$') {
        $configLines[$index] = "port: 18000$($Matches[1])"
        $portEdits += 1
    }
}
if ($browserLaunchEdits -ne 1) { throw "Expected one browserLaunch.enabled setting, changed $browserLaunchEdits." }
if ($portEdits -ne 1) { throw "Expected one top-level port setting, changed $portEdits." }
Write-Utf8Text (Join-Path $copyHost 'config.yaml') (Join-OutputLines $configLines)

$environment = [pscustomobject]@{
    created=(Get-Date).ToUniversalTime().ToString('o')
    source=$Source
    revision=($head | Select-Object -First 1)
    hostSource=$HostSource
    root=$Destination
    host=$copyHost
    extension=$copyExtension
    evidence=$EvidenceDestination
    port=18000
    cdpPort=19222
    copiedFiles=$manifest.Count
}
$environmentJson = (ConvertTo-Json $environment) + [Environment]::NewLine
Write-Utf8Text (Join-Path $EvidenceDestination 'environment.json') $environmentJson
Write-Utf8Text (Join-Path $Destination 'environment.json') $environmentJson
Write-Output "Isolated review: $Destination ($($manifest.Count) extension files)"
