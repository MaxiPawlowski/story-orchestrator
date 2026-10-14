# Plan 40 — Build-now pass without GPU or authoring-model calls

## Authority and scope

Owner approved 2026-10-12: build every feasible piece; dependent acceptance can wait. Continued 2026-10-13.
This is the in-repo execution index for the approved external `v28-no-3090-closeout.md` plan.
Individual source plans keep their designs, floors and gate records. Latest records win over historical status prose.

- No 3090, pod, ComfyUI renders, downloads, Artemis, Sol or DeepSeek calls. No laptop check.
- TypeSafe allowed: at most 300 calls per task, counted and reported.
- Thinking, inner voice, feature defaults and predeclared floors stay as approved.
- Synthetic fixtures only in this public repo. Campaign content/evidence stays private; owner reports use counts.
- Isolated ST code copy and lanes 30+; never owner ST or lane 0. Installation waits until the owner is not playing.
- Model-consuming changes may be built deterministically; their real-model acceptance remains explicitly deferred.
- Dirty worktrees remain untouched. No new owner play flags.

## Execution order and progress

### 1. Inventory and status reconciliation

Source: [queue](32-queue.md), [handoff](37-codex-handoff.md), [coverage](35-test-coverage.md), [overview](00-overview.md).

- Completed initial branch/content inventory and status corrections with `50bcbc2b`.
- Confirmed local judge code on master despite branch-tip ancestry; SP5.b promoted without its dev flag; docs review merged.
- Preserve four dirty worktrees; counts recorded in [plan 25](25-tunnelvision-report.md) §Build-now inventory record.
- Open: remaining stale queue rows and runner inventory. Keep failed measurements recorded.

### 2. Correctness fixes

- **Lore-select eligibility**, [34](34-lorebook-features.md): drafted avatar/filename and tags, include/exclude semantics,
  changed-member cache and in-flight controls. Implemented in `8c3b938a`, full deterministic gates green; scripted-judge
  browser scenario green twice on lane 38 with clean header diff. Real TypeSafe leg still owed.
- **A21 swipe during a read**, [25](25-tunnelvision-report.md): regression through real manager, turn bridge,
  ownership and extraction coordinator. New scripted test passes 2/2; quick gate green, full gate running; no product fix needed.
- **A20 requirements refresh**, [25](25-tunnelvision-report.md): first reproduce through ST create/import UI;
  reproduced missing effect hydration through the native create routine; host-list observer implemented. Create/hydrate/delete/import
  scenario green twice on lane 38, quick gate green and evidence archived. UI-pointer/chat-switch checks still owed.
- **Harness auth**, [33](33-pose-library-and-avatars.md), [36](36-live-head.md): supported OpenCode client/session
  interface, fake-server/plugin tests, useful expired-login UI. Sonnet implementation active on `v2.8-build-harness-auth`.
  Never read credentials. Live Ask/wizard/vision deferred.
- **LI1 desktop**, [36](36-live-head.md): synthetic rigs, frame clock and CPU profile; optimize only with
  equivalence proof. Re-measure twice at unchanged floor. Laptop stays unmeasured.

### 3. Deterministic browser and runner gaps

Source: [35](35-test-coverage.md), [31](31-v27-wrap-backlog.md). Each browser row runs twice on an offline lane;
capture baseline and final run header, declare intentional differences, clean owned assets and archive evidence.

- Lorebook/card provisioning roundtrip: regex keys, secondary NOT_ANY logic, outlet, triggers; scanned-memory control. Done 2026-10-14 with workflow, local-judge, context, mobile, living and judge-consumer rows (gate record below).
- Workflow checkpoint override and missing workflow/GPU/media/download plugin findings; no renders/downloads.
- Uncalibrated local judge refusal before transport, visible in Setup.
- Context-over-server warning and clearing with scripted backend properties.
- Mobile touch long-press, save/apply and cleanup.
- Private predecessor/candidate payload comparison with declared diffs only.
- K3 simulation with 1.4–1.6 committed boundaries per player turn.
- Inventory uncovered deterministic rows; add in-scope runners.
- Keyword-scan recall/lore-lab replay; campaign evidence private, counts only.
- Living director divergence/prefetch scripted plumbing through LivingPort.
- Existing scripted briefing, suggestions, Ask and wizard cases; scripted judge-consumer plumbing per shipped consumer.

