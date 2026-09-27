# v2.5 plan 09 — SP1 spike report: swipe-back cache

**Verdict: pending S3 (live) and S4 (human sessions). S1 and S2 PASS (jest, once).** Conditions and fixtures were committed before any code or run (rule 1, `98106a44`).
S4 is scored from the human sessions inside plan 10 (Q4, review #74); SP1's verdict waits for it, and SP1 is off the 2.5
pick list (review #74).

## Predeclared conditions (verbatim from `09-research-spikes.md` §SP1; never retuned)

| # | Condition | Measured by | Pass |
|---|---|---|---|
| S1 | Replay equality | property test: commit swipe A, swipe to B (commit), back to A with the cache | engine + memory + blackboard == state after A's original commit, 100 % over 4 seeds × 200 cuts |
| S2 | No stale hit | mutate each key part (text, scope, story version) | 0 hits; a mutant dropping any key part fails |
| S3 | Saves a call | live, 10 swipe-backs on a lane | 0 `read` calls on hits vs 10 today; state equality as S1 |
| S4 | Worth building | swipe-back events per 100 player turns in the human sessions (U4) | ≥ 3; below it FAIL regardless of S1–S3 |

## Procedure (declared with the conditions, before any run)

**Spike under test.** Install-wide flag `settings.spikes.swipeBackCache`, default `false`, never flipped by this plan; the
module loads only through the `__SO_DEV__` dynamic import of `runtime/spikes` (plan 12 D3 list).
- Key: `(chat id, message id, text fingerprint, scope hash, story id@playedVersion)`. Text fingerprint = the one the
  bridge uses (`fingerprints.ts` `fingerprintOf`). Scope hash = FNV of the sorted extraction scope keys (`deriveScope`) for
  the *restore point* (the engine state before the first logged boundary at or after the message), with the current story
  graph and expansion gate sources.
- Capture: on each runtime notify, when the engine's last committed message is the chat's last row, a non-empty reply
  whose text is the text the boundary at it committed. Entry = a deep copy of the chat's persisted story record plus the
  engine's queued writes. Newest capture per key wins; 32 entries.
- Hit: ST emits only `MESSAGE_SWIPED` for an existing swipe (`script.js:10315`; `Generate('swipe')` only for a new one,
  `:10319`), after it has copied the swipe into `mes` (`syncSwipeToMes`, `:10148`). On a swipe of the newest reply whose
  key hits, the bridge's rollback is replaced by: write the record back, hydrate through `loadSelectedFromChat` (a new
  epoch, so in-flight and queued reads of the other swipe are dropped), re-enqueue the queued writes, persist. A miss is
  today's path unchanged.

**S1 (jest, once).** The SP2 harness (real `RuntimeManager` + real `TurnBridge`, the deterministic cadence-1 reader,
`test/fixtures/spike-edits.story.json`). Seeds 1–4, 200 cuts each; a cut is a fresh random script of 2–8 turns whose last
reply is A. After it settles (reads drained) its projection is recorded. Swipe to B: a new empty swipe (`swipes.push("")`,
`swipe_id` 1, `mes` ""), `MESSAGE_SWIPED`, settle; then `mes` = B (a different random text), `MESSAGE_RECEIVED(id,
"swipe")`, settle. Swipe back: `swipe_id` 0, `mes` = A, `MESSAGE_SWIPED`, settle. Projection: engine `activeCheckpointId`,
`boundary`, blackboard values and versions, `visitedPath`, `lastMessageId`, `checkpointStartedMessageId`; the queued
writes (deltas and read ranges); memory = the set of live rows as `(tier, messageId, text)`. Pass: 800/800 equal to A's
recording. Also recorded: hits (expected 800) and reads started by the swipe-back (expected 0). Controls, same cuts:
flag off, and a cache that restores without the queued writes; each must be unequal on some cut.

**S2 (jest, once).** Pure: a key that differs from a stored one in exactly one part (chat, message, text, scope, story
version) misses. Integration (real manager): (text) the A swipe is rewritten after it was read, then swiped back to;
(story version) a compatible story update (v2, hot swap) lands between B and the swipe-back; (scope) the expansion gate
sources gain a source between B and the swipe-back (the restore point's scope changes, text and version do not). Each:
0 hits. Mutants: for each part, a key that omits it; the case for that part must then hit (the mutant fails S2).

**S3 (live, ×2 each, one series, one lane, dev build).** `test/scenarios/live-v25-09-sp1-s3.json` (flag on) and
`live-v25-09-sp1-s3-control.json` (flag off, the "today" column), on the T10 story: one real turn (swipe 0) and one
generated swipe (swipe 1), each recorded after its reads settle, then 10 swipe-backs alternating `/swipe direction=left`
and `right` between the two (slash-commands.js:1554). Read calls = audits created between a swipe-back and scheduler idle
(quiet 8 s). Pass (flag on): every swipe-back hits, starts 0 reads, and equals that swipe's recording (S1's projection,
engine + queued writes + live memory rows).

## Results

Jest legs ran once (rule 1) on the code commit that follows the conditions commit `98106a44`:
`npx jest src/runtime/spikes/swipeBack.review.test.ts`. S3 has not run (no lanes in this build step); S4 is plan 10's.

| # | Measured | Result |
|---|---|---|
| S1 | **800/800** cuts back at A's recorded state (seeds 1–4 × 200): 800 hits, **0** reads started by the swipe-backs. Not vacuous: B moved the state away from A's recording (boundary counter aside) in 800/800 cuts, 499 recordings held queued writes that the restore had to bring back, 3773 live memory rows compared. Controls: flag off (today's rollback) is not back at A's state at seed 1 cut 0; a restore without the queued writes fails at seed 1 cut 1 | **PASS** |
| S2 | Pure: a key differing in exactly one part (chat, message, text, scope, story version) misses, the stored key hits. Integration, real manager: (text) the A swipe rewritten after it was read, 0 hits; (story version) a compatible v2 hot swap, played version 2, 0 hits; (scope) a gate source that pulls a new quality into the restore point's scope, 0 hits; control, nothing changed, 1 hit. Mutants: a key without the part hits in the pure case for every part, and in the integration case for text, version and scope (1 hit each), so each mutant fails S2 | **PASS** |
| S3 | **measured 2026-09-27, lane 3, dev bundle `fd8efa441c80`, real LLM**. Flag on, both runs: **10/10** swipe-backs hit, **0** reads started, **10/10** equal to the swipe's recording (engine + queued writes + live memory rows). Control (flag off, "today"), both runs: 0 hits, **0** reads per swipe-back (not the 10 the bar assumed: today's rollback of a swipe-back started no read on this lane), state equal on the 5 right legs (swipe 1) and unequal on the 5 left legs (swipe 0: `pending` and `memory` differ from the recording, engine equal). Header diff: 0 blocking. Record `test/journeys/records/v2.5-batch2/plan09/SP1/S3/` | **PASS** (the "saves a call" half measured against a today-column of 0 reads, recorded for the worth review) |
| S4 | pending (human sessions, plan 10) | pending |

**Procedure changes (rule 1: the declared procedure measured nothing; the bar did not move).**
- S2 (scope): every quality of `spike-edits.story.json` is pulled into the scope from every checkpoint (all three
  checkpoints reach each other), so no gate source could change the restore point's scope keys and the case as declared
  could not vary the one part it tests. The scope case runs on that story plus one extractor quality no authored gate
  references (`lamp`, built in the test); the gate source pulls `lamp` in, and the test asserts the scope hash changed
  before it swipes back.
- S2 (story version): the declared order (update between B and the swipe-back) leaves no restore point: a story update
  hydrates without the boundary log (`RuntimeManager.swapStory` → `engine.hydrate(state)`), so no key can be formed and a
  mutant without the version could not hit either. The update lands after A is read and before B is generated, so B's
  boundary is logged and the key forms, differing from A's only in the version.

**Verdict so far:** S1 and S2 PASS, so no deterministic condition fails the spike; the code stays behind its flag. The
verdict waits for S3 (live) and S4 (plan 10, HU); the worth review (rule 8) comes after both.

## What the spike changes (and what it leaves in prod)

- Dev-only, on plan 12 D3's list (planted-import control in `devOnly.guard.test.ts` covers all four spike modules):
  `src/runtime/spikes/swipeCache.ts` (the key and a 32-entry cache), `src/runtime/spikes/swipeBack.ts` (capture,
  lookup, restore), installed with SP2 by `src/runtime/spikes/index.ts` (`storyOrchestratorSpikes.swipeBackCache.stats()`:
  captures, hits, misses). The bridge seam asks SP2 first (edit/update), then SP1 (swipe).
- In the prod graph, removed with the spike if it does not become `SP1.b`: the flag (`spikes.swipeBackCache`, literal
  `true` only) and `RuntimeManager.writes.pending` (read-only; `requeue` and the seam are SP2's). Prod main entry
  1 174 929 B (was 1 174 410 before plan 09; budget 1 250 000).
- A hit replaces the bridge's rollback; a miss, the flag off, a non-newest message and every non-swipe mutation keep
  today's path. A hit starts a new epoch (`loadSelectedFromChat`), so a read of the other swipe that is still running is
  discarded, not applied.
- Ownership census: `SwipeBack.restore` is `checked` (see its row: the epoch bump is intended, so after the load the chat
  and the engine's last message are compared with the key).
- Unmeasured here, for the worth review: a capture deep-copies the chat's story record on every notify that satisfies the
  capture condition (cost grows with the record); the restore rewinds the whole record, the session journal and the
  effect ledger included.

## Live legs (pending): exact commands

S3 runs on one lane, dev build, real LLM, run header around the batch, `--strict`; each arm ×2 back to back. `<n>` = the
lane; the group is the T10/T1 sandbox group. Records: `test/journeys/records/v2.5-plan09/sp1/live-<bundle12>/`.

```bash
npm run build:dev && npm run serve:dev
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts capture --label v25-09-sp1-start
node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-09-sp1-s3-control.json test/scenarios/live-v25-09-sp1-s3.json
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts diff <debug-dir>/run-header-v25-09-sp1-start.json
```

Scoring: S3 = both flag-on runs pass (every one of the 10 swipe-backs hits, starts 0 reads, equals that swipe's
recording); the control arm's per-swipe-back reads are the "today" column. S4 = swipe-back events per 100 player turns in
plan 10's human sessions (U4), ≥ 3.
