# Plan 24 — v2.8 test plan: feature → validation matrix, a capped real-model budget, Adolion golden sessions

**Status (2026-10-14, rework): WRITTEN, not run.** Owner 2026-10-14: no 60 hours of pod time for the tests; proper
scenarios on the Adolion campaign; the right validations and test cases. This rework replaces the plan sections below
(rules, per-plan index, final suite, sessions, budget). The plan as it stood this morning is Appendix A. Overview:
`00-overview.md`. Sources: `35-test-coverage.md`, `32-queue.md`, `40-build-now-no-gpu.md` §Deferred acceptance
protocols, `31-v27-wrap-backlog.md` (M/R rows), `v2.7/39-test-from-zero.md`, `v2.7/39a-parallel-runs-and-coverage.md`,
`test/phase-c/manifest.json` (204 rows), `test/phase-c/pod-estimates.json`.

**New budget (§Budget):** Artemis acceptance 9.4 h + informational at most 2.5 h = **12 h cap**, on one 3090 lane in
two nights plus the media night's share (pod optional, about EUR 4). Cloud (CL) about 28 lane-hours with no GPU,
DeepSeek capped at EUR 15. 3090 image time about 9 h, listed apart. Old estimate: about 100 Artemis lane-hours.

## Rules

1. **Tiers.** D = jest, Storybook, payload goldens, no-model browser scenarios. S = scripted judge or `debugResponse`
   plumbing: allowed for plumbing only, never sign-off of a model-consuming path. CL = cloud models: DeepSeek or Sol
   as reply/memory/authoring, TypeSafe as judge. LT = the local text route on the 3090. LI = ComfyUI on the 3090
   through the broker. RP = Artemis v1.1 replies (3090 at 32K, or a pod).
2. **Cheapest honest tier** (proposed, owner Q1). A model-consuming path needs a real-model check. Artemis (RP) is
   required only when the assertion reads Artemis's reply text or depends on the llama.cpp request path: thinking and
   its budget, thought leaks and empty replies, preset overlays, agency and narration quality, persona in replies, the
   scenario block in replies, living-card looks, talking sprites, prompt cache. When the assertion reads the pipeline
   (reads, judge calls, boundaries, payloads, rollback, UI), the reply is a carrier and a cloud reply (CL) validates it
   honestly. Every such move is listed in §Cuts and merges.
3. **Acceptance vs informational.** Acceptance rows are pass/fail on behaviour ("the assertion holds in both runs");
   they run ×2 and must be green. Informational rows carry a rate or rater floor; owner 2026-10-09 made every floor
   informational, so they run ×1, are recorded, never retuned, and may be deferred with a reopen trigger. A row moves
   to informational only for a stated reason (§Cuts and merges), never by changing its floor.
