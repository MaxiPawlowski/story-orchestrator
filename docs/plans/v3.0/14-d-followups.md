# Plan 14 — Track D follow-ups (offline parts)

**Status 2026-10-28 (current): MERGED to master with `v3.0-wave1-integration` (§Gate record: merge 2026-10-28). Open: D6 P5
still a miss (not retuned), D8 passive-modifier scope finding, D1 rerun (GPU + Sol rating), J6 x2 on a model lane, SP1 count
after the owner's play.** Earlier status (2026-10-26, history): offline parts built on branch `v3.0-d-followups`; GPU and
model-lane rows deferred to the end batch.
Source: `00-overview.md` §Replan 2026-10-26 track D and E/SP1, §Owner decisions 2026-10-26 (12, 13). Each item: one change,
floors unchanged (v2.9 11 stop rules). No GPU, no model lane was used for this plan.

## D6 — 05 P5 matcher p95

- Profile (`node --cpu-prof` over the P5 stress fixture, 8 and 30 runs in one process): self time led by `dedupe`
  (grouping key `JSON.stringify(bindings)` per open branch per ref, plus an O(group²) `dominated` scan) and `branchKey`
  (built eagerly in `sortBranches` for every freshly spawned branch, most of which `dedupe` drops). Tail samples were GC
  pauses at random boundaries, not JIT warm-up only (worst boundary index varied 7-76 across runs).
- Fix (`src/runtime/patterns.ts`, pure, output identical):
  - `dedupe` keeps one latest-last cursor per group instead of scanning the kept list: within a group the sort is by
    first ref then last ref, so walking backwards a candidate is dominated exactly when its last ref is at or before the
    group's latest last ref.
  - the binding part of the group key is cached per bindings object (`bindingKey`; `bind` reuses the object when nothing
    new binds).
  - `sortBranches` builds `branchKey` only on a full tie (`byKey`), never for every branch.
- Identity: persisted state on the fixture is byte-identical (791,630 B, added 631,542, removed 82,313), all 38
  `src/runtime/pattern*` tests green, including the incremental ≡ fold property tests (P4).
- Numbers (same machine, same day):
  - frozen measure `SO_PATTERN_PERF=1 npx jest src/runtime/patterns.test.ts -t P5` x3: before 2.60 / 3.08 / 3.89 ms,
    after 2.03 / 2.19 / 2.04 ms (recorded at build: 2.7-8.5 ms).
  - warm, 30 runs in one process, median of per-run p95: before 1.70-1.86 ms, after 1.10-1.34 ms; median per-run total
    for 100 boundaries 88-91 ms before, 62-69 ms after.
- Verdict: **P5 still MISSES its 2 ms floor on the frozen (cold, single run) measure, by 0.03-0.19 ms**; recorded, not
  retuned. What remains is cold JIT plus GC over a fixture that keeps every delta (the floor at `boundary - 200` never
  folds within 100 boundaries); a further cut needs fewer branch objects per ref (structural, the 52 live branches × 16
  start spawns per check ref), not micro-tuning.
- End batch: none (pure). `npm run gates` at merge covers it.

## D8 — 08 Studio false positive `quality-never-in-scope`

