# OPSE Oracle (Obsidian) — v2.8 27 review
meta: https://github.com/Snifer/opse-oracle-ttrpg · clone path
`C:\dev\st-extensions-research\gamification\opse-oracle-ttrpg\source` @ `bbdfa7b` (2026-05-23) · ★ 2 · downloads 620 ·
licence MIT for the code (`LICENSE`, © 2026 Snifer). Game content: `LICENSE-OPSE.txt` says the tables, prompts and
procedures are derived from One Page Solo Engine v1.6 by Karl Hendricks (Inflatable Studios) and are **CC BY-SA 4.0**.
Mechanics are described below; no tables are copied · tier 2. Files read: `src/types.ts`, `src/core/{random,opse,history,deck,
adventure-state}.ts`, `src/commands/oracle.ts`, `src/ui/control-view.ts` (history card, reroll, scene helpers),
`src/ui/modals/{oracle,scene}-modal.ts`.

## What it is
An Obsidian sidebar that runs the One Page Solo Engine. It answers yes/no questions at three likelihoods, rates "how
much", gives focus prompts (action, detail, theme, from dice or a card deck), rolls GM moves and scene complications,
and generates NPCs and plot hooks. Every result goes into a capped history and is inserted into the open note.

## How it works
- **Yes/no oracle.** It rolls two d6 (`random.ts:13`). The first die answers yes when it meets a threshold set by
  likelihood (3+/4+/5+). The second die adds a "but…" twist on a 1 and an "and…" on a 6 (`opse.ts:13-25`).
  `Likelihood` is `probable|even|improbable` (`types.ts:49`).
- **Randomness** is `Math.random` throughout (`random.ts:9-10`, `:41-42`), so nothing is seeded.
- **Deck.** The persistent deck draws without replacement into a discard pile, refills from the discard when empty,
  and reshuffles at once on a Joker (`deck.ts:44-59`). Its state is saved through `getState/setState` (`:74-83`).
- **Scene.** The player types the location and objective, and the plugin rolls one d6 complication
  (`scene-modal.ts:42-55`). A separate "altered scene" check is a d6 ≥ 5 (`control-view.ts:408-412`).
- **History** (`types.ts:51-62`): `{id, question?, answer, modifier?, raw, timestamp, type, domain?, interpretation?,
  pinned?}`. The player can edit `interpretation`. Cleanup keeps every pinned entry and trims the unpinned ones to the
  cap (`history.ts:153-164`).
- **Reroll** just runs the command again: a new random roll, logged as a new entry (`control-view.ts:389-403`).
- **Adventure state** holds `threads[]` and a `sceneRank` clamped to 1–6 (`adventure-state.ts:126`, `:142`).
  Nothing else reads `sceneRank`; only the UI and the exporter use it (grep).

## Overlap with Story Orchestrator
- **We do better:** our chance is seeded. A swipe re-reads the same draw, while their reroll invites fishing for a
  better answer.
- **They do, we don't:** an outcome with two axes (yes/no × but/and), a GM-move pool on failure, and a deck that draws
  without replacement.
- **Opposite:** the player is the oracle's user here. For us the player is never the GM, so any oracle belongs to the
  author or the director.

## Patterns (rubric table)
| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| two-die outcome: answer die + twist die (and/but) | mechanic | roll, quality | seeded draw | derivable | hidden or public per `narrate` | OK | declarative | 4 | S | v2.7 36 Q3 |
| likelihood → threshold | mechanic | roll | seeded draw | derivable | author-only | OK | declarative | 3 | S | v2.7 36 Q3 |
| failure → draw from authored "move" pool | mechanic | transition, director signal | seeded draw | derivable | author-only | OK | declarative | 4 | M | v2.7 35 Ph3 |
| deck without replacement (spent until reshuffle) | data model | clock, schedule | seeded draw | derivable from path | author-only | OK | declarative | 3 | M | v2.7 35 Ph3 |
| reroll on demand | anti-pattern | roll | Math.random | needs own ring | — | — | — | 1 | — | no |

## Notes per pattern
- **Twist die → plan 36 check shape.** A bool `quality` loses the "yes, but" texture. Proposal: add optional
  `twist: {sides: 6, but: 1, and: 6}` on a check, drawn from a second seeded key (`<check id>:twist`). It writes an
  `outcome` enum quality with the values `yes_and|yes|yes_but|no_but|no|no_and`, which gates can test. `narrate: hidden`
  then steers with the outcome word only. If no twist is declared, the check keeps today's bool.
- **Likelihood.** Do not add a likelihood enum. It is `roll.target` plus `modifiers[]`, which plan 36 already has.
- **Failure pool.** Map a "GM move" to plan 35's complication pool: a failed check releases one authored complication,
  drawn with a seeded key. The pool's release read model already tracks what is spent, which is the "deck" for us.
  Spent-ness is derived from the path, so rollback ≡ replay holds.

## Copy / Avoid
- Copy: the answer × twist matrix, a move drawn on failure, draws without replacement derived from history.
- Avoid: rerolls, `Math.random`, an oracle the player drives (it breaks agency and spoils hidden state).

## Licence note
Code is MIT, compatible with AGPL-3.0, but we take patterns only. OPSE content is CC BY-SA 4.0 (ShareAlike): copy no
tables, prompts or move lists. Mechanics such as "2d6 with thresholds" are not copyrightable, but the wording is.

## Verdict
Relevance **medium**. Take: **a check outcome with two axes (answer + twist) as a seeded enum quality**. It is a small
addition to plan 36's `check`.
