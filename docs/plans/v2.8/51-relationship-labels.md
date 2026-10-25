# Plan 51 — Discoverable relationship labels

**Status (2026-10-15): A built on `v2.8-p51-labels` (not merged); D floors green, live lane gate and CL/RP owed (§Gate record).**
Previous status (2026-10-14): DRAFT, not built. Owner decision 2026-10-14: the roleplay mechanics of plans 51–53 go into
v2.8 and are written now. Source row: v2.8 27 report G15 ("relationship public label + gated secret label; numbers
author-only; directed, not mirrored"), deferred by v2.7 37 L1 ("label only; reveal deferred"). Gate tiers (v2.8 00
§Gate taxonomy): implementation **D**; acceptance **D** + **CL** (label wording rated by a second model) + **RP** (holder
replies on the main reply model). Overview: `docs/plans/v2.8/00-overview.md`. Not in `32-queue.md` yet (the owner
queues it).
**Revised 2026-10-14 against the Astra review**: §Review 2026-10-14 (Astra) records each finding; the shared contract
(SC1–SC5) lives in v2.8 52 §Review 2026-10-14 (Astra). **51 now builds after 52 A, onto its person pages.**

## What it is

- Every directed relationship (`roster[].relationships[]`, v2.7 37 L1) may carry **words the player can see**: a
  public label for how the holder visibly treats the other side ("wary", "warm", "rivals").
- It may also carry **secret labels** ("secretly loyal", "owes them a debt"), each behind an authored gate. A secret
  label stays out of every player surface until its gate holds once. From then on it is **revealed**, and it stays
  revealed: the reveal latches.
- The axis numbers (`rel_<holder>_<toward>_<axis>`) stay author-only, as v2.7 37 decision 2 settled. The player sees
  words chosen by the author, never a value, a range, a trend or a count of hidden labels.
- Directed, not mirrored. Mara's label toward the player says nothing about the player's toward Mara, and Mara → Tom
  is a separate row from Tom → Mara. Each side carries its own wording, as monks-enhanced-journal does.
- A reveal is a story event. It is rolled back by a swipe or edit of the reply that earned it, it appears in the
  session journal and the player log, and it replays the same way when the chat is reopened.
- Group chats only (v2.7 03). The player is the one viewer; members are the holders.

## History and evidence

| # | Source | What it says |
|---|---|---|
| 1 | `docs/plans/v2.8/27-gamification-report.md` G15 | public + gated secret label, numbers author-only, directed; value 3, effort S, target "v2.7 37 L1 (label only; reveal deferred)" |
| 2 | `docs/plans/v2.8/gamification-research/monks-enhanced-journal.md` §How it works | Foundry relationship rows `{relationship (public label), secret, revealed, hidden}`; reverse links not mirrored; the reveal is a manual GM toggle, filtered on the client |
| 3 | same, §Overlap | "manual reveal toggles where we want gates"; filtering happens over a document the observer already holds |
| 4 | v2.8 27 report §Traps 5 | render-time hiding (FQL ships hidden rows to every client) and counts that include hidden items: hide at projection, count from the projection |
| 5 | v2.8 27 report G1 | counts and lists only from the visible projection; an empty section is never rendered |
| 6 | `docs/plans/v2.7/37-character-life.md` L1, decision 2 | "Author visible, private for players"; `display.public` refused on `rel_*`; rejected: a player affection meter |
| 7 | v2.7 37 §Lessons from prior art | relationship meters are the most-asked feature in ST trackers (BetterSimTracker, BlazeTracker, Silly Sim Tracker) |
| 8 | v2.7 36 §Spoiler property | the player page is byte-identical with and without hidden items (secret milestones are not listed until earned) |

This plan amends v2.7 37 decision 2 for **labels only**: numbers remain private, meters remain refused. The owner's
2026-10-14 decision is the explicit decision v2.8 00 rule 4 asks for.

## Current state in code

Verified on master `211d8d96`.

- **Declaration.** `RelationshipDecl {toward, axes, range, step, start, label?}` (`src/engine/lifeSchema.ts:15-22`).
  `label` today is an author-side name for the relationship, used only in the holder's private line.
