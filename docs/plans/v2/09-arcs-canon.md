# Plan 09 — Arcs + Derived Canon

## Objective

Full arc lifecycle (open → resolved + summary, pinning), the arc→convergence bridge, and the derived canon that replaces canon-lite behind the same `getCanon()` interface — after which the background generator reads drift-free synthesized context with zero changes to plan 05 code.

## Context

- Spec: §Memory subsystem (arcs, canon, bridges), §Convergence (arc increment), §Background generation (canon consumer).
- Consumes from 07/08: stores, shared-read tags, scorer, scheduler P4. From 03: `canonLite.ts` (to be replaced). From 06: convergence loop.
- **Base**: Smart-Memory `arcs.js` (lifecycle, pinning), `canon.js` (synthesis) — port to `src/memory/`.

## Scope

**In**: arc tier, resolution detection + summaries, pinning, arc→convergence declared increments, canon derivation + swap-in, arc-relevance term in 08's scorer.
**Non-goals**: epistemic/ledger (10), arc authoring UI beyond debug panel (Studio 11 may expose read-only).

## Deliverables

- `src/memory/arcs.ts` — port lifecycle: arc entries opened from shared-read tags (`[arc …]`), tracked with status; resolution detection per Smart-Memory approach (tag or P2/P4 pass); on resolve → summary generated (P4), arc closed, summary feeds canon. Pinned arcs persist across scene/session expiration.
- Arc→convergence bridge: a story may declare `arc_bridges[]: {arcMatch, anchor, amount}` (schema extension in `schema.ts` + validate) — on arc resolution the engine applies the declared progress increment via the apply queue (source mechanical, evidence = resolution summary); the increment enqueue happens immediately at confirmed resolution — code-side work, independent of deferred P4 summary/canon generation. Spec already allows this; keep authored-only (no generator-created bridges).
- `src/memory/canon.ts` — port synthesis: resolved-arc summaries + high-importance facts → prose canon block, regenerated on P4 cadence and on arc resolution; deterministic given same inputs where Smart-Memory's is (if theirs uses an LLM pass, keep it but cache by input hash so replay is stable — record which).
- Swap: `getCanon()` now returns derived canon (fallback to canon-lite composition until first derivation exists). Plans 05's generator and critic consume unchanged — add an interface test proving signature/semantics.
- Scorer: arc-relevance term activated (08 placeholder).
- Suite-B fixtures: arc open/resolve sequences; canon content assertions (must_contain resolved-arc keywords).

## Implementation notes

- Resolution must be conservative: unresolved-forever is annoying, false-resolution is worse (it feeds canon). Follow Smart-Memory's thresholds; surface unresolved-arc count in the memory panel.
- Canon regeneration is P4 — under pressure it defers; `getCanon()` always returns the last good value synchronously.

## Validation gate

1. Baseline green; suite-B arc/canon fixtures pass; `getCanon()` interface test green (05 untouched).
2. Fixture: arc with declared bridge resolves → `progress_toward_<anchor>` increments (audit shows mechanical source + summary evidence) → anchor gate opens where extractor alone wouldn't have.
3. Canon regeneration cached-by-hash proven: same inputs, byte-identical canon in replay.
4. Live: plant an arc in play (scripted), resolve it, watch summary + canon update in the memory panel; background generation after resolution cites canon content (audit record of generator input).

## Delegated decisions

Arc tag grammar details (stay close to Smart-Memory); resolution thresholds; canon prompt wording; `arc_bridges` matching semantics (id vs keyword — record).

## Gate record

Date: 2026-07-05

Executed as milestones M0–M6 (per plan): M0 re-vendor + types, M1 arc extraction/lifecycle, M2 resolution summary + convergence bridge, M3 derived canon + `getCanon()` swap, M4 scorer arc-relevance, M5 UI/tooling/scenario, M6 gates + live. M2/M3 gated together (the `runArcSummaryPass → regenerateCanon` chain is one flow).

Command outputs (final, cumulative):
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run debug:typecheck`: passed.
- `npm test`: passed, **20 suites / 1180 tests** (up from 18 / 1157 at plan 08 — new: `src/memory/{arcs,canon}.test.ts`; extended `src/memory/score.test.ts`, `src/runtime/runtimeManager.test.ts`, `src/extraction/scheduler.test.ts`).
- `npm run build`: passed with pre-existing size warnings only (`dist/index.js` ~377 KiB, up from 362).

Live checks (SillyTavern at `http://127.0.0.1:8000/`, shared session, `--sandbox`):
- `node scripts/debug/so-scenario.mts run test/scenarios/plan09-arcs.json --sandbox`: **9/9 steps passed.** End to end against real ST: two `[arc]` lines open two arcs via one shared-read audit; a `[resolved]` line resolves the granary arc (conservative best-match); the declared `arc_bridges` increment enqueues code-side and, on `commitBoundary`, drives `progress_toward_reveal` to 2 → the `reveal` anchor gate fires (`activeCheckpoint: reveal`, convergence `reached: true`) where the extractor alone never touched it; `runArcSummaryPass` writes the resolved-arc summary and regenerates canon; `getCanon()` **and** the `{{story_canon}}` macro both return the derived canon ("granary mystery was solved"). Story removed and scratch chat deleted on cleanup; the fixture declares no roster/cast so no group `disabled_members` state was mutated.
- `so-state current` clean post-run.

