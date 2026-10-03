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
`runtime/settingsModel.ts:88`; measured by v2.8 17, built for production by v2.8 18 Q6), **curator auto tiers** (the
`sp8CuratorTiers` dev spike, same list) and **chapter seals** (v2.6 plan 07, off until the Q-M floors pass; owned by
v2.8 01 §F). The director may read them in a dev run; production never depends on them before they ship.

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

- **Storage.** The chat keeps `living.base` (the pinned story as loaded, its hash) and `living.ops[]`, an ordered log of
  `{id, boundary, messageId, kind, payload}` where `kind` is `add-checkpoint | add-transition | add-stub |
  add-quality`. The played graph is always `fold(base, ops)`, with the expansion merge on top. `pinnedStory` stays the
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
  the floor answers `history-unavailable`. Ops older than the floor can never be undone, so they are folded into `base`
  when the engine drops the matching log entry. The ops log is therefore bounded by the same window.
- **Author update.** `applyStoryUpdate` on a living chat diffs the library version against `living.base`, then re-folds
  the ops; an op whose target the update removed makes the diff invalidating (the existing keep/restart/cancel choice).
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
  generated anchors are dropped. Private inputs are never written into story fields. In Author view the author may opt to
  include unreached anchors (the Studio is an author surface).
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
  Complications and curator tiers stay off in M1 (not production inputs, C10).
- **M2, blind:** pairs of excerpts, authored vs living, rated for coherence and "felt free". The floor is set before the
  run. Adolion excerpts are rated by Astra (delegated) or a second model, never the user (v2.8 rule 11).
- **M3, hybrid:** an authored act continued by the director past its end. Does it hold the act's threads?

## Gates

| Gate | Tier |
|---|---|
| Director op validation (future-only writes, bounded qualities, namespaced ids) | D |
| Graph-op history: rollback/reopen ≡ replay property test; retained-window compaction; pending-write discard; stale proposal discarded after a rollback (F26) | D |
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

## Open questions

- Save as story drops unreached generated anchors by default (F27). Is that the export the user wants, or should the
  player be asked?
- M2's raters: Astra or a second model for Adolion excerpts; does the user want a non-Adolion story for M2 so they can
  rate it themselves?

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
