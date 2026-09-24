# Plan 01 — Carry-in

**Status: NOT STARTED.** This plan depends on the frozen v2.3 candidate (00-overview D1): v2.3's queue is
closed or signed off, and L1 is recorded. Nothing here is built early. The doc is reconciled with 00-overview
§Reconciliation X3–X10 (2026-09-23), and where they differ, the reconciliation wins.

The current-state lines were re-verified 2026-09-23 on HEAD `fcc33cc`. The working tree also carries
uncommitted edits from another session, which is still changing `stagecraftCoordinator.ts`, `st-actions.mts`,
`worldInfo.ts` and other files. **Re-verify every cited line on the frozen candidate before the first commit.**
The ST working tree is `7c39941` (1.19.0). The pinned older host `51ad27f` (1.18.0) was read with `git show`
in the ST repo, without network access.

## Goal

Four things that v2.3 certifies, or that spec v2 promises, do not hold on the host as it really is:
1. **T1:** a middle delete rolls back the wrong range. This breaks plan 04's `rollback ≡ replay` end to end.
2. **T10:** after our own transition note in a group, the active speaker reads null. This breaks plan 05's
   per-member blocks, leaks every member's private knowledge through the `story_epistemic` macro, and
   switches off talk `no_repeat`.
3. **T6:** a nested, quiet or foreign generation clears the drafted member's private block and spends the
   warden note. Plan 05's claims hold only when nothing else generates inside the turn.
4. **Guidance (D7):** checkpoint `guidance` is never injected (spec v2 §75/§225), so a generated checkpoint
   gets no steering at all.

Plan 01 proceeds in order:
- it writes the failing interop fixtures first, plus the harness they need (X4, X10);
- it fixes the four defects;
- it builds the over-steer probe (X8) and the v2.4 host-facts table (X9);
- it corrects the v2.3 docs and comments that state the opposite (T21, T4, T2, and the playbook §0).

## Scope / out of scope

**In:**
- T20 no-backend rows for the plan-01 shapes, plus the event-name guard;
- the X4 and X10 harness;
- T1, T10 (with the macro leak and `no_repeat`), T6 and guidance injection;
- the over-steer probe;
- `host-facts.md`;
- the corrections table.

**Out:**
- T20 rows owned by plan 02: silent edit, `/hide`, `messageEditMove`, same-chat reload and branch;
- tool-call policy and post-processor rewrites (plan 04 and v2.5);
- T3 fingerprints (plan 02, X1/X2);
- the T4 abort wiring (plan 03). Plan 01 only corrects the comments;
- the objective line (T16, plan 06) and the `player_attempts_only` clause (plan 04, X13). Both are added
  later to plan 01's guidance block;
- ~~the P0′ replay converter~~: **in scope**. X10 now lists it (added 2026-09-23 at reconciliation); build it
  beside the replay-equality check, since plan 09 row R1 replays P0′ through it.

**No blob or schema change.** The T1 snapshot lives in memory, and `guidance` already exists in the schema.

## Verified current state

| Item | Code now (path:line) | Drift vs SUMMARY |
|---|---|---|
| T1 subscribe | `src/runtime/turnBridge.ts:56` passes `MESSAGE_DELETED`'s payload on as a message id | matches |
| T1 decode | `turnBridge.ts:159-170`: `hostMessageId(value)` → `turnKeys` purge with `keyed >= messageId` (`:167`) → `rollbackFromMessage` (`:169`) → `runtimeManager.ts:365-371` (`owner.noteMutation` `:368`, then `runRollback` `:370`, `rollback.ts:35`). **Corrected 2026-09-24** on `eb50a00`: the manager lines were `:349-355` | matches. **New:** `src/services/stHost/events.ts:17` types the payload as `[messageId: number]`, which is wrong |
| T1 harness | `scripts/debug/st-actions.mts:302-320` (**corrected 2026-09-24**, was `:299-317`) `deleteMessage` sets `chat.length = id` (`:311`), then emits `MESSAGE_DELETED(id)` (`:318`). That is a tail cut, and `id` equals the post-delete length. `plan03a-delete-rollback.json:71` (`delete: 0`), `plan03a-edit-rollback.json` and J6 all use it | **New (X4):** v2.3's delete coverage only ever exercised the shape that already decodes correctly. Nothing calls ST's `deleteMessage` (`ctx.deleteMessage`, `st-context.js:142`) or `/cut`. The file also carries uncommitted edits |
| T10 speaker | `src/runtime/roster.ts:30-42` skips only `is_user`. It returns null at the first named non-user row that is not an enabled roster member | matches (re-verified on `eb50a00`, 2026-09-24) |
| T10 impact | `memoryCoordinator.ts:448` → `inject.ts:27`: a null speaker **drops** per-member facts. Also `:494` (`onMemberDrafted` fallback), `:405-406` (`getEpistemicBlock`), `:503` | **corrected 2026-09-24:** the injection moved out of the coordinator in V26. On `eb50a00` it is `src/runtime/memoryInjector.ts:66-67` (`update`: `activeSpeakerId` → `applyMemoryInjection` → `inject.ts:27`), `:112` (`onMemberDrafted` fallback), `:121` (`blocks()`), `:124-130` (`epistemicBlock`, the all-names merge at `:128`); `memoryCoordinator.ts:429` only delegates. **New (X5):** with a null speaker in a group, `getEpistemicBlock` renders `enabledCharacterNames(story)`, i.e. **every member's private knowledge merged**, into `story_epistemic` (`macros.ts:55`). That is an inv-15 breach. Talk `no_repeat` reads the same function (`runtime/index.ts:166` → `talkControl.ts:208` → `talk/rules.ts:60`, all three re-verified) |
| T10 timing | `updateInjection` runs at `runtimeManager.ts:268`, **then** `announceTransition` at `:273` (`effectsApplier.ts:171-175`, `/comment compact=true`). The next `updateInjection` sees the Note as the last row; `onGenerationEnded` → `clearPrivateInjection` (`:637`, `:640`) is one such call | **corrected 2026-09-24** (`eb50a00`): `updateInjection` `runtimeManager.ts:284`, `announceTransition` `:289` (`effectsApplier.ts:178-185`, `/comment compact=true raw=false`), `onGenerationEnded` `:621` → `clearPrivateInjection` `:624`. The order and the consequence are unchanged. The live probe must run after an ENDED or a memory commit |
| T6 wiring | `runtime/index.ts:189` runs `onGenerationStarted`, `capturePayload` and `talk.onGenerationStarted` on every STARTED. `:191-192` runs `onGenerationEnded` on every ENDED or STOPPED, foreign `{source}` ones included. Only lore skips dry and quiet runs (`:156`) | matches |
| T6 manager | `runtimeManager.ts:636`: a quiet or impersonate STARTED → `withholdPrivateKnowledge` (`memoryCoordinator.ts:482-484`). `:637`: every ENDED → `clearPrivateInjection`, `clearCopilotNudge` and `clearContinuityNote` | the SUMMARY T6 row cites `:635-636`; it is **636-637**. **Corrected 2026-09-24** (HEAD `eb50a00`): `runtimeManager.ts:620` (`onGenerationStarted`) and `:621` (`onGenerationEnded`); the withhold is `memoryCoordinator.ts:444` → `memoryInjector.ts:100-102` (moved out by v2.3 V26) |
| T6 warden | `stagecraftCoordinator.ts:457-468`, at STARTED: skips dry, quiet and impersonate runs, but not a non-string `{source}` type. Otherwise it sets the note, marks it `applied` and saves. `clearContinuityNote` is `:470-474` | +1 line vs `456-466`; the file has uncommitted edits. **Corrected 2026-09-24** (HEAD `eb50a00`): `onGenerationStarted` is `:472-483` (the `applied` mark and save the split replaces are `:480-482`), `clearContinuityNote` is `:485-489` |
| T6 talk | `talkControl.ts:87-90`: any STARTED with a numeric `force_chid` sets `pass.forced`. `:92-94`: any ENDED nulls `forcedChid` | matches |
| T4 comments | `runOwner.ts:56-63` (the claim is `:60-62`); `judge/types.ts:65-69`; `epochAbort.review.test.ts:8-11`. Plan-03 statement: `03-async-ownership.md:1676-1684` and table row `:1789` | the first two have drifted +1 |
| T21 | see §Corrections | the claim sits at `10-judge-seeds.md:155,157-158,168,169-174` (not `:160-161`) and at `11-acceptance.md:808-809`. `.claude/CLAUDE.md:20` states it ×3. **New:** `test/findings/ledger.json:248` |
| T2 | `03-async-ownership.md:2715` | matches |
| Guidance | Authored: `engine/schema.ts:156`, parsed at `engine/validate.ts:344`. Generated: `schema.ts:188`, required at `generation/parse.ts:111-120`, merged at `generation/merge.ts:29`. **No injection reads it.** `expansionCoordinator.ts:176` (was `:168`; corrected 2026-09-24 on `eb50a00`) passes beat guidance only to the judge's expansion check. `constants/injectionRegistry.ts:12-23` has no key for it. Depth 4 already holds `{memoryFacts, epistemic}` as an allowlist pair (`:26`), plus the dynamic nudge. Every block is written at system role (`stHost/extensionPrompts.ts:25`) | D7 holds for injection. Sun-ruins has guidance on 3 of 9 checkpoints (`cp1`, `cp-4a`, `cp-4a2`) and an author note on 9 of 9 |
| Budgets | manager 677/700; `memoryCoordinator` 614/620; `pacingCoordinator` 103; `stagecraftCoordinator` 475. **Corrected 2026-09-24 on `eb50a00`:** budgets are EFFECTIVE lines since V22b (`architecture.test.ts:9-28`, every started 120 characters counts), manager budget 740: manager **736**/740, `memoryCoordinator` 597/620, `pacingCoordinator` 110, `stagecraftCoordinator` 541 | SUMMARY says 676. The manager has 4 spare effective lines, not 23 |

