# Plan 04 — Rollback as a cross-store invariant

**Kind:** fix, with a persistence migration (blob v3 → v4).
**Roadmap package:** 3.
**Closes:** R2, R4, E1, M1, M2, M3, M4 — for the engine, the memory tiers and the stagecraft
revert at this gate; the host-effect half of the cross-store invariant closes at **plan 06's**
gate (its write-ahead ledger is what makes an effect restorable). **Revised 2026-09-20** per
`review-astra-2026-09-20.md` (edit 2, the highest under-scoping risk).

## Objective

Spec v2 promises "rollback ≡ never-applied" (line 299) and a mutation contract that drops memory
created at or after the mutation (line 82). The engine honours it inside one session and inside a
200-entry window; memory maintenance, the ledger, epistemic retirement, read coverage and the
stagecraft revert do not honour it at all, and a reload discards the history the engine would need.
This plan makes the property hold across every store and across a reload, and gives an honest
outcome when history is genuinely unavailable.

## Context

- **R4** `src/engine/engine.ts:104–109` `hydrate` clears `snapshots` and `boundaryLog`;
  `serialize` persists only the current state. Reproduced: a transition supported by message 1,
  serialize/hydrate, the same edit is now "irrelevant".
- **E1** caps at `:166`, `:208` (log 200) and `:269–271` (snapshots 200). After 205 boundaries,
  `shouldRollbackFromMessage(0)` is true, `boundaryBeforeMessage(0)` falls back to 0,
  `rollbackTo(0)` returns false, and `runtimeManager.ts:289–313` does nothing when `changed` is
  false — no reread, no notice.
- **R2** `stagecraftCoordinator.ts:254–276` iterates `affected` records in ring order and reverses
  ops only within a record. Two writes to one entry at two boundaries (`Original → First →
  Second`) revert to `First`. Before-images come from one `readScope` per batch (`:197`), not the
  write edge; inverse host results are not checked.
- **M1** `src/memory/consolidate.ts:118` sets `supersededBy` on the older entry with no event
  provenance; `stores.ts:55` `dropByMessageId` filters by an entry's own `messageId` only. Rolling
  back the superseder leaves the predecessor retired by a missing winner.
- **M2** `stores.ts:38–49` `addMemoryEntries` discards a read whose tier/character range the
  `writeLog` already covers; `dropByMessageId` leaves `writeLog` untouched; the forced reread after
  rollback accepts nothing.
- **M3** `src/memory/ledger.ts:38–43` overwrites `value`/`messageId` in place; `rollbackLedger`
  (`:67`) can only keep or drop the row, so `healthy@1 → injured@10` rolled back from 10 removes
  the row.
- **M4** `src/memory/epistemic.ts:39` retires by a string marker `retired@<boundary>`;
  `rollbackEpistemic` (`:109`) filters by the row's own `messageId`, so a reveal rolled back leaves
  the belief retired.
- Composition: `memoryCoordinator.ts:264–272` spreads `dropByMessageId` then calls
  `rollbackEpistemic`/`rollbackLedger` — the pure functions are the defect, the composition is fine.
- Spec: `../v2/story-orchestrator-spec-v2.md:82` (mutation contract), `:299` (layer-1 property).

## Scope

In: engine history persistence and horizon policy; provenance for supersession, retirement, ledger
versions and read coverage; write-order stagecraft revert with checked inverses; the v4 migration;
rollback coverage of generated graph, pacing and host effects.

Non-goals: pin semantics (plan 05, on this plan's provenance); the effect ledger's *ownership*
across chats (plan 06); a full event-sourced store (an inverse journal is enough).

## Deliverables

### Shared persisted schema (designed here, with plan 05, before either is coded)

The v4 blob (bump landed in plan 03 with the `chatId` stamp) is specified once for plans 04, 05
and 06, so no plan adds a field the next one has to migrate again. Non-recursive; every record
references others by id, never by embedding.

```ts
engine: { state, historyFrom: {boundary, messageId}, baseSnapshot: {boundary, state}, boundaryLog: BoundaryLogEntry[] }
memory: { entries: MemoryEntry[] /* + provenance (05) */, writeLog: {range, messageId, boundary}[], ledger: LedgerVersion[], epistemic: EpistemicRow[] }
derived: { id, kind: "short_term" | "scene_summary" | "arc_summary" | "canon" | "exclusion" | "dedup", inputs: {store, id}[] | {messageId, boundary}[], boundary, text? }[]
stagecraft: { records: {ops: {before, after, target, boundary, messageId, status}[]}[] }
effects: { ledger: EffectLedgerRow[] /* plan 06: write-ahead, stable target, status */ }
```

`historyFrom` is the oldest point rollback can reach; every store's retention aligns to it (see
compaction below). A v3 blob migrates with `historyFrom = {boundary: current, messageId:
lastMessageId}` and an empty log: rollback targets before it are `unavailable` **permanently for
that chat** (until Restart), never "until the first new boundary" — one boundary cannot
reconstruct history the blob never held. A real v3 blob is captured as a fixture
(`test/fixtures/legacy-v3-chat-blob.json`, the J10.11 pattern), re-captured after plan 05's
fields land so one fixture covers the final v4.

