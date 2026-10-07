# Plan 26 — Faster tests and gates

**Status (2026-10-07): BUILT on `v2.7-gate-speed`** (approved, all recommendations; gate record below). Seeded from the user's idea list ("cleanup and optimize tests and gates. They take too long"). Overview: `00-overview.md`. Gate tier: D. **Recommended: pull into v2.7 before
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

## Gate record (2026-10-07)

Built on branch `v2.7-gate-speed` (from `8a9e06e3`), worktree, 16 logical CPUs shared with other agents. CPU load
sampled with `Get-CimInstance Win32_Processor` next to each timing. Storybook test-runner finds 0 stories from a
worktree path, so every run below is `--no-storybook`; Storybook changes are measured on `storybook:build` only.

### Where the replay time went

`test:replay` alone, before: **374.7 s** (load ~25 %): staging ~19 s (sync copy of 3,558 files after `rmSync`),
baseline 35.3 s (30 files in band), 32 rows 320 s in sequence (in-band jest per row, 6-10 s each). Profile of one
warm in-band run of one test file (4.6 s): **TypeScript 2.0 s self time** — ts-jest built a language service in every
jest process. With `isolatedModules: true` in `tsconfig.jest.json` (ts-jest transpiles per file) the same run is
1.4 s. The long pole that is left is `save-binds-late-empty-save`: the mutant hangs 11 tests into their 5000 ms
timeout (67 s before, ~75 s now); it is a real kill (same 11 titles before and after), so it is started first.

### Changes

