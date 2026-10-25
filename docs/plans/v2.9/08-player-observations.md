# Plan 08 — Player observations ("You notice…")

**Status: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md`); not built; owner decisions pending.** Implementation
tier **D** (pure engine + runtime + UI, no model call on the play path); acceptance **D** (floors O1–O3, Storybook, no-model
lane scenario, payload goldens unchanged) + **CL** (wizard tool, authoring role) + one synthetic-story task run (O4, owner or
delegated rater, synthetic rows only) + one real-model played row in the batched final suite. New player surface: needs an
explicit owner decision (`docs/plans/v2.8/00-overview.md` §Rules rule 4). Overview rules: `docs/plans/v2.8/00-overview.md` §Rules.

## What it is

- Authored lines the player can **notice**: "The lock has fresh scratches." Each has a disclosure gate; optionally a seeded
  passive check decides whether the player notices it at all (no roll shown, no attempt asked for).
- Once earned it latches, gets one record with a source citation, and shows on the player's own surfaces: a "You notice…" line
  on the story card for the turn it lands, and a "Noticed" section of the Journal.
- **Perception only.** It tells the player what is there to see. It never says what the player feels, believes, concludes or
  does, and it never tells them what to do next.
- **Page-only in v1**: nothing reaches any model prompt. The narrator is not told, no character learns it.
- Not a player inner voice: no named voices, no generated thoughts, no Thought Cabinet. NPC inner voice and thinking are
  untouched (not read, not changed).

## History and evidence

- Triage: `01-triage-sol.md` N22 (§16 Disco Elysium, **PLAN v2.9 08**, P4, M, risks A/K/R: "Start with observations, not imposed
  beliefs or emotions"); §Proposed plan set "08"; build order step 6 ("after the surface and agency decisions"); Challenge 14
  (new-surface value uncertain, request a decision for the bounded observation surface); owner questions 5 and 8.
- Agency: `01-triage-sol.md` G07 (`R/simulation-blackboard` P1, **FOLD v2.8 18 agency contract and v2.8 35 fixtures**): the
  player authors their own feelings, beliefs and conclusions. This plan does not change `PLAYER_ACTION_CLAUSE`; it depends on
  G07's decision and reuses its vocabulary for the observation text lint.
- Research: `docs/plans/v2.8/extension-research-2026-10-21/niches.md` §16 (passive checks add a line with no visible roll;
  proposed `whispers[] {voice?, when, text, passive?}`, seeded draw, latch, rollback detector, player projection only);
  `SUMMARY.md` §4 item 6 (V4, M).
- `R/dooms-enhancement-suite` P1 (player-declared attempt) and P2 (margin word) were considered: neither fits a passive notice
  (no attempt, no narration). P1 stays outside this plan; P2 folds into v2.8 18 per that report.
- **Where sol and the research disagree, this plan follows sol.** The scout proposes optional named voices ("Instinct",
  "Memory") on whispers; sol puts named competing personalities, generated private thoughts and imposed belief/emotion out of
  scope and makes named voices a later owner decision. Reason: G07 (feelings belong to the player), no session evidence for
  player voices (Challenge 14). The schema here has no `voice` field.
- Precedents: seeded checks (v2.8 18), codex disclosure latches and SC1–SC4 shared contract (v2.8 52), clue walls (gated,
  non-latching widget items).

## Current state in code

Verified on `6861d989` (worktree `C:/dev/so-v29-plans`).

- **No player observation format.** `passive`/`observation` appear nowhere in `src/engine` or `src/runtime` outside tests (grep: 0).
- **Seeded checks exist and are the roll precedent.** `StoryCheck` (`src/engine/gameSchema.ts:118-128`): `quality`, `roll`,
  `modifiers`, `narrate: public|hidden`, `when`. `resolveCheck` (`src/engine/storyChecks.ts:37-46`). Draws
  `unitDraw([chatId, storyId, visit, "check:<id>:<die>"])` (`src/runtime/storyCheckDraws.ts:34-35`). Check writes reach the
  blackboard through the host `derive` seam (`src/runtime/chance.ts:65`; `EngineHost.derive`, `src/engine/engine.ts:32`), i.e. in
  the `derive` step, before quests and the latch pass (`BOUNDARY_STEPS`, `src/engine/engine.ts:99`).
- **Records ring precedent**: `extras.checks` records built from the finished boundary entry (`checkRecordsAt`,
  `storyCheckDraws.ts:50-66`), rolled back by message id (`rollbackChecks`, `:73-74`), sanitized on load (`:83-96`).
- **Codex latches are the disclosure precedent.** `CodexFact {id, text, known_when, source?, rev?}` (`src/engine/codexSchema.ts:20-26`);
  key helpers `:55-61`; `codexLatches` (`src/engine/codex.ts:90-95`) run in the latch pass (`latchPass`, `src/engine/engine.ts:511-518`)
  as one of `LATCH_WRITERS` (`src/engine/validate/gameLayerImpl.ts:48`), lazy game layer. The latch view carries `boundary`,
  `values`, `visitedPath`, `activeCheckpointId` only (`src/engine/codex.ts:20-28`): **no chat id**, so the latch pass cannot seed a
  chat-keyed draw today. Discovery-scope units for unknown gate keys (`codexScopeUnits`, `codex.ts:135`; `DISCOVERY_UNITS`,
  `gameLayerImpl.ts:50`; `DISCOVERY_SCOPE_CAP` 6, `src/extraction/scopeSources.ts:13`). Rollback detector `codex`
  (`src/engine/rollbackDetectors.ts:53`). `knownEntities` (`codex.ts:97`). Provenance "From <source>" / "At <place>"
  (`src/runtime/codexView.ts:24-29`).
- **Clues are gated but do not latch**: a clue shows while its gate holds (`src/runtime/widgets.ts:226`), so it is not an
  earned record.
- **Surfaces**: story card `HudCard` shows scene, status line (`src/components/drawer/HudCard.tsx:83`) and launchers for
  `journal | suggestions` (`:8`); Journal panel with codex tabs and milestones (`src/components/panels/JournalPanel.tsx`);
  `MessageCitation` jump links (`src/components/drawer/MessageCitation.tsx`). Registry rows `journal` and `codex`
  (`src/features/gameFeatures.ts:8`, `:43`).
- **Agency text**: `PLAYER_ACTION_CLAUSE` covers words and decisions, not feelings or conclusions (`src/engine/agency.ts:24`); the
  warden reuses it (`agencyNoteText`, `src/judge/warden.ts:115`). Greeting lint already flags "you feel / decide / think"
  (`speaksForPlayer`, `src/wizard/cardChecks.ts:46-49`, used at `:105`).
- **NPC inner voice** is member-side ("What you want / Right now", `src/memory/innerRender.ts:85`); nothing here reads it.
- **Narrator "just happened" lines** exist for visible quest moves and milestones (`JUST_HAPPENED_HEADER`,
  `src/runtime/narratorSheet.ts:8`); the option B delivery below would reuse it.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored observations, latch pass, page-only (rec.)** | `observations[]` with gate + optional passive roll; latch, record, Journal + story card; no prompt change | M | narrator unaware of what the player saw; author must gate on facts the world already holds |
| B. A + narrator "just happened" line | omniscient member gets "{{user}} noticed: …" for one boundary | +S | narrator narrates the player's reaction to it (G07 risk); payload goldens change |
| C. Extend clue walls with latch + passive | `clues[].passive`, latch keys per clue | S–M | ties observations to a widget the story must declare; no story-card line; second meaning for clues |
| D. Disco-style named voices | `voice` per line, voice headers on the card | +M | out of sol's scope; G07; no session evidence |
| E. Nothing | — | 0 | — |

## Recommendation

**A**, in five slices. Each builds and gates alone.

### Slice 1 — schema, validation, latch, rollback (D)

- Story field `observations[]` (game layer), at most `OBSERVATIONS_MAX` 60:
  `{ id, text, when, source?, rev?, passive? }`.
  - `id`: codex id pattern. `text`: ≤ 200 chars, plain (no macros), written as what is there to perceive.
  - `when`: `GateNode | {reached: <checkpoint id>}` (codex `CodexKnownWhen` minus `"start"`; a start-known line is a codex fact).
  - `source?`: a codex entry or roster id, shown "From <name>" once that source is known (codex provenance rule).
- Keys (compiled, code, latching, reserved prefix `obs_`): `obs_<id>` = boundary it was noticed. No authored quality may use
  the prefix.
- Latch writer `observationLatches` added to `LATCH_WRITERS`: an unnoticed observation whose `when` holds latches at this
  boundary. **Frozen-pass semantics**: every writer in a pass reads the one copied values view taken at pass entry
  (`view.values = blackboard.entries()`, `src/engine/engine.ts:516`; `entries()` clones, `src/engine/blackboard.ts:82`), so
  writer order gives no same-pass visibility. A dependency latched in a pass (a codex latch, a label reveal, a quest close
  written earlier in that pass) is visible to observations only on a later pass. The second pass runs only on a fired
  transition (`latchPass` at `engine.ts:266`, second call at `:285` inside `if (fired)` `:272`), so on a no-transition boundary an
  observation gated on a codex latch lands at the next boundary; on a transition boundary it lands in the same boundary through
  the after-entry pass. `reached` gates read `visitedPath`, which is updated before the second pass. No new boundary step and no
  change to the shared latch contract. Same-pass visibility, if ever required, is a separate prerequisite plan changing the
  latch view for every writer, with regression tests for the existing writers (codex, labels, faction moves).
- Rollback detector `observations` (`ROLLBACK_DETECTORS`, prefix match like `codex`) + planted control in
  `rollbackDetectors.guard.test.ts`; rollback seed for a code-only boundary.
- Discovery scope: unnoticed observations' gate keys join the `discovery` units (same cap `DISCOVERY_SCOPE_CAP` 6,
  `src/extraction/scopeSources.ts:13`, rotating), so an observation gate needs no transition to be read. This **changes the
  extraction request** (gate quality names and descriptions, never observation text): declared, budgeted payload hunks.
- Game-layer activation (new-only stories): `observations` joins the load detector `usesGameLayer`
  (`src/engine/validate/gameLayer.ts:25`), parsing and the normalized copy, and `hasGameLayer` (`src/engine/quests.ts:33`, read
  by `storyHasGame`, `src/runtime/gameSnapshot.ts:38`), so a story whose only game content is observations loads the lazy chunk,
  composes `game` and shows the Journal. Feature-only fixture: observations with no codex, quests, checks or widgets.
- `storyDiff`: `diffObservations` (codex rule): reworded `text` with same `when`/`rev` = correction; changed `when`, `passive`
  or raised `rev` = new discovery (latch pruned); removed = pruned.
- Definition identity = `id` + `rev` + hash of `when` and `passive`. Engine pruning alone does not reconcile extras
  (`applyStoryUpdate` swaps after `pruneEngineState` only, `src/runtime/storyUpdate.ts:175-177`), so slice 3 adds an owned
  extras-reconciliation hook run before `swapStory`: same identity keeps the record (reworded text shows as a correction); a
  changed identity drops the record with its pruned latch and `_missed` key; a removed definition moves the record to an
  author-only retired list holding the text as noticed, never shown to the player and never rebuilt from the edited schema.
  Test story update, rollback and reopen together.
- Validation (refusals): duplicate id, over-length or macro text, unknown `reached` checkpoint, unknown gate key (nearest
  name), gate reading its own `obs_` key, unknown `source`.
- Diagnostics (warnings, each with a consequence in `DIAGNOSTIC_CONSEQUENCES`):
  - `observation-imposes-mind`: text says what the player feels, thinks, realises, decides, suspects or knows (G07 vocabulary;
    extends the `speaksForPlayer` patterns with realise/know/sense/suspect/conclude).
  - `observation-instructs`: second-person imperative or "you should / must / need to".
  - `disclosure-names-unknown-entity`: reused; text names an entity not known when the gate can first hold.
  - `observation-never-read` (gate on a value nothing writes, codex rule) and `observation-gate-holds-at-start`.
  - Warnings, not refusals: the lexical check has false positives; O3 measures the residue.

### Slice 2 — passive check (D)

- `passive?: { roll: CheckRoll, modifiers?: CheckModifier[] }` (existing shapes; no `quality`, no `outcome`, no `twist`, no
  `narrate`: the roll is never narrated and never shown to the player).
- `resolveCheck` takes a whole `StoryCheck` with required `id`, `quality`, `narrate` (`src/engine/storyChecks.ts:37`;
  `src/engine/gameSchema.ts:118-128`), so it is not called with the passive object. Extract a pure `resolveRoll(roll, modifiers,
  units, values)` (faces, applied modifiers, total, success, twist) from `resolveCheck`; `resolveCheck` becomes roll + degree
  over it, and observations call `resolveRoll`. Existing check-result fixtures are regression tests for the extraction. No fake
  writable quality, no cast to `StoryCheck`.
- Once the gate holds for the first time, the passive check rolls once:
  `unitDraw([chatId, storyId, boundary, "observe:<id>:<die>"])`, where `boundary` is the first boundary the gate held.
  Success latches `obs_<id>`; failure latches `obs_<id>_missed` = boundary. **v1: a miss is final** (no fishing by repeating a
  move; "asking again cannot", checks precedent). Re-roll on re-entry is an open question.
- Seeding needs the chat id inside the latch pass. Recommended: `EngineHost` gains a data-only `chanceIds?(): {chatId, storyId}`
  read into the latch view (values, not effects; the clock-seam rule holds). Fallback if refused: passive observations roll in
  the host `derive` step like checks, and validation refuses a passive gate that reads latch-pass keys (`codex_*`, quest closes,
  label reveals, `reached`).
- Author view: the draw shows as a roll chip (`RollRecord` source `observation`, author audience only).
- Rollback: `obs_<id>_missed` covered by the `observations` detector; replay rolls the same dice (rollback ≡ replay property test).

### Slice 3 — records and player surfaces (D)

- Own slice `extras.observations.records: [{ id, identity, boundary, messageId }]` (cap 200; `identity` per slice 1), built in boundary work from the finished
  `BoundaryLogEntry` (`after` latches), rolled back by message id in `quarantine` (`rollbackObservations`), sanitized on load.
  The latch is the truth; the record carries the citation.
- Projection `runtime/observationView.ts` (pure): earned, `knownEntities`-filtered, `source` shown only once known;
  `{ text, from?, at?, messageId, fresh }`. Nothing unnoticed reaches a component.
- **Held-secret content filter**: names are not enough (`knownEntities`, `src/engine/codex.ts:97`, tracks entity disclosure;
  `recapWithheld`, `src/runtime/consequences.ts:182`, filters names and titles), since a line can restate a secret in known
  words. The projection drops a line when `keptFrom(text, heldSecrets(...), null)` holds for the resting audience
  (`src/memory/heldSecrets.ts:27`, `:51`). It runs on every snapshot build, not once at latch time, so a secret introduced after
  the line latched hides it too (the card reads the same projection, so there is no stored text to re-check). A withheld line is
  not counted in "N more". Tests: a secret restated with no unknown proper noun; a narrator who privately knows the secret (still
  withheld from the player surface); a secret introduced after the observation latched.
- Story card: `#so-hud-card-notice` "You notice: …" for observations latched at the last boundary (at most 3, then "and N more
  in the Journal" counting only earned ones). Journal: section `[data-so="journal-noticed"]` "Noticed", newest first, each with
  "From <name>" / "At <checkpoint player_name>" and a `MessageCitation` jump. Log row "Noticed something" (no text).
