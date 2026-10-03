# Plan 29 — Smart Context and Chat Vectorization (Vector Storage): what to harvest for our memory

**Status: RESEARCH 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

The user's question: "we have our own system for this right? is there any pattern to harvest?" for
<https://docs.sillytavern.app/extensions/smart-context/>, extended to
<https://docs.sillytavern.app/extensions/chat-vectorization/> (ST's built-in Vector Storage: chat vectorization + Data
Bank). Short answer: yes, our tiers cover what both do for *summarised* memory, and do it with typed state, rollback and
per-member privacy. What we lack is **verbatim recall**: getting the actual past message back. That is the one pattern
worth a measured spike. Everything else is either already built (thresholds, top-k, token budget, archive recall) or
conflicts with our privacy model.

## 1. What they are (verified)

### 1.1 Smart Context — deprecated

- The docs page opens with "THIS EXTENSION IS NO LONGER MAINTAINED AND NOT RECOMMENDED TO USE" and points to Chat
  Vectorization (fetched 2026-10-03).
- It needed SillyTavern-Extras with the `chromadb` module (`--enable-modules=chromadb`). One ChromaDB collection per
  chat, filled with the whole history; starts after 10 messages.
- Settings: memory injection amount (max memories), individual memory length (chars), chat history preservation (keep
  last N), injection strategy (replace oldest history / add to bottom / custom depth with a template / % of history),
  memory recall strategy ("this chat only" or experimental "all character chats"), manual text-file insert, purge,
  JSON import/export.
- No Smart Context code ships in this ST checkout: `grep -ril "smart-context\|chromadb" public/scripts/extensions/`
  in `C:\dev\SillyTavern-MainBranch` finds nothing. It is history; Vector Storage replaced it.

### 1.2 Vector Storage (built-in `vectors` extension) — current

All citations are `C:\dev\SillyTavern-MainBranch\public\scripts\extensions\vectors\index.js` unless named.

| Aspect | Fact | Cite |
|---|---|---|
| Off by default | `enabled_chats: false`, `enabled_files: false`, `enabled_world_info: false` | `:86`, `:98`, `:117` |
| Embedding source | default `transformers` (local, in the ST server); many remote sources | `:60-76` |
| Indexing | a module worker syncs the chat: one item per message, keyed by `getStringHash(mes)`; `is_system` (hidden) messages skipped unless `keep_hidden` | `:440-470`, `:463` |
| Follows the transcript | hashes no longer in the chat are deleted on the next sync; sync runs on sent/received/edited/swiped/deleted; collection purged on chat delete | `:468`, `:500-503`, `:2086-2093` |
| Chunking | messages split at 400 chars (`message_chunk_size`), optional custom delimiter | `:94`, `:294-313` |
| Summarize before vectorize | optional: the *summary* is embedded (main model or Extras/WebLLM, 250-word prompt, messages ≥ 200 chars), and optionally the query is summarised too | `:77-82`, `:473-485`, `:913-918` |
| Retrieval runs on the reply path | `generate_interceptor: vectors_rearrangeChat`, `loading_order` 100; skips `quiet` | `manifest.json:3,8`; `:776-781` |
| Query | the last `query` (2) messages joined | `:901-922`, `:93` |
| Top-k + threshold | `topK = insert` (3), `threshold = score_threshold` (0.25); the server filters by score and **drops the score** | `:92`, `:95`, `:1151-1170`; `src/endpoints/vectors.js:385-390` |
| Keep last N | the last `protect` (5) messages are never retrieved; nothing happens below 5 messages | `:91`, `:806-823` |
| Verbatim injection | matches are found by hash in the live chat, **spliced out of the prompt's chat array**, and injected as `name: mes` under `Past events:\n{{text}}`. Even with summarize-before-vectorize on, the **original message** is injected | `:826-868` |
| Position/depth | key `3_vectors`, default `IN_PROMPT` (after main prompt), depth 2 (used only for in-chat position), `scan = include_wi` (default false) puts the block in the WI scan buffer | `:52`, `:88-90`, `:854`; `setExtensionPrompt(key, value, position, depth, scan, role, filter)` `public/script.js:8926`; positions `:484-489` |
| Data Bank (files) | documents in global / character / chat scope; chunks 2500 chars, top 5, threshold shared, `Related information:` at depth 4 (key `4_vectors_data_bank`) | `:105-115`, `:673-696`; `.claude/sillytavern-docs/data-bank.md:13-17,178` |
| Vectorized WI | queries vectorized lorebook entries and force-activates the top `max_entries` (5) | `:117-119`, `:1624-1725` |
| One collection per chat | `queryCollection(chatId, …)`; no per-speaker or per-member filter exists | `:819` |
| Docs warning | dynamic prompt prefixes cause prompt-cache misses | chat-vectorization docs page |

