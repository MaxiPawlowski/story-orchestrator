# Plan 03b — Devtools Hardening (agent eyes & hands)

## Objective

Turn `scripts/debug/` into the build agent's primary validation surface: persistent browser session, a declarative scenario runner with assertions and exit codes, the missing mutation/payload verbs, and discoverability — so every plan gate is 1–2 commands instead of a hand-orchestrated chain, and E2E debugging burns no context on re-exploration.

## Context

- Read: `.claude/rules/debug-scripts.md`, `scripts/debug/lib/*.mjs`, the two scenario embryos `so-runtime-check.mjs` / `so-extraction-check.mjs`, Gate records of plans 01–03.
- Execute **before plan 03a's live burn-down** (03a's gate uses the verbs built here). 03a's code fixes don't depend on this plan.
- Findings this plan resolves (from the tooling review): per-invocation browser launch w/ headed default (~3–5 s/script); no assertion mode; missing swipe/edit/delete, WI-status, payload-capture verbs; `st-search` ST-root is a fragile fixed-depth walk (verified working at current location 2026-07-05 — harden anyway per deliverable 7); no sandbox/cleanup; 2/11 scripts documented.
- Playwright MCP is installed since this plan was written (project-scoped `playwright` server, `npx @playwright/mcp@latest`; the official plugin duplicate is being uninstalled). Today it launches an isolated browser; deliverables 1/1b make it attach to the same session as the scripts. Full playbook + division-of-labor guidance lives in `.claude/skills/debug/SKILL.md` (exists; this plan updates it).

## Scope

**In**: the deliverables below; refresh of `.claude/rules/debug-scripts.md` + `.claude/skills/debug/SKILL.md`; README; wiring the already-installed project-scoped Playwright MCP server to the shared browser session (deliverable 1b).
**Non-goals**: no extension-code changes except tiny test hooks if strictly needed (record any); no new MCP servers beyond reconfiguring the existing `playwright` one; no new UI.

## Deliverables

1. **Persistent session (CDP-shared)** — `st-session.mjs start|stop|status [--headed]`: `start` spawns a detached Node process that runs `chromium.launch({ args: ['--remote-debugging-port=9222'], headless })` (headless default), navigates to ST, waits ready, writes `{cdpEndpoint: "http://127.0.0.1:9222", stUrl, pid, startedAt}` to `.debug/session.json`; `stop` kills by pid + removes the file. **Not** `chromium.launchServer()` — its Playwright-protocol wsEndpoint can't be attached by Playwright MCP; a CDP endpoint serves both the scripts and MCP. `lib/connection.mjs` gains attach-first behavior: if `session.json` exists and `chromium.connectOverCDP(cdpEndpoint)` succeeds, reuse (existing ST page or new page — builder picks, record); else fall back to today's ephemeral launch (now headless by default, `--headed` flag). All scripts inherit; per-script cost drops to ~200 ms.

1b. **MCP wiring** — reconfigure the project-scoped `playwright` MCP server (currently `npx @playwright/mcp@latest`, local scope in `~/.claude.json`) to attach to the session browser: `claude mcp remove playwright -s local` then re-add with `--cdp-endpoint http://127.0.0.1:9222` (local scope or checked-in `.mcp.json` — builder picks, record). After this, MCP browser tools and debug scripts see the *same live page*: scripts for deterministic state/actions/assertions, MCP (`browser_snapshot`, `browser_console_messages`, `browser_network_requests`, ad-hoc clicks) for exploratory eyes. Document that MCP browser tools now require `st-session start` first, and what the error looks like when no session is up.
2. **Scenario runner** — `so-scenario.mjs run <file.json> [--sandbox] [--keep]`: generalizes the two check scripts. Step vocabulary:
   - `{"import_story": {...inline or "file": "test/fixtures/x.story.json"}}`, `{"select_story": "<title|hash>"}`
   - `{"send": "text"}` (uses `/send compact` — no generation), `{"send_generate": "text"}` (real generation, wait-idle)
   - `{"slash": "/cp set found_key true"}`
   - `{"extract": {"debugResponse": "DELTA …"}}` (the deterministic path)
   - `{"swipe": {"messageId": n}}`, `{"edit": {"messageId": n, "text": "…"}}`, `{"delete": {"messageId": n}}`
   - `{"wait": {"idle" | "boundary": n | "auditCount": n | "checkpoint": "id", "timeoutMs": 10000}}`
   - `{"expect": {"activeCheckpoint": "door", "blackboard": {"player_has_key": true}, "latched": ["player_has_key"], "auditCount>=": 1, "npcFired": {"door:onEnter:DM Narrator:0": 1}, "requirementsReady": true}}` — blackboard compares as subset.
   - `--sandbox`: `/newchat` first; on finish delete the imported story from the library and (best-effort) the scratch chat; `--keep` skips cleanup.
   - Output: one compact line per step (`ok`/`FAIL reason`), final summary JSON, **exit 0 only if all green**. Full state dumps only on failure (to `.debug/`).
   - Port `so-runtime-check` and `so-extraction-check` content into `test/scenarios/plan02-runtime.json` and `plan03-extraction.json`; keep the old scripts as thin wrappers or delete (record).
