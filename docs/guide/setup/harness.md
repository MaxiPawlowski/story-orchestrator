# Harness

The harness plugin lets a task run through a coding-agent login on the SillyTavern server: **Claude Code**, **Codex**
or **opencode**, using the subscription you are already logged into there. Text goes in, text comes out; every tool
of the agent is off. It is useful for heavier tasks such as summaries or the wizard.

It offers nothing until its config file says so. Once it offers opencode with `openai/gpt-6.1-sol` and the agent
bridge, the wizard (and Ask) use it by default when you have not picked a model for **Wizard and road ahead**;
every other task uses it only when you route that task to it. Claude Code is the other wizard route: pick
`Claude Code · claude-sonnet-5-5` (or `claude-opus-5-5`) for **Wizard and road ahead** and the wizard runs on your
Claude subscription instead of ChatGPT.

## Install

1. Install the plugin: `npm run plugins:install -- --with harness` (see [Server plugins](README.md#server-plugins)). For
   opencode it also installs the plugin's one dependency, OpenCode's own client library, inside the plugin's folder.
2. On the server, make sure the CLI is on the `PATH` (`claude`, `codex` or `opencode`) and signed in.
   - **Claude Code and Codex:** the plugin uses their login files (`~/.claude/.credentials.json`,
     `~/.codex/auth.json`); a login must stay valid for at least 90 more minutes.
   - **opencode:** the plugin talks to OpenCode's own background service through OpenCode's client library, one
      session per call. It never reads, copies or refreshes an opencode login: OpenCode owns the sign-in. Older V2
      services omit the sign-in method; the plugin then checks the supported `opencode auth list` metadata, and when that
      names none, a connection OpenCode lists as a connected provider counts as signed in (no prompt is sent). Sign in once
     in a terminal on the server with `opencode auth login`, choose OpenAI, then ChatGPT Pro/Plus.
3. Write `config.json` next to the plugin's `index.mjs` and offer each harness you want:

   ```json
   { "harnesses": { "opencode": { "offer": true }, "claude": { "offer": true } } }
   ```

4. Restart SillyTavern. In **Models per task**, each task now lists the offered harnesses under "Cloud harness (on the
   SillyTavern server)".

## When opencode is not ready

The Models per task list marks a harness that cannot answer, and the plugin's status says why. For opencode:

| You see | It means | What to do |
|---|---|---|
| "(sign-in expired)" | OpenCode says its OpenAI subscription sign-in needs renewing | In a terminal on the server run `opencode auth login` and sign in again; the next status check sees it |
| "(log in first)", "no OpenAI subscription sign-in" | OpenCode has no subscription sign-in for the model's provider (an API key alone is not used) | Run `opencode auth login`, choose OpenAI, then ChatGPT Pro/Plus |
| "(setup needed)", "client library ... is not installed" | The plugin's folder has no OpenCode client library | Run `npm run plugins:install -- --with harness`, then restart SillyTavern |
| "refused this plugin" | OpenCode's background service no longer accepts the plugin's pairing | Run `opencode service restart` in a terminal on the server |
| "background service ... could not be reached or started" | The service is down and could not be started | Run `opencode service start`, then check `opencode service status` |

A routed task that finds one of these stops with that message; the wizard does not fall back to a local profile. A
stopped OpenCode service is not a problem: it starts with the first call. A usage limit is reported with its retry
time and holds the route until then.

## When Claude Code is not ready

| You see | It means | What to do |
|---|---|---|
| "(log in first)", "no login file" | No Claude subscription login on the server (an API key is not used) | Run `claude` once in a terminal on the server and log in with your Claude account |
| "the saved login expires within 90 min" | The login is about to expire | Run `claude` once in a terminal on the server; it renews the login |
| "(used: 5h 80%, 7d 30%)" | Your Claude usage so far, read from the last run's own events | Nothing; at 100% the route is held until the reset time |
| "(usage limit reached)" | Claude reported its limit | Wait for the reset time the wizard shows, or route the wizard back to opencode |
| "(no wizard tools)" next to a model | That model answers plain tasks only; the wizard runs on `claude-sonnet-5-5` or `claude-opus-5-5`, never Haiku | Pick one of those two for **Wizard and road ahead** |

The plugin only checks when the saved login expires; it never prints, edits or refreshes it. Each run gets a
throwaway copy in its own folder, removed when the run ends.

## Pictures

An opencode call can carry up to four PNG, JPEG, GIF or WebP pictures, checked by their bytes (8 MB each, 20 MB in
all), for the wizard's vision work. A model without image input refuses them, so a rig or other vision task on a
text-only model stays on its static fallback instead of sending words in place of pixels. Each model's image input is
shown in the plugin's status.

## Who may use it

Admin accounts only, because it spends the server owner's subscriptions. `"allowNonAdmin": true` in `config.json`
opens it to every SillyTavern user.

## The wizard through opencode or Claude Code

When **Wizard and road ahead** is routed to opencode or Claude Code, the wizard's agent runs as one session that calls the
wizard's own tools and nothing else: opencode as an opencode session, Claude Code as one `claude -p` run with every
built-in tool off, no settings, no saved session and only the wizard's tools. A Claude refusal is final (the wizard
stops and says so, it is not retried on another model), and an answer from a model other than the one you picked is
discarded. Every change still goes through the same checks as a local run, and anything that creates a card,
lorebook or group still waits for you. If a harness you picked is not available, the wizard says so; it does not quietly fall
back to a local profile. The default route (no model picked) falls back to DeepSeek or the memory model instead.

Details, every config field and the routes: `server-plugin/story-orchestrator-harness/README.md`.

---

[Setup](README.md)
