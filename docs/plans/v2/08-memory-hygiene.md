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
- `src/memory/consolidate.ts` — per-tier: new entries vs consolidated base → drop / fold / keep. Embeddings via port of `embeddings.js` (their `nomic-embed-text` pathway; verify which ST/vector endpoint they call and adapt — record findings); fallback keyword-overlap from `similarity.js`. Runs P4 on cadence.
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
