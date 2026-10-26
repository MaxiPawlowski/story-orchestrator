# Context chunking / KV reuse for the local roleplay pipeline — offline study (2026-10-26)

Scope: Artemis 31B (Gemma 4: 50 SWA layers, window 1024, + 10 global), llama.cpp b11888 + `so-cache-patch`, one 3090,
Text Completion prompts as SillyTavern + Story Orchestrator build them today (per-member head, per-turn blocks at depths
1–4). Everything below is CPU-only: the model's own tokenizer (GGUF vocab, `llama-cpp-python` `vocab_only`, no GPU) over
the recorded real prompts. Labels: **M** measured on the recorded prompts, **S** read from source, **E** estimate (arithmetic
over M numbers; TTFT at 1,000 tok/s prefill), **R** reported by plan 06–09 benches.

Files: `extract.py` (segments + tokens + server timings → `data/`, hashes and ids only), `stability.py` (chat prompts →
`results/stability.json`, `timeline.json`, `blocks.json`), `cachesim.py` (`results/cachesim.json`, `sidepath.json`),
`sidepass.py` (`results/sidepass.json`), `blockchurn.py` (`results/blockchurn.json`). `venv/` holds numpy +
llama-cpp-python 0.3.36 (CPU wheel). Story text is never written to `results/` or this file.

## 1. Data

- Sources: `C:\dev\so-lanes\42\debug\v29gpu2\payloads.jsonl` and `45\debug\s6h\payloads.jsonl`: 721 `/generate` requests
  (the rest of the 21K lines are `/props` polls), 674 after dropping probes. 46 chats; 5 long ones (59–61 chat prompts each,
  3 members, prompts growing 0.7K → 7.5–17.3K tokens, no chat reaches 32K). Roles: chat 346, inner beat 143, story read
  136, synthesis 35, suggest 12, other 2. Server `timings` are present only for non-streamed (side) responses: 274 joined.
- Tokenizer check: segment-wise tokenization is additive at turn boundaries (16/16 full-prompt counts equal the
  segment sum), so char cuts at `<turn|>\n` map to exact token offsets. **M**
- These captures are harness runs: no human think time exists in them (request gaps p50 5.4 s). Think-time numbers below
  are parameters, not measurements.

## 2. Chat prompt anatomy (tokens, p50) **M**

```
head (one system turn)       424  = preset 39 | "Impersonate <member>" line | card 307 (+ lore)      ← member-specific from token 39
history turns                173 each (p90 293), identical text for every member at the same boundary (294/294 pairs)
depth-4 private block        276  (Author's Note + SO guidance/private blocks; present in 294/346 prompts)
4 history turns              ~700
depth-2 block                127  ("Recent events"; 258/346)
1 history turn
depth-1 block                 18  (presence line; 354/346 — some prompts carry two)
1 history turn + gen tail      9
```

Boundaries used below: **a** = end of head, **b** = start of the first injected block (= the member cache's cut),
**c** = start of the newest message. Tail after b: 1,089 p50 / 1,294 p90.

## 3. Where prompts diverge **M**

- Consecutive prompts of **different members** (294 pairs): diverge at the `Impersonate` line, token ~39 (shared 0.7 %).
  The history itself is byte-identical across members (shared-trunk potential = everything up to b).
- A member's prompt vs. **that member's previous prompt** (265 pairs, 1–5 other requests between): diverge inside the
  history in 263/265, exactly where the previous prompt's depth-4 block sat. LCP p50 = 75.9 % of the new prompt.
  Beyond the LCP, 591 tokens p50 are *identical but shifted* (the 4 turns that were under the old block + the old
  depth-2/1 blocks) and 767 tokens p50 are genuinely new history.
- Block contents between a member's turns: depth-4 unchanged only 74/265 (28 %), depth-2 155/240, depth-1 158/265.
  The depth-4 block has no stable sub-block to split off (one churning body of ~262 tokens). So an "anchor the blocks and
  move them every K turns" layout gives nothing: re-prefill p50 1,908 (K=4) / 1,916 (K=8) vs 1,877 today (`blocks.json`).

## 4. Answer to the checkpoint-placement question (coordinator / web doc idea 1)

Survival of a checkpoint taken on prompt P at a boundary, for the same member's next prompt Q (usable iff its position
≤ LCP(P,Q); the b11888 rule `pos_min_thold = pos_eval - n_swa + 2` reduces to that for a checkpoint whose window ends at
the position, **S** `server-context.cpp:4107`):

