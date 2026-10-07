# Plan 35 — World pressure and open stretches

**Status: SEEDED 2026-10-07; merges v2.8 17 (SP6 measurement), v2.8 18 Q6 (production complication component),
v2.8 19 (open stretches), v2.8 13 N3/N5 (adversity and nothing-happens signals) and names v2.8 22's pressure input as a
later consumer; needs user approval; not built, M1/M2 not run.** On approval the merged sections of v2.8 17, 18 Q6, 19
and 13 N3/N5 point here; v2.8 22 (living story director) stays v2.8. Gate tiers: v2.8 `00-overview.md` §Gate taxonomy
(D deterministic, CL cloud reads/judge, RP replies on the pod). Every acceptance re-runs from zero in v2.7 39.

## Sources

- v2.8 `17-sp6-complication-pool.md` (all; K1–K5, §Floor, decisions 1–4).
- v2.8 `18-quests-and-game-layer.md` §Q6 (`:158-167`); the rest of 18 is v2.7 36.
- v2.8 `19-open-stretches.md` (all; decisions 1–5; the unplaced hand-off at `:205`).
- v2.8 `13-j7-judge-ideas.md` N3 (`:342-353`), N5 (`:362-369`), P2 (`:419-433`), decisions (`:440-452`).
- v2.8 `22-living-story-director.md` `:33-36`, `:236-237` (complications are not inputs until shipped).
- v2.8 `00-overview.md` §Dependencies (`:87-89`, 17 → 18 → 19).
- Code (master as of v2.8 17's re-verify, `c7967323`): `src/runtime/spikes/sp6Complications.ts`,
  `src/runtime/spikes/install.ts`, `src/runtime/settingsModel.ts:87-90` (`SPIKE_FLAGS`), `:180` (`wardenAcceptMode:
  "review"`), `src/generation/planner.ts:9-16,59`, `src/engine/engine.ts:453`, `src/generation/types.ts:82`.

## Player outcome

The world pushes back and the player is never on rails. A beat that sits still gets an authored event (the bridge is
out, a rival arrives first) that the narration lets the world do, never the player. Between fixed points the player can
play freely: no objective line, no counter ending the scene; the world pulls gently toward the next place and, if the
stretch goes quiet, something happens. The player leaves by their own move. Player-visible copy for a released
complication: none (v2.8 17 decision 4).

## Why one plan

Five plans describe one chain: a pool of authored pressure (17 measures, 18 Q6 builds), released by a trigger
(escalate in 17, `quiet` in 19), into a stretch that has no objective (19), with two judge signals (N3 adversity, N5
nothing-happens) that overlap 17's trigger and 19's `quiet` (reviewer finding). Merged: one pool, one spent-ness, one
trigger seam, one owner.

## Phases (in order)

### Phase 1 — SP6 measurement (was v2.8 17)

- Touches model input: **yes** (the spike block, dev flag `spikes.sp6Complications`, lane only).
- Gate tier: RP (replies on the pod) + CL (reads on the DeepSeek orchestrator route; TypeSafe `agencyCheck`).
- Gate: lane + run header `capture`/`diff` + `--strict`, `--media off`, group chats only (v2.7 03); lab check
  `python scripts/check_lab.py` at the campaign pin first; records to `so-sessions` (`npm run sessions:archive`).
- Floor (verbatim v2.5, v2.8 17 §Floor; commit the final restated table before any run, v2.5 plan 09 rule 1):

| # | Measured on | Pass (verbatim v2.5) | Arms |
|---|---|---|---|
| K2 | `test/scenarios/live-v25-09-sp6-k2.json`, ×2 consecutive, in a group chat | the block rides exactly the next loud request, never quiet/impersonate | flag on |
| K3 | `lab/complications/sp6-adolion.journey.json` (98 turns) | ≥ 20 releases per run; `agencyCheck` flags ≤ control + 1; judge-off column recorded | release/control × judge on/off, ×2 each |
| K4 | the same replies, the 44 lines of `sp6-k4-lines.json` | 0 verbatim restatements | release arms |
| K5 | `lab/complications/sp6-k5-stalled.json` | ≥ 60 % of releases reach the band within 6 boundaries vs ≤ 30 % control (route recorded) | release vs control |

- K1 already PASS in jest (0 of 400 mismatches, `v2.5/09-sp6-spike-report.md:12`); re-run in jest, not live.
- A run under 20 releases is INCOMPLETE, never PASS. K5 yields 13 measured releases per run: the pooling rule (per run
  or ×2 pooled) is decision 3 below and is written into the table before the run, never after.
- **On FAIL or INCOMPLETE ×2 (v2.8 17 decision 3, verbatim intent): drop.** Refused from then on: Phase 3 is not
  built; the complication half of `install.ts`, `sp6Complications.ts`, the flag and the `generation` spike seam are
  removed (`DROPPED_SPIKES` in `devOnly.guard.test.ts` gains it, planted-import control, `install.ts` keeps the SP7 draw
  ring); the campaign's pools stay as inert data the guide marks unsupported; the validator refuses `stretch.pressure`
  and any `trigger`; Phase 4 is not built; Phase 5 consumers may only feed the steering hint and the author panel.
  Open stretches (Phase 2) still ship, with pull and no pressure. The encounter pool also needs M2 to pass. **Dependents
  (finding 1):** v2.7 36's `clock` widget is not shipped (removed from the authored kinds, refused by the validator with
  a consequence line); quest deadlines read no release model; v2.7 37 agendas get no pressure link. Full table: v2.7 39
  §Stage B branches.

