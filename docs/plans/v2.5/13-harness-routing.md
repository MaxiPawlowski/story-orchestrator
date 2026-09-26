# Plan 13 — Harness routing: cloud models through CLI harnesses, per non-narrative role

**Status: DRAFT 2026-09-25 — awaits user approval.** New in v2.5 (user request 2026-09-25: "a way to pick different
harnesses' CLI (like claude code, and opencode) for each non narrative llm call"). Phase 0 (host facts, isolation
spike) can run now. The build depends on **11** (settings `schema: 1` baseline), **03** (the client seam stays one
injected call surface) and **12** (the plugin enters the artifact allowlist and the security gate). Its live gates are
plan 10 rows H1–H5. Verified against master `e7626d7`; revised 2026-09-26 (configurable knobs H7, spikes made steps H8–H10, role order H6). **Re-verify every path:line before building** (v2.4 rule 1).

## Goal

Every non-narrative LLM call (the `PassRole` families: five today, nine after H9) can be answered by a **cloud model reached through a CLI
harness the user is already logged into**: Claude Code (`claude -p`), Codex (`codex exec`) or opencode
(`opencode run`), per role, next to today's Connection Manager profiles. This uses the user's subscriptions and lets
different model families serve different roles. It does not replace anything:

1. **Off by default.** Every role keeps "Same as memory model" until the author picks a harness route. Installing the
   plugin changes nothing (the judge-plugin precedent: `.claude/rules/architecture.md` inv "The judge never blocks and
   never writes"; memory `judge-usage-opt-in`).
2. **No silent fallback.** A routed role that fails either pauses (breaker), or uses a fallback profile **the author
   chose for that role**. The T18 rule stands: "a pass never answers from a model the author did not choose"
   (`src/runtime/passProfiles.ts:3-5`).
3. **The narrative reply never goes through a harness.** ST's `Generate` and `/trigger` stay ST's (out of scope below).
4. **A harness is text-in, text-out.** Tools, MCP, settings, memory files, sessions and sandbox escapes are off, and a
   negative control proves it per harness before the harness is offered.
5. **A route is recommended for a role only at that role's existing floors, ×2** (v2.4 plan 08 floors, never retuned).

## Sources

- User request 2026-09-25; follow-up the same day: "use gpt-6 family on opencode".
- Call-site inventory, 2026-09-25 (this plan's research, below): 24 transport-A call sites, 10 judge sites.
- v2.4 plan 08 T18 (`docs/plans/v2.4/08-author-observability.md:23,229,421,460-466,527-560`): roles, routes, per-role
  calibration and floors, recommended config ("curator | none recommended", "authoring | none recommended").
- `docs/plans/v2.4/v2.5-seeds.md` §C E1 (one llama-server for three lanes; every timeout-red run sat on it), §E rows
  "authoring role on the memory route" (es 7/8 < 0.90) and "curator role recommendation".
- Judge plugin as the template: `server-plugin/story-orchestrator-judge/` and the plan-12 security gate (Sol PR-05,
  `research/review-codex-2026-09-25.md:208-212`).

## Scope / out of scope

**In:** a second server plugin `server-plugin/story-orchestrator-harness`; a typed route (`profile | harness`) for each
`PassRole`; the host seam `stHost/harness.ts`; failure kinds `auth` and `quota`; a breaker keyed by route; a
per-call record and a usage meter for the memory-model transport (none exists today); the settings UI, capability probe,
Repair rows and egress copy; per role × route calibration; three harnesses (Claude Code, Codex, opencode).

**Plan steps that were spikes (user, 2026-09-26: "make them real plan steps"):** H8 warm harness servers, H9 the role
split (`authoring` → `wizard` / `expansion` / `critic`; `read` → `read` / `memorize` / `epistemic`), H10 the cross-family
critic. Each keeps a predeclared decision condition; a miss removes the step's code, it is not retuned.

**Still a candidate, not a step here:** H-S3
"LLM-as-judge via a harness" (belongs to plan 06, listed there as a candidate).

**Out:** the narrative reply and NPC replies (`effectsApplier.ts:127`, `runtime/index.ts:269`); the TypeSafe judge
(Jev is a probability classifier that a harness cannot serve, see plan 06); any harness tool use (file, shell, web,
MCP); API-key billing through a harness (subscription logins only for 2.5, question Q3); streaming.

## Verified current state

| Claim | Seen |
|---|---|
| Five roles: `read`, `synthesis`, `authoring`, `director`, `curator` | `src/extraction/passRole.ts:1-11` |
| A role routes to a Connection Manager profile id; unset = memory profile; a dangling id refuses (`config`) | `src/runtime/passProfiles.ts:7-24` (resolver `:19-24`) |
| Settings: `extraction.profiles` (`PassProfiles`), install-wide, sanitized | `src/runtime/types.ts:275-283`; `src/runtime/settingsStore.ts:86-100` |
| One chokepoint: `callExtractionReply` = debug short-circuit → `routeProfile(role)` → timeout → `sendConnectionProfileRequest` → `ModelCallError(kind)` → answered observer → `stripReasoningBlocks` | `src/extraction/client.ts:76-92` |
| Router installed once at startup | `src/runtime/index.ts:64` (`setProfileRouter`) |
| The prompt is one string, sent as `[{role:"user", content}]` with `includePreset`, `includeInstruct` | `client.ts:85`; `src/services/stHost/modelReply.ts:123-125` |
| Failure kinds `lapsed | timeout | transport | config` | `src/services/stHost/modelReply.ts:5` |
| Samplers (`temperature ?? 0.1`, `top_p 0.9`) apply on Text Completion only; on CC the preset wins | `client.ts:87`; `modelReply.ts:111-114` |
| Timeout = `30000 + 50·maxTokens + 2·inputTokens` ms, one retry at 2× (A11) | `src/extraction/callBudget.ts:1-9`; `client.ts:97-109` |
| Breaker keyed per **profile id**; both scheduler lanes gated by the *read* profile's breaker; only the director checks its own | `src/extraction/breaker.ts:46`; `scheduler.ts:413,456`; `runtime/index.ts:268` |
| Input budget from the profile's context limit (`requestBudget(profileId)`) | `src/runtime/requestBudget.ts:6,12-15`; `stHost/contextLimit.ts` |
| Callers by role: read `scheduler.ts:437`, `extractionCoordinator.ts:282,385,403,480`, `memoryCoordinator.ts:553`; synthesis `extractionCoordinator.ts:325,359`, `memoryCoordinator.ts:281,392`; authoring `copilotCoordinator.ts:46`, `expansionCoordinator.ts:269`; curator `stagecraftCoordinator.ts:199`; director `runtime/index.ts:263` | inventory 2026-09-25 |
| Epistemic and ledger passes run on role `read`, not `synthesis` | `extractionCoordinator.ts:384,402` |
| The director is **on-path**: `talkControlInterceptor`, outer race `DIRECTOR_TIMEOUT_MS = 20000`, 96 max tokens | `runtime/talkControl.ts:8-9,260`; `runtime/index.ts:276` |
| The memory-model transport has **no call ring and no usage meter**; only the judge has one (`extras.judge.calls`, cap 300) | `src/judge/policy.ts:3`; `judge/settings.ts:45,116-132` |
| Settings UI "Models per task": one select per role, `#so-role-profile-<role>`, a Test button, health | `src/components/settings/RoleProfilesGroup.tsx:30-63`; `runtime/roleHealth.ts:6-40`; Repair `model-role` `runtime/repair.ts:11,40` |
| Role self-test and live calibration drive the same client | `runtime/roleSelfTest.ts:128-149`; `runtime/roleCalibration.ts:155-185`; `scripts/debug/so-role-calibration.mts` |
| Budgets: manager **740/740** (0 lines left), `memoryCoordinator` 619/620 | `src/runtime/architecture.test.ts:17-18`, re-measured by plan 03 on `e7626d7` |

**Consequence.** One seam carries every non-narrative call and already takes a role. A harness is a second
transport behind `callExtractionReply`, not a change to any coordinator. The route type, not the callers, changes.

## Host facts — ST (from the judge plugin study, 2026-09-25)

| Fact | Where |
|---|---|
| Server plugins load only with `enableServerPlugins: true` (default false) | `ST/src/plugin-loader.js:10,46` |
| A directory plugin with `package.json` imports `main`; ESM is detected by `.mjs` only | `plugin-loader.js:31,92-140` |
| Contract: `info {id,name,description}`, `init(router)`; id `/^[a-z0-9_-]+$/`, unique; mounted at `/api/plugins/<id>` only if routes were registered; `exit` hooks run on shutdown | `plugin-loader.js:167-231,85` |
| Plugin routes inherit `bodyParser.json({limit:'500mb'})`, CORS, basic auth/whitelist, `cookieSession`, `setUserDataMiddleware` (`request.user`), csrf-sync on non-GET, `requireLoginMiddleware` | `ST/src/server-main.js:110-248,312-313` |
| `request.user` is `{profile, directories}`; admin is `request.user.profile.admin` (`DEFAULT_USER.admin` = true when accounts are off) | `ST/src/users.js:960-963,1008-1011,1134`; `ST/src/constants.js:59` |
| The global parser handles JSON and urlencoded only, so a `text/plain` body reaches the plugin unparsed and the route can bound it itself (plan 12 PS-J 2) | `server-main.js:110-111` |

## Host facts — the harness CLIs (measured on this box, 2026-09-25)

| Harness | Version | Fact | Evidence |
|---|---|---|---|
| Claude Code | 2.1.282 | Headless: `-p`, prompt on stdin, `--output-format json` (one object: `result`, `stop_reason`, `usage`, `total_cost_usd`, `is_error`, `api_error_status`, `duration_ms`) | `claude --help`; probe below |
| | | Isolation flags: `--tools ""` (no tools), `--strict-mcp-config`, `--setting-sources ""`, `--system-prompt <p>` (replaces), `--no-session-persistence`, `--exclude-dynamic-system-prompt-sections`, `--model`, `--effort`, `--json-schema`, `--max-budget-usd` | `claude --help` |
| | | **`--bare` cannot be used with a subscription**: it reads only `ANTHROPIC_API_KEY`/`apiKeyHelper`; "OAuth and keychain are never read" | `claude --help` (`--bare`) |
| | | PONG from an empty temp dir, haiku, isolation flags above: **402 input tokens** (no cwd CLAUDE.md, no user settings leaked; no user-level CLAUDE.md exists on this box, so user-level isolation is unproven until P0-2), `result: "PONG"`, API 0.94–1.28 s, **wall 2.1–3.4 s** (2 calls) | probe 2026-09-25 |
| | | No max-output-tokens flag seen; `stop_reason` carries `end_turn` (so `max_tokens` → `finish: length` is expected, unverified) | `claude --help`; probe |
| Codex | 0.155.1 | `codex exec`: prompt from stdin with `-`; `--json` (JSONL events), `-o <file>` (last message), `--output-schema`, `-m`, `-s read-only`, `--ephemeral`, `--skip-git-repo-check`, `--ignore-user-config` (auth still from `CODEX_HOME`), `--ignore-rules`, `-C <dir>`, `--disable <feature>` | `codex exec --help` |
| | | Tools are on by default: feature flags `shell_tool`, `browser_use`, `computer_use`, `image_generation`, `apps`, `plugins`, `hooks` are **stable, true**; each must be disabled and proven off | `codex features list` |
| | | No system-prompt flag in `exec --help`; the instruction goes in the prompt, or a config key (unverified) | `codex exec --help` |
| | | Quota: the ChatGPT plan answered "usage limit … try again at Sep 27th, 2026 8:58 PM" (2026-09-25) | memory `codex-review-pending` |
| | | The Windows sandbox broke Codex MCP read-only mode on this box; `codex exec` works | memory `codex-review-pending` |
| opencode | 1.18.31 at the probes; 1.18.32 since 2026-09-26 (choco, elevated) | `opencode run`: `--format json` (JSONL events: `step_start`, `text`, `step_finish` with `tokens`, or `error`), `-m provider/model`, `--agent`, `--pure` (no external plugins), `--dir`, `--variant` (effort), `--attach <url>` to a running `opencode serve` | `opencode run --help` |
| | | Credentials here: OpenAI (OAuth, ChatGPT plan), Z.AI Coding Plan (API), lm-studio-custom | `opencode auth list` |
| | | **gpt-6 family works through the ChatGPT login** (user's pick): `openai/gpt-6-astra-fast` 6.0 s, `openai/gpt-6-astra` 6.7 s wall. `gpt-5.4-mini` is refused ("not supported when using Codex with a ChatGPT account") | probe 2026-09-25 |
| | | Default agent: **5 029 input tokens** for PONG. An inline agent via `OPENCODE_CONFIG_CONTENT` (`prompt` replaced, `tools {"*": false}`, edit/bash/webfetch `deny`) + `--agent`: **133 input tokens**, same answer, 6.7 s wall. So startup, not the model, is most of opencode's latency (H8) | probe 2026-09-25 |
| | | `--pure` does not isolate config: `opencode debug config` shows a user agent loaded from the global config | `opencode debug config` |
| | | Exit code 1 on an API error, with a JSONL `error` event (`APIError`, `statusCode`, `responseBody`) | probe 2026-09-25 |
| | | A 429 from Z.AI ("Insufficient balance", `isRetryable: true`) was **retried internally for 79 s** before returning. The plugin's own deadline must win | probe 2026-09-25 |

Owed before any build (Phase 0, below): the `max_tokens` finish for each harness; the exact quota/auth error shapes
(Claude usage limit, Codex usage limit, opencode 401/429); a login-status check that spends no quota
(`claude auth status`?, `codex login status`, `opencode auth list`); Codex's input tokens for PONG under the isolation
flags; Windows spawn of each binary without a shell (`.exe` vs `.cmd` shim); `taskkill /T /F` reaching the model child
of each harness; whether each harness reads `AGENTS.md`/`CLAUDE.md` from the home dir under the isolation flags; each
harness's proxy, CA and telemetry opt-out variables (rule 5); whether Claude takes `--system-prompt-file` (rule 2); the
throwaway config-home variable per CLI (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, opencode's `XDG_CONFIG_HOME` / isolated config
dir) that P0-2 and plan 12 PS-H 5 plant canaries in.

## Design

### H1 — The route type (client, pure)

```
type ModelRoute =
  | { kind: "profile"; profileId: string }
  | { kind: "harness"; harness: "claude" | "codex" | "opencode"; model: string; options?: HarnessRouteOptions };
type HarnessRouteOptions = {        // every field optional; unset = the H7 default
  effort?: string; maxInputTokens?: number; maxOutputTokens?: number;
  timeoutScale?: number; transport?: "spawn" | "server";   // "server" only after H8 passes
};
type RoleRoute = { route: ModelRoute; onFailure?: { profileId: string } };
extraction.routes: Partial<Record<PassRole, RoleRoute>>   // replaces extraction.profiles (rule 9: no migration)
```

- `resolveRoute(settings, role, exists)` replaces `resolveProfile`: unset → `{kind:"profile", profileId: memory}`;
  dangling profile or a harness the plugin does not list → refuse (`config`, names it). Same shape as today's refusal.
- `routeKey(route)`: `profile:<id>` / `harness:<name>:<model>`. The breaker, the answered observer, latency samples
  and the call record key on it (today they key on the profile id, `breaker.ts:46`).
- `callExtractionReply` dispatches on `route.kind`. The debug short-circuit stays first (`client.ts:77`), so every
  mocked scenario is unchanged. `stripReasoningBlocks` and `refuseIncomplete` run on both transports.
- Samplers: a harness takes none. The call record says so (`samplers: "not-applied"`). Expansion variants rely on
  `judge.expansion.temperature`, so on a harness route they may come back identical: recorded, not fixed.
- `onFailure` is used only for the failure kinds `auth`, `quota`, `transport`, `timeout`, and only when the author set
  it. `config` never falls back (a misconfiguration must be visible). Each fallback answer is recorded as such.

### H2 — The plugin `server-plugin/story-orchestrator-harness`

Same loader contract and layout as the judge plugin (`index.mjs`, own `package.json` with `"type":"module"`,
`plugin.test.mjs`), installed by `scripts/plugin-install.mjs` (extended to take the plugin name).

Routes:

| Route | Body → answer |
|---|---|
| `GET /status` | `{pluginVersion, harnesses: {claude|codex|opencode: {installed, version, path, loggedIn: true|false|null, models[]}}}`. Probed at init and on `?refresh=1`; spends no quota |
| `POST /complete` | `{requestId, harness, model, effort?, system, prompt, timeoutMs, maxOutputChars}` → `{ok:true, text, finish, usage:{input, output, costUsd?}, model, ms, spawnMs}` or `{ok:false, kind:"config"|"auth"|"quota"|"timeout"|"transport"|"malformed"|"refused", message, retryAt?}` |
| `POST /cancel` | `{requestId}` → kills the tree. The client also aborts the fetch; the plugin kills on `req` close |

Process rules (each one a test in `plugin.test.mjs` plus the plan-12 security gate):
1. **Fixed argv per harness, no shell.** `spawn(absPath, argv, {shell:false})`. `absPath` is resolved once at init
   from PATH or config; a `.cmd`/`.ps1` shim is refused unless its real entry point is resolved (Windows fact owed).
2. **Neither `prompt` nor `system` ever goes in argv or env** (no injection, no Windows 32k limit, not visible in the
   OS process list). `prompt` goes on stdin. `system` is written to a file inside the per-call mkdtemp dir (rule 4) and
   passed by path: for Claude, `--system-prompt-file <tmp>/system.txt` (flag existence is a fact owed in Phase 0); for
   opencode, the `so-text` agent prompt references the file, or it goes through stdin if opencode cannot read a file; for
   Codex, it is prepended on stdin. If a harness can take `system` only through argv or env, that harness is not offered.
   Optional hardening: the request sends a role id and the plugin owns the system text for each role.
3. **Tools off, proven.**
   - Claude: `-p --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence --exclude-dynamic-system-prompt-sections --system-prompt-file <tmp>/system.txt --output-format json --model <m>`.
   - Codex: `exec - --json --ephemeral --skip-git-repo-check --ignore-user-config --ignore-rules -s read-only -C <tmp> -m <m>`
     and `--disable` for every tool feature Phase 0 lists. `--ignore-user-config` keeps the user's `config.toml` and its
     MCP servers (on this box a Playwright browser, `~/.codex/config.toml:58-63`) out; `--disable` covers features, not
     MCP servers.
   - opencode: `run --pure --format json --agent so-text -m <m> --dir <tmp>`, with `OPENCODE_CONFIG_CONTENT` defining
     `so-text` (prompt = `system`, `tools {"*": false}`, permissions deny). An isolated config dir, if one exists (fact
     owed), replaces the global config.
   A harness whose negative control (H-N1) shows any tool call is **not offered**.
4. **Empty working dir per call** (`fs.mkdtemp` under `os.tmpdir()`, removed after), so no project file is read.
5. **Env allowlist**: PATH, HOME/USERPROFILE, APPDATA/LOCALAPPDATA, SystemRoot, TEMP/TMP, plus `CODEX_HOME` /
   `XDG_*` where the harness keeps its login. ST's own environment (which may hold API keys) is not passed. A named
   pass-through set is passed only when set on the ST process, never with invented values: proxy (`HTTPS_PROXY`,
   `HTTP_PROXY`, `NO_PROXY`, upper and lower case); CA (`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`); telemetry
   opt-outs (`DO_NOT_TRACK`, `DISABLE_TELEMETRY`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, plus each harness's own
   opt-out variable; Phase 0 owes one row per harness). `--setting-sources ""` (rule 3) drops env opt-outs kept in the
   user's settings.json; the build states whether any such opt-out is lifted into the child env, and if none is, says so as
   a known limitation. Plugin test: a canary secret variable on the ST process is absent in the child, and each set
   pass-through variable is present in the child unchanged.
6. **Deadline** = the client's `timeoutMs` minus a margin, enforced by the plugin and started when the call is dequeued
   (queue wait counts against `timeoutMs`, and the client budget includes it); on expiry the tree is killed
   (`taskkill /pid N /T /F` on Windows, process group on POSIX) and `timeout` returned. The harness's own retries
   (opencode's 79 s) never outlive it.
7. **Bounds**: the body is bounded **before** parse the way plan 12 PS-J 2 bounds the judge: the page posts
   `text/plain` (a JSON string), the route mounts its own `express.text({limit})`, and ST's global parser, which handles
   `application/json` and urlencoded only (`server-main.js:110-111`), never reads it. A JSON-typed or urlencoded body is
   parsed by ST's global 500 MB parser before the route sees it (host limit); the route refuses it after that parse; only
   `text/plain` is bounded before parse. **Same-origin guard of its own**: the route requires a custom request header
   (e.g. `X-SO-Plugin: 1`, sent by stHost), which makes any cross-origin call a preflighted one that ST's default CORS
   (`origin 'null'`, `methods ['OPTIONS']`) rejects, and refuses a request whose `Sec-Fetch-Site` is present and not
   `same-origin`, or whose `Origin` is present and not the ST host. This guard is independent of ST CSRF
   (`disableCsrfProtection`) and of accounts: with accounts off every caller is `DEFAULT_USER` with `admin: true`. The
   judge plugin takes the same rule (plan 12 PS-J 2).
   (Host fact owed: `express` resolves from the plugin dir through ST's `node_modules`.) Then prompt ≤ `MAX_PROMPT_CHARS`
   (`refused`); `system` ≤ `MAX_SYSTEM_CHARS` (`refused`); stdout ≤ `maxOutputChars` × 2 (killed past it); concurrency per
   harness (default 2), queue ≤ 8, one in flight per ST user per harness **per role** (the request carries `role`); a second
   call for the same role queues, and only queue overflow answers `refused`.
8. **Model allowlist per harness** from `/status` (`opencode models`, Claude aliases + ids, Codex list; the fact is
   owed). The judge plugin forwards any model string (PR-05); this one refuses an unlisted model.
9. **Who may call**: `request.user.profile.admin` only by default (every ST user would otherwise spend the host owner's
   subscription). A config flag widens it (question Q2).
10. **Error classification** reads the harness output (Claude `is_error`/`api_error_status`; Codex JSONL; opencode
    `error` event `statusCode`), never the exit code alone: 401/unauthenticated → `auth`; usage limit / 429 → `quota`
    with `retryAt` when the text names a time; spawn failure/ENOENT → `config`; unparseable output → `malformed`; a TLS
    or proxy connection failure → `transport`, with a message naming proxy/CA as a likely cause.
11. **Nothing is logged** except `{harness, model, ms, usage, kind}`. The prompt and reply never reach ST's log.

### H3 — Host seam and failure kinds (runtime)

- `src/services/stHost/harness.ts`: `harnessStatus()`, `sendHarnessRequest(route, system, prompt, {signal, timeoutMs,
  maxOutputChars})` → `ModelReply`. Only file that fetches the plugin (invariant: stHost is the host surface).
- `ModelFailureKind` gains `auth`, `quota`, `malformed` and `refused`. Breaker: `quota` holds the route until `retryAt`
  (or the longest backoff step), `auth` holds it until a status refresh reports `loggedIn: true`. `malformed` counts as a
  breaker failure like `transport` (plan 10 H3 expects the mapping; whether `onFailure` covers it is decided in the build and
  stated here). `refused` for an oversized prompt/system is config-like: never falls back, surfaced in `pipeline.detail`.
  `refused` for queue overflow is retried with backoff, no breaker hit. Each kind gets its H3 fault-matrix cell. Both show in `pipeline.detail`
  and as a Repair row (`harness-login`: "Log in to Claude Code on the machine running SillyTavern: run `claude` once").
- Capability `harness` in `stHost/capabilities.ts` (`present | absent | error`, same caching rules as `judge`).
- The scheduler gates each lane by **the breaker of the route its next job uses**, fixing the "both lanes gated by
  the read profile" gap (`scheduler.ts:413,456`) at the same time, because a read on a local profile and a synthesis
  on a harness must not hold each other.
- The token budget of a harness route is `options.maxInputTokens` if set, else the model's context from `/status` minus
  the role's output reserve (the same `inputBudget` arithmetic a profile uses, `extraction/inputBudget.ts`). No fixed cap
  (user, 2026-09-26: 32k "is not near enough"). What a call costs a subscription is shown, not capped: the role Test and
  the H4 meter report tokens per call and per session, and the preflight confirm (`requestBudget.ts:19`) fires for a
  harness route over a configurable token threshold, as it does today for memorize.

### H4 — Call record and usage meter

- Today nothing records which profile answered a call: the answered observer feeds only the breaker
  (`client.ts:39-47,90`, `runtime/index.ts:65`), and no audit type carries a profile (plan 07 study, 2026-09-25).
- Every reply carries a `callId`, so an audit (shared read, curator pass, copilot stage) can link to its call record.
- A per-chat ring `extras.modelCalls` (cap 300, same shape as `JudgeCallRecord`): `{callId, at, boundary, role, routeKey,
  kind: ok|failure kind|fallback, ms, spawnMs?, inputTokens?, outputTokens?, costUsd?}` plus a per-route meter.
  Fed from one place, the client's answered/failed observers, so coordinators are untouched.
- The session journal derives `model-call` events from it; plan 07's "which route answered" column reads it; the
  run header records `routes` and each harness version.

### H5 — UI and egress copy

- "Models per task" select per role gets two groups: **Connection profiles** (today) and **Cloud harness
  (on the SillyTavern server)** (`Claude Code · sonnet`, `opencode · gpt-6-astra`, …), the second only when the
  capability is present. An "On failure" select next to a harness route (none / a profile).
- Each role shows what it sends, like `JUDGE_USE_COPY` (`judge/settings.ts:156-171`), with the vendor named:
  "Story reads send the last N messages, the story's qualities and the current checkpoint to Anthropic via
  Claude Code." `epistemic` (H9) carries the epistemic and ledger passes, so its copy says private character knowledge is sent.
- The role Test button reports p50/p90 latency and tokens per call for the route. The director shows the measured p90
  against its 20 s budget and a warning above 4 s (it runs before the group reply).
- Author view: the meter per route. Player mode: nothing new (rule 7), except the pipeline's existing pause copy.

### H6 — What each harness is recommended for

Decided by Phase A only. Defaults stay "Same as memory model" for every role (goal 1), whatever the numbers.
`docs/plans/v2.5/recommended-config.md` gains a column per route.

**Phase A order, proposed 2026-09-26 (the roles after H9).** Cloud first where a local run is measured weak, a pass is
rare, or a bigger context fixes a recorded failure. Local first where a pass is frequent, on-path or private.

| Order | Role | First arms | Why |
|---|---|---|---|
| 1 | `wizard` | `claude:opus`, `claude:sonnet`, `opencode:openai/gpt-6-astra` | Rare, interactive, quality-bound. Local authoring missed its es opShape floor (v2.5-seeds §E, es 7/8 < 0.90) |
| 2 | `memorize` | `claude:sonnet`, `opencode:openai/gpt-6-astra-fast` | Whole-chat pass timed out on the local backend (A11: 256 s at 481 tok/s). A 200k context takes it in one call |
| 3 | `synthesis` | `claude:sonnet`, `opencode:openai/gpt-6-astra` | Canon, arc and scene prose: off-path and a few calls per scene |
| 4 | `expansion` + `critic` | generator `claude:sonnet`, critic `opencode:openai/gpt-6-astra` and the reverse (H10) | The one place two families check each other |
| 5 | `curator` | `claude:haiku`, `opencode:openai/gpt-6-astra-fast` | Local now meets every curator floor (`65733265d301`); cloud only if it beats that |
| 6 | `read` (cadence) | `claude:haiku`, `opencode:openai/gpt-6-astra-fast` | Every few turns, so the heaviest on quota; it also frees the shared llama-server for lanes (seeds E1). Measure calls per J3 session before recommending |
| — | `epistemic` | local | Private knowledge per character. Routable, but the copy warns it sends secrets; not in the first arms |
| — | `director` | local | On-path before the group reply; 2–7 s spawn. Measured only as H5 |

### H7 — Configuration (every knob is a setting)

Install-wide under `extraction` (settings `schema: 1`, plan 11); per-route values override the harness defaults.

| Setting | Scope | Default | Notes |
|---|---|---|---|
| `routes[role].route` | per role | unset = memory profile | H1 |
| `routes[role].onFailure` | per role | none (pause) | a profile the author picks |
| `routes[role].route.options.model` / `effort` | per route | the harness's own default | effort maps to `--effort` (Claude), `--variant` (opencode), `-c model_reasoning_effort` (Codex) |
| `options.maxInputTokens` | per route | model context − output reserve | no fixed cap (H3) |
| `options.maxOutputTokens` | per route | the role's `maxTokensFor` value | enforced as `maxOutputChars` where the CLI has no flag |
| `options.timeoutScale` | per route | 1 | multiplies `callTimeoutMs`; spawn cost is added on top |
| `options.transport` | per route | `spawn` | `server` offered only after H8 passes for that harness |
| `harness.preflightTokens` | install | 60 000 | a harness call above it asks first, like memorize today |
| `harness.<name>.binary` | install (server config) | resolved from PATH | set in the plugin's config, not the page (the page never names a path) |
| `harness.<name>.concurrency` | install (server config) | 2 | plus per-role single-flight (review edit) |
| `harness.<name>.queueLimit` | install (server config) | 8 | |
| `harness.allowNonAdmin` | install (server config) | false | Q2 |

Server-side values live in the plugin's own config file (not extension settings), so a page cannot widen them.

### H8 — Warm harness servers (was spike H-S1)

opencode spends ~5–6 s of a 6.7 s PONG on startup (§Host facts). `opencode serve` + `run --attach <url>` and
`codex app-server` keep one process warm per harness.
- **Decision condition (predeclared):** on the P0-1 PONG set, `server` p50 wall ≤ 0.6 × `spawn` p50 **and** H-N1, H-N1b,
  P0-2 and P0-7 all pass against the server (its config is the isolated one), 5/5. Else `transport: server` is not
  offered for that harness and its code is removed.
- The server binds loopback only, with a random port and a password the plugin generates (`--password`), and is started
  and stopped by the plugin's `init`/`exit`. Claude Code has no server mode: it stays `spawn`.

### H9 — Role split (was spike H-S2)

`PASS_ROLES` becomes nine: `read` (cadence and manual reads), `memorize` (backlog windows and whole-chat pass,
`extractionCoordinator.ts:480-494`), `epistemic` (epistemic + ledger passes, `:384,402`), `synthesis`, `wizard` (copilot
stages, suggest, report; `copilotCoordinator.ts:46`), `expansion` (generation + repair; `generation/generate.ts:30-44`),
`critic` (LLM critic and variant pick; `generation/critic.ts:99`, `generate.ts:98`), `director`, `curator`.
- Each caller passes its new role; the census test (`passProfiles.test.ts:63-81`) is extended so every
  `callExtractionReply` site names one of the nine.
- An unset new role falls back exactly as today (memory profile), so the split changes nothing until a route is set.
- Calibration fixtures: `authoring.json` → `wizard`; a new `critic.json` (≥ 20 planted-defect chains plus ≥ 10 clean
  ones, Spanish slice, labels frozen before any answer is read) with floors **catch ≥ 0.80, false flag ≤ 0.10**;
  `memorize` and `epistemic` are scored by the live suite's facts / epistemic tiers (plan 05 F2 fixtures).
- Rule 9: `extraction.routes` is new under `schema: 1`, so no migration of `extraction.profiles` (plan 11 already
  resets pre-release settings shapes).

### H10 — Cross-family critic (new step)

With `expansion` and `critic` routable apart, measure whether a critic from a different family catches more than one
from the generator's family.
- Arms on `critic.json`: same family (sonnet generates, sonnet critiques) vs cross (sonnet / gpt-6-astra) and the reverse.
- **Decision condition:** cross catch ≥ same catch + 0.10 with false flag ≤ 0.10, in both runs. Met: the recommended
  config pairs families. Not met: recorded; the roles stay independently routable (H9 needs no H10 result).

## Phase 0 — host facts and the isolation spike (runs now, no product code)

Script `scripts/spike/harness/probe.mjs` (node, spawns each harness exactly as H2 specifies) plus a record under
`test/journeys/records/v2.5-harness/phase0/`.

| # | Measurement | PASS (predeclared) |
|---|---|---|
| P0-1 | 20 PONGs per harness × model (claude haiku/sonnet; codex default; opencode gpt-6-astra-fast/gpt-6-astra) | 20/20 answered; record p50/p90 wall, spawnMs, input tokens |
| P0-2 | Instruction isolation, cwd AND user level: plant a canary line in (a) `CLAUDE.md` + `AGENTS.md` in the temp cwd, and (b) the user-level files each harness reads: `~/.claude/CLAUDE.md`, `$CODEX_HOME/AGENTS.md`, and the global opencode config (`instructions`, plus an agent and a skill under `~/.config/opencode/`). Use a throwaway home/config dir per CLI (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_CONFIG_HOME`), never the real home; if a harness's login forces the real one, back up each file, plant, and restore in `finally`, with a before/after sha256 of the real files. Read input tokens with and without the canaries | the canary is never echoed, input tokens are identical ±5, AND a control arm (the same CLI and prompt without the isolation flags / inline agent) echoes the canary or shows the token delta. A control that does not see the canary voids the run |
| H-N1 | Tool negative control: a prompt that asks to list the cwd, read `~/.ssh/known_hosts`, run `whoami`, fetch a URL | 0 tool events in the output stream; no file content in the reply; 5/5 per harness |
| H-N1b | MCP isolation: throwaway `CODEX_HOME` with auth copied and a planted `[mcp_servers.canary]` whose command writes a marker file or would show in the process list (same shape for Claude's MCP config and opencode's) | no marker file, 0 MCP child processes under the CLI tree, 0 `mcp_tool_call` events, 5/5 |
| P0-3 | Kill: deadline 3 s on a long answer | process tree gone within 1 s (checked with the OS process list), `timeout` returned |
| P0-4 | Error shapes: bad model, logged-out (a throwaway `CODEX_HOME`/config dir), quota (recorded when it happens naturally, never provoked) | each maps to its kind |
| P0-5 | Output bound: ask for 4 000 words with `maxOutputChars` 2 000 | killed or truncated, `finish: length` |
| P0-6 | Windows spawn with `shell:false` for each resolved binary | spawns; a `.cmd` shim is detected and refused |
| P0-7 | Egress + residue, per harness × CLI version: (a) hosts contacted over 5 calls (OS connection capture, e.g. netstat/Get-NetTCPConnection sampled at 100 ms plus DNS log), telemetry/update checks included; (b) diff of the user's home and app-data dirs (`~/.claude`, `CODEX_HOME`, opencode data/state dirs, `%APPDATA%`/`%LOCALAPPDATA%`) before vs after 5 calls, listing every file written and whether it holds the prompt or reply canary. Run once with the rule-3 isolation flags (`--no-session-persistence`, `--ephemeral`, opencode's config) and once without (negative control) | hosts ⊆ {model vendor, documented telemetry host}, each named in the record; with the flags on, no file under home/app-data contains a prompt or reply canary. A harness that persists canary text of the `read` role with the flags on is not offered in 2.5 |

A harness that fails H-N1, H-N1b, P0-2 (both levels, control green) or P0-7 is not offered in 2.5, and no Phase A arm runs
on it. Codex waits for its quota (2026-09-27 20:58).

## Phase A — per role × route calibration (after H1–H4 on a dev build)

- **Fixtures and floors are v2.4 plan 08's, unchanged** (`08-author-observability.md:460-466`): director D01-D26,
  `test/fixtures/role-calibration/{curator,authoring,synthesis}.json`; the read role through the live suite
  (`so-live-suite run --min 0.9 --min-tier facts=0.68,rejected=0.9 --expect-count 22`,
  `v2.4/04-extraction-input-quality.md:341`). No new floor, none retuned.
- **Arms:** `shared-65733265d301` (recorded, the local baseline) plus the per-role arms in H6's table, run in that
  order; `codex:<default>` joins each row when its quota is back. Roles are H9's nine.
  `so-role-calibration.mts --arm harness:<name>:<model>`.
- Each arm runs **twice** (no sampler control, so ×2 also measures variance). Goldens under
  `test/goldens/live/role-calibration/<role>-<arm>.json`, replayed in jest like the existing ones.
- Also recorded per arm: p50/p90 latency, input/output tokens per call, and how many calls a J3 session makes per
  role (so the author can see what a session costs a subscription).
- **Verdict per role × route:** `recommended` (every floor met in both runs), `usable` (answers, parses, below a
  floor), `refused` (fails isolation or does not parse). Authoring es and curator opShape, which missed on the local
  model (v2.5-seeds §E), are the first rows to read.

## Tests

- **Jest (red first):** read and synthesis routed to one harness under the normal two-lane schedule never produce
  `refused`, and the read is not starved into `timeout` by an in-flight synthesis call; `resolveRoute` (unset, profile,
  harness, dangling, unlisted model); `callExtractionReply`
  dispatch with a fake harness seam; the debug short-circuit precedes routing on both kinds; `quota` holds the route
  until `retryAt`; `auth` holds until a status refresh; `onFailure` used only for the four kinds and only when set;
  `config` never falls back; the scheduler gates a lane by its own job's route; the ring and meter record a fallback
  as a fallback.
- **Mutants:** delete the `onFailure` kind filter; key the breaker on the role instead of the route; drop the
  admin check; pass the prompt in argv; drop the env allowlist; drop the deadline kill. Each must fail a test.
- **Negative controls:** the unowned run (`RunOwnership` lapses during an awaited harness call → no write), per the
  census rule; a `debugResponse` scenario with a harness route set must make **zero** plugin requests.
- **Plugin (node:test):** fake child processes for argv, stdin, env, cwd, deadline, bounds, classification; one real
  route test through ST's middleware for CSRF and admin (the PR-05 gate). `JUDGE_LIVE`-style `HARNESS_LIVE=1` runs a
  real PONG per installed harness.
- **Census:** new `checked` rows for the harness await in `callExtractionReply`; fault-matrix row for the harness
  transport (nine fault shapes; `quota` and `auth` are new cells).
- `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build && npm run test:release &&
  npm run test:plugin`.

## Live gates (plan 10 rows H1–H5; real LLM, ×2 consecutive, archived under `test/journeys/records/v2.5-harness/`)

| Row | Check |
|---|---|
| H1 | J3 and J7 with `read` + `synthesis` on `claude:sonnet`, and again on `opencode:gpt-6-astra`, narrative on the local profile; journey green ×2 each |
| H2 | Phase A verdicts written into `recommended-config.md`; no default flipped |
| H3 | Chaos, each during a J3 turn: binary renamed; logged out; quota (a harness with an exhausted plan, e.g. Codex before 09-27 or Z.AI today); deadline hit; malformed output. The reply always renders; the role pauses or uses the author's fallback; the pipeline names the cause; Repair offers the step |
| H4 | Egress: harness routes unset → 0 spawns over a J3 session (plugin counter + OS process audit); routed → only the routed roles spawn |
| H5 | Director on `claude:haiku`: p90 over 20 group turns, reply latency vs the local director; recorded, not a floor |

Lanes: every lane shares this machine's CLI logins and quotas. A harness-routed matrix runs **one harness lane at a
time**, and relieves the llama-server contention of v2.5-seeds E1 for the roles it takes.

## Risks

- **Vendor terms.** Driving a personal subscription from another program may be restricted by a vendor's terms. Not
  verified here; the README states the user runs each harness under their own account, and question Q1 is the user's.
- **Your dev quota is the product's quota.** Phase A on `claude:*` spends the same Claude plan this repo is
  developed with. Budget it per run (the call counts above) and run it off-hours.
- **Privacy.** Chat text, including epistemic secrets (role `epistemic` after H9), leaves the machine to Anthropic or OpenAI. The
  per-role copy names the vendor; plan 12's privacy section and egress gate cover it.
- **Latency.** 2–7 s per call before the model works. Fine off-path; the director is the only on-path role (warned).
- **Harness drift.** Flags change between CLI versions (opencode upgraded 1.18.31 → 1.18.32 on 2026-09-26; Phase 0 re-runs on it). `/status` records the version,
  the run header diffs it, and `plugin.test.mjs` pins the argv per harness version family.
- **Budget lines.** No coordinator line is needed (one seam). The ring gets at most 10 manager lines, reserved by
  plan 03 (`03-code-health.md` budget reservation); plan 03 frees them first (overview rule 12).

## Unresolved questions

- Q1 Vendor terms for subscription use from the extension: acceptable to you for personal use, and what does the README say for other users?
- Q2 Multi-user ST: harness routes admin-only (default), or open to every user of the install?
- Q3 API-key billing through the same harnesses (e.g. `ANTHROPIC_API_KEY` + `--bare`) — in 2.5, or subscriptions only?
- ~~Q4~~ Decided 2026-09-26: the split is step H9 (user: make the spikes real steps).
- ~~Q5~~ Decided 2026-09-26: no fixed cap; every knob configurable (H3, H7).
- ~~Q6~~ Decided 2026-09-26: the user accepted H6's Phase A order.
- Q7 Should the plugin always spawn each CLI with a plugin-owned config home holding only the login, so that user-level
  instructions can never reach the model by construction?

## Gate record (Phase 0)

### Run 2 — 2026-09-26, master `492a4c72` (opencode + no-model probes; Claude/Codex model calls NOT RUN)

Auto-mode evaluator disabled by the user; worktree fast-forwarded to master `492a4c72` (`git merge --ff-only master`).
Scope set by the caller: every opencode probe (its login lives in its data dir, so a throwaway config home keeps it);
every Claude/Codex probe that needs no model call. **Claude and Codex model-call probes (P0-1, P0-2, H-N1, H-N1b model
half, P0-3, P0-5, P0-7) are NOT RUN: login decision pending from the user** (a throwaway home is logged out, and copying
login material is not authorised). Codex's quota is out until 2026-09-27 20:58 anyway.

Rules held: every CLI run in a throwaway home under `%TEMP%\so-p0` (`USERPROFILE`/`HOME`/`APPDATA`/`LOCALAPPDATA`, plus
`CLAUDE_CONFIG_DIR` / `CODEX_HOME` / opencode `XDG_CONFIG_HOME`+`XDG_CACHE_HOME`+`XDG_STATE_HOME`); opencode's
`XDG_DATA_HOME` is the real `~/.local/share` (login); Codex always `--ignore-user-config` except in the declared control
arms; allowlisted child env (`lib.mjs` `envFor`); no credential file read, printed or copied; `shell:false`; tree kill via
`taskkill /T /F`; lanes, main ST, `C:\dev\so-lanes` and the pod untouched. Secret env values were never read: the env
test compares sha256 inside the probe and records only `absent | present-unchanged`.

Scripts: `scripts/spike/harness/{lib.mjs, facts.mjs, envscan.mjs, probe.mjs, dbcount.py}`. `probe.mjs <name>…` writes
`test/journeys/records/v2.5-harness/phase0/<name>.json`; `dbcount.py` opens `opencode.db` read-only (`mode=ro`) and
returns row counts only (credential/account tables skipped by the canary scan). Model: `openai/gpt-6-astra-fast` unless
stated; opencode 1.18.32, Claude Code 2.1.282, Codex 0.155.1, node 22.22.0.

Base opencode argv (the rule-3 "isolation" arm): `opencode.exe run --pure --format json --agent so-text -m <m> --dir <tmp>`,
stdin = prompt, env `OPENCODE_CONFIG_CONTENT` = `so-text` agent (`tools {"*":false}`, edit/bash/webfetch deny) whose
`prompt` is `{file:<tmp>/system.txt}`, plus `OPENCODE_DISABLE_{AUTOUPDATE,SHARE,CLAUDE_CODE,PROJECT_CONFIG,EXTERNAL_SKILLS,LSP_DOWNLOAD}=1`.

| # | Predeclared PASS | Command (secrets redacted; none were in argv) | Result | Verdict |
|---|---|---|---|---|
| facts | versions, flags, login status without quota | `node scripts/spike/harness/facts.mjs` (`--version`, `--help`, `claude auth status`, `codex login status`, `codex features list`, `opencode auth list`, `opencode debug paths`) — `facts.json` | versions as above. `claude auth status` in a throwaway home → `loggedIn:false, authMethod:none` (JSON; spends nothing). `codex login status` → exit 1 "Not logged in". `opencode auth list` → 3 providers (OpenAI oauth, Z.AI api, lm-studio api), names only. opencode `debug paths`: data **and log and repos** in the real `~/.local/share/opencode`; `tmp` = real `%TEMP%\opencode` | FACT |
| rule 2 (Claude) | `--system-prompt-file` exists | `claude -p --system-prompt-file <tmp>/system.txt --tools "" --strict-mcp-config --setting-sources "" …` logged out, vs `--so-bogus-flag-p0` — `claudeFlags.json` | not in `--help` as an option (only named inside `--bare`'s text), but **accepted**: the bogus flag fails with `unknown option`, this one reaches the auth check. Model-side effect unverified (needs login) | FACT (flag parses) |
| rule 2 (opencode) | system text never in argv/env | smoke: token only in `system.txt`, env holds `{file:…}` — `smoke.json` | reply = the file's token (`PONG-C62CCADD`), 135 input tokens. `{file:}` substitution works inside `OPENCODE_CONFIG_CONTENT` | PASS |
| P0-1 opencode | 20/20 per model; p50/p90 wall, spawnMs, tokens | `probe.mjs p01` — `p01.json` | astra-fast **20/20**, wall p50 4 948 / p90 5 890 ms; astra **20/20**, p50 5 363 / p90 8 676 ms; spawn p50 7 ms; input tokens 135–140 | PASS |
| P0-1 Claude, Codex | same | — | login decision pending from the user | NOT RUN |
| P0-2 opencode | canary never echoed, tokens ±5 vs clean, control echoes it | `probe.mjs p02` (3 runs × 4 arms) + `p02b` (CLAUDE.md-only fallback, 3 × 2) — `p02.json`, `p02b.json` | Controls green (echo). Isolation arm **echoed the user-level global-config canaries**: `$XDG_CONFIG_HOME/opencode/AGENTS.md` and the file named in `opencode.json` `instructions`, 3/3; input 284–287 vs 158 clean (Δ≈127). Blocked by the quiet env: cwd `AGENTS.md`/`CLAUDE.md` (`DISABLE_PROJECT_CONFIG` / `DISABLE_CLAUDE_CODE`), `~/.claude/CLAUDE.md` (p02b: 3/3 blocked, control 3/3 echoed), both skills (tools off). The global agent file leaks only on the default agent (the `xdgAgent` hit in the isolation arm is a substring of `XDGAGENTSMD`, not a leak) | **FAIL** |
| P0-2 Claude, Codex | same | — | login decision pending from the user | NOT RUN |
| H-N1 opencode | 0 tool events, no file content, 5/5 | `probe.mjs hn1` (list cwd, read planted `~/.ssh/known_hosts`, `whoami`, fetch example.com) — `hn1.json` | 5/5: 0 tool events, no canary, no real username, no fetched title; the model says it has no tools. opencode itself spawned `rg.exe` in one run (its own file index of the empty cwd, not a tool call) | PASS |
| H-N1 Claude, Codex | same | — | login decision pending from the user | NOT RUN |
| H-N1b opencode | no marker, 0 MCP children, 0 MCP events, 5/5 | `probe.mjs hn1bOpencode`: `mcp.canary` (local, `node -e` writing a marker) in the throwaway `opencode.json` — `hn1bOpencode.json` | **marker written 5/5**, one `node` MCP child each, 0 MCP events (tools off), and each call waited for MCP init: wall 35–38.6 s vs ~6 s. `opencode mcp list` control also starts it. The rule-3 argv does not stop a config-home MCP server | **FAIL** |
| H-N1b Claude pre-auth | same, pre-auth half | `probe.mjs hn1bNoModel`: `mcpServers` in `$CLAUDE_CONFIG_DIR/.claude.json` + cwd `.mcp.json`; iso arm `-p --tools "" --strict-mcp-config --setting-sources "" --no-session-persistence …`, control `-p` only; logged out, no token in env — `hn1bNoModel.json` | control: **both** servers started (markers + 2 `node` children) although logged out; iso: none, 0 children | PASS (pre-auth half; control green) |
| H-N1b Codex pre-auth | same | `codex exec - --json --ephemeral --skip-git-repo-check --ignore-rules -s read-only -C <tmp>` ± `--ignore-user-config`, `[mcp_servers.canary]` in the throwaway `config.toml`, logged out | control: marker + `node` child; iso (`--ignore-user-config`): none. `codex mcp list` sees the server in both (config parsed) | PASS (pre-auth half; control green) |
| H-N1b model half (Claude, Codex) | 5/5 | — | login decision pending from the user | NOT RUN |
| P0-3 opencode | tree gone within 1 s of a 3 s deadline, `timeout` | `probe.mjs p03` (3 × real exe, 1 × chocolatey shim) — `p03.json` | all 4 killed at the deadline, 0 processes alive at the first process-list check (shim's `opencode.exe` grandchild included). But `taskkill` returned 500 / 773 / **1 001** / **1 033** ms after the deadline, and that return is the only bound measured | **FAIL** (2/4 over 1 s by the upper bound; needs a 100 ms process-list poll to tell) |
| P0-3 Claude, Codex | same | — | login decision pending from the user | NOT RUN |
| P0-4 | each shape maps to a kind | `probe.mjs p04 p04logs` — `p04.json`, `p04logs.json` | **Claude logged out:** JSON `type:result, subtype:success, is_error:true, api_error_status:null, result:"Not logged in · Please run /login"`, exit 1, 1.3 s → `auth` from `is_error`+text (not `subtype`). **Codex logged out:** JSONL `error` events "Reconnecting… n/5 (unexpected status 401 Unauthorized …)" then exit 1 after **16–26 s** of internal retries → `auth` by text; the deadline must win. **opencode bad model and opencode logged out (throwaway data dir) are identical on stdout**: one `error` event `UnknownError "Unexpected server error"`, exit 1. Only `--print-logs` stderr names the cause, and for logged-out it is `ProviderModelNotFoundError` (the gpt-6 ids exist only under the OAuth login), so logged-out cannot be told from a bad model → no `auth` kind. Quota: not provoked (Codex needs login; the Z.AI 429 would be provoked) | **FAIL** (opencode); Claude/Codex logged-out shapes recorded; quota NOT RUN |
| P0-5 opencode | killed or truncated, `finish: length` | `probe.mjs p05`: 4 000 words, `maxOutputChars` 2 000; second arm `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX=300` — `p05.json` | `--format json` emits the text as **one event after generation**, so the bound fired only at the end (139 s, 4 627 output tokens spent), `reason: stop`. The env cap was **ignored** (4 498 tokens, `stop`) | **FAIL** (no bound on spend; only the deadline limits it) |
| P0-5 Claude, Codex | same | — | login decision pending from the user | NOT RUN |
| P0-6 | spawns with `shell:false`; `.cmd` shim refused | `facts.mjs` — `facts.json` `shimSpawnNoShell` | all three real `.exe` spawn. Chocolatey exe shim spawns (and forks the real exe as a grandchild). npm `.cmd` → `EINVAL`, `.ps1` → `EFTYPE`, both thrown synchronously by `spawn` (the plugin must catch) | PASS |
| P0-7 opencode | hosts ⊆ {vendor, documented telemetry}; no canary in home/app-data with flags on | `probe.mjs p07` (5 calls flags on, 5 flags off), netstat per tree PID every 100 ms + DNS cache names for those IPs; residue = DB row counts, canary row counts, files newer than the arm start — `p07.json` | Hosts, both arms: `chatgpt.com` (vendor), **`models.opencode.ai`** (catalog fetch; `OPENCODE_DISABLE_MODELS_FETCH` was not set), **`registry.npmjs.org`**, plus 5 Cloudflare IPs the DNS cache did not name. Residue, flags on: prompt **and** reply canaries in the real `opencode.db` for 5/5 calls (`part`, `event`, and 2 `session` titles); `log/opencode.log` appended (no canary). Nothing in the real opencode config/cache/state dirs or `~/.codex`; nothing with a canary in the throwaway homes. `run` has no no-persist flag, so flags on = flags off | **FAIL** (read-role text persisted; unnamed hosts) |
| P0-7 Claude, Codex | same | — | login decision pending from the user | NOT RUN |
| rule 5 env allowlist (PS-H 6 canary) | secret names absent in child; set pass-through vars present unchanged; control sees them | `probe.mjs envAllowlist`: node child under `envFor` vs full env; canaries = every `ANTHROPIC_*` (incl. `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`), `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_OAUTH_SCOPES`, `SO_P0_SECRET_CANARY`; pass-through `HTTPS_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `DO_NOT_TRACK` set to dummies — `envAllowlist.json` | allowlisted child: all 10 secret names `absent`, all 4 pass-through `present-unchanged`; control child: all `present-unchanged`. Harness level: `claude auth status` under `envFor` → `loggedIn:false` although the parent holds `ANTHROPIC_AUTH_TOKEN` | PASS |
| config-home (no model) | throwaway config home replaces the real one; which planted files load | `probe.mjs configIsolation` (`opencode --pure debug config / debug skill / debug agent so-text`, with and without the quiet env) — `configIsolation.json` | real config never seen (0 real agent/skill names, real path absent). The throwaway global config **is** loaded under the quiet env: its agent file and its skill are listed; `~/.claude/skills` is listed only without the quiet env | FACT |

**Residue in the real `~/.local/share/opencode/opencode.db`** (P0-7 count, all attributable: every session's `directory` is
under `%TEMP%\so-p0`, and the whole-DB delta since the pre-smoke baseline equals the attributable rows): `session` +87,
`message` +172, `part` +342, `event` +1 344, `event_sequence` +87; plus 1 `project_directory` row
(`%TEMP%\so-p0…`, created 2026-09-25 by the run-1 attempt). Tables with no change: every other table, including
`account`, `credential`, `session_share`. `log/opencode.log` grew by append. Nothing was deleted; removing the rows is
the user's call.

**What the results mean for the design.**
1. opencode is not isolated by argv + env: a global config home's instructions, `AGENTS.md` and MCP servers reach the
   run (P0-2, H-N1b). Q7 is therefore not optional for opencode: the plugin must own `XDG_CONFIG_HOME` (only the
   `so-text` agent) and pass `OPENCODE_DISABLE_CLAUDE_CODE` + `OPENCODE_DISABLE_PROJECT_CONFIG`; P0-2/H-N1b must then be
   re-run against that plugin-owned home.
2. opencode writes every prompt and reply to its session DB (P0-7), and its login shares that data dir. Offering it in
   2.5 needs either a data dir holding only a copy of the login (the same user decision as Claude/Codex) or acceptance of
   the residue. As measured, it is **not offered** (plan rule: a harness failing P0-2/H-N1b/P0-7 gets no Phase A arm).
3. The output bound cannot limit opencode spend (P0-5); only the H2 rule-6 deadline can.
4. opencode's error stream cannot classify `auth` (P0-4); the plugin would need `--print-logs` stderr parsing, and even
   then logged-out reads as "model not found".
5. Codex retries a 401 for 16–26 s and opencode retried a 429 for 79 s (run 1 fact): rule 6's deadline is load-bearing.

### Blocks for Phase A (run 2)

1. **Login decision (user):** allow a copy of only the login file into a plugin-owned throwaway home (sha256 of the real
   file before/after, removed after), or run in the real home with back-up/plant/restore. Until then every Claude and
   Codex model-call probe is NOT RUN, so neither can be offered.
2. **opencode fails P0-2, H-N1b, P0-7 (and P0-4, P0-5)** under the rule-3 isolation. Re-run needs the plugin-owned config
   home (and, for P0-7, a plugin-owned data dir), which is the same login decision.
3. P0-3 needs a finer measurement (process-list poll at 100 ms) to settle the 1 s bound.
4. Codex quota until 2026-09-27 20:58.

### Run 1 — 2026-09-26 (superseded by run 2)

**2026-09-26 — BLOCKED, not run. No probe has a verdict; nothing below is a PASS.** Worktree fast-forwarded to master
`83913772`. The first probe batch (`node scripts/spike/harness/facts.mjs`, every CLI in a throwaway home with an
allowlisted env) was refused by the session's auto-mode safety classifier, which then blocks every further CLI spawn in
that session. Phase 0 has to be re-run from a session in the default permission mode. Recorded here: what was measured
before the block (static facts only, no model call), the scripts written for the run, and the auth conflict that decides
how much of Phase 0 can run under the throwaway-home rule at all.

### Run rules (set for this run by the caller)

Every CLI run in a throwaway config home (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, opencode `XDG_CONFIG_HOME`), never the real
`~/.claude`, `~/.codex` or opencode config; Codex with `--ignore-user-config`; no key or credential file read, printed or
copied; canaries only inside throwaway homes; egress by local observation only; predeclared counts only; lanes, main ST,
`C:\dev\so-lanes` and the RunPod pod untouched.

Deviation: `claude --version`, `codex --version`, `opencode --version` ran once each in the **real** environment (before
the throwaway-home helper existed). Version strings only; no model call, no config written by design.

### CLI host facts (static; measured 2026-09-26)

| Harness | Version | Binary (spawn target, `shell:false`) | Shims on PATH | Config-home variable | Where the login lives |
|---|---|---|---|---|---|
| Claude Code | 2.1.282 | `~\.local\bin\claude.exe` (native, 242 MB) | none | `CLAUDE_CONFIG_DIR` (string in binary) | under `~/.claude` = the config dir, so a throwaway `CLAUDE_CONFIG_DIR` is **logged out** |
| Codex | 0.155.1 | `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe` (native, 307 MB; sibling `codex-code-mode-host.exe`) | none | `CODEX_HOME` (also `CODEX_SQLITE_HOME`) | `auth.json` in `CODEX_HOME`: a throwaway home is **logged out** |
| opencode | 1.18.32 | `C:\ProgramData\chocolatey\lib\opencode\tools\opencode.exe` (real exe) | PATH's first hit `C:\ProgramData\chocolatey\bin\opencode.exe` is a 291 KB chocolatey shim (it spawns the real exe as a child, so a kill must take the tree); stale npm shims `C:\Program Files\nodejs\opencode{,.cmd,.ps1}` and `%APPDATA%\nvm\v22.22.0\opencode{,.cmd,.ps1}` (rule 1: refused) | `XDG_CONFIG_HOME`, `OPENCODE_CONFIG_DIR`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT` | `auth.json` in the **data** dir (`~/.local/share/opencode`, next to the session DB `opencode.db`). A throwaway config home keeps the login; the session DB is then the real one |

Env-variable and flag names found by a string scan of each binary (`scripts/spike/harness/envscan.mjs`). Presence of a
string is not behaviour: each row is a candidate, unverified until a probe uses it.

| Harness | Opt-out / isolation candidates | Proxy / CA | Output cap | System prompt by file |
|---|---|---|---|---|
| Claude | `DISABLE_TELEMETRY`, `DISABLE_ERROR_REPORTING`, `DISABLE_AUTOUPDATER`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DO_NOT_TRACK`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS` | `CLAUDE_CODE_MAX_OUTPUT_TOKENS` (env, no flag) | `--system-prompt-file`, `--append-system-prompt-file` strings present (rule 2 fact still owed: not in `--help` check yet) |
| Codex | none found (only `OTEL_*` exporter settings); analytics is a config key, and `--ignore-user-config` drops the user's | `HTTPS_PROXY`, `SSL_CERT_FILE`, `CODEX_CA_CERTIFICATE` | not found | not found (rule 2: prepend on stdin) |
| opencode | `OPENCODE_DISABLE_AUTOUPDATE`, `OPENCODE_DISABLE_SHARE`, `OPENCODE_DISABLE_MODELS_FETCH`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_DISABLE_EXTERNAL_SKILLS`, `OPENCODE_DISABLE_DEFAULT_PLUGINS`, `OPENCODE_PURE`, **`OPENCODE_DISABLE_CLAUDE_CODE` (+`_PROMPT`, `_SKILLS`)** | not found by name (Bun runtime; unverified) | `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX` | agent `prompt` via `OPENCODE_CONFIG_CONTENT` (env: rule 2 forbids it for `system`) |

Two findings that change the P0-2 design:

1. **opencode reads Claude Code's files by default** (the `OPENCODE_DISABLE_CLAUDE_CODE*` switches exist). P0-2's
   opencode arm must also plant a canary in `~/.claude/CLAUDE.md` and a `~/.claude/skills/` skill of the throwaway
   `HOME`, and rule 3's opencode argv needs those switches if the canary gets through.
2. **The shell this session runs in exports `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`** (names seen, values never
   read), inherited from the desktop host. A Claude child that inherits them authenticates without any config home, so a
   "throwaway home" probe that passes the parent env is not isolated, and an ST started from such a shell hands them to
   the plugin. Rule 5's allowlist is therefore load-bearing, and PS-H 6 should use one of these names as its canary.
   `scripts/spike/harness/lib.mjs` `envFor` builds the child env from an allowlist and a throwaway `USERPROFILE`/`HOME`/
   `APPDATA`/`LOCALAPPDATA`.

### Probes (run 1)

Scripts: `scripts/spike/harness/lib.mjs` (spawn with `shell:false`, allowlisted env, throwaway homes under
`%TEMP%\so-p0`, `taskkill /T /F` tree kill, process-tree and `netstat -ano` sampling), `facts.mjs` (the refused batch),
`envscan.mjs`. **None of them has run to completion; `probe.mjs` is not written.** Records would go under
`test/journeys/records/v2.5-harness/phase0/` (empty).

| # | Predeclared PASS | Command (planned) | Result | Verdict |
|---|---|---|---|---|
| P0-1 | 20/20 PONGs per harness × model; p50/p90 wall, spawnMs, input tokens | `opencode run --pure --format json --agent so-text -m openai/gpt-6-astra-fast` (and `gpt-6-astra`), stdin `PONG` prompt, throwaway config home, real data dir; Claude `-p … --model haiku/sonnet`; Codex `exec - --json --ephemeral --ignore-user-config …` | blocked. Claude and Codex are logged out in a throwaway home (see auth conflict) | NOT RUN |
| P0-2 | canary never echoed, tokens ±5, control arm echoes it (else void) | canaries in temp-cwd `CLAUDE.md`/`AGENTS.md` and user level of each throwaway home (`$CLAUDE_CONFIG_DIR/CLAUDE.md`, `$CODEX_HOME/AGENTS.md`, `$XDG_CONFIG_HOME/opencode/{opencode.json instructions, agent, skill}`, plus `$HOME/.claude/CLAUDE.md` for opencode) | blocked; Claude/Codex arms need a login in the throwaway home | NOT RUN |
| H-N1 | 0 tool events, no file content, 5/5 per harness | tool-bait prompt (list cwd, read `~/.ssh/known_hosts` of the throwaway home, `whoami`, fetch a URL) | blocked | NOT RUN |
| H-N1b | no marker file, 0 MCP children, 0 MCP events, 5/5 | `[mcp_servers.canary]` (Codex), `.claude.json` `mcpServers` (Claude), `opencode.json` `mcp` in the throwaway homes, command = `node -e` writing a marker in the home | blocked. The review text says "auth copied"; this run's rules forbid copying, so Claude/Codex can only give the pre-auth half (does an unauthenticated CLI start MCP servers) | NOT RUN |
| P0-3 | tree gone within 1 s of a 3 s deadline, `timeout` | long-answer prompt, `lib.mjs` deadline → `taskkill /T /F`, `psTree` before/after | blocked | NOT RUN |
| P0-4 | bad model / logged-out / quota each map to a kind | bad model on opencode; logged-out = every CLI in a fresh throwaway home (needs no auth, cheapest probe); quota only if natural (Codex until 2026-09-27 20:58) | blocked | NOT RUN |
| P0-5 | killed or truncated, `finish: length` | 4 000-word ask, `maxOutputChars` 2 000 (`lib.mjs` kills at 2×) | blocked | NOT RUN |
| P0-6 | each binary spawns with `shell:false`; a `.cmd` shim is detected and refused | `facts.mjs` spawns the three real exes and the four opencode shims with `shell:false` | blocked. Static: all three real entries are `.exe`; opencode's PATH-first hit is a chocolatey exe shim (spawnable, but the model process is its grandchild) | NOT RUN |
| P0-7 | hosts ⊆ {vendor, documented telemetry}; no canary in home/app-data with flags on | `lib.mjs` `watch` (netstat per tree PID, 100 ms), `ipconfig /displaydns` after, `find -newer` over the throwaway home and the real opencode data dir, canary grep (auth files excluded) | blocked | NOT RUN |
| PS-H | plan 12 PS-H 1–12 | needs the plugin; Phase 0 owes only PS-H 5's inputs (config-home variable per CLI: table above) and its precondition (control arm echoes the canary) | variables recorded statically; precondition not run | NOT RUN |

### Auth vs the throwaway-home rule (run 1; decides what Phase 0 can measure)

With credentials never copied: Claude and Codex are **logged out** in any throwaway home, so every model-call probe
(P0-1, P0-2, H-N1, H-N1b, P0-3, P0-5, P0-7) can run on them only as "needs auth in the real home, not probed". Only
opencode keeps its login (data dir) while its config home is throwaway, at the price of writing its session DB in the
real `~/.local/share/opencode/opencode.db`, which P0-7 must then count as residue. PS-H 5 and Q7 both assume login
material is copied into the throwaway home. That is a user decision: allow a copy of only the login file into a throwaway
home (removed after, sha256 of the real file before/after), or run Claude/Codex Phase 0 in the real home with the
back-up/plant/restore path P0-2 already describes.

### Blocks for Phase A (run 1)

1. Phase 0 has not run: re-run from a default-permission session (`facts.mjs`, then a `probe.mjs` built on `lib.mjs`).
2. The auth decision above; without it no Claude or Codex arm can pass P0-2/H-N1/H-N1b/P0-7, so neither harness can be
   offered (plan rule: a harness that fails them is not offered and gets no Phase A arm).
3. Codex quota until 2026-09-27 20:58.
