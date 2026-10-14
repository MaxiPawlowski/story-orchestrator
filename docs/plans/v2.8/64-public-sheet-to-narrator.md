# Plan 64 — The public sheet reaches the narrator, plus "just happened" lines

**Status: candidate, owner decision pending.** Written 2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md`
H4). Not built, not queued. Implementation tier **D**; acceptance **D** (payload goldens) + **RP** informational (does the
narrator honour the sheet, on the main reply model). Overview: `00-overview.md` §Rules.

## What it is

- A quality with `display.public` (an inventory item, a meter, a band word) is shown to the player on the sheet and in widgets,
  but **never told to the story model**. The narrator can deny an item the sheet shows, or invent one it does not.
- Three small additions, all deterministic and all reading the same player projection:
  1. **Sheet block.** One stable narrator block, "What the player visibly has and is": items as "has: X", meters as their band
     word (never a number when bands exist), status words. Only what the player already sees, so nothing new is disclosed.
  2. **"Just happened" lines.** The one-shot outcome block today names check results only. A quest closing at the boundary, a
     milestone earned, or a reward moving a public meter is shown to the player as a chip but not told to the narrator, so the
     next reply may ignore it. Add those rows to the same block, keyed by the last message like check records.
  3. **Warn bands.** An optional `warn` line on a public meter's band ("Supplies are running out"); while the value sits in that
     band, one narrator line and a sheet chip. No model, no state, clears itself when the value leaves the band.
- Plus one clause for `CHECK_OUTCOME_HEADER`: do not invent outcomes the list does not name (st-gamemaster P2), and the
  anti-limbo line from filigree P2 (an outcome is shown whole: no stalled half-result).

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/st-gamemaster.md` P1 (public sheet, value 4, S), P2 ("just happened", 3/S),
  P4 (warn bands, 3/S), P5 (test idea: narrator honours the sheet). P3 (one clamp for every int writer) is folded into v2.8 53.
- `docs/plans/v2.8/extension-research-2026-10-14/filigree.md` P2 (anti-limbo clause for check outcomes, 3/S).
- v2.8 18 §Q2 defines the read model and panel for visible qualities, nowhere the prompt side; §Q3 narrates checks only.

## Current state in code

Verified on master `9e96871d`.

- **No sheet block.** `INJECTION_REGISTRY` (`src/constants/injectionRegistry.ts:14-32`) has `cardOverlay` (`:28`, card-look
  fields only) and `checkOutcome` (`:30`), nothing for the sheet.
- **The sheet is player-side only.** `gameSheet.ts:40` filters on `display.public`; `sheetGroups` (`:49-60`) feeds
  `src/runtime/widgets.ts`, `widgetHistory.ts` and `gameSummary.ts:17` (`/story quests`). No prompt writer imports it.
- **The display clamp hides overflow** (`src/runtime/gameSheet.ts:14`): a meter shown at 0 can sit at −3 on the blackboard.
  Defect B16 (reward `{add}` unclamped against `step_rule`) is fixed in plan 60; the general clamp is v2.8 53's.
- **Outcome block = checks of the last message only**: `checkOutcomeBlock` (`src/runtime/storyCheckDraws.ts:94-101`), header at
  `:91-92`, written by `src/runtime/checkOutcomeHost.ts:5-11` through `gamePort.ts:60-63`. Quest close and reward rows are
  derivable from the boundary log (`src/engine/quests.ts:70-81`).
- `DisplayBand` (`src/engine/gameSchema.ts:7`) has `max` and `label`, no `warn`.
- Withholding on quiet/impersonate misses the outcome block today (defect B10, plan 60); the new rows inherit B10's fix.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Sheet block + "just happened" + header clauses** | items 1, 2 and the clauses | S | prompt-cache churn if the block moves; one more block |
| **B. A + warn bands** | item 3 too | S | author misuse on hidden meters (refused by the validator) |
| **C. Prompt clause only** | tell the narrator to respect "the player's possessions" without listing them | XS | no ground truth; the defect stays |
| **D. Nothing** | | 0 | sheet and narration disagree |