### 4. Approved features and deferred-proof builds

- **A18 TunnelVision check**, [25](25-tunnelvision-report.md): completed, merged/pushed `3892086f`; full gates
  with Storybook and offline browser twice. Synthetic manifest exercises our reader; upstream writer execution not tested.
- **A19 constant-entry review**, [25](25-tunnelvision-report.md): completed, merged/pushed `50bcbc2b`; full gates
  and Storybook, new browser and existing tier regression each twice. Curator model quality deferred.
- **D-P5 shallow injections**, [31](31-v27-wrap-backlog.md): player-role block and other deep owned blocks;
  player role, scene history, ledger and story-so-far moved to depth 4. Payload goldens identical (no fixture
  carries a moved block); new offset scenario PASS twice. Merged with the integration record below. R7 deferred.
- **J6d reconstruction/replay**, [12](12-j6d-shadow-record.md): deterministic reconstruction and replay; comparison
  legs that need an extractor model deferred.
- **J7 fixtures/runners**, [13](13-j7-judge-ideas.md): independent synthetic J7.4/J7.5 rows, N7 intermediate levels,
  N5 tension comparison runner and quiet baseline. TypeSafe-only legs permitted; extractor comparison deferred.
- **lie_side geometry**, [33](33-pose-library-and-avatars.md): repair skeleton/retarget math; keep listed pending
  render/PCK evidence. Sonnet branch commits `2e5d87db` and `c257f67e` repair geometry and scope cache invalidation
  to lying poses; integrated as `e91814ad`, `fb3b7701`. De-list only if repair fails, per owner decision.
- **Q1-M1 retirement**, [v2.7 36](../v2.7/36-quests-and-story-panels.md) / [31](31-v27-wrap-backlog.md): docs-only retirement into passing
  S-17/37-S17 on combined scope budget; recorded in plan 31 and v2.7 plan 36 on 2026-10-13, no scorer change.
- **C13-b curator digest**, [01](01-v27-carry-over.md): approved product build overrides the old requirement to wait
  for index-arm measurements twice. Integrated as `0ffbdcb6` and `31dcafb4`; original-order listed vocabulary fixes
  cross-book numeric references. Combined quick gate green: 390 suites / 4,254 tests, both typechecks, lint,
  replay 32/32 killed (24 reused), 87.9 s. Build exit 0 (`9d2d1804782e`); real curator calibration deferred.
- **Open stretches**, [19](19-open-stretches.md): encounter pool, quiet trigger and open anchors; validator,
  guide topics, Studio, stories and offline scenario. This approval does not include the separate SP6 measurement/pool.
  Agent branch `v2.8-build-encounters`: `33726a82` plus review correction `c7934a1c` (quiet means no change inside
  the window, not zero net change; anchor `player_text` accepted and hidden during the opening). Agent-reported:
  full jest 690 suites / 7,987 tests, quick gate green, build 1,253,770 B, targeted stories 20/20. Parent reviewed
  and integrated as `254a92f2`, `2907b686`; both offline scenarios PASS twice after a fixture fix (turn 6 is the
  steady pull stage, so the gentle "never a push" line is not expected there). RP acceptance and M2 owed.

### 5. Permitted TypeSafe validation

- Shipped J7 consumers twice plus judge-off arm.
- Independent J7.4/J7.5/N7 rows.
- Lore-select character eligibility real judge leg.
- Supported J6d replay legs; no full judge-versus-extractor claim without the extractor run.
- Current pass spend: **0 TypeSafe calls** through A19. Update per task.

## Workspace recovery — 2026-10-13

- Owner requested an audit and cleanup of 82 `C:\dev\so-*` folders and inactive agent worktrees.
- 69 top-level folders archived under `C:\dev\backups\story-orchestrator\workspace-cleanup-2026-10-13`:
  20 merged worktrees, 40 junction-only remnants, one guide snapshot and eight historical artifact folders.
  Four dirty inactive agent worktrees also moved there with Git registration and their changes preserved.
