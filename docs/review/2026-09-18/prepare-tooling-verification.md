# Review preparation tooling verification

Scope: `scripts/review/prepare.ps1` only. The active SillyTavern host, launcher, profiles, sessions, and settings were not changed.

## Changes

- Added `-EvidenceDestination`. The dated default evidence directory is immutable: an existing `inventory.json` or any non-empty directory causes a preflight refusal before the review destination is created (`scripts/review/prepare.ps1:4-29`).
- Excluded all `docs/review/**` paths from the Git tracked/untracked source manifest, preventing a new isolated copy from recursively embedding earlier reports and evidence (`prepare.ps1:49-62`).
- Replaced pipeline/default text writers, including `Tee-Object -FilePath`, with one UTF-8-no-BOM writer for status, history, inventory, generated config, and both environment manifests (`prepare.ps1:31-39,64-67,117-129`).
- Kept root `config.yaml` and `config.conf.bak` excluded from the host copy, then restored `default/config.yaml` byte-for-byte explicitly (`prepare.ps1:69-80`).
- Generated the isolated root config from the default using section-aware edits. Exactly one `browserLaunch.enabled` field must be found and set false, and exactly one top-level port must be set to 18000; any shape drift fails the run. Other `enabled` fields are preserved (`prepare.ps1:90-117`).
- Added exit-code checks for every Git inventory command (`prepare.ps1:41-48`).

A rerun against the populated 2026-09-18 evidence directory now refuses. A new run must choose both a new review copy and evidence location, for example:

```powershell
.\scripts\review\prepare.ps1 -Destination $env:TEMP\story-orchestrator-review-next -EvidenceDestination .\docs\review\2026-09-19\evidence
```

## Verification

PowerShell syntax parsing passed with `[scriptblock]::Create(...)`.

A disposable minimal Git repository and fake host exercised the script end to end. It verified tracked and untracked source copying, recursive review-artifact exclusion, targeted config changes, preservation of unrelated feature flags, exclusion of the active root config, byte-identical default-config restoration, UTF-8-no-BOM output, and refusal of an existing inventory before destination creation. Result: **10/10 checks passed**. Evidence: `evidence/prepare-tooling-verification.json`.

A second disposable host used a copy of the full current `default/config.yaml`. The generated root config had exactly two changed lines: line 22 `browserLaunch.enabled: true -> false` and line 40 `port: 8000 -> 18000`. The copied default retained SHA-256 `7b64c6bc1be857345d7b3b5b8ba6e145f18a137f80664c656b22b9a8ac7d3c4f`. Evidence: `evidence/prepare-real-default-verification.json`.

The preserved baseline artifacts were fingerprinted before and after both fixtures and did not change:

- `inventory.json`: `1ecffaae7698ed2ad0eeb67a99e16553ef4c6ad73a66534f66532b02133b2819`
- `environment.json`: `dc743e30e158dfda318e3e679dd3a65eab96f8d62169807359aaa72f5e1ce3e9`

The fixtures were removed from the system temporary directory after validation. The script was not run against the active host and no server was launched.
