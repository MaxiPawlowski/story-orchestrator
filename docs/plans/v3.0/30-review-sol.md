# v3.0 30 — Sol review of the harvest plans (2026-10-30)

Reviewer: gpt-6.1-sol, reasoning high, `codex exec -s read-only` on worktree `C:/dev/so-harvest-plans` (tree at
`29c1267d` + the new plans). Source/doc inspection only; no gates, GPU or campaign access. Claims spot-checked against
`src/` before applying (`memoryInjector.ts:125-133`, `clock.ts:85-95`, `suggestionAnchors.ts:140-150`,
`snapshotBuilder.ts:280-290`, `consolidationMatches.ts:26-36`).

## Summary of findings

- Fix first: 35 "last seen" not derivable (logs hold no historical present cast; presence = enabled minus schedule);
  34/35/36 assume permanent history (logs keep 200); 32's read moves at most one day part, so a narrated skip leaves the
  clock behind and due events are not interrupted; 33 deferred arcs would vanish from suggestions and threads are already a
  player surface; 36 read health confused legitimate empty output with failure and lacked telemetry (audits 20, no
  route/model); 37 Retry via `runNow` bypasses single-flight, yield gate waits for the inner beat not the reply, idle has no
  chip (standing chip = rollback); 38 H3 targets a person-creation op that does not exist, H7 misses self-matches; 34 needs a
  real lore binding (20 binds visual packs only) and chapter folding already edits the history copy; index cited a missing
  review file.
- Invariants: rating floors incomplete in 32/33 (need >= 25 blind pairs, flags, thinking closure) and absent for 38 H1/H2;
  31 wrongly claimed narrator rows are resting-filtered (they are an omniscient channel); 33 needs reversible event
  history; 34 notes must not be recomputed from today's disclosure; 31's `WITHHOLD` is not a lifetime; 32 opt-in conflicts
  with on-by-default.
- Overlap: 35 S1 is another `sceneView` consumer; 35/36/34 share one historical-time design; 32 reuses 19 + v2.8 50 B2;
  33 amends v2.9 06; 37 lives in 29 + v2.9 09; 31 rates against v2.8 54 / v2.9 02.
- Vacuous floors: 38 H3 initials, 36 "±1 vs offline scorer" (no such scorer), 38 H4 listed non-switches and an unconsumed
  witness slice, 37 enum coverage is not causality, 31/34 percentages without frozen positive counts.
- Order: 38 (trimmed, H4/H6 first), 35, 37, 33, 31, 36, 32, 34.

## Applied

- 31: narrator channel described as omniscient (clause is not a secrecy guarantee); explicit swipe-note lifetime (render,
  abort, failure, chat switch, nested generation) + tests; frozen positive counts, >= 10 control positives before a
  percentage floor; S2 floors gain flags + thinking closure; overlap with v2.8 54 / v2.9 02 noted.
- 32: rewritten: time decided in code (option A one day part via the read, option B new `time_skip` writer with detector;
  owner decision), due work interrupts at the first due point (narrow G10), reuse of 19 reservation/replay/voice start,
  on by default with author opt-out, >= 25 blind pairs vs a typed-request control. Size S-M -> M.
- 33: rewritten: defer/reopen as an ordered event history (rollback restores prior state, cycles covered); deferred arcs
  stay in suggestions as `dormant-thread`; player `openThreads` handling an owner question; no timed return by default;
  full rating floors; v2.9 06 F1-F3 rerun; prefix measured, not assumed.
- 34: chapter folding acknowledged; notes computed from the boundary's own disclosure state and cached, explicit unknown
  past the log floor, tests for delayed read / later disclosure / boundary 200; new authored `requirements.place_lore`
  binding; S0 thresholds for both S1 and S2; place-description diagnostic dropped (guide line only); reasoning kept on strip.
- 35: "last seen" parked with the reason and the shared design to reopen it; spans stamped on the chapter record at seal
  (survive log eviction, explicit unknown for old records). Size S-M -> S.
- 36: S3 redesigned (telemetry first: route/model + requested sections; parser failure, malformed, empty counted apart,
  empty never a failure); vacuous floor replaced; learned-at parked.
- 37: inner beat named as the yield-gate wait; Retry through the scheduler (joins or enqueues, one accepted result);
  causal fixtures + concurrent-Retry floor; generic fade dropped, rollback chip given its own end.
- 38: H3 dropped; H4 enumerated from `featurePolicy.ts` with positive controls, witness excluded; H7 self-filter; H1/H2
  gated on recorded-call replay + CL with the rating question to the owner; landed by gate class.
- 30: order replaced by Sol's; this file added; opt-in alternative for 32 removed; owner decisions updated.

## Declined

- None outright. Partly: Sol suggested keeping 31/34 only as measurement-led candidates; kept as plans with S0 measurement
  gates that stop a slice on a low baseline (same effect, keeps the build sketch for when S0 passes).