- Full audit and exact move manifests live in the backup folder. Active build worktrees, configured lane/art roots
  and private evidence repository remain at their original paths. Clean merged `so-ui-rework` remains because Windows refused its move.
- **Recovered unfinished fix:** `charming-wright-d54382` has five staged source/test/guide files narrowing living-frontier
  diagnostics to anchors. Not shipped; preserve patch and originals in `orphan-recovery/charming-wright-d54382`.
  Review against current open-anchor work, integrate source/test/guide changes, regenerate docs and run required gates.
- **Recovered evidence:** eight missing M25 blind-pack files copied to the ignored main session store with matching hashes;
  `npm run sessions:archive` exited 0. Second-model rating remains owed.
- Seven repo stashes retained. Filename inventory found no extra v2.8 remaining-items document; old guide stash covers shipped
  guide tooling, remaining stashes concern local settings or earlier versions. No stash applied or dropped.
- Plan 40 restored to main master and pushed as `aa4eb224`. Earlier external plans remain in the owner's `.opencode/plan` folder.


## Deferred acceptance protocols

### Authoring/cloud model required

- Supported-auth bridge: real Ask answer, wizard tool call, vision request.
- Ask M18 re-score; wizard M19 recipes/safety at approved 60/36 budgets; M20 refused-read journal.
- Briefing: 30 drafts, zero spoilers, preference at least 70 percent; suggestions: ten runs.
- Wizard lorebook proposal/roundtrip; pose classifier LLM leg; real curator digest calibration and carry-over CL rows.
- Campaign review by a second model; owner remains unspoiled.
- N5 extractor comparison; remaining chain voice, widget glance and empty-reply/warden real-reply cases.

### GPU or approved pod required

- Pose product Acceptance twice, repaired lie_side renders/PCK.
- Plan 28 text/image/text twice; plan 29 two-workflow story; streamed mouth on Artemis.
- Director pace/quality/blind pairs, hybrid arm, R7 SWA/cache, history/narrator/empty-reply arms,
  funded carry-over measurements, burst attribution and local-judge play load. Existing floors unchanged.

### Laptop required

- LI1 laptop: unmeasured until hardware is available.

## Close-out criteria

- `npm run gates:quick` per code change; full `npm run gates` with Storybook before merge. Record exact outputs.
- Offline scenarios twice on final affected build, clean header diff and owned-asset cleanup.
- Guide updates followed by `npm run docs:guide` and `npm run docs:settings`.
- Campaign adoption decision per feature; if needed, private campaign checks, pin bump and reinstall.
- Private lane/session evidence archive, source-plan gate record and queue update.
- Merge/push green deterministic builds; deferred acceptance remains visible. Stage/install at an appropriate owner idle point.

## Out of scope

Smart-context harvest, inner voice L5, cue/scene merge, SP5 real-reply legs, SP6 pool and local-judge calibration.
Canon prose stays enabled; M25 blind pack awaits a second-model rater.
Product integration and image model selection, including the Qwen fast-model POC, are planned separately in
[41](41-product-integration-and-image-models.md).

## Gate record — 2026-10-13

- Plan index added during the continued approved pass. Documentation only; no gate claim for unfinished rows.
- Completed A18/A19 evidence and commands are in plan 25. Remaining rows above remain open until their own records land.
- Owner requested Sonnet delegation. Three Sonnet 5.5 agents use separate worktrees for curator digest,
  open-stretch additions and pose geometry. Parent owns shared lane staging, integration review and full gates.
- Pose branch returned deterministic repair plus pose-sensitive cache-version follow-up; no GPU acceptance claimed.

## Gate record — integration into master, 2026-10-13

- Scope merged: correctness fixes (lore-select eligibility, A20 observer, A21 test), lie_side geometry, Q1-M1
  docs, D-P5 depths, C13-b curator digest, open-stretch encounter pool/quiet read/open anchors, plan 41, queue rows.
  Not merged: harness-auth agent branch (still running). Orphaned chapter-diagnostics fix stays in the backup, unreviewed.
- `npm run gates -- --jobs=4`: all green in 248.9 s; Jest 698 suites / 8,094 tests (1 skipped), Storybook 130
  suites / 790 tests, replay 32/32 killed, plugin, release, debug and typechecks green. Main bundle 1,257,967 B
  (`bc1dc2402c53`), under the 1,300,000 B budget.
