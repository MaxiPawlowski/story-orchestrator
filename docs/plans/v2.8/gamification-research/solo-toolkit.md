# Solo RPG Toolkit (Obsidian) — v2.8 27 review
meta: https://github.com/alexkurowski/solo-toolkit · clone path
`C:\dev\st-extensions-research\gamification\solo-toolkit\source` @ `8eec1fd` (2026-09-02) · downloads 37,828 · licence
MIT (`LICENSE`, © 2024 Alex Kurowski). Game content: it ships word dictionaries and oracle charts. The Mythic oracle's
odds chart (`src/utils/oracles/mythic.ts:4-104`) looks like the Mythic GME fate chart, a commercial product. This was
not verified, so treat it as third-party content · tier 2. Found in step 1 of plan 27, not in the seed list. Files
read: `README.md`, `src/utils/dice.ts`, `src/utils/oracles/{mythic,shared}.ts`, `src/inline/base/{clock,dice}.ts`,
`src/inline/live/{index,clock}.ts`, `src/view/word/parser.ts`, `src/utils/helpers/math.ts`.

## What it is
A sidebar and inline toolkit for solo play in Obsidian: dice, card and image decks, several yes/no oracles, word
generators, and user tables written as notes (with templates, weights and bell curves). It also offers inline
counters, box tracks and PbtA-style clocks that live in the note text.

## How it works
- **Randomness** is `Math.random` (`utils/dice.ts:6`, `:23`, `:45`).
- **Advantage/disadvantage.** `2d6/a` keeps the highest roll and `/d` the lowest (`inline/base/dice.ts:76-77`,
  `:133-135`).
- **Mythic-style oracle.** A d100 is compared with a chart row picked by odds label and a chaos factor (1–9). It can
  return an extreme answer, and a random event fires on doubles at or below the factor (`mythic.ts:116-130`).
  `changeFactor` clamps the factor to 1..9 (`:132-134`).
- **Tables as notes.** Section headings are keys. ` ^N` weights a line by duplicating it (`view/word/parser.ts:205-224`),
  and an ` Nd` suffix on a section gives a bell curve (`:235-245`, capped at 6d in `helpers/math.ts:14-27`). Templates
  fill `{keyword}` slots from sections (README).
- **Clocks and tracks keep their state in the document.** `` `clock: 2/6` `` is parsed (`inline/base/clock.ts:41-75`),
  clamped (`:95-107`), and written back as text (`getText`, `:79-91`) through an editor transaction
  (`inline/live/clock.ts:20`). The note is the only store, so undoing the edit undoes the clock.

## Overlap with Story Orchestrator
- **We do better:** seeded draws, and rules declared once in the story instead of scattered through prose.
- **They do, we don't:** odds that pressure shifts (chaos factor), weighted or bell-curve pools, advantage as a
  modifier, and a clock/track shown as boxes or a pie.
- **Same idea:** state that is the text plus a derivation, which is our "derived view over rolled-back stores".

## Patterns (rubric table)
| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| clock/track `{value, max}` rendered as pie or boxes | UI | widget, clock | state-only | derivable | player-safe if public | OK | declarative | 4 | S | v2.7 36 W |
| pressure factor shifts odds and event chance | mechanic | roll, director signal | seeded draw | derivable | author-only | OK | declarative | 3 | M | v2.7 35, v2.8 22 |
| advantage/disadvantage as a check mode | mechanic | roll | seeded draw | derivable | public/hidden per check | OK | declarative | 3 | S | v2.7 36 Q3 |
| weighted / bell-curve pool entries | authoring format | director signal | seeded draw | derivable | author-only | OK | declarative | 3 | S | v2.7 35 Ph3 |
| state written into the shared text | anti-pattern (for us) | widget | — | chat text is the player's | spoiler risk | — | — | 1 | — | no |

## Notes per pattern
- **Clock widget shape (plan 36 W).** `{id, kind: "clock", bind: "<int quality>", options: {max, style: "pie" |
  "boxes"}, visible_when?, audience}`. `max` should come from the quality's own `max` rather than being repeated in the
  widget. The validator should refuse a clock bound to a quality without `min`/`max`.
- **Pressure factor.** Their chaos factor plays the role of our pacing tension. If we want it, add a check modifier that reads a
  quality (`modifiers[{q: "tension", add_per: 1}]`) rather than a global factor. It stays seeded and author-visible.
- **Advantage.** Add `roll.mode: "normal" | "adv" | "dis"` (draw two seeded values from `<id>:a` and `<id>:b`, keep the
  max or min). This is cheaper and easier to read than stacking modifiers.
- **Weights.** Plan 35's pool items take `weight?: int` (default 1). Bell curves are not worth adding.

## Copy / Avoid
- Copy: pie/box clock rendering, `roll.mode` adv/dis, item weights.
- Avoid: writing mechanic state into the chat (the chat text belongs to the player and the model), `Math.random`,
  shipping third-party oracle charts.

## Licence note
Code is MIT, compatible with AGPL-3.0, but we take patterns only. Do not copy the Mythic-style chart values or the
word dictionaries.

## Verdict
Relevance **medium**. Take: **a `clock` widget bound to a bounded int quality, plus `roll.mode` adv/dis on checks**.
