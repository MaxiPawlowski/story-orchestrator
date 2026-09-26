# Plan 02 — Carry-in: what v2.4's records found and left open

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on the v2.4 entry condition (overview V1) and plan 11
(overview sequence). Runs in parallel with plan 01. Verified against master `1ad1a5f` on 2026-09-25. **Re-verify every path:line before
building** (v2.4 rule 1). Every item starts from a failing fixture or a recorder trace (v2.4 rule 2). An item
with no reproduction closes as "not reproduced", with the attempts recorded. It never gets a speculative fix.

## Items

| # | Item | Kind | Evidence |
|---|---|---|---|
| C1 | Effect-fired NPC replies outlive their chat | **defect (code read)** | below |
| C2 | Chat-switch save race: a non-empty save posted under another chat's name | reported, caller unknown | `v2.4/05-world-info.md:409-414`; spike report `:33` |
| C3 | Lore-evidence `hiddenRuns` is not chat-keyed | observation, not measured | `v2.4/05-world-info.md:415`; `worldInfoEvidence.ts:178,235,322` |
| C4 | Host-fact rows left stale | docs | below |
| C5 | Intermittents J6.4 / J6.7 / J5.8 / J8.5 | open, cause unknown | `v2.4/01-carry-in.md:771-776,819-822`; `v2.4/00-overview.md:370` |

