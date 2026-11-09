# v3.0 48 — Quest resolutions and consequences

Status 2026-11-09: BUILT, merged and pushed; no-model scenario ×2 PASS; real-model journey INCOMPLETE (harness, fixed; rerun ×2 owed) and Sol reflection floor owed. Source: owner conversation with Astra 2026-11-08 (summary kept outside the repo),
reviewed against master `1aaa7ca09`. Second opinion: codex `gpt-6.1-sol` (§Second opinion). Plans 49-55 build on this one.

## Owner decisions 2026-11-08

1. An offered quest may lapse on story time alone, as a neutral `lapsed` resolution (`from: ["offered"]`, a gate on time
   keys only). Never worded as a broken promise: the validator refuses a time-only resolution reachable from `offered`
   unless its id is `lapsed`, and `failed_when` on an offered quest still never fails on time alone.
2. Pressures that move on events or story time are fine: the world moving on, not punishing a missed roll (plan 49).
3. Resolutions get a switch, on by default. Off ignores resolutions and never invents consequences.
4. `quest_<id>_rewarded` is replaced outright, no alias. Running chats need Restart; no migrations.
5. Sol ratings are approved for this plan's floors.
6. No third-party text bundled; links only.
7. Situations are fields on a quest first (plan 49). Optional and alternative steps (`steps[].optional`,
   `steps[].alternative_of`) are built here, in 48.
8. Plan 53 waits for the playtest.

Coordinator calls on the build questions (2026-11-08, for the owner): `lapsed` is strict and reserved (a `lapsed` that is not a
time-only offer end is refused); ending and consequence labels over 40 characters are a Studio warning (`quest-label-long`),
not an error; a reward keeps raising standing as before, consequences only through a faction move gated on the resolution.

## Resume 2026-11-08 (paused on owner overload, WIP on `v3.0-48-resolutions`)

Built, not yet gated (only focused jest runs, all green except where noted):
- engine: `quests.ts` (endings = sugar + `resolutions`, precedence, hold, single-snapshot close + aggregated consequences,
  `quest_<id>_<res>_c_<cid>` latches, `questLatchKeys` detector), `questSimulation.ts`, switch via `EngineHost.questResolutions`;
  `validate/quests.ts` (resolutions, consequences, precedence/overlap proof, lapsed rule, requires objects,
  optional/alternative steps); echoes/patterns take resolution ids; storyDiff; WI census + earned switches; gamePort dispatch.
- runtime: consequences recap, widgets/journal labels + outcomes, playerProjection withholds unreached labels, promises
  (other resolutions release), checks `quest-resolution-ambiguous` / `quest-consequence-conflict`, feature rows
  `quest-resolutions`, `story-record` (featureSwitches.*).
- 54: `runtime/storyRecord.ts`, Author console section `record` (`RecordSection.tsx` + story).
- Studio: `QuestResolutionsPanel` (matrix, simulator), `questMatrix.ts`, diagnostic `consequence-write-conflict`.
- Guide: `quests` rewritten, `quest-resolutions`, `quest-consequences` (`guideTopicsQuests.ts`, story-guide.md).
- Tests: `questResolution.test.ts`, `questResolution.property.test.ts` (200 seeds shuffle + rollback), `storyRecord.test.ts`.

Update 2026-11-08 (second pause, owner): done since: wizard `quest-line` recipe + `simulateQuest` read tool (author Ask too);
coordinator calls applied (`lapsed` reserved, `quest-label-long` warning, reward keeps `rep_` add); surface/simulator/matrix tests
(`runtime/questResolutionSurfaces.test.ts`); no-model scenario `test/scenarios/v30-48-resolutions.json` (not run); real-model
journey `test/journeys/quest-resolutions.journey.json` (owed, GPU paused). `closed` enum now always holds done and failed plus the
resolution ids, and echoes/patterns accept done/failed on any quest (the pinned campaign gates `in [done, failed]` on quests
without failed_when). Last `gates:quick` (before those two fixes): typecheck ok, typecheck:test ok, replay ok; lint FAIL
(cause not captured) and jest 14 suites red, known: adolionPinnedBuild + chanceAdolion (the enum fix above), loreStateRead
(test read unlatched values; fixed). Resume: rerun `gates:quick` via heavy.mjs with full output, fix the rest, then the list below.

