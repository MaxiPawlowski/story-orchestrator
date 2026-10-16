# Plan 21 — Smart Context and Chat Vectorization: what to harvest (E0 + offline group evaluation)

**Status (2026-10-14): v2.8 plan 21 (was v2.7 plan 29). E0 tooling built on `v2.8-a12-e0` (arms, scorer, runner, synthetic
run; Gate record at the end); E0 CL run owed (private labels, lane pool, arm (d)). §6.2 not started.** Runtime verbatim recall is deferred, v2.9 05.
Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D (fixture tooling, offline runner, scorer); acceptance CL
(TypeSafe Choice arm, second-model labels). Embeddings run in a lane's ST server (`transformers`, CPU); no pod.

The user's question: "we have our own system for this right? is there any pattern to harvest?" for
<https://docs.sillytavern.app/extensions/smart-context/>, extended to
<https://docs.sillytavern.app/extensions/chat-vectorization/> (ST's built-in Vector Storage: chat vectorization + Data
Bank). Short answer: yes, our tiers cover what both do for *summarised* memory, and do it with typed state, rollback and
per-member privacy. What we lack is **verbatim recall**: getting the actual past message back. In a group (the only mode
the plugin supports, v2.7 03) that is only safe with a witness filter. This plan measures two things offline: how to
rank vector results (E0), and whether a group witness filter can keep recall useful without leaking (§6). It ships no
runtime feature.

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
| Top-k + threshold | `topK = insert` (3), `threshold = score_threshold` (0.25); the server sorts by score (`store.queryItems`), filters by threshold and **drops the score**; `hashes` lists all top-k in score order | `:92`, `:95`, `:1151-1170`; `src/endpoints/vectors.js:385-392` |
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
| Our use of ST vectors | — | ephemeral collections only: consolidation bands 0.82 / 0.55 (+ cross-type dup) and **archive recall's semantic band** (0.55). Never a persistent chat index | `src/runtime/consolidationMatches.ts:9-48`; `src/runtime/chapterKit.ts:97-114`; `src/memory/consolidate.ts:13-16` |
| Recall of old material | retrieves any past message | D10 archive recall: only **folded** rows of sealed chapters, only when the last player turn or the objective **names** an entity those rows carry; k = 4, `recallTokens` 200; rides `scene_history`; runs in our interceptor. Off by default until Q-M5 (v2.8 01 §F M1) | `src/memory/archiveRecall.ts:7-8`, `:30-39`, `:41-68`; `src/runtime/chapterKit.ts:122-149`; `src/runtime/wiring/talk.ts:57`; `src/runtime/chapters.ts:93` |
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

- v2.6 Adolion lab F2 (Summarize off): **41 unwitnessed lines visible**, and the diagnostics placed the leaks in Vector
  Storage's `Past events:` block (`docs/plans/v2.9/02-sp9-witness-filter-v2.md` §History, row F2). Their interceptor
  runs after ours (ours `loading_order` 1, theirs 100; v2.9 02 H1) and splices matched messages out of the chat it is
  given (v2.9 02 H4).
- So a global transcript retriever, theirs or a naive one of ours, re-injects scenes a member never witnessed into that
  member's prompt. Any recall we build must not reopen that channel.
- The host side is shipped: v2.7 02 C2, the `transcript-copiers` check warning when Summarize or chat vectors are on in a
  group story (`docs/plans/v2.7/02-v26-carry-in.md` §Gate record C2). Its player copy currently reveals that a secret is
  held (review K1); the fix is pending in v2.7.
- The witness filter itself (witness records, the host-channel-aware filter) is **v2.9 02, deferred**. This plan does not
  build it; §6 only measures whether the scene-presence set that already exists is good enough to filter retrieval
  offline.

## 3. Patterns worth harvesting

