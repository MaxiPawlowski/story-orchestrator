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

- Lorebook/card provisioning roundtrip: regex keys, secondary NOT_ANY logic, outlet, triggers; scanned-memory control.
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