## Host facts

Plan 01 creates **`docs/plans/v2.4/host-facts.md`** (X9) with these rows, labelled `01-H1`…`01-H13`.
Columns: fact, 1.19.0 file:line, 1.18.0 file:line, verified date, plan. Every later plan appends its own
rows there, and rule 2 cites the file.

The 1.19.0 lines are from `public/`, verified 2026-09-23. The 1.18.0 lines are from `51ad27f`.

| # | Fact | 1.19.0 | 1.18.0 |
|---|---|---|---|
| H1 | `MESSAGE_DELETED` payload = the **post-delete `chat.length`** | `script.js:1611` (`deleteLastMessage`), `:1699` (`deleteMessage`), `:4411` (regenerate/swipe tail pop), `:11734` (delete-mode truncate) | `:1609`, `:1672`, `:4352`, `:11672` |
| H2 | Tail paths therefore decode **correctly** today; only a non-tail `deleteMessage` or `/cut` is wrong | splice-from-end `:1683-1690` | same |
| H3 | One event can remove **several** messages (a tool-call run before the reply) | `getMessageDeletionStartId` `:1614-1630`; param `:1639` | **no**: `deleteMessage(id, swipe, ask)` `:1618` splices one message. The row is `blocked` on 1.18.0 (X4) |
| H4 | `/cut a-b` = one `MESSAGE_DELETED` per message, each after its own splice | `power-user.js:2820-2857` | `:2848` |
| H5 | `GENERATION_ENDED` comes from `hideStopButton`, only while `#mes_stop` is visible; its payload is `chat.length`. **ENDED is not paired with STARTED** | `script.js:3532-3537` | `:3473-3477` |
| H6 | A nested quiet run's `unblockGeneration` → `activateSendButtons` clears `is_send_press` and `dataset.generating` mid-turn. `isGenerating()` = `is_send_press \|\| is_group_generating`, so in solo `isHostGenerating()` reads **false** inside the outer generation | `:5693-5704`, `:7075-7080`, `:604` | `:7016` |
| H7 | `GENERATION_STARTED(type, {automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage}, dryRun)`; `AFTER_COMMANDS` takes the same arguments | `:4299`, `:4321` | `:4240` |
| H8 | `generateQuietPrompt` → `Generate('quiet', {… force_chid: forceChId ?? null})`; positional calls are accepted with a trace | `:3084-3108` | `:3025` |
| H9 | `/comment`: `name 'Note'` (`slash-commands.js:3772`), `is_system:true`, `extra.type:'comment'`. It emits `MESSAGE_SENT` and `USER_MESSAGE_RENDERED`, never `CHARACTER_MESSAGE_RENDERED` | `slash-commands.js:6113-6152` | `:6112-6117` |
| H10 | `/sys`: `name` = `narrator_name` or `'System'`, `is_system` only for a bias-only message, `extra.type:'narrator'` | `slash-commands.js:6020-6036`, `:3770-3771` | re-check |
| H11 | Group `/sd` post: `name = systemUserName` (`'SillyTavern System'`, `script.js:405`, **not on the context**), `is_system: !visible`, media in `extra.media[]` (not `extra.image`) | `stable-diffusion/index.js:4966-4991` | `extra.media` too |
| H12 | `sendRequest` honours `custom.signal` | `shared.js:395`, `:415`, `:423-424`, `:464`, `:484`; wrapped at `:487-489` | `:391`, `:411`, `:420`, `:458`, `:478` |
| H13 | Author's Note defaults: depth 4, system role | `authors-note.js:272,275` | re-check |

Third-party facts go in the same file, marked "not ST":
- **Stepped Thinking** (`b79df5e`):
  - listeners `thinking/engine.js:50-61`, with `AFTER_COMMANDS` at `:56`;
  - the thought is a positional `generateQuietPrompt(…, characterId)` at `:443-451`, i.e. **a quiet run with
    `force_chid`**;
  - its regenerate path calls `Generate(null, {force_chid})` at `:293` (a **null type**);
  - `settings` is a live reference to `extension_settings['st-stepped-thinking']` (`settings/settings.js:53-56`),
    and `is_enabled` is read at `engine.js:490`, so an in-place flip takes effect immediately. This install:
    enabled, `is_enabled:false`, `mode:'embedded'`.
- **Guided Generations** (research clone `64456d4`; not installed here): `emitGenerationEvent` at
  `scripts/utils/llmClient.js:565-572` emits **single-argument `{source}` payloads** for `GENERATION_STARTED`
  (`:899`, `:912`), `GENERATION_ENDED` (`:908`, `:914`) and `GENERATION_STOPPED` (`:917`).

Re-check on 1.18.0 during the live gate: H10 and H13, and that H3 really is absent.

## Design

### Harness (X4, X10; inv 20)

**Scenario verbs.** New verbs go into `scripts/debug/lib/scenarioSchema.mts` (the closed vocabulary) and
`so-scenario.mts`:
- `host_delete: <id>` → the real `ctx.deleteMessage(id, undefined, false)`;
- `cut: "a-b"` → `/cut` through the slash seam;
- `emit_generation: [{event, args}]` → event-level lifecycle sequences, for the no-backend rows;
- `ext_setting: {extension, key, value}` and journey `setup.extensionSettings`. These snapshot the value,
  write `extension_settings[ext][key]` in place, save, and restore in the runner's `finally`. The read-back
  is reported as `cleanup.extensionSettings`. The first user is Stepped Thinking `is_enabled`;
- `record_state: {as}` plus `expect: {stateEquals: {as, scope}}`, the **replay-equality check**. It records
  engine state (blackboard values and versions, active checkpoint, path, boundary) and the ids of memory,
  epistemic and ledger rows at the boundary before the target message. After the mutation, the state must
  equal that recording. Rows derived from the removed message count as absent (inv 11, live);
