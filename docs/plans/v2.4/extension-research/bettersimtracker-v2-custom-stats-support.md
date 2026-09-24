# BetterSimTracker v2 (custom stats support) — v2.4 review

meta: author DOGZERA (ghostd93) · repo https://github.com/ghostd93/BetterSimTracker · commit `fa1d9a1` 2026-05-24 (v2.5.4.9) · 36 upvotes / 903 msgs · source available: **y** (`source/`, ~52k lines TS, 90 node:test files). Paths below: theirs relative to `source/`, ours relative to the SO root.

## What it is
Relationship/state tracker. After each AI reply (and optionally each user message) a memory-LLM pass extracts per-character stats (affection/trust/desire/connection 0–100, mood, lastThought, up to 8 custom stats of kind numeric/enum/boolean/text/array/date_time), stores a snapshot **per message per swipe**, renders tracker cards inside the chat DOM, graphs history, and injects a "current relationship state" block at a configurable depth. Numeric updates are model-proposed deltas, clamped and scaled by self-reported confidence. Big, "vibe-coded" (author's words), but heavily unit-tested policy modules.

## How it works
- **Trigger**: `registerEvents` `src/index.ts:4792`. `GENERATION_STARTED` (`:4807`, ignores `quiet`/dry-run) records intent + snapshots the injection; `CHARACTER_MESSAGE_RENDERED` (`:4985`) marks "a new AI message rendered"; `GENERATION_ENDED` (`:4867`) schedules extraction **2000 ms later** (`:4955`). If GENERATION_ENDED fires before the render, `lateRenderRecovery.ts:1-80` polls at 700 ms for a new trackable AI message.
- **User-turn gate** (user tracking on): `USER_MESSAGE_RENDERED` (`:5026`) starts a gate; the in-flight chat generation is **stopped** via `context.stopGeneration()` (`:1455-1461`), the user message is extracted, then the captured generation intent is **replayed** via `context.generate` (`:1476-1520`, `userTurnReplayExecution.ts`). I.e. the reply path waits on extraction.
- **Mutations**: `MESSAGE_EDITED` (`:5145`) re-extracts that message if it already had tracker data (opt-out setting). Swipes (`:5196`, listens to `MESSAGE_SWIPED`, `MESSAGE_SWIPE_DELETED` plus two event names ST does not define) never re-extract; a new swipe gets extracted after its own `GENERATION_ENDED` (`SWIPE_GENERATION_ENDED`, `:4944`). `MESSAGE_DELETED`/`CHAT_DELETED` just refresh.
- **Persistence**: snapshot in `message.extra.bettersimtracker[<swipe_id>]` (`storage.ts:1459-1492`); read-back refuses to fall back to another swipe's payload (`storage.ts:829-847`). Also duplicated into `chat_metadata` (`storage.ts:1198-1211`), chat[0].extra (`:1219-1230`) and `localStorage` history per scope with LRU pruning (`:1007-1035`, `:1166`). Saves via `saveMetadataDebounced`/`saveChatDebounced` only (`persistence.ts:3-29`), no evidence.
- **LLM calls**: `generator.ts`. With a profile: `Generator.generateRequest` from `sillytavern-utils-lib` with `custom.signal` from an `AbortController` (`:293-350`); without: `context.ChatCompletionService.processRequest` / `TextCompletionService.processRequest` on the active API (`:357-460`). All controllers tracked in a set; Stop aborts all (`:92`, `:495-497`). Profile resolution: explicit → CM selected → **first discovered profile** (`settings.ts:459-473`).
- **Modes**: unified (one JSON prompt, all stats) or sequential (one prompt per stat, bounded concurrency). Strict-JSON repair retries; failure classifier `extractionFailurePolicy.ts:1-40` (empty output / network / 5xx / timeout = retryable). On failure with no prior snapshot: inline recovery card with reason + Retry; tracking stays on.
- **Stat math**: `extractorHelpers.ts:370-381` — `bounded = clamp(delta, ±maxDelta)`, `scale = (1-damp) + conf*damp`, `next = clamp(prev + round(bounded*scale), 0, 100)`; non-numeric kinds keep the previous value when confidence < stickiness. Custom stats with no prior value are seeded from defaults and not asked to the model.
- **Lore context**: caches `WORLD_INFO_ACTIVATED` payload into `chat_metadata` (`index.ts:5093`, `:505-513`); optional fallback runs its own **dry-run `checkWorldInfo`** (`index.ts:472-503`, called `:4190-4192`).
- **Injection**: `setExtensionPrompt(INJECT_KEY, prompt, IN_CHAT, depth, scan=Boolean(prompt), SYSTEM)` (`promptInjection.ts:755`) — injected block is **WI-scannable**. Owner-private stats filtered to the resolved speaker at prompt-sync time (no `GROUP_MEMBER_DRAFTED`). Custom lines trimmed first when block grows too big.
- **Macros**: `{{bst_injection}}`, `{{bst_stat_*}}`; `registerBstMacro` uses `context.macros.register(name,{handler,description})` when present, else legacy `registerMacro` (`runtimeMacros.ts:632-661`).
- **Other**: `/bst status|extract|clear|toggle|inject|debug` via `SlashCommandParser.addCommandObject` (`slashCommands.ts:105-246`); diagnostics dump incl. the injected prompt bound to the message it produced (`index.ts:375-400`); a JSON-protocol **shadow** run with parity report in debug mode (`jsonExtractionProtocolShadow.ts`, `jsonExtractionProtocolParity.ts:61`, surfaced `index.ts:4355`); coverage gate 85/85/75 in `package.json`.

## Overlap with Story Orchestrator
- **Extraction off-path → typed state**: same idea, we are stricter. Our shared read is closed-vocabulary + evidence span (`src/extraction/contract.ts:36-40`, `src/extraction/evidence.ts:28`), applied only at boundaries (`src/engine/applyQueue.ts:30`). They apply immediately per message and let the model self-score confidence. We write **absolute** values; they write clamped deltas.
- **Mutation handling**: we roll back cross-store on swipe/edit/delete (`src/runtime/turnBridge.ts:55-58`, `src/runtime/rollback.ts:35`); they keep per-swipe snapshots and re-extract on edit. Theirs restores a swiped-back variant instantly; ours re-reads at the next boundary.
- **Private per-character state**: our epistemic per-member swap on `GROUP_MEMBER_DRAFTED` (`src/runtime/index.ts:188`) is more precise than their speaker-resolution at sync time.
- **Macros**: our `registerHostMacro` (`src/services/stHost/context.ts:50`) goes through `MacrosParser.registerMacro`, which bridges into the new engine (ST `macros.js:205`) — dual-engine. Theirs is new-engine-only whenever `context.macros` exists.
- **Failure UX**: they are better. Our scheduler retries 3× within ~750 ms unclassified (`src/extraction/scheduler.ts:213-224`) then `pauseExtraction` flips the **install-wide** `extraction.enabled=false` (`src/runtime/runtimeManager.ts:430-437`); player sees "error"/"not-configured" (`src/runtime/pipeline.ts:59-64`), no retry control.
- **Cancel**: they abort in-flight memory calls; our `sendConnectionProfileRequest` passes no `signal` (`src/services/stHost/connectionProfiles.ts:43-55`) — RunToken discards stale results but the GPU still finishes the request.
- **In-chat cards / graphs / mood sprites**: deliberately out of scope for us (baseline §4: no message DOM, no stat UI).

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Failed read ≠ disabled: classify, back off, player "Try again" | enhancement | extraction / player-ui | partial | 4 | M |
| 2 | AbortSignal on memory-LLM calls, tied to RunToken + author Stop | enhancement | extraction / host | absent | 3 | S |
| 3 | Bounded step (`max_step`, `min`/`max`) for extractor int/float qualities | enhancement | engine | absent | 3 | S |
| 4 | Opt-in WI-scannable injection (scene block) | host-integration | stagecraft / memory | absent | 2 | S |
| 5 | Bind payload capture to the message it produced | enhancement | player-ui (author) / testing | partial | 2 | S |
| 6 | Author-view quality + tension timeline from boundary snapshots | ux | player-ui (author) / pacing | absent | 2 | M |
| 7 | Inline "Improve rubric" in QualityEditor → `updateQuality` proposal | ux | studio / wizard | absent | 2 | S |
| 8 | Shadow-arm extraction on live play (record parity, never apply) | testing | extraction / judge | absent | 2 | M |
| 9 | Swipe-back restore keyed by content hash, not swipe index | enhancement | engine / host | partial | 2 | L |
| 10 | Force lore from the generate interceptor (narrow window vs foreign dry-run scans) | host-integration | stagecraft (lore) | partial | 2 | S |
| 11 | Do NOT stop-and-replay the reply to extract the user turn | anti-pattern | talk / extraction | absent | 2 | S |

**1. Failed read ≠ disabled.** Theirs: `extractionFailurePolicy.ts:13-15` splits retryable (network/5xx/timeout/empty) from config errors; failure leaves tracking on and shows an inline Retry (README "Inline recovery card"). Ours: 3 unclassified attempts in ~750 ms then `setGlobalSettings({extraction:{enabled:false}})` (`src/runtime/runtimeManager.ts:431`) — one RunPod 502 or a 3-min model reload stops extraction in every chat until someone re-enables it (memory note "failed read pauses extraction install-wide"). Proposal: classify in `scheduler.ts`; transient → keep enabled, exponential backoff over minutes, window stays pending, pipeline `stalled-rechecking` + a player-safe "Try again" (re-runs the same read; not steering); config/profile errors → `not-configured`. Fit: fixes an invariant-13 smell (runtime writing an install-wide user setting); RunToken epoch guard already exists (`scheduler.ts:174-181`). No conflict.

**2. AbortSignal.** Theirs `generator.ts:303-313`, `:495`. ST `ConnectionManagerRequestService.sendRequest` destructures `signal` from `custom` (ST `extensions/shared.js:423-424`). Ours passes none (`connectionProfiles.ts:44-50`); `extraction/client.ts:11-18` has no option. Add `signal` to `ExtractionClientOptions`, abort on RunToken loss (chat switch, rollback past the window) and from an author-view Stop. On a 33 tok/s pod a stale read occupies the lane for tens of seconds. Fits invariants 2/10 (stHost change + `WriteResult` not needed for reads).

**3. Bounded step.** Theirs `extractorHelpers.ts:370-381` + per-stat `maxDelta` override. Ours: `Quality` has no range/step (`src/engine/schema.ts:53-65`); blackboard only enforces `monotonic` (`src/engine/blackboard.ts:62`). An extractor can move `trust` 10→90 in one read and fire a gate. Add optional `min/max/max_step` on int/float, clamp (or reject with audit reason) in the pure apply path; Studio QualityEditor fields + a diagnostic. Skip their confidence scaling — our evidence rule is the stronger guard and the model's self-confidence is uncalibrated. Pure engine; schema change needs `validate.ts` + `storyDiff.ts` rows.

**4. WI-scannable injection.** Theirs passes `scan=Boolean(prompt)` (`promptInjection.ts:755`); ST adds scan-flagged extension prompts to the WI buffer (`world-info.js:4715-4722`, `setExtensionPrompt(..., scan=false, ...)` `script.js:8926`). Ours always `false` (`src/services/stHost/extensionPrompts.ts:38`). Opt-in per registry key (story field, default off), e.g. scene tracker's `location:` line so location-keyed lore fires from tracked state, not only chat text. Caveat: sticky/cooldown and our gated sets; must not scan epistemic/private blocks (invariant 15).

**5. Capture ↔ message.** Theirs snapshots at `GENERATION_STARTED` and binds on render to the new AI index (`index.ts:375-400`, `:4999`). Ours `PayloadCapture {at, boundary, reason, blocks}` (`src/runtime/types.ts:18-23`), in-memory ring of 5. Add `messageId` on render → author can ask "what did the model see for message N", and the journal can cite it. Small, author-only.

**6. Timeline.** Theirs: graph modal with raw/smoothed series (`graphModal.ts`, `graphSeries.ts`). Ours: no chart anywhere in `components/` (grep `svg|sparkline|chart` → only Mermaid export). Boundary snapshots (horizon 200, `src/engine/engine.ts:70`) already hold the data; plot selected qualities + tension EMA vs `expectedTension` (`src/pacing/shapes.ts:33`) to calibrate pacing. Author-only (invariant 9); snapshot-fed (invariant 18).

**7. Rubric assist.** Theirs: "Improve description with AI" / "Generate with AI" per stat in the wizard. Ours: copilot works per stage; no per-field assist in `src/studio/components/QualityEditor.tsx`. The op already exists (`updateQuality`, `src/studio/mutations.ts:32`). A narrow prompt returns one reviewed proposal. Could be scored against `so-live-suite` since rubric wording drives extraction accuracy (facts tier 0.7273).

**8. Shadow arm.** Theirs: debug-only second protocol on the same input, parity mismatches recorded (`jsonExtractionProtocolShadow.ts`, `…Parity.ts:61`, `index.ts:4355`). Ours: arms compared only offline on fixtures (plan-10 lore spike). An author-only, default-off shadow (e.g. judge `typedExtraction` vs shared read) recording disagreement into a ring would give real-play numbers for seeds §C. Off-path, never applied (invariants 5, 7). Parity ≠ accuracy — label it so.

**9. Swipe-back restore.** ST emits only `MESSAGE_SWIPED` when navigating to an existing swipe (no render; `script.js:10315`, render only via `Generate('swipe')`). We roll back and nothing re-commits until the next reply, so the HUD/story reads as rolled back meanwhile. Theirs restores per-swipe snapshot instantly — but keyed by swipe **index**, which breaks on `MESSAGE_SWIPE_DELETED` (indices shift, `script.js:9367-9388`; they never reindex). If done: cache the accepted delta set by `(messageId, hash(mes))`, re-apply as a recorded boundary. Must hold rollback ≡ replay (invariant 11) and one-transition-per-boundary (3). Low value vs cost.

**10. Lore force point.** Their optional fallback calls `checkWorldInfo(chat, max, true)` (`index.ts:488`); every scan, dry run included, ends with `resetExternalEffects()` (`world-info.js:418`, `:5275`), wiping `WORLDINFO_FORCE_ACTIVATE` picks. We force at `GENERATION_STARTED`/`MESSAGE_SENT` (`src/runtime/index.ts:153-159`); ST runs interceptors at `script.js:4564`, WI scan at `:4635`. Forcing from our manifest interceptor narrows the window where a co-installed extension's dry scan can silently drop our lore. Verify group ordering first; keep `forced()` WriteResult check.

**11. Anti-pattern: stop-and-replay.** `index.ts:1455-1520` stops the live generation to extract the user message, then replays via `context.generate`. Violates invariant 5 (reply path waits on off-path compute) and, co-installed, fires our `GENERATION_STARTED`/`STOPPED` handlers twice per turn (talk decisions, payload capture, lore force). Record as a compat note in our troubleshooting; never adopt.

## Patterns to copy / anti-patterns to avoid
Copy:
- Failure classifier as a pure policy module with its own tests (`extractionFailurePolicy.ts`) — feeds idea 1.
- "Never fall back to another variant's data" (`storage.ts:838-846`): read-back returns null rather than a neighbour swipe's payload.
- Diagnostics that record *which prompt produced which message* and settings provenance (post changelog 1.0.4).
- Soft-remove of a tracked stat: stops future reads, history kept (README "Remove uses soft-remove").
Avoid:
- Swipe-index-keyed per-message state without reindexing on `MESSAGE_SWIPE_DELETED`; subscribing to event names ST never defines (`SWIPE_CHANGED`, `MESSAGE_SWIPE_CHANGED`, `index.ts:5196`).
- Implicit "first discovered profile" fallback (`settings.ts:466-470`) — our J1 gotcha: a dead first profile looks like "scheduler never fired".
- New-engine-only macro registration (`runtimeMacros.ts:638-649`) — invisible to the legacy engine when `experimental_macro_engine` is off; `MacrosParser.registerMacro` bridges both.
- Four copies of the same state (message.extra, chat[0].extra, chat_metadata, localStorage) with debounced saves and no read-back — drift with no evidence.
- Stop-and-replay of the user's generation (idea 11); 2 s fixed post-generation delay as a timing assumption.

## ST host facts learned
- `setExtensionPrompt(key, value, position, depth, scan=false, role, filter)` (`script.js:8926`); scan-flagged prompts join the WI scan buffer (`world-info.js:4715-4722`). Their use: `promptInjection.ts:755`.
- `checkWorldInfo(chat, maxContext, isDryRun)` is exported (`world-info.js:4709`) and callable by extensions (theirs `index.ts:488`); dry run does not emit `WORLD_INFO_ACTIVATED` (`world-info.js:900-903`) but **does** reset external activations (`:5275`) — consistent with our comment at `src/services/stHost/worldInfoActivate.ts:16-17`; new consequence: a foreign extension's dry scan can drop our forced lore.
- `WORLD_INFO_ACTIVATED` payload = array of activated entry objects (`world-info.js:901-902`; theirs `index.ts:5093`).
- `ConnectionManagerRequestService.sendRequest(..., custom)` honours `custom.signal` (`extensions/shared.js:423-424`); theirs via utils-lib `Generator` (`generator.ts:303-313`).
- `context.ChatCompletionService` / `TextCompletionService` (`st-context.js:292-293`) allow profile-less requests on the active API (`generator.ts:385`, `:405`).
- `context.stopGeneration`, `context.generate` exposed (`st-context.js:143`, `:146`; theirs `index.ts:1461`).
- `context.macros.register(name, {handler, description})` (`st-context.js:245`, `macros/macro-system.js:58`); `context.registerMacro` is deprecated (`st-context.js:179`) but `MacrosParser.registerMacro` also registers in the new engine (`macros.js:205`). Agrees with our gotcha (dual-engine via MacrosParser).
- Navigating to an existing swipe emits `MESSAGE_SWIPED` with no render event (`script.js:10315`); `MESSAGE_SWIPE_DELETED` carries `{messageId, swipeId, newSwipeId}` and shifts later indices (`script.js:9367-9388`).
- `GENERATION_STARTED(type, options, dryRun)` (`script.js:4299`; theirs `index.ts:4807`).
No contradictions with our gotchas found.

## Verdict
Relevance **medium**. Different product (relationship meter + in-chat cards), but it runs the same off-path extraction loop we do and got the failure path more right than we did. The one thing worth taking: **idea 1** — classify memory-LLM failures and keep extraction enabled with backoff + a player-safe "Try again", instead of flipping the install-wide `extraction.enabled` off after ~750 ms of retries. Cheap follow-ons: idea 2 (abort signal) and idea 3 (bounded numeric step).
