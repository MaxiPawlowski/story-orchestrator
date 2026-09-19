param([string]$EnvironmentFile="$env:TEMP\story-orchestrator-review-20260918/environment.json")
$ErrorActionPreference='Stop'
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$dossier=Join-Path $repoRoot 'docs/review/2026-09-18'
$evidence=Join-Path $dossier 'evidence'
$review=Get-Content $EnvironmentFile -Raw | ConvertFrom-Json
$inventory=Get-Content (Join-Path $evidence 'inventory.json') -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead((Join-Path $evidence 'reviewed-source.zip'))
$mismatches=@();$checked=0
try {
 $entries=@{};foreach($entry in $archive.Entries){$entries[$entry.FullName.Replace('\','/')]=$entry}
 foreach($item in $inventory){
  $entry=$entries[$item.path.Replace('\','/')]
  if(!$entry){$mismatches+=$item.path;continue}
  $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
  try{$actual=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLower()}finally{$stream.Dispose();$sha.Dispose()}
  if($actual -ne $item.sha256){$mismatches+=$item.path};$checked++
 }
}finally{$archive.Dispose()}
$brokenLinks=@()
foreach($doc in Get-ChildItem $dossier -Filter '*.md' -File){
 $body=[IO.File]::ReadAllText($doc.FullName)
 foreach($match in [regex]::Matches($body,'\]\(([^\)]+)\)')){
  $target=$match.Groups[1].Value
  if($target -match '^(https?://|#)'){continue}
  $target=($target -split '#')[0]
  if(!$target){continue}
  $path=if([IO.Path]::IsPathRooted($target)){$target}else{Join-Path $doc.DirectoryName $target}
  if(!(Test-Path -LiteralPath $path)){$brokenLinks+=[pscustomobject]@{document=$doc.Name;target=$target}}
 }
}
$secretFile=Join-Path $review.root 'private/studio-key.txt'
$secretMatches=@()
if(Test-Path $secretFile){
 $secret=[IO.File]::ReadAllText($secretFile).Trim()
 if($secret.Length -gt 10){
  foreach($file in Get-ChildItem $dossier,(Join-Path $repoRoot 'scripts/review') -Recurse -File | Where-Object {$_.Extension -notin @('.png','.zip')}){
   if([IO.File]::ReadAllText($file.FullName).Contains($secret)){$secretMatches+=$file.FullName.Substring($repoRoot.Length+1)}
  }
 }
}
$result=[pscustomobject]@{at=(Get-Date).ToUniversalTime().ToString('o');archiveFilesChecked=$checked;archiveMismatches=$mismatches;brokenLinks=$brokenLinks;credentialMatches=$secretMatches}
$result | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $evidence 'dossier-verification.json')
$result | ConvertTo-Json -Depth 5
if($mismatches.Count -or $brokenLinks.Count -or $secretMatches.Count){exit 1}
