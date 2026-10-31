# Context census, 2026-10-31

Owner question: play runs at 32,768 context on the 3090. Do our features eat it? Goal: optimise, not cut.
Research only: recorded artifacts, no lane, no ST :8000, no GPU. Master `a0d49e1d3`.

## Method

- **Sources** (read-only, counts only, no text copied):
  - campaign play, adolion-fresh lane 34: `debug/runs/2026-10-27-v3019s2r-live` + `debug/v3019s2`, 102 drafted loud
    requests over 18 chats, boundaries 0-12.
  - toy group long chat, lane 42 `debug/v29gpu2`: 226 loud, boundaries up to 109 (one chat at 79 drafted 3 voices a turn).
  - test story, lane 45 `debug/s6h`: 120 loud, two chats to boundary 79.
  - side passes from the same three files: 358 inner beats, 242 reads, ~60 summaries, 57 speaker choices, 12 epistemic + 12 state passes.
  - payload goldens: none committed (`test/measurements/v2.7/payload/` holds only README + declared files); the newest capture
    is lane 32 `debug/payload-endbatch/eb-2` (toy group, 8 cases): the only source for **resting** vs drafted prompts.
  - `so-sessions` checkout here is empty. No campaign chat beyond boundary 12 exists on disk.
- **Tokenizer**: the real Gemma 4 vocab. `C:\dev\tools\llama-b11888-cuda12.4\llama-tokenize.exe` against the Artemis
  Q4_K_M GGUF (vocab only, `CUDA_VISIBLE_DEVICES=-1`, `--no-bos`). Per source × block, every distinct text was tokenised
  (≤120K chars each) to get a chars/token ratio (3.0-5.1; prose 4.2-4.7, bracketed state lines 3.0-3.7); block tokens =
  chars / ratio. Validation: 15 whole prompts tokenised directly, estimate within 2 % (largest: 17,334 real vs 17,034
  estimated; the gap is the template, estimated at 1 token per 9.5 chars of turn markers).
- **Attribution**: Gemma TC prompt split on `<|turn>` markers. First system turn = ST preamble (think directive, main
  prompt, card fields, persona = last line). user/model turns = history. Every later system turn is split line by line on
  each writer's header (`MEMORY_BLOCK_LABELS`, `GUIDANCE_HEADER`, `innerRender` headers, `ledger` "Current state:",
  `narratorSheet` headers, `pacing/steering`, scene tracker `[Scene:`/`[Present:`, `player.ts` "In this story,").
  Bracketed or plain lines before any of our headers = ST World Info + Author's Note (the two cannot be told apart from the
  prompt; late placement moves the story's WI into the depth-4 block, so it sits there). `memory/budget.ts`
  `estimateTokens` (chars/4) over-counts our blocks by ~5-15 % against the real tokenizer.

## 1. Where the 32K goes: drafted loud request

Reserve: `amount_gen` 1,400 (`n_predict`, includes `reasoning_budget_tokens` 400). ST trims history at 32,768 - 1,400 =
**31,368 prompt tokens**. No recorded prompt came near it: the largest is 17,334 (toy, boundary 79). Nothing has been
truncated yet in any recorded run.

Campaign, tokens per drafted request (mean / max):