### Engine history that survives a reload (R4, E1)

- `EngineState` persists the bounded `boundaryLog` and a **base snapshot** at `historyFrom`;
  `hydrate` restores both. Rollback to a boundary ≥ `historyFrom` restores the base snapshot (or
  a periodic intermediate one) and replays log entries up to the target (the log already holds
  `before`, `after`, `fired`, `queue`).
- Out-of-horizon: `rollbackTo` returns `{ok: false, reason: "history-unavailable", oldest:
  historyFrom}`; `rollbackFromMessage` returns an outcome `applied | noop | unavailable`. On
  `unavailable` the manager quarantines derived state (memory rows, scene, expansion cache,
  judge rows ≥ the message are dropped as today), posts a recovery notice with two actions —
  **re-read from checkpoint start** (a P0 read over `[checkpointStartedMessageId, now]`) or
  **Restart story** — and never implies nothing changed. The horizon is visible in the author
  view. The promoted E1 test asserts this outcome and the notice (the review's assertion of a
  successful rollback to boundary 0 is replaced; `01-evidence-hardening.md` §A).
- Retention: log length 200 boundaries and `historyFrom` advances with it; when it advances, the
  base snapshot is rebuilt at the new `historyFrom` and every store compacts **below it only**.

### Memory maintenance with provenance (M1–M4)

- `MemoryEntry.supersededAt: {messageId, boundary}` written by `applyConsolidation`; rollback
  clears links created at or after the point (`supersededBy` removed, predecessor active again).
- `writeLog` entries whose `range.to ≥ messageId` are removed on rollback (the conservative rule;
  a split is not worth its reasoning cost).
- Ledger rows become **append-only versions**: `{entity, field, value, messageId, boundary,
  supersedes?}`; `buildLedgerView` derives the latest active value; rollback drops versions ≥ the
  point and the prior value reappears. Pinning applies to the key, not a version (plan 05 refines).
  Version chains compact only for versions below `historyFrom` (a "keep ≤ 5 per key" rule inside
  the retained window would destroy rollback the window promises).
- Epistemic retirement is structured: `retiredAt?: {messageId, boundary}`; the string marker is
  display-only; rollback clears retirements at or after the point.
- **Dependent artifacts reverse too** (the review's derived-history scope): every derived record
  — a `short_term` compaction, a scene summary, an arc summary, the canon, a memory
  **exclusion** (`excludeMemoryEntry`), a **dedup/duplicate confirmation** — carries `inputs`
  (the store ids or `{messageId, boundary}` it was built from). Rollback past any input drops or
  marks stale the artifact (the canon and summaries are re-derived on the next pass; an
  exclusion whose entry returns is lifted; a dedup whose winner is gone restores the loser).
  Nothing derived survives the removal of what it was derived from.
- A property test: for random sequences of reads, consolidations, compactions, exclusions,
  ledger/epistemic signals and rollbacks, the rolled-back store equals the store built from the
  same sequence with the removed inputs omitted (`rollback ≡ replay`). Seeds recorded.

### Stagecraft revert in write order (R2)

- `applyCuratorProposals` records each op's before-image **at the write edge** (read the entry
  right before writing it), with the op's boundary and message id.
- `revertAppliedSince` reverses across records newest-first and ops newest-first; each inverse
  host call's result is checked; a failed inverse leaves the record in `revert-failed` with the
  before-image intact and a journal line, never deleted.
- Compare-and-set: if the entry's current content differs from the op's `after`, the revert
  refuses and flags the entry as externally edited (the author decides). The op's `target` is
  the book **file id + entry uid**, not the display name.
- Cases: two writes to one entry across batches; two entries in one batch; external edit between
  write and revert; partial host failure; a crash between the host write and the record persist
  (the record is written **before** the host call with `status: pending`, so hydrate can
  reconcile — the same write-ahead rule plan 06 applies to every effect).

### The rest of the rollback contract

- Expansion cache: generated checkpoints inserted after the point are removed and the basis
  re-validated (`generation/revalidate.ts`); pacing already replays (`replayCommitted`); host
  effects re-apply through `applyCheckpoint(..., "hydrate", path)` (verified by test). Effects a
  later checkpoint made and the older one did not are restored through plan 06's write-ahead
  ledger; **that half of the invariant is asserted at plan 06's gate**, and this plan's Gate
  record says so instead of claiming the full cross-store property.

## Verification

