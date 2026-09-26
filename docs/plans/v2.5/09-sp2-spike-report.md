# v2.5 plan 09 — SP2 spike report: re-commit after a rewrite of the newest reply

**Verdict: pending.** Conditions and fixtures committed before any code or run (rule 1). Nothing below is a result yet.

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

| # | Measured | Result |
|---|---|---|
| R1 | pending (live) | pending |
| R2 | pending | pending |
| R3 | pending | pending |
| R4 | pending (live) | pending |
| R5 | pending (live) | pending |
