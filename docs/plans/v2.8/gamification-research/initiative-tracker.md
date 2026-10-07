# Initiative Tracker — v2.8 27 review

meta: https://github.com/javalent/initiative-tracker · clone path
`C:\dev\st-extensions-research\gamification\initiative-tracker\source` @ `85f0873` (2026-04-13) · ★ 223 ·
downloads 162,552 · licence GPL-3.0 (`LICENSE`, "GNU GENERAL PUBLIC LICENSE Version 3"); condition descriptions in
`src/utils/conditions.ts` are 5e SRD text (game content, OGL/CC-BY territory, not ours to copy) · files read:
`src/utils/creature.ts`, `src/types/creatures.ts` (Condition), `src/utils/conditions.ts` (shape only),
`src/tracker/stores/tracker.ts` (round/turn, HP update, logging, state), `src/tracker/ui/creatures/Status.svelte`,
`src/tracker/player/PlayerView.svelte`, `src/logger/logger.ts` (append), `src/main.ts` (state save),
`src/settings/settings.ts` (status + player HP options).

## What it is

An Obsidian combat tracker: a sidebar list of creatures (party members and monsters) sorted by initiative, with
HP/temp HP/max HP, AC, statuses, an active-turn pointer and a round counter. A separate **player view** window shows
a reduced table for a second screen. Encounters can be built from note code blocks and from Fantasy Statblocks
creatures; an optional logger appends combat events to a markdown file. One global encounter at a time.

## How it works

- **Creature state** (mutable class): `hp`, `temp`, `max`, `current_max`, `initiative`, `active`, `enabled`,
  `hidden`, `friendly`, `player`, `status: Set<Condition>` (`creature.ts:18-46`); serialized by `toJSON` to a plain
  `CreatureState` with status as names only (`creature.ts:218-243`) and rebuilt by name lookup (`:252-280`).
- **Encounter state** = ordered creatures + `round` + running flag + log file, saved into the plugin's settings
  blob on every update (`tracker.ts:296-304`, `main.ts:574-575`). No history, no snapshots.
- **Condition shape**: `{name, description, id, resetOnRound?, hasAmount?, startingAmount?, amount?}`
  (`types/creatures.ts:52-64`). User-defined statuses are created in settings with "Remove Each Round" and
  "Has Amount" toggles (`settings.ts:1375-1404`).
- **Durations are not durations.** `resetOnRound` strips the status when the round wraps (`tracker.ts:640-649`);
  `amount` is a manual counter with +/− buttons, removed at 0 (`Status.svelte:9-10, 36-41`). Nothing decrements
  `amount` per round automatically; "3 rounds of poison" is the GM clicking.
- **Turn order**: `goToNext` advances the active pointer, skipping disabled creatures; wrapping increments `round`
  (`tracker.ts:616-658`). `goToPrevious` decrements `round` but **re-runs the same `resetOnRound` filter**
  (`tracker.ts:684-693`): stepping back deletes statuses instead of restoring them — undo is lossy.
- **Damage**: temp HP absorbs first, healing overflow is configurable (ignore / to temp / raise max)
  (`tracker.ts:180-208`); max-HP changes clamp current HP (`:222-238`).
- **Player view (second audience)**: hidden creatures are dropped (`PlayerView.svelte:44`); the active marker skips
  over hidden creatures so a hidden monster's turn reads as the previous visible one's (`:31-42`). Monster HP is
  always a word — Healthy / Hurt / Bloodied / Defeated by thresholds (`:23-29`); party HP shows numbers only when
  `diplayPlayerHPValues` is on (`:77-80`, `settings.ts:250`). Status names of every visible creature are shown (`:84`).
- **Log**: human-readable lines ("X took Y status") appended to a vault file (`tracker.ts:895-909`,
  `logger.ts:131`); append-only, never rewritten on undo.
- **Initiative** is rolled through Dice Roller when available (`tracker.ts:360-362`): random, not seeded.

## Overlap with Story Orchestrator

- **We do better**: rollback ≡ replay (their back-step deletes statuses and the log keeps lines for undone turns);
  seeded rolls; per-chat state (theirs is one global encounter in plugin settings, the moral equivalent of our
  install-wide store holding chat state).
- **They do, we don't**: a player-facing *derived* projection that never shows raw numbers for NPCs (HP → health
  words), `hidden` entities whose turns are folded into the previous visible one, and a typed condition record with a
  per-round clear flag and a counter.