| Checkpoint on P | survives to Q | re-prefill tokens on Q p50 / p90 / mean | TTFT prefill part **E** |
|---|---|---|---|
| none (full) | — | 6,741 / 13,445 / 7,480 | 6.7 s |
| stock end-of-prompt {−4, −516} | 2 / 10 of 265 | 6,720 / 13,445 / 7,434 | 6.7 s |
| **b** (first injected block) = plan 08/09 prefill-to-cut | **265 / 265** | **1,877 / 2,195 / 1,726** | 1.9 s |
| c (newest message start) | 2 / 265 | 6,720 | 6.7 s |
| b + c, a + b + c, b + every history turn | as b | 1,877 / 2,195 / 1,720 | 1.9 s |
| ideal (checkpoint exactly at the LCP) | — | 1,876 / 2,194 / 1,718 | 1.9 s |

- **One checkpoint, at b, is already optimal** on this layout: a is dominated by b (nothing diverges between a and b), c
  never survives (the next prompt removes the block that preceded c and inserts new turns), and the ideal checkpoint equals
  b to within one token. Two or three checkpoints per member buy nothing for member switches. c helps only exact repeats
  (swipe/regenerate), which the stock −4 checkpoint already covers; plan 06 counted 0 swipes in 802 owner replies.
- The 1,877 is 767 new history + 1,089 tail-after-b + ~20 (restored-state slack). The new history is known before the
  player sends (other members' replies), the tail is not (it holds the player's line and the per-turn blocks).
- RAM per checkpoint: SWA window 425 MiB at q8_0 (**R** plan 06 F5), 850 MiB at f16; global KV 42.5 MiB per 1K tokens
  q8_0 (85 f16). A per-member entry that keeps only the b checkpoint and the global KV *up to b*: ~648 MiB p50 on these
  chats (`rewound`), vs ~1,350 MiB for ring + full KV + one checkpoint (and ~2.0–2.3 GiB measured on disk with the two
  end checkpoints, **R** plan 08). Three checkpoints per member would be +850 MiB each for no gain.
- **Would a request-supplied `checkpoint_at: [token positions]` be enough?** Yes, and it is small. b11888 already has the
  mechanism from PR #24176: the prompt batch breaks at `spans.is_user_start(n_tokens)` and `create_checkpoint` runs there
  (`server-context.cpp:4410, 4424–4498`); for Text Completion `spans` is empty, so only the two end offsets fire. The patch
  is: parse `checkpoint_at` (and/or `checkpoint_at_chars`, since tokenization is additive at `<turn|>\n`) in
  `server-task.cpp`, feed those positions into the span set / `last_user_pos` for completion tasks, keep the existing
  min-step and count rules. ~40–60 lines on top of `so-cache-patch`. What it changes vs the gateway's prefill-to-cut: one
  request instead of two (no extra round trip, no separate prefill checkpoint pair to prune), and the position is exact
  rather than "second `<|turn>system`". It does **not** change the re-prefill count (still 1,877). Positions: the gateway
  can call `/tokenize` on the prefix (ms) or send the char offset.
- So the web doc's "3.8 s → 1–2.5 s with exact restores": the exact floor for a warm switch on this layout is
  restore + 1.9 s. Plan 09 A measured warm 3.8 s = ~1.9 s prefill + ~1.9 s of restore/copy overhead (2+ GiB entries,
  pageable memory). The remaining lever on the exact path is the restore size/speed (below), not checkpoint count.

## 5. Member-state cache: RAM budget, entry size, eviction, prefetch (`cachesim.py`, 5 long chats, 280 chat requests) **E**

Entry = state saved after the reply; `full` = ring 637 + global KV + b checkpoint; `rewound` = global KV up to b + the b
window (what a patch `cache_rewind_to_ckpt` or a gateway rewind-before-save would keep). Restore modelled at 1.5 GB/s +
0.15 s.

| budget MiB | entry | policy | hit rate | warm prefill p50 | warm TTFT p50 | with think-time prefetch |
|---|---|---|---|---|---|---|
| 2048 | full | LRU or next | 3 % | 1,235 | 2.2 s | — |
| 2048 | rewound | LRU | 65 % | 1,525 | 2.1 s | 1.0 s |
| 2048 | rewound | next-speaker | 76 % | 1,631 | 2.2 s | 1.05 s |
| 3072 | full | LRU / next | 29 % / 46 % | 1,167 / 1,518 | 2.2 / 2.6 s | 0.9 / 1.0 s |
| 3072 | rewound | LRU / next | 92 % / 94 % | 1,869 | 2.4 s | 1.09 s |
| 4096 | full | LRU / next | 63 % / 76 % | 1,524 / 1,631 | 2.6 / 2.7 s | 1.0 / 1.05 s |
| ≥ 4096 | rewound | any | 95 % (= every warm turn) | 1,877 | 2.4 s | 1.09 s |
| ≥ 6144 | full | any | 95 % | 1,877 | 2.9 s | 1.09 s |