Next (remaining): wizard `quest-line` recipe rewrite + `simulateQuest` read tool; tests for questMatrix/simulator/projection spoiler scan;
`npm run typecheck`, `typecheck:test`, lint, `gates:quick`; `docs:guide`, `docs:settings`; no-model lane scenario +
`quest-resolutions.journey.json` (GPU owed); merge master; full `npm run gates`; gate records in 48 and 54.


Owner 2026-11-08: "make better quests that properly integrate into the story to make it richer, not just to drive the
player from A to B." A friend's prepared quest had several outcomes, each with its own rewards or consequences. Today a
quest ends `done` or `failed` and only `done` pays.

## Review (verification of the Astra summary against the code)

Verdicts: 17 accurate, 5 partly, 0 wrong. Astra worked from the source alone and never ran the app. Its code reading
holds up; the gaps are in what it missed.

Claims:
- Done/failed, failure wins when both hold: **accurate**. `engine/quests.ts:12` checks `failed_when` before `done_when`;
  guide topic `quests` says the same.
- One reward, applied only on done: **accurate**. `quests.ts:82` skips unless status is `done`; `gameSchema.ts:53-58`
  has one `reward`. Its host effects (WI, cast, NPC replies) dispatch on the `quest_<id>_rewarded` flip (`runtime/gamePort.ts:21-26`).
- `requires` means success; failure cannot open a quest through it: **partly**. The shorthand compiles to
  `quest_<id>_closed == "done"` (`validate/quests.ts:210`). But `quest_<id>_closed` is a declared code enum
  (`validate/quests.ts:271-273`), so any gate can read `== "failed"`, and echoes take `after: {quest, to: "failed"}`
  (`engine/echoSchema.ts:17-22`). Failure-led follow-ups are possible, just not in the shorthand.
- Default completion = every step: **accurate** for a quest with no `done_when` (`validate/quests.ts:109-112,140`).
  Quest-level `done_when` overrides it. The pinned campaign: 62 of 62 quests have steps; 1 has `failed_when`; 0 have a
  reward (counts only).
- One giver: **accurate** (`gameSchema.ts:77`, `validate/quests.ts:120,255`).
- Hidden or offered quests cannot resolve: **accurate**. `quests.ts:11` returns `hidden`/`offered` before reading
  `done_when`/`failed_when`. Nuance: a quest whose `done_when` already holds closes on the boundary it turns visible.
  "An offered quest never fails" is a rule (`validate/quests.ts:251-254`, guide), so decline/ignore has no ending.
- Wizard recipe asks for steps, an ending, a reward: **accurate** (`copilot/agent/recipes.ts:34-52`).
- Keep list (deterministic gates, boundary commits, provenance, rollback, host-effect ledger, per-character knowledge):
  **accurate**. All exist (`engine/engine.ts:104`, `memory/provenance.ts:20-34`, `runtime/effectsApplier.ts` `withLedger`,
  `memory/heldSecrets.ts`).
- `applyQuestRewards`, `gamePort.ts`, `EffectsApplier`, `QuestsEditor.tsx` named as reuse points: **accurate**
  (`quests.ts:74-93`, `runtime/gamePort.ts`, `studio/components/QuestsEditor.tsx`).
- Agendas are a goal plus a step sequence paced by chapter or N boundaries: **accurate** (`engine/lifeSchema.ts:61-75`,
  `engine/life/derive.ts:27-35`; a step may wait on `when`).
- The off-stage prompt supplies the author's next step: **partly**. The meanwhile proposer prompt does
  (`runtime/meanwhilePrompt.ts:30` "the author's next step"). The member's own private life block lists only steps
  already done (`engine/life/lines.ts:46-63`).
