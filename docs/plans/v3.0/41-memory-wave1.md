# Plan 41 — memory wave 1 (CPU, no read-contract change)

Source: `research/memory-shortlist-2026-10-31.md` wave 1 and the report each item cites. Owner 2026-10-31: "Start wave 1.
But I want to test and try every potential upgrade." So every item is its own switch under `memory.*`, **on by default**
(only the owner turns one off), measured offline before → after with a floor stated before the run (informational: a miss
is recorded, the feature stays on), and queued for a real-model A/B in `gpu-queue-2026-10-30.md` §Memory wave 1.

Two agents: A (branch `v3.0-41-memory-a`, this section) and B (its own section below).

## Shared harness: long-horizon availability probes (A5, build first)

`memory-cognition-evals.md` P1, availability half (no model). The utilization half is GPU row MW1-PROBE-U.

- Harness: `test/support/memoryProbes.ts` `runProbeSession(options)`; jest entry `src/runtime/memoryProbes.probe.test.ts`
  (runs in `npm test`). It drives a real `MemoryCoordinator` (fake hosts, no model: any model call throws, every pass
  that needs one falls back) through a 160-boundary synthetic session (public test story "Probe Vale", cast Mira, Tobin,
  Esk, player Wren): every boundary one player line and one member reply, one read applying 3 memory rows, 1 ledger row,
  an epistemic row every 4th boundary, arcs every 7th; short-term rewrite every 6, scene summary every 15,
  consolidation every 5. At plant + 20 / 60 / 150 boundaries it posts the probe question as the newest player line,
  drafts the target member (`onMemberDrafted`) and reads what the memory slots hold for that member (the four tiers,
  ledger and private block = the memory part of that member's dry-run prompt). `termPresent` = the live-suite matcher.
- Kinds (4 subjects each, 72 checks): `single` (one fact), `update-fact` (fact moved; old value forbidden),
  `update-ledger` (ledger location changed; old value forbidden), `temporal` (both events present), `kept-out` (a
  `[hiding]` secret restated in two memory rows; its words forbidden for the member it is hidden from), `secret-knower`
  (the knower still gets it).
- Floors (declared 2026-10-31 before the first run, informational): availability >= 0.9 at 60 boundaries; kept-out
  forbidden terms = 0 (**hard**: the jest test fails on a leak).
- Record a run: `SO_PROBE_LABEL="<label>" SO_PROBE_RECORD=test/measurements/v3.0/memory-probes/<name>.json npx jest
  src/runtime/memoryProbes.probe.test.ts` (writes per-kind × horizon rows plus every result; the test also prints the
  rows). Options for an arm: `runProbeSession({ settings: { <switch>: false } })`. Agent B: record your before/after with
  the same command.
- **Baseline on master `fabc9384a`** (`test/measurements/v3.0/memory-probes/baseline-master.json`): availability at 60 =
  **0.375** (floor 0.9: miss), kept-out leaks **0**.
  - single 4/4 @20, 1/4 @60, 1/4 @150 (the facts cap of 50 drops the oldest rows);
  - update-fact 4/4, 0/4, 0/4; update-ledger 0/4 at every horizon (ledger focus never reads the turn text, so the asked
    item is not selected); temporal 3/4, 0/4, 0/4; kept-out 4/4 everywhere; secret-knower 4/4 everywhere.
  - Synthetic density (3 rows a read) is higher than a typical read, so absolute numbers say more about caps and
    selection than about a real chat; the before → after delta is the measurement.

## Items (agent A)

All four ship **on** (`defaultMemorySettings`, sanitized `!== false`), as controls of the Prompt memory story feature
(`featureControlPaths.ts` `memory`, labels in `featureControls.ts`, copy in `settingsCopy.ts`, Help rows in
`features/memoryWaveFeatures.ts`, `featureState.ts` rows), session baseline updated. Coordinators stay at their 560
budget (both were exactly at 560 on master): the short-term verdict lives in `runtime/shortTermVerdict.ts`, the verdict
pass in a lazy chunk reached from boundary work through the chapter host.

### A1. Compaction counts real tokens (`memory.compactionTokens`), compression P3

- Mechanism: `compactHistory.ts` `primeCompaction` (awaited in the generate interceptor before `compact`) counts each kept
  row once with the host tokenizer (`hosts.tokens.countTokens`, ST's `getTokenCountAsync`) into a per-port cached meter
  (`createTokenMeter`, the meter `sceneSummary.ts` uses; dropped past 4,000 rows); `compact` plans the cut on those
  counts. Skipped when chunked dropping is off (it ships off until A3-R), on quiet/impersonate, and while the estimated
  history is under half the low mark. Off = today's chars/4.
- ST-trims probe: `so-compaction-rating.mts trims` tokenizes the longest prompt of each recorded chat with the play
  model's own tokenizer (`llama-tokenize`, vocabulary only, CUDA hidden: no GPU), then replays every prompt and counts
  prompts where ST's real-token fit still drops a message after a cut (planned on the estimate vs on real tokens), and
  between two cuts (same cut id, same member). Jest: `compactHistory.review.test.ts` A1 block.
- Floor (declared before the run): 0 prompts trimmed between cuts on the real-token arm at the 8,192 A3 stand-in.
- Result (43 chats, 346 prompts, 11,369/11,369 history segments counted; real/estimate p10 0.88, p50 0.987, p90 1.19):
  - 8,192: estimate arm trimmed after a cut 0 / 134, real arm 0 / 126; between cuts 0 / 0. **Floor met; no measurable
    gain on this corpus** (chars/4 is already close to Gemma's count on English chat).
  - Stress, informational: 4,096: 3 / 204 vs 3 / 203 (between cuts 0 / 0); 3,072: 97 / 223 vs 118 / 221, between cuts
    2 vs 10. At tight budgets the trims come from the non-history part of the prompt (cards, lore, memory blocks) taking
    more than the 25 % the band leaves, which real counts do not fix (finding for A3: the band ignores prompt overhead).
  - Synthetic jest (tokenizer = 2x estimate): prompts over budget after a cut 131 (estimate) to 0 (real).

### A2. Collapse guard on the rolling short-term summary (`memory.summaryGuard`), compression P1

- Mechanism: `memory/summaryGuard.ts` `guardSummary` / `judgeSummary`, called after `acceptCompaction` through
  `runtime/shortTermVerdict.ts`. Names = story entities, row entities and capitalised spans (a sentence-opening word only
  when it is also capitalised mid-sentence or known). Refuse `dropped-detail` when a name in the previous summary is
  neither in the new one nor held by a live non-short-term row, a ledger row, an open arc or a sealed chapter's
  summary/short; refuse `collapsed` below 60 % of the previous length when the window is non-empty. A refusal keeps the
  previous entry (today's path, one retry, journal `compaction-refused` with the reason and no names). An accepted
  summary stores the names it holds in `entities` (was `[]`). Pure over the store at that time; rollback restores it.
- Floors (declared before the run): entity retention >= 0.9 over 5 chained compactions (jest, public synthetic chain,
  `summaryGuard.test.ts`); refusal rate <= 0.2 per step on recorded chains (private lane payloads).
- Results: synthetic chain retention 0.333 (unguarded) to **1.0** (guarded, 3 of 5 steps refused). Recorded chains
  (`SO_GUARD_PAYLOADS=<lanes 42 v29gpu2, 45 s6h, pod2 narr> npx jest src/memory/summaryGuardReplay.test.ts`, numbers
  only): 35 short-term prompts, 23 steps, refusal rate **0.13** (floor met; 2 collapsed, 1 dropped-detail), names lost
  per step without the guard 0.087 (1.9 % of names; coverage approximated by the nearest play prompt), no chat long
  enough for a 5-step real chain.

### A3. Idle-time supersession verdicts (`memory.supersedeVerdicts`), agent-architectures P3

- Mechanism: the consolidation job's uncertain pairs (soft ones; established/locked already go to the conflict queue)
  are queued in an in-memory slot (`runtime/supersedeVerdicts.ts`, lazy chunk, capped 32). A priority-4 scheduler job
  asks the memory route (synthesis role, pass `supersession`, 256 tokens) one batched question of up to 8 open pairs,
  only when no generation is open (`isGenerationOpen`); RunToken minted before the call and checked after. Answers
  (`parseSupersessionVerdicts`, wired at last) are parked; boundary work `supersede-verdicts` (order 69) applies them at
  the next boundary after re-checking the run: SUPERSEDE = `applyConsolidation` link stamped at the boundary + a `dedup`
  derived record with both ids as inputs; INDEPENDENT = `clearContradicted`. A pair whose side became locked,
  established, superseded or gone is skipped. Rollback: either input removed drops the record and the link
  (`rollbackReplay.property.test.ts` has a `verdict` op; `supersedeVerdicts.review.test.ts` checks rollback = replay).
- Offline: planted-verdict fixture (plumbing only: malformed lines decide nothing, batch 8, locked side skipped, no ask
  while generating, stale chat discarded, switch off asks nothing). Verdict precision needs a real model: GPU row MW1-A3
  (floor accuracy >= 0.8 on >= 30 labelled pairs). Probe harness unchanged (it has no model): 0.375 to 0.375.

### A4. Exact name fold for places, groups and things (`memory.placeFold`), knowledge-graphs P5

- Mechanism: `nameFold.ts` `entityNames` builds canonical names from codex places (`name`, `location`, `aliases`, bound
  place-lore entry title), free-named codex people, `requirements.place_lore` keys, `scene_read.locations` and faction
  names; `foldLedgerSignals` files non-character ledger rows under the canonical name on an exact `foldName` match (case,
  accents, a leading article); a name that fits two or none stays as written. Character folding unchanged. Pure over the
  pinned story, so replay is identical.
- Floor (declared before the run): on the fixture every spelling of an authored name folds to one key and unauthored names
  stay as written. Result (`placeFold.test.ts`, 15 public synthetic reads): distinct ledger keys **12 to 6**, the
  unauthored place kept its raw text, the ambiguous alias untouched. Probe harness: no codex, unchanged.

### Probe harness after A1-A4

`test/measurements/v3.0/memory-probes/agent-a-after.json`: availability at 60 **0.375 to 0.375**, kept-out leaks 0 to 0,
every kind x horizon row identical to the baseline. Expected: none of A1-A4 touches the caps or selection the probes
measure (that is agent B's retention and query work); the harness is in place for B's before/after.

### Unresolved questions (agent A)

- A3 band ignores prompt overhead: at tight budgets ST still trims after a cut whatever the tokenizer. Subtract the last
  generation's non-history tokens from the band (promptCost knows them)? Not built (changes A3 behaviour).
- A2 coverage counts a name held anywhere in memory, so the guard mostly protects names nothing else holds; is a stricter
  "named in the summary only" rule wanted?
- A3 verdicts use the synthesis route; if the decider model is calibrated for memory pairs later, route there?

## Gate record A

- 2026-10-31, branch `v3.0-41-memory-a`, base master `fabc9384a`, merged master up to `b8428ba47` (agent B's 41-b, 43-s,
  43-c) before the final run. Conflicts were list unions (switch declarations, session baseline, registry spread,
  property-test op kinds, this plan doc, the GPU queue); generated guide/settings pages regenerated.
- Per item: `npm run gates:quick` (green except a passProfiles census row, fixed); jest per file as listed in each item.
- Full `npm run gates` (no `--resume`, Storybook included) on `a6cd02e7a`: **all green in 808.9 s** (build, typecheck,
  test, typecheck:test, test:replay, lint, debug:typecheck, test:release, test:debug, test:plugin, test-storybook:ci).
  Earlier full runs: green 797.2 s before the master merges; two RED at test:plugin on
  `server-plugin/story-orchestrator-gpu/broker/comfyReclaim.test.mjs` (free-first case waited 40 ms wall clock and lost
  the race under parallel load; passes 3/3 alone). Fixed test-only (`waitMs: 5000` on that case), separate commit.
- Coordinator budgets after merge: memory 560/560, extraction 560/560, manager 700/700 (effective lines). Main bundle
  `dist/index.js` 1,239,194 B (budget 1,300,000); the verdict pass is a lazy chunk.
- Probe harness: baseline master 0.375 at 60; agent A alone 0.375 (no change expected); A+B merged 0.458
  (`a-plus-b-merged.json`); kept-out leaks 0 in every run.
- CPU-only measurement inputs used: lane payload files (private, numbers only) and `llama-tokenize` with `CUDA_VISIBLE_DEVICES`
  empty (vocabulary only). No ST :8000, no lanes, no GPU, no ComfyUI, no staging.
- NOT run: every real-model row (MW1-PROBE-U, MW1-A1..A4 in the GPU queue); no live browser gate (no ST-facing UI built
  beyond the Story → Features controls, which the featureStatus/featureControls tests and Storybook cover).

## Items (agent B): which memories survive and get injected

Branch `v3.0-41-memory-b`. Four items, each its own switch under `memory.*`, on by default.

### B1. "Used in reply" detector (shared by B2 and B3, no switch of its own)

- Pure `memory/used.ts` `usedInReply(items, reply, speakerNames)`: an offered item counts as used when the reply restates its
  content words (`memory/words.ts` `restatesWords`, the matcher the secret filter trusts) with the speaker's own name words
  removed, or names one of its activation triggers (`termPresent`, 4+ chars).
- Offered = what that member's draft carried: injected memory rows (the staged per-member injection), open arcs, and the
  member's private-source lines (cue/topic/echo lines, promise reminders, hearsay). Captured at `onMemberDrafted`
  (`MemoryInjector.captureDraft`), consumed by the reply that follows it (reply id = chat length at draft, or one less for a
  swipe); no capture = nothing recorded.
- Boundary work `mentions` (order 9.6, `runtime/mentionPort.ts`) writes `extras.mentions.records`
  `{id, kind, member, messageId, revision, boundary}` (revision = swipe id + text hash), ring 400, re-detection of the same
  reply replaces; `rollbackMentions` in rollback quarantine drops records at or after the message. Runs while B2 or B3 is on.

### B2. Mention ledger — `memory.mentionLedger`

- `memory-game-narrative.md` P1. A row member M restated is left out of M's own memory blocks for
  `MENTION_HOLD_BOUNDARIES` (6) boundaries (`heldForMember`, fate `mentioned`), unless the latest player message raises it
  (`raisedBy`: restates it, shares 2+ non-cast content words, or names a non-cast entity/trigger). Pinned and established
  rows are never held. Other members still get the row. Only the per-member memory tier blocks change (already late,
  per-turn); the resting block, the ledger and the prefix are untouched.

### B3. Strength-based retention — `memory.strengthRetention`

- `memory-cognition-evals.md` P4. `usedAt[]` on a row (stamped from B1, `{messageId, boundary}`, reversed by
  `stripLinksAfter` like `confirmedAt`). `strength = prior(importance) × exp(-elapsed / stability)` on the boundary clock,
  elapsed from the last use; stability grows with importance, durability and each spaced use (gap-dependent, 6 uses counted).
- `capTier(…, retention)` (`memory/strength.ts` `evictWeakest`) evicts the weakest unpinned, non-established row instead
  of the oldest, and marks it `foldedInto: "archive:evicted"` + `evictedAt` instead of deleting it; archive recall
  (`archiveRecall.ts`) brings it back by entity mention ("Recalled from earlier: …"), also in a chat with no chapter record.
  A rollback before `evictedAt` un-evicts. Archive cap 300 (weakest dropped). Score recency counts from the last use.
- Short-term tier is never strength-capped.

### B4. Retrieval query and scoring — `memory.retrievalQuery`

- `memory-agent-architectures.md` P2, `memory-rp-community.md` P3, `memory-context-compression.md` P2 (query half).
- Score query = last 4 spoken rows, recency-weighted `(i+1)/(k(k+1)/2)` (`scoreContext.ts` `windowQuery`); turn entities =
  roster names in the window + the enabled cast + (per member) the drafted member's names.
- Score terms min-max normalised across the candidate set (`score.ts` `scoreAll`), then weighted.
- Recency = min(age since creation or last use, messages since the transcript last named a non-cast entity/trigger of the
  row or restated it), over the last 40 rows; never from an injection.
- Archive recall: the last 3 rows (recency-weighted, objective at 0.15) as the lexical text and one vector query per row,
  weighted into the semantic band (`chapterKit.ts` `recallParts`, `recallBand`).

### Floors (declared 2026-10-31, before any measurement; informational, never retuned)

- F-B1 detector on the recorded transcripts (`test/fixtures/*.transcript.json`): true-use recall ≥ 0.90 (a sentence a
  member said, offered as a row, is detected), false-use rate ≤ 0.05 (sentences from other transcripts).
- F-B2 hold invariant = 100% (jest, hard): a row voiced by M is never re-injected to M within the hold window unless the
  player raises it; other members unaffected.
- F-B3 probes (agent A's harness): availability at 150 after > before; at 20 not lower than before. Archive reachability of
  evicted rows = 100% (jest), before 0 (dropped).
- F-B4 E0: new local arm f (window-weighted query + normalised terms) hit@4 ≥ arm c + 0.05 on the private set (c = 0.738);
  on the synthetic set ≥ arm c (0.25). New window/paraphrase set (`test/fixtures/retrieval-window.json`): callback subset
  hit@4 after ≥ 0.90 and > before; paraphrase subset (no lexical overlap) informational only; distractor subset (last line
  shares words with a wrong row) hit@1 after ≥ before.

### Results (offline, 2026-10-31; floors above were committed first, `896ecd34c`)

- B1 detector, 49 recorded transcripts (`src/memory/usedDetector.measure.test.ts`): true-use recall 147/147 = 1.00
  (verbatim upper bound: the offered sentence is the reply's own), false-use 0/1452 = 0.000. F-B1 met. Precision on real
  replies vs injected rows is owed (GPU row MW1-B1).
- B2 hold invariant 100% (jest, hard): `usedDetector.measure.test.ts` over every voiced transcript row and
  `runtime/mentionLedger.review.test.ts` through a real `MemoryCoordinator` (held for the speaker, kept for the other
  member, released when the player names it). F-B2 met. Probe arm with only B2 on: availability@60 0.375 = before (the
  harness writes no mention records).
- B3 probes (agent A's harness, copied from A's branch for the run; records
  `test/measurements/v3.0/memory-probes/b-before-all-off.json`, `b-after-all-on.json`): availability@20 19/24 → 19/24
  (not lower: met), @60 0.375 → 0.458 (update-fact 0/4 → 1/4, temporal 0/4 → 1/4; the only-B3 arm gives the whole gain),
  @150 9/24 → 9/24 (**F-B3 miss**: not higher). Kept-out leaks 0 → 0. Archive reach at session end (boundary 160), the
  12 single/update/temporal gold rows: before 12/12 deleted by the cap, after 12/12 in the archive and returned by
  `recallCandidates` for the probe question (F-B3 archive reachability 100%: met). The harness does not run archive recall
  at probe time, so @150 cannot see the archive; the GPU row MW1-B3 asks live with recall on.
- B4 E0 (`src/memory/e0Window.test.ts`; private pool via `SO_E0_PRIVATE_POOL=<main checkout>/test/sessions/e0/pool.json`,
  counts and scores only): private 84 questions, pool recall 0.905: arm c recomputed hit@4 0.750 / MRR@4 0.379 (golden c
  0.738), arm f 0.702 / 0.362 (**F-B4 miss**: needed ≥ 0.788, and f is below c). Synthetic 40: c 0.25 → f 0.30 (met).
  E0 asks for a verbatim quote with the question as the last line, so earlier lines in a window add noise there; the
  live recall path uses the window too, so MW1-B4 must watch quote-style callbacks. Not retuned.
- B4 window set (`test/fixtures/retrieval-window.json`, 18 cases written by agent B for this item, so biased toward the
  design; `src/memory/retrievalWindow.measure.test.ts`), before (last line, raw terms) → after (window, normalised):
  callback hit@4 0 → 1.00, hit@1 0 → 0.875 (met); paraphrase hit@4 0.40 → 0.80, hit@1 0 → 0.60 (informational: the
  cast and window names carry it, not paraphrase matching); distractor hit@1 0 → 0.80 (met), hit@4 1.00 → 1.00. Probe arm
  with only B4 on: availability@60 0.375 = before (the probes fail on the cap, not on ranking).
- Not run here: payload goldens and the prefix gate (need a lane; the brief allows a no-model lane only for a UI row).
  Every B change lands in the per-member memory tier blocks (depths 2-6, already per turn) or in scoring; the resting
  block, the ledger and the prefix are untouched by construction. Owed with the GPU rows.

### GPU rows (B)

`gpu-queue-2026-10-30.md` §Memory wave 1, agent B rows: MW1-B2 (~70 min), MW1-B3 (~120), MW1-B4 (~60), MW1-B1 (rides
MW1-B2, CPU Sol labels). Floors for those rows are stated there, before any run.

## Gate record B

- Vast batch 1 (2026-11-01), GPU rows: MW1-B2 MISS (off - on 0.071 < 0.10), MW1-B1 MISS (precision 0.65 < 0.9; sample recall 0.87), MW1-B3/B4 INCOMPLETE; detail and bundle caveats in `gpu-queue-2026-10-30.md` §Vast batch 1 record.

2026-10-31, branch `v3.0-41-memory-b`.

- `npm run gates` (Storybook included, no `--resume`) on `3c9c8d310`: **all green in 563.4s** (build, typecheck,
  typecheck:test, test, test:debug, test:replay, test:release, test:plugin, debug:typecheck, lint, test-storybook:ci).
  Earlier full runs on the branch were red once each for: a dead export (`E0_WINDOW_ARM`, fixed), a missing plan 24
  matrix row (fixed), and one unrelated timing flake per run under machine load (`patterns.test` P5 p95,
  `so-scenario` H-a cleanup, GPU broker `imageCache` admission); each passed alone and in the final run.
- Merged master `4c961c627` (docs only) after the green run; no code moved, not re-gated.
- Main bundle 1,244,346 B (budget 1,300,000). Memory coordinator 560/560 effective lines (net zero: `lastPlayerName`
  moved to `playerTurn.ts`).
- New jest: `memory/used.test.ts`, `strength.test.ts`, `retrievalQuery.test.ts`, `e0Window.test.ts`,
  `retrievalWindow.measure.test.ts`, `usedDetector.measure.test.ts`, `runtime/mentionLedger.review.test.ts`;
  `rollbackReplay.property.test.ts` gains use + cap ops (planted control: breaking un-evict fails 4 cases);
  `chapterRetained.review.test.ts` vectorfox case counts per round instead of exactly one query.
- No live gate: no ST, no lanes, no GPU (brief). Payload goldens / prefix gate owed with the GPU rows. Floors F-B3 (@150)
  and F-B4 (E0 private) missed; recorded, switches stay on.