- **Validation.** `readRelationship` (`src/engine/validate/life.ts:40-58`) accepts the six keys, refuses a relationship
  toward itself and an unknown `toward`; `relationshipQualities` compiles each axis to an extractor int with a
  `step_rule` (`src/engine/validate/life.ts:174-181`). `checkDisplays` refuses `display` on any `rel_*` key
  (`src/engine/validate/display.ts:8`, `:83`).
- **Holder's private line.** `relationshipLines` writes "Your trust toward Arin (label): 3 on a scale from -5 to 5"
  (`src/engine/life/lines.ts:29-35`) under `LIFE_BLOCK_HEADER` (`:12`); composed per drafted member by
  `MemoryInjector.lifeLines` and filtered with `withoutSecretLines` (`src/runtime/memoryInjector.ts:129-134`).
- **Author view.** `lifeAuthorRows` (`src/engine/life/lines.ts:91-105`) → `lifeAuthorSlice`
  (`src/runtime/lifeSnapshot.ts:14-24`) → `CharacterLifePanel` (`#so-character-life`, Blackboard tab).
- **Warden.** `relationshipFeelings` feeds the continuity warden's speaker context (`src/runtime/continuity.ts:112`).
- **Latch precedent.** Quest ends latch in a code quality (`quest_<id>_closed`, `src/engine/gameSchema.ts:204`,
  written in `applyQuestRewards`, `src/engine/quests.ts:68-72`). Life code writes run in the derive seam
  (`deriveLife`, `src/engine/life/derive.ts:57`; wired by `deriveQualities`, `src/runtime/stretchTurns.ts:14-18`).
- **Player surfaces.** `GameView {quests, mainLine, sheet, milestones, log, journal, statSheet, widgets}`
  (`src/runtime/gameTypes.ts:158-167`), composed in `composeGame` (`src/runtime/widgets.ts:287`) inside the lazy
  game-layer chunk; the Journal panel renders `game.journal` and milestones (`src/components/panels/JournalPanel.tsx:23-33`).
  Log rows are typed `{at, kind, actor?, text, outcome?}` (`src/runtime/gameTypes.ts:59-65`).
- **No player-visible relationship data exists.** Nothing outside author view reads `rel_*`; no reveal mechanism exists.

## Options

| | Design | Cost | Risk | Notes |
|---|---|---|---|---|
| **A. Authored labels, gated secrets, latched reveal** | `public: [{label, when?}]` (last holding row wins, frozen) + `secret: [{id, label, revealed_when}]`; reveal latched in a code quality; player projection lists public label + revealed secrets | S–M | label `when` gates on an axis can act like a band and flicker with the extractor | G15 as written; deterministic; rolls back with the blackboard |
| **B. Word bands over the axis number** | G6 bands on each axis (`bands: [{max, label}, …]`), the band word shown to the player | S | the player infers the number and its movement; a band change on each read is a trend leak | an axis-gated public label is the same thing; allowed only as an explicit `follows_feeling` choice (§Review) |
| **C. Model-written labels** | the shared read proposes a label per relationship | M | nondeterministic wording; spoils secrets the model sees; prompt cost | violates "stagecraft proposes, never writes" unless curated |
| **D. Manual author reveal only** | a Studio/drawer button flips a secret label | S | unrollbackable viewer write (trap T7); no play reveal | monks' model; rejected by the report |

## Recommendation

**A.** Format, all optional, on each relationship row:

```json
{ "toward": "player", "axes": ["trust"],
  "public": [{ "label": "wary" }, { "label": "warming to you", "when": { "q": "shared_meal", "op": "==", "v": true } }],
  "secret": [{ "id": "loyal", "label": "secretly loyal to you", "revealed_when": { "q": "saw_letter", "op": "==", "v": true } }] }
```

- **Public label.** Rows are evaluated last-to-first; the last row whose `when` holds (or that has no `when`) wins, so
  later rows override earlier ones (rule frozen; the options table agrees). At most 6 rows; text ≤ 40 characters,
  plain text, no macros. Event-driven gates are the default. A row whose `when` reads a `rel_*` axis is an intentional
  public band and needs `follows_feeling: true`, else it is refused; such a row may set `hold: n` (1–5 boundaries the
  gate must hold before the label switches) against flicker.
