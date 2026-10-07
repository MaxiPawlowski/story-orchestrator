# obsidian-kanban — v2.8 27 review (tier 2)
meta: https://github.com/mgmeyers/obsidian-kanban · clone `C:\dev\st-extensions-research\gamification\obsidian-kanban\source` @ `5134c05` (2026-03-06) ·
★ 4,525 · downloads 2.72M · licence GPL-3.0 (`LICENSE.md`, "GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007") ·
files read: `src/components/types.ts`, `src/components/helpers.ts`, `src/components/Lane/LaneTitle.tsx`,
`src/parsers/{common.ts,helpers/parser.ts,formats/list.ts}`, `src/Settings.ts`, `src/StateManager.ts`

## What it is
A markdown file rendered as a Kanban board: `##` headings are lanes, list items are cards, and dragging a card rewrites
the file. Lane position *is* the status. Lanes can auto-check cards, carry a WIP limit, and there is an archive.

## How it works
- **State is the markdown file** (frontmatter key `kanban-plugin`, `common.ts:9`; per-board settings in a trailing
  `%% kanban:settings` comment, `common.ts:33`). Every edit re-serialises the whole board and saves it
  (`StateManager.ts:99-108`, `list.ts:450`).
- **Data model:** Board → Lane → Item (`types.ts:105-107`). `LaneData {title, maxItems?, shouldMarkItemsComplete?,
  sorted?}` (`types.ts:16-23`); `ItemData {checked, checkChar, title, metadata…}` (`types.ts:80-90`);
  `BoardData {settings, frontmatter, archive[], errors[]}` (`types.ts:97-103`).
- **WIP limit lives in the lane title** as a trailing `(n)` (`parser.ts:60-66`); exceeding it only adds a style class
  (`LaneTitle.tsx:40`) — a soft signal, never a block.
- **Completion lane:** moving a card into a lane flagged "mark complete" checks it; moving out unchecks it
  (`helpers.ts:48-57`). Status follows position, in that direction only.
- **Archive:** a separate list after a `***` rule (`common.ts:24`, `list.ts:248`, `:429-431`), optionally date-stamped,
  capped by `max-archive-size` with oldest dropped (`Settings.ts:406-418`).
- Presentation: tag colours and date colours as authored lookups (`types.ts:32-48`, `helpers.ts:227`), lane width,
  hide card count (`Settings.ts:58-89`).
- Visibility: none; single user, everything shown.

## Overlap with Story Orchestrator
- We do better: plan 36 derives quest status from the blackboard (planned `engine/quests.ts` `questStatus`, never stored), so it
  rolls back for free.
- They do, we don't: a lane-per-status board with counts, a soft cap, an archive lane.
- Philosophically opposite: their *view writes the state* (drag = status change). Our board must be read-only; a drag
  that moved a quest would be a player-side write outside the boundary, unrollbackable and against the agency model.

## Patterns (rubric table)
| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| lanes = derived status buckets | UI | quest, widget | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 W `board` |
| soft lane cap (`max` shown, never blocks) | UI | widget | state-only | derivable | player-safe | OK | declarative | 2 | S | v2.7 36 W `board` options |
| archive lane, capped, oldest drops | UI | journal, quest | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q (done/failed collapse) |
| drag-to-change-status | anti-pattern | quest | — | unrollbackable (refuse) | — | solo-only | — | 1 | — | no |
| authored tag → colour lookup | UI | widget | state-only | derivable | player-safe | OK | declarative | 2 | S | v2.7 36 W (accent list) |

## Notes per pattern
**lanes = derived buckets.** Their lane is stored; ours is a projection. A `board` widget should be
`{kind: "board", bind: "quests", options: {lanes: ["active", "done", "failed"], cap?: n}}` — lanes enumerate
`questStatus` values only (never `hidden`, which is not player-visible at all), each lane listing quests whose derived
status matches, in authored order. Plan 36 says `board` reads arcs; quests are the closer fit, and an arcs board can use
the same shape with `bind: "arcs"` and lanes `open | resolved`. No authored lane names beyond labels:
`lanes: [{status: "active", label: "In hand"}]`.

**soft cap / archive.** A lane over `cap` collapses to "+N more" rather than hiding the overflow silently; done/failed
lanes default collapsed (their archive), newest first. Purely presentational, so it changes nothing that rolls back.

**drag.** Refuse explicitly in the plan's must-nots: no player or author edit through a widget; author corrections go
through the Studio or `/cp set`, which are boundary-applied.

## Copy / Avoid
- Copy: status-as-column layout, count + soft limit on the lane header, collapsed archive, closed accent lookup.
- Avoid: views that write state; storing status in presentation order; unbounded archives in persisted state.

## Licence note
GPL-3.0: code would be compatible into AGPL-3.0 (GPLv3 §13 allows combination) but we take patterns only, no code.

## Verdict
Relevance **medium**. Take: **a `board` widget is a read-only projection of derived quest status into fixed lanes** —
never the drag-to-move write that defines Kanban.
