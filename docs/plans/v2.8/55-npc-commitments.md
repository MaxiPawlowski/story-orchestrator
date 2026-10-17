# Plan 55 — NPC commitments to the player

**Status: queued (M55); option A built 2026-10-17 on `v2.8-queue-55-45e-52e` (not merged; §Gate record 2026-10-17); B owed.** Was: candidate, owner decision pending. Written 2026-10-14 from the Astra review's brainstorm (owner approved
writing it the same day). Not built, not queued. Implementation tier **D**; acceptance **D** + **LT/RP** (does the
holder honour or raise it, on the main reply model) + **CL** (option B's read lines only). Overview:
`00-overview.md` §Rules (this folder). Shared boundary contract: v2.8 52 §Review 2026-10-14 (Astra), SC1–SC5.

## What it is

- The reciprocal of v2.8 47. A character can commit to the player ("I will get you past the gate", "I owe you for the
  river"), and the story remembers it: the holder knows it owes the player, can raise it, keep it or (on an evidenced
  event) break it.
- A commitment is a typed record on the **holder** (a roster member): to whom (the player), what, when it was made,
  an optional due point, and a state `made | kept | broken`, with `overdue` derived.
- It is resolved through machinery that exists: gates, latches in the latch pass, the holder's private life block,
  earned effects. No automatic player debt: the player owes nothing because a character offered something.
- Characters with recognisable intentions toward the player, not a task list: the player sees a commitment only where
  it was made in their hearing, and the holder is the one who brings it up.

## History and evidence

- `review-astra-2026-10-14.md` §Plans 48-53, "Up to five additional mechanics" 1: "NPC commitments to the player. The
  reciprocal half omitted from plan 47: authored or accepted commitments, resolved through existing agenda/state
  machinery". Build order: "build NPC commitments and social permissions first".
- Same review §Plans 42-47 brainstorm 1: "NPC favors and assurances … no automatic player debt."
- v2.8 47 §Unresolved: "Do NPC promises to the player matter (the mirror case)? Out of scope for v1."
- `src/memory/contract.ts:31`: `[intends]` is a character's own goal, "never the player's"; it is not a commitment to
  the player and carries no state.

## Current state in code

Verified on master `3a716f2b`.

- **Agendas** are NPC goals with steps, pace and effects (`Agenda`, `AgendaStep` with `when`, `effect`, `public`,
  `src/engine/lifeSchema.ts:31-50`); landed steps are detected by `landedSteps` (`src/engine/life/lines.ts:70-77`) and
  their `world_info` replays through `agendaWorldInfo` (`:60`) and `earnedWorldInfo`
  (`src/runtime/worldInfoGates.ts:50-51`). An agenda is about the member's own goal, not an obligation to the player.
- **Quests** carry a `giver` and `done_when`/`failed_when` (`src/engine/gameSchema.ts:57-72`): an author can model a
  commitment as a side quest today, but it is the player's task, shown to the player as one.
- **Private block**: `privateLifeLines` (`src/engine/life/lines.ts:45-58`) composes relationship, mood and meanwhile
  lines per drafted member, filtered through `withoutSecretLines` in `MemoryInjector.lifeLines`.
- **Earned effects** accept origins `quest | agenda` only (`src/runtime/effectsApplier.ts:83-88`).
- **Player-line evidence** exists (`commit_evidence`, `src/engine/schema.ts:90`; guard `src/extraction/commitGuard.ts:225-232`
  reads `isUser` lines only). No member-line evidence guard exists.
- Nothing named "commitment" exists in `src/engine` or `src/memory`.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored commitments** | `life.members[].commitments[]` with `made_when`, `kept_when`, `broken_when?`, `due?`; latched in the latch pass; holder line; player sees it on the holder's person page once made in their hearing | S–M | author work; only foreseen commitments |
| **B. A + accepted from play** | the shared read emits `[pledged] Holder | what | by <when>` for a member's own line; accepted only when a **member** line in the window carries it (a member-line twin of the commit guard) | M + read lines | false pledges from quotes, sarcasm, hypotheticals; shares 47's line budget |
| **C. Quests with a giver** | status quo | 0 | the commitment reads as the player's task |
| **D. Nothing** | | 0 | one-sided promises (47 only) |

## Recommendation

**A now; B after v2.8 47's read lands**, sharing its line family and dedup.

- **Format** (lazy game layer, `engine/validate/life.ts` style): `life.members[].commitments: [{id, to: "player",
  what, made_when, kept_when, broken_when?, due?: {story_day | boundaries}, effect?: {world_info?, npc_replies?}}]`.
  `what` ≤ 160 characters, plain text. At most 6 per member.
- **State.** Latch `life_commit_<member>_<id>` (code enum `made | kept | broken`, latching per value) written in the
  latch pass (SC2 step 5, re-run at step 7). `overdue` is derived (due passed, or no due and ≥ 12 committed boundaries
  open), never stored. Rollback detector registered (SC1).
- **Broken needs an event.** `broken_when` may not be satisfiable by time or absence alone (the 53 rule: no gate made
  only of time keys, `== false`, start values or a top-level `not`). Overdue is never broken.
- **Holder line** (private block, holder only): made and open: "You told the player you would <what>. It is not done
  yet; it is yours to keep, raise or explain." Overdue adds "It is overdue." Kept, once: "You kept your word to the
  player: <what>." Never an instruction about the player.
- **Player view.** On the holder's person page (v2.8 52), "Promised you: <what>" with state words (open, kept, broken)
  — only when the holder is known (SC3) **and** the commitment was made in the player's hearing (the `made_when` latch
  boundary had the player present; with v2.8 42, its witness record; until then an author flag `heard: true`, default
  true). No overdue marker, no countdown.
