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

## Gate record (live re-measure) — 2026-10-01, lane 4, branch `v26-judge-remeasure`

Lane 4 (adolion-fresh seed, no chat open, images/sprites off, ComfyUI never contacted), judge plugin 1.3.0
(`keySource: dotenv`), every judge run on dev bundle `6f56533e8608` (master `747561fd`), model `jev-1.13.0`
(`modelVerdict: matched` on every run), page reloaded before each use. The staged bundle moved to
`ceb15ac19ec0` at 11:27:36Z, after the last judge run (11:21:32Z) and the curator suite (11:26:48Z); only the
authoring runs ran on it. Evidence: `test/measurements/v2.6-15-judge/` (`summary.json`, run headers; raw logs
and per-run evidence under `raw/`, gitignored).

### Judge, one `so-judge calibrate` per use

| Readiness key(s) | Use | Right/rows | Families vs floor | p50 ms | Verdict |
|---|---|---|---|---|---|
| `stallCheck` | stall | 84/84 | direct 27/27, kept 57/57 | 243 | on |
| `memoryVerify` | memory-verify | 35/36 (0.972 ≥ 0.85) | — | 236 | on |
| `warden` | continuity | 65/67 | reply 22/23, broken 11/12, consistent 32/32 | 247 | on |
| `expansionCritic` | critic | 134/136 | verdict 34/34, contradicts 33/34, advances 33/34, newCharacter 34/34 | 245 | on |
| `expansionLookahead`, `lookahead` | variants | 16/16 | pick 8/8, rejected 8/8 | 270 | on |
| `curatorFilter` | curator-filter | 16/18 | recall 10/10 (narrowed 6/8, floor 0) | 281 | on |
| `typedExtraction` | typed | 107/129 | answered 53/54 (coverage 54/75, floor 0) | 260 | on |
| `memoryPairs` | memory-pairs | 27/29 (0.931 ≥ 0.85) | — | 254 | on |
| `sceneTrigger`, `sceneTracker` | scene (`--chunk 40`) | 207/214 | present 66/70, location 24/26, time 26/26, heading 51/52, break 22/22, nobreak 18/18 | 243 | on |
| `director` | director | 22/25 (0.88 ≥ 0.85) | — | 245 | on |
| `agencyCheck` | agency | 41/41 | writes 18/18, clean 23/23 | 241 | on |
| `houseRules` | house-rules | 79/80 | broken 15/15, kept 11/11, untouched 53/54 | 235 | on |
| `loreSelect` | lore | 52/58 | recall 26/30, precision 26/28 | 291 | on |
| (spike) | warden-lore | 60/60 | contradicts 14/14, consistent 15/15, untouched 31/31 | 233 | at floor; stays unbuilt until the lead decides |

Every use is at or above its predeclared floor, so **no use goes off by default**: `defaultJudgeUses()` and
`stagecraft.wardenEnabled` are unchanged and no off-by-default list was added. `JUDGE_READINESS` carries the new
rate and p50 per key and `MEASURED_FIXTURE_REVISION` equals `JUDGE_FIXTURE_REVISION` for all 15 keys, so every
row reads `measured`. p50 fell from 500–1500 ms to 235–291 ms on every use (same model, same plugin path;
cause not investigated, the rates do not depend on it). The warden-lore facts arm (optional, 26 calls) was
not run.

Scene replay golden: `calibrate-node.mts scene --record` re-recorded `test/goldens/judge/scene.json` (66 calls,
206/214; present 66/70, location 24/26, time 26/26, heading 50/52, break 22/22, nobreak 18/18), so R22–R31 are
covered and `scene.test.ts` holds every family at its floor with no unanswered rows.

### No TypeSafe calls (DeepSeek, `deepseek 4.1 flash`, the lane's role map)

- Curator create (F5): `so-curator-suite run --expect-count 22 --record`: propose 0.909 (floor 0.90), **none
  0.788 (floor 1.00)**: NOT BUILT. Misses: p04 0/3 (no create), n01 0/3 and n12 0/3 (named-once, created),
  n16 2/3 (roster). Model alone: proposeCreated 0.909, noneCreated 0.212. The 22 goldens replay in jest.
- Authoring + hold-out: arms `shared-ceb15ac19ec0-r1` (validity 12/12, opShape 12/12, firstTry 8/12) and `-r2`
  (11/12, 11/12, firstTry 9/12; a06 failed after its repair), hold-out 5/5 validity and opShape in both;
  `verdict` = **recommended** ("both runs meet every floor and every hold-out row").

### Call counts

- TypeSafe: 412 measured page calls + 66 off-page (scene golden) = 478 as planned, plus **~72 discarded**: the
  first pass ran the uses back to back and overran the plugin's 60 calls/min/user limit. Calls past the limit
  were refused locally (`fallback=busy`, never sent upstream), but 72 answered before the refusals began, in
  continuity (4), typed (33) and agency (35). Those runs and their goldens were thrown away and re-run 65 s
  apart. **Total ≈ 550.**