- Already fixed on master before this plan: `f090e510` (2026-10-25, observation gates count as scope, test "does not warn
  for a quality read only by an observation gate, and ignores a reached gate" in `src/studio/diagnostics.test.ts`) and
  `96c3eb46` (observation `when` shares the codex known-when pass in `studio/widgetDiagnostics.ts` `scopedKeys`). The v2.9
  08 status line still called it open; corrected there.
- Re-checked 2026-10-26: `runDiagnostics` on the frozen O4 story (`test/measurements/v2.9/08-o4/story.json`) gives 0
  `quality-never-in-scope` hits; the test above passes.
- Finding, not fixed (runtime scope, not a Studio diagnostic): an extractor quality used only as an observation's
  `passive.modifiers[].q` is not in the runtime read scope (`engine/observations.ts` `observationScopeUnits` lists only
  `when` keys), so the warning on such a quality is true, and the modifier reads its start value. Checks get their
  modifier keys while live (`a368991a`); observations do not. Candidate for a v3.0 row if an authored story uses passive
  modifiers on extractor qualities (the O4 story has 0 passive observations).
- End batch: none.

## D5 — J6.8 flake

- Runs read: lane 45 batches `2026-10-26T04-14-24-497Z` (J6.8 PASS) and `2026-10-26T04-24-27-988Z` (J6.8 FAIL), `J6-run1`
  runner.log and page.jsonl.
- Classification: **model-dependent, but not the read's phrasing.** The read is scripted (`extract.debugResponse`) and
  landed in both runs (failing state: `approached_board: true`, `lastAudit.accepted` non-empty). The failing wait was
  `checkpointIn: [cp2 … cp-6]`: in run 2 the living director had moved the story onto its own branch checkpoint
  (`liv_b1_way`, branch quality `liv_b1_*` registered at the J6.8 send), and from a living branch the authored
  `cp1 -> cp2` route does not fire, so the 300 s wait timed out. Run 1 also had living proposals (3 `liv_b1_*` qualities
  across J6.2-J6.8) but none was the active checkpoint when J6.8's read applied. Whether the director branches at that
  turn depends on the real model's replies and its proposals, so the checkpoint is not a property of this check.
- Fix (fixture, property assertion): J6.8 asserts what it needs, not where the story is. The `checkpointIn` wait becomes
  `wait: {schedulerIdle: true, quietMs: 2000}` and the existing message-dating eval also throws unless
  `approached_board === true` (the scripted read landed); the belief/ledger rollback assertions are unchanged. J6.7 has
  the identical body and exposure and got the same change. J6.1 (its point is the gate firing) and J6.6 (compares the
  checkpoint across a reload) keep their checkpoint waits; the same branch can hold them, recorded as a known exposure.
- Checks run: eval syntax pre-check over every J6 eval; `node --test` scenarioSchema, modelClass, journeyPlumbing,
  scenarioRequires (44/44); `npx jest arrivalEquivalence` 5/5 (golden unchanged, no re-record needed).
- End batch: `node scripts/debug/st-lanes.mts batch --lanes <model lane> --repeat 2 --strict J6` (J6 x2 on a model lane,
  v2.9 13 close-out row).

## D3 — 02 harder-set repetition

- Computed offline from the recorded S6 harder replies (lane 45 st-eval dumps of 2026-10-25, 60 + 60): tic + avoid hits
  baseline 0/60, prevention 0/60 (whole phrase as frozen; substring 0/0 too). `repetitionDownPct` = 1 - 0/0: **undefined;
  floor (>= 25 %) neither met nor missed.** No rater call (deterministic metric). Record and the reason the corpus cannot move
  it: v2.9 02 §Harder-set repetition, computed offline 2026-10-26.
- End batch: none.

## D1 — 06 F4 usefulness (owner decision 13: one prompt change, then rerun)

- Read: Sol's pass-A usefulness notes (one per situation) and pass-B engagement reasons in
  `C:\dev\so-lanes\gpu-b2ext\lt06-gpu1\rater\` against `score.json` (mean +0.0, 10 wins / 18 ties / 12 losses).
- Cause of the 12 losses (counts; synthetic corpus, no campaign content):
  - 6 of 12: the anchored set "introduces an unsupported" person, object or premise. In 5 of them (s07, s08, s10, s12, s36)
    the line is the tagged line for a `dormant-thread` anchor: an old arc that the prompt hands over but that neither the
    player's panel nor the recent messages show, so the line reads as invented to anyone holding only the visible scene (the
    rater's view is the player's view). The sixth (s34) is an authored offer, also absent from the visible scene. The 2
    dormant situations the anchored arm won (s09, s11) carry the same remark ("lacks visible context").
  - 4 of 12: overlap inside the set (two tagged lines on the same matter, or a line repeating the player's own worry).
  - 2 of 12: other (less concrete / less relevant).
- Change (one, `src/runtime/suggestions.ts`): a `dormant-thread` anchor is marked `(from earlier, not in this scene)` in the
  numbered block, and only when one is present the instruction adds "A line for an idea marked from earlier brings it back up
  in the player's own words and says what it was, so it makes sense without the earlier scene." Every other prompt is
  byte-identical (no dormant anchor = no change; the `current` arm never has anchors). Test: `suggestionAnchors.test.ts`
  "marks a dormant thread as from earlier …". Floors unchanged. The lt06 golden (s01, s05: no dormant anchor) still holds
  (`promptBatchLtGolden.test.mts` 3/3).
- Expected reach, stated before the rerun: 7 of 40 situations get a different anchored prompt (s07-s12, s36; at most one
  dormant anchor per ask). Their current paired deltas sum to -3; even if all 7 became wins the mean moves to at most +0.25.
  **Ceiling**: the current arm already scored 5 in 22 of 40 situations (3: 7, 4: 11, 5: 22), so the largest mean delta any
  anchored set can reach on this corpus is +0.625 against the +0.5 floor; passing needs a 5 on nearly every situation with no
  loss. The rerun is therefore unlikely to clear F4 whatever the prompt does; that is a property of the corpus and the 1-5
  scale, recorded here, not a reason to retune the floor. Next candidate change if the owner wants another round: the overlap
  cluster (4 of 12).
- End batch (GPU, ~60 min + Sol rating; one lane 30+ that is not 45; after the branch is merged, built and staged):
  1. `node scripts/debug/st-lanes.mts stop <n>; node scripts/debug/st-lanes.mts no-model <n>; node scripts/debug/st-lanes.mts start <n>`
  2. `node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-prompt-batch.mts capture --measurement lt06 --profile "Story Orchestrator Memory RunPod" --out C:/dev/so-lanes/<n>/b2ext/lt06-d1`
     (expect exactly the 7 anchored rows above to differ in sha from `C:/dev/so-lanes/33/b2ext/lt06/manifest.json`; anything
     else moving means another prompt changed)
  3. model up on `:18888` (`node scripts/local/cli.mjs automatic`), then
     `node scripts/debug/so-prompt-batch.mts send --out C:/dev/so-lanes/<n>/b2ext/lt06-d1 --base-url http://127.0.0.1:18888`
  4. `node scripts/debug/so-prompt-batch.mts score --out C:/dev/so-lanes/<n>/b2ext/lt06-d1`
  5. `node scripts/debug/so-prompt-batch.mts rate --out C:/dev/so-lanes/<n>/b2ext/lt06-d1 --pass both --model openai/gpt-6.1-sol`
  6. `node scripts/debug/so-prompt-batch.mts score --out C:/dev/so-lanes/<n>/b2ext/lt06-d1`, then record F1-F5 in v2.9 06 and
     here (F4 floor +0.5 unchanged), archive with `so-evidence.mts archive --label v30-14-d1`.

## E/SP1 — swipe-back count for S4 (owner decision 12)

- Built: `scripts/debug/so-swipe-backs.mts` + `scripts/debug/lib/swipeBacks.mts`, offline and read-only, no runtime or
  player-facing change. Nothing in the runtime persists a swipe history (the TurnBridge sees `MESSAGE_SWIPED` but keeps no
  record; the journal keeps only status transitions and flags), so the count reads ST's own files: the chat file (a group
  chat is `<data>/group chats/<chat id>.jsonl`) and that chat's backups (`<data>/backups/chat_<key>_<stamp>.jsonl`, key as
  ST's `getBackupKey`), oldest first, the chat file last.
