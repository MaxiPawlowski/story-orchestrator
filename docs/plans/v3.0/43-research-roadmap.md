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

## Phase 2 agent P — progression and director (floors committed before measuring)

Sources: `research/progression-products.md` P1, `research/progression-research.md` P2, `research/director-research.md` P1,
`research/director-products.md` P1. Every switch on by default; floors informational, never retuned after the run.

- P1 stuck ladder (`pacing.stuckLadder`): authored `checkpoints[].leads` (1-4) + `stuck_after` (1-20, default 6) on gated
  checkpoints. Rung derived from the boundary log + player turn ids (no slice, no model call): quiet player turns since
  the last watched exit key moved; rung 1 at `stuck_after`, +1 every 3 quiet turns; rung k shows lead k, past the last
  lead (or with none from rung 2) one generic line. Never forces completion. Hard floors: rung table on fixtures, reset
  on a watched-key move, same rung on a replayed log (rollback = replay), no line on open stretches/finals/counter-only
  exits. Studio warning `one-clue-exit`: fires on a one-key fixture, silent with 2+ leads, an alternate or a counter leaf.
  Baseline: count of fixture checkpoints it flags. GPU row M43-P1: median turns to exit on a stuck fixture -30% or more,
  heavy-handed/forced flags at most control + 1 (blind rating owner-gated).
- P2 judge director critic (`judge.uses.directorCritic`): five nouls (player-act, contradicts, outcome-name, new-person,
  follows-thread), verdict in code, falls back to the LLM critic when the judge is off/unavailable. Floors on labelled
  director drafts (recorded director answers + authored synthetic cases, no campaign text): player-act recall >= 0.9,
  false refusals <= 0.15. Live row stays M21.
- P3 multi-lead turning points (`stagecraft.livingLeads`): director `opens_when` may be a list of 2-3 leads, way-in gate
  `any[lead..., pace]`, still one transition per boundary; every new lead counts against `LIVING_MAX_NEW_QUALITIES`.
  Hard floors: recorded single-lead goldens replay unchanged; a 3-lead draft builds one transition with an any-gate;
  impossible/open-on-arrival leads stay refused (0 on the goldens).
- P4 Studio fields for checkpoint `min_turns` and transition `urgent` with stories (no switch).

## Gate record P

2026-11-01, branch `v3.0-43-p`.

- `npm run gates` (Storybook included, no `--resume`) on `07fa24815`: **all green in 466.6s** (typecheck, typecheck:test,
  test, test:replay, build, debug:typecheck, test:debug, test:plugin, lint, test:release, test-storybook:ci). Earlier runs on
  this branch: red on a missing error-copy row (fixed), then red on `startupWiring.review` (`listGroupChats` mock, untouched
  code, green in isolation 13/13) and `test:debug` childTree (untouched, timing), then red on missing plan 24 matrix rows
  (fixed). Main bundle 1,273,160 B (budget 1,300,000).
- P1 stuck ladder (`pacing.stuckLadder`, on): `checkpoints[].leads` (1-4, 240 chars) + `stuck_after` (1-20, default 6),
  `validate/leads.ts`, `pacing/stuck.ts`, guidance tail via `pacingCoordinator.stuckLine`; leads filtered by `focusSafe`
  (resting filter + unknown codex names). Hard floors met: rung table 0×5,1,1,1,2,2,2,3,3 over 13 turns; a group round of 3
  replies = 1 turn; reset on a watched-key move; rollback = replay (deleted turns read like a fresh replay); no ladder on open
  stretches or counter-only exits. Deviations: past the last lead it uses the generic line (no agency-alternate prompt; that
  recovery is an author move); a dropped lead is skipped silently, no journal line (would repeat every steering refresh);
  stall-judge verdicts reach it only through the values they write. `one-clue-exit` is **info**, not warning: baseline
  97 findings on 68 of 81 fixture stories (121 checkpoints with exits), so a warning would flag most stories and the pinned
  campaign; it keys on one specific leaf (q, op, v), so a choice between two values does not fire. Sun Ruins example keeps 6.
