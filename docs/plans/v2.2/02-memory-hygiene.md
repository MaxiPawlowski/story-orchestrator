# Plan 02 — Memory hygiene

## Objective

Stop two kinds of damage to the memory tiers, both measured in the spike:

- **Fabricated lines get stored.** The spike caught 2 real Artemis fabrications at p = 0.04. With
  a verify rung, 16 of 16 planted fabrications were dropped while 90% of the good lines stayed.
- **Related notes are judged by word overlap.** Today's non-LLM path gets 6 of 20 pairs right. The
  judge gets 19 of 20.

The judge verifies each extracted line before it is stored, and it decides the relation of each
consolidation candidate pair.

## Context

Spike: README §Results (memory consolidation, memory-line verification, verification of Artemis's
real lines), and `experiments/memory.mts`, which holds the exact questions and `VERIFY_CRITERIA`.

**How consolidation actually works today** (corrected after review 2026-09-19; the spike write-up
first said "deferred to an LLM call"):

1. `memoryCoordinator.runConsolidation` runs every 10 boundaries (`boundaryWork` `consolidation`,
   P4). It covers groups of ≥ 8 active entries per tier/character.
2. `buildMatchSets` builds `dup` / `sameTopic` sets: ST vector cosine 0.82 / 0.55, or the Jaccard
   fallback at 0.65 / 0.4.
3. `consolidateTier` (`memory/consolidate.ts:54`) walks the entries oldest first:
   - an identical or cross-type dup is **dropped** (and the older copy confirmed);
   - a same-type dup or same-topic pair is **superseded** when the newer text matches
     `hasStateChangeMarker` (a regex list in `similarity.ts`);
   - otherwise it is **uncertain**.
4. Uncertain pairs keep both notes and flag the older one `contradicted` (`markContradicted`). That
   is a −2 score penalty (`score.ts` `contradiction` weight), and the author view shows
   "⚠ contradicted". **No model call happens.**
5. Superseded winners go to `runSupersessionBridge`: a shared read over the winners' text, so a
   state change reaches latching qualities. That bridge stays; it is not a pair decision.

**Ingest.** `extractionCoordinator.applyAudit` builds `MemoryEntry`s from the read's FACT and
MEMORY lines (`confidence: 1`), then calls `memory.applyEntries`. `scoreEntry` already weights
`confidence` (0.8) and `contradicted` (−2).

**Budget.** `memoryCoordinator.ts` was 591 lines at HEAD and 602 with other sessions' uncommitted
work on 2026-09-19. `architecture.test.ts` caps coordinators at 620. This plan must move code out
before it adds any, measured against the file at plan start.

**What "19 of 20" covers.** The spike asked Jev about all 20 pairs. Production asks only about the
pairs its candidate generator surfaces (`buildMatchSets`: vector cosine, or the Jaccard fallback).
In the spike's pairs, M02 (0.08), M09 (0.13), M10 (0.23) and M17 (0.20) sit below any Jaccard floor
worth using. On the Jaccard path the ceiling is therefore about 15/20, whatever the judge does.
The vector path's recall was never measured. This plan measures generator recall before it
promises a number.

**Consumed:** plan 01 (`askJudge`, `policy.ts`, the call ring, `so-judge`). Regression floor: J3
(memory recalled), J4 (memorize backlog, which ingests through the same path), and J6 (a rollback
drops memory by message id).

## Scope

In: the verify rung on FACT and MEMORY lines, the judged pair relation in consolidation, the author
view of dropped lines, calibration fixtures, and the J11 memory checks.

Non-goals:
- Verifying scene summaries, short-term compaction, arc summaries or canon. They are longer and
  unmeasured; they go to a spike seed.
- Verifying epistemic and ledger lines. That is unmeasured.
- Changing the supersession bridge.
- Changing vectors / Jaccard candidate generation, apart from the judge-mode floor below.

## Deliverables

### Phase A — candidate-generator recall (before build)

Add `experiments/pairRecall.mts` to the harness:
- Over M01–M20 plus ≥ 20 labelled pairs taken from real chat memory tiers, run both generators:
  - `buildJaccardMatchSets` at floors 0.4 / 0.3 / 0.25 / 0.2;
  - the vector path through ST's `/api/vector/*`, called from the page over the harness's
    existing ST connection (`lib/baseline.mts`), because the endpoint needs a session and a CSRF
    token. It shares the page, so ask the other sessions first.
- Report, per generator and floor, which non-`unrelated` pairs become candidates, and how many
  `unrelated` ones ride along (cost).
- Choose `PAIR_JACCARD_FLOOR` and the per-pass cap from this, and record the **end-to-end**
  expectation (generator recall × judge accuracy) in the Gate record. That product, not 19/20, is
  the number this plan is held to.

### Pure questions and policy: `src/judge/memory.ts`

