# Plan 13 — v2.8 / v2.9 close-out: what we finish now, what moves to v3.0

Owner request 2026-10-25: close v2.8 and v2.9 without leaving open work for the next version. Sorted by what the player gets.
Only the 3090; every GPU row runs through plan 11 (classes, stop rules, prompt batch where it fits). Owner decisions behind this
plan: `00-overview.md` §Owner decisions 2026-10-25 (13 items) and §Close-out split 2026-10-25.

Exit: every row below is done (green, or a recorded miss with its floor unchanged), the v3.0 list is copied into
`docs/plans/v3.0/05-deferred-items.md`, a final `npm run gates` + `npm run suite:nomodel` are green on one frozen build, and the
status table says CLOSED for v2.8 and v2.9 (accepted where the floors were met, the rest recorded as informational misses).

## Do now

Order: C1 first (it feeds C2-C5), the rest in parallel where they do not share a lane or the GPU.

1. **C1 — owner playtest** (`12-owner-playtest.md`). Part A = v2.9 08 O4 (floor >= 8/10, Sol rater). Part B = the one human
   evaluation for v2.7-v2.9: flags, 1-5 scores, top annoyances. Then triage every flag into fix-now / v3.0 / not a defect, and fix
   the fix-now ones (same gates as any change). Done when: O4 recorded, every flag has a verdict, fix-now flags merged.
