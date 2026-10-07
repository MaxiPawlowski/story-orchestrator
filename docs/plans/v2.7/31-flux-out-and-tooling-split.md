# Plan 31 — FLUX out, product vs local tooling, harness hygiene

**Status (2026-10-07): SEEDED from the user's decisions (2026-10-07: FLUX out of scope; "parallel if it's nice";
evidence to the private repo — done); needs user approval; not built.** Overview: `00-overview.md`. Gate tier: D.

## A. Remove FLUX

FLUX's only product use is the **scene background** default (`src/image/settings.ts:76`, prose prompt style).

| Where | Change |
|---|---|
| `src/image/catalog.ts:12-13,32,51,55,70-74` | drop the `flux` graph/LoRA base, the `flux-dev` family and the FLUX checkpoint row |
| `src/image/graph.ts:39-46` | drop the FluxGuidance / EmptySD3LatentImage branch |
| `src/image/prompt.ts:64,76` | drop the prose prompt style (exists only for FLUX) |
| `src/image/settings.ts:76,125,148` | background → SDXL wide row (`no humans, scenery`), family pick without `flux-dev`; a stored `flux-dev` choice falls back with a Repair row, not an error |
| `src/image/image.test.ts` | rewrite the FLUX cases as SDXL background cases |
| `server-plugin/story-orchestrator-media/index.mjs:23` | drop FLUX-only nodes from the allowed list |
| `scripts/local/*` FLUX files, `scripts/debug/st-local-transport.mts` | removed (25 is closed) |
| plans 17 §A.2, 18 §2, 22 arbiter text, 25 | marked superseded by this plan |

