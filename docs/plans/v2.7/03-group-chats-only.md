# Plan 03 — Stories run in group chats only

**Status (2026-10-03): v2.7 plan 03 (was old v2.7 33). APPROVED (all five decisions as recommended, user 2026-10-03);
not built. The 10 solo story chats on the real install are deleted. Built together with v2.7 04 at their seam (Sol
split item 6).** Overview: `00-overview.md`.
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D (scripted messages, `seed_metadata`,
dry-run payloads). Model input: group prompts must stay byte-identical (payload invariance); solo chats lose every
injection by design (the runtime is inactive there).

The user's words (old plan numbers):
- Plan 04 (now v2.7 06): "Do we support solo chats on this plugin? I thought we only supported group chats. Should we support solo? I
  think it goes against many of this plugin's mechanics."
- Plan 29 (now v2.8 21): "I think this plugin makes no sense for solo players; let's only consider group. Plugin should be disabled for
  solo chats."

## What solo support exists today

Solo chats are half-supported, which is the worst of both:
- **A story can be selected and played in a solo character chat.** The runtime loads, extraction reads, effects apply.
- **Some systems have solo-specific code.** Full census (review D1; lines read 2026-10-03, re-verify at build):

| Site | Solo behaviour | Action |
|---|---|---|
| `runtime/runtimeManager.ts:588` | `memory.injector.onSoloGeneration()` on every non-withheld generation | remove the solo call; keep the stale-hold releases |
| `runtime/memoryInjector.ts:108, :122, :176, :267-274, :285-290` | solo epistemic block, solo aims, `onSoloGeneration` | remove; keep the group resting block (empty by design) and the per-member swap |
| `memory/epistemic.ts:184` `renderSoloEpistemicBlock` | solo knowledge render | remove with its tests |
| `memory/innerRender.ts:180` `soloAims` | solo inner aims | remove |
| `runtime/coordinators/pacingCoordinator.ts:28, :139` `soloMember` | guidance target falls back to the solo member | remove the dep; keep `drafted` (group) |
| `runtime/managerWiring.ts:128` | wires `soloMember` | remove |
| `runtime/roster.ts` fallback | resolves a solo character as the speaker | keep only the group fallbacks that are valid without a solo chat |
| `runtime/loudGenerationGate.ts:32-42` | D10 archive recall in solo chats | remove the solo path |
| `stHost/sprites.ts:58-62`, `sprites/stage.ts:347` | solo character sprite | remove the solo branch |
| `stHost/image.ts:43-63` | solo cast for images | remove the solo branch |
| `stHost/selectors.ts:46-57` | solo chat selectors | keep only what shared cleanup/restore uses |
| `stHost/chatScenario.ts:25-28`, `stHost/persistence.ts:330-340`, `stHost/chatFiles.ts:54-62` | solo save/scenario/file paths | keep the shared cleanup and restore (leaving a solo chat must still restore); drop solo-only writes |
| `copilot/agent/prompt.ts:35`, `finish.ts:34` | assumes one card can be a story (cardinality) | remove the assumption; a story using existing cards also needs a group (review D5) |
- **Many core mechanics assume a group and simply do nothing solo:**
  - speaker direction and chains (`talk/`), cast changes, per-member private knowledge, NPC replies as other members;
  - the roster's member requirements;
  - the campaign finding "a solo or partial group gets no checkpoint effects at all" (campaign F8/C3, fixed for the
    effects part in `e04783c2`).
- **Plans written today keep paying a solo tax:** v2.7 06 (badges on solo characters), v2.8 21 (solo-only spike scope),
  v2.8 03 (persona switch reloads differ solo vs group), v2.8 08 (avatars).

## Decision and design

**The story runtime runs only in group chats.**

1. **Solo chat with a story selected or bound:** the runtime stays inactive (no reads, no injections, no effects, no
   HUD). The drawer and settings show one card:
   - "Stories play in group chats. [Make a group for this story]".
   - That button runs the existing provisioning path: a group with the story's cast (or this character plus the story's
     narrator), confirmed by the player, create-only.
   - **The player-triggered exception is codified** (review D4): this is the one place a player (not the wizard) creates
     an asset. It runs `validateProvisioningOp` with the draft's cast (`environment.castNames`, `castNames.ts`); a
     story whose narrator card is missing names that and offers "Fix with wizard" instead of creating a partial group.
     The created group is bound to the story (`groupStories`) and the player is moved to its new chat.
2. **Story selection is refused with no group open,** the same way the "no chat, no story" invariant refuses with no
   chat. The message names the fix.
3. **A one-character story is a group of one plus a narrator.** The wizard's setup step always creates a group, which it
   already does for multi-cast stories.