- Story toggle `display.observations: false` hides both (authored display, like codex). Registry feature `observations`
  ("Things you notice", area play, audience player, on by default); Help copy. No install or chat control in v1; if one is
  added it goes through `FEATURE_POLICY_FIELDS` / `FEATURE_CONTROLS` (`src/engine/featurePolicy.ts:15`) with chat overrides in
  `extras.overrides` (install master → authored default → chat), never `extras.ui`. The feature extends 09's state mapping and
  parity fixtures when it lands (authored presence + `display.observations`).
- Journal composition: the game composer includes the Noticed section when the story has observations, with or without codex,
  quests or milestones (feature-only fixture from slice 1). Player-clean (`so-ui.mts assert-player-clean`): no ids, no dice, no "missed".
- Copy in `features/gameCopy.ts`; Storybook stories: card with/without notice, Journal section empty/one/many, phone 390×844.
- Lazy: projection and components ride the game-layer chunk; main bundle budget unchanged.

### Slice 4 — Studio, typed mutations, wizard tool, guide (D + CL)

- Studio "Observations" editor beside People and Places (Story features group): list, gate editor, passive roll fields,
  live diagnostics. Typed mutations `updateObservation`, `removeObservation`, `setObservations` in `studio/gameMutations.ts`.
- Wizard tools `setObservation` / `removeObservation` (edit family, review mode like codex tools); `tools.test.ts` parity.
  Tool doc: "Write what is there to see; never what the player feels, concludes or does."
