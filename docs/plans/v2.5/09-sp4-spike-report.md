# v2.5 plan 09 — SP4 append-only short_term spike report

**Verdict: pending (T3 live).** T1, T2 and T4 PASS deterministically; T3 has not run. The conditions are the plan's table
(`09-research-spikes.md` §SP4) and are **never retuned**. The procedures below were written before any run and committed in
`096e6812` (rule 1); the first deterministic run happened in the working tree just before that commit and changed nothing in them.
Two jest *controls* were added after that first run (a tight-context detection control for `uncovered`, and the removal of an
assertion on the informational live-coverage column); no bar moved.

## What the spike builds (behind `spikes.sp4AppendShortTerm`, install-wide, default off, never flipped by this plan)

- **Today (control arm, flag off):** one rolling `short_term` entry. Every 12 messages the synthesis pass rewrites it from the previous
  text plus the new window (`extractionCoordinator.ts` `runShortTermCompaction`, `buildShortTermSummaryPrompt(previous, window)`), and
  `memoryCoordinator.replaceShortTerm` records a `short_term` derived row whose `inputs` are the replaced entry.
- **Spike (flag on):** the same trigger and the same `fitShortTerm` window, but the pass summarises **the window alone** (no previous
  text in the prompt) and **appends** one row per window. Rotation keeps pinned rows first, then the newest unpinned rows while the tier
  holds at most `tierBudgets.short_term` rows (10) and at most `tierTokenBudgets.short_term` block tokens (300, `blockTokens`); the
  new row is always kept. The derived row has `inputs: []`, `range` = the window, `removed` = the rows rotated out.
- The spike module (`src/memory/shortTermAppend.ts`) loads only through a dynamic `import()` when the flag is on. It is on plan 12
  D3's list (`devOnly.guard.test.ts`), with a planted static import as the negative control.

## Conditions and how each is measured

| # | Condition | Pass (plan, verbatim) | Procedure (fixed before the run) | Kind |
|---|---|---|---|---|
| T1 | Invariant | `rollback ≡ replay` green with the append-only shape, same seeds | `src/memory/rollbackReplay.property.test.ts`, both describes (random cuts and decoded middle deletes), run for each shape: the compaction op either replaces (rolling) or appends through the spike's placement (append). Same seeds `[1, 7, 20260921, 424242]`, 400 cuts + 100 deletes per seed, same views. The generator's rotation limit is 3 rows so rotation is exercised inside 60 ops. | jest, once |
| T2 | Locality | over 400 random cuts, `synthesis` calls needed to rebuild short_term after a rollback ≤ today's, and messages left uncovered ≤ today's | `src/memory/shortTermLocality.spike.test.ts`. A 240-message chat per seed (seeds as T1, 100 cuts each = 400 cuts, cut uniform in [1, 240]); message size 20–120 tokens and summary size 160–480 characters from the seeded LCG; compaction at every boundary where `lastId - end >= 12` (production trigger), windows fitted by the real `fitShortTerm` at a 4096-token context; rollback through the real `reverseMemoryState`. **calls(cut)** = dropped `short_term` derived rows whose `range.from < cut` (work invalidated whose input partly survives, so it must be synthesised again). **uncovered(cut)** = message ids `m < cut` with `m <= watermark` after the rollback that lie in no surviving `short_term` derived row's `range` (read by no surviving pass and not re-read by the next one). Bar: Σcalls(append) ≤ Σcalls(rolling) **and** Σuncovered(append) ≤ Σuncovered(rolling) over the 400 cuts. Recorded beside it, **not a bar**: messages below the cut covered by a LIVE short_term row (rolling: the live row's derivation chain; append: live rows only), because rotation is a retention question (T3). | jest, once |
| T3 | Retention | live, 60 turns, 12 planted needle facts in the first 24 messages; share still present in the injected short_term at turn 60 ≥ today's + 0.15 (route recorded) | `test/scenarios/live-v25-09-sp4-t3-{rolling,append}.json` (generator `scripts/spike/v25-09/sp4-fixtures.mjs`). New solo chat of DM Narrator; 60 `send_generate` turns; player lines 1–12 each plant one needle, asserted inside the first 24 messages; lines 13–60 are needle-free filler. At turn 60, after the scheduler is idle, a needle is present iff its keyword occurs (case-insensitive) in `getMemoryInjectionBlocks().short_term`. share = present / 12. Series on one lane, one bundle: rolling ×2 then append ×2 (`st-lanes batch --repeat 2`); pass iff share(append, run k) ≥ share(rolling, run k) + 0.15 for k = 1 **and** 2. Route: the `synthesis` role's profile, logged by the arm step and in the run header (rule 5). | live ×2 per arm |
| T4 | Budget | injected short_term ≤ 300 tokens at every boundary | Deterministic: in the T2 simulation, after every boundary of both shapes, `buildMemoryInjection(...).trim.short_term.tokensUsed` ≤ 300 (max recorded). Live, as evidence beside it: the T3 fixtures read `snapshot.memoryInjection.trim.short_term.tokensUsed` after every turn and fail the step above 300. | jest, once (+ live evidence) |

