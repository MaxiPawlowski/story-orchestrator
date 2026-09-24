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

**Two isolated sessions at once** (v2.3 plan 11's concurrent-load recipe) = `ST_DEBUG_CDP_PORT=<port>` **and** `SO_DEBUG_DIR=<dir>` per process. The port alone is not enough: two processes sharing one `.debug/` also share `session.json` (the second `st-session start` overwrites the first's record), the journey config snapshot and the asset baseline, so the second run's cleanup reads the first's state. `SO_DEBUG_DIR` (unset = `.debug/`) is resolved against the project root unless it is absolute; a custom directory is **not** gitignored, so keep it under `.debug*` or clean it yourself. Guarded by `scripts/debug/lib/connection.test.mts`.

## Real-LLM validation (default gate)

Handover sign-off for LLM-consuming paths requires the real model, not `debugResponse` mocks. Mocks (`storyOrchestratorDebug*Response` globals, scenario `extract`/`expand` step values) stay valid for unit determinism and scenario plumbing — never for sign-off.

Prerequisites: extraction Connection Manager profile selected in extension settings (`#story-orchestrator-settings` profile picker; visible as `extraction.settings.profileId` in `so-state.mts current`). If ST is down, no backend connected, or no profile selected: state it at handover and flag the gate NOT green — do not silently fall back to mocks.

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

Steps: `import_story`, `select_story`, `send`, `send_generate`, `slash`, `extract`, `expand`, `eval`, `swipe`, `edit`, `delete` (tail-truncate: cuts the chat at the id; a middle delete is `host_delete`, a range `cut`), `wait`, `expect`, plus v2.4's `host_delete`, `cut`, `emit_generation`, `ext_setting`, `record_state` + `expect.stateEquals`, `inject_script`. `--sandbox` starts `/newchat`; cleanup removes imported stories and best-effort deletes the scratch chat unless `--keep` is passed.

