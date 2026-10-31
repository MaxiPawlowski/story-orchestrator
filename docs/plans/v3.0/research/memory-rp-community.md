# Memory research: the RP and AI-fiction community (angle `rp-community`, 2026-10-31)

Research only. Nothing was built, staged or run against ST. One of six angles; brief:
`scratchpad/memory-research-brief.md` (session-local).

**Already harvested, not repeated here.** These cover most of the SillyTavern extension corpus:
- `.claude/sillytavern-docs/community/prompting-memory-prior-art.md` (Summarize, Data Bank chronicles, lorebook fact
  cache, Memory Books v3, qvink, trackers, Presence).
- `docs/plans/v2.4/extension-research/` (55 repos: qvink, ReMemory, Smart Memory, Memory Books, Timeline-Memory,
  TunnelVision, VectHare, Tracker, Guided Generations, Stepped Thinking and others).
- `docs/plans/v2.8/extension-research-2026-10-14/` and `-2026-10-21/` (TokenSavingPlugin, Simulation Blackboard,
  VectFox P1-P7, Scene Archivist P1-P5, Memory Books, Timeline-Memory, TunnelVision updates).
- `docs/plans/v3.0/extension-research-2026-10-30/` (Scene Archivist 1.0.8, VectFox, Memory Books 9.3, TavernOS HUD,
  Lattice, Simply-LoreAndTracker).