- Guide topic `observations` in `docs/authoring/story-guide.md` (+ compact twin `copilot/guideTopics.ts`, `guideTopicGroups.json`),
  `npm run docs:guide`, `npm run docs:settings`; `guideCoverage.test.ts`.

### Slice 5 — acceptance (D + task run + final-suite row)

- O1–O3 corpus (40 synthetic observations, frozen before running), O4 task run on a synthetic story (not the campaign).
- Final-suite row: one played session with Artemis, thinking and inner voice on, where at least one passive and one plain
  observation land; payload capture shows no observation prose, passive result or record in any request.
- Campaign adoption decided after acceptance (decision 6).

## Predeclared floors

Sol's, frozen before any run; informational, never retuned (v2.8 rule 2).

- **O1 — Deterministic reveal.** 40 frozen observations, eligible and ineligible (gate holds / not, passive success / miss,
  `reached`, codex-latch gates, time-keyed gates where v2.8 50 is present): noticed set and boundary equal the expected table
  on replay. Floor: 40/40 (100%). D. The 40 include codex-latch gates on a no-transition boundary (lands next boundary) and on
  a transition boundary (lands in the after-entry pass), per the frozen-pass semantics.
- **O2 — Rollback.** Same 40, every edit/swipe/delete cut over the scripted transcript: state after rollback ≡ replay to that
  point, records included. Floor: 100% of cuts. D.
