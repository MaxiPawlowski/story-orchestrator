# v2.5 plan 09 — SP2 spike report: re-commit after a rewrite of the newest reply

**Verdict: pending live legs (R1, R4, R5). R2 and R3 PASS (jest, once).** Conditions and fixtures were committed before any code or run (rule 1, `06384bb5`).

## Predeclared conditions (verbatim from `09-research-spikes.md` §SP2; never retuned)

| # | Condition | Measured by | Pass |
|---|---|---|---|
| R1 | The lag is real | live: edit the newest reply so it satisfies a gate, send the next turn, capture the payload (`st-payload`) | the captured request carries the pre-edit state (confirms the problem); if it carries the edited state, FAIL (nothing to fix) |
| R2 | Re-commit equals replay | jest over the real manager: edit → re-commit vs a fresh replay of the edited chat | identical engine/memory state, 4 seeds × 200 cuts |
| R3 | No double commit | edit an older message; edit twice; recast's per-rewrite events | re-commit only for the newest committed reply; one boundary per settled text |
| R4 | Live | R1's script with the spike on, ×2; plus one recast-style `chat[i].mes =` + `MESSAGE_EDITED` fixture | next request carries the edited state; J6 (rollback journey) green ×2 |
| R5 | Cost | extra `read` calls per edit | ≤ 1 (route recorded, rule 5) |

## Procedure (declared with the conditions, before any run)

**Spike under test.** Install-wide flag `settings.spikes.recommitEdit`, default `false`, never flipped by this plan. The module
loads only through a `__SO_DEV__` dynamic import (plan 12 D3 list). On an edit or update of the newest committed reply (the
engine's last committed message, a reply, the chat's last row) it takes the place of the bridge's rollback:
1. the same rollback the bridge runs today (`rollbackFromMessage(id)`);
2. when that rollback moved the engine below `id`, it re-enqueues the writes the rolled-back boundaries at `id` had applied
   from reads that ended before `id` (they read text the edit did not change) and commits at `id`, which reproduces the
   boundary the reply originally made;
3. one read over the default shared-read window ending at `id` (`runExtractionNow`, reason `recommit:<id>`), which commits
   at `id` so the next request is built from the edited reply.
