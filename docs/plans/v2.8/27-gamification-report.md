# Plan 27 report — gamification prior art (tiers 1 and 2)

**Run 2026-10-07, docs only.** Plan: `27-gamification-prior-art-deep-dive.md` (all Recommended answers: tiers 1+2,
Foundry + Kanka included, Habitica sparse, notes in-repo, tier 1 first). 23 repos cloned and reviewed (11 tier 1,
10 tier 2, 2 solo-play repos located in step 1), 7 tier-3 mentions. Per-repo notes:
`docs/plans/v2.8/gamification-research/<repo>.md`. Clone index with commits and licences:
`C:\dev\st-extensions-research\gamification\README.md`. Every row below is a proposal; a consumer plan changes only by
the user's decision. No rules text, oracle table, odds chart or art was copied.

## What plan 36 should take (read this first)

Twelve schema decisions, each a small addition to `36-quests-and-story-panels.md` §Format additions. Evidence in the
notes named in brackets.

1. **Quest status gains an `offered` lane: `hidden → offered → active → done | failed`.** New optional
   `offered_when` (gate). An offered quest the player ignores is a normal, unpunished state; validator: no
   `failed_when` may hold while a quest is only offered. Cheap agency win. [forien-quest-log, kanka]
2. **`steps[].failed_when?`** (a step can fail on its own), and **`done_when` optional, defaulting to "all steps
   done"**, filled in by the validator so the derived status still has one source. [forien-quest-log, lifequest]
3. **`requires?: [questId]`** sugar, expanded by the validator into `visible_when`/`offered_when`, cycles refused; no
   stored state. [tasknotes, habitica `prereqQuests`]
4. **`progress?: {quality, of}`** on a quest or a step (a counter toward a target, "gather 3"); absent `done_when` then
   means `quality >= of`; the Journal draws it as a bar or N/M. Reads the blackboard, so it rolls back free.
   [habitica `collect`, monks-enhanced-journal]
5. **`labels?: {done?, failed?}`** per quest for player wording ("Left behind" instead of "Failed"), plus a derived
   `closed` flag in `snapshot.game.quests[]`. This covers Kanka's neutral `abandoned` without a fifth status.
   [obsidian-tasks, kanka]
6. **`giver?: <roster id>`**, `author_note?` (author-only), `reward.label?` + `reward.visible_when?` (rewards hidden
   independently of the quest; `set`/`effects` stay author-only). Started/finished times are boundary + message id,
   **never wall-clock**. [forien-quest-log]
7. **Counts come only from the visible projection, and an empty section is never rendered.** "2/3" must count visible
   steps only (FQL ships a `countHidden` option that leaks); a "Rewards" heading with nothing under it hints at hidden
   content. Spoiler property: the player page is byte-identical with and without hidden items. [forien-quest-log
   `Enrich.js:267-276`, monks-enhanced-journal, kanka]
8. **Quality `display` for bounded numbers:** allow `as: "word"` on int/float with
   `bands: [{max, label}, …, {label}]` (ascending, last open, covering `[min,max]` exactly once), so a meter can show
   "Hurt" instead of 7/20; add `as: "boxes"` for an int with `max ≤ 12`; `hide_when_empty` (default true for `item` and
   `count`, so an item not found yet does not read "no"); optional `trend: true` (↑/↓/→ against the previous boundary
   snapshot). Refuse any formatter string. [initiative-tracker, obsidian-gamified-pkm, fantasy-statblocks]
9. **Checks: keep the bool, add one optional degree form now, defer the rest.** Recommended v2.7 cut:
   `checks[].outcome?: {quality: <code enum>, bands: "margin", partial_margin: n}` writing exactly
   `miss | weak | strong` (Ironsworn-style partial success carries most of the drama; a bool cannot say it), plus an
   optional `twist: true` that records a doubles/match flag the author may route on. Advantage (`roll.keep: "high"`),
   success pools, and/but twist dice are noted for later. Each die draws from its own key
   `unitDraw([chat, story, cpStartBoundary, "check:" + id + ":" + i])`. **Decision needed** (see §Decisions).
   [iron-vault, mythic-gme-support, opse-oracle-ttrpg, dice-roller, solo-toolkit]
