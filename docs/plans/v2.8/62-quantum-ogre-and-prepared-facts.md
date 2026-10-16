# Plan 62 — Quantum-ogre probe, then prepared world facts

**Status: candidate, owner decision pending. Revised 2026-10-16 after Astra's review (§Review 2026-10-16).** Written
2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md` H1, H2). Not built, not queued. Three stages, each
its own owner decision: **stage 1** a continuity measurement; **stage 2** authored prepared facts (deterministic, no model
call); **stage 3** model-filled facts (only after stage 2 has a session, with its late-result contract). A stage 1 result
informs the owner; it does not authorise stage 2 by itself. Implementation tier **D**; acceptance **CL** (probe on the cloud
reply model) + **RP** informational (an Artemis leg, deferred beyond the 12 h cap unless the owner displaces an item).
Overview: `00-overview.md` §Rules.

## What it is

- **The quantum ogre.** When a player opens a drawer or asks an NPC who forced the lock, the reply model invents the answer at
  that moment. Swipe and the answer changes; the world has no fact behind it.
- **Stage 1: measure what matters.** Not whether swipes agree about something nobody fixed (independent inventions may
  legitimately differ, and agreement can just mean a stereotyped answer), but: (a) do replies **contradict a fact the story
  committed** and handed to its holder; (b) does the fact **persist** across approaches, later turns and revisits; (c) is it
  **disclosed** to someone it was not meant for. Cross-swipe agreement on an unstated detail is recorded as information only.
- **Stage 2: authored prepared facts.** An author fixes what must hold before the player arrives: either a fact, or a short
  list of authored alternatives from which a seeded pick commits one at the boundary when the thing comes within one step.
  The datum goes to its holder's private block only. Later replies collide with it instead of inventing.
- **Stage 3: model-filled facts.** A memory-role pass fills an authored hint with a model-written datum. Asynchronous, so it
  needs the late-result contract below. Not before stage 2 has a session.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/simulation-blackboard.md` P1 (prepare facts before contact, value 4, effort L),
  P2 (closed lists, commit before the roll), P3 (root truth vs player itinerary), P4 (quantum-ogre probe, value 4, S–M, RP),
  P5 (swipe A→B→A identity). P7 (pre-publication private turns) is an anti-pattern here: it blocks the reply and breaks "the
  judge never blocks".
- `docs/plans/v2.8/extension-research-2026-10-14/SUMMARY.md` H1, H2.
- Their doctrine (AGPL, ideas only): everything one step away is fixed before the player replies, closed contents, root truth
  apart from what NPCs believe, an NPC's prepared lie committed before questioning.

## Current state in code

Verified on master `e8b9dd6d`.

- **Nothing prepares world facts.** Everything about the unvisited world is authored (lorebooks, checkpoints, life agendas and
  schedules, `src/engine/lifeSchema.ts`) or extracted after it was narrated (`src/memory/contract.ts`, `[knows]`/`[unaware]`/
  `[hiding]`).
- **Distance.** `reachableByCheckpoint` is transitive reachability (`buildReachability`, `src/engine/validate/gates.ts:122-134`
  walks successors until exhausted), not distance one. The one-step set is `outgoingByCheckpoint`
  (`src/engine/schema.ts:554`, built at `src/engine/validate.ts:90-95`).
- **Held facts already have a safe path.** `MemoryInjector` renders per drafted member and strips held secrets with
  `withoutSecretLines`; epistemic data never reaches World Info (architecture invariant). Member-filtered lore
  (`characterFilter`) fires only on that member's turn, which is how a probe can hand one member a committed fact today.
- **Seeded chance exists.** Rolls draw from hash(chat, story, boundary, key) (`src/runtime/chance.ts`), so a seeded pick is
  rollback ≡ replay by construction.
- **Derived artifacts invalidate, they do not regenerate.** `DerivedRecord` keeps `inputs` and `range`
  (`src/memory/derived.ts:18-27`); dropping it marks output stale. Model output is not reproducible on replay.
- **Swipe A→B→A is already tested in jest**: `src/runtime/spikes/swipeBack.review.test.ts:89-110` runs 4 seeds × 200 cuts on a
  real manager (spike `spikes.swipeBackCache`, `src/runtime/spikes/swipeCache.ts`). What is missing is a browser leg through
  ST's real swipe controls.
- Scenario vocabulary has `send_generate` and `swipe` (`scripts/debug/lib/scenarioSchema.mts`); `so-session` has
  `swipe-new`/`regen`.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Probe only** | stage 1; record contradiction, persistence, disclosure | S–M + CL lane time | the problem stays; we know its size |
| **B. A, then authored prepared facts** | stage 2: authored fact or authored alternatives + seeded pick at distance one | M | author work; covers only foreseen contacts |
| **C. B, then model-filled facts** | stage 3: memory-role fill of authored hints | L | late results, non-reproducible output, a new private input |
| **D. Nothing** | | 0 | unmeasured |

## Recommendation

**A now. B is an owner decision after the A record, not an automatic consequence of it. C only after B has a session.**

