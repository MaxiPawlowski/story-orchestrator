# Plan 03a — Hardening (post-review of plans 01–03)

## Objective

Fix the correctness defects found by the plans-01–03 implementation review, pay down the deferred test and live-validation debt, and land the pending extraction amendments — so plan 04 starts on a sound base. No new features beyond the listed fixes.

## Context

- Read first: Gate records of plans 01, 02, 03 (as-built truth + deviations), spec §Turn loop & commit semantics (incl. Chat mutations), §Extraction scope, §Off-path scheduler.
- Review findings this plan resolves are numbered H1–H8 below; each maps to a gate check.
- Baseline at plan start: `typecheck` clean, 17/17 tests green (verified 2026-07-05).
- **Prerequisite for the live burn-down**: plan 03b-devtools executed (provides `st-session`, `so-scenario`, swipe/edit/delete + `wi-status` + `st-payload` verbs this gate uses). Code fixes (H1–H7) may proceed before 03b.

## Scope

**In**: the fixes below, their tests, the live burn-down, `.claude` rules skeleton refresh, LIVE eval baseline.
**Non-goals**: pacing (04), generation (05), memory tiers (07+). No schema changes beyond those listed.

## Deliverables

**H1 — Boundary ↔ message-id mapping (the cross-cutting fix).**
- `EngineHost` gains chat context: `commitBoundary(context: { lastMessageId: number; chatLength: number })` (or host callback — builder picks, record). Each boundary-log entry and snapshot records `lastMessageId`.
- `refreshMechanicalQualities`: `message_count` = host `chatLength`, not `boundary + 1`.
- `runtimeManager.rollbackFromMessage(messageId)`: map to the newest boundary whose recorded `lastMessageId` < messageId; **fast-path no-op** when no applied queue entry's `turnRange.to ≥ messageId` and no transition fired at a later boundary (spec §Chat mutations). Swipe-browsing must stop triggering rollbacks.
- Extraction windows: `sharedRead` default window and `reconcile` window derive from recorded message ids (e.g. last read's message id, checkpoint-entry boundary's recorded message id) — never from raw boundary numbers.

**H2 — Flush pending apply queue on rollback.** `rollbackTo` clears pending entries whose `turnRange` overlaps the reverted range (simplest correct: flush all pending; the post-rollback P0 re-read regenerates).

**H3 — Latch at terminal value only.** `blackboard.applyDelta`: latching engages when a bool becomes `true` (not on any first write); non-bool latching qualities latch on any write as today (document) or via explicit delta flag — builder picks, record. Test: latching bool written `false` then `true` succeeds without `strictUnlatch`.

**H4 — Scope includes snapshot qualities.** `deriveScope` adds keys referenced by the active checkpoint's and all reachable checkpoints' `state_snapshot`s (same latched/source filters). Spec already updated.

**H5 — Extraction amendments (from plan 03 §Amendment).** Stability lag: P1 windows exclude newest K messages (default 1, configurable); P0 includes everything. In-flight guard: windows never include a streaming message; window text snapshots at dispatch.

**H6 — Small fixes.**
- `rollbackTo` truncates `boundaryLog` past the restored boundary.
- Type `npc_replies` in schema per spec §Talk Control (trigger/member/kind/maxTriggers/probability).
- Add `arc_bridges?` to Story schema (validated shape `{arcMatch, anchor, amount}`, consumed plan 09).
- Scheduler: bounded retry with backoff on client failure; persistent failure → settings warning + extraction paused, mechanical play continues.
- `canonLite`: pass real fired transitions from engine `stateLog` (drop the empty-array placeholder).
- afterSpeak: exclude replies the effects applier itself injected (track last self-injection message id) — cascade currently bounded only by `maxTriggers`.
- Stamp facts with `{boundary, messageId}` at accept time (rollback cleanup + plan 07 backlog depend on it).
- `basisVersion` (sum of per-quality versions): rename or comment intent.

**H7 — Test debt.**
- Property tests (fuzz or table-driven): monotonic never decreases; latched bool never reverts without strictUnlatch; writes invisible between boundaries; **rollback ≡ never-applied** (apply, fire, rollback, replay same post-rollback script → identical state).
- Reconciliation recovery fixture: cadence golden misses a quality → stall fires → targeted re-read golden recovers → transition fires.
- 2–3 additional suite-A extraction fixtures (grow toward plan 13's ≥20 corpus).

**F9 — `.claude` rules refresh (skeleton).** `CLAUDE.md` + `.claude/rules/architecture.md` still describe the deleted v1 engine; rewrite to v2 as-built (engine/runtime/extraction layout, STAPI facade unchanged, gate-record protocol). Concise — plan 13 polishes.

## Validation gate

1. `npm run typecheck && npm run lint && npm test && npm run build` green; new property + reconciliation + fixture tests green.
2. **Live burn-down** (the deviations deferred by plans 02/03 — all destructive/real this time, via 03b's verbs; ship each as a `test/scenarios/*.json` where the step vocabulary suffices):
   - Real swipe: advance a checkpoint on an extractor delta, swipe the triggering message → `so-state.mjs` shows checkpoint + blackboard reverted, P0 re-read scheduled, new swipe content re-extracted; swipe-browsing without state impact does NOT roll back.
   - Real delete: same expectations.
   - WI toggle on a disposable lorebook entry.
   - Two-member group round: gate opens after member 1 → member 2 generates under new effects; record observed semantics.
   - LLM npc reply via `/trigger` fires once, counter persists.
3. `LIVE=1 npm test` with a configured Connection Manager profile; record model + suite-A live exact-match score in the Gate record (plan 13 baseline).
4. Gate record: H1 mapping design as built, all H-item outcomes, deviations if any.

## Delegated decisions

Host-context shape for commitBoundary; non-bool latch semantics (record); flush-all vs overlap-flush on rollback; K default plumbing; backoff constants.
