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