As-built:
- **Re-vendored** `arcs.js` / `canon.js` / `profiles.js` from the pinned commit `194a011b6b4ecbc0cd347ae8b6e59a6c1a56021a` (plan 07 had pruned them; `profiles.js` inspected for canon inputs but not ported — canon draws on resolved-arc summaries + high-importance facts only).
- `src/memory/`: `arcs.ts` (pure lifecycle — `applyArcSignals` dedup jaccard ≥ 0.4 / resolve best-match jaccard ≥ 0.25, `matchArcBridges`, `rollbackArcs`, `capResolvedArcs`, pin/remove/summary ops), `canon.ts` (`buildCanonSummaryPrompt` story-level port + `canonInputHash`), `parse.ts` `parseArcLine`, `contract.ts` arc addendum + `buildArcSummaryPrompt`, `score.ts` `arcRelevance` term activated (weight 1.0, max jaccard vs open arcs). `types.ts`: `ArcEntry`, `ParsedArcSignal`.
- `src/extraction/`: `ParsedSharedRead`/`SharedReadResult`/`SharedReadContract` gain `arcs`/`openArcs`; `parse.ts` collects `[arc]`/`[resolved]`; `sharedRead.ts` + `contract.ts` thread open arcs into the prompt + hash; `scheduler.ts` host gains `getOpenArcs()` and forwards `result.arcs` to `applyExtractionAudit`.
- `runtime/`: `MemoryRuntimeState` gains `arcs: ArcEntry[]` + `canon: CanonState | null` (sanitized on hydrate, rolled back with the tiers). `applyExtractionAudit(audit, facts, memory, arcs)` applies arc signals; `onArcsResolved` enqueues the batched-per-anchor mechanical `progress_toward_<anchor>` increment (source `code`) and fires an arc-resolved listener; `runArcSummaryPass` (P4) writes summaries then `regenerateCanon`; `getCanon()` returns derived canon with canon-lite fallback (swapped in at the expansion site — plan 05 untouched); `regenerateCanon(force?)` caches by `canonInputHash`. `index.ts` schedules the P4 arc-summary job on resolution and refreshes canon at the tail of `runConsolidation` (P4 cadence). `macros.ts` adds `{{story_canon}}`. `getArcs`/`getOpenArcs`/`setArcPinned`/`removeArc` handle methods.
- UI (`index.tsx`): `ArcCanonPanel` in the memory drawer — open/resolved arc lists with summaries, pin/remove, and the derived canon block.
- Tooling: `so-state` memory block gains `openArcCount`/`resolvedArcCount`/`arcSummaryCount`/`canonPresent`/`canonHash`; `so-scenario` gains `arcs` and `canon` expect verbs; `test/scenarios/plan09-arcs.json`; README + `gotchas.md` updated with the new handle methods and the `storyOrchestratorDebug{ArcSummary,Canon}Response` globals.

