# Plan 63 — Stepped history window and the front-trim cache A/B

**Status: candidate, owner decision pending. Revised 2026-10-16 after Astra's review (§Review 2026-10-16).** Written
2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md` H3, V10, V12). Not built, not queued. A performance
experiment: **measure first** (latency, not only reuse), then a window only if the measured gain justifies the recall risk.
Implementation tier **D**; acceptance **RP** (llama-server timings with Artemis, the 3090 or a pod; rides the deferred R2 run,
which is not funded by plan 24's 12 h cap) + **CL** (recall probes on the cloud reply model) + a small RP recall leg.
Overview: `00-overview.md` §Rules. Measurement home: queue R2/R7 (`32-queue.md` §Measurements), v2.7 31 §Pod 2.

## What it is

- Once a chat's prompt passes ST's context, ST trims the oldest message every turn. The history shifts by one message per
  turn, so the cached prefix ends right after the system/card/story string and prompt-cache reuse falls to about zero for
  long play at 32K.
- A **stepped window** cuts in steps instead: the cut point advances by a fixed token mass when the prompt passes a
  high-water mark, so between steps the prompt only grows at the end and the prefix stays cacheable.
- The cut works on the generate interceptor's copies (`Symbol.for("ignore")`, the chapter-fold mechanism), never on the live
  chat, and only below text that **durable memory covers**: a sealed chapter record or the short-term summary's range, not the
  read cursor.
- **Measurement first**: the front-trim arm says how much latency (not just reuse) long play loses today.

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/tokensavingplugin.md` P1 (stepped window, value 4, M), P2 (recap before the
  oldest kept message, value 2), P3 (retention ladder, value 2), P5 (front-trim cache A/B, value 3). Their gain comes from the
  hysteresis, not their summary.
- v2.7 31 §Pod 2 measurements: B1-PFX ran with the saga cut to 80 messages so the prompt fitted without front trimming
  (`docs/plans/v2.8/31-v27-wrap-backlog.md`); B1-HIST INCOMPLETE (3 of 30 turns per arm).
- Queue R2 (B1-PFX re-measure owed), R7 (sheets after definitions vs depth 4, cache measurement deferred).
- v2.4 harvest V12 (context-horizon scoring): folded here as H9.

## Current state in code

Verified on master `e8b9dd6d`.

- **Folding exists only at chapter seals.** `fold` / `foldRange` / `foldRows` mark covered rows ignored on the interceptor's
  copies (`src/runtime/chapterKit.ts`, `IGNORE = Symbol.for("ignore")` at `:254`). Nothing else stops ST's per-turn front trim
  (grep `front.trim|frontTrim` = 0).
- **Read coverage is not durable coverage.** `readCoverageEnd` returns the greatest audit endpoint
  (`src/extraction/readCursor.ts:13-15`), not a contiguous covered prefix; `compactableEnd` returns the latest message when the
  read lags by `maxLag` (`:17-19`). Neither proves discarded text is recoverable. The short-term summary's range is
  contiguous by construction (`shortTermSummaryEnd`, compaction windows start at `shortTermSummaryEnd + 1`,
  `src/runtime/coordinators/extractionCoordinator.ts:419`); a chapter seal advances it (`src/memory/chapterFold.ts:50`).
- **The reply model's budget is `readPromptBudget`** (`src/services/stHost/contextBudget.ts:35-38`: context, response reserve,
  prompt) from ST's own `getMaxPromptTokens`. `requestBudget(profileId)` is for routed side-model calls
  (`src/runtime/requestBudget.ts`), not necessarily the active reply model. `src/runtime/promptCost.ts` estimates the assembled
  prompt for the preview.
- **Dry runs skip interceptors** (ST `script.js:4562-4564`), so payload goldens (dry runs) cannot show what an interceptor cut;
  only an actual request capture can.