- After two scenario fixes: `npm run gates:quick` green (6,724 tests, replay 32/32), `npm run test:debug` 1,234/1,234.
- Lane 38 (isolated copy, offline backend), bundle `bc1dc2402c53`: payload capture six cases / 31 captures, identical
  to predecessor; D-P5 offset scenario PASS twice; `v28-19-open-opening` and `v28-19-encounters` PASS twice each
  (reload included). Expected noise: plugin status 404s (lane tree has no server plugins), backend props 500s.
- Run header before/after: 0 blocking differences (`build.head` declared). Evidence private:
  `so-evidence archive --label v28-integration-p5-stretches` 297 files, no problems; `npm run sessions:archive` exit 0.
- TypeSafe calls this pass: 0. No model, GPU, pod or laptop use.
- Campaign: no authored change needed for D-P5, digest or lie_side. Open stretches: adoption deferred until RP
  acceptance; no pin bump. Installation into the owner ST waits for an owner-approved idle point.

## Gate record: supported OpenCode harness transport (2026-10-13, no model, no GPU, LIST)

- Place: `C:\dev\so-build-harness-auth`, branch `v2.8-build-harness-auth`, base `52e051f3`. Source: plans 33 and 36 (the Sol bridge was blocked on an expired OpenCode login the plugin could not refresh) and plan 40. No Sol, DeepSeek, Artemis or TypeSafe call, no GPU, no lane, no ST, no staging, no install, no change to the owner's OpenCode settings or sign-in. No credential file was read or printed.
- Cause of the old failure: the plugin copied `~/.local/share/opencode/auth.json` into an owned home and judged freshness from its `expires`; OpenCode v2 does not rewrite that file (it renews inside its own service), so a working `opencode run` looked "expired" to the plugin.
- Chosen interface (V2 docs only): OpenCode's own client library `@opencode/client` 2.0.28 (pinned) and its Node `Service` (`discover`, `ensure`, `headers`) against the shared background service, one session per call: client guide (https://opencode.ai/v2/docs/build/client: Promise client, `event.subscribe`, local background service), API reference (https://opencode.ai/v2/docs/api: `session`, `message`, `agent`, `mcp`, `integration`, `model`, `debug.location`), config (project `opencode.json` discovered from the session's directory), agents (`system`, ordered `permissions`), permissions (last match wins, `*` deny hides tools), MCP servers (`mcp.servers`, `codemode: false` for native tools, `<server>_<tool>` names), attachments (`data:` URIs; PNG, JPEG, GIF, WebP), troubleshooting (`opencode service`, no edits of service files). The CLI `opencode api` was rejected (a data: image exceeds the Windows command-line limit) and so was reading the service registration (it holds the service's own secret): the client library does discovery and pairing internally.
- Auth: the plugin never reads, copies or refreshes an opencode login. Sign-in is read from the service's `integration` connections: none or API-key-only is `unpaired`, `needs_auth` is `expired`, a refused pairing says `opencode service restart`, a missing client library says `npm run plugins:install`. Each is a status row (`loginState`, `loginAction`, `loginProblem`), a "(sign-in expired)" / "(log in first)" / "(setup needed)" label in Models per task, and the wizard's refusal text. A stopped service is `unchecked` and starts on the first call; status never starts it; the plugin accepts any 2.x service and never replaces one.
- Isolation without `--pure`: the system text and a deny-everything agent live in an `opencode.json` in the plugin's own directory (text: `<tmpRoot>/opencode-loc/text-<hash>`, kept; wizard: one per session, evicted and deleted). The agent is read back before any prompt and the call is refused unless every tool is denied (measured on OpenCode 2.0.6: a fresh directory answers AgentNotFound for about 0.4 s while it loads, so the read retries for up to 8 s and then fails closed). Wizard: one native MCP server (the existing shim) with `so_*` allowed; a foreign tool event, a tool in the stored messages or a permission request ends the session as refused.
- Built: `opencodeTransport.mjs` (new), `errors.mjs` (new), `agentBridge.mjs` (run seam), `index.mjs` (opencode path, no login file, no warm-up route, images, async status), plugin 2.0.0. Kept: gate (2 per harness, one per user and role, queue limit, busy), timeouts, cancel, owned directories with sweep, tools off, default model `openai/gpt-6.1-sol`, author-confirmed provisioning, read-only Ask. Claude and Codex are unchanged. Vision: up to 4 images, 8 MB each, 20 MB in all, bytes sniffed, only to a model whose listing has image input (`/status` per model `image`), carried by `/complete`, `/agent/open`, `HarnessRequest.images`, `BridgeOpenInput.images`, `HarnessTarget.images`. Cleanup: session interrupted then removed, location evicted, directory removed, sessions from a dead plugin process removed at start (title `so-harness <pid> �c`, metadata owner), text directories unused for a week removed. Installer: `plugins:install` runs `npm install` in the plugin's own folder for the pinned client (`--skip-deps`; ST untouched).
- Verified without a model: a private, credential-free `opencode serve` 2.0.6 with its own empty home (`opencode.isolated.test.mjs`, `SO_OPENCODE_ISOLATED=1`): sign-in `unpaired`, config discovery and fail-closed agent, the real shim reaching the plugin's channel through OpenCode's MCP stdio (`codemode: false`), eviction, orphan sweep, and the real failure event (`provider.no-route`, no credentials exist there) through create, events, prompt, terminal and removal. The 2.0.6 OpenAPI is a subset of the V2 docs; every operation used exists in both. The client 2.0.28 works against the 2.0.6 server. After a real `npm install` in a synthetic plugin folder the same test passes with the client resolved from the plugin folder.
- Commands: `npm run test:plugin`: `# tests 264, # pass 260, # fail 0, # skipped 4` (the skips include the two `HARNESS_LIVE` tests and the isolated test without its flag). With `SO_OPENCODE_ISOLATED=1 SO_OPENCODE_CLIENT_DIR=<folder with the client>`: `opencode.isolated.test.mjs` pass 1, fail 0 (11 s), twice (client from a temp folder and from the installed plugin folder). `node --test scripts/lib/pluginInstall.test.mjs`: 11 pass. `npx tsc --noEmit -p .` clean. Jest on the changed seams (harness, harnessBridge, bridge, agentHost, harnessRouting, faultMatrix, lazyHarness, architecture, pluginVersionCheck, codeHealth): all pass. `npm run docs:guide` and `npm run docs:settings`: `guide: 32 pages, 1 images`; only `docs/guide/setup/harness.md` and its bundle `src/guide/pages.generated.ts` changed.
- `npm run gates:quick`: typecheck, typecheck:test, lint (changed) and jest green on the second run (688 suites); the first run failed `codeHealth.guard` S5 on five new over-long lines (wrapped) and lint (changed); the second run is green for typecheck, typecheck:test, lint (changed) and jest. Its `defect replay (--cached)` step fails on this fresh worktree before running a defect: with no replay cache every one of 4,423 files counts as changed and `spawnSync` of `jest --listTests --findRelatedTests` fails with ENAMETOOLONG (reproduced with a debug copy of the script). `node scripts/suite/defect-replay.mjs --full` was run once with the machine loaded by other agents: baseline green over the whole jest suite (7950 tests, 403.3 s), then 16 of 32 defects KILLED, 0 SURVIVED, the rest TIMEOUT at 600 s each and the 30-minute cap ended it. Recorded as incomplete, not green.
- Deviations: pinned client 2.0.28 while the owner's CLI is 2.0.6 (shapes used are in both); the plugin folder gains a 57 MB `node_modules` (the client's `effect` dependency); each wizard session adds an OpenCode project row for its temp directory (no API removes it); which credential OpenCode uses when both a subscription and a key exist is OpenCode's choice (`opencode auth switch`), the status shows only the credential kinds; the owner's global OpenCode instructions or MCP servers still load in our sessions (tools stay denied).
- Deferred, owner and model needed (not claimed): a real Ask answer, a real wizard tool call (the `so_*` names exposed to the model with `codemode: false`, `session.status` retry shape with an auth action) and a real vision request, all on `openai/gpt-6.1-sol`, after the owner signs in with `opencode auth login` if the status says so. Then plan 33 CL LLM leg and M18/M19/M20 recipes, plan 36 LI5 calibration. Parent: full `npm run gates`, Storybook (`MemoryModelGroup` label), staging, `npm run plugins:install -- --with harness`, ST restart.

