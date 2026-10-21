# VectFox — 2026-10-21 harvest
meta: https://github.com/KritBlade/VectFox · head `690d386` (3.6.13, one squashed commit) · **AGPL-3.0** (`LICENSE`; README badge says GPLv3) = ideas only, never code · read: README (EN), manifest, `core/summarizer-injection.js` (all), `core/eventbase-{workflow 40-118, extractor 30-330, schema 20-64, message-hash, fork-core 1-75, injection 140-225, retrieval 20-136, 365-420}.js`, `core/agentic-retrieval.js` (1-60, 480-524), `index.js` 750-810 · skipped: UI (`ui/*`, 18k lines), backends, BM25/sparse encoders, CJK tokenizers, diagnostics, tests, migrations · prior: VectHare (its base) `docs/plans/v2.4/extension-research/vecthare-a-rag-and-vector-foundational-overhaul.md`; triage rows V1-V60 in `61-harvest-triage-2026-10-14.md`
`F/` = `C:/dev/st-extensions-research/vectfox/source/`; ST = `C:/dev/SillyTavern-MainBranch/public/`.

## What it is / what changed
New repo, a VectHare descendant aimed at 2,000-10,000-reply chats. Three layers on top of VectHare's chunk RAG:
**EventBase** (an LLM reads 2-message windows and emits 0..N typed events with characters/items/locations/cause/result/
open_threads/importance/should_persist), **Summarizer Injection** (newest 20 events pinned every turn with "(N turns ago)"
labels), and **Ghosting** (an interceptor drops every already-extracted message older than the last N from the outgoing
prompt). Retrieval: dense + BM25 (browser) or Qdrant native sparse + server-side rerank; optional "Agent Mode" planner LLM
(OpenRouter) that fans out 1-4 sub-queries with metadata filters. Side models go straight to OpenRouter/vLLM, not ST profiles.
Like VectHare it is add-only: swiped, edited and deleted text stays retrievable. No per-member filtering.

## How it works
- **Window ingestion**: auto-sync window = turns × 2 messages (`F/core/eventbase-workflow.js:42-45`); **settle lag** holds back
  the newest window (the still-swipeable turn) until superseded (`:68-73`). Windows dedup by a fingerprint of source message
  hashes (`F/core/eventbase-message-hash.js:14-18`: ST `hash` or djb2 of `name:mes`; `eventbase-store.js:611-651`).
- **Extractor** feeds each message's `extra.reasoning`, capped at 600 chars and fenced "CONTEXT ONLY, for date/time/location;
  NOT a source of events" (`F/core/eventbase-extractor.js:30-38, 283-301`). 18 fixed event types (`eventbase-schema.js:22-41`).
- **No removal path**: `deleteEventByHash` (`eventbase-store.js:352`) has no caller outside its definition; MESSAGE_DELETED/
  SWIPED only trigger another additive sync (`F/index.js:772-776`). Stale text is hidden only by "context dedup" (events whose
  window is still in the last N messages are not injected, `eventbase-retrieval.js:414-422`).
- **Rerank** `0.55·cosine + 0.20·importance/10 + 0.15·persist + 0.10·recency + anchor boost` (`eventbase-retrieval.js:27-32,
  115-129`); recency half-life **scales with chat length**: `max(40, 0.2 × chatLength)` messages (`:62-71`).
- **Presentation**: retrieved events re-sorted oldest → newest by message index, with a header telling the model that
  relevance rank ≠ story importance (`eventbase-injection.js:144-224`).
- **Summarizer injection**: lists the whole collection, sorts by `source_window_end`, newest 20, 10,000-char cap keeping the
  newest, renders oldest → newest with `(latest turn)` / `(N turns ago)` by distinct window (`summarizer-injection.js:265-372`).