- With 3 members, rewound entries make a 3 GiB budget behave like a 6 GiB one; at the owner's 4,096 MiB they hold ~6
  members instead of 3. Next-speaker eviction (talk control knows the order) matters only when the budget is below
  members × entry; above it LRU is identical.
- Prefetch = during player think time the gateway prefills the next speaker's prefix-to-b (plan 09 `idlePrefill`, built,
  not benched; the prefix is byte-predictable 22/22 **R**). Warm TTFT then ≈ tail-after-b ≈ 1.1 s. Only the first speaker
  of a group turn gets real think time; later speakers' prefixes are known at send time and could be prefilled while the
  first reply decodes if a second slot exists (decode is memory-bound at batch 1, so a prefill ubatch beside it costs
  ~the prefill time once, not twice).

## 6. Side passes (78 % of requests) **M**

| role | prompts | tokens p50 | LCP with previous same-role (same member for inner) p50 | server prefill p50 | decode p50 |
|---|---|---|---|---|---|
| story read | 136 | 1,817 | 99 (5.6 %) | 1,766 ms (1,025 tok/s) | 142 tok, 4.9 s |
| inner beat | 143 | 259 | 138 (18 %) | 287 ms | 31 tok, 1.0 s |
| synthesis | 35 | 2,117 | 149 (7 %) | 2,287 ms | 120 tok, 4.3 s |

- **The read prompt is 96 % template.** Of 1,817 tokens, 1,740 sit before `Transcript:` (header, canon, rules, contract,
  quality questions) and only ~209 are transcript (5 lines, window span 4 messages). Between consecutive reads the
  pre-transcript part differs in **2 lines / ~21 tokens p50** (the tension-band and quality-value lines, at line ~6 of 84),
  which kills the prefix at token 99. Reorder so the value lines come after the stable rules (or after the transcript):
  shared prefix 1,747 p50, re-prefill ≈ 48 + new transcript lines ≤ 209 → **~0.25 s instead of 1.8 s per read**, exact,
  no model-visible content change beyond line order. Needs its own cache entry surviving the chat requests in between:
  with the patched `cache_key`, one keyed entry of ~500 MiB (global KV 1.8K tokens + the window) — or a `checkpoint_at`
  after the stable part. The window start moves in 15/95 pairs, so an append-only "reader trunk" (web doc idea 2) is
  possible but not needed: the transcript is only 11 % of the prompt.
- The inner beat is too small to cache (0.29 s prefill); the synthesis is rare (6–7 per long chat).
- Branching side passes off the member's chat trunk (idea 2's inner-beat variant) is possible only with a member-independent
  head or a private-suffix layout: today every trunk starts with the member's card at token 39, and the read must not sit
  behind one member's card (its facts are shared). The read's own keyed entry is cheaper and private by construction.
- **The side passes sit on the chat's critical path.** 106 chat requests directly follow a side pass; 81 were issued before
  that side pass finished and waited **4.8 s p50 / 11.2 s p90** in the gateway queue; side work before a chat turn is 8.0 s
  p50 where timed (inner + read: ~2.1 s prefill + ~5.9 s decode). That queue wait is larger than the whole member-cache gain.
  Since extraction is off-path by design (deltas apply at the next boundary), a second slot with the chat request taking
  priority (`--parallel 2`, continuous batching) removes it; the read then decodes beside the chat reply, roughly free at
  batch 2 on a memory-bound decode (plan 09 `overlap.mjs` arm, prepared, never run).

## 7. History trimming near 32K (web doc idea 3) **E**