- **Story and recipe:** `live-gate-playbook.md` §Plan 04 — adventurer played to `first-night`,
  with the preconditions **seeded and asserted** (a fact superseded by the target message, two
  accepted curator rewrites of one Chronicle entry with before-images, the entry's hash differing
  from its original); edit the message to a text that denies entry and watch the checkpoint, the
  world-info swap, the memory rows and the superseded fact all return and the entry hash equal
  its original (R2); reload-then-edit (R4); a 205-boundary scripted chat for E1 with
  `rollbackOutcome: unavailable`.
- Ledger rows R2, R4, E1, M1, M2, M3, M4 flip to `it` (E1 as its rewritten test); the
  rollback≡replay property (≥ 1000 cases, including derived artifacts) green; migration test over
  the captured v3 blob asserting `historyFrom` and permanent `unavailable` below it.
- `npm run typecheck && npm run lint && npm test && npm run build`; `architecture.test.ts` (memory
  coordinator budget) green.
- Live, real LLM, headed: J6 twice, plus J6 variants — reload then edit (R4), a 205-boundary
  scripted chat then edit message 0 (E1: recovery notice + reread visible), edit a reveal after an
  epistemic pass (M4: the belief returns), a ledger update then edit (M3: prior value returns);
  J8 with two curator writes then a rollback past both (R2: original text restored, checked in
  the lorebook); J10.11 and the new v3 fixture hydrate cleanly; J3 and J4 twice unchanged.

## Persona tags

| Element | Tag |
|---|---|
| Recovery notice (re-read / restart) | `both` (player wording, checkpoint names only) |
| Horizon and `revert-failed` rows | `author` |

## Delegated decisions

- Intermediate-snapshot cadence inside the window (every 50 boundaries proposed) and the
  retained log length (200 stays). Compaction of any store happens only below `historyFrom`.

## Unresolved questions

- Default recovery action for a player (`re-read` proposed; see `00-overview.md`).
- Does any shipped scenario assert the old "no-op past horizon" behaviour? None found; the Gate
  record confirms.

## Gate record — slice 1: the engine's history, the floor, and memory reversal (2026-09-21)

This plan is being landed in slices; this is the first, and the only claims below are the ones the
evidence covers. Local gates on this tree: `typecheck`, `typecheck:test`, `lint`, `test`
(**124 suites / 2239 tests**), `test:debug` (96), `debug:typecheck`, `build`, `test-storybook:ci`
(**27 suites / 132 tests**).

| Finding | Live? | Evidence |
|---|---|---|
| **R4** a hydrated engine still recognises an edit to persisted transition evidence | jest | `src/engine/engine.review.test.ts` — `hydrate(state, history)` restores the bounded log and the snapshots rebuilt from it |
| **E1** a mutation past the horizon reports an explicit outcome, never a silent no-op | jest + live | `rollbackTo` answers `{ok:true,result:"applied"\|"noop"}` or `{ok:false,reason:"history-unavailable",oldest}`; the manager quarantines, journals and sets `rollbackUnavailable`; the drawer renders it with one action. `J6` 4/4 twice |
| **M1** rolling back a superseding fact reactivates its predecessor | jest | `supersededAt` records when a link was made; `dropByMessageId` clears the links at or after the point |
| **M2** rollback clears read coverage so a forced re-read can repopulate | jest | `dropByMessageId` drops the coverage whose window the mutation reached |
| **M3** rolling back a ledger update restores the prior value | jest | ledger rows are append-only versions joined by `supersedes`; `buildLedgerView` collapses a key to its newest version |
| **M4** rolling back a reveal un-retires the belief it retired | jest | `retiredAt` records the retirement; `rollbackEpistemic` clears the retirements at or after the point |
| Migration floor | jest | the captured v3 blob arrives with no `engineHistory`, so its records can only roll back from the point they were saved — permanently, until Restart |

`J6` ×2 is the live regression gate for the composition move: **4/4 both runs, cleanup clean,
`test/journeys/records/v2.3-plan04/j6-run{1,2}.json`**.

### Two things this slice had to fix that were not in the plan

- **J6 was failing on this card, and not because of the refactor.** Its first check waited 30 s for a
  group turn that takes 30–55 s here (three members), so J6.1 timed out and J6.3/J6.4 cascaded off
  the state it never reached. The lesson the docs already carry for J11.16 and J7 applies again: a
  fixed timeout around a real generation is a hardware assumption. Its sends now wait for their
  replies and its waits are 300 s. Green twice on the same build that had failed twice.
- **The manager hit its 700-line budget while growing the rollback wiring.** Rather than raise the
  budget, the composition moved to `src/runtime/rollback.ts` with typed deps — which is also the
  honest shape for a module that spans five stores. The write-edge census gained one row for it,
  classified `partial` with the reason it cannot be `checked`: it does not start work, it is a
  mutation's own consequence, and minting a token inside it would refuse the rollback it exists to
  perform.

