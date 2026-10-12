# Full-screen workspace and layered feature configuration

Owner-approved design: 2026-10-11. Branch `v2.8-ui-rework`. Status: IN BUILD.

## Contract

- Story editing lives in Studio. Playing preferences change only this chat.
- Install master-off wins; otherwise chat override, story policy, install default.
- Device preferences cover display and motion only, keyed by account.
- A chat can re-enable a story decline, with a warning.
- Story files retain authored content in their existing fields; `features` contains switches and policies.
- Thinking and private inner voice remain enabled by default.
- One full-screen workspace: Story and Orchestrator. Full mobile Studio.
- Campaign review is private; public records contain counts only.

## Implemented

- Feature schema, validation, compatible policy diffs, resolver and chat persistence.
- Account-keyed device display preferences.
- Lazy native-dialog workspace, section navigation, feature controls and source/reset rows.
- Install launcher, HUD and drawer routing into the workspace.
- Studio feature authoring and wizard `setFeatures` tool.
- Studio task navigation: setup, flow, state/rules, characters, world, presentation, features, assistant, validation.
- Mobile graph checkpoint sheets and pointer-selected transition endpoints.
- Reply-thinking chat budgets, feature-specific status/judge checks, review and advanced links.
- Mobile checkpoint/transition drill-down, blackboard cards with evidence details, graph long-press actions.
- Setting/action ownership inventory: `ui-setting-placement.md`.
- Removed install-owned character looks and duplicated overview preference controls.
- Guide generation, selector routing, Storybook coverage and browser check scripts.

## Remaining scope

- Campaign real-model session, archived evidence, final full gates and final integration.

## Gate record — 2026-10-12, intermediate

