# Mythic GME Support — v2.8 27 review

meta: https://github.com/martinellison/mythic-gme-support · clone path
`C:\dev\st-extensions-research\gamification\mythic-gme-support\source` @ `54c385b` (2026-10-05) · ★ 3 · downloads 98 ·
licence: plugin code `0-BSD` (`package.json:14`); game content under Word Mill Games' CC-BY-NC 4.0 policy
(`LICENSE:1-8`, attribution in `README.md`), covering the text of Mythic GME 2e and related books ·
files read: `src/fatedata.ts`, `src/question.ts`, `src/scene/{scene,sceneType,adjustment,alteration}.ts`,
`src/object.ts`, `src/eventfocus.ts`, `src/metadata.ts`, `src/codeblock.ts`, `src/dice.ts` (head), `src/main.ts`
(dice helper), `src/tables/checkTable.ts` (weights), `How-to-write-your-own-adventure.md`, `documents/summary.md`.
Oracle/meaning tables (`src/tables/*`, KDL data) deliberately not read beyond structure, and nothing from them is
reproduced here.

## What it is

An Obsidian helper for solo play with the Mythic Game Master Emulator: the player writes a story in notes and drops
JSON code blocks (`mythic-scene`, `mythic-question`, `mythic-object`, `mythic-dice`) that the plugin rolls, resolves
against Mythic's tables and renders. It also scans the adventure folder for character and thread objects and keeps
them as lists that random events can pick from. It is a dice-and-tables assistant, not a story engine: the human
interprets every result.

## How it works

- **Storage = JSON inside code blocks.** Each block's header names its kind; the body is the object as JSON
  (`metadata.ts:32-53`, `codeblock.ts:68`). Saving a modal rewrites the block (`question.ts:195-201`). Lists of
  characters/threads are rebuilt by scanning every note's code blocks (`metadata.ts:99-133, 159-182`).
- **Chaos factor** is an int 1–9, default 5, set by a slider (`scene/sceneModal.ts:47-51`). It is stored **per
  block**: each scene carries its own `chaos` (`scene/scene.ts:23`) and each question its own `chaosFactor`
  (`question.ts:34`), so there is no single current value and no automatic end-of-scene shift; the human carries it
  forward.
- **Fate question.** Two d10 are thrown and stored (`fatedata.ts:20, 70-72`); the total adds an odds modifier
  chosen from an authored odds ladder (`question.ts:12-24`, `fatedata.ts:37`) and a small chaos modifier that is
  larger at the extremes of the chaos range (`fatedata.ts:30-34`); the total is looked up in an answer table
  (yes / no and their exceptional forms) (`fatedata.ts:38-40`).
- **Random event on doubles.** A fate check also spawns a random event when both dice match and the matched value
  is at or under the chaos factor (`fatedata.ts:65-68`); higher chaos, more interruptions. The event gets a focus
  (what kind of thing it is about) and a two-word meaning prompt (`question.ts:49-68`).
- **Event focus picks a list entry.** A focus that names a list (threads, characters) picks one object from the
  scanned list (`eventfocus.ts:27-39`), optionally including "protected" objects (`metadata.ts:66-77`).
- **Scene test.** At scene start one d10 is compared with chaos: above → the expected scene happens; at or below →
  altered (odd) or interrupted (even) (`scene/scene.ts:41-53`). An altered scene takes one alteration kind
  (next / tweak / fate question / meaning / adjustment, `scene/alteration.ts:9-14`); an adjustment draws one or two
  changes of the kinds add/remove a character or raise/lower activity (`scene/adjustment.ts:3-29`). An interrupt
  gets a focus and meaning (`scene/scene.ts:81-86`). The scene stays unsaveable until the human writes the expected
  scene and, if needed, the alteration text (`scene/scene.ts:109-138`).
- **Threads and characters** are `MythicObject {kind, name, marker, description, hasBeenRemoved?, maxProgress?,
  progress, needsFlashpoint?, isProtected?}` (`object.ts:9-22`). Progress threads count steps in multiples of 5
  (`object.ts:157-178`); a flashpoint flag is meant to fire on step boundaries, but the test as written only holds
  when progress mod 5 is 1 (`object.ts:102-106`), likely a bug.
- **Custom tables** are weighted lists (default weight 1, `tables/checkTable.ts:12-19, 40`;
  `How-to-write-your-own-adventure.md:146`).
- **Randomness is `Math.random`** everywhere (`main.ts:45`, `eventfocus.ts:18`, `object.ts:110`), but results are
  persisted in the block, so a re-render shows the same roll; rerolling is an explicit button.
- **Visibility.** Solo; the player is also the GM, so every roll and table is shown.

## Overlap with Story Orchestrator

- **We do better:** seeded chance (a swipe re-reads the same roll; theirs is persisted Math.random, which is
  "stable until you press reroll", i.e. reroll-shopping is one click). One source of truth for state (their chaos is
  copied into every block). An authored graph that the oracle serves, not replaces.
- **They do, we don't:** a single scalar (chaos) that every random mechanic reads, so instability is one knob; a
  per-scene test that chooses expected / altered / interrupt; random events whose focus is drawn from the live lists
  of threads and characters; progress threads with flashpoints.
- **Philosophically opposite:** the human interprets everything and writes the scene. We must never let an oracle
  answer stand in for the player's action, and an "interrupt" must be world pressure, never a narrated player move.
  Solo-only: one person is player and GM; in our group chats the oracle is the author's/director's tool, and its
  questions are about the world, not about what the player does.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| scene test: expected / altered / interrupt from one draw vs chaos | mechanic | director signal | seeded draw | derivable (keyed by checkpoint-entry boundary) | author-only | OK (world-side only) | declarative | 5 | M | v2.8 22 |