- **O3 — Nothing leaks or imposes.** Over the 40 and every rendered player surface: zero unknown entities, zero secrets, zero
  imposed feelings, zero voluntary actions in shown text; zero observation prose, private passive results or observation records
  in any model request (payload goldens on vs off differ only in declared, budgeted discovery-scope hunks). Floor: 0 each. D (the
  feelings/actions count is a second-model review of the 40 texts, CL: opencode `openai/gpt-6.1-sol` by default, DeepSeek only
  as fallback).
- **O4 — Understood as information.** 10 synthetic-story tasks: the player finds the observation and says it offers
  information, not an instruction. Floor: ≥ 8/10. Owner or delegated rater; synthetic only.

## Gates by tier

- Slices 1–2 (pure engine/game layer): `npm run typecheck && npm run lint && npm test` + `npm run typecheck:test`; per change
  `npm run gates:quick`; property tests for rollback ≡ replay and seeded draws; `rollbackDetectors.guard`, `boundaryOrder`,
  `architecture.test.ts` green.
- Slice 3 (runtime/UI): above + `npm run build` + Storybook + live gate on a lane (`st-lanes.mts`, lanes 30+, never the owner's
  ST): no-model scenario `test/scenarios/v29-08-observations.json` (plain + passive land, swipe takes back, reopen keeps),
  `assert-player-clean`, `ST_DEBUG_VIEWPORT=390x844` render, payload golden diff with zero undeclared hunks (discovery-scope
  hunks declared).