| # | Change | Files |
|---|---|---|
| 1 | Replay rows run in parallel, one staged copy per worker (`--workers`, default cores/2 = 8; 4 under `gates`, `SO_REPLAY_WORKERS`), slowest known row first, baseline beside the rows on worker 0 (2 jest workers); a row's verdict counts only when that baseline is green, as before | `scripts/suite/defect-replay.mjs` |
| 1 | Re-staging is incremental (copy a file only when size/mtime differ, delete what the tree dropped; a leftover mutant is always replaced) and the cold copy is async (64 at once) | `scripts/lib/suiteStage.mjs` (`stageCopy` keeps its sync signature for `mutation-baseline`) |
| 1 | `--cached` (per-change only): reuse a row killed last time when its spec, mutated file and related tests (`jest --listTests --findRelatedTests` on the changed `src/` files) are unchanged, nothing outside `src/`/`docs/` changed, and none of its tests reads the tree through fs (those 3 rows always re-run). Every complete run writes `.build/defect-replay-cache.json` | `scripts/lib/suiteReplayCache.mjs` |
| 1, 4 | ts-jest transpile-only (`isolatedModules: true`) | `tsconfig.jest.json` |
| 2 | `gates` is a dependency graph, not phases: every step starts at once except `test:release` (after both builds) and `test:debug` (after `build`: `so-run-header.test` reads `dist/manifest.json`, which webpack clears mid-build; found by the first after-run, RED at 87.9 s), longest first, at most `--jobs` (default 5) running; first red stops new starts. `--serial`, `--no-storybook`, `--skip=` unchanged; `--help` added | `scripts/release/gates.mjs`, `gates.test.mjs` |
| 3 | Webpack filesystem cache per flavour in `.build/webpack-cache` (not the junctioned `node_modules/.cache`), and under `gates` the builds skip fork-ts-checker (`SO_BUILD_TYPECHECK=0`) because the `typecheck` step checks the same `tsconfig.json` | `webpack.config.js` |
| 3 | Storybook webpack filesystem cache, same dir | `.storybook/main.ts` |
| 4 | `test/support/codeHealth.ts` reuses one parse and one import scan per file and content, and caches file-exists lookups (no test writes source files) | `test/support/codeHealth.ts` |
| 4 | `soloRemoval.guard` scans each file once per content (controls change one file's text, which re-scans it) | `src/runtime/soloRemoval.guard.test.ts` |
| 4 | `so-integration` / `sessionDriver` fake pages: `waitForTimeout` returned at once while `now` was the real clock, so `waitRoundSettled` busy-spun 4 s per turn; a fake clock (`sessionFakes.fakeClock`) | `scripts/debug/lib/sessionFakes.mts`, `so-integration.test.mts`, `lib/sessionDriver.test.mts` |
| 5 | `npm run gates:quick` | `scripts/release/gatesQuick.mjs` (+ test), `package.json` |
| docs | gotchas (ts-jest note), debug-scripts (gate speed entry) | `.claude/rules/` |

Byte checks: `dist/*.js` sha256 identical uncached / cached cold / cached warm / warm without fork-ts-checker, and
`.build/packages-prod.json` identical; a Tailwind class added to `HudStrip.tsx` reached the cached bundle and left it
on revert (then bytes identical again); `.sb-static/**/*.js` identical uncached vs cached. `npm run build && npm run
test:release`: 107 tests, 105 pass, 2 skipped (pre-existing env skips), 0 fail.

### Timings (before → after, like for like)

| Step | Before | After | Load |
|---|---|---|---|
| `test:replay` alone | 374.7 s | 78.4 s warm (65-92 s across 5 runs); first run in a fresh worktree: staging 8 copies 14.9 s cold (was 205.6 s with the sync copy) | 25 % / 6-40 % |
| `test:replay --cached`, nothing changed | n/a | 9.0 s (29 of 32 reused) | low |
| `jest` alone | 63.7 s warm; per-file time summed 673 s | 55.0 s after the ts-jest change; 65.6 s final (all changes, load 44 %); per-file sum 431 s. The wall is now `swipeBack.review` alone (one property test, 800 real-manager worlds, 47-60 s): splitting its seeds across files is the next lever | 28 % / 37 % / 44 % |
| slowest jest files (full run) | devOnly 58.4 s, swipeBack 56.9 s, codeHealth 48.7 s, soloRemoval 36.7 s | devOnly 15.3 s, codeHealth 17.0 s, soloRemoval 12.7 s; swipeBack 60.6 s, chance 20.4 s, rolls 17.5 s (property tests, untouched) | |
| `test:debug` alone | 68.4 s | 21.1 s (1,042 pass) | |
| `build` warm | 37 s webpack (67.9 s wall) | 21.8 s; 4.0 s without fork-ts-checker (as under gates) | |
| `storybook:build` | 76.8 s | 113 s first (writes the cache), 8.9 s warm | |
| **`npm run gates -- --no-storybook`** | **468.3 s** (at `8a9e06e3`, load 70-100 % first 3 min, then 2-74 %) | **80.0 s** run 1, **147.6 s** run 2 (load 82-100 % the whole run) | |
| `gates:quick`, one-line change in `src/talk/rules.ts` | n/a | 41.3 s (typecheck 39 s is the pole; jest related 900 tests; replay 27 of 32 reused) | 97 % |

Counts, before and both after runs: jest 6,432 passed + 1 skipped; test:debug 1,036 → 1,042 (the 6 new
`suiteReplayCache` tests); test:plugin 108 / 105 pass / 3 skipped; test:release 103 → 107 (4 new gates tests), 2 skipped;
replay 32 of 32 killed. The two after runs agree on every count.

### Replay verdicts and the negative controls

- Identical verdicts: 32/32 killed before and in every after run; the killing titles of the long-pole row are the same 11.
- Planted surviving spec (`zz-planted-control`: the background mutant pointed at `derived.test.ts`): SURVIVED,
  `defect replay: 32 of 33 killed; NOT killed: zz-planted-control`, exit 1 (parallel, and again with `--only`).
- Reverted fix under `--cached`: the `background-write-unowned` defect written back into `src/runtime/effectsApplier.ts`:
  the row re-ran (only 25 of 32 reused), `DID NOT APPLY`, baseline red, exit 1. Restored after.
- A timeout-only reclassification was tried and dropped: the long-pole row's real kill is 11 timeouts, so a run made
  of timeouts is not evidence of load.

### Test cleanup (proposal 7): nothing removed

| Candidate | Finding | Decision |
|---|---|---|
| Static `.skip` / `xit` / `.todo` in jest | none | — |
| Conditional `describe.skip` (data absent): `pacing/guidance` (Adolion pin), `runtime/chanceAdolion`, `talk/aliases` (lab files), `studio/gateReplay.records` | the first three run when their data is present; `gateReplay.records` is skipped in every checkout since `bffdec6b` moved `v2.5-plan07` engine histories to `C:\dev\backups\story-orchestrator\records` | kept: it runs again when the records are restored; flagged as vacuous in CI for the user |
| node:test env skips (`attestation`, `artifact`, `integrationRuns`) | skip with a stated reason when a release tree or the campaign repo is absent | kept |
| Same title in two files (8 cases, e.g. "parses the recorded chain…" in three `generation/*.recorded` files, "refuses %p by path") | different fixtures or different modules each time; no duplicate assertion | kept |
| Guards of deleted code (`soloRemoval.guard`, `devOnly` dropped spikes) | they keep removed code out; that is their job | kept (made faster) |

### Deviations

- Floor "full gates ≤ 240 s": met (80.0 s, 147.6 s under full load). Floor "replay ≤ 90 s": met warm (65-92 s across runs;
  one cold-cache run at 92.0 s right after the tsconfig change).
- Storybook: runner sharding and the a11y skip-by-hash cache (proposal 2) not built; the runner cannot be measured from
  a worktree. Done instead: Storybook starts at t=0 in `gates` and its build is cached (8.9 s warm). The main checkout
  should time `test-storybook:ci` after merge.
- `gates:quick` lists the stories beside a changed component; it does not run them (a Storybook build plus server is
  not a per-change cost). Default base is `master`; a branch cut from another branch should pass `--base`.
- Proposal 8 (no-model corpus on 4 lanes): not touched in this pass.
- `.claude/settings.local.json` was already modified in the worktree; not committed.
