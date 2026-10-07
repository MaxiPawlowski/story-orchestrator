# Obsidian Tasks — v2.8 27 review
meta: github.com/obsidian-tasks-group/obsidian-tasks · clone path `C:\dev\st-extensions-research\gamification\obsidian-tasks\source` @ `7d8f441` (2026-10-04) ·
★ 4,042 · downloads 4.36M · licence MIT ("Copyright (c) 2021 Clare Macrae, Ilyas Landikov and Martin Schenck") ·
files read (status model + filter core only): `src/Statuses/StatusConfiguration.ts`, `Status.ts`, `StatusRegistry.ts`,
`StatusValidator.ts`, `StatusSettingsReport.ts`, `src/Query/Filter/Filter.ts`, `StatusField.ts`, `StatusTypeField.ts`,
`BooleanField.ts`

## What it is
Markdown checkbox tasks across a vault, with a status per checkbox symbol, recurrence, and a line-based query language
rendered in code blocks. The part that matters to us is the split between user-named **statuses** and a closed set of
**status types** that the rest of the system reasons about.

## How it works
- **Closed type enum**: TODO, DONE, IN_PROGRESS, ON_HOLD, CANCELLED, NON_TASK, EMPTY (`StatusConfiguration.ts:4-12`).
- **Open status table**: each status = `{symbol, name, nextStatusSymbol, availableAsCommand, type}`
  (`StatusConfiguration.ts:26-52`, `:64-75`); defaults built in (`Status.ts:23-79`). Semantics only read `type`
  (`isCompleted` = DONE, `isCancelled` = CANCELLED, `Status.ts:254`, `:261`).
- **Unknown symbol** is never an error: it becomes a usable TODO-typed "Unknown" status (`Status.ts:198-221`, `:233-234`);
  an absent one is EMPTY (`StatusRegistry.ts:99-105`).
- **Next-status cycle**: each status names its successor (`StatusRegistry.ts:164`); recurrence walks the chain for the
  first TODO/IN_PROGRESS, bounded by the table size to avoid loops (`:202-238`); the registry renders itself as a
  Mermaid state diagram (`:339`).
- **Validation as a report**: empty/duplicate symbol, unconventional symbol-type pairing, unknown next symbol, no path
  back to a TODO (`StatusSettingsReport.ts:41-91`, `StatusValidator.ts:11-17`, `:89`).
- **Query core**: a `Filter` = instruction text + predicate + human explanation (`Filter.ts:26-36`); `done` means type
  DONE|CANCELLED|NON_TASK, `not done` means TODO|IN_PROGRESS|ON_HOLD (`StatusField.ts:23-24`); `status.type is|is not
  X` with a help text listing allowed values (`StatusTypeField.ts:60-74`); boolean AND/OR/XOR/NOT over sub-filters
  (`BooleanField.ts:31`).

## Overlap with Story Orchestrator
- We do better: our status is derived from gates, so there is no cycle to click through and nothing to desync.
- They do, we don't: named-status vs semantic-type split; "terminal" grouping (done-like vs open) used by every view;
  every filter carries its own explanation (like our diagnostics' consequence line).
- Opposite: their status is user-toggled state; ours must never be stored.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| author label over a closed status type | data model | quest | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 Q1 |
| terminal vs open grouping (done = done/cancelled) | data model | quest, journal | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 Q5 |
| state diagram from the definition | UI | quest, gate | state-only | derivable | author-only | OK | needs code | 3 | S | v2.7 36 Studio |
| filter = predicate + explanation | data model | gate, widget | state-only | derivable | author-only | OK | declarative | 3 | M | v2.7 36 widgets |
| lenient unknown → typed fallback | authoring format | quest | state-only | derivable | — | OK | declarative | 2 | S | no (we refuse at validate) |

## Notes per pattern
- **Label over type** → keep plan 36's derived status a closed enum `hidden | active | done | failed`, and let the author
  rename the terminal ones per quest for player copy: `labels?: {done?: "Delivered", failed?: "Lost"}`. Logic, chips and
  filters read the enum only; player copy reads the label.
- **Terminal grouping** → the Journal groups `done` and `failed` together as "closed" with the label shown, so a failed
  quest reads as an outcome, not a punishment. Add derived `closed: boolean` to `snapshot.game.quests[]`.
- **Diagram** → Studio renders a quest's `visible_when → done_when / failed_when` as a tiny state graph with
  `graphAdapter.ts`' Mermaid path; the validator's "both terminal gates true on start" check fits their report style.
- **Explained filter** → widget selectors (e.g. a `board` of quests) should take a tiny declarative filter
  `{status: [...], tag?}` and render "showing active side quests" from it, not free expressions.

## Copy / Avoid
- Copy: closed types + author labels; terminal grouping; bounded chain walks; validation as a readable report.
- Avoid: lenient unknown statuses (we validate strictly); a user-clickable cycle (status is derived).

## Licence note
MIT: code-reuse compatible into AGPL-3.0 with notice kept; we take patterns only.

## Verdict
Medium-high for plan 36's schema. Take: closed derived status enum + optional per-quest terminal labels, grouped as
"closed" in the Journal.
