# v3.0 24: main bundle headroom

Goal: main `dist/index.js` at or under 1,260,000 B (40 KB headroom under the 1,300,000 B budget) without raising the budget. Branch `v3.0-bundle-headroom`, worktree `C:\dev\so-bundle`, code commit `7bf48a00`.

Result: 1,298,651 B (master `21a037f9`) -> **1,254,258 B**, headroom 45,742 B.

Method: production build with module concatenation off and full stats, each main-chunk module terser-minified alone for a per-module estimate, then a reachability simulation (cut a node or edge, see what leaves the main chunk) to rank candidates. Bytes below are measured on the real build after each move.

## Moves

- **Shared read and memory pass prompts (-23,052 B).** `extraction/sharedReadEntry.ts` holds `sharedReadWindow`, `transcriptPrefixCost` and an async `runSharedRead` that imports `extraction/sharedRead` on call; scheduler, extraction and memory coordinators and `backlogPlan` import the entry. `extraction/question.ts` takes `PLAYER_MARK`, the evidence rules, `STEP_READ_HEADER`, `renderQuestion`, `runningTotalRule` (re-exported by `contract.ts`) for the scope budget and evidence matcher. `memory/contractKit.ts` `loadMemoryContract()` (cached, cleared on failure) loads the pass prompts for scene summary, short-term compaction, epistemic/ledger pass and arc summary; each pass mints its `RunToken` before that await, so a chat switch during the load is still caught. Barrels drop `export * from "./contract"` (memory, extraction) and `"./sharedRead"` (extraction); `liveSuite`/`memorizeBacklog` import `@extraction/sharedRead` directly. Default before load: none needed, every caller is already async and awaits the chunk.
- **Judge use copy (-6,907 B).** `judge/settings.ts` keeps `JUDGE_USE_LABELS` (what the setup checks need); descriptions and "sends" text move to `judge/useCopy.ts` (`JUDGE_USE_COPY`, built from labels + details), imported only by the judge settings group, feature pages, feature registry and settings reference (all lazy). Default: n/a, no main-entry reader.
- **Floating panel host (-6,826 B).** `components/panels/PanelsHost.tsx` (lazy) holds the panel frame, geometry, panel store and panel bodies; `presenceUi.tsx` keeps the open-panel store, launchers, wand and badges and mounts `PanelsGate`, which renders nothing until a panel is open. Default before load: no panel shown (`fallback={null}`); bodies were already lazy, so the frame now appears with its body instead of a beat before it.
- **Visual manifest helpers (-2,580 B).** `sprites/visualSources.ts` holds the manifest types and the `visualSources` sanitizer the settings model needs; `visualManifest.ts` keeps look choice/publish/head helpers (sprite chunks only) and re-exports the rest. Pure move.
- **Wizard provisioning (-5,028 B).** `runtime/copilotProvisioning.ts` (lazy) holds `applyProvisioning`, `recheckCreatedCard` and the created-asset ledger writes; `CopilotCoordinator` keeps the environment, sessions, nudge and driver context and delegates in one line. `wizard/sessionKey.ts` takes `wizardSessionKey` so `wizard/interview.ts` leaves the main entry. Default: n/a, both entry points were already async.

## Guards and ledgers

- `lazyHarness.guard.test.ts`: `LAZY_HEADROOM_V30` (11 modules) not statically reachable from `src/index.tsx`, reachable dynamically; planted control re-exports `./sharedRead` from the extraction barrel and is reached.
- `architecture.test.ts`: `PanelsHost.tsx` added to the presence UI list (payload invariance).
- `ownership-sites.json`, `lorebook-writers.json`, `errorCopy.json`: copilot rows rekeyed to `copilotProvisioning.ts`, `visualPath` to `visualSources.ts`; `passProfiles.test.ts` call-site census lists `sharedReadEntry.ts`.
- Coordinator line budget held (memory coordinator at 560).

