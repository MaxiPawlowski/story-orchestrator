# story-orchestrator-harness

SillyTavern server plugin that answers Story Orchestrator's non-narrative passes (reads, summaries, the wizard, …)
through a coding agent the server owner is signed in to: **Claude Code**, **Codex** (their CLIs, in owned temporary
homes) or **opencode** (OpenCode's own client library and background service, one session per call). Text in, text
out, every tool off. Off until a task is routed to it. User guide:
[`docs/guide/setup/harness.md`](../../docs/guide/setup/harness.md).

## Install

1. Copy this folder to `<SillyTavern>/plugins/story-orchestrator-harness/` (from a source checkout:
    `npm run plugin:install -- --st-root <SillyTavern> --with harness`). The installer also runs `npm install` in the
    plugin's own folder for its one dependency, `@opencode/client` (pinned; `--skip-deps` leaves that to you). Nothing is
    installed in SillyTavern itself.
2. Install the CLI and sign in on the server. Only subscription sign-ins are used, never API keys:

   | Harness | Binary | Sign-in |
   |---|---|---|
   | `claude` | `claude` | login file `~/.claude/.credentials.json` (respects `CLAUDE_CONFIG_DIR`), copied into an owned home |
   | `codex` | `codex` | login file `~/.codex/auth.json` (respects `CODEX_HOME`), copied into an owned home |
   | `opencode` | `opencode` | OpenCode's own: `opencode auth login` once in a terminal on the server. No login file is read, copied or refreshed by the plugin |

   Binaries are found on `PATH` (`.exe` on Windows; script shims are refused) or set per harness. A Claude or Codex login
   must stay valid for at least 90 more minutes. OpenCode renews its own.
3. Write `config.json` next to `index.mjs`. Nothing is offered until a harness has `offer: true`:

   ```json
   {
     "harnesses": {
       "opencode": { "offer": true, "concurrency": 2, "queueLimit": 8 }
     }
   }
   ```

   Fields per harness: `offer`, `binary`, `loginFile` (claude and codex only), `concurrency` (default 2, at most 8), `queueLimit`
   (default 8, at most 64), `models`. Top level: `allowNonAdmin` (default false), `loginMinMinutes` (default 90, claude and
   codex), `tmpRoot` (default `<os tmp>/so-harness`).
4. Set `enableServerPlugins: true` in `config.yaml` and restart SillyTavern. The offered harnesses appear under
   **Models per task → Cloud harness (on the SillyTavern server)**.

## How a call runs

Claude and Codex, each in a throwaway home directory with a copy of the login:

- `claude -p --tools '' …`
- `codex exec - --json --ephemeral -s read-only …`

opencode, through OpenCode's supported client interface (`@opencode/client`, its `Service` for discovery and its
Promise client), never through a login file:

1. `Service.discover` finds OpenCode's background service (a status read never starts it). A call starts it with
   `Service.ensure` using the `opencode` binary, accepting any 2.x server and never replacing one.
2. Sign-in and model are read from the service's own API (`integration` connections and the model list), not from a file:
   services omitting connection methods use the supported `opencode auth list` metadata; when that names no method, a
   connection the service lists as a connected provider (`provider.list`) counts as signed in, with no prompt sent.
   An integration that reads as missing is re-read from `integration.list` (a cold 2.0.6 service answers not-found).
   no subscription sign-in is **unpaired**, one OpenCode marks `needs_auth` is **expired**; the call refuses with the next
   step (`opencode auth login`) before any session exists.
3. The call's system text and its deny-everything agent live in an `opencode.json` in the plugin's own directory
   (`<tmpRoot>/opencode-loc/text-<hash>`; per-session directories for the wizard). OpenCode merges project config from the
   session's directory, so the owner's own settings are never edited. Before any prompt the plugin reads the agent back and
   refuses unless its effective permissions deny every tool (it fails closed; a fresh directory is retried while OpenCode
   loads it).
4. One session (`so-text` or `so-agent` agent, the routed model and variant, metadata `owner`/`pid`) gets the prompt, with
   any pictures as inline `data:` attachments. Completion is the session's own terminal event, or the stored messages when
   the event stream is down. The session is interrupted on timeout, cancel or a tool attempt, then removed.
5. A restart removes sessions left by a dead plugin process (title `so-harness <pid> …`, metadata `owner`).

`SO_HARNESS_QUOTA_HOLD_MS` (default 600000) is how long a harness is held back after it reports a quota limit. Proxy
and CA environment variables pass through to Claude and Codex.

## Who may call it

Admin accounts only, because it spends the server owner's subscriptions ("harness routes are admin-only on this
install"). `allowNonAdmin: true` opens it to every SillyTavern user.

