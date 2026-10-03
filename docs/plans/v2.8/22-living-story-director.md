# Plan 24 — Living story: a director that writes the story ahead of the player

**Status: EXPLORATION 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

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

What already moves on its own during play:

- the speaker director;
- the curator (proposals, with auto tiers for marked entries);
- complications (authored pools, released on quiet turns);
- extracted arcs, which open and close threads;
- canon regeneration;
- chapter seals.

A live story edit can also reach a running chat. `applyStoryUpdate` + `storyDiff` treat added checkpoints and
transitions as compatible, so they hot-swap with no prompt (`engine/storyDiff.ts:230,283-288`). Today only an author's
save triggers that.

## Proposal: a "living story" mode with a director

A story can be **partly or wholly unwritten**. A director, the agentic wizard's loop pointed at a running chat, writes
the next anchor **ahead of the player**, from:

- the premise;
- canon;
- the open threads the player actually pursued (arcs);
- character agendas (plan 18);
- the pacing shape.

The existing machinery then plays it as if an author had written it.

### What the author (or a player starting from nothing) provides

```json
{ "id": "my-living-story", "title": "…", "living": {
    "premise": "…", "tone": "…", "cast": ["…"], "player_role": "…",
    "horizon": 1, "chapter_size": [3, 5],
    "ending": "open" | { "when": "<gate>" } | "director-proposes",
    "autonomy": "suggest" | "auto",
    "authored_until": "<checkpoint id>" } }
```

- **Fully living:** a premise, a cast and an opening scene; the wizard's Premise step already drafts these. The first
  anchor is generated at start.
- **Hybrid:** an authored story with `authored_until`. The authored part plays as today, then the director continues.
  This also answers "what happens after the ending": an open epilogue (plan 17) or a sequel arc (plan 25).

### The director loop

- **When it runs:** at a committed boundary when the active anchor is the last one inside the horizon (default 1 anchor
  ahead). Off the reply path, as a background unit with a RunToken, like expansion.
- **What it writes:** only the **future** of the graph:
  - one new anchor: objective as world pressure, `state_snapshot`, tension target, chapter;
  - the transition(s) into it from the current anchor's exits;
  - a stub between them, which the existing expansion then fills.
  - It may declare at most N new qualities per anchor and must reuse existing ones first. That keeps the extractor's
    read scope bounded.
- **What it never writes:**
  - the blackboard, memory or past checkpoints;
  - the active checkpoint;
  - anything behind the player.
  - The same rules as stagecraft: it proposes and the runtime applies.
- **How it applies:**
  - Through `storyDiff`'s compatible ops (checkpoint-added, transition-added) at a boundary, into **this chat's pinned
    copy only**. The library is untouched, and other chats are never affected (existing invariant).
  - Each generated anchor records `createdAt {boundary}`. A rollback before that boundary removes it, the same mechanism
    T6-1 added for staled chains (`restoreStaledAfter`). So rollback equals replay holds.
- **Autonomy tiers:**
  - `suggest`: the next anchor waits in the author view as a card (accept / edit / regenerate). This is today's
    no-auto-pilot rule, kept.
  - `auto`: the anchor applies at the next boundary, journaled, and reviewable afterwards in the author view.
  - For the player-only persona, `auto` is the only workable tier.
- **Quality checks before applying:** the existing code checks run on every route (`generation/paths.ts`), plus the
  critic with the agency policy and the J7 canon-verification judge when calibrated (plan 14). The anchor must also be
  reachable from the current state: no `gate-open-on-arrival` and no impossible gates. Failing means regenerate, then
  fall back to an open stretch (plan 17), never a broken graph.
- **Pacing and chapters:**
  - The director follows the story's `arc_template` and tension history to pick the next anchor's tension target.
  - Every `chapter_size` anchors it closes a chapter, so seals keep memory bounded on an endless run (chapter and era
    seals exist).
  - `ending` decides whether it ever writes a `final`.
- **Characters:**
  - It may propose cast changes and new NPCs as provisioning **proposals** only.
  - The create-only wizard rule holds: a card, a lorebook or a group is never made without the author or player
    confirming it.
  - In `auto` mode it uses existing cards and NPC replies.

### Player agency is the point

The director's main input is what the player did, not what a plot needs:

- open arcs the player engaged with;
- relationships (plan 18);
- refusals.

A refused route feeds the next anchor; it is not something to recover from. The default agency policy applies to every
generated anchor: world pressure, never the player's decisions.

### Save the run as a story

Because the run's graph is a real format-2 story in the chat's pinned copy, "Save as story" can export it to the
library. **Playing becomes a way of authoring**, and the Studio can then edit the result. This is the nearest thing to
"not every story is pre-made" turning into "every played story can become one".

## Cost and risk

- **Model calls:**
  - one director call per anchor (about one per 3–8 player turns);
  - expansion as today;
  - the critic.
  - On the memory or harness profile, never the reply path.
- **Coherence drift over a long run** is the main risk. The mitigations are canon plus chapter seals, canon-verification
  judging, and bounded quality growth.
- **Overturns a v2 non-goal** (no auto-pilot). The `suggest` tier keeps that rule for authors; `auto` is a deliberate
  exception, so it needs the user's decision and its own invariant in `architecture.md`.
- Spoilers do not apply. The future does not exist until it is written, which also makes the player-mode spoiler rules
  easy.

## Measurement before building

- **M1 spike (lab, no UI):** a premise-only story on the Adolion lab cast, 3 chapters, `auto`, scripted player turns.
  Predeclared floors:
  - 0 anchors with impossible or open-on-arrival gates;
  - 0 narrated player decisions in generated guidance;
  - at least 1 new anchor per chapter built on a player-pursued arc;
  - warden contradiction notes per 50 turns no higher than the authored baseline.
- **M2, human:** blind pairs of excerpts, authored vs living, rated for coherence and "felt free". The floor is set
  before the run.
- **M3, hybrid:** an authored act continued by the director past its end. Does it hold the act's threads?

## Gates

- **Pure:** director op validation (future-only writes), rollback removes generated anchors (property test,
  rollback ≡ replay), bounded qualities.
- **Generation:** a golden plus the critic.
- **Architecture:** `architecture.test.ts` keeps the director away from the blackboard and memory, like stagecraft.
- **Ownership:** an ownership census row for the director unit.
- **Live:** M1 ×2 on a lane, then a session card.
- `npm run gates`.

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
   SillyTavern's docs, with a character-building tutorial, is its own plan: `27-wizard-assistant.md`. Decision 5: M1 first;
   if it passes, M1–M3 ship with proper UI.
5. Start with the M1 spike before any UI? **Recommended: yes.** yes, in fact, if it goes well, lets do everything from m1 to m3 with proper UI

## Links

18 character life (agendas as director input), 25 new game plus, 14 J7 (canon verification), 12 curator create
(similar proposal discipline), 17 open stretches (fallback and epilogue), 03 briefing (generated from the premise),
19 quests (the director may open side quests).
