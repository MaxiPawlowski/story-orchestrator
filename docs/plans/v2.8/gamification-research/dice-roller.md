# Dice Roller — v2.8 27 review

meta: https://github.com/javalent/dice-roller · clone path
`C:\dev\st-extensions-research\gamification\dice-roller\source` @ `58b3857` (2025-03-24) · ★ 343 · downloads 284,748 ·
licence: **no LICENSE file in the repo**; `package.json:15` declares `"license": "MIT"` (both facts recorded; treat
as unconfirmed for code reuse) · no game content shipped beyond a Genesys glyph font (`src/assets/`) · files read:
`src/lexer/lexer.ts`, `src/api/api.ts` (flag parsing, roller dispatch), `src/processor/processor.ts`,
`src/rollers/roller.ts`, `src/rollers/dice/stack.ts` (modifiers, tooltip, build), `src/rollers/dice/dice.ts`
(conditions, random), `src/rollers/table/table.ts` (lookup), `src/rollers/dice/narrative.ts`, `stunt.ts` (heads),
`src/types/api.ts`, `src/main.ts` (migration), `README.md` (modifier/condition sections), `CHANGELOG.md` 11.0.0.

## What it is

An Obsidian plugin that turns inline code like `dice: 2d20kh+5` into a clickable result. Beyond plain dice it rolls
on markdown tables (random row or range lookup), random note sections/lines/tags, and system dice (Fudge, Genesys
narrative, Fantasy AGE stunt). A 3D renderer animates physical dice. Results are fresh `Math.random` draws on every
render; the only persistence is `dice-mod`, which rewrites the note text with the result.

## How it works

- **Grammar**: `moo` lexer plus a shunting-yard parser over `+ - * / ^` with precedence/associativity
  (`lexer.ts:30-104`, table `:114-135`). Token regexes for tables, sections, lines, tags, dataview fields and
  conditions sit at `lexer.ts:8-23`; unresolved identifiers are looked up as fields of the active note
  (`lexer.ts` ~`:214-220`, the `\b[A-Za-z]…` rule).
- **Modifiers** (per die group): keep highest/lowest `kh`/`kl`, drop `dh`/`dl`, explode `!`, explode-combine `!!`,
  re-roll `r` (each with optional count or `i` = until), unique `u`, `sort` (`stack.ts:94-188`; lexer `:147-163`).
  Min/max faces `Xd[Y,Z]` (README:103).
- **Conditions turn a pool into a success count**: `>=n`, `<n`, `=n`, `=!n` make each die 1 (pass) or 0, and
  `-=n` makes a matching die count -1 (`dice.ts:510-531`, README:240-260). This is a dice-pool degree model, unlike
  a single total-vs-target.
- **Display flags are a closed suffix list**: `|nodice |render |norender |form |noform |avg |none |text(...) |paren
  |round |ceil |floor |signed |lookup=` (`api.ts:129-184`); the API rebuilds the same string from options
  (`api.ts:342-384`). `ExpectedValue` = None / Average / Roll (`types/api.ts:8-12`): a roll can show its *average*
  until clicked.
- **Shown format**: the chip shows the total; the tooltip shows the original formula, then each die's values
  (`stack.ts:288-308`), or "average: …". `|form` prefixes the formula inline. Lookup rolls show the number
  rolled plus the row picked (README:714-716, `table.ts:232-243`).
- **Table roll**: a referenced markdown table either yields a uniformly random row or, when its first column holds
  ranges, a lookup: a dice formula is rolled and matched against `[min,max]` ranges parsed from each row
  (`table.ts:28-30`, `:361-379`).
- **Randomness**: `Math.random` per die (`dice.ts:673-674`); `crypto.getRandomValues` for table/line picks
  (`roller.ts:68-71`). No seed anywhere.
- **Re-render re-rolls**: a normal roller rolls on load and replaces the code node (`processor.ts:150-153`), so every
  re-open of the note shows a new number; clicking re-rolls (`roller.ts:211-221`, shift-click animates).
- **Persistence was tried and removed**: 11.0.0 dropped saving results as a breaking change (CHANGELOG:149-156),
  and the migration deletes `persistResults` and `results` (`main.ts:152-154`). The surviving "persist" is
  `dice-mod`, which rolls once and splices the result text into the file (`processor.ts:79-139`), i.e. it destroys
  the formula.
- **System dice**: Genesys results are success/advantage/triumph counters with cancellation (`narrative.ts:9-11`);
  AGE stunt dice flag doubles (`stunt.ts:41-42`).
- **Visibility**: none; everything shown to whoever reads the note.

## Overlap with Story Orchestrator

- **We do better**: seeded draws keyed by (chat, story, boundary, key), so a swipe or reopen shows the same roll —
  exactly what this repo could not offer (it gave up on saved results and settled for re-roll or overwrite). We have
  a hidden/public split for checks.
