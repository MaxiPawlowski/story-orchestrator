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
- C8: in progress (agent).
- C9: DONE.
- C10: DONE (B2-ext merged).
- C11: evidence archived: `so-evidence archive --label close-out-20261025 --lanes 45,46 --since 2026-10-25T09:00:00Z` (301 files,
  0 problems) plus `extra/` (06 LT score and rater logs, the interrupted image journey run) and the C9 copy-check folder, so-sessions
  `bfe546ed`, `d09d7737`. Freeze open.
- Image journey (p41, lane 46, owner-data seed, images on): stopped by the owner at 14:19Z to free the GPU, at rig[Bram]; 15 steps
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
- C8: should `suite:nomodel` select a memory profile on no-model lanes for checks that need one configured but never call it?