## Parent harness review — 2026-10-13

- Integrated the harness branch as `016a39a3` in `so-build-fixes` for plan-41 wizard/vision acceptance. Owner ST untouched.
- `npm run gates:quick`: green in 127.5 s; Jest 698 suites / 8,098 tests; replay 32/32 killed. This precedes the parent fixes below.
- Private credential-free server check initially failed because its offline model catalog was empty. The test now verifies
  catalog parity instead of assuming any providers exist. Re-run: 1 passed, zero failures, 10.7 s.
- Actual OpenCode 2.0.6 returned connection metadata without `method` or `status`, so the agent's harness still labelled
  the owner's working OAuth login unpaired. The parent reproduced it through the client before sending a model prompt.
- Parent fix: only when connection methods are omitted, ask the supported `opencode auth list` CLI for metadata.
  Unknown output refuses explicitly; OAuth is recognised and key-only connections remain refused. No credential file or
  secret-bearing credential API is read. Also preserve public model alias IDs instead of colliding on vendor model IDs.
- `node --test server-plugin/story-orchestrator-harness/opencode.test.mjs`: 32 passed, zero failures, including the
  missing-method regression and distinct-alias availability checks.
- Real transport smoke: service 2.0.6, OpenAI state ok; `openai/gpt-6.1-sol` returned PONG, tool-denied owned session,
  effort applied, input 316 / output 6 tokens. One non-rating Sol call. Browser Ask/wizard/vision acceptance still owed.