2. **C2 — New Game+ chain in real play.** 45 seal on H/I: the epilogue now passes (177 words), but the final chapter record came
   out `degraded` and the finished run was not offered by the carry picker (`the finished run is not offered: []`). Find why the
   record degraded (verifyChapterRecord on the real model's record; capture through plan 11 B2 `saga` kind) and why the picker
   refused (plays index `ended` hint vs `carryCandidateFromBlob` refusal; it returns no reason today: give it one). Done when:
   `live-v28-45-seal.json` passes on the 3090 x1 (epilogue >= 120 words not the fallback, picker lists the run, seed before
   boundary 0).
3. **C3 — promise row on the big story** (GS6.8). The toy-group promise scenario passes; the Saga carrier made no row after two
   real turns and a read. Capture the read (B2) and see whether the model emitted no `[promised]` line, emitted one the parser
   refused, or the quote failed the byte-exact span. Fix the cause (parser/prompt) or record a model miss. Done when: the cause is
   named in plan 47's record and GS6 `--model judged` passes GS6.8, or it is a recorded model miss with the prompt unchanged.
4. **C4 — flashback moves the clock** (T8 timewindow04: the flashback control reads "morning" in 3 of 3 runs). Prompt rule in the
   time read: a remembered/flashback scene does not set the current time; regression = timewindow04 fixture. Done when: T8 via
   `so-prompt-batch --measurement t8` scores 4/4 (floor 0.9), or the miss is recorded after one prompt change (never retune the
   floor).
5. **C5 — v2.9 06 stuck-player LT** (40 situations x 2 arms) through B2 `lt06`, stop rules S3 (0 leaks) and no S4 (blind metric),
   then the blind Sol usefulness rating. Done when: recorded in plan 06 with denominators, floors unchanged.
6. **C6 — live checks of the 2026-10-25 decided items** on a no-model lane (staged build): A02 (stop a streaming reply: held, no
   boundary, no read; released on send; swipe/regenerate), v2.9 06 panel in player mode (help line, no greyed row) and Author view
   (greyed row with reason), v2.8 53 (a disabled member hears no `present` move). G07 is observed in C1. Done when: each has a
   scenario in `test/scenarios/` that passes x2 on a no-model lane and is in `suite:nomodel`.
7. **C7 — main bundle headroom.** 1,299,999 B in a worktree but 1,300,002 B in the main checkout (module ids follow the folder
   layout). Move non-startup code into lazy chunks for >= 20 KB headroom (in build on `bundle-headroom-2026-10-25`). Done when:
   main checkout `npm run build` passes with >= 20,000 B under budget.
8. **C8 — suite:nomodel to green.** First run 2026-10-25: 191 rows, 128 green, 51 red, 7 incomplete, 5 not-runnable (summary
   `C:\dev\so-lanes\batch-2026-10-25T10-21-32-915Z.json`). Triage each into environment (lane setup: image extension, missing
   groups `SO-Open-Stretch-Curve` / `SOIMG Test cast`, extraction profile on a no-model lane, flaky lane 33), fixture drift
   (copy/expectation changed), or product defect; fix fixtures and seeding, file product defects as rows here. Done when:
   `npm run suite:nomodel` green x2 consecutively on lanes 30-34.
9. **C9 — GS1.10 copy check**: Sol rates the start-pane and briefing copy from GS1's recorded run (second model, never the owner).
   Done when: findings filed with severity in plan 34-copy and fix-now ones merged.
10. **C10 — finish in-flight agent work**: plan 11 B2 extension (`lt06`, `saga` kinds, branch `v2.9-11-b2-ext`), merged with full
    gates.
11. **C11 — records and close**: plan 70 gate record (lean suite), plan 02/42/47/50/45 result notes, queue, status table,
    `so-evidence archive` + `npm run sessions:archive` after the last GPU row, final freeze: one `npm run gates` + `suite:nomodel`
    on the frozen commit, staged, header captured.

### C8 result (2026-10-25/26, branch `v2.9-13-c8`)

- Lane prepare in `npm run suite:nomodel` (default lanes 30,31; 33 is another agent's): offline fresh seed (`SO_LANE_OFFLINE=1`,
  no server plugins, so no TypeSafe/opencode/controller/ComfyUI call can leave a lane; the first run's plugin lanes made real
  TypeSafe and opencode calls), SO settings at defaults with a closed-port memory model, keyless DeepSeek CC profile, Summarize on
  with auto summaries off, side panels unpinned, copied library index dropped, groups SO-Open-Stretch-Curve + SOIMG Test cast
  seeded, page probed; every lane it prepared is stopped after the run. Harness: `requires.viewport`, `requires.plugins` (rows
  needing a server plugin leave the list: v28-69-k12-commit-race), leftover Studio/workspace closed at sandbox start, library
  restore puts the library index back, `restart_story` answers within 60 s (J10.7 hung 2 h), `st-lanes batch --fresh-page`
  (reload before every row), readiness retries `/csrf-token`, settings saves wait 60 s, and a run whose staged build changes
  mid-batch is VOID (exit 3).
- Verdicts over the first run's 63 non-green rows plus rows found later: environment ~25 (lane settings drift, lane 33 co-driver,
  groups, Summarize, DeepSeek profile, 15 MB settings saves, residue between rows, panel pinned, library index), fixture drift /
  class ~35 (cited commits: 7724042c, 83473666, b190faa2, 3a9671e3, 5c086027, d97af6d5, 50bcbc2b, 236c1c17, 9460f28d, f2fc43c4,
  201bd784, 090be91b, 4c073021, fa5fdf0a, c699a0cc, e3d2ee1f, 544975fb, d83862b4, 4f4e5df9; classes J4.7/J11.1/J11.18 any,
  J5.6 judged, J8.3 dependsOn, v28-60-b5 and live-story-workflows to model lanes), product 6 (below; 2 fixed since).
- Runs (summaries `C:\dev\so-lanes\batch-<stamp>.json`):
  - 10-21-32 (first, lanes 30-34): 191 rows, 128 green, 51 red, 7 incomplete, 5 not-runnable.
  - 12-18-59 (lanes 30,31,32,34): 187, 160 green, 27 red.
  - 14-19-36 (A): 188, 182 green, 6 red (5 product + d-04 library index, fixed after).
  - 18-42-29 (B, lanes 30,31): 180 green, 7 red, 1 incomplete (J10.7 hang, J9 drawer flake, v19 HUD timing; fixed after);
    staged build changed mid-run.
  - 21-11-10 (C): **185 green, 3 red, all product defects** (v27-d-01, v27-d-08, v27-d-10); staged d0f41c3a.
  - 22-11-36 (D): 182 green, 6 red: the 3 defects + plan04-pacing, v24-01-guidance, v28-31-p5-depth, because 28eab941
    (story injections at depth 0) was staged mid-run; reverted by cdbfd6a6.
  - E and F stopped early (staged build flips; one server stall; live-v5 lost rename after a fresh page, fixed).
  - 02-02-10 (G): 182 green, 5 red, 1 incomplete: the 3 defects, e3 (Before you start pane over the Studio click, fixed),
    v28-35-g7-shipped-blocks and v29-04-cues (the staged build was restaged at 03:04Z mid-run; v29-04 had no runtime after it).
