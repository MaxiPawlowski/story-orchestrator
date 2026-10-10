# Plan 41 — prompt size and prefix cache (Adolion saga, B1 evidence)

**Status (2026-10-08, branch `v2.7-prompt-size`): measured, proposals only.** Nothing in the product changed: no
candidate is a pure reduction of our own duplicated text (§3.1), so every change below needs the owner and a pod
measurement. Rows for the top two: `B1-PFX` and `B1-HIST` (manifest, 39 §Rows from v2.7 41).

**Update (2026-10-08, branch `v2.7-41-p3-narrator-scope`): P3 built** on the owner's decision (§7); its pod row is
`B1-NARR`. P1, P2, P4–P6 stay proposals.

Campaign rule: counts, sizes and block names only. Members are "Narrator" and "member"; books are named by role.

## 1. Method

| | |
|---|---|
| Chats | two live B1 SP6 saga chats, copied read-only from the lane data roots while B1 ran: lane 1 at 70 messages (23 player turns, 7 enabled members) and lane 3 at 247 messages (94 player turns, 19 enabled members). Each kept its own chat blob (memory tiers, epistemic, ledger, checkpoint path) |
| Replay | lane 8 only. Server from a private ST code copy (`C:\dev\so-lanes\agent-st-p41`, junctioned `node_modules`, this branch's build staged there), never the real ST slot. Lane 1's characters, worlds, persona and story-orchestrator settings were copied into lane 8 first (lane 8 had an older seed: 147 of 310 card files differed). Judge off (lane 1 had only `agencyCheck` on). Model calls went to a recording fake llama-server on the lane's pod port 18088 (`p41/fake41.mjs`), which logs every `/completion` body and answers `/tokenize` with SentencePiece |
| Capture | per loud request: the exact prompt body (fake log), ST's `itemizedPrompts` row (story string, WI string, card fields, persona, examples, history), `extensionPrompts` at `GENERATE_AFTER_DATA` (every injection with depth, role and text) and `WORLD_INFO_ACTIVATED` (book, uid, constant, position, depth). Requests driven with `/trigger await=true "<member>"`, so each one is a real loud generation with every hook (reply effort, sampler overlay, private block swap) |
| Tokens | ST's bundled `gemma.model` SentencePiece. Artemis is Gemma 4 (262K vocabulary); the bundled model is the older 256K one, so counts are an estimate (expect within a few %). 4.25 chars per token on these prompts |
| Pod numbers | `C:\dev\so-lanes\pods\{0..3}\requests.jsonl` (llama-server timings parsed by `so-pod`), lane row `pod.json` windows |
| Private evidence | `C:\dev\so-lanes\p41\` (scripts, fake log, dumps, `analysis*.txt`); not committed |

Caveat: after the first request of each chat, later replies in the replay are the fake's short lines, so World Info
keyword hits and the history growth of later rows understate a real turn. The first request of each chat is exact.

## 2. Composition

### 2.1 Pod side (B1, 2026-10-08)

| | pod 1 (lanes 1–2) | pod 2 | pod 3 |
|---|---|---|---|
| loud requests ≥ 12K tokens | 317 of 554 | 226 of 433 | 27 of 77 |
| prompt tokens p50 / p95 / max (≥ 12K) | 18 764 / 27 293 / 31 468 | 22 130 / 36 714 / 40 987 | 15 033 / 19 154 / 19 487 |
| prefill tok/s p50 (2 lanes sharing) | 982 | 1 326 | 1 370 |
| prompt ms p50 / p95 | 19 032 / 34 102 | 17 291 / 40 108 | 10 994 / 14 376 |
| predicted tokens p50, ms p50 | 512, 25 054 | 506, 19 336 | 496, 16 899 |
| prefill share of compute time (all > 1K) | 38 % | 44 % | 31 % |
| prompt tokens reused (sum) | 1.7 % | 3.7 % | 11.2 % |

All story-orchestrator roles ran on DeepSeek in B1, so these are the loud replies. The few requests that reused a
prefix reused 85–100 % of it (11, 18 and 9 requests): identical or append-only prompts (swipes, retries). No other
request reused anything. That fits llama-server's SWA rule (gotchas P2): a prefix is restored only from a context
checkpoint at or before the first differing token, and the checkpoints sit at the end of earlier prompts, so only a
prompt that extends the previous one past its end can use them.

### 2.2 One request, by source

Measured at the two chat lengths; the 25K column is interpolated between them (fixed parts linear in messages,
history the remainder). Install: `max_context` 98 304 (preset `max_length` 98 304), `amount_gen` 1 400, WI budget
25 % (24 226 tokens, never binds), WI scan depth 2, recursion on, Vector Storage chats off.

| Source | Narrator, 76 msgs | member, 77 msgs | Narrator, 252 msgs | member, 253 msgs | Narrator ≈ 25K (≈ 128 msgs) |
|---|---|---|---|---|---|
| **total tokens** | **17 500** | **12 873** | **43 026** | **37 967** | **25 000** |
| chat history (messages, names, turn wrappers) | 7 798 · 44.6 % | 7 854 · 61.0 % | 31 760 · 73.8 % | 31 817 · 83.8 % | ≈ 14 900 · 60 % |
| our private block (epistemic; Narrator: cast holdings) | 4 560 · 26.1 % | 111 · 0.9 % | 5 079 · 11.8 % | 260 · 0.7 % | ≈ 4 700 · 19 % |
| World Info in the story string (all from our story-lore append) | 1 449 · 8.3 % | 1 449 · 11.3 % | 2 293 · 5.3 % | 2 173 · 5.7 % | ≈ 1 700 · 7 % |
| memory facts (d4) | 778 | 779 | 780 | 768 | ≈ 780 |
| scene history (d6) | 438 | 438 | 448 | 448 | ≈ 440 |
| session details (d3) | 385 | 363 | 300 | 308 | ≈ 360 |
| checkpoint guidance (d4) | 374 | 301 | 569 | 428 | ≈ 430 |
| short term (d2) | 186 | 8 ¹ | 228 | 228 | ≈ 200 |
| ledger (d5) | 154 | 154 | 148 | 148 | ≈ 150 |
| pacing (d2) | 134 | 134 | 99 | 99 | ≈ 120 |
| player role (d10) | 74 | 74 | 74 | 74 | 74 |
| **our blocks, total** | **7 083 · 40.5 %** | **2 362 · 18.3 %** | **7 725 · 18.0 %** | **2 761 · 7.3 %** | **≈ 7 250 · 29 %** |
| card description + personality + scenario | 457 | 626 | 492 | 626 | ≈ 470 |
| card examples | 232 | 141 | 232 | 141 | 232 |
| card depth note (d4) | 72 | 37 | 107 | 37 | ≈ 80 |
| persona | 150 | 150 | 150 | 150 | 150 |
| system prompt | 81 | 75 | 81 | 75 | 81 |
| campaign WI at depth 4 (checkpoint-gated) | 54 | 54 | 66 | 66 | ≈ 60 |
| Author's Note (d4) | 11 | 11 | 11 | 11 | 11 |
| instruct wrappers, prefill | 113 | 114 | 109 | 110 | ≈ 110 |

¹ the fake answered the short-term compaction with its sentinel; the real block is ≈ 186–228.

World Info by book (all three books reach the chat through `storyLore.ts`; nothing is selected globally, no chat or
card book, no mirror book in scan):

| Book (role) | position | 76 msgs: entries / tokens (constant + keyword) | 252 msgs: entries / tokens |
|---|---|---|---|
| campaign world book | after story string | 11 / 1 165 (153 + 1 012) | 20 / 2 162 (153 + 2 009) |
| campaign chronicle book | after story string | 5 / 269 (0 + 269) | 2 / 110 |
| checkpoint book (the chat's arc) | at depth 4 | 1 / 54, checkpoint-gated, constant | 1 / 66, gated, constant |

One world-book entry is character-filtered to the Narrator (20 vs 19 entries at 252 msgs).

### 2.3 Growth

| | per message | per player turn (2.6 messages) |
|---|---|---|
| chat history | + 136 tokens | + 355 tokens |
| our blocks | ≈ flat: members 2.4K → 2.8K, Narrator 7.1K → 7.7K over 176 messages (tier budgets bind) | — |
| World Info | keyword-driven: 1.4K → 2.3K | — |

History is never trimmed: with `max_context` 98 304 ST keeps every message until the prompt passes ~96.9K tokens, so
a Narrator request crosses 25K at about 128 messages (49 turns), a member's at about 160, and the Narrator's 40K at about 230. The Narrator's holdings are capped only
per subject (6 lines × 124 cast voices, up to ≈ 22K tokens); today they hold 151 lines.

The memory-model requests (extraction read, compaction, scene passes) were 9.5K–12.6K tokens each, 2–3 per turn, in
the replay. In B1 they went to DeepSeek; on a local memory profile they would share the pod and roughly double its
prefill load.

## 3. Our share

### 3.1 Duplicates and over-budget blocks

| Check | Result |
|---|---|
| exact duplicate lines across our blocks, World Info, card, persona | 0 (the only hit is the depth-4 WI entry counted twice by the capture) |
| near duplicates (word Jaccard ≥ 0.6, across blocks) | ≤ 84 tokens per request (facts ~ epistemic 30; card ~ world book 45, not ours) |
| facts vs canon vs scene history vs lore | canon and story-so-far are not in the prompt (no chapters sealed); facts and session details are already deduped against each other (`nearDuplicateIds`) |
| repeats inside one block | 0 |
| a block over its budget | memory tiers sit inside their budgets. **The Narrator's cast holdings have no total budget**: 4 560 → 5 079 tokens, 130 aim lines for 124 cast voices, of which 14 were ever named in the 70-message chat and 4 in its last 10 messages |

So nothing qualifies as a no-behaviour-change reduction: the one oversized block is real content the Narrator reads,
and removing any of it changes what the model sees.

### 3.2 What drives the rest

| Setting | Value | Effect |
|---|---|---|
| ST context size (preset `max_length`, `max_context`) | 98 304 | no history trimming before ~96.9K tokens; history is 45–84 % of every request and the whole growth per turn |
| WI budget | 25 % of context = 24 226 tokens, cap 0 | never binds (1.4K–2.3K used) |
| response length | 1 400 | thinking + reply; predicted p50 ≈ 510 |
| group mode | swap (one card per request) | cheapest size; cross-member prefix 49 tokens |
| system prompt | contains `{{char}}` at char 172 | first cross-member difference |
| tokenizer | best match = the backend's `/tokenize` | |

## 4. Prefix structure

Common prefix between consecutive requests, measured on the captured bodies (what a perfect prefix cache could reuse):

| Pair | at 76–89 msgs | at 252–255 msgs |
|---|---|---|
| member after Narrator (swap mode, today) | 49 tokens · 0.4 % | 49 tokens · 0.1 % |
| same speaker, 1–2 new messages | Narrator 9 400–9 985 · 54–56 %; member 9 614–10 243 · 74–77 % | Narrator 33 892 · 79 % (9 134 re-read) |

The same-speaker divergence is always the player-role block at depth 10, because every new message shifts every
depth injection by one. After it, the re-read tail at 252 messages is: 10 messages (≈ 1.9K), the five memory and
ledger blocks interleaved with them, and the joined depth-4 system turn (Author's Note + facts + guidance + private
block + card depth note + depth-4 WI: 6 618 tokens Narrator, 1 576 member).

### 4.1 Options

Estimates are per request, tokens re-read with a prefix cache that works (§4.2 says it does not today on this server).

| Option | What the model sees | Measured / estimated |
|---|---|---|
| (a) join cards (ST group mode "append") + a system prompt without `{{char}}` + character-filtered WI out of the story string | every enabled card every turn; a neutral system prompt | **measured on lane 8, 252 msgs, 19 enabled:** +13 061 tokens per request (43 026 → 56 087, +30 %). Member after member: 47 076 of 51 119 shared (92 %). Narrator after member: 12 083 shared (24 %), diverging at the one Narrator-only world-book entry in the story string. With `{{char}}` still in the system prompt: 45–49 tokens. At 7 enabled members the cost would be ≈ +3.5K. Without a working cache this is a pure size increase |
| (b) our volatile blocks to the end | the same text, closer to the reply | moving the player role from depth 10 to 4: −470…−680 tokens re-read (about 7 % of the tail). Moving everything of ours to depth ≤ 1 still leaves ST's depth-4 Author's Note, card depth note and gated WI as the divergence; the injected mass itself (2.8K member, 7.7K Narrator) is rebuilt every turn wherever it sits |
| (b′) stable shared blocks into the story string | facts, scene history, guidance and the Narrator's holdings above the history | Narrator tail 9.1K (252 msgs) → ≈ 2–4K; member tail ≈ 3.0K (87 msgs) → ≈ 1.5K. Position change for the model; the private holdings at the top are per speaker, so they only help same-speaker pairs |
| (c) llama-server | unchanged | see §4.2 |

### 4.2 llama-server

| Flag | State | Note |
|---|---|---|
| `cache_prompt` | ST sends `true` | |
| `--ctx-checkpoints 32 --checkpoint-min-step 1024 --cache-ram 16384` | tried in B1 | reuse stayed ≈ 0 except append-only prompts (§2.1); "making room for prompt cache entry" 337 times on pod 1 |
| `--swa-full` | not tried on the pod | keeps full KV in the SWA layers, which is the only route to restoring a prefix at an arbitrary point. v2.6 15 measured +12.8 GB at 20K context f16 on the 32 GB card (≈ 0.62 MB/token f16, ≈ 0.33 MB/token q8_0, estimated), so the pod's 2 × 98 304 would not fit; 2 × 49 152 q8_0 ≈ +32 GB on top of today's ≈ 30 GB. v2.6 15 research [S13] says cache reuse is not supported for Gemma 4 even with it, which this repo has never measured |
| `--cache-reuse` (chunk shifting) | not applicable | not supported with SWA |
| slot affinity | ST sends no `id_slot`; 2 slots shared by 2 lanes and every member | even a working cache usually finds another member's prompt in the slot unless the RAM cache restores the right one |

## 5. Ranked proposals

Saving = prompt tokens per loud request at SP6 length unless stated; prefill at ~1 000–1 400 tok/s on the shared pod,
so 10K tokens ≈ 7–10 s per request.

| # | Change | Owner | Saving | Behaviour risk | Measure (predeclared floor) |
|---|---|---|---|---|---|
| P1 | **Bound the history**: ST context 24 576 (or 32 768) for the saga, the memory tiers carrying what drops out; best as a chunked window (hide old messages in steps of ~20, aligned with short-term compaction) so the prompt start stays fixed between steps | owner (preset / install), chunking would be ours | 0 below 23.2K (24 576 − 1 400 response); −19 850 tokens (−46 %) at 43K; caps prefill at ≈ 17–23 s | high: verbatim long-range history leaves the prompt; front-trimming by one message per turn also moves the prompt start every turn (no cache, ever) unless chunked | row **B1-HIST** |
| P2 | **Make the server reuse prefixes**: one pod arm with `--swa-full`, `LLM_CTX` sized to fit (2 × 49 152 q8_0), everything else as B1 | owner (pod args) | up to −79 % of re-read tokens for same-speaker pairs at 252 msgs (−54…77 % at 76), if Gemma 4 reuse works at all | none in content (the prompt is byte-identical); VRAM and decode speed | row **B1-PFX** |
| P3 | **Scope the Narrator's cast holdings**: enabled members plus cast named in the last N messages or in the checkpoint's motives, with a total token budget | ours (`memory/innerRender.ts` `renderNarratorHoldings`) | ≈ −3 900…−4 800 tokens per Narrator request (−22 % at 70 msgs, −11 % at 250) | medium: the Narrator loses the drives of absent cast it might bring on stage | payload golden diff (holdings lines only) + an A/B on the pod: blind preference (Astra, delegated) ≥ 50 % non-inferior over 20 Narrator turns, and "invented a stranger when a named cast member fits" not above control |
| P4 | **Cross-member prefix**: join cards + `{{char}}`-free system prompt + character-filtered WI moved out of the story string | owner (campaign preset, group setting) | only with P2 working: member after member 92 % shared, Narrator after member 24 %; costs +3.5K (7 enabled) to +13.1K (19 enabled) tokens per request either way | high: every card every turn, different system prompt | after P2 passes: B1-PFX's arm with join mode, floor: re-read tokens p50 ≤ 0.5 × the swap-mode arm |
| P5 | **Depth consolidation**: player role 10 → 4, scene history 6 → 4, ledger 5 → 4 | ours (`INJECTION_REGISTRY`) | only with P2: −470…−680 re-read tokens per request | low (same text, a few messages later) | payload golden diff (positions only) + B1-PFX's same-speaker reuse ≥ the P2 arm |
| P6 | Memory-model requests off the pod (as B1 did) or below 8K | owner (routing) | 9.5–12.6K tokens × 2–3 per turn of pod prefill when local | none for replies | record only |

Order to run: P2 first (it decides whether P4/P5 are worth anything), P1 in parallel (it pays without a cache), P3 as
our own change once the owner accepts the A/B.

## 6. Rows

Both rows live in the manifest and in 39 §Rows from v2.7 41; both are B1-stage pod measurements, ×2 with the rule 11
reset (`adolion`), runner owed by this plan. Pod estimate (`test/phase-c/pod-estimates.json`): B1-PFX 170 lane-minutes per run (2 arms, a llama-server restart each, 80 requests of ~40K tokens at ~60 s), B1-HIST 180 (2 arms × 30 turns at ~3 min).

| Id | Arms | Floor |
|---|---|---|
| B1-PFX | control (B1 args) vs `--swa-full` with `LLM_CTX` 98 304 total, `LLM_PARALLEL` 2; one model lane replaying the 247-message SP6 chat with scripted `/trigger` pairs (same speaker twice, then member after Narrator), 40 pairs per arm | the `--swa-full` arm reuses ≥ 50 % of prompt tokens on same-speaker pairs (p50 of 1 − tokens_evaluated / prompt tokens), keeps per-stream decode ≥ 25 tok/s p50, and logs 0 OOM, context-full or truncation events; control recorded beside |
| B1-HIST | control (`max_context` 98 304) vs 24 576 on the same SP6 replay continued for 30 real turns | the arm keeps every loud request ≤ 24 576 prompt tokens, prompt ms p50 ≤ 0.6 × control, and answers ≥ 8 of 10 recall probes about events older than its window consistently with the transcript (blind, Astra) with no more established-fact contradictions than control |
| B1-NARR | control = the bundle before P3 (master `bf1e0c77`) vs the P3 bundle, the same SP6 chat continued for 20 real Narrator turns per arm (pod estimate 120 lane-minutes) | the P3 arm keeps the holdings ≤ the enabled members' own holdings + 1 100 tokens on every Narrator request and its Narrator prompt p50 ≥ 2 500 tokens below control (−3 056 measured at 256 messages); Astra (blind, delegated) prefers it or ties on ≥ 50 % of the 20 pairs; strangers invented where a named cast member fits are not above control |

B1-PFX and B1-HIST now run on a bundle that carries P3: their Narrator requests are ≈ 3.1K–3.7K tokens smaller than §2.

## 7. P3 as built (2026-10-08)

Owner decision: the Narrator's cast holdings (`renderNarratorHoldings`, `memory/innerRender.ts`) cover the active
checkpoint's cast plus the members named in the last 20 messages, most recently named first. Main's decision on the
budget (same day): the members enabled in the group are never dropped; ≈ 1 000 tokens bound only the additions.

| | |
|---|---|
| Checkpoint cast | `checkpointCast`: the enabled group members (the cast the checkpoint's `cast_changes` leave on stage), the members the checkpoint gives a motive, and its `talk_control` speakers and lead, each resolved by roster id or card name |
| Named | `nameMatcher` (`talk/aliases.ts`): the card name and the member's distinct aliases (`distinctAliases`, `aliasKey`: case-insensitive, leading article dropped), plus a given name that one member alone carries, written capitalised; an alias two members share, a title (`Lady`, `Captain`, …) or an article never names anyone. The speaker of a row counts as named. Hidden (`is_system`) rows are skipped |
| Window, budget | `NARRATOR_HOLDINGS_WINDOW` 20, `NARRATOR_HOLDINGS_TOKEN_BUDGET` 1 000 (`memory/stores.ts`, beside the tier budgets), counted with `estimateTokens` (4 chars per token, the tier budgets' estimator); no setting |
| Order | most recently named first; a member never named (checkpoint cast only) after them; ties in roster order |
| Budget | the members enabled in the group (on stage) are always kept and not counted. The additions (motive holders and talk speakers not enabled, members named off stage) share the budget in display order, newest named first, whole members only, never a cut line; one that does not fit is dropped and the next is tried |
| Freshness | the Narrator's block is re-rendered when the Narrator is drafted (`MemoryInjector.onMemberDrafted`), so the newest message counts; nothing is stored, so a swipe, delete or reopen re-derives it from the chat and the engine state |
| Privacy | unchanged: the block is the Narrator's private block and reaches no other member (review test), held-secret filtering per drafted member is untouched |

Measured on lane 8 (private ST copy, fake llama-server), the two plan-41 replay chats, the Narrator's private block
read from the prompt after the draft hook, SentencePiece (`gemma.model`); before = master `bf1e0c77`, after = this
branch, each run twice with identical text:

| Chat | enabled | private block before → after | holdings lines | cast subjects |
|---|---|---|---|---|
| lane 1 copy, 84 messages | 7 | 4 560 → 829 tokens (−3 731) | 151 → 28 | 124 → 10 |
| lane 3 copy, 256 messages | 19 | 5 076 → 2 020 tokens (−3 056) | 176 → 79 | 124 → 27 |

Every line after is a line before (a subset, reordered); the self-voiced preamble is byte-identical. Split of the
after block: 84 messages, 6 members on stage 468 tokens + 4 additions 275; 256 messages, 18 on stage 1 348 + 9
additions 551 (≈ 600 by `estimateTokens`), so the 1 000-token budget did not bind on either chat. (The first build of
this branch also counted the enabled members against the budget: 1 010 tokens at 256 messages; replaced by Main's rule.)

Payload goldens (`so-payload-golden`, lane 8, all five cases, before and after each captured twice, identical within
a build): the four existing cases are byte-identical (their narrators hold no aims of absent cast). The new case
`group-narrator-holdings` (three members on stage, four off stage with drives) differs only in its Narrator capture,
declared in `test/measurements/v2.7/41-p3/declared.json`: the off-stage member nobody named and no motive names
leaves, and the two named members move ahead, newest first. Report: `test/measurements/v2.7/41-p3/payload-diff.json`
(every difference declared).

## Unresolved questions

- P1 window size: 24 576 or 32 768, and is a chunked window (ours) wanted, or ST's per-message trim?
- P2 VRAM: is giving up half the pod's context (2 × 49 152) acceptable for the arm?
- Should the next B1 carry the memory roles on DeepSeek again (P6), so pod rows stay comparable?

## Gate record (2026-10-08)

- Changes: this doc, two manifest rows (`B1-PFX`, `B1-HIST`), their 39 section + index lines, their pod estimates. No product code.
- `npm run gates -- --no-storybook` (ST_ROOT = the real ST, read only): all green in 155.2 s (build, typecheck, typecheck:test, debug:typecheck, test:debug, test 7000/7000 minus 1 skipped, test:release, test:plugin, lint, test:replay 32 of 32 killed). Storybook skipped.
- First run red: `podSchedule.test.mjs` (the two new rows had no `runMin`; fixed) and test:replay (green on the re-run, unchanged inputs).
- Parity both ways checked by hand: dropping B1-HIST from the manifest or B1-PFX from plan 39 is named by `parityProblems`.
- Live: lane 8 only, private ST copy, fake llama-server on 18088; lane 8 settings and the saga group restored from backup afterwards (the copied cards, worlds and two chat files stay).

## Gate record — P3 (2026-10-08, branch `v2.7-41-p3-narrator-scope`)

- Changes: `memory/innerRender.ts` (`checkpointCast`, `narratorScope`, scoped `renderNarratorHoldings`), `talk/aliases.ts` (`nameMatcher`), `memory/stores.ts` (the two constants), `runtime/memoryInjector.ts` (scope for an omniscient member; the Narrator's block re-rendered at draft); guide line on `view: "omniscient"` (story-guide + `guideTopics.ts`, `npm run docs:guide`); payload case `group-narrator-holdings` + `test/measurements/v2.7/41-p3/` (declaration, diff report); `test/goldens/arrival-findings.json` re-recorded (the new fixture is one more covered entry, nothing else moved); manifest row `B1-NARR`, its 39 section + index lines, pod estimate 120.
- Jest: `memory/innerVoice.test.ts` (scope: checkpoint cast kept, named added by name / given name / alias, newest first, window and hidden rows, enabled members never dropped, the budget binding only the additions, whole members, the next one tried, deterministic, unscoped unchanged), `talk/aliases.test.ts` (`nameMatcher`), `coordinators/innerVoiceInjection.review.test.ts` (an absent member enters the Narrator's block only once named, read at draft time, never a member's block, gone again after the message is removed). No recorded test pinned a changed block: `groupPayloadInvariance.recorded.test.ts` unchanged and green.
- `npm run gates -- --no-storybook` (ST_ROOT = the real ST, read only): all green in 88.3 s (build, typecheck, typecheck:test, debug:typecheck, test 7039 passed + 1 skipped, test:debug, test:replay 32 of 32 killed, test:plugin, test:release, lint). Storybook skipped. First run red: lint (a guide line over 200 chars), `docs/guide/author` drift, the arrival golden (new fixture); fixed as above.
- Parity both ways by hand: dropping B1-NARR from the manifest or from plan 39 is named by `parityProblems`.
- Amended the same day for Main's budget rule (enabled members never dropped, the budget on additions only): code, jest, declaration text, B1-NARR floor (enabled members' holdings + 1 100; p50 saving ≥ 2 500, from the −3 056 measured at 256 messages), guide line. Saga re-measured twice (identical), payload goldens re-captured twice (identical) and re-diffed against the same before: the same six hunks, all declared. `npm run gates -- --no-storybook`: all green in 87.4 s (test 7039 passed + 1 skipped, test:replay 32 of 32 killed), Storybook skipped.
- Live: lane 8 only (private ST copy `agent-st-p41`, this branch and `bf1e0c77` staged there in turn, never the real ST slot), fake llama-server on 18088, `st-session reload` before each capture after a restage. Numbers in §7. Lane 8 settings, the saga group and the two saga chat files restored from backup afterwards. Note: a lane browser started over a restaged copy served the previous lazy chunk until reloaded; the first "before" of the new case was taken that way and discarded.

## Gate record — B1-PFX / B1-HIST on pod 2 (2026-10-10, branch `v2.8-pod2`, master `84c23335`)

- Measurement only, no code. Pod `27f66m9327okh8` (RTX PRO 4500 32 GB), lanes 30/31 on a private ST copy; full record and tables
  in `docs/plans/v2.8/31-v27-wrap-backlog.md` §Pod 2 measurements 2026-10-10.
- **B1-PFX: FAIL ×2.** Deviation, forced by the card: the row's swa arm (`--swa-full`, `LLM_CTX` 98304, P2) does not fit 32 GB
  (24576 already uses 30.7 GB); both arms ran at 24576, P2, with the B1 flags, on the saga chat cut to 80 messages (13.4–15.9K-token
  prompts), 40 pairs per arm-run, a quiet lane (loud requests only). Reuse p50 = 0 on same-speaker and member-after-Narrator pairs in
  all four arm-runs; `--swa-full` decode p50 24.3 / 24.2 tok/s (< 25), prompt ms p50 +23 % over control; 0 truncation. A synthetic
  probe on the same server shows `--swa-full` restores a prefix up to a mid-prompt change (8,557 of 17,120) and control does not, so
  the zero comes from the prompt: World Info in the story string changes with each new message about 1.1K tokens in (§4's
  depth-10 player role is no longer the first difference). Consequence for §5: P2 and P5 buy nothing until that World Info leaves
  the story string (M9, lorebook R5); P4 stays moot.
- **B1-HIST: INCOMPLETE.** Run 1 only, both arms at the same time from the same seeded data, stopped after 3 of 30 turns per arm
  (6–9 min per turn on the shared pod; the row needs ~8 h). As far as it ran: the 24576 arm stayed ≤ 24,576 prompt tokens (max
  23,108; control max 41,000) and prompt ms p50 0.49 × control (39.8 s vs 81.6 s). Recall probes (written before the run, private)
  not asked; no verdict.
- Evidence (private): `so-sessions:evidence/phase-c/pod2-2026-10-10/` (`rows/pfx/run{1,2}-{control,swa}/rec.json`, `rows/pfx/synthetic.md`,
  `rows/hist/`, `pods/2/`).