4. **Solo-only code is removed, not kept dormant** (no-legacy rule):
   - the solo epistemic block and the solo member hook;
   - solo branches in injection;
   - the solo path in the loud-generation gate;
   - their tests and fixtures, which are rewritten as group tests or deleted with a reason.
5. **Existing solo chats that played a story** (v2.6 sessions, the user's install): their metadata is left untouched.
   Opening one shows the "make a group" card. Nothing is migrated automatically. The v2.6 records stay history.
6. **Invariant (architecture.md):** "No group, no story" joins "No chat, no story". Checks: `noGroupChat` in the snapshot,
   a refusal status, tests mirroring `runtime/noChatOpen.review.test.ts`.
7. **`story-needs-group` is a v2.7 04 check that works without an active engine** (review D6). Today `inScope` and the
   check scope assume a loaded story; this check reads the selection/binding (`selectedStoryId`, `groupStories`), not the
   engine. An ordinary solo chat with no story stays quiet: no card, no finding.
8. **Docs and registry (review K3):** the guide's FAQ line "Does it work in a one-on-one chat? Yes."
   (`docs/guide/player/troubleshooting.md:44`) becomes "No: stories play in group chats"; the registry's `stories`
   feature (`src/features/registry.ts:98-103`) gains `needs: ["group-chat", ...]`; the guide README says it up front.

## Effects on other plans

| Plan | Change |
|---|---|
| v2.7 06 story presence | badges on groups only (decision 1 answered) |
| v2.8 21 smart context | the "solo first" spike scope becomes "groups with witness filtering, or not at all"; the D10 solo path goes here |
| v2.8 03 persona | one flow (the group reload path); persona chosen at story start, then locked (no switching inside a story) |
| v2.7 04 health center | a `story-needs-group` check (blocks) with the "make a group" action, engine-free (decision 7) |
| v2.8 08 living cards | no solo avatar branch |
| v2.7 01 docs | the guide says it up front: stories are group chats (K3) |
| harness | scenarios and journeys that open solo chats move to groups; `so-session` cards checked; a solo chat stays only as a control |

## Gates (tier D)

- **Pure:** the no-group refusal across select, restart, update and effects (like the no-chat tests); the snapshot flag;
  the engine-free `story-needs-group` check (no story → quiet); refusal tests for new selection in a solo chat (D7).
- **Removal guard (D3; Sol r3 R3-16):** a jest guard lists the removed solo-only **modules and definitions** (file paths,
  and `file + exported symbol` for definitions removed from a file that stays) and asserts they are **absent from
  `src/`**: no listed file exists, and no listed symbol is declared or exported anywhere under `src/` (a declaration
  scan, not only an import scan), like `DROPPED_SPIKES` in `src/runtime/devOnly.guard.test.ts:29-32,128` checks source
  absence. It also fails when any module imports one again. Two planted controls, both through the guard's `read`
  seam: (1) a **planted unused definition** (a listed symbol re-declared and exported in an untouched module, imported
  by nobody) must fail the absence check, which an import-only guard would pass (typecheck cannot see dead exports);
  (2) a **planted import** of a listed module must fail the import check.
- **Payload invariance:** a dry-run capture of a scripted group turn (drafted member, resting prompt, a withheld quiet
  run) is byte-identical before and after the removal.
- **UI:** Storybook for the "make a group" card (390/768/1440, a11y); `assert-player-clean`.
- **Live (D, D7):** `seed_metadata` writes a legacy solo-story blob into a solo chat on a lane: the card shows, nothing
  else runs (no extraction call, no injection in `GENERATE_AFTER_DATA` dry run); selecting a story there is refused;
  the button creates a group from the validated cast and binds it; the new chat activates (no reply needed). Cleanup
  deletes the created group and its chat. ×2.
- Registry + guide: `stories` needs `group-chat`; guide drift test (K3).
- `npm run gates`.

## Decisions for the user

1. Runtime inactive in solo chats, with a "make a group" card? **Recommended: yes** (your decision).
2. Remove solo-only code rather than keep it dormant? **Recommended: yes** (no-legacy rule).
3. "Make a group" uses the existing create-only provisioning, confirmed by the player? **Recommended: yes.**
4. Old solo story chats: leave as is, show the card, no auto-migration? **Recommended: yes.**
5. Build position: tier 1, before plans 03, 04 and 30 (now v2.7 05, v2.7 06, v2.8 03), because they each have solo
   branches to drop.
   **Recommended: yes.**

Lets do as you recommend on all your questions, you can delete any old solo chat so we close that for good.

## Links

v2.7 04 (`story-needs-group`), v2.7 06 (badges), v2.7 01 (guide, registry), v2.8 03, v2.8 08, v2.8 21;
`.claude/rules/architecture.md` "No chat, no story".

## Review of the answers (2026-10-03)

All five taken as recommended. Old solo chats: the user asked to delete them. Found 10 solo chats on the real install whose
metadata carries `story_orchestrator` (ST `data/default-user/chats`, 2023-12 to 2026-10). Deleting is confirmed with the
user against that list before it runs (ST keeps per-save copies under `backups/`); then decision 4 becomes "deleted, no
card needed for them", and the card still ships for any solo chat that gets a story later.

2026-10-03: user confirmed; the 10 solo story chats were deleted from the real install (re-scan finds none left; no
per-chat mirror lorebooks named for them). Decision 4 is moot for this install; the card still ships.

## Review 2026-10-03

Applied: status APPROVED, D1 (full solo census, shared cleanup/restore kept), D3 (removal guard with a planted-import
control), D4 (the player-triggered group creation codified, missing narrator handled), D5 (cardinality assumptions in
`agent/prompt.ts`, `finish.ts`), D6 (engine-free `story-needs-group`, ordinary solo chats quiet), D7 (`seed_metadata`
legacy case + refusal tests), K3 (guide FAQ + registry `needs`), F08 (no solo text in other plans), Sol split item 6
(built with v2.7 04; scripted gates), B12 (references).

Round 3 (Sol): R3-16 applied.

## Gate record (2026-10-03)

Built together with v2.7 04 on branch `worktree-agent-a63e828dd1ddd52c3` (off master `506a7ca4`). Commits: `d112a730`
(no group, no story + make-a-group card), `ecc61561` (solo removal, removal guard, payload golden), `0e4389d9` (K3,
invariant, scenarios), `d3109389` (D7 scenario renamed off the word "legacy" for `legacyFree` S1), and the 04 commits.

**As built**

- **No group, no story.** `persistence.hasOpenGroup`/`openChatId`; `storySelection`: `loadSelectedStory` restores and
  clears with `NO_GROUP_STATUS` in a one-on-one chat, `selectStory` refuses and remembers the refused id
  (`noGroup.noteRefusedForGroup`), `importStoryJson` saves to the library and stops, `restartStory` refuses;
  `applyStoryUpdate` refuses (`groupOpen` dep); `EffectsApplier.applyCheckpoint` refuses (`NO_OPEN_GROUP`); the loud
  interceptor returns before anything runs outside a group. Restore on leave is unchanged.
- **Snapshot `noGroup`** (`runtime/noGroup.ts`): non-null only for a one-on-one chat that holds a story id
  (`selectedStoryId`) or had one refused; an ordinary solo chat stays quiet.
- **`story-needs-group`** (v2.7 04 check, `blocks`, `engineFree: true`, action `make-group`): runs with no loaded story.
- **Make-a-group card** (`components/settings/MakeGroupCard.tsx`, `#so-make-group` in "This chat",
  `#so-make-group-drawer` in the drawer): `runtime/makeGroup.ts` plans a group of the story's own cast
  (`draftCastNames`; a story with no cast takes this character), names a missing card (the narrator found by
  `view: "omniscient"`, role or id) and offers Fix with wizard instead of a partial group (D4), validates with
  `validateProvisioningOp`, asks the player, creates create-only (`stHost/provisioning.createGroup`), binds
  (`groupStories`), opens (new `stHost/groups.openGroupById`) and selects the story; `RunGuard` checks before the create
  and before the open (ownership census row added).
- **Solo-only code removed (D1):** `renderSoloEpistemicBlock`, `renderAttributedEpistemicBlock`, `soloAims`,
  `renderCastAims`, `MemoryInjector.onSoloGeneration`/`soloBlock` and the solo branches of `update()`/`voices()`/
  `epistemicBlock()`/`stagedBlocks()`/`secrets()`, `PacingCoordinator.soloMember` + its wiring, the solo inner-beat
  candidate, the solo loud-gate path, solo branches in `stHost/sprites.spriteCast`, `sprites/stage` generation start,
  `stHost/image.imageChat`, `stHost/selectors.draftableCharacters`, `stHost/chatScenario.readCastScenarios`,
  `stHost/persistence.readServerBoundary`. **Kept (shared cleanup/restore, D1):** `stHost/chatFiles` solo chat-file
  probe (the mirror reaper still cleans books older solo runs left), `chatScenario` read/write (restore),
  `roster.ts` (no solo branch left: `enabledCharacterIds`/`activeSpeakerId` already resolve only through the group;
  the names fallback is a group fallback), `extractionCoordinator` compaction's group guard (unreachable outside a group,
  not in the census; removing it only churned tests).