No recorded chat reaches 32K (max 17.3K). ST's truncation (`truncation_length` 32768, **M**) drops the oldest messages per
generation, so once a chat is full the trunk start moves by ~1 message (173 tokens) on every generation: LCP for every
member collapses to the head (~424 tokens) and the b checkpoint dies → re-prefill ≈ 30K ≈ 30 s per member turn, every
turn. Chunked compaction (drop ~8K at once, fold into memory tiers) keeps b alive for ~10 member turns: one 24K re-prefill
(24 s, or hidden in think time by the prefetch) per 10 turns + the normal 1.9 s → amortized ~4.3 s vs 30 s. SO has no
prompt-budget logic of its own today (the "history floor" is the engine snapshot floor). Quality: the model loses raw
history in steps instead of gradually; needs a rating at the compaction points. Worth building before the owner's chats
get long; not measurable on this corpus.

## 8. Experimental ideas, checked against the numbers

- **CacheBlend / SWA bridge (re-prefill the 1024 tokens before a shifted chunk).** The exploitable shifted content per warm
  turn is 591 tokens p50 (section 3). A bridge recomputes 1,024 tokens through 50/60 layers ≈ 853 token-equivalents plus
  a RoPE fix-up and recompute on the 10 global layers for the chunk itself (its K/V were computed attending to the removed
  block) ≈ 100 more: **a net loss at this size**; it only pays for shifted chunks of several thousand tokens (the 32K
  trimming case, 20K+ shifted → ~4–5× cheaper than re-prefill), and there it is approximate (stale global K/V, the
  CacheClip off-distribution failure mode) and needs kernels llama.cpp does not expose. Research only.
- **Shared trunk first, private member suffix** (preset + history, then card + private blocks + last turns): shares
  ~75 % of every prompt across *all* members and is the layout plan 06 measured at 1.93 s (joined-late); it failed the
  blind rating (voice −0.35) and card-after-history is the same model-visible change. Privacy is fine (each member still
  sees only its own card). Only worth a second rating seed if the owner wants it; not a cache problem.
- **Moving only cheap / rarely-changing blocks:** the depth-1 presence line (18 tokens) and depth-2 block (127) are cheap
  but sit *after* the depth-4 block, so moving them alone changes nothing; the depth-4 block churns 72 % of the time and has
  no stable sub-part. Depth-0 for all blocks (the B arm) also failed the rating.
- **Checkpoints at every history turn / per-member trees:** no gain (table in section 4); trees over a shared trunk need
  the shared head that privacy/rating rejected.
- **`--swa-full` at reduced context:** 425 KiB/token → 16K = 6.6 GiB, does not fit beside MTP (1.3–1.6 GiB free).
- **Speculative prefill of the next speaker during think time:** exact, already built (`idlePrefill`), worth 0.8 s per warm
  turn (1,877 → 1,089); with `checkpoint_at`/rewound entries the restore is also skipped (state already resident).

## 9. Idea table

| # | Idea | Tokens saved per event **E** | TTFT effect **E** | RAM | Privacy / quality risk | Cost / where |
|---|---|---|---|---|---|---|
| 1 | `checkpoint_at` in the patched server (one checkpoint at b, created inside the main prefill; `cache_key` + `cache_ckpt_max` as now) | same 4,860/switch as prefill-to-cut; removes the extra prefill request | warm = restore + 1.9 s; −0.1–0.3 s vs two requests | 425 MiB per member checkpoint | none, exact | llama.cpp patch 40–60 lines + gateway sends offsets |
| 2 | Rewound entries (state kept only up to b: global KV to b + the b window) | — | restore ~2.1 GiB → ~0.65 GiB: −0.7–1.2 s per warm switch at 1.5–2.7 GB/s; pinned/uninitialised buffers (patch E1) add to that | 648 MiB per member vs 1.35–2.3 GiB → 6 members in 4 GiB | none, exact | llama.cpp patch (save after `seq_rm` past the checkpoint, or gateway rewind-before-park) |
| 3 | Think-time prefetch of the next speaker's prefix-to-b (`idlePrefill`, built) | 767/switch | warm 1.9 → 1.1 s + no restore | 0 extra | none (nothing stale: the tail is prefilled at send) | gateway, benchmark only; needs real think time (unmeasurable here) |
| 4 | Story read: stable lines first, value lines after; keyed entry | ~1,570 per read (136 reads → 213K tokens, 3.5 min of prefill over these captures) | 1.8 → 0.25 s per read | ~500 MiB keyed entry | none for privacy (same content); extraction output could shift with line order → rerun live-suite floors | extension prompt builder + gateway key |
| 5 | Chat request priority over side passes (second slot, continuous batching) | 0 | −4.8 s p50 / −11 s p90 queue wait on 76 % of chat turns; read decodes beside the reply | ~0.45 GiB VRAM for the slot (plan 06) | none | gateway scheduling + `--parallel 2`; plan 09 overlap arm |
| 6 | Chunked history compaction near 32K | ~26K per member turn once full | 30 s → ~4 s amortized | 0 | medium (stepwise loss of raw history; rating at compaction points) | extension |
| 7 | Next-speaker eviction instead of LRU | — | only below members × entry (2–3 GiB budgets: +11–17 pp hit rate) | — | none | gateway, trivial once talk control exposes the order |
| 8 | Private-suffix layout (shared trunk) | ~5,000 per switch for every member | ~1.9 s without any cache | 0 | rating-gated (same change class that failed) | extension/preset; owner's call |
| 9 | SWA bridge / CacheBlend | ≤ 591 (loss) / 20K+ only after trimming | negative here | — | approximate, unrated | custom kernels; not for llama.cpp |

