# Debug Scripts

For any live/E2E work, load the **`debug` skill** (`.claude/skills/debug/SKILL.md`) — full tool reference, recipes, error table. Also: `scripts/debug/README.md`.

Essentials:

- Scripts are `.mts`, run directly: `node scripts/debug/<tool>.mts`. Artifacts → `.debug/` (gitignored).
- Browser is **headless by default** — the user sees nothing. `st-session.mts start --headed` opens a visible window (scripts + MCP then drive it live); use it whenever the user wants to watch.
- Scripts = deterministic reads/actions/assertions, anything a gate depends on, anything run twice. Playwright MCP `browser_*` = exploratory only; never chain MCP calls into a validation when a script exists.
- **Default gate for LLM-consuming paths = real-LLM validation** (profile selected, no `debugResponse`) — see "Real-LLM validation" in the debug skill. Can't run it → flag at handover, gate NOT green.
- Shared session first when mixing scripts + MCP: `node scripts/debug/st-session.mts start` (CDP `http://127.0.0.1:9222`). Repo `.mcp.json` points the playwright MCP at that endpoint — **an MCP server without `--cdp-endpoint` launches its own isolated Chromium** whose state scripts can't see. Verify sharing with a `globalThis.__x` marker round-trip (MCP `browser_evaluate` set → `st-eval.mts` read) before any shared-state MCP work.
- Chat/entity control: `st-navigation.mts list-entities | open-group <id|name> | open-character <name> | list-chats | open-chat <chatId> | new-chat`. Group draft: `st-actions.mts trigger <member>`. Ad-hoc in-page JS: `st-eval.mts "<js>"` (ctx + rt in scope) — no more throwaway .mts files.
- Test cleanup: `so-library.mts remove "<title>"` (v2Stories store — the LIVE one; `--legacy` for the dead v1 studio store) + `so-library.mts wipe-chat-meta` + `/delchat`.
- **Git Bash mangles leading-slash slash-command args**: `node scripts/debug/st-actions.mts slash "/delchat"` gets MSYS-path-converted to a Windows path (`C:/Program Files/Git/delchat`) and silently no-ops — the JSON result's `"command"` field shows the mangled path. Prefix with `MSYS_NO_PATHCONV=1` for any slash command starting with `/`.
- **`cast_changes`/`setGroupMembersDisabled` mutate the group's `disabled_members`, not the chat** — this persists across `/newchat` sandbox sessions and outlives `--sandbox` cleanup. A live scenario that disables a roster member leaves that member disabled in the real group afterward; restore it (e.g. another `cast_changes: {enable:[...]}` pass) before ending the session.

Standard snapshot:

```bash
node scripts/debug/st-navigation.mts recent-group
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts all
```
