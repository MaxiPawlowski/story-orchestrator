# Harness

The harness plugin lets a task run through a coding-agent login on the SillyTavern server: **Claude Code**, **Codex**
or **opencode**, using the subscription you are already logged into there. Text goes in, text comes out; every tool
of the agent is off. It is useful for heavier tasks such as summaries or the wizard.

It is **off until you route a task to it** and offers nothing until its config file says so.

## Install

1. Install the plugin (see [Server plugins](README.md#server-plugins)).
2. On the server, make sure the CLI is on the `PATH` (`claude`, `codex` or `opencode`) and logged in. The plugin uses
   the login files (`~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.local/share/opencode/auth.json`); a login
   must stay valid for at least 90 more minutes.
3. Write `config.json` next to the plugin's `index.mjs` and offer each harness you want:

   ```json
   { "harnesses": { "opencode": { "offer": true } } }
   ```

4. Restart SillyTavern. In **Models per task**, each task now lists the offered harnesses under "Cloud harness (on the
   SillyTavern server)".

## Who may use it

Admin accounts only, because it spends the server owner's subscriptions. `"allowNonAdmin": true` in `config.json`
opens it to every SillyTavern user.

## The wizard through opencode

When **Wizard and road ahead** is routed to opencode, the wizard's agent runs as an opencode session that calls the
wizard's own tools. Every change still goes through the same checks as a local run, and anything that creates a card,
lorebook or group still waits for you. If the harness is not available, the wizard says so; it does not quietly fall
back to a local profile.

Details, every config field and the routes: `server-plugin/story-orchestrator-harness/README.md`.

---

[Setup](README.md)
