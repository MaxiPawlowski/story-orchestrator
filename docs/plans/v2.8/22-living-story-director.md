# Plan 22 — Living story: a director that writes the story ahead of the player

**Status (2026-10-03): v2.8 plan 22 (was v2.7 plan 24). Exploration written; decided (all recommendations; M1 first, then
M1–M3 with proper UI if M1 passes); not built; M1 not run.** Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D (graph-op history, op validation, spoiler projection,
architecture guards); acceptance RP (the reply model in M1/M3 play) + CL (the director on the `authoring` role, DeepSeek).

The user's question: do we have an auto mode where the wizard drives the gameplay, characters, next checkpoints and
pacing? Not every story is pre-made, even with the wizard's help.

## Answer today: no, by design

- **The spec chose authored anchors plus generated bridges.**
  - It frames the trade-off as "hand-scripting kills improvisation; free generation loses the thread"
    (`v2/story-orchestrator-spec-v2.md:7`), and defines anchors as authored and guaranteed (:25).
  - A stub with no anchor beyond it is a load error (:62, :268).
  - Background generation fills only stubs that lead to an authored anchor (`generation/planner.ts:31-38`), never creates
    an anchor, and never runs past the last checkpoint.
- **The copilot plan named auto-pilot as a non-goal:** "driver never acts without a click" (`v2/12-story-copilot.md:16`).
  - Suggest, Report, Nudge, Probe and Advance are author-only and manual (`coordinators/copilotCoordinator.ts:207-240`).
- **The agentic wizard is Studio-only and pre-play** (`v2.6/11-agentic-wizard.md:133`).
  - Its `auto-draft` mode applies edits to a draft, never to a running chat.
- **At the last checkpoint play just stays there,** or ends in the epilogue view when a `final` chapter seals
  (`runtime/chapters.ts:32,127`, `snapshotBuilder.ts:189`).

What already moves on its own during play, in production:

- the speaker director;
- the curator (proposals, review by default);
- extracted arcs, which open and close threads;
- canon regeneration.

Not production inputs until they ship (review C10): **complications** (the `sp6Complications` dev spike,
`runtime/settingsModel.ts:88`; measured by v2.8 17, built for production by v2.8 18 Q6) and **chapter seals** (v2.6
plan 07, off until the Q-M floors pass; owned by v2.8 01 §F). The director may read them in a dev run; production never
depends on them before they ship. **Curator tiers are production** once v2.7 02 C13 lands (Sol r3 R3-18): C13 promotes
them exactly as measured and drops the `sp8CuratorTiers` flag, so they are no longer a dev input and no flag can switch
them off. They act only through the curator (`routeByTier` in `auto` accept mode; the protected-span refusal always), so
the director never reads them; M1 isolates them through the curator's own install-wide switch (below).

A live story edit can also reach a running chat. `applyStoryUpdate` + `storyDiff` treat added checkpoints and
transitions as compatible, so they hot-swap with no prompt (`engine/storyDiff.ts:230,283-288`). Today only an author's
save triggers that.

## Proposal: a "living story" mode with a director

A story can be **partly or wholly unwritten**. A director, the agentic wizard's loop pointed at a running chat, writes
the next anchor **ahead of the player**, from:

- the premise;
- canon;
- the open threads the player actually pursued (arcs);
- character agendas (v2.8 20, once shipped);
- the pacing shape.

The existing machinery then plays it as if an author had written it. **Group chats only** (v2.7 03): a living story
declares its cast in `requirements.members` and plays in a group; a premise-only start makes its group through v2.7 03's
create-only provisioning, confirmed by the player.

### What the author (or a player starting from nothing) provides

```json
{ "id": "my-living-story", "title": "…", "player": { "role": "…" }, "living": {
    "premise": "…", "tone": "…", "cast": ["…"],
    "horizon": 1, "chapter_size": [3, 5],
    "ending": "open" | { "when": "<gate>" } | "director-proposes",
    "autonomy": "suggest" | "auto",
    "authored_until": "<checkpoint id>" } }
```

- The player's role is the story's `player.role` (v2.8 03), not a `living` field.
- **Fully living:** a premise, a cast and an opening scene; the wizard's Premise step already drafts these. The first
  anchor is generated at start.
- **Hybrid:** an authored story with `authored_until`. The authored part plays as today, then the director continues.
  This also answers "what happens after the ending": an open epilogue (v2.8 19). A sequel arc is new game plus, deferred,
  v2.9 03.