### Still owed by this plan (not claimed here)

The stagecraft write-order revert (R2) and its checked inverses; derived-artifact reversal (a
compaction, scene/arc summary, canon, exclusion or dedup whose input was removed); the
`rollback ≡ replay` property test; the J6 variants (reload-then-edit, the 205-boundary chat, an
epistemic reveal, a ledger update) and the J8 two-write rollback. The host-effect half of the
cross-store invariant remains plan 06's by design.

## Gate record — slice 2: the stagecraft revert, and the property test (2026-09-21)

Local gates on this tree: `typecheck`, `typecheck:test`, `lint`, `test` (**126 suites / 2269 tests**),
`build`. `test:debug` and `test-storybook:ci` re-run at the next handover.

| Finding | Evidence |
|---|---|
| **R2** rolling back two writes to one entry restores the oldest before-image | closed — newest-record-first and newest-op-first reversal; the before-image is read AT THE WRITE EDGE (`readWIEntry`); each inverse is checked and a failure leaves the record `revert-failed` with its before-image; a compare-and-set against the op's `after` refuses to overwrite an entry someone else edited (`externally-edited`); the target is the book file id + entry uid. `src/runtime/coordinators/stagecraftCoordinator.{test,review.test}.ts` |
| **`rollback ≡ replay`** | `src/memory/rollbackReplay.property.test.ts` — 4 fixed seeds × 400 random cuts over reads, consolidations, ledger signals and epistemic retirements, comparing the rolled-back store with a store built by replaying only the operations below the cut |

### The property test earned its keep before it passed

Its first green-looking run failed, and both counterexamples were real defects in the stores rather
than in the generator:

- **A supersession link was dated at the WINNER's message, not at the pass that made it.** Rolling
  back past an edit a consolidation had reacted to left the retirement in place, because the link
  claimed to have been made when the newer fact arrived. `applyConsolidation` now takes the point it
  runs at, and the coordinator passes its own `lastMessageId`/`boundary`.
- **A link could be overwritten.** A later consolidation could re-retire an already-retired entry,
  replacing the provenance of a link a rollback needed, so `rollback ≡ replay` was false for a
  reachable state. The first link now wins, and `consolidateTier` no longer offers an already-retired
  entry as a loser.

Both are the kind of defect the review found one at a time by hand; the generator found them in
seconds, which is what the plan asked this test to be.

### A regression this slice's live gate caught

`J8` failed 4 of 6 on the first run, twice, with a message that named its cause: *"The wizard has not
created SO-J8 Lore for this story, so it will not write into it."* That is plan 02's R8 rule doing
exactly what it was built to do — to a book the journey had created through the **runtime** path,
which never recorded ownership because only the review card's UI did. Fixed at the write edge:
`applyProvisioning` records what it creates in the session ledger itself, so a scripted or
runtime-created asset is writable by the wizard that made it. (Second occurrence of the same class
as J9.3's failure: a rule that reads ownership from a record the write path did not write.)

## A test file was destroyed and partially recovered (2026-09-21)

While updating `src/runtime/coordinators/stagecraftCoordinator.test.ts`, a script edit opened the
file for writing before reading it (`open(p,"w").write(open(p).read())`), truncating it to zero
bytes. It is **not tracked by git**, so there was no checkout to fall back on.

Recovered from jest's transform cache (`%LOCALAPPDATA%\Temp\jest`, `sourcesContent` in the
`.map` beside each transpiled file): the newest cached revision that already contained this
session's edits. It is **26 tests, and it is not the same 26**. Five ownership tests that were in
the destroyed revision are missing:

- a normal same-session curator write applies
- accepted ops reach their own world's lorebook
- a world lost during an accepted write stops the ops behind it
- a rollback in its own world restores every applied write
- a rollback that outlives its world stops restoring pre-write content

The production code they covered is **intact and unchanged** — `applyAccepted` and
`revertAppliedSince` still mint a token and check it before every write, and the ownership census
still classifies those sites. What is lost is the suite that would have failed if someone removed
it. Re-writing them is outstanding work, recorded here so it is not silently forgotten.

**Lesson, for the next agent:** the transform cache is a real recovery path (and the only one for an
untracked file), but it holds revisions, not the current bytes. Write files atomically —
`readFileSync` first, then a separate write — and never open a path for writing to build the text
you are about to write into it.

### The recovered test file is back, and one assertion was corrected (2026-09-21)

The five ownership tests are re-written (not recovered — the originals are gone): a normal same-session
curator write applies; accepted ops reach their own world's lorebook; a world lost during an accepted
write stops the ops behind it; a rollback in its own world restores every applied write; and a rollback
that outlives its world stops restoring pre-write content, now driven by switching the chat *during*
the revert, which is what the case was always about. The recovered revision also asserted that a
rewrite of the ferryman re-disables "The bridge"; its own fixture cannot satisfy that, and the code's
actual behaviour (re-disable the entry the op wrote) is the correct one, so the assertion names the
ferryman. That is a correction, not a recovery, and it is recorded here rather than quietly made.