- `Commitment` only targets the player: **accurate** (`lifeSchema.ts:128-140`, `to: "player"`). These are NPC-to-player
  promises; the player's own promises are a separate store (`memory/promises/`).
- Director safeguards (open threads, private plans, faction standing, refusals, agency): **accurate**
  (`generation/living/prompt.ts:85-95`, `living/guard.ts`, `living/refusal.ts`).
- Director output is the next turning point with entry conditions: **accurate** (`prompt.ts:74`, `living/types.ts`
  `DirectorDraft`).
- Several leads converge on one destination: **accurate** by design. Plan 43 P3: `opens_when` holds 2-3 leads into one
  anchor (`prompt.ts:44`). Branches must come back (`prompt.ts:166`).
- The director records no cause: **partly**. Drafts carry `builds_on` (a thread) and `reason` (one sentence for the
  author) (`prompt.ts:112`, `types.ts:74`), and the scene test freezes `focus` (`living/sceneTest.ts`). What is missing:
  a set of candidates, and the reason one was chosen over the others.
- Pacing escalates destination prompts up to a deadline or someone urging: **accurate**
  (`pacing/steering.ts:66-70`, pull stage `strong`).
- A long, enjoyable conversation reads as stalled: **partly**. The stuck ladder counts quiet player turns since a
  watched exit key last moved (`pacing/stuck.ts:46-52`), so talk that moves no gate key climbs rungs. But the ladder only
  offers leads, never forces (`stuck.ts:55-66`). The pull runs only on open stretches. Tension steering follows the arc
  target, not a stall reading.
- Epistemic kinds with provenance: **accurate** (`memory/types.ts:111`, plus `unaware`; `memory/provenance.ts:20-34`).
  Correction: provenance records which pipeline wrote a row (extractor, judge, author…), not which character told whom.
  The audience contract (`memory/audience.ts`, `told`/`believed` relations) is the closer fit for "who supplied a claim".
- Factions are standing only: **accurate**. `engine/factionSchema.ts:14-30` holds standing toward the player, moved by
  authored `moves`. No faction objective, means or opposition.
- Delayed consequences need agenda/echo machinery with cancellation: **partly**. It exists already: echoes have `delay`,
  `when`, `cancel_when`, `expires`, and `after` a quest end (`echoSchema.ts:17-35`). Only resolution ids are missing.
- Ironsworn SRD and oracle text are CC BY 4.0, books and art are not: **accurate** (§Licences in `55-situation-recipes.md`).
- Owner rule "an offered quest never fails on time alone" is in force (`validate/quests.ts:252-254`). Astra's
  "expiring opportunity" pattern collides with it (§Unresolved questions).

What Astra missed (all on master):
- Game layer latch pass and boundary order SC1 (`engine/engine.ts:104` `BOUNDARY_STEPS`): `quests` runs after `derive`,
  before `latch`. So faction moves, codex and labels gated on a quest end already land in the same boundary.
- Echoes after a quest end (`echoSchema.ts:19`). Pattern rules over quest statuses (`engine/patternSchema.ts`,
  `PATTERN_QUEST_STATUSES`). The consequences recap with "Because you…" (`runtime/consequences.ts`, boundary work `recap`,
  order 7).
- Checks already have graded outcomes (`miss|weak|strong`, `gameSchema.ts:97-119`): partial success exists for checks,
  not for quests.
- Faction moves on any gate (`factionSchema.ts:14-19`). Rumors (`engine/rumorSchema.ts`, `memory/rumors/`). Player
  promises (`memory/promises/`). NPC commitments. Witness record (`memory/witness/`, unconsumed after the W4 FAIL). Scene
  test (`living/sceneTest.ts`). Meanwhile agenda proposals (`runtime/agendaProposals.ts`). Encounter offers on open
  stretches (`pacing/steering.ts:74-84`). Stuck leads and multi-lead turning points (43 P1/P3). Checkpoint `motives`
  (`schema.ts:234`).