| chaos factor: bounded int every random mechanic reads | data model | quality, director signal | state-only | derivable (code int quality) | author-only | OK | declarative | 4 | S | v2.7 35 Ph3/Ph4; v2.8 22 |
| random event on doubles ≤ chaos (chance rises with chaos) | mechanic | trigger, complication | seeded draw | derivable | author-only until released | OK | declarative | 4 | M | v2.7 35 (new trigger), new plan seed |
| event focus picks from open threads/characters | mechanic | complication focus, agenda | seeded draw over a state-derived list | derivable | spoiler risk (names hidden arcs) | OK | declarative | 4 | S | v2.7 35 Ph3; v2.7 37 agendas |
| fate check with odds ladder + exceptional bands | mechanic | roll, check | seeded draw | derivable | public or hidden per check | OK | declarative | 3 | S | v2.7 36 Q-checks |
| progress thread with flashpoints every N steps | data model | quest steps, clock, milestone | state-only | derivable | player-safe | OK | declarative | 3 | S | v2.7 36 Q1/W |
| scene adjustment kinds (add/remove character, raise/lower activity) | mechanic | director signal, cast | seeded draw | derivable | author-only | add/remove character needs care in groups | declarative | 2 | M | v2.8 22 |
| two-word meaning prompts injected for interpretation | mechanic | director signal | seeded draw, then model | off-path only | author-only | OK | content licence blocks theirs | 2 | M | no (own tables at most) |
| results persisted, Math.random, reroll button | anti-pattern | roll | Math.random | — | — | — | — | — | — | no |
| chaos copied per block (no single source) | anti-pattern | quality | — | — | — | — | — | — | — | no |

## Notes per pattern

**Scene test → director mode (plan 22).** Their per-scene draw is the cleanest prior art for "how far does the next
anchor depart from the plan". Our shape: when the director (or expansion) prepares the next anchor, it first draws
`mode = unitDraw([chat, story, checkpointStartedBoundary, "scene-test"])` against the chaos quality and records
`mode: "expected" | "altered" | "interrupt"` in the author view; the prompt then asks for the authored next beat,
a tweaked one, or an interrupting world event. The draw is seeded and off the reply path (the director already
runs ahead), so rollback re-reads it. Agency: `interrupt` writes world pressure only (`objective_kind:
"world_pressure"`), never the player's action, and a player who refuses it is not punished (it is one more route).

**Chaos as one quality.** `chaos` = a `source: code` int with `min`/`max` (default 1–9, start 5), moved by authored
effects (`effects.set`/increment on transitions) and, optionally, by pacing: "in control" vs "out of control" is
close to our tension EMA, so a story may bind it (`pacing.chaos_from_tension: true`) instead of hand-moving it. Every
chance consumer (complication trigger, scene test, NPC reply probability) may take a `scale_by: "chaos"` instead of
a second knob. Author-only by default; never a public meter.

**Doubles-style random events → plan 35 trigger.** Plan 35 has `escalate` and `quiet` triggers. A third, `chance`,
is the Mythic shape: at each boundary in the checkpoint, release one pool item when
`draw([chat, story, boundary, "complication:" + cp]) < base + k × chaos`; same pool, same spent-ness, same seam.
Needs its own floor (agency flags ≤ control + 1, as K3) before it ships. Focus: if the pool item names `focus:
"arc" | "member"`, pick a seeded entry from *open* arcs or *present* members (after L4 schedule drops), so it is
state-derived and rolls back.

**Fate check bands → plan 36 checks.** Plan 36 `checks[]` writes a bool. Mythic's useful extra is the exceptional
band. Concrete advice: keep `quality` bool, add optional `bands?: {exceptional_margin: n}` and
`outcome_quality?: "<enum key>"` (enum `exceptional_fail | fail | success | exceptional_success`), and an `odds?`
shorthand that resolves to a modifier from a small fixed ladder we define ourselves (not Mythic's numbers). The
steering line already states the outcome only; an exceptional outcome is the place an author hangs a bigger effect.

**Progress threads → quest steps / clock.** `maxProgress` in steps of 5 with a flashpoint each 5 is a
clock with sub-milestones: map to a plan 36 `clock` widget on a bounded int, plus milestones `when: q >= 5`, `q >= 10`.
Their modulo bug is a reminder to test step-boundary gates on exact values.

## Copy / Avoid

- Copy: one instability scalar read by every random mechanic; scene test vs that scalar; random events whose odds
  rise with it; focus drawn from live lists; exceptional result bands.
- Avoid: `Math.random` + persisted result + reroll button (reroll-shopping); state duplicated per record; the human
  as interpreter of every roll (our interpreter is the model, off-path, and the author reviews); any Mythic table,
  odds value, answer threshold or meaning word list.

## Licence note

Plugin code is 0-BSD (compatible with AGPL-3.0, but we take nothing). The Mythic rules and tables are CC-BY-NC 4.0;
NC conflicts with AGPL's permission for commercial use, so no table, threshold, word list or rules text may enter
our repo or shipped stories. Mechanics are described above in our own words only; any odds ladder or tables we ship
must be our own.

## Verdict

Relevance **high** for plan 22 and medium for plan 35/36. Take: **the scene test — a seeded draw against one
author-only `chaos` quality decides whether the next anchor is expected, altered or an interrupting world event.**