- Slice 4: above; wizard tool on the authoring role (opencode `openai/gpt-6.1-sol`, real call, no `debugResponse`): drafts
  observations that pass validation and raise no `observation-imposes-mind`. CL.
- Plan close: `npm run gates` (Storybook included), once, without `--resume`; gate record appended.
- Real-model play row (final suite): Artemis on the 3090 or an authorized pod window, thinking and inner voice on. Not
  authorized by this plan; owed until run. If it cannot run, say so; not green.

## Privacy and spoiler notes

- Unnoticed observations never reach a component, the snapshot's player half, a count, or a model; the card's "N more" counts
  earned ones only.
- Page-only: no shared tier, no private block, no WI mirror, no canon, no recap, no Ask projection in v1. Payload goldens prove
  no observation prose, passive result or record reaches a request; the only request change is declared discovery-scope gate
  keys.
- Authored placement alone does not prove safety: every shown line passes the resting-audience held-secret filter (slice 3).
- Disclosure is not knowledge: a noticed line writes no epistemic row and gives no character the knowledge (codex rule).
- Text ships with the story: a line that names a twist is a spoiler the moment it shows; `disclosure-names-unknown-entity`,
  the held-secret filter and the guide's "write it as what is seen" reduce it. `source` shows only once known.
- Passive dice, targets, misses and modifier names are author-only.
- Public repo: fixtures are synthetic; no campaign content; campaign review routed to another model, counts-only to the owner.

## Invariants touched

- **Engine purity / EngineHost seam**: latch writer is pure; `chanceIds` is data, not an effect. If the owner prefers the seam
  unchanged, the derive-step fallback keeps it as is.
- **Chance is seeded, never `Math.random`**: `unitDraw` keyed chat, story, boundary, `observe:<id>:<die>`.
- **One order per boundary**: runs inside the existing latch passes with frozen-pass reads; no new step, no second transition,
  no change to the latch view; `boundaryOrder.test.ts` unchanged except the writer list.
- **Held secrets never reach a kept-out audience**: the player projection is resting-filtered with `keptFrom`.
- **Story updates reconcile extras**: owned reconciliation hook for `extras.observations` before the swap.
- **Every compiled code key has a rollback check**: `observations` detector + planted control.
- **Disclosure is not knowledge / `knownEntities`**: projection filters by it; no epistemic writes.
- **State homes**: authored in the story record; per-chat records in `extras.observations` (detached copy, sanitized); no
  `BLOB_VERSION` bump (additive slice, empty default; no migrations).
- **One check registry / diagnostics declare consequences**: new warnings carry consequence + Studio copy.
- **Two personas, player mode publishable**: author-only roll chips; `assert-player-clean`.
- **Story updates**: `storyDiff` codex rules; `applyStoryUpdate` prunes.
- **Main bundle 1,300,000 B**: game-layer lazy chunk.
- **Thinking and inner voice**: untouched; no prompt change.

## Dependencies and links

