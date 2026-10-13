# Plan 40 — Build-now pass without GPU or authoring-model calls

## Authority and scope

Owner approved 2026-10-12: build every feasible piece; dependent acceptance can wait. Continued 2026-10-13.
This is the in-repo execution index for the approved external `v28-no-3090-closeout.md` plan.
Individual source plans keep their designs, floors and gate records. Latest records win over historical status prose.

- No 3090, pod, ComfyUI renders, downloads, Artemis, Sol or DeepSeek calls. No laptop check.
- TypeSafe allowed: at most 300 calls per task, counted and reported.
- Thinking, inner voice, feature defaults and predeclared floors stay as approved.
- Synthetic fixtures only in this public repo. Campaign content/evidence stays private; owner reports use counts.
- Isolated ST code copy and lanes 30+; never owner ST or lane 0. Installation waits until the owner is not playing.
- Model-consuming changes may be built deterministically; their real-model acceptance remains explicitly deferred.
- Dirty worktrees remain untouched. No new owner play flags.

## Execution order and progress

### 1. Inventory and status reconciliation

Source: [queue](32-queue.md), [handoff](37-codex-handoff.md), [coverage](35-test-coverage.md), [overview](00-overview.md).

- Completed initial branch/content inventory and status corrections with `50bcbc2b`.
- Confirmed local judge code on master despite branch-tip ancestry; SP5.b promoted without its dev flag; docs review merged.
- Preserve four dirty worktrees; counts recorded in [plan 25](25-tunnelvision-report.md) §Build-now inventory record.
- Open: remaining stale queue rows and runner inventory. Keep failed measurements recorded.

### 2. Correctness fixes

- **Lore-select eligibility**, [34](34-lorebook-features.md): drafted avatar/filename and tags, include/exclude semantics,
  changed-member cache and in-flight controls. Implementation underway on `v2.8-build-fixes`; real TypeSafe/browser check owed.
- **A21 swipe during a read**, [25](25-tunnelvision-report.md): regression through real manager, turn bridge,
  ownership and extraction coordinator. New scripted test passes 2/2; typechecks/quick/full gates and record owed.
- **A20 requirements refresh**, [25](25-tunnelvision-report.md): first reproduce through ST create/import UI;
  verified host signal or observer only if stale. Cover create/import/delete/chat switch.
- **Harness auth**, [33](33-pose-library-and-avatars.md), [36](36-live-head.md): supported OpenCode client/session
  interface, fake-server/plugin tests, useful expired-login UI. Never read credentials. Live Ask/wizard/vision deferred.
- **LI1 desktop**, [36](36-live-head.md): synthetic rigs, frame clock and CPU profile; optimize only with
  equivalence proof. Re-measure twice at unchanged floor. Laptop stays unmeasured.

### 3. Deterministic browser and runner gaps

Source: [35](35-test-coverage.md), [31](31-v27-wrap-backlog.md). Each browser row runs twice on an offline lane;
capture baseline and final run header, declare intentional differences, clean owned assets and archive evidence.

- Lorebook/card provisioning roundtrip: regex keys, secondary NOT_ANY logic, outlet, triggers; scanned-memory control.
- Workflow checkpoint override and missing workflow/GPU/media/download plugin findings; no renders/downloads.
- Uncalibrated local judge refusal before transport, visible in Setup.
- Context-over-server warning and clearing with scripted backend properties.
- Mobile touch long-press, save/apply and cleanup.
- Private predecessor/candidate payload comparison with declared diffs only.
- K3 simulation with 1.4–1.6 committed boundaries per player turn.
- Inventory uncovered deterministic rows; add in-scope runners.
- Keyword-scan recall/lore-lab replay; campaign evidence private, counts only.
- Living director divergence/prefetch scripted plumbing through LivingPort.
- Existing scripted briefing, suggestions, Ask and wizard cases; scripted judge-consumer plumbing per shipped consumer.

### 4. Approved features and deferred-proof builds

- **A18 TunnelVision check**, [25](25-tunnelvision-report.md): completed, merged/pushed `3892086f`; full gates
  with Storybook and offline browser twice. Synthetic manifest exercises our reader; upstream writer execution not tested.
- **A19 constant-entry review**, [25](25-tunnelvision-report.md): completed, merged/pushed `50bcbc2b`; full gates
  and Storybook, new browser and existing tier regression each twice. Curator model quality deferred.
- **D-P5 shallow injections**, [31](31-v27-wrap-backlog.md): player-role block and other deep owned blocks;
  prompt-offset proof and declared payload diff. R7 SWA/cache measurement deferred.
- **J6d reconstruction/replay**, [12](12-j6d-shadow-record.md): deterministic reconstruction and replay; comparison
  legs that need an extractor model deferred.
- **J7 fixtures/runners**, [13](13-j7-judge-ideas.md): independent synthetic J7.4/J7.5 rows, N7 intermediate levels,
  N5 tension comparison runner and quiet baseline. TypeSafe-only legs permitted; extractor comparison deferred.
