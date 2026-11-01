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

## Phase 2 agent C — context savings and memory measurement (2026-10-31)
Branch `v3.0-43-c`. Floors declared here before any measurement; informational, never retuned.
- C1 context savings: dedupe the guidance/pacing agency clause (no switch); empty sheet rows skipped (no switch);
  `memory.recapOutsideWindow` (on, GPU rating row M43-C1); fixed instruction text above the prefix boundary only as an
  offline arm until rated (GPU row M43-C2, no runtime switch until it rates neutral). Measured offline with the census
  method (real Gemma vocab, `llama-tokenize` CPU) on recorded payloads. Floor C1: dedupe saves > 0 tokens on every prompt
  that carried the duplicate; empty sheet saves > 0 on every prompt with an all-empty sheet; recap filter removes 0 rows
  whose span starts before the observed window.
- C2 reply contradiction checker (code only, no model): calibrated on `test/fixtures/memory/contradiction-pairs.json`
  (32 planted minimal pairs, 8 per category). Floors: pair accuracy >= 0.6, recall >= 0.6, false alarm <= 0.1. A
  contradiction rate from archived sessions is reported only if the calibration passes its floors; otherwise counts
  are reported as "uncalibrated". Model-judged arm = GPU row M43-C3.
- C3 echo/vagueness floors (memory-rp-community P2): echo rate = share of reply 8-grams also in messages 15-40 back;
  specificity = named entities + numbers per 100 reply words. Floors for any "history leaves the prompt" arm: echo <=
  base + 0.02 absolute, specificity >= 0.9 x base.
- C4 long-horizon probes also query archive recall (after agent A's harness lands): floor = at 150 boundaries the
  recall-included availability is >= the tier-only availability on every probe (recall never hides a row).
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

## Gate record C (2026-10-31)
Branch `v3.0-43-c`. Corpora (read-only, counts only): campaign lane 34 (3 payload files, 33 chats, 161 drafted loud
prompts, 121 new replies), toy group lane 42 `v29gpu2` (41 chats, 226 prompts, 318 replies), test story lane 45 `s6h`
(2 chats, 120 prompts, 156 replies). Tokens: Gemma vocab via `llama-tokenize` (CPU, `CUDA_VISIBLE_DEVICES=-1`, census method).
- C1 dedupe (no switch, `runtime/promptDedupe.ts`, called from `pacingCoordinator.updateSteering`): the pacing hint drops an
  agency clause the guidance block already carries. Test `promptDedupe.test.ts` fails before the fix. Campaign: 14 of 161
  prompts carried the duplicate, 32 tokens each (448 total); toy and test story 0. Floor met (>0 on every carrier).
- C1 empty sheet (no switch, `narratorSheet.ts`): an unset value sends no row; all unset = no block. Test fails before the fix.
  Campaign: 2 prompts, 56 tokens each; others 0. Floor met.
- C1 `memory.recapOutsideWindow` (on; `memory/inWindow.ts`, `runtime/promptWindow*.ts`, fate `in-window`): the oldest chat
  message ST kept is read from each loud prompt (GENERATE_AFTER_DATA, probe = longest line, conservative on a miss, reset on
  chat change); a recap row (session detail, short term through its predecessor chain, scene summary) whose span starts at or
  after that message + 4 stays out; pinned and decided rows stay; unknown span = kept. Upper bound before trimming (recap
  blocks while the chat is untrimmed): campaign 102 of 161 prompts, mean 168 / max 422 tokens when present (106 per prompt);
  toy 30 prompts, 152 / 240; test story 10, 145. Floor (no row with an earlier span leaves) pinned by `inWindow.test.ts`.
  GPU row M43-C1.
- C1 fixed text: offline arm only (`so-context-savings.mts layout`, 24 points at `C:\dev\so-lanes\rating\m43-c2-layout`);
  static sentences re-prefilled per turn: campaign 156 mean / 338 max, toy 125, test story 122. No runtime switch until
  M43-C2 rates neutral (architecture rule: layout is quality-rated).
- C2 contradiction checker (`so-contradiction-rate.mts`, `lib/contradictionScore.mts`, code only): calibration on the 32
  planted pairs (written before the checker): pair accuracy 0.844, recall 0.875, false alarm 0.031 — floors met; misses
  F07 T03 T07 K08, false alarm K07. One generic noise fix before the baseline (speaker prefixes, questions, claims under 3
  content words), calibration unchanged by it. Caveat: pairs and checker share an author. Baseline (calibrated):
  toy 1 / 318 replies (0.31 per 100; 0 at 1-20, 0.83 at 21-60, 0 at 61+), test story 0 / 156, campaign 0 / 121. Ledger
  detector fires only on values another row of the same field shows (no history set), so ledger findings were 0. GPU/Sol row M43-C3.
- C3 echo/vagueness (`so-echo-floors.mts`, `lib/echoFloors.mts`): baseline echo rate toy 0.0004, test story 0.0001,
  campaign 0 (no campaign reply has 40 messages back); specificity 8.05 / 5.59 / 4.64 per 100 words. `score --out <dir>`
  reads any so-compaction-rating dir (A3-R, M43-C2); H33-RP needs a pack in the same shape (none exists yet).
  Not wired into `so-compaction-rating score` itself: agent A rewrote that file on `v3.0-41-memory-a` (unmerged).
- C4 probes + archive recall: NOT DONE. Agent A's harness (`test/support/memoryProbes.ts`) was not on master by the end of
  this run; a recall helper (`probeArchiveRecall`, built from `memory/archiveRecall.ts`) is drafted but uncommitted, owed after A merges.
- Payload goldens: no c0 baseline is committed (`test/measurements/v2.7/payload/` holds README + prefix-declared only), so
  there is nothing to declare against; changes are drop-only inside depth blocks (below the per-turn boundary).
- Gates: `npm run gates` all green in 858.9s (Storybook included, no --resume) on the merged tree; first full run failed
  `debug:typecheck` (script imported `src/memory/polarity.ts`, which pulls an aliased module) and was fixed before the cited run.
  `gates:quick` green before it.
