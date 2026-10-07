# LifeQuest — v2.8 27 review
meta: Obsidian plugin (repo URL not in clone metadata reviewed) · clone path `C:\dev\st-extensions-research\gamification\LifeQuest\source` @ `d95610a` (2026-07-12) ·
★ 4 · downloads unknown · licence: `LICENSE` is the Dynalist sample-plugin 0BSD-style permission notice ("Copyright (C) 2020-2025 by Dynalist Inc."), not the author's own; no separate game-content licence ·
files read: `src/types.ts`, `src/engine.ts`, `src/core/quest-actions.ts`, `src/core/quest-hierarchy.ts`, `src/daily-note.ts` (penalty check), `src/store.ts` (clamp)

## What it is
A habit tracker dressed as an RPG: recurring "quests" (daily/weekly/monthly/free) carry XP and a penalty, completion
is ticked in the daily note, a streak multiplies XP, levels follow a square-root curve, badges and a coin shop sit on
top, and a weekly review dashboard computes per-quest success rates and suggests difficulty changes. Solo, real-time.

## How it works
- **State**: one JSON blob `LifequestData` — profile, `xp {total, level, todayGained}`, `streak {current, longest,
  lastActiveDate}`, `quests[]`, `badges[]`, `activityLog[]`, `weeklyReviews` (`src/types.ts:1-16`, `:27-38`).
- **Quest record**: `title, area, frequency, xp 5-100, penalty 0-50, difficulty easy|normal|hard|epic, status
  active|paused|retired, parentQuestId` (`src/types.ts:40-58`). Difficulty is mostly a label; only `epic` pays coins
  (`src/core/quest-actions.ts:88-93`).
- **XP**: completed → `+xp + class bonus`, missed → `-penalty`, both times a streak multiplier 1.0/1.5/2.0 at 7/30 days
  (`src/engine.ts:9-13`, `:23-28`). Level = 1 + floor(sqrt(total/500)), capped 100 (`src/engine.ts:34-38`).
- **Penalty loop**: on first open of a day, every unticked quest in yesterday's note writes a `quest_failed` log row
  and subtracts XP (`src/daily-note.ts:729-780`).
- **Totals are mutated counters, not folds**: XP is added in place and clamped at 0 (`src/core/quest-actions.ts:108`,
  `src/store.ts:98`); undo removes matching log rows and subtracts their sum, clamped again (`quest-actions.ts:43-58`),
  so undo after a clamp is not an exact inverse.
- **Sub-quests**: one level deep (`quest-hierarchy.ts:87-100`); parent auto-completes when all active children are done
  that day (`quest-hierarchy.ts:162`, `:179-191`).
- **Weekly review**: pure fold over the log → success rate per quest and area, deltas vs last week, and a four-way
  suggestion (raise difficulty / keep / review / pause) from thresholds (`src/engine.ts:224-231`, `:233`, `:322`).
- **Badges**: unlocked by threshold checks on streak and level, each with an XP bonus (`src/engine.ts:408-425`).

## Overlap with Story Orchestrator
- We do better: quest status is derived, never stored (plan 36 Q1); rollback ≡ replay rules out their clamped counters.
- They do, we don't: the review fold (per-item success rate + "what next" suggestion) as an author-facing read model.
- Philosophically opposite: penalties for not acting and streak multipliers reward session length and punish refusal,
  which our agency policy forbids.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| parent completes when all steps done | mechanic | quest | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q1 |
| periodic review fold (rate + suggestion) | UI | journal, director signal | state-only | derivable | author-only | OK | needs code | 3 | M | v2.8 22 |
| typed activity log (completed/failed/level_up) | data model | journal | state-only | derivable | player-safe | OK | needs code | 3 | S | v2.7 36 Q5 |
| difficulty label on a quest | authoring format | quest | state-only | derivable | player-safe | OK | declarative | 2 | S | v2.7 36 Q1 |
| penalty for unticked items + streak multiplier | anti-pattern | — | state-only | needs own ring | — | solo | — | 1 | — | no |
| clamped mutable XP counter | anti-pattern | quality | — | unrollbackable | — | — | — | 1 | — | no |

## Notes per pattern
- **Parent auto-complete** → in plan 36 a quest whose `done_when` is omitted could default to "every step's
  `done_when` holds". Keep it a validator-expanded default (`done_when: {all_steps: true}`), not runtime magic, so the
  gate stays inspectable.
- **Review fold** → an author-view "story health" panel: per quest, boundaries active, steps done, whether any step
  stalled N boundaries. That is a director signal for v2.8 22 (which quest the next anchor should push), computed from
  `visitedPath` + blackboard history, never stored.
- **Typed log** → the Journal `log` widget rows: `{kind: quest_started|quest_done|quest_failed|step_done|check,
  questId, boundary}` derived per boundary from status diffs, never appended.

## Copy / Avoid
- Copy: one-level steps under a quest; log rows typed by outcome; review suggestions as author hints.
- Avoid: penalties for inaction, streak multipliers, XP as a stored counter, clamping that breaks inversion.

## Licence note
Patterns only. The licence file is a template's permissive notice (0BSD-like), compatible with AGPL-3.0 in principle,
but its attribution to Dynalist makes provenance unclear; take no code.

## Verdict
Low–medium. Take: "parent done when all steps done" as plan 36's default `done_when`, and the review fold as an
author-only director signal.