| Block | Narrator (n=20) | Member (n=82) | Writer |
|---|---|---|---|
| **Total** | **1,887 / 4,966** | **2,884 / 5,584** | |
| History (verbatim chat) | 599 / 2,019 | 987 / 3,487 | ST |
| Card fields | 320 / 763 | 426 / 870 | ST card |
| Persona | 150 / 150 | 150 / 150 | ST persona |
| Main prompt + think directive | 117 / 120 | 115 / 117 | ST preset |
| World Info + AN (depth-4 block) | 182 / 1,460 | 409 / 1,659 | ST WI (late lore) |
| Checkpoint guidance (`checkpointGuidance`) | 221 / 577 | 317 / 686 | pacingCoordinator |
| Session details (`memorySessionDetails`) | 74 / 306 | 103 / 312 | memory |
| Scene history / short term / facts | 39 / 218 | 77 / 267 | memory |
| Private block (`epistemic`: aims, knowledge, life, delivery) | 73 / 474 | 113 / 394 | memoryInjector |
| Narrator holdings (part of `epistemic`) | 42 / 417 | 0 | innerRender |
| Ledger | 36 / 114 | 55 / 183 | memory/ledger |
| Story so far / open threads | 7 / 29 | 25 / 149 | chapterKit |
| Pacing (`pacing`, depth 2) | 17 / 165 | 38 / 166 | pacing/steering |
| Player role, scene tracker, sheet | 21 / 151 | 32 / 93 | playerRole, scene, narratorSheet |
| Template markers + reply prefix | 30 / 60 | 37 / 70 | Gemma instruct |

Grouped, campaign (mean / max): ST preamble 696 / 1,178; ST WI+AN 369 / 1,678; **all story blocks 729 / 1,687**;
history 881 / 3,340. Our blocks are about a quarter of today's short campaign prompts and never above 1.7K.

### Early vs long chat (history share)

| Chat stage | Toy total | of which history | Test story total | of which history |
|---|---|---|---|---|
| boundary ≤ 5 | 957 | 80 (8 %) | 913 | 250 (27 %) |
| 6-39 | 3,593 | 2,699 (75 %) | 3,399 | 2,558 (75 %) |
| ≥ 40 | 11,509 (max 17,034) | 10,469 (91 %) | 8,076 (max 13,510) | 7,092 (88 %) |

Story blocks stay flat with length (toy late: short-term 162, guidance 156, delivery 34, scene 14 → ~370 tokens; test
story ~480). History grows **150-280 tokens per boundary** (campaign chats 124-278, long chats 164-196; a boundary is one
rendered reply, so one player turn with three voices is ~3 boundaries).

### Resting vs drafted (goldens, toy group)

Resting prompts carry no private block (by design). Drafting adds `epistemic` 37-177 tokens (160-763 chars, narrator
holdings the largest); guidance 151-167, away notice 34, facts 26 ride both. Per-member prompts otherwise differ only in
the card ST renders.

### Projection: a grown campaign chat at saturation

Ceilings in code: memory tiers 800 + 600 + 300 + 500 = 2,200 (`DEFAULT_TIER_TOKEN_BUDGETS`), narrator holdings 1,000
(`NARRATOR_HOLDINGS_TOKEN_BUDGET`), observed guidance ≤ 700, private block ≤ 500, ledger/story-so-far/pacing/sheet/role ≤
~900. **ST WI budget on the lane is 25 % of context, no cap** (`world_info_budget 25`, `world_info_budget_cap 0`): up to
~8,200 tokens of lore, the one consumer with no cap of ours.

| Fixed load | Tokens | History room at 32K | Boundaries before ST trims |
|---|---|---|---|
| Today's campaign max (preamble 1.2K + WI 1.7K + ours 1.7K + reserve 1.4K) | ~6.0K | ~26.8K | ~130 |
| All our ceilings full, WI at observed max | ~9.6K | ~23.2K | ~115 |
| Our ceilings + WI at its 25 % budget | ~16K | ~16.7K | ~85 |

At saturation every 200 tokens of injection displace one boundary of verbatim history; before saturation (all recorded
play) they displace nothing and cost only prefill time.

### The cacheable prefix

Consecutive same-member requests share everything up to the depth-4 block. Tail re-prefilled per turn (tokens after the
common prefix): campaign median 1,737 / p90 3,142; toy 1,981 / 2,227; test story 1,524 / 2,352. In the campaign the
depth-4 block (WI + our blocks, up to ~3.4K) is most of that tail: at the measured ~950 tok/s prefill
(06 bench) each 1K tokens there is ~1 s of TTFT every turn. This, not capacity, is what injections cost today.

