# Timeline-Memory — 2026-10-14 harvest

meta: https://github.com/unkarelian/timeline-memory · head `2d7193c` (unchanged since v2.4 review) · **AGPL-3.0** (ideas only, never code) ·
mode: second look · read: prior review, `post.md`, `src/settings.js` default prompts (`:20-360`), `src/memories.js` macros (`:494-608`),
arc analyzer (`:2108-2240`), `src/agentic-timeline-fill.js` tools (`:338-533`); skipped loading screen/games/tutorial/locales ·
prior: `docs/plans/v2.4/extension-research/timeline-memory-an-agentic-memory-system.md`

## What it is / what changed
- Repo unchanged. SO changed: prior idea 1 (same-chat reload reconcile) is built — message fingerprints, eventless-change rollback,
  hydrate vs shorter chat (`src/runtime/fingerprints.ts:1-8`, `src/runtime/fingerprintReconcile.review.test.ts:122,170`).
  Prior idea 2 (summary routes, raw answers) is now plan 43 (`43-verbatim-recall.md:30-35` cites it). Prior idea 6 (prompt `filter`
  arg) still absent (`src/services/stHost/extensionPrompts.ts:10`).
- This pass: prompt-level and contract-level details the prior review skimmed, checked against plans 43/47/50/55 and chapters.

## How it works (only what the prior review did not cover)
- **Query planner constraints** (`src/settings.js:101`): questions must be self-contained (answerer sees only the queried chapter,
  "do not reference current events"), must not ask what the summaries already answer, ≤3 chapters per query.
- **Summaries written as a routing index** (`settings.js:29-45`): "story map … for querying purposes", no dialogue, turning points only.
  Summary = index key; raw chapter = answer.
- **Positional frame in the injected block** (`settings.js:344-356`): "contains only past information, not future"; "your current
  message ID is {{lastMessageId}}, current chapter begins at {{firstIncludedMessageId}}, same scale as the timeline".
- **Model cites absolute ids, code validates** (`settings.js:244`: "must exactly match the absolute ID … [id [N]]"; check
  `memories.js:2133-2147` integer + in-range; auto mode "ONLY assistant messages as endpoints", `settings.js:328`).
- **Arc analyzer** (`memories.js:2185-2238`, prompt `settings.js:236-256`): 3–7 candidate endpoints, each `{title, summary,
  justification, chapterEnd}`, ≥15 messages, "prefer the latest message that still completes the arc"; the human picks one.
- **Agent loop budget** (`agentic-timeline-fill.js:97,376,432,459,522`): retry counter resets on every successful tool call (progress
  budget, not absolute); an over-limit range returns a corrective error string (`:409-412`) instead of failing; a stealth terminal
  tool `end_information_retrieval{final_information}` makes the agent write its own consolidated answer (`:470-490`).
- **Hidden messages still answer** (`memories.js:934,958`): chapter queries read `is_system` messages raw; only the planner's view
  drops them (`:552`). With `hide_chapter` default true (`settings.js:121`) every summarized chapter is `is_system`.

## Patterns for SO

### P1. Quote lines carry the message id — pattern · extraction contract (47, 55 B) · partial · value 3 · effort S
What: model cites an absolute message id alongside the text; code checks both. Theirs `settings.js:244`, `memories.js:2133-2147`.
Ours: the read window already tags `[index]` (`src/extraction/contract.ts:60`); plan 42 witness lines carry `m=<id>` + anchor
(`42-witness-filter-v2.md:152-155`). But plan 47's lines are quote-only (`47-promises-remembered.md` §Recommendation 1:
`[promised] Promisee | "<exact words>"`), and `evidenceSources` returns **every** message holding the quote
(`src/extraction/evidence.ts:86-92`). A repeated pledge ("I'll come back", said twice) resolves to two spans; 47 does not say which.
Sketch: `[promised] m=<id> Promisee | "<quote>"`; accept only when the quote is in message `<id>`; unknown id → fall back to unique
match, refuse if ≥2. Same for 55 B `[pledged]` and the resolution lines. Stable id = hash(chatId, span) then stays unique.
No invariant touched. Add a fixture: duplicate quote in two windows rows.

