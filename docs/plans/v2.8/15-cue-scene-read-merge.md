# Plan 15 — Cue + scene read merge

**Status (2026-10-03): v2.8 plan 15 (was v2.7 plan 21). Decided: measure first (the A/B below); no merge built unless
the merged arm passes its floor; triggers first (v2.8 02 row C7); J11's exact-reason contract kept. Not run; not built.**
Source: `docs/plans/v2.6/v2.7-seeds.md` row "Cue + scene read merge". Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D (scheduler, `so-session digest` metric); acceptance CL
(both A/B arms call the DeepSeek read model; no pod).

## What it is

- At a committed boundary the runtime can schedule several P0 extraction reads (on the memory/read model, DeepSeek
  flash today) of the **same window**:
  - a **cue** read: a transition's `extractor_trigger` regex matched, reason `cue:<from>-><to>,…`;
  - a **scene** read: the scene heuristic fired (`scene:location|cast|time_skip|divider`) or the judge saw a break
    (`scene:judge`).
- v2.6 coalesced cue reads into one per window. A cue read and a scene read of the same window are still two full
  shared reads.
- The seed merges them into one. It was not done because journey J11 matches the `scene:*` audit reason exactly.

## History and evidence

| When | What | Result | Source |
|---|---|---|---|
| v2.6 model-config review | On one Adolion lab hub checkpoint, broad `extractor_trigger`s made one turn produce 9 identical cue reads + the cadence read: 19 reads over 2 boundaries, ~171k input tokens | flagged as the largest cost seen | `v2.6/15-model-config.md:127` |
| v2.6, 2026-10-01 | Cue coalescing: one scan schedules one read (`cue:a->b,c->d`), and `mergeCue` folds a later windowless cue read into one still queued | 9 reads → 1; 18 → 1 across two queued boundaries (jest, `src/extraction/cueCoalesce.test.ts`); not measured live | `v2.6/15-review.md:391-401` |
| same | "Not done, noted: a windowless `scene:*` read and a cue read at the same boundary are still two reads of the same window; merging them would change the `scene:location` / `scene:judge` audit reasons J11 matches exactly." Pinned by a control test | deferred | `v2.6/15-review.md:403`, `src/extraction/cueCoalesce.test.ts:138-150` |

**What the sessions show.** This is my scan of the gitignored `test/sessions/T*/*/journal.jsonl` (49 sessions T0–T7,
2026-10-01..03, `audit` events deduplicated). A pair is a `cue:*` audit and a `scene:*` audit in the same chat with
an identical window.

| Measure | Value |
|---|---|
| reads (audits) total | 1423 (cue 551, cadence 383, scene 358, reconcile 102, rollback 21, resume 8) |
| cue + scene pairs, same window | **156** (11% of all reads; 44% of scene reads) |
| by scene reason | location 50, judge 43, cast 33, time_skip 30 (no divider) |
| order | cue ran first in 147, scene first in 9; gap p50 7.1 s |
| prompt size of the scene twin | mean 21.5k chars; the twins hold 11.3% of all read prompt characters |
| token share | ≈ 0.84M tokens at 4 chars/token, ≈ 4.6% of the 18.34M DeepSeek input tokens those sessions logged (`test/sessions/BUDGET.md`, total row). Cost reported `n/a` there |
| prompts identical | 13 of 156. The other 143 differ only in memory-side context (open arcs, facts, known entities): the second read sees what the first read's MEMORY/arc lines wrote |
| what the second read added (accepted deltas, `(quality, value)`) | nothing new in 83; ≥ 1 new pair in 73: a quality the first read did not touch in 27 (non-tension), tension only in 8, a different value for a quality already answered in 38 |
| scene-break line (cue, scene) | both yes 80, both no 63, only scene 7, only cue 6 |

So the duplicate is not pure waste. In about 1 pair in 6 (27/156), the second read picked up a non-tension quality the
first missed. Whether those extra deltas were right was **not determined** (no labels). Whether a pair where both
reads report a scene break runs two scene-summary passes was **not determined**.

