# Plan 07 — Author tools

**Status: DRAFT 2026-09-25 — awaits user approval.** Depends on **V1** only (overview: "07 is independent"). Per item:
A1 waits on the author session (U4) and a user decision on the message-DOM baseline; A4 needs a Chat Completion profile
on a lane; A5 reads plan 13's call record (H4) and degrades honestly without it. Verified against master `e7626d7`
and ST 1.19.0 at `7c3994196`. **Re-verify every path:line before building** (v2.4 rule 1). Everything here is **author
view only** (inv 9: player mode unchanged, rule 7 not triggered), **snapshot-fed** (inv 18), host access only through
`stHost/*` (inv 2), and nothing new is persisted to `chat_metadata`.

## Source rows

| Row | Where | Item |
|---|---|---|
| Per-message inspector (`.extraMesButtons`, D12) | overview §07; `v2.4/00-overview.md:400` (D12); seeds §F row "D12 …" | A1 |
| `{{story_quality::<key>}}` (X24) | overview §07; `v2.4/08-author-observability.md:46-47,420`; host facts 08-H10/H11 (`v2.4/host-facts.md:213-214`) | A2 |
| Studio gate replay over recorded blackboard history, no LLM | overview §07; SUMMARY `:273` (jeved idea 10, 3/M) | A3 |
| CC `promptManager` bucket breakdown | overview §07; `v2.4/08-author-observability.md:40-41` | A4 |
| "Which route answered this call" | this brief; plan 13 H4 ("plan 07's 'which route answered' column reads it", `13-harness-routing.md` §H4) | A5 |

## Goal

The author can answer four questions without a debugger: what did SO do around **this** message (A1); what is quality
*k* right now, from any prompt text (A2); would my edited gate have fired, and when, in the chat I just played (A3);
on Chat Completion, where do the prompt's tokens go (A4). And for every non-narrative call: which model answered it
(A5).

## Scope / out of scope

**In:** A1–A5 as designed below, each behind its own evidence gate.

**Out:** any player-facing surface (rule 7); message-text rewriting (baseline: "SO never rewrites message DOM",
`v2.4/extension-research/_baseline.md:206`); context-horizon scoring and auto-tuned budgets (overview §Out of scope);
per-pass preset override (plan 06 of v2.4's CC contract decision); recording routes (plan 13 H4 owns the record, this
plan only renders it); the parametric macro on the legacy engine (impossible, 08-H10).

## Verified current state

**A1 — navigation that exists**

| Claim | Seen |
|---|---|
| Author citations jump with `/chat-jump N`, fingerprint-checked, drawer closes on narrow viewports | `src/runtime/messageJump.ts`, `src/services/stHost/chatJump.ts`, `src/components/drawer/MessageCitation.tsx`; `src/index.tsx:564` |
| `/chat-jump` answers `''` on success and failure; the adapter answers from its precheck | 08-H2 (`v2.4/host-facts.md:205`) |
| ST's message actions live in the message template; built-ins are template markup with a delegated handler | `public/index.html:7413-7415` (`.extraMesButtons`, `mes_translate`); `scripts/extensions/translate/index.js:753` |
| ST has no API that adds a message button; the context exposes none | `public/scripts/st-context.js` (no such member) |
| Our CSS is scoped to five mount roots; an element in ST's message DOM gets none of it | `.claude/rules/gotchas.md` "All our CSS is scoped to the mount roots"; `src/styles.css` |
| Every per-message source already exists: audits (window), deltas (evidence), memory provenance (`messageId`), talk decisions (`messageId`), judge calls (`messageId`), payload captures | `extraction/types.ts:95-113`; `runtime/types.ts:52-61`; `judge/types.ts:80-96`; `runtime/journal.ts:141-172` |

**A2 — macros**

