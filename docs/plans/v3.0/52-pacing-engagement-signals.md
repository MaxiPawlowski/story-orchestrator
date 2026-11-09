# v3.0 52 — Pacing: engagement vs stall

Status 2026-11-09: MERGED; GPU rows run 2026-11-09 (window agreement and blind rating below their floors, turns-to-exit not measurable). 48 resolutions and 49 pressures are read
through `EngagementSignals.resolutions` / `pressures`, empty until those plans feed them.

## Why

Owner 2026-11-08 asked what else "could need improvements like these". Astra: pacing pushes toward the destination even
when the player is enjoying a scene that moves no gate key.

## What exists

- Tension steering: escalate / hold / ease toward the arc target (`pacing/steering.ts:29-61`).
- Open stretch pull: `gentle → steady → strong`, with `strong` = "a deadline or someone urging"
  (`steering.ts:63-70`). Runs only on open stretches.
- Stuck ladder: a rung every 3 quiet player turns after `stuck_after`, where quiet = no watched exit key moved
  (`pacing/stuck.ts:38-66`). Leads only, never forces (43 P1).
- Talk pacing (plan 19), deferred threads stop being pushed (plan 33), keep-last-question, quiet detection
  (`pacing/quiet.ts`). Relax window after a peak (42 F).
- Relationship beats are recorded per axis (`engine/life/beats.ts`). The inner beat and the extraction read already see
  each turn.

## Design

Classify the stall before answering it. One pure classifier `pacing/engagement.ts` reads only what boundaries already
record. It adds no model call.

- `exploring-relationship`: a relationship axis, mood or label moved, or a promise or commitment event landed, inside
  the quiet window. Answer: hold. Suppress the stuck rung and the pull for the window. "Allow depth".
- `uncertain`: the player asked a question (keep-last-question signal) or an offer or check hint was shown and not
  taken. Answer: the next lead or offer, phrased as information, not pressure.
- `repeating`: a turn-to-turn read with no new fact, memory row or ledger row for ≥ the window, and repeated scene
  fields. Answer: today's stuck rung (a relevant development).
- `pressure-advancing`: a 49 pressure crossed a threshold in the window. Answer: show its consequence (the threshold
  cue), not generic urgency.
- `aftermath`: a 48 resolution or a tension peak in the last 2 boundaries. Answer: reaction and recovery; ease.
- Classes can overlap. Precedence, first match wins: `aftermath` > `pressure-advancing` > `exploring-relationship` >
  `uncertain` > `repeating`. The fixture table includes overlap cases.
- Rule: escalation text comes only from an established pressure or an authored deadline. The pull's `strong` stage
  uses the pressure's label when one exists. Otherwise it stops at `steady`. No "someone urging" invented from nothing.

## Schema keys

None authored. `extras.pacing.engagement` keeps the last reading per boundary (ring, cap 50), derived from the boundary
log. Recomputed on replay, so no code key and no detector are needed. Listed as derived in the snapshot.

## Invariants

- Pure over the boundary log + player turn ids + memory rows by provenance boundary, so rollback ≡ replay.
- The classifier never writes the blackboard. It changes only which guidance line is injected.

## Switch and floors

- Feature row `pacing-engagement` (`pacing.engagement`), on by default. Off: today's ladder and pull.
- D floors (hard): the class table on labelled fixtures (5 classes × 4 fixtures, 100 %); no `strong` pull line
  without a pressure or deadline (0); the same reading on a replayed log.
- Offline: label 40 quiet windows from archived sessions (counts only, no campaign text in this repo). Classifier
  agreement with labels ≥ 0.75. Labels are committed before scoring.
- Live (RP, owner-gated): blind rating of relationship-scene stretches on vs off. "Pushed away from a scene I wanted"
  flags at most half of control. Median turns to exit on the stuck fixture no worse than 43 M43-P1 + 10 %.

## Tests and live gate

- Pure: `engagement.test.ts`, steering/pull goldens, stuck integration.
- `npm run gates`. Live: pacing scenario on a model lane (`send_generate`), x2.

## Adolion adoption

No authored fields. On by default; nothing to change in the campaign.

## Order, size, resources

Size M. CPU build plus offline labels (a second model labels, not the owner). GPU rating about 1 h. Can run in
parallel with 48 (different modules). Its `pressure-advancing` class lights up after 49.

## Unresolved questions

- Who labels the 40 windows from archived sessions: the Sol rater, under the no-spoiler rule?
- Should `exploring-relationship` also hold tension steering, or only the pull and the stuck ladder?

## Gate record (2026-11-08)

- Built: `pacing/engagement.ts` (classifier, ring), `runtime/engagementSignals.ts`, pacing coordinator answers (pull, stuck ladder),
  switch `pacing.engagement` (on), snapshot `tension.engagement`, guide topic `stuck-leads`, plan 24 matrix row `pacing-engagement`.
  Tests: `pacing/engagement.test.ts` 27, `coordinators/engagementPacing.review.test.ts` 12.
- All heavy runs through the machine-wide lock (`heavy.mjs plan52 -- ...`, low priority), worktree `C:/dev/so-52-engagement`.
- `npm run gates:quick` on `e067feb61`: green 142.8s (jest related 465 suites / 5292 tests).
- `npm run gates -- --jobs=2` on `e067feb61`: RED at test:release, `suiteCoverage.test.mjs` (no plan 24 matrix row for
  `pacing-engagement`). Fixed in `6a8e7fe11` (row in `docs/plans/v2.8/24-test-plan.md`).
