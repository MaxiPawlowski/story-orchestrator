# SillyTavern Copilot (P3DRA) — 2026-10-14 harvest
meta: https://github.com/P3DRA/SillyTavern-copilot · head `7f8dcec` (single commit, v0.1.0 WIP, posted 2026-10-08) · **AGPL-3.0: ideas only, no code** · read: README, index.js (turn wiring, inject, bind, watcher, init), src/st/adapter.js, src/core/{pipeline,compressor,garbage}.js headers · skipped: panel UI, presets, spend, transfer/migrate, provider fallback internals · prior review: none (new repo)

## What it is / what changed
Narrator copilot for one-on-one chats. Per real narrator turn, inside the awaited prompt-ready hook: extractor (previous state + only unfolded messages -> one structured "moment") then composer (transcript + all visible extractions + lore + card + goals + previous note -> `<copilot>` note, 15–120 words), spliced into the outgoing prompt. Compressor merges a contiguous range of extractions on demand. Records live per message per swipe (`swipe_info[i].extra.copilot`), bound at MESSAGE_RECEIVED. OpenRouter key in the browser. Everything on-path: the narrator request waits up to `maxWaitMs` (default 60 s) for two model calls.

## How it works
- Generation-kind latch: `onGenerationStarted` sets `generationKind` = dry|quiet|impersonate|real (index.js:1176-1200); prompt hooks act only on `real` (index.js:1365-1380), because quiet prompts and `generateRawData` fire the prompt-ready events with `dryRun:false`, raw calls with no GENERATION_STARTED at all. Latch cleared at MESSAGE_RECEIVED, GENERATION_STOPPED, GENERATION_ENDED (index.js:3262-3274).
- Double-hook idempotency: TC fires `GENERATE_AFTER_COMBINE_PROMPTS` (string), CC fires `CHAT_COMPLETION_PROMPT_READY` (array); discriminates on payload type and keeps `injectedTokens` per generation token (index.js:1383-1404, 1437-1441).
- Inject twice: splice into the array/string AND `setExtensionPrompt` registry entry, cleared at the start of every real turn and at stop/end (index.js:1636-1648, adapter.js `registerNote`/`clearNote`).
- Bind-later: no assistant slot exists at prompt time, so the note is pending under a token and written onto `chat[last]` at MESSAGE_RECEIVED; re-armed if the arriving message is a user row (adapter.js `bindToMessage`).
- Swipe window: on a swipe the trailing assistant message being replaced is dropped from every input window (index.js:315-325); only the ACTIVE swipe's extractions feed the composer (index.js:353-362).
- Reroll: ask | always new | always reuse; reuse = zero model calls, copies extraction + note (index.js:1288-1296, 1466-1494). Optional old/new diff popup.
- Regenerate stash: ST deletes the old reply after GENERATION_STARTED, so the record is stashed into `chat_metadata` and folded into the new reply's history (index.js:1218-1262, 1857-1886).
- Compressor acceptance: output must parse in `<compressed>` and be strictly shorter than the inputs combined, else rejected (compressor.js:86-104); originals marked `compressedInto`, undo restores exactly (compressor.js:275-310).
- Refusal detector inspects only the opening and only short outputs, so in-scene "I can't" dialogue is not deleted (garbage.js:1-25, 168-190).
- Fetch watcher: wraps `window.fetch`, on `/api/backends/{chat,text}-completions/generate` during a `real` turn checks the note text is in the outgoing body and logs status/429 (index.js:2025-2110).
- One turn-wide deadline for extractor+composer, each stage gets what is left (index.js:1415-1420).

## Patterns for SO

### P1. Withhold the pacing hint and check-outcome block on quiet/impersonate — pattern · pacing/runtime · partial · value 3 · effort S
What: their rule is "only a real narrator turn sees the note" (index.js:1365-1380). Our state: `onGenerationStarted` withholds on `quiet|impersonate` (runtimeManager.ts:586-590) but `withholdTurnBlocks` only clears epistemic + checkpoint guidance (managerDelegates.ts:136, pacingCoordinator.ts:177-184). The pacing steering hint stays registered (pacingCoordinator.ts:133, key `story_orchestrator_pacing`), and so does `checkOutcome` (checkOutcomeHost.ts:7-10). Continuity note (stagecraftCoordinator.ts:490) and away notice (awayNotice.ts:44) already withhold. Effect: an impersonation (written as the player) is told to raise/lower tension: narrated-player steering against the agency policy; another extension's quiet summary reads our "Pacing:" line. Fit: no invariant conflict; thinking/inner voice untouched. Sketch: `withholdGuidance` also clears `PACING_HINT_EXTENSION_KEY`; `releaseStaleGuidanceHold` already re-runs `updateSteering`, which restores it. Decide checkOutcome separately (impersonate arguably should know decided outcomes; quiet should not). Jest: extend `pacingCoordinator.test.ts` withhold case.