### The director loop

- **When it runs:** at a committed boundary when the active anchor is the last one inside the horizon (default 1 anchor
  ahead). Off the reply path, as a background unit with a RunToken, like expansion.
- **What it writes:** only the **future** of the graph:
  - one new anchor: objective as world pressure, `state_snapshot`, tension target, chapter;
  - the transition(s) into it from the current anchor's exits;
  - a stub between them, which the existing expansion then fills.
  - It may declare at most N new qualities per anchor and must reuse existing ones first. That keeps the extractor's
    read scope bounded.
  - Generated ids are namespaced (`liv_<n>`, like expansion's `gen_`), so they never collide with authored ids.
- **What it never writes:**
  - the blackboard, memory or past checkpoints;
  - the active checkpoint;
  - anything behind the player.
  - The same rules as stagecraft: it proposes and the runtime applies.
- **How it applies:** as **graph operations** on this chat's pinned copy only, at a boundary (below). The library is
  untouched, and other chats are never affected (existing invariant).
- **Autonomy tiers:**
  - `suggest`: the next anchor waits in the author view as a card (accept / edit / regenerate). This is today's
    no-auto-pilot rule, kept.
  - `auto`: the anchor applies at the next boundary, journaled, and reviewable afterwards in the author view.
  - For the player-only persona, `auto` is the only workable tier.
- **Quality checks before applying:** the existing code checks run on every route (`generation/paths.ts`), plus the
  critic with the agency policy and the J7 canon-verification judge when calibrated (v2.8 13). The anchor must also be
  reachable from the current state: no `gate-open-on-arrival` and no impossible gates. Then the **spoiler and private-input
  check** (below). Failing means regenerate, then fall back to an open stretch (v2.8 19), never a broken graph.
- **Pacing and chapters:**
  - The director follows the story's `arc_template` and tension history to pick the next anchor's tension target.
  - Every `chapter_size` anchors it closes a chapter, so seals keep memory bounded on an endless run. **Dependency:**
    chapter and era seals exist but are off until v2.6 plan 07's Q-M floors pass (v2.8 01 §F). Until then a living run is
    capped (M1: 3 chapters) and its memory growth is recorded; endless `auto` runs wait for seals to ship.
  - `ending` decides whether it ever writes a `final`.
- **Characters:**
  - It may propose cast changes and new NPCs as provisioning **proposals** only.
  - The create-only wizard rule holds: a card, a lorebook or a group is never made without the author or player
    confirming it.
  - In `auto` mode it uses existing cards and NPC replies.

### Graph-operation history (review F26)

`restoreStaledAfter` (`runtime/coordinators/expansionCoordinator.ts:123`) does **not** remove anchors: it puts stale
expansion entries back to the status they had before a later revalidation staled them, and rebuilds the merged graph. It
is the model for ordering (graph restored before anything reads the checkpoint, the v2.6 T6-1-2 fix), not for removal.
The director needs its own history:

- **Storage.** The chat keeps three things (Sol r3 R3-11): `living.authored`, the **immutable authored baseline** (the
  library story as loaded, or as taken by the last author update, and its hash; never compacted into); `living.folded[]`,
  the generated ops that left the rollback window (no longer undoable, kept so they can be re-folded); and
  `living.ops[]`, the live ordered log of `{id, boundary, messageId, kind, payload}` where `kind` is `add-checkpoint |
  add-transition | add-stub | add-quality`. `living.base` = `fold(authored, folded)` is a derived cache of the compacted
  runtime base, never a diff input. The played graph is always `fold(base, ops)`, with the expansion merge on top. `pinnedStory` stays the
  full folded copy (the pin invariant); the ops log is how it is rebuilt.
- **Engine snapshots.** An op applied at boundary `k` is kept by any rollback to a boundary `≥ k`. A checkpoint can only
  become active after the boundary that added it, so every retained snapshot names a checkpoint the rebuilt graph holds.
  `ensureActiveCheckpoint` stays as the fallback, journaled.
- **Rollback order.** In `runRollback`: drop ops with `boundary > restored`, rebuild `fold(base, kept ops)`, drop
  expansion entries whose `targetAnchorId` or source checkpoint no longer exists, `rebuildMergedStory`,
  `engine.replaceGraph` (keeps the queue and history, `engine/engine.ts:196`), then `ensureActiveCheckpoint`. All before
  any consumer reads the active checkpoint.
- **Pending work.** `replaceGraph` keeps queued writes; a queued write for a quality the rebuilt graph no longer declares
  is discarded and journaled, never applied. A director unit mints its token with the graph epoch (ops count + last op
  id); a rollback or an author save bumps the epoch, so a proposal built for a future that was rolled back is discarded
  before it applies, and a waiting `suggest` card is withdrawn.
- **Retained-history limit.** The engine keeps the last 200 boundaries (`engine/engine.ts:267`, `:313`); a rollback past
  the floor answers `history-unavailable`. Ops older than the floor can never be undone, so they move from `ops` to
  `folded` (and into the `base` cache) when the engine drops the matching log entry; `authored` is never touched. The
  live ops log is therefore bounded by the same window; `folded` grows only with generated content.
- **Author update.** `applyStoryUpdate` on a living chat diffs the new library version against `living.authored`
  (authored against authored, so generated nodes never read as author deletions), then rebuilds
  `fold(fold(newAuthored, folded), ops)` and replaces `authored`; an op in `folded` or `ops` whose target the update
  removed makes the diff invalidating (the existing keep/restart/cancel choice). **Test:** an ordinary author update
  (one added authored checkpoint, one edited authored text) after compaction has moved generated ops into `folded`:
  compatible hot-swap, no deletion reported, every generated node and the active checkpoint retained, graph equal to a
  fresh fold of the same inputs; a control that diffs against `base` reports the generated nodes as deletions.
- **Replay.** `rollback ≡ replay` and `reopen ≡ replay` hold for the graph: the graph hash, engine state and expansion
  statuses after a rollback to `b` equal those of a run stopped at `b`, and hydrating `base + ops` reproduces the pinned
  copy. Property test over random op/boundary/cut sequences, as `rollbackReplay.property.test.ts` does for memory.

### Spoilers and private inputs (review F27)

The ahead-of-player horizon means unreached generated anchors exist in the pinned copy, and the director reads private
inputs (agendas, relationship meters private to players per v2.8 20, epistemic and held-secret rows). So the normal
rules apply in full:

- **Player-copy projection.** Unreached generated anchors are never named in any player surface: drawer Overview, HUD,
  inline timeline L1/L2, away recap, `/story`, briefing, v2.8 04 panels. Player copy keeps using `narrative.ts`, which
  names only reached checkpoints.
- **Director suggestions are author-only.** `suggest` cards, the director's journal rows and its reasons render in Author
  view only and are added to `assert-player-clean`'s selector list.
- **Generated guidance.** Every player-visible generated field (checkpoint name, any player-facing description) passes
  the held-secret restatement filter (`memory/heldSecrets.ts`, the shared-tier rule) and the agency policy; a field that
  restates a secret or a private agenda is regenerated, never shown. Objectives stay world pressure.
- **Save as story.** By default the export holds the authored part plus generated anchors the player reached; unreached
  generated anchors are dropped (decided by the user 2026-10-03, as recommended; the player is not asked). Private inputs are never written into story fields. In Author view the author may opt to
  include unreached anchors (the Studio is an author surface).
- **Referentially closed projection (Sol r3 R3-12).** Dropping an anchor drops everything that names it: transitions
  whose `to` (or any gate/route reference) is an excluded anchor, generated checkpoints between a reached and an
  excluded anchor that were not reached either, chapter entries and `arc_bridges` naming an excluded anchor, and
  qualities declared only by excluded nodes. A kept checkpoint whose outgoing transitions all pointed into the excluded
  future gets one `stub` exit (the shape `add-stub` already writes), so the exported story is still playable by
  background generation instead of dead-ending. The export is then run through `validate.ts` and the Studio diagnostics,
  and is refused (with the reason) on any error. **Test:** a reached generated anchor whose only exit targets an
  unreached generated anchor, plus a chapter naming that anchor → the export validates with zero errors, holds no id the
  graph does not define, and the reached anchor ends in a stub; property test over random reached/unreached cuts:
  every export validates.
- **Spoiler checklist.** `docs/plans/v2.1/test-plan.md`'s list gains a planted unreached generated anchor and a planted
  held secret; both must be absent from every player surface.

### Player agency is the point

The director's main input is what the player did, not what a plot needs:

- open arcs the player engaged with;
- relationships (v2.8 20, once shipped);
- refusals.

A refused route feeds the next anchor; it is not something to recover from. The default agency policy applies to every
generated anchor: world pressure, never the player's decisions.

### Save the run as a story

Because the run's graph is a real format-2 story in the chat's pinned copy, "Save as story" can export it to the
library (with the spoiler rules above). **Playing becomes a way of authoring**, and the Studio can then edit the result.

### Rollout (v2.8 rules 4, 9, 10)

- The director is a new runtime model use: **dev-only** until the M1 floors pass twice, then an **off-by-default**
  switch (`living.enabled`, install-wide), plus the story's own `living` block.
- Model route: the existing `authoring` role (v2.7 14 role map), DeepSeek in acceptance; never the reply path.
- Player-visible surfaces (a player-started living story, `auto` play, "Save as story" for players) follow decision 5
  (M1–M3 with proper UI if M1 passes); their copy is checked by a session card before they leave dev (rule 4).
- `auto` overturns a v2 non-goal, so it gets its own invariant in `architecture.md` when built.

## Cost and risk

- **Model calls:**
  - one director call per anchor (about one per 3–8 player turns);
  - expansion as today;
  - the critic.
  - On the `authoring` role or the harness, never the reply path.
- **Coherence drift over a long run** is the main risk. The mitigations are canon plus chapter seals (once shipped),
  canon-verification judging, and bounded quality growth.
- **Overturns a v2 non-goal** (no auto-pilot). The `suggest` tier keeps that rule for authors; `auto` is a deliberate
  exception, decided by the user (decision 1), with its own invariant.
- **Spoilers apply** (F27): the horizon and private inputs make them real; see above. (Rejected: "spoilers do not apply,
  the future does not exist until written".)

## Measurement before building

- **M1 spike (lab, no UI):** a premise-only story on the Adolion lab cast, in a group, 3 chapters, `auto`, scripted
  player turns, adolion-fresh lane, dev flag. Predeclared floors:
  - 0 anchors with impossible or open-on-arrival gates;
  - 0 narrated player decisions in generated guidance;
  - at least 1 new anchor per chapter built on a player-pursued arc;
  - warden contradiction notes per 50 turns no higher than the authored baseline;
  - 0 unreached generated anchor names and 0 held-secret restatements in any player surface (F27);
  - every rollback in a scripted swipe/delete run leaves the graph equal to the replay (F26).
  Isolation (C10, Sol r3 R3-18): complications stay off (`spikes.sp6Complications` is still a dev flag until v2.8 18
  Q6 ships); the promoted curator tiers have no flag, so M1 runs with `stagecraft.curatorEnabled = false` on **both**
  the living run and the authored baseline run (no curator pass, so no tier routing and no curator write in either
  arm), asserted from the run header's `stagecraft` path before and after each batch; chapter seals stay off as
  shipped. A curator-on column is a later M3 question, not M1.
- **M2, blind:** pairs of excerpts, authored vs living, rated for coherence and "felt free". The floor is set before the
  run. Adolion excerpts are rated by a second model (e.g. Astra, delegated), never the user (v2.8 rule 11; decided by
  the user 2026-10-03, as recommended); no non-Adolion M2 story is added for the user to rate.
- **M3, hybrid:** an authored act continued by the director past its end. Does it hold the act's threads?

## Gates

| Gate | Tier |
|---|---|
| Director op validation (future-only writes, bounded qualities, namespaced ids) | D |
| Graph-op history: rollback/reopen ≡ replay property test; retained-window compaction; pending-write discard; stale proposal discarded after a rollback (F26); author update after compaction diffs against `living.authored` (R3-11) | D |
| Export projection: referentially closed, validates, reached anchor → excluded anchor case (R3-12) | D |
| Spoiler property: planted unreached generated anchor + planted held secret absent from every player surface; `assert-player-clean` with director selectors (F27) | D |
| `architecture.test.ts` keeps the director away from the blackboard and memory, like stagecraft | D |
| Ownership census row for the director unit | D |
| A generation golden plus the critic | D |
| Registered in the v2.7 01 feature registry + Help (registry test) (B10) | D |
| M1 ×2 on a lane | RP + CL |
| M2 / M3, then a session card for the player-visible surfaces (rule 4) | RP + CL |
| `npm run gates` | D |

## Decisions for the user

1. Allow a director that writes the story's future during play (overturning the v2 "no auto-pilot" non-goal), with
   `suggest` and `auto` tiers? **Recommended: yes, behind the M1 floors**, `suggest` default for authors and `auto` for
   living stories started by a player.  Lets do as you recommend
2. Generated anchors live only in the chat's pinned copy, with an explicit "Save as story" export to the library?
   **Recommended: yes.** yess
3. Hybrid stories (`authored_until`), so authored stories can continue past their end? **Recommended: yes.** It shares
   all the machinery. yesss
4. The director may propose new characters (provisioning, confirmed by a person) but in `auto` only uses existing
   cards? **Recommended: yes.** yess, it should be integrated with a proper tutorial on how to build a character. In fact, i was hopping the wizzard to have a lot of this plugin documentation and sillytavern's documentation and be able to answer questions or recommend stuff

   **Noted (2026-10-03):** the wizard as an in-app assistant that answers questions from this plugin's docs and
   SillyTavern's docs, with a character-building tutorial, is its own plan: v2.8 09 (`09-wizard-assistant.md`).
   Decision 5: M1 first; if it passes, M1–M3 ship with proper UI.
5. Start with the M1 spike before any UI? **Recommended: yes.** yes, in fact, if it goes well, lets do everything from m1 to m3 with proper UI

## Decided 2026-10-03 (user: as recommended)

- Save as story drops unreached generated anchors by default (F27); the player is not asked. In Author view the author
  may still include them.
- M2's Adolion excerpts are rated by a second model, never the user (no-spoiler rule, v2.8 rule 11).

## Links

v2.8 03 (`player.role`), v2.8 20 character life (agendas and relationships as director input), v2.8 13 J7 (canon
verification), v2.8 11 curator create (similar proposal discipline), v2.8 19 open stretches (fallback and epilogue),
v2.8 18 quests (the director may open side quests), v2.8 17/18 complications (not inputs until shipped), v2.7 05 briefing
and v2.8 10 briefing drafting (generated from the premise), v2.7 03 group chats only, v2.8 09 wizard assistant (shares
the agent loop), v2.6 plan 07 chapter seals (dependency), v2.9 03 new game plus (deferred).

## Review 2026-10-03

- **F01:** status line per plan (decided, M1 not run, not built).
- **F26:** `restoreStaledAfter` described correctly; new graph-operation history (base + ops log) with its interaction
  with engine snapshots, pending writes and director units, the 200-boundary retained window, author updates and replay.
- **F27:** "spoilers do not apply" removed; player-copy projection, author-only suggestions, held-secret filter on
  generated fields, Save-as-story trimming and spoiler-checklist rows; M1 floors added.
- **C10:** `player.role` (v2.8 03) replaces `living.player_role`; group required (v2.7 03); complications (v2.8 17/18)
  and curator tiers are dev spikes, not production inputs; chapter seal readiness stated as a dependency; new game plus
  deferred, v2.9 03.
- **B10:** registry + Help gate row.
- **Rule 9:** dev-only, then off by default.
- **F15:** tiers per gate row.
- Line refs touched and verified: `expansionCoordinator.ts:123`, `engine.ts:196,267,313`, `settingsModel.ts:88`,
  `storyDiff.ts:230,283-288`.

Round 3 (Sol): R3-11, R3-12, R3-18 applied.

## Divergence branching (owner input 2026-10-10)

Owner design input, folded in as built:

1. **Trigger.** Divergence is read, never guessed. Two signals:
   - the agency-recovery refusal: two gate boundaries with nothing fired at a checkpoint that declares exits;
   - a new judge use `divergence`: one choice question over the active checkpoint's exits, "fits one of them / fits none".
     It reads each exit's `extraction_hint`, else its label, else the gate's rubric, against the last 6 messages.
   Debounce: 2 consecutive "none" readings at p ≥ 0.6, or one at p ≥ 0.9; a refusal diverges at once.
   The reading runs off-path after a boundary that moved nowhere (`fired === null`), timeout 4 s, and is ringed like every judge call.
2. **Branch on divergence (B).** The director writes a branch from the current checkpoint that follows what the player
   is doing and rejoins the nearest downstream anchor (BFS over exits). It is one stub `liv_b<n>_way` with its own new
   yes/no gate, which must not hold on arrival, at a lower priority than every authored exit, and one convergence
   transition into that anchor. The anchor's own expansion fills the road as usual. A living story with no anchor ahead
   is the ordinary director case, so it writes the next anchor rather than a branch. Branches are propose-only, applied
   at a boundary, journaled, `rollback ≡ replay`, and `RunOwnership` is checked before every write. Author view shows
   "The story branched because …". At most one branch per checkpoint (`divergence.branchedFrom`); a rollback that takes
   the branch back clears that mark.
3. **Prefetch (A, lighter).** For the checkpoint the player stands on (never further ahead), once it has exits and no
   branch, the director writes one more way forward in the background. It counts as that checkpoint's one branch, so a
   prefetched checkpoint does not branch again on divergence (owner question 2).
4. **Settings.** `stagecraft.branchingEnabled` (on), `stagecraft.prefetchEnabled` (on; the cap is one per checkpoint) and the
   judge use `divergence` (on, like every use). Branching works on authored stories too: it does not need a `living` block.
5. **Measurable later.** False-divergence rate (CL, judge) and the RP play check are owed: `31-v27-wrap-backlog.md` M21–M23.

## As built (2026-10-10, branch `v2.8-living-director`)

- **M1 core.** Schema `living` block (`engine/schema.ts`, `validate/living.ts`, `liv_` ids reserved, `liv_open`
  opening, hybrid `authored_until`); the director unit (`generation/living/`: plan, prompt, strict parse, guard, critic,
  build + check ops, fold, export, divergence, start); graph-op history in `extras.living` (authored copy, folded, ops,
  proposals, epoch). Played raw = fold(authored, folded, ops); compaction at the engine's history floor; an author
  update is refolded under the ops and diffed against the authored copy (R3-11). Rollback runs right after the engine
  rollback and before the expansion restore: it drops ops after the boundary, prunes expansion entries toward removed
  checkpoints, discards pending writes for undeclared keys, and calls `ensureActiveCheckpoint`.
- **Runtime split for the bundle.** `runtime/livingPort.ts` is the main-entry door (relevance check, accepted-only apply, rollback,
  refold, the off-path boundary pass, UI actions). `coordinators/livingCoordinator.ts`, `livingUnit.ts`, the author half of
  the snapshot (`livingAuthorView.ts`) and the divergence judge code load lazily (adopt preloads them). Boundary work:
  `living-apply` (order 8, before expansion) and `living-director` (order 67: director when due, divergence when
  nothing fired, prefetch).
- **M2/M3 UI.** Author: `LivingPanel` in the Scheduler tab (`#so-living`: summary, "Write the next turning point now",
  proposal cards with Accept / Reject / Edit / "Write it again", branch reasons, Save as story with
  `#so-living-include-unreached`). Player: "Save this run as a story" (`#so-living-save`, drawer Overview). Settings: "Start from a
  premise" in the Start row (`#so-living-start`; the cast is the group) and the three switches (`#so-living-enabled`,
  `#so-branching-enabled`, `#so-prefetch-enabled`). Stories: `Drawer/LivingPanel`, `Drawer/LivingSave`,
  `Settings/LivingStart`.
- **Autonomy.** `suggest` waits in Author view; `auto` applies at the next boundary; a player in player mode always gets
  `auto`. Defaults: a hybrid (`authored_until`) suggests, a premise-only story is auto. With chapter seals off, a run stops after 3 chapters.
- **Guide.** Topics `living-director` (replaces the wizard's reserved stub, `PENDING_GUIDE_TOPICS` now empty) and `branching`,
  in `docs/authoring/story-guide.md` and `src/copilot/guideTopics.ts` (drift test green); generated pages, settings reference,
  feature registry rows (`living-story`, `story-branching`, `save-run-as-story`).

Deviations:
- Not dev-only/off-by-default (§Rollout): owner rule 2026-10-10, every built feature on by default, floors informational.
- The critic prompt was revised once, after spike run 0 and before the measurement. It now names the player and the cast, says
  the cast's actions and a moved-on scene are allowed, and fails only on the player's own act, a direct canon contradiction or a
  name that states the ending. Run 0 refused 5 of 9 critic calls, most of them on cast actions read as the player's. Runs 1–2 are on the
  revised prompt.
- M1 ran offline: DeepSeek API direct (`deepseek-flash`, thinking disabled, 1024 tokens, the shipped prompts, guards and
  critic), the lane-free coordinator harness, synthetic stories (`test/fixtures/living-premise|living-hybrid.story.json`),
  no reply model, empty canon. The lane run with Artemis is owed (M21).

## M1 spike (CL, offline, 2026-10-10)

| Run | Premise (auto, 7 passes max) | Hybrid (after `ford`, 3 max) | Branch on divergence | Prefetch | Code refusals (parse / check / guard) | Critic pass | Median call |
|---|---|---|---|---|---|---|---|
| 0 (old critic) | 2 written, stalled at 3rd (critic) | 0 (critic) | written (2nd try), applied | written | 0 / 0 / 0 | 4 / 9 | 1.4 s |
| 1 | 2 written, stalled at 3rd (critic) | 1 written, stalled at 2nd (critic) | written, applied | written | 0 / 0 / 0 | 5 / 9 | 1.5 s |
| 2 | 7 of 7 written | 3 of 3 written | refused (critic) | written | 1 / 0 / 0 (a non-snake key, repaired on retry) | 11 / 14 | 1.5 s |

Floors (informational):
- 0 impossible or open-on-arrival gates: **met**, all 22 recorded answers (goldens
  `test/goldens/live/living-director/run{1,2}/`, replayed by `generation/living/directorGoldens.test.ts`);
- `rollback ≡ replay`: **met** in jest (6 seeds, property);
- 0 unreached anchors or held secrets on a player surface: **met** in jest (`runtime/livingSpoilers.review.test.ts`);
- 0 narrated player decisions in what was applied: not machine-checkable here. The critic is the check, and it errs strict. The
  stalls above are critic refusals, some of them correct (the player was made to follow an NPC, "he must decide…"), others
  false (a dog's movement read as the player's). A stalled frontier is asked again at the next boundary in play;
- the chapter, warden and arc floors need play: owed (M21).

## Live rows for the Artemis v1.1 pod (owner-funded, 2026-10-10)

Preconditions:
- the build stages: the bundle budget decision first (Gate record);
- an adolion-fresh lane, the Artemis profile for the reply, DeepSeek on the authoring role, the judge on;
- `stagecraft.curatorEnabled=false` (§Measurement isolation); headed so the owner can watch.
Reads come from `storyOrchestratorRuntime`: `getSnapshot().living` (Author view for the author half), the `extras.living` blob via
`so-state.mts current`, judge calls in `extras.judge.calls` (use `divergence`) and journal lines via `so-journal.mts show`.

- **L1 premise start (M1 on a lane, ×2).**
  1. An Adolion group, Author view off: settings › Start › "Start from a premise". The premise is a neutral one written on the spot.
  2. Play 12 turns with `send_generate`.
  3. Expect: the opening `liv_open` activates; journal lines `living director wrote the next turning point` and
     `the story grew: 1 director change(s) applied`; at least 2 `liv_<n>` anchors reached.
  4. Run `so-ui.mts assert-player-clean`.
  5. Click "Save this run as a story" (`#so-living-save`). Expect `Saved "… (played)" to the library.` with the excluded count.
- **L2 divergence, true positive (×2).**
  1. An authored Adolion story at a checkpoint with exits; `stagecraft.prefetchEnabled=false`, so the row isolates divergence.
  2. Play 3 turns deliberately off script: the player walks away from every exit's situation.
  3. Expect: `divergence` judge calls with `fit` ≥ 0.6 on "none"; after the 2nd (or one ≥ 0.9) a scheduler job
     `living:branch:<cp>`; next boundary journal `the story grew`; `checkpointById.liv_b1_way` present, priority below the
     authored exits, its exit into the downstream anchor; Author view `#so-living` shows "The story branched because …".
  4. **Rollback:** swipe (then, in a second pass, delete) the reply whose boundary applied it. Expect `liv_b1_way` gone,
     `extras.living.divergence.branchedFrom` empty, journal `living story stepped back`, and the active checkpoint valid.
  5. Play one more off-script turn: it may branch again.
- **L3 divergence, false positive (×2).**
  1. Same story, fresh chat, prefetch off.
  2. Play 8 turns that pursue an exit's situation without opening it.
  3. Record every `divergence` reading. Expect 0 branches; report readings "none" ≥ 0.6 / turns (the false-divergence rate, M22).
- **L4 one-checkpoint prefetch (×2).**
  1. An authored story with branching and prefetch on, judge use `divergence` off.
  2. Enter a checkpoint with exits.
  3. Expect within 2 boundaries a job `living:prefetch:<cp>` and a proposal with `prepared: true` applied as `liv_b<n>_way`; Author
     view "Prepared ahead: one more way forward from here"; no prepared proposal for any checkpoint other than the active one;
     moving on to the next checkpoint prepares one there.
  4. Turn the judge use `divergence` back on, play an off-script turn at the prefetched checkpoint: no second branch.
- **L5 graph rollback and reopen on the lane.**
  1. After L1 with ≥ 2 generated anchors, delete the last 4 messages.
  2. Expect ops after the restored boundary dropped (journal), then reopen the chat.
  3. Expect the pinned copy equal to the fold of `extras.living` (journal has no "rebuilt from its history" line) and the same active checkpoint.

## Decisions for the owner (2026-10-10)

1. **Bundle budget.** Plan 22 adds ~18 KB to the main entry after moving the director, its unit, the judge code and the
   author view behind lazy imports. Master had 1.4 KB of headroom (1,248,575 of 1,250,000 B); this branch builds at
   1,267,757 B. What stays is startup code: story validation of `living`, schema, settings copy, the port, wiring and
   sanitizers. Options: (a) raise `BUNDLE_BUDGET_BYTES` to 1,275,000 in `webpack.config.js` and
   `scripts/release/buildChecks.mjs` (+ `bundleBudget.test.mjs`); (b) a separate plan that lazy-loads the copilot
   coordinator's stage half or the plan 11 create path out of the `@stagecraft` / `@wizard` barrels (estimated 8–15 KB each). Not changed here.
2. A prefetched branch counts as the checkpoint's one branch, so true divergence there gets none. Keep, or allow one prepared
   plus one divergence branch?
3. Branches on authored (non-living) stories are on by default. Add a story-level switch (`living.branching: false`) for
   authors who want a fixed graph?
4. Branch autonomy follows the story's `living.autonomy` (author view) and is `auto` for players and for stories with no
   `living` block. Should authored stories' branches wait in Author view (suggest)?
5. Divergence thresholds (0.6 ×2 / 0.9) are predeclared, not calibrated: calibrate on L3 before tuning?
6. The critic errs strict (spike). Keep it, soften it further, or let a stalled frontier fall back to `suggest`?

## Gate record (2026-10-10, branch `v2.8-living-director`, merged with master `84c23335`)

- `npm run gates -- --no-storybook`: **RED at build only**:
  - typecheck, typecheck:test, debug:typecheck and lint ok;
  - test ok (jest, every suite);
  - test:replay ok (32 of 32 killed);
  - build FAIL: webpack performance error, main entry 1,267,757 B over the 1,250,000 B budget (decision 1 above).
  test:debug, test:plugin and test:release were not run by the gate after the build failure.
- Run separately:
  - `npm run test:plugin`: 120 pass, 0 fail;
  - `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run test:debug`: 1248 pass, 1 fail. The failure is "the build half reads
    plan 08s nested manifest", because `dist/manifest.json` is not written while the build fails;
  - `npm run test:release` was not run (needs the build).
- Master's own main entry at `84c23335`: 1,248,575 B (measured from a `git archive` export).
- Storybook not run in this worktree. To re-run in the main checkout: `Drawer/LivingPanel`, `Drawer/LivingSave`,
  `Settings/LivingStart`, plus `Settings/EntryPoints`, `Settings/PlayGroups`, `Drawer/DrawerTabs` (lazy panels, new rows).
- New jest:
  - `generation/living/living.test.ts`, `directorGoldens.test.ts`;
  - `runtime/coordinators/livingCoordinator.review.test.ts` (rollback ≡ replay property over 6 seeds, divergence debounce,
    branch, prefetch);
  - `runtime/livingSpoilers.review.test.ts` (F27), `runtime/livingPort.test.ts`;
  - boundary work, guide coverage.
- Guards updated: ownership census (+9 rows), fault matrix (package `livingDirector`, 10 cells),
  `architecture.test.ts` (the director's isolation), errorCopy, the arrival golden, passProfiles.
- No live gate: nothing staged into ST (the owner is playing on :8000). The live rows are listed above and owed (31 M21–M24).
