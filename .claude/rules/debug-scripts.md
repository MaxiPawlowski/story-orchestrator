# Debug Scripts

Playwright tools in `scripts/debug/` — connect to SillyTavern at `http://127.0.0.1:8000/`, read/mutate extension state, write artifacts to `.debug/` (gitignored, screenshots in `.debug/screenshots/`).

Run via `node scripts/debug/<tool>.mjs [args]` or npm aliases: `npm run debug:session -- start`, `npm run debug:state`, `npm run debug:scenario -- <scenario.json>`. Full playbook: **`.claude/skills/debug/SKILL.md`** — load the `debug` skill for live/E2E work.

## Scripts vs Playwright MCP

- Scripts = deterministic reads/actions/assertions; anything a gate depends on; anything run twice.
- MCP `browser_*` tools = exploratory only (snapshot, screenshot, console, network, ad-hoc evaluate/clicks). Never chain MCP calls into a validation when a script exists.
- Shared browser first: run `node scripts/debug/st-session.mts start` before combining scripts and MCP. Both attach to CDP `http://127.0.0.1:9222` and see the same page.
- No unbounded gates: scripts use `ST_DEBUG_TIMEOUT_MS` (default 30000), `st-payload watch` times out by default, and `st-session stop` kills the Windows process tree.

## Tools

| Script | Key args | Returns |
|---|---|---|
| `st-session.mjs` | `start\|stop\|status [--headed]` | Shared CDP browser lifecycle |
| `so-scenario.mjs` | `run <file.json> [--sandbox] [--keep]` | Declarative gate runner with assertions and exit code |
| `so-mutation-check.mjs` | `[--keep]` | Real swipe/edit/delete event-emission gate |
| `so-state.mjs current` | — | Active chat: selectedStoryHash, activeCheckpointId, boundary, visitedAnchors, blackboard, latched, requirements, extraction (scheduler, auditCount, lastAudit incl. prompt/rawResponse) |
| `so-state.mjs current --expect bb.key=value` | `--full` | Compact state plus assertion exit code |
| `so-library.mjs [<storyId>]` | — | Story library summary or full story definition |
| `so-ui.mjs <all\|settings\|drawer\|open-settings\|open-studio\|screenshot>` | — | UI surface state or actions |
| `st-context.mjs [keys...]` | — | SillyTavern getContext() fields |
| `st-extension-settings.mjs [--all]` | — | Extension settings for story-orchestrator (or all) |
| `st-chat.mjs [count\|metadata]` | — | Last N messages or chat_metadata |
| `st-actions.mjs <generation-state\|wait-idle\|send\|send-compact\|slash\|checkpoint\|swipe\|edit\|delete\|wi-status>` | text / cmd / id | Send messages, mutate chat, run slash commands, query WI entry state |
| `st-payload.mjs <arm\|last\|watch>` | count | Capture generation payloads in the shared page |
| `st-navigation.mjs <recent-group\|recent-group-new\|new-group-session>` | `--keep-open` | Open/create group chat sessions |
| `st-search.mjs <pattern\|--event-types\|--endpoints\|--context-exports\|--module-exports>` | `--files`, `--root` | Grep ST host source |
| `so-runtime-check.mjs` | — | Thin wrapper around `test/scenarios/plan02-runtime.json` |
| `so-extraction-check.mjs` | — | Thin wrapper around `test/scenarios/plan03-extraction.json` |

`so-state.mjs current` is the primary runtime snapshot (reads persisted `chatMetadata.story_orchestrator` — live in-page values between persists may differ).

## Standard snapshot

```bash
node scripts/debug/st-session.mts start
node scripts/debug/st-navigation.mts recent-group
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts all
```

## Errors

| Message | Fix |
|---|---|
| `Executable doesn't exist` | `npx playwright install chromium` |
| `ERR_CONNECTION_REFUSED` | SillyTavern not running |
| `SillyTavern not loaded` | ST not ready yet — retry |
| `Settings panel not mounted` | Extension not loaded |