### P2. Compaction acceptance: parse + strictly shorter than inputs — pattern · memory · absent · value 3 · effort S
What: compressor.js:86-104 rejects output not shorter than its inputs. Our state: `runShortTermCompaction` accepts any non-empty `summary` and REPLACES the rolling entry (extractionCoordinator.ts:409-432; only `refuseIncomplete` + ownership). A runaway or echoed summary (model restates the window, or appends previous + window verbatim) is stored and injected at depth 2 every turn. Fit: pure check, no conflict; aligns with the "derived artifact records inputs" rule (memory/derived.ts). Sketch: `summary.length < (previous?.text.length ?? 0) + fit.text.length` and under the short-term token budget, else keep `previous`, journal a `rejected` derived record. Their stronger "union merge: every fact must survive" is unverifiable cheaply; skip unless a judge use is added.

### P3. Swipe-back reuses the stored read instead of a new one — feature · extraction · absent · value 2-3 · effort M
What: per-swipe records; swiping back costs zero calls (index.js:1466-1494, records in `swipe_info[i].extra`). Our state: a swipe to a stored reply rolls back and recommits a boundary (turnBridge.ts:258-281), so the scheduler reads it again; no swipe-keyed audit cache (grep: no `swipe` in src/extraction, extractionCoordinator.ts). A21 (queue) covers in-flight swipes only. Sketch: key `extras.extraction.audits` also by `(messageId, hash(swipe text))`; on recommit of a known swipe replay the stored accepted delta through the normal boundary path (rollback ≡ replay holds since the audit is the same input). Key the cache by chat+story+path too (gotchas: RunToken cannot detect a stale cache). Low priority on local 3090.

### P4. Product-side "the block actually shipped" verification — test-idea · runtime/debug · partial · value 2 · effort S
What: fetch watcher greps the outgoing body for the delivered note, logs FOUND/NOT FOUND plus HTTP status (index.js:2025-2110). Our state: harness has it (`st-payload.mts`, `/api/backends/` wrapper per debug-scripts.md); the next-turn preview is composed from `INJECTION_REGISTRY` + ST blocks, not the bytes sent; warden applied = rendered reply, not body presence. Sketch: optional author-view row in `#so-next-turn` "last sent: N of M story blocks present" from a `GENERATE_AFTER_DATA` / body read (stHost module). Only if a live miss motivates it.

### P5. Swipe input window drops the reply being replaced — host-fact/test-idea · extraction · present (verify) · value 2 · effort S
Their bug T-R5-17: a swipe composer read the very swipe it replaced (index.js:315-325). Ours runs off-path after render and rolls back on swipe, so an extraction read cannot see the replaced swipe; but any pre-generation read on a swipe (lore select at `GENERATION_STARTED` via `onIntercept`, loreSelectTiming.ts:24-31) builds its scope while the old reply is still in `chat`. Test idea: jest that lore-select scope on a `swipe` intercept excludes the last assistant row.

## Host facts
- `generateRawData` emits `GENERATE_AFTER_COMBINE_PROMPTS` (string prompt) or `CHAT_COMPLETION_PROMPT_READY` (array) with `dryRun:false` and no GENERATION_STARTED (verified script.js:4026-4038). Any prompt-ready hook must gate on its own generation tracking. SO does not hook these for injection (only extensionConflicts.ts notes them), so no bug.
- ST `EventEmitter.emit` awaits each listener and swallows its throw (`console.error` + continue; verified lib/eventemitter.js:144-151): an awaited hook that throws silently sends the request without its change.
- Regenerate deletes the old reply AFTER GENERATION_STARTED (their claim, script.js ~4344-4353 in 1.18): data on the message must be stashed at STARTED. Our state lives in chat_metadata, rollback handles it.
- WI uids collide across books; key by world+uid (SO already does, worldInfoEvidence.ts:90-96).
- Text-completion path: their note says the CC string hook carries an empty buffer openai.js never sends, so delivery on CC needs the registry or the array hook (unverified).

## Not worth taking
- On-path extractor+composer before every reply (up to 60 s): SO's off-path read + next-boundary apply is the better trade; our awaited work is lore select with `LORE_TIMEOUT_MS` (loreSelect.ts:143).
- LLM-composed per-turn guidance note: SO's steering is deterministic (pacing/steering.ts, guidance.ts); a model note adds a call and drift.
- Reroll ask/new/reuse popup + diff popup: deterministic steering makes it moot; popups violate "one surface, no toasts".
- Browser-held OpenRouter key in extension settings (plaintext): conflicts with our secrets rule (judge plugin is the only key reader).
- Per-swipe audit traces stored in the chat file (~140 KB bloat, their own known issue).
- Goal counters advanced by script, model told the numbers: already our model (engine + blackboard).
- Regenerate supersede stash / history fold: our rollback journal + derived records already cover it.
