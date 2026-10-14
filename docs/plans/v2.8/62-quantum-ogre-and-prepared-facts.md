# Plan 62 — Quantum-ogre probe, then prepared world facts

**Status: candidate, owner decision pending.** Written 2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md`
H1, H2). Not built, not queued. Two stages: **stage 1** is a measurement (the probe), **stage 2** a feature that is built only
if stage 1 shows the problem. Implementation tier **D** (probe harness, prepared-row plumbing); acceptance **RP** (probe on the
main reply model) + **CL** (stage 2's preparation pass on the memory role). Overview: `00-overview.md` §Rules.

## What it is

- **The quantum ogre.** When a player opens a drawer or asks an NPC who forced the lock, the reply model invents the answer at
  that moment. Swipe and the answer changes; the world has no fact behind it. Nothing in the story said what was in the drawer,
  so nothing can hold the model to it.
- **Stage 1 (H2): measure it.** Replay one contact moment N times (swipes, or N fresh sandbox chats from one seeded snapshot),
  ask about something the transcript never stated, and score how often the answers agree. If agreement is already high on
  Artemis with our memory and lore, stage 2 is not needed.
- **Stage 2 (H1): prepare facts before contact.** At a boundary, before the player can reach a thing (a container, an NPC's
  knowledge, the author of a trace), an off-path pass commits it as a checkable datum, held by the member it belongs to (or the
  narrator role) and rendered only into that member's private block. Later replies collide with the fact instead of
  inventing one. Depth falls with distance: what is one step away gets a full datum, two steps a skeleton, beyond that nothing.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/simulation-blackboard.md` P1 (prepare facts before contact, value 4, effort L),
  P2 (closed lists, commit before the roll), P3 (root truth vs player itinerary), P4 (quantum-ogre probe, value 4, S–M, RP),
  P5 (swipe A→B→A identity). P7 (pre-publication private turns) is an anti-pattern here: it blocks the reply and breaks "the
  judge never blocks".
- `docs/plans/v2.8/extension-research-2026-10-14/SUMMARY.md` H1, H2: "Gate it on H2."
- Their doctrine (AGPL, ideas only): the "N−1 law" (everything one step away is fixed before the player replies), closed
  contents, root truth recorded apart from what NPCs believe, an NPC's prepared lie committed before questioning.

## Current state in code

Verified on master `9e96871d`.

- **Nothing prepares world facts.** Everything about the unvisited world is authored (lorebooks, checkpoints, life agendas and
  schedules, `src/engine/lifeSchema.ts:31-75`) or extracted after it was narrated (the shared read contract,
  `src/memory/contract.ts:36-42`, `[knows]`/`[unaware]`/`[hiding]`).
- **The living director prepares the graph, not facts.** `findFrontier` picks one eligible frontier from
  `story.reachableByCheckpoint` (`src/generation/living/frontier.ts:32-41`); plan 22 adds a one-checkpoint prefetch. Ops are
  graph ops only.
- **Held facts already have a safe path.** `MemoryInjector` renders per drafted member and strips held secrets with
  `withoutSecretLines` (`src/runtime/memoryInjector.ts:133,181,205`). Epistemic data never reaches World Info (architecture
  invariant).
- **Boundary work is a registry** (`src/runtime/boundaryWork.ts:37-212`; e.g. `scene-read`, `meanwhile-proposals`,
  `living-director`). A preparation pass is one more entry with a `RunToken`.
- **No probe measures cross-swipe fact stability.** The scenario vocabulary has `send_generate` and `swipe`
  (`scripts/debug/lib/scenarioSchema.mts:21-23`); `so-session` has `swipe-new`/`regen`. A swipe onto a stored reply rolls back
  and recommits (`src/runtime/turnBridge.ts:258`).
- Plans 42–59: none prepares facts (52 = what is already known; 49 = an authored pool; 55 = authored commitments).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Probe only** | stage 1; record agreement; no feature | S–M + about 40 min Artemis | none; may show the problem and leave it |
| **B. Probe, then authored `prepare` hints** | an author marks what must be fixed before arrival (`prepare: [{ id, about, holder, closed? }]` on a checkpoint or a location value); the memory role fills each hint once, when its checkpoint enters distance 1 | M | author work; covers only foreseen contacts |
| **C. Probe, then B + emergent rows** | the shared read may also propose `[prepared]` rows for named-but-unvisited things in the window | L | over-preparation; noise in private blocks; a second read family |
| **D. Nothing** | | 0 | the problem stays unmeasured |

## Recommendation

**A now; B only if the probe misses its floor; C not before B has a session.**

### Stage 1 — the probe (D harness, RP acceptance)

- A scenario family `test/scenarios/probe/quantum-ogre-*.json` on a synthetic English lab story (never the campaign). Each
  case: seed to a contact point, `send_generate` a player line that asks about an unstated detail ("What is in the chest?",
  "Who left the door open?"), then `swipe` N−1 times (N = 6), reading each reply.
- Ten contact cases over three kinds: closed container, NPC knowledge, trace author.
- Agreement per case = the share of the N answers that name the same item or person as the modal answer, judged by a second
  model with the transcript hidden (CL), plus a deterministic string pass where the answer is a single noun.
- Arms: shipped defaults; and a control with memory tiers off (tells us whether our memory already anchors anything). The
  control runs on the cloud reply model only (Q2), to keep Artemis time inside the cap.
- Swipe A→B→A identity (P5) rides the same run: after swipes, return to the first reply; assert blackboard and memory equal the
  first visit (D, scripted; a real reply only for the extraction leg).