- `expect: {overSteer: {…}}` (see below).

The existing `delete` verb keeps its behaviour, and its docs rename it the **tail-truncate** shape.

**Run header.** It gains `thirdParty: {disabledExtensions, installed, watched: {"st-stepped-thinking":
{is_enabled, mode, is_shutdown}}}`, so a flip that was not restored shows up as a blocking diff.

**Foreign-emitter fixture (test-only).** `test/fixtures/interop/foreign-emitter.js` is injected in-page by
the harness and never installed. It reproduces Guided Generations' shape:
- `STARTED({source})`, an optional real `sendRequest` (live row), then `ENDED({source})`;
- a `STOPPED({source})` variant;
- an unpaired ST-shaped `STARTED` with `dryRun:true`.

**Event-name guard.** `scripts/debug/eventNames.test.mts` (node:test) checks that every name `src/` passes to
`subscribeToHostEvents` is a key **or** value of ST's `event_types` (`public/scripts/events.js`). It accepts
`extension_settings_loaded` (`runtime/index.ts:198`). Outside the ST tree it reports `blocked`.

### T1: decode the delete (X3; inv 11, 10, 2; arch "Boundary counters ≠ ST message indexes")
- **Pure `src/runtime/messageIdentity.ts`.** One key per message: `send_date|name|is_user|len(mes)|fnv(mes)`.
  - **No `is_system`** (X3/D5): hiding must never misalign a delete.
  - **No `swipe_id`:** deleting a lower swipe decrements it with `mes` unchanged (X2's host fact), and a real
    swipe already changes `mes`.
- **`decodeDelete(before, afterChat, postLength)`** → `{start, count, basis}`:
  - `count = before.length - postLength`;
  - `start` = the common-prefix length `p`, verified by suffix alignment `before[p+count..] == after[p..]`;
  - `exact` when that alignment is unique;
  - **`ambiguous`** (repeated keys allow several starts) → the **earliest** candidate start, which is a
    superset rollback and never a later one;
  - **`stale`** (no snapshot, `before.length <= postLength`, or no alignment) → the only case that uses
    today's value (`postLength`).
  - Both non-exact results are journaled.
- **Refresh points, keyed by chatId:** `CHAT_CHANGED`, `MESSAGE_SENT`, a rendered reply,
  `MESSAGE_EDITED`/`SWIPED`/`UPDATED`/`SWIPE_DELETED`, and after each handled delete (so a `/cut` range
  re-diffs event by event).
- **`onMutation("delete")`** decodes **before any await**. The `turnKeys` purge and `noteMutation` both use
  `start`.
- Fix the `events.ts:17` type to `chatLength`. Cost: one manager delegate for the journal line (677 → 678).
  **Corrected 2026-09-24:** no delegate; the journal line rides `rollbackFromMessage(start, decoded?)` into
  `runRollback`, which already holds the journal (manager stays 736/740 effective lines).

### T10: the speaker skips non-turn rows (X5; inv 15, 16)
- **`activeSpeakerId`** (`roster.ts:30`) `continue`s past (D9 shape rules):
  - `is_system === true`;
  - `extra.type` set to anything other than `'narrator'`;
  - `name === systemUserName`, read through a new `stHost/generation.ts` export from the script module that
    file already imports (inv 2);
  - a `/sys` narrator row (`extra.type === 'narrator'`) whose name is not an enabled roster member. It
    stays a speaker for the reply's text, but is not a *character*; a narrator row whose name **is** a
    roster member counts as that member.
- **Macro (X7, inv 15):** in a group, `getEpistemicBlock` returns the **applied** block
  (`getAppliedEpistemicBlock`). That is empty at rest and the drafted member's own block while drafted; the
  all-names merge is gone. Solo is unchanged. Net zero lines in `memoryCoordinator`.
- Talk `no_repeat` inherits the fix with no talk-side change.

### T6: the outermost loud generation (X6; inv 16, 15, 5, 6, plus arch "warden note is the one output not boundary-applied")
- **Pure `src/runtime/generationLifecycle.ts`**, a reducer over `started(args)`, `ended(args)`,
  `stopped(args)`, `rendered(id, type)`, `drafted(chid)` and `chatChanged()` that emits intents.
- **Shape rules (D9):**
  - STARTED is ST-shaped iff `args[0]` is a string, `null` (Stepped Thinking's `Generate(null, …)`) or
    `undefined`; `args[1]` is an object or `undefined`; and `args[2]` is a boolean or `undefined`;
  - ENDED and STOPPED are ST-shaped iff `args[0]` is a number or `undefined`;
  - a `{source}` object on any of the three is **foreign** and ignored;
  - `dryRun === true` is ignored.
- **States:**
  - **Outermost** = the first ST-shaped, non-dry STARTED while none is open. The reducer records its type
    and `chat.length`.
  - **Nested** = an ST-shaped STARTED while an outermost is open (`nestedOpen++`).
  - **Withholding:** any quiet or impersonate run, outermost or nested, withholds the private block and the
    guidance block while it is open (X7).
  - **ENDED with `nestedOpen > 0`** closes the nested run and **re-applies** the drafted member's staged block
    by replaying `onMemberDrafted(lastDraftedChid)` (0 new coordinator lines).
  - **The outermost closes** on its own render (a turn-type `MESSAGE_RECEIVED`/`CHARACTER_MESSAGE_RENDERED` with
    id ≥ its start length), on STOPPED, on `CHAT_CHANGED`, or on an ST-shaped ENDED with nothing nested. It
    never relies on `isHostGenerating()` (H6).
- **Wiring** lives in `runtime/index.ts:187-194`, not in the manager:
  - `onGenerationStarted`, `capturePayload` and `talk.onGenerationStarted` fire for the **outermost only**;
  - `clearPrivateInjection`, `clearCopilotNudge`, `clearContinuityNote` and `talk.onGenerationEnded` fire at the
    **outermost close only**;
  - a nested `force_chid` no longer sets `pass.forced`.
- **Warden note (X6):** it is set at the outermost STARTED and marked `applied` **only when the outermost
  closes with a render**. A STOPPED or reply-less close leaves it `accepted`, so it rides the next loud run.
  This needs a `commitNote(rendered)` split of `stagecraftCoordinator.ts:465-467`. Manager: ≤ +2 lines.

### Guidance injection (D7, X7; inv 16, 9, 12, 18, plus arch "next-turn preview is composed")
- **Registry entry:** `checkpointGuidance: {key: "story_orchestrator_guidance", depth: 4, writer:
  "runtime/coordinators/pacingCoordinator", label: "Checkpoint guidance"}`.
  - Depth 4 and system role match the Author's Note default (H13); the role is fixed at
    `extensionPrompts.ts:25`.
  - The depth-4 allowlist set becomes `{memoryFacts, epistemic, checkpointGuidance}`.
  - `OWNER_TABS` (`nextTurn.ts:54-62`) gets a `config` row.
- **Writer:** `PacingCoordinator.updateSteering()` (`pacingCoordinator.ts:93-102`; `:96-105` on `eb50a00`,
  corrected 2026-09-24) composes the block with a
  pure `composeGuidanceBlock(checkpoint, policy)`, so that plan 04's `player_attempts_only` clause (X13) and
  plan 06's objective line add to one writer.
  - The source is the **played, merged** story: the pinned copy plus merged expansions, so generated
    checkpoints are covered.
  - Refresh comes free from the existing call sites (inv 16): boundary `runtimeManager.ts:267`, activate
    `:288`, load `:550`, swap `:611`, rollback `rollback.ts:91`, settings `:370`. **Corrected 2026-09-24 on
    `eb50a00`:** boundary `:283`, activate `:304`, load `:566`, swap `:597`, rollback `rollback.ts:92`,
    settings `:386` (`settingsControl.ts:29`). **Missing from the list:** `clearStory` (`:242`) cleared the
    pacing key directly and never called `updateSteering`, so a guidance block would have outlived its story;
    it now calls `updateSteering()` (see §Guidance (worktree build)).
  - No story, or empty guidance, clears the block.
- **Dropped** while a quiet or impersonate run is open (the T6 reducer) and restored at its close (X7).
- Player-invisible (inv 9). No schema or blob change. A guidance edit hot-swaps through `swapStory`
  (`runtimeManager.ts:611`; `:585` on `eb50a00`, corrected 2026-09-24).

### Over-steer probe (X8; rule 5; reused by plans 06 and 07)
- **Pure `scripts/debug/lib/overSteer.mts`** plus the `expect: {overSteer: {block, family, controlRun?}}` key.
  It reads reply N+1 after the block was carried.
- **Restate check (gates):** the longest shared word span between the block text and N+1 must be < 6
  normalised words, and N+1 must contain none of the family's meta tokens.
- **Swing check (recorded):** N+1's length and family inputs are compared against a **control arm** (the same
  scripted turns on a fixture copy of the story with that field removed; no product toggle).
- **Family inputs** are parameters. Plan 01 ships the guidance family (meta tokens `guidance`,
  `Scene direction`, `[Story`). Plan 07 supplies agency and house-rule inputs, and plan 06 supplies the
  objective line.
- A human rubric row is recorded, not gated.

## Order of work (rule 2: fixture red first)

1. **Harness:** the verbs, run-header `thirdParty`, the foreign-emitter fixture, the event guard and the
   over-steer lib, each with node:test. Create `host-facts.md` with H1–H13.
2. **Red fixtures** under `test/scenarios/`:
   - `v24-01-middle-delete.json`, `-cut-range.json`, `-toolcall-run.json` (1.19.0 only),
     `-tail-delete-control.json`;
   - `-transition-note-speaker.json`, `-sd-post-speaker.json`, `-narrator-speaker.json`,
     `-macro-group-rest.json`;
   - `-nested-quiet.json`, `-foreign-source.json`, `-dry-unpaired.json`, `-stopped.json`;
   - `-guidance.json`.

   Run each and archive the RED output (`records/v2.4-plan01/red/`). The tail control must be green before
   any fix.
3. T1: the pure module and jest, then the wiring.
4. T10 plus the macro fix.
5. T6: the reducer and jest, the wiring, then the warden `commitNote`.
6. Guidance.
7. Corrections, made after the last code commit so their line numbers are final.
8. Machine gates, then live gates, then the Gate record.

## Tests and gates

**Jest.** Each guard carries a **mutation check** (`test/findings/mutations/v24-01-*.txt`): revert the guard,
and only its own case fails.
- `messageIdentity.test.ts`:
  - exact middle, tail, multi-count, `/cut` sequence;
  - ambiguous → earliest candidate;
  - stale → `postLength`;
  - a hidden row between refreshes still decodes exactly.

  Mutations: always return `postLength`; drop the suffix check; add `is_system` to the key.
- `turnBridge` review: decode before the await, `noteMutation(start)`, purge keyed by `start`. Mutation:
  purge by `postLength`.
- `rollbackReplay` addition: a middle delete **through the decoder** equals a replay without the removed
  message.
- `roster.test.ts`:
  - skipped: Note, hidden row, visible group `/sd`, tool row, non-roster `/sys` narrator;
  - kept: a roster-named narrator;
  - control: a non-roster member still returns null.

  Mutation: remove the `is_system` skip.
- `memoryCoordinator` review: group at rest → `story_epistemic` is `""`; drafted → that member's block only.
  Mutation: restore the all-names fallback.
- `talk/rules`: `no_repeat` after a Note excludes the last member.
- `generationLifecycle.test.ts`:
  - loud → nested quiet with `force_chid` → ENDED → render;
  - foreign STARTED/ENDED/STOPPED `{source}`;
  - dry unpaired;
  - STOPPED;
  - `Generate(null, …)`;
  - a two-member group sequence;
  - impersonate withholds guidance and the private block.

  Mutations: clear on every ENDED; accept object payloads; skip the drafted re-apply.
- `stagecraftCoordinator` review: a reply-less close keeps the note `accepted`; a render marks it `applied`.
- Guidance:
  - set on activate, cleared with no story, swapped on rollback to a guidance-less checkpoint;
  - a merged generated checkpoint;
  - `findInjectionRegistryProblems() === []`.

  Mutation: drop the clear.
- `loreRelevance.test.ts`: the rename (see §Corrections), plus an optional raw-Score replay case from the
  golden (0.9197 / 0.04; reference `.debug/lore-raw-rerank.ts`). Nothing is deleted.

**node:test.** The harness pieces above, plus `overSteer` against synthetic replies: a restating reply fails,
and the control passes.

**Scenarios** (no backend; `so-scenario --sandbox --group <id>`; ×2 consecutive):
- the step-2 rows;
- `plan03a-*`, `live-v4-turn-identity` and `so-turn-types-check.mts` stay green.

**Machine:** `npm run typecheck && npm run lint && npm run typecheck:test && npm test && npm run build && npm run
test:debug`, then `node scripts/debug/st-session.mts reload`. The architecture, ownership-census and
fault-matrix guards must stay green; the census rows for `TurnBridge.onMutation` and the warden split change.

**Live** (runtime/ST-facing tier; real LLM, profile selected, no `debugResponse`). Bring the backend up per the
corrected playbook §0, and capture and diff a run header around the batch.
- **T1 (plan 09 I1):** in a played group chat with ≥3 boundaries, `record_state`, then `host_delete` a
  consumed middle message, then `stateEquals`. Repeat with `cut`, then the tail control.
- **T10:** a real group turn crosses a transition and the Note posts, then ENDED. Assert `activeSpeakerId`, the
  public facts block (capability profile off), `story_epistemic` at rest = `""`, and `no_repeat` on the next
  real turn.
- **T6 (I2):** `ext_setting` Stepped Thinking `is_enabled: true`. Run a real group turn with an accepted
  warden note and a pinned private row.
  - The drafted member's captured `GENERATE_AFTER_DATA` request carries both (`payloadContains` scoped by
    block).
  - The note is `applied` once, after the render.
  - The restore is proven by the header diff. Control: the same turn with thinking off.