- v2.8 18 (checks, Journal, roll chips) and v2.8 52 (codex latches, SC1–SC4, `knownEntities`): present on `6861d989`.
- G07 decision (v2.8 18 agency contract, v2.8 35 fixtures): the lint vocabulary follows it; this plan does not edit the clause.
- v2.8 50 (story time): only for time-bound gates (`is_night`, `time_of_day`), read as ordinary derived keys.
- Later consumers: v2.9 06 could seed suggestions from earned observations (player-visible, so allowed); v2.9 09 Help lists the
  feature state.

## Decisions for the owner

1. **Approve the surface: "You notice…" on the story card and a "Noticed" Journal section?** Recommended: yes.
2. **Approve passive checks (seeded, never shown, a miss is final)?** Recommended: yes.
3. **Perception-only scope, with imposes-mind/instructs as Studio warnings (not refusals)?** Recommended: yes.
4. **Page-only in v1 (narrator not told; option B only if sessions show the narrator contradicting a noticed line)?** Recommended: yes.
5. **Named player voices later?** Recommended: no for now; reopen only on session evidence.
6. **Campaign adoption** after acceptance, reviewed by another model. Recommended: decide then.

## Unresolved questions

- `EngineHost.chanceIds` vs derive-step rolling for passive observations?
- Re-roll a missed passive observation on checkpoint re-entry, or never?
- Include earned observations in the player Ask projection (`runtime/playerProjection.ts`) in a later slice?
- Caps: 60 per story, 3 on the card — right sizes?
- O4 rater: owner or delegated, and the exact task wording, frozen before the run.
- Is a one-boundary delay for observations gated on a same-pass latch (no-transition boundary) acceptable, or is the latch-view
  prerequisite plan wanted?

## Review 2026-10-21 (sol)

- P1, latch visibility: applied. Replaced the same-pass promise with frozen-pass semantics (verified `engine.ts:266`, `:272`,
  `:285`, `:516`; `blackboard.ts:82`); O1 gains no-transition and transition fixtures; same-pass visibility named as a separate
  prerequisite; new unresolved question.
- P1, payload invariance: applied. O3, privacy, slice 3 live gate and final-suite row now assert no observation prose, passive
  results or records in requests, with declared budgeted discovery-scope hunks; floors unchanged.
- P2, passive resolver type: applied. Extract pure `resolveRoll` from `resolveCheck` (`storyChecks.ts:37`, `gameSchema.ts:118`),
  check fixtures as regression; no fake quality or cast.
- Cross P1, held-secret content filter: applied. Resting-audience `keptFrom` filter in the projection on every snapshot build;
  three named tests; removed the placement-alone safety claim.
- Cross P1, new-only stories: applied. `usesGameLayer`, parsing, normalized copy, `hasGameLayer`/`storyHasGame` and Journal
  composition include observations; feature-only fixture.
- Cross P1, story-update reconciliation: applied. Definition identity, record carries it, owned extras hook before `swapStory`
  (`storyUpdate.ts:175-177`), retired list for removed definitions; update + rollback + reopen test.
- Cross P1, settings via `FEATURE_POLICY_FIELDS` / `extras.overrides`: applied as a rule (no install/chat control in v1; any later
  one goes there; 09 mapping extended).
- Cross P2, model routing: applied. O3 second-model review on sol, DeepSeek fallback only. Thinking and inner voice untouched.

## Gate record 2026-10-21 (v2.9 build, branch v2.9-08-observations)

Scope per the owner decisions 2026-10-21 (`00-overview.md`): surface, passive checks, perception-only warnings, page-only v1;
named voices not built. Slices 1-4 built; slice 5 deterministic floors run, model floors and rows not run (no GPU).

Built:
- Slice 1: `observations[]` (`engine/observationSchema.ts`, `validate/observations.ts`, `engine/observations.ts`), game-layer
  load detector, `hasGameLayer`, normalized copy; latching code keys `obs_<id>` (+ `obs_<id>_missed` for passive); latch writer
  `observationLatches` appended to `LATCH_WRITERS` (frozen-pass semantics, no new boundary step); rollback detector `observations`
  (prefix); discovery units for unnoticed gates (`DISCOVERY_UNITS`); `storyDiff` `diffObservations` (identity = id + rev + when +
  passive; codes `observation-edited|replaced|removed`, `observations-changed`; obs keys skipped by the quality diff like codex
  keys); refusals: duplicate id, length/macro text, `"start"`, unknown checkpoint / key with nearest name, own key, unknown source,
  authored `obs_` quality, unknown keys (`voice` refused).
