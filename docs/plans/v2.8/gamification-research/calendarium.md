# Calendarium — v2.8 27 review

meta: https://github.com/javalent/calendarium · clone path `C:\dev\st-extensions-research\gamification\calendarium\source` @ `388d66d` (2025-09-26) ·
★ 154 · downloads 195,949 · licence MIT (`LICENSE`, "Copyright (c) 2023 valentine195"); the bundled calendar presets
name third-party settings (Greyhawk, Golarion, Galifar, Barovia, Exandria, Harptos, `src/utils/presets.ts:577-4829`),
whose month/holiday names are not ours to ship ·
files read: `src/schemas/calendar/{calendar,timespans,moons,seasonal}.ts`, `src/schemas/events/event.ts`,
`src/stores/calendar.store.ts` (advance), `src/stores/years.store.ts`, `src/stores/cache/{moon,event}-cache.ts`,
`src/stores/weather.store.ts`, `src/utils/functions.ts`, `src/events/event.helper.ts` (frontmatter events),
`src/main.ts` (commands), `CHANGELOG.md`. Svelte UI and the 5,308-line presets file skimmed only.

## What it is

An Obsidian plugin for fantasy calendars: an authored calendar (weekdays, months incl. intercalary ones, leap-day
rules, moons, eras, seasons, weather) plus one "current date", and events placed on dates (one-off, ranged,
recurring, undated). Events come from the calendar's own list or from note frontmatter (`fc-date`, `fc-end`,
`fc-category`). Everything derived (weekday, moon phase, season, weather) is computed from the date, not stored.
Time advances only by hand (next/previous-day commands, or the date picker).

## How it works

- **Date = three ints.** `CalDate {year, month, day}`, month zero-indexed, day/year one-indexed
  (`schemas/calendar/calendar.ts:12-16`). The calendar holds exactly one `current: CalDate`
  (`calendar.ts:72`), stored in plugin settings; no history.
- **Static calendar.** `StaticCalendarData {firstWeekDay, overflow, weekdays, months[], leapDays[], moons[], eras[],
  offset?, years?, ...}` (`calendar.ts:26-43`). `overflow` decides whether weeks run on across months or every
  month restarts at weekday 0 (`utils/functions.ts:551`).
- **Months.** `{name, id, length, interval, offset, type: "month"|"intercalary", short?, week?}`
  (`timespans.ts:66-84`): `interval`/`offset` let a month exist only every N years; intercalary months sit outside
  the weekday run (`stores/month.store.ts:25,59`). A month may carry its own week (`timespans.ts:79-82`).
- **Leap days.** `{timespan (month index), interval: [{interval, exclusive?, ignore?}], offset, intercalary, after?}`
  (`timespans.ts:44-59`); the rule list encodes "every 4, except every 100, except every 400" as ordered
  include/exclude conditions, evaluated in `testLeapDay` (`functions.ts:385-410`). Days-before-year is closed-form
  (`functions.ts:492-540`, `daysFromYearOne` `:571-587`), so any date maps to an absolute day count.
- **Absolute day.** `daysBefore(date)` = year days + month days + day - 1 (`stores/years.store.ts:20-24`). Every
  derived view keys off this one integer.
- **Moons are pure.** `{name, cycle, offset, faceColor, shadowColor}` (`moons.ts:4-11`); phase =
  fractional part of `(daysBefore - offset) / cycle`, bucketed into 24 named phases (`stores/cache/moon-cache.ts:33-46`).
- **Weather is seeded per day.** Generator seeded with `epoch * seed` where epoch is the absolute day
  (`stores/weather.store.ts:103-104`); temperature/precipitation drawn from season ranges interpolated by position in
  the season (`:106-125`, `:182-183`). The seed itself is minted from `Date.now() ^ Math.random()` once at calendar
  creation (`utils/functions.ts:589-590`, `settings/settings.constants.ts:20`), then fixed in settings.
- **Events.** `EventLike {id, name, type, date, category, description?, note?, sort?}` (`events/event.ts:8-17`);
  types dated / range (`date` + `end`, `:57-61`) / recurring / undated. **Recurring** = each of year/month/day is
  either a number or a `[lo|null, hi|null]` range, null = open (`:34-43`); matched per field
  (`stores/cache/event-cache.ts:16-24, 276-342`). There is no weekday or "every Nth day" recurrence.
- **Eras** are events with a format string and optional per-era calendar overrides (`timespans.ts:96-117`).
- **Seasons** are dated (fixed start dates) or periodic (`duration`, `peak?`) (`seasonal.ts:105-116`).
- **Advance.** `incrementDay` rolls day → month → year using the cached month lengths
  (`stores/calendar.store.ts:672-690`, `decrementDay` `:691-710`); wired to commands "advance/previous current date"
  (`main.ts:226-243`, `changeDay` `:289-305`, CHANGELOG `:27`). The `incrementDay` boolean on the static data
  (`calendar.ts:37`) is only copied around (`calendar.store.ts:606`); no automatic real-time advance found.
- **Inline events.** Note frontmatter `fc-date`/`fc-start`, `fc-end`, `fc-category` become events
  (`events/event.helper.ts:88-102, 284-295`); `fc-ignore` opts a note out (`watcher/watcher.worker.ts:294`).
- **Visibility.** Single user; no notion of hidden events. Everything is the owner's view.

## Overlap with Story Orchestrator

