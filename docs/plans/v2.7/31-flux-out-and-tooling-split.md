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
