# v3.0 32 — Player-chosen skip ahead

**Status: PLANNED 2026-10-30** (harvest 2026-10-30, index `30-harvest-index.md`; revised after `30-review-sol.md`).
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
