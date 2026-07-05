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

Start with `node scripts/debug/st-session.mts start` when using scripts and MCP together. Scripts attach to `.debug/session.json`; MCP attaches to `http://127.0.0.1:9222`. If MCP browser tools fail to connect, start the session and retry.

Do not use unbounded terminal processes for gates. Debug scripts have hard connection timeouts (`ST_DEBUG_TIMEOUT_MS`, default 30000), `st-payload watch` has a default 60s timeout, and `st-session stop` cleans up the Windows process tree. Use WSL/tmux only for unrelated long-running app servers, not for these validation scripts.

## Prerequisites

- SillyTavern running at `http://127.0.0.1:8000/` with an LLM backend connected.
- `npx playwright install chromium` if browser binaries missing.

Scripts run via `node scripts/debug/<tool>.mts`, attach to the shared session first, otherwise launch a short-lived headless Chromium. Artifacts go to `.debug/` (gitignored; screenshots in `.debug/screenshots/`).

## Script reference

### State & data

```bash
node scripts/debug/so-state.mts current        # primary runtime snapshot: chatId, groupId, selectedStoryHash, activeCheckpointId, boundary, visitedAnchors, blackboard, versions, latched, requirements, firedNpcReplies, extraction (settings, scheduler, auditCount, lastAudit incl. prompt/rawResponse/acceptedDeltas)
node scripts/debug/so-state.mts current --expect bb.player_has_key=true
node scripts/debug/so-state.mts all --full
node scripts/debug/so-library.mts [<storyId>]  # library summary | full story definition
node scripts/debug/st-context.mts [keys...]    # getContext() summary or specific keys (chatId mainApi ...)
node scripts/debug/st-extension-settings.mts [--all]
node scripts/debug/st-chat.mts [count|metadata]  # last N messages (default 10) or chat_metadata
```

`so-state` reads persisted `chatMetadata.story_orchestrator` (keyed by `selectedStoryHash`) — live in-page values between persist cycles may differ. Raw blob also visible via `st-chat.mts metadata`.

### Actions

```bash
node scripts/debug/st-actions.mts generation-state
node scripts/debug/st-actions.mts wait-idle [timeout_ms]        # default 30s
node scripts/debug/st-actions.mts send <text>                   # triggers real LLM generation!
node scripts/debug/st-actions.mts send-compact <text>           # /send compact=true, no generation
node scripts/debug/st-actions.mts slash "/checkpoint list"
node scripts/debug/st-actions.mts checkpoint <id_or_index|list|eval>
node scripts/debug/st-actions.mts swipe <messageId> [swipeId]
node scripts/debug/st-actions.mts edit <messageId> <text>
node scripts/debug/st-actions.mts delete <messageId>
node scripts/debug/st-actions.mts wi-status <book> <comment>
```

For deterministic swipe tests, use an existing multi-swipe message. The command fails instead of overswiping into real generation.

### Scenarios

```bash
node scripts/debug/so-scenario.mts run test/scenarios/plan03-extraction.json --sandbox
node scripts/debug/so-mutation-check.mts
node scripts/debug/so-runtime-check.mts
node scripts/debug/so-extraction-check.mts
```

Steps: `import_story`, `select_story`, `send`, `send_generate`, `slash`, `extract`, `swipe`, `edit`, `delete`, `wait`, `expect`. `--sandbox` starts `/newchat`; cleanup removes imported stories and best-effort deletes the scratch chat unless `--keep` is passed.

### Payloads

```bash
node scripts/debug/st-payload.mts arm
node scripts/debug/st-payload.mts last
node scripts/debug/st-payload.mts watch 3 --timeout-ms 60000
```

Payload capture hooks fetch/XHR in the shared page and records recent generation payloads with group draft member attribution when ST emits it.

### UI

```bash
node scripts/debug/so-ui.mts all|settings|drawer|open-settings|open-studio|screenshot [label]
```

Selectors: settings root `#stepthink_settings`, story dropdown `#story-library-select`, arbiter frequency `#story-arbiter-frequency`, drawer `#drawer-manager` (open when `.pinnedOpen`), Studio modal `#checkpoint-editor-modal-root`.

### Navigation

```bash
node scripts/debug/st-navigation.mts recent-group        # open most recent group chat — run before any inspection
node scripts/debug/st-navigation.mts new-group-session   # new session for current group
node scripts/debug/st-navigation.mts recent-group-new    # both — run before destructive tests
# all accept --keep-open
```

### Gate check scripts (assert-style, self-contained)

```bash
node scripts/debug/so-runtime-check.mts      # plan 02: imports inline test story, sets quality, activates checkpoint, checks effects
node scripts/debug/so-extraction-check.mts   # plan 03: imports story, /send compact, runs deterministic extraction via debugResponse
```

Both use the in-page debug handle `globalThis.storyOrchestratorRuntime` (`importStory(json)`, `runExtractionNow(response, cueId)`) — also usable directly from `browser_evaluate` or `evaluateInST` for ad-hoc runtime poking.

### ST source search

```bash
node scripts/debug/st-search.mts "<pattern>" [--files *.js,*.ts] [--root <path>]
node scripts/debug/st-search.mts --event-types | --endpoints [path] | --context-exports | --module-exports <file>
```

Default root: fixed-depth walk (5 up from project root → `C:\dev\SillyTavern-MainBranch`), verified working; `--root` overrides.

### Library helpers (`scripts/debug/lib/`)

`connection.mts` (`connectToST`, `DEBUG_DIR`), `st-ready.mts` (`ensureSTReady`), `evaluate.mts` (`evaluateInST` — safe page.evaluate with error classification), `output.mts` (`writeJSON`/`writeText`/`writeScreenshot`), `cli.mts`.

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
node scripts/debug/st-actions.mts checkpoint 2
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts screenshot after-transition
```

Generation failure:
```bash
node scripts/debug/st-context.mts mainApi onlineStatus
node scripts/debug/st-actions.mts generation-state
node scripts/debug/st-chat.mts 5
```
Then MCP `browser_console_messages` + `browser_network_requests` for the exploratory tail.

## Errors

| Message | Fix |
|---|---|
| `Executable doesn't exist` | `npx playwright install chromium` |
| `ERR_CONNECTION_REFUSED` | SillyTavern not running |
| `SillyTavern not loaded` | ST not ready yet — retry |
| `Settings panel not mounted` / `Drawer not mounted` | Extension not loaded / element not created |
