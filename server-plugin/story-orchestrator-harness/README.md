# story-orchestrator-harness

SillyTavern server plugin that answers Story Orchestrator's non-narrative passes (reads, summaries, the wizard, …)
through a coding-agent CLI the server owner is logged into: **Claude Code**, **Codex** or **opencode**. Text in, text
out, every tool of the CLI off. Off until a task is routed to it. User guide:
[`docs/guide/setup/harness.md`](../../docs/guide/setup/harness.md).

## Install

1. Copy this folder to `<SillyTavern>/plugins/story-orchestrator-harness/` (from a source checkout:
    `npm run plugin:install -- --st-root <SillyTavern> --with harness`).
2. Install and log in to the CLI on the server. Only subscription logins are used, never API keys:

   | Harness | Binary | Login file |
   |---|---|---|
   | `claude` | `claude` | `~/.claude/.credentials.json` (respects `CLAUDE_CONFIG_DIR`) |
   | `codex` | `codex` | `~/.codex/auth.json` (respects `CODEX_HOME`) |
   | `opencode` | `opencode` | `~/.local/share/opencode/auth.json` (respects `XDG_DATA_HOME`) |

   Binaries are found on `PATH` (`.exe` on Windows; script shims are refused) or set per harness. A login must stay
   valid for at least 90 more minutes.
3. Write `config.json` next to `index.mjs`. Nothing is offered until a harness has `offer: true`:

   ```json
   {
     "harnesses": {
       "opencode": { "offer": true, "concurrency": 2, "queueLimit": 8 }
     }
   }
   ```

   Fields per harness: `offer`, `binary`, `loginFile`, `concurrency` (default 2, at most 8), `queueLimit` (default 8,
   at most 64), `models`. Top level: `allowNonAdmin` (default false), `loginMinMinutes` (default 90), `tmpRoot`
   (default `<os tmp>/so-harness`).
4. Set `enableServerPlugins: true` in `config.yaml` and restart SillyTavern. The offered harnesses appear under
   **Models per task → Cloud harness (on the SillyTavern server)**.

## How a call runs

Each call runs in a throwaway home directory with a copy of the login:

- `claude -p --tools '' …`
- `codex exec - --json --ephemeral -s read-only …`
- `opencode run --pure --format json --agent so-text …` (all tools off)

`SO_HARNESS_QUOTA_HOLD_MS` (default 600000) is how long a harness is held back after it reports a quota limit. Proxy
and CA environment variables pass through.

## Who may call it

Admin accounts only, because it spends the server owner's subscriptions ("harness routes are admin-only on this
install"). `allowNonAdmin: true` opens it to every SillyTavern user. `/warm` is always admin-only.

## The wizard's tool bridge (opencode only)

When **Wizard and road ahead** is routed to opencode, `agentBridge.mjs` runs `opencode run --pure --agent so-agent`
with exactly one MCP server, `mcpShim.mjs`, which exposes the wizard's own validated tools (as `so_*`, at most 64)
and parks each call for the page. The page long-polls `/agent/next` and answers each call through the same checks as
a local run; a call that creates an asset still waits for the author. Sessions are per user and role, bounded
(15 minutes, a bounded queue, call deadlines) and killed as a process tree.

## Routes

Under `/api/plugins/story-orchestrator-harness`, `text/plain` bodies with the `x-so-plugin` header:
`GET /status`, `POST /complete`, `/cancel`, `/warm`, `/agent/open`, `/agent/next`, `/agent/answer`, `/agent/close`.

## Tests

`npm run test:plugin` (node:test, `plugin.test.mjs` and `agent.test.mjs`).
