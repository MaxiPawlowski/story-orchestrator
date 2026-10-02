---
name: debug
description: >
  Live-debug the Story Orchestrator extension against a running SillyTavern
  (http://127.0.0.1:8000/): inspect runtime state, drive UI, send messages,
  run slash commands, validate checkpoints/extraction, capture screenshots.
  Use for any live/E2E validation, Playwright work, or "why is the extension
  doing X in the browser" question.
---

# Debug — Story Orchestrator

Two complementary toolsets. Pick by task, don't mix roles:

| | Predefined scripts (`scripts/debug/`) | Playwright MCP (`mcp__playwright__browser_*`) |
|---|---|---|
| **For** | Deterministic reads/actions/assertions; anything a gate depends on; anything you'll run twice | Exploratory only: look around, inspect visuals/console/network, ad-hoc clicks in UI not covered by `so-ui` |
| **Key tools** | `st-session`, `so-scenario`, `so-state current`, `st-actions`, `st-payload`, `so-ui` | `browser_snapshot` (a11y tree), `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, `browser_evaluate` |
| **Rule** | Gate validations are scripts with exit codes | Never build multi-step validation chains from MCP calls when a script exists; if you repeat an MCP sequence, promote it to a script |

Start with `node scripts/debug/st-session.mts start` when using scripts and MCP together. Scripts attach to `.debug/session.json`; MCP attaches to `http://127.0.0.1:9222` via the repo `.mcp.json` (`--cdp-endpoint`), so both drive ONE browser. If MCP browser tools fail to connect, start the session and retry. **Warning**: an MCP playwright server configured without `--cdp-endpoint` (e.g. user-level default) silently launches its own isolated Chromium — state seeded there is invisible to the scripts and vice versa. Before any shared-state MCP work, verify with a marker round-trip: MCP `browser_evaluate` sets `globalThis.__x`, then `st-eval.mts "globalThis.__x"` must return it.

Do not use unbounded terminal processes for gates. Debug scripts have hard connection timeouts (`ST_DEBUG_TIMEOUT_MS`, default 30000), `st-payload watch` has a default 60s timeout, and `st-session stop` cleans up the Windows process tree. Use WSL/tmux only for unrelated long-running app servers, not for these validation scripts.

## Prerequisites

- SillyTavern running at `http://127.0.0.1:8000/` with an LLM backend connected.
- `npx playwright install chromium` if browser binaries missing.

Scripts run via `node scripts/debug/<tool>.mts`, attach to the shared session first, otherwise launch a short-lived headless Chromium. Artifacts go to `.debug/` (gitignored; screenshots in `.debug/screenshots/`).

**Two isolated sessions at once** (v2.3 plan 11's concurrent-load recipe) = `ST_DEBUG_CDP_PORT=<port>` **and** `SO_DEBUG_DIR=<dir>` per process. The port alone is not enough: two processes sharing one `.debug/` also share `session.json` (the second `st-session start` overwrites the first's record), the journey config snapshot and the asset baseline, so the second run's cleanup reads the first's state. `SO_DEBUG_DIR` (unset = `.debug/`) is resolved against the project root unless it is absolute; a custom directory is **not** gitignored, so keep it under `.debug*` or clean it yourself. Guarded by `scripts/debug/lib/connection.test.mts`.

## Real-LLM validation (default gate)

Handover sign-off for LLM-consuming paths requires the real model, not `debugResponse` mocks. Mocks (`storyOrchestratorDebug*Response` globals, scenario `extract`/`expand` step values) stay valid for unit determinism and scenario plumbing — never for sign-off.

Prerequisites: extraction Connection Manager profile selected in extension settings (`#story-orchestrator-settings` profile picker; visible as `extraction.settings.profileId` in `so-state.mts current`). If ST is down, no backend connected, or no profile selected: state it at handover and flag the gate NOT green — do not silently fall back to mocks.

Triggering real passes (all route through `callExtractionModel` — real path = profile set + no `debugResponse`):

- Main-model generation: `st-actions.mts send <text>` or scenario step `send_generate`.
- Shared read / memory / arc / canon passes: `storyOrchestratorRuntime.runExtractionNow()` with NO response arg, or scenario `extract` step without `debugResponse`.
- Expansion + critic: `runExpansionNow()` with no arg, or scenario `expand` without `debugResponse`.
- Clear leftover `storyOrchestratorDebug*Response` globals first — a set global wins over the real path.

Pass criteria under nondeterminism — assert pipeline behavior, never exact model output:

- audit recorded with prompt + rawResponse, no `debugResponse` marker
- parse succeeded, or failure audited + retried per scheduler policy
- expected delta/memory/arc effect lands within N boundaries (pick N per check, not =1)
- injected blocks (`story_blackboard`, pacing, memory, canon) present in a real generation payload via `st-payload.mts`

One malformed model response correctly audited/retried = plumbing pass. Repeated hard failures against a contract = real finding (prompt/contract issue) — report it, don't paper over with a mock.

**Judge calibration per provider (AS-17, 2026-10-01).** `so-judge calibrate` and `rescore` take `--provider typesafe|llama-logprob` (default `typesafe`), threaded through the harness (`storyOrchestratorJudge.probe/calibrate/calibrateLoreRelevance/rescore(…, model, provider)`); the summary records `provider`, and a llama run never reaches TypeSafe. A llama calibration's model verdict is the model that answered (`resolved`), never TypeSafe's alias check. No privacy-notice gate exists (CR-J3, user decision 2026-10-01: a configured key is consent), so a lane with a key sends judge calls as soon as the judge is on.

**Lanes share one TypeSafe account: split the judge rate across them** (2026-10-01, T0 fixes). Each lane runs its own ST server and so its own judge plugin, with its own per-user limiter (60/min, 2 in flight by default), while every lane spends the same account. Set `SO_JUDGE_RATE_PER_MIN` (and optionally `SO_JUDGE_MAX_IN_FLIGHT`) in the environment the lane server starts from, e.g. 4 lanes on a 60/min account: `SO_JUDGE_RATE_PER_MIN=15 node scripts/debug/st-lanes.mts start 1` (the server inherits the env; a lane already up keeps its old limit until `st-lanes.mts stop <n>` + `start <n>`). The plugin logs the limit it took at load and reports it in `/status` `limits`. A refusal answers 429 with `Retry-After` (seconds until the oldest call leaves the window; an upstream 429 passes TypeSafe's own `Retry-After` through), and the page then holds every judge call until that time: the burst behind it takes `fallback=busy` without being sent (not metered, status not invalidated). **`so-session start` sets it for you** (T1 fixes, 2026-10-01): the lane's limit is the account rate (`SO_JUDGE_ACCOUNT_RATE_PER_MIN`, default 90/min) split over the running lanes plus this one (1: 60, 2: 45, 3: 30, 4: 22; bounded 10..60), passed to the seed and lane start, recorded in `session.json` `judgeRate` (with the limit the plugin logged at load), and `--judge-rate <n>` overrides it; a lane already up at another limit is a start warning. 90 is measured, not documented by TypeSafe: the T0 lanes (60/min each) peaked at 72 sent calls in one minute across lanes with every T0 429 at our own per-lane cap; in T1 (15/min per lane) 22 of the 26 judge 429s inside the recorded call rings sat at that cap or right after a page timeout, and the other 4 came at 6-14 calls/min across the two lanes with a recorded ring (T1-3 kept none), too low to be an account limit. The plugin did not log upstream statuses then, so this is inference from timing, not proof. `/status` `refusals` now splits our limiter's 429s (`local`) from TypeSafe's (`upstreamBusyAnswers`, `upstreamRefused`, `lastUpstream`), and the plugin logs every upstream 429 that reaches the page, so the next session settles the account's real limit. The digest's `findings.md` reports judge health (busy rate by use).

**The plugin allows 60 calls per minute per user, and a calibration is a burst** (2026-10-01, AS-16 re-measure). Stall alone sends 47 calls in under 8 s, so two uses back to back overrun the window and the rest come back `fallback=busy` in ~5 ms (refused locally, never sent upstream). Wait 65 s between uses, and give a use over 60 calls `--chunk <rows>` (scene: `--chunk 40`, two slices 61 s apart). `calibrate` now refuses to record a run with any `busy` row. The off-page recorder (`scripts/spike/typesafe/calibrate-node.mts`) paces itself the same way and builds the handler with `accountsEnabled: false`: off-page the plugin cannot read ST's accounts flag, treats accounts as on and finds no key (every row `fallback=error`, which used to write an EMPTY golden).

## Script reference

### State & data

```bash
node scripts/debug/so-state.mts current        # primary runtime snapshot: chatId, groupId, selectedStoryHash, activeCheckpointId, boundary, visitedAnchors, blackboard, versions, latched, requirements, firedNpcReplies, extraction (settings, scheduler, auditCount, lastAudit incl. prompt/rawResponse/acceptedDeltas)
node scripts/debug/so-state.mts current --expect bb.player_has_key=true
node scripts/debug/so-state.mts all --full
node scripts/debug/so-library.mts              # v2 story library (extensionSettings["story-orchestrator"].v2Stories)
node scripts/debug/so-library.mts <id>         # full v2 story record
node scripts/debug/so-library.mts remove "<id|title>"         # remove from library + flush settings (test cleanup)
node scripts/debug/so-library.mts wipe-chat-meta [--id i]     # delete chat_metadata.story_orchestrator from current chat
node scripts/debug/st-eval.mts "<js>"          # run async JS in the ST page; ctx + rt in scope; bare expression or statements with return
node scripts/debug/st-eval.mts --file <path>   # same, snippet from file — replaces throwaway one-off .mts scripts
node scripts/debug/st-context.mts [keys...]    # getContext() summary or specific keys (chatId mainApi ...)
node scripts/debug/st-extension-settings.mts [--all]
node scripts/debug/st-chat.mts [count|metadata]  # last N messages (default 10) or chat_metadata
```

`so-state` reads persisted `chatMetadata.story_orchestrator` (keyed by `selectedStoryHash`) — live in-page values between persist cycles may differ. Raw blob also visible via `st-chat.mts metadata`.

### Actions

```bash
node scripts/debug/st-actions.mts generation-state
node scripts/debug/st-actions.mts wait-idle [timeout_ms]        # default 30s
node scripts/debug/st-actions.mts send <text>                   # triggers real LLM generation!
node scripts/debug/st-actions.mts send-compact <text>           # /send compact=true, no generation
node scripts/debug/st-actions.mts trigger <member>              # draft a specific group member (/trigger await=true; real generation!)
node scripts/debug/st-actions.mts slash "/checkpoint list"
node scripts/debug/st-actions.mts checkpoint <id_or_index|list|eval>
node scripts/debug/st-actions.mts swipe <messageId> [swipeId]
node scripts/debug/st-actions.mts edit <messageId> <text>
node scripts/debug/st-actions.mts delete <messageId>
node scripts/debug/st-actions.mts wi-status <book> <comment>
```

For deterministic swipe tests, use an existing multi-swipe message. The command fails instead of overswiping into real generation.

### Scenarios

```bash
node scripts/debug/so-scenario.mts run test/scenarios/plan03-extraction.json --sandbox
node scripts/debug/so-mutation-check.mts
node scripts/debug/so-runtime-check.mts
node scripts/debug/so-extraction-check.mts
```

Steps: `import_story`, `select_story`, `send`, `send_generate`, `slash`, `extract`, `expand`, `eval`, `swipe`, `edit`, `delete` (tail-truncate: cuts the chat at the id; a middle delete is `host_delete`, a range `cut`), `wait`, `expect`, plus v2.4's `host_delete`, `cut`, `emit_generation`, `ext_setting`, `record_state` + `expect.stateEquals`, `inject_script`. `--sandbox` starts `/newchat`; cleanup removes imported stories and best-effort deletes the scratch chat unless `--keep` is passed.

Real-LLM scenarios: `test/scenarios/live-plan*.json` + `plan08-hygiene.json` + `live-memory-mirror.json` (the per-chat memory WI book: created without a reload, chat-bound, fires in a real generation; clean up with `so-assets.mts remove --marker SO-MIRROR`) + `live-curator-write.json` (J8's story and lorebook. It accepts whatever the real curator proposes and checks the server file, plus every main-generation prompt via `GENERATE_AFTER_DATA`, against a before-control. The author advances to `tavern` before the pass, because the curator reads only the checkpoint and canon, never the chat. It needs the curator on in review mode; clean up with `--marker SO-J8`) run every step against the real backend (no `debugResponse`). Tolerant wait verbs for nondeterminism: `acceptedDelta`, `reconciliationEvents`, `memoryEntries` (+`memoryTier`), `arcsSummarized`, `canonPresent`. After real `send_generate`, wait on `boundary`, not `idle` — group activation can lag and `idle` passes before generation starts.

### Test assets (wizard / curator runs)

```bash
node scripts/debug/so-assets.mts list --marker SO-J9          # dry run — ALWAYS before remove
node scripts/debug/so-assets.mts remove --marker SO-J9        # delete + leak re-check
node scripts/debug/so-assets.mts assert-clean --marker SO-J9
```

The scope is marker-prefixed names, plus the created-asset ledger (`wizardSessions[].applied`) of **test** sessions only, i.e. keys starting with the slugged marker (`so-j9-wizard`). A real author's wizard sessions and their assets are never read, deleted or cleared. A journey (`cleanup.removeCreatedAssets`, `assets` steps) also passes the `snapshotAssets` baseline it took before setup. That counts ledger entries recorded during the run in any session, spares assets that existed before (`protected`), and drops only this run's own sessions. `list` output: `ledger` (name, session, `test-session`/`this-run`), `sessions`, `protected`, plus `baselineUntrusted` when a baseline was refused. An empty `--marker` is refused.

**An empty baseline is "unknown", not "nothing".** `snapshotAssets` marks one untrusted when the settings root is absent or ST has not listed characters/lorebooks yet, and cleanup then falls back to marker-only scope. Before that guard existed, an empty baseline classified every foreign wizard session's ledger as `this-run` and deleted real user assets while reporting `clean:true`. Each run writes its baseline to `.debug/so-journey-asset-baseline.json` — read it first when cleanup deleted something it should not have.

### Payloads

```bash
node scripts/debug/st-payload.mts arm
node scripts/debug/st-payload.mts last
node scripts/debug/st-payload.mts watch 3 --timeout-ms 60000
```

Payload capture hooks fetch/XHR in the shared page and records recent generation payloads with group draft member attribution when ST emits it.

### Human sessions (v2.6 plan 14)

```bash
node scripts/debug/so-session.mts validate                     # charters.json vs the pinned story index
node scripts/debug/so-session.mts cards --write                # regenerate docs/plans/v2.6/14-cards.md
node scripts/debug/so-session.mts start T1-2 --lane 4          # seed, settings, open, run header, tails; prints the card
node scripts/debug/so-session.mts start T3-1 --lane 4 --allow-comfy   # only after confirming the shared ComfyUI is free
node scripts/debug/so-session.mts stop [test/sessions/T1/T1-2-1] [--stop-lane]
node scripts/debug/so-session.mts digest [test/sessions/T1/T1-2-1]    # findings.md + findings.json
node scripts/debug/so-session.mts index                        # rebuild test/sessions/adolion-stories.json + 14-cards.md after a pin bump
node scripts/debug/so-session.mts lane lease|archive <n>       # lane restore <n> <archiveDir>: keep a leased lane's chats across reseeds
node scripts/debug/so-session.mts rating-pack [C3|R4|Q-M|W6]   # rebuild the blind pack under test/sessions/rating-pack/<gate>/
```

Fail closed (plan 15 AS-21..29, `docs/plans/v2.6/15-review.md` "Review fixes AS (session tooling)"):

- **Start** refuses (exit 2, `start-failed.json`) on any blocking discrepancy: lane build, settings read-back, routing pin, page, away recap, run header, or a tail that never wrote its `<out>.ready` ack. It also refuses a card whose pinned story lacks the features it declares (`requires.features`, e.g. `memberGuidance`, chapters; `validate` lists them) and a leased lane it would reseed.
- **Settings** come from `test/sessions/baseline-settings.json` (versioned; judge on, images/sprites off, spikes off) with the root→card overrides merged over it, applied over the lane's settings keeping only install-owned paths, then read back and asserted; recorded in `session.json`. `src/runtime/sessionBaseline.test.ts` fails when `defaultGlobalSettings` gains a leaf the baseline does not state.
- **Swipes**: ST's own `swipes` setting is off in the real install; `adolion-fresh seed` switches it on in the lane copy before the server starts (recorded in the seed report's `stripped.swipes`, checked by the inventory), and `start` refuses a lane whose `#swipes-checkbox` does not read back on (`session.json` `host.swipes`).
- **Media**: `--media off` is the default (no-media variant): ComfyUI calls in the lane log fail the session and the card's image/sprite rubric rows are `unexercised` (a score there is refused). `--media on` needs `--allow-comfy`.
- **Start popups**: `start` answers the chapter-jump confirm a `startAt` jump raises with "Jump without sealing" (recorded in `session.json` `startPopups`) and fails closed on any other popup instead of hanging.
- **Stop** order: end export → run-header diff (`--owned <session chats>`: growth in a chat the session does not own blocks; group chats the session created are allowed as `+group/chat`, chats it deleted through `delete-chat` as `-group/chat`; a card's `headerAllow` declares the rest, item by item for lists (`inventory.v2Stories:+id`), so an undeclared removal still blocks; `--served-identity`: with `bundle.served.sha256` identical at both ends, `build.head`, `build.manifest.*` and the bundle-mismatch warning are allowed and recorded in `session.json` `warnings`, while a changed served bundle still blocks) → ask each tail to drain → wait for `<out>.drained` → kill → verify. A failed diff, missing ack, missing JSONL or missing required artifact marks the session INVALID (exit 1); `digest` exits 1 on an invalid session.
- **Required evidence** per charter (`requiredArtifacts`): every chat seen or created since `chatsBefore` (`chat-full-*`, `runtime-<chat>.json` = the whole `chat_metadata.story_orchestrator`), `transcripts.jsonl` with swipes, `wizard-drafts.json`, flag context at event time, plus chapter records, folded payloads and harvested reasoning whenever the effective settings enable them.
- **Blind rating packs** (C3/T3-1, R4/T6-1, Q-M/T2-1, W6/T5-1): live verbs take `--arm <label> [--gate <g>]`; stop rebuilds paired, shuffled, unlabelled packs with the arm key in a separate file. `gateStatus` stays `pending`; only the user's verdicts can move a gate.
- **Lanes**: `plan` schedules from the continuation graph; a lane holding a chat a later card continues is leased (`<lanes>/<n>/lease.json`). `adolion-fresh seed` refuses a leased lane unless `--for <dependent>` or `--break-lease`; `lane archive|restore` moves `data`, `adolion-fresh` and the lease aside and back.

Autonomous driver (plan 15 Part B, Claude plays the card; full per-card sequence in `docs/plans/v2.6/14-autonomous-runbook.md`):

```bash
node scripts/debug/so-session.mts plan --write                 # lanes 1-4, continuations pinned to their predecessor's lane
node scripts/debug/so-session.mts start T0-2 --age 24          # lane from lane-plan.json; --profile, --orchestrator <regex>
node scripts/debug/so-session.mts turn <dir> "<line>"          # the OPEN chat (refused unless it is a session chat; --chat <id> names one): send + every reply of the round, again while the scheduler's wait let a new draft start + scheduler idle -> turns.jsonl
node scripts/debug/so-session.mts swipe-new|regen <dir>        # also: edit <dir> <mesid|last> "<text>", delete <dir> <mesid|last>
node scripts/debug/so-session.mts switch-chat-mid-gen <dir> "<line>" --to <chatId>   # and reload-mid-gen <dir> "<line>" (reloads only once the line is on disk)
node scripts/debug/so-session.mts delete-chat <dir> <chatId> --book keep|delete|escape   # export runtime+transcript first, /delchat, answer the lorebook prompt; stop declares the removal
node scripts/debug/so-session.mts flag <dir> "<note>"          # drawer flag with forced clicks, /story flag fallback
node scripts/debug/so-session.mts shot <dir> <label>           # shots/NNN-<label>.png
node scripts/debug/so-session.mts adopt <dir>                  # wizard cards: record the open chat for T5-3/T5-4
node scripts/debug/so-session.mts goal <dir> "<premise>" --mode review|auto-draft --new --go   # wizard cards (no chat yet): Agent entry, goal, Plan it, Go, wait until it settles -> turns.jsonl
node scripts/debug/so-session.mts agent <dir> state|go|continue|new-goal|mode <step|review|auto-draft>   # one Agent pane control (so-ui.mts agent-* does the same without a session)
node scripts/debug/so-session.mts score <dir> <row> <score> "<note>" --evidence turns.jsonl:12   # INVALID session: refused unless --provisional (row marked provisional)
node scripts/debug/so-session.mts budget | runbook --write
```

`start` pins the routing before opening anything (`page-pin.json`): it selects the main profile, probes it with a tiny call (a dead backend fails the start), and checks every orchestrator role routes to a DeepSeek profile, the judge state and key, and each role's reasoning effort. `stop` now captures the live end state BEFORE killing the tails (`chat-full-<chat>.json` with swipes, swipe ids, send dates and `extra.reasoning`; `evidence-<chat>.json` with memory, chapters, canon, memory queue, epistemic, ledger, model and judge call rings, stagecraft, talk decisions, inline timeline, journal, away recap; `snapshot-<chat>.json`), runs `assert-player-clean` for player cards into `rubric.json`, meters DeepSeek and judge spend into `session.json` and `test/sessions/BUDGET.md`. `st-payload arm --persist` also writes `kind: "response"` rows (status, content type, body up to 200k chars, `requestIndex`), which is where DeepSeek `usage` comes from.

A session dir holds `session.json` (lane, pids, chats, build, `playFrom`), `run-header-start/end.json` + `run-header-diff.txt`, `journal.jsonl`, `payloads.jsonl`, `console.jsonl`, the tails' `*.log`, and after `stop` `journal-<chat>.json|md`, `chat-<chat>.json`, `state-end-<chat>.json` and `rubric.json`. `digest` reports flags with +-3 turns and these anomaly kinds, each with `path:line`: stall (10 boundaries without a transition at a checkpoint with exits), extraction-rejected, empty-private-block, lore-force-lost, lore-constant-missed, judge-fallback (not `disabled`), save-lost, unexpected-jump (not an authored edge, or a manual move), rollback, console-error (extension only), model-call-failure, harness-error. Its draft rows go to `docs/plans/v2.6/14-findings.md` after the review. Fixtures: `scripts/debug/fixtures/session/{clean,planted}`.

### UI

```bash
node scripts/debug/so-ui.mts all|settings|drawer|open-settings|open-studio|studio|studio-tab <label>|screenshot [label]
```

Selectors: settings root `#story-orchestrator-settings`, story dropdown `#story-library-select`, arbiter frequency `#story-arbiter-frequency`, drawer = ST top-bar drawer `#so-drawer` with content `#drawer-manager` (open when `.openDrawer`; `so-ui open-drawer` opens it), HUD strip `#so-hud` above the chat input, **Open Studio button `#so-open-studio`, v2 Studio modal `#so-studio-modal`** (portaled to `document.body`; tabs `[role="tab"]`; `studio` verb reports title/active tab/error+issue badges; `studio-tab <Graph|Qualities|Checkpoints|Transitions|Diagnostics>` switches). The button lives inside ST's collapsed inline-drawer — `so-ui open-studio` clicks it; if driving by hand, the button may be `display:none` until the drawer is expanded. Drawer tabs depend on the per-chat "Author view" toggle (`extras.ui.authorView`): player mode shows Overview/Memory only — flip via the drawer-header checkbox or `rt.setUiSettings({authorView:true})` before asserting on Blackboard/Scheduler/Payload.

### Navigation

```bash
node scripts/debug/st-navigation.mts recent-group        # open most recent group chat — run before any inspection
node scripts/debug/st-navigation.mts new-group-session   # new session for current group
node scripts/debug/st-navigation.mts recent-group-new    # both — run before destructive tests
node scripts/debug/st-navigation.mts list-entities       # all groups (id, members, chat count) + characters (index, name, avatar)
node scripts/debug/st-navigation.mts open-group "<id|name>"      # open a specific group
node scripts/debug/st-navigation.mts open-character "<name>"     # open a character (via /go — no DOM dependency)
node scripts/debug/st-navigation.mts list-chats          # chat ids of the open group/character
node scripts/debug/st-navigation.mts open-chat "<chatId>"        # open a specific chat of the current entity
node scripts/debug/st-navigation.mts new-chat            # fresh chat for current group OR character (/newchat)
# all accept --keep-open
```

Standard test loop: `open-group` → `new-chat` → seed via `st-eval` → `send`/`trigger` → assertions → `/delchat` + `so-library remove` + `wipe-chat-meta`.

### Gate check scripts (assert-style, self-contained)

```bash
node scripts/debug/so-runtime-check.mts      # plan 02: imports inline test story, sets quality, activates checkpoint, checks effects
node scripts/debug/so-extraction-check.mts   # plan 03: imports story, /send compact, runs deterministic extraction via debugResponse
node scripts/debug/so-turn-types-check.mts   # TurnBridge types: /sd image + new-group greetings + solo greeting reopen/swipe commit nothing, a real reply commits exactly one
node scripts/debug/so-responsive.mts --surface all   # 24 viewports (320x568 → 2560x1440): our panels' horizontal overflow + any control outside the viewport. NEEDS NO BACKEND
```

Both use the in-page debug handle `globalThis.storyOrchestratorRuntime` (`importStory(json)`, `runExtractionNow(response, cueId)`) — also usable directly from `browser_evaluate` or `evaluateInST` for ad-hoc runtime poking.

### ST source search

```bash
node scripts/debug/st-search.mts "<pattern>" [--files *.js,*.ts] [--root <path>]
node scripts/debug/st-search.mts --event-types | --endpoints [path] | --context-exports | --module-exports <file>
```

Default root: fixed-depth walk (5 up from project root → `C:\dev\SillyTavern-MainBranch`), verified working; `--root` overrides.

### Library helpers (`scripts/debug/lib/`)

`connection.mts` (`connectToST`, `DEBUG_DIR`), `st-ready.mts` (`ensureSTReady`), `evaluate.mts` (`evaluateInST` — safe page.evaluate with error classification), `output.mts` (`writeJSON`/`writeText`/`writeScreenshot`), `cli.mts`.

## Recipes

Standard snapshot:
```bash
node scripts/debug/st-navigation.mts recent-group
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts all
```

Checkpoint transition:
```bash
node scripts/debug/so-state.mts current
node scripts/debug/st-actions.mts checkpoint 2
node scripts/debug/so-state.mts current
node scripts/debug/so-ui.mts screenshot after-transition
```

Generation failure:
```bash
node scripts/debug/st-context.mts mainApi onlineStatus
node scripts/debug/st-actions.mts generation-state
node scripts/debug/st-chat.mts 5
```
Then MCP `browser_console_messages` + `browser_network_requests` for the exploratory tail.

## Errors

| Message | Fix |
|---|---|
| `Executable doesn't exist` | `npx playwright install chromium` |
| `ERR_CONNECTION_REFUSED` | SillyTavern not running |
| **`Unexpected token '<', "<!DOCTYPE "` from `executeSlashCommandsWithOptions`** | **The page's session is stale, not your slash command.** ST answers 200 on `/` while every `/api/*` call returns **403 + `text/html`** — its CSRF cookie is gone from the page's jar. Almost every script's first navigation (`/newchat`, `/go`) runs a slash command, so this surfaces as a confusing parse error in a helper you did not touch. Diagnose in one call, then reload (2026-09-21): swap `window.fetch` for a wrapper that records any response whose `content-type` is not JSON, call the command, restore. A single `location.reload()`, a ~12 s wait, and `/api/settings/get` returning 200 confirms the fix. The reload lands on the welcome screen with `groupId: null` — reopen your group before continuing. |
| MCP browser tools see a different page than the scripts (`about:blank`, marker round-trip fails) | The MCP server launched its own Chromium. Verify with the `globalThis.__x` marker round-trip above and fall back to scripts only; do not trust MCP state for anything. |
| `SillyTavern not loaded` | ST not ready yet — retry |
| `Settings panel not mounted` / `Drawer not mounted` | Extension not loaded / element not created |
| MCP browser tools connect but see different state than scripts (chat/group/runtime mismatch) | MCP launched its own Chromium (server missing `--cdp-endpoint`). Run `st-session start`, restart the Claude session so `.mcp.json` takes effect, verify with the `globalThis.__x` marker round-trip |
| MCP browser tools fail to connect | `st-session start` first — the cdp-endpoint config requires the shared browser to exist |
