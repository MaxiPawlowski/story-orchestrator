# Plan 03 — Off-path call hygiene

**Status: NOT STARTED (doc written 2026-09-23). Depends on 01** (carry-in corrects the three
"`sendRequest` takes no signal" comments and the v2.3 plan-03 statement; this plan then makes the
corrected claim true in code). Runs in parallel with 02 and 05 after 01. Plan 04 waits on it (shared
window path); plan 08's T18 routing sits on the seam this plan types. **Also depends on v2.3's V25
cadence window landing** (`scheduler.ts:54-68`, uncommitted today; X16): the breaker's held P1 queue
is bounded by its `CADENCE_WINDOW_MAX`.

Source rows: overview §Plan sequence row 03, §03 outline, **§Reconciliation X9, X16, X17, X20**,
Rules 1–2/7/8, **D4**. Research: SUMMARY
T4, T5, T9 (+ their *Verified* notes), theme 3 small items. Seeds: v2.3 `v2.4-seeds.md` §D
"expansion `generating` wedge" + "nothing bounds the request size". `privacy-report.md` §4.

## Goal

Every memory-model call we make is **cancellable, time-bounded, size-bounded, classified on
failure, and truthful about truncation** — and no failure of one ever switches extraction off for
the whole install. Concretely:

1. A rollback or chat switch cancels the host request in flight (not just refuses its result).
2. A dead backend degrades to an in-memory breaker that resumes by itself; the runtime **never
   writes `extraction.enabled`** (D4).
3. No request can exceed the extraction profile's context; `memorize:full` is bounded.
4. The two known wedges (memorize backlog, expansion `generating`) clear themselves.

## Scope / out of scope

In: T4 (abort + timeout, backlog Stop, expansion wedge), T5 (failure classes, breaker, dangling
profile, Repair), T9 (token budget, chunker for summaries, whole-scene summary, bounded
`memorize:full`, preflight), `finish_reason` truncation, degenerate-loop detector,
input-proportional `maxTokens`, CC sampler override fix. Two wedges found while verifying (below:
backlog same-chat wedge, persisted scheduler snapshot) are in scope because they are the same
fault family.

Out: per-pass profile routing (T18, plan 08 — this plan keeps one `profileId` but types the seam so
T18 can add a role argument); window cleaning (T7, plan 04); opt-in constrained decoding /
`json_schema` trap (`connectionProfiles.ts:51-54`, theme 3, not scheduled); rpm spacing and the
community generation mutex (theme 3, not scheduled); reasoning-template strip (theme 3, 2/S, not
scheduled); the judge transport (already abortable, `stHost/judge.ts:44-65`; inv 7 untouched);
epistemic/ledger passes spanning the whole scene (they stay on the detecting window, see Risks).

## Verified current state

Tree: HEAD `fcc33cc` **plus an uncommitted working tree from a parallel session** (35 files, incl.
`scheduler.ts` V25 and `DrawerTabs.tsx`). Lines below are what the working tree shows 2026-09-23;
re-verify before building (Rule 1). Drift vs SUMMARY marked **Δ**.