Real-LLM scenarios: `test/scenarios/live-plan*.json` + `plan08-hygiene.json` + `live-memory-mirror.json` (the per-chat memory WI book: created without a reload, chat-bound, fires in a real generation; clean up with `so-assets.mts remove --marker SO-MIRROR`) + `live-curator-write.json` (J8's story and lorebook. It accepts whatever the real curator proposes and checks the server file, plus every main-generation prompt via `GENERATE_AFTER_DATA`, against a before-control. The author advances to `tavern` before the pass, because the curator reads only the checkpoint and canon, never the chat. It needs the curator on in review mode; clean up with `--marker SO-J8`) run every step against the real backend (no `debugResponse`). Tolerant wait verbs for nondeterminism: `acceptedDelta`, `reconciliationEvents`, `memoryEntries` (+`memoryTier`), `arcsSummarized`, `canonPresent`. After real `send_generate`, wait on `boundary`, not `idle` — group activation can lag and `idle` passes before generation starts.

### Test assets (wizard / curator runs)

```bash
node scripts/debug/so-assets.mts list --marker SO-J9          # dry run — ALWAYS before remove
node scripts/debug/so-assets.mts remove --marker SO-J9        # delete + leak re-check
node scripts/debug/so-assets.mts assert-clean --marker SO-J9
```

The scope is marker-prefixed names, plus the created-asset ledger (`wizardSessions[].applied`) of **test** sessions only, i.e. keys starting with the slugged marker (`so-j9-wizard`). A real author's wizard sessions and their assets are never read, deleted or cleared. A journey (`cleanup.removeCreatedAssets`, `assets` steps) also passes the `snapshotAssets` baseline it took before setup. That counts ledger entries recorded during the run in any session, spares assets that existed before (`protected`), and drops only this run's own sessions. `list` output: `ledger` (name, session, `test-session`/`this-run`), `sessions`, `protected`, plus `baselineUntrusted` when a baseline was refused. An empty `--marker` is refused.

**An empty baseline is "unknown", not "nothing".** `snapshotAssets` marks one untrusted when the settings root is absent or ST has not listed characters/lorebooks yet, and cleanup then falls back to marker-only scope. Before that guard existed, an empty baseline classified every foreign wizard session's ledger as `this-run` and deleted real user assets while reporting `clean:true`. Each run writes its baseline to `.debug/so-journey-asset-baseline.json` — read it first when cleanup deleted something it should not have.

### Payloads

```bash
node scripts/debug/st-payload.mts arm
node scripts/debug/st-payload.mts last
node scripts/debug/st-payload.mts watch 3 --timeout-ms 60000
```

Payload capture hooks fetch/XHR in the shared page and records recent generation payloads with group draft member attribution when ST emits it.

### UI

```bash
node scripts/debug/so-ui.mts all|settings|drawer|open-settings|open-studio|studio|studio-tab <label>|screenshot [label]
```

Selectors: settings root `#story-orchestrator-settings`, story dropdown `#story-library-select`, arbiter frequency `#story-arbiter-frequency`, drawer = ST top-bar drawer `#so-drawer` with content `#drawer-manager` (open when `.openDrawer`; `so-ui open-drawer` opens it), HUD strip `#so-hud` above the chat input, **Open Studio button `#so-open-studio`, v2 Studio modal `#so-studio-modal`** (portaled to `document.body`; tabs `[role="tab"]`; `studio` verb reports title/active tab/error+issue badges; `studio-tab <Graph|Qualities|Checkpoints|Transitions|Diagnostics>` switches). The button lives inside ST's collapsed inline-drawer — `so-ui open-studio` clicks it; if driving by hand, the button may be `display:none` until the drawer is expanded. Drawer tabs depend on the per-chat "Author view" toggle (`extras.ui.authorView`): player mode shows Overview/Memory only — flip via the drawer-header checkbox or `rt.setUiSettings({authorView:true})` before asserting on Blackboard/Scheduler/Payload.

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
node scripts/debug/so-turn-types-check.mts   # TurnBridge types: /sd image + new-group greetings + solo greeting reopen/swipe commit nothing, a real reply commits exactly one
node scripts/debug/so-responsive.mts --surface all   # 24 viewports (320x568 → 2560x1440): our panels' horizontal overflow + any control outside the viewport. NEEDS NO BACKEND
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
| **`Unexpected token '<', "<!DOCTYPE "` from `executeSlashCommandsWithOptions`** | **The page's session is stale, not your slash command.** ST answers 200 on `/` while every `/api/*` call returns **403 + `text/html`** — its CSRF cookie is gone from the page's jar. Almost every script's first navigation (`/newchat`, `/go`) runs a slash command, so this surfaces as a confusing parse error in a helper you did not touch. Diagnose in one call, then reload (2026-09-21): swap `window.fetch` for a wrapper that records any response whose `content-type` is not JSON, call the command, restore. A single `location.reload()`, a ~12 s wait, and `/api/settings/get` returning 200 confirms the fix. The reload lands on the welcome screen with `groupId: null` — reopen your group before continuing. |
| MCP browser tools see a different page than the scripts (`about:blank`, marker round-trip fails) | The MCP server launched its own Chromium. Verify with the `globalThis.__x` marker round-trip above and fall back to scripts only; do not trust MCP state for anything. |
| `SillyTavern not loaded` | ST not ready yet — retry |
| `Settings panel not mounted` / `Drawer not mounted` | Extension not loaded / element not created |
| MCP browser tools connect but see different state than scripts (chat/group/runtime mismatch) | MCP launched its own Chromium (server missing `--cdp-endpoint`). Run `st-session start`, restart the Claude session so `.mcp.json` takes effect, verify with the `globalThis.__x` marker round-trip |
| MCP browser tools fail to connect | `st-session start` first — the cdp-endpoint config requires the shared browser to exist |