Install state outside git (the user's machine, not product): `D:/models/story-orchestrator-flux-spikes`, the extra
torch environments and the controller interpreter switch (25:195-197) — listed for the user, never deleted by us.

## B. Product vs local tooling

| Kind | Items | Home |
|---|---|---|
| Product | 17 route A + template, 19 animator, 20 card fields, reusable parts of 18/26 (builder, pixel QA, region editor), 28's changed-look frame refresh | v2.7 32 |
| GPU broker | `server-plugin/story-orchestrator-gpu`, residency controller core (`scripts/local/controller.mjs`, `scheduler.mjs`, `models.mjs`) | v2.8 28 (the user wants it integrated into the ST plugin). Until then: optional, fail-open, never required |
| This machine's config | Artemis/3090 model table, reserves, ports | out of shipped code: `src/sprites/builder/batchHost.ts:20` reserves read from the broker's status; `story-orchestrator-gpu/index.mjs:25,55` address from config |
| Dev-only | warm-batch lease (`batchLease.ts`, `batchHost.ts`) statically imported in `sprites/start.tsx:25` | dynamic import behind `__SO_DEV__` (prod chunk test) |
| Campaign | `scripts/debug/saga-*`, `so-saga-*`, `so-adolion-rollout`, `so-production-rollout`, `v27-*` scenarios pinned to lane 6 / group `1791068844825` | v2.7 38; pins become `requires.group` by name |
| Records | 21, 23, 27 | stay as history |

## C. Harness hygiene

- **Parallel gates**: `jest` without `--runInBand`, Storybook `--maxWorkers 4`, `gates.mjs` parallel phases
  (commit `445ac5b4`). Kept if `npm run gates` is green twice in a row with identical counts (measured 2026-10-07,
  §Gate record); otherwise revert per runner. `gotchas.md` "Jest runs `--runInBand`" is rewritten either way.
- Faster gates and test cleanup beyond this: v2.8 26.
- Stale plan headers (03–06, 14–15 still "not built"), the saga-rule contradiction (overview "≥2 chapters" vs the
  authored `kind`, v2.7 05), overview rules 5/6/8 vs the image exceptions: fixed in the overview re-scope.

## Gates (D)

`npm run gates` ×2; `npm run test:release` on a prod build (FLUX absent from the bundle, dev-only lease absent);
image jest without FLUX; a seeded install with `flux-dev` stored shows the fallback Repair row.

## Decisions for the user

1. Background default SDXL (WAI) or route A only (ST's own image service decides)? **Recommended: route A by
   default, SDXL wide row as the ComfyUI route's default.**

## Links

`25-flux-memory-and-backend-spikes.md`, `32-images-and-living-characters.md`, `v2.8/28-gpu-broker-in-st-plugin.md`,
`v2.8/26-test-and-gate-speed.md`.

## Gate record

**§C parallel gates, 2026-10-07, branch `v2.7-image-track-wip` (`445ac5b4`):** `npm run gates` twice in a row, both
green, identical counts: jest 6,414 passed / 1 skipped; test:plugin 104 / 3 skipped; defect replay 32 of 32 killed;
Storybook green. Wall 443.4 s and 401.4 s (test:replay 288.6 / 263.6 s, Storybook 169.3 / 119.0 s). Verdict: **parallel
kept** (user: "parallel if it's nice"). §A/§B not built.

### §A/§B build 2026-10-07

Branch `v2.7-31-flux-out` from `v2.7-image-track-wip` (`8f96efce`), agent worktree.

- §A: `catalog.ts` has no `flux` graph, LoRA base, `flux-dev` family or FLUX row, and `graph`/`promptStyle` are gone
  (SDXL only). `graph.ts` has one SDXL branch. The prose style and `PROSE_SKILL` are removed from `prompt.ts`.
  `settings.ts`: background = SDXL wide row (default checkpoint, `no humans, scenery`), backend default still `st`
  (route A). The family pick reads `FAMILY_IDS`. A stored `flux-dev` family, a `/flux/i` checkpoint (purpose or
  character binding) or a `base: "flux"` LoRA falls back to the default and is recorded in `image.retired`, which
  sanitizes and persists. A chat override naming FLUX is cleared. New check `image-model-retired` (degrades, author,
  install, feature `images`) reads `snapshot.imageRetired` and names each row. The media plugin dropped `FluxGuidance`,
  `ConditioningZeroOut` and `EmptySD3LatentImage` (grep: no other graph uses them). Removed: `archiveFlux.mjs`,
  `flux-components.py`, `fluxComponents.test.mjs`, `fluxSpikeGraph(.test).mjs`, `verifyFluxWeights.py`,
  `candidateConfig.mjs`, `normalCandidate.mjs`, `customNodeCheck.mjs`, `scripts/debug/st-local-transport.mts`. Updated:
  `render-benchmark.mjs` (background = SDXL wide), the `footprints`/`scheduler` tests (fixture key `sdxl`) and the
  README. Plans 17/18/22/25 carry a one-line "superseded" note. `docs/guide` had no FLUX text.
- §B: the controller `/status` now carries `reserves` (`scripts/local/controller.mjs`). `gpuBrokerStatus` reads
  `reserveGpuMiB`/`reserveRamMiB`. `mayRetainBatch` (pure, `batchLease.ts`) retains only when the broker names both
  reserves and free memory covers them; a broker with no reserves never retains. The warm batch: `batchSlot.ts` holds
  the active batch (type-only import), `host.ts` reads the slot, and `start.tsx` loads `batchHost` only through
  `import()` inside `__SO_DEV__`. Guards: `devOnly.guard.test.ts` (no prod file statically imports
  `batchHost`/`batchLease`, plus a planted control) and `debugSurface.test.mjs` D3 (the prod `dist/` lacks the
  batch-lease marker, the dev bundle has it). GPU plugin: `brokerAddress(config)` in `managed.mjs` gives
  `listenHost`/`listenPort`/`controllerUrl` from `config.json`; `127.0.0.1:18888` is only the documented default,
  listen must be loopback (tests in `managed.test.mjs`, README updated).
- Gates: `npm run gates`, five runs. Run 1 was red on my guards (census row, session baseline `image.retired`, S4
  line budget for `buildRuntimeSnapshot`), all fixed; the `startupWiring.review` 5000 ms timeouts were CPU contention
  (green alone). Runs 2–4 were red on worktree setup: no `.st-root` (copied), no `node_modules` (junction to the main
  checkout), and one `so-run-header` read of `dist/manifest.json` racing the concurrent `build` phase (green alone).
  Run 5: every step green except `test-storybook:ci`: the build ran, but the runner found **0 stories from the
  worktree path** (jest rootDir resolved to the main checkout). Then `npm run gates -- --no-storybook`: **all green in
  369.3 s, Storybook skipped**: jest 6,421 passed / 1 skipped; test:plugin 105 / 3 skipped; test:debug 1,036 / 0 fail;
  test:release 96 / 2 skipped; defect replay 32 of 32 killed.
- Prod: `npm run build` (exit 0, flavour prod) then `npm run test:release` (96 pass, D3 ok). `dist/`: no
  `FluxGuidance`/`EmptySD3LatentImage`/`ConditioningZeroOut`/`flux1-dev`/prose skill; batch-lease marker in 0 prod
  files and 1 dev file. "flux" remains in `dist/index.js` only in the retired-choice recogniser (`["flux-dev"]`,
  `/flux/i`, LoRA `base === "flux"`) and the Repair row's copy, by design.
- Live gate not run (no ST assumed). The "seeded install with `flux-dev` stored shows the Repair row" gate is
  proven in jest only (`image.test.ts` + `checksRegistry.test.ts`), not live. `npm run gates` ×2 for §A/§B is not done.
- Deviations: `customNodeCheck.mjs` removed (plan-25 env check, FLUX-named). `gguf.mjs`/`gguf.test.mjs` kept
  (`models.mjs` sizes GGUF text models with it). Plan 32 R4's "managed with no `controllerUrl` refused at init" is
  not built; per the brief the default stays documented, and the refusal is left to plan 32 W4. The media plugin's
  `8188` fallback is unchanged.

## Decided (user, 2026-10-07)

"Go with the recommendations": every decision in §Decisions above takes its **Recommended** answer.