- **Ghosting** (`summarizer-injection.js:178-258`): in the interceptor, rows `[0, cutoff)` get a shallow clone with `mes:''`,
  media/reasoning/tool fields removed and `extra[symbols.ignore] = true`; `cutoff = min(tip translated to coreChat index
  space, chat.length − max(keepRecent, 1, WI scan floor))`. WI floor = `world_info_depth`, deepest per-entry `scanDepth`, and
  Infinity when min-activations is uncapped (`:96-115`). It wipes **every** row in the span (empty/system too) because an
  interior ignored row crashes Chat Completion prompt building (comment `:150-157`, verified below).
- **Agent planner** output is validated: only 6 whitelisted `*_any` filters, ≤ 8 values each, `importance_gte` clamped 1-10,
  queries 3-300 chars, deduped, capped (`agentic-retrieval.js:480-524`); planner failure or timeout returns the pre-search
  unchanged (`:50-60`, `core/bounded-retrieval.js:57`).
- **Branch fork**: a branch finds its parent by the longest run of its opening message hashes known to another chat's window
  record and copies only events whose window ends before the split (`eventbase-fork-core.js:29-72`).

## Compared with our memory
| Need | VectFox | SO today | Verdict |
|---|---|---|---|
| Durable record of old events | EventBase rows forever, add-only, no rollback | typed `MemoryEntry` rows with provenance, supersede/lock, `rollback ≡ replay` (`src/memory/types.ts:187-217`, `src/runtime/rollback.ts`) | ours stronger on truth; theirs keeps more raw detail per event (cause/result/items) |
| Recent continuity | last 20 events pinned, "(N turns ago)" | short-term tier depth 2, scene tracker depth 1 (`src/constants/injectionRegistry.ts`) | equivalent; their relative-age label is the one difference (P5) |
| Old events on demand | vector + BM25 over every event, planner fan-out | D10 archive recall: entity mention in the last turn/objective → ≤ 4 folded rows, 200 tokens (`src/memory/archiveRecall.ts:7-60`) | ours fires only on a named entity; nothing answers "why did I…" (P4) |
| Exact words | none (events are summaries) | plan 43 verbatim recall, offline harness only (`src/memory/recall/*` not wired; queue M43) | ours planned, theirs absent |
| Long-run compression | none (DB grows; retrieval picks) | chapters: seal → record, chronicle, era fold (`src/runtime/chapterKit.ts`, `src/memory/chapterFold.ts`) | ours designed for a readable "story so far"; theirs for search |
| Prompt trimming | ghosting: per-turn cut at `len − N`, floored by WI scan depth | chapter fold (IGNORE on covered ranges minus `keep_tail`); plan 63 stepped window, measurement first | their cut moves every turn → kills prefix reuse (63's reason to exist); our fold has the contiguity bug (P1) |
| Per-member privacy | none: every block reaches every member | held-secret filter on every shared tier, witness record (42 B) | VectFox is a transcript copier for SO's purposes (P2) |
| Side-model routing | own OpenRouter/vLLM calls, keys in ST secrets | `passProfiles` routes, harness | ours |

Their scale claim (2,000+ replies, < 3 s) is unmeasured by us; our 63 R2 run is the place to test long play, not this design.

## Patterns for SO

### P1. Chapter fold leaves interior IGNORE holes; Chat Completion builds a broken history — host-fact / bug · chapters, 63 · our state: present (bug, CC only) · value 4 · effort S
- What: ST `setOpenAIMessages` walks `j` up and `i` down and `continue`s on an ignored row without assigning `messages[i]`
  (ST `scripts/openai.js:578-587, 644`). A contiguous ignored **prefix** only shortens the array; an ignored row with kept rows
  on both sides leaves a hole. `populateChatHistory` spreads the array (`openai.js:948`), so the hole becomes `undefined`,
  `new Prompt(undefined)` takes the `= {}` default (`scripts/PromptManager.js:182`) and `Message` logs "Message role not set,
  defaulting to 'system'" (`openai.js:3544-3547`); VectFox reports it ending in a token-count error (`F/core/summarizer-
  injection.js:150-157`). Text Completion is safe: `formatMessageHistoryItem` returns `''` for ignored rows (ST `script.js:5839-5843`).
- Ours: `foldRange` folds `{from, to − keep_tail}` per covered record, `keep_tail` default 6 (`src/runtime/chapterKit.ts:324-329`);
  `foldRows` leaves rows with no `extra` raw (`:331-345`); fold on by default (`src/runtime/chapters.ts:92`). Two sealed chapters
  ⇒ chapter 1's 6 tail rows sit between two ignored blocks ⇒ interior hole. Play runs on Text Completion, so unseen; any CC
  route (cloud validation reply model, an owner CC profile) is exposed. Derived from code, not reproduced.
- Fit: no invariant conflict. Fix keeps the IGNORE mechanism (no blanking, see P3).
- Sketch: fold a contiguous prefix: `[firstRow, max(range.to)]` over covered records (earlier tails are covered by their own
  record, so only the newest seal keeps its tail); a row with no `extra` inside that span gets `extra: {[IGNORE]: true}` too.
  Plan 63 adds the same rule: the step cut and the fold union must be one leading block. Test: jest over `foldRows` asserting
  the ignored set is a prefix; one no-model Chat Completion fixture after two seals asserting the request's message count and
  no "role not set" console line. Add to gotchas.

### P2. VectFox's blocks are a transcript copier: name it in `transcript-copiers` — host-integration · privacy / Repair · our state: absent · value 3 · effort S
- What: VectFox injects extracted events and retrieved chunks to every member, unfiltered, under its own extension-prompt tags
  `3_vectfox`, `3_vectfox_eventbase`, `3_vectfox_summarizer`, `3_vectfox_lorebook` (`F/core/constants.js:18-27`). Same leak
  class as Vector Storage (v2.6 F2), plus its extractor reads every member's `extra.reasoning`.
- Ours: the check maps only `1_memory` → Summarize and `3_vectors` → Vector Storage (`src/runtime/transcriptCopiers.ts:1-4`,
  `src/runtime/checks.ts:83-105`), keyed by foreign extension-prompt keys.
- Sketch: match the `3_vectfox` prefix → "VectFox" with a switch hint (master switch, or disable EventBase/summarizer
  injection); same for VectHare's tags (`3_vecthare*`, verify the literal). Firing fixture in `checksRegistry.test.ts`.
  Also note in gotchas: VectFox ghosting runs after our interceptor (`loading_order` 101 vs our 1; ST sorts interceptors by
  manifest order, `scripts/extensions.js:2033`) and may drop rows our fold kept.

### P3. IGNORE hides a row from the prompt, not from World Info — host-fact · 63 / lore · our state: present (unrecorded) · value 2 · effort S
- ST builds `chatForWI` from `coreChat[].mes` after the interceptors run, ignoring the IGNORE flag (ST `script.js:4564, 4624`),
  and `coreChat` already excludes `is_system` rows (`script.js:4496`). VectFox blanks `mes` and must floor its cut at WI scan
  depth; we only flag, so folded text still triggers lore inside scan depth. Keep it that way in plan 63 (no blanking), and
  record it: a folded old message can still fire an entry when scan depth reaches it.
- Interceptor index space ≠ chat index space; we already map rows by `extra` identity (`chapterKit.ts:256-262`), which is the
  robust form of VectFox's tip translation.

### P4. "Why did I…" recall: causal callbacks, not just exact words — feature · recall (43) · our state: partial · value 3 · effort M
- What: the player at long play asks "why did I pay the ransom?" / "remember when…". VectFox's answer is structured
  cause/result fields per event plus a planner that expands the question into causes and related beats
  (README §Agent Mode; `agentic-retrieval.js:50-60`; validated filters `:480-506`).
- Ours: archive recall fires only when the last turn names an entity carried by folded rows (`archiveRecall.ts:30-40`);
  plan 43's cue set covers quotation requests only (`src/memory/recall/cues.ts:10-16`: exactly, word for word, you said, quote,
  your words, what did <name> say). Nothing fires on "why / remember when / back then".
- Fit: add a second cue family to plan 43's scope D that recalls **summaries** (archived rows + chapter records), not
  quotes, through the same eligibility (witness/held-secret) and E0 ranking (winner arm (d), queue M43). No planner LLM:
  arm (d) is already a judge re-rank (~1 s, owner call in 43's gate record); a planner would add a second side call per turn.
  Gated behind 43's open gates; record as a 43 addendum, not new runtime work now.

### P5. Relative-age labels on recent memory lines — pattern · memory inject · our state: absent · value 2 · effort S
- What: "(latest turn)", "(3 turns ago)" per recent event, ranked by distinct window so a window's several events share one
  label (`summarizer-injection.js:339-361`). Cheap orientation for the model, deterministic.
- Ours: no age wording on short-term/scene-history lines (grep `turns ago` in `src/` = 0 hits).
- Fit: label from boundary distance (counters, not message ids, per architecture rule). Changes injected text → payload
  goldens move (declare the hunk). Measure on the live suite before calling it a gain; floor not retuned.

### P6. Recency that scales with chat length — test-idea · memory score · our state: absent · value 2 · effort S
- Theirs: half-life `max(40, 0.2 × chatLength)` (`eventbase-retrieval.js:62-71`), so at 2,000 messages a 400-message-old
  foundation event still scores 0.5.
- Ours: `recency = 1/(1 + age/12)` boundaries and `temporalProximity = 1/(1 + distance/20)` messages, fixed
  (`src/memory/score.ts:55-65`); at long play every old row's recency is ~0 and ranking falls to entity/Jaccard terms.
- Fit: only an E0/recall-fixture arm, never a silent retune of `DEFAULT_SCORE_WEIGHTS`. Matters only past chapter scale;
  chapters already carry old events as records.

### P7. Reasoning as time/place context for the read — idea, flagged · extraction / calendar (50) · our state: absent · value 2 · effort S
- Theirs: 600-char fenced reasoning per message, "context only, never a source of events" (`eventbase-extractor.js:283-301`).
- Ours: extraction never reads `extra.reasoning` (grep in `src/extraction/` = 0 hits); plan 50 reads time from the visible text.
- **Risk**: a member's thought holds private intent and things kept from others; putting it in the shared read can turn a
  thought into an epistemic or memory row (held-secret invariant, 42 audience contract: thought is not a witnessed span).
  Only acceptable as a time-only side input (`life_time_read`) with the thought text never reaching any row. Does not switch
  thinking or the inner voice off. Default: don't.

## Host facts
- Interior IGNORE rows break the Chat Completion history (P1); Text Completion is unaffected. Worth a line in gotchas.
- IGNORE rows are still scanned by World Info; `coreChat` excludes `is_system` before interceptors (P3).
- `generate_interceptor`s run sorted by manifest loading order (ST `scripts/extensions.js:2033`); ours (1) runs before most.

## Not worth taking
- Ghosting as built: the cut moves every turn (`cutoff = len − N`), so llama.cpp prefix reuse stays ~0; plan 63's stepped,
  coverage-clamped cut is the right shape. Their WI-depth floor is unnecessary for us because we never blank (P3).
- Qdrant / sparse vectors / server-side rerank: a second database and service for one user; ST Vectra + E0 ranking suffice
  at our scale. Revisit only if 63/43 measurements show recall failing past chapter scale.
- Window event extraction as a second memory family: duplicates our read + memory rows; add-only, no rollback.
- Settle lag: = our `stabilityLag` (extraction settings).
- Shared-prefix branch fork: SO state rides `chat_metadata`, which ST copies to the branch (`src/runtime/chatIdentity.ts`).
- Direct OpenRouter/vLLM side calls: bypass profiles and budgets; our routes (`passProfiles`) own this.
- Planner LLM fan-out on every turn: a side call on the reply path; arm (d) judge re-rank already answers ranking.
