$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot 'cli.mjs'
foreach ($action in @('start', 'start-comfy', 'start-st')) {
    & node $cli $action
    if ($LASTEXITCODE -ne 0) { throw "Local stack failed at $action" }
}
Write-Output 'Local ST, resource controller and ComfyUI ready. Artemis loads on its first request.'
