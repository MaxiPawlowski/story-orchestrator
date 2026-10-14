# 35 — v2.8 test coverage

Imported from `C:\dev\so-coverage-draft.md`: audit of master `c21a42b9`, 2026-10-10.
B6 update 2026-10-11 on `v2.8-pod2`, after merging master. Synthetic fixtures only; no campaign content.
Rows outside the B6 and pose/head updates retain the original audit's evidence, not a new acceptance claim.

## Matrix

J = jest; P = server-plugin node:test; D = no-model browser scenario; L = real-model scenario;
Jy = journey; PG = payload golden; SB = authored Storybook coverage (execution only where cited);
Lab = private campaign lab, counts/features only. A written fixture is not a passed gate.

| Feature | J | P | D | L | Jy | PG | SB | Lab | Evidence / owed |
|---|---|---|---|---|---|---|---|---|---|
| Living director, branching, F24/F25/F26 pace (22) | living, coordinator review, pace, paceL1, rollback, spoilers, authorHold | — | **v28-35-living-rollback PASS ×2** | no committed L1/L5 fixture | — | — | authored | — | B6 covers review, boundary fold, reopen, swipe/delete and graph replay. L1 below floor; M21 after pace2, M22/M24, committed L1/L5 model fixture owed |
| Wizard on Sol/harness, Ask, recipes (09) | yes | — | v28-09-ask-player-clean, scripted | live-v28-09-ask-player-play | J14 | — | authored | — | M18 re-score, M19 at 60/36, Sol default live check owed |
| Briefing drafting (10) | yes | — | v28-10-briefing-draft, scripted | — | — | — | authored | — | Real-model draft and CL floors owed |
| Curator create, A15 near-dup, A16 stamp/reaper, A17 census (11) | yes, mutations 15/15 | — | **v28-35-curator-create PASS ×2** | live-v28-11-create | — | — | authored | — | B6 covers review, boundary write, stamp, duplicate advice/decline and delete-chat Keep/Delete. A15 vectors quality owed; advisory by design (resolved below) |
| Local judge (14) | one file | yes | — | — | — | — | authored | judge use fixtures | Routes refused until calibrated; play-load owed |
| Game layer: quests, life, meanwhile (18 / v2.7 36–37) | yes | — | nine scenarios in original audit | live-v28-meanwhile | — | group-relationships, group-away-notice, F29 capture owed | authored | quests, life, chance | Live quest scenario and M8 re-measure owed |
| Presence panels rest (04) | yes | — | v28-04-presence-panels, scripted | — | — | — | authored | — | C5 CL owed |
| Widgets and A4 follow-ups (23) | yes | — | v28-23-widgets, followups | live-v28-23-widgets | — | — | authored | — | Widgets glance F25 re-run owed |
| GPU broker (28) | two files | broker node:test | — | — | — | — | authored | — | Mocked only; LI/LT owed |
| Story image workflows (29) | yes | — | — | — | — | — | authored | — | LI owed; story-workflow-missing has no firing scenario |
| Model downloads (30) | one file | fake providers | — | — | — | — | authored | — | Original audit: no download evidence |
| X1 context refusal, context-over-server | yes | yes | — | live-f20-long-chat ×2 on 3090 | — | — | — | — | Pod-lane finding potentially false positive, unconfirmed |
| X2 token-count bypass | — | gateway.test | — | — | — | — | — | — | Measured ×2 by private scratch scripts only |
| F27 read budget | yes, S17 replay | — | — | — | — | — | — | life lab rows | PASS ×2 live after fix; earlier failures retained in backlog |
| R7 late lore placement | lorePlacement | — | **v28-35-lore-placement PASS ×2** | model A/B not committed | — | group-lore-placement | — | — | B6 checks off/on scans, depths 5/4, constant/disabled exclusions, repeat equality and disk unchanged. R7 INCOMPLETE; SWA/P5 and F29 owed |
| Guide restructure X8 | yes | release node:test | — | — | — | — | authored | — | Original audit lacked gate record; no new gate claimed here |
| Pose library, character layers B1–B3 (33) | poses, bodyRenderer, importHost, stageBodies, stage choice, VnStage | media preflight, release pose library | — | — | — | — | **plan 33: 120 suites / 760 stories PASS** | — | Deterministic build recorded; 40 labelled replies are not a real-chain CL score. S0, DWPose download, CL ≥80%, GPU Acceptance ×2 owed (handoff A3/A4) |
| Live close-shot head (36) | liveHead, mount, VnStage | rig tooling node:test | **A1 LI3/LI4/LI6 PASS ×2** | — | — | — | **plan 36 master gate: 122 suites / 762 stories PASS** | — | A1 desktop LI1 FAIL/PASS, maxima 51.8/29.3 ms; laptop LI1, LI2 network/chunk and LI5 vision/real rigs owed. Not accepted |

## Highest-risk scenario gaps

Original top three now have committed no-model cases:

