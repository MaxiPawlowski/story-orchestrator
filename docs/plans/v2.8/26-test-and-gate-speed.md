# Plan 26 — Faster tests and gates

**Status (2026-10-07): SEEDED from the user's idea list ("cleanup and optimize tests and gates. They take too long");
needs user approval; not built.** Overview: `00-overview.md`. Gate tier: D. **Recommended: pull into v2.7 before
Phase C (v2.7 39)**, which runs `npm run gates` and the scenario corpus many times.

## Where the time goes (measured 2026-10-07, branch `v2.7-image-track-wip`, parallel phases)

`npm run gates`: **443 s** wall, green. Phases (`scripts/release/gates.mjs:8-13`):

| Phase | Steps (concurrent) | Wall |
|---|---|---|
| 1 | typecheck, typecheck:test, lint, debug:typecheck, test:plugin | (logged per step) |
| 2 | jest (6,4xx tests, now without `--runInBand`) | 58 s |
| 3 | build, build:dev, test:debug | 72 s (test:debug the long pole; builds 38–40 s) |
| 4 | test:release, test:replay, test-storybook:ci | **289 s** (test:replay; Storybook 169 s, release 4 s) |

`test:replay` (the defect replay, 32 rows) is two thirds of the wall time. The second consecutive run's numbers
and any flake are recorded in v2.7 31 §C's gate record.

## Proposals

1. **Defect replay** (`test:replay`): find why it takes 289 s (each row rebuilds or re-runs jest? mutation per row?).
   Candidates: build once and share; run rows in parallel workers; cache unchanged rows by source hash of the files
   the row's mutant touches. Floor: ≤ 90 s, same 32/32 verdicts, a planted regression still caught (negative control).
2. **Storybook**: build once per gates run (already), shard the runner, skip the a11y pass for stories whose
   component hash is unchanged since the last green run (cache keyed by bundle hash; full run on release builds).
3. **Phase order**: start `test:replay` and `storybook:build` as early as their inputs allow (they don't need jest),
   so phase 4 overlaps phases 2–3.
4. **Two builds**: `build` and `build:dev` share babel/TS caches (webpack `cache: filesystem`).
5. **Jest**: measure `--runInBand` vs workers ×2; keep workers only if no order-dependent test appears (the v2.6 note
   "Jest runs in band" is rewritten to match what is kept). Find the slowest 20 test files; fix fixture rebuilds.
6. **`npm run gates:quick`** for per-change work: typecheck + lint + jest on changed files (`--findRelatedTests`) +
   the affected Storybook stories; `gates` stays the full chain for plan close and release.
7. **Test cleanup**: list tests that duplicate each other (same assertion, different file), tests guarding deleted
   code (solo removal, v2.5 spikes), `.skip`ped tests; remove with a reason per row.
8. **Live harness**: the no-model scenario corpus on 4 lanes in parallel (`st-lanes.mts batch`), already supported;
   document the recipe and its wall time.

## Gates (D)

- `npm run gates` ×2 green with identical test counts; wall time recorded each run.
- Proposed floors: full gates ≤ 240 s on this machine; `gates:quick` ≤ 60 s for a one-file change.
- Defect replay negative control (a reverted fix is still caught) and identical verdicts before/after.
- No test removed without a row naming why (deleted code / duplicate of `<file>:<test>`).

## Decisions for the user

1. Pull into v2.7 before Phase C? **Recommended: yes.**
2. Allow cached Storybook/replay rows for per-change runs (full run always at plan close and release)? **Recommended: yes.**

## Links

`scripts/release/gates.mjs`, `package.json` scripts, `v2.7/31-flux-out-and-tooling-split.md` §C, `v2.7/39-test-from-zero.md`.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer. **Pulled into v2.7** before Phase C (this file stays the plan).