- `npm run gates -- --jobs=2`: all 11 green in 294.6 s, Storybook included; Jest 698 suites / 8,098 tests,
  plugin 263 passed / 4 skipped. Bundle `77b6d3e5c144`, 1,258,176 B. Follow-up `npm run gates:quick`: green in 87.7 s.
- Staged to isolated `st-v28-build-now`, installed harness dependency and restarted lane 38 only. Its browser
  reports OpenCode offered, OAuth ok, image input supported. Images/sprites off during this non-GPU browser batch.
- Initial wizard call failed on the lane's inherited offline profile. Explicit authoring route to Sol then completed
  a real plan, `readGuide` and title-edit tools, author review/Accept and Finished state. Draft stayed unsaved; no assets created.
- Real Studio Ask answered how to save the synthetic draft and cited `guide/author/studio#saving` through the harness.
- Browser vision transport identified red left / blue right from an attached synthetic PNG. HTTP 200, Sol,
  input 337 / output 13, effort applied, 9,314 ms. First vision driver attempt used `Response.status()` instead of
  its property after sending; retained as a driver failure, corrected rerun passed. This proves image transport,
  not a calibrated rig or complete product journey.
- Fixed live harness `openWizard(newStory)`: navigate Connections to Library before locating the wizard button,
  matching `openCheckpointStudio`. `node --test scripts/debug/so-ui.test.mts`: 34 passed; subsequent
  `npm run gates:quick`: green in 89.9 s, Jest 8,098 passed, replay 32/32.
- Synthetic draft reset after the check; library contains no synthetic record. Lane 38 stopped. Its explicit
  Sol authoring route and image-off test settings are retained for the next isolated acceptance run.
- `so-evidence.mts archive --label plan41-harness-review --lanes 38 --pods none --since 2026-10-13T18:32:00Z`:
  25 files / 330,274 B; archive verification ok. Private evidence commit `a1df3e4`, not pushed. Includes failures,
  scripts and successful browser records. Full plan-41 end-user acceptance remains pending.
- Harness review fixes (`e1ea01aa`): OpenCode text and agent setup (`ready`, `verifyAgent`, `session.create`,
  `prompt`, MCP connect) now race the deadline armed first and the cancel signal; a stalled service frees the
  `/complete` slot, removes a late-created session, and bounded cleanup lets bridge teardown always remove the owned
  dir. Bridge `opencode.json` (holds the bridge secret) written 0o600. Sign-in/credential wording counts as `auth`
  only outside routing errors and with a qualifier. Fake server gained `stall` + `release()`; 5 node:test cases added
  (stalled create/prompt/agent read to timeout, cancel during setup, owned-dir cleanup on deadline/close/refused,
  0o600 write, auth vs config classify). All 5 fail on the previous transport.