1. `test/scenarios/v28-35-living-rollback.json`: scripted proposal through `LivingPort`, author acceptance,
   rendered `/sendas` boundary application, same-chat reopen, real ST swipe/delete, graph equality on replay.
   Reads internal graph/history only to assert the applied artifact; does not inject operations into the store.
   Divergence/prefetch and a committed L1/L5 real-model fixture remain owed.
2. `test/scenarios/v28-35-curator-create.json`: two facts from a scripted extraction make a real host-backed
   lore pass eligible; proposal and acceptance do not write before the boundary; disk stamp and one created-ledger
   row checked. Duplicate advice is shown in Scheduler and declined. The owned chat is actually deleted;
   Keep them preserves the disk entry, then replaying its deleted-chat event offers the orphan again and
   Delete entries removes it. The second answer is an event retry, not a second physical chat deletion.
3. `test/scenarios/v28-35-lore-placement.json`: real `getSortedEntries()` host scan, setting-off control vs
   late placement, unchanged persisted entries, repeat scan equality. No cache-reuse or model-accuracy claim.
   Existing group-relationships/away-notice payload captures belong to B5; not counted as B6 passes.

Next gaps, original risk order retained:

4. Story image workflows: story-workflow-missing fires, checkpoint override, on-disk selection untouched.
5. Briefing drafting: real authoring model and spoiler check.
6. Quest discovery/completion with a real reader.
7. Deterministic context-over-server player copy; resolve the pod-lane finding.
8. Local judge route refused until calibrated, visible in Setup.
9. GPU broker/downloads clean-host fail-open without plugins.
10. Storybook execution: original global absence claim is obsolete; plans 33/36 now cite full suites.
    Coordinator's final combined build still needs its full Storybook-inclusive gate. Superseded 2026-10-14:
    full `npm run gates` with Storybook green (130 suites / 790 tests).

## Finding: A15 is advisory, not a refusal (resolved 2026-10-11)

- The draft and architecture invariant say a near-duplicate create is refused with “patch X instead”.
- Initial B6 runs ×2 found a duplicate-band card could become `accepted` through `setCuratorOpDecision`.
  `CreateCard.tsx` also leaves Create it enabled; its `nearDupAdvice` text is guidance, not a guard.
- Final scenario asserts the shipped advice and the author's decline, not the unbuilt refusal. Acceptance
  enforcement is still owed to the curator owner. No product code or floor changed in B6.
- The lane's vector endpoint returned duplicate-band metadata; this is not proof of semantic accuracy or
  of a wording-only fallback. Those classifier/vector quality gates remain open.

## Gate record

- 2026-10-11 · `C:\dev\so-pod2` · `v2.8-pod2`. Initial `git status --short` empty;
  `git merge master` succeeded without conflicts. Plan 39 lists preserved. B6 changes only docs/scenarios.
- Lane setup: `df -h /c`: 82 GB available. With
  `ST_ROOT=C:/dev/SillyTavern-MainBranch SO_LANES_ROOT=C:/dev/so-lanes SO_LANE_OFFLINE=1`,
  `node scripts/debug/st-lanes.mts seed 35 --slim`: offline rewrite verified; images/sprites/judge off,
  model routes closed, server plugins disabled. Then, without `SO_LANE_OFFLINE`, same root prefixes and
  `node scripts/debug/st-lanes.mts start 35`: port 8135, CDP 9335. Live settings reads before/after:
  `image.enabled=false`, `sprites.enabled=false`. Scenario settings use `ext_setting`, restored by runner.
- Setup deviation retained: `.st-root` pointed at the old isolated pod2 host, deriving a nested lanes root.
  First `SO_LANE_OFFLINE=1 node scripts/debug/st-lanes.mts seed 35 --slim` created only an offline copy at
  `C:\dev\so-lanes\so-lanes\35`; the subsequent `no-model 35` refused its existing offline backup.
  It was never started. Explicit roots above selected the intended lane 35 thereafter.
- All batch commands below had the exact prefix
  `ST_ROOT=C:/dev/SillyTavern-MainBranch SO_LANES_ROOT=C:/dev/so-lanes`.
- Initial command: `node scripts/debug/st-lanes.mts batch --lanes 35 --repeat 2 --strict test/scenarios/v28-35-living-rollback.json test/scenarios/v28-35-curator-create.json test/scenarios/v28-35-lore-placement.json`:
  **2/6 GREEN, none incomplete**. Batch `2026-10-11T11-53-18-410Z`.
  Living failed twice: missing authored chapter in synthetic fixture; corrected.
  Curator failed twice: expected acceptance refusal is not implemented; finding above retained.
  **Placement PASS ×2**, 22.292/22.929 s.
- Corrected command: `node scripts/debug/st-lanes.mts batch --lanes 35 --repeat 2 --strict test/scenarios/v28-35-living-rollback.json test/scenarios/v28-35-curator-create.json`:
  **4/4 GREEN, none incomplete**, batch `2026-10-11T11-58-41-553Z`.
  **Living PASS ×2**, 46.642/41.514 s; curator passed before adding reaper legs.