4. **One golden session, many rows.** A golden session is a journey on an adolion-fresh lane that plays one campaign
   story with generic player lines and checks many features in one chat; each journey check names the rows it closes.
   Journey checks fail independently, so one run gives a per-feature record. Checkpoints are found by structure
   (`effects.scenario`, `effects.preset`, `complications`, chapters, the product's `liv_` prefix), never named.
5. **×2, consecutive, one lane**, run header diffed around each batch. Run 2 reuses run 1's setup: the lane is
   seeded once with `adolion-fresh seed`, a never-run snapshot is taken (39a S1), and run 2 starts from that snapshot
   (owner Q3; otherwise a 10 min re-seed per run, +0.3 h in all).
6. **Carried evidence** (owner Q2). A row with an evidence pair recorded on or after 2026-10-10 keeps it if
   `git diff --stat <evidence commit>..<candidate> -- <the row's code paths>` is empty; otherwise it re-runs in its
   carrier. Carried rows are listed in §Phase C manifest.
7. **Offline before live.** A measurement whose inputs a golden session already records (judge tails, chat files,
   payload captures) is scored from those records, not from a dedicated play (J6d-style replay).
8. **Unchanged:** floors predeclared and never retuned; thinking and inner voice on; every built feature on by default;
   English only; group chats only; lanes 30+ for no-model work, never the owner's ST or lane 0; at most
   `SO_MAX_LLM_LANES` (2) model lanes; images and sprites off except in the media block; no ComfyUI from other lanes.
9. **Privacy.** Golden sessions name campaign groups and story ids only (both already public); player lines are
   generic; records and transcripts go to `so-sessions`; reports to the owner use counts. Campaign content review goes
   to a second model, never the owner.
10. **A written fixture is not a passed gate.** The golden sessions and smoke files below are validated by the loader
    and have never run; their first run on a model lane is a shakedown. A harness defect found there is fixed and the
    row re-run ×2 (39a triage).
11. **Readiness before the suite** (owner 2026-10-14). No golden session, smoke batch or Phase C row runs until
    all three checks below are recorded green in §Gate record (lists, counts only):
    - **Campaign scenarios and data.** Every row whose carrier is a golden session, AS-smoke or a campaign `lab/`
      scenario has the story structure it needs in the pinned campaign (`adolion-fresh.pin.json`): the checkpoint
      shapes, qualities, quests, life, stretches, encounters and lab copies its checks find by structure, plus every
      model-lane scenario it names. Check: campaign `scripts/check_all.sh` green, `lab/v28/check.py` resolves every
      group, member, story, checkpoint and mocked delta, `adolion-fresh check <lane>` 0 problems, and a
      row → carrier → campaign file list with no gaps. Missing data is added in the campaign repo (pin bump +
      reinstall), never faked in a fixture. Content review goes to a second model (rule 9).
    - **Plugin docs current.** Every built feature in the registry has its guide topic and settings page up to date:
      `copilot/guideCoverage.test.ts` and the guide drift test green, `npm run docs:guide` and `npm run docs:settings`
      leave no diff, and each merged plan since the last check (including 41, 52, 46, 47, 53, 60, 54) has its user
      guide section and Gate record. A feature whose docs lag is listed, fixed, then the check re-runs.
    - **Coverage is complete.** Every feature id in `src/features/` maps to at least one row in §Feature → validation
      matrix, every row names a carrier that exists (journey check, scenario file, jest file or measurement row),
      every planned test case in the plan docs' floor tables maps to a row or is listed with a reason in §Cuts and
      merges, and every newly merged plan (42–69) moves from §Planned features into the matrix when built. A
      generated coverage report (registry ids × matrix rows × carriers × plan floors) is attached to the record;
      an unmapped feature or floor is a red check, not a footnote.
12. **Image track closes first; the suite is text** (owner 2026-10-14). Image generation (LI rows, GS5, plan 33
    pose bodies, plan 36 frames and live-head rows, plan 41 journeys, reference views, cast illustration, changed
    looks, plan 28 broker legs) runs as its own close-out track: the 3090 block of 2026-10-14 plus at most one
    image close-out session. Its results are recorded per row and the track is then closed; what it cannot finish
    is listed as deferred with a reopen trigger, not carried into the suite. The real-model suite (golden sessions
    GS1–GS4, AS-smoke, targeted scenarios, measurements) then runs with `image.enabled` and `sprites.enabled` off
    and covers text and everything it drives: replies, thinking and inner voice, reads and memory, judge, director,
    quests and game layer, UI and rollback. GS5 is not part of the suite. The Adolion X6 animation job (about 36 h)
    is outside both and waits for the owner.

## Budget

Throughput basis: the 3090 serves one lane at 32K. A 98-turn SP6 cell with the judge on took 3 h 54 min, about
2.4 min per player turn (31 §3090 measurements, item 4). Campaign golden sessions are budgeted at 3.0 min per player
turn (more voices per turn), the Saga at 3.5, the synthetic two-member group at 2.5. A cloud turn is budgeted at
1.5 min. Seed 10 min per lane per night; snapshot restore 2 min per run.

### Old estimate (why it read as about 60 hours)

- v2.7 manifest rows needing Artemis: 79.7 lane-hours ×2 from `pod-estimates.json` (82.3 with resets per
  `node scripts/suite/pod-schedule.mjs`, about 42 pod-hours at two lanes, USD 30). By block: SP6/stretch 20.0,
  B1 arms 25.2, other C5 11.5, journeys 6.5, 38-C7 6.0, agency/warden 5.8, images 4.7.
- v2.8's own measurements (M21–M25, R1–R12) about 13 lane-hours; plans 42–53 RP legs about 5.
- Total about 100 Artemis lane-hours: about 50 pod-hours at two lanes, or 60 h of wall time with resets and pod
  starts.

### New budget

Artemis acceptance (×2 each, one 3090 lane):

- GS1 first hour: 14 generations × 3.0 + 6 = 48 min per run, 96 min.
- GS3 long road: 17 × 3.5 + 6 = 66 min per run, 132 min.
- GS4 stubborn player: 12 × 3.0 + 4 = 40 min per run, 80 min.
- GS5 media, Artemis share: 10 × 3.0 + 5 = 35 min per run, 70 min (night N3).
- T-R4 reply effort: 8 × 2.5 + 2 = 22 min per run, 44 min; J13 reply effect 10 min per run, 20 min.
- Campaign model scenarios (other agent, acceptance turns): commit-model 12 min per run, 24 min; encounters-model
  6 turns + one real pool, 20 min per run, 40 min.
- Seeds 3 × 10 and 14 snapshot restores × 2: 58 min.
- **Total 564 min = 9.4 h.** Plans 42–59 add about 0.3 h when built (checks folded into GS1–GS3, §Plans 42–59).

Artemis informational (×1, cap 2.5 h in the suite, priority order; anything over the cap is deferred with its
reopen trigger):

1. T-Q3 check narration (36-Q3), 10 turns on a synthetic checks story: 25 min.
2. Encounters-model M2 tail (35-M2 campaign arm): 21 min.
3. Over-steer card (33-W2-oversteer), 40 turns as a `so-session` charter: 120 min.
4. When built: 51 R7/R9 (about 25 min), 53 F7 (25), 43 VR7/VR7p (30), 47 P7/P7h (60, LT). Candidates 55 M7,
   56 G7, 57 U7, 58 K7, 59 B7 (about 25 min each, LT or RP, lab story) only if the owner queues and builds them.

CL (cloud reply and memory, Sol authoring, TypeSafe judge; no GPU), lane-hours with ×2 included:

- GS2 living hub ×2: 70 min. AS-smoke, nine stories ×2: 190 min.
- Journeys J1–J3, J5–J12, J6-W1 on the cloud reply ×2: 356 min (measured medians; J7 is 46 of them).
- Targeted CL acceptance rows ×2 (§Targeted scenarios): about 880 min.
- CL informational ×1 (M18, M19, briefing drafts, rated packs): about 195 min.
- **Total about 1,690 min = 28 lane-hours**, 14 h of wall time on two lanes (one lane while the 3090 runs).
- Cost: about 600 cloud generations at about 30K input tokens each with their passes: about 18M input and 1.5M output
  tokens. At DeepSeek list prices of about USD 0.27/M in and 1.10/M out that is about USD 7. **Cap EUR 15, stop and
  ask at 150 %.** The provider's usage page and `so-session budget` decide, not this estimate. Sol is the owner's
  subscription. TypeSafe: about 12 calls per turn over about 1,000 turns, about 12,000 calls; **cap 20,000 calls.**

LI (3090 image time, apart from the Artemis cap): about 9 h. GS5 renders 90 min, pose product Acceptance ×2 120,
32-W1/W2/W3 60, 32-W5 builder/cancel/cleanup/base 60, 32-W6 frames and 16-18 40, 38-D13b/D13c/assets 45, C6-stage 20,
plan 41 changed-look bust and rig ×2 60, plan 36 LI5 campaign rigs 30, 16-20 local card (LT) 15. Informational and
deferred: 16-19 S28 (60), plan 28 LT latency re-run (30).

D: day 0 and parallel with everything (no-model lanes do not count against `SO_MAX_LLM_LANES`).

Optional pod (owner Q7): P1 moves both Artemis nights to one RTX PRO 4500 pod with two lanes: about 5 h of wall time,
5.5 pod-hours with start and stop, about USD 4.0 (EUR 3.7). P2 runs the deferred 98K rows (B1-HIST, B1-PFX/R7 with
`--swa-full`), which need more VRAM than the 3090 or the RTX PRO 4500 hold at 98K: card and price read from
`get-capacity` first, roughly EUR 6–10, deferred.

## Schedule

- **Day 0 (no GPU, no model).** Freeze the candidate (C0-freeze). `npm run gates` with Storybook ×2 (C1-gates),
  `npm run test:release` (C1-release), the ratchet (C1b). Payload goldens C0 and the C3 diffs. `adolion-fresh seed` on
  lane 1 (Artemis), lane 2 (CL) and no-model lanes 30–34; snapshot each seeded lane. No-model corpus (C2) ×2 on lanes
  30–34 in parallel, about 3 h of wall time; J0, J4, J14; 16-07; 38-G-campaign; the other agent's campaign no-model
  scenarios ×2 (§Targeted scenarios).
- **Night N1 (3090, 8 h).** GS1 ×2, GS4 ×2, T-R4 ×2 then J13 ×2, campaign commit-model ×2 and encounters-model ×2:
  about 5.4 h with seed and restores. Then informational: the over-steer card ×1 (2 h). Lane 2 (CL) in parallel:
  journeys J1–J12 ×2, about 6 h.
- **Night N2 (3090, 8 h).** GS3 ×2, T-Q3 ×1, encounters M2 tail ×1: about 3.3 h. Then LI spill: pose product
  Acceptance ×2 (2 h). About 2.7 h of slack for triage re-runs (39a: a re-run is the row ×2, never a partial). Lane 2:
  GS2 ×2 and AS-smoke ×2, about 4.3 h.
- **Night N3 (3090 images, 8 h).** GS5 ×2 with Artemis through the broker, then the LI rows (§Budget LI).
- **Days D1–D2 (CL, two lanes, no GPU).** Targeted CL acceptance rows ×2 (about 7.3 h of wall time), CL
  informational ×1 (about 3 h).
- **Offline (no lane).** B1-C3/B1-C12 (`so-b1-judge-causes.mts score` over the GS judge tails), B1-EMPTY (chat files
  and spike records), M10/M12 counts, R9 J6d extractor leg, R10, 37-L6-C and 37-M1-C5 offline replays, rating packs
  to the second-model rater.
- Pods: none by default. P1 replaces N1 and N2's Artemis blocks if the owner wants one night instead of two.

## Golden sessions

All on adolion-fresh at the pin of the run, shipped defaults, run header captured before and diffed after each batch.
Journey files under `test/journeys/` (public: group name and story id only). Each journey check lists the feature ids
and rows it closes; the journey's per-check outcomes are the per-feature record.

### GS1 — the first hour (`gs1-first-hour.journey.json`)

adolion-academy (12 checkpoints, 15 cast, 6 quests, 5 widgets, 2 chapters, a scenario effect), group by name, RP
lane. 12 player turns, 1 regenerated swipe, the opener and a briefing draft; 48 min per run.

- GS1.1 start: library, inner voice and judge on, images off; briefing shown (a real draft on the authoring route),
  identity step locks a persona, the opener waits for it, the player role block once in the prompt. Closes stories,
  group-binding, story-briefing, briefing-draft, player-setup; 34-RP, S-06, 34-L-flow/34-L-fixed live.
- GS1.2 four real turns: replies render, kept thoughts present, no thought markup in visible text, empty replies
  counted, thinking not silent, audits land, inner-voice calls counted. Closes reply-thinking, inner-voice,
  talk-chain, hud, inline-notes, memory; O9.
- GS1.3 reads open a quest (or, after 6 turns without, an author write does and the record says which); Journal,
  Stat sheet and panels fill; player-clean. Closes quests, journal, stat-sheet, story-panels; 36-pilot-academy,
  38-C7-quest, 36-P-live real read.
- GS1.4 author jump to the scenario checkpoint, two turns, the scenario block in the prompt and a ledger row. Closes
  story-scenario; O13, R11.
- GS1.5 a member with authored relationships drafted: private block applied; player-clean. Closes character-life,
  private-knowledge; 37-spoiler live.
- GS1.6 swipe (real regeneration) and delete; no rollback refusal; checkpoint kept. Closes branches; S-10.
- GS1.7 jump into the next chapter with "Seal it": a real seal record and a player chapter title. Closes chapters,
  chapter-cards, recap.
- GS1.8 page reload: story back, identity not re-offered, persona lock held. Closes 34-L-reopen live, 16-05 reopen.
- GS1.9 player Ask answers and names no unreached checkpoint; player-clean. Closes ask; M20 re-check, 33-W4-spoiler
  partial, O2.
- GS1.10 (human) start-pane copy read by the second model, counts only. Closes 34-copy (informational).

### GS2 — the living hub (`gs2-living-hub.journey.json`)

adolion-aegis (living, 40 cast), CL lane. 17 player turns and 1 swipe; 35 min per run.

- GS2.1 a `liv_` checkpoint after 4 player turns (code pace fallback opens a way in after 3). Closes living-story,
  road-ahead; M21 functional (L1 premise start).
- GS2.2 three on-script turns: judge calls by use, committed branches recorded. Closes judge-use-divergence; M22/R1
  (informational), 33-W3-live.
- GS2.3 two off-script turns, then swipe and delete: branches before and after recorded, no rollback refusal.
  Closes story-branching; M23 L2 and F26.
- GS2.4 the living author view (Author view on, then off): applied ops, prefetch, canSave. Closes M23 L4,
  save-run-as-story availability (the save itself is the L5 leg in §Targeted scenarios).
- GS2.5 a real curator pass and its proposals in review; player-clean. Closes curator, curator-create,
  curator-markers, judge-use-curator-filter; O7, O14, M17 functional.
- GS2.6 lore calls per loud turn; no story book selected globally. Closes story-lorebooks, lorebook-switching,
  late-lore, memory-lore, judge-use-lore-select, judge-use-lore-exclusive; M10 (informational).
- GS2.7 a scene shift and three group turns: talk decisions and life proposals; player-clean. Closes
  character-life, meanwhile-proposals, speaker-direction, judge-use-director, continuity-warden; M16 functional,
  38-C7-life.
- GS2.8 close-out turns and player-clean sweep. Closes repair, 16-04 live.

### GS3 — the long road (`gs3-long-road.journey.json`)

adolion-saga (157 checkpoints, 125 cast, 12 chapters, NPC replies, cast changes, preset effects, a schedule, a clock,
living), RP lane at 32K. 17 player turns and 3 OOC lines; 66 min per run.

- GS3.1 four multi-voice turns: talk decisions, speakers, effect ledger, audits. Closes stories, talk-chain,
  speaker-direction, effects; 36-pilot-saga start, 38-C7 Saga unit.
- GS3.2 two OOC lines posted without generation, a read asked for: no read call. Closes S-19, S-19-OOC,
  S-19-OOC-b.
- GS3.3 clock moves over boundaries; away-notice block counted when a scheduled member is away. Closes 37-S19,
  37-Q3 live occurrence, plan 50 T11 when built.
- GS3.4 jump to a preset checkpoint, one turn: the sampler overlay applied to the loud request. Closes effects
  (preset on llama.cpp).
- GS3.5 three turns: `liv_` checkpoints and how many were reached. Closes living-story on Artemis; M21 Artemis half
  (anchors, informational under the L1 floor).
- GS3.6 five turns: no context-over-server, memory entries, canon, failed model calls. Closes memory, memory-tab,
  models-per-task, judge-use-memory-verify, judge-use-memory-pairs; S-17 live occurrence.
- GS3.7 reload of the long chat: story back, blob readable, one more turn. Closes recap, 38-C7 reopen.

The long tail past turn 18 is not played: the 32K overflow (X1) already passed ×2 on the 3090
(`live-f20-long-chat`).

### GS4 — the stubborn player (`gs4-stubborn-player.journey.json`)

adolion-esha (7 cast, agency policies on 7 checkpoints, 3 complication sets), RP lane. 12 player turns and 1 OOC
line; 40 min per run.

- GS4.1 start on shipped defaults (warden on, agency notes auto).
- GS4.2 two declared-outcome turns: agency/warden judge calls and journal rows. Closes judge-use-agency-check,
  continuity-warden; C4-R6 functional (the rubric rating is informational).
- GS4.3 two refusals: agency recovery state; player-clean. Closes the agency policy row.
- GS4.4 two hedged turns: values latched by a read on those turns counted. Closes judge-use-typed-extraction on
  hedges (the campaign's guarded values stay in the other agent's commit-model scenario).
- GS4.5 jump to a checkpoint with complications, three quiet turns: complication block in the prompt; player-clean.
  Closes experiments (SP6 release on the production path), judge-use-idle-check, judge-use-stall-check; 35-P3-K2,
  35-K2 re-check.
- GS4.6 an OOC line in a tense scene, then a turn; player-clean. Closes S-19-OOC-b, 33-D-clean live.

The 40-turn over-steer card (33-W2-oversteer) is a separate informational `so-session` charter run on the same lane.

### GS5 — pictures and faces (night N3, existing LI drivers)

Not a new journey: the plan 28/29/33/36/41 LI drivers and `so-ui.mts` sprite actions, on the campaign act whose cast
has installed sprite packs at the pin (default the Saga main cast, 38-assets-saga), images and sprites on through the
broker, Artemis replies. 10 player turns ×2. Closes images, sprites, sprite-animation, expressions, pictureCue,
gpu-sharing, story-workflows, pose-library, live-head, prepared-presentation, changed-look-rebuild,
cast-illustration; O3–O6, 32-W8-S32-1 (stop at 15 mentioning replies, 39a S6), 32-W6-stream (text-driven lip-sync,
queue N11), 32-W7-look, S32-2-lifecycle, C6-stage. The remaining LI rows run after it in the same night.

### AS-smoke — every story starts (`live-v28-24-smoke-<act>.json`, nine files)

One file per campaign story, group pinned by name, CL lane: start, requirements ready, three real turns with a reply
each, a boundary per reply, no lost save, reload, swipe, player-clean. ×2, 10.5 min per story per run. Closes
38-C7 (counts only), C8-smoke, 16-07-A6 live. Run as one batch:
`st-lanes.mts batch --lanes 2 --repeat 2 --strict test/scenarios/live-v28-24-smoke-*.json`.

## Targeted scenarios

RP (Artemis):

- T-R4 `test/scenarios/live-v28-24-reply-effort.json` (synthetic group): off/low/medium/high, two turns each; every
  request during a reply generation carries the level's budget (1/128/400, none at high), no other request carries a
  budget key. Closes R4-live, reply-thinking. The off level is part of R4-live's predeclared assertion and is restored
  by the runner.
- J13 reply effect (existing journey), back to back with T-R4.
- Campaign side, owned by the agent on `v2.8-adolion-in-step` (campaign branch `v2.8-adolion-in-step-2026-10-14`,
  uncommitted at the time of writing): `lab/v28/v28-adolion-commit-model.json` (3 real turns; guarded values never
  latch on a hedge; C11-F2 model leg) and `lab/v28/v28-adolion-encounters-model.json` (13 real turns; open opening and
  a real encounter pool; 19 RP acceptance and the M2 campaign arm). Proposed split, for that agent: the first 6 turns
  and the real pool are acceptance ×2, the remaining 7 turns are the M2 tail ×1.
- T-Q3 (informational ×1): 10 public check attempts on a synthetic checks story (`test/scenarios/v27-36-quests.story.json`
  or a variant); a second model rates whether each reply reflects the outcome. The campaign authors no checks.

CL (cloud reply unless noted; ×2 each unless informational):

- Journeys J1, J2, J3, J5, J6, J6-W1, J7, J8 (with C4-J8's house-rules on/off arms), J9 (Sol), J10, J11 (with its
  judge-off arm), J12.
- O10, O11, O13b (Sol), O16 (Sol), 33-W1-V3/V4/V5, 33-W1-V7-live, 33-W2-J8.10.
- Privacy block: S-07, S-08, S-11, S-12, S-13 on one synthetic planted-secret story.
- Suggestions block: 10 runs, no unreached name (33-W4-spoiler, plan 04 C5); 33-W4-useful rated ×1.
- C8b-stranger (with O1 merged): a fresh lane, the installed guide only, first rendered reply.
- Plan 09 live: a real Ask answer, a wizard tool call and a vision request on Sol (40 §Deferred).
- Plan 13 shipped J7 consumers on TypeSafe ×2 plus the judge-off arm (canonVerify, canonDraft, idle/tone/adversity).
- Plan 34 lore-select character eligibility, real TypeSafe leg.
- Plan 22 L1/L5 leg (the pod-round fixture `l1-l5.json`, cloud reply): Save as story lands with unreached checkpoints
  left out; delete-4 graph rollback and reopen equal the fold. Its synthetic copy is
  `test/scenarios/live-v28-22-l1-l5.json` (2026-10-14).
- M16, M17, M20 only if Q2 rejects carrying their pod-round evidence.
- Informational ×1: M18 Ask Q&A re-score and M19 wizard recipes at 60/36 (Sol), plan 10 briefing 30 drafts (spoilers
  0/30, preference ≥ 70 % by a second model), O15 campaign copy review, C14-b, 33-W3-N1, 33-W3-combined, 37-M1-C5,
  37-L6-C, 32-W6-seam, 32-director-payload, R9 J6d extractor leg, R10 cue/scene A/B.

D (no-model lanes, day 0): the corpus (C2 rows), payload contracts (C3, PC-*), plan 40 §3 scenarios, B6 scenarios,
the campaign no-model scenarios (`v28-adolion-commit-per-value`, `-commit-read-as`, `-open-stretch`, `-panels`,
`-regex-keys`; other agent), J0, J4, J14.

## Feature → validation matrix

Every feature in `src/features/registry.ts` (109 entries: 41 core, 3 start, 17 image, 11 presence, 5 game, 2 life,
3 living, 27 judge uses). "D" names the deterministic evidence (owed or recorded); the last column names the
real-model carrier, or why none is needed.

| Feature | Cheapest honest tier | D evidence | Real-model carrier |
|---|---|---|---|
| stories | RP + CL | C2 corpus, 16-07 | GS1–GS4 start, AS-smoke |
| group-binding | CL | 16-03, 16-07-A6 | AS-smoke |
| story-drawer | D | Storybook, C2 | none: no model |
| hud | RP | 16-04 | GS1.2 |
| inline-notes | RP | C2 inline scenarios | GS1.2 |
| transition-notes | D | C2 (off by default) | none: no model |
| recap | RP | C2 | GS1.7, GS1.8, GS3.7 |
| branches | RP | branch_create scenarios | GS1.6 |
| pacing | D + RP | pacing jest, PC payloads | GS (tension recorded, informational) |
| memory | RP + CL | memory jest, rollback ≡ replay | GS1.2, GS3.6; live suite (CL) |
| memory-tab | D | C2 | GS3.6 player-clean |
| chapters | RP | 16-06 | GS1.7 real seal |
| continuity-warden | RP + CL | PC-agency-notes | GS4.2, GS2.7 |
| speaker-direction | RP + CL | talk jest | GS3.1, GS2.7 |
| talk-chain | RP | voiceStart, talkChainYield | GS1.2, GS3.1 |
| private-knowledge | RP + CL | PC-privacy, secret reviews | GS1.5; S-07/08/11/12/13 (CL) |
| inner-voice | RP | inner jest | GS1.2, GS1.5 |
| thought-carry | D + CL + RP | thoughtCarry review test, v28-a13-thought-carry (no-model, live run owed) | GS1.5 player-clean with the spike on (L5-RP3 half); L5-RP1 coverage read owed (informational) |
| lorebook-switching | CL | scanGate scenarios | GS2.6 |
| story-lorebooks | CL | storyLore scenarios | GS2.6 |
| memory-lore | CL | v28-40-provisioning-roundtrip | GS2.6 |
| late-lore | D | v28-35-lore-placement ×2 | R7 cache: deferred (P2) |
| curator | CL | 16-02-C13 | GS2.5 (O7) |
| curator-create | CL | v28-35-curator-create ×2 | GS2.5; M17 carried |
| curator-markers | CL | 16-02-C13, A19 scenario | GS2.5 (O14) |
| judge | CL | judge plugin tests | every GS, J11 |
| judge-local | D | v28-40-local-judge-uncalibrated ×2 | play-load deferred to v2.9 (A7) |
| road-ahead | CL | expansion scenarios | GS2.1, J11 |
| studio | D | Storybook (135 suites), mobile long-press ×2 | none: no model |
| wizard | CL | J14 (no model), tools tests | O13b, O16, J9, plan 09 live (Sol) |
| character-tutorial | CL | Storybook | O16; M19 recipes (informational) |
| author-view | D | assert-player-clean everywhere | none: no model |
| diagnostics | D | Studio diagnostics tests | none: no model |
| repair | D | 16-04 | GS2.8 |
| getting-started | CL | 16-01-in-app-walk | C8b-stranger |
| help | D | 30-D1..D3, C2-rendered-targets | none: no model |
| ask | CL | v28-09-ask-player-clean (S) | GS1.9; M18 (informational); M20 carried |
| memory-test | CL | settings tests | C8b-stranger |
| reply-thinking | RP | replyEffort jest, 16-08 | T-R4, GS1.2 |
| models-per-task | D + CL | 16-02-C14 | routes recorded in every run header |
| capabilities | D | capabilities jest | none: no model |
| experiments | D + RP | spike tests, K3 sim | GS4.5; SP6 measurements deferred |
| story-briefing | RP | 16-05 | GS1.1 |
| briefing-draft | CL | v28-10-briefing-draft (S) | GS1.1; 30-draft floors (informational) |
| player-setup | RP | 34-L-* | GS1.1, GS1.8 |
| live-head | LI | plan 36 A1 rows ×2, liveHead jest | N3 (LI2, LI5 campaign rigs); LI1 laptop deferred |
| prepared-presentation | LI | plan 41 D slice: visualPreparation jest | N3 |
| reference-pack | LI | referenceViews jest | N3 (image track, rule 12) |
| changed-look-rebuild | LI | plan 41 D slice: lookRebuild jest | N3 |
| landmark-cross-check | D + CL | rig tooling node:test | Sol calibration ×6 carried (N12) |
| cast-illustration | LI | plan 41 D slice: castScene jest | N3 |
| pose-library | LI | plan 33 suites: poses jest, stageBodies | N3 product Acceptance ×2; rater 40/40 ×2 carried |
| backgrounds | D | backgrounds jest (effects.background idempotence) | none: no model |
| story-scenario | RP | 16-02-C1, PC payloads | GS1.4 |
| images | LI | 32-W4-scenario, C1-clean-host | GS5 (O3–O6) |
| gpu-sharing | LI | broker node:test | plan 28 LI ×2 carried; LT latency informational |
| story-workflows | D + LI | v28-40-workflow-findings ×2 | plan 29 brokered ×2 carried |
| model-downloads | D | downloads node:test (fake providers), downloadCopy jest | real download deferred (needs a token and the owner's OK) |
| sprites | LI | VnStage tests | GS5 (C6-stage) |
| sprite-builder | LI | builder contract tests | N3 (32-W5) |
| sprite-mouth-region | LI | mask import tests | N3 (32-W6-frames) |
| sprite-edit-resolution | LI | SpriteRenderControls Storybook | N3 |
| sprite-animation | LI + RP | lipsync jest | GS5 (32-W6-stream) |
| story-badges | D | 16-06 | none: no model |
| story-card | D | 16-06 | none: no model |
| continue-list | D | 16-06 | none: no model |
| chapter-cards | D + RP | 16-06 | GS1.7 |
| story-wand | D | 16-06 | none: no model |
| roll-chips | D | 36-spoiler-sweep | T-Q3 (informational) |
| activity-panel | D | v28-04-presence-panels | none: no model |
| suggestions | CL | v28-04 scripted | suggestions block (10 runs), GS1.9 |
| repetition-readout | D | repetition jest | none: no model |
| guide | D | 30-D*, docs drift tests | none: no model |
| open-stretches | D + RP | v28-19 scenarios ×2, 35-P2 | campaign encounters-model |
| journal | RP | 36-Q5-scn, campaign panels | GS1.3 |
| stat-sheet | RP | 36-P-live | GS1.3 |
| story-panels | RP | v28-23-widgets ×2 | GS1.3 |
| story-made-panels | D | html widget tests, Storybook | none: no model |
| quests | RP | 36-Q5-scn, S-16 | GS1.3, GS3.1 |
| character-life | RP + CL | 37-D1..D3 | GS1.5, GS3.3, GS2.7 |
| meanwhile-proposals | CL | agenda proposal tests | GS2.7; M16 carried |
| living-story | CL + RP | v28-35-living-rollback ×2 | GS2.1–GS2.4, GS3.5 |
| story-branching | CL | v28-40-living-divergence-prefetch ×2 (S) | GS2.3 |
| save-run-as-story | CL | living tests | L5 leg `live-v28-22-l1-l5` (CL) |
| judge-use-director | CL + RP | judge director tests | GS2.7, GS3.1 |
| judge-use-memory-verify | RP | — | GS3.6 |
| judge-use-memory-pairs | RP | — | GS3.6 |
| judge-use-scene-trigger | RP | scene tests | GS3.3 |
| judge-use-scene-tracker | RP | scene tests | GS3.3 |
| judge-use-lookahead | CL | — | J11, GS2.1 |
| judge-use-lore-select | CL | provisioning roundtrip | GS2.6; plan 34 TypeSafe leg |
| judge-use-curator-filter | CL | — | GS2.5 |
| judge-use-typed-extraction | RP | commit guard tests | GS4.4; campaign commit-model |
| judge-use-stall-check | RP | — | GS4.5 |
| judge-use-expansion-critic | CL | — | J11, GS2.1 |
| judge-use-expansion-lookahead | CL | — | J11 |
| judge-use-agency-check | RP | PC-agency-notes | GS4.2 |
| judge-use-house-rules | CL | — | J8 with C4-J8 arms |
| judge-use-warden-lore | CL | — | GS2.6; B1-C3 offline |
| judge-use-lore-exclusive | CL | — | GS2.6 |
| judge-use-expressions | LI | — | GS5 |
| judge-use-attention-check | CL | — | GS2.2 (33-W3-live) |
| judge-use-warden-voice | RP | — | GS4.2; 37-L6-C offline |
| judge-use-divergence | CL | living divergence scenario (S) | GS2.2, GS2.3 |
| judge-use-canon-verify | CL | v28-40-judge-consumers (S) | J7-consumers block, GS3.6 |
| judge-use-canon-draft | CL | v28-40-judge-consumers (S) | J7-consumers block |
| judge-use-picture-cue | LI | not runnable no-model | GS5 |
| judge-use-adversity-trend | CL | v28-40-judge-consumers (S) | J7-consumers block (20 samples) |
| judge-use-idle-check | RP | v28-40-judge-consumers (S) | GS4.5 |
| judge-use-tone-check | RP | v28-40-judge-consumers (S) | GS4; over-steer card |
| judge-use-repetition-check | D | v28-40-judge-consumers | none: no judge call |

Every judge use also gets the judge-off column through J11's off arm (CL).

### Planned features (plans 42–59, not in the feature registry yet)

Rows for plans written but not built (54 is built on a branch, 55–59 are candidates). The proposed ids join the
registry, and the 109-id check above, when a plan is built. Floor ids are the plans' own; detail in §Plans 42–59.

| Plan feature | Cheapest honest tier | D evidence | Real-model carrier |
|---|---|---|---|
| 42 witness record (B) / message filter (C) | CL (B), D + CL (C) | C: F1, F5–F7 payload goldens | B: W4 family + RB1–RB4 CL offline ×2; C: F3 (J5 + J6 cloud), F2a/F2b folded into GS1, GS3 |
| 43 verbatim recall | CL | VR4, VR4c, VR4x | VR1–VR3, VR8 CL offline ×2; VR6r read in GS1/GS3; VR7/VR7p informational ×1 (RP) |
| 44 rumors | D + CL | G1–G6, G9–G14 | G7/G8 CL ×2 (20-case fixture); G6 live read in GS3 if the campaign adopts rumors; G15 CL (stage 2) |
| 45 New Game+ | D | N1–N6, N8–N13 | N7 deferred (needs two finished source runs; LT replies, CL rater) |
| 46 consequences recap | D | C1–C6, C8–C10 | none: no model pass (A) |
| 47 promises | D + CL | P2r, P3–P5, P4a, P4d | P1, P1s, P2, P2w, P6, P8 CL ×2; P7/P7h informational ×1 (LT) |
| 48 director scene test | D + CL | S1–S6, S12, S13 | S7–S9, S11 CL offline ×2 (director route); S10 read in GS2 and GS3 |
| 49 complications (production) | D; RP gated on SP6 | C1–C7, C11 | C8–C10 deferred with SP6 (RP, informational); GS4.5 keeps the spike's functional row |
| 50 story calendar | D + CL | T1–T7, T12–T16 | T8–T10 CL ×2; T11 read in GS3.3 |
| 51 relationship labels | D | R1–R6, R8, R10–R12 | R7/R9 informational ×1 (RP lab story, second-model rater) |
| 52 codex | D + CL | C1–C5, C9–C13 | C7 CL ×2 (wizard recipe on Sol); C6, C8 only with B |
| 53 factions | D | F1–F6, F8, F10–F14 | F7 informational ×1 (RP); F9 CL informational |
| 54 inner voice L5 (`spikes.thoughtCarry`) | D + CL + RP | plan 54 D gates; no-model scenario (live run owed) | L5-CL1..4 CL (FAIL ×2, picker fix, informational re-score); L5-RP1/RP3 read in GS1.2/GS1.5; L5-RP2 blind pack, informational |
| 55 NPC commitments (candidate) | D | M1–M6 | M7 informational ×1 (LT or RP lab story); M8 CL with B |
| 56 social permissions (candidate) | D | G1–G6 | G7 informational ×1 (LT or RP lab story) |
| 57 shared rituals (candidate) | D | U1–U6 | U7 informational ×1 (LT or RP lab story) |
| 58 keepsakes (candidate) | D | K1–K6 | K7 informational ×1 (LT or RP lab story) |
| 59 reconciliation beats (candidate) | D + CL | B1–B5 | B6 CL ×2 (read route); B7 informational ×1 (LT or RP lab story) |
| 62 quantum-ogre probe / prepared facts (candidate) | RP (probe) | Q3; with stage 2 Q5, Q6, Q8 | Q1 informational ×1 (5 cases × 4 replies, about 50 min Artemis); Q1c/Q2 CL; Q4 RP and Q7 CL only with stage 2 |
| 63 stepped history window (candidate) | D + RP | H3–H5, H8 | H1/H2/H7 ride the deferred R2/R7 run (outside the 12 h cap); H6 CL |
| 64 public sheet to the narrator (candidate) | D | S1–S6 | S7 informational ×1 (RP lab story, about 25 min) |
| 65 "here now" scene card (candidate) | D | N1–N8 | none: projection only; session or owner decision for the default |
| 66 authoring quality (candidate) | D + CL | A1–A5 | A6, A7 CL ×2 (Sol) |
| 67 grader hygiene + adversarial fixtures (candidate) | D + CL | G1, G2, G5, G6 | G3, G4 CL ×2 (read model) |
| 68 "your move" chip (candidate) | D | Y1–Y6 | none: derived, no model |
| 69 harvest hardening bundle (candidate) | D | K1a, K2–K10 | K1b CL ×1 (compaction acceptance on recorded windows) |

## Measurement rows

| Measurement | Disposition | Tier | Carrier |
|---|---|---|---|
| M1 (35-K3/K4 run 2) | deferred | RP | with SP6 (plan 49 C8), pod or a free night |
| M2 / R3 (35-K5, ≥ 20 releases) | deferred | RP | with SP6 |
| M3 (B1-C3, B1-C12) | informational | CL | offline from GS judge tails |
| M4 / R4 (B1-EMPTY) | informational | RP | offline count over GS chat files |
| M5 / R5 (B1-NARR run 2, pack) | deferred | RP | pod block |
| M6 / R2 (B1-PFX, B1-HIST) | deferred | RP | optional pod P2 |
| M7 / R6 (S-17, 37-S17) | done | CL | PASS ×2 after F27, carried |
| M8 (local variants) | done | LT | local ×2 recorded; pod re-measure dropped (the 3090 is the play route) |
| M9 / R7 (late lore cache) | deferred | RP | optional pod P2 (`--swa-full`) |
| M10 (lore calls per reply) | informational | CL | GS2.6 + offline |
| M11 (send latency) | done | LT | X2 ×2 |
| M12 (warden timeouts) | informational | CL | offline from GS tails |
| M13 (keyword recall lab) | informational | D | campaign lab offline, counts |
| M14 / R13 (Phase C ×2) | replaced | — | this plan's final suite |
| M15 / R8 (Q-M5/P3, inner voice B2/C, W6, R4, thinking A/B) | deferred | RP + CL | packs from GS replies where the arm is the shipped default; other arms deferred |
| M16 (meanwhile in play) | carried | CL | ×3 green 2026-10-10; GS2.7 re-reads |
| M17 (curator create J8) | carried | CL | ×2 green 2026-10-10; GS2.5 re-reads |
| M18 (Ask Q&A) | informational | CL | Sol ×1 |
| M19 (wizard recipes at 60/36) | informational | CL | Sol ×1 |
| M20 (player Ask in play) | carried | CL | ×2 green; GS1.9 re-reads |
| M21 (living L1 + L5) | acceptance (functional) + informational (anchor floor) | CL + RP | GS2.1–GS2.4, GS3.5, L5 leg |
| M22 / R1 (false divergence) | informational | CL | GS2.2 |
| M23 (L2 branch, L4 prefetch) | acceptance | CL | GS2.3, GS2.4 |
| M24 (living blind pairs, hybrid) | deferred | RP | needs M21 at floor |
| M25 (CC vs TC) | done | RP | owner's blind pack pending |
| R9 (J6d replay) | informational | CL | offline extractor leg ×1 |
| R10 (cue + scene merge) | informational | CL | offline A/B ×1 |
| R11 (SP5 live legs) | acceptance | RP | GS1.4 |
| R12 (SP6 pool) | deferred | RP | with plan 49 C8 |
| R14 (broker retainBatches) | done | LI | PASS ×2 |
| v2.8 01 C3 / C12 | informational | CL | offline (as M3) |
| v2.8 01 C11-F1/F2/F7 | acceptance | D + RP | campaign commit scenarios; GS4.4 |
| v2.8 01 C13-b curator digest calibration | informational | CL | ×1 on a 40+ entry scope |
| v2.8 01 §C V0–V8 | acceptance | D + CL | V0 carried, V3/V4/V5/V7 CL |
| v2.8 01 §D thinking A/B | deferred | RP | blind pack |
| plan 10 briefing floors | informational | CL | 30 drafts ×1 |
| plan 13 J7 ideas live | acceptance | CL | J7-consumers block ×2 + off |
| plan 14 local judge play load | deferred | LT | v2.9 (A7) |
| plan 18 quests M1/M2 | informational | CL | from GS1/GS3 audits |
| plan 19 open stretches M1/M2 | informational | RP | encounters-model tail |
| plan 21 E0 (A12) | informational | CL | offline (5 arms) |
| plan 23 widgets glance (F25) | acceptance | RP | GS1.3 |
| plan 28 LI / LT | done (LI) / informational (LT) | LI | LI ×2 carried; LT median re-run in N3 if time |
| plan 29 two-workflow story | done | LI | brokered ×2 carried |
| plan 30 downloads | deferred | LI | needs a token and the owner's OK |
| plan 33 product Acceptance | acceptance | LI | N2 spill ×2 |
| plan 36 LI1 laptop / LI5 rigs | deferred / acceptance | LI | laptop when available; LI5 in N3 |
| v2.7 20 L5 inner voice spike (A13) | informational | RP | deferred unless the informational cap has room |
| v2.8 01 §F M1–M5 (Q-M5/P3, inner voice B2, inner voice C, W6, Part B packs) | deferred | RP + CL | as M15/R8: packs from GS replies where the arm is the shipped default; other arms deferred |
| v2.8 17 K1, K2 (SP6 release, one block) | carried | D + RP | K1 complication jest replay; K2 = 35-K2 (live-v25-09-sp6-k2, carried); GS4.5 re-reads the release |
| v2.8 17 K3–K5 (SP6 agency, over-steer, tension) | deferred | RP | = 35-K3/K4/K5, with plan 49 C8 (§Cuts 8) |
| v2.8 21 §6.2 VR1–VR5 | superseded | CL | measured as plan 43 VR1–VR4 (CL offline ×2 when 43 is built); VR5 report only, v2.9 05 |
| plan 36 LI3, LI4, LI6 (fault, reduced motion, mobile) | image track (rule 12) | D + LI | owed no-model lane / Storybook rows of plan 36, closed with the image track |

## Cuts and merges

Each with its reason; none changes a floor.

1. 38-C7's nine 2 h units → GS1, GS3, GS4 (Artemis) plus GS2 and AS-smoke (cloud). The units asked "every story
   starts, plays N turns, reopen, rollback, chapter"; AS-smoke asks it of all nine, the golden sessions go deep on four.
2. 38-C7-life, 38-C7-quest, 36-pilot-academy, 36-pilot-saga → merged into GS1, GS2, GS3 (same stories, same checks).
3. O1 → merged into C8b-stranger (same first-reply-from-guidance question; C8b keeps the clean install). C8-smoke →
   AS-smoke.
4. B1-PAR → cut: it sizes `LLM_PARALLEL` on a pod; the plan runs one 3090 lane. Reopens with pod block P1 (15 min).
5. 35-P4-M2, 35-P4-K3, 35-P4-K4 → cut: pressure stays refused (v2.8 19); 35-DROP proves the refusal.
6. B1-C3, B1-C12, B1-EMPTY dedicated plays (about 9 lane-hours ×2 with the empty-reply arms) → scored offline from
   the golden sessions' judge tails and chat files (rule 7). Their floors are informational.
7. J1–J3, J5–J12, J6-W1 → moved from Artemis to the cloud reply (rule 2): their checks read the pipeline. J7's
   synthetic long haul moves too; GS3 carries the campaign's long chat on Artemis. J13 stays on Artemis (preset
   overlay is Text Completion only).
8. SP6 rows (35-K3, 35-K4, 35-K5 and their -C5 re-runs, 35-M2-C5) → deferred, informational: SP6 is an experiment on
   by default; its functional half (a release on the production path) is GS4.5. Reopen: plan 49 C8 or an approved pod.
9. B1-PFX, B1-HIST, R7 → deferred to optional pod P2: they need more VRAM than the 3090 holds at 98K or with
   `--swa-full`.
10. B1-NARR run 2, B1-R4, 37-M3, M24, thinking A/B → deferred, informational: blind packs that need arm runs.
11. ×2 dropped on informational rows: over-steer card, 36-Q3, the M2 tail, rated packs (rule 3).
12. GS3 is not played past turn 18: the 32K overflow (X1) passed ×2 on the 3090.
13. M8's pod re-measure → dropped: the local variant on the 3090 is the shipped play route this month.
14. M16, M17, M20 → carried with the path check (rule 6), re-read by GS2.7, GS2.5, GS1.9.
15. M21 L1 ×2 and M23 L2/L4 dedicated runs → GS2.1–GS2.4 (cloud) and GS3.5 (Artemis).

## Phase C manifest

`test/phase-c/manifest.json` keeps its 204 rows and plan 39 parity; each row now carries
`v28: {tier, carrier, disposition}` and the manifest a top-level `v28` note. `npm run test:release` stays green
(105 pass, 0 fail). Counts: acceptance 160, informational 17, deferred 11, carried 11, cut 4, retired 1.

- D, no-model lanes (51): the C2 corpus rows, 16-*, 29-*, 30-*, 31-G3, 32-W4-scenario, 33-D-clean, 34-L-*, S-04,
  S-05, S-09, 35-P2-*, 36-Q5-scn, 36-P-live, 36-spoiler-sweep, 37-D1..D3, 37-spoiler, 37-Q1, 37-Q2, J0, O2, O8.
- D, payload (12): B0-base, C0-goldens, C3-*, PC-*. D, local (12): C0-freeze, C1-*, C1b-ratchet, 37-B3, O12, 35-ENC,
  35-DROP, 38-G-campaign, Z-docs, Z-attestation. D, adolion-fresh: 16-07-A3A8, 16-07-A6. D, no-model journeys: J4, J14.
- GS1: O9, O13, 34-RP, S-06, S-10, 36-pilot-academy, 38-C7-quest, 34-copy (informational), part of 33-W4-live/spoiler.
- GS2: O7, O14, 33-W3-live, 38-C7-life. GS3: S-19, S-19-OOC, 37-S19, 37-Q3, 36-pilot-saga. GS4: C4-R6, 35-P3-K2,
  35-K2 (carried), S-19-OOC-b (with GS3). GS5 / N3: O3–O6, 32-*, S32-2*, 16-18, 16-19 (informational), 16-20 (LT),
  38-D13b, 38-D13c, 38-assets-saga, C6-stage.
- Merged: 38-C7 (GS1/GS3/GS4 + GS2 + AS-smoke), C8-smoke (AS-smoke), O1 (C8b).
- T-R4 block: R4-live, J13. T-Q3: 36-Q3 (informational).
- CL lane (28): J1–J3, J5–J12, J6-W1, O10, O11, O13b, O16, C4-J8, 33-W1-V3/V4/V5/V7-live, 33-W2-J8.10, S-07, S-08,
  S-11, S-12, S-13, C8b-stranger. CL offline (9): 37-L6-C, O15, C14-b, 33-W3-N1, 33-W3-combined, 33-W4-useful,
  37-M1-C5, 32-W6-seam, 32-director-payload.
- Offline from GS records: B1-C3, B1-C12, B1-EMPTY. Over-steer card ×1: 33-W2-oversteer.
- Carried (evidence pair kept, rule 6): 35-K2, 36-Q1-M2, 37-M1, 37-M2, S-17, 37-S17, 37-L3, 37-L6-C, 33-W1-V0, S-15,
  S-16. Retired: 36-Q1-M1.
- Deferred: 35-K3, 35-K4, 35-K5, 35-K3-C5, 35-K4-C5, 35-K5-C5, B1-R4, B1-PFX, B1-HIST, B1-NARR, 37-M3.
  Informational with a campaign carrier: 35-M1, 35-M2, 35-M2-C5. Cut: B1-PAR, 35-P4-M2, 35-P4-K3, 35-P4-K4.

New v2.8 rows (not in the v2.7 manifest; a v2.8 attestation names them): GS1.1–GS1.10, GS2.1–GS2.8, GS3.1–GS3.7,
GS4.1–GS4.6, AS-smoke ×9, T-R4, the plan 40 §3 and B6 no-model scenarios, and the plans 42–59 rows below.
Proposal: a v2.8 manifest (`test/phase-c/v28-manifest.json`) with these ids, written with the freeze, so plan 39's
parity test keeps guarding the v2.7 file only.

## Plans 42–59 (when built)

Rows join the suite when the plan is built; each lands in the cheapest tier that validates it. D rows close in the
plan's own gates; real-model rows are folded into the golden sessions where they can be. Floor ids follow each plan as
revised on 2026-10-14 (its "Review 2026-10-14 (Astra)" section); 48–59 also carry plan 52's shared contract: an SC1
code-only rollback seed and an SC4 feature-only fixture, both D. A D-floor miss is a defect to fix; a CL/LT/RP miss is
recorded and the feature stays on (00-overview rule 9).

- 42 witness filter: B W4, W4fi, W4fe, W4cov, W4u, W4m, W4a, W4n CL offline ×2 on the lab and real-session label sets
  (acceptance once B is built); RB1–RB4 CL ×2, combined with 47 P8. C (a separate decision): F1, F5, F6, F7 D; F3
  J5 + J6 ×2 on the cloud reply; F2a/F2b (nonce markers, Summarize off, Vector Storage on/off) folded into GS1 and GS3
  runs when C is built (+0.2 h).
- 43 verbatim recall: VR1, VR2, VR2s, VR2t, VR2k, VR3, VR8 CL offline ×2; VR4, VR4c, VR4x D; VR6r latency read in
  GS1/GS3 (no extra turns); VR7/VR7p informational ×1 (20 labelled turns on vs off, 30 min Artemis); VR9 only with F.
  R-Gate1, R-Gate2, R-Gate3 are 43's build gates (21 E0, 21 §6.2, 42 witness record), decided before any VR row runs.
- 44 rumors: G1–G6, G9–G14 D (G6 live read in GS3 if the campaign adopts rumors, else a CL fixture of 30 turns);
  G7/G8 CL ×2 on a 20-case fixture with second-model labels; G15 CL with stage 2 only.
- 45 New Game+: N1–N6, N8–N13 D; N7 deferred (needs two finished source runs; informational).
- 46 consequences recap: C1–C6, C8–C10 D (C1n reported beside C1); no model row (A is deterministic).
- 47 promises: P2r, P3, P4, P4a, P4d, P5 D; P1, P1s, P2, P2w, P6, P8 CL ×2 (scorer and live suite); P7/P7h
  informational ×1 on LT (60 min).
- 48 director scene test: S1–S6, S12, S13 D; S7, S8, S9, S11 CL offline ×2 (frozen frontiers, director route); S10 read
  in GS3 (living on) and GS2.
- 49 complications: C1–C7, C11 D; C8–C10 deferred with SP6 (RP, informational, pod or a free night).
- 50 story calendar: T1–T7, T12–T16 D; T8–T10 CL ×2; T11 read in GS3.3.
- 51 relationship labels: R1–R6, R8 (zero-leak, now D), R10–R12 D; R7/R9 informational ×1 (synthetic lab story,
  20 replies, 25 min Artemis, second model rates).
- 52 codex: C1–C5, C9–C13 D; C7 CL ×2 (wizard recipe on Sol); C6, C8 only with B.
- 53 factions: F1–F6, F8, F10–F14 D; F7 informational ×1 (20 openings, 25 min Artemis); F9 CL informational.
- 54 inner voice L5 (built on `v2.8-a13-l5`, unmerged): D gates green; L5-CL1..4 FAIL ×2, then the picker fix and an
  informational re-score; the no-model scenario's live run is owed. L5-RP1/RP3 read in GS1.2/GS1.5 (no extra turns),
  L5-RP2 a blind pack (informational, ×1).
- Candidates 55–59 (not queued; rows apply only if the owner queues and builds them): 55 M1–M6, 56 G1–G6, 57 U1–U6,
  58 K1–K6, 59 B1–B5 D; 55 M8 (with B) and 59 B6 CL ×2; 55 M7, 56 G7, 57 U7, 58 K7, 59 B7 informational ×1 on a lab
  story (LT or RP, about 25 min each), inside the 2.5 h informational cap or deferred with their reopen trigger.
- Harvest candidates 62–69 (not queued; rows apply only if the owner queues and builds them): D rows as in the Planned features
  table close in each plan's own gates. Artemis: 62 Q1 (about 50 min) and 64 S7 (about 25 min) join the informational list
  after the 42–59 items, inside the 2.5 h cap or deferred with their reopen trigger; 63 H1/H2/H7 ride the deferred R2/R7
  measurement (pod P2 or a free 3090 night), outside the cap. CL: 62 Q1c/Q2 (about 3 h lane time), 63 H6, 66 A6/A7, 67 G3/G4,
  69 K1b. The 12 h Artemis cap is unchanged.

## Sessions and blind packs

- Session cards stay in `test/sessions/charters.json`, played with `so-session` on adolion-fresh lanes, fail-closed.
  In this suite only the over-steer card runs (×1, informational). The other cards (persona start, panels, living
  cards, quests, open stretches, character life, director, free play) are covered by the golden sessions' checks; a
  card runs only if a golden session's record leaves its question open.
- Blind packs are built from recorded replies only (`rating-pack`), shuffled, rated by a second model, never the owner
  for Adolion excerpts. A pack reads "recorded, not rated" until rated. Packs: R4, Q-M5/P3, inner voice C3, W6,
  thinking A/B, plan 10 drafts, plans 42–59 preference legs, M25 (owner's).

## Freeze and attestation

1. Acceptance rows green ×2 on the frozen candidate, or each red row stated with its finding and the owner's decision.
   Informational rows recorded or listed as deferred with a reopen trigger.
2. `npm run build`, `npm run test:release` green; `so-run-header` names the served bundle.
3. Attestation `docs/release/2.8.0/attestation.json` cites archived records only (`test/journeys/records/v2.8/`,
   `test/measurements/v2.8/`, so-sessions paths for campaign evidence).
4. Verdict: ACCEPTED only with every acceptance row green ×2; PARTIAL with reasons otherwise; INCOMPLETE if an
   acceptance row has no evidence pair. Deferred rows go to v2.9 with their reopen trigger.

## Unresolved questions

1. Rule 2: may a cloud reply carry rows whose assertions read the pipeline, keeping Artemis for reply-text and
   llama.cpp-path rows?
2. Rule 6: carry evidence pairs recorded since 2026-10-10 when the row's code paths are unchanged (path diff)?
3. Rule 5: run 2 from a seeded never-run snapshot instead of a fresh 10 min seed?
4. Over-steer card: inside the 2.5 h informational cap, or left to the owner's own play?
5. DeepSeek as the CL reply and memory model (pay per token, cap EUR 15), or Sol only (no marginal cost, about twice
   the wall time, subject to its usage limit)?
6. Pod P1 (about EUR 4) to finish the Artemis blocks in one night instead of two; P2 for the 98K rows now or v2.9?
7. Model downloads (plan 30): deferred until the owner supplies a token and approves the space check?
8. `test/sessions/adolion-stories.json` in this public repo lists campaign checkpoint names (pin `ecccdb78`). Move it
   to so-sessions and purge it from the public tree?
9. The other agent's `v28-adolion-encounters-model`: split into 6 acceptance turns ×2 and a 7-turn M2 tail ×1?

## Gate record (2026-10-14, rework, docs and fixtures only)

- Branch `v2.8-test-plan-budget` from master `431901af`, worktree; no live run, no model call, no GPU, no lane.
- Files: this plan; `test/phase-c/manifest.json` (v28 mapping per row, top-level v28 note); new journeys
  `test/journeys/gs1-first-hour.journey.json`, `gs2-living-hub.journey.json`, `gs3-long-road.journey.json`,
  `gs4-stubborn-player.journey.json`; new scenarios `test/scenarios/live-v28-24-reply-effort.json` and nine
  `live-v28-24-smoke-<act>.json`.
- Loader: `validateFixture` + `validateJourneyExtraction` + `globalsReadButNeverWritten` on every new file: all ok.
- `npm run test:release`: 137 tests, 105 pass, 0 fail, 32 skipped (plan 39 parity unchanged with the v28 field).
- `npm run build` (needed by the run-header test in a fresh worktree): exit 0, bundle `09a274a32d85`.
- `npm run test:debug`: 1,267 tests, 1,267 pass (whole-corpus vocabulary, globals, requires-by-name included). A first
  run failed two tests: the then single AS-smoke file had no `requires.group` (split into nine files pinned by name)
  and the run-header test found no `dist/` before the build.
- Feature matrix checked against the registry by script: 109 of 109 ids, none extra.
- Not run: any lane, journey or scenario; no model, TypeSafe, GPU or pod use.

Addendum 2026-10-14 (branch `v2.8-docs-index-55-59`, docs only): plans 42–59 rows added (§Feature → validation matrix,
planned features; §Plans 42–59 refreshed to the revised floor ids); Appendix A rule 5 (dark launch) annotated as
superseded; plan 52 SC5 resolved.

## Gate record (2026-10-14/15, rule 11 readiness, branch `v2.8-suite-readiness`)

Base master `6616f2e4`; build bundle `080054b70410` staged into the ST slot, server plugins unchanged. Counts only.

Campaign scenarios and data:

- Pin `03441dc3` = campaign master. Checks ran in a clean detached worktree at the pin (the main checkout has
  uncommitted edits by another agent); the gitignored source archive extraction was junctioned in for `build_all`.
- `scripts/check_all.sh` (`SO_PLUGIN` = this worktree): ALL GREEN, 16 steps, 135 s; 9 stories, 307 checkpoints
  through player copy, 146 cards, 13 labs 0 failing.
- `lab/v28/check.py`: OK, 7 scenarios (5 no-model, 2 model) on 5 groups; every group, member, story, checkpoint and
  mocked delta resolves.
- `adolion-fresh seed 41` (needed `--resume` once: two lane starts failed under host load, first the ST frontend
  compile past 300 s, then the browser spawn; fixed in this branch with one start retry and `--resume`), then
  `adolion-fresh check 41`: 0 problems, drift 0; 16 books, 9 groups, 9 stories, 201 sprite folders, 2,889 sprites.
- Row → carrier → campaign file (story structure counted in `build/story/<id>.story.json` at the pin):
  - GS1.1–GS1.10 → `gs1-first-hour` → adolion-academy: 12 checkpoints, 15 cast, 6 quests, 5 widgets, 2 chapters,
    1 scenario effect, relationships on 7 members, briefing and player profile present.
  - GS2.1–GS2.8 → `gs2-living-hub` → adolion-aegis: living on, 40 cast, 1 curator book, 3 required books,
    relationships on 8 members, scene read present.
  - GS3.1–GS3.7 → `gs3-long-road` → adolion-saga: 157 checkpoints, 125 cast, 12 chapters, 110 NPC-reply and
    111 cast-change effects, 2 preset effects, a schedule, a clock, living on.
  - GS4.1–GS4.6 → `gs4-stubborn-player` → adolion-esha: 7 cast, agency on 7 checkpoints, 3 complication sets, a
    schedule.
  - AS-smoke ×9 → `live-v28-24-smoke-<act>` → the nine stories and nine groups, all installed by the seed.
  - C11-F2 model leg, 19 RP acceptance, M2 arm → campaign `lab/v28/v28-adolion-commit-model.json`,
    `v28-adolion-encounters-model.json`: resolved by `check.py`.
  - No gaps; no campaign data added in this pass.

Plugin docs current:

- `npx jest` guideCoverage, guideTopics, `src/guide`, `src/features`: 8 suites, 75 tests, all pass.
- `npm run docs:guide` and `npm run docs:settings`: no content diff (git shows line endings only; reverted).
- Merged plans since the last check: 41 (9 Gate record sections; guide: sprites setup page and story guide carry
  prepared presentation, reference views, cast illustration, changed looks) and 54 (Gate record; guide topic
  inner-voice carries Carried thought). Plans 46, 47, 52, 53 are not merged on `6616f2e4` (built on other branches),
  so they are not owed here; there is no plan 60.

Coverage (`node scripts/suite/coverage.mjs --campaign <pinned campaign>`, report `24-coverage-2026-10-14.md`, guarded by
`scripts/release/suiteCoverage.test.mjs`):

- Registry: 111 ids. Two were missing from the matrix and are added: thought-carry (plan 54), reference-pack
  (plan 41). Vague D cells now name their test files (live-head, prepared-presentation, changed-look-rebuild,
  cast-illustration, pose-library, backgrounds, model-downloads, sprite-edit-resolution, capabilities).
- Result: 108 green, 2 image track (rule 12: judge-use-expressions, judge-use-picture-cue, carried by GS5 only),
  1 red on the first pass, save-run-as-story: its CL carrier, the L5 leg fixture, was owed. The synthetic pod-round
  fixture (a made-up premise, campaign group by name only) is now `test/scenarios/live-v28-22-l1-l5.json`, without its
  DeepSeek role pin; the report then reads 0 red. Written, not run.
- Plan floor tables: 30 plans, 300 floors; 21 were unmapped, now 0: v2.8 01 §F M1–M5, v2.8 17 K1–K5, v2.8 21 VR1–VR5,
  plan 36 LI3/LI4/LI6 (measurement rows added) and 43 R-Gate1–3, VR9 (named in §Plans 42–59).
- Harness defects found by reading the fixtures before their shakedown (rule 10) and fixed with tests: a numeric
  `swipe` on a single-swipe reply always threw, so GS1.6, GS2.3 and the nine AS-smoke files now use `swipeId: "new"`
  (a real generation on the last reply, `st-actions.swipeNew.test.mts`); AS-smoke's post-reload check read a global
  the reload had cleared.

## Appendix A — plan 24 before the 2026-10-14 rework (history)

Kept verbatim (headings demoted). Superseded by the sections above; the RunPod EUR 20 cap and the per-plan index remain as history.

### Plan 23 — v2.8 test plan: per-plan acceptance, the final real-LLM suite, sessions and the freeze

**Status (2026-10-03): v2.8 plan 23 (new). Written; runs last.** Overview: `00-overview.md`. Model:
`v2.6/10-acceptance.md` (phase F, the blind pack, the verdict) and `v2.6/14-tiered-testing.md` (charters, ×2,
findings fixed in place). v2.7's deterministic test plan is `v2.7/16-test-plan.md`; everything v2.7 could not prove is
owed here through `01-v27-carry-over.md`.

#### Rules

1. **Tiers** (00-overview §Gate taxonomy): D, CL, LT, LI, RP. Each plan is accepted at the tier its rows name; a
   deterministic gate never closes a CL/LT/LI/RP row (rule 7).
2. **Measurements when a decision needs them, regression once at the end** (rule 8). A measurement that decides a build
   (a spike, a floor, a calibration) runs inside its plan, ×2, before the build decision. Regression and acceptance of
   built behaviour run in the final suite (§Final suite).
3. **Floors are predeclared and never retuned** (rule 2). A row that misses stays red; the plan says what happens then.
4. **×2, consecutive, on one lane**, run header diffed around each batch (`so-run-header.mts`); a gate is green only
   after both.
5. ~~**Dark launch** (rule 9): a new runtime model use passes its floor twice before it leaves dev-only, then ships off by
   default.~~ Superseded 2026-10-09 (owner): every built feature is on by default, judge uses included, below its floor
   or unmeasured too; a floor is informational (AGENTS.md, 00-overview rule 9). Annotated 2026-10-14 (plan 52 SC5).
6. **Adolion stays unspoiled** (rule 11): Adolion excerpts are rated by a second model, never the user; the user rates
   synthetic rows only, and only if they choose.
7. **Group chats only; tray; models off `C:`** (rules 5, 6): every LT/LI service is started from its tray entry and its
   run asserts `C:\dev\tray\status.txt` OK and no model path on `C:`.
8. **Adolion runs start from `adolion-fresh`** with the pin of the run; images/sprites off unless the row is LI
   (`--allow-comfy`, through the broker, never the shared ComfyUI while another session renders).

#### Per-plan acceptance

"Own" = measured inside the plan when its decision needs it. "Suite" = regression in the final suite.

| Plan | Acceptance tier | Own measurement (×2, before the build decision) | Final suite rows |
|---|---|---|---|
| 01 carry-over | RP, CL, LI, D | §C V0–V8 (SP2 option A), §D thinking A/B, §E R4, §F M1–M5, C3, C12, C11-F2 | **all of §A O1–O15 + O13b** (v2.7's owed rows; O13b = wizard prompt changes from C1; O15 = the A7 briefing content review by a second model; O13 = SP5.b in real replies, O14 = promoted SP8 tiers under a real curator, distinct from C13-b), C4, C13-b, C14-b, C11-F1/F7, §C V3/V4/V8 regression |
| 02 campaign | LI, CL, D | D13d cue reads per turn before/after | lab runs on the pinned campaign; D13b renders QA-equivalent |
| 03 persona | D, RP | S30-1 (scripted opener on a lane) | the injected `player` block in real replies; identity gate before the opener |
| 04 panels | D, CL | — | C5 suggestions (10 runs, no unreached name); C4/C7/C9 (a) live D rows |
| 05 images | LI, CL | discovery + probes | one cue per kind through the ST route and the broker |
| 06 sprite builder | LI | builder contract on 2–3 sets | — |
| 07 talking sprites | LI, CL/RP | S28 (2 vs 3 mouth frames) | a streamed reply animates on a named backend |
| 08 living cards | RP, LI | S32-1 (all arms, ×2, before the default/depth decision and the freeze) | overlay block in replies at the selected depth/default only (regression, no arm comparison); look sprites; deterministic rollback |
| 09 wizard assistant | CL, D | Ask mode projection on the DeepSeek CC profile; §F native tool-call spike (prereqs: v2.7 02 C14 picker/table built, DeepSeek CC profile named, v2.6 plan 11 fixture frozen; floor: arm ≥ text-protocol control on every agent check, 0 unconfirmed provisioning) ×2 | tutorial + Ask on the authoring profile; `profileToolsRoute` agent checks if §F passed and it shipped |
| 10 briefing drafting | CL | spoiler 0/30, preference ≥ 70 % (second-model rater) | the player-path draft on one story |
| 11 curator create op | CL | Phase A per model on frozen fixtures | create op in review mode on the pilot |
| 12 J6d shadow | CL | offline replay | — |
| 13 J7 ideas | CL | Phase A per idea (fixture, offline replay, dev-only until ×2) | uses that shipped off by default: on/off columns |
| 14 open-source Jev | LT, RP | own evals; local provider rows | play-load check on the pod |
| 15 cue/scene merge | CL | A/B on labelled windows | — |
| 16 SP5 | D, RP | C1–C5 dry-run plumbing in groups ×2 (D, no model call) | D: C1–C5 regression; RP: v2.8 01 O13, the scenario block in real replies (decided by the user 2026-10-03) |
| 17 SP6 | RP | SP6 measurement | — |
| 18 quests | CL, RP | M1/M2 reads on the academy lab copy | Journal, visible qualities, public rolls in real play |
| 19 open stretches | RP | stubs measured first; A/B | open mode on the lab stubs |
| 20 character life | CL, RP | M1 (with v2.8 13 N8's judge arm); M2 cost (sets `REL_AXES_PER_READ`); L3 curator-proposal fixture (20 cases, in-goal ≥ 0.85); L6-C voice warden calibration (OOC recall ≥ 0.80, false notes ≤ 0.10) | relationships and schedules in real play; L3/L6 on/off columns if they shipped off by default |
| 21 smart context | CL | E0 (5 arms) + offline witness | — |
| 22 living director | RP, CL | M1 spike | M1–M3 with UI, if M1 passed |

Each plan's own file holds the floors; this table is the index. A plan is done only when its rows are green (00-overview
§Gate taxonomy).

#### Final suite (after every plan is built; like v2.6 10 phase F)

1. **Freeze** the candidate: every plan's overall gates green (`npm run gates` with Storybook, main checkout), every
   "own" measurement recorded.
2. **Fresh imports**: `adolion-fresh seed` on every lane; toy stories re-seeded; run header captured per lane.
3. **Run, cheapest first** (an early failure costs little):
   1. D: the mocked scenario corpus, the no-reply journey checks, every plan's live D rows;
   2. CL: v2.8 01 O7, O10, O11, O13b, O14, O15, O16, C3, C4 (CL half), C12, C13-b, C14-b; then each plan's CL suite rows;
   3. LT: v2.8 14 rows (local judge server up from the tray);
   4. LI: v2.8 01 O3–O6; v2.7 17–20 rows (broker; LT and LI never share the GPU in the same batch);
   5. RP: v2.8 01 O1, O4, O9, O12, O13, C4 (RP half), C11-F7, §C V3/V4/V8; then each plan's RP suite rows;
   6. integration: everything-on and shipped-defaults columns on two stories (an act and the Saga), the v2.6 I1–I6 shape
      (mutation storm, cut a backend, reload and reopen);
   7. the judge-off column (every judge use's fallback).
4. **×2** on one lane series, run header diffed around each pass.
5. **A failure is fixed, the candidate re-freezes, and only the affected rows re-run ×2.** The fix commit names them.

#### v2.7 rows carried in (2026-10-14)

v2.7 wrapped without Phase C (`v2.7/39-test-from-zero.md` §Wrap record 2026-10-14). Its open rows join this final
suite. Row source: `test/phase-c/manifest.json` (204 rows; 155 without an evidence pair). By tier:

- D: 40 single-tier rows without an evidence pair, including C0, C1, C1b and C3; the 7 PC-* payload contracts; C2;
  29-D1/D2; 30-D1..D3; 31-G3; 36-P-live; spoiler sweeps; 35-ENC/35-DROP; 37-B3; Z-docs; Z-attestation.
- D, never-run no-model scenarios: `v27-32-images-clean-host`, `v27-36-quests`, `v27-37-character-life`.
- CL: 26 single-tier, plus mixed (CL+RP 7, RP+CL 10, D+CL 2).
- RP: 24 single-tier, plus 21 D+RP.
- LI: 14 single-tier, plus mixed (LI+CL 5, LI+RP 4, LI+LT+CL 1); LT 1.
- Manifest evidence lag (owed, manifest not edited): B1-PFX FAIL ×2, B1-NARR run 1, 37-L6-C local ×2 are not written
  in; 36-Q1-M1 is retired, not passed.
- Floors stay informational (owner 2026-10-09); a miss is recorded, never retuned.

#### Sessions

Charter cards in `test/sessions/charters.json` (validated; `v2.6/14-cards.md`-style index regenerated), played with
`so-session` on adolion-fresh lanes, headed, fail-closed (start refuses on any discrepancy; stop marks INVALID on a
missing artifact). A session counts only when VALID.

| Card | Who plays | Question | Completion |
|---|---|---|---|
| **Over-steer** (v2.8 01 §G) | Claude | does the warden on `auto` with `agencyCheck` over-steer when the player declares outcomes or goes silent? ≥ 40 turns | VALID; digest counts agency notes raised/accepted/applied per 100 turns, every flagged reply, replies narrating the player, declarations counted as outcomes, each quoted (private); every applied note rated helpful/invisible/OOC/over-corrected by a second-model rater (unrated note = incomplete); T0–T7 journal count attached (v2.8 01 §G, v2.9 04) |
| Over-steer (same shape) | the user | same, the user's own play | the user's choice; scored against the same v2.9 04 floors, separately |
| Persona start (v2.8 03) | Claude | does the identity step lock the persona and does the opener use it? | VALID; lock + opener name in the digest |
| Panels (v2.8 04) | Claude | Journal, stat sheet, suggestions and public rolls in player mode | VALID; `assert-player-clean` at every stop |
| Living cards + talking sprites (v2.7 19/20) | Claude | overlay changes and look sprites over a long run | VALID, `--media on --allow-comfy` |
| Quests (v2.8 18), open stretches (v2.8 19), character life (v2.8 20), director (v2.8 22) | Claude | each feature's charter, on its pilot act | VALID; rubric scored with evidence |
| Free play on the frozen build | Claude | anything that feels wrong | VALID, 1 h |

Findings follow v2.6 14 rule 3 (severity, class), are fixed in place, and get a replay fixture where deterministic.
Session evidence goes to the private `so-sessions` repo (`npm run sessions:archive`); the public repo gets summaries.

#### Blind rating packs

- Built from recorded arms only, shuffled and unlabelled (`rating-pack`, `--arm`/`--gate`), pairing only VALID sessions.
- **Rater: a second model** (Astra, delegated as in v2.6, or another model named in the pack's `status.json`), **never the
  user for Adolion excerpts**. The user may spot-check synthetic rows.
- A pack reads **recorded, not rated** until rated; its floor is never green before.
- Packs: R4 (16 more pairs), Q-M5 with P3 (19 more), inner voice C3 (29 more), W6 (9 more), the thinking A/B candidate
  (20 turns), v2.8 10 draft usefulness, any v2.8 plan's preference leg.

#### Cost and budget

- Every RP block is estimated and written to `test/sessions/BUDGET.md` **before** it runs; DeepSeek and TypeSafe spend is
  written by `so-session stop` / `budget`.
- Known costs: one thinking A/B ≈ 2–3 pod-hours (the v2.6 one took 2.36 h, about USD 1.70); an RTX PRO 4500 pod is about
  USD 0.72/h (`.claude/rules/gotchas.md`). Other RP blocks are estimated in their plans.
- **RunPod budget for v2.8: EUR 20 cap**, as v2.6 (user, 2026-10-03, as recommended). Before any block that would
  exceed it, stop and ask the user; never trim a ×2 to fit.
- LT and LI are local (GPU time only; one at a time on the GPU via the broker).

#### Freeze and attestation

1. Final suite green ×2 (or each red row stated with its reason and the user's decision).
2. Every session card VALID and scored with evidence; every pack rated or listed as recorded, not rated.
3. `npm run build` (prod), `npm run test:release` green; `so-run-header` names the served bundle (`bundle.served.sha256`
   matches the build).
4. Attestation `docs/release/2.8.0/attestation.json`: candidate commit, bundle hash, each row with its record path;
   records archived under `test/journeys/records/v2.8/` (journeys), `test/measurements/v2.8/` (measurements); citations
   checked by `scripts/release/attestation.test.mjs`.
5. **Verdict:** ACCEPTED only with every critical row green ×2, every plan's acceptance rows green, every session VALID
   and scored, every broken finding fixed and re-run; otherwise PARTIAL with the reasons. Anything deferred goes to v2.9
   with a reopen trigger (v2.9 rule 2).

#### Review 2026-10-03

New file. Applied: F15 (tiers), Sol split item 2 (v2.7's owed rows run here through v2.8 01 §A), C9 refined (the
over-steer card with its completion contract), B4 (second-model raters for Adolion), D10/F17 (the frozen v2.6
measurements' packs listed).

Round 3 (Sol): R3-01, R3-02, R3-08, R3-09, R3-10, R3-15, R3-20 applied (both decided by the user 2026-10-03, as recommended).
