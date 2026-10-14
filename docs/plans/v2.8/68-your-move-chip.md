# Plan 68 — "Your move" HUD chip

**Status: candidate, owner decision pending.** Written 2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md`
H15). Not built, not queued. Implementation tier **D**; acceptance **D** (derivation properties, Storybook) + owner decision or
session (00-overview rule 4: a player-visible surface). Overview: `00-overview.md` §Rules.

## What it is

- A small HUD chip that says the turn is the player's, with a short cue ("Your move", or the checkpoint's own line when the
  objective needs the player to act).
- **Derived, never stored.** The chip is a pure function of the current last reply, the last talk decision for this chat +
  checkpoint + last message, and the active checkpoint. No state in `extras`, so rollback ≡ replay holds and swipe, edit and
  delete need nothing beyond the snapshot refresh TurnBridge already triggers.
- Sources, deterministic only:
  1. the last talk decision handed the turn back (judge or director chose the player, or the chain stopped on `stopOnPlayer`);
  2. the active checkpoint's `agency.objective_kind === "player_action"`;
  3. (optional) an open visible quest step whose `done_when` names a player-choice quality.
- No model-emitted tag (dynamic-response P2) in this plan; that would rewrite replies at receipt and only comes back if the
  deterministic sources miss real hand-backs in a session.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/dynamic-response.md` P1 ("your move" cue on the HUD, value 3, S), P3 (derive the
  cue, never store it), P2 (model-emitted tag, deferred), P4 (strip vs TurnBridge identity test: bundled in plan 69).
- Not in plans 42–59 or the queue.

## Current state in code

Verified on master `9e96871d`.

- **Half the cue exists, in the drawer.** `src/runtime/narrative.ts:154` adds "What happens next is yours to decide." to the
  "now" section when `objectiveKind === "player_action"`. The HUD shows only `now.lines[0]`
  (`src/components/drawer/HudStrip.tsx:30`), so the line rarely reaches it.
- **A hand-back is invisible.** On a `player` or `silence` decision the chain aborts (`src/runtime/talkControl.ts:226-228`); the
  record keeps `chosenRosterId: null`, `chosenName: null` and the `source`, but not the decision kind (`:339-345`), so player
  and silence cannot be told apart afterwards.
- The snapshot exposes only `draftedMember` from the last decision (`src/runtime/snapshotBuilder.ts:366-371`).
- HUD contents: scene line, tension, pipeline/setup chip, pending count (`HudStrip.tsx:28-49`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Derived chip** | `snapshot.turn` from sources 1–2 (3 optional), `#so-hud-turn` | S | a chip on every player turn may read as noise |
| **B. A, only on explicit hand-backs** | source 1 only | S | misses checkpoints that need the player |
| **C. Model tag** | dynamic-response P2: the reply model ends with a cue tag, stripped at receipt | M | a second receipt rewrite; prompt-cache cost; empty-reply interplay |
| **D. Nothing** | | 0 | — |

## Recommendation

**A with sources 1 and 2; source 3 only with v2.8 18 quests in a story.**

- `TalkDecisionRecord` gains `kind: "member" | "player" | "silence"` (additive; old records read as unknown, no migration).
- `snapshot.turn = { yours: boolean, cue: string | null, source: "hand-back" | "objective" | "quest" | null }`, derived in
  `snapshotBuilder` from the last decision keyed `chatId:checkpointId:lastMessageId`, the active checkpoint and the last
  reply. `yours` turns false as soon as the player's message lands (the key changes).
- Copy from `narrative.ts` (one player-copy source): "Your move." for a hand-back; the existing "What happens next is yours to
  decide." for a player-action objective. Checkpoint names only, never ids.
- `#so-hud-turn` chip next to the scene line; author view adds the source in the tooltip. Player-mode safe (no internals).
- Registry feature `your-move-chip`, on by default once built (rule 9); Interface row to hide it.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| Y1 | Derivation: over ≥ 500 generated (decision, checkpoint, last-message) states, `yours` is true exactly when a source holds for the current key | 100 % | D |
| Y2 | Stale-free: after a swipe, edit, delete or new player message (4 scripted mutations) the chip matches the re-derived state | 4/4 | D |
| Y3 | Nothing stored: `extras` byte-identical with the feature on vs off over a 10-turn scripted run | identical | D |
| Y4 | Silence is not a hand-back: a `silence` decision never shows the chip | 0 | D |
| Y5 | Player-clean: no internal word (judge, director, source) in player mode (`assert-player-clean`) | 0 | D |
| Y6 | Mobile 390×844: HUD renders without overflow with the chip | holds | D |

Floors are informational and never retuned (rule 2).

## Gates by tier

- **D:** `npm run gates`; Y1–Y6; Storybook stories for the HUD with and without the chip; a no-model scenario driving a
  scripted hand-back.

## Privacy and spoiler notes

- Reveals only that the turn is the player's; no checkpoint ids, no route hints.

## Dependencies and links

- v2.7 talk control and director (decisions), v2.8 18 quests (source 3), `ui-rework.md` (HUD layout).

## Decisions for the owner

1. **Show the chip by default (on by default, Interface row to hide)?** **Recommended: yes.**
2. **Model-emitted cue tag (option C) only if a session shows missed hand-backs?** **Recommended: yes.**

## Unresolved questions

- Should a narrator-only chain end show the chip? Proposed: yes when `stopOnPlayer` ended it.