## 2. Side passes (separate requests, own slot state, `n_ctx_slot` 32,768, `--parallel 1`)

| Pass | Calls (campaign) | Prompt mean / max | Out cap | Largest parts |
|---|---|---|---|---|
| Story read (`[STORY STATE READ`) | 105 | 3,208 / 6,247 | 2,048 | contract 1,382 fixed; quality questions 1,021 / **3,523**; instructions 336; transcript 304 / 3,031; canon-lite 80; open arcs 85 |
| Inner beat (`[PRIVATE NOTE TASK`) | 215 (2.1 per loud reply) | 992 / 1,870 | 96 | transcript 583 / 1,329; rules 183; private block 86 / 476 |
| Speaker choice | 57 | 855 / 1,332 | 96 | transcript |
| Summaries (`Write plain TEXT ONLY`) | 23 | 389-1,982 | 256-1,536 | new messages; long chats 2.0-3.2K each (toy 21 calls) |
| Epistemic / state extraction | 11 / 11 | 987 / 558 | 1,280 / 768 | contract |

Toy long chat reads stay at 1,894 / 2,302 (contract 1,406, quality questions 172): the campaign's 3.5K of quality
questions is the story's many qualities. No side pass is within 20K of its budget (`requestBudget` = profile limit;
`scopeBudget` cuts the read scope with `SCOPE_EXTRA_TOKENS` 250 per slot). Their cost is GPU time and member-cache
evictions: per campaign loud reply ~1 read + 2 inner beats + 0.5 speaker choice ≈ 6.0K prompt tokens of side prefill
against 2.9K of loud prompt.

## 3. Waste, ranked by tokens saved

Exact duplication across blocks is negligible: per-prompt duplicate sentences ≤ 33 tokens (guidance ↔ pacing agency
clause, 9 prompts); 5-gram overlap between any two blocks ≤ 5 tokens a prompt (session details ↔ history). The fact in
canon + ledger + lore pattern does not show in recorded prompts. The waste is uncapped size, empty or in-window content,
and static text after the prefix boundary.

