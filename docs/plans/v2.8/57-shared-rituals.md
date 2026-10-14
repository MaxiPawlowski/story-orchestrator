# Plan 57 — Shared rituals

**Status: candidate, owner decision pending.** Written 2026-10-14 from the Astra review's brainstorm (owner approved
writing it the same day). Not built, not queued. Implementation tier **D**; acceptance **D** + **LT/RP** (members use
the cue naturally, without repetition). Overview: `00-overview.md` §Rules (this folder). Shared boundary contract:
v2.8 52 §Review 2026-10-14 (Astra), SC1–SC5.

## What it is

- Small recurring things a character and the player come to share: a greeting, a running joke, a meal they always take
  together, a toast before a crossing. Established by an authored moment, then offered back to the character now and
  then as an **optional callback cue** in its private block.
- A ritual can change after authored relationship milestones (variants by gate): the greeting warms, the joke gains a
  second line.
- **No streaks.** Nothing counts how often the ritual happened; missing it costs nothing; no reward for message volume
  or session length (trap 2, v2.8 27); no player-facing tally.
- Deterministic eligibility and cooldown, counted in player turns or story time, never wall-clock. Rollback ≡ replay.

## History and evidence

- `review-astra-2026-10-14.md` §Plans 48-53, additional mechanic 3: "Shared rituals. Established greetings, recurring
  meals or running jokes become optional callbacks; no streaks or missed-session penalties."
- Same review §Plans 42-47 brainstorm 2: "A recurring greeting, joke, or celebration changes after authored
  relationship milestones. Deterministic eligibility and cooldown; no reward for message volume."
- v2.8 27 §Traps 2 (session-length rewards, streaks) and 3 (`Math.random`).
- v2.8 43 (verbatim recall, gated) is the later route for rituals that emerge from play (an exact past joke).

## Current state in code

Verified on master `3a716f2b`.

- **No ritual concept.** Nothing schedules an optional callback for a member.
- **Precedents:** agendas pace `per_n_boundaries` with `every` (`src/engine/lifeSchema.ts:5-7`, `Agenda` `:44-50`);
  player-turn counting (`playerTurnsBetween`, used in `src/runtime/stretchTurns.ts:8-9`); the quiet read
  (`src/pacing/quiet.ts:43`); seeded draws (`unitDraw`, `src/engine/chance.ts:33`); the mood scene marker
  `location|time_of_day` (`src/engine/life/derive.ts:17`); schedules and presence (`src/runtime/whereabouts.ts:4-10`).
- **Private block** per drafted member: `privateLifeLines` (`src/engine/life/lines.ts:45-58`).
- **SillyTavern World Info** has sticky/cooldown per entry, but keyword-triggered, not story-gated, and not rolled back
  by our engine (gotchas: editing an entry resets sticky/cooldown).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored rituals, cue in the private block** | `life.members[].rituals[]`: `established_when`, variants by gate, cooldown in player turns or story days, optional seeded chance; one cue line when eligible | S | a cue can become repetitive if the cooldown is short |
| **B. Lorebook entries with ST cooldown** | possible today | 0 | keyword-triggered, not story-gated, not rolled back, shared with every member who triggers it |
| **C. Emergent rituals from play** | a read notices a recurring joke and proposes it | M + read | invented rituals; needs v2.8 43's verbatim store |
| **D. Nothing** | | 0 | callbacks stay accidental |

## Recommendation

**A.** C stays a candidate behind v2.8 43.

