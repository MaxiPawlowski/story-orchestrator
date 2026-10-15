# v2.8 61b: Astra closed-feature reviews, correctness fixes

Sources: `review-astra-closed-v27-2026-10-15.md` (v2.7 features 29/30/32-37) and `review-astra-closed-v28-2026-10-15.md`
(v2.8 features 04/09/10/11/19/22/23/34). Both reviewed `0c283dc6`; fixed on `v2.8-astra-closed-fixes` from master `3ffa3fcb`
(master merged again at `c9407df5` for the v2.8 review). Each finding was re-confirmed on current code with a failing test
before the fix; every fix is one commit whose regression test fails on the old code.

## v2.7 review

- **P0 image prompt, changed look bypasses the narrator exclusion.** Reproduced: a narrator with only a card description and
  one visual card field reached the template prompt with its description. Fixed `7c5a7c7f`: narrator exclusion runs first; a
  changed look builds on an authored or card appearance only, never a description (`Current appearance: …` otherwise).
  Test `src/image/cast.test.ts` "a changed look never carries a card description". Live check owed (image prompt in ST).
- **P0 rollback, agenda wait and mood age survive a deleted turn.** Reproduced: SC1 had the keys in `ROLLBACK_EXEMPT`
  ("life-pacing"), whose reason assumed a restore that the noop path never does. Fixed `d348c26e`: `life-pacing` is a
  `ROLLBACK_DETECTORS` entry; code-only-boundary seed in `src/engine/rollbackDetectors.guard.test.ts` (swipe replays clean:
  wait 2, no step, mood age 1). Every boundary of a life story now takes the full rollback path on a mutation.
- **P1 quest `requires` reads the raw done gate.** Reproduced both ways (done prerequisite whose gate turns false hides the
  dependant; failed prerequisite with a true done gate opens it). Fixed `c76fab82`: `requires` compiles to
  `quest_<id>_closed == "done"`. Test `src/engine/quests.test.ts` "quest requires". Guide updated.
- **P1 active quests starve undiscovered quests.** Reproduced: discovery key read in 0/20 rotations with five active quests.
  Fixed `30ff4c21`: when active keys fill `QUEST_SCOPE_CAP`, one slot goes to the offered/hidden keys, rotating; actives
  rotate over the rest. Plan 52's codex discovery source is a separate tier, untouched. Test `src/extraction/questScope.test.ts`.
- **P1 stale suggestions.** Reproduced (token without a window accepted an edit). Fixed with the v2.8 Ask finding in
  `85cb5b0c`: suggestions and Ask mint their run over the transcript window `[0, last]`; an edit inside it discards the answer,
  and a fill after such an edit is refused with its own copy. A reply appended later still counts. Tests
  `src/runtime/suggestionsHost.test.ts`, `src/runtime/askHost.test.ts` ("bound to the transcript"). Live check owed.
- **P1 persona Switch back reports success when the lock failed.** Reproduced. Fixed `487363ee`: returns the lock failure.
  Test `src/runtime/playerSetupActivation.test.ts` "Switch back reports the lock failure".
- **P2 image setup checklist demands ComfyUI URL and director.** Reproduced (static, unit). Fixed `570ff4d3`:
  `imagesStepDone` follows the route: ST backend needs ST's Image Generation source, Comfy needs its URL, the director is
  optional (template fallback). Step title is now "Set up an image service for pictures". Test `src/runtime/repair.test.ts`.
  Live check owed (Getting started list).
- **P2 sprites "Enabled" vs effective activation.** Reproduced. Fixed `56d12750` by the first option Astra gave: an untouched
  install-default sprite stage resolves `automatic` and reads "Automatic: on when the story directs the stage" in Features
  (card and status). Behaviour unchanged (making it always on would start sprite work in every story chat; owner call if
  wanted). Test `src/runtime/featureResolve.test.ts`.