### Phase 2 — Open stretches, engine half (was v2.8 19, buildable before Phase 1's verdict)

- Touches model input: **yes** (the objective line is skipped in an `open` stretch; the "pull" steering register;
  encounter offers). The counter and validator alone: no.
- Design as decided in v2.8 19 §Design (carried, not restated): `stretch {mode: "open", pace, pull_after, max_turns?,
  pressure?, offer?, arrive_when}` on intermediates; objective injection skips `open` stretches (story-level
  `objective_block` unchanged); `pace` → `pull_after` in **player turns**; exit is `arrive_when` only (`progress` exits
  refused); `stallCheck` and the refusal recovery are skipped in an open stretch.
- `player_turns_in_checkpoint`: runtime-derived through `EngineHost.derive` (engine purity), definition and tests as
  v2.8 19 §Engine needs (group round of 3 replies counts 1; swipe keeps; delete lowers and rolls back; reopen ≡
  continuous; property test rollback ≡ replay).
- Encounter pool (v2.8 19 decision 3, behind M2): 3–5 optional situations, no gated outcome, no progress;
  `EXPANSION_CONTRACT` 2 → 3, contract-2 entries dropped; `runCodeChecks` gains pool checks; `paths.ts` skips pools.
- Gate tier: D for the engine (`npm run typecheck && npm run lint && npm test`, `npm run typecheck:test`); generation
  golden + contract-drop test; a no-LLM group scenario for the curve (multi-speaker rounds, swipe, delete); then the M2
  A/B (RP). Spoiler rows (no objective line at L1/L2; encounter titles player-safe); v2.7 01 feature registry + Help
  (registry test); `npm run gates`.
