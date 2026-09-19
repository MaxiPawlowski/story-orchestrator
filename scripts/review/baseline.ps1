param([string]$EnvironmentFile = "$env:TEMP\story-orchestrator-review-20260918/environment.json")
$ErrorActionPreference = 'Continue'
$review = Get-Content -LiteralPath $EnvironmentFile -Raw | ConvertFrom-Json
$logs = Join-Path $review.root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$runs = @()
function Run-Check($Name, $Directory, $Arguments) {
    $started = Get-Date
    Push-Location $Directory
    try {
        & npm.cmd @Arguments *> (Join-Path $logs "$Name.log")
        $code = $LASTEXITCODE
    } finally { Pop-Location }
    $script:runs += [pscustomobject]@{name=$Name; command="npm $($Arguments -join ' ')"; directory=$Directory; started=$started.ToUniversalTime().ToString('o'); seconds=((Get-Date)-$started).TotalSeconds; exitCode=$code; log="$Name.log"}
    $script:runs | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $logs 'checks.json')
    Write-Output "$Name exit=$code"
}
Run-Check 'host-ci' $review.host @('ci','--no-audit','--no-fund')
Run-Check 'extension-ci' $review.extension @('ci','--no-audit','--no-fund')
foreach ($check in @('typecheck','lint','debug:typecheck','test','build','test-storybook:ci')) {
    Run-Check ($check -replace ':','-') $review.extension @('run',$check)
}
