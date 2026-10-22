# Plan 60: extension-harvest defect fixes (2026-10-14)

Source: `docs/plans/v2.8/extension-research-2026-10-14/_verification.md` (adversarial read-only check of B1-B19 on
`fa070a6f`). Branch `v2.8-harvest-defects`, worktree `C:\dev\so-harvest-defects`. Scope: every CONFIRMED or PARTIAL
item (B1-B3, B5, B6, B9-B16). PLAUSIBLE B4, B7, B8, B17 and REFUTED B18, B19 were not built (list below).
Each fix was re-confirmed in code (and ST host source where it names one) before the change, has its own commit and a
regression test that fails on the parent tree (checked by stashing the source change and re-running the test).

## Fix log

- **B1 self-test budget/effort** (`23eca0e9`). Re-confirmed: `selfTest.ts` asked `maxTokens: 512`; `roleSelfTest.ts`
  ran every role over `profileRoute(profileId)`, dropping the role's effort that `MemoryModelGroup.testRole` had just
  resolved. Fix: read cap `maxTokensCap("sharedRead")` (2048); `runRoleSelfTest` takes the resolved `route`, every role
  run asks over it, and the read run passes `routedModel(route)` to the core self-test. Test:
  `src/runtime/roleSelfTest.test.ts` "B1: the read test asks with the read budget and the role's resolved effort".
- **B2 substring needles** (`09f2240d`). Re-confirmed in `selfTest.ts` `has()` and
  `scripts/debug/lib/liveSuiteScore.mts` (`haystack.includes`). Fix: a needle starting with a letter or digit must
  start a word (`(?<![\p{L}\p{N}])`, `iu`); word-start only, so `wound` still matches `wounded` and `toma` matches
  `Tomas` (every shipped fixture needle starts a word). Tests: `src/runtime/selfTest.test.ts` "B2: ... harm=wounded is
  not the arm wound"; `scripts/debug/liveSuiteScore.test.mts` "B2: a needle matches at a word start".
- **B3 settings lost in ST's 1 s debounce** (`d3d837c8`). Re-confirmed: `settingsStore` ended in
  `saveSettingsDebounced()` (`script.js:470`, `utils.js:574-584`, no unload flush). A pagehide flush was rejected:
  ST's `saveSettings` awaits `compressRequest` before its fetch (`script.js:8096-8102`), so a request started at unload
  would not leave. Fix: new `stHost/settingsSave.ts` `saveSettingsSoon()` calls ST's own exported `saveSettings`
  (`script.js:8051`) on the next tick, folding a synchronous burst into one save; `hostTypes` gains
  `saveSettings`. Tests: `src/services/stHost/settingsSave.test.ts`, `src/runtime/settingsImmediateSave.test.ts`
  (fails on the parent: the debounced save is called). Nine STAPI mocks gained `saveSettingsSoon`.
- **B5 harness served model and refusal** (`d2589760`). Re-confirmed: `index.mjs` returned `model: request.model` on
  both paths; a claude `stop_reason: "refusal"` with text was `ok`. Also found: the page (`stHost/harness.ts`
  `readHarnessAnswer`) dropped `model` entirely. Fix: claude reads the served model from `modelUsage` (most output
  tokens), opencode from the last assistant message's `model` ref (`SessionMessageAssistant.model`, verified in the
  pinned `@opencode/client` 2.0.28 types), codex reports `null` (its JSONL names none); `requested` keeps the asked id;
  `refusal` is `kind: "refused"`; the page carries `model`. Tests: `plugin.test.mjs` "B5: claude reports the model that
  answered...", `opencode.test.mjs` "B5: the answer names the model OpenCode served" (fake server gains
  `state.servedModel`), `src/services/stHost/harness.test.ts` "B5: the reply carries the model the plugin says
  answered".
- **B6 cast writes not announced** (`2cdeb97c`). Re-confirmed: `stHost/groups.ts` saves through
  `editGroup(id, true, false)` (`group-chats.js:1359-1371`, no event); ST's own toggle flips `.disabled` and emits
  `GROUP_UPDATED` (`group-chats.js:1968-2003`). Fix: after a saved write (confirmed or unconfirmed, never a lost
  one) emit `GROUP_UPDATED`; when the group is the open one, toggle `.disabled` on
  `.rm_group_members .group_member[data-chid]` (ST stores the avatar with jQuery `.data`, so the row is found by its
  `data-chid` attribute, `group-chats.js:1689-1710`). Our GROUP_UPDATED listeners (requirements watch, sprite stage,
  badges) only re-read; the requirements watch hydrates only on not-ready to ready, so no write loop. Tests:
  `src/services/stHost/groups.test.ts` "B6: ...".
