# VectFox — 2026-10-30 harvest

meta: https://github.com/KritBlade/VectFox · `pre-refresh-2026-10-30` `690d386` (3.6.13, 2026-10-11) .. HEAD `2a5e61f` (3.6.17,
2026-10-23), 13 commits, 26 files (+897/−269) · **AGPL-3.0: ideas only, never code** · read: full diff of `core/`, `backends/`,
`ui/`, `index.js`, `manifest.json`, `Doc/dev_helper.md`; tests by name only; re-read `core/summarizer-injection.js:150-160`
at HEAD · prior: `docs/plans/v2.8/extension-research-2026-10-21/vectfox.md` (P1–P7), triage rows M05–M11 in
`docs/plans/v2.9/01-triage-sol.md:71-83`.
`F/` = `C:/dev/st-extensions-research/vectfox/source/`; ST = `C:/dev/SillyTavern-MainBranch/`.

## What it is / what changed

Same product (EventBase event memory, summarizer injection, ghosting). The delta is embedding plumbing and fixes only:
- Retrieval embeds each query text once and reuses the vector across every route and fallback, with one retry on a
  failed embedding; invalid-model errors are not retried (`F/core/core-vector-api.js:1071-1079`, `F/core/eventbase-retrieval.js:459-483`,
  new `F/backends/query-embedding.js`). Before, each fallback re-embedded: up to 4 embedding calls per failed query.
- Local embedding sources (transformers/ollama/llama.cpp) always send 1 item per insert request: one over-long item that
  fails to embed (transformers WASM out of memory) no longer fails its batch, and a request stays under the plugin's 120 s
  timeout (`F/core/core-vector-api.js:742-781`).
- EventBase write target must sit on the current backend (`F/core/eventbase-store.js:853-873`); delete purges every source
  folder a collection lives in (`F/core/collection-loader.js:720-740`); hedge "WON" log says why the earlier attempt failed.
- Auto-sync toast fires only when windows are actually left to extract (`F/core/eventbase-workflow.js:382-394`).
- Unchanged: `core/summarizer-injection.js` (ghosting), `core/constants.js` (prompt tags `3_vectfox*`), `loading_order` 101.

## Chapter-fold IGNORE hole (2026-10-21 SUMMARY §3, triage M05): still open, unchanged by this update

- VectFox side: the ghosting module is not in the diff. Its comment still states the hazard and the rule:
  "CONTIGUITY IS MANDATORY: setOpenAIMessages leaves an *unassigned slot* per ignored message"
  (`F/core/summarizer-injection.js:160`). Nothing in 3.6.14–3.6.17 changes the finding.
- ST side, re-checked on the owner's tree (not updated): `setOpenAIMessages` still `j++; continue`s on an ignored row without
  assigning `messages[i]` (`ST/public/scripts/openai.js:579-587`), assigns kept rows at `:644`, and
  `populateChatHistory` spreads `[...messages].reverse()` (`:948`). A contiguous ignored prefix only shortens the array; an
  interior ignored row is a hole → `undefined` prompt on Chat Completion. Text Completion unaffected.
- SO side: **not fixed.** `foldRange` still emits one `{from, to − keep_tail}` range per covered record
  (`src/runtime/chapterKit.ts:324-329`) and `foldRows` flags every row inside any range (`:331-347`); two sealed chapters
  leave chapter 1's tail between two ignored blocks. Last change to the file is `f2fc43c4` (story format field), no fold fix.
  Status: folded into v2.8 69 on 2026-10-25, "Not built; each item is scheduled with this plan's next build pass"
  (`docs/plans/v2.8/69-harvest-hardening-bundle.md:542-546`). M06 (VectFox copier keys) also not built:
  `src/runtime/transcriptCopiers.ts:1` still maps only `1_memory` and `3_vectors`.
- Exposure unchanged: any Chat Completion route that receives the play history (owner CC profile, DeepSeek). The fix sketch
  in the 10-21 report (fold one leading block `[firstRow, max(range.to − tail of newest)]`, stop at coverage gaps and
  no-fold chapters per M05) stands. Fixture already specified in 69 §Folds.

## Patterns for SO

### P0. Archive recall re-embeds its candidates on every loud generation, on the reply path — suspected perf defect · chapters / talk pacing 19 / track A · our state: present (unmeasured) · value 3 · effort S
- VectFox's point this round: one embedding per query text per turn, shared by every route (`F/core/eventbase-retrieval.js:459-483`).
- Ours: the generate interceptor awaits `chapters.recall(chat, type)` before the reply starts (`src/runtime/wiring/talk.ts:92`).
  `recall` → `recallBand` builds a fresh temporary collection each call: inserts every candidate (re-embedding each), runs
  one query (embedding the turn text), purges (`src/runtime/chapterKit.ts:107-123, 145`). A group round runs it once per
  drafted member with the same turn text and the same candidates. Every insert chunk (4 items) and the query first await
  `judgeRuntime.whenIdle(15 s)` (`src/runtime/vectorYield.ts:3-21`, `src/runtime/wiring/judgeScene.ts:26`), so a busy judge
  can delay the reply by up to 15 s × (⌈N/4⌉ + 1).