- `storyDiff` already diffs quests (`engine/questDiff.test.ts`). The check registry is the one home for diagnostics
  (`runtime/checks.ts`). The wizard has `simulateWalk` (`recipes.ts:45`).
- Two name collisions. `Story.outcome` is New Game+ carry (`engine/carrySchema.ts:94`), and `patterns` is the sequence
  rule feature. So this plan says **resolutions**, and plan 55 says **recipes**.

What would clash with invariants:
- Boundary order: resolutions must be decided inside the existing `quests` step, never in a new step and never after
  `select`. One transition per boundary is untouched, because quests never fire transitions.
- Rollback: every new compiled code key needs a `ROLLBACK_DETECTORS` row or an exemption
  (`engine/rollbackDetectors.ts:46` holds `quests` today).
- Held secrets: resolution and consequence labels are player copy and author copy. A label that restates a held secret
  would leak through the journal and recap; it goes through the same resting filter as recap lines.
- Player projection: a resolution the chat has not reached must never reach a player surface, player Ask or the
  director (`runtime/playerProjection.ts`).
- Engine purity: deciding a resolution is pure (`engine/quests.ts`). Host effects stay on `gamePort` →
  `EffectsApplier.withLedger`.
- Today's evaluation is array-order dependent. `applyQuestRewards` closes quests one by one on the live blackboard
  (`quests.ts:76-79`), so quest B reading `quest_A_closed` closes this boundary when A comes first in the list, next
  boundary otherwise. A reward write that satisfies another quest lands one boundary later. The design below removes
  both.

## Design

Lifecycle and resolution are separate. Lifecycle: `hidden | offered | active | closed`. Resolution: an authored id
that names what happened, not success or failure.