- **P0 risk, check outcomes bypass audience filtering.** Reproduced at unit level (a label overlapping a held secret reached
  the shared block). Fixed `0cd6452b`: the outcome block passes `memoryActions.restingText`; a block left with no outcome
  line is withheld. Plan 60 B10's quiet/impersonate hold is unchanged. Test `src/runtime/checkOutcomeHost.test.ts`.
  Labels are authored text, so this is defence in depth; architecture.md lists the block among shared texts.
- **P1 risk, `cue()` cross-chat.** Reproduced: a run lapsing during the service wait still produced a plan. Fixed
  `c1d08150`: the cue mints a run before the wait and re-checks it (and the open chat id) before `direct()`. Test
  `src/image/cleanHost.test.ts`. `src/image` is outside the ownership census roots, so no census row.

## v2.8 review

- **P0 author `description` reaches player Ask and suggestions.** Reproduced. Fixed `fae89ca0`: the projection's intro is
  `player_intro` only. Property test in `src/runtime/playerProjection.test.ts` (changing the description leaves the prompt
  text identical).
- **P0 curator-created lore leaks into another run.** Reproduced (story route and an already-loaded book). Design choice:
  stamp filtering, not an overlay. Every create already carries `{{// so:created <chat> | <group>}}`; the first
  `WORLDINFO_ENTRIES_LOADED` observer now removes entries stamped for another chat from all four per-call arrays, global,
  character, chat and persona, so every ST scan route is covered with no new books and no file writes. A fresh chat in the
  same group is another run. Fixed `3e77c79f` (+ census rows `eaf8365d`). Test `src/runtime/storyLore.test.ts` "curator-created
  lore stays with the run". Not covered: the curator in another chat still sees the entry when it reads the book to propose
  patches (it may patch it, and the stamp stays). Live check owed (two chats, one book).
- **P1 Ask and suggestions accept results built on edited-away messages.** Same fix as the v2.7 item, `85cb5b0c`.
- **P1 living pending work survives a rollback that does not move the engine.** Reproduced: `movedAfter` counted applied ops
  only. Fixed `deb8d68c`: a waiting (proposed/accepted) proposal or a divergence reading after the restored boundary also
  counts, so the mutation takes the full path and `restoreAfterRollback` withdraws it and resets the streak. Test
  `src/runtime/livingPort.test.ts`. Limit: `restoreAfterRollback` still does nothing for a chat that does not track a living
  history (branching on a plain story); its divergence streak is not reset there.
- **P1 wizard lorebook updates cannot clear fields.** Reproduced at three layers (parser, `loreEntryShape`, `upsertWIEntry`).
  Fixed `f734defe`: a step naming `secondaryKeys: []`, `outlet: ""` or `triggers: []` clears it (an outlet clear also moves an
  outlet-positioned entry back to position 0); a field left out keeps the entry's value. Primary `keys` are deliberately not
  clearable: the op always carries them, an empty list is the constant-entry shape, and clearing a keyed entry's keywords
  would make it never fire. Tests `src/services/stHost/worldInfo.test.ts` (create, restrict, clear, reread),
  `src/wizard/provisioning.test.ts`, `src/copilot/parse.test.ts`. Live check owed (wizard edit card against a real book).
- **P2 author meter widgets vanish.** Reproduced (validated, rendered nothing). Fixed `f31ca3e6`: an author `meters` widget
  keeps a bound quality with no `display`, shown by key and raw value; players never see it. Test
  `src/runtime/widgetFollowups.test.ts`.
- **P2 generated living scenes lack a player label.** Confirmed (no `player_name` on director checkpoints). Not fixed: it
  needs a new generated, separately checked label field. Queued (below).
- **P2 briefing diagnostics reject approved opening vocabulary.** Reproduced. Fixed `80162de7`: the drafted and wizard briefing
  check (`briefingSpoilerNames`) ignores terms the approved opening already says (`player_intro`, start `player_name` /
  `player_text`, `player.role` / `summary`). The author diagnostic and the player diagnostic keep the strict list (an opening
  text cannot clear itself). Test `src/runtime/briefingDraft.test.ts`.
- **P2 open stretches mistake engaged play for quiet and repeat offers.** Confirmed (offers rely on prompt wording; quiet
  watches only exit-gate keys). Not fixed: one offer per player turn with reversible receipts and cooldowns is new rollback
  state. Queued.