- **D5:** wizard prompt says every story needs its group (a one-character story too); `finish.ts` `wantsGroup` no longer
  needs a created card or a cast of two.
- **K3:** guide FAQ (`docs/guide/player/troubleshooting.md`) now "No: stories play in group chats", the guide README
  and `player/playing.md` say it up front, registry `stories` needs `group-chat`; tests in `features/registry.test.ts`.
- **Invariant** "No group, no story" added to `.claude/rules/architecture.md`.
- **Tests/fixtures:** solo tests rewritten as group tests or deleted with the reason "solo story play removed (v2.7 03)":
  `epistemic.test` (solo renderer block deleted), `innerVoice.test`, `innerVoiceInjection.review` (3 solo cases deleted),
  `epistemicMacro.review` (solo describe turned into the group drafted-block case), `memberGuidance.review`,
  `memoryInjectionRefresh.review` (now a group draft), `memoryInjectorSecrets.recorded`, `secretSpread.review`,
  `innerCoordinator.test`, `loudGenerationGate.test`, `chatScenario.test`, `loreBindings.test`, `runtimeManager.test`,
  `loreForceWiring.review` (group context; releases the loud gate between cases), t52/t633 wizard tests (a group exists).
  ~35 runtime test mocks gained a `groupId`. Scenarios deleted: `live-v24-02-e2-solo-epistemic.json`,
  `live-v24-08-preview-capture-solo.json` + `live-v24-08-solo.story.json` (their group halves stay; suite-decisions pair
  removed). New D7 scenario `test/scenarios/v27-03-no-group-solo-blob.json` (written, not run).

