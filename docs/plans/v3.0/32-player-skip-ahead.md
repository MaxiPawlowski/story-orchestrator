# v3.0 32 — Player-chosen skip ahead

**Status: BUILT 2026-10-30 on branch `v3.0-32-skip`, not merged; RP rating owed (GPU)** (was PLANNED 2026-10-30) (harvest 2026-10-30, index `30-harvest-index.md`; revised after `30-review-sol.md`).
Nothing built. Size: M (the clock mechanism makes it bigger than the control).

## Problem (player)

- Travel, waiting and routine play out beat by beat. The agency rule forbids the model to skip ahead "unless the player
  chose to go", but the player has no way to choose it except typing a meta request the narrator may ignore.

## Evidence

- Harvest: `extension-research-2026-10-30/dooms-enhancement-suite.md` P1 ("cut to it": one-shot instruction, no player
  line, swipes keep it, the player's next send ends it).
- Ours: `NO_SKIP_CLAUSE` `src/engine/agency.ts:39`; no skip/montage control (grep `src/`: 0). Plan 19 built the one-shot
  direction for an `llm` reply (`src/runtime/npcSpeak.ts:51-69`, `oneShotDirectionText`), cued-line swipe replay and
  voice start that refuses while busy (`stHost/generation.ts` voiceStart). Clock: after anchoring, `life_time_read` advances
  at most one day part per boundary (`src/engine/life/clock.ts:91`), so a narrated overnight or multi-day skip leaves
  `story_time` behind. Due work (v2.9 07 echoes, agenda steps, rumor landings) is keyed to story time.

## Recommendation

- **S1 Control.** "Skip ahead" in the story card / What could I do? (29 phase 2 tab body) and `/story skip`. Target "to the
  next scene"; "to <open quest>" only for quests in the player projection whose next place is known. Disabled while
  generating, before the first committed reply, while a check outcome is pending.
- **S2 Time first, in code.** The span is decided before the reply, not read from it. Owner decision between:
  - A (recommended): the skip moves at most to the next day part, through the existing read rule. No new writer. The
    direction says "until <next day part>". Longer gaps take repeated skips.
  - B: a new boundary writer `time_skip` (player-chosen span, forward only, capped at one day), registered with the
    `story-time` rollback detector and a code-only seed in its rollback floor. Needs v2.8 50 B2 semantics restated.
- **S3 Due work interrupts.** Before arming, compute what falls due inside the span (echoes, agenda steps, rumor
  landings, quest timers). If any is due, the skip stops at the first due point and the direction says "stop when <neutral
  cue> happens" (the cue is the event's own player-visible line or a neutral "something needs your attention"; never
  hidden text). This is the narrow part of v2.9 G10 the skip needs; the general time-jump split stays parked.
