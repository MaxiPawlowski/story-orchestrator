# Plan 02 — Carry-in: what v2.4's records found and left open

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on the v2.4 entry condition (overview V1). Runs in
parallel with plan 01. Verified against master `1ad1a5f` on 2026-09-25. **Re-verify every path:line before
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

C5 is taken here only if v2.4 plan 09 does not close it (see the overview's §v2.4 residue).

## C1 — Effect-fired NPC replies outlive their chat

**Verified current state (2026-09-25)**

| Claim | Seen |
|---|---|
| `fireReply` runs `/sendas … raw=false` or `/trigger await=true <member>` with no signal | `src/runtime/effectsApplier.ts:120-128` |
| `executeSlashCommands` takes no abort option | `src/services/stHost/slashCommands.ts:45-48` (options `{silent, delayMs}`) |
| The loop checks ownership before each reply, then awaits the reply and writes `extras.lastSelfInjectionMessageId = lastMessageId()` with **no** check after the await | `effectsApplier.ts:371-385` |
| `lastMessageId()` reads the **open** chat; `extras` is the object captured at entry | `effectsApplier.ts:130`, `:363` |
| The census calls the site `checked` | `test/findings/ownership-sites.json:252-254`. The row itself says "The trigger (generating) branch is still unproven live" |
| The fault matrix says `effects|aborted` is `na`: "Performs no model call" | `test/findings/faultMatrix.json:440-442`. `/trigger` starts a main-model generation, so the reason is wrong |
| Plan 03's abort reaches the scheduler, passes, curator, expansion and director, not effects | `v2.4/03-off-path-call-hygiene.md:600`; `src/runtime/runOwner.ts:96-127` |
| Nothing in `src/` calls `stopGeneration` | grep, 0 hits. It is on the context (`public/scripts/st-context.js:146`); `script.js:5607-5620` aborts ST's `abortController` and emits `GENERATION_STOPPED` |

**Consequence (from the code, not yet measured).** The write at `:384` lands in the extras of the chat the sequence
started in, carrying the message id of whatever chat is now open. That is the census gotcha's shape: "checked"
means a check exists in the body, not that every write follows one (`.claude/rules/gotchas.md`, "A `checked` row …").
Whether the in-flight `/trigger` reply itself lands in the next chat depends on ST's chat-switch behaviour during a
generation. **That is not established.** Step 0 measures it before any stop is built.

**Design**
1. A `stillOwns()` check after `await fireReply(reply)` and before the `:384` write. A lapsed sequence returns
   without writing.
2. **Only if step 0 shows a reply landing in the next chat:** when ownership lapses during an awaited `/trigger`,
   stop the generation, but only if it is still **ours**. That means the outermost loud generation the T6 tracker
   (`runtime/generationLifecycle.ts`) opened for this `/trigger`, still open. A stop without that proof could cancel
   the player's own generation in the new chat, so none is issued. The stop goes through a new `stHost` seam
   (`stopGeneration` from the context; inv 2) and returns a typed `WriteResult`.
3. Correct the fault-matrix cell (`effects|aborted`) to `covered` with the new test, or `partial` with the step-0
   finding. Re-key the census note.

**Host facts owed** (new rows in the v2.5 host-facts section, both versions):
- what ST does with an in-flight `Generate` when the chat changes (`openGroupChat`, `openCharacterChat`, `/go`);
- whether `/trigger await=true` resolves on stop;
- whether `GENERATION_STOPPED` from `stopGeneration` reaches our lifecycle tracker the same way a click does.

**Tests**
- Jest (red first): a fake `executeSlashCommands` that resolves after the ownership token lapses. It asserts that
  `lastSelfInjectionMessageId` is unchanged, and that no stop is issued when the open generation is not ours.
- Mutants: delete the post-await check; delete the "is ours" guard (if step 2 is built).
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
| `01-H10`, `01-H13` 1.18.0 column | "re-check" (`host-facts.md:26,29`) | still owed. Plan 10's clean-host-older run covers them |

## C5 — Intermittents (only if v2.4 plan 09 leaves them open)

| Check | Recorded | Diagnostic in place |
|---|---|---|
| J6.4 `#so-rollback-notice` absent | once; not reproduced in 8 runs (`01-carry-in.md:774-776,819`) | wait + state dump (`8728d91`) |
| J6.7 story at cp1 while a cp2 NPC reply fired | once; not recurred in 6 (`:771,820`) | none specific. **C1 is a candidate cause**: an NPC reply that outlives its checkpoint is the same shape. Re-run after C1 |
| J5.8 private block missing from a drafted member's request | 1 of ~6 (`:821`) | lifecycle timeline (`b900b7c`) |
| J8.5 continuity note missing | once (`:822`) | diagnostic (`ef6253b`) |

Predeclared: each journey ×5 consecutive on the plan's final tree with the diagnostics armed. A recurrence becomes a
fixture and a fix. 0 of 5 closes the row as "not reproduced on <bundle>", with the records archived.

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