- **Foreign emitter (I3):** the fixture's `{source}` sequence around a real `sendRequest`. The private, nudge
  and note blocks are all unchanged.
- **Guidance:**
  - the block is inside a real captured request on an authored checkpoint (sun-ruins, a checkpoint with
    guidance) and on a generated checkpoint (real expansion);
  - it is absent on a guidance-less checkpoint and during impersonate;
  - the **over-steer probe** runs with its control arm.
- **Journeys:** J5, J6 and J8, `--strict`, ×2 consecutive.
- **Records:** `test/journeys/records/v2.4-plan01/`, holding the red outputs, mutation logs, run headers and
  matrices.

## Corrections (each edit says "corrected in v2.4 plan 01" and cites the evidence)

These mirror 00-overview §Carry-in corrections.

| Location (verified 2026-09-23) | Replacement wording |
|---|---|
| `docs/plans/v2.3/10-judge-seeds.md:155` | Arm label → "**Score, rounded (as measured)**". Add a row: "raw Score (recomputed from the golden, corrected in v2.4 plan 01): nDCG@4 0.9197, tie 0.04, boundary 0.00" |
| same `:157-158` | "…the **rounded** Score arm is worse on both. Read raw, Score still orders worse (nDCG@4 0.9197 < 0.9272) but ties less (0.04 < 0.08); Noul stays on nDCG. Corrected in v2.4 plan 01 (SUMMARY T21)." |
| same `:168` | "…nDCG@4 favours the shipped arm; the tie rate favours it only against the rounded arm (corrected in v2.4 plan 01)." |
| same `:169-174` | "**The tie rate of 1.00 was produced by our rounding, not by the scale.** The arm was sorted on `Math.round(score)` (`loreScore.ts:45,65`), which the Build line (`:59-61`, 'level then score') did not declare. Raw Score ties 0.04; the verdict stands on nDCG; there is no 'finer scale' seed. Corrected in v2.4 plan 01." |
| `.claude/CLAUDE.md:20`, plan-10 results ("Noul tie rate 0.08 vs Score **1.00** (boundary 0.00 vs 0.64)") | "Noul nDCG@4 0.9272 vs Score 0.8860 **rounded** (raw 0.9197); tie 0.08 vs 1.00 rounded / 0.04 raw (boundary 0.00 either way raw) — the 1.00 was an artifact of `Math.round`; 'Noul stays' holds on nDCG (corrected in v2.4 plan 01)" |
| `.claude/CLAUDE.md:20`, plan-10 caveat ("a six-level Score ties MORE than a probability does, not less — a finer scale is a v2.4 seed") | "the Score tie rate was produced by rounding (raw 0.04); no 'finer scale' seed (corrected in v2.4 plan 01)" |
| `.claude/CLAUDE.md:20`, F4 sentence ("Score arm nDCG@4 0.886 vs Noul 0.927, tie rate 1.00 vs 0.08") | "(rounded Score arm nDCG@4 0.886 vs 0.927; the tie rate 1.00 was the rounding, raw 0.04 — corrected in v2.4 plan 01)" |
| `.claude/rules/architecture.md:97` | "…the proposed Score arm ordered worse (nDCG@4 0.886 rounded, 0.920 raw, vs 0.927). Its tie rate of 1.00 came from rounding (raw 0.04), so the refusal rests on nDCG alone (corrected in v2.4 plan 01)." |
| `docs/plans/v2.3/v2.4-seeds.md:23` | same as `architecture.md:97` |
| `docs/plans/v2.3/v2.4-seeds.md:24` | "…a six-level scale ties more" → "the tie claim was a rounding artifact; **seed retired** (v2.4 D11, corrected in v2.4 plan 01)" |
| `docs/plans/v2.3/11-acceptance.md:808-809` | "(**rounded** Score arm nDCG@4 0.886 vs Noul 0.927; raw 0.920; the tie rate 1.00 was the rounding — corrected in v2.4 plan 01)" |
| `docs/plans/v2.3/recommended-config.md:38` | "…rank by a compressed probability (F4; the shipped **Noul** arm's tie rate is **0.08**, boundary 0.00; 1.00 was the rounded Score arm — corrected in v2.4 plan 01)…" |
| `test/findings/ledger.json:248` (F4 `provenBy`) | same wording as `architecture.md:97`; the ledger guard stays green |
| `src/judge/loreRelevance.test.ts:50` (title), `:54` | Title → "records a comparison in which the Noul arm orders better and ties less than the **rounded** Score arm". The assertion is kept |
| `src/judge/loreScore.ts:56` | `/** The scale value rounded to 0..5 (Math.round); the raw answer is not kept here. */` |
| `src/runtime/runOwner.ts:56-63` (claim `:60-62`) | "Extraction calls can honour it too: `ConnectionManagerRequestService.sendRequest` takes `custom.signal` (shared.js:423-424, pass-through :464/:484; 1.18.0 :420). Not wired yet (v2.4 plan 03); until then the token check is the whole defence. Corrected in v2.4 plan 01." |
| `src/judge/types.ts:65-69` | same fact; "optional because extraction does not pass one **yet**" |
| `src/runtime/epochAbort.review.test.ts:8-11` | same fact; "not wired for extraction yet (v2.4 plan 03)" |
| `docs/plans/v2.3/03-async-ownership.md:1676-1684` | Append: "**Corrected in v2.4 plan 01:** wrong. `sendRequest` destructures `custom.signal` and passes it to both services (`shared.js:424,464,484`; 1.18.0 `:420,458,478`). Extraction *is* abortable at the host; it is not wired." |
| same `:1789` | "**impossible**" → "**not built** (the host takes `custom.signal`; corrected in v2.4 plan 01)" |
| `docs/plans/v2.3/03-async-ownership.md:2715` | "a branch does NOT copy our blob, `bookmarks.js:201`" → "a branch or checkpoint **does** copy our blob and the chat lorebook slot (`bookmarks.js:201,284` build `{main_chat, integrity}`, merged over `chat_metadata` at `script.js:7406`); it reads as foreign because its chat id differs — corrected in v2.4 plan 01" |
| `docs/plans/v2.3/live-gate-playbook.md:24-26` (§0 steps 4–6) | "**Corrected in v2.4 plan 01** (gotchas 2026-09-23): the RunPod HTTPS proxy reaches `llama-server` only when it binds `0.0.0.0` (`--host 0.0.0.0` in `LLM_EXTRA_ARGS`); with the default loopback bind it returns 502. The working route: `get-pod` → `runtime.ssh.direct` (present only while RUNNING), then `ssh -i ~/.ssh/id_ed25519_runpod -N -L 18080:127.0.0.1:8080 -p <port> root@<ip>` in the background. Verify with `curl -s http://127.0.0.1:18080/v1/models`. The profiles stay at `http://127.0.0.1:18080`, so steps 6 and 10 are no-ops." |