- **B9 unguarded crypto.subtle** (`a00f0f4b`). Re-confirmed at `stHost/media.ts`, `stHost/liveHeadAssets.ts`,
  `studio/workflowBundle.ts` (guarded only in `sprites/builder/recipes.ts`). Fix: one `utils/sha256.ts` `sha256Hex`
  with the guard (readable "open SillyTavern on localhost or HTTPS" message); all four sites use it, the sprite builder
  keeps its own wording. Test: `src/utils/sha256.test.ts`.
- **B10 pacing hint and check outcome on quiet/impersonate** (`28cd10c5`). Re-confirmed:
  `withholdTurnBlocks` cleared only the guidance key; the pacing hint and `checkOutcome` stayed. Fix: the pacing
  coordinator's hold clears the hint with the guidance and `updateSteering` keeps both off while held; the hold
  announces each change (`onHoldChange` = manager notify); `turnBlocksHeld()` on the manager; `checkOutcomeHost`
  withholds the outcome while held and restores it on release. Guide line (`story-guide.md` narrator guidance,
  `guideTopics.ts`) now says quiet and impersonate runs get no guidance, pacing hint or check outcome. Tests:
  `pacingCoordinator.test.ts` "B10: ...", `checkOutcomeHost.test.ts`, `runtimeManager.test.ts` "B10: the hold is
  readable...".
- **B11 leading-slash fill** (`5c5ecaa0`). Re-confirmed: `fillChatInput` wrote verbatim, `parseSuggestions` kept `/`
  lines. Fix: `utils/string.ts` `runsAsCommand`; `parseSuggestions` drops such lines and `fillChatInput` refuses them
  (covers the widget action fill too). Tests: `suggestions.test.ts` "B11: ...", `utils/string.test.ts`.
- **B12 tool bridge classification** (`840bfd5a`, inventory `c97dd05a`). Re-confirmed: ST wraps every failure as
  `new Error('API request failed', { cause })` (`extensions/shared.js:490`). Fix: classify `${message}: ${cause}`.
  Test: `profileToolBridge.test.ts` (wrapped causes classify auth/quota/transport). `test/findings/errorCopy.json`
  rows updated in a follow-up commit (`gates:quick` does not run that guard; caught by the full jest run).
- **B13 gotchas doc** (`cb8cb2d6`). Re-confirmed `onStopStreaming` sets `isFinished = true` (`script.js:3847`),
  `onErrorStreaming` sets `isStopped` (`:3820`). Doc only.
