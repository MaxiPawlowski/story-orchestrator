# Plan 63 — Stepped history window and the front-trim cache A/B

**Status: candidate, owner decision pending.** Written 2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md`
H3). Not built, not queued. Implementation tier **D**; acceptance **RP** (prompt-cache reuse with Artemis on llama-server, the 3090 or a pod; rides the deferred R2 run,
outside plan 24's 12 h cap) + **CL** (recall probes on the cloud reply model). Overview: `00-overview.md` §Rules. Measurement home: queue R2/R7
(`32-queue.md` §Measurements), v2.7 31 §Pod 2 measurements.

## What it is

- Once a chat's prompt passes ST's `max_context`, ST trims the oldest message every turn. Every turn the whole history shifts
  by one message, so the cached prefix ends right after the system/card/story string, and prompt-cache reuse falls to about
  zero for long play at 32K.
- A **stepped window** cuts in one large step instead: when the estimated prompt passes a high-water mark, every message below
  a cut point is dropped down to a low-water mark, and the cut holds until the high-water mark is reached again. Between steps
  the prompt only grows at the end, so the prefix stays cacheable for many turns.
- The cut works on the generate interceptor's copies (`Symbol.for("ignore")`, the chapter-fold mechanism), never on the live
  chat, and only below text that memory already covers (the extraction read cursor has passed it).
- Paired with a **measurement first**: the front-trim A/B arm (P5) gives the baseline the window must beat, and tells whether
  the late-lore placement win (R2/R7) survives real long play.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/tokensavingplugin.md` P1 (stepped window, value 4, M), P2 (recap placed before
  the oldest kept message, value 2), P3 (retention ladder for compression prompts, value 2), P5 (front-trim cache A/B, value 3).
  Their claimed cache gain comes from the hysteresis, not from their summary: "the chat start stays fixed for m rounds and then
  jumps n+m -> n, so ST never front-trims one message per turn".
- v2.7 31 §Pod 2 measurements: B1-PFX ran with the saga cut to 80 messages so the prompt "fits without front trimming"
  (`docs/plans/v2.8/31-v27-wrap-backlog.md:522-523`); B1-HIST INCOMPLETE (3 of 30 turns per arm), 24576 arm prompt ms p50 0.49×
  the control.
- Queue R2 (B1-PFX re-measure owed), R7 (sheets after definitions vs depth 4, cache measurement deferred).

## Current state in code

Verified on master `9e96871d`.

- **Folding exists only at chapter seals.** `fold` / `foldRange` / `foldRows` mark covered rows ignored on the interceptor's
  copies (`src/runtime/chapterKit.ts:240-337`, `IGNORE = Symbol.for("ignore")` at `:254`). Without chapters, or inside a long
  chapter, nothing stops ST's per-turn front trim. No front-trim handling anywhere in `src/` (grep `front.trim|frontTrim` = 0).
- **Read coverage is known.** `readCoverageEnd`, `compactableEnd` (`src/extraction/readCursor.ts:13-17`) say which messages
  the shared read has consumed.
- **Budgets are per request.** `requestBudget(profileId)` / `requestBudgetFor(role)` (`src/runtime/requestBudget.ts:14-23`);
  `src/runtime/promptCost.ts` estimates the assembled prompt for the preview.
- **Late lore placement** (`src/runtime/lorePlacement.ts`) moves per-turn story lore to depth 4 so the prefix stays cacheable;
  it is unmeasured on a chat long enough to front-trim.