## Risks

- **Stale lines.** The other session is editing four of the cited files. Re-verify on the frozen tree
  (rule 1).
- **A lookalike emitter.** An extension that emits an ST-shaped STARTED and never renders holds the
  outermost open until STOPPED or a chat change. Mitigation: the next ST-shaped outermost STARTED while the
  send button is idle closes it, journaled.
- **Snapshot cost and gaps.** The T1 snapshot costs hashing on long chats, and that cost gets measured. An
  eventless mutation between refreshes makes a delete `stale`, which falls back to today's value until
  plan 02's T3.
- **The harness blind spot may hide more.** Re-run J6 with `host_delete`.
- **Guidance double-steer.** Guidance at depth 4 next to an authored note that restates the objective. The
  over-steer probe measures it; plan 06's `auto` rule governs the objective line.
- **Install-wide flip.** `ext_setting` changes an install-wide setting. The restore runs in `finally`, and
  the header diff blocks the run if the value was not restored.

## Gate record

Not started.

### T10 (worktree build, 2026-09-24)

Built on `eb50a00` in a worktree. Code:
- `src/runtime/roster.ts` `activeSpeakerId` continues past `is_system === true`, any non-null `extra.type` other than `'narrator'`, `name === hostSystemUserName`, and a `'narrator'` row whose name is not a roster member. A roster-named narrator counts as that member (host facts 01-H9..H11 re-read on the live tree: `slash-commands.js:3770-3772`, `:6019-6036`, `:6113-6152`; `stable-diffusion/index.js:4966-4999`; tool rows `tool-calling.js:903-913`, `systemUserName` + `is_system:true`).
- `src/services/stHost/generation.ts` exports `hostSystemUserName` from the `scriptModule` it already imports (`script.js:405`); `ScriptHostModule.systemUserName` vendored in `hostTypes.ts`; re-exported by `STAPI.ts`.
- `src/runtime/memoryInjector.ts` `epistemicBlock()`: in a group it returns `appliedEpistemicBlock()` (+1 line). Solo is unchanged.
- `runtimeManager.ts` and `memoryCoordinator.ts` untouched (0 lines each; effective 736/740 and 597/620). Talk `no_repeat` has no talk-side change.