## Gate record — slice 3: derived artifacts, the write-ahead record, and two defects the live gate found (2026-09-21)

Local gates on this tree: `typecheck`, `typecheck:test`, `lint`, `test` (**128 suites / 2292 tests**),
`test:debug` (96), `debug:typecheck`, `build`, `test-storybook:ci` (exit 0).

| Finding | Live? | Evidence |
|---|---|---|
| derived artifacts reverse with their inputs | jest | `src/memory/derived.ts` + `reverse.ts`: every artifact records `inputs` (rows), `range` (the message span it summarised), `outputId` (the row it produced) and `removed` (the rows it took away, verbatim). `rollbackDerived` drops a record built at/after the point, one whose span starts there, or one whose input/output the rollback removed — transitively, so a chain of summaries unwinds; `reverseMemoryState` composes it with the four version stores. `src/memory/derived.test.ts` (13 cases) |
| `rollback ≡ replay` **including derived artifacts** | jest | `src/memory/rollbackReplay.property.test.ts`: 4 seeds × 400 cuts over reads, consolidations, exclusions, compactions, ledger versions and epistemic retirements, driving the REAL composition (`reverseMemoryState`) rather than a replica, and comparing the derived ring, the watermark and the survivor's duplicate confirmations as well as the rows |
| R2's write-ahead rule | jest | `CuratorOpRecord.writeAhead` is persisted before the host call (`markWriteAhead`), so a crash between the file change and the applied record leaves a pending row carrying before/after rather than an unrecorded mutation. `stagecraftCoordinator.test.ts` pins the pending state observed from inside the mocked host write |
| **M3** | live | `J6.7` ×2 and `test/scenarios/live-rollback-derived.json`: a pass writes `condition=healthy` at message N-1 and `wounded` at N; editing N returns the view to `healthy` and drops `wounded` |
| **M4** | live | `J6.8` ×2 and the same scenario: a `[knows]` belief is retired by a later pass; editing the message that carried the retirement un-retires it (the row survives, its `supersededBy`/`retiredAt` are gone) |
| **E1** | live | `J6.9` ×2: 205 scripted commits, then an edit to message 0 — `rollbackUnavailable` with the checkpoint name, `#so-rollback-unavailable` and `#so-reread-checkpoint` on the player surface |
| **R4** | live | `J6.6` ×2: two turns to `cp2`, a **reload**, then an edit to message 0 — the notice fires and the run steps back to `cp1` |
| **R2** | live | `test/scenarios/live-rollback-stagecraft.json`: two curator rewrites of ONE entry, applied at two boundaries (the book holds each in turn), then an edit to message 0 rolls the run back past both — the entry ends at its ORIGINAL text, never the intermediate one the older record held |
| expansion cache on rollback | jest | `runRollback` now revalidates the expansion cache (`revalidateExpansion`): the basis is the blackboard the rollback just restored, so a generated checkpoint whose basis no longer holds goes `stale` rather than staying `inserted`. `src/runtime/rollback.test.ts` |

**J6 ×2 on the final tree**: both runs `automated: 8 pass, 0 fail, 0 blocked, first try: 8 of 8 needed no retry`,
`cleanup: clean`; archived under `test/journeys/records/plan-04/` with the two scenario logs.

### The live gate found three defects, two of them in code I had already called done

1. **`hydrateHistory` was a no-op on the live path.** The manager called `this.engine.hydrateHistory(...)`
   and then `this.engine.hydrate(state)` — whose `history` parameter defaults to `null`, so `hydrate`
   cleared the log and the snapshots and restored only the position. R4's unit test passed because it
   called the two-argument form production never did: the test modelled a path the product does not
   take. Fixed by passing the history with the state, and by persisting the **base snapshot** the plan
   asked for (`EngineHistory.base`, the state AT `historyFrom`) — without it a reloaded chat could not
   roll back to the state before its own first turn, and reported the history as gone while the run was
   one boundary old.
2. **The engine's predicate was standing in front of every other store.** An edit whose message a
   memory pass had reacted to, but that no blackboard write or transition depended on, was treated as
   a whole-run no-op: the ledger kept the value the edit invalidated and the belief stayed retired.
   The no-op path now reverses memory and quarantines extraction, and the horizon check moved AHEAD of
   the engine's own predicate, so an edit past the retained history is still reported when the engine
   has nothing to restore (that ordering slip is what broke E1 for one run).
3. **A restored row arrives carrying links the cut never had**, and one hash can belong to two
   exclusions. Both were found by the property test before it passed (see slice 2) and both are now
   pinned by name in `derived.test.ts`.

