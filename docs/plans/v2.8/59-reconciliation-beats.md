# Plan 59 — Reconciliation beats

**Status: candidate, owner decision pending.** Written 2026-10-14 from the Astra review's brainstorm (owner approved
writing it the same day). Not built, not queued. Implementation tier **D**; acceptance **D** + **CL** (beat detection
on the read route) + **LT/RP** (members respond to a beat without deciding for the player). Overview:
`00-overview.md` §Rules (this folder). Shared boundary contract: v2.8 52 §Review 2026-10-14 (Astra), SC1–SC5.

## What it is

- After a **rupture** (an authored event: a betrayal, a broken commitment, harsh words), repair happens in three
  separate, evidenced beats: **acknowledgment** (the wrong is named), **apology** (regret is expressed), **repair** (an
  act that makes amends). Either side can be the one who wronged: the player or a member.
- Each beat is a latched story event with evidence from the right speaker's own line. Beats open conversation
  opportunities: the wronged member gets a private line saying what has been acknowledged or offered, and may respond
  as it chooses.
- It never decides the player's feelings, never demands an apology, never narrates the player forgiving or
  apologising, and never punishes the absence of a beat. An unrepaired rupture simply stays a rupture.
- Repair can unlock authored consequences: a 51 label reveal, a 56 permission restored, a codex fact.

## History and evidence

- `review-astra-2026-10-14.md` §Plans 42-47, five additional mechanics 4: "Reconciliation beats. Acknowledgment,
  apology, and repair are separate evidenced events. They offer conversation opportunities without deciding the
  player's feelings or demanding compliance." Also 43's brainstorm: "an insult is quoted during reconciliation".
- v2.6 14 T0 (`docs/plans/v2.6/14-findings.md`): player commitments count only from player lines; the same rule makes
  a player apology count only from a player line.
- v2.7 09: negation, hedges and double negatives hold the delta (fail safe).

## Current state in code

Verified on master `3a716f2b`.

- **Player-line evidence exists.** A quality may declare `commit_evidence` (`src/engine/schema.ts:90`); the guard
  accepts a delta only when a player (`isUser`) line in the window passes the matcher, with negation and hedge held
  (`src/extraction/commitGuard.ts:225-232`, `commitPattern` `:236-239`). So a player-side beat can be an extractor bool
  with a rubric and `commit_evidence` today.
- **No member-line evidence guard** exists: an NPC apology cannot be required to come from that member's own line.
- **Relationships** are extractor ints with a step clamp (`relationshipQualities`, `src/engine/validate/life.ts:174-181`).
- **Agency:** `PLAYER_ACTION_CLAUSE` (`src/engine/agency.ts:24`) and the director's `narratesPlayer` guard (with
  "forgive" absent and "confess", "promise", "answer" present, `src/generation/living/guard.ts:3-8`).
- No rupture or reconciliation concept exists.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored ruptures compiled to beat qualities** | `ruptures[]` (who wronged whom, `opened_when`); each compiles to three extractor bools with fixed rubrics; player-side beats carry `commit_evidence`, member-side beats need a new member-line guard; latched in order | M | detection noise on apology wording; one guard to add |
| **B. Authored gates only** | the author writes three qualities and rubrics by hand per rupture | 0 code | inconsistent rubrics, no ordering, no cue |
| **C. Typed read lines** | `[acknowledges] [apologizes] [repairs] Speaker → Target | what` in the shared read, evidence-checked | M + read lines | grows the read prompt; overlaps A |
| **D. Judge-scored beats** | a judge use labels lines | M | needs calibration; the judge never writes |

## Recommendation

**A**, reusing quality extraction and the commit guard; the member-line guard is its one new piece (shared with v2.8
55 B).

- **Format** (lazy game layer): `ruptures: [{id, wronged: <roster id | "player">, by: <roster id | "player">, what,
  opened_when, beats?: {acknowledge?: {rubric?}, apologize?: {rubric?}, repair?: {rubric?, when?}}}]`. `what` ≤ 160
  characters, author-only context for the rubric. Exactly one side is the player or both are members.