- `quests[].resolutions[]`: `{ id, when, label, recap?, from?, consequences? }`.
  - `id`: slug, unique within the quest.
  - `when`: the gate.
  - `label`: player copy, shown only once reached.
  - `from`: `["active"]` by default. `"offered"` lets a quest close without being taken up (decline). It must not be
    time alone (the existing rule).
  - `consequences[]`: `{ id, when?, set?, effects?, label?, visible_when? }`. `when` is the conditional clause ("if
    violence was used").
- Sugar: `done_when` is the resolution `done`, `failed_when` the resolution `failed`, `reward` a consequence of `done`.
  A quest with neither form never closes (refused at validation, as today).
- Ambiguity: `quests[].precedence: [resolutionId…]` is required once two or more resolutions exist, unless the
  validator proves them exclusive. Proof is cheap and conservative: the same key compared `==` against different
  literals, or `in` disjoint sets. Without proof and without precedence the story is refused (`quest-resolutions-overlap`).
  Array order never decides. The sugar keeps today's rule as `precedence: ["failed", "done"]`.
- Optional `quests[].hold_when_ambiguous: true`: two matches hold the quest open, raise the author check
  `quest-resolution-ambiguous` and write a journal line. Off by default, so precedence decides.
- Single-snapshot transaction, all inside the `quests` boundary step:
  1. Freeze reader R0 after `derive`.
  2. Decide every open quest's resolution against R0.
  3. Write the closes.
  4. Evaluate every consequence clause of the quests closed this boundary against R0 plus the closes.
  5. Write the consequences, aggregated first: every `add` to one key is summed and clamped once. Two literal writes
     to one key in one boundary are a conflict. The validator warns `consequence-write-conflict` when two quests
     can write the same key. At run time the conflict resolves by `(quest id, consequence id)` order, never by array
     order, and raises an author check. Host effects dispatch in the same `(quest id, consequence id)` order.
  - No quest sees another quest's consequence writes in the same boundary. Chains land next boundary, whatever the
    array order.
  - The latch pass (faction moves, codex, labels) then reads the closes in the same boundary, as today.
- Outcome refs elsewhere: gates read `quest_<id>_closed` (an enum of resolution ids). "Resolved either way" is
  `op: "in"`, a single resolution is `==`. `requires` accepts `"id"` (sugar for resolution `done`) or
  `{quest, resolution: [ids]}`. Echoes take `after: {quest, to: <resolution id>}`. Pattern `quest` steps take resolution
  ids. Faction moves, rumors, agenda `when` and checkpoint transitions need nothing new: they are gates.
- Extraction scope (`questScopeKeys`): add each resolution's `when` keys, and its consequences' `when` keys, while the
  quest is in one of that resolution's `from` states. A decline resolution is therefore read while the quest is
  offered. Otherwise "unexpected method" clauses never get read. Round-robin and cap as today.
- Player projection (`gameSnapshot.ts`, `widgets.ts`, journal): an open quest shows title and visible steps, as today.
  A closed one shows only its reached resolution's `label`, plus consequence labels whose consequence latch is set
  **and** whose `visible_when` holds. Never the list of possible resolutions, and never a count of them.
  `runtime/playerProjection.ts` withholding (`:86`, today quest titles, codex names, secret labels) adds unreached
  resolution and unapplied consequence labels. Journal, recap and every machine consumer read labels through the held
  secret filter.
- Recap: `recap` per resolution replaces `recap.done|failed`. `runtime/consequences.ts` keys effect refs on the
  resolution id from the finished `BoundaryLogEntry`. "Because you…" still needs a recorded `playerSpan`.
- storyDiff (`questDiff`):
  - Adding a resolution or consequence is compatible. A consequence is evaluated only at close, so one added to a
    quest this chat already closed is never applied retroactively.
  - Removing or renaming a resolution this chat reached is invalidating (keep/restart). So is removing or editing a
    consequence this chat applied whose host effects are live: keep or restart, like removing a finished quest today.
  - An applied consequence is never given twice.
- Studio QuestsEditor:
  - A resolution × consequence matrix. Each row also lists the gates elsewhere in the story that read this resolution
    (echoes, faction moves, rumors, transitions, other quests), found by a pure scan.
  - A simulation panel: pick a resolution and the method qualities, then see which consequences fire, what changes and
    what each surface shows. It runs pure `simulateQuest(story, values)` in the engine, also exposed to the wizard
    beside `simulateWalk`.
  - Lazy chunk (the Studio already is).
- Wizard: rewrite the `quest-line` recipe to ask who wants what, what can be found out, which 2-4 resolutions matter,
  what each costs, what happens if the player ignores it, and how it shows later. Several resolutions are guidance, not
  a quota: no minimum count anywhere.
- Guide:
  - Rewrite topic `quests`; add topics `quest-resolutions` and `quest-consequences` to `docs/authoring/story-guide.md`.
  - Compact twin in a new `src/copilot/guideTopicsQuests.ts`.
  - `copilot/guideCoverage.test.ts` must cover every new field.
  - Then `npm run docs:guide` and `npm run docs:settings`.

## Schema keys

- Authored fields:
  - `quests[].resolutions[]` with `id`, `when`, `label`, `recap`, `from`, `consequences[]`;
  - `consequences[]` with `id`, `when`, `set`, `effects`, `label`, `visible_when`;
  - `quests[].precedence`, `quests[].hold_when_ambiguous`;
  - `requires[]` objects, echo `after.to` and pattern quest steps accepting resolution ids.
- Compiled code keys:
  - `quest_<id>_closed`: an enum whose values are the resolution ids. It replaces `done|failed`. Latching, as today.
  - `quest_<id>_<resolution>_c_<consequence>`: an int, the boundary it applied. Latching, one per consequence.
    Replaces `quest_<id>_rewarded`.
  - `QUEST_CLOSED_VALUES` goes away. There is no migration (owner rule), so a chat started before the change restarts.
- `rewardedQuestIds` / `worldInfoGates` earned switches read consequence keys instead of the rewarded flag.
- The gated-entry census must list every consequence's `effects.world_info`. `engine/worldInfoEffects.ts:81` today
  enumerates rewards and agenda steps only; anything it misses escapes normalization and release. Earned switches
  replay after the checkpoint path, ordered by (boundary applied, quest id, consequence id), not authored order
  (`runtime/worldInfoGates.ts:30`).

## Invariants and rollback

- Every key above is code, latching, and listed by the `quests` detector (it extends
  `questLatchesMoved`). `rollbackDetectors.guard.test.ts` fails on a missed key (planted control).
- Rollback ≡ replay: a swipe or edit of the reply that closed a quest restores R0. The resolution and its consequences go
  with it. Consequence host effects revert through the effect ledger. Echoes scheduled from that resolution drop by
  their existing rollback (scheduled at or after the message).
- Delayed effects: an echo that already landed before the rolled-back message stays. An echo scheduled after it goes.
  Test both.
- Cross-chat: closes and consequences live in the chat's blackboard. Host effects go through the effect ledger, keyed
  by chat. A second chat on the same story starts clean.
- A consequence `set` writes only declared code qualities. It never touches the story clock (existing rule), a faction
  key (use a faction move gated on the resolution, which keeps `heard_by` and once-ever) or a reserved key.

## Switch and floors

- Feature row `quest-resolutions` (area authoring, story scope), on by default. Off: only the
  `done_when`/`failed_when`/`reward` sugar is evaluated. Authored `resolutions[]` and `consequences[]` are ignored
  entirely, and the Studio matrix shows "off". Off never manufactures a consequence: a conditional clause is never
  applied unconditionally. The engine reads the switch through `featurePolicy` (pure), like other story features.
- Floors, declared now:
  - D (jest, hard):
    - ambiguity fixtures always resolve by precedence or hold, never by array order (100 %);
    - shuffling the quest array changes no boundary log (property test, 200 seeds);
    - rollback ≡ replay over random swipe/edit sequences (200 seeds);
    - player-clean: no unreached resolution label or count on any player surface (`so-ui.mts assert-player-clean`
      plus a snapshot scan).
  - Live (real model, lane): a public fixture story (invented, no campaign content) with one situation and three
    resolutions, two paraphrased action scripts per resolution, 6 runs:
    - correct resolution reached ≥ 5/6;
    - a wrong resolution closed: 0 (hard);
    - the method clause read correctly ≥ 4/6.
  - Reflection (later scene shows the resolution): ≥ 2 of 3 resolutions, by the Sol rater. Owner-gated (rating
    decision 2026-10-29).

## Tests and live gate

- Pure: `quests.test.ts`, `validate/quests` (overlap proof, precedence, `from: offered` time-alone refusal),
  `questDiff.test.ts`, `rollbackDetectors.guard`, a new `questResolution.property.test.ts`.
- Cases: ambiguous match, partial resolution, decline (offered → closed), ignore (stays offered, never fails on time),
  unexpected method (consequence `when` on a method key), repeated extraction (the same read twice closes once), reload,
  cross-chat, rollback after a delayed echo, and a spoiler scan of the player view.
- Runtime: `gamePort` dispatch per consequence, `consequences.ts` refs, `gameSnapshot` projection, Studio stories for
  the matrix and the simulator.
- Gates: `npm run gates`. Live: `debug` skill, `st-lanes` model lane, new journey `quest-resolutions.journey.json` with
  `send_generate`, run twice and archived. Plus a no-model scenario for plumbing.

## Adolion adoption

- Counts only: 62 quests in 11 stories; 1 uses `failed_when`, 0 rewards, 4 gate reads of `_closed`, 29 echoes
  (7 after a quest end).
- After the build, the sugar keeps all 62 valid with no edit, but the new key shape means a restart of any live
  campaign chat.
- Whether to give some quests real resolutions: route to another model for content review (the owner plays fresh).
  If yes, change the campaign repo, bump `adolion-fresh.pin.json` and reinstall.

## Order, size, resources

- Size L. CPU build: engine + validate + runtime + Studio + wizard + guide. GPU: the live journey, about 1 h on the
  3090, in the owner's GPU window.
- First of 48-55. Plan 54 can be built alongside (it reads this plan's keys). Plan 55 (docs) can be written once the
  schema keys are fixed.
- Bundle: resolution evaluation stays in `engine/quests.ts` (main, small); validation, the matrix and the simulator ride
  the game-layer and Studio lazy chunks. Last recorded main bundle 1,273,160 B of 1,300,000 (43 Gate record P).

## Second opinion

codex `gpt-6.1-sol`, read-only, 2026-11-08, over drafts 48-55. It confirmed the Review citations. Applied:
- deterministic aggregation of consequence write conflicts;
- labels gated on the applied latch, plus `playerProjection` withholding;
- the WI census and earned-switch order;
- an off switch that never invents a consequence;
- scope per eligible lifecycle state;
- consequence keys carry the resolution, and hot-update rules;
- in 49: edge state and once per boundary, discoveries via the codex;
- in 50: off behaviour and latency noted;
- in 52: classifier precedence;
- in 54: causes reuse `decidingCause`, no cache.

Rejected: none.

## Unresolved questions

- Is an "expiring opportunity" allowed to close an offered quest on story time alone, as a neutral `lapsed`
  resolution? Today's rule refuses any time-only failure of an offered quest.
- Should `hold_when_ambiguous` exist at all, or is precedence enough?
- Does a story-format feature need an off switch (owner rule says yes; the off behaviour above is a compromise)?
- Replace `quest_<id>_rewarded` outright (cleaner, restarts live chats), or keep it as an alias?


## Gate record (2026-11-08)

- Full gates, run 6 (via the heavy lock, no `--resume`, Storybook included), on `3450f0849` (branch with local master
  `e5a1c61f8` merged): `npm run gates -- --jobs=2` -> `gates: all green in 390.7s` (test:replay 92.9s, test 202.4s,
  test-storybook:ci 297.0s, build 14.4s, typecheck 33.6s, test:debug 30.4s, typecheck:test 29.7s, lint 27.5s,
  debug:typecheck 9.5s, test:release 6.1s, test:plugin 21.4s). Main bundle 1,249,929 B of 1,300,000.
- After it, only docs: local master `81e98eb06` (plan 52 record) and these gate records.
- `npm run gates:quick` (via the lock) on `e45b1340f`: typecheck 74.9s, typecheck:test 90.8s, lint 29.1s, jest related 165.9s,
  replay `--cached` 90.9s, all ok.
- Red runs before it, each fixed and rerun in full:
  - run 1: `errorCopy.guard` (two simulator sites missing from `test/findings/errorCopy.json`); Storybook
    `QuestResolutionsPanel` (fixture did not validate; precedence field ate commas while typing).
  - run 2: Storybook, the fixture's `trust` meter needed `min`/`max`.
  - run 3: lint, the story's `render` called a hook (now a `FirstQuest` component).
  - run 4: stopped in the lock queue (master moved). Run 5: `test:release` suite coverage, `quest-resolutions` and
    `story-record` had no plan 24 matrix row (added to `docs/plans/v2.8/24-test-plan.md`).
- Docs: `npm run docs:guide`, `npm run docs:settings` after each master merge.
- Deviations:
  - Extraction still reads the resolution keys while the switch is off (the engine ignores them; the read is unchanged).
  - A held quest (`hold_when_ambiguous`) raises the author check `quest-resolution-ambiguous`; there is no journal line.
  - The Studio resolution table shows no "off" state when the switch is off.
  - `done` and `failed` stay in every quest's `closed` enum (coordinator approved): the pinned campaign gates
    `in [done, failed]` on quests without `failed_when`.
- Owed (not run; ST and lanes down, GPU paused):
  - no-model lane scenario `test/scenarios/v30-48-resolutions.json`, ×2;
  - real-model journey `test/journeys/quest-resolutions.journey.json`, ×2, archived;
  - Sol reflection rating (floors in the journey).
- Adolion (counts only): 62 quests in 11 stories, 1 `failed_when`, 0 rewards; all 62 validate with no edit; live campaign
  chats need Restart (key shape). Which quests could gain resolutions: content review by another model.
- Open questions for the owner:
  - Should the switch off also stop extraction reading resolution keys?
  - Should a held quest also get a journal line?

## Live gate record (2026-11-09)

- No-model scenario, ×2, PASS (2026-11-09, master `3b2e2985a`, bundle f681c5b1): adolion-fresh lane 48 seeded offline
  (`SO_LANE_OFFLINE=1 node scripts/debug/adolion-fresh.mts seed 48`, then `st-lanes.mts no-model 48`, `start 48`);
  `node scripts/debug/st-lanes.mts run 48 -- scripts/debug/so-scenario.mts run test/scenarios/v30-48-resolutions.json --sandbox --group "Group: Arin, DM Narrator"`
  twice: `ok: true`, 16/16 steps, residue clean. Closes on `freed` with both consequences, player view shows only the reached
  label and applied outcomes, the record lists close + consequences, `assert-player-clean` (step 14) holds, deleting the
  closing turn rolls back close, consequences and record rows. Evidence `<so-lanes>/48/debug/runs/2026-11-09T15-22-21-440Z-so-scenario-run`,
  `…/2026-11-09T15-23-31-132Z-so-scenario-run`. A first try on a plain no-model lane was not-runnable (its memory profile
  still reached the local controller); hence the offline seed.
- Real-model journey `test/journeys/quest-resolutions.journey.json`: **INCOMPLETE** (harness, twice; the one allowed retry is
  spent). Lane 51 (adolion-fresh, images and sprites off), `node scripts/debug/st-lanes.mts run 51 -- scripts/debug/so-journey.mts run test/journeys/quest-resolutions.journey.json --strict`.
  - Pair A: run 1 complete, archived `test/journeys/records/v30-48/2026-11-09T18-33-50-310Z_journey-QR.*`: QR.3 closed
    `ransomed`, method clause correct; QR.1/2/4/5/6 MISS; wrong closes 0. Run 2 stopped after its QR.1 MISS.
    Cause (harness): an accepted read applies at the next boundary, and the journey scored right after the last action
    turn, so no boundary followed. Audits in run 2's QR.1 showed `freed=true` and `violent=true` accepted but unapplied.
    QR.3 passed only because its deciding read landed one turn earlier.
  - Fix 1 (harness, floors unchanged): a bridge turn before scoring.
  - Pair B (retry): QR.1 and QR.2 MISS, then stopped to free the GPU. Cause (harness): the turns were sent back to back, so the
    extraction scheduler held every read (`held: 1`); one read at message 11 covered the whole script with the hidden-quest
    scope (`asked`, `taken`), and its writes again waited for a boundary. A player's typing gap is missing.
  - Fix 2 (harness, floors unchanged): each turn now waits for `schedulerIdle` (quiet 5 s) before the next.
  - Earlier attempts gave no floor data: a runner error at setup (group open timed out right after the seed), and two
    300 s send timeouts on the shared GPU (turns took 165–294 s; timeouts now 900 s, close wait 600 s).
  - Floors (correct ≥ 5/6, wrong 0, method ≥ 4/6): not measurable. Across 8 scored scripts no wrong resolution closed.
  - Owed: the journey ×2 with both fixes, archived.
- Sol reflection rating (`opencode run -m openai/gpt-6.1-sol`, stdin closed): one sample only (QR.3, `ransomed`):
  `REFLECTS` ("credits twenty silver with buying the boy's life … without implying violence or abandonment"). The floor
  (≥ 2 of 3 resolutions) is not measurable from one sample: owed with the journey rerun.
- Product note: a resolution decided on the player's last turn closes on the next boundary (accepted reads apply there).
  By design; a check or test that scores immediately after the deciding turn reads a MISS.
