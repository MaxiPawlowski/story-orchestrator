# Debug Scripts

`scripts/debug/` is the live validation surface for Story Orchestrator against SillyTavern at `http://127.0.0.1:8000/`.

## Session Workflow

```bash
npm run debug:session -- start
npm run debug:state
npm run debug:scenario -- test/scenarios/plan03-extraction.json --sandbox
npm run debug:session -- stop
```

`st-session.mjs start` launches Chromium with CDP at `http://127.0.0.1:9222` and writes `.debug/session.json`. All scripts attach to that browser first and fall back to a short-lived headless browser when no session is running.

Use `--headed` when starting the session if you need to watch the browser.

Hang prevention:

- Connections and session startup use `ST_DEBUG_TIMEOUT_MS` (default 30000).
- Attached scripts disconnect from CDP instead of closing the shared browser.
- `st-session stop` kills the session process tree on Windows.
- `st-payload watch` exits after 60s by default; pass `--timeout-ms` for longer captures.
- Prefer these bounded scripts over WSL/tmux for normal gates; use WSL/tmux only for unrelated long-running app servers.

## Scripts Vs MCP

| Use | Tool |
|---|---|
| Deterministic state, actions, assertions, gate checks | debug scripts |
| Visual inspection, console/network review, ad-hoc clicks | Playwright MCP |

Playwright MCP is configured with `--cdp-endpoint http://127.0.0.1:9222`, so it needs `st-session start` first. If no session is running, MCP browser tools fail to connect; start the session and retry.

## Commands

| Script | Key commands |
|---|---|
| `st-session.mjs` | `start`, `stop`, `status` |
| `so-scenario.mjs` | `run <file.json> [--sandbox] [--keep]` |
| `so-mutation-check.mjs` | `[--keep]` |
| `so-state.mjs` | `current [--full] [--expect path=value]`, `all` |
| `st-actions.mjs` | `send`, `send-compact`, `slash`, `checkpoint`, `swipe`, `edit`, `delete`, `wi-status`, `wait-idle` |
| `st-payload.mjs` | `arm`, `last [n]`, `watch [n]` |
| `st-navigation.mjs` | `recent-group`, `new-group-session`, `recent-group-new` |
| `so-ui.mjs` | `all`, `settings`, `drawer`, `open-settings`, `open-studio`, `screenshot` |
| `so-library.mjs` | library summary or story detail |
| `st-search.mjs` | ST host source search, `--context-exports`, `--event-types`, `--endpoints` |

## Scenario Format

```json
{
  "steps": [
    { "import_story": { "file": "../fixtures/example.story.json" } },
    { "send": "I take the brass key." },
    { "extract": { "debugResponse": "DELTA q=player_has_key value=true evidence=\"I take the brass key\"" } },
    { "expand": { "debugResponse": "{\"beats\":[...]}" } },
    { "wait": { "checkpoint": "door", "timeoutMs": 10000 } },
    { "expect": { "activeCheckpoint": "door", "blackboard": { "player_has_key": true }, "latched": ["player_has_key"] } }
  ]
}
```

Supported steps: `import_story`, `select_story`, `send`, `send_generate`, `slash`, `extract`, `expand`, `swipe`, `edit`, `delete`, `wait`, `expect`.

`expect` can assert compact runtime state: `activeCheckpoint`, `blackboard`, `latched`, `auditCount>=`, `npcFired`, `requirementsReady`, `expansion`, `tension`, and `pacingPrompt`. Numeric leaves can use `{ "approx": 0.4, "tolerance": 0.000001 }`.

`--sandbox` opens the most recent group chat and starts `/newchat` before the scenario. Unless `--keep` is passed, it removes imported test stories and best-effort deletes the scratch chat.

Mutation event gate:

```bash
node scripts/debug/so-mutation-check.mts
```

This creates a scratch group chat, prepares one deterministic multi-swipe message, runs `swipe`, `edit`, and `delete`, then asserts ST emitted `MESSAGE_SWIPED`, `MESSAGE_EDITED`, and `MESSAGE_DELETED`.

## Payload Capture

```bash
node scripts/debug/st-payload.mts arm
node scripts/debug/st-actions.mts send "Trigger a generation"
node scripts/debug/st-payload.mts last
node scripts/debug/st-payload.mts watch 3 --timeout-ms 60000
```

Payload capture hooks fetch/XHR inside the shared page and records recent generation requests. Group generation attribution uses `GROUP_MEMBER_DRAFTED` when available.

## Swipe Recipe

For deterministic rollback tests, swipe an existing multi-swipe message:

```bash
node scripts/debug/st-actions.mts swipe 12 1
```

If the message has no target swipe, the command fails instead of triggering real generation.