- Final curator command: `node scripts/debug/st-lanes.mts batch --lanes 35 --repeat 2 --strict test/scenarios/v28-35-curator-create.json`:
  **2/2 GREEN, none incomplete**, 39.524/35.624 s, batch `2026-10-11T12-02-59-010Z`; includes Keep/Delete reaper legs.
  Every greening row has runner/record/page/page-summary/server/evidence files and runner cleanup success.
- Page attention was not hidden: offline plugin status/inventory 404s, disconnected text props 500 and
  no-model eligibility probe chat-completions 400s. These are lane-local refusals, not successful model
  calls. No backend/GPU/ComfyUI was enabled. They are recorded in each row's page evidence.
- `npm run gates:quick`: **green in 110.0 s**; typecheck 37.6 s, typecheck:test 56.4 s,
  defect replay 32/32 killed, baseline 559 tests; no changed source files for jest/lint.
  `npm run typecheck:test`: exit 0, no diagnostics.
- First targeted debug command incorrectly named tests under `scripts/debug/lib/`: node could not find
  them (exit 1, no tests run). Corrected command
  `node --test scripts/debug/scenarioSchema.test.mts scripts/debug/scenarioRequires.test.mts scripts/debug/so-scenario.runSteps.test.mts`:
  **36 pass, 0 fail**; includes whole-corpus vocabulary and globals validation.
  `npm run debug:typecheck`: exit 0, no diagnostics.
- Served bundle read from lane 35: **1,293,563 B**, SHA256
  `30f7f3905ca877641b27ab790e299d579c8e3befb3da96c245c278346f0fa9fa`, equal to served manifest.
  Used the existing staged bundle; B6 did not build, stage or install. Not an attestation of a new build.
- `node scripts/debug/so-evidence.mts archive --label v28-b6-coverage-20261011 --lanes 35 --pods none`
  with the explicit root prefixes: **471 files, 34,964,517 B, problems []**. Private archive
  `test/sessions/evidence/phase-c/v28-b6-coverage-20261011` in so-sessions. Greening evidence under
  `lane-35/debug/batch/<batch>/<scenario>-run1|run2/record.json`; initial failed rows retained too.
  Archive copied and hash-verified; private archive commit remains coordinator-owned.
- Full `npm run gates`/Storybook not run, per owner's concurrency restriction; coordinator owes combined
  gate. No master merge/push/deployment, owner ST, GPU, campaign changes or subagents. B6 deterministic
  scenario coverage delivered; whole-plan acceptance remains open. No batch run-header baseline/diff
  was taken; per-row cleanup and archive evidence are the narrower proof.
- `node scripts/debug/st-lanes.mts stop 35` with explicit root prefixes: `stopped: true`,
  `serverUp: false`. `git diff --check`: exit 0.

## Unresolved questions

- None open. A15 near-duplicate advice stays a warning: v2.8 11's A15 record, approved 2026-10-10, says "Still a warning, never a refusal".
  The architecture invariant said "refused" and was corrected to match on 2026-10-11; no product code changed.

## Gate record: combined build (2026-10-12)

- Lane 35, `st-lanes.mts batch --lanes 35 --repeat 2 --strict` on the three B6 scenarios: living-rollback, curator-create and lore-placement all GREEN on both runs (6 of 6). Lane 33, `so-open-stretch-check.mts`: the open-stretch curve scenario `ok` on both runs, 39 of 39 steps each.
- Payload goldens, all six cases captured twice on one served build: `payload invariance: identical`. A comparison against an older master was not made: the capture tool records the staged build, and staging an older build means overwriting the owner's install. Owed with a baseline taken before the owner's next restage. Resolved 2026-10-13: plan 40 integration record, payload identical to predecessor.
- Not run: B4 judge consumer scenarios (none written), B2 provisioning roundtrips and real wizard run, B1 chain voice (all need a model route).

## Gate record: plan 40 §3 no-model scenarios (2026-10-14)

- Seven new deterministic browser rows, each PASS ×2 on lane 44 (isolated ST copy, offline), bundle `9f637c0be010`; full record in plan 40 §Gate record: §3 deterministic browser scenarios.
- Gaps closed from the list above: 4 (story-workflow-missing fires, checkpoint override, selection untouched: `v28-40-workflow-findings`), 7 (context-over-server player copy: `v28-40-context-over-server`), 8 (local judge refused until calibrated: `v28-40-local-judge-uncalibrated`, visible in Connections > Judge, not in Setup), 9 (plugin-less fail-open: broker null, media absence reported, no download probe exists). Also plan 34 provisioning/NOT_ANY dry run (`v28-40-provisioning-roundtrip`), living divergence/prefetch plumbing (`v28-40-living-divergence-prefetch`), B4 judge consumers scripted (`v28-40-judge-consumers`; pictureCue not runnable no-model) and the mobile long-press (`v28-40-mobile-touch-longpress`).
- Two product fixes with jest (lore-select cache key, long-press release tap). Real-model and TypeSafe legs remain owed; scripted rows are plumbing only.
