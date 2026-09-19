$ErrorActionPreference='Stop'
$evidence=Join-Path $PSScriptRoot '../../docs/review/2026-09-18/evidence'
$inventory=Get-Content (Join-Path $evidence 'inventory.json') -Raw | ConvertFrom-Json
$testLog=Get-Content (Join-Path $evidence 'test.log') -Raw
$direct=@('src/engine/engine.ts','src/engine/blackboard.ts','src/engine/validate.ts','src/engine/applyQueue.ts','src/extraction/parse.ts','src/extraction/sharedRead.ts','src/extraction/scheduler.ts','src/extraction/scope.ts','src/extraction/reconcile.ts','src/extraction/client.ts','src/runtime/runtimeManager.ts','src/runtime/index.ts','src/runtime/turnBridge.ts','src/runtime/boundaryWork.ts','src/runtime/effectsApplier.ts','src/runtime/storyUpdate.ts','src/runtime/storySelection.ts','src/runtime/storyLibrary.ts','src/runtime/persistence.ts','src/runtime/persistenceMigration.ts','src/runtime/narrative.ts','src/runtime/coordinators/stagecraftCoordinator.ts','src/runtime/coordinators/copilotCoordinator.ts','src/runtime/coordinators/memoryCoordinator.ts','src/runtime/coordinators/extractionCoordinator.ts','src/runtime/coordinators/expansionCoordinator.ts','src/runtime/coordinators/pacingCoordinator.ts','src/generation/merge.ts','src/generation/parse.ts','src/generation/critic.ts','src/generation/revalidate.ts','src/generation/generate.ts','src/memory/stores.ts','src/memory/budget.ts','src/memory/consolidate.ts','src/memory/epistemic.ts','src/memory/ledger.ts','src/memory/inject.ts','src/memory/supersede.ts','src/services/stHost/authorNotes.ts','src/services/stHost/presets.ts','src/services/stHost/popup.ts','src/services/stHost/modules.ts','src/services/stHost/connectionProfiles.ts','src/services/stHost/worldInfo.ts','src/wizard/provisioning.ts','src/studio/StudioModal.tsx','src/studio/StudioModal.stories.tsx','vendor/smart-memory/embeddings.js','vendor/smart-memory/longterm.js','vendor/smart-memory/session.js')
$rows=foreach($item in $inventory){
 $path=$item.path.Replace('\','/');$area=($path -split '/')[0];$kind='configuration or asset';$level='inventoried';$ref='inventory.json'
 if($path -match '^src/([^/]+)/'){$area=$Matches[1];$kind='first-party source';$level='subsystem accounted; individual line audit not claimed';$ref='../coverage.md'}
 if($path -match '\.test\.[cm]?[jt]sx?$'){$kind='test';if($testLog.Contains("PASS $path")){$level='executed in baseline';$ref='test.log'}else{$level='inventoried; execution not inferred'}}
 if($path -match '\.stories\.[jt]sx?$'){$kind='component fixture';$level='included in Storybook build/test corpus';$ref='storybook-direct-test.log'}
 if($path -match '^docs/|^\.claude/'){$kind='documentation/instructions';$level='inventoried; selected contracts traced in dossier';$ref='../architecture.md'}
 if($path -match '^test/(fixtures|goldens|scenarios|journeys)/'){$kind='fixture/golden/scenario';$level='inventoried; consumption depends on named test/run';$ref='../coverage.md; ../live-review.md'}
 if($path -match '^vendor/'){$kind='vendor/reference';$level='inventoried; relevant adaptation paths sampled';$ref='../memory-engine-review.md'}
 if($direct -contains $path){$level='targeted source inspection';$ref='../findings.md; ../architecture.md; ../memory-engine-review.md; ../ux.md'}
 [pscustomobject]@{path=$path;area=$area;kind=$kind;review=$level;evidence=$ref;sha256=$item.sha256}
}
$rows | Export-Csv -NoTypeInformation -Encoding UTF8 (Join-Path $evidence 'file-coverage.csv')
$rows | Group-Object review | Select-Object Name,Count | Format-Table -AutoSize
