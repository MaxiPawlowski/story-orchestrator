# Plan 04 — Memory contradictions, second pass

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on **03** (overview §Plan sequence: `memoryCoordinator` has no
line for a judge dep on `MemoryQueueDeps`), and on 11 through 03. Verified against master `e7626d7`. Re-verify every
path:line before building (v2.4 rule 1). Nothing here is built.

## Source rows

| Row | Source |
|---|---|
| Limits as recorded | `v2.4/07-judge.md:958-961` (first build), `:1093-1101` (union revision), `:1122` (live, union bands) |
| Polarity barely moves an embedding (measured) | `v2.4/07-judge.md:1017-1022`; probe `test/journeys/records/v2.4-plan07/contradiction-live-9b2f890a5987/pair-cosine-probe.json` |
| Candidate directions, none built | `v2.4/07-judge.md:1030-1033` |
| `memoryPairs` release not built (budget) | `v2.4/07-judge.md:1059-1062`; overview rule 12 |
| Open questions carried | `v2.4/07-judge.md:973-974` |
| Outline | `v2.5/00-overview.md:174-186` |
| Seeds | `v2.4/v2.5-seeds.md` has no row for this area (it lists only §F's plan-04 regex parity, which is **extraction** and goes to plan 05) |

## Goal

Hold every claim that contradicts a settled fact, and stop holding claims that agree with it, each change only past a floor
declared before its arm runs. A miss stays a stated limit; no band is retuned (v2.4 rule 4, arch "a floor that is unreachable
is still not retuned").

## Scope / out of scope

**In:** K0 a labelled contradiction fixture (the instrument every arm is scored on). N1 a deterministic polarity screen (the
no-judge arm). J1 a judge **release** of agreeing paraphrases on the write-path hold. J2 a judge **catch** of same-subject pairs
below the bands. O1 ordinary rows below the band (spike). Q1 the held-pair copy when a non-player speaker made the claim.

**Out:**
- Retuning `DEFAULT_DEDUP_THRESHOLDS` (`memory/consolidate.ts:13-20`) or Jaccard tokenisation for consolidation (moves every
  dedup decision; not this plan's measurement).
- An authored fact seed in the schema (Q2 below is the user's; rule 6 applies if yes).
- A held pair left with a missing row after a rollback (`v2.4/07-judge.md:969-970`, existing behaviour for every memory pair).
- Designing plan 13 (harness routing). K0 is route-agnostic, so plan 13's calibration can score an LLM arm with it.
- Lore contradiction in the warden (R14, plan 08).

## Verified current state (master `e7626d7`, 2026-09-25)

| Claim | Seen | Δ |
|---|---|---|
| Established = locked, author override, or `source: "author"`; a pin does not count | `src/memory/conflicts.ts:215`; live form `standsEstablished` `:217` | — |
| Bands for an established row = vectors ∪ Jaccard | `establishedBands` `conflicts.ts:240-243`, `unionMatchSets` `:230-233` | — |
| A candidate is held when in an established row's dup/same-topic band, not the same text, and not a state-change update below an unlocked row | `heldContradictions` `conflicts.ts:247-258` | — |
| Every row reads as type `fact` for the hold | `heldGroup` `conflicts.ts:227-228` | — |
| Write path: bands read before the ownership check, hold after the tier write | `MemoryCoordinator.applyEntries` `memoryCoordinator.ts:145-155`; `findHeldContradictions` `runtime/memoryQueue.ts:94-100`; `holdMemoryContradictions` `:104-115` | — |
| `MemoryQueueDeps` has `matchSets`, no judge | `memoryQueue.ts:14-39` (`matchSets` `:38`); built in `queueDeps()` `memoryCoordinator.ts:301-320` | — |
| Consolidation: undecided pair vs established row → hold newer; else soft mark | `settleUncertain` `memoryQueue.ts:119-133` | — |
| Consolidation runs only for tier groups ≥ 8 | `CONSOLIDATION_MIN_GROUP` `memory/consolidate.ts:22`; check `memoryCoordinator.ts:487` | — |
| Ordinary consolidation is single-source (vectors, else Jaccard) | `buildMatchSets` `runtime/consolidationMatches.ts:8-49` | — |
| `memoryPairs` is wired into consolidation only | `memoryCoordinator.ts:484-486`, `judgePairRelations` `consolidationMatches.ts:51-77` | — |
| The pair question has **no contradiction relation**: `duplicate / update / distinct / unrelated` | `src/judge/memory.ts:5,12-17`; request `:50-58`; `pairDecision` `:74-78` (same-thing < 0.5 → distinct) | new finding: J1/J2 cannot reuse the question unmeasured |
| Pair policy | `PAIR_MIN_CONFIDENCE 0.6`, `PAIR_TIMEOUT_MS 3000`, `PAIR_MAX_PER_PASS 32`, `PAIR_CONCURRENCY 8`, `PAIR_JACCARD_FLOOR 0.2` (`judge/policy.ts:37-43`) | — |
| `memoryPairs` readiness 0.9063, "measured on the consolidation path", `jev-1.13.0` | `judge/readiness.ts:31,42` | — |
| Pair fixtures: 32 rows (3 es), hold-out 14 (3 es), floor `rightAction 0.85`; negation-bearing rows: M07, P24 (both en) | `test/fixtures/judge/memory-pairs.json`, `memory-pairs-holdout.json` | no Spanish negation pair exists |
| Jaccard tokenises on whitespace, lowercased, **punctuation kept** (`"gone."` ≠ `"gone"`) | `memory/similarity.ts:15-26` | new finding: an explicit negation pair can fall under 0.4 on punctuation/inflection alone |
| State-change markers are English-only | `STATE_CHANGE_PATTERNS` `similarity.ts:28-61` | a Spanish update below an unlocked row is held, an English one is not |
| No negation/polarity code in `src/` | grep `negat\|polarity`: only `agencyRecovery.ts` (gate negation) and a comment `conflicts.ts:238` | — |
| Held-pair copy is author-only | `ConflictQueue.tsx:62`, mounted under `authorView` `DrawerTabs.tsx:269` | Q1 is not rule 7 |
| Budgets (test formula) | manager **740/740**, `memoryCoordinator` **619/620**, `extractionCoordinator` 604/620 (`architecture.test.ts:17-18`) | Δ overview says manager 736 |
| Census rows touched | `MemoryCoordinator.applyEntries` (`test/findings/ownership-sites.json:100`), `runConsolidation` (`:148`) | rule 13 applies |

**Measured baseline (v2.4 J8.5, union bands, `9a28415066c3`):** both contradicting claims held ×2; one agreeing paraphrase
held per run (`v2.4/07-judge.md:1105-1120`). Pair cosines 0.410 / 0.359 (claims), 0.306 (agreeing) vs same-topic 0.55.

## Measurement instrument (K0) — built first, labelled before any arm runs

`test/fixtures/memory/contradictions.json`, frozen with `fixtureFrozenAt` and a sha256 before the first arm (the T18
calibration shape, `test/goldens/live/role-calibration/*.json`). Each row: `{id, lang, established, claim, label, band}`.

| Class (label) | en | es | What it pins |
|---|---|---|---|
| `contradicts` in band | 4 | 2 | the J8.5 pairs; today's recall = 1.0 by construction |
| `contradicts` below band, explicit negation (`not`, `never`, `no`, `ya no`, `nunca`, `jamás`, `sin`, `ningún`) | 4 | 4 | N1's target |
| `contradicts` below band, no negator ("The crossing is fine" vs "the bridge collapsed") | 3 | 2 | J2's target; N1 cannot see it |
| `agrees` (paraphrase, incl. agreeing pairs that both carry a negator) | 5 | 2 | false holds; J1's target |
| `update` with a state-change marker | 2 | 2 | below an unlocked row = pass through today |
| `distinct` same subject | 3 | 2 | false holds from subject overlap |
| **Total** | **21** | **14** | ≥ 20 per v2.4 rule 4; Spanish slice incl. negation |

`band` is recorded per row twice: Jaccard (computed in jest) and cosine (bracketed live on a lane with the
`pair-cosine-probe.js` bisection, 14 steps, collection purged; the v2.4 method). Rows are scored under both "vectors present"
and "Jaccard only", because jest runs the fallback and the live install runs vectors (`v2.4/07-judge.md:1018-1019`).

Band assignment is frozen with the fixture. Jaccard band comes from the jest computation. Cosine band comes from a named
bracket file (`contradictions.cosine.<bundle>.json`) captured once before A0. "In band" = the union used by
`establishedBands` for each mode. Per-mode class counts (in band / below band) are written into the table before any arm
runs, and the `agrees` class must have ≥ 5 in-band rows in each mode (add rows before freezing if not). A later bundle
whose cosines move a row across the band adds a new scored column. It never changes which rows the predeclared floors read.

**Metrics per arm** (per slice: all, es, below-band): `recall` = held | `contradicts`; `falseHold` = held | `agrees ∪ distinct`;
`releaseErr` = released | `contradicts` (the costly error: a released contradiction becomes a live fact the warden enforces).
**Route recorded per run:** vectors source (`transformers`, capability state), judge host + answering model (`JudgeCallRecord.model`,
`measuredOn`), and the run header's `extraction.profiles` (plan 13 will add a route kind; until then the header is the record).

## Design per item

### N1 — Polarity screen (no judge; measured first, the overview's "no-judge arm")

- **What.** Pure `memory/polarity.ts`: normalise (lowercase, strip punctuation, collapse `n't`), count negators from an en+es
  list, compare the two texts' content tokens with negators removed. A pair with subject overlap ≥ `PAIR_JACCARD_FLOOR` (0.2,
  reused, not new) and opposite polarity is added to the established-row bands (`establishedBands`), never to ordinary
  consolidation.
- **Expected honestly:** small. It cannot see J8.5's own shape (no negator on either side), and explicit negation pairs usually
  already share enough words. Its real target is the punctuation/inflection miss found above.
- **Predeclared floor (K0, Jaccard-only and vectors-present both):** below-band explicit-negation recall ≥ **0.6** (today 0 by
  construction) on all and on es separately; in-band recall = **1.0** (no loss); `falseHold` on `agrees ∪ distinct` no more than
  A0's + **1** row; `releaseErr` n/a (N1 only adds holds). Below any floor → recorded **not built**.
- **Budget.** 0 coordinator lines (pure + `conflicts.ts`).

### J1 — Judge release of agreeing paraphrases (write-path hold)

- **What.** A held pair is re-asked; a confident "agrees" answer releases the pair through a separate judge-release write,
  not the author's `dismissMemoryConflict`/`commitDecision`, and the candidate stays live; anything else, **including timeout,
  error, unavailable, disabled**, keeps it held (v2.4 rule 4: today's path). The judge-release write:
  - mints its `RunToken` before the judge call and checks `stillOwns()` after the await and before the patch;
  - records its own journal kind (e.g. `held-released`, carrying the judge call id from `extras.judge.calls`);
  - never calls `deps.refused`, so it cannot set or clear the author's `decision-refused` notice;
  - if the save does not land, puts the pair back as held (compare-and-set via `diffStore`/`putBack`), logged only in the
    journal.
  Whether a judge release writes `resolvedConflicts` (which permanently stops re-queueing the key) is stated before the build.
- **Key.** A **new** `judge.uses.contradictionRelease`, off by default, never flipped by the plan. Reusing `memoryPairs` would
  switch write-path behaviour on for anyone who enabled consolidation merging (user rule: every usage its own opt-in). See Q3.
- **Question.** Two wordings, both scored: (a) today's pair question mapped (`duplicate` → release; `distinct`/`unrelated` →
  release; `update` → hold); (b) a variant with an explicit `contradicts` choice. The variant is tuned on K0 and scored once
  on a separate ≥ 12-row hold-out (4 es) written before its first answer (the `memory-pairs-holdout.json` rule).
- **Predeclared floor (Phase A, K0 rows in band under the frozen assignment, scored in Jaccard-only and vectors-present modes
  separately, each mode must pass):** `releaseErr` ≤ **0.05** overall (over the 6 in-band `contradicts` rows, so 0 of 6) and
  **0** on es; paraphrase release ≥ **0.6** (over the declared in-band `agrees` rows);
  judge-off column = A0 exactly. Latency: p90 ≤ `PAIR_TIMEOUT_MS` in the live probe (rule 11: no wall clock in jest).
- **Reading of the refusal list:** "a judge probability deciding a state write" (`v2.4/00-overview.md:345`) is read as engine
  state; memory-row relations are judged since v2.2 (`judgePairRelations`). If the user reads it wider, J1 only annotates the
  queue card. Q4.
- **Budget.** `MemoryQueueDeps.judge?` + one `queueDeps()` line: waits on plan 03's extraction (rule 12).

### J2 — Judge catch below the bands (spike, after J1's question is measured)

- **What.** Candidates = established × new rows with Jaccard ≥ `PAIR_JACCARD_FLOOR` or a shared roster name, outside the bands,
  capped at `PAIR_MAX_PER_PASS`; a confident `contradicts` holds. Same key family: **its own** `judge.uses.contradictionCatch`.
- **Condition to build:** J1's variant (b) passes its hold-out, and on K0's below-band-no-negator rows recall ≥ **0.6** with
  `falseHold` on `distinct` ≤ **0.2**. Cost measured live: calls per extraction write with ≥ 1 established row, p50/p90 via the
  T24 meter; declared cap 8 calls per write before the run.
- Below the floor → recorded **not built**; the limit stays in `conflicts.ts:209-214`'s comment.

### O1 — Ordinary rows below the band (spike)

Two non-established rows that disagree get the soft mark only through consolidation's single-source band and only in groups ≥ 8.
- **Measurement first:** K0's pairs recast as ordinary rows (neither established), run through `consolidateTier` over a
  synthetic 8-row group, vectors and Jaccard. Plus a live count: on the J7/J3 ×2 records, how many `contradicted` marks landed and
  how many K0-shaped pairs the transcript produced (hand-labelled, ≤ 20 rows).
- **Condition to build anything:** ≥ 3 ordinary contradicting pairs observed live that consolidation missed. Otherwise recorded
  "not observed", and the v2.4 decision (union for established rows only; mutant B4) stands.

### Q1 — "A character claimed" copy (author-only; small)

The queue card names the speaker when the claim's evidence resolves to a non-player message (`conflictWindow` already reads the
claim's message). Author view only (`DrawerTabs.tsx:269`), so rule 7 does not apply; `assert-player-clean` still runs. Built only
if the user answers Q5 yes.

## Order of work

1. K0 fixture + labels + frozen sha; live cosine brackets on a lane (lane copy, no user data).
2. A0 score (today's code) recorded as the baseline column.
3. N1 red tests → build → K0 score → verdict against its floor.
4. After plan 03 frees the line: J1 Phase A (both wordings, hold-out once) → build behind its key → live.
5. J2 only if step 4's condition holds; O1 measurement in parallel with 3.
6. Gate record (tail section).

## Tests

- **Red first (jest):** `memoryQueueHeld.test.ts` gains an en pair whose Jaccard is measured below 0.4 on `e7626d7`, where
  only polarity or punctuation would join the two (e.g. a longer seed where the negation reword changes most tokens), and the
  es pair (`El puente ya no existe.` / `El puente sigue en pie.`, measured Jaccard 0.25, with a negator variant). Each test
  first asserts `jaccardSimilarity(a, b) < DEFAULT_DEDUP_THRESHOLDS.jaccardSameTopic` and only then asserts the hold, so a
  red case that is already covered cannot pass silently. Both fail on `e7626d7` (N1's target) — that is the red. The pair
  `The bridge was not destroyed.` / `The bridge was destroyed.` is held today (Jaccard 0.8, `dup` band) and is kept only as a
  regression case that must stay held.
- **K0 in jest:** `contradictions.fixture.test.ts` scores A0 and N1 in Jaccard mode from the frozen file and asserts the recorded
  numbers (a structural bound, rule 11); vectors mode replays the recorded cosines through the `contradictedSeed.review.test.ts`
  vectors stub.
- **Negative controls:** agreeing pair with a negator on both sides not held by polarity; `distinct` same-subject not held;
  N1 never reaches ordinary consolidation (8-row `runConsolidation`, no soft mark, no queued pair); J1 with the key off, with a
  timeout, with `unavailable` → pair still held, zero dismiss writes.
- **Mutants** (record `test/findings/mutations/v25-04-contradictions.txt`): polarity sign ignored; es negators removed; screen
  leaks into ordinary consolidation; subject-overlap floor dropped; J1 releases on `update`; J1 releases on fallback; J1 reads
  `memoryPairs` instead of its own key; J1 releases below `PAIR_MIN_CONFIDENCE`. Each must be killed by a named case.
- **Census/fault matrix:** `applyEntries` gains an await (J1) → re-read every write after each await (rule 13), row note
  updated; `memory|delayedError`, `memory|aborted` cite a J1 timeout/abort case.
- `npm run typecheck && npm run typecheck:test && npm run lint && npm test`, `debug:typecheck`, `build`, `test:release`.

## Live gates (real LLM, lane, ×2 consecutive, `--strict`, run header diffed around the batch)

Records: `test/journeys/records/v2.5-plan04/`.

| Gate | Arms | Green |
|---|---|---|
| J8.5 (existing) | judge-on ×2 (`--judge-uses warden,contradictionRelease`), judge-off ×1 | the four v2.4 criteria (`v2.4/07-judge.md:946-952`) still hold. If J1 is built, score it per held pair from J1's own judge-call records (`extras.judge.calls`, key `contradictionRelease`): for every pair the on arm held, record the release decision and probability and hand-label the claim agrees or contradicts. Green = 0 released contradictions over both on runs; every hand-labelled agreeing paraphrase's release outcome is recorded, and if neither run extracted one the release half is NOT EXERCISED (not green) and the batch is re-run. The off arm proves only that the key is off: 0 `contradictionRelease` calls, no release writes. No held-count comparison across runs |
| `live-v25-04-negation.json` (new) | N1 on, judge off, ×2; en and es seeds | the explicit-negation claim is held; `held` names it; an agreeing control line is not held |
| K0 cosine probe | once per bundle, recorded | brackets stored beside the fixture; any row that moved band is re-scored, never relabelled |
| J2 (only if built) | judge-on ×2, off ×1 | below-band claim held; meter calls per write ≤ declared cap |

## Risks

- N1 is likely below its floor: the dominant live shape has no negator. That is an acceptable outcome, recorded as not built.
- The pair question may map contradictions to `update` or `distinct` unpredictably; hence two wordings and a hold-out.
- Vectors vs Jaccard disagree per row; scoring only one mode hides half the behaviour (the v2.4 J8.5 red was exactly that).
- J1/J2 add judge calls on the extraction write path (off-path, but each write awaits them); cost is metered, not assumed.
- Plan 03 may not free the `queueDeps()` line; J1/J2 then stay budget-blocked (rule 12), N1 still ships on its own.

## Unresolved questions

- **Q2** Should `isEstablished` count a story-authored seed? No schema field exists; yes means a rule-6 schema addition.
- **Q3** New keys `contradictionRelease` / `contradictionCatch`, or reuse `memoryPairs` for the write path? Plan proposes new keys.
- **Q4** Does "a judge probability deciding a state write" cover memory-row dismissals? If yes, J1 annotates only.
- **Q5** Q1 copy: name the speaker ("Arin claimed …") on the author's queue card — wanted?

## Gate record (code items)

2026-09-26, branch `worktree-wf_aaec966e-c75-1`, master merged at `6aee3865` (v2.5 plan 06 code items, A37/A3/A11; master had
not moved again at the last gate run). Resumed after a quota cut: the uncommitted `memoryQueue.ts` / `memoryQueueHeld.test.ts` edits
were mutant restores with no content diff (index refreshed, nothing committed); the `host-facts.md` edit was committed. Nothing run
live: no lane, no main ST, no pod.

| Item | Commit | As built | Verdict |
|---|---|---|---|
| K0 fixture | `32c2aa87` | `test/fixtures/memory/contradictions.json`, 35 rows (21 en / 14 es), frozen 2026-09-26, rows sha `c33d55e5…`; Jaccard bands recomputed in jest; A0 Jaccard column pinned (in-band recall 6/6, below-band 0/13, falseHold 10/12); cosine bracket script `so-contradiction-cosine.mts` | built; cosine column **live pending** |
| Host facts | `abf91210` | `v2.4/host-facts.md` v25-04-H1..H4 (vectors insert/query/purge, `7c3994196` file:line) | recorded |
| N1 polarity screen | `6c348fd9` | `memory/polarity.ts`, joined to `establishedBands` only, subject floor `PAIR_JACCARD_FLOOR`; 0 coordinator lines | Jaccard mode **passes** its floor: below-band negation recall 8/8 (es 4/4), in-band 6/6, falseHold A0 + 1 (K35). Vectors mode bounded by text (screen reads no cosine, all Jaccard-band holds kept); its exact column waits for the bracket file |
| J1 Phase A instrument | `2b8f7f29` | `judge/contradiction.ts`: wordings (a) mapped pair question, (b) explicit `contradicts`; release only on a confident `agrees`, hold on every fallback; floor scorer; 14-row hold-out (5 es) written before any answer; `so-judge calibrate --use contradiction-release` | instrument built; Phase A **live pending** |
| J1 Phase A runnable | `24504b6c` | resumed-session finding: `calibrate --use contradiction-release` read `test/fixtures/judge/contradiction-release.json`, which does not exist, and would have judged the run by the generic `--min 0.85` instead of the predeclared floors. Now the default fixture is K0 itself, the modes are built from the frozen Jaccard band and each recorded cosine bracket file (`scripts/debug/lib/contradictionRelease.mts`), and `scoreReleasePhaseA` (via `storyOrchestratorJudge.scoreContradictionRelease`) passes a wording only when it clears the floors in every mode; no bracket file = vectors mode unmeasured, exit 1 | instrument complete; Phase A **live pending** |
| J1 release write | — | not built: Phase A unmeasured, Q3/Q4 open, `resolvedConflicts` choice not stated. Census / fault-matrix rows unchanged (no new await in `applyEntries`); `memory|delayedError`/`memory|aborted` J1 citations wait for the build | **not built** |
| J2 catch | — | conditional on J1 (b) passing its hold-out | **not built** |
| O1 | `c33b344a`, `8371cfb5` | jest: K0 as ordinary rows in an 8-row group, Jaccard: 6/6 in-band contradictions soft-marked, 0/13 below, agreeing/distinct in-band marked alike. Live count, offline from the postfreeze J3/J7 ×2 records (`test/journeys/records/v2.5-plan04/o1-live-count/`): 249 rows, 1 ordinary contradicting pair (+1 reversal labelled update); soft marks not recorded in those records | **not observed** (< 3); v2.4 decision (union for established rows only, B4) stands |
| Q1 copy | — | waits for Q5 | **not built** |
| Live fixture | `3bddd0e6` | `test/scenarios/live-v25-04-negation.json` (N1, judge off, en+es locked seeds, agreeing control, NOT EXERCISED guards); 4 evals syntax-checked | **live pending** |

Mutations (`test/findings/mutations/v25-04-contradictions.txt`): N1 6/6 killed, J1 Phase A decision 5/5 killed, Phase A verdict 4/4 killed. The J1 key-wiring mutant
(reads `memoryPairs`) waits for the release write.

Gates after the master merge and the Phase A fix (`24504b6c`):

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:test` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | exit 0, 299 suites, 4164 tests; fault matrix 85 covered / 11 partial / 24 n/a / 0 todo (of 120) |
| `npm run debug:typecheck` | exit 0 |
| `ST_PUBLIC=C:/dev/SillyTavern-MainBranch/public npm run build` | exit 0, bundle `b4075859fc23`, source `75dc30f6e6fd`, ST 1.19.0 |
| `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run test:debug` | exit 0, 388/388 (without `ST_ROOT` one host-events case skips) |
| `ST_PUBLIC=C:/dev/SillyTavern-MainBranch/public npm run test:release` | exit 0, 37/37 |
| Storybook | not run: no UI touched |

Budgets (effective lines, `architecture.test.ts`): manager 548/700; coordinators ≤ 560: memory 500, extraction 480, stagecraft 450,
expansion 332, copilot 262, scene 223, pacing 126.

Live pending (per-plan live ×1, batched, rule 14):

1. K0 cosine brackets, once per bundle, lane: `node scripts/debug/so-contradiction-cosine.mts capture --record`, then re-run
   `npx jest src/memory/contradictions.fixture.test.ts` to score the vectors-present column for A0 and N1.
2. N1 live: `node scripts/debug/so-scenario.mts run test/scenarios/live-v25-04-negation.json --sandbox --group <id>` (judge off).
3. J1 Phase A, after item 1 (the vectors mode needs its bracket file): `node scripts/debug/so-judge.mts calibrate --use
   contradiction-release --record` (K0, tune wording (b) here only), then once `... --fixture contradiction-release-holdout --record`;
   green = a wording in `passing` (releaseErr ≤ 0.05 and es 0, paraphrase release ≥ 0.6, every mode); latency p90 ≤ 3000 ms from
   the report rows. Measurement only: judge uses stay off, no install setting changes.
4. If J1 is built: J8.5 `--judge-uses warden,contradictionRelease` ×2 + off ×1, per the Live gates table.

Open user decisions: Q2 (authored seed as established), Q3 (new `contradictionRelease`/`contradictionCatch` keys vs
`memoryPairs`), Q4 (does "a judge probability deciding a state write" cover memory-row dismissals), Q5 (speaker name on the
author queue card), and before any J1 build: whether a judge release writes `resolvedConflicts`.
