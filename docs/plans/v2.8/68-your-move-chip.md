# Plan 68 — "Your move" HUD chip

**Status: v1 built 2026-10-16 on `v2.8-harvest-18-65-68` (unmerged; §Gate record); owner decided 2026-10-16. Was: candidate, owner decision pending. Revised 2026-10-16 after Astra's review (§Review 2026-10-16).** Written
2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md` H15). Not built, not queued. Kept as its own plan
rather than folded into HUD or talk work: it adds a player-visible surface that needs its own owner decision (00-overview
rule 4), and no open HUD or talk plan exists to absorb it. Implementation tier **D**; acceptance **D** (derivation properties,
Storybook) + owner decision or session. Overview: `00-overview.md` §Rules.

## What it is

- A small HUD chip that says the turn is the player's: "Your move."
- **v1: explicit hand-backs only.** The chip shows only when a recorded talk decision handed the turn to the player **for the
  exact revision of the reply now on screen**. Objective cues (a checkpoint that needs the player to act) and quest cues are a
  later version, added only if sessions show hand-backs the chip missed.
- **Derived at read time** from the snapshot; the only new stored data are two fields on the talk decision record that the
  talk path writes anyway.
- No model-emitted tag (dynamic-response P2); that would rewrite replies at receipt.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/dynamic-response.md` P1 ("your move" cue, value 3, S), P3 (derive the cue,
  never store it), P2 (model-emitted tag, deferred), P4 (strip vs TurnBridge identity test: 69 K6).

## Current state in code

Verified on master `e8b9dd6d`.

- **Decisions carry no kind and no revision.** `TalkDecisionAudit` (`src/runtime/talkStagecraftTypes.ts:5-16`) has
  `messageId`, `checkpointId`, `chosenRosterId`, `chosenName`, `source`, `chainStep`; a `player` or `silence` decision
  (`src/runtime/talkControl.ts:89-90`, abort at `:226`) is recorded with `chosenRosterId: null`, so player and silence cannot
  be told apart afterwards. `chatId:checkpointId:lastMessageId` does not change when the reply is edited or swiped in place.
- **`stopOnPlayer` enables a hand-back; it does not record one.** The chain hands back only when no voice is pending and the
  option is on (`handBack = !pending.length && config.stopOnPlayer`, `talkControl.ts:333`).
