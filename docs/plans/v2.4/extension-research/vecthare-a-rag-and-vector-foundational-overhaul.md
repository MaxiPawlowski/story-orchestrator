# VectHare (RAG and vector overhaul): v2.4 review

Author: Chibee / Coneja Chibi. Repo: github.com/Coneja-Chibi/VectHare (**deleted**). Reviewed code: third-party fork `tardigradegit/VectHare` @ `82290a8` (2026-09-19), manifest `2.2.0-alpha`, provenance unverified (see `MIRROR-NOTE.md`). Thread: 53 upvotes / 721 msgs. Source available: **y (mirror only, not the author's release)**. All their paths below are relative to `source-mirror/`.

## What it is
- A RAG replacement for ST's built-in Vectors extension. It embeds chat messages, lorebooks, character fields and custom documents into collections on four backends: ST Vectra, LanceDB, Qdrant, Milvus (the last three through a "Similharity" server plugin).
- On every generation it retrieves chunks by similarity and re-scores them: keyword boost, BM25/hybrid RRF, temporal decay or "nostalgia", conditional rules (emotion, speaker, swipe count…), chunk groups and links. It then drops chunks that are already in recent chat and injects the rest with `setExtensionPrompt`.
- Heavy UI: database browser, chunk visualizer and editor, scene start/end buttons on messages, a per-generation "search debug" trace, a diagnostics modal with auto-fix.
- It is a memory system of a different kind from ours. It retrieves raw text; SO extracts typed state and curated tiers. The overlap is thin. The value lies in a few techniques, one interop hazard and several anti-patterns.

## How it works
- **Entry** `index.js:234`. Settings merge into `extension_settings.vecthare` (`index.js:238-254`). The whole state is install-wide: collections, a registry, and per-chunk metadata keyed `vecthare_chunk_meta_<hash>` (`core/collection-metadata.js:388-414`).
- **Ingest (off-path, debounced)**: `MESSAGE_SENT/RECEIVED/EDITED/DELETED/SWIPED` → `ModuleWorkerWrapper` → `synchronizeChat` (`index.js:157,163,315-321`; `core/chat-vectorization.js:406`).
  - Sync uses the DB as the source of truth: it reads the saved hashes, embeds only the missing groups, and waits for `!is_send_press` (`:448-451,432`).
  - Text passes through `cleanText` presets first (`:461-462`; `core/text-cleaning.js:25-126`).
  - **It never deletes.** `deleteVectorItems` is imported (`chat-vectorization.js:23`) but never called in sync, so edited, swiped and deleted text stays retrievable. ST's own Vectors does delete stale hashes (`public/scripts/extensions/vectors/index.js:502`).
  - The collection id comes from `chat_metadata.integrity` (`core/collection-ids.js:69-80`), not from the chat file name.
- **Retrieve + inject (on the reply path)**: manifest `generate_interceptor: vecthare_rearrangeChat` (`manifest.json:6`, `index.js:168-173`) runs the pipeline in `rearrangeChat` (`chat-vectorization.js:1628`). Stages:
  1. Skip only `quiet` (`:1633`), then clear old prompts.
  2. Build the query from the last N messages (`:610-618`).
  3. Query the collections (`:629`).
  4. Keyword boost: a matching keyword sets `score=1.0` (`:1742-1763`).
  5. Semantic WI (`:1784`).
  6. Summary→parent expansion (`:743`).
  7. Threshold, decay, conditions, groups and links (`:1846-1866`).
  8. Dedup against the hashes of the last 50 messages (`:1274-1350`).
  9. `setExtensionPrompt`, one tag per position group, with a nested context/XML wrapper per chunk, per collection and globally (`:1371-1590`).
  10. Read-back check of `extension_prompts[tag].value` (`:1521-1523`).
  
  Every generation awaits embedding calls. A failure raises a toast, and generation continues (`:1948-1951`).
- **Semantic WI** (`core/world-info-integration.js:35-140`): it queries vectorized lorebook collections and injects the **entry text stored at vectorize time** through its own extension prompt. It does not go through ST's WI activation. `disable` is honoured only at vectorize time (`core/content-vectorization.js:384-388`). `rearrangeChat` passes `activeEntries=[]` (`chat-vectorization.js:1784`), so the dedup against keyword-activated entries is a no-op.
- **Scenes**: a MutationObserver injects start/end buttons into `.mes_buttons` (`ui/scene-markers.js:195-235,524-547`). The click resolves `mesid` at click time because ST renumbers the DOM on delete (`:209-212`). `createSceneChunk` embeds the span and flags the contained chunks `disabledByScene` (`core/scenes.js:133-200`). Scene-aware decay resets age at scene boundaries (`core/temporal-decay.js:253-310`).
- **Conditions**: 15 rule types (`core/conditional-activation.js:784-851`). Emotion comes from the Expressions extension or `/api/extra/classify` (`core/emotion-classifier.js:144`).
- **Cleanup**: `CHAT_DELETED` / `GROUP_CHAT_DELETED` purge that chat's collection (`index.js:323-340`).
- **Debug**: `createDebugData` / `recordChunkFate` record, per chunk, the stage where it was passed, dropped or injected, with a reason (`ui/search-debug.js:48-135`).
- **LLM calls**: none. Embeddings only (many providers), plus an optional BananaBread rerank.
- **Tests**: node tests for pure scorers (`tests/*.test.js`), and in-app "production tests" that run against a real embedding API and clean up the test collections afterwards (`diagnostics/production-tests.js`, `diagnostics/index.js`).

## Overlap with Story Orchestrator
- **Memory retrieval.** We inject curated tiers, scored by `scoreEntry` (`src/memory/score.ts:45`) with **Jaccard as "semanticSimilarity"** (`:61`). Their retrieval is embedding-based. Ours is more accurate about truth (provenance, quarantine, rollback ≡ replay) and weaker on relevance. Our ST vectors use is limited to ephemeral consolidation collections (`src/runtime/consolidationMatches.ts:13-42`).
- **Pinning.** Their "temporally blind" flag is our pin (retention).
- **Mutations.** Their swipe/edit/delete handling is add-only. We roll back every store (`src/runtime/rollback.ts:35`). We are strictly better here.
- **Scenes.** They mark scenes by hand. We detect them with a heuristic only (`src/memory/sceneDetect.ts:37`, English regex).
- **Explainability.** Their search trace reports each chunk's fate per stage. Our next-turn preview (`src/runtime/nextTurn.ts`) shows only what was injected: the budget computes `dropped`/`pinnedOverflow` (`src/memory/budget.ts:78`) and `inject.ts:19-31` filters silently.
- **Chat identity.** They key by `chat_metadata.integrity`. We stamp `chatId` and restamp on rename (`src/runtime/persistence.ts:97`).
- **Transcript input.** They clean HTML, `<details>` and thinking tags before use. Our extraction window feeds raw `mes` (`src/extraction/chatWindow.ts:10`).

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Clean transcript text before extraction (HTML formatting, hidden divs, `<details>`, inline thinking in `mes`) | enhancement | extraction | absent | 4 | S |
| 2 | Show a fate trace per memory row in author view (why each row was kept or dropped) | ux | memory / player-ui (author) | partial | 3 | S |
| 3 | Warn on interop: another RAG injects gated lore or swiped-away text | host-integration | host / repair | absent | 3 | S |
| 4 | Normalize Jaccard tokens (punctuation, case, diacritics), language-neutral | enhancement | memory | partial | 3 | S |
| 5 | Stamp chat identity with `chat_metadata.integrity`, and handle branches | host-integration | engine / persistence | partial | 3 | M |
| 6 | Remove the orphaned memory-mirror book on chat delete | host-integration | memory | absent | 3 | S |
| 7 | Consumer for `memoryRerank`: embedding rerank over a per-chat index derived from the store | enhancement | memory | partial | 3 | M |
| 8 | Author "scene break here" as a forced scene-pass cue | enhancement | extraction / memory | absent | 2 | S |
| 9 | Scene-relative recency in `scoreEntry` | enhancement | memory | absent | 2 | S |

**1. Transcript cleaning.**
- *What:* a pure `cleanTranscriptText` in `extraction/chatWindow.ts` with a few fixed presets: strip HTML tags but keep their text, drop `display:none` divs, drop `<details>…</details>`, drop leading `<think>/<thinking>` blocks inside a *message* (not only in model output).
- *Theirs:* `core/text-cleaning.js:25-126`, applied at ingest `core/chat-vectorization.js:461`.
- *Ours:* `readMessage` returns `entry.mes.trim()` raw (`src/extraction/chatWindow.ts:10`). `stripReasoningBlocks` (`extraction/parse.ts:51`) cleans only the memory model's *reply*. A grep for `details>|stripHtml|display:none` in `src/` returns nothing.
- *Why it matters:* stat-tracker and HTML-heavy cards (common in the corpus) and Stepped Thinking inline thoughts put markup into every read. That burns tokens (the open "no request-size bound" seed) and invites evidence quoted from hidden text.
- *Fit:* the cleaning has to happen once in the window builder, so the prompt and `evidenceInWindow` (`extraction/evidence.ts:28`) see the same text (invariant 4 stays intact). Keep it deterministic and install-wide, with a default preset. Do not copy their user-editable regex manager.

**2. Fate trace per memory row.**
- *What:* `buildMemoryInjection` returns, per candidate: the stage where it left (`quarantined | superseded/folded | other-speaker | over-budget`), its score, and pinned-overflow. The author-view Memory/Payload tab renders it next to `#so-next-turn`.
- *Theirs:* `ui/search-debug.js:48-135`; `recordChunkFate` calls throughout `chat-vectorization.js` (e.g. `:1330-1345`, `:1541`).
- *Ours:* the filters at `src/memory/inject.ts:21-26` drop rows with no record. `selectWithinBudget` already computes `dropped` (`memory/budget.ts:78`), and the caller throws it away. The next-turn preview has no per-row reason (a grep for `reason|score` in `runtime/nextTurn.ts` finds only a judge fallback).
- *Fit:* author-only (invariant 9). The data has to ride the snapshot, and the drawer must not call a getter (invariant 18). Pure, so it is cheap to test.

**3. Interop warning.**
- *What:* capability-style probes for foreign injectors that break our assumptions, surfaced as a Repair consequence line. The first target is VectHare: `window.VectHare_WorldInfo` plus `extension_settings.vecthare.enabled_world_info`/`enabled_chats`.
- *Theirs, why it breaks us:*
  - Semantic WI injects a vectorize-time snapshot of entry text through its own prompt tag (`core/world-info-integration.js:35-140,347-373`). `disable` is read only at vectorize time (`core/content-vectorization.js:388`).
  - Our checkpoint gating works by flipping `disable` on path replay (`src/runtime/worldInfoGates.ts:12`), so a vectorized story lorebook leaks locked entries or keeps stale ones. That is invariant 14's whole purpose, silently bypassed.
  - Their chat sync never deletes (above), so swiped or rolled-back replies come back as "memory" that contradicts our state after a rollback.
- *Ours:* `PROBES` covers only macros, slash, backgrounds, vectors and judge (`src/services/stHost/capabilities.ts:68`). No third-party detection exists.
- *Fit:* read-only, `present|absent`. It blocks nothing and never touches their settings. A new `stHost` module is required (invariant 2).

**4. Token normalization.**
- *What:* `tokenize` should lowercase, strip punctuation, and fold diacritics with NFD minus combining marks. It must stay language-neutral.
- *Ours:* `memory/similarity.ts:15-17` splits on whitespace only, so "tower." ≠ "tower". It feeds scoring (`score.ts:61,73`), arc dedup (`arcs.ts:40,59`), epistemic dedup (`epistemic.ts:47`) and the consolidation fallback (`consolidate.ts:44`).
- *Theirs:* BM25+ with an English stopword list and a Porter stemmer (`core/bm25-scorer.js:30-190`). **Do not copy the stemmer or stopwords.** They are English-only, our fixtures are 8/25 Spanish, and the list contains `never`/`no more`-type negation carriers that matter to epistemic dedup.
- *Conflict:* the dedup thresholds were tuned on the current tokenizer. Predeclare the floor and measure on the existing fixtures before shipping (invariant 7 spirit).

**5. Chat identity via `integrity`.**
- *Facts:*
  - ST mints `chat_metadata.integrity` (a uuid) on chat load (`public/script.js:7665`, `public/scripts/group-chats.js:277`).
  - A rename keeps the metadata.
  - Branches and checkpoints mint a fresh one (`public/scripts/bookmarks.js:201,284`), while `saveChat` merges `{...chat_metadata, ...withMetadata}` (`script.js:7406`). **So a branch carries our blob, stamped for the parent.**
  - VectHare keys on integrity (`core/collection-ids.js:69-80`).
- *Ours:* stamp = chat file id, with the `restampRenamedChat` workaround (`src/runtime/persistence.ts:97`). An explicit select adopts a foreign blob (`storySelection.ts:71`). `loadStory` then hydrates the engine state as saved (`runtimeManager.ts:541-543`), and I found no reconciliation against a chat shorter than the state. A branch cut at message 10 of a story at boundary 40 would therefore adopt state ahead of its own transcript. **Unverified live, needs a probe.**
- *Idea:*
  - Stamp with `integrity`, falling back to chatId. That makes renames and imported files self-identifying.
  - Treat "fresh integrity + `main_chat` present + parent-stamped blob" as a **branch**: offer to adopt and roll back to the branch's last message instead of adopting as-is.
- *Conflict:* blob version bump + migration (invariant 13). The rollback must reuse `runRollback` (invariant 11).

**6. Orphaned mirror book on delete.**
- *Theirs:* purge on `CHAT_DELETED`/`GROUP_CHAT_DELETED` (`index.js:323-340`).
- *Payloads:* `CHAT_DELETED` carries the file name (`script.js:1354,1401,10884`); `GROUP_CHAT_DELETED` carries the chatId (`group-chats.js:1334,2269,2308`).
- *Ours:* `events.ts:11-12` types both with **no args**, and there is no subscriber. The debug rules already record that deleting a chat leaves `Story Orchestrator - <title> - <chatId>` behind (`runtime/memoryMirror.ts:50`).
- *Idea:* delete only listed books matching our prefix and ending in ` - <deletedChatId>` (the so-journey cleanup rule). Return a `WriteResult` (invariant 16) and journal it, or surface it as a Repair item if silent deletion is judged too destructive.

**7. Embedding rerank for the empty `memoryRerank` slot.**
- *Ours:* the `memoryRerank` toggle has no consumer (`src/judge/settings.ts:15,118`; `judge/readiness.ts:39`). Relevance is Jaccard.
- *Idea:* a per-chat ST-vectors collection mirroring live memory rows. Insert on add; delete on drop, quarantine and rollback. Query at the boundary with the last reply, or budgeted at `GENERATION_STARTED` like `loreSelect` (`runtime/index.ts:153-158`). Fall back to Jaccard.
- *Two hard lessons from them:*
  - The index must be **derived from the store and follow rollback** (invariant 11). Their add-only sync is the counter-example.
  - The standard `/api/vector/query` returns no score (see host facts), so ranking must use threshold bands, as `consolidationMatches` already does.
- *Also:* if it ships as a non-judge option, it needs its own opt-in and default-off. Keep it off the reply path unless budgeted (invariant 5).

**8. Author scene-break mark.**
- *Theirs:* manual start/end markers (`ui/scene-markers.js:195-235`; `core/scenes.js:133`).
- *Ours:* heuristic only, English phrases (`memory/sceneDetect.ts:3-30`). There is no manual trigger: a grep for `markScene|forceSceneBreak` returns nothing.
- *Idea:* `/cp scene` or an author-view button that forces the P2 scene-break pass for the current window.
- *Fit:* it must be a cue that forces a read, never a state write (invariant 4). Avoid injecting message-DOM buttons: SO does not touch `.mes`.

**9. Scene-relative recency.**
- *Theirs:* age resets at scene start, so an old scene decays by its start (`core/temporal-decay.js:253-310`).
- *Ours:* recency is `1/(1+age/12)` in boundaries (`memory/score.ts:55-56`), although scene breaks are tracked.
- *Assessment:* small and pure, but the payoff is speculative. Measure before adopting.

## Patterns to copy / anti-patterns to avoid
**Copy**
- Per-stage, per-item fate records with reasons (idea 2). Their debugging culture is the best part of the code.
- Resolve the DOM `mesid` at click time, not at bind time (`ui/scene-markers.js:209-217`). This matters if we ever bind to messages.
- Read-back verification after `setExtensionPrompt` (`chat-vectorization.js:1521`). We already do this better, via `readInjectedPromptBlocks`.
- Per-chat cleanup driven by delete events (idea 6).

**Avoid**
- **Retrieval inside `generate_interceptor`.** Every generation, including each group member draft, awaits embedding round-trips (`index.js:168`, `chat-vectorization.js:1628+`). This breaks our invariant 5.
- **Append-only derived index.** Edits, swipes and deletes never delete vectors (see How it works). Rolled-back text resurfaces.
- **Per-chunk metadata in install-wide `extension_settings`, keyed by a 32-bit text hash** (`collection-metadata.js:388-414`). Identical short lines ("Yes.") share flags across chats, `settings.json` grows without bound, and they had to ship a `checkHashCollisionRate` diagnostic. This is invariant 13's reason to exist.
- **Keyword match → `score = 1.0`** (`chat-vectorization.js:1756`). It flattens the ranking into ties, the same failure our plan-10 spike measured (tie rate 1.00).
- **Snapshot-injecting WI outside ST's activation pipeline.** It bypasses `disable`, position, depth and gating (idea 3).
- **`meta.score || 1.0` over a backend that returns no score** (`chat-vectorization.js:694`, `backends/standard.js:377`). On the default backend, threshold and decay work on a constant, and nothing reports it.
- **English-only lexical tooling** (idea 4).
- **Console flood.** Hundreds of `console.log` lines per generation, plus a leaked `window.VectHare_LastSearch` global.

## ST host facts learned
- `generate_interceptor` is called as `(chat, contextSize, abort, type)`. Interceptors run sequentially, sorted by `loading_order` then `display_name`, and each one's throw is caught (`public/scripts/extensions.js:2024-2046,49`; they use it at `index.js:168`). Ours (`loading_order: 1`) runs before theirs (100). Consistent with our use.
- `/api/vector/query` threshold-filters `metadata` and **drops `score`**, while `hashes` is **unfiltered** (`src/endpoints/vectors.js:390-391`). Their `m.score || 0` (`backends/standard.js:377`) confirms our existing vectors gotcha. It does not contradict it.
- `/api/extra/classify` reads only `text` and uses the server's configured pipeline with `topk: 5`; a requested model is ignored (`src/endpoints/classify.js:25-45`; noted at their `core/emotion-classifier.js:141`).
- `chat_metadata.integrity` is a uuid minted on load (`script.js:7665`, `group-chats.js:277`). Branches and checkpoints get a fresh one but otherwise copy the parent's `chat_metadata`, **our blob included** (`bookmarks.js:201,284`; `script.js:7406`). New to our docs.
- `CHAT_DELETED(fileName)` (`script.js:1354,1401,10884`) and `GROUP_CHAT_DELETED(chatId)` (`group-chats.js:1334,2269,2308`) carry a payload. **This contradicts our vendored event map**, which types both as `[]` (`src/services/stHost/events.ts:11-12`). Harmless today, because nothing subscribes.
- ST renumbers `.mes[mesid]` in place after a delete (`script.js:9467 updateViewMessageIds`) without re-rendering. Their `scene-markers.js:209-212` depends on this.
- When prompt assembly prepends file attachments, it records `extra.fileLength`; the text of the message itself is `mes.substring(fileLength)` (`public/scripts/chats.js:508-525`, used at `vectors/index.js:903` and their `chat-vectorization.js:107-110`). This is not a current issue for us: our window reads the stored `ctx.chat`.
- ST's built-in Vectors deletes stale hashes on sync (`public/scripts/extensions/vectors/index.js:502`). VectHare's fork of that code lost it.

## Verdict
Relevance **medium**. It is a RAG engine, not a story engine: its retrieval model conflicts with our reply-path and rollback invariants, so none of the core should be adopted. The one thing worth taking is **idea 1, cleaning the transcript before extraction**: cheap, pure, and it improves every read and its token cost. Close behind:
- the per-row fate trace (idea 2);
- the interop warning (idea 3), because a player running VectHare semantic WI silently defeats checkpoint lore gating;
- the `integrity`/branch finding (idea 5), which exposes a probable branch-adoption gap in our own persistence and is worth a live probe regardless of VectHare.
