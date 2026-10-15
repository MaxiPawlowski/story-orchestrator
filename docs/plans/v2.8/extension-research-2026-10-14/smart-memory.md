# Smart Memory — 2026-10-14 harvest
meta: https://github.com/senjinthedragon/Smart-Memory · `pre-refresh-2026-10-14` (`194a011`, v1.8.1) .. `a7f6c8e` (v1.8.3, 2026-10-01), 7 commits, 17 files, +463/-64 · **AGPL-3.0: ideas only, never code** · read: full diff of `generate.js`, `index.js`, `model-test.js`, `parsers.js`, `prompts.js`, `settings.js`, `ui.js`, `CHANGELOG.md`; skipped css/docs html/version bumps · prior review `docs/plans/v2.4/extension-research/smart-memory.md` (our memory subsystem is a port of `194a011`)

## What it changed
- 1.8.2: max_tokens floor for thinking models on every memory call; reasoning stripped on every source (main API `generateRaw` leaked Gemma 4 `<|channel>thought` on TC); recap overlay no longer wiped by a duplicate `CHAT_CHANGED`/`CHAT_LOADED` for the same chat; model test: per-tier progress, live thinking-tail preview (Ollama/local OAI streaming only), optional tiers can't fail the test; trailing `[2:session]` tag tolerated in parser; dropped unused `[confidence: 0.X]` from profile prompt.
- 1.8.3: session-memory edit/delete indexed the stored array with the sorted display index (wrong row); mobile CSS; read-only tooltip.
- Nothing new architecturally. One item maps onto a live gap in SO (P1).

## How it works
- `getRequestLimit(len)` = `max(len, generation_budget)`, `-1` = no cap (`generate.js:128-132`); applied to CMRS, WebLLM, `generateRaw` paths (`generate.js:330,337-342,356-361,380-384,405`). Rationale: per-tier lengths (300-600) were sized for the visible answer; a thinking model spent them on reasoning, finish `length`, empty output.
- Strip everywhere: `stripThinkingBlocks(raw)` unconditional (`generate.js:368-371`, WebLLM summarize `:396`).
- Recap ownership: `recapOverlayChatMeta` = chatMetadata object identity of the recap's chat; `onChatChangedImpl` removes the overlay only when identity differs (`index.js:424,1070-1081,1179-1185`).
- Model test: `TIER_DEFS[].required`, `failedTier = find(empty && required)` (`model-test.js:305-404,648`); `onProgress(i+1,total,name)` (`:617`); `onChunk({content,thinking})` streamed NDJSON/SSE (`generate.js:203-222,285-306`), throttled 150 ms, 400-char tail (`settings.js:796-809`).
- Parser: `stripTrailingTag` regex `\[\s*(?:([123])\s*:?\s*)?(scene|session|permanent)?\s*\]\s*$`, folded as fallback values (`parsers.js:684-694,102-121`).
- UI: `memories.indexOf(mem)` instead of sorted idx (`ui.js:862-866`).

