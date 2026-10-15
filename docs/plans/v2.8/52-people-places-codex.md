# Plan 52 — People and Places codex

**Status (2026-10-14): option A + shared contract SC1–SC5 BUILT on `v2.8-p52-codex` (not merged); D floors green as jest;
C7 (CL) and the live lane gate owed; B and E not built (see §Gate record).** Owner decision 2026-10-14: plans 51–53 go
into v2.8 and are written now; owner 2026-10-14: "yes to all from your recommendations".
Source row: v2.8 27 report G24 ("typed entity pages (people/places) with `known_when`"; target "new seed (Journal
People/Places, v2.8 04)"). Gate tiers (v2.8 00 §Gate taxonomy): implementation **D**; acceptance **D** + **CL**
(the wizard writes codex entries on the authoring route; optional fact route on the read model) + **RP** only if the
fact route is on. Overview: `docs/plans/v2.8/00-overview.md`. Not in `32-queue.md` yet (the owner queues it).
**Revised 2026-10-14 against the Astra review** (`review-astra-2026-10-14.md` §Plans 48-53): §Review 2026-10-14
(Astra) records each finding and its resolution, and holds the **shared contract** plans 48–53 cite. Where older text
and that section differ, the section wins.

## What it is

- Two new Journal pages, **People** and **Places**, that fill in as the player learns. Each page entry is a person
  (a roster member, or someone who never appears on stage) or a place, with a short list of **facts**.
- Every fact has a `known_when`: a gate over story qualities, or a checkpoint the chat has reached. Until it holds,
  the fact does not exist for the player. Once it holds it latches, so a later gate change never "forgets" it; only
  a rollback of the reply that earned it removes it.
- An entry appears only when at least one of its facts is known, or when its own `known_when` holds. An entry with
  nothing known is not sent, not listed and not counted.
- Facts come from the **author** (the story record). Optionally, a second route adds **accepted memory facts** that
  name the entry, filtered through the resting view so a held secret never reaches the player.
- Projection-only, as v2.7 36 decided: the composer builds the player view from what is known; nothing hidden is
  shipped to a component to be hidden there (trap T5). Counts come from the projection (G1).
- Authoring: a Studio editor, wizard tools, guide topics and validator diagnostics.
- Group chats only (v2.7 03).

## History and evidence

| # | Source | What it says |
|---|---|---|
| 1 | `docs/plans/v2.8/27-gamification-report.md` G24 | typed entity pages with `known_when`; spoiler risk; value 3, effort M |
| 2 | `docs/plans/v2.8/gamification-research/monks-enhanced-journal.md` §How it works | person/place/organization sheets; per-field `shown` switch; GM-only tabs; filtering on the client over the whole document |
| 3 | same, rubric row "Typed entity pages" | "spoiler risk (unmet NPCs)", "declarative (roster + `known_when`)", "new plan seed (Journal People/Places)" |
| 4 | v2.8 27 report §Traps 5 | render-time hiding and hidden counts (FQL `countHidden`) |
| 5 | v2.8 27 report G1, v2.7 36 §Spoiler property | counts from the projection; no empty section; page byte-identical with and without hidden items |
| 6 | v2.8 27 report G25, guide `clues-and-maps` | the `map` widget's pins already gate on `checkpoint` or `when` and are "not sent to the panel at all" until shown |
| 7 | `docs/plans/v2.7/37-character-life.md` L1 | relationships author-only; meters refused for players |
| 8 | `.claude/rules/architecture.md` §Memory and privacy | every shared text built from memory, including the player's Memory tab, renders through the resting view |
| 9 | `docs/plans/v2.9/02-sp9-witness-filter-v2.md` §Current state | no witness source exists; presence is "not hearing" |

## Current state in code

Verified on master `211d8d96`.

- **No codex exists.** No `people`, `places` or `codex` field in `src/engine/schema.ts` or `src/engine/gameSchema.ts`.
- **Gates are quality-only.** `GateNode = GateLeaf | GateAll | GateAny | GateNot`, `GateLeaf {q, op, v}`
  (`src/engine/schema.ts:105-123`). "Reached a checkpoint" is not a gate leaf; the map widget reads
  `visitedPath`/`activeCheckpointId` directly for `pin.checkpoint` (`src/runtime/widgets.ts:227-238`).