Tests: `src/runtime/roster.test.ts` (5 skip cases, the roster-named narrator, an ordinary reply, the non-roster null control, and `no_repeat` after a Note through `chooseByRules`); `src/runtime/coordinators/epistemicMacro.review.test.ts` (group at rest `""`, drafted = own block only, solo control). Before the fix, 8 of these 12 fail and the 4 controls pass.

Gates (worktree, no `dist/`):
- `npm run typecheck`: clean. `npm run typecheck:test`: clean. `npm run lint`: clean.
- `npm test`: 173 suites / 2694 tests passed.
- `npm run debug:typecheck`: clean.
- `npm run test:debug`: 177 tests, 174 pass, 2 fail, 1 skipped. Neither failure is T10. (1) `scenarioSchema.test.mts` "no fixture reads a page global it never sets" flags `v24-01-harness-smoke.json` (`__soForeignEmitter`, set by `inject_script`, which the guard cannot see); that fixture is from `eb50a00`. (2) `so-run-header.test.mts` "the build half reads plan 08s nested manifest" needs `dist/manifest.json`, and the worktree has no `dist/` (build not run, per the brief).
- `npm run build` / `test:release`: not run (brief).

Mutations (`test/findings/mutations/v24-01-T10.txt`), each alone on the full jest suite: removing the `is_system` skip fails 1 case (the hidden row only); restoring the all-names fallback fails 2 cases (the two group macro cases only). 2/2 killed.

Red fixtures (written, validated with `validateFixture`, every `eval` syntax-checked, **not run live**): `test/scenarios/v24-01-transition-note-speaker.json`, `-sd-post-speaker.json`, `-narrator-speaker.json`, `-macro-group-rest.json`. They need no backend and run with `so-scenario run <file> --sandbox --group 1759606632088`. Each has a green control step before its red assertion. The `/sd` and tool rows are posted by an eval in the host's own shape and events, because there is no image backend.

Deviations:
- The macro fix is in `memoryInjector.ts`, not `memoryCoordinator.ts`, because V26 moved the render there. `memoryCoordinator.ts` changes by 0 lines, so the plan's net-zero rule still holds.
- The `talk/rules` case is in `roster.test.ts`, not `talk/talk.test.ts`. It composes `activeSpeakerId` with `chooseByRules`, and `src/talk/` is pure, so it cannot mock the host seam.
- The solo path keeps `enabledCharacterNames` (in solo `activeSpeakerId` is always null, because `enabledCharacterIds` needs a group). This is the plan's "Solo unchanged", but it means the all-names merge still exists for solo stories whose roster has more than one member. **Not decided here.**
- Still open for T10: the live group probe (the §Live T10 row) and the ×2 fixture runs with archived RED output.

### Guidance (worktree build, 2026-09-24)

Built on `eb50a00` in a worktree, as one item of plan 01 (D7, X7). Machine gates only; **the live gate has
not run** (no browser here), so this item is NOT green.

**As built**
- `constants/injectionRegistry.ts`: `checkpointGuidance {key: "story_orchestrator_guidance", depth: 4, writer:
  "runtime/coordinators/pacingCoordinator", label: "Checkpoint guidance"}`; the depth-4 allowlist set is
  `{memoryFacts, epistemic, checkpointGuidance}`. `findInjectionRegistryProblems()` is `[]`.
- `runtime/nextTurn.ts` `OWNER_TABS`: `runtime/coordinators/pacingCoordinator` → `config`.
- `pacing/guidance.ts` (pure): `composeGuidanceBlock(checkpoint, policy)` → `Scene direction: <guidance trimmed>`,
  or `""` for no checkpoint / no guidance / whitespace. The header is one of `GUIDANCE_FAMILY`'s meta tokens,
  so a reply that echoes the framing fails the over-steer restate check. `policy` is taken and not read yet:
  plan 04's `player_attempts_only` clause and plan 06's objective line add lines here.
- `PacingCoordinator.updateSteering()` reads the active checkpoint from the played, merged story
  (`loaded.story`, which is `mergedStoryOrBase` on load and `replaceStory` after a merge) and writes the block
  at the registry depth (system role, `extensionPrompts.ts:25`), or clears it. No story clears it too.
  `withholdGuidance()` clears it without touching anything else.
- `RuntimeManager` (0 net effective lines, 736/740 before and after): `clearStory` calls
  `pacing.updateSteering()` instead of clearing the pacing key by hand. That was a real gap: the plan's call
  site list had no story-clear path, so guidance would have outlived its story. The import it freed pays for
  the one new line.

**The withholding seam left for T6.** Today's path withholds the private block on a quiet/impersonate STARTED
(`onGenerationStarted` → `memory.withholdPrivateKnowledge()`) and restores on ENDED/STOPPED
(`onGenerationEnded` → `clearPrivateInjection()` → `memory.updateInjection()`). Guidance now rides the same two
edges, stateless like the private block (a clear, not a flag, so a lost ENDED heals at the next refresh):
- **open a withholding run:** `manager.withholdTurnBlocks()` = `memory.withholdPrivateKnowledge()` +
  `pacing.withholdGuidance()`. `onGenerationStarted` calls it for `quiet`/`impersonate`. T6 calls this one
  function for any quiet/impersonate run, outermost or nested.
- **close it:** `manager.clearPrivateInjection()` now also calls `pacing.updateSteering()`, so it restores the
  resting private block **and** the guidance block. T6's outermost close already calls it; at a nested close,
  call it and then replay `onMemberDrafted(lastDraftedChid)` (the order matters: the replay re-stages the
  drafted member over the resting block).
- No reducer was built here.

**Harness.** `expect: {overSteer: {block, family, controlRun?}}` is wired beside `stateEquals`
(`so-scenario.mts` expect branch). `lib/overSteer.mts` gained the pure half (`OVER_STEER_FAMILIES`,
`overSteerSpec`, `overSteerVerdict`); `lib/interopVerbs.mts` the page half (`readOverSteer`,
`expectOverSteer`). The block text is the newest payload capture that carried `block` (else the next prompt's
`extensionPrompts[block]`); reply N+1 is the last chat row that is neither `is_user` nor `is_system`. It gates
on `restateCheck` with the named family and records `swing` when `controlRun` is given (the literal control
reply, or `{global}` naming a page global that holds it). An uncarried block, a missing reply, or a named but
empty control arm fails: none of them may pass vacuously.

**Red fixture (written, not run):** `test/scenarios/v24-01-guidance.json`, no backend. Import sun-ruins (cp1
guidance on load) → `/cp activate cp-4a` (sphinx guidance, next-turn row `Checkpoint guidance`/`config`/depth
4, then a `capturePayload` and `payloadContains` scoped to the key) → emitted quiet STARTED withholds →
ENDED restores → `/cp activate cp2` clears. `validateFixture` → `[]`; all 6 evals pass
`new Function(...)`. On `eb50a00` step 3 fails ("cp1 guidance is not injected on load").