## Why it was deferred

- J11.12 asserts an audit with `reason === 'scene:judge'`. J11.15 asserts `reason === 'scene:location'` and counts
  `scene:judge` reads (`test/journeys/j11-judgment-backend.journey.json:387`, `:501`, evals at `:411`, `:554`). Both
  are `keep` in the v2.6 test-suite decisions (`v2.6/13-decisions.md:782`, `:785`).
- A control test pins "cue never merges into scene" (`cueCoalesce.test.ts:138`).
- The coalescing work was done with no model calls, by instruction (`v2.6/15-review.md:401`).

## Current state in code

| Piece | Where | Fact |
|---|---|---|
| Boundary order | `src/runtime/boundaryWork.ts:53` forced-cues (order 20), `:103` scene-detect (50), `:114` scene-read (55, async judge) | cues are scheduled before the scene heuristic. `scene:judge` is scheduled only after the judge answers |
| Scheduler | `src/extraction/scheduler.ts:182` (dispatch to `mergeRead` `:189` / `mergeCue` `:202` / `mergeReread` `:211`), `:105` `isWindowlessCue` | merges act on **queued** jobs only |
| Pump | `src/extraction/scheduler.ts:469-473` | dequeues synchronously when nothing is in flight, so at a quiet boundary the cue read is **already running** when the scene read is scheduled. A queue-only merge would miss most pairs (147/156 had the cue first) |
| Reason use | `src/runtime/journal.ts:107`, `src/runtime/inlineTimeline.ts:172,325` (display); `reconcile:` is the only prefix the runtime acts on (`extractionCoordinator.ts:260`) | `scene:*` and `cue:*` are labels. The read prompt does not include the reason; `audit.sceneBreak` comes from the model's own output |
| Scene pass | `extractionCoordinator.ts:265` emits the scene break from `audit.sceneBreak` | independent of the reason |

## Options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Boundary batch, scene reason primary** | The scheduler holds `pump` during the synchronous boundary-work loop and releases it at the end. On release, windowless P0 cue + heuristic scene jobs become one job with `reason` = the scene reason and the cue pairs in a new `cues` field. Boundary order unchanged | scheduler `hold/release`, an audit field, journal/inline text, cueCoalesce control rewritten | delays the first read by the loop's duration (sync, ms). Loses the "second look" (27/156 pairs gained a quality) | the A/B floor below |
| **B. In-flight absorb** | A windowless `scene:*` job scheduled while a windowless P0 read for the same `to` is in flight is dropped. The running audit gains `alsoFor: ["scene:…"]`, and the primary reason stays the cue's | small | J11.12/J11.15 must read `alsoFor` (fixture edit); also absorbs `scene:judge` (43 pairs) | J11 edit + floor |
| **C. A + B** | A for heuristic reasons (113 pairs), B for `scene:judge` (43) | both | both | both |
| **D. Drop it** | keep two reads; treat the twin as a cheap second sample | none | ~4.6% of read-model input stays | none |

J11 note: A keeps `reason === 'scene:*'` whenever a scene reason is present, so J11.12/J11.15 hold without edits.
J12's unaided-read check accepts any reason (`test/journeys/j12-unaided-schedule.journey.json:88`). Only the jest
control test changes, on purpose.

## Recommendation

**D for now, with a measurement that could flip it to A** (decisions 1–2, as answered). Spend work goes to narrowing
the campaign's `extractor_trigger`s first (decision 3): that is **v2.8 02 row C7**, with its own coverage gate (no cue
an authored transition needs is lost). The A/B below runs after C7 lands, on windows recorded before and after it, so
the saving it measures is the one left once triggers are narrow.

- The saving is ~4.6% of read-model input. The read model is the cheap off-path model, and cue coalescing already
  removed the large multiplier.