- **Location.** The party location is the quality `location` (`PARTY_LOCATION_KEY`, `src/engine/schema.ts:98`),
  used by the scene marker (`src/engine/life/derive.ts:17`).
- **Player game view.** `GameView` (`src/runtime/gameTypes.ts:158-167`) composed in `composeGame`
  (`src/runtime/widgets.ts:287`, lazy game-layer chunk) and sliced by `gameSlices` (`src/runtime/gameSnapshot.ts:30-44`);
  the Journal panel (`src/components/panels/JournalPanel.tsx:23-33`) draws `game.journal` widgets + milestones and
  hides itself when both are empty.
- **Latch precedent.** `quest_<id>_closed` (`src/engine/gameSchema.ts:204`; `src/engine/quests.ts:68-72`); life code
  writes in the derive seam (`src/runtime/stretchTurns.ts:14-18`).
- **Memory facts.** `MemoryEntry {text, entities[], tier, …}` (`src/memory/types.ts:187-212`); the resting view is
  `MemoryInjector.restingEntries` / `restingFilter` (`src/runtime/memoryInjector.ts:282-302`), built on
  `sharedTierView` / `withoutSecretLines` (`src/memory/heldSecrets.ts:59-99`).
- **Ledger.** Entity state rows `[state:Name:type]`, types `character|object|place|faction`
  (`src/memory/contract.ts:54`, `:170-175`); author-view only (`src/memory/ledger.ts`).
- **Player projection.** `playedProjection` (`src/runtime/playerProjection.ts:88-103`) feeds player Ask and v2.7 33
  suggestions; `withheldNames` (`:79-86`) lists unreached checkpoint names and quest titles for the suggestion filter.
- **Guide.** `PENDING_GUIDE_TOPICS` is empty (`src/copilot/guideTopics.ts:453`); every authorable field needs a topic
  (`src/copilot/guideCoverage.test.ts`).

## Options

| | Design | Cost | Risk | Notes |
|---|---|---|---|---|
| **A. Authored codex, latched facts** | story `codex {people[], places[]}`; facts `{id, text, known_when}` where `known_when` is a gate or `{reached: <checkpoint>}`; latched in code qualities | M | authors write facts that name a twist before it is earned | deterministic, rolls back, testable by property |
| **B. A + accepted memory facts** | A, plus per entry `learn_from_memory: true`: live memory facts whose `entities` name the entry, through `restingEntries` | M+ | memory facts can carry what only a member witnessed (no witness source, v2.9 02); wording quality varies | needs the held-secret filter and a witness answer |
| **C. Generated pages** | the read model writes pages from the transcript | L | spoilers from lore the model saw; nondeterministic; a new write path | rejected: stagecraft proposes, never writes |
| **D. Clues widget only** | reuse the `clues` widget per person/place | S | no entity grouping; a wall per person is clumsy | possible today, no new code |
| **E. A + return visits** (Astra brainstorm) | places carry `returns: [{id, when, text}]`: a line on the place page, earned like a fact, that acknowledges a known past event there ("The boathouse door is still splintered"); the model side stays authored checkpoint `world_info` | S on top of A | a return line can name an event the player did not see; same disclosure rule as facts | follow-up row after A (decision 8) |

## Recommendation

**A now; B behind its own switch after v2.8 42's witness answer** (decision 2).

Format (story level, lazy game layer):

```json
"codex": {
  "people": [{ "id": "ferryman", "member": "tom", "name": "The ferryman",
    "facts": [{ "id": "job", "text": "Runs the night crossing.", "known_when": { "reached": "landing" } },
              { "id": "debt", "text": "Owes money to someone upriver.", "known_when": { "q": "heard_debt", "op": "==", "v": true } }] }],
  "places": [{ "id": "boathouse", "name": "The boathouse", "location": "boathouse",
    "facts": [{ "id": "door", "text": "The back door does not lock.", "known_when": { "q": "searched_dock", "op": "==", "v": true } }] }]
}
```

