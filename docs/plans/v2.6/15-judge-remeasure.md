# v2.6 plan 15 — English judge re-measure (AS-16)

User decision 2026-10-01: re-measure in English. W25 removed the Spanish rows; this branch restores the
fixture sizes with new English cases (labelled before any model answer) and binds every displayed
readiness rate to the fixture revision it was measured on. Every published rate was measured on the
mixed-language fixtures, so after this branch **every measured use reads "needs re-measure"** in the
settings panel until the lead re-runs it below.

## What changed (no model calls)

| Item | Before (W25) | Now |
|---|---|---|
| `test/fixtures/judge/warden-lore.json` | 18 cases, 2 untouched | 26 cases (L27–L34 new), 4 untouched (L16, L17, L31, L32), new negation pair L27/L28 |
| `test/fixtures/curator-create/cases.json` | 13 cases (7 propose / 6 none) | 22 cases (11 / 11): p12–p15, n12–n16, every negative `why` covered again |
| `test/fixtures/role-calibration/authoring-holdout.json` | deleted | 5 English rows h06–h10 over two drafts that live in the hold-out file (no fixture case uses them), labelled 2026-10-01 |
| `test/fixtures/judge/scene.json` `present` | 40 labels | 70 labels (42 present / 28 absent): R22–R31, `addedAt: 2026-10-01` |
| `so-role-calibration` | hold-out optional when the file is missing | hold-out required: a missing file throws ("authoring gate is blocked"), an authoring verdict without hold-out scores is `incomplete` |
| `src/judge/readiness.ts` | rates shown as current | `JUDGE_FIXTURE_REVISION` (current) vs each fact's `fixtureRevision` (measured); a mismatch reads `unproven` + `fixtureStale`, panel text "needs re-measure" |

Revision = first 12 hex of sha256 over `JSON.stringify(JSON.parse(<fixture file>))`. The measured
revisions in `MEASURED_FIXTURE_REVISION` are the pre-W25 files (`e87d861e~1`). `readiness.test.ts`
recomputes every current revision from the fixture bytes, so editing a fixture without bumping
`JUDGE_FIXTURE_REVISION` fails jest.

Scene replay: the jest replay golden (`test/goldens/judge/scene.json`, recorded 2026-09-19) predates
R22–R31. `scene.test.ts` scores only rows the golden covers and requires the rows added after it
(`addedAt` > golden `recordedAt`) to be the only unanswered ones. Re-recording the golden (below)
makes them covered, and from then on they must be answered and at the floor.

## Before the run

```bash
npm run build:dev && npm run stage -- --flavor dev
node scripts/debug/st-session.mts reload
node scripts/debug/so-judge.mts status
node scripts/debug/so-run-header.mts capture --label as16-remeasure
```

The plugin must hold a TypeSafe key. Reload the page between two runs of the same use: the judge
caches answers per page, and a cached answer is no measurement. Model: `jev-1.13.0`
(`--model jev-1.13.0`, so a floating alias cannot move the measurement).

## Commands, one per use

TypeSafe calls = requests the runner sends for the current fixture (counted with a stub over
`createJudgeHarness().calibrate`, 2026-10-01; one request per row except memory-verify, which
groups lines per transcript, and variants, which asks once per chain).

| Readiness key(s) | Command | TypeSafe calls | Floor (predeclared, never retuned) |
|---|---|---|---|
| `stallCheck` | `node scripts/debug/so-judge.mts calibrate --use stall --model jev-1.13.0 --record` | 47 | direct 1.00, kept 1.00 |
| `memoryVerify` | `node scripts/debug/so-judge.mts calibrate --use memory-verify --model jev-1.13.0 --min 0.85 --record` | 9 | overall ≥ 0.85 |
| `warden` | `node scripts/debug/so-judge.mts calibrate --use continuity --model jev-1.13.0 --record` | 23 | reply 0.90, broken 0.85, consistent 0.966 |
| `expansionCritic` | `node scripts/debug/so-judge.mts calibrate --use critic --model jev-1.13.0 --record` | 34 | verdict 1.00, contradicts 0.90, advances 0.90, newCharacter 0.90 |
| `expansionLookahead`, `lookahead` | `node scripts/debug/so-judge.mts calibrate --use variants --model jev-1.13.0 --record` | 24 | pick 0.80, rejected 1.00 |
| `curatorFilter` | `node scripts/debug/so-judge.mts calibrate --use curator-filter --model jev-1.13.0 --record` | 3 | recall 0.90 |
| `typedExtraction` | `node scripts/debug/so-judge.mts calibrate --use typed --model jev-1.13.0 --record` | 54 | answered 0.95 |
| `memoryPairs` | `node scripts/debug/so-judge.mts calibrate --use memory-pairs --model jev-1.13.0 --min 0.85 --record` | 29 | overall ≥ 0.85 |
| `sceneTrigger`, `sceneTracker` | `node scripts/debug/so-judge.mts calibrate --use scene --model jev-1.13.0 --record` then `node --no-warnings --experimental-transform-types scripts/spike/typesafe/calibrate-node.mts scene --record` (re-records the jest replay golden with R22–R31) | 66 + 66 = 132 | present 0.90, location 0.85, time 0.80, heading 0.85, break 0.50, nobreak 1.00 |
| `director` | `node scripts/debug/so-judge.mts calibrate --use director --model jev-1.13.0 --min 0.85 --record` | 25 | overall ≥ 0.85 (role floor 22/25 is the separate LLM-director comparison) |
| `agencyCheck` | `node scripts/debug/so-judge.mts calibrate --use agency --model jev-1.13.0 --record` | 41 | writes 0.85, clean 0.95 |
| `houseRules` | `node scripts/debug/so-judge.mts calibrate --use house-rules --model jev-1.13.0 --record` | 20 | broken 0.85, kept 0.95, untouched 0.966 |
| `loreSelect` | `node scripts/debug/so-judge.mts calibrate --use lore --model jev-1.13.0 --record` | 11 | recall 0.80, precision 0.70 |
| warden lore family (L7 Phase A, not a readiness row) | `node scripts/debug/so-judge.mts calibrate --use warden-lore --model jev-1.13.0 --record` | 26 (+26 for the R3 facts arm, `--use warden-lore-facts`) | contradicts 0.85, consistent 0.966, untouched 0.966 |