- The second read is not a pure duplicate: in 27/156 pairs it accepted a non-tension quality the first did not touch.
  Merging trades that recall for spend, and we have no labels to say which side wins.
- If the A/B below shows the merged arm loses no correct deltas, build A. A needs no J11 edit, and it does not fight
  the in-flight timing.

## Decisions for the user

1. Merge cue + scene reads? **Recommended: not yet. Measure first (D, with the A/B).** Lets do as you recommend
2. If merging, which shape? **Recommended: A** (boundary batch, scene reason primary, cue pairs in a field). It keeps
   J11 unchanged and leaves `scene:judge` as its own read. Lets do as you recommend
3. Is a ~5% read-model spend saving worth a recall risk at all, or should spend work go to narrowing campaign
   `extractor_trigger`s instead (open since `v2.6/15-review.md:401`, campaign repo)? **Recommended: triggers first.** Lets do as you recommend
4. Keep J11.12/J11.15's exact-reason assertions as the contract (no fixture edit)? **Recommended: yes.** yes

## Floor and measurement before building

- **A/B on recorded windows (CL):** take ≥ 40 recorded cue+scene pairs (session chats, private evidence in
  `so-sessions`). Label the qualities each window establishes, labels frozen before any model answer. The windows are
  Adolion session text, so the labels are made by Claude and **checked by a second model, never the user**
  (v2.8 rule 11, review B4). Then run both arms ×2 on the DeepSeek read profile:
  - two-read arm: the current sequence;
  - merged arm: one read with the union reason.
- **Floor (predeclare before the run):** merged recall ≥ two-read recall − 0.02, and merged precision ≥ two-read
  precision. Scene-break agreement with the label must not drop.
- Spend: report input tokens per arm (`so-session budget`-style). Below floor → D stands. Never retune.
- Make the session scan reproducible: add it as a `so-session digest` metric (cue/scene same-window pairs and what the
  twin added) instead of the ad hoc scan used here.

## Gates

- Scheduler/extraction (pure): `npm run typecheck && npm run lint && npm test` (`cueCoalesce.test.ts` control
  rewritten deliberately, `scheduler.test.ts`, ownership census row if `hold/release` awaits).
- Runtime boundary wiring (only if A is built): `npm run gates` + live J11.12, J11.15 ×2 and J12 on a lane in a group
  chat with the real cloud read model and TypeSafe (no `debugResponse`, no pod).
- If A ships, the merge is internal (no new setting, no player surface): no registry entry is needed.

## Links

- v2.8 02 row C7 (narrow the campaign's `extractor_trigger`s, with a coverage gate: the "triggers first" decision)
- v2.7 09 commitment double negatives (the other extraction plan)
- v2.8 12 J6d shadow record and v2.8 13 J7 judge ideas (J7.1 scene-break confirmation would change who schedules
  `scene:judge`)
- v2.7 12 model choice (the read model's price sets the value of D)

## Review 2026-10-03

- **F01:** status line rewritten (decided: measure first; not run, not built).
- **C6:** acceptance tier CL (DeepSeek read model), not RunPod.
- **"21 line refs":** verified 2026-10-03 against `src`. Fixed: `scheduler.ts` merge dispatch `:182`, `mergeRead`
  `:189`, `mergeCue` `:202`, `mergeReread` `:211`, `isWindowlessCue` `:105`, pump `:469-473`. Confirmed unchanged:
  `boundaryWork.ts:53/:103/:114`, `journal.ts:107`, `inlineTimeline.ts:172,325`, `extractionCoordinator.ts:260,265`,
  `cueCoalesce.test.ts:138-150`, J11 `:387/:501` (check ids) and evals `:411/:554`, J12 `:88`.
- **C7:** "triggers first" cross-referenced to v2.8 02 row C7 (Recommendation, Links); the A/B runs after it.
- B4: A/B labels from Adolion windows get a second-model check, not the user.
- References version-qualified (B12); Links cut to the plans that matter.
