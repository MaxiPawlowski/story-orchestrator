# TokenSavingPlugin — 2026-10-14 harvest
meta: https://github.com/cloudfox-open/TokenSavingPlugin · single commit `9768b26` (v1.0.3) · MIT · read all of `index.js` (2001 lines, core
loop 937–1553), README, CHANGELOG, manifest, post.md; skimmed settings.html/style.css (UI only) · new repo, no prior review

## What it is / what changed
Browser extension. When visible rounds > n+m (or visible-text tokens ≥ 80 % of `getMaxPromptTokens`), it summarizes every message except the
last n rounds with `generateQuietPrompt`, hides the originals (`hideChatMessageRange` = `is_system: true`), and injects the summary
("FCC") with `setExtensionPrompt(key, text, IN_CHAT, depth 9999)`, i.e. just before the oldest message ST still sends.

Claims vs code:
- **"Feynman self-check, falls back to the original text on info loss"**: removed in v1.0.3 (`index.js:5-6`, CHANGELOG 1.0.3). Not in
  the code. The only fallback is "compression call failed -> unhide" (`index.js:1165-1168`).
- **"Append-only frozen FCC"**: only until the budget. Default `fccBudget` 525 tok vs summary 210 (`index.js:416-417`), so about the
  third compression triggers `foldFCC`, an LLM rewrite of the whole FCC (`:1145-1148`), then a hard head-cut (`:1151-1152`). Each fold
  changes the prefix from the FCC start.
- **"45 % -> 90 % cache hit"**: plausible, but not because of the FCC. The real mechanism is **hysteresis**: the chat start stays fixed
  for m rounds and then jumps n+m -> n, so ST never front-trims one message per turn. Between compressions the prompt only grows at the
  end. The numbers are a provider-dashboard table (DeepSeek), with no A/B in the repo.

## How it works
- Trigger: `MESSAGE_RECEIVED`, `GENERATION_AFTER_COMMANDS` (non-quiet, non-dry) and a 30 s poll (`:491-508`), fire-and-forget
  (`:781`). From `GENERATION_AFTER_COMMANDS` the compression runs concurrently with the generation that just started and hides messages
  under it.
- Adaptive m: `m = floor(0.85*(ctx - reserve)/(2*avgTok_last60)) - n` (`computeAdaptiveM`, `:1647`; README §m). The window size
  follows message length rather than a fixed count.
- Compression prompt: JSON `{events, relationship, emotion, hooks}` with an explicit retention priority (turning points > foreshadowing/
  promises > state changes > events; may drop greetings, scenery, jokes) (`:272-300`). Chunked, with the last two summaries passed as
  "prior, do not repeat" (`:1208-1212`, `:1272`). Tolerant parse: strict JSON, then per-field regex, then the raw text (`:1279-1320`).
- Circuit breaker: on a fatal API error (402/401/403/quota/balance regex, `:46`) it aborts the round and pauses auto-runs 5 min; a
  manual run resets it (`:660-677`, `:773-779`).
- Context widening: it mutates `oai_settings.openai_max_context` up to 64000 during compression and restores it afterwards (`:614-657`).
  This is a global install write (CC only), visible to any concurrent generation.
- Storage: `extension_settings.tokensaving.charData[<avatar>]` (`:1459-1483`), so per character, not per chat. Hidden ranges are
  stored as message indices (`:1510`).

## Patterns for SO

### P1. Stepped (hysteresis) history window — pattern · prompt cache / context · our state: absent · value 4 · effort M
What: when history overflows, cut the oldest messages in one large step down to a low-water mark, and hold that cut until the high-water
mark is reached again. This replaces ST's per-turn front trim, which shifts the whole history every turn and leaves zero cache reuse
after the system/card prefix.
Their evidence: `index.js:962-992` (n+m -> n), adaptive m `:1647`.
Our state: we fold only at a chapter seal, on interceptor copies via `Symbol.for("ignore")` (`src/runtime/chapterKit.ts:240-337`,
`foldRange` `:313`). Without chapters, or inside a long chapter, ST front-trims every turn once the prompt is over `max_context`.
Nothing in `src/` handles front trimming (grep: no hits). B1-PFX deliberately avoided the case: "So the 247-message saga prompt fits
without front trimming, the chat was cut to its first 80 messages" (`docs/plans/v2.8/31-v27-wrap-backlog.md:522-523`). So the
late-lore fix (R2/R7, `runtime/lorePlacement.ts`) is unmeasured on the case that matters most for a long local game at 32K.
Fit: reuse the fold machinery. In the generate interceptor, mark ignored on the copies every row below a `cutId` kept in
`extras` (per chat, rollback-safe: recompute it, never trust a stored index past a deletion). Advance `cutId` only when the estimated
prompt passes the high-water mark (for example 90 % of the budget from `requestBudget`/`promptCost`), down to the low-water mark (for
example 65 %). Rows below `cutId` must already be covered by memory (short-term / session details / story-so-far). Gate the advance on
the extraction read cursor having passed `cutId` (`extraction/readCursor.ts`), so we never drop unread text. No live-chat writes, no
`is_system` toggling. Secrets are unaffected: rows are only ignored. Measure with the existing `place-all.sh` reuse metric on a chat
long enough to front-trim, against a control.
Invariants: none broken if done on copies at the interceptor. Thinking and the inner voice are untouched.