**Machine gates (worktree, 2026-09-24)**

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:test` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 172 suites, 2692 tests, all pass (+1 suite, +10 tests) |
| `npm run debug:typecheck` | exit 0 |
| `npm run test:debug` | 184 tests: 181 pass, 1 skipped, **2 fail, neither from this item**: `no fixture reads a page global it never sets` names `v24-01-harness-smoke.json` (`__soForeignEmitter` is set by the injected `foreign-emitter.js`, which the text guard cannot see; the fixture and the guard are both as `eb50a00` left them), and `the build half reads plan 08s nested manifest` needs `dist/manifest.json`, which a worktree that never built does not have |

`npm run build` and `test:release` were not run (worktree; `dist/` untouched).

**Mutations** (`test/findings/mutations/v24-01-guidance.txt`): each reverted guard fails only its own cases.
M1 drop the empty-guidance clear → 2 fail (empty guidance; rollback to a guidance-less checkpoint). M2 drop
the no-story clear → 1 (no story). M3 `clearStory` stops refreshing steering → 2 (no story, plus the existing
pacing no-story case, which now rides the same call). M4 the quiet/impersonate open stops withholding
guidance → 1. M5 the run's close stops restoring it → 1.

**Not done:** the live gate (the fixture ×2 on a lane; a real captured request on an authored and a
generated checkpoint; absence during impersonate; the over-steer probe with its control arm); the T6 reducer
(separate agent).

**Plan claims found wrong:** the Budgets row (effective lines since V22b; manager 736/740, not 677/700) and the
call-site list (no story-clear path), both corrected above.

### T1 (worktree build, 2026-09-24)

Built on `eb50a00`, machine gates only; **no live gate has run**, so T1 is NOT green.

- **Built.**
  - `src/runtime/messageIdentity.ts` (pure): `messageKey` = `send_date|name|is_user|len(mes)|fnv1a(mes)`,
    cached per message object. No `is_system`, no `swipe_id`.
  - `decodeDelete(before, afterChat, postLength)`: candidates are `[postLength − commonSuffix, commonPrefix]`.
    One candidate is `exact`, several are `ambiguous` (earliest wins), none is `stale` (start = `postLength`).
    A missing snapshot, a length that did not shrink, or an `afterChat.length` that is not `postLength` is also
    `stale`.
  - `ChatIdentity` holds one snapshot keyed by chatId. `decode` refreshes to the post-delete chat, so each
    `/cut` event diffs against the one before it.
  - `TurnBridge` refreshes on `CHAT_CHANGED`, `MESSAGE_SENT`, every rendered message (before the turn-type
    filter), `MESSAGE_EDITED`/`SWIPED`/`UPDATED`, `MESSAGE_SWIPE_DELETED`, an id-less mutation and each handled
    delete. `onMutation("delete")` decodes before its only await, and the `turnKeys` purge and
    `rollbackFromMessage` (so `noteMutation`) both take `start`.
  - A non-exact decode is journaled (`story` record, persisted to `extras.journal`) by `runRollback`'s new
    optional `decoded` argument. `hashStory` now shares an exported `fnv1a`. `events.ts` types
    `MESSAGE_DELETED` as `[chatLength]` and adds `MESSAGE_SWIPE_DELETED`.
- **Budgets.** Manager 736/740 effective lines, unchanged (0 net lines; the signature and the `runRollback`
  call were edited in place, and the type rides the existing `./rollback` import). No budget was raised.
  The ownership census is unchanged: `TurnBridge.onMutation` still has no write after its await.
- **Tests.**
  - New: `messageIdentity.test.ts` (11) and `turnBridgeDelete.review.test.ts` (6).
  - `rollbackReplay.property.test.ts` gained 4 seeds × 100 random middle deletes of 1–3 messages through the
    decoder, compared against a replay that stopped before the removed message.
  - `turnBridgeIdentity.review.test.ts`: the `MESSAGE_DELETED(1)` assertion now reads the first argument, because
    a stale decode also carries its journal line.
- **Gates** (all in the worktree):

  | Command | Result |
  |---|---|
  | `npm run typecheck` | 0 errors |
  | `npm run typecheck:test` | 0 errors |
  | `npm run lint` | clean |
  | `npm test` | 173 suites, 2703 tests, all passing |
  | `npm run debug:typecheck` | 0 errors |
  | `npm run test:debug` | 177 tests: 174 pass, 2 fail, 1 skipped |

  Neither `test:debug` failure is T1's:
  - `no fixture reads a page global it never sets` names `v24-01-harness-smoke.json`, which is unchanged from
    `eb50a00`. It reads `__soForeignEmitter`, which the injected script sets, not the fixture.
  - `the build half reads plan 08s nested manifest` needs `dist/manifest.json`, and the worktree has no
    `dist/`. `npm run build` was deliberately not run.
- **Mutations** (`test/findings/mutations/v24-01-T1.txt`; each mutant applied alone, then restored):

  | Mutant | Cases that fail |
  |---|---|
  | M1: always return `postLength` | 13, all of them decode cases; the tail, stale and other-chat controls stay green |
  | M2: drop the suffix check | 2 (the ambiguous case and the no-alignment stale case) |
  | M3: `is_system` in the key | 1 (the hidden-row case) |
  | M4: purge by `postLength` | 1 (the turn-key purge case) |
  | M5: no journal for non-exact decodes | 2 (the journal cases) |

- **Fixtures written, NOT run** (no browser in this session). They are validated with `validateFixture`, every
  eval compiles, and no global is read without being set.
  - Files: `test/scenarios/v24-01-middle-delete.json`, `-cut-range.json`, `-toolcall-run.json` (1.19.0 only;
    it reports `blocked` when the host removes only the reply), `-tail-delete-control.json`. They share the
    story `v24-01-delete.story.json`.
  - Each clears the sandbox chat's greetings first, so message ids are fixed. Each turn is `send` plus a
    scripted `extract` (one latching delta and one fact, with evidence that quotes the player's line).
  - The expected red on the pre-fix code, by reading the code: middle and cut keep `lit_lamp` from a removed
    line, and the tool-call run keeps the boundary that read the removed run. The tail control is equal on
    both sides.
  - The red and green runs, ×2, are still owed: `so-scenario --sandbox --group 1759606632088`, archived under
    `records/v2.4-plan01/red/`.
- **Deviations.**
  - No manager delegate (see the correction in §T1).
  - Two extra refresh points: every rendered message (not only turn types), and an id-less mutation.
  - A fifth mutant (M5) for the journal.
  - Per-refresh hashing cost is not measured yet (Risks).

### T6 (worktree build, 2026-09-24)

Built on HEAD `eb50a00` (plan 01 step 1). Machine gates only: no browser, no backend, no `npm run build`
(so `dist/` and the live gates are untouched). **Not green**: the four red fixtures below were written but
NOT run (neither red on the old tree nor green on this one), and none of the live T6 rows (I2 Stepped
Thinking, I3 foreign emitter, J5/J6/J8 x2) ran.

**What was built**
- `src/runtime/generationLifecycle.ts` (pure, host-free): `GenerationLifecycle` over `started(args, chatLength)`,
  `ended(args)`, `stopped(args)`, `rendered(id, type)`, `drafted(chid)`, `chatChanged()`, emitting intents
  `opened | nested{withholds} | reapply{chid} | closed{reason} | settled{rendered}`. D9 shape rules as
  exported predicates `isHostStartedShape` / `isHostEndedShape`; `dryRun === true` ignored; `{source}`
  payloads fail the shape and are ignored. Never reads `isHostGenerating()` (01-H6). The turn-type rule is
  injected (`isTurnMessageType` from `turnBridge.ts`), so the module never imports the host seam.
- `src/runtime/index.ts`: the generation subscriptions go through the reducer. Outermost open →
  `onGenerationStarted` + `capturePayload` + `talk.onGenerationStarted`; nested quiet/impersonate →
  `onGenerationStarted(type)` (withhold only; the stagecraft coordinator already skips those types); nested
  ENDED → `onMemberDrafted(lastDraftedChid)` (or `clearPrivateInjection()` with nobody drafted); outermost
  close → `clearPrivateInjection` + `clearCopilotNudge` + `talk.onGenerationEnded`; settle →
  `commitContinuityNote(rendered)`. It also subscribes `MESSAGE_RECEIVED`, `CHARACTER_MESSAGE_RENDERED` and
  `CHAT_CHANGED`, and `GROUP_MEMBER_DRAFTED` feeds `drafted()`.
- `stagecraftCoordinator.ts`: `onGenerationStarted` sets the note and remembers which op it carries, and
  no longer marks it `applied` or saves. The new `commitNote(rendered)` clears the prompt, and only when
  `rendered` marks that op `applied` (if it is still `accepted`) and saves. `clearContinuityNote` also drops
  the carried op. 541 → 557 effective lines (620).
- `runtimeManager.ts`: **zero net lines** (736/740 effective before and after). `onGenerationEnded()`
  (`:621`), whose three clears now live in the index.ts wiring, is replaced by
  `commitContinuityNote(rendered)`. `onGenerationEnded` had no other caller (grep over `src`,
  `scripts`, `test`).
- `test/findings/ownership-sites.json`: **unchanged**. The guard asked for nothing, because
  `commitNote`/`onGenerationStarted` write nothing after an await.

**Where the build differs from §T6 (ST's own event order, verified in `public/` 1.19.0)**
1. **A streaming reply's ENDED arrives BEFORE its render.** `finalizeIntermediaryMessage`
   (`script.js:3755`) calls `markUIGenStopped()` → `unblockGeneration` → `hideStopButton` → ENDED at
   `:3794-3796`, then emits `MESSAGE_RECEIVED`/`CHARACTER_MESSAGE_RENDERED` at `:3799-3800`. §T6's rule
   "closes on an ST-shaped ENDED with nothing nested" therefore closes every ordinary streaming turn
   *without* a render, so X6 would never spend a note on the commonest path. As built, that ENDED closes the
   outermost (the blocks clear) and leaves it **awaiting its render**: the render (id ≥ watermark) then
   settles the note as rendered. A STOPPED, a chat change or the next outermost STARTED settles it as
   not rendered. `stopGeneration` emits ENDED (`:5614-5615`) and then STOPPED (`:5618`), before the partial
   reply renders, so a stopped turn never spends the note. Quiet and impersonate outermosts settle as not
   rendered on their ENDED, because they have no reply to wait for.
2. **"id ≥ its start length" misses swipe, continue and regenerate.** Those types write into the last
   message, or pop it first (`:4406-4411`). Their watermark is `chat.length - 1`.
3. **A group wrapper's member runs are nested, and they still capture and inform talk.** A group send is
   `Generate` STARTED (`:4299`) → AFTER_COMMANDS (`:4321`) → the redirect to `generateGroupWrapper`
   (`:4350-4353`) → per member `GROUP_MEMBER_DRAFTED` (`group-chats.js:1059`) → its own `Generate`
   STARTED (`:1063`). So the first member's STARTED is nested under the wrapper's. Following "outermost
   only" literally would take the group's payload capture before any member is drafted, and would not
   tell talk about a typed `/trigger` (a command-interrupted phantom STARTED is left open, see risk 2).
   As built, a **nested loud** run (not quiet, not impersonate) still triggers `capturePayload` and
   `talk.onGenerationStarted`. Only nested quiet and impersonate runs are kept away from talk (and so is
   their `force_chid`, which was the Stepped Thinking defect). The warden note (`onGenerationStarted` on
   the manager) is outermost-only as planned. No `talkControl.ts` change was needed.
4. **CHAT_CHANGED closes without clearing injection.** The chat load owns the new chat's blocks, so the
   close emits only the talk end and `settled(false)` (which clears the carried note, so an old chat's
   note cannot ride the new chat's first generation).
5. The plan's "Manager: ≤ +2 lines" would have broken the budget. The build adds zero net lines (above).

**Risks left open**
1. **Nested ENDED can be missing.** If a nested quiet run ends while `#mes_stop` is hidden, it emits no
   ENDED (01-H5), and the block stays withheld until the outer run's ENDED pops it or its render closes it.
   Group turns are unaffected, because `GROUP_MEMBER_DRAFTED` re-applies. This matches pre-T6 behaviour.