This report covers what those passes did not reach. That means the platforms outside SillyTavern (AI Dungeon, NovelAI,
KoboldCpp, Talemate, RisuAI, Character.AI, Janitor, SpicyChat, Kindroid, Nomi), two ST extensions nobody harvested
(Summaryception, plus RisuAI's HypaV3 as a reference design), the new Memory Books 9.x features no earlier pass weighed for
memory (character-focused group summaries, Topical Clips), and what users report in 2026. Every proposal below checks the
earlier harvest indexes first. Where an earlier report already took an idea, this report cites it instead of claiming it.

---

## 1. Summary

- **The field is converging on our design, and in some places it is just catching up.** In 2026 the bigger systems
  shipped features we already have:
  - Talemate 0.40 (27 Oct 2026) added "characters remember only what they witnessed or were told".
  - Memory Books 9 added per-character group summaries and a narrator cast.
  - Scene Archivist added a knows / suspects / false-belief / unaware / hiding taxonomy.

  Our epistemic tiers, held secrets and witness record already do all of this, with stronger guarantees (rollback ≡ replay,
  fail-closed audience rules).
- **Replacing old history with summaries is the known failure point, and there is now production evidence.** JanitorAI's
  "memory replaces old messages" experiment escaped to all users on 2026-08-18. The results were vaguer replies, empty
  summaries overwriting memory, reasoning drafts saved as memory, and about 15,000 chats hit. Summaryception users report
  the model echoing text from 20-30 messages back once ghosting starts. This is direct support for keeping plan 40
  (`memory.chapters.compact`) off until its rating passes. It also says the rating needs a code-measured **echo/vagueness**
  floor, not only overall preference (proposal P2).
- **The best new idea for us is a per-member perspective recap at chapter seal.** Memory Books 9 and Talemate 0.40 both
  keep each character's subjective account (what they saw, what they wrongly believe). Each one feeds that character's
  memory instead of a shared recap. We have the atomic epistemic lines but no per-member narrative (proposal P1).
- **A recency-weighted, multi-paragraph recall query is a cheap win.** RisuAI HypaV3 does this without any model call. Our
  archive recall queries with the last player line plus the objective only (proposal P3).
- **Deliberate rehearsal of old memories.** HypaV3 gives about 20% of its memory budget to random old summaries. AI Dungeon
  evicts the *least-used* memories. Both are reactions to "old threads die". A seeded rehearsal slot fits our determinism
  rule (proposal P4).
- **Observable traces for kept-out members.** Talemate's "rewrite hidden acts as observable traces" gives a character who
  was present but not told the sensory residue of a hidden act (a sound, a smell) instead of nothing. This would add
  texture to our held-secret design without a leak. It is speculative and needs a privacy proof (proposal P5).
- **Entity dossiers.** Memory Books' Topical Clips and AI Dungeon's Auto-Cards both gather scattered memories into one
  record per character, place or object, recalled when that entity is named. They are an alternative to injecting N
  scattered rows (proposal P6).
- **Users trust curation and visibility more than cleverness.** The 2026 consensus favours Memory Books (readable, editable)
  over automatic systems. It values a memory/usage meter (Character.AI's 2026 bar, AI Dungeon's Context Viewer timeline and
  relevance views, Scene Archivist's "what loaded and why"). Our Author console and inspector cover this. Keep them prominent.

---

## 2. Survey

### 2.1 AI Dungeon (Latitude): Memory System, Story Cards, Auto-Cards

- **Mechanism** ([help: Memory System](https://help.aidungeon.com/faq/the-memory-system)):
  - A Memory summarizes 6 actions into dense plot details with no prose. The first one is made at action 12 (covering
    actions 1-6), then one every 6 actions.
  - The 6 most recent actions are **never summarized**, so undo and edit never touch a stored Memory.
  - **Auto Summarization** keeps a "Story Summary" plot component, updated every 15 actions and compressed when it grows
    too long. Memories fill the gap until the summary catches up. The summary "may remove recent context that has already
    been summarized".
  - **Memory Bank**: each Memory is embedded. The query is the **most recent action** only. Retrieval starts only once the
    adventure no longer fits the context.
  - Capacity by tier is 25/100/200/400 memories. When full, the **least-used** memories are forgotten. Frequently used
    ones persist indefinitely.
  - Memories are never edited. If the past is changed, the player must fix the summary by hand.
- **Story Cards** are keyword-triggered lorebook entries, included by match relevance and card length
  ([plot components](https://help.aidungeon.com/faq/plot-components)).
- **Auto-Cards** is a community scenario script
  ([guide](https://www.roborhythms.com/ai-dungeon-auto-cards/), [source mirror](https://1clonegithubbyxjn.1934672944.workers.dev/LewdLeah/Auto-Cards)):
  - It detects named characters, places and things over a 5-action look-back.
  - It writes a story card for each (default 750 chars) about every 22 turns.
  - Each card keeps its own memory section, summarized at 2,750 chars down to a 25% compression setting.
  - `/ac redo Name` regenerates a card.
- **Evidence and failures.** Reddit's ["memory system is bad"](https://axebps-redlib.hf.space/r/AIDungeon/comments/1ivhg9n/dungeon_ais_memory_system_is_bad)
  thread (2025-02) reports that summaries introduce mistakes and odd phrasing. Players point out that the summary feeds
  model output back into the model, so errors compound. Some turn it off. Auto-Cards fails silently on settings gates, and
  the same unwanted card can keep coming back.

### 2.2 NovelAI: lorebook and ephemeral context

- **Lorebook mechanics** ([docs](https://docs.novelai.net/en/text/lorebook/)):
  - Search range is up to 10,000 characters.
  - **Key-relative insertion** places an entry next to the last occurrence of its key in context.
  - **Cascading activation**: keys can be found in other activated entries.
  - Per-entry token budget (absolute, or a fraction of context) and **reserved tokens**.
  - Insertion order and position, plus trim direction and maximum trim type ("Do Not Trim" = all or nothing).
  - Categories can form a **subcontext**: a group inserted as one block.
  - Phrase bias, including bias applied "when entry inactive".
- **Ephemeral context** is timed text that enters context after a delay, for a set number of steps, optionally repeating
  (docs.novelai.net, "Ephemeral Context"; the page URL returned 404 on this pass, so the syntax is not re-verified here).
- **Relevance.** This is a mature *placement* vocabulary: reserved tokens, all-or-nothing trim, key-relative placement.
  Ours is depth plus budget plus the late-lore move (`runtime/lorePlacement.ts`). Key-relative insertion moves text per
  turn, which our prefix-cache rule forbids. Reserved tokens and "do not trim" match our tier budgets
  (`memory/budget.ts`) already.

### 2.3 KoboldCpp / KoboldAI Lite: Memory, Author's Note, World Info, TextDB

- Read from the local clone `C:\dev\st-extensions-research\koboldcpp` (Lite UI `embd_res/klite.embd`):
  - **AutoGenerate Memory** button: a one-shot summary into the Memory field.
  - **TextDB** (README "retrieval-augmented generation (RAG) through TextDB") has three search back ends: browser
    minisearch (lexical), KoboldCpp embeddings, or OpenAI embeddings.
  - "Search Includes Context History": history that fell out of context is searchable.
  - Results enter as `[Info Snippet: …]`, up to 3 per turn.
  - A lorebook can be imported as TextDB instead of World Info.
- **Relevance.** This is the minimal form of our archive recall (`memory/archiveRecall.ts`, `memory/recall/`). Nothing
  new beyond confirming that lexical-first with optional embeddings is the default shape across the field.

### 2.4 Talemate (vegu-ai): layered history, state reinforcement, character perspectives

- **Summarizer**
  ([settings](https://vegu-ai.github.io/talemate/user-guide/agents/summarizer/settings/),
  [releases](https://github.com/vegu-ai/talemate/releases)):
  - Summarization triggers on a token threshold. It also ends early at a **time passage** or when a **character is
    activated/deactivated**, which are the same cut signals as our `sceneDetect.ts` (time_skip, cast).
  - **Layered history**: up to N layers, and gains fall off past 3. **Best fit** spreads the history budget across layers,
    compressed early and detailed late, with min/max raw dialogue messages.
  - "Enforce summary boundary": when off, older messages can reappear in full.
  - **"Optimize for prompt caching"** moves volatile context (long-term memory, notes) after scene history. It is off by
    default and "may confuse weaker models".
  - Long-term memory retrieval has three modes: recent context, AI-generated queries, or AI-compiled Q&A, the slowest and
    "not necessarily better".
  - Context investigations were *removed* in 0.36 and replaced with a RAG mixin.
- **State reinforcement**
  ([templates/state](https://vegu-ai.github.io/talemate/user-guide/templates/state/)):
  - A per-character or world question ("What is X's current sanity?") is re-asked every N turns.
  - The answer is inserted sequentially as a "State Update" row. It replaces the previous one only if that one is within
    the last 10 messages.
  - It can also be passive (relevance) or always-on.
- **0.40 (27 Oct 2026) Character Knowledge and Perspectives**:
  - Characters remember only what they witnessed or were told, with "Known by / Learn / Never Learn" controls the Director
    can use too.
  - Optional **Character Perspectives** keep each character's own account of events and use it for their memories and
    summaries. It "needs a strong model and adds analysis requests".
  - Summarizer options: "Analyze player perspective" (a perspective-limited view for the player) and **"Rewrite hidden
    acts as observable traces"** (keep the sensory effects of a hidden action without revealing it).
  - Scene analysis is cached against the last message, so editing that message invalidates it. "Perspectives are marked
    out of sync until you choose Repair".
- **Evidence.** These are author docs only. No public benchmark exists, and "needs a strong model" is the author's own
  caveat.

### 2.5 RisuAI: SupaMemory, HypaMemory V2/V3, Hanurai

- Read from source ([kwaroran/RisuAI `src/ts/process/memory/`](https://github.com/kwaroran/RisuAI/tree/main/src/ts/process/memory),
  [DeepWiki overview](https://deepwiki.com/kwaroran/RisuAI/5.1-memory-systems)).
- **HypaV3** (`hypav3.ts`):
  - Summaries are stored with the set of source message ids they cover (`chatMemos`), plus `isImportant`, a category and
    tags.
  - Memory is 20% of context by default (`memoryTokensRatio: 0.2`). The budget is filled in order:
    1. **important** (pinned) summaries;
    2. **recent** summaries, 40%;
    3. **similar** summaries, 40%;
    4. **random**: whatever is left of the ratio (1 - recent - similar). Selection is a `Math.random` shuffle over the
       remaining summaries, and unused space cascades down the list.
  - The similarity query is built from the last `queryChatCount` messages. Each is **split on blank lines into
    paragraphs**, and each paragraph is weighted by recency, `(index+1)/(n(n+1)/2)/paragraphs`.
  - Optional "similarity correction" also queries with summarized recent chat.
  - `preserveOrphanedMemory` decides what happens to a summary whose source messages were deleted.
  - `doNotSummarizeUserMessage` excludes player text from summaries.
- **Hanurai** (`hanuraiMemory.ts`): no summaries. It embeds raw chat paragraphs and scores them against the last 3
  messages with a 1/i recency divisor.
- **Contextual embeddings**: optional Voyage `voyage-context-3`, which embeds a chunk together with its neighbours.
- **Relevance.** The random share is the one design in the field that deliberately rehearses old memory. The weighted
  multi-paragraph query costs nothing and is better than a single-line query.

### 2.6 Summaryception (ST extension, Lodactio, 2026)

- **Mechanism** ([r/SillyTavernAI post snapshot](https://reddit.sentinel-team.org/posts/1sgfbn4/snapshots/2026-04-10T17%3A15%3A00.700258Z),
  repo `github.com/Lodactio/Extension-Summaryception`, AGPL-3.0, not cloned):
  - The newest 7 assistant turns stay verbatim. Older turns become short snippets, and **each snippet is written against
    the existing summaries**, so it records only what is new.
  - When a layer fills (100 snippets in the example), its oldest snippet is promoted to the next layer and re-summarized,
    up to 5 layers. The first snippet of a new layer is promoted without a model call.
  - "Ghost mode" hides summarized messages from the prompt.
  - The author claims about 9,300 turns in about 16K tokens.
- **User reports** (same thread):
  - Praised as "set and forget", and worked on a 55K-token chat.
  - Once ghosting starts, the model **repeats text from 20-30 messages back**.
  - Summaries come out too terse and drop major details.
  - No editing and no separate connection, so the main model's cache is destroyed.
  - Reasoning tags leak into summaries. Image-prompt tags get captured.
  - No dates. Users ask whether the clipped summary style bleeds into replies.
  - On a 400-message chat it injected about 4,300 tokens against Memory Books' 2,500.
- **Wider 2026 sentiment**
  ([snapshots](https://reddit.sentinel-team.org/posts/1sgwjrx/snapshots/2026-04-11T09%3A15%3A38.506745Z),
  [guide](https://tavernsprite.com/blog/best-sillytavern-memory-extensions/)):
  - Memory Books is the readable, editable default ("it's all about the quality of the summaries, and when you make them").
  - qvink trades "trashing your cache every 10/20 messages" for a bright context replacement.
  - Stacking is common (qvink for turning points, an inline summary at scene end, Memory Books for the rest).
  - One user notes that longer summaries help until "coherency issues when the chat gets long enough".

### 2.7 Memory Books 9.x: what is new for memory (beyond the 10-30 harvest)

- Local clone `C:\dev\st-extensions-research\st-memory-books\source`, `USER_GUIDE.md`, `changelog.md` (v9.3.11, 2026-10-29).
- **Group mode**:
  - Participants are the authors of messages in the scene, not prose inference.
  - The memory must state who did, said, learned, decided, believed or misunderstood what.
  - With "separate group and character prompts", one canonical group memory goes to the group book, and a
    **character-focused** version goes to each character's own book. The guide's example: the concealer's version says
    she suspects she was seen, and the deceived character's version says he "accepted Alice's claim". Costs extra
    requests. Opt-in.
- **Narrator mode (8.5)**: one omniscient book plus one book per declared cast member. Stable cast ids are stamped on
  messages and swipes at generation start.
- **Topical Clips (8.x-9.3)**: "gather everything about this person, relationship, place, object, mystery or thread" from
  saved memories into one entry organized by topic, not by time. Memory Assistance proposes updates to existing clips and
  suggests new topics after each memory.
- **Recap tiers**: Arc → Chapter → Book → Legend → Series → Epic (`memtier0-6`).
- **Memory reminders** (9.3.3) prompt the user to make memories.

### 2.8 Commercial companions (for user-reported behaviour, not mechanism)

- **Character.AI (2025-2026)**
  ([3-layer explainer](https://weavai.app/blog/en/2026/08/13/character-ais-new-3-layer-memory-system-explained/),
  [chat memories](https://www.roborhythms.com/character-ai-adds-chat-memories/)):
  - A 400-char always-on Chat Memories box, plus up to 15 pinned messages (Story Memory, "stays no matter how full").
  - c.ai+ "Facts" are auto-extracted into persona / character / side-character tabs, each editable, disableable and
    deletable, with a choice to carry them into a new chat.
  - A **memory usage bar** shows how much space facts, pins and history take.
  - Reported failures: Facts treats fiction as the user's real life, saves trivia and misses key details. Users say pinned
    messages stopped being mentioned after auto memories arrived.
- **JanitorAI** ([incident write-up](https://weavai.app/blog/en/2026/08/31/janitorai-memory-bug-experimental-feature-causes-amnesia/)):
  - Chat Memory box plus an Auto Summary draft.
  - On 2026-08-18 a "memory replaces old messages" test reached all users. Five causes were named:
    1. replacement went global;
    2. **a failed or empty summary could overwrite memory**;
    3. **models' internal drafts were saved as memory**;
    4. no safe "keep old content" option on manual edit;
    5. auto-summary bundled into the experiment.
  - Then a second bug: **deleting a covered message cleared the memory**.
  - Effects: replies became vaguer, and about 15,000 chats were affected. Recovery worked because memory was hidden, not
    destroyed.
- **SpicyChat Semantic Memory 2.0** ([review](https://www.roborhythms.com/spicychat-memory-not-working/)):
  - Distills key moments in batches of 60 messages, so recent details are missing until the next batch.
  - A Memory Manager allows view, edit, delete and pin.
  - **Deleting messages does not delete derived memories.**
- **Kindroid** ([memory types](https://medium.com/@adlerai/types-of-memory-within-kindroid-5659410c07ca)):
  - Cascaded memory is a hierarchy over thousands of messages. Long-term memory recalls 3-9 items by tier.
  - **Journals** are user-written, keyword-recalled, raw (they bypass the summarizer), personal or global.
  - Users report inconsistent recall, and a changelog fixed a "cascaded memory consolidation" bug.
- **Nomi** ([Mind Map review](https://nerdbot.com/2025/11/26/the-birth-of-deep-ai-continuity-mind-map-review/)): a
  visible concept map over memories, appearing after about 500 messages and user-seedable. The "Identity Core" holds
  personality, not events.
- **Agnaistic** ([README](https://github.com/agnaistic/agnai)): memory/lore books plus long-term memory over chat
  embeddings. The same shape as ST and not examined further.

---

## 3. Mapping to us

| Technique (source) | What we have (paths) | Real gap | Fits our constraints? |
|---|---|---|---|
| Recent window never summarized (AID 6 actions) | Compaction never passes the last read window or the short-term summary (`runtime/compactHistory.ts` ceiling, plan 40); reads wait `stabilityLag` | none | yes |
| Rolling summary + compression (AID Story Summary, Janitor) | Short-term rolling entry with a refusal gate (`extractionCoordinator.ts` `acceptCompaction`, "previous entry is kept"); chapter records, eras, canon (`memory/chapter*.ts`, `canon.ts`) | none. We already guard Janitor causes 2 (empty/failed overwrite: `acceptCompaction`), 3 (reasoning saved: `stripChannelNoise`/`stripReasoningBlocks`) and the delete-clears-memory bug (rollback ≡ replay, `memory/reverse.ts`) | yes |
| Replace old history with memory (Janitor, Summaryception ghost, VectFox ghost, qvink) | Plan 40 compaction, **off** until rating A3-R; chapter fold (`chapterKit.ts`) | The A3-R floors are preference-only. No code floor for echo or vagueness, which are the two failures users actually report | P2 adds a code floor; no runtime change |
| Embedding retrieval with a single latest-action query (AID) / weighted multi-paragraph query (HypaV3) | Archive recall: query = last player line + checkpoint objective (`chapterKit.ts` `recallText`), vector band + lexical score (`archiveRecall.ts`, `score.ts`), E0 goldens (`memory/e0*.ts`) | Query ignores the last replies and splits nothing; the two-sentence objective dominates short player lines | P3; no model call, same vector host |
| Least-used eviction (AID) / random rehearsal share (HypaV3) | `recallCount` weight in `score.ts`; open arcs injected (`arcs.ts`); deferred threads (plan 33) | Nothing brings back an old, unmentioned memory on purpose; `Math.random` is forbidden here | P4 as a seeded slot |
| Per-character knowledge, witness rule (Talemate 0.40, Memory Books group mode, Scene Archivist) | Epistemic tags knows/suspects/believes/unaware/hiding/intends (`memory/types.ts:111`), held secrets (`heldSecrets.ts`), witness record (`memory/witness/`), audience rules (`audienceRules.ts`), who-knows grid (`runtime/whoKnows.ts`) | none at the fact level; we are ahead (fail-closed audience, rollback) | — |
| Per-character perspective account (Talemate Perspectives, Memory Books character-focused summary) | Private block = atomic epistemic and inner-voice lines (`innerRender.ts`, `epistemic.ts`); shared recaps go through the resting filter | No subjective per-member *narrative* of a chapter; members get facts, not their own story of what happened | P1; seal-time only |
| Observable traces of hidden acts (Talemate) | Kept-out members get nothing about a secret (resting filter, `withoutSecretLines`) | No sanctioned partial perception | P5, speculative |
| Entity dossiers (Topical Clips, Auto-Cards) | Ledger `[state:Entity:type]` rows (`ledger.ts`), entity-overlap scoring, codex (authored), name fold (`nameFold.ts`) | Memory about one recurring NPC is scattered across scene rows; no gathered per-entity view for the prompt | P6 |
| Layered history, best fit (Talemate, Summaryception, Memory Books tiers) | Chapters → eras, fold/unfold (`chapterFold.ts`, `chapterUnfold.ts`), recap tiers | none worth taking; Summaryception's "promote oldest snippet" re-summarizes model text into model text, which is the compounding-error path AID players complain about | — |
| Delta summaries ("write only what is new against existing summaries", Summaryception) | Short-term prompt takes the previous summary (`buildShortTermSummaryPrompt(previous, …)`); chapter input takes prior records | none | — |
| Volatile context after history for caching (Talemate) | Late lore (`lorePlacement.ts`), per-turn blocks late, prefix-drift gate (plan 13) | none | — |
| State reinforcement Q&A every N turns (Talemate) | Typed qualities + ledger from the shared read; story time (`engine/life/clock.ts`) | none; ours is typed and boundary-applied | — |
| Usage meter / context viewer (Character.AI bar, AID Explore Memories) | Next-turn preview, inspector, Author console prompt tab | Player-facing meter: not wanted (player surfaces stay clean) | — |
| Story-time learning dates (Scene Archivist) | — | already proposed: v3.0 10-30 harvest `scene-archivist.md` P3 | — |
| Relative-age labels, causal "why did I" recall (VectFox) | — | already proposed: v2.8 10-21 `vectfox.md` P4, P5 | — |
| Player-safe chapter diary (Scene Archivist) | — | already deferred: v3.0 `05-deferred-items.md` M01 | — |

---

## 4. Proposals (ranked)

### P1. Per-member perspective recap at chapter seal — size M

- **What.** When a chapter seals (`runtime/chapterSeal.ts`), also write one short **perspective record** per roster
  member who was on stage in the chapter (3-6 sentences): what *they* saw, did, suspect and wrongly believe, in their
  framing. The record is injected only into that member's private block, in place of (not on top of) that chapter's
  epistemic lines when it covers them.
- **Why.** Memory Books' and Talemate's own examples show the gain is in voice and misbelief ("accepted Alice's claim").
  Atomic `[believes]` lines do not carry this as well. It is also the one 2026 feature in the field we lack where the
  others share our privacy model.
- **Input.** The chapter record, that member's epistemic rows, and the chapter's witness claims about them, all rendered
  through `keptFrom` for that member. Never the shared transcript alone, because a group transcript would hand everyone
  the secret's surface.
- **Modules.**
  - `memory/chapterRecord.ts` (new record kind `perspective`, keyed member + record id).
  - `runtime/chapterSeal.ts` (schedule after the seal, boundary work entry with an order after `recap`).
  - `memory/innerRender.ts` (render).
  - `memory/derived.ts` (inputs/removed).
  - `chapterUnfold.ts` (drop on unfold).
  - Lazy chunk (chapter kit).
- **Cost.**
  - One off-path call per on-stage member per seal, so 3-6 calls per chapter (chapters seal every tens of boundaries),
    about 600 input and 150 output tokens each on the local model.
  - Zero cost per turn. The private block is already a per-member late block, so there is no prefix impact.
- **Invariant risks.**
  - Held secrets. The member's own secret is fine; another member's held secret must not appear unless this member knows
    it. Gate the output through `withoutSecretLines` for that member, plus a property test with planted secrets.
  - Rollback: a derived artifact with `range`, dropped by unfold. RunToken per seal.
  - Thinking and inner voice are untouched.
- **Measure.**
  - New review test `perspective.secret.review.test.ts` (kept-out member's record never restates the secret).
  - Blind Sol rating, perspective arm vs epistemic-lines arm, on 12+ sealed-chapter points. Floor: preferred or tied
    ≥ 55%, mean "voice consistency" delta ≥ 0.
  - Journey row: a sealed chapter produces one record per on-stage member.
- **Ships** on by default per the owner rule. The rating is informational.

### P2. Echo and vagueness floors for every "history leaves the prompt" rating — size S

- **What.** Add two code-computed numbers to the A3-R compaction rating (`scripts/debug/so-compaction-rating.mts`,
  `lib/compactionRating.mts`), and reuse them for plan 33's `memory.deferredOutOfPrompt` rating (H33-RP):
  - **echo rate**: the share of reply 8-grams that also appear in chat messages 15-40 back. This targets the
    Summaryception symptom.
  - **specificity**: named entities plus numbers per 100 reply words, compared between arms. This targets Janitor's
    "vaguer replies".
- **Floors (predeclared).** Compact arm echo rate ≤ trim arm + 0.02 absolute, and compact specificity ≥ 0.9 × trim.
  Informational, never retuned.
- **Cost.** Offline code over the existing generated arms, with no extra model call.
- **Invariant risks.** None (harness only).
- **Measure.** Itself. Run it alongside the A3-R pairs owed on the GPU.

### P3. Recency-weighted multi-paragraph recall query — size S

- **What.** `chapterKit.ts` `recallText` builds one query from the last player line plus the objective. Replace it with
  HypaV3's shape:
  - take the last k=3 chat rows, the player's and members' replies alike;
  - split each on blank lines;
  - weight each paragraph by recency, `(i+1)/(k(k+1)/2)/paragraphs`;
  - run one `vectorQuery` per paragraph against the same candidate collection;
  - sum the weighted hits into the semantic band. The lexical `recallMentions` uses the same window.
  - Keep the objective as a low-weight extra paragraph.
- **Cost.**
  - k×p vector queries per recall, about 5-10 with local embeddings, each a few ms, on the reply path where recall
    already runs. Bound p ≤ 4 per row.
  - Pair with the vectfox P0 reuse fix that is already built, so the collection is built once per round.
- **Invariant risks.**
  - The band key must include the whole window, `bandKey` in `chapterKit.ts`.
  - Resting filter unchanged (candidates are already `restingEntries`).
  - No determinism issue (vector scores, no randomness).
- **Measure.** E0 goldens (`memory/e0Golden.ts`, `e0Ranking.ts`): hit@4 on the existing labelled pool, single-line vs
  weighted window. Floor: hit@4 not lower, and +0.05 on callback cases where the player line has no entity name.

### P4. Seeded rehearsal slot — size S-M

- **What.** One line in the archive recall block, at most every R=6 boundaries. It picks one archived (folded),
  resting-filtered, non-deferred memory whose last recall is older than 40 boundaries. The draw is
  `hash(chatId, storyId, boundary, "rehearse")` over the candidates sorted by id, weighted by importance. This is
  HypaV3's random share and AID's "frequently used persist", made deterministic.
- **Why.** Long RP loses callbacks. Nothing in our selection ever surfaces a memory nobody mentions.
- **Modules.** `memory/archiveRecall.ts` (pure selector), the existing recall block render, and the `recallCount` update
  through the normal write path.
- **Cost.** No model call. About 40 tokens every sixth turn, inside a block that is already per-turn and late.
- **Invariant risks.**
  - Rollback ≡ replay holds (seeded by boundary, recomputed on replay).
  - Must exclude plan 33 deferred threads and anything `keptFrom` the drafted member.
  - Prefix: the recall block is already volatile, so no new prefix break.
- **Measure.**
  - Unit property: same chat, story and boundary give the same pick, and a rollback replays it.
  - Blind Sol rating on "callbacks feel earned vs intrusive" (12+ pairs). Floor: intrusive ≤ 20% of rehearsed turns.
  - Code count: replies referencing a ≥ 40-boundary-old entity rise.

### P5. Observable traces for present but kept-out members — size M (spike first)

- **What.** When a read records a hidden act (`[hiding]` with `hiddenFrom` X) and the witness record (42 B) says X was
  present, X's private block may receive a **trace line**: sensory residue only ("you heard the drawer shut"), never the
  object, actor intent or content.
  - Written by the read as a new contract line `TRACE m=<member> "…"` with a span anchor. It is not derived from the
    secret text.
  - Checked by the audience rules as a `witnessed` relation.
  - Refused if its words restate the secret (the same `restatesWords` test used for rumors).
- **Why.** A kept-out member who was in the room currently notices nothing at all, which reads as oblivious. Talemate
  ships exactly this as an option.
- **Cost.** A few tokens in the existing read output. No new call.
- **Invariant risks.**
  - High. A trace is a new channel next to a held secret. It needs the fail-closed path: unknown witness = no trace.
  - It needs a planted-secret property test.
  - It depends on the witness W4 floors (v2.8 42 → v3.0) passing first, since nothing consumes `extras.witness` before
    that.
- **Measure.**
  - Privacy property test first (a trace never shares a content word with the secret beyond stop words).
  - Then a blind rating of kept-out member replies, trace vs no-trace.
- **Gate.** Do not build before the witness consumer is allowed.

### P6. Entity dossier rows at chapter seal — size M

- **What.** At seal, for each roster member or recurring named entity with ≥ 4 live memory rows in the chapter, fold
  those rows into one **dossier** entry (topic-organized: who they are to the cast, open matters, last seen). It is
  recalled when the entity is named (entity-overlap scoring), and the source rows are marked `foldedInto`.
- **Why.** Topical Clips and Auto-Cards both exist because scattered rows waste budget and lose the thread. Users
  "gather everything about X" by hand in Memory Books.
- **Modules.** `memory/chapterFold.ts` (dossier fold), `consolidate.ts` grouping by entity, `nameFold.ts` for identity,
  resting-view render.
- **Cost.** One off-path call per qualifying entity per seal, usually 0-3.
- **Invariant risks.**
  - A dossier mixes rows with different audiences. Build one per audience class (resting view only for shared
    injection), never a member-private dossier from another member's rows.
  - Derived record with inputs, unfold restores the rows.
- **Measure.** so-live-suite facts tier unchanged or better on long fixtures (`longFixture.test.ts` corpus), a tokens-per-
  recalled-entity drop, and a blind rating on continuity.

---

## 5. What we do that the field does not (keep it) and what we reject

**Keep. Nobody in the surveyed field does these:**
- **Rollback ≡ replay.** AI Dungeon tells players to fix the summary by hand after an edit. SpicyChat keeps memories of
  deleted messages. Janitor's delete cleared memory. Summaryception has no edit. Our swipe/edit/delete undo is exact.
- **Fail-closed audience rules and held secrets across every shared tier.** Talemate's knowledge is "known by" metadata
  where "whether advice stays within evidence depends on the model". Memory Books copies a group summary into each
  character book unless the user opts into the extra prompts.
- **A gated summary replacement** (`acceptCompaction`: the previous entry is kept on a bad summary). This is exactly
  Janitor's cause 2.
- **Reasoning stripped centrally** before any memory write. Janitor cause 3, Summaryception's leaked tags.
- **Compaction never passes the read window**, and replacement stays behind a rating (plan 40). The field shipped
  replacement first and found the failures in production.
- **Per-request profiles, never a global switch.** Summaryception and qvink users lose their cache or their preset to the
  main model.
- **Typed, seeded, code-spread state** (rumors, promises, story time) where the field asks the model to re-describe state
  each turn (Talemate state reinforcement, TavernOS-style HUD blocks).

**Rejected:**
- **Main-model tool calls managing memory** (TunnelVision, Timeline-Memory agentic fill, VectFox agent mode on the reply
  path). Reply latency on a 3090, the reply path never writes, and one user reports TunnelVision "works for 48 hours then
  fails". Already rejected in v2.4.
- **Recursive promotion of summaries of summaries as the main store** (Summaryception layers, AID re-summarized Story
  Summary). Error compounding is the most common complaint. Our chapters keep records keyed to source ranges, and recall
  goes back to rows, not re-compressed text.
- **Key-relative insertion** (NovelAI). It moves text inside history every turn and breaks the member prefix cache.
- **Random selection with `Math.random`** (HypaV3). Kept only as the seeded P4.
- **Player-facing memory meter or editable fact list** (Character.AI, SpicyChat). The player surface stays clean; author
  view already has the inspector and console. Character.AI's Facts treating fiction as real life is a reminder that
  auto-facts need an author eye.
- **Single-pass "reply + tracker block" memory** (Simply-LoreAndTracker, TavernOS). It costs reply tokens and quality on
  every turn and mixes model output into the visible reply. Our read is off-path.
- **A dedicated vector DB** (VectFox Qdrant). The scale target is 2,000+ replies. Our stories are checkpoint-bounded, and a
  server dependency is not worth it.

---

## Sources

- AI Dungeon: [Memory System](https://help.aidungeon.com/faq/the-memory-system),
  [Plot Components](https://help.aidungeon.com/faq/plot-components),
  [Auto-Cards guide](https://www.roborhythms.com/ai-dungeon-auto-cards/),
  [r/AIDungeon "memory system is bad"](https://axebps-redlib.hf.space/r/AIDungeon/comments/1ivhg9n/dungeon_ais_memory_system_is_bad).
- NovelAI: [Lorebook docs](https://docs.novelai.net/en/text/lorebook/).
- KoboldCpp: local clone `C:\dev\st-extensions-research\koboldcpp` (`README.md`, `embd_res/klite.embd`).
- Talemate: [summarizer settings](https://vegu-ai.github.io/talemate/user-guide/agents/summarizer/settings/),
  [state reinforcement](https://vegu-ai.github.io/talemate/user-guide/templates/state/),
  [releases](https://github.com/vegu-ai/talemate/releases).
- RisuAI: [source `src/ts/process/memory/`](https://github.com/kwaroran/RisuAI/tree/main/src/ts/process/memory)
  (`hypav3.ts`, `hanuraiMemory.ts`, `contextualEmbedding.ts`, read 2026-10-31),
  [DeepWiki memory systems](https://deepwiki.com/kwaroran/RisuAI/5.1-memory-systems).
- Summaryception: [r/SillyTavernAI thread snapshot](https://reddit.sentinel-team.org/posts/1sgfbn4/snapshots/2026-04-10T17%3A15%3A00.700258Z).
- 2026 ST memory sentiment: [r/SillyTavernAI snapshot](https://reddit.sentinel-team.org/posts/1sgwjrx/snapshots/2026-04-11T09%3A15%3A38.506745Z),
  [TavernSprite guide](https://tavernsprite.com/blog/best-sillytavern-memory-extensions/).
- Memory Books 9.3.11: local clone `C:\dev\st-extensions-research\st-memory-books\source` (`USER_GUIDE.md` group and
  narrator mode, Topical Clip; `changelog.md`).
- Character.AI: [3-layer memory explainer](https://weavai.app/blog/en/2026/08/13/character-ais-new-3-layer-memory-system-explained/),
  [chat memories](https://www.roborhythms.com/character-ai-adds-chat-memories/).
- JanitorAI: [2026-08 memory incident](https://weavai.app/blog/en/2026/08/31/janitorai-memory-bug-experimental-feature-causes-amnesia/),
  [chat summary guide](https://www.roborhythms.com/janitor-ai-chat-summary/).
- SpicyChat: [memory guide](https://www.roborhythms.com/spicychat-memory-not-working/).
- Kindroid: [types of memory](https://medium.com/@adlerai/types-of-memory-within-kindroid-5659410c07ca),
  [journals](https://medium.com/@adlerai/journal-entries-on-kindroid-fce640dcceea).
- Nomi: [Mind Map review](https://nerdbot.com/2025/11/26/the-birth-of-deep-ai-continuity-mind-map-review/).
- Agnaistic: [README](https://github.com/agnaistic/agnai).
- Our code read for this report: `src/memory/historyCompaction.ts`, `src/runtime/compactHistory.ts`,
  `src/runtime/chapterKit.ts` (recall), `src/memory/archiveRecall.ts`, `src/memory/score.ts`, `src/memory/types.ts`,
  `src/memory/epistemic.ts`, `src/memory/consolidate.ts`, `src/runtime/coordinators/extractionCoordinator.ts`
  (short-term compaction gate), `src/runtime/coordinators/memoryCoordinator.ts`; plans `docs/plans/v3.0/40-long-context-compaction.md`,
  `33-deferred-threads.md`, `extension-research-2026-10-30/SUMMARY.md`.