## Recommendation

**B.** All of it reads one projection, so the spoiler properties of the sheet carry over.

- **Sheet block** `INJECTION_REGISTRY.publicSheet`, writer `runtime/publicSheetHost`, depth 1 beside `cardOverlay` (collision
  allowlist entry), rendered from `sheetGroups` (the player view, byte for byte the same values). Text changes only when a
  shown value changes (stable for cache). Opt-out per quality `display.narrate: false`; default on (rule 9). No public
  qualities → no block → byte-identical prompt.
- **"Just happened" rows** in `checkOutcomeBlock`, derived from the last boundary log entry: `quest_<id>_closed` before→after
  (visible quests only), earned visible milestones, public meters whose shown label or band changed. Same `messageId` keying,
  so a swipe replays them and rollback re-derives them. Hidden quests and secret milestones excluded by the widget visibility
  filter (`src/runtime/widgets.ts:79-121`). These are the same structured rows v2.8 46 needs for "What changed": build the
  derivation once (`runtime/boundaryChanges.ts`), two readers.
- **Header clauses** appended to `CHECK_OUTCOME_HEADER`: "Do not invent other outcomes the list does not name. Show each
  outcome whole: a success lands, a failure costs something real." (wording ours; payload golden updated and declared).
- **Warn bands.** `DisplayBand.warn?: string` (≤ 80 characters), only on `display.public` meters; validator refuses `warn` on
  relationship qualities and on v2.8 49 pressure meters (no player copy there). While the value is in the band: one line in the
  sheet block and a sheet/HUD chip.
- Guide topics `display-narrate`, `display-warn`; registry feature `public-sheet-narration`.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| S1 | Disclosure: every sheet-block line equals a value the player view shows; ≥ 500 generated stories, 0 lines from a non-public quality, a hidden quest or a secret milestone | 0 leaks | D |
| S2 | No public qualities → byte-identical prompt (payload golden) | identical | D |
| S3 | Stability: over a 20-turn scripted run with no shown-value change, the sheet block text is identical every turn | 20/20 | D |
| S4 | "Just happened": a quest close, a milestone and a public band change each produce exactly one row on the closing boundary's reply and none on the next | 3/3, 0 | D |
| S5 | Rollback ≡ replay for "just happened" rows and warn lines over 4 seeds | 4/4 | D |
| S6 | Withheld on impersonate (with plan 60's B10 fix): no sheet or outcome block in an impersonate request | 0 | D |
| S7 | Narrator honours the sheet: 20 lab openings inviting denial of a held public item, contradictions with vs without the block, second-model rater | with ≤ without − 4 (recorded) | RP |

Floors are informational and never retuned (rule 2).

## Gates by tier

- **D:** `npm run gates`; S1–S6; payload goldens with declared hunks for the header; Storybook for the warn chip; validator
  and guide coverage.
- **RP:** S7 informational ×1 (about 25 min Artemis, lab story), inside the 2.5 h cap or deferred with its reopen trigger.

## Privacy and spoiler notes

- Player-visible = model-visible by construction; nothing the player cannot see enters the block (S1).
- The block is shared by every drafted member; it carries no member-private value.

## Dependencies and links

- v2.8 18 Q2/Q3/Q5 (sheet, checks, quest log), v2.8 46 (shared "what changed" rows), v2.8 53 (clamp from display bounds:
  harvest addendum there), v2.8 49 (pressure meters stay author-only), plan 60 (B10, B16).

## Decisions for the owner

1. **Narrate the public sheet by default, opt-out per quality?** **Recommended: yes.**
2. **Warn bands on public meters only?** **Recommended: yes.**
3. **Build the "what changed" derivation once for this plan and v2.8 46?** **Recommended: yes.**

## Unresolved questions

- Depth 1 beside `cardOverlay` or a fixed late depth? Proposed: depth 1; re-check with `st-payload` cache churn when R2 runs.
- Items with counts: "has: 3 arrows" or the band word? Proposed: the shown text, whatever the sheet shows.
