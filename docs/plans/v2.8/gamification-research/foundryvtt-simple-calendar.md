# Simple Calendar (Foundry VTT) — v2.8 27 review
meta: https://github.com/vigoren/foundryvtt-simple-calendar · clone path
`C:\dev\st-extensions-research\gamification\foundryvtt-simple-calendar\source` @ `f09bb96` (2024-05-25; GitHub's last
push is 2025-05-12, so the clone HEAD is about a year older than upstream) · ★ 70 · downloads n/a · licence MIT
(`LICENSE`, © 2021 Dean Vigoren) · no game content · tier 2. Files read (repo has 1,649 files): `types/index.d.ts`
(NoteData), `src/constants.ts`, `src/classes/notes/{note-stub,note-manager,note-trigger}.ts`,
`src/classes/calendar/index.ts` (time change only), `src/classes/time/{index,time-keeper}.ts`.

## What it is
A Foundry module that keeps a world clock on a configurable calendar (months, weekdays, leap years, moons, seasons)
and attaches notes to dates. The GM advances time by hand, from combat rounds, or with a real-time clock. A note on
the current date can fire reminders and macros. Each note has its own per-user visibility.

## How it works
- **One scalar of time.** The calendar stores the current date, and `toSeconds()` (`calendar/index.ts:1055`) folds it
  into seconds since epoch. `secondsToDate` (`:915`) goes back the other way. Every display field (weekday, season,
  moon phase) is computed from that one number.
- **Advance = a delta.** `changeDateTime(interval)` (`calendar/index.ts:1060`) applies year/month/day/hour parts and
  then emits a `DateTimeChange` hook with `changeInSeconds` (`:1087-1088`). Combat adds `secondsInCombatRound ×
  roundsPassed` for each round (`:1276`).
- **Real-time clock.** `TimeKeeper.interval` adds `gameTimeRatio × updateFrequency` seconds on every wall-clock tick
  (`time/time-keeper.ts:159`), saves every 10 s (`:92`) and pauses on game pause or combat (`:199`).
- **Note data model** (`types/index.d.ts:2218`): `{calendarId, startDate, endDate, allDay, repeats, order, categories[],
  remindUsers[], macro?}`, stored as a flag on a Foundry journal entry (`note-stub.ts:79-86`). `repeats` is
  `Never|Weekly|Monthly|Yearly` (`constants.ts:208`).
- **Visibility.** `canUserView` reads the journal entry's ownership (observer level or higher, `note-stub.ts:345-351`).
  `isVisible(date)` combines that permission with the date and repeat match (`:505`). So visibility belongs to each
  note and each user, not to the calendar.
- **Triggers.** `checkNoteTriggers` (`note-manager.ts:399`) checks every note against the current time
  (`noteTriggered`, `:349`, covering start, middle, end and exact-day cases). A `NoteTrigger` keeps an in-memory
  `fired` flag, and `fireOnce` defaults to true (`note-trigger.ts`). The flag is not persisted, so a reload resets it.

## Overlap with Story Orchestrator
- **We do better:** the boundary is our clock, and rollback rewinds it. Their `fired` flag lives in memory and the real-time
  clock writes on a 10 s timer. Neither survives a reload or an undo cleanly.
- **They do, we don't:** a time quality that derived fields read (day part, weekday). Notes pinned to a date that
  appear only when it arrives. Repeat rules.
- **Opposite:** wall-clock time advance. In a chat, time only moves when the story says so.

## Patterns (rubric table)
| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| single time scalar + derived calendar fields | data model | quality, schedule | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 37 L4 |
| advance by delta on authored events (transition `add`) | mechanic | transition, clock | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 37 L4, v2.8 22 |
| repeating dated note (weekly/monthly) | data model | schedule | state-only | derivable | author-only | OK | declarative | 3 | M | v2.7 37 L4 |
| per-note visibility on dated entries | UI | widget, journal | state-only | derivable | player-safe if gated | OK | declarative | 3 | S | v2.7 36 W |
| real-time ticking clock | anti-pattern | clock | wall clock | unrollbackable | — | — | — | 1 | — | no |
| in-memory `fired` one-shot flag | anti-pattern | milestone | state-only | unrollbackable (refuse) | — | — | — | 1 | — | no |

## Notes per pattern
- **Time scalar.** We should not build a calendar engine. Use one `time` int quality (`source: code`, minutes since
  story start), changed only by transition/checkpoint `set`/`add`. `day_part`/`weekday` are pure derived views
  (`derive` over the blackboard, like `chance`), never stored. Then L4's
  `roster[].schedule[{when, at}]` gates on `day_part` and `location`, and rollback ≡ replay holds without extra work.
- **Delta advance.** Their `DateTimeChange(delta)` hook is the signal the v2.8 22 director needs ("time passed"). For
  us that is the boundary diff of `time`, which can be computed from the boundary log, so no event store is needed.
- **Repeats.** `schedule.when` can express weekly or daily routines as a gate over the derived `weekday`/`day_part`.
  No `repeats` enum is needed, so the gate grammar stays the only rule language.
- **Visibility.** A dated widget/log row carries `visible_when` (plan 36's field) instead of per-user ownership. We have
  one player, so author vs player is the whole matrix.

## Copy / Avoid
- Copy: one scalar plus derived fields, delta-as-signal, a `when` that holds over a span (start, middle, end).
- Avoid: wall-clock advance, unpersisted `fired` flags (replace with latched qualities), a second rule language for
  repeats.

## Licence note
MIT code, compatible with AGPL-3.0, but we take patterns only and copy no code. No game content.

## Verdict
Relevance **medium**. Take: **time is one code quality that transitions advance, and every calendar field is a
derived view**. That is the base L4 schedules need.