- P2 judge director critic (`judge.uses.directorCritic`, on): `judge/livingCritic.ts` five nouls, verdict in code
  (`policy.ts` DIRECTOR_CRITIC_*), fallback to the LLM critic on no/partial answer. Fixture `test/fixtures/judge/director-critic.json`
  (20 recorded director answers labelled acceptable + 29 authored synthetic, labels committed in `39d99733d` before any call),
  recorded 49 TypeSafe calls (jev-1.13.0, p50 141 ms) in `test/goldens/judge/director-critic.json`, replayed by
  `livingCritic.test`. Floors met: player-act recall 14/14 = 1.0 (>= 0.9), false refusals 1/28 = 0.036 (<= 0.15; A01, a cast
  question to the player at p 0.51). Informational: 1 of 2 contradiction cases missed (p 0.32 < 0.5); two recorded drafts sat
  at p 0.48. Before (LLM critic, research note): 5 of 9 then 3 of 14 false refusals; not re-measured (needs the remote
  authoring model). Live row M21 / M43-P2.
- P3 multi-lead turning points (`stagecraft.livingLeads`, on): `opens_when` may be a list (max 3), prompt asks for 2-3 leads of
  different kinds only when on; way-in = one transition `any[leads..., pace]`; every new lead counts toward the 2 new values;
  each lead checked for open-on-arrival and impossible. Hard floors met: the 20 recorded single-lead goldens replay to the same
  verdicts (0 impossible/open-on-arrival); 3-lead draft builds one transition. No offline before/after for pace-forced share
  (needs played living sessions: M43-P3).
- P4 Studio: checkpoint Pacing section gets Minimum player turns, Stuck after, Leads (hidden on an open stretch); transition
  editor gets an Urgent switch. Stories `AuthorsDwellAndLeads`, `MarksAnExitUrgent`.
- Docs: guide topics `stuck-leads` (new) and `living-director`; settings reference regenerated; plan 24 matrix rows; GPU rows
  M43-P1..P3. No live gate: no ST, no lanes, no GPU (brief).

## Phase 2 agent L (lore lifetime, scene state + aliases, example-dialogue drop)

Branch `v3.0-43-l`. Floors declared before measuring (2026-10-31):
- L1 lore lifetime (`worldInfo.loreLifetime`, on): worst-case per-prompt story lore along any simple path (constants switched on + the
  largest keyword entries lore-select may force, top_k else 8; chars/4) must not rise on any fixture or pinned campaign story with the switch
  on; informational: count of stories over 2,500 before vs after.
- L2 scene state (`worldInfo.loreState`, on): offline lexical arm with state terms must not lose needed recall@4 or nDCG@4 against the
  window-only arm on `lore-relevance.json`, nor recall@2 on `lore.json`. Judge arm with state needs re-recorded goldens (TypeSafe):
  not run here (no lane copy used), so the judge half is unmeasured. Prefilter shortlist recall re-measured with state terms; recorded
  against 0.95, default not flipped.
- L2 aliases (`worldInfo.loreAliases`, on): nickname fixture `test/fixtures/lore-aliases.json`: every nickname row fires after the pass
  (5 of 5), none before, and no row fires against its label.
- L3 example-dialogue drop: check `voice-examples-pushed-out` fires on its fixture; info, read only.