- Slice 2: `resolveRoll` extracted from `resolveCheck` (check regression green); passive rolls once the first boundary the gate
  holds, `unitDraw([chatId, storyId, boundary, "observe:<id>:<die>"])`; a miss is final. Seeding: `EngineHost.chanceIds?()`
  (data only, read into the latch view as `chance`; the recommended option, not the derive-step fallback). No ids, no roll.
  Author roll chips (`RollSource` `observation`, author view only in the snapshot).
- Slice 3: `extras.observations {records, retired}` (cap 200/60; main door `runtime/observationRecords.ts`: types, rollback,
  sanitize; lazy `runtime/observationKit.ts`: records at boundary, record, reconcile, rolls, installed with the game composer);
  records built in boundary work `game` from the finished entry; `rollbackObservations` in `quarantine`; sanitize on load;
  story-update hook `StoryUpdateDeps.reconcileExtras` before `swapStory` (same identity keeps, changed identity drops, removed ->
  author-only retired list). Projection `runtime/observationView.ts` (lazy widgets chunk): earned only, newest first, From/At,
  drops a line naming an unknown entity or restating a held secret (resting filter on every snapshot build). Story card
  `#so-hud-card-notice` (3 + "and N more in the Journal"), Journal `[data-so="journal-noticed"]` with "Show in chat" jump, log row
  "Noticed something" (only for shown lines). `display.observations: false`. Feature `observations` ("Things you notice").
- Slice 4: Studio `ObservationsEditor` (Story features), typed mutations `setObservations`, `updateObservation`,
  `removeObservation`, `setObservationsShown`; wizard tools `setObservation`, `removeObservation` (edit family, review);
  diagnostics `observation-imposes-mind`, `observation-instructs`, `observation-never-read`, `observation-gate-holds-at-start`,
  `disclosure-names-unknown-entity` reused; guide topic `observations` (+ compact twin, group, Studio tab), `docs:guide`,
  `docs:settings`; plan 24 matrix row.

Floors (frozen corpus `test/fixtures/observations-corpus.json`, 40 synthetic lines over the codex lab):
- O1 40/40 (`src/engine/observations.test.ts`), including codex-latch gates on no-transition boundaries (lands next boundary)
  and on transition boundaries (after-entry pass); passive rolls chosen to hold for every seed. Time-keyed gates not in the
  corpus (the lab has no clock).
- O2 12/12 cuts: rollback ≡ replay to the cut and back to the straight run, engine state; records `rollbackObservations` ≡
  replay (`src/runtime/observations.review.test.ts`).
- O3 deterministic half 0/0/0: lexical lint zero imposes/instructs over the 40; page-only import guard (only page and record
  modules import the projection/records; nothing in `INJECTION_REGISTRY`); unknown entity and held-secret filter tests (secret in
  known words, narrator who privately knows, secret after the latch). The second-model review (CL, sol): NOT run: no model
  passes in this build (owner 2026-10-21).
- O4 task run: NOT run (owner or delegated rater; synthetic story owed).

