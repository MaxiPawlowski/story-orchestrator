# Debug Scripts

For any live/E2E work, load the **`debug` skill** (`.claude/skills/debug/SKILL.md`) — full tool reference, recipes, error table. Also: `scripts/debug/README.md`.

Essentials:

- Scripts are `.mts`, run directly: `node scripts/debug/<tool>.mts`. Artifacts → `.debug/` (gitignored).
- Scripts = deterministic reads/actions/assertions, anything a gate depends on, anything run twice. Playwright MCP `browser_*` = exploratory only; never chain MCP calls into a validation when a script exists.
- Shared session first when mixing scripts + MCP: `node scripts/debug/st-session.mts start` (CDP `http://127.0.0.1:9222`).

Standard snapshot:

```bash
node scripts/debug/st-navigation.mts recent-group
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts all
```