- Swipe-back = a reply whose shown version moved to an earlier one it already had: its `swipe_id` went down between two
  saves, or it gained a version and still shows an older one, or it first appears showing an older one. A deleted version
  (fewer swipes) is not one. Player turns = the player's own non-system messages in the chat file. Output: counts per chat
  and in total, per 100 player turns, verdict against S4 (>= 3 per 100 over >= 300 turns; under 300 turns
  `insufficient` whatever the rate). Never prints message text.
- Lower bound, stated: a back-and-forth between two saves leaves no trace, and ST keeps 50 backups per chat
  (`backups.chat.numberOfBackups`), so for a long chat only the last 50 saves add evidence beyond the final file.
- Caveat for the playtest: v2.9 12 Part B asks the owner to "swipe a reply" once or twice as a mutation test; a swipe-back
  that follows such a test swipe is counted like any other. Report the count with that note; do not subtract by guess.
- Tests: `node --test scripts/debug/lib/swipeBacks.test.mts` 5/5 (back move only visible in a backup, deletion not
  counted, header skipped, backup key matches ST's, verdict thresholds, CLI prints no text). Smoke: 103 lane-45 group chats
  and, read-only with counts only, the owner's 110 group chats (768 replies with a `swipes` array, 0 with more than one
  version so far): parses all, 0 swipe-backs.
- End batch: after the owner's Part B play, `node scripts/debug/so-swipe-backs.mts "C:/dev/SillyTavern-MainBranch/data/default-user/group chats/<playthrough chat id>.jsonl"`
  (read-only; record counts in v3.0 01 and v2.9 13 C1). S4 decides 01: below 3 per 100 over >= 300 turns, or fewer turns at
  the freeze, the drop runs.

## Gates (branch `v3.0-d-followups`, 2026-10-26)

- `npm run gates:quick`: green in 183.3 s (typecheck, typecheck:test, lint changed, jest related, defect replay 32/32 killed).
- `npm run test:debug`: 1573/1574 before a build; the one red (`so-run-header.test.mts` "reads plan 08s nested manifest")
  needs `dist/manifest.json`, absent in a fresh worktree. After `npm run build` (bundle 1,269,120 B, budget 1,300,000) that
  file is 35/35.
- Not run here (coordinator batches them): full `npm run gates`, merge, stage, push; every GPU or model-lane row above.

## Gate record: merge 2026-10-28

- `npm run gates` (no `--resume`) on the merged tree `cf249aa8`: all green in 300.9 s (build, typecheck, typecheck:test,
  lint, debug:typecheck, test 10,799 passed / 1 skipped, test:debug 1632/1632, test:replay, test:plugin, test:release,
  test-storybook:ci 167/167 suites). Main bundle 1,263,247 B (budget 1,300,000); `runtimeManager.ts` 621 lines,
  architecture guards green.
- D1 capture, no-model lane 35, branch `dist/` via route holder, branch harness (`--only s01,s07-s12,s36`): the dormant-anchor
  rows s07, s09, s10, s11, s36 anchored and both s01 arms rebuild offline byte-for-byte (ok). Every sha moved against the
  10-26 lane 33 manifest, controls included: master prompts changed since. s08 and s12 (both arms) fail "offline-rebuilt
  suggestions prompt is not inside the request body" on master's staged build with master's harness too (same `current`
  shas): pre-existing on master, not this merge; to diagnose before the D1 rerun.
- Still open: D6 P5 misses its 2 ms floor by 0.03-0.19 ms (recorded, not retuned); D8 finding (a quality used only as an
  observation's passive modifier is outside the runtime read scope, so the modifier reads its start value); D1 rerun
  (send + Sol rating), J6 x2 on a model lane, SP1 count after the owner's play.