3. **Mutation verbs** — `st-actions.mjs swipe <messageId> | edit <messageId> <text> | delete <messageId>`: implement via ST internals in `page.evaluate` (locate the functions in ST source — `st-search` helps; verify event emission matches what `turnBridge` subscribes to, since 03a's rollback validation rides these).
4. **Payload eyes** — `st-payload.mjs arm|last|watch [n]`: capture actual generation request payloads (prompt/messages) — hook `fetch`/XHR to `/api/backends/*` in the page or ST's event bus if it exposes payload events (investigate; record chosen mechanism). Must attribute per-draft member in group rounds (plan 10's private-block validation depends on this). Scope note: MCP `browser_network_requests` already covers *ad-hoc* payload inspection on the shared session — don't duplicate that; `st-payload` exists only for what MCP can't do: assertable capture inside scenario gates and per-draft-member attribution.
5. **WI status verb** — `st-actions.mjs wi-status <book> <comment>`: report entry enabled/disabled (+ exists) so 03a's WI-toggle check is assertable.
6. **Assertion flags** — `so-state.mjs current --expect activeCheckpoint=door --expect bb.player_has_key=true` → exit code; keep JSON output.
7. **Fixes & hygiene** — `st-search` ST-root: walk upward until `public/script.js` found, `--root`/`ST_ROOT` env override (T1). `waitForIdle` also checks non-streaming signals (send-button disabled state / `is_send_press` — verify in ST source) (T2). `.debug/` rotation: keep newest ~40 artifacts. Screenshot removed from `so-ui all` (own subcommand only). Bare `so-state` (no subcommand) prints the compact summary; `--full` for the blob.
8. **Discoverability** — `scripts/debug/README.md` (verb table, session workflow, scenario format, examples); USAGE + `--help` in every script. Update `.claude/skills/debug/SKILL.md` (already exists; carries the full playbook incl. scripts-vs-MCP division): replace its interim "MCP runs an isolated browser" caveat with the session-first shared-CDP workflow, add the new verbs (`st-session`, `so-scenario`, swipe/edit/delete, `st-payload`, `wi-status`) and scenario format. Refresh `.claude/rules/debug-scripts.md` (compact, always-loaded) in sync: session-first workflow, scenario-runner-first validation, scripts-vs-Playwright-MCP division (scripts for state/actions/assertions; MCP browser tools only for ad-hoc exploratory debugging); npm aliases (`npm run debug:state`, `debug:scenario`, `debug:session`).

## Implementation notes

- Attach-mode must handle a stale `session.json` (dead endpoint → fall back + overwrite).
- Scenario `expect` failures should print the relevant *subset* of actual state, not the whole blob.
- Swipe semantics in ST: swiping generates a new reply variant — for deterministic tests prefer `swipe` on an existing multi-swipe message or pair with `extract debugResponse`; document the recipe in README.
- Keep everything Node ESM + Playwright, consistent with existing lib; extract the repeated CLI scaffold (connect→ready→run→write→close) into `lib/cli.mjs` while touching every script anyway.

## Validation gate

1. `st-session start` then any 3 scripts back-to-back complete in < 3 s total (vs ~12 s ephemeral); `st-session stop` cleans up; scripts still work with no session (fallback).
2. `so-scenario run test/scenarios/plan03-extraction.json --sandbox` passes green, exits 0, and leaves no new story in the library and no scratch chat behind; a deliberately wrong `expect` exits non-zero with a one-line diff.
3. `st-actions swipe|edit|delete` each fire the corresponding ST event (verified via a temporary listener or `so-state` rollback observation once 03a lands — for this gate, event emission logged is enough).
4. `st-payload last` shows the exact prompt of the most recent generation incl. author-note content.
5. `st-search --context-exports` works from the moved repo location.
6. README + rules + skill refreshed; every script answers `--help`.
7. MCP shared-session round-trip: with `st-session` running and the MCP `--cdp-endpoint` config applied, a debug script mutates state (e.g. `st-actions checkpoint 2`) → MCP `browser_snapshot` shows the updated drawer on the same page; inverse direction too (MCP click → `so-state current` reflects it). An MCP browser tool call with **no** session up yields a diagnosable error that `st-session start` fixes.
8. Gate record: chosen mechanisms (attach mode, MCP config scope, payload hook, swipe recipe), timings before/after.

## Delegated decisions