- DeepSeek: curator 66 (22 × 3) + authoring 46 (17 cases × 2 runs + 12 repair passes) = **112**.

### Harness fixes found by the run

- `so-judge calibrate --chunk <rows>` (slices 61 s apart, merged; p50 = median of the first answered row per
  case) and a refusal to record any run with a `busy` row (`scripts/debug/lib/calibrationChunks.mts` + node test).
- `scripts/spike/typesafe/calibrate-node.mts` imported its calibrations from `@judge/index`, which stopped
  re-exporting them in v2.5 plan 12 (`@judge/calibration`), and its in-process plugin could not resolve the key
  (accounts read as on off-page): every row `fallback=error`, and `--record` wrote an EMPTY golden. Now imports
  both barrels, builds the handler with `accountsEnabled: false`, paces at ≤ 2 in flight and ≤ 60/min, and
  refuses to record zero answers.
- `so-role-calibration` reads `dist/manifest.json` of the checkout; a fresh worktree has none (ENOENT before any
  call). The staged manifest was copied into the worktree's ignored `dist/`.

### Gates

`npm run gates -- --no-storybook`: all green. typecheck, typecheck:test, lint; test (400 suites passed, 1
skipped; 5 212 passed, 1 skipped); build; build:dev; test:debug (740 pass); test:release (92: 90 pass, 2
skipped); test:replay (30 of 30 killed); test:plugin (76: 73 pass, 3 skipped). **Storybook not run**: it cannot
find stories from a worktree.

`so-run-header diff` against `run-header-start.json`: 15 blocking paths, all `build.*`/`bundle.served.*` (the
staged-bundle swap and the worktree's copied manifest); no settings, profile, judge or inventory drift.

## Gate record (house rules on the new Adolion wording) — 2026-10-01, branch `v26-houserules-remeasure`

Why: the campaign (`adolion-campaign` `b8d2a2b`) reworded the saga's house rules (rule 2 `The player's
choices belong to the player` -> `{{user}}'s choices belong to {{user}}`, rule 7 `the players` -> `the
party`). The warden quotes `story.house_rules` verbatim (`runtime/continuity.ts:85`), so it asks the
judge about the literal `{{user}}`. The readiness fixture `house-rules.json` (generic objective rules)
does not mirror the campaign and its revision did not move; the campaign lab
`lab/judge/house-rules-adolion.json` (25 cases x 8 rules = 200 rows, already on the new wording, labels
from 2026-09-27, never measured live before) is the measurement that does. It is copied verbatim to
`test/fixtures/judge/adolion-house-rules.json` and the `houseRules` readiness row is now bound to it
(`FIXTURE_OF`, `JUDGE_FIXTURE_REVISION` = `MEASURED_FIXTURE_REVISION` = `bcaa55db4856`).

Off-page, no lane, no ST: `node --no-warnings --experimental-transform-types
scripts/spike/typesafe/calibrate-node.mts house-rules --fixture adolion-house-rules --record` (plugin
handler in-process, key from `~/.typesafe/api-key/.env`, paced <= 2 in flight / <= 60 per min).
**25 TypeSafe calls**, model `jev-1.13.0`, no fallback, no busy row.

| Family | Right/rows | Floor | |
|---|---|---|---|
| broken | 12/18 (0.667) | 0.85 | FAIL |
| kept | 10/10 | 0.95 | ok |
| untouched | 165/172 (0.959) | 0.966 | FAIL |
| overall | 187/200 (0.935), p50 257 ms | | |

Misses by rule: rule 6 (world-book consistency; the warden never sees the world book) broken 0/3; rule 3
(two to four paragraphs) broken 0/2 (p 0.60, 0.46); rule 2 (`{{user}}`) broken 1/2 missed at p 0.69 (flag at
0.70). The 7 untouched false alarms: rule 1 x3 (who writes a member's words, p 0.72-0.82), rule 7
(secrets) x2, rule 4 (mystery pacing) x1, rule 2 x1 (AH34, p 0.79).
Most misses sit on the judgement rules the lab README already names (0, 1, 4, 7 need the scene) and on
rule 6, which needs data the warden is not given.

Verdict per "Below floor" above: **`houseRules` off by default** (`JUDGE_USES_OFF_BY_DEFAULT` read by
`defaultJudgeUses()`, `src/judge/settings.ts`; a stored install keeps its value), readiness rate 0.935 /
p50 257 with `passed: false` (an install that turns it on reads `unproven`, `calibrationProblem: failed`),
recommendation and README row rewritten. Floors not retuned. The generic objective-rule fixture
(`house-rules.json`, 79/80) still replays at its floors in `warden.test.ts`; the Adolion golden replays
to its recorded below-floor score (`test/goldens/judge/adolion-house-rules.json`,
`adolion-house-rules.calibration.json`). For the campaign: rules 3 and 6 are not checkable from the reply
alone at the floor; an objective-only rule set would need its own measurement before turning the use back on.