| # | Item | Saved per drafted request | Module | Invariant risk |
|---|---|---|---|---|
| 1 | **WI has no hard cap**: 25 % budget = up to 8.2K; observed 1.7K. Set `world_info_budget_cap` (e.g. 2,500) or a story-lore token cap in our late-lore pass; rank by recency/pin like `lore_select` exclusive | 0 today; up to ~5.7K at saturation (~28 boundaries of history) | install setting, or `runtime/lorePlacement.ts` / `loreSelect*.ts` (scan copies only) | Lore select only narrows and never touches constant, gated or timed entries; a cap must follow the same rule. Pins (`place_lore`) must survive the cap |
| 2 | **Recap tiers over in-window messages**: short term (300), session details (600) and scene history (500) summarise messages still verbatim in context until ST trims | ≤ 1,400 at ceilings (observed ≤ 300) before saturation; 0 after | `memory/inject.ts` `buildMemoryInjection` + `runtime/memoryInjector.ts` (pass the oldest message ST kept) | Capacity gain only before saturation, where context is not scarce: the real gain is ~1-1.4K less depth-4 prefill (~1 s TTFT) per turn. Needs ST's kept range per generation (`GENERATE_AFTER_DATA`); secret filtering unaffected (drop only); quality-rated (salience) |
| 3 | **Static instruction text after the prefix**: `GUIDANCE_HEADER` (~95), objective boilerplate (~55), pacing agency clauses (~130), attempt clause (~15), `NARRATOR_SELF_VOICED` + "Voice anyone else" (~45) are identical every turn but sit at depth 0-4 | ~300 re-prefilled per turn; 33 duplicated (guidance ↔ pacing) | `pacing/guidance.ts`, `pacing/steering.ts`, `engine/agency.ts`, `memory/innerRender.ts` | Architecture rule: prompt layout is quality-rated, never move per-turn blocks without a blind rating. Deduping the one repeated agency clause is safe; moving static text to the preamble needs the rating |
| 4 | **Image-only lore lines in the reply prompt**: campaign WI entries end with an `Appearance:` image descriptor that reaches every reply | 56 mean / 303 max | campaign repo (split image looks into image-only entries), not this repo | Campaign change + `adolion-fresh.pin.json` bump; route content review to another model |
| 5 | **Narrator holdings ceiling 1,000** on the narrator only; observed 417 | up to ~600 at ceiling | `memory/stores.ts` `NARRATOR_HOLDINGS_TOKEN_BUDGET`, `innerRender.ts` | Held-secret filtering untouched by a smaller cap; foreshadow quality |
| 6 | **Card + persona**: narrator card up to 763, persona 150 overlapping the 70-token player-role line | ~70 (role line when persona says the same; already skipped on exact match) | campaign cards; `runtime/playerRoleHost.ts` | Prefix-cached, so prefill-free after the first turn; low value |
| 7 | **Empty sheet block**: "What the player's sheet shows" sent with every value "—" (2 prompts) | ~58 when empty | `runtime/narratorSheet.ts` (skip rows/blocks with no value) | None found; player sheet unchanged |
| 8 | Side: read quality questions up to 3.5K + 1.4K contract per read, every boundary | prefill only | `extraction/question.ts`, `scopeBudget.ts` (rotate questions like `DISCOVERY_SCOPE_CAP`), A1 `readLayout` (contract first, cacheable) | Read accuracy floors (live suite); `scopeBudget` already budgets keys, not question text |
| 9 | Side: inner beat transcript 583 / 1,329 on 2.1 calls per reply | prefill only | `memory/innerRender.ts` window | Inner voice must stay on (owner); shrink window, not the feature |

Not waste: thinking is not carried in history (0 thought blocks in 269 recorded loud prompts); the scene tracker is 12-23
tokens; ledger ≤ 183; story-so-far ≤ 149.

## 4. Config facts

- Controller `C:\dev\tools\story-orchestrator-local\config.json`: profile `fast` (default) `--ctx-size 32768 --fit-ctx
  32768`; `normal`/`sharing`/`no-mmap` 98,304; `maxContext` 32,768; MTP drafter (`nMax` 2, ~900 MiB); member cache RAM
  4,096 MiB. ST lane: `max_context` 32,768, `amount_gen` 1,400.
- **KV is already q8_0, not f16.** The config has no cache-type flags because the broker adds them:
  `server-plugin/story-orchestrator-gpu/broker/backend.mjs` `nativeArgs` = `--parallel <n> --kv-unified --flash-attn on
  --cache-type-k q8_0 --cache-type-v q8_0 --cache-ram <budget>`. 06 bench: `-ctv q4_0` cost 8 % decode (26.4 vs 28.7 tok/s).
- Model geometry (GGUF metadata): 60 layers, sliding window 1,024; 10 global layers (every 6th) with 4 KV heads × 512
  dims, 50 SWA layers with 16 × 256. Only global layers grow with context.
  - Global KV at q8_0 (1.0625 B/elem): 2 × 4 × 512 × 10 = 40,960 elems/token → **42.5 KiB/token**: 32K 1.33 GiB,
    40K 1.66 GiB, 48K 1.99 GiB. Context 32K → 48K costs **+0.66 GiB** VRAM (f16 would have been +1.25).
  - SWA KV (50 × 16 × 256 × 2 = 409,600 elems/token, ~425 KiB/token at q8_0) is fixed by the window: ~0.6 GiB, the same at
    any context. It dominates each saved member state (1.2-1.6 GiB per prompt, 06 bench), so a longer context barely grows
    member-cache entries.