4. **The R2 scenario's first expectation was wrong, and the code was right.** It edited the newest
   message and expected the two curator writes to revert; a write made BEFORE the rollback point is
   part of the state at that point and correctly stays. The check now rolls back to a point at or
   before the writes — which is what "past both" means — and the sharper claim it pins is the one the
   plan asked for: two writes to one entry land back on the ORIGINAL text, not the intermediate one.

**Not fixed, and left visible:** an edit that reverses memory without moving the engine shows no
player-facing notice (`lastRollback` stays null, correctly — the story did not step back). Whether the
player should be told that what the chat had learned was revised is an open product question, not a
gate criterion. And `capAllTiers` can drop a row on a write that records no artifact, so a rollback
across a capped tier is not `≡ replay`; the property test excludes capping for exactly that reason and
the retention alignment (`historyFrom` compacts every store below it only) is still plan 05's.

### Still owed by this plan

The host-effect half of the cross-store invariant stays plan 06's by design. `J6.5` is the operator's
human rubric. The `--only` isolation sweep (F3) still covers the twelve J11 checks, not J6's variants.

### A peer session deselected a required lorebook mid-run (2026-09-21)

The second J6 run had J6.1–J6.7 green and then failed J6.8 on a 300-second `wait: {checkpoint: cp2}`.
The state it printed named the cause: `requirementsReady: false`, `missingLorebooks: ["Xentar
Checkpoints"]`. A story's `requirements.lorebooks` is satisfied only by the **globally selected** set,
that selection is install-wide, and nothing in J6 had ever asked for it — so a change to it (a
scenario's cleanup, or another session on this shared install) silently turns every gated latch in the
journey into a no-op, which the check then reports as a timeout five steps from the cause.

Two fixes, both harness-level:

- J6's setup now declares `activateLorebooks: ["Xentar Checkpoints"]`, so the journey makes the
  requirement true itself and deactivates only what it switched on. A journey that depends on a story
  requirement has to establish it, the same way a check that depends on a story has to import it.
- The guard step shared by J6.6/J6.7/J6.8 now fails loudly on unmet requirements, naming the missing
  book, instead of letting the gate silently never latch.

### The mocked corpus was re-run, and it had rotted (2026-09-21)

`so-scenario` has no `run-all`: the corpus is a shell loop over `test/scenarios/*.json`. Two things
came out of running it after this slice:

1. **A manual read saw an EMPTY window.** `runNow` derived its window from the engine's
   `state.lastMessageId`, and the engine lags the chat by design (the boundary for a just-posted
   message lands on the next flush). A read taken right after a `send` therefore had
   `window {from: 0, to: -1}`, and plan 02's evidence rule rejected every delta it produced — the
   check failed five steps later as "the checkpoint never arrived". Fixed in the product:
   `runNow` reads up to the newest message in the chat (`readState`), because a manual read means
   "read the transcript as it is now". Three fixtures (`plan03-extraction`,
   `plan03a-delete-rollback`, `plan04-pacing`) were red on this alone.

2. **Two fixtures are still red, and the corpus's green claim was stale.** `plan04-pacing` now
   latches its deltas but its calibrated EMA (`tension.smoothed ≈ 0.4`) reads 0.3475;
   `plan06-convergence` never produces the boundaries its cadence read needs, so its
   reconciliation event never appears. Both fixtures were written before plan 02's evidence rule and
   had been failing since; the "14-scenario corpus green" line in earlier notes dates from before
   that rule. They are recorded here rather than papered over, and the corpus loop now reports their
   exit codes honestly (the first run's table was wrong: `$?` after a `$(basename ...)` substitution
   is the substitution's status, so every row printed 0).

Corpus on this tree: **15 pass, 2 fail** (`plan04-pacing`, `plan06-convergence`), with the other
fifteen — including the two new plan-04 scenarios — green in one batch.

**Cleanup also gained a guard**: a sandbox run now records the message count of the chat the page was
on when it started and re-reads it from the server at cleanup. If that chat shrank, the run reports
`preexistingChatDamaged` instead of passing quietly (see the incident note below).

### A chat of the user's was emptied during a corpus run, and restored (2026-09-21)

`2026-09-21@15h49m05s268ms` (a "SO-J9 Courier Run" chat, 4 messages, from an earlier session) was
found with an empty file after a mocked corpus loop: metadata only, no messages. The mechanism was
not identified — every step of a sandbox run is guarded against writing to a chat it does not own,
and the chat was not the one any run created. What made it visible was the run-header diff: the
baseline said the open chat was playing `so-j9-wizard`, the end capture said no story. ST keeps
per-save chat backups in `data/default-user/backups/`, and the last non-empty one (19:29:16, 302 KB)
was restored over the emptied file; the page reads 4 messages again, and a copy of the restored file
is kept at `C:\dev\SillyTavern-MainBranch\.debug-restored-chat-safe-copy.jsonl`.

**Lesson for the next agent:** take a run-header capture around any batch, and diff it. Without the
`story.*` diff this would have been invisible — the corpus reported success for every scenario.

## Audit 2026-09-23 — reopened (status: partial)

- **Ledger cap vs append-only versions (high)**: `applyLedgerSignals` (`ledger.ts:44`) versions
  unchanged values; `capLedger` (`ledger.ts:92`) keeps the newest 60 across ALL keys → other
  entities' only rows evicted, rollback past a trimmed version impossible → V9.
- **Failed revert deletes its record (high)**: `revertAppliedSince`
  (`stagecraftCoordinator.ts:305-345`) settles a record with any reverted op, dropping sibling
  `revert-failed` ops and their before-images; kept ops re-ordered (`unshift` + `reverse`);
  recorded `target` unused; no test names `revert-failed`/`externally-edited` → V10.
- **Silent no-op remains**: `runRollback` (`rollback.ts:77`) returns quietly on
  `history-unavailable` from a missing snapshot; noop/unavailable paths skip stagecraft revert +
  expansion revalidation; `boundary === null` (*suspected*) → V11. E1 notice offers one action,
  plan asked for two → V11.
- **Property test narrower than rule 3**: memory/ledger/epistemic only, hand-built derived
  records, 4 seeds × 60 ops; engine/scene/stagecraft/judge ring/arcs/host effects absent → V9/V10
  extend it where they touch; host effects via V15c.
- **v3 blob fixture synthesized** (`test/fixtures/v3-chat-blob.json` = migration output, no
  memory/epistemic/ledger rows) — rule 4 wants a real capture → L1 captures one from P0′.
- **Host-effect half never closed** (restart/rollback never restore) → V15c.
- R2 live evidence mocked + text comparison, not hash equality → L2 (J8 two-write rollback).
- Engine history persists up to 200 full states per save — size unmeasured (*suspected*) → V11
  measures it.


### V9 gate (2026-09-23)

- `applyLedgerSignals` adds no version when the key's newest live value is unchanged.
- `capLedger(entries, keyCap = 60, rowCap = 240)`: past `keyCap` distinct keys it drops the least recently touched UNPINNED key whole; past `rowCap` rows it trims superseded versions oldest-first, and never a key's newest version or a pinned row. Before, the newest 60 rows across ALL keys survived, so one noisy field evicted every other entity's only row.
- Not done, stated: the plan's "compact only below `historyFrom`" alignment (older versions trimmed before the engine's history floor first) — the coordinator has no floor dependency and is at 619/620 lines. With 240 rows the average key keeps ~4 versions; a rollback past a trimmed version restores the oldest version still held, not the true prior value. Carried to V11 (the rollback-horizon item).
- Tests: `ledger.test.ts` V9 block (unchanged repeats; 400 noisy passes leave the other entity's row and the newest value, rows ≤ 240; key cap spares the pinned key and drops the stalest). Mutations (`test/findings/mutations/V9-ledger-cap.txt`): skip removed → 1 fails; old global rule → 2 fail. (A first attempt at the second mutation silently did not apply — CRLF — and recorded a meaningless 14/14; it was redone and the record corrected.)
- Machine: typecheck 0, lint 0, jest 155 / 2519, build 0 (bundle `57d6396a6797`), test:release 10/10.
- Live (`test/scenarios/live-v9-ledger-cap.json`, sandbox, no model: 81 real ledger passes through the runtime + a page reload): Mira's row and Kael's newest value survive, 70 Kael versions (10 unchanged repeats skipped), same after reload. **4/4 twice** (`records/v2.3-replan/V9/run1.log`, `run2.log`).

### V10 gate (2026-09-23)

- `revertAppliedSince`: a record is removed only when none of its kept ops still needs it (`applied` — e.g. an ownership lapse mid-revert — `revert-failed` or `externally-edited`); before, ONE reverted or externally-edited op removed the whole record, deleting sibling `revert-failed` ops and the before-images a retry needs. The trailing `ops.reverse()` is gone: kept ops were `unshift`ed while walking the ops newest-first, which already restores declaration order, so the reverse flipped it.
- Not done, stated: restore by the recorded target (book file id + entry uid). It still addresses entries by lorebook display name + comment, so a renamed entry is not found (the revert then fails and — now — is kept for a retry instead of being lost).
- Tests (`stagecraftCoordinator.review.test.ts` V10 block): a record whose other op reverted keeps its `revert-failed` op with its before-image; an externally edited op stays visible; kept ops keep declared order; control — a fully reverted record is removed. Mutations (`test/findings/mutations/V10-stagecraft-revert.txt`): old removal rule → 2 fail; old `reverse()` → 1 fails.
- Machine: typecheck 0, lint 0, jest 155 / 2523, build 0 (bundle `21957b5f9ce6`), test:release 10/10.
- Live regression, twice (`test/scenarios/live-rollback-stagecraft.json`, sandbox, group `1759606632088`): two curator rewrites of one real lorebook entry, a real generation, a real edit-driven rollback past both — the entry reads its ORIGINAL text both runs (`records/v2.3-replan/V10/run1.log`, `run2.log`), `SO-J8` assets removed, run-header diff 0 blocking. The curator's text is a debug response (the limitation the audit named); the real-curator + hash-equality variant stays in L2 (J8). The scenario's `"reverted":0` field is mislabelled — it counts ops still `applied` after the rollback, so 0 means every write was reverted; the audit read it as evidence of the deletion bug, which it is not.

### V11 gate (2026-09-23) — the rollback horizon is never silent

**Defects fixed**
- `runRollback` handled only one of the two ways the history can be gone. When `boundaryBeforeMessage` answered `null`, the player got the E1 notice. When the boundary existed but its snapshot did not, `rollbackTo` answered `history-unavailable` and `runRollback` passed that answer straight up. That meant no notice, no journal line and no quarantine, so the edited message's reads stayed in memory. Both routes now go through one `unavailable(oldest)` path: quarantine, stagecraft revert, notice, journal, injection refresh, persist, notify.
- The noop path (the engine had nothing to roll back) now runs `revertAppliedSince` too. A curator write applied at a boundary that consumed the edited message was proposed from the old text, whether or not the engine moved. Expansion revalidation stays off on this path on purpose: the blackboard did not move, so the basis still holds.
- The E1 notice offered one action (Re-read), while the plan and the sentence itself name two ways out. `#so-rollback-restart` ("Restart story") now sits next to `#so-reread-checkpoint` in the notice.
- **The E1 ledger test asserted an object it had built.** When the engine answered `null`, the old `engine.review.test.ts` case constructed `{ok:false, reason:"history-unavailable"}` itself and then asserted it, so it could not fail on runtime behaviour. `finding("E1")` now runs `runRollback` on a real 205-boundary engine and asserts the outcome, the notice, the journal line and the quarantine. The engine test is now a `control` for the two signals the runtime reads. `rollback.test.ts` was renamed `rollback.review.test.ts`, because the findings ledger only reads `*.review.test.ts`.
- Carried from V9: the ledger cap now trims, first, versions that no rollback can reach. Those are older versions of a key below the engine's history floor, other than the key's at-floor value. `capLedger(entries, keyCap, rowCap, floorMessageId)` gets the floor from a new `historyFloor` coordinator dep, wired by the manager to `engine.historyFrom().messageId`. With no floor, the order is the same as before.

**Measured, not guessed**: the persisted engine history at the full horizon (200 boundaries of the shipped sun-ruins story, one delta per boundary) is **201,165 bytes**. `src/engine/historySize.test.ts` holds it under a 400 KB budget, with a control showing a short history is under a tenth of that.

- Census: new row `rollback.ts#runRollback.unavailable` (partial, for the same reason as `runRollback`). 109 rows, 0 todo.
- Mutations: 8 of 8 caught (`test/findings/mutations/V11-rollback-horizon.txt`). M1–M5 cover the rollback paths, M6/M7 the ledger floor, and M8 (the restart button removed) is caught by Storybook `EditTooFarBack`.
- Machine: typecheck 0, typecheck:test 0, lint 0, jest 163 / 2604, build 0 (bundle `2d6877bd88d2`), test:release 10/10, test-storybook:ci 31 / 182, debug:typecheck 0.
- **Live** (pod `pmt6t0v9h5dvap` via tunnel, group `1759606632088`): `so-journey run j6-mutation-storm --only J6.9 --strict`, **pass twice**. Each run committed 205 boundaries and edited message 0. The engine reported `oldest {boundary 6, messageId 1}`, the notice rendered, both buttons were present, and `hit-test` confirms `#so-rollback-restart` is clickable by a pointer. The exit code is 1 only because `--only` under `--strict` counts the seven skipped checks. Records: `run1/run2.{log,json}`. **Live mutation** (restart not wired in `DrawerTabs`) → **FAIL** at `#so-rollback-restart: not present in the DOM` (`live-mutation-no-restart-wired.log`). Run-header diff: only the rebuild's `builtAt`/`fileSha256`.
- **Fixture defect found**: J6.9 inherited its story from J6.1, so `--only J6.9` failed with `getEngineState()` null. It now imports its own story and sends one message, per the "every check imports the story it needs" rule.
- Not live, stated: the missing-snapshot route (the boundary exists, its snapshot does not). The live run reaches the `boundary === null` route, because the harness cannot corrupt one retained snapshot. The missing-snapshot route is covered by jest + M1. The ledger floor trim is jest + M6/M7 only.