10. **`extras.checks` record shape:** `{checkId, boundary, messageId, visit, draws: number[], modifiers: [{label, add}],
    total, target, outcome, twist?}`, textless, labels from the quality's public `label`, never a quality key. The
    chip renders "total vs target, outcome"; the author detail adds each die and each labelled modifier.
    [iron-vault, dice-roller]
11. **Widget `bind` is a resolvable reference, never a query**: `"quality:<key>" | {qualities: [...]} | {group} |
    "quests" | "path" | "arcs" | {releases: <checkpointId>}`; ordering/filtering only through fixed `options`. Closed
    kinds; no JS, no regex, no markdown from author values. **`clock`** binds one bounded int quality (segments =
    `max − min`, 2–12) or v2.7 35's release count; it clamps (never wraps), "full" is an ordinary gate (no on-fill hook),
    readers never click it, and a pressure-bound clock defaults to `audience: "author"` (pool size reveals remaining
    pressure). **`board`** lanes are derived quest status (never `hidden`), read-only, done/failed collapsed; arcs can use
    the same shape. [obsidian-dataview, obsidian-progress-clocks, iron-vault, obsidian-kanban]
12. **Journal `log` rows are derived, typed and attributed:** `{at: {boundary, messageId}, kind: "action" |
    "world_event" | "check" | "quest" | "milestone", actor?, text, outcome?, from?, to?}` built from the boundary log,
    `extras.checks`, and quest status diffed between consecutive boundary snapshots (no stored events). Only the
    player's own messages yield `action` rows, which makes "never narrate the player's action" testable on the log.
    [lonelog, iron-vault]

Refuse for 36 (all confirmed as traps by at least two repos): XP/levels/currency, streaks, wall-clock anything,
damage or loss for inaction, click-to-reroll, player-editable or drag-to-move status, author JS/callbacks.

## Step 1 — popularity confirmed (Obsidian `community-plugin-stats.json`, 2026-10-07)

| Plugin | Downloads | Note |
|---|---|---|
| Dataview | 5,093,726 | not gamification; tier 2 for `bind` |
| Tasks | 4,363,377 | tier 2 |
| Kanban | 2,724,415 | tier 2 |
| TaskNotes | 1,961,016 | tier 2 |
| Fantasy Statblocks | 343,166 | tier 1 |
| Leaflet | 315,052 | tier 2 |
| Dice Roller | 284,748 | tier 1 |
| Calendarium | 195,949 | tier 1 |
| Initiative Tracker | 162,552 | tier 1 |
| **Solo RPG Toolkit** (`alexkurowski/solo-toolkit`) | 37,828 | located in step 1, cloned (tier 2) |
| Iron Vault | 19,745 | tier 1 |
| Gamified Tasks (`dromse`) | 7,780 | tier 3 |
| Gamificate your PKM | 6,295 | tier 1 |
| **Lonelog** (`snifer/lonelog`, Solo TTRPG Notation) | 4,405 | located in step 1, cloned (tier 2) |
| kuro-gamification | 856 | tier 2 |
| OPSE oracle | 620 | tier 2 |
| Mythic GME support | 98 | tier 1 |

Progress Clocks and LifeQuest are not in the community list (manual/BRAT installs). Seen but not reviewed: TTRPG Tools
Maps (81k), Charted Roots (75k), RPG Manager (48k), Relations (17k), TTRPG Tools Timeline (16k): candidates if a map or
timeline plan is ever seeded.

## Ranked repos