| # | Pattern | Where it plugs in | Rollback | Privacy | Cost | Verdict |
|---|---|---|---|---|---|---|
| P1 | **Verbatim quote recall**: for "what exactly did X say / promise / name", retrieve the past *message*, not a summary | a per-chat transcript index keyed by message content hash (Vector Storage's pattern), query = last player turn + last reply, ≤ k quoted lines as a one-turn block, never splicing the chat | safe by construction if the index follows hashes like `:468`/`:500-503`, plus a hard filter against the live chat at query time | **group only, and only behind a witness filter**: a member gets only messages it witnessed | one embedding per message (local `transformers`), a collection per chat, one query per loud generation | **offline evaluation here (§6); runtime build deferred, v2.9 05** |
| P2 | **Summary routes, raw answers** (their summarize-before-vectorize injects the original; Timeline-Memory's drill-down) | index our `scene_history`/chapter rows (already summaries, already carry `range`), return the matched row's raw `range` lines trimmed to the budget | rows already reverse by message | same as P1 | lower than P1 (index = rows, not messages); needs a quote picker | arm R2 of §6 |
| P3 | **Query by recent messages, no entity gate** | D10 today fires only when an entity is named (`archiveRecall.ts:30-39`); with vectors present, also query by the last turn's text | unchanged | unchanged (folded rows are shared memory) | one more vector query | an arm inside Q-M5, owned and slotted by v2.8 01 §F M1; no code here |
| P4 | **Embedding relevance for live-tier scoring** | replace Jaccard `semanticSimilarity` (`score.ts:61`) with vector band membership | derived per call | none new | an ephemeral insert + query per refresh, or a persistent row index | later; only if E0 shows ranking matters |
| P5 | **Per-member witnessed retrieval** | P1/P2 with a durable witness record | needs witness records that reverse with the message | v2.9 02 option B/C | L | deferred with v2.9 02 |
| P6 | **Evidence retrieval for the warden / judge** | the warden's fact list is the established facts, capped at 40 (`src/runtime/continuity.ts:29-57`, `src/judge/policy.ts:72`); v2.8 13 J7.2 (canon verification) needs sources | read-only | quotes obey the same witness rule as P1 | bounded by TypeSafe's request limits | candidate input for v2.8 13; not its own build |
| P7 | **Data Bank-style document retrieval** | not player memory. Fits v2.8 09 (wizard assistant: retrieve from the shipped knowledge base) | n/a | n/a | v2.8 09's | handed to v2.8 09 |
| P8 | **Prompt-cache warning** | our dynamic blocks have the same effect; a note for v2.7 12 (model choice) if a cached CC backend is chosen | — | — | — | note only |

What we already do as well or better, so nothing to harvest: threshold + top-k + token budget (D10's 0.55 / 4 / 200);
recency and importance weighting (`score.ts`); per-chat scoping; rollback (explicit and property-tested); curation;
per-member privacy; typed state that steers gates. Not to copy: splicing retrieved messages out of the prompt chat (it
shifts depth-based injections, v2.9 02 H5), and Smart Context's "all character chats" scope (cross-story bleed; our
stories never share assets, CLAUDE.md storyLore invariant).

## 4. Options

| Option | What | Size | Status |
|---|---|---|---|
| A | Nothing new for memory; C2 (shipped, v2.7 02); Q-M5 with the P3 arm (v2.8 01) | S | in hand |
| B | A + **offline** evaluation: E0 ranking, then group witness feasibility (§6). No runtime code, no flag | M | **this plan** |
| C | B + a runtime verbatim-recall feature (reply path, group, witness-filtered) | M+ | deferred, v2.9 05 |
| D | Tell players to switch Vector Storage on next to us | — | refused: measured leak in groups (§2.1) |

Rejected: a solo-only spike (no solo support, v2.7 03); P4 before E0.

## 5. Recommendation

**A + B.** Superseded the earlier "A now, B after Q-M5, solo first" by the user's answers (below): group chats only,
offline only, E0 first.

- **E0 runs first and does not wait for Q-M5.** It ranks vector results over a frozen offline pool; D10 is not in it.
- **The group witness spike (§6.2) runs after Q-M5 has a result** (v2.8 01 §F M1), because its R0 baseline is D10 as
  Q-M5 leaves it configured. Q-M5's owner and slot are v2.8 01; its corpus (rating pack 1 of 20 pairs, none rated,
  `test/sessions/rating-pack/Q-M/status.json`) and ratings are still outstanding.
- **The shipping decision is not made here.** The spike reports retrieval quality, privacy and persistence costs; a
  runtime build is a v2.9 05 decision that reads this plan's record.

## 6. Exploration (offline)

Predeclared floors. A missed floor is recorded with its reason; nothing is retuned (CLAUDE.md spike rule). Everything in
this section runs offline on a lane: embeddings from the lane's ST server (`/api/vector/*`, `transformers`), no reply
generation, no player.

**One review rule (v2.8 rule 11, B4).** Every question and gold label drawn from session evidence is written by one
model and checked by a **second, different model**; a label the two disagree on is dropped, never adjudicated by the
user. The user never sees Adolion-derived rows. The labelled fixtures live in the private `so-sessions` repo
(`npm run sessions:archive`); only hashes, counts and scores enter this public repo.

### 6.1 Step 1 — E0: ranking within the retrieved set

**The question.** `/api/vector/query` returns no scores (`src/endpoints/vectors.js:390`), so our code ranks by threshold
bands (two queries at 0.82 and 0.55). Is that enough, or does a re-rank pay for itself?

**Frozen before any arm runs** (F35). The freeze is a commit in `so-sessions` whose hashes are recorded here first:

- **Questions and gold labels.** ≥ 40 English questions (W25) of the form "what exactly did X say/promise/call Y", from
  v2.6 group session transcripts (`test/sessions/T*/T*-*/chat-*.json`). Each carries the asking turn's message id and
  1–2 gold message ids. Labelled under the review rule above.
- **Candidate pool.** Per question, one collection built from the transcript up to (not including) the asking turn, the
  last 5 messages excluded (Vector Storage's `protect`). One `/api/vector/query` with `topK` 8 and threshold 0.0 gives
  the pool: 8 message ids in ST's score order. The pool is stored (ids, text hashes, ST order) and every arm ranks
  exactly this pool. **Pool recall** (gold in the pool) is reported separately; a question whose gold is not in the pool
  is a miss for every arm.
- **Ordered-output contract.** Every arm outputs a full order of the 8 pool ids, no duplicates, nothing added. An arm
  that cannot order a candidate puts it last.
- **Tie rule.** Equal arm scores are broken by ST's order, then by message id ascending. The tie rate per arm is
  reported raw, before any rounding (the v2.3 plan 10 rounding lesson).

**Arms:**
- (a) bands only (0.82 / 0.55; three groups);
- (b) more bands (0.82 / 0.7 / 0.55 / 0.4);
- (c) local re-rank: Jaccard plus recency;
- (d) **judge re-rank by repeated Choice with removal**: TypeSafe Choice over the 8 candidates picks rank 1; the pick is
  removed and Choice runs again over the rest; four calls give ranks 1–4, ranks 5–8 follow ST's order. All four calls
  always run (no early stop on a hit, which would read the gold), and all count in cost and latency (latency = the sum
  of the four sequential calls). Every call is ringed like any judge call;
- (e) ST's own order (score order from `queryItems`).

**Metrics** at cutoff 4, since recall injects k ≤ 4: hit@1, hit@4, MRR@4, pool recall, tie rate, calls per question,
p50/p95 latency per question, input tokens per question.

**Floors (declared now):** the cheapest arm with hit@4 ≥ 0.80 wins; a costlier arm must beat it by ≥ 0.10 MRR@4 to be
chosen. **No winner (Sol r3 R3-13):** if no arm reaches hit@4 0.80 there is no winning arm, and the floor is not
lowered. Then: with pool recall ≥ 0.80, ranking is the problem; with pool recall < 0.80, retrieval is the problem; in
both cases P4 stays parked and **§6.2 is recorded BLOCKED (insufficient E0)**, never scored against its floors. For the
record only, a **diagnostic arm** is named (highest hit@4, ties to the cheaper arm; it is not a winner and nothing
ships on it), and §6.2's fixture may be run once on it, labelled diagnostic, with its numbers kept beside E0's.

#### E0 as built: declarations (2026-10-14, written before any arm ran)

Everything below is fixed in code (`src/memory/e0Ranking.ts` `E0_FLOORS`, `E0_COST_ORDER`, `E0_LOCAL_WEIGHTS`,
`E0_BAND_THRESHOLDS`) and committed before the first run, so no run can choose its own bar.

- **Floors.** Winner: the cheapest arm with hit@4 ≥ 0.80; a costlier arm that also reaches hit@4 0.80 replaces it only
  with MRR@4 ≥ the cheapest's + 0.10 (the costlier candidate with the highest MRR@4 wins, ties to the cheaper; float
  slack 1e-9, nothing else). No arm at 0.80: no winner, diagnostic arm = highest hit@4 (ties to the cheaper), problem =
  `ranking` when pool recall ≥ 0.80 else `retrieval`, §6.2 = `BLOCKED (insufficient E0)`. Fewer than 40 questions:
  `insufficient`, no verdict. An arm without inputs (arm (d) with no recorded calls): `incomplete`; the floors are
  applied to the scored arms as a provisional reading only, never as the verdict.
- **Cost order (cheapest first): (e), (c), (a), (b), (d).** (e) is the pool query itself; (c) adds local arithmetic
  only; (a) adds 2 threshold queries, (b) 4; (d) adds 4 sequential judge calls.
- **Query.** Vector Storage's `query` 2: the message just before the asking turn, then the labelled question (standing
  in for the player's asking turn), joined by a newline. Candidates are embedded as message text only (no speaker
  name), as `vectors/index.js` inserts `mes`.