- **They do, we don't**: a real modifier vocabulary (advantage as keep-highest, explode), success-count pools, a
  closed display-flag set, average-before-roll, lookup tables keyed by ranges, a tooltip that shows the arithmetic.
- **Philosophically opposite**: rolls are user-initiated, re-rollable on click, unbounded random. In our product a
  player-clickable re-roll would be a fishing loop and an unrollbackable draw; checks are authored and boundary-drawn.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| chip = total, detail = formula + each die | UI | roll chip, journal | seeded draw | derivable (`extras.checks`) | public only when `narrate: public` | OK | declarative | 5 | S | v2.7 36 Q3 / C9 (a) |
| keep-highest/lowest (advantage) as roll field | mechanic | roll, check modifiers | seeded draw | derivable | author decides | OK | declarative | 4 | S | v2.7 36 Q3 |
| success-count pool (`Nd6>=5` → hits) with degrees | mechanic | roll, check outcome | seeded draw | derivable | author decides | OK | declarative | 3 | M | v2.7 36 Q3 (later) |
| range lookup table (roll → row) | mechanic | complication pool, director signal | seeded draw | derivable | author-only rows; outcome player-safe | OK | declarative | 4 | M | v2.7 35 pool |
| average shown before roll (`ExpectedValue`) | UI | check preview | state-only | derivable | author-only (odds are a spoiler) | OK | declarative | 2 | S | v2.7 36 author view |
| closed display-flag list (`signed`, `paren`, `form`) | authoring format | roll chip | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q3 `chip` |
| explode / re-roll-until | mechanic | roll | seeded draw (bounded) | derivable | — | OK | declarative | 2 | M | no (cap needed; later) |
| click to re-roll | anti-pattern | — | random | unrollbackable | — | — | — | 1 | — | no (refuse) |
| `dice-mod` overwrite result into source | anti-pattern | — | random | unrollbackable | — | — | — | 1 | — | no (refuse) |
| identifiers resolved from note fields | data model | modifiers from qualities | state-only | derivable | — | OK | declarative | 3 | S | v2.7 36 Q3 `modifiers[].q` (already) |

## Notes per pattern

**Chip format → `snapshot.rolls` record + `RollChips`.** Their chip/tooltip split is the right two layers. Store, per
check, `{id, sides, count, keep?, dice[], modifiers[{label, add}], total, target, outcome}` in `extras.checks`
(no text). Player chip (public check): `label: total vs target, outcome` (plan 36's "Climb: 15 + 4 vs 12, success").
Detail row (author, or public when `narrate: public`): each die, each modifier with its *public label* (never the
quality key, which can be a spoiler), the arithmetic. Hidden check in player mode: no chip at all, only the narrated
outcome (plan 36 Q3). Add a closed `signed` style for modifiers (`+4`, `-1`), nothing else.

**Advantage → extend `roll`.** Today `roll: {sides, target}`. Proposed: `roll: {sides, target, count?: 1, keep?:
"high" | "low"}` (count ≤ 4) — that is advantage/disadvantage without a grammar. Modifier entries can switch it:
`modifiers[{q, v, add?, keep?}]` (a `keep` modifier flips to advantage when `q == v`). Draw each die from the seed as
`hash(..., key, i)` so the extra die never shifts the first die's value (a swipe after adding a modifier still
reads the same first die). Do **not** ship a dice-notation string parser: one typed object is validatable and
needs no lexer.

**Degrees (later).** Their pool conditions show a cheap degree model: outcome = `success` | `failure`, plus optional
`margin = total - target`; an authored `degrees: [{at_least: 5, outcome: "strong"}]` beats a pool. Keep Q3's first cut
to success/failure; reserve `outcome` as an enum so degrees can land without a schema break.

**Range lookup table → v2.7 35 complication pool.** `{roll: {sides: 20}, rows: [{range: [1, 8], id}, ...]}` with
ranges required to cover 1..sides without overlap (validator), seeded at the boundary, row ids author-only. Their
silent "no row matched" fallback is the trap to refuse at load.

## Copy / Avoid

- Copy: total-on-chip, formula-in-detail; keep-high/low as a typed field; ranges validated to cover the die; a closed
  list of display options.
- Avoid: re-roll on click or on re-render; overwriting the source with a result; unseeded randomness; a free-form
  notation grammar authors can typo; showing odds/averages to players.

## Licence note

Patterns only. No LICENSE file exists, so despite `package.json` MIT the code is not safely reusable; nothing here
needs copying anyway. No game content of concern (Genesys glyph font not to be reused).

## Verdict

Relevance **high** for plan 36 Q3 and chips. The one thing to take: the chip shows the total and outcome while the
detail shows formula + each die + labelled modifiers — and their own history (saved results removed in 11.0.0) is the
argument for our seeded, boundary-drawn rolls over re-rollable ones.