## 10. Top 3 to test on the GPU, with a bench plan

Order by value per GPU minute; all three are exact (no rating), so the gate is replay equivalence + timings.

1. **Chat priority over side passes (idea 5)** — biggest measured latency item (queue wait 4.8 s p50).
   Bench: `bench-controller.mjs text` on `corpus.json` with real arrival gaps (the lane 42 capture's read-after-inner
   0.2–0.7 s, chat 1.4–2 s later; `09/overlap.mjs`), arms: control (A: patched RAM cache, serial) vs `--parallel 2` with
   chat pinned to slot 0 and side to slot 1, cache keys on both. Record chat TTFT p50/p95 (end-to-end from issue), side
   TTFT, chat decode tok/s while a read decodes beside it, GPU free after load (floor: ≥ control − 512 MiB, ≥ 1,024 reserve).
   Floor: chat TTFT p50 ≤ 60 % of control on turns that queued; chat decode ≥ 85 % of control while overlapped.
   ~15 GPU minutes.
2. **Rewound entries + `checkpoint_at` (ideas 2 + 1)** — halves restore time and triples members per GiB.
   Bench: build `so-cache-patch` + `checkpoint_at` + save-after-rewind; arms on `corpus.json` and `09/corpus-rate.json`
   (25 chat prompts, 3 members, recorded order): A (today's patched RAM cache, prefill-to-cut) vs A2 (`checkpoint_at` at
   b, no prefill request) vs A3 (A2 + rewound entries, budget 4096) vs A3 at budget 2048. Record warm TTFT, restore ms
   (server log `prompt cache load`), cached-state MiB per member (`/slots` or log), hit rate, RAM min. Floors: warm TTFT
   p50 ≤ 3.0 s (vs 3.8), state p50 ≤ 0.8 GiB, hit rate at 2048 ≥ 60 %; greedy outputs at seed 1234 identical to
   `cache_prompt:false` on 4 prompts (restores are exact up to batch-split rounding, as plan 06 found: same distribution,
   first divergence after character 12–438 under sampling — compare logits/greedy, not sampled text). ~20 GPU minutes.
3. **Story-read restructure (idea 4)** — 78 % of requests are side passes and the read is 96 % template.
   Prep offline: reorder `renderSharedReadPrompt` so the value/tension lines follow the stable rules (or sit after the
   transcript), keep the transcript last; payload golden for the new order; `so-live-suite` replay for facts/rejected
   floors (no GPU for the structural diff; the floors need the model). Bench: replay the 136 recorded reads in order
   through the gateway with `cache_key: read`, interleaved with the recorded chats; record `cache_n` / `prompt_n` per read
   (expect prompt_n ≈ 50–250 vs 1,800) and read TTFT; floor: read prefill p50 ≤ 0.4 s, live-suite tiers within 0.02 of the
   current goldens. ~10 GPU minutes + one live-suite run.

Then, in the same session if time allows: think-time prefetch (idea 3) with an 8 s typing gap (`09/run-gpu-3.sh` already
scripts it) — expect warm TTFT ≈ 1.1 s.

## 11. Unresolved questions

- Real think-time distribution in the owner's play (bounds idea 3); the captures are harness-driven.
- Restore throughput of a 0.65 GiB entry from the RAM cache on this host (Gen3 x8, pageable vs pinned): decides whether
  idea 2 lands at 0.3 s or 0.6 s.
- Does the read's line order change its outputs (facts / rejected tiers)? The live suite answers; nothing here does.
- Whether a chat request can preempt a side pass mid-decode in llama-server (it cannot cancel a running ubatch; the
  gateway can only order the queue), so idea 5's gain on turns where the read already started is the ubatch remainder.