- **Kept effect.** Optional `effect` applies through the earned path; `EarnedEffects.kind` gains `"commitment"` and
  `earnedWorldInfo` replays it from the latch.
- **Director.** Open commitments of present members join the director's hook list as world-side hooks ("Mara has
  promised to …") — a member's own act, so no agency conflict.
- Studio editor under Characters, wizard tool field in the character-life tool, guide topic `commitments`, registry
  feature `npc-commitments` (on by default, rule 9).

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| M1 | Rollback ≡ replay of commitment latches over 4 seeds (swipe, edit, delete, reopen) plus a code-only boundary (SC1) | 4/4 + 1 | D |
| M2 | Holder only: the commitment line appears in the holder's drafted request only; 0 in other members, the resting block, shared tiers, canon, WI mirror (payload goldens) | 0 hits | D |
| M3 | Never broken by time: a `broken_when` of time keys, `== false`, a start value or a top-level `not` is refused; property: no commitment reaches `broken` without its event key changing | 100 % | D |
| M4 | Player view discloses only what was heard: ≥ 500 seeds; no commitment text for an unknown holder or one made out of hearing | 0 leaks | D |
| M5 | No player debt: no player-facing text frames an obligation of the player; no player reminder (string property over player surfaces) | 0 hits | D |
| M6 | Feature-only fixture: a story with only commitments renders them (SC4) | holds | D |
| M7 | Holder raises an overdue commitment: scripted lab session, overdue at turn 0, holder mentions it within 6 of its drafted turns in ≥ 6/10 runs (baseline without the line recorded beside it) | ≥ 6/10 | LT or RP |
| M8 | B only: labelled member-line set (≥ 40 pledges, ≥ 40 non-pledges incl. quotes, sarcasm, hypotheticals, a pledge attributed to another member): precision ≥ 0.95, recall ≥ 0.70 | as stated | CL |

Synthetic English lab stories only; the owner spot-checks synthetic rows (rule 11).

## Gates by tier

