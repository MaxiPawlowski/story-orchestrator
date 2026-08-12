# Debug Scripts

`scripts/debug/` is the live validation surface for Story Orchestrator against SillyTavern at `http://127.0.0.1:8000/`.

## Session Workflow

```bash
npm run debug:session -- start
npm run debug:state
npm run debug:scenario -- test/scenarios/plan03-extraction.json --sandbox
npm run debug:session -- stop
```

`st-session.mts start` launches Chromium with CDP at `http://127.0.0.1:9222` and writes `.debug/session.json`. All scripts attach to that browser first and fall back to a short-lived headless browser when no session is running.

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

Playwright MCP is configured via the repo `.mcp.json` (`npx @playwright/mcp@latest --cdp-endpoint=http://127.0.0.1:9222`), so scripts and MCP share ONE browser — but only after `st-session start`. If no session is running, MCP browser tools fail to connect; start the session and retry. A user-level playwright MCP server without `--cdp-endpoint` launches its own isolated Chromium whose state is invisible to the scripts (this bit us live: seeded runtime state on the MCP browser, sends going to a different chat on the script browser). Use only the project-configured server for shared-state work, and verify with a marker round-trip: MCP `browser_evaluate` sets `globalThis.__x`, `st-eval.mts "globalThis.__x"` must read it.

## Commands

| Script | Key commands |
|---|---|
| `st-session.mts` | `start`, `stop`, `status` |
| `so-scenario.mts` | `run <file.json> [--sandbox] [--keep]` |
| `so-journey.mts` | `--list`, `run <id\|file> [--strict] [--keep] [--only ids] [--no-config]`, `restore-config [--file p]` |
| `so-journal.mts` | `export [--md\|--json] [--kind k,k] [--limit n]`, `show` |
| `so-mutation-check.mts` | `[--keep]` |
| `so-state.mts` | `current [--full] [--expect path=value]`, `all` |
| `st-actions.mts` | `send`, `send-compact`, `trigger <member>`, `slash`, `checkpoint`, `swipe`, `edit`, `delete`, `wi-status`, `wait-idle` |
| `st-payload.mts` | `arm`, `last [n]`, `watch [n]` |
| `st-navigation.mts` | `recent-group`, `new-group-session`, `recent-group-new`, `list-entities`, `open-group <id\|name>`, `open-character <name>`, `list-chats`, `open-chat <chatId>`, `new-chat` |
| `st-eval.mts` | `"<js>"` or `--file <path>` — run an async snippet in the ST page with `ctx` (getContext()) and `rt` (runtime handle) in scope, JSON result |
| `so-ui.mts` | `all`, `settings`, `drawer`, `open-settings`, `open-studio`, `studio`, `studio-tab <label>`, `drawer-tab <Overview\|Blackboard\|Memory\|Scheduler\|Payload>`, `screenshot` |
| `so-copilot.mts` | `context`, `suggest [--debug j]`, `report [--debug j]`, `nudge <text>`, `clear-nudge`, `probe [--debug d]`, `advance <id>`, `stage <stage> [--message m] [--debug j]` |
| `so-library.mts` | v2 library summary, `<hash>` detail, `remove <hash\|title>`, `wipe-chat-meta [--hash h]`, `--legacy` |
| `so-live-suite.mts` | `run [--min 0.9] [--filter <substr>] [--record]` — real-model delta accuracy over `test/fixtures/extractor*` triples; exact-match on `{q,v}` |
| `st-search.mts` | ST host source search, `--context-exports`, `--event-types`, `--endpoints` |

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

Supported steps: `import_story`, `select_story`, `send`, `send_generate`, `slash`, `extract`, `expand`, `eval`, `copilot`, `ui`, `reload`, `swipe`, `edit`, `delete`, `wait`, `expect`, `expect_ui`.

`send_generate` also takes `{ "text": "...", "timeoutMs": 300000 }` — group turns on a local model regularly need minutes.

`ui` drives the real surfaces: `{ "ui": { "action": "open-drawer" } }`, `drawer-tab` / `studio-tab` (+`label`), `open-settings`, `select-profile` (picks the memory profile through the settings panel; `ST_DEBUG_PROFILE=<name>` disambiguates), `open-studio`, `close-studio`, `flag` (+`note` — files a session-journal flag through the drawer control), `screenshot`.

`reload` reloads the ST page, waits for the extension handle and reopens the chat (`{ "reload": { "timeoutMs": 90000, "reopenChat": false } }`) — the honest path for hydration, migration and "return after a gap" checks.

`expect_ui` asserts visible text: `{ "expect_ui": { "selector": "#drawer-manager", "contains": [...], "notContains": [...], "timeoutMs": 5000 } }`. It retries until the timeout, so React re-renders and ST popups do not race it.

`copilot` drives plan 12: `{ "copilot": { "action": ... } }`. Actions: `stage` (`{ draft, stage, message?, debug? }` — runs an authoring stage on the given draft and throws if the proposal is invalid), `suggest`/`report` (`{ debug? }`), `nudge` (`{ text }`), `clear-nudge`, `probe` (`{ debug? }` — P0 forced extraction, reason=probe), `advance` (`{ id }` — manual checkpoint activation). Omit `debug` for a real-LLM run. `expect` gains `copilot: { enabled?, activeNudge?, nudgeInjected? }` (`nudgeInjected` reflects `ctx.extensionPrompts.story_copilot_nudge`). `so-state current` surfaces `copilot.{enabled, activeNudge, nudgeInjected}`.

`eval` runs arbitrary JS in the ST page (access to `globalThis.storyOrchestratorRuntime`, debug response globals); use it to toggle runtime state like extraction settings.

