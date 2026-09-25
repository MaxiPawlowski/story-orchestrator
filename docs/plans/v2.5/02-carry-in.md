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
