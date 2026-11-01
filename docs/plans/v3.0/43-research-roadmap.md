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

## Reranker offline (2026-10-31, real model, CPU only)
- bge-reranker-v2-m3 Q8_0, `llama-server --reranking --pooling rank --device none -ngl 0 -t 8 -np 8` (controller's
  b11888-so3 build, CUDA hidden, log confirmed no device) on loopback :8097, stopped after. A scratch jest measure (not
  committed) fed `recordRerank`/`rerankE0Arm` and the lore cases through the shipped scorers, 8 docs per call. Query:
  E0 = question text; lore = scene name + goal + window lines; doc = `entryText`. Chosen before measuring, not retuned.
- E0 synthetic (40 q, pool recall 0.625): hit@4 0.600 (24/40; 24 of 25 answerable), mrr@4 0.431; arm c 0.250, arm f 0.300.
  Above c, below the 0.8 floor (capped by pool recall 0.625).
- E0 private (84 q, pool recall 0.905, counts only): hit@4 0.631 (53), mrr@4 0.418; arm c 0.750 (63), arm f 0.702 (59).
  MISSES both floors (below c).
- lore-relevance (17 rows, 64-entry pool): precision@4 rerank 0.162, BM25 0.265, judge 0.485; needed recall@4 rerank
  0.346, BM25 0.538, judge 0.962; ndcg@4 0.328 / 0.427 / 0.921. MISSES (needs BM25 + 0.05).
- lore.json (11 rows, 30 needed): recall@2 rerank 0.381, BM25 0.714, judge 1.0; recall@4 0.400 / 0.733 / 1.0.
- Latency per 8-doc call on CPU (i9-9900, 8 threads; a second reranker server on :8098, not mine, shared the CPU):
  E0 synthetic p50 1.75 s, p95 3.3 s; all E0 p50 14 s, p95 58 s (private texts long); lore p50 11.2 s, p95 28.4 s.
  Floor p95 150 ms MISSED by 20-400x.
- Verdict: reject this model on CPU for lore (worse than BM25) and for live recall (latency). Only E0 synthetic gains.
  GPU would fix latency, not the lore ordering or the private E0 loss.

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

## Phase 3 agent M — memory wave 2, read-contract changes (2026-10-31)
Branch `v3.0-43-m`. Sources: `research/memory-shortlist-2026-10-31.md` wave 2 and the four proposals it cites. Each item is its
own switch under `memory.*`, on by default (owner rule); adoption formally needs `so-live-suite` x2 on the GPU (one row each in
`gpu-queue-2026-10-30.md` §Memory wave 2). Every new read line or tag is optional, so recorded goldens keep parsing. Contract
text appears only while the switch is on, so the off arm sends byte-identical read prompts.