| Rank | Repo @ commit | Tier | Relevance | The one thing to take | Licence (patterns only unless noted) |
|---|---|---|---|---|---|
| 1 | iron-vault @ `27e9c8b` | 1 | high | three-band checks + from→to delta log rows; quest progress derived from done steps | MIT code; Ironsworn CC BY 4.0, Sundered Isles non-move CC BY-NC-SA 4.0 |
| 2 | foundryvtt-forien-quest-log @ `cf80921` | 1 | high | counts from the visible projection only; `offered` lane | MIT |
| 3 | fantasy-statblocks @ `f248f4a` | 1 | high | closed block kinds bound by key, hide-when-empty, no callbacks (65 of 78 PF2e blocks are JS) | MIT; OGL/Paizo layouts not copied |
| 4 | dice-roller @ `58b3857` | 1 | high | chip = total/outcome, detail = dice + labelled modifiers; their removal of saved results argues for seeded rolls | no LICENSE file; `package.json` MIT |
| 5 | lonelog @ `ea64954` | 2 | high | typed, attributed log rows; player `action` vs world `world_event` authority split | 0BSD text; notation CC BY-SA 4.0 |
| 6 | calendarium @ `388d66d` | 1 | high (37/22) | one rolled-back `story_day` int + authored calendar → derived keys | MIT |
| 7 | mythic-gme-support @ `54c385b` | 1 | high (22) | scene test: seeded draw vs one author-only `chaos` quality → expected/altered/interrupt | code 0BSD-style; content Word Mill CC-BY-NC |
| 8 | monks-enhanced-journal @ `9d66fb9` | 1 | medium-high | `done/required` step counters; relationship public label + gated secret label | GPL-3.0 |
| 9 | habitica (sparse) @ `0989bbe` | 1 | medium-high | quest progress as counter toward target; shared vs owner rewards; negative lesson on party damage for inaction | GPL-3.0 code, CC-BY-NC-SA 3.0 content |
| 10 | kanka @ `c700f46` | 2 | medium-high | hidden rows never enter the projection; per-row visibility inside a public quest | Commons Clause only, `composer.json` "proprietary": patterns only |
| 11 | obsidian-dataview @ `5ad0994` | 2 | medium-high | `bind` is a reference, never a query | MIT |
| 12 | obsidian-tasks @ `7d8f441` | 2 | medium-high | author labels over a closed status type; done+cancelled grouped as closed | MIT |
| 13 | initiative-tracker @ `85f0873` | 1 | medium | number → word bands; duration as "boundaries since set" | GPL-3.0; SRD text not copied |
| 14 | obsidian-progress-clocks @ `43752cf` | 1 | medium | clock = bounded int, clamp, full is a gate | MIT |
| 15 | foundryvtt-simple-calendar @ `f09bb96` | 2 | medium | time is one code quality transitions advance | MIT |
| 16 | opse-oracle-ttrpg @ `bbdfa7b` | 2 | medium | answer + twist as a seeded enum; failure draws from an authored pool | MIT; OPSE CC BY-SA 4.0 |
| 17 | solo-toolkit @ `8eec1fd` | 2 | medium | clock widget on a bounded int; `roll.mode` adv/dis; weighted pool lines | MIT; Mythic-like chart not copied |
| 18 | tasknotes @ `69535cd` | 2 | medium | `requires: [questId]`; per-occurrence done lists for recurring steps | MIT |
| 19 | obsidian-kanban @ `5134c05` | 2 | medium | `board` = read-only projection of derived status | GPL-3.0 |
| 20 | kuro-gamification @ `c0a8f45` | 2 | medium (ethic) | every visible number explains itself in author view; grace instead of a cliff | AGPL-3.0 |
| 21 | lifequest @ `d95610a` | 2 | low-medium | parent done when all steps done; review fold as author signal | 0BSD template notice |
| 22 | obsidian-leaflet @ `a26e36b` | 2 | low-medium | map markers authored, gated by `visible_when`, image-percent positions | no LICENSE file; `package.json` MIT |
| 23 | obsidian-gamified-pkm @ `4fef614` | 1 | low | `bands` + trend arrow on a public meter | MIT |

## Pattern table (consolidated, rubric columns)

Determinism: S = state-only, D = seeded draw, M = model call. Rollback: R = derivable from rolled-back stores.