- **Entries.** `people[]` names a roster `member` (name from `castNames`) or a free `name`; `places[]` a `name` and
  optionally a `location` value of the `location` enum. An entry's own optional `known_when` makes it appear with no
  fact (a person met, a place visited). Default for a place with `location`: known once `location` has held that
  value at any boundary. Default for a person with `member`: none (an author states when they are met).
- **Facts.** At most 12 per entry, text ≤ 200 characters, plain text, no macros. `known_when` is a `GateNode`,
  `{reached: <checkpoint id>}` (resolved like a map pin: `visitedPath` + active), or `"start"` (an initially-known
  fact: the player's background, the opening place). Optional `source: <entry or roster id>` (who it came from) and
  `rev` (int, default 1; see §Review C10). Entries take `aliases: [string]` so later routes link by id, never by
  display-name matching.
- **Latch.** The latch pass (shared contract SC2 step 5, and again in step 7 after a transition) writes
  `codex_p_<entry>_<fact>` / `codex_l_<entry>_<fact>` (code int = the boundary it latched, monotonic) and
  `codex_p_<entry>` / `codex_l_<entry>` (entry known) the first boundary the condition holds, never cleared. People and
  Places are namespaced so equal ids never collide. Rollback drops them with the blackboard and the rollback detector
  registry sees them (SC1); replay rewrites them at the same boundary. Story updates: §Review C10 (identity = id + rev
  + gate).
- **Projection.** `GameView.codex {people: CodexEntryView[], places: CodexEntryView[]}`, each `{name, facts:
  [{text, fresh, from?}]}`, built only from latched facts, in authored order. An entry with no known fact and no known
  entry gate is absent. A page (People or Places) with no entry is absent; the Journal tabs reflect only non-empty
  pages; counts ("4 people") count the projection.
- **Relationship labels (v2.8 51).** A person page for a roster member carries that member's projected relations rows
  (public label + revealed secrets). 51 builds onto these pages directly; there is no interim Journal section.
- **Provenance ("learned from…").** `from` is "From <source name>" when the fact names a `source` that is itself known
  (SC3), or "At <checkpoint name>" for a `reached` fact; otherwise absent. Never a gate, key or boundary number.
- **Fresh marker and log.** `fresh` = latched at the last committed boundary (no viewer state is kept); the player log gets kind `learned`
  ("Learned about The ferryman"), and the session journal derives it by diffing `codex_*` keys between boundary
  snapshots. No inline chip by default (decision 4).
- **Extraction.** A `known_when` key no transition or snapshot reads would stay at its start. A budgeted `discovery`
  scope source (shared with 51's reveal gates and 53's move gates) reads, in rotation: the entry's own `known_when` and
  every fact gate of an entry **not yet known** (a first fact can be what makes the entry known), then unknown facts on
  known entries. Rotation phases as `lifeUnits` (`src/extraction/scopeSources.ts:86-91`); `SCOPE_SOURCES` (`:65`) gains it; `BUDGETED` gains it
  (`:79`). Overflow is the author check `discovery-scope-overflow` (degrades). Diagnostic `codex-fact-never-read`
  mirrors `widget-item-never-read`.
- **Studio.** A Codex editor under Story features (People / Places lists, fact rows with the gate builder and a
  checkpoint picker for `reached`), mutations `setCodex` / `updateCodexEntry` in `src/studio/gameMutations.ts`.
- **Wizard.** Tool `set_codex_entry` (create or replace one entry) with the same schema; edits go through review like
  every edit tool; `tools.test.ts` passes because each new mutation has a tool. Recipe: "add a codex page for each
  cast member and the starting place, facts gated on checkpoints the player reaches".
- **Guide.** New topic `codex` in `docs/authoring/story-guide.md` + `src/copilot/guideTopics.ts` (group game-layer in
  `src/features/guideTopicGroups.json`), then `npm run docs:guide`. Good/Bad/If wrong as the other topics.
- **Feature registry.** `codex` (area story, audience player) in `src/features/gameFeatures.ts`, on by default; story
  toggle `display.codex` (default on) beside `display.journal`.
- **Bundle.** Lazy game-layer chunk only.

**B (later).** Per entry `learn_from_memory: true` adds up to 5 live memory facts whose `entities` include the entry's
name, from `restingEntries` (never per member, never the raw store), shown under "From your notes" with no gate
editing. It ships only when decision 2 says the witness question is answered.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| C1 | Spoiler property: ≥ 500 random blackboards/paths over a fixture with ≥ 20 facts on ≥ 6 entries; no unknown fact text, entry name or count in `GameView`, the Journal DOM, player Ask's projection or the log | 0 leaks | D |
| C2 | Byte-identity: player page with and without unknown facts/entries declared | identical, 100 % of seeds | D |
| C3 | Counts: every count shown equals the number of projected rows | 100 % | D |
| C4 | Rollback ≡ replay of `codex_*` latches over 4 seeds (swipe, edit, delete, reopen) | 4/4 identical | D |
| C5 | Read-prompt invariance: a story without `codex` sends byte-identical extraction prompts and payloads | 0 undeclared hunks | D |
| C6 | Held secrets (B only): planted `[hiding]` row about an entry, ≥ 50 seeds; no secret line on any player codex page; control without the row shows the fact | 0 leaks, control passes | D |
| C7 | Wizard authoring: 10 runs of the codex recipe on the authoring route over a lab story; every created fact validates and none is known at the start unless marked `"start"` | ≥ 9/10 | CL |
| C8 | Fact route usefulness (B only): 20 accepted memory facts surfaced on lab pages, second-model rater marks each "player could know this" | ≥ 17/20 | CL + RP |
| C9 | No discovery deadlock: fixture whose every entry starts unknown and whose first facts gate on read keys; with the scope budget at its floor, every entry gate and first-fact key is offered to the read within ⌈units / per-read cap⌉ + 1 reads (rotation property); control without the unknown-entry tier never reads them | 100 % offered, control fails | D |
| C10 | Story edit semantics: an earned fact whose text changes (same rev, same gate) stays shown with the new text; a gate change or rev bump drops the latch and the new text is absent until earned; a removed id is pruned (`storyDiff` cases) | 100 % | D |
| C11 | Rollback coverage: C4 extended with unknown→known entry, a same-boundary checkpoint discovery (SC2 step 7), equal People/Places ids, a hot edit (C10), reopen past 200 logged boundaries, and a code-only boundary (SC1) | 0 mismatches | D |
| C12 | Initially-known facts: `"start"` facts project at boundary 0 and pass C1/C2 (no unknown text alongside them) | 100 % | D |
| C13 | Feature-only fixture: a story with only `codex` renders the codex (SC4); a story with nothing stays `game: null` | both hold | D |

## Gates by tier

- **D:** `npm run gates` (validator cases incl. a fact known at start refused, `reached` on an unknown checkpoint
  refused, duplicate ids refused; derive latch; projection; C1–C5 properties; Storybook stories for People/Places
  pages, empty states and the Codex editor); guide coverage test; tools coverage test; payload goldens (C5);
  a no-model scenario on a lane: reach a checkpoint, a fact appears, swipe, it disappears, reopen, identical; then
  `so-ui.mts assert-player-clean`.
- **CL:** C7 on the authoring route (opencode Sol default), batched; C8 only with B.
- **RP:** only for B (C8), in the final v2.8 real-LLM suite.

## Privacy/spoiler notes

- Hide at projection (T5); the codex component receives known facts only. No CSS hiding, no `???` rows.
- No empty pages, no "3 more to discover" (G1).
- `withheldNames` adds unknown entry names (≥ 4 characters) so a suggestion that names an unmet person is dropped.
- Authored fact text is what the player sees the moment it is known: the guide's Bad example is a fact that names a
  twist under an early gate.
- The fact route (B) only reads the resting view, the same filter as the player Memory tab, and never per member.
- Lore entry names are not used as codex names unless `display.lore_names_public` holds (existing rule).
- No Adolion content in this plan, its fixtures or reports; lab stories only.

## Dependencies and links

- **v2.8 42 (witness):** drafted in parallel (branch `v2.8-plans-42-44`, not on master at writing). The player sees
  the whole chat, but the player's *character* may not have witnessed an aside; a memory fact learned only by members
  should not be a "known" fact. B waits for 42's witness source or for the owner to accept the gap (decision 2).
  `docs/plans/v2.9/02-sp9-witness-filter-v2.md` is the prior record.
- **v2.8 51 relationship labels:** person pages host 51's rows; one projection rule and one spoiler property.
- **v2.8 53 reputation:** a faction may get a codex entry (`people` kind "group"?) — see unresolved questions; 53's
  band word may show on that entry.
- **v2.7 36** (built): Journal panel, G1, log kinds, `display.journal`.
- **v2.8 23 / 27** G24, G25 (map pins share `reached` semantics), T5.
- **v2.7 33** suggestions read the projection, never the codex source.

## Decisions for the owner

1. **Option A (authored, latched, projection-only)?** **Recommended: yes.**
2. **The memory-fact route (B):** build now behind a switch, after v2.8 42, or never? **Recommended: after v2.8 42's
   witness answer; A alone first.**
3. **Codex placement:** tabs inside the Journal panel, or a separate panel in the panel frame? **Recommended: Journal
   tabs (People, Places) beside the existing Journal content; one panel to open.**
4. **"Learned" inline chip under the message:** **Recommended: no chip; log row and new marker only** (a chip per fact
   would crowd the chat).
5. **Place default:** known when `location` has held its value once? **Recommended: yes**, overridable by its own
   `known_when`.
6. **Initially-known facts (`known_when: "start"`)?** **Recommended: yes** (Astra P2); the opening place and the
   player's background are what a codex starts from.
7. **Story edits to an earned fact:** text-only change = editorial correction shown at once; gate change or `rev` bump =
   a new discovery that must be earned again? **Recommended: yes** (§Review C10).
8. **Return visits (option E)** as a follow-up row after A? **Recommended: yes, page-side only.**

## Unresolved questions

- Should factions from v2.8 53 be a third page ("Groups") or entries under People? Decide with 53's owner answer.
- Fact order: authored order, or newest first? Authored order proposed (stable reading).
- Cap values (12 facts, 200 characters, scope cap) are placeholders until the editor and the scope budget are drawn.
- Whether the ledger's `place` state rows (author-only today) could seed place facts for authors in Studio, as a
  suggestion only.

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 48-53. Each finding was checked against master `3a716f2b`; file:line below
is that checkout. Format: finding → verification → resolution.

### Shared contract for plans 48–53 (canonical; 48–51 and 53 cite this section)

- **SC1. Rollback detection for every new writer (Astra P1, shared).**
  - Verified. `rollback.ts:136` rolls the engine back only when `engine.shouldRollbackFromMessage`
    (`src/engine/engine.ts:378-387`) or `livingMovedAfter` says so. The engine test sees a fired transition, a quest
    latch change (`questLatchesMoved`, `src/engine/quests.ts:88-89`), a landed agenda step (`lifeMoved`,
    `src/engine/life/lines.ts:80`, steps only, not arbitrary `life_*`) or an applied read whose window reaches the
    message. A code-derived latch, reveal, standing move, meter fire or time advance on a boundary with none of those
    survives the swipe.
  - Resolution: the hand list becomes one registry `ROLLBACK_DETECTORS` in `engine/` (`{id, moved(story, before,
    after)}`): quests, life steps, and one entry per new writer (`codex_*`, `life_reveal_*`, `rep_*` and move latches,
    story-time keys, meter and complication-phase keys). Guard `rollbackDetectors.guard.test.ts`: every reserved
    code-key prefix the validator compiles has a detector; a planted prefix without one fails. Every plan's rollback
    floor adds a **code-only boundary** seed (the only change at the swiped boundary is that plan's derived write).
- **SC2. One evaluation order (Astra P1, shared).**
  - Verified. `commitBoundary` (`engine.ts:244-283`): drain (`:252`) → `refreshMechanicalQualities` (`:253`, body
    `:470-484`: counters, `host.derive` on the **pre-transition** view `:482`, `applyQuestRewards` `:483`) →
    `selectFiring` (`:257`) → on fire, transition progress + card entry (`:259-271`). Entry `effects` go back to the
    runtime for host work; `state_snapshot` is never applied (no call site outside validation, critic, planner, scope).
  - Resolution, one order written once in `commitBoundary` and added to `architecture.md` when built:
    1. drain queued reads;
    2. mechanical counters;
    3. derive (life, chance, clock read-steps, meters, complication phase);
    4. quest closes and rewards;
    5. **latch pass** (codex, label reveals, standing moves), reading the values after 4, so a reward can earn a fact
       or a move in the same boundary;
    6. transition select, one per boundary (unchanged); it may gate on latches from 5;
    7. only on a fired transition, **entry pass**: the pure state part of entry effects (`effects.time`, v2.8 50),
       `time_reached_<cp>`, then the latch pass again so `reached` facts land in this boundary.
  - Deliberately not extended: derive and quest rewards do not re-run after entry (they see the new checkpoint next
    boundary, as today), and there is never a second transition. Each plan names the step its writer occupies.
    `boundaryOrder.test.ts` pins the sequence with one planted writer per step.
- **SC3. Disclosure is not knowledge (Astra P1, shared).**
  - A player surface shows what an authored gate has **disclosed** (a latch). Being on stage, appearing in an open arc
    or passing the resting filter is not disclosure. Disclosure to the player gives no member knowledge (no epistemic
    row, no shared tier).
  - Authored disclosure text has its own rule: diagnostic `disclosure-names-unknown-entity` (warning) when fact, label,
    band or return text names an entry or roster member (name or alias) not known at that gate; the guide's Bad example.
  - **Entity-discovery projection**, one pure function `knownEntities(story, values)` owned here: an entry is known by
    its latch; a roster member with no entry is known while enabled in the group (SillyTavern already lists the
    group's members to the player); anything else is unknown. 51's labels, 53's factions and these pages project
    through it.
- **SC4. Feature-only fixtures (Astra P2, shared).**
  - Verified. `hasGameLayer` (`quests.ts:33-34`) checks quests, milestones, widgets and displayed qualities;
    `gameSlices` returns `game: null` otherwise (`src/runtime/gameSnapshot.ts:28-32`). A story with only a codex,
    labels or factions would render nothing.
  - Resolution: `hasGameLayer` gains `codex`, labelled relationships and `factions`. Each plan carries a fixture story
    with only its feature (it renders) and one with nothing (stays `null`): C13 here, R10 in 51, F12 in 53.
- **SC5. Bookkeeping (Astra P2).** Plan 24's matrix lacks 48–53 and its rule 5 still says dark launch (confirmed by the
  review). Not edited on this branch (the owner indexes); flagged. A D-floor miss is a defect to fix; a CL/RP miss is
  recorded and the feature stays on (00-overview rule 9).

### Plan 52 findings

- **P1 Discovery can deadlock** (scope read only unknown facts of known entries). Verified against the plan text
  (old §Recommendation, Extraction) and the quest precedent (`quests.ts:45`: hidden quests scope their activation
  gates). → The `discovery` scope source reads unknown entries' own gates and every first-fact gate, with bounded
  rotation. Floor C9 (with a control).
- **P1 Keeping a latch by id can expose rewritten content.** Verified: `storyDiff` has no codex case; `diffQuests`
  (`src/engine/storyDiff.ts:322-337`) shows the pattern (earned reward kept, change reported). → Identity is
  `(id, rev, gate)`. `diffCodex`: text-only change = editorial correction (`codex-fact-edited`, compatible, shown);
  gate change or `rev` bump = new identity (`codex-fact-replaced`, compatible, latch pruned through `pruneEngineState`,
  earned again). Floor C10, decision 7.
- **P2 Rejecting facts known at start.** Accepted. → `known_when: "start"`; a gate that already holds at start becomes
  a warning that suggests `"start"`, not a refusal. C7 reworded; C12 added; decision 6.
- **P2 Plan 42 is necessary, not sufficient, for B.** Accepted. → B additionally needs: per-fact provenance (the
  message ids it derives from); for each, evidence that the **player character** was present (42's witness record gains
  `player: present | absent | unknown`); every message `present`, else the fact is not "known"; entity linking by entry
  `id` + `aliases`. B stays later (decision 2 unchanged).
- **P2 Four rollback seeds are weak; `fresh` undefined.** Accepted. → C11 (extended seeds incl. truncation and a
  code-only boundary); `fresh` = latched at the last committed boundary, no viewer state.
- **Recommendation "learned from…" provenance.** Adopted: authored `source` (shown only when known, SC3) or the
  `reached` checkpoint name. The latch value is the latch boundary, which orders `fresh` without new state.
- **Brainstorm: return visits.** Folded in as option E (decision 8). **Evidence notebook** (source, correction): the
  `from` line is its first step; "heard a rumour" vs "established" waits for 44's player surface and B.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted); verified against master `9e96871d`. Not built; the owner decides with the rest of this plan.

- **H16e structural name fold for ledger and epistemic keys** (`docs/plans/v2.8/extension-research-2026-10-14/dooms-enhancement-suite.md` P2, 3/S–M). `ledgerKey` is
  trim + lowercase (`src/memory/ledger.ts:23-24`), the epistemic subject key the same (`src/memory/epistemic.ts:18`), so
  "Mara", "Mara Venn" and "the captain" are three subjects. Recommended for the shared contract: one read-only resolver
  (roster `aliases` + card name + this plan's entity aliases → roster id) applied to ledger and epistemic subjects at write
  time, ambiguous names left unresolved (never guessed). Floor: alias fixture 100 % resolved, 0 merges of two distinct
  members, D. Same resolver answers the v2.4 harvest's open "same character?" idea (`docs/plans/v2.4/extension-research/SUMMARY.md`
  theme 7, dooms/smart-memory): an unresolved name seen in ≥ 3 reads becomes an author-only "same character?" card (merge or
  keep apart); never merged automatically.
- **H14b "lasting identity, not scene events"** for codex facts (same rule as the v2.8 11 addendum): a discovered fact
  describes something that stays true. Prompt rule + C7 fixture row, CL.

## Gate record (2026-10-14, branch `v2.8-p52-codex`, merged with master `837d96e0`)

Built: option A with the owner's recommended decisions (1 A yes, 2 B later, 3 Journal tabs, 4 no chip, 5 place
default yes, 6 `"start"` yes, 7 text = correction / gate or rev = rediscovery, 8 E as a follow-up row), the shared
contract SC1–SC5 and the harvest addendum (H16e name fold + "same character?" card, H14b prompt rule).

What landed:
- SC1: `engine/rollbackDetectors.ts` (`ROLLBACK_DETECTORS` quests / life steps / codex, `ROLLBACK_EXEMPT` with reasons);
  `shouldRollbackFromMessage` asks the registry; `rollbackDetectors.guard.test.ts` fails on a compiled code key neither
  covers (planted control `zz_new_writer_latch`), plus a code-only-boundary seed.
- SC2: `BOUNDARY_STEPS` in `engine.ts`; latch pass after quest rewards (step 5) and again after a fired transition's entry
  (step 7); `activateCheckpoint` runs it after entry too. `boundaryOrder.test.ts` plants one writer per step.
- SC3: `knownEntities` (`engine/codex.ts`); latch pass writes only `codex_*` keys (test); diagnostic
  `disclosure-names-unknown-entity`; rule written into `.claude/rules/architecture.md`.
- SC4: `hasGameLayer` / `usesGameLayer` count the codex; C13 fixture.
- SC5: plan 24 already carries the 48–53 rows and the corrected rule 5 (2026-10-14 rework); 32-queue M52 row updated,
  M52e added for option E.
- Codex: `codexSchema.ts`, `validate/codex.ts`, latches `codex_p_*` / `codex_l_*` (int = boundary, latching, monotonic;
  ids are `[a-z0-9-]`, so keys never collide), `storyDiff` `diffCodex` (edited / replaced / removed, pruned compatibly),
  budgeted `discovery` scope source (`DISCOVERY_SCOPE_CAP` 6, unknown entries first, rotating units; providers are
  `GAME_LAYER.discoveryUnits` so 51/53 can add theirs), check `discovery-scope-overflow`, `GameView.codex` composed
  projection-only (`runtime/codexView.ts`, `fresh`, "From …"/"At …" provenance, `learned` log rows), session journal
  `learned` events, `withheldNames` adds unknown entry names/aliases, Journal tabs (`components/codex/CodexPage.tsx`),
  `display.codex`, Studio `CodexEditor` under Story features, mutations `setCodex`/`updateCodexEntry`/`removeCodexEntry`/
  `setCodexShown`, wizard tools `setCodexEntry`/`removeCodexEntry`, recipe `codex-pages`, Studio diagnostics
  `codex-fact-never-read`, `codex-gate-holds-at-start`, feature `codex`, guide topic `codex`.
- Plan 51 seam: `CodexSources.personRows` → `CodexEntryView.rows` (rendered under person facts); nothing of 51 built.
- H16e: `memory/nameFold.ts` folds ledger character rows and epistemic subject/`hiddenFrom` to the one fitting member's
  card name at write time (roster aliases, card name, first/last word, codex names); ambiguous stays as written; author
  check `same-character` (info) for unresolved names seen in ≥ 3 reads; never merges on its own.

Deviations:
- Tool named `setCodexEntry` (camelCase like every other edit tool), not `set_codex_entry`; plus `removeCodexEntry`.
- `knownEntities` takes the enabled member list as an argument; the snapshot does not carry the group's enabled
  members yet, so "From <member>" shows only for sources that have their own codex entry (members without an entry
  count as unknown until that list is wired).
- `codex-fact-never-read` means: a `reached` checkpoint no path reaches, or a gate on a code quality nothing writes
  (codex gate keys are always offered by the discovery source, so an extractor key is never "never read").
- `guideTopics.ts` hit its file budget: the read helpers moved to `copilot/guideRead.ts`, the topic text to
  `copilot/guideTopicsCodex.ts`; `codexSchema` is re-exported through `gameSchema.ts` (schema.ts budget).
- B (memory-fact route) and E (return visits) not built, as decided.

D floors (jest, all green):
- C1 0 leaks over 500 random paths (view JSON, Journal markup, both pages, suggestion withhold list); C2 byte-identical
  over 120 seeds; C3 counts = projected rows over 200 seeds (`runtime/codexView.property.test.ts`).
- C4/C11 60 seeds rollback-then-replay ≡ straight run, detection complete; same-boundary discovery, equal People/Places
  ids, reopen past 200 logged boundaries, code-only boundary (`engine/codexRollback.property.test.ts`,
  `rollbackDetectors.guard.test.ts`). Control: with the codex detector disabled, 6 of 62 property cases fail.
- C5 scope and pulls identical with and without the discovery source for a story without a codex
  (`extraction/discoveryScope.test.ts`); payload goldens not re-captured (lane gate, below).
- C9 every unknown entry key offered within ⌈10/6⌉+1 reads; control (facts tier only) never reads them.
- C10 `engine/codexDiff.test.ts`; C12 and C13 `engine/codex.test.ts`; SC2 `boundaryOrder.test.ts`; H16e alias fixture
  14/14 resolved, 0 member merges (`memory/nameFold.test.ts`).

Gates:
- `npm run gates -- --jobs=2 --no-storybook` on the merge commit `32844bac`: EXIT 0 (test 8565 passed / 1 skipped,
  test:replay, typecheck, build, typecheck:test, test:debug, debug:typecheck, test:plugin, test:release, lint 0 errors).
- Storybook separately on port 6207 (the npm script hardcodes 6006): `storybook:build` then test-runner
  `--url http://127.0.0.1:6207`: 141 suites, 851 tests passed.
- Earlier pre-merge run: `test:plugin` failed once on `agent.test.mjs` "a stalled OpenCode service…" (15 s timeout
  under machine load, unrelated code); re-run 289/289 passed.
- Main bundle `dist/index.js` 1,282,935 B (budget 1,300,000); codex logic rides the lazy game-layer chunk.

Owed:
- Live gate NOT green: the no-model lane scenario (reach a checkpoint → fact appears → swipe → gone → reopen →
  identical → `so-ui.mts assert-player-clean`) was not run: lanes serve ST's staged slot and staging into the owner's
  ST was not allowed for this task. C5 payload goldens ride the same lane run.
- C7 (CL, wizard recipe ×10 on the authoring route, incl. the H14b "lasting truth" row) not run (no model runs).
- C6/C8 only with B.