## Patterns for SO
### P1. Self-test budget must match the runtime read — host-fact/bug · extraction/self-test · our state: absent (mismatch) · value 4 · effort S
What: their #7 bug: a model test (and calls) sized for the visible answer reports "model can't do it" when a thinking model spent the allowance on reasoning.
Theirs: `generate.js:128-132`, CHANGELOG 1.8.2 "Thinking models no longer return empty extractions".
Ours: runtime shared read uses `maxTokensCap("sharedRead")` = fixed 2048 (`src/extraction/callBudget.ts:26`, `sharedRead.ts:27`) and the role's route (effort + reasoning budget, `extraction/reply.ts:50-58`, `stHost/modelReply.ts:170-171`). The self-test asks `maxTokens: 512` on a bare `profileRoute(profileId)` with no effort (`src/runtime/selfTest.ts:174`, `extraction/modelRoute.ts:84-88`) while its header comment claims "the same prompt/parse path extraction uses at runtime" (`selfTest.ts:30-31`). On Artemis with thinking on and effort `default`, reasoning budget = 0 (`modelReply.ts:170`), so 512 total can go to thought → `reasoning-exhausted` → "self-test failed" for a model that works in play; and a capability fail can drive the "stop tracking what characters know" suggestion (`selfTest.ts:186-191`, `MemoryModelGroup.tsx:77`), i.e. a nudge to switch a feature off from a budget artifact.
Fit: no invariant conflict; keeps thinking on (the opposite of the tempting fix "disable thinking for the test" — don't). Sketch: self-test asks through the read role's resolved route (`passProfiles.resolveRoute`) with `maxTokensCap("sharedRead")`; test: planted reasoning-only reply at 512 vs 2048 path; live gate on the memory profile with thinking on.

### P2. Optional tiers never fail the whole self-test — pattern · self-test · partial · value 2 · effort S
Theirs: `model-test.js:648` + pass header naming empty optional tiers (`settings.js:840-845`). Ours: per-tier pass/fail already (`selfTest.ts:7-12`), but any thrown error in pass 2 (epistemic+ledger) returns `error` and the UI shows `SELF_TEST_FAILED_TEXT` over the core results (`selfTest.ts:177-179`, `MemoryModelGroup.tsx:66`). Sketch: a pass-2 failure keeps pass-1 results and reports pass 2 as `fail` with the reason; never a suggestion on that path (already true).

### P3. Model-call "thinking tail" while a self-test runs — feature · settings/author UI · absent · value 2 · effort M
Their live thought preview spots a looping model before timeout (`settings.js:796-809`). Ours: CMRS non-streaming (`stHost/modelReply.ts:176`), progress label only (`selfTest.ts:171`). Only cheap if a streaming CMRS path exists; otherwise skip. Author-only surface (invariant: author view adds).

## Prior-review follow-up (state on master today)
- Idea 1 branch adoption: present — `main_chat` branch detection `src/runtime/chatIdentity.ts:74-77`, `runtime/branchContinue.review.test.ts`.
- Idea 8 reasoning strip: already central for every route (`extraction/reply.ts:66`, `harnessReply.ts`, `generation/generate.ts` etc.); their "strip on every path" change is what we already do. Our `reasoning-exhausted` classification (`reply.ts:67-68`, `roleHealth.ts:48`) is stronger than their silent empty.
- Recap duplicate-load fix: present, scoped by chat id (`runtime/awayRecap.ts:95-115` `dismissUnless`); same lesson, already learned.
- Sorted-index edit bug: not present; Memory tab acts by `entry.id` (`components/drawer/tabs/MemoryTab.tsx:115,125,179-181`).
- Plan 21 (vector/verbatim recall, witness filter) is unaffected by this diff.

## Host facts
- `generateRaw` does not strip reasoning for TC backends (KoboldCpp + Gemma 4 leaks `<|channel>thought`) per their CHANGELOG 1.8.2 #8. We never call `generateRaw` for memory (CMRS only) and strip centrally; consistent with gotchas "Inline reasoning is stripped centrally".
- ST can fire `CHAT_CHANGED`/`CHAT_LOADED` more than once per chat load (their `index.js:417-424`); matches our `awayRecap.ts:102-104` and `chatIdentity.ts:7`.
- Not verified in ST source (cheap check skipped): neither is new to us.

## Not worth taking
- Trailing `[score:expiration]` tag stripping: our line format is `MEMORY key=value` (`memory/parse.test.ts:5`), not bracket tags.
- Dropping `[confidence]` from profile prompt: we never ported profiles.
- Ollama/OAI-compat direct streaming: we route through CMRS/harness only.
- Recap chatMetadata object-identity guard: ours keys by chat id, equivalent and survives reload.
- Mobile CSS / read-only tooltip: no SO counterpart.
