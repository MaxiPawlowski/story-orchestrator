# v3.0 30 — Harvest plans index (2026-10-30)

Owner 2026-10-30: "create plans on 3.0 for the cool things worth taking a look that you've found? is there any other thing
that would be worth trying maybe from a previous review or something we deferred?"

Inputs: `extension-research-2026-10-30/SUMMARY.md` + reports; `v2.8/extension-research-2026-10-21/SUMMARY.md` §2 and
`niches.md` top 10; `v2.8/61-harvest-triage-2026-10-14.md`; `v2.9/01-triage-sol.md` V3.0 rows; `v2.9/00-overview.md`
§Deferred to v3.0; `v2.9/13-close-out.md`. Each candidate re-checked against `src/` on master `29c1267d`.
Review: `30-review-sol.md` (gpt-6.1-sol, read-only); fixes applied to every plan.

## New plans (all PLANNED 2026-10-30, none built), in value/effort order

1. **38** `38-side-pass-hygiene.md`: off-means-unseen goldens per real switch, no empty labels, two extension conflict rows
   first; then JSON repair, bounded retry feedback, nested vector thresholds. S each. (Naming hint dropped.)
2. **35** `35-here-now-and-last-seen.md`: Here now sheet tab (another `sceneView` consumer), story-time spans stamped on
   chapter records. 29 phase 2. S, no prompt change. ("Last seen" parked.)
3. **37** `37-honest-pipeline-and-feature-rows.md`: HUD names what a read waits on, scheduler-safe Retry; feature rows say
   model and writes; rollback chip ends. 29 phase 2. S-M.
4. **33** `33-deferred-threads.md`: a topic the player put off stops being pushed; reversible defer/reopen events, kept in
   suggestions as dormant. M, read change + rating.
5. **31** `31-outward-narration-and-swipe-contrast.md`: narrator voices only what the player could observe; a swipe sees
   the reply it replaces as a negative. Measure first; S build, M rating.
6. **36** `36-author-secret-grid-and-read-health.md`: author-only who-knows grid + on-stage info row; read failures per
   route/model (telemetry first). M, no prompt change.
7. **32** `32-player-skip-ahead.md`: "Skip ahead" control through 19's one-shot direction, time decided in code, due work
   interrupts. M.
8. **34** `34-place-and-time-grounding.md`: fixed time/place notes on scene-break messages, place lore pinned by an authored
   binding, self-contained place descriptions. M, measure first, rated.

Rated slices (31, 32, 33, 34) share one GPU + rating window when the owner allows it.

## Not mine: suspected defects (owned by branch `v3.0-harvest-1030-fixes`)

Regenerate after a trailing system row; story macros dead after an engine flip; chapter-fold IGNORE hole on CC; archive
recall on the reply path; display-only qualities never read; optional held-secret filter defaults. Not planned here.

## Considered, not planned

- Already built or planned: niches top 10 voice sheet (v2.9 02), sifting threads (v2.9 05), grounded suggestions and
  stakes preview (v2.9 06), delayed echoes (v2.9 07), whispers (v2.9 08), remark bank / hot-button tiers / norms (v2.9 04),
  Here now scene card (v2.8 65, extended by 35), "your move" chip (v2.8 68), stepped history (v2.8 63), stopped partial
  reply policy (decided, v2.8 69 K13), slow-burn caps (v2.8 51), outcome tables (v2.8 49 G19), story-time core (v2.8 50;
  display in 35), live-suite interval/no-change fixtures and holdouts (E01/E02 folded into v2.8 35/24; castward P5 only
  confirms), post-generation revision (17 stays off; lattice dropped its own after a day: one line of evidence for 17).
- Dropped after the Sol review: seeded naming hints (no op creates a person; `living/types.ts:35`), a generic idle-chip
  fade (idle shows no chip; the standing chip is rollback status, fixed in 37 S4), a place-description diagnostic
  (landmarks are legitimate), a timed automatic return of deferred threads as a default (owner question in 33).
- Parked after the Sol review: observed "last seen" (35) and learned-at story time (36): boundary logs hold no historical
  present cast and keep 200 entries; reopen with one evidenced sighting/provenance design shared with 34's notes.
- Rejected with evidence in the reports: portrayal-object second call, shared Stop aborting side passes, model-called NPC
  creation tool (CC only), per-place generated backgrounds (20 packs are the authority), persona start sheet, main-API
  fallback, single-pass in-reply tracking, auto-reminder lines in the read prompt, whole-list memory rewrites, percent
  progress meter, removing V03 phrase avoid lists.
- Parked with a trigger: idle timeout for streamed side calls (bb-map P2: reopen when timeouts show tokens still flowing),
  scan-only name variants (bb-map P3: lean skip), raw-offset reasoning mask (tavernos P5: no consumer), per-swipe state on
  `extra` (stat-tab P3: only if SP1 passes S4), on-demand sub-pass over a range (memory-books P2), condensation
  feasibility pre-check (one line in v2.8 69 K1 if K1 gets a size rule), clamp after rounding (fold into 20 resolver tests).
- Dropped: relative-age labels on memory lines (vectfox 10-21 P5): text changes every turn, conflicts with 13 prefix
  stability.
- v2.9 V3.0 rows stay on their triggers (G01 attempts, G10 time-jump interrupt, N09, N10, N16, N19, V06, V07, M04, G05);
  32 S3 takes only the narrow "stop at the first due point" part of G10.
- v2.9 13 close-out misses are track D rows (00 §Replan), not re-planned.

## Owner decisions needed

1. Blind Sol ratings for 31, 32, 33, 34 (each >= 25 real prompts, decision-4 bar): run them in one window when the GPU is
   free?
2. 32 S2: skip spans at most one day part through the existing read (A, recommended), or a new `time_skip` writer (B)?
3. 33: should a deferred thread ever return on its own (timed), or only when the player mentions it (default)?
4. 38 H1/H2: count director/wizard output as player-facing (then blind rating before adoption), or gate on recorded-call
   replay + CL (default)?
5. Story sheet in a real second window (stat-tab P2, BroadcastChannel, player projection only): after 29 IC5, yes/no?
6. New player surfaces from earlier harvests, each on your explicit request only: player-safe character diary at chapter
   seal (M01), player authors their own feelings/thoughts (simulation-blackboard P1, touches 54 inner voice), named player
   inner voices (N23), per-member typography (N26).