C5 and C11–C13 are taken here only if v2.4 plan 09 defers them with a user sign-off (see the overview's §v2.4 residue).
C10 is unconditional (a post-freeze finding, never on the candidate).

## C1 — Effect-fired NPC replies outlive their chat

**Verified current state (2026-09-25)**

| Claim | Seen |
|---|---|
| `fireReply` runs `/sendas … raw=false` or `/trigger await=true <member>` with no signal | `src/runtime/effectsApplier.ts:120-128` |
| `executeSlashCommands` takes no abort option | `src/services/stHost/slashCommands.ts:45-48` (options `{silent, delayMs}`) |
| The loop checks ownership before each reply, awaits the reply, and now checks `run.stillOwns()` after `await fireReply(reply)` and before the `lastSelfInjectionMessageId` write | `effectsApplier.ts:383-385` (`644aa05`) |
| `lastMessageId()` reads the **open** chat; `extras` is the object captured at entry | `effectsApplier.ts:130`, `:363` |
| The census calls the site `checked`; its note now records the fix | `test/findings/ownership-sites.json` (`fireNpcReplies` note). It still says "The trigger (generating) branch is still unproven live" |
| The fault matrix `effects|aborted` is `partial`, citing `npcRepliesOwnership.review.test.ts` | `test/findings/faultMatrix.json:454-457`. The in-flight stop is still NOT COVERED |
| Plan 03's abort reaches the scheduler, passes, curator, expansion and director, not effects | `v2.4/03-off-path-call-hygiene.md:600`; `src/runtime/runOwner.ts:96-127` |
| Nothing in `src/` calls `stopGeneration` | grep, 0 hits. It is on the context (`public/scripts/st-context.js:146`); `script.js:5607-5620` aborts ST's `abortController` and emits `GENERATION_STOPPED` |

**Consequence.** The stale `:384` write (extras of the start chat carrying the open chat's message id) is historical,
fixed in `644aa05`; it was the census gotcha's shape (`.claude/rules/gotchas.md`, "A `checked` row …"). Whether the
in-flight `/trigger` reply itself lands in the next chat depends on ST's chat-switch behaviour during a generation.
**That is not established** (see C6/A3). Step 0 measures it before any stop is built.

**Design**
1. ~~A `stillOwns()` check after `await fireReply(reply)` and before the `:384` write.~~ **Done** (`644aa05`).
2. **Only if step 0 shows a reply landing in the next chat:** when ownership lapses during an awaited `/trigger`,
   stop the generation, but only if it is still **ours**. That means the outermost loud generation the T6 tracker
   (`runtime/generationLifecycle.ts`) opened for this `/trigger`, still open. A stop without that proof could cancel
   the player's own generation in the new chat, so none is issued. The stop goes through a new `stHost` seam
   (`stopGeneration` from the context; inv 2) and returns a typed `WriteResult`.
3. Move the fault-matrix cell (`effects|aborted`) from `partial` to `covered` only if step 2 ships with its test.

**Host facts owed** (new rows in the v2.5 host-facts section, both versions):
- what ST does with an in-flight `Generate` when the chat changes (`openGroupChat`, `openCharacterChat`, `/go`);
- whether `/trigger await=true` resolves on stop;
- whether `GENERATION_STOPPED` from `stopGeneration` reaches our lifecycle tracker the same way a click does.

**Tests**
- The post-await jest case and the "delete the post-await check" mutant are done (`644aa05`, 2/2 killed).
- Jest (step 2 only, red first): no stop is issued when the open generation is not ours.
- Mutant (step 2 only): delete the "is ours" guard.
- Live (real LLM, lane): a checkpoint with a `generate` NPC reply `onEnter`. Switch chats while the reply streams,
  and record where the reply lands and what `extras` holds. ×2. The plan02-runtime scenario covers only the
  scripted branch (census note), so this is the first live proof of the generating branch.

## C2 — Chat-switch save race

**What is recorded.**
- In spike run A, a save carrying the sandbox group chat's metadata (integrity slug `5ba414fa…`) was posted under
  the Ponticius solo chat's name during `/go`. ST's server refused it, and the popup held `isChatSaving` true until
  the lane browser was killed (`v2.4/05-world-info.md:409-414`).
- A deleted sandbox chat came back as an unlisted file with its 4 messages (`:412-413`).
- "Which caller issued either save is NOT established: no save recorder was armed" (`:413-414`).

**What is guarded today.** Only **empty** saves:
- `switchRefusal` returns null when `target.messages > 0` (`src/services/stHost/persistence.ts:92-96`);
- the E7 no-integrity guard is also empty-only (`v2.4/00-overview.md:416`).
A non-empty save of chat A's content under chat B's name passes our watcher. The server's integrity check is what
stopped data loss.

**Order**
1. **Recorder into the repo.** The `.debug/arm-save-recorder.js` / `arm-chat-recorder.js` shapes the gotcha
   describes (`.claude/rules/gotchas.md`, "ST binds a chat save…") are gone: `.debug` rotated, and neither file
   exists today. Rebuild it as a `scripts/debug/` verb. It wraps `fetch` for `/api/chats/*/save` with body id,
   integrity and row count, plus a `saveMetadata` stack trace. Node tests cover it against a fake page.
2. **Reproduce.** Replay the spike's switch sequence (`test/scenarios/live-v24-05-t13-spike.json` `solo_chat`/`goto`
   steps) with the harness waits **removed**, recorder armed, on a lane. Predeclared: **10 attempts**. 0 reproductions
   → closes as not reproduced, with the harness waits kept and the attempts archived.
3. **Attribute.** If the caller is ours: extend the armed watcher to refuse a save whose integrity is not the target
   chat's, on the same `lost` evidence path `3a7ef37` added. If it is ST's own debounced save: record the host fact
   and stop there ("not ours to guard", gotchas). Either way the resurrected-chat case gets the same treatment.

**Gate:** the attribution is recorded with the stack. If a guard is built, the reproduction runs ×2 with the guard
and shows the save refused and logged, with no popup.

## C3 — `hiddenRuns` is not chat-keyed

`LoreEvidence.hiddenRuns` is keyed by book, not chat (`worldInfoEvidence.ts:178`). It resets when a generation sees the
book unhidden (`:322`), when the book leaves the story's set (`:235`), or when the host detaches (`:184-187`). A chat
switch is not one of those. So a hidden count can carry from one chat into the next chat sharing the book, and raise
the Repair row one generation early there. This is recorded as an observation, not seen live
(`v2.4/05-world-info.md:415`). Fixture first: two chats sharing a story book, one hidden generation in each. Expected
today: Repair after the second (wrong). Fix: key by `chatId:book`, or reset on the chat identity change the ring
already tracks.

## C4 — Stale host-fact rows (docs only)

| Row | Says | Record says |
|---|---|---|
| `03-H5` (`host-facts.md:83`) | "not confirmed live" | confirmed live on 1.19.0 (`v2.4/03-off-path-call-hygiene.md:1000-1002`) |
| `03-H18` (`host-facts.md:96`) | llama.cpp finish fields "confirm live" | no live confirmation in plan 03's final gates. Confirm on the next live batch or keep the row open |
| `01-H10`, `01-H13` 1.18.0 column | "re-check" (`host-facts.md:26,29`) | Owed only if 1.18.0 stays claimed (V10 Q4, open as `10-acceptance.md` Q4). If the minimum is the latest stable ST, the 1.18.0 column is dropped from host-facts.md and these rows close as 'not claimed (V10)'. If 1.18.0 stays claimed, re-read `slash-commands.js:6020-6036`/`:3770-3771` and `authors-note.js:272,275` at the 1.18.0 tag, and plan 10 runs P01 G7 + CH on 1.18.0 |

## C5 — Intermittents (only if v2.4 plan 09 leaves them open)

| Check | Recorded | Diagnostic in place |
|---|---|---|
| J6.4 `#so-rollback-notice` absent | once; not reproduced in 8 runs (`01-carry-in.md:774-776,819`) | wait + state dump (`8728d91`) |
| J6.7 story at cp1 while a cp2 NPC reply fired | once; not recurred in 6 (`:771,820`) | none specific. **C1 is a candidate cause**: an NPC reply that outlives its checkpoint is the same shape. Re-run after C1 |
| J5.8 private block missing from a drafted member's request | 1 of ~6 (`:821`) | lifecycle timeline (`b900b7c`) |
| J8.5 continuity note missing | once (`:822`) | diagnostic (`ef6253b`) |

Predeclared: each journey ×5 consecutive on the plan's final tree with the diagnostics armed. A recurrence becomes a
fixture and a fix. 0 of 5 closes the row as "not reproduced on <bundle>", with the records archived.

## Seeds added by the reconciliation (overview §Seeds reconciliation, 2026-09-25; verified on `e7626d7`)

| # | Seed | State | What this plan does |
|---|---|---|---|
| C6 | A3: an in-flight group reply landed in the lane's next chat 8 s after cleanup switched (1 of 13 runs, `v2.4 rec/J1/run2/`) | open | It is C1 step 0's measurement: the record answers "what ST does with an in-flight `Generate` on a chat switch". The harness half (cleanup does not stop or await the generation) is plan 10's Phase 0 harness (H-a), which has its own gate record |
| C7 | A4: the transition note posts ~20.7 s after the transition, behind the awaited onEnter NPC reply | open | `applyActive('activate')` awaits `fireNpcReplies` (`src/runtime/effectsApplier.ts:261`) before the manager announces (`src/runtime/runtimeManager.ts:289`). Moving the note first changes player-visible order, so it is a rule-7 item: a fixture that asserts the order is written now; the change ships only after the player session, or on a user decision before the freeze; else it is a v2.6 seed (`10-acceptance.md` §Human sessions) |
| C8 | Post-freeze fixes need their live checks on the next build: A1/A2 (`69b378f`), AE-01 (`ac190b4`), AE-03 (fates fixture), AE04-L1/S1 (`70b8eed`) here; the extraction ones (A5/A7 `c64c540`, A6/A11 `582d56a`, A10 `ed6c367`) are plan 05 F0, and A8 is plan 06 J2 | built, not live-checked | Run the red fixtures the seeds file names (`test/scenarios/v24-acc-A-*.json`) and the journey rows that found each, ×2, archived under `test/journeys/records/v2.5-plan02/postfreeze/`. An uncommitted `test/journeys/records/v2.4-postfreeze/ca25e4a632ed/` exists in the working tree (another session, 2026-09-25); a row closes only on committed, archived records |

| C9 | The NPC-reply `probability` roll is unseeded and a failed roll leaves no record (found writing plan 09, 2026-09-25) | open | `Math.random() > reply.probability` then `continue` (`src/runtime/effectsApplier.ts:381`): a replay cannot tell a lost roll from a skipped reply. Here: journal the roll (value, threshold, fired) so the outcome is observable. Seeding it is plan 09 SP7 |
| C10 | Curator write-ahead marker is never reconciled on hydrate (overview residue; `stagecraftCoordinator.ts:356-364` sets and clears `writeAhead` only on the in-process result path; nothing in `src` reads a pending marker) | open, unconditional | Red fixture: persist a record with `writeAhead: pending`, simulate death after `updateWIEntryByUid`, then hydrate. Expected: the live entry is compared with `before`/`after` and the record is marked applied or reverted; a `rewrite` is not re-applied and a retried `patch` does not fail. Evidence: `test/findings/mutations/v24-ae01-curator-ownership.txt`. Plan 03 step 4 (stagecraft split) is gated on this item |
| C11 | Phantom outermost mitigation; T1 hashing cost (`v2.4/01-carry-in.md:637-643,571`) | conditional (as C5) | Measure the hashing cost first; the mitigation starts from a failing fixture |
| C12 | Hidden re-read report; requirements-refresh group/lorebook halves; solo `CHAT_DELETED` fixture (`v2.4/02-*.md:910,700,774`) | conditional (as C5) | Each from a red fixture, ×2 live where it is a live item |
| C13 | `storyStart` live check (`v2.4/03-off-path-call-hygiene.md:943-947`) | conditional (as C5) | Live check ×2, archived |

## Machine gates
typecheck, typecheck:test, lint, test, debug:typecheck, build, test:release, test:debug; `st-session.mts reload`.
Records under `test/journeys/records/v2.5-plan02/`.

## Risks
- C1 step 2 can stop the wrong generation if "ours" is read loosely. The guard is the T6 tracker's identity, never
  "something is generating".
- C2 may not reproduce with a recorder attached, because a heavier `fetch` wrapper shifts timing. The 10-attempt
  bound is what keeps this from becoming open-ended.

## Unresolved questions
None for the user. C1 step 2 and C2 step 3 are decided by their own measurements.

## Gate record (code items)

2026-09-25/26, branch `worktree-agent-ad0b1efb273be242a` (from master `13b76f8`, master merged again at `180bf38` after plan 11
completed). Code and deterministic proof only: nothing ran live, no lane, main ST or `C:\dev\so-lanes` was touched.

### Done

| Item | Commit | What | Proof |
|---|---|---|---|
| C10 | `28c71f7` | `StagecraftCoordinator.reconcileWriteAhead`, called from the manager's hydrate tail (and the run is asked again after it). A pending op is read by uid and settled by the pure `settleWriteAhead` (`src/stagecraft/writeAhead.ts`): holds `after` = **applied** (never re-applied, so a retried `patch` cannot fail on its own output), holds `before` = back to **accepted** (the next boundary writes it from a fresh read), neither = **externally-edited**, gone = **failed**. The marker now carries the apply's `messageId`, so a reconciled write still reverts on rollback | `stagecraftWriteAhead.test.ts` (10, red first: 9 failed, the control passed), `curatorWriteAheadHydrate.review.test.ts` (manager hydrate + control); mutants 6/6 killed, `test/findings/mutations/v25-02-c10-curator-write-ahead.txt`; census row `reconcileWriteAhead` checked |
| C9 | `43d3845` | The NPC-reply probability roll is journaled before the reply: value, threshold, fired/skipped, reply key | `npcReplyRoll.test.ts` (red first: 2 failed; no-probability control) |
| C3 | `1016040` | `LoreEvidence.hiddenRuns` keyed by chat | `worldInfoEvidence.test.ts` C3 case + same-chat control; mutants 2/2 killed (the first sweep's M2 survived and the test was strengthened) |
| A6/A11 arms (review #27/#28) | `4162aff`, `212e8b2` | `storyOrchestratorDebugCallBudgetScale`, read only in `callTimeoutMs`, inert by default, at 1 and on junk. `so-timeout-arm.mts scale <base-run.log>` derives the uniform scale from a base run's measured passes: the whole-chat pass times out, every pass answers on its 2x retry, or it refuses. Fixtures `live-v25-05-memorize-timeout.json` (forced arm, `so-v25-a11-control` marker for the mutant) and `live-v25-05-breaker-slow.json` (an in-page delaying proxy for memory-model calls only, honouring the abort signal, `so-v25-a6-control` marker for the mutant). The base memorize fixture's last step checks the arm marker and is unchanged without it | `callBudgetScale.test.ts` (4, red first), `scripts/debug/lib/timeoutArm.test.mts` (7, including the archived v2.4 run3 log, which gives scale 0.495: whole pass 151 s against 127 s first and 254 s retry). Every eval syntax-checked (`new Function`) and schema-valid (`validateFixture`) |
| C1 step 2 | `56e831e` | An llm NPC `/trigger` is stopped when its epoch is replaced while it streams, **only** if exactly one outermost generation opened since the trigger started (new T6 `openedCount`, published through `runtime/generationWatch.ts`) and ST still generates. New typed seam `stopHostGeneration` (`script.js:5607`, host-fact row added to v2 00 overview) | `npcTriggerStop.review.test.ts` (6, red first), including "no stop when another generation opened after the trigger's (the player's, in the new chat)"; mutants 5/5 killed (including deleting the "is ours" guard), `test/findings/mutations/v25-02-c1-trigger-stop.txt`; fault matrix `effects\|aborted` moved to **covered**; census row `EffectsApplier.speak` |
| C2 step 1 | `21b3ca9` | `so-save-recorder.mts arm\|drain [--out]\|disarm`: every chat save (file, integrity, rows, what was open at post time, status, stack) and every context `saveMetadata` (stack, open chat). Drain flags `foreign-integrity` and `posted-elsewhere` | `so-save-recorder.test.mts` (6 against a fake page: the spike shape is flagged, and ordinary saves of two chats flag nothing) |
| C7 | `f09469f` | Order fixture `live-v25-02-c7-note-order.json`: the transition note must come before the onEnter reply it announces. It is **expected red** on today's build. The change is rule-7 gated and was not built | syntax + schema checked |
| C4 | `6da13de` | `03-H5` marked confirmed live on 1.19.0 (cites `v2.4/03:1000-1002`). `03-H18` stays open. `01-H10`/`01-H13` stay with V10 Q4 | docs |

### Gates (last full run, on the merged tree)

`npm run typecheck` ok · `npm run typecheck:test` ok · `npm run lint` ok · `npm test` 272 suites / 3922 tests pass ·
`npm run debug:typecheck` ok · `npm run build` ok · `npm run test:debug` 307 pass / 0 fail (after the recorder: 308 tests,
1 skipped). The ownership census, fault-matrix guard and architecture budgets are green: manager 740/740, stagecraft coordinator
616/620. Every item ran typecheck, typecheck:test, lint and full jest before its commit, and the script items also ran
debug:typecheck and test:debug. `test:release` was not run: no release tooling changed.

### C2: static diagnosis (ST `7c3994196`), no guard built

**The window.** `/go <character>` → `goToCharacterCallback` → `openChat(chid)` (`slash-commands.js:5110-5115`) runs
`resetSelectedGroup()` (`selected_group = null`, `group-chats.js:611-614`) and `setCharacterId(chid)` synchronously. It then
waits on `await delay(1)` and the `reloadChatMutex`, and only then calls `clearChat({clearData:true})`. That function awaits
`saveItemizedPrompts` (`script.js:1600`) before `chat.length = 0` (`:1603`). Unlike `selectCharacterById` (`:900`),
`openChat` never resets `chat_metadata`. The group's metadata survives until `getChat` assigns the solo file's header
(`:7656`). `/go` also has no `isChatSaving` / `is_send_press` / `is_group_generating` guard, which `selectCharacterById`
(`:880-891`) and `openGroupById` (`group-chats.js:2029`) both have.

Any `saveChatConditional` that runs in that window takes the solo branch (`selected_group` is null) and calls `saveChat()`
(`script.js:7395`). That call builds `file_name = characters[this_chid].chat` (the solo chat) and `chat_metadata` (still the
group's, **with the group's integrity**). Its body is:
- **W1**, before `clearChat` empties `chat`: the group's messages, a **non-empty** save. Our `switchRefusal` lets it through
  (`persistence.ts:92-96` is empty-only).
- **W2**, after it: an empty save carrying the group's integrity. Our watcher refuses it only when a save of ours was armed
  for another chat.

The server compares the header integrity with the target file's (`src/endpoints/chats.js:536`). A mismatch gives the
integrity popup, which is what spike run A recorded. A solo file with no integrity yet would be **overwritten** with the
group's rows.

**Candidate callers** (unproven, which is why nothing is guarded):
1. Our `persist` → `saveMetadata` → `saveChatConditional`. It is asked before `/go` and sits in the ≥ 100 ms
   `waitUntilCondition` poll (`utils.js:1934`), which spans the window. This is the same late-binding shape as the v2.4
   J10.14 finding.
2. ST's own `saveChatConditional` from another path. `cancelDebouncedChatSave` runs only inside `clearChat`, after W1.

The resurrected deleted sandbox chat (`v2.4/05:412-413`) is a separate shape: the group-save debounce, gotcha V18.

**Reproduction recipe** (plan step 2, lane only, 10 predeclared attempts):
1. Seed and start a lane. Use a group chat whose story persists (any sandbox with an imported story), plus a solo character
   whose chat file already has an integrity.
2. Run `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-save-recorder.mts arm`.
3. Per attempt, from an eval with the harness waits **removed**: trigger a persist (`rt.setUiSettings({})` or `/cp set` on a
   quality), then **at once** `await ctx.executeSlashCommandsWithOptions('/go <solo character>')`, then go back to the group
   (`openGroupById`), and repeat.
4. After each attempt, run `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-save-recorder.mts drain --out test/journeys/records/v2.5-plan02/C2/attempt-<k>.jsonl`.
   A `foreign-integrity` flag is a reproduction. Its `stack`, plus whether a `saveMetadata` ask precedes it
   (`posted-elsewhere`), attributes it: an ask of ours means the caller is ours, no ask means ST's own save.
5. If the caller is ours, the guard extends `switchRefusal` to refuse a chat save whose integrity is not the target chat's
   (keep a per-file integrity map from saves and loads) on the `lost` path. If it is ST's, record the host fact and stop.
   Either way, a popup or a lane wedge is a hard stop: run `taskkill` on the lane's Chrome, then `st-session start`.

### Live pending (nothing below has run)

Group `1759606632088` is the lane group the v2.4 fixtures use. Re-check it exists on the lane first.

| Item | Fixture / tool | Command | Pass |
|---|---|---|---|
| A11 forced arm | base: `test/scenarios/live-v24-03-memorize.json`; arm: `test/scenarios/live-v25-05-memorize-timeout.json` | (1) `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-scenario.mts run test/scenarios/live-v24-03-memorize.json --sandbox --group 1759606632088 > base.log`; (2) `node scripts/debug/so-timeout-arm.mts scale base.log`; (3) `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-eval.mts "localStorage.setItem('so-v25-a11-scale','<scale>')"`; (4) `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-05-memorize-timeout.json` | ×2 green. Control once on a build with `TIMEOUT_RETRY_SCALE = 1`: set `so-v25-a11-control` to `1`, run the arm once, and the fixture passes only if the backlog fails on its budget. Clear both keys afterwards |
| A6 slow arm | `test/scenarios/live-v25-05-breaker-slow.json` | `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-05-breaker-slow.json`. Delay defaults to 12 s; override with `localStorage so-v25-a6-delay-ms` | ×2 green; answer latency > 10 s recorded. Control once on a build where `probeTimeoutMs` returns a fixed 10000, with `so-v25-a6-control` set to `1` |
| C1 step 0 + step 2 | a checkpoint with an onEnter llm reply (`test/scenarios/plan03a-llm-npc-reply.json` shape); record with `so-save-recorder` + `st-payload arm` | switch chats (`/go`) while the reply streams, ×2 on a lane, and record where the reply lands, whether `/trigger await=true` resolves on stop, and whether `GENERATION_STOPPED` reaches the T6 tracker | the host facts owed by C1. If no reply ever lands in the next chat, step 2 stays dormant rather than proven |
| C2 steps 2–3 | `scripts/debug/so-save-recorder.mts` | recipe above, 10 attempts | attribution with stack; a guard only then, ×2 |
| C7 | `test/scenarios/live-v25-02-c7-note-order.json` | `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --group 1759606632088 test/scenarios/live-v25-02-c7-note-order.json` | **expected red** until the rule-7 change; record noteIndex vs replyIndex |
| C10 | deterministic only | none owed. A live crash-between-writes is not practical | done |
| C8 | `test/scenarios/v24-acc-A-*.json` + journey rows | as the plan's C8 row, archived under `test/journeys/records/v2.5-plan02/postfreeze/` | ×2 |

### Deviations

- **C1 step 2 was built ahead of its step 0 measurement.** The coordinator asked for it, and the plan says "only if step 0
  shows a reply landing". The guard is the narrowest one the T6 tracker allows: the tracker closes its outermost on
  `CHAT_CHANGED`, so "still open" cannot be read after a switch. It uses the new `openedCount` (exactly one outermost since
  the trigger) together with ST's generating flag. If step 0 shows ST never lets the reply land in the next chat, the stop is
  dormant code and should be removed rather than kept. The fault-matrix cell is `covered` on the deterministic tests, and its
  note says the live half is owed.
- **C10 "reverted" reads as "back to accepted".** An unlanded write returns to `accepted` so the next boundary writes it,
  rather than taking a new status.
- **Budgets.** The stagecraft coordinator moved from 594 to 616 of 620 effective lines. The logic went into the pure
  `writeAhead.ts` to stay under budget, but plans 03 and 08 quoted 601 as their headroom. The manager stayed at 740/740 by
  renaming one delegate's parameter (`shouldCompactShortTerm(messageId)`). That shortens a line without packing it.
- **`storyOrchestratorDebugCallBudgetScale` ships in the bundle** (inert by default) until plan 12's dev/prod split moves
  debug globals to dev builds (V11).
- **C5 and C11–C13 were not taken.** Their condition, a v2.4 plan 09 deferral with a user sign-off, is not recorded.
- **C6 and C8 are live only.**

## Gate record (live, bundle 0f4332fac075)

2026-09-26. Lanes only: lane 1 ran C1 and C2, and lane 2 ran A11, A6, C7 and C8. Each lane was prepared the same way: `restore-config`, `st-session reload`, served bundle `0f4332fac075` confirmed by `so-run-header`, `open-group 1759606632088` (`ctx.groupId` checked), `/profile Artemis RunPod RP` with a real PONG. `src`/`dist` untouched. Records live under `test/journeys/records/v2.5-plan02/` (`<rec>` below). C8 is archived under `<rec>/C8/`, not the `postfreeze/` the C8 row named (deviation, path only).

### Verdicts

| Gate | Verdict | Runs | Record |
|---|---|---|---|
| A11 forced arm | **NOT GREEN, 0 of 5.** All five runs failed at step 8/18: `the memory model did not answer within 92064 ms, nor within 184128 ms on one retry`. That is the **first window** (~88k tokens), not the whole-chat pass the arm targets. Scale 0.359 came from the base run (window passes 112.8 s / 15.8 s, whole chat 127.0 s), so the window had only 1.63× headroom. Run 3 shared the backend (3 requests in flight, 542 tok/s against 791). Run 5 had it alone and still ran both asks to their budgets (+160,770 prompt tokens over +277 s). Read as calibration on the shared backend, not a product defect. The scale was not retuned | base + 5 (batch 1 runs 1–2, diagnostic run 3, batch 2 runs 4–5) | `<rec>/A11/` (`base.log`, `scale.json`, `fixture-sha.txt`, `metrics-*.tsv`, `backend-waits.log`) |
| A6 slow arm | **GREEN ×2.** Answer latency 13,400 / 13,853 ms (> 10 s), closed by `probe (backoff) succeeded`. Player-clean passed, "Try again" was clickable, the profile URL was restored to :18080, header blocking 0 | 2 | `<rec>/A6/` |
| C1 step 0 | **Measured: the reply lands in the next chat when that chat is long enough.** Empty next chat: 2 runs, no landing. In run 1 the stop fired; in run 2 the stream errored on the emptied `chat[1]` and `/go` threw. Populated next chat: 2 of 2 landed. The partial narrator reply overwrote message #1 of the solo chat on disk (`run-{1,2}.solo-after.jsonl`) | 2 + 2 counted; prelims set aside with stated harness reasons | `<rec>/C1/`, `<rec>/C1/populated/` |
| C1 step 2 (stop) | **NOT EFFECTIVE LIVE.** 2 of 2 populated runs landed with the stop in place. See D1 | as above | `<rec>/C1/populated/` |
| C2 steps 2–3 | **Not reproduced, 0 of 10** (foreign-integrity shape). No popup, no wedge, every save 200. Attribution below. No guard built | 10 counted (3 untapped prelims archived, not counted) | `<rec>/C2/` |
| C7 | **RED ×2, as expected.** `C7: the transition note came after the reply it announces`. Reply at index 1, note at index 2, lag about 22 s (run 1) and 15 s (run 2) | 2 | `<rec>/C7/` |
| C8 A1 | GREEN ×2: `v24-acc-A-reload-blocks` (run 1 header blocking 1 = H1 below), `-control`, `-extprompt-cache` | 2 each | `<rec>/C8/A1/runs.jsonl` |
| C8 I7 | GREEN ×2 | 2 | `<rec>/C8/I7/runs.jsonl` |
| C8 A2 | GREEN ×2: `v24-acc-I3` and `v24-pf-A2-nudge-leftover`. The post-nudge `activeNudge` and `story_copilot_nudge` both read null | 2 each | `<rec>/C8/A2/runs.jsonl` |
| C8 AE-03 | GREEN ×2 (`live-v24-08-fates-jump`) | 2 | `<rec>/C8/AE-03/runs.jsonl` |
| C8 AE-01 | GREEN ×2: `v24-pf-curator-switch` and `v24-pf-curator-same-chat` | 2 each | `<rec>/C8/AE-01/runs.jsonl` |
| C8 AE04-L1 | GREEN ×2 on runs 3–4. Runs 1–2 are invalid (H2 below) | 4, 2 counted | `<rec>/C8/AE04-L1/runs.jsonl` |
| C8 AE04-S1 | GREEN ×2, asset cleanup clean | 2 | `<rec>/C8/AE04-S1/runs.jsonl` |
| C10 | deterministic only (code record) | — | — |

After the AE04 runs, the judge is back at defaults (`enabled` false, every use off). The C8 driver is `<rec>/C8/run-c8.sh`, and each row's `runs.jsonl` carries the fixture sha256 per run.

### Defects found (not fixed)

- **D1 (data loss; ST streaming, started by our effect). An in-flight llm NPC `/trigger` reply overwrites a message in the chat the player switches to, and saves it.**
  - Recorder stack: `saveChat` ← `StreamingProcessor.onFinishStreaming` (`script.js:3815`) ← `Generate` (`:5440`) ← `generateGroupWrapper` (`group-chats.js:1063`) ← our `/trigger` (`src/runtime/effectsApplier.ts:139`).
  - Our stop (`src/runtime/effectsApplier.ts:373-377` → `src/services/stHost/generation.ts:9-15`) fires on the epoch bump from `clearStory` → `invalidateRuns` (`src/runtime/runtimeManager.ts:238`), that is, inside the `CHAT_CHANGED` dispatch, after ST has already swapped `chat`.
  - `stopGeneration` marks the stream finished (`script.js:3847-3850`), and `onFinishStreaming` then writes `chat[messageId]` of the now-open chat (`:3679-3685`) and saves it.
  - From the code (not measured): without the stop, a long enough next chat takes the full reply at the natural finish, and a shorter one ends the stream with a TypeError (as in run 2). So landing depends on the next chat's length, not on the stop.
- **D2 (ST host):** `/go` during a group generation leaves no chat open, or throws. `/go` has no `is_group_generating` guard (`slash-commands.js:5110-5115`). The wrapper's `setCharacterId(undefined)` (`group-chats.js:1080`) left no chat selected in 4 of 5 runs, and in run 2 `/go` threw at `script.js:7684`, so `CHAT_CHANGED` never fired.
- **C7 (known, rule-7):** `src/runtime/runtimeManager.ts:275` `applyActive("activate")` awaits the onEnter `fireNpcReplies` at `src/runtime/effectsApplier.ts:270`. Only then does `src/runtime/runtimeManager.ts:289` `announceTransition` post the note.
- **C2 observation (ours, latent):** the settings write persists un-awaited (`src/runtime/settingsControl.ts:58`). That save binds late to the next chat and is caught only because it is empty (`src/services/stHost/persistence.ts:92-96`).
- **Harness H1 (S12 shape, lane copy only):** sandbox cleanup deleted a library story that already existed under the same id. `v24-acc-A-reload-blocks` imports `v24-01-delete.story.json`, whose id `v24-01-delete-decode` was already in lane 2's library. Cleanup removed hash `v2-de4f955d`, so `v24-01-delete-decode@1` is gone from lane 2. It was not restored. The harness must spare a same-id story that existed before the run.
- **Harness H2:** the C8 runner did not reload between AE04-L1 runs. Run 2's judge answer was a page-cache hit (`cached:true, latencyMs:0`, the known gotcha), and the header was diffed before the marker lorebook was removed. The runner was fixed (reload + profile per run, assets removed before the diff), not the fixture, and runs 3–4 re-ran.
- **Recorder limitation (C2):** our save watcher re-wraps `fetch` on every persist and ends up outermost, so `so-save-recorder` cannot see a save the watcher refuses. The attempt script added an outer tap. Its `posted-elsewhere` flag fired on all 10 attempts, so it is noisy.
- **Observation:** `settings.schema` null → 1 first appeared during the A11 base run. This is the product stamping the schema on a settings save, and is benign. Session header diff: `<rec>/header-session-end-diff.log`.

### C1 step 2: keep or remove (the rule in §Deviations)

The rule removes the stop only if step 0 shows ST never lets the reply land in the next chat. Step 0 shows it lands (populated, 2 of 2), so the removal condition is **not met and the stop is KEPT**. It is not proven dormant. It is also **not a fix**: 2 of 2 replies landed with it in place, because it fires after ST swaps `chat`. Consequences:
- step 2 does not close C1;
- the fault-matrix `effects|aborted` "covered" is not supported live (`test/findings/faultMatrix.json`, owed back to `partial` by the next C1 build item, not edited in a records commit);
- C1 stays open on D1.

A fix has to act before the swap (for example, stop or detach the stream before the switch commits, or refuse the finish-streaming write into a chat other than the trigger's). It starts from the populated fixture, red first.

### C2 attribution

- **Spike shape (a non-empty save under another chat's name, with a foreign integrity): not reproduced, 0 of 10**, with the harness waits removed and the recorder plus an outer tap armed. The row closes as "not reproduced" for that shape. The harness waits stay in place.
- **The one late save observed is ours**, in 10 of 10 attempts. The stack is `setUiSettings` → `settingsControl.refresh` (`src/runtime/settingsControl.ts:58`) → `persist` → `saveAndObserve`, then ST's `saveMetadata` → `saveChatConditional` → `saveChat`. It posted 97–105 ms after the ask, under the solo chat's name, after `getChat` had loaded the solo header. It therefore carried the solo chat's own integrity (`718ae40c…`) and 0 rows, and `switchRefusal` (`persistence.ts:92-96`) refused it every time.
- Step 3's integrity-mismatch guard would not have fired, because the integrity matched. The evidence points instead at refusing any chat save of ours that was armed for another chat, whatever its row count. **Not built.** That is the plan owner's call, and it starts from a red fixture: a solo chat **with** messages, where this same late save would pass and our group persist would be lost. That case was not tested.

### Pending

- **Mutant controls (each needs a mutant build):**
  - A11 with `TIMEOUT_RETRY_SCALE = 1` + `so-v25-a11-control`;
  - A6 with a fixed 10 s `probeTimeoutMs` + `so-v25-a6-control`;
  - C1 with no stop (whether the reply lands without the stop: full length in a long chat, nothing in a short one).
- **A11:** re-run base, then the arm ×2, in an exclusive backend window with llama-server logs captured. Whether llama cancels the aborted first ask is still unknown.
- **C1:** the D1 fix (above) and its live ×2. Host facts owed as new rows (v2.5 host facts):
  - `/trigger await=true` resolves on stop (about 190–210 ms after the switch);
  - our stop emits `GENERATION_STOPPED` inside the `CHAT_CHANGED` dispatch;
  - `onFinishStreaming` writes into whichever chat is open;
  - `/go` has no group-generating guard.

  Whether T6 sees our `GENERATION_STOPPED` is not observable without a debug handle.
- **C2:** the populated-solo case, and the guard decision above.
- **C7:** the rule-7 change: a player session, or a user decision before the freeze, or a v2.6 seed.
- C5 and C11–C13: not taken (no v2.4 plan 09 deferral with sign-off). C4 `03-H18`: not confirmed on this batch.
- **Lane residue (lane copies only):**
  - lane 1 keeps these C1/C2 sandbox group chats: `2026-09-26@02h04m03s354ms`, `02h11m30s492ms`, `02h13m06s245ms`, `02h14m30s374ms`, `02h16m43s530ms`, `02h20m18s909ms`, `02h22m00s975ms`, `02h25m00s518ms`, `02h25m56s040ms`. They were not deleted, to avoid reap popups. Their pinned `so-v25-c2c1` copies remain; the story itself was removed from the library;
  - lane 1's solo chat `Ponticius - 2026-09-26@02h19m52s832ms` was left overwritten by the last C1 run. The original is backed up at `C:\dev\so-lanes\1\c2-backup\`;
  - lane 2 lost `v24-01-delete-decode@1` (H1).

  Re-seed both lanes (`st-lanes seed <n> --fresh`) before the next batch.
- localStorage: `so-v25-a11-scale` removed. The read-back shows no `so-v25-*` keys and no `storyOrchestratorDebug*` globals (`<rec>/localstorage-cleanup.log`).

## Gate record (A11 exclusive backend, bundle c67dcdba7564, 2026-09-26)

- A11 forced arm: **0/2 on an exclusive backend** (lane 2 alone, requests_processing 0 before each run). Same failure as the shared runs: the FIRST window (~88k tokens, 123.5 s cold) is cut at the scaled 100 s budget and its retry misses 200 s.
- Cause, reproduced directly against llama-server on the pod (no ST, no extension) and through ST's request path with a synthetic prompt: after a DEEP abort (~80k tokens read) an identical retry gets `cache_n` 0 and re-reads at ~424 tok/s (vs 790 cold), 211 s; after a shallow abort (~55k) it reuses the cache and finishes in 56 s. Records: `test/journeys/records/v2.5-plan02/A11-exclusive/` (`llama-abort-probe/`, `diag-run3/`).
- **Harness defect, not product:** `scripts/debug/lib/timeoutArm.mts` `forcedTimeoutScale` (1) accepts scales where other passes also time out (its lower bound should require every other pass to answer on its FIRST ask), and (2) models the retry as a cold ask. For this chat the arm is infeasible (window 1 needs scale > 0.53, the whole-chat pass < 0.484). Fix: the arm reports `infeasible`, and a fixture whose whole-chat pass is clearly larger than any window (or an arm that scales only the whole-chat pass).
- **New product defect (A37):** the extension budgets `max_tokens` 512 but with the preset included ST sends `n_predict` = the preset's 1200, and llama obeys `n_predict` (`src/services/stHost/modelReply.ts:123-128`; ST `custom-request.js:411-414`, `textgen-settings.js:1696`). 1,237 lane requests carried max_tokens 512 / n_predict 1200; a 1-token probe got 1,200 back. `callTimeoutMs` under-budgets any reply past 512 tokens.

## Gate record (code, D1/C7 fixes, 2026-09-26)

Built on master `0ae7107` in a worktree. Nothing live ran (no lanes, no main ST). The live re-runs owed are listed per item.

### C1 / D1: the in-flight NPC reply no longer lands in the next chat

**Mechanism: a chat-identity guard on the stream's own write path** (`src/services/stHost/streamGuard.ts`, wired as `guardHostStream` in `stHost/generation.ts`, armed by `EffectsApplier.speak` for every `llm` reply).

Host evidence (ST `7c3994196`):
- No event fires before the swap. `event_types` has no pre-change event (`events.js:3-111`). Every switch path clears and repoints first and emits `CHAT_CHANGED` only after the next chat is loaded and printed: `getChat` → `chat.splice` (`script.js:7658`) → `loadItemizedPrompts` + `printMessages` → `CHAT_CHANGED` (`:7700`); `/go` → `openChat` sets the character before `reloadCurrentChat` (`slash-commands.js:5110-5115`, `script.js:1710-1723`); `openGroupChat` clears, then repoints `chat_id`, then loads (`group-chats.js:2203-2210`); `openCharacterChat` the same (`script.js:7744-7749`). So anything hooked on `CHAT_CHANGED` runs after the ticks have already been able to write into the loaded chat.
- ST's switch guards are partial. `selectCharacterById` refuses while a group generates (`script.js:885-887`) and `openGroupById` while `is_send_press || is_group_generating` (`group-chats.js:2029`), but `/go` (`slash-commands.js:5085-5115`), the past-chats list (`bookmarks.js:688-716` → `openGroupChat`/`openCharacterChat`) and the welcome screen (`welcome-screen.js:494,522`) have none. Holding the switch is not ours to do.
- Every write the stream makes goes through one instance method. Ticks call `this.onProgressStreaming(this.messageId, …)` (`script.js:3896`), which writes `chat[messageId].mes` (`:3679-3685`); the finish calls `onFinishStreaming` → `finalizeIntermediaryMessage` → `this.onProgressStreaming(…, true)` (`:3756`, `:3808-3810`), then `saveChatConditional()` (`:3815`). Generate reaches the finish only when `!isStopped && isFinished` (`:5408`, `:5439`).
- Why the step-2 stop made it worse: `stopGeneration` → `onStopStreaming` sets `isFinished = true` (`:3847-3850`, `:5607-5610`), so the aborted stream takes the finish path and saves into the chat now open. That is D1's stack exactly.
- `chat` is one live array mutated in place (`script.js:411`, `:1604`, `:7658`), and `getCurrentChatId()` reads the selected group or character (`:541-547`). In every switch path the chat id changes or the array is cleared before the next chat is loaded, and the load needs a fetch, so a synchronous check at the write sees the move before the next chat's rows exist.

The guard wraps `onProgressStreaming` on each streaming processor seen during the reply (armed on `STREAM_TOKEN_RECEIVED`, `script.js:3895`, and again by `halt()`). A write whose open chat id is not the reply's, or whose `chat[messageId]` is not the object the stream started on, is refused: the stream is marked `isStopped` + `isFinished` and its fetch aborted (`streamingProcessor.abortController`, `:6154-6160`), and the write throws. A tick's throw is caught by `generate()` without `onErrorStreaming` because `isFinished` is set (`:3900-3906`), so no `MESSAGE_RECEIVED` is emitted into the next chat; the finish's throw leaves `onFinishStreaming` before `saveChatConditional`. `release()` calls `activateSendButtons` (`:7075-7080`) only when a stream was halted, because a halted solo Generate never unblocks itself. The normal case is untouched: the check passes and the original method runs.

Step-2 stop: kept only as the fallback where no streaming processor exists (non-streaming requests, or before the request). On lapse, `halt()` stops the live stream through the guard first and returns true, so `stopHostGeneration` is no longer called on a streaming reply (it would force the finish).

Not covered (residual, stated in the fault matrix): a non-streaming response that arrives between the next chat's load and `CHAT_CHANGED` (`saveReply` appends into the open chat, `script.js:5531`); a streaming response whose headers arrive after the switch (`onStartStreaming` pushes its placeholder into the open chat, `:3633`).

Tests (red first): `src/runtime/npcStreamLanding.review.test.ts` drives the real `EffectsApplier` and the real guard against a fake stream that mirrors `script.js:3874-3911` and Generate `:5396-5446`. On the unchanged applier it failed 4 of 5 (mid-stream with a tick after the load, natural finish, before the first token, send button); the control (no switch: lands and saves once) passed. `src/services/stHost/streamGuard.test.ts` (5). Mutants 6/6 killed (`test/findings/mutations/v25-c1-stream-guard.txt`). Fault matrix `effects|aborted` moved from covered to **partial** with the injected-switch citations and the residual above. Census row `EffectsApplier.speak` rewritten.

Live re-run owed (lane, populated next chat, ×2), after `npm run build` and `st-session.mts reload` on the lane:
1. `node scripts/debug/st-lanes.mts seed 1 --fresh`, then `node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-session.mts reload`, `node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-navigation.mts open-group 1759606632088`, `MSYS_NO_PATHCONV=1 node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-actions.mts slash "/profile Artemis RunPod RP"`.
2. Pick a Ponticius solo chat with at least 2 messages and name it: `node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-eval.mts "localStorage.setItem('so-v25-c1-solo','<chat file name>')"`.
3. `node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-eval.mts --file test/scenarios/live-v25-c1/setup.js`
4. `node scripts/debug/st-lanes.mts run 1 -- scripts/debug/st-eval.mts --file test/scenarios/live-v25-c1/switch-populated.js > run-1.json` (the script now returns `verdict {landed, pass}`: the solo chat's rows on disk before vs after). Repeat 3-4 for run 2. Green = `discriminates: true` and `verdict.pass: true` on both runs; 2 of 2 landed on bundle `0f4332fac075`.
5. Control on a mutant build with the guard's write check removed: expect `verdict.landed: true`.
6. Clean up: `localStorage.removeItem('so-v25-c1-solo')`, the sandbox group chats and the `so-v25-c2c1` story (`so-library.mts remove "SO-V25-C2C1 save race and NPC switch"`).

### C7: the transition note precedes the reply it announces

Built on the coordinator's instruction (the build item, rule 7 taken as decided). `RuntimeManager.commitBoundary` now posts the note right after the engine commit and its bridge bookkeeping, before `applyActive("activate")` runs the checkpoint effects, whose last step awaits the onEnter NPC reply (`src/runtime/effectsApplier.ts` `fireNpcReplies`). The run check after the announcement stays, so a lapse there now also stops the checkpoint effects. The block moved; the manager's size did not change (budget 740/740, `architecture.test.ts` green).

Behaviour changes, stated: the note also precedes the other checkpoint effects (Author's Note, world info, preset overlay, cast, background) and the boundary's persist, instead of following them. None of these is visible in the transcript except the background. `/comment` emits `MESSAGE_SENT`/`USER_MESSAGE_RENDERED`, not `MESSAGE_RECEIVED` (`slash-commands.js:6143-6152`), so posting it earlier commits no boundary.

Tests (red first): `runtimeManager.test.ts` "v2.5 C7: posts the transition note before the onEnter NPC reply it announces" read `["/trigger", "/comment"]` on the old order and `["/comment", "/trigger"]` now. Two ownership controls encoded the old order and were rewritten to the new one: "a boundary that lapses during persistence stops before observers, after the announcement it already posted" (cited by fault matrix `persistence|afterHostWrite`, citation and note updated) and "a boundary that lapses during announcement stops before checkpoint effects and observers". Census note `RuntimeManager.commitBoundary` updated. `test/scenarios/live-v25-02-c7-note-order.json` `_note` no longer says expected red.

Live re-run owed (lane, ×2, after `npm run build` + `st-session.mts reload` on the lane): `node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --group 1759606632088 test/scenarios/live-v25-02-c7-note-order.json`. Green = both runs pass (noteIndex < replyIndex). Plan 01's G4 note (J3.2 "Accept the Mission" within 15 s) should stop timing out for this reason; re-run J3 in scan mode once to see it.

## Gate record (C2 guard + H1 harness, code)

2026-09-26, worktree on master `0ae7107`. Code only: nothing live, no lane, main ST or `C:\dev\so-lanes` touched. `src` change is local to `src/services/stHost/persistence.ts`.

### C2: late-bound save of ours refused whatever its rows

- **Guard** (`switchRefusal`, `src/services/stHost/persistence.ts`): a chat save is held back when an armed save of ours (an observation armed with a chat id: `persist` via `observeNextSave`, `saveOpenChat`) was asked for chat X, the request names chat Y ≠ X, and Y is the chat ST has open at post time. That is the late-binding signature (`saveChatConditional` reads the open chat after its 100 ms poll). The row count no longer matters. It is recorded like the empty case: `report(...lost)`, so the save evidence reads `lost` and the next persist retries in the right chat. The empty-save rules are unchanged.
- **ST's own saves are not blocked:** a save with no armed save of ours is sent (control), and a save of a chat that is NOT the open one (ST's `/branch-create` writes the branch file while the parent is open) is sent (existing control `a save of another chat that carries messages is sent`). Residual, by design: the watcher attributes the first chat save after an arm to us (the model since v2.3 plan 06). If ST's own save of the newly opened chat is the first request inside our ~100 ms window, it is held back, and our own late save, posted just after with the same open chat's state, goes out unarmed. No unit case can separate the two; the live re-run below is what measures it.
- **Refusal ring for the recorder:** every refusal is pushed to `globalThis.storyOrchestratorSaveRefusals` (cap 50, monotonic `seq`: file, rows, integrity slug, `askedFor`, open chat, reason). `so-save-recorder.mts` drains it: when our watcher is outermost (the live case) the refusal becomes its own record (`source: 'watcher'`), ordered before the next event the recorder sees; when the watcher is inner, the recorder marks its own record `refused` instead of recording it twice. Refusals present before `arm` are not imported. `flagSaves` adds a `refused` flag.

| Check | Result |
|---|---|
| Red first (ring exported, guard not yet built) | `npx jest src/services/stHost/saveWatcher.test.ts`: 4 failed, 18 passed (the two refusal cases hang on the posted request; the two controls failed on the leftover pending request, since fixed with `sentBy`, which answers what went out) |
| Green | 22/22 in `saveWatcher.test.ts`, 24/24 with `persistence.test.ts` |
| Mutant 1: row-count condition reinstated (`if (!target \|\| target.messages > 0) return null;`) | 2 failed, 20 passed: both refusal cases (`Expected: 0, Received: 1` requests sent); every control green. Restored |
| Mutant 2: open-chat check dropped (refuse any other-chat save while armed) | 1 failed: `control: a save of another chat that carries messages is sent` (the branch-create shape). Restored |
| Recorder | `node --test scripts/debug/so-save-recorder.test.mts`: 9/9 (3 new: watcher outermost drained from the ring and ordered, watcher inner marked not duplicated, pre-arm refusals not imported) |

### H1 (S12 shape): cleanup restores the library snapshot

- **Shape, both runners.** `so-scenario` (`cleanupScenario`) and `so-journey` (`runCleanup`) captured the library as a list of hashes and removed every hash the run *played*. An import under an id the install already had replaced that record (new hash), and cleanup then removed the replacement, so the id was gone (lane 2's `v24-01-delete-decode@1`). An edited re-import carried a hash cleanup never recorded, so it stayed behind (plan 11 L5). `so-journey` had the identical code path.
- **Fix.** `scripts/debug/lib/librarySnapshot.mts`: `captureLibrary` copies the whole `v2Stories` list before the run (`{trusted, records}`); `restoreLibrary` plans with the pure `planLibraryRestore` (`lib/configRestore.mts`, keyed by story id, hash when there is none) and writes back exactly the snapshot: pre-existing records as they were, in their old order, and every record not in the snapshot removed. It saves through `saveSettingsNow`, reads the library back and reports `{changed, restored[], removed[], verified}`; a mismatch or a failed save is an `error`, which fails the journey's cleanup gate and the scenario run. An untrusted capture changes nothing (S6, unchanged). `removableStories` is gone; both runners share the new pair.
- **Decision to note:** the restore is exact, so a story a **peer** session added to the same install during the run is removed too (reported by id in `library.removed`). `mergeRestore`'s S12 peer-keeping still applies to the config restore, but the library restore runs after it. Lanes make installs private, so this only matters on a shared main install.

| Check | Result |
|---|---|
| `node --test scripts/debug/lib/configRestore.test.mts` | 10/10 (5 library cases: same-id restored, run-created and edited re-import removed, untouched library not rewritten, deleted pre-existing record comes back in place, untrusted capture changes nothing; the S6 title the findings ledger cites is kept) |
| `node --test scripts/debug/lib/librarySnapshot.test.mts` (new) | 4/4 against a fake page: the live H1 shape end to end (restored + removed, one save, `settings` untouched), capture is a copy, untouched library writes nothing, untrusted capture restores nothing |
| Mutant: restore keeps only the current records whose key existed before (the hash-era outcome) | 4 failed (both H1 cases, the in-place restore, the copy case), 10 passed. Restored |

### Machine gates (both commits)

`npm run typecheck` 0 errors · `npm run typecheck:test` 0 errors · `npm run lint` clean · `npm test` 282 suites passed (1 skipped), 4027 tests passed (1 skipped) · `npm run debug:typecheck` 0 errors · `npm run test:debug` 328 tests, 327 pass, 0 fail, 1 skipped (320 pass after the C2 commit). `test:debug` needs a built `dist/manifest.json` (`so-run-header.test.mts` reads it); a fresh worktree has none, so `npm run build` ran first (dist is untracked, nothing served).

### Live re-run owed for C2 (not run here)

The guard is not live-green. Re-run the plan-02 C2 recipe on a **lane**, with a new bundle, ×2 green:
1. `npm run build`, `st-lanes seed 1 --fresh`, `st-session reload`, `so-run-header capture` (bundle ≠ `0f4332fac075`), `open-group 1759606632088`.
2. The red fixture the attribution asked for: the solo chat **with messages** (the populated-solo case), not the empty one. `so-save-recorder.mts arm`, then `test/journeys/records/v2.5-plan02/C2/c2-attempt.js` with the setting write (`setUiSettings`) immediately before `/go`.
3. Pass: the drain shows a `refused` record (`source: 'watcher'`, `askedFor` = the group chat, file = the solo chat, rows > 0); the solo chat's message rows on disk are unchanged before/after; the group chat's `saveHealth` reads `lost` and the next persist in the group chat lands (read-back boundary equal). Also assert no ST save of the solo chat was refused when the setting write is NOT made (control arm, ×2).
4. Archive under `test/journeys/records/v2.5-plan02/C2-guard/`.

## Gate record (A37 output budget, code, 2026-09-26)

Branch `worktree-agent-a29ead4c8b5273158`, fast-forwarded to master `c743bedd`. Code and docs only: no lane, no main ST, nothing under `C:\dev\so-lanes` touched. Worktree gates use a `node_modules` junction to the main checkout.

- **Cause, verified on ST 1.19.0 `7c3994196`.** `ConnectionManagerRequestService.sendRequest` puts `maxTokens` in `max_tokens` and spreads our override after it (`public/scripts/extensions/shared.js:473,478`). `TextCompletionService.processRequest` runs `createRequestData` (`custom-request.js:287`, which adds `max_new_tokens: max_tokens` at `:91`), then with the profile's preset `presetToGeneratePayload` (`:320`) builds the preset payload through `createTextGenGenerationData(settings, model, prompt, preset.genamt)` (`:411`) and spreads the request over it (`:414`). `createTextGenGenerationData` fills `max_new_tokens`/`max_tokens` (`textgen-settings.js:1603-1604`) and `n_predict`/`num_predict` (`:1696-1697`) from that `genamt`, so only the two keys the request named carried our budget. Ollama reads `num_predict` (`src/constants.js:321-322`). Host-facts row added to `docs/plans/v2/00-implementation-overview.md` after the `ConnectionManagerRequestService` row.
- **Fix.** `src/services/stHost/modelReply.ts` `samplerPayload(apiSelected, samplers, maxTokens)`: on a Text Completion profile the override names `TEXT_COMPLETION_BUDGET_KEYS` (`max_tokens`, `max_new_tokens`, `n_predict`, `num_predict`) = the call's budget, with or without samplers (the breaker probe sends none). Chat Completion is unchanged (`{stream:false}`): the CC preset path spreads the request last too (`custom-request.js:605`), so `max_tokens` holds.
- **Every role.** All model calls go through `requestModelReply`: `callExtractionReply` (read, synthesis, authoring, director, curator; every `maxTokensFor` family, the live suite, role calibration) and `probeModel` (`PROBE_MAX_TOKENS` 8). The judge is the TypeSafe plugin, not an LLM profile. The loud-generation sampler overlay never writes a budget (`SAMPLER_OVERLAY_NEVER` holds `max_tokens`/`max_new_tokens`, and no overlay table maps to `n_predict`/`num_predict`).
- **Tests** (`src/services/stHost/modelReply.test.ts`, new `describe "A37 …"`). Red first: 2 failed / 26 (`n_predict`/`num_predict` were the preset's 1200 after the ST-shaped merge; the override lacked the four keys). Green: 26/26. Cases: budgets 512, 1024 and 16 (no samplers) reach all four keys after `{...presetPayload, ...override}`; control: `num_ctx`, `truncation_length`, `top_k`, `min_p`, `repeat_penalty`, `dry_multiplier`, `stop` are the preset's, and the override carries exactly `stream`, `temperature`, `top_p` + the four budget keys; control: a CC profile's override stays `{stream:false}`.
- **Live fixture (not run here):** `test/scenarios/live-v25-02-a37-output-budget.json`. It asks each of the five roles for 16 tokens through the new `storyOrchestratorLiveSuite.askModel(prompt, maxTokens, role)` (`src/runtime/liveSuite.ts`, the same `callExtractionReply` seam), wraps `fetch` for `/api/backends/text-completions/generate`, and fails unless every body carries 16 in all four keys and the llama answer's `timings.predicted_n` (else `tokens_predicted`, else `usage.completion_tokens`) is ≤ 16. Eval syntax-checked with `new Function`.
- **Not covered:** CC reasoning models (o1/o3/o4, gpt-5, gpt-6-astra) have ST move the PRESET's `max_tokens` into `max_completion_tokens` (`openai.js:3052,3075,3098`) before our spread; no such profile exists on this install.

Gates: `npm run typecheck` 0 errors · `npm run typecheck:test` 0 errors · `npm run lint` clean · `npm test` 285 suites / 4048 tests passed · `npm run build` ok (`dist/manifest.json` for `test:debug`) · `npm run test:debug` 328 tests, 327 pass, 0 fail, 1 skipped.

Live re-check owed (lane 2, new bundle, x2): `npm run build`; `node scripts/debug/st-lanes.mts run 2 -- scripts/debug/st-session.mts reload`; `node scripts/debug/st-lanes.mts run 2 -- scripts/debug/so-run-header.mts capture --label a37`; `node scripts/debug/st-lanes.mts batch --lanes 2 --repeat 2 --group 1759606632088 test/scenarios/live-v25-02-a37-output-budget.json`; archive under `test/journeys/records/v2.5-plan02/A37/`. Then re-take the A11 base run, since every read was budgeted for 512 reply tokens but could run to 1200.

## Gate record (A11 arm harness: forcedTimeoutScale + targeted scale, code, 2026-09-26)

Branch `worktree-agent-a29ead4c8b5273158` (master `c743bedd` + A37 + A3 UI commits). Code and docs only: no lane, no main ST, nothing under `C:\dev\so-lanes` touched.

- **(a) Lower bound.** `scripts/debug/lib/timeoutArm.mts` `forcedTimeoutScale(run, mode)`: in `whole` mode the floor is `max(ms × 1.1 / budget)` over every OTHER pass, i.e. each must answer on its FIRST ask (it used to divide by `TIMEOUT_RETRY_SCALE`, which admitted scales where windows timed out too). The fixture now fails when any pass other than the whole-chat pass shows a timeout retry.
- **(b) Retry model.** A retry is no longer a cold ask. `retryCostMs(coldMs, depth)`: an abort deeper than `CACHE_REUSE_MAX_DEPTH` 0.5 re-reads cold at `DEEP_ABORT_RETRY_COST` 1.85× (llama-abort-probe2: 211423 ms after a 100 s abort vs 114310 ms cold, `cache_n` 0); a shallower one reuses the cache and re-reads the rest at `SHALLOW_RETRY_SLOWDOWN` 1.33× per token (probe 1: 60 s abort, `cache_n` 55296, retry at 602 vs 799 tok/s). The shallow model over-predicts the measured 55857 ms retry (72218 ms), so it errs safe. With the 2× retry and 10 % margins, the deep branch is empty (needs depth > 1.0175 while the cut must fall below 0.9), so the whole-chat pass must be cut at depth 0.422–0.500. A mode with no such scale returns `{ok:false, reason:"infeasible: …"}` naming both constraints; `so-timeout-arm` exits 1.
- **Why the archived arm failed, by the model:** scale 0.39 cut the whole-chat pass at 100028 ms of 137795 (depth 0.73, deep), so the modelled retry (254921 ms) exceeds its 200056 ms budget; live it missed 200 s the same way.
- **(c) Targeted mode (default).** `src/extraction/callBudget.ts`: `debugCallBudgetScale(kind)` / `callTimeoutMs(maxTokens, inputTokens, kind)` apply the debug scale only to the pass kind named by the new `storyOrchestratorDebugCallBudgetTarget` (unset or `""` = every kind, as before; no scale = inert whatever the target). `ExtractionClientOptions.budgetKind` carries it (`src/extraction/client.ts`), and `ExtractionCoordinator.backlogRead` stamps `budgetKind: reason` (`memorize:window` / `memorize:full`). No product path sets either global; `so-scenario --sandbox` clears every `storyOrchestratorDebug*` global at start and cleanup. `live-v25-05-memorize-timeout.json` reads `localStorage['so-v25-a11-target']` (must be `memorize:full` or absent), sets/clears the target global, records it in `R.forcedArm.target`, and its cleanup step deletes both globals. `so-timeout-arm.mts scale <log> [--mode targeted|whole]`; `setScaleCommand` writes the target key for targeted and removes it for whole.
- **Archived base.log** (`test/journeys/records/v2.5-plan02/A11-exclusive/base.log`, passes n=3 123488 ms, n=4 16087 ms, n=5 137795 ms): `whole` → infeasible ("every other pass must answer on its first ask (needs > 0.529, pass n=3 at 123488 ms), while the whole-chat pass (n=5, 137795 ms) must time out at an abort depth of 0.422-0.500 of its run so its 2x retry still answers (scale 0.227-0.269)"); `targeted` → **scale 0.248**: first ask 63608 ms (depth 0.462, cache reused), retry budget 127216 ms vs modelled retry 98669 ms. The v2.4 run3 log gives the same shape (whole infeasible, targeted 0.272).

| Check | Result |
|---|---|
| `npx jest src/extraction/callBudgetScale.test.ts src/runtime/coordinators/budgetWiring.review.test.ts`, red first | 2 failed / 29: the target was ignored (`callTimeoutMs(…, "memorize:window")` scaled) and every window's budget was scaled |
| same, green | 29/29. New: a target names the one kind the scale reaches (another kind and a call naming none keep their budget; removing the target restores the uniform scale); a target without a scale, or an empty one, is inert; through the real coordinator a `memorize:full` target leaves every window's budget equal to the unscaled run, scales the full pass to `round(unscaled × 0.25)` and gives its retry exactly 2× that; control: no target scales every window |
| `node --test scripts/debug/lib/timeoutArm.test.mts` | 12/12 (was 7). Against the old module the new file fails at import (`retryCostMs`, `CACHE_REUSE_MAX_DEPTH` … missing), and the old module's verdict on base.log was `ok: true, scale 0.39` (the archived `scale.json`), which the new "(b) … as measured live" case shows missing its retry. Cases: base.log whole infeasible with the reason text; base.log targeted 0.248 with first ask < 0.9 × measured, depth ≤ 0.5, retry budget > 1.1 × modelled retry; run3 same shape; retry model values (deep 1.85×, shallow 0.4 → 79800 ms, not below the measured 55857 ms); (a) a window at 70000 ms that the old retry-based floor admitted is refused in whole mode and fine in targeted; whole mode feasible when the windows answer early; base arm already over budget refused; empty/`maxTokens` 0 controls; log parsing; set commands for both modes |

Gates: `npm run typecheck` 0 errors · `npm run typecheck:test` 0 errors · `npm run lint` clean · `npm run debug:typecheck` 0 errors · `npm test` 285 suites / 4052 tests passed · `npm run test:debug` 333 tests, 332 pass, 0 fail, 1 skipped. The eleven fixture evals syntax-check with `new Function`.

Live re-check owed (lane 2 alone, other lane idle, new bundle, after the A37 re-check, because A37 changes every pass's reply length and therefore the base timings): `npm run build`; `node scripts/debug/st-lanes.mts run 2 -- scripts/debug/st-session.mts reload`; a fresh base run `node scripts/debug/st-lanes.mts batch --lanes 2 --group 1759606632088 test/scenarios/live-v24-03-memorize.json` (keep its stdout log); `node scripts/debug/so-timeout-arm.mts scale <that log>` (targeted); run the printed `set` command through `node scripts/debug/st-lanes.mts run 2 -- scripts/debug/st-eval.mts "…"`; then `node scripts/debug/st-lanes.mts batch --lanes 2 --repeat 2 --group 1759606632088 test/scenarios/live-v25-05-memorize-timeout.json`. Green ×2 = the whole-chat pass times out once at its scaled budget (±5 %/5 s), its retry answers, no other pass times out, the backlog completes with no `lastError`. Then the negative control once on a mutant build (`TIMEOUT_RETRY_SCALE = 1`) with `so-v25-a11-control` = `1`. Archive under `test/journeys/records/v2.5-plan02/A11-targeted/`.