Smart Context vs Vector Storage: same idea (embed the chat, retrieve N past messages by similarity to recent text,
inject them), Vector Storage moved it into the ST server (no Extras), added chunking, summarize-before-vectorize, Data
Bank and vectorized WI, and dropped Smart Context's "all character chats" scope and %-replacement strategies.

## 2. Our system vs them

| Concern | Smart Context / Vector Storage | Story Orchestrator | Cite (ours) |
|---|---|---|---|
| What is stored | raw message text (or its summary) as vectors | typed rows extracted by the memory model: tiers `facts`, `session_details`, `short_term`, `scene_history`; plus canon, arcs, epistemic, ledger, chapter records | `src/memory/types.ts:3`, `:59-77`; `src/extraction/sharedRead.ts` |
| Selection per prompt | similarity top-k ≥ threshold | budgeted score: importance, durability, confidence, recall count, recency, entity overlap, **Jaccard** as `semanticSimilarity`, temporal proximity, triggers, open arcs | `src/memory/score.ts:18-26`, `:45-80` (Jaccard `:61`) |
| Injection | one block (`Past events`) | one key per tier + epistemic/ledger/scene/chronicle/bridge keys, fixed depths, a registry with collision and scan rules | `src/constants/injectionRegistry.ts:14-29`, `:37-38` |
| Our use of ST vectors | — | ephemeral collections only: consolidation bands 0.82 / 0.55 (+ cross-type dup) and **archive recall's semantic band** (0.55). Never a persistent chat index. Correction to the brief: not "dedup only" | `src/runtime/consolidationMatches.ts:9-48`; `src/runtime/chapterKit.ts:97-114`; `src/memory/consolidate.ts:13-16` |
| Recall of old material | retrieves any past message | D10 archive recall: only **folded** rows of sealed chapters, only when the last player turn or the objective **names** an entity those rows carry; k = 4, `recallTokens` 200; rides `scene_history`; runs in our interceptor. Off by default until Q-M5 | `src/memory/archiveRecall.ts:7-8`, `:30-39`, `:41-68`; `src/runtime/chapterKit.ts:122-149`; `src/runtime/wiring/talk.ts:57`; `src/runtime/chapters.ts:93` |
| Raw source of a summary | the message itself | scene/derived records keep a message `range`; a raw re-read exists only for a memory conflict | `src/runtime/coordinators/memoryCoordinator.ts:195`, `:207`; `src/runtime/memoryQueue.ts:333` |
| Context reclamation | splices retrieved messages out of the prompt chat | `chapters.fold` drops sealed-chapter messages from the prompt chat (feature off until Q-M) | `src/runtime/wiring/talk.ts:58`; `docs/plans/v2.6/07-chapters-and-saga-memory.md` Q-M3 |
| Rollback | implicit: index follows message hashes | explicit: every tier and derived artifact reverses by message (`rollback ≡ replay` property test) | `src/memory/reverse.ts:48`; `src/memory/derived.ts:56`; `src/memory/rollbackReplay.property.test.ts` |
| Curation | purge only | pin / exclude / edit / lock as canon, quarantine | `docs/plans/v2.1` drawer Memory tab; `src/runtime/memoryQueue.ts` |
| Group privacy | none: whole chat collection, every drafted member gets the same `Past events` | per-member private epistemic block swapped per draft; epistemic/ledger never scannable; WI mirror holds relationships only | `src/runtime/memoryInjector.ts:115`, `:246`, `:289`; `injectionRegistry.ts:37`; `src/runtime/memoryMirror.ts:66-67` |
| Keyword channel | vectorized WI | per-chat mirror book, scanned (scan mode) or bound (file mode) | `src/runtime/memoryMirror.ts`; `src/runtime/mirrorScan.ts:27-105` |