- v3.0 10 B7 (branch `v3.0-a2-maxmem`): `ctx48` loaded with fit 0, GPU free 1,606 MiB after the run; 3-member rotation
  hits 37 / misses 11, chat TTFT p50 6,307 vs 5,742 ms; **decode 32.7 vs 43.1 tok/s (76 %)**. With q8_0 the extra
  0.66 GiB of global KV and attention over the same used cells do not explain a 24 % decode loss: suspect `--fit`
  moving layers or the drafter off the GPU, or MTP acceptance dropping. B7 did not log layer placement or acceptance.

### What 40K / 48K would buy and cost

- Buys: +8,192 / +16,384 tokens of history = **~40 / ~80 more boundaries** (~13 / ~27 player turns with three voices)
  before ST trims; or room for a capped WI budget plus full memory ceilings without trimming. Today's recorded play never
  needed it (max 17.3K).
- Costs: +0.33 / +0.66 GiB VRAM (less headroom: `streamImages.minFreeGpuMiB` 2,400 decides whether SDXL streams beside
  text or swaps it), the B7 decode loss unless its cause is found, longer prefill for prompts that actually fill the window
  (a 46K-token cold prompt ≈ 48 s at 950 tok/s), and member-cache misses re-prefilling more.

## 5. GPU bench recipe (do not run without the owner's "resume")

Runner: `scripts/local/bench-controller.mjs` (already has `ctx64k`, `kvq4v` arms; add `ctx40k`/`ctx48k` the same way:
`setFlag(setFlag(a,'--ctx-size',N),'--fit-ctx',N)`). Copy configs; never touch the owner's live config.

1. Arms, all on the so5 binary with the broker's flags (q8_0 K and V, flash-attn, `--parallel 1 --kv-unified`):
   `base` (32K), `ctx40k`, `ctx48k`, `ctx48k-ngl-all` (`--n-gpu-layers all`, no fit, to split fit from context),
   `ctx48k-nomtp` (drafter off, to split MTP from context). Optional informational `ctx48k-ctkq4` (`-ctk q4_0`).
2. Corpus: the lane 42 3-member rotation (`bench-controller/10/cap-3m.jsonl`) for comparability with B3/B7, plus long
   prompts built from the toy capture by repeating history to 16K, 30K, 38K and 46K tokens (toy text only; public repo).
3. Record per arm from the server log (`bench-controller.mjs` already parses some): `offloaded N/61 layers`, CUDA KV
   buffer MiB, `SWA KV cache, size = … cells`, `n_ctx_slot`, drafter loaded, MTP acceptance, state MiB per saved member,
   GPU free min, RAM available min; decode chat/side tok/s at 8K and at 16K prompt length (same prompt in every arm);
   TTFT cold and warm; prefill tok/s at 30K/38K/46K.
4. Image row: one SDXL scene per arm in `max` mode: stream vs swap decision, image time, first reply after.
5. Floors (set before the run): decode ≥ 95 % of base at equal prompt length; GPU free ≥ reserve 1,024 + 512 margin with
   images idle; no CPU spill; member cache holds ≥ 3 members in 4,096 MiB.
6. Adoption path only if floors pass: controller `profiles.fast` ctx + `maxContext`, ST profile/preset context
   (`max_context`), check `context-over-server` (`checksSetup.ts`) reads the new limit, run the controller regression list
   (`research/feature-impact-controller.md`) and a blind quality rating of a long chat that actually passes 32K.

Estimated GPU time: ~45 min (5 arms × ~7 min + image rows), plus the regression list if adopted.

## Unresolved questions

- Is the campaign's WI budget the owner's ST default (25 %, no cap) on lane 0 too? A cap is the largest saving at saturation.
- Recap tiers before saturation (item 2): drop in-window rows for TTFT, or keep them for salience? Needs a blind rating.
- B7's 24 % decode loss: fit placement, MTP, or real? Worth the ~15 min diagnosis before any 40K/48K decision.
- No recorded campaign chat past boundary 12: rerun this census on the first long owner playtest (payload arm on).