### P2. Chunk-boundary recap placed before the oldest kept message — pattern · memory placement · our state: partial · value 2 · effort S
What: depth `MAX_INJECTION_DEPTH`-ish (9999) IN_CHAT puts a block immediately before the oldest sent message (ST
`doChatInject`, `script.js:5666` clamps to `messages.length`). That block is stable across turns until the next step, so it sits in the
cached prefix.
Our state: `storySoFar` is at depth 4 (`src/constants/injectionRegistry.ts:26`). It moves every turn, but it is in the tail anyway, so
it costs only that tail. Only worth it combined with P1: a recap of exactly the rows below `cutId`, regenerated only when `cutId`
advances, could live at the top. It must be the resting view (`MemoryInjector.restingEntries`) because it is a shared tier.
Otherwise skip.

### P3. Compression prompt retention ladder + "hooks" field — pattern · memory/chapter record prompt · our state: partial · value 2 · effort S
What: explicit priority order (relationship turns, promises and foreshadowing, state changes, events) plus a mandatory `hooks` field
for unresolved threads (`index.js:284-299`).
Our state: chapter records carry open threads (`storySoFarText` `[Open threads]`, `chapterKit.ts:285-294`); arcs and promises are
planned (plan 47 promises-remembered, plan 55 NPC commitments). Possibly a prompt tweak for `buildChapterRecordPrompt`/short-term
compaction. Judge by the existing chapter floors, not by taste.

### P4. Fatal-error circuit breaker for background model calls — pattern · scheduler · our state: present · value 1 · effort S
Ours is stronger: there is a breaker in the scheduler (`held`/`heavyHeld`, 31 F29) and `model-role-outage` degrades the check. Nothing to
take, except perhaps their idea that a manual action resets the breaker.

### P5. Test idea: front-trim cache-reuse A/B — test-idea · measurement · our state: absent · value 3 · effort S (once a pod/3090 slot exists)
Add an arm to B1-PFX/R2 that keeps the full saga (no `/del` cut) at `LLM_CTX` 24576, so ST front-trims, and record the reuse p50.
Expectation: about 0 after the story string, whatever the lore placement. This is the baseline P1 must beat, and it tells us whether
the late-lore win survives real long play.

## Host facts
- `setExtensionPrompt(key, v, IN_CHAT(1), 9999, …)` works. `getExtensionPromptMaxDepth()` always returns `MAX_INJECTION_DEPTH` 10000
  (`script.js:500`, `:3281-3282`), and `doChatInject` loops over every depth and awaits `getExtensionPrompt` 10001 × 3 roles per
  generation regardless of what is injected. A large depth costs nothing extra, and the loop is ST's cost anyway.
- Injection index = `min(depth + inserted, messages.length)` (`script.js:5666`): an over-deep prompt lands just before the oldest sent
  message, after ST's own trimming.
- `hideChatMessageRange(start, end, unhide)` sets `is_system` and awaits `saveChatConditional` (`public/scripts/chats.js:147-169`), so
  it is a real chat write with the save-binds-late race already in gotchas. We do this right by using copies and `Symbol.for("ignore")`.
- `MESSAGE_SENDING` is not an ST event type (`public/scripts/events.js` has no such key), so their send-blocking handler `:510` is dead,
  and event handler return values never veto anyway. Nothing in SO relies on this (no grep hits).
- `generateQuietPrompt` takes an object (`script.js:3084`). Positional calls still work but trace a warning.
No SO bug found from this code.

## Not worth taking
- The FCC as a frozen prefix: folding and the head-cut rewrite it every few compressions, and our tiers already give better structure.
- Hiding originals via `is_system`: a live-chat write; it breaks per-member views and rollback, and it hides user-hidden and narrator rows too.
- Widening `openai_max_context` globally during compression: an install write with races; we have per-request budgets.
- Storage per character avatar in extension_settings: shares the summary across chats; in groups `characterId` is undefined, so
  `saveFCC` silently no-ops after the messages are already hidden (`:1480`, `:1157-1158`), and on reload the messages stay hidden with
  no summary.
- Fire-and-forget compression from `GENERATION_AFTER_COMMANDS`: races the in-flight generation; the opposite of RunOwnership.
- `estimateTokens = len/1.5` (Chinese-tuned): over-counts English about 2.5×.
- Input lock by disabling `#send_textarea`: the player waits; we run off-path.