- `storySoFar` sits at depth 4 (`src/constants/injectionRegistry.ts:26`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Measure only** | add the front-trim arm to the R2 run; no product change | S + about 45 min Artemis | the problem stays; we only know its size |
| **B. A + stepped window** | interceptor cut at a high/low-water mark, gated on read coverage; cut point recomputed, never trusted from storage | M | a cut drops text memory did not capture well; an extra discontinuity every step |
| **C. B + boundary recap** | a recap of exactly the rows below the cut, injected just before the oldest kept message, regenerated only when the cut advances (P2) | M + a memory call per step | a second summary family; the recap must be the resting view |
| **D. Nothing** | | 0 | long local play keeps ~0 reuse |

## Recommendation

**A first (it is a cheap arm on a run that is owed anyway); B if the A baseline shows front-trim reuse below 0.2; C only if B's
recall probe misses.**

- **The A arm.** In the R2 `place-all.sh` A/B, add `front-trim`: the full saga (no `/del` cut) at `LLM_CTX` 24576 so ST trims,
  late lore on. Record reuse p50 = `cache_n / (cache_n + prompt_n)` from llama-server timings, as R2 does.
- **The window (B).**
  - New pure module `runtime/historyWindow.ts`: `nextCut({ estimate, budget, cut, coveredTo, rows }) → cut`. The cut advances
    only when `estimate > high × budget` (high = 0.90), to the first row such that the estimate falls under `low × budget`
    (low = 0.65), and never past `coveredTo` (the read cursor). Otherwise it holds.
  - Applied in the generate interceptor on copies only, after the chapter fold, through the same `IGNORE` marker. No live-chat
    write, no `is_system` toggle, no `/hide`.
  - The cut is derived per chat at every interceptor call from the rows and the last cut; it is kept in memory keyed by chat id,
    story id and the message identity at the cut (a deletion below the cut invalidates it and the cut is recomputed).
  - Loud generations in the story's chat only; quiet/impersonate untouched. Per-member views unchanged (rows are only ignored).
  - Author view: the next-turn preview names the cut ("History from message N; earlier messages covered by memory").
  - Registry feature `stepped-history`, on by default once built (rule 9), install-wide switch in Defaults.
- **The recap (C)**, only on a B recall miss: a resting-view recap of the rows below the cut at depth 9999 (lands just before
  the oldest sent message, ST `doChatInject` clamp), regenerated when the cut advances. P3's retention ladder (turning points >
  promises > state changes > events) goes into its prompt.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| H1 | Front-trim baseline: same-speaker reuse p50 on the full saga at 24576, late lore on | recorded (expected about 0) | RP |
| H2 | With the window: same-speaker reuse p50 on the same chat and arm shape | ≥ 0.5 | RP |
| H3 | The cut never passes the read cursor: property over ≥ 500 generated chats and cursors | 0 violations | D |
| H4 | Copies only: the live `chat` array and every message object are byte-identical before and after the interceptor on 4 seeds | 4/4 | D |
| H5 | Deletion below the cut: the cut is recomputed, no stale index survives (4 seeds: delete, edit, swipe, reopen) | 4/4 | D |
| H6 | Recall: 10 probes about events now below the cut, answered from memory, scored by a second model, window on vs off | on ≥ off − 1 | CL |
| H7 | Prompt ms p50 with the window vs front-trim baseline | recorded | RP |
| H8 | No window, no change: a chat under the high-water mark sends a byte-identical prompt (payload golden) | identical | D |

Floors are informational and never retuned (rule 2). H2's 0.5 is set before the run.

## Gates by tier

- **D:** `npm run gates`; H3–H5, H8; Storybook for the preview line.
- **RP:** H1, H2, H7 with Artemis (about 45 min per arm, ×1 informational), folded into the deferred R2/R7 run (plan 24
  §Measurement rows M6/M9: optional pod P2 or a free 3090 night), so outside the 12 h cap; no pod budget in October.
- **CL:** H6 on the cloud reply model.

## Privacy and spoiler notes

- Ignoring rows cannot leak anything; the recap (C) is a shared tier and must use `MemoryInjector.restingEntries`.
- No campaign content; the saga chat used by R2 is the owner's evidence chat on a lane copy.

## Dependencies and links

- Queue R2/R7 (shares the run and the reuse metric), v2.8 21 (smart context: retrieval-side), plan 40 (lore placement built).
- Chapter folding (`chapterKit.ts`) stays the first cut; the window applies to what remains.

## Decisions for the owner

1. **Add the front-trim arm to the owed R2 run?** **Recommended: yes.**
2. **Build the window only if H1 shows reuse below 0.2?** **Recommended: yes.**
3. **High/low marks 0.90/0.65 of the request budget?** **Recommended: yes** as starting values, recorded with the run.

## Unresolved questions

- Does the cut interact with the thinking budget (reply effort) reserve? Proposed: the budget the window reads already
  subtracts the response reserve.
- A cut that lands inside a same-speaker run splits a pair; should it snap to the next player message? Proposed: yes.