Commands and results (final tree `HEAD`):
- `npm run gates -- --no-storybook`: `gates: all green in 158.0s` (build, typecheck, typecheck:test, test 847 suites / 9823 passed + 1 skipped, test:replay, test:debug, debug:typecheck, test:release, test:plugin, lint all ok); earlier runs on this branch fixed: arrival golden row, plan 24 matrix row, a story regex; `childTree.test.mts` failed once under load and passed alone and in every later run. `--no-storybook` because port 6006 (Storybook's fixed port) was held by
  another worktree's gate run for most of the session; a full `npm run gates` started when the port was free lost it to
  `EADDRINUSE` mid-run (recorded RED, environment).
- Storybook on its own port (same scripts, `.sb-static` on 6108): `npm run storybook:build`, then `http-server .sb-static -p 6108`
  + `test-storybook --url http://127.0.0.1:6108 --maxWorkers 4`: 157 suites, 952 tests passed (after fixing NoticedMany: Storybook supplies `onJump` as an action arg).
- Main bundle 1,294,581 B (master 1,291,214 B, +3,367 B; budget 1,300,000).
- No-model lane 44 (default lanes root, ST code copy `C:\dev\st-v29-08` with `node_modules` junctioned, staged there with
  `npm run stage -- --st-root C:/dev/st-v29-08` so the owner's ST slot was not touched; images off in the lane, sprites not
  enabled): `ST_ROOT=C:/dev/st-v29-08 node scripts/debug/st-lanes.mts run 44 -- scripts/debug/so-scenario.mts run
  test/scenarios/v29-08-observations.json --sandbox --group "Group: Arin, DM Narrator"`: ok, 22 steps, cleanup clean, twice
  (evidence `C:\dev\so-lanes\44\debug\runs\2026-10-22T00-18-08-921Z-so-scenario-run`, `...00-20-26-725Z...`), and once with
  `ST_DEBUG_VIEWPORT=390x844` (`...00-21-12-384Z...`). Covers plain + passive landing, the missed line absent, author roll chips,
  the story card notice in player mode, `assert-player-clean` before and after the swipe, reopen keeps, swipe takes back, second
  reopen equals replay. The two failed requests per run are `text-completions/props` 500 on the no-model lane. Lane stopped.

NOT run: no GPU (owner 2026-10-21):
- Payload golden capture/diff: not run (no lane capture was made for it); no payload fixture has observations and the only
  request change is discovery-scope gate keys for stories that have them.
- Slice 4 real wizard call on the authoring role (CL); deterministic tool tests only (`observationTools.review.test.ts`).
- O3 second-model review, O4, final-suite played row with Artemis.

Deviations:
- Records split into a main door + lazy kit to keep the main bundle near budget; a boundary before the kit loads records
  nothing (the latch stays the truth; the Journal then has no jump link for that line).
- Log row reuses kind `learned` (no new `LOG_KINDS` value).
- Observation roll chips are in the snapshot only in Author view (stricter than checks).
- 09's state mapping / parity fixtures not extended: 09 is not on this base.

Unresolved (from the plan, unchanged): re-roll a missed passive line on re-entry (v1: never); Ask projection; caps (60/3);
O4 rater and wording; same-pass latch visibility.

### GPU run 2026-10-22

- Window 2026-10-22 ~21:23-23:20 local (00:23-02:20Z), local 3090 via the controller (`cli.mjs automatic`, text loaded clean
  after the earlier `crashed` code-1 status). Lanes 41 (master `a082a064`, served bundle `cb12b358`) and 42 (`v2.9-03-polish`
  `639ae53c`, bundle `33506e23`, staged into the ST code copy `C:/dev/st-v29-08`), both `--allow-local --headed`, images and sprites
  off in the lane copies, profile `Artemis RunPod RP` -> :18888, context 32768, thinking and inner voice on. Group
  `Group: Arin, DM Narrator` (the lane copy also drafts two members outside each story's roster).
- Rater: opencode `openai/gpt-6.1-sol` (`opencode run`, frozen prompt in the evidence folder). Evidence
  `C:\dev\so-lanes\41\debug\v29gpu\`, `C:\dev\so-lanes\42\debug\v29gpu\` (+ each lane's `debug/runs/`), archived to so-sessions.
- Pilots are NOT the predeclared corpora: small N, fixed fixtures, no frozen 40/100 denominators. They say whether the path works
  with the real model and which way a floor leans; no floor below is claimed met.
- Two model lanes shared one GPU: memory-model calls queued behind the other lane's replies (inner beat timeouts at 35 s,
  suggestions at 50 s, below). Environment, not a product change; recorded.
- O3 second-model review (CL, sol, frozen prompt): imposed inner state **0 of 40**, voluntary player action **0 of 40**; rerun with
  two planted controls appended: the 40 again 0/0, controls caught (feeling `c01` F=yes, action `c02` A=yes).
- O4 (owner or delegated task run) and the final-suite played row: NOT run.

### GPU run 2026-10-23

- Window 2026-10-23 ~05:40-09:00Z, local 3090 through the controller (`cli.mjs automatic`), ONE model lane at a time: lane 42
  on branch `v2.9-gpu2-fixes` (base master `1b2beb9e`, fixes `137a359b`, served bundle `c28c0dcf`, staged into the ST code copy
  `C:/dev/st-v29-08`), `--allow-local --headed`, images and sprites off, profile `Artemis RunPod RP` -> :18888, context 32768,
  thinking and inner voice on, group `Group: Arin, DM Narrator` (members Luke, Ponticius, Arin, DM Narrator). Lane 41 (master
  `45e4a83b` bundle) served the diagnosis runs before the fix. Rater opencode `openai/gpt-6.1-sol` (frozen prompts in each
  `rate/` folder). Evidence `C:\dev\so-lanes\41\debug\v29gpu2\`, `C:\dev\so-lanes\42\debug\v29gpu2\` (+ each lane's
  `debug/runs/`), archived to so-sessions.
- O4 (10 synthetic tasks, the player finds the observation and reads it as information): NOT run. It needs the 10 tasks
  written and a player (owner or delegated rater) working the UI; more than 2 h and not a sol-only row.

## Owner decision 2026-10-25

- O4: Sol writes the 10 tasks; the owner's own playthrough is the player.
