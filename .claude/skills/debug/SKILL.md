---
name: debug
description: >
  Live-debug the Story Orchestrator extension against a running SillyTavern
  (http://127.0.0.1:8000/): inspect runtime state, drive UI, send messages,
  run slash commands, validate checkpoints/extraction, capture screenshots.
  Use for any live/E2E validation, Playwright work, or "why is the extension
  doing X in the browser" question.
---

# Debug — Story Orchestrator

Two complementary toolsets. Pick by task, don't mix roles:

| | Predefined scripts (`scripts/debug/`) | Playwright MCP (`mcp__playwright__browser_*`) |
|---|---|---|
| **For** | Deterministic reads/actions/assertions; anything a gate depends on; anything you'll run twice | Exploratory only: look around, inspect visuals/console/network, ad-hoc clicks in UI not covered by `so-ui` |
| **Key tools** | `st-session`, `so-scenario`, `so-state current`, `st-actions`, `st-payload`, `so-ui` | `browser_snapshot` (a11y tree), `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, `browser_evaluate` |
| **Rule** | Gate validations are scripts with exit codes | Never build multi-step validation chains from MCP calls when a script exists; if you repeat an MCP sequence, promote it to a script |

Start with `node scripts/debug/st-session.mts start [--headed]` (also `stop|status|reload`) when using scripts and MCP together. Scripts attach via `<debug dir>/session.json`; MCP attaches to `http://127.0.0.1:9222` via the repo `.mcp.json` (`--cdp-endpoint`), so both drive ONE browser. If MCP browser tools fail to connect, start the session and retry. **Warning**: an MCP playwright server without `--cdp-endpoint` (e.g. user-level default) silently launches its own isolated Chromium. Before any shared-state MCP work, verify with a marker round-trip: MCP `browser_evaluate` sets `globalThis.__x`, then `st-eval.mts "globalThis.__x"` must return it.

Do not use unbounded terminal processes for gates. Scripts have hard connection timeouts (`ST_DEBUG_TIMEOUT_MS`, default 30000), `st-payload watch` defaults to 60s, and `st-session stop` cleans up the Windows process tree.

## Prerequisites

- SillyTavern running at `http://127.0.0.1:8000/` (`ST_URL` overrides) with an LLM backend connected.
- `npx playwright install chromium` if browser binaries missing.
- A rebuilt extension runs only after `npm run build && npm run stage` + `st-session.mts reload`.

Scripts run via `node scripts/debug/<tool>.mts`, attach to the shared session first, otherwise launch a short-lived headless Chromium. Artifacts go to the debug dir: `SO_DEBUG_DIR`, default `<SO_LANES_ROOT|C:/dev/so-lanes>/0/debug` (outside ST's `public/`, because logs hold chat text; never `.debug/`, `servedDebugDir.test.mts` fails that).

**Two isolated sessions at once** = `ST_DEBUG_CDP_PORT=<port>` **and** `SO_DEBUG_DIR=<dir>` per process. The port alone is not enough: one debug dir means one `session.json`, journey config snapshot and asset baseline, so the second run's cleanup reads the first's state. A relative `SO_DEBUG_DIR` resolves against the project root. Prefer `st-lanes.mts` lanes (own server, browser and debug dir). Guarded by `scripts/debug/lib/connection.test.mts`.

## Real-LLM validation (default gate)

Handover sign-off for LLM-consuming paths requires the real model, not `debugResponse` mocks. Mocks (`storyOrchestratorDebug*Response` globals, scenario `extract`/`expand` step values) stay valid for unit determinism and scenario plumbing — never for sign-off.

Prerequisites: extraction Connection Manager profile selected (settings panel profile picker; `settingsHome.extraction.profileId` in `so-state.mts current`). If ST is down, no backend connected, or no profile selected: state it at handover and flag the gate NOT green — do not silently fall back to mocks.

Triggering real passes (real path = profile set + no `debugResponse`):

- Main-model generation: `st-actions.mts send <text>` or scenario step `send_generate`.
- Shared read / memory / arc / canon passes: `storyOrchestratorRuntime.runExtractionNow()` with NO response arg, or scenario `extract` step without `debugResponse`.
- Expansion + critic: `runExpansionNow()` with no arg, or scenario `expand` without `debugResponse`.
- Clear leftover `storyOrchestratorDebug*Response` globals first — a set global wins over the real path.

Pass criteria under nondeterminism — assert pipeline behavior, never exact model output:

- audit recorded with prompt + rawResponse, no `debugResponse` marker
- parse succeeded, or failure audited + retried per scheduler policy
- expected delta/memory/arc effect lands within N boundaries (pick N per check, not =1)
- injected blocks (`story_blackboard`, pacing, memory, canon) present in a real generation payload via `st-payload.mts`

One malformed model response correctly audited/retried = plumbing pass. Repeated hard failures against a contract = real finding (prompt/contract issue) — report it, don't paper over with a mock.

**Judge.** `so-judge.mts calibrate|rescore` take `--provider typesafe|llama-logprob` (default `typesafe`); the summary records it, a llama run never reaches TypeSafe, and its model verdict is the model that answered (`resolved`). No privacy-notice gate exists (a configured key is consent), so a lane with a key sends judge calls as soon as the judge is on.

**Judge rate across lanes.** Each lane runs its own ST server, hence its own judge plugin and limiter, while all spend one TypeSafe account (`SO_JUDGE_ACCOUNT_RATE_PER_MIN`, default 1,200/min). Per-user default: 2 x account / 5 = 480/min with ST accounts on, the whole account with them off. Override in the lane server's environment: `SO_JUDGE_RATE_PER_MIN=15 node scripts/debug/st-lanes.mts start 1` (also `SO_JUDGE_MAX_IN_FLIGHT`; a running lane keeps its limit until `stop <n>` + `start <n>`). `so-session start` sets it for you (account x2 split over running lanes + this one, bounded 10..480, `--judge-rate <n>` overrides, recorded in `session.json` `judgeRate`). A call over the window waits up to 2 s, then 429 + `Retry-After`; the page then holds judge calls and the burst behind takes `fallback=busy` unsent (not metered). A real TypeSafe 429 halves the plugin's effective rate (floor 10%) and recovers over ~2 min. `/status` shows `limits`, `adaptive`, and `refusals` split `local` vs upstream.

**Calibration is a burst.** `so-judge calibrate` refuses to record a run with any `busy` row; the harness paces at 60 calls/min, so give a use over 60 rows `--chunk <rows>` (slices 61 s apart) and wait ~65 s between uses. The off-page recorder `scripts/spike/typesafe/calibrate-node.mts` paces the same way and builds the handler with `accountsEnabled: false` (off-page the plugin cannot read ST's accounts flag and would find no key).

**Local 3090 controller serves 32768 context and refuses past it** (v2.8 31 F20). The gateway (`server-plugin/story-orchestrator-gpu/broker/backend.mjs` `forRequest`, run by `scripts/local/controller.mjs` and the GPU plugin) counts each completion with the backend's `/tokenize` (chat via `/apply-template`) and answers 400 `exceed_context_size_error` when prompt + output pass `maxContext`. ST already keeps prompt + `token_padding` (64) under `max_context - amount_gen` and counts extension prompts after the interceptors (script.js:4560-4925). **Rule:** on a lane pointed at the controller set ST `max_context` 32768 after `/profile` (the shipped Artemis presets say 98304 and selecting the profile re-applies it), or tick Derive context size from backend. A lane left at 98304 gets the 400 and the `context-over-server` check. Repro: `test/scenarios/live-f20-long-chat.json` (`--sandbox --group "Group: Arin, DM Narrator"`, lane started with `st-lanes.mts start <n> --allow-local`).

## Script reference

### State & data

```bash
node scripts/debug/so-state.mts current        # primary snapshot: chatId, groupId, selectedStoryId, storyIdentity, settingsHome, activeCheckpointId, boundary, blackboard, latched, requirementsReady, extraction counts, memory, stagecraft, effects ledger, background
node scripts/debug/so-state.mts current --expect bb.player_has_key=true   # also --expect-absent path.key
node scripts/debug/so-state.mts all --full
node scripts/debug/so-library.mts              # v2 story library (extensionSettings["story-orchestrator"].v2Stories)
node scripts/debug/so-library.mts <id>         # full v2 story record
node scripts/debug/so-library.mts remove "<id|title>"         # remove from library + flush settings (test cleanup)
node scripts/debug/so-library.mts wipe-chat-meta [--id i]     # delete chat_metadata.story_orchestrator from current chat
node scripts/debug/st-eval.mts "<js>"          # run async JS in the ST page; ctx + rt in scope; bare expression or statements with return
node scripts/debug/st-eval.mts --file <path>   # same, snippet from file — replaces throwaway one-off .mts scripts
node scripts/debug/st-context.mts [keys...]    # getContext() summary or specific keys (chatId mainApi ...)
node scripts/debug/st-extension-settings.mts [name|--all]
node scripts/debug/st-chat.mts [count|metadata]  # last N messages (default 10) or chat_metadata
```

`so-state` reads persisted `chatMetadata.story_orchestrator` (`selectedStoryId`, `stories[id]`) — live in-page values between persist cycles may differ. Raw blob also via `st-chat.mts metadata`.

### Actions

```bash
node scripts/debug/st-actions.mts generation-state
node scripts/debug/st-actions.mts wait-idle [timeout_ms]        # default 30s
node scripts/debug/st-actions.mts send <text>                   # triggers real LLM generation!
node scripts/debug/st-actions.mts send-compact <text>           # /send compact=true, no generation
node scripts/debug/st-actions.mts trigger <member>              # draft a specific group member (/trigger await=true; real generation!)
MSYS_NO_PATHCONV=1 node scripts/debug/st-actions.mts slash "/cp activate <id>"   # runs inside Author view, restores player mode
node scripts/debug/st-actions.mts checkpoint list               # = /cp list
node scripts/debug/st-actions.mts swipe <messageId> [swipeId]
node scripts/debug/st-actions.mts edit <messageId> <text>
node scripts/debug/st-actions.mts delete <messageId>
node scripts/debug/st-actions.mts wi-status <book> <comment>
```

`/cp` (alias `/checkpoint`): `list | state | activate <id> | set <quality> <value> | converge | chapters | seal | unseal <id>`, debug `extract|expand [response]`; author-only. In Git Bash prefix any leading-slash arg with `MSYS_NO_PATHCONV=1`. For deterministic swipe tests use an existing multi-swipe message; the command fails instead of overswiping into real generation.

### Scenarios

```bash
node scripts/debug/so-scenario.mts run test/scenarios/plan03-extraction.json --sandbox [--keep] [--group <id|name>]
node scripts/debug/so-mutation-check.mts
node scripts/debug/so-runtime-check.mts
node scripts/debug/so-extraction-check.mts
```

The vocabulary is closed in `scripts/debug/lib/scenarioSchema.mts` (`STEP_VERBS`, `EXPECT_KEYS`, `WAIT_KEYS`, `UI_ACTIONS`): steps include `import_story`, `select_story`, `send` (`/send compact`, generates nothing), `send_generate`, `slash`, `extract`, `expand`, `eval`, `ui`, `stagecraft`, `swipe`, `edit`, `delete` (tail-truncate), `host_delete`, `cut`, `wait`, `expect`, `expect_ui`, `record_state`, `branch_create`, `solo_chat`. `--sandbox` starts `/newchat` and cleanup removes imported stories and the scratch chat unless `--keep`; pin `--group` on a shared install.

Real-LLM scenarios: `test/scenarios/live-*.json` + `plan08-hygiene.json`, all steps against the real backend. `live-memory-mirror.json` (per-chat memory WI book; clean up `so-assets.mts remove --marker SO-MIRROR`), `live-curator-write.json` (accepts whatever the real curator proposes, checks the server file and every main prompt via `GENERATE_AFTER_DATA`; needs the curator in review mode; clean up `--marker SO-J8`). Tolerant waits: `acceptedDelta`, `reconciliationEvents`, `memoryEntries` (+`memoryTier`), `arcsSummarized`, `canonPresent`, `checkpointIn`. After a real `send_generate`, wait on `boundary`, not `idle` — group activation can lag.

Other runners (detail in `.claude/rules/debug-scripts.md`): `so-journey.mts`, `so-run-header.mts capture|diff`, `so-journal.mts`, `so-payload-golden.mts`, `st-lanes.mts`, `adolion-fresh.mts`, `so-pod.mts`, `so-evidence.mts`.

### Test assets (wizard / curator runs)

```bash
node scripts/debug/so-assets.mts list --marker SO-J9          # dry run — ALWAYS before remove
node scripts/debug/so-assets.mts remove --marker SO-J9        # delete + leak re-check
node scripts/debug/so-assets.mts assert-clean --marker SO-J9
```

Scope: marker-prefixed names plus the created-asset ledger (`wizardSessions[].applied`) of **test** sessions only (keys starting with the slugged marker, `so-j9-wizard`). A real author's sessions and assets are never touched. A journey also passes its `snapshotAssets` baseline: ledger entries recorded during the run count, assets that existed before are spared (`protected`). `list` reports `ledger`, `sessions`, `protected`, and `baselineUntrusted` when a baseline was refused. An empty `--marker` is refused.

**An empty baseline is "unknown", not "nothing"**: untrusted when the settings root is absent or ST has not listed characters/lorebooks yet; cleanup then falls back to marker-only scope. Each run writes it to `<debug dir>/so-journey-asset-baseline.json` — read it first when cleanup deleted something it should not have.

### Payloads

```bash
node scripts/debug/st-payload.mts arm [--persist --out <f.jsonl>]
node scripts/debug/st-payload.mts last [n] [--member <name>]
node scripts/debug/st-payload.mts watch 3 --timeout-ms 60000
```

Capture hooks fetch/XHR in the shared page and records generation payloads with the drafted member; `--persist` survives reloads and also writes `kind: "response"` rows.

### Human sessions (v2.6 plan 14)

```bash
node scripts/debug/so-session.mts validate                     # charters.json vs the pinned story index
node scripts/debug/so-session.mts cards --write                # regenerate docs/plans/v2.6/14-cards.md
node scripts/debug/so-session.mts start T1-2 --lane 4          # seed, settings, pin, open, run header, tails; prints the card
node scripts/debug/so-session.mts start T3-1 --lane 4 --media on --allow-comfy   # only after confirming the shared ComfyUI is free
node scripts/debug/so-session.mts stop [<dir>] [--stop-lane]
node scripts/debug/so-session.mts reverify <dir>               # re-check a stopped session's artifacts
node scripts/debug/so-session.mts digest [<dir>]               # findings.md + findings.json
node scripts/debug/so-session.mts index                        # rebuild test/sessions/adolion-stories.json + 14-cards.md after a pin bump
node scripts/debug/so-session.mts lane lease|archive <n>       # lane restore <n> <archiveDir>
node scripts/debug/so-session.mts rating-pack [C3|R4|Q-M|W6]   # rebuild test/sessions/rating-pack/<gate>/
```

Fail closed (plan 15 AS-21..29, `docs/plans/v2.6/15-review.md`):

- **Start** refuses (exit 2, `start-failed.json`) on any blocking discrepancy: lane build, settings read-back, routing pin, page, away recap, run header, preset overlay, or a tail that never wrote its `<out>.ready` ack. Also a card whose pinned story lacks its `requires.features`, and a leased lane it would reseed.
- **Settings** = `test/sessions/baseline-settings.json` (versioned; images/sprites off) + root→card overrides, applied keeping install-owned paths, read back and asserted, recorded in `session.json`. `src/runtime/sessionBaseline.test.ts` fails when `defaultGlobalSettings` gains a leaf the baseline does not state.
- **Swipes**: `adolion-fresh seed` switches ST's `swipes` on in the lane copy; `start` refuses a lane whose `#swipes-checkbox` does not read back on (`session.json` `host.swipes`).
- **Media**: `--media off` default; a ComfyUI call in the lane log fails the session and image/sprite rubric rows are `unexercised`. `--media on` needs `--allow-comfy`.
- **Start popups**: the chapter-jump confirm of a `startAt` jump is answered "Jump without sealing" (`session.json` `startPopups`); any other popup fails closed.
- **Stop** order: export → run-header diff → ask each tail to drain → wait for `<out>.drained` → kill → verify. The diff runs `--owned <session chats>` (growth in a chat the session does not own blocks; chats it created/deleted are allowed as `+group/chat` / `-group/chat`). A card's `headerAllow` declares the rest item by item (`inventory.v2Stories:+id`; `:~id` = only that story's library copy changes, one `id@old` out, one `id@new` in; tokens `{story}`, `{story-books}` resolve at stop into `session.json` `declaredChanges`; comma items go through `--allow-file`). A `wizardAssets` card also gets exactly its wizard ledgers' additions (new session's whole `applied`, an existing session's growth against `inventory.wizardApplied`, new groups by id). `--served-identity`: with `bundle.served.sha256` identical at both ends, build-head/manifest drift is allowed and recorded in `warnings`. A failed diff, missing ack/JSONL or missing required artifact marks the session INVALID (exit 1); `digest` exits 1 on it.
- **Required evidence** (`requiredArtifacts`): every chat seen or created since `chatsBefore` (`chat-full-*`, `runtime-<chat>.json` = the whole `chat_metadata.story_orchestrator`), `transcripts.jsonl` with swipes, `wizard-drafts.json`, flag context, plus chapter records, folded payloads and harvested reasoning when enabled.
- **Blind rating packs** (C3, R4, Q-M, W6): live verbs take `--arm <label> [--gate <g>]`; stop rebuilds paired, shuffled, unlabelled packs with the key in a separate file. Only the user's verdicts move a gate.
- **Lanes**: `plan` schedules from the continuation graph; a lane holding a chat a later card continues is leased (`<lanes>/<n>/lease.json`). `adolion-fresh seed` refuses it unless `--for <dependent>` or `--break-lease`.

Autonomous driver (plan 15 Part B; per-card sequence in `docs/plans/v2.6/14-autonomous-runbook.md`):

```bash
node scripts/debug/so-session.mts plan --write                 # lanes 1-4, continuations pinned to their predecessor's lane
node scripts/debug/so-session.mts start T0-2 --age 24          # lane from lane-plan.json; --profile, --orchestrator <regex>
node scripts/debug/so-session.mts turn <dir> "<line>"          # the OPEN chat (refused unless a session chat; --chat <id>): send, every reply of the round, scheduler idle -> turns.jsonl
node scripts/debug/so-session.mts swipe-new|regen <dir>        # also: edit <dir> <mesid|last> "<text>", delete <dir> <mesid|last>
node scripts/debug/so-session.mts switch-chat-mid-gen <dir> "<line>" --to <chatId>   # and reload-mid-gen <dir> "<line>"
node scripts/debug/so-session.mts delete-chat <dir> <chatId> --book keep|delete|escape   # export first, /delchat, answer the lorebook prompt
node scripts/debug/so-session.mts flag <dir> "<note>" [--via drawer|slash]
node scripts/debug/so-session.mts shot <dir> <label>           # shots/NNN-<label>.png
node scripts/debug/so-session.mts age <dir> <hours>            # backdate the open chat's last session and reload
node scripts/debug/so-session.mts adopt <dir>                  # wizard cards: record the open chat as the session's chat
node scripts/debug/so-session.mts goal <dir> "<goal>" --mode review|auto-draft --new --go   # wizard Agent entry, no chat needed
node scripts/debug/so-session.mts agent <dir> state|go|continue|new-goal|mode <step|review|auto-draft>   # so-ui.mts agent-* without a session
node scripts/debug/so-session.mts mem <dir> pin|unpin|lock|unlock|exclude|edit <id|"text"> ["<new text>"]
node scripts/debug/so-session.mts setting <dir> <path> <json>  # one install-wide setting mid-session
node scripts/debug/so-session.mts score <dir> <row> works|annoying|broken|not-noticed "<note>" --evidence turns.jsonl:12   # INVALID session: needs --provisional
node scripts/debug/so-session.mts budget | runbook --write
```

`start` pins routing first (`page-pin.json`): selects and probes the main profile (a dead backend fails the start), checks every orchestrator role routes to DeepSeek, the judge state and key, and each role's reasoning effort. `stop` captures the live end state BEFORE killing the tails (`chat-full-<chat>.json` with swipes and `extra.reasoning`; `evidence-<chat>.json` with memory, chapters, canon, queues, call rings, stagecraft, talk, inline, journal, recap; `snapshot-<chat>.json`), runs `assert-player-clean` for player cards into `rubric.json`, and meters DeepSeek and judge spend into `session.json` and `test/sessions/BUDGET.md` (DeepSeek `usage` comes from the payload tail's response rows).

A session dir holds `session.json` (lane, pids, chats, build, `playFrom`), `run-header-start/end.json` + `run-header-diff.txt`, `journal.jsonl`, `payloads.jsonl`, `console.jsonl`, `turns.jsonl`, the tails' `*.log`, and after `stop` `journal-<chat>.json|md`, `chat-<chat>.json`, `state-end-<chat>.json`, `rubric.json`. `digest` reports flags with +-3 turns and anomalies with `path:line`: stall, extraction-rejected, empty-private-block, lore-force-lost, lore-constant-missed, judge-fallback (not `disabled`), save-lost, unexpected-jump, rollback, console-error (extension only), model-call-failure, harness-error. Fixtures: `scripts/debug/fixtures/session/{clean,planted}`.

### UI

```bash
node scripts/debug/so-ui.mts all|settings|drawer|open-drawer|drawer-tab <label>|open-settings|open-studio|studio|studio-tab <label>|screenshot [label]
```

Also `pipeline`, `assert-player-clean`, `inline [mesid]`, `inline-level <n>`, `hit-test`, `briefing`, `player-setup`, wizard (`open-wizard`, `wizard-run`, `wizard-apply`, ...), agent (`agent-accept`, `agent-apply`, ...), curator (`stagecraft`, `curator-accept|reject`), `memory-queue`, `model-calls`; `node scripts/debug/so-ui.mts --help` lists all.

Selectors: settings root `#story-orchestrator-settings`, story dropdown `#story-library-select`, drawer = ST top-bar drawer `#so-drawer` with content `#drawer-manager` (open when `.openDrawer`), HUD `#so-hud`, Open Studio `#so-open-studio`, Studio modal `#so-studio-modal` (native `<dialog>` portaled to body; `studio-tab <Graph|Story|Qualities|Checkpoints|Transitions|Roster|Diagnostics>`). The Studio button sits inside ST's collapsed inline-drawer — `so-ui open-studio` handles it. Drawer tabs depend on per-chat Author view (`extras.ui.authorView`): player mode shows Overview/Memory only — flip via the drawer checkbox or `rt.setUiSettings({authorView:true})` before asserting on Blackboard/Scheduler/Payload. ST rewrites `.menu_button` roles to `button`, so select drawer tabs via `#drawer-manager [role="tablist"] button`.

### Navigation

```bash
node scripts/debug/st-navigation.mts recent-group        # open most recent group chat — run before any inspection
node scripts/debug/st-navigation.mts new-group-session   # new session for current group
node scripts/debug/st-navigation.mts recent-group-new    # both — run before destructive tests
node scripts/debug/st-navigation.mts list-entities       # all groups (id, members, chat count) + characters (index, name, avatar)
node scripts/debug/st-navigation.mts open-group "<id|name>"
node scripts/debug/st-navigation.mts open-character "<name>"     # via /go
node scripts/debug/st-navigation.mts list-chats          # chat ids of the open group/character
node scripts/debug/st-navigation.mts open-chat "<chatId>"        # a chat of the current entity
node scripts/debug/st-navigation.mts new-chat            # fresh chat for the CURRENT entity (/newchat) — open-group first
# all accept --keep-open
```

Standard test loop: `open-group <id>` → `new-chat` → assert `ctx.groupId` → seed via `st-eval` → `send`/`trigger` → assertions → `/delchat` + `so-library remove` + `wipe-chat-meta`. Stories run in group chats only.

### Gate check scripts (assert-style, self-contained)

```bash
node scripts/debug/so-runtime-check.mts      # imports inline test story, sets quality, activates checkpoint, checks effects
node scripts/debug/so-extraction-check.mts   # imports story, /send compact, deterministic extraction via debugResponse
node scripts/debug/so-turn-types-check.mts   # TurnBridge types: /sd image + group greetings commit nothing, a real reply commits exactly one
node scripts/debug/so-responsive.mts --surface all   # 24 viewports: panel overflow + controls outside the viewport. NEEDS NO BACKEND
```

In-page handle `globalThis.storyOrchestratorRuntime` (`importStory(json)`, `runExtractionNow(response?, reason?)`, `getSnapshot()`) — also usable from `browser_evaluate` or `evaluateInST`.

### ST source search

```bash
node scripts/debug/st-search.mts "<pattern>" [--files *.js,*.ts] [--root <path>]
node scripts/debug/st-search.mts --event-types | --endpoints [path] | --context-exports | --module-exports <file>
```

Default root: `ST_ROOT` or the gitignored `.st-root` file (`scripts/lib/stRoot.mjs`); `--root` overrides.

### Library helpers (`scripts/debug/lib/`)

`connection.mts` (`connectToST`, `DEBUG_DIR`), `st-ready.mts` (`ensureSTReady`), `evaluate.mts` (`evaluateInST` — safe page.evaluate with error classification), `output.mts` (`writeJSON`/`writeText`/`writeScreenshot`), `cli.mts`, `settingsSave.mts` (`saveSettingsNow`), `authorSlash.mts`.

## Recipes

Standard snapshot:
```bash
node scripts/debug/st-navigation.mts recent-group
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts all
```

Checkpoint transition:
```bash
node scripts/debug/so-state.mts current
MSYS_NO_PATHCONV=1 node scripts/debug/st-actions.mts slash "/cp activate <id>"
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts screenshot after-transition
```

Generation failure:
```bash
node scripts/debug/st-context.mts mainApi onlineStatus
node scripts/debug/st-actions.mts generation-state
node scripts/debug/st-chat.mts 5
```
`onlineStatus` is a cached label: probe a profile with a real call before blaming the product. Then MCP `browser_console_messages` + `browser_network_requests` for the exploratory tail.

## Errors

| Message | Fix |
|---|---|
| `Executable doesn't exist` | `npx playwright install chromium` |
| `ERR_CONNECTION_REFUSED` | SillyTavern not running |
| `Unexpected token '<', "<!DOCTYPE "` from `executeSlashCommandsWithOptions` | The page's session is stale, not your command: every `/api/*` answers 403 + `text/html` (CSRF gone). `st-session.mts reload`, confirm `/api/settings/get` 200, then reopen your group (the reload lands on the welcome screen, `groupId: null`). |
| `CSRF token is stale` | Same cause, caught by `ensureSTReady`; reload and reopen the pinned chat. |
| `... is not a function` on a debug handle | Stale cached bundle: `st-session.mts reload`. |
| MCP browser tools see a different page/state than scripts | MCP launched its own Chromium (no `--cdp-endpoint`). `st-session start`, restart the Claude session so `.mcp.json` takes effect, verify with the `globalThis.__x` round-trip; until then trust scripts only. |
| MCP browser tools fail to connect | `st-session start` first — the cdp-endpoint config requires the shared browser to exist |
| `SillyTavern not loaded` | ST not ready yet — retry |
| `Settings panel not mounted` / `Drawer not mounted` | Extension not loaded / element not created |
