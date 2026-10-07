# Iron Vault — v2.8 27 review

meta: https://github.com/iron-vault-plugin/iron-vault · clone path
`C:\dev\st-extensions-research\gamification\iron-vault\source` @ `27e9c8b` (2026-09-20) · ★ 110 · downloads 19,745
(Obsidian) · licence: MIT for the code (`LICENSE.md:3-25`, "Copyright 2024 Chris Wegrzyn and Kat Marchán"); bundled game
content separately licensed (see Licence note) · files read: `LICENSE.md`, `manifest.json`,
`packages/obsidian/src/tracks/progress.ts`, `clocks/clock.ts`, `clocks/clock-file.ts`, `clocks/commands.ts` (40-180),
`moves/desc.ts`, `moves/wrapper.ts`, `moves/block.ts` (100-105), `moves/action/index.ts` (285-545),
`characters/lens.ts` (55-100, 225-315), `mechanics/editor.ts` (headers), `mechanics/actor.ts`, `model/rolls.ts` (1-200),
`oracles/roller.ts` (30-45), `packages/dice/src/dice.ts`, `dice-roller.ts`, `docs/Blocks/Mechanics Blocks.md`,
`docs/Entities/Progress Tracks.md`, `docs/Other Features/Multiplayer.md`. Not read: datasworn compiler, UI/CSS, truths,
factions, sidebar.

## What it is

An Obsidian plugin that turns a vault into a solo/co-op journal + VTT for the Ironsworn family. The player writes
fiction in notes; commands roll moves and oracles and append a structured "mechanics block" (KDL) into the note as a log.
Persistent game state (character sheet, progress tracks, clocks) lives in YAML frontmatter of dedicated entity notes.
There is no GM model: the human interprets every outcome. All rules data comes from Datasworn JSON.

## How it works

- **Progress track (vow, connection, combat, expedition) = one note with frontmatter** `{name, rank, progress (ticks),
  tags: complete|incomplete, track-type, character?}` (`tracks/progress.ts:45-65`, documented
  `docs/Entities/Progress Tracks.md:23-31`). `track-type` is free text, display only. `character` null = shared track.
- **Rank = ticks per progress step**: troublesome 12, dangerous 8, formidable 4, extreme 2, epic 1
  (`progress.ts:7-30`); 40 ticks max = 10 boxes × 4 (`progress.ts:37`, `:148-154`). Rank only changes how fast the
  track fills; a completed track ignores further ticks (`progress.ts:177`). Unbounded "legacy" tracks convert boxes to
  XP (`progress.ts:224-229`).