- GPU use authorized by owner. Artemis loaded through `node scripts/local/cli.mjs load`; initial residency refusal, subsequent load exit 0.
- Lane 38: isolated ST code tree `C:\dev\st-ui-rework`, data root `C:\dev\so-ui-rework-lanes`; local-controller access allowed; images disabled.
- `npm run build`: exit 0; main bundle remains below 1,300,000 B.
- `npm run stage`: 172 files staged into isolated ST only.
- `npm run test-storybook:ci`: 130 suites, 785 tests passed before the subsequent Studio task-navigation edits.
- `npx jest src/features/showMeTargets.test.ts src/studio/arrivalEquivalence.test.ts src/studio/coverage.test.ts src/copilot/guideCoverage.test.ts --runInBand`: 4 suites, 16 tests passed.
- `SO_LANES_ROOT=C:\dev\so-ui-rework-lanes ST_DEBUG_PROFILE="Story Orchestrator Memory Unsloth" node scripts/debug/st-lanes.mts run 38 --evidence -- scripts/debug/so-scenario.mts run test/scenarios/live-ui-rework.json --sandbox --group 1759606632088`: 9/9 steps passed, exit 0; real visible reply, read response/audit, boundary, authored-policy isolation and chat re-enable warning verified; inner voice enabled. Sandbox and library cleanup passed.
- Real-model evidence: lane `38/debug/runs/2026-10-12T06-13-57-020Z-so-scenario-run/`; optional media/harness/GPU capability endpoints returned 404, recorded separately.
- Desktop `so-workspace-check.mts`: exit 0; decline/re-enable, reset, browser Back, install propagation and source chips verified; sandbox cleanup passed.
- Initial mobile control check passed; Studio entry was intercepted by the deferred briefing. Harness now acknowledges its Begin button before Studio entry. Mobile graph gate still pending at this record.
- Earlier quick/full gates were red on stale mocks, guide reference drift, selector matching and Storybook worktree discovery. Fixes landed; latest full run pending. No final sign-off, extension commit or merge.
- Subsequent full run: Storybook 130 suites/785 tests green; source gate failed on one newly long Studio tab-union line. Wrapped the line; full rerun in progress.
- `npm run build` after task-navigation and policy-label corrections: exit 0; `npm run debug:typecheck`: exit 0.
- Player-clean sweep passed across 4 navigation pages and 145 forbidden selectors. Replaced the curator model-route jargon with its public feature label; no private review content was shown.
- CDP reports `page.viewportSize()` as null for an already-sized window. Browser gate now measures `innerWidth`/`innerHeight` before selecting mobile graph coverage; prior control-only pass does not claim graph coverage.
- Application labels now distinguish curator preview-only from actual off modes and device motion-off choices.
- Subsequent full run passed source tests, build and Storybook, then failed `test:debug`: five planted-DOM tests lacked new workspace locator/runtime methods; one settings-refresh test only inspected `runtimeManager.ts` after setters moved to `settingsDelegates.ts`. Updated those test doubles and the inherited-method check.
- `node --test scripts/debug/so-ui.test.mts scripts/debug/lib/sessionSetting.test.mts`: 36 tests passed, exit 0. Full gate rerun pending.
- `git diff --check`: exit 0. Changed source files normalized to CRLF.
- Mobile graph check: checkpoint sheet opened; transition pointer selection not yet green. Failed-run cleanup now closes Studio and answers draft-discard before removing owned fixture state. Failure evidence includes screenshot and graph geometry.
- `npm run gates -- --jobs=2`: all 11 gates green, exit 0, 228.9 s; includes Storybook. Subsequent scope changes require new checks.
- Added reply-thinking feature/chat controls with install master-off and checkpoint/story/chat precedence; thinking remains on at its existing medium default.
- Removed `image.characters` from install settings, sanitization, routing and UI. Story appearances remain authored in Studio. Removed keys have no migration or alias.
- Focused thinking/resolution/image checks: 5 suites, 82 tests passed, exit 0.
- Graph hit testing refreshes Cytoscape's cached container position before mouse/touch input; fixes coordinates after the connection-status line moves the canvas. Added long-press checkpoint actions.
- Mobile save blocker was an intermediate checkpoint without a reachable anchor; the browser fixture now authors its terminal checkpoint as an anchor before saving.
- `npm run gates:quick`: green, exit 0; 492 suites/6,263 tests passed; all 32 defect replays killed. Subsequent full gate: all 11 checks green, 218.1 s, Storybook included.
- Latest isolated mobile check: exit 0, 390×844; checkpoint editing, pointer endpoint selection, library save and current-chat graph application all passed. Player-clean: 4 pages, 145 selectors; owned sandbox cleanup verified. Evidence `38/debug/runs/2026-10-12T07-22-32-799Z-so-workspace-check/`.
- Real-model fixture now also checks low-effort chat budget reaching the actual generation: 11/11 steps passed, exit 0; 128-token budget recorded, authored policy isolated, reply/read/audit/boundary and cleanup passed. Evidence `38/debug/runs/2026-10-12T07-24-02-485Z-so-scenario-run/`.
- Private campaign policy branch fast-forwarded; 9 stories and 8 lab copies carry the illustration automation policy. Public pin bumped to `ecccdb781d0dc1a43c443e55ed911e126fe479a1`; isolated installer exit 0. Campaign live review delegated privately; counts-only report pending.
- Owner explicitly authorized main-ST staging after final gates.
- Two earlier red gate runs were my own overlap of `gates` and `gates:quick` sharing the defect-replay temp copy; later runs were alone.
- Pin bump needed `node scripts/debug/so-session.mts index` (story index, charters, cards doc) and the frozen commit in `test/measurements/v2.6-09/runs.json`; `test:debug` had failed two tests until then.
- Final `npm run gates -- --jobs=2` (run alone): all 11 gates green, exit 0, 200.9 s, Storybook 130 suites/785 tests included.
- Final build staged into isolated ST only: mobile 390×844 workspace check exit 0 (now includes right-click checkpoint actions), desktop workspace check exit 0, real-model fixture 11/11 exit 0. Evidence `38/debug/runs/2026-10-12T07-4*`.
- Evidence archived to the private sessions repo: label `ui-rework-2026-10-12`, 170 files, 18 MB (`--allow-incomplete`: the only verdict miss was the placeholder pod argument; no pod existed).
- Not run: real-model Adolion campaign session (delegated reviewer hit a usage limit); campaign adoption is covered by the campaign's own checks (94 harness cases, 0/12 failing labs) and the pinned-index/charter tests. Touch long-press (`taphold`) is wired but only right-click was exercised.