| # | Pattern | kind | maps to | det. | rollback | visibility | group fit | authorable | value | effort | target | sources |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| G1 | Counts/lists only from the visible projection; no empty sections | UI rule | journal, widget | S | R | player-safe (prevents leak) | OK | code | 5 | S | **v2.7 36 Q5/W/P** | forien, monks, kanka |
| G2 | Three-band check outcome (+ match/twist flag) | mechanic | roll, enum quality | D | R | per `narrate` | OK | declarative | 5 | M | **v2.7 36 Q3** | iron-vault, mythic, opse |
| G3 | Typed, attributed, derived log rows with from→to | data model | journal | S | R | player-safe per row | OK | code | 5 | M | **v2.7 36 Q5/W `log`** | lonelog, iron-vault |
| G4 | `bind` = resolvable reference to declared keys, never a query | authoring format | widget | S | R | player-safe | OK | declarative | 5 | S | **v2.7 36 W** | dataview, statblocks |
| G5 | Quest progress = counter toward target | data model | quest, widget | S | R | player-safe | OK | declarative | 5 | S | **v2.7 36 Q1** | habitica, monks, iron-vault |
| G6 | Number → authored word bands (+ boxes, hide-when-empty, trend) | UI | quality display | S | R | player-safe (hides value) | OK | declarative | 5 | S | **v2.7 36 Q2** | initiative, gamified-pkm, statblocks |
| G7 | `offered` lane; refusal is unpunished | data model | quest | S | R | player-safe | OK | declarative | 4 | S | **v2.7 36 Q1** | forien, kanka |
| G8 | Step-level failure; default done = all steps | data model | quest | S | R | player-safe | OK | declarative | 4 | S | **v2.7 36 Q1** | forien, lifequest |
| G9 | `requires: [questId]` expanded by the validator | data model | quest gate | S | R | player-safe | OK | declarative | 4 | S | **v2.7 36 Q1** | tasknotes, habitica |
| G10 | Author labels over a closed derived status; `closed` grouping | data model | quest | S | R | player-safe | OK | declarative | 4 | S | **v2.7 36 Q1/Q5** | obsidian-tasks, kanka |
| G11 | Clock = bounded int (or release count), clamp, full is a gate, author-only when bound to pressure | data model | clock widget | S | R | spoiler risk if pressure-bound | OK | declarative | 4 | S | **v2.7 36 W**, v2.7 35 | progress-clocks, iron-vault, solo-toolkit |
| G12 | Chip = total/outcome; detail = dice + labelled modifiers | UI | roll chip | D | R (`extras.checks`) | public only if `narrate: public` | OK | declarative | 5 | S | **v2.7 36 Q3/P** | dice-roller, iron-vault |
| G13 | Story time = one rolled-back int; calendar fields derived | data model | quality, schedule | S | R | player-safe | OK | declarative | 5 | S–M | **v2.7 37 L4**, v2.8 22, new seed | calendarium, simple-calendar |
| G14 | Duration as "boundaries since set" (`lasts`) | data model | mood, condition | S | R | author-only default | OK | declarative | 4 | S | **v2.7 37 L2** | initiative-tracker |
| G15 | Relationship public label + gated secret label; numbers author-only; directed, not mirrored | data model | relationship | S | R | author-only by 37 | OK | declarative | 3 | S | v2.7 37 L1 (label only; reveal deferred) | monks, kanka |
| G16 | Per-occurrence done list for recurring steps | data model | agenda | S | R | author-only | OK | declarative | 3 | M | v2.7 37 L3 | tasknotes |
| G17 | Threshold meter fires an effect then resets (rage) | mechanic | clock, complication | S | R | author decides | OK | declarative | 4 | M | v2.7 35 Ph3 | habitica |
| G18 | Odds-gated / chaos-scaled trigger; event on doubles | mechanic | trigger | D | R | author-only | OK | declarative | 4 | M | v2.7 35 (later trigger variant, after K1–K5) | mythic, iron-vault, solo-toolkit |
| G19 | Failure draws from an authored pool; spent-ness from the path; weighted lines | mechanic | complication pool | D | R | author-only | OK | declarative | 4 | M | v2.7 35 Ph3 | opse, dice-roller tables, solo-toolkit |
| G20 | Scene test: seeded draw vs one `chaos` quality → expected / altered / interrupt (world-side only) | mechanic | director signal | D | R | author-only | OK | declarative | 5 | M | **v2.8 22** | mythic |
| G21 | Event focus drawn from open arcs / present members | mechanic | complication focus | D | R | spoiler risk (names hidden arcs) | OK | declarative | 4 | S | v2.7 35 Ph3, v2.8 22 | mythic |
| G22 | Periodic review fold (which quest stalls) | UI | director signal | S | R | author-only | OK | code | 3 | M | v2.8 22, v2.7 04 | lifequest |
| G23 | Every visible number explains itself (`{value, contributions[]}`) | UI | quality, widget | S | R | author-only rows | OK | code | 4 | M | v2.7 36 author view | kuro |
| G24 | Typed entity pages (people/places) with `known_when` | data model | journal | S | R | spoiler risk | OK | declarative | 3 | M | new seed (Journal People/Places, v2.8 04) | monks |
| G25 | Image map + authored, gated markers | data model/UI | widget `map` | S | R | spoiler risk (gate) | OK | declarative | 3 | M | new seed (map panel) | leaflet |
| G26 | Notation export of the session journal | authoring format | journal | S | R | author-only | OK | code | 2 | S | new seed | lonelog |
| T1 | Punish inaction (party damage, revive cost, XP loss) | anti-pattern | — | — | — | — | — | — | — | — | refuse | habitica, lifequest |
| T2 | Streaks, daily cron, perfect-day buffs, wall-clock challenges | anti-pattern | — | wall clock | unrollbackable | — | solo | — | — | — | refuse | habitica, gamified-pkm, kuro, lifequest |
| T3 | `Math.random` / pseudo-seeds from mutable counters; reroll buttons | anti-pattern | roll | — | unrollbackable | — | — | — | — | — | refuse | all dice/oracle repos, habitica, kuro, calendarium install seed |
| T4 | State split between a log and a separate document | anti-pattern | — | — | drifts | — | — | — | — | — | refuse | iron-vault, gamified-pkm, solo-toolkit |
| T5 | Hidden data shipped to the client and filtered at render | anti-pattern | — | — | — | leak | — | — | — | — | refuse | forien |
| T6 | Author code in display formats (callbacks, eval, regex) | anti-pattern | widget | — | — | leak, hang | — | — | — | — | refuse | statblocks, dataview |
| T7 | Viewer writes (click to fill, drag to move, place marker) | anti-pattern | widget | — | unrollbackable | — | solo | — | — | — | refuse | progress-clocks, kanban, leaflet |
| T8 | Lossy undo (approximate inverse, re-filter on back-step) | anti-pattern | rollback | — | drifts | — | — | — | — | — | refuse | habitica, initiative-tracker |
| T9 | Turn order forcing who acts; HP-to-zero fail state | anti-pattern | — | — | — | — | skips the player | — | — | — | refuse | initiative-tracker |
| T10 | XP for text volume / model-judged prose | anti-pattern | — | M | — | — | — | — | — | — | refuse (no floor) | gamified-pkm |