### Stage 2 — prepared facts (only on a stage 1 miss)

- **Format.** `checkpoints[].prepare` and `locations` values may carry `prepare: [{ id, about, holder: <roster id> | "narrator",
  closed?: boolean }]`, `about` ≤ 120 characters ("the contents of the strongbox", "who forged the letter"). At most 4 per
  checkpoint. Validator: `holder` must be a roster id or `narrator`; ids unique per story.
- **When.** A boundary-work entry `prepare-facts` (after `scene-read`) runs when a checkpoint holding hints becomes reachable in
  one step (`reachableByCheckpoint`) or a location with hints becomes the current or an adjacent one. Each hint is filled once
  per chat; a re-fill happens only after a rollback removed the fill.
- **Pass.** One memory-role call per boundary, all due hints together, with the story's lore and the current memory resting
  view. Output: `[prepared] <hint id> | <datum>` lines, ≤ 200 characters each. A line naming an unknown hint id is refused.
- **Storage.** A derived memory artifact (`memory/derived.ts` shape: `inputs`, `range`), so rollback ≡ replay holds and
  `reverseMemoryState` removes it.
- **Rendering.** Holder-only: the prepared datum joins the holder's private block as a `HeldSecret`-style row ("You know: …");
  `narrator` rows go into the narrator role's private block only. Never a shared tier, never the ledger, never the WI mirror,
  never canon, never a player surface. Once the datum is narrated in a reply, the shared read takes over as usual and the
  prepared row retires (matched by `evidenceInWindow`).
- **Closed lists (P2).** A `closed: true` hint makes "a new item appeared in it" a continuity-warden finding (the carried note,
  never a block). Only with stage 2.
- **Root truth (P3).** Not a field. One guide line in the `prepare` topic: record what is true, never what the player will do.
- Registry feature `prepared-facts`, on by default once built (rule 9); guide topic `prepare`; Studio editor under Flow
  (checkpoint) and World (locations); wizard tool field.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| Q1 | Stage 1 agreement on Artemis, shipped defaults: median over 5 cases of the modal-answer share across 4 replies | record; **stage 2 is built only if the median is < 0.67** | RP |
| Q1c | Same measure on the cloud reply model, full shape (10 cases × 6 replies), shipped defaults | recorded beside Q1 | CL |
| Q2 | Control arm (memory tiers off), full shape, cloud reply model | recorded beside Q1c | CL |
| Q3 | Swipe A→B→A: blackboard and memory equal the first A visit on 4 seeds | 4/4 | D |
| Q4 | Stage 2: with hints filled, median modal-answer share on the Q1 cases and shape | ≥ 0.85 | RP |
| Q5 | Stage 2 privacy: a prepared row appears only in its holder's drafted request; 0 hits in other members, the resting block, shared tiers, canon, WI mirror, player surfaces (payload goldens + string property) | 0 hits | D |
| Q6 | Stage 2 rollback ≡ replay over 4 seeds (swipe, edit, delete, reopen) incl. a fill boundary | 4/4 | D |
| Q7 | Stage 2 pass validity on a frozen 30-hint fixture: lines parse, name a known hint, ≤ 200 characters | ≥ 0.95 | CL |
| Q8 | Stage 2 closed list: a scripted addition to a closed container yields one warden finding, 0 on an unrelated reply (10 + 10 cases) | 10/10, 0/10 | D (scripted judge answer) + CL |

Floors are informational and never retuned (rule 2). Q1 is the decision gate for stage 2; a miss or pass is recorded as is.

## Gates by tier

- **D:** `npm run gates`; scenario schema accepts the probe family; Q3; with stage 2, Q5, Q6, Q8 (scripted), validator and
  guide coverage, `so-ui.mts assert-player-clean`.
- **RP:** Q1 in the final suite's informational cap: 5 cases × 4 replies = 20 replies at about 2.5 min ≈ 50 min plus a
  seed. The full 10 × 6 shape on Artemis (about 150 min) only on a pod or a free night. Q4 only with stage 2.
- **CL:** Q1c and Q2 on the cloud reply model (120 replies, about 3 h of lane time, no GPU); the second-model agreement rater;
  Q7.

## Privacy and spoiler notes

- Prepared rows are held facts by construction: holder-only, never a player surface (Q5).
- The probe uses a synthetic lab story; no campaign content, and the campaign does not adopt `prepare` until the owner says so.

## Dependencies and links

- v2.8 22 living director (prefetch is the graph twin of this); v2.8 49 complications (an authored pool); v2.8 55 commitments;
  v2.8 42 witness record (who heard a prepared fact narrated).
- Swipe-back reuse of a stored read (harvest H10 P3) is already built as the spike `spikes.swipeBackCache` (on by default;
  `src/runtime/spikes/swipeCache.ts`, keyed by chat, message, text hash, scope and story); Q3 is its first A→B→A check.

## Decisions for the owner

1. **Run the probe first and build stage 2 only on a Q1 miss?** **Recommended: yes.**
2. **Stage 2 as authored hints (B), not emergent rows (C)?** **Recommended: yes**; C only after a session asks for it.
3. **Probe on Artemis inside the 2.5 h informational cap at the reduced shape (5 × 4, about 50 min), full shape on the cloud
   reply model?** **Recommended: yes.**

## Unresolved questions

- Is "modal-answer share" the right agreement measure for multi-item containers? Proposed: count the first named item only.
- Distance is graph distance + current/adjacent location; is a third axis (an NPC the player is about to question) needed?
- Cap values (4 hints, 120/200 characters) are placeholders until the editor is drawn.