- Not reached: green x2 consecutively. The lanes serve SillyTavern's staged copy, which was restaged five times during C8
  (d0f41c3a, b28fdaf8, cdbfd6a6, 7fbd6dd9; all `dirty`), so no two full runs (about 3.5 h each on two lanes) shared one build.
  On the current staged build (7fbd6dd9, dirty) `v28-35-g7-shipped-blocks` fails standalone ("story blocks set but not in the
  sent request": guidance, pacing, check outcome) though master's src is unchanged since cdbfd6a6: the uncommitted part of
  that staged build, not a fixture; re-check on a clean staged build.

### C8 fixes and final run (2026-10-26, merged to master 90bfb9cc + 5a94b11c)

- v27-d-01 FIXED (a4e94ad5): `revealSetting` moved to `src/runtime/settingReveal.ts`; a control not in the DOM opens the page
  that owns it (`settingIntent` in `workspaceRoutes.ts`: `so-feature-<id>-*` -> This story > Features > <id>, else Orchestrator >
  Connections) with `control`, and `WorkspaceShell` reveals it; the Setup row's Show me uses the same path (no 250 ms timer).
  `featureOfControl` shared with `guide/showTarget.ts`. Test `runtime/settingReveal.test.ts`.
- v27-d-08 FIXED (owner delegated; same commit): the harvest lines (`#so-inner-harvest-silent`, `#so-inner-harvest-idle`,
  same ids and conditions) live in `components/settings/InnerHarvestNotes.tsx`, rendered on the inner voice feature page
  (`FeaturePages.tsx`, story and Defaults) and by `InnerVoiceControls`. `THINKING_TARGET_ID` is now
  `so-feature-inner-harvestReasoning` and the registry's inner-voice `where` is `featureAt("inner", "enabled", ...)`, so the
  model-not-thinking row's Show me lands on that page. Fixture step 20 now goes This story > Play, checks the author detail,
  clicks Show me and finds the line on the inner page. Storybook `FeaturePages` InnerVoiceModelNotThinking +
  OtherFeatureHasNoHarvestLine.
- v27-d-10 FIXED (same commit): the editReread spike queues its re-read on the read lane (`spikes/editRereadHost.ts`
  `readEdited(..., lane)`, a priority-0 run job with reason `rollback:<id>:edit`), so `scheduler.rereadReason` and the
  "Catching up after your edit" line are set while it waits; the spike's outcome resolves when the job runs, is dropped
  (new `SchedulerJob.dropped`, called by `clearForNewWorld`, priority-2 eviction and pump's discard) or after
  `EDIT_HOLD_CAP_MS` (the job still reads later, only while the cycle's run owns). Tests in `editReread.review.test.ts` and
  `schedulerClear.review.test.ts`; census row `editRereadHost.ts#readEdited.run` (local).
- v28-35-g7-shipped-blocks: red on the clean staged build too, so not the dirty build. It is a fixture problem: on a
  freshly loaded page a background profile probe (Chat Completion, "Reply with exactly: PONG") went through the fixture's
  fetch stub and was read as a sent request without the story blocks. Warm-page runs passed. Fixed in 5a94b11c: the stub only
  answers the main API's generate route.
- Plan 11 B4 census updated for J4.7, J11.1, J11.18 (any), J5.6 (judged), J8.3 (none, dependsOn J8.1/J8.2) (6598a499).
- Gates (worktree `C:\dev\so-13-c8`): `npm run gates:quick` green; `npm run gates` (Storybook, no `--resume`) green in
  310 s on 90bfb9cc (first full run RED on ownership census + S3 file budget, both fixed in 90bfb9cc); `gates:quick` green
  on 5a94b11c. Bundle 1,269,122 B.
- Staged 90bfb9cc (`dirty` = untracked files in the main checkout), bundle 1a39540ae56f, built 04:09:30Z.
- Defect rows x2 on lane 30 (offline, prepared by `suite:nomodel --prepare-only`), batch `--repeat 2 --fresh-page`
  (`C:\dev\so-lanes\batch-2026-10-26T04-11-23-910Z.json`): v27-d-01 2/2, v27-d-08 2/2, v27-d-10 2/2 GREEN; g7 0/2 there,
  then 2/2 GREEN after the fixture fix (`batch-2026-10-26T04-30-41-697Z.json`).
- **suite:nomodel 2026-10-26 04:42Z-05:55Z, lanes 30,31, build held still (no void): GREEN 188, RED 0, INCOMPLETE 0,
  NOT-RUNNABLE 0** (178 scenarios + 10 journeys / 48 none checks; `C:\dev\so-lanes\batch-2026-10-26T04-42-58-382Z.json`);
  lanes stopped by the suite. One green run; the "green x2 consecutively" bar needs one more run on the same build.

### C8 product defects

Rows `suite:nomodel` kept red because the product was wrong, not the fixture or the lane. Fixtures keep their strict
assertions. The v27-d-01, d-08 and d-10 fixes are in §C8 fixes and final run above. Evidence paths are row dirs listed per row.

- **v27-d-01-in-app-walk, step 5: Show me for the memory model does nothing on Library.** Getting started's "Show me" and the
  Repair row's "Show me the setting" call `settingsHost.revealSetting` (`src/index.tsx`), which only looks the id up in the DOM;
  `#so-extraction-profile` renders only on Orchestrator > Connections (`SettingsPanel.tsx` `show()`), so it returns early.
  Regressed in 7724042c. Fix: route an unmounted setting through `workspaceNavigation.open({...connectionsIntent(), control: id})`,
  as the Setup row's Show me does. Evidence: `C:\dev\so-lanes\34\debug\batch\2026-10-25T12-18-59-202Z\v27-d-01-in-app-walk-run1\`.
- **J6.11: a hidden consumed message stays in the next read's projection.** After `/hide 1` the queued read window still
  lists message 1: `nextReadWindow()` (`src/extraction/scheduler.ts`) returned the window captured at scheduling while `pump()`
  re-reads `getChatWindow`. Shows on no-model lanes, where the read waits behind the open breaker. Evidence:
  `C:\dev\so-lanes\31\debug\batch\2026-10-25T12-18-59-202Z\J6-run1\` (and the same failure on lane 34, round 2). FIXED by edf81db3
  (queued-window re-read through `rereadWindow`); green in suite runs C and D once the staged build carried it (d0f41c3a).
  Never declared `expect: fail`: the check passes wherever the read drains (model lanes), so a declared failure would have
  turned red there and hidden the fix.
- **v27-d-08-thinking-warning, step 20: the "Nothing to read" inner-voice harvest line can never render.**
  `#so-inner-harvest-silent` lives in `InnerVoiceControls` inside the settings "characters" area, which `SettingsPanel.tsx`
  `show()` no longer allows since 7724042c (TalkGroup, InnerVoiceGroup, CharacterStateGroup are unmounted everywhere; the
  feature registry's inner-voice `where` points at `#so-inner-beat`, also unmounted). Owner decision: bring the line back on
  the inner-voice feature page, or drop it with the fixture's Author-view leg. Evidence:
  `C:\dev\so-lanes\34\debug\batch\2026-10-25T12-18-59-202Z\v27-d-08-thinking-warning-run1\`.
- **v27-d-10-edit-catch-up, step 13: "Catching up after your edit" never shows.** The `editReread` spike (on by default, 047d2335)
  owns the re-read: `runtime/wiring/scheduler.ts` returns early on `spikeSeams.ownsReread()`, and `spikes/editRereadHost.ts`
  calls `runExtractionNow` directly, bypassing the scheduler, the read lane and `rereadReason`, so `pipeline.ts`
  `editRereadPending` never sees it. Fix: the spike path publishes the pending edit read (or schedules through the scheduler).
  Evidence: `C:\dev\so-lanes\32\debug\batch\2026-10-25T12-18-59-202Z\v27-d-10-edit-catch-up-run1\`.
- **live-v24-02-e3-save-evidence, step 10: a Defaults-page change names every settings section. FIXED in 31990bde**
  (`featureResolve.ts` `settingPatch` builds a one-section patch, `FeaturePages.tsx` sends it; test `install feature switch
  writes only its own section (C8 E3)`); green in suite runs C and D on the staged build d0f41c3a. The install-mode `change()`
  in `src/components/workspace/FeaturePages.tsx` passes the whole GlobalSettings to `setGlobalSettings`; `settingsStore.ts`
  builds the save-failure label from `Object.keys(patch)`, so the curator toggle reads "extraction, pacing, display, ...: the
  settings save answered 500" instead of "stagecraft: ...". Fix: pass only the touched section. Evidence: lane 30 round-2 logs
  (`C:\Users\ROLAPO~1\AppData\Local\Temp\claude\C--dev-story-orchestrator\7d48ee9f-197f-409a-af1c-b6b4e186d736\scratchpad\c8groupA\e3-2.log`..`e3-5.log`) and the suite rows below.
- **Candidate, live-effects-owned-restore (not red; fixture now waits for quiet): the first host effect after an import into an
  empty bound-group chat is refused while the bound story auto-starts** (`PENDING_NOT_SAVED`, "write-ahead record could not be
  saved"; 1 run in 3 before the fixture waited). Suspect `src/runtime/chatSave.ts` `landed()` / run ownership racing
  `groupStoryBindingHost`. Evidence: `C:\dev\so-lanes\31\debug\runs\2026-10-25T13-09-30-853Z-so-scenario-run\`,
  `C:\dev\so-lanes\31\debug\2026-10-25T13-09-41-536Z_so-scenario-failure.json`.

### C9 result 2026-10-25

- Rater: Sol (`openai/gpt-6.1-sol`, `opencode run --standalone`, tools-off agent), one pass, as a first-time player, over the
  start pane's product copy (briefing frame, Before you start lines, identity step, New Game+ step, onboarding) and the two
  campaign stories' briefing and player fields at the pinned export. Prompt, raw answer and findings live outside this repo in
  `C:\dev\so-sessions\copy-check-2026-10-25\` (`prompt.md`, `sol-answer.md`, `campaign-findings.md`).
- Product copy: 0 blocker, 9 major, 7 minor, 0 nit (one major is a product/story contradiction: the persona-description warning
  sat only in the story text, after the create form).
- Campaign copy: 0 blocker, 3 major (2 spoilers in library descriptions, 1 unclear privacy line), 7 minor, 0 nit. Filed
  generically in `campaign-findings.md` for a later campaign pass; campaign repo not edited.
- Fixed (branch `v2.9-13-c9`, product strings only): missing-cast line says characters / this group, not people / this chat
  (major); description field tells the player to leave out what the characters should not know (the contradiction, major);
  lock bypass reads "Start without keeping this persona" (part of a major); opt-out reads "Don't open briefings automatically";
  the memory onboarding line says where This story → Play is and what a pin does; the replay intro drops "heritage" for what
  carries over (minor x3 + the label minor). Player guide updated for the opt-out label.
- Follow-up (same branch): the settled line reads "This chat does not keep that persona…" after Start without keeping (`playingAsUnlocked`, keyed on `record.locked === false`), and the pane says "Closing this page keeps <name> as your persona." while the choice is open (`closeKeeps`); both majors fixed, Storybook `SettledUnlocked` added.
- Left for C1 triage: five Before you start lines name no action inside the pane (memory model, read, story so far, lore,
  persona; major; the Repair rows carry the actions). Kept as is: "persona" (SillyTavern's own term), "tension" / "story card" /
  "lore" in onboarding (they name the UI as labelled).
- Campaign follow-up: the 3 campaign majors fixed in the campaign repo (commit `abc94b5`, academy + saga; pin bump and re-import
  by the coordinator); the 7 minors stay in `campaign-findings.md`.
- Gates: `npm run gates:quick` green twice (typecheck, typecheck:test, lint, jest related, defect replay); test-storybook on
  a static build (port 6177) over `PlayerSetupPane`, `BriefingModal`, `EntryPoints` stories: 3 suites, 31 tests passed.
## C6 record 2026-10-25 (branch `v2.9-13-c6`, staged build `f6b259db`, lane 35 offline no-model)

- `test/scenarios/v29-06-help-line-player.json` (no-model): player panel shows the help line, no greyed row, no offer text or
  reason; Author view (asked again) lists the greyed row disabled with its reason; back in player mode the row is gone. Green x2.
- `test/scenarios/v28-53-disabled-hears-no-present.json` (+ `.story.json`, no-model): Arin group-disabled by a checkpoint cast
  change, a `present` move lands: `rep_guild_seen_narrator` -3, `rep_guild_seen_arin` stays at its start value 0 (seeded, not
  unset); re-enabled, a later boundary and a reopen grant nothing. Green x2.
- Both listed by `npm run suite:nomodel -- --list`.
- `test/scenarios/v29-a02-stopped-reply.json` (`requires.lane: model`, `model: any`): written and schema/eval checked, not run (GPU).
  Run: `node scripts/debug/st-lanes.mts run <model lane> -- scripts/debug/so-scenario.mts run test/scenarios/v29-a02-stopped-reply.json --sandbox --group "Group: Arin, DM Narrator"`, twice.
- Stale: `v29-06-anchored-suggestions.json` step 8 still expects a greyed row in player mode (fails on lane 35, `greyed offer:`);
  contradicts owner decision 2; needs its assertion moved to Author view.
- Lane note: a plain `seed --slim` lane keeps the memory profile on 127.0.0.1:18888 and the no-model requires probe reached it;
  seed no-model lanes with `SO_LANE_OFFLINE=1`.

## Status 2026-10-25 (afternoon)

- C1: owner playtest pending (owner starts later).
- C2: DONE. `live-v28-45-seal.json` PASS on the 3090 (batch `2026-10-25T13-04-09-059Z`); fixes `c5e3546b`, `f6740313`.
- C3: recorded model miss (plan 47 §C3 final GPU run): the read writes 0 promise lines; two product fixes merged on the way
  (journey promisee via chat variable, `leadInAddressee`).
- C4: DONE. T8 4/4 after the timewindow04 fixture correction (plan 50 §T8 fixture correction).
- C5: DONE, F4 miss (plan 06 §LT run): F1 40/40, F2 36/40, F3 0 leaks, F4 +0.0 (floor +0.5), F5 80/80.
- C6: DONE for 06 and 53 (no-model, green x2); A02 model scenario runs after the image journey frees the stage.
- C7: DONE (headroom merged).
- C8: 3 product defects fixed (90bfb9cc); suite:nomodel green once, 188/188 (2026-10-26); x2 still open.
- C9: DONE.
- C10: DONE (B2-ext merged).
- C11: evidence archived: `so-evidence archive --label close-out-20261025 --lanes 45,46 --since 2026-10-25T09:00:00Z` (301 files,
  0 problems) plus `extra/` (06 LT score and rater logs, the interrupted image journey run) and the C9 copy-check folder, so-sessions
  `bfe546ed`, `d09d7737`. Freeze open.
- Image journey (p41, lane 46, owner-data seed, images on): stopped by the owner at 14:19Z to free the GPU, after rig[Bram]; 17 steps
  pass, frames[Ash] refused 1 of 2 (0 mask-import). Full rerun owed when the GPU is back.

## Move to v3.0 (copied into `docs/plans/v3.0/05-deferred-items.md` §From the v2.8/v2.9 close-out)

- **v2.8 42 witness filter** (W4 FAIL 2026-10-25: real exact-set 13/147 vs presence 144/171; the read answers all-present). Needs a
  redesign, not a fix; the code stays unconsumed (as today).
- **v2.9 03 S2** polish measurement (goes with S3, already v3.0).
- **Plan 11 B3** replay backend, and the rest of B6 (the `suite:mutation` review).
- **Long-context measurements**: R2/R7 (B1-PFX/HIST), R12 SP6, R3 K5 at 32K, R5 B1-NARR (>= 48K).
- **Optional extra rows**: v2.9 07 larger real-play count, 05 P3 real-play rows, 04 C2 with the event off screen.
- **Folded ideas** from the v2.9 triage (each destination plan's §Folds) and v2.8 55-59 (already moved).

## GPU budget (3090)

C2 seal 15 min, C3 capture + GS6 judged ~25 min, C4 T8 batch ~5 min, C5 LT ~60 min + rating, C1 owner play (owner's own time).
About 2 h of model time plus the playtest.

## Unresolved questions

- C2: should a `degraded` final record still count as an ended run for New Game+ (it carries the blackboard, not the summary)?
- ~~C8: should `suite:nomodel` select a memory profile on no-model lanes for checks that need one configured but never call it?~~
  Yes: the lane prepare selects a configured profile on the closed port 18079 (see §C8 result).

## GPU rows 2026-10-26 (lane 45, staged `90bfb9cc`)

- C6 A02 `v29-a02-stopped-reply.json` (model lane): GREEN x2 (batch `2026-10-26T04-10-55-498Z`).
- J6 run 1 (batch `2026-10-26T04-14-24-497Z`): 10/11, J6.11 PASS (the `edf81db3` fix confirmed on a model lane); J6.4 FAIL was fixture
  drift (Overview tab is Author-only, the rollback notice is on Play), fixed `7cd57056`.
- J6 run 2 (batch `2026-10-26T04-24-27-988Z`, with the fix): J6.4 PASS; J6.8 FAIL (passed in run 1: model-dependent read evidence,
  flaky); J6.11 BLOCKED by a page navigation mid-evaluate (harness, passed in run 1). Every J6 check passed at least once; not green x2.
- Image journey p41 (lane 46, 2026-10-26): 31/32; frames[Cleo] refused 2/2: cause = stale head box from the previous member (race in
  `SpriteBuilder.tsx`), fix on `v2.9-frames-mask` (`b12f4778`), GPU verification after the C8 suite releases the stage.

## GPU rows 2026-10-27/28 (v3.0 end batch, staged `d9ff15db`, fixtures `f4e6fa16`)

Full record: `docs/plans/v3.0/00-overview.md` §v3.0 end batch 2026-10-27.

- C6 A02 `v29-a02-stopped-reply.json`: GREEN x2 again on lane 45 (batch `2026-10-27T21-10-31-704Z`).
- J6: not green x2. J6.8 passed in every run (4 runs). Under `st-lanes batch --fresh-page` the page is lost mid-evaluate
  (J6.11 x2 in `2026-10-27T21-14-27-193Z`, J6.12 in `2026-10-28T00-24-48-647Z`); a direct `so-journey run J6` is GREEN 12/12
  (record `test/journeys/records/v3.0-end-batch/2026-10-28T00-24-25-872Z_journey-J6.json`). Harness, cause not pinned.
- Image journey p41 x2 (lane 33): every functional step passes 2/2, including frames[SO-P41 Cleo] (head-box race fix
  verified on the GPU); both runs miss gpu-idle while another agent's model lane shared the GPU. NOT GREEN (floor miss,
  confounded); a clean-GPU rerun decides the floor.
- C8 suite:nomodel on fixtures `f4e6fa16`: GREEN 191/191 once (`batch-2026-10-28T03-06-06-757Z.json`); the earlier run on
  `d9ff15db` fixtures was 189/192 (three stale fixtures, fixed in `f4e6fa16`). x2 consecutive still open.
- Freeze: still open (C1 owner playtest, suite x2, J6 under the batch runner, the end batch's D-EB1 notice defect).