- **Progress roll uses no action die**: score = filled boxes (`wrapper.ts:115-118`) against two d10 challenge dice
  (`action/index.ts:292-302`). The roll only rolls; completion is a separate human decision ("TODO: when would we mark
  complete?", `action/index.ts:526`).
- **Action roll**: score = action die + stat + adds, capped at 10 (`wrapper.ts:102-104`); adds are a list of
  `{amount, desc}` with reasons (`desc.ts:23-34`). **Three bands**: beats both challenge dice = strong hit, beats
  neither = miss, else weak hit (`wrapper.ts:74-87`); equal challenge dice = "match", a twist flag on any band
  (`wrapper.ts:65-67`, `block.ts:102-104`).
- **Momentum** is a bounded meter (−10..+10 schema, `lens.ts:71`) whose max drops by one per marked impact and whose
  reset value drops too (`lens.ts:228-250`). Burning replaces the score with momentum after the roll
  (`wrapper.ts:91-93`, `desc.ts:3-6`) and resets the meter (`action/index.ts:708-711`).
- **Clock** = `{name, segments, progress, active}` with progress ≤ segments (`clock.ts:5-21`); ticking an inactive
  clock is a no-op (`clock.ts:53-55`); filled = progress == segments (`clock.ts:81-83`). The file form adds
  `default-odds` from a named list (small chance / unlikely / 50-50 / likely / almost certain / certain / no roll,
  `clock-file.ts:11-32`): advancing asks a d100 yes/no at those odds first, a "No" logs the attempt with no change
  (`clocks/commands.ts:59-115`). Filling asks whether to resolve it (`commands.ts:127-150`); nothing fires on fill.
- **Oracles** are Datasworn tables; a roll records `{kind simple|multi|templated, roll, tableId, subrolls,
  cursedRoll?}` (`model/rolls.ts:7-35`, `:106-150`); templated rows embed sub-rolls; an optional "cursed die" overlays a
  second table (`oracles/roller.ts:34-41`).
- **Journal log = append-only KDL in the note** (`mechanics/editor.ts:33`, `:115-150`). Every node records both
  sides of a change: `meter "health" from=3 to=2`, `clock … from out-of`, `track … status=added|completed|reopened`,
  `roll … action stat adds vs1 vs2`, `reroll`, `outcome "strong-hit" reason=…` override, `oracle name roll result`
  (`docs/Blocks/Mechanics Blocks.md:158-330`, node list `:74-593`). Multiplayer wraps nodes in an `actor` node
  (`mechanics/actor.ts:42-58`).
- **Randomness is unseeded**: `randomInt` per die (`dice/src/dice.ts:52-55`, `PlainDiceRoller` `dice-roller.ts:19-33`);
  the player may also type real dice values (`action/index.ts:505-524`).
- **Visibility**: none. Everything is in the player's own notes; there is no hidden layer or GM view.
- **Group**: several characters per vault, each player picks an "active" one; sync is out of scope
  (`Multiplayer.md:1-5`).

## Overlap with Story Orchestrator

- **We do better**: rollback ≡ replay (their log and their frontmatter are two separate truths: deleting a log line
  does not revert the meter, editing frontmatter does not touch the log); seeded chance (theirs is `Math.random`-style);
  spoiler-safe player view; quest status derived from gates instead of hand-ticked.
- **They do, we don't**: rank-as-pace progress tracks with a final roll against progress; three-band outcomes plus a
  match twist; reasons attached to each modifier; a clock with optional per-tick odds; a log that records from→to on
  every state change, readable as a journal.
- **Philosophically opposite**: Iron Vault never completes anything by itself (the human decides), and outcomes are
  always told to the player. Our quests latch from gates and some checks stay hidden. Momentum burn is a player
  meta-currency used after seeing the dice: a decision taken against a revealed roll, which our hidden checks cannot
  offer.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| from→to delta records in the log | data model | journal, roll | state-only | derivable (ring rolled back by message) | player-safe for public rows | OK | needs code | 5 | S | v2.7 36 Q3 / Q5 |
| three-band outcome (beat both / one / none) + match flag | mechanic | roll, quality (enum) | seeded draw | derivable | player-safe (public) / author-only (hidden) | OK | declarative | 5 | M | v2.7 36 Q3 |
| progress roll: score from track, no action die | mechanic | quest, roll | seeded draw | derivable | player-safe | OK | declarative | 4 | M | v2.7 36 Q1 + Q3 |
| rank = ticks per step (pace, not a gate) | data model | quest, widget `track` | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 W (track) |
| modifier list with reasons | data model | roll | state-only | derivable | player-safe (labels) | OK | declarative | 4 | S | v2.7 36 Q3 |
| clock `{segments, progress, active}`, filled = no-op event | data model | clock, widget | state-only | derivable | player-safe | OK | declarative | 4 | S | v2.7 36 W (clock) |
| clock advance gated by named odds (d100 yes/no) | mechanic | clock, complication trigger | seeded draw | derivable | author-only odds | OK | declarative | 3 | M | v2.7 35 Ph3 (later trigger) |
| outcome override with reason | mechanic | roll | state-only | needs own ring | author-only | OK | needs code | 2 | S | no (author driver only) |
| oracle tables, templated sub-rolls, cursed overlay | mechanic | director signal, complication pick | seeded draw | derivable | author-only | OK | declarative | 2 | M | v2.8 22 / v2.7 35 Ph3 pick order |
| momentum: meter whose max/reset fall per marked impact | data model | quality display | state-only | derivable | player-safe | OK | needs code | 2 | M | no (defer) |
| momentum burn after seeing dice | mechanic | roll | state-only | needs own ring | needs a revealed roll | single decider | needs code | 1 | L | no |
| shared vs owned track (`character` null) | data model | quest | state-only | derivable | player-safe | OK | declarative | 2 | S | v2.7 36 Q1 (optional `giver`) |
| legacy track boxes → XP | mechanic | — | — | — | — | — | — | 1 | — | no (grind / XP trap) |
| log separate from state, unseeded dice | anti-pattern | — | — | unrollbackable | — | — | — | — | — | avoid |

## Notes per pattern

**Delta-record log → `extras.checks` record shape (Q3) and quest events (Q5).** Their log stays readable because every
node carries enough to re-render without reading state: the dice, the stat, each add with its reason, the outcome, and
`from`/`to` for each meter. Our ring record should be closed and textless, as 36 says, but carry the same parts:
`{checkId, boundary, messageId, visit, draws: number[], modifiers: [{q, add}], total, outcome, match?}`. The chip
renders from that record alone, and so does the player Journal `log` widget. Quest events need no stored record: status
is derived, so the log row comes from diffing `questStatus` at consecutive boundary snapshots (`{questId, from, to,
boundary}`). That keeps their readability without their split-truth defect.

**Three bands + match → `checks[]`.** 36's check writes one `source: code` bool. Ironsworn shows that partial success
("weak hit") carries most of the drama, which a bool cannot express. Concrete shape: keep `roll{sides, target}` for the
binary case and add an alternative `roll{sides, vs: {count: 2, sides}}` → outcome `strong | weak | miss`; then
`quality` may be a `source: code` enum declaring exactly those three values (validator: values match, ordered), with
the bool form unchanged. Draws are `unitDraw([chat, story, cpStartBoundary, "check:"+id+":a"|":c1"|":c2"])` so a swipe
re-reads all three. `match` (equal challenge draws) becomes a ring field and an optional `on_match: <pool line id>` that
only **names** a v2.7 35 complication line (35 keeps the one release path and the one spent-ness). Steering line
carries the band word, never numbers. Agency: a miss must lead to an authored transition or nothing; never narrate a
punishment the player did not choose (validator: a `miss` route is allowed to be absent).

**Progress roll → quests with a track.** A vow is "a pace plus a final test". Our quests are pure gate status, so
progress must be derived, not a stored tick counter: progress = sum of `steps[].weight` (default 1) over done steps,
shown as a `track` widget of `boxes` = total weight. The final test is an ordinary check whose score comes from that
derived progress: add a modifier form `{quest: <id>, per_step: n}` next to `{q, v, add}`, and allow `check.when` (or the
transition the check sits on) to require `quest.status == active`. Rank is an authoring shorthand only; do not add a
`rank` enum. If wanted, the Studio can offer "troublesome… epic" as presets for step weights. Do not copy the 12/8/4/2/1
table into the schema; its job is to set length, and authored steps already do that.

**Clock → widget kind `clock` (36 W) and complications (35).** Their clock is tiny and that is right:
`{segments, progress, active}`; filling it does nothing automatically. For 36: `{id, kind: "clock", title, bind:
{releases: <checkpointId>} | {quality: <int key>}, segments?, visible_when?, audience}`. `segments` defaults to the pool
length (releases bind) or the quality's `max` (quality bind); filled = released count / quality value; `active` =
derived (the checkpoint is on the path and not left). No `on_filled` hook: an effect on fill is an ordinary gate on the
same quality, so no second trigger exists (matches 35's one-trigger rule). The odds-gated advance (a named-odds yes/no per
tick) is a genuinely useful, author-friendly pacing knob; if 35 wants it later, it is a trigger variant
`{kind: "odds", odds: "unlikely"|"even"|"likely"|…}` drawn from the seeded seam per boundary, never a clock-side roll.
Player view: segments filled only; the odds stay author-only.

## Copy / Avoid

- **Copy**: from→to on every logged change; a reason string on each modifier (player-facing label from the quality's
  `display.label`); three-band outcomes + match; a progress-scored final check; clocks with no automatic fire; named
  odds as an authoring vocabulary (in our own words).
- **Avoid**: a log that is not derived from rolled-back state (their log and their frontmatter drift apart on edit);
  unseeded dice; the human ticking completion by hand (we derive it); legacy-track XP (grind, deferred anyway); momentum
  burn (needs the roll shown before the player decides, conflicts with hidden checks, and it is one-decider in a
  group); the "active character" assumption (our player is one human with N model members; quests are party-level, a
  member is at most a `giver`).

## Licence note

Code: MIT (`LICENSE.md:3-25`), compatible with AGPL-3.0 if any code were ever copied (keep the notice); this note takes
patterns only. Game content (`LICENSE.md:27-57`): Ironsworn, Ironsworn: Delve and Ironsworn: Starforged content under
CC BY 4.0; Sundered Isles move text under CC BY 4.0, but other Sundered Isles content (assets, oracles, rules) under
CC BY-NC-SA 4.0, which the NonCommercial clause makes unfit for us. Rules data comes from Datasworn, which has its own
licence (`LICENSE.md:65-69`). Some icons come from Forged in Obsidian and are CC BY 3.0 / MLP. No oracle table, move
text, rank names or odds labels should be copied into our schema or guide; use generic words (e.g. odds
`low|even|high`).

## Verdict

Relevance **high**: the closest prior art for quests + checks + clocks. The one thing to take: **three-band check
outcomes (strong / weak / miss + match) recorded as a from→to delta row**, with the score of a quest's final check derived
from the quest's done steps, so quests, checks and the Journal log all stay pure under rollback.