| Claim | Seen |
|---|---|
| **ST source default: `experimental_macro_engine: true`** (1.19.0, `7c3994196`) | `public/scripts/power-user.js:302` |
| This install: ON (measured 2026-09-20 and 2026-09-23); the engine is fixed at startup | gotchas "Macros"; `v2.4/08-author-observability.md:101` |
| We read it and report it as a capability fact | `src/services/stHost/version.ts:36-40`; `stHost/capabilities.ts:92-104` |
| Our seam registers through `MacrosParser` only | `src/services/stHost/context.ts:13,50-56` |
| The context marks `registerMacro`/`unregisterMacro` **deprecated** in favour of `macros.register` / `macros.registry.unregisterMacro` | `public/scripts/st-context.js:179-182`; `macros/macro-system.js:44-60`; context exposes `macros` `st-context.js:245` |
| The new engine takes positional args: `unnamedArgs` (number or definitions), `strictArgs` default `true` | `macros/engine/MacroRegistry.js:66-68,198,425-439,598` |
| The bridge (`MacrosParser`) registers 0-arg macros; legacy substitution is an exact `{{key}}` regex, so `{{story_quality::k}}` stays literal there | 08-H10 (`v2.4/host-facts.md:213`) |
| Per-key form shipped: `{{story_quality_<key>}}`, synced per story, `(unset)`, invalid keys journaled | `src/runtime/qualityMacros.ts:6-48`; live `test/scenarios/live-v24-08-quality-macro.json` green ×2 (`v2.4/08-author-observability.md` §Live gates) |

**A3 — recorded history**

| Claim | Seen |
|---|---|
| Each boundary log entry holds `before`/`after` `EngineState` (blackboard, active checkpoint, message ids) and the `fired` transition | `src/engine/engine.ts:16-27,39-48` |
| The in-memory log keeps the last **200** boundaries | `engine.ts:252,297` |
| Persisted history: `{from, base, log}` | `engine.ts:58-62`, serialize `:153`, hydrate `:140,159`; getter `stateLog` `:356` |
| `evaluateGate` is pure and reads only `blackboard.get(q)` | `src/engine/gates.ts:4-22` |
| The Studio edits this chat's pinned copy when opened from the drawer | `runtimeManager.ts:370` (`getPlayedStoryRaw`); `src/index.tsx:67` |
| The gate editor | `studio/components/TransitionEditor.tsx:94` (`GateBuilder`) |
| The Studio is its own React root; the manager hands `stateLog` to the journal and snapshot only | `runtimeManager.ts:215,511`; `studio/StudioModal.tsx:55,61` |

**A4 — Chat Completion prompt buckets**

| Claim | Seen |
|---|---|
| `promptManager` is a module export of `openai.js`, not on the context | `public/scripts/openai.js:535` |
| After each CC assembly: `setChatCompletion` → `populateTokenCounts` fills `tokenHandler.counts` per prompt **identifier** and sets `tokenUsage` | `openai.js:1606`; `PromptManager.js:1569-1591`; `TokenHandler.getCounts` `openai.js:3438` |
| An extension prompt at `BEFORE_PROMPT`/`IN_PROMPT` becomes its own identifier (`key.replace(/\W/g,'_')`); ST's known keys map to `summary`, `authorsNote`, `vectorsMemory` … | `openai.js:1389-1465` |
| An `IN_CHAT` (depth) extension prompt is spliced into the `chatHistory` collection, so it has no bucket of its own | `openai.js:819-856,886-890` |
| T19a already counts our own blocks with the main tokenizer; M = max context − response (08-H3) | `runtime/promptCost.ts`; `stHost/contextBudget.ts` |
| This install's main API is textgen; no CC profile persists. v2.4 created one on lane 1, and it needs `chat_template_kwargs: {enable_thinking: false}` on llama-server | `v2.4/06-steering-stagecraft.md:378`; gotchas "llama-server's `/v1/chat/completions` …" |

**A5 — what records "who answered"**