- `buildVerifyQuestions(lines, {storyTitle, cast})`:
  - One noul per line, using `VERIFY_PLAIN` + `VERIFY_CRITERIA` verbatim from the spike.
  - Each instruction ends with "Use `story` only as background for names and places." Without
    that clause, the spike's false flags went from 8 to 17 of 93.
  - State: `{story: {title, cast}, transcript: [{id, speaker, text}]}`. The transcript is the
    audit's own window (`getChatWindow(audit.window.from, audit.window.to)`).
- `buildPairQuestion(older, newer)`:
  - One choice with the spike's **described** labels (`duplicate` / `update` / `distinct` /
    `unrelated`).
  - State `{older_note, newer_note}`, one request per pair, which is the measured shape. Batching
    pairs over shared state is a different, unmeasured question.
- New constants in `policy.ts`:

| Constant | Value |
|---|---|
| `VERIFY_DROP_BELOW` | 0.2 |
| `VERIFY_DOWNWEIGHT_BELOW` | 0.5 (confidence = p) |
| `PAIR_MIN_CONFIDENCE` | 0.6 |
| `PAIR_MAX_PER_PASS` | 32 (revised from Phase A) |
| `PAIR_CONCURRENCY` | 8 |
| `PAIR_JACCARD_FLOOR` | from Phase A |

  In judge mode, the Jaccard fallback's sameTopic floor may drop below 0.4 so more pairs reach
  the judge, which then filters them. How far is decided by Phase A. Today's 0.4 is kept for the
  judge-off path.

### Pure consolidation with relations: `memory/consolidate.ts`

- `consolidateTierJudged(entries, matches, relationOf)` uses the same walk, the same pin
  protection and the same `ConsolidationResult` as `consolidateTier`. `relationOf(olderId,
  newerId)` supplies the decision. Mapping:
  - `duplicate` → drop the newer entry and confirm the older;
  - `update` → supersede the older (winner = newer);
  - `distinct` / `unrelated` → keep both, and `clearContradicted` on the older.
- A pair with no answer, or with confidence < `PAIR_MIN_CONFIDENCE`, uses exactly today's decision
  for that pair.
- `consolidateTier` stays and remains the judge-off path.

### Runtime

**`runtime/consolidationMatches.ts`** (new):
- Move `buildMatchSets` out of `memoryCoordinator` into it (precedent: `runtime/memoryMirror.ts`).
  That frees ~40 lines.
- Add `judgePairRelations(group, matches, judge)`. It enumerates the candidate pairs exactly as
  the walk will visit them, prioritised by similarity band and capped at `PAIR_MAX_PER_PASS`. It
  asks them with `PAIR_CONCURRENCY` and returns `relationOf` plus the call records.

**Memory coordinator:**
- Gains an injected `judgePairs?`.
- `runConsolidation` switches to `consolidateTierJudged` when `judge.uses.memoryPairs` is on.
- The bridge still runs for superseded winners.
- The file ends no longer than it was at plan start. This follows v2.1 rule 3's spirit applied to
  the coordinator: the move pays for the addition.

**Verify rung:**
- `extractionCoordinator.applyAudit` gains an injected `verifyLines?`. With
  `judge.uses.memoryVerify` on, it runs over `newMemoryEntries` before `memory.applyEntries`:
  - p < 0.2 → dropped. A record is kept, and the line is never stored.
  - 0.2 ≤ p < 0.5 → stored with `confidence = p`.
  - p ≥ 0.5 → stored unchanged.
- On judge failure every line is stored exactly as today, and the call record carries
  `fallback`.
- Deltas and arc/epistemic/ledger signals are untouched and never wait on the verify rung.
  `enqueueExtractorDeltas` runs first, as it does now.
- Persisted:
  - `extras.memory.verifyDrops`: ring cap 20 of `{text, p, messageId, at, model}`.
  - A sanitizer default `[]` in `runtime/extras.ts`, so an old chat hydrates unchanged (v2.1 rule 6).
  - A mutation rollback drops rows with `messageId >` the rollback point, which is the same rule
    as `dropByMessageId`.

**Author view** (Memory tab): a collapsed **"Not stored (unsupported)"** list over `verifyDrops`,
each row with p and a **Store anyway** action. That action runs `applyEntries` with `confidence = p`
and records the override in the call ring. Player mode never renders it; add it to the spoiler checklist.

**Settings:** two independent opt-ins (overview rule 4): `judge.uses.memoryVerify`
(`#so-judge-use-memory-verify`) and `judge.uses.memoryPairs` (`#so-judge-use-memory-pairs`).
Both default to off.

**Call ring** (`extras.judge.calls`, plan 01): one record per verify call (`use:
"memory-verify"`, with `p` per line) and one per consolidation pass (`use: "memory-pairs"`, with
the relation and confidence per pair asked, and fallbacks).