- **Collection.** Messages with id < the asking turn, `isSystem` rows and empty texts skipped, then the last 5 dropped
  (`protect`). A collection under 8 messages refuses the question (the 8-id contract cannot hold).
- **Bands.** Recorded as membership from threshold queries (topK 8) at 0.82, 0.7, 0.55, 0.4 over the same collection
  and query; an arm's score is the number of its thresholds a candidate passed. Since ST sorts by score, band groups are
  prefixes of ST's order, so with the tie rule arms (a) and (b) are expected to reproduce (e)'s order exactly and differ
  only in tie rate; a non-prefix recording (score drift between queries) is scored as recorded, not repaired.
- **Arm (c).** `1.3 × Jaccard(query, text) + 0.5 × 1 / (1 + (ask − messageId) / 20)`: the live scorer's
  `semanticSimilarity` and `temporalProximity` weights and distance scale (`src/memory/score.ts`), Jaccard from
  `src/memory/similarity.ts`.
- **Arm (d).** Recorded calls only (`{"<question id>": [{"pick": <message id|null>, "latencyMs", "inputTokens"}] × 4}`);
  fewer than 4 recorded calls refuses the question's recording. A pick outside the remaining set picks nothing (that
  call still counts); ranks after the picks follow ST's order. Request shape: `e0ChoiceRequest` (one Choice question,
  options `m<message id>` = candidate text, state = the query). Calls, summed latency and input tokens are the arm's cost.
