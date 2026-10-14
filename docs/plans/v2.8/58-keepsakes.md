# Plan 58 — Keepsakes tied to witnessed moments

**Status: candidate, owner decision pending.** Written 2026-10-14 from the Astra review's brainstorm (owner approved
writing it the same day). Not built, not queued. Implementation tier **D**; acceptance **D** + **LT/RP** (a witness
recognises the keepsake). Overview: `00-overview.md` §Rules (this folder). Shared boundary contract: v2.8 52 §Review
2026-10-14 (Astra), SC1–SC5.

## What it is

- An object that means something because of a specific moment: the ring given on the bridge, the map the player
  returned, the coin from the first crossing. The object is linked to the **moment** (the boundary and message where it
  happened) and to the characters who **witnessed** it.
- Explicit boundary events govern it: given, returned, lost, recognised. Each is an authored gate, latched in the
  latch pass, rolled back by a swipe like any story state.
- It unlocks contextual dialogue: a witness, when drafted, gets a cue ("You were there when the player was given the
  ferryman's coin; you might remember it if it comes up"). A non-witness knows only what it can see or is told.
- The player sees their keepsakes, each with its moment in a short authored line, on the giver's person page (v2.8 52)
  or a Keepsakes list in the Journal.

## History and evidence

- `review-astra-2026-10-14.md` §Plans 42-47, five additional mechanics 3: "Meaningful keepsakes. An object links to a
  specific witnessed moment and unlocks contextual dialogue. Explicit boundary events govern giving, returning, or
  recognizing it."
- v2.8 42 (witness filter v2): who heard what; the review's P0 on mixed-audience messages applies to "witnessed".
- v2.8 27 §Traps 5 (render-time hiding) and G1 (counts from the projection).

## Current state in code

Verified on master `3a716f2b`.

- **No inventory or item concept.** `WIDGET_KINDS` has no inventory (`src/engine/gameSchema.ts:117`); a `clues` widget
  can list text rows gated by `when` (`src/engine/validate/widgets.ts:13,20`), with no giver, moment or witnesses.
- **Presence** at a boundary: `presentRosterIds` from enabled members minus away members
  (`src/runtime/whereabouts.ts:7-10`). Engine snapshots keep the blackboard per boundary for 200 boundaries
  (`src/engine/engine.ts:488`), so presence at an old boundary is not recoverable after truncation unless written down.
- **Private block** per member: `privateLifeLines` (`src/engine/life/lines.ts:45-58`).
- **Latch precedent:** quest closes (`src/engine/quests.ts:68-73`); life code writes in the derive seam
  (`src/runtime/stretchTurns.ts:14-18`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored keepsakes, latched moments, recorded witnesses** | `keepsakes[]` with `given_when`, `returned_when?`, `lost_when?`, `moment` text; witnesses written at the give boundary; witness cue; player list | S–M | "present" is not "witnessed" until v2.8 42 lands |
| **B. Clues widget** | today's widget, one row per object | 0 | no witnesses, no cue, no giver |
| **C. A + read-detected gifts** | the read proposes a gift from a line ("she pressed the coin into your hand") | M + read | invented objects; needs member-line evidence (v2.8 55 B) |
| **D. Nothing** | | 0 | objects stay prose |

## Recommendation

**A.** Witnesses are present members until v2.8 42's witness record exists, then members who heard the moment's
message (a mixed-audience message counts as not witnessed, per 42's P0).

- **Format** (lazy game layer): `keepsakes: [{id, name, from: <roster id>, moment, given_when, returned_when?,
  lost_when?, cue?}]`. `name` ≤ 40, `moment` ≤ 160 characters, plain text, past tense ("Given on the night bridge
  when the lanterns failed"). At most 12 per story.
- **State.** Latch `keep_<id>` (code enum `held | returned | lost`, each value latching once) and `keep_<id>_at` (code
  int, the give boundary). At the give boundary the latch pass also writes `keep_<id>_w_<member>` (code bool) for each
  witness, so recognition survives log truncation. All in SC2 step 5 (re-run at step 7); rollback detectors registered
  (SC1).
- **Return and loss need an event** (no gate of time keys only, `== false`, start value, top-level `not`).
- **Witness cue** (private block, witnesses only, while `held`): "- You were there when the player received <name>:
  <moment>. You might recall it if it comes up." The author's `cue` replaces the default text. Returned: "- The player
  gave back <name>." No cue for non-witnesses; the giver is always a witness.
- **Player view.** "Keepsakes": name, moment, state words (kept, returned, lost); on the giver's person page when the
  giver is known (SC3), else in the Journal list. Hidden until given; no placeholders, no counts of unearned ones.
- **Recognition gate.** `keep_<id>_w_<member>` is an ordinary gate key, so an author can write "Tom recognises the
  coin" as a transition, codex fact or 51 label.
- Studio editor under World, wizard tool `set_keepsake`, guide topic `keepsakes`, registry feature `keepsakes` (on by
  default, rule 9).

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| K1 | Rollback ≡ replay of `keep_*` and witness keys over 4 seeds (swipe, edit, delete, reopen) plus a code-only boundary (SC1) | 4/4 + 1 | D |
| K2 | Witness scope: the cue reaches only recorded witnesses; a member absent at the give boundary never gets it (property over presence patterns) | 0 strays | D |
| K3 | Truncation: witnesses and the moment survive a reopen with the log truncated past the give boundary | 100 % | D |
| K4 | Spoiler property: ≥ 500 seeds; no ungiven keepsake name, moment or count on player surfaces; page byte-identical with and without ungiven keepsakes | 0 leaks, identical | D |
| K5 | Events only: return/loss on time or absence refused by the validator | 100 % | D |
| K6 | Feature-only fixture: a story with only keepsakes renders them (SC4) | holds | D |
| K7 | Recognition in play: 10 paired lab scenes (keepsake shown to a witness vs a non-witness), rater (blind) identifies the witness's reply as recognising the moment | ≥ 8/10 | LT or RP |

## Gates by tier

- **D:** `npm run gates` (validator, latch pass, witness writes, cue, projection, K1–K6; Storybook for the list and the
  editor); payload goldens (cue only for witnesses); guide and tools coverage; a no-model lane scenario: give with one
  member away, swipe, regive, return, reopen identical; `so-ui.mts assert-player-clean`.
- **LT/RP:** K7 in the final v2.8 suite (rule 8), lab story only.

## Privacy and spoiler notes

- The moment text is authored and shown to the player once given: the guide's Bad example names a twist in it.
- Cues are per witness; a held secret in the moment is the author's responsibility, and the cue still passes
  `withoutSecretLines` for that member.
- No Adolion content here.

## Dependencies and links

- **v2.8 42** witness record (witness = heard, after it lands). **v2.8 52** codex pages and `knownEntities`.
- **v2.8 57** rituals (a ritual may involve a keepsake). **v2.8 59** reconciliation (returning a keepsake can be a
  repair event). **v2.8 55** commitments (a promised object).

## Decisions for the owner

1. **Option A?** **Recommended: yes.**
2. **Witness = present at the give boundary until v2.8 42, then heard?** **Recommended: yes.**
3. **Witnesses written down at the give boundary** (one bool per witness) so truncation never forgets them?
   **Recommended: yes.**
4. **Player list on the giver's page, or a Journal list?** **Recommended: giver's page when known, Journal otherwise.**

## Unresolved questions

- Keepsakes the player gives to a member (reverse direction): proposed as the same record with `to: <roster id>` in a
  follow-up.
- Whether a keepsake can be a sprite/stage prop (v2.8 33/41 own the stage): out of scope.
- Cap values are placeholders until the editor is drawn.