- Only fires after a chapter seal with archived rows naming an entity in the last player turn (`archiveRecall.ts:36-39`),
  so it is a long-play cost, invisible in short lanes.
- Sketch: key the band by (chat, turn text, candidate ids + texts) for the round, so members 2..k reuse member 1's set; skip
  the judge-idle yield on this reply-path call (yield exists for off-path work). First measure: time `recall` per loud
  generation on a sealed-chapter run (plan 19 / 13 timing), then decide. Recall semantics unchanged; no rollback impact
  (the band is a read).

### P1. Short-circuit nested threshold queries in vector consolidation — pattern · memory dedup / perf · our state: absent · value 2 · effort S
- What: VectFox's lesson this round is "embed once; fallbacks must not re-embed". ST's native `/api/vector/query` cannot take
  a precomputed vector for server-side sources (only `webllm`/`koboldcpp` read `embeddings`, `ST/src/endpoints/vectors.js:82-85,
  245-254`), and `getTransformersVector` has no cache (`ST/src/vectors/embedding.js:9-14`). So every query re-embeds.
- Ours: `vectorMatchSets` inserts the group, then runs **three** queries per entry (0.82, 0.88, 0.55) on the same text
  (`src/runtime/consolidationMatches.ts:28-35`): 4N embeddings for an N-row group, 3N of them recomputing texts already
  embedded at insert. Result sets are nested (0.88 ⊂ 0.82 ⊂ 0.55).
- Sketch: query 0.55 first; empty → skip both dup queries; 0.82 empty → skip 0.88. Same `MatchSets`, fewer calls for the
  common no-near-duplicate row. Pure order change, no threshold retune (floors untouched). Test: jest with a counting fake
  `VectorHost` asserting identical sets and fewer queries. `createNearDups.ts:12-15` runs two nested bands (duplicate, then same-topic) the same way: query same-topic first.
- Fit: no invariant touched. Gain unmeasured; consolidation is off-path, so this is GPU/CPU contention relief, not latency.

### P2. One item per insert for local embedding sources — host-fact / pattern · memory vectors · our state: partial · value 2 · effort S
- VectFox: one item that fails to embed (transformers WASM OOM on an over-long text) fails the whole insert request
  (`F/core/core-vector-api.js:742-751` comment).
- Ours: `yieldingVectorHost` already chunks inserts by `VECTOR_INSERT_CHUNK = 4` (`src/runtime/vectorYield.ts:3, 14-18`), and any
  failure drops the whole group to Jaccard (`consolidationMatches.ts:52-55`). One long memory row = the group loses vectors.
- Sketch: either chunk 1 for `transformers`, or clip each text to a token cap before insert (memory rows are short; a cap
  costs nothing). Only worth it if the warning `vector consolidation unavailable` shows up in real logs; record it as a
  watch item, not work.

## Host facts

- ST `/api/vector/query` re-embeds the query text on every request; precomputed vectors are accepted only for `webllm` /
  `koboldcpp` (`ST/src/endpoints/vectors.js:82-85, 245-254`). ST transformers embedding has no per-text cache
  (`ST/src/vectors/embedding.js:9-14`). Relevant to any "N band queries per row" design (E0 arm b is 4 queries).
- CC interior IGNORE hole still present in the owner's ST (`openai.js:579-587, 644, 948`); see §Chapter-fold.

## Security notes

- SECURITY.md verdict CLEAR. Nothing in this repo addresses an AI agent; commit trailers `Co-Authored-By: Claude` are benign.
- Unsafe-to-install surface (pre-existing, unchanged): it depends on its own **server plugin** Similharity
  (`/api/plugins/similharity/*`, new call site `F/backends/query-embedding.js:31`), not in this repo; reads `secret_state`
  for presence only (`core/api-keys.js`); optional Qdrant and OpenRouter/vLLM side calls go off localhost with user keys.
- Nothing proposed above needs any of that: P1/P2 use ST's native `/api/vector/*` through `stHost/vectors.ts` as today.

## Not worth taking

- Query-vector reuse across fallbacks as such: SO has one route (native query) and no fallback chain that re-embeds.
- Backend-matched write target, multi-folder purge, hedge cause logging: Qdrant/Similharity plumbing we do not have.
- Auto-sync toast gating: SO has no toasts (one check surface rule).