- **S4 Delivery.** One narrator reply (the story's narrator member, else the scene lead; never N drafted members) through
  the 19 one-shot direction: summarize the passage of time in a few sentences, stop at the threshold, end with the
  player's move; never decide for the player, never reveal what a gate has not disclosed. Reuses 19's speech reservation,
  cued-line swipe replay (a swipe re-arms the same direction) and voice start; the player's next send ends it. The
  boundary commits on the `command` type. Journal row "Skipped ahead (player)".
- **S5 Guide + campaign.** `story-guide.md` topic; on by default with an author opt-out per checkpoint
  (`agency.skip: false`); decide Adolion adoption (pin bump only if a checkpoint needs the opt-out).

## Invariants touched

- Every feature on by default: the control is available by default; only the owner switches it off.
- Agency: satisfies `NO_SKIP_CLAUSE` explicitly; thinking and inner voice untouched.
- Rollback ≡ replay: the reply is an ordinary boundary; the armed direction is keyed by the armed message index and dropped
  with it; option B's writer has its detector.
- Held secrets: direction text = fixed copy + visible quest title + player-visible cue; resting filter on the cue.
- Prompt layout is quality-rated: the direction changes play prose; blind rating before adoption.
- Prefix (13): the direction rides the 19 seam (tail); payload golden armed vs not armed.

## Floors (predeclared, informational)

- D: 40 cuts (arm, swipe, delete, chat switch, reload, player send mid-reply): 0 stale directions, 0 forced transitions,
  0 time moves outside the chosen mechanism; due-event fixtures: skip stops at the first due point 20/20, never past it.
- RP: >= 25 skips on a model lane vs a control of the player typing "we travel on" (same states): blind Sol pairs, no
  category below -0.2, flags <= control + 2, thinking closure no worse than control; Sol labels: lands at a threshold
  >= 20/25, decides for the player <= 1/25, undisclosed reveal 0.

## Tests and gates

- jest: control enablement, due-work scan, direction keyed/cleared, quest list from the player projection; Storybook play;
  payload golden; `so-turn-types-check.mts` row for the skip reply.
- `npm run gates`; live gate real generation on a lane (the control drives it).

## GPU / rating

- RP ~25 x 2 arms, est. ~30 min on the 3090 (TO ESTIMATE). Blind Sol rating owner-gated: ask first.

## Unresolved questions

- S2 option A or B?
- Quest target whose next place is undiscovered: hide the target (default) or allow it unnamed?

## Gate record 2026-10-30 (v3.0 build, branch `v3.0-32-skip`)

Worktree `C:/dev/so-v30-32-skip`, from master `02cc9dbc`. No GPU, no lane, no staging (owner rule: GPU only on "resume").

**Builder's choices (owner may revisit).**
- S2 time mechanism: **option A** (the plan's recommendation). No new writer: the skip direction says "until <next day
  part>", and only the existing story read moves `story_time`, at most one part per boundary. Longer gaps take repeated
  skips. No `time_skip` writer, no new rollback detector.
- Quest target ("to <open quest>"): **not built**. Quests carry no place (`QuestStep` has none), so "next place known"
  never holds; with the default answer to the plan's second question (hide the target) the only target is "the next
  scene". Reopen when quests get places.
- Default: `talk.skipAhead` **off** (install-wide), the exception to "every feature on by default" (owner brief: a
  play-prompt change waits for its blind rating). Registry status `off-by-default`, `OFF_UNTIL_RATED` in
  `featureControls.ts` (the coach test checks it). Waits on the RP row below; on a pass the default flips to on.
- Due cue: always the neutral "something needs {{user}}'s attention" (never the echo/rumor/agenda text, which are private
  cues), so no hidden text can reach the direction.
- Teller: the story's `view: "omniscient"` member, else the beat's `talk_control.lead`, only if switched on in the group;
  otherwise the control says why and does nothing. No fallback to another member.
- Speech budget: a new origin `skip` that the per-send budget does not refuse (the player chose it, like a send); its row
  is recorded and rewinds like any voice.

**What was built.**
- S1 control: story card button `#so-hud-card-skip` (shown only when the feature is on; disabled with the reason while
  generating, before the first committed reply, while a check outcome is pending, at a `skip: false` beat, with no teller,
  or while a skip runs) and `/story skip`. State rides the snapshot (`snapshot.skip`, `skipPort.view`).
- S2/S3 pure core `src/pacing/skipAhead.ts` (lazy): span to the next part (crossing midnight named), due scan over
  scheduled echoes (part or boundary), pending rumors (day or boundary), commitment deadlines, and quest/step, schedule,
  agenda-step and commitment gates that the next part's time values open; first due point wins (an event due on the next
  boundary first). Direction = fixed copy.
- S4 delivery `src/runtime/skipRuntime.ts` + `skipRuntimeHost.ts` (lazy) through `speakGenerated` (19 one-shot
  direction, `call` scope, voice starter), `chatSettle.speak`, a `skip` speech reservation, the cued line (a swipe re-arms
  it through the existing `cueSwipe`), journal row "Skipped ahead (player)", a RunToken check after the reply await. Main
  door `skipPort.ts`, gate copy `skipGate.ts`. No blackboard write, no transition, no new extras slice.
- S5 author opt-out `checkpoints[].agency.skip: false` (schema, `readAgency`, Studio Agency editor checkbox, guide).
  Feature `skip` in `featurePolicy`, `FEATURE_CONTROLS`, `FEATURE_STATE` (`skip-ahead`), registry, settings copy, plan 24
  row, setup-path Level 5 row, player guide (`playing.md` "Skipping ahead" + `/story skip`), author guide
  (objective-agency), `docs:guide` + `docs:settings` regenerated.
- Adolion: no pin bump (the feature is off by default and no beat needs `skip: false` yet). Decide after the rating.
- Rating arm (prepared, not run): `scripts/debug/so-skip-rate.mts` (`capture` on a model lane: per state a skip reply and a
  typed "We travel on." control from the same state, both deleted, then the chat advances; `rate`: one Sol call per pair,
  order by sha256(salt:id), refuses a pack naming the arm; `summary`) + `lib/skipRate.mts` (floors as declared:
  >= 25 rated, no category below -0.2, flags <= control + 2, thinking closure no worse, landsAtThreshold >= 20/25,
  decidesForPlayer <= 1, undisclosedReveal 0) + `skipRate.test.mts`. Queued in `gpu-queue-2026-10-30.md` as
  "32 RP skip-ahead rating" with the exact commands.

**Floors.**
- D (jest): 40 cuts (none, swipe, swipe twice, delete, delete then swipe, chat switch, reload, reload then swipe, player send
  mid-reply, player send after; x clock/no clock x due/no due): 0 stale directions, 0 time moves (values frozen), 0
  transitions (no engine path); a swipe re-arms 100 %, a delete then swipe re-arms 0 (`skip.review.test.ts`). Due
  fixtures: 20/20 seeded schedules stop exactly at the first due point, never past the next part (`skipAhead.test.ts`).
- RP: NOT run: no GPU (owner rule). Arm and commands ready (above).

**Commands and results.**
- `npm run gates:quick`: red once (jest related: `guideTopics.test.ts` field name, `coach.test.ts` setup-path row and the
  all-on-by-default assertion, `arrivalEquivalence` golden for the new scenario), fixed, then green (typecheck,
  typecheck:test, lint changed, jest related, defect replay `--cached` 32/32).
- `npm run gates -- --no-storybook` run 1: RED at test: `ownership.guard.test.ts` census (`runSkip`, `createSkipPort.run`
  unclassified). Fixed: a RunToken check after the reply await + census rows (`checked`, `local`) + a lapsed-run test.
- `npm run gates -- --no-storybook` run 2 (no `--resume`, tree `5821c50f`): build, typecheck, typecheck:test,
  debug:typecheck, lint, test (jest), test:replay (32/32 killed), test:release, test:plugin all ok; test:debug FAIL
  after 2,426 s: `scripts/local/judgeServerQueue.test.mjs` hung ~40 min (killed by hand) and two controller reaper tests
  (`a hard-killed controller leaves no text server behind`, `startup reap ...`) failed, while other builders' gates ran
  on the same box. Environment: nothing in this change touches `scripts/local`; run 1's test:debug on the earlier tree was
  green in 193 s.
- `npm run gates -- --no-storybook --resume` (same tree): only build + test:debug rerun, both ok (test:debug 103 s); the
  other 8 reused green. So the full run is green on this tree with test:debug from the resume (environment failure).
- Storybook alone on port 6232: `npm run storybook:build` ok (7 min), then the test runner on `http://127.0.0.1:6232` `--maxWorkers 2`: 169 of 169 suites, 1028 of 1028 tests passed (includes `StoryCardSkipAhead`, `StoryCardSkipAheadWaits`, `StoryCardSkipAheadOff`).
- Main bundle 1,269,958 B (budget 1,300,000 B).

**NOT run.**
- Live gate `test/scenarios/v30-32-skip-ahead.json` (model lane; schema-checked, evals syntax-checked): NOT run, unmerged
  branch, no staging, no GPU.
- Payload golden armed vs not armed, `so-turn-types-check` row for the skip reply: NOT run, no staging. The jest review
  test pins that the direction reaches only the teller's draft and no other member's.
- RP blind Sol rating: NOT run, no GPU (generation owed on "resume").

**UI-rework zone files touched.** `src/components/drawer/HudCard.tsx` (one optional button), `HudStrip.tsx` (prop
pass-through), `HudStrip.stories.tsx` (three stories), `src/index.tsx` (one handler), `src/studio/components/AgencyEditor.tsx`
(one checkbox). No check, narrative or pipeline change.
