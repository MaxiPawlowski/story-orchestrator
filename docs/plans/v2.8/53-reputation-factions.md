# Plan 53 — Reputation with groups

**Status (2026-10-14): A BUILT on branch `v2.8-p53-reputation` (D floors green in jest, no-model lane scenario green ×2;
F7/F9 RP+CL owed); see §Gate record. Was: DRAFT, new (no gamification row).** Owner decision 2026-10-14: plans 51–53 go into
v2.8 and are written now. Gate tiers (v2.8 00 §Gate taxonomy): implementation **D**; acceptance **D** + **RP** (members
open differently by standing, on the main reply model) + **CL** (second-model rater; living director hint uptake on
the director's route). Overview: `docs/plans/v2.8/00-overview.md`. Not in `32-queue.md` yet (the owner queues it).
**Revised 2026-10-14 against the Astra review**: §Review 2026-10-14 (Astra) records each finding; the shared contract
(SC1–SC5) lives in v2.8 52 §Review 2026-10-14 (Astra). Snapshot writes and hidden-faction director input are removed.

## What it is

- A story declares **factions**: groups such as a guild, a village or the crown. Each has a **standing** with the
  player, a bounded whole number that only the author sees.
- Standing moves on **story events**: authored moves that fire once ever when their gate first holds, and quest
  rewards (`reward.set {add}`). Both are clamped to the faction's range by one shared rule. It never moves on the
  player's refusal or inaction (`DEFAULT_AGENCY`, trap T1) and never on wall-clock time (T2).
- Roster members **belong** to factions (`roster[].factions`). A drafted member that belongs to a faction gets one
  private line saying how its faction regards the player as far as that member has heard, so it opens toward the
  player accordingly. The living director gets the standings of factions the player knows as hints ("the crown
  distrusts the player").
- The player sees each faction's standing as **authored words** (G6 bands: "Hostile", "Wary", "Trusted"), never a
  number, a range or a trend arrow by default.
- Standing is ordinary story state: it rolls back with the blackboard and replays identically.
- Group chats only (v2.7 03). "Faction" is the field name so it never collides with SillyTavern's group chats; player
  copy may say "Standing".

## History and evidence

| # | Source | What it says |
|---|---|---|
| 1 | `docs/plans/v2.8/27-gamification-report.md` G6 | number → authored word bands, player-safe (hides value), declarative; adopted in v2.7 36 Q2 |
| 2 | v2.8 27 report §Traps 1, 2, 9 | punish-inaction, session-length rewards and odds-as-spoilers are refused |
| 3 | v2.8 27 report G17 | a threshold meter that fires an effect (pattern for "standing crosses a band → world reacts") |
| 4 | `docs/plans/v2.8/23-story-widgets.md` (widget table) | `roster` widget: "party or faction list with a status per member", per-member enum qualities |
| 5 | `docs/plans/v2.8/gamification-research/iron-vault.md` | Iron Vault tracks factions in the sidebar (prior art for a faction list) |
| 6 | `docs/plans/v2.8/gamification-research/lonelog.md` | Lonelog's notation has a `Faction` tag (factions are a common solo-play entity) |
| 7 | `docs/plans/v2.7/37-character-life.md` L1 | personal feelings are per member, extractor-read, author-only numbers |
| 8 | guide topic `widgets` (`docs/authoring/story-guide.md`) | a `roster` lists "a party or a set of factions", each row an enum status word |

## Current state in code

Verified on master `211d8d96`. `grep -rli faction src docs/authoring` finds three source files plus the guide:

- **Memory ledger entity type `faction`.** The ledger contract lets the read emit `[state:Name:faction]` rows with
  fields `leadership, objective, alliances, hostility_level` (`src/memory/contract.ts:54`, `:170-175`). These land in
  `extras.memory` ledger rows (`LedgerEntry {entity, entityType, field, value}`, `src/memory/types.ts:144-156`),
  author-view only, unbound to any quality unless the story declares `ledger_binding` (`src/engine/schema.ts:79`).
- **Lore score prompt wording** (`src/judge/loreScore.ts:18`): "same region, family, faction or era" — text only.
- **Guide bundle** (`src/guide/pages.generated.ts`, generated from the guide): the `roster` widget's "set of factions".
- **Roster widget.** `WidgetRosterRow {id, label?, member?, quality, when?}` (`src/engine/gameSchema.ts:163-169`);
  `rosterBody` shows an enum quality's `player_labels` word, `—` for players otherwise (`src/runtime/widgets.ts:160-174`).
  So a "faction list" works today only for enum qualities; a bounded int with `bands` is not read by `statusText`.
- **Word bands.** `QualityDisplay.bands: DisplayBand[]` (`src/engine/gameSchema.ts:7-22`), validated ascending and
  covering `[min, max]` (`src/engine/validate/display.ts:15-41`); the Stat sheet shows the band word.
- **Code-moved numbers.** Quest `reward.set` with `{add: n}` writes code qualities (`src/engine/gameSchema.ts:43-50`,
  `src/engine/quests.ts:74-84`, no range clamp: `:79-80` adds directly). Checkpoints and transitions carry
  `state_snapshot` (`src/engine/schema.ts:234`, `:349`), but it is an **expectation** for generation and scope
  (`src/generation/critic.ts:40,55`, `src/extraction/scope.ts:69`); checkpoint entry never applies it
  (`src/engine/engine.ts:259-271`). No authored checkpoint `set {add}` effect exists (v2.7 37 deviation).
- **No range enforcement.** `Blackboard.applyDelta` checks quality, source, type, monotonic and latch, never a numeric
  range (`src/engine/blackboard.ts:71-95`).
- **Member private block.** `privateLifeLines` (`src/engine/life/lines.ts:45-58`) via `MemoryInjector.lifeLines`
  (`src/runtime/memoryInjector.ts:129-134`), filtered per member.
- **Director.** `renderDirectorPrompt` lists cast, canon, threads and "Private plans of the cast"
  (`src/generation/living/prompt.ts:50-79`); no standing input.
- **No faction declaration, membership or standing exists.** `RosterMember` has no `factions` field.

## Options

| | Design | Cost | Risk | Notes |
|---|---|---|---|---|
| **A. Authored factions, code-moved standing** | `factions[]` with range, start, bands, `moves[]` (gate → add, once); standing a code int `rep_<id>`; member line + director hint + band projection | M | authors must write the moves; a story with sparse moves feels static | deterministic, no read cost, rolls back free |
| **B. A + extractor-read nudges** | A, plus a rated extractor read per faction ("did the player help or harm the guild this turn?"), clamped like relationships | M+ | prompt cost per read; noise; double movement with authored moves | reuses v2.7 37's step clamp and judge-first route |
| **C. Ledger-driven** | bind the ledger's `hostility_level` field to standing via `ledger_binding` | S | free text values ("tense") do not map to numbers; author-only today | builds on the existing `faction` entity type only |
| **D. Relationships per member only** | no factions; every member holds `rel_*` toward the player | 0 | no collective standing; N axes to keep consistent | status quo |

## Recommendation

**A**, with the existing pieces reused: the `faction` ledger type as an author-side hint, the `roster` widget as the
player list, the G6 band validator for the words.

Format (story level, lazy game layer):

```json
"factions": [{ "id": "guild", "name": "The Guild", "range": [-5, 5], "start": 0,
  "bands": [{ "max": -3, "label": "Hostile" }, { "max": -1, "label": "Wary" }, { "max": 2, "label": "Neutral" }, { "label": "Trusted" }],
  "visible_when": { "q": "met_guild", "op": "==", "v": true },
  "moves": [{ "id": "saved_apprentice", "when": { "q": "apprentice_saved", "op": "==", "v": true }, "add": 2 }] }],
"roster": [{ "id": "mara", "factions": ["guild"] }]
```

- **Standing.** Compiled to `rep_<faction>` (code int, `range` + `start`, seeded at `start` like an unread
  relationship, v2.7 37 Q1).
- **One clamp for every writer.** A compiled quality may carry `range: [min, max]`; `Blackboard.applyDelta` clamps a
  code-source int write into it before the type check (one place, so quest `reward.set {add}`, moves and any later
  writer are bounded alike). Extractor qualities keep their `step_rule` clamp. A write that clamps records
  `clamped: true` in its outcome for the author panel.
- **Moves.** Each fires **once ever** (not once per onset), the first boundary its gate holds, adding `add` (±,
  |add| ≤ range width); latched in `rep_<faction>_move_<id>` (code int = the boundary it fired). The add and the latch
  are written in one step of the latch pass (shared contract SC2 step 5, after quest rewards; re-run at step 7): the
  latch is written only if the add's outcome is `ok`, so completion is atomic. Rollback drops both, and the rollback
  detector registry sees them (SC1). `reward.set {"rep_guild": {"add": 1}}` keeps working. **`state_snapshot` is not
  a standing writer** (it is never applied); the validator warns on a `rep_*` key in a snapshot.
- **Affirmative events only.** A move with `add < 0` must gate on an evidenced event: its gate may not be satisfiable
  by absence or time alone. Refused: every gate key in `TIME_KEYS` or a story-time key, a leaf comparing to `false`
  or to the quality's start value, a `not` node at the top. Diagnostic `faction-move-on-inaction` names the leaf.
- **Who hears.** Each move declares `heard_by: "present" | "faction"` (default `present`). The member line uses a
  per-member perceived standing `rep_<faction>_seen_<member>` (code int, derived in the latch pass): it takes a move
  when the member was present at its boundary, or when the move says `faction`. v2.8 44 rumors may later carry a move
  to an absent member. The player-facing band reads the true standing.
- **Membership.** `roster[].factions: [id]` (at most 3 per member). A faction with no member is allowed (a crown that
  never speaks).
- **Member line.** A drafted member of faction F gets, in its private block after its own relationship lines:
  "Your group, The Guild, regards the player as: Wary (as far as you have heard). Let it colour how you open toward
  them; your own feelings come first." The band word of the member's perceived standing, never the number. Members of
  several factions get one line each. Payload invariance: a story without factions sends byte-identical member blocks.
- **Director hint.** `renderDirectorPrompt` gains a list "How groups regard the player (world pressure may follow from
  this)": one line per **visible** faction with its band word. Hidden factions are not sent (decision 4 revised). A
  faction may set `introduce: true`: the director then receives its name alone, marked "the player has not met this
  group; you may introduce it", with no band, members or lore.
- **Player view.** A faction is visible when `visible_when` holds (default: always). `GameView` gains `standing:
  [{name, band}]` for visible factions, shown as a "Standing" group on the Stat sheet; `roster` widget
  rows may name a faction (`faction: "<id>"` instead of `quality`) and then show its band word (`rosterBody` extended
  to read bands). No numbers; `trend` refused on standing by default (decision 3).
- **Band crossing.** `{q: "rep_guild", op: "<=", v: -3}` is an ordinary gate, so an author reacts to "Hostile" with a
  transition, a quest offer or a `when` on a widget row; no on-cross hook.
- **Validator.** Bands as `readBands` (ascending, last open, cover the range); unknown faction id in `roster[].factions`
  or `faction` widget rows refused; a move gate true at start refused; a negative move on inaction refused (above);
  `display.public` on `rep_*` refused (the band projection is the one player route); a `rep_*` key authored as a
  quality refused; a `reward.set` or move that targets `rep_*_seen_*` or a move latch refused.
- **Extraction.** Move gate keys join the shared `discovery` scope source (v2.8 52), budgeted with rotation, so a gate
  on a read key is asked.
- **Author view.** A Factions panel row per faction: number, band, moves fired (boundary + message id), members; in
  the lazy Blackboard tab next to `CharacterLifePanel`.
- **Studio + wizard + guide.** Factions editor under Characters (bands editor reused from the quality display editor,
  moves with the gate builder, member pickers); mutation `setFactions` and a `factions` field in the character-life
  tool for membership; wizard tool `set_faction`; guide topic `factions` (+ `npm run docs:guide`); diagnostics
  `faction-never-moves` (no move and no reward writes it) and `faction-no-visible-band`.
- **Feature registry.** `factions` (area characters, audience player) in `src/features/lifeFeatures.ts`, on by
  default; story toggle `display.standing` (default on).
- **Ledger.** Unchanged; the author panel shows ledger `faction` rows whose entity name equals a faction's `name`
  next to it, as context only.
- **Bundle.** Lazy game-layer chunk; the director change is a few prompt lines in its existing lazy chunk.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| F1 | No number: player view, Stat sheet DOM, roster rows, player Ask projection and log contain no standing value, range or trend (≥ 500 random blackboards) | 0 hits | D |
| F2 | Hidden faction: a faction whose `visible_when` is false is absent from every player surface and count; page byte-identical with and without it | 0 leaks, identical | D |
| F3 | Move once ever: each move adds exactly once across gate flapping, and never again after its gate turns false and true (property test) | 100 % | D |
| F4 | Rollback ≡ replay of `rep_*`, `rep_*_seen_*` and move latches over 4 seeds (swipe, edit, delete, reopen) plus a code-only boundary (SC1) | 4/4 + 1 | D |
| F5 | Payload invariance: no factions → byte-identical member blocks, director prompt and read prompt | 0 undeclared hunks | D |
| F6 | Member line scope: only members of a faction receive its line (drafted-member property) | 0 strays | D |
| F7 | Personal vs institutional: 10 paired lab scenes, same member with warm personal `rel_*` toward the player, faction band Hostile vs Trusted; rater (blind) identifies which opening shows institutional distrust while keeping personal warmth | ≥ 8/10 | RP + CL |
| F8 | No inaction punishment: 10 scripted lab runs where the player ignores a faction's request, including a story that authors a punitive move on the unmet request (refused by the validator, `faction-move-on-inaction`); standing unchanged in all 10 | 10/10, planted move refused | D (scripted) |
| F9 | Director uptake: 10 director turns with one visible Hostile faction; rater marks "world pressure from that faction appears or is set up" | ≥ 5/10 (informational) | CL |
| F10 | Clamp: every writer (move, quest `reward.set {add}`, a planted future writer) keeps `rep_*` inside its range over ≥ 1,000 random sequences; the move latch exists iff its add applied | 100 % | D |
| F11 | Hidden faction never reaches the director: with `visible_when` false and no `introduce`, the faction's name, band and lore are absent from the director prompt; with `introduce: true` only the name is present (prompt golden) | 0 leaks | D |
| F12 | Feature-only fixture: a story whose only game feature is factions renders the Standing group (SC4) | holds | D |
| F13 | Hearing: a member absent at a `heard_by: "present"` move keeps its prior band in its line; a `faction` move reaches every member (property) | 100 % | D |
| F14 | Move scope: move gate keys are offered by the `discovery` scope source within the rotation bound; control starves | 100 %, control fails | D |

Lab stories only; never Adolion; the owner spot-checks synthetic rows only.

## Gates by tier

- **D:** `npm run gates` (validator, derive moves, clamp, projection, F1–F6, F8 properties; Storybook for the Stat sheet
  Standing group, roster faction rows, Factions author panel, Studio editor); payload goldens (F5); guide and tools
  coverage tests; a no-model lane scenario: a move fires on a seeded gate, the band word changes on the Stat sheet,
  swipe reverts, reopen identical; `so-ui.mts assert-player-clean`.
- **RP + CL:** F7, F9 in the final v2.8 real-LLM suite (v2.8 00 rule 8), run header diffed around the batch.

## Privacy/spoiler notes

- Words, never numbers (F1). Bands that are too fine reveal the number; the guide recommends 3–5 bands.
- A hidden faction leaks nothing: not a row, not a count, not a "?" (F2, G1, T5).
- The member line names only the band and the member's own faction; it says nothing about other factions.
- The director receives visible factions only, and a name-only line for a faction the author marked `introduce`.
  Hidden faction lore never enters its prompt (F11); a prompt rule is not evidence of secrecy once generation can
  surface it.
- No `changedAgo` or any recency field reaches a player surface: it would reveal hidden movement.
- Standing is authored state, not memory, so held-secret filtering does not apply; the member line still passes
  `withoutSecretLines` for that member.
- No Adolion content in this plan, fixtures or reports.

## Dependencies and links

- **v2.8 51 relationship labels:** personal, directed, extractor-read feelings (51/v2.7 37 L1) versus collective,
  code-moved standing (53). A member holds both; the member line says personal feelings come first. Both share the
  "words, never numbers" property (51 R3, 53 F1).
- **v2.8 52 codex:** a faction may get a codex entry; its band word could show there (52 unresolved question).
- **v2.7 36** (built): `display` bands (G6), `roster` widget, quest `reward.set`, Stat sheet.
- **v2.7 37** (built): derive seam, private block, step rule, seeded starts.
- **v2.8 22** living director: hint list (decision 4).
- **v2.7 35** world pressure: a faction band can gate pool complications (author's choice; no new coupling).

## Decisions for the owner

1. **Option A (authored moves, code-moved standing, band words)?** **Recommended: yes.**
2. **Extractor-read nudges (B) later?** **Recommended: not now; measure after A ships, behind its own switch.**
3. **Trend arrow on standing for players?** **Recommended: off; refused for `rep_*`.** It tells the player a hidden
   move fired. `changedAgo` is dropped for the same reason.
4. **Does the director see factions the player has not met?** **Recommended: no** (revised 2026-10-14). Only visible
   factions; a faction marked `introduce: true` reaches it as a name only, so the world can still introduce it.
5. **Field name `factions` (player copy "Standing")** rather than `groups`? **Recommended: `factions`.** "Group" already
   means the SillyTavern group chat everywhere in this codebase.
6. **Faction rows in the `roster` widget** (extend it) rather than a new widget kind? **Recommended: extend `roster`.**
7. **Do members know every standing change at once?** **Recommended: no.** Per move `heard_by` (default `present`);
   `faction` for public acts.
8. **Range clamp in `Blackboard.applyDelta` for every code int with a `range`** (not a faction-only clamp)?
   **Recommended: yes.** One place covers every writer.

## Unresolved questions

- Do members of a faction react to a band change at once (an `npc_replies` hook), or only through gates the author
  writes? Proposed: gates only (no hidden hook).
- Should a member's own `rel_*` toward the player start from its faction's standing? Proposed: no; independent starts.
- Should standing between factions (guild vs crown) exist? Out of scope; one standing per faction toward the player.
- Cap values (3 factions per member, range width) are placeholders until the editor is drawn.

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 48-53, checked on master `3a716f2b`. Shared findings resolve through the
shared contract in v2.8 52 §Review 2026-10-14 (Astra): SC1 rollback detectors (F4), SC2 order (moves are step 5 after
quest rewards, re-run at step 7), SC3 disclosure (member perceived standing; director gets disclosed factions only),
SC4 feature-only fixture (F12).

- **P1 Snapshot writes are a false claim.** Confirmed: `state_snapshot` is read by the critic, planner and scope
  (`src/generation/critic.ts:40,55`, `src/generation/planner.ts:87`, `src/extraction/scope.ts:69`); `commitBoundary`
  applies only transition progress and card entry on entry (`src/engine/engine.ts:259-271`). → Removed. Standing moves
  only through authored moves and quest `reward.set`; the validator warns on a `rep_*` key in a snapshot. A general
  state-write facility is v2.8 50's entry pass (SC2 step 7, `effects.time` only); extending it to `set` is a separate
  decision, not taken here.
- **P1 Bounds are not enforced by existing writes.** Confirmed: `applyDelta` has no range check
  (`src/engine/blackboard.ts:71-95`); `applyQuestRewards` adds directly (`src/engine/quests.ts:79-80`). → One clamp in
  `applyDelta` for code int qualities that declare `range` (decision 8); the move latch is written only when its add
  applied. Floor F10.
- **P1 Move gates need extraction scope; "after quest rewards" needs the ordering change.** Accepted. → Move gates
  join the `discovery` source (F14). The latch pass is SC2 step 5, after step 4 quest rewards; that ordering is now
  explicit rather than assumed from the derive seam (which runs before rewards, `engine.ts:482-483`).
- **P1 Spoiler tests do not protect arbitrary hidden factions.** Confirmed: the director's secret guard is the resting
  memory filter (`src/runtime/livingInputs.ts:43`, `src/generation/living/guard.ts:30-41`); authored faction lore is
  not a memory row. → Hidden factions are not sent; `introduce: true` sends a name only. Decision 4 revised; F11.
- **P2 F8 permits the forbidden behaviour.** Accepted. → A negative move must gate on an affirmative, evidenced event
  (validator rule `faction-move-on-inaction`); F8 now plants a punitive move and requires its refusal.
- **P2 Once-only and knowledge semantics.** Accepted. → Once ever (F3 reworded). Membership is not omniscience:
  per-move `heard_by`, per-member perceived standing (F13, decision 7). `changedAgo` dropped.
- **Cheaper design** (authored moves, visible band words, roster widget, personal feelings independent; defer
  extractor nudges and hidden hints). This is now the plan. **F7** tests personal warmth vs institutional distrust.
- **Brainstorm: standing affecting access, greetings, competing invitations; a friendly individual bending an
  unfriendly institution's rule.** Access and invitations are v2.8 56 (social permissions, candidate), which can gate
  a permission on a band; F7 covers the individual-vs-institution split.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted). First verified against master `9e96871d`; revised 2026-10-16 on `e8b9dd6d` after `review-astra-harvest-2026-10-16.md`. The owner decides with the rest of this plan.

- **H4 P3 one clamp for every int writer, from display bounds** (`docs/plans/v2.8/extension-research-2026-10-14/st-gamemaster.md` P3, 3/S). **Built** with this plan:
  `Quality.range` from `display.min/max` on authored int/float qualities (`src/engine/validate/display.ts:76`, the only
  display-to-range path, called from `src/engine/validate/qualities.ts:223`) or the compiled faction or relationship range
  (`src/engine/validate/factions.ts:83`, `src/engine/validate/life.ts:117`); `Blackboard.applyDelta` clamps every write before
  the type check (`src/engine/blackboard.ts:94`); the display-time clamp is gone (`src/runtime/gameSheet.ts:29`). Owed tests:
  (a) **range precedence** pinned: a compiled quality never takes a display range, and an authored quality has no second range
  source (today the sources cannot overlap; the test keeps it so); (b) **initialization**: an initial or start value outside
  the range is refused at validation or clamped at seed, and the test pins which.
- Cross-check (`docs/plans/v2.8/extension-research-2026-10-14/rpg-companion.md` P7): faction rows through a `roster` widget omit `changedAgo` (built: band word while
  visible, no `changedAgo`; plan 60 B18 refuted as drift).

## Gate record

Built 2026-10-14/15 on branch `v2.8-p53-reputation` (base master `0c283dc6`), option A with the revised design and the
Astra review resolutions; owner: "yes to all from your recommendations". Commits `b2db0376`, `0dbdf386`, master merges `40ae5280` and `2250d0cb` (plans 46, 60, 52 SC1–SC5, 47), `799ebb6c`, and this record.

What was built

- `factions[]` (`engine/factionSchema.ts`, `validate/factions.ts`) compiled to code ints `rep_<id>` (range + start, seeded),
  `rep_<id>_seen_<member>` per member of `roster[].factions` (at most 3), `rep_<id>_move_<move>` (monotonic, the boundary
  it fired). Faction and move ids are slugs without underscores.
- Moves (`engine/factions/standing.ts`): an SC2 latch writer `factionLatches` in `GAME_LAYER.latchWriters` (step 5 after
  quest rewards, again at step 8 after entry), computed by the atomic `applyFactionMoves` on a scratch blackboard; once ever, the first boundary the gate holds; the record is
  written only when the add applied; `heard_by` present (not away by the member's schedule) or faction; seen values take
  the move's add, clamped. Quest `reward.set {add}` still moves `rep_*`. `state_snapshot` never writes standing (Studio
  warning `faction-snapshot-key`).
- One clamp: `Quality.range` (from `display.min/max` on any int/float, or a faction range); `Blackboard.applyDelta` clamps
  every write into it before the type check and reports `clamped: true`; the display-time clamp in `gameSheet.ts` is gone.
  Compatible with B16 (reward add vs `step_rule`, branch `v2.8-harvest-defects`): `quests.ts` untouched.
- Inaction rule (`faction-move-on-inaction`, validator error + Studio blocking diagnostic): a lowering move whose gate is a
  top-level `not`, reads only time keys (`TIME_KEYS`, clock keys, agenda waits, mood ages), or has a leaf `== false`,
  `!= true` or `==` the quality's start value is refused. Also refused: a move gate true at start, unknown/duplicate
  membership, an authored `rep_*` quality (when factions are declared), `display` on `rep_*`, a reward on a seen key or a
  move record, `|add|` over the range width.
- Member line in the private block after the member's own relationship lines (`life/lines.ts`), band word of the member's
  perceived standing, through `withoutSecretLines`; member blocks are staged for a factions-only story too.
- Director: "How groups regard the player (world pressure may follow from this)" lists visible factions with their band;
  a hidden faction only with `introduce: true`, by name alone; no list without factions.
- Player view: `GameView.standing [{name, band}]`, a "Standing" group on the Stat sheet (word items, no value/min/max/trend/
  changedAgo), `roster` widget rows with `faction` (band word while visible, no `changedAgo`), story toggle
  `display.standing` (default on). `hasGameLayer` counts factions (SC4).
- Author view: Factions panel in the Blackboard tab (number, range, band, hidden marker, members, moves with boundary and
  message id, matching ledger `faction` rows as context, scope overflow).
- Extraction: pending move gate keys are discovery units (`factionDiscoveryUnits` in `GAME_LAYER.discoveryUnits`, as facts),
  so they ride 52's budgeted `discovery` source; the Factions panel lists the left-out ones.
- Rollback: a `factions` entry in `ROLLBACK_DETECTORS` (every `rep_*` key), so the SC1 guard covers the compiled keys.
- Studio: Factions editor under Roster (bands as JSON like the display editor, moves with the gate builder, member
  checkboxes); mutations `setFactions`/`addFaction`/`updateFaction`/`removeFaction`/`setMemberFactions`; agent tool
  `setFactions`; `factions` added to `setCharacterLife`. Diagnostics `faction-never-moves`, `faction-no-visible-band`,
  `faction-snapshot-key`, `faction-move-on-inaction`.
- Guide topic `factions` (+ widgets/Stat sheet text), `npm run docs:guide`, `npm run docs:settings`; feature `factions`
  (area characters, audience player, on whenever a story declares factions); architecture note.

Floors (D, jest)

- F1 no number, 500 random blackboards (`runtime/factions.review.test.ts`, `engine/factions/factions.test.ts`): 0 hits.
- F2 hidden faction byte-identical player view: holds.
- F3 once ever, 200 seeds of gate flapping: 100 %.
- F4 rollback ≡ replay, 4 seeds + reopen; code-only boundary seen by the detector (`shouldRollbackFromMessage` true):
  4/4 + 1. Live: swipe of the move's reply rewinds standing, the record and the member line; reopen equals both states.
- F5 payload invariance in jest: a non-member's private block, the read scope and the director prompt are unchanged
  without factions. Payload goldens (`so-payload-golden`) not captured: owed.
- F6 member line scope, 100 seeds: 0 strays, no digits.
- F8 planted punitive move on an unmet request refused (+ four other inaction shapes): holds.
- F10 clamp, 1,000 sequences (moves, direct code writes, a planted out-of-range writer): 100 %, record iff applied.
- F11 director prompt: hidden faction absent; `introduce` sends the name only: 0 leaks.
- F12 feature-only story renders the Standing group; a story with nothing stays null: holds.
- F13 hearing (absent member keeps its band, faction-wide move reaches all): 100 %.
- F14 move gates offered by the `discovery` source within ceil(moves / cap) rotations; control without it starves: holds.
- SC2 writer ≡ atomic pass over 200 seeds (`factionLatches` deltas equal `applyFactionMoves`).
- SC2 order: a quest reward earns a move in the same boundary (step 4 then 5); a move gated on transition progress
  lands in the firing boundary (step 7).

Gates (2026-10-14, worktree `C:\dev\so-p53-reputation`)

- `npm run gates:quick`: typecheck, typecheck:test, lint, jest related (6,549 passed) green after fixes; its
  `defect replay (--cached)` step fails in this fresh worktree with no `.build/defect-replay-cache.json`
  (`jest --listTests --findRelatedTests` over every tracked file exceeds the Windows command line, empty stderr; tooling,
  not this change). The full replay below is green.
- `npm run gates -- --jobs=2 --no-storybook` on `799ebb6c` (after the master merges): all green in 265.1 s: test (8,684
  passed, 1 skipped), build, test:debug, test:replay (32 of 32 killed), typecheck, typecheck:test, debug:typecheck, lint,
  test:release, test:plugin. Earlier runs before the merges: green (8,436 and 8,483 tests).
- Storybook: gates hardcode port 6006 (taken by other agents), so `npm run storybook:build`, then `http-server .sb-static
  -p 6153` + `test-storybook --url http://127.0.0.1:6153 --maxWorkers 2`: 862 of 862 tests in 141+ suites passed on the merged build (earlier pre-merge run 846 of 846).
- Main bundle 1,293,107 B after the merges (budget 1,300,000; this plan adds about 3.3 KB to the main entry, the rest is
  master's growth): game-layer code rides the lazy game-layer, composer and Studio chunks. Headroom is now under 7 KB.

Live (no-model lane)

- Isolated ST code copy `C:\dev\st-p53` (from `st-v28-nomodel`, `node_modules` junctioned), lanes root
  `C:\dev\so-p53-lanes`, lane 53 (port 8153, CDP 9353) seeded from the offline lane copy `so-nomodel-lanes/44`. Owner ST,
  lane 0, port 8000 and the 3090 untouched; nothing staged into the owner's ST.
- `ST_ROOT=C:/dev/st-p53 SO_LANES_ROOT=C:/dev/so-p53-lanes node scripts/debug/st-lanes.mts run 53 --
  scripts/debug/so-scenario.mts run test/scenarios/v28-53-factions.json --sandbox --group 'Group: Arin, DM Narrator'`,
  twice on the pre-merge build and twice again on the merged build `799ebb6c`: 23/23 steps every run, cleanup and residue
  clean (evidence `so-p53-lanes/53/debug/runs/2026-10-15T01-08-50-059Z-so-scenario-run`, `…T01-09-29-969Z-…`). Covers: hidden until met,
  band "Neutral" on the Standing group and in Arin's applied private block, move to "Hostile" once, `assert-player-clean`
  0 findings in player mode, reopen identical, swipe rewinds standing, record and line, second reopen identical.
- A first run failed at the post-swipe line check (the harness read the member block before the rollback's injection
  refresh); the scenario now waits on the refreshed line. Not a product fault: rollback calls `updateInjection`.

Deviations

- Built first against no shared contract, then fitted after 52 landed: the interim inline detector, private latch pass
  and own `faction` scope source were replaced by the `ROLLBACK_DETECTORS` entry, the latch writer and discovery units.
- Factions do not project through 52's `knownEntities`: a faction is disclosed by its own `visible_when` only; no codex
  page is added for factions.
- Master's `runtime/types.ts` was at 601 effective lines after the 47 merge (S3 red on master); fixed here by folding a
  duplicate `@engine/index` import; `factionsAuthor` joins `RuntimeSnapshot` by module augmentation in
  `factionSnapshot.ts` to keep `types.ts` and `schema.ts` within budget.
- "Present" for `heard_by` is "not away by the member's schedule" (engine-pure); a member switched off in the group still
  hears.
- H4: the range comes from `display.min/max` (no authored `range`), so the "display bounds without a range" warning is moot.
- An authored `rep_*` quality is refused only when the story declares factions.
- `guideTopics.ts` moved `character-life` + `factions` into `guideTopicsCharacters.ts` to stay under the S3 file budget.
- No `faction-scope-overflow` setup check: the Factions panel lists the left-out keys.

Owed

- F7 (RP + CL) and F9 (CL) in the final v2.8 real-LLM suite.
- Payload goldens for F5 on a lane.
- Adolion: not changed (lab stories only); whether the campaign uses factions is the owner's call, content review by
  another model.

Unresolved questions

- `storyDiff` has no faction case: a move whose gate is rewritten keeps its record by id (52's `(id, rev, gate)` identity
  would fit).
- Should a group-disabled member hear a `present` move?

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §Addenda requiring correction. Verified on `e8b9dd6d`.

- **P2 — reconcile with the built implementation; keep explicit range precedence and initialization tests.** Accepted. →
  addendum marked built with file:line; precedence and initialization tests listed as owed.
- Rebutted: none.