- Floors: **M1** (no new runs, v2.6 session evidence): stub stretch lengths, refusal/agency-recovery rate in generated
  stub beats, flags in stubs vs anchors; a baseline, not a gate. **M2** (verbatim v2.8 19): "0 narrated player
  decisions in open stretches; the player reaches the destination by their own move in at least 90% of runs; every run
  past `pull_after` player turns shows at least one hook within the pull window." **Window and denominator (review
  2026-10-07 finding 18, fixed before any run):** the pull window is the 6 player turns after `pull_after`
  (`pull_after + 1` … `pull_after + 6`). A run ends when `arrive_when` holds, or at a hard cap of `pull_after + 12`
  player turns (or `max_turns` when it is lower). A run that hits the cap without arriving counts as "not by own move".
  A hook is an in-fiction event or prompt that points toward the destination, labelled by a second model. Denominators:
  the 90 % floor is over every run of the arm (3 stubs × 2 runs = 6, so 6 of 6); the hook floor is over the runs that
  reached `pull_after + 1`; the narrated-decision count is over every reply in every run. Blind "felt free" vs "felt steered"
  on paired excerpts, rated by a second model, never the user (v2.8 rule 11). Engine: proposed — rollback ≡ replay 0
  mismatches over 4 seeds × 100 cuts (K1's shape).

### Phase 3 — Production complication component (was v2.8 18 Q6; only on Phase 1 PASS)

- Touches model input: **yes** (a registered injection on the next loud request).
- Design as v2.8 17 §Plan Step 2 (carried): typed `checkpoints[].complications: Array<string | {id, text}>` and
  `complication_after` (default 3) in `schema.ts` + validator with consequence lines; pure release logic in
  `src/pacing/complications.ts`; written by `pacingCoordinator` (coordinator budget **560**, the ratchet in
  `test/findings/codeHealth.json`; manager untouched at 700) following the
  outermost loud generation (`runtime/generationLifecycle.ts`); registered in `INJECTION_REGISTRY` at a justified depth
  (5 is the ledger's; collision check `injectionRegistry.ts:55-70`); spent-ness derived from the log plus a per-chat
  field rolled back by boundary (replaces the in-memory map); author surfaces (inline chip, inspector, journal, driver
  panel count, v2.7 06 C9 (b) Activity row); Studio pool editor + Storybook; guide moves the fields out of
  "Experimental effects". One trigger seam: `trigger: "escalate"` (default). R13 (judge adversity as trigger) stays out.
- Gate tier: D + `npm run build` + `npm run test:release` (bundle budget from a named build,
  `scripts/release/buildChecks.mjs`) + live group check (RP) + `so-ui assert-player-clean`; registry row; `npm run gates`.
- Floor: proposed — K2 (verbatim) re-run ×2 on the production path; K1's rollback ≡ replay over 4 seeds on the new
  spent-ness field, plus a reopen-with-truncated-log case (open in v2.8 17: "not determined") that must not re-release.

### Phase 4 — Pressure in open stretches (was v2.8 19 pressure half; after Phase 3)

- Touches model input: **yes**.
- `trigger: "quiet"` (v2.8 19 §Engine needs, carried): holds when `player_turns_in_checkpoint ≥ pull_after` and no
  quality named by the stretch's outgoing gates (incl. `arrive_when`) changed over the last `complication_after` player
  turns; pure, log + snapshots; same pool and spent-ness as Phase 3. `max_turns` only raises pressure; never teleports,
  never narrates the move. Validator refuses `pressure` unless Phase 3 shipped.
- Gate tier: D (trigger under rollback ≡ replay) + RP (pressure arm of the M2 A/B, group, pod).
- Floor: proposed — M2's three floors hold with pressure on; K3 (agency flags ≤ no-pressure control + 1) and K4
  (0 verbatim restatements) over the pressure releases; 0 releases before `pull_after` (deterministic).

### Phase 5 — Stall and adversity signals (was v2.8 13 N3, N5)

- Touches model input: **yes** (steering hint); the judge questions ride the warden's call (judge input, no new call;
  v2.8 13 decision 2 yes, P2 routing/failure carried).
- Overlap resolved: N5 (nothing-happens) is scored **against `trigger: "quiet"`/`stallCheck` as its judge-off column**;
  N3 (adversity) against the escalate trigger. Their consumers here: the steering hint ("world pressure", agency policy)
  and the author driver panel. They may only ever lead to an **authored** complication, and only after K1–K5 pass and a
  separate user decision (R13); never "the player loses X" (no judge probability writes story state).
- Output is a steering hint, not a warden note. Any note-shaped output (e.g. "the scene has idled") depends on
  **v2.7 33 W2** (warden agency family → `auto`): with `wardenAcceptMode` default `review` (`settingsModel.ts:180`) a
  note never reaches a player.
- Gate tier: CL (fixtures, TypeSafe calibration ×2, `calibrate-node.mts --replay` over `so-sessions`); consumer: dev
  `spikes.judgeN3`/`judgeN5` until floor ×2, then a `judge.uses.*` key in `JUDGE_USES_OFF_BY_DEFAULT`; combined-arm
  re-measure of the warden's continuity/agency/house-rules rates and p95; `npm run gates`.
- Floors (verbatim v2.8 13): N3 "level within ±1 on ≥ 0.9; levels 0–1 vs 3–4 never confused." N5 "change within ±1 on
  ≥ 0.9; tension within ±1 on ≥ 0.9 and no worse than the extractor." Plus (proposed): a shipped N5 hint must beat the
  deterministic `quiet` column on the same rows, or it is not built.

## Interaction with v2.7 36 quests and v2.7 37 character life

One complication component (`src/pacing/complications.ts`), one pool per checkpoint, one spent-ness, one `trigger` enum
owned by this plan. Not three.

- **v2.7 36 quests:** a quest's deadline or "Doom counter" reads the release read model (released ids, remaining
  count); a quest may name a pool line it reacts to. It does not add a pool, a trigger or a second spent-ness. Side
  quests can start from an encounter the player engages with in an open stretch (v2.8 19 §Design 4).
