# v3.0 52 — Pacing: engagement vs stall

Status 2026-11-08: BUILT (CPU), branch `v3.0-52-engagement`; real-model rows owed (GPU paused). 48 resolutions and 49 pressures are read
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
