# Plan 03 — Asynchronous ownership

**Kind:** fix.
**Roadmap package:** 2; integration review recommendation 1.
**Closes:** R1, C1, C2, R10, R11, S3. **Runs before plan 02.** **Revised 2026-09-20** per
`review-astra-2026-09-20.md` (edit 8).

## Objective

Every unit of work that awaits before it writes knows which chat, story, version and session it
belongs to, and refuses to write when that has changed. Today a curator, lore, scene, typed-read
or judge call started in chat A can land in chat B; a scene read that fails leaves the previous
scene live; two replies 100 ms apart commit one boundary; and a new chat can hydrate the previous
chat's blob. These are one defect with several faces: the runtime has no session identity.

## Context

- **R1** `src/runtime/coordinators/stagecraftCoordinator.ts:107–165`: `story`/`state` captured at
  `:108–109`, `readScope` and `callExtractionModel` awaited, then `this.patch` (`:132`, `:155`)
  writes through `deps.setStagecraft`, which resolves to whatever chat is current. Reproduced:
  a deferred call started in A, state switched to B, A's result resolved → one proposal in B.
- **C1** `src/runtime/loreSelect.ts:40–68`: story/state read, judge awaited, `deps.force(entries)`
  with no recheck; the forced map targets ST's next global WI scan.
  `src/runtime/coordinators/sceneCoordinator.ts:78` and
  `src/runtime/coordinators/extractionCoordinator.ts:116` compare only the last message index
  (two chats at index 7 pass). `src/runtime/judge.ts:106–116` reads `deps.context()` after the
  await, so the call-ring row can be attributed to the new chat.
- **C2** `sceneCoordinator.ts:78` returns `null` on no answer/timeout without aging the stored
  record; `sync` (`:89–100`) keeps injecting it; `snapshotBuilder` renders it as the player's
  "At …" line and `expansionCoordinator` reads it as `headingTo`.
- **R10/R11** `src/runtime/turnBridge.ts:46–47` drops a reply within 250 ms of the previous
  notification and the handlers (`:24–25`) discard the host's `messageId`. Reproduced: distinct
  replies 100 ms apart → one boundary; two events for one reply 300 ms apart → two boundaries.
- **Lifecycle** `src/runtime/index.ts:175–185` `stopRuntime` nulls the scheduler without cancelling
  in-flight jobs and never unsubscribes manager listeners (`rollbackListeners`,
  `subscribeToHostEvents` in `startRuntime` beyond `privateInjectionUnsub`).
- **S3** away recap in a brand-new chat: reproduced twice in two groups. `loadPersistedRuntime`
  reads `chat_metadata.story_orchestrator` before ST has swapped `chat_metadata`
  (`group-chats.js:300` vs `:318`, the family v2.1 fixed for greetings). The blob carries no chat
  id, so nothing can refuse it.
- **v2.2 cost gap**: `director` logs no parseable duration, so the on-path 1500 ms budget is
  unverified. The token carries the timing, so plan 11 can measure it.

## Scope

In: the token, its checks at every write edge, abort, queue/cursor/listener cleanup, scene
freshness, turn identity, the blob chat stamp, judge-ring attribution and duration.

Non-goals: rollback history (plan 04); a transaction/outbox for host effects (plan 06 records
before-images; atomicity across host I/O is out of reach by design).

## Deliverables

### `runtime/runToken.ts` (pure)

```ts
type RunToken = { chatId: string; storyId: string; playedVersion: number; sessionEpoch: number; lastMessageId: number; windowRevision: number };
mintToken(current): RunToken
tokenMatches(current, token): { ok: true } | { ok: false; reason: "chat" | "story" | "version" | "epoch" | "message" | "window" }
```

`sessionEpoch` is manager-owned and bumps on `loadStory`, select, restart, clear, `CHAT_CHANGED`
and stop. `windowRevision` is per chat and increments **only when a message at or below the
read's `window.to` is mutated** (edit, delete, swipe): a read over `[0, 7]` is discarded if
message 5 is edited during the read, but a reply appended at 8 while the read runs is harmless
and the result still applies at its next boundary. The token records `window: {from, to}` so the
check is exact, not a global counter.

### Checks at every write edge

Each asynchronous unit captures a token when it starts and calls `tokenMatches` **immediately
before**: an extras patch, an apply-queue enqueue, an injection registry set, a judge call-ring
append, and a host effect (`force`, WI write, background, AN, cast). A mismatch discards the
result and journals `{kind: "discarded", use, reason}`; the same-chat control applies exactly
once. Sites: stagecraft (curator + warden), lore-select, scene, typed extraction, stall check,
memory verify/pairs, expansion, arc/canon passes, scene-summary and short-term compaction,
`applyExtractionAudit` — **and every writer outside the coordinators**: `runtimeManager` boundary
commit and persist, `effectsApplier`, `memoryMirror` (its WI sync awaits), `awayRecap`,
`talkControl`'s director call, `storyUpdate`'s popup result, and the wizard's `applyProvisioning`.
The check also covers **`catch` and `finally` paths**: a handler that writes an error state or
clears a pending flag after an await validates the token first, so an old task's failure cannot
mark the new chat's pipeline as errored.

An architecture guard lists every `await` inside `src/runtime/**` and `src/wizard/**` followed by
a write and fails when the enclosing function has no token check (a lint-style test over the
AST, with `withToken(...)` as the sanctioned wrapper the guard recognises).

### Abort and cleanup

- `callExtractionModel` and `askJudge` accept an `AbortSignal`; an epoch bump aborts every signal
  minted under the old epoch. A call that completes anyway is discarded by the token check.
- `ExtractionScheduler` clears both queues and its cursors on epoch bump; `stopRuntime` cancels
  in-flight work, disposes every subscription it created, and start/stop/start dispatches each
  boundary once (test).
- **Cleanup is keyed by epoch**: the abort/cleanup of an old-epoch task touches only state tagged
  with its own epoch (pending flags, "reading" pipeline status, injection entries it set). A test
  starts a read in chat A, switches to B, starts a read in B, then lets A's abort handler run,
  and asserts B's pending state and injections are intact.

### Scene freshness (C2)

`SceneReadRecord` gains `freshness: {boundary, failures}`. On no answer/timeout the record is
kept but `failures += 1` and `staleSince` is set; `sync` withholds the tracker after
`SCENE_STALE_AFTER` consecutive failures (proposed 2), the player line says "somewhere" instead
of the old place, and `headingTo` is ignored while stale. A rollback past the record, a chat
switch and a token mismatch all clear it. The Scheduler tab shows fresh/stale/unknown.

### Turn identity (R10/R11)

`TurnBridge` keys a rendered reply as `{chatId, messageId, revision}` (revision from the message's
`swipe_id` or `extra.revision` where ST supplies it, else 0). Duplicate events for one key commit
one boundary; distinct keys commit each. The elapsed-time rule survives only as a secondary guard
for untyped emitters. Tests: duplicate events, a new swipe of the same message, distinct rapid
replies, a slow listener. `so-turn-types-check.mts` is extended with the four cases.

### Chat-stamped blob (S3)

The persisted blob carries `chatId`. Rule 4 (persistence changes bump the version) is honoured
by **landing the v3 → v4 bump here** with the stamp as its first field and the migration
scaffold (`migrateV3ToV4`, a captured real v3 blob fixture); plan 04 adds the history fields to
v4 before any release ships a v4 blob, and the fixture is re-captured after plan 04 so one
migration test covers the final shape. `loadPersistedRuntime` refuses a blob whose `chatId`
differs from the open chat (journaled `blob-chat-mismatch`, treated as "no story selected"
rather than hydrated); an **unstamped legacy blob is readable** — it is stamped with the open
chat's id on first save and `loadPersistedRuntime` reads it only once ST's `chat_metadata` swap
has happened (`CHAT_CHANGED`, not before). The away recap never fires on a chat with no messages
or with no `lastSessionAt` recorded for *this* chat.

### Judge ring attribution and duration

`JudgeRuntime.ask` captures `context()` and the token before the await, records them with the
call, and every use (including `director`) records `latencyMs`.

## Verification