2. **A command-interrupted STARTED is a phantom outermost.** A typed slash command's `Generate` returns at
   `:4313-4316` with no ENDED, because the stop button is not shown until `:4430`. It stays open until the
   next render, STOPPED or chat change, and in the meantime the next real run is nested, so the note is not
   set at it (the phantom may already have set it). The plan's mitigation ("the next outermost STARTED
   while the send button is idle closes it") contradicts 01-H6 and was **not built**. A sturdier signal is
   `GENERATION_AFTER_COMMANDS`, which an interrupted run never emits, but Stepped Thinking registers on it
   before we do, and it would need a fixture first.
3. The fixtures below emit a fake `GROUP_MEMBER_DRAFTED`. Presence is disabled on this install
   (`disabledExtensions`), so nothing hides chat rows in response.

**Red fixtures (written, validated, NOT run)**: `test/scenarios/v24-01-nested-quiet.json`,
`v24-01-foreign-source.json` (the injected `foreign-emitter.js` plus `emit_generation` `{source}` args),
`v24-01-dry-unpaired.json` (the emitter's `dryUnpaired` plus a dry quiet) and `v24-01-stopped.json`
(ENDED then STOPPED, then the next STARTED must carry the unspent note). Each one:
- plants an epistemic row the way `plan05-pin-private-rollback` does;
- turns the warden on and plants an accepted note **in the in-memory view only** (put back in the last
  step's `finally`, which also closes the generation with an ST-shaped STOPPED);
- asserts through `getAppliedEpistemicBlock()`, `ctx.extensionPrompts.story_orchestrator_continuity` and
  `getStagecraftState()`.

The expected red reason on the old tree, per fixture: nested-quiet, the ENDED cleared the block and the
note; foreign-source, the `{source}` ENDED cleared both; dry-unpaired, the dry run took a payload capture
and the dry quiet withheld the block; stopped, the note was marked `applied` at STARTED.

Checks run: `validateFixture` → valid ×4. Every eval passed
`new Function('return (async () => { ' + s + ' })()')` (5+5+5+4). Run them with
`so-scenario run <file> --sandbox --group <id>` ×2.

**Harness fix**: `scripts/debug/scenarioSchema.test.mts` "no fixture reads a page global it never sets"
now also reads each `inject_script` file a fixture names. The `v24-01-harness-smoke.json` committed in
`eb50a00` already failed this guard (it reads `__soForeignEmitter`, which only the injected script sets),
so `test:debug` was not all green at HEAD.

**Tests**:
- `src/runtime/generationLifecycle.test.ts` has 10 cases. Seven are the plan's list: loud → nested quiet
  with `force_chid` → ENDED → render; foreign `{source}` ×3; dry unpaired; STOPPED (and the stop's
  ENDED-then-STOPPED order); `Generate(null, …)`; a two-member group; impersonate. The other three cover
  swipe/continue/regenerate, a chat change, and a new outermost dropping a close that is still waiting for
  its render.
- `src/runtime/generationWiring.review.test.ts` has 3 cases through the real `startRuntime`, with the
  host stubbed.
- `stagecraftCoordinator.test.ts` has the first warden case updated (the note stays `accepted` at STARTED)
  and 2 X6 cases added: a reply-less close keeps the note accepted and the next STARTED carries it; a
  render never spends a withdrawn or never-carried note.

**Mutations** (`test/findings/mutations/v24-01-T6.txt`; each mutation is applied, the three suites are
run, the file is restored; control 50/50):

| Mutation | Result | Cases that failed |
|---|---|---|
| M1 clear on every ENDED | 2 failed | the loud/nested-quiet case, the wiring nested case |
| M2 accept object payloads | 2 failed | the foreign case, the wiring foreign case |
| M3 skip the drafted re-apply | 2 failed | the loud/nested-quiet case, the wiring nested case |
| M4 (added) spend the note on any close | 1 failed | the X6 reply-less case |

**Gates** (all run in the worktree):

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:test` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 173 suites, **2697/2697** |
| `npm run debug:typecheck` | exit 0 |
| `npm run test:debug` | 177 tests, 175 pass, 1 skipped, **1 fail** |

The `test:debug` failure is `so-run-header.test.mts` "the build half reads plan 08s nested manifest",
which reads `dist/manifest.json`. That file does not exist in a fresh worktree, and the brief ruled out a
build. It is environmental and does not touch T6.