Total: 412 TypeSafe calls through the page, plus 66 off-page for the scene replay golden (478), plus 26
if the warden-lore facts arm is run (504).

No TypeSafe calls (LLM role/curator model, run on the dev lane's profile):

| Use | Command | Model calls | Floor |
|---|---|---|---|
| curator create (F5) | `node scripts/debug/so-curator-suite.mts run --expect-count 22 --record` | 22 × 3 samples = 66 | propose ≥ 0.90 of samples, none = 1.00 |
| authoring role + hold-out | `node scripts/debug/so-role-calibration.mts run --role authoring --holdout --arm shared-<bundle>-r1 --expect-count 12 --record`, again with `-r2`, then `node scripts/debug/so-role-calibration.mts verdict test/goldens/live/role-calibration/authoring-shared-<bundle>-r1.json test/goldens/live/role-calibration/authoring-shared-<bundle>-r2.json` | (12 + 5) × 2 runs = 34, up to 68 with the one repair pass | validity 0.90, opShape 0.80; any hold-out miss = "fixture floors met; generalisation not shown" |

## After each use

At or above floor:

1. Copy rate and p50 from the new `test/goldens/judge/<use>.calibration.json` into
   `JUDGE_READINESS[key]` (`calibration`, `latencyP50Ms`, `measuredOn`).
2. Set `MEASURED_FIXTURE_REVISION[key]` to `JUDGE_FIXTURE_REVISION[key]`. The row then reads
   `measured`. If AS-4 has moved readiness to provider × model × use keys, the `fixtureRevision`
   field travels with the fact under that key.

Below floor (any family):

1. The use goes **off by default**: add its key to an off-by-default list read by
   `defaultJudgeUses()` in `src/judge/settings.ts` (today every key defaults to `true`). An install
   that already stored the use keeps its stored value. For the warden itself, the default is
   `stagecraft.wardenEnabled` in `src/runtime/settingsModel.ts`.
2. Record the new rate anyway (steps 1–2 above) and rewrite the readiness `recommendation` to say
   so: "Below its floor on the English re-measure (2026-10-xx, <family> <right>/<total> vs <floor>):
   off by default." Update the README "Judge recommended configuration" row.
3. For the scene golden: if `present` (or any family) misses, the jest replay test fails on the
   re-recorded golden. Change that assertion to the measured miss and say why, as with any other
   recorded below-floor family; do not retune the floor.
4. Warden-lore and curator-create are unbuilt spikes: below floor means they stay unbuilt (no
   default to flip). Authoring below floor or with a hold-out miss means the authoring route is not
   recommended; record the verdict in the plan 15 gate record.

Close with `node scripts/debug/so-run-header.mts diff <capture>` and the plan's overall gates.

## Gate record — fixtures, hold-out, readiness revision (2026-10-01, master merged at `ec5083e9`)

No model calls, no lanes. Size/balance tests fail on the W25 fixtures (checked by restoring them from
HEAD: warden-lore, curator-create, scene `present` power and the readiness revision test all failed,
4 of 43), and pass on the new ones.

- `npm run typecheck` 0; `npm run typecheck:test` 0; `npm run lint` 0
- `npm test` 0 (382 suites passed, 1 skipped; 4 995 passed, 1 skipped)
- `npm run build` 0, `npm run build:dev` 0
- `npm run test:debug` 0 (537 pass; needs `dist/` built first)
- `npm run test:release` 0 from Git Bash (77 pass, 2 skipped)
- `npm run test:replay` 0 (30 of 30 killed)
- Storybook not run: `JudgeSettingsGroup.stories.tsx` readiness stories updated to the stale state
  (`ReadinessSilentWhenEverythingIsMeasured` became `ReadinessSaysARateNeedsReMeasure`).

Coordination with AS-4 (readiness keyed provider × model × use): the change in `readiness.ts` is
additive. `fixtureRevision` is an optional field on `JudgeReadinessFact`; `JUDGE_FIXTURE_REVISION`
and `MEASURED_FIXTURE_REVISION` are separate maps merged into the typesafe facts, and
`fixtureStale()` runs after the model check in `judgeReadiness()`; `extra.fixtureRevisions`
overrides the current map (tests use it as "re-measured"). Rebased keying only needs to carry the
field with the fact.