- **Philosophically opposite**: turn-based initiative. In a group chat the speaker order is the director's job (plan
  14 talk control), and the player's turn must never be skipped or forced; combat rounds have no clean boundary
  equivalent except "one rendered reply" or "one player send". HP attrition as a fail state is a punishment loop.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| numeric value → public word bands (Healthy/Hurt/…) | UI | quality display (`word`) | state-only | derivable | player-safe (hides exact value) | OK | declarative | 5 | S | v2.7 36 Q2 `as: "word"` bands |
| condition `{id, clear_on, amount}` with boundary-counted duration | data model | mood, condition quality, clock | state-only | derivable if duration = boundaries since set | author-only default | OK | declarative | 4 | M | v2.7 37 L2 (mood decay) / v2.7 36 Q2 |
| `hidden` entity folded out of the player projection | UI | widget `visible_when`, roster | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 W / milestones "???" |
| per-entity rows (cast as rows, value columns) | UI | widget (`board`/`meters` per member) | state-only | derivable | relationship rows never public (37) | OK (N members) | declarative | 3 | M | v2.7 36 W `board` |
| temp pool absorbs before main meter | mechanic | quality (paired ints) | state-only | derivable | author decides | OK | needs code (rule) | 2 | M | no (encode as two qualities + gates) |
| round counter + clear-on-round | mechanic | clock | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 35 clock / v2.7 36 `clock` |
| lossy back-step (re-filter on undo) | anti-pattern | — | — | unrollbackable | — | — | — | 1 | — | no (refuse; our rollback restores) |
| append-only event log file | anti-pattern | journal | — | unrollbackable | — | — | — | 1 | — | no (journal is derived, plan 36 Q5) |
| turn order forcing who acts next | anti-pattern (for us) | — | — | — | — | player turn would be skipped/forced | — | 1 | — | no |
| HP to 0 = defeated | anti-pattern (agency) | — | — | — | — | — | — | 1 | — | no (no fail state from attrition) |

## Notes per pattern

**Word bands → `display.as: "word"` for numbers too.** Plan 36 restricts `word` to enums with `player_labels`. Their
Healthy/Hurt/Bloodied is the case for a numeric variant: `display: {public: true, label: "Supplies", as: "word",
bands: [{max: 0, word: "none"}, {max: 3, word: "low"}, {word: "plenty"}]}` on an int/float with `min`+`max`. Validator:
bands ascending, last band open, every value in `[min, max]` lands in exactly one band. This lets an author publish a
quantity without publishing the number (and without the boundary "value 3 → 2" being readable as a hidden event).
Keep `rel_*` refused, as plan 37 already says meters never go public.

**Conditions with durations → plan 37 L2 mood and a general `lasts`.** Their two flags (clear on round, manual
counter) are the weak version. Ours, rollback-safe: store the boundary at which a condition/mood was set (already on
the blackboard as the write's boundary) and derive "active" as `boundary - set_at < lasts.boundaries` or "until next
scene break" (`lasts: {boundaries: n} | {until: "scene_break"}`). No decrementing counter is stored, so a swipe needs
no special case — the projection recomputes. This is exactly L2's "decays at the next scene break", generalized.

**`hidden` → `visible_when` + folded order.** Their player view drops a hidden row *and* hides the gap it would
leave (the active marker stays on the previous visible row). Same rule for our Journal `track` and milestone lists:
an unrevealed step is not a blank row and not a counted placeholder unless the author chose `secret: true` ("???").
Counts ("3 of 5 steps") leak hidden steps; derive counts from visible steps only.

**Per-member rows.** A `board` widget with one row per roster member and columns bound to per-member public
qualities fits N members + one player; but per-member relationship/mood columns are author-only per plan 37.

## Copy / Avoid

- Copy: derived player projection with word bands; hide-and-fold for hidden entries; condition records with an
  explicit clear rule; per-member rows.
- Avoid: mutable state with a lossy undo; append-only logs as the record; global single-encounter state; initiative
  turn order in a group chat; HP-to-zero fail states; raw NPC numbers in the player view.

## Licence note

GPL-3.0 code: GPL-3.0 can be combined into AGPL-3.0 (GPLv3 §13 allows it), but we take patterns only. Condition
description texts are 5e SRD material: do not copy them.

## Verdict

Relevance **medium**. The one thing to take: a player projection that turns a bounded number into authored words
(Healthy/Hurt-style bands), plus duration expressed as "boundaries since set" so conditions/moods roll back for free.
