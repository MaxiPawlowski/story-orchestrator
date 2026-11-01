# v3.0 43 — Roadmap from the 2026-10-31 research

One place for everything the 2026-10-31 research proposed, in phases. Sources: `research/memory-shortlist-2026-10-31.md`,
`research/mechanics-shortlist-2026-10-31.md`, `research/context-census-2026-10-31.md` and their reports. Rules (owner):
every upgrade its own switch, on by default, floor declared first, offline before→after, then a GPU A/B; CPU first;
at most two code agents; finished work is installed into the owner's ST as it merges.

## Phase 1 — CPU, in build (2026-10-31)
- 41 memory wave 1: B merged (`a0d49e1d3`); A in build (real-token compaction, summary collapse guard, idle supersession,
  place/item name fold, long-horizon availability probes).
- 42a: F merged (`6d4bde3c0`); G in build (cross-voice detector + trim, voice drift scorer, DRY name breakers, lore budget
  evidence + `lore-budget-uncapped` warning, BM25 lore arm, hold lore across a round, prefer-known bias).
- Campaign (private repo): lore budget guideline + check (story books ≤ ~2,500 tokens together), drop image-only
  `Appearance:` lines from lore. After 41 A.

## Phase 2 — CPU, after phase 1 numbers
- 42b: stuck ladder with authored leads + `one-clue-exit`; judge-question director critic; 2-3 leads per turning point;
  story-state lore query + alias pass; example-dialogue drop warning; Studio fields for `min_turns`/`urgent`.
- Context savings (census): dedupe the 33-token guidance/pacing line; empty sheet block skipped; recap tiers stop
  re-summarising messages still in the window (switch, rating in phase 4); move fixed instruction text below the
  cacheable prefix only where it rates neutral.
- Lore lifetime (owner 2026-10-31): checkpoint `world_info` enables get an end ("this chapter" / until checkpoint X;
  chapter close switches them off unless marked lasting), Studio warning when enabled entries along a path pass the
  lore budget, guide update (stop "keep cast and truths on" without an end). Switch + before/after (campaign path
  worst-case tokens from `check_lore_budget.py`).
- Campaign lore trim: another model (owner never reads the campaign) moves the 5 over-budget stories onto lore
  lifetimes; `check_lore_budget.py` must pass with the baseline file emptied; pin bump + reinstall.
- Memory measurement: reply contradiction scorer (offline, calibrated on planted pairs); echo/vagueness floors for
  compaction ratings; probes extended to search archive recall (B3 at 150 could not see its gain).

## Phase 3 — read-contract changes (CPU build, adoption needs live suite x2 on GPU)
- Memory wave 2: neighbour-aware read (`same=`/`update=`); write-time retrieval keys; relation rows with several values;
  social act tags on feeling lines.