## The wizard's tool bridge (opencode and claude)

When **Wizard and road ahead** is routed to opencode, `agentBridge.mjs` opens an OpenCode session whose project config
declares exactly one MCP server, `mcpShim.mjs` (native tools, not Code Mode), which exposes the wizard's own validated
tools (as `so_*`, at most 64) and parks each call for the page. The agent may use only `so_*`; anything else, or a
permission request, ends the session as refused. The page long-polls `/agent/next` and answers each call through the same
checks as a local run; a call that creates an asset still waits for the author. Sessions are per user and role, bounded
(15 minutes, a bounded queue, call deadlines), interrupted and removed, and their location is evicted and deleted.

When it is routed to claude (`claude-sonnet-5-5` or `claude-opus-5-5` only; Haiku and the short aliases are refused for
the wizard, and each status model row says `agent: true|false`), `claudeTransport.mjs` runs one process in an owned home
with a copy of the login (the freshness check is the only read of its contents), from an owned, descriptively named
working directory (`story-orchestrator-authoring`):

```
claude -p --tools "" --strict-mcp-config --mcp-config <owned>/tmp/mcp.json --setting-sources "" --no-session-persistence
  --disable-slash-commands --permission-prompts none --allowedTools mcp__so__<tool>,... --system-prompt-file <owned>/tmp/system.txt
  --input-format text --output-format stream-json --verbose --include-partial-messages --model <model> [--effort low|medium|high]
```

with `CLAUDE_CONFIG_DIR` in the owned home, `CLAUDE_CODE_NO_MODEL_FALLBACK=1`, `CLAUDE_CODE_DISABLE_REFUSAL_FALLBACK=1`,
`CLAUDE_CODE_DISABLE_REFUSAL_RETRY=1`, `CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP=1`, `DISABLE_AUTOUPDATER=1` (names checked
against the 2.1.x binary) and `MCP_TOOL_TIMEOUT` = the call deadline + 10 s. The MCP config (owner-only: it holds the
session secret) names only `mcpShim.mjs`. The event stream is read as it arrives and the run is stopped on:

- an init listing any tool but `mcp__so__*` or any server but the shim (`refused`), or a shim that did not connect (`config`);
- a tool use of anything else, or a permission denial in the result (`refused`);
- a refusal (`stop_reason: "refusal"`, `model_refusal_*`): final, never retried or rerouted;
- a served model (init, every `message_start`, every assistant message) other than the requested one (`refused`); a
  `<synthetic>` message is a CLI-local error whose text names it (an expired login reads as `auth`);
- the first `stop_reason: "max_tokens"`, answered as `finish: "length"` (the CLI would otherwise add hidden resume turns).

`rate_limit_event` lines feed `/status` `harnesses.claude.meter` (`status`, `resetsAt`, `windows.five_hour|seven_day`
`{utilization, resetsAt}`); a `rejected` window holds the harness until its reset. No other usage source is read.

## Pictures

`POST /complete` and `/agent/open` take `images: [{data: <base64>, mime?, description?}]` (at most 4, 8 MB each, 20 MB in
all, PNG, JPEG, GIF or WebP checked by magic bytes; opencode only, and only for a model whose listing has image input).
They ride the prompt as inline attachments.

## Routes

Under `/api/plugins/story-orchestrator-harness`, `text/plain` bodies with the `x-so-plugin` header:
`GET /status`, `POST /complete`, `/cancel`, `/agent/open`, `/agent/next`, `/agent/answer`, `/agent/close`.

`/status` rows for opencode add `loginState` (`ok`, `expired`, `unpaired`, `unchecked`, `unavailable`), `loginAction`,
`loginProblem` (the owner's next step), `service`, `serviceVersion`, `clientInstalled`, and per model `available` and `image`.
Every model row carries `agent` (the wizard's tool bridge may run it); the claude row adds `meter` once a run reported one.

## Tests

`npm run test:plugin` (node:test: `plugin.test.mjs` for Claude and Codex, `agent.test.mjs` and `opencode.test.mjs` against
`fixtures/fake-opencode-server.mjs`, a fake OpenCode service with synthetic data only, `claude.agent.test.mjs` against
`fixtures/fake-claude-cli.mjs`, a fake CLI that speaks MCP to the real shim; `HARNESS_LIVE=1` adds one real claude
session). `opencode.isolated.test.mjs`
checks the transport against a real, private, credential-free `opencode serve` with its own empty data directories (it
never uses the owner's service, login or models and sends no model request): set `SO_OPENCODE_ISOLATED=1`, and
`SO_OPENCODE_CLIENT_DIR` to a folder whose `node_modules` holds `@opencode/client` unless it is installed next to the plugin.