- **We do better:** our state rolls back. Their `current` is one mutable settings value with no history; a swipe
  that rewound a day could not be expressed. Our chance seam is keyed per chat/story/boundary; theirs is one
  install seed.
- **They do, we don't:** an authored time model at all. We have `location` (`PARTY_LOCATION_KEY`,
  `engine/schema.ts:89`) and scene detection, but no story clock; plan 37 L4's `when: <gate on time/location>`
  assumes a time quality that does not exist yet. Also: derived-from-one-integer views (weekday, moon, season,
  weather) are exactly our "every derived view recomputable from rolled-back stores" rule.
- **Philosophically opposite:** time moves only when the user clicks. We need time to move at boundaries, from
  authored effects or accepted extractor deltas, never by a reply-path write.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| absolute day count as the one stored time value, date derived | data model | quality, schedule | state-only | derivable (one int quality) | player-safe | OK | declarative | 5 | S | v2.7 37 L4; v2.8 22 |
| authored calendar (weekdays, months, intercalary, leap rules) | authoring format | quality (derived keys) | state-only | derivable | player-safe | OK | declarative | 4 | M | new plan seed (story clock) |
| moon phase = f(day, cycle, offset) | mechanic | gate, widget | state-only | derivable | player-safe | OK | declarative | 3 | S | new plan seed; v2.7 36 W |
| recurring event = per-field number or [lo,hi] range | data model | schedule, gate | state-only | derivable | author-only or public per event | OK | declarative | 4 | S | v2.7 37 L4 |
| per-day seeded weather (seed × epoch) | mechanic | roll | seeded draw | derivable if seed = hash(chat, story, day) | player-safe | OK | declarative | 3 | M | v2.7 35 (ambient pressure) |
| eras / dated vs periodic seasons | data model | quality (derived) | state-only | derivable | player-safe | OK | declarative | 2 | S | new plan seed |
| frontmatter events (dates declared where content lives) | authoring format | journal, quest deadline | state-only | derivable | spoiler risk if future events listed | OK | declarative | 2 | S | v2.7 36 (quest `due`) |
| manual advance only, single mutable `current` | anti-pattern | quality | — | unrollbackable as built | — | — | — | — | — | no |
| install seed from `Date.now()^Math.random()` | anti-pattern | roll | Math.random | — | — | — | — | — | — | no |

## Notes per pattern

**Story time as one int quality.** Their whole engine reduces to `daysBefore(date)`. Our shape: a reserved code
quality `story_day` (int, `source: code`, min 0, monotonic-allowed but not latched so rollback can rewind it) plus
an optional `time_of_day` enum (`day_parts` authored, e.g. 4-6 parts). Advancing is an effect, applied at a
boundary: `effects.time: {advance?: {days?, parts?}, set_part?: "<part>"}` on checkpoints/transitions, and an
extractor delta on `time_of_day`/`story_day` accepted at the next boundary like any other quality. Rollback ≡ replay
holds for free because both are blackboard values. Refuse wall-clock advance.

**Authored calendar → derived read-only keys.** `story.calendar?: {weekdays: string[], months: [{name, days,
intercalary?: bool, every?: n, offset?: n}], leap?: [{month, every: [{n, except?: bool}], offset?}], moons?: [{name,
cycle, offset}], start: {year, month, day}, era?: {name, format}}`. The engine derives (pure, from `story_day`)
`cal.year`, `cal.month` (index + `cal.month_name`), `cal.day`, `cal.weekday`, `cal.moon.<name>` (phase enum, keep
8 phases not 24) and exposes them to gates and macros only, never as writable qualities. A story without `calendar`
still gets `story_day` and `time_of_day`. Validator: month day counts ≥ 1, leap month index in range, `start` valid.

**Recurring dates for L4 schedules.** Their `[lo|null, hi|null]` per-field match is the right size for
`roster[].schedule[].when`. Rather than a second matcher, let `when` stay a gate and give gates the derived keys:
`{when: "cal.weekday in ['Market','Rest'] && time_of_day == 'evening'", at: "tavern"}`. Add one helper predicate
`cal_in({month?: [lo,hi], day?: [lo,hi], weekday?: [...]})` only if authors find the expression form painful. Also
add what they lack: weekday recurrence and "every N days" (`story_day % n == k`), which the expression form gives.

**Seeded ambient draws per day.** Their weather is correct in shape (seed × day) and wrong in seed source. Ours:
`unitDraw([chatId, storyId, "day", story_day, key])` in the runtime chance seam, so a swipe that does not change the
day re-reads the same weather, and a rewound day re-draws identically. Only worth it if a story authors ambient
tables (plan 35 pool flavour); not a v2.7 item.

## Copy / Avoid

- Copy: one stored integer, everything else derived; closed-form leap-day counting with ordered include/exclude
  rules; recurring-by-field ranges with open ends; per-day seed.
- Avoid: a single mutable "current" outside the rolled-back store; seeds from wall clock; 24 moon phase names
  (too fine for prose, a spoiler-free 8 is plenty); importing their presets (third-party setting IP).

## Licence note

Code MIT, compatible with AGPL-3.0 reuse with notice; we take patterns only, no code. Preset calendars name
published settings' months and holidays; do not ship them.

## Verdict

Relevance **high** for plan 37 L4 and plan 22 (they need a clock that does not exist). Take: **`story_day` as one
rolled-back int quality + an authored `calendar` from which weekday/month/moon are derived read-only gate keys.**