### Agent L results (2026-10-31)
- L1 lore lifetime, switch `worldInfo.loreLifetime` (on). `effects.world_info.enable[]` takes `until: "chapter" | "<checkpoint id>"`
  and `lasting: true`; default end = leaving the enabling checkpoint's chapter (stories without chapters: no default end). Compiled into
  the path replay (`engine/worldInfoEffects.ts` `loreAlongPath`, used by `worldInfoPlan`, so scan and file modes and rollback agree);
  scan/guard memo keys carry the switch. Studio: end picker per enable, diagnostics `lore-path-over-budget` (per-prompt meter over every
  simple path, about 2,500 tokens, books loaded lazily through `runtime/loreTokenHost.ts`) and `world-info-until-unknown`. Guide: "Every
  enable has an end" + lore budget, no more cast/truths kept on without an end.
  - Worst-case per-prompt story lore (chars/4), off -> on: sun-ruins 1072 -> 1072 (no chapters). Pinned campaign stories S1..S9 (index
    only): 2136->2102, 2240->2240, 1826->1686, 2831->2120, 2563->2348, 2504->2111, 2651->1980, 2738->2738, 2738->2217; over 2,500:
    6 -> 1 (S8, no chapter change on its worst path). Floor (not rise) met. Every-entry meter (lore-budget-uncapped's sum) stays
    28-35K: keyword world books dominate it. L1 numbers were taken during the build, before the floor commit; the floor is structural.
- L2 scene state, switch `worldInfo.loreState` (on): place, cast switched on with aliases, active quest titles, met codex names
  (`runtime/loreStateRead.ts`, lazy) join the judge request (`scene.place/cast/quests/known`, capped) and the BM25 terms. A stateless
  request stays byte-identical (goldens intact). Offline (window speakers + objective as the fixture's state):
  - lore-relevance (17 rows): lexical needed recall@4 0.5385 -> 0.5385, precision@4 0.2647 -> 0.2647, nDCG@4 0.4265 -> 0.4200: floor
    MISSED by 0.0065 (recorded, not retuned; switch stays on per owner rule).
  - lore.json (11 rows): lexical recall@2 0.7143 -> 0.7619; judge on the capped pool 22/30 -> 21/30 (full pool 26/30).
  - Prefilter shortlist recall (judge picks kept by the 12-pool): 0.5172 -> 0.6207 with state terms; still below 0.95, default stays off.
  - Judge half unmeasured: goldens not re-recorded (no TypeSafe batch from a lane copy run here); row M43-L2.
- L2 aliases, switch `worldInfo.loreAliases` (on): `runtime/loreAliases.ts` adds a person's/place's other names (roster card name +
  aliases, codex name + aliases; names two sets share dropped) to story-book entries keyed on one of them, on scan copies only (scan
  mode), and lore-select counts such an entry as left to the keyword scan. Nickname fixture: 5/5 nickname rows fire after, 0 before,
  0 rows against their label. Floor met.
- L3 `voice-examples-pushed-out` (info, author, feature character-delivery): `GENERATE_BEFORE_COMBINE_PROMPTS` (Text Completion
  only) read-only; fires when the drafted card has `mes_example`, examples are on "Gradual push-out" and `mesExmString` is empty.
  Firing fixture in `checksRegistry.test.ts` + `exampleDrop.test.ts`. Chat Completion not read.
- GPU rows M43-L1, L2, L2b, L3 in `gpu-queue-2026-10-30.md`. Plan 24 matrix rows `lore-lifetime`, `lore-state`.

## Gate record L
- `npm run gates:quick` green per item (331 s, then fixes for code-health S4/S8, error-copy and matrix rows).
- `npm run gates` run 1 RED: `errorCopy.guard` (silent catch in loreTokenSource) and `suiteCoverage` (matrix rows) - fixed.
- `npm run gates` run 2 RED only on `patterns.test.ts` P5 perf (p95 58.5 ms vs < 50, untouched timing test under machine load);
  `npm run gates -- --resume` reran `test` green (559.6 s). Clean full run: see merge commit message.
- No live/ST/GPU/model lanes used. Judge goldens not re-recorded.
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

## Gate record M
- 2026-11-01, branch `v3.0-43-m`, merged master `f2c49ea07` (agents L, P, H work) before the cited run; conflicts were list
  unions (settingsIndex author set, this plan doc) and regenerated guide/settings pages.
- `npm run gates:quick` green after the merge (jest 317 s). Earlier quick runs red on lint max-len and code-health ratchets
  (S3 file budgets in engine.ts/scheduler.ts/registry.ts, S4 wireCoordinators length, S8 dead exports and a local isRecord), all fixed
  without raising a budget (engine.ts manual-boundary return folded to two lines; features moved into retentionFeatures.ts).
- Full `npm run gates` (no --resume, Storybook included) on `95ebdaa02`: **all green in 528.0 s** (typecheck, build, typecheck:test,
  test, test:replay, test:debug, debug:typecheck, test:plugin, test:release, lint, test-storybook:ci).
- Budgets: memory coordinator 560/560, extraction coordinator 560/560, manager 700/700 (effective lines). Main bundle
  `dist/index.js` 1,292,353 B (budget 1,300,000: 7.6 KB left; next main-bundle work should go lazy).
- Not run: every GPU row (M43-M1..M4); no live browser gate (no lanes, no ST, no GPU per brief). CPU-only inputs: llama-tokenize
  with CUDA hidden.

## H: restyle ST's own UI, self-imposed rules review (owner 2026-10-31)

Owner: "you've been limiting to not editing sillytaverns own styles? thats not what i want at all. Please, add it, but review
our previous plans for things that we've been limiting ourselves because of this rule. is there any other rule like this?"
Follow-ups: "i want new elements on the chat", "let's be creative here".

- `src/styles/host.css`: the one stylesheet that selects ST classes, outside the Tailwind scope, in the lazy styles chunk.
  Each rule gated by `html[data-so-<flag>]` (set by `runtime/hostStyle.ts` from the snapshot) and scoped under `#chat`.
  Guard `runtime/hostStyle.test.ts` (flag + `#chat` prefix on every selector; default on). Rules docs updated
  (architecture §UI, gotchas Tailwind line).
- First rule `display.compactThoughts` (on, device chip, Display → In the replies, feature `compact-thoughts`): ST's
  "Thought for …" bar becomes a pill at the reply's top left (header block no grow, padding 1px 8px, transparent, 1px
  `--SmartThemeBorderColor`, radius 999px, 0.78 × `--mainFontSize`, opacity 0.75 → 1 on hover / open).
- Self-imposed rules review: `research/self-imposed-rules-2026-10-31.md` (recommendations only; no other rule changed).

## Gate record H

- Live: lane 60 (no-model), worktree `dist/` routed into the lane browser (nothing staged), SO-UI card + group, 4 messages,
  reasoning written into 2 replies' `extra` via the chat API + reload. Probes desktop and 390x844: on = flag set, radius
  999px, transparent, 1px border, 11.7px font, 157x22 px at the text's left edge (ST default 184x32, grey), opacity 0.75
  closed / 1 open or hover, actions hidden closed and shown open; off = ST's bar back; back on = pill. Dark + light palette.
  0 model calls, leaked 0, lane stopped. `C:\dev\so-lanes\ui-review\compact-thoughts\` (driver kept as `.mts.txt`).
- Storybook: no story. The rule restyles ST's message markup, which needs ST's own `style.css` and `#chat`; Storybook loads
  neither, so a story would show our rule over unstyled markup. The lane shots are the visual record.
- Bundle: main `dist/index.js` 1,261,040 B (budget 1,300,000).
- Gates: `npm run gates` all green in 474.1s (Storybook included, no --resume) on the tree merged with master `bc9b1532a`;
  an earlier full run was red on the plan 24 matrix row + registry file budget (fixed: row added, feature moved to
  `presenceFeatures.ts`) and one `patterns.test.ts` P5 p95 timing (58 ms vs 50, untouched, green since). `gates:quick` green.

## X: Vast batch 1 harness fixes (2026-11-01)

Source: `gpu-queue-2026-10-30.md` §Vast batch 1 record (environment + harness defects), evidence in so-sessions
`evidence/phase-c/vast-b1-2026-11-01/` and `test/sessions/T1/T1-6-*` (counts only). Scripts and fixtures only, no `src/`.

- Frozen bundle per batch: `st-lanes.mts bundle <n> freeze|off|status`, `batch --bundle`, `run --bundle`, `so-session start
  --bundle` (`lib/laneBundle.mts`, `so-bundle-route.mts`). Copy in `<lane>/bundle/<sha>/`, served through a browser-context
  route held by a detached process; a user-extension folder was tried first and fails (ST's `express.static(public)` runs
  before the user extensions router, `src/server-main.js:242` vs `src/users.js:1219`). Rows record `bundle {frozen,start,end}`
  read through the page (`dist/manifest.json` via fetch, so the route counts) and go INCOMPLETE when it moves; session
  turns carry the pinned sha and are refused when the page serves another.
- Lost chat: turns 5-40 of T1-6-6 (36/40) and T1-6-2 (35/43) reopened from `chatId null`, while the journal and console
  tails stopped at turn 4 and the payload tail kept polling: the scripts ran in another browser. `connectToST` cleared the
  lane's `session.json` on any attach failure (a 30 s CDP timeout under 100 % CPU) and every later script launched its own
  headless Chromium. With `SO_LANE` set an attach now retries 3x, keeps the session file while the endpoint answers and
  refuses instead of falling back; an ST-origin tab wins over a blank one; the session chat must match `groupId` too.
- Payload tail: `/props` and `/status` polls are not captured (`PAYLOAD_POLL`); a closed capture page is re-picked from the
  browser (`stPageOf`). Re-arm after a reload already worked (tested since v2.3); batch 1 never reloaded, it lost the page.
- `so-session` pin: an authoring role on a harness route passes for a non-wizard card, recorded as `harnessRoutes`
  (`sessionHarnessRoles`); a wizard card or any other role still refuses it.
- `group-story-read` payload case: the control assumed the second read sat on another checkpoint, but the story had one;
  added `ferry` + a `coins_spent >= 2` transition and a boundary after `/cp set`.
- Recipe gaps: MW1-B3 driver `so-session.mts turns <dir> lines.txt --until-boundary 150`; M42-F5 window driver
  `test/scenarios/m42-f5-relax-window.json`; MW1-B4 and M42-F3 gaps written into their rows (not built).

## Gate record X

- node:test: `laneBundle.test.mts` (6), `sessionTurns.test.mts` (2), new cases in `connection.test.mts` (2),
  `sessionDriver.test.mts` (1), `sessionPin.test.mts` (1), `st-payload.test.mts` (2).
- Live, lane 35 (no-model, not a Vast lane): `bundle 35 freeze --from <slot with a planted manifest sha>` + reload: the page
  read the planted sha while the ST tree served `19b61fb0`, runtime up; `run` rows printed `bundle: … (frozen)`. Refrozen
  from staged `19b61fb0`: `so-payload-golden capture --cases group-story-read` ok, 4 captures (classic shared 162 < rules
  422; stable-first shared 5978 >= head 5958). `so-scenario run test/scenarios/m42-f5-relax-window.json --sandbox` green x2
  (on: expected 0.5 hold; off: expected 0.75 escalate; pathArc restored). The lane-attach refusal fired once by accident
  (a mangled `SO_DEBUG_DIR`): "lane 35 has no browser session … refusing".
- Not live: `so-session start --bundle` and `turns` end to end (need an adolion-fresh model lane); covered by unit tests.
- Gates: `npm run gates` all green in 569.7s (Storybook included, no --resume) on the tree merged with master `2ecb699a1`; the
  first full run was red on `arrivalEquivalence.test.ts` (the new scenario missing from `test/goldens/arrival-findings.json`, re-recorded)
  and one Storybook play timeout (HelpPanel, untouched, green on the rerun). `gates:quick` and `test:debug` green.

## Phase 2 agent V — Summarize and Vector Storage filtered per character (owner 2026-11-01 "sure")
Source: `research/self-imposed-rules-2026-10-31.md` §Owner answers item 2. Switch `memory.copierFilter` (on), feature
`copier-filter`, control `#so-copier-filter` (Models › Knowledge tracking).
- How they inject (ST 7c3994196): Summarize sets `extension_prompts["1_memory"]` from its worker (memory/index.js:965), default
  position IN_PROMPT. Vector Storage's generate interceptor `vectors_rearrangeChat` (manifest loading_order 100, ours 1) splices
  the retrieved messages out of the chat copy and sets `"3_vectors"` (vectors/index.js:776-856). Both are read after the
  interceptors (script.js:4564, 4700, 5647; openai.js:1389-1407); `setExtensionPrompt` makes a new entry object per call.
- Design: runtime override, no ST patch. Our interceptor (after the drafted beat settles) rewrites `1_memory`; a wrapper
  installed on `globalThis.vectors_rearrangeChat` rewrites `3_vectors` after Vector Storage runs. The view is
  `withoutSecretLines(text, heldSecrets, drafted member names)` (`MemoryInjector.copierView`), the rule every shared tier
  uses; a draft outside the roster gets the resting view; no draft or a withheld draft (impersonate, quiet) gets the raw text.
  The raw text is kept per host entry object (`stHost/copierPrompts.ts`) and put back at `GENERATE_AFTER_DATA`, so
  Summarize's next pass, its UI and the stored vectors never see the filtered text. With no held secret every member's
  block is byte-identical. Host wiring is a lazy chunk (`runtime/copierFilterHost.ts`).
- Check: `transcript-copiers` no longer names Summarize / Vector Storage while the switch is on; VectFox (no filter) and a
  switched-off filter still raise it; its copy names the switch.
- Not covered: a dry run (prompt preview, payload goldens) skips interceptors and shows the raw copier text; ST's prompt
  itemization reads the values after `GENERATE_AFTER_DATA` (raw). Vector Storage's spliced-out messages leave the chat copy
  for every member as before; a filtered line is dropped from the kept-out member's prompt, not put back into history.
- Prompt cache: `1_memory` sits near the top (IN_PROMPT). It varies per member only while a held secret is restated in the
  summary; then the kept-out member's prefix differs from the holder's from that block on. The RAM member cache keys per
  member, so each member's prefix stays stable turn to turn until the summary or the secret set changes (a new summary
  already broke the prefix). `3_vectors` already changes every turn (retrieval), so no new effect there.

