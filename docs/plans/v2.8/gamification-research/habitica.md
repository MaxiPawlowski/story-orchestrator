# Habitica — v2.8 27 review

meta: https://github.com/HabitRPG/habitica · sparse clone `C:\dev\st-extensions-research\gamification\habitica\source`
@ `0989bbe` (2026-10-05) · ★ 14,185 · downloads n/a (hosted service) · licence: code GPL-3.0; HabitRPG assets/content
CC-BY-NC-SA 3.0; BrowserQuest assets CC-BY-SA 3.0 (`LICENSE:1-9`) ·
files read: `website/common/script/{statHelpers.js, fns/{predictableRandom,crit,randomDrop,updateStats}.js,
libs/randomVal.js, ops/scoreTask.js, ops/revive.js, content/quests/{generic,series,masterclasser}.js (field names only)}`,
`website/server/{libs/cron.js, models/group.js (quest parts), models/user/schema.js (party.quest), controllers/api-v3/quests.js}`.

## What it is

A habit tracker dressed as an RPG. Real-life tasks (habits, dailies, to-dos) are "scored" by the user; scoring moves
XP, gold, mana and HP. Once a day a server **cron** settles the previous day: missed dailies cost HP and feed the party
boss. Parties (small groups of real users) run **quests**: a boss whose HP falls with members' completed work, or a
collection hunt. One real human per account; a party is N humans, not N NPCs plus one player.

## How it works

- **Per-user stats on the user document** (`stats.{hp,mp,exp,gp,lvl}`, buffs) and per-user quest progress
  `party.quest.{key, progress.{up, down, collectedItems}, completed, RSVPNeeded}` (`server/models/user/schema.js:527-543`).
  The **party** holds the shared side: `quest.{key, active, leader, progress.{hp, collect, rage}, members{uid: bool|null}, extra}`
  (`server/models/group.js:104-130`). So: *damage dealt* accrues per member, *boss HP / collected items* is shared.
- **Quest content is declarative data**: a quest is `{text, notes, completion, category, goldValue|value, lvl?,
  unlockCondition?, prereqQuests?, boss{name, hp, str, rage?{value, effect, healing|mpDrain|progressDrain}} |
  collect{item: {text, count}}, drop{gp, exp, items[{type, key, onlyOwner?}]}}` (`content/quests/generic.js:4-39`,
  `series.js:10-27`, `masterclasser.js:40`). The engine branches on `boss` vs `collect` (`group.js:1300-1302`).
- **Invitation/acceptance**: the leader invites; each member's slot starts `null` and becomes `true`/`false`
  (`group.js:686-706`, atomic per member). The quest starts automatically once *every* slot is a boolean
  (`controllers/api-v3/quests.js:27-31`, `:110`, `:227`, `:298`) or by leader force-start (`:327-351`). On start, the
  non-accepting members are dropped from `quest.members` (`group.js:737-744`); only participants accrue progress.
  Leave/abort/cancel endpoints exist (`quests.js:377`, `:455`, `:530`); leaving keeps the member's own progress
  (`quests.js:553`, `group.js:224-241`).
- **Progress accrual**: completing a task adds to `progress.up` scaled by the task's value delta, a crit multiplier and
  the STR stat, habits at half rate (`ops/scoreTask.js:178-193`). Collection items are a per-task drop chance
  (`fns/randomDrop.js:47-71`). Accrual is **buffered per member and applied once at that member's cron**
  (`server/libs/cron.js:367-373`, `:497`, `group.js:1289-1303`) — the boundary-applied analogue of our apply queue.
- **Boss resolution at cron** (`group.js:1112-1219`): boss HP minus the member's `up`; the member's `down` (missed
  dailies) times boss strength is dealt **to every participant** ("Everyone takes damage", `group.js:1121-1124`,
  `:1184-1191`); optional rage meter fills from that damage and fires a party-wide effect (heal boss, drain mana or
  progress) then resets (`:1156-1181`). HP ≤ 0 → `finishQuest` grants gp/exp/items to participants, owner-only items
  to the leader (`:962-996`, `:1201-1214`).
- **Collection resolution**: picks found items from the remaining-needed multiset, proportional to need, finishes when
  all found (`group.js:1236-1272`). Uses `_.shuffle` (Math.random).
