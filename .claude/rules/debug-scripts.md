# Debug Scripts

For any live/E2E work, load the **`debug` skill** (`.claude/skills/debug/SKILL.md`) — full tool reference, recipes, error table. Also: `scripts/debug/README.md`.

Essentials:

- Scripts are `.mts`, run directly: `node scripts/debug/<tool>.mts`. Artifacts → `.debug/` (gitignored).
- Scripts = deterministic reads/actions/assertions, anything a gate depends on, anything run twice. Playwright MCP `browser_*` = exploratory only; never chain MCP calls into a validation when a script exists.
- **Default gate for LLM-consuming paths = real-LLM validation** (profile selected, no `debugResponse`) — see "Real-LLM validation" in the debug skill. Can't run it → flag at handover, gate NOT green.
- Shared session first when mixing scripts + MCP: `node scripts/debug/st-session.mts start` (CDP `http://127.0.0.1:9222`).
- **Git Bash mangles leading-slash slash-command args**: `node scripts/debug/st-actions.mts slash "/delchat"` gets MSYS-path-converted to a Windows path (`C:/Program Files/Git/delchat`) and silently no-ops — the JSON result's `"command"` field shows the mangled path. Prefix with `MSYS_NO_PATHCONV=1` for any slash command starting with `/`.
- **`cast_changes`/`setGroupMembersDisabled` mutate the group's `disabled_members`, not the chat** — this persists across `/newchat` sandbox sessions and outlives `--sandbox` cleanup. A live scenario that disables a roster member leaves that member disabled in the real group afterward; restore it (e.g. another `cast_changes: {enable:[...]}` pass) before ending the session.

Standard snapshot:

```bash
node scripts/debug/st-navigation.mts recent-group
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts all
```