- **Secret labels.** At most 4 per relationship. `revealed_when` is required. The latch pass (shared contract SC2
  step 5, re-run at step 7) writes the latch
  `life_reveal_<holder>_<toward>_<id> = true` (code bool, `life_` prefix, so `isLifeKey` holds,
  `src/engine/lifeSchema.ts:95`) the first boundary the gate holds; it never writes false. A rollback past that
  boundary drops it with the blackboard; replay writes it again at the same boundary.
- **Validator.** Unknown keys refused; a `revealed_when` true at the story's start refused (a "secret" known from turn
  one); a `when`/`revealed_when` on an undeclared quality refused; a public `when` or `revealed_when` that reads a
  `rel_*` key is accepted but raises diagnostic `relationship-label-reads-axis` (warning: "This label follows the
  hidden number, so the player can read the number's movement from it") — see decision 3. A secret label whose text
  equals a public label is refused.
- **Player projection.** New `GameView.relations: RelationView[]`, one row per relationship that has a public label
  holding now or at least one revealed secret: `{holder, toward, label, revealed: string[]}` with names from
  `castNames` (`toward: "player"` shows as "you"). Unrevealed secrets are never in the view, not even as a count or
  placeholder. A relationship with no public label and no revealed secret contributes no row; with no row the section
  is not rendered (G1). A row projects only while **both** holder and target are known through v2.8 52's
  `knownEntities` (SC3); NPC-to-NPC rows included. A revealed secret renders as history ("Learned: secretly loyal to
  you"), never as a present-tense assertion; only the public label speaks in the present.
- **Where the player sees it.** On the holder's person page in v2.8 52's codex. No interim Journal section.
- **Reveal event.** The player log gains kind `reveal`, row text "{holder}: {label}" (toward someone other than the
  player: "{holder} toward {toward}: {label}"); an inline chip "Revealed" under the message whose boundary latched it;
  the session journal derives the same event by diffing `life_reveal_*` between consecutive boundary snapshots (no
  stored event, as v2.8 27 G3 decided).
- **Holder's private block.** The holder's existing line gains its labels: "Your trust toward Arin (shown as: wary;
  secretly: loyal, which others have not learned): 3 …". After a reveal the clause reads "secretly loyal, which the
  player now knows". Other members' blocks get nothing new: a reveal to the player is not a reveal to the cast.
  Payload invariance: a story with no labels produces byte-identical member blocks.
- **Author view.** `CharacterLifePanel` shows each label, its gate, and reveal state with boundary + message id.
- **Studio.** The Roster tab's character-life editor gains Public labels and Secret labels lists with the gate
  builder; `setCharacterLife` (`src/studio/gameMutations.ts:81`) carries the fields; the wizard's character-life tool
  (`src/copilot/agent/tools.ts:181-184`) schema adds them; guide topic `character-life` gains a "Labels the player can
  learn" paragraph (then `npm run docs:guide`).
- **Feature registry.** `relationship-labels` (area characters, audience player) in `src/features/lifeFeatures.ts`,
  on by default (v2.8 00 rule 9); Help copy says where labels appear.
- **Bundle.** All new code in the lazy game-layer chunk (`GAME_LAYER.life`); main entry unchanged.

## Predeclared floors

Committed before any run; informational, never retuned (v2.8 00 rule 2).

| # | Condition | Floor | Tier |
|---|---|---|---|
| R1 | Spoiler property: random blackboards (≥ 500 seeds) over a fixture with ≥ 6 secret labels; no unrevealed secret label text, id or count in `GameView`, the Journal DOM or the player log | 0 leaks | D |
| R2 | Byte-identity: the player page (Journal DOM + `game` slice JSON) with and without unrevealed secret labels declared | identical, 100 % of seeds | D |
| R3 | No number: player view and DOM contain no axis value, range or trend for any `rel_*` key | 0 hits | D |
| R4 | Rollback ≡ replay of `life_reveal_*` over 4 seeds with swipe, edit, delete and reopen, plus a code-only boundary (SC1) | identical state, 4/4 + 1 | D |
| R5 | Payload invariance: a story without labels sends byte-identical member blocks (payload goldens) | 0 undeclared hunks | D |
| R6 | Directedness: setting A → B labels never changes B → A's projected row (property test) | 0 mirrored rows | D |
| R7 | Holder honours its labels: 10 drafted replies per arm (public "wary" vs public "warm", same scene), second-model rater picks the warmer reply blind | ≥ 8/10 correct | RP + CL |
| R8 | Zero-leak correctness: an unrevealed secret label's text appears only in its holder's private block; 0 hits in other drafted members' requests, the resting block, shared tiers, canon, chapter and scene summaries, the WI mirror and the player view (payload goldens + property over drafted members) | 0 hits | D |
| R9 | Secret kept in voice (quality, informational, not a secrecy claim): 10 replies from a holder with an unrevealed secret label; rater flags any reply that states the secret outright | ≤ 1/10 | RP + CL |
| R10 | Feature-only fixture: a story whose only game feature is labels renders them (SC4) | holds | D |
| R11 | Reveal scope: reveal and public-label gate keys are offered by the `discovery` scope source within the rotation bound (52 C9 shape); a control without the source starves | 100 %, control fails | D |
| R12 | Unknown entities: a row whose holder or target is unknown (SC3) is absent, NPC-to-NPC included, ≥ 500 seeds | 0 leaks | D |

R7/R9 use synthetic lab stories only (never Adolion), rated by a second model; the owner spot-checks synthetic rows.

## Gates by tier

- **D:** `npm run gates` (jest: validator cases, derive latch, projection, R1–R6 properties; Storybook: Journal
  People section, CharacterLifePanel labels, Studio label editors); `npm run test:release` unchanged; a no-model
  scenario on a lane that reveals a label, swipes it away and reveals it again (`so-scenario --sandbox`), plus
  `so-ui.mts assert-player-clean` before the reveal; payload goldens diff (R5).
- **CL / RP:** R7, R9 batched into the final v2.8 real-LLM suite (v2.8 00 rule 8), lab story only, run header diffed
  around the batch.

## Privacy/spoiler notes

- Hide at projection (T5): the composer drops unrevealed secrets before the view exists; no CSS or component
  filtering. The player page with secrets declared is byte-identical to one without (R2).
- Counts from the projection only (G1); no "2 secrets left", no empty People heading.
- Secret label text lives in the story record. Plans that read the story for players must not read it: v2.7 33
  suggestions and player Ask build from `playerProjection.ts` (`src/runtime/playerProjection.ts:88-103`), which gains
  only revealed labels. `withheldNames` (`:79-86`) adds unrevealed secret labels of ≥ 4 characters so a suggestion
  quoting one is dropped.
- Held secrets: labels are authored, not memory rows, so `heldSecrets` does not apply to them, but the holder's line
  still passes `withoutSecretLines` for that member (no change to that filter).
- A secret label may contradict the public one by design; the guide warns that a public label is what the holder
  *shows*, so it must not name the secret ("cold, but secretly loyal" in the public text is the leak).
- No Adolion content in this plan, its fixtures or reports.

## Dependencies and links

- **v2.7 37 L1** (built): relationships, `rel_*` compile, private line, author panel. This plan adds fields, not a
  new store.
- **v2.8 52 People and Places codex**: built first; the person page is where labels live; 52's `known_when` facts and
  51's revealed secrets share one projection rule and one spoiler property.
- **v2.8 53 Reputation with groups**: 51 is one member's feeling toward one target; 53 is a group's standing with the
  player. A member's private block may hold both; 53 states which wins (personal feeling first). 53's band words
  and 51's labels share the "words, never numbers" property (R3 / 53's no-number row).