Prior analysis agrees: `.claude/sillytavern-docs/community/prompting-memory-prior-art.md` §10 marks vector retrieval
"Partial: no embedding-based retrieval for injection" and §11 notes coexistence (users running Vector Storage get a
second, undetected memory stream) and "the embedding backend is already wired, but only for dedup" (archive recall
has used it since; see above). `docs/plans/v2.4/extension-research/SUMMARY.md` row "Timeline-Memory" names the gap
exactly: "summary routes, raw transcript answers" (`timeline-memory-an-agentic-memory-system.md:27`, `:46`, `:60`), and
VectHare's report notes ours is "more accurate about truth … and weaker on relevance"
(`vecthare-a-rag-and-vector-foundational-overhaul.md:40`).

### 2.1 The privacy conflict is measured, not hypothetical

- Plan 22 F2 (v2.6 Adolion lab, Summarize off): **41 unwitnessed lines visible**, and the diagnostics placed the leaks in
  Vector Storage's `Past events:` block (`22-sp9-witness-filter-v2.md:37`). Their interceptor runs after ours (ours
  `loading_order` 1, theirs 100, `22:82`) and splices matched messages out of the chat it is given (`22:85`).
- So a global transcript retriever, theirs or a naive one of ours, re-injects scenes a member never witnessed into that
  member's prompt. Any recall we build must not reopen that channel.
- Plan 02 C2 already answers the host side: a Repair row warning the author when Summarize or chat vectors are on in a
  group story that holds secrets (`02-v26-carry-in.md:15`; design `22:93`, row A). Not built yet.

## 3. Patterns worth harvesting