A PASS needs T1–T4 all to pass; T2 alone is not enough (plan: the claim is locality **and** retention).

## Results

| # | Measured | Result | ST version note |
|---|---|---|---|
| T1 | Both describes green for the append shape: 4 seeds × 400 cuts and 4 seeds × 100 decoded middle deletes, every view equal (entries, ledger, beliefs, excluded, derived, watermark, coverage). Control: in seed 1 the tier holds exactly 3 rows, at least one compaction rotated a row out, and every append row has `inputs: []`, so the property is not vacuous for this shape. The rolling describes stay green on the same generator. | **PASS** | n/a (pure memory modules) |
| T2 | 400 cuts (4 seeds × 100), 80 compactions per shape. Σcalls: append **368** vs rolling **368**. Σuncovered: append **0** vs rolling **0**. Control: at a 1400-token context the rolling shape's fitted windows drop messages and `uncovered` reads > 0, so the zero is a measurement. Informational (not a bar): messages below the cut covered by a live row, append 13 164 vs rolling (lineage) 45 348 — rotation keeps about the last 3–5 windows. | **PASS** (tie on both) | n/a (pure) |
| T3 | not run (live) | **pending** | pending (lane install version to be recorded by the run header) |
| T4 | Max injected short_term tokens over every boundary of the 4 simulated 240-message chats: append **300**, rolling **125** (bar 300). The append rotation fills to the token budget exactly and never past it. | **PASS** | n/a (deterministic half) |

Commands: `npx jest src/memory/rollbackReplay src/memory/shortTermLocality` (numbers printed with `SO_SPIKE_REPORT=1`), measured
2026-09-26 on the working tree of the SP4 code commit.

**What T2 found.** The locality half of the hypothesis has nothing to win: since v2.3 plan 04 a rollback past the newest
rolling summary restores the previous one from its derived row's `removed` copy, so today's shape is already window-local. Both
shapes invalidate the same compactions and leave the same messages uncovered. The informational coverage column is the other
side of the trade: rotation drops old windows outright, which is exactly what T3 measures live.

## Negative controls and mutants

- D3 (plan 12): `devOnly.guard.test.ts` lists `src/memory/shortTermAppend.ts`; the module is not statically reachable from
  `src/index.tsx`, and a planted `export * from "./shortTermAppend"` in `memory/index.ts` makes the guard fail.
- Flag: `shortTermSpike.review.test.ts` drives the real Extraction + Memory coordinators. Flag off (control): today's prompt
  (`EXISTING SUMMARY:`) and a replaced row with `inputs: [<old id>]`. Flag on: window-only prompt, appended row, `inputs: []`.
  Mutant 1 (the coordinator ignores the flag): 2 of 3 fail. Mutant 2 (the memory coordinator ignores the placement): 2 of 3 fail.
- Flag sanitising: `spikeFlags.test.ts` (default off, only a literal `true` switches it on).

## Cost so far (for the worth review)

Prod graph: the main entry grows 693 B (1 174 410 → 1 175 103, budget 1 250 000) for the flag read, the placement seam
(`rollingShortTerm`/`ShortTermPlacement` in `memory/stores.ts`) and `setSpikeFlags`; the spike itself is a 980 B lazy chunk.
Coordinators: extraction +3 lines, memory +1. No new host seam; no ST host fact beyond the extension-prompt path already used.
The run header records `spikes` so a batch that leaves a flag on diffs red.

## Live legs (pending)

T3 (and T4's live evidence), ×2 per arm in one series on one lane, both arms on the same bundle and route:

```
npm run build:dev && npm run serve:dev
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/st-session.mts reload
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts capture --label v25-09-sp4
node scripts/debug/st-lanes.mts batch --lanes <n> --repeat 2 --strict --group 1759606632088 test/scenarios/live-v25-09-sp4-t3-rolling.json test/scenarios/live-v25-09-sp4-t3-append.json
node scripts/debug/st-lanes.mts run <n> -- scripts/debug/so-run-header.mts diff <capture.json>
```

Each run's score step logs `{arm, present, share, shortTermRows, t4max}`. Pass iff share(append, k) ≥ share(rolling, k) + 0.15 for
k = 1, 2. Archive under `test/journeys/records/v2.5-plan09/sp4/live-<bundle12>/`. A lane holding `DM Narrator` is required (the
lane seed has it). Model-heavy (60 generations plus the extraction reads and 5 synthesis calls per run): at most two model-heavy lanes per backend.

## Worth review (rule 8)

Pending the live legs.