## Traps (consolidated)

1. **Punishment for inaction** fights `DEFAULT_AGENCY`: Habitica's missed dailies damage the whole party; dying costs
   a level, gold, a stat point and an item. Pressure must fill from the world (beats, agendas), never from a refusal.
2. **Session-length rewards**: streaks, perfect days, daily cron, wall-clock challenges, streak decay floors.
3. **Unseeded randomness and rerolls**: every dice/oracle repo uses `Math.random`; dice-roller even removed saved
   results; reroll buttons invite fishing. Our keyed draws are strictly better.
4. **Two truths**: a log plus a state document drift on edit (Iron Vault, Gamified PKM, solo-toolkit). Ours: one store,
   everything else derived.
5. **Render-time hiding** (FQL ships hidden tasks to every client) and **counts that include hidden items**
   (`countHidden`). Hide at projection, count from the projection.
6. **Code in "declarative" formats**: Fantasy Statblocks' layouts are mostly JS callbacks; Dataview's JS mode is an
   escape hatch with no audience model.
7. **Viewer-side writes** (click to fill, drag to move, user-placed markers): a write that is not a boundary cannot
   roll back.
8. **Solo assumptions**: an "active character", one decider for a party (momentum burn), turn order that could skip
   the player. Group chats need one player plus N members.
9. **Odds as spoilers**: a pressure clock's segment count, an expected-value preview and an odds ladder all reveal what
   is left; author-only by default.
10. **Content licences**: Ironsworn/Starforged CC BY 4.0 (NC for Sundered Isles non-move content), Mythic CC-BY-NC,
    OPSE and Lonelog CC BY-SA 4.0, Habitica CC-BY-NC-SA 3.0, SRD/OGL in statblocks and initiative. Mechanics described,
    nothing copied.

## Copy / avoid