- **Format:** `life.members[].rituals: [{id, with: "player" | <roster id>, established_when, variants: [{when?, cue}],
  cooldown: {player_turns?: n, days?: n}, window?: n, chance?: 0..1, scene?: <gate>}]`. `cue` ≤ 160 characters,
  phrased as the character's option ("greet them with the old harbour salute"). At most 3 per member; the last
  holding variant wins (as v2.8 51's public rows).
- **Established.** Latch `life_ritual_<member>_<id>` (code int = the boundary it was established) in the latch pass
  (SC2 step 5); rollback detector registered (SC1).
- **Eligible** at a boundary when: established; the member and `with` are present (`whereabouts`); `scene` holds if
  given; the cooldown since the last **offer** has elapsed (player turns via `playerTurnIds`, or story days via
  v2.8 50); and `unitDraw([chat, story, member, id, offerIndex]) < chance` (default 1).
- **Offer, not use.** The cue is shown for `window` player turns (default 1), then the cooldown restarts from the offer.
  Whether the character used it is not measured or stored, so nothing can become a streak. Offer state is
  `life_ritual_<member>_<id>_offer` (code int, the player-turn index of the last offer), rolled back with the
  blackboard.
- **Cue line** (member's private block only): "- If it fits the moment, you might <cue>. It is yours to use or skip."
- **No streak surface.** Validator refuses any gate, display, widget or reward that reads `life_ritual_*_offer`; the
  established latch may be gated on (an author can say "after the salute is theirs, …"). No player view in v1 (rule
  4); author view lists rituals, variant in force, next eligible turn.
- Guide topic `rituals`, wizard field in the character-life tool, registry feature `shared-rituals` (on by default).

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| U1 | Rollback ≡ replay of established and offer keys over 4 seeds (swipe, edit, delete, reopen, Continue, group round) plus a code-only boundary (SC1) | 4/4 + 1 | D |
| U2 | Cooldown: no two offers of one ritual closer than its cooldown, counted in player turns (a group round or Continue is one turn) or story days; property over 1,000 sequences | 0 violations | D |
| U3 | No streak: no gate, display, widget, reward or player surface reads an offer key or a count (validator + guard test with a planted reader as control) | 0, control fails | D |
| U4 | Member only: the cue appears only in the ritual member's drafted request; 0 in others, shared tiers, WI mirror (payload goldens) | 0 hits | D |
| U5 | Payload invariance: a story without rituals sends byte-identical member blocks | 0 undeclared hunks | D |
| U6 | No wall-clock: ritual code never calls `Date`, `performance` or `host.now` (guard with planted control) | 0 | D |
| U7 | Natural use: 10 lab sessions with an eligible greeting; rater marks the cue used naturally in ≥ 5/10 and **verbatim-repetitive** (same wording as an earlier use) in ≤ 1/10 | ≥ 5/10, ≤ 1/10 | LT or RP |

## Gates by tier

- **D:** `npm run gates` (validator incl. U3, latch and offer logic, U1–U6; Storybook for the author row); payload
  goldens (U4, U5); guide and tools coverage; a no-model lane scenario: establish, offer, cooldown across a group
  round, swipe back before establishment, reopen identical.
- **LT/RP:** U7 in the final v2.8 suite (rule 8), lab story only.

## Privacy and spoiler notes

- A cue is per member and authored; it never names a secret (agency and `withoutSecretLines` still filter the block).
- No player surface in v1, so nothing reveals an upcoming offer.
- No Adolion content here.

## Dependencies and links

- **v2.7 37** character life (private block, presence, variants gated on `rel_*`). **v2.8 51** labels (a ritual
  variant may follow a revealed label). **v2.8 50** calendar (`days` cooldown, a meal at evening via `scene`).
- **v2.8 43** verbatim recall (option C). **v2.8 58** keepsakes (a ritual can involve a keepsake).

## Decisions for the owner

1. **Option A?** **Recommended: yes.**
2. **Cooldown from the offer, never from detected use** (so nothing can count uses)? **Recommended: yes.**
3. **No player-facing ritual list in v1?** **Recommended: yes** (rule 4; revisit after a session asks).
4. **Rituals between two members (`with: <roster id>`)?** **Recommended: yes**, both must be present; the cue goes to
   the declaring member only.

## Unresolved questions

- Should an offer be suppressed while a complication or scene-test interrupt is active (one disruption at a time,
  Astra's shared spacing idea)? Proposed: yes, a shared eligibility check once v2.8 48/49 exist.
- Cap values (3 per member, 160 characters, default cooldown) are placeholders until the editor is drawn.