- **v2.7 36** (built): G1, log rows, inline quest chips, the Journal panel.
- **v2.8 27** G15, G1, G3, T5.
- **v2.8 22** living director: unchanged; secret labels are not sent to it (decision 4).

## Decisions for the owner

1. **Option A (authored, gated, latched)?** **Recommended: yes.**
2. **Where labels show before 52 ships:** a Journal "People" section, or wait for 52? **Recommended: wait; build on
   52's person pages** (Astra: no interim surface that is removed at once). Revised 2026-10-14.
3. **May a label's gate read the hidden axis number?** (a) refuse; (b) allow with the warning diagnostic; (c) allow
   silently; (d) allow only with an explicit `follows_feeling: true`. **Recommended: (d).** A warning does not remove
   what the label reveals; the flag makes the public band a stated choice. Revised 2026-10-14.
4. **Do other members and the director learn a revealed secret?** **Recommended: no.** The reveal is the player's; the
   holder knows its own secret; the director keeps receiving private plans only.
5. **Reveal chip under the message:** on by default (follows inline level 1 Story) or Journal only? **Recommended:
   chip on, at level 1, like "Quest completed".**
6. **Can a revealed secret be un-revealed by the story** (a later gate)? **Recommended: no; only rollback removes it.**
   It is shown as history ("Learned: …"), so a later change of heart does not make it false.