### Stage 1 — the probe (D harness, CL acceptance, RP informational)

- A scenario family `test/scenarios/probe/quantum-ogre-*.json` on a synthetic English lab story (never the campaign). Ten
  contact cases over three kinds: closed container, NPC knowledge, trace author.
- **Committed fact.** Each case gives the holder one fact through existing machinery: a member-filtered lore entry (the
  holder's turn only) for NPC knowledge and traces, an authored container entry for containers. Nothing new is built.
- **Contradiction (primary).** Ask about the thing; score every reply for contradiction with the committed fact: any named
  item or person that conflicts counts, including additions to a closed container, not only the first item. Second-model
  rater with the transcript hidden plus a deterministic string pass where the answer is a single noun.
- **Persistence.** Re-ask the same question three turns later and after leaving and returning to the place; score as above.
- **Disclosure.** Count replies in which the fact appears from a member who does not hold it, or before the player reached the
  thing.
- **Cross-swipe agreement on an unstated detail** (the original probe): recorded per case as counts, informational. It is not
  a decision gate: agreement can be a stereotyped answer, and disagreement is not proof of a continuity failure.
- Swipe A→B→A: a browser leg on a no-model lane (`st-lanes` no-model, ST's own swipe controls), since the jest check exists.
- Every revised experiment is predeclared here before it runs; no floor moves after a result.

### Stage 2 — authored prepared facts (owner decision after stage 1)

- **Format.** `checkpoints[].prepare` and `locations` values may carry `prepare: [{ id, about, holder: <roster id> | "narrator",
  fact?: string, alternatives?: string[], closed?: boolean }]`; exactly one of `fact` or `alternatives` (2–6 entries, each
  ≤ 200 characters). At most 4 per checkpoint. Validator: `holder` is a roster id or `narrator` (an omniscient member,
  `view: "omniscient"`); ids unique per story.
- **When.** At a boundary, a hint becomes due when its checkpoint is one step away (`outgoingByCheckpoint[active]`, not
  `reachableByCheckpoint`) or its location becomes current or adjacent. Commitment is synchronous in boundary work
  `prepare-facts` (after `scene-read`): a `fact` is committed as written; `alternatives` are resolved by a seeded pick keyed
  hash(chat, story, hint id). No model call, so there is no late result, no cancellation and replay is exact.
- **Storage.** A code-written row in `extras.memory` with its boundary, so rollback drops it at or after that boundary like any
  derived row (rollback ≡ replay over the pick).
- **Rendering and disclosure.** Holder-only private block ("You know: …"); `narrator` rows only in omniscient members' private
  blocks. Never a shared tier, the ledger, the WI mirror, canon, a player surface, or a warden note's text. **A prepared row
  never retires because its words appear in a reply** (`evidenceInWindow` would retire it after a private aside or a
  thought): it stays held until a recipient-specific disclosure exists under v2.8 42's witness contract. Until 42 B is built
  it stays held for the life of the chat.
- **Closed lists.** A `closed: true` hint makes "a new item appeared in it" a continuity-warden finding. The note is
  content-free ("the scene added something to a container the story fixed; keep to what is established"), so the shared
  note reveals nothing the other drafted members may not have.
- **Root truth.** Not a field. One guide line in the `prepare` topic: record what is true, never what the player will do.
- Registry feature `prepared-facts`, on by default once built (rule 9); guide topic `prepare`; Studio editor under Flow
  (checkpoint) and World (locations); wizard tool field.

### Stage 3 — model-filled facts (only after stage 2 has a session)

- A hint without `fact`/`alternatives` is filled by one memory-role call per boundary with the story's lore and the holder's
  own resting view (never other members' private rows). Output `[prepared] <hint id> | <datum>`, ≤ 200 characters.
- **Late-result contract.** A fill carries its input identity (chat, story, boundary, hint id, inputs hash). It is accepted
  only if that identity is still current when it lands and the player has not yet reached the thing; otherwise it is
  discarded and the contact stays unfilled (the reply invents, as today). The accepted output is stored with its identity;
  replay reuses the stored text and never regenerates; a rollback past the fill drops it, and a re-fill is a new call.
- A fill that conflicts with narration already in the window is discarded (the narration wins).

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| Q1 | Contradictions against the committed fact, cloud reply model, shipped defaults: 10 cases × 6 replies, every named item scored | recorded as a count of 60 | CL |
| Q1r | Same on Artemis, 5 cases × 4 replies | recorded as a count of 20 (informational, deferred beyond the cap unless displaced) | RP |
| Q2 | Persistence: the same question re-asked 3 turns later and after a revisit, 10 cases × 2 re-asks, cloud reply model | recorded as a count of 20 | CL |
| Q2d | Disclosure: replies naming the fact from a non-holder or before contact, over the Q1 and Q2 runs | recorded (0 expected) | CL |
| Q2a | Cross-swipe agreement on an unstated detail, per case | recorded only; never a gate | CL |
| Q3 | Swipe A→B→A in the browser on a no-model lane: blackboard and memory equal the first A visit | 2/2, ×2 | D |
| Q4 | Stage 2: contradictions on the Q1 cases with prepared facts in place (same shape as Q1) | recorded beside Q1 | CL |
| Q5 | Stage 2 privacy: a prepared row appears only in its holder's (or an omniscient member's) actual outgoing request; 0 hits in other members, the resting block, shared tiers, canon, WI mirror, warden note text, player surfaces (request capture + string property) | 0 hits | D |
| Q6 | Stage 2 rollback ≡ replay over 4 seeds (swipe, edit, delete, reopen) incl. a pick boundary | 4/4 | D |
| Q7 | Stage 2 seeded pick: same (chat, story, hint) gives the same alternative over 1,000 replays; every alternative chosen at least once over 200 chat ids | holds | D |
| Q8 | Stage 2 closed list: a scripted addition yields one content-free warden finding, 0 on an unrelated reply (10 + 10 cases) | 10/10, 0/10 | D (scripted judge answer) + CL |
| Q9 | Distance: a hint two steps away is never due; one step away always due (property over ≥ 500 generated graphs) | holds | D |
| Q10 | Stage 3: a fill landing after its identity changed or after contact is discarded (planted orders, 4 seeds) | 4/4 | D |

Floors are informational and never retuned (rule 2). No floor decides a build; each stage is an owner decision on the record.

## Gates by tier

- **D:** `npm run gates`; scenario schema accepts the probe family; Q3; with stage 2, Q5–Q9, validator and guide coverage,
  `so-ui.mts assert-player-clean`; with stage 3, Q10.
- **CL:** Q1, Q2, Q2d, Q2a on the cloud reply model (about 100 replies, about 3 h of lane time, no GPU); the second-model rater;
  Q4 with stage 2.
- **RP:** Q1r (about 50 min Artemis) is informational and does not fit plan 24's 2.5 h share, which is already over; deferred
  with its reopen trigger (stage 2 built, or a free 3090 night) unless the owner displaces a named item.

## Privacy and spoiler notes

- Prepared rows are held facts: holder-only, never a player surface, never retired by narration (Q5).
- The probe uses a synthetic lab story; no campaign content, and the campaign does not adopt `prepare` until the owner says so.

## Dependencies and links

- v2.8 22 living director (prefetch is the graph twin of this; addendum there), v2.8 42 witness record (recipient-specific
  disclosure), v2.8 49 complications (an authored pool), v2.8 55 commitments.

## Decisions for the owner

1. **Run the stage 1 probe on the cloud reply model now?** **Recommended: yes.**
2. **Stage 2 as authored facts and authored alternatives with a seeded pick (no model)?** **Recommended: yes, as the shape;**
   build it only if the stage 1 record shows contradictions or persistence failures worth fixing (your call on the record).
3. **Stage 3 (model-filled) only after stage 2 has a session?** **Recommended: yes.**
4. **The Artemis leg (Q1r) deferred beyond the cap unless something is displaced?** **Recommended: yes.**

## Unresolved questions

- Is graph distance plus current/adjacent location enough, or is "an NPC the player is about to question" a third axis?
- Cap values (4 hints, 2–6 alternatives, 200 characters) are placeholders until the editor is drawn.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §2 (62). Verified on `e8b9dd6d`.

- **P0 — narrated is not publicly disclosed.** Accepted: `evidenceInWindow` (`src/extraction/evidence.ts:95`) matches text,
  not audience. → prepared rows never retire on narration; held until a recipient-specific disclosure under 42; warden note
  for closed lists is content-free; stage 3 reads only the holder's resting view (Q5 extended to warden text).
- **P1 — `reachableByCheckpoint` is transitive.** Accepted (`src/engine/validate/gates.ts:122-134`). → distance one from
  `outgoingByCheckpoint` (`src/engine/schema.ts:554`); Q9.
- **P1 — an async boundary job cannot finish before the next action; `inputs/range` invalidates but does not regenerate.**
  Accepted (`src/memory/derived.ts:18-27`). → stage 2 is synchronous and model-free (seeded pick); stage 3 gets the late-result
  contract (identity check, discard after contact, stored output reused on replay), Q10.
- **P1 — Q1 (cross-swipe agreement) is not a sound build gate; Q4 rewards agreement even when wrong.** Accepted. → primary
  measure is contradiction against a committed fact, plus persistence and disclosure; agreement is Q2a, information only; no
  floor decides a build.
- **Granularity (0.25 steps with four replies), first-item-only scoring, cloud-only memory-off control.** Accepted. → floors
  are counts over stated denominators; every named item is scored; the memory-off control is dropped (it could not isolate
  memory's effect on Artemis).
- **Swipe-back "first A→B→A check" is false.** Accepted (`src/runtime/spikes/swipeBack.review.test.ts:89-110`). → Q3 is a
  browser leg.
- **Cheaper design: authored facts or seeded choices first.** Adopted as stage 2.
- **Cap.** Accepted: the informational list is already over. → Q1r deferred beyond the cap unless displaced.
- Rebutted: none.
