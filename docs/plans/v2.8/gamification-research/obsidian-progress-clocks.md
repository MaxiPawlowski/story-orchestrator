# Obsidian Progress Clocks — v2.8 27 review

meta: https://github.com/tokenshift/obsidian-progress-clocks · clone path
`C:\dev\st-extensions-research\gamification\obsidian-progress-clocks\source` @ `43752cf` (2025-01-19) · ★ 10 ·
downloads n/a (not in the Obsidian community list; BRAT/manual install) · licence MIT (`LICENSE.txt`,
"Copyright (c) 2024 Nathan Clark") · files read: `src/State.ts`, `src/ProgressClocksPlugin.ts`,
`src/ProgressClocksRenderChild.ts`, `src/inline/{InlinePlugin,ClockWidget}.ts`, `src/ui/{Clock,Section,StopWatch}.svelte`
(the rest is UI chrome: counters, editable fields, settings tab).

## What it is

Blades in the Dark-style segmented progress clocks, plus counters and stopwatches, for Obsidian. Two surfaces:
inline code spans (`` `clock 2 / 6` ``, `` `counter 3` ``) rendered as clickable widgets in a note, and a sidebar
panel of named sections holding clocks, counters and stopwatches. No rules engine: a clock is a picture of two
numbers that a human clicks.

## How it works

- **State model.** `ClockState {type:'clock', name, segments, filled}`, `CounterState {name, value}`,
  `StopwatchState {name, startMillis, offsetMillis, showMillis, isRunning, lapTimes[]}`, grouped as
  `SectionState {name, children[]}` (`src/State.ts:6-34`).
- **Inline state lives in the note text.** The span is parsed by regex: `clock [filled [/ segments]]`, default 4
  segments (`src/inline/InlinePlugin.ts:28-31, 52-65`); clicking rewrites the span as `clock <filled> / <segments>`
  (`src/inline/ClockWidget.ts:48-54`). So the document *is* the store, and editor undo is the only history.
- **Panel state** is the plugin's `data.json`, saved on a 1 s debounce (`src/ProgressClocksRenderChild.ts:6, 22-24`);
  new clocks start at `filled: 0` with a chosen segment count (`src/ui/Section.svelte:42-47`).
- **Clock arithmetic.** Click fills one, right-click empties one (`src/ui/Clock.svelte:95-96`); separate buttons add
  or remove segments (`:129-139`). Segments floor at 1 (`:16`). **Overflow wraps**: filling past full resets to 0,
  emptying below 0 jumps to full (`:17-18`). A 1-segment clock renders as a filled circle (`:15`).
- **Rendering** is SVG pie slices computed from `segments` and `filled` (`src/ui/Clock.svelte:23-38`).
- **Stopwatch** reads the wall clock (`src/ui/StopWatch.svelte:21`) and records laps (`:73-76`).
- **Visibility.** None; single user, everything shown.

## Overlap with Story Orchestrator

- **We do better:** a clock bound to a rolled-back quality, filled by authored effects or plan 35's release model,
  with "full" as a gate that does something. Theirs fills only by hand and means nothing to the rest of the vault.
- **They do, we don't:** the visual vocabulary itself (segmented pie, 4/6/8 segments) that Blades players read at a
  glance; plan 36 W lists `clock` but has no widget yet.
- **Philosophically opposite:** wrap-around (a full clock silently becomes empty) and wall-clock stopwatches; both
  break rollback ≡ replay or erase the "it filled" moment.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| segmented clock = (filled, segments) pie | UI | widget, clock | state-only | derivable (bound int quality) | player-safe if bound quality public | OK | declarative | 4 | S | v2.7 36 W (`clock` kind) |
| clock as pressure readout (released / pool size) | UI | clock, widget | state-only | derivable from plan 35 release model | spoiler risk (pool size reveals remaining pressure) | OK | declarative | 3 | S | v2.7 36 W + v2.7 35 Ph3 |
| plain counter widget | UI | widget | state-only | derivable | player-safe | OK | declarative | 2 | S | v2.7 36 W (`meters` count) |
| state stored in the document text | data model | — | — | own store outside rollback | — | — | — | — | — | no (our stores are the blackboard) |
| click-to-fill by the reader | mechanic | — | user write off boundary | unrollbackable as a player write | — | solo assumption | — | 1 | — | no (author driver only) |
| wrap-around on overflow | anti-pattern | clock | — | — | — | — | — | — | — | no |
| wall-clock stopwatch | anti-pattern | — | — | unrollbackable | — | — | — | — | — | no |

## Notes per pattern

**Clock widget shape for plan 36.** Their state is two ints; ours should own neither. Proposed
`widgets[]` entry: `{id, kind: "clock", title, bind: {quality: "<int key>"} | {pressure: "<checkpointId>"},
segments?: n, direction?: "fill" | "drain", visible_when?, audience}`. With `bind.quality`, `segments` defaults to
the quality's `max - min` and the validator refuses a quality without both bounds, `segments` outside 2–12, or a
`segments` that does not divide the range (keep one segment = one step). With `bind.pressure`, filled = released
count and segments = pool size, read from plan 35's release read model only (plan 36 `:122`; no second pool,
trigger or spent-ness). Clamp, never wrap: a full clock stays full, and the consequence is an ordinary gate
(`q >= max`) on a transition, so the widget stays read-only (plan 36's "no prompt seam" guard holds).

**Who fills it.** Authored effects at boundaries (`set`/increment on transitions or checkpoint entry), extractor
deltas on a `source: extractor` int quality, or the pressure release. No player click: a reader write outside a
boundary would be a store that cannot roll back. An author may nudge it through the existing driver panel.

**Pressure clocks leak.** A `pressure` clock shows how much pressure is left in a checkpoint's pool, which is a
spoiler in player view. Default `audience: "author"` for `bind.pressure`; allow `player` only with an explicit
`reveal_size: true`.

## Copy / Avoid

- Copy: the two-number model and pie rendering; 4/6/8 as the common segment counts; one-segment = filled circle.
- Avoid: state in free text, reader clicks as writes, wrap-around, wall-clock timers.

## Licence note

MIT code; patterns only, nothing copied. Blades-style clocks are a game mechanic idea, not text.

## Verdict

Relevance **medium** (small repo, confirms the shape). Take: **`kind: "clock"` binds one bounded int quality (or
plan 35's release count), segments = range, clamps instead of wrapping, and "full" is a gate, not a widget event.**