| Claim | Seen |
|---|---|
| Judge calls record the answering `model` per call; the journal shows it | `judge/types.ts:80-96`; `runtime/journal.ts:162-172` |
| LLM passes record **no** route: no audit carries a profile id | `SharedReadAudit` `extraction/types.ts:95-113`; `CuratorPassAudit` `stagecraft/types.ts:124-132`; `TalkDecisionAudit` `runtime/types.ts:52-61`; `CopilotAudit` `copilot/types.ts:68-73` |
| The client knows the answering profile, and tells only the breaker | `extraction/client.ts:39-47,90` → `runtime/index.ts:65` |
| `snapshot.roleRoutes` is the **configured** route + health per role, not the answering one (a fallback is invisible there) | `runtime/roleHealth.ts:25-38` |
| Plan 13 adds `extras.modelCalls` (cap 300: role, `routeKey`, kind incl. `fallback`, ms, tokens) and journal `model-call` events | `13-harness-routing.md` §H4 |

**Δ drift:** overview §07 cites D12 at `v2.4/00-overview.md:398`; it is `:400` (`:398` is D10). The overview's "verify
the ST default first" is now answered: the source default is `true` (above), so the `::` form works on a default ST
install and is inert only where the user turned the new engine off.

## Design

### A1 — Per-message inspector (decision-gated)

**Gate before any code (predeclared).** The v2.5 Author session (plan 10 §Human sessions) carries one rubric row, worded
there exactly: "Starting from a message in the chat, I could find why it looks like this (pass/fail + notes; also record
whether the author asked for per-message entry)". Until that row exists in plan 10, A1 is recorded "not built: gate row
absent". Build only if that row fails **or** the author asks for per-message entry in
the session notes. Otherwise record "not needed: `/chat-jump` from the drawer suffices" and stop. No session → not
built in v2.5 (overview: the inspector decision waits on the sessions).

**If built:**

| Part | Design |
|---|---|
| Baseline change (user decision) | SO **adds** one button to ST's message actions; it still never reads or writes `mes_text`. Recorded as a baseline amendment |
| Host seam `stHost/messageActions.ts` | insert `<div class="mes_button so-inspect fa-solid fa-route" title="Story Orchestrator: inspect">` into `#message_template .extraMesButtons` once, plus one delegated `click` on `document`; returns `WriteResult`, capability-probed (`messageActions: present|absent`). Host facts owed (1.19.0 and the declared minimum): whether rendered messages clone the template (so already-rendered ones need a one-time pass on `CHAT_CHANGED`), and whether another extension's template edit can drop ours |
| Visibility | hidden unless author view: a class on `body` toggled from `extras.ui.authorView`, one rule in a small unscoped stylesheet (our Tailwind is root-scoped). `so-ui assert-player-clean` adds `.so-inspect` to its selector sweep |
| Read-model `runtime/messageInspector.ts` (pure) | `inspect(messageId, snapshot)` → sections: boundary that consumed it, audits whose window covers it (reason, accepted/rejected lines), deltas citing it, memory rows with `provenance.messageId`, talk decision, judge calls, model calls (A5), effect-ledger rows, the payload capture when it is a reply. Computed on click from the snapshot, never a manager getter in render |
| UI | the drawer opens on an author "Message N" panel (`#so-inspector`, `[data-so="inspector-section"]`); every row keeps its `/chat-jump` citation |

### A2 — `{{story_quality::<key>}}` on the new engine