- **XP/level shape**: XP to next level is linear-small for the first five levels, then a gentle quadratic rounded to
  tens (`statHelpers.js:23-31`); a hyperbolic `diminishingReturns(bonus, max, halfway)` caps multiplier stacks
  (`statHelpers.js:42-44`, used for drop chance `randomDrop.js:63`). Level-up loops while exp exceeds the threshold,
  refills HP, grants stat points (`fns/updateStats.js:21-56`). Task value itself follows a capped exponential so
  red (neglected) tasks pay more and green ones less (`scoreTask.js:18-36`).
- **Undo is an approximate inverse, not a snapshot**: unchecking a task solves numerically for the pre-check value
  (`scoreTask.js:58-93`) — a reversal by formula, which drifts (`CLOSE_ENOUGH`, `:20`).
- **Randomness**: `predictableRandom` seeds from the *sum of the user's numeric stats* +1, then a `sin` hash
  (`fns/predictableRandom.js:9-27`) so client and server agree (comment `:7-8`). Used for crits (`fns/crit.js:6`) and
  revive losses (`ops/revive.js:30-36`, `:82`). **Drops are true `Math.random`**: the server calls `randomDrop`
  without a seed (`server/libs/tasks/index.js:480`) so it falls back to `trueRandom` (`randomDrop.js:25-27`, `:44`);
  `randomVal` likewise (`libs/randomVal.js:4-12`).
- **Punishments**: missed dailies at cron reduce HP (`cron.js:268-287`, `scoreTask.js:112-123`), feed the boss
  (`cron.js:279`), and reset the daily's streak (`scoreTask.js:310`). At HP 0, revive costs a level, all gold, a
  random stat point and a random equipped item (`ops/revive.js:21-36`, `:82`). Opt-outs: "sleep"/inn
  (`user schema:573`, `cron.js:268`, `:359`, `group.js:1290`) and stealth buff charges (`cron.js:242-245`).
- **Streaks**: per daily, +1 on completion, achievement every 21 (`scoreTask.js:338-341`); gold bonus +1 %/streak day
  (`scoreTask.js:141-153`), drop chance +1 %/streak (`randomDrop.js:51`). "Perfect day" (all dues done) grants a
  next-day buff (`cron.js:332-342`). Multi-day absence counts as one day (`cron.js:185-188`).
- **Visibility**: quest progress and boss damage are announced to the party chat as system messages (`group.js:1128-1153`);
  per-member damage is public to the party. Nothing is hidden by design.

## Overlap with Story Orchestrator

- **We do better**: rollback ≡ replay (they reverse by approximate formula and cannot undo cron); seeded chance on a
  stable key (theirs seeds from a stats sum, so the seed changes whenever any stat changes, and drops are unseeded);
  hidden/public split (they have none).
- **They do, we don't**: a declarative **shared-progress quest** (boss HP / collect counts) fed by per-member
  contributions buffered and applied at a boundary; a rage-style **counter that fires an effect at a threshold and
  resets**; explicit **participation** (who is "on" the quest); quest prerequisites (`prereqQuests`, `lvl`).
- **Philosophically opposite**: the cron loop punishes *absence* and *inaction*, collectively — one member's misses
  hurt everyone. Our agency policy forbids punishing the player for refusing a route; real-time decay and streaks
  reward session length. Both are refused.

## Patterns (rubric table)

| pattern | kind | maps to | determinism | rollback | visibility | group fit | authorable | value | effort | target |
|---|---|---|---|---|---|---|---|---|---|---|
| Quest kind `collect{item:count}` vs `boss{hp}` — progress = a counter toward a target | data model | quest, quality, widget | state-only | derivable (counter quality) | player-safe | N+1 OK | declarative | 5 | S | v2.7 36 Q1 |
| Contributions buffered, applied at a boundary | mechanic | quality, transition | state-only | derivable (apply queue) | player-safe | N+1 OK | needs code (already exists) | 3 | S | v2.7 36 Q1 (confirms design) |
| Threshold meter that fires an effect then resets (rage) | mechanic | clock, quality, transition | state-only | derivable | player-safe or author-only | N+1 OK | declarative | 4 | M | v2.7 35 Ph3 / v2.7 36 W `clock` |
| Reward split: shared drop vs `onlyOwner` drop | data model | quest reward | state-only | needs effects ledger (planned F25) | player-safe | N+1 OK (owner = player) | declarative | 3 | S | v2.7 36 Q5 |
| Participation map `members{id: bool|null}`, start when all answered | mechanic | quest, relationship | state-only | derivable | player-safe | multi-human; for us NPC buy-in only | declarative | 2 | M | v2.7 37 L3 (agenda buy-in), else no |
| `prereqQuests` / `lvl` unlock | data model | quest `visible_when` | state-only | derivable | player-safe | N+1 OK | declarative | 4 | S | v2.7 36 Q1 |
| Diminishing-returns cap on stacked modifiers | mechanic | roll modifiers | state-only | derivable | author-only | N+1 OK | declarative (cap field) | 3 | S | v2.7 36 Q3 |
| Party-wide damage from one member's misses; revive costs level+gold+item | anti-pattern | — | — | — | — | — | — | 1 | — | no (agency) |
| Daily cron / streak bonuses / perfect-day buff | anti-pattern | — | wall clock | unrollbackable | — | — | — | 1 | — | no (session length) |
| Seed from sum of current stats | anti-pattern | roll | pseudo-seeded | breaks on any stat change | — | — | — | 1 | — | no (our key is better) |
| Drops via Math.random | anti-pattern | roll | unseeded | unrollbackable | — | — | — | 1 | — | no |
| Undo by approximate inverse formula | anti-pattern | rollback | state-only | drifts | — | — | — | 1 | — | no |