Floors, declared here before any measurement (informational, never retuned; the hard ones fail jest):
- M0 (agent C's C4 leftover): at 150 boundaries the recall-included availability is >= the tier-only availability on every probe.
- M1 `memory.neighbourRead` (agent-architectures P1): the read lists up to 12 live facts/session rows naming an entity or key the
  window names, as per-read aliases `[m1]..`; a MEMORY/FACT line may carry `same=mN` (confirm: recallCount + confirmedAt, no row)
  or `update=mN` (new row, old one superseded at the read's message).
  - F-M1a: every existing recorded golden parses as before (the existing jest suites stay green, 0 changed parses).
  - F-M1b (hard, planted fixture written before running): same/update route 100%; update on a locked, author-decided or pinned
    row = plain add; unknown alias = add + audit note; a covered re-read confirms once; rollback past the read restores the store.
  - F-M1c (hard): a held-secret row is never listed (resting filter).
  - F-M1d cost: section <= 600 Gemma tokens at 12 rows of 200 chars.
- M2 `memory.readKeys` (context-compression P2 keys half): up to 3 keys per MEMORY/FACT line, stored on the row; score counts a
  named key like a trigger; archive recall matches keys like entities.
  - F-M2a: keyed paraphrase fixture (question names a key absent from text and entities): hit@4 >= 0.8 with keys and > without.
  - F-M2b (hard): a held-secret keyed row is never recalled for a kept-out member. F-M2c (hard): never > 3 keys, entity repeats dropped.
  - cost: rules <= 60 tokens.
- M3 `memory.relationRows` (knowledge-graphs P3): `[rel:Subject:relation] Object` / `[rel-end:...]` ledger rows keyed
  subject|relation|object, so one subject holds several objects; ending = a new version `ended`; name fold on both ends; inverse
  table (symmetric + opposites) queues conflicts.
  - F-M3a (hard): 3 objects for one subject = 3 live rows; end = version, hidden from Current state; aliases fold both ends.
  - F-M3b (hard): planted opposite pairs (direct and mirrored symmetric) detected 100%, non-opposites 0.
  - cost: rules <= 120 tokens.
- M4 `memory.socialActs` (game-narrative P3): optional `act=<helped|protected|lied|threatened|insulted|gifted|betrayed|confided>` on
  a rel_ feeling DELTA; the engine keeps `act_log_<by>_<to>` (code string, newest 24, rollback detector `social-acts`) and
  recounts authored gate leaves `{"act","by","to","within","count"}` compiled to `act_n_*` (exempt: recounted every boundary).
  - F-M4a (hard): rollback ≡ replay, 0 mismatches over 4 seeds x 40 random cuts. F-M4b (hard): window counts exact at the edges.
  - F-M4c (hard): a player act without the player's own line as evidence loses its act (feeling kept); member acts kept.
  - cost: rule <= 80 tokens.
- Probes after M1-M4: every kind x horizon row >= m0 (expected equal: the harness writes rows directly, no read).
- GPU rows (owed, floors stated there): M43-M1..M4, live-suite tiers facts/rejected/deltas/ledger within 0.02 of the off arm x2,
  plus per-item format adherence.

### Results (offline, 2026-11-01; floors above committed first, `3ab283afa`)
- M0 probes + archive recall (`test/support/memoryProbesRecall.ts`, option `runProbeSession({ recall: true })`, on by default in
  the probe test; `test/measurements/v3.0/memory-probes/m0-recall.json`), every wave-1 switch on: tier-only availability@60
  0.458 (as A+B merged), with recall **0.75** (single 1/4 -> 4/4, update-fact 1/4 -> 2/4, temporal 1/4 -> 4/4 at 60;
  temporal 0/4 -> 1/4 at 150). Floor at 150: no probe hidden — **met**. One hide at 60 (update-fact-3: the evicted old
  version "in the cellar" comes back through recall, because nothing superseded it without a model). Kept-out leaks 0.
- M1 neighbour read: F-M1a met (all 143 extraction/memory suites green on the new parser, 0 changed parses); F-M1b met
  (`neighbours.test.ts`: same/update routing, locked/decided/pinned refused, unknown alias, covered re-read confirms once,
  rollback restores the store exactly); F-M1c met (0 held-secret rows listed through a real coordinator's resting view).
  F-M1d cost **missed**: 12 rows of 200 chars = +688 Gemma tokens (floor 600); 12 short probe rows = +298 to +303.
- M2 keys: F-M2a met, keyed paraphrase hit@4 **0 -> 1.0** (10 cases, `readKeys.measure.test.ts`; trivially 0 without keys,
  since recall needs a named entity); F-M2b met (secret row keyed and archived never recalled, planted plain row is); F-M2c met.
  Cost +59 tokens (floor 60, met).
- M3 relation rows: F-M3a and F-M3b met (`relations.test.ts`). Cost +105 tokens (floor 120, met).
- M4 social acts: F-M4a met (160 seeded cuts, 0 mismatches), F-M4b met (window edges), F-M4c met (player act without a player
  line loses the act, member act kept), F-M4d met (`social-acts` detector, `social-act-windows` exempt, guard green). Pattern
  kind `act` (`socialActPatterns.test.ts`). Cost +63 tokens (floor 80, met).
- Probes after M1-M4 (`m-after.json`): every kind x horizon row identical to m0, tier-only and with recall (expected: the
  harness writes rows directly, no read).
- Tokens: Gemma vocab via `llama-tokenize` (CPU, `CUDA_VISIBLE_DEVICES=-1`), whole read prompt per arm minus the off arm
  (off = 1,382 tokens on the fixture contract).
- Deviations: acts store no text (verb, pair, boundary), so the "drop an act whose evidence restates a held secret" guard is
  not built: nothing of the evidence reaches a prompt or a shared tier. Neighbours list memory rows only (no ledger rows;
  ledger keys version themselves). The backlog read (`memorizeBacklog`) gets no neighbour list. Keys are used whenever a
  row carries them, also after the switch is turned off.