- **v2.7 37 character life:** agendas tick off-screen on their own schedule; an agenda event is not a complication. If
  37 wants an agenda to surface as pressure, it authors a pool line and uses an existing trigger; a new trigger is an
  edit of this plan's enum, reviewed here.
- **v2.8 22 living director (stays v2.8):** reads releases, never writes them; complications are not its input until
  Phase 3 ships (v2.8 22 `:33-36`); its M1 keeps them off.

## Dependencies

- Phase 1 → Phase 3 → Phase 4 (v2.8 00-overview 17 → 18 → 19). Phase 2 is independent of Phase 1's verdict.
- **Before the v2.7 freeze** (review 2026-10-07 finding 1): Phase 1 and the M2 A/B run in v2.7 39 stage B1 on the
  pre-freeze build. The verdicts are recorded in B2. Phases 3–4 and the encounter pool (or the drop path) are built in
  B3. 39 §Stage B branches lists what each verdict means for this plan, for v2.7 36's `clock` and for v2.7 37. C5
  re-runs the measurements on the frozen candidate.
- **Phase 5 deferred to v2.8 13** (finding 14): the N3/N5 consumers and the `--replay` tooling (P5) have no v2.7 owner.
  The fixtures built here stay as v2.8 13's inputs. `00-overview.md` §Deferred to v2.8.
- **OOC turns** (finding 19). A whole-message OOC user line does not count toward `player_turns_in_checkpoint`.
  Marked means wrapped in `((…))`, or starting `OOC:` / `(OOC`. The rule sits in the derive seam
  (`runtime/stretchTurns.ts`); the same predicate is shared with v2.7 33's extraction rule and v2.7 37's agendas.
  Tests: an OOC line inside a group round leaves the count unchanged, and deleting it changes nothing; property
  rollback ≡ replay with OOC lines in the generator. Row v2.7 39 S-19.
- Bundle (finding 21): Phase 3's validator, release logic and guidance strings record their main-entry cost in B3.
  Main entry measured 1,217,068 B of 1,250,000 B at `1910441b`. Anything outside parse and the reply path goes to a
  lazy chunk.
