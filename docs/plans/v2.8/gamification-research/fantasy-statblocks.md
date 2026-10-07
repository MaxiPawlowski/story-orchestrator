# Fantasy Statblocks — v2.8 27 review

meta: https://github.com/javalent/fantasy-statblocks · clone path
`C:\dev\st-extensions-research\gamification\fantasy-statblocks\source` @ `f248f4a` (2026-01-21) · ★ 494 ·
downloads 343,166 · licence MIT (`LICENSE`, "Copyright (c) 2023 Jeremy Valentine"); game content separately under
`licenses/` (D&D 5e OGL, Paizo Community Use, 13th Age Community Use) · files read: `src/layouts/layout.types.ts`,
`src/layouts/manager.ts` (head), `src/layouts/layout.css.ts` (head), `src/layouts/basic 5e/basic5e.ts` (head),
`src/layouts/daggerheart/callbacks/create-healthStress-block.js`, `src/view/statblock.ts` (build/merge),
`src/view/ui/ColumnContainer.svelte` (conditioned + ifelse), `PropertyLine.svelte`, `Text.svelte`, `JavaScript.svelte`,
`src/parser/dice-parsing.ts`; a callback count over every shipped layout file.

## What it is

An Obsidian plugin that renders a creature's YAML (inline code block or note frontmatter) through a **layout**: an
ordered tree of typed blocks that each name the creature properties they show. Layouts ship per game system (5e,
PF2e, Fate, Daggerheart, 13th Age, Bunkers & Badasses) and authors build their own in a settings editor or as JSON.
Creatures can inherit from bestiary entries (`extends`) with add/remove/modify trait operators. Rendering only; no
state changes after render (HP checkboxes in Daggerheart are DOM-only).

## How it works

- **Layout = `{name, id, blocks[], diceParsing?, cssProperties?, columns?}`** (`src/layouts/layout.types.ts:237-246`).
  Shipped layouts carry `version`/`updatable`/`edited` so a user-edited copy is not overwritten on update (`:248-253`).
- **Closed block kinds**: 16 types — heading, subheading, property, table, saves, spells, traits, inline, group,
  image, text, ifelse, collapse, javascript, layout, action (`layout.types.ts:4-21`). Containers (`group`, `inline`,
  `collapse`) nest; `layout` embeds another layout by name (`:154-157`).
- **Binding by property name**: every non-structural block has `properties: string[]` (`:51-60`), resolved against
  the merged creature object. A block with `conditioned: true` hides when all its properties are empty/absent
  (`ColumnContainer.svelte:48-80`); otherwise a missing value renders `fallback ?? "-"` (`PropertyLine.svelte:31`).
- **Per-block formatting is a JS string**: `callback` on property/saves/traits/spells (`layout.types.ts:93-107`),
  executed with `new Function` (`PropertyLine.svelte:18`, `JavaScript.svelte:20`). `ifelse` branches are JS
  conditions run in a throwaway iframe (`ColumnContainer.svelte:187-208`). `diceParsing` entries are regex + JS
  parser strings compiled at render (`dice-parsing.ts:12-31`).
- **The escape hatch ate the format.** Counting `callback` occurrences in shipped layouts: PF2e `pf2e.ts` 65 of 78
  blocks, `Basic Pathfinder 2e Layout.json` 30/36, `daggerheart.ts` 26/41 plus 3 `javascript` blocks, BnB bestiary
  19/27; only Fate Core is callback-free (0/13). "Declarative" layouts are mostly code in strings.
- **Merge order**: extensions (bestiary `extends` chain) → in-memory creature → note frontmatter → block params
  (`statblock.ts:100-145`). Traits support `name+` (always add), `name-` (always remove), `name~` (replace if present)
  (`statblock.ts:156-234`).
- **Theming via a closed token list**: `cssProperties` keys are a fixed array (primary/rule/bar/font colours, sizes)
  (`layout.css.ts:1-40`), with light/dark variants (`manager.ts:46-60`). Authors cannot inject arbitrary CSS through
  the layout itself.
- **Track of boxes**: Daggerheart HP/stress render N checkboxes from a number (`create-healthStress-block.js:22-34`),
  via a JS callback; the checkbox state is not written back anywhere.
