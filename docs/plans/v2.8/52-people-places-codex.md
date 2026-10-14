# Plan 52 — People and Places codex

**Status (2026-10-14): DRAFT, not built.** Owner decision 2026-10-14: plans 51–53 go into v2.8 and are written now.
Source row: v2.8 27 report G24 ("typed entity pages (people/places) with `known_when`"; target "new seed (Journal
People/Places, v2.8 04)"). Gate tiers (v2.8 00 §Gate taxonomy): implementation **D**; acceptance **D** + **CL**
(the wizard writes codex entries on the authoring route; optional fact route on the read model) + **RP** only if the
fact route is on. Overview: `docs/plans/v2.8/00-overview.md`. Not in `32-queue.md` yet (the owner queues it).

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
- **Facts.** At most 12 per entry, text ≤ 200 characters, plain text, no macros. `known_when` is a `GateNode` or
  `{reached: <checkpoint id>}`; `reached` is resolved like a map pin (`visitedPath` + active).
- **Latch.** A derive-seam pass writes `codex_<entry>_<fact>` (code bool) and `codex_<entry>` (entry known) the first
  boundary the condition holds, never false. Rollback drops them with the blackboard; replay rewrites them at the same
  boundary. Story updates keep latches for facts whose id survives (`storyDiff` prunes removed ids).
- **Projection.** `GameView.codex {people: CodexEntryView[], places: CodexEntryView[]}`, each `{name, facts:
  [{text, fresh}]}`, built only from latched facts, in authored order. An entry with no known fact and no known
  entry gate is absent. A page (People or Places) with no entry is absent; the Journal tabs reflect only non-empty
  pages; counts ("4 people") count the projection.
- **Relationship labels (v2.8 51).** A person page for a roster member carries that member's projected relations rows
  (public label + revealed secrets) once 51 ships; 51's interim Journal section is dropped then.
- **Fresh marker and log.** A fact latched at the last boundary is marked new; the player log gets kind `learned`
  ("Learned about The ferryman"), and the session journal derives it by diffing `codex_*` keys between boundary
  snapshots. No inline chip by default (decision 4).
- **Extraction.** A `known_when` key no transition or snapshot reads would stay at its start: add the `codex` scope
  source (like the quest source) for keys of facts not yet known on entries already known, capped; overflow named by
  an author check `codex-scope-overflow` (degrades). Diagnostic `codex-fact-never-read` mirrors `widget-item-never-read`.
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
| C7 | Wizard authoring: 10 runs of the codex recipe on the authoring route over a lab story; every created fact validates and none is known at the start | ≥ 9/10 | CL |
| C8 | Fact route usefulness (B only): 20 accepted memory facts surfaced on lab pages, second-model rater marks each "player could know this" | ≥ 17/20 | CL + RP |

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

## Unresolved questions

- Should factions from v2.8 53 be a third page ("Groups") or entries under People? Decide with 53's owner answer.
- Fact order: authored order, or newest first? Authored order proposed (stable reading).
- Cap values (12 facts, 200 characters, scope cap) are placeholders until the editor and the scope budget are drawn.
- Whether the ledger's `place` state rows (author-only today) could seed place facts for authors in Studio, as a
  suggestion only.