- **Late lore placement** (`src/runtime/lorePlacement.ts`) moves per-turn story lore to depth 4; unmeasured on a chat long
  enough to front-trim. `storySoFar` sits at depth 4 (`src/constants/injectionRegistry.ts`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Measure only** | latency arms on the R2 run; no product change | S + pod or free 3090 time | the problem stays; we know its size |
| **B. A + stepped window** | stateless step cut over durable coverage | M | a cut drops text whose summary is thin; a discontinuity every step |
| **C. B + boundary recap** | a recap of the rows below the cut just before the oldest kept message | M + a memory call per step | a second summary family |
| **D. Nothing** | | 0 | long local play keeps ~0 reuse |

## Recommendation

**A first. B only if A shows a latency gain worth the recall risk (owner decision on the record). C deferred: reuse chapter
records and the existing short-term summary; add a new summary family only if its incremental value is shown.**

- **The A arms** (R2 `place-all.sh` A/B). Matched workloads, same chat and turn script per arm:
  - `front-trim`: the full saga (no `/del` cut) at `LLM_CTX` 24576 so ST trims, late lore on;
  - `fits`: the same turns with the saga cut so nothing trims (the R2 baseline);
  - each arm in two speaker patterns (same speaker repeated; alternating members) and warm and cold (first turn after a
    server restart vs steady state), with enough turns to span at least three of B's would-be steps.
  - Record per turn from llama-server timings: sent tokens (`prompt_n + cache_n`), reuse `cache_n / (cache_n + prompt_n)`,
    prefill ms and time to first token. Report medians **and** the per-step cost (the turn where a cut would land).
- **The window (B).**
  - **Stateless cut.** New pure module `runtime/historyWindow.ts`: `cutFor({ rows, tokens, budget, coveredTo, step })`.
    Token mass from chat start is quantised into steps of `S = (high − low) × budget` (high 0.90, low 0.65). The cut is the
    first row past `k × S`, with the smallest `k` such that the rows after the cut fit under `high × budget`, clamped to
    `coveredTo`. A pure function of the rows, so reopen, branch and replay recompute it with nothing stored; an edit anywhere
    in the covered prefix shifts token mass and may move the cut (a cache miss, accepted and measured), a settings, model or
    member change changes `budget` and recomputes.
  - **Durable coverage.** `coveredTo = max(shortTermSummaryEnd, last sealed chapter end)`, never `readCoverageEnd` or
    `compactableEnd`. Below `coveredTo` the text is held by a summary or a chapter record.
  - **Budget.** `readPromptBudget()` prompt tokens (response reserve already subtracted), minus the estimated non-history
    overhead of the assembled prompt (`promptCost.ts`).
  - Applied in the generate interceptor on copies only, after the chapter fold, through the same `IGNORE` marker. No
    live-chat write, no `is_system` toggle, no `/hide`. Loud generations in the story's chat only; quiet/impersonate
    untouched. Per-member views unchanged.
  - A cut inside a same-speaker run snaps forward to the next player message.
  - Author view: the next-turn preview names the cut ("History from message N; earlier messages are covered by the story's
    summary").
  - Registry feature `stepped-history`, on by default once built (rule 9), install-wide switch in Defaults.
- **The recap (C)**, deferred: only if B's recall probe shows a loss that chapter records and the short-term summary do not
  cover. Then a resting-view recap (`MemoryInjector.restingEntries`) of the rows below the cut, placed before the oldest kept
  message, with P3's retention ladder in its prompt.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| H1 | Front-trim cost: per-turn sent tokens, reuse, prefill ms and first-token ms for `front-trim` vs `fits`, both speaker patterns, warm and cold | recorded (medians + per-step cost) | RP |
| H2 | With the window: same arms and shape; first-token ms median vs `front-trim` | recorded; the build decision is the owner's on H1/H2 | RP |
| H3 | The cut never passes durable coverage (`max(shortTermSummaryEnd, sealed chapter end)`): property over ≥ 500 generated chats | 0 violations | D |
| H4 | Copies only: the live `chat` array and every message object byte-identical before and after the interceptor on 4 seeds | 4/4 | D |
| H5 | Stateless: the cut recomputed from scratch equals the running cut after reopen, branch, an edit inside the covered prefix, a budget change and a member change (6 scripted cases × 4 seeds) | 24/24 | D |
| H6 | Recall, cloud reply model: 20 probes about events below the cut (10 critical-fact, 10 detail strata), second-model rater, window on vs off | on: ≥ 16/20 overall and ≥ 9/10 critical; and on ≥ off − 1 per stratum | CL |
| H6r | Recall on Artemis: 10 probes (critical stratum) window on vs off, 32,768 context | recorded (informational, deferred with R2) | RP |
| H7 | Privacy: the actual outgoing request (not a dry run) of a held-secret fixture carries no secret line with the window on; secrecy instructions above the cut are not dropped (guidance and private blocks are injections, not history rows) | 0 leaks, 4/4 | D |
| H8 | No window, no change: a chat under the high-water mark sends a byte-identical actual request | identical | D |
| H9 | Horizon (V12): the oldest message ST actually sent equals the computed cut (or an earlier host trim, recorded) on 20 captured requests | recorded; any mismatch named | D (no-model lane request capture) |

Floors are informational and never retuned (rule 2). H6's numbers are set before the run.

## Gates by tier

- **D:** `npm run gates`; H3–H5, H7, H8 (request capture on a no-model lane, `st-payload.mts arm --persist`), H9; Storybook for
  the preview line.
- **RP:** H1, H2, H6r with Artemis, folded into the deferred R2/R7 run (pod P2 or a free 3090 night). That run is deferred
  work, not funded time: it is outside the 12 h cap only because it has not been scheduled.
- **CL:** H6 on the cloud reply model.

## Privacy and spoiler notes

- Ignoring rows adds no bytes, but altered history can drop context that matters and change downstream scans; H7 checks the
  actual request. The recap (C) would be a shared tier and must use `MemoryInjector.restingEntries`.
- No campaign content; the saga chat used by R2 is the owner's evidence chat on a lane copy.

## Dependencies and links

- Queue R2/R7 (shares the run), v2.8 21 (retrieval side), plan 40 (lore placement built), chapter folding
  (`src/runtime/chapterKit.ts`) stays the first cut.

## Decisions for the owner

1. **Add the latency arms (H1) to the owed R2 run?** **Recommended: yes.**
2. **Decide the window on H1/H2 latency and H6 recall, not on a fixed reuse threshold?** **Recommended: yes.**
3. **Coverage = summary or chapter only (never the read cursor)?** **Recommended: yes.**
4. **High/low 0.90/0.65 of the prompt budget as starting values, recorded with the run?** **Recommended: yes.**

## Unresolved questions

- Does the reply thinking budget change the response reserve `readPromptBudget` reports? Check the llama.cpp path before H2.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §2 (63), §1 (V12). Verified on `e8b9dd6d`.

- **P1 — coverage premise unsafe.** Accepted: `readCoverageEnd` is the greatest audit end (`src/extraction/readCursor.ts:13-15`)
  and `compactableEnd` can return the latest message under lag (`:17-19`). → coverage is `max(shortTermSummaryEnd, sealed
  chapter end)` (`src/runtime/coordinators/extractionCoordinator.ts:419`, `src/memory/chapterFold.ts:50`); H3 re-stated.
- **P1 — wrong budget API.** Accepted: `requestBudget` serves routed side calls. → `readPromptBudget`
  (`src/services/stHost/contextBudget.ts:35-38`) minus assembled-prompt overhead.
- **P1 — "derived from rows and the last cut" is stateful hysteresis.** Accepted. → a stateless quantised step cut (pure
  function of rows, budget and coverage); H5 covers reopen, branch, edits anywhere in the covered prefix, budget and member
  changes.
- **P1 — H6 lets both arms score zero; ten cloud probes do not establish recall on Artemis.** Accepted. → absolute floors,
  critical-fact and detail strata, 20 probes; H6r Artemis leg.
- **P1 — R2 reuse alone does not show worthwhile latency savings.** Accepted. → H1/H2 record sent tokens, prefill and
  first-token latency, warm/cold, same-speaker and alternating, enough turns for several steps, per-step cost; the build
  decision is the owner's on that record.
- **P2 — "ignoring rows cannot leak" too strong; dry-run goldens skip interceptors.** Accepted (ST `script.js:4562-4564`).
  → H7/H8 use actual request capture; privacy note rewritten.
- **V12 fold.** Adopted as H9.
- **Cheaper design: measure first, reuse chapter coverage and summaries.** Adopted; the recap (C) stays deferred.
- **"Outside the cap" identifies deferred work, it does not fund a run.** Accepted. → gates text says so.
- Rebutted: none.