- Phase 5 after Phase 2 (needs `quiet`/stall columns) and after v2.8 13's spike programme tooling (`--replay`, P5).
- **v2.7 33 W2** before any Phase 5 output reaches a player as a note.
- v2.7 03 group chats only; v2.7 01 feature registry + Help; v2.7 06 C9 (b) Activity panel (Phase 3 row).
- **v2.7 38 Adolion** owns the lab data: the K3/K5 lab journeys (`lab/complications/`), M1 stretch-length data, and the
  **stub lab copy (2–3 downtime/road stubs converted to `open`) for M2**. This resolves v2.8 19 `:205` (v2.8 02 A4 named
  only stretch-length data; v2.8 02's pilot table `:38` named the conversion). Flag for 38's owner: add the row.
- v2.7 39 re-runs Phases 1–5's acceptance from zero; records here are evidence, not the final word.

## RunPod cost estimate

RTX PRO 4500, USD 0.72/h (`test/sessions/BUDGET.md`); at most two model lanes per pod (`SO_MAX_LLM_LANES` 2), so one
pod-hour ≈ two lane-hours. Add ~0.3 pod-hour per pod start (model load, idle stop).

| Phase | Runs | Lane-hours | Pod-hours | USD |
|---|---|---|---|---|
| 1 SP6 | K2 ×2; K3 8 runs × 98 turns; K5 ×2 (v2.6 03 estimate "about 3 lane-hours", taken as 3–5) | 3–5 | 2–3 | 1.5–2.2 |
| 2 M2 A/B | 3 stubs × 2 arms × 2 runs, ~20 min each | ~4 | ~2.3 | ~1.7 |
| 3 production K2 | ×2 live | ~0.5 | ~0.5 | ~0.4 |
| 4 pressure arm | 3 stubs × 1 arm × 2 runs + control reuse | ~2 | ~1.3 | ~0.9 |
| 5 N3/N5 | TypeSafe + replay, no pod; warden combined-arm ×2 live | ~1 | ~0.8 | ~0.6 |
| **Total** | | **~11–13** | **~7–8** | **~5–6** |

Judge (TypeSafe) and DeepSeek read costs are metered separately, not in the table. v2.7 39's re-run repeats roughly
the same pod time.

## Decisions for the user

1. Approve the merge (v2.8 17, 18 Q6, 19, 13 N3/N5 move here; v2.8 22 stays v2.8 as a consumer)? **Recommended: yes.**
2. Approve ~USD 6 (~8 pod-hours) of RunPod for Phases 1–5, plus about the same in v2.7 39? **Recommended: yes.**
3. K5 count rule, fixed before the run: pool the ×2 runs (≈ 26 releases) or 20 per run (unreachable at 13)?
   **Recommended: pool ×2, report per run too.**
4. If SP6 fails: ship open stretches with pull only, `pressure` refused? **Recommended: yes.**
5. N3/N5 consumers: steering hint + author panel only in v2.7, no judge-triggered release (R13)? **Recommended: yes.**
6. Notes from N5 ("the scene idled") at all, given they need v2.7 33 W2? **Recommended: no notes; hint only.**
7. Stub lab copy owned by v2.7 38? **Recommended: yes.**

Carried verbatim, already answered: v2.8 17 decisions 1–3 yes, 4 none; v2.8 19 decisions 1–3 yes, 4 "As you
recommend" (in-fiction only), 5 "Recommended" (measure stubs first; anchors' open opening and epilogue play later);
v2.8 13 decision 1 "All", 2 "yes", 6 "yes".

## Links

- v2.8 17, v2.8 18 §Q6, v2.8 19, v2.8 13 N3/N5/P2: merged sources (pointer lines on approval).
- v2.7 36 quests; v2.7 37 character life; v2.7 38 Adolion (lab data, stub lab copy); v2.7 39 re-run from zero.
- v2.7 33 W2 (warden agency → auto); v2.7 03 group only; v2.7 01 registry; v2.7 06 C9 (b) Activity panel.
- v2.8 22 living story director (reads releases); v2.6 plan 07 seals (epilogue play, later); v2.9 03 new game plus.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer. RunPod for SP6 **approved** (within the v2.7 39 budget).

## Adopted from the gamification harvest (user, 2026-10-07)

Source: `v2.8/27-gamification-report.md` §Candidate rows and the TunnelVision report.

- Phase 3 adds a meter that fires then resets, weighted pool lines, and a focus pick from open arcs or present members.
- Odds- or chaos-scaled triggers only after K1–K5 pass.
- Pressure clocks are author-only; pressure never fills from the player refusing a route.

## Gate record (2026-10-07)

Tier D only, branch `v2.7-35-world-pressure` (from `v2.7-image-track-wip` @ `bd54786d`). **No live or model run**
(no lane, no pod, no judge in this worktree); every RP/CL row below is owed to v2.7 39 Phase C and is NOT green.
Recommended answers taken for every decision (user, 2026-10-07).

### What was built

**Phase 1 (SP6), preparation only.** No run. K1 re-run in jest: `spikes/sp6Complications.test.ts` green (rollback +
replay 4 seeds × 100 cuts, the 200-boundary window cases, K2 machinery). The K3/K4/K5 lab data exists in the campaign
(`lab/complications/`: `sp6-adolion.journey.json`, `sp6-k4-lines.json`, `sp6-k5-stalled.json`) and the K2 scenario in
`test/scenarios/live-v25-09-sp6-k2.json`. Decision 3 is written into the scorer before any run:
`scripts/debug/lib/sp6Score.mts` K5 now **pools the ×2 runs of each arm** (`k5MinPooled: 20` measured releases per arm,
pooled rates against 0.6 / 0.3) and reports the per-run rows without gating on them; tests in `sp6Score.test.mts`
(pooled fail, pooled pass over a run under 60 %, 2 × 9 measured = INCOMPLETE, 2 × 13 = 26 measured pools to a verdict).
Final floor table (restated, committed before any run):

| # | Measured on | Pass | Arms |
|---|---|---|---|
| K2 | `test/scenarios/live-v25-09-sp6-k2.json`, ×2 consecutive, group chat | the block rides exactly the next loud request, never quiet/impersonate | flag on |
| K3 | `lab/complications/sp6-adolion.journey.json` (98 turns) | ≥ 20 releases per run; `agencyCheck` flags ≤ control mean + 1; judge-off column recorded | release/control × judge on/off, ×2 each |
| K4 | the same replies, the 44 lines of `sp6-k4-lines.json` | 0 verbatim restatements | release arms |
| K5 | `lab/complications/sp6-k5-stalled.json` | pooled over the ×2 runs per arm, ≥ 20 measured releases pooled: release ≥ 60 % reach the band within 6 boundaries, control ≤ 30 %; per-run rates reported | release vs control |

Phase 3 and 4 are **not built** (Phase 3 only on Phase 1 PASS; Phase 4 after Phase 3). Until then the validator refuses
`stretch.pressure`, `stretch.trigger` and `stretch.offer`.

**Phase 2 (open stretches, engine half), built.**
- Format: `checkpoints[].stretch {mode: "open", pace, pull_after, max_turns?, arrive_when}` (`engine/schema.ts`
  `CheckpointStretch`). `pace` brief / unhurried / long → `pull_after` 3 / 6 / 10 player turns (default unhurried;
  explicit `pull_after` wins); placeholder values, `PACE_PULL_AFTER` in `engine/stretch.ts`.
- Validator (`engine/validate/stretch.ts`): intermediates only; `arrive_when` required and must equal the gate of one of
  the stretch's exits; progress exits (a `progress` effect or a `progress_toward_*` leaf) refused; `player_text` refused
  (the player sees the scene name, never a task); `max_turns` must exceed `pull_after`; unknown keys get a did-you-mean;
  a declared `player_turns_in_checkpoint` must be `int`/`code`.
- `player_turns_in_checkpoint`: `DerivedQualityView` gained `checkpointStartedMessageId` and `lastMessageId`; the runtime
  derive seam (`runtime/stretchTurns.ts` `deriveQualities`, composed with the chance seam in the manager) writes it when a
  story declares it, from `playerTurnIds` (`is_user && !is_system`) in `(checkpointStartedMessageId, lastMessageId]`.
  Engine stays pure. Tests (`runtime/stretchTurns.test.ts`): a 3-reply group round = 1; 2 sends × 2 replies = 2; `/sendas`
  and system rows do not count; a swipe keeps the count; deleting a player message lowers it and rolls the transition
  back (equal to replay); reopen ≡ continuous; **property rollback ≡ replay: 0 mismatches over 4 seeds × 100 cuts**
  (sends with 1–3 replies, swipes, `/sendas`, deletes; > 100 deletes exercised); control: a counter ignoring the
  checkpoint start disagrees.
- Objective line skipped in an open stretch (`objectiveLineApplies`); story-level `objective_block` unchanged elsewhere.
- Never expanded into a beat chain (`isStubCheckpoint` false), so `canGenerate` is false there; `planReconciliation`
  (the stall re-read and its `stallCheck` judge pre-check) and `agencyRecovery` return null in an open stretch.
- Steering (`pacing/steering.ts`): `OPEN_STRETCH_LINE` (no task, follow what the player starts, the player decides when
  to move on) and the pull register `pullLine(stage)`: gentle from `pull_after`, steady 3 turns later
  (`PULL_STEADY_AFTER`), strong at `max_turns`; every pull line ends "Never move the party there or narrate the decision
  to go." Carried in the checkpoint guidance block (`composeGuidanceBlock` gained a `stretch` argument; no new injection
  key, no new depth). The pacing coordinator counts the turns from the chat host.
