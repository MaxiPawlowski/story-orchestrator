# Plan 03b — Devtools Hardening (agent eyes & hands)

## Objective

Turn `scripts/debug/` into the build agent's primary validation surface: persistent browser session, a declarative scenario runner with assertions and exit codes, the missing mutation/payload verbs, and discoverability — so every plan gate is 1–2 commands instead of a hand-orchestrated chain, and E2E debugging burns no context on re-exploration.

## Context

- Read: `.claude/rules/debug-scripts.md`, `scripts/debug/lib/*.mjs`, the two scenario embryos `so-runtime-check.mjs` / `so-extraction-check.mjs`, Gate records of plans 01–03.
- Execute **before plan 03a's live burn-down** (03a's gate uses the verbs built here). 03a's code fixes don't depend on this plan.
- Findings this plan resolves (from the tooling review): per-invocation browser launch w/ headed default (~3–5 s/script); no assertion mode; missing swipe/edit/delete, WI-status, payload-capture verbs; `st-search` ST-root broken since the repo move; no sandbox/cleanup; 2/11 scripts documented.

## Scope

**In**: the deliverables below; refresh of `.claude/rules/debug-scripts.md`; README.
**Non-goals**: no extension-code changes except tiny test hooks if strictly needed (record any); no MCP server setup; no new UI.

## Deliverables

1. **Persistent session** — `st-session.mjs start|stop|status [--headed]`: launches Chromium via `chromium.launchServer()` (headless default), navigates to ST, waits ready, writes `{wsEndpoint, stUrl, startedAt}` to `.debug/session.json`. `lib/connection.mjs` gains attach-first behavior: if `session.json` exists and connects (`chromium.connect`), reuse (new page or reuse page — builder picks, record); else fall back to today's ephemeral launch (now headless by default, `--headed` flag). All scripts inherit; per-script cost drops to ~200 ms.
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
4. **Payload eyes** — `st-payload.mjs arm|last|watch [n]`: capture actual generation request payloads (prompt/messages) — hook `fetch`/XHR to `/api/backends/*` in the page or ST's event bus if it exposes payload events (investigate; record chosen mechanism). Must attribute per-draft member in group rounds (plan 10's private-block validation depends on this).
5. **WI status verb** — `st-actions.mjs wi-status <book> <comment>`: report entry enabled/disabled (+ exists) so 03a's WI-toggle check is assertable.
6. **Assertion flags** — `so-state.mjs current --expect activeCheckpoint=door --expect bb.player_has_key=true` → exit code; keep JSON output.
7. **Fixes & hygiene** — `st-search` ST-root: walk upward until `public/script.js` found, `--root`/`ST_ROOT` env override (T1). `waitForIdle` also checks non-streaming signals (send-button disabled state / `is_send_press` — verify in ST source) (T2). `.debug/` rotation: keep newest ~40 artifacts. Screenshot removed from `so-ui all` (own subcommand only). Bare `so-state` (no subcommand) prints the compact summary; `--full` for the blob.
8. **Discoverability** — `scripts/debug/README.md` (verb table, session workflow, scenario format, examples); USAGE + `--help` in every script; refresh `.claude/rules/debug-scripts.md` to teach: session-first workflow, scenario-runner-first validation, scripts-vs-Playwright-MCP division (scripts for state/actions/assertions; raw browser tools only for ad-hoc visual debugging); npm aliases (`npm run debug:state`, `debug:scenario`, `debug:session`).

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
6. README + rules refreshed; every script answers `--help`.
7. Gate record: chosen mechanisms (attach mode, payload hook, swipe recipe), timings before/after.

## Delegated decisions

Session page reuse vs new-page-per-script; payload hook mechanism; scenario JSON fine-grained syntax; rotation count; wrapper-vs-delete for the old check scripts.
