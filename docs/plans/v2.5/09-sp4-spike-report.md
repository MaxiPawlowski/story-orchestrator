# v2.5 plan 09 — SP4 append-only short_term spike report

**Verdict: pending.** Conditions and procedures committed before any spike code or run (rule 1). The conditions are the plan's
table (`09-research-spikes.md` §SP4) and are **never retuned**. This section only fixes how each one is measured.

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
| T1 | pending | pending | n/a (pure memory modules) |
| T2 | pending | pending | n/a (pure) |
| T3 | pending (live) | pending | pending |
| T4 | pending | pending | n/a (deterministic half) |

## Live legs (pending)

Pending until the code commit.

## Worth review (rule 8)

Pending the live legs.