## Gate record (2026-10-27)

- `npm run gates:quick`: first RED (lint max-len, two lines), then green (typecheck, typecheck:test, lint, jest related, replay --cached).
- `npm run gates` run 1: RED. `test`: `passProfiles` call-site census and `lorebookWriters` census rows (real, fixed); `test-storybook:ci`: EADDRINUSE 6006, port held by a peer worktree's Storybook gate (`C:\dev\so-hookswipe`), not killed.
- After fixes, `npx jest`: 920 suites passed, 1 skipped; 10,658 tests passed.
- `npm run gates` run 2 (no --resume): RED at `test:plugin` only: `not ok 46 - a reserve miss first asks the idle owned ComfyUI to free its models and counts it only when the reserve clears` (gpu broker, untouched by this change; passed in run 1 and standalone `npm run test:plugin` 418/418). Load flake.
- `npm run gates` run 3 (no --resume): **green**, all 11 steps ok including `test-storybook:ci` and `test:release`; main bundle 1,254,258 B.

## Live checks owed (not run: no lanes/staging in this task)

- First extraction read, scene summary, short-term compaction and epistemic/ledger pass after a page load each fetch a chunk before the model call; check one real-LLM turn reads and writes as before.
- Floating panels: open Help, guide (from a guide link), journal, stat sheet, a widget; mobile dock under 768px.
- Wizard: apply a provisioning card (card, lorebook, grant, entry, group).

## Live gate (2026-10-27, merge branch)

- Branch `v3.0-merge-hs-bh` (worktree `C:\dev\so-mergehb`, HEAD `ed58d2aa` = these moves + the plan 19 hook swipe fix on master `722328c6`), served in candidate mode to model lane 34 (adolion-fresh, local controller Artemis 31B v1.1, `--allow-local`) and no-model lane 33; in-page `dist/index.js` sha256 `d2726c2ab427` (worktree manifest), 0 chunk 404s, nothing staged into ST, lane 0 untouched.
- Passes after a page load (real model, no `debugResponse`): first page after reload ran the shared read, scene summary, epistemic and ledger passes, all `ok`; after a second reload one turn: resumed read and cadence read audited with prompt + raw answer, memory entries 8 -> 11; five more turns: short-term compaction landed (`shortTermSummaryEnd` -1 -> 13). Note: the chunk holding the read/memory pass prompts (`9198.index.js`) is fetched in the boot wave (about 65 chunks at load), not at first use, so main is smaller but those bytes still load at startup.
- Floating panels (desktop 1898x926): Help and guide reader from Help's buttons (workspace closes first), journal, stat sheet and What could I do? from the wand, 5/5 open with a body, 0 page or console errors. At 390x844 (`ST_DEBUG_VIEWPORT`): 5/5 docked full width, bottom edge on `#form_sheld`'s top (748), only the last-opened panel shown.
- Wizard provisioning (agent, review mode, draft titled `SO-MHB Wizard`, opencode `openai/gpt-6.1-sol`): `agent-apply` created a character card, a lorebook and a lorebook entry (3 provisioning cards), edit cards accepted, agent finished; ledger session `so-mhb-wizard` held both assets. `so-assets remove --marker SO-MHB` deleted the card and the book and dropped the session; `assert-clean` exit 0.
- Harness note: `so-ui new-story-wizard` takes no title, so the Studio also kept a `draft-<id>` wizard session (applied 0) after the retitle; removed by hand, header diff then clean.
- Cleanup: run header diffs differ only in owned chats and the page's open chat (declared). Lanes stopped.
- Evidence: `C:/dev/so-lanes/34/debug/mergehb/` (`panels-*.log`, `wiz-*.log`, `assets-*.log`, `campaign/h-*`, `campaign/c*-turn.json`, `header-*`).
- Verdict: **green on the three risks checked** (passes load and land, panels open and dock, provisioning applies and cleans).