- **Revisions exist elsewhere.** Promise spans bind to a source revision (hash + swipe id, `src/memory/audience.ts:10`).
- `narrative.ts` adds "What happens next is yours to decide." for a player-action objective; the HUD shows only the scene line
  (`src/components/drawer/HudStrip.tsx`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Explicit, revision-bound hand-backs (v1)** | chip from a `player` decision whose revision matches the reply on screen | S | misses checkpoints that need the player |
| **B. A + objective and quest cues** | add sources once sessions show a gap | +S | a chip on many turns reads as noise; conflicts with silence |
| **C. Model tag** | the reply model ends with a cue tag, stripped at receipt | M | a second receipt rewrite; cache cost |
| **D. Nothing** | | 0 | — |

## Recommendation

**A.**

- `TalkDecisionAudit` gains `kind: "member" | "player" | "silence"` and `revision: { hash, swipeId }` of the last message at
  decision time (the `SourceRevision` shape). Written by the talk path for every decision; additive (no migration: an old
  record without them never shows the chip). A chain end records `kind: "player"` only when `handBack` was true at
  `talkControl.ts:333`, not because `stopOnPlayer` is on.
- **Precedence** (first match wins), in `snapshotBuilder`: (1) a generation is running → no chip; (2) the last message is the
  player's → no chip; (3) the latest decision for this chat and checkpoint has `kind: "player"` and its `revision` equals the
  current last message's revision → chip; (4) anything else, including `silence` → no chip.
- Any edit, swipe or delete changes the last message's revision (or id), so a stale record no longer matches; rollback
  removes decisions with their messages as today.
- `snapshot.turn = { yours: boolean }`; `#so-hud-turn` chip beside the scene line; copy "Your move." from `narrative.ts`; the
  author view's tooltip adds the decision source. Player-mode safe.
- Registry feature `your-move-chip`, on by default once built (rule 9); Interface row to hide it.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| Y1 | Derivation: over ≥ 500 generated states (generating, last author, decision kind, revision match), `yours` equals the precedence table | 100 % | D |
| Y2 | Stale-free: after a swipe in place, an edit in place, a delete and a new player message (4 scripted mutations) the chip is off until a new decision for the new revision | 4/4 | D |
| Y3 | Nothing else stored: `extras` identical with the feature on vs off over a 10-turn scripted run (decision fields are written either way) | identical | D |
| Y4 | Silence is not a hand-back, and `stopOnPlayer` without a recorded hand-back is not one: 0 chips in both | 0 | D |
| Y5 | Player-clean: no internal word (judge, director, source) in player mode (`assert-player-clean`) | 0 | D |
| Y6 | Mobile 390×844: HUD renders without overflow with the chip | holds | D |

Floors are informational and never retuned (rule 2).

## Gates by tier

- **D:** `npm run gates`; Y1–Y6; Storybook stories for the HUD with and without the chip; a no-model scenario driving a
  scripted hand-back, then a swipe and an edit.

## Privacy and spoiler notes

- Reveals only that the turn is the player's; no checkpoint ids, no route hints.

## Dependencies and links

- v2.7 talk control and director (decisions), `ui-rework.md` (HUD layout), 69 K13 (per-generation state bound to the message
  revision; the same revision shape).

## Decisions for the owner

1. **Show the chip by default (Interface row to hide)?** **Recommended: yes.**
2. **v1 explicit hand-backs only; objective and quest cues only if sessions show a gap?** **Recommended: yes.**
3. **Model-emitted cue tag only if a session shows missed hand-backs?** **Recommended: yes.**

## Unresolved questions

- Should a narrator-only chain end show the chip? Proposed: yes, when the chain recorded a hand-back.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §2 (68), §1 (fold advice). Verified on `e8b9dd6d`.

- **P1 — the key does not change on an in-place edit or swipe; records have no revision.** Accepted
  (`src/runtime/talkStagecraftTypes.ts:5-16`). → decisions carry `kind` and `revision`; the chip requires a revision match;
  Y2 covers in-place swipe and edit.
- **P1 — source 2 stays true after the player writes; Y4 conflicted with source 2.** Accepted. → objective and quest sources
  removed from v1; precedence puts "last message is the player's" and "silence" ahead of any cue.
- **Define precedence; `stopOnPlayer` enables a hand-back, it does not record one.** Accepted (`src/runtime/talkControl.ts:333`).
  → precedence table; `kind: "player"` only when `handBack` was true; Y4 extended.
- **Cheapest v1: explicit, revision-bound hand-backs.** Adopted.
- **68 → existing HUD/talk work.** Rebutted: a new player-visible surface needs its own owner decision (rule 4) and no open
  HUD or talk plan exists to carry it; the plan stays small and separate.

## Gate record 2026-10-16: v1 (branch `v2.8-harvest-18-65-68`, unmerged)

- Built A (commit `6d09ce0a`): `TalkDecisionAudit.kind` and `revision` (`SourceRevision` of the last message at decision time,
  `fnv1a(mes)` + `swipe_id`), written for every decision; a chain end records `player` only when `handBack` was offered and the
  answer was a hand-back, else `silence`; first-speaker decisions record `member` or `silence`. `runtime/yourMove.ts`
  `deriveTurn` (precedence as §Recommendation; generating = the outermost loud generation is open, tracked from the generation
  lifecycle); `snapshot.turn = { yours, source }`; `#so-hud-turn` "Your move." from `narrative.ts`, author tooltip adds the
  source. Setting `display.yourMove` (default on, device-overridable, Interface row `#so-your-move-enabled`); registry feature
  `your-move-chip`; matrix row.
- Floors (D): Y1 600 generated states = precedence table: met. Y2 4/4 mutations (unit; live: edit, swipe, new player line, delete,
  with restore turning it back on): met. Y3 derivation reads frozen inputs and stores nothing (decision fields are written either
  way): met. Y4 silence and `stop_on_player: false` record `silence`, 0 chips: met. Y5 `assert-player-clean` with the chip shown
  (live) and the player tooltip names no source (Storybook): met. Y6 Storybook `YourMovePhone` fits: met.
- Live (PLUMBING level: the reply is answered by an in-page fetch stub, the director by its debug response): the real talk path
  (mention → Arin, chain → director hand-back) records `kind: player` with the reply's revision and the HUD shows the chip:
  `test/scenarios/v28-68-your-move.json` PASS ×2 (`2026-10-16T18-28-58-630Z`, `…18-35-16-945Z`).
- Live, lane 67 (no-model offline lane copied from lane 60's data, `C:\dev\st-live`, lanes root `C:\dev\so-live-lanes`), this
  branch's build staged with `node scripts/release/stage.mjs --st-root C:/dev/st-live`, served `dist/index.js` sha256 `1e16872978fe`
  (checked before and after each counted run; st-live is shared, and two diagnostic 65 runs whose staged hash changed under them
  were discarded and re-run). Run: `ST_ROOT=C:/dev/st-live SO_LANES_ROOT=C:/dev/so-live-lanes node scripts/debug/st-lanes.mts run 67
  -- scripts/debug/so-scenario.mts run <file> --sandbox --group 'Group: Arin, DM Narrator'`. Evidence copied to
  `C:\dev\so-live-lanes\evidence-2026-10-16\67\`.
- Real-LLM owed: a hand-back from the real director/judge in a played session (the chip's first real use).
- Gates (one run for 18 Q7, 65 and 68): 18 §Gate record 2026-10-16 (Phase Q7).
