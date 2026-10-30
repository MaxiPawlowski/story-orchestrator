# v3.0 37 — Say what the story is waiting on, and what each feature costs

**Ownership 2026-10-30:** owned by plan 29 (folded in `491e6e22`: read-wait in Try again, feature rows naming model and writes). Do not build here; kept as the design record for 29.

**Status: PLANNED 2026-10-30** (harvest 2026-10-30, index `30-harvest-index.md`; revised after `30-review-sol.md`).
Nothing built. Size: S-M. Input to 29 phase 2 (HUD card status row, FeatureList); build inside those work packages.

## Problem (player, owner)

- The HUD says "Reading the last few messages…" or "Working through what just happened…" with no cause and no end. On the
  3090 a read can sit behind the inner beat, an image, or the judge; the player cannot tell waiting from stuck.
- Every feature is on by default; the owner cannot see on a feature row whether it calls a model, which route, and what it
  writes, so "is this worth the GPU" is three clicks and a scroll away.

## Evidence

- Harvest: `extension-research-2026-10-30/bb-interactive-map.md` P1 (name the blocker, bounded wait becomes "paused,
  Retry"), `scene-archivist.md` P1 (`ACTION_HELP` rows: uses AI yes/no/optional + "What changes"), `castward.md` P4 (name
  each running side pass; shared Stop rejected).
- Ours: pipeline copy has no cause (`src/runtime/pipeline.ts:141-142`); the 15 s yield gate waits for the **inner beat**
  (`src/extraction/yieldGate.ts:1`, wired in `src/runtime/wiring/scheduler.ts:51`); `runExtractionNow` → `runNow` calls
  `runSharedRead` directly and commits (`src/runtime/coordinators/extractionCoordinator.ts:326`), outside the scheduler's
  single-flight guard (`src/extraction/scheduler.ts:472`). Idle already shows no pipeline chip; a standing chip is rollback
  status (`src/components/drawer/HudStrip.tsx:39`, `pipeline.ts:74`). `Feature` has no model-use or write field
  (`src/features/registry.ts:57-71`); route labels on the snapshot (`roleRoutes`, `src/runtime/snapshotBuilder.ts:532`).

## Recommendation

- **S0 Inventory (no build).** List which waits are observable today with their source: scheduler queue/in-flight, yield
  gate (inner beat), judge `whenIdle`, GPU broker text queue (gateway status), image job. Only observable causes get copy.
- **S1 `waitingOn`.** `derivePipelineStatus` takes `waitingOn: "inner-beat" | "image" | "judge" | "gpu-queue" | null`, set by
  the component that holds the wait (never guessed from timing); copy in `pipeline.ts` only ("Waiting for the character to
  finish thinking…", "Waiting for the picture to finish…"). Author detail names the queue and age.
- **S2 Bounded Retry (scheduler-safe).** After a bound (default 120 s with no progress) the state becomes
  `stalled-rechecking`, `nextAction: "retry"`. Retry goes **through the scheduler** (a new `retry()` that joins the in-flight
  run when one is alive, else enqueues), never `runNow` directly, so one read result is accepted. The bound never cancels
  work.
- **S3 Feature cost fields.** `Feature.calls?: PassRole[] | "judge"` and `Feature.writes?: ("chat" | "lorebook" | "library" |
  "images" | "nothing")[]`. FeatureList row: player copy "uses the story model" / "no model"; Author view adds the route
  label from `snapshot.roleRoutes` (resolved state only, no second resolver, v2.9 09 rule) and "changes: …". Registry test
  fails a feature whose settings name a role but declares no `calls`.
- **S4 Rollback chip.** Reproduce the standing chip after a rollback; give the rollback notice its own end (cleared at the
  next committed boundary or on dismiss). No generic fade. **No shared Stop.**

## Invariants touched

- Player copy has one source: `narrative.ts` + `pipeline.ts`.
- One snapshot; no manager getters in the HUD.
- Side passes never block the reply and are never stopped by the player (owner wants reads on).
- Ownership: Retry joins or enqueues under the scheduler's run token; no second writer.
- No prompt change: no rating.

## Floors (predeclared, informational)

- D (causal fixtures): for each `waitingOn` value, a fixture where that component holds the wait shows that copy, and a
  fixture where it does not never shows it (0 false causes); concurrent Retry while the original read is alive: exactly
  one accepted result over 20 cuts; 0 features with a role setting and no `calls`.
- Live (no-model lane + one model lane row): a read held by the inner beat shows its copy within 1 s; a forced stall shows
  Retry after the bound and Retry completes one read.

## Tests and gates

- jest: `pipeline.ts` cases, scheduler `retry` single-flight, registry completeness, rollback chip end.
- Storybook: HUD card status row states, FeatureList row (player/author).
- `npm run gates`; `so-ui.mts assert-player-clean`; live gate per 29 work package rules.

## GPU / rating

- One model-lane row for S1 (~10 min est.). No rating.

## Unresolved questions

- 120 s bound: the owner's feel on the 3090? Default 120 s.
- Show GPU queue position to the player ("2 tasks ahead") or only in Author view? Default Author view.