7. **Reveal grammar:** history ("Learned: …") for secrets, present tense for the public label only? **Recommended:
   yes.**

## Unresolved questions

- Should a public label also be offered to the holder's card-level presence (e.g. sprite expression)? Out of scope
  here; v2.8 33/41 own the stage.
- Is "you" the right player-facing name for `toward: "player"`, or the persona name? Follows the existing narrative
  copy decision; confirm with the copy owner (`src/runtime/narrative.ts`).
- Cap values (6 public rows, 4 secrets, 40 characters) are placeholders until the Studio editor is drawn.

## Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 48-53, checked on master `3a716f2b`. Shared findings resolve through the
shared contract in v2.8 52 §Review 2026-10-14 (Astra): SC1 rollback detectors (R4 code-only seed), SC2 order (the
reveal latch is step 5, re-run at step 7), SC3 disclosure and `knownEntities`, SC4 feature-only fixture (R10).

- **P1 Missing extraction scope.** Verified: `SCOPE_SOURCES = [CARD_SOURCE, QUEST_SOURCE, RELATIONSHIP_SOURCE]`
  (`src/extraction/scopeSources.ts:65`); `RELATIONSHIP_SOURCE` reads axes and mood of present members only
  (`:53-63`), so a `revealed_when` on `saw_letter` is never asked. → Reveal and public-label gate keys join the shared
  `discovery` source (v2.8 52), budgeted, with rotation; floor R11 with a starving control.
- **P1 Labels can reveal unknown people.** Verified against the old projection rule (any holding public label made a
  row with both names). → Rows project only when holder and target are known (SC3, `knownEntities`), NPC-to-NPC
  included; floor R12.
- **P1 "Secret kept" allows a leak.** Accepted: one disclosure in ten cannot support a secrecy claim. → R8 is now a
  D correctness floor (0 hits) over every surface the extension builds: other members' requests, resting block,
  shared tiers, canon, chapter/scene summaries, WI mirror, player view. The holder's in-voice behaviour is R9, a
  quality rating, informational. What the holder says in the transcript is the model's act; R9 measures it, R8 proves
  the extension never carries the label anywhere but the holder's block.
- **P2 Options and implementation disagree** (first vs last match). Verified in the old options row. → Last holding
  row wins, frozen in both places.
- **P2 Option B's rejection is inconsistent.** Accepted: an axis-gated public label is a band. → Decision 3 (d):
  allowed only with `follows_feeling: true`; optional `hold` hysteresis; event-driven gates are the default.
- **P2 Learned once is not true forever.** Accepted. → Revealed secrets render as history ("Learned: …"); only the
  public label is present tense; decision 7.
- **Cheaper design: build into 52's pages, no interim Journal surface.** Adopted (decision 2 revised; dependency
  reordered: 52 A, then 51).
- **Brainstorm: labels tied to remembered interactions; several relationships at once.** Supported by the format:
  event-driven public rows ("trusts your discretion" on the gate of the event that earned it) and several rows per
  holder. The guide's Good example uses an event gate, not an axis.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted). First verified against master `9e96871d`; revised 2026-10-16 on `e8b9dd6d` after `review-astra-harvest-2026-10-16.md`. The owner decides with the rest of this plan.