| Part | Design |
|---|---|
| Seam | new `stHost/macroEngine.ts`: `registerArgMacro(name, {unnamedArgs, handler, description})` over `getContext().macros.register` (the non-deprecated API), and its unregister. `registerArgMacro` always registers: `macros.register` is a static binding on every engine (`macro-system.js:57`, `st-context.js:245`). The macro is inert while substitution uses the legacy path (`script.js:2837`/`2997` choose the engine per call). Capability `macroArgs` = `macros.register` present; a separate readout reports which engine substitution uses right now (`macroEngineInUse()`) |
| Macro | one macro `story_quality`, `unnamedArgs: [{name: "key"}]`, `strictArgs: true`. Handler: the blackboard value, `(unset)`, or `(no quality "k")` for a key the story does not declare. A pure read, like `qualityMacros.ts` (never drains, never computes; a ledger-bound quality reads through the blackboard; epistemic content has no quality) |
| Coexistence | the per-key `{{story_quality_<key>}}` stays: it is the only form that works on the legacy engine. Distinct names, so no collision with the bridge-registered ones (08-H11) |
| Legacy engine | registered but inert. The settings capability row and the Studio quality help text say "`{{story_quality::key}}` needs SillyTavern's new macro engine; `{{story_quality_key}}` works everywhere". No reload is needed for this macro; the reload gotcha still applies to the bridge-registered `{{story_quality_<key>}}` (`macros.js:81-84`) |
| Host facts owed | register with `unnamedArgs` on 1.19.0 and the declared minimum (V10 Q4); what `strictArgs` does with 0 or 2 args (error text or literal?); verify the static `macros.register` binding on the declared minimum too. Answered: `macros.register` exists on every engine (`macro-system.js:57`, `st-context.js:245`) |
| Seam migration | only the new macro uses `macros.register`. Moving every existing macro off the deprecated `MacrosParser` bridge is plan 03/12's call (one seam body, gotchas "Host types are vendored"), not this plan's |

### A3 — Studio gate replay (no LLM, no writes)

