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
  Open stretches (Phase 2) still ship, with pull and no pressure.

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
  past `pull_after` player turns shows at least one hook within the pull window." Blind "felt free" vs "felt steered"
  on paired excerpts, rated by a second model, never the user (v2.8 rule 11). Engine: proposed — rollback ≡ replay 0
  mismatches over 4 seeds × 100 cuts (K1's shape).

### Phase 3 — Production complication component (was v2.8 18 Q6; only on Phase 1 PASS)

- Touches model input: **yes** (a registered injection on the next loud request).
- Design as v2.8 17 §Plan Step 2 (carried): typed `checkpoints[].complications: Array<string | {id, text}>` and
  `complication_after` (default 3) in `schema.ts` + validator with consequence lines; pure release logic in
  `src/pacing/complications.ts`; written by `pacingCoordinator` (budget 620; manager untouched at 700) following the
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