- **H11a fresh-beat guard on relationship steps** (`docs/plans/v2.8/extension-research-2026-10-14/bb-visual-novel-engine.md` P1, 3/S). **Built** (51 gate record):
  `holdSameBeat` (`src/engine/life/beats.ts:51-60`) holds a `rel_*` step whose evidence repeats the last accepted step's beat
  on that axis within `SAME_BEAT_BOUNDARIES` (4, `:6`; beat = first 160 characters of the evidence, `:8`). The contract is
  **temporary repetition suppression**: the same beat cannot move an axis twice within 4 boundaries. It is not source-event
  identity: after the window the same lingering evidence can move the axis again, so the earlier "at most once across six
  turns" was not a general guarantee (the built fixture passes because its repeats fall inside the window, and it checks that
  the beat passes again after it). Source-event identity (a beat id carried by the read) is a later option, not planned.
- **H11b per-axis breakdown (author view)** (`docs/plans/v2.8/extension-research-2026-10-14/bb-visual-novel-engine.md` P2, 3/S–M). **Built**: `axisHistory`, derived
  from boundary history, never stored (51 gate record).
- **H5 "here now" scene card** → v2.8 65 (revised 2026-10-16: unknown members omitted entirely; v1 = location, time, known
  present members, links; labels later), which **reopens decision 2**. Owner call. **Owner 2026-10-16: reopened** for 65 only: a permanent, author-placed `scene` widget (not interim, not a default); labels stay on 52's person pages until 65's A+ line is built.

## Gate record

Built 2026-10-14/15 on branch `v2.8-p51-labels` (base master `cc38c5b1`), option A with every recommended decision (owner: "yes to all from
your recommendations"): 1 A; 2 no interim Journal section, labels on 52's person pages; 3 (d) `follows_feeling` with optional `hold`; 4 no
member or director learns a reveal; 5 "Revealed" chip at inline level 1; 6 never un-revealed, only rollback; 7 history grammar for secrets.
Harvest addendum built: H11a fresh-beat guard, H11b per-axis breakdown. Commits `1039a6c9`, `b143ad7b` and this record.

What was built

- Format (`engine/lifeSchema.ts`, `validate/life.ts`): `public [{label, when?, follows_feeling?, hold?}]` (at most 6, 40 chars, plain text) and
  `secret [{id, label, revealed_when}]` (at most 4) on each relationship. Refused: unknown keys, macros/markup, a public gate reading `rel_*`
  without `follows_feeling`, `hold` without it, a secret gate true at start, a secret equal to a public label, duplicate ids, undeclared gate
  keys.
- Latches (SC2 step 5, again at the entry pass): `labelLatches` in `GAME_LAYER.latchWriters` writes `life_reveal_<holder>_<toward>_<id>`
  (code int = boundary, latching, monotonic) the first boundary the gate holds; a held relationship keeps `life_label_<holder>_<toward>`
  (+ `_next`, `_since`), idempotent on the second pass. Last holding row wins.
- SC1: `ROLLBACK_DETECTORS` entry `relationship-labels` (every `life_reveal_*` / `life_label_*` key); the guard story carries labels.
- SC3/SC4: rows project through `knownEntities` (holder and target known; player always); `hasGameLayer` counts labelled relationships.
  The snapshot now passes the group's enabled members to the composer and the inline timeline (52's owed `enabled` wiring), so a member
  without a People entry is known while enabled.
- Player surface: `runtime/labelView.ts` fills `CodexSources.personRows` (holder's authored page) and a new `extraPeople` (a page for a
  holder without a codex entry). Rows `{text, kind: label|learned, fresh}`: "Toward you: wary", "Learned: secretly loyal to you",
  "Learned (toward Tom): …". Log kind `reveal`; inline chip "Revealed · Mara: …" (level 1, via `gameLayer().life.revealChips`); session
  journal `reveal` events diffed from `life_reveal_*`. `withheldNames` adds unrevealed secret labels.
- Holder's private line (first axis line of the relationship): "(shown as: wary; secretly: …, which others have not learned | which the
  player now knows)". `relationshipFeelings` (warden) is unchanged, so no secret reaches the warden or any shared text.
- Author view: `CharacterLifePanel` lists each label with its gate, which public row holds, secrets with reveal boundary + message id, and a
  "why this number" list per axis (H11b, `engine/life/beats.ts` `axisHistory`, derived from boundary history, never stored).