Copy (patterns): G1–G12 into plan 36; G13/G14/G16 into 37; G17–G19, G21 into 35 (Phase 3 and later, after K1–K5);
G20/G22 into 22.

Avoid: T1–T10.

## Candidate rows by consumer (proposals)

| Consumer | Rows |
|---|---|
| **v2.7 36** | Q1: G5, G7, G8, G9, G10, `giver`, `author_note`, boundary-stamped start/end. Q2: G6. Q3: G2, G12, record shape (above §10), per-die keys. Q4: confirmed as `when` + `secret` (gamified-pkm badges are pure threshold functions). Q5: G1, G3, reward `label`/`visible_when`, shared vs owner reward (habitica `onlyOwner` → the player is the owner; no per-member rewards). W: G4, G11, `board` binds quests as well as arcs. P: G1 "no empty section" spoiler property; G23 author detail |
| **v2.7 37** | L1: keep numbers author-only; optional author-only `label` per axis (already present); a gated secret label is deferred. L2: `lasts: {boundaries: n} \| {until: "scene_break"}` (G14). L3: per-occurrence done list (G16); quest `giver` links agendas to quests. **L4: gates on "time" but no time convention exists** (`grep time_of_day|story_day src docs/authoring` = 0) (G13): `story_day` int (`source: code`) + `time_of_day` enum, advanced by authored effects `effects.time {advance, set_part}` at boundaries; optional authored `calendar {weekdays, months[], moons[]}` giving read-only derived gate keys (`cal.weekday`, …); schedules gate on those |
| **v2.7 35** | Ph3: G17 (fire-then-reset meter as an authored pool trigger), G19 weighted lines, G21 focus pick. Later trigger variants (after K1–K5 pass): `{kind: "odds"}` / chaos-scaled (G18). Clock read model stays author-only by default (G11) |
| **v2.8 22** | G20 scene test as the director's first, seeded, author-only decision before it writes an anchor (an interrupt is world pressure only); `chaos` as one author-only int quality optionally driven by the tension EMA; G22 stall review; TV report P11 checklist (off-screen, pending, pressures) |
| **v2.8 04 / 23** (what 36 does not absorb) | G24 People/Places pages; trend arrows; G26 journal export |
| **New plan seeds** | Story clock + calendar (if 37 L4 does not absorb it); map panel (G25); journal notation export (G26) |

## Tier 3 (not cloned; one paragraph each)

- **dromse/obsidian-gamified-tasks** (97 ★, 7,780 downloads, MIT): points per completed task and a reward shop where
  points buy self-set rewards. A currency loop; refuse for stories (36 defers currency).
- **inkle/ink** (4,961 ★, MIT) / **klembot/twinejs** (2,900 ★, GPL-3.0): interactive-fiction state — visit counts,
  read counts, storylets gated by state, choice gating. Our `visitedPath` + gates already express visit counts; ink's
  "once-only" and "sticky" choice semantics are the only idea worth a look if a choice UI is ever planned.
- **Richardsl/heatmap-calendar-obsidian** (962 ★, Apache-2.0): streak heatmap; a streak surface (refuse, T2).
- **SuperChamp234/habitica-sync** (112 ★, MIT): bridge to the Habitica API; nothing for a story layer.
- **c6p/logseq-habit-tracker** (120 ★, MIT): habit counts in Logseq; confirms Logseq has little gamification code.
- **tiddly-gittly/tw-gamification** (7 ★, MIT): TiddlyWiki event → reward pipeline (events typed, rewards computed by
  rules). The "event → rule → reward" split mirrors our boundary log → derived quests; nothing new.

## Decisions for the user

1. **Check degrees in v2.7 36:** (a) bool only, as written; (b) **recommended**: bool + optional three-band
   `miss|weak|strong` by margin + optional twist flag; (c) also advantage/success pools now.
2. **`offered` lane:** add to 36 Q1 now? Recommended yes (validator rule: offered quests cannot fail on time alone).
3. **Story clock for 37 L4:** absorb G13 into 37 (recommended: `story_day` + `time_of_day` only; calendar later), or a
   separate new seed.
4. **`board` widget binding:** quests and arcs (recommended), or arcs only as written.

## Run record

See plan 27 §Run record.