### P2. Time anchor on recalled spans — pattern · plan 43 render · absent · value 3 · effort S
What: injected memory states where it sits in time and that it is past (`settings.js:348,354`).
Ours: plan 43 renders `Name said: "…"` with no "when" (`43-verbatim-recall.md:100-103`); D10 archive recall carries chapter titles
internally (`src/memory/archiveRecall.ts:41-43`, `playerTitle`) but the quote format drops them. An undated quote from ten scenes ago
reads as current (a promise renegotiated since, a feeling changed).
Sketch: `Name said (<chapter playerTitle> | <story-time label from plan 50 B1c>): "…"`, label derived at render, never stored;
quote stays byte-equal. 47's reminder line too ("promised you on Day 3: …"). Payload-golden hunk; no new floor needed beyond VR9.

### P3. Hidden messages and recall eligibility — host-fact / design gap · plans 42/43/47 · absent · value 3 · effort S
What: `is_system` is overloaded: ST `/hide` (player intent: out of context) and summarizers (TM hides every summarized chapter,
`memories.js:1970-1981`) both set it. TM still answers from hidden rows (`:934`).
Ours: the read window drops hidden rows (`src/extraction/windowHygiene.ts:115`), fingerprints ignore `is_system` ("hiding is not
deleting", `fingerprints.ts:6`), and 42's revision = `swipe_id` + text hash (`42-witness-filter-v2.md:23`) — so a span read before
the player hid it keeps a valid revision and stays recall-eligible; a span in a chapter hidden by another extension before we read it
never gets a witness claim (fails closed, fine). Neither 43 nor 42 says what a later `/hide` means.
Sketch: decide in 43 §Decisions: re-check `is_system` at query time with the revision; hidden → ineligible (player intent wins,
fails closed like the rest of §5). Same rule for 47's Overview quotes. Fixture: witnessed span, then `/hide`, expect no recall.

### P4. Self-contained query rewrite for recall — test-idea · plan 43 E0 / option F · absent · value 2 · effort M
What: planner turns "current scene + summaries" into self-contained questions that never lean on current context (`settings.js:101`).
Ours: 43 D queries with the player's raw request (`43-verbatim-recall.md:104-106`); "what did she promise?" has an unresolved
pronoun. An LLM rewrite on the reply path breaks VR6r (p95 ≤ 300 ms, `:136`) and invariant "reply never waits".
Sketch: E0 arm only (deterministic rewrite: replace pronouns with the last-addressed roster name from the window), measured against
raw request on hit@4. An LLM rewrite only for F, off-path after a reply renders, ready for the next turn. Not before E0 has a winner.

### P5. Candidate endpoints with justification, author picks — pattern · chapters (living-director chapters) · partial · value 2 · effort M
What: 3–7 scored chapter-end candidates with title/summary/justification, min length, "latest message that still completes the arc".
Ours: authored chapters seal on the path (`src/runtime/chapters.ts:26-41`); the living director may emit chapters as ops
(architecture.md §living director). Endpoint is a checkpoint, never a message index, so the pattern only fits director-created
chapters in open stretches. Fold into director op validation if open stretches produce over-long unchaptered spans; else skip.

## Host facts
- `is_system` is written by ST `/hide` and by summarizer extensions alike; a hidden message keeps `mes` and `swipe_id`, so any
  revision/fingerprint that skips `is_system` cannot tell "hidden later" (TM `memories.js:1970-1981`, our `fingerprints.ts:6`). See P3.
- `ToolManager.registerFunctionTool` `shouldRegister` is re-evaluated per request (they gate all tools on a session flag,
  `agentic-timeline-fill.js:381`); tools vanish from other generations without unregistering. Relevant only if Ask/wizard ever moves
  to ST tools (it does not: harness bridge / `profileToolBridge.ts`).
- No new contradiction with gotchas. No SO bug found from this repo; prior coexistence bug (same-chat reload) is fixed.

## Not worth taking
- Calendar / story time (50): TM has message ranges only, no fictional time. Nothing.
- NPC commitments (55): nothing; TM has no typed records.
- "Answer only what's new; reader has the summary" (`settings.js:80`): already in the prior review; apply when 43 C's span picker prompt is written.
- Progress-reset retry budget (`agentic-timeline-fill.js:376`): our agent loop refuses repeats (`src/copilot/agent/loop.ts:211-218`) and
  `checkToolCall` already returns did-you-mean corrections; the reset rule adds nothing measurable.
- Stealth terminal tool with `final_information`: our Ask/wizard end on a plain reply; no gain.
- Index-style summaries (`settings.js:29-45`): only as an E0 arm if summary-routed arm (c) misses its floor; our summaries are injected
  text first.
- `roll_dice` with `Math.random` (`:518`): breaks seeded chance; never.
- Agentic session in the live chat, autonomous lore edits, reply waits on retrieval: anti-patterns, unchanged from prior review.
