# Debug Scripts

Playwright tools in `scripts/debug/` — connect to SillyTavern at `http://127.0.0.1:8000/`, read/mutate extension state, write artifacts to `.debug/` (gitignored, screenshots in `.debug/screenshots/`).

Run via `node scripts/debug/<tool>.mjs [args]`.

## Tools

| Script | Key args | Returns |
|---|---|---|
| `so-state.mjs current` | — | Active chat: checkpointIndex, activeCheckpointKey/Name, turnsSinceEval, checkpointTurnCount, checkpointStatusMap (enriched), storySelected, activeStory, groupId |
| `so-state.mjs` | — | All persisted chat states |
| `so-library.mjs [<storyId>]` | — | Story library summary or full story definition |
| `so-ui.mjs <all\|settings\|drawer\|open-settings\|open-studio\|screenshot>` | — | UI surface state or actions |
| `st-context.mjs [keys...]` | — | SillyTavern getContext() fields |
| `st-extension-settings.mjs [--all]` | — | Extension settings for story-orchestrator (or all) |
| `st-chat.mjs [count\|metadata]` | — | Last N messages or chat_metadata |
| `st-actions.mjs <generation-state\|wait-idle\|send\|slash\|checkpoint>` | text / cmd / id | Send messages, run slash commands, trigger/eval checkpoints |
| `st-navigation.mjs <recent-group\|recent-group-new\|new-group-session>` | `--keep-open` | Open/create group chat sessions |
| `st-search.mjs <pattern\|--event-types\|--endpoints\|--context-exports\|--module-exports>` | `--files`, `--root` | Grep ST host source |

`so-state.mjs current` is the primary runtime snapshot (reads persisted extensionSettings — live Zustand values between persists may differ).

## Standard snapshot

```bash
node scripts/debug/st-navigation.mjs recent-group
node scripts/debug/so-state.mjs current
node scripts/debug/so-ui.mjs all
```

## Errors

| Message | Fix |
|---|---|
| `Executable doesn't exist` | `npx playwright install chromium` |
| `ERR_CONNECTION_REFUSED` | SillyTavern not running |
| `SillyTavern not loaded` | ST not ready yet — retry |
| `Settings panel not mounted` | Extension not loaded |
