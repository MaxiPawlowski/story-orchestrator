# v2.5 plan 09 — SP1 spike report: swipe-back cache

**Verdict: pending.** Conditions and fixtures committed before any code or run (rule 1). Nothing below is a result yet.
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

| # | Measured | Result |
|---|---|---|
| S1 | pending | pending |
| S2 | pending | pending |
| S3 | pending (live) | pending |
| S4 | pending (human sessions, plan 10) | pending |