- **Tie rate.** Fraction of questions where two of the arm's top 5 share a raw score (the tie at the cut counts), raw,
  never rounded. Every metric is reported unrounded with its counts.
- **Latency.** Judge latency for (d); for the vector arms only when the pool recorded query latencies (a stub pool has
  none: `null`, never 0).
- **Freeze.** `so-e0.mts freeze` writes sha256 of the labels and pool files plus a per-question pool hash; `run`
  refuses a pool or label file whose hash differs from the freeze record. The freeze record is committed (synthetic:
  this repo; private: `so-sessions`, with only its hashes copied here) before `run`.
- **Review rule.** A `private` label set needs `review: {writer, checker, agreed}` per question with writer ≠ checker;
  `agreed: false` drops the question (counted), never adjudicated. `synthetic` labels carry `review: null`. A private
  pool or result is refused as `--out` inside this repo outside `test/sessions/`.
- **Synthetic set.** Two generic sessions written for this repo (no campaign content), 20 questions each, 4 golds
  planted inside `protect` (pool-recall misses by construction), pooled by a stub embedding (character-trigram hashing,
  256 dims, cosine). It checks the tooling end to end; it is not the E0 verdict.

- **Synthetic freeze (2026-10-14, committed before `run`).** `test/measurements/v2.8/21-e0/synthetic.freeze.json`:
  labels `174a6ce86cbe1dac2627b8a026497f3633540cb5c071716694a1bd83f9af8266`, pool
  `338ded77de06cb6f228325c1e60f9facd069be3587ea6c6cc8cb0371a59971e1` (sha256 of the parsed JSON), 40 questions, provider
  `stub-trigram-256`. The private freeze is owed (no labels yet).

#### E0 private run: declarations (2026-10-16, branch `v2.8-e0-run`, written before any label or arm)