- `npm run test:plugin`: 272 tests, 268 passed / 4 skipped, 0 failed.
- `npm run gates:quick`: green in 147.8 s; Jest 698 suites / 8,098 passed, replay `--cached` ok.
- `npm run gates`: all 11 green in 375.8 s, Storybook included (130 suites / 790 tests); Jest 8,098 passed,
  test:debug 1,237 passed. Bundle `77b6d3e5c144` unchanged (server plugin only). No model calls, lanes or ST.
- No master merge or owner installation yet.

## Gate record: §3 deterministic browser scenarios (2026-10-14, no model, no GPU, LIST)

- Place: worktree branch `v2.8-nomodel-scenarios` from master `004abc8a`. Isolated ST code copy `C:\dev\st-v28-nomodel` (copied from `st-v28-build-now` without its staged extension and plugins, `node_modules` junctioned to the ST install), lanes root `C:\dev\so-nomodel-lanes`, lane 44 (port 8144, CDP 9344). Owner ST, lane 0, lanes 38/39 and the 3090 untouched.
- Lane: `ST_ROOT=C:/dev/SillyTavern-MainBranch SO_LANES_ROOT=C:/dev/so-nomodel-lanes SO_LANE_OFFLINE=1 node scripts/debug/st-lanes.mts seed 44 --slim` (offline rewrite: 1 loopback URL rewired, 3 model keys removed, judge/images/sprites off, no server plugins), then `SO_LANES_ROOT=C:/dev/so-nomodel-lanes node scripts/debug/st-lanes.mts start 44`. Every build staged only into the isolated copy (`npm run stage` via its `.st-root`).
- Scenarios (`test/scenarios/v28-40-*.json`), final served bundle `9f637c0be010` (1,258,236 B):
  - `v28-40-provisioning-roundtrip`: runtime provisioning of a marked book (regex key, NOT_ANY secondary, outlet position 7, triggers) and card, server-file read-back, three refused shapes; scanned-memory control: beside a scanned memory fact the NOT_ANY entry is rated (not certain), ST's own dry-run scan suppresses it natively and the forced pick lands; with scanning off it is left to the keyword scan and ST activates it; quiet-only entry never rated, forced or activated on a normal turn; outlet unchanged on disk. PASS ×2.
  - `v28-40-workflow-findings`: story map plus checkpoint override resolve per visited checkpoint (`plan(raw:true)`, no render), unmapped purpose falls back, player selection untouched; no ComfyUI source: `story-workflow-missing` (player copy, author detail names all three files); comfy backend without the media plugin: `images-on-no-service` with its detail; GPU broker absent reads null, no row; no blocking image/plugin row. Fetch tripwire: 0 render/download/workflow-write requests (one read-only `/api/sd/comfy/workflows` list). PASS ×2.
  - `v28-40-local-judge-uncalibrated`: `director` routed to systemone-local and `stallCheck` to llama-logprob both answer `uncalibrated` with 0 judge-plugin requests during the ask (no `/status`); ring and journal record both with provider; control on the TypeSafe route reaches `/status` and answers `unavailable`. Visible in Connections > Judge readiness ("not calibrated there", "measured there and refused") and the local judge status line. PASS ×2.
  - `v28-40-context-over-server`: scripted `/props` (32768) for a run-unique closed-port URL, context 98304: `context-over-server` row (player copy; Author view names URL and size); context 32768 clears it; a second scripted server serving 131072 keeps it clear; connection restored. PASS ×2.
  - `v28-40-mobile-touch-longpress` (run with `ST_DEBUG_VIEWPORT=390x844`): real CDP touch hold (new ui action `touch-press`) on a graph checkpoint opens only Checkpoint actions; Edit checkpoint, objective edit, save keep: library record and this chat carry the edit; Studio closed, runner restored library and chat. PASS ×2.
  - `v28-40-living-divergence-prefetch`: plumbing only (scripted judge readings, `storyOrchestratorDebugLivingResponse`). Judge-off turn reads nothing; two off-route turns give streak 1, then the branch job; a reply without a new player line is skipped as the same turn; auto branch `liv_b1_way` applies with source/stub/anchor edges and the checkpoint is not read again; at the next anchor preparing ahead (judge silent) applies `liv_b2_way`; off, nothing more. Sequential only: the concurrent same-turn double count (fixed on `v2.8-review-fixes`) is not tripped by this scenario. PASS ×2.
  - `v28-40-judge-consumers`: plumbing only (stubbed `JudgeRuntime.active/ask`). canonVerify drops the low-scored sentence (off: canon kept whole); canonDraft writes a checked draft and accept moves it into the canon (off: no draft); idleCheck first note at sample 4 (then 8, 12, 16, 20), toneCheck at 5, adversityTrend at 20, repetitionCheck raised without a judge call (off: no idea notes). pictureCue not runnable here (needs a ready image service). PASS ×2.