- **P1 risk, agency guard narrower than prose.** Reproduced ("You reluctantly agree to surrender" passed). Fixed `0e6a9703`:
  up to three adverbs, "can't help but", and surrender/give/obey/submit/trust/yield/swear verbs; adversarial fixtures with
  world-event controls in `src/generation/living/living.test.ts`. Regex is not semantic safety; constraining generated fields
  to world events stays queued.
- Unverified concerns in the review (held-secret recheck right before accepting curator/director output; HTML widget
  outbound navigation): not reproduced here, queued for a probe.

## For the queue (not built here)

- Living scene public labels: a checked, non-spoiling `player_name` for director checkpoints when they become current.
- Open-stretch offers: one candidate per player turn, reversible offer receipts and cooldown, public-thread movement in the
  quiet read; refusal never raises pressure.
- Agency: constrain director fields to world events, NPC intentions and opportunities (beyond the regex guard).
- Probes: held-secret recheck at curator/director accept; HTML widget navigation under sandbox/CSP.
- Living divergence reset for chats without a tracked living history.
- Curator patching a foreign-stamped entry in another chat.
- Player-experience suggestions, v2.7 review section 2: still-catching-up vs failed suggestion copy and distinct attempt
  types (33); one settled identity summary and lock-failure recovery (34); deterministic hook spacing and respite after a
  decline (35); latest meaningful change and shared public wording across quest surfaces (36); evidence-triggered mood
  refresh and relationship acknowledgment beats (37); keep the last valid visual, accurate pending/failure, spaced automatic
  pictures (32); effective value + source in settings (29); symptom aliases in the guide (30). Ideas: declined-hook cooldown,
  return greeting variants, "what changed since I last looked", revision-aware suggestions (partly done here), one
  acknowledgment per event.
- Player-experience suggestions, v2.8 review section 2: public scene label + last public change on presence panels (04);
  before/after values on provisioning edits (09); briefing failure/retry state with the opening as fallback (10); curator
  dedup by entity identity (11); spaced optional offers (19); safe labels and "available vs decided" (22); only meaningful
  public changes on widgets (23); resulting host configuration in author review (34). Ideas: return-to-play card,
  optional-offer shelf, "why is this here?" provenance.

## Live checks owed (after merge, owner's ST)

- Image prompt for a narrator with a changed look (7c5a7c7f); pictures checklist on a default install (570ff4d3).
- Suggestions/Ask after an edit while running, and fill after an edit (85cb5b0c).
- Two chats sharing a curator book: created entry scanned only in its own chat (3e77c79f).
- Wizard lore edit card clearing secondary keys / outlet / triggers on a real book (f734defe).
- Features page sprite state on an untouched install (56d12750).

## Gate record

2026-10-15, branch `v2.8-astra-closed-fixes` at `0e6a9703` (master `c9407df5` merged).

- Per fix: `npm run gates:quick` green before each commit. Miss: `gates:quick` does not run `ownership.guard.test.ts`
  (it reads files, not imports), so `3e77c79f` landed with a stale census key; fixed in `eaf8365d`, caught by the full jest run.
- `npm run gates -- --jobs=2 --no-storybook`: all green in 424.1 s (test 8705 passed / 1 skipped, 758 suites; test:replay
  32 of 32 killed; typecheck, typecheck:test, build, lint, test:debug, debug:typecheck, test:plugin, test:release ok). No flakes.
- Storybook run separately (6006 is reserved): `npm run storybook:build`, then `.sb-static` served by http-server on 6219 and
  `test-storybook --url http://127.0.0.1:6219 --maxWorkers 4`: 144 suites, 862 tests passed.
- Main bundle `dist/index.js` 1,294,865 B (budget 1,300,000).
- Live gate: not run (branch not staged; owner's ST holds master). Owed after merge, list above. Not green until then.
- Worktree setup: copied `.build/defect-replay-cache.json` from the main checkout; without it `defect-replay --cached`
  passes every file to `jest --listTests` and dies on the Windows command-line length.
