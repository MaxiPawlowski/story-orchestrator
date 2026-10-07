# TaskNotes — v2.8 27 review
meta: github.com/callumalpass/tasknotes · clone path `C:\dev\st-extensions-research\gamification\tasknotes\source` @ `69535cd` (2026-10-04) ·
★ 2,196 · downloads 1.96M · licence MIT ("Copyright 2025 Callum Alpass") ·
files read (data model only): `src/types.ts` (`TaskInfo`, `StatusConfig`, `PriorityConfig`, `TaskDependency`),
`src/services/StatusManager.ts`, `src/utils/DependencyCache.ts` (`isTaskBlocked`)

## What it is
One note per task, with the task's fields in YAML frontmatter; statuses and priorities are user-configured tables;
views (kanban, calendar, lists) read an index over those notes. Recurring tasks keep one note plus per-date completion
lists; dependencies follow RFC 9253 relation types.

## How it works
- **Task record**: `title, status, priority, due, scheduled, tags, contexts, projects, archived, …` (`src/types.ts:454-500`).
- **Recurrence without status churn**: RRULE string + `complete_instances[]` / `skipped_instances[]` dates instead of one
  flipping status (`types.ts:467-472`).
- **Derived vs stored fields** are marked: `isBlocked`, `isBlocking`, `hasSubtasks`, `totalTrackedTime` are computed
  (`types.ts:481`, `:492-496`); blocked = any active dependency source in the index (`DependencyCache.ts:645-650`).
- **Dependencies**: `{uid, reltype: FINISHTOSTART|FINISHTOFINISH|STARTTOSTART|…, gap?}` (`types.ts:442-452`).
- **Status table**: `{id, value (stored), label (shown), color, icon, isCompleted, isSkipped?, excludeFromCycle?,
  nextStatus?, order, autoArchive, autoArchiveDelay}` (`types.ts:737-750`); priority `{value, label, color, weight}`
  (`:752-759`).
- **Cycle**: explicit `nextStatus` wins, else next by `order` among statuses not excluded (`StatusManager.ts:25-27`,
  `:32-60`). Validation: ≥2 statuses, ≥1 completed, unique values (`:185-200`).

## Overlap with Story Orchestrator
- We do better: status is derived from gates, not a stored field a user cycles.
- They do, we don't: stored value vs display label vs semantic flag (`isCompleted`) as three separate fields; explicit
  "derived" fields in the type; ordering dependencies between items.
- Neutral: task-as-note is their storage choice; ours is the story record + blackboard.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| quest prerequisite (`requires: [questId]`) → derived blocked | data model | quest, gate | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 Q1 |
| value / label / semantic-flag split | authoring format | quest, quality display | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q2 |
| per-occurrence done list instead of status flips | data model | agenda, schedule | state-only | derivable | author-only | OK | declarative | 3 | M | v2.7 37 L3 |
| sort weight on a display enum | authoring format | widget | state-only | derivable | player-safe | OK | declarative | 2 | S | v2.7 36 widgets |
| auto-archive after delay (wall clock) | anti-pattern | — | — | unrollbackable | — | — | — | 1 | — | no |

## Notes per pattern
- **Prerequisite** → plan 36 quest gains `requires?: string[]` (quest ids); the validator expands it into the quest's
  effective `visible_when` (`questStatus(dep) == done`) and refuses cycles. Status stays `hidden` while blocked; no new
  stored state, so rollback ≡ replay holds. Cheaper than authors hand-writing a gate over another quest.
- **Value/label/flag** → for enum qualities with `display`, allow `display.labels: {<enum value>: "<player word>"}` and
  `display.order`, keeping the enum the logic value. Same split as the quest terminal labels in the obsidian-tasks note.
- **Occurrence lists** → for v2.7 37 recurring agenda steps, record "done at boundary b" derived from boundary logs
  rather than a flipping step status; the agenda's next step is the first not in the list.

## Copy / Avoid
- Copy: prerequisites as derived blocking; separated stored value and shown label; marking derived fields in types.
- Avoid: wall-clock auto-archive; a user-driven status cycle.

## Licence note
MIT: compatible into AGPL-3.0 with notice; patterns only.

## Verdict
Medium. Take: `requires: [questId]` on plan 36 quests, expanded by the validator into `visible_when`, cycles refused.