| # | Pattern | Where it plugs in | Rollback | Privacy | Cost | Verdict |
|---|---|---|---|---|---|---|
| P1 | **Verbatim quote recall**: for "what exactly did X say / promise / name", retrieve the past *message*, not a summary | new off-by-default recall beside D10: a per-chat transcript index keyed by message content hash (Vector Storage's pattern), query = last player turn + last reply; inject ≤ k quoted lines as a one-turn block (`Recalled, word for word:`), never splicing the chat | safe by construction if the index follows hashes like `:468`/`:500-503` (a swiped/deleted message's hash leaves the index); plus a hard filter against the live chat at query time, so a not-yet-synced deletion is never returned | **solo only** until plan 22 B lands witness records; in a group, refused when the store holds a `[hiding]`/`[unaware]` row (same predicate as C2) | one embedding per message (local `transformers`, ST server CPU), a persistent collection per chat (disk; eMMC not relevant here, this is the Windows install), one query per loud generation on the reply path | **spike** (§6) |
| P2 | **Summary routes, raw answers** (their summarize-before-vectorize injects the original; Timeline-Memory's drill-down) | index our `scene_history`/chapter rows (already summaries, already carry `range`), return the matched row's raw `range` lines trimmed to the budget | rows already reverse by message; the raw read is from the live chat | same as P1 | lower than P1 (index = rows, not messages); the raw window may be long, so it needs a quote picker (lexical or judge) | variant arm of the P1 spike |
| P3 | **Query by recent messages, no entity gate** | D10 today fires only when an entity is named (`archiveRecall.ts:30-39`); with vectors present, also query by the last turn's text | unchanged | unchanged (folded rows are shared memory) | one more vector query | measure inside Q-M5 as an arm; no code before |
| P4 | **Embedding relevance for live-tier scoring** | replace Jaccard `semanticSimilarity` (`score.ts:61`) with vector band membership, as `selectRecall` already does with `semantic` (`archiveRecall.ts:44-55`) | the band is derived from the store per call, nothing persisted | none new | an ephemeral insert + query per injection refresh today's way (`chapterKit.ts:97-114` pattern), or a persistent row index; not determined which is cheaper | later; only if P1's spike shows ranking matters |
| P5 | **Per-member witnessed retrieval** | P1/P2 with a filter: a member gets only messages it witnessed | needs witness records that reverse with the message | this is plan 22 option B/C | plan 22's cost (L) | blocked on plan 22 (deferred to the next version, `00-overview.md:81`) |
| P6 | **Evidence retrieval for the warden / judge** | the warden's fact list is the established facts, capped at 40 (`src/runtime/continuity.ts:29-57`, `src/judge/policy.ts:72`); plan 14 J7.2 (canon verification) needs sources. Retrieved verbatim lines would let a check cite what was said | read-only, nothing stored | warden output is a one-turn note; quotes must obey the same witness rule as P1 | bounded by TypeSafe's request limits (CLAUDE.md judge invariant) | candidate input for plan 14; not its own build |
| P7 | **Data Bank-style document retrieval** | not player memory. Fits plan 27 (wizard assistant: retrieve from the shipped docs knowledge base) | n/a | n/a | plan 27's | hand to plan 27 |
| P8 | **Prompt-cache warning** | our dynamic blocks have the same effect; note for plan 10 (model choice) if a cached CC backend is chosen | — | — | — | note only |

What we already do as well or better, so nothing to harvest: threshold + top-k + token budget (D10's 0.55 / 4 / 200);
recency and importance weighting (`score.ts`); per-chat scoping; rollback (explicit and property-tested, where theirs is
a side effect of hashing); curation; per-member privacy; typed state that steers gates. Not to copy: splicing retrieved
messages out of the prompt chat (it shifts depth-based injections, `22:86`), and Smart Context's "all character chats"
scope (cross-story bleed; our stories never share assets, CLAUDE.md storyLore invariant).

## 4. Options

| Option | What | Size | Risk |
|---|---|---|---|
| A | Nothing new for memory; ship 02 C2 (host-channel Repair row); finish Q-M (D10) measurement | S (C2 already planned) | none new |
| B | A + a measured P1/P2 spike, solo chats only, off by default, dev flag | M | reply-path latency; a quote out of context misleads the model |
| C | B + P4 (vector relevance for live tiers) | M+ | cost per refresh; could reorder tiers the floors were measured on |
| D | Tell players to switch Vector Storage on next to us | — | refused: measured leak in groups (§2.1); double recall and budget contention (prior-art §11) |

## 5. Recommendation

**A now, B after Q-M5 has a result.** C2 is the only thing the comparison makes urgent. D10 (archive recall) is the
closest thing we have to Smart Context and is unmeasured: the Q-M rating pack has 1 of the 20 pairs it needs, none rated
(`test/sessions/rating-pack/Q-M/status.json`). Running B before Q-M5 would measure a second recall path before the first
one has a number. P3 should be added as an arm to Q-M5 rather than built. B stays solo-only until plan 22 decides witness
records; P5/P6/P7 go to plans 22, 14 and 27.

## 6. Exploration: spike "verbatim recall" (option B)

Predeclared floors. A missed floor keeps the feature off and records why; nothing is retuned (CLAUDE.md spike rule).

- **Fixture.** ≥ 40 English questions (W25) of the form "what exactly did X say/promise/call Y", each labelled with the
  gold message id(s), drawn from v2.6 session transcripts (`test/sessions/T*/T*-*/chat-*.json`). Two constraints:
  the repo is public, so the labelled fixture lives in the private `so-sessions` repo (`npm run sessions:archive`); and
  the user is playing Adolion unspoiled, so questions are written and checked by another model, never shown in reports.
  Plus a group slice with nonce markers in witnessed-only scenes (plan 22's method, `22:133`), for the privacy floor.
- **Arms.** R0 = today (tiers + D10 as configured); R1 = P1 message index; R2 = P2 row index → raw range.

| # | Metric | Floor | Decides |
|---|---|---|---|
| VR1 | gold message in the retrieved set (recall@k, k ≤ 4) | R ≥ 0.80 | the index works at all |
| VR2 | answer accuracy of the real reply, judge-scored, human spot-check of 10 | R − R0 ≥ +0.15, wrong-answer rate not higher than R0 | ship behind the flag |
| VR3 | tokens added per generation | p95 ≤ 250 | budget |
| VR4 | reply-path time added (query + filter) on the lane backend | p95 ≤ 300 ms; indexing never on the reply path | latency |
| VR5 | swipe/edit/delete: a removed message is never returned | 0 in jest property cases and in one live mutation run | rollback |
| VR6 | group slice: nonce text from an unwitnessed scene in another member's request | 0 (feature refused in groups with secrets; must stay 0 with Vector Storage off) | privacy |

R1 vs R2: if both pass, take the cheaper (index size and VR4); if neither passes VR2, record and stop.

## 7. Decisions for the user

1. Build order: C2 first, Q-M5 (with P3 as an arm) next, this spike only after? Recommended: yes.
2. Is verbatim recall wanted at all for play, or is summarised memory enough? (Nothing in the v2.6 session flags
   has been checked for "the character misquoted me"; not determined.)
3. Solo-only until plan 22's witness records: acceptable? Recommended: yes.
4. Should the spike's index persist per chat on disk (ST's vectors folder) or be rebuilt per session? Not determined;
   the spike measures both costs.

## 8. Gates

- Docs only now: none.
- If B is built: `npm run gates` (typecheck, lint, jest incl. a `rollback ≡ replay`-style property case for VR5,
  `typecheck:test`, build, `test:release`, Storybook); the index host access goes in a new `stHost/` module behind
  `STAPI.ts`; every async write takes a `RunOwnership` (census row in `test/findings/ownership-sites.json`); the
  injection key added to `INJECTION_REGISTRY`, never scannable; live gate on an adolion-fresh lane with the real model
  (VR2–VR6), run twice.

## 9. Links

- `02-v26-carry-in.md` row C2 — host-channel Repair row (Summarize / chat vectors on in a group with secrets).
- `22-sp9-witness-filter-v2.md` — F2 leak in `Past events:`, options A–C, witness records (P5).
- `18-character-life.md` — off-screen time and relationships; recall of exact past words would feed it.
- `14-j7-judge-ideas.md` J7.2 canon verification — candidate consumer of P6 evidence.
- `27-wizard-assistant.md` — knowledge-base retrieval (P7).
- `docs/plans/v2.6/07-chapters-and-saga-memory.md` D10 + Q-M floors — the archive recall this compares against.
- `.claude/sillytavern-docs/community/prompting-memory-prior-art.md` §8.2, §10, §11.
- `docs/plans/v2.4/extension-research/timeline-memory-an-agentic-memory-system.md`, `vecthare-a-rag-and-vector-foundational-overhaul.md`.

## Unresolved questions

- Checked: `gatedInterceptor`'s group flag only feeds the loud-generation gate (`src/runtime/loudGenerationGate.ts:32-42`),
  so D10 recall runs in solo chats too, inside our interceptor. A P1 block would sit on the same path. I think this plugin makes no sense for solo players, lets only consider group. Plugin should be disabled for solo chats.
- Score values are not returned by `/api/vector/query` (`src/endpoints/vectors.js:390`), so ranking within the
  retrieved set is by band, as today. Whether that is enough for VR1 at k ≤ 4: not determined. whatever u recommend here, please do a proper review and evaluation, this is an interested topic

## Review of the answers (2026-10-03)

- **Solo chats:** the user decided the plugin runs in **group chats only** (plan 33). So:
  - the D10 solo path is removed;
  - this plan's "solo first" spike scope is gone.
  - Verbatim recall can only ship for groups, and in a group it must be filtered by who witnessed the message.
  - That ties P1 to a witness record, which plan 22 deferred to the next version.
- **New sequence:**
  1. C2 (shipped).
  2. Q-M5 with the P3 arm.
  3. The verbatim-recall spike on group chats in **offline replay only**, with a witness filter built from scene
     presence (the per-scene `present` set the scene read already records), measured against the "no unwitnessed text"
     floor.
  4. If presence is too weak (plan 22 measured 4/40 agreement for message-level labels), P1 waits with plan 22.
- **"Do a proper review and evaluation" of ranking within the retrieved set:** a dedicated evaluation step, E0, before
  the spike.
  - **The question.** `/api/vector/query` returns no scores (`src/endpoints/vectors.js:390`), so today we rank by
    threshold bands (two queries at 0.82 and 0.55).
  - **Arms on the labelled "what did X say" set:**
    - (a) bands only;
    - (b) more bands (0.82/0.7/0.55/0.4);
    - (c) re-rank the retrieved candidates locally with Jaccard plus recency;
    - (d) re-rank with the judge (one Choice over the top 8, TypeSafe);
    - (e) ST's own ordering.
  - **Metrics:** hit@1, hit@4, MRR, latency and token cost.
  - **Floors are declared before the run.** The cheapest arm that meets hit@4 ≥ 0.80 wins; a costlier arm must beat it
    by ≥ 0.10 MRR to be chosen.
  - **The fixture:** written by another model from private session transcripts (`so-sessions`), spot-checked by Claude,
    never shown to the user (Adolion content).