- **D:** `npm run gates` (validator incl. M3, latch pass, holder line, projection, M1–M6; Storybook for the person-page
  row and the Studio editor); payload goldens (M2); guide and tools coverage; a no-model lane scenario: a commitment is
  made, kept, swiped back to made, reopened identical; `so-ui.mts assert-player-clean`.
- **LT/RP:** M7 in the final v2.8 suite (rule 8), lab story only.
- **CL:** M8 with option B.

## Privacy and spoiler notes

- Holder-only model text (M2). A commitment made in private to the player is in the transcript the player sees;
  one made out of the player's hearing never reaches a player surface (M4).
- An author can hide a commitment entirely (`heard: false`) for a twist; it then lives in the holder's block only.
- No Adolion content here.

## Dependencies and links

- **v2.8 47** promises (the player's side): B shares its line family and acceptance shape; a member-line guard is the
  twin of 47's player-line guard.
- **v2.8 52** codex: the person page, `knownEntities`. **v2.8 42**: "in the player's hearing".
- **v2.8 50** calendar: `due` on story time. **v2.8 59** reconciliation: a broken commitment is a natural rupture.
- **v2.7 37** agendas: a commitment may share an agenda's gates; it is not an agenda step.

## Decisions for the owner

1. **Option A now, B after 47's read?** **Recommended: yes.**
2. **Player sees a commitment only when made in their hearing, with no overdue marker?** **Recommended: yes.**
3. **Broken requires an affirmative event, never time?** **Recommended: yes.**
4. **Open commitments as director hooks?** **Recommended: yes**, present members only.
5. **A kept commitment may fire an effect** (`world_info`, `npc_replies`)? **Recommended: yes**, through the earned path.

## Unresolved questions

- Commitments to another member (NPC-to-NPC): out of scope; agendas cover them.
- Should a kept commitment move a relationship axis? Proposed: no in v1; an author gates a 51 label on the latch.
- Cap values (6 per member, 160 characters, 12 boundaries) are placeholders until the editor is drawn.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted). First verified against master `9e96871d`; revised 2026-10-16 on `e8b9dd6d` after `review-astra-harvest-2026-10-16.md`. The owner decides with the rest of this plan.

- **H13a message ids on pledge lines**: option B's `[pledged]` line carries `m=<id>` like v2.8 47's `[promised]` (built there,
  `src/memory/promises/contract.ts:7,15`), resolved to a source span with its **revision** (`src/memory/audience.ts:10`); a
  quote not in the cited message is refused (`docs/plans/v2.8/extension-research-2026-10-14/timeline-memory.md` P1). Not built (55 is a candidate).

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §Addenda requiring correction. Verified on `e8b9dd6d`.

- **43/47/55 — message ids need revisions.** Accepted. → the pledge line binds to a span with revision, as 47 does.
- Rebutted: none.

## Gate record (2026-10-17, branch `v2.8-queue-55-45e-52e`, from master `64287be2`)

Queued as M55; built option A with the plan's recommended decisions 1–5 (taken as recommended, the owner did not answer
them separately). Option B is not built: its acceptance needs M8, a CL rate on a labelled member-line set (≥ 40 pledges,
≥ 40 non-pledges), and its `[pledged]` read line can only be accepted after a model run on that set. Owed, not red.
Not merged, not pushed.

What landed

- Format `roster[].commitments[]` (`engine/lifeSchema.ts` `Commitment`, `commitKey`, `isCommitKey`), parsed and compiled in
  `engine/validate/commitments.ts` (game layer, called from `validate/life.ts`): at most 6 a member; `what` plain text up to
  160 characters; `to` is the player only (another value is refused: between members use an agenda); `made_when` a gate or
  `"start"`; `kept_when` a gate (refused when it holds at the start); `broken_when` through plan 53's inaction rule
  (`commitment-broken-on-inaction`: a top-level `not`, time keys only, `== false`, `!= true` or a start value); `due`
  `{boundaries: 1–200}` or `{story_day}` (needs a clock); `heard` (default true); `effect` through the agenda step-effect
  reader (`world_info`, `npc_replies` with trigger `onEnter`).