- **B14 global WI save debounce** (`97c7d61c`). Re-confirmed: one `saveWorldDebounced` for every book
  (`world-info.js:83`), `_save` cancels it (`:4151-4153`), `saveWorldInfo` sets the cache first (`:4183`), and
  `createNewWorldInfo` saves immediately too (`:4462`). Fix: `stHost/worldInfoPending.ts` wraps the host cache's `set`
  to mark a book written in the last 1.5 s and clears the mark on `WORLDINFO_UPDATED`; after every immediate save of
  ours (`saveLorebook`, and `ensureLorebook`'s create) any other marked book is saved immediately from the cache; a
  failed rescue is logged. False positives (a book just loaded) re-save data the server just sent. Installed in
  `startRuntime`, disposed with it. Tests: `src/services/stHost/worldInfoPending.test.ts`,
  `src/services/stHost/worldInfo.test.ts` "B14: ...". Six startup-test STAPI mocks gained the installer; an
  `errorCopy.json` row added.
- **B15 stale curator rewrite** (`684d8c7a`). Re-confirmed for `rewrite` (the proposal's `before` image is kept on the
  record until the write edge, which only checked length/partial/no-op). Fix:
  `stagecraft/proposal.ts` `staleRewriteRefusal` compares the proposal-time content with the live content
  (whitespace and case folded) and `curatorWriter.writeOp` refuses before the write-ahead row. `patch` unchanged
  (its anchor must still match). Tests: `stagecraftCoordinator.test.ts` "B15: a rewrite accepted after the entry was
  edited by hand is refused..." and the patch control.
- **B16 quest reward clamp** (`826eab3a`). Re-confirmed `engine/quests.ts` added without bounds while step reads
  clamp (`qualityRead.ts` `resolveStep`). Fix: an `{add}` on an int with a `step_rule` clamps to its `min`/`max`
  (display bounds stay display-only). Guide `story-guide.md` quests line updated. Test: `quests.test.ts` "B16: ...".

## Not built

- B4 harness auth/quota regexes (PLAUSIBLE): queue candidate, small; needs recorded error bodies for the anchors.
- B7 `Number(messageId)` in `replyEffortLive.ts` (PLAUSIBLE, negligible): `hostMessageId` swap, folds into plan 69.
- B8 sampler overlay listener order (PLAUSIBLE): **built 2026-10-22** (`v2.8-queue-2026-10-22`): `subscribeToHostEventLast`
  (`stHost/events.ts`) registers with `makeLast` and re-places itself on every `GENERATION_STARTED`; plain subscription on a
  host without `makeLast`. Peer-extension fixture `stHost/samplerOverlay.order.test.ts` (fails on the old code).
- B17 flush poll gives up after 60 s (PLAUSIBLE): **built 2026-10-22** (`v2.8-queue-2026-10-22`): after 60 s the poll keeps going
  every 2 s, and `GROUP_WRAPPER_FINISHED` flushes too. Tests `turnBridgeFlushPoll.review.test.ts` (both fail on the old code).
- B18 (REFUTED as drift; plan 53 build note: faction rows omit `changedAgo`), B19 (REFUTED).

## Gate record

- Per change: `npm run gates:quick` green after every fix (typecheck, typecheck:test, lint, related jest, replay
  `--cached` 32/32). The first `gates:quick` in the fresh worktree failed its replay step (`jest --listTests` with no
  cache); one plain `node scripts/suite/defect-replay.mjs` (32 of 32 killed) seeded the cache.
- `node --test` over the four harness plugin suites: 93 pass, 0 fail.
- Full `npx jest` before B6: 8429 tests, 1 skipped, 0 failed.
- Full gates after merging master `9e96871d` (merge `0b056ec9`), on the branch tip with the plan doc:
  `npm run gates -- --jobs=2 --skip=test-storybook:ci` **all green in 596.3 s**: test:replay, test (8434 tests, 1
  skipped), build (main `dist/index.js` 1,270,379 B, budget 1,300,000), test:debug (1295 pass), typecheck,
  typecheck:test, debug:typecheck, test:plugin, lint (0 errors, 2 existing warnings), test:release. The first run was
  RED at test:debug (45 fails, all `ENOENT test/sessions/adolion-stories.json`: the gitignored campaign index is not in
  a fresh worktree; copied from the main checkout, not committed).
- Storybook outside the gates runner, on port 6226 (6006 is hard-coded in `test-storybook:ci` and shared with other
  sessions): `npm run storybook:build`, then `http-server .sb-static -p 6226` + `test-storybook --url
  http://127.0.0.1:6226 --maxWorkers 2`: first run 8 fails in 5 suites (the Storybook STAPI mock lacked the new
  `saveSettingsSoon`, and the master-base `spriteNarrowViewport`/`spriteWatchViewport` that `sprites/stage.ts` imports);
  mock completed, rerun **139/139 suites, 833/833 tests green**.
- Live gate (B14, B6, B10; also owed for B3 and B5): **NOT run, NOT green.** A private ST copy under
  `C:\dev\so-lanes` (code copy plus `data`/`node_modules` junctions, the plan 04/23 recipe) was refused by the session
  permission policy; the owner ST, :8000, lane 0, lane 31 and the real extension slot were left untouched. Owed: a
  no-model lane run that (B14) edits book A in the WI editor and triggers a story write to book B inside 1 s, then
  reloads and reads A from the server; (B6) applies a `cast_changes` checkpoint and asserts the member row's
  `.disabled` and one `GROUP_UPDATED`; (B10) `/impersonate` with a drifting tension and a fresh check outcome and reads
  ST's prompt for `story_orchestrator_pacing` / `story_orchestrator_check_outcome` absent; (B3) toggles a setting and reloads within 1 s; (B5)
  one harness call per vendor with the plugin reinstalled (`npm run plugins:install`).

## Gate record addendum 2026-10-15: live no-model checks (branch `v2.8-live-checks`)

- Setup (shared by the 2026-10-15 addenda in plans 46, 47, 52, 60 and queue row N13): isolated ST code copy
  `C:\dev\st-live` (tar of `st-v28-nomodel` without `node_modules`, `node_modules` junctioned to the owner's), worktree
  `.st-root` pointed at it, this worktree's build staged with `node scripts/release/stage.mjs --st-root C:/dev/st-live`
  (served `dist/index.js` sha256 `885c115c`, source = master `cc38c5b1`), plugins installed into `C:\dev\st-live\plugins`
  only (judge + harness; harness `config.json` offers claude only). Lanes root `C:\dev\so-live-lanes`: lane 60 = offline
  no-model lane (data copied from `so-nomodel-lanes/44`, server plugins off), lane 61 = the same plus
  `st-lanes.mts pod 61 cloud` (loopback firewall, server plugins on). Run: `ST_ROOT=C:/dev/st-live
  SO_LANES_ROOT=C:/dev/so-live-lanes node scripts/debug/st-lanes.mts run 60 -- scripts/debug/so-scenario.mts run <file>
  --sandbox --group 'Group: Arin, DM Narrator'`. Evidence copied to `C:\dev\so-live-lanes\evidence-2026-10-15\{60,61}\`.
  Owner ST, port 8000, lanes 0/31/33/53/54 and `C:\dev\st-p53` untouched.
- B10 PASS x2 (`60/2026-10-15T06-01-26-049Z`, `...06-03-14-598Z`; `test/scenarios/v28-60-b10-withhold.json`). PLUMBING
  level: the generation request is answered by an in-page fetch stub and ST's online status is set to a stub label for
  the call. A real `generate('impersonate')` and `generate('quiet')` send a body without the pacing hint and without the
  check-outcome header, `turnBlocksHeld()` is true while the request is assembled, and both blocks are back once the run
  ends (a normal dry run carries both). A dry run never takes the hold (`generationLifecycle` ignores dry runs by design),
  so the control is a normal dry run.
- B10 finding (not fixed, queue candidate): a quiet or impersonate run whose `Generate` returns before sending (ST
  disconnected, no GENERATION_ENDED) leaves the hold on, so the hint and outcome stay withheld in the snapshot and the
  next-turn preview until the next loud generation opens, across a chat switch too (the fixture's first runs found
  `staleHold: true` left by an earlier run in the page). The next loud request is not affected: an opened loud run releases
  the hold first.
- B14 PASS x2 (`...06-05-36-065Z`, `...06-08-01-510Z`; `v28-60-b14-wi-pending.json`). Control: ST's own immediate save of
  book B 10-13 ms after a debounced edit of book A loses A's edit on the server (hazard reproduced). Treatment: the
  story's file-mode checkpoint `world_info` write to B lands 11-24 ms after A's edit, A is saved right after it (at 22 and
  39 ms) and the server holds the edit; the gated entry is enabled on the server. Gating mode restored, books removed.
- B6 PASS x2 (`...06-13-42-175Z`, `...06-14-30-712Z`; `v28-60-b6-cast-announce.json`). `cast_changes` disabling Arin: the
  group holds Arin as disabled, ST's member row `.group_member[data-chid]` gets `.disabled`, exactly one GROUP_UPDATED
  naming the group; the re-enabling checkpoint reverts row and group with one more GROUP_UPDATED.
- B3 PASS x2 (`...06-16-54-528Z`, `...06-19-45-435Z`; `v28-60-b3-settings-reload.json`). A settings-store write
  (`stagecraft.meanwhileAcceptMode`) leaves in its own `/api/settings/save` 49-59 ms after the write (200 at 198-258 ms)
  and survives a reload; restored and re-read after a second reload. The reload follows the finished save (step latency),
  so this proves the immediate save, not a save in flight at unload.
- B5 claude PASS x2 (lane 61 `...07-38-18-950Z`, `...07-39-07-186Z`; `v28-60-b5-harness-model.json`): `/complete` asked
  for `haiku` answers ok with `requested: "haiku"` and `model: "claude-haiku-4-5-20251001"`. codex and opencode OWED (not
  offered on the copy); the page half (`readHarnessAnswer` keeps `model`) is unit-tested only. The Claude login had
  expired; one `claude -p` (haiku) refreshed it before the run.
- `assert-player-clean`: 0 findings in every B10, B14, B6 and B3 run (B5 has no UI step).
- Gates for this branch's code changes (harness bridge cap 96 + jest guard, player-clean chapter-card selector + planted
  test, arrival golden re-recorded for the new scenario stories): `npm run gates:quick` green (first run red at the known
  replay `--listTests` flake with empty stderr; one plain `node scripts/suite/defect-replay.mjs`, 32 of 32 killed, seeded
  the cache). `npm run gates -- --jobs=2 --skip=test-storybook:ci`: first run red at `test` (`arrivalEquivalence` golden
  lacked the new scenario stories; re-recorded with `SO_RECORD_ARRIVAL_GOLDEN=1`, 6 added rows), rerun all green in
  445.6 s (test, test:replay, build, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin,
  test:release). Storybook skipped in the runner (it pins 6006) and run separately: `npm run storybook:build`,
  `http-server .sb-static -p 6261`, `test-storybook --url http://127.0.0.1:6261 --maxWorkers 2`: 144 suites, 862 tests
  green.
