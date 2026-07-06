# Plan 08 — Memory Hygiene, Budgets, Scheduler Pressure

## Objective

Keep memory clean and bounded over long play: supersession wired to the latching bridge, consolidation with embedding dedup, relevance scoring with diversity floor + activation triggers, per-tier token budgets, World-Info/Author's-Note write-on-change, and the scheduler's full pressure rules.

## Context

- Spec: §Memory subsystem (supersession, consolidation, relevance scoring), §Off-path scheduler (pressure), §ST integration (WI/AN cadence), §Design-spine bridges (supersession ≡ quality mutation).
- Consumes from 07: stores, entry types, injector, P2 pass. From 03: scheduler, apply queue. From 02: `stHost/worldInfo` (needs write capability — see notes).
- **Base**: Smart-Memory `continuity.js` (supersession/contradictions), `embeddings.js`, `similarity.js` (port to `src/memory/`).

## Scope

**In**: supersession two-pass + latching bridge, consolidation pipeline, scorer, budgets + trimming, WI/AN write-on-change, scheduler P2–P4 priorities + coalescing + pressure.
**Non-goals**: arcs/canon (09), epistemic/ledger (10), budget auto-tune (13).

## Deliverables

- `src/memory/supersede.ts` — port `continuity.js` approach: cheap state-change pattern pass; same-subject pairs without pattern match → one LLM confirm ("update or independent?"; scheduler P4). Retired entries keep `supersededBy` links. **Latching bridge**: supersession-confirm calls include the in-scope closed-vocabulary block (03's contract assembly); a confirmed supersession that implies a quality change emits a standard delta line, parsed by 03's parser into the apply queue (extractor source, evidence = the superseding text) — one event, two layers, no entity/key mapping table.
- `src/memory/consolidate.ts` — per-tier: new entries vs consolidated base → drop / fold / keep. Embeddings via port of `embeddings.js` (their `nomic-embed-text` pathway; verify which ST/vector endpoint they call and adapt — record findings); fallback keyword-overlap from `similarity.js`. Runs P4 on cadence. Consults 07's exclusion list — excluded entries are never re-added as folds or dedup survivors; pinned entries are never folded away.
- `src/memory/score.ts` — weighted blend per spec (importance, durability, confidence, recallCount, recency, entity overlap w/ current turn, arc relevance placeholder until 09, temporal proximity, semantic similarity, − contradiction penalty), diversity floor per type, activation-trigger boost. `selectWithinBudget(tier, tokenBudget, context)`.
- Budgets: per-tier token budgets (Smart-Memory defaults as starting point), tokenizer via ST (`getContext()` token counting — verify API, record); injector (07) now trims through the scorer.
- WI/AN surfacing: write relationship/scene-description entries to a story-managed lorebook + AN block only on content-hash change. `stHost/worldInfo.ts` gains create/update entry functions — verify against `public/scripts/world-info.js` exports (`createWorldInfoEntry`, `saveWorldInfo` — confirm names in source before use).
- Scheduler completion: P2 (scene passes) / P3 (generation) / P4 (consolidation, supersession confirms, canon refresh slot) with pressure rules: queue depth > threshold → widen P1 cadence, coalesce P2 to latest break, defer P4; deferral applies to LLM passes only, never to pending code-side enqueues (e.g. a confirmed arc-resolution increment, plan 09); reply path never waits (already absolute — assert with a test that floods the queue).

## Implementation notes

- Embedding storage: cache vectors per entry id in chat_metadata (bounded) or recompute-on-demand — decide by measuring entry counts; record.
- Contradiction penalty needs a contradiction signal: reuse supersession pattern pass output (entries flagged contradicted-but-unconfirmed).
- WI churn test is behavioral: identical content → zero writes (hash short-circuits).

## Validation gate

1. Baseline green. Long-fixture replay (≥100 turns, scripted goldens): no duplicate facts (embedding + keyword dedup asserted), no surviving contradiction, superseded chains linked; injection always within budgets (token-count assertions).
2. Latching bridge fixture: "Mara no longer trusts you" golden → fact superseded AND `mara_trust` delta enqueued with evidence.
3. Queue-flood test: response path timing unaffected (no awaits on scheduler from turn path — static check + runtime assert).
4. Live: extended play session; WI entries update only on change (`st-extension-settings.mjs`/WI inspection before+after identical scene), memory panel shows folded/retired entries.

## Delegated decisions

Budget defaults; embedding cache strategy (record); pressure thresholds; scoring weight constants (start from spec list, tune freely, record).

## Gate record

Date: 2026-07-05

Executed as milestones M0–M7 (agreed with user before build): M0 vendor refresh + host seams, M1 token budgets, M2 relevance scorer, M3 consolidation, M4 supersession + latching bridge, M5 WI write-on-change, M6 scheduler pressure, M7 verification/tooling.

Command outputs (final, cumulative):
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run debug:typecheck`: passed.
- `npm test`: passed, **18 suites / 1156 tests** (up from 12 / 1122 at plan 07 — new: `src/memory/{budget,score,consolidate,supersede,longFixture}.test.ts`, `src/extraction/scheduler.test.ts`; extended `inject.test.ts`, `runtimeManager.test.ts`).
- `npm run build`: passed with pre-existing warnings only (`dist/index.js` ~362 KiB).

Live checks (SillyTavern at `http://127.0.0.1:8000/`, deterministic `browser_evaluate` against real ST):
- **Vector host path** (`stHost/vectors.ts`, `source: 'transformers'`, no config): insert/query/purge all 200; threshold calibration confirms Smart-Memory's bands transfer — identical text ≥ 0.82, paraphrase/state-change in 0.55–0.70, unrelated < 0.55; tokenizer `getTokenCountAsync` returns counts.
- **M3 consolidation classifier over the live backend**: a 4-entry set (base, exact-dup, "no longer" state-change, distinct) queried at the real thresholds → exact-dup matched at 0.82 (→ drop), state-change matched to its base ≥ 0.82 with marker (→ supersede), and the distinct fact matched **only itself** (embeddings disambiguate subjects that jaccard conflates).
- **M5 WI write-on-change**: create → `loadWorldInfo` round-trip persists (`comment`/`content`/`disable`), identical-content short-circuit holds (zero-write path), changed content updates; test lorebook deleted (cleanup 200).

As-built:
- **Re-vendored** `continuity.js` / `embeddings.js` / `similarity.js` from the pinned commit `194a011b6b4ecbc0cd347ae8b6e59a6c1a56021a` (plan 07 had pruned them).
- `src/services/stHost/`: `tokenizer.ts` (`getTokenCountAsync`), `vectors.ts` (`/api/vector/{insert,query,purge}`). `worldInfo.ts` gained `upsertWIEntry` (create-or-update by stable `comment`, content-hash short-circuit). New `tokenizersModule` in `modules.ts`; all re-exported via `STAPI.ts`.
- `src/memory/`: `similarity.ts` (pure port), `budget.ts` (`selectWithinBudget` + token cost, pinned-always-kept, diversity floor), `score.ts` (weighted blend + `DEFAULT_SCORE_WEIGHTS`), `consolidate.ts` (`batchVerify`-port classifier: drop / supersede / uncertain / confirm, `buildJaccardMatchSets` fallback, `applyConsolidation`), `supersede.ts` (`markContradicted`/`clearContradicted`/`parseSupersessionVerdicts`). `types.ts` gained `tokens?`, `foldedInto?`, `contradicted?`. `inject.ts` now trims each tier through `selectWithinBudget`+`scoreEntry` and excludes retired entries.
- `runtimeManager.ts`: computes `entry.tokens` at write (`countTokens`), `buildScoreContext` + budget-aware `updateMemoryInjection`, `getMemoryInjectionBlocks` (macros consume it), `runConsolidation` (P4: ephemeral per-tier vector collection → type-faithful threshold bands → `consolidateTier` → `applyConsolidation` → `markContradicted` → supersession bridge → `syncWorldInfo`), `runSupersessionBridge` (synthetic-window `runSharedRead` → deltas via existing parser → `applyExtractionAudit` enqueue; evidence = superseding text), `syncWorldInfo` (relationship + scene entries → story lorebook, hash-tracked `wiWrites`). `runtime/types.ts`: `tierTokenBudgets`, `scoreWeights?`, `wiWrites`.
- `scheduler.ts`: `underPressure()` (queue depth ≥ `pressureThreshold`, default 3) → widens cadence (skips P1), coalesces pending P2 to latest, defers P4 in `pumpHeavy` (P3 never deferred; resumes when reads lane drains). `runtime/index.ts` schedules P4 consolidation every 10 boundaries.
- UI (`index.tsx`): `MemoryPanel` marks superseded/folded (strikethrough) + contradicted + recall count.
- Tooling: `so-state.mts` memory block gains `supersededCount`, `foldedCount`, `contradictedCount`, `tierTokens`, `wiWriteCount`; `gotchas.md` documents the new handle methods, debug global, and the score-less vector-query banding.

Decisions recorded (delegated): token budgets facts/session/short/scene = 800/600/300/500; hard count caps unchanged (50/40/10/30, reused as the `capTier` safety ceiling — no migration); scorer weights per `DEFAULT_SCORE_WEIGHTS`; dedup thresholds cosine 0.82 dup / 0.88 cross / 0.55 same-topic, jaccard 0.65/0.75/0.40; pressure threshold 3; consolidation cadence 10 boundaries, min group 8.

Deviations from plan:
- **Embedding transport**: the plan/architecture doc assumed raw `embed(text)→vector` (Ollama/OpenAI) with client-side cosine. ST exposes no same-origin raw-embed call and its `/api/vector/query` drops the score server-side, so consolidation uses **threshold-band queries** over an ephemeral per-tier vector collection (query at dup + same-topic thresholds, bucket by set difference, type-faithful) rather than pairwise cosine. Live-verified equivalent. Cross-type dedup on the vector path uses the same-origin 0.88 band; the jaccard fallback keeps full cross-type fidelity.
- **AN block dropped from scope**: the ST Author's Note is already owned by `effectsApplier.ts` (checkpoint `author_note` effect), and memory already injects via depth `setExtensionPrompt` per tier. Memory therefore surfaces via WI entries + the existing tier injections and does **not** write the ST Author's Note (resolves the plan's AN open question).
- **`recallCount` bump moved to consolidation** (Smart-Memory's `confirmed` set on re-extraction) instead of per-injection, avoiding persist churn on every boundary.
- **Long-fixture replay is a deterministic Jest test** (`longFixture.test.ts`, 126-entry corpus) asserting no-dup / linked-chains / no-surviving-contradiction / within-token-budget, rather than recorded LLM goldens — the invariants are LLM-independent. The corpus uses lexically-disjoint facts because the jaccard fallback (unlike embeddings) cannot disambiguate subjects sharing a state phrase; this limitation is now documented and is the reason embeddings are the primary path.

Not fully live end-to-end (deferred, documented): a story-loaded run of the P4 consolidation→bridge→WI chain via a `so-scenario` fixture. The bridge is wired through the already-proven shared-read pipeline (`runSharedRead` + `parseSharedReadResponse` + `engine.enqueue`) with the `storyOrchestratorDebugSupersessionResponse` hook for deterministic testing; the classifier and WI paths are live-verified above and unit-verified in the harness. A `test/scenarios/plan08-hygiene.json` + matching `so-scenario` verbs would close this and is the recommended first task for the next agent.

### Post-review fixes (self-review pass, 2026-07-05)

A full code review of the as-built plan-08 surfaced one correctness bug and six robustness/efficiency items; all fixed (harness re-green at **18 suites / 1157 tests**, lint, build; live-reverified):
- **F1 (correctness, was HIGH)** — superseded/excluded facts kept injecting via World Info: `syncWorldInfo` never retired their lorebook entries. Now reconciles each sync — `disableWIEntry(lorebook, comment)` for any `wiWrites` comment whose fact is no longer live, and prunes the `wiWrites` key (disable, not delete — reversible). Live-verified: a WI entry set `disable:true` persists across reload.
- **F2** — `contradicted` was a permanent penalty latch (`clearContradicted` never called). `applyConsolidation` now clears the flag for entries re-confirmed in the same pass (`confirmedIds`); new `consolidate.test.ts` case.
- **F3 (efficiency)** — consolidation's per-entry threshold queries now run via `Promise.all` (O(3N) sequential → O(N) rounds). Live-verified the parallel bands match the sequential classification exactly.
- **F4** — `runConsolidation` gained an `inFlight` re-entrancy guard (+ skips while a memorize backlog runs) and re-reads tier groups from current `extras.memory` before applying.
- **F5** — added `engine.getBoundary()`; `buildScoreContext` no longer clones the blackboard snapshot on every injection.
- **F6** — extracted `enqueueExtractorDeltas` (shared by `applyExtractionAudit` and the bridge); the supersession bridge now enqueues deltas directly instead of routing a synthetic read through `applyExtractionAudit`, so it no longer pollutes `extras.extraction.audits`/`lastReadBoundary`.
- **F7** — removed the dead `arcRelevance * 0` scorer term (field retained for plan 09).

### Retro live validation addendum (2026-07-06)

Real-LLM retro (see [retro-live-validation.md](retro-live-validation.md)): deferred story-loaded P4 chain shipped+proven — `plan08-hygiene.json` 10/10: live embedding dedup, supersession, REAL bridge DELTA fired a transition, WI round-trip.