## Round 2 (2026-10-30, branch `v3.0-24-headroom-1031`)

Goal: at least 60 KB main headroom before the Player and Studio UI merges, budget unchanged. Method as above, plus a real per-module measure (minified build, concatenation off, module sizes read from the parsed `dist/index.js`).

Result: master `1af5cf89` 1,296,035 B -> **1,232,690 B** (-63,345 B), headroom 67,310 B. On the pre-Author base `75e9a5e4`: 1,295,296 -> 1,231,920 B.

Moves:
- **Story parser (-49,990 B).** `engine/storyParser.ts` is a port like `validate/gameLayer.ts`: `parseStory` delegates to the installed parser, else answers one `STORY_PARSER_LOADING` error; `loadStoryParser()` imports `engine/validate` (the 11 `validate/*` readers go with it). `index.tsx` starts the load before the stylesheet await and awaits it before `startRuntime()`, so it overlaps the existing boot awaits (no waterfall) and every runtime path (`storyLibrary`, `livingWiring`, `generation/merge`) stays synchronous after boot. No async step on a chat turn. Jest (`test/support/gameLayer.setup.ts`) and Storybook (`.storybook/preview.ts`) install the parser synchronously. Lazy code keeps importing `engine/validate` directly.
- **Media plugin probe (-6,473 B).** `stHost/capabilities.ts` image probe imports `./media` on call (the probe was already async; the module is otherwise only reached by lazy image/sprite chunks).
- **Feature control copy (-6,913 B).** `runtime/featureControlPaths.ts` holds `FEATURE_CONTROL_PATHS` (field + path), all `featureResolve` needs; `featureControls.ts` keeps names, areas, descriptions, labels (`FEATURE_COPY`, default labels for `enabled`/`acceptMode`) and builds `FEATURE_CONTROLS` from the paths. `featureControls.test.ts` pins path order and that every control has a label.

Guards: `LAZY_HEADROOM_V30` adds `stHost/media.ts` and `runtime/featureControls.ts`. `engine/validate.ts` is not listed: the guard's source graph follows the `engine/index` barrel's `export *`, which webpack's `sideEffects` pruning drops; the build size is the check there.

Remaining big candidates (not moved; inside files the UI branches own, or on a hot path):
- Check registry (`checksSetup` 17 KB, `checksExtensions` 6.5 KB, `checks`, `checksGame`, ~30 KB): in main only for `HudStrip`'s `setupCounts`/`setupAlert`; copy is woven into the findings. Needs a counts-only path for the HUD (drawer file).
- `index.tsx` (13.7 KB) mount glue: Studio/wizard/workspace host wiring could move to a lazy host module.
- `presenceUi.tsx` + `stHost/charListBadges.ts` (~8 KB).
- `runtime/journal.ts` (6.6 KB), `judge/readiness` + `judge/settings` + `judge/scene` (~16 KB): read by the snapshot every update, would need a split of copy from logic.

## Gate record (2026-10-30, round 2)

- `npm run gates:quick`: first RED (max-len in the two new tables, and the matching `codeHealth` S5 ratchet), then green.
- `npm run gates` run 1 (after merging master `1af5cf89`): RED at `test-storybook:ci` only, 8 Studio save plays (`StudioToolbar`, `StudioModal`): Storybook had no parser installed. Fixed in `.storybook/preview.ts`.
- `npm run test-storybook:ci` alone: 1120/1121, one `color-contrast` on `Studio/CharacterTutorial ReviewBlocksATakenName` (green in run 1 and run 2; flake).
- `npm run gates` run 2 (no --resume): **all green in 300.9 s**, 11 steps incl. `test-storybook:ci` and `test:release`; main 1,232,690 B.
- Live checks owed (no lanes in this task): one page load opens a chat with a pinned story (hydrate parses through the port), import a story, a living rebuild, Repair's image row on an install with only the media plugin, Features page and settings search labels.