### Fixtures and tooling

- `test/fixtures/judge/memory-verify.json`: the 40 spike lines, the 93 Artemis lines with the 8
  flagged ones hand-read and labelled, and a Spanish slice of ≥ 8.
- `test/fixtures/judge/memory-pairs.json`: M01–M20, plus ≥ 10 new pairs from real chats. The new
  pairs include ≥ 3 *distinct* pairs with high word overlap, labelled before any answer is read.
  The spike set has only one such pair (M08), and Jev got it wrong.
- Calibration floors:

| Use | Floor |
|---|---|
| verify | At `VERIFY_DROP_BELOW`: ≥ 0.9 of unsupported lines dropped, ≤ 0.1 of supported lines dropped |
| pairs | ≥ 0.85 right action on the pairs asked (the spike scored 0.95 on all 20); end-to-end per Phase A |

- Goldens go to `test/goldens/judge/`.
- `so-scenario` step `judge_consolidate`: seeds memory entries from a fixture file, runs
  `runConsolidation()`, and returns the result.
  - Seeding uses **existing** handles only, so the manager does not grow (v2.1 rule 3). With
    `judge.uses.memoryVerify` off, the step makes **one** `runExtractionNow(debugResponse)` call whose
    response carries every `MEMORY` line of the fixture group (≥ `CONSOLIDATION_MIN_GROUP`, one
    tier). The call is made once because `addMemoryEntries` discards a tier group whose message
    range the write log already covers (`memory/stores.ts:38–43`): a repeated call over the same
    window adds nothing. Then the flag goes on and consolidation runs.
  - The seed is plumbing, and the judge call is real. The gate record says so.

### J11 memory checks

| Check | What |
|---|---|
| J11.7 | Real play with `memoryVerify` on. At least one `memory-verify` record per read that produced lines. Stored entries carry `confidence` ≤ 1 per policy |
| J11.8 | A scripted `/sendas` reply that contradicts itself, plus a real read. If the model writes an unsupported line, it lands in `verifyDrops`. The check passes either way and logs which branch ran (the J8 nondeterminism rule) |
| J11.9 | Seeded pairs → `judge_consolidate`. M01 dropped (spike: duplicate at 0.95). M07 superseded (update at 1.00). M08 **falls back**: Jev said update at 0.59, below `PAIR_MIN_CONFIDENCE`, so today's decision holds and the older note stays `contradicted`, which proves the floor. One of the new high-overlap distinct pairs has `contradicted` cleared, if Jev answers it over the floor; the check logs which branch ran |
| J11.10 | `memoryPairs` off → identical consolidation result to `consolidateTier` on the same seed |

## Implementation notes

- Verify runs inside `applyAudit`. That is already off the reply path: the audit arrives from a
  scheduler job, so the extra ~270 ms delays only when memory lands, never a reply.
- Drops are the only deletion the judge can cause, and they happen **before** storage. An entry
  already in a tier is never deleted by the verify rung, only by consolidation, and there the
  mapping is the same as today's with a better relation source.
- `hasStateChangeMarker` becomes the fallback for low-confidence pairs. Don't delete it.
- Memorize backlog (J4) runs reads through `applyAudit`, so it is verified automatically.
  Backlogs can be large: verify calls chunk at 64 lines, the measured flat range.

## Leaves the machine

| Question | Data sent |
|---|---|
| Verify | The read's window (default 3 messages at cadence; reconcile windows up to the checkpoint span), story title, cast names, candidate memory/fact lines |
| Pairs | Two memory lines per request |

## Validation gate

Harness: `npm run typecheck && npm run lint && npm test && npm run build`. New pure suites cover
`consolidateTierJudged` (a table mirroring `consolidateTier`'s tests, plus each relation) and the
verify policy. The coordinator budget test must pass without raising the budget.

Live (fresh-start, headed, real LLM + real judge):
- J11.7–J11.10, run twice.
- `so-judge calibrate --use memory-verify` and `--use memory-pairs` at their floors.
- J3 and J4 with judge memory on, run twice.
- J6 (rollback drops `verifyDrops` rows past the point).
- J10.11 (legacy blob hydrates with an empty `verifyDrops`).

## Persona tags

| Element | Tag |
|---|---|
| "Not stored" list, Store anyway | `author` |
| `#so-judge-use-memory-verify`, `#so-judge-use-memory-pairs` | `both` |

## Delegated decisions

- Pair ordering inside the cap: similarity band first, then newest.
- Whether "Store anyway" also pins the entry.

## Unresolved questions

- Should a verify drop on a **fact** (the `facts` tier is permanent) need a lower cut than a
  session detail? The spike did not separate them. Proposed: one cut, then re-read the calibration
  rows by tier before plan 08 recommends the usage.