- **Visibility**: none. One audience; every bound property shows.

## Overlap with Story Orchestrator

- **We do better**: our values are typed with min/max/enum on the quality, so a widget can be validated at load
  (bad bind = validator error); theirs fail at render with a console error and an empty block. We have two audiences.
- **They do, we don't**: an ordered, nestable layout tree with groups, inline rows and `conditioned` auto-hide; a
  fixed theme token set with light/dark; versioned shipped defaults that survive user edits; an `extends` chain.
- **Philosophically opposite**: code-in-strings formatting (`callback`, `ifelse`, `javascript`). Plan 36 already says
  "no markup, no CSS"; this repo is the measured reason: once a callback exists, authors use it for most blocks.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| closed block-kind list bound by key | authoring format | widget, quality | state-only | derivable | player-safe if bind public | OK | declarative | 5 | M | v2.7 36 W |
| `conditioned` auto-hide when value empty | UI | widget, quality display | state-only | derivable | player-safe (reduces spoiler surface) | OK | declarative | 4 | S | v2.7 36 Q2/W |
| `fallback` text for absent value | UI | quality display | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q2 |
| group / inline nesting with heading | authoring format | widget (`meters` groups) | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 Q2 `group` |
| N-boxes track from an int | UI | quality display, clock | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 Q2 `as` |
| closed theme tokens + light/dark | UI | widget | state-only | n/a | player-safe | OK | declarative | 3 | S | v2.7 36 W (accent list) |
| shipped default vs edited copy (`version`, `edited`) | data model | widget presets | state-only | n/a | n/a | OK | declarative | 2 | M | new plan seed |
| `extends` + `+`/`-`/`~` merge | authoring format | roster, quality defaults | state-only | derivable | author-only | OK | declarative | 2 | M | no (story JSON has no inheritance need yet) |
| JS `callback` / `ifelse` / `javascript` / regex dice parser | anti-pattern | — | arbitrary code | n/a | leak risk | — | needs code | 1 | — | no (refuse) |

## Notes per pattern

**Closed block kinds bound by key → `widgets[]`.** Their `{type, properties[], conditioned, fallback}` maps onto
plan 36's `{id, kind, title, bind, options?, visible_when?, audience}`. Advice: make `bind` an array of quality keys
(like `properties`), not a single key, so a `meters` widget lists its rows in order; keep `kind` closed and add new
kinds by release, never by author code. Replace their `callback` with a closed `format` enum on the quality's
`display` (`"number" | "fraction" | "percent" | "boxes" | "word"`), validated against the quality type.

**`conditioned` → `display.hide_when_empty` (default true for `item`/`count`).** An inventory row for a `false` item
or a count of 0 should not render; this is also spoiler hygiene (an item the player has not found does not appear
as "Sunstone: no"). Pure from the blackboard, so rollback is free.

**Track of boxes → `display.as: "boxes"`.** A bounded int with `max ≤ 12` rendered as filled/empty boxes covers
"stress", "supplies", and the `clock` widget's face. Validator: int, `min` 0, `max` declared and ≤ 12. Do not make
boxes clickable in player mode (their checkboxes write nowhere; ours must not write at all off the boundary path).

**Theme tokens.** Plan 36's "accent + icon from a fixed list" is the right size; their list (`layout.css.ts:1-40`)
shows the useful axes are accent, rule, bar and font colour, all of which we already take from ST theme variables.
Allow only `accent` from a named palette.

## Copy / Avoid

- Copy: closed kinds, ordered `bind[]`, `conditioned`-style hide, fallback text, boxes track, versioned defaults.
- Avoid: any string the renderer executes (callbacks, conditions, regex parsers); render-time failure instead of
  load-time validation; one audience for everything.

## Licence note

Plugin code MIT: patterns and even code would be compatible with AGPL-3.0, but we take patterns only. Game content
(SRD bestiary, layouts' rules text) is under OGL / Paizo CUP / 13th Age CUL (`licenses/`): do not copy any of it.

## Verdict

Relevance **high** for plan 36 W/Q2 shape. The one thing to take: a closed set of block kinds bound to declared keys
by name, with auto-hide when empty, and **no** formatting callback, because this repo shows the callback becomes the
format (65 of 78 PF2e blocks).
