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

Start with `node scripts/debug/st-session.mts start` when using scripts and MCP together. Scripts attach to `.debug/session.json`; MCP attaches to `http://127.0.0.1:9222` via the repo `.mcp.json` (`--cdp-endpoint`), so both drive ONE browser. If MCP browser tools fail to connect, start the session and retry. **Warning**: an MCP playwright server configured without `--cdp-endpoint` (e.g. user-level default) silently launches its own isolated Chromium — state seeded there is invisible to the scripts and vice versa. Before any shared-state MCP work, verify with a marker round-trip: MCP `browser_evaluate` sets `globalThis.__x`, then `st-eval.mts "globalThis.__x"` must return it.

Do not use unbounded terminal processes for gates. Debug scripts have hard connection timeouts (`ST_DEBUG_TIMEOUT_MS`, default 30000), `st-payload watch` has a default 60s timeout, and `st-session stop` cleans up the Windows process tree. Use WSL/tmux only for unrelated long-running app servers, not for these validation scripts.

## Prerequisites

- SillyTavern running at `http://127.0.0.1:8000/` with an LLM backend connected.
- `npx playwright install chromium` if browser binaries missing.

Scripts run via `node scripts/debug/<tool>.mts`, attach to the shared session first, otherwise launch a short-lived headless Chromium. Artifacts go to `.debug/` (gitignored; screenshots in `.debug/screenshots/`).

## Real-LLM validation (default gate)

Handover sign-off for LLM-consuming paths requires the real model, not `debugResponse` mocks. Mocks (`storyOrchestratorDebug*Response` globals, scenario `extract`/`expand` step values) stay valid for unit determinism and scenario plumbing — never for sign-off.

Prerequisites: extraction Connection Manager profile selected in extension settings (`#stepthink_settings` profile picker; visible as `extraction.settings.profileId` in `so-state.mts current`). If ST is down, no backend connected, or no profile selected: state it at handover and flag the gate NOT green — do not silently fall back to mocks.

Triggering real passes (all route through `callExtractionModel` — real path = profile set + no `debugResponse`):

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

## Script reference

### State & data

```bash
node scripts/debug/so-state.mts current        # primary runtime snapshot: chatId, groupId, selectedStoryHash, activeCheckpointId, boundary, visitedAnchors, blackboard, versions, latched, requirements, firedNpcReplies, extraction (settings, scheduler, auditCount, lastAudit incl. prompt/rawResponse/acceptedDeltas)
node scripts/debug/so-state.mts current --expect bb.player_has_key=true
node scripts/debug/so-state.mts all --full
node scripts/debug/so-library.mts              # v2 story library (extensionSettings["story-orchestrator"].v2Stories)
node scripts/debug/so-library.mts <hash>       # full v2 story record
node scripts/debug/so-library.mts remove "<hash|title>"       # remove from library + flush settings (test cleanup)
node scripts/debug/so-library.mts wipe-chat-meta [--hash h]   # delete chat_metadata.story_orchestrator from current chat
node scripts/debug/so-library.mts --legacy     # old v1 studio store
node scripts/debug/st-eval.mts "<js>"          # run async JS in the ST page; ctx + rt in scope; bare expression or statements with return
node scripts/debug/st-eval.mts --file <path>   # same, snippet from file — replaces throwaway one-off .mts scripts
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
node scripts/debug/st-actions.mts trigger <member>              # draft a specific group member (/trigger await=true; real generation!)
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

Steps: `import_story`, `select_story`, `send`, `send_generate`, `slash`, `extract`, `expand`, `eval`, `swipe`, `edit`, `delete`, `wait`, `expect`. `--sandbox` starts `/newchat`; cleanup removes imported stories and best-effort deletes the scratch chat unless `--keep` is passed.

Real-LLM scenarios: `test/scenarios/live-plan*.json` + `plan08-hygiene.json` run every step against the real backend (no `debugResponse`). Tolerant wait verbs for nondeterminism: `acceptedDelta`, `reconciliationEvents`, `memoryEntries` (+`memoryTier`), `arcsSummarized`, `canonPresent`. After real `send_generate`, wait on `boundary`, not `idle` — group activation can lag and `idle` passes before generation starts.

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
node scripts/debug/st-navigation.mts list-entities       # all groups (id, members, chat count) + characters (index, name, avatar)
node scripts/debug/st-navigation.mts open-group "<id|name>"      # open a specific group
node scripts/debug/st-navigation.mts open-character "<name>"     # open a character (via /go — no DOM dependency)
node scripts/debug/st-navigation.mts list-chats          # chat ids of the open group/character
node scripts/debug/st-navigation.mts open-chat "<chatId>"        # open a specific chat of the current entity
node scripts/debug/st-navigation.mts new-chat            # fresh chat for current group OR character (/newchat)
# all accept --keep-open
```

Standard test loop: `open-group` → `new-chat` → seed via `st-eval` → `send`/`trigger` → assertions → `/delchat` + `so-library remove` + `wipe-chat-meta`.

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
| MCP browser tools connect but see different state than scripts (chat/group/runtime mismatch) | MCP launched its own Chromium (server missing `--cdp-endpoint`). Run `st-session start`, restart the Claude session so `.mcp.json` takes effect, verify with the `globalThis.__x` marker round-trip |
| MCP browser tools fail to connect | `st-session start` first — the cdp-endpoint config requires the shared browser to exist |