- Payload invariance: a story without `stretch` gets a byte-identical guidance block (`openStretch.review.test.ts`, plus
  the existing `groupPayloadInvariance.recorded` and guidance suites unchanged and green).
- Manager stays at its 700-line budget: the chance context read moved to `chance.ts` `chanceContext`, so the derive
  composition costs the manager no lines.
- Registry + Help: feature `open-stretches` (authoring, author, experimental; in `features/presenceFeatures.ts`, since
  `registry.ts` sits at the 600-line file budget); author's guide topic `open-stretches`
  (`docs/authoring/story-guide.md` + compact twin in `copilot/guideTopics.ts`, Studio checkpoints tab), `npm run
  docs:guide` run.
- No-LLM group scenario prepared, **NOT RUN**: `test/scenarios/v27-35-open-stretch-curve.json` (+ story
  `v27-35-open-stretch.story.json`): multi-speaker rounds via `/sendas`, a swipe to an existing alternative, a player
  line deleted, asserting the count, no objective line, no hook before `pull_after`, gentle then strong. Validated against
  the closed vocabulary and every eval syntax-checked; owed ×2 on a no-model lane in Phase C.

**Phase 5 (N3/N5), fixtures only.** `test/fixtures/judge/spike-n3.json` (20 rows, 4 per level 0–4) and
`spike-n5.json` (20 rows, change/tension 0–4, idle and still-tense rows), synthetic, authored and labelled before any
answer, not second-model checked; shape test `judge/worldPressureSpikes.test.ts`. Questions on the warden call, the
`spikes.judgeN3`/`judgeN5` flags, the trend rules and the consumers are **not built**: v2.8 13's `--replay` tooling (P5)
does not exist, and the N5 judge-off column needs Phase 4's `quiet`.