Fixed in `src/memory/e0Labels.ts` (`E0_LABEL_RULES`), `scripts/debug/lib/e0StVectors.mts`, `scripts/debug/lib/e0Choices.mts`;
`E0_FLOORS`, cost order, bands and arm (c) weights are unchanged from 2026-10-14.

- **Sessions.** The private `so-sessions` work tree, `T*/T*-*/` chats (`chat-full-*` first): at least 40 spoken messages;
  a chat sharing over half its message texts with a longer kept chat is a copy and is dropped. 48 chats → 17 kept
  (24 short, 7 copies). Session ids and counts only here.
- **Writer.** Sol, `openai/gpt-6.1-sol` (never `-fast`, never DeepSeek; the tool refuses both), `opencode run --standalone`,
  tools off, one call per kept session over its whole transcript, 5 questions per session (`--per 5`).
- **Rules (tool-enforced; a breach is dropped and counted as invalid, never repaired).** The asking turn is a player
  message; 1–2 gold ids, each inside the question's collection (before the asking turn and outside `protect`); the
  collection holds at least 8 messages; the question repeats no 5 consecutive words of a gold message.
- **Checker.** `claude -p` on the owner's login (tools off, no session persistence, model recorded from its own output),
  one call per written session, **blind**: it sees each question and the transcript, never the gold, and names the
  ids holding the exact words, considering only messages before that question's asking turn. Agreement = the checker
  calls it answerable and every id it names is a gold id. Anything else is a disagreement: dropped and counted, never
  adjudicated.
- **Top-up.** If fewer than 40 questions survive, one top-up pass (3 more per kept session, same writer, checker and
  rules) may run before any pool exists; the count alone decides it. Still under 40: `insufficient`, reported as such.