- H11a: `holdSameBeat` (game layer, called through `heldJournal.freshBeats`) holds a `rel_*` step whose evidence repeats the last step's beat
  within 4 boundaries (normalised equality or containment ≥ 16 chars), journaled "same beat as the last step"; the accepted beat rides
  `BlackboardDelta.beat`.
- Studio: `RelationshipLabelsEditor` under Roster (public rows with gate, follows-the-feeling, hold; secret rows with the gate builder);
  mutation `setRelationshipLabels` (composed by the agent's `setCharacterLife`, whose schema now names `public`/`secret`); diagnostics
  `relationship-label-reads-axis`, `relationship-secret-in-public`, and `disclosure-names-unknown-entity` on label text.
- Guide topic `relationship-labels` (`docs/authoring/story-guide.md`, compact twin `copilot/guideTopicsLabels.ts`, spread through
  `guideTopicsCharacters.ts` since `guideTopics.ts` is at budget), `npm run docs:guide`, `npm run docs:settings`; feature
  `relationship-labels` (characters, player); architecture note.

Floors (D, jest)

- R1 + R3: 500 random paths, 0 leaks (unrevealed text, reveal/label keys, digits in rows, learned-row count = revealed and known)
  (`runtime/relationshipLabels.review.test.ts`).
- R2: byte-identical view JSON + Journal markup with and without unrevealed secrets, 200 seeds.
- R4: 60 seeds rollback-then-replay ≡ straight (swipe/edit/delete at a random message, lagged and windowed reads), reopen, code-only boundary
  (`engine/labelRollback.property.test.ts`). Control: with the label detector disabled 20 of 63 cases fail.
- R5: a story without labels sends the same private block; non-holders unchanged (`engine/life/labels.test.ts`). Payload goldens not
  re-captured (lane).
- R6: 200 configurations of A → B labels never change B → A rows.
- R8: 120 seeds, 0 hits of an unrevealed label in other members' drafted blocks, the resting block, shared tiers + ledger, the warden's
  feelings and the player view; withheld for suggestions; the holder carries it.
- R10: labels-only story renders the People pages; a story with nothing stays null.
- R11: every label gate key offered by the discovery source within ⌈9/6⌉+2 rotations; control without the source never asks.
- R12: 500 seeds with random enabled members and an unmet People page: 0 rows for unknown holder or target, NPC-to-NPC included.
- H11a: a 6-turn lingering-mood fixture moves the axis once; a new event moves it; the same beat passes again after the window.
- Inline chip at level 1 for a known holder, none for an unknown one (`inlineTimeline.test.ts`).

Gates (2026-10-15, worktree `C:\dev\so-p51-labels`)

- `npm run gates:quick`: typecheck, typecheck:test, lint green; jest related 6,896 passed with one timing flake (`consequences.test.ts`
  C6 p95 12.6 ms under load; re-run alone 0.40 ms, green); `defect replay (--cached)` fails in this fresh worktree exactly as in 53
  (`jest --listTests` over every tracked file exceeds the Windows command line, no cache), tooling, not this change; the full replay is green.
- `npm run gates -- --jobs=2 --no-storybook` on `b143ad7b`: all green in 522.5 s (test 8,780 passed / 1 skipped, test:replay, build,
  typecheck, typecheck:test, test:debug, debug:typecheck, lint, test:release, test:plugin). The first run went red at lint (one 201-char
  story line), fixed.
- Storybook (gates hardcode port 6006): `npm run storybook:build`, then `http-server .sb-static -p 6251` + `test-storybook --url
  http://127.0.0.1:6251 --maxWorkers 2`: 145 suites, 868 tests passed.
- Main bundle `dist/index.js` 1,294,734 B before the plan 50 merge (master 1,293,107; +1,627 B: wiring, the hasGameLayer check, journal kind,
  rollback detector, beat field); label, beat, composer, Studio and inline code ride lazy chunks.
- After merging master `7a74fecc` (plan 50 story time; conflicts in the life validator, rollback registry, game layer, life snapshot, guide
  order and queue resolved side by side, arrival golden re-recorded): `npm run gates -- --jobs=2 --no-storybook` on `0c1005aa` all green in
  328.5 s (test 8,831 passed / 1 skipped, test:replay, build, typecheck, typecheck:test, test:debug, debug:typecheck, lint, test:release,
  test:plugin); Storybook on port 6251: 145 suites, 870 tests passed. Main bundle 1,296,892 B (master with plan 50 1,295,374; +1,518 B),
  3,108 B under the budget.

Live

- NOT green, owed: the branch build is not staged anywhere and no isolated ST copy was made. Scenario ready:
  `node scripts/debug/so-scenario.mts run test/scenarios/v28-51-labels.json --sandbox --group 'Group: Arin, DM Narrator'` (no-model lane,
  twice): public label on Arin's page, secret absent from the player view and the narrator's block, seeded reveal (log row, holder line),
  `assert-player-clean`, reopen equal, swipe rewinds the reveal (code-only boundary), second reopen equal. R5 payload goldens ride the same
  lane run.
- CL/RP (R7, R9) owed to the final v2.8 real-LLM suite (lab story only).

Deviations

- The reveal latch is a code int holding the reveal boundary (as codex/factions), not a bool, so author view shows boundary + message id
  without a log scan.
- No `GameView.relations`: the rows live only on People pages (`CodexEntryView.rows`), with a synthesized page for a holder that has no
  codex entry.
- `playerProjection` gains no labels at all (only the withheld list), stricter than "only revealed labels".
- Fresh-beat window counts the step's own boundary: a read up to 4 boundaries after the step is held (so the 6-turn floor moves once).
- `hold` is allowed only with `follows_feeling`; before the first boundary a held relationship shows its last holding event row.
- The label clause rides the first axis line of each relationship (one clause, not one per axis).
- Label disclosure check: label text naming a codex entry not known from the start (members without entries count as known).
- No new setup check (label gates ride the existing discovery overflow).

Unresolved questions

- `storyDiff` has no label case: a secret whose gate or text is rewritten keeps its latch by id (52's id + rev + gate would fit).
- Should a member switched off in the group keep their People page labels once known? (Today: known only while enabled, unless an
  authored People entry is latched.)

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §Addenda requiring correction. Verified on `e8b9dd6d`.

- **P1 — a four-boundary window cannot guarantee "at most once across six turns"; source-event identity and temporary
  suppression are different contracts.** Accepted (`src/engine/life/beats.ts:6,46-60`). → contract restated as temporary
  repetition suppression; source-event identity recorded as a later option.
- **Reconcile with the built implementation.** Accepted. → H11a/H11b marked built with file:line.
- Rebutted: none.

## Live gate 2026-10-16 (no-model lane, branch `v2.8-owed-live-fixes`)

- Setup: no-model offline lane 61 (`SO_LANES_ROOT=C:/dev/so-live-lanes`, `SO_LANE_OFFLINE=1`, no server plugins, no GPU,
  images and sprites off). Main build: master `7b3ef38b` (bundle `1d806c43b088`) staged into a private ST copy
  `C:/dev/st-live-owed`, because `C:/dev/st-live` was restaged by a parallel agent mid-batch (two runs died on
  `Loading chunk ... failed`; those runs are discarded). Served `dist/index.js` hash checked before and after every batch.
- Each item `st-lanes.mts batch --lanes 61 --repeat 2 --strict`; batch dirs under `C:/dev/so-live-lanes/61/debug/batch/<stamp>/`,
  archived with `so-evidence.mts archive --label owed-nomodel-2026-10-16`.
- `test/scenarios/v28-51-labels.json`: green x2 on `d1f9ede2` (batch `2026-10-16T17-40-07-788Z`) and x2 on `7b3ef38b`
  (batch `2026-10-16T18-34-44-462Z`). Seeded reveal, no model: plumbing.
- Still owed: R5 payload goldens (no c0 baseline captured); CL/RP R7, R9 in the final real-LLM suite.

## Folds from v2.9 triage (applied 2026-10-25, owner)

- G05 slow-burn caps; G06; N06 mood causes; A08.
- Source: `docs/plans/v2.9/01-triage-sol.md`. Not built; each item is scheduled with this plan's next build pass.
