param([string]$EnvironmentFile = "$env:TEMP\story-orchestrator-review-20260918/environment.json")
$ErrorActionPreference='Stop'
$review=Get-Content -LiteralPath $EnvironmentFile -Raw | ConvertFrom-Json
$destination=Join-Path $PSScriptRoot '../../docs/review/2026-09-18/evidence'
$inventory=Get-Content -LiteralPath (Join-Path $destination 'inventory.json') -Raw | ConvertFrom-Json
$staging=Join-Path $review.root 'dossier-source-snapshot'
New-Item -ItemType Directory -Force -Path $staging | Out-Null
$exceptions=@()
foreach($entry in $inventory){
 $inputPath=Join-Path $review.extension $entry.path
 if(!(Test-Path -LiteralPath $inputPath)){$exceptions += [pscustomobject]@{path=$entry.path;reason='missing from isolated copy'};continue}
 $actual=(Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLower()
 if($actual -ne $entry.sha256){$exceptions += [pscustomobject]@{path=$entry.path;reason='isolated build or review modified content';baseline=$entry.sha256;actual=$actual};continue}
 $target=Join-Path $staging $entry.path
 New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
 Copy-Item -LiteralPath $inputPath -Destination $target
}
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath (Join-Path $destination 'reviewed-source.zip') -Force
ConvertTo-Json -InputObject $exceptions -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $destination 'archive-exceptions.json')
$checkLogs=@('typecheck.log','lint.log','debug-typecheck.log','test.log','build.log','test-storybook-ci.log','typecheck-contained.log','build-contained.log','storybook-direct-build.log','storybook-direct-test.log')
foreach($file in $checkLogs){Copy-Item -LiteralPath (Join-Path $review.root "logs/$file") -Destination (Join-Path $destination $file)}
$hostPaths=@('package.json','package-lock.json','public/script.js','public/scripts/world-info.js','public/scripts/group-chats.js','public/scripts/extensions/shared.js','public/scripts/extensions/connection-manager/index.js','public/scripts/extensions/authors-note/index.js','public/scripts/popup.js','public/scripts/backgrounds.js')
$hostHashes=@(foreach($path in $hostPaths){$file=Join-Path $review.host $path;if(Test-Path -LiteralPath $file){[pscustomobject]@{path=$path;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()}}})
ConvertTo-Json -InputObject $hostHashes -Depth 3 | Set-Content -Encoding UTF8 (Join-Path $destination 'host-source-hashes.json')
Write-Output "Archived $($inventory.Count-$exceptions.Count) matching files; $($exceptions.Count) exceptions."
$exceptions | Select-Object path,reason