| Part | Design |
|---|---|
| Pure core `studio/gateReplay.ts` | `replayGate(gate, fromCheckpointId, history) → {rows: [{boundary, messageId, atSource, holds: true \| false \| "unknown"}], firstHold, recordedFire, divergesAt}`. `holds` evaluates the **draft** gate with `evaluateGate` over each entry's `evaluated` blackboard (a narrow `{get}` view; the gate reads nothing else). `evaluated` is a new `BoundaryLogEntry` field that `commitBoundary` serializes immediately before `selectFiring`, after the drain and `refreshMechanicalQualities` (`engine.ts:229-233`). It is not reconstructed from `after` by subtracting `fired.effects.progress`: `applyDelta` can clamp, and an unset key becomes base 0 (`convergence.ts:35-37`), so the subtraction is not invertible. No compat work: log entries without `evaluated` do not exist in shipped data (never released), and fixtures are re-recorded. Entries with `source: "manual"` (`engine.ts:295`) are skipped: shown as "manual activation, no gate evaluated" rows, and a manual entry ends the counterfactual (sets `divergesAt` if the draft would have held earlier). `atSource` = the entry's `before.activeCheckpointId` is the transition's source. `unknown` only when a leaf names a quality the pinned story at that boundary does not declare (new in the draft). A declared quality with no recorded value is evaluated exactly as `evaluateGate` does (`gates.ts:5`: unset leaf = false, so `not` over it = true); that is what keeps the unchanged-gate 100 % check reachable |
| Semantics it states, not hides | (0) gate evaluation happens after the drain and the mechanical refresh, and before the fired transition's progress effect; (1) values were recorded **after** writes, so edits to a quality's definition (enum, latching, monotonic, bounds) are not replayed; (2) the counterfactual is valid only up to `divergesAt`, the first boundary where the draft would have fired differently from the recording (after it the path would have changed); (3) one transition per boundary, priority order (`engine/validate.ts:742`: priority descending, then declaration order) is applied among the source's outgoing edges; (4) only the retained window (≤ 200 boundaries, from `history.from`) |
| Source | only the chat's own history, and only when the Studio edits this chat's pinned copy (opened from the drawer). Opened from the settings panel on a library record → "Open the Studio from a chat to replay its history" |
| Wiring | `StudioModal` gains an injected `getReplayHistory(): {storyId, base, log} \| null` (manager → index.tsx), so the Studio still imports no runtime (the `components` ↔ `studio` boundary in `architecture.test.ts` holds) |
| UI | under the `GateBuilder` in `TransitionEditor`: `[data-so="gate-replay"]` — "Would first hold at boundary N (message M) · recorded: fired at K" or "never held in the last N boundaries"; each boundary row carries a `/chat-jump` citation |
| Correctness check (predeclared) | over the engine histories of J3 and J7 ×2 run on a dev candidate within this plan (records under `test/journeys/records/v2.5-plan07/`, each carrying `engine-history-<check>.json` from plan 10's harness item H-k: `dumpPersistedRuntime()` of the sandbox chat before cleanup), before the UI lands: replaying every **unchanged** gate reproduces each recorded `fired` boundary, **100 %**. The run must include at least one fired transition that carries `effects.progress`. Any miss means the replay semantics is wrong and blocks the UI. Plan 10's J3/J7 re-check it on the frozen candidate as a regression row |

### A4 — CC prompt-bucket breakdown

| Step | Design | Pass |
|---|---|---|
| Phase 0 (lane, CC profile per the v2.4 plan 06 recipe) | after a loud CC generation, read `promptManager.tokenHandler.getCounts()` and `tokenUsage`; list identifiers; locate our blocks (`story_*` at IN_PROMPT → own identifier; IN_CHAT → inside `chatHistory`); compare Σ counts with `tokenUsage` | host-fact rows recorded for 1.19.0 and the declared minimum; identifiers stable across two generations |
| Seam `stHost/promptBuckets.ts` | `importSTModule("/scripts/openai.js")`, read-only, capability `ccPromptBuckets: present \| absent` (absent on textgen or when `promptManager` is null) | typed result, no blind cast |
| Read-model | refresh on `GENERATE_AFTER_DATA` (never awaited on the reply path, inv 5), in memory only | — |
| UI | the next-turn preview header on CC: "Prompt: main N · world info N · chat history N (of which Story Orchestrator N, T19a) · other extensions N · of M". SO writes IN_CHAT only (`extensionPrompts.ts:5`), so no own identifier is expected; our share comes from T19a's per-block counts; the bucket view never re-attributes `chatHistory` | Σ of ST identifiers = `tokenUsage` exactly; SO's T19a sub-count ≤ chatHistory count (reported, not summed). Optional cross-check: the chatHistory delta with SO's blocks cleared, measured once on a dry-run CC assembly, recorded as a host fact, not a pass floor |

### A5 — "Which route answered" column

| With plan 13 H4 built | Without it |
|---|---|
| A **Calls** list in the author Scheduler tab (`[data-so="model-calls"]`, last 20), one table over `extras.modelCalls` and `extras.judge.calls`: at · role/use · route (`profile:<name>`, `harness:claude:sonnet`, `judge:typesafe:jev-1.13.0`) · result (`ok`, failure kind, **`fallback`** named) · ms · tokens · `/chat-jump` | judge rows only (they carry `model`); LLM rows read **"route not recorded"**. Never inferred from settings: a failure fallback would be misattributed to the configured route |
| The session journal export (`so-journal export`) gains a `route` column on `model-call` and `judge` events | `judge` events only |
| Per-audit badges (shared-read audit, curator proposal, talk decision): the reply's `callId` (plan 13 H4, `13-harness-routing.md:206`) is written into each audit record by the coordinator that creates it. This is a plan 07 change, because H4 leaves coordinators untouched (`13:209`) | none |

Snapshot slice `modelCalls` (inv 18); the Scheduler tab reads it. Profile names are resolved at render from the
Connection Manager list; a deleted profile shows its id.

## Order of work

1. A2 host facts, then the seam and macro (smallest, independent).
2. A3 core + correctness check against archived histories, then the UI.
3. A5 against plan 13's record (or its "not recorded" form if 13 has not landed).
4. A4 Phase 0 on a CC lane, then the seam and header.
5. A1 only after the author session and the baseline decision.

## Tests

- **Jest, red first:** `replayGate` (unchanged gate reproduces a recorded fire; `unknown` on an undeclared quality, a
  declared-but-unset leaf evaluated as the engine does; a draft gate reading `progress_toward_<anchor>` on a boundary whose
  fired transition carries `effects.progress` reports the pre-effect value; a manual entry yields no `holds`;
  `divergesAt`; priority among a source's edges; out-of-window); the `story_quality` handler (value, `(unset)`, unknown
  key, never mutates the blackboard); capability false on legacy → nothing registered; `messageInspector` sections per
  source; bucket parse (identifiers, `chatHistory` note, Σ check); the Calls list never renders a route for a record
  that has none.
- **Mutants** (`npm run mutate`): evaluate on `before` or on raw `after.blackboard` instead of `evaluated`; drop `atSource`; register on the legacy
  engine; infer an LLM route from `roleRoutes`; count a depth block as its own bucket. Each fails a case.
- **Storybook** (interaction + a11y): `TransitionEditor` GateReplay (holds / never / unknown / no history), Scheduler
  Calls (with and without routes, a fallback row), NextTurnPanel CC buckets, the inspector panel; player-mode stories
  show none of them.
- **Harness:** `so-ui.mts gate-replay | model-calls | inspect <messageId>` verbs + scenario schema; `assert-player-clean`
  sweeps `.so-inspect`, `#so-inspector`, `[data-so="gate-replay"]`, `[data-so="model-calls"]`.
- **Machine gates:** `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build &&
  npm run test:release && npm run test:debug && npm run debug:typecheck && npm run test-storybook:ci`;
  `node scripts/debug/st-session.mts reload` after every build.

## Live gates (real LLM, ×2 consecutive, one bundle per record, archived under `test/journeys/records/v2.5-plan07/`)

| Gate | Check |
|---|---|
| A2 | an AN carrying `{{story_quality::location}}` and `{{story_quality_location}}` reaches the real request with the same value at send time, after a `/cp set` lands at a boundary; on a lane with the new engine **off** (reload), the capability reads absent, the `::` text stays literal, the per-key form still resolves |
| A3 | play J3 on a lane, open the Studio from the drawer, edit a gate threshold: the panel's first-hold boundary equals the one computed offline by `replayGate` over the exported history; the unchanged gate shows the recorded fire |
| A4 | CC profile created on a lane, two loud generations: Σ ST identifier counts = `tokenUsage`; the SO sub-count is shown inside chat history and never added to Σ; profile removed and install values read back; run-header diff 0 |
| A5 | with plan 13: a J3 turn with `synthesis` routed to a harness and `read` on a profile: the Calls list and the journal name each route; a forced harness failure with an author fallback shows `fallback`. Without 13: judge rows named, LLM rows "not recorded" |
| A1 (if built) | click `.so-inspect` on a reply that took a delta: the panel lists the audit, the delta and the talk decision for that message; player mode: no button (hit-test `missing`) |

Run-header capture/diff around each batch; `host.macroEngine` must differ only in the A2 legacy leg (declared).

## Risks

- **A1 touches ST's message template**, the one place SO has never written. Another extension that rebuilds the template
  can drop the button silently; the capability probe and a re-insert on `CHAT_CHANGED` are the mitigation, and the
  baseline amendment is the user's call.
- **A3 can mislead** if its limits are not on screen: a quality-definition edit looks replayable and is not. The panel
  states the limit whenever the draft's qualities differ from the pinned copy.
- **A2 on a deprecated seam boundary**: ST may remove `MacrosParser` before our other macros move; A2 uses the new API
  from day one so it is not part of that risk.
- **A4's bucket names are ST internals** (`openai.js`), not a stable API; the capability reads absent rather than
  guessing when the shape changes.
- **A5 without plan 13** shows half a table. That is the honest state: today nothing records which profile answered.

## Unresolved questions

- A1: may SO add a button to ST's message actions (a baseline amendment), if the author session asks for it?
- A5: which audit types store the reply's `callId`? The talk decision is not in H4's list (`13:206`). Stamping it
  touches coordinators that H4 declares untouched: is plan 07 the owner?
- A3: replay only the chat's own retained window (≤ 200 boundaries), or also offer replay over an archived journey
  record file for authors testing a story offline?
- A2: when a key is unknown, return `(no quality "k")` (visible to the model) or an empty string?