## Gate record V
- 2026-11-01, branch `v3.0-43-v`. Tests: `runtime/secretCopiers.review.test.ts` (kept-out member loses the restating
  sentences of both blocks and keeps the rest; holder verbatim after a kept-out draft; out-of-roster draft = resting; no secret
  = byte-identical for every member; raw restored after assembly; new summary between drafts taken as raw; withheld draft =
  raw; vectors wrapped once, unwrapped on dispose; check names only unfiltered copiers; negative control filter off carries
  the secret), `stHost/copierPrompts.test.ts`.
- No-model lane 61 (Summarize enabled on the lane copy, restored after; Vector Storage enabled with a canned-retrieval stub
  standing in for the embedding backend; bundle frozen from the worktree, never staged): `test/scenarios/v30-43v-copier-filter.json`
  green x2 on the eager build and x2 on the lazy build (`0de09685`). Ponticius (kept out): no secret text in the dry-run prompt,
  plain line kept; Arin (holder): both copier lines present; host holds raw text after; `secretLeaks` [] ; filter off control
  carries it. Real-model gate: not run (no model call on this path; the filter is code over prompt text) — flagged NOT green
  for a real Summarize/Vector Storage retrieval, owed with the next model-lane batch.
- Main bundle 1,294,191 B (+1,185 B over master `676bf997c`; budget 1,300,000).
- `npm run gates` all green in 427.0s (Storybook included, no --resume) on `9c050c7b9` (final, lazy wiring); 483.6s on `de17f8cd4` (eager). Earlier full runs red on my
  own misses: registry S3 file budget (feature moved to `groundingFeatures.ts`), plan 24 matrix row, README feature table.