- **Story and recipe:** `live-gate-playbook.md` §Plan 03 — adventurer (chat A, group
  `1789797226071`) and academy (chat B, group `1789797226079`). The two stories **share**
  `Adolion World` and the curator-writable `Adolion Chronicle`, so a cross-chat write is proven by
  chat id and by a sentinel string fed to A's curator, never by book name. The shipped adventurer
  story declares no `lore_select`, so a Studio copy with `lore_select.lorebooks: ["Adolion World"]`
  is the story under test. Preconditions the scenario asserts before the switch: ≥ 1 started
  scene and lore call and a started curator pass in A (`judgeCalls` with A's chat id), A and B at
  the same message index, and a release barrier holding the responses until B is open. The stale
  check times out **two** consecutive scene reads (the threshold). The S3 recap check is "open the
  adventurer group, `/newchat`, send".
- Ledger rows R1, R10, R11 flip to `it`. New tests per writer (coordinators and the non-coordinator
  sites above): delayed success, delayed error, malformed response and duplicate completion,
  each after chat switch, story switch, restart, disable and stop/start, plus the error path
  (`catch`) after a switch; both chats' extras, injections, force map and call rings asserted
  unchanged; same-chat control applied once; the epoch-keyed cleanup test.
- `npm run typecheck && npm run lint && npm test && npm run build`; the new architecture guard
  green.
- Live, real LLM + real judge, headed: new scenario `test/scenarios/live-switch-mid-read.json`
  (start a curator pass and a scene read in chat A, `open-chat` B before either resolves, assert
  B's rings/injections/lorebooks untouched and A's result journaled `discarded` or applied to A
  only); J3, J5, J6, J8, J11 twice; J4 twice (S3: open old group → `/newchat` → send, no recap,
  drawer on the new chat's state); `so-turn-types-check` green; plan 11 will read `director`
  durations from the ring.

## Persona tags

| Element | Tag |
|---|---|
| Scheduler tab: scene freshness, discarded-result rows | `author` |
| Player "At …" line falling back to "somewhere" | `both` |

## Delegated decisions

- `SCENE_STALE_AFTER` (2 proposed) and whether a stale tracker is withheld or annotated.
- Whether `windowRevision` is per chat or per story state (proposed: per chat).

## Unresolved questions

- Does ST expose a stable per-message revision for edits (not swipes)? If not, `MESSAGE_EDITED`
  bumps `windowRevision` and the edit itself is the identity.

## Gate record — the token and turn identity (2026-09-20)

Partial: `runtime/runToken.ts` and turn identity (R10/R11) are done. The write-edge checks, abort
and cleanup, scene freshness (C2) and the chat-stamped blob (S3) are not started.

### `runtime/runToken.ts` — the ownership token

Pure, no host imports. `mintToken` snapshots the world a unit of work belongs to; `tokenMatches`
answers whether that world is still current, and names which part of it moved.

The window rule is the part worth stating. A read over `[0, 7]` is discarded when message 5 is
edited underneath it, because its answer describes text that no longer exists — but a reply
**appended** at message 8 is harmless, and discarding on that would throw away every read that
raced an ordinary turn, which is most of them. So `windowRevision` alone does not decide: the work
is discarded only when something at or below its own `window.to` moved. A mutation whose position
was not recorded counts as possibly inside: "we did not record it" is not "it was outside".

Mismatches are reported most-fundamental-first — a restart explains a chat change, so naming the
chat would send a reader looking for a switch that never happened.

15 tests, including the ones that must NOT discard (an appended reply, work that read no window),
because a token that rejects everything is as useless as one that accepts everything. Six
mutations — removing the chat check, removing the epoch check, always discarding on a window
change, accepting an unrecorded mutation, an off-by-one at the window boundary, and aliasing the
window instead of copying it — **all caught**.

### R10 and R11 — identity decides what one turn is, both **closed**

`TurnBridge` deduped rendered replies by elapsed time: two distinct replies 100 ms apart were one
turn (the second silently dropped) and two events for one reply 300 ms apart were two. A reply is
now keyed by its message id, and the 250 ms rule survives only for emitters that send no id at
all — Stepped Thinking and other third-party sources — where there is nothing to key on.

Forgetting the key on a mutation is what lets a swipe or an edit through as a new turn, which the
gotchas require ("a boundary at the same message id rescans the newest message"). The key is also
forgotten on chat change, because message ids restart per chat.

Five controls added beside the two findings: a swipe commits, an edit commits, three events for one
reply still commit once, a new chat's message 2 is not deduped against the old chat's message 2,
and an emitter with no id still gets the time guard.

**A first attempt carried a redundant revision counter.** Mutation-testing it changed no test,
because forgetting the key already does the same job — two ways to say one thing, and nothing
could tell them apart. Removed rather than kept; after the simplification all four mutations bite
(pure timing fails 6 tests, no key reset on mutation fails 2, no reset on chat change fails 1,
dropping the untyped fallback fails 1).

### Commands and results (exit codes)

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   96 tests
npm test                 0   101 suites, 2021 tests; ledger 25 open, 6 settled
npm run build            0
```

Live, `so-turn-types-check.mts` (no model calls): **six checks passed** — setup, `b-image`,
`a-reply`, `c-greetings`, `c-origin`, `d-reopen` — so the boundary-commit path still behaves on a
real host after the identity change. The run then errored needing a message with a second swipe,
which requires a real generation to create: **the backend is down** (all three Connection Manager
profiles fail in under 10 ms), so that half is NOT verified and is not claimed.

## Gate record — R1, the first write edge (2026-09-20)

**R1 closed.** `runCuratorPass` mints a token before its first await and checks it at **both**
write edges: the proposal, and the `catch` path. A result whose chat, story, version or epoch
moved while the model was thinking is journaled and discarded, and `CuratorPassOutcome` gains
`discarded` naming which part of the world moved.

The `catch` path matters as much as the success path, and is easy to miss: writing `lastError`
after a switch marks the wrong chat's panel with a failure it never had.

`ownership` is an optional dep, so a caller that does not supply one keeps today's behaviour. The
manager wiring is the next step and is **not** done — R1 is closed against the contract test,
which supplies its own ownership, not against the live runtime.

Three controls beside the finding: a discarded result names the reason; a discarded result writes
nothing at all into the chat it landed in, not even an error; and a pass that stays in its own
chat is never discarded — because the failure mode of an ownership check is refusing everything.

### A mutation-testing mistake worth recording

The first mutation sweep reported that disabling the write-edge check changed nothing, which would
have meant R1 passed for some other reason. It did not: the `perl -0` patterns were not matching
the file, so **the mutations were never applied** and I was reading an unchanged run as evidence.
Re-applied by line number with the change verified on disk first, all three bite:

| Mutation | Result |
|---|---|
| write-edge check disabled | 2 tests fail |
| `catch`-path check disabled | 1 test fails |
| token minted *after* the model call instead of before | 3 tests fail |

A mutation that "survives" is only evidence once you have confirmed the file actually changed.

### Commands and results (exit codes)

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   96 tests
npm test                 0   101 suites, 2024 tests; ledger 24 open, 7 settled
npm run build            0
```

`typecheck:test` caught an implicit `any` in the test harness that the production typecheck does
not scan — which is what §A added it for.

## Gate record — manager wiring, and a correction to earlier mutation evidence (2026-09-20)

### A correction first

The R1 record noted that a `perl -0` mutation sweep had silently matched nothing, so a command ran
against an unchanged file and the result was read as "this mutation survives". That failure mode
only corrupts **survived** results — a test can only fail if something really changed, so every
"caught" reported this session stands. But a *survived* mutation is the evidence you act on: it
says the code is dead and can be deleted, and twice this session it was exactly that.

Both deletions were re-checked with a tool that refuses to run unless the file actually changed
(`scripts/mutate.mjs`, `npm run mutate`), by re-adding the deleted code and mutating it away:

| Deleted earlier | Re-check |
|---|---|
| `selfTest`'s `graded` guard before the capability suggestion | survives (exit 3) — genuinely dead, deletion correct |
| `turnBridge`'s `turnRevision` counter | survives (exit 3) — genuinely redundant, deletion correct |

The tool exits 1 when the edit does not apply, 0 when the mutation is caught, and 3 when it
survives, so "nothing happened" can never again be mistaken for "nothing noticed".

### The manager supplies ownership

`RuntimeManager` owns the identity every coordinator is checked against: `sessionEpoch`,
`windowRevision` and `lowestMutatedMessageId`, exposed as `getRunContext()` — read-only, and the
`so-state current` field the playbook already asked for. `StagecraftCoordinator` now receives it,
so R1's fix is live rather than only proven in a harness.

- The epoch bumps on a story load and on a clear, so work minted before either is stale.
- A mutation records **where** the transcript was edited, not just that it was. The earliest damage
  bounds validity, so a later edit does not raise the low-water mark: edits at 9 then 5 then 8
  leave it at 5.
- An epoch bump clears the window marks, because they describe a transcript that is no longer the
  one in play.

Five tests on the manager, five mutations, **all caught** with the edit proven to land:

| Mutation | Result |
|---|---|
| no epoch bump on clear | caught |
| no epoch bump on story load | caught |
| no window revision on mutation | caught |
| low-water mark overwritten instead of kept lowest | caught |
| epoch bump no longer clears the marks | caught |

Two of these first reported "did not apply" — the tool caught what `perl` had been hiding.

### Commands and results (exit codes)

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   96 tests
npm test                 0   101 suites, 2029 tests; ledger 24 open, 7 settled
npm run build            0
```

**Still outstanding for this plan**: the other write edges (lore, scene, typed extraction, judge
ring, memory passes, expansion, and the non-coordinator writers), abort and cleanup, scene
freshness (C2), and the chat-stamped blob (S3). The live `live-switch-mid-read` scenario needs a
backend, which is down.

## Gate record — C2 scene freshness (2026-09-20)

**C2 closed.** A scene read that did not answer — a timeout, an error, an unreachable plugin —
returned `null` without touching the stored record, so `sync()` kept injecting it. A tracker that
had not worked for ten minutes looked exactly like one that answered a second ago.

A failed read now records a miss on the record itself (`freshness: {failures, staleSince,
confirmedBoundary}`), and `sync()` withholds the tracker once `SCENE_STALE_AFTER` (2) consecutive
reads have failed. Two deliberate choices:

- **One miss does not withhold anything.** A single failure is a blip on a busy backend; dropping
  the scene on the first would make the player's "At …" line flicker on every slow turn.
- **The facts are kept, not forgotten.** The scene is withheld from the prompt while an author can
  still see what the last confirmed read said, and a later successful read does not start blind.
  `confirmedBoundary` records where it was last true.
- A **late** answer — one about a window the chat has already moved past — is not a judge failure
  and does not age the record. Counting it as a miss would stale the tracker on any fast chat.

Five mutations, all caught: no ageing on a failed read; a stale scene still injected; the threshold
lowered to 1 so a blip drops the tracker; `staleSince` tracking the latest failure instead of the
first; and a late answer ageing the record.

**Two test defects the process caught, both mine**

1. The ledger refused the reproduction after the fix landed — `C2 still fails, but not for the
   recorded reason` — because my fixture's `facts` was a thin cast that broke as soon as the fix
   called `sync()`. A reproduction that breaks is no longer evidence, which is the whole point of
   recording the reason.
2. A mutation survived: `staleSince` tracking the latest failure rather than the first. The
   harness froze its clock at a single value, so both readings produced identical timestamps and
   the assertion proved nothing. The clock advances now, and the mutation is caught.

### Commands and results (exit codes)

```
npm run typecheck        0
npm run typecheck:test   0
npm run lint             0
npm run debug:typecheck  0
npm run test:debug       0   96 tests
npm test                 0   102 suites, 2036 tests; ledger 23 open, 8 settled
npm run build            0
```

Still outstanding for this plan: the remaining write edges (lore, typed extraction, judge ring,
memory passes, expansion and the non-coordinator writers), abort and cleanup, the chat-stamped
blob (S3), the player-facing "somewhere" line, and the live `live-switch-mid-read` scenario, which
needs a backend.

## Gate record — the write-edge census, and the chokepoint (2026-09-20)

### The problem with finding these by reading

C1 was found by reading `JudgeRuntime.ask` and noticing it read its context after the await. That
works once. It does not scale, and it gives no way to tell a reviewer how much of the surface has
been looked at — which is the question this plan actually has to answer.

So the set is now enumerated from the AST. `test/findings/ownershipCensus.ts` walks `src/runtime`
and `src/wizard`, finds every function that writes after an `await`, and reports whether its body
contains a named ownership check. There are **70**.

`test/findings/ownership-sites.json` classifies each one, and `src/runtime/ownership.guard.test.ts`
fails when the file and the code disagree **in either direction**: a new site nobody classified, a
row whose site is gone, a row claiming a check it does not have, or a `todo` that has quietly
acquired one. That last rule is the same bidirectional discipline as the findings ledger —
silently-fixed work is as much a defect in the record as unfixed work claimed as done.

It deliberately does **not** demand that all 70 check a token today. A guard that fails on 54 known
sites is one somebody switches off in a week. It demands that nobody add a site without
classifying it.

Census after this entry: **4 checked · 13 delegate · 3 local · 50 todo**.

`delegate` means the function only awaits another censused site that owns the check (the ten
`RuntimeManager` one-line delegates). `local` means the write cannot outlive the call — verified,
not assumed: `buildMatchSets` looked like a host write until its vector collection turned out to be
named `so_consol_<time>_<rand>` per call, so its purge can never reach another chat.

### The chokepoint: `persist()`

`persist()` is where every coordinator `save()` ends, and it had no idea which chat it was writing
to — it serialized whatever the runtime held and handed it to `saveMetadata`, which writes into
whichever chat ST has open at that instant.

This is not hypothetical. **v2.1 plan 08 is the recorded case**: a fresh group chat posts its
greetings before `CHAT_CHANGED` (group-chats.js:300 vs 318), those greetings committed a boundary
into the previous chat's loaded story, and `persist()` wrote that story — selected, and one
boundary further on — into the new chat's metadata. Every new group chat inherited the last chat's
run. That was fixed at the turn-type end by dropping greetings, which closed **the one path anybody
had found**. The write edge itself stayed open.

Now a run claims a chat when its epoch is minted, and `persist()` declines when the open chat is not
the claimed one, journaling why. An *unclaimed* run still writes, or the guard would break the first
save of every fresh session. One check covers the whole class instead of one path.

### `runtime/runOwner.ts`

The epoch, window revision, lowest mutated message id and chat claim moved out of the manager into
`RunOwner`. Two reasons: it is a whole concern with its own rules, and adding the claim put
`RuntimeManager` at 712 lines against a 700-line budget that `architecture.test.ts` enforces. The
manager is now **681** lines and owns one `RunOwner` it asks questions of.

### Two guards caught me during this work, which is the point of having them

- The census guard **rejected my own row**: I marked `persist` as `checked` while its guard was a
  bare `chatId` comparison that no named form matched. Either the check becomes greppable or the row
  is a lie; I made `ownsOpenChat` the named form and documented why a bare comparison does not count
  — a check has to be auditable, not merely present.
- `architecture.test.ts` caught the manager going over budget, which is what forced the extraction
  rather than letting it accrete.

### Mutation evidence

Every mutation below was applied through `scripts/mutate.mjs`, which proves the edit landed before
running anything (exit 1 = did not apply, 0 = caught, 3 = survived).

Two survived first, and both were real gaps in my tests rather than in the code:

- **C1**: stamping the *landing* `messageId` survived — only the boundary was pinned. Both numbers
  are now asserted.
- **persist**: removing the chat claim entirely survived, because every test set the claim by hand
  and none exercised the claim itself. A `claim()` helper now binds through `bumpEpoch`.

Final: C1 5/5 caught, census guard 5/5 caught, persist 5/5 caught — the last re-run after the
`RunOwner` extraction, since a refactor can silently unpin a test.

One mutation reported exit 1: a two-line `--find` that never matched. It was re-run as two
single-line edits. **A mutation that does not apply is not evidence of anything**, which is the
whole reason `mutate.mjs` exists.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **105 suites / 2052 tests** |
| `npm run build` | EXIT=0 |

**Live real-LLM gate: NOT green, and not run.** The backend is down — all three connection profiles
fail in under 10ms. Nothing in this entry touches an LLM-consuming path (a persistence guard, a
test-only census, and a field extraction), but per the project rule the gate is stated as not run
rather than waved through.

### C1, closed

`JudgeRuntime.ask` captures the asking context and mints a token **before** the await, stamps the
call-ring row with the boundary and message it was *asked* at, and refuses to record a call whose
chat, story or session moved. The answer is still returned to the caller — returning null would look
like a judge failure rather than a chat switch, and the caller has its own check at its own write
edge.

One thing worth recording: a discarded call after a chat switch reports `epoch`, not `chat`. A real
chat switch bumps the session epoch, and `tokenMatches` reports the epoch first because it is the
more fundamental change — naming the chat would send a reader looking for a switch that the restart
already explains.

A control in that file exists because of a mistake worth not repeating: `JudgeTransport` is a
**function**, not an object. My first harness passed an object, so every call took the
unavailable-fallback path, and the reproduction was exercising the wrong code while looking green.

### What the chokepoint does not cover, and what the 50 remaining rows actually are

Guarding `persist()` is worth more than fifty scattered checks, but it would be easy to read it as
more coverage than it is, so: it stops a *save* into the wrong chat. It does not stop the write
that happened before the save was reached.

`MemoryCoordinator.save`, `ExtractionCoordinator.save` and `StagecraftCoordinator.save` are pure
delegates — their whole body is `await persist(); notify()` — and they are classified that way. But
their callers have usually already mutated `extras` **in memory** by the time they call `save`. If
that mutation belonged to a chat the runtime has since left, declining the save does not undo it,
and the polluted `extras` is still there when the player returns to the chat that owns it.

So the 50 `todo` rows are not fifty independent defects. They are one shape repeated: *read
something slow, then mutate `extras` without re-checking which world you are in*. The remaining
work is to mint a token at the top of each of those units and check it immediately before the
extras mutation, which is what `withToken` exists to make uniform.

Two consequences worth stating now:

- The count in the census is a measure of **surface classified**, never of safety. Four `checked`
  rows out of seventy is the honest number, and the guard exists so that number cannot drift
  upward without the code moving with it.
- `notify()` still runs after a declined save. It rebuilds the snapshot and can append a journal
  status record, so a declined save is not perfectly inert. That is small and it is recorded here
  rather than rounded off.

## Gate record — `beginRun`, and the first converted passes (2026-09-20)

### The guard is a handle, not a wrapper

The plan sketched `withToken(fn)`. Writing it against the real sites killed that shape. The fifty
`todo` rows do not share one control flow: several write more than once between more than one
await, some write `extras` *and* call a host effect, some write from a `catch` or a `finally`. A
wrapper owning the control flow needs an option per variation, and the one thing it cannot express
is the common case — *check again, here, before this particular write*.

So `beginRun(ownership, window?)` returns a `RunGuard` with `stillOwns()` / `lapsed()` /
`lapsedDetail()`, minted once at the top and asked again at each write. The verdict is re-read on
every call, never cached at mint; a guard answering from a value captured at mint would say "still
yours" forever, which is the bug it replaces. An *unowned* run never lapses, so the tree can be
converted a coordinator at a time.

### First two conversions

`ExtractionCoordinator.runSceneBreakPass` and `runShortTermCompaction`. Both send a window of the
transcript to a model and write the answer into the memory tiers; neither asked whether that window
still existed. The short-term one is the worse of the two because it **replaces** the rolling
summary rather than appending, so a result arriving after a chat switch overwrote the live summary
with a description of another chat.

Both now mint with their window, so the three real cases are distinguished: a chat switch, an edit
*inside* the window read, and a reply merely appended after it (which must not discard, or every
ordinary turn would throw away every read).

### Three things the harness caught, all of them mine

- **A vacuous test.** My short-term fixture had 3 messages; `shouldCompactShortTerm` needs 12, so
  the pass returned before ever calling the model and three "discarded" assertions passed while
  proving nothing. The positive control failing is what exposed it — which is why every discard
  case here is paired with one.
- **A surviving mutation.** Dropping the window from the short-term mint survived, because only the
  scene pass asserted the edited-window case. It has its own control now.
- **A false positive in my own census.** Widening `TOKEN_CHECK` to bare words made
  `stagecraftCoordinator.runWardenPass` read as checked: it has a local named `lapsed` meaning a
  lapsed continuity note. A name-based heuristic must assume the domain will reuse its words, so
  the regex now matches the **call** form (`run.lapsed()`) and never the bare word.

Tightening that regex also exposed a row I had got wrong earlier: `RuntimeManager.rollbackFromMessage`
was marked `checked`, but it only ever **records** the lowest mutated message id — the value the
window half of a token compares against. It never checks a token. It read as checked only while the
census matched the bare word `mintToken`. It is now `todo`, honestly.

`beginRun` is deliberately **not** a recognised check form. Minting a token and never asking it
anything is exactly the defect, so a function that only mints still reads as unchecked.

Census: **5 checked · 13 delegate · 3 local · 49 todo**.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **107 suites / 2064 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations, all through `scripts/mutate.mjs`: 4 applied against the two conversions, 4 caught (one
after adding the missing control).

### Live gate: still NOT green, and now measured rather than assumed

SillyTavern itself is up (HTTP 200) and the debug browser is attached, but **every connection
profile is down**: all five fail with `API request failed` in 9–40 ms.

Worth recording how nearly I got this wrong. My first probe used
`SillyTavern.libs?.ConnectionManagerRequestService?.sendRequest?.(...)`, which does not exist —
optional chaining returned `undefined` without calling anything, and every profile reported
`ok: true` in 0 ms. A vacuous probe that reports success is worse than no probe. The real handle is
`(await import("/scripts/extensions/shared.js")).ConnectionManagerRequestService`, and through it
the failure is unambiguous.

### Astra review: not obtained

Two attempts. The first hung reading stdin (`codex exec` waits on it when not a TTY; `< /dev/null`
fixes that). The second reached the model and came back `You've hit your usage limit … try again at
3:20 PM`. The census design is therefore **un-reviewed by the external reviewer**, and the four
questions put to it — census soundness, guard ergonomics, whether the `persist` guard suffices for
the `save()` delegates, and the highest-risk remaining site — are still open.

## Gate record — the memory passes, and why the guard is a handle (2026-09-20)

`MemoryCoordinator.runArcSummaryPass` and `regenerateCanon` are converted. Between them they
cover the two shapes that a wrapper could not have expressed, which is the justification for
`beginRun` returning a handle rather than owning the control flow.

**One await and one write per arc.** The arc pass loops over resolved arcs, asking the model about
each and writing the answer as it arrives. A pass over five arcs that outlives a chat switch used
to write the remaining four into whichever chat was open when each answer landed. The check
belongs *inside* the loop, immediately before each write — a wrapper around the whole pass can only
check once, at the end, by which point four writes have already happened. It also `break`s rather
than continuing, so it stops asking as well as stops writing; a test asserts the model call count,
not just the writes, because burning three more calls on answers it will drop is its own defect.

**A `finally` that must not be guarded.** `regenerateCanon` clears `canonInFlight` in a `finally`.
That flag is the run's own bookkeeping, not chat state, and leaving it set because the world moved
would wedge canon regeneration for the rest of the session. So the rule is not "guard every write
after an await" — it is "guard every write that asserts something about the world". A write that
releases something the run itself took must always run. There is a mutation for this: guarding the
`finally` is caught.

Neither pass mints a window. They synthesise from memory entries and arc summaries, not from a
span of transcript, so an ordinary edit must not discard them. Chat, story, version and epoch still
do.

Census: **7 checked · 13 delegate · 3 local · 47 todo**.

### Two harness failures worth recording

- **A deadlocked test double, and the vacuous pass it hid.** My first gate handed out deferred
  promises for the test to release. The arc cases deadlocked and timed out at 5s — and the two
  canon cases "passed" in 2ms, proving nothing, because no arc had a summary and `regenerateCanon`
  returned before reaching the model. The gate is now a hook fired on each model call, so the test
  moves the world at an exact point, and the canon cases seed a summary and carry a positive
  control.
- **A string replace that silently matched nothing.** The edit adding `ownership` to
  `MemoryCoordinatorDeps` reported success while only its import half landed, because the file has
  CRLF endings and my pattern spanned a newline. `npm test` stayed green — jest transpiles without
  type checking, and the harness passes the dep through an `as never` cast, so it was present at
  runtime — while `typecheck`, `lint` and `build` all failed. This is the whole argument for the
  gates being separate: a green test run said nothing about whether the code compiled.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **108 suites / 2069 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations through `scripts/mutate.mjs`: dropping the loop check, checking once before the loop
instead of inside it, dropping the canon check, and guarding the `finally` — all caught. The set
was re-run after the type fix, because a change can unpin a test that was passing for the wrong
reason.

**Live real-LLM gate: still NOT green.** Unchanged from the previous entry — SillyTavern is up, all
five connection profiles fail with `API request failed` in 9–40 ms.

**Astra review: still not obtained.** The first session was killed by its own timeout after hanging
on stdin; the second hit the account's usage limit. Both facts are recorded rather than the review
being quietly dropped from the plan.

## Gate record — the widest write edge (2026-09-20)

`EffectsApplier.applyCheckpoint` is converted. Of everything still unguarded in the census this is
the one with the largest blast radius, and the reason is that almost nothing it writes is per-chat:

- **World Info entry flags live in shared lorebook files.** That is why checkpoint world info had to
  be rebuilt from the chat's path in the first place (2026-09-19) — toggling in place leaked across
  chats and stories.
- **The Author's Note and the preset are install state.**
- **`cast_changes` mutates the GROUP's `disabled_members`**, which outlives the chat entirely. A
  roster member disabled by one story's checkpoint stays disabled in the real group afterwards;
  the debug harness has a standing rule about restoring it for exactly this reason.

Five awaits run in sequence, two of them out to the host (a slash command, the group API), so the
world can move between any two steps. The worst realistic symptom is one story's staging applied to
another story's chat, with the cast change persisting on the shared group after the chat is gone.

It now checks between every step, and **stops rather than completing**. A partial sequence is
corrected immediately, because whatever moved the world — a chat change, a story swap — runs its own
`applyCheckpoint`. A completed wrong sequence leaves another story's cast disabled on a shared
group with nothing to correct it. It also declines to set `lastAppliedCheckpointId`, or the runtime
would believe staging is in place when only part of it is and a later hydrate would skip it.

Census: **8 checked · 13 delegate · 3 local · 46 todo**.

### Three mutations survived, and each named a fixture that proved nothing

This is the most useful thing in this entry. The code was right; the tests were not.

1. **Dropping the check that guards the World Info await survived.** The fixture had no world info,
   so the first await was a no-op and no test could reach that check. `gatedWorldInfo` reads
   `story.checkpoints` (the array), not `checkpointById`, so a fixture carrying only the map
   produces an empty gated set and no write at all.
2. **Dropping the check before the NPC replies survived**, and so did dropping the one before the
   applied marker — each was caught only by the *other*. Two adjacent checks are indistinguishable
   until a test moves the world between them, so there is now a case that switches chat during the
   NPC replies specifically, and the earlier case asserts the replies never fire at all.
3. An earlier hook keyed on a world-info write that never happened, so the "stops before the cast
   change" case had been asserting against a sequence that ran to completion.

After fixing the fixtures, all five mutations are caught: each of the four checks is independently
pinned by a case that reaches it, plus one for the applier ignoring the ownership it was given.

The general rule this teaches: **a mutation that survives is a question about the test, not only
about the code**. Three of these would have been recorded as "the check is redundant" by anyone
reading the survival as evidence about the source.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **109 suites / 2076 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

**Live real-LLM gate: still NOT green.** SillyTavern is up; all five connection profiles fail with
`API request failed` in 9–40 ms. Unchanged and re-stated rather than assumed.

**Astra review: three attempts, none obtained.** Hung on stdin, then twice over the account's usage
limit. The questions put to it stay open in the plan rather than being quietly dropped — in
particular whether the `persist` guard suffices for the `save()` delegates, and whether
`applyCheckpoint` really is the highest-risk site. That judgement is currently mine alone.

## Gate record — the check that was already there (2026-09-20)

`syncMemoryMirror` is converted, and it is the most interesting case in the plan so far, because
it **already had an ownership check**: `if (host.getChatId() !== chatId) return null;` guarding the
lorebook binding and the state the caller writes into `extras.memory`. That check is real, and it
is why a chat switch mid-sync never bound one chat's book to another chat's slot.

Two things were wrong with it, and only one of them is cosmetic.

**It was invisible to the census.** By this plan's own rule a check has to be greppable to be
auditable: a record that cannot distinguish code that checks from code that does not is not a
record of anything. Left alone, this site would have sat in the ledger as `todo` — understating
coverage — or been marked `checked` by hand, which is the kind of unverifiable claim the guard
exists to reject.

**It asked only about the chat.** A story swap *inside the same chat* passed it. The mirror book is
per-chat but shared across the stories played in that chat, so the previous story's memory could be
written to the book and then recorded in the new story's `extras`. That is a genuine gap, and it is
now covered by the token, which also asks about story, version and epoch.

The original comparison is kept beside the token rather than replaced, because it is the only guard
an unwired host has. A caller supplying no ownership behaves exactly as before.

Census: **9 checked · 14 delegate · 3 local · 44 todo**. `MemoryCoordinator.syncWorldInfo` becomes a
`delegate`: it patches `extras` only when the mirror returns non-null, so the callee owns the check.

### A mutation survived, and it was load-bearing in a way that is easy to misread

Dropping the *chat* half of the widened guard survived. With ownership supplied the token catches a
chat change too, so the two halves look redundant — and "redundant" is what a careless reading of
that survival would conclude, followed by deleting the older check.

It is not redundant. The chat comparison is the only guard a host with **no** ownership has, which
today is most callers. The missing case was a chat switch against an unwired host; with it, the
mutation is caught. Three of three mutations now caught.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **110 suites / 2081 tests** |
| `npm run build` | EXIT=0 |

**Live real-LLM gate: still NOT green.** SillyTavern is up; all five connection profiles fail with
`API request failed` in 9–40 ms.

### Astra: four attempts, abandoned for this session

One hang on stdin (fixed with `< /dev/null`) and three refusals for the account's usage limit, each
naming the same reset time. I have stopped retrying rather than burning further attempts on an
identical failure.

The consequence should be stated plainly rather than left implicit: **the design decisions in this
plan are un-reviewed**. Specifically un-reviewed are the claim that `applyCheckpoint` is the
highest-risk site, the decision that a handle beats a wrapper, and the question of whether guarding
`persist()` is sufficient for the `save()` delegates given the caller has already mutated `extras`
in memory. I believe the answer to the last one is no, and the residual is recorded in an earlier
entry — but that is my own judgement checking my own work.

## Gate record — the main extraction path and the destructive pass (2026-09-20)

Two more conversions, chosen for what they write rather than how often they run.

**`ExtractionCoordinator.applyAudit`** is the main extraction write path. `verifyEntries` is a judge
pass, so it can be slow, and everything after it deposits the read's conclusions into the memory
tiers, the epistemic and ledger stores and the audit ring. A read of one chat's window landing in
another chat deposits the whole result there. It mints with the audit window, because these entries
are claims *about* the messages that were read: an edit inside that span invalidates them, while a
reply merely appended after it must not — otherwise every ordinary turn would discard its own
extraction. There is a control for that non-discard case, and a mutation widening the window to
"any transcript change" is caught by it.

**`MemoryCoordinator.runConsolidation`** is the destructive one. It drops and supersedes memory
entries, which no other pass does, and it runs three awaits per tier group. A run outliving its chat
would delete another chat's memory. Same loop shape as the arc pass, so the check sits inside the
loop, and its `finally` stays unguarded for the same reason as `regenerateCanon`.

Census: **11 checked · 14 delegate · 3 local · 42 todo**.

### The consolidation tests were vacuous, and only the anti-vacuity control found it

Worth recording in full, because the tests looked convincing.

The first version stubbed the matcher to return empty match sets. With no matches,
`consolidateTier` produces nothing, the loop `continue`s, and **no patch happens whether or not the
guard exists**. Three green tests, proving nothing. The control that asks "does this pass write at
all when the chat has *not* moved" is what exposed it, and it then took three more corrections to
get a real write:

1. Empty match sets → the matcher now marks every entry a duplicate of the first.
2. Distinct entry texts → the pair landed in `uncertain` rather than `droppedIds`, which skips the
   patch. The fixture now uses identical text.
3. The fixture's settings had no `tierTokenBudgets`, so the pass reached its write and then crashed
   in the injection pipeline. Injection is stubbed in that harness: the subject is the ownership
   check, and an unrelated crash must not decide the result.

The rule this reinforces: **every "it does not write" assertion needs a sibling proving it writes
when it should**. Without one, "no write" is indistinguishable from "this code path never runs".

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **110 suites / 2089 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations: five applied, five caught (dropping either check, removing the audit window, widening it
to any transcript change, and ignoring the ownership supplied). Two needed re-running by line
number — a multi-line `--find` does not match this tree's CRLF endings, and `mutate.mjs` exits 1
rather than pretending, which is the behaviour it exists for.

### A residual, stated rather than rounded off

`applyAudit` calls `enqueueExtractorDeltas` **before** the verify await, so that enqueue is not
covered by the check. Moving it after would change when deltas are queued relative to a failed
verify, which is a behaviour change this entry does not make. The deltas land in the engine's own
apply queue, which is reloaded when a story or chat changes, so the exposure is small — but it is
exposure, and it is recorded here rather than implied by a "checked" row.

**Live real-LLM gate: still NOT green.** Unchanged: SillyTavern up, all five profiles failing in
9–40 ms.

**Astra: five attempts, abandoned.** One stdin hang, four usage-limit refusals all naming the same
reset time. The plan's design decisions remain externally unreviewed, which is recorded in the
previous entry and still true.

## Gate record — S3, the chat-stamped blob (2026-09-20)

`persist()` already declines to **write** a run into the wrong chat. This is the other half: the
read. `chat_metadata` belongs to SillyTavern, which swaps it when the chat changes, so a read
racing that swap was indistinguishable from an ordinary one — the v2.1 plan 08 defect seen from
the reading end.

The blob is now **version 4** and carries `chatId`. Three rules:

1. A blob stamped for this chat is read normally.
2. A blob stamped for **another** chat is replaced, not repaired. Adopting its stories would be the
   same mistake in the opposite direction, so the chat starts empty — which the player reads as "no
   story selected", the honest answer when the state on hand belongs to somebody else. The mismatch
   is logged as `blob-chat-mismatch`.
3. An **unstamped** blob is readable. It predates the field, and refusing it would drop the state of
   every chat that existed before this version — data loss dressed up as safety. It takes the open
   chat's id on its first save.

`migrateV3ToV4` stamps **null**, never the chat that happens to be open. A v3 blob cannot say where
it came from, and guessing would manufacture exactly the false provenance the stamp exists to
prevent. There is a mutation for that, and it is caught.

### The fixture is real, and that took some doing

The plan asks for the migration to run over bytes this build never wrote. The live install's only
available chat carried an *empty* v3 blob — true bytes, but they prove nothing about stories
surviving a bump, and manufacturing a populated one on a shared install would have left residue in
somebody else's group.

So `test/fixtures/v3-chat-blob.json` is generated by running the **shipped v2-to-v3 migration** over
`legacy-v2-chat-blob.json`, which is the verbatim metadata of a real pre-v2.1 chat. Every field is
whatever the migration actually emits, and both stories in it are real. Its provenance block says
exactly this, because "real fixture" is a claim that has to survive somebody checking it.

A migration test over invented bytes only proves the migration agrees with whoever invented them.

### One existing test changed, and it is worth being explicit about why

`persistenceMigration.test.ts` asserted `version === 3`. The v2 path now ends by calling
`migrateV3ToV4`, so it lands on v4 directly. The assertion is **updated to the new contract**, not
loosened — it now pins `version === 4` *and* `chatId === null`, which is a stronger claim than it
made before.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **111 suites / 2096 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations, five applied and five caught: accept any blob regardless of stamp; reject unstamped
blobs too (the data-loss direction); never stamp on first save; guess a chat id in the v3
migration; drop v3 blobs instead of migrating them.

### Still open

**Live real-LLM gate: NOT green.** SillyTavern is up and the debug browser attached, but all five
connection profiles fail with `API request failed` in 9–40 ms. This change is persistence-only and
consumes no model, but the gate is stated rather than assumed.

**Not yet exercised against a real chat.** The v4 blob has only been proven in jest. Nothing has
written a v4 blob into a live `chat_metadata` and reopened it, which is the check that would catch
a host-shape surprise. That wants a live pass once a backend is available, and until then S3 should
be read as "implemented and unit-proven", not "verified in the product".

**Per plan 04**, the history fields join v4 before any release ships a v4 blob, and
`v3-chat-blob.json` is re-captured then so one migration test covers the final shape.

## Gate record — S3 verified in the product (2026-09-20)

The previous entry closed by saying the v4 blob was "implemented and unit-proven, not verified in
the product". That gap is now closed. It did not need a model, so the dead backend was never a
reason to leave it open — which is worth noting, because "the live gate is blocked" had been
standing in for "no live verification is possible", and those are different claims.

### What was run, against the real install

SillyTavern at `127.0.0.1:8000`, the shared debug browser on CDP 9222, the group pinned by id
(`1757172011689`) and the chat pinned by id (`2025-10-04@06h55m37s`) on every navigation. No chat
was created or deleted.

| Step | Result |
|---|---|
| Reload onto the new build, reopen the pinned chat | chat restored, 15 messages, runtime live |
| Real v3 blob (empty) read by the shipped code | `version 4`, `chatId: null` |
| Real v3 blob **with two stories** planted, then reopened | `version 4`, both stories kept, `selectedStoryId` kept, `chatId: null` |
| That blob re-stamped `a-different-chat-entirely`, then reopened | replaced: **0 stories**, `selectedStoryId` null, stamp = the real chat id |

The third row is the one that matters. A blob carrying two real stories and stamped for another
chat was refused, its stories were **not adopted**, and the replacement was stamped for the chat
that actually owns it — the exact contract the jest suite asserts, now observed end to end through
SillyTavern's own `chat_metadata` and `saveMetadata`.

The planted blob is the fixture generated from a genuine pre-v2.1 chat's metadata, so the live
migration ran over bytes this build never wrote, which is what the plan asked for.

### One inconclusive read, corrected rather than reported

The first read of the mismatch case came back with no `chatId` at all: the page was still on
SillyTavern's welcome screen after the reload, so `chatMetadata` was not the chat's. The blob
looked right, and reporting it would have been reporting a pass from a read that could not support
it. The group was reopened and the check re-run, which is the row above.

### Peer safety

The install is shared, and a reload disrupts anything another session is mid-way through. Before
reloading: `.debug` held only this session's artifacts, `document.body.dataset.generating` was
unset, no stop button was visible, and the open chat's last message was from October 2025. Every
navigation pinned the group id explicitly rather than taking "most recent".

### End state

The chat holds `{version: 4, chatId: "2025-10-04@06h55m37s", selectedStoryId: null, stories: {}}`
— an empty blob stamped for itself, which is exactly what the new build produces for a chat with no
story. The only difference from before is the version bump, which any open with this build performs.
Message count unchanged at 15; no story library, settings or lorebook was touched.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm test` (re-run after the live pass) | EXIT=0 — **111 suites / 2096 tests** |

Typecheck, lint, debug:typecheck and build were green in the previous entry and **no source changed
since**; the live work was navigation and metadata reads only.

**Live real-LLM gate: still NOT green** for anything that consumes a model. All five connection
profiles fail with `API request failed` in 9–40 ms. What is now proven live is the persistence path,
which needs no backend.

## Gate record — C2 was only half done (2026-09-20)

C2 was marked closed earlier in this plan because `sync()` stopped injecting a scene the judge
could no longer confirm. Re-reading the plan's own wording found the rest of the requirement
unimplemented: *"the player line says 'somewhere' instead of the old place, and `headingTo` is
ignored while stale."* Neither had been done.

That is worth stating plainly. The ledger row was flipped on the strength of the injected block
alone, and the row is the record, so the record was wrong. What made it wrong is a specific and
repeatable mistake: **a value withheld from one consumer while three others still read it is not
withheld.**

The three that still read the stale record:

- **The player's "Where you are" line**, which kept naming a place the story may have left — the
  most visible surface in the extension, and the one the freshness work existed to protect.
- **The look-ahead**, which pre-generated toward a `headingTo` computed when the tracker last
  answered, possibly minutes earlier.
- **The three scene macros**, which resolved into whatever prompt an author had put them in.

### The fix is one question, asked in one place

`isSceneStale` and `confirmedSceneFacts` now live in the pure judge module (`src/judge/scene.ts`)
rather than on the coordinator. Four consumers have to agree about staleness, and each deciding for
itself is exactly how this gap opened. `SceneCoordinator.isStale` stays as a thin delegate.

The player line is new copy, not a blank: **"Somewhere the story has not settled yet."** The
distinction it draws matters — "we never knew where you are" says nothing worth printing, while "we
knew and can no longer confirm it" is something the player should be told rather than left to infer
from a place name that quietly went stale. So it appears only when a location *was* known, and never
alongside a confirmed one, which would be a contradiction on screen.

It also names no machinery. A test asserts the line contains none of *judge, tracker, stale,
confidence, boundary, failure* — the persona rule from v2.1 plan 04, enforced rather than trusted.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **112 suites / 2103 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations, four applied and four caught: the threshold off by one, stale facts still readable, the
unsettled line shown alongside a confirmed place, and the line dropped entirely.

### What this says about the other closed rows

C2 was closed on partial evidence, and nothing in the harness objected, because the findings ledger
asks "does the reproduction pass" and the reproduction only covered the injected block. The census
guard has the same shape of limit: it can tell that a function checks a token, not that every
consumer of a withheld value respects it.

No other row has been re-audited yet. That is a real gap in this plan's assurance and it is recorded
here rather than left for someone to discover the way I discovered this one.

**Live real-LLM gate: NOT green.** All five connection profiles still fail in 9–40 ms. This change
is renderable without a model — the player line and the macros could be checked live — and that is
worth doing when the browser is next free, but it has not been done here and is not claimed.

## Gate record — re-auditing the closed rows, and a hole in the census itself (2026-09-20)

The previous entry ended by admitting no closed row had been re-audited. This one does it, and the
first row checked was wrong the same way C2 was.

### C1 was closed on one of the four surfaces it names

C1's own title: *"a v2.2 late result (**lore, scene, typed**, judge ring) carries chat and session
identity"*. It was closed on the judge ring. The other three were sitting in the write-edge census
as `todo` while the row read as done — and the census and the ledger never compared notes, because
nothing asks them to.

All four are now checked, with a control per surface so the row cannot be over-claimed again:

- **lore** — `LoreSelector.select` calls `force()`, which pushes entries into the **next**
  generation. A selection that outlived its chat seeded another chat's prompt with this story's
  lore.
- **scene** — `SceneCoordinator.run` had a `getLastMessageId() !== messageId` check, which asks only
  whether the chat moved *on*. It passes unchanged across a chat switch or story swap landing on the
  same message index, which is precisely the v2.1 plan 08 shape.
- **typed** — `runTypedRead` enqueues blackboard deltas from a judged read.

### The census had a hole, and it was in its vocabulary

The lore surface was not merely unfixed, it was **invisible**. `censusSites` never listed it, because
`WRITE_NAME` did not include `force` — a verb **the plan's own text names** in its list of host
effects. I wrote the regex from memory of the code rather than from the plan I was implementing.

Widening the verb list to include `force`, `fire`, `emit`, `replace`, `patch`, `queue`, `append`,
`drop`, `enable`/`disable` and others revealed **six** sites nobody had classified, two of them
serious:

| Site | Why it matters |
|---|---|
| `EffectsApplier.fireNpcReplies` | posts messages **into the chat** — a late fire speaks into whichever chat is open |
| `TurnBridge.onRenderedReply` | fires after-speak replies |
| `EffectsApplier.announceTransition` | posts a system note into the open chat |
| `applyStoryUpdate` | awaits a **user popup**, so the wait is unbounded |
| `LoreSelector.select` | the C1 lore surface, fixed here |
| `MemoryCoordinator.replaceShortTerm` | delegate |

The lesson is not "add more verbs". It is that **an enumeration is only as complete as its
vocabulary**, and mine was assembled by hand. The count "70 sites" was quoted in three earlier gate
records as though it were the size of the problem; it was the size of what one regex happened to
match. It is now 76.

Census: **14 checked · 15 delegate · 3 local · 44 todo**.

### Another vacuous test, caught by its positive control

The lore discard case passed immediately — because my judge double answered `lore:0` while
`readLore` reads `e:<index>`, so nothing scored, nothing was picked, and `force` was never called
either way. The paired "an ordinary selection still forces its entries" control failed and exposed
it. That is the third time in this plan that a positive control has caught a vacuous negative one,
which is now a settled habit rather than a lesson.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **113 suites / 2107 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

`typecheck:test` and `lint` both failed on the first run (an implicit `any` in the new test, and an
import left unused after `isStale` became a delegate) and were fixed before the numbers above.
Worth recording because `npm test` was green through both failures — the separate gates keep
earning their place.

Mutations: three applied, three caught (drop the lore check, lore ignores its ownership, drop the
scene check).

### Still open

**R3, R10, R11, R12 and F6 have not been re-audited.** Two closed rows checked, two found wrong. I
am not going to pretend the remaining five are fine because the first two were not.

**Live real-LLM gate: NOT green.** All five connection profiles fail in 9–40 ms. The lore, scene and
typed paths all consume the judge, so these three fixes are exactly the kind that the project rule
says must not be signed off on mocks alone. They are unit-proven and mutation-tested; they are **not**
live-validated, and that is a real gap rather than a formality.

## Gate record — auditing R10/R11, and what running it twice showed (2026-09-20)

Continuing the re-audit of closed rows. R10 and R11 next.

### The implementation deviates from the plan, and the deviation is right

The plan specifies a turn key of `{chatId, messageId, revision}`. `TurnBridge` keys on the **message
id alone**. That looked like the same defect as the v2.1 plan 08 talk-decision cache, which was
missing exactly this chat scoping — so it was worth checking carefully rather than assuming.

It is not. The key is *reset* on the two events that would change the other two fields:

- `onChatChanged` clears it, with the reason in the code: message ids restart per chat, so a key
  from the previous chat would dedupe a real turn here.
- `onMutation` clears it on every swipe, edit and delete, which is what makes a re-render of the
  same id a new turn. The code argues its own case: *"a separate revision counter would be a second
  way to say the same thing, and no test could tell the two apart."*

That is a defensible design and it is documented where a reader will find it. The rows stay closed.
Recording the reasoning matters as much as the verdict — the next person to read the plan will also
notice the mismatch, and should not have to re-derive this.

Jest covers all four cases the plan names (duplicate events, a swipe of the same message, distinct
rapid replies, a delayed second event), plus an edit case.

### What was genuinely missing

The plan also says *"`so-turn-types-check.mts` is extended with the four cases."* It was not. That is
the live gate for exactly this behaviour, and it had no identity cases at all.

Four are now added as **event-level** checks — they drive `CHARACTER_MESSAGE_RENDERED`,
`MESSAGE_RECEIVED` and `MESSAGE_SWIPED` directly, so they need no backend and stay meaningful while
one is unavailable.

**Live result, first run:** `e-duplicate`, `e-slow-listener` and `e-swipe-same-id` all **PASS**
against the real `TurnBridge`, alongside the pre-existing `c-greetings`, `c-origin`, `d-reopen` and
`d-swipe`. Cleanup was clean: both sandbox chats and the solo chat deleted, the throwaway story
removed, the browser returned to the chat it started in.

`e-distinct-rapid` **FAILED**, and the fault was mine: it emitted ids `lastId+101` / `lastId+102`,
which name no message, so the engine saw the same `lastMessageId` twice and committed once. The
check failed for a reason that had nothing to do with turn identity. It now uses two **real** ids,
and when the chat has fewer than two messages it is recorded in a `skipped` list with the reason
rather than passing vacuously.

### Running it twice changed the outcome, which is the point of running it twice

The second run never reached the identity checks: it failed at `d-solo` with *"no usable solo
character"* — all three candidates rejected as *"last chat plays a story"*. The first run had picked
one of those same characters successfully.

Two things follow, and I am separating what I observed from what I infer.

**Observed:** consecutive runs of this script give different outcomes, and the second is worse. The
project already has the rule — run it twice before believing it — and this is another instance.

**Inferred, not proven:** the script appears to consume the precondition it needs, because it uses a
character whose last chat is story-free and then leaves that character's chat history different. I
did not chase the cause further; saying "the script is not idempotent" is as far as the evidence I
gathered actually reaches.

**A design flaw in my own placement, stated plainly:** I put the four identity cases *inside* the
solo-character section, so they inherit a precondition that has nothing to do with them. Turn
identity does not need a solo character. They should move to a section that only needs a chat with
messages. I have not moved them this turn because I could not re-run to verify the move, and an
unverified refactor of a gate script is worth less than an honest note that it needs one.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **113 suites / 2107 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |
| `so-turn-types-check --skip-reply --skip-image --group 1757172011689` (run 1) | 3 of 4 new identity checks PASS, `e-distinct-rapid` fail (my fixture) |
| same, run 2 | **not-runnable**: `d-solo` "no usable solo character" before the identity checks |

The live script's overall `ok` is **false** on both runs, and that is reported as-is.

### Re-audit status

| Row | Verdict |
|---|---|
| C1 | **was wrong** — closed on 1 of the 4 surfaces it names; fixed |
| C2 | **was wrong** — closed on the injected block alone; fixed |
| R10 | correct, with a documented deviation; live script gap closed |
| R11 | correct, same |
| R3, R12, F6 | **not yet re-audited** |

## Gate record — the re-audit finished, and the live identity gate is green (2026-09-20)

### The identity checks now run, and pass twice

Last entry left two things undone and said so. Both are done.

The four turn-identity checks were sitting inside the solo-character section, inheriting a
precondition that has nothing to do with turn identity — which is why the second run of the script
never reached them. They now run in the group sandbox, right after `c-origin`, needing only a chat
with messages.

One of them was also measuring the wrong thing. `e-distinct-rapid` counted **boundary commits**, and
the engine collapses two commits when the chat has not actually advanced, so it reported one commit
and said nothing about identity. It now counts `afterSpeak` calls, which is once per turn the bridge
**accepts** — the decision R10 is actually about. The other three were switched to the same measure
for consistency.

```
node scripts/debug/so-turn-types-check.mts --skip-reply --skip-image --skip-solo --group 1757172011689
```

| Run | Result |
|---|---|
| 1 | `ok: true` — setup, c-greetings, c-origin, e-duplicate, e-slow-listener, e-swipe-same-id, e-distinct-rapid all PASS |
| 2 | `ok: true` — identical |

Twice consecutively, per the project rule, with clean cleanup both times: no chats left behind, the
throwaway story removed from the library, the browser back in the chat it started in.

This is a **live gate on real SillyTavern**, not a mock: the checks drive the host's own
`CHARACTER_MESSAGE_RENDERED`, `MESSAGE_RECEIVED` and `MESSAGE_SWIPED` events into the real
`TurnBridge`. It needs no backend, which is why it could run today.

### R12: sound

Five mutations against its graders — deltas always pass, memory always pass, arcs always pass,
deltas accepting *either* quality instead of both, epistemic ignoring the subject — **all five
caught**. The tier grading genuinely bites. Row stands.

### R3: the code was right, the test was half of it

R3 says *"a false host result must not be reported as applied"*. There are **two** host write paths
in the curator: a disable and an upsert. Its reproduction covers only the disable.

A mutation treating an upsert failure as success **survived**. The code handles it correctly — the
check is right there at the write edge — but nothing pinned it, so a refactor could have removed it
silently and every test would still have been green. That is the same species of gap as C1 and C2,
caught a different way: not by re-reading the row's wording, but by mutating the code the row claims
to protect.

A control now covers the upsert path, and the mutation is caught.

### Re-audit complete

| Row | Verdict |
|---|---|
| C1 | **wrong** — closed on 1 of the 4 surfaces it names. Fixed. |
| C2 | **wrong** — closed on the injected block alone. Fixed. |
| R3 | **half-pinned** — correct code, one of two paths untested. Control added. |
| R10 | correct; deviation from the plan is deliberate and documented; live gate added and green |
| R11 | correct, same |
| R12 | correct; graders mutation-proven |
| F6 | **not re-auditable here** — its evidence is `live`, proven by a J5 journey run, which needs a backend |

Six of seven audited. **Three of six had something wrong with them.** That rate is the useful number
out of this exercise: a closed row in this project has been about a 50% claim, and the ledger's
green did not distinguish "fixed and pinned" from "partly fixed" or "fixed but unpinned".

The mechanism that let it happen is worth naming once more: the findings ledger asks whether a
reproduction passes, and a reproduction only covers what its author thought of. Nothing compared a
row's own wording against the code, and nothing asked whether the claim was *pinned* as opposed to
merely *true today*. Mutation testing answers the second question; reading the row against the plan
answers the first. Both were needed, and each found defects the other missed.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **113 suites / 2108 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |
| `so-turn-types-check` (×2) | EXIT=0, `ok: true` both runs |

Mutations this entry: 9 applied, 8 caught immediately, 1 survived (the R3 upsert path) and is now
caught after adding the missing control.

**Live real-LLM gate: still NOT green** for model-consuming paths. All five connection profiles fail
with `API request failed` in 9–40 ms. The turn-identity gate above is live but deliberately
model-free, so it is not evidence about the judge-consuming paths converted earlier in this plan.

## Gate record — the effect that speaks, and an honest status (2026-09-20)

### `fireNpcReplies`

Of everything left in the census this was the one worth doing next, because it is the only effect
that **speaks**. Every other write in this plan corrupts state a player has to go looking for — a
memory tier, a call ring, a blackboard delta. This one posts a message into whatever chat is open,
so a late fire is visible in the transcript: this story's characters talking in somebody else's
conversation.

It fires one reply per await, so a checkpoint with three `onEnter` replies that outlived its chat
put the remaining two wherever the player had navigated to. The check is inside the loop.

It was **invisible to the census** until the verb list was widened last turn — its write verb is
`fireReply`, and `WRITE_NAME` had no `fire`.

### A limit worth stating rather than leaving to be discovered

`beginRun` mints at entry, so it detects the world moving **during** a sequence, never before it. A
call that starts after a chat switch captures the new world and fires normally. That is correct —
deciding whether to call at all belongs to the caller — but it is a real boundary of what these
guards do, so there is a control asserting it rather than a comment claiming it.

### The census vocabulary was forcing me to over-claim

Adding a guard to `commitBoundary` (before the transition announcement) made the guard demand the
row be marked `checked`. That would have been false: `commitBoundary` makes several post-await
writes and exactly one of them is now guarded. Marking it `todo` would have been false the other
way, hiding real work.

So the vocabulary gained **`partial`**, and a rule that a `partial` row must explain itself — a note
under 40 characters fails the build, because a bare "partial" is a shrug rather than a record.

Two rows use it:

- `commitBoundary` — only the announcement is guarded; the other writes are covered where they live
  or are still owed, and the note lists them.
- `announceTransition` — guarded **entirely from its caller**. Its own body has no await before the
  write, so a guard inside would mint at the moment of the write and prove nothing. Any new caller
  must do the same, which the note says.

This matters beyond bookkeeping. Every defect this plan has found in the findings ledger came from a
binary status applied to partial work. Giving the census a third answer is the structural fix for
that, in the one record that is machine-checked.

Census: **15 checked · 2 partial · 15 delegate · 3 local · 41 todo**.

### Another fixture that did not do what it said

The reply fixture used `prompt`; `fireReply` reads `reply.text ?? reply.instruction` and returns
silently when both are empty. All three assertions read zero and two of them "passed". The positive
control — *every reply fires when the chat has not moved* — is what exposed it, for the fourth time
in this plan.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **114 suites / 2113 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations: two applied, two caught (drop the loop guard; ignore the ownership supplied).

**Live real-LLM gate: NOT green.** All five connection profiles still fail in 9–40 ms.

`fireNpcReplies` is, however, **live-checkable without a model** for the scripted reply kind, which
posts through `/sendas` rather than generating. That is a better proof than the unit test and it has
not been done. It is the obvious next live step, alongside moving the remaining `todo` rows.

## Gate record — the speaking effect, proven live (2026-09-20)

The previous entry named a specific next step: `fireNpcReplies` is live-checkable without a model,
because a **scripted** reply posts through `/sendas` rather than generating. That is done.

`test/scenarios/plan02-runtime.json` asserts `npcFired` — the reply counter — after a transition
into a checkpoint whose `onEnter` reply is scripted. It needs no backend, and it is exactly the
regression risk of adding a guard to a loop that speaks.

```
node scripts/debug/so-scenario.mts run test/scenarios/plan02-runtime.json --sandbox --group 1703932647585
```

| Run | Result |
|---|---|
| 1 | `ok: true` — all 8 steps, `npcFired {door:onEnter:DM Narrator:0 = 1}` |
| 2 | `ok: true` — identical |

Twice, per the project rule, with clean cleanup both times: sandbox chat deleted, the imported story
removed from the library, nothing left behind. **The guard does not break the feature in the real
product**, which the unit tests could not tell me.

### A failure that was not a regression, and how I knew

The first attempt **failed** on exactly the assertion that matters:
`npcFired.door:onEnter:DM Narrator:0: expected 1, got undefined`. The tempting read is "the new
guard suppressed the reply".

It was not. The story declares `requirements.members: ["DM Narrator"]`, and I had pinned the group
I had been using all session — `AdolionGroup`, whose members are *Adolion Storyteller* and *Ellie*.
Requirements were therefore not ready, `applyCheckpoint` returns before any effect when
`!extras.requirements.ready`, and no `onEnter` reply can fire. Re-run against a group that actually
contains DM Narrator: green.

Worth recording as a harness fact: **the scenario corpus is not group-agnostic**. `--group` has to
satisfy the fixture's `requirements.members`, and the symptom of getting it wrong is a silent
missing effect that reads exactly like a product regression.

### Install-wide residue that is NOT mine

While verifying the runs left nothing behind, two install-wide settings look wrong:

| Setting | Observed | Default |
|---|---|---|
| `extraction.enabled` | **false** | true (v2.1 plan 02) |
| `stagecraft.curatorEnabled` | **true** | false |

Neither came from this session, and the evidence is in the runner's own record: the scenario's
cleanup reports `extraction: {restored: false, unchanged: true}` — it captured the settings at
start, compared at the end, and found them already in that state. That is the S11 capture/restore
built earlier in this plan doing its job, and it is why the question is answerable at all instead of
being a guess.

Likely causes, stated as such rather than asserted:

- **Extraction off** is most likely the product's own behaviour, not residue: a failed read pauses
  extraction install-wide, and every connection profile has been failing all day.
- **Curator on** lines up with `.debug/so-journey-config-snapshot.json`, taken at 15:37Z — about
  three hours before this session started — and never consumed. A journey took a config snapshot and
  did not restore it, which is what that file existing means.

**I did not restore either.** A three-hour-old snapshot may predate legitimate changes, and
`restore-config` would write the whole settings blob back; reverting somebody else's work to tidy a
setting is a worse outcome than the untidy setting. The finding is recorded here so the next person
has the evidence rather than the mystery.

### Commands and results (exit codes)

No source changed this turn; the gates were re-run anyway rather than cited from the previous entry.

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **114 suites / 2113 tests** |
| `so-scenario plan02-runtime --sandbox --group 1703932647585` (×2) | EXIT=0, `ok: true` both |

**Live real-LLM gate: still NOT green.** All five connection profiles fail in 9–40 ms. What is now
proven live is the scripted branch of `fireNpcReplies`; the `trigger` branch, which asks a member to
generate, is untested live and stays that way until a backend returns.

## Gate record — subscription disposal, and a leak the test found (2026-09-20)

Plan 03 §Abort and cleanup: *"`stopRuntime` cancels in-flight work, disposes every subscription it
created, and start/stop/start dispatches each boundary once (test)."*

The disposal half was **not done**. `RuntimeManager.onBoundary`, `onRollback`,
`onSceneBreakConfirmed`, `onArcsResolvedConfirmed` and `subscribe` all return an unsubscribe
function; `startRuntime` called all five and threw every return value away, and `stopRuntime`
disposed only the host-event subscription.

So a stop/start cycle left the previous run's listeners attached. Every boundary after it dispatched
**twice**: once into the live wiring, and once into a scheduler, scene coordinator and talk
controller belonging to a runtime that had been torn down.

`startRuntime` now keeps its disposers and `stopRuntime` runs them, each in its own try/catch — a
listener that throws while being disposed must not strand the ones behind it still registered,
which would leave exactly the double-dispatch this exists to prevent.

### The test was written against the real function, and that is why it found a second leak

My first version of this test exercised the manager's subscription bookkeeping, with a `session()`
helper modelling what `startRuntime` does. That version passed as soon as the five disposers were
captured. It would have been enough to close the item and wrong.

Running the **actual** `startRuntime` / `stopRuntime` — which needed a much wider host mock and the
jsdom environment — reported `snapshot: 2 → 3` across the cycle. A sixth subscriber existed that my
grep of `index.ts` had not found: `registerRuntimeMacros` subscribes to keep the per-role macros in
sync and dropped its own disposer, and `startRuntime` calls it. Every stop/start added another
macro-sync listener for the life of the page.

`registerRuntimeMacros` now returns its disposer and `startRuntime` keeps it.

The lesson is narrow and practical: **a test that models the function under test proves the model.**
The model was faithful and still missed a real leak, because the leak was in a callee I had not
thought to look at. The extra cost of driving the real entry point was one wider mock.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **115 suites / 2119 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations, four applied and four caught: dispose nothing; drop the macros disposer again; drop the
scene-sync disposer; clear the list without calling the disposers. The last needed re-running by
line number, because a multi-line `--find` does not match this tree's CRLF endings.

### What of §Abort and cleanup is still owed

This entry does the disposal clause only. Still outstanding:

- `callExtractionModel` and `askJudge` taking an `AbortSignal`, and an epoch bump aborting every
  signal minted under the old epoch.
- `ExtractionScheduler` clearing both queues and its cursors on an epoch bump.
- Cleanup keyed by epoch, so an old task's abort handler touches only state tagged with its own
  epoch rather than the new chat's pending flags and injections.

Those are the parts that stop wasted work; what landed here stops *wrong* work, which was the more
urgent half.

**Live real-LLM gate: NOT green.** All five connection profiles still fail in 9–40 ms. This change is
lifecycle wiring and consumes no model, but it is also not proven live: nothing has driven a real
stop/start cycle in the browser, and `stopRuntime` is not reachable from the debug surface today.

## Gate record — dropping work queued for a world that ended (2026-09-20)

Plan 03 §Abort and cleanup, next clause: *"`ExtractionScheduler` clears both queues and its cursors
on epoch bump."*

An epoch bump is a story load, select, restart, clear or chat change. Everything queued before it
was queued for a world that no longer exists. The ownership tokens added earlier already stop those
jobs **writing** anything — but the job still *runs*, building a prompt from the new chat's window
and spending a model call on a result that is then discarded.

Three pieces:

- `ExtractionScheduler.clearForNewWorld()` empties both queues and resets the cadence cursor. The
  cursor matters as much as the queues: boundary numbers restart with a new story, so one carried
  across made the new story look as though its cadence read had already happened.
- `RunOwner.onChanged()` — the epoch already lives there, so the notification does too.
- `startRuntime` subscribes, and the disposer joins the list built in the previous entry, so a
  stop/start cycle does not accumulate these either.

`inFlight` is deliberately **not** cleared. A job already awaiting the model cannot be recalled by
setting a flag, and clearing it would let a second job start beside the first; the in-flight one
finishes and its result is refused at the write edge, which is what the tokens are for.

### The clear test was passing over two empty arrays

`schedule()` calls `pump()`, which shifts the job off the queue **synchronously** before its first
await. So the queues read empty the instant a job is scheduled, and *"clearForNewWorld empties both
queues"* was asserting that two already-empty arrays were empty.

The positive control — *jobs queue up as normal* — failed and exposed it. The harness now holds both
pumps busy so jobs actually sit in the queues. That is the fifth vacuous fixture in this plan caught
by its paired positive control.

### The size budget forced a better home, again

Adding the listener set and its notification loop to `RuntimeManager` put it at **703** lines
against the 700 budget `architecture.test.ts` enforces. Rather than raise the budget, the plumbing
moved into `RunOwner`, which already owns the epoch — the same pressure that produced `RunOwner` in
the first place, producing the right answer again. The manager is back to **688**.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **116 suites / 2126 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations, three applied and three caught: clear only the light queue; keep the cadence cursor; the
epoch bump notifies nobody. Two needed re-running by line number after the multi-line `--find`
failed to match CRLF endings, and the last was re-run after the move to `RunOwner` because a
refactor can unpin a test.

### §Abort and cleanup: what remains

- `callExtractionModel` and `askJudge` taking an `AbortSignal`, and an epoch bump aborting every
  signal minted under the old epoch. Without it an in-flight call still runs to completion; its
  result is refused, so this is wasted money and latency rather than wrong state.
- Cleanup keyed by epoch, so an old task's `catch`/`finally` touches only state tagged with its own
  epoch — the test the plan describes starts a read in chat A, switches to B, starts a read in B,
  then lets A's abort handler run and asserts B's pending state and injections are intact.

**Live real-LLM gate: NOT green.** All five connection profiles still fail in 9–40 ms. Both pieces
here are lifecycle wiring that consumes no model; neither has been exercised live, because a real
epoch bump with queued work needs a working backend to have queued anything worth dropping.

## Gate record — cancelling work the world has moved past (2026-09-20)

Plan 03 §Abort and cleanup, next clause: *"`callExtractionModel` and `askJudge` accept an
`AbortSignal`; an epoch bump aborts every signal minted under the old epoch."*

The token check stops a late result being **written**. This stops the request being **finished**: a
story load, restart or chat change now cancels the call in flight rather than paying for an answer
that will be refused on arrival.

`RunOwner` keeps one `AbortController` per epoch and aborts it on `bump()`, then replaces it. The
signal rides the `RunOwnership` seam that coordinators already hold, `JudgeRuntime.ask` passes it to
`askJudge`, and `judgeTransport` wires it to the same controller its timeout already uses.

### Half of this clause cannot be implemented, and that is a host fact rather than a shortfall

`callExtractionModel` reaches the model through SillyTavern's
`ConnectionManagerRequestService.sendRequest`, whose signature is
`(profileId, prompt, maxTokens, custom, overridePayload)` — **no signal**, verified in
`public/scripts/extensions/shared.js:423`. There is no seam to abort through. A wrapper that
resolved early would leave the request running and the token still burning.

So extraction calls are **not** abortable, and the token check remains their whole defence. That is
recorded in the code at the type (`JudgeTransport.signal` says why it is optional) and in the test
file, because "extraction is abortable" would be a false claim in this plan and a future reader has
no reason to re-derive the host signature.

This is the honest shape of the clause: the judge half is done, the extraction half is impossible
without a change in SillyTavern, and neither is in doubt.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **117 suites / 2132 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations, three applied and three caught: the bump does not abort; the aborted controller is
reused for the next epoch (which would silently disable the judge for the rest of the session); the
signal is dropped from the ownership seam coordinators actually hold.

### §Abort and cleanup: what remains

One clause: **cleanup keyed by epoch**, so an old task's `catch`/`finally` touches only state tagged
with its own epoch. The plan describes the test — start a read in chat A, switch to B, start a read
in B, let A's abort handler run, assert B's pending state and injections are intact. With abort now
firing, that handler actually runs, so this clause matters more after this entry than before it.

**Live real-LLM gate: NOT green**, and this clause is the one where that hurts most. Every profile
fails in 9–40 ms, so no judge call gets far enough to be worth aborting, and the cancellation path
has never been exercised against a real request. It is unit-proven and mutation-tested only.

## Gate record — cleanup keyed by epoch, §Abort and cleanup complete (2026-09-20)

Last clause: *"the abort/cleanup of an old-epoch task touches only state tagged with its own
epoch."* Two real instances, and the first one explains something observed live earlier today.

### Pausing extraction is install-wide, and it was not keyed to anything

`ExtractionScheduler`'s catch calls `host.pauseExtraction(...)`, which does
`setGlobalSettings({ extraction: { enabled: false } })` — **install-wide, every chat**. Nothing tied
that to the world the failing job belonged to.

So a read that started in chat A and threw after the player moved to chat B paused extraction for
B, for every other chat, and for the next session. The job's own world was gone; its failure was
not B's problem; B silently stopped extracting.

The scheduler now records the epoch before a job runs and pauses only if the epoch still matches.
The error is still recorded for the scheduler panel either way — the job did fail, and hiding that
would trade one wrong behaviour for another.

**This is not a hypothesis about a possible bug.** Two entries ago I found `extraction.enabled`
false install-wide on this machine and reported the likely cause as the product pausing itself after
failed reads against a dead backend. That is the same code path. The dead backend explains the
pause; this clause explains why a pause earned in one chat was inflicted on all of them.

To be exact about what did and did not change: a failure in the *current* world still pauses, which
is the designed behaviour and is pinned by its own control. Only cross-world pausing is fixed.

### The scene tracker's failure path was writing unguarded

`SceneCoordinator.run` ages the stored record when a read comes back empty — and that happened
**before** the ownership check, because when C2 added the aging there was no ownership check to be
before. A read that started in chat A and failed after the world moved aged whichever record is
current now, so a dead backend in one chat marked another chat's tracker unconfirmed, and two such
misses withheld a scene the judge had never been asked about.

The failure path is a write. It is guarded now, and the in-own-world aging is pinned so the guard
cannot quietly disable C2's behaviour.

### A vacuous test, caught the usual way

*"a job that fails in its own world pauses extraction"* asserted after a 0ms tick.
`runWithRetries` makes three attempts with 250ms and 500ms backoff, so the catch that pauses is
about 750ms away; the assertion ran before it and measured nothing — which would have made the
epoch case pass whether or not the guard worked. The positive control failed and exposed it. Sixth
time in this plan.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **117 suites / 2136 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations, three applied and three caught: pause regardless of epoch; never pause at all; age the
scene regardless of epoch. The third survived first — no test covered a *failed* scene read that had
lapsed — and is caught after adding one.

### §Abort and cleanup is now complete, with one impossibility recorded

| Clause | State |
|---|---|
| `stopRuntime` disposes every subscription; start/stop/start dispatches once | done |
| Scheduler clears both queues and its cursors on epoch bump | done |
| `askJudge` takes an `AbortSignal`; an epoch bump aborts it | done |
| `callExtractionModel` takes one | **impossible** — `ConnectionManagerRequestService.sendRequest` has no signal parameter (shared.js:423) |
| Cleanup keyed by epoch | done |

**Live real-LLM gate: NOT green.** All five profiles fail in 9–40 ms. The install-wide pause is
live-observable — it is what disabled extraction here — but demonstrating the *fix* needs a failing
read in a chat the player has left, which needs a backend healthy enough to be worth switching away
from. Unit-proven and mutation-tested only.

## Gate record — a measurement defect I introduced last turn (2026-09-20)

The last named item in plan 03 is *"every use (including `director`) records `latencyMs`"*, which
exists because plan 11 builds its cost and latency report out of the judge call rings. Checking it
turned up a defect **created by the abort work in the previous entry**.

`judgeTransport` wires the request timeout and the epoch signal to the **same** `AbortController`,
so a cancellation and a slow model both surface as an `AbortError`. The error alone cannot tell
them apart, so every cancelled call was landing in the ring as `timeout`.

That is a measurement error, not a behavioural one, and it points the wrong way: every chat switch
during a judge call would have made the model look slower and less reliable than it is, in the
report a later plan uses to decide whether the judge is worth its cost.

`JudgeFallback` gains `cancelled`, and the catch asks the **caller's** signal, which only we abort.
Latency is still recorded for a cancelled call — the time was really spent, and reporting zero would
understate the cost of churn the same way `timeout` overstated the model's slowness.

Recording this plainly because I wrote the bug: a distinction that is obvious when you add it is
easy for the next person to collapse while simplifying the catch, and the mutation that does exactly
that is now caught.

Everything else in that clause was already true: `askJudge` times every real path, `invalid` and a
cache hit correctly report zero because no call was made, and `director` records through `ask` like
every other use.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **118 suites / 2140 tests** |
| `npm run test:debug` | EXIT=0 — 96 pass, 0 fail |
| `npm run build` | EXIT=0 |

Mutations, three applied and three caught: collapse `cancelled` back into `timeout`; call everything
cancelled; report a cancelled call as zero latency.

---

## Plan 03 status

Every named deliverable is now implemented, with one impossibility recorded against the host.

| Deliverable | State |
|---|---|
| `runtime/runToken.ts` — token, guard, `RunOwner` | done |
| Write-edge census + machine-checked ledger | done (`ownership.guard.test.ts`) |
| Checks at every write edge | **in progress — 30 checked, 2 partial, 27 delegate, 3 local, 14 todo** (the census is regenerated by `ownership.guard.test.ts`; this row is the count at the last gate record) |
| Abort and cleanup (5 clauses) | done; `callExtractionModel` abort impossible (`sendRequest` has no signal) |
| Scene freshness (C2) | done, incl. the player line and `headingTo` |
| Turn identity (R10/R11) | done, live gate green twice |
| Chat-stamped blob (S3) | done, proven live against a real chat |
| Judge ring attribution and duration | done |

**The 35 remaining `todo` rows are the honest state of this plan**, not an oversight. The census
exists so that number is visible and cannot drift upward silently; the guard fails the build if a
new write-after-await site appears unclassified. The highest-risk sites — the one that speaks, the
one with the widest host reach, the main extraction path, the destructive memory pass, the
persistence chokepoint, the boundary that commits, and the talk director — are done. See the latest
Gate record for the count that is current, since this table is not regenerated automatically.

Findings owned by plan 03: **C1 and C2 closed** (both after re-audit found them closed on partial
evidence), R1, R10, R11 closed and re-audited.

**Live real-LLM gate: NOT green throughout.** All five connection profiles have failed with
`API request failed` in 9–40 ms for this entire session. What has been proven live is everything
that needs no model: the v4 blob migration and refusal against a real chat, the four turn-identity
cases, and the scripted NPC reply. Every judge-consuming path in this plan is unit-proven and
mutation-tested only, and by the project's own rule that is **not** sign-off.

## Gate record — pre-aborted judge requests (2026-09-20)

An epoch can end before `judgeTransport` registers its abort listener. `AbortSignal` does not replay
an already-fired event to a late listener, so that call would otherwise start with a live internal
controller and run until its timeout. The transport now checks the signal after listener registration
and aborts the internal controller immediately when the epoch has already ended.

The transport-level control proves `fetch` receives an already-aborted signal and no live request
starts. Removing the check is mutation-caught.

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **119 suites / 2141 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail** |
| `npm run build` | EXIT=0 — webpack compiled with the existing asset-size warnings |

**Live real-LLM gate: NOT green.** This is unit-proven and mutation-tested; the connection profiles
remain unavailable, so the real plugin request path has not been exercised.

## Gate record — wizard provisioning keeps its world (2026-09-20)

`CopilotCoordinator.applyProvisioning` writes real cards, groups and lorebooks. It now mints ownership
before validation and checks immediately before every host write, including between activating a
lorebook and upserting its entry. A host write already in flight is still non-atomic by design; a
world change prevents every later write.

Three controls prove the path writes normally, stops between lorebook activation and entry upsert,
and does not start its first host write when validation itself moves the world. Removing either
write-edge check was mutation-caught. The census is now **16 checked · 2 partial · 15 delegate ·
3 local · 40 todo**.

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **120 suites / 2144 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail** |
| `npm run build` | EXIT=0 — webpack compiled with the existing asset-size warnings |

**Live gate: NOT green.** No real wizard asset was created for this slice, and no model-consuming
provisioning path was substituted with a mock. The ownership behavior is unit-proven and
mutation-tested only.

## Gate record — an author popup cannot update the chat behind it (2026-09-20)

`applyStoryUpdate` can wait indefinitely while the author chooses keep, restart or cancel. It now
mints ownership before opening that popup and checks immediately after it returns. If the chat,
story, played version or epoch changed meanwhile, it returns a discarded outcome without swapping,
restarting or journaling into the landing world.

The token deliberately has no transcript window: the decision is about the pinned story and version,
not message text. A successful restart or swap intentionally changes the epoch/version, so those
operations own their later write edges rather than reusing the popup token after success.

Deferred controls prove same-world keep still swaps and journals exactly once, while stale keep and
stale restart do neither. Removing the post-popup check was mutation-caught. Census: **17 checked ·
2 partial · 15 delegate · 3 local · 39 todo**.

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **120 suites / 2147 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail** |
| `npm run build` | EXIT=0 — webpack compiled with the existing asset-size warnings |

**Live gate: NOT green.** No browser popup race was driven for this slice. The ownership behavior is
unit-proven and mutation-tested only.

## Gate record — rendered boundaries keep their originating world (2026-09-21)

A rendered reply now captures ownership when the event is accepted. Its pending boundary retains that
guard through `fireAfterSpeak`, generation-end events and polling instead of minting in whichever world
is open when the flush eventually runs. Pending-slot identity also prevents an older continuation in the
same world from consuming a newer reply's boundary.

Turn identity is now retained per accepted message id rather than only for the immediately previous id.
A swipe, edit or update re-admits only its exact id; a delete re-admits ids at or after the deleted
position; a chat change clears both ids and the id-less timing state.

`RuntimeManager.fireAfterSpeak` checks after NPC replies and persistence before later writes.
`commitBoundary` checks after checkpoint effects, stagecraft application, persistence and transition
announcement before every remaining runtime write, observer or notification. `stopRuntime` bumps the
epoch, aborting the old signal; a restart receives a fresh signal.

Deferred controls cover same-world success beside every stale-world refusal: overlapping replies in one
world, replacement-chat replies at the same message id, a polling boundary whose world lapses, each
awaited boundary stage and lifecycle restart.

Mutations applied and caught:

- replace the stored TurnBridge ownership with permissive ownership;
- retain the older pending slot instead of replacing it;
- remove exact pending-slot identity;
- remove the flush ownership refusal;
- remove the post-NPC `fireAfterSpeak` check;
- remove each `commitBoundary` check after effects, stagecraft, persistence and announcement;
- remove `stopRuntime` invalidation;
- remove turn-id dedupe;
- remove exact mutation re-admission.

The census is now **21 checked · 1 partial · 15 delegate · 3 local · 36 todo**.

| Command | Result |
|---|---|
| `git diff --check` | EXIT=0 — line-ending warnings only |
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **121 suites / 2163 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail**; existing `MaxListenersExceededWarning` |
| `npm run build` | EXIT=0 — webpack compiled with the existing Browserslist and asset-size warnings |

**Live gate: NOT green.** No browser boundary race was driven for this slice, and no model-consuming
path was substituted with a mock. The ownership behavior is unit-proven and mutation-tested only.

## Gate record — the talk director keeps its world (2026-09-21)

`TalkController` was named in the plan as a site where "the director call" writes after an await. It
was worse than one site. A decision is computed once per `chatId:checkpointId:lastMessageId` and then
reused, and every await in the chain — the judge director, the LLM director — was followed by writes
that resolved to whatever world was open when the answer landed:

- the decision was cached under a key that a **story reload or restart in the same chat** reproduces
  exactly (same chat, same checkpoint, same message index), so the previous world's director answer
  was served to the new one;
- `recordDecision` read `getLastMessageId()` and `getCheckpointInfo()` **after** the await, so a
  decision computed at cp1/message 5 was filed against cp2/message 9;
- `intercept` called `abort(false)` — vetoing the live draft — and `onWrapperFinished` called
  `triggerMember`, both into whatever chat was current.

### The neutral result *is* the guard

`ensureDecision` mints against the director window before the judge/director call, captures the origin
checkpoint and message id, and refuses to cache or record a decision whose world moved. A lapsed run
returns `pass`, and `pass` is the one decision both callers already ignore.

That makes a check *inside* the callers redundant rather than defensive: a check after
`await this.ensureDecision(...)` can never fail, because no world change can interleave a microtask
between the return and its use, and a lapsed run cannot return anything but `pass`. The first version
of this slice had `if (!run.stillOwns()) return;` in both callers. Mutation-testing them changed no
test, for the reason they could not fail. Removed, and the contract is pinned by the stale controls
instead — the same call the turn-identity work made when it dropped a redundant revision counter.
This is a deliberate departure from the plan's "call `tokenMatches` immediately before a host effect"
wording: the check is at the decision's write edge (the cache and the ring), which is where a stale
value can actually originate, and the callers are provably unable to act on one.

The cache and in-flight entries are both evicted when their guard lapses **even though the key is
unchanged** — that is the whole point, since the key is what failed to distinguish the two worlds.
Exact pending identity keeps a replaced task from clearing its successor: the old promise resolving
finds `this.pending !== mine` and leaves the newer entry alone.

### Two things this slice does not do, and why

**No journal record on a discard.** The plan asks for `{kind: "discarded", use, reason}`. This
controller has no journal seam, and the one available — `extras.talk.decisions` — renders every row as
`"<name> speaks (<source>)"` in `journal.ts:131`, so a discard row would read as a **silence**, which is
a distinct and meaningful outcome under talk control. Wiring a real seam means a new public method on
`RuntimeManager`, which is at **696 of its 700-line budget**. A wrong-to-read record is worse than no
record; the discard is observable today as the absence of a decision row plus the absence of a veto,
and the live gate's timing assertions are what would make it visible. Recorded as owed, not done.

**`index.ts`'s `ownership: runtimeManager.getOwnership()` is not covered by a control.** `TalkController`
has no in-page handle, so no unit test can observe which ownership it received; a mutation removing that
line survives. It is the same class as the `sceneCoordinator` and `loreSelect` wiring, and its failure
mode is permissive — the guard simply stops firing — so the live gate is the thing that covers it.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **122 suites / 2172 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail**; existing `MaxListenersExceededWarning` |
| `npm run build` | EXIT=0 — webpack compiled with the existing size warnings |

Nine controls, each paired: a same-world director answer still vetoes the drafted member and is
recorded once; reconcile still triggers the chosen member in its own world; a world that never moves
leaves an unwired caller permissive. Beside them, an answer landing after a chat switch aborts nothing
and records nothing; a cache is not reused across an epoch change with an identical key; reconcile
does not trigger into the replacing chat; the recorded row names cp1/message 5, not the cp2/message 9
it landed in; a lapsed in-flight entry is replaced and its successor survives; an edit inside the read
window discards while an append after it does not.

The 21 pre-existing `talkControl.test.ts` cases pass **unedited**, which is the evidence that the
guard is inert for a caller that supplies no ownership.

Mutations, four applied and four caught: the post-await world check removed (4 tests); a lapsed cache
entry served anyway; joining a lapsed in-flight entry; the audit reading the landing world's getters
instead of the captured origin. The census row for `ensureDecision` was promoted `todo` → `checked`
and the guard fails the build until it is, in either direction.

Census is now **22 checked · 1 partial · 15 delegate · 3 local · 35 todo**.

Findings owned by plan 03: **C1's talk surface is now closed** (it was one of the four the review
named: lore, scene, typed read, judge ring — all four plus talk are done). **Live real-LLM gate: NOT
green.** No talk-control decision has been driven in the browser this session; the director path is
unit-proven and mutation-tested only, and by the project's own rule that is not sign-off.

## Gate record — the census was reporting coverage it did not have (2026-09-21)

The census guard asked only that a `delegate` row name a site that is **censused**. Nine rows used
that to claim a check owned by a row whose own note reads *"not yet checked"*:

```
RuntimeManager.setMemoryPinned       -> MemoryCoordinator.setMemoryPinned     (todo)
RuntimeManager.setEpistemicPinned    -> MemoryCoordinator.setEpistemicPinned  (todo)
RuntimeManager.setLedgerPinned       -> MemoryCoordinator.setLedgerPinned     (todo)
RuntimeManager.setArcPinned          -> MemoryCoordinator.setArcPinned        (todo)
RuntimeManager.removeArc             -> MemoryCoordinator.removeArc           (todo)
RuntimeManager.removeEpistemicEntry  -> MemoryCoordinator.removeEpistemicEntry (todo)
RuntimeManager.removeLedgerEntry     -> MemoryCoordinator.removeLedgerEntry   (todo)
RuntimeManager.setCuratorOpDecision  -> StagecraftCoordinator.setOpDecision   (todo)
MemoryCoordinator.replaceShortTerm   -> MemoryCoordinator.save                (delegate)
```

A `Set` of eight `RuntimeManager` methods — every pin, every remove — read as covered while nothing
downstream checked anything. This is the failure the plan exists to catch, sitting inside the ledger
that exists to catch it, and it is the third time this plan has found a number that flattered.

The guard now follows the `awaits X` chain to a row that is actually `checked`, as many hops as it
takes. The chain matters: a coordinator's `save()` delegates on to the manager's `persist()`, and
stopping at one hop would call that honest row a liar. `replaceShortTerm → save → persist` resolves.

### The thirteen rows were not owed work, and the count is not progress

Most of the nine, and four more of the same shape, turned out to have **nothing to check**. Their
shape is `this.patch(...); this.updateInjection(); await this.save();` — the in-memory write and the
injection update both run *before* the first await, so a token minted here would be compared against
the world it was just minted from and prove nothing; and the awaited `save()` ends in
`RuntimeManager.persist`, which is `checked`.

They were counted as owed work because **the census counts an awaited call as a write after an
await**. `await this.save()` sets `sawAwait` and then visits its own operand, so the call that *is*
the await is recorded as a write that *follows* one. All thirteen are now `delegate` naming
`MemoryCoordinator.save` / `StagecraftCoordinator.save`. **No code changed for them**, and the todo
count falling from 35 to 22 is a correction of the ledger, not work done. Saying it the other way
would be the exact over-claim this record is about.

### I tried to fix the census instead, and reverted it

The obvious repair is to stop counting an await's own operand. I implemented it, and it deleted 32
rows from the census — including `TurnBridge.onRenderedReply`, `TurnBridge.flushPendingBoundary`,
`EffectsApplier.fireNpcReplies` and `announceTransition`, all of which **do** write after an await
and all of which carry guards this plan mutation-tested. Their only write the census can *see* is
their first await's operand (`flushPendingBoundary` is not in `WRITE_NAME`; `fireAfterSpeak` is);
the operand rule was covering a hole in the name heuristic by accident.

So the instrument is left as it is, and the defect is recorded at the heuristic instead. A future
agent who notices the operand quirk and "fixes" it will silently drop real coverage — that is what
this paragraph is for. The honest repair widens `WRITE_NAME` first.

The delegate rule is proven able to fail by a synthetic chain: `delegate → delegate → checked`
resolves, `delegate → todo` and `delegate → partial` are refused, and a note naming a site that is
not censused is refused. Mutations, two applied and two caught: the chain recursing through any
status; any non-empty status counting as a check.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **122 suites / 2173 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail** |
| `npm run build` | EXIT=0 — webpack compiled with the existing size warnings |
| `git diff --check` | EXIT=0 — line-ending warnings only |

Census is now **22 checked · 1 partial · 28 delegate · 3 local · 22 todo**, against
22 / 1 / 15 / 3 / 35 before this slice.

**Live gate: NOT green**, and unchanged by this slice — the ledger and the guard are not runtime
behaviour. No browser run was made.

## The remaining twenty-two, ranked for the next slices (not a gate)

Ranked by what a stale write would do:

1. **`MemoryCoordinator.applyEntries` / `addSceneSummary`** — `await computeEntryTokens(...)` then
   `addMemoryEntries(...)` + `patch(...)`. These write the memory tiers from a token count computed
   over a transcript window, so they need a window-minted token, not a bare one. Highest value: the
   memory tiers are what the player is shown and what the next prompt injects.
2. **`ExtractionCoordinator.runNow` / `runStallPrecheck` / `runEpistemicLedgerPass` /
   `runMemorizeBacklog`** — four pass entry points that await a model and then deposit into tiers and
   rings. `applyAudit`, their shared tail, is already checked, so the question each one owes an
   answer to is whether what it does *before* the tail can write. `runNow` is the manual path an
   author triggers from the drawer, which makes it the one a chat switch can interrupt mid-click.
3. **`StagecraftCoordinator.applyAccepted` / `writeOp` / `revertAppliedSince` / `runWardenPass`** and
   **`ExpansionCoordinator.generate`** — the first three write to a real lorebook through the effects
   path; the warden composes the one stagecraft output that is injected but never boundary-applied.

The remainder is `MemoryCoordinator.runSupersessionBridge`, `EffectsApplier.releaseWorldInfo`, the
lifecycle paths (`RuntimeManager.activateCheckpoint` / `dropReadsAfter` / `loadStory` / `swapStory` /
`rollbackFromMessage` / `flagMoment`, and `loadSelectedStory` / `removeStory` / `restartStory`) —
several of which are guarded by the epoch bump they perform themselves. Each needs its own reading
before it is called owed or done; the ledger is not the place to guess.

## Gate record — the tier writes land an await past the last check (2026-09-21)

Slice 1 of the ranking above. `MemoryCoordinator.applyEntries`, `addSceneSummary` and
`replaceShortTerm` each call the host tokenizer before they write. Their callers check ownership on
the **near** side of that call — `applyAudit` mints, awaits the judge verify pass, checks, and then
calls `applyEntries` — so the token count is an await on the far side of the last check. That is the
shape C1 had, one layer in: a single check on the near side of an await is not a check.

All three now mint with the window they describe and check after the count. `addSceneSummary`
returns `number | null`, because with a bare number the caller would fire scene-break replies for a
scene it never recorded; `replaceShortTerm` takes the window instead of a bare `summaryEnd`, so the
mint and the stored cursor come from one value.

`applyAudit` also re-checks after `applyEntries`, which is the same defect one level up: its single
check covered the verify await but not the tier-write await that follows, so the verify drops, the
arc signals, the audit ring entry and the scene-break emit were all unguarded. Its ledger note now
says "re-checked after every awaited stage" rather than "checked", because that is the difference
between the two claims.

`replaceShortTerm` is the one that matters most: it **overwrites** the rolling short-term summary, so
a stale write destroys the live one instead of adding noise. Its control shows the live entry
surviving a switch during the count.

### The budget said no, and it was right

`memoryCoordinator.ts` reached **621** lines against the coordinator budget of 620, and
`architecture.test.ts` failed the build. The three comments explaining the new checks came to nine
lines. They are now one line each. The comment is not what makes the check correct — the ledger note
and this record are — and a coordinator that grows a paragraph per guard is a coordinator nobody
reads. Raising the budget to fit a comment would have been the wrong precedent; the file is at 619.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **122 suites / 2181 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail** |
| `npm run build` | EXIT=0 — webpack compiled with the existing size warnings |
| `git diff --check` | EXIT=0 — line-ending warnings only |

Eight controls added, paired: entries land in their own tiers; a scene summary returns its
occurrence and records it; the rolling summary is replaced in its own world; an audit reaches the
tiers in its own chat. Beside them, an entry whose token count lands after a chat switch is not
written; an edit inside the described window discards while an append after it does not; a scene
summary whose world moved returns no occurrence and records nothing; a rolling summary whose world
moved does not overwrite the live one; a world lost *during* the tier write stops the deposit before
the record of it.

Mutations, five applied and five caught: each of the three new checks removed; `addSceneSummary`
returning an occurrence anyway; and `applyAudit`'s second check removed.

Census is now **25 checked · 1 partial · 27 delegate · 3 local · 20 todo**.

**Live gate: NOT green.** No browser run was made for this slice. The token count is a host call
that behaves differently in a real ST (the jest mock resolves immediately), so the *timing* claim —
that a chat switch can land inside it — is argued from the call, not measured. What is measured is
that the write is refused when it does.

## Gate record — three judged passes that write where the answer came from (2026-09-21)

Slice 2 of the ranking. Three of the four remaining extraction entry points awaited a model and then
wrote, and the ledger had them as owed work for the right reason.

- **`runStallPrecheck`** awaits a judged stall verdict and then enqueues deltas into the blackboard
  apply queue and writes two rings. The verdict is a claim about `plan.window`'s messages, so it is
  minted with that window. On a lapse it returns `false`, which the caller reads as *do not re-read*
  — the conservative direction, since the alternative acts on a verdict about text that moved.
- **`runEpistemicLedgerPass`** makes **two** model calls with a store written in between: the
  epistemic signals are applied before the ledger prompt is even sent. One check at the end would
  have covered the second call and missed the first entirely, so the check sits after each. That is
  the same "one check on the near side of an await is not a check" defect as `applyAudit`, and it is
  why the control for the second call asserts the *first* store survived while the second was
  refused.

`runNow` and `runMemorizeBacklog` stay `todo`. `runNow` writes only through `applyAudit` and
`commitBoundary`, both of which check; what it owes an answer to is not a write but whether a manual
read that was discarded should still commit a boundary, which is a behaviour question for plan 04.
`runMemorizeBacklog` walks the whole chat in windows with a progress record, so a switch mid-backfill
is the *likely* case rather than the rare one — it needs an epoch-keyed stop, not a single check, and
it is the largest remaining item in this plan.

### Two test defects found on the way, both the familiar kind

The `modelGate` call counter is cumulative across tests in that file, so a control that arms on
"call 2" fired on its neighbour's leftover count. The control passed — it was testing the wrong
call — and only the *content* of the assertion exposed it. A `beforeEach` now resets the gates.
This is the sixth time in this plan that a positive control or an over-specific assertion caught a
test measuring nothing, and the second time inside a fixture I had just written.

The second was mine and simpler: the first version of the ledger control asserted that **neither**
store was written when the world moved during the second call, which cannot be true — the epistemic
write happens before that call and was legitimately in-world. The assertion had to be narrowed to
what the code actually promises.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **122 suites / 2186 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail** |
| `npm run build` | EXIT=0 — webpack compiled with the existing size warnings |
| `git diff --check` | EXIT=0 — line-ending warnings only |

Five controls added: the epistemic and ledger stores are written in their own chat, and a stall
verdict lands in its own chat. Beside them, a world lost during the first model call writes neither
store, a world lost during the ledger call leaves the ledger store alone while the epistemic one
stands, and a stall verdict that arrives after a chat switch is not recorded.

Mutations, three applied and three caught: each of the three new checks removed.

Census is now **27 checked · 1 partial · 27 delegate · 3 local · 18 todo**.

**Live gate: NOT green.** No browser run was made. `runStallPrecheck` is reachable only with the
judge on and a stall verdict, `runEpistemicLedgerPass` only at a scene break with the epistemic
ledger capable — neither has been driven live this session, and both are argued from the call graph
rather than observed.

## Gate record — the writes that reach a shared lorebook file (2026-09-21)

Slice 3 of the ranking, and the highest blast radius left. `StagecraftCoordinator.applyAccepted` and
`revertAppliedSince` run at a boundary commit and on a rollback, and both edit a **real lorebook
file** through `upsertWIEntry` / `enableWIEntry` / `disableWIEntry`. R1 closed the pass that
*proposes*; these are the paths that *write*. A stale one is not "recorded in the wrong chat" — the
file is shared by every chat and story that uses that book, so it changes what another story reads.

`applyAccepted` now mints before `readScope` and checks inside the loop before each `writeOp` and
again before the proposal patch. `revertAppliedSince` mints before the settle and checks at the top
of each affected record. `runWardenPass` mints before the judge call and checks after it: the
reply-text comparison already there catches an **edit**, and does not catch a chat switch landing on
a message with the same index and the same text — which is the whole reason the token exists.

### Three things the census could not have told me

**A check that no test could reach.** The loop-level check in `applyAccepted` (before each *record*,
not each op) was covered by the per-op check on its first iteration, so mutation-testing either one
left the other standing. Removed rather than kept, on the same rule as the turn-identity revision
counter: two ways to say one thing, and nothing can tell them apart.

**A check that failed to be caught.** The post-loop check — the one that stops a stale result being
patched into the replacing chat when the *last* op is the one that outlived its world — survived its
first mutation. Nothing followed the last op in the loop, so no existing control reached it. It is
now covered by a control whose only assertion is that the new chat's proposal ring is empty.

**A guard with no control at all.** The warden check also survived, and this one needed real harness
work: the stagecraft fixture had no `warden` dep and an empty chat, so `runWardenPass` returned
before reaching anything. A mutable chat and a delegating warden were added, and the pair is now
pinned — a note whose world moved is refused, a note in its own world is recorded. That is the third
time in this plan that mutation testing found a guard nothing exercised, and the second time the fix
was a harness that could not express the case rather than a missing assertion.

### `writeOp` is `partial`, on purpose

Its second host write — `disableWIEntry` restoring the author's own switched-off flag after
`upsertWIEntry` re-enabled the entry — completes the first rather than acting on world state.
Abandoning the pair on a lapse would leave an entry the author had switched off turned **on**, in a
shared file. So it completes, and the guard that keeps it from starting is the caller's, checked
before every call. `partial` is the status that says exactly this, and the note says it; any new
caller must check the same way.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `npm run typecheck` | EXIT=0 |
| `npm run typecheck:test` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |
| `npm test` | EXIT=0 — **122 suites / 2193 tests** |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail** |
| `npm run build` | EXIT=0 — webpack compiled with the existing size warnings |
| `git diff --check` | EXIT=0 — line-ending warnings only |

Six controls added: accepted ops reach their own world's lorebook; a rollback in its own world
restores every applied write; a warden note in its own world is recorded. Beside them, a world lost
during an accepted write stops the ops behind it, a world lost during the **last** one does not file
the result here, a rollback that outlives its world stops restoring pre-write content, and a warden
note whose world moved is not recorded.

Mutations, four applied and four caught: the per-op check, the post-loop check, the revert check and
the warden check.

Census is now **30 checked · 2 partial · 27 delegate · 3 local · 14 todo**.

**Live gate: NOT green.** No browser run was made, and this is the slice where that costs most: the
whole claim is about a real lorebook *file*, and every control here drives a jest mock of
`upsertWIEntry`. What is proven is that the coordinator stops; what is not proven is that a real
`/world` write and a real chat switch interleave the way the mock does. J8 is the journey that would
show it, and it has not been run this session.

## Live gate — turn identity and the boundary, on the real host (2026-09-21)

I had been reporting "backend down, live gate NOT green" from a measurement taken earlier in the
session without re-taking it. That is not a reason, it is a habit, so this turn started by actually
measuring. The result splits in two, and only one half is a backend problem.

### What the environment actually is

| Probe | Result |
|---|---|
| `http://127.0.0.1:8000/` | **200** — SillyTavern is up |
| `http://127.0.0.1:9222/json/version` | **200** — the shared CDP browser is up |
| `ctx.onlineStatus` | `no_connection` — but this is a cached label, not a probe |
| All four connection profiles called directly | **fail in 3–15 ms** — a refused connection, not a slow model |
| Listeners on `127.0.0.1:18080` (Artemis/RunPod) and `:1235` (local llama.cpp) | **none**, and no ssh tunnel process |

So the model half genuinely cannot run: both llama.cpp endpoints are down and the RunPod one needs a
paid pod started, which is not mine to start. Everything below runs without a model.

### The live run that matters for this plan

`so-turn-types-check.mts --group AdolionGroup --skip-reply` — **ten of ten checks pass**, on the
shipped build, driving the real host:

```
setup  b-image  c-greetings  c-origin  e-duplicate  e-slow-listener
e-swipe-same-id  e-distinct-rapid  d-reopen  d-swipe
```

`b-image` is the real `/sd` producer (extension-typed messages commit no boundary), and the five
`e-*` checks are the turn-identity work: a duplicate id commits once however late it arrives, same id
with new content after a swipe commits again, two distinct ids inside the old 250 ms window commit
twice. `c-origin` and `d-reopen` are the boundary surviving a chat switch and a reload with the same
counters. The only check not run is the one that needs a real reply, because that needs a model.

### The check that was wrong, and how I know it was the check

`e-distinct-rapid` failed first, and the reason it fails is worth recording because the obvious
reading is the wrong one. It emitted `lastId - 1` and `lastId` — two ids, so the name says "two
distinct ids" — but by that point in the run `lastId` had already been accepted by `e-duplicate` and
re-admitted by `e-swipe-same-id`. Under the identity-keyed bridge that re-emit **is** a duplicate and
correctly commits nothing; under the old elapsed-time rule it fell inside the 250 ms window and was
dropped. One accepted turn either way, and neither reading says anything about distinct ids.

It now appends two fresh messages and emits for those. It passes. That is the third correction this
file's own comments record, and the same lesson each time: **a fixture that reuses state from the
checks before it is not measuring the thing it names.**

### A blocked check is not a green check

`d-solo` first reported `no usable solo character` — every candidate card's most recent chat has a
story in it. That is the check refusing rather than testing something else, which is correct
behaviour and *not* a pass. Giving one card a story-free latest chat made it runnable, and it passes:
greeting reopen, swipe, and origin for a solo chat.

### Two environment defects, both now written down where they will be read

**The page held a stale session, and it looked exactly like a broken slash command.** The first run
died with `Unexpected token '<', "<!DOCTYPE "` out of `executeSlashCommandsWithOptions` — ST
answering `/api/groups/edit`, `/api/chats/group/get` and `/api/chats/group/save` with **403 and
`text/html`**, because the page's CSRF cookie was gone from the jar while ST itself answered 200.
Every navigation helper starts with a slash command, so this surfaces inside a script you did not
touch. One `location.reload()` fixed it. The one-call diagnosis (wrap `fetch`, log non-JSON
responses, call the command, restore) and the reload are now rows in the debug skill's error table.

**The Playwright MCP is not sharing the browser.** It reported `about:blank` and the
`globalThis.__x` marker set through it was `ABSENT` when read back through `st-eval.mts` — so it is
running its own isolated Chromium and its state is invisible to the scripts, exactly the failure the
skill warns about. Nothing in this run used it.

### Cleanup, and what I created

The failed runs orphaned two chats in `AdolionGroup` (`1757172011689`) and left the page on that
group instead of the one I found it on. Both chats are gone, the group is back to its original
sixteen, and the page is back on group `1703932647585` / chat `2024-10-25@16h35m36s` — verified, not
assumed. One chat created on the `Xianxia fantasy` card to satisfy the `d-solo` precondition was
deleted with `/delchat` afterwards.

### Commands and results (exit codes)

| Command | Result |
|---|---|
| `so-turn-types-check --group AdolionGroup --skip-reply` | **all 10 checks pass** (run twice; the second after the fixture fix) |
| `npm run test:debug` | EXIT=0 — **96 pass / 0 fail** |
| `npm run typecheck` | EXIT=0 |
| `npm run lint` | EXIT=0 |
| `npm run debug:typecheck` | EXIT=0 |

**Gate status: partially green, and the split is now stated as a split.** The boundary, turn
identity, chat-switch and reload behaviour of plan 03 is **live-verified on the real host** with no
mock in the path. Every model-consuming claim in this plan — the talk director, the curator, the
stall check, the epistemic/ledger pass, and the reply that commits a boundary — remains **NOT
green**, because both llama.cpp endpoints are down. That is a precondition failure with a measured
cause, not an unexamined assumption, which is the difference between this record and the five
before it.

## Live gate — the ownership race, on the new campaign (2026-09-21)

Everything before this entry ran against legacy fixtures (J5's Sun Ruins roster, J8's synthetic
`SO-J8` story, `so-turn-types-check`'s AdolionGroup). Those are regression evidence and are labelled
as such. The plan's plan-03 gate names two specific stories and neither of them is synthetic:

- **Adolion: The Adventurer's Road** (`adolion-adventurer` v9, group `1789797226071`)
- **Adolion: House Nightriver** (`adolion-academy` v11, group `1789797226079`)

Both are installed with the real `Adolion World`, their checkpoint books, the regional book and the
curator-writable `Adolion Chronicle`. The runs below are on those, with the real model through the
tunnel and no `debugResponse` anywhere.

### The held-response race, for real

The plan specifies a `live-switch-mid-read.json` scenario with `hold_response` / `release_response` /
`switch_chat` verbs. **That scenario and those verbs do not exist** — they are prescribed, not built.
So the race was driven by holding the real transport instead of inventing a response:

`ConnectionManagerRequestService.sendRequest` (ST's own shared module, `shared.js:423`) was wrapped
with a barrier that suspends the next real call and hands back a release. That is the true call path
for the director, the curator, the reads and the judge — nothing mocked, only delayed.

| Step | Result |
|---|---|
| Chat A = a fresh Adventurer's Road chat; a real turn runs, a real CM request is suspended | `held: 1` |
| Page switched to Chat B = a fresh House Nightriver chat (same group-level index, both empty) | B on `nightriver-house`, 0 decisions / 0 audits / 0 memory |
| The suspended request is released **into** the wrong chat | **B is untouched**: 0 decisions, 0 audits, 0 memory, 0 stagecraft proposals, no scene record. Chat A got nothing either. |
| Same-world control: an identical held read released **without** switching | audit recorded, **3 memory rows landed** in A |

The control is what makes the negative mean something: the same call, held the same way, writes
normally when the world has not moved. The refusal is the ownership check, not a call that never
completes.

### Ordinary real-model paths on the campaign

- Requirements green on both hubs; the lobby's authored `talk_control` is active.
- A neutral player action ("I cross the guild hall to the posting board…") is routed to
  **Adolion Narrator** with `source: "director"`, `latencyMs: 2049` — the authored instruction
  working on the campaign's own data, not a fixture's.
- A real extraction read on the campaign: accepted `tension_current` delta and eight memory rows
  drawn from the actual guild-hall scene.

### A real defect, still open: the away recap fires in a brand-new chat

**S3 reproduces, and is worse than the finding says.** In a **freshly created, empty** Adventurer's
Road chat, the first send was blocked by a `<dialog>` reading:

> Welcome back — **Adolion: House Nightriver** (away 1d) … Home to Nightriver …

The open chat belonged to the *other* story and the other group, had **zero messages**, and the
runtime's own snapshot at that moment was `adolion-adventurer` / `guild-hall`. So the recap was not
merely stale — it was another story's state, read across a chat and story boundary. The popup has no
dismiss control (`Cancel` and `Close` both `display:none`), so the scripted send failed twice behind
it before it was cleared by firing the `popup-button-ok` handler directly.

Plan 03's S3 deliverable says the recap "never fires on a chat with no messages or with no
`lastSessionAt` recorded for *this* chat", and the blob refuses a foreign `chatId`. Neither held
here. **This is not root-caused** — it is recorded as reproduced with its evidence, and it stays open
until it is. It also means plan 03's live gate is **not** green on this point regardless of the
ownership result.

### Housekeeping, and one tooling caution

Three sandbox chats were created and deleted; the Adventurer group's `disabled_members` (Tobias off)
is exactly as it was found; extraction settings restored to the captured `enabled: false, cadence: 3`;
the transport patch restored and its globals deleted. `so-run-header diff` against the pre-run
capture reports **0 differences** across build, host, profiles, judge, stagecraft, extraction,
display, chat, story, group and inventory.

**Caution for the next agent:** `so-library wipe-chat-meta` clears the *whole*
`chat_metadata.story_orchestrator` blob, including other stories' retained state. Run on a chat that
holds more than the story under test it destroys that too. It happened here on an empty legacy chat
whose blob still carried two other stories; the pre-wipe metadata was captured in `.debug/`, so the
non-test keys were restored, but the command is sharper than its name suggests.

## Gate record — S3 root-caused (2026-09-21)

S3 is **not** a state leak. The chat-stamped blob guard was never the failing part. It is the away
recap's **lifetime**, and behind that two ownership defects — one of them introduced by this plan.

### 1. The recap outlived the chat it described (the user-visible defect)

`showTextPopup` opens a host modal (`showModal()`), so while one is up the whole document is inert to
a pointer. It was never taken down, so a recap raised for one chat *covered every chat after it* — in
another group, under another story — and blocked the first send there.

Evidence (artifact trail in `.debug/`, group `1789797226079` opened at 11:15:39Z, `/newchat` at
11:15:42Z, group `1789797226071` opened at 11:16:27Z): the Nightriver popup was still on screen over
the Adventurer's Road chat, whose runtime was correctly `adolion-adventurer` / `guild-hall` with 0
messages. Deterministic repro on the campaign:

| Step | Result |
|---|---|
| Nightriver chat, seed `lastSessionAt` 30 h back, reload | `<dialog>` reads "Welcome back — Adolion: House Nightriver (away 1d)" |
| `/newchat` in the same group | **dialog still open**; blob `chatId` and `storyId: null` both correct |
| `so-ui.mts hit-test "#send_but"` | `clickable: false`, `blocked: "overlay"`, `topmost: dialog.popup…` |
| Open Adventurer's Road (on `adolion-adventurer`) | **the Nightriver popup is still on screen** |

**Fixed**: `showTextPopup` returns a handle (it closes by walking up from an anchor node it owns, so
it can only reach the dialog it opened); `AwayRecapController` is chat-scoped, closes a previous
recap before showing a new one, and `dismissUnless(chatId)` takes down a recap the open chat is not
the one for. `RunManager.invalidateRuns()` calls it, which is the single place the world changes.

Scoped, not unconditional: a page load loads the same chat twice (bootstrap + the host's
CHAT_CHANGED) and the first load's save stamps `lastSessionAt`, so dismissing on every load would
take the recap down and nothing would put it back. An unnamed chat is likewise not a mismatch — a
load passes through states where `chatId` is empty while the chat is being opened.

### 2. The load's ownership token lapsed on its own effect (this plan's bug, found by J4)

`loadStory` minted its `RunToken` **before** `this.loaded = {…}`. A load is the thing that changes
`storyId`, so the token described the world the load was replacing: on a fresh page it carried
`storyId: null` and the recap's `run.stillOwns()` check failed on the very load that earned it. It
went unnoticed because a *re*-load of the same story leaves `storyId` unchanged, so every manual
re-check passed while a page load never did.

The journal (added here, see below) named it in one line:
`away recap skipped | a later world change superseded this load: story: this result belongs to story null, the chat now plays sun-ruins`.

**Fixed**: mint after the load names its world. `J4.7` (the S3 check) went from FAIL to **PASS** on
that change alone — the recap is raised after a reload, and `/newchat` closes it.

### 3. An unnamed chat is not a chat this runtime may write

`RunOwner.ownsOpenChat()` returned true for an unclaimed run, including when the host had named no
chat at all. On a page reload the runtime boots on the welcome screen while `chat_metadata` still
holds the previous chat's blob; a save there writes empty state over that chat's own file. **Fixed**:
`Boolean(open) && (claimed === null || claimed === open)`.

### Instrumentation that made this answerable

`AwayRecapController` now takes a `note(summary, detail)` callback and the manager records it in the
session journal: `away recap queued | not due | shown | taken down | skipped`, each with the chat id
and the gap it measured. "No recap" and "a recap nobody saw" are different answers and only the
machine can tell them apart. `so-ui.mts hit-test` also gained a CLI verb — the helper existed for
scenarios only, so the one assertion a scripted click cannot make was unreachable from a script.

### J4.2/J4.3: the gap seed was missing, not a host race

The red `J4.2`/`J4.3` were blamed on a host-ordering race on the sandbox reopen. That was wrong.
`git show HEAD:test/journeys/j4-return-and-adopt.journey.json` has a seed step at index 1 of J4.2
(`blob.stories[id].extras.lastSessionAt` back-dated three days); the **working tree had lost it**
during the S3 work above, so the journey reloaded with a gap of 0 h and no recap could fire. The
journal said so in the first line — `away recap not due | last seen never, gap n/a` — and that was
read as "the metadata never arrived" instead of "nothing asked for a gap". A red check whose
precondition is a step nobody runs is the same class of failure plan 01 §D exists to catch.

The seed is restored, hardened, and was verified against the **file** this time:

- it back-dates `extras.lastSessionAt` 30 h, then asserts the value it just wrote is the one the
  chat file holds (`/api/chats/group/get` → `chat_metadata`), so a seed that never reached disk
  fails at the seed, not three steps later at the popup;
- it refuses to run when the chat has no persisted record for the active story, naming the keys it
  did find;
- it is the **last** step before the reload, because every `persist()` stamps `lastSessionAt` — a
  seed placed before any other step that persists is silently re-stamped to "now".

Nothing else changed. `J4.7` (the S3 check) is unaffected.

Recorded for the next agent: `ctx.saveMetadata()` **does** persist a group chat's metadata
(verified by reading `data/default-user/group chats/<id>.jsonl` directly); an earlier conclusion
that it did not was a read of the wrong chat's file after the page had moved. And a popup left open
by a manual probe makes `so-journey` refuse the next run's setup — correctly, and by name.

## Gate record — GREEN (2026-09-21)

`node scripts/debug/so-journey.mts run J4 --strict`, **run twice** on the built tree, real model
(main + extraction profiles selected, no `debugResponse`), headed:

| Run | Automated | Cleanup | First try | Artifacts |
|---|---|---|---|---|
| 1 | 5 pass, 0 fail, 0 blocked, 0 not-runnable | clean | 5 of 5 needed no retry | `test/journeys/records/v2.3-plan03/run1.{json,log}` |
| 2 | 5 pass, 0 fail, 0 blocked, 0 not-runnable | clean | 5 of 5 needed no retry | `test/journeys/records/v2.3-plan03/run2.{json,log,matrix}` |

`J4.1` play-through, `J4.2` recap after a 30 h gap (journal: `not due` → `queued` → `shown`,
`dialog[open]` present), `J4.3` names the checkpoint and dismisses, `J4.4` mid-chat adoption from
the real backlog, `J4.7` the recap never outlives its chat. `J4.5`/`J4.6` are the operator's
human checks.

Local gates on the same tree: `typecheck`, `lint`, `test` (124 suites / 2233 tests),
`test:debug`, `debug:typecheck`.

**Plan 03 is closed**: R1, C1, C2, R10, R11, S3 all have their live check, and the residual
`J4.7` defect (a page-load token that lapsed on its own effect) is fixed and asserted rather than
described.

## Audit 2026-09-23 — reopened (status: partial — "closed" withdrawn)

Census today: 90 rows — checked 31, delegate 33, todo 11, partial 9, local 6. A plan with `todo`
rows is not closed (overview rule 14).

- **Shared read unowned across the model call (high)**: `ExtractionScheduler.pump`
  (`scheduler.ts:152-158`) awaits `runSharedRead`, then `applyExtractionAudit`; the token is minted
  inside `applyAudit` (`extractionCoordinator.ts:188`) after the await, and
  `enqueueExtractorDeltas` runs before it; `startedEpoch` never gates the apply → V2.
- **`checked` rows that are not**: `JudgeRuntime.ask` fallback writes the ring after
  `await this.available()` unchecked (`judge.ts:113-122`); `syncMemoryMirror` host writes all
  precede its one check (`memoryMirror.ts:78-126`) → V3.
- **Census blind spots**: methods/function declarations only (arrows skipped), call-name write
  detection (assignments invisible), regex over body text (comments count), roots
  `src/runtime`+`src/wizard` only. Uncensused: `selectionDeps.clearStory`
  (`runtimeManager.ts:215-229`), `reapplyCheckpoint`/`dropReadsAfter` arrows, slash handlers,
  `effectsApplier.ts:43,81,248`, the stall `.then` reread → V3.
- **Continue commits no boundary** (*verify in ST first*): `turnBridge.ts:57-60` keys on id alone;
  ST's continue re-emits `MESSAGE_RECEIVED` with the same id; `turnBridge.test.ts:110` uses a fresh
  id → V4. **Group round collapses** into one `pendingBoundary` slot → V4.
- **Foreign blob blanked on read** (`persistence.ts:44-55`), later saved without `ownsOpenChat`;
  mismatch only `console.warn` → V5.
- **Low-water mark per epoch**, not since mint (`runOwner.ts:94-97` vs `runToken.ts:41-45`) → V6.
- Curator `inFlight` per coordinator instance blocks another chat → V3.
- Dropped from spec: `{kind:"discarded"}` rows outside the curator, ScenePanel freshness, away
  recap empty-chat guard, legacy-blob-after-`CHAT_CHANGED` rule, `live-switch-mid-read.json` +
  `hold_response`/`release_response`/`switch_chat` verbs, per-writer fault matrix → V3 / L6.
- Ledger R10/R11 notes describe a removed revision counter → V20b.


### V2 + V6 gate (2026-09-23)

- **V2**: `ExtractionScheduler.pump` computes the read window (`sharedReadWindow`, exported from `sharedRead.ts`) and mints the read's ownership (`host.beginRead(window)` → `beginRun`) BEFORE `runSharedRead`; the guard travels through `applyExtractionAudit(…, read)` to `ExtractionCoordinator.applyAudit`, which refuses a lapsed read before ANY write — deltas included (`enqueueExtractorDeltas` used to run first). `runNow` mints the same way and skips `commitBoundary` when its read lapsed. Census row `ExtractionCoordinator.runNow` todo → checked.
- **V6**: `RunOwner` keeps a per-epoch mutation log (`{revision, messageId}`, capped 200) and `RunContext.lowestMutatedSince(revision)`; `tokenMatches` asks it for mutations AFTER the token's `windowRevision`, so an edit made before a read started no longer discards every later read of the epoch. A log that no longer reaches back to the mint answers 0 (read as inside the window).
- Tests: `src/extraction/schedulerReadOwnership.review.test.ts` (mint precedes the read; a chat switch during the call reaches the apply as a lapsed guard; control), `src/runtime/coordinators/extractionReadOwnership.review.test.ts` (lapsed read writes nothing incl. deltas; control), `runToken.test.ts` V6 block against the real `RunOwner` (before-mint edit ignored; during-read edit discards; overflowed log discards). `scheduler.test.ts` mock now carries the real `sharedReadWindow`. Mutations (`test/findings/mutations/V2-V6-read-ownership.txt`): V6 lookup removed → 2 fail; V2 guard disabled → 1 fail, control green.
- Machine: typecheck 0, lint 0, jest 154 suites / 2504, build 0 (bundle `aeabb52c483e`), test:release 10/10.
- **Live, real model** (Artemis 31B via SSH tunnel `127.0.0.1:18080`, profile `Story Orchestrator Memory RunPod`, no `debugResponse`), `scripts/debug/so-read-ownership-check.mts`, group `1759606632088`, sun-ruins (regression fixture — deviation from rule 9's adventurer story, chosen so the race did not create chats in the user's campaign group): positive control = a real read in chat A stores 1 audit + 2 facts (~10 s); race = a real read started in chat B, switch to A in ~0.1 s, the read returns ~9 s later and is discarded (`runNow → false`), A stays at 1 audit, B stays at 0. **Run 1 PASS, run 2 PASS**; **live mutation** (guard disabled, rebuilt, reloaded) → **FAIL** with A at 3 audits, i.e. the late read landed in the other chat — so the check detects the defect it guards. Records: `test/journeys/records/v2.3-replan/V2/` (run1, run2, mutation-guard-disabled, run-header start/diff). Cleanup: `sun-ruins` removed from the library (it was not there before), chat metadata wiped; run-header diff shows only the rebuild timestamp (bundle byte-identical) and the open chat. **Six sandbox chats left in group `1759606632088`** (`2026-09-23@03h42m58s490ms` … `03h45m01s896ms`) — `/delchat` is refused by the session classifier; delete by hand.
- Harness defect found and fixed on the way: after `st-session reload` no group is selected, and ST's `openGroupChat(groupId)` without a chat id **returns silently** (`group-chats.js:2199`), so the first attempt ran both reads on the welcome screen and reported a meaningless result; the script now refuses to start unless the group and a real chat id are confirmed, and asserts every switch.

### V4 gate (2026-09-23) — what one turn is

- **Verified in ST first** (`script.js`): a continue re-emits `MESSAGE_RECEIVED` + `CHARACTER_MESSAGE_RENDERED` with the SAME message id and type `continue`/`appendFinal` (`:6716`, `:6738`; streaming `:3799` with `this.type`), and no mutation event comes first. The id-only key therefore dropped every continuation. Each continuation stamps a fresh `gen_finished` (`:3685`, `:6703`, `:6725`), so a continue is keyed `<id>:<gen_finished>`: its own event pair commits once, and the next continuation commits again. A `normal` reply stays keyed by id alone, so a re-announcement is still one turn.
- **Group round**: `is_group_generating` stays true for the whole round (`group-chats.js:982` → `:1078`), and each member's reply REPLACED the single `pendingBoundary`, so N replies made one boundary at the end. Pending boundaries are now a queue. Each entry keeps its own guard and its message id; it is `ready` once its after-speak has run, and the drain commits ready entries from the head in order. `commitBoundary(at?)` pins the boundary to that reply's message (`lastMessageId = min(at, chat.length - 1)`), so a boundary drained at the end of the round still records the message it was for. The old control "an older same-world reply cannot consume a newer pending boundary" encoded the collapse (7 then 8 → one commit). It now asserts `[[7],[8]]`, and still that 8 is not committed before ITS after-speak finishes.
- **Null id**: `Number(null)` is 0, so a null id was keyed "0" and a null `MESSAGE_DELETED` rolled back from message 0. `hostMessageId` answers null for null/empty/non-numeric. **Worse, found while making the live probe discriminate**: a non-finite id reached `runRollback`, where `Math.max(0, NaN)` is `NaN`. `shouldRollbackFromMessage` then answered true whenever any transition had fired, and `boundaryBeforeMessage` fell back to boundary 0, so an unidentified mutation rewound the whole story. A mutation with no id now clears the turn keys and rewinds nothing, and `runRollback` refuses a non-finite id as a defence (a noop).
- Tests: `src/runtime/turnBridgeIdentity.review.test.ts` (6), a V4 block in `runtimeManager.test.ts` (2) and `rollback.test.ts` (1), and the updated control in `turnBridgeOwnership.review.test.ts`. Census rows `TurnBridge.flushPending` (renamed from `flushPendingBoundary`) and `onRenderedReply` were re-noted. Mutations (`test/findings/mutations/V4-turn-identity.txt`): 7 of 7, each caught by its own case.
- Machine: typecheck 0, lint 0, jest 159 / 2546, build 0 (bundle `fae2b5e5ad0b`), test:release 10/10. RuntimeManager 698 lines.
- **Live, host event bus, NO model** (`test/scenarios/live-v4-turn-identity.json`, sandbox group `1759606632088`): ST's own `ctx.eventSource` emits the events a continue emits on a real chat message. Boundaries went 0 → normal 1 → re-announced 1 → continue 2 → appendFinal 3. Then a real transition (cp1→cp2), and a `MESSAGE_DELETED(null)` + `MESSAGE_EDITED(undefined)` leave cp2 at boundary 5. **3/3 twice** (`run1.log`, `run2.log`). **Live mutations**: continue keyed by id → `bCont 1` (`live-mutation-continue.log`); null read as 0 → the story rewound cp2 → cp1, boundary 5 → 0 (`live-mutation-nullid.log`). The first draft of the null-id step could not fail (no transition had fired, so rollback from 0 was a noop). It survived its mutation and was rewritten to fire a transition first. Run-header diff: build/bundle fields only (the header was captured before the null-id change).
- **NOT green, stated**: no real generation ran. The RunPod pod had idle-stopped, and `pod-action start` was refused by the session's safety classifier. The group-round deferral depends on ST's real `is_group_generating`, which an emitted event cannot raise, so that half is jest-only. Both are owed to L6 (turn types, real model).

### V5 gate (2026-09-23) — a foreign blob is neither read nor destroyed

- **Defect**: `getMetadataBlob` wrote an empty blob over a foreign-stamped one, so the next save of that metadata object erased the other chat's run. The mismatch was only a `console.warn`.
- **Fix** (`runtime/persistence.ts`): a foreign-stamped blob reads as a DETACHED empty blob, and the stored one is left byte-for-byte. `blobMismatch()` reports it, and `loadSelectedStory` journals it through `clearStory(status, note)` (`blob-chat-mismatch: stamped for X, open chat is Y; the stored state was left untouched`). Automatic writes (`savePersistedRuntime`, `setSelectedStoryId`, `dropPersistedRuntime`) into a foreign blob are refused. An explicit choice adopts it: `selectStory(…, chosen = true)` calls `adoptChatState()`, which restamps and keeps the stories, so an imported chat file continues its run instead of restarting it. The automatic path (`loadSelectedStory`) passes `chosen = false`, and the swap race cannot reach an explicit click.
- **Found while verifying ST first, and fixed**: a rename keeps the file's metadata under a new chat id (`renameGroupOrCharacterChat`, `script.js:10658–10717`; a branch does NOT copy our blob, `bookmarks.js:201`). So every renamed chat read as someone else's, and under the old read its story was then erased. `CHAT_RENAMED` (emitted after the reload) now restamps a blob carrying the old file name, but only when the open chat is the renamed one, then reloads the story (`restampRenamedChat`, `TurnBridge.onChatRenamed`).
- Tests: `src/runtime/blobForeign.review.test.ts` (8), a V5 block in `turnBridgeIdentity.review.test.ts` (2) and `runtimeManager.test.ts` (1). The existing S3 controls still pass. Mutations (`test/findings/mutations/V5-foreign-blob.txt`): 7 of 7 caught.
- Machine: typecheck 0, lint 0, jest 160 / 2557, build 0 (bundle `88b1a708a5d8`), test:release 10/10. RuntimeManager 699 lines (the budget's last line).
- **Live, no model** (`test/scenarios/live-v5-foreign-blob.json`, sandbox group `1759606632088`): the real chat's blob is restamped for another chat. It reads as no story, is unchanged, is journaled, and comes back when the stamp is put back. Then a real `ctx.renameChat` keeps `sun-ruins` under the new id, and renaming back carries it home. **3/3 twice**, both sandbox chats deleted by cleanup. **Live mutations**: the pre-V5 read → "the foreign blob was changed by reading it", `back: null`, i.e. the chat could not recover its own story (`live-mutation-readback-blanks.log`); `CHAT_RENAMED` unsubscribed → "the blob still carries the old chat id", `storyAfter: null` (`live-mutation-no-rename.log`).
- **Leftovers, stated**: the first run left its renamed chat (the harness's sandbox guard reads a rename as an escape, and cleanup looks chats up by their old id). It was deleted through the harness's own `deleteGroupChat` path, and the step now renames back. The rename-mutation run left **`so-v5-renamed-1790151341124`** in group `1759606632088`; deleting it was refused by the session's safety check, so it needs deleting by hand. It is why the run-header diff shows `chat.chatId`/`story.*`: `open-group` lands on the group's most recent chat, which is that one.
- Not done, stated: an imported-chat live check (adoption is jest-only).