Cycles are serialized per chat; a cycle whose text is already the one the last boundary at `id` committed does nothing
(ST's editor emits `MESSAGE_EDITED` then `MESSAGE_UPDATED` for one edit, `script.js:8405`/`:8431`).

**R2 (jest, once).** Real `RuntimeManager` + real `TurnBridge`, host mocked as in the other manager review tests; the host
event source calls listeners in registration order and awaits each (`public/lib/eventemitter.js:144-146`).
- Story `test/fixtures/spike-edits.story.json` (two extractor bools, three checkpoints, a back edge).
- Reads are a deterministic stand-in for the extraction scheduler at cadence 1, stability lag 0: after a committed boundary
  that did not fire, one read over `cadenceWindowFrom(cursor, last)..last` (the scheduler's own function); after an applied
  rollback, one priority-0 read over the window the rollback names; an epoch change clears the queue and the cursor.
  Queued reads run after each step settles, priority 0 first, reading the chat as it is when they run. A read writes
  through `applyExtractionAudit`: `go`/`halt` → `go`, `key`/`drop` → `key`, in message order, and one fact per reply
  naming its index and text. The spike's step-3 read uses the same reader over its own window, then commits.
- Seeds 1–4; per seed 200 cuts. A cut is a fresh random script of 2–8 turns (a player line and a reply of 1–3 vocabulary
  words each), then the newest reply is rewritten to a different random text, set on `chat[id].mes`, and
  `MESSAGE_EDITED` then `MESSAGE_UPDATED` are emitted.
- Oracle ("fresh replay of the edited chat"): a fresh manager plays the edited chat turn by turn with the same reader,
  then runs the spike's step 3 at `id` (the step that makes the reply current; steps 1–2 exist only to undo the pre-edit
  text, which the replay never had).
- Compared after every queued read ran: engine `activeCheckpointId`, blackboard values, `visitedPath`, `lastMessageId`,
  `checkpointStartedMessageId`; memory = the set of live rows as `(tier, text, messageId)`. Not compared (they count work,
  not story state): boundary counters, blackboard versions, the boundary log, timestamps, row and audit ids, queued writes,
  the audit ring.
- Pass: 800/800 cuts equal. Negative controls: the flag off (today's rollback alone), and the spike without step 2, each
  run over the same cuts, must produce at least one unequal cut.

**R3 (jest, once).** Same harness. Counted: spike cycles that ran step 3, and boundaries committed at the edited id.
(a) an edit of an older reply: 0 cycles; (b) two edits of the newest reply with different texts: 2 cycles, one boundary
from step 3 per text; (c) ST's editor pair for one edit: 1 cycle; (d) recast-style rewrites (two texts, `MESSAGE_EDITED`
only, emitted back to back): 1 cycle, for the settled (last) text; (e) a no-op edit: 0; (f) flag off: 0.
Control: a mutant without the newest-reply check makes (a) fail.

**R1/R4/R5 (live, ×2 each, one series, one lane, dev build).** `test/scenarios/live-v25-09-sp2-r1.json` (flag off: R1, and
R5's control arm) and `live-v25-09-sp2-r4.json` (flag on: R4's editor and recast legs, R5's spike arm), story
`live-v25-09-sp2.story.json`. The request ST sends (`GENERATE_AFTER_DATA`) is read for the checkpoint marker Author's Notes
(`[SO-SP2-HALL]`, `[SO-SP2-VAULT]`, `[SO-SP2-OPEN]`). R5 = reads (audits created between the edit and the next send) with
the flag on minus the control arm's, per edit; the route is the `read` role's profile, recorded in the run header.
J6 runs ×2 with the flag on in the same series.

## Results

Jest legs ran once (rule 1) on the code commit that follows the conditions commit `06384bb5`:
`npx jest src/runtime/spikes/recommitEdit.review.test.ts`. The live legs have not run (no lanes in this build step).

| # | Measured | Result |
|---|---|---|
| R1 | **measured 2026-09-27, lane 3, dev bundle `fd8efa441c80`, flag off, ×2**: in both runs the request after the edit carried `[SO-SP2-HALL]` only (`activeAtRequest: hall`, markers `["HALL"]`), 0 audits between the edit and the next send. The lag is real. Record `test/journeys/records/v2.5-batch2/plan09/SP2/R1-R4/` | **PASS** |
| R2 | **800/800** cuts equal (seeds 1–4 × 200). 240 of them had a transition fire at the edited reply's own boundary, and all 240 took step 2 (re-enqueue + re-commit); the other 560 were no-op rollbacks, step 3 only. Not vacuous: 4065 live memory rows compared over the 800 replays, 796 of 800 with blackboard values. Controls: flag off (today's rollback alone) is unequal at seed 1 cut 0; the spike without step 2 is unequal at seed 1 cut 9 | **PASS** |
| R3 | (a) older reply: 0 cycles, 0 reads; control: a mutant without the newest-reply check runs a cycle. (b) two texts, settled between: 2 cycles, 1 read each, the last boundary at the edited id carries each text; boundaries at the edited id per edit 1 then 2 (the second edit's rollback applied, so step 2 re-made the reply's boundary). (c) editor pair: 1 cycle, 1 read (the `MESSAGE_UPDATED` cycle found the text already committed). (d) recast-style `go` then `go key`, `MESSAGE_EDITED` only, back to back: 1 cycle, 1 read, the one boundary at the edited id carries `go key`. (e) no-op edit: 0 (the bridge's fingerprint check never hands it over). (f) flag off: 0. Swipe and delete are never taken | **PASS** |
| R4 | **measured 2026-09-27, lane 3, dev bundle `fd8efa441c80`, flag on**: editor leg failed in both runs (and a third diagnostic run): the request after the edit carried `["HALL"]`, not VAULT. The cycle ran (`cycles +1, recommits 0, reads +1`) but its step-3 read threw before any model call: `SP2 re-commit read failed a shared read needs a window or a chat reader` (console capture). Cause is not the spike: `extractionCoordinator.runNow` (`src/runtime/coordinators/extractionCoordinator.ts:297`) calls `sharedReadWindow` with neither `window` nor `readWindow`, so `src/extraction/sharedRead.ts:100-104` throws for every window-less `runExtractionNow` (regression from plan 03 step 3, `342efbbe`). Recast leg not reached. J6 ×2 with the flag on: 3 pass / 8 fail both runs, the failures are the same throw in the `extract` verb. Records `.../plan09/SP2/R1-R4/`, `.../SP2/R4-diag/`, `.../SP2/R4-J6-recommit-on/` | **FAIL (blocked by a product defect outside the spike; the spike's own mechanism is not measured)** |
| R5 | pending (live: reads between edit and next send, flag on minus flag off). Jest shape, for reference only: step 3 is exactly one read per settled text; the applied-rollback path keeps today's priority-0 re-read | **measured 2026-09-27**: control arm 0 audits per edit (both runs); spike arm 0 audits per edit, 1 attempted read per cycle that threw before the model (see R4). Route: `read` role = `Story Orchestrator Memory RunPod` (run header). Not a measurement of the spike's cost while its read cannot run | **not measured (blocked, see R4)** |

**Verdict so far:** R2 and R3 PASS, so no deterministic condition fails the spike; the code stays behind its flag. The worth review
(rule 8) waits for R1, R4 and R5.

## What the spike changes (and what it leaves in prod)

- Dev-only, on plan 12 D3's list (`src/runtime/devOnly.guard.test.ts`; control: a planted static `./spikes` import from
  `runtime/index.ts` fails): `src/runtime/spikes/recommitEdit.ts` (the cycle), `src/runtime/spikes/index.ts` (install,
  `globalThis.storyOrchestratorSpikes.recommitEdit.stats()`). Loaded by `if (__SO_DEV__) import("./spikes")` in
  `runtime/index.ts`, installed only while the runtime is started.
- In the prod graph, and removed with the spike on FAIL/defer/drop: the install-wide flag (`settingsModel.ts`
  `spikes.recommitEdit`, sanitized to `true` only for a literal `true`, merged in `setGlobalSettings`), the bridge seam
  (`TurnBridge.setMutationSeam`; a seam is asked only for a swipe/edit/update whose rollback starts at the named message;
  prod never sets one), and `RuntimeManager.writes.requeue`. Prod main entry 1 174 809 B (was 1 174 410, +399 B; budget
  1 250 000). The run header records `spikes.*`.
- Ownership census: `RecommitEdit.cycle` is `checked` (run minted before the rollback, re-checked after it and after the
  re-commit). No player-facing control (rule 7); judge untouched.
- Found on the way (a fact about today's rollback, not the spike): an edit of the newest reply rolls back a transition
  that fired at that reply's own boundary, also when every write that boundary applied was read before the reply, and
  `rollbackTo` flushes those writes; the next request is then a checkpoint behind until the priority-0 re-read lands and
  another boundary commits. Step 2 is what closes it in R2 (the no-requeue control fails at seed 1 cut 9).

## Live legs (pending): exact commands

One series on one lane, dev build, real LLM, run header around the batch, `--strict`. `<n>` = the lane; the group is the
T10/T1 sandbox group (Arin + Ponticius). Records go to `test/journeys/records/v2.5-plan09/sp2/live-<bundle12>/`.

```bash
npm run build:dev && npm run serve:dev
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts capture --label v25-09-sp2-start
# R1 + R5 control arm (flag off), then R4 + R5 spike arm (flag on): each x2 back to back on the one lane
node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-09-sp2-r1.json test/scenarios/live-v25-09-sp2-r4.json
# R4's J6 x2 with the flag on
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-eval.mts "const s = ctx.extensionSettings['story-orchestrator'].settings; s.spikes = { ...(s.spikes ?? {}), recommitEdit: true }; ctx.saveSettingsDebounced(); return rt.getGlobalSettings().spikes;"
node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict J6
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-eval.mts "const s = ctx.extensionSettings['story-orchestrator'].settings; s.spikes = { ...(s.spikes ?? {}), recommitEdit: false }; ctx.saveSettingsDebounced(); return rt.getGlobalSettings().spikes;"
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts diff <debug-dir>/run-header-v25-09-sp2-start.json
```

Scoring: R1 = both R1 runs pass (the request after the edit carries `[SO-SP2-HALL]` only). R4 = both R4 runs pass (editor
leg `[SO-SP2-VAULT]` only, recast leg `[SO-SP2-OPEN]` only) and J6 green ×2. R5 = per edit, reads logged by the R4 run
minus reads logged by the R1 run (the `READS` step's `reads` array), ≤ 1, with the `read` role's profile from the run header; the recast leg's reads are recorded, not scored.

## v2.6 Adolion re-run (plan 03, 2026-10-01)

Restated conditions: `docs/plans/v2.6/03-sp2-restated.md` (committed before any run; addendum committed before the re-run;
bars unchanged). Lane 2, adolion-fresh at `adolion-campaign@e1c91fb`, dev bundle `ceb15ac19ec0` (the first night-pact pair
ran on `6f56533e8608` before the restage and is kept as a diagnostic only), main replies on `Artemis RunPod RP`, the `read`
role on `deepseek 4.1 flash`, judge off on the lane copy. Data `lab/swipes/` (4 gating moments in 3 act stories). ×1 per
plan 03. Records: `test/measurements/v2.6-03/sp2/` (`summary.json`, `series1/`, `series2/`, header start/diff).

| # | Measured | Result |
|---|---|---|
| R1 (control) | flag off, the request after the edit carried the gate scene only in 3 of 3 measured cases (night-pact, lord-spirit, wendhope-wall); 0 reads between the edit and the next send. esha-escape not measured (setup race) | lag confirmed on Adolion |
| R2, R3 | toy jest legs green (`recommitEdit.review.test.ts`) | PASS (toy, history) |
| R4 | **editor leg 3 of 3 pass** (night-pact, lord-spirit, wendhope-wall: the request carried the edited scene only; the spike's read landed ~5 s after the edit). **Recast leg 0 of 2 pass** (night-pact, lord-spirit: the request carried the pre-recast scene). A diagnostic arm that waited up to 180 s for the spike's own `recommit:<id>` audit (night-pact) saw none land: the cycle counted its read, no audit appeared, and the cue read of the settled text did not fire either. In the first night-pact run the spike's read landed 15 s **after** the next request. wendhope-wall and esha-escape recast legs not measured (fixture setup races, see summary). J6 not run (R4/R5 already fail) | **FAIL** |
| R5 | extra reads per edit (R4 minus R1): night-pact 2, lord-spirit 1, wendhope-wall 2. The second read is the scene-break read the re-committed transition triggers (it would otherwise run at the next boundary). Route `read` = DeepSeek | **FAIL** as declared (2 of 3 at 2) |

Mechanism (from the records): the re-commit is an unawaited model read. A player's own edit settles once, the read lands
in seconds, and the next request carries the edit. A recast-style burst (`MESSAGE_EDITED` twice, back to back) queues two
cycles; the first cycle's read either lands after the next request or produces no audit at all, and the second cycle is
skipped as already committed. Nothing holds the next generation until the re-commit lands.

## Worth review (v2.6)

| | |
|---|---|
| Value | Measured for the editor case only (3 of 3), on a lag R1 confirms. The recast case, the reason the spike exists for post-processors, fails. |
| Cost | ~1 read per edit on the `read` route (DeepSeek, ~5 s) plus the displaced scene read; spike 118 lines (`recommitEdit.ts`), 0 coordinator lines, a bridge seam shared with SP1, `writes.requeue` on the manager (kept: SP1 uses it); prod +399 B (flag + seam). Prompt tokens: one shared-read prompt per edit. |
| Surface | None for the player; it changes what the next request carries. |
| Risk | Touches `rollback ≡ replay` (R2 green on toy) and the bridge's mutation path; a burst of edits leaves an unowned read in flight. |
| Call | **drop.** Removed in this plan (`recommitEdit.ts`, its review test, the `recommitEdit` flag, the census row, the v2.5 live fixtures; the bridge seam and `writes.requeue` stay for SP1). D3: `DROPPED_SPIKES` + a planted-import control in `devOnly.guard.test.ts`. **v2.7 seed:** an awaited re-commit (hold the next loud generation until the edit's read lands, as the warden note waits for its lifecycle) with one cycle per settled burst; measure the recast leg first, it is the one that failed. |