`expect` can assert compact runtime state: `activeCheckpoint`, `blackboard`, `latched`, `auditCount>=`, `npcFired`, `requirementsReady`, `expansion`, `tension`, `pacingPrompt`, `convergence`, and `reconciliationEvents>=`. Numeric leaves can use `{ "approx": 0.4, "tolerance": 0.000001 }`.

`convergence` expects a list of `{ anchorId, progress?, threshold?, reached? }` matched against the live snapshot's convergence readout.

`memory` expects `{ "<tier>": { "count"?: number, "contains"?: string[] } }` against the live memory snapshot's entries (tiers: `facts`, `session_details`, `short_term`, `scene_history`). `sceneBreaks>=` checks `memory.sceneCount`. `memoryInjection` expects `{ "<tier>": boolean }` — whether `ctx.extensionPrompts.story_orchestrator_memory_<tier>` currently has non-empty content.

`arcs` expects `{ open?, resolved?, summarized?, openContains?: string[], resolvedContains?: string[] }` against the live memory snapshot's `arcs`. `canon` expects `{ present?: boolean, contains?: string[] }` against the derived canon (`memory.canon.text`). `so-state current` surfaces `memory.{openArcCount, resolvedArcCount, arcSummaryCount, canonPresent, canonHash}`.

`epistemic` expects `{ count?: number, contains?: [{ subject, tag, contains, hiddenFrom? }] }` against the live memory snapshot's active (non-superseded) `epistemic` entries. `ledger` expects `{ count?: number, contains?: [{ entity, field, value }] }` against the stored (unbound) `ledger` entries — blackboard-mirrored bound rows only appear in `runtime.getLedger()`, so assert those with an `eval` step. `capability` expects a boolean against `memory.settings.epistemicLedgerCapable`. `so-state current` surfaces `memory.{epistemicCount, hidingCount, ledgerCount, epistemicLedgerCapable}`.

`expect` also takes `activeCheckpointIn: [ids]` — real-model runs can overshoot a checkpoint between polls.

`wait` verbs: `idle`, `boundary`, `auditCount`, `acceptedDelta` (a delta for the named quality accepted in any audit), `expansionStatus`, `checkpoint`, `checkpointNot`, `checkpointIn`, `progress` (+`progressAnchor`), `reconciliationEvidence`, `reconciliationEvents` (count >=), `memoryEntries` (count >=, +`memoryTier`), `arcsSummarized` (resolved arcs with summaries >=), `canonPresent`, `backfillComplete` (waits for `memory.backfill.running === false` with `processed === total`).

Real-LLM scenarios (no `debugResponse`; extraction profile must be selected — see the debug skill's "Real-LLM validation" section): `live-plan02-runtime.json`, `live-plan03-extraction.json`, `live-plan04-pacing.json`, `live-plan05-expansion.json`, `live-plan06-convergence.json`, `live-plan07-memory.json`, `plan08-hygiene.json`, `live-plan09-arcs.json`, `live-plan12-copilot.json`. These assert pipeline behavior (audits, tier writes, fired transitions, copilot wiring), not exact model output; the tolerant `wait` verbs above exist for them. `plan12-copilot.json` is the mocked (debug-response) copilot scenario.

`/cp` slash commands: `list`, `state`, `activate <id>`, `set <quality> <value>`, `extract [response]`, `expand [response]`, `converge` (dumps per-anchor progress/threshold), `memorize` (runs the memorize-backlog mid-chat adoption pass).

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

## Journeys (v2.1 layer 5)

```bash
node scripts/debug/so-journey.mts --list
node scripts/debug/so-journey.mts run J3
```

`so-journey` wraps — never forks — the `so-scenario` step engine and adds the composition layer:
fresh-start setup, per-check outcomes and the human checklist. Catalog and check tables live in
`docs/plans/v2.1/test-plan.md`; files are `test/journeys/*.journey.json`.

- **Setup**: `newChat`, `resetChatState`, `group`, `snapshotGlobalConfig`, `clearGlobalConfig`.
  Only `extensionSettings["story-orchestrator"]` is ever touched — never other extensions, never
  Connection Manager profiles. The snapshot lands in `.debug/so-journey-config-snapshot.json`
  *before* clearing; `so-journey.mts restore-config` re-applies it after a crashed run.
- **Cleanup**: `restoreConfig`, `removeImportedStories`, `deleteChat`, `enableMembers` (put the group
  roster back after `cast_changes` disabled someone — see `.claude/rules/debug-scripts.md`).
- **Outcomes**: `pass` · `fail` · `blocked` (a `requires: [capability]` the build lacks) ·
  `not-runnable` (`status: "reserved"` journeys) · `skipped`. Exit 1 on any `fail`, or on `blocked`
  with `--strict` (acceptance mode).
- **Capabilities** are probed lazily, right before the first check that needs one, so a check may
  depend on a surface an earlier check opened.
- Human checks print as a checklist with 1–5 anchors plus the standing question
  ("What would make you stop using this?"). Artifacts: `.debug/journey-<id>.md` + `.json`.

## Session journal

```bash
node scripts/debug/so-journal.mts export
node scripts/debug/so-journal.mts show --kind transition,delta --limit 40
```

Correlates the persisted rings (boundary log, transitions, extraction audits, accepted deltas,
reconciliation, payload captures, talk decisions) with status changes and player flags onto one
timeline; in-page handle `storyOrchestratorRuntime.getSessionJournal()`. The drawer's ⚑ control
(`#so-flag-moment`, note field `#so-flag-note`, submit `#so-flag-submit`) files a flag at the
current boundary — that is what a human-eval session hands back with the export.