- State: three latching, monotonic code ints `life_commit_<member>_<id>_made|kept|broken` (the boundary of each step; see
  Deviations), written by the latch pass (`GAME_LAYER.latchWriters`: SC2 step 5, again at step 7 after a fired transition).
  A pass moves a commitment one step: made, then kept, or broken; kept wins when both hold. Rollback detector
  `commitments` (SC1, `rollbackDetectors.ts`), and the guard sees every compiled key.
- Holder line (`engine/life/commitments.ts` `commitmentLines`, in `privateLifeLines`, holder only, through the memory
  injector's private block and so `withoutSecretLines`): the open line, "It is overdue." once `due` passed or after 12 open
  boundaries, and the kept line on the boundary it was kept. `privateLifeLines` now takes the boundary
  (`MemoryInjector` passes the engine's).
- Player view (`runtime/commitmentView.ts` `peopleSources`): "Promised you: <what> (open|kept|broken)" rows (kind
  `promised`, `fresh` on the boundary they changed) on the holder's People page while the holder is known (SC3
  `knownEntities`) and `heard` is not false; merged with plan 51's label rows; a page is added for a holder without a codex
  entry. No overdue marker, countdown or player reminder.
- Director: open, heard commitments of members who are not away by schedule head the living director's `plans` list
  ("Mara has promised the player to …"), capped with the agendas at 8 (`livingUnit.directorInput`).
- Kept effect: `EarnedEffects.kind` and the effect origin gain `commitment`; `gamePort` dispatches a kept commitment's
  effect once; `earnedWorldInfo` replays kept `world_info` from the latch through the lazy `life.lifeWorldInfo` (agenda
  steps + commitments), so a swipe switches it back.
- Discovery: `commitmentDiscoveryUnits` (plan 52 rotation) offers `made_when` keys before, `kept_when` / `broken_when`
  keys while open, nothing after.
- SC4: `hasGameLayer` and `usesGameLayer` count commitments.
- Author view: Character life lists each commitment with state, boundary, overdue and out-of-hearing
  (`lifeSnapshot.commitments`, `CharacterLifePanel`).
- Studio: `CommitmentsEditor` under Roster (gate builders for made / kept, optional broken, due, heard, effect as JSON),
  mutation `setCommitments`; `CHARACTER_LIFE_FIELDS` and the wizard tool `setCharacterLife` carry `commitments`. Studio
  diagnostics `commitment-broken-on-inaction` (blocking) and `commitment-what-names-a-side` (warning: "you", "I", "me" in
  `what` reads wrong on one side).
- Guide topic `commitments` (doc section "Promises to the player", compact twin `copilot/guideTopicsCommitments.ts`,
  coverage table), feature `npc-commitments` (player, on by default, Help → Journal › People), `docs:guide`,
  `docs:settings`, plan 24 matrix row, synthetic fixture `test/fixtures/npc-commitments.story.json` (arrival golden
  re-recorded in its own commit).
- Main bundle: 1,284,196 → 1,285,150 B for all three queue items (M55, M45e, M52e; ceiling 1,288,000). Main holds only the
  latch/door wiring (`gamePort`, `worldInfoGates`, `memoryInjector`, `lifeSnapshot`, schema constants); logic rides the game
  layer, the game composer and the Studio chunks.

Floors (D, jest `src/runtime/npcCommitments.review.test.ts`, all green)

- M1: 60 seeds, rollback then replay ≡ the straight run with detection complete; swipe / edit / delete of the keeping reply
  (rollback from its message) returns the commitment to made, live and after a reopen (hydrate); a code-only boundary (the
  kept latch is the only change) is detected. Met.
- M2: 150 seeds through the real `MemoryInjector`: each open commitment's line in its holder's drafted block (carried 100+
  times), 0 in other members' blocks, the resting block, shared tiers, the ledger and the player view. Payload goldens on
  lane 81 (below): 31 of 31 captures identical over 6 cases for stories without commitments. Met; no payload case carries a
  commitment yet (owed with the next payload-case refresh).
- M3: refused: 4 of 4 inaction shapes, plus kept at the start, a promise to a member, `due.story_day` without a clock, an
  underscore id, no `kept_when`. 400 random walks: every broken latch lands on a boundary where its event key is true; 0
  with only time passing. Met.
- M4: 500 seeds: 0 text of the out-of-hearing promise, 0 of an unknown holder's; shown rows equal the expected heard rows.
  Met.
- M5: 500 seeds: 0 obligation framing, overdue, due, countdown or reminder words on player surfaces. Met.
- M6: a commitments-only story renders the holder's page; one with nothing stays `game: null`. Met.
- M7 (LT or RP): not run. Needs Artemis on the 3090, which the text suite owns; lab story ready
  (`test/fixtures/npc-commitments.story.json`, `mara.gate` with `due: {boundaries: 4}`). Owed, informational.
- M8: only with B; owed with B.

Live (no-model lane 81, plumbing; real-LLM owed)

- Private ST copy `C:/dev/st-live-q55` (code tar of `st-live`, `node_modules` junctioned), lane 81 under
  `C:/dev/so-live-lanes` seeded from offline lane 61's data (offline marker kept; no server plugins, images and sprites off).
  Branch build `4c82f465` staged, served `dist/index.js` sha256 `48986980ead4` before and after every batch.
- `test/scenarios/v28-55-commitments.json` green ×2 (batch `81/debug/batch/2026-10-17T06-50-54-569Z`, plus a first single run
  `2026-10-17T06-48-43-110Z`): made → "Promised you: … (open)" and the holder line in Arin's applied private block, not in
  the narrator's; kept → "(kept)" and the kept line once; `assert-player-clean` after each; reopen identical; a swipe of
  the keeping reply returns it to open and the open line comes back; second reopen identical.
- Payload goldens: master `64287be2` (served `557d5bc013d9`) against the branch (served `48986980ead4`) on lane 81,
  `so-payload-golden.mts diff`: "payload invariance: identical", 31 of 31 captures over 6 cases
  (`C:/dev/so-live-lanes/81/payload-q55/{base,q55}`).

Gates

- `npm run gates -- --jobs=1 --no-storybook` on `2679d8e6`: all green in 456.6 s (test 9,664 passed, 1 skipped, 831 suites;
  test:replay, build, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin, test:release). The first run
  on `4c82f465` was red on two guards: the arrival golden did not list the three new lane scenarios, and the error-copy
  inventory lacked the shelf's metadata probe; fixed in `7be13226` (census row) and `2679d8e6` (golden re-recorded alone).
- Storybook (static build, `http-server .sb-static -p 6290`, test-runner `--maxWorkers 1`): the first run was red on 2 suites
  (SettingsPanel's fake manager had no `carry`; TrophyShelf's fit stories asserted a closed `<details>` visible), fixed in
  `5dc9d941`; then 151 suites, 916 tests passed.
- `npm run gates:quick` on `5dc9d941` (the last change, lazy component and stories only): green (typecheck, typecheck:test,
  replay cached, jest related 7,301 passed). Main bundle unchanged (served `48986980ead4`); v28-45e-shelf re-run ×2 green on
  the restaged build (batch `81/debug/batch/2026-10-17T07-53-47-114Z`).
- Evidence archived to the private tree: `so-evidence.mts archive --label q55-55-45e-52e-2026-10-17 --lanes 81` (117 files,
  gitignored `test/sessions/evidence/phase-c/`; `sessions:archive` not run: no push from this task).
- Main bundle `dist/index.js` 1,285,150 B (master 1,284,196; ceiling 1,288,000; budget 1,300,000).

Deviations

- State is three latching int keys `_made`, `_kept`, `_broken` (the boundary of each), not one latching enum
  `life_commit_<member>_<id>`: the blackboard freezes a latching enum on its first value, and the boundaries are what
  overdue and the fresh marker read.
- "Made in the player's hearing" is the author flag `heard` (default true). Plan 42's witness record is not consulted: it
  records messages and the latch is a gate.
- No holder line for a broken commitment (the plan names none); kept wins over broken when both hold in one pass.
- Director hooks are the head of the living director's `plans` list; no other director gets them.
- `effect.cast_changes` is refused (the agenda rule); Studio edits `effect` as JSON.

Owed

- M7 (Artemis, lab story); B with M8 and its read line (after 47's read, a CL run); a payload case that carries a
  commitment (M2 on the commitment's own prompt).
- Adolion: not changed. Whether the campaign declares commitments is the owner's call (content review by another model).

Design questions (recommendation first)

- A broken commitment gives the holder no line. Recommended: one line on the boundary it broke ("You did not keep your
  word to the player: …"), so the holder can own it; it is model-facing, so it waits for the owner.
- `heard` and plan 42: when 42's witness record gains `player: present`, derive `heard` from the made boundary's messages
  and keep the flag as an override. Recommended: yes, as a follow-up row.
- One `what` serves both sides ("You told the player you would …" / "Promised you: …"); a warning flags you/I/me.
  Recommended: keep one field; add a `player_text` only if authors hit the warning often.

## Follow-up 2026-10-17 (branch `v2.8-q55-followup`, from `6dfc1ee1`)

Owner decisions on the 2026-10-17 design questions (go-with-recommendations rule, relayed by the coordinator): Q1 yes,
built here; Q2 yes, as queue row M55w, not now; Q3 keep one `what` with the warning; (52e: no log row; 45e: no own feature).

- Q1 built: on the boundary a commitment breaks, its holder's private block carries "You did not keep your word to the
  player: <what>." once, through the same holder-only path as the kept line (`engine/life/commitments.ts`
  `COMMITMENT_COPY.broken`, `commitmentLines`); the next boundary it is gone. Guide doc and compact topic updated,
  `docs:guide`. The 2026-10-17 deviation "no holder line for a broken commitment" no longer holds.
- Test (`runtime/npcCommitments.review.test.ts`, "Q1"): through the real memory injector the broken line is in Mara's
  drafted block on the breaking boundary and not the open line; 0 in other members' blocks, the resting block, shared
  tiers and the player view; gone a boundary later; a swipe of the breaking reply restores the open line. 81 of 81 green.
- Payload case carrying commitments (M2 on the commitment's own prompt, owed in the first record):
  `test/scenarios/payload/group-commitments.json`, 7 captures (open-rest, open-arin, open-dm, kept-arin, kept-dm,
  broken-arin, broken-dm) with in-case assertions: Arin's block carries both open promises and the out-of-hearing one
  (holder only), then the kept line once, then the broken line once; the resting payload and the narrator's carry none of
  them. Captured twice on no-model lane 81 (private copy `C:/dev/st-live-q55`, served `98b5845bbee1`), every assertion
  green, `so-payload-golden.mts diff` r1 against r2: 7 of 7 same, "payload invariance: identical"
  (`C:/dev/so-live-lanes/81/payload-q55b/{r1,r2}`). No committed baseline is added (none of the payload cases has one in
  `test/measurements/v2.7/payload/`).
- Main bundle 1,285,163 B (ceiling 1,288,000).
- Gates: `npm run gates -- --jobs=1 --no-storybook` on `089bfbbc`: all green in 446.9 s (test 9,677 passed, 1 skipped; replay,
  build, test:debug, typecheck, typecheck:test, lint, debug:typecheck, test:plugin, test:release). The first run on `30b26053`'s
  working tree was red only on the arrival golden (the new payload case), re-recorded alone in `089bfbbc`. Storybook not
  run: no component or story changed.