- **Pool (`st-vectors`).** Lane 74 (offline seed, firewalled: loopback only to itself, no model server, no GPU plugin),
  served from the private ST code copy `C:\dev\st-live-e0` (ST 1.19.0). Source `transformers` on CPU, model from the
  copy's `config.yaml` (`Xenova/all-mpnet-base-v2`, ST loads `onnx/model_quantized.onnx`), cached in the lane's
  `data/_cache`. One collection per question (purged before insert and after the run), item hash = message id + 1.
  Pool = the `hashes` of one `/api/vector/query` at threshold 0 (ST's score order); band membership = the `metadata`
  of the query at each threshold (the server filters `metadata`, not `hashes`, by threshold). Latency = each query's
  in-page fetch time (pool + the arm's bands); insert time is the index build, reported separately, never in an
  arm's latency. A warm-up query runs first so no question pays the model load.
- **Arm (d) recorder.** Four sequential Choice calls per question through the page's judge harness probe
  (`storyOrchestratorJudge.probe` → judge plugin → TypeSafe, the plugin's default model): the path `so-judge calibrate`
  measures through. No `e0` use, setting or calibration row is added and the per-use refusal is untouched. A busy
  refusal waits 61 s and retries (3 times, then the recording refuses); a cache hit refuses; a pick outside the
  remaining set is recorded as given and picks nothing.
- **Cost.** Arm (d): input tokens × $0.042 per million (`JEV_USD_PER_MTOK_INPUT`). Vector arms: $0 (local CPU).
- **Freeze order.** Labels → pool → `freeze` (hashes copied here and committed) → `choices` → `run`. The freeze covers
  labels and pool; the recorded calls are scored as recorded.

### 6.2 Step 2 — offline group witness feasibility

Uses E0's winning arm, and runs (for a verdict) only when E0 produced one; otherwise it is BLOCKED (§6.1).
Replaces the solo-era runtime recipe (old VR2–VR6, live, twice). Arms: R0 = today (tiers + D10 as
Q-M5 leaves it), R1 = P1 message index, R2 = P2 row index → raw range. R1/R2 filter each candidate by the scene read's
per-scene `present` set: a member gets a message only if it was present in that message's scene.

**Fixture** (F29): one **secret-bearing** group fixture holds both halves, and both are scored in the same run:
- **Witnessed positives:** ≥ 20 questions whose gold message the asking member witnessed;
- **Unwitnessed exclusions:** ≥ 20 questions whose most similar message the asking member did **not** witness, carrying a
  per-message nonce marker the model cannot predict (v2.9 02's F2 method);
- **Coverage minimum:** ≥ 3 different asking members, ≥ 2 scenes holding a `[hiding]`/`[unaware]` row, ≥ 2 sessions. A
  fixture below the minimum is refused, not scored.

| # | Metric | Floor | Decides |
|---|---|---|---|
| VR1 | witnessed positives: gold in the filtered top 4 | ≥ 0.70 | the filter keeps recall useful |
| VR2 | unwitnessed exclusions: nonce text in the filtered top 4 | 0 | privacy |
| VR3 | tokens a k ≤ 4 block would add | p95 ≤ 250 | budget |
| VR4 | swipe/edit/delete: a removed message is never returned | 0 in jest property cases over the fixture | rollback |
| VR5 | persistence cost: a per-chat collection kept on disk vs rebuilt per session (build time, disk size, query time, on the lane) | report only, no floor | the v2.9 05 build question (D11) |

**VR1 and VR2 pass only together.** A filter that returns nothing passes VR2 and fails VR1; that is the vacuous pass the
old VR6 allowed ("refused in groups"), and it is now a failure. If presence is too weak for VR1 (v2.9 02 measured 4/40
presence agreement at message level), the result is recorded and P1 waits with v2.9 02.

Retired runtime questions (D11), now v2.9 05's: answer accuracy of a real reply, reply-path latency, the
dev-flag rollout and a live mutation run.

## 7. Decisions for the user

1. Build order: C2 first, Q-M5 (with P3 as an arm) next, this spike only after? Recommended: yes.
   → Answered by the overview decision (group chats only; offline only; E0 first): C2 shipped; E0 any time; §6.2 after
   Q-M5.
2. Is verbatim recall wanted at all for play, or is summarised memory enough? (Nothing in the v2.6 session flags
   has been checked for "the character misquoted me"; not determined.)
   → Open. It is v2.9 05's question; this plan's record is its evidence.
3. Solo-only until plan 22's witness records: acceptable? Recommended: yes.
   → Superseded: no solo (answer below, v2.7 03).
4. Should the spike's index persist per chat on disk (ST's vectors folder) or be rebuilt per session? Not determined;
   the spike measures both costs.
   → Measured as VR5; decided in v2.9 05.

## 8. Gates

| Gate | Tier |
|---|---|
| Freeze record: question, label and pool hashes committed before any arm runs; the runner refuses an unfrozen pool | D |
| Scorer (hit@k, MRR@4, tie rule, ordered-output contract) unit-tested, incl. a planted tie and a planted missing-gold case | D |
| Arm (d)'s four calls counted in the cost/latency record (a jest case on the runner's accounting) | D |
| Witness fixture coverage check refuses a fixture below the minimum; VR1/VR2 scored together, with a planted "return nothing" filter that must fail | D |
| VR4 property cases (`rollback ≡ replay`-style) | D |
| E0 run: all five arms on the frozen pool, labels second-model checked | CL |
| §6.2 run after v2.8 01 M1 | CL |
| Embedding model cache location recorded; off `C:` per v2.8 rule 5, or the exception named | D |
| `npm run gates` for any runner code in this repo | D |

No feature registry entry: offline measurements need none (v2.8 rule 10). No runtime code ships, so no
`RunOwnership`, injection key or live gate here; those belong to v2.9 05 if it builds.

## 9. Links

- v2.7 02 C2 — host-channel check (Summarize / chat vectors on in a group story); K1 fix pending in v2.7.
- v2.7 03 — group chats only.
- v2.8 01 §F M1 — Q-M5 with the P3 arm (owner and slot).
- v2.8 09 — knowledge-base retrieval (P7).
- v2.8 13 J7.2 canon verification — candidate consumer of P6 evidence.
- v2.8 20 character life — exact past words would feed relationships and off-screen time.
- v2.9 02 witness filter v2 (deferred) — F2 leak in `Past events:`, options A–C, witness records (P5).
- v2.9 05 — runtime verbatim recall (deferred).
- `docs/plans/v2.6/07-chapters-and-saga-memory.md` D10 + Q-M floors — the archive recall this compares against.
- `.claude/sillytavern-docs/community/prompting-memory-prior-art.md` §8.2, §10, §11.
- `docs/plans/v2.4/extension-research/timeline-memory-an-agentic-memory-system.md`, `vecthare-a-rag-and-vector-foundational-overhaul.md`.

## Unresolved questions

- Checked: `gatedInterceptor`'s group flag only feeds the loud-generation gate (`src/runtime/loudGenerationGate.ts:32-42`),
  so D10 recall runs in solo chats too, inside our interceptor. A P1 block would sit on the same path. I think this plugin makes no sense for solo players, lets only consider group. Plugin should be disabled for solo chats.
- Score values are not returned by `/api/vector/query` (`src/endpoints/vectors.js:390`), so ranking within the
  retrieved set is by band, as today. Whether that is enough for VR1 at k ≤ 4: not determined. whatever u recommend here, please do a proper review and evaluation, this is an interested topic

## Review of the answers (2026-10-03)

- **Solo chats:** the user decided the plugin runs in **group chats only** (v2.7 03). So:
  - the D10 solo path is removed;
  - this plan's "solo first" spike scope is gone.
  - Verbatim recall can only ship for groups, and in a group it must be filtered by who witnessed the message.
  - That ties P1 to a witness record, which v2.9 02 (deferred) owns.
- **New sequence:**
  1. C2 (shipped, v2.7 02).
  2. Q-M5 with the P3 arm (v2.8 01).
  3. The verbatim-recall spike on group chats in **offline replay only**, with a witness filter built from scene
     presence (the per-scene `present` set the scene read already records), measured against the "no unwitnessed text"
     floor (§6.2).
  4. If presence is too weak (v2.9 02 measured 4/40 agreement for message-level labels), P1 waits with v2.9 02.
- **"Do a proper review and evaluation" of ranking within the retrieved set:** a dedicated evaluation step, E0, before
  the spike (§6.1, with the frozen pool, ordered outputs, tie rule and the Choice arm's ranking defined there).
  - **The fixture:** written by one model from private session transcripts (`so-sessions`), checked by a second model,
    never shown to the user (Adolion content).

## Review 2026-10-03

- **F01:** status line per plan (decided, not run; runtime recall deferred, v2.9 05).
- **F08:** no solo scope anywhere; group chats only (v2.7 03); solo appears only as the superseded decision 3.
- **F29:** old VR6 replaced: one secret-bearing group fixture scores witnessed positives (VR1) and unwitnessed
  exclusions (VR2) together, with a coverage minimum; a return-nothing filter fails.
- **F35:** E0 freezes questions, gold labels, the candidate pool, an ordered-output contract and a tie rule before any
  arm runs. The Choice arm ranks by repeated Choice with removal (4 calls for ranks 1–4, ST's order after); all four calls
  count in cost and latency.
- **D10:** Q-M5/P3 owner and slot = v2.8 01 §F M1; corpus and ratings stated as outstanding.
- **D11:** runtime questions (reply accuracy, reply-path latency, flag rollout, live mutation run) retired to v2.9 05;
  the spike compares persistence costs (VR5); no shipping decision here.
- **E0 wired into §6:** §6.1 is E0, the spike's first step.
- **One review rule (B4):** labels written by one model, checked by a second, never by the user.
- **Witness filter v2** cited as v2.9 02 (deferred); **C2** cited as shipped in v2.7 02 with K1 pending in v2.7.
- **F15:** implementation D, acceptance CL, per gate row.
- Changed from the earlier draft: "spot-checked by Claude" → second-model check (rule 11). Line ref touched and verified:
  `src/endpoints/vectors.js:385-392` (the server sorts via `queryItems`, so ST's order is a real score order, which
  arm (e) and the tie rule use).

Round 3 (Sol): R3-13 applied.

## Gate record: E0 build (2026-10-14, branch `v2.8-a12-e0`, queue A12)

Built (offline only, no runtime code, no ST, no lane, no GPU, no model call):
- `src/memory/e0Ranking.ts`: the five arms as pure functions (a/b bands from recorded membership, c local Jaccard +
  recency, d Choice-with-removal over recorded calls plus `e0ChoiceRequest`, e ST order), tie rule, ordered-output
  contract, constants and floors. `src/memory/e0Score.ts`: hit@1/hit@4/MRR@4, pool recall, raw tie rate, calls, latency
  p50/p95, input tokens; `decideE0` (winner / no-winner + diagnostic + problem / incomplete / insufficient).
  `src/memory/e0Pool.ts`: label format `so-e0-labels/1` with the review rule, chat reader (session `chat-*.json` shape),
  collection (protect 5), query, pool builder `so-e0-pool/1` over an `E0VectorProvider`, stub trigram provider.
  Not imported by the bundle (scripts and tests only).
- `scripts/debug/so-e0.mts` (`pool`, `freeze`, `run`) + `lib/e0.mts`: sha256 freeze over parsed JSON (line-ending
  proof), `run` refuses no freeze or a changed file (exit 3), private output refused inside the repo outside
  `test/sessions/e0/` (now gitignored).
- Fixture: `test/fixtures/e0/synthetic/` (2 generic sessions, 40 questions; generator `generate-synthetic.mjs`; one
  invented name collided with a campaign name and was replaced before commit). Pool + freeze in
  `test/measurements/v2.8/21-e0/`; result golden `test/goldens/e0/synthetic-result.json`.
- Order: declarations committed (`6f2dc2d1`), then fixture + pool + freeze (`3a58e87f`), then the code and the run
  (`c1764024`).

Synthetic run (`node scripts/debug/so-e0.mts run --labels test/fixtures/e0/synthetic/labels.json --pool
test/measurements/v2.8/21-e0/synthetic.pool.json --freeze test/measurements/v2.8/21-e0/synthetic.freeze.json`, exit 2 =
incomplete): 40 questions, pool recall 0.625 (25/40; 4 golds planted in `protect`, the rest lost by the stub).
- (e) ST order: hit@1 0.10, hit@4 0.425 (17/40), MRR@4 0.2271, tie rate 0.
- (c) Jaccard + recency: hit@1 0.025, hit@4 0.225 (9/40), MRR@4 0.0896, tie rate 0.
- (a), (b) bands: identical to (e) (hit@4 0.425, MRR@4 0.2271), tie rate 1.0: the predicted equivalence under the tie
  rule holds on the recording.
- (d): owed (no recorded Choice calls). Verdict `incomplete`, provisional no winner, diagnostic (e), problem
  `retrieval`, §6.2 BLOCKED (insufficient E0). Synthetic + stub embedding: a tooling check, not the E0 verdict; no floor
  retuned.

Tests: `src/memory/e0Ranking.test.ts`, `e0Pool.test.ts` (23 jest cases: planted tie, planted missing gold, arm (d)'s four
calls in cost/latency, contract violations, review rule, protect, verdict branches); `scripts/debug/e0.test.mts` (6
node cases: pool rebuild = committed pool, freeze match, golden replay, unfrozen/tampered refusal, private-output and
non-stub refusals, arm (d) through the CLI with recorded calls).

Gates:
- `npm run gates:quick`: green (typecheck, typecheck:test, lint changed, jest related, replay cached 32/32 killed).
- `npm run gates -- --no-storybook --jobs=2`: all green in 344.6 s (test 723 suites / 8,315 passed + 1 skipped, replay,
  typecheck, typecheck:test, build, test:debug, debug:typecheck, lint, test:plugin, test:release). Storybook skipped: no
  UI change. Main bundle 1,265,343 B (budget 1,300,000).
- `npm run test:replay` once on the fresh worktree: 32/32 killed.

Model calls: 0.

Owed (E0 CL acceptance):
- Private labels: ≥ 40 questions written by one model and checked by a second (Sol `openai/gpt-6.1-sol` / DeepSeek),
  stored in `so-sessions` under `test/sessions/e0/`. Available evidence (counts only): 48 session dirs with a chat,
  2,257 messages, 24 sessions with ≥ 40 messages.
- The st-vectors pool: a lane's ST server (`/api/vector/*`, `transformers`, CPU) for the pool and band queries, with
  query latencies; the `pool --provider` path refuses anything but `stub` until then. Embedding model cache location
  (§8 row) recorded with it.
- Arm (d): 4 TypeSafe Choice calls per question through the judge plugin (no `e0` use or calibration row exists; the
  plugin refuses uncalibrated uses), recorded in the `--choices` format; 160+ calls for 40 questions.
- Private freeze committed in `so-sessions`, its hashes copied here, then `run`.
