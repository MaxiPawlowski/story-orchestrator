# Lonelog (Obsidian) — v2.8 27 review
meta: https://github.com/snifer/lonelog · clone path `C:\dev\st-extensions-research\gamification\lonelog\source` @
`ea64954` (2026-10-07) · downloads 4,405 · licence: `LICENSE` is the 0BSD-style text of Dynalist's sample plugin,
with the copyright line still reading "Dynalist Inc." (not the author). The README badge says 0-BSD. Notation content: the
Lonelog notation is © 2025-2026 Roberto Bisceglie, **CC BY-SA 4.0** (`README.md:198`) · tier 2. Files read:
`README.md`, `src/utils/parser.ts` (types, threads, progress), `src/utils/lonelog-tokenizer.ts` (token kinds),
`src/utils/partylog-parser.ts` (types, actor modes, authority warning).

## What it is
An Obsidian plugin for the Lonelog notation, a plain-text shorthand for logging solo play: actions, oracle questions,
rolls, results, consequences, world events, and bracket tags for NPCs, places, threads, clocks, tracks and timers.
Dashboards rebuild threads, progress, scenes, inventory and combat by parsing the notes. The Partylog add-on adds who
acted, for group sessions.

## How it works
- **Line kinds** (`lonelog-tokenizer.ts:10-20`, patterns `:53-69`): action `@`, world event `!`, question `?`, dice
  `d:`, consequence `=>` at line start, result `->` anywhere, plus table/generator/meta/scene/session/round blocks.
- **Tags** (`:76`): `N, L, PC, Thread, E/Clock, Track, Timer, F, R, Inv, Wealth, Party, Faction, Goal, Quest, Loot,
  Advance, OOC`, each with an optional inline update `->new`.
- **State comes from the log.** `ParsedElements` (`parser.ts:87-98`) is rebuilt on every parse; nothing is stored apart
  from the text. A thread's state defaults to `Open`, and the most recent mention wins (`parser.ts:181-205`).
  Clocks, tracks (fractional allowed) and timers parse `X/Y` with an optional `->X'/Y'` (`:308-367`). Only the last
  occurrence of each `type:name` is kept (`:369`).
- **Group attribution.** A Partylog timeline entry carries `actor`, `actorNames`, `actorMode: solo|assist|group|list`,
  `outcome`, and dice semantics (`left op right`) (`partylog-parser.ts:25-53`). Objectives are `goal|quest` with a
  state (`:85-92`).
- **Authority warning.** A session that holds both GM world events (`!`) and oracle questions (`?`) gets a
  `mixed-authority` warning (`partylog-parser.ts:173-178`, `:1004-1014`). In other words, it tracks who is allowed to
  decide what the world does.

## Overlap with Story Orchestrator
- **Same philosophy:** derived state, last write wins, recomputed from an append-only record. That is our rollback ≡
  replay: drop the tail and re-derive.
- **They do, we don't:** one typed vocabulary for a play log (action / question / roll → result → consequence / world
  event), with an actor on each line, and an export a human can read.
- **We do better:** typed, validated state. Their state is inferred from prose with regexes, so a typo forks a thread.

## Patterns (rubric table)
| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| typed log entry kinds (action/roll→result→consequence/world event) | data model | journal, widget | state-only | derivable | player-safe per row | OK | needs code | 5 | M | v2.7 36 Q5/W `log` |
| state = fold of the log, last mention wins | data model | quest, clock, journal | state-only | derivable | player-safe | OK | needs code | 4 | S | v2.7 36 Q5 |
| actor field per entry, plus solo/assist/group mode | data model | journal | state-only | derivable | player-safe | OK (N members) | needs code | 4 | S | v2.7 36 Q5 |
| authority split: the player writes `@`, the world writes `!` | mechanic | journal, director signal | state-only | derivable | player-safe | OK | needs code | 4 | S | v2.7 36 Q5, agency |
| notation as an export format of the session journal | authoring format | journal | state-only | derivable | author-only | OK | needs code | 2 | S | new plan seed |

## Notes per pattern
- **Journal `log` row shape (plan 36 Q5/W).** Proposal: `{at: {boundary, messageId}, kind: "action" | "check" |
  "consequence" | "world_event" | "quest" | "milestone" | "scene", actor?: <roster id | "player">, text, outcome?:
  <enum word>, source: "check" | "quest" | "transition" | "milestone"}`. The rows are derived from the boundary log,
  `extras.checks`, quest status and milestones. No new store is needed, so a swipe removes the rows with the tail.
- **Authority = agency.** Only the player's own messages produce `action` rows, and the system never writes an
  `action` row for the player. Everything the story does is `world_event`/`consequence`. This turns the "never narrate
  the player's action" rule into a property the log can be tested for.
- **Last mention wins.** Quest status and steps should fold the same way, as a pure function of path + blackboard,
  which plan 36 already intends.
- **Export.** `so-journal.mts export` could emit Lonelog-style lines for human sessions. This is low priority. Use our
  own symbols or attribute the notation (CC BY-SA).

## Copy / Avoid
- Copy: the entry-kind vocabulary, the actor and mode on each entry, fold-from-log state, the authority split.
- Avoid: regex inference from prose as the source of truth (ours is typed qualities), and copying the notation spec
  text.

## Licence note
Code is 0BSD-style and compatible with AGPL-3.0, but the LICENSE copyright line is a leftover from the template. We
take patterns only. The notation is CC BY-SA 4.0: if we emit it as an export format, attribute it, and do not copy the
spec prose.

## Verdict
Relevance **high** for the Journal. Take: **typed log rows `{kind, actor, outcome}` derived from rolled-back stores,
with the authority split (player `action` vs world `world_event`) as an agency invariant**.