## Notes per pattern

**Counter-to-target quests (Q1).** Their two quest kinds reduce to "a number moves toward a target": boss HP down to 0,
collect counts up to `count`. Our shape: keep `done_when` as a gate (it already covers both), but add an optional
**`progress`** block so the Journal can show a bar without the author writing a widget:
`progress?: {quality: "<int key>", target: <int>, label?}` — the validator requires the quality to be a declared int
with `display.public` or the quest's own visibility, and `done_when` to be implied (`quality >= target`) when absent.
For collect-style quests, allow `progress: [{quality, target, label}]` (one row per item) and render "3/5 herbs". A step
list already covers ordered quests; `progress` covers the unordered "gather N" case Habitica is built on. State-only,
rolls back because it is a quality.

**Threshold meter (rage) → `clock`.** A meter that fills from events, fires a party-wide effect at a value, and resets
is exactly a Blades-style clock with a reset. Shape for v2.7 35 / 36 W: `clocks[]: {id, quality, max, on_full:
{effects, reset?: true}, visible: "public"|"author"}`, driven by `source: code` increments at boundaries. Effect
dispatch reuses Q5's ledgered origin (`origin {kind: "clock"}`). Must be **world pressure, not player punishment**:
fill from elapsed story beats or NPC agendas, never from the player declining a route.

**Reward split (Q5).** `drop.items[].onlyOwner` distinguishes a reward to the quest owner from a reward to every
participant. With one human player, the useful translation is the *target* of a reward: `reward: {set, effects,
cast?}` where `set` writes player-facing qualities and an optional per-member relationship nudge goes through v2.7 37's
bounded step. Keep rewards as effects through `withLedger` with `origin {kind:"quest"}` — Habitica's rewards are
irreversible DB increments, which is exactly what we must not do.

**Unlock prerequisites.** `prereqQuests` + `lvl` is our `visible_when`; allow the sugar `requires_quests: [ids]`
(compiles to a gate over quest status) so authors need not mirror quest completion into qualities. Status is derived
(`questStatus`), so the gate must read the derived status, evaluated before the quest it unlocks (validator: no cycles).

## Copy / Avoid

- Copy: counter-toward-target quest progress; boundary-buffered contributions; threshold-and-reset meters; shared vs
  owner rewards; quest prerequisites; a hyperbolic cap on stacked roll modifiers (`modifiers_cap`).
- Avoid: punishment for inaction or absence (HP loss, party damage, revive penalties); wall-clock cron, streaks and
  "perfect day" (reward session length); seeds that depend on mutable state; unseeded drops; undo-by-formula;
  public broadcast of every hit (spam the inline timeline — one chip per quest event, not per contribution).

## Licence note

Patterns only. GPL-3.0 code is not AGPL-incompatible in principle (GPL-3.0 §13 allows combining with AGPL-3.0), but
nothing here is worth porting; we take shapes, not code. Quest text, names and art are CC-BY-NC-SA 3.0 — never copy;
NC is incompatible with an unrestricted release. This note quotes no quest text.

## Verdict

Relevance **medium-high** for plan 36 Q1/Q5 and the v2.7 35 clock. The one thing to take: **quests whose progress is a
declared counter toward a target (`progress: {quality, target}`), with shared vs owner rewards** — and the explicit
negative lesson that Habitica's collective damage-for-inaction loop is the opposite of our agency policy.
