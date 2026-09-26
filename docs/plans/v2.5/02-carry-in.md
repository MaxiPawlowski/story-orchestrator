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