- **Compiled qualities.** `rec_<id>_ack`, `rec_<id>_apology`, `rec_<id>_repair`: extractor bools, latching, with fixed
  default rubrics ("Did <by> name the wrong of <what> in their own words?" …). A player `by` adds `commit_evidence`
  (player-line guard); a member `by` requires the **member-line guard**: the delta is accepted only when a line by
  that member in the window carries it, with the same negation/hedge holds. `repair.when` lets an author name a
  concrete act gate instead of a read (returning a keepsake, a kept commitment).
- **Order and scope.** Beats are read only while the rupture is open (`opened_when` latched) and the parties are
  present; they join the read scope through the `discovery` source (budgeted). A beat may land without the earlier
  ones (an act can repair without words); the cue states which beats exist.
- **Cues** (wronged member's private block, while open): "- <by> has acknowledged <what>." / "- … has apologised." /
  "- … has made amends: <repair>." followed by "How you respond is yours." Nothing when the wronged is the player:
  the player decides their own response. When a member wronged the player and has not acknowledged it, that member's
  block may carry "- You wronged the player: <what>. You may acknowledge it, or not."
- **Never punitive.** No beat is required by any gate the validator can see as time-based; an unrepaired rupture moves
  nothing on its own (the 53/55/56 affirmative-event rule applies to any gate that reads `rec_*` negatively).
- **Consequences.** `rec_*` are ordinary gate keys: an author gates a 51 label, a 56 permission or a codex fact on
  `repair`.
- Guide topic `reconciliation`, Studio editor under Characters, registry feature `reconciliation` (on by default).

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| B1 | Rollback ≡ replay of `rec_*` over 4 seeds (swipe, edit, delete, reopen) plus a code-only boundary (SC1) | 4/4 + 1 | D |
| B2 | Speaker evidence: a player beat is never accepted from a member line, a member beat never from the player's or another member's line (guard unit set incl. quoted apologies) | 0 misattributions | D |
| B3 | No player narration: 0 cues or director drafts state that the player forgives, apologises or reconciles (string property + guard) | 0 | D |
| B4 | Not punitive: no gate or move that reads an absent beat is accepted by the validator as a penalty (planted control refused) | 100 % | D |
| B5 | Cue scope: cues reach only the wronged member (or the wronging member's own reminder); 0 in shared tiers (payload goldens) | 0 strays | D |
| B6 | Beat detection: labelled set ≥ 30 per beat + ≥ 60 negatives (sarcastic, hedged, quoted, refused, hypothetical apologies): precision ≥ 0.90, recall ≥ 0.65 per beat | as stated | CL |
| B7 | Response without compliance: 10 lab scenes per side; rater marks the wronged member's reply as responding to the beat ≥ 6/10 and as narrating the player's feelings 0/10 | ≥ 6/10, 0/10 | LT or RP |

## Gates by tier

- **D:** `npm run gates` (validator, compile, member-line guard units, cues, B1–B5; Storybook for the author panel and
  editor); payload goldens (B5); guide and tools coverage; a no-model lane scenario with seeded beat deltas: open,
  acknowledge, swipe back, apologise, reopen identical.
- **CL:** B6 on the read route, ×2. **LT/RP:** B7 in the final v2.8 suite (rule 8), lab story only.

## Privacy and spoiler notes

- A rupture can be private (a member wronged another out of the player's hearing); its cues stay in member blocks,
  and nothing reaches a player surface in v1 (rule 4).
- Beats are read from the transcript the player sees; no secret is added by them.
- No Adolion content here.

## Dependencies and links

- **v2.8 55** commitments (a broken commitment opens a rupture; the member-line guard is shared). **v2.8 51** labels,
  **v2.8 56** permissions, **v2.8 52** codex (consequences of repair). **v2.8 58** keepsakes (returning one can be the
  repair act). **v2.8 43** verbatim recall (quoting the insult, later). **v2.8 47** promises (player side).

## Decisions for the owner

1. **Option A, three compiled beat qualities per rupture?** **Recommended: yes.**
2. **Build the member-line evidence guard here (shared with v2.8 55 B)?** **Recommended: yes.**
3. **No cue to the player side** (the player decides their own response)? **Recommended: yes.**
4. **No player-facing rupture list in v1?** **Recommended: yes** (rule 4).

## Unresolved questions

- Should a repaired rupture also step a relationship axis automatically? Proposed: no; authors gate on `rec_*`.
- Multiple ruptures between the same pair: one record each, read in order of opening; scope cap applies.
- Rubric wording is a placeholder until B6's labelled set is drawn.
