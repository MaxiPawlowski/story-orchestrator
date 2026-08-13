# Debug Scripts

For any live/E2E work, load the **`debug` skill** (`.claude/skills/debug/SKILL.md`) — full tool reference, recipes, error table. Also: `scripts/debug/README.md`.

Essentials:

- Scripts are `.mts`, run directly: `node scripts/debug/<tool>.mts`. Artifacts → `.debug/` (gitignored).
- Responsive testing: prefix EVERY command with `ST_DEBUG_VIEWPORT=<W>x<H>` (e.g. `390x844`) to hold an emulated viewport; unprefixed runs snap viewports narrower than 1280px back to 1920×1080.
- Browser is **headless by default** — the user sees nothing. `st-session.mts start --headed` opens a visible window (scripts + MCP then drive it live); use it whenever the user wants to watch.
- Scripts = deterministic reads/actions/assertions, anything a gate depends on, anything run twice. Playwright MCP `browser_*` = exploratory only; never chain MCP calls into a validation when a script exists.
- **Default gate for LLM-consuming paths = real-LLM validation** (profile selected, no `debugResponse`) — see "Real-LLM validation" in the debug skill. Can't run it → flag at handover, gate NOT green.
- Shared session first when mixing scripts + MCP: `node scripts/debug/st-session.mts start` (CDP `http://127.0.0.1:9222`). Repo `.mcp.json` points the playwright MCP at that endpoint — **an MCP server without `--cdp-endpoint` launches its own isolated Chromium** whose state scripts can't see. Verify sharing with a `globalThis.__x` marker round-trip (MCP `browser_evaluate` set → `st-eval.mts` read) before any shared-state MCP work.
- Chat/entity control: `st-navigation.mts list-entities | open-group <id|name> | open-character <name> | list-chats | open-chat <chatId> | new-chat`. Group draft: `st-actions.mts trigger <member>`. Ad-hoc in-page JS: `st-eval.mts "<js>"` (ctx + rt in scope) — no more throwaway .mts files.
- Test cleanup: `so-library.mts remove "<title>"` (v2Stories store — the LIVE one; `--legacy` for the dead v1 studio store) + `so-library.mts wipe-chat-meta` + `/delchat`.
- **Git Bash mangles leading-slash slash-command args**: `node scripts/debug/st-actions.mts slash "/delchat"` gets MSYS-path-converted to a Windows path (`C:/Program Files/Git/delchat`) and silently no-ops — the JSON result's `"command"` field shows the mangled path. Prefix with `MSYS_NO_PATHCONV=1` for any slash command starting with `/`.
- **`cast_changes`/`setGroupMembersDisabled` mutate the group's `disabled_members`, not the chat** — this persists across `/newchat` sandbox sessions and outlives `--sandbox` cleanup. A live scenario that disables a roster member leaves that member disabled in the real group afterward; restore it (e.g. another `cast_changes: {enable:[...]}` pass) before ending the session. **Restore after deleting the sandbox chat, not before** — `/member-enable` inside the sandbox chat reports success and is then undone when ST reloads the group behind `/delchat`; `so-journey` now enables members post-`/delchat` and reports the resulting `disabledMembers` in its cleanup record (v2.1 plan 04).

- **Journeys are the composition gate** (v2.1): `so-journey.mts --list` / `run <id>`; catalog and check tables in `docs/plans/v2.1/test-plan.md`. Fresh-start by default; outcomes are `pass|fail|blocked|not-runnable|skipped`; `--strict` turns `blocked` into failure at acceptance. Global-settings clearing is snapshotted to `.debug/so-journey-config-snapshot.json` first — `so-journey.mts restore-config` recovers a crashed run.
- **Session journal**: `so-journal.mts export|show` writes `.debug/journal-<chat>.md|json` — the artifact a human-eval session hands back. The drawer's ⚑ control files a flag (`#so-flag-moment`).
- **ST hides `#send_but` while generating** (it swaps in `#mes_stop`), and a stopped stream leaves `streamingProcessor.isFinished === false` behind forever — `getGenerationState` treats the button swap as truth and requires a continuous idle window, so group turns are not cut short between members.
- **ST nests our settings panel two drawers deep** (`#extensions-settings-button` → `#rm_extensions_block` → our `.inline-drawer`). Anything driving the panel must open by *visibility*, and must close the nav drawer afterwards — an open Extensions drawer hides `#options_button` and `#send_but`.

Standard snapshot:

```bash
node scripts/debug/st-navigation.mts recent-group
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts all
```