- Final batches: `SO_LANES_ROOT=C:/dev/so-nomodel-lanes node scripts/debug/st-lanes.mts batch --lanes 44 --repeat 2 --strict --group "Group: Arin, DM Narrator" <six files>`: 12/12 GREEN, none incomplete (`batch-2026-10-14T08-39-38-373Z`); same with `ST_DEBUG_VIEWPORT=390x844` for the mobile file: 2/2 GREEN (`batch-2026-10-14T08-51-54-765Z`). Expected page noise: plugin status 404s, offline `/props` 500, chat-completions 400 refusals on the closed backend.
- Product fixes (each with jest):
  - Lore-select cache ignored the scan buffer's `injected` state: a selection cached while scanned memory held text was reused after it stopped (or the reverse) at the same message, so a NOT_ANY entry kept the wrong rated/left classification. Key now includes it (`src/runtime/loreSelect.ts`); test fails on the old code.
  - Studio graph: the release that ends a touch long-press also emitted `tap`, opening the checkpoint editor over Checkpoint actions on narrow screens (the ui-rework record had exercised right-click only). `holdTapGate` swallows only that tap (`GraphPanel.tsx`, `graphPanelUtils.ts`).
- Findings recorded, not changed: no Setup check exists for an uncalibrated judge route (it shows in Connections > Judge only); no check names an absent GPU or download plugin (fail-open: broker null, downloads have no probe); with the warden off install-wide, the living scenario still saw `warden` judge asks (answered disabled by the stub).
- Harness: new ui action `touch-press` (`scripts/debug/lib/touchPress.mts`, schema, runner) with `scripts/debug/touchPress.test.mts`; arrival-findings golden re-recorded (seven additions only).
- Run header: baseline before the first scenario and final after the batches; `so-run-header.mts diff ... --allow build.head,build.manifest.builtAt,build.manifest.bundleBytes,build.manifest.bundleSha256,build.manifest.fileSha256,build.manifest.sourceSha256,bundle.served.bytes,bundle.served.sha256`: 8 differences, 0 blocking (the two declared rebuilds). Inventories unchanged.
- Gates: `npm run gates:quick`: typecheck, typecheck:test, lint, jest (related) green; `defect replay (--cached)` RED before running a row (`jest --listTests` spawn failure on a fresh worktree without a replay cache, as in the harness record above). `npm run test:debug`: 1,241 pass. `npm run gates -- --jobs=2 --no-storybook`: all green in 220.6 s; Jest 698 suites / 8,101 passed (1 skipped), replay 32/32 killed, test:debug 1,241, plugin 268 pass / 4 skipped, release 123 pass / 14 skipped; bundle `9f637c0be010` equal to the served one. Storybook NOT run: in this `.claude/worktrees` path the test runner matches 0 stories ("No tests found", also through a junction); the earlier `npm run gates -- --jobs=2` stopped there. Owed from a non-dot checkout before merge (GraphPanel stories changed indirectly).
- Evidence: `SO_LANES_ROOT=C:/dev/so-nomodel-lanes node scripts/debug/so-evidence.mts archive --label v28-nomodel-scenarios --lanes 44 --pods none`: 300 files, 46,462,213 B, problems []. `npm run sessions:archive` left to the coordinator. Lane 44 stopped.
- No model, TypeSafe, GPU, ComfyUI or download. TypeSafe calls: 0.
