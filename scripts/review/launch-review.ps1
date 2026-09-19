param(
    [string]$ReviewRoot = "$env:TEMP\story-orchestrator-review-20260918",
    [switch]$SkipStudio,
    [switch]$SkipHost
)

$ErrorActionPreference = 'Stop'
$ReviewRoot = [IO.Path]::GetFullPath($ReviewRoot)
$expectedName = 'story-orchestrator-review-20260918'
if ((Split-Path $ReviewRoot -Leaf) -ne $expectedName) {
    throw "Refusing unexpected review root: $ReviewRoot"
}

$hostRoot = Join-Path $ReviewRoot 'host'
$extensionRoot = Join-Path $hostRoot 'public/scripts/extensions/third-party/story-orchestrator'
$logs = Join-Path $ReviewRoot 'logs'
$keyPath = Join-Path $ReviewRoot 'private/studio-key.txt'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

if (!$SkipStudio) {
    $studioPython = Join-Path $env:USERPROFILE '.unsloth/studio/unsloth_studio/Scripts/python.exe'
    if (!(Test-Path -LiteralPath $studioPython)) { throw "Unsloth Studio Python not found: $studioPython" }
    if (!(Test-Path -LiteralPath $keyPath)) { throw "Dedicated review API key not found: $keyPath" }
    $ensureConfig = Join-Path $PSScriptRoot 'ensure-artemis-config.py'
    if (!(Test-Path -LiteralPath $ensureConfig)) { throw "Artemis config helper not found: $ensureConfig" }
    & $studioPython -X utf8 $ensureConfig (Join-Path $logs 'artemis-launch-config.json') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the dedicated Artemis model override.' }
    $listener = Get-NetTCPConnection -LocalPort 8888 -State Listen -ErrorAction SilentlyContinue
    if (!$listener) {
        $studioOut = Join-Path $logs 'studio-launch.out.log'
        $studioErr = Join-Path $logs 'studio-launch.err.log'
        $studio = Start-Process -FilePath $studioPython -ArgumentList @('-X','utf8','-m','unsloth_cli','studio','--host','127.0.0.1','--port','8888','--silent','--no-cloudflare') -WorkingDirectory (Split-Path (Split-Path $studioPython)) -RedirectStandardOutput $studioOut -RedirectStandardError $studioErr -WindowStyle Hidden -PassThru
        $studio.Id | Set-Content -Encoding ascii (Join-Path $ReviewRoot 'studio.pid')
    }
    $deadline = (Get-Date).AddSeconds(60)
    do {
        try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8888/api/health' -TimeoutSec 2 } catch { $health = $null }
        if (!$health) { Start-Sleep -Milliseconds 500 }
    } while (!$health -and (Get-Date) -lt $deadline)
    if (!$health) { throw 'Unsloth Studio did not become healthy within 60 seconds.' }
    $studioListener = Get-NetTCPConnection -LocalPort 8888 -State Listen -ErrorAction Stop | Select-Object -First 1
    $studioProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($studioListener.OwningProcess)"
    if ($studioProcess.CommandLine -notmatch 'unsloth_cli studio') { throw "Port 8888 is not owned by the intended Unsloth Studio process (PID $($studioListener.OwningProcess))." }
}

if (!$SkipHost) {
    if (!(Test-Path -LiteralPath (Join-Path $hostRoot 'server.js'))) { throw "Isolated SillyTavern not found: $hostRoot" }
    $listener = Get-NetTCPConnection -LocalPort 18000 -State Listen -ErrorAction SilentlyContinue
    if (!$listener) {
        $hostOut = Join-Path $logs 'host-launch.out.log'
        $hostErr = Join-Path $logs 'host-launch.err.log'
        $reviewHostProcess = Start-Process -FilePath 'node.exe' -ArgumentList @('server.js','--port','18000') -WorkingDirectory $hostRoot -RedirectStandardOutput $hostOut -RedirectStandardError $hostErr -WindowStyle Hidden -PassThru
        $reviewHostProcess.Id | Set-Content -Encoding ascii (Join-Path $ReviewRoot 'host.pid')
    }
    $deadline = (Get-Date).AddSeconds(60)
    do {
        try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:18000/' -UseBasicParsing -TimeoutSec 2 } catch { $response = $null }
        if (!$response) { Start-Sleep -Milliseconds 500 }
    } while (!$response -and (Get-Date) -lt $deadline)
    if (!$response) { throw 'Isolated SillyTavern did not become ready within 60 seconds.' }
    $hostListener = Get-NetTCPConnection -LocalPort 18000 -State Listen -ErrorAction Stop | Select-Object -First 1
    $recordedHostPid = if (Test-Path -LiteralPath (Join-Path $ReviewRoot 'host.pid')) { [int](Get-Content -LiteralPath (Join-Path $ReviewRoot 'host.pid') -Raw) } else { 0 }
    if ($recordedHostPid -and $hostListener.OwningProcess -ne $recordedHostPid) { throw "Port 18000 owner PID $($hostListener.OwningProcess) does not match isolated host PID $recordedHostPid." }
}

[pscustomobject]@{
    reviewRoot = $ReviewRoot
    host = 'http://127.0.0.1:18000/'
    studio = 'http://127.0.0.1:8888/'
    extensionRoot = $extensionRoot
    note = 'The first authenticated model request triggers Artemis auto-load; the API key is never printed.'
}