Decisions recorded (delegated):
- **Arc grammar**: `[arc] <text>` / `[resolved] <ref>` bracket lines ride the single shared read (parsed by `parseArcLine`; opening deduped, resolution matched in `applyArcSignals`).
- **Resolution**: conservative — an explicit `[resolved]` resolves only the single best-matching open arc at jaccard ≥ 0.25 (Smart-Memory resolves *all* ≥ 0.25; narrowed to best-match so collateral false-resolutions can't feed canon). Open-arc dedup at jaccard ≥ 0.4. Min arc length 15. Resolved-unpinned arcs capped at 30.
- **Canon**: LLM prose synthesis (spec-mandated), cached by FNV hash of the resolved-arc summaries + high-importance (≥2) facts; identical inputs skip the model → byte-identical in replay (unit-proven). Falls back to canon-lite until the first summary exists.
- **`arcMatch`**: case-insensitive substring match against the resolved arc's text (arcs are LLM-derived, no stable ids; authors write a keyword such as `granary`). Increments summed per anchor within one read.

Deviations from plan:
- **Scheduler memory-drop bugfix (in scope, same call path)**: `runtime/index.ts` wired the scheduler host's `applyExtractionAudit` as `(audit, facts) => …`, silently dropping `result.memory` on the *automatic* (cadenced) read path — memory only landed via the forced `runExtractionNow`. Fixing it for arcs required forwarding the full tuple; now `(audit, facts, memory, arcs) => …`, so cadenced reads apply memory tiers **and** arcs. Latent pre-existing bug, corrected here.
- **Canon is story-level**, not Smart-Memory's per-character; **cross-chat persistent arcs dropped** (Smart-Memory persists arcs to character/group settings — out of scope; arcs live per-chat in `chat_metadata`).
- **`ArcEntry` carries no separate `evidence` field** (the arc text is self-evidencing); the bridge audit's evidence is the arc text/summary.
- **Bridge increment applied via the apply queue as a batched absolute delta** (`current + Σ amounts` per anchor per read) rather than one delta per resolved arc, so two same-read resolutions to one anchor cannot collide under monotonic equality. Residual edge (two separate reads resolving to the same anchor before a single boundary commit) is minor and unobserved; reads are ~per-boundary.

Not carried into 09 (left for later plans per scope): epistemic/ledger tiers (10); arc authoring UI beyond the debug panel (Studio 11); semantic (embedding) arc dedup — the jaccard thresholds ported from Smart-Memory's fallback path are used, embeddings deferred.

### Post-review fixes (self-review pass, 2026-07-05)

A full code review of the as-built plan-09 work surfaced six findings; all fixed (harness re-green: typecheck, lint, `debug:typecheck`, build, **`npm test` 20 suites / 1185 tests** [+5], and live-reverified against real ST):

- **F2 (correctness, was MEDIUM) — bridge increment could be permanently lost on reload.** The original design enqueued the mechanical `progress_toward_<anchor>` delta into the non-persisted apply queue at resolution time; a reload before the next boundary commit dropped it, with no recovery (progress qualities are `code`-source, so the extractor can never re-derive them). **Redesigned to a commit-driven, idempotent model:** `onArcsResolved` no longer touches the blackboard; instead `commitBoundary` derives *pending* bridges from persisted arc state (`resolved && !bridgeApplied && matches a bridge`), enqueues one batched delta per anchor, and — atomically with the same commit persist — marks those arcs `bridgeApplied: true` (new `ArcEntry` field). Reload simply re-derives pending on the next commit → no loss; monotonic re-apply is a no-op → no double-count; this also removes the original multi-read-same-boundary collision edge. New tests: reload-recovery + idempotent re-commit (`runtimeManager.test.ts`).
- **F3 (MEDIUM) — open arcs were unbounded in state and injected into every extraction prompt.** `renderArcContractSection` listed *all* open arcs each read. Added `openArcTexts(arcs, limit)` (pinned-first, most-recent-N; `ARC_OPEN_INJECT_LIMIT = 8`) used by `getOpenArcs()` and `buildScoreContext`, plus `capOpenArcs` (`ARC_OPEN_CAP = 40`, drops oldest unpinned) applied alongside `capResolvedArcs`. Bounds prompt cost and the scorer's per-entry arc loop. Unit tests added.
- **F4 (low/med) — derived canon went stale after rollback.** `rollbackFromMessage` now clears `extras.memory.canon` when the resolved-arc set shrank (drop/reopen), so `getCanon()` falls back to canon-lite rather than citing a rolled-back resolution until the next P4 refresh. Integration test added.
- **F1 (test lock) — scheduler forwarding.** Added a `scheduler.test.ts` regression case (mocking `runSharedRead`) asserting the read job forwards `result.memory` **and** `result.arcs` to `host.applyExtractionAudit` — locking the pre-09 latent-bug fix (`index.ts` forwarding the full tuple). The broadened behavior (cadenced + reconcile reads now write memory/arcs) is intentional; coverage-dedup + jaccard arc-dedup absorb overlap.
- **F5 — coverage.** Added runtime tests for arc-bridge reload recovery, canon-on-rollback, and the scheduler forwarding, plus arc open-cap / inject-cap unit tests.
- **F6 — polish.** Extracted `highImportanceFacts(limit)` shared by `runArcSummaryPass` and `regenerateCanon`; `buildScoreContext` now guards `openArcs` by the memory-enabled flag.

Live re-validation: the script-driven `so-scenario` runner was blocked by an ambient welcome-screen state (no chat loaded, recent-group nav found nothing), so the core plan-09 flow was re-run via deterministic `browser_evaluate` against the real runtime on the freshly-built `dist` — two arcs opened, the granary arc resolved (Mira stayed open), the F2 commit-driven bridge drove `progress_toward_reveal → 2` and fired the `reveal` gate with `bridgeApplied: true`, the arc summary + derived canon + `{{story_canon}}` macro all resolved. Imported story and chat metadata restored afterward (no residue). The scheduler forwarding change is otherwise locked by the F1 unit test; a script-runner re-pass of `plan07-memory.json` + `plan09-arcs.json` is the recommended first step next session once a group chat is open.

### Retro live validation addendum (2026-07-06)

Real-LLM retro (see [retro-live-validation.md](retro-live-validation.md)): `plan09-arcs.json` 9/9 re-run (blocker was a viewport/drawer tooling bug, fixed); `live-plan09-arcs.json` 10/10 via real scheduler P4 lane — real arc summary, real canon synthesis, `{{story_canon}}` resolves.