Session page reuse vs new-page-per-script; fixed port 9222 vs env-configurable (`ST_DEBUG_CDP_PORT`); MCP config scope (local `~/.claude.json` vs checked-in `.mcp.json`); single shared page vs per-client pages on the shared browser; payload hook mechanism; scenario JSON fine-grained syntax; rotation count; wrapper-vs-delete for the old check scripts.

## Gate record

Date: 2026-07-05

Implemented:
- `opencode.json` bridge added so opencode reuses `.claude/CLAUDE.md`, `.claude/rules/*.md`, and `.claude/skills`; duplicated `agents.md` removed.
- `st-session.mjs start|stop|status` added with CDP endpoint `http://127.0.0.1:9222`, `ST_DEBUG_CDP_PORT`, `ST_DEBUG_TIMEOUT_MS`, and `.debug/session.json`.
- `connection.mjs` attach-first behavior added; ephemeral fallback is headless by default. Attach uses `connectOverCDP` + `browser.close()` (which disconnects without killing Chromium in Playwright 1.58).
- `so-scenario.mjs run <file.json> [--sandbox] [--keep]` added; plan 02/03 checks ported to `test/scenarios/plan02-runtime.json` and `plan03-extraction.json`; old check scripts are wrappers.
- `st-actions.mjs` gained `send-compact`, `swipe`, `edit`, `delete`, and `wi-status`; `waitForIdle` includes send-button disabled state.
- `st-payload.mjs arm|last|watch` added using page-side fetch/XHR hooks plus `GROUP_MEMBER_DRAFTED` attribution where available.
- `so-state.mjs current --expect path=value` added; compact current state is default, `--full` preserves full output.
- `st-search` root discovery now walks upward to `public/script.js` and supports `ST_ROOT`; `so-ui all` no longer takes screenshots.
- `.debug/` artifact rotation added; newest 40 files per artifact directory retained.
- `scripts/debug/README.md`, `.claude/rules/debug-scripts.md`, `.claude/skills/debug/SKILL.md`, and npm aliases refreshed.
- All 13 debug scripts patched with `process.exit()` in their finally blocks to prevent Playwright CDP handles from keeping Node alive.
- `--help` added to all 11 CLI-entry scripts.

Chosen mechanisms:
- Attach mode: one shared CDP Chromium page, scripts reuse an existing ST-origin page or open one if needed.
- Session launcher: foreground `start` spawns a detached `__starter` background process via PowerShell `Start-Process` (Windows); starter launches Chromium via `spawn` + `detached` + `unref()`, waits for CDP + ST readiness, writes session file, exits. Foreground polls `session.json` via HTTP, prints result, `process.exit(0)`. No harness hang.
- MCP config scope: checked-in opencode `mcp.playwright` uses `--cdp-endpoint`; Claude Code local config remains documented rather than duplicated.
- Payload hook: fetch/XHR wrapper inside the page, not MCP network log scraping.
- Swipe recipe: deterministic only against an existing multi-swipe message; overswipe generation is rejected.
- Rotation count: 40 artifacts per directory.
- Old checks: wrappers retained.

Validation (all green):
- `npm run typecheck` passed.
- `npm test` passed: 2 suites, 17 tests.
- `npm run lint` passed.
- `npm run build` passed with existing Browserslist and webpack size warnings (`dist/index.js` 284 KiB).
- `st-search --context-exports` found `public/scripts/st-context.js` exports from the nested extension path.
- `st-session start` — exits cleanly (no hang), background starter writes valid session.
- 3 scripts back-to-back on shared session: 2196ms total (gate requirement < 3s).
- Session survives 5+ consecutive script runs without dying.
- `so-scenario run test/scenarios/plan03-extraction.json --sandbox` — all 5 steps green, exit 0, imported story cleaned from library.
- `so-scenario run test/scenarios/plan02-runtime.json` (via wrapper) — all 8 steps green, exit 0.
- `so-mutation-check.mjs` — green; prepared a deterministic multi-swipe message and observed `message_swiped`, `message_edited`, and `message_deleted` with the expected message id.
- `so-state current --expect activeCheckpointId=door` — exit 0.
- `so-state current --expect activeCheckpointId=start` — exit 1, one-line diff.
- `st-payload arm|last` — works.
- `st-actions generation-state` — works.
- `so-ui all` — no screenshot taken.
- `st-session stop` — kills Chromium, cleans session file.
- Fallback mode (no session) — ephemeral headless browser works, exits cleanly.
- Every script answers `--help`.
- MCP/browser-tool shared-session round-trip — green. Script `/cp activate door` was visible via browser `evaluate`; browser-tool `activateCheckpoint('end')` was visible via `so-state current --expect activeCheckpointId=end`.

Not validated this session:
- Exact Claude Code local MCP config reload; opencode project config is checked in and current browser tools successfully shared the session in this harness.