- **lie_side geometry**, [33](33-pose-library-and-avatars.md): repair skeleton/retarget math; keep listed pending
  render/PCK evidence. De-list only if repair fails, per owner decision.
- **Q1-M1 retirement**, [36](36-live-head.md) / [31](31-v27-wrap-backlog.md): docs-only retirement into passing
  S-17/37-S17 on combined scope budget; no scorer change.
- **C13-b curator digest**, [01](01-v27-carry-over.md): approved product build overrides the old requirement to wait
  for index-arm measurements twice. Declare curator prompt diff; real curator calibration deferred.
- **Open stretches**, [19](19-open-stretches.md): encounter pool, quiet trigger and open anchors; validator,
  guide topics, Studio, stories and offline scenario. This approval does not include the separate SP6 measurement/pool.

### 5. Permitted TypeSafe validation

- Shipped J7 consumers twice plus judge-off arm.
- Independent J7.4/J7.5/N7 rows.
- Lore-select character eligibility real judge leg.
- Supported J6d replay legs; no full judge-versus-extractor claim without the extractor run.
- Current pass spend: **0 TypeSafe calls** through A19. Update per task.

## Workspace recovery — 2026-10-13

- Owner requested an audit and cleanup of 82 `C:\dev\so-*` folders and inactive agent worktrees.
- 69 top-level folders archived under `C:\dev\backups\story-orchestrator\workspace-cleanup-2026-10-13`:
  20 merged worktrees, 40 junction-only remnants, one guide snapshot and eight historical artifact folders.
  Four dirty inactive agent worktrees also moved there with Git registration and their changes preserved.
- Full audit and exact move manifests live in the backup folder. Active build worktrees, configured lane/art roots
  and private evidence repository remain at their original paths. Clean merged `so-ui-rework` remains because Windows refused its move.
- **Recovered unfinished fix:** `charming-wright-d54382` has five staged source/test/guide files narrowing living-frontier
  diagnostics to anchors. Not shipped; preserve patch and originals in `orphan-recovery/charming-wright-d54382`.
  Review against current open-anchor work, integrate source/test/guide changes, regenerate docs and run required gates.
- **Recovered evidence:** eight missing M25 blind-pack files copied to the ignored main session store with matching hashes;
  `npm run sessions:archive` exited 0. Second-model rating remains owed.
- Seven repo stashes retained. Filename inventory found no extra v2.8 remaining-items document; old guide stash covers shipped
  guide tooling, remaining stashes concern local settings or earlier versions. No stash applied or dropped.
- Plan 40 restored to main master and pushed as `aa4eb224`. Earlier external plans remain in the owner's `.opencode/plan` folder.


## Deferred acceptance protocols

### Authoring/cloud model required

- Supported-auth bridge: real Ask answer, wizard tool call, vision request.
- Ask M18 re-score; wizard M19 recipes/safety at approved 60/36 budgets; M20 refused-read journal.
- Briefing: 30 drafts, zero spoilers, preference at least 70 percent; suggestions: ten runs.
- Wizard lorebook proposal/roundtrip; pose classifier LLM leg; real curator digest calibration and carry-over CL rows.
- Campaign review by a second model; owner remains unspoiled.
- N5 extractor comparison; remaining chain voice, widget glance and empty-reply/warden real-reply cases.

### GPU or approved pod required

- Pose product Acceptance twice, repaired lie_side renders/PCK.
- Plan 28 text/image/text twice; plan 29 two-workflow story; streamed mouth on Artemis.
- Director pace/quality/blind pairs, hybrid arm, R7 SWA/cache, history/narrator/empty-reply arms,
  funded carry-over measurements, burst attribution and local-judge play load. Existing floors unchanged.

### Laptop required

- LI1 laptop: unmeasured until hardware is available.

## Close-out criteria

- `npm run gates:quick` per code change; full `npm run gates` with Storybook before merge. Record exact outputs.
- Offline scenarios twice on final affected build, clean header diff and owned-asset cleanup.
- Guide updates followed by `npm run docs:guide` and `npm run docs:settings`.
- Campaign adoption decision per feature; if needed, private campaign checks, pin bump and reinstall.
- Private lane/session evidence archive, source-plan gate record and queue update.
- Merge/push green deterministic builds; deferred acceptance remains visible. Stage/install at an appropriate owner idle point.

## Out of scope

Smart-context harvest, inner voice L5, cue/scene merge, SP5 real-reply legs, SP6 pool and local-judge calibration.
Canon prose stays enabled; M25 blind pack awaits a second-model rater.

## Gate record — 2026-10-13

- Plan index added during the continued approved pass. Documentation only; no gate claim for unfinished rows.
- Completed A18/A19 evidence and commands are in plan 25. Remaining rows above remain open until their own records land.