### Deviations

- **Encounter pool not built** (`offer` refused, `EXPANSION_CONTRACT` stays 2, no generation golden or contract-drop
  test). Read as v2.8 19 decision 3's "behind the M2 floors": encounters wait until M2 shows the open mode itself works.
- `max_turns` is accepted now and only makes the pull plain (strong register); with pressure not built it cannot raise
  pressure. Never moves the party.
- `player_text` refused on an open stretch (rather than filtered at each player surface), so the spoiler row "no
  objective line at L1/L2" holds by construction.
- Open stretches are refused on anchors (decision 5: anchors' open opening waits for the stub measurement).
- Pull counts lag one turn by design: the count is read at the last committed boundary, so pull starts on the reply
  after the `pull_after`-th player turn.
- No new install-wide setting, model call site, judge use or write-after-await site (baseline settings, CALL_SITE_ROLES,
  JUDGE_USES and the ownership census unchanged).

### Gates

- `npx tsc --noEmit`, `npx tsc -p tsconfig.test.json --noEmit`, `npm run lint`, `npm run debug:typecheck`: green.
- `npm run docs:guide` (57 pages), `node --test scripts/debug/sp6Score.test.mts` (7/7),
  `scripts/debug/scenarioSchema.test.mts` + `scenarioRequires.test.mts` (29/29).
- `npm run gates -- --no-storybook`: **all green in 82.5 s** (typecheck, build, build:dev, test: 555 suites,
  6,559 passed, 1 skipped; test:debug 1,090 pass; test:replay 32 of 32 defects killed; lint; typecheck:test;
  test:plugin 109 pass; debug:typecheck; test:release 114 pass). **Storybook skipped** (it finds no stories from a
  worktree; no UI was added). An earlier run on this branch was red on the manager line budget (703 > 700), the
  `registry.ts` file budget and a dead export; all three fixed before the green run.
- Bundle: prod `dist/index.js` **1,249,280 B** against the 1,250,000 B budget (720 B headroom; the first build of this
  branch measured 1,250,244 B and failed the webpack size limit, so validator and copy strings were shortened). The
  validator and the pull lines have to be in the main entry (parse and the guidance block run there).

### Owed to v2.7 39 Phase C (NOT green)

- Phase 1: lab check `python scripts/check_lab.py` at the campaign pin; K2 ×2, K3 (8 runs), K4, K5 ×2 with run header
  capture/diff, `--strict`, `--media off`, group chats; records to `so-sessions`; verdict written back here; on FAIL or
  INCOMPLETE ×2 the drop path (`DROPPED_SPIKES`).
- Phase 2: `v27-35-open-stretch-curve.json` ×2 on a no-model lane; M1 baseline from v2.6 sessions; M2 A/B on the stub
  lab copy (v2.7 38 owns it: 2–3 downtime/road stubs converted to `open`), blind "felt free" rating by a second model;
  `so-ui assert-player-clean` in an open stretch.
- Phase 5: TypeSafe calibration ×2 of N3/N5 after the `--replay` tooling exists; the warden combined-arm re-measure.

### Placeholder values (measure, never retune silently)

`PACE_PULL_AFTER` brief 3 / unhurried 6 / long 10; `PULL_STEADY_AFTER` 3.

## Review 2026-10-07 (Sol)

Source: v2.7 39 §Review 2026-10-07 (Sol). Finding 9 (stretch exits) is a code defect handled by another session; the
Gate record is unchanged.

| Finding | Change | Where |
|---|---|---|
| 1 | Phase 1 + M2 run in 39 stage B1, before freeze; Phases 3–4/encounters (or the drop path) built in B3; the FAIL branch names what happens to 36 `clock` and 37 | §Phase 1 (FAIL paragraph), §Dependencies |
| 14 | Phase 5 (N3/N5 consumers, `--replay` tooling) deferred to v2.8 13; the fixtures stay as v2.8 13's inputs | §Dependencies |
| 18 | M2 pull window (6 player turns), run end (arrival or `pull_after + 12`), hook labelling and the denominators fixed before any run | §Phase 2 Floors |
| 19 | marked OOC lines do not count toward `player_turns_in_checkpoint`; predicate shared with 33 and 37; row 39 S-19 | §Dependencies |
| 21 | coordinator budget 620 → 560 (the actual ratchet); Phase 3 main-entry cost budgeted against the 1,217,068 B measurement | §Phase 3, §Dependencies |