- `npm run gates -- --jobs=2`, no `--resume`: green 456.5s on `6a8e7fe11`; master moved, merged (`04849e29d`), green 460.8s; master
  moved, merged (`f149f02ca`), green 413.2s; master moved (docs only), merged (`a6946bece`), RED at test-storybook:ci (15 s play
  timeouts in StudioGraph, DrawnLayer, SettingsPanel, Workspace under CPU load; no code change), rerun green 392.8s; master moved,
  merged (`daeb521e7`), **green 396.4s** (all 11 steps). Master unmoved at `119459798`.
- Merged `--no-ff` into local master `e5a1c61f8` (tree identical to `daeb521e7`). Not pushed.
- `npm run build && npm run stage && npm run plugins:install`: webpack compiled, 284 files staged, plugins unchanged,
  `restartNeeded: false`. ST :8000 was down and left down; no page reload, no live check.
- Deviations: no live gate (GPU paused, ST down). Live gate NOT green.
- Owed (GPU): 40 labelled quiet windows (another model labels, counts only), live pacing scenario on a model lane
  (`send_generate`) x2, blind on/off rating. Floors in this plan stay unmeasured until then.

## Gate record GPU rows (2026-11-09)

GPU resumed by the owner. Lane 41 only (adolion-fresh seed at pin `baeda388`, 0 problems, baseline accepted; images and
sprites off, no ComfyUI), local controller (Artemis), rater opencode `openai/gpt-6.1-sol`. Floors informational, none retuned.
Evidence in so-sessions `rating-pack/p52-engagement/` (`0216058b7`, `eea946f48`, `859ca6755`, `f8da13898`).

- **Offline windows (floor: agreement >= 0.75 on 40): MISS, 14/40 = 0.35.**
  - `node scripts/debug/so-engagement-p52.mts windows`: 52 archived sessions, 650 candidate quiet windows (3 player turns
    in one checkpoint), 40 picked (seed `p52`, at most 2 per session, 24 sessions); the classifier's reading per window
    was computed offline and sealed.
  - `label` (Sol, transcript only, 40/40, 0 failures), `seal`; labels committed to so-sessions (`0216058b7`) before
    `score`.
  - Labels: pressure-advancing 10, uncertain 12, none 9, aftermath 5, exploring-relationship 3, repeating 1.
    Classifier: none 19, uncertain 15, exploring-relationship 5, repeating 1.
  - Largest gaps: all 10 pressure-advancing windows (49 pressures not fed, so the class cannot fire); 5 aftermath
    windows read none or uncertain; 5 uncertain windows read exploring-relationship (a relationship axis moved in a
    window where Sol saw a question first).
- **Live scenario x2** (`test/scenarios/v30-52-engagement.json`, `send_generate`, 12 fixed lines: relationship talk
  with two questions, then repeats; gated scene, `stuck_after` 3, three leads).
  - Driver: lane page reload, arm set, model woken, then
    `node scripts/debug/st-lanes.mts run 41 -- scripts/debug/so-scenario.mts run test/scenarios/v30-52-engagement.json --sandbox --group "Group: Arin, DM Narrator"`.
  - Valid when ok with 12 rows and every turn replied. on-1 needed a third attempt: two attempts timed out waiting for
    the extraction scheduler on the shared controller. off-1, on-2 and off-2 were valid on the first attempt.
  - ON arm, per turn: relationship read live on 9 and 8 of 12 turns; the stuck rung was held through the relationship
    stretch (rung shown on 3 turns in on-1, turns 8-10; 0 turns in on-2).
  - OFF arm: no reading, rung shown on 9 of 12 turns in both runs (turns 3-11).
- **Blind rating** (`pack` with on-1/on-2 against off-1/off-2 by turn, A/B order seeded and key sealed; `rate` Sol 24/24
  pairs; `unseal`). Floor: pushed flags on <= 0.5 x off from turn 4.
  - **MISS: 14 on vs 12 off over 18 pairs** (all turns: 19 vs 18 over 24).
  - Sol flags most replies in both arms as pushing. The replies push without the rung; holding the rung did not change
    the rated push.
- **Turns to exit (floor: no worse than M43-P1 + 10 %): NOT MEASURABLE.** M43-P1 was never measured, and fixed player
  lines never act on a lead.
- **Defect found live, fixed:** the engagement ring was not cleared on a chat switch, so a new chat's snapshot reported
  the last chat's reading (`at: 32` from turn 1). The guidance decision used the fresh reading (A/B unaffected); the
  snapshot did not.
  - Fix: `PacingCoordinator.reset()` clears the ring; rollback replay keeps earlier readings.
  - Regression test in `engagementPacing.review.test.ts`; it fails on the unfixed coordinator with the stale `at 17`.
  - The valid A/B runs reloaded the lane page first, so their readings are correct on the then-installed bundle.
- **Deviation:** both A/B arms ran with `stagecraft.livingEnabled` and `branchingEnabled` off on the lane (restored
  after). With them on (exploratory run `on-living`), the living director branched off the gated scene after three
  relationship turns and the ladder never acted. An earlier on-arm attempt lost turns 7-12 to controller RAM refusals
  (host RAM short under other agents' load) and was discarded.
- **Gates** (heavy lock, `--jobs=2`, no `--resume`), branch `v3.0-52-gpu-rows`:
  - red: arrival golden (new story file; recorded).
  - red twice under load: Storybook and jest timeouts, then a SpriteBuilder story value read early.
  - **green 530.0s on `5d91d2373`** (master `0d3431aa9` merged in).
- Merged `--no-ff` into master `b8354f614` (tree identical to `5d91d2373`). `npm run build && npm run stage &&
  npm run plugins:install`: compiled, 285 files staged, plugins unchanged, `restartNeeded: false`.