## Phase 4 — GPU wave (owner "resume"), with the existing G1-G5 queue
- CTX-BENCH 40K/48K + B7 decode-loss diagnosis (~1 h).
- A/B rows for every 41/42 switch (MW1-*, M42-*), utilization half of the recall probes, behavioural leak rate.
- Ratings: others-speak clause, persona re-anchor, typed redirect on refusal, multi-draft director pick, chapter spine,
  reserved lore slot, recap de-duplication, in-character thinking clause (owner OK'd for the rating only).
- Phase 3 live suite x2 per read change.

## Phase 5 — character features (blind rating each)
- Memory wave 3: "you and the player" memories per member; "what changed" + private "since you last spoke"; per-member
  perspective recap at chapter seal.
- Director: setup/payoff ledger; motive check; re-plan after divergence.
- Lore: reserved budget slot for forced picks (if phase 4 rates it well).

## Spikes for GPU time (owner 2026-10-31: not rejected, try them)
Each a spike behind `spikes.<id>` (lazy `runtime/spikes/`), CPU-built ahead, decided on GPU by a floor declared first.
- `checkClocks`: clocks that tick on check misses and give the narrator a pressure line; blind rating + turns-to-exit,
  checked against the agenda overlap.
- `phraseBans`: phrase bans with backtracking in the patched llama.cpp; floors: banned-phrase rate down, decode >= 95 %
  of base, blind rating neutral or better.
- `relationGraph`: entity-relation graph view over the ledger vs the flat ledger; multi-hop recall fixture +
  contradiction rate.
- `selfEditMemory`: a MemGPT-style core block the memory route edits by small deltas (never the play model); floors:
  rollback ≡ replay property test, held-secret leak 0, long-horizon probe gain.
- `promptCompress`: LLMLingua-style compression of history/lore on CPU; floors: tokens saved, blind rating neutral,
  prefix-cache reuse not worse.
- `cpuReranker`: small cross-encoder via llama.cpp `--reranking` for lore/recall (needs the owner's download OK);
  floors: E0 hit@4 and lore precision@4 up.

Lore budget cap: for this one case the owner keeps ST settings unchanged (warning + campaign guideline instead).

## Spikes CPU build (agent S, 2026-10-31)

All six live under `src/runtime/spikes/` (lazy; `lazyHarness.guard.test.ts` lists them), each behind `spikes.<id>`
(default on per the spike rule: only a literal false switches one off). Only `checkClocks` reaches play, and only in a
story that authors `clocks`; the other five gate nothing live yet: their hooks are GPU-row prerequisites
(`gpu-queue-2026-10-30.md` §Spikes, SP-*). Floors were set as constants in each module before its first measurement.

Floors (declared before measuring; informational, never retuned):
- checkClocks (`checkClocks.ts`): CK1 rollback ≡ replay 0 mismatches over 4 seeds x 60 random cuts (clocks are derived
  from the boundary log, no compiled code key, so no rollback detector); a miss/weak ticks once per check per visit;
  near line at `near.at`, `full_line` at full. GPU: blind rating neutral or better, turns-to-exit not longer, agenda
  overlap readout.
- relationGraph (`RELATION_FLOORS`): RG1 one-hop 2-hop recall@4 >= 0.75; RG2 gain over zero-hop >= 0.25; RG3 distractors
  in top 4 <= 0.5 per case and <= zero-hop + 0.25. GPU: contradiction rate not up.
- selfEditMemory: SM1 rollback ≡ replay 0 mismatches (4 seeds x 50 cuts); SM2 held-secret leak 0 over 200 adversarial
  replies for the kept-out member (block and render); memory route only (`CORE_ROUTE_ROLE`). GPU: long-horizon probe gain.
- promptCompress (`COMPRESS_FLOORS`): PC1 tokens saved >= 15% on history older than the last 2 messages; PC2-PC4 every
  name, quoted line and number kept (1.0). GPU: blind rating neutral, prefix reuse not worse.
- phraseBans (`PHRASE_BAN_FLOORS`): banned-phrase rate per 1,000 words <= half of control; decode >= 95% of base;
  blind rating neutral or better. Request plumbing sends nothing unless `/props` reports `so_phrase_bans`.
- cpuReranker (`RERANK_FLOORS`): E0 hit@4 >= 0.8 and above arm c; lore precision@4 >= lexical + 0.05; p95 <= 150 ms
  per 8-doc call. No model downloaded (owner OK needed; the row names bge-reranker-v2-m3 Q8_0 ~0.6 GB, or
  jina-reranker-v1-tiny-en F16 ~70 MB).

## Gate record S
- 2026-10-31, branch `v3.0-43-s`. `npm run gates` (no --resume, Storybook included) green in 603 s on `391f11ef1`.
  Earlier full runs went red on my own guard misses (ownership census, arrival golden, S3 budget, S8 duplicate seam,
  error-copy row), all fixed. One red was `server-plugin/story-orchestrator-gpu/broker/comfyReclaim.test.mjs` (not
  touched), which passed 3/3 alone and in the clean run: a timing flake under load.
- Offline results (floors set before measuring, not retuned):
  - checkClocks: CK1 0 mismatches (4 seeds x 60 cuts); tick, near and full rules pass. Wired: `spikes/install.ts` runs
    the clock seam with the complication seam (shared `intentRoute.ts`); inert without authored `clocks`.
  - relationGraph (12 cases): 2-hop recall@4 0.333 -> 0.833 (RG1, RG2 pass); distractors per case 0.333 -> 0.583,
    RG3 ceiling 0.5 MISSED. Direct recall 0.958 both arms.
  - selfEditMemory: SM1 0 mismatches (4 x 50); SM2 0 leaks over 200 adversarial replies. Version cap 40 per member
    is a rollback floor like the engine horizon.
  - promptCompress (49 public transcripts, 2,616 tokens): saved 11.47%, PC1 >= 15% MISSED; names, quotes and numbers
    kept 1.0 (PC2-PC4 pass). The first run came before a sentence-split fix (dialogue tags after a quote) and gave the
    same figure.
  - phraseBans: baseline over 180 archived sessions (counts only) is 0.619 hits per 1,000 words, 102 of 1,277 replies.
    Patch plan in `scripts/local/llama-patches/phrase-bans-plan.md`. Nothing was built and the controller was not touched.
  - cpuReranker: plumbing and arms only. A lexical stand-in (not a model) scores hit@4 0.625 vs arm c 0.25 on the E0
    synthetic pool, which only shows the adapter works. No model downloaded.
- Deviations: five spikes have a flag but no live hook yet (the hooks are prerequisites in the GPU rows SP-RG/SM/PC/PB/CR).
  The phraseBans overlay would break the "budget is the one overlay that adds keys" rule, so it needs an owner decision.

## Owner decisions 2026-10-31 (spikes)
- `cpuReranker`: owner OK'd the download ("try the best one"): bge-reranker-v2-m3 Q8_0 (636 MB) at
  `C:\dev\models\rerankers\bge-reranker-v2-m3-Q8_0.gguf` (from `gpustack/bge-reranker-v2-m3-GGUF`). Runs on CPU via llama.cpp
  `--reranking`; offline E0 / lore-relevance arms can run now without the GPU.
- `phraseBans`: owner allows a second request-key overlay besides the reply thinking budget if SP-PB passes its floors
  ("everything is negotiable if it enhances performance"); the architecture rule changes only on adoption.