| Claim | Current | Note |
|---|---|---|
| Seam sends no signal, CC/TC both | `stHost/connectionProfiles.ts:43-55` | `custom` = `{extractData:true, includePreset:true, includeInstruct:true, stream:false}`; returns `content`/`text` or `""` |
| Sampler override on every call | `extraction/client.ts:14-18` | `temperature ?? 0.1`, `top_p: 0.9`, `stream:false` as `overridePayload`; default `maxTokens ?? 512` |
| Only explicit content throw | `extraction/client.ts:13` | "No memory LLM profile selected" |
| `RunOwner.signal()` aborts only on `bump()` | `runtime/runOwner.ts:76-78,80-98` | **Δ** SUMMARY `:80-83` |
| `noteMutation` aborts nothing | `runtime/runOwner.ts:101-105` | **Δ** `:100-104`; sole caller `runtimeManager.ts:352` (`rollbackFromMessage`) |
| False "no signal" comments | `runOwner.ts:56-63`, `judge/types.ts:65-68`, `epochAbort.review.test.ts:8-11` | **Δ** `:56-62`; corrected by plan 01, not here |
| `RunGuard` has no signal | `runtime/runToken.ts:122-151` | `RunOwnership.signal?` exists `:109` |
| Retry loop ignores abort | `extraction/scheduler.ts:232-243` | **Δ** `:213-224`; 3 attempts, 250/500 ms |
| Install-wide pause from scheduler | `scheduler.ts:192-200` → `runtime/index.ts:66` → `runtimeManager.ts:432-439` | **Δ** overview `:432-438`. **Only** writer of `extraction.enabled=false` in `src/` (grep) |
| `job.run` failures (P0–P2) pause too | `scheduler.ts:182-183,197-200`; P2 scene/epistemic jobs `runtime/index.ts:74-78` | a **code bug** in a scene pass currently pauses the install |
| Heavy (P3/P4) failures never pause | `scheduler.ts:223-225` | expansion, curator, arc summary, canon |
| `sameWorld` guard on pause | `scheduler.ts:106-108,197` | kept |
| `clearForNewWorld` "cannot recall in-flight" | `scheduler.ts:90-92` | becomes false after T4; comment moves with code |
| Nothing resumes | grep `resume\|ONLINE_STATUS\|CONNECTION_PROFILE` in `src/` = 0; `stHost/events.ts:6-36` has none of those keys | |
| Pipeline: `lastError` → `error` + Repair | `runtime/pipeline.ts:58-62` | next action `repair` for a blip |
| Repair misses dangling id | `runtime/repair.ts:28` | `!enabled \|\| !profileId` only |
| Persisted scheduler snapshot | `runtime/extras.ts:249` keeps `lastError`/`inFlight` on hydrate | **new**: a reopened chat can show a stale error/"Reading…" until the first scheduler tick |
| Director on the reply path | `runtime/talkControl.ts:7,70-75,253` | 20 s `Promise.race`, **host request not aborted**; called from the awaited interceptor (inv 5) |
| Backlog: no cancel | `components/drawer/DrawerTabs.tsx:256` (working tree), `extractionCoordinator.ts:383-448` | windowSize 8 by message count |
| Backlog **same-chat wedge** (new) | `extractionCoordinator.ts:397,415,421,435` `return false` without `running:false` (`:443` is the catch's) | read window is `0…len-1` (`:391`), so ANY edit/swipe lapses it → button disabled (`DrawerTabs.tsx:256`) and consolidation blocked (`memoryCoordinator.ts:510`) until reload; hydrate resets it (`extras.ts:97`) |
| Unbounded `memorize:full` | `extractionCoordinator.ts:422-432` (`getChatWindow(0, len-1)`) | **Δ** SUMMARY `:428` |
| Scene summary = detecting window only | `extractionCoordinator.ts:287-306` | **Δ** `:288-306` |
| Cadence window bounded by count | `scheduler.ts:54-68` (`CADENCE_WINDOW_MAX 24`) | **new, uncommitted V25** — a message bound, not a token bound |
| `countTokens` unused for requests | `stHost/tokenizer.ts:3-8`; only `runtime/entryTokens.ts:1,6` | uses ST's **main-API** tokenizer (host fact below) |
| Truncation = char heuristic | `extraction/sharedRead.ts:17-23,107-115` | `raw.length > maxTokens*4`; one re-ask |
| Passes on the 512 default | shared read (settings carry no `maxTokens`), scene `:295`, short-term `:327`, epistemic `:351`, ledger `:368` (extractionCoordinator), arc `memoryCoordinator.ts:238`, canon `:342`, curator `stagecraftCoordinator.ts:147` | explicit: critic 512, generate 2048, authoring 2048/1024, director 96 |
| Expansion wedge | `expansionCoordinator.ts:127-137` persists `queued`; `:228-229` `generating`; lapse returns without write `:241,262,265`; `extras.ts:265-278` keeps the status on hydrate; `queue()` refuses an existing key `:131` | seed confirmed; also look-ahead blocked (`:149`) and player line "Preparing the road ahead…" stuck (`pipeline.ts:44-45,50-51`, `snapshotBuilder.ts:65`) |
| Budgets | manager 677/700, extractionCoordinator 450/620, memoryCoordinator 614/620, expansion 269, stagecraft 475 | `architecture.test.ts:9-10` |

## Host facts

Verified in the working ST tree (**1.19.0**, `package.json:118`) and on the pinned **1.18.0**
revision `51ad27fb` via `git show` (both present locally). Each row lands in
**`docs/plans/v2.4/host-facts.md`** (created by plan 01, X9; rule 2 cites it) before its item is
built.

| # | Fact | 1.19.0 | 1.18.0 |
|---|---|---|---|
| H1 | `sendRequest(profileId, prompt, maxTokens, custom, overridePayload)` destructures `custom.signal` and passes it to both services | `extensions/shared.js:393-400,415,424,463,483` | `:391,411,420,458,478` ✔ |
| H2 | Errors **inside** the switch are wrapped `Error('API request failed', {cause})` | `shared.js:489-491` | `:485` ✔ |
| H3 | `getProfile`/`validateProfile` and the CM-disabled check run **before** the `try` → a missing/invalid profile throws **unwrapped** (`Profile not found (ID: …)`, `Could not find profile.`, `Select a connection profile that has an API`, `Connection Manager is not available`) | `shared.js:427-432,546-550,605-623` | `:427,543` ✔ |
| H4 | Services pass `signal` to `fetch`; a non-OK reply throws `Error(json.error?.message \|\| 'Response not OK')` — **HTTP status is lost**, so 400 ≠ 502 is not recoverable from the error | `custom-request.js:118-131` (TC), `:462-474` (CC) | `:125,152,468` ✔ |
| H5 | ST server aborts the upstream call on client socket close (TC `/generate`; CC routes likewise) | `src/endpoints/backends/text-completions.js:272,284-292`; `chat-completions.js:242-244` | `:272,291` ✔. **Confirm live**: llama-server slot goes idle after our abort |
| H6 | `extractData:false` returns the raw JSON; `ctx.extractMessageFromData(json, type)` gives the same content. It reads no `finish_reason` — we must (`choices[0].finish_reason`) | `script.js:6276-6300`; `st-context.js:287`; TC `custom-request.js:133-135`, CC `:476-478` | `st-context.js:285` ✔. **Confirm live** the llama.cpp TC reply carries `finish_reason:"length"`; ST server has no `finish_reason` handling (`text-completions.js`, grep 0) so it is upstream's shape |
| H7 | `overridePayload` spreads **last** over the preset-derived payload (TC and CC) | `custom-request.js:414,605` | `:414,605` ✔ |
| H8 | CC `createGenerationParameters` deletes `temperature`/`top_p` per model (o1/o3/o4, gpt-5 families, gpt-6-astra, Kimi k2.5, Claude Fable/Opus-5/Sonnet-5) — our override puts them back → HTTP 400 | `openai.js:2691,3039-3040,3058-3059,3088-3089,3100-3101,3110-3111` | three sites (`:2970,2989,3019`); the Claude-5 rule is **1.19.0-only** |
| H9 | `ONLINE_STATUS_CHANGED` fires on change only, **main API only** (says nothing about the extraction profile) | `script.js:7151-7157`; `events.js:79` | `script.js:7097` ✔ |
| H10 | `CONNECTION_PROFILE_CREATED/UPDATED/DELETED` are emitted by **connection-manager**, not `shared.js` | `connection-manager/index.js:347,780,796,879,996,1015`; keys `events.js:82-84` | same lines ✔. **Δ** SUMMARY cites `shared.js:634-730`, which are only `handleDropdown`'s listeners (`:715,730,761`) |
| H11 | `getTokenCountAsync` counts with the **main API's** tokenizer (`power_user.tokenizer`, OpenAI counter when `main_api==='openai'`), not the extraction profile's | `tokenizers.js:443-468` | confirm on 1.18.0 before T9 |
| H12 | Context size is readable from the profile's preset: `ctx.getPresetManager(api).getCompletionPresetByName(profile.preset)` → TC `max_length`, CC `openai_max_context`; the CM profile itself has no size field (`connection-manager/index.js:38-68`) | `st-context.js:288`, `preset-manager.js:83,757`; e.g. `data/.../TextGen Settings/Artemis Extraction.json` `max_length: 98304` | `preset-manager.js:750` ✔; CC key and st-context export on 1.18.0 still to confirm |
| H13 | llama.cpp `/props` (true `n_ctx`) is reachable only through ST's server (`text-completions.js:234`, `llamacpp.post('/props')` `:521`) | — | recorded only; **not used** — the limit source is the preset or the default (D5) |
| H14 | `AbortSignal.any` / `AbortSignal.timeout` exist in the jest runtime (node v22.22.0, measured) and Chromium ≥116 | — | browser floor to state in README |

## Design

Invariant numbers: `extension-research/_baseline.md` §2 (inv N) and `.claude/rules/architecture.md`
§Invariants (arch "…").

### D1 Typed model-call seam (T4/T5 foundation)
- **What.** `sendConnectionProfileRequest(profileId, prompt, maxTokens, { signal, samplers })` in
  `stHost/connectionProfiles.ts` returns `ModelReply = {ok:true, text, finish: "stop"|"length"|"unknown"}
  | {ok:false, kind: "lapsed"|"timeout"|"transport"|"config", message}`. It calls with
  `extractData:false`, reads `choices[0].finish_reason` (and Claude-native `stop_reason`), and takes
  content via `ctx.extractMessageFromData(json, type)` (H6). Classification (pure helper
  `classifyHostFailure`, unit-tested on the literal ST messages): unwrapped H3 errors + our "no
  profile" → `config`; wrapped with `cause.name === "AbortError"` → `lapsed`; `"TimeoutError"` →
  `timeout`; any other wrapped error → `transport` (H4 forbids finer: status is lost). A preflight
  `profileExists(id)` via `listConnectionProfiles` makes "deleted profile" `config` before any fetch.
- **Samplers (theme 3; decided, X16/X20).** The fix is limited to the profile's API shape:
  `temperature`/`top_p` go into `overridePayload` **only for TC profiles**
  (`CONNECT_API_MAP[profile.api].selected === "textgenerationwebui"`), as today. For CC profiles
  plan 03 spreads no sampler keys, so the profile preset and ST's per-model rules decide (H7/H8). It
  builds no per-model table (D9's reasoning: a copied model table rots) and adds no other CC sampler
  control: plan 06's per-request sampler overlay (X20) owns sampler shaping on both APIs.
- **Module.** `stHost/connectionProfiles.ts` (+ vendored `hostTypes.ts:142` gains the `custom.signal`
  member with its H1 row). `extraction/client.ts` maps `ModelReply` to a thrown `ModelCallError`
  (carries `kind`) so the ~15 call sites keep `Promise<string>`.
- **Invariants.** inv 2 (all host access in stHost, shapes verified, no blind cast); inv 16's spirit
  (typed result, never bare string/boolean) — `stHost/typedResults.test.ts` gains a row for the seam.
  Judge untouched (inv 7).

### D2 Abort: per-read controller + timeout (T4)
- **What.** `RunOwner` keeps a registry of live runs `{window, controller}`. `beginRun` returns a
  `RunGuard` with `signal = AbortSignal.any([epochSignal, own.signal])` and `release()`.
  `noteMutation(id)` aborts every live run whose `window && id <= window.to` — the same rule as
  `tokenMatches`'s window check, so abort and refusal can never disagree. `bump()` aborts all (today).
  Window-less runs (expansion, canon, curator) abort on epoch only. Each call adds
  `AbortSignal.timeout(ms)` from one declared table (`extraction/callBudget.ts`, pure):
  `ms = 30 000 + maxTokens × 50` (a 20 tok/s floor; RTX PRO 4500 measured ~33 tok/s per gotchas).
  The director keeps `DIRECTOR_TIMEOUT_MS = 20000` but now **aborts** the host request (inv 5: reply
  path never waits past its bound, and the pod slot is freed).
- **Lapsed ≠ failed.** `runWithRetries` returns immediately on `kind:"lapsed"` (no retry, no error,
  no breaker count); the job resolves as `discarded` and is journaled as a lapse. A `timeout` is a
  transport failure (counts). `sharedRead`'s oversized re-ask also stops on lapse.
- **Threading.** `callExtractionModel(prompt, {…, signal})`; `runSharedRead` takes `signal` in
  `RunSharedReadOptions`; scheduler passes `read.signal` from `beginRead`. Coordinators pass their
  own `run.signal` (they already hold a guard at every site listed above).
- **Invariants.** inv 10 / arch "Every asynchronous writer takes a RunOwnership": the token check
  stays at every write edge — abort is an optimisation, never the guard. inv 11: abort only on the
  same mutations that already invalidate the result.
- **Census.** No new write-after-await site. Rows touched (notes only, status unchanged):
  `ExtractionScheduler.pump` (partial → still partial; the "cannot recall in-flight" residual in its
  note is replaced by "aborted; refused at the write edge if the abort loses the race"),
  `pumpHeavy`, `TalkController.ensureDecision`. `RunOwner.noteMutation` is synchronous, no row.

### D3 Failure classes, breaker, no install-wide pause (T5, D4)
- **Delete** `SchedulerHost.pauseExtraction` and `RuntimeManager.pauseExtraction`
  (`runtimeManager.ts:432-439`, −8 lines). Replaced by a per-class outcome on the scheduler:
  - **transport/timeout** → `extraction/breaker.ts` (pure state machine, **in memory, never
    persisted**, keyed by `profileId`): closed → open after the retry loop fails → half-open probe on
    backoff 5 s/15 s/60 s/300 s cap. Probe = `"Reply with exactly: PONG"`, 8 tokens, 10 s timeout
    (the gotchas' profile probe). Extra probe triggers: `ONLINE_STATUS_CHANGED` (H9 — trigger only,
    never proof), `CONNECTION_PROFILE_UPDATED` for our id, the player's **Try again**. While open the
    scheduler **holds** its queues (P1 merges windows, bounded by V25's `CADENCE_WINDOW_MAX`); a
    closed breaker pumps. The director consults `breakerOpen()` and skips straight to the rules pick
    rather than spending its 20 s on a dead endpoint.
  - **config** (no/deleted/unsupported profile, CM disabled) → no retry; `extras.extraction` health
    `{kind:"config", detail}`; `pipeline` → `not-configured`; `repair.ts` step `memory-model` with
    detail "The selected memory model profile no longer exists" (dangling id: `profileId` not in
    `listConnectionProfiles()`); `CONNECTION_PROFILE_DELETED`/`CREATED` re-evaluate.
  - **bug** (anything thrown that is not a `ModelCallError`: parse crash, TypeError in `job.run`) →
    per-chat `lastError` + journal record, pipeline `error` with author `detail`; retried at the next
    boundary (`onBoundary` clears it before scheduling). Never pauses anything else.
  - Heavy jobs share the breaker (a transport failure in a curator pass opens it too) but keep
    `lastHeavyError` for bug-class failures.
- **Pipeline copy** (`pipeline.ts`): new `transport` problem → state `stalled-rechecking`, text
  "The memory model is not answering — the story will catch up when it does.", `nextAction:"retry"`
  (existing vocabulary, `PIPELINE_ACTION_COPY.retry`). Try again = `manager.retryExtraction()` → probe.
- **Persisted snapshot.** `sanitize` on hydrate resets `extraction.scheduler` to
  `{queueDepth:0, inFlight:false, lastError:null}` (like `backfill.running`, `extras.ts:97`): the
  scheduler is in-memory state, its persisted copy is a display cache.
- **Invariants.** inv 13 / arch "Three lifetimes, three homes": the runtime stops writing an
  install-wide user setting; breaker state has no home on disk by design. inv 2: two new keys in
  `stHost/events.ts` (`ONLINE_STATUS_CHANGED: [status: string]`,
  `CONNECTION_PROFILE_UPDATED: [old, new]`, `…_DELETED: [profile]`, `…_CREATED: [profile]`), each with
  its H9/H10 row. inv 9: Try again is player-safe copy, no internals (`assert-player-clean` extended).
  inv 18: breaker lives in `extraction/`, owned by the scheduler; manager gains only a one-line
  `retryExtraction` delegate (677 → ~672 net).
- **Census.** `ExtractionScheduler.pump`: the `sameWorld`-guarded pause becomes a `sameWorld`-guarded
  health write — row stays `partial`, note rewritten. New rows for the breaker's probe (async write
  after await into scheduler state) → `local` (in-memory, per-owner) and for
  `RuntimeManager.retryExtraction` → `delegate awaits ExtractionScheduler.probe`.
- **Fault matrix.** `extraction|backendUnavailable` partial → **covered**, citing the new
  `scheduler.breaker.test.ts` case ("a dead profile never writes extraction.enabled and resumes on
  probe success"). `extraction|delayedError` evidence unchanged.

### D4 The two wedges (T4 seed D + found here)
- **Memorize backlog.** `runMemorizeBacklog` gets one `finally`-shaped exit that writes
  `running:false` **when the run still owns the chat** (an owned lapse on the same chat now clears;
  a foreign chat is still not written — inv 10). A lapse caused by a mutation reports "Stopped: the
  chat changed while memorizing" in `backfill.lastError`. **Stop** = `cancelMemorizeBacklog()` aborting
  the backlog's own controller (chained into every window's signal); button beside "Memorize chat"
  (`DrawerTabs.tsx:256`), shown only while running. Windows already applied stay (they are
  memory-only, `acceptedDeltas: []`, `:414`); `memorize:full` is not reached, stated in the result.
- **Expansion `generating`.** (a) `ExpansionCoordinator` keeps an in-memory `Set` of keys with a live
  job; `queue()` treats a `queued|generating` entry whose key is not live as re-queueable.
  (b) `sanitizeExpansion` demotes a persisted `queued|generating` entry to `stale` (lookahead) or
  drops it (active) on hydrate — no blob bump (value change within the existing schema; Rule 3 holds).
  (c) An aborted `generate` (epoch) writes nothing (today) and the live key is released in `finally`.
  Pipeline's `expansionInFlight` then stops reporting a ghost draft.
- **Census.** `runMemorizeBacklog` row stays `checked`, note adds the exit write and Stop.
  `ExpansionCoordinator.generate` stays `checked`; the `finally` release is in-memory (`local`).
- **Fault matrix.** `expansion|worldSwitched` note + second citation: "a switched-away chain is
  re-queueable on return" (new case in `expansionOwnership.review.test.ts`).

### D5 Request-size bound (T9, seed D, privacy §4)
- **Budget.** `extraction/callBudget.ts` (pure): `inputBudget = contextLimit − maxTokens − margin`
  (margin 10 %, because H11's count uses the main-API tokenizer). **Limit source (decided):** the
  profile's preset when readable — `readProfileContextLimit(profileId)` in `connectionProfiles.ts`
  (H12: TC `max_length`, CC `openai_max_context`); otherwise the **declared default 8192**. No
  llama.cpp `/props` call (H13 unused). Either way the limit is reported as `contextLimit: {value, source: "preset"|"default"}` in the
  audit and in the capabilities read-out (`#so-capabilities`) — never fail closed (T9 verified).
- **Chunker.** `extraction/chunker.ts` (pure): greedy pack whole messages by token count into windows
  `{from,to}` under `inputBudget − promptOverhead`; a single oversized message is truncated with a
  marker and flagged, never dropped silently. **Summaries only**:
  - `memorize:window` passes: token-bounded windows replace fixed `windowSize 8` (they write memory,
    never deltas — `extractionCoordinator.ts:414`).
  - **Scene summary** spans `[prevBreak+1, to]` (prev = last `scene_history` entry's derived range
    `to`, else 0): map (per-chunk summary) → reduce (summary of summaries). The stored derived record
    covers the whole range (inv 11 / arch v2.3 plan 04 derived artifacts); chunk summaries are not
    stored. The run's guard window widens to the whole scene.
  - **Short-term compaction**: tail-fit (previous summary + the newest messages that fit).
- **DELTA reads are never map-reduced** (inv 4, only `memorize:full` moves the blackboard,
  latest-wins, evidence in window). `memorize:full` and any P0/P1 read over budget are **tail-fit**:
  the largest suffix window that fits; the audit records `trimmedFrom` so the author sees that earlier
  messages were covered by the memory passes only. Evidence rule unchanged — a delta quoting a
  trimmed message is rejected as "evidence not in window", which is the honest outcome.
- **Preflight.** Manual heavy passes (`Memorize chat`, `/so-mem backlog`, author `/cp expand`) show
  `showConfirmPopup` with "N requests, about T tokens to <profile>" when N > 3 or T > 50 % of the
  limit. Automatic passes never prompt.
- **Invariants.** inv 4, inv 11 (a derived range per artifact; chunk intermediates not persisted),
  inv 2 (preset read in stHost), privacy §4 row "not capped" → capped; `privacy-report` gets a v2.4
  addendum row, not an edit of v2.3 text.
- **Census.** No new async writer (chunking is pure; the map loop sits inside
  `runSceneBreakPass`, which gains a token check **inside** the map loop — the rule arch "put the
  check before EACH host write … inside the loop"). Row note updated.
- **Fault matrix.** No new cell; `extraction|malformedResponse` unchanged.

### D6 Small items (theme 3)
- **Truncation from `finish_reason`.** `finish === "length"` → the reply is refused whole ("truncated
  response", same path as oversized, `sharedRead.ts:114-115,131-133`); `unknown` → keep the char
  heuristic as fallback. Other passes: a truncated summary/canon is not stored.
- **Degenerate-loop detector** `extraction/degenerate.ts` (pure): same line ≥ 4× or a ≥ 8-token n-gram
  repeated covering > 50 % of the reply → refused as `degenerate`, journaled with the raw reply.
  Content class: never counts toward the breaker, never pauses.
- **Input-proportional `maxTokens`** (one table in `callBudget.ts`): per pass family
  `clamp(ceil(inputTokens × ratio), floor, cap)` — shared read 512 fixed (response is bounded by
  `MAX_DELTAS_PER_READ`), scene/arc summary ratio 0.25 floor 256 cap 1024, canon floor 768 cap 1536,
  epistemic/ledger floor 384 cap 1024, curator floor 384 cap 1024. Ratios are starting values and are
  recorded, then checked against the live `finish_reason:"length"` rate — not tuned to a score.
- **CC sampler override** — D1.

### Fault matrix: one new shape
Add column **`aborted`** (cancelled mid-call by rollback, switch or Stop) — nine cells: extraction,
expansion, memory, scene, stagecraft, lore, judgeRing `covered` with the new cases (judge already
aborts: cite `epochAbort.review.test.ts`); effects, persistence `na` ("performs no model call").
Counts move 81 → 90 cells deliberately (arch "A fault matrix cell is checked").

## Order of work

1. **Host facts** H1–H14 into `docs/plans/v2.4/host-facts.md` (X9); confirm H11/H12's 1.18.0 halves.
2. **Red tests first**: classification on literal ST messages; lapse vs timeout; dangling profile;
   backlog same-chat wedge; expansion hydrate wedge; persisted scheduler snapshot; a "no `src/`
   module writes `extraction.enabled`" guard.
3. D1 seam (typed reply, `extractData:false` + `finish_reason`, TC-only samplers, context limit).
4. D2 per-read controller + timeout table + director abort.
5. D3 classes + breaker; delete `pauseExtraction`; pipeline/repair/events.
6. D4 wedges + Stop.
7. D5 budget, chunker, whole-scene summary, tail-fit `memorize:full`, preflight.
8. D6 loop detector, `maxTokens` table.
9. Census + fault-matrix edits; machine gates; live gates; Gate record.

## Tests and gates

**jest** (`npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build
&& npm run test:release`; `npm run test:debug` for any harness verb). Each guard gets a **mutation
check** recorded in `test/findings/mutations/v2.4-03-off-path.txt` (revert the guard → exactly its
case fails; control stays green):

| Guard | Case (file) | Mutation |
|---|---|---|
| lapse short-circuits retries | `scheduler.test.ts` "an aborted read is not retried and records no error" | drop the lapse branch in `runWithRetries` |
| rollback aborts the read in its window only | `runOwner.abort.test.ts` (new) + control "a reply appended after the window does not abort" | remove the `id <= window.to` abort |
| no install-wide write | `scheduler.breaker.test.ts` "a dead profile never writes extraction.enabled" + source guard | reinstate `setGlobalSettings({extraction:{enabled:false}})` |
| breaker resumes | same file "probe success pumps held queue" | skip `close()` on probe ok |
| breaker not persisted | `extrasLegacy.test.ts` "hydrate carries no breaker, resets scheduler snapshot" | persist the snapshot |
| config ≠ transport | `connectionProfiles.test.ts` (new) over H3's literal messages | map unwrapped to transport |
| dangling id → Repair | `repair.test.ts` "a deleted profile is a memory-model step" | drop the existence check |
| director aborts | `talkControl.test.ts` "timeout aborts the host signal" | race without abort |
| backlog exit + Stop | `extractionOwnership.review.test.ts` "a same-chat lapse clears running", "Stop keeps applied windows" | remove the exit write |
| expansion wedge | `expansionOwnership.review.test.ts` "a persisted generating entry is re-queueable on hydrate" | remove demotion |
| finish_reason | `sharedRead` case "length is refused whole" | ignore `finish` |
| loop detector | `degenerate.test.ts` + control on a legitimate list reply | raise threshold to ∞ |
| TC-only samplers | `client.test.ts` "CC profile sends no temperature/top_p" | always spread |
| chunker | `chunker.test.ts` property: every window ≤ budget, windows cover the range in order, no gap | off-by-one in pack |
| tail-fit DELTA | "memorize:full never exceeds the budget and records trimmedFrom" | send full window |
| unknown limit | "unreadable preset → default 8192, reported" | throw on unknown |

Architecture guards stay green: manager ≤ 700, extractionCoordinator ≤ 620 (450 now; D4/D5 add
~60 — if it approaches budget, the scene map/reduce moves to `memory/sceneSummary.ts`, pure).

**Live gates** (real LLM, headed, no `debugResponse`; `st-session.mts reload` after every build;
pin the group; `so-run-header capture` before and `diff` after each batch). Records under
`test/journeys/records/v2.4-plan03/`:

1. **Backend pause/resume.** Mid cadence read: stop the pod if the session may act on RunPod (a pod
   this session did not create is not ours to stop — then use the fallback); **fallback**: repoint the
   extraction profile's `api-url` to a dead port (record the old value, restore it, re-select the
   profile — gotcha "`#send_but` stays hidden"). Assert: `getGlobalSettings().extraction.enabled`
   stays `true` throughout; pipeline reads `stalled-rechecking`; no audit written; after restore the
   breaker's probe resumes within one backoff step **without any settings click**, the held cadence
   read runs, `auditCount` rises. Run ×2.
2. **Abort on rollback mid-read.** Real cadence read in flight → edit a message inside its window.
   Assert: the host request is cancelled (ST server log shows the socket close; llama-server slot
   idle within 2 s — H5), the audit ring gains a lapse, not an error; the P0 re-read runs. Control:
   a reply appended after the window does **not** abort. Run ×2.
3. **`memorize:full` on a long chat under budget.** A ≥ 300-message chat (a copy of a real one, not
   the user's live chat), `st-payload arm --persist`: every captured memorize request ≤ the reported
   `inputBudget`; `trimmedFrom` present on the full pass; the backlog completes; **Stop** mid-run
   leaves `running:false` and applied windows intact.
4. **Wedges.** Expansion: queue a stub, switch chats before it answers, return → the stub
   re-generates (no Regenerate click) and the player line is not stuck. Backlog: swipe during
   memorize → button re-enabled without reload.
5. Regression: J3 and J4 `--strict` ×2 (extraction path + pipeline copy).
6. **X17 player-clean check**: `so-ui.mts assert-player-clean` in player mode while each recovery
   control is visible — the pipeline "Try again" (breaker open) and the backlog "Stop" (memorize
   running) — ×2, archived. The sweep covers their labels and selectors.

A gate is green only with both runs archived; if the backend cannot run, the gate is **NOT green**
and says so.

## Risks

- **Rule 7 (resolved, X17).** "Try again" (pipeline) and "Stop" (memorize backlog) are recovery
  controls on states the player already sees, so they are exempt from rule 7. The condition is that
  they pass `assert-player-clean` (live gate 6). Their copy stays player-safe: no ids, retries or
  error text outside `detail`.
- **CC determinism.** CC profiles get no sampler override from plan 03, so CC extraction runs on the
  preset's samplers until plan 06's overlay (X20). No CC backend is in the live gate, so this is
  unmeasured and stated as such.
- **Tokenizer mismatch** (H11): counts are estimates; the 10 % margin is a guess and is recorded as
  one. A preset `max_length` larger than the server's real `n_ctx` (the Artemis preset says 98 304)
  over-states the budget. The accepted residual: a provider context error then surfaces as a
  transport failure with the provider message in `detail`. `/props` is deliberately not read.
- **Timeout = hardware assumption** (debug-scripts gotcha): the 20 tok/s floor is declared in one
  table and every timeout is journaled with elapsed time, so a false timeout is visible.
- **Tail-fit loses early deltas** in `memorize:full`: intended (evidence must be in window) and
  stated in the audit, but an author may read it as "missed". The memory passes still cover it.
- **Breaker hides a persistent provider 400** (H4 loses status): it shows as "not answering" with the
  provider message in author detail; D1's sampler fix removes the one known cause.
- **Uncommitted parallel edits** to `scheduler.ts`/`DrawerTabs.tsx`: every line here must be
  re-read on the frozen v2.3 tree (D1 entry condition).
- Epistemic/ledger passes stay on the detecting window; a long scene's early knowledge is only in the
  summary. Deliberate scope cut.

## Unresolved questions

None open. The three from the first draft are settled:
- CC samplers: no override on CC, no per-model table; plan 06 owns sampler shaping (D1, X16/X20).
- Context limit: the preset when readable, else the declared default 8192, reported either way (D5).
- Try again / Stop: exempt from rule 7, must pass `assert-player-clean` (X17).

## Gate record

_Placeholder — date, exact commands and outputs, mutation file, live records under
`test/journeys/records/v2.4-plan03/`, deviations. Filled when the plan closes._

### Budget modules (worktree build, 2026-09-24)

Scope: the PURE half of D5 plus the H12 host read. Built on master `d7bd4ed`. Not wired into any coordinator
(wave 2 does that after merge).

**As built**
- `src/extraction/inputBudget.ts` (pure): `DEFAULT_CONTEXT_LIMIT = 8192`, `INPUT_BUDGET_MARGIN = 0.1`,
  `ContextLimit {value, source: "preset"|"default", reason?}`, `inputBudget(limit, maxTokens)` →
  `{contextLimit, maxTokens, margin, input}` with `input = max(0, limit − maxTokens − ceil(limit × 0.1))`
  (an unusable `limit.value` falls back to 8192). `tailFit(window, {budget, promptOverhead, count, perMessage?})`
  keeps the largest suffix whose cost ≤ `budget − promptOverhead` and returns the window shape plus
  `{tokens, trimmedFrom, truncated}`: `trimmedFrom` = the original `from` when anything was dropped, else `null`.
  A newest message larger than the room is truncated with `TRUNCATION_MARKER` and flagged, never dropped.
  A prompt that leaves no room (or less room than a truncated message) is `{ok:false, capacity, reason}`.
- `src/extraction/chunker.ts` (pure): `chunkMessages(messages, options)` greedy-packs whole messages into
  ordered windows `{from, to, messages, tokens, truncated}` under the same capacity; an oversized message is
  truncated (head kept, marker appended, binary search on the prefix) and listed in `oversized` and in its
  window's `truncated`. Same `{ok:false}` refusal when there is no room.
- Token counts are injected as a **synchronous** `count(text)`; `perMessage` adds a fixed per-message cost
  (speaker label / formatting).
- `src/services/stHost/contextLimit.ts`: `readProfileContextLimit(profileId)` (exported from `STAPI.ts`) and the
  pure mapper `contextLimitFromPreset(selectedApi, presetName, preset)`. Never throws: no profile id, CM disabled,
  deleted profile, no preset named, API without completion presets, no preset manager, unreadable preset, a
  non-positive or non-numeric size, or any host throw → `{value: 8192, source: "default", reason}`. H12 verified
  on 1.19.0 and 1.18.0 and recorded as `host-facts.md` 03-H12. `hostTypes.ts` gained `CONNECT_API_MAP?`,
  `getPresetManager?`, `HostConnectApiMap`, `HostPresetManager`. `typedResults.test.ts` needed no row (the read
  answers an object).

**Deviations**
- The budget lives in `extraction/inputBudget.ts`, not `extraction/callBudget.ts`: another wave-1 agent owns
  `callBudget.ts` (timeouts / `maxTokens` table). The host read lives in `stHost/contextLimit.ts`, not
  `connectionProfiles.ts`, which another agent is rewriting (D1 seam).
- The tail-fit case is named "never exceeds the budget and records trimmedFrom" (the plan's
  "memorize:full never exceeds …" needs the wiring; the wave-2 case should assert the same on the real pass).
- Mutation record is `test/findings/mutations/v24-03-budget.txt`, not the plan's `v2.4-03-off-path.txt`
  (shared by the other wave-1 items; merge may fold it in).

**Gates** (worktree, 2026-09-24)
- `npm run typecheck` → clean; `npm run typecheck:test` → clean; `npm run lint` → clean.
- `npm test` → 193 suites / 2946 tests passed (new: `chunker.test.ts` 4 seeds × 300 iterations + 4 cases,
  `inputBudget.test.ts` 7, `contextLimit.test.ts` 12).
- `npm run build` → compiled (2 pre-existing size warnings), manifest bundle `dffcef2882e6`.
- No live gate (pure modules + an unwired host read; nothing reaches a model call yet).

**Mutants** (`.debug/mut-budget.py`, record `test/findings/mutations/v24-03-budget.txt`): 10/10 killed —
off-by-one in pack, early close, oversized dropped, last window lost, tail-fit sends full window, no
`trimmedFrom`, no margin, throw on unreadable preset, host throw escapes, zero size accepted.

**Not done** (wave 2)
- Wiring: `memorize:window` token windows, whole-scene map/reduce, short-term tail-fit, tail-fit on
  `memorize:full` and over-budget P0/P1 reads with `trimmedFrom` in the audit, `contextLimit` in the audit and
  `#so-capabilities`, the preflight confirm.
- Counting: ST's `getTokenCountAsync` is async (H11, main-API tokenizer), the modules take a sync counter. The
  caller must pre-count (e.g. `countTokensBatch` into a cache) or pass a sync estimator; truncation of an
  oversized message counts arbitrary prefixes, so a pure cache is not enough for that path.

### Wedges + snapshot reset (worktree build, 2026-09-24)

Built on `d7bd4ed` in a worktree, in parallel with the seam (D1/D2/D3 breaker) and budget (D5) agents. Scope: D4 both wedges
+ Stop, and D3's "Persisted snapshot" bullet only. Machine gates only: **no live gate ran** (no backend in this session),
so live gates 3 (Stop half), 4 and 6 are **NOT green**.

**Line re-verification (Rule 1), on `d7bd4ed` before building.** The Verified-state table is stale for this scope:
- backlog `extractionCoordinator.ts:398-464` (table: 383-448). Early `return false` without `running:false` at
  `:412,430,436,450`; the catch's write at `:459`.
- `DrawerTabs.tsx:280` (table: 256). Consolidation blocked at `memoryCoordinator.ts:458` (table: 510).
- `extras.ts:97` backfill reset holds. The scheduler snapshot is at `extras.ts:249`, and `sanitizeExpansion` at
  `:265-277`, which also kept `expansion.scheduler`.
- Expansion: `queue()` persists `queued` at `expansionCoordinator.ts:136-145` and refuses an existing key at `:139`;
  `generating` at `:236-237`; lapse returns at `:249,270,273`; look-ahead guard `:157`. `snapshotBuilder.ts:67`.
- Budgets now: manager 658/700, extractionCoordinator 501/620, expansionCoordinator 289, memoryCoordinator 563
  (untouched).

**As built**
- **Backlog single exit.** `runMemorizeBacklog` is now three parts.
  - The entry mints the V3 whole-chat read, plus a per-run `AbortController` held in `backlogStop`.
  - `memorizeWindows` is the unchanged V3 loop and full pass, handed a `ReadOwnership` that is the chat token AND
    `!stop.aborted`.
  - `endBacklog` is the one exit, reached after `try/catch/finally` on every path.
  - `endBacklog` reads `read.lapsed()` first. `epoch|chat|story` writes nothing: that backfill is another chat's, and its
    hydrate resets `running`. On `window` (an edit or swipe inside `0…len-1`) it writes `running:false` +
    `"Stopped: the chat changed while memorizing"`. On `version` (a hot-swapped story, same chat) it writes
    `"Stopped: the story was updated while memorizing"`. On Stop it writes `running:false` + `backlogStoppedByPlayer`
    ("Stopped after N of M parts. What was read is kept; the whole-chat pass did not run."). A thrown error keeps its
    message.
- **Stop.** `ExtractionCoordinator.cancelMemorizeBacklog()` has a one-line manager delegate `cancelMemorizeBacklog()`.
  It returns false when nothing is running or the run is already stopped. It is checked before every window, after every
  `applyAudit`, before the full pass and before the boundary commit. The in-flight window's result is **not** applied
  after Stop. Applied windows stay; they are memory-only (`acceptedDeltas: []`).
- **Drawer.** `#so-memorize-stop` ("Stop") sits beside "Memorize chat", rendered only while `backfill.running`, in
  both personas like the button it belongs to. The copy is player-safe: no ids and no `memorize:full`.
- **Expansion wedge.**
  - `liveJobs: Map<key, RunGuard>` is set by `queue()` (the scheduled job) and by `generate()`, and released in
    `generate`'s `finally`. A key is live while its guard `stillOwns()`, so a queued job that `clearForNewWorld`
    dropped (epoch bump) stops counting without any release.
  - `queue()` re-queues a `queued|generating` entry whose key is not live.
  - `sanitizeExpansion` drops a persisted `queued|generating` active entry and demotes a look-ahead one to `stale`
    (`lastError: "Interrupted before it finished"`). This is a value change only, with no blob bump (Rule 3).
- **Snapshot reset.** Hydrate writes `extraction.scheduler = {queueDepth:0, inFlight:false, lastError:null}`.
- **Census** (`ownership-sites.json`). New rows `ExtractionCoordinator.memorizeWindows` and `.endBacklog`, both
  `checked`. `runMemorizeBacklog` stays `checked`, and its note now names the exit and Stop. `ExpansionCoordinator.generate`
  stays `checked`: its RESIDUAL (the wedge) is replaced by the live-key note, and the `finally` release is in-memory.
- **Fault matrix.** `expansion|worldSwitched` keeps `covered` and gains the second citation "a switched-away chain is
  re-queueable on return", with the note extended. Counts are unchanged: 55 covered, 10 partial, 16 na, 0 todo, of 81.

**Deviations**
- **Tests file.** The backlog cases are in `backlogOwnership.review.test.ts`, not `extractionOwnership.review.test.ts` as
  the plan's table says, because that file already holds the V3 backlog harness.
- **Hydrate cases.** "a persisted generating entry is re-queueable on hydrate" is in `expansionOwnership.review.test.ts`.
  The snapshot case is titled "hydrate resets the persisted scheduler snapshot" in `extrasLegacy.test.ts`, not the plan's
  combined "hydrate carries no breaker, resets scheduler snapshot": the breaker half is the seam agent's.
- **Second citation.** The fault matrix had no way to hold one, so `FaultCell` gained an optional `alsoEvidence: string[]`.
  `faultMatrix.guard.test.ts` checks every citation in it exactly like `evidence`, and refuses it on `todo`/`na` (F1
  proves the check).
- **Also reset `expansion.scheduler`** on hydrate, which the plan did not name. `expansionInFlight` reads `inFlight` too,
  so without it "Preparing the road ahead…" would still ghost on reopen, and the plan's stated outcome would not hold.
- **The look-ahead guard (`:157`) is unchanged.** It still counts any `queued|generating` look-ahead as in flight: the
  existing case "keeps one pre-generation in flight at most" seeds exactly such an entry with no job. An in-session
  orphaned look-ahead therefore still blocks further pre-generation until arrival re-queues it (as `active`) or a
  hydrate demotes it.
- **The in-flight abort is not wired.** `callExtractionModel`/`runSharedRead` take no `signal` on this tree, so Stop
  acts between windows and refuses the in-flight window's result at the write edge. **Merge follow-up:** pass
  `stop.signal` (combined with the run's epoch signal) into the backlog's `client`/`runSharedRead` once the seam lands.
  `backlogStop` is the controller to use.

**Gates** (worktree; `node_modules` is a junction to the main checkout)

| Command | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run typecheck:test` | 0 errors |
| `npm run lint` | clean |
| `npm run debug:typecheck` | 0 errors |
| `npm test` | 190 suites, 2931 tests, all passing (+12 new) |
| `npm run build` | compiled; 2 warnings, both webpack's asset/entrypoint size warnings; manifest reports "ST unknown" (worktree path) |
| Storybook | 32 suites, 199 tests, all passing (+2: `PlayerStopsMemorizing`, `MemorizeStopped`) |

The Storybook run was `npm run storybook:build`, then `http-server .sb-static -p 6006`, then
`test-storybook --index-json`. Plain `npm run test-storybook:ci` reports "No tests found": the runner resolves its
rootDir through the `node_modules` junction to the main checkout, where the worktree's stories sit under a dot
directory.

Red first: before the implementation, 6 of the new cases failed and 21 passed (a same-chat lapse, Stop, the Stop
control, the snapshot reset, the switched-away chain, the hydrate re-queue).

**Mutants.** `test/findings/mutations/v24-03-wedges.txt`: 13/14 killed, each by exactly its own case(s), controls green.
E4 (no `finally` release) is equivalent by construction, because liveness is `stillOwns()`, and it is recorded as such.
E5 survived the first pass and was killed after a case was added. Storybook M-SB1 (Stop never rendered) was killed.

**Not done / NOT green**
- Live gate 3's Stop half, live gate 4 (both wedges live) and live gate 6 (`assert-player-clean` with Stop visible,
  ×2) were not run: no backend.
- The in-flight abort on Stop waits on the seam, as above.
- The plan's combined mutation file `v2.4-03-off-path.txt` is not written. These rows live in
  `v24-03-wedges.txt`, named like `v24-02-T8.txt`.

### Seam + abort + D6 (worktree build, 2026-09-24)

Built on `d7bd4ed` (branch `worktree-agent-a7c1cf4059170daac`) in an agent worktree, in parallel with the wedges and budget builders. Scope: order-of-work step 1 (host facts), D1, D2 and D6. Machine gates only: **no backend and no browser, so no live gate ran and none is claimed green.**

**Host facts.** H1–H14 re-verified on 1.19.0 and on 1.18.0 (`git show 51ad27fb:…`) and written to `host-facts.md` §Plan 03, with five new rows found while building:
- H11 and H12's 1.18.0 halves are now confirmed.
- H15: `CONNECT_API_MAP[api].selected` is the TC/CC switch.
- H16: three config refusals are raised *inside* the `try`, so they arrive wrapped as `API request failed`.
- H17: `extractData:false` skips the TC reply clean-up (`custom-request.js:332-381`).
- H18: TC `llamacpp` goes to llama-server's **native `/completion`**, not `/v1/completions`, so its reply carries `stop_type`/`stopped_limit`, not `choices[0].finish_reason` (Δ H6).
- H19: an upstream non-OK reaches the client as `Response not OK`, and the provider text is lost.

Δ H1: the plan's `:393-400,415` citation is the JSDoc; the code is `:423-424`, `:463`, `:483`.

**D1 as built**
- `stHost/modelReply.ts` (pure, host-free, so it is unit-testable; the `saveEvidenceHost` split pattern) holds the following:
  - `ModelReply`, `ModelFinish`, `ModelFailureKind`.
  - `classifyHostFailure(error, signal)`:
    - our own aborted signal decides first: a `TimeoutError` reason is `timeout`, anything else `lapsed`;
    - an unwrapped error is `config`;
    - a wrapped error is judged by its `cause`: `AbortError` is `lapsed`, `TimeoutError` is `timeout`, a config message is `config`, anything else `transport`, with `API request failed: <cause>` kept for the author.
  - `readFinish(json)` covers OpenAI `choices[0].finish_reason`, Claude `stop_reason`, Gemini `finishReason`, Ollama `done_reason` and llama.cpp `stop_type`/`stopped_*`, else `unknown`.
  - `cleanTextCompletionReply` mirrors the H17 clean-up.
  - `samplerPayload` spreads `temperature`/`top_p` only when `selected === "textgenerationwebui"`.
  - `requestModelReply(host, …)` does the rest:
    - aborted-signal short-circuit;
    - `profileExists` preflight, which makes a deleted profile `config` before any request;
    - `extractData:false` with the caller's `signal`;
    - `extractMessageFromData`, then the TC clean-up and `readFinish`;
    - it never rejects.
- `stHost/connectionProfiles.ts`:
  - `sendConnectionProfileRequest(profileId, prompt, maxTokens, {signal, samplers}) → Promise<ModelReply>` is thin wiring;
  - `profileExists(id)` is new.
- `hostTypes.ts` gains:
  - `HostModelRequestCustom` (with `signal`, 03-H1) on `sendRequest`;
  - the context members `CONNECT_API_MAP`, `extractMessageFromData` and `getPresetManager`, each with its row.
- `STAPI.ts` exports the seam types and `profileExists`.
- `typedResults.test.ts` allowlists `profileExists` as a read. The seam itself is typed, so it needs no row.
- The Storybook STAPI mock was updated.
- `extraction/client.ts`:
  - `callExtractionReply → {text, finish}`, throwing `ModelCallError {kind}`;
  - `callExtractionModel` keeps `Promise<string>` and gains `refuseIncomplete`: `""` for `finish:"length"` or a degenerate reply;
  - `isLapse`, `lapseAsEmpty`;
  - each call is bounded by `AbortSignal.timeout(callTimeoutMs(maxTokens))` joined to the caller's signal (`utils/signals.ts` `anySignal`; `AbortSignal.any` is not in TS 5.4's lib, H14);
  - a timeout error names its budget in ms;
  - `debugResponse` answers `finish:"unknown"`.

**D2 as built**
- `RunOwnership.live(window) → {signal, release}` and `RunGuard.signal` (a lazy getter) plus `release()`:
  - a run registers only when its signal is first read;
  - a run that had already lapsed is handed an aborted signal.
- `RunOwner`:
  - keeps a live registry (cap 32, cleared by `bump()`);
  - the signal is `anySignal([epoch, own])`;
  - `noteMutation(id)` aborts every live run with `window && id <= window.to`, the `tokenMatches` rule.
  - Window-less runs (expansion, canon, curator) abort on the epoch only.
- `extraction/callBudget.ts` (pure):
  - `callTimeoutMs = 30000 + maxTokens × 50`;
  - D6's `MAX_TOKENS_TABLE` and `maxTokensFor` / `maxTokensForInput` (chars/4). The shared read is fixed at 512. Scene/short-term/arc use 0.25 with floor 256 and cap 1024; canon 0.25/768/1536; epistemic/ledger/curator 0.25/384/1024.
  - No input-budget or context-limit math; that belongs to `inputBudget.ts`.
- Scheduler:
  - `ReadOwnership` gains `signal?`/`release?`;
  - `pump` passes `read.signal` into the shared read's client and releases in `finally`;
  - `runWithRetries` rethrows a lapse at once;
  - a lapse in `pump` or `pumpHeavy` writes no `lastError`/`lastHeavyError` and **never reaches `pauseExtraction`**. When the job's epoch is still current it goes to the new `noteLapse` host hook, which `runtime/index.ts` wires to `noteRecap("extraction read lapsed: <reason>", detail)`.
  - The "cannot recall in-flight" comment is rewritten.
- Signal threaded at: the scheduler read; `runNow` (a lapse returns false); scene summary; short-term; epistemic; ledger; arc summary; canon (`lapseAsEmpty`, because consolidation calls it from boundary work); curator (the epoch signal); expansion `generate` (one token, `signal: run.signal`).
- Director: `callDirector(prompt, signal)`. At `DIRECTOR_TIMEOUT_MS` the controller aborts with a `TimeoutError` reason, so the host request is cancelled rather than only raced. `index.ts` passes the signal to `callExtractionModel`.

**D6 as built**
- `extraction/degenerate.ts` (pure) refuses a reply when either holds:
  - the same trimmed line appears ≥ 4 times;
  - the token positions covered by 8-grams occurring ≥ 4 times exceed 50 % of the reply. The reply needs ≥ 32 tokens to be scored.
- The n-gram floor is 4, not 2, because two deltas quoting one long line of evidence are legitimate (M22's control).
- `sharedRead` refusal order:
  1. `finish:"length"` → `truncated response`;
  2. more than `MAX_DELTAS_PER_READ` → `oversized response`;
  3. the character heuristic, **only when finish is `unknown`** → `oversized response`;
  4. degenerate → `degenerate response`.
- Each refusal takes the existing one-re-ask path and is refused whole, with the raw reply in the audit.
- Scene summary, short-term, arc summary and canon call with `refuseIncomplete`, so a truncated or looping summary is not stored. The scene is still counted, as an empty summary always was.
- Epistemic and ledger get the `maxTokens` table but no refusal.

**Tests** (+67): `callBudget.test` (5), `degenerate.test` (7), `stHost/modelReply.test` (23), `sharedReadFinish.test` (6), `runOwner.abort.test` (8), `scheduler.test` (+4), `client.test` (+11), `talkControl.test` (+2), `runtimeManager.test` (+1). Mocks of the seam moved to the `ModelReply` shape in 8 test files, and `authority.review.test` now mocks `callExtractionReply`.

**Mutations**: `test/findings/mutations/v24-03-seam.txt`, **27/27 killed**. That covers the plan-table rows in this slice: lapse short-circuit, window abort, config≠transport, TC-only samplers, director abort, finish_reason, and the loop detector at ∞ ×2. Three gaps from the first sweep were fixed by adding cases:
- M1's retry bleeding into the transport control;
- M15, the TC clean-up, had no case;
- M22, the n-gram floor, had no shared-quote control.

The three other `refuseIncomplete` call sites have no per-site case.

**Census**: notes only. `ExtractionScheduler.pump` stays `partial`, with the abort and the no-pause-on-lapse recorded; `pumpHeavy` stays `partial`; `TalkController.ensureDecision` stays `checked`, with the director abort recorded. `ownership.guard.test` did not ask for a new row. **Fault matrix unchanged**: the `aborted` column is left to integration (see NOT done).

**Gates** (worktree root, `node_modules` junctioned to the main checkout's)

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 |
| `npm run typecheck:test` | 0 |
| `npm run lint` | clean |
| `npm run debug:typecheck` | 0 |
| `npm test` | 195/195 suites, 2986/2986 tests; findings ledger 2 open / 48 settled |
| `npm run build` | compiled, 2 size warnings; manifest `bundle 8f221181094a`, `ST unknown` (worktree not under ST's extension path) |
| architecture budgets | manager 730/740 (unchanged); extractionCoordinator 526/620 (+6); memoryCoordinator 610/620 (+5); stagecraft 560; expansion 298 |

Not run: `test:debug`, `test:release`, `test-storybook` (the Storybook STAPI mock changed but no story was re-run).

**Deviations**
- The seam's logic lives in the new pure `stHost/modelReply.ts`, and its cases are in `modelReply.test.ts`: "CC profile sends no temperature/top_p", the config≠transport rows and the preflight. The plan named `connectionProfiles.test.ts` / `client.test.ts`, but `connectionProfiles.ts` imports the top-level-await host modules and cannot load in jest.
- `extractData:false` drops ST's TC clean-up (H17), so the seam re-applies it from the profile's instruct template. This is an approximation: bare `stop_sequence`/`input_sequence` with no `{{name}}` substitution and no `wrap` newline, so a template using `{{name}}` in its input sequence is not truncated at a leaked user turn.
- `classifyHostFailure` departs from the plan's "any other wrapped → transport" in two places:
  - config causes wrapped inside the `try` (H16) are `config`;
  - an unrecognised **unwrapped** error is `config` too, because it was thrown before any request left.
- `finish` for llama.cpp is read from `stop_type`/`stopped_limit` (H18). Those field names are upstream shape, not read from source here; until confirmed live, `unknown` keeps the character heuristic as the fallback.
- A lapse is journaled by the scheduler through `noteLapse → noteRecap`, not as an audit row. A lapse in a pass called directly (a debug handle or slash command) propagates as `ModelCallError("lapsed")`, except canon and `runNow`.
- Only the scheduler calls `release()`. Coordinator sites rely on the registry's cap and `bump()`; an unreleased entry can only abort a request that already finished.
- The director aborts with a `TimeoutError` reason, so the breaker can count it later.
- Summary refusals (`refuseIncomplete`) are not journaled with the raw reply: the plan's "journaled with the raw reply" holds for shared-read audits only.
- The ratios the plan left unstated (canon, epistemic/ledger, curator) start at 0.25, recorded as starting values.
- The mutation file is named `v24-03-seam.txt`, as the build instruction asked.

**NOT done**
- Live gate 2 (abort on rollback mid-read, ×2), plus the live confirmations of H5 (llama-server slot idle after our abort) and H18 (llama.cpp finish fields): **NOT green**, because no backend was available.
- The `aborted` fault-matrix column (9 cells; counts 81 → 90). It touches `faultMatrix.json` and its guard, which other builders also edit, so it is left to integration. Citations available from this slice:
  - extraction: `scheduler.test.ts` "an aborted read is not retried and records no error";
  - director/judgeRing: `talkControl.test.ts` and `epochAbort.review.test.ts`.
- Signal threading in `runMemorizeBacklog` (wedges builder's region) and in copilot authoring, which is author-interactive and holds no guard.
- D3 is wave 2: breaker, deleting `pauseExtraction`, pipeline/Repair, events. `pauseExtraction` still exists, but a lapse can no longer reach it.
- D5 is the budget builder's: `readProfileContextLimit` is not built here, although H12 is verified.

### Breaker + failure classes (worktree build, 2026-09-24)

Built on master `a7cb6c1` (seam + abort + D6 and the wedges merged), in parallel with wave 2 part B (D5 wiring) and part C
(injector/persistence/mirror/startup identity). Scope: D3 whole, the fault-matrix section (the `aborted` column plus E8's 10th
package) and the D3 census notes. Machine gates only: **no backend, so no live gate ran; live gates 1 and 6 are owed and NOT green.**

**As built**
- `extraction/breaker.ts` (pure, in memory, never persisted): `Breaker` keyed by profileId. Closed → open when the scheduler's
  retry loop (3 attempts) ends in transport/timeout; `beginProbe` → half-open; `probeFailed` → open one backoff step later
  (`BREAKER_BACKOFF_MS` 5 s / 15 s / 60 s / 300 s cap); `close`. Also `PROBE_PROMPT` ("Reply with exactly: PONG"),
  `PROBE_MAX_TOKENS` 8, `PROBE_TIMEOUT_MS` 10 s, `DANGLING_PROFILE_DETAIL`, `ExtractionHealth`, and `failureClass(error)`
  (`lapsed | transport | config | bug`, read structurally from `name === "ModelCallError"` + `kind`, timeout counts as transport).
- `extraction/client.ts` `probeModel(profileId)`: the PONG probe through the seam with its own `AbortSignal.timeout`.
- Scheduler (`extraction/scheduler.ts`):
  - `SchedulerHost.pauseExtraction` is gone; the host gains `noteHealth`, `probeModel`, `profileExists`.
  - `pump`/`pumpHeavy` hold while `breakerOpen()`. One `noteFailure` classifies every catch:
    - lapsed: journal line (unchanged).
    - transport: trip the breaker (journal "memory model not answering; reads held"), re-queue the job only when its epoch is
      still current (P1 re-merges into a held P1).
    - config: no retry (`runWithRetries` rethrows it at once), the job is dropped, `configProblem` set (the dangling-id
      detail when `profileExists` says so).
    - bug: sameWorld-guarded `lastError`/`lastHeavyError` + journal "extraction failed: <reason>".
  - A transport failure with no profile id to key a breaker on is recorded as an error, never held (it would loop).
  - `onBoundary` clears a bug `lastError` before scheduling and re-evaluates the dangling id (without clearing other config
    problems).
  - P1 merges are bounded by `CADENCE_WINDOW_MAX` (to − 24 + 1).
  - `probe(trigger)`: while closed it only pumps; while open it runs one half-open probe (joined by concurrent triggers) →
    success closes and pumps both queues; config closes the breaker and becomes the config problem; anything else re-opens
    one step later and re-arms the timer. `reevaluateConfig()` for profile events; `dispose()` clears the timer.
  - `health()` is the in-memory reading; `getSnapshot()` never carries it.
- Runtime: `RuntimeManager.pauseExtraction` deleted; `attachScheduler`, one-line `retryExtraction()` → `scheduler.probe("player")`;
  the snapshot builder takes `extractionHealth` from the live scheduler (`RuntimeSnapshot.extractionHealth`).
  `ExtractionCoordinator.pause` deleted (4 lines; part B's file).
- `runtime/breakerWatch.ts`: host-event entries, subscribed in `runtime/index.ts`: `ONLINE_STATUS_CHANGED` → probe (trigger
  only), `CONNECTION_PROFILE_UPDATED` for our id → re-evaluate + probe, `CONNECTION_PROFILE_DELETED`/`CREATED` → re-evaluate.
  `stHost/events.ts` gained the four keys, cited to 03-H9/03-H10.
- Heavy jobs share the breaker: the curator (`runCuratorPass`) and expansion (`generate`) rethrow a transport failure after
  their owned failure write, so the scheduler sees it. The director consults `breakerOpen()` and takes the rules pick
  (`source: "fallback"`) without calling the model.
- Pipeline: `derivePipelineStatus(extraction, expansion, health)`.
  - transport → `stalled-rechecking`, `TRANSPORT_PLAYER_TEXT` ("The memory model is not answering — the story will catch up
    when it does."), detail = the provider message, `nextAction: "retry"`, `retryable: true`.
  - config → `not-configured` + `repair`.
- Repair: a config health is the `memory-model` step with its detail ("The selected memory model profile no longer exists"
  for a dangling id).
- UI: `PlayerOverview` renders `#so-pipeline-retry` "Try again" only for `retryable`, wired in `DrawerTabs` to
  `manager.retryExtraction()`. Story `Drawer/PlayerOverview/ModelNotAnswering` (+ `CatchingUp` asserts no Try again).
- `scripts/debug/so-ui.mts assert-player-clean` now also collects `PLAYER_RECOVERY_CONTROLS` (`#so-pipeline-retry`,
  `#so-memorize-stop`) on every surface and tab, returns them as `recoveryControls`, and fails on a label that carries a
  forbidden needle or internals (`recoveryControlFindings`).

**Tests** (red first: the 16 breaker cases 15 red / 1 green before the scheduler change; pipeline/repair 5 red; the director
case red): `scheduler.breaker.test.ts` (17), `breakerWatch.test.ts` (5), `extractionEnabled.guard.test.ts` (3, source guard +
synthetic offender + read/toggle controls), `abortedCall.review.test.ts` (8), `pipeline.test.ts` (+5), `repair.test.ts` (+2),
`talkControl.test.ts` (+2), `extrasLegacy.test.ts` "hydrate carries no breaker, even from a blob that recorded one",
`so-ui.test.mts` (+2). Rewritten for the new contract: `schedulerClear.review.test.ts` (a failing job is journaled, not a
pause), `scheduler.test.ts` (the transport control now opens the breaker).

**Fault matrix** (`test/findings/faultMatrix.json` + `faultMatrix.ts`): counts **55 covered / 10 partial / 16 na / 0 todo of
81 → 70 covered / 10 partial / 20 na / 0 todo of 100**, deliberately.
- New shape `aborted`: extraction, expansion, memory, scene, stagecraft, lore and judgeRing covered; effects and persistence
  `na` ("performs no model call").
- New package `hostDeletes` (E8, mirror reaper): 7 covered, `duplicateCompletion` partial (no test delivers one deletion
  twice), `persistFailure` na (the reaper persists nothing), `aborted` na.
- `extraction|backendUnavailable` partial → covered, citing "a dead profile never writes extraction.enabled and resumes on
  probe success".

**Census** (`ownership-sites.json`): new row `ExtractionScheduler.runProbe` `local`. Notes rewritten or extended on
`ExtractionScheduler.pump` (partial; the pause is gone, the three classes), `pumpHeavy`, `ExpansionCoordinator.generate`,
`StagecraftCoordinator.runCuratorPass` (the transport rethrow) and `TalkController.ensureDecision` (the breaker consult).

**Mutations**: `test/findings/mutations/v24-03-breaker.txt`, **28/28 killed**, each by its own case(s): 26 jest mutants via
`.debug/mut-breaker.mjs`, the so-ui recovery-copy mutant, and Storybook M-SB1 (Try again never rendered). Plan-table rows: no
install-wide write (M1, plus M2 on the scheduler side), breaker resumes (M3), breaker not persisted (M16), dangling id →
Repair (M11/M12), director (M17).

**Gates** (worktree; `node_modules` is a symlink to the main checkout's)

### Budget wiring + wedge follow-ups (worktree build, 2026-09-24)

Wave 2 part B, built on master `a7cb6c1` (branch `worktree-agent-a952e275a67994306`), in parallel with part A
(breaker, `pauseExtraction` removal, pipeline/repair/events) and the injector/persistence agent. Scope: D5
wiring, D6's `maxTokens` table at the sites the seam did not switch, the wedges builder's two merge follow-ups,
the three uncovered `refuseIncomplete` sites, and the privacy addendum. Machine gates only: **no backend, so no
live gate ran; live gates 3 and 4 are owed and NOT green**, as are live gate 6's Stop half and the H5/H11
live confirmations.

**As built**
- **Counting (decided).** `extraction/tokenMeter.ts` (pure): `createTokenMeter(countAsync?)` keeps a per-call
  `Map`; `prime(texts)` counts each distinct text once with the injected async counter (a throw or a non-finite
  count keeps the estimate); `count(text)` is the sync counter the budget modules take, reading the map and
  falling back to `estimateTokens` (the repo's existing `CHARS_PER_TOKEN_ESTIMATE` = chars/4, now exported from
  `callBudget.ts`, which `maxTokensForInput` also uses). `RequestBudget = {contextLimit, meter}`. The host half
  is `runtime/requestBudget.ts` `requestBudget(profileId)` = `readProfileContextLimit` + a meter over ST's
  `countTokens` (03-H11: main-API tokenizer, so every count is an estimate). No pure module calls the host.
- **Shared read tail-fit.** `runSharedRead` fits the window before anything else when `client.budget` is set:
  overhead = the prompt rendered with the full scope and an empty transcript, per-message cost = the widest
  `[index] speaker: ` prefix, `tailFit` under `inputBudget(limit, maxTokens ?? 512)`. The audit gains
  `budget {contextLimit, inputBudget, maxTokens, tokens, overBudget?}`, `trimmedFrom` and `truncated`; its
  `window` is the window actually sent, so evidence is screened against it (a delta quoting a trimmed message
  is "evidence not in window"). A prompt that leaves no room sends the window unfitted and records
  `overBudget` (never fail closed). Wired for every P0/P1 read: the scheduler (via `SchedulerSettings.budget`,
  filled in `runtime/index.ts`), `runNow`, both memorize passes.
- **Memorize backlog.** `extraction/backlogPlan.ts` (pure) `planBacklog` packs the chat with `chunkMessages`
  (the chunker gained an optional `maxMessages` cap) and returns the windows plus `preflight {requests, tokens}`
  (windows + 1; tokens = every window + the full pass capped at the budget). `memorize:window` reads send the
  planned windows as-is (`acceptedDeltas: []` unchanged); `memorize:full` is tail-fit by the shared read and
  records `trimmedFrom`. `windowSize` survives only as a message cap for the debug handle and tests; the default
  is budget-only. One meter per backlog run, so each message is counted once.
- **Scene summary.** `memory/sceneSummary.ts` (pure): `sceneRangeFrom(derived, to)` = the newest
  `scene_summary` derived range's `to + 1`, else 0, never past `to`; `summarizeScene` maps each chunk that fits
  `inputBudget(limit, sceneSummary cap)`, then reduces the "Part N:" summaries with the new
  `buildSceneReducePrompt` (again, up to depth 4, then tail-fit), asking `stillOwns()` inside the loop before
  every call; a refused chunk yields no summary. `runSceneBreakPass` spans `[sceneStart(to), to]` (new
  `MemoryCoordinator.sceneStart`), mints its guard over that whole range before the count, and stores ONE entry
  and ONE derived record for the range; chunk summaries are never stored.
- **Short-term.** `fitShortTerm` tail-fits the newest messages under `inputBudget(limit, shortTerm cap)` with the
  previous summary in the overhead; `maxTokensFor("shortTerm", fit.tokens)`; the derived range is
  `[fit.from, window.to]`, so `shortTermSummaryEnd` keeps its meaning.
- **maxTokens (item 5).** Checked: the seam had switched every site (`maxTokensForInput`); scene summary and
  short-term now use `maxTokensFor(family, measured tokens)`. Epistemic, ledger, arc, canon, curator unchanged.
- **Preflight.** `extraction/preflight.ts` (pure): `preflightNeeded` (N > 3 or T > 50 % of the limit) and
  `preflightMessage` ("N requests, about T tokens to <profile>. Send them?"). Host: `confirmPreflight` in
  `runtime/requestBudget.ts` (profile name from `listConnectionProfiles`, `showConfirmPopup` "Send"/"Cancel").
  Manual paths: `manager.memorizeChat()` (drawer "Memorize chat", `/so-mem backlog`, `/cp memorize`) and
  `runExpansionNow(undefined, true)` (`/cp expand` without a response, drawer "Generate the road ahead"). The
  backlog asks after planning and before anything is sent or `running` is set; a cancel sends nothing and
  writes nothing. Expansion counts every variant plus the critic. The debug handles (`runMemorizeBacklog`,
  `runExpansionNow(debugResponse)`), scenarios and every automatic pass never prompt.
- **Capabilities read-out.** `CapabilitiesGroup` gained `memoryModel` → `#so-context-limit` ("Memory model
  context: 98,304 tokens (from its preset) · up to 87,962 per read" / "(default: <reason>)"), also in the
  bug-report copy; `index.tsx` reads it with `readProfileContextLimit` for the selected profile.
- **Wedge follow-ups.** The backlog's model calls carry `anySignal([stop.signal, read.signal])`
  (`utils/signals.ts`), so Stop and a mutation inside the whole-chat window cancel the request in flight (the
  guard is released in `finally`). A player's Stop is `backfill.stoppedNote` (present only when stopped),
  rendered neutrally as `#so-memorize-note`; `lastError` (`#so-memorize-error`, red) is kept for edits, story
  updates and real failures. Stories `PlayerStopsMemorizing` / `MemorizeStopped` updated, `MemorizeFailed` added.
- **refuseIncomplete per site.** `refuseIncomplete.review.test.ts` drives the real client through a fake
  `finish:"length"` reply at the short-term, arc and canon sites (each with its stop control).
- **Privacy.** `docs/plans/v2.3/privacy-report.md` gained a "v2.4 addendum" table; the v2.3 text is untouched.
- **Census.** New row `src/extraction/tokenMeter.ts#createTokenMeter.prime` (`local`); notes extended on
  `runMemorizeBacklog`, `runSceneBreakPass`, `runShortTermCompaction`. Statuses unchanged. Fault matrix untouched
  (part A owns `faultMatrix.json`).

**Red first.** `budgetWiring.review.test.ts` before the coordinator wiring: 9 of 11 failed (the two that passed
were the edit-discard case, which the old detecting-window guard also satisfied, and the under-threshold
control). `memory/sceneSummary.test.ts` failed to load (module absent). `sharedReadBudget.test.ts`,
`preflight.test.ts`, `refuseIncomplete.review`, `expansionPreflight.review` and `requestBudget.test` were written
after or with their code; their red is evidenced by the mutants below, not by a first run.

**Mutations** (`test/findings/mutations/v24-03-wiring.txt`): **26/26 killed** (24 jest, 2 Storybook), including
the plan row "memorize:full never exceeds the budget and records trimmedFrom" on the pure read and on the real
backlog pass (W1/W2/W7), Stop reaching the in-flight request (W10), Stop as a note not an error (W11, SB1), the
check inside the map loop (W12), and the three `refuseIncomplete` sites (W17–W19).

**Deviations**
- Estimator is the existing chars/4, not 3.5.
- The budget rides `ExtractionClientOptions.budget` / `SchedulerSettings.budget` (one type line in `scheduler.ts`,
  one field in `runtime/index.ts`), so part A's `pump` line is untouched.
- Summary passes budget against the table's CAP (1024) because their `maxTokens` depends on the measured input.
- The scene summary's `evidence` stays the detecting window's text, not the whole scene (metadata size).
- Existing tests adjusted, not weakened: `backlogOwnership` settle 8 → 20 microtasks (planning adds a count
  await before the first read), its state gained `visitedAnchors` (the overhead prompt renders canon-lite), and
  "Stop keeps applied windows" now asserts `stoppedNote` + `lastError: null`; the `extractionOwnership` memory
  double gained `sceneStart`; the `runtimeManager.test` STAPI mock gained `readProfileContextLimit`;
  `slashCommands.test` asserts `memorizeChat`.
- A backlog planning failure now ends through `endBacklog` with `lastError` (there was no planning step before).
- "Generate the road ahead" in the drawer also asks first (the same author action as `/cp expand`).

**Gates** (worktree root, `node_modules` junctioned to the main checkout's)

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run typecheck:test` | 0 errors |
| `npm run lint` | clean |
| `npm run debug:typecheck` | 0 errors |
| `npm test` | 202/202 suites, 3068/3068 tests; fault matrix 70/10/20/0 of 100; findings ledger 2 open / 48 settled |
| `npm run test:debug` | 221 tests, 220 pass, 1 skipped, 0 fail. Before the first build it failed 1 (`so-run-header` read a stale worktree `dist/manifest.json`); green after `npm run build` |
| `npm run build` | compiled, 2 size warnings; manifest `bundle 850e881b06a2`, `ST unknown` (worktree path) |
| Storybook | `storybook:build`, `http-server .sb-static -p 6006`, `test-storybook --index-json`: 32 suites, 200/200 (+1 `ModelNotAnswering`); server killed afterwards |
| Architecture budgets | manager 731 → 728/740; extractionCoordinator 565 → 561/620; memoryCoordinator 610/620 (untouched); expansion 310 → 314; stagecraft 560 → 562 |

**Deviations**
- **Where the health lives.** The breaker/config reading lives in the scheduler and reaches the snapshot as
  `RuntimeSnapshot.extractionHealth`, not in `extras.extraction` as D3 says. Hydrate resets extras (and the load bumps the
  epoch before it hydrates), and the breaker is install-wide and must never persist, so an extras copy would be wiped on every
  chat load and would put breaker state on disk. The per-chat bug `lastError` stays in `extras.extraction.scheduler`.
- **Bug-class copy.** Pipeline `error` now has `needsSetup: false`, `nextAction: "wait"` (was `true`/`"repair"` with
  "Paused — open Repair."), because nothing pauses any more and the read is retried at the next boundary.
- **Config drops the job; only transport holds it.** A config failure needs the author, so holding would grow the queue until
  they act.
- **The P1 merge bound applies always**, not only while the breaker is open (the V25 rule "no read spans more than 24
  messages").
- **Census.** No row for `RuntimeManager.retryExtraction`: it writes nothing, and the guard refuses a row for a non-site. The
  plan's `delegate` row is replaced by the note on `runProbe`.
- **Heavy jobs.** Expansion also rethrows transport, beside the curator the plan named. `failureClass` is structural and
  lives in `breaker.ts`, so a coordinator under a test mock of `@extraction/client` still classifies.
- **The director only consults the breaker.** Its own timeout or transport failure does not count toward it.
- **Probe success is any `ok` reply**, not literally "PONG". A probe answered `config` closes the breaker and becomes config.
- **Aborted column, scene and lore.** They reach a model only through the judge, so they cite the judge-cancel case plus the
  consumer's world-moved case (`c1Surfaces.review.test.ts`), not a new abort case of their own.
- **hostDeletes.** `afterHostWrite` cites the refused-delete case; `duplicateCompletion` is partial.
- **Minimal edits to other builders' files.** `runtime/index.ts`: scheduler host lines, `attachScheduler`, one subscription,
  the director's `breakerOpen`. `extractionCoordinator.ts`: `pause` deleted, nothing else.

**NOT done / NOT green**
- Live gate 1 (backend pause/resume ×2) and live gate 6 (`assert-player-clean` in player mode with Try again visible ×2,
  archived): not run, no backend. Both **NOT green**.
- H9 (`ONLINE_STATUS_CHANGED` is main-API only) makes it a trigger and never proof; its live behaviour is unmeasured.

| `npm test` | 205/205 suites, 3070/3070 tests |
| `npm run build` | compiled, 2 webpack size warnings; manifest `bundle d9ab9e7c8644`, `ST unknown` (worktree path) |
| Storybook (`storybook:build`, `http-server .sb-static -p 6116`, `test-storybook --index-json --url http://127.0.0.1:6116`) | 32 suites, 203/203 (+4: `MemorizeFailed`, `StatesTheMemoryModelLimit`, `SaysWhenTheLimitIsTheDefault`, `NoLimitRowWithoutAProfileRead`); server killed after |
| architecture budgets (effective lines) | manager 736/740 (+5); extractionCoordinator 581/620 (+16); memoryCoordinator 612/620 (+2); expansion 320 (+10) |

Not run: `test:debug`, `test:release` (it rewrites `dist/manifest.json`).

**NOT done / NOT green**
- Live gate 3 (`memorize:full` on a ≥ 300-message copy, every captured request ≤ the reported `inputBudget`,
  `trimmedFrom` on the full pass, Stop mid-run) and live gate 4 (both wedges live): owed, no backend.
- The counts are main-API tokenizer estimates (H11) and the 10 % margin is unmeasured; a preset `max_length`
  above the server's real `n_ctx` still overstates the budget (plan §Risks).

**Open questions**
- `sceneRangeFrom` returns 0 when no scene was summarized yet (the plan's "else 0"), so the first scene break in a
  long chat that took a story mid-way summarizes the whole history automatically (map/reduce, N requests, no
  preflight because it is automatic). Cap the first scene at the story's first boundary instead?

### First scene starts at the story's start (worktree build, 2026-09-24)

Built on master `a169dc4` (branch `worktree-agent-a8f250b6544aa31bb`). Answers the open question above (decided): the first
scene starts where the story's play starts in this chat, not at 0. History before it is read only by the explicit
"Memorize chat" backlog, which has the preflight.

**Anchor (why a new field).** No existing value names the story's start message. `loadStory` leaves the engine at
`lastMessageId -1` / `checkpointStartedMessageId -1` until the first boundary; boundary 0's `before` is that same `-1`
state; the first boundary's context is capped out of a 200-entry log, rolled back with it, and moved by every transition;
`visitedPath` holds checkpoint ids, not messages. So ONE optional field in the v4 blob (no version bump, X1):
`extras.memory.storyStart?: number`.
- **Value.** The player's last message when the story is activated in this chat (`playerTurnIds(chat).at(-1)`, the
  existing `agencyRecovery` helper), else 0. So a fresh chat whose player has not spoken keeps every greeting (a fresh
  group posts several), and a long chat starts at the exchange the story picked up.
- **Set** by `RuntimeManager.loadStory` on activate only (`MemoryCoordinator.markStoryStart()`); a hydrate never re-marks.
- **Restart** re-anchors it: `restartStory` drops the persisted runtime and activates, which rebuilds the extras.
- **Rollback** before it clamps it to the rollback point (`reverseMemoryState`). A branch is
  not handled specially: the value travels with whatever blob the branch copies, and the range never starts past `to`.
- **Range.** `sceneRangeFrom(derived, to, storyStart)` = the later of (newest `scene_summary` end + 1) and `storyStart`,
  never past `to`.
- A chat saved before this has no field and keeps the old start (0). Nothing can be inferred for it: the start message
  was never recorded.

**Red first.** `src/runtime/storyStart.review.test.ts` (real `RuntimeManager` over a mocked host, 300-message chat) and
three `sceneRangeFrom` cases in `memory/sceneSummary.test.ts`, run before the code: 8 failed, all for the reason under
test (`from: 0` where `298`/`338`/`200` was expected); the fresh-chat control passed. Cases: "a story imported into a chat
with prior history summarizes only from the story's start at its first scene break", "control: a later scene still starts
after the previous summary", "control: a fresh chat whose player has not spoken yet still starts at 0, greetings included",
"a reopened chat keeps the start it recorded", "restart re-anchors the story's start", "a rollback before the story's
start clamps it".

**Mutations** (`test/findings/mutations/v24-03-wiring.txt`, "First scene starts at the story's start"): **7/7 killed**:
range ignores the start (S1), activation never records it (S2), chat end instead of the player's last message (S3),
re-marked on hydrate (S4), rollback does not clamp (S5), sanitizer drops it (S6), start hides the previous summary (S7).

**Gates** (worktree root, `node_modules` symlinked to the main checkout's)

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:test` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run debug:typecheck` | exit 0 |
| `npm test` | 213/213 suites, 3188/3188 tests; fault matrix 70/10/20/0 of 100; findings ledger 2 open / 48 settled |
| `npm run build` | compiled, 2 webpack size warnings; manifest `bundle e770c56cbbd0` |
| architecture budgets (effective lines) | manager 733/740 (unchanged); memoryCoordinator 612 -> 615/620 |

Ownership census untouched: `markStoryStart` is synchronous, so it is not a write-after-await site. Fault matrix untouched.

**NOT run / NOT green**
- No live gate (no backend). The live check that proves it: import a story into a copy of a long chat (>= 300 messages,
  lane), play to the first scene break with the real memory model, and read the new `scene_summary` derived record's
  `range.from` (`so-state current` / `getSnapshot()`), expected = the player's last message index at import, with a
  captured-request count for that pass equal to the scene's chunks rather than the whole history's. Owed.

**Deviations / notes**
- `shortTermSummaryEnd` also starts at -1, so short-term compaction fires at the first boundary of a long chat. It is
  tail-fit (one bounded request), so it is left alone here.

### Live gates (2026-09-24)

Run on lanes 1 and 2 only (`st-lanes`, ports 8101/8102, group `1759606632088`), real model: Artemis 31B Q4_K_M on the
RunPod pod behind the main session's tunnel `127.0.0.1:18080` (llama-server, `LLM_PARALLEL` 4, `--kv-unified`, n_ctx
196608 total). Extraction profile "Story Orchestrator Memory RunPod" (preset "Artemis Extraction", `max_length` 98304 →
`inputBudget` 87961). No `debugResponse` anywhere.

**Build.** Trials ran on `aa1d673f678f` (master `5eb1872`). Every archived batch ran on **`9b70d79e3b2a`** (master
`1c2785f`, the timeout fix below, `builtAt` 2026-09-24T20:13:59Z), confirmed on both lanes after `st-session reload`
by hashing the served `dist/index.js` in-page. `so-run-header capture` before and `diff` after every batch: 0
differences, 0 blocking, on both lanes, every time (`*/lane*-run-header-{pre,diff}.json`).

**Fixtures** (`test/scenarios/`, generated from one readable source and schema-validated, evals compiled first):
`live-v24-03-breaker.json`, `-abort.json`, `-memorize.json`, `-wedges.json`, stories `live-v24-03.story.json` and
`live-v24-03-stub.story.json`. Each installs an in-page recorder on `/api/backends/*/generate` (kind, timing, outcome,
llama `timings` / `tokens_evaluated`) and removes it at the end. Gate 1's dead endpoint is the extraction profile's
`api-url` set IN MEMORY to `http://127.0.0.1:9` (never saved; the original sits in `localStorage` so the next run's first
step heals a crashed run, which trial 2 proved). Boundaries that must not call the main model are `/sendas` replies.

Records: `test/journeys/records/v2.4-plan03/` — `A-breaker-abort-wedges/`, `B-breaker-abort/`, `C-memorize-fixture-timeout/`,
`D-memorize/`, `E-J3-J4/`, `trials/` (every pre-batch run, including the ones that found the defects) and
`measurements.txt` (direct llama-server measurements: H5, prefill, E1).

| Gate | Result | Runs (×2 consecutive, one lane) |
|---|---|---|
| 1 breaker pause/resume | **green** | B lane 1 run1+run2 (also A run1+run2, on the story before its fix below) |
| 2 abort mid-read | **NOT green**: abort, lapse, control and the applied-rollback re-read green ×2; the no-op-rollback re-read is a **product defect (D2)**, red ×2 | B lane 2 run1+run2 (also A, trials 2-3) |
| 3 memorize under budget + Stop | **green** after the timeout fix (D1) | D lane 1 run1+run2 |
| 4 wedges | **green** | A lane 1 wedges run1+run2 |
| 5 J3, J4 `--strict` | **green** (J3 8/8, J4 5/5, cleanup clean, each ×2) | E lane 2 |
| 6 player-clean with Try again / Stop | **green** | Try again: B lane 1 ×2 (step 12); Stop: D lane 1 ×2 (step 9) |

**Gate 1 (breaker).** After boundary B the three read attempts hit the dead port (ST answers an upstream connect failure
with HTTP 200 and `{error:true, response:"…ECONNREFUSED…"}`, classified transport) and the breaker opened 1.66 s / 1.53 s
after the reply. While open: pipeline `stalled-rechecking`, "The memory model is not answering — the story will catch up
when it does.", `nextAction: retry`, no `lastError`, no audit written; `extraction.enabled` sampled every 200 ms live and
stored, 613 and 228 samples, never false. Try again (a real pointer click after a hit-test) sent the PONG probe 12 ms after
the click; it failed, the breaker stayed open and stepped to 15 s. A boundary while open added 1 / 0 held jobs (merge
bound). After the url was restored the **backoff** probe closed the breaker with no click: resume 14.97 s / 12.89 s after
the restore, 2.64 s / 0.56 s after the scheduled probe time (bound: one step + 12 s); journal "memory model answering
again — probe (backoff) succeeded"; the held cadence read then ran (windows 7-10 / 6-9, covering B).

**Gate 2 (abort).** Abort latency (MESSAGE_EDITED emit → fetch AbortError in the page) **1-4 ms**, reads 0.5-2.0 s into
flight. Control: a player line appended after the window did not abort; the read completed and its audit landed, no lapse.
Every abort journaled `extraction read lapsed: cadence` (detail `signal is aborted without reason`), no `lastError`, breaker
untouched. Applied case (a line consumed by a boundary that fired hall→yard): rollback applied, P0 `rollback:<id>` re-read
covering the edited line, started 501 / 733 ms after the edit, queue wait 727 / 550 ms (wall minus llama prompt+predict).
H5: the ST lane logs show `AbortError` raised from `text-completions.js:291` (socket close); llama side measured directly
(`measurements.txt`): a client closing at 4 s dropped `requests_processing` 1 → 0 within 0.59 s and the task stopped at
143 of 900 `ignore_eos` tokens. The in-fixture `/metrics` series is shared with the other lane and is context only.

**Gate 3 (memorize).** 330 synthetic rows, 455,438 chars. Windows 0-286 (estimate 87,728-87,744) and 287-330; full pass
44-330, `trimmedFrom: 0`, estimate 87,684; every audit estimate ≤ `inputBudget` 87,961. True prompt sizes
(`tokens_evaluated`) 88,630-88,646 / 14,536-14,552 / 88,640: the estimate runs about 1 % low, so the true size exceeds
`inputBudget` by 669-685 tokens and stays 9,100 tokens inside `contextLimit − maxTokens` (the 10 % margin absorbs it; the
fixture asserts the true size fits the context and records the estimate error). Backlog 253 s, 3/3. Preflight "3 requests,
about 189,986 tokens to Story Orchestrator Memory RunPod. Send them?". Stop pressed while window 2 was in flight: running
false in 66 / 63 ms, the request aborted 7 ms after the click, `stoppedNote` "Stopped after 1 of 2 parts…", no
`lastError`, processed 1 kept, rows 2 → 2 (run 1; run 2's first window yielded no rows, 0 → 0, so its rows check is
vacuous), `#so-memorize-note` shown, Memorize chat enabled.

**Gate 4 (wedges).** Expansion: `/newchat` while the stub's chain was generating aborted its in-flight request (in flight 189 / 155 ms when it rejected); on return the
entry was dropped, `expansion.scheduler.inFlight` false, player line "Following along."; the next boundary re-generated
the chain with no Regenerate click and it settled (`validated` / `needs_review`, 2 beats), player line released. Backlog:
a swipe of the last message while a memorize read was in flight cleared `running` in 161 / 143 ms with "Stopped: the chat
changed while memorizing", the read aborted, and Memorize chat started again without a reload (then cancelled).

**E1** (`LLM_PARALLEL` 2 → 4). Single request on an idle backend: decode **33.2 / 33.1 tok/s** at ~1k context, 29.9 at 6k
— above the 20 tok/s revert criterion, so no revert. Under the gate load: 14-31 tok/s per request at 1-2k context, 16.6-17.0
at 86-88k context; prefill 1,211-1,334 tok/s at 1-17k, 895 at 68k, 787-801 at 86-88k.

**Product defects**
- **D1 (fixed, `1c2785f`).** `callTimeoutMs(maxTokens)` ignored the prompt: a memorize window packed to the budget
  (88.6k tokens, ~117 s of prefill here) always timed out at 55,600 ms (`trials/trial-memorize.log`), so a long-chat
  backlog could never finish. Now `callTimeoutMs(maxTokens, inputTokens)` adds 2 ms per input token (a 500 tok/s prefill
  floor, measured 787-895 tok/s at 68-88k) and `callExtractionReply` passes `estimateTokens(prompt)`. Tests in
  `callBudget.test.ts` / `client.test.ts`; mutants 3/3 killed (`test/findings/mutations/v24-03-live.txt`); typecheck,
  typecheck:test, lint, `npm test` 213 suites / 3190 tests, build all green. Same hardware-assumption family as the
  plan's own risk; the floor is declared, not tuned.
- **D2 (open).** An edit inside an in-flight cadence read that rewinds nothing (no transition fired, nothing applied from
  the message) aborts the read, and **nothing re-reads its window**: `rollback.ts:95-105` (the no-op branch) quarantines
  but never calls `onApplied`, so the `rollback:<id>` P0 (`runtime/index.ts:90-92`) is not scheduled; the scheduler's
  lapse branch (`scheduler.ts:269-270`) only journals; and `cadenceTo` already moved past the window when the read was
  scheduled (`scheduler.ts:301-303`), so the next cadence read starts after it. The edited message is read again only if a
  stall reconcile happens to cover it (batch A run 1 and B run 2 did, incidentally). It predates plan 03 (the old read
  finished and was refused at the write edge, same loss), but gate 2 asserts the re-read. Options for the owner: schedule
  a P0 over the lapsed read's window from the scheduler's lapse branch when the lapse is a window mutation in the same
  world, or have the no-op rollback schedule `[messageId, lastMessageId]`. Not fixed here: it is a scheduling decision
  with a model-call cost, not a one-line correction.

**Findings (not gate failures)**
- **A memorize window drives three full-window passes.** A `memorize:window` audit that flags a scene break schedules the
  scene summary, epistemic and ledger passes over the detecting window (86.3-86.7k tokens each, ~112 s each, sequential,
  ~6 min: D run 1). They run beside the backlog (which is outside the scheduler): in `trials/trial2-memorize.log` the scene
  summary ran concurrently with the full pass, both ~88k prompts, the full pass timed out at 257 s, and the other lane's
  small reads timed out into its breaker (`trials/trial4-breaker.log`; that run's failure state held breaker health
  `transport: signal timed out`). The seeded history sat
  after the story's start, so `storyStart` did not bound it.
- **Memorize chat shows nothing for 62-85 s on a 330-message chat**: planning counts every message through ST's
  tokenizer before the preflight confirm or `running` appears.
- **Estimate low by ~1 %** at 88k (above), inside the margin.

**Fixture fixes found in trials** (not product): ST's 200-with-error body read as success by the recorder; the story
description contained the player-forbidden needle "boundary "; `go` was an extractor quality, so a real read could fire the
transition and skip the next cadence read (now `go` is `source: "code"`, only `/cp set` moves it, and `pay_discussed` is
the read's quality); the journal was sliced by index, which a rollback's quarantine reshuffles (now filtered by `at`);
the preflight wait of 60 s was shorter than planning (`C-memorize-fixture-timeout/`).

### Live-found fixes: re-read on lapse, backlog serialization, fast preflight (worktree build, 2026-09-24)

Built on master `f26b60a` in an agent worktree. Scope: the three decided fixes for the live gates' D2 defect and its two
findings. Machine gates and Storybook only: **no live gate ran in the worktree.** Live gates 2 and 3 are to be re-run on lanes
after the merge, and until then they stay as the Live gates record left them (gate 2 **NOT green**).

**1. D2: a read cancelled by a mutation is re-read (the scheduler).**
- `ReadOwnership` gains an optional `lapsed()`, which the real guard (`beginRun`) already has. When a shared read (not a
  `job.run`) lapses with reason `window` in its own epoch, the scheduler re-reads it. That covers both a thrown lapse (the
  abort) and a read refused at the write edge (it answered before the abort landed; checked after `applyExtractionAudit`).
  `epoch`, `chat`, `story` and `version` lapses are never re-read.
- **Waits for the rollback.** The mutation that lapsed the read started a rollback in the same sync block, and an applied
  rollback schedules its own P0 re-read only after several awaits (live: 501-733 ms). So the scheduler holds its light queue
  (`settling`) until `SchedulerHost.mutationSettled()` resolves, bounded at `REREAD_SETTLE_MAX_MS` (10 s). The host wires this
  to `RuntimeManager.rollbackSettled()`, the chain of rollbacks in progress (`Promise.allSettled`, +3 manager lines).
  `clearForNewWorld` drops the hold, so a new chat never waits on the departed chat's rollback.
- Then, if the epoch is still the one the read started in, it queues P0 `reread:lapsed` (`REREAD_LAPSED_REASON`) over the
  read's window re-clamped to the chat (`getChatWindow`). A window the edit deleted entirely is dropped.
- **Dedupe.** `mergeReread`: a P0 with a window that overlaps a queued P0 where either one is `reread:lapsed` merges into it
  (union window, and the rollback's reason wins). Because the queue is held until the rollback settles, an applied
  rollback's `rollback:<id>` is always queued before the re-read arrives, so the two never run as separate reads. The
  no-op rollback case, which the gate found, now reads its window exactly once. Nothing else is added: the cancelled read
  was going to be made anyway.

**2. The memorize backlog's scene passes run sequentially after their window.** This is the **"awaited before the next
window" option**, because it matched the wiring with the smaller change: the scene-break listener in `runtime/index.ts`
already builds the jobs.
- `emitSceneBreak(audit, collect?)` and `onSceneBreakConfirmed` listeners take an optional collector. The listener `place`s
  each job (scene summary, epistemic/ledger, WI curator) into the collector when one is given, otherwise into the scheduler
  as before.
- `applyAudit` takes `sceneWork` (last parameter), and `memorizeWindows` passes one collector. After each window, and after
  the full pass, `runSceneWork` awaits each collected job in turn, asking `read.stillOwns()` (chat token + Stop) before each
  one.
- A pass failure other than a lapse is logged, and the backlog goes on. It does not count toward the breaker: that path is
  the scheduler's, and the next window's own failure reaches `lastError` if the model is really down.
- Automatic passes outside the backlog are unchanged.

**3. Preflight answers fast.**
- With a `confirm` (the manual paths), `runMemorizeBacklog` first plans on an estimate-only meter (`createTokenMeter()` with
  no counter, the repo's chars/4 `estimateTokens`) and asks the confirm on that plan. A cancel still sends and writes
  nothing.
- After the confirm it writes `backfill {running: true, preparing: true}`, then counts exactly through ST (the real
  `requestBudget` meter) to pack the windows, then clears `preparing` with the real total.
- `MemoryBackfillState.preparing?` is new. The drawer's button reads **"Preparing…"** (disabled) while `running && preparing`,
  and the `Memorizing: n/N` line is hidden then. Stop stays available, and a Stop during preparing ends as "Stopped after 0 of
  N parts".
- New story `Drawer/DrawerTabs/MemorizePreparing`.
- `countTokensBatch` (`stHost/tokenizer.ts:10-12`) is a sequential loop over `countTokens` that returns one total, so it is
  **not faster** and cannot fill a per-message map. It was not used. This was read in the source, not measured.

**Red first.** Every new case except the controls failed before its code:
- `schedulerReread.review.test.ts`: 4 red / 3 green (controls) on the first 7 cases. The settle-bound, new-world,
  deleted-window and pre-epoch chat cases were added during the mutation pass (D2/D6/D8/D9 below).
- `backlogOwnership.review.test.ts`: 2 red, and the outside-the-backlog control green.
- `budgetWiring.review.test.ts`: 2 red.

New cases:

| Fix | Cases |
|---|---|
| D2 | "a read cancelled by an in-window edit with nothing to roll back is re-read"; "a read that finished but was refused at the write edge is re-read, clamped to the chat that remains"; "a window the edit deleted entirely is not re-read"; controls "a chat switch lapse is not re-read", "a chat change seen before the epoch moves is not re-read either", "an edit inside the window followed by a chat switch before the re-read is not re-read", "an overlapping rollback re-read is not duplicated", "a rollback re-read queued before the lapse absorbs it too", "a reply appended after the window lapses nothing and reads nothing twice"; "a rollback that never settles holds the re-read for the declared bound, not forever"; "a new world does not wait on the departed chat's rollback"; `fingerprintReconcile.review` "rollbackSettled answers only once the rollback in progress has finished"; `startupWiring.review` "the scheduler's lapse re-read waits on the manager's rollback" |
| backlog | "at most one model call is in flight from the backlog and its scene passes at any time"; "a switch during a scene pass runs no further pass and reads no further window"; control "a scene break outside the backlog is still handed to the scheduler"; `startupWiring.review` "a scene break the memorize backlog collects is handed back to it, not scheduled beside it" + control; `runtimeManager.test` "hands the memorize backlog's collector through to the scene-break listeners" |
| preflight | "the confirm is shown before any token count call, and the exact count runs only after it, while the run reads as preparing"; control "a cancelled confirm counts nothing and writes nothing" |

**Mutations** (`test/findings/mutations/v24-03-live.txt`, section "live-found fixes"): **20/20 killed.** 19 jest mutants via
`.debug/mut-live-fixes.py` (D1-D11, B1-B5, P1-P3), each killed by its own case(s) with the controls green, plus Storybook SB1
(the button never reads Preparing…).
- D6 (no re-clamp) survived the first pass: the pump clamps the window anyway. It was killed after the deleted-window case
  was added.
- P3 (preparing never cleared) survived the first pass. It was killed after the confirm case learned to read `preparing` at
  the first model call.

**Census / fault matrix.**
- `ExtractionScheduler.pump` stays `partial`, with the note extended (the re-read, the hold, the bound).
  `ExtractionCoordinator.memorizeWindows` stays `checked`, with a note on `runSceneWork`. `ownership.guard.test` asked for no
  new row.
- `extraction|aborted` stays `covered`, with three `alsoEvidence` citations to `schedulerReread.review.test.ts`. The counts
  are unchanged: 70 covered / 10 partial / 20 na / 0 todo of 100.

**Fixtures (no live run here).**
- `test/scenarios/live-v24-03-abort.json`:
  - The noop case now requires exactly one `reread:lapsed` audit covering the edited message, landed **before** the next
    turn. Step 8 reads it from the post-edit `schedulerIdle` snapshot; step 13 fails with DEFECT otherwise and names
    incidental covers.
  - The applied case fails if a `reread:lapsed` audit appears next to the `rollback:*` re-read (the merge).
  - The note is updated.
- `test/scenarios/live-v24-03-memorize.json` step 29 records `confirmMs` (click to popup) and fails over 10 s.
- Both files' evals are syntax-checked (`new Function`, 9 + 9).

**Gates** (worktree root, `node_modules` junctioned to the main checkout's)

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:test` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run debug:typecheck` | exit 0 |
| `npm test` | 214/214 suites, 3211/3211 tests; fault matrix 70/10/20/0 of 100; findings ledger 2 open / 48 settled |
| `npm run test:debug` | 221 tests: 220 pass, 1 skipped, 0 fail |
| `npm run build` | compiled, 2 webpack size warnings; manifest `bundle 3250b5ea1ca7`, `ST unknown` (worktree path) |
| Storybook (`storybook:build`, `http-server .sb-static -p 6231`, `test-storybook --index-json --url http://127.0.0.1:6231`) | 32 suites, 204/204 (+1 `MemorizePreparing`); server killed afterwards |
| Architecture budgets (effective lines) | manager 733 -> 737/740; extractionCoordinator 577 -> 598/620 |

**Deviations / notes**
- **Item 2's pass failures** inside the backlog are logged, not classified: they do not trip the breaker. The scheduler's
  classes apply to scheduled passes only.
- **The preflight's N and T are the chars/4 estimate**, and the exact packing can differ from them by a window. "A confirmed
  run sends exactly the requests it announced" holds in jest, where both meters estimate. Live, the gate-3 record measured the
  estimate about 1 % low at 88k tokens.
- **A persisted `preparing: true` is not scrubbed on hydrate.** Hydrate already forces `running: false`, and the UI reads
  `preparing` only while running, so it is inert.
- **The settle hold also delays unrelated P1 reads** queued during the rollback. That is at most the rollback's own
  duration (live 0.5-0.7 s) and at most 10 s.
- **`runtime/index.ts`'s listener** is tested through the real `startRuntime` with the listener and scheduler captured by
  spies.

**NOT run / NOT green**
- Live gate 2 (the noop re-read ×2, plus the applied-case merge) and live gate 3 (memorize with scene passes serialized,
  `confirmMs`, the Preparing state): not run in the worktree. They are owed on lanes after the merge, and gate 2 stays
  **NOT green** until then.

### Final live gates (2026-09-24, bundle `100696d1d4a0`, master `e836bc4`)

**Status: plan 03 live gates green ×2, each on or after the last change to the code it exercises.** The machine gates on master are green: typecheck, typecheck:test, lint, debug:typecheck, jest 3214/3214, and the build.

| Gate | Result | Bundle | Record |
|---|---|---|---|
| 1 breaker pause/resume | ×2 green | `100696d1d4a0` | `final-100696d1d4a0/*breaker*` |
| 2 abort mid-read + D2 re-read (`reread:lapsed` covers the edited message, merged with a rollback re-read) | ×2 green | `100696d1d4a0` | `rerun-fixes/2026-09-24T23-01-20-701Z-*abort*` |
| 3 memorize ≥300 messages + Stop + fast preflight (`confirmMs` 107 / 112) | ×2 green | `27d0f711bf9b` | `rerun-fixes/*memorize*` |
| 4 wedges | ×2 green | `100696d1d4a0` | `final-100696d1d4a0/*wedges*` |
| 5 J3 (8/8), J4 (5/5) `--strict` | ×2 green | `100696d1d4a0` | `final-100696d1d4a0/*J3*`, `*J4*` |
| 6 `assert-player-clean` with Try again / Stop visible | ×2 green | inside gates 1 and 3 | as above |

**Gate 3's bundle.** Gate 3 ran on `27d0f711bf9b`. The only change between that bundle and `100696d1d4a0` is plan 02's E3 journaling fix (`librarySave.ts`, the settings journal wiring in `runtime/index.ts`), which the memorize path does not reach.

**One red is archived, not hidden.** On `27d0f711bf9b`, abort run 2 failed at its first turn: `Generation still active after 300000ms`, before any step under test (`rerun-fixes/abort-run2-27d0f711bf9b-failure.json`). Lane 2 was running gate 3's ~88k-token memorize prompts on the same pod at the time, so the reading is a starved first turn. That reading is **not proven**. With lane 2 on the light E3 check, the gate went ×2 green on `100696d1d4a0`.

**Run headers.** These re-run batches were not wrapped in `so-run-header capture`/`diff`. The earlier plan 03 batches (section above) were, with 0 differences.

**Found and fixed by the live gates** (sections above):
- D1: the call timeout now scales with the prompt.
- D2: a lapsed window is re-read.
- Heavy passes are serialized behind the memorize backlog.
- The preflight answers on an estimate.

**E1:** `LLM_PARALLEL` 4 stays. A single request decodes at 33.2 tok/s, above the 20 tok/s revert line.

**Known, not fixed:**
- The token estimate runs about 1 % under true size. It stays inside the 10 % margin.
- Two parallel lanes that both send budget-sized memorize prompts starve each other's turns. That is a property of the shared test pod, not of one install.

### Follow-up: NPC reply writes into the previous chat (worktree build, 2026-09-25)

**Finding confirmed (code read on `96b4fe6`).** `EffectsApplier.fireNpcReplies` (`src/runtime/effectsApplier.ts:363-386`)
mints its run at `:371` and checks it at the loop top (`:373`), so the check guards the NEXT reply only. After
`await fireReply(reply)` (`:383`; an `llm` reply is `/trigger await=true <member>`, `:127`, a real generation) it wrote
`extras.lastSelfInjectionMessageId = lastMessageId()` (`:384`) with no check: `extras` is the entry chat's object and
`lastMessageId()` (`:130-133`) reads the OPEN chat. A switch during the last (or only) reply stamped chat B's index into
chat A, where `afterSpeak` later compares it with A's own messages (`:364`). The census row called the site `checked`
(the body has a check; the write after the await did not follow one).

**Fix.** One `if (!run.stillOwns()) return;` between the await and the write. The in-flight `/trigger` generation is
NOT cancelled: that is v2.5 plan 02 C1 step 2, measure-first, and was not built.

**Tests (red first).** `src/runtime/npcRepliesOwnership.review.test.ts`: the mocked host chat became mutable, and one
`llm` reply is fired with the ownership switched (and the open chat replaced by an 8-message chat B) inside the
`/trigger` call. Before the fix: `Expected: -1, Received: 7`. After: green. Control: an unmoved chat whose reply lands
records its own last message (`1`).

**Mutants** (`test/findings/mutations/v24-followups-npc.txt`): M1 check deleted, KILLED by exactly the switch case
(control green); M2 write moved above the await, KILLED by both the switch case and the control.

**Ledgers.** Census row `EffectsApplier.fireNpcReplies` note corrected (stays `checked`, now true of every write).
Fault matrix `effects|aborted`: `na` ("performs no model call", false for `/trigger`) -> `partial`, citing the switch
case + control; the note names the uncancelled generation as the open part. Counts: 75 covered / 10 partial / 25 na /
0 todo -> 75 / 11 / 24 / 0 (of 110).

**Gates (worktree, exact).**
- `npm run typecheck` exit 0; `npm run typecheck:test` exit 0; `npm run lint` exit 0; `npm run debug:typecheck` exit 0.
- `npm test`: 255 suites, 3693/3693 passed.
- `npm run test:debug`: first run 264 pass / 1 fail / 1 skipped, the fail being `so-run-header.test.mts` "the build
  half reads plan 08s nested manifest" (`extension.version is read`), because a fresh worktree has no
  `dist/manifest.json` before its first build. After `npm run build`: 265 pass / 0 fail / 1 skipped.
- `npm run build`: exit 0 (webpack: 2 warnings, both asset/entrypoint size limits, index.js 1.73 MiB).

**NOT run / NOT green: the live gate.** Owed on a lane with the real model, built on `test/scenarios/plan03a-llm-npc-reply.json`: a story whose checkpoint carries an `llm`
`npc_replies` `onEnter`; enter it, switch chats (`open-group` another group) while the `/trigger` reply streams, then
reopen the first chat and read `lastSelfInjectionMessageId` from its persisted blob (`so-state current`): it must not
hold the other chat's index, and an unswitched control run must record the reply's own id. ×2. Also re-run
`live-v4-turn-identity.json` to confirm the scripted branch is unchanged. Where the in-flight reply itself lands
stays unmeasured (C1 step 0).

**Live gate (2026-09-25, bundle e420eab0c646): green x2.** Lane 1 (ST :8101), group `1759606632088`, profile
`Artemis RunPod RP`, served bundle = manifest. New fixture `test/scenarios/live-v24-npc-switch.json` (sandbox, three
run-owned chats; no existing fixture switched chats mid-`/trigger`):
- Control, chat A: `activateCheckpoint('speak')` fires the `llm` `onEnter` reply (`/trigger` DM Narrator), answers
  `true`, and A records the reply's own id in memory and on disk (`lastSelfInjectionMessageId` 1 = last message,
  DM Narrator).
- Switch, chat B: the same activation; ~1.2 s into the `/trigger` generation (still generating, no save running)
  `openGroupChat` moves to chat C (4 messages, no story). `activateCheckpoint` answers `false`; B's extras object held
  when the reply started keeps `null` (never C's last id 4); on reopen B's persisted blob and rehydrated extras hold
  `null`. The in-memory read is the discriminating half (the pre-fix code wrote C's id there); the on-disk half is
  no-regression only, because `activateCheckpoint` persists only while it still owns the chat.
- Observed, not asserted (C1 step 0 measurement): **the in-flight reply lands in the chat that is open**: in both runs
  chat C gained the DM Narrator reply (5 messages on disk) although C plays no story. B stays at `start` on disk with
  `firedNpcReplies {}`, so the reply that never reached B is not counted there. This is the uncancelled generation
  (C1 step 2, not built).
- Regression x2 each, green: `live-v4-turn-identity.json` (boundaries 0/1/1/2/3, cp2 held at boundary 4 through the
  null-id mutation events), `plan03a-llm-npc-reply.json`.
- Run-header diff around the lane-1 batch: 0 differences. Records:
  `test/journeys/records/v2.4-followups/live-e420eab0c646/` (`-prerun` is a first green run before a reporting-only
  fixture change; not counted).