**Gates**

- Removal guard (D3, R3-16): `src/runtime/soloRemoval.guard.test.ts`: removed definitions (file + symbol) absent from
  `src/` by a TypeScript declaration scan (tests included), import/call scan; controls: a planted unused re-declared
  export in `src/utils/log.ts` fails the absence check (and passes the import check), a planted import fails the import
  check, a planted call of a removed method fails it. No whole module was solo-only, so `REMOVED_MODULES` is empty.
- Payload invariance: `src/runtime/groupPayloadInvariance.recorded.test.ts` drives the real `MemoryInjector` +
  `PacingCoordinator` over the recorded T2-2 group memory (resting, drafted own view, drafted with a beat, drafted
  omniscient narrator, withheld quiet run, resting again). Golden `test/goldens/v2.7-03-group-payload.json` was recorded
  against the PRE-removal sources (`git show d112a730:` of the four touched files, `SO_RECORD_V27_03_PAYLOAD=1`) and
  matches byte for byte after the removal.
- Refusals: `noGroupOpen.review.test.ts` (select, import, restart, load; snapshot view; engine-free check quiet without
  a story), `effectsApplier.test.ts`, `storyUpdate.test.ts`, `makeGroup.test.ts` (plan, narrator missing, cancel, lapsed,
  failed create, failed open).
- `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook` → green, see the overall gates below.
- Storybook: `test-storybook:ci` skipped in the gates run (the runner finds no stories under `.claude/worktrees`).
  Ran instead: `npm run storybook:build`, `npx http-server .sb-static -p 6123 -s`,
  `node node_modules/@storybook/test-runner/dist/test-storybook.js --url http://127.0.0.1:6123 --maxWorkers 1 --index-json`
  → **73 suites, 471 tests passed** (MakeGroupCard: makes a group, narrator missing, wizard off, 390/768/1440).
- **Live: NOT run** (lanes 0–5 busy; no ST check made by this build). Owed, tier D: D7 scenario ×2
  (`so-scenario.mts run test/scenarios/v27-03-no-group-solo-blob.json --sandbox --group 1759606632088`),
  `plan10-epistemic-ledger.json` and `v24-01-macro-group-rest.json` (group blocks unchanged), `assert-player-clean`.

**Deviations**

- Model input: none in a group chat (payload golden). Outside a group every injection stops by design. The wizard
  agent prompt changed one rule line (D5): it reaches the authoring model, so its real-model row is owed to v2.8 01.
- Image director and VN sprites no longer read a one-on-one chat's character (plan census row); manual image commands
  in a plain solo chat now see no cast.
- The D7 scenario seeds a v6 blob stamped for the chat with `stories: {}`; whether the runtime treats that exact shape
  as readable was not verified live.

**Overall gates (03 + 04 together, on `39262713`)**: `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook`
→ all ok: typecheck, typecheck:test, lint, test (513 suites passed, 1 skipped; 6220 tests passed, 1 skipped), build,
build:dev, test:debug (958 pass, 0 fail), debug:typecheck, test:release (94 pass), test:replay, test:plugin (87 pass);
`test-storybook:ci` SKIPPED (`--no-storybook`: the runner finds no stories under `.claude/worktrees` paths; the
Storybook run above was done by hand instead). Earlier runs: the first, without `ST_ROOT`, went red at `build`
(the worktree has no `.st-root`; environment, not code); one went red at `test:debug` `legacyFree` (scenario name,
fixed in `d3109389`).
